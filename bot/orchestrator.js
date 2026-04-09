const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const { createFullStructure, validateFullStructure } = require('../tools/create_campaign');

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

  const systemPrompt = `КРИТИЧНО:
Користувач працює з Dropbox shared link на папку.
Ти НЕ маєш права просити прямі посилання на зображення.
Ти НЕ можеш і НЕ повинен відображати зображення в превью.
Система автоматично завантажить файли через Dropbox API.
В превью просто напиши: "Креативи: папка Dropbox"
Якщо бачиш посилання що містить dropbox.com — це коректне посилання, не питай більше нічого про зображення.

---
${ctx.orchestrator}

---
${ctx.rules}

---
${ctx.validator}

Ти отримуєш ТЗ на запуск рекламної кампанії.
Твоя задача:
1. Перевірити наявність всіх обов'язкових параметрів
2. Якщо чогось не вистачає — повернути JSON з запитом уточнення
3. Якщо все є — зібрати структуру кампанії і повернути превью

ФОРМАТ ТЗ від користувача:
- Тип кампанії
- Гео
- Дати старту і завершення
- Бюджет на групу
- Розбивка груп
- Посилання на Dropbox з креативами
- Текст об'явлення (просто текстом)
- Заголовок (просто текстом)
- Опис (опціонально, просто текстом)

Якщо текст або заголовок не вказані — запитай окремо.
Опис — якщо не вказаний, не використовуємо.

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
          "instagram_positions": ["stream", "story", "reels"],
          "targeting_automation": {"advantage_audience": 0}
        },
        "pixel_id": "393751978682816",
        "ads": [
          {
            "name": "...",
            "url": "https://apollo.online/clubs/",
            "text": "текст з ТЗ",
            "headline": "заголовок з ТЗ",
            "description": "опис з ТЗ (якщо є, інакше не додавай поле)",
            "dropbox_link": "https://www.dropbox.com/scl/fo/...",
            "utm": "utm_source=facebook&utm_medium=reach..."
          }
        ]
      }
    ]
  }
}

ВАЖЛИВО щодо Dropbox:
- Користувач дає посилання на папку Dropbox (shared link)
- НЕ вимагай прямих посилань на зображення
- НЕ намагайся відображати зображення в превью
- Система сама завантажить файли через Dropbox API при публікації
- В превью просто покажи назву папки та кількість файлів (якщо відомо)
- Для превью достатньо: "Креативи: папка Dropbox"

ВАЖЛИВО для ads:
- text: текст об'явлення з ТЗ (обов'язково)
- headline: заголовок з ТЗ (обов'язково)
- description: опис з ТЗ (тільки якщо вказано в ТЗ)
- dropbox_link: посилання на папку Dropbox з креативами (якщо є в ТЗ — додай в кожне оголошення)
- url: посилання на сайт (визначається автоматично за rules.md)

Якщо в ТЗ є посилання на Dropbox — додай його в кожне оголошення як dropbox_link.
Якщо немає dropbox_link — верни needs_clarification з проханням надати посилання на папку Dropbox.
Якщо немає тексту — верни needs_clarification з проханням надати текст об'явлення.
Якщо немає заголовку — верни needs_clarification з проханням надати заголовок.

Формат ответа при ошибке:
{
  "status": "error",
  "message": "описание ошибки"
}`;

  let response;
  try {
    response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Сьогодні: ${new Date().toISOString().split('T')[0]} (${new Date().getFullYear()} рік). Всі дати в структурі мають бути в майбутньому відносно цієї дати.\n\nТЗ на запуск:\n${brief}`
        }
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
    // Убираем markdown обёртку если есть
    let cleanText = text.trim();
    if (cleanText.startsWith('```')) {
      cleanText = cleanText
        .replace(/^```json\n?/, '')
        .replace(/^```\n?/, '')
        .replace(/\n?```$/, '')
        .trim();
    }

    const parsed = JSON.parse(cleanText);
    console.log('ORCHESTRATOR RESPONSE:', JSON.stringify(parsed, null, 2));

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
      console.log('=== PARSED STRUCTURE ===');
      console.log(JSON.stringify(parsed, null, 2));
      console.log('========================');

      console.log('🔍 Запускаю валідацію через Meta API...');
      const validation = await validateFullStructure(parsed.structure);

      if (!validation.valid) {
        const errorList = validation.errors.join('\n• ');
        return {
          needsClarification: true,
          field: 'validation_errors',
          question: `⚠️ Знайдено помилки в структурі:\n\n• ${errorList}\n\nВиправ та надішли ТЗ знову.`
        };
      }

      let previewNote = '';
      if (validation.autoFixed.length > 0) {
        previewNote = '\n\n🔧 Автоматично виправлено:\n• ' +
          validation.autoFixed.join('\n• ');
      }

      return {
        preview: parsed.preview + previewNote,
        structure: validation.structure
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
