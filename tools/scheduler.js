const { checkAlerts, formatAlerts, getTodaySummary } = require('./alerts');
const { getAnalyticsReport, formatReportText } = require('./analytics');
const { analyzeMetrics } = require('../bot/analytics_agent');
require('dotenv').config();

let botSendFn = null;
let chatId    = null;

// Ініціалізація: передаємо функцію відправки і chat ID
function init(sendFn, targetChatId) {
  botSendFn = sendFn;
  chatId    = targetChatId;
}

async function safeSend(text, options = {}) {
  if (!botSendFn || !chatId) return;
  try {
    await botSendFn(chatId, text, options);
  } catch (e) {
    console.error('scheduler safeSend error:', e.message);
  }
}

// ─── АЛЕРТИ ────────────────────────────────────────────────────────────────

async function runAlertCheck() {
  try {
    const alerts = await checkAlerts();
    if (alerts.length > 0) {
      const text = formatAlerts(alerts);
      if (text) await safeSend(text, { parse_mode: 'HTML' });
    }
  } catch (e) {
    console.error('runAlertCheck error:', e.message);
  }
}

// ─── ЩОДЕННИЙ ДАЙДЖЕСТ ──────────────────────────────────────────────────────

async function runDailyDigest() {
  try {
    await safeSend('📋 <b>Щоденний дайджест</b>\nГотую звіт...', { parse_mode: 'HTML' });

    // Вчора + позавчора (1 день vs попередній день)
    const report = await getAnalyticsReport(1);
    const { total: { current: cur, previous: prev } } = report;

    const arrow = (cur, prev) => cur > prev * 1.05 ? '▲' : cur < prev * 0.95 ? '▼' : '→';
    const pct   = (cur, prev) => prev > 0 ? Math.round(((cur - prev) / prev) * 100) : 0;

    // Зведення за вчора
    let txt = `📋 <b>Дайджест: ${report.periods.current.since}</b>\n\n`;
    txt += `💰 Витрати: <b>$${cur.spend.toFixed(2)}</b> ${arrow(cur.spend, prev.spend)} ${pct(cur.spend, prev.spend) > 0 ? '+' : ''}${pct(cur.spend, prev.spend)}%\n`;
    txt += `📈 CTR: <b>${cur.ctr.toFixed(2)}%</b> ${arrow(cur.ctr, prev.ctr)}\n`;
    txt += `💲 CPC: <b>$${cur.cpc.toFixed(2)}</b> ${arrow(prev.cpc, cur.cpc)}\n`; // reversed: lower CPC is better
    if (cur.purchases > 0) {
      txt += `🛒 Покупки: <b>${cur.purchases}</b> ${arrow(cur.purchases, prev.purchases)}\n`;
      txt += `💸 CPA: <b>$${cur.cost_per_purchase.toFixed(2)}</b> ${arrow(prev.cost_per_purchase, cur.cost_per_purchase)}\n`;
    }

    // Топ кампанія вчора
    const today = await getTodaySummary();
    if (today.top_campaign) {
      txt += `\n🏆 Топ витрат: <b>${today.top_campaign.name.slice(0, 35)}</b>\n   $${today.top_campaign.spend.toFixed(2)} сьогодні\n`;
    }
    txt += `\n📡 Активних кампаній сьогодні: ${today.active_campaigns}`;

    await safeSend(txt, { parse_mode: 'HTML' });

    // LLM аналіз (7 днів для контексту)
    const weekReport = await getAnalyticsReport(7);
    if (weekReport.total.current.impressions > 0) {
      const analysis = await analyzeMetrics(weekReport);
      await safeSend(analysis, { parse_mode: 'Markdown' });
    }

  } catch (e) {
    console.error('runDailyDigest error:', e.message);
    await safeSend('❌ Помилка дайджесту: ' + e.message);
  }
}

// ─── ПЛАНУВАЛЬНИК ────────────────────────────────────────────────────────────

let alertInterval  = null;
let digestInterval = null;
let lastDigestDay  = -1;

function start() {
  if (alertInterval) return; // вже запущено

  // Алерти кожну годину
  alertInterval = setInterval(() => {
    runAlertCheck();

    // Дайджест о 9:00 (перший запуск після 9:00, раз на день)
    const now = new Date();
    const h   = now.getHours();
    const day = now.getDate();
    if (h >= 9 && h < 10 && day !== lastDigestDay) {
      lastDigestDay = day;
      runDailyDigest();
    }
  }, 60 * 60 * 1000);

  console.log('📅 Scheduler started: alerts every hour, digest at 9:00');
}

function stop() {
  if (alertInterval)  { clearInterval(alertInterval);  alertInterval  = null; }
  if (digestInterval) { clearInterval(digestInterval); digestInterval = null; }
}

// Ручний запуск дайджесту (для команди /digest в боті)
async function triggerDigest() {
  await runDailyDigest();
}

// Ручна перевірка алертів (для команди /alerts в боті)
async function triggerAlertCheck() {
  await runAlertCheck();
  return await checkAlerts();
}

module.exports = { init, start, stop, triggerDigest, triggerAlertCheck };
