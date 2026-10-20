// AI_Apollo_sales_Kyiv_144_open_2210 — кампанія після відкриття клубу 144.
// Старт 22.10, оффер 299 ₴ замість 1249 діє до 30.11 (з банерів).
//
// Розкладка бюджету — з фактів передвідкриттєвої кампанії 120250712385530193
// ($4436, 123 покупки, CPA $36.06, ROAS 4.2) за 09.09–20.10:
//
//   local_kyiv_video          CPA $24.95  CTR 1.85%  43 покупки  ← найкраще
//   advantage_kyiv_segment_1  CPA $28.28  CTR 1.45%  35 покупок
//   engagement_kyiv_segment_2 CPA $31.51             6 покупок (мало даних)
//   advantage_kyiv_segment_2  CPA $46.92            19
//   local_kyiv_segment_2      CPA $55.97            16
//   local_kyiv_segment_1      CPA $77.45             4
//   lookalike ×2 + engagement_1  0 покупок на $87   ← прибрано з розкладки
//
// Висновок: відео виграло і за CPA, і за CTR; advantage — друга. Разом вони
// дали 78 зі 123 покупок (63%) на 47% витрат. Тому гроші йдуть туди.
//
// Все PAUSED. Usage: node tools/build_144_open_camp.js plan | build | verify
const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');
const G = require('./meta_guard');
const { apiGet, apiPost } = require('./meta_api');
const { refreshDropboxToken, dropboxRequest } = require('./dropbox_reader');
const { uploadVideoBufferToMeta } = require('./creative_builder');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const IG_ID = process.env.META_INSTAGRAM_ACTOR_ID || '17841447539432480';
const PIXEL_ID = '393751978682816';

const SRC_CAMPAIGN = '120250712385530193';          // передвідкриття — джерело таргетингу
const CAMPAIGN_NAME = 'AI_Apollo_sales_Kyiv_144_open_2210';
const CLUB_URL = 'https://apollo.online/clubs/apollo-next-144/';
const TITLE = 'APOLLO NEXT 144 вже відкрито';
const CTA = 'APPLY_NOW';
const START = '2026-10-22T00:01:00+0300';
const END   = '2026-11-30T23:59:00+0200';
const ATTRIBUTION = [{ event_type: 'CLICK_THROUGH', window_days: 7 }, { event_type: 'VIEW_THROUGH', window_days: 1 }];
const URL_TAGS = 'utm_source=facebook&utm_medium=conversion&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';

const DROPBOX = 'https://www.dropbox.com/scl/fo/ka9vgnbb8w5uhr4cdbs27/AHsYjZ9tKprbpRScNrv_hLg?rlkey=47c888t76gwqbh5rul38x7inx&e=3&dl=0';
const IMG_MANIFEST = path.join(__dirname, '../history/club144_open_img.json');
const VID_MANIFEST = path.join(__dirname, '../history/club144_open_vid.json');
const VID_DIR = path.join(process.env.HOME, 'Downloads');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BODY = `🔥 APOLLO NEXT 144 вже відкрито — Харківське шосе, 144.

Новий спорт простір, де тіло, розклад і навіть настрій працюють на тебе.

▫️ 48 групових тренувань на тиждень
▫️ План тренувань і харчування
▫️ Безкоштовне перше тренування з тренером
▫️ Автоматизований вхід — без черг
▫️ Простір без хейту, лише підтримка й твій темп

Ми продовжили найнижчу ціну відкриття:
299 ₴ замість 1249 ₴ за перші 4 тижні. Пропозиція діє до 30.11.2026.

Забирай ціну, поки вона діє.`;

// банери: 3 концепти × 3 формати; відео: 2 концепти × 2 формати
const BANNERS = [1, 2, 3];
const VIDEOS = [
  { n: 1, h: 'ApolloNext_144_1920_1080_15c_01_open.mp4', v: 'ApolloNext_144_1080_1920_14c_02_open.mp4', desc: 'космонавт летить' },
  { n: 2, h: 'ApolloNext_144_1920_1080_12c_03_open.mp4', v: 'ApolloNext_144__1080_1920_14c_04_open.mp4', desc: 'космонавт стоїть' },
];

