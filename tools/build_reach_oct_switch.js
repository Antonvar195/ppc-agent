// Реалізація docs/TZ_reach_oct_switch.md (коміт 94b506d).
//
// Чотири міста переходять із конверсій в охоплення: Київ, Житомир, Бориспіль,
// Біла Церква. Одна кампанія = одне місто = одна група.
//
// Креативи переиспользуються з зупинених конверсійних кампаній тих самих міст
// (ID з ТЗ, звірені з акаунтом). Київське оголошення 0110_2 свідомо не беремо —
// воно на паузі в джерелі.
//
// Усе створюється PAUSED. Крок 5 ТЗ (зупинити конверсійні + увімкнути охватні
// одним рухом) НЕ виконується: за правилом проєкту публікація лише після
// явного «запускай».
//
// Usage: node tools/build_reach_oct_switch.js plan | build | verify
const fs = require('fs');
const path = require('path');
const G = require('./meta_guard');
const { apiGet, apiPost } = require('./meta_api');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const START = '2026-10-09T00:01:00+0300';
const END   = '2026-10-31T23:59:00+0200';   // 23 дні, як у розрахунку ТЗ
const FREQ_CAP = [{ event: 'IMPRESSIONS', interval_days: 30, max_frequency: 8 }];

const CITIES = [
  { city: 'Kyiv', campaign: 'AI_Apollo_reach_Kyiv_oct_0910', adset: 'Kyiv_18-34_reach',
    age: [18, 34], budget: 10530, pause: '120251010175330193',
    geo: { regions: [{ key: '4290', name: 'Kyiv', country: 'UA' }], location_types: ['home', 'recent'] },
    creatives: [['0910_1', '1554595159803148'], ['0910_2', '3150854848454557']] },
  { city: 'Zhytomyr', campaign: 'AI_Apollo_reach_Zhytomyr_oct_0910', adset: 'Zhytomyr_18-65_reach',
    age: [18, 65], budget: 870, pause: '120251010188800193',
    geo: { cities: [{ country: 'UA', distance_unit: 'mile', key: '2401072', name: 'Zhytomyr', region: 'Zhytomyr Oblast', region_id: '3804' }], location_types: ['home', 'recent'] },
    creatives: [['0910_1', '1893698414963082'], ['0910_2', '1068791656153922'], ['0910_3', '2838434516619123']] },
  { city: 'Boryspil', campaign: 'AI_Apollo_reach_Boryspil_oct_0910', adset: 'Boryspil_18-65_reach',
    age: [18, 65], budget: 748, pause: '120251010201300193',
    geo: { cities: [{ country: 'UA', distance_unit: 'mile', key: '2364576', name: 'Boryspil', region: 'Kiev Oblast', region_id: '3790' }], location_types: ['home', 'recent'] },
    creatives: [['0910_1', '1096862719597222'], ['0910_2', '4840826972909186'], ['0910_3', '1078069221776988']] },
  { city: 'BilaTserkva', campaign: 'AI_Apollo_reach_BilaTserkva_oct_0910', adset: 'BilaTserkva_18-65_reach',
    age: [18, 65], budget: 543, pause: '120251010212040193',
    geo: { cities: [{ country: 'UA', distance_unit: 'mile', key: '2363654', name: 'Bila Tserkva', region: 'Kiev Oblast', region_id: '3790' }], location_types: ['home', 'recent'] },
    creatives: [['0910_1', '1065658796507041'], ['0910_2', '2026042948100978'], ['0910_3', '1112358071486423']] },
];

const targeting = c => ({
  age_min: c.age[0], age_max: c.age[1],
  geo_locations: c.geo,
  targeting_automation: { advantage_audience: 0, individual_setting: { geo: 0 } },
  publisher_platforms: ['facebook', 'instagram', 'threads'],
});

