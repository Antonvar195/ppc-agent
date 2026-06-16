const axios = require('axios');
const FormData = require('form-data');
const { listFolderBySharedLink } = require('./dropbox_reader');
const { isVideo } = require('./media_uploader');
const { apiPost } = require('./meta_api');
require('dotenv').config();

const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const API_VERSION = 'v21.0';

function stripUtmParams(url) {
  try {
    const u = new URL(url);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(p => u.searchParams.delete(p));
    return u.toString();
  } catch (e) {
    return url;
  }
}

// Скачать файл из Dropbox shared folder → буфер
async function downloadFromSharedFolder(sharedFolderUrl, fileName) {
  const { dropboxRequest } = require('./dropbox_reader');
  const response = await dropboxRequest(token => axios({
    method: 'post',
    url: 'https://content.dropboxapi.com/2/sharing/get_shared_link_file',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({ url: sharedFolderUrl, path: '/' + fileName }),
      'Content-Type': ''
    },
    data: '',
    responseType: 'arraybuffer',
    maxContentLength: 50 * 1024 * 1024
  }));
  return Buffer.from(response.data);
}

// Загрузить изображение (буфер) в Meta → вернуть hash
async function uploadImageBufferToMeta(buffer, name) {
  const base64 = buffer.toString('base64');
  const result = await apiPost(`${AD_ACCOUNT_ID}/adimages`, {
    bytes: base64,
    name: name
  });
  if (result.error) throw new Error(result.error.message);
  const imgData = Object.values(result.images || {})[0];
  if (!imgData) throw new Error('Meta не повернув hash зображення');
  return imgData.hash;
}

// Загрузить видео (буфер) в Meta → вернуть video_id
async function uploadVideoBufferToMeta(buffer, name) {
  const form = new FormData();
  form.append('access_token', process.env.META_ACCESS_TOKEN);
  form.append('name', name);
  form.append('source', buffer, {
    filename: name,
    contentType: name.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4'
  });

  const response = await axios.post(
    `https://graph-video.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/advideos`,
    form,
    {
      headers: form.getHeaders(),
      maxContentLength: 200 * 1024 * 1024,
      timeout: 120000
    }
  );

  if (response.data.error) throw new Error(response.data.error.message);
  if (!response.data.id) throw new Error('Meta не повернув ID відео');
  return response.data.id;
}

// Извлечь числовой идентификатор из имени файла
function extractCreativeId(filename) {
  const match = filename.match(/(\d+)/g);
  if (match) {
    return match[0].replace(/^0+/, '') || '0'; // убираем ведущие нули
  }
  return null;
}

// Группировать файлы по числовому идентификатору
function groupByCreativeId(files) {
  const groups = {};
  const noId = [];

  files.forEach(file => {
    const id = extractCreativeId(file.name);
    if (id !== null) {
      if (!groups[id]) groups[id] = [];
      groups[id].push(file);
    } else {
      noId.push(file);
    }
  });

  if (noId.length > 0) {
    groups['other'] = noId;
  }

  return groups;
}

