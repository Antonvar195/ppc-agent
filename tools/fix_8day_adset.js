require('dotenv').config();
const axios = require('axios');
const { apiPost } = require('./meta_api');
const { refreshDropboxToken, dropboxRequest } = require('./dropbox_reader');

const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const PIXEL_ID = '393751978682816';
const CAMPAIGN_ID = '120247884725450193';
const DROPBOX_LINK = 'https://www.dropbox.com/scl/fo/lv9s5zytqbqk6ckteun51/AMhgC7uZzePvzHXVvoymdIA?rlkey=hlaq73fy1d0l691txsmn24ow1&dl=0';
const CLUB_URL = 'https://apollo.online/clubs/apollo-next-040-tcz-eko-market/';

const TARGETING = {
  age_min: 18,
  age_max: 50,
  geo_locations: {
    custom_locations: [{
      distance_unit: 'kilometer',
      latitude: 50.50240,
      longitude: 30.59168,
      radius: 4,
      primary_city_id: 2373594,
      region_id: 4290,
      country: 'UA'
    }],
    location_types: ['home', 'recent']
  },
  brand_safety_content_filter_levels: ['FEED_RELAXED'],
  targeting_automation: {
    advantage_audience: 0,
    individual_setting: { geo: 0 }
  },
  publisher_platforms: ['facebook', 'instagram', 'threads'],
  facebook_positions: ['feed'],
  instagram_positions: ['stream', 'story', 'explore', 'explore_home'],
  device_platforms: ['mobile', 'desktop'],
  threads_positions: ['threads_stream']
};

async function downloadFile(fileName) {
  const response = await dropboxRequest(token => axios({
    method: 'post',
    url: 'https://content.dropboxapi.com/2/sharing/get_shared_link_file',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({ url: DROPBOX_LINK, path: '/' + fileName }),
      'Content-Type': ''
    },
    data: '',
    responseType: 'arraybuffer',
    maxContentLength: 50 * 1024 * 1024
  }));
  return Buffer.from(response.data);
}

async function uploadImage(buffer, name) {
  const base64 = buffer.toString('base64');
  const result = await apiPost(`${AD_ACCOUNT_ID}/adimages`, { bytes: base64, name });
  if (result.error) throw new Error('Image upload: ' + result.error.message);
  const imgData = Object.values(result.images || {})[0];
  if (!imgData) throw new Error('Meta не повернув hash для ' + name);
  return imgData.hash;
}

