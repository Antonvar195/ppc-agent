const { createFullStructure } = require('./create_campaign');
require('dotenv').config();

const DROPBOX = 'https://www.dropbox.com/scl/fo/bufmdnpl1auqm5upjj8gu/ABZ0-iPdEWsoUPs8EzF1k08?dl=0&e=1&rlkey=dfu84xbd4xpb1zaovpwfel298';
const PAGE_ID = '107996248132865';
const PIXEL_ID = '393751978682816';

const TARGETING = {
  geo_locations: { countries: ['UA'] },
  age_min: 18,
  age_max: 55,
  publisher_platforms: ['facebook', 'instagram'],
  facebook_positions: ['feed', 'story', 'facebook_reels'],
  instagram_positions: ['stream', 'story', 'reels'],
  targeting_automation: { advantage_audience: 0 }
};

const campaigns = [
  {
    label: 'REACH',
    structure: {
      page_id: PAGE_ID,
      campaign: {
        name: 'A_Apollo_reach_All_test_1606',
        objective: 'OUTCOME_AWARENESS',
        status: 'PAUSED'
      },
      adsets: [{
        name: 'All_18-55_reach',
        daily_budget: 1000,
        start_time: '2026-06-20T00:00:00+0300',
        end_time: '2026-06-30T23:59:59+0300',
        optimization_goal: 'REACH',
        billing_event: 'IMPRESSIONS',
        pixel_id: PIXEL_ID,
        targeting: TARGETING,
        ads: [{
          name: '1606_1',
          url: 'https://apollo.online/clubs/',
          utm: 'utm_source=facebook&utm_medium=reach&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}',
          text: 'Apollo Next — фітнес для всіх. Перше тренування безкоштовно!',
          headline: 'Спробуй Apollo Next',
          dropbox_link: DROPBOX
        }]
      }]
    }
  },
  {
    label: 'CPC (трафік)',
    structure: {
      page_id: PAGE_ID,
      campaign: {
        name: 'A_Apollo_cpc_All_test_1606',
        objective: 'OUTCOME_TRAFFIC',
        status: 'PAUSED'
      },
      adsets: [{
        name: 'All_18-55_cpc',
        daily_budget: 1000,
        start_time: '2026-06-20T00:00:00+0300',
        end_time: '2026-06-30T23:59:59+0300',
        optimization_goal: 'LINK_CLICKS',
        billing_event: 'IMPRESSIONS',
        pixel_id: PIXEL_ID,
        targeting: TARGETING,
        ads: [{
          name: '1606_1',
          url: 'https://apollo.online/clubs/',
          utm: 'utm_source=facebook&utm_medium=cpc&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}',
          text: 'Apollo Next — запишись онлайн прямо зараз!',
          headline: 'Знайди свій клуб',
          dropbox_link: DROPBOX
        }]
      }]
    }
  },
  {
    label: 'CONVERSION (покупки)',
    structure: {
      page_id: PAGE_ID,
      campaign: {
        name: 'A_Apollo_conversion_All_test_1606',
        objective: 'OUTCOME_SALES',
        status: 'PAUSED'
      },
      adsets: [{
        name: 'All_18-55_purchase',
        daily_budget: 1000,
        start_time: '2026-06-20T00:00:00+0300',
        end_time: '2026-06-30T23:59:59+0300',
        optimization_goal: 'OFFSITE_CONVERSIONS',
        billing_event: 'IMPRESSIONS',
        pixel_id: PIXEL_ID,
        promoted_object: {
          pixel_id: PIXEL_ID,
          custom_event_type: 'PURCHASE'
        },
        targeting: TARGETING,
        ads: [{
          name: '1606_1',
          url: 'https://apollo.online/clubs/',
          utm: 'utm_source=facebook&utm_medium=conversion&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}',
          text: 'Apollo Next — стань членом клубу вже сьогодні!',
          headline: 'Купи абонемент',
          dropbox_link: DROPBOX
        }]
      }]
    }
  }
];

async function run() {
  const summary = [];

  for (const { label, structure } of campaigns) {
    console.log(`\n${'━'.repeat(60)}`);
    console.log(`🚀 ${label}`);
    console.log('━'.repeat(60));

    try {
      const result = await createFullStructure(structure);

      const campaignOk = !!result.campaign_id;
      const adsCreated = result.ads.length;
      const hasErrors = result.errors.length > 0;

      console.log(`\n📊 ${label} — ПІДСУМОК:`);
      console.log(`   Кампанія: ${result.campaign_id} ${campaignOk ? '✅' : '❌'}`);
      console.log(`   Оголошення: ${adsCreated}`);
      result.ads.forEach(a => console.log(`     ${a.name} → ${a.id}`));
      if (hasErrors) {
        console.log(`   Помилки:`);
        result.errors.forEach(e => console.log(`     ❌ ${e}`));
      }

      summary.push({ label, campaign_id: result.campaign_id, ads: adsCreated, errors: result.errors.length });
    } catch (e) {
      console.log(`❌ Критична помилка: ${e.message}`);
      summary.push({ label, campaign_id: null, ads: 0, errors: 1 });
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('ФІНАЛЬНИЙ ЗВІТ:');
  console.log('═'.repeat(60));
  summary.forEach(s => {
    const status = s.errors === 0 && s.campaign_id ? '✅' : '❌';
    console.log(`${status} ${s.label}: campaign ${s.campaign_id || '—'}, ads: ${s.ads}, errors: ${s.errors}`);
  });
}

run();
