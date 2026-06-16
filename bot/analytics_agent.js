const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Ти — старший PPC-аналітик для мережі фітнес-клубів Apollo Next (Україна).
Твоя задача — аналізувати дані Meta Ads і давати конкретні, практичні висновки.

Завжди відповідай ТІЛЬКИ по структурі, без зайвих слів:

## АНАЛІЗ
[2-4 речення: що відбулось, чому змінились ключові метрики, які тренди помітні]

## РЕКОМЕНДАЦІЇ
[3-5 конкретних дій з числами. Формат: "Збільш бюджет кампанії X на 20%" а не "розглянь можливість..."]

## ЗОНИ РОСТУ
[2-3 конкретні можливості: де є потенціал масштабування, які аудиторії/кампанії недоінвестовані]

Правила:
- Якщо CTR < 1% — проблема з креативами або аудиторією
- Якщо CPC зріс > 30% — аукціон перегрівся або частота висока
- Якщо частота > 3 — аудиторія втомлена, потрібна ротація
- Якщо є конверсійна кампанія — фокус на CPA
- Валюта в відповіді завжди USD ($)
- Числа заокруглюй до 2 знаків`;

// Підготувати дані для LLM — компактний JSON без сирих API даних
function prepareDataForLLM(report) {
  const { periods, days, total, campaigns, topAdsets } = report;

  const fmt = (v, decimals = 2) => typeof v === 'number' ? +v.toFixed(decimals) : 0;
  const pct = (cur, prev) => prev > 0 ? +(((cur - prev) / prev) * 100).toFixed(1) : 0;

  const summaryMetrics = (cur, prev) => ({
    spend:     { cur: fmt(cur.spend),       prev: fmt(prev.spend),       delta_pct: pct(cur.spend, prev.spend) },
    impressions:{ cur: fmt(cur.impressions,0), prev: fmt(prev.impressions,0), delta_pct: pct(cur.impressions, prev.impressions) },
    reach:     { cur: fmt(cur.reach,0),     prev: fmt(prev.reach,0),     delta_pct: pct(cur.reach, prev.reach) },
    clicks:    { cur: fmt(cur.clicks,0),    prev: fmt(prev.clicks,0),    delta_pct: pct(cur.clicks, prev.clicks) },
    ctr:       { cur: fmt(cur.ctr),         prev: fmt(prev.ctr),         delta_pct: pct(cur.ctr, prev.ctr) },
    cpc:       { cur: fmt(cur.cpc),         prev: fmt(prev.cpc),         delta_pct: pct(cur.cpc, prev.cpc) },
    cpm:       { cur: fmt(cur.cpm),         prev: fmt(prev.cpm),         delta_pct: pct(cur.cpm, prev.cpm) },
    frequency: { cur: fmt(cur.frequency),   prev: fmt(prev.frequency),   delta_pct: pct(cur.frequency, prev.frequency) },
    ...(cur.purchases > 0 || prev.purchases > 0 ? {
      purchases:        { cur: fmt(cur.purchases,0),       prev: fmt(prev.purchases,0),       delta_pct: pct(cur.purchases, prev.purchases) },
      cost_per_purchase:{ cur: fmt(cur.cost_per_purchase), prev: fmt(prev.cost_per_purchase), delta_pct: pct(cur.cost_per_purchase, prev.cost_per_purchase) }
    } : {})
  });

  return {
    period_days: days,
    current_period:  periods.current,
    previous_period: periods.previous,
    total: summaryMetrics(total.current, total.previous),
    campaigns: campaigns.map(c => ({
      name: c.name,
      metrics: summaryMetrics(c.current, c.previous)
    })),
    top_adsets_by_spend: topAdsets.slice(0, 5).map(a => ({
      name: a.adset_name,
      campaign: a.campaign_name,
      spend: fmt(parseFloat(a.spend || 0)),
      ctr: fmt(parseFloat(a.ctr || 0)),
      cpc: fmt(parseFloat(a.cpc || 0)),
      frequency: fmt(parseFloat(a.frequency || 0))
    }))
  };
}

// Запит до Claude — аналіз + рекомендації + зони росту
async function analyzeMetrics(report) {
  const data = prepareDataForLLM(report);

  const userMessage = `Проаналізуй дані Meta Ads за ${data.period_days} днів.

ПОТОЧНИЙ PERIOD (${data.current_period.since} – ${data.current_period.until}):
\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

Дай аналіз, рекомендації і зони росту.`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }]
  });

  return response.content[0].text;
}

module.exports = { analyzeMetrics };
