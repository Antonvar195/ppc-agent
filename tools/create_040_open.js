/**
 * create_040_open.js
 *
 * Дублює кампанію A_Apollo_sales_Kyiv_040_1505
 * Зміни: 3 адсети, нові креативи (040 open), старт 25.06.26 00:01, новий текст
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const TOKEN = process.env.META_ACCESS_TOKEN;
const AD_ACCOUNT_ID = 'act_915627749178795';
const PAGE_ID = '107996248132865';
const INSTAGRAM_USER_ID = '17841447539432480';
const PIXEL_ID = '393751978682816';
const V = 'v21.0';
const BASE = `https://graph.facebook.com/${V}`;

const CLUB_URL = 'https://apollo.online/clubs/apollo-next-040-tcz-eko-market/';
const START_TIME = '2026-06-25T00:01:00+03:00';
const UTM = 'utm_source=facebook&utm_medium=conversion&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';
const TITLE = 'Новий APOLLO NEXT на Троєщині';

const BODY_MAIN = `Новий APOLLO NEXT 040 на Троєщині вже відчинено!

Над ЕКО маркетом, пр. Червоної Калини, 17

✨ 1150 м² фітнес-орбіти майбутнього:
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
Максимум гнучкості — мінімум зобов'язань.

Приєднуйся до нового рівня спорту з APOLLO NEXT.`;

const BODY_STORY = `Новий APOLLO NEXT 040 на Троєщині вже відчинено!

Над ЕКО маркетом, пр. Червоної Калини, 17

✨ 1150 м² фітнес-орбіти майбутнього:
чиста енергія спорту, технології, комфорт і атмосфера, в якій хочеться не просто «ходити в зал», а жити в русі.

✨ APOLLO NEXT — це нове бачення фітнесу, де тіло, розклад і навіть настрій працюють на тебе:

▫️ Понад 48 групових програм на тиждень
▫️ Smart-запис через застосунок — усе під контролем
▫️ Індивідуальні та групові сесії із сертифікованими тренерами
▫️ Вентильовані душові, продуманий фудхакінг, вендинг зі смаколиками
▫️ Простір без хейту — лише підтримка, мотивація й твій темп
▫️ Cheat Meal Days із піцою, челенджами та дружньою атмосферою
▫️ Автоматизований вхід — без черг і без стопів
▫️ Зона «Потрібниць»: попий, перепочинь, подивись на себе в новому світлі

Підписки від 299 ₴ / 4 тижні.
Максимум гнучкості — мінімум зобов'язань.

Приєднуйся до нового рівня спорту з APOLLO NEXT.`;

// ─── API HELPER ────────────────────────────────────────────────────────────────

async function post(path, data) {
  const url = `${BASE}/${path}`;
  const params = new URLSearchParams({ access_token: TOKEN });
  const res = await axios.post(`${url}?${params}`, data, {
    headers: { 'Content-Type': 'application/json' }
  });
  if (res.data.error) throw new Error(JSON.stringify(res.data.error));
  return res.data;
}

// ─── UPLOAD IMAGE ──────────────────────────────────────────────────────────────

async function uploadImage(filePath, filename) {
  const form = new FormData();
  form.append(filename, fs.createReadStream(filePath), { filename, contentType: 'image/jpeg' });

  const res = await axios.post(
    `${BASE}/${AD_ACCOUNT_ID}/adimages`,
    form,
    { headers: { ...form.getHeaders() }, params: { access_token: TOKEN } }
  );
  if (res.data.error) throw new Error(JSON.stringify(res.data.error));
  const hash = res.data.images[filename].hash;
  console.log(`   ✅ ${filename}: ${hash}`);
  return hash;
}

// ─── CREATE CREATIVE ───────────────────────────────────────────────────────────

async function createCreative(name, squareHash, storyHash, seed) {
  const ts = Date.now() + seed;
  const L = {
    sqI: `sq_img_${ts}`,  stI: `st_img_${ts}`,
    sqB: `sq_bod_${ts}`,  stB: `st_bod_${ts}`,
    sqT: `sq_ttl_${ts}`,  stT: `st_ttl_${ts}`,
    sqU: `sq_url_${ts}`,  stU: `st_url_${ts}`,
  };

  const assetFeedSpec = {
    images: [
      { hash: squareHash, adlabels: [{ name: L.sqI }] },
      { hash: storyHash,  adlabels: [{ name: L.stI }] }
    ],
    bodies: [
      { text: BODY_MAIN,  adlabels: [{ name: L.sqB }] },
      { text: BODY_STORY, adlabels: [{ name: L.stB }] }
    ],
    titles: [
      { text: TITLE, adlabels: [{ name: L.sqT }, { name: L.stT }] }
    ],
    link_urls: [
      { website_url: CLUB_URL, display_url: CLUB_URL, adlabels: [{ name: L.sqU }, { name: L.stU }] }
    ],
    call_to_action_types: ['APPLY_NOW'],
    descriptions: [{ text: '' }],
    ad_formats: ['AUTOMATIC_FORMAT'],
    optimization_type: 'PLACEMENT',
    asset_customization_rules: [
      {
        customization_spec: {
          publisher_platforms: ['instagram'],
          instagram_positions: ['story', 'reels']
        },
        image_label:    { name: L.stI },
        body_label:     { name: L.stB },
        title_label:    { name: L.stT },
        link_url_label: { name: L.stU },
        priority: 1
      },
      {
        customization_spec: {
          publisher_platforms: ['facebook', 'instagram', 'threads'],
          facebook_positions:  ['feed'],
          instagram_positions: ['stream', 'explore', 'explore_home'],
          threads_positions:   ['threads_stream']
        },
        image_label:    { name: L.sqI },
        body_label:     { name: L.sqB },
        title_label:    { name: L.sqT },
        link_url_label: { name: L.sqU },
        priority: 2
      }
    ]
  };

  const result = await post(`${AD_ACCOUNT_ID}/adcreatives`, {
    name,
    asset_feed_spec: JSON.stringify(assetFeedSpec),
    object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: INSTAGRAM_USER_ID }),
    url_tags: UTM
  });

  console.log(`   ✅ Creative ${name}: ${result.id}`);
  return result.id;
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 AI_Apollo_sales_Kyiv_040_2506\n');

  // 1. Завантаження зображень
  console.log('📤 Завантаження зображень...');
  const hashes = {};
  for (const f of ['s01','s02','s03','stories01','stories02','stories03']) {
    hashes[f] = await uploadImage(`/tmp/040_${f}.jpg`, `${f}.jpg`);
  }

  // 2. Кампанія
  console.log('\n📋 Кампанія...');
  const campaign = await post(`${AD_ACCOUNT_ID}/campaigns`, {
    name: 'AI_Apollo_sales_Kyiv_040_2506',
    objective: 'OUTCOME_SALES',
    status: 'PAUSED',
    special_ad_categories: [],
    is_adset_budget_sharing_enabled: false
  });
  console.log(`   ✅ Campaign: ${campaign.id}`);

  // 3. Адсети
  console.log('\n📦 Адсети...');

  const adsetDefs = [
    {
      name: 'advantage_kyiv_segment_1',
      daily_budget: 4000,
      targeting: {
        age_max: 65, age_min: 18,
        excluded_custom_audiences: [{ id: '120208237776480193' }],
        geo_locations: {
          custom_locations: [{ distance_unit: 'mile', latitude: 50.504015, longitude: 30.59376, radius: 2, primary_city_id: 2373594, region_id: 4290, country: 'UA' }],
          location_types: ['home', 'recent']
        },
        targeting_automation: { advantage_audience: 1, individual_setting: { geo: 0 } }
      }
    },
    {
      name: 'engagement_kyiv_segment_1',
      daily_budget: 2500,
      targeting: {
        age_max: 50, age_min: 18,
        excluded_custom_audiences: [{ id: '120208237776480193' }],
        custom_audiences: [{ id: '120208237863600193' }, { id: '120208237878260193' }],
        geo_locations: {
          custom_locations: [{ distance_unit: 'mile', latitude: 50.478936, longitude: 30.602552, radius: 2, primary_city_id: 2373594, region_id: 4290, country: 'UA' }],
          location_types: ['home', 'recent']
        },
        brand_safety_content_filter_levels: ['FEED_RELAXED'],
        targeting_relaxation_types: { lookalike: 0, custom_audience: 0 },
        targeting_automation: { advantage_audience: 0, individual_setting: { geo: 0 } },
        publisher_platforms: ['instagram', 'threads'],
        instagram_positions: ['stream', 'story', 'reels', 'explore', 'explore_home', 'profile_feed'],
        device_platforms: ['mobile', 'desktop'],
        threads_positions: ['threads_stream']
      }
    },
    {
      name: 'local_kyiv_segment_1',
      daily_budget: 7000,
      targeting: {
        age_max: 50, age_min: 18,
        excluded_custom_audiences: [{ id: '120208237776480193' }],
        geo_locations: {
          custom_locations: [{ distance_unit: 'mile', latitude: 50.503344, longitude: 30.595133, radius: 2, primary_city_id: 2373594, region_id: 4290, country: 'UA' }],
          location_types: ['home', 'recent']
        },
        brand_safety_content_filter_levels: ['FEED_RELAXED'],
        targeting_automation: { advantage_audience: 0, individual_setting: { geo: 0 } },
        publisher_platforms: ['instagram', 'threads'],
        instagram_positions: ['stream', 'story', 'explore', 'explore_home'],
        device_platforms: ['mobile', 'desktop'],
        threads_positions: ['threads_stream']
      }
    }
  ];

  const adsetIds = {};
  for (const as of adsetDefs) {
    const result = await post(`${AD_ACCOUNT_ID}/adsets`, {
      name: as.name,
      campaign_id: campaign.id,
      daily_budget: as.daily_budget,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      status: 'PAUSED',
      start_time: START_TIME,
      targeting: JSON.stringify(as.targeting),
      promoted_object: JSON.stringify({ pixel_id: PIXEL_ID, custom_event_type: 'PURCHASE' }),
      pacing_type: JSON.stringify(['standard'])
    });
    adsetIds[as.name] = result.id;
    console.log(`   ✅ ${as.name}: ${result.id}`);
  }

  // 4. Креативи + оголошення (3 пари: s01+stories01, s02+stories02, s03+stories03)
  console.log('\n🎨 Креативи і оголошення...');

  const pairs = [
    { sq: 's01', st: 'stories01', n: 1 },
    { sq: 's02', st: 'stories02', n: 2 },
    { sq: 's03', st: 'stories03', n: 3 }
  ];

  for (const [adsetName, adsetId] of Object.entries(adsetIds)) {
    console.log(`\n  ${adsetName}:`);
    for (const pair of pairs) {
      const creativeId = await createCreative(
        `040_open_2506_${pair.n}`,
        hashes[pair.sq],
        hashes[pair.st],
        pair.n * 1000
      );
      const ad = await post(`${AD_ACCOUNT_ID}/ads`, {
        name: `2506_${pair.n}`,
        adset_id: adsetId,
        creative: JSON.stringify({ creative_id: creativeId }),
        status: 'PAUSED'
      });
      console.log(`   ✅ Ad 2506_${pair.n}: ${ad.id}`);
    }
  }

  console.log('\n✅ Готово!');
  console.log(`   Campaign ID: ${campaign.id}`);
  console.log(`   Старт: 25.06.2026 о 00:01`);
  console.log(`   Статус: PAUSED`);
}

main().catch(err => {
  console.error('❌', err.response?.data?.error || err.message);
  process.exit(1);
});
