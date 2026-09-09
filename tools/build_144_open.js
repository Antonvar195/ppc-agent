// AI_Apollo_sales_Kyiv_144_0909 — передвідкриттєвий продаж клубу 144.
// Харківське шосе, 144, Київ · відкриття 22.10.2026 · акція до 21.10.
// Оффер із банерів: 299 ₴ замість 1249 ₴ за перші 4 тижні.
//
// Структура — копія запуску клубу 038 (A_Apollo_sales_Kyiv_038_2212):
// 8 груп = 4 типи аудиторій × 2 сегменти креативів.
// Сегмент 1 отримує банери 1-4, сегмент 2 — банери 5-7.
//
// Таргетинг НЕ збирається руками: читається з живих груп 038 і в ньому
// підміняється лише гео (див. docs/LESSONS.md — копіювати з живого).
// Гео: коло 6 км навколо адреси клубу (у 038 було 2 милі навколо DOMA).
//
// Бюджет $100/день на кампанію, розподілений по групах.
// Все PAUSED. Usage: node tools/build_144_open.js plan | build | verify
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
const PIXEL_ID = '393751978682816';

const TEMPLATE_CAMPAIGN = '120237814773410193';   // A_Apollo_sales_Kyiv_038_2212
const CAMPAIGN_NAME = 'AI_Apollo_sales_Kyiv_144_0909';
const CLUB_URL = 'https://apollo.online/clubs/apollo-next-144/';
const DISPLAY_URL = 'apollo.online';
const TITLE = 'Новий спорт простір на Харківському шосе';
const CTA = 'APPLY_NOW';
const END_TIME = '2026-10-21T23:59:00+0300';       // остання доба акції
const URL_TAGS = 'utm_source=facebook&utm_medium=conversion&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';
const DROPBOX_LINK = 'https://www.dropbox.com/scl/fo/ip7g9fjafglbz2lb92znw/AMIMDiwLiUgRRT5bvfop-MY?rlkey=3zi00uhwh24wkzl39bmhdaaeq&e=2&dl=0';
const MANIFEST = path.join(__dirname, '../history/club144_manifest.json');

// Харківське шосе, 144 (зі сторінки клубу). 6 км — верхня межа запиту 5-6 км.
const GEO = {
  custom_locations: [{
    latitude: 50.421631, longitude: 30.651099,
    radius: 6, distance_unit: 'kilometer',
    primary_city_id: 2373594, region_id: 4290, country: 'UA',
  }],
  location_types: ['home', 'recent'],
};

const BODY = `Зустрічай новий спортивний простір APOLLO NEXT 144 — на Харківському шосе.

Відкриття 22 жовтня, Харківське шосе, 144.

✨ APOLLO NEXT — це нове бачення фітнесу, де тіло, розклад і навіть настрій працюють на тебе:

▫️ Понад 48 групових програм
▫️ Smart-запис через застосунок — усе під контролем
▫️ Індивідуальні та групові сесії із сертифікованими тренерами
▫️ Вентильовані душові, продуманий фудхакінг, вендинг зі смаколиками
▫️ Простір без хейту — лише підтримка, мотивація й твій темп
▫️ Автоматизований вхід — без черг і без стопів

🔥 Ціна відкриття: 299 ₴ замість 1249 ₴ за перші 4 тижні.
Акція діє до 21.10.2026 — поки клуб готується до старту.

Максимум гнучкості — мінімум зобовʼязань.`;

// 7 концептів × 3 формати. Сегмент 1 — банери 1-4, сегмент 2 — 5-7 (як у 038).
const CONCEPTS = [
  { n: 1, seg: 1 }, { n: 2, seg: 1 }, { n: 3, seg: 1 }, { n: 4, seg: 1 },
  { n: 5, seg: 2 }, { n: 6, seg: 2 }, { n: 7, seg: 2 },
];
const files = n => ({ sq: `square0${n}.jpg`, st: `stories0${n}.jpg`, h: `h0${n}.jpg` });
const adName = c => `0909_${c.n}`;

// група → (еталонна група 038, сегмент, бюджет у центах)
const ADSETS = [
  { name: 'local_kyiv_segment_1',              src: 'local_kyiv_segment_1',              seg: 1, budget: 2200 },
  { name: 'local_kyiv_segment_2',              src: 'local_kyiv_segment_2',              seg: 2, budget: 1700 },
  { name: 'advantage_kyiv_segment_1',          src: 'advantage_kyiv_segment_1',          seg: 1, budget: 2200 },
  { name: 'advantage_kyiv_segment_2',          src: 'advantage_kyiv_segment_2',          seg: 2, budget: 1700 },
  { name: 'engagement_kyiv_segment_1',         src: 'engagement_kyiv_segment_1',         seg: 1, budget: 600 },
  { name: 'engagement_kyiv_segment_2',         src: 'engagement_kyiv_segment_2',         seg: 2, budget: 500 },
  { name: 'lookalike_clubs_page_30_segment_1', src: 'lookalike_clubs_page_30_segment_1', seg: 1, budget: 600 },
  { name: 'lookalike_clubs_page_30_segment_2', src: 'lookalike_clubs_page_30_segment_2', seg: 2, budget: 500 },
];

