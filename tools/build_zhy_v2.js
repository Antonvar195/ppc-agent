// Duplicate AI_Apollo_sales_ZHY_041_1107 (120249411371570193) as
// AI_Apollo_sales_ZHY_041_2107 with fresh creatives from AI-creatives/output/zhytomyr:
//  - image (segment) groups rem/lookalike: adaptive banners
//      segment_1 -> club1,club2,club3 ; segment_2 -> map,people_athlete,people_couple
//  - advantage + local (broad) groups: adaptive VIDEO only (zhy_girl square+story)
// Same targeting/budgets/settings, all PAUSED.
// Usage: node tools/build_zhy_v2.js test | build
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
const PIXEL_ID = '393751978682816';
const NEW_CAMP_NAME = 'AI_Apollo_sales_ZHY_041_2107';
const REF_CREATIVE_ID = null; // resolved at runtime from source campaign
const SRC_CAMPAIGN = '120249411371570193';
const START_TIME = new Date(Date.now() + 5 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, '+0000');
const FOLDER = path.join(process.env.HOME, 'projects/apollo/AI-creatives/output/zhytomyr');
const TMP = '/private/tmp/claude-501/-Users-antonvarvarinec/d4d222cf-ece4-494e-a13d-9a8c8484107d/scratchpad';

const HEADLINE = 'Новий спорт простір поруч';
const LINK = 'https://apollo.online/clubs/apollo-next-041-yarmarok/';
const CTA = 'APPLY_NOW';
const URL_TAGS = 'utm_source=facebook&utm_medium=conversion&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';

const SRC = JSON.parse(fs.readFileSync(path.join(__dirname, '../history/zhy_v2_src_adsets.json'), 'utf8')).data;

// group -> media plan
const SEG1_IMAGES = ['club1', 'club2', 'club3'];
const SEG2_IMAGES = ['map', 'people_athlete', 'people_couple'];
const VIDEO_GROUPS = ['advantage_ZHY_segment_1', 'advantage_ZHY_segment_2', 'local_ZHY_segment_1', 'local_ZHY_segment_2'];
function planFor(name) {
  if (VIDEO_GROUPS.includes(name)) return { type: 'video' };
  if (/segment_1/.test(name)) return { type: 'image', sets: SEG1_IMAGES };
  return { type: 'image', sets: SEG2_IMAGES };
}

// ---------- media upload ----------
async function uploadImage(buffer, name) {
  const r = await apiPost(`${ACCT}/adimages`, { bytes: buffer.toString('base64'), name });
  if (r.error) throw new Error('image upload: ' + r.error.message);
  const img = Object.values(r.images || {})[0];
  if (!img) throw new Error('no image hash');
  return img.hash;
}
async function uploadVideo(buffer, name) {
  const form = new FormData();
  form.append('access_token', TOKEN);
  form.append('name', name);
  form.append('source', buffer, { filename: name, contentType: 'video/mp4' });
  const r = await axios.post(`https://graph-video.facebook.com/v21.0/${ACCT}/advideos`, form,
    { headers: form.getHeaders(), maxContentLength: 200 * 1024 * 1024, timeout: 180000 });
  if (r.data.error) throw new Error(r.data.error.message);
  return r.data.id;
}
async function waitVideoReady(videoId, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const d = await apiGet(videoId, { fields: 'status' });
    const st = d.status && d.status.video_status;
    if (st === 'ready') return true;
    if (st === 'error') throw new Error('video processing error ' + videoId);
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error('video not ready (timeout): ' + videoId);
}
function thumbFromVideo(videoPath, outName) {
  const out = path.join(TMP, outName);
  const r = spawnSync('ffmpeg', ['-y', '-i', videoPath, '-frames:v', '1', '-q:v', '3', out], { encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(out)) throw new Error('ffmpeg thumb failed: ' + (r.stderr || '').slice(-200));
  return fs.readFileSync(out);
}

// ---------- creatives ----------
async function loadRefText() {
  const d = await apiGet(`${SRC_CAMPAIGN}/adsets`, { fields: 'ads.limit(1){creative{id}}', limit: 1 });
  const crId = d.data[0].ads.data[0].creative.id;
  const c = await apiGet(crId, { fields: 'asset_feed_spec' });
  return c.asset_feed_spec.bodies[0].text;
}
const BANNER_RULES = [
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'] }, image_label: { name: 'st_img' }, priority: 1 },
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed'], instagram_positions: ['stream', 'explore', 'explore_home', 'profile_feed'] }, image_label: { name: 'sq_img' }, priority: 2 },
];
const VIDEO_RULES = [
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'] }, video_label: { name: 'st_vid' }, priority: 1 },
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed'], instagram_positions: ['stream', 'explore', 'explore_home', 'profile_feed'] }, video_label: { name: 'sq_vid' }, priority: 2 },
];
function bannerPayload(body, feedHash, storyHash, name) {
  const afs = {
    bodies: [{ text: body }], titles: [{ text: HEADLINE }], link_urls: [{ website_url: LINK }],
    call_to_action_types: [CTA], ad_formats: ['AUTOMATIC_FORMAT'],
    images: [{ hash: feedHash, adlabels: [{ name: 'sq_img' }] }, { hash: storyHash, adlabels: [{ name: 'st_img' }] }],
    asset_customization_rules: BANNER_RULES,
  };
  return { name, object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }), asset_feed_spec: JSON.stringify(afs), url_tags: URL_TAGS };
}
function videoPayload(body, sqVid, sqThumb, stVid, stThumb, name) {
  const afs = {
    bodies: [{ text: body }], titles: [{ text: HEADLINE }], link_urls: [{ website_url: LINK }],
    call_to_action_types: [CTA], ad_formats: ['AUTOMATIC_FORMAT'],
    videos: [
      { video_id: sqVid, thumbnail_hash: sqThumb, adlabels: [{ name: 'sq_vid' }] },
      { video_id: stVid, thumbnail_hash: stThumb, adlabels: [{ name: 'st_vid' }] },
    ],
    asset_customization_rules: VIDEO_RULES,
  };
  return { name, object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }), asset_feed_spec: JSON.stringify(afs), url_tags: URL_TAGS };
}
async function createCreative(p) {
  const r = await apiPost(`${ACCT}/adcreatives`, p);
  if (r.error) throw new Error(`creative ${r.error.code}/${r.error.error_subcode || '-'}: ${r.error.error_user_msg || r.error.message}`);
  return r.id;
}

