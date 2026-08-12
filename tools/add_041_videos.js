// Додає відео в живу кампанію AI_Apollo_sales_ZHY_041_1308 (старт 13.08.2026).
//
// 2 нові групи — local_ZHY_video + advantage_ZHY_video (таргетинг як у діючих
// local_ZHY_* / advantage_ZHY_*), у кожній ті самі 2 адаптивні відео-оголошення:
//   1308_v15 — 15 c: 9:16 у сторіс/рілс, 16:9 у стрічку/right column/instream
//   1308_v12 — 12 c: те саме
// Файли з ~/Downloads. УВАГА: ApolloNext_041_1920_1080_12c_04_open.mp4 названий
// горизонтальним, а насправді 1080x1920 — тут він іде як вертикальний.
//
// Загальний бюджет кампанії лишається $140/день, перерозподіляється на 6 груп:
//   local $80 → 27/27/26, advantage $60 → 20/20/20.
//
// Все нове PAUSED. Usage: node tools/add_041_videos.js plan | upload | build | budget | verify | replace
//
// replace — коли перезняли ролики: перезаливає ті файли, у яких змінився md5,
// збирає нові креативи і переводить на них ті самі 4 оголошення (креатив у Meta
// незмінний, відредагувати asset_feed_spec наявного не можна).
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { apiGet: rawGet, apiPost: rawPost } = require('./meta_api');
const { uploadVideoBufferToMeta } = require('./creative_builder');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const IG_ID = process.env.META_INSTAGRAM_ACTOR_ID || '17841447539432480';
const PIXEL_ID = '393751978682816';

const CAMPAIGN_ID = '120250200716420193'; // AI_Apollo_sales_ZHY_041_1308
const CLUB_URL = 'https://apollo.online/clubs/apollo-next-041-yarmarok/';
const DISPLAY_URL = 'apollo.online';
const START_TIME = '2026-08-13T00:01:00+0300';
const END_TIME = '2026-08-31T23:59:00+0300';
const TITLE = 'APOLLO NEXT 041 вже відкрито';
const CTA = 'APPLY_NOW';
const URL_TAGS = 'utm_source=facebook&utm_medium=conversion&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';
const EXCLUDE_BUYERS = '120208237776480193'; // А покупка 180 дней

const DOWNLOADS = path.join(process.env.HOME, 'Downloads');
const MANIFEST = path.join(__dirname, '../history/041_1308_video_manifest.json');

// Текст — той самий BODY_CLUB, що в діючих оголошеннях кампанії
const BODY = `🔥 APOLLO NEXT 041 у Житомирі вже відкрито!

майдан Згоди, 6 (ТРЦ ЯРМАРОК) — спорт простір, де тіло, розклад і навіть настрій працюють на тебе.

Ви просили — ми продовжили найнижчу ціну відкриття:
299 ₴ замість 999 ₴ за перші 4 тижні. Акція діє з 13.08 до 31.08.2026.

▫️ Понад 48 групових програм
▫️ Smart-запис через застосунок
▫️ Автоматизований вхід — без черг
▫️ Сертифіковані тренери й простір без хейту

Забирай ціну відкриття, поки вона діє.`;

// 2 концепти × 2 формати
const CONCEPTS = [
  { key: 'v15', desc: '15 c — космонавт летить над ЯрмарОК',
    h: 'ApolloNext_041_1920_1080_15c_01_open.mp4',
    v: 'ApolloNext_041_1080_1920_15c_02_open.mp4' },
  { key: 'v12', desc: '12 c — космонавт стоїть біля ТРЦ',
    h: 'ApolloNext_041_1920_1080_12c_03_open.mp4',
    v: 'ApolloNext_041_1920_1080_12c_04_open.mp4' }, // назва бреше: файл 1080x1920
];

const GEO = {
  cities: [{ key: '2401072', country: 'UA', region_id: '3804', distance_unit: 'mile' }],
  location_types: ['home', 'recent']
};
const LOCAL_TARGETING = {
  age_min: 18, age_max: 50,
  geo_locations: GEO,
  excluded_custom_audiences: [{ id: EXCLUDE_BUYERS }],
  targeting_automation: { advantage_audience: 0, individual_setting: { geo: 0 } },
  publisher_platforms: ['facebook', 'instagram', 'threads'],
  facebook_positions: ['feed', 'story', 'facebook_reels', 'right_hand_column', 'instream_video', 'marketplace'],
  instagram_positions: ['stream', 'story', 'reels', 'explore', 'explore_home', 'profile_feed'],
  threads_positions: ['threads_stream'],
  device_platforms: ['mobile', 'desktop'],
};
const ADV_TARGETING = {
  age_min: 18, age_max: 65,
  geo_locations: GEO,
  excluded_custom_audiences: [{ id: EXCLUDE_BUYERS }],
  targeting_automation: { advantage_audience: 1, individual_setting: { geo: 0 } },
};

