require('dotenv').config();

// При старті — одразу оновлюємо Dropbox токен через refresh token
async function start() {
  const { refreshDropboxToken } = require('./tools/dropbox_reader');

  const hasRefreshToken = process.env.DROPBOX_REFRESH_TOKEN &&
                          process.env.DROPBOX_APP_KEY &&
                          process.env.DROPBOX_APP_SECRET;

  console.log(`   DROPBOX_APP_KEY: ${process.env.DROPBOX_APP_KEY ? '✅' : '❌ ВІДСУТНІЙ'}`);
  console.log(`   DROPBOX_APP_SECRET: ${process.env.DROPBOX_APP_SECRET ? '✅' : '❌ ВІДСУТНІЙ'}`);
  console.log(`   DROPBOX_REFRESH_TOKEN: ${process.env.DROPBOX_REFRESH_TOKEN ? '✅' : '❌ ВІДСУТНІЙ'}`);
  console.log(`   DROPBOX_ACCESS_TOKEN (поточний): ${(process.env.DROPBOX_ACCESS_TOKEN || '').substring(0, 15)}...`);

  if (hasRefreshToken) {
    console.log('🔄 Оновлюю Dropbox token при старті...');
    const ok = await refreshDropboxToken();
    if (ok) {
      console.log('✅ Dropbox token оновлено:', (process.env.DROPBOX_ACCESS_TOKEN || '').substring(0, 15) + '...');
    } else {
      console.log('⚠️ Dropbox token не вдалося оновити, використовую поточний');
    }
  }

  // Запускаємо HTTP сервер (privacy policy)
  require('./server.js');

  // Запускаємо Telegram бот
  require('./bot/telegram_bot.js');
}

start().catch(console.error);
