require('dotenv').config();
const { testConnection, getCampaigns } = require('./meta_api');

async function run() {
  const ok = await testConnection();

  if (ok) {
    console.log('\n📋 Последние кампании:');
    const campaigns = await getCampaigns();

    if (campaigns.data && campaigns.data.length > 0) {
      campaigns.data.forEach(c => {
        console.log(`   [${c.status}] ${c.name}`);
      });
    } else {
      console.log('   Кампаний не найдено или нет доступа');
    }
  }
}

run();
