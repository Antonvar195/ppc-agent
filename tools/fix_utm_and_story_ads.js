require('dotenv').config();
const https = require('https');
const axios = require('axios');
const { apiGet, apiPost } = require('./meta_api');
const { refreshDropboxToken, dropboxRequest } = require('./dropbox_reader');

const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const TOKEN = process.env.META_ACCESS_TOKEN;
const PAGE_ID = '107996248132865';
const CAMPAIGN_ID = '120247884725450193';
const API_VERSION = 'v21.0';
const DROPBOX_LINK = 'https://www.dropbox.com/scl/fo/lv9s5zytqbqk6ckteun51/AMhgC7uZzePvzHXVvoymdIA?rlkey=hlaq73fy1d0l691txsmn24ow1&dl=0';
const BASE_URL = 'https://apollo.online/clubs/apollo-next-040-tcz-eko-market/';

// UTM розмітка по rules.md
const UTM = 'utm_source=facebook&utm_medium=conversion&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';
const CLUB_URL = `${BASE_URL}?${UTM}`;

// Маппінг: назва адсету → файли зображень
const DAY_FILES = {
  '8_day': { square: 's08.jpg', story: 'stories08.jpg', title: 'Новий APOLLO NEXT 040 на Троєщині', body: `💥 APOLLO NEXT 040 вже ось-ось засяє\n\nГотуємо простір, де не просто качаються м'язи, а справді прокачується настрій, здорове тіло, енергія й харчування.\n\nОстанні підписки за найнижчою ціною до відкриття — 199 ₴\nЗалишилось лише 160 підписок.` },
  '7_day': { square: 's07.jpg', story: 'stories07.jpg', title: 'Новий APOLLO NEXT 040 на Троєщині', body: `💥 APOLLO NEXT 040 на Троєщині вже ось-ось засяє\n\nГотуємо простір, де не просто качаються м'язи, а справді прокачується настрій, здорове тіло, енергія й харчування.\n\nОстанні підписки за найнижчою ціною до відкриття — 199 ₴\nВже залишилось лише 99 підписок.` },
  '6_day': { square: 's06.jpg', story: 'stories06.jpg', title: 'Новий APOLLO NEXT 040 на Троєщині', body: `Троєщина! Пора збирати речі в зал! ❤️‍🔥\nабо хоча б думки, бо за вчора купили ще 27/99 підписок.\n\nAPOLLO NEXT 040 — це:\n✔️ тренажери з майбутнього [чи просто найкраще з сучасного]\n✔️ тренери з сертифікацією\n✔️ найнижча ціна до відкриття — 199 ₴ за 4 тижні\n\nЦе твій шанс почати з ком'юніті, яке не знецінює жодні зусилля, а шукає підхід, щоб спорт став частиною і твого життя ❤️\n\nЗалишилось лише 72 підписки — і все, привіт вища ціна.` },
  '5_day': { square: 's05.jpg', story: 'stories05.jpg', title: 'Новий APOLLO NEXT 040 на Троєщині', body: `Фінальний розгін перед запуском APOLLO NEXT 040🏃\n\nСтартуємо на просп. Червоної Калини, 17:\nвже натираємо дзеркала й тренажери, щоб за кілька місяців ти легко порівняв(-ла) своє «до/після» 🫶\n\nІ так, 199 ₴ за 4 тижні — ще актуальна ціна.\nТут буде:\n• комфортно, бо ніхто не тисне на тебе\n• мотиваційно, як у серіалах про трансформацію\n• атмосферно, де навіть лінь тікає з бігової доріжки\nЗалишилось ще 62 підписки. Приєднаєшся?` },
  '4_day': { square: 's04.jpg', story: 'stories04.jpg', title: 'Новий APOLLO NEXT 040 на Троєщині', body: `Мінус чотири дні до твоєї нової фітнес-звички ❤️‍🔥\n\nЕКО МАРКЕТ — тут засяє новий APOLLO NEXT 040 — спорт простір, який не схожий на звичний "зал із 2009".\n\nAPOLLO NEXT 040 — це твоя формула:\nтренажери + підтримка + космос = результат\nІ так, ще діє ціна 199 ₴, але… ще трохи — й ні.\n\nЗалишилось 50 підписок рівно ✔️` },
  '3_day': { square: 's03.jpg', story: 'stories03.jpg', title: 'Новий APOLLO NEXT 040 на Троєщині', body: `Ще три дні, і двері APOLLO NEXT 040 відчиняться — а разом з ними твоя можливість почати дбати про своє тіло 🤍\n\nЗ правильного спорт простору, з правильною командою, з правильного настрою.\nПідписки по 199 ₴ майже закінчились, є ще 31, але їх забирають, як протеїнові батончики після гарячої трені 🔥\n\nПоспіши зловити свою за найнижчою можливою ціною!` },
  '2_day': { square: 's02.jpg', story: 'stories02.jpg', title: 'Новий APOLLO NEXT 040 на Троєщині', body: `💫 Вже через 48 годин ми запускаємо APOLLO NEXT 040!\n\nА сьогодні лови останній шанс застрибнути в зал майбутнього за 199 ₴ на 4 тижні ❤️‍🔥\n\nЦе твоя форма, твій простір, твій ривок.\n\nВибирай себе сьогодні, не завтра. І злітай з нами на орбіту спорту!` },
  '1_day': { square: 's01.jpg', story: 'stories01.jpg', title: 'Новий APOLLO NEXT 040 на Троєщині', body: `🔥 APOLLO NEXT 040 — це більше, ніж спортзал. Це твій персональний апгрейд до найкращого спорт простору\n\n✨ Профі тренери, що не кричать, а підтримують\n✨ Тренажери, що не риплять, а мотивують\n✨ Простір, де можна бути собою і ставати кращим\n\nБуло 160 підписок — лишилось 5.\nЧекаєш знак? Ось він.\n\nКиїв, ЕКО МАРКЕТ — ми відкриваємось вже завтра.\nТи з нами?` }
};

