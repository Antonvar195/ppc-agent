/**
 * bridge/creative.js — производство креативов и их размещение.
 *
 * Две операции, разнесённые по разные стороны от вашего апрува.
 *
 * makeVariants — производство. Берёт исходник победившего объявления,
 * делает из него вариации и кладёт их в карточку картинками. В кабинет
 * не пишет ничего. Идёт ДО апрува, потому что согласовать креатив,
 * которого ещё никто не видел, невозможно.
 *
 * addAd — размещение. Загружает в кабинет то, что осталось в карточке,
 * и создаёт объявления. Идёт ПОСЛЕ апрува. Всегда PAUSED.
 *
 * ─────────────────────────────────────────────────────────────────
 * Почему вариация — это набор, а не картинка
 *
 * Победители в аккаунте — адаптивные креативы: внутри лежит квадрат для
 * ленты и вертикаль для сторис, связанные правилами показа. Сделать
 * вариацию одной картинки из набора — значит развалить адаптивность.
 * Поэтому рецепт применяется ко ВСЕМ картинкам исходника разом, и на
 * выходе получается полноценный комплект с теми же ярлыками.
 *
 * Почему тексты не переписываются
 *
 * Мы клонируем asset_feed_spec исходного объявления и подменяем только
 * хеши картинок. Тексты, заголовки, ссылки, UTM и правила показа
 * переезжают как есть. Это держит оффер сцепленным с креативом — было
 * прямым требованием, — и заодно означает, что ни одна модель не пишет
 * украинские тексты в объявления.
 *
 * Апрув устроен вычитанием
 *
 * Размещается то, что осталось в карточке. Не понравился вариант —
 * удалите вложение. Это понятнее галочки напротив имени файла и не
 * требует платных полей Asana.
 */

require('dotenv').config();
const https = require('https');
const FormData = require('form-data');
const axios = require('axios');
const { apiGet, apiPost } = require('../tools/meta_api');
const sharp = require('sharp');
const { createAdWithAssets } = require('../tools/creative_builder');
const A = require('./asana');

const ACCOUNT = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = process.env.META_PAGE_ID || '107996248132865';
const PREFIX = 'variant_';

const download = (url) => new Promise((ok, bad) => {
  https.get(url, res => {
    if (res.statusCode >= 300 && res.headers.location) return download(res.headers.location).then(ok, bad);
    if (res.statusCode !== 200) return bad(new Error(`скачивание вернуло ${res.statusCode}`));
    const chunks = [];
    res.on('data', c => chunks.push(c));
    res.on('end', () => ok(Buffer.concat(chunks)));
  }).on('error', bad);
});

const PALETTE = require('./ops.json').brand_palette;
const hex2rgb = (h) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });

/**
 * Перекрасить фон в другой цвет фирменной палитры.
 *
 * Готовые пресеты цветокоррекции (тонировка, сдвиг оттенка) для этого бренда
 * не годятся — проверено 05.08.2026: они снесли фирменный оранжевый начисто,
 * баннер стал сиреневым. Палитра у Apollo закреплена, поэтому вариация может
 * менять фон только на другой цвет ИЗ НЕЁ.
 *
 * Меняем пиксели, близкие к доминанте, сохраняя их отклонение от неё: тени,
 * градиенты и края букв остаются на месте. Белый текст, логотип и карта
 * не трогаются — они от доминанты далеко.
 */
async function repaint(buffer, targetHex, tolerance = 90) {
  const img = sharp(buffer);
  const { dominant } = await img.stats();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const t = hex2rgb(targetHex);
  const ch = info.channels;

  for (let i = 0; i < data.length; i += ch) {
    const dr = data[i] - dominant.r, dg = data[i + 1] - dominant.g, db = data[i + 2] - dominant.b;
    if (Math.sqrt(dr * dr + dg * dg + db * db) > tolerance) continue;
    data[i]     = Math.max(0, Math.min(255, t.r + dr));
    data[i + 1] = Math.max(0, Math.min(255, t.g + dg));
    data[i + 2] = Math.max(0, Math.min(255, t.b + db));
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: ch } })
    .jpeg({ quality: 92 }).toBuffer();
}

