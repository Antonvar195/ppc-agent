// Вересневі продажні: два оффери, розбивка міст як в охватних.
//
//   AI_Apollo_sales_1grn_0109   — Київ, Вінниця              (банери 01-03)
//   AI_Apollo_sales_50off_0109  — Львів, Одеса, БЦ, ІФ,       (банери 04-06)
//                                 Житомир
//
// Аудиторії скопійовані з діючих AI_Apollo_sales_allclubs_499/399_0108:
// cancelled+engagement_365 (лише Instagram), rem_30d, advantage_18-65, broad.
// Оптимізація VALUE на PURCHASE, атрибуція 7d click / 1d view.
//
// Бюджет $88/день на кампанію, пропорції всередині як у діючих
// (cancelled 16 / rem 19 / advantage 27 / broad 26).
// Бориспіль свідомо не включений — його немає в списку міст замовника.
//
// Оффер банера підтверджений візуально, не за назвою файлу.
// Все PAUSED. Usage: node tools/build_sept_sales.js plan | build | verify
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

const START_TIME = '2026-09-01T00:01:00+0300';
const END_TIME = '2026-09-30T23:59:00+0300';
const LANDING = 'https://apollo.online/clubs/';
const DISPLAY_URL = 'apollo.online';
const CTA = 'APPLY_NOW';
const URL_TAGS = 'utm_source=facebook&utm_medium=conversion&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';
const ATTRIBUTION = [{ event_type: 'CLICK_THROUGH', window_days: 7 }, { event_type: 'VIEW_THROUGH', window_days: 1 }];
const DROPBOX_LINK = 'https://www.dropbox.com/scl/fo/wady8wdoz49oadmgh8l9f/AKeZQ0BwEtfCGJOPGuNC9qY?dl=0&e=1&rlkey=bz0w18q05usi6etenld01pshm';
const MANIFEST = path.join(__dirname, '../history/sept_sales_manifest.json');

const CITY = {
  Kyiv:      { country: 'UA', distance_unit: 'mile', key: '2373594' },
  Vinnytsia: { country: 'UA', distance_unit: 'mile', key: '2397330' },
  Lviv:      { country: 'UA', distance_unit: 'mile', key: '2378495' },
  Odessa:    { country: 'UA', distance_unit: 'mile', key: '2384095' },
  BilaTserkva:    { country: 'UA', distance_unit: 'mile', key: '2363654' },
  IvanoFrankivsk: { country: 'UA', distance_unit: 'mile', key: '2371245' },
  Zhytomyr:  { country: 'UA', distance_unit: 'mile', key: '2401072' },
};

const IG_POS = ['stream', 'story', 'explore', 'reels', 'explore_home', 'profile_feed', 'ig_search'];

// 4 аудиторії — точні копії діючих груп, змінюється лише гео
const AUDIENCES = [
  { name: 'cancelled+engagement_365_inst', budget: 1600, t: {
      age_min: 18, age_max: 55,
      custom_audiences: [{ id: '120241907058590193' }, { id: '120241907150330193' }, { id: '120241907162830193' }],
      targeting_relaxation_types: { lookalike: 0, custom_audience: 1 },
      targeting_automation: { advantage_audience: 0 },
      publisher_platforms: ['instagram'], instagram_positions: IG_POS } },
  { name: 'rem_30d_18-55_inst_treads', budget: 1900, t: {
      age_min: 18, age_max: 55,
      custom_audiences: [{ id: '120243045761860193' }],
      targeting_relaxation_types: { lookalike: 0, custom_audience: 1 },
      targeting_automation: { advantage_audience: 0 },
      publisher_platforms: ['instagram', 'threads'], instagram_positions: IG_POS, threads_positions: ['threads_stream'] } },
  { name: 'advantage_18-65', budget: 2700, t: {
      age_min: 18, age_max: 65,
      targeting_automation: { advantage_audience: 1 } } },   // авто-плейсменти, як у діючій
  { name: 'broad_18-55_inst_treads', budget: 2600, t: {
      age_min: 18, age_max: 55,
      targeting_automation: { advantage_audience: 0 },
      publisher_platforms: ['instagram', 'threads'], instagram_positions: IG_POS, threads_positions: ['threads_stream'] } },
];

const BODY_1GRN = `Твій старт фітнес-сезону 2026 — за 1 грн ❤️‍🔥

Не знаєш, з яких тренувань почати? Що їсти? Як зрозуміти, що ти рухаєшся до результату?

Зі STARWAY ти не залишаєшся з цим сам на сам. Отримуєш персональну програму тренувань, раціони харчування, супровід тренера та контроль результатів ✔️

А ще — сучасний простір, десятки тренажерів і вільних ваг та місце, де комфортно бути собою незалежно від форми й досвіду.

Один план замість сотні збережених тренувань!

Починай фітнес-сезон за 1 грн →`;

