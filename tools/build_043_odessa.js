// AI_Apollo_sales_Odessa_043_2710 — запуск нового клубу 043 (Одеса,
// вул. Академіка Корольова, 43-Є; відкриття 03.12.26).
//
// ОДНА група замість звичних 5-9. Підстава — наші ж дані:
// поріг виходу з фази навчання 50 конверсій/тиждень на групу, а фактично
// було 2.9 (144, 9 груп), 0.9 (041, 6 груп), 0.1 (040, 3 групи). Жодна
// група в жодному запуску з навчання не вийшла. При $108/день і CPA ~$25
// кампанія дає ~30 конверсій/тиждень — у ОДНІЙ групі це найближче до
// порога з усього, що ми запускали.
//
// Advantage+ як аудиторія: з чотирьох запусків дала найкращий CPA ($23.70)
// і найкращий CTR (2.19%) на найбільшому обсязі (633 покупки).
// Усі 9 креативів в одній групі — Андромеда підбирає креатив під людину,
// і більший пул їй допомагає. Нерівна витрата по банерах тут очікувана
// й нормальна; порівнювати їх можна за CTR/CPM на рівні оголошення.
//
// Lookalike не беремо — на нових клубах 0 покупок (144) і нестабільно далі.
//
// Все PAUSED. Usage: node tools/build_043_odessa.js plan | build | verify
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const G = require('./meta_guard');
const { apiGet, apiPost } = require('./meta_api');
const { refreshDropboxToken, dropboxRequest } = require('./dropbox_reader');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const IG_ID = process.env.META_INSTAGRAM_ACTOR_ID || '17841447539432480';
const PIXEL_ID = '393751978682816';
const EXCLUDE_BUYERS = '120208237776480193';

const CAMPAIGN_NAME = 'AI_Apollo_sales_Odessa_043_2710';
const ADSET_NAME = 'Odessa_043_advantage_18-65';
const CLUB_URL = 'https://apollo.online/clubs/apollo-next-043/';
const TITLE = 'Новий APOLLO NEXT 043 в Одесі — відкриття 03.12';
const CTA = 'APPLY_NOW';
const START = '2026-10-27T00:01:00+0200';
const END   = '2026-12-02T23:59:00+0200';
const DAYS = 37;
const TOTAL = 4000;
const DAILY = Math.round(TOTAL / DAYS * 100);      // центи
const ATTRIBUTION = [{ event_type: 'CLICK_THROUGH', window_days: 7 }, { event_type: 'VIEW_THROUGH', window_days: 1 }];
const URL_TAGS = 'utm_source=facebook&utm_medium=conversion&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';
const DROPBOX = 'https://www.dropbox.com/scl/fo/s0kda1gj90d817ohqpjyo/AEx1Kvxsj2sugHa9HFs4fI8?rlkey=unlnn19vzlp42z685fveks0pt&e=1&dl=0';
const MANIFEST = path.join(__dirname, '../history/club043_manifest.json');

const CONCEPTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const files = n => ({ sq: `square${n}.jpg`, st: `stories${n}.jpg`, h: `h${n}.jpg` });

// Advantage+ з авто-плейсментами: publisher_platforms НЕ задаємо, Meta обирає
// сама. Гео й виключення покупців лишаються під нашим контролем.
const TARGETING = {
  age_min: 18, age_max: 65,
  excluded_custom_audiences: [{ id: EXCLUDE_BUYERS }],
  geo_locations: {
    custom_locations: [{
      latitude: 46.3962695, longitude: 30.7241711,
      radius: 3, distance_unit: 'kilometer', country: 'UA',
    }],
    location_types: ['home', 'recent'],
  },
  targeting_automation: { advantage_audience: 1, individual_setting: { geo: 0 } },
};

// «Новий» на початку — в Одесі вже працюють 036 і 037, треба відрізнити
const BODY = `🔥 Новий APOLLO NEXT 043 в Одесі — вул. Академіка Корольова, 43-Є.

Відкриття 3 грудня. Третій клуб мережі в місті — спорт простір, де тіло, розклад і навіть настрій працюють на тебе.

▫️ 48 групових тренувань на тиждень
▫️ План тренувань і харчування
▫️ Безкоштовне перше тренування з тренером
▫️ Автоматизований вхід — без черг
▫️ Простір без хейту, лише підтримка й твій темп

Ціна до відкриття: 299 ₴ замість 1149 ₴ за перші 4 тижні.
Пропозиція діє до 02.12.2026.

Забирай ціну відкриття, поки вона діє.`;

