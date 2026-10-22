const { apiGet, apiPost } = require('/Users/antonvarvarinec/projects/apollo/ppc-agent/tools/meta_api');
const G = require('/Users/antonvarvarinec/projects/apollo/ppc-agent/tools/meta_guard');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TARGET = ['local_video', 'local_banner', 'engagement'];   // advantage не чіпаємо

(async () => {
  const all = (await apiGet(process.env.META_AD_ACCOUNT_ID + '/campaigns', { fields: 'id,name', limit: '400' })).data || [];
  const c = all.find(x => x.name === 'AI_Apollo_sales_Kyiv_144_open_2210');
  const sets = (await apiGet(`${c.id}/adsets`, { fields: 'id,name,targeting', limit: '20' })).data || [];

  console.log('до зміни:');
  for (const a of sets) console.log('  ', a.name.padEnd(18), JSON.stringify(a.targeting.publisher_platforms || 'авто'));

  console.log('\nзмінюю (тільки не-advantage):');
  for (const nm of TARGET) {
    const a = sets.find(x => x.name === nm);
    const t = JSON.parse(JSON.stringify(a.targeting));
    t.publisher_platforms = ['instagram', 'threads'];
    delete t.facebook_positions;
    t.instagram_positions = ['stream', 'story', 'reels', 'explore', 'explore_home', 'profile_feed'];
    t.threads_positions = ['threads_stream'];

    const chk = await apiPost(a.id, { targeting: JSON.stringify(t), execution_options: JSON.stringify(['validate_only']) });
    if (chk.error) throw new Error(`${nm} (перевірка): ${G.errMsg(chk.error)}`);
    console.log(`   ⏳ ${nm}: перевірка ок, пауза 35 с перед записом…`);
    await sleep(35000);

    let r = await apiPost(a.id, { targeting: JSON.stringify(t) });
    for (let i = 1; r.error && r.error.error_subcode === 4841018 && i <= 4; i++) {
      console.log(`      ⏳ rate limit, повтор ${i}/4…`); await sleep(35000);
      r = await apiPost(a.id, { targeting: JSON.stringify(t) });
    }
    if (r.error) throw new Error(`${nm}: ${G.errMsg(r.error)}`);
    console.log(`   ✅ ${nm}`);
  }

  await sleep(5000);
  console.log('\nпісля зміни:');
  const after = (await apiGet(`${c.id}/adsets`, { fields: 'id,name,status,targeting', limit: '20' })).data || [];
  let bad = 0;
  for (const a of after) {
    const t = a.targeting, p = t.publisher_platforms;
    const isAdv = t.targeting_automation.advantage_audience === 1;
    const ok = isAdv ? !p : (JSON.stringify([...(p || [])].sort()) === JSON.stringify(['instagram', 'threads']));
    if (!ok) bad++;
    console.log(`   ${ok ? '✅' : '❌'} ${a.name.padEnd(18)} ${isAdv ? 'advantage (авто-плейсменти)' : JSON.stringify(p)}  ${a.status}`);
  }
  console.log(bad ? `\n❌ ${bad} груп не в очікуваному стані` : '\n✅ усі групи як треба');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