// вертикаль у сторіс/рілс, горизонт у right column/instream, квадрат — решта
const RULES = [
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'] }, image_label: { name: 'st_img' }, priority: 1 },
  { customization_spec: { publisher_platforms: ['facebook'], facebook_positions: ['right_hand_column', 'instream_video', 'marketplace'] }, image_label: { name: 'h_img' }, priority: 2 },
  { customization_spec: {}, image_label: { name: 'sq_img' }, priority: 3 },
];

async function loadTemplateTargeting() {
  const s = await apiGet(`${TEMPLATE_CAMPAIGN}/adsets`, { fields: 'name,targeting,optimization_goal,billing_event,bid_strategy,promoted_object,attribution_spec', limit: '20' });
  if (s.error) throw new Error('еталон 038: ' + G.errMsg(s.error));
  const byName = {};
  for (const a of s.data || []) byName[a.name] = a;
  for (const x of ADSETS) if (!byName[x.src]) throw new Error(`у 038 нема групи ${x.src}`);
  return byName;
}

function plan() {
  console.log(`\n${CAMPAIGN_NAME} — OUTCOME_SALES, шаблон 038_2212\n`);
  console.log(`   гео: коло 6 км навколо 50.4216, 30.6511 (Харківське шосе, 144)`);
  console.log(`   лендінг: ${CLUB_URL} · акція до ${END_TIME.slice(0,10)}\n`);
  let total = 0;
  for (const a of ADSETS) {
    total += a.budget;
    const cs = CONCEPTS.filter(c => c.seg === a.seg).map(c => adName(c)).join(', ');
    console.log(`   📂 ${a.name.padEnd(36)} $${String(a.budget/100).padStart(2)}/д  →  ${cs}`);
  }
  console.log(`\nРазом: ${ADSETS.length} груп, ${ADSETS.reduce((n,a)=>n+CONCEPTS.filter(c=>c.seg===a.seg).length,0)} оголошень, $${total/100}/день`);
  console.log('\n(plan — нічого не створено)');
}

async function uploadBanners() {
  const man = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  const all = CONCEPTS.flatMap(c => Object.values(files(c.n)));
  if (all.every(f => man[f])) { console.log('♻️  усі 21 банер уже залиті'); return man; }
  await refreshDropboxToken();
  for (const f of all) {
    if (man[f]) continue;
    const r = await dropboxRequest(t => axios({ method: 'post', url: 'https://content.dropboxapi.com/2/sharing/get_shared_link_file',
      headers: { Authorization: `Bearer ${t}`, 'Dropbox-API-Arg': JSON.stringify({ url: DROPBOX_LINK, path: '/' + f }), 'Content-Type': '' },
      data: '', responseType: 'arraybuffer', maxContentLength: 50 * 1024 * 1024 }));
    const up = await apiPost(`${ACCT}/adimages`, { bytes: Buffer.from(r.data).toString('base64'), name: `club144_${f}` });
    if (up.error) throw new Error(`${f}: ${G.errMsg(up.error)}`);
    man[f] = Object.values(up.images || {})[0].hash;
    fs.writeFileSync(MANIFEST, JSON.stringify(man, null, 2));
    console.log(`  ⬆️ ${f} → ${man[f].slice(0, 12)}…`);
  }
  return man;
}

