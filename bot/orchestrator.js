const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const { createFullStructure } = require('../tools/create_campaign');

require('dotenv').config();

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Читаем файлы контекста
function readContext() {
  const rules = fs.readFileSync(
    path.join(__dirname, '../config/rules.md'), 'utf8'
  );
  const orchestrator = fs.readFileSync(
    path.join(__dirname, '../orchestrator.md'), 'utf8'
  );
  const validator = fs.readFileSync(
    path.join(__dirname, '../agents/validator.md'), 'utf8'
  );
  return { rules, orchestrator, validator };
}

// Обработка ТЗ на запуск
async function processLaunchBrief(brief) {
  const ctx = readContext();

  const systemPrompt = `${ctx.orchestrator}

---
${ctx.rules}

---
${ctx.validator}

Ты получаешь ТЗ на запуск рекламной кампании.
Твоя задача:
1. Проверить наличие всех обязательных параметров
2. Если чего-то не хватает — вернуть JSON с запросом уточнения
3. Если всё есть — собрать структуру кампании и вернуть превью

ВСЕГДА отвечай ТОЛЬКО валидным JSON без markdown и текста вокруг.

Формат ответа при нехватке параметров:
{
  "status": "needs_clarification",
  "field": "название поля",
  "question": "вопрос пользователю"
}

Формат ответа при успехе:
{
  "status": "ready",
  "preview": "текст превью для пользователя",
  "structure": {
    "campaign": {
      "name": "...",
      "objective": "OUTCOME_AWARENESS",
      "status": "PAUSED"
    },
    "page_id": "107996248132865",
    "adsets": [
      {
        "name": "...",
        "daily_budget": 50000,
        "start_time": "2026-04-10T00:00:00+0300",
        "end_time": "2026-04-30T23:59:59+0300",
        "optimization_goal": "REACH",
        "billing_event": "IMPRESSIONS",
        "targeting": {
          "geo_locations": {"countries": ["UA"]},
          "age_min": 18,
          "age_max": 55,
          "publisher_platforms": ["facebook", "instagram"],
          "facebook_positions": ["feed"],
          "instagram_positions": ["stream", "story", "reels"]
        },
        "pixel_id": "393751978682816",
        "ads": [
          {
            "name": "...",
            "url": "https://apollo.online/clubs/",
            "text": "...",
            "utm": "utm_source=facebook&utm_medium=reach..."
          }
        ]
      }
    ]
  }
}

Формат ответа при ошибке:
{
  "status": "error",
  "message": "описание ошибки"
}`;

  let response;
  try {
    response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `ТЗ на запуск:\n${brief}` }
      ]
    });
  } catch (e) {
    const msg = e.message || '';
    if (msg.toLowerCase().includes('credit balance') || msg.toLowerCase().includes('billing')) {
      return { error: '⚠️ Недостаточно кредитов Anthropic API. Пополни баланс на console.anthropic.com' };
    }
    throw e;
  }

  const text = response.content[0].text.trim();

  try {
    const parsed = JSON.parse(text);

    if (parsed.status === 'needs_clarification') {
      return {
        needsClarification: true,
        field: parsed.field,
        question: parsed.question
      };
    }

    if (parsed.status === 'error') {
      return { error: parsed.message };
    }

    if (parsed.status === 'ready') {
      return {
        preview: parsed.preview,
        structure: parsed.structure
      };
    }

  } catch (e) {
    return { error: 'Ошибка парсинга ответа агента: ' + e.message };
  }
}

// Публикация структуры
async function publishStructure(structure) {
  const result = await createFullStructure(structure);

  const historyPath = path.join(__dirname, '../history/launches.json');
  const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));

  history.push({
    date: new Date().toISOString(),
    campaign_name: structure.campaign.name,
    campaign_id: result.campaign_id,
    adsets: result.adsets,
    ads_count: result.ads.length
  });

  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));

  return {
    campaign_name: structure.campaign.name,
    campaign_id: result.campaign_id,
    adsets: result.adsets,
    ads: result.ads
  };
}

module.exports = { processLaunchBrief, publishStructure };
