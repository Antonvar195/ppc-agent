// Реактивація бази по Києву: одна кампанія, одна група.
//
// Сегмент: «відвал за весь час» МІНУС «активні». Вибір навмисний — цей список
// поглинає «купували за два роки мінус активні» цілком і більшу частину
// «вся база мінус купували за рік», тому одна група закриває задум трьох.
// ⚠️ НЕ виключати «купували за рік»: людина, що пішла три місяці тому, формально
// в ньому, а це найцінніший сегмент (вікно реактивації 29–42 дні, findings 31.07).
//
// Атрибуція 7d click + 1d view — на вимогу власника. Пам'ятай при читанні
// результату: на реактивації частка view найвища в акаунті (74%, розрив CPA 3.8×).
// Чесний числник дає тільки звірка списку з CRM, не кабінет.
//
// Оптимізація OFFSITE_CONVERSIONS (Purchase), не VALUE: при очікуваних ~7
// клік-конверсіях на тиждень оптимізація на цінність сигналу не набере.
//
// Креативи переюзані з живих жовтневих: 0110_1 і 0110_3 (оффер «1 грн перший
// тиждень», лінк clubs/kyyiv/). Ролики 0110_video1/2 НЕ беремо — вони про
// відкриття клубу 144 на Харківському шосе, а список покриває всі 14 клубів Києва.
// url_tags у креативах на макросах, тому UTM самі підхоплять нові імена.
//
// Все PAUSED. Usage: node tools/build_winback_kyiv.js plan | build | verify
const path = require('path');
const G = require('./meta_guard');
const { apiGet, apiPost } = require('./meta_api');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;

const CAMP_NAME  = 'AI_Apollo_winback_Kyiv_1410';
const ADSET_NAME = 'churn_alltime_kyiv_18-65';
// Бюджет від частоти, не навпаки. delivery_estimate групи: 25 000–29 300 осіб
// (approximate_count аудиторії віддає заглушку 1000 — не вірити їй).
// При CPM $3.03 по Києву: $20/день = 6.8 показів на людину за 4 тижні, тобто
// та сама частота, що в живій conversion_Kyiv_oct_0110 (2.7 за 12 днів ≈ 6.3 за 28).
// $50/день дали б 17 показів на людину — це зона вичерпання аудиторії
// (findings: Житомир при 15.4/30 днів, CPA пішла вгору).
const DAILY      = 2000;                       // $20.00/день
const START      = '2026-10-14T00:01:00+0300';
const END        = '2026-11-10T23:59:00+0200'; // 4 тижні; 25.10 перехід на зимовий час

const AUD_CHURN  = '120251208387370193';       // Apollo · відвал за весь час · 05.10.26
const AUD_ACTIVE = '120251208539010193';       // Apollo · активні на 05.10.26
const REF_CAMP   = '120251010175330193';       // AI_Apollo_conversion_Kyiv_oct_0110 — еталон promoted_object

// Три оголошення, як у старій кампанії conversion_Kyiv_oct_0110.
// 0110_2 там на паузі, але за 01–13.10 витратило лише $49 і 0 клік-покупок —
// це «не участвовало», а не «проиграло» (findings 31.07: судити об'яву,
// що не набрала показів, не можна). У новій групі отримує рівний шанс.
const ADS = [
  { name: '0110_1', creative_id: '1554595159803148' },
  { name: '0110_2', creative_id: '1777480440189661' },
  { name: '0110_3', creative_id: '3150854848454557' },
];

const targeting = {
  age_min: 18, age_max: 65,
  geo_locations: { regions: [{ key: '4290', country: 'UA' }],
                   location_types: ['home', 'recent', 'frequently_in'] },
  custom_audiences: [{ id: AUD_CHURN }],
  excluded_custom_audiences: [{ id: AUD_ACTIVE }],
  targeting_automation: { advantage_audience: 0, individual_setting: { geo: 0 } },
  publisher_platforms: ['facebook', 'instagram', 'threads'],
  facebook_positions: ['feed', 'story', 'facebook_reels', 'right_hand_column', 'instream_video', 'marketplace'],
  instagram_positions: ['stream', 'story', 'reels', 'explore', 'explore_home', 'profile_feed'],
  threads_positions: ['threads_stream'],
  device_platforms: ['mobile', 'desktop'],
};

async function audiences() {
  const out = [];
  for (const [label, id] of [['відвал за весь час', AUD_CHURN], ['активні', AUD_ACTIVE]]) {
    const r = await apiGet(id, { fields: 'name,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status,operation_status' });
    if (r.error) throw new Error(`аудиторія ${label}: ${G.errMsg(r.error)}`);
    out.push({ label, id, name: r.name,
      size: r.approximate_count_lower_bound === r.approximate_count_upper_bound
        ? String(r.approximate_count_lower_bound)
        : `${r.approximate_count_lower_bound}–${r.approximate_count_upper_bound}`,
      delivery: r.delivery_status?.code, operation: r.operation_status?.code });
  }
  return out;
}