const RULES = [
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'] }, image_label: { name: 'st_img' }, priority: 1 },
  { customization_spec: { publisher_platforms: ['facebook'], facebook_positions: ['right_hand_column', 'instream_video', 'marketplace'] }, image_label: { name: 'h_img' }, priority: 2 },
  { customization_spec: {}, image_label: { name: 'sq_img' }, priority: 3 },
];

function plan() {
  console.log(`\n${CAMPAIGN_NAME}\n`);
  console.log(`📂 ${ADSET_NAME} — ОДНА група`);
  console.log(`   $${(DAILY / 100).toFixed(2)}/день × ${DAYS} днів = $${(DAILY / 100 * DAYS).toFixed(0)}`);
  console.log(`   Advantage+ 18-65 · коло 3 км навколо 46.3963, 30.7242 · авто-плейсменти`);
  console.log(`   виключено покупців за 180 днів · атрибуція 7d click + 1d view`);
  console.log(`   ${START.slice(0, 10)} → ${END.slice(0, 10)} (відкриття 03.12)`);
  console.log(`\n   ${CONCEPTS.length} банерів × 3 формати:`);
  console.log(`   ${CONCEPTS.map(n => '2710_' + n).join(', ')}`);
  console.log(`\n   прогноз: ~30 конверсій/тиждень в одній групі проти 2.9 у 144 на 9 групах`);
  console.log('\n(plan — нічого не створено)');
}

async function uploadBanners() {
  const man = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  const need = CONCEPTS.flatMap(n => Object.values(files(n)));
  if (need.every(f => man[f])) { console.log('♻️  усі 27 банерів уже залиті'); return man; }
  await refreshDropboxToken();
  for (const f of need) {
    if (man[f]) continue;
    const r = await dropboxRequest(t => axios({ method: 'post', url: 'https://content.dropboxapi.com/2/sharing/get_shared_link_file',
      headers: { Authorization: `Bearer ${t}`, 'Dropbox-API-Arg': JSON.stringify({ url: DROPBOX, path: '/' + f }), 'Content-Type': '' },
      data: '', responseType: 'arraybuffer', maxContentLength: 50 * 1024 * 1024 }));
    const up = await apiPost(`${ACCT}/adimages`, { bytes: Buffer.from(r.data).toString('base64'), name: `c043_${f}` });
    if (up.error) throw new Error(`${f}: ${G.errMsg(up.error)}`);
    man[f] = Object.values(up.images || {})[0].hash;
    fs.writeFileSync(MANIFEST, JSON.stringify(man, null, 2));
    console.log(`  ⬆️ ${f} → ${man[f].slice(0, 12)}…`);
  }
  return man;
}

