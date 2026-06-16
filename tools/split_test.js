const { apiGet } = require('./meta_api');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function toDateStr(d) {
  return (d instanceof Date ? d : new Date(d)).toISOString().split('T')[0];
}

// Знайти кампанії/адсети за частковим іменем
async function findEntitiesByName(query, level = 'adset') {
  const endpoint = level === 'campaign'
    ? `${AD_ACCOUNT_ID}/campaigns`
    : `${AD_ACCOUNT_ID}/adsets`;

  const fields = level === 'campaign'
    ? 'id,name,status,objective'
    : 'id,name,status,campaign_id,campaign_name,daily_budget,optimization_goal';

  const result = await apiGet(endpoint, { fields, limit: 200 });
  if (result.error) throw new Error(result.error.message);

  const q = query.toLowerCase();
  return (result.data || []).filter(e => e.name.toLowerCase().includes(q));
}

// Отримати insights для конкретного entity за N днів
async function getEntityInsights(entityId, days = 7, level = 'adset') {
  const until = new Date(); until.setDate(until.getDate() - 1);
  const since = new Date(until); since.setDate(since.getDate() - (days - 1));

  const fields = [
    'adset_name', 'campaign_name',
    'spend', 'impressions', 'reach', 'clicks',
    'ctr', 'cpc', 'cpm', 'frequency',
    'actions', 'cost_per_action_type'
  ].join(',');

  const endpoint = level === 'ad' ? `${entityId}/insights` : `${entityId}/insights`;
  const result = await apiGet(endpoint, {
    fields,
    time_range: JSON.stringify({ since: toDateStr(since), until: toDateStr(until) }),
    level: level === 'campaign' ? 'adset' : level,
    limit: 100
  });
  if (result.error) throw new Error(result.error.message);
  return result.data || [];
}

