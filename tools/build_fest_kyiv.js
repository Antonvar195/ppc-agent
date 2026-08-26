// AI_Apollo_conversion_Kyiv_fest_2608 — Фітнес Фест by APOLLO NEXT, 12.09.2026.
//
// Ціль — сабміт форми реєстрації. Трекінг живе НЕ на сайті, а в самому Typeform:
// у формі y54TKfJp прописаний піксель 393751978682816, і рендерер шле
// fbq('trackSingleCustom', pixelId, 'TypeformSubmit'). Подія йде БЕЗ параметрів
// форми, тому кастомна конверсія звужена по URL (див. CUSTOM_CONVERSION_ID).
//
// Одна широка група: Київ + 10 км, 18-55, Instagram + Threads, $120/день.
// 4 адаптивні банери: квадрат у стрічку, вертикаль у сторіс/рілс.
// Папку «карусель» свідомо не чіпаємо.
//
// Все PAUSED. Usage: node tools/build_fest_kyiv.js plan | build | verify
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const G = require('./meta_guard');
const { apiGet } = require('./meta_api');
const { refreshDropboxToken, dropboxRequest } = require('./dropbox_reader');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const IG_ID = process.env.META_INSTAGRAM_ACTOR_ID || '17841447539432480';
const CUSTOM_CONVERSION_ID = '28278108171818700'; // Fest 2026 registration (TypeformSubmit)

const CAMPAIGN_NAME = 'AI_Apollo_conversion_Kyiv_fest_2608';
const ADSET_NAME = 'Kyiv_18-55_inst_treads';
const DAILY_BUDGET = 12000;                       // $120/день
const END_TIME = '2026-09-11T23:59:00+0300';      // стоп за день до фесту
const LANDING = 'https://fest.apollo.online/';
const DISPLAY_URL = 'fest.apollo.online';
const TITLE = 'Фітнес Фест 12.09 — вхід вільний';
const CTA = 'SIGN_UP';
const URL_TAGS = 'utm_source=facebook&utm_medium=conversion&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';

const DROPBOX_LINK = 'https://www.dropbox.com/scl/fo/dax8sk25hmbf6j2m0zq12/ADiNrgBoIevergNHnclYcyo?rlkey=15flyy4cu2ono3vfy4439vj54&e=3&dl=0';
const MANIFEST = path.join(__dirname, '../history/fest_kyiv_manifest.json');

const BODY = `Найбільший фітнес-івент України — просто неба і безкоштовно 🧡

12 вересня, субота, 8:00 · X-Park, парк Муромець

Один день, 11 активностей і 14 зон:
▫️ турніри з пляжного волейболу та баскетболу 3×3
▫️ SUP-заплив і фан-забіг
▫️ йога, пілатес, зумба, стретчинг, степ, DanceX і функціональне — просто приходиш і стаєш у коло
▫️ DJ на головній сцені, фотозони та розіграші
▫️ холі-фарби о 14:00 на фінал

Вхід вільний — потрібна лише реєстрація.`;

// назви у Dropbox саме такі: stoires (не stories)
const CONCEPTS = [
  { n: 1, sq: 'square01.jpg', st: 'stoires01.jpg', desc: 'фото: тренування на полі, старт сезону' },
  { n: 2, sq: 'square02.jpg', st: 'stoires02.jpg', desc: 'типографіка: список 11 активностей' },
  { n: 3, sq: 'square03.jpg', st: 'stoires03.jpg', desc: 'цифри 11 / 14 / 1 / 0 ₴' },
  { n: 4, sq: 'square04.jpg', st: 'stoires04.jpg', desc: 'дівчина + партнери, повний опис' },
];
const adName = c => `2608_${c.n}`;

// Київ + 10 км
const TARGETING = {
  age_min: 18, age_max: 55,
  geo_locations: {
    // Просили 10 км, але Meta приймає навколо міста мінімум 17 км (10 миль),
    // менше — subcode 1487110. 17 км — найближче допустиме до запиту.
    cities: [{ key: '2373594', country: 'UA', radius: 17, distance_unit: 'kilometer' }],
    location_types: ['home', 'recent'],
  },
  targeting_automation: { advantage_audience: 0, individual_setting: { geo: 0 } },
  publisher_platforms: ['instagram', 'threads'],
  instagram_positions: ['stream', 'story', 'reels', 'explore', 'explore_home', 'profile_feed'],
  threads_positions: ['threads_stream'],
  device_platforms: ['mobile', 'desktop'],
};

// вертикаль у сторіс/рілс, квадрат — решта (стрічка, explore, threads)
const RULES = [
  { customization_spec: { publisher_platforms: ['instagram'], instagram_positions: ['story', 'reels'] }, image_label: { name: 'st_img' }, priority: 1 },
  { customization_spec: {}, image_label: { name: 'sq_img' }, priority: 2 },
];

async function download(f) {
  const r = await dropboxRequest(token => axios({
    method: 'post', url: 'https://content.dropboxapi.com/2/sharing/get_shared_link_file',
    headers: { Authorization: `Bearer ${token}`, 'Dropbox-API-Arg': JSON.stringify({ url: DROPBOX_LINK, path: '/' + f }), 'Content-Type': '' },
    data: '', responseType: 'arraybuffer', maxContentLength: 50 * 1024 * 1024,
  }));
  return Buffer.from(r.data);
}

