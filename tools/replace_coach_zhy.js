// Replace the 3 creatives in coach_041_zhy (adset 120249580854040193) with
// updated banners from the same Dropbox folder. Text/headline/link/CTA kept from
// the current creative. New ads created ACTIVE (group is live), old ads deleted
// after — seamless swap, no downtime. Warns if a re-uploaded image hash is
// unchanged (folder not actually updated).
// Usage: node tools/replace_coach_zhy.js run
const path = require('path');
const axios = require('axios');
const { apiGet, apiPost } = require('./meta_api');
const dropbox = require('./dropbox_reader');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const IG_ID = '17841447539432480';
const ADSET_ID = '120249580854040193';            // coach_041_zhy
const REF_CREATIVE_ID = '1761167131968634';        // current 1607_1 creative (text source)
const DATE_TOKEN = '2107';
const DROPBOX_LINK = 'https://www.dropbox.com/scl/fo/v6yb0a8h9fuatn4258834/ADFtXM9xJPsiOpxADAoZFss?rlkey=gvy13lh5apx2gj48hb0c8vw0r&e=1&dl=0';
const NUM = 3;
// old hashes (from the previous upload) to detect an unchanged folder
const OLD_HASHES = new Set([
  'ea674f8d6d4804f4560881c6df698e35', '629924f111487c478ad6783b088d1d1e',
  '4db5969e920612d1743a1d2bc9610388', '9af84353a57205f2cd3c6a3a86b48368',
  '1a834afec1a8ab777d0744be25e58dfe', 'f00bc76eec3d3cd87fbd800d04e33288',
]);

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
  return { name, object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }), asset_feed_spec: JSON.stringify(afs), url_tags: ref.url_tags };
}
async function createCreative(p) {
  const r = await apiPost(`${ACCT}/adcreatives`, p);
  if (r.error) throw new Error(`creative ${r.error.code}/${r.error.error_subcode || '-'}: ${r.error.error_user_msg || r.error.message}`);
  return r.id;
}
async function createAd(name, creativeId) {
  const r = await apiPost(`${ACCT}/ads`, { name, adset_id: ADSET_ID, creative: JSON.stringify({ creative_id: creativeId }), status: 'ACTIVE' });
  if (r.error) throw new Error(`ad "${name}": ${r.error.error_user_msg || r.error.message}`);
  return r.id;
}
async function listAds() {
  const d = await apiGet(`${ADSET_ID}/ads`, { fields: 'name,id,status', limit: 50 });
  if (d.error) throw new Error('list ads: ' + d.error.message);
  return d.data;
}
const { spawnSync } = require('child_process');
const del = node => spawnSync('curl', ['-s', '-X', 'DELETE', `https://graph.facebook.com/v21.0/${node}?access_token=${process.env.META_ACCESS_TOKEN}`]).stdout.toString();

async function run() {
  const oldAds = await listAds();
  console.log('Existing ads to replace:', oldAds.map(a => `${a.name}(${a.id})`).join(', '));
  const ref = await loadRef();
  console.log('Keeping copy — headline:', ref.titles[0].text, '| link:', ref.link_urls[0].website_url);

  // upload updated banners
  let unchanged = 0;
  const banners = [];
  for (let i = 1; i <= NUM; i++) {
    const sq = await dlDropbox(`s0${i}.jpg`);
    const st = await dlDropbox(`stories0${i}.jpg`);
    const feedHash = await uploadImage(sq, `coachzhy_v2_s0${i}.jpg`);
    const storyHash = await uploadImage(st, `coachzhy_v2_st0${i}.jpg`);
    if (OLD_HASHES.has(feedHash)) unchanged++;
    if (OLD_HASHES.has(storyHash)) unchanged++;
    console.log(`  🖼  banner${i}: feed ${feedHash}${OLD_HASHES.has(feedHash) ? ' (SAME)' : ''} | story ${storyHash}${OLD_HASHES.has(storyHash) ? ' (SAME)' : ''}`);
    banners.push({ feedHash, storyHash });
  }
  if (unchanged === NUM * 2) console.log('  ⚠️  ALL images identical to previous upload — Dropbox folder may not be updated.');

  // create new creatives + new ACTIVE ads
  const newAds = [];
  for (let i = 0; i < banners.length; i++) {
    const cr = await createCreative(buildCreativePayload(ref, banners[i].feedHash, banners[i].storyHash, `${DATE_TOKEN}_${i + 1}`));
    const adId = await createAd(`${DATE_TOKEN}_${i + 1}`, cr);
    newAds.push(`${DATE_TOKEN}_${i + 1}->${adId}`);
    console.log(`  ✅ new ad ${DATE_TOKEN}_${i + 1}: ${adId} (creative ${cr}) ACTIVE`);
  }

  // delete old ads
  for (const a of oldAds) {
    const r = del(a.id);
    console.log(`  🗑  deleted old ad ${a.name} (${a.id}): ${r}`);
  }
  console.log(`\n✅ DONE — replaced ${oldAds.length} creatives with ${newAds.length} new ACTIVE ads in coach_041_zhy.`);
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'run') await run();
  else console.log('cmd: run');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
