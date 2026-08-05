require('dotenv').config();
const https = require('https');
const axios = require('axios');
const { apiGet, apiPost } = require('./meta_api');
const { refreshDropboxToken, dropboxRequest } = require('./dropbox_reader');

const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const TOKEN = process.env.META_ACCESS_TOKEN;
const PAGE_ID = '107996248132865';
const INSTAGRAM_USER_ID = '17841447539432480'; // з робочої кампанії 120238799722260193
const PIXEL_ID = '393751978682816';
const CAMPAIGN_ID = '120247884725450193';
const API_VERSION = 'v21.0';
const DROPBOX_LINK = 'https://www.dropbox.com/scl/fo/lv9s5zytqbqk6ckteun51/AMhgC7uZzePvzHXVvoymdIA?rlkey=hlaq73fy1d0l691txsmn24ow1&dl=0';
const BASE_URL = 'https://apollo.online/clubs/apollo-next-040-tcz-eko-market/';
// UTM — окреме поле url_tags, не в URL
const UTM_TAGS = 'utm_source=facebook&utm_medium=conversion&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';

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

const DAYS = [
  // s01=8днів, s02=7днів, ..., s08=1день (зворотній порядок файлів)
  { name: '8_day', budget: 30000, startDate: '2026-06-17', endDate: '2026-06-19', square: 's01.jpg', story: 'stories01.jpg',
    title: 'Новий APOLLO NEXT 040 на Троєщині',
    body: `💥 APOLLO NEXT 040 вже ось-ось засяє\n\nГотуємо простір, де не просто качаються м'язи, а справді прокачується настрій, здорове тіло, енергія й харчування.\n\nОстанні підписки за найнижчою ціною до відкриття — 199 ₴\nЗалишилось лише 160 підписок.` },
  { name: '7_day', budget: 20000, startDate: '2026-06-18', endDate: '2026-06-19', square: 's02.jpg', story: 'stories02.jpg',
    title: 'Новий APOLLO NEXT 040 на Троєщині',
    body: `💥 APOLLO NEXT 040 на Троєщині вже ось-ось засяє\n\nГотуємо простір, де не просто качаються м'язи, а справді прокачується настрій, здорове тіло, енергія й харчування.\n\nОстанні підписки за найнижчою ціною до відкриття — 199 ₴\nВже залишилось лише 99 підписок.` },
  { name: '6_day', budget: 20000, startDate: '2026-06-19', endDate: '2026-06-20', square: 's03.jpg', story: 'stories03.jpg',
    title: 'Новий APOLLO NEXT 040 на Троєщині',
    body: `Троєщина! Пора збирати речі в зал! ❤️‍🔥\nабо хоча б думки, бо за вчора купили ще 27/99 підписок.\n\nAPOLLO NEXT 040 — це:\n✔️ тренажери з майбутнього [чи просто найкраще з сучасного]\n✔️ тренери з сертифікацією\n✔️ найнижча ціна до відкриття — 199 ₴ за 4 тижні\n\nЗалишилось лише 72 підписки — і все, привіт вища ціна.` },
  { name: '5_day', budget: 20000, startDate: '2026-06-20', endDate: '2026-06-21', square: 's04.jpg', story: 'stories04.jpg',
    title: 'Новий APOLLO NEXT 040 на Троєщині',
    body: `Фінальний розгін перед запуском APOLLO NEXT 040🏃\n\nСтартуємо на просп. Червоної Калини, 17:\nвже натираємо дзеркала й тренажери, щоб за кілька місяців ти легко порівняв(-ла) своє «до/після» 🫶\n\nЗалишилось ще 62 підписки. Приєднаєшся?` },
  { name: '4_day', budget: 20000, startDate: '2026-06-21', endDate: '2026-06-22', square: 's05.jpg', story: 'stories05.jpg',
    title: 'Новий APOLLO NEXT 040 на Троєщині',
    body: `Мінус чотири дні до твоєї нової фітнес-звички ❤️‍🔥\n\nЕКО МАРКЕТ — тут засяє новий APOLLO NEXT 040 — спорт простір, який не схожий на звичний "зал із 2009".\n\nЗалишилось 50 підписок рівно ✔️` },
  { name: '3_day', budget: 30000, startDate: '2026-06-22', endDate: '2026-06-23', square: 's06.jpg', story: 'stories06.jpg',
    title: 'Новий APOLLO NEXT 040 на Троєщині',
    body: `Ще три дні, і двері APOLLO NEXT 040 відчиняться — а разом з ними твоя можливість почати дбати про своє тіло 🤍\n\nПідписки по 199 ₴ майже закінчились, є ще 31 🔥` },
  { name: '2_day', budget: 50000, startDate: '2026-06-23', endDate: '2026-06-24', square: 's07.jpg', story: 'stories07.jpg',
    title: 'Новий APOLLO NEXT 040 на Троєщині',
    body: `💫 Вже через 48 годин ми запускаємо APOLLO NEXT 040!\n\nОстанній шанс застрибнути в зал майбутнього за 199 ₴ на 4 тижні ❤️‍🔥` },
  { name: '1_day', budget: 50000, startDate: '2026-06-24', endDate: '2026-06-25', square: 's08.jpg', story: 'stories08.jpg',
    title: 'Новий APOLLO NEXT 040 на Троєщині',
    body: `🔥 APOLLO NEXT 040 — це більше, ніж спортзал. Це твій персональний апгрейд.\n\nБуло 160 підписок — лишилось 5.\nКиїв, ЕКО МАРКЕТ — ми відкриваємось вже завтра. Ти з нами?` }
];

