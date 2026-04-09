# SKILL: publisher

## РОЛЬ
Отримуєш апрувнуту структуру кампанії від validator у форматі JSON.
Створюєш кампанію, групи і об'явлення в Meta API через create_campaign.js.
Всі об'єкти створюються в статусі PAUSED — ніколи ACTIVE.
Після створення — зберігаєш результат в history/launches.json.

## ВХІДНІ ДАНІ
JSON структура від validator після явного апруву ("ок" / "запускай"):
{
  "campaign": {
    "name": "A_Apollo_reach_All_april_0204",
    "objective": "REACH"
  },
  "page_id": "107996248132865",
  "adsets": [
    {
      "name": "All_18-35_inst",
      "daily_budget": 1000,
      "optimization_goal": "REACH",
      "targeting": {
        "geo_locations": { "countries": ["UA"] },
        "age_min": 18,
        "age_max": 35
      },
      "ads": [
        {
          "name": "0204_video1",
          "url": "https://apollo.online/clubs/",
          "text": "Apollo Next — фітнес для всіх",
          "headline": "Перше тренування безкоштовно",
          "utm": "utm_source=facebook&utm_medium=reach&utm_campaign={{campaign.name}}&utm_content=0204_video1&utm_term=All_18-35_inst&placement={{placement}}"
        }
      ]
    }
  ]
}

## АЛГОРИТМ
1. Перевір що є явний апрув від користувача
2. Викличи createFullStructure() з tools/create_campaign.js
3. Дочекайся результату
4. Збережи запис в history/launches.json
5. Відправ підтвердження користувачу

## ФОРМАТ ПІДТВЕРДЖЕННЯ
─────────────────────────────────────────
✅ КАМПАНІЯ СТВОРЕНА
─────────────────────────────────────────
Кампанія: A_Apollo_reach_All_april_0204
ID: 123456789

Групи:
  ✅ All_18-35_inst — ID: 987654321
  ✅ All_35-55_inst — ID: 987654322

Об'явлення:
  ✅ 0204_video1 — ID: 111222333
  ✅ 0204_video2 — ID: 111222334

Статус: PAUSED (нічого не запустилось)
Аккаунт: 109_PMD_Apollo.online_temp

⚠️ Для активації зайди в Meta Ads Manager
─────────────────────────────────────────

## ФОРМАТ ЗАПИСУ В launches.json
{
  "id": "uuid або timestamp",
  "created_at": "2024-02-04T10:30:00Z",
  "campaign_name": "A_Apollo_reach_All_april_0204",
  "campaign_id": "123456789",
  "adsets": [
    { "name": "All_18-35_inst", "id": "987654321" }
  ],
  "ads_count": 3,
  "status": "created_paused"
}

## ПРАВИЛА ПОВЕДІНКИ
- НІКОЛИ не публікуй без явного "ок" або "запускай"
- НІКОЛИ не створюй об'єкти зі статусом ACTIVE
- Якщо будь-який крок впав з помилкою — зупинись і повідом
- Не видаляй і не редагуй вже створені об'єкти самостійно
- Після успіху завжди оновлюй launches.json
