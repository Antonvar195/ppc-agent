const { apiPost, apiGet } = require('./meta_api');
const { buildAllCreativeSpecs, createAdWithAssets } = require('./creative_builder');
const https = require('https');
const http = require('http');
require('dotenv').config();

const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;

// Загрузить изображение по URL и получить image_hash в Meta
function uploadImageFromUrl(imageUrl, name) {
  return new Promise((resolve, reject) => {
    // Добавляем протокол если отсутствует
    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      imageUrl = 'https://' + imageUrl;
    }
    const client = imageUrl.startsWith('https') ? https : http;
    client.get(imageUrl, (res) => {
      // Следуем редиректам
      if (res.statusCode === 301 || res.statusCode === 302) {
        return uploadImageFromUrl(res.headers.location, name).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', async () => {
        const buffer = Buffer.concat(chunks);
        const base64 = buffer.toString('base64');
        const result = await apiPost(`${AD_ACCOUNT_ID}/adimages`, {
          bytes: base64,
          name: name + '_img.jpg'
        });
        if (result.error) return reject(new Error(result.error.message));
        const imgData = Object.values(result.images || {})[0];
        if (!imgData) return reject(new Error('Не вдалося завантажити зображення'));
        resolve(imgData.hash);
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Маппинг коротких типов из rules.md → актуальные objective Meta API v19+
const OBJECTIVE_MAP = {
  reach:      'OUTCOME_AWARENESS',
  conversion: 'OUTCOME_SALES',
  cpc:        'OUTCOME_TRAFFIC',
  leads:      'OUTCOME_LEADS'
};

// Создать кампанию
async function createCampaign(params) {
  console.log(`\n📢 Создаю кампанию: ${params.name}`);

  const objective = OBJECTIVE_MAP[params.objective] || params.objective;

  const result = await apiPost(`${AD_ACCOUNT_ID}/campaigns`, {
    name: params.name,
    objective,
    status: 'PAUSED',
    special_ad_categories: '[]',
    is_adset_budget_sharing_enabled: false
  });

  if (result.error) {
    throw new Error(`Ошибка создания кампании: ${result.error.message}`);
  }

  console.log(`✅ Кампания создана: ${result.id}`);
  return result.id;
}

// Создать группу объявлений
async function createAdset(campaignId, params) {
  console.log(`\n👥 Создаю группу: ${params.name}`);

  // Нормализуем targeting — добавляем обязательный targeting_automation
  const targeting = params.targeting || {
    geo_locations: { countries: ['UA'] },
    age_min: 18,
    age_max: 65
  };
  // Всегда отключаем Advantage+ audience (иначе Meta требует age_max: 65)
  targeting.targeting_automation = { advantage_audience: 0 };

  const adsetParams = {
    name: params.name,
    campaign_id: campaignId,
    daily_budget: params.daily_budget || 1000,
    billing_event: 'IMPRESSIONS',
    optimization_goal: params.optimization_goal || 'REACH',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    targeting: JSON.stringify(targeting),
    status: 'PAUSED',
    start_time: params.start_time || new Date().toISOString()
  };
  if (params.end_time) adsetParams.end_time = params.end_time;

  const result = await apiPost(`${AD_ACCOUNT_ID}/adsets`, adsetParams);
  console.log('=== ADSET API RESPONSE ===');
  console.log(JSON.stringify(result, null, 2));
  console.log('==========================');

  if (result.error) {
    throw new Error(`Ошибка создания группы: ${result.error.message}`);
  }

  console.log(`✅ Группа создана: ${result.id}`);
  return result.id;
}

// Создать объявление
async function createAd(adsetId, params) {
  const results = [];

  if (params.dropbox_link) {
    // Приєднуємо UTM до URL якщо є
    const urlWithUtm = params.utm
      ? params.url + (params.url.includes('?') ? '&' : '?') + params.utm
      : params.url;

    // Получаем все specs, сгруппированные по креативам
    const creativeSpecs = await buildAllCreativeSpecs(
      params.dropbox_link,
      params.text || 'Apollo Next — фітнес для всіх',
      params.headline || 'Спробуй Apollo Next',
      urlWithUtm
    );

    if (creativeSpecs.length === 0) {
      console.log('⚠️ buildAllCreativeSpecs повернув 0 специфікацій — немає чого публікувати');
      return results;
    }

    // Создаём одно объявление на каждый креатив
    for (const { creativeId, spec } of creativeSpecs) {
      const adName = params.name.replace(/\d+$/, '') + creativeId;
      try {
        const adId = await createAdWithAssets(adsetId, adName, spec, params.page_id);
        results.push(adId);
      } catch (err) {
        console.log(`⚠️ ${adName}: ${err.message}`);
      }
    }

    return results;
  }

  // Старый флоу — одно изображение по URL или hash
  console.log(`\n📄 Создаю объявление: ${params.name}`);

  let imageHash = params.image_hash || null;
  if (!imageHash && params.creative_url) {
    console.log(`   🖼️ Завантажую зображення: ${params.creative_url}`);
    try {
      imageHash = await uploadImageFromUrl(params.creative_url, params.name);
      console.log(`   ✅ hash: ${imageHash}`);
    } catch (e) {
      throw new Error(`Не вдалося завантажити зображення (${params.creative_url}): ${e.message}`);
    }
  }

  if (!imageHash) {
    throw new Error(`Об'явлення ${params.name}: потрібне зображення (dropbox_link, image_hash або creative_url)`);
  }

  const creativeResult = await apiPost(`${AD_ACCOUNT_ID}/adcreatives`, {
    name: params.name + '_creative',
    object_story_spec: JSON.stringify({
      page_id: params.page_id,
      link_data: {
        link: params.url,
        message: params.text || 'Apollo Next',
        name: params.headline || 'Apollo Next',
        image_hash: imageHash
      }
    })
  });

  if (creativeResult.error) throw new Error(`Creative: ${creativeResult.error.message}`);

  const adResult = await apiPost(`${AD_ACCOUNT_ID}/ads`, {
    name: params.name,
    adset_id: adsetId,
    creative: JSON.stringify({ creative_id: creativeResult.id }),
    status: 'PAUSED'
  });

  if (adResult.error) throw new Error(`Ad: ${adResult.error.message}`);

  console.log(`✅ Объявление создано: ${adResult.id}`);
  return adResult.id;
}

// Главная функция — создать всю структуру
async function createFullStructure(structure) {
  console.log('=== INCOMING STRUCTURE ===');
  console.log(JSON.stringify(structure, null, 2));
  console.log('==========================');
  console.log('\n🚀 НАЧИНАЮ СОЗДАНИЕ СТРУКТУРЫ');
  console.log('================================');

  const results = {
    campaign_id: null,
    adsets: [],
    ads: [],
    errors: [],
    failed_adsets: []
  };

  try {
    // 1. Создаём кампанию
    results.campaign_id = await createCampaign(structure.campaign);

    // 2. Создаём группы и объявления
    for (const adset of structure.adsets) {
      try {
        const adsetId = await createAdset(results.campaign_id, adset);
        results.adsets.push({ name: adset.name, id: adsetId });

        // 3. Создаём объявления в группе
        for (const ad of adset.ads) {
          try {
            const adResult = await createAd(adsetId, {
              ...ad,
              page_id: structure.page_id
            });
            // createAd может вернуть id или массив id (при dropbox_link)
            if (Array.isArray(adResult)) {
              adResult.forEach((id, i) => {
                results.ads.push({ name: ad.name + '_' + (i + 1), id, adset: adset.name });
              });
            } else {
              results.ads.push({ name: ad.name, id: adResult, adset: adset.name });
            }
          } catch (err) {
            results.errors.push(`Объявление ${ad.name}: ${err.message}`);
            console.log(`⚠️ ${err.message}`);
          }
        }
      } catch (err) {
        results.errors.push(`Група ${adset.name}: ${err.message}`);
        results.failed_adsets.push({ params: adset, error: err.message });
        console.log(`⚠️ ${err.message}`);
      }
    }

  } catch (err) {
    results.errors.push(`Кампания: ${err.message}`);
    console.log(`❌ ${err.message}`);
  }

  // Итог
  console.log('\n================================');
  console.log('📊 ИТОГ:');
  console.log(`   Кампания: ${results.campaign_id || '❌ не создана'}`);
  console.log(`   Групп создано: ${results.adsets.length}`);
  console.log(`   Объявлений создано: ${results.ads.length}`);

  if (results.errors.length > 0) {
    console.log(`\n⚠️ Ошибки (${results.errors.length}):`);
    results.errors.forEach(e => console.log(`   - ${e}`));
  } else {
    console.log('\n✅ Всё создано без ошибок');
  }

  return results;
}

// Повторна спроба створити провалені групи з виправленими параметрами
async function retryFailedAdsets(campaignId, fixedAdsets, pageId) {
  const results = { adsets: [], ads: [], errors: [], failed_adsets: [] };

  for (const item of fixedAdsets) {
    const adset = item.params;
    try {
      const adsetId = await createAdset(campaignId, adset);
      results.adsets.push({ name: adset.name, id: adsetId });
      console.log(`✅ Retry: група "${adset.name}" створена`);

      for (const ad of (adset.ads || [])) {
        try {
          const adResult = await createAd(adsetId, { ...ad, page_id: pageId });
          if (Array.isArray(adResult)) {
            adResult.forEach((id, i) => results.ads.push({ name: ad.name + '_' + (i + 1), id }));
          } else {
            results.ads.push({ name: ad.name, id: adResult });
          }
        } catch (err) {
          results.errors.push(`Об'явлення ${ad.name}: ${err.message}`);
          console.log(`⚠️ ${err.message}`);
        }
      }
    } catch (err) {
      results.errors.push(`Група ${adset.name}: ${err.message}`);
      results.failed_adsets.push({ params: adset, error: err.message });
      console.log(`⚠️ Retry failed "${adset.name}": ${err.message}`);
    }
  }

  return results;
}

// ─── GEO MAPPING ─────────────────────────────────────────────────────────────

// Маппинг украинских городов → правильный формат Meta API
const UA_CITY_GEO = {
  // Ключ: варианты написания, значение: правильный geo_locations объект
  'київ':        { regions: [{ key: '4290' }] },
  'kyiv':        { regions: [{ key: '4290' }] },
  'kiev':        { regions: [{ key: '4290' }] },
  'львів':       { cities: [{ key: '2378495' }] },
  'lviv':        { cities: [{ key: '2378495' }] },
  'одеса':       { cities: [{ key: '2384095' }] },
  'odessa':      { cities: [{ key: '2384095' }] },
  'odesa':       { cities: [{ key: '2384095' }] },
  'харків':      { cities: [{ key: '2372604' }] },
  'kharkiv':     { cities: [{ key: '2372604' }] },
  'дніпро':      { cities: [{ key: '2367397' }] },
  'dnipro':      { cities: [{ key: '2367397' }] },
  'запоріжжя':   { cities: [{ key: '2400115' }] },
  'zaporizhzhia':{ cities: [{ key: '2400115' }] },
  'вінниця':     { cities: [{ key: '2397330' }] },
  'vinnytsia':   { cities: [{ key: '2397330' }] },
  'херсон':      { cities: [{ key: '2372649' }] },
  'kherson':     { cities: [{ key: '2372649' }] },
  'чернівці':    { cities: [{ key: '2366058' }] },
  'chernivtsi':  { cities: [{ key: '2366058' }] },
  'полтава':     { cities: [{ key: '2387014' }] },
  'poltava':     { cities: [{ key: '2387014' }] },
  'суми':        { cities: [{ key: '2393546' }] },
  'sumy':        { cities: [{ key: '2393546' }] },
  'черкаси':     { cities: [{ key: '2365955' }] },
  'cherkasy':    { cities: [{ key: '2365955' }] },
  'житомир':     { cities: [{ key: '2401072' }] },
  'zhytomyr':    { cities: [{ key: '2401072' }] },
  'ужгород':     { cities: [{ key: '2395916' }] },
  'uzhhorod':    { cities: [{ key: '2395916' }] },
};

// Авто-фикс: конвертируем custom_locations → правильный формат
// Claude може класти custom_locations або всередину geo_locations, або на верхній рівень
function fixGeoLocations(targeting, adsetName, autoFixed) {
  const hasTopLevel = targeting && targeting.custom_locations;
  const hasNested = targeting && targeting.geo_locations && targeting.geo_locations.custom_locations;
  if (!hasTopLevel && !hasNested) return targeting;

  const locs = hasNested ? targeting.geo_locations.custom_locations : targeting.custom_locations;
  const regions = [];
  const cities = [];
  const unmapped = [];

  for (const loc of locs) {
    const cityName = (loc.name || '').toLowerCase().replace(/[,.']/g, '').trim().split(' ')[0];
    const mapped = UA_CITY_GEO[cityName];
    if (mapped) {
      if (mapped.regions) regions.push(...mapped.regions);
      if (mapped.cities) cities.push(...mapped.cities);
      autoFixed.push(`Конвертовано geo "${loc.name}" → правильний формат Meta API`);
    } else {
      unmapped.push(loc.name || JSON.stringify(loc));
    }
  }

  // Будуємо правильний targeting
  const fixed = { ...targeting };
  delete fixed.custom_locations; // прибираємо з верхнього рівня

  const geoLocations = { ...(targeting.geo_locations || {}) };
  delete geoLocations.custom_locations; // прибираємо з geo_locations

  if (unmapped.length > 0) {
    autoFixed.push(`Невідомі міста (${unmapped.join(', ')}) → замінено на countries: ["UA"]`);
    geoLocations.countries = ['UA'];
  } else {
    if (regions.length > 0) geoLocations.regions = regions;
    if (cities.length > 0) geoLocations.cities = cities;
  }

  fixed.geo_locations = geoLocations;
  return fixed;
}

// ─── VALIDATE ONLY ───────────────────────────────────────────────────────────

// 1. Кампанія — Meta validate_only
async function validateCampaign(params) {
  const objective = OBJECTIVE_MAP[params.objective] || params.objective;
  const result = await apiPost(`${AD_ACCOUNT_ID}/campaigns`, {
    name: params.name,
    objective,
    status: 'PAUSED',
    special_ad_categories: '[]',
    is_adset_budget_sharing_enabled: false,
    execution_options: JSON.stringify(['validate_only'])
  });
  return result;
}

// 2. Адсет — розширена локальна перевірка
function validateAdset(params) {
  const errors = [];
  const VALID_GOALS = ['REACH', 'IMPRESSIONS', 'LINK_CLICKS', 'LANDING_PAGE_VIEWS',
    'OFFSITE_CONVERSIONS', 'LEAD_GENERATION', 'VALUE', 'QUALITY_LEAD'];
  const VALID_PLATFORMS = ['facebook', 'instagram', 'audience_network', 'messenger'];

  // Обов'язкові поля
  if (!params.name) errors.push('name обов\'язковий');
  if (!params.daily_budget) errors.push('daily_budget обов\'язковий');
  if (!params.optimization_goal) errors.push('optimization_goal обов\'язковий');
  if (!params.start_time) errors.push('start_time обов\'язковий');
  if (!params.end_time) errors.push('end_time обов\'язковий');
  if (!params.targeting || !params.targeting.geo_locations) errors.push('targeting.geo_locations обов\'язковий');

  // Дати
  const now = new Date();
  const yesterday = new Date(now - 24 * 60 * 60 * 1000);
  if (params.end_time && new Date(params.end_time) < now) {
    errors.push(`дата завершення в минулому: ${params.end_time}`);
  }
  if (params.start_time && new Date(params.start_time) < yesterday) {
    errors.push(`дата старту в минулому: ${params.start_time}`);
  }
  if (params.start_time && params.end_time &&
      new Date(params.end_time) <= new Date(params.start_time)) {
    errors.push('end_time повинен бути після start_time');
  }

  // Бюджет (мінімум 1000 = 10 UAH)
  if (params.daily_budget && params.daily_budget < 1000) {
    errors.push(`daily_budget ${params.daily_budget} занадто малий (мінімум 1000 = 10 UAH)`);
  }

  // Optimization goal
  if (params.optimization_goal && !VALID_GOALS.includes(params.optimization_goal)) {
    errors.push(`optimization_goal "${params.optimization_goal}" невалідний. Допустимі: ${VALID_GOALS.join(', ')}`);
  }

  // Publisher platforms
  if (params.targeting && params.targeting.publisher_platforms) {
    for (const p of params.targeting.publisher_platforms) {
      if (!VALID_PLATFORMS.includes(p)) {
        errors.push(`publisher_platform "${p}" невалідний. Допустимі: ${VALID_PLATFORMS.join(', ')}`);
      }
    }
  }

  if (errors.length > 0) return { error: { message: errors.join('; ') } };
  return { success: true };
}

// 3. Креатив — Meta validate_only
async function validateAd(params) {
  const url = params.url ? params.url.split('?')[0] : 'https://apollo.online/clubs/';
  // Якщо є dropbox_link або image_hash — перевіряємо тільки обов'язкові поля
  if (!params.text) return { error: { message: 'text обов\'язковий' } };
  if (!params.headline) return { error: { message: 'headline обов\'язковий' } };
  if (!params.dropbox_link) return { error: { message: 'dropbox_link обов\'язковий' } };
  return { id: 'validate_ok' };
}

// 4. Dropbox — перевірка доступності та наявності файлів (без завантаження)
async function validateDropboxLink(dropboxLink) {
  const axios = require('axios');
  const { refreshDropboxToken } = require('./dropbox_reader');

  // Перевіряємо чи є refresh credentials
  const hasRefreshCreds = process.env.DROPBOX_REFRESH_TOKEN &&
    process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET;

  if (!hasRefreshCreds) {
    return {
      ok: false,
      error: 'Відсутні DROPBOX_APP_KEY / DROPBOX_APP_SECRET / DROPBOX_REFRESH_TOKEN у змінних середовища Railway. Додай їх у Railway → Variables.'
    };
  }

  const refreshed = await refreshDropboxToken();
  if (!refreshed) {
    return {
      ok: false,
      error: 'Не вдалося оновити Dropbox токен через refresh token. Перевір значення DROPBOX_APP_KEY / DROPBOX_APP_SECRET / DROPBOX_REFRESH_TOKEN на Railway.'
    };
  }

  const token = process.env.DROPBOX_ACCESS_TOKEN;

  try {
    const response = await axios.post(
      'https://api.dropboxapi.com/2/files/list_folder',
      { path: '', shared_link: { url: dropboxLink } },
      { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    const mediaFiles = response.data.entries.filter(f =>
      f['.tag'] === 'file' && /\.(jpg|jpeg|png|mp4|mov)$/i.test(f.name)
    );
    return { ok: true, count: mediaFiles.length, files: mediaFiles.map(f => f.name) };
  } catch (err) {
    const msg = err.response?.data?.error_summary || err.message;
    return { ok: false, error: msg };
  }
}

// 5. URL — перевірка доступності
function validateUrl(url) {
  return new Promise((resolve) => {
    try {
      const client = url.startsWith('https') ? https : http;
      const req = client.request(url, { method: 'HEAD', timeout: 8000 }, (res) => {
        // 2xx або 3xx — OK
        resolve({ ok: res.statusCode < 400, status: res.statusCode });
      });
      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
      req.end();
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

async function validateFullStructure(structure) {
  console.log('\n🔍 ВАЛІДАЦІЯ СТРУКТУРИ');
  console.log('=====================================');

  const errors = [];
  const autoFixed = [];

  // ── 1. Кампанія (Meta validate_only) ─────────────────
  const campResult = await validateCampaign(structure.campaign);
  if (campResult.error) {
    errors.push(`Кампанія: ${campResult.error.message}`);
    console.log('❌ Кампанія:', campResult.error.message);
  } else {
    console.log('✅ Кампанія валідна');
  }

  // Збираємо унікальні URL та Dropbox посилання для пакетної перевірки
  const urlsToCheck = new Set();
  const dropboxLinksToCheck = new Map();

  // ── 2. Групи і оголошення ─────────────────────────────
  for (const adset of structure.adsets) {
    // Auto-fix
    if (!adset.targeting_automation) {
      adset.targeting_automation = { advantage_audience: 0 };
      autoFixed.push(`Додано targeting_automation до групи "${adset.name}"`);
    }
    // Auto-fix custom_locations → правильний формат Meta API
    if (adset.targeting && (
      adset.targeting.custom_locations ||
      adset.targeting.geo_locations?.custom_locations
    )) {
      adset.targeting = fixGeoLocations(adset.targeting, adset.name, autoFixed);
    }

    const adsetResult = validateAdset(adset);
    if (adsetResult.error) {
      errors.push(`Група "${adset.name}": ${adsetResult.error.message}`);
      console.log(`❌ Група "${adset.name}":`, adsetResult.error.message);
    } else {
      console.log(`✅ Група "${adset.name}" валідна`);
    }

    for (const ad of adset.ads) {
      // Auto-fix UTM
      if (ad.url && ad.url.includes('utm_')) {
        ad.url = ad.url.split('?')[0];
        autoFixed.push(`Прибрано UTM з URL "${ad.name}"`);
      }

      // Обов'язкові поля оголошення
      if (!ad.text || ad.text.trim() === '') {
        errors.push(`Оголошення "${ad.name}": відсутній текст`);
        console.log(`❌ Оголошення "${ad.name}": немає тексту`);
        continue;
      }
      if (!ad.headline || ad.headline.trim() === '') {
        errors.push(`Оголошення "${ad.name}": відсутній заголовок`);
        console.log(`❌ Оголошення "${ad.name}": немає заголовку`);
        continue;
      }
      if (!ad.dropbox_link) {
        errors.push(`Оголошення "${ad.name}": відсутній dropbox_link`);
        console.log(`❌ Оголошення "${ad.name}": немає dropbox_link`);
        continue;
      }

      // Збираємо для пакетної перевірки
      if (ad.url) urlsToCheck.add(ad.url);
      if (ad.dropbox_link && !dropboxLinksToCheck.has(ad.dropbox_link)) {
        dropboxLinksToCheck.set(ad.dropbox_link, ad.name);
      }

      // Meta validate_only для креативу
      const adResult = await validateAd({ ...ad, page_id: structure.page_id });
      if (adResult.error) {
        errors.push(`Оголошення "${ad.name}": ${adResult.error.message}`);
        console.log(`❌ Оголошення "${ad.name}":`, adResult.error.message);
      } else {
        console.log(`✅ Оголошення "${ad.name}" валідне`);
      }
    }
  }

  // ── 3. Перевірка Dropbox посилань ────────────────────
  if (dropboxLinksToCheck.size > 0) {
    console.log('\n📦 Перевіряю Dropbox посилання...');
    for (const [link, adName] of dropboxLinksToCheck) {
      const result = await validateDropboxLink(link);
      if (!result.ok) {
        errors.push(`Dropbox: папка недоступна — ${result.error}. Перевір посилання або оновіть токен.`);
        console.log(`❌ Dropbox: ${result.error}`);
      } else if (result.count === 0) {
        errors.push(`Dropbox: папка порожня, не знайдено медіафайлів (jpg/png/mp4/mov)`);
        console.log(`❌ Dropbox: 0 файлів у папці`);
      } else {
        const preview = result.files.slice(0, 3).join(', ') + (result.count > 3 ? '...' : '');
        console.log(`✅ Dropbox: ${result.count} файлів (${preview})`);
      }
    }
  }

  // ── 4. Перевірка URL ─────────────────────────────────
  if (urlsToCheck.size > 0) {
    console.log('\n🔗 Перевіряю URL...');
    for (const url of urlsToCheck) {
      const result = await validateUrl(url);
      if (!result.ok) {
        errors.push(`URL недоступний: ${url} (${result.error || result.status})`);
        console.log(`❌ URL: ${url} → ${result.error || result.status}`);
      } else {
        console.log(`✅ URL: ${url} → ${result.status}`);
      }
    }
  }

  // ── ПІДСУМОК ─────────────────────────────────────────
  console.log('\n=====================================');
  if (autoFixed.length > 0) {
    console.log('🔧 Автоматично виправлено:');
    autoFixed.forEach(f => console.log('  -', f));
  }
  if (errors.length > 0) {
    console.log(`\n❌ Знайдено помилок: ${errors.length}`);
    errors.forEach(e => console.log('  -', e));
    return { valid: false, errors, autoFixed, structure };
  }
  console.log('\n✅ Структура повністю валідна — можна публікувати');
  return { valid: true, autoFixed, structure };
}

module.exports = {
  createCampaign, createAdset, createAd,
  createFullStructure, validateFullStructure, retryFailedAdsets
};
