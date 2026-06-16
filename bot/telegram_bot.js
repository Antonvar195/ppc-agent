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
    '<b>Запуск:</b>\n' +
    'Просто напиши ТЗ — запущу кампанию\n\n' +
    '<b>Аналитика:</b>\n' +
    '/report — за 7 дней\n' +
    '/report14 — за 14 дней\n' +
    '/report30 — за 30 дней\n' +
    '/digest — дайджест прямо сейчас\n\n' +
    '<b>Сплит-тест:</b>\n' +
    '/compare — сравнить два варианта\n\n' +
    '<b>Алерты:</b>\n' +
    '/alerts — проверить сейчас\n\n' +
    '/help — примеры ТЗ',
    { parse_mode: 'HTML' }
  );
});

// ─── АНАЛІТИКА ────────────────────────────────────────────────────────────────

async function handleReport(chatId, days) {
  await bot.sendMessage(chatId, `⏳ Збираю дані за ${days} днів...`);
  try {
    const { getAnalyticsReport, formatReportText } = require('../tools/analytics');
    const { analyzeMetrics } = require('./analytics_agent');

    const report = await getAnalyticsReport(days);

    // Перевірка: чи є взагалі дані
    if (report.total.current.impressions === 0 && report.total.previous.impressions === 0) {
      await bot.sendMessage(chatId, '📭 Немає даних за цей period. Можливо, кампанії не витрачали бюджет.');
      return;
    }

    // 1. Числовий звіт
    const reportText = formatReportText(report);
    await bot.sendMessage(chatId, reportText, { parse_mode: 'HTML' });

    // 2. LLM аналіз
    await bot.sendMessage(chatId, '🤖 Аналізую...');
    const analysis = await analyzeMetrics(report);
    await bot.sendMessage(chatId, analysis, { parse_mode: 'Markdown' });

  } catch (err) {
    console.error('handleReport error:', err);
    await bot.sendMessage(chatId, '❌ Помилка отримання аналітики: ' + err.message);
  }
}

bot.onText(/\/report$/, (msg) => {
  if (!isAllowed(msg.from.id)) return;
  handleReport(msg.chat.id, 7);
});

bot.onText(/\/report14/, (msg) => {
  if (!isAllowed(msg.from.id)) return;
  handleReport(msg.chat.id, 14);
});

bot.onText(/\/report30/, (msg) => {
  if (!isAllowed(msg.from.id)) return;
  handleReport(msg.chat.id, 30);
});

// Діагностика Dropbox
bot.onText(/\/dbtest/, (msg) => {
  console.log('🔍 /dbtest received from', msg.from.id);
  if (!isAllowed(msg.from.id)) {
    console.log('🔍 /dbtest blocked — not allowed user');
    return;
  }
  const chatId = msg.chat.id;

  const appKey = process.env.DROPBOX_APP_KEY;
  const appSecret = process.env.DROPBOX_APP_SECRET;
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;
  const currentToken = process.env.DROPBOX_ACCESS_TOKEN;

  const report =
    '🔍 Dropbox env vars:\n' +
    `APP_KEY: ${appKey ? '✅ ' + appKey.substring(0, 5) + '...' : '❌ ВІДСУТНІЙ'}\n` +
    `APP_SECRET: ${appSecret ? '✅ ' + appSecret.substring(0, 5) + '...' : '❌ ВІДСУТНІЙ'}\n` +
    `REFRESH_TOKEN: ${refreshToken ? '✅ ' + refreshToken.substring(0, 10) + '...' : '❌ ВІДСУТНІЙ'}\n` +
    `ACCESS_TOKEN: ${currentToken ? '✅ ' + currentToken.substring(0, 15) + '...' : '❌ ВІДСУТНІЙ'}`;

  bot.sendMessage(chatId, report).then(() => {
    if (!refreshToken || !appKey || !appSecret) {
      return bot.sendMessage(chatId, '❌ Vars відсутні на Railway');
    }
    bot.sendMessage(chatId, '🔄 Тестую refresh...').then(() => {
      const { refreshDropboxToken } = require('../tools/dropbox_reader');
      refreshDropboxToken().then(ok => {
        const newToken = process.env.DROPBOX_ACCESS_TOKEN || '';
        if (ok) {
          bot.sendMessage(chatId, '✅ Refresh OK!\nНовий токен: ' + newToken.substring(0, 20) + '...');
        } else {
          bot.sendMessage(chatId, '❌ Refresh = false\nВари є але refresh не вийшов. Перевір точні значення.');
        }
      }).catch(e => bot.sendMessage(chatId, '❌ Refresh error: ' + e.message));
    });
  }).catch(e => console.log('dbtest sendMessage error:', e.message));
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
    '• Бюджет на группу ($USD/день)\n' +
    '• Разбивку групп (возраст/wide/interest)\n' +
    '• Ссылка на папку Dropbox с креативами\n\n' +
    'Пример:\n' +
    'reach кампания на все города\n' +
    '3 группы: 18-35, 35-55, wide\n' +
    'бюджет $20/день на группу\n' +
    'старт 10.06, конец 30.06\n' +
    'текст: Твоє місце для тренувань\n' +
    'заголовок: Apollo Next\n' +
    'креативы: https://www.dropbox.com/sh/...'
  );
});

