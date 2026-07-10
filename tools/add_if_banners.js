// Add 2 new adaptive-banner ads (sets 02 & 03) to each group of
// AI_Apollo_sales_IF_039_july_0107 (120249118081840193). Text/headline/link/CTA
// and placement rules are copied verbatim from the existing 0107_1 creative so
// the new ads are identical except for the banner image. New ads created PAUSED.
// Usage: node tools/add_if_banners.js test | build
const path = require('path');
const axios = require('axios');
const { apiGet, apiPost } = require('./meta_api');
const dropbox = require('./dropbox_reader');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const IG_ID = '17841447539432480';
const CAMPAIGN_ID = '120249118081840193';
const REF_CREATIVE_ID = '2117976209600852'; // existing 0107_1 creative (source of truth for text/rules)
const DROPBOX_LINK = 'https://www.dropbox.com/scl/fo/4h65lmq56wg9u4k6jgb7g/AMZzQIg6jNEQ7gatu8AQXjU?rlkey=oqcv6q9cpbjj9c0opl90vsdzo&e=1&dl=0';
// new banners to add: ad name -> {square, story} filenames in the folder
const NEW_ADS = [
  { name: '0107_2', square: 's02.jpg', story: 'stories02.jpg' },
  { name: '0107_3', square: 's03.jpg', story: 'stories03.jpg' },
];

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

// Pull text + placement rules from the existing creative (verbatim reuse)
async function loadRef() {
  const d = await apiGet(REF_CREATIVE_ID, { fields: 'url_tags,asset_feed_spec' });
  if (d.error) throw new Error('ref creative: ' + d.error.message);
  const afs = d.asset_feed_spec;
  // Proven working placement rules (same as today's ZHY build) — reusing the
  // existing creative's rules verbatim triggers 1885923 (they carry
  // audience_network/threads specs that demand an empty default rule).
  const rules = [
    { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'] },
      image_label: { name: 'st_img' }, priority: 1 },
    { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed'], instagram_positions: ['stream', 'explore', 'explore_home', 'profile_feed'] },
      image_label: { name: 'sq_img' }, priority: 2 },
  ];
  return {
    url_tags: d.url_tags,
    bodies: afs.bodies.map(b => ({ text: b.text })),
    titles: afs.titles.map(t => ({ text: t.text })),
    link_urls: afs.link_urls.map(u => ({ website_url: u.website_url })),
    call_to_action_types: afs.call_to_action_types,
    rules,
  };
}

function buildCreativePayload(ref, feedHash, storyHash, name) {
  const afs = {
    bodies: ref.bodies, titles: ref.titles, link_urls: ref.link_urls,
    call_to_action_types: ref.call_to_action_types, ad_formats: ['AUTOMATIC_FORMAT'],
    images: [
      { hash: feedHash, adlabels: [{ name: 'sq_img' }] },
      { hash: storyHash, adlabels: [{ name: 'st_img' }] },
    ],
    asset_customization_rules: ref.rules,
  };
  return {
    name,
    object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
    asset_feed_spec: JSON.stringify(afs),
    url_tags: ref.url_tags,
  };
}
async function createCreative(p) {
  const r = await apiPost(`${ACCT}/adcreatives`, p);
  if (r.error) throw new Error(`creative ${r.error.code}/${r.error.error_subcode || '-'}: ${r.error.error_user_msg || r.error.message}`);
  return r.id;
}
async function createAd(adsetId, name, creativeId) {
  const r = await apiPost(`${ACCT}/ads`, { name, adset_id: adsetId, creative: JSON.stringify({ creative_id: creativeId }), status: 'PAUSED' });
  if (r.error) throw new Error(`ad "${name}": ${r.error.error_user_msg || r.error.message}`);
  return r.id;
}
async function getAdsets() {
  const d = await apiGet(`${CAMPAIGN_ID}/adsets`, { fields: 'name,id', limit: 50 });
  if (d.error) throw new Error('adsets: ' + d.error.message);
  return d.data;
}

const { spawnSync } = require('child_process');
const del = node => spawnSync('curl', ['-s', '-X', 'DELETE', `https://graph.facebook.com/v21.0/${node}?access_token=${process.env.META_ACCESS_TOKEN}`]).stdout.toString();

async function uploadNewBanners() {
  const out = [];
  for (const a of NEW_ADS) {
    const sq = await dlDropbox(a.square);
    const st = await dlDropbox(a.story);
    const feedHash = await uploadImage(sq, `if_${a.name}_sq.jpg`);
    const storyHash = await uploadImage(st, `if_${a.name}_st.jpg`);
    console.log(`  🖼  ${a.name}: feed ${feedHash} | story ${storyHash}`);
    out.push({ ...a, feedHash, storyHash });
  }
  return out;
}

async function test() {
  console.log('TEST: build 1 new creative (02) + preview, then delete it');
  const ref = await loadRef();
  console.log('  ref headline:', ref.titles, '| link:', ref.link_urls, '| cta:', ref.call_to_action_types);
  const sq = await dlDropbox(NEW_ADS[0].square);
  const st = await dlDropbox(NEW_ADS[0].story);
  const feedHash = await uploadImage(sq, 'test_if_sq.jpg');
  const storyHash = await uploadImage(st, 'test_if_st.jpg');
  const cr = await createCreative(buildCreativePayload(ref, feedHash, storyHash, '0107_2_TEST'));
  console.log('  creative OK', cr);
  for (const fmt of ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY', 'FACEBOOK_STORY_MOBILE', 'DESKTOP_FEED_STANDARD']) {
    const p = await apiGet(`${cr}/previews`, { ad_format: fmt });
    console.log('  preview', fmt, p.error ? ('ERR ' + p.error.message) : 'OK');
  }
  console.log('  cleanup creative:', del(cr));
}

async function build() {
  const ref = await loadRef();
  const adsets = await getAdsets();
  console.log(`Adding ${NEW_ADS.length} ads to each of ${adsets.length} groups in ${CAMPAIGN_ID}`);
  const banners = await uploadNewBanners();
  // one creative per new banner, reused across all groups (identical text/link)
  const creatives = {};
  for (const b of banners) {
    creatives[b.name] = await createCreative(buildCreativePayload(ref, b.feedHash, b.storyHash, b.name));
    console.log(`  🎬 ${b.name} creative: ${creatives[b.name]}`);
  }
  let added = 0;
  for (const as of adsets) {
    const ids = [];
    for (const b of banners) {
      const adId = await createAd(as.id, b.name, creatives[b.name]);
      ids.push(`${b.name}->${adId}`); added++;
    }
    console.log(`  📂 ${as.name} (${as.id}): + ${ids.join(', ')} [PAUSED]`);
  }
  console.log(`\n✅ DONE — added ${added} ads (${NEW_ADS.map(a => a.name).join(', ')}) across ${adsets.length} groups, all PAUSED.`);
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'test') await test();
  else if (cmd === 'build') await build();
  else console.log('cmd: test | build');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