// ---------- targeting/adset/ad ----------
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
async function createAdset(campaignId, src) {
  const r = await apiPost(`${ACCT}/adsets`, {
    name: src.name, campaign_id: campaignId,
    optimization_goal: src.optimization_goal, billing_event: src.billing_event, bid_strategy: src.bid_strategy,
    daily_budget: String(src.daily_budget),
    promoted_object: JSON.stringify(src.promoted_object || { pixel_id: PIXEL_ID, custom_event_type: 'PURCHASE' }),
    attribution_spec: JSON.stringify(src.attribution_spec || [{ event_type: 'CLICK_THROUGH', window_days: 7 }, { event_type: 'VIEW_THROUGH', window_days: 1 }]),
    targeting: JSON.stringify(cleanTargeting(src.targeting)),
    start_time: START_TIME, status: 'PAUSED',
  });
  if (r.error) throw new Error(`adset "${src.name}": ${r.error.error_user_msg || r.error.message}`);
  return r.id;
}
async function createAd(adsetId, name, creativeId) {
  const r = await apiPost(`${ACCT}/ads`, { name, adset_id: adsetId, creative: JSON.stringify({ creative_id: creativeId }), status: 'PAUSED' });
  if (r.error) throw new Error(`ad "${name}": ${r.error.error_user_msg || r.error.message}`);
  return r.id;
}
const del = node => spawnSync('curl', ['-s', '-X', 'DELETE', `https://graph.facebook.com/v21.0/${node}?access_token=${TOKEN}`]).stdout.toString();

// upload the single zhy_girl video set -> {sqVid,sqThumb,stVid,stThumb}
async function uploadVideoSet() {
  console.log('  🎬 uploading zhy_girl videos...');
  const sqVid = await uploadVideo(fs.readFileSync(path.join(FOLDER, 'zhy_girl_square.mp4')), 'zhy_girl_square.mp4');
  const stVid = await uploadVideo(fs.readFileSync(path.join(FOLDER, 'zhy_girl_story.mp4')), 'zhy_girl_story.mp4');
  console.log('     video ids:', sqVid, stVid, '- waiting for processing...');
  await waitVideoReady(sqVid); await waitVideoReady(stVid);
  const sqThumb = await uploadImage(thumbFromVideo(path.join(FOLDER, 'zhy_girl_square.mp4'), 'zhy_sq_thumb.jpg'), 'zhy_sq_thumb.jpg');
  const stThumb = await uploadImage(thumbFromVideo(path.join(FOLDER, 'zhy_girl_story.mp4'), 'zhy_st_thumb.jpg'), 'zhy_st_thumb.jpg');
  console.log('     thumbs:', sqThumb, stThumb);
  return { sqVid, sqThumb, stVid, stThumb };
}
// upload all 6 image sets -> {setName: {feed, story}}
async function uploadImageSets() {
  const out = {};
  for (const s of [...SEG1_IMAGES, ...SEG2_IMAGES]) {
    const feed = await uploadImage(fs.readFileSync(path.join(FOLDER, `${s}_square.png`)), `zhy2_${s}_sq.png`);
    const story = await uploadImage(fs.readFileSync(path.join(FOLDER, `${s}_story.png`)), `zhy2_${s}_st.png`);
    out[s] = { feed, story };
    console.log(`  🖼  ${s}: feed ${feed} | story ${story}`);
  }
  return out;
}

