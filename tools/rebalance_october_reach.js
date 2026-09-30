// Перерозподіл охватних бюджетів жовтня під однакову частоту по містах.
//
// Загальна сума ($8 471,95/міс) не змінюється — рухається тільки її розподіл.
// Формула: бюджет_міста = F × досяжне_охоплення × CPM / 1000, де F однакове
// для всіх. При повному освоєнні плану F виходить ≈7.15.
//
// Досяжне охоплення = аудиторія × 0.85 (насичення за місяць).
// CPM — факт вересневих охватних, не оцінка.
//
// Чому не рівно 8: щоб отримати 8 у Львові при широкій 18-65, потрібно
// $4 638 — разом по містах вийшло б $9 485 проти наявних $8 472.
//
// Usage: node tools/rebalance_october_reach.js plan | apply
const path = require('path');
const G = require('./meta_guard');
const { apiGet, apiPost } = require('./meta_api');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DAYS = 31;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// місто, аудиторія (18-65, FB+IG+Threads), CPM факт вересня, бюджет плану $/міс
const CITIES = [
  { city: 'Lviv',           aud: 2200000, cpm: 0.31, planned: 2890.58 },
  { city: 'Odessa',         aud: 1300000, cpm: 0.32, planned: 2636.00 },
  { city: 'IvanoFrankivsk', aud:  347800, cpm: 0.35, planned: 1556.47 },
  { city: 'Vinnytsia',      aud:  515200, cpm: 0.34, planned: 1388.90 },
];
const SAT = 0.85;

function compute() {
  const total = CITIES.reduce((s, c) => s + c.planned, 0);
  const k = CITIES.reduce((s, c) => s + c.aud * SAT * c.cpm / 1000, 0);
  const F = total / k;
  return CITIES.map(c => {
    const monthly = F * c.aud * SAT * c.cpm / 1000;
    return { ...c, monthly, daily: Math.round(monthly / DAYS * 100),
             freqBefore: (c.planned / c.cpm * 1000) / (c.aud * SAT), freq: F };
  });
}

async function adsets() {
  const camps = (await apiGet(`${process.env.META_AD_ACCOUNT_ID}/campaigns`, { fields: 'id,name', limit: '400' })).data || [];
  const out = {};
  for (const c of CITIES) {
    const camp = camps.find(x => x.name === `AI_Apollo_reach_${c.city}_oct_0110`);
    if (!camp) throw new Error('нема кампанії для ' + c.city);
    const s = (await apiGet(`${camp.id}/adsets`, { fields: 'id,name,daily_budget', limit: '5' })).data || [];
    if (!s.length) throw new Error('нема групи в ' + c.city);
    out[c.city] = s[0];
  }
  return out;
}

async function plan() {
  const rows = compute();
  const sets = await adsets();
  console.log(`\nПерерозподіл охватних (частота вирівнюється на ${rows[0].freq.toFixed(2)})\n`);
  console.log('місто'.padEnd(17), 'зараз/д'.padStart(9), 'стане/д'.padStart(9), 'на місяць'.padStart(10), 'частота'.padStart(11));
  let now = 0, next = 0;
  for (const r of rows) {
    const cur = +sets[r.city].daily_budget;
    now += cur; next += r.daily;
    console.log(r.city.padEnd(17), ('$' + (cur / 100).toFixed(2)).padStart(9), ('$' + (r.daily / 100).toFixed(2)).padStart(9),
      ('$' + r.monthly.toFixed(0)).padStart(10), (r.freqBefore.toFixed(1) + ' → ' + r.freq.toFixed(1)).padStart(11));
  }
  console.log(''.padEnd(17), ('$' + (now / 100).toFixed(2)).padStart(9), ('$' + (next / 100).toFixed(2)).padStart(9),
    ('$' + (next / 100 * DAYS).toFixed(0)).padStart(10));
  console.log('\n(plan — нічого не змінено)');
}

async function apply() {
  const rows = compute();
  const sets = await adsets();
  console.log('\n↻ Перерозподіляю…\n');
  for (const r of rows) {
    const id = sets[r.city].id, cur = +sets[r.city].daily_budget;
    if (cur === r.daily) { console.log(`   ⏭  ${r.city.padEnd(17)} вже $${(r.daily / 100).toFixed(2)}`); continue; }
    let res = await apiPost(id, { daily_budget: String(r.daily) });
    for (let i = 1; res.error && res.error.error_subcode === 4841018 && i <= 5; i++) {
      console.log(`      ⏳ rate limit, повтор ${i}/5…`); await sleep(35000);
      res = await apiPost(id, { daily_budget: String(r.daily) });
    }
    if (res.error) throw new Error(`${r.city}: ${G.errMsg(res.error)}`);
    console.log(`   ✅ ${r.city.padEnd(17)} $${(cur / 100).toFixed(2)} → $${(r.daily / 100).toFixed(2)}/д`);
    await sleep(1500);
  }
  console.log('\nпідсумок:');
  const after = await adsets();
  let sum = 0;
  for (const r of rows) {
    const b = +after[r.city].daily_budget; sum += b;
    console.log(`   ${b === r.daily ? '✅' : '❌'} ${r.city.padEnd(17)} $${(b / 100).toFixed(2)}/д`);
  }
  console.log(`   ${''.padEnd(17)} ─────────`);
  console.log(`   ${'охоплення'.padEnd(17)} $${(sum / 100).toFixed(2)}/д ≈ $${(sum / 100 * DAYS).toFixed(0)}/міс`);
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'apply') await apply();
  else await plan();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
