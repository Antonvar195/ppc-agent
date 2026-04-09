const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const TOKEN = process.env.META_ACCESS_TOKEN;
const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const API_VERSION = 'v19.0';
const BASE_URL = 'graph.facebook.com';

// Базовый GET запрос к Meta API
function apiGet(path, params = {}) {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams({
      access_token: TOKEN,
      ...params
    }).toString();

    const options = {
      hostname: BASE_URL,
      path: `/${API_VERSION}/${path}?${query}`,
      method: 'GET'
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Базовый POST запрос к Meta API
function apiPost(path, params = {}) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      access_token: TOKEN,
      ...params
    }).toString();

    const options = {
      hostname: BASE_URL,
      path: `/${API_VERSION}/${path}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Тест соединения — получить info об аккаунте
async function testConnection() {
  console.log('🔌 Проверка соединения с Meta API...\n');

  try {
    const result = await apiGet(`${AD_ACCOUNT_ID}`, {
      fields: 'id,name,account_status,currency,timezone_name'
    });

    if (result.error) {
      console.log('❌ Ошибка:', result.error.message);
      console.log('Код:', result.error.code);
      return false;
    }

    console.log('✅ Соединение успешно!\n');
    console.log('📊 Рекламный аккаунт:');
    console.log(`   ID:       ${result.id}`);
    console.log(`   Название: ${result.name}`);
    console.log(`   Статус:   ${result.account_status === 1 ? '✅ Активен' : '⚠️ ' + result.account_status}`);
    console.log(`   Валюта:   ${result.currency}`);
    console.log(`   Timezone: ${result.timezone_name}`);
    return true;

  } catch (err) {
    console.log('❌ Ошибка соединения:', err.message);
    return false;
  }
}

// Получить список активных кампаний
async function getCampaigns() {
  const result = await apiGet(`${AD_ACCOUNT_ID}/campaigns`, {
    fields: 'id,name,status,objective',
    limit: 10
  });
  return result;
}

module.exports = { apiGet, apiPost, testConnection, getCampaigns };

// Запуск теста если файл вызван напрямую
if (require.main === module) {
  testConnection();
}
