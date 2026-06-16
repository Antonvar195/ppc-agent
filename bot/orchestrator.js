const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const { createFullStructure, validateFullStructure, retryFailedAdsets } = require('../tools/create_campaign');

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
        "daily_budget": 2000,
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
            "name": "DDMM_1",
            "url": "https://apollo.online/clubs/",
            "text": "текст з ТЗ",
            "headline": "заголовок з ТЗ",
            "description": "опис з ТЗ (якщо є, інакше не додавай поле)",
            "dropbox_link": "https://www.dropbox.com/scl/fo/...",
            "utm": "utm_source=facebook&utm_medium=reach&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}"
          }
        ]
      }
    ]
  }
}

КРИТИЧНО — ФОРМАТ geo_locations:
НЕ використовуй custom_locations, primary_city_id або будь-які інші формати гео.
ТІЛЬКИ такі варіанти:

Всі міста України:
  "geo_locations": {"countries": ["UA"]}

Конкретні міста (використовуй ТОЧНО ці ключі):
  Київ:         "geo_locations": {"regions": [{"key": "4290"}]}
  Львів:        "geo_locations": {"cities": [{"key": "2378495"}]}
  Одеса:        "geo_locations": {"cities": [{"key": "2384095"}]}
  Харків:       "geo_locations": {"cities": [{"key": "2372604"}]}
  Дніпро:       "geo_locations": {"cities": [{"key": "2367397"}]}
  Запоріжжя:    "geo_locations": {"cities": [{"key": "2400115"}]}
  Вінниця:      "geo_locations": {"cities": [{"key": "2397330"}]}
  Херсон:       "geo_locations": {"cities": [{"key": "2372649"}]}
  Чернівці:     "geo_locations": {"cities": [{"key": "2366058"}]}
  Полтава:      "geo_locations": {"cities": [{"key": "2387014"}]}
  Суми:         "geo_locations": {"cities": [{"key": "2393546"}]}
  Черкаси:      "geo_locations": {"cities": [{"key": "2365955"}]}
  Житомир:      "geo_locations": {"cities": [{"key": "2401072"}]}
  Ужгород:      "geo_locations": {"cities": [{"key": "2395916"}]}

Кілька міст одночасно:
  "geo_locations": {"cities": [{"key": "2378495"}, {"key": "2384095"}]}

ВАЖЛИВО щодо Dropbox:
- Користувач дає посилання на папку Dropbox (shared link)
- НЕ вимагай прямих посилань на зображення
- НЕ намагайся відображати зображення в превью
- Система сама завантажить файли через Dropbox API при публікації
- В превью просто покажи назву папки та кількість файлів (якщо відомо)
- Для превью достатньо: "Креативи: папка Dropbox"

ВАЖЛИВО — БЮДЖЕТ:
Акаунт у доларах. daily_budget = $ × 100 (центи).
Приклади: $10 → 1000, $20 → 2000, $25 → 2500, $30 → 3000.
В превью показуй: "Бюджет: $20/день".
Якщо бюджет не вказано — запитай.

