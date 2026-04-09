const axios = require('axios');
const { listFolderBySharedLink } = require('./dropbox_reader');
const { isVideo } = require('./media_uploader');
const { apiPost } = require('./meta_api');
require('dotenv').config();

const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const DROPBOX_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;

// Скачать файл из Dropbox shared folder → буфер
async function downloadFromSharedFolder(sharedFolderUrl, fileName) {
  const response = await axios({
    method: 'post',
    url: 'https://content.dropboxapi.com/2/sharing/get_shared_link_file',
    headers: {
      'Authorization': `Bearer ${DROPBOX_TOKEN}`,
      'Dropbox-API-Arg': JSON.stringify({ url: sharedFolderUrl, path: '/' + fileName }),
      'Content-Type': ''
    },
    data: '',
    responseType: 'arraybuffer',
    maxContentLength: 50 * 1024 * 1024
  });
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
        // TODO: видео через буфер не поддерживается, пропускаем
        console.log(`    ⚠️ Відео пропущено (поки не підтримується): ${file.name}`);
      } else {
        const hash = await uploadImageBufferToMeta(buffer, file.name);
        images.push({ hash });
        console.log(`    ✅ hash: ${hash}`);
      }
    } catch (err) {
      console.log(`    ⚠️ ${file.name}: ${err.message}`);
    }
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
    console.log('Використовую fallback з першим зображенням...');

    const firstImage = assetFeedSpec.images?.[0];
    if (!firstImage) throw new Error('Немає зображень для fallback');

    const fallbackCreative = await apiPost(`${AD_ACCOUNT_ID}/adcreatives`, {
      name: adName + '_creative',
      object_story_spec: JSON.stringify({
        page_id: pageId,
        link_data: {
          link: assetFeedSpec.link_urls[0].website_url,
          message: assetFeedSpec.bodies[0].text,
          name: assetFeedSpec.titles[0].text,
          image_hash: firstImage.hash,
          call_to_action: {
            type: 'LEARN_MORE',
            value: { link: assetFeedSpec.link_urls[0].website_url }
          }
        }
      })
    });

    if (fallbackCreative.error) {
      throw new Error(`Fallback creative: ${fallbackCreative.error.message}`);
    }

    const adResult = await apiPost(`${AD_ACCOUNT_ID}/ads`, {
      name: adName,
      adset_id: adsetId,
      creative: JSON.stringify({ creative_id: fallbackCreative.id }),
      status: 'PAUSED'
    });

    if (adResult.error) throw new Error(`Ad: ${adResult.error.message}`);
    console.log(`✅ Об'явлення (fallback) створено: ${adResult.id}`);
    return adResult.id;
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

module.exports = { buildAllCreativeSpecs, createAdWithAssets };
