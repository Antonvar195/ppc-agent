require('dotenv').config();
const axios = require('axios');
const { apiPost } = require('./meta_api');
const { refreshDropboxToken, dropboxRequest } = require('./dropbox_reader');

// Countdown до відкриття APOLLO NEXT 041 (Житомир, ТРЦ ЯРМАРОК, майдан Згоди 6)
// Відкриття 13.08.2026. Аналоги: create_countdown_040.js (Київ) + A_Apollo_sales_countdown_IF_2805 (039)

const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const INSTAGRAM_ACTOR_ID = process.env.META_INSTAGRAM_ACTOR_ID;
const PIXEL_ID = '393751978682816';
const DROPBOX_LINK = 'https://www.dropbox.com/scl/fo/p53przv9nxt3uic9m41ju/AH-Y9_iA-Wgw_FicvmkWX1k?rlkey=kzkn1y2r2wvklktj75vot0xwz&dl=0';
const CLUB_URL = 'https://apollo.online/clubs/apollo-next-041-yarmarok/';
const CAMPAIGN_NAME = 'AI_Apollo_sales_countdown_ZHY_041_0608';
const TITLE = 'Новий APOLLO NEXT 041 у Житомирі';
const URL_TAGS = 'utm_source=facebook&utm_medium=conversion&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';

// ⚠️ Мапінг файлів перевірений візуально — імена файлів НЕ відповідають номеру дня.
// day 8 → s08 / stories01 ... day 1 → s01 / stories08
// ⚠️ 8_day (s08 / stories01, 160/160, 05.08) свідомо пропущений:
// кампанія збирається ввечері 05.08, на день лишалось ~4 години — старт з 7_day 06.08.
const DAYS = [
  {
    name: '7_day',
    budget: 15000,
    startDate: '2026-08-06',
    endDate:   '2026-08-07',
    squareFile: 's02.jpg',
    storyFile:  'stories02.jpg',
    subs: '99/160',
    body: `💥 APOLLO NEXT 041 на майдані Згоди вже ось-ось засяє

Готуємо простір, де не просто качаються м'язи, а справді прокачується настрій, здорове тіло, енергія й харчування.

Останні підписки за найнижчою ціною до відкриття — 299 ₴ за 4 тижні
Вже залишилось лише 99 підписок.`
  },
  {
    name: '6_day',
    budget: 15000,
    startDate: '2026-08-07',
    endDate:   '2026-08-08',
    squareFile: 's03.jpg',
    storyFile:  'stories03.jpg',
    subs: '72/160',
    body: `Житомире! Пора збирати речі в зал! ❤️‍🔥
або хоча б думки, бо за вчора купили ще 27/99 підписок.

APOLLO NEXT 041 — це:
✔️ тренажери з майбутнього [чи просто найкраще з сучасного]
✔️ тренери з сертифікацією
✔️ найнижча ціна до відкриття — 299 ₴ за 4 тижні

Це твій шанс почати з ком'юніті, яке не знецінює жодні зусилля, а шукає підхід, щоб спорт став частиною і твого життя ❤️

Залишилось лише 72 підписки — і все, привіт вища ціна.`
  },
  {
    name: '5_day',
    budget: 15000,
    startDate: '2026-08-08',
    endDate:   '2026-08-09',
    squareFile: 's04.jpg',
    storyFile:  'stories04.jpg',
    subs: '62/160',
    body: `Фінальний розгін перед запуском APOLLO NEXT 041🏃

Стартуємо на майдані Згоди, 6:
вже натираємо дзеркала й тренажери, щоб за кілька місяців ти легко порівняв(-ла) своє «до/після» 🫶

І так, 299 ₴ за 4 тижні — ще актуальна ціна.
Тут буде:
• комфортно, бо ніхто не тисне на тебе
• мотиваційно, як у серіалах про трансформацію
• атмосферно, де навіть лінь тікає з бігової доріжки
Залишилось ще 62 підписки. Приєднаєшся?`
  },
  {
    name: '4_day',
    budget: 20000,
    startDate: '2026-08-09',
    endDate:   '2026-08-10',
    squareFile: 's05.jpg',
    storyFile:  'stories05.jpg',
    subs: '55/160',
    body: `Мінус чотири дні до твоєї нової фітнес-звички ❤️‍🔥

ТРЦ ЯРМАРОК — тут засяє новий APOLLO NEXT 041 — спорт простір, який не схожий на звичний "зал із 2009".

APOLLO NEXT 041 — це твоя формула:
тренажери + підтримка + космос = результат
І так, ще діє ціна 299 ₴, але… ще трохи — й ні.

Залишилось 55 підписок ✔️`
  },
  {
    name: '3_day',
    budget: 25000,
    startDate: '2026-08-10',
    endDate:   '2026-08-11',
    squareFile: 's06.jpg',
    storyFile:  'stories06.jpg',
    subs: '31/160',
    body: `Ще три дні, і двері APOLLO NEXT 041 відчиняться — а разом з ними твоя можливість почати дбати про своє тіло 🤍

З правильного спорт простору, з правильною командою, з правильного настрою.
Підписки по 299 ₴ майже закінчились, є ще 31, але їх забирають, як протеїнові батончики після гарячої трені 🔥

Поспіши зловити свою за найнижчою можливою ціною!`
  },
  {
    name: '2_day',
    budget: 35000,
    startDate: '2026-08-11',
    endDate:   '2026-08-12',
    squareFile: 's07.jpg',
    storyFile:  'stories07.jpg',
    subs: '24/160',
    body: `💫 Вже через 48 годин ми запускаємо APOLLO NEXT 041!

А сьогодні лови останній шанс застрибнути в зал майбутнього за 299 ₴ на 4 тижні ❤️‍🔥

Це твоя форма, твій простір, твій ривок.

Вибирай себе сьогодні, не завтра. І злітай з нами на орбіту спорту!`
  },
  {
    name: '1_day',
    budget: 40000,
    startDate: '2026-08-12',
    endDate:   '2026-08-13',
    squareFile: 's01.jpg',
    storyFile:  'stories08.jpg',
    subs: '5/160',
    body: `🔥 APOLLO NEXT 041 — це більше, ніж спортзал. Це твій персональний апгрейд до найкращого спорт простору

✨ Профі тренери, що не кричать, а підтримують
✨ Тренажери, що не риплять, а мотивують
✨ Простір, де можна бути собою і ставати кращим

Було 160 підписок — лишилось 5.
Чекаєш знак? Ось він.

Житомир, ТРЦ ЯРМАРОК — ми відкриваємось вже завтра.
Ти з нами?`
  }
];

