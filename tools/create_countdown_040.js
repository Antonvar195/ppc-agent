require('dotenv').config();
const axios = require('axios');
const { apiPost } = require('./meta_api');
const { refreshDropboxToken, dropboxRequest } = require('./dropbox_reader');

const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const INSTAGRAM_ACTOR_ID = process.env.META_INSTAGRAM_ACTOR_ID;
const PIXEL_ID = '393751978682816';
const DROPBOX_LINK = 'https://www.dropbox.com/scl/fo/lv9s5zytqbqk6ckteun51/AMhgC7uZzePvzHXVvoymdIA?rlkey=hlaq73fy1d0l691txsmn24ow1&dl=0';
const CLUB_URL = 'https://apollo.online/clubs/apollo-next-040-tcz-eko-market/';

// Дані по кожному дню countdown
const DAYS = [
  {
    name: '8_day',
    budget: 30000,
    startDate: '2026-06-17',
    endDate:   '2026-06-18',
    squareFile: 's08.jpg',
    storyFile:  'stories08.jpg',
    title: 'Новий APOLLO NEXT 040 на Троєщині',
    body: `💥 APOLLO NEXT 040 вже ось-ось засяє

Готуємо простір, де не просто качаються м'язи, а справді прокачується настрій, здорове тіло, енергія й харчування.

Останні підписки за найнижчою ціною до відкриття — 199 ₴
Залишилось лише 160 підписок.`
  },
  {
    name: '7_day',
    budget: 20000,
    startDate: '2026-06-18',
    endDate:   '2026-06-19',
    squareFile: 's07.jpg',
    storyFile:  'stories07.jpg',
    title: 'Новий APOLLO NEXT 040 на Троєщині',
    body: `💥 APOLLO NEXT 040 на Троєщині вже ось-ось засяє

Готуємо простір, де не просто качаються м'язи, а справді прокачується настрій, здорове тіло, енергія й харчування.

Останні підписки за найнижчою ціною до відкриття — 199 ₴
Вже залишилось лише 99 підписок.`
  },
  {
    name: '6_day',
    budget: 20000,
    startDate: '2026-06-19',
    endDate:   '2026-06-20',
    squareFile: 's06.jpg',
    storyFile:  'stories06.jpg',
    title: 'Новий APOLLO NEXT 040 на Троєщині',
    body: `Троєщина! Пора збирати речі в зал! ❤️‍🔥
або хоча б думки, бо за вчора купили ще 27/99 підписок.

APOLLO NEXT 040 — це:
✔️ тренажери з майбутнього [чи просто найкраще з сучасного]
✔️ тренери з сертифікацією
✔️ найнижча ціна до відкриття — 199 ₴ за 4 тижні

Це твій шанс почати з ком'юніті, яке не знецінює жодні зусилля, а шукає підхід, щоб спорт став частиною і твого життя ❤️

Залишилось лише 72 підписки — і все, привіт вища ціна.`
  },
  {
    name: '5_day',
    budget: 20000,
    startDate: '2026-06-20',
    endDate:   '2026-06-21',
    squareFile: 's05.jpg',
    storyFile:  'stories05.jpg',
    title: 'Новий APOLLO NEXT 040 на Троєщині',
    body: `Фінальний розгін перед запуском APOLLO NEXT 040🏃

Стартуємо на просп. Червоної Калини, 17:
вже натираємо дзеркала й тренажери, щоб за кілька місяців ти легко порівняв(-ла) своє «до/після» 🫶

І так, 199 ₴ за 4 тижні — ще актуальна ціна.
Тут буде:
• комфортно, бо ніхто не тисне на тебе
• мотиваційно, як у серіалах про трансформацію
• атмосферно, де навіть лінь тікає з бігової доріжки
Залишилось ще 62 підписки. Приєднаєшся?`
  },
  {
    name: '4_day',
    budget: 20000,
    startDate: '2026-06-21',
    endDate:   '2026-06-22',
    squareFile: 's04.jpg',
    storyFile:  'stories04.jpg',
    title: 'Новий APOLLO NEXT 040 на Троєщині',
    body: `Мінус чотири дні до твоєї нової фітнес-звички ❤️‍🔥

ЕКО МАРКЕТ — тут засяє новий APOLLO NEXT 040 — спорт простір, який не схожий на звичний "зал із 2009".

APOLLO NEXT 040 — це твоя формула:
тренажери + підтримка + космос = результат
І так, ще діє ціна 199 ₴, але… ще трохи — й ні.

Залишилось 50 підписок рівно ✔️`
  },
  {
    name: '3_day',
    budget: 30000,
    startDate: '2026-06-22',
    endDate:   '2026-06-23',
    squareFile: 's03.jpg',
    storyFile:  'stories03.jpg',
    title: 'Новий APOLLO NEXT 040 на Троєщині',
    body: `Ще три дні, і двері APOLLO NEXT 040 відчиняться — а разом з ними твоя можливість почати дбати про своє тіло 🤍

З правильного спорт простору, з правильною командою, з правильного настрою.
Підписки по 199 ₴ майже закінчились, є ще 31, але їх забирають, як протеїнові батончики після гарячої трені 🔥

Поспіши зловити свою за найнижчою можливою ціною!`
  },
  {
    name: '2_day',
    budget: 50000,
    startDate: '2026-06-23',
    endDate:   '2026-06-24',
    squareFile: 's02.jpg',
    storyFile:  'stories02.jpg',
    title: 'Новий APOLLO NEXT 040 на Троєщині',
    body: `💫 Вже через 48 годин ми запускаємо APOLLO NEXT 040!

А сьогодні лови останній шанс застрибнути в зал майбутнього за 199 ₴ на 4 тижні ❤️‍🔥

Це твоя форма, твій простір, твій ривок.

Вибирай себе сьогодні, не завтра. І злітай з нами на орбіту спорту!`
  },
  {
    name: '1_day',
    budget: 50000,
    startDate: '2026-06-24',
    endDate:   '2026-06-25',
    squareFile: 's01.jpg',
    storyFile:  'stories01.jpg',
    title: 'Новий APOLLO NEXT 040 на Троєщині',
    body: `🔥 APOLLO NEXT 040 — це більше, ніж спортзал. Це твій персональний апгрейд до найкращого спорт простору

✨ Профі тренери, що не кричать, а підтримують
✨ Тренажери, що не риплять, а мотивують
✨ Простір, де можна бути собою і ставати кращим

Було 160 підписок — лишилось 5.
Чекаєш знак? Ось він.

Київ, ЕКО МАРКЕТ — ми відкриваємось вже завтра.
Ти з нами?`
  }
];

