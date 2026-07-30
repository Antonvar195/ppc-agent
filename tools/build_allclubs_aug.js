// August "Рік спорту" all-clubs campaigns, split by PRICE TIER:
//   AI_Apollo_sales_allclubs_499_0108 -> Kyiv, Lviv, Vinnytsia  (price 499)
//   AI_Apollo_sales_allclubs_399_0108 -> Odesa, Boryspil, Bila Tserkva (price 399)
// Each: 4 audience groups (broad, advantage+, rem_30d, cancelled+engagement),
// 3 adaptive banners per group from Dropbox tier folder. All PAUSED, start 01.08.
// Usage: node tools/build_allclubs_aug.js test | build
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { spawnSync } = require('child_process');
const { apiGet, apiPost } = require('./meta_api');
const { dropboxRequest } = require('./dropbox_reader');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const TOKEN = process.env.META_ACCESS_TOKEN;
const PAGE_ID = '107996248132865';
const IG_ID = '17841447539432480';
const PIXEL_ID = '393751978682816';
const START_TIME = '2026-08-01T00:01:00+0300';
const DATE_TOKEN = '0108';
const LINK = 'https://apollo.online/clubs/';
const CTA = 'APPLY_NOW';
const URL_TAGS = 'utm_source=facebook&utm_medium=conversion&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';
const DROPBOX_LINK = 'https://www.dropbox.com/scl/fo/44qiv214eapjipzbnbxcf/ANHGc48uVFbziZ_pylTMbVU?rlkey=sibjfsggb3zerbo70pnat78ez&e=1&dl=0';

const IG_POS = ['stream', 'story', 'explore', 'reels', 'explore_home', 'profile_feed', 'ig_search'];
const CITY = {
  Kyiv: { country: 'UA', distance_unit: 'mile', key: '2373594', name: 'Kyiv' },
  Lviv: { country: 'UA', distance_unit: 'mile', key: '2378495', name: 'Lviv' },
  Vinnytsia: { country: 'UA', distance_unit: 'mile', key: '2397330', name: 'Vinnytsia' },
  Odessa: { country: 'UA', distance_unit: 'mile', key: '2384095', name: 'Odessa' },
  Boryspil: { country: 'UA', distance_unit: 'mile', key: '2364576', name: 'Boryspil' },
  BilaTserkva: { country: 'UA', distance_unit: 'mile', key: '2363654', name: 'Bila Tserkva' },
};

function bodyText(price) {
  return `Рік спорту за ${price} ₴ кожні 4 тижні — фіксуй свою ціну на цілий рік! 🔥

APOLLO NEXT — сучасний спортивний простір поруч із домом.

🎁 Спецпропозиція серпня: зафіксуй вигідну ціну на рік уже сьогодні.
▫️ Доступ до 16:30 у будні
▫️ Безлім у вихідні
▫️ Акція діє з 01.08 до 31.08.2026

Групові програми, сертифіковані тренери, smart-запис через застосунок, автоматизований вхід — усе, щоб жити в русі.

Приєднуйся до APOLLO NEXT!`;
}
const HEADLINE = 'Фіксуй свою ціну на рік';

// tier config: folder, price, geo cities, per-audience daily budgets (USD cents)
const TIERS = {
  '499': { folder: '499', price: '499', cities: [CITY.Kyiv, CITY.Lviv, CITY.Vinnytsia], budgets: { broad: 4200, advantage: 4200, rem: 3000, cancelled: 2500 } },
  '399': { folder: '399', price: '399', cities: [CITY.Odessa, CITY.Boryspil, CITY.BilaTserkva], budgets: { broad: 900, advantage: 800, rem: 500, cancelled: 400 } },
};

// audience group templates (geo injected per tier)
function audiences(cities, budgets) {
  const geo = { cities, location_types: ['home', 'recent'] };
  const base = { age_min: 18, age_max: 55, geo_locations: geo };
  return [
    { key: 'broad', name: 'broad_18-55_inst_treads', budget: budgets.broad,
      targeting: { ...base, publisher_platforms: ['instagram', 'threads'], instagram_positions: IG_POS, threads_positions: ['threads_stream'], targeting_automation: { advantage_audience: 0 } } },
    { key: 'advantage', name: 'advantage_18-65', budget: budgets.advantage,
      targeting: { age_min: 18, age_max: 65, geo_locations: geo, targeting_automation: { advantage_audience: 1 } } },
    { key: 'rem', name: 'rem_30d_18-55_inst_treads', budget: budgets.rem,
      targeting: { ...base, publisher_platforms: ['instagram', 'threads'], instagram_positions: IG_POS, threads_positions: ['threads_stream'], custom_audiences: [{ id: '120243045761860193' }], targeting_automation: { advantage_audience: 0 } } },
    { key: 'cancelled', name: 'cancelled+engagement_365_inst', budget: budgets.cancelled,
      targeting: { ...base, publisher_platforms: ['instagram'], instagram_positions: IG_POS, custom_audiences: [{ id: '120241907058590193' }, { id: '120241907150330193' }, { id: '120241907162830193' }], targeting_automation: { advantage_audience: 0 } } },
  ];
}