async function build() {
  const hashes = await uploadBanners();
  const tpl = await loadTemplateTargeting();
  console.log('📋 таргетинг узято з живих груп 038, підмінено лише гео');

  const all = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '400' })).data || [];
  const prior = all.find(x => x.name === CAMPAIGN_NAME);
  const camp = prior || await G.createChecked(`${ACCT}/campaigns`, {
    name: CAMPAIGN_NAME, objective: 'OUTCOME_SALES', buying_type: 'AUCTION',
    special_ad_categories: JSON.stringify([]), is_adset_budget_sharing_enabled: 'false', status: 'PAUSED',
  }, 'campaign');
  console.log(`\n📁 ${CAMPAIGN_NAME} — ${camp.id}${prior ? ' (наявна)' : ''}`);

  // креатив на концепт, переиспользується всіма групами
  const creativeIds = {};
  for (const c of CONCEPTS) {
    const f = files(c.n);
    const cr = await G.createChecked(`${ACCT}/adcreatives`, {
      name: `${adName(c)}_creative`,
      object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
      asset_feed_spec: JSON.stringify({
        images: [
          { hash: hashes[f.sq], adlabels: [{ name: 'sq_img' }] },
          { hash: hashes[f.st], adlabels: [{ name: 'st_img' }] },
          { hash: hashes[f.h],  adlabels: [{ name: 'h_img' }] },
        ],
        bodies: [{ text: BODY }], titles: [{ text: TITLE }], descriptions: [{ text: '' }],
        link_urls: [{ website_url: CLUB_URL, display_url: DISPLAY_URL }],
        call_to_action_types: [CTA], ad_formats: ['AUTOMATIC_FORMAT'], optimization_type: 'PLACEMENT',
        asset_customization_rules: RULES,
      }),
      url_tags: URL_TAGS,
    }, `creative ${adName(c)}`);
    creativeIds[c.n] = cr.id;
    console.log(`  🎨 ${adName(c)} — ${cr.id}`);
  }

  const liveSets = (await apiGet(`${camp.id}/adsets`, { fields: 'id,name,daily_budget', limit: '50' })).data || [];
  for (const a of ADSETS) {
    const ref = tpl[a.src];
    const had = liveSets.find(x => x.name === a.name);
    if (had && String(had.daily_budget) !== String(a.budget)) {
      const u = await apiPost(had.id, { daily_budget: String(a.budget) });
      if (u.error) throw new Error(`бюджет ${a.name}: ${G.errMsg(u.error)}`);
    }
    const targeting = { ...JSON.parse(JSON.stringify(ref.targeting)), geo_locations: GEO };
    const adset = had || await G.createAdSet({
      name: a.name, campaign_id: camp.id,
      optimization_goal: ref.optimization_goal, billing_event: ref.billing_event,
      bid_strategy: ref.bid_strategy || 'LOWEST_COST_WITHOUT_CAP',
      daily_budget: String(a.budget),
      promoted_object: JSON.stringify({ pixel_id: PIXEL_ID, custom_event_type: 'PURCHASE' }),
      targeting,
      end_time: END_TIME,
    });
    console.log(`  📂 ${a.name.padEnd(36)} ${adset.id} | $${a.budget/100}/д${had ? ' (наявна)' : ''}`);

    const liveAds = (await apiGet(`${adset.id}/ads`, { fields: 'id,name', limit: '50' })).data || [];
    for (const c of CONCEPTS.filter(x => x.seg === a.seg)) {
      if (liveAds.find(x => x.name === adName(c))) { console.log(`     ⏭  ${adName(c)} вже є`); continue; }
      const ad = await G.createAd({ name: adName(c), adset_id: adset.id, creative: { creative_id: creativeIds[c.n] } });
      console.log(`     ✅ ${adName(c)} — ${ad.id}`);
    }
  }

  console.log('\n🔍 Звірка:');
  const sets = (await apiGet(`${camp.id}/adsets`, { fields: 'id,name,targeting', limit: '50' })).data || [];
  for (const s of sets) {
    const g = (s.targeting.geo_locations || {}).custom_locations || [];
    const geoOk = g.length === 1 && g[0].radius === 6 && Math.abs(g[0].latitude - 50.421631) < 0.001;
    const ads = (await apiGet(`${s.id}/ads`, { fields: 'id,name', limit: '20' })).data || [];
    const v = await G.verifyAd(ads[0].id, { link: CLUB_URL });
    const p = await G.checkPreviews(ads[0].id, ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY', 'DESKTOP_FEED_STANDARD']);
    console.log(`   ${geoOk && v.ok && p.ok ? '✅' : '❌'} ${s.name.padEnd(36)} гео ${geoOk ? 'ok' : 'НЕ ТЕ'} | оголош. ${ads.length} | ${v.problems.join(';') || 'дані ок'} | ${p.INSTAGRAM_STANDARD}/${p.INSTAGRAM_STORY}/${p.DESKTOP_FEED_STANDARD}`);
  }

  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  hist.push({ date: '2026-09-09', campaign_name: CAMPAIGN_NAME, campaign_id: camp.id,
    note: 'Передвідкриття клубу 144 (Харківське шосе, 144, відкриття 22.10.2026). Копія структури 038_2212: 8 груп × 2 сегменти, 7 банерів × 3 формати. Гео — коло 6 км навколо клубу. $100/д, акція до 21.10. Все PAUSED.' });
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));

  console.log(`\n📊 ${CAMPAIGN_NAME}:`);
  G.printSummary(await G.campaignSummary(camp.id));
  console.log('\n✅ Готово — все PAUSED.');
}

async function verify() {
  const all = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '400' })).data || [];
  const c = all.find(x => x.name === CAMPAIGN_NAME);
  if (!c) throw new Error('кампанію не знайдено');
  G.printSummary(await G.campaignSummary(c.id));
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'plan') plan();
  else if (cmd === 'build') await build();
  else if (cmd === 'verify') await verify();
  else console.log('cmd: plan | build | verify');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
