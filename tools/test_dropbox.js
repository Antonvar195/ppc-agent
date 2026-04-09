const { listFolderBySharedLink } = require('./dropbox_reader');

async function test() {
  const sharedLink = 'https://www.dropbox.com/scl/fo/bufmdnpl1auqm5upjj8gu/ABZ0-iPdEWsoUPs8EzF1k08?dl=0&e=1&rlkey=dfu84xbd4xpb1zaovpwfel298';

  console.log('📂 Читаю папку по shared link...\n');

  try {
    const files = await listFolderBySharedLink(sharedLink);
    console.log(`\nИтого файлов: ${files.length}`);
    console.log('\nГруппировка по форматам:');

    const byFormat = {
      square: files.filter(f => f.format === 'square'),
      vertical: files.filter(f => f.format === 'vertical'),
      horizontal: files.filter(f => f.format === 'horizontal')
    };

    console.log(`\n🔲 Квадрат (Feed): ${byFormat.square.length}`);
    byFormat.square.forEach(f => console.log(`   - ${f.name}`));

    console.log(`\n📱 Вертикаль (Stories/Reels): ${byFormat.vertical.length}`);
    byFormat.vertical.forEach(f => console.log(`   - ${f.name}`));

    console.log(`\n🖥️ Горизонталь (широкий Feed): ${byFormat.horizontal.length}`);
    byFormat.horizontal.forEach(f => console.log(`   - ${f.name}`));

  } catch (err) {
    console.log('❌ Ошибка:', err.response?.data || err.message);
  }
}

test();
