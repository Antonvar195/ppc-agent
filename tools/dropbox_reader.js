const axios = require('axios');
require('dotenv').config();

const DROPBOX_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;

// Получить список файлов в папке Dropbox
async function listFolder(folderPath) {
  const response = await axios.post(
    'https://api.dropboxapi.com/2/files/list_folder',
    { path: folderPath, recursive: false },
    {
      headers: {
        'Authorization': `Bearer ${DROPBOX_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data.entries.filter(f =>
    f['.tag'] === 'file' &&
    /\.(jpg|jpeg|png|mp4|mov)$/i.test(f.name)
  );
}

// Получить прямую ссылку на скачивание файла
async function getDownloadLink(filePath) {
  const response = await axios.post(
    'https://api.dropboxapi.com/2/files/get_temporary_link',
    { path: filePath },
    {
      headers: {
        'Authorization': `Bearer ${DROPBOX_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data.link;
}

// Скачать файл в буфер
async function downloadFile(link) {
  const response = await axios.get(link, {
    responseType: 'arraybuffer'
  });
  return Buffer.from(response.data);
}

// Определить формат файла по размеру/имени
function detectFormat(filename) {
  const name = filename.toLowerCase();
  if (name.includes('story') || name.includes('vertical') || name.includes('9x16')) {
    return 'vertical'; // 9:16 — Stories/Reels
  }
  if (name.includes('square') || name.includes('1x1')) {
    return 'square'; // 1:1 — Feed
  }
  if (name.includes('horizontal') || name.includes('16x9') || name.includes('landscape')) {
    return 'horizontal'; // 16:9 — Feed широкий
  }
  // Дефолт — квадрат
  return 'square';
}

module.exports = { listFolder, getDownloadLink, downloadFile, detectFormat };
