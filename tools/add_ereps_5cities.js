// Додає в живу кампанію A_EREPS_1203 (120240881962870193) одну групу-копію
// існуючих аудиторій, але з усіма 5 містами одразу: Київ, Одеса, Львів,
// Вінниця, Івано-Франківськ.
//
// Налаштування групи — точна копія діючих lookalike_Trainer_base_students_EQF4_*
// (пиксель + кастомна конверсія dyakuyemo-cb, FB feed + IG stream/story/reels/
// explore_home, LOWEST_COST), різниця лише в гео і віці: 17-25 замість 17-45,
// бо креативи зроблені під молодіжний сегмент (лендінг ereps-eqf4-upto25).
//
// 4 адаптивні оголошення: квадрат 1080x1080 у стрічку, вертикаль 1080x1920 у
// сторіс/рілс. Банери з Dropbox, тексти з «Персональний тренер_ 17-25.docx».
//
// Бюджет $25/день — зверху, діючі міські групи не чіпаємо ($75 → $100/день).
// Все PAUSED. Usage: node tools/add_ereps_5cities.js plan | build | verify
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { apiGet: rawGet, apiPost: rawPost } = require('./meta_api');
const { refreshDropboxToken, dropboxRequest } = require('./dropbox_reader');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const IG_ID = process.env.META_INSTAGRAM_ACTOR_ID || '17841447539432480';
// Кастомна конверсія dyakuyemo-cb. promoted_object НЕ збираємо руками:
// Meta приймає custom_conversion_id лише разом із pixel_rule і звіряє це
// правило ПОСИМВОЛЬНО — навіть екранування слешів (`\/` проти `/`) ламає
// перевірку з subcode 1885014. Тому беремо об'єкт дослівно з живої групи.
const REFERENCE_ADSET = '120240881962810193'; // lookalike_Trainer_base_students_EQF4_kyiv

const CAMPAIGN_ID = '120240881962870193'; // A_EREPS_1203
const ADSET_NAME = 'Trainer_EQF4_5cities_17-25';
const ADSET_BUDGET = 2500; // центи USD/день
const AD_DATE = '1203';    // дата запуску кампанії, за правилом неймінгу
const AD_START_N = 6;      // 1203_1..5 вже зайняті — нумерація наскрізна

const LANDING = 'https://apollo.online/courses-fa/ereps-eqf4-upto25/';
const DISPLAY_URL = 'apollo.online';
const TITLE = 'APOLLO NEXT — старт твоєї кар’єри';
const CTA = 'APPLY_NOW';
const URL_TAGS = 'utm_source=facebook&utm_medium=conversion&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';

const DROPBOX_LINK = 'https://www.dropbox.com/scl/fo/pk4t3jy65g7yd3a7t5o12/AG3dKniaRHsMtEaDbxfEZyw?dl=0&e=1&rlkey=j882fe7a4nkvrlc77ag46ayyl';
const MANIFEST = path.join(__dirname, '../history/ereps_5cities_manifest.json');

// «Розширений текст для реклами» з docx — дослівно
const BODY = `Ходиш у зал і думаєш, ким хочеш працювати?
А якщо відповідь буквально перед очима?
Тренуєшся. Цікавишся спортом. Знаєш, що таке дисципліна й кайф від результату 💪🏼
↪️тоді саме час вийти за межі власних тренувань на наступний рівень!
Восени стартує курс Fitness Academy APOLLO NEXT «Персональний тренер» EREPS EQF4 з міжнародною сертифікацією.
Навчайся професії, яка справді тобі близька, і отримуй космічне задоволення від роботи ❤️‍🔥`;

