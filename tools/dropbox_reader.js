const axios = require('axios');
const { imageSize } = require('image-size');
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

// Определить формат файла по имени (fallback)
function detectFormat(filename) {
  const name = filename.toLowerCase();
  if (name.includes('stor') || name.includes('vertical') || name.includes('9x16')) {
    return 'vertical'; // 9:16 — Stories/Reels
  }
  if (name.includes('square') || name.includes('1x1')) {
    return 'square'; // 1:1 — Feed
  }
  if (name.includes('horizontal') || name.includes('16x9') || name.includes('landscape')) {
    return 'horizontal'; // 16:9 — Feed широкий
  }
  return 'square';
}

// Определить формат по реальным размерам
function detectFormatByDimensions(buffer, filename) {
  try {
    // Для видео — по названию или дефолт vertical
    if (/\.(mp4|mov)$/i.test(filename)) {
      const name = filename.toLowerCase();
      if (name.includes('story') || name.includes('reel') || name.includes('vertical')) {
        return 'vertical';
      }
      if (name.includes('square') || name.includes('1x1')) {
        return 'square';
      }
      return 'vertical';
    }

    // Для изображений — читаем реальные размеры
    const dimensions = imageSize(buffer);
    const ratio = dimensions.width / dimensions.height;

    console.log(`  ${filename}: ${dimensions.width}x${dimensions.height} (ratio: ${ratio.toFixed(2)})`);

    if (ratio < 0.8) {
      return 'vertical';    // 9:16 или похожее — Stories/Reels
    } else if (ratio > 1.2) {
      return 'horizontal';  // 16:9 или похожее — широкий Feed
    } else {
      return 'square';      // ~1:1 — Feed квадрат
    }

  } catch (err) {
    console.log(`⚠️ Не удалось определить размер ${filename}, дефолт: square`);
    return 'square';
  }
}

// Конвертировать shared link в формат для API
function sharedLinkToPath(sharedLink) {
  return sharedLink.replace('dl=0', 'dl=1').replace('www.dropbox.com', 'dl.dropboxusercontent.com');
}

// Получить список файлов по shared link папки
async function listFolderBySharedLink(sharedLink) {
  const response = await axios.post(
    'https://api.dropboxapi.com/2/files/list_folder',
    {
      path: '',
      shared_link: { url: sharedLink }
    },
    {
      headers: {
        'Authorization': `Bearer ${DROPBOX_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const mediaFiles = response.data.entries.filter(f =>
    f['.tag'] === 'file' &&
    /\.(jpg|jpeg|png|mp4|mov)$/i.test(f.name)
  );

  // Для каждого файла получаем download link и определяем формат
  const filesWithFormat = [];

  for (const file of mediaFiles) {
    try {
      // Для файлов из shared папки — скачиваем через sharing/get_shared_link_file
      // передавая shared link папки + имя файла как path
      let format = 'square';

      if (!/\.(mp4|mov)$/i.test(file.name)) {
        try {
          // Скачиваем через sharing/get_shared_link_file (требует sharing.read scope)
          const fileResponse = await axios({
            method: 'post',
            url: 'https://content.dropboxapi.com/2/sharing/get_shared_link_file',
            headers: {
              'Authorization': `Bearer ${DROPBOX_TOKEN}`,
              'Dropbox-API-Arg': JSON.stringify({
                url: sharedLink,
                path: '/' + file.name
              }),
              'Content-Type': ''
            },
            data: '',
            responseType: 'arraybuffer',
            maxContentLength: 50 * 1024 * 1024
          });
          const buffer = Buffer.from(fileResponse.data);
          format = detectFormatByDimensions(buffer, file.name);
        } catch (downloadErr) {
          // Fallback: определяем формат по имени файла
          console.log(`  ⚠️ Недостатньо прав для завантаження ${file.name}, визначаю формат за назвою`);
          format = detectFormat(file.name);
        }
      } else {
        format = detectFormatByDimensions(null, file.name);
      }

      // Сохраняем shared link + имя файла — для последующей загрузки в Meta
      const downloadUrl = { sharedFolderUrl: sharedLink, fileName: file.name };

      filesWithFormat.push({
        name: file.name,
        id: file.id,
        size: file.size,
        downloadUrl: downloadUrl,
        sharedLink: sharedLink,
        format: format
      });

    } catch (err) {
      console.log(`⚠️ Ошибка обработки ${file.name}: ${err.response?.data ? JSON.stringify(err.response.data) : err.message}`);
    }
  }

  return filesWithFormat;
}

// Получить прямую ссылку на файл из shared папки
async function getFileDirectLink(sharedFolderLink, filePath) {
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

module.exports = {
  listFolder,
  listFolderBySharedLink,
  getDownloadLink,
  getFileDirectLink,
  downloadFile,
  detectFormat,
  detectFormatByDimensions,
  sharedLinkToPath
};
