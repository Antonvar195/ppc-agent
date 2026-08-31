// Вересневі охватні: два оффери, один город = одна група.
//
//   AI_Apollo_reach_1grn_0109   — Київ, Вінниця            (ролики A1-A3)
//   AI_Apollo_reach_50off_0109  — Львів, Одеса, БЦ, ІФ,     (ролики B1-B3)
//                                 Житомир
//
// Оффер ролика підтверджений за фінальним титром кожного відео, не за назвою
// файлу (див. docs/LESSONS.md — «назви файлів брешуть»).
//
// Налаштування 1:1 з серпневими охватними (AI_Apollo_reach_499/399_2408):
// оптимізація IMPRESSIONS (не REACH), targeting_optimization none,
// individual_setting.geo = 1, лише Instagram + Threads, вік 18-55.
// Бюджети серпневі, АЛЕ зрізані там, де вони перебирали ціль по частоті 8:
// Біла Церква $20→$11 (аудиторія 130к вичерпується, вийшла б на ~14),
// Івано-Франківськ $20→$18. Зекономлене нікуди не перекладається.
// Житомира в серпневих не було — $15 пропорційно аудиторії.
//
// Ліміту частоти НЕМАЄ свідомо: Meta приймає frequency_control_specs лише з
// optimization_goal REACH (1815211), а REACH дає нижчу частоту, ніж IMPRESSIONS.
// Оскільки ціль — підняти частоту до 8, обрано IMPRESSIONS без стелі.
// Наслідок: малі міста переберуть (Біла Церква ~14) — там регулювати бюджетом.
//
// Все PAUSED. Usage: node tools/build_sept_reach.js plan | build | verify
const fs = require('fs');
const path = require('path');
const G = require('./meta_guard');
const { apiGet } = require('./meta_api');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const IG_ID = process.env.META_INSTAGRAM_ACTOR_ID || '17841447539432480';
const MANIFEST = path.join(__dirname, '../history/sept_vids_manifest.json');

const START_TIME = '2026-09-01T00:01:00+0300';
const END_TIME = '2026-09-30T23:59:00+0300';
const CTA = 'LEARN_MORE';
const DISPLAY_URL = 'apollo.online';
const URL_TAGS = 'utm_source=facebook&utm_medium=reach&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';

const BODY_1GRN = `Перший тиждень в APOLLO NEXT — 1 ₴.

Це не пробне заняття і не знижка. Це тиждень, за який ти спокійно розберешся, твоє це чи ні.

▫️ Ходи щодня або раз — як вийде
▫️ Перше тренування з тренером: огляд зон, розбір техніки, аналіз тіла Accuniq
▫️ 120+ групових програм на тиждень
▫️ З 06:30 до 23:00

Тут не оцінюють і не тиснуть. Просто спробуй.`;

const BODY_50OFF = `−50% на перші 4 тижні в APOLLO NEXT.

Схуднути, набрати, нарешті висипатись, знайти тишу в голові — причина твоя. Решта наша.

▫️ 120+ групових програм на тиждень
▫️ Вільні ваги, кардіо, функціонал, йога
▫️ Тренера обираєш ти, а не він тебе
▫️ З 06:30 до 23:00, без обмежень по годинах

Чотири тижні за півціни — щоб звичка встигла зʼявитись.`;

const OFFERS = {
  '1grn': {
    campaign: 'AI_Apollo_reach_1grn_0109',
    title: 'Перший тиждень — 1 ₴',
    body: BODY_1GRN,
    concepts: [
      { key: 'A1', desc: 'Четвертий день' },
      { key: 'A2', desc: 'Ти не схуднеш за тиждень' },
      { key: 'A3', desc: 'Гадаєш або тренуєшся' },
    ],
    cities: [
      { name: 'Kyiv_18-55', budget: 10000, link: 'https://apollo.online/clubs/kyyiv/',
        geo: { regions: [{ key: '4290', country: 'UA' }] } },
      { name: 'Vinnytsia_18-55', budget: 2000, link: 'https://apollo.online/clubs/apollo-next-033-tcz-magigrand/',
        geo: { cities: [{ key: '2397330', country: 'UA' }] } },
    ],
  },
  '50off': {
    campaign: 'AI_Apollo_reach_50off_0109',
    title: '−50% на перші 4 тижні',
    body: BODY_50OFF,
    concepts: [
      { key: 'B1', desc: 'Причина твоя' },
      { key: 'B2', desc: 'Ми не продамо спортзал' },
      { key: 'B3', desc: 'Вся правда про Apollo' },
    ],
    cities: [
      { name: 'Lviv_18-55', budget: 4000, link: 'https://apollo.online/clubs/lviv/',
        geo: { cities: [{ key: '2378495', country: 'UA' }] } },
      { name: 'Odessa_18-55', budget: 3500, link: 'https://apollo.online/clubs/odesa/',
        geo: { cities: [{ key: '2384095', country: 'UA' }] } },
      { name: 'BilaTserkva_18-55', budget: 1100, link: 'https://apollo.online/clubs/apollo-next-035/',
        geo: { cities: [{ key: '2363654', country: 'UA' }] } },
      { name: 'IvanoFrankivsk_18-55', budget: 1800, link: 'https://apollo.online/clubs/apollo-next-039/',
        geo: { cities: [{ key: '2371245', country: 'UA' }] } },
      { name: 'Zhytomyr_18-55', budget: 1500, link: 'https://apollo.online/clubs/apollo-next-041-yarmarok/',
        geo: { cities: [{ key: '2401072', country: 'UA' }] } },
    ],
  },
};

