const { apiPost, apiGet } = require('./meta_api');
require('dotenv').config();

const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;

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
  if (!targeting.targeting_automation) {
    targeting.targeting_automation = { advantage_audience: 0 };
  }

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

  if (result.error) {
    throw new Error(`Ошибка создания группы: ${result.error.message}`);
  }

  console.log(`✅ Группа создана: ${result.id}`);
  return result.id;
}

// Создать объявление (заглушка — без реального креатива)
async function createAd(adsetId, params) {
  console.log(`\n📄 Создаю объявление: ${params.name}`);

  // Сначала создаём creative placeholder
  const creativeResult = await apiPost(`${AD_ACCOUNT_ID}/adcreatives`, {
    name: params.name + '_creative',
    object_story_spec: JSON.stringify({
      page_id: params.page_id,
      link_data: {
        link: params.url,
        message: params.text || 'Apollo Next — фітнес для всіх',
        name: params.headline || 'Apollo Next',
        ...(params.image_hash && { image_hash: params.image_hash })
      }
    })
  });

  if (creativeResult.error) {
    throw new Error(`Ошибка создания креатива: ${creativeResult.error.message}`);
  }

  const adResult = await apiPost(`${AD_ACCOUNT_ID}/ads`, {
    name: params.name,
    adset_id: adsetId,
    creative: JSON.stringify({ creative_id: creativeResult.id }),
    status: 'PAUSED'
  });

  if (adResult.error) {
    throw new Error(`Ошибка создания объявления: ${adResult.error.message}`);
  }

  console.log(`✅ Объявление создано: ${adResult.id}`);
  return adResult.id;
}

// Главная функция — создать всю структуру
async function createFullStructure(structure) {
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
    execution_options: JSON.stringify([{ execution_type: 'VALIDATE_ONLY' }])
  });
  return result;
}

async function validateAdset(params) {
  const targeting = { ...(params.targeting || {}) };
  delete targeting.threads_positions;
  if (!targeting.targeting_automation) {
    targeting.targeting_automation = { advantage_audience: 0 };
  }

  const adsetParams = {
    name: params.name,
    campaign_id: 'ACT_PLACEHOLDER',
    daily_budget: params.daily_budget || 1000,
    billing_event: params.billing_event || 'IMPRESSIONS',
    optimization_goal: params.optimization_goal || 'REACH',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    targeting: JSON.stringify(targeting),
    status: 'PAUSED',
    start_time: params.start_time || new Date().toISOString(),
    execution_options: JSON.stringify([{ execution_type: 'VALIDATE_ONLY' }])
  };
  if (params.end_time) adsetParams.end_time = params.end_time;

  return await apiPost(`${AD_ACCOUNT_ID}/adsets`, adsetParams);
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
    execution_options: JSON.stringify([{ execution_type: 'VALIDATE_ONLY' }])
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
