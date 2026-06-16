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
      console.log(`    ⬇️  ${file.name} (${Math.round(file.size / 1024)}KB)`);
      const { sharedFolderUrl, fileName } = file.downloadUrl;
      const buffer = await downloadFromSharedFolder(sharedFolderUrl, fileName);

      if (isVideo(file.name)) {
        const videoId = await uploadVideoBufferToMeta(buffer, file.name);
        videos.push({ video_id: videoId });
        console.log(`    ✅ video_id: ${videoId}`);
      } else {
        const hash = await uploadImageBufferToMeta(buffer, file.name);
        images.push({ hash });
        console.log(`    ✅ hash: ${hash}`);
      }
    } catch (err) {
      console.log(`    ⚠️ ${file.name}: ${err.message}`);
    }
  }

  if (images.length === 0 && videos.length === 0) {
    throw new Error(`Не вдалося завантажити жодного медіафайлу для групи (${files.map(f => f.name).join(', ')})`);
  }

  const spec = {
    bodies: [{ text: adText }],
    titles: [{ text: adHeadline }],
    link_urls: [{
      website_url: destinationUrl,
      display_url: destinationUrl
    }],
    call_to_action_types: ['LEARN_MORE'],
    ad_formats: ['AUTOMATIC_FORMAT']
  };

  if (images.length > 0) spec.images = images;
  if (videos.length > 0) spec.videos = videos;

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
async function createAdWithAssets(adsetId, adName, assetFeedSpec, pageId) {
  console.log(`\n📄 Створюю об'явлення: ${adName}`);

  const creativeResult = await apiPost(`${AD_ACCOUNT_ID}/adcreatives`, {
    name: adName + '_creative',
    asset_feed_spec: JSON.stringify(assetFeedSpec),
    page_id: pageId
  });

  if (creativeResult.error) {
    console.log('asset_feed_spec помилка:', creativeResult.error.message);
    console.log('Використовую fallback — окреме об\'явлення на кожне медіа...');

    const rawUrl = assetFeedSpec.link_urls[0].website_url;
    const cleanUrl = stripUtmParams(rawUrl);
    const adText = assetFeedSpec.bodies[0].text;
    const adTitle = assetFeedSpec.titles[0].text;

    const allMedia = [
      ...(assetFeedSpec.images || []).map(img => ({ type: 'image', data: img })),
      ...(assetFeedSpec.videos || []).map(vid => ({ type: 'video', data: vid }))
    ];
    if (allMedia.length === 0) throw new Error('Немає медіа для fallback');

    const createdIds = [];
    for (let i = 0; i < allMedia.length; i++) {
      const media = allMedia[i];
      const suffix = allMedia.length > 1 ? `_${String.fromCharCode(97 + i)}` : ''; // _a, _b, ...
      const fallbackAdName = adName + suffix;

      let objectStorySpec;
      if (media.type === 'video') {
        objectStorySpec = {
          page_id: pageId,
          video_data: {
            video_id: media.data.video_id,
            message: adText,
            title: adTitle,
            call_to_action: { type: 'LEARN_MORE', value: { link: rawUrl } }
          }
        };
      } else {
        objectStorySpec = {
          page_id: pageId,
          link_data: {
            link: cleanUrl,
            message: adText,
            name: adTitle,
            image_hash: media.data.hash,
            call_to_action: { type: 'LEARN_MORE', value: { link: rawUrl } }
          }
        };
      }

      const fallbackCreative = await apiPost(`${AD_ACCOUNT_ID}/adcreatives`, {
        name: fallbackAdName + '_creative',
        object_story_spec: JSON.stringify(objectStorySpec)
      });
      if (fallbackCreative.error) {
        console.log(`  ⚠️ Creative ${i + 1}: ${fallbackCreative.error.message}`);
        continue;
      }

      const adResult = await apiPost(`${AD_ACCOUNT_ID}/ads`, {
        name: fallbackAdName,
        adset_id: adsetId,
        creative: JSON.stringify({ creative_id: fallbackCreative.id }),
        status: 'PAUSED'
      });
      if (adResult.error) {
        console.log(`  ⚠️ Ad ${i + 1}: ${adResult.error.message}`);
        continue;
      }

      console.log(`✅ Об'явлення (fallback ${i + 1}/${allMedia.length}) створено: ${adResult.id}`);
      createdIds.push(adResult.id);
    }

    if (createdIds.length === 0) throw new Error('Жодного об\'явлення не вдалося створити');
    return createdIds.length === 1 ? createdIds[0] : createdIds;
  }

  const adResult = await apiPost(`${AD_ACCOUNT_ID}/ads`, {
    name: adName,
    adset_id: adsetId,
    creative: JSON.stringify({ creative_id: creativeResult.id }),
    status: 'PAUSED'
  });

  if (adResult.error) throw new Error(`Ad: ${adResult.error.message}`);
  console.log(`✅ Об'явлення створено: ${adResult.id}`);
  return adResult.id;
}

module.exports = { buildAllCreativeSpecs, createAdWithAssets, uploadVideoBufferToMeta };
