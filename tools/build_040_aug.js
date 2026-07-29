// Copy the latest 040 campaign (AI_Apollo_sales_Kyiv_040_1007 / 120249417437040193)
// as AI_Apollo_sales_Kyiv_040_0108 for the August "2nd club on Troeshchyna" offer:
// same 3 groups/targeting/budgets, ONE adaptive banner ad per group (new Dropbox
// creative square->feed, stories->story), new copy per the banner offer.
// Usage: node tools/build_040_aug.js test | build
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { spawnSync } = require('child_process');
const { apiGet, apiPost } = require('./meta_api');
const dropbox = require('./dropbox_reader');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const TOKEN = process.env.META_ACCESS_TOKEN;
const PAGE_ID = '107996248132865';
const IG_ID = '17841447539432480';
const PIXEL_ID = '393751978682816';
const NEW_CAMP_NAME = 'AI_Apollo_sales_Kyiv_040_0108';
const DATE_TOKEN = '0108';
const AD_NAME = '0108_1';
const START_TIME = '2026-08-01T00:01:00+0300';
const LINK = 'https://apollo.online/clubs/apollo-next-040-tcz-eko-market/';
const CTA = 'APPLY_NOW';
const HEADLINE = 'Рік спорту за 499 ₴ кожні 4 тижні';
const URL_TAGS = 'utm_source=facebook&utm_medium=conversion&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';
const DROPBOX_LINK = 'https://www.dropbox.com/scl/fo/sycvmdva4pvrgokvz6riw/AAOZu0u4htQHjllCJcWSSbQ?rlkey=kob7tfxt9k8ihy6c3vlithcza&e=1&dl=0';

const BODY = `Наш 2-й клуб на Троєщині вже відчинено! 🔥

APOLLO NEXT за адресою просп. Червоної Калини, 17 («ЕКО Маркет») — сучасний спортивний простір поруч із домом.

🎁 Спецпропозиція серпня: зафіксуй ціну на цілий рік — лише 499 ₴ кожні 4 тижні!
▫️ Доступ до 16:30 у будні
▫️ Безлім у вихідні
▫️ Акція діє з 01.08 до 31.08.2026

1150 м² фітнес-орбіти майбутнього: групові програми, сертифіковані тренери, smart-запис через застосунок, автоматизований вхід і атмосфера, в якій хочеться жити в русі.

Приєднуйся до APOLLO NEXT — зафіксуй вигідну ціну на рік уже сьогодні!`;

const SRC = JSON.parse(fs.readFileSync(path.join(__dirname, '../history/k040_aug_src_adsets.json'), 'utf8')).data;

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
async function uploadBanner() {
  const feedHash = await uploadImage(await dlDropbox('square.jpg'), 'k040aug_square.jpg');
  const storyHash = await uploadImage(await dlDropbox('stories.jpg'), 'k040aug_stories.jpg');
  console.log('  🖼  feed', feedHash, '| story', storyHash);
  return { feedHash, storyHash };
}

const RULES = [
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'] }, image_label: { name: 'st_img' }, priority: 1 },
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed'], instagram_positions: ['stream', 'explore', 'explore_home', 'profile_feed'] }, image_label: { name: 'sq_img' }, priority: 2 },
];
function buildCreative(h, name) {
  const afs = {
    bodies: [{ text: BODY }], titles: [{ text: HEADLINE }], link_urls: [{ website_url: LINK }],
    call_to_action_types: [CTA], ad_formats: ['AUTOMATIC_FORMAT'],
    images: [{ hash: h.feedHash, adlabels: [{ name: 'sq_img' }] }, { hash: h.storyHash, adlabels: [{ name: 'st_img' }] }],
    asset_customization_rules: RULES,
  };
  return { name, object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }), asset_feed_spec: JSON.stringify(afs), url_tags: URL_TAGS };
}

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
async function createAdset(campaignId, src) {
  const r = await apiPost(`${ACCT}/adsets`, {
    name: src.name, campaign_id: campaignId,
    optimization_goal: src.optimization_goal, billing_event: src.billing_event, bid_strategy: src.bid_strategy,
    daily_budget: String(src.daily_budget),
    promoted_object: JSON.stringify(src.promoted_object || { pixel_id: PIXEL_ID, custom_event_type: 'PURCHASE' }),
    attribution_spec: JSON.stringify(src.attribution_spec || [{ event_type: 'CLICK_THROUGH', window_days: 7 }]),
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

async function test() {
  console.log('TEST: 1 banner + creative + temp adset + previews');
  const h = await uploadBanner();
  const cr = await createCreative(buildCreative(h, AD_NAME + '_TEST'));
  console.log('  creative OK', cr);
  const camp = await apiPost(`${ACCT}/campaigns`, { name: 'ZZZ_040AUG_TEST_DEL', objective: 'OUTCOME_SALES', buying_type: 'AUCTION', special_ad_categories: JSON.stringify([]), is_adset_budget_sharing_enabled: 'false', status: 'PAUSED' });
  try {
    const asId = await createAdset(camp.id, SRC.find(s => s.name === 'local_kyiv_segment_1'));
    const adId = await createAd(asId, AD_NAME, cr);
    console.log('  adset+ad OK', asId, adId);
    for (const fmt of ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY', 'FACEBOOK_STORY_MOBILE', 'DESKTOP_FEED_STANDARD']) {
      const p = await apiGet(`${cr}/previews`, { ad_format: fmt });
      console.log('  preview', fmt, p.error ? 'ERR ' + p.error.message : 'OK');
    }
  } catch (e) { console.log('TEST ERROR:', e.message); }
  console.log('  cleanup:', del(camp.id), del(cr));
}

async function build() {
  console.log(`Building ${NEW_CAMP_NAME} | start ${START_TIME}`);
  const h = await uploadBanner();
  const cr = await createCreative(buildCreative(h, AD_NAME));
  console.log('  🎬 creative:', cr);
  const camp = await apiPost(`${ACCT}/campaigns`, { name: NEW_CAMP_NAME, objective: 'OUTCOME_SALES', buying_type: 'AUCTION', special_ad_categories: JSON.stringify([]), is_adset_budget_sharing_enabled: 'false', status: 'PAUSED' });
  if (camp.error) throw new Error('campaign: ' + camp.error.message);
  console.log('📁 campaign:', camp.id);
  const log = { campaign: NEW_CAMP_NAME, campaign_id: camp.id, adsets: [], ads_count: 0 };
  for (const src of SRC) {
    const asId = await createAdset(camp.id, src);
    const adId = await createAd(asId, AD_NAME, cr);
    console.log(`  📂 ${src.name}: ${asId} | budget ${src.daily_budget} | 1 ad ${adId} | PAUSED`);
    log.adsets.push({ name: src.name, id: asId }); log.ads_count++;
  }
  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  hist.push({ date: '2026-07-29', campaign_name: log.campaign, campaign_id: log.campaign_id, adsets: log.adsets, ads_count: log.ads_count });
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));
  console.log(`\n✅ DONE — ${log.adsets.length} groups, ${log.ads_count} ads, all PAUSED. Start ${START_TIME}.`);
}

const cmd = process.argv[2];
(async () => { if (cmd === 'test') await test(); else if (cmd === 'build') await build(); else console.log('cmd: test | build'); })().catch(e => { console.error('❌', e.message); process.exit(1); });