function apiDelete(id) {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams({ access_token: TOKEN }).toString();
    const req = https.request({
      hostname: 'graph.facebook.com',
      path: `/${API_VERSION}/${id}?${query}`,
      method: 'DELETE'
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

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

  // Видалити старі адсети
  console.log('\n🗑️  Видаляю старі адсети...');
  const oldAdsets = await apiGet(`${CAMPAIGN_ID}/adsets`, { fields: 'id,name', limit: 20 });
  if (oldAdsets.error) throw new Error('Get adsets: ' + oldAdsets.error.message);
  for (const as of (oldAdsets.data || [])) {
    const del = await apiDelete(as.id);
    console.log(`   Видалено: ${as.name} (${as.id}) → ${del.success ? 'OK' : JSON.stringify(del)}`);
  }

  const results = [];

  for (const day of DAYS) {
    console.log(`\n━━━ ${day.name} ━━━`);

    const startTime = day.startDate === '2026-06-17'
      ? new Date().toISOString()
      : `${day.startDate}T00:01:00+03:00`;
    const endTime = day.name === '8_day'
      ? '2026-06-19T00:01:00+03:00'
      : `${day.endDate}T00:01:00+03:00`;

    // Адсет без is_dynamic_creative — як у старій кампанії
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
      console.log(`❌ Адсет: ${adsetResult.error.message}`);
      results.push({ day: day.name, status: 'adset_failed', error: adsetResult.error.message });
      continue;
    }
    const adsetId = adsetResult.id;
    console.log(`✅ Адсет: ${adsetId}`);

    // Завантажити зображення
    console.log(`   ⬇️  ${day.square}...`);
    const squareBuf = await downloadFile(day.square);
    const squareHash = await uploadImage(squareBuf, day.square);
    console.log(`   ✅ square: ${squareHash}`);

    console.log(`   ⬇️  ${day.story}...`);
    const storyBuf = await downloadFile(day.story);
    const storyHash = await uploadImage(storyBuf, day.story);
    console.log(`   ✅ story:  ${storyHash}`);

    // Унікальні adlabel-імена для цього дня
    const ts = Date.now();
    const labels = {
      squareImg:  `${day.name}_sq_img_${ts}`,
      storyImg:   `${day.name}_st_img_${ts}`,
      squareBody: `${day.name}_sq_body_${ts}`,
      storyBody:  `${day.name}_st_body_${ts}`,
      squareTitle:`${day.name}_sq_ttl_${ts}`,
      storyTitle: `${day.name}_st_ttl_${ts}`,
      squareUrl:  `${day.name}_sq_url_${ts}`,
      storyUrl:   `${day.name}_st_url_${ts}`
    };

    // asset_feed_spec — один креатив, два формати
    // asset_customization_rules прив'язують всі 4 елементи (image+body+title+url) до плейсменту
    const assetFeedSpec = {
      images: [
        { hash: squareHash, adlabels: [{ name: labels.squareImg  }] },
        { hash: storyHash,  adlabels: [{ name: labels.storyImg   }] }
      ],
      bodies: [
        { text: day.body, adlabels: [{ name: labels.squareBody }, { name: labels.storyBody }] }
      ],
      titles: [
        { text: day.title, adlabels: [{ name: labels.squareTitle }, { name: labels.storyTitle }] }
      ],
      link_urls: [
        {
          website_url: BASE_URL,
          display_url: BASE_URL,
          adlabels: [{ name: labels.squareUrl }, { name: labels.storyUrl }]
        }
      ],
      call_to_action_types: ['APPLY_NOW'],
      descriptions: [{ text: '' }],
      ad_formats: ['AUTOMATIC_FORMAT'],
      optimization_type: 'PLACEMENT',
      asset_customization_rules: [
        {
          // Instagram Stories → story image
          customization_spec: {
            publisher_platforms: ['instagram'],
            instagram_positions: ['story']
          },
          image_label:    { name: labels.storyImg   },
          body_label:     { name: labels.storyBody  },
          title_label:    { name: labels.storyTitle },
          link_url_label: { name: labels.storyUrl   },
          priority: 1
        },
        {
          // Facebook feed + Instagram feed + Threads → square image
          customization_spec: {
            publisher_platforms: ['facebook', 'instagram', 'threads'],
            facebook_positions: ['feed'],
            instagram_positions: ['stream', 'explore', 'explore_home'],
            threads_positions: ['threads_stream']
          },
          image_label:    { name: labels.squareImg   },
          body_label:     { name: labels.squareBody  },
          title_label:    { name: labels.squareTitle },
          link_url_label: { name: labels.squareUrl   },
          priority: 2
        }
      ]
    };

    // Креатив: asset_feed_spec + object_story_spec (page_id + instagram_user_id)
    // url_tags — окреме поле, не всередині link_urls
    const creativeResult = await apiPost(`${AD_ACCOUNT_ID}/adcreatives`, {
      name: `${day.name}_creative`,
      asset_feed_spec: JSON.stringify(assetFeedSpec),
      object_story_spec: JSON.stringify({
        page_id: PAGE_ID,
        instagram_user_id: INSTAGRAM_USER_ID
      }),
      url_tags: UTM_TAGS
    });

    if (creativeResult.error) {
      console.log(`❌ Creative: ${creativeResult.error.message}`);
      console.log(`   Деталі: ${JSON.stringify(creativeResult.error)}`);
      results.push({ day: day.name, adsetId, status: 'creative_failed', error: creativeResult.error.message });
      continue;
    }
    console.log(`   ✅ Creative: ${creativeResult.id}`);

    const adResult = await apiPost(`${AD_ACCOUNT_ID}/ads`, {
      name: day.name,
      adset_id: adsetId,
      creative: JSON.stringify({ creative_id: creativeResult.id }),
      status: 'PAUSED'
    });

    if (adResult.error) {
      console.log(`❌ Ad: ${adResult.error.message}`);
      results.push({ day: day.name, adsetId, status: 'ad_failed', error: adResult.error.message });
    } else {
      console.log(`   ✅ Ad: ${adResult.id}`);
      results.push({ day: day.name, adsetId, adId: adResult.id, status: 'ok' });
    }
  }

  console.log('\n\n════════════════════════════════');
  console.log('📊 ПІДСУМОК:');
  console.log(`Кампанія: ${CAMPAIGN_ID}`);
  results.forEach(r => {
    const icon = r.status === 'ok' ? '✅' : '❌';
    console.log(`${icon} ${r.day}: adset=${r.adsetId || '—'} | ad=${r.adId || r.error || '—'}`);
  });
  console.log('════════════════════════════════');
}

main().catch(err => {
  console.error('❌ Критична помилка:', err.message);
  process.exit(1);
});