// група → еталонна група передвідкриття, бюджет (центи), тип креативу
const ADSETS = [
  { name: 'local_video',      src: 'local_kyiv_video',            budget: 3500, kind: 'video',  why: 'CPA $24.95, CTR 1.85% — найкраще' },
  { name: 'advantage_video',  src: 'advantage_kyiv_segment_1',    budget: 2500, kind: 'video',  why: 'найкраща аудиторія × найкращий формат' },
  { name: 'advantage_banner', src: 'advantage_kyiv_segment_1',    budget: 2000, kind: 'banner', why: 'CPA $28.28 підтверджено' },
  { name: 'local_banner',     src: 'local_kyiv_segment_2',        budget: 1200, kind: 'banner', why: 'CPA $55.97 — слабше, але конвертує' },
  { name: 'engagement',       src: 'engagement_kyiv_segment_2',   budget: 800,  kind: 'banner', why: 'CPA $31.51 на малих даних — тест' },
];

const IMG_RULES = [
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'] }, image_label: { name: 'st_img' }, priority: 1 },
  { customization_spec: { publisher_platforms: ['facebook'], facebook_positions: ['right_hand_column', 'instream_video', 'marketplace'] }, image_label: { name: 'h_img' }, priority: 2 },
  { customization_spec: {}, image_label: { name: 'sq_img' }, priority: 3 },
];
const VID_RULES = [
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'] }, video_label: { name: 'st_vid' }, priority: 1 },
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed', 'instream_video', 'marketplace', 'right_hand_column'], instagram_positions: ['stream', 'explore', 'explore_home', 'profile_feed'] }, video_label: { name: 'h_vid' }, priority: 2 },
];

async function srcAdsets() {
  const s = (await apiGet(`${SRC_CAMPAIGN}/adsets`, { fields: 'id,name,targeting,optimization_goal,billing_event,bid_strategy,promoted_object', limit: '20' })).data || [];
  const by = {}; for (const a of s) by[a.name] = a;
  for (const x of ADSETS) if (!by[x.src]) throw new Error('нема еталона ' + x.src);
  return by;
}

function plan() {
  console.log(`\n${CAMPAIGN_NAME} — після відкриття, ${START.slice(0,10)} → ${END.slice(0,10)}\n`);
  let tot = 0;
  for (const a of ADSETS) {
    tot += a.budget;
    const creo = a.kind === 'video' ? '2 відео' : '3 банери';
    console.log(`   📂 ${a.name.padEnd(18)} $${String(a.budget/100).padStart(2)}/д  ${creo.padEnd(9)} ← ${a.src}`);
    console.log(`      ${a.why}`);
  }
  console.log(`\n   разом $${tot/100}/день`);
  console.log('\n   прибрано з розкладки: lookalike ×2 і engagement_segment_1 — 0 покупок на $87');
  console.log('\n(plan — нічого не створено)');
}

async function uploadAssets() {
  // банери
  const img = fs.existsSync(IMG_MANIFEST) ? JSON.parse(fs.readFileSync(IMG_MANIFEST, 'utf8')) : {};
  const need = BANNERS.flatMap(n => [`s0${n}.jpg`, `h0${n}.jpg`, `stories0${n}.jpg`]);
  if (!need.every(f => img[f])) {
    await refreshDropboxToken();
    for (const f of need) {
      if (img[f]) continue;
      const r = await dropboxRequest(t => axios({ method: 'post', url: 'https://content.dropboxapi.com/2/sharing/get_shared_link_file',
        headers: { Authorization: `Bearer ${t}`, 'Dropbox-API-Arg': JSON.stringify({ url: DROPBOX, path: '/' + f }), 'Content-Type': '' },
        data: '', responseType: 'arraybuffer', maxContentLength: 50 * 1024 * 1024 }));
      const up = await apiPost(`${ACCT}/adimages`, { bytes: Buffer.from(r.data).toString('base64'), name: `o144_${f}` });
      if (up.error) throw new Error(`${f}: ${G.errMsg(up.error)}`);
      img[f] = Object.values(up.images || {})[0].hash;
      fs.writeFileSync(IMG_MANIFEST, JSON.stringify(img, null, 2));
      console.log(`  ⬆️ ${f} → ${img[f].slice(0, 12)}…`);
    }
  } else console.log('♻️  банери вже залиті');

  // відео
  const vid = fs.existsSync(VID_MANIFEST) ? JSON.parse(fs.readFileSync(VID_MANIFEST, 'utf8')) : {};
  for (const c of VIDEOS) {
    for (const [k, f] of [[`v${c.n}_h`, c.h], [`v${c.n}_v`, c.v]]) {
      if (vid[k] && vid[k].video_id) continue;
      const buf = fs.readFileSync(path.join(VID_DIR, f));
      console.log(`  ⬆️ ${k} ← ${f} (${Math.round(buf.length/1024/1024)} MB)…`);
      vid[k] = { file: f, video_id: await uploadVideoBufferToMeta(buf, `o144_${k}_${f}`) };
      fs.writeFileSync(VID_MANIFEST, JSON.stringify(vid, null, 2));
    }
  }
  for (const k of Object.keys(vid)) {
    for (let i = 0; i < 90; i++) {
      const r = await apiGet(vid[k].video_id, { fields: 'status' });
      const st = (r.status || {}).video_status;
      if (st === 'ready') break;
      if (st === 'error') throw new Error(k + ': помилка обробки');
      await sleep(5000);
    }
    if (!vid[k].thumb_hash) {
      for (let i = 0; i < 20; i++) {
        const r = await apiGet(`${vid[k].video_id}/thumbnails`, { fields: 'uri,is_preferred' });
        const pref = (r.data || []).find(t => t.is_preferred) || (r.data || [])[0];
        if (pref && pref.uri) {
          const b = await new Promise((res, rej) => https.get(pref.uri, x => { const c = []; x.on('data', d => c.push(d)); x.on('end', () => res(Buffer.concat(c))); }).on('error', rej));
          const up = await apiPost(`${ACCT}/adimages`, { bytes: b.toString('base64'), name: `o144thumb_${k}.jpg` });
          vid[k].thumb_hash = Object.values(up.images || {})[0].hash;
          fs.writeFileSync(VID_MANIFEST, JSON.stringify(vid, null, 2));
          break;
        }
        await sleep(3000);
      }
    }
    console.log(`    ✅ ${k} готове`);
  }
  return { img, vid };
}

