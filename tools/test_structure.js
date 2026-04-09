const { createFullStructure } = require('./create_campaign');

// Тестовая структура — 1 кампания, 1 группа, 1 объявление
// Всё в статусе PAUSED — ничего не запустится и не потратит деньги
const testStructure = {
  page_id: '107996248132865',
  campaign: {
    name: 'A_Apollo_reach_Test_test_0904',
    objective: 'REACH'
  },
  adsets: [
    {
      name: 'Test_wide',
      daily_budget: 1000,
      optimization_goal: 'REACH',
      targeting: {
        geo_locations: {
          countries: ['UA']
        },
        age_min: 18,
        age_max: 65
      },
      ads: [
        {
          name: '0904_1',
          url: 'https://apollo.online/clubs/',
          text: 'Apollo Next — фітнес для всіх',
          headline: 'Перше тренування безкоштовно'
        }
      ]
    }
  ]
};

createFullStructure(testStructure);
