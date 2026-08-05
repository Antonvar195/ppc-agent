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

const BRAND = require('./brand.json');
const hex2rgb = (h) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });

/** Относительная яркость по WCAG. */
function luminance({ r, g, b }) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Контраст цвета с белым текстом. */
const contrastWithWhite = (hex) => 1.05 / (luminance(hex2rgb(hex)) + 0.05);

/**
 * Цвета элементов, лежащих НА перекрашиваемом фоне.
 *
 * Нужны, потому что фон — не единственное, что на нём есть. На баннере 399
 * плашка оранжевая, а цена внутри неё — синяя: два фирменных цвета играют
 * друг против друга. Перекрасить плашку в синий значит стереть цену,
 * и проверка «фон против белого текста» этого не увидит.
 *
 * Элементом считаем пиксель, который фоном не является, лежит внутри рамки
 * фона и окружён фоном со всех четырёх сторон. Радиус берём от размера самой
 * плашки, а не фиксированный: цифры «399» толщиной в сотню пикселей под
 * радиус в полтора десятка не подходят, и первая версия проверки их не нашла.
 * Рамка отсекает фотографию, которая к плашке только примыкает.
 */
function elementsOnBackground(data, info, from, tolerance) {
  const { width: W, height: H, channels: ch } = info;
  const isBg = new Uint8Array(W * H);
  for (let i = 0, px = 0; i < data.length; i += ch, px++) {
    const dr = data[i] - from.r, dg = data[i + 1] - from.g, db = data[i + 2] - from.b;
    isBg[px] = Math.sqrt(dr * dr + dg * dg + db * db) <= tolerance ? 1 : 0;
  }

  // Рамка фона: за её пределами искать элементы на нём бессмысленно.
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!isBg[y * W + x]) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return [];
  const radius = Math.max(20, Math.round(Math.min(x1 - x0, y1 - y0) * 0.5));

  // Расстояние до ближайшего фонового пикселя по четырём направлениям.
  const big = 1e6;
  const L = new Int32Array(W * H), R = new Int32Array(W * H),
        U = new Int32Array(W * H), D = new Int32Array(W * H);
  for (let y = 0; y < H; y++) {
    let d = big;
    for (let x = 0; x < W; x++) { const p = y * W + x; d = isBg[p] ? 0 : d + 1; L[p] = d; }
    d = big;
    for (let x = W - 1; x >= 0; x--) { const p = y * W + x; d = isBg[p] ? 0 : d + 1; R[p] = d; }
  }
  for (let x = 0; x < W; x++) {
    let d = big;
    for (let y = 0; y < H; y++) { const p = y * W + x; d = isBg[p] ? 0 : d + 1; U[p] = d; }
    d = big;
    for (let y = H - 1; y >= 0; y--) { const p = y * W + x; d = isBg[p] ? 0 : d + 1; D[p] = d; }
  }

  const bins = new Map();
  for (let px = 0; px < W * H; px++) {
    if (isBg[px]) continue;
    const x = px % W, y = (px / W) | 0;
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    if (L[px] > radius || R[px] > radius || U[px] > radius || D[px] > radius) continue;
    const i = px * ch;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const b = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    b.n++; b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2];
    bins.set(key, b);
  }

  const floor = Math.max(200, Math.round(W * H * 0.0004));   // мелкий шум по краям букв отбрасываем
  return [...bins.values()].filter(b => b.n >= floor)
    .map(b => ({ n: b.n, r: Math.round(b.r / b.n), g: Math.round(b.g / b.n), b: Math.round(b.b / b.n) }))
    .sort((a, z) => z.n - a.n).slice(0, 8);
}