const NEW_ADSETS = [
  { name: 'local_ZHY_video', budget: 2600, targeting: LOCAL_TARGETING, t: 'Житомир 18-50, детальний off, явні плейсменти' },
  { name: 'advantage_ZHY_video', budget: 2000, targeting: ADV_TARGETING, t: 'Advantage+ 18-65, авто-плейсменти' },
];

// Перерозподіл бюджету діючих груп (сума з новими = 14000 = $140/день)
const REBALANCE = [
  { id: '120250200727620193', name: 'local_ZHY_A', from: 4000, to: 2700 },
  { id: '120250200731070193', name: 'local_ZHY_B', from: 4000, to: 2700 },
  { id: '120250200735470193', name: 'advantage_ZHY_A', from: 3000, to: 2000 },
  { id: '120250200740070193', name: 'advantage_ZHY_B', from: 3000, to: 2000 },
];

// Варіанти правил адаптації: пробуємо від найширшого до перевіреного в бою.
// Порожній customization_spec для ВІДЕО не можна (subcode 2446501), тому
// обидва правила з явним плейсмент-спеком і priority 1/2.
const RULE_VARIANTS = [
  { label: 'fb+ig combined', rules: [
    { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'] }, video_label: { name: 'st_vid' }, priority: 1 },
    { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed', 'right_hand_column', 'instream_video', 'marketplace'], instagram_positions: ['stream', 'explore', 'explore_home', 'profile_feed'] }, video_label: { name: 'h_vid' }, priority: 2 },
  ] },
  { label: 'fb/ig split', rules: [
    { customization_spec: { publisher_platforms: ['facebook'], facebook_positions: ['story', 'facebook_reels'] }, video_label: { name: 'st_vid' }, priority: 1 },
    { customization_spec: { publisher_platforms: ['instagram'], instagram_positions: ['story', 'reels'] }, video_label: { name: 'st_vid' }, priority: 2 },
    { customization_spec: { publisher_platforms: ['facebook'], facebook_positions: ['feed', 'right_hand_column', 'instream_video', 'marketplace'] }, video_label: { name: 'h_vid' }, priority: 3 },
    { customization_spec: { publisher_platforms: ['instagram'], instagram_positions: ['stream', 'explore', 'explore_home', 'profile_feed'] }, video_label: { name: 'h_vid' }, priority: 4 },
  ] },
  { label: 'instagram only (як у 0107)', rules: [
    { customization_spec: { publisher_platforms: ['instagram'], instagram_positions: ['story', 'reels'] }, video_label: { name: 'st_vid' }, priority: 1 },
    { customization_spec: { publisher_platforms: ['instagram'], instagram_positions: ['stream', 'explore', 'explore_home', 'profile_feed'] }, video_label: { name: 'h_vid' }, priority: 2 },
  ] },
];

// ---------- helpers ----------
const CALL_TIMEOUT_MS = 180000;
const CALL_TRIES = 3;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function withTimeout(p, label) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout: ${label}`)), CALL_TIMEOUT_MS))]);
}
async function retry(fn, label) {
  let last;
  for (let i = 1; i <= CALL_TRIES; i++) {
    try { return await withTimeout(fn(), label); }
    catch (e) { last = e; console.log(`   ⏳ ${label} ${i}/${CALL_TRIES}: ${e.message}`); await sleep(3000 * i); }
  }
  throw last;
}
const apiGet = (p, params) => retry(() => rawGet(p, params), `GET ${p}`);
const apiPost = (p, params) => retry(() => rawPost(p, params), `POST ${p}`);
const errMsg = e => (e.error_user_msg || e.message || JSON.stringify(e)) + (e.error_subcode ? ` [subcode ${e.error_subcode}]` : '');

const readManifest = () => (fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {});
const writeManifest = m => fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));

async function waitVideoReady(videoId, label) {
  for (let i = 0; i < 60; i++) {
    const r = await apiGet(videoId, { fields: 'status' });
    const st = r.status && r.status.video_status;
    if (st === 'ready') { console.log(`    ✅ ${label} ready`); return; }
    if (st === 'error') throw new Error(`${label}: помилка обробки на боці Meta`);
    await sleep(5000);
  }
  throw new Error(`${label}: не дочекались ready`);
}

async function getThumbHash(videoId, label) {
  for (let i = 0; i < 20; i++) {
    const r = await apiGet(`${videoId}/thumbnails`, { fields: 'uri,is_preferred' });
    const list = r.data || [];
    const pref = list.find(t => t.is_preferred) || list[0];
    if (pref && pref.uri) {
      const buf = await new Promise((resolve, reject) => {
        https.get(pref.uri, res => { const ch = []; res.on('data', c => ch.push(c)); res.on('end', () => resolve(Buffer.concat(ch))); }).on('error', reject);
      });
      const up = await apiPost(`${ACCT}/adimages`, { bytes: buf.toString('base64'), name: `thumb_${videoId}.jpg` });
      if (up.error) throw new Error('thumb upload: ' + errMsg(up.error));
      return Object.values(up.images || {})[0].hash;
    }
    await sleep(3000);
  }
  throw new Error(`${label}: превʼю не зʼявилось`);
}

function creativeSpec(concept, man, rules) {
  return {
    videos: [
      { video_id: man[concept.v].video_id, thumbnail_hash: man[concept.v].thumb_hash, adlabels: [{ name: 'st_vid' }] },
      { video_id: man[concept.h].video_id, thumbnail_hash: man[concept.h].thumb_hash, adlabels: [{ name: 'h_vid' }] },
    ],
    bodies: [{ text: BODY }],
    titles: [{ text: TITLE }],
    descriptions: [{ text: '' }],
    link_urls: [{ website_url: CLUB_URL, display_url: DISPLAY_URL }],
    call_to_action_types: [CTA],
    ad_formats: ['AUTOMATIC_FORMAT'],
    optimization_type: 'PLACEMENT',
    asset_customization_rules: rules,
  };
}

// ---------- commands ----------
function plan() {
  console.log(`\nКампанія AI_Apollo_sales_ZHY_041_1308 (${CAMPAIGN_ID}) — додаємо 2 групи\n`);
  for (const a of NEW_ADSETS) {
    console.log(`📂 ${a.name} — $${a.budget / 100}/д | ${a.t}  [PAUSED]`);
    CONCEPTS.forEach(c => console.log(`   • 1308_${c.key} (${c.desc})\n       9:16 → story/reels: ${c.v}\n      16:9 → feed/RHC/instream: ${c.h}`));
  }
  console.log('\n💰 Перерозподіл бюджету (разом було і лишається $140/день):');
  REBALANCE.forEach(r => console.log(`   ${r.name.padEnd(20)} $${r.from / 100} → $${r.to / 100}`));
  NEW_ADSETS.forEach(a => console.log(`   ${a.name.padEnd(20)}  —  → $${a.budget / 100}`));
  const total = REBALANCE.reduce((n, r) => n + r.to, 0) + NEW_ADSETS.reduce((n, a) => n + a.budget, 0);
  console.log(`   ${''.padEnd(20)} разом $${total / 100}/день`);
  console.log('\n(plan — нічого не створено)');
}

async function upload() {
  const man = readManifest();
  const files = CONCEPTS.flatMap(c => [c.h, c.v]);
  let changed = 0;
  for (const f of files) {
    const p = path.join(DOWNLOADS, f);
    if (!fs.existsSync(p)) throw new Error('нема файлу: ' + p);
    const buf = fs.readFileSync(p);
    const md5 = crypto.createHash('md5').update(buf).digest('hex');
    const prev = man[f];
    if (prev && prev.video_id && prev.md5 === md5) { console.log(`⏭  ${f} без змін: ${prev.video_id}`); continue; }
    if (prev && prev.video_id) {
      console.log(`♻️  ${f} — файл змінився, перезаливаю (старий video_id ${prev.video_id})`);
      man._replaced = man._replaced || [];
      man._replaced.push({ file: f, ...prev });
    }
    console.log(`⬆️  ${f} (${Math.round(buf.length / 1024 / 1024)} MB)...`);
    const id = await retry(() => uploadVideoBufferToMeta(buf, f), `upload ${f}`);
    man[f] = { video_id: id, md5 };
    writeManifest(man);
    changed++;
    console.log(`    video_id: ${id}`);
  }
  man._changed = changed;
  for (const f of files) {
    await waitVideoReady(man[f].video_id, f);
    if (!man[f].thumb_hash) {
      man[f].thumb_hash = await getThumbHash(man[f].video_id, f);
      writeManifest(man);
      console.log(`    thumb_hash: ${man[f].thumb_hash}`);
    }
  }
  console.log(`\n✅ 4 відео в медіатеці. Manifest: ${MANIFEST}`);
  return man;
}

// креативи — по одному на концепт, переиспользуються в обох групах
async function makeCreatives(man, suffix = '') {
  const creativeIds = {};
  for (const c of CONCEPTS) {
    let created = null, lastErr = null;
    for (const variant of RULE_VARIANTS) {
      const r = await apiPost(`${ACCT}/adcreatives`, {
        name: `1308_${c.key}_creative${suffix}`,
        object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
        asset_feed_spec: JSON.stringify(creativeSpec(c, man, variant.rules)),
        url_tags: URL_TAGS
      });
      if (!r.error) { created = r; console.log(`  🎨 1308_${c.key} — creative ${r.id} (правила: ${variant.label})`); break; }
      lastErr = r.error;
      console.log(`   ⚠️  варіант «${variant.label}» відпав: ${errMsg(r.error)}`);
    }
    if (!created) throw new Error(`creative 1308_${c.key}: ${errMsg(lastErr)}`);
    creativeIds[c.key] = created.id;
  }
  return creativeIds;
}

async function build() {
  const man = await upload();
  const creativeIds = await makeCreatives(man);

  const entry = { date: '2026-08-12', campaign_name: 'AI_Apollo_sales_ZHY_041_1308', campaign_id: CAMPAIGN_ID, adsets: [], ads_count: 0 };

  for (const a of NEW_ADSETS) {
    const adset = await apiPost(`${ACCT}/adsets`, {
      name: a.name,
      campaign_id: CAMPAIGN_ID,
      optimization_goal: 'OFFSITE_CONVERSIONS',
      billing_event: 'IMPRESSIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      daily_budget: String(a.budget),
      promoted_object: JSON.stringify({ pixel_id: PIXEL_ID, custom_event_type: 'PURCHASE' }),
      targeting: JSON.stringify(a.targeting),
      start_time: START_TIME,
      end_time: END_TIME,
      status: 'PAUSED'
    });
    if (adset.error) throw new Error(`adset ${a.name}: ${errMsg(adset.error)}`);
    console.log(`\n  📂 ${a.name} — ${adset.id} | $${a.budget / 100}/д | PAUSED`);

    for (const c of CONCEPTS) {
      const ad = await apiPost(`${ACCT}/ads`, {
        name: `1308_${c.key}`,
        adset_id: adset.id,
        creative: JSON.stringify({ creative_id: creativeIds[c.key] }),
        status: 'PAUSED'
      });
      if (ad.error) throw new Error(`ad 1308_${c.key} в ${a.name}: ${errMsg(ad.error)}`);
      console.log(`     ✅ 1308_${c.key} — ad ${ad.id}`);
      entry.ads_count++;
    }
    entry.adsets.push({ name: a.name, id: adset.id, budget_usd: a.budget / 100, ads: CONCEPTS.length });
  }

  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  entry.note = 'Додано 2 відео-групи (local_ZHY_video + advantage_ZHY_video) у живу 1308. 2 концепти × 2 формати, адаптив 9:16 сторіс / 16:9 стрічка. Бюджет кампанії лишився $140/д, перерозподілено на 6 груп. Нові групи PAUSED.';
  hist.push(entry);
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));

  console.log(`\n✅ Створено ${entry.adsets.length} групи / ${entry.ads_count} оголошень — все PAUSED.`);
  console.log('   Далі: node tools/add_041_videos.js budget');
}

// Перезняли ролики → нові video_id → нові креативи → ті самі оголошення.
async function replace() {
  const man = await upload();
  if (!man._changed) { console.log('\n⏹  Жоден файл не змінився — нема що замінювати.'); return; }

  // знаходимо живі оголошення в наших двох групах
  const targets = [];
  for (const a of NEW_ADSETS) {
    const sets = await apiGet(`${CAMPAIGN_ID}/adsets`, { fields: 'id,name', limit: '50' });
    if (sets.error) throw new Error(errMsg(sets.error));
    const set = (sets.data || []).find(s => s.name === a.name);
    if (!set) throw new Error(`не знайшов групу ${a.name} — спершу build`);
    const ads = await apiGet(`${set.id}/ads`, { fields: 'id,name,status,creative{id}', limit: '50' });
    if (ads.error) throw new Error(errMsg(ads.error));
    for (const c of CONCEPTS) {
      const ad = (ads.data || []).find(x => x.name === `1308_${c.key}`);
      if (!ad) throw new Error(`не знайшов оголошення 1308_${c.key} у ${a.name}`);
      targets.push({ adset: a.name, ad, concept: c });
    }
  }

  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  console.log(`\n🎨 Нові креативи (${stamp}):`);
  const creativeIds = await makeCreatives(man, '_v2');

  console.log('\n🔁 Переводжу оголошення на нові креативи:');
  for (const t of targets) {
    const r = await apiPost(t.ad.id, { creative: JSON.stringify({ creative_id: creativeIds[t.concept.key] }) });
    if (r.error) throw new Error(`ad ${t.ad.name} у ${t.adset}: ${errMsg(r.error)}`);
    console.log(`   ✅ ${t.adset} / ${t.ad.name} — ${t.ad.creative.id} → ${creativeIds[t.concept.key]}  [${t.ad.status}]`);
  }

  // Контрольна звірка. УВАГА: у asset_feed_spec Meta повертає СВОЇ video_id —
  // при створенні креатива вона робить власну копію ролика, тому порівнювати
  // їх із залитими в акаунт немає сенсу. Звіряємо креатив і thumbnail_hash
  // (їх ми задаємо самі й вони унікальні для кожного залитого файлу).
  console.log('\n🔍 Звірка:');
  for (const t of targets) {
    const r = await apiGet(t.ad.id, { fields: 'name,creative{id,asset_feed_spec}' });
    const cr = r.creative || {};
    const vids = (cr.asset_feed_spec || {}).videos || [];
    const got = vids.map(v => v.thumbnail_hash).sort();
    const want = [man[t.concept.h].thumb_hash, man[t.concept.v].thumb_hash].sort();
    const ok = cr.id === creativeIds[t.concept.key] && JSON.stringify(got) === JSON.stringify(want);
    console.log(`   ${ok ? '✅' : '❌'} ${t.adset} / ${t.ad.name} — creative ${cr.id}, копії Meta ${vids.map(v => v.video_id).join(', ')}`);
    if (!ok) throw new Error(`у ${t.adset}/${t.ad.name} стоїть не той креатив`);
  }
  console.log('\n✅ Заміна завершена. Старі креативи лишились в акаунті, але на них ніхто не посилається.');
}

async function budget() {
  console.log('\n💰 Перерозподіл бюджету діючих груп...\n');
  for (const r of REBALANCE) {
    const res = await apiPost(r.id, { daily_budget: String(r.to) });
    if (res.error) throw new Error(`${r.name}: ${errMsg(res.error)}`);
    console.log(`   ✅ ${r.name.padEnd(20)} $${r.from / 100} → $${r.to / 100}`);
  }
  await verify();
}

async function verify() {
  const r = await apiGet(`${CAMPAIGN_ID}/adsets`, { fields: 'id,name,status,effective_status,daily_budget', limit: '50' });
  if (r.error) throw new Error(errMsg(r.error));
  console.log('\n📊 Кампанія AI_Apollo_sales_ZHY_041_1308:');
  let total = 0, active = 0;
  for (const a of r.data.sort((x, y) => x.name.localeCompare(y.name))) {
    const b = parseInt(a.daily_budget, 10) || 0;
    total += b;
    if (a.status === 'ACTIVE') active += b;
    console.log(`   ${a.name.padEnd(22)} $${String(b / 100).padStart(3)}/д   ${a.status}`);
  }
  console.log(`   ${''.padEnd(22)} ────────`);
  console.log(`   ${'разом'.padEnd(22)} $${total / 100}/д   (з них ACTIVE: $${active / 100}/д)`);
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'plan') plan();
  else if (cmd === 'upload') await upload();
  else if (cmd === 'build') await build();
  else if (cmd === 'budget') await budget();
  else if (cmd === 'verify') await verify();
  else if (cmd === 'replace') await replace();
  else console.log('cmd: plan | upload | build | budget | verify | replace');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