async function build() {
  const { img, vid } = await uploadAssets();
  const src = await srcAdsets();
  console.log('\n📋 таргетинг читається з груп передвідкриттєвої кампанії');

  const all = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '400' })).data || [];
  const prior = all.find(x => x.name === CAMPAIGN_NAME);
  const camp = prior || await G.createChecked(`${ACCT}/campaigns`, {
    name: CAMPAIGN_NAME, objective: 'OUTCOME_SALES', buying_type: 'AUCTION',
    special_ad_categories: JSON.stringify([]), is_adset_budget_sharing_enabled: 'false', status: 'PAUSED',
  }, 'campaign');
  console.log(`\n📁 ${CAMPAIGN_NAME} — ${camp.id}${prior ? ' (наявна)' : ''}`);

  // креативи, спільні для груп одного типу
  const made = {};
  for (const n of BANNERS) {
    const cr = await G.createChecked(`${ACCT}/adcreatives`, {
      name: `2210_${n}_creative`,
      object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
      asset_feed_spec: JSON.stringify({
        images: [
          { hash: img[`s0${n}.jpg`],       adlabels: [{ name: 'sq_img' }] },
          { hash: img[`stories0${n}.jpg`], adlabels: [{ name: 'st_img' }] },
          { hash: img[`h0${n}.jpg`],       adlabels: [{ name: 'h_img' }] },
        ],
        bodies: [{ text: BODY }], titles: [{ text: TITLE }], descriptions: [{ text: '' }],
        link_urls: [{ website_url: CLUB_URL, display_url: 'apollo.online' }],
        call_to_action_types: [CTA], ad_formats: ['AUTOMATIC_FORMAT'], optimization_type: 'PLACEMENT',
        asset_customization_rules: IMG_RULES,
      }),
      url_tags: URL_TAGS,
    }, `creative 2210_${n}`);
    made[`banner_${n}`] = cr.id;
    console.log(`  🎨 2210_${n} — ${cr.id}`);
  }
  for (const c of VIDEOS) {
    const h = vid[`v${c.n}_h`], v = vid[`v${c.n}_v`];
    const cr = await G.createChecked(`${ACCT}/adcreatives`, {
      name: `2210_video${c.n}_creative`,
      object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
      asset_feed_spec: JSON.stringify({
        videos: [
          { video_id: h.video_id, thumbnail_hash: h.thumb_hash, adlabels: [{ name: 'h_vid' }] },
          { video_id: v.video_id, thumbnail_hash: v.thumb_hash, adlabels: [{ name: 'st_vid' }] },
        ],
        bodies: [{ text: BODY }], titles: [{ text: TITLE }], descriptions: [{ text: '' }],
        link_urls: [{ website_url: CLUB_URL, display_url: 'apollo.online' }],
        call_to_action_types: [CTA], ad_formats: ['AUTOMATIC_FORMAT'], optimization_type: 'PLACEMENT',
        asset_customization_rules: VID_RULES,
      }),
      url_tags: URL_TAGS,
    }, `creative 2210_video${c.n}`);
    made[`video_${c.n}`] = cr.id;
    console.log(`  🎬 2210_video${c.n} — ${cr.id} (${c.desc})`);
  }

  const liveSets = (await apiGet(`${camp.id}/adsets`, { fields: 'id,name', limit: '20' })).data || [];
  const report = [];
  for (const a of ADSETS) {
    const ref = src[a.src];
    const adset = liveSets.find(x => x.name === a.name) || await G.createAdSet({
      name: a.name, campaign_id: camp.id,
      optimization_goal: ref.optimization_goal, billing_event: ref.billing_event,
      bid_strategy: ref.bid_strategy || 'LOWEST_COST_WITHOUT_CAP',
      daily_budget: String(a.budget),
      promoted_object: JSON.stringify({ pixel_id: PIXEL_ID, custom_event_type: 'PURCHASE' }),
      attribution_spec: JSON.stringify(ATTRIBUTION),
      targeting: JSON.parse(JSON.stringify(ref.targeting)),
      start_time: START, end_time: END,
    });
    console.log(`\n  📂 ${a.name.padEnd(18)} ${adset.id} | $${a.budget/100}/д`);

    const liveAds = (await apiGet(`${adset.id}/ads`, { fields: 'id,name', limit: '20' })).data || [];
    const items = a.kind === 'video' ? VIDEOS.map(c => [`2210_video${c.n}`, made[`video_${c.n}`]]) : BANNERS.map(n => [`2210_${n}`, made[`banner_${n}`]]);
    for (const [nm, cid] of items) {
      if (liveAds.find(x => x.name === nm)) { console.log(`     ⏭  ${nm} вже є`); continue; }
      const ad = await G.createAd({ name: nm, adset_id: adset.id, creative: { creative_id: cid } });
      console.log(`     ✅ ${nm} — ${ad.id}`);
      report.push({ id: ad.id, name: nm, adset: a.name, creativeId: cid });
    }
  }

  console.log('\n🔍 Звірка (по одному оголошенню з групи):');
  const seen = new Set();
  for (const r of report) {
    if (seen.has(r.adset)) continue; seen.add(r.adset);
    const v = await G.verifyAd(r.id, { creativeId: r.creativeId, link: CLUB_URL });
    const p = await G.checkPreviews(r.id, ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY', 'DESKTOP_FEED_STANDARD']);
    console.log(`   ${v.ok && p.ok ? '✅' : '❌'} ${r.adset.padEnd(18)} ${r.name.padEnd(13)} ${v.status} | ${v.problems.join(';') || 'дані ок'} | ${p.INSTAGRAM_STANDARD}/${p.INSTAGRAM_STORY}/${p.DESKTOP_FEED_STANDARD}`);
  }

  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  hist.push({ date: '2026-10-20', campaign_name: CAMPAIGN_NAME, campaign_id: camp.id,
    note: 'Кампанія після відкриття 144, старт 22.10 до 30.11. $100/д розкладено за фактом передвідкриття: відео $60 (CPA $24.95), advantage-банер $20 ($28.28), local-банер $12, engagement $8. Lookalike прибрано — 0 покупок. Все PAUSED.' });
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));

  await verify();
  console.log('\n✅ Готово — все PAUSED.');
}