const contrast = (c1, c2) => {
  const a = luminance(c1), b = luminance(c2);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

/**
 * Фоны, доступные для вариации данного исходника.
 *
 * Перекраска трогает только фон — текст, логотип и вёрстка остаются как были.
 * Значит новый фон обязан держать белый текст: светлый песочный #F5F5F0 или
 * янтарь #FFB300 из системы формально брендовые, но белые буквы на них
 * исчезают. Порог 3:1 — норма для крупного текста, а на баннере он крупный.
 *
 * Из списка выпадает и цвет самого исходника: перекрасить оранжевый
 * в оранжевый — не вариация.
 */
function backgroundsFor(from, elements = [], { minContrast = 3.0, minElement = 2.5 } = {}) {
  const out = [];
  for (const token of BRAND.creative_backgrounds.allowed) {
    const hex = BRAND.colors[token];
    if (!hex) continue;
    const rgb = hex2rgb(hex);

    if (Math.hypot(rgb.r - from.r, rgb.g - from.g, rgb.b - from.b) < 60) {
      out.push({ token, hex, rejected: 'это цвет исходника' }); continue;
    }
    const white = contrastWithWhite(hex);
    if (white < minContrast) {
      out.push({ token, hex, rejected: `белый текст даст контраст ${white.toFixed(1)}:1` }); continue;
    }
    // Элементы на фоне не перекрашиваются — значит новый фон обязан их держать.
    const worst = elements.map(e => ({ e, c: contrast(rgb, e) })).sort((a, b) => a.c - b.c)[0];
    if (worst && worst.c < minElement) {
      out.push({ token, hex,
        rejected: `элемент rgb(${worst.e.r},${worst.e.g},${worst.e.b}) на нём пропадёт — контраст ${worst.c.toFixed(1)}:1` });
      continue;
    }
    out.push({ token, hex, contrast: white, worstElement: worst ? +worst.c.toFixed(2) : null });
  }
  return out;
}

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
async function repaint(buffer, targetHex, fromRgb, tolerance = 90, minShare = 0.01) {
  const img = sharp(buffer);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const t = hex2rgb(targetHex);
  const { width: W, height: H, channels: ch } = info;
  const total = W * H;

  const mask = new Uint8Array(total);
  for (let i = 0, px = 0; i < data.length; i += ch, px++) {
    const dr = data[i] - fromRgb.r, dg = data[i + 1] - fromRgb.g, db = data[i + 2] - fromRgb.b;
    mask[px] = dr * dr + dg * dg + db * db <= tolerance * tolerance ? 1 : 0;
  }

  // Перекрашиваем плашку, а не все пиксели её цвета.
  //
  // Фирменный оранжевый встречается и в кадре: наклейки на тренажёрах,
  // лопасти вентиляторов. Если красить всё подряд, по баннеру рассыпаются
  // синие пятна. Поэтому берём крупные связные области.
  //
  // Но одного размера мало: внутренности букв — «О», «9», «Є» — это тоже
  // отдельные мелкие области того же цвета, и по размеру они отсеиваются
  // вместе с наклейками. Тогда на перекрашенной плашке остаются оранжевые
  // дырки в буквах. Поэтому мелкие области берём тогда, когда они лежат
  // внутри крупной: внутри плашки это дырки букв, снаружи — кадр.
  const stack = new Int32Array(total);
  const seen = new Uint8Array(total);
  const floor = Math.round(total * minShare);
  const big = [], small = [];

  for (let start = 0; start < total; start++) {
    if (!mask[start] || seen[start]) continue;
    let sp = 0;
    const members = [];
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    stack[sp++] = start; seen[start] = 1;
    while (sp) {
      const p = stack[--sp];
      members.push(p);
      const x = p % W, y = (p / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0     && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < W - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0     && mask[p - W] && !seen[p - W]) { seen[p - W] = 1; stack[sp++] = p - W; }
      if (y < H - 1 && mask[p + W] && !seen[p + W]) { seen[p + W] = 1; stack[sp++] = p + W; }
    }
    (members.length >= floor ? big : small).push({ members, x0, y0, x1, y1 });
  }

  const keep = new Uint8Array(total);
  for (const c of big) for (const p of c.members) keep[p] = 1;
  for (const c of small) {
    const inside = big.some(b => c.x0 >= b.x0 && c.x1 <= b.x1 && c.y0 >= b.y0 && c.y1 <= b.y1);
    if (inside) for (const p of c.members) keep[p] = 1;
  }

  for (let px = 0; px < total; px++) {
    if (!keep[px]) continue;
    const i = px * ch;
    const dr = data[i] - fromRgb.r, dg = data[i + 1] - fromRgb.g, db = data[i + 2] - fromRgb.b;
    data[i]     = Math.max(0, Math.min(255, t.r + dr));
    data[i + 1] = Math.max(0, Math.min(255, t.g + dg));
    data[i + 2] = Math.max(0, Math.min(255, t.b + db));
  }
  return sharp(data, { raw: { width: W, height: H, channels: ch } }).jpeg({ quality: 92 }).toBuffer();
}

/**
 * Фирменная плашка на изображении: какой цвет системы на нём лежит
 * и какую долю занимает.
 *
 * Привязываться к доминанте изображения нельзя — это уже стоило испорченной
 * сторис. У квадрата доминанта оказалась оранжевой плашкой, а у вертикали
 * того же объявления — серым фоном спортзала, и перекраска ушла в фотографию:
 * тренажёры стали синими. Ищем именно фирменный цвет, где бы он ни лежал,
 * и трогаем только его.
 *
 * Искать можно не любой цвет системы, а только яркий и насыщенный. Тёмные
 * и нейтральные тона — «космический чёрный», песочный, белый — на фотографии
 * зала присутствуют тысячами пикселей, и поиск по ним снова уводит в кадр.
 * Плашка же всегда плашка: заливка в полную силу цвета.
 */
const isPlaqueColor = ({ r, g, b }) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx / 255 >= 0.5 && (mx ? (mx - mn) / mx : 0) >= 0.4;
};

