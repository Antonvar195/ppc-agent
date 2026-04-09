const { createFullStructure } = require('./create_campaign');

// Тест полной публикации с реальным изображением
const structure = {
  campaign: {
    name: 'A_Apollo_reach_All_TEST_AD_' + new Date().toISOString().slice(5, 10).replace('-', ''),
    objective: 'OUTCOME_AWARENESS',
    status: 'PAUSED'
  },
  page_id: '107996248132865',
  adsets: [
    {
      name: 'All_18-35_test',
      daily_budget: 20000,
      start_time: '2026-04-10T00:00:00+0300',
      end_time: '2026-04-30T23:59:59+0300',
      optimization_goal: 'REACH',
      billing_event: 'IMPRESSIONS',
      targeting: {
        geo_locations: { countries: ['UA'] },
        age_min: 18,
        age_max: 35,
        publisher_platforms: ['facebook', 'instagram'],
        facebook_positions: ['feed'],
        instagram_positions: ['stream', 'story', 'reels']
      },
      ads: [
        {
          name: 'test_ad_01',
          url: 'https://apollo.online/clubs/',
          text: 'Apollo Next — мережа фітнес-клубів №1 в Україні. Почни тренуватися вже сьогодні!',
          headline: 'Apollo Next Fitness',
          creative_url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&q=80'
        }
      ]
    }
  ]
};

console.log('🧪 Запускаю тест створення кампанії з оголошенням...\n');

createFullStructure(structure).then(result => {
  console.log('\n=== РЕЗУЛЬТАТ ТЕСТУ ===');
  console.log(JSON.stringify(result, null, 2));
  if (result.ads.length > 0) {
    console.log('\n✅ УСПІХ: оголошення створено!');
  } else {
    console.log('\n❌ ПРОВАЛ: оголошення не створено');
  }
}).catch(err => {
  console.error('❌ Помилка:', err.message);
});
