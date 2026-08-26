// AI_Apollo_reach_Kyiv_fest_2608 — охватна пара до конверсійної кампанії фесту.
//
// Конверсійна оптимізація навмисно звужує доставку до тих, хто заповнить форму.
// Для офлайн-івенту це вада: частина людей просто прийде. Тому окрема кампанія
// з оптимізацією на ОХОПЛЕННЯ — у цього акаунта CPM охоплення $0.35–0.55, тобто
// ~10× дешевше за показ, ніж конверсійна.
//
// Та сама аудиторія і ті самі банери (хеші вже в fest_kyiv_manifest.json),
// відмінності свідомі:
//   • ліміт частоти 1 показ / 2 дні — інакше довбитиме тих, кого вже бачить
//     конверсійна кампанія;
//   • utm_medium=reach і імена 2608_reach_N — щоб дві кампанії не злилися
//     у звітності;
//   • крутиться до ранку 12.09 (конверсійна — до 11.09).
// Реєстрантів свідомо НЕ виключаємо: нагадування зменшує неявку.
//
// Все PAUSED. Usage: node tools/build_fest_reach.js plan | build | verify
const fs = require('fs');
const path = require('path');
const G = require('./meta_guard');
const { apiGet } = require('./meta_api');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const IG_ID = process.env.META_INSTAGRAM_ACTOR_ID || '17841447539432480';

const CAMPAIGN_NAME = 'AI_Apollo_reach_Kyiv_fest_2608';
const ADSET_NAME = 'Kyiv_18-55_inst_treads_reach';
const DAILY_BUDGET = 4000;                        // $40/день
const END_TIME = '2026-09-12T09:00:00+0300';      // ранок фесту
const LANDING = 'https://fest.apollo.online/';
const DISPLAY_URL = 'fest.apollo.online';
const TITLE = 'Фітнес Фест 12.09 — вхід вільний';
const CTA = 'LEARN_MORE';
const URL_TAGS = 'utm_source=facebook&utm_medium=reach&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';
const MANIFEST = path.join(__dirname, '../history/fest_kyiv_manifest.json');

const BODY = `Найбільший фітнес-івент України — просто неба і безкоштовно 🧡

12 вересня, субота, 8:00 · X-Park, парк Муромець

Один день, 11 активностей і 14 зон:
▫️ турніри з пляжного волейболу та баскетболу 3×3
▫️ SUP-заплив і фан-забіг
▫️ йога, пілатес, зумба, стретчинг, степ, DanceX і функціональне — просто приходиш і стаєш у коло
▫️ DJ на головній сцені, фотозони та розіграші
▫️ холі-фарби о 14:00 на фінал

Вхід вільний — потрібна лише реєстрація.`;

const CONCEPTS = [
  { n: 1, sq: 'square01.jpg', st: 'stoires01.jpg', desc: 'фото: тренування на полі' },
  { n: 2, sq: 'square02.jpg', st: 'stoires02.jpg', desc: 'список 11 активностей' },
  { n: 3, sq: 'square03.jpg', st: 'stoires03.jpg', desc: 'цифри 11 / 14 / 1 / 0 ₴' },
  { n: 4, sq: 'square04.jpg', st: 'stoires04.jpg', desc: 'дівчина + партнери' },
];
const adName = c => `2608_reach_${c.n}`;

const TARGETING = {
  age_min: 18, age_max: 55,
  geo_locations: {
    cities: [{ key: '2373594', country: 'UA', radius: 17, distance_unit: 'kilometer' }],
    location_types: ['home', 'recent'],
  },
  targeting_automation: { advantage_audience: 0, individual_setting: { geo: 0 } },
  publisher_platforms: ['instagram', 'threads'],
  instagram_positions: ['stream', 'story', 'reels', 'explore', 'explore_home', 'profile_feed'],
  threads_positions: ['threads_stream'],
  device_platforms: ['mobile', 'desktop'],
};

const RULES = [
  { customization_spec: { publisher_platforms: ['instagram'], instagram_positions: ['story', 'reels'] }, image_label: { name: 'st_img' }, priority: 1 },
  { customization_spec: {}, image_label: { name: 'sq_img' }, priority: 2 },
];

function plan() {
  console.log(`\n${CAMPAIGN_NAME} — OUTCOME_AWARENESS / оптимізація REACH\n`);
  console.log(`📂 ${ADSET_NAME} — $${DAILY_BUDGET / 100}/д  [PAUSED]`);
  console.log('   Київ + 17 км · 18-55 · Instagram + Threads');
  console.log('   ліміт частоти: 1 показ / 2 дні · кінець ' + END_TIME);
  CONCEPTS.forEach(c => console.log(`   • ${adName(c)} — ${c.desc}`));
  const days = 17, cpm = 0.45, freq = 2.5;
  const imp = (DAILY_BUDGET / 100) * days / cpm * 1000;
  console.log(`\nПрогноз при CPM $${cpm}: ~${Math.round(imp / 1000)}тис. показів → ~${Math.round(imp / freq / 1000)}тис. осіб`);
  console.log('\n(plan — нічого не створено)');
}

