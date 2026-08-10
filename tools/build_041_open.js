// AI_Apollo_sales_ZHY_041_1308 — кампанія після відкриття клубу 041 (Житомир, 13.08.2026).
// 7 концептів × 3 формати (16:9 / 1:1 / 9:16) = 21 файл, кожне оголошення адаптивне.
// 4 групи: local A/B + advantage A/B. Розбивка 4+3 креативи на групу — щоб Meta
// не злила покази в одне оголошення (config/rules.md → ПРАВИЛО КРЕАТИВІВ).
// Оффер з банерів: 299 ₴ замість 999 ₴ за перші 4 тижні, акція 13.08–31.08.2026.
// Все PAUSED. Usage: node tools/build_041_open.js plan | build
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { apiGet: rawGet, apiPost: rawPost } = require('./meta_api');
const { refreshDropboxToken, dropboxRequest } = require('./dropbox_reader');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const IG_ID = process.env.META_INSTAGRAM_ACTOR_ID;
const PIXEL_ID = '393751978682816';
const DROPBOX_LINK = 'https://www.dropbox.com/scl/fo/gq07bni68f1x719z1wkwr/AGsBRj1Mq6I68cp76yIKgd4?rlkey=x7078rodmxgx7yc4mmwla8o2d&dl=0';
const CLUB_URL = 'https://apollo.online/clubs/apollo-next-041-yarmarok/';
const DISPLAY_URL = 'apollo.online';
const CAMPAIGN_NAME = 'AI_Apollo_sales_ZHY_041_1308';
const START_TIME = '2026-08-13T00:01:00+0300';
const END_TIME = '2026-08-31T23:59:00+0300';
const TITLE = 'APOLLO NEXT 041 вже відкрито';
const CTA = 'APPLY_NOW';
const URL_TAGS = 'utm_source=facebook&utm_medium=conversion&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';
const EXCLUDE_BUYERS = '120208237776480193'; // А покупка 180 дней

const BODY_CLUB = `🔥 APOLLO NEXT 041 у Житомирі вже відкрито!

майдан Згоди, 6 (ТРЦ ЯРМАРОК) — спорт простір, де тіло, розклад і навіть настрій працюють на тебе.

Ви просили — ми продовжили найнижчу ціну відкриття:
299 ₴ замість 999 ₴ за перші 4 тижні. Акція діє з 13.08 до 31.08.2026.

▫️ Понад 48 групових програм
▫️ Smart-запис через застосунок
▫️ Автоматизований вхід — без черг
▫️ Сертифіковані тренери й простір без хейту

Забирай ціну відкриття, поки вона діє.`;

const BODY_PEOPLE = `Ви просили — ми продовжили 🤝

299 ₴ замість 999 ₴ за перші 4 тижні у новому APOLLO NEXT 041.
майдан Згоди, 6, Житомир — вже відкрито.

Тут не тиснуть і не оцінюють: простір, техніка й тренери, з якими зручно почати — у своєму темпі.
Максимум гнучкості, мінімум зобов'язань.

Акція діє до 31.08.2026. Далі — повна ціна.`;

// 7 концептів. set: A — клуб зсередини + темна мапа, B — люди + помаранчева мапа
const CONCEPTS = [
  { n: 1, set: 'A', desc: 'інтерʼєр: функціональна зона', body: BODY_CLUB },
  { n: 2, set: 'A', desc: 'інтерʼєр: тренажери біля входу', body: BODY_CLUB },
  { n: 3, set: 'A', desc: 'інтерʼєр: кардіо + функціонал', body: BODY_CLUB },
  { n: 6, set: 'A', desc: 'мапа, темна', body: BODY_CLUB },
  { n: 4, set: 'B', desc: 'люди: пара', body: BODY_PEOPLE },
  { n: 5, set: 'B', desc: 'люди: штанга', body: BODY_PEOPLE },
  { n: 7, set: 'B', desc: 'мапа, помаранчева', body: BODY_PEOPLE },
];
const files = c => ({ h: `h${c.n}.jpg`, s: `s${c.n}.jpg`, st: `stories${c.n}.jpg` });