function plan() {
  console.log('\nТЗ reach_oct_switch — 4 кампанії, старт 09.10, кінець 31.10\n');
  let total = 0;
  for (const c of CITIES) {
    total += c.budget;
    console.log(`📁 ${c.campaign}`);
    console.log(`   📂 ${c.adset.padEnd(26)} $${(c.budget / 100).toFixed(2)}/д · ${c.age[0]}-${c.age[1]} · ×23 дні = $${(c.budget / 100 * 23).toFixed(0)}`);
    c.creatives.forEach(([n, id]) => console.log(`        ${n} — creative ${id}`));
  }
  console.log(`\nразом $${(total / 100).toFixed(2)}/день · $${(total / 100 * 23).toFixed(0)} до 31.10`);
  console.log('\nна зупинку (окремим кроком, після твого слова):');
  CITIES.forEach(c => console.log(`   ⏸  ${c.pause}  AI_Apollo_conversion_${c.city}_oct_0110`));
  console.log('\n(plan — нічого не створено)');
}

// п.3.2 ТЗ: перевірити, чи приймається ліміт частоти разом з IMPRESSIONS
async function probeFreqCap(c, campaignId) {
  const base = {
    name: c.adset, campaign_id: campaignId,
    optimization_goal: 'IMPRESSIONS', billing_event: 'IMPRESSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    daily_budget: String(c.budget),
    targeting: JSON.stringify(targeting(c)),
    start_time: START, end_time: END, status: 'PAUSED',
  };
  const withCap = await apiPost(`${ACCT}/adsets`, { ...base, frequency_control_specs: JSON.stringify(FREQ_CAP), execution_options: JSON.stringify(['validate_only']) });
  if (!withCap.error) return { cap: true, base };
  const why = G.errMsg(withCap.error);
  const plain = await apiPost(`${ACCT}/adsets`, { ...base, execution_options: JSON.stringify(['validate_only']) });
  if (plain.error) throw new Error(`${c.city}: без ліміту теж не проходить — ${G.errMsg(plain.error)}`);
  return { cap: false, base, why };
}

