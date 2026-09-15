// Додає в живу кампанію A_Coach_1603 локальну групу під клуб 144
// (Харківське шосе, 144, Київ) і виключає це саме коло з київської групи,
// щоб вони не конкурували за тих самих людей.
//
// Група coach_144_local — копія coach_kyiv, у якій підмінено лише гео:
// замість Київської області коло 3 км навколо клубу. Решта (вік 18-45,
// виключення покупців 180 днів, плейсменти, кастомна конверсія
// dyakuyemo-treneram) переноситься дослівно з живої групи.
//
// Креативи — 3 банери під 144 («Шукаємо тренерів у APOLLO NEXT 144»),
// кожен адаптивний: квадрат у стрічку, вертикаль у сторіс/рілс.
//
// Нова група PAUSED. Виключення в coach_kyiv застосовується одразу —
// без нього дві групи перетиналися б.
// Usage: node tools/add_coach_144.js plan | build | exclude | verify
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

const CAMPAIGN_ID = '120241053870420193';   // A_Coach_1603
const KYIV_ADSET = '120241053870480193';    // coach_kyiv — еталон і джерело виключення
const ADSET_NAME = 'coach_144_local';
const DAILY_BUDGET = 1500;                  // $15/д — як у київської групи
const AD_DATE = '1509';

const TYPEFORM = 'https://apollonext.typeform.com/to/DhIfKEAK';
const DISPLAY_URL = 'apollo.online';
const TITLE = 'Шукаємо тренерів у APOLLO NEXT 144';
const CTA = 'LEARN_MORE';
const URL_TAGS = 'utm_source=facebook&utm_medium=conversion&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}';
const DROPBOX_LINK = 'https://www.dropbox.com/scl/fo/2r0ltjuwf30b6ac7lq53i/ACM-n5X3o0AFnbKzUtwmfNc?dl=0&e=1&rlkey=nv7lp68y1gfigftariz506qwj';
const MANIFEST = path.join(__dirname, '../history/coach144_manifest.json');

// Харківське шосе, 144 — коло 3 км
const GEO_144 = {
  custom_locations: [{
    latitude: 50.421631, longitude: 30.651099,
    radius: 3, distance_unit: 'kilometer',
    primary_city_id: 2373594, region_id: 4290, country: 'UA',
  }],
  location_types: ['home', 'recent'],
};

const BODY = `Новий клуб APOLLO NEXT 144 на Харківському шосе шукає тренерів 💪

В APOLLO NEXT ти сам керуєш своїм доходом!
Проста і зрозуміла модель: купуй підписку тренера та встановлюй власну ціну на свої послуги.

Що ми пропонуємо:
🔹 Новий сучасний простір на Харківському шосе, 144
🔹 Стабільний потік потенційних клієнтів
🔹 Можливість проводити індивідуальні та групові заняття
🔹 Робота на власних умовах і власний прайс

Від тебе: ти та бажання розвивати культуру спорту.`;

const CONCEPTS = [
  { n: 1, sq: 's01.jpg', st: 'stories01.jpg', desc: 'тренер, кепка' },
  { n: 2, sq: 's02.jpg', st: 'stories02.jpg', desc: 'тренерка' },
  { n: 3, sq: 's03.jpg', st: 'stories03.jpg', desc: 'команда втрьох' },
];
const adName = c => `${AD_DATE}_${c.n}`;

// вертикаль у сторіс/рілс, квадрат — решта (формула живого креативу coach)
const RULES = [
  { customization_spec: { publisher_platforms: ['instagram'], instagram_positions: ['story', 'reels'] }, image_label: { name: 'st_img' }, priority: 1 },
  { customization_spec: {}, image_label: { name: 'sq_img' }, priority: 2 },
];

const loadKyiv = async () => {
  const k = await apiGet(KYIV_ADSET, { fields: 'name,targeting,promoted_object,optimization_goal,billing_event,bid_strategy,daily_budget' });
  if (k.error) throw new Error('coach_kyiv: ' + G.errMsg(k.error));
  return k;
};

