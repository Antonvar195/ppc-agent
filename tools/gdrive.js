// Google Drive (спільний диск short-drama) → буфер відео.
// Прямі посилання Drive на великі файли Meta забрати не може (сторінка перевірки на віруси),
// тому качаємо самі через Drive API і заливаємо в Meta буфером.
// Доступ — сервісний акаунт short-drama: шлях до JSON-ключа в GDRIVE_SA_KEY_FILE (.env).
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');

let cached = { token: '', exp: 0 };

async function accessToken() {
  if (cached.token && Date.now() < cached.exp - 60_000) return cached.token;
  const file = process.env.GDRIVE_SA_KEY_FILE;
  if (!file) throw new Error('GDRIVE_SA_KEY_FILE не задано в .env — потрібен ключ сервісного акаунта short-drama');
  const key = JSON.parse(fs.readFileSync(file, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: key.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url');
  const r = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}`,
  }));
  cached = { token: r.data.access_token, exp: Date.now() + r.data.expires_in * 1000 };
  return cached.token;
}

async function downloadFile(fileId) {
  const r = await axios.get(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
    params: { alt: 'media', supportsAllDrives: true },
    headers: { Authorization: `Bearer ${await accessToken()}` },
    responseType: 'arraybuffer', maxContentLength: Infinity, timeout: 15 * 60 * 1000,
  });
  return Buffer.from(r.data);
}

module.exports = { downloadFile };
