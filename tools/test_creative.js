const { buildAssetFeedSpec, createAdWithAssets } = require('./creative_builder');
require('dotenv').config();

async function test() {
  const dropboxLink = 'https://www.dropbox.com/scl/fo/bufmdnpl1auqm5upjj8gu/ABZ0-iPdEWsoUPs8EzF1k08?dl=0&e=1&rlkey=dfu84xbd4xpb1zaovpwfel298';

  console.log('🧪 Тест збірки креативів\n');

  try {
    const assetFeedSpec = await buildAssetFeedSpec(
      dropboxLink,
      'Apollo Next — фітнес для всіх. Перше тренування безкоштовно!',
      'Спробуй Apollo Next',
      'https://apollo.online/clubs/'
    );

    console.log('\n✅ asset_feed_spec зібрано:');
    console.log(JSON.stringify(assetFeedSpec, null, 2));

  } catch (err) {
    console.log('❌ Помилка:', err.message);
  }
}

test();
