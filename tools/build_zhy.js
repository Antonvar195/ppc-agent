// Launch NEW club campaign for Zhytomyr (APOLLO NEXT 041 ЯРМАРОК), modeled 1:1
// on template A_Apollo_sales_IF_039 (120242599197610193): same 8 conversion
// adsets (video/next_creo groups skipped), geo -> Zhytomyr, adapted text/link,
// 7 adaptive banners (square->feed, stories->story) from Dropbox.
//   segment_1 adsets -> banners 1-4 · segment_2 adsets -> banners 5-7
// Usage: node tools/build_zhy.js test | build
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
const START_TIME = '2026-07-11T00:01:00+0300';
const DATE_TOKEN = '1107';
const NEW_CAMP_NAME = 'AI_Apollo_sales_ZHY_041_1107';
const LINK = 'https://apollo.online/clubs/apollo-next-041-yarmarok/';
const CTA = 'APPLY_NOW';
const HEADLINE = 'Новий спорт простір поруч';
const URL_TAGS = 'utm_source=facebook&utm_medium=conversion&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';
const DROPBOX_LINK = 'https://www.dropbox.com/scl/fo/wuznrwmtcbw7jwz21e3xa/AIdZ8AIEuS8hZkAq_PkieQ8?dl=0&e=1&rlkey=8ugl8slbw4eyhszl50g0p0q3d';

// Zhytomyr city geo (Meta key), swapped in for Ivano-Frankivsk (2371245)
const ZHY_CITY = { country: 'UA', distance_unit: 'mile', key: '2401072', name: 'Zhytomyr', region: 'Zhytomyr Oblast', region_id: '3800' };

// Adapted from template body (039 IF -> 041 Zhytomyr; city, opening date, address, m²).
const SALES_TEXT = `Зустрічай новий інноваційний спортивний простір APOLLO NEXT 041 в Житомирі.

Відкриття вже 13 серпня за адресою
майдан Згоди, 6.

✨ 1111 м² фітнес-орбіти майбутнього:
чиста енергія спорту, технології, комфорт і атмосфера, в якій хочеться не просто «ходити в зал», а жити в русі.

✨ APOLLO NEXT — це нове бачення фітнесу, де тіло, розклад і навіть настрій працюють на тебе:

▫️ Понад 48 групових програм
▫️ Smart-запис через застосунок — усе під контролем
▫️ Індивідуальні та групові сесії із сертифікованими тренерами
▫️ Вентильовані душові, продуманий фудхакінг, вендинг зі смаколиками
▫️ Простір без хейту — лише підтримка, мотивація й твій темп
▫️ Cheat Meal Days із піцою, челенджами та дружньою атмосферою
▫️ Автоматизований вхід — без черг і без стопів
▫️ Зона «Потрібниць»: попий, перепочинь, подивись на себе в новому світлі

Підписки від 299 ₴ / 4 тижні.
Максимум гнучкості — мінімум зобов’язань.

Приєднуйся до нового рівня спорту з APOLLO NEXT.`;

const SRC = JSON.parse(fs.readFileSync(path.join(__dirname, '../history/zhy_template_adsets.json'), 'utf8')).data
  .filter(a => !/video|next_creo/.test(a.name));

// --- Dropbox: download a file from the shared folder by name ---
async function dlDropbox(fileName) {
  const resp = await dropbox.dropboxRequest(token => axios({
    method: 'post',
    url: 'https://content.dropboxapi.com/2/sharing/get_shared_link_file',
    headers: {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({ url: DROPBOX_LINK, path: '/' + fileName }),
      'Content-Type': '',
    },
    data: '', responseType: 'arraybuffer', maxContentLength: 50 * 1024 * 1024,
  }));
  return Buffer.from(resp.data);
}

async function uploadImageBufferToMeta(buffer, name) {
  const r = await apiPost(`${ACCT}/adimages`, { bytes: buffer.toString('base64'), name });
  if (r.error) throw new Error('image upload: ' + r.error.message);
  const img = Object.values(r.images || {})[0];
  if (!img) throw new Error('no image hash returned');
  return img.hash;
}

// Upload the 7 banner sets (square + stories) -> [{feedHash, storyHash}] (index 0 = banner1)
async function uploadBanners(count) {
  const out = [];
  for (let i = 1; i <= count; i++) {
    const sq = await dlDropbox(`square${i}.jpg`);
    const st = await dlDropbox(`stories${i}.jpg`);
    const feedHash = await uploadImageBufferToMeta(sq, `zhy_square${i}.jpg`);
    const storyHash = await uploadImageBufferToMeta(st, `zhy_stories${i}.jpg`);
    console.log(`  🖼  banner${i}: feed ${feedHash} | story ${storyHash}`);
    out.push({ feedHash, storyHash });
  }
  return out;
}