/** Исходник объявления: спецификация, картинки с ярлыками и ссылками. */
async function source(adId) {
  const ad = await apiGet(`/${adId}`, { fields: 'name,adset_id,creative{asset_feed_spec,object_story_spec,url_tags}' });
  const cr = ad.creative || {};
  const afs = cr.asset_feed_spec;
  if (!afs) throw new Error('у объявления нет asset_feed_spec — исходник не разобрать');
  if (afs.videos?.length && !afs.images?.length) {
    throw new Error('исходник видеоформатный: вариации видео мост не делает, это съёмка или анимация');
  }
  if (!afs.images?.length) throw new Error('в исходнике нет картинок');

  const hashes = afs.images.map(i => i.hash);
  const res = await apiGet(`/${ACCOUNT}/adimages`, {
    hashes: JSON.stringify(hashes), fields: 'hash,url,width,height'
  });
  const byHash = new Map((res.data || []).map(x => [x.hash, x]));

  const images = afs.images.map(i => ({
    hash: i.hash,
    label: i.adlabels?.[0]?.name || i.hash.slice(0, 8),
    url: byHash.get(i.hash)?.url || null,
    width: byHash.get(i.hash)?.width, height: byHash.get(i.hash)?.height
  }));
  const missing = images.filter(i => !i.url);
  if (missing.length) throw new Error(`не нашёл в кабинете картинки: ${missing.map(m => m.hash.slice(0, 8)).join(', ')}`);

  return { adId, name: ad.name, adsetId: ad.adset_id, assetFeedSpec: afs,
           urlTags: cr.url_tags || '', images };
}

/**
 * Производство вариаций.
 * Кладёт картинки в карточку и ничего не меняет в кабинете.
 */
async function makeVariants({ id, params }, ctx) {
  const { count = 3, recipe = 'colors', instruction = null } = params;
  const src = await source(id);

  let recipes;
  if (recipe === 'palette') {
    // Цвет исходника исключаем: перекрасить оранжевый в оранжевый — не вариация.
    const src0 = await download(src.images[0].url);
    const { dominant } = await sharp(src0).stats();
    const near = (hex) => {
      const c = hex2rgb(hex);
      return Math.hypot(c.r - dominant.r, c.g - dominant.g, c.b - dominant.b) < 60;
    };
    recipes = Object.entries(PALETTE)
      .filter(([k, v]) => typeof v === 'string' && v.startsWith('#') && k !== 'white' && !near(v))
      .slice(0, count)
      .map(([k, v]) => ({ label: k, how: `фон → фирменный ${k} (${v})`, kind: 'palette', hex: v }));
    if (!recipes.length) throw new Error('в палитре не осталось цвета, отличного от исходного');
  } else {
    if (!instruction) throw new Error('recipe=instructed требует поля instruction — что именно менять');
    recipes = Array.from({ length: count }, (_, i) =>
      ({ label: `flux_${i + 1}`, how: instruction, kind: 'instructed' }));
  }

  // Сухой прогон не производит: у instructed каждая картинка стоит денег,
  // а смысл проверки — убедиться, что исходник разбирается и рецепт понятен.
  if (ctx.dryRun) {
    return {
      produced: 0, variants: recipes.map(r => r.label), from: src.name, warn: null,
      summary: `проверка: сделал бы ${recipes.length} вариаци(й) × ${src.images.length} ` +
               `плейсмент(ов) из «${src.name}» рецептом «${recipe}»`
    };
  }

  const made = [];
  for (const r of recipes) {
    for (const img of src.images) {
      const original = await download(img.url);
      let out;
      if (r.kind === 'palette') {
        out = await repaint(original, r.hex);
      } else {
        const { generateVariation } = require('../tools/creative_generator');
        const ratio = img.height > img.width ? '9:16' : '1:1';
        out = await generateVariation(original, instruction, { aspectRatio: ratio });
      }
      const filename = `${PREFIX}${r.label}__${img.label}.jpg`;
      if (!ctx.dryRun) await A.attach(ctx.taskGid, filename, out, 'image/jpeg');
      made.push({ variant: r.label, placement: img.label, filename, bytes: out.length, how: r.how });
    }
  }

  return {
    produced: made.length,
    variants: [...new Set(made.map(m => m.variant))],
    from: src.name,
    warn: recipe === 'instructed'
      ? 'Правка по инструкции может испортить текст на картинке — просмотри глазами'
      : null,
    summary: `${new Set(made.map(m => m.variant)).size} вариаций × ${src.images.length} плейсмент(ов) из «${src.name}»`
  };
}

