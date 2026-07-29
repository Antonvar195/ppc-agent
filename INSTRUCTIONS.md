# PPC Agent — Apollo Next
## Контекст проекта
Система автоматизации запуска рекламных кампаний Meta Ads для сети фитнес-клубов Apollo Next.
Управление через Telegram. Архитектура — мультиагентная, каждый агент делает одну задачу.

---

## Статус проекта
### Сделано
- Структура проекта создана и запушена в GitHub (приватный репо)
- config/rules.md — правила нейминга, UTM, клубы, ссылки
- agents/validator.md — собирает структуру кампании для апрува
- agents/link_checker.md — проверяет все ссылки до публикации
- agents/naming_agent.md — генерирует названия по стандартам
- agents/utm_agent.md — генерирует UTM разметку
- tools/meta_api.js — коннектор к Meta API v21.0
- tools/create_campaign.js — скрипт создания структуры кампании (с auto-fix Threads)
- tools/creative_builder.js — загрузка изображений + видео в Meta
- bot/telegram_bot.js + bot/orchestrator.js — Telegram бот с оркестратором
- Meta API соединение работает, аккаунт активен

### Исправлено (июнь 2026)
- Модель Claude: claude-sonnet-4-20250514 → claude-sonnet-4-6
- Meta API: v19.0 → v21.0
- Threads плейсмент: удалён из дефолтов (несовместим с большинством objective)
- Auto-fix: Threads автоматически вырезается из targeting в validateFullStructure
- Видео: реализована загрузка MP4/MOV через буфер в Meta (graph-video.facebook.com)
- Fallback creative: поддержка видео в object_story_spec (video_data)
- Пример бюджета в /help: UAH → USD (аккаунт в долларах)

### Сделано (июль 2026)
- `ARCHITECTURE.md` — целевая архитектура системы: план-контракт по клубам,
  два режима (presale/mature), банк концептов, три контура управления,
  слой сверки с CRM. **Читать перед работой над аналитикой.**
- `tools/audit_capi.js` — read-only аудит CAPI/пикселя

### Следующие этапы
Порядок и содержание — в `ARCHITECTURE.md`, раздел 13. Кратко:
1. Смена value в CAPI с первого платежа на LTV (вне кода, но приоритет №1)
2. План-контракт `plan/YYYY-MM.yaml` + pacing по клубам
3. ETL с перезабором хвоста 10 дней + витрина фактов
4. Банк концептов + детект выгорания + ротация аналогов
5. Preflight перед publisher

## TODO: Dynamic Creative (asset_feed_spec)
Статус: отложено
Что нужно:
- Запросить Dynamic Creative capability для Meta App 1275096940684899
- Business Manager → App Settings → запросить расширенный доступ
- После одобрения — обновить createAdWithAssets в tools/creative_builder.js
- Убрать fallback на object_story_spec
- Одно объявление будет содержать все форматы (квадрат + вертикаль)
  вместо отдельного объявления на каждый файл

Текущий fallback: один image_hash на объявление — работает стабильно.

---

## Ключевые данные
- Meta App ID: 1275096940684899
- Рекламный аккаунт: 109_PMD_Apollo.online_temp
- Facebook страница Apollo Next ID: 107996248132865
- API версия: v19.0
- Токены и ID в .env (не в GitHub)

---

## Архитектура агентов

### Блок запуска
Оркестратор
├── naming_agent — генерирует названия (Claude Haiku)
├── utm_agent — генерирует UTM (Claude Haiku)
├── link_checker — проверяет ссылки (Claude Haiku)
├── validator — собирает превью для апрува (Claude Sonnet)
└── publisher — публикует через Meta API (Claude Haiku)

### Блок аналитики (следующий этап)
├── metrics_collector — сырые данные из API
├── campaign_analyzer — метрики кампаний
├── adset_analyzer — метрики групп
├── ad_analyzer — метрики объявлений
├── dayofweek_model — веса дней недели
└── anomaly_watcher — алерты аномалий

### Блок отчётности
├── dynamics_agent — динамика по периодам
├── explanation_agent — почему изменились метрики
├── split_test_agent — анализ сплит-тестов
└── report_builder — финальный отчёт

### Блок рекомендаций
├── budget_advisor — увеличить/уменьшить бюджет
├── strategy_advisor — сменить подход
├── fatigue_detector — усталость аудиторий/креативов
└── test_suggester — предложения новых тестов

### Telegram Interface
├── command_parser — читает команды
├── approval_handler — апрув/правки
└── notification_sender — дайджесты и алерты

---

## Флоу запуска кампании

Ты пишешь ТЗ в Telegram
command_parser передаёт оркестратору
naming_agent → генерирует названия
utm_agent → генерирует UTM
link_checker → проверяет все ссылки
❌ ошибка → стоп, сообщение тебе
✅ всё OK → продолжаем
validator → собирает превью и показывает тебе
Ты: апрув или правки
publisher → создаёт в Meta API (статус PAUSED)
Ты получаешь подтверждение со ссылками


---

## Правила разработки
- Все объекты создаются в статусе PAUSED — никогда ACTIVE
- Публикация только после явного "ок" или "запускай" от пользователя
- Токены только в .env, никогда в коде или чате
- Каждый агент читает config/rules.md перед работой
- Один агент = одна задача = один формат вывода
- Все изменения через git commit с понятным сообщением
- .env никогда не коммитить

---

## Структура файлов
/ppc-agent
/agents
naming_agent.md     ✅ готов
utm_agent.md        ✅ готов
validator.md        ✅ готов
link_checker.md     ✅ готов
publisher.md        ✅ готов
/config
rules.md            ✅ готов
/tools
meta_api.js         ✅ готов
create_campaign.js  ✅ готов
test_structure.js   ✅ готов (не запускали)
/history
launches.json       ✅ пустой массив
INSTRUCTIONS.md       ✅ этот файл
CLAUDE.md             ✅ готов
.env                  ✅ заполнен (не в GitHub)
.env.example          ✅ шаблон
.gitignore            ✅
README.md             ✅

---

## Как работать с этим проектом
Перед каждой задачей читай этот файл полностью.
Обновляй статус файлов и раздел "Сейчас делаем" после каждого изменения.
Все архитектурные решения фиксируй здесь.