// 4 концепти × 2 формати. Заголовок — той, що надрукований на банері.
const CONCEPTS = [
  { n: 1, sq: 'square01.jpg', st: 'stories01.jpg', headline: 'Перша робота, яку ти справді хотітимеш' },
  { n: 2, sq: 'square02.jpg', st: 'stories02.jpg', headline: 'Робота, на яку не треба змушувати себе йти' },
  { n: 3, sq: 'square03.jpg', st: 'stories03.jpg', headline: 'Усі йдуть на пари. Ти можеш піти в професію' },
  { n: 4, sq: 'square04.jpg', st: 'stories04.jpg', headline: 'Зал уже твій safe place? Зроби його місцем роботи' },
];
const adName = c => `${AD_DATE}_${AD_START_N + c.n - 1}`;

// Гео — рівно ті самі об'єкти, що в діючих групах (Київ там областю, не містом)
const GEO = {
  regions: [{ key: '4290', country: 'UA' }],                                   // Kyiv
  cities: [
    { key: '2384095', country: 'UA', region_id: '3794', distance_unit: 'mile' }, // Odessa
    { key: '2378495', country: 'UA', region_id: '3792', distance_unit: 'mile' }, // Lviv
    { key: '2397330', country: 'UA', region_id: '3800', distance_unit: 'mile' }, // Vinnytsia
    { key: '2371245', country: 'UA', region_id: '3783', distance_unit: 'mile' }, // Ivano-Frankivsk
  ],
  location_types: ['home', 'recent'],
};

// Плейсменти як у діючих групах. Єдина вимушена відмінність: Meta більше не
// приймає explore_home без explore (subcode 2490392) — діючі групи створені до
// того, як зʼявилась ця перевірка, тому в них explore немає.
const TARGETING = {
  age_min: 17, age_max: 25,
  geo_locations: GEO,
  targeting_automation: { advantage_audience: 0, individual_setting: { geo: 0 } },
  publisher_platforms: ['facebook', 'instagram'],
  facebook_positions: ['feed'],
  instagram_positions: ['stream', 'story', 'reels', 'explore', 'explore_home'],
  device_platforms: ['mobile', 'desktop'],
};

// Вертикаль у сторіс/рілс, квадрат — усе інше.
const RULE_VARIANTS = [
  { label: 'ig story/reels + default', rules: [
    { customization_spec: { publisher_platforms: ['instagram'], instagram_positions: ['story', 'reels'] }, image_label: { name: 'st_img' }, priority: 1 },
    { customization_spec: {}, image_label: { name: 'sq_img' }, priority: 2 },
  ] },
  { label: 'як у діючих креативах (age 13-65)', rules: [
    { customization_spec: { age_min: 13, age_max: 65, publisher_platforms: ['instagram'], instagram_positions: ['story', 'reels'] }, image_label: { name: 'st_img' }, priority: 1 },
    { customization_spec: { age_min: 13, age_max: 65 }, image_label: { name: 'sq_img' }, priority: 2 },
  ] },
];