const GEO = {
  cities: [{ key: '2401072', country: 'UA', region_id: '3804', distance_unit: 'mile' }],
  location_types: ['home', 'recent']
};
// local — явні плейсменти, включно з тими, де живе 16:9 (right column / instream / marketplace)
const LOCAL_TARGETING = {
  age_min: 18, age_max: 50,
  geo_locations: GEO,
  excluded_custom_audiences: [{ id: EXCLUDE_BUYERS }],
  targeting_automation: { advantage_audience: 0, individual_setting: { geo: 0 } },
  publisher_platforms: ['facebook', 'instagram', 'threads'],
  facebook_positions: ['feed', 'story', 'facebook_reels', 'right_hand_column', 'instream_video', 'marketplace'],
  instagram_positions: ['stream', 'story', 'reels', 'explore', 'explore_home', 'profile_feed'],
  threads_positions: ['threads_stream'],
  device_platforms: ['mobile', 'desktop'],
};
// advantage — автоматичні плейсменти (як у живих advantage-групах 041)
const ADV_TARGETING = {
  age_min: 18, age_max: 65,
  geo_locations: GEO,
  excluded_custom_audiences: [{ id: EXCLUDE_BUYERS }],
  targeting_automation: { advantage_audience: 1, individual_setting: { geo: 0 } },
};

const ADSETS = [
  { name: 'local_ZHY_A', budget: 4000, set: 'A', targeting: LOCAL_TARGETING },
  { name: 'local_ZHY_B', budget: 4000, set: 'B', targeting: LOCAL_TARGETING },
  { name: 'advantage_ZHY_A', budget: 3000, set: 'A', targeting: ADV_TARGETING },
  { name: 'advantage_ZHY_B', budget: 3000, set: 'B', targeting: ADV_TARGETING },
];

// 9:16 у сторіс/рілс, 16:9 туди де він рендериться, 1:1 — усе інше (дефолт)
const RULES = [
  {
    customization_spec: {
      publisher_platforms: ['facebook', 'instagram'],
      facebook_positions: ['story', 'facebook_reels'],
      instagram_positions: ['story', 'reels']
    },
    image_label: { name: 'st_img' }, priority: 1
  },
  {
    customization_spec: {
      publisher_platforms: ['facebook'],
      facebook_positions: ['right_hand_column', 'instream_video', 'marketplace']
    },
    image_label: { name: 'h_img' }, priority: 2
  },
  { customization_spec: {}, image_label: { name: 'sq_img' }, priority: 3 },
];

