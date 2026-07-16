// Copy the coach_039_if ad set into campaign A_Coach_1603 (120241053870420193)
// as coach_041_zhy: same lead/conversion setup (Coach custom conversion, pixel
// rule dyakuyemo-treneram), geo swapped IF -> Zhytomyr, budget $30/day, 3 new
// adaptive banners from Dropbox. Ad copy is city-neutral (unchanged). All PAUSED.
// Usage: node tools/add_coach_zhytomyr.js test | build
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { apiGet, apiPost } = require('./meta_api');
const dropbox = require('./dropbox_reader');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const IG_ID = '17841447539432480';
const CAMPAIGN_ID = '120241053870420193';        // A_Coach_1603
const SRC_ADSET_ID = '120244236066130193';        // coach_039_if (source)
const REF_CREATIVE_ID = '1312389650995800';       // coach 0705_1 (text/headline/link/cta source)
const NEW_ADSET_NAME = 'coach_041_zhy';
const DAILY_BUDGET = '3000';                       // $30/day (USD account, cents)
const DATE_TOKEN = '1607';
const DROPBOX_LINK = 'https://www.dropbox.com/scl/fo/v6yb0a8h9fuatn4258834/ADFtXM9xJPsiOpxADAoZFss?rlkey=gvy13lh5apx2gj48hb0c8vw0r&e=1&dl=0';
const START_TIME = new Date(Date.now() + 5 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, '+0000');
const ZHY_CITY = { country: 'UA', distance_unit: 'mile', key: '2401072', name: 'Zhytomyr', region: 'Zhytomyr Oblast', region_id: '3800' };
const NUM = 3; // s/stories 01-03 -> ads 1607_1..3

const SRC = JSON.parse(fs.readFileSync('/private/tmp/claude-501/-Users-antonvarvarinec/d4d222cf-ece4-494e-a13d-9a8c8484107d/scratchpad/coach039.json', 'utf8'));

async function dlDropbox(fileName) {
  const resp = await dropbox.dropboxRequest(token => axios({
    method: 'post', url: 'https://content.dropboxapi.com/2/sharing/get_shared_link_file',
    headers: { Authorization: `Bearer ${token}`, 'Dropbox-API-Arg': JSON.stringify({ url: DROPBOX_LINK, path: '/' + fileName }), 'Content-Type': '' },
    data: '', responseType: 'arraybuffer', maxContentLength: 50 * 1024 * 1024,
  }));
  return Buffer.from(resp.data);
}
async function uploadImage(buffer, name) {
  const r = await apiPost(`${ACCT}/adimages`, { bytes: buffer.toString('base64'), name });
  if (r.error) throw new Error('image upload: ' + r.error.message);
  const img = Object.values(r.images || {})[0];
  if (!img) throw new Error('no image hash');
  return img.hash;
}

async function loadRef() {
  const d = await apiGet(REF_CREATIVE_ID, { fields: 'url_tags,asset_feed_spec' });
  if (d.error) throw new Error('ref creative: ' + d.error.message);
  const afs = d.asset_feed_spec;
  return {
    url_tags: d.url_tags,
    bodies: afs.bodies.map(b => ({ text: b.text })),
    titles: afs.titles.map(t => ({ text: t.text })),
    link_urls: afs.link_urls.map(u => ({ website_url: u.website_url })),
    call_to_action_types: afs.call_to_action_types,
  };
}

// proven feed/story rules (facebook+instagram); covers this group's placements
const RULES = [
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'] },
    image_label: { name: 'st_img' }, priority: 1 },
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed'], instagram_positions: ['stream', 'explore', 'explore_home', 'profile_feed'] },
    image_label: { name: 'sq_img' }, priority: 2 },
];

function buildCreativePayload(ref, feedHash, storyHash, name) {
  const afs = {
    bodies: ref.bodies, titles: ref.titles, link_urls: ref.link_urls,
    call_to_action_types: ref.call_to_action_types, ad_formats: ['AUTOMATIC_FORMAT'],
    images: [
      { hash: feedHash, adlabels: [{ name: 'sq_img' }] },
      { hash: storyHash, adlabels: [{ name: 'st_img' }] },
    ],
    asset_customization_rules: RULES,
  };
  return {
    name,
    object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
    asset_feed_spec: JSON.stringify(afs),
    url_tags: ref.url_tags,
  };
}