// Основной обработчик сообщений
// compareSession оголошується тут, щоб /compare мав доступ нижче
const compareSession = {};

bot.on('message', async (msg) => {
  if (!isAllowed(msg.from.id)) return;
  if (msg.text && msg.text.startsWith('/')) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  // ─ Сплітест-діалог ─────────────────────────────────────
  const cs = compareSession[userId];
  if (cs) {
    if (cs.step === 'variantA') {
      cs.queryA = text.trim();
      cs.step = 'variantB';
      await bot.sendMessage(chatId,
        `✅ Варіант A: <b>${cs.queryA}</b>\n\nТепер назва <b>варіанта B</b>:`,
        { parse_mode: 'HTML' }
      );
      return;
    }
    if (cs.step === 'variantB') {
      cs.queryB = text.trim();
      cs.step = 'days';
      await bot.sendMessage(chatId,
        `✅ Варіант B: <b>${cs.queryB}</b>\n\nЗа скільки днів? (7 / 14 / 30)`,
        { parse_mode: 'HTML' }
      );
      return;
    }
    if (cs.step === 'days') {
      const days = parseInt(text) || 7;
      const { queryA, queryB } = cs;
      delete compareSession[userId];
      await bot.sendMessage(chatId, `⏳ Порівнюю "${queryA}" vs "${queryB}" за ${days} днів...`);
      try {
        const { runSplitTest } = require('../tools/split_test');
        const result = await runSplitTest(queryA, queryB, days);
        await bot.sendMessage(chatId, result.report, { parse_mode: 'HTML' });
        if (result.recommendation) {
          await bot.sendMessage(chatId, `💡 <b>Рекомендація:</b>\n${result.recommendation}`, { parse_mode: 'HTML' });
        }
      } catch (e) {
        await bot.sendMessage(chatId, '❌ Помилка: ' + e.message);
      }
      return;
    }
  }

  // ─ Основний флоу ───────────────────────────────────────
  if (sessions[userId] && sessions[userId].state === 'awaiting_approval') {
    await handleApproval(chatId, userId, text);
    return;
  }
  if (sessions[userId] && sessions[userId].state === 'awaiting_clarification') {
    await handleClarification(chatId, userId, text);
    return;
  }
  if (sessions[userId] && sessions[userId].state === 'awaiting_error_fix') {
    await handleErrorFix(chatId, userId, text);
    return;
  }

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

      // Завжди показуємо сирі помилки якщо є
      if (result.errors && result.errors.length > 0) {
        report += `\n\n⚠️ Помилки (${result.errors.length}):\n`;
        result.errors.forEach(e => { report += `• ${e}\n`; });
      }

      report += '\n🔗 <a href="https://business.facebook.com/adsmanager">Открыть Ads Manager</a>';

      await bot.sendMessage(chatId, report, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });

      // Якщо є провалені групи — запускаємо аналіз
      if (result.failed_adsets && result.failed_adsets.length > 0) {
        await bot.sendMessage(chatId, '🔍 Аналізую помилки...');
        try {
          const { analyzeErrors } = require('./orchestrator');
          const analysis = await analyzeErrors(result.failed_adsets, result.campaign_objective);

          if (!analysis || !analysis.fixed_adsets) {
            throw new Error('AI не повернув виправлені параметри');
          }

          sessions[userId] = {
            state: 'awaiting_error_fix',
            campaignId: result.campaign_id,
            pageId: result.page_id,
            failedAdsets: result.failed_adsets,
            fixedAdsets: analysis.fixed_adsets
          };

          // Не використовуємо HTML — може містити спецсимволи
          const errorMsg =
            `⚠️ Не вдалося створити ${result.failed_adsets.length} груп(и)\n\n` +
            `Причина: ${analysis.explanation}\n\n` +
            `💡 Пропоную: ${analysis.proposed_fix}\n\n` +
            'Відповідай:\n✅ так — застосувати і повторити\n❌ ні — скасувати\n💬 або напиши своє рішення';

          await bot.sendMessage(chatId, errorMsg);
        } catch (e) {
          console.log('analyzeErrors error:', e.message);
          await bot.sendMessage(chatId,
            `⚠️ Не вдалося автоматично проаналізувати помилку: ${e.message}\n\nСирі помилки:\n${(result.errors || []).join('\n')}`
          );
          delete sessions[userId];
        }
        return;
      }

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

// Обробка рішення по помилках
async function handleErrorFix(chatId, userId, text) {
  const session = sessions[userId];
  const normalized = text.toLowerCase().trim();

  if (normalized === 'ні' || normalized === 'нет' || normalized === 'no') {
    await bot.sendMessage(chatId, '❌ Виправлення скасовано. Групи залишились незапущеними.');
    delete sessions[userId];
    return;
  }

  let fixedAdsets = session.fixedAdsets;

  // Якщо не "так" — передаємо користувацьке рішення в AI для інтерпретації
  if (!['так', 'да', 'yes', 'ок', 'ok'].includes(normalized)) {
    await bot.sendMessage(chatId, '🔄 Застосовую твоє рішення...');
    try {
      const { analyzeErrors } = require('./orchestrator');
      // Передаємо кастомне рішення як додатковий контекст
      const reanalysis = await analyzeErrors(
        session.failedAdsets.map(f => ({
          ...f,
          error: f.error + ` | Користувач пропонує: ${text}`
        })),
        null
      );
      fixedAdsets = reanalysis.fixed_adsets;

      let confirmMsg = `<b>💡 Переглянута пропозиція:</b> ${reanalysis.proposed_fix}\n\n`;
      confirmMsg += 'Застосувати? (так / ні)';
      sessions[userId].fixedAdsets = fixedAdsets;
      sessions[userId].state = 'awaiting_error_fix';
      await bot.sendMessage(chatId, confirmMsg, { parse_mode: 'HTML' });
      return;
    } catch (e) {
      await bot.sendMessage(chatId, '❌ Не вдалося обробити твоє рішення: ' + e.message);
      delete sessions[userId];
      return;
    }
  }

  await bot.sendMessage(chatId, '🚀 Повторно запускаю групи з виправленнями...');
  try {
    const { retryWithFix } = require('./orchestrator');
    const retryResult = await retryWithFix(session.campaignId, fixedAdsets, session.pageId);

    let retryReport = `✅ <b>Retry завершено</b>\n\n`;
    retryReport += `👥 Груп створено: ${retryResult.adsets.length}\n`;
    retryReport += `📄 Об'явлень: ${retryResult.ads.length}\n`;

    if (retryResult.adsets.length > 0) {
      retryReport += '\n<b>Нові групи:</b>\n';
      retryResult.adsets.forEach(a => {
        retryReport += `  ${a.name} — <code>${a.id}</code>\n`;
      });
    }

    if (retryResult.errors.length > 0) {
      retryReport += `\n⚠️ Ще є помилки (${retryResult.errors.length}):\n`;
      retryResult.errors.forEach(e => { retryReport += `• ${e}\n`; });
    } else {
      retryReport += '\n✅ Всі групи запущені успішно';
    }

    await bot.sendMessage(chatId, retryReport, { parse_mode: 'HTML' });
  } catch (err) {
    await bot.sendMessage(chatId, '❌ Помилка при повторному запуску: ' + err.message);
  }

  delete sessions[userId];
}

// Обработка уточнений
async function handleClarification(chatId, userId, text) {
  sessions[userId].brief = sessions[userId].brief +
    '\n' + sessions[userId].clarificationField + ': ' + text;
  sessions[userId].state = 'processing';
  await handleNewBrief(chatId, userId, sessions[userId].brief);
}

// ─── АЛЕРТИ ──────────────────────────────────────────────────────────────────

bot.onText(/\/alerts/, async (msg) => {
  if (!isAllowed(msg.from.id)) return;
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, '🔍 Перевіряю аномалії...');
  try {
    const { checkAlerts, formatAlerts } = require('../tools/alerts');
    const alerts = await checkAlerts();
    if (alerts.length === 0) {
      await bot.sendMessage(chatId, '✅ Аномалій не знайдено. Всі кампанії в нормі.');
    } else {
      await bot.sendMessage(chatId, formatAlerts(alerts), { parse_mode: 'HTML' });
    }
  } catch (e) {
    await bot.sendMessage(chatId, '❌ Помилка: ' + e.message);
  }
});

// ─── ДАЙДЖЕСТ ─────────────────────────────────────────────────────────────────

bot.onText(/\/digest/, async (msg) => {
  if (!isAllowed(msg.from.id)) return;
  const { triggerDigest } = require('../tools/scheduler');
  await triggerDigest();
});

// ─── СПЛІТЕСТ ────────────────────────────────────────────────────────────────

bot.onText(/\/compare/, async (msg) => {
  if (!isAllowed(msg.from.id)) return;
  const chatId = msg.chat.id;
  compareSession[msg.from.id] = { step: 'variantA' };
  await bot.sendMessage(chatId,
    '🧪 <b>Сплітест</b>\n\n' +
    'Напиши частину назви <b>варіанта A</b>\n' +
    '<i>(наприклад: "reach_Kyiv" або "IF_039")</i>',
    { parse_mode: 'HTML' }
  );
});

console.log('🤖 PPC Agent Bot запущен...');

module.exports = bot;