const targetingFor = geo => ({
  age_min: 18, age_max: 55,
  geo_locations: { ...geo, location_types: ['home', 'recent'] },
  targeting_optimization: 'none',
  targeting_automation: { advantage_audience: 0, individual_setting: { geo: 1 } },
  publisher_platforms: ['instagram', 'threads'],
  instagram_positions: ['stream', 'story', 'reels', 'explore', 'explore_home', 'profile_feed'],
  threads_positions: ['threads_stream'],
});

// вертикаль у сторіс/рілс, квадрат — стрічка/explore/Threads.
// Для ВІДЕО порожній customization_spec не можна (2446501), тому обидва
// правила з явним плейсмент-спеком — формула з живих кампаній.
const RULES = [
  { customization_spec: { age_min: 13, age_max: 65, publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'] }, video_label: { name: 'st_vid' }, priority: 1 },
  { customization_spec: { age_min: 13, age_max: 65, publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed'], instagram_positions: ['stream', 'explore', 'explore_home', 'profile_feed'] }, video_label: { name: 'sq_vid' }, priority: 2 },
];

function plan() {
  let total = 0;
  for (const o of Object.values(OFFERS)) {
    console.log(`\n📁 ${o.campaign} — OUTCOME_AWARENESS / IMPRESSIONS`);
    console.log(`   заголовок: «${o.title}» · ${o.concepts.length} ролики · ${START_TIME.slice(0,10)} → ${END_TIME.slice(0,10)}`);
    for (const c of o.cities) {
      total += c.budget;
      console.log(`   📂 ${c.name.padEnd(22)} $${String(c.budget/100).padStart(3)}/д  →  ${c.link}`);
      o.concepts.forEach(k => console.log(`        • 0109_${k.key} — ${k.desc}`));
    }
  }
  console.log(`\nРазом: ${Object.values(OFFERS).reduce((n,o)=>n+o.cities.length,0)} груп, ` +
    `${Object.values(OFFERS).reduce((n,o)=>n+o.cities.length*o.concepts.length,0)} оголошень, $${total/100}/день`);
  console.log(`За вересень (30 дн): ~$${total/100*30}`);
  console.log('\n(plan — нічого не створено)');
}

async function build() {
  const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const entry = { date: '2026-08-31', campaigns: [] };

  for (const o of Object.values(OFFERS)) {
    const existing = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '300' })).data || [];
    const found = existing.find(x => x.name === o.campaign);
    const camp = found || await G.createChecked(`${ACCT}/campaigns`, {
      name: o.campaign,
      objective: 'OUTCOME_AWARENESS',
      buying_type: 'AUCTION',
      special_ad_categories: JSON.stringify([]),
      is_adset_budget_sharing_enabled: 'false',
      status: 'PAUSED',
    }, 'campaign ' + o.campaign);
    console.log(`\n📁 ${o.campaign} — ${camp.id}${found ? ' (наявна)' : ''}`);

    const camps = { name: o.campaign, id: camp.id, adsets: [] };
    const liveSets = (await apiGet(`${camp.id}/adsets`, { fields: 'id,name,daily_budget', limit: '50' })).data || [];
    for (const city of o.cities) {
      const prior = liveSets.find(x => x.name === city.name);
      if (prior && String(prior.daily_budget) !== String(city.budget)) {
        const upd = await require('./meta_api').apiPost(prior.id, { daily_budget: String(city.budget) });
        if (upd.error) throw new Error(`бюджет ${city.name}: ${G.errMsg(upd.error)}`);
        console.log(`  💰 ${city.name} — бюджет $${prior.daily_budget/100} → $${city.budget/100}`);
      }
      const adset = prior || await G.createAdSet({
        name: city.name,
        campaign_id: camp.id,
        optimization_goal: 'IMPRESSIONS',
        billing_event: 'IMPRESSIONS',
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        daily_budget: String(city.budget),
        targeting: targetingFor(city.geo),
        start_time: START_TIME,
        end_time: END_TIME,
      });
      console.log(`  📂 ${city.name} — ${adset.id} | $${city.budget/100}/д | PAUSED${prior ? ' (наявна)' : ''}`);

      const liveAds = (await apiGet(`${adset.id}/ads`, { fields: 'id,name,creative{id}', limit: '50' })).data || [];
      const ads = [];
      for (const k of o.concepts) {
        const had = liveAds.find(x => x.name === `0109_${k.key}`);
        if (had) {
          ads.push({ id: had.id, name: had.name, creativeId: had.creative.id, link: city.link });
          console.log(`     ⏭  0109_${k.key} вже є — ${had.id}`);
          continue;
        }
        const sq = man[k.key + '_sq'], st = man[k.key + '_st'];
        if (!sq || !st) throw new Error('нема в маніфесті: ' + k.key);
        const cr = await G.createChecked(`${ACCT}/adcreatives`, {
          name: `0109_${k.key}_${city.name}_creative`,
          object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
          asset_feed_spec: JSON.stringify({
            videos: [
              { video_id: sq.video_id, thumbnail_hash: sq.thumb_hash, adlabels: [{ name: 'sq_vid' }] },
              { video_id: st.video_id, thumbnail_hash: st.thumb_hash, adlabels: [{ name: 'st_vid' }] },
            ],
            bodies: [{ text: o.body }],
            titles: [{ text: o.title }],
            descriptions: [{ text: '' }],
            link_urls: [{ website_url: city.link, display_url: DISPLAY_URL }],
            call_to_action_types: [CTA],
            ad_formats: ['AUTOMATIC_FORMAT'],
            optimization_type: 'PLACEMENT',
            asset_customization_rules: RULES,
          }),
          url_tags: URL_TAGS,
        }, `creative 0109_${k.key} ${city.name}`);

        const ad = await G.createAd({ name: `0109_${k.key}`, adset_id: adset.id, creative: { creative_id: cr.id } });
        ads.push({ id: ad.id, name: `0109_${k.key}`, creativeId: cr.id, link: city.link });
        console.log(`     ✅ 0109_${k.key} — ${ad.id} (${k.desc})`);
      }
      camps.adsets.push({ name: city.name, id: adset.id, budget_usd: city.budget/100, ads: ads.length, adList: ads });
    }
    entry.campaigns.push(camps);
  }

  console.log('\n🔍 Звірка (по одному оголошенню з групи):');
  for (const c of entry.campaigns) {
    for (const a of c.adsets) {
      const t = a.adList[0];
      const v = await G.verifyAd(t.id, { creativeId: t.creativeId, link: t.link });
      const p = await G.checkPreviews(t.id, ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY', 'INSTAGRAM_REELS']);
      console.log(`   ${v.ok && p.ok ? '✅' : '❌'} ${a.name.padEnd(22)} ${t.name} | ${v.problems.join('; ') || 'дані ок'} | ${p.INSTAGRAM_STANDARD}/${p.INSTAGRAM_STORY}/${p.INSTAGRAM_REELS}`);
    }
  }

  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  entry.note = 'Вересневі охватні: 1грн (Київ, Вінниця) + -50% (Львів, Одеса, БЦ, ІФ, Житомир). Один город = одна група, бюджети серпневі, Житомир $15 пропорційно аудиторії. IMPRESSIONS, ліміт частоти 2/7дн. Все PAUSED.';
  hist.push(entry);
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));

  for (const c of entry.campaigns) {
    console.log(`\n📊 ${c.name}:`);
    G.printSummary(await G.campaignSummary(c.id));
  }
  console.log('\n✅ Готово — все PAUSED.');
}

async function verify() {
  const r = await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '300' });
  for (const o of Object.values(OFFERS)) {
    const c = (r.data || []).find(x => x.name === o.campaign);
    if (!c) { console.log('❌ не знайдено', o.campaign); continue; }
    console.log(`\n📊 ${o.campaign}:`);
    G.printSummary(await G.campaignSummary(c.id));
  }
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'plan') plan();
  else if (cmd === 'build') await build();
  else if (cmd === 'verify') await verify();
  else console.log('cmd: plan | build | verify');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