async function verify() {
  const all = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '400' })).data || [];
  const c = all.find(x => x.name === CAMPAIGN_NAME);
  if (!c) throw new Error('кампанію не знайдено');
  const s = (await apiGet(`${c.id}/adsets`, { fields: 'name,status,daily_budget,attribution_spec,targeting,start_time,end_time', limit: '20' })).data || [];
  console.log(`\n📊 ${CAMPAIGN_NAME}:`);
  let tot = 0;
  for (const a of s) {
    tot += +a.daily_budget;
    const ads = (await apiGet(`${(await apiGet(`${c.id}/adsets`, { fields: 'id,name', limit: '20' })).data.find(x => x.name === a.name).id}/ads`, { fields: 'id', limit: '20' })).data || [];
    const att = (a.attribution_spec || []).map(x => (x.event_type === 'CLICK_THROUGH' ? 'click' : 'view') + x.window_days + 'd').join('+');
    console.log(`   ${a.name.padEnd(18)} $${String((+a.daily_budget/100)).padStart(2)}/д  ${a.status.padEnd(7)} ${att}  оголош. ${ads.length}  ${a.targeting.age_min}-${a.targeting.age_max}`);
  }
  console.log(`   ${''.padEnd(18)} ────`);
  console.log(`   ${'разом'.padEnd(18)} $${tot/100}/д`);
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'build') await build();
  else if (cmd === 'verify') await verify();
  else plan();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