async function dlDropbox(pathInFolder) {
  const resp = await dropboxRequest(t => axios({
    method: 'post', url: 'https://content.dropboxapi.com/2/sharing/get_shared_link_file',
    headers: { Authorization: `Bearer ${t}`, 'Dropbox-API-Arg': JSON.stringify({ url: DROPBOX_LINK, path: pathInFolder }), 'Content-Type': '' },
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
// upload 3 banner sets (square+stories) from a tier folder -> [{feed,story}]
async function uploadTierBanners(folder) {
  const out = [];
  for (let i = 1; i <= 3; i++) {
    const feed = await uploadImage(await dlDropbox(`/${folder}/s0${i}.jpg`), `ac_${folder}_s0${i}.jpg`);
    const story = await uploadImage(await dlDropbox(`/${folder}/stories0${i}.jpg`), `ac_${folder}_st0${i}.jpg`);
    out.push({ feed, story });
    console.log(`    banner${i}: feed ${feed} | story ${story}`);
  }
  return out;
}

const RULES = [
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'] }, image_label: { name: 'st_img' }, priority: 1 },
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed'], instagram_positions: ['stream', 'explore', 'explore_home', 'profile_feed'] }, image_label: { name: 'sq_img' }, priority: 2 },
];
function creativePayload(body, feedHash, storyHash, name) {
  const afs = {
    bodies: [{ text: body }], titles: [{ text: HEADLINE }], link_urls: [{ website_url: LINK }],
    call_to_action_types: [CTA], ad_formats: ['AUTOMATIC_FORMAT'],
    images: [{ hash: feedHash, adlabels: [{ name: 'sq_img' }] }, { hash: storyHash, adlabels: [{ name: 'st_img' }] }],
    asset_customization_rules: RULES,
  };
  return { name, object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }), asset_feed_spec: JSON.stringify(afs), url_tags: URL_TAGS };
}
async function createCreative(p) {
  const r = await apiPost(`${ACCT}/adcreatives`, p);
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
    targeting: JSON.stringify(targeting), start_time: START_TIME, status: 'PAUSED',
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

async function buildTier(tierKey) {
  const T = TIERS[tierKey];
  const campName = `AI_Apollo_sales_allclubs_${tierKey}_${DATE_TOKEN}`;
  console.log(`\n=== ${campName} | cities ${T.cities.map(c => c.name).join('/')} ===`);
  const banners = await uploadTierBanners(T.folder);
  const body = bodyText(T.price);
  const creatives = [];
  for (let i = 0; i < 3; i++) creatives.push(await createCreative(creativePayload(body, banners[i].feed, banners[i].story, `${DATE_TOKEN}_${i + 1}`)));
  console.log('  creatives:', creatives.join(', '));
  const camp = await apiPost(`${ACCT}/campaigns`, { name: campName, objective: 'OUTCOME_SALES', buying_type: 'AUCTION', special_ad_categories: JSON.stringify([]), is_adset_budget_sharing_enabled: 'false', status: 'PAUSED' });
  if (camp.error) throw new Error('campaign: ' + camp.error.message);
  console.log('  📁 campaign', camp.id);
  const adsetsLog = [];
  for (const a of audiences(T.cities, T.budgets)) {
    const asId = await createAdset(camp.id, a.name, a.budget, a.targeting);
    for (let i = 1; i <= 3; i++) await createAd(asId, `${DATE_TOKEN}_${i}`, creatives[i - 1]);
    console.log(`    📂 ${a.name}: ${asId} | $${a.budget / 100}/d | 3 ads`);
    adsetsLog.push({ name: a.name, id: asId });
  }
  return { campaign: campName, campaign_id: camp.id, adsets: adsetsLog };
}

async function test() {
  console.log('TEST: 1 creative per tier + preview (temp adset in a temp campaign)');
  for (const tk of ['499', '399']) {
    const T = TIERS[tk];
    const feed = await uploadImage(await dlDropbox(`/${T.folder}/s01.jpg`), `t_${T.folder}_s.jpg`);
    const story = await uploadImage(await dlDropbox(`/${T.folder}/stories01.jpg`), `t_${T.folder}_st.jpg`);
    const cr = await createCreative(creativePayload(bodyText(T.price), feed, story, `t_${tk}`));
    console.log(`  ${tk}: creative ${cr}`);
    const camp = await apiPost(`${ACCT}/campaigns`, { name: 'ZZZ_AC_TEST_DEL', objective: 'OUTCOME_SALES', buying_type: 'AUCTION', special_ad_categories: JSON.stringify([]), is_adset_budget_sharing_enabled: 'false', status: 'PAUSED' });
    try {
      const A = audiences(T.cities, T.budgets);
      for (const a of [A[0], A[1], A[3]]) { // broad, advantage, cancelled (varied targeting)
        const asId = await createAdset(camp.id, a.name, a.budget, a.targeting);
        await createAd(asId, 't1', cr);
        console.log(`     ${a.name} adset+ad OK ${asId}`);
      }
      for (const fmt of ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY']) {
        const p = await apiGet(`${cr}/previews`, { ad_format: fmt });
        console.log(`     preview ${fmt}`, p.error ? 'ERR ' + p.error.message : 'OK');
      }
    } catch (e) { console.log('     TEST ERROR:', e.message); }
    console.log('     cleanup:', del(camp.id), del(cr));
  }
}

async function build() {
  const results = [];
  for (const tk of ['499', '399']) results.push(await buildTier(tk));
  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  for (const r of results) hist.push({ date: '2026-07-30', campaign_name: r.campaign, campaign_id: r.campaign_id, adsets: r.adsets, ads_count: r.adsets.length * 3 });
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));
  console.log(`\n✅ DONE — 2 campaigns, ${results.reduce((s, r) => s + r.adsets.length, 0)} groups, ${results.reduce((s, r) => s + r.adsets.length * 3, 0)} ads, all PAUSED. Start ${START_TIME}.`);
}

const cmd = process.argv[2];
(async () => { if (cmd === 'test') await test(); else if (cmd === 'build') await build(); else console.log('cmd: test | build'); })().catch(e => { console.error('❌', e.message); process.exit(1); });
