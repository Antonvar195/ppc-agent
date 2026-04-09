const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const ALLOWED_USER_ID = parseInt(process.env.TELEGRAM_USER_ID);

// Состояние диалога
const sessions = {};

// Проверка доступа
function isAllowed(userId) {
  return userId === ALLOWED_USER_ID;
}

// Старт
bot.onText(/\/start/, (msg) => {
  if (!isAllowed(msg.from.id)) return;

  bot.sendMessage(msg.chat.id,
    '👋 PPC Agent Apollo Next\n\n' +
    'Команды:\n' +
    '/launch — запустить кампанию\n' +
    '/status — статус активных кампаний\n' +
    '/help — помощь\n\n' +
    'Или просто напиши ТЗ на запуск.'
  );
});

// Помощь
bot.onText(/\/help/, (msg) => {
  if (!isAllowed(msg.from.id)) return;

  bot.sendMessage(msg.chat.id,
    '📋 Как написать ТЗ:\n\n' +
    'Укажи:\n' +
    '• Тип кампании (reach/cpc/conversion/leads)\n' +
    '• Гео (город или все)\n' +
    '• Дата старта и окончания\n' +
    '• Бюджет на группу (грн/день)\n' +
    '• Разбивку групп (возраст/wide/interest)\n' +
    '• Ссылки на креативы\n\n' +
    'Пример:\n' +
    'reach кампания на все города\n' +
    '3 группы: 18-35, 35-55, wide\n' +
    'по 3 видео в каждой группе\n' +
    'бюджет 500 грн/день на группу\n' +
    'старт 10.04, конец 30.04\n' +
    'креативы: [ссылки]'
  );
});

// Основной обработчик сообщений
bot.on('message', async (msg) => {
  if (!isAllowed(msg.from.id)) return;
  if (msg.text && msg.text.startsWith('/')) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  // Если ждём апрув
  if (sessions[userId] && sessions[userId].state === 'awaiting_approval') {
    await handleApproval(chatId, userId, text);
    return;
  }

  // Если ждём уточнения
  if (sessions[userId] && sessions[userId].state === 'awaiting_clarification') {
    await handleClarification(chatId, userId, text);
    return;
  }

  // Новое ТЗ
  await handleNewBrief(chatId, userId, text);
});

// Обработка нового ТЗ
async function handleNewBrief(chatId, userId, text) {
  sessions[userId] = {
    state: 'processing',
    brief: text,
    structure: null
  };

  await bot.sendMessage(chatId, '⏳ Обрабатываю ТЗ...');

  try {
    const { processLaunchBrief } = require('./orchestrator');
    const result = await processLaunchBrief(text);

    if (result.needsClarification) {
      sessions[userId].state = 'awaiting_clarification';
      sessions[userId].clarificationField = result.field;
      await bot.sendMessage(chatId, result.question);
      return;
    }

    if (result.error) {
      await bot.sendMessage(chatId, '❌ ' + result.error);
      delete sessions[userId];
      return;
    }

    sessions[userId].state = 'awaiting_approval';
    sessions[userId].structure = result.structure;

    await bot.sendMessage(chatId, result.preview, { parse_mode: 'HTML' });
    await bot.sendMessage(chatId,
      'Все верно? Напиши:\n' +
      '✅ <b>ок</b> — запустить\n' +
      '✏️ <b>правки</b> — что изменить',
      { parse_mode: 'HTML' }
    );

  } catch (err) {
    await bot.sendMessage(chatId, '❌ Ошибка: ' + err.message);
    delete sessions[userId];
  }
}

// Обработка апрува
async function handleApproval(chatId, userId, text) {
  const normalized = text.toLowerCase().trim();

  if (['ок', 'ok', 'запускай', 'запускати', 'підтверджую', 'да', 'yes'].includes(normalized)) {
    await bot.sendMessage(chatId, '🚀 Запускаю...');

    try {
      const { publishStructure } = require('./orchestrator');
      console.log('=== STRUCTURE TO PUBLISH ===');
      console.log(JSON.stringify(sessions[userId].structure, null, 2));
      console.log('============================');
      const result = await publishStructure(sessions[userId].structure);

      let report = '✅ <b>Кампания создана!</b>\n\n';
      report += `📢 <b>${result.campaign_name}</b>\n`;
      report += `ID: <code>${result.campaign_id}</code>\n\n`;
      report += '👥 <b>Группы:</b>\n';

      result.adsets.forEach(a => {
        report += `  ${a.name} — <code>${a.id}</code>\n`;
      });

      report += `\n📄 Объявлений: ${result.ads.length}\n`;
      report += '⏸️ Статус: PAUSED\n\n';
      report += '🔗 <a href="https://business.facebook.com/adsmanager">Открыть Ads Manager</a>';

      await bot.sendMessage(chatId, report, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });

    } catch (err) {
      await bot.sendMessage(chatId, '❌ Ошибка при публикации: ' + err.message);
    }

    delete sessions[userId];

  } else {
    sessions[userId].state = 'processing';
    sessions[userId].brief = sessions[userId].brief + '\nПравки: ' + text;
    await bot.sendMessage(chatId, '✏️ Принял правки, пересобираю структуру...');
    await handleNewBrief(chatId, userId, sessions[userId].brief);
  }
}

// Обработка уточнений
async function handleClarification(chatId, userId, text) {
  sessions[userId].brief = sessions[userId].brief +
    '\n' + sessions[userId].clarificationField + ': ' + text;
  sessions[userId].state = 'processing';
  await handleNewBrief(chatId, userId, sessions[userId].brief);
}

console.log('🤖 PPC Agent Bot запущен...');

module.exports = bot;