async function build() {
  if (!fs.existsSync(MANIFEST)) throw new Error('нема ' + MANIFEST + ' — спершу build_fest_kyiv.js');
  const hashes = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  for (const f of CONCEPTS.flatMap(c => [c.sq, c.st])) {
    if (!hashes[f]) throw new Error('у маніфесті нема ' + f);
  }
  console.log('♻️  банери переиспользуємо з конверсійної кампанії (8 хешів)');

  const existing = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '200' })).data || [];
  const found = existing.find(x => x.name === CAMPAIGN_NAME);
  const camp = found || await G.createChecked(`${ACCT}/campaigns`, {
    name: CAMPAIGN_NAME,
    objective: 'OUTCOME_AWARENESS',
    buying_type: 'AUCTION',
    special_ad_categories: JSON.stringify([]),
    is_adset_budget_sharing_enabled: 'false',
    status: 'PAUSED',
  }, 'campaign');
  console.log(`\n📁 campaign ${camp.id}${found ? ' (наявна)' : ''}`);

  const adset = await G.createAdSet({
    name: ADSET_NAME,
    campaign_id: camp.id,
    optimization_goal: 'REACH',
    billing_event: 'IMPRESSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    daily_budget: String(DAILY_BUDGET),
    targeting: TARGETING,
    end_time: END_TIME,
    frequency_control_specs: JSON.stringify([{ event: 'IMPRESSIONS', interval_days: 2, max_frequency: 1 }]),
  });
  console.log(`  📂 ${ADSET_NAME} — ${adset.id} | $${DAILY_BUDGET / 100}/д | PAUSED | частота 1/2дні`);

  const created = [];
  for (const c of CONCEPTS) {
    const cr = await G.createChecked(`${ACCT}/adcreatives`, {
      name: `${adName(c)}_creative`,
      object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
      asset_feed_spec: JSON.stringify({
        images: [
          { hash: hashes[c.sq], adlabels: [{ name: 'sq_img' }] },
          { hash: hashes[c.st], adlabels: [{ name: 'st_img' }] },
        ],
        bodies: [{ text: BODY }],
        titles: [{ text: TITLE }],
        descriptions: [{ text: '' }],
        link_urls: [{ website_url: LANDING, display_url: DISPLAY_URL }],
        call_to_action_types: [CTA],
        ad_formats: ['AUTOMATIC_FORMAT'],
        optimization_type: 'PLACEMENT',
        asset_customization_rules: RULES,
      }),
      url_tags: URL_TAGS,
    }, `creative ${adName(c)}`);

    const ad = await G.createAd({ name: adName(c), adset_id: adset.id, creative: { creative_id: cr.id } });
    console.log(`     ✅ ${adName(c)} — ad ${ad.id} (${c.desc})`);
    created.push({ id: ad.id, name: adName(c), creativeId: cr.id, imageHashes: [hashes[c.sq], hashes[c.st]] });
  }

  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  hist.push({
    date: '2026-08-26', campaign_name: CAMPAIGN_NAME, campaign_id: camp.id,
    adsets: [{ name: ADSET_NAME, id: adset.id, budget_usd: DAILY_BUDGET / 100, ads: created.length }],
    ads_count: created.length,
    note: 'Охватна пара до конверсійної кампанії фесту. REACH, $40/д, ліміт частоти 1/2дні, до ранку 12.09. Ті самі банери й аудиторія, utm_medium=reach. Все PAUSED.',
  });
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));

  console.log('\n🔍 Звірка:');
  for (const a of created) {
    const v = await G.verifyAd(a.id, { creativeId: a.creativeId, imageHashes: a.imageHashes, link: LANDING });
    const p = await G.checkPreviews(a.id, ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY', 'INSTAGRAM_REELS']);
    console.log(`   ${v.ok && p.ok ? '✅' : '❌'} ${a.name} ${v.status} | ${v.problems.join('; ') || 'дані ок'} | прев'ю ${p.INSTAGRAM_STANDARD}/${p.INSTAGRAM_STORY}/${p.INSTAGRAM_REELS}`);
  }
  console.log(`\n📊 ${CAMPAIGN_NAME}:`);
  G.printSummary(await G.campaignSummary(camp.id));
  console.log('\n✅ Готово — все PAUSED.');
}

async function verify() {
  const r = await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '200' });
  const c = (r.data || []).find(x => x.name === CAMPAIGN_NAME);
  if (!c) throw new Error('кампанію не знайдено — спершу build');
  G.printSummary(await G.campaignSummary(c.id));
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'plan') plan();
  else if (cmd === 'build') await build();
  else if (cmd === 'verify') await verify();
  else console.log('cmd: plan | build | verify');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