// Таргетинг — копія старої кампанії, нові координати
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

// Скачати файл з Dropbox shared папки
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

// Завантажити зображення в Meta → hash
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

  // Створити кампанію
  console.log('\n📢 Створюю кампанію...');
  const campaignResult = await apiPost(`${AD_ACCOUNT_ID}/campaigns`, {
    name: 'A_Apollo_sales_countdown_Kyiv_040_1706',
    objective: 'OUTCOME_SALES',
    status: 'PAUSED',
    special_ad_categories: '[]',
    is_adset_budget_sharing_enabled: false
  });
  if (campaignResult.error) throw new Error('Campaign: ' + campaignResult.error.message);
  const campaignId = campaignResult.id;
  console.log('✅ Кампанія:', campaignId);

  const results = [];

  for (const day of DAYS) {
    console.log(`\n━━━ ${day.name} ━━━`);

    // Створити адсет
    const startTime = day.startDate === '2026-06-17'
      ? new Date().toISOString() // сьогодні — стартуємо зараз
      : `${day.startDate}T00:01:00+0300`;
    const endTime = `${day.endDate}T00:01:00+0300`;

    const adsetResult = await apiPost(`${AD_ACCOUNT_ID}/adsets`, {
      name: day.name,
      campaign_id: campaignId,
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
      console.log(`❌ Адсет помилка: ${adsetResult.error.message}`);
      results.push({ day: day.name, status: 'adset_failed', error: adsetResult.error.message });
      continue;
    }
    const adsetId = adsetResult.id;
    console.log(`✅ Адсет: ${adsetId}`);

    // Завантажити зображення
    console.log(`   ⬇️ ${day.squareFile}...`);
    const squareBuffer = await downloadFile(day.squareFile);
    const squareHash = await uploadImage(squareBuffer, day.squareFile);
    console.log(`   ✅ square hash: ${squareHash}`);

    console.log(`   ⬇️ ${day.storyFile}...`);
    const storyBuffer = await downloadFile(day.storyFile);
    const storyHash = await uploadImage(storyBuffer, day.storyFile);
    console.log(`   ✅ story hash: ${storyHash}`);

    // Створити creative з asset_feed_spec (square для feed, story для Instagram Stories)
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
      page_id: PAGE_ID,
      instagram_actor_id: INSTAGRAM_ACTOR_ID
    });

    if (creativeResult.error) {
      console.log(`   ⚠️ asset_feed_spec помилка: ${creativeResult.error.message}`);
      // Fallback: object_story_spec з square зображенням
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
        results.push({ day: day.name, adsetId, status: 'creative_failed', error: fallbackCreative.error.message });
        continue;
      }
      console.log(`   ✅ Creative (fallback): ${fallbackCreative.id}`);
      const adResult = await apiPost(`${AD_ACCOUNT_ID}/ads`, {
        name: day.name,
        adset_id: adsetId,
        creative: JSON.stringify({ creative_id: fallbackCreative.id }),
        status: 'PAUSED'
      });
      if (adResult.error) {
        console.log(`   ❌ Ad: ${adResult.error.message}`);
        results.push({ day: day.name, adsetId, status: 'ad_failed', error: adResult.error.message });
      } else {
        console.log(`   ✅ Оголошення: ${adResult.id}`);
        results.push({ day: day.name, adsetId, adId: adResult.id, status: 'ok_fallback' });
      }
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
      console.log(`   ❌ Ad: ${adResult.error.message}`);
      results.push({ day: day.name, adsetId, status: 'ad_failed', error: adResult.error.message });
    } else {
      console.log(`   ✅ Оголошення: ${adResult.id}`);
      results.push({ day: day.name, adsetId, adId: adResult.id, status: 'ok' });
    }
  }

  console.log('\n\n════════════════════════════════');
  console.log('📊 ПІДСУМОК:');
  console.log(`Кампанія: ${campaignId}`);
  results.forEach(r => {
    const icon = r.status === 'ok' ? '✅' : r.status === 'ok_fallback' ? '⚠️' : '❌';
    console.log(`${icon} ${r.day}: adset ${r.adsetId || '—'} | ad ${r.adId || r.error || '—'}`);
  });
  console.log('════════════════════════════════');
}

main().catch(err => {
  console.error('❌ Критична помилка:', err.message);
  process.exit(1);
});
