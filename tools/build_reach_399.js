// August reach campaign, 399 price tier: AI_Apollo_reach_399_0108.
// Cities: Odessa, Bila Tserkva, Boryspil, Ivano-Frankivsk.
// Per city x per video (AP_01/02/03) = a separate group; one adaptive video ad
// per group (vertical->story/reels, feed->square/horizontal), unique text per
// video. OUTCOME_AWARENESS/REACH, IG+Threads 18-55. All PAUSED, start 01.08.
// Usage: node tools/build_reach_399.js test | build
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { spawnSync } = require('child_process');
const { apiGet, apiPost } = require('./meta_api');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const TOKEN = process.env.META_ACCESS_TOKEN;
const PAGE_ID = '107996248132865';
const IG_ID = '17841447539432480';
const START_TIME = '2026-08-01T00:01:00+0300';
const NEW_CAMP_NAME = 'AI_Apollo_reach_399_0108';
const LINK = 'https://apollo.online/clubs/';
const CTA = 'LEARN_MORE';
const URL_TAGS = 'utm_source=facebook&utm_medium=reach&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';
const DL = path.join(process.env.HOME, 'Downloads');
const TMP = '/private/tmp/claude-501/-Users-antonvarvarinec/d4d222cf-ece4-494e-a13d-9a8c8484107d/scratchpad';

const OFFER = '\n\n🎁 Рік спорту — 399 ₴ кожні 4 тижні. Фіксуй ціну на рік. Акція діє з 01.08 до 31.08.2026.';
const VIDEOS = [
  { key: 'AP01', story: 'AP_01_9x16_300826.mp4', feed: 'AP_01_16x9_300826.mp4',
    headline: 'Тут ти — просто ти',
    body: 'Співробітник. Батько. Водій. За день ти встигаєш побути всіма — окрім себе.\n\nAPOLLO NEXT — простір, де можна зняти всі ролі. Тут ти нікому нічого не винен: лише рух, лише дихання, лише ти.\n#титвоямета' + OFFER },
  { key: 'AP02', story: 'AP_02_9x16_290826.mp4', feed: 'AP_02_16x9_290826.mp4',
    headline: 'Своє знайде кожен',
    body: 'Думаєш, групові — не твоє?\n\nЙога, памп, функціонал, розтяжка, танцювальні — в APOLLO NEXT десятки форматів. Один із них точно твій. Заходь і знайди своє.\n#титвоямета' + OFFER },
  { key: 'AP03', story: 'AP_03_9x16_290826.mp4', feed: 'AP_03_4x4_290826.mp4',
    headline: 'Сьогодні — сюди',
    body: 'Сьогодні хочеться заліза. Завтра — кардіо. Післязавтра — тиші й розтяжки.\n\nВ APOLLO NEXT є зона під будь-який настрій: вільні ваги, кардіо, груповий зал, функціонал, простір для розтяжки. Обирай щодня заново.\n#титвоямета' + OFFER },
];
const CITIES = [
  { name: 'Odessa', key: '2384095', budget: 1000 },
  { name: 'Bila Tserkva', key: '2363654', budget: 500 },
  { name: 'Boryspil', key: '2364576', budget: 500 },
  { name: 'Ivano-Frankivsk', key: '2371245', budget: 500 },
];

