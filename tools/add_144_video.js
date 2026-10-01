// Додає в живу кампанію AI_Apollo_sales_Kyiv_144_0909 групу з відео.
//
// Таргетинг — копія local_kyiv_segment_1 (коло 6 км навколо клубу,
// Харківське шосе 144), читається з живої групи, нічого не набирається руками.
//
// 2 концепти × 2 формати, кожне оголошення адаптивне:
//   01 (16:9) + 02 (9:16) — космонавт летить над ТРЦ
//   03 (16:9) + 04 (9:16) — космонавт стоїть поруч
// Пари визначені за кадрами, не за назвами файлів.
//
// Текст, заголовок, посилання й CTA беруться з живого банерного оголошення —
// щоб відео й банери говорили однаково.
//
// Група PAUSED. Usage: node tools/add_144_video.js plan | upload | build
const fs = require('fs');
const path = require('path');
const https = require('https');
const G = require('./meta_guard');
const { apiGet, apiPost } = require('./meta_api');
const { uploadVideoBufferToMeta } = require('./creative_builder');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const IG_ID = process.env.META_INSTAGRAM_ACTOR_ID || '17841447539432480';

const CAMPAIGN_ID = '120250712385530193';     // AI_Apollo_sales_Kyiv_144_0909
const SRC_ADSET  = '120250712413950193';      // local_kyiv_segment_1 — еталон таргетингу
const ADSET_NAME = 'local_kyiv_video';
const DAILY_BUDGET = 2000;                    // $20/д — як відео-група в запуску 038
const DIR = path.join(process.env.HOME, 'Downloads');
const MANIFEST = path.join(__dirname, '../history/club144_video_manifest.json');

const CONCEPTS = [
  { n: 1, h: 'ApolloNext_144_1920_1080_15c_01.mp4', v: 'ApolloNext_144_1080_1920_14c_02.mp4', desc: 'космонавт летить над ТРЦ' },
  { n: 2, h: 'ApolloNext_144_1920_1080_12c_03.mp4', v: 'ApolloNext_144__1080_1920_14c_04.mp4', desc: 'космонавт стоїть поруч' },
];
const adName = c => `0110_video${c.n}`;

// Вертикаль у сторіс/рілс, горизонт — решта. Порожній customization_spec для
// відео заборонений (2446501), тому обидва правила з явним плейсмент-спеком.
const RULES = [
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['facebook_reels_overlay'], instagram_positions: ['story'] }, video_label: { name: 'st_vid' }, priority: 1 },
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed', 'instream_video'], instagram_positions: ['stream', 'explore', 'explore_home'] }, video_label: { name: 'h_vid' }, priority: 2 },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function srcAd() {
  const ads = (await apiGet(`${SRC_ADSET}/ads`, { fields: 'name,creative{asset_feed_spec,url_tags,object_story_spec}', limit: '5' })).data || [];
  const f = ads[0].creative.asset_feed_spec;
  return {
    body: f.bodies[0].text,
    title: f.titles[0].text,
    link: f.link_urls[0].website_url,
    display: f.link_urls[0].display_url || 'apollo.online',
    cta: f.call_to_action_types[0],
    urlTags: ads[0].creative.url_tags,
  };
}

async function waitReady(id, label) {
  for (let i = 0; i < 90; i++) {
    const r = await apiGet(id, { fields: 'status' });
    const st = r.status && r.status.video_status;
    if (st === 'ready') return;
    if (st === 'error') throw new Error(label + ': помилка обробки');
    await sleep(5000);
  }
  throw new Error(label + ': не дочекались ready');
}

async function thumbHash(id, label) {
  for (let i = 0; i < 20; i++) {
    const r = await apiGet(`${id}/thumbnails`, { fields: 'uri,is_preferred' });
    const list = r.data || [];
    const pref = list.find(t => t.is_preferred) || list[0];
    if (pref && pref.uri) {
      const buf = await new Promise((res, rej) => https.get(pref.uri, x => { const c = []; x.on('data', d => c.push(d)); x.on('end', () => res(Buffer.concat(c))); }).on('error', rej));
      const up = await apiPost(`${ACCT}/adimages`, { bytes: buf.toString('base64'), name: `thumb144_${id}.jpg` });
      if (up.error) throw new Error('thumb: ' + G.errMsg(up.error));
      return Object.values(up.images || {})[0].hash;
    }
    await sleep(3000);
  }
  throw new Error(label + ': превʼю не зʼявилось');
}

async function upload() {
  const man = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  const files = CONCEPTS.flatMap(c => [{ f: c.h, k: `v${c.n}_h` }, { f: c.v, k: `v${c.n}_v` }]);
  for (const { f, k } of files) {
    if (man[k] && man[k].video_id) { console.log(`⏭  ${k} вже залито`); continue; }
    const p = path.join(DIR, f);
    if (!fs.existsSync(p)) throw new Error('нема файлу: ' + p);
    const buf = fs.readFileSync(p);
    console.log(`⬆️  ${k} ← ${f} (${Math.round(buf.length / 1024 / 1024)} MB)…`);
    const id = await uploadVideoBufferToMeta(buf, `c144_${k}_${f}`);
    man[k] = { file: f, video_id: id };
    fs.writeFileSync(MANIFEST, JSON.stringify(man, null, 2));
    console.log(`    video_id ${id}`);
  }
  for (const { k } of files) {
    await waitReady(man[k].video_id, k);
    if (!man[k].thumb_hash) {
      man[k].thumb_hash = await thumbHash(man[k].video_id, k);
      fs.writeFileSync(MANIFEST, JSON.stringify(man, null, 2));
    }
    console.log(`    ✅ ${k} готове`);
  }
  return man;
}