async function plan() {
  const k = await loadKyiv();
  console.log(`\nA_Coach_1603 — додаємо локальну групу під клуб 144\n`);
  console.log(`📂 ${ADSET_NAME} — $${DAILY_BUDGET / 100}/д  [PAUSED]`);
  console.log(`   гео: коло 3 км навколо 50.4216, 30.6511 (Харківське шосе, 144)`);
  console.log(`   решта налаштувань — дослівно з «${k.name}» ($${(+k.daily_budget) / 100}/д)`);
  console.log(`   вік ${k.targeting.age_min}-${k.targeting.age_max} · конверсія ${k.promoted_object.custom_conversion_id}`);
  CONCEPTS.forEach(c => console.log(`   • ${adName(c)} — ${c.desc} (${c.sq} / ${c.st})`));
  console.log(`\n✂️  з coach_kyiv виключається те саме коло 3 км —`);
  console.log(`   інакше дві групи били б по одних людях.`);
  console.log('\n(plan — нічого не створено)');
}

async function uploadBanners() {
  const man = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  const all = CONCEPTS.flatMap(c => [c.sq, c.st]);
  if (all.every(f => man[f])) { console.log('♻️  усі 6 банерів уже залиті'); return man; }
  await refreshDropboxToken();
  for (const f of all) {
    if (man[f]) continue;
    const r = await dropboxRequest(t => axios({ method: 'post', url: 'https://content.dropboxapi.com/2/sharing/get_shared_link_file',
      headers: { Authorization: `Bearer ${t}`, 'Dropbox-API-Arg': JSON.stringify({ url: DROPBOX_LINK, path: '/' + f }), 'Content-Type': '' },
      data: '', responseType: 'arraybuffer', maxContentLength: 50 * 1024 * 1024 }));
    const up = await apiPost(`${ACCT}/adimages`, { bytes: Buffer.from(r.data).toString('base64'), name: `coach144_${f}` });
    if (up.error) throw new Error(`${f}: ${G.errMsg(up.error)}`);
    man[f] = Object.values(up.images || {})[0].hash;
    fs.writeFileSync(MANIFEST, JSON.stringify(man, null, 2));
    console.log(`  ⬆️ ${f} → ${man[f].slice(0, 12)}…`);
  }
  return man;
}

async function build() {
  const hashes = await uploadBanners();
  const k = await loadKyiv();
  console.log(`📋 налаштування взято з «${k.name}», підмінено лише гео`);

  const live = (await apiGet(`${CAMPAIGN_ID}/adsets`, { fields: 'id,name', limit: '50' })).data || [];
  const prior = live.find(x => x.name === ADSET_NAME);
  const targeting = { ...JSON.parse(JSON.stringify(k.targeting)), geo_locations: GEO_144 };
  const adset = prior || await G.createAdSet({
    name: ADSET_NAME, campaign_id: CAMPAIGN_ID,
    optimization_goal: k.optimization_goal, billing_event: k.billing_event,
    bid_strategy: k.bid_strategy || 'LOWEST_COST_WITHOUT_CAP',
    daily_budget: String(DAILY_BUDGET),
    promoted_object: JSON.stringify(k.promoted_object),   // дослівно: pixel_rule звіряється посимвольно
    targeting,
  });
  console.log(`\n  📂 ${ADSET_NAME} — ${adset.id} | $${DAILY_BUDGET / 100}/д | PAUSED${prior ? ' (наявна)' : ''}`);

  const liveAds = (await apiGet(`${adset.id}/ads`, { fields: 'id,name', limit: '20' })).data || [];
  const made = [];
  for (const c of CONCEPTS) {
    const had = liveAds.find(x => x.name === adName(c));
    if (had) { console.log(`     ⏭  ${adName(c)} вже є`); made.push({ id: had.id, name: had.name }); continue; }
    const cr = await G.createChecked(`${ACCT}/adcreatives`, {
      name: `${adName(c)}_creative`,
      object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
      asset_feed_spec: JSON.stringify({
        images: [{ hash: hashes[c.sq], adlabels: [{ name: 'sq_img' }] }, { hash: hashes[c.st], adlabels: [{ name: 'st_img' }] }],
        bodies: [{ text: BODY }], titles: [{ text: TITLE }], descriptions: [{ text: '' }],
        link_urls: [{ website_url: TYPEFORM, display_url: DISPLAY_URL }],
        call_to_action_types: [CTA], ad_formats: ['AUTOMATIC_FORMAT'], optimization_type: 'PLACEMENT',
        asset_customization_rules: RULES,
      }),
      url_tags: URL_TAGS,
    }, `creative ${adName(c)}`);
    const ad = await G.createAd({ name: adName(c), adset_id: adset.id, creative: { creative_id: cr.id } });
    console.log(`     ✅ ${adName(c)} — ${ad.id} (${c.desc})`);
    made.push({ id: ad.id, name: adName(c), creativeId: cr.id });
  }

  console.log('\n🔍 Звірка нової групи:');
  for (const m of made) {
    const v = await G.verifyAd(m.id, { link: TYPEFORM });
    const p = await G.checkPreviews(m.id, ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY', 'MOBILE_FEED_STANDARD']);
    console.log(`   ${v.ok && p.ok ? '✅' : '❌'} ${m.name} ${v.status} | ${v.problems.join('; ') || 'дані ок'} | ${p.INSTAGRAM_STANDARD}/${p.INSTAGRAM_STORY}/${p.MOBILE_FEED_STANDARD}`);
  }

  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  hist.push({ date: '2026-09-15', campaign_name: 'A_Coach_1603', campaign_id: CAMPAIGN_ID,
    adsets: [{ name: ADSET_NAME, id: adset.id, budget_usd: DAILY_BUDGET / 100, ads: made.length }],
    note: 'Локальна група під клуб 144 (коло 3 км, Харківське шосе 144). Копія coach_kyiv зі зміненим гео. З coach_kyiv виключено те саме коло. Нова група PAUSED.' });
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));
  console.log('\n✅ Група готова (PAUSED). Далі: node tools/add_coach_144.js exclude');
}