async function main() {
  console.log('🔄 Оновлюю Dropbox токен...');
  await refreshDropboxToken();

  const day = {
    name: '8_day',
    budget: 30000,
    squareFile: 's08.jpg',
    storyFile:  'stories08.jpg',
    title: 'Новий APOLLO NEXT 040 на Троєщині',
    body: `💥 APOLLO NEXT 040 вже ось-ось засяє

Готуємо простір, де не просто качаються м'язи, а справді прокачується настрій, здорове тіло, енергія й харчування.

Останні підписки за найнижчою ціною до відкриття — 199 ₴
Залишилось лише 160 підписок.`
  };

  // Start now, end June 19 00:01 Kyiv — guarantees >24h window
  const startTime = new Date().toISOString();
  const endTime = '2026-06-19T00:01:00+03:00';

  console.log(`\n━━━ ${day.name} ━━━`);
  console.log(`   start: ${startTime}`);
  console.log(`   end:   ${endTime}`);

  const adsetResult = await apiPost(`${AD_ACCOUNT_ID}/adsets`, {
    name: day.name,
    campaign_id: CAMPAIGN_ID,
    daily_budget: day.budget,
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    targeting: JSON.stringify(TARGETING),
    promoted_object: JSON.stringify({ pixel_id: PIXEL_ID, custom_event_type: 'PURCHASE' }),
    status: 'PAUSED',
    start_time: startTime,
    end_time: endTime
  });

  if (adsetResult.error) {
    console.log(`❌ Адсет помилка: ${JSON.stringify(adsetResult.error)}`);
    process.exit(1);
  }
  const adsetId = adsetResult.id;
  console.log(`✅ Адсет: ${adsetId}`);

  // Download images
  console.log(`   ⬇️ ${day.squareFile}...`);
  const squareBuffer = await downloadFile(day.squareFile);
  const squareHash = await uploadImage(squareBuffer, day.squareFile);
  console.log(`   ✅ square hash: ${squareHash}`);

  console.log(`   ⬇️ ${day.storyFile}...`);
  const storyBuffer = await downloadFile(day.storyFile);
  const storyHash = await uploadImage(storyBuffer, day.storyFile);
  console.log(`   ✅ story hash: ${storyHash}`);

  // Try asset_feed_spec WITHOUT instagram_actor_id (that was causing the error)
  const assetFeedSpec = {
    images: [
      { hash: squareHash, adlabels: [{ name: 'square' }] },
      { hash: storyHash,  adlabels: [{ name: 'story'  }] }
    ],
    bodies: [{ text: day.body }],
    titles: [{ text: day.title }],
    link_urls: [{
      website_url: CLUB_URL,
      display_url: CLUB_URL
    }],
    call_to_action_types: ['APPLY_NOW'],
    descriptions: [{ text: '' }],
    ad_formats: ['AUTOMATIC_FORMAT'],
    optimization_type: 'PLACEMENT',
    asset_customization_rules: [
      {
        customization_spec: {
          publisher_platforms: ['instagram'],
          instagram_positions: ['story']
        },
        image_label: { name: 'story' },
        priority: 1
      },
      {
        customization_spec: {},
        image_label: { name: 'square' },
        priority: 2
      }
    ]
  };

  const creativeResult = await apiPost(`${AD_ACCOUNT_ID}/adcreatives`, {
    name: `${day.name}_creative`,
    asset_feed_spec: JSON.stringify(assetFeedSpec),
    page_id: PAGE_ID
    // No instagram_actor_id — that was causing "must be a valid Instagram account id"
  });

  let creativeId;
  if (creativeResult.error) {
    console.log(`   ⚠️ asset_feed_spec помилка: ${creativeResult.error.message}`);
    console.log('   🔄 Fallback to object_story_spec...');
    const fallbackCreative = await apiPost(`${AD_ACCOUNT_ID}/adcreatives`, {
      name: `${day.name}_creative`,
      object_story_spec: JSON.stringify({
        page_id: PAGE_ID,
        link_data: {
          link: CLUB_URL,
          message: day.body,
          name: day.title,
          image_hash: squareHash,
          call_to_action: { type: 'APPLY_NOW', value: { link: CLUB_URL } }
        }
      })
    });
    if (fallbackCreative.error) {
      console.log(`   ❌ Fallback creative: ${fallbackCreative.error.message}`);
      process.exit(1);
    }
    console.log(`   ✅ Creative (fallback): ${fallbackCreative.id}`);
    creativeId = fallbackCreative.id;
  } else {
    console.log(`   ✅ Creative (asset_feed_spec): ${creativeResult.id}`);
    creativeId = creativeResult.id;
  }

  const adResult = await apiPost(`${AD_ACCOUNT_ID}/ads`, {
    name: day.name,
    adset_id: adsetId,
    creative: JSON.stringify({ creative_id: creativeId }),
    status: 'PAUSED'
  });

  if (adResult.error) {
    console.log(`   ❌ Ad: ${adResult.error.message}`);
    process.exit(1);
  }

  console.log(`   ✅ Оголошення: ${adResult.id}`);
  console.log('\n✅ 8_day готовий!');
  console.log(`   Кампанія: ${CAMPAIGN_ID}`);
  console.log(`   Адсет:    ${adsetId}`);
  console.log(`   Об'ява:   ${adResult.id}`);
}

main().catch(err => {
  console.error('❌ Критична помилка:', err.message);
  process.exit(1);
});
