const { apiGet } = require('./meta_api');
require('dotenv').config();

const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;

function toDateStr(d) {
  return (d instanceof Date ? d : new Date(d)).toISOString().split('T')[0];
}

// Отримати спенд за сьогодні по кампаніях
async function getTodaySpend() {
  const today = toDateStr(new Date());
  const result = await apiGet(`${AD_ACCOUNT_ID}/insights`, {
    fields: 'campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type',
    time_range: JSON.stringify({ since: today, until: today }),
    level: 'campaign',
    limit: 100
  });
  if (result.error) throw new Error(result.error.message);
  return result.data || [];
}

// Отримати бюджети активних кампаній (через adsets)
async function getActiveBudgets() {
  const result = await apiGet(`${AD_ACCOUNT_ID}/adsets`, {
    fields: 'campaign_id,campaign_name,daily_budget,lifetime_budget,status',
    filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]),
    limit: 200
  });
  if (result.error) return {};

  // Агрегуємо daily_budget по campaign_id
  const budgets = {};
  for (const adset of (result.data || [])) {
    const cid = adset.campaign_id;
    const budget = parseInt(adset.daily_budget || 0) / 100; // cents → USD
    if (!budgets[cid]) budgets[cid] = { name: adset.campaign_name, daily_usd: 0 };
    budgets[cid].daily_usd += budget;
  }
  return budgets;
}

// Перевірити аномалії і повернути масив алертів
async function checkAlerts() {
  const alerts = [];
  const now = new Date();
  const hourOfDay = now.getHours(); // 0-23

  try {
    const [todayRows, budgets] = await Promise.all([getTodaySpend(), getActiveBudgets()]);

    for (const row of todayRows) {
      const cid = row.campaign_id;
      const name = row.campaign_name;
      const spend = parseFloat(row.spend || 0);
      const ctr = parseFloat(row.ctr || 0);
      const budget = budgets[cid]?.daily_usd || 0;

      if (spend === 0) continue;

      // 1. Перевитрата: витрачено > 90% бюджету до 18:00
      if (budget > 0 && hourOfDay < 18) {
        const pct = (spend / budget) * 100;
        if (pct > 90) {
          alerts.push({
            type: 'overspend',
            level: pct > 100 ? 'critical' : 'warning',
            campaign: name,
            message: `💸 Перевитрата: ${pct.toFixed(0)}% бюджету витрачено о ${hourOfDay}:00\n   Витрачено $${spend.toFixed(2)} з $${budget.toFixed(2)}/день`
          });
        }
      }

      // 2. Критично низький CTR при значному спенді (> $10)
      // 0.05% — поріг: reach-кампанії норма 0.08-0.15%, нижче — проблема
      if (spend > 10 && ctr < 0.05) {
        alerts.push({
          type: 'low_ctr',
          level: 'warning',
          campaign: name,
          message: `📉 Критично низький CTR: ${ctr.toFixed(2)}% при витратах $${spend.toFixed(2)}\n   Можлива проблема з аудиторією або плейсментом`
        });
      }

      // 3. Висока CPA: перевіряємо покупки
      const purchases = (row.actions || []).find(a =>
        a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase'
      );
      const cpa_arr = (row.cost_per_action_type || []).find(a =>
        a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase'
      );
      if (cpa_arr) {
        const cpa = parseFloat(cpa_arr.value);
        if (cpa > 200) {
          alerts.push({
            type: 'high_cpa',
            level: 'warning',
            campaign: name,
            message: `🚨 Висока CPA: $${cpa.toFixed(2)} за покупку\n   Перевір конверсійну аудиторію або оффер`
          });
        }
      }
    }

    // 4. Загальний спенд за сьогодні
    const totalSpend = todayRows.reduce((s, r) => s + parseFloat(r.spend || 0), 0);
    const totalBudget = Object.values(budgets).reduce((s, b) => s + b.daily_usd, 0);
    if (totalBudget > 0 && totalSpend > totalBudget * 1.1) {
      alerts.unshift({
        type: 'total_overspend',
        level: 'critical',
        campaign: 'Всі кампанії',
        message: `🔴 КРИТИЧНО: Загальний спенд $${totalSpend.toFixed(2)} перевищує сумарний бюджет $${totalBudget.toFixed(2)}`
      });
    }

  } catch (err) {
    console.error('checkAlerts error:', err.message);
  }

  return alerts;
}

// Форматувати алерти для Telegram
function formatAlerts(alerts) {
  if (alerts.length === 0) return null;

  const critical = alerts.filter(a => a.level === 'critical');
  const warnings  = alerts.filter(a => a.level === 'warning');

  let txt = critical.length > 0 ? `🔴 <b>КРИТИЧНІ АЛЕРТИ (${critical.length})</b>\n\n` : `⚠️ <b>Алерти (${alerts.length})</b>\n\n`;

  for (const a of [...critical, ...warnings]) {
    txt += a.message + '\n\n';
  }

  txt += `<i>${new Date().toLocaleTimeString('uk', { hour: '2-digit', minute: '2-digit' })}</i>`;
  return txt;
}

// Отримати зведення спенду за сьогодні (для дайджесту)
async function getTodaySummary() {
  const rows = await getTodaySpend();
  const total = rows.reduce((s, r) => s + parseFloat(r.spend || 0), 0);
  const activeCount = rows.filter(r => parseFloat(r.spend || 0) > 0).length;
  const topCampaign = rows.sort((a, b) => parseFloat(b.spend) - parseFloat(a.spend))[0];
  return {
    total_spend: total,
    active_campaigns: activeCount,
    top_campaign: topCampaign ? { name: topCampaign.campaign_name, spend: parseFloat(topCampaign.spend) } : null,
    rows
  };
}

module.exports = { checkAlerts, formatAlerts, getTodaySummary };