const BODY_50OFF = `Твій старт фітнес-сезону 2026 — зі знижкою 50%.

Місія на вересень — повернутися на свою фітнес-орбіту 🪐

Більше рухатися. Спробувати нове. Знайти свій формат тренувань. І цього разу не зійти з дистанції ❤️‍🔥

У APOLLO NEXT є простір для комфортного фітнесу: сучасні тренажери та вільні ваги, групові заняття, професійні тренери і багато іншого!

Не підлаштовуй життя під фітнес. Знайди фітнес, який ідеально впишеться у твоє життя.

Лови свої −50% на підписку у вересні!`;

const OFFERS = {
  '1grn': {
    campaign: 'AI_Apollo_sales_1grn_0109',
    body: BODY_1GRN,
    cities: ['Kyiv', 'Vinnytsia'],
    creatives: [
      { n: 1, sq: 'square01.jpg', st: 'stories01.jpg', title: 'Спробуй фітнес за 1 грн' },
      { n: 2, sq: 'square02.jpg', st: 'stories02.jpg', title: 'Фітнес-сезон 2026: стартуй за 1 грн' },
      { n: 3, sq: 'square03.jpg', st: 'stories03.jpg', title: 'Спробуй тренування за 1 грн' },
    ],
  },
  '50off': {
    campaign: 'AI_Apollo_sales_50off_0109',
    body: BODY_50OFF,
    cities: ['Lviv', 'Odessa', 'BilaTserkva', 'IvanoFrankivsk', 'Zhytomyr'],
    creatives: [
      { n: 1, sq: 'square04.jpg', st: 'stories04.jpg', title: '−50% на спорт' },
      { n: 2, sq: 'square05.jpg', st: 'stories05.jpg', title: 'Стартуй у вересні зі знижкою 50%' },
      { n: 3, sq: 'square06.jpg', st: 'stories06.jpg', title: '−50% на тренування' },
    ],
  },
};

const RULES = [
  { customization_spec: { publisher_platforms: ['instagram'], instagram_positions: ['story', 'reels'] }, image_label: { name: 'st_img' }, priority: 1 },
  { customization_spec: {}, image_label: { name: 'sq_img' }, priority: 2 },
];

const geoFor = cities => ({ cities: cities.map(c => CITY[c]), location_types: ['home', 'recent'] });

function plan() {
  let total = 0;
  for (const o of Object.values(OFFERS)) {
    console.log(`\n📁 ${o.campaign} — OUTCOME_SALES / VALUE на PURCHASE`);
    console.log(`   міста: ${o.cities.join(', ')} · ${START_TIME.slice(0,10)} → ${END_TIME.slice(0,10)}`);
    for (const a of AUDIENCES) { total += a.budget; console.log(`   📂 ${a.name.padEnd(32)} $${String(a.budget/100).padStart(2)}/д`); }
    o.creatives.forEach(c => console.log(`        • 0109_${c.n} «${c.title}» — ${c.sq} / ${c.st}`));
  }
  console.log(`\nРазом: ${Object.keys(OFFERS).length*AUDIENCES.length} груп, ` +
    `${Object.keys(OFFERS).length*AUDIENCES.length*3} оголошень, $${total/100}/день · за вересень ~$${total/100*30}`);
  console.log('\n(plan — нічого не створено)');
}

async function uploadBanners() {
  const man = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  const files = Object.values(OFFERS).flatMap(o => o.creatives.flatMap(c => [c.sq, c.st]));
  if (files.every(f => man[f])) { console.log('♻️  усі 12 банерів уже залиті'); return man; }
  await refreshDropboxToken();
  for (const f of files) {
    if (man[f]) continue;
    const r = await dropboxRequest(token => axios({ method: 'post', url: 'https://content.dropboxapi.com/2/sharing/get_shared_link_file',
      headers: { Authorization: `Bearer ${token}`, 'Dropbox-API-Arg': JSON.stringify({ url: DROPBOX_LINK, path: '/' + f }), 'Content-Type': '' },
      data: '', responseType: 'arraybuffer', maxContentLength: 50 * 1024 * 1024 }));
    const up = await apiPost(`${ACCT}/adimages`, { bytes: Buffer.from(r.data).toString('base64'), name: `sept_sales_${f}` });
    if (up.error) throw new Error(`${f}: ${G.errMsg(up.error)}`);
    man[f] = Object.values(up.images || {})[0].hash;
    fs.writeFileSync(MANIFEST, JSON.stringify(man, null, 2));
    console.log(`  ⬆️ ${f} → ${man[f].slice(0, 12)}…`);
  }
  return man;
}