async function build() {
  const img = await uploadBanners();
  const all = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '400' })).data || [];
  const prior = all.find(x => x.name === CAMPAIGN_NAME);
  const camp = prior || await G.createChecked(`${ACCT}/campaigns`, {
    name: CAMPAIGN_NAME, objective: 'OUTCOME_SALES', buying_type: 'AUCTION',
    special_ad_categories: JSON.stringify([]), is_adset_budget_sharing_enabled: 'false', status: 'PAUSED',
  }, 'campaign');
  console.log(`\n📁 ${CAMPAIGN_NAME} — ${camp.id}${prior ? ' (наявна)' : ''}`);

  const liveSets = (await apiGet(`${camp.id}/adsets`, { fields: 'id,name', limit: '10' })).data || [];
  const adset = liveSets.find(x => x.name === ADSET_NAME) || await G.createAdSet({
    name: ADSET_NAME, campaign_id: camp.id,
    optimization_goal: 'OFFSITE_CONVERSIONS', billing_event: 'IMPRESSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    daily_budget: String(DAILY),
    promoted_object: JSON.stringify({ pixel_id: PIXEL_ID, custom_event_type: 'PURCHASE' }),
    attribution_spec: JSON.stringify(ATTRIBUTION),
    targeting: TARGETING,
    start_time: START, end_time: END,
  });
  console.log(`  📂 ${ADSET_NAME} — ${adset.id} | $${(DAILY / 100).toFixed(2)}/д`);

  const liveAds = (await apiGet(`${adset.id}/ads`, { fields: 'id,name', limit: '30' })).data || [];
  const made = [];
  for (const n of CONCEPTS) {
    const nm = `2710_${n}`;
    if (liveAds.find(x => x.name === nm)) { console.log(`     ⏭  ${nm} вже є`); continue; }
    const f = files(n);
    const cr = await G.createChecked(`${ACCT}/adcreatives`, {
      name: `${nm}_creative`,
      object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
      asset_feed_spec: JSON.stringify({
        images: [
          { hash: img[f.sq], adlabels: [{ name: 'sq_img' }] },
          { hash: img[f.st], adlabels: [{ name: 'st_img' }] },
          { hash: img[f.h],  adlabels: [{ name: 'h_img' }] },
        ],
        bodies: [{ text: BODY }], titles: [{ text: TITLE }], descriptions: [{ text: '' }],
        link_urls: [{ website_url: CLUB_URL, display_url: 'apollo.online' }],
        call_to_action_types: [CTA], ad_formats: ['AUTOMATIC_FORMAT'], optimization_type: 'PLACEMENT',
        asset_customization_rules: RULES,
      }),
      url_tags: URL_TAGS,
    }, `creative ${nm}`);
    const ad = await G.createAd({ name: nm, adset_id: adset.id, creative: { creative_id: cr.id } });
    console.log(`     ✅ ${nm} — ${ad.id}`);
    made.push({ id: ad.id, name: nm, creativeId: cr.id, hashes: [img[f.sq], img[f.st], img[f.h]] });
  }

  console.log('\n🔍 Звірка:');
  let bad = 0;
  for (const m of made) {
    const v = await G.verifyAd(m.id, { creativeId: m.creativeId, imageHashes: m.hashes, link: CLUB_URL });
    if (!v.ok) bad++;
    if (m === made[0] || !v.ok) {
      const p = await G.checkPreviews(m.id, ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY', 'DESKTOP_FEED_STANDARD']);
      console.log(`   ${v.ok && p.ok ? '✅' : '❌'} ${m.name} ${v.status} | ${v.problems.join(';') || 'дані ок'} | ${p.INSTAGRAM_STANDARD}/${p.INSTAGRAM_STORY}/${p.DESKTOP_FEED_STANDARD}`);
    }
  }
  console.log(`   ${bad ? '❌ ' + bad + ' оголошень із розбіжностями' : '✅ усі ' + made.length + ' оголошень звірені'}`);

  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  hist.push({ date: '2026-10-26', campaign_name: CAMPAIGN_NAME, campaign_id: camp.id,
    note: `Запуск клубу 043 (Одеса). ОДНА група Advantage+ 18-65, коло 3 км, $${(DAILY/100).toFixed(2)}/д × ${DAYS} днів = $${(DAILY/100*DAYS).toFixed(0)}. 9 банерів × 3 формати в одній групі. Консолідація замість дроблення: у попередніх запусках жодна група не виходила з навчання (2.9/0.9/0.1 конверсій на тиждень при порозі 50). Атрибуція 7d click + 1d view. PAUSED.` });
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));

  await verify();
  console.log('\n✅ Готово — PAUSED.');
}

async function verify() {
  const all = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '400' })).data || [];
  const c = all.find(x => x.name === CAMPAIGN_NAME);
  if (!c) throw new Error('кампанію не знайдено');
  const s = (await apiGet(`${c.id}/adsets`, { fields: 'id,name,status,daily_budget,attribution_spec,targeting,start_time,end_time,optimization_goal', limit: '10' })).data || [];
  for (const a of s) {
    const ads = (await apiGet(`${a.id}/ads`, { fields: 'id', limit: '30' })).data || [];
    const t = a.targeting;
    const att = (a.attribution_spec || []).map(x => (x.event_type === 'CLICK_THROUGH' ? 'click' : 'view') + x.window_days + 'd').join('+');
    const g = t.geo_locations.custom_locations[0];
    console.log(`\n📊 ${c.name}`);
    console.log(`   ${a.name}  $${(+a.daily_budget / 100).toFixed(2)}/д  ${a.status}`);
    console.log(`   ${a.optimization_goal} · ${att} · advantage=${t.targeting_automation.advantage_audience} · ${t.age_min}-${t.age_max}`);
    console.log(`   коло ${g.radius} км (${g.latitude}, ${g.longitude}) · плейсменти: ${t.publisher_platforms ? JSON.stringify(t.publisher_platforms) : 'авто'}`);
    console.log(`   ${a.start_time.slice(0, 10)} → ${a.end_time.slice(0, 10)} · оголошень ${ads.length}`);
    console.log(`   разом $${(+a.daily_budget / 100 * DAYS).toFixed(0)}`);
  }
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'build') await build();
  else if (cmd === 'verify') await verify();
  else plan();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
