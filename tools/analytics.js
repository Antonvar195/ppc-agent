const { apiGet } = require('./meta_api');
require('dotenv').config();

const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;

const INSIGHTS_FIELDS = [
  'campaign_id', 'campaign_name',
  'spend', 'impressions', 'reach', 'clicks',
  'ctr', 'cpc', 'cpm', 'frequency',
  'actions', 'cost_per_action_type'
].join(',');

const ADSET_FIELDS = [
  'campaign_id', 'campaign_name',
  'adset_id', 'adset_name',
  'spend', 'impressions', 'reach', 'clicks',
  'ctr', 'cpc', 'cpm', 'frequency',
  'actions', 'cost_per_action_type'
].join(',');

// YYYY-MM-DD від Date або рядка
function toDateStr(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().split('T')[0];
}

// Обчислити two periods: [since, until] для поточного і попереднього
function buildPeriods(days = 7) {
  const now = new Date();
  const curUntil = new Date(now); curUntil.setDate(curUntil.getDate() - 1);
  const curSince = new Date(curUntil); curSince.setDate(curSince.getDate() - (days - 1));
  const prevUntil = new Date(curSince); prevUntil.setDate(prevUntil.getDate() - 1);
  const prevSince = new Date(prevUntil); prevSince.setDate(prevSince.getDate() - (days - 1));
  return {
    current: { since: toDateStr(curSince), until: toDateStr(curUntil) },
    previous: { since: toDateStr(prevSince), until: toDateStr(prevUntil) }
  };
}

// Отримати insights за конкретний period і level
async function fetchInsights(period, level = 'campaign') {
  const fields = level === 'adset' ? ADSET_FIELDS : INSIGHTS_FIELDS;
  const params = {
    fields,
    time_range: JSON.stringify(period),
    level,
    limit: 100
  };

  const result = await apiGet(`${AD_ACCOUNT_ID}/insights`, params);
  if (result.error) throw new Error(`Meta insights error: ${result.error.message}`);
  return result.data || [];
}

// Витягти числове значення метрики
function metricVal(row, key) {
  const v = parseFloat(row[key] || 0);
  return isNaN(v) ? 0 : v;
}