// Таргетинг: місто Житомир (як у живих кампаніях 041), плейсменти — як у countdown 040
const TARGETING = {
  age_min: 18,
  age_max: 50,
  geo_locations: {
    cities: [{ key: '2401072', country: 'UA', region_id: '3804', distance_unit: 'mile' }],
    location_types: ['home', 'recent']
  },
  excluded_custom_audiences: [{ id: '120208237776480193' }], // А покупка 180 дней
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

  console.log('\n📢 Створюю кампанію...');
  const campaignResult = await apiPost(`${AD_ACCOUNT_ID}/campaigns`, {
    name: CAMPAIGN_NAME,
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
    console.log(`\n━━━ ${day.name} (${day.subs}) ━━━`);

    // 8_day стартує сьогодні — ставимо поточний час, інакше 00:01 за Києвом
    const todayStr = new Date().toISOString().slice(0, 10);
    const startTime = day.startDate === todayStr
      ? new Date(Date.now() + 5 * 60 * 1000).toISOString()
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
    console.log(`✅ Адсет: ${adsetId} | $${day.budget / 100}/день | ${startTime} → ${endTime}`);

    console.log(`   ⬇️ ${day.squareFile}...`);
    const squareBuffer = await downloadFile(day.squareFile);
    const squareHash = await uploadImage(squareBuffer, `041_${day.name}_square`);
    console.log(`   ✅ square hash: ${squareHash}`);

    console.log(`   ⬇️ ${day.storyFile}...`);
    const storyBuffer = await downloadFile(day.storyFile);
    const storyHash = await uploadImage(storyBuffer, `041_${day.name}_story`);
    console.log(`   ✅ story hash: ${storyHash}`);

    // Адаптивний формат: квадрат у стрічку, вертикаль у сторіс
    const assetFeedSpec = {
      images: [
        { hash: squareHash, adlabels: [{ name: 'square' }] },
        { hash: storyHash,  adlabels: [{ name: 'story'  }] }
      ],
      bodies: [{ text: day.body }],
      titles: [{ text: TITLE }],
      link_urls: [{ website_url: CLUB_URL, display_url: 'apollo.online' }],
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
      object_story_spec: JSON.stringify({
        page_id: PAGE_ID,
        instagram_user_id: INSTAGRAM_ACTOR_ID
      }),
      url_tags: URL_TAGS
    });

    if (creativeResult.error) {
      console.log(`   ⚠️ asset_feed_spec помилка: ${creativeResult.error.message}`);
      const fallbackCreative = await apiPost(`${AD_ACCOUNT_ID}/adcreatives`, {
        name: `${day.name}_creative`,
        object_story_spec: JSON.stringify({
          page_id: PAGE_ID,
          instagram_user_id: INSTAGRAM_ACTOR_ID,
          link_data: {
            link: CLUB_URL,
            caption: 'apollo.online',
            message: day.body,
            name: TITLE,
            image_hash: squareHash,
            call_to_action: { type: 'APPLY_NOW', value: { link: CLUB_URL } }
          }
        }),
        url_tags: URL_TAGS
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
  console.log(`Кампанія: ${campaignId} (${CAMPAIGN_NAME})`);
  results.forEach(r => {
    const icon = r.status === 'ok' ? '✅' : r.status === 'ok_fallback' ? '⚠️' : '❌';
    console.log(`${icon} ${r.day}: adset ${r.adsetId || '—'} | ad ${r.adId || r.error || '—'}`);
  });
  console.log('Всі об\'єкти в статусі PAUSED');
  console.log('════════════════════════════════');
}

main().catch(err => {
  console.error('❌ Критична помилка:', err.message);
  process.exit(1);
});