// Собрать spec для одной группы: скачать из Dropbox → загрузить в Meta
async function buildSpecForGroup(files, adText, adHeadline, destinationUrl) {
  const images = [];
  const videos = [];

  for (const file of files) {
    try {
      console.log(`    ⬇️  ${file.name} (${Math.round(file.size / 1024)}KB) [${file.format || 'square'}]`);
      const { sharedFolderUrl, fileName } = file.downloadUrl;
      const buffer = await downloadFromSharedFolder(sharedFolderUrl, fileName);
      const label = (file.format === 'vertical') ? 'STORY' : 'FEED';

      if (isVideo(file.name)) {
        const videoId = await uploadVideoBufferToMeta(buffer, file.name);
        videos.push({ video_id: videoId, adlabels: [{ name: `${label}_VIDEO` }], _format: label });
        console.log(`    ✅ video_id: ${videoId} [${label}]`);
      } else {
        const hash = await uploadImageBufferToMeta(buffer, file.name);
        images.push({ hash, adlabels: [{ name: `${label}_IMG` }], _format: label });
        console.log(`    ✅ hash: ${hash} [${label}]`);
      }
    } catch (err) {
      console.log(`    ⚠️ ${file.name}: ${err.message}`);
    }
  }

  if (images.length === 0 && videos.length === 0) {
    throw new Error(`Не вдалося завантажити жодного медіафайлу для групи (${files.map(f => f.name).join(', ')})`);
  }

  const hasFeedImg   = images.some(i => i._format === 'FEED');
  const hasStoryImg  = images.some(i => i._format === 'STORY');
  const hasFeedVid   = videos.some(v => v._format === 'FEED');
  const hasStoryVid  = videos.some(v => v._format === 'STORY');
  const hasMixed = (hasFeedImg || hasFeedVid) && (hasStoryImg || hasStoryVid);

  // Убираем служебное поле _format перед отправкой в Meta
  const cleanImages = images.map(({ _format, ...rest }) => rest);
  const cleanVideos = videos.map(({ _format, ...rest }) => rest);

  const spec = {
    bodies: [{ text: adText }],
    titles: [{ text: adHeadline }],
    link_urls: [{ website_url: destinationUrl }],
    call_to_action_types: ['LEARN_MORE'],
    ad_formats: ['SINGLE_IMAGE']
  };

  if (cleanImages.length > 0) spec.images = cleanImages;
  if (cleanVideos.length > 0) spec.videos = cleanVideos;

  // PAC через adlabels + image_label в asset_customization_rules
  if (hasMixed) {
    const rules = [];
    if (hasStoryImg) rules.push({
      customization_spec: {
        publisher_platforms: ['facebook', 'instagram'],
        facebook_positions: ['story', 'facebook_reels'],
        instagram_positions: ['story', 'reels']
      },
      image_label: { name: 'STORY_IMG' },
      priority: 1
    });
    if (hasStoryVid) rules.push({
      customization_spec: {
        publisher_platforms: ['facebook', 'instagram'],
        facebook_positions: ['story', 'facebook_reels'],
        instagram_positions: ['story', 'reels']
      },
      video_label: { name: 'STORY_VIDEO' },
      priority: 1
    });
    if (hasFeedImg) rules.push({
      customization_spec: {
        publisher_platforms: ['facebook', 'instagram'],
        facebook_positions: ['feed', 'marketplace', 'search', 'video_feeds', 'profile_feed'],
        instagram_positions: ['stream', 'explore', 'explore_home', 'profile_feed']
      },
      image_label: { name: 'FEED_IMG' },
      priority: 2,
      is_default: true
    });
    if (hasFeedVid) rules.push({
      customization_spec: {
        publisher_platforms: ['facebook', 'instagram'],
        facebook_positions: ['feed', 'marketplace', 'search', 'video_feeds', 'profile_feed'],
        instagram_positions: ['stream', 'explore', 'explore_home', 'profile_feed']
      },
      video_label: { name: 'FEED_VIDEO' },
      priority: 2,
      is_default: !hasFeedImg
    });
    spec.asset_customization_rules = rules;
    console.log(`    📐 PAC rules: ${rules.map(r => r.image_label?.name || r.video_label?.name).join(' + ')}`);
  }

  return spec;
}

// Главная функция — возвращает массив specs, по одному на каждый креатив
async function buildAllCreativeSpecs(dropboxLink, adText, adHeadline, destinationUrl) {
  console.log('\n📦 Читаю креативи з Dropbox...');

  const files = await listFolderBySharedLink(dropboxLink);
  console.log(`Знайдено файлів: ${files.length}`);

  const groups = groupByCreativeId(files);
  const groupKeys = Object.keys(groups).sort((a, b) => {
    const na = parseInt(a) || 0;
    const nb = parseInt(b) || 0;
    return na - nb;
  });

  console.log(`\nЗнайдено креативів: ${groupKeys.length}`);
  groupKeys.forEach(key => {
    console.log(`  Креатив ${key}: ${groups[key].map(f => f.name).join(', ')}`);
  });

  const specs = [];
  for (const key of groupKeys) {
    console.log(`\n⬆️  Завантажую креатив ${key}...`);
    const spec = await buildSpecForGroup(groups[key], adText, adHeadline, destinationUrl);
    specs.push({ creativeId: key, spec });
  }

  return specs;
}

