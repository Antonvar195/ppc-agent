// Пресейлові кампанії 041 не мають дати завершення і після відкриття 13.08
// крутили б «скоро відкриття» паралельно з новою. Ставимо end_time рівно на
// момент відкриття — вони зупиняються самі, коли стартує AI_Apollo_sales_ZHY_041_1308.
// Usage: node tools/stop_041_presale.js plan | apply
const path = require('path');
const { apiGet, apiPost } = require('./meta_api');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const END_TIME = '2026-08-13T00:01:00+0300';
const CAMPAIGNS = [
  { id: '120249411371570193', name: 'AI_Apollo_sales_ZHY_041_1107' },
  { id: '120249681412190193', name: 'AI_Apollo_sales_ZHY_041_2107' },
];

async function run(apply) {
  for (const c of CAMPAIGNS) {
    const r = await apiGet(`${c.id}/adsets`, { fields: 'id,name,status,daily_budget,end_time', limit: 50 });
    if (r.error) throw new Error(`${c.name}: ${r.error.message}`);
    console.log(`\n═══ ${c.name}`);
    for (const a of r.data) {
      if (a.status !== 'ACTIVE') { console.log(`   ↷ ${a.name} — ${a.status}, пропускаю`); continue; }
      if (a.end_time) { console.log(`   ↷ ${a.name} — end_time вже ${a.end_time}`); continue; }
      if (!apply) { console.log(`   → ${a.name} ($${a.daily_budget / 100}/д): поставлю end_time ${END_TIME}`); continue; }
      const res = await apiPost(a.id, { end_time: END_TIME });
      if (res.error) console.log(`   ❌ ${a.name}: ${res.error.error_user_msg || res.error.message}`);
      else console.log(`   ✅ ${a.name} — end_time ${END_TIME}`);
    }
  }
  if (!apply) console.log('\n(plan — нічого не змінено)');
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'plan') await run(false);
  else if (cmd === 'apply') await run(true);
  else console.log('cmd: plan | apply');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
