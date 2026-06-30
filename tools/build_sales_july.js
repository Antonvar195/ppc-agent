// Replicate conversion campaign A_Apollo_sales_all_clubs_june_0906 as a NEW
// campaign for 01.07: same 4 ad sets/settings, but 4 adaptive video ads per group.
// Usage: node tools/build_sales_july.js test | build
const fs = require('fs');
const path = require('path');
const { apiGet, apiPost } = require('./meta_api');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const IG_ID = '17841447539432480';
const PIXEL_ID = '393751978682816';
const START_TIME = '2026-07-01T00:01:00+0300';
const DATE_TOKEN = '0107';
const LINK = 'http://apollo.online/';
const CTA = 'SEE_DETAILS';
const URL_TAGS = 'utm_source=facebook&utm_medium=conversion&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';
const NEW_CAMP_NAME = 'AI_Apollo_sales_all_clubs_july_0107';

const SALES_TEXT = fs.readFileSync(path.join(__dirname, '../history/sales_text.txt'), 'utf8');
const SRC = JSON.parse(fs.readFileSync(path.join(__dirname, '../history/sales_src_adsets.json'), 'utf8')).data;
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, '../history/reach_video_manifest.json'), 'utf8'));

// video1 vertical-only; videos 2/3/4 adaptive (square feed + vertical story)
const VIDEOS = [
  { n: 1, single: true,  feed: 'AP_ADS_1_9x16.mp4', story: 'AP_ADS_1_9x16.mp4' },
  { n: 2, single: false, feed: 'AP_ADS_2_4x4.mp4',  story: 'AP_ADS_2_9x16.mp4' },
  { n: 3, single: false, feed: 'AP_ADS_3_4x4.mp4',  story: 'AP_ADS_3_9x16.mp4' },
  { n: 4, single: false, feed: 'AP_ADS_4_4x4.mp4',  story: 'AP_ADS_4_9x16.mp4' },
];

// Faithfully replicate a source ad set's targeting; only add 'explore' when
// 'explore_home' is present and ensure advantage_audience is explicit. Drop
// read-only/derived keys that break create.
function cleanTargeting(s) {
  const t = {};
  const copy = ['age_min', 'age_max', 'genders', 'geo_locations', 'publisher_platforms',
    'facebook_positions', 'threads_positions', 'device_platforms', 'flexible_spec', 'exclusions'];
  for (const k of copy) if (s[k] !== undefined) t[k] = s[k];
  if (s.instagram_positions) {
    const ig = [...s.instagram_positions];
    if (ig.includes('explore_home') && !ig.includes('explore')) ig.push('explore');
    t.instagram_positions = ig;
  }
  if (s.custom_audiences) t.custom_audiences = s.custom_audiences.map(a => ({ id: a.id }));
  if (s.excluded_custom_audiences) t.excluded_custom_audiences = s.excluded_custom_audiences.map(a => ({ id: a.id }));
  const ta = s.targeting_automation || {};
  if (ta.advantage_audience === undefined) ta.advantage_audience = 0;
  t.targeting_automation = ta;
  return t;
}

function buildCreative(video, name) {
  const feed = MAN[video.feed], story = MAN[video.story];
  if (video.single) {
    return {
      name,
      object_story_spec: JSON.stringify({
        page_id: PAGE_ID, instagram_user_id: IG_ID,
        video_data: { video_id: feed.video_id, image_hash: feed.thumb_hash, message: SALES_TEXT,
          call_to_action: { type: CTA, value: { link: LINK } } },
      }),
      url_tags: URL_TAGS,
    };
  }
  const afs = {
    bodies: [{ text: SALES_TEXT }],
    link_urls: [{ website_url: LINK }],
    call_to_action_types: [CTA],
    ad_formats: ['AUTOMATIC_FORMAT'],
    videos: [
      { video_id: feed.video_id,  thumbnail_hash: feed.thumb_hash,  adlabels: [{ name: 'sq_vid' }] },
      { video_id: story.video_id, thumbnail_hash: story.thumb_hash, adlabels: [{ name: 'st_vid' }] },
    ],
    asset_customization_rules: [
      // story/reels -> vertical
      { customization_spec: { publisher_platforms: ['instagram'], instagram_positions: ['story', 'reels'] },
        video_label: { name: 'st_vid' }, priority: 1 },
      // feed/explore -> square (validated working structure: no is_default)
      { customization_spec: { publisher_platforms: ['instagram'], instagram_positions: ['stream', 'explore', 'explore_home', 'profile_feed'] },
        video_label: { name: 'sq_vid' }, priority: 2 },
    ],
  };
  return {
    name,
    object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
    asset_feed_spec: JSON.stringify(afs),
    url_tags: URL_TAGS,
  };
}