async function build() {
  const known = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '400' })).data || [];
  const report = [];
  let capVerdict = null;

  for (const c of CITIES) {
    const prior = known.find(x => x.name === c.campaign);
    const camp = prior || await G.createChecked(`${ACCT}/campaigns`, {
      name: c.campaign, objective: 'OUTCOME_AWARENESS', buying_type: 'AUCTION',
      special_ad_categories: JSON.stringify([]), is_adset_budget_sharing_enabled: 'false',
      status: 'PAUSED',
    }, 'campaign ' + c.campaign);
    console.log(`\n📁 ${c.campaign} — ${camp.id}${prior ? ' (наявна)' : ''}`);

    const live = (await apiGet(`${camp.id}/adsets`, { fields: 'id,name', limit: '10' })).data || [];
    let adset = live.find(x => x.name === c.adset);
    if (!adset) {
      const probe = await probeFreqCap(c, camp.id);
      if (capVerdict === null) {
        capVerdict = probe.cap;
        console.log(probe.cap
          ? '   🔎 ліміт частоти 8/30дн ПРИЙМАЄТЬСЯ разом з IMPRESSIONS'
          : `   🔎 ліміт частоти ВІДХИЛЕНО: ${probe.why}\n      → створюю без нього, IMPRESSIONS лишається (як велить ТЗ)`);
      }
      const payload = probe.cap ? { ...probe.base, frequency_control_specs: JSON.stringify(FREQ_CAP) } : probe.base;
      delete payload.status;
      adset = await G.createAdSet(payload);
    }
    console.log(`  📂 ${c.adset.padEnd(26)} ${adset.id} | $${(c.budget / 100).toFixed(2)}/д | ${c.age[0]}-${c.age[1]}`);

    const liveAds = (await apiGet(`${adset.id}/ads`, { fields: 'id,name', limit: '20' })).data || [];
    const made = [];
    for (const [nm, cid] of c.creatives) {
      const had = liveAds.find(x => x.name === nm);
      if (had) { console.log(`     ⏭  ${nm} вже є`); made.push({ id: had.id, name: nm, creativeId: cid }); continue; }
      const ad = await G.createAd({ name: nm, adset_id: adset.id, creative: { creative_id: cid } });
      console.log(`     ✅ ${nm} — ${ad.id} (creative ${cid})`);
      made.push({ id: ad.id, name: nm, creativeId: cid });
    }
    report.push({ city: c.city, campaign: c.campaign, campaignId: camp.id, adsetId: adset.id, ads: made, budget: c.budget, pause: c.pause });
  }

  console.log('\n🔍 Звірка:');
  for (const r of report) {
    const a = await apiGet(r.adsetId, { fields: 'optimization_goal,billing_event,promoted_object,attribution_spec,frequency_control_specs,daily_budget,targeting,status,start_time,end_time' });
    const t = a.targeting;
    const ok = a.optimization_goal === 'IMPRESSIONS' && a.billing_event === 'IMPRESSIONS'
      && !a.promoted_object && !a.attribution_spec
      && +a.daily_budget === r.budget && a.status === 'PAUSED'
      && !(t.geo_locations.location_types || []).includes('frequently_in')
      && t.targeting_automation.advantage_audience === 0;
    const first = r.ads[0];
    const p = await G.checkPreviews(first.id, ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY']);
    console.log(`   ${ok && p.ok ? '✅' : '❌'} ${r.city.padEnd(14)} ${t.age_min}-${t.age_max} $${(+a.daily_budget / 100).toFixed(2)}/д  ${a.optimization_goal}  ліміт:${a.frequency_control_specs ? 'є' : 'нема'}  promoted:${a.promoted_object ? 'Є!' : 'нема'}  прев'ю ${p.INSTAGRAM_STANDARD}/${p.INSTAGRAM_STORY}`);
  }

  console.log('\n📋 ID для config/units.yaml (п.4 ТЗ):');
  report.forEach(r => console.log(`   ${r.campaign}  ${r.campaignId}`));

  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  hist.push({ date: '2026-10-08', campaigns: report.map(r => r.campaign),
    note: `ТЗ TZ_reach_oct_switch.md (94b506d): Київ/Житомир/Бориспіль/БЦ з конверсій в охоплення. IMPRESSIONS, ліміт частоти ${capVerdict ? 'поставлено' : 'відхилено Meta — створено без нього'}. Креативи переиспользовані з конверсійних. Все PAUSED, конверсійні НЕ зупинені.` });
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));

  console.log(`\n✅ Створено, все PAUSED. Конверсійні кампанії НЕ зупинені — крок 5 ТЗ за твоїм словом.`);
  return capVerdict;
}

async function verify() {
  const known = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '400' })).data || [];
  let tot = 0;
  console.log('\n📊 Нові охватні:');
  for (const c of CITIES) {
    const camp = known.find(x => x.name === c.campaign);
    if (!camp) { console.log(`   ❌ нема ${c.campaign}`); continue; }
    const s = (await apiGet(`${camp.id}/adsets`, { fields: 'name,status,daily_budget,optimization_goal,targeting', limit: '5' })).data || [];
    for (const a of s) {
      tot += +a.daily_budget;
      const ads = (await apiGet(`${camp.id}/ads`, { fields: 'id', limit: '20' })).data || [];
      console.log(`   ${c.city.padEnd(14)} $${String((+a.daily_budget / 100).toFixed(2)).padStart(6)}/д  ${a.targeting.age_min}-${a.targeting.age_max}  ${a.status.padEnd(7)} ${a.optimization_goal}  оголош. ${ads.length}`);
    }
  }
  console.log(`   ${''.padEnd(14)} ─────────`);
  console.log(`   ${'разом'.padEnd(14)} $${(tot / 100).toFixed(2)}/д  ×23 дні = $${(tot / 100 * 23).toFixed(0)}`);
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'build') await build();
  else if (cmd === 'verify') await verify();
  else plan();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