async function uploadVideo(buffer, name) {
  const form = new FormData();
  form.append('access_token', TOKEN); form.append('name', name);
  form.append('source', buffer, { filename: name, contentType: 'video/mp4' });
  const r = await axios.post(`https://graph-video.facebook.com/v21.0/${ACCT}/advideos`, form, { headers: form.getHeaders(), maxContentLength: 300 * 1024 * 1024, timeout: 300000 });
  if (r.data.error) throw new Error(r.data.error.message);
  return r.data.id;
}
async function waitVideoReady(id, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const d = await apiGet(id, { fields: 'status' });
    const st = d.status && d.status.video_status;
    if (st === 'ready') return true;
    if (st === 'error') throw new Error('video error ' + id);
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error('video not ready: ' + id);
}
async function uploadImage(buffer, name) {
  const r = await apiPost(`${ACCT}/adimages`, { bytes: buffer.toString('base64'), name });
  if (r.error) throw new Error('image: ' + r.error.message);
  return Object.values(r.images)[0].hash;
}
function thumb(videoFile, out) {
  const o = path.join(TMP, out);
  const r = spawnSync('ffmpeg', ['-y', '-ss', '3', '-i', path.join(DL, videoFile), '-frames:v', '1', '-q:v', '3', o], { encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(o)) throw new Error('ffmpeg: ' + (r.stderr || '').slice(-160));
  return fs.readFileSync(o);
}

const VRULES = [
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'] }, video_label: { name: 'st_vid' }, priority: 1 },
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed'], instagram_positions: ['stream', 'explore', 'explore_home', 'profile_feed'] }, video_label: { name: 'sq_vid' }, priority: 2 },
];
function creativePayload(v, name) {
  const afs = {
    bodies: [{ text: v.body }], titles: [{ text: v.headline }], link_urls: [{ website_url: LINK }],
    call_to_action_types: [CTA], ad_formats: ['AUTOMATIC_FORMAT'],
    videos: [
      { video_id: v.feedVid, thumbnail_hash: v.feedThumb, adlabels: [{ name: 'sq_vid' }] },
      { video_id: v.storyVid, thumbnail_hash: v.storyThumb, adlabels: [{ name: 'st_vid' }] },
    ],
    asset_customization_rules: VRULES,
  };
  return { name, object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }), asset_feed_spec: JSON.stringify(afs), url_tags: URL_TAGS };
}
async function createCreative(p) {
  const r = await apiPost(`${ACCT}/adcreatives`, p);
  if (r.error) throw new Error(`creative ${r.error.code}/${r.error.error_subcode || '-'}: ${r.error.error_user_msg || r.error.message}`);
  return r.id;
}
function targeting(cityKey) {
  return {
    age_min: 18, age_max: 55,
    geo_locations: { cities: [{ country: 'UA', distance_unit: 'mile', key: cityKey }], location_types: ['home', 'recent'] },
    publisher_platforms: ['instagram', 'threads'],
    instagram_positions: ['stream', 'story', 'explore', 'reels', 'explore_home', 'profile_feed'],
    threads_positions: ['threads_stream'],
    targeting_automation: { advantage_audience: 0 },
  };
}
async function createAdset(campaignId, name, budget, cityKey) {
  const r = await apiPost(`${ACCT}/adsets`, {
    name, campaign_id: campaignId,
    optimization_goal: 'REACH', billing_event: 'IMPRESSIONS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    daily_budget: String(budget),
    promoted_object: JSON.stringify({ page_id: PAGE_ID }),
    targeting: JSON.stringify(targeting(cityKey)), start_time: START_TIME, status: 'PAUSED',
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

// upload one video's 2 ratios + thumbs, mutate v with ids
async function prepVideo(v) {
  console.log(`  🎬 ${v.key}: uploading...`);
  v.storyVid = await uploadVideo(fs.readFileSync(path.join(DL, v.story)), v.story);
  v.feedVid = await uploadVideo(fs.readFileSync(path.join(DL, v.feed)), v.feed);
  await waitVideoReady(v.storyVid); await waitVideoReady(v.feedVid);
  v.storyThumb = await uploadImage(thumb(v.story, `${v.key}_st.jpg`), `${v.key}_st.jpg`);
  v.feedThumb = await uploadImage(thumb(v.feed, `${v.key}_fd.jpg`), `${v.key}_fd.jpg`);
  console.log(`     story ${v.storyVid} / feed ${v.feedVid} | thumbs ok`);
}

async function test() {
  const v = VIDEOS[2]; // AP03 has square feed
  await prepVideo(v);
  const cr = await createCreative(creativePayload(v, v.key + '_TEST'));
  console.log('  creative', cr);
  const camp = await apiPost(`${ACCT}/campaigns`, { name: 'ZZZ_REACH_TEST_DEL', objective: 'OUTCOME_AWARENESS', buying_type: 'AUCTION', special_ad_categories: JSON.stringify([]), is_adset_budget_sharing_enabled: 'false', status: 'PAUSED' });
  try {
    const asId = await createAdset(camp.id, 'ZZZ_Odessa_AP03', 1000, '2384095');
    const adId = await createAd(asId, 'AP03', cr);
    console.log('  adset+ad OK', asId, adId);
    for (const fmt of ['INSTAGRAM_STORY', 'INSTAGRAM_REELS', 'INSTAGRAM_STANDARD']) {
      const p = await apiGet(`${cr}/previews`, { ad_format: fmt });
      console.log('  preview', fmt, p.error ? 'ERR ' + p.error.message : 'OK');
    }
  } catch (e) { console.log('TEST ERROR:', e.message); }
  console.log('  cleanup:', del(camp.id), del(cr));
}

async function build() {
  console.log(`Building ${NEW_CAMP_NAME} | start ${START_TIME}`);
  for (const v of VIDEOS) await prepVideo(v);
  const creatives = {};
  for (const v of VIDEOS) { creatives[v.key] = await createCreative(creativePayload(v, v.key)); console.log(`  creative ${v.key}: ${creatives[v.key]}`); }
  const camp = await apiPost(`${ACCT}/campaigns`, { name: NEW_CAMP_NAME, objective: 'OUTCOME_AWARENESS', buying_type: 'AUCTION', special_ad_categories: JSON.stringify([]), is_adset_budget_sharing_enabled: 'false', status: 'PAUSED' });
  if (camp.error) throw new Error('campaign: ' + camp.error.message);
  console.log('📁 campaign', camp.id);
  const log = { campaign: NEW_CAMP_NAME, campaign_id: camp.id, adsets: [], ads_count: 0 };
  for (const c of CITIES) {
    for (const v of VIDEOS) {
      const name = `${c.name.replace(/[ -]/g, '')}_18-55_${v.key}`;
      const asId = await createAdset(camp.id, name, c.budget, c.key);
      await createAd(asId, v.key, creatives[v.key]);
      log.ads_count++; log.adsets.push({ name, id: asId });
    }
    console.log(`  📂 ${c.name}: 3 groups (AP01/02/03) @ $${c.budget / 100}/d each`);
  }
  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  hist.push({ date: '2026-07-31', campaign_name: log.campaign, campaign_id: log.campaign_id, adsets: log.adsets, ads_count: log.ads_count });
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));
  console.log(`\n✅ DONE — ${log.adsets.length} groups, ${log.ads_count} ads, all PAUSED. Start ${START_TIME}.`);
}

const cmd = process.argv[2];
(async () => { if (cmd === 'test') await test(); else if (cmd === 'build') await build(); else console.log('cmd: test | build'); })().catch(e => { console.error('❌', e.message); process.exit(1); });