КРИТИЧНО — UTM (обов'язково в кожному оголошенні):
utm поле — рядок параметрів БЕЗ знаку "?". Система сама додасть "?" до URL.
utm_medium = тип кампанії: reach / cpc / conversion / leads
ЗАВЖДИ додавай повний UTM рядок у кожне оголошення:
"utm": "utm_source=facebook&utm_medium=reach&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}"
НЕ включай URL в utm поле — тільки параметри.
{{campaign.name}}, {{ad.name}}, {{adset.name}}, {{placement}} — це Meta макроси, вставляй їх дослівно.

КРИТИЧНО — НЕЙМИНГ ОБ'ЯВЛЕНЬ:
Формат: DDMM_N (де DDMM — дата старту, N — порядковий номер)
Наприклад, старт 17.06, одне оголошення: name = "1706_1"
Якщо кілька груп — нумерація наскрізна: "1706_1" в першій групі, "1706_2" у другій.
НЕ використовуй "video" в назві — система сама визначає тип медіа.

КРИТИЧНО — БЮДЖЕТ:
Акаунт у доларах. daily_budget = $ × 100 (центи).
$10 → 1000, $20 → 2000, $25 → 2500, $30 → 3000.
Перед генерацією структури перевір: daily_budget / 100 = $ введений користувачем.
В превью ЗАВЖДИ показуй: "Бюджет: $20/день" щоб користувач міг перевірити.

ВАЖЛИВО для ads:
- name: DDMM_N (обов'язково, де DDMM = дата старту, N = порядковий номер)
- text: текст об'явлення з ТЗ (обов'язково)
- headline: заголовок з ТЗ (обов'язково)
- description: опис з ТЗ (тільки якщо вказано в ТЗ)
- dropbox_link: посилання на папку Dropbox з креативами (якщо є в ТЗ — додай в кожне оголошення)
- url: посилання на сайт (визначається автоматично за rules.md)
- utm: ЗАВЖДИ обов'язково (дивись вище)

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
      model: 'claude-sonnet-4-6',
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

// Аналіз помилок і пропозиція виправлення
async function analyzeErrors(failedAdsets, campaignObjective) {
  const errorDetails = failedAdsets.map(f =>
    `Група "${f.params.name}"\nПомилка: ${f.error}\nПараметри: ${JSON.stringify(f.params, null, 2)}`
  ).join('\n\n---\n\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    system: `Ти аналізуєш помилки Meta Marketing API і пропонуєш конкретні виправлення параметрів adset.

Відповідай ТІЛЬКИ валідним JSON без markdown:
{
  "explanation": "коротко що пішло не так (1-2 речення)",
  "proposed_fix": "конкретно що треба змінити (для показу користувачу)",
  "fixed_adsets": [ ...масив виправлених об'єктів { params: {...} } ]
}

Типові причини "Invalid parameter":
- Threads плейсмент: "threads" не є допустимим значенням publisher_platforms для більшості цілей. Якщо є "threads" в publisher_platforms або threads_positions → видали їх.
- optimization_goal несумісний з objective: OUTCOME_SALES → optimization_goal має бути OFFSITE_CONVERSIONS, OUTCOME_AWARENESS → REACH, OUTCOME_TRAFFIC → LINK_CLICKS або LANDING_PAGE_VIEWS.
- instagram_positions "explore_home" або інші невалідні → видали їх.

ВАЖЛИВО: у fixed_adsets повертай ПОВНІ params adset (з полем ads, targeting, тощо) але з виправленими параметрами.`,
    messages: [{
      role: 'user',
      content: `Ціль кампанії: ${campaignObjective || 'невідома'}\n\nПровалені групи:\n\n${errorDetails}`
    }]
  });

  const raw = response.content[0].text.trim();
  console.log('analyzeErrors raw response:', raw.substring(0, 500));

  const text = raw
    .replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`AI повернув некоректний JSON: ${text.substring(0, 200)}`);
  }

  if (!parsed.fixed_adsets || !Array.isArray(parsed.fixed_adsets)) {
    throw new Error(`AI не повернув fixed_adsets: ${JSON.stringify(parsed).substring(0, 200)}`);
  }

  return parsed;
}

// Повторний запуск провалених груп з виправленими параметрами
async function retryWithFix(campaignId, fixedAdsets, pageId) {
  return retryFailedAdsets(campaignId, fixedAdsets, pageId);
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
    page_id: structure.page_id,
    campaign_objective: structure.campaign.objective,
    adsets: result.adsets,
    ads: result.ads,
    errors: result.errors || [],
    failed_adsets: result.failed_adsets || []
  };
}

module.exports = { processLaunchBrief, publishStructure, analyzeErrors, retryWithFix };
