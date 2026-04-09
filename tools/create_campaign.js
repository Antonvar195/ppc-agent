const { apiPost, apiGet } = require('./meta_api');
const { buildAssetFeedSpec, createAdWithAssets } = require('./creative_builder');
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

  // Нормализуем targeting — убираем threads_positions (не поддерживается),
  // добавляем обязательный targeting_automation
  const targeting = params.targeting || {
    geo_locations: { countries: ['UA'] },
    age_min: 18,
    age_max: 65
  };
  delete targeting.threads_positions;
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
  // Если есть dropbox_link — загружаем все креативы из Dropbox
  if (params.dropbox_link) {
    const assetFeedSpec = await buildAssetFeedSpec(
      params.dropbox_link,
      params.text || 'Apollo Next — фітнес для всіх',
      params.headline || 'Спробуй Apollo Next',
      params.url
    );
    return await createAdWithAssets(adsetId, params.name, assetFeedSpec, params.page_id);
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
        message: params.text || 'Apollo Next — фітнес для всіх',
        name: params.headline || 'Apollo Next',
        image_hash: imageHash
      }
    })
  });

  if (creativeResult.error) {
    throw new Error(`Creative: ${creativeResult.error.message}`);
  }

  const adResult = await apiPost(`${AD_ACCOUNT_ID}/ads`, {
    name: params.name,
    adset_id: adsetId,
    creative: JSON.stringify({ creative_id: creativeResult.id }),
    status: 'PAUSED'
  });

  if (adResult.error) {
    throw new Error(`Ad: ${adResult.error.message}`);
  }

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
    errors: []
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
            const adId = await createAd(adsetId, {
              ...ad,
              page_id: structure.page_id
            });
            results.ads.push({ name: ad.name, id: adId, adset: adset.name });
          } catch (err) {
            results.errors.push(`Объявление ${ad.name}: ${err.message}`);
            console.log(`⚠️ ${err.message}`);
          }
        }
      } catch (err) {
        results.errors.push(`Группа ${adset.name}: ${err.message}`);
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

// ─── VALIDATE ONLY ───────────────────────────────────────────────────────────

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

function validateAdset(params) {
  // Meta требует реальный campaign_id даже для validate_only —
  // делаем локальную проверку обязательных полей
  const errors = [];
  if (!params.name) errors.push('name обов\'язковий');
  if (!params.daily_budget) errors.push('daily_budget обов\'язковий');
  if (!params.optimization_goal) errors.push('optimization_goal обов\'язковий');
  if (!params.start_time) errors.push('start_time обов\'язковий');
  if (!params.end_time) errors.push('end_time обов\'язковий');
  if (!params.targeting || !params.targeting.geo_locations) errors.push('targeting.geo_locations обов\'язковий');

  if (errors.length > 0) return { error: { message: errors.join(', ') } };
  return { success: true };
}

async function validateAd(params) {
  const url = params.url ? params.url.split('?')[0] : 'https://apollo.online/clubs/';
  return await apiPost(`${AD_ACCOUNT_ID}/adcreatives`, {
    name: params.name + '_validate',
    object_story_spec: JSON.stringify({
      page_id: params.page_id,
      link_data: {
        link: url,
        message: params.text || 'Apollo Next',
        name: params.headline || 'Apollo Next'
      }
    }),
    execution_options: JSON.stringify(['validate_only'])
  });
}

async function validateFullStructure(structure) {
  console.log('\n🔍 ВАЛІДАЦІЯ СТРУКТУРИ (VALIDATE_ONLY)');
  console.log('=====================================');

  const errors = [];
  const autoFixed = [];

  // 1. Кампания
  const campResult = await validateCampaign(structure.campaign);
  if (campResult.error) {
    errors.push(`Кампанія: ${campResult.error.message}`);
    console.log('❌ Кампанія:', campResult.error.message);
  } else {
    console.log('✅ Кампанія валідна');
  }

  // 2. Группы и объявления
  for (const adset of structure.adsets) {
    if (adset.targeting && adset.targeting.threads_positions) {
      delete adset.targeting.threads_positions;
      autoFixed.push(`Видалено threads_positions з групи ${adset.name}`);
    }
    if (!adset.targeting_automation) {
      adset.targeting_automation = { advantage_audience: 0 };
      autoFixed.push(`Додано targeting_automation до групи ${adset.name}`);
    }

    const adsetResult = await validateAdset(adset);
    if (adsetResult.error) {
      errors.push(`Група ${adset.name}: ${adsetResult.error.message}`);
      console.log(`❌ Група ${adset.name}:`, adsetResult.error.message);
    } else {
      console.log(`✅ Група ${adset.name} валідна`);
    }

    for (const ad of adset.ads) {
      if (ad.url && ad.url.includes('utm_')) {
        ad.url = ad.url.split('?')[0];
        autoFixed.push(`Прибрано UTM з URL об'явлення ${ad.name}`);
      }
      if (!ad.text || ad.text.trim() === '') {
        errors.push(`Об'явлення ${ad.name}: відсутній текст`);
        console.log(`❌ Об'явлення ${ad.name}: немає тексту`);
        continue;
      }
      const adResult = await validateAd({ ...ad, page_id: structure.page_id });
      if (adResult.error) {
        errors.push(`Об'явлення ${ad.name}: ${adResult.error.message}`);
        console.log(`❌ Об'явлення ${ad.name}:`, adResult.error.message);
      } else {
        console.log(`✅ Об'явлення ${ad.name} валідне`);
      }
    }
  }

  console.log('=====================================');
  if (autoFixed.length > 0) {
    console.log('\n🔧 Автоматично виправлено:');
    autoFixed.forEach(f => console.log('  -', f));
  }
  if (errors.length > 0) {
    console.log('\n❌ Знайдено помилок:', errors.length);
    errors.forEach(e => console.log('  -', e));
    return { valid: false, errors, autoFixed, structure };
  }
  console.log('\n✅ Структура повністю валідна');
  return { valid: true, autoFixed, structure };
}

module.exports = {
  createCampaign, createAdset, createAd,
  createFullStructure, validateFullStructure
};
