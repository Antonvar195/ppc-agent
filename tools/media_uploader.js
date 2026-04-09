const axios = require('axios');
const FormData = require('form-data');
const { apiPost } = require('./meta_api');
require('dotenv').config();

const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const TOKEN = process.env.META_ACCESS_TOKEN;
const API_VERSION = 'v19.0';

// Загрузить изображение в Meta по URL
async function uploadImageFromUrl(imageUrl, name) {
  console.log(`📤 Загружаю изображение: ${name}`);

  const result = await apiPost(`${AD_ACCOUNT_ID}/adimages`, {
    filename: name,
    url: imageUrl
  });

  if (result.error) {
    throw new Error(`Ошибка загрузки изображения: ${result.error.message}`);
  }

  // Meta возвращает хеш в images[filename]
  const images = result.images;
  const key = Object.keys(images)[0];
  const hash = images[key].hash;

  console.log(`✅ Изображение загружено, hash: ${hash}`);
  return hash;
}

// Загрузить видео в Meta по URL
async function uploadVideoFromUrl(videoUrl, name) {
  console.log(`📤 Загружаю видео: ${name}`);

  const result = await apiPost(`${AD_ACCOUNT_ID}/advideos`, {
    name: name,
    file_url: videoUrl
  });

  if (result.error) {
    throw new Error(`Ошибка загрузки видео: ${result.error.message}`);
  }

  console.log(`✅ Видео загружено, ID: ${result.id}`);
  return result.id;
}

// Определить тип файла
function isVideo(filename) {
  return /\.(mp4|mov|avi|mkv)$/i.test(filename);
}

// Загрузить все файлы из списка и вернуть хеши
async function uploadAll(files) {
  const results = {
    images: [], // [{name, hash, format, url}]
    videos: []  // [{name, id, format, url}]
  };

  for (const file of files) {
    try {
      if (isVideo(file.name)) {
        const id = await uploadVideoFromUrl(file.downloadUrl, file.name);
        results.videos.push({
          name: file.name,
          id: id,
          format: file.format,
          url: file.downloadUrl
        });
      } else {
        const hash = await uploadImageFromUrl(file.downloadUrl, file.name);
        results.images.push({
          name: file.name,
          hash: hash,
          format: file.format,
          url: file.downloadUrl
        });
      }
    } catch (err) {
      console.log(`⚠️ Не удалось загрузить ${file.name}: ${err.message}`);
    }
  }

  return results;
}

module.exports = { uploadImageFromUrl, uploadVideoFromUrl, uploadAll, isVideo };