// ---------- helpers ----------
const CALL_TIMEOUT_MS = 180000;
const CALL_TRIES = 3;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const withTimeout = (p, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout: ${label}`)), CALL_TIMEOUT_MS))]);
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

async function download(fileName) {
  const r = await retry(() => dropboxRequest(token => axios({
    method: 'post',
    url: 'https://content.dropboxapi.com/2/sharing/get_shared_link_file',
    headers: { Authorization: `Bearer ${token}`, 'Dropbox-API-Arg': JSON.stringify({ url: DROPBOX_LINK, path: '/' + fileName }), 'Content-Type': '' },
    data: '', responseType: 'arraybuffer', maxContentLength: 50 * 1024 * 1024
  })), `dropbox ${fileName}`);
  return Buffer.from(r.data);
}

async function uploadImage(buffer, name) {
  const r = await apiPost(`${ACCT}/adimages`, { bytes: buffer.toString('base64'), name });
  if (r.error) throw new Error(`image ${name}: ${errMsg(r.error)}`);
  const img = Object.values(r.images || {})[0];
  if (!img) throw new Error('Meta не повернув hash для ' + name);
  return img.hash;
}

function creativeSpec(c, hashes, rules) {
  return {
    images: [
      { hash: hashes[c.sq], adlabels: [{ name: 'sq_img' }] },
      { hash: hashes[c.st], adlabels: [{ name: 'st_img' }] },
    ],
    bodies: [{ text: BODY }],
    titles: [{ text: TITLE }],
    descriptions: [{ text: '' }],
    link_urls: [{ website_url: LANDING, display_url: DISPLAY_URL }],
    call_to_action_types: [CTA],
    ad_formats: ['AUTOMATIC_FORMAT'],
    optimization_type: 'PLACEMENT',
    asset_customization_rules: rules,
  };
}

// ---------- commands ----------
function plan() {
  console.log(`\nКампанія A_EREPS_1203 (${CAMPAIGN_ID}) — додаємо 1 групу\n`);
  console.log(`📂 ${ADSET_NAME} — $${ADSET_BUDGET / 100}/д  [PAUSED]`);
  console.log('   вік 17-25 | Київ (обл.) + Одеса + Львів + Вінниця + Івано-Франківськ');
  console.log('   FB feed + IG stream/story/reels/explore_home | конверсія dyakuyemo-cb');
  CONCEPTS.forEach(c => {
    console.log(`   • ${adName(c)} — «${c.headline}»`);
    console.log(`       1:1  → стрічка:      ${c.sq}`);
    console.log(`       9:16 → сторіс/рілс:  ${c.st}`);
  });
  console.log('\n💰 Бюджет — зверху, діючі групи не чіпаємо:');
  console.log('   kyiv $35 · odessa $10 · lviv $10 · vinnitsa $10 · IF $10  — без змін');
  console.log(`   ${ADSET_NAME} — $${ADSET_BUDGET / 100}`);
  console.log(`   разом $${(7500 + ADSET_BUDGET) / 100}/день (було $75)`);
  console.log('\n(plan — нічого не створено)');
}

async function build() {
  console.log('🔄 Dropbox...');
  await refreshDropboxToken();

  const hashes = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  for (const f of CONCEPTS.flatMap(c => [c.sq, c.st])) {
    if (hashes[f]) { console.log(`⏭  ${f} вже залито: ${hashes[f].slice(0, 12)}…`); continue; }
    const buf = await download(f);
    hashes[f] = await uploadImage(buf, `ereps_5cities_${f}`);
    fs.writeFileSync(MANIFEST, JSON.stringify(hashes, null, 2));
    console.log(`  ⬆️ ${f} → ${hashes[f].slice(0, 12)}…`);
  }

  // promoted_object — дослівно з живої групи (див. коментар біля REFERENCE_ADSET)
  const ref = await apiGet(REFERENCE_ADSET, { fields: 'name,promoted_object' });
  if (ref.error) throw new Error(`еталонна група: ${errMsg(ref.error)}`);
  const po = ref.promoted_object;
  if (!po || !po.pixel_rule || !po.custom_conversion_id) throw new Error('у еталонній групі нема pixel_rule/custom_conversion_id');
  console.log(`\n🎯 promoted_object скопійовано з «${ref.name}» — конверсія ${po.custom_conversion_id}`);

  const adsetPayload = {
    name: ADSET_NAME,
    campaign_id: CAMPAIGN_ID,
    optimization_goal: 'OFFSITE_CONVERSIONS',
    billing_event: 'IMPRESSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    daily_budget: String(ADSET_BUDGET),
    promoted_object: JSON.stringify({
      pixel_id: po.pixel_id,
      custom_event_type: po.custom_event_type,
      pixel_rule: po.pixel_rule,
      custom_conversion_id: po.custom_conversion_id
    }),
    targeting: JSON.stringify(TARGETING),
    status: 'PAUSED'
  };
  const check = await apiPost(`${ACCT}/adsets`, { ...adsetPayload, execution_options: JSON.stringify(['validate_only']) });
  if (check.error) throw new Error(`adset (перевірка): ${errMsg(check.error)}`);
  const adset = await apiPost(`${ACCT}/adsets`, adsetPayload);
  if (adset.error) throw new Error(`adset: ${errMsg(adset.error)}`);
  console.log(`\n  📂 ${ADSET_NAME} — ${adset.id} | $${ADSET_BUDGET / 100}/д | PAUSED`);

  // креативи + оголошення
  const entry = { date: '2026-08-17', campaign_name: 'A_EREPS_1203', campaign_id: CAMPAIGN_ID, adsets: [], ads_count: 0 };
  for (const c of CONCEPTS) {
    let creative = null, cErr = null;
    for (const rv of RULE_VARIANTS) {
      const r = await apiPost(`${ACCT}/adcreatives`, {
        name: `${adName(c)}_creative`,
        object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
        asset_feed_spec: JSON.stringify(creativeSpec(c, hashes, rv.rules)),
        url_tags: URL_TAGS
      });
      if (!r.error) { creative = r; console.log(`  🎨 ${adName(c)} — creative ${r.id} (правила: ${rv.label})`); break; }
      cErr = r.error;
      console.log(`   ⚠️  варіант «${rv.label}» відпав: ${errMsg(r.error)}`);
    }
    if (!creative) throw new Error(`creative ${adName(c)}: ${errMsg(cErr)}`);

    const ad = await apiPost(`${ACCT}/ads`, {
      name: adName(c),
      adset_id: adset.id,
      creative: JSON.stringify({ creative_id: creative.id }),
      status: 'PAUSED'
    });
    if (ad.error) throw new Error(`ad ${adName(c)}: ${errMsg(ad.error)}`);
    console.log(`     ✅ ${adName(c)} — ad ${ad.id}  «${c.headline}»`);
    entry.ads_count++;
  }
  entry.adsets.push({ name: ADSET_NAME, id: adset.id, budget_usd: ADSET_BUDGET / 100, ads: CONCEPTS.length });

  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  entry.note = 'Група-копія існуючих аудиторій EREPS з усіма 5 містами (Київ/Одеса/Львів/Вінниця/ІФ) в одній групі, вік 17-25 під молодіжні креативи. 4 адаптивні банери (1:1 стрічка + 9:16 сторіс) з Dropbox, тексти з docx «Персональний тренер 17-25». $25/д зверху, діючі міські групи не чіпали. Все PAUSED.';
  hist.push(entry);
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));

  console.log(`\n✅ Створено 1 групу / ${entry.ads_count} оголошення — все PAUSED.`);
  await verify();
}

async function verify() {
  const r = await apiGet(`${CAMPAIGN_ID}/adsets`, { fields: 'id,name,status,daily_budget,targeting', limit: '50' });
  if (r.error) throw new Error(errMsg(r.error));
  console.log('\n📊 Кампанія A_EREPS_1203:');
  let total = 0, active = 0;
  for (const a of r.data.sort((x, y) => x.name.localeCompare(y.name))) {
    const b = parseInt(a.daily_budget, 10) || 0;
    total += b; if (a.status === 'ACTIVE') active += b;
    const g = a.targeting.geo_locations || {};
    const geo = [...(g.regions || []).map(x => x.name), ...(g.cities || []).map(x => x.name)].join(', ');
    console.log(`   ${a.name.padEnd(38)} $${String(b / 100).padStart(3)}/д  ${a.status.padEnd(7)} ${a.targeting.age_min}-${a.targeting.age_max}  ${geo}`);
  }
  console.log(`   ${''.padEnd(38)} ────────`);
  console.log(`   ${'разом'.padEnd(38)} $${total / 100}/д   (ACTIVE: $${active / 100}/д)`);
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'plan') plan();
  else if (cmd === 'build') await build();
  else if (cmd === 'verify') await verify();
  else console.log('cmd: plan | build | verify');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