async function plan() {
  console.log(`\n📋 ${CAMP_NAME} → ${ADSET_NAME}\n`);
  for (const a of await audiences()) {
    const ok = a.delivery === 200 ? '✅' : '❌';
    const proc = a.operation === 200 ? 'оброблена' : '⏳ ще оновлюється (розмір — заглушка)';
    console.log(`  ${ok} ${a.label}: ${a.name}`);
    console.log(`     id ${a.id} · розмір ${a.size} · ${proc}`);
  }
  console.log(`\n  бюджет        $${(DAILY / 100).toFixed(2)}/день · ${START.slice(0, 10)} → ${END.slice(0, 10)}`);
  console.log(`  оптимізація   OFFSITE_CONVERSIONS / PURCHASE`);
  console.log(`  атрибуція     click 7d + view 1d`);
  console.log(`  гео           Kyiv region (4290), 18–65`);
  console.log(`  оголошення    ${ADS.map(a => a.name).join(', ')} (креативи переюзані)`);
  const po = await G.promotedObjectFrom((await firstAdset(REF_CAMP)).id);
  console.log(`  promoted_object ${JSON.stringify(po)}`);
}

async function firstAdset(campId) {
  const r = await apiGet(`${campId}/adsets`, { fields: 'id,name', limit: '5' });
  if (r.error || !r.data?.length) throw new Error(`еталонна кампанія ${campId}: груп не знайдено`);
  return r.data[0];
}

async function build() {
  const auds = await audiences();
  const bad = auds.filter(a => a.delivery !== 200);
  if (bad.length) throw new Error(`аудиторії не готові до використання: ${bad.map(a => a.label).join(', ')}`);
  for (const a of auds.filter(a => a.operation !== 200)) {
    console.log(`   ⚠️  «${a.label}» ще оновлюється — створюємо, але НЕ запускаємо до operation_status 200`);
  }

  const known = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '400' })).data || [];
  const prior = known.find(x => x.name === CAMP_NAME);
  const camp = prior || await G.createChecked(`${ACCT}/campaigns`, {
    name: CAMP_NAME, objective: 'OUTCOME_SALES', buying_type: 'AUCTION',
    special_ad_categories: JSON.stringify([]),
    is_adset_budget_sharing_enabled: 'false', status: 'PAUSED',
  }, `campaign ${CAMP_NAME}`);
  console.log(`\n📁 ${CAMP_NAME} — ${camp.id}${prior ? ' (наявна)' : ''}`);

  const liveSets = (await apiGet(`${camp.id}/adsets`, { fields: 'id,name,daily_budget', limit: '20' })).data || [];
  const existing = liveSets.find(x => x.name === ADSET_NAME);
  if (existing && String(existing.daily_budget) !== String(DAILY)) {
    const up = await apiPost(existing.id, { daily_budget: String(DAILY) });
    if (up.error) throw new Error(`бюджет групи: ${G.errMsg(up.error)}`);
    console.log(`  💰 бюджет $${(existing.daily_budget / 100).toFixed(2)} → $${(DAILY / 100).toFixed(2)}/д`);
  }
  const adset = existing || await G.createAdSet({
    name: ADSET_NAME, campaign_id: camp.id,
    optimization_goal: 'OFFSITE_CONVERSIONS',
    promoted_object: await G.promotedObjectFrom((await firstAdset(REF_CAMP)).id),
    attribution_spec: JSON.stringify([
      { event_type: 'CLICK_THROUGH', window_days: 7 },
      { event_type: 'VIEW_THROUGH',  window_days: 1 },
    ]),
    billing_event: 'IMPRESSIONS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    daily_budget: String(DAILY), targeting,
    start_time: START, end_time: END,
  });
  console.log(`  📂 ${ADSET_NAME} — ${adset.id} | $${(DAILY / 100).toFixed(2)}/д`);

  const liveAds = (await apiGet(`${adset.id}/ads`, { fields: 'id,name', limit: '20' })).data || [];
  for (const a of ADS) {
    if (liveAds.find(x => x.name === a.name)) { console.log(`     ⏭  ${a.name} вже є`); continue; }
    const ad = await G.createAd({ name: a.name, adset_id: adset.id, creative: { creative_id: a.creative_id } });
    console.log(`     ✅ ${a.name} — ${ad.id}`);
  }
  await verify();
}

async function verify() {
  const known = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '400' })).data || [];
  const camp = known.find(x => x.name === CAMP_NAME);
  if (!camp) { console.log('кампанії ще немає'); return; }
  const s = await apiGet(`${camp.id}/adsets`, {
    fields: 'id,name,status,daily_budget,optimization_goal,attribution_spec,promoted_object,start_time,end_time,targeting',
    limit: '10' });
  console.log(`\n🔍 Звірка ${CAMP_NAME}`);
  for (const a of (s.data || [])) {
    const t = a.targeting || {};
    console.log(`  ${a.name} [${a.status}] $${(a.daily_budget / 100).toFixed(2)}/д · ${a.optimization_goal}`);
    console.log(`     attribution: ${JSON.stringify(a.attribution_spec)}`);
    console.log(`     promoted:    ${JSON.stringify(a.promoted_object)}`);
    console.log(`     вкл:  ${(t.custom_audiences || []).map(x => x.name || x.id).join(', ') || '—'}`);
    console.log(`     искл: ${(t.excluded_custom_audiences || []).map(x => x.name || x.id).join(', ') || '—'}`);
    console.log(`     гео:  ${(t.geo_locations?.regions || []).map(r => r.name).join(',')} · ${t.age_min}-${t.age_max}`);
    const ads = await apiGet(`${a.id}/ads`, { fields: 'name,status,creative{id}', limit: '20' });
    for (const ad of (ads.data || [])) console.log(`     • ${ad.name} [${ad.status}] creative ${ad.creative?.id}`);
  }
}

const cmd = process.argv[2] || 'plan';
({ plan, build, verify })[cmd]?.().catch(e => { console.error('\n❌', e.message); process.exit(1); })
  || (!['plan', 'build', 'verify'].includes(cmd) && console.error('usage: plan | build | verify'));
