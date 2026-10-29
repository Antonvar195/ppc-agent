// Пошук тренерів у новий клуб 043 (Одеса, вул. Академіка Корольова, 43-Є,
// відкриття 03.12.26) — окрема група в живій кампанії A_Coach_1603.
//
// ГЕО — МІСТО ОДЕСА, не коло навколо клубу. Підстава — факт:
//   coach_kyiv (область)   $3387 → 83 ліди → CPL $40.81
//   coach_odessa (місто)   $2716 → 34 ліди → CPL $79.88
//   coach_144_local (3 км)  $656 →  1 лід  → CPL $656.32   ← вузьке гео провалилось
//   coach_027_local (мале місто) $69 → 0 лідів
// Тренер обирає роботодавця й поїде через місто; покупець абонемента — ні.
// Тому для продажів коло 3 км правильне, а для найму — ні.
//
// Таргетинг, текст і конверсія читаються з живої coach_odessa.
// Креативи клубні: «Шукаємо тренерів у APOLLO NEXT 043».
//
// Група PAUSED. Usage: node tools/add_coach_043.js plan | build
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const G = require('./meta_guard');
const { apiGet, apiPost } = require('./meta_api');
const { refreshDropboxToken, dropboxRequest } = require('./dropbox_reader');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const IG_ID = process.env.META_INSTAGRAM_ACTOR_ID || '17841447539432480';

const CAMPAIGN_ID = '120241053870420193';     // A_Coach_1603
const SRC_ADSET  = '120241053870730193';      // coach_odessa — підставимо динамічно, якщо інший
const ADSET_NAME = 'coach_043_odessa';
const DAILY_BUDGET = 1500;                    // $15/д — як було в coach_144_local
const TITLE = 'Шукаємо тренерів у APOLLO NEXT 043';
const DROPBOX = 'https://www.dropbox.com/scl/fo/i93oot7ac3prpn5gbxa84/AIT_BVXSLsd7KPK8VqnKzn4?rlkey=nhtgoukb87hxdmt853fdporrf&e=1&dl=0';
const MANIFEST = path.join(__dirname, '../history/coach043_manifest.json');

const CONCEPTS = [
  { n: 1, sq: 's01.jpg', st: 'stories01.jpg', desc: 'тренер у кепці' },
  { n: 2, sq: 's02.jpg', st: 'stories02.jpg', desc: 'другий концепт' },
  { n: 3, sq: 's03.jpg', st: 'stories03.jpg', desc: 'команда втрьох' },
];
const adName = c => `2810_${c.n}`;

const BODY = `Новий клуб APOLLO NEXT 043 в Одесі шукає тренерів 💪

Вул. Академіка Корольова, 43-Є, Таїрова. Відкриття 3 грудня.

В APOLLO NEXT ти сам керуєш своїм доходом!
Проста і зрозуміла модель: купуй підписку тренера та встановлюй власну ціну на свої послуги.

Що ми пропонуємо:
🔹 Новий сучасний простір із топовим обладнанням
🔹 Стабільний потік потенційних клієнтів
🔹 Можливість проводити індивідуальні та групові заняття
🔹 Робота на власних умовах і власний прайс

Від тебе: ти та бажання розвивати культуру спорту.`;

const RULES = [
  { customization_spec: { publisher_platforms: ['instagram'], instagram_positions: ['story', 'reels'] }, image_label: { name: 'st_img' }, priority: 1 },
  { customization_spec: {}, image_label: { name: 'sq_img' }, priority: 2 },
];

async function source() {
  const s = (await apiGet(`${CAMPAIGN_ID}/adsets`, { fields: 'id,name,targeting,optimization_goal,billing_event,bid_strategy,promoted_object,daily_budget', limit: '30' })).data || [];
  const a = s.find(x => x.name === 'coach_odessa');
  if (!a) throw new Error('не знайшов coach_odessa');
  const ads = (await apiGet(`${a.id}/ads`, { fields: 'creative{asset_feed_spec,url_tags}', limit: '3' })).data || [];
  const f = ads[0].creative.asset_feed_spec;
  return { adset: a, link: f.link_urls[0].website_url, cta: f.call_to_action_types[0], urlTags: ads[0].creative.url_tags };
}

async function plan() {
  const s = await source();
  const t = s.adset.targeting;
  console.log(`\nA_Coach_1603 — нова група під клуб 043\n`);
  console.log(`📂 ${ADSET_NAME} — $${DAILY_BUDGET / 100}/д  [PAUSED]`);
  console.log(`   гео: ${t.geo_locations.cities[0].name} (МІСТО, не коло — див. коментар угорі)`);
  console.log(`   вік ${t.age_min}-${t.age_max} · конверсія ${s.adset.promoted_object.custom_conversion_id}`);
  console.log(`   форма: ${s.link}`);
  CONCEPTS.forEach(c => console.log(`   • ${adName(c)} — ${c.desc}`));
  console.log(`\n   для порівняння: coach_odessa $${(+s.adset.daily_budget) / 100}/д, CPL $79.88`);
  console.log('\n(plan — нічого не створено)');
}