function plan() {
  console.log(`\n${CAMPAIGN_NAME} — OUTCOME_LEADS / кастомна конверсія TypeformSubmit\n`);
  console.log(`📂 ${ADSET_NAME} — $${DAILY_BUDGET / 100}/д  [PAUSED]`);
  console.log('   Київ + 17 км (мінімум Meta) · 18-55 · усі статі · Instagram + Threads');
  console.log(`   конверсія ${CUSTOM_CONVERSION_ID} · кінець ${END_TIME}`);
  CONCEPTS.forEach(c => {
    console.log(`   • ${adName(c)} — ${c.desc}`);
    console.log(`       1:1  → стрічка/explore/threads: ${c.sq}`);
    console.log(`       9:16 → сторіс/рілс:            ${c.st}`);
  });
  console.log(`\nЛендінг: ${LANDING} · CTA ${CTA}`);
  console.log('\n(plan — нічого не створено)');
}

async function build() {
  console.log('🔄 Dropbox...');
  await refreshDropboxToken();

  const hashes = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  for (const f of CONCEPTS.flatMap(c => [c.sq, c.st])) {
    if (hashes[f]) { console.log(`⏭  ${f} вже залито: ${hashes[f].slice(0, 12)}…`); continue; }
    const buf = await download(f);
    const r = await require('./meta_api').apiPost(`${ACCT}/adimages`, { bytes: buf.toString('base64'), name: `fest_${f}` });
    if (r.error) throw new Error(`${f}: ${G.errMsg(r.error)}`);
    hashes[f] = Object.values(r.images || {})[0].hash;
    fs.writeFileSync(MANIFEST, JSON.stringify(hashes, null, 2));
    console.log(`  ⬆️ ${f} → ${hashes[f].slice(0, 12)}…`);
  }

  // кампанія могла лишитись від невдалого прогону — переиспользуємо, не плодимо
  const existing = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '200' })).data || [];
  const found = existing.find(x => x.name === CAMPAIGN_NAME);
  const camp = found ? (console.log(`\n📁 знайшов наявну кампанію ${found.id}`), found) : await G.createChecked(`${ACCT}/campaigns`, {
    name: CAMPAIGN_NAME,
    objective: 'OUTCOME_LEADS',
    buying_type: 'AUCTION',
    special_ad_categories: JSON.stringify([]),
    is_adset_budget_sharing_enabled: 'false',
    status: 'PAUSED',
  }, 'campaign');
  if (!found) console.log(`\n📁 campaign ${camp.id}`);

  const adset = await G.createAdSet({
    name: ADSET_NAME,
    campaign_id: camp.id,
    optimization_goal: 'OFFSITE_CONVERSIONS',
    billing_event: 'IMPRESSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    daily_budget: String(DAILY_BUDGET),
    promoted_object: { custom_conversion_id: CUSTOM_CONVERSION_ID },
    targeting: TARGETING,
    end_time: END_TIME,
  });
  console.log(`  📂 ${ADSET_NAME} — ${adset.id} | $${DAILY_BUDGET / 100}/д | PAUSED`);

  const created = [];
  for (const c of CONCEPTS) {
    const cr = await G.createChecked(`${ACCT}/adcreatives`, {
      name: `${adName(c)}_creative`,
      object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
      asset_feed_spec: JSON.stringify({
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
        asset_customization_rules: RULES,
      }),
      url_tags: URL_TAGS,
    }, `creative ${adName(c)}`);

    const ad = await G.createAd({ name: adName(c), adset_id: adset.id, creative: { creative_id: cr.id } });
    console.log(`     ✅ ${adName(c)} — ad ${ad.id} (${c.desc})`);
    created.push({ id: ad.id, name: adName(c), creativeId: cr.id, imageHashes: [hashes[c.sq], hashes[c.st]] });
  }

  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  hist.push({
    date: '2026-08-26', campaign_name: CAMPAIGN_NAME, campaign_id: camp.id,
    adsets: [{ name: ADSET_NAME, id: adset.id, budget_usd: DAILY_BUDGET / 100, ads: created.length }],
    ads_count: created.length,
    note: 'Фітнес Фест 12.09.2026, Київ+10км, 18-55, IG+Threads, $120/д. Ціль — кастомна конверсія TypeformSubmit (28278108171818700), трекінг на боці Typeform. Все PAUSED.',
  });
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));

  console.log('\n🔍 Звірка:');
  for (const a of created) {
    const v = await G.verifyAd(a.id, { creativeId: a.creativeId, imageHashes: a.imageHashes, link: LANDING });
    const p = await G.checkPreviews(a.id, ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY', 'INSTAGRAM_REELS']);
    console.log(`   ${v.ok && p.ok ? '✅' : '❌'} ${a.name} ${v.status} | ${v.problems.join('; ') || 'дані ок'} | прев'ю ${['INSTAGRAM_STANDARD','INSTAGRAM_STORY','INSTAGRAM_REELS'].map(f => f.split('_')[1].toLowerCase() + ':' + p[f]).join(' ')}`);
  }
  console.log(`\n📊 ${CAMPAIGN_NAME}:`);
  G.printSummary(await G.campaignSummary(camp.id));
  console.log('\n✅ Готово — все PAUSED.');
}

async function verify() {
  const r = await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '200' });
  const c = (r.data || []).find(x => x.name === CAMPAIGN_NAME);
  if (!c) throw new Error('кампанію не знайдено — спершу build');
  G.printSummary(await G.campaignSummary(c.id));
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'plan') plan();
  else if (cmd === 'build') await build();
  else if (cmd === 'verify') await verify();
  else console.log('cmd: plan | build | verify');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