// copy source targeting, swap geo -> Zhytomyr, add explore, strip read-only
function buildTargeting() {
  const t = JSON.parse(JSON.stringify(SRC.targeting));
  for (const k of ['targeting_relaxation_types', 'brand_safety_content_filter_levels', 'age_range', 'targeting_optimization']) delete t[k];
  const loc = (t.geo_locations && t.geo_locations.location_types) || ['home', 'recent'];
  t.geo_locations = { cities: [ZHY_CITY], location_types: loc };
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

async function createCreative(p) {
  const r = await apiPost(`${ACCT}/adcreatives`, p);
  if (r.error) throw new Error(`creative ${r.error.code}/${r.error.error_subcode || '-'}: ${r.error.error_user_msg || r.error.message}`);
  return r.id;
}
async function createAdset(name, budget, targeting) {
  const r = await apiPost(`${ACCT}/adsets`, {
    name, campaign_id: CAMPAIGN_ID,
    optimization_goal: SRC.optimization_goal, billing_event: SRC.billing_event, bid_strategy: SRC.bid_strategy,
    daily_budget: String(budget),
    promoted_object: JSON.stringify(SRC.promoted_object),
    attribution_spec: JSON.stringify(SRC.attribution_spec),
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
const del = node => spawnSync('curl', ['-s', '-X', 'DELETE', `https://graph.facebook.com/v21.0/${node}?access_token=${process.env.META_ACCESS_TOKEN}`]).stdout.toString();

async function uploadBanners(count) {
  const out = [];
  for (let i = 1; i <= count; i++) {
    const sq = await dlDropbox(`s0${i}.jpg`);
    const st = await dlDropbox(`stories0${i}.jpg`);
    const feedHash = await uploadImage(sq, `coachzhy_s0${i}.jpg`);
    const storyHash = await uploadImage(st, `coachzhy_st0${i}.jpg`);
    console.log(`  🖼  banner${i}: feed ${feedHash} | story ${storyHash}`);
    out.push({ feedHash, storyHash });
  }
  return out;
}

async function test() {
  console.log('TEST start', START_TIME);
  const ref = await loadRef();
  console.log('  headline:', ref.titles, '| link:', ref.link_urls, '| cta:', ref.call_to_action_types);
  const t = buildTargeting();
  console.log('  geo ->', t.geo_locations.cities[0].name, '| ig', t.instagram_positions, '| budget', DAILY_BUDGET, '| po.custom_conversion', SRC.promoted_object.custom_conversion_id);
  const b = (await uploadBanners(1))[0];
  const cr = await createCreative(buildCreativePayload(ref, b.feedHash, b.storyHash, `${DATE_TOKEN}_1_TEST`));
  console.log('  creative OK', cr);
  for (const fmt of ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY', 'FACEBOOK_STORY_MOBILE', 'DESKTOP_FEED_STANDARD']) {
    const p = await apiGet(`${cr}/previews`, { ad_format: fmt });
    console.log('  preview', fmt, p.error ? ('ERR ' + p.error.message) : 'OK');
  }
  console.log('  cleanup creative:', del(cr));
}

async function build() {
  console.log(`Adding ${NEW_ADSET_NAME} to ${CAMPAIGN_ID} | budget $30 | start ${START_TIME}`);
  const ref = await loadRef();
  const banners = await uploadBanners(NUM);
  const creatives = [];
  for (let i = 0; i < banners.length; i++) {
    const cid = await createCreative(buildCreativePayload(ref, banners[i].feedHash, banners[i].storyHash, `${DATE_TOKEN}_${i + 1}`));
    creatives.push(cid);
    console.log(`  🎬 banner${i + 1} creative: ${cid}`);
  }
  const asId = await createAdset(NEW_ADSET_NAME, DAILY_BUDGET, buildTargeting());
  console.log('  📂 adset:', asId);
  const adIds = [];
  for (let i = 0; i < creatives.length; i++) {
    const adId = await createAd(asId, `${DATE_TOKEN}_${i + 1}`, creatives[i]);
    adIds.push(`${DATE_TOKEN}_${i + 1}->${adId}`);
  }
  console.log('  ads:', adIds.join(', '));
  console.log(`\n✅ DONE — group ${NEW_ADSET_NAME} (${asId}) with ${creatives.length} ads, geo Zhytomyr, $30/day, all PAUSED.`);
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'test') await test();
  else if (cmd === 'build') await build();
  else console.log('cmd: test | build');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