async function plan() {
  const t = await srcAd();
  const src = await apiGet(SRC_ADSET, { fields: 'name,targeting,end_time' });
  const g = src.targeting.geo_locations.custom_locations[0];
  console.log(`\nAI_Apollo_sales_Kyiv_144_0909 — додаємо відео-групу\n`);
  console.log(`📂 ${ADSET_NAME} — $${DAILY_BUDGET / 100}/д  [PAUSED]`);
  console.log(`   таргетинг з «${src.name}»: коло ${g.radius} км навколо ${g.latitude}, ${g.longitude}`);
  console.log(`   вік ${src.targeting.age_min}-${src.targeting.age_max} · кінець ${src.end_time}`);
  CONCEPTS.forEach(c => {
    console.log(`   • ${adName(c)} — ${c.desc}`);
    console.log(`       9:16 → сторіс: ${c.v}`);
    console.log(`      16:9 → стрічка: ${c.h}`);
  });
  console.log(`\n   заголовок: «${t.title}» · CTA ${t.cta}`);
  console.log(`   текст: той самий, що в банерах (${t.body.length} символів)`);
  console.log('\n(plan — нічого не створено)');
}

async function build() {
  const man = await upload();
  const t = await srcAd();
  const src = await apiGet(SRC_ADSET, { fields: 'targeting,optimization_goal,billing_event,bid_strategy,promoted_object,end_time' });
  console.log(`\n📋 таргетинг і текст узято з живої local_kyiv_segment_1`);

  const live = (await apiGet(`${CAMPAIGN_ID}/adsets`, { fields: 'id,name', limit: '20' })).data || [];
  const prior = live.find(x => x.name === ADSET_NAME);
  const adset = prior || await G.createAdSet({
    name: ADSET_NAME, campaign_id: CAMPAIGN_ID,
    optimization_goal: src.optimization_goal, billing_event: src.billing_event,
    bid_strategy: src.bid_strategy || 'LOWEST_COST_WITHOUT_CAP',
    daily_budget: String(DAILY_BUDGET),
    promoted_object: JSON.stringify({ pixel_id: src.promoted_object.pixel_id, custom_event_type: src.promoted_object.custom_event_type }),
    targeting: JSON.parse(JSON.stringify(src.targeting)),
    end_time: src.end_time,
  });
  console.log(`\n  📂 ${ADSET_NAME} — ${adset.id} | $${DAILY_BUDGET / 100}/д | PAUSED${prior ? ' (наявна)' : ''}`);

  const liveAds = (await apiGet(`${adset.id}/ads`, { fields: 'id,name', limit: '20' })).data || [];
  const made = [];
  for (const c of CONCEPTS) {
    if (liveAds.find(x => x.name === adName(c))) { console.log(`     ⏭  ${adName(c)} вже є`); continue; }
    const h = man[`v${c.n}_h`], v = man[`v${c.n}_v`];
    const cr = await G.createChecked(`${ACCT}/adcreatives`, {
      name: `${adName(c)}_creative`,
      object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
      asset_feed_spec: JSON.stringify({
        videos: [
          { video_id: h.video_id, thumbnail_hash: h.thumb_hash, adlabels: [{ name: 'h_vid' }] },
          { video_id: v.video_id, thumbnail_hash: v.thumb_hash, adlabels: [{ name: 'st_vid' }] },
        ],
        bodies: [{ text: t.body }], titles: [{ text: t.title }], descriptions: [{ text: '' }],
        link_urls: [{ website_url: t.link, display_url: t.display }],
        call_to_action_types: [t.cta],
        ad_formats: ['AUTOMATIC_FORMAT'], optimization_type: 'PLACEMENT',
        asset_customization_rules: RULES,
      }),
      ...(t.urlTags ? { url_tags: t.urlTags } : {}),
    }, `creative ${adName(c)}`);
    const ad = await G.createAd({ name: adName(c), adset_id: adset.id, creative: { creative_id: cr.id } });
    console.log(`     ✅ ${adName(c)} — ${ad.id} (${c.desc})`);
    made.push({ id: ad.id, name: adName(c), creativeId: cr.id, link: t.link, thumbs: [h.thumb_hash, v.thumb_hash] });
  }

  console.log('\n🔍 Звірка:');
  for (const m of made) {
    const v = await G.verifyAd(m.id, { creativeId: m.creativeId, thumbHashes: m.thumbs, link: m.link });
    const p = await G.checkPreviews(m.id, ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY', 'DESKTOP_FEED_STANDARD']);
    console.log(`   ${v.ok && p.ok ? '✅' : '❌'} ${m.name} ${v.status} | ${v.problems.join('; ') || 'дані ок'} | ${p.INSTAGRAM_STANDARD}/${p.INSTAGRAM_STORY}/${p.DESKTOP_FEED_STANDARD}`);
  }

  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  hist.push({ date: '2026-10-01', campaign_name: 'AI_Apollo_sales_Kyiv_144_0909', campaign_id: CAMPAIGN_ID,
    adsets: [{ name: ADSET_NAME, id: adset.id, budget_usd: DAILY_BUDGET / 100, ads: made.length }],
    note: 'Відео-група в кампанії клубу 144: таргетинг і текст скопійовані з local_kyiv_segment_1, 2 адаптивні відео (9:16 сторіс / 16:9 стрічка). PAUSED.' });
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));

  console.log(`\n📊 AI_Apollo_sales_Kyiv_144_0909:`);
  G.printSummary(await G.campaignSummary(CAMPAIGN_ID));
  console.log('\n✅ Готово — нова група PAUSED.');
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'upload') await upload();
  else if (cmd === 'build') await build();
  else await plan();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