const CALL_TIMEOUT_MS = 120000;
const CALL_TRIES = 3;
function withTimeout(p, label) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout: ${label}`)), CALL_TIMEOUT_MS))]);
}
async function retry(fn, label) {
  let last;
  for (let i = 1; i <= CALL_TRIES; i++) {
    try { return await withTimeout(fn(), label); }
    catch (e) { last = e; console.log(`   ⏳ ${label} ${i}/${CALL_TRIES}: ${e.message}`); await new Promise(r => setTimeout(r, 3000 * i)); }
  }
  throw last;
}
const apiGet = (p, params) => retry(() => rawGet(p, params), `GET ${p}`);
const apiPost = (p, params) => retry(() => rawPost(p, params), `POST ${p}`);

async function download(fileName) {
  const r = await retry(() => dropboxRequest(token => axios({
    method: 'post',
    url: 'https://content.dropboxapi.com/2/sharing/get_shared_link_file',
    headers: {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({ url: DROPBOX_LINK, path: '/' + fileName }),
      'Content-Type': ''
    },
    data: '', responseType: 'arraybuffer', maxContentLength: 50 * 1024 * 1024
  })), `dropbox ${fileName}`);
  return Buffer.from(r.data);
}

async function uploadImage(buffer, name) {
  const r = await apiPost(`${ACCT}/adimages`, { bytes: buffer.toString('base64'), name });
  if (r.error) throw new Error(`image ${name}: ${r.error.message}`);
  const img = Object.values(r.images || {})[0];
  if (!img) throw new Error('Meta не повернув hash для ' + name);
  return img.hash;
}

function creativeSpec(c, hashes) {
  return {
    images: [
      { hash: hashes.s, adlabels: [{ name: 'sq_img' }] },
      { hash: hashes.st, adlabels: [{ name: 'st_img' }] },
      { hash: hashes.h, adlabels: [{ name: 'h_img' }] },
    ],
    bodies: [{ text: c.body }],
    titles: [{ text: TITLE }],
    descriptions: [{ text: '' }],
    link_urls: [{ website_url: CLUB_URL, display_url: DISPLAY_URL }],
    call_to_action_types: [CTA],
    ad_formats: ['AUTOMATIC_FORMAT'],
    optimization_type: 'PLACEMENT',
    asset_customization_rules: RULES,
  };
}

function plan() {
  console.log(`\n${CAMPAIGN_NAME} — OUTCOME_SALES / PURCHASE, ABO`);
  console.log(`старт ${START_TIME} | кінець ${END_TIME}\n`);
  let total = 0;
  for (const a of ADSETS) {
    total += a.budget;
    const set = CONCEPTS.filter(c => c.set === a.set);
    const t = a.targeting === LOCAL_TARGETING ? 'Житомир 18-50, детальний off, явні плейсменти' : 'Advantage+ 18-65, авто-плейсменти';
    console.log(`📂 ${a.name} — $${a.budget / 100}/д | ${t}`);
    set.forEach(c => {
      const f = files(c);
      console.log(`   • 1308_${c.n} (${c.desc}) — ${f.s} / ${f.st} / ${f.h}`);
    });
  }
  console.log(`\nРазом: ${ADSETS.length} груп, ${ADSETS.reduce((n, a) => n + CONCEPTS.filter(c => c.set === a.set).length, 0)} оголошень, $${total / 100}/день`);
  console.log(`Унікальних креативів: ${CONCEPTS.length} × 3 формати = ${CONCEPTS.length * 3} файлів`);
  console.log('\n(plan — нічого не створено)');
}

async function build() {
  console.log('🔄 Dropbox...');
  await refreshDropboxToken();

  // 21 файл → hash, по одному разу на файл
  const hashes = {};
  for (const c of CONCEPTS) {
    const f = files(c);
    hashes[c.n] = {};
    for (const [kind, fname] of Object.entries(f)) {
      const buf = await download(fname);
      hashes[c.n][kind] = await uploadImage(buf, `041_1308_${fname}`);
      console.log(`  ⬆️ ${fname} → ${hashes[c.n][kind].slice(0, 12)}…`);
    }
  }

  const camp = await apiPost(`${ACCT}/campaigns`, {
    name: CAMPAIGN_NAME,
    objective: 'OUTCOME_SALES',
    buying_type: 'AUCTION',
    special_ad_categories: JSON.stringify([]),
    is_adset_budget_sharing_enabled: 'false',
    status: 'PAUSED'
  });
  if (camp.error) throw new Error('campaign: ' + camp.error.message);
  console.log('\n📁 campaign', camp.id);

  // креатив на концепт, переиспользується в обох аудиторіях
  const creativeIds = {};
  for (const c of CONCEPTS) {
    const r = await apiPost(`${ACCT}/adcreatives`, {
      name: `1308_${c.n}_creative`,
      object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
      asset_feed_spec: JSON.stringify(creativeSpec(c, hashes[c.n])),
      url_tags: URL_TAGS
    });
    if (r.error) throw new Error(`creative 1308_${c.n}: ${r.error.error_user_msg || r.error.message}`);
    creativeIds[c.n] = r.id;
    console.log(`  🎨 1308_${c.n} — creative ${r.id}`);
  }

  const entry = { date: '2026-08-10', campaign_name: CAMPAIGN_NAME, campaign_id: camp.id, adsets: [], ads_count: 0 };

  for (const a of ADSETS) {
    const adset = await apiPost(`${ACCT}/adsets`, {
      name: a.name,
      campaign_id: camp.id,
      optimization_goal: 'OFFSITE_CONVERSIONS',
      billing_event: 'IMPRESSIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      daily_budget: String(a.budget),
      promoted_object: JSON.stringify({ pixel_id: PIXEL_ID, custom_event_type: 'PURCHASE' }),
      targeting: JSON.stringify(a.targeting),
      start_time: START_TIME,
      end_time: END_TIME,
      status: 'PAUSED'
    });
    if (adset.error) throw new Error(`adset ${a.name}: ${adset.error.error_user_msg || adset.error.message}`);
    console.log(`\n  📂 ${a.name} — ${adset.id} | $${a.budget / 100}/д`);

    for (const c of CONCEPTS.filter(x => x.set === a.set)) {
      const ad = await apiPost(`${ACCT}/ads`, {
        name: `1308_${c.n}`,
        adset_id: adset.id,
        creative: JSON.stringify({ creative_id: creativeIds[c.n] }),
        status: 'PAUSED'
      });
      if (ad.error) throw new Error(`ad 1308_${c.n} in ${a.name}: ${ad.error.error_user_msg || ad.error.message}`);
      console.log(`     ✅ 1308_${c.n} — ad ${ad.id}`);
      entry.ads_count++;
    }
    entry.adsets.push({ name: a.name, id: adset.id, budget_usd: a.budget / 100, ads: CONCEPTS.filter(x => x.set === a.set).length });
  }

  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  entry.note = 'Кампанія після відкриття 041 (13.08). 7 концептів × 3 формати, адаптив. 4 групи: local A/B + advantage A/B, розбивка креативів 4+3. Оффер 299 ₴ замість 999 ₴, акція 13.08–31.08.';
  hist.push(entry);
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));

  console.log(`\n✅ DONE — ${entry.adsets.length} груп / ${entry.ads_count} оголошень, все PAUSED, старт ${START_TIME}`);
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'plan') plan();
  else if (cmd === 'build') await build();
  else console.log('cmd: plan | build');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
