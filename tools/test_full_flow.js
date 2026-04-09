const { createFullStructure } = require('./create_campaign');
require('dotenv').config();

const testStructure = {
  page_id: '107996248132865',
  campaign: {
    name: 'A_Apollo_reach_Test_grouping_0904',
    objective: 'OUTCOME_AWARENESS',
    status: 'PAUSED'
  },
  adsets: [
    {
      name: 'Test_18-55_inst',
      daily_budget: 20000,
      start_time: '2026-04-09T00:00:00+0300',
      end_time: '2026-04-30T23:59:59+0300',
      optimization_goal: 'REACH',
      billing_event: 'IMPRESSIONS',
      targeting: {
        geo_locations: { countries: ['UA'] },
        age_min: 18,
        age_max: 55,
        publisher_platforms: ['facebook', 'instagram'],
        facebook_positions: ['feed'],
        instagram_positions: ['stream', 'story', 'reels']
      },
      targeting_automation: { advantage_audience: 0 },
      pixel_id: '393751978682816',
      ads: [
        {
          name: '0904_video1',
          dropbox_link: 'https://www.dropbox.com/scl/fo/bufmdnpl1auqm5upjj8gu/ABZ0-iPdEWsoUPs8EzF1k08?dl=0&e=1&rlkey=dfu84xbd4xpb1zaovpwfel298',
          text: 'Apollo Next — фітнес для всіх. Перше тренування безкоштовно!',
          headline: 'Спробуй Apollo Next',
          url: 'https://apollo.online/clubs/'
        }
      ]
    }
  ]
};

async function run() {
  console.log('🚀 Тест групування креативів\n');
  const result = await createFullStructure(testStructure);
  console.log('\n📊 РЕЗУЛЬТАТ:');
  console.log(`Кампанія: ${result.campaign_id}`);
  console.log(`Груп: ${result.adsets.length}`);
  console.log(`Об'явлень: ${result.ads.length}`);
}

run();
