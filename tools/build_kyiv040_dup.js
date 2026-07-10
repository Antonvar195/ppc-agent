// Duplicate AI_Apollo_sales_Kyiv_040_2506 (120247959474050193) as
// AI_Apollo_sales_Kyiv_040_1007 with start today, replacing the 3 creatives with
// 3 new adaptive banners (s/stories 01-03) from Dropbox. Same 3 groups, targeting,
// budgets, settings. Text/headline/link/CTA copied from the source creative.
// Usage: node tools/build_kyiv040_dup.js test | build
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { apiGet, apiPost } = require('./meta_api');
const dropbox = require('./dropbox_reader');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const IG_ID = '17841447539432480';
const PIXEL_ID = '393751978682816';
const DATE_TOKEN = '1007';
const NEW_CAMP_NAME = 'AI_Apollo_sales_Kyiv_040_1007';
const REF_CREATIVE_ID = '917709534663681'; // source 2506_1 creative (text/headline/link/cta source of truth)
const DROPBOX_LINK = 'https://www.dropbox.com/scl/fo/fw4vk8im2u7yypejplr12/ACKHTY_a38gC7kVVG0Cbtrw?rlkey=dvwruzficz8k75o4niqedgtc0&e=1&dl=0';
// start today (now + 5 min, UTC) so it can run as soon as activated
const START_TIME = new Date(Date.now() + 5 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, '+0000');
const NUM_BANNERS = 3; // sets 01,02,03 -> ads 1007_1,1007_2,1007_3

const SRC = JSON.parse(fs.readFileSync(path.join(__dirname, '../history/kyiv040_src_adsets.json'), 'utf8')).data;

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

// text + placement rules from the source creative (rules re-pointed to fresh labels)
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

// Proven two-rule formula (same as ZHY / add_if_banners): story -> vertical,
// feed -> square, facebook+instagram. No threads/audience_network in rules (that
// triggers 1885923's "need a default rule"); threads targeting still serves via
// Meta fallback, and ad creation is unaffected.
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

// faithful targeting copy: keep custom_locations geo, strip read-only fields,
// ensure explore present, custom_audiences -> {id}, targeting_automation kept
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

async function createCreative(p) {
  const r = await apiPost(`${ACCT}/adcreatives`, p);
  if (r.error) throw new Error(`creative ${r.error.code}/${r.error.error_subcode || '-'}: ${r.error.error_user_msg || r.error.message}`);
  return r.id;
}
async function createAdset(campaignId, name, budget, targeting) {
  const r = await apiPost(`${ACCT}/adsets`, {
    name, campaign_id: campaignId,
    optimization_goal: 'OFFSITE_CONVERSIONS', billing_event: 'IMPRESSIONS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    daily_budget: String(budget),
    promoted_object: JSON.stringify({ pixel_id: PIXEL_ID, custom_event_type: 'PURCHASE' }),
    attribution_spec: JSON.stringify([{ event_type: 'CLICK_THROUGH', window_days: 7 }]),
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
    const feedHash = await uploadImage(sq, `k040_s0${i}.jpg`);
    const storyHash = await uploadImage(st, `k040_st0${i}.jpg`);
    console.log(`  🖼  banner${i}: feed ${feedHash} | story ${storyHash}`);
    out.push({ feedHash, storyHash });
  }
  return out;
}

async function test() {
  console.log('TEST: start', START_TIME, '| 1 creative + previews + 1 adset');
  const ref = await loadRef();
  console.log('  ref headline:', ref.titles, '| link:', ref.link_urls, '| cta:', ref.call_to_action_types);
  const b = (await uploadBanners(1))[0];
  const cr = await createCreative(buildCreativePayload(ref, b.feedHash, b.storyHash, `${DATE_TOKEN}_1_TEST`));
  console.log('  creative OK', cr);
  const camp = await apiPost(`${ACCT}/campaigns`, { name: 'ZZZ_K040_TEST_DEL', objective: 'OUTCOME_SALES', buying_type: 'AUCTION',
    special_ad_categories: JSON.stringify([]), is_adset_budget_sharing_enabled: 'false', status: 'PAUSED' });
  try {
    const t = cleanTargeting(SRC[0].targeting);
    const asId = await createAdset(camp.id, 'ZZZ_as', SRC[0].daily_budget, t);
    console.log('  adset OK', asId, '| geo custom_locations:', JSON.stringify(t.geo_locations.custom_locations?.length), 'pt');
    const adId = await createAd(asId, `${DATE_TOKEN}_1`, cr);
    console.log('  ad OK', adId);
    for (const fmt of ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY', 'INSTAGRAM_REELS']) {
      const p = await apiGet(`${cr}/previews`, { ad_format: fmt });
      console.log('  preview', fmt, p.error ? ('ERR ' + p.error.message) : 'OK');
    }
  } catch (e) { console.log('TEST ERROR:', e.message); }
  console.log('  cleanup campaign:', del(camp.id));
  console.log('  cleanup creative:', del(cr));
}

async function build() {
  console.log(`Building ${NEW_CAMP_NAME} | start ${START_TIME} | ${SRC.length} groups`);
  const ref = await loadRef();
  const banners = await uploadBanners(NUM_BANNERS);
  const creatives = [];
  for (let i = 0; i < banners.length; i++) {
    const cid = await createCreative(buildCreativePayload(ref, banners[i].feedHash, banners[i].storyHash, `${DATE_TOKEN}_${i + 1}`));
    creatives.push(cid);
    console.log(`  🎬 banner${i + 1} creative: ${cid}`);
  }
  const camp = await apiPost(`${ACCT}/campaigns`, { name: NEW_CAMP_NAME, objective: 'OUTCOME_SALES', buying_type: 'AUCTION',
    special_ad_categories: JSON.stringify([]), is_adset_budget_sharing_enabled: 'false', status: 'PAUSED' });
  if (camp.error) throw new Error(`campaign: ${camp.error.message}`);
  console.log('📁 campaign:', camp.id);
  const log = { campaign: NEW_CAMP_NAME, campaign_id: camp.id, adsets: [], ads_count: 0 };
  for (const src of SRC) {
    const t = cleanTargeting(src.targeting);
    const asId = await createAdset(camp.id, src.name, src.daily_budget, t);
    const adIds = [];
    for (let i = 0; i < creatives.length; i++) {
      const adId = await createAd(asId, `${DATE_TOKEN}_${i + 1}`, creatives[i]);
      adIds.push(`${DATE_TOKEN}_${i + 1}`); log.ads_count++;
    }
    console.log(`  📂 ${src.name}: ${asId} | budget ${src.daily_budget} | ads [${adIds.join(',')}] | PAUSED`);
    log.adsets.push({ name: src.name, id: asId, ads: adIds });
  }
  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  hist.push({ date: '2026-07-10', campaign_name: log.campaign, campaign_id: log.campaign_id, adsets: log.adsets, ads_count: log.ads_count });
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));
  console.log(`\n✅ DONE — ${log.adsets.length} groups, ${log.ads_count} ads, all PAUSED. Start ${START_TIME}.`);
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'test') await test();
  else if (cmd === 'build') await build();
  else console.log('cmd: test | build');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
