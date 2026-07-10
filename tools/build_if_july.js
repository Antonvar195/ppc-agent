// Rebuild conversion campaign A_Apollo_sales_IF_039_0406 for July: same 3 groups
// & settings, but ONE adaptive banner ad per group (horizontal->feed, vertical->story).
// Usage: node tools/build_if_july.js test | build
const fs = require('fs');
const path = require('path');
const { apiGet, apiPost } = require('./meta_api');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function uploadImageBufferToMeta(buffer, name) {
  const r = await apiPost(`${process.env.META_AD_ACCOUNT_ID}/adimages`, { bytes: buffer.toString('base64'), name });
  if (r.error) throw new Error('image upload: ' + r.error.message);
  const img = Object.values(r.images || {})[0];
  if (!img) throw new Error('no image hash returned');
  return img.hash;
}

const ACCT = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const IG_ID = '17841447539432480';
const PIXEL_ID = '393751978682816';
const START_TIME = '2026-07-01T00:01:00+0300';
const NEW_CAMP_NAME = 'AI_Apollo_sales_IF_039_july_0107';
const LINK = 'https://apollo.online/clubs/apollo-next-039/';
const CTA = 'LEARN_MORE';
const HEADLINE = 'Перший тиждень за 1 грн + STARWAY';
const URL_TAGS = 'utm_source=facebook&utm_medium=conversion&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';
const AD_NAME = '0107_1';

const SALES_TEXT = fs.readFileSync(path.join(__dirname, '../history/sales_text.txt'), 'utf8');
const SRC = JSON.parse(fs.readFileSync(path.join(__dirname, '../history/if_src_adsets.json'), 'utf8')).data;
const BANNERS = '/private/tmp/claude-501/-Users-antonvarvarinec/d4d222cf-ece4-494e-a13d-9a8c8484107d/scratchpad/if_banners';

const { spawnSync } = require('child_process');
function del(node) {
  return spawnSync('curl', ['-s', '-X', 'DELETE', `https://graph.facebook.com/v21.0/${node}?access_token=${process.env.META_ACCESS_TOKEN}`]).stdout.toString();
}

async function uploadBanners() {
  const feedHash = await uploadImageBufferToMeta(fs.readFileSync(path.join(BANNERS, 'if_feed.jpg')), 'if_feed_1440x720.jpg');
  const storyHash = await uploadImageBufferToMeta(fs.readFileSync(path.join(BANNERS, 'if_story.jpg')), 'if_story_1080x1620.jpg');
  console.log('  🖼  feed hash:', feedHash, '| story hash:', storyHash);
  return { feedHash, storyHash };
}

// Faithful targeting copy; add 'explore' when 'explore_home' present; advantage_audience explicit.
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

function buildCreative(hashes, name) {
  const afs = {
    bodies: [{ text: SALES_TEXT }],
    titles: [{ text: HEADLINE }],
    link_urls: [{ website_url: LINK }],
    call_to_action_types: [CTA],
    ad_formats: ['AUTOMATIC_FORMAT'],
    images: [
      { hash: hashes.feedHash,  adlabels: [{ name: 'sq_img' }] },
      { hash: hashes.storyHash, adlabels: [{ name: 'st_img' }] },
    ],
    asset_customization_rules: [
      { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'] },
        image_label: { name: 'st_img' }, priority: 1 },
      { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed'], instagram_positions: ['stream', 'explore', 'explore_home', 'profile_feed'] },
        image_label: { name: 'sq_img' }, priority: 2 },
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
    optimization_goal: 'OFFSITE_CONVERSIONS', billing_event: 'IMPRESSIONS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
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

async function test() {
  console.log('TEST: upload banners + temp campaign + 1 OFFSITE_CONVERSIONS adset + adaptive banner ad');
  const hashes = await uploadBanners();
  const camp = await apiPost(`${ACCT}/campaigns`, { name: 'ZZZ_IF_TEST_DEL', objective: 'OUTCOME_SALES', buying_type: 'AUCTION',
    special_ad_categories: JSON.stringify([]), is_adset_budget_sharing_enabled: 'false', status: 'PAUSED' });
  if (camp.error) { console.log('campaign FAIL', camp.error.message); return; }
  try {
    const t = cleanTargeting(SRC[1].targeting); // local_IF (has placements)
    const asId = await createAdset(camp.id, 'ZZZ_as', SRC[1].daily_budget, t);
    console.log('adset OK', asId);
    const cr = await createCreative(buildCreative(hashes, AD_NAME));
    const adId = await createAd(asId, AD_NAME, cr);
    console.log('adaptive banner ad OK', adId);
    for (const fmt of ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY', 'FACEBOOK_STORY_MOBILE']) {
      const p = await apiGet(`${cr}/previews`, { ad_format: fmt });
      console.log('  preview', fmt, p.error ? ('ERR ' + p.error.message) : 'OK');
    }
  } catch (e) { console.log('TEST ERROR:', e.message); }
  console.log('cleanup:', del(camp.id));
}

async function build() {
  console.log(`Building ${NEW_CAMP_NAME}...`);
  const hashes = await uploadBanners();
  const camp = await apiPost(`${ACCT}/campaigns`, { name: NEW_CAMP_NAME, objective: 'OUTCOME_SALES', buying_type: 'AUCTION',
    special_ad_categories: JSON.stringify([]), is_adset_budget_sharing_enabled: 'false', status: 'PAUSED' });
  if (camp.error) throw new Error(`campaign: ${camp.error.message}`);
  console.log('📁 campaign:', camp.id);
  const creativeId = await createCreative(buildCreative(hashes, AD_NAME));
  console.log('  🎬 adaptive creative:', creativeId);
  const log = { campaign: NEW_CAMP_NAME, campaign_id: camp.id, adsets: [], ads_count: 0 };
  for (const src of SRC) {
    const t = cleanTargeting(src.targeting);
    const asId = await createAdset(camp.id, src.name, src.daily_budget, t);
    const adId = await createAd(asId, AD_NAME, creativeId);
    console.log(`  📂 ${src.name}: ${asId} | budget ${src.daily_budget} | start ${START_TIME} | PAUSED | ad ${adId}`);
    log.adsets.push({ name: src.name, id: asId }); log.ads_count++;
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
