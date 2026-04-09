const { apiPost, apiGet } = require('./meta_api');
require('dotenv').config();

const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;

// Создать кампанию
async function createCampaign(params) {
  console.log(`\n📢 Создаю кампанию: ${params.name}`);

  const result = await apiPost(`${AD_ACCOUNT_ID}/campaigns`, {
    name: params.name,
    objective: params.objective,
    status: 'PAUSED',
    special_ad_categories: '[]'
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

  const result = await apiPost(`${AD_ACCOUNT_ID}/adsets`, {
    name: params.name,
    campaign_id: campaignId,
    daily_budget: params.daily_budget || 1000,
    billing_event: 'IMPRESSIONS',
    optimization_goal: params.optimization_goal || 'REACH',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    targeting: JSON.stringify(params.targeting || {
      geo_locations: { countries: ['UA'] },
      age_min: 18,
      age_max: 65
    }),
    status: 'PAUSED',
    start_time: params.start_time || new Date().toISOString()
  });

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
        name: params.headline || 'Apollo Next'
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
    status: 'PAUSED',
    tracking_specs: JSON.stringify([{
      'action.type': ['offsite_conversion'],
      'fb_pixel': []
    }])
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

module.exports = { createCampaign, createAdset, createAd, createFullStructure };