async function build() {
  const hashes = await uploadBanners();
  const summary = [];

  for (const o of Object.values(OFFERS)) {
    const all = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '300' })).data || [];
    const prior = all.find(x => x.name === o.campaign);
    const camp = prior || await G.createChecked(`${ACCT}/campaigns`, {
      name: o.campaign, objective: 'OUTCOME_SALES', buying_type: 'AUCTION',
      special_ad_categories: JSON.stringify([]), is_adset_budget_sharing_enabled: 'false', status: 'PAUSED',
    }, 'campaign ' + o.campaign);
    console.log(`\n📁 ${o.campaign} — ${camp.id}${prior ? ' (наявна)' : ''}`);

    // креатив на концепт, переиспользується всіма групами кампанії
    const creativeIds = {};
    for (const c of o.creatives) {
      const cr = await G.createChecked(`${ACCT}/adcreatives`, {
        name: `0109_${c.n}_${o.campaign}_creative`,
        object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
        asset_feed_spec: JSON.stringify({
          images: [{ hash: hashes[c.sq], adlabels: [{ name: 'sq_img' }] }, { hash: hashes[c.st], adlabels: [{ name: 'st_img' }] }],
          bodies: [{ text: o.body }], titles: [{ text: c.title }], descriptions: [{ text: '' }],
          link_urls: [{ website_url: LANDING, display_url: DISPLAY_URL }],
          call_to_action_types: [CTA], ad_formats: ['AUTOMATIC_FORMAT'], optimization_type: 'PLACEMENT',
          asset_customization_rules: RULES,
        }),
        url_tags: URL_TAGS,
      }, `creative 0109_${c.n}`);
      creativeIds[c.n] = cr.id;
      console.log(`  🎨 0109_${c.n} «${c.title}» — ${cr.id}`);
    }

    const liveSets = (await apiGet(`${camp.id}/adsets`, { fields: 'id,name,daily_budget', limit: '50' })).data || [];
    for (const a of AUDIENCES) {
      const had = liveSets.find(x => x.name === a.name);
      if (had && String(had.daily_budget) !== String(a.budget)) {
        const u = await apiPost(had.id, { daily_budget: String(a.budget) });
        if (u.error) throw new Error(`бюджет ${a.name}: ${G.errMsg(u.error)}`);
      }
      const adset = had || await G.createAdSet({
        name: a.name, campaign_id: camp.id,
        optimization_goal: 'VALUE', billing_event: 'IMPRESSIONS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        daily_budget: String(a.budget),
        promoted_object: JSON.stringify({ pixel_id: PIXEL_ID, custom_event_type: 'PURCHASE' }),
        targeting: { ...a.t, geo_locations: geoFor(o.cities) },
        attribution_spec: JSON.stringify(ATTRIBUTION),
        start_time: START_TIME, end_time: END_TIME,
      });
      console.log(`  📂 ${a.name.padEnd(32)} ${adset.id} | $${a.budget/100}/д${had ? ' (наявна)' : ''}`);

      const liveAds = (await apiGet(`${adset.id}/ads`, { fields: 'id,name', limit: '50' })).data || [];
      for (const c of o.creatives) {
        if (liveAds.find(x => x.name === `0109_${c.n}`)) { console.log(`     ⏭  0109_${c.n} вже є`); continue; }
        const ad = await G.createAd({ name: `0109_${c.n}`, adset_id: adset.id, creative: { creative_id: creativeIds[c.n] } });
        console.log(`     ✅ 0109_${c.n} — ${ad.id}`);
      }
      summary.push({ camp: o.campaign, adsetId: adset.id, name: a.name, creativeId: creativeIds[1] });
    }
  }

  console.log('\n🔍 Звірка (перше оголошення кожної групи):');
  for (const s of summary) {
    const ads = (await apiGet(`${s.adsetId}/ads`, { fields: 'id,name', limit: '5' })).data || [];
    const t = ads.find(x => x.name === '0109_1') || ads[0];
    const v = await G.verifyAd(t.id, { creativeId: s.creativeId, link: LANDING });
    const p = await G.checkPreviews(t.id, ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY']);
    console.log(`   ${v.ok && p.ok ? '✅' : '❌'} ${s.name.padEnd(32)} ${v.problems.join('; ') || 'дані ок'} | ${p.INSTAGRAM_STANDARD}/${p.INSTAGRAM_STORY}`);
  }

  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  hist.push({ date: '2026-08-31', campaigns: Object.values(OFFERS).map(o => o.campaign),
    note: 'Вересневі продажні: 1грн (Київ, Вінниця) + -50% (Львів, Одеса, БЦ, ІФ, Житомир). Аудиторії скопійовані з діючих 499/399. $88/д на кампанію, 01.09-30.09. Бориспіль не включений. Все PAUSED.' });
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));

  await verify();
  console.log('\n✅ Готово — все PAUSED.');
}

async function verify() {
  const all = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '300' })).data || [];
  for (const o of Object.values(OFFERS)) {
    const c = all.find(x => x.name === o.campaign);
    if (!c) { console.log('❌ нема', o.campaign); continue; }
    console.log(`\n📊 ${o.campaign}:`);
    G.printSummary(await G.campaignSummary(c.id));
  }
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'plan') plan();
  else if (cmd === 'build') await build();
  else if (cmd === 'verify') await verify();
  else console.log('cmd: plan | build | verify');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