// DELETE запит до Meta API
function apiDelete(path) {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams({ access_token: TOKEN }).toString();
    const options = {
      hostname: 'graph.facebook.com',
      path: `/${API_VERSION}/${path}?${query}`,
      method: 'DELETE'
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
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

async function createCreative(name, imageHash, dayTitle, dayBody) {
  const result = await apiPost(`${AD_ACCOUNT_ID}/adcreatives`, {
    name,
    object_story_spec: JSON.stringify({
      page_id: PAGE_ID,
      link_data: {
        link: CLUB_URL,
        message: dayBody,
        name: dayTitle,
        image_hash: imageHash,
        call_to_action: { type: 'APPLY_NOW', value: { link: CLUB_URL } }
      }
    })
  });
  if (result.error) throw new Error(`Creative "${name}": ${result.error.message}`);
  return result.id;
}

async function main() {
  console.log('🔄 Оновлюю Dropbox токен...');
  await refreshDropboxToken();

  // Отримати всі адсети кампанії
  console.log('\n📋 Отримую адсети...');
  const adsetsData = await apiGet(`${CAMPAIGN_ID}/adsets`, {
    fields: 'id,name',
    limit: 20
  });
  if (adsetsData.error) throw new Error('Get adsets: ' + adsetsData.error.message);
  const adsets = adsetsData.data || [];
  console.log(`   Знайдено ${adsets.length} адсетів`);

  const results = [];

  for (const adset of adsets) {
    const dayInfo = DAY_FILES[adset.name];
    if (!dayInfo) {
      console.log(`\n⚠️ Пропускаю "${adset.name}" — немає маппінгу`);
      continue;
    }

    console.log(`\n━━━ ${adset.name} (${adset.id}) ━━━`);

    // Видалити старі ads цього адсету
    const existingAds = await apiGet(`${adset.id}/ads`, { fields: 'id,name', limit: 20 });
    if (!existingAds.error && existingAds.data) {
      for (const ad of existingAds.data) {
        const del = await apiDelete(ad.id);
        console.log(`   🗑️  Видалено старий ad: ${ad.id} (${del.success ? 'OK' : JSON.stringify(del)})`);
      }
    }

    // Завантажити зображення
    console.log(`   ⬇️  ${dayInfo.square}...`);
    const squareBuf = await downloadFile(dayInfo.square);
    const squareHash = await uploadImage(squareBuf, dayInfo.square);
    console.log(`   ✅ square hash: ${squareHash}`);

    console.log(`   ⬇️  ${dayInfo.story}...`);
    const storyBuf = await downloadFile(dayInfo.story);
    const storyHash = await uploadImage(storyBuf, dayInfo.story);
    console.log(`   ✅ story hash: ${storyHash}`);

    // Створити creative для feed (square)
    const squareCreativeId = await createCreative(
      `${adset.name}_square_utm`,
      squareHash,
      dayInfo.title,
      dayInfo.body
    );
    console.log(`   ✅ Square creative: ${squareCreativeId}`);

    // Створити creative для story (vertical)
    const storyCreativeId = await createCreative(
      `${adset.name}_story_utm`,
      storyHash,
      dayInfo.title,
      dayInfo.body
    );
    console.log(`   ✅ Story creative: ${storyCreativeId}`);

    // Створити ad для square (feed)
    const squareAdResult = await apiPost(`${AD_ACCOUNT_ID}/ads`, {
      name: `${adset.name}_square`,
      adset_id: adset.id,
      creative: JSON.stringify({ creative_id: squareCreativeId }),
      status: 'PAUSED'
    });
    if (squareAdResult.error) throw new Error(`Ad square: ${squareAdResult.error.message}`);
    console.log(`   ✅ Square ad: ${squareAdResult.id}`);

    // Створити ad для story (vertical)
    const storyAdResult = await apiPost(`${AD_ACCOUNT_ID}/ads`, {
      name: `${adset.name}_story`,
      adset_id: adset.id,
      creative: JSON.stringify({ creative_id: storyCreativeId }),
      status: 'PAUSED'
    });
    if (storyAdResult.error) throw new Error(`Ad story: ${storyAdResult.error.message}`);
    console.log(`   ✅ Story ad: ${storyAdResult.id}`);

    results.push({
      adset: adset.name,
      adsetId: adset.id,
      squareAdId: squareAdResult.id,
      storyAdId: storyAdResult.id,
      status: 'ok'
    });
  }

  console.log('\n\n════════════════════════════════');
  console.log('📊 ПІДСУМОК:');
  console.log(`Кампанія: ${CAMPAIGN_ID}`);
  console.log(`UTM: ✅ додано до всіх посилань`);
  results.forEach(r => {
    const icon = r.status === 'ok' ? '✅' : '❌';
    console.log(`${icon} ${r.adset}: square=${r.squareAdId} | story=${r.storyAdId}`);
  });
  console.log('════════════════════════════════');
}

main().catch(err => {
  console.error('❌ Критична помилка:', err.message);
  process.exit(1);
});
