// AI_Apollo_sales_countdown_Kyiv_144_1410 — каунтдаун до відкриття клубу 144
// (Харківське шосе, 144; відкриття 22.10.2026).
//
// Підхід і бюджети — з каунтдауну 041 (AI_Apollo_sales_countdown_ZHY_041_0608):
// одна група = один день, бюджет росте до дня відкриття. У 041 було 7 днів
// і $1650; тут креативів на 8 днів, тому додано ще один день за найнижчою
// ставкою: $150·4 + $200 + $250 + $350 + $400 = $1800.
//
// Гео — коло 3 км навколо клубу (у 041 було місто цілком; тут за вказівкою).
//
// ⚠️ Одна свідома відмінність від еталона: attribution_spec = 7d click + 1d view.
// У 041 його не задали, і Meta мовчки поставила 7d click без view-вікна
// (див. docs/LESSONS.md, subcode 1504040 — потім не виправити).
//
// Все PAUSED. Usage: node tools/build_144_countdown.js plan | build | verify
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

const CAMPAIGN_NAME = 'AI_Apollo_sales_countdown_Kyiv_144_1410';
const CLUB_URL = 'https://apollo.online/clubs/apollo-next-144/';
const TITLE = 'Новий APOLLO NEXT 144 на Харківському шосе';
const CTA = 'APPLY_NOW';
const URL_TAGS = 'utm_source=facebook&utm_medium=conversion&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';
const ATTRIBUTION = [{ event_type: 'CLICK_THROUGH', window_days: 7 }, { event_type: 'VIEW_THROUGH', window_days: 1 }];
const DROPBOX = 'https://www.dropbox.com/scl/fo/x5txvxszwxg9dfjg7agti/ALef_jJB2n8-59zFT6yIGC8?dl=0&e=1&rlkey=vpgivqi4h14gnadok74re14bs';
const MANIFEST = path.join(__dirname, '../history/club144_countdown_manifest.json');

// Коло 3 км навколо клубу. Радіус навколо МІСТА не можна <17 км (1487110),
// тому тільки custom_locations.
const GEO = {
  custom_locations: [{
    latitude: 50.421631, longitude: 30.651099,
    radius: 3, distance_unit: 'kilometer',
    primary_city_id: 2373594, region_id: 4290, country: 'UA',
  }],
  location_types: ['home', 'recent'],
};

const TARGETING = {
  age_min: 18, age_max: 50,
  excluded_custom_audiences: [{ id: EXCLUDE_BUYERS }],
  geo_locations: GEO,
  brand_safety_content_filter_levels: ['FEED_RELAXED'],
  targeting_automation: { advantage_audience: 0, individual_setting: { geo: 0 } },
  publisher_platforms: ['facebook', 'instagram', 'threads'],
  facebook_positions: ['feed'],
  instagram_positions: ['stream', 'story', 'explore', 'explore_home'],
  threads_positions: ['threads_stream'],
  device_platforms: ['mobile', 'desktop'],
};

// file — номер файлу; days — скільки днів до відкриття; subs — лічильник на банері
const DAYS = [
  { file: 1, days: 8, date: '2026-10-14', budget: 15000, subs: 160, hook: 'Новий зал, де фітнес звучить як майбутнє.' },
  { file: 2, days: 7, date: '2026-10-15', budget: 15000, subs: 99,  hook: 'APOLLO NEXT 144 вже ось-ось засяє.' },
  { file: 3, days: 6, date: '2026-10-16', budget: 15000, subs: 72,  hook: 'Шість днів до відкриття — пора збирати речі в зал.' },
  { file: 4, days: 5, date: '2026-10-17', budget: 15000, subs: 62,  hook: 'Фінальний розгін перед запуском APOLLO NEXT 144.' },
  { file: 5, days: 4, date: '2026-10-18', budget: 20000, subs: 55,  hook: 'Чотири дні до твоєї нової фітнес-звички.' },
  { file: 6, days: 3, date: '2026-10-19', budget: 25000, subs: 31,  hook: 'Ще три дні — і двері APOLLO NEXT 144 відчиняться.' },
  { file: 7, days: 2, date: '2026-10-20', budget: 35000, subs: 24,  hook: 'Вже через 48 годин ми запускаємо APOLLO NEXT 144.' },
  { file: 8, days: 1, date: '2026-10-21', budget: 40000, subs: 5,   hook: 'Завтра APOLLO NEXT 144 відчиняє двері.' },
];