async function createCreative(payload) {
  const r = await apiPost(`${ACCT}/adcreatives`, payload);
  if (r.error) throw new Error(`creative ${r.error.code}/${r.error.error_subcode || '-'}: ${r.error.error_user_msg || r.error.message}`);
  return r.id;
}

async function createAdset(campaignId, name, budget, targeting) {
  const r = await apiPost(`${ACCT}/adsets`, {
    name, campaign_id: campaignId,
    optimization_goal: 'VALUE', billing_event: 'IMPRESSIONS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    daily_budget: String(budget),
    promoted_object: JSON.stringify({ pixel_id: PIXEL_ID, custom_event_type: 'PURCHASE' }),
    attribution_spec: JSON.stringify([{ event_type: 'CLICK_THROUGH', window_days: 7 }, { event_type: 'VIEW_THROUGH', window_days: 1 }]),
    targeting: JSON.stringify(targeting),
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

const { spawnSync } = require('child_process');
function del(node) {
  const r = spawnSync('curl', ['-s', '-X', 'DELETE', `https://graph.facebook.com/v21.0/${node}?access_token=${process.env.META_ACCESS_TOKEN}`]);
  return r.stdout.toString();
}

async function test() {
  console.log('TEST: create temp campaign + 1 VALUE adset + adaptive video ad');
  const camp = await apiPost(`${ACCT}/campaigns`, { name: 'ZZZ_SALES_TEST_DEL', objective: 'OUTCOME_SALES', buying_type: 'AUCTION',
    special_ad_categories: JSON.stringify([]), is_adset_budget_sharing_enabled: 'false', status: 'PAUSED' });
  if (camp.error) { console.log('campaign FAIL', camp.error.message); return; }
  try {
    const t = cleanTargeting(SRC[2].targeting); // the 13-19 adset (no custom aud) as simplest
    const asId = await createAdset(camp.id, 'ZZZ_as', SRC[2].daily_budget, t);
    console.log('VALUE adset OK', asId);
    const crMulti = await createCreative(buildCreative(VIDEOS[1], `${DATE_TOKEN}_video2`));
    const adMulti = await createAd(asId, `${DATE_TOKEN}_video2`, crMulti);
    console.log('adaptive video ad OK', adMulti);
    const crSingle = await createCreative(buildCreative(VIDEOS[0], `${DATE_TOKEN}_video1`));
    const adSingle = await createAd(asId, `${DATE_TOKEN}_video1`, crSingle);
    console.log('single video ad OK', adSingle);
    for (const fmt of ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY']) {
      const p = await apiGet(`${crMulti}/previews`, { ad_format: fmt });
      console.log('  preview', fmt, p.error ? ('ERR ' + p.error.message) : 'OK');
    }
  } catch (e) { console.log('TEST ERROR:', e.message); }
  console.log('cleanup:', del(camp.id));
}

async function build() {
  console.log(`Building ${NEW_CAMP_NAME}...`);
  const camp = await apiPost(`${ACCT}/campaigns`, { name: NEW_CAMP_NAME, objective: 'OUTCOME_SALES', buying_type: 'AUCTION',
    special_ad_categories: JSON.stringify([]), is_adset_budget_sharing_enabled: 'false', status: 'PAUSED' });
  if (camp.error) throw new Error(`campaign: ${camp.error.message}`);
  console.log('📁 campaign:', camp.id);
  // creatives reused across adsets (same text/link for all)
  const creatives = [];
  for (const v of VIDEOS) {
    const cid = await createCreative(buildCreative(v, `${DATE_TOKEN}_video${v.n}`));
    creatives.push({ n: v.n, creative_id: cid });
    console.log(`  🎬 video${v.n}: ${cid}`);
  }
  const log = { campaign: NEW_CAMP_NAME, campaign_id: camp.id, adsets: [], ads_count: 0 };
  for (const src of SRC) {
    const t = cleanTargeting(src.targeting);
    const asId = await createAdset(camp.id, src.name, src.daily_budget, t);
    console.log(`  📂 ${src.name}: ${asId} | budget ${src.daily_budget} | start ${START_TIME} | PAUSED`);
    for (const cr of creatives) {
      const adId = await createAd(asId, `${DATE_TOKEN}_video${cr.n}`, cr.creative_id);
      console.log(`      + ad ${DATE_TOKEN}_video${cr.n} -> ${adId}`);
      log.ads_count++;
    }
    log.adsets.push({ name: src.name, id: asId });
  }
  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  hist.push({ date: new Date().toISOString(), campaign_name: log.campaign, campaign_id: log.campaign_id, adsets: log.adsets, ads_count: log.ads_count });
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));
  console.log(`\n✅ DONE — ${log.adsets.length} groups, ${log.ads_count} ads, all PAUSED.`);
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'test') await test();
  else if (cmd === 'build') await build();
  else console.log('cmd: test | build');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