// Faithful targeting copy: swap geo -> Zhytomyr, add 'explore' when 'explore_home'
// present, keep targeting_automation, strip read-only/derived fields.
function cleanTargeting(src) {
  const t = JSON.parse(JSON.stringify(src));
  for (const k of ['brand_safety_content_filter_levels', 'age_range', 'targeting_relaxation_types', 'targeting_optimization']) delete t[k];
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

function buildCreative(hashes, name) {
  const afs = {
    bodies: [{ text: SALES_TEXT }],
    titles: [{ text: HEADLINE }],
    link_urls: [{ website_url: LINK }],
    call_to_action_types: [CTA],
    ad_formats: ['AUTOMATIC_FORMAT'],
    images: [
      { hash: hashes.feedHash, adlabels: [{ name: 'sq_img' }] },
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

const { spawnSync } = require('child_process');
function del(node) {
  return spawnSync('curl', ['-s', '-X', 'DELETE', `https://graph.facebook.com/v21.0/${node}?access_token=${process.env.META_ACCESS_TOKEN}`]).stdout.toString();
}

// which banner numbers go into an adset by its name (segment_1 -> 1..4, segment_2 -> 5..7)
function bannersFor(name) {
  if (/segment_1/.test(name)) return [1, 2, 3, 4];
  if (/segment_2/.test(name)) return [5, 6, 7];
  return [1, 2, 3, 4];
}
const zhyName = (n) => n.replace(/IF/g, 'ZHY');

async function test() {
  console.log('TEST: 1 banner + temp campaign + 1 OFFSITE_CONVERSIONS adset + adaptive banner ad');
  const banners = await uploadBanners(1);
  const camp = await apiPost(`${ACCT}/campaigns`, { name: 'ZZZ_ZHY_TEST_DEL', objective: 'OUTCOME_SALES', buying_type: 'AUCTION',
    special_ad_categories: JSON.stringify([]), is_adset_budget_sharing_enabled: 'false', status: 'PAUSED' });
  if (camp.error) { console.log('campaign FAIL', camp.error.message); return; }
  try {
    const local = SRC.find(s => s.name === 'local_IF_segment_1');
    const t = cleanTargeting(local.targeting);
    console.log('  geo ->', JSON.stringify(t.geo_locations.cities[0].name), '| ig_pos', JSON.stringify(t.instagram_positions));
    const asId = await createAdset(camp.id, 'ZZZ_as', local.daily_budget, t);
    console.log('  adset OK', asId);
    const cr = await createCreative(buildCreative(banners[0], `${DATE_TOKEN}_1`));
    const adId = await createAd(asId, `${DATE_TOKEN}_1`, cr);
    console.log('  adaptive banner ad OK', adId);
    for (const fmt of ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY', 'FACEBOOK_STORY_MOBILE', 'DESKTOP_FEED_STANDARD']) {
      const p = await apiGet(`${cr}/previews`, { ad_format: fmt });
      console.log('  preview', fmt, p.error ? ('ERR ' + p.error.message) : 'OK');
    }
  } catch (e) { console.log('TEST ERROR:', e.message); }
  console.log('cleanup:', del(camp.id));
}

async function build() {
  console.log(`Building ${NEW_CAMP_NAME} (${SRC.length} adsets)...`);
  const banners = await uploadBanners(7);
  // one creative per banner (same text/link/headline), reused across adsets
  const creatives = [];
  for (let i = 0; i < banners.length; i++) {
    const cid = await createCreative(buildCreative(banners[i], `${DATE_TOKEN}_${i + 1}`));
    creatives.push(cid);
    console.log(`  🎬 banner${i + 1} creative: ${cid}`);
  }
  const camp = await apiPost(`${ACCT}/campaigns`, { name: NEW_CAMP_NAME, objective: 'OUTCOME_SALES', buying_type: 'AUCTION',
    special_ad_categories: JSON.stringify([]), is_adset_budget_sharing_enabled: 'false', status: 'PAUSED' });
  if (camp.error) throw new Error(`campaign: ${camp.error.message}`);
  console.log('📁 campaign:', camp.id);
  const log = { campaign: NEW_CAMP_NAME, campaign_id: camp.id, adsets: [], ads_count: 0 };
  for (const src of SRC) {
    const name = zhyName(src.name);
    const t = cleanTargeting(src.targeting);
    const asId = await createAdset(camp.id, name, src.daily_budget, t);
    const nums = bannersFor(src.name);
    const adIds = [];
    for (const n of nums) {
      const adId = await createAd(asId, `${DATE_TOKEN}_${n}`, creatives[n - 1]);
      adIds.push(`${DATE_TOKEN}_${n}`); log.ads_count++;
    }
    console.log(`  📂 ${name}: ${asId} | budget ${src.daily_budget} | banners [${nums.join(',')}] | PAUSED`);
    log.adsets.push({ name, id: asId, ads: adIds });
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