const adsetName = d => `${d.days}_day`;
const startTime = d => `${d.date}T00:01:00+0300`;
const endTime = d => {
  // опівдні UTC, щоб перехід на наступну добу не зʼїхав через часовий пояс
  const nx = new Date(d.date + 'T12:00:00Z');
  nx.setUTCDate(nx.getUTCDate() + 1);
  return nx.toISOString().slice(0, 10) + 'T00:01:00+0300';
};

const body = d => `🔥 ${d.hook}

APOLLO NEXT 144 — це більше, ніж спортзал. Це твій апгрейд до простору, де тіло, розклад і настрій працюють на тебе.

✨ Профі тренери, що не кричать, а підтримують
✨ Тренажери, що не риплять, а мотивують
✨ Простір, де можна бути собою і ставати кращим

Ціна до відкриття: 299 ₴ замість 1249 ₴ за перші 4 тижні.
Було 160 підписок — лишилось ${d.subs}.

Київ, Харківське шосе, 144 — відкриття 22.10.
${d.days === 1 ? 'Останній день за ціною відкриття. Ти з нами?' : `${d.days} дн${d.days < 5 ? 'і' : 'ів'} до старту. Ти з нами?`}`;

const RULES = [
  { customization_spec: { publisher_platforms: ['instagram'], instagram_positions: ['story'] }, image_label: { name: 'st_img' }, priority: 1 },
  { customization_spec: {}, image_label: { name: 'sq_img' }, priority: 2 },
];

function plan() {
  console.log(`\n${CAMPAIGN_NAME} — каунтдаун до 22.10\n`);
  console.log('   коло 3 км навколо 50.421631, 30.651099 · 18-50 · виключено покупців 180д');
  console.log('   атрибуція 7d click + 1d view (у 041 була дефолтна 7d click)\n');
  let tot = 0;
  for (const d of DAYS) {
    tot += d.budget;
    console.log(`   📂 ${adsetName(d).padEnd(7)} ${d.date}  $${String(d.budget / 100).padStart(3)}/д  банер square0${d.file}+stories0${d.file}  (${d.subs}/160)`);
  }
  console.log(`\n   разом $${tot / 100} за 8 днів   (041: $1650 за 7 днів)`);
  console.log('\n(plan — нічого не створено)');
}

