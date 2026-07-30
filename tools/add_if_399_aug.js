// Add August "Рік спорту 399" adaptive banners to the live IF campaign
// AI_Apollo_sales_IF_039_july_0107 (120249118081840193) as PAUSED ads in all 3
// groups (rem_30, local_IF, advantage_IF). Reuses the 399-tier banner hashes
// already uploaded in build_allclubs_aug. Old July ads left running — user swaps
// on 01.08. Usage: node tools/add_if_399_aug.js run
const path = require('path');
const { apiGet, apiPost } = require('./meta_api');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const IG_ID = '17841447539432480';
const CAMPAIGN_ID = '120249118081840193';
const LINK = 'https://apollo.online/clubs/apollo-next-039/';
const CTA = 'APPLY_NOW';
const HEADLINE = 'Фіксуй свою ціну на рік';
const URL_TAGS = 'utm_source=facebook&utm_medium=conversion&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';
const BODY = `Рік спорту за 399 ₴ кожні 4 тижні — фіксуй свою ціну на цілий рік! 🔥

APOLLO NEXT в Івано-Франківську — сучасний спортивний простір поруч із домом.

🎁 Спецпропозиція серпня: зафіксуй вигідну ціну на рік уже сьогодні.
▫️ Доступ до 16:30 у будні
▫️ Безлім у вихідні
▫️ Акція діє з 01.08 до 31.08.2026

Групові програми, сертифіковані тренери, smart-запис через застосунок, автоматизований вхід — усе, щоб жити в русі.

Приєднуйся до APOLLO NEXT!`;

// 399-tier banner hashes already uploaded in build_allclubs_aug
const BANNERS = [
  { feed: 'edfcef0aeba77c6ca891a33f44b68243', story: '2c61772319dc9259dab7246d5f87eb85' },
  { feed: '371eadf16c47624e85760e572689a525', story: '274720e1c3f72334077357a868d14030' },
  { feed: '37c7b3ab6461112d69f33686c1d47bf8', story: 'bdb4a6ce9ce29de4aef75152676ffb3b' },
];
const RULES = [
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'] }, image_label: { name: 'st_img' }, priority: 1 },
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed'], instagram_positions: ['stream', 'explore', 'explore_home', 'profile_feed'] }, image_label: { name: 'sq_img' }, priority: 2 },
];
function creativePayload(b, name) {
  const afs = {
    bodies: [{ text: BODY }], titles: [{ text: HEADLINE }], link_urls: [{ website_url: LINK }],
    call_to_action_types: [CTA], ad_formats: ['AUTOMATIC_FORMAT'],
    images: [{ hash: b.feed, adlabels: [{ name: 'sq_img' }] }, { hash: b.story, adlabels: [{ name: 'st_img' }] }],
    asset_customization_rules: RULES,
  };
  return { name, object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }), asset_feed_spec: JSON.stringify(afs), url_tags: URL_TAGS };
}
async function createCreative(p) {
  const r = await apiPost(`${ACCT}/adcreatives`, p);
  if (r.error) throw new Error(`creative: ${r.error.error_user_msg || r.error.message}`);
  return r.id;
}
async function createAd(adsetId, name, creativeId) {
  const r = await apiPost(`${ACCT}/ads`, { name, adset_id: adsetId, creative: JSON.stringify({ creative_id: creativeId }), status: 'PAUSED' });
  if (r.error) throw new Error(`ad "${name}": ${r.error.error_user_msg || r.error.message}`);
  return r.id;
}

async function run() {
  const d = await apiGet(`${CAMPAIGN_ID}/adsets`, { fields: 'name,id', limit: 20 });
  if (d.error) throw new Error('adsets: ' + d.error.message);
  const creatives = [];
  for (let i = 0; i < 3; i++) creatives.push(await createCreative(creativePayload(BANNERS[i], `0108_${i + 1}`)));
  console.log('creatives:', creatives.join(', '));
  for (const a of d.data) {
    for (let i = 1; i <= 3; i++) await createAd(a.id, `0108_${i}`, creatives[i - 1]);
    console.log(`  📂 ${a.name} (${a.id}): +3 ads 0108_1/2/3 [PAUSED]`);
  }
  console.log('\n✅ DONE — 3 new PAUSED "Рік спорту 399" ads added to each IF group. Swap from old July ads on 01.08.');
}
(async () => { if (process.argv[2] === 'run') await run(); else console.log('cmd: run'); })().catch(e => { console.error('❌', e.message); process.exit(1); });
