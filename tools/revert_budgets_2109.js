// Повернення бюджетів, зрізаних 21.09.2026 о 12:46 (Viktoriia Varvarynets).
//
// Значення взяті з журналу змін акаунта (/activities, update_ad_set_budget):
// у кожної групи була рівно ОДНА зміна, тож «як було» однозначне.
//
// Usage: node tools/revert_budgets_2109.js plan | apply | verify
const path = require('path');
const G = require('./meta_guard');
const { apiGet, apiPost } = require('./meta_api');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const sleep = ms => new Promise(r => setTimeout(r, ms));

// id, назва, кампанія, було (центи), стало вчора (центи)
const CHANGES = [
  ['120250589959620193', 'advantage_18-65',               '50off', 5000, 2500],
  ['120250589962210193', 'broad_18-55_inst_treads',       '50off', 5000, 2500],
  ['120250589957810193', 'rem_30d_18-55_inst_treads',     '50off', 1900,  800],
  ['120250589954550193', 'cancelled+engagement_365_inst', '50off', 1600,  800],
  ['120250712413950193', 'local_kyiv_segment_1',          '144',   1000,  500],
  ['120250712426470193', 'local_kyiv_segment_2',          '144',   4000, 2000],
  ['120250712431850193', 'advantage_kyiv_segment_1',      '144',   1000,  500],
  ['120250712439850193', 'advantage_kyiv_segment_2',      '144',   4000, 2000],
];

async function plan() {
  console.log('\nПовернення бюджетів до стану до 21.09 12:46\n');
  let from = 0, to = 0, drift = 0;
  for (const [id, nm, camp, was, cut] of CHANGES) {
    const a = await apiGet(id, { fields: 'name,daily_budget,effective_status' });
    const cur = +a.daily_budget;
    from += cur; to += was;
    const warn = cur !== cut ? `  ⚠️ зараз $${cur / 100}, а не $${cut / 100} — хтось правив ще раз` : '';
    if (cur !== cut) drift++;
    console.log(`   ${nm.padEnd(32)} [${camp}]  $${String(cur / 100).padStart(3)} → $${String(was / 100).padStart(3)}   ${a.effective_status}${warn}`);
  }
  console.log(`\n   разом: $${from / 100}/д → $${to / 100}/д  (+$${(to - from) / 100}/д)`);
  if (drift) console.log(`\n   ⚠️ ${drift} груп(и) зараз не в тому стані, який записав журнал — звір перед apply.`);
  console.log('\n(plan — нічого не змінено)');
}

async function apply() {
  console.log('\n↩️  Повертаю бюджети…\n');
  const done = [];
  for (const [id, nm, camp, was, cut] of CHANGES) {
    const a = await apiGet(id, { fields: 'daily_budget' });
    const cur = +a.daily_budget;
    if (cur === was) { console.log(`   ⏭  ${nm.padEnd(32)} вже $${was / 100}`); continue; }
    if (cur !== cut) console.log(`   ⚠️  ${nm}: очікував $${cut / 100}, знайшов $${cur / 100} — усе одно ставлю $${was / 100}`);

    let res = await apiPost(id, { daily_budget: String(was) });
    for (let i = 1; res.error && res.error.error_subcode === 4841018 && i <= 4; i++) {
      console.log(`   ⏳ rate limit на ${nm}, повтор ${i}/4 через 35 с…`);
      await sleep(35000);
      res = await apiPost(id, { daily_budget: String(was) });
    }
    if (res.error) throw new Error(`${nm}: ${G.errMsg(res.error)}`);
    console.log(`   ✅ ${nm.padEnd(32)} $${cur / 100} → $${was / 100}`);
    done.push(nm);
    await sleep(1500);
  }
  console.log(`\nзмінено груп: ${done.length}`);
  await verify();
}

async function verify() {
  console.log('\n📊 Стан після повернення:');
  const camps = {};
  for (const [id, nm, camp, was] of CHANGES) {
    const a = await apiGet(id, { fields: 'name,daily_budget,effective_status' });
    const cur = +a.daily_budget;
    camps[camp] = (camps[camp] || 0) + cur;
    console.log(`   ${cur === was ? '✅' : '❌'} ${nm.padEnd(32)} $${cur / 100}/д  ${a.effective_status}`);
  }
  console.log();
  for (const [c, sum] of Object.entries(camps)) console.log(`   ${c}: змінені групи разом $${sum / 100}/д`);
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'apply') await apply();
  else if (cmd === 'verify') await verify();
  else await plan();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
