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
  const bot = require('./bot/telegram_bot.js');

  // Планувальник (алерти + щоденний дайджест) — ТИМЧАСОВО ВИМКНЕНО за запитом користувача.
  // Бот і команди працюють, але автоматична розсилка статистики та алертів не йде.
  // Щоб увімкнути назад — постав SCHEDULER_ENABLED=true в .env (або прибери умову).
  if (process.env.SCHEDULER_ENABLED === 'true') {
    const scheduler = require('./tools/scheduler');
    const CHAT_ID = parseInt(process.env.TELEGRAM_USER_ID);
    scheduler.init((chatId, text, opts) => bot.sendMessage(chatId, text, opts), CHAT_ID);
    scheduler.start();
    console.log('📅 Scheduler enabled (SCHEDULER_ENABLED=true)');
  } else {
    console.log('⏸  Scheduler disabled — no auto stats/alerts (set SCHEDULER_ENABLED=true to re-enable)');
  }

  // Міст із Asana — окремий вимикач.
  // Розсилку статистики вимкнули свідомо, і виконання карток не має від неї
  // залежати: це різні речі. BRIDGE_ENABLED=false зупиняє тільки виконання.
  if (process.env.BRIDGE_ENABLED !== 'false' && process.env.ASANA_TOKEN) {
    const bridge = require('./bridge/run');
    const CHAT_ID = parseInt(process.env.TELEGRAM_USER_ID);

    const tick = async () => {
      try {
        const r = await bridge.once({});
        const acted = r.results.filter(x => !x.skipped);
        if (!acted.length) return;
        const lines = acted.map(x => `${x.ok ? '✅' : '❌'} ${x.task}${x.error ? `\n   ${x.error}` : ''}`);
        await bot.sendMessage(CHAT_ID,
          `⚙️ Міст виконав ${acted.length} картк(и)\n\n${lines.join('\n')}\n\n` +
          `Усе лежить НА ПАУЗІ. Вмикаєш вручну.`);
      } catch (e) {
        console.error('bridge error:', e.message);
      }
    };

    setInterval(tick, 15 * 60 * 1000);
    tick();
    console.log('⚙️  Bridge enabled — опитую секцію «В работу» кожні 15 хв');
  } else {
    console.log('⏸  Bridge disabled (нема ASANA_TOKEN або BRIDGE_ENABLED=false)');
  }
}

start().catch(console.error);
