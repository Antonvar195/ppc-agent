// Restructure AI_Apollo_sales_ZHY_041_2107 (120249681412190193):
//  (A) advantage/local segment groups -> 3 banners each (like rem/lookalike):
//       segment_1 -> club1,club2,club3 ; segment_2 -> map,people_athlete,people_couple
//       (delete their single video ad)
//  (B) create duplicate groups with 1 video each, "video" instead of "segment":
//       advantage_ZHY_video_1/2, local_ZHY_video_1/2
// Reuses the creatives already uploaded in the v2 build. All new ads PAUSED.
// Usage: node tools/fix_zhy_v2_structure.js run
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { apiPost } = require('./meta_api');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const TOKEN = process.env.META_ACCESS_TOKEN;
const PIXEL_ID = '393751978682816';
const NEW_CAMPAIGN = '120249681412190193';
const START_TIME = new Date(Date.now() + 5 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, '+0000');

// creatives already uploaded (from build_zhy_v2)
const VIDEO_CR = '1367802475411346';
const BANNER_CR = {
  club1: '1002788802734891', club2: '1572853511146612', club3: '2527748900996224',
  map: '1768869304528780', people_athlete: '1970977966916739', people_couple: '1093831223309577',
};
const SEG1 = ['club1', 'club2', 'club3'];
const SEG2 = ['map', 'people_athlete', 'people_couple'];

// existing advantage/local segment groups -> add banners + delete this video ad
const SEG_GROUPS = [
  { name: 'advantage_ZHY_segment_1', id: '120249681414800193', video_ad: '120249681415790193', sets: SEG1 },
  { name: 'advantage_ZHY_segment_2', id: '120249681415980193', video_ad: '120249681416420193', sets: SEG2 },
  { name: 'local_ZHY_segment_1', id: '120249681416670193', video_ad: '120249681417550193', sets: SEG1 },
  { name: 'local_ZHY_segment_2', id: '120249681417910193', video_ad: '120249681418730193', sets: SEG2 },
];
// video-dup groups (name = source with 'video' instead of 'segment')
const VIDEO_DUPS = ['advantage_ZHY_segment_1', 'advantage_ZHY_segment_2', 'local_ZHY_segment_1', 'local_ZHY_segment_2'];

const SRC = JSON.parse(fs.readFileSync(path.join(__dirname, '../history/zhy_v2_src_adsets.json'), 'utf8')).data;

function cleanTargeting(src) {
  const t = JSON.parse(JSON.stringify(src));
  for (const k of ['brand_safety_content_filter_levels', 'age_range', 'targeting_relaxation_types', 'targeting_optimization']) delete t[k];
  if (t.instagram_positions) {
    const ig = [...t.instagram_positions];
    if (ig.includes('explore_home') && !ig.includes('explore')) ig.push('explore');
    t.instagram_positions = ig;
  }
  if (t.custom_audiences) t.custom_audiences = t.custom_audiences.map(a => ({ id: a.id }));
  if (t.excluded_custom_audiences) t.excluded_custom_audiences = t.excluded_custom_audiences.map(a => ({ id: a.id }));
  const ta = t.targeting_automation || {};
  if (ta.advantage_audience === undefined) ta.advantage_audience = 0;
  t.targeting_automation = ta;
  return t;
}
async function createAdset(name, src) {
  const r = await apiPost(`${ACCT}/adsets`, {
    name, campaign_id: NEW_CAMPAIGN,
    optimization_goal: src.optimization_goal, billing_event: src.billing_event, bid_strategy: src.bid_strategy,
    daily_budget: String(src.daily_budget),
    promoted_object: JSON.stringify(src.promoted_object || { pixel_id: PIXEL_ID, custom_event_type: 'PURCHASE' }),
    attribution_spec: JSON.stringify(src.attribution_spec || [{ event_type: 'CLICK_THROUGH', window_days: 7 }, { event_type: 'VIEW_THROUGH', window_days: 1 }]),
    targeting: JSON.stringify(cleanTargeting(src.targeting)),
    start_time: START_TIME, status: 'PAUSED',
  });
  if (r.error) throw new Error(`adset "${name}": ${r.error.error_user_msg || r.error.message}`);
  return r.id;
}
async function createAd(adsetId, name, creativeId) {
  const r = await apiPost(`${ACCT}/ads`, { name, adset_id: adsetId, creative: JSON.stringify({ creative_id: creativeId }), status: 'PAUSED' });
  if (r.error) throw new Error(`ad "${name}": ${r.error.error_user_msg || r.error.message}`);
  return r.id;
}
const del = node => spawnSync('curl', ['-s', '-X', 'DELETE', `https://graph.facebook.com/v21.0/${node}?access_token=${TOKEN}`]).stdout.toString();

async function run() {
  // (A) add banners to advantage/local segment groups, delete their video ad
  console.log('=== (A) advantage/local segment groups -> 3 banners each ===');
  for (const g of SEG_GROUPS) {
    for (const s of g.sets) await createAd(g.id, `2107_${s}`, BANNER_CR[s]);
    const r = del(g.video_ad);
    console.log(`  📂 ${g.name}: +[${g.sets.join(', ')}] banners | deleted video ad ${g.video_ad}: ${r}`);
  }
  // (B) create video-dup groups with 1 video ad
  console.log('=== (B) video-dup groups (video instead of segment) ===');
  for (const srcName of VIDEO_DUPS) {
    const src = SRC.find(s => s.name === srcName);
    const name = srcName.replace('segment', 'video');
    const asId = await createAdset(name, src);
    await createAd(asId, '2107_zhy_girl', VIDEO_CR);
    console.log(`  📂 ${name}: ${asId} | budget $${src.daily_budget / 100} | 1 video | PAUSED`);
  }
  console.log('\n✅ DONE.');
}

const cmd = process.argv[2];
(async () => { if (cmd === 'run') await run(); else console.log('cmd: run'); })().catch(e => { console.error('❌', e.message); process.exit(1); });
