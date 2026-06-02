require('dotenv').config();

// При старті — одразу оновлюємо Dropbox токен через refresh token
async function start() {
  const { refreshDropboxToken } = require('./tools/dropbox_reader');

  const hasRefreshToken = process.env.DROPBOX_REFRESH_TOKEN &&
                          process.env.DROPBOX_APP_KEY &&
                          process.env.DROPBOX_APP_SECRET;

  if (hasRefreshToken) {
    console.log('🔄 Оновлюю Dropbox token при старті...');
    const ok = await refreshDropboxToken();
    if (ok) {
      console.log('✅ Dropbox token оновлено');
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
