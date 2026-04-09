// Тест полного флоу: orchestrator → validate → publish
const { processLaunchBrief, publishStructure } = require('../bot/orchestrator');

const brief = `
Запусти кампанію охоплення Apollo Next на квітень.
Бюджет: 200 грн/день на групу.
Термін: з 10 по 30 квітня 2026.
Посилання на сайт: https://apollo.online/clubs/
Зображення: https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&q=80
Текст: Apollo Next — мережа фітнес-клубів №1 в Україні. Сучасне обладнання, групові програми та профі-тренери чекають на тебе!
Заголовок: Apollo Next Fitness
Аудиторія: 18-55 років, вся Україна
`;

async function main() {
  console.log('=== КРОК 1: processLaunchBrief ===');
  const briefResult = await processLaunchBrief(brief);

  console.log('\n=== РЕЗУЛЬТАТ processLaunchBrief ===');
  if (briefResult.error) {
    console.error('❌ Помилка:', briefResult.error);
    return;
  }
  if (briefResult.needsClarification) {
    console.log('❓ Уточнення потрібне:', briefResult.question);
    return;
  }

  console.log('✅ Превью:');
  console.log(briefResult.preview);
  console.log('\n✅ Структура валідна. Запускаю публікацію...');

  console.log('\n=== КРОК 2: publishStructure ===');
  const publishResult = await publishStructure(briefResult.structure);

  console.log('\n=== ПІДСУМОК ===');
  console.log('Кампанія:', publishResult.campaign_id);
  console.log('Групи:', publishResult.adsets.length);
  console.log('Оголошення:', publishResult.ads.length);
  if (publishResult.ads.length > 0) {
    console.log('\n✅ ПОВНИЙ ФЛОУ ПРАЦЮЄ!');
  } else {
    console.log('\n❌ Оголошення не створено');
  }
}

main().catch(console.error);