async function brandRegion(buffer, tolerance = 90, minShare = 0.03) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const total = info.width * info.height;

  let best = null;
  for (const [token, hex] of Object.entries(BRAND.colors)) {
    if (typeof hex !== 'string' || !hex.startsWith('#')) continue;
    if (!isPlaqueColor(hex2rgb(hex))) continue;
    const c = hex2rgb(hex);
    let n = 0;
    for (let i = 0; i < data.length; i += ch) {
      const dr = data[i] - c.r, dg = data[i + 1] - c.g, db = data[i + 2] - c.b;
      if (dr * dr + dg * dg + db * db <= tolerance * tolerance) n++;
    }
    const share = n / total;
    if (share >= minShare && (!best || share > best.share)) best = { token, hex, rgb: c, share };
  }
  return best;
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
  let rejected = [];
  let region = null;
  if (recipe === 'palette') {
    // Плашку ищем один раз и требуем её во ВСЕХ плейсментах: комплект,
    // где квадрат перекрашен, а вертикаль нет, — это не вариация, а брак.
    const buffers = [];
    for (const img of src.images) buffers.push(await download(img.url));

    region = await brandRegion(buffers[0]);
    if (!region) {
      throw new Error('на баннере нет области фирменного цвета — перекрашивать нечего; ' +
                      'такой креатив меняют вёрсткой или съёмкой, не цветом');
    }
    for (const [i, b] of buffers.entries()) {
      const r = await brandRegion(b);
      if (!r || r.token !== region.token) {
        throw new Error(`плейсмент ${src.images[i].label}: фирменного цвета ${region.token} на нём нет ` +
                        `(нашлось: ${r ? r.token : 'ничего'}) — комплект получится разнобойным`);
      }
    }

    const { data, info } = await sharp(buffers[0]).raw().toBuffer({ resolveWithObject: true });
    const elements = elementsOnBackground(data, info, region.rgb, 90);

    const checked = backgroundsFor(region.rgb, elements);
    const usable = checked.filter(c => !c.rejected);
    rejected = checked.filter(c => c.rejected);
    if (!usable.length) {
      throw new Error('ни один фон дизайн-системы не подходит этому баннеру: ' +
        rejected.map(r => `${r.token} — ${r.rejected}`).join('; '));
    }
    recipes = usable.slice(0, count).map(c => ({
      label: c.token, kind: 'palette', hex: c.hex,
      how: `фон → ${c.token} ${c.hex} из дизайн-системы (контраст с белым ${c.contrast.toFixed(1)}:1)`
    }));
  } else {
    if (!instruction) throw new Error('recipe=instructed требует поля instruction — что именно менять');
    recipes = Array.from({ length: count }, (_, i) =>
      ({ label: `flux_${i + 1}`, how: instruction, kind: 'instructed' }));
  }

  // Что не подошло — говорим вслух: молча вернуть две картинки вместо трёх
  // значит оставить человека гадать, почему их две.
  const rejectedNote = rejected.length
    ? rejected.map(r => `${r.token} — ${r.rejected}`).join('; ') : null;

  // Сухой прогон не производит: у instructed каждая картинка стоит денег,
  // а смысл проверки — убедиться, что исходник разбирается и рецепт понятен.
  if (ctx.dryRun) {
    return {
      produced: 0, variants: recipes.map(r => r.label), from: src.name, warn: null,
      rejected: rejectedNote,
      summary: `проверка: сделал бы ${recipes.length} вариаци(й) × ${src.images.length} ` +
               `плейсмент(ов) из «${src.name}» рецептом «${recipe}»` +
               (region ? `; перекрашиваю ${region.token} (${(region.share * 100).toFixed(0)}% кадра)` : '')
    };
  }

  const made = [];
  for (const r of recipes) {
    for (const img of src.images) {
      const original = await download(img.url);
      let out;
      if (r.kind === 'palette') {
        out = await repaint(original, r.hex, region.rgb);
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
    palette: BRAND.source.synced,
    rejected: rejectedNote,
    warn: recipe === 'instructed'
      ? 'Правка по инструкции может испортить текст на картинке — просмотри глазами'
      : null,
    summary: `${new Set(made.map(m => m.variant)).size} вариаций × ${src.images.length} плейсмент(ов) из «${src.name}»` +
             (region ? `; перекрашен ${region.token}` : '')
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

module.exports = { makeVariants, addAd, source, uploadImage, repaint, brandRegion, PREFIX };