/** Картинку в кабинет → хеш. */
async function uploadImage(buffer, filename) {
  const form = new FormData();
  form.append('filename', buffer, { filename, contentType: 'image/jpeg' });
  const url = `https://graph.facebook.com/v21.0/${ACCOUNT}/adimages?access_token=${process.env.META_ACCESS_TOKEN}`;
  const res = await axios.post(url, form, { headers: form.getHeaders(), maxBodyLength: Infinity });
  const images = res.data?.images || {};
  const first = Object.values(images)[0];
  if (!first?.hash) throw new Error('кабинет не вернул хеш загруженной картинки');
  return first.hash;
}

/**
 * Размещение: из оставшихся в карточке вариаций — объявления в группе.
 * Всё создаётся на паузе.
 */
async function addAd({ id, params }, ctx) {
  const { from_ad, name_prefix = null } = params;
  if (!from_ad) throw new Error('add_ad без from_ad: неизвестно, чью спецификацию клонировать');

  const src = await source(from_ad);
  const files = (await A.attachments(ctx.taskGid) || [])
    .filter(a => (a.name || '').startsWith(PREFIX) && a.download_url);

  if (!files.length) {
    throw new Error('в карточке не осталось ни одной вариации — размещать нечего');
  }

  // Группируем по вариации: имя файла — variant_<вариация>__<плейсмент>.jpg
  const groups = new Map();
  for (const f of files) {
    const m = f.name.slice(PREFIX.length).replace(/\.jpg$/i, '').split('__');
    const [variant, placement] = [m[0], m.slice(1).join('__')];
    if (!groups.has(variant)) groups.set(variant, []);
    groups.get(variant).push({ ...f, variant, placement });
  }

  // Комплект должен быть полным: половина адаптивного набора — сломанный
  // креатив, который в сторис покажет квадрат с обрезанным текстом.
  const expected = src.images.length;
  const incomplete = [...groups.entries()].filter(([, v]) => v.length !== expected);
  for (const [name] of incomplete) groups.delete(name);

  if (!groups.size) {
    throw new Error(`ни одного полного комплекта: в каждом ожидается ${expected} плейсмент(ов), ` +
                    `осталось ${[...new Set(files.map(f => f.name))].length} файл(ов)`);
  }

  const created = [];
  for (const [variant, items] of groups) {
    const hashByPlacement = {};
    for (const it of items) {
      const buf = await download(it.download_url);
      hashByPlacement[it.placement] = ctx.dryRun ? 'dry-run' : await uploadImage(buf, it.name);
    }

    // Клонируем спецификацию исходника, меняя только хеши
    const spec = JSON.parse(JSON.stringify(src.assetFeedSpec));
    spec.images = spec.images.map(img => {
      const label = img.adlabels?.[0]?.name || img.hash.slice(0, 8);
      const fresh = hashByPlacement[label];
      return fresh ? { ...img, hash: fresh } : img;
    });

    const adName = `${name_prefix || src.name}_${variant}`;
    if (ctx.dryRun) { created.push({ ad: adName, id: null, dry: true }); continue; }

    const adId = await createAdWithAssets(id, adName, spec, PAGE_ID, src.urlTags);
    created.push({ ad: adName, id: adId });
  }

  return {
    created: created.length,
    ads: created.map(c => c.ad),
    skipped: incomplete.map(([n]) => n),
    summary: `${created.length} объявлени(й) в группе, все на паузе` +
             (incomplete.length ? `; неполные комплекты пропущены: ${incomplete.map(([n]) => n).join(', ')}` : '')
  };
}

module.exports = { makeVariants, addAd, source, uploadImage, repaint, PREFIX };