// Агрегувати insights в одну метрику
function aggregateInsights(rows) {
  const spend       = rows.reduce((s, r) => s + parseFloat(r.spend || 0), 0);
  const impressions = rows.reduce((s, r) => s + parseInt(r.impressions || 0), 0);
  const reach       = rows.reduce((s, r) => s + parseInt(r.reach || 0), 0);
  const clicks      = rows.reduce((s, r) => s + parseInt(r.clicks || 0), 0);

  const purchases = rows.reduce((s, r) => {
    const a = (r.actions || []).find(a => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase');
    return s + (a ? parseFloat(a.value) : 0);
  }, 0);

  return {
    spend:      +spend.toFixed(2),
    impressions,
    reach,
    clicks,
    purchases:  Math.round(purchases),
    ctr:        impressions > 0 ? +((clicks / impressions) * 100).toFixed(3) : 0,
    cpc:        clicks > 0      ? +(spend / clicks).toFixed(3) : 0,
    cpm:        impressions > 0 ? +((spend / impressions) * 1000).toFixed(3) : 0,
    frequency:  rows.length > 0 ? +(rows.reduce((s, r) => s + parseFloat(r.frequency || 0), 0) / rows.length).toFixed(2) : 0,
    cpa:        purchases > 0   ? +(spend / purchases).toFixed(2) : null
  };
}

// Визначити переможця по ключових метриках
function determineWinner(nameA, metricsA, nameB, metricsB) {
  const scores = { A: 0, B: 0 };
  const comparisons = [];

  const compare = (label, valA, valB, higherIsBetter) => {
    if (valA === 0 && valB === 0) return;
    const winner = higherIsBetter ? (valA > valB ? 'A' : 'B') : (valA < valB ? 'A' : 'B');
    const diff = valB > 0 ? Math.abs(((valA - valB) / valB) * 100) : 100;
    if (diff > 5) { // Ігноруємо різницю < 5%
      scores[winner]++;
      comparisons.push({ label, A: valA, B: valB, winner, diff_pct: +diff.toFixed(1) });
    }
  };

  // Ключові метрики (вагові за важливістю)
  if (metricsA.cpa !== null && metricsB.cpa !== null) {
    compare('CPA', metricsA.cpa, metricsB.cpa, false);
    scores[metricsA.cpa < metricsB.cpa ? 'A' : 'B']++; // подвійна вага для CPA
  }
  compare('CTR',       metricsA.ctr,       metricsB.ctr,       true);
  compare('CPC',       metricsA.cpc,       metricsB.cpc,       false);
  compare('CPM',       metricsA.cpm,       metricsB.cpm,       false);
  compare('Частота',   metricsA.frequency, metricsB.frequency, false);
  compare('Охоплення', metricsA.reach,     metricsB.reach,     true);

  const winner = scores.A > scores.B ? 'A' : scores.B > scores.A ? 'B' : null;
  const confidence = winner
    ? Math.min(95, 50 + (Math.abs(scores.A - scores.B) / (scores.A + scores.B)) * 60)
    : 50;

  // Перевірка достатнього обсягу (мінімум 500 імпресій на варіант)
  const hasEnoughData = metricsA.impressions >= 500 && metricsB.impressions >= 500;

  return { winner, winnerName: winner === 'A' ? nameA : winner === 'B' ? nameB : null, scores, confidence: +confidence.toFixed(0), comparisons, hasEnoughData };
}

// Сформувати текстовий звіт сплітесту
function formatSplitTestReport(nameA, metricsA, nameB, metricsB, result, days) {
  const { winner, winnerName, confidence, comparisons, hasEnoughData } = result;

  const fmt = (v, prefix = '') => v != null ? `${prefix}${typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(2) : v}` : '—';
  const row = (label, a, b, prefix = '') =>
    `${label}: <b>${fmt(a, prefix)}</b> vs <b>${fmt(b, prefix)}</b>`;

  let txt = `🧪 <b>Сплітест — ${days} днів</b>\n\n`;
  txt += `<b>A:</b> ${nameA}\n`;
  txt += `<b>B:</b> ${nameB}\n\n`;

  txt += `<b>━━ ПОРІВНЯННЯ ━━</b>\n`;
  txt += `${row('💰 Витрати',  metricsA.spend,      metricsB.spend,      '$')}\n`;
  txt += `${row('👁 Покази',   metricsA.impressions, metricsB.impressions)}\n`;
  txt += `${row('📈 CTR',      metricsA.ctr,         metricsB.ctr,        '')}%\n`;
  txt += `${row('💲 CPC',      metricsA.cpc,         metricsB.cpc,        '$')}\n`;
  txt += `${row('📡 CPM',      metricsA.cpm,         metricsB.cpm,        '$')}\n`;
  txt += `${row('🔁 Частота',  metricsA.frequency,   metricsB.frequency)}\n`;
  if (metricsA.cpa !== null || metricsB.cpa !== null) {
    txt += `${row('🛒 Покупки', metricsA.purchases, metricsB.purchases)}\n`;
    txt += `${row('💸 CPA',    metricsA.cpa,       metricsB.cpa, '$')}\n`;
  }

  txt += `\n<b>━━ РЕЗУЛЬТАТ ━━</b>\n`;
  if (!hasEnoughData) {
    txt += `⏳ <b>Недостатньо даних</b> для висновку\n`;
    txt += `<i>Потрібно мінімум 500 показів на варіант</i>\n`;
  } else if (!winner) {
    txt += `🤝 <b>Нічия</b> — варіанти рівносильні\n`;
  } else {
    txt += `🏆 <b>Переможець: ${winner} (${winnerName})</b>\n`;
    txt += `Впевненість: ${confidence}%\n`;
    txt += `\nПеревага по метриках:\n`;
    comparisons.filter(c => c.winner === winner).forEach(c => {
      txt += `  ✅ ${c.label}: краще на ${c.diff_pct}%\n`;
    });
  }

  return txt;
}

// LLM-рекомендація по результату сплітесту
async function getSplitTestRecommendation(nameA, metricsA, nameB, metricsB, result, days) {
  const { winner, winnerName, confidence, hasEnoughData } = result;

  if (!hasEnoughData) return null;

  const prompt = `Сплітест Meta Ads (${days} днів):

Варіант A "${nameA}": spend=$${metricsA.spend}, CTR=${metricsA.ctr}%, CPC=$${metricsA.cpc}, CPM=$${metricsA.cpm}, freq=${metricsA.frequency}, покупки=${metricsA.purchases || 0}${metricsA.cpa ? ', CPA=$'+metricsA.cpa : ''}
Варіант B "${nameB}": spend=$${metricsB.spend}, CTR=${metricsB.ctr}%, CPC=$${metricsB.cpc}, CPM=$${metricsB.cpm}, freq=${metricsB.frequency}, покупки=${metricsB.purchases || 0}${metricsB.cpa ? ', CPA=$'+metricsB.cpa : ''}

${winner ? `Переможець: ${winner} (${winnerName}), впевненість ${confidence}%` : 'Рівні результати'}

Дай ТІЛЬКИ 2-3 конкретних речення:
1. Що робити з переможцем (масштаб/бюджет)
2. Що робити з програшним варіантом
3. Що тестувати наступним (гіпотеза)`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }]
  });
  return response.content[0].text;
}

// Головна функція — порівняти два пошукових запити (назви адсетів/кампаній)
async function runSplitTest(queryA, queryB, days = 7, level = 'adset') {
  // Знайти entities
  const [entitiesA, entitiesB] = await Promise.all([
    findEntitiesByName(queryA, level),
    findEntitiesByName(queryB, level)
  ]);

  if (entitiesA.length === 0) throw new Error(`Не знайдено "${queryA}"`);
  if (entitiesB.length === 0) throw new Error(`Не знайдено "${queryB}"`);

  // Беремо перший збіг або агрегуємо всі
  const idA = entitiesA[0].id;
  const idB = entitiesB[0].id;
  const nameA = entitiesA[0].name;
  const nameB = entitiesB[0].name;

  // Тягнемо insights
  const [rowsA, rowsB] = await Promise.all([
    getEntityInsights(idA, days, level),
    getEntityInsights(idB, days, level)
  ]);

  const metricsA = aggregateInsights(rowsA);
  const metricsB = aggregateInsights(rowsB);
  const result   = determineWinner(nameA, metricsA, nameB, metricsB);

  const report         = formatSplitTestReport(nameA, metricsA, nameB, metricsB, result, days);
  const recommendation = await getSplitTestRecommendation(nameA, metricsA, nameB, metricsB, result, days);

  return { report, recommendation, winner: result.winnerName, nameA, nameB, metricsA, metricsB };
}

module.exports = { runSplitTest, findEntitiesByName };