// Виключити коло 144 з київської групи, щоб вони не перетиналися.
async function exclude() {
  const k = await loadKyiv();
  const cur = k.targeting.excluded_geo_locations;
  if (cur && (cur.custom_locations || []).some(l => Math.abs(l.latitude - 50.421631) < 0.001)) {
    console.log('♻️  коло 144 вже виключене з coach_kyiv');
  } else {
    const t = JSON.parse(JSON.stringify(k.targeting));
    t.excluded_geo_locations = GEO_144;
    const chk = await apiPost(KYIV_ADSET, { targeting: JSON.stringify(t), execution_options: JSON.stringify(['validate_only']) });
    if (chk.error) throw new Error('coach_kyiv (перевірка): ' + G.errMsg(chk.error));
    // Правки ОДНОГО й того самого обʼєкта Meta лімітує до 1 виклику / 30 с
    // (subcode 4841018). validate_only + запис — це два виклики, тому пауза.
    console.log('   ⏳ пауза 35 с — ліміт правок одного обʼєкта (4841018)…');
    await new Promise(r => setTimeout(r, 35000));
    let res = await apiPost(KYIV_ADSET, { targeting: JSON.stringify(t) });
    for (let i = 1; res.error && res.error.error_subcode === 4841018 && i <= 4; i++) {
      console.log(`   ⏳ rate limit, повтор ${i}/4 через 35 с…`);
      await new Promise(r => setTimeout(r, 35000));
      res = await apiPost(KYIV_ADSET, { targeting: JSON.stringify(t) });
    }
    if (res.error) throw new Error('coach_kyiv: ' + G.errMsg(res.error));
    console.log('✂️  з coach_kyiv виключено коло 3 км навколо клубу 144');
  }
  await verify();
}

async function verify() {
  const s = await apiGet(`${CAMPAIGN_ID}/adsets`, { fields: 'id,name,status,daily_budget,targeting', limit: '50' });
  console.log('\n📊 A_Coach_1603:');
  for (const a of (s.data || []).sort((x, y) => x.name.localeCompare(y.name))) {
    const t = a.targeting, g = t.geo_locations || {};
    const geo = g.custom_locations ? g.custom_locations.map(x => `коло ${x.radius}${x.distance_unit[0]}`).join(',')
      : g.cities ? g.cities.map(x => x.name).join(',')
      : g.regions ? g.regions.map(x => x.name + ' (обл)').join(',')
      : g.places ? g.places.map(x => x.name).join(',') : '?';
    const exc = (t.excluded_geo_locations || {}).custom_locations;
    const excTxt = exc ? `  ✂️ мінус коло ${exc[0].radius}${exc[0].distance_unit[0]}` : '';
    console.log(`   ${a.name.padEnd(22)} $${String((+a.daily_budget || 0) / 100).padStart(3)}/д  ${a.status.padEnd(7)} ${geo}${excTxt}`);
  }
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'plan') await plan();
  else if (cmd === 'build') await build();
  else if (cmd === 'exclude') await exclude();
  else if (cmd === 'verify') await verify();
  else console.log('cmd: plan | build | exclude | verify');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