// Знайти кількість конверсій (purchase) з actions
function getPurchases(row) {
  const actions = row.actions || [];
  const a = actions.find(a => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase');
  return a ? parseFloat(a.value) : 0;
}

function getCostPerPurchase(row) {
  const cpa = row.cost_per_action_type || [];
  const a = cpa.find(a => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase');
  return a ? parseFloat(a.value) : 0;
}

// Агрегувати масив рядків в один об'єкт
function aggregate(rows) {
  const total = {
    spend: 0, impressions: 0, reach: 0,
    clicks: 0, purchases: 0, cost_per_purchase: 0
  };
  for (const row of rows) {
    total.spend       += metricVal(row, 'spend');
    total.impressions += metricVal(row, 'impressions');
    total.reach       += metricVal(row, 'reach');
    total.clicks      += metricVal(row, 'clicks');
    total.purchases   += getPurchases(row);
  }
  total.ctr = total.impressions > 0 ? (total.clicks / total.impressions) * 100 : 0;
  total.cpc = total.clicks > 0 ? total.spend / total.clicks : 0;
  total.cpm = total.impressions > 0 ? (total.spend / total.impressions) * 1000 : 0;
  total.frequency = rows.length > 0 ? rows.reduce((s, r) => s + metricVal(r, 'frequency'), 0) / rows.length : 0;
  total.cost_per_purchase = total.purchases > 0 ? total.spend / total.purchases : 0;
  return total;
}

// Порівняти два значення → delta %
function delta(cur, prev) {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return ((cur - prev) / prev) * 100;
}

// Порівняти поточний і попередній periods по кампаніях
function compareCampaigns(currentRows, previousRows) {
  // Групуємо по campaign_id
  const group = (rows) => {
    const map = {};
    for (const row of rows) {
      const id = row.campaign_id;
      if (!map[id]) map[id] = { name: row.campaign_name, rows: [] };
      map[id].rows.push(row);
    }
    return map;
  };

  const curMap = group(currentRows);
  const prevMap = group(previousRows);
  const allIds = new Set([...Object.keys(curMap), ...Object.keys(prevMap)]);

  const campaigns = [];
  for (const id of allIds) {
    const cur  = aggregate(curMap[id]?.rows || []);
    const prev = aggregate(prevMap[id]?.rows || []);
    const name = curMap[id]?.name || prevMap[id]?.name || id;
    campaigns.push({ id, name, current: cur, previous: prev });
  }
  return campaigns;
}

// Головна функція — отримати повний звіт по двох periodах
async function getAnalyticsReport(days = 7) {
  const periods = buildPeriods(days);

  const [curCampaigns, prevCampaigns, curAdsets, prevAdsets] = await Promise.all([
    fetchInsights(periods.current,  'campaign'),
    fetchInsights(periods.previous, 'campaign'),
    fetchInsights(periods.current,  'adset'),
    fetchInsights(periods.previous, 'adset')
  ]);

  const campaigns = compareCampaigns(curCampaigns, prevCampaigns);

  // Топ адсети по витратах (поточний period)
  const adsetsBySpend = curAdsets
    .map(r => ({ ...r, _spend: metricVal(r, 'spend') }))
    .sort((a, b) => b._spend - a._spend)
    .slice(0, 10);

  // Агреговане загальне
  const totalCur  = aggregate(curCampaigns);
  const totalPrev = aggregate(prevCampaigns);

  return {
    periods,
    days,
    total: { current: totalCur, previous: totalPrev },
    campaigns,
    topAdsets: adsetsBySpend,
    rawCurrent:  curCampaigns,
    rawPrevious: prevCampaigns
  };
}

// Форматувати рядок метрики з трендом
function fmtMetric(cur, prev, format = 'num', higherIsBetter = true) {
  const d = delta(cur, prev);
  const arrow = d > 2 ? '▲' : d < -2 ? '▼' : '→';
  const sign  = d > 2 ? '+' : '';

  let curStr, prevStr;
  if (format === 'money') {
    curStr  = '$' + cur.toFixed(2);
    prevStr = '$' + prev.toFixed(2);
  } else if (format === 'pct') {
    curStr  = cur.toFixed(2) + '%';
    prevStr = prev.toFixed(2) + '%';
  } else if (format === 'int') {
    curStr  = Math.round(cur).toLocaleString('uk');
    prevStr = Math.round(prev).toLocaleString('uk');
  } else {
    curStr  = cur.toFixed(2);
    prevStr = prev.toFixed(2);
  }

  const trend = Math.abs(d) <= 2 ? '' : ` ${arrow} ${sign}${Math.round(d)}%`;
  return `${prevStr} → ${curStr}${trend}`;
}

// Форматувати звіт для Telegram (текстовий)
function formatReportText(report) {
  const { periods, days, total: { current: cur, previous: prev }, campaigns } = report;

  let txt = `📊 <b>Аналітика: ${periods.current.since} – ${periods.current.until}</b>\n`;
  txt += `<i>vs ${periods.previous.since} – ${periods.previous.until} (${days} днів)</i>\n\n`;

  txt += `<b>━━ ЗАГАЛЬНО ━━</b>\n`;
  txt += `💰 Витрати:    ${fmtMetric(cur.spend,       prev.spend,       'money', false)}\n`;
  txt += `👁 Покази:     ${fmtMetric(cur.impressions,  prev.impressions,  'int',  true)}\n`;
  txt += `👥 Охоплення:  ${fmtMetric(cur.reach,        prev.reach,        'int',  true)}\n`;
  txt += `🖱 Кліки:      ${fmtMetric(cur.clicks,       prev.clicks,       'int',  true)}\n`;
  txt += `📈 CTR:        ${fmtMetric(cur.ctr,          prev.ctr,          'pct',  true)}\n`;
  txt += `💲 CPC:        ${fmtMetric(cur.cpc,          prev.cpc,          'money', false)}\n`;
  txt += `📡 CPM:        ${fmtMetric(cur.cpm,          prev.cpm,          'money', false)}\n`;
  txt += `🔁 Частота:    ${fmtMetric(cur.frequency,    prev.frequency,    'num',  false)}\n`;
  if (cur.purchases > 0 || prev.purchases > 0) {
    txt += `🛒 Покупки:    ${fmtMetric(cur.purchases,    prev.purchases,    'int',  true)}\n`;
    txt += `💸 CPA:        ${fmtMetric(cur.cost_per_purchase, prev.cost_per_purchase, 'money', false)}\n`;
  }

  // Тільки активні в поточному period, відсортовані по spend
  const activeCampaigns = campaigns
    .filter(c => c.current.spend > 0)
    .sort((a, b) => b.current.spend - a.current.spend);

  const stoppedCount = campaigns.filter(c => c.current.spend === 0 && c.previous.spend > 0).length;
  const newCount     = campaigns.filter(c => c.current.spend > 0 && c.previous.spend === 0).length;

  if (activeCampaigns.length > 0) {
    txt += `\n<b>━━ ПО КАМПАНІЯХ (активні) ━━</b>\n`;
    for (const c of activeCampaigns) {
      const isNew = c.previous.spend === 0;
      const shortName = c.name.length > 35 ? c.name.slice(0, 33) + '…' : c.name;
      txt += `\n<b>${shortName}</b>${isNew ? ' 🆕' : ''}\n`;
      txt += `  💰 ${fmtMetric(c.current.spend,  c.previous.spend,  'money', false)}\n`;
      txt += `  📈 CTR ${fmtMetric(c.current.ctr,   c.previous.ctr,   'pct',  true)}`;
      txt += `  💲 CPC ${fmtMetric(c.current.cpc,   c.previous.cpc,   'money', false)}\n`;
      if (c.current.purchases > 0 || c.previous.purchases > 0) {
        txt += `  🛒 ${fmtMetric(c.current.purchases, c.previous.purchases, 'int', true)}  CPA ${fmtMetric(c.current.cost_per_purchase, c.previous.cost_per_purchase, 'money', false)}\n`;
      }
    }
    if (stoppedCount > 0) txt += `\n<i>⏹ Зупинено кампаній: ${stoppedCount}</i>\n`;
  }

  return txt;
}

module.exports = { getAnalyticsReport, formatReportText, buildPeriods, delta };