async function build() {
  const s = await source();
  const man = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  const need = CONCEPTS.flatMap(c => [c.sq, c.st]);
  if (!need.every(f => man[f])) {
    await refreshDropboxToken();
    for (const f of need) {
      if (man[f]) continue;
      const r = await dropboxRequest(t => axios({ method: 'post', url: 'https://content.dropboxapi.com/2/sharing/get_shared_link_file',
        headers: { Authorization: `Bearer ${t}`, 'Dropbox-API-Arg': JSON.stringify({ url: DROPBOX, path: '/' + f }), 'Content-Type': '' },
        data: '', responseType: 'arraybuffer', maxContentLength: 50 * 1024 * 1024 }));
      const up = await apiPost(`${ACCT}/adimages`, { bytes: Buffer.from(r.data).toString('base64'), name: `coach043_${f}` });
      if (up.error) throw new Error(`${f}: ${G.errMsg(up.error)}`);
      man[f] = Object.values(up.images || {})[0].hash;
      fs.writeFileSync(MANIFEST, JSON.stringify(man, null, 2));
      console.log(`  ⬆️ ${f} → ${man[f].slice(0, 12)}…`);
    }
  } else console.log('♻️  банери вже залиті');

  const live = (await apiGet(`${CAMPAIGN_ID}/adsets`, { fields: 'id,name', limit: '30' })).data || [];
  const prior = live.find(x => x.name === ADSET_NAME);
  const adset = prior || await G.createAdSet({
    name: ADSET_NAME, campaign_id: CAMPAIGN_ID,
    optimization_goal: s.adset.optimization_goal, billing_event: s.adset.billing_event,
    bid_strategy: s.adset.bid_strategy || 'LOWEST_COST_WITHOUT_CAP',
    daily_budget: String(DAILY_BUDGET),
    // promoted_object дослівно: pixel_rule звіряється посимвольно (1885014)
    promoted_object: JSON.stringify({
      pixel_id: s.adset.promoted_object.pixel_id,
      custom_event_type: s.adset.promoted_object.custom_event_type,
      pixel_rule: s.adset.promoted_object.pixel_rule,
      custom_conversion_id: s.adset.promoted_object.custom_conversion_id,
    }),
    targeting: JSON.parse(JSON.stringify(s.adset.targeting)),
  }, { allowDefaultAttribution: true });   // коуч-групи історично без явної атрибуції
  console.log(`\n  📂 ${ADSET_NAME} — ${adset.id} | $${DAILY_BUDGET / 100}/д${prior ? ' (наявна)' : ''}`);

  const liveAds = (await apiGet(`${adset.id}/ads`, { fields: 'id,name', limit: '20' })).data || [];
  const made = [];
  for (const c of CONCEPTS) {
    if (liveAds.find(x => x.name === adName(c))) { console.log(`     ⏭  ${adName(c)} вже є`); continue; }
    const cr = await G.createChecked(`${ACCT}/adcreatives`, {
      name: `${adName(c)}_043_creative`,
      object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
      asset_feed_spec: JSON.stringify({
        images: [{ hash: man[c.sq], adlabels: [{ name: 'sq_img' }] }, { hash: man[c.st], adlabels: [{ name: 'st_img' }] }],
        bodies: [{ text: BODY }], titles: [{ text: TITLE }], descriptions: [{ text: '' }],
        link_urls: [{ website_url: s.link, display_url: 'apollo.online' }],
        call_to_action_types: [s.cta],
        ad_formats: ['AUTOMATIC_FORMAT'], optimization_type: 'PLACEMENT',
        asset_customization_rules: RULES,
      }),
      ...(s.urlTags ? { url_tags: s.urlTags } : {}),
    }, `creative ${adName(c)}`);
    const ad = await G.createAd({ name: adName(c), adset_id: adset.id, creative: { creative_id: cr.id } });
    console.log(`     ✅ ${adName(c)} — ${ad.id} (${c.desc})`);
    made.push({ id: ad.id, name: adName(c), creativeId: cr.id, hashes: [man[c.sq], man[c.st]], link: s.link });
  }

  console.log('\n🔍 Звірка:');
  for (const m of made) {
    const v = await G.verifyAd(m.id, { creativeId: m.creativeId, imageHashes: m.hashes, link: m.link });
    const p = await G.checkPreviews(m.id, ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY']);
    console.log(`   ${v.ok && p.ok ? '✅' : '❌'} ${m.name} ${v.status} | ${v.problems.join(';') || 'дані ок'} | ${p.INSTAGRAM_STANDARD}/${p.INSTAGRAM_STORY}`);
  }

  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  hist.push({ date: '2026-10-28', campaign_name: 'A_Coach_1603', campaign_id: CAMPAIGN_ID,
    adsets: [{ name: ADSET_NAME, id: adset.id, budget_usd: DAILY_BUDGET / 100, ads: made.length }],
    note: 'Пошук тренерів у клуб 043 (Одеса). Гео — МІСТО, не коло: coach_144_local на колі 3 км дав CPL $656 проти $80 у coach_odessa на місті. Таргетинг і конверсія з coach_odessa. PAUSED.' });
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));

  console.log(`\n📊 A_Coach_1603 після додавання:`);
  const after = (await apiGet(`${CAMPAIGN_ID}/adsets`, { fields: 'name,status,daily_budget,targeting', limit: '30' })).data || [];
  let tot = 0;
  for (const a of after.sort((x, y) => x.name.localeCompare(y.name))) {
    tot += +a.daily_budget || 0;
    const g = a.targeting.geo_locations || {};
    const geo = g.custom_locations ? `коло ${g.custom_locations[0].radius}км` : g.cities ? g.cities.map(x => x.name).join(',') : g.regions ? 'область' : g.places ? g.places.map(x => x.name).join(',') : '?';
    console.log(`   ${a.name.padEnd(20)} $${String((+a.daily_budget || 0) / 100).padStart(3)}/д  ${a.status.padEnd(7)} ${geo}`);
  }
  console.log(`   ${''.padEnd(20)} ─────`);
  console.log(`   ${'разом'.padEnd(20)} $${tot / 100}/д`);
  console.log('\n✅ Готово — нова група PAUSED.');
}

const cmd = process.argv[2];
(async () => { if (cmd === 'build') await build(); else await plan(); })()
  .catch(e => { console.error('❌', e.message); process.exit(1); });