async function test() {
  console.log('TEST: video creative in a temp advantage adset + banner creative preview | start', START_TIME);
  const body = await loadRefText();
  const vid = await uploadVideoSet();
  const vcr = await createCreative(videoPayload(body, vid.sqVid, vid.sqThumb, vid.stVid, vid.stThumb, '2107_zhy_girl_TEST'));
  console.log('  ✅ video creative', vcr);
  // banner test (one set)
  const img = await uploadImageSets();
  const bcr = await createCreative(bannerPayload(body, img.club1.feed, img.club1.story, '2107_club1_TEST'));
  console.log('  ✅ banner creative', bcr);
  const camp = await apiPost(`${ACCT}/campaigns`, { name: 'ZZZ_ZHY2_TEST_DEL', objective: 'OUTCOME_SALES', buying_type: 'AUCTION', special_ad_categories: JSON.stringify([]), is_adset_budget_sharing_enabled: 'false', status: 'PAUSED' });
  try {
    const adv = SRC.find(s => s.name === 'advantage_ZHY_segment_1');
    const asId = await createAdset(camp.id, adv);
    console.log('  ✅ advantage adset', asId);
    const vad = await createAd(asId, '2107_zhy_girl', vcr);
    console.log('  ✅ video ad in advantage', vad);
    for (const fmt of ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY', 'FACEBOOK_STORY_MOBILE']) {
      const p = await apiGet(`${vcr}/previews`, { ad_format: fmt });
      console.log('  video preview', fmt, p.error ? 'ERR ' + p.error.message : 'OK');
    }
    for (const fmt of ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY']) {
      const p = await apiGet(`${bcr}/previews`, { ad_format: fmt });
      console.log('  banner preview', fmt, p.error ? 'ERR ' + p.error.message : 'OK');
    }
  } catch (e) { console.log('TEST ERROR:', e.message); }
  console.log('  cleanup:', del(camp.id), del(vcr), del(bcr));
}

async function build() {
  console.log(`Building ${NEW_CAMP_NAME} | start ${START_TIME}`);
  const body = await loadRefText();
  const vid = await uploadVideoSet();
  const img = await uploadImageSets();
  // creatives
  const videoCr = await createCreative(videoPayload(body, vid.sqVid, vid.sqThumb, vid.stVid, vid.stThumb, '2107_zhy_girl'));
  console.log('  🎬 video creative:', videoCr);
  const bannerCr = {};
  for (const s of [...SEG1_IMAGES, ...SEG2_IMAGES]) {
    bannerCr[s] = await createCreative(bannerPayload(body, img[s].feed, img[s].story, `2107_${s}`));
    console.log(`  🎬 banner ${s}:`, bannerCr[s]);
  }
  const camp = await apiPost(`${ACCT}/campaigns`, { name: NEW_CAMP_NAME, objective: 'OUTCOME_SALES', buying_type: 'AUCTION', special_ad_categories: JSON.stringify([]), is_adset_budget_sharing_enabled: 'false', status: 'PAUSED' });
  if (camp.error) throw new Error('campaign: ' + camp.error.message);
  console.log('📁 campaign:', camp.id);
  const log = { campaign: NEW_CAMP_NAME, campaign_id: camp.id, adsets: [], ads_count: 0 };
  for (const src of SRC) {
    const asId = await createAdset(camp.id, src);
    const plan = planFor(src.name);
    const ads = [];
    if (plan.type === 'video') {
      await createAd(asId, '2107_zhy_girl', videoCr); ads.push('zhy_girl(video)'); log.ads_count++;
    } else {
      for (const s of plan.sets) { await createAd(asId, `2107_${s}`, bannerCr[s]); ads.push(s); log.ads_count++; }
    }
    console.log(`  📂 ${src.name}: ${asId} | ${plan.type} | ${ads.join(', ')} | PAUSED`);
    log.adsets.push({ name: src.name, id: asId, ads });
  }
  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  hist.push({ date: '2026-07-21', campaign_name: log.campaign, campaign_id: log.campaign_id, adsets: log.adsets, ads_count: log.ads_count });
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));
  console.log(`\n✅ DONE — ${log.adsets.length} groups, ${log.ads_count} ads, all PAUSED. Start ${START_TIME}.`);
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'test') await test();
  else if (cmd === 'build') await build();
  else console.log('cmd: test | build');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
