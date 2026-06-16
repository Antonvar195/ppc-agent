const { apiPost, apiGet } = require('./meta_api');
require('dotenv').config({ path: '../.env' });

const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const URL = 'https://apollo.online/clubs/';
const TEXT = 'Apollo Next — фітнес для всіх.';
const TITLE = 'Спробуй Apollo Next';
const FEED_HASH  = '15fe11030ad2ae65086f136d5c68f152';
const STORY_HASH = '08a1a0b9db54bb80658c3127f28c84a5';

async function tryCreative(name, payload) {
  console.log('\n--- ' + name + ' ---');
  const r = await apiPost(AD_ACCOUNT_ID + '/adcreatives', payload);
  if (r.error) {
    console.log('FAIL ' + r.error.code + '/' + (r.error.error_subcode||'-') + ': ' + r.error.message);
    if (r.error.error_data) console.log('  data:', JSON.stringify(r.error.error_data));
    return null;
  }
  console.log('OK creative_id: ' + r.id);
  const d = await apiGet(r.id, { fields: 'id,name,object_story_spec,asset_feed_spec' });
  const feedImgs = d.asset_feed_spec ? (d.asset_feed_spec.images||[]).length : 0;
  const linkDataKeys = d.object_story_spec ? Object.keys(d.object_story_spec.link_data||{}).join(',') : 'none';
  console.log('  feed_images:' + feedImgs + ' link_data_keys:' + linkDataKeys);
  return r.id;
}

async function run() {
  // Test 1: pure asset_feed_spec no rules (baseline - works)
  await tryCreative('1: asset_feed_spec baseline no rules', {
    name: 'test_1', object_story_spec: JSON.stringify({ page_id: PAGE_ID }), link_url: URL,
    asset_feed_spec: JSON.stringify({
      bodies: [{text:TEXT}], titles: [{text:TITLE}], link_urls: [{website_url:URL}],
      call_to_action_types: ['LEARN_MORE'], ad_formats: ['SINGLE_IMAGE'],
      images: [{hash:FEED_HASH},{hash:STORY_HASH}]
    })
  });

  // Test 2: page_id top-level + asset_feed_spec with rules inside
  await tryCreative('2: page_id top-level + rules inside asset_feed_spec', {
    name: 'test_2', page_id: PAGE_ID,
    asset_feed_spec: JSON.stringify({
      bodies: [{text:TEXT}], titles: [{text:TITLE}], link_urls: [{website_url:URL}],
      call_to_action_types: ['LEARN_MORE'], ad_formats: ['SINGLE_IMAGE'],
      images: [{hash:FEED_HASH,adlabels:[{name:'FEED_IMG'}]},{hash:STORY_HASH,adlabels:[{name:'STORY_IMG'}]}],
      asset_customization_rules: [
        {customization_spec:{publisher_platforms:['instagram'],instagram_positions:['story','reels']},image_label:{name:'STORY_IMG'},priority:1},
        {customization_spec:{publisher_platforms:['facebook','instagram'],facebook_positions:['feed'],instagram_positions:['stream']},image_label:{name:'FEED_IMG'},priority:2,is_default:true}
      ]
    })
  });

  // Test 3: asset_feed_spec + degrees_of_freedom adapt_to_placement
  await tryCreative('3: asset_feed_spec + adapt_to_placement OPT_IN', {
    name: 'test_3', object_story_spec: JSON.stringify({ page_id: PAGE_ID }), link_url: URL,
    asset_feed_spec: JSON.stringify({
      bodies: [{text:TEXT}], titles: [{text:TITLE}], link_urls: [{website_url:URL}],
      call_to_action_types: ['LEARN_MORE'], ad_formats: ['SINGLE_IMAGE'],
      images: [{hash:FEED_HASH},{hash:STORY_HASH}]
    }),
    degrees_of_freedom_spec: JSON.stringify({creative_features_spec:{adapt_to_placement:{enroll_status:'OPT_IN'}}})
  });

  // Test 4: object_story_spec + top-level rules with image_hash (not image_label)
  await tryCreative('4: object_story_spec + top-level rules + image_hash', {
    name: 'test_4',
    object_story_spec: JSON.stringify({
      page_id: PAGE_ID,
      link_data: {link:URL,message:TEXT,name:TITLE,image_hash:FEED_HASH,call_to_action:{type:'LEARN_MORE',value:{link:URL}}}
    }),
    asset_customization_rules: JSON.stringify([
      {customization_spec:{publisher_platforms:['facebook','instagram'],facebook_positions:['story','facebook_reels'],instagram_positions:['story','reels']},image_hash:STORY_HASH}
    ])
  });

  // Test 5: optimization_type PLACEMENT + asset_feed_spec + top-level rules
  await tryCreative('5: optimization_type PLACEMENT + asset_feed_spec + top-level rules', {
    name: 'test_5', page_id: PAGE_ID, optimization_type: 'PLACEMENT',
    asset_feed_spec: JSON.stringify({
      bodies: [{text:TEXT}], titles: [{text:TITLE}], link_urls: [{website_url:URL}],
      call_to_action_types: ['LEARN_MORE'], ad_formats: ['SINGLE_IMAGE'],
      images: [{hash:FEED_HASH,adlabels:[{name:'FEED_IMG'}]},{hash:STORY_HASH,adlabels:[{name:'STORY_IMG'}]}]
    }),
    asset_customization_rules: JSON.stringify([
      {customization_spec:{publisher_platforms:['instagram'],instagram_positions:['story','reels']},image_label:{name:'STORY_IMG'},priority:1},
      {customization_spec:{publisher_platforms:['facebook','instagram'],facebook_positions:['feed'],instagram_positions:['stream']},image_label:{name:'FEED_IMG'},priority:2,is_default:true}
    ])
  });
}

run().catch(console.error);
