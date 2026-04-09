const axios = require('axios');
const { listFolderBySharedLink } = require('./dropbox_reader');
const { isVideo } = require('./media_uploader');
const { apiPost } = require('./meta_api');
require('dotenv').config();

const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const DROPBOX_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;

// Скачать файл из Dropbox по shared link + имя файла → буфер
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

// Загрузить все файлы из Dropbox в Meta
// Вернуть asset_feed_spec готовый для объявления
async function buildAssetFeedSpec(dropboxLink, adText, adHeadline, destinationUrl) {
  console.log('\n📦 Збираю креативи...');

  // 1. Читаем файлы из Dropbox
  const files = await listFolderBySharedLink(dropboxLink);
  console.log(`Знайдено файлів: ${files.length}`);

  const images = [];
  const videos = [];

  // 2. Загружаем каждый файл: скачиваем из Dropbox → заливаем в Meta
  for (const file of files) {
    try {
      console.log(`  ⬇️  Завантажую з Dropbox: ${file.name}`);
      const { sharedFolderUrl, fileName } = file.downloadUrl;
      const buffer = await downloadFromSharedFolder(sharedFolderUrl, fileName);

      if (isVideo(file.name)) {
        // Видео — загружаем через file_url (Meta скачивает сам) — пока не поддерживаем буфер
        console.log(`  ⚠️ Відео поки не підтримується через буфер, пропускаємо: ${file.name}`);
      } else {
        console.log(`  ⬆️  Заливаю в Meta: ${file.name} (${Math.round(buffer.length / 1024)}KB)`);
        const hash = await uploadImageBufferToMeta(buffer, file.name);
        images.push({ hash });
        console.log(`  ✅ hash: ${hash}`);
      }
    } catch (err) {
      console.log(`⚠️ Не вдалося завантажити ${file.name}: ${err.message}`);
    }
  }

  console.log(`✅ Завантажено: ${images.length} зображень, ${videos.length} відео`);

  // 3. Собираем asset_feed_spec
  const assetFeedSpec = {
    bodies: [{ text: adText }],
    titles: [{ text: adHeadline }],
    link_urls: [{
      website_url: destinationUrl,
      display_url: destinationUrl
    }],
    call_to_action_types: ['LEARN_MORE'],
    ad_formats: ['AUTOMATIC_FORMAT']
  };

  if (images.length > 0) assetFeedSpec.images = images;
  if (videos.length > 0) assetFeedSpec.videos = videos;

  return assetFeedSpec;
}

// Создать объявление с asset_feed_spec
async function createAdWithAssets(adsetId, adName, assetFeedSpec, pageId) {
  console.log(`\n📄 Створюю об'явлення: ${adName}`);

  // Для кожного зображення створюємо окреме оголошення
  const adIds = [];
  const imageHashes = assetFeedSpec.images || [];

  if (imageHashes.length === 0) {
    throw new Error('Немає зображень для створення оголошення');
  }

  for (let i = 0; i < imageHashes.length; i++) {
    const adSuffix = imageHashes.length > 1 ? `_${String(i + 1).padStart(2, '0')}` : '';
    const singleAdName = adName + adSuffix;

    const creativeResult = await apiPost(`${AD_ACCOUNT_ID}/adcreatives`, {
      name: singleAdName + '_creative',
      object_story_spec: JSON.stringify({
        page_id: pageId,
        link_data: {
          link: assetFeedSpec.link_urls[0].website_url,
          message: assetFeedSpec.bodies[0].text,
          name: assetFeedSpec.titles[0].text,
          image_hash: imageHashes[i].hash,
          call_to_action: {
            type: 'LEARN_MORE',
            value: { link: assetFeedSpec.link_urls[0].website_url }
          }
        }
      })
    });

    if (creativeResult.error) {
      console.log(`⚠️ Creative ${singleAdName}:`, JSON.stringify(creativeResult.error));
      continue;
    }

    const adResult = await apiPost(`${AD_ACCOUNT_ID}/ads`, {
      name: singleAdName,
      adset_id: adsetId,
      creative: JSON.stringify({ creative_id: creativeResult.id }),
      status: 'PAUSED'
    });

    if (adResult.error) {
      console.log(`⚠️ Ad ${singleAdName}:`, JSON.stringify(adResult.error));
      continue;
    }

    console.log(`  ✅ ${singleAdName}: ${adResult.id}`);
    adIds.push(adResult.id);
  }

  if (adIds.length === 0) throw new Error('Жодне оголошення не створено');
  console.log(`✅ Створено оголошень: ${adIds.length}`);
  return adIds[0]; // возвращаем первый id для совместимости
}

module.exports = { buildAssetFeedSpec, createAdWithAssets };