async function uploadBanners() {
  const man = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  const need = DAYS.flatMap(d => [`square0${d.file}.jpg`, `stories0${d.file}.jpg`]);
  if (need.every(f => man[f])) { console.log('♻️  усі 16 банерів уже залиті'); return man; }
  await refreshDropboxToken();
  for (const f of need) {
    if (man[f]) continue;
    const r = await dropboxRequest(t => axios({ method: 'post', url: 'https://content.dropboxapi.com/2/sharing/get_shared_link_file',
      headers: { Authorization: `Bearer ${t}`, 'Dropbox-API-Arg': JSON.stringify({ url: DROPBOX, path: '/' + f }), 'Content-Type': '' },
      data: '', responseType: 'arraybuffer', maxContentLength: 50 * 1024 * 1024 }));
    const up = await apiPost(`${ACCT}/adimages`, { bytes: Buffer.from(r.data).toString('base64'), name: `cd144_${f}` });
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

  const liveSets = (await apiGet(`${camp.id}/adsets`, { fields: 'id,name', limit: '20' })).data || [];
  const made = [];
  for (const d of DAYS) {
    const nm = adsetName(d);
    const adset = liveSets.find(x => x.name === nm) || await G.createAdSet({
      name: nm, campaign_id: camp.id,
      optimization_goal: 'OFFSITE_CONVERSIONS', billing_event: 'IMPRESSIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      daily_budget: String(d.budget),
      promoted_object: JSON.stringify({ pixel_id: PIXEL_ID, custom_event_type: 'PURCHASE' }),
      attribution_spec: JSON.stringify(ATTRIBUTION),
      targeting: TARGETING,
      start_time: startTime(d), end_time: endTime(d),
    });
    console.log(`  📂 ${nm.padEnd(7)} ${adset.id} | $${d.budget / 100}/д | ${d.date}`);

    const liveAds = (await apiGet(`${adset.id}/ads`, { fields: 'id,name', limit: '10' })).data || [];
    if (liveAds.find(x => x.name === nm)) { console.log(`     ⏭  ${nm} вже є`); continue; }
    const cr = await G.createChecked(`${ACCT}/adcreatives`, {
      name: `${nm}_144_creative`,
      object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
      asset_feed_spec: JSON.stringify({
        images: [
          { hash: img[`square0${d.file}.jpg`],  adlabels: [{ name: 'sq_img' }] },
          { hash: img[`stories0${d.file}.jpg`], adlabels: [{ name: 'st_img' }] },
        ],
        bodies: [{ text: body(d) }], titles: [{ text: TITLE }], descriptions: [{ text: '' }],
        link_urls: [{ website_url: CLUB_URL, display_url: 'apollo.online' }],
        call_to_action_types: [CTA],
        ad_formats: ['AUTOMATIC_FORMAT'], optimization_type: 'PLACEMENT',
        asset_customization_rules: RULES,
      }),
      url_tags: URL_TAGS,
    }, `creative ${nm}`);
    const ad = await G.createAd({ name: nm, adset_id: adset.id, creative: { creative_id: cr.id } });
    console.log(`     ✅ ${nm} — ${ad.id}`);
    made.push({ id: ad.id, name: nm, creativeId: cr.id, hashes: [img[`square0${d.file}.jpg`], img[`stories0${d.file}.jpg`]] });
  }

  console.log('\n🔍 Звірка:');
  for (const m of made) {
    const v = await G.verifyAd(m.id, { creativeId: m.creativeId, imageHashes: m.hashes, link: CLUB_URL });
    const p = await G.checkPreviews(m.id, ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY']);
    console.log(`   ${v.ok && p.ok ? '✅' : '❌'} ${m.name.padEnd(7)} ${v.status} | ${v.problems.join(';') || 'дані ок'} | ${p.INSTAGRAM_STANDARD}/${p.INSTAGRAM_STORY}`);
  }

  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  hist.push({ date: '2026-10-13', campaign_name: CAMPAIGN_NAME, campaign_id: camp.id,
    note: 'Каунтдаун клубу 144: 8 груп по одному дню 14-21.10, бюджет $150→$400, разом $1800. Коло 3 км навколо клубу, 18-50. Атрибуція 7d click + 1d view (на відміну від 041). Все PAUSED.' });
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));

  await verify();
  console.log('\n✅ Готово — все PAUSED.');
}

async function verify() {
  const all = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '400' })).data || [];
  const c = all.find(x => x.name === CAMPAIGN_NAME);
  if (!c) throw new Error('кампанію не знайдено');
  const s = (await apiGet(`${c.id}/adsets`, { fields: 'name,status,daily_budget,start_time,end_time,attribution_spec,targeting', limit: '20' })).data || [];
  console.log(`\n📊 ${CAMPAIGN_NAME}:`);
  let tot = 0;
  for (const a of s.sort((x, y) => (+y.name.split('_')[0]) - (+x.name.split('_')[0]))) {
    tot += +a.daily_budget;
    const att = (a.attribution_spec || []).map(x => (x.event_type === 'CLICK_THROUGH' ? 'click' : 'view') + x.window_days + 'd').join('+');
    const g = a.targeting.geo_locations.custom_locations[0];
    console.log(`   ${a.name.padEnd(7)} $${String((+a.daily_budget / 100)).padStart(3)}/д  ${a.start_time.slice(0, 10)} → ${a.end_time.slice(0, 10)}  ${a.status.padEnd(7)} ${att}  коло ${g.radius}км`);
  }
  console.log(`   ${''.padEnd(7)} ─────`);
  console.log(`   ${'разом'.padEnd(7)} $${tot / 100} за 8 днів`);
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'build') await build();
  else if (cmd === 'verify') await verify();
  else plan();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