// Создать объявление с asset_feed_spec
// Adset must have is_dynamic_creative: true for asset_feed_spec to work
async function createAdWithAssets(adsetId, adName, assetFeedSpec, pageId) {
  console.log(`\n📄 Створюю об'явлення: ${adName}`);

  const topLevelUrl = assetFeedSpec.link_urls[0].website_url;
  // Strip internal fields from spec before sending to Meta
  const { asset_customization_rules, ...feedSpecClean } = assetFeedSpec;

  const hasMixed = !!(
    feedSpecClean.images?.some(i => i.adlabels?.[0]?.name === 'FEED_IMG') &&
    feedSpecClean.images?.some(i => i.adlabels?.[0]?.name === 'STORY_IMG')
  );

  if (hasMixed) {
    console.log(`  📐 PAC: asset_feed_spec (FEED+STORY) + adapt_to_placement OPT_IN`);
  }

  // degrees_of_freedom_spec: opt into placement-aware serving
  const degreesOfFreedom = {
    creative_features_spec: {
      adapt_to_placement: { enroll_status: 'OPT_IN' }
    }
  };
  if (hasMixed) {
    degreesOfFreedom.creative_features_spec.pac_recomposition = { enroll_status: 'OPT_IN' };
  }

  const creativePayload = {
    name: adName + '_creative',
    object_story_spec: JSON.stringify({ page_id: pageId }),
    link_url: topLevelUrl,
    asset_feed_spec: JSON.stringify(feedSpecClean),
    degrees_of_freedom_spec: JSON.stringify(degreesOfFreedom)
  };

  const creativeResult = await apiPost(`${AD_ACCOUNT_ID}/adcreatives`, creativePayload);

  if (creativeResult.error) {
    console.log(`⚠️  asset_feed_spec error ${creativeResult.error.code}/${creativeResult.error.error_subcode || '–'}: ${creativeResult.error.message}`);
    console.log(`    error_data: ${JSON.stringify(creativeResult.error.error_data || {})}`);

    // Fallback: use first FEED image (or first available) with object_story_spec
    const rawUrl = assetFeedSpec.link_urls[0].website_url;
    const cleanUrl = stripUtmParams(rawUrl);
    const adText  = assetFeedSpec.bodies[0].text;
    const adTitle = assetFeedSpec.titles[0].text;

    const feedImg = (assetFeedSpec.images || []).find(i => i.adlabels?.[0]?.name === 'FEED_IMG')
      || (assetFeedSpec.images || [])[0];
    const feedVid = (assetFeedSpec.videos || []).find(v => v.adlabels?.[0]?.name === 'FEED_VIDEO')
      || (assetFeedSpec.videos || [])[0];
    const media   = feedImg || feedVid;
    if (!media) throw new Error('Немає медіа для fallback');

    const objectStorySpec = feedImg
      ? { page_id: pageId, link_data: { link: cleanUrl, message: adText, name: adTitle, image_hash: feedImg.hash, call_to_action: { type: 'LEARN_MORE', value: { link: rawUrl } } } }
      : { page_id: pageId, video_data: { video_id: feedVid.video_id, message: adText, title: adTitle, call_to_action: { type: 'LEARN_MORE', value: { link: rawUrl } } } };

    const fallbackCreative = await apiPost(`${AD_ACCOUNT_ID}/adcreatives`, {
      name: adName + '_creative',
      object_story_spec: JSON.stringify(objectStorySpec)
    });
    if (fallbackCreative.error) throw new Error(`Fallback creative: ${fallbackCreative.error.message}`);

    const fallbackAd = await apiPost(`${AD_ACCOUNT_ID}/ads`, {
      name: adName, adset_id: adsetId,
      creative: JSON.stringify({ creative_id: fallbackCreative.id }),
      status: 'PAUSED'
    });
    if (fallbackAd.error) throw new Error(`Fallback ad: ${fallbackAd.error.message}`);
    console.log(`✅ Об'явлення (fallback) створено: ${fallbackAd.id}`);
    return fallbackAd.id;
  }

  console.log(`  ✅ Creative створено: ${creativeResult.id}`);

  const adResult = await apiPost(`${AD_ACCOUNT_ID}/ads`, {
    name: adName,
    adset_id: adsetId,
    creative: JSON.stringify({ creative_id: creativeResult.id }),
    status: 'PAUSED'
  });

  if (adResult.error) {
    console.log(`  ⚠️ Ad error ${adResult.error.code}/${adResult.error.error_subcode || '–'}: ${adResult.error.message}`);
    console.log(`  ⚠️ Ad error_data: ${JSON.stringify(adResult.error.error_data || {})}`);
    throw new Error(`Ad: ${adResult.error.message}`);
  }
  console.log(`✅ Об'явлення створено: ${adResult.id}`);
  return adResult.id;
}

module.exports = { buildAllCreativeSpecs, createAdWithAssets, uploadVideoBufferToMeta };
