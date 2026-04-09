const { listFolder, getDownloadLink, detectFormat } = require('./dropbox_reader');

async function test() {
  // Тест — укажи реальный путь к папке в Dropbox
  const path = '/test'; // замени на реальный путь

  console.log('📂 Читаю папку Dropbox:', path);

  try {
    const files = await listFolder(path);
    console.log(`\nНайдено файлов: ${files.length}`);

    files.forEach(f => {
      console.log(`  ${f.name} (${Math.round(f.size/1024)}KB) → формат: ${detectFormat(f.name)}`);
    });
  } catch (err) {
    console.log('❌ Ошибка:', err.message);
  }
}

test();
