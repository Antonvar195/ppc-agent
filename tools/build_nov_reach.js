// Листопадові охватні Meta за планом (вкладка «Ноябрь», блок 2).
// 8 міст, вік 18-40, частота 8, $8 000 на місяць.
//
// Плейсменти — Facebook + Instagram + Threads, як у жовтні. Підтверджено
// звіркою: цифри аудиторій у плані збігаються саме з цим набором
// (Київ 2.4 млн, Львів 1.0 млн, Бориспіль 48.8 тис. — точні збіги),
// а на IG+Threads вони були б на 15-20% меншими.
//
// Оптимізація IMPRESSIONS. Частота 8 тримається бюджетом, не налаштуванням:
// frequency_control_specs працює лише з REACH, а REACH частоту занижує
// (див. docs/LESSONS.md, subcode 1815211).
//
// Відео: 3 концепти × 3 формати (16:9 / 4:4 / 9:16), оффер 1 ₴.
//
// Все PAUSED. Usage: node tools/build_nov_reach.js plan | upload | build | verify
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
const VID_DIR = path.join(process.env.HOME, 'Downloads/Video_november_reach');
const MANIFEST = path.join(__dirname, '../history/nov_reach_vids.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const START = '2026-11-01T00:01:00+0200';
const END   = '2026-11-30T23:59:00+0200';
const DAYS = 30;
const TITLE = 'Перший тиждень — 1 ₴';
const CTA = 'LEARN_MORE';
const URL_TAGS = 'utm_source=facebook&utm_medium=reach&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';

const BODY = `Лети до мети з APOLLO NEXT 🧡

Перший тиждень спорту — 1 грн. Приходь будь-коли: без зобовʼязань, у своєму темпі.

▫️ 48 групових тренувань на тиждень
▫️ План тренувань і харчування
▫️ Безкоштовне перше тренування з тренером
▫️ З 06:30 до 23:00

#ТИТВОЯМЕТА`;

// місто → гео, місячний бюджет із плану, посилання на клуб
const CITIES = [
  { city: 'Kyiv',           geo: { regions: [{ key: '4290', country: 'UA' }] },   monthly: 4441.49, link: 'https://apollo.online/clubs/kyyiv/' },
  { city: 'Lviv',           geo: { cities: [{ key: '2378495', country: 'UA' }] }, monthly: 1437.14, link: 'https://apollo.online/clubs/lviv/' },
  { city: 'Odessa',         geo: { cities: [{ key: '2384095', country: 'UA' }] }, monthly:  967.04, link: 'https://apollo.online/clubs/odesa/' },
  { city: 'Vinnytsia',      geo: { cities: [{ key: '2397330', country: 'UA' }] }, monthly:  393.21, link: 'https://apollo.online/clubs/apollo-next-033-tcz-magigrand/' },
  { city: 'IvanoFrankivsk', geo: { cities: [{ key: '2371245', country: 'UA' }] }, monthly:  305.08, link: 'https://apollo.online/clubs/apollo-next-039/' },
  { city: 'Zhytomyr',       geo: { cities: [{ key: '2401072', country: 'UA' }] }, monthly:  220.53, link: 'https://apollo.online/clubs/apollo-next-041-yarmarok/' },
  { city: 'BilaTserkva',    geo: { cities: [{ key: '2363654', country: 'UA' }] }, monthly:  147.18, link: 'https://apollo.online/clubs/apollo-next-035/' },
  { city: 'Boryspil',       geo: { cities: [{ key: '2364576', country: 'UA' }] }, monthly:   88.33, link: 'https://apollo.online/clubs/apollo-next-027-czum-kyyivskyj-shlyah/' },
];

const VIDEOS = [
  { n: 1, h: 'AP_Video_1_16x9_V2.mp4', sq: 'AP_Video_1_4x4_V2.mp4', st: 'AP_Video_1_9x16_V2.mp4' },
  { n: 2, h: 'AP_Video_2_16x9_V2.mp4', sq: 'AP_Video_2_4x4_V2.mp4', st: 'AP_Video_2_9x16_V2.mp4' },
  { n: 3, h: 'AP_Video_3_16x9.mp4',    sq: 'AP_Video_3_4x4.mp4',    st: 'AP_Video_3_9x16.mp4' },
];

const daily = m => Math.round(m / DAYS * 100);
const campName = c => `AI_Apollo_reach_${c.city}_nov_0111`;
const adsetName = c => `${c.city}_18-40_reach`;

const targeting = c => ({
  age_min: 18, age_max: 40,
  geo_locations: { ...c.geo, location_types: ['home', 'recent'] },
  targeting_automation: { advantage_audience: 0, individual_setting: { geo: 0 } },
  publisher_platforms: ['facebook', 'instagram', 'threads'],
  facebook_positions: ['feed', 'story', 'facebook_reels', 'instream_video', 'right_hand_column', 'marketplace'],
  instagram_positions: ['stream', 'story', 'reels', 'explore', 'explore_home', 'profile_feed'],
  threads_positions: ['threads_stream'],
  device_platforms: ['mobile', 'desktop'],
});

// для відео порожній customization_spec заборонений (2446501) — усі три з явним спеком
const RULES = [
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'] }, video_label: { name: 'v_9x16' }, priority: 1 },
  { customization_spec: { publisher_platforms: ['facebook'], facebook_positions: ['instream_video', 'right_hand_column', 'marketplace'] }, video_label: { name: 'v_16x9' }, priority: 2 },
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed'], instagram_positions: ['stream', 'explore', 'explore_home', 'profile_feed'] }, video_label: { name: 'v_4x4' }, priority: 3 },
];

function plan() {
  console.log('\nЛистопадові охватні Meta — 8 міст, 18-40, частота 8\n');
  console.log('місто'.padEnd(18), '$/місяць'.padStart(9), '$/день'.padStart(8));
  let m = 0, d = 0;
  for (const c of CITIES) { m += c.monthly; d += daily(c.monthly); 
    console.log(c.city.padEnd(18), ('$' + c.monthly.toFixed(2)).padStart(9), ('$' + (daily(c.monthly) / 100).toFixed(2)).padStart(8)); }
  console.log(''.padEnd(18), ('$' + m.toFixed(2)).padStart(9), ('$' + (d / 100).toFixed(2)).padStart(8));
  console.log(`\n   плейсменти: Facebook + Instagram + Threads · ${START.slice(0,10)} → ${END.slice(0,10)}`);
  console.log(`   3 відео × 3 формати в кожному місті, оффер 1 ₴`);
  console.log('\n(plan — нічого не створено)');
}

async function upload() {
  const man = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  for (const v of VIDEOS) {
    for (const [k, f] of [[`v${v.n}_h`, v.h], [`v${v.n}_sq`, v.sq], [`v${v.n}_st`, v.st]]) {
      if (man[k] && man[k].video_id) { console.log(`⏭  ${k} вже залито`); continue; }
      const p = path.join(VID_DIR, f);
      if (!fs.existsSync(p)) throw new Error('нема файлу: ' + p);
      const buf = fs.readFileSync(p);
      console.log(`⬆️  ${k} ← ${f} (${Math.round(buf.length / 1024 / 1024)} MB)…`);
      man[k] = { file: f, video_id: await uploadVideoBufferToMeta(buf, `nov_${k}_${f}`) };
      fs.writeFileSync(MANIFEST, JSON.stringify(man, null, 2));
      console.log(`    ${man[k].video_id}`);
    }
  }
  for (const k of Object.keys(man)) {
    for (let i = 0; i < 120; i++) {
      const r = await apiGet(man[k].video_id, { fields: 'status' });
      const st = (r.status || {}).video_status;
      if (st === 'ready') break;
      if (st === 'error') throw new Error(k + ': помилка обробки');
      await sleep(5000);
    }
    if (!man[k].thumb_hash) {
      for (let i = 0; i < 20; i++) {
        const r = await apiGet(`${man[k].video_id}/thumbnails`, { fields: 'uri,is_preferred' });
        const pref = (r.data || []).find(t => t.is_preferred) || (r.data || [])[0];
        if (pref && pref.uri) {
          const b = await new Promise((res, rej) => https.get(pref.uri, x => { const c = []; x.on('data', d => c.push(d)); x.on('end', () => res(Buffer.concat(c))); }).on('error', rej));
          const up = await apiPost(`${ACCT}/adimages`, { bytes: b.toString('base64'), name: `novthumb_${k}.jpg` });
          man[k].thumb_hash = Object.values(up.images || {})[0].hash;
          fs.writeFileSync(MANIFEST, JSON.stringify(man, null, 2));
          break;
        }
        await sleep(3000);
      }
    }
    console.log(`    ✅ ${k} готове`);
  }
  return man;
}

async function build() {
  const man = await upload();
  const all = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '400' })).data || [];
  const report = [];

  for (const c of CITIES) {
    const nm = campName(c);
    const prior = all.find(x => x.name === nm);
    const camp = prior || await G.createChecked(`${ACCT}/campaigns`, {
      name: nm, objective: 'OUTCOME_AWARENESS', buying_type: 'AUCTION',
      special_ad_categories: JSON.stringify([]), is_adset_budget_sharing_enabled: 'false', status: 'PAUSED',
    }, 'campaign ' + nm);
    console.log(`\n📁 ${nm} — ${camp.id}${prior ? ' (наявна)' : ''}`);

    const liveSets = (await apiGet(`${camp.id}/adsets`, { fields: 'id,name', limit: '10' })).data || [];
    const adset = liveSets.find(x => x.name === adsetName(c)) || await G.createAdSet({
      name: adsetName(c), campaign_id: camp.id,
      optimization_goal: 'IMPRESSIONS', billing_event: 'IMPRESSIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      daily_budget: String(daily(c.monthly)),
      targeting: targeting(c),
      start_time: START, end_time: END,
    });
    console.log(`  📂 ${adsetName(c).padEnd(26)} ${adset.id} | $${(daily(c.monthly) / 100).toFixed(2)}/д`);

    const liveAds = (await apiGet(`${adset.id}/ads`, { fields: 'id,name', limit: '20' })).data || [];
    for (const v of VIDEOS) {
      const an = `0111_video${v.n}`;
      if (liveAds.find(x => x.name === an)) { console.log(`     ⏭  ${an} вже є`); continue; }
      const h = man[`v${v.n}_h`], sq = man[`v${v.n}_sq`], st = man[`v${v.n}_st`];
      // 1487390 — тимчасова помилка Meta на створенні креатива; повторюємо
      const mkCreative = () => G.createChecked(`${ACCT}/adcreatives`, {
        name: `${an}_${c.city}_creative`,
        object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
        asset_feed_spec: JSON.stringify({
          videos: [
            { video_id: h.video_id,  thumbnail_hash: h.thumb_hash,  adlabels: [{ name: 'v_16x9' }] },
            { video_id: sq.video_id, thumbnail_hash: sq.thumb_hash, adlabels: [{ name: 'v_4x4' }] },
            { video_id: st.video_id, thumbnail_hash: st.thumb_hash, adlabels: [{ name: 'v_9x16' }] },
          ],
          bodies: [{ text: BODY }], titles: [{ text: TITLE }], descriptions: [{ text: '' }],
          link_urls: [{ website_url: c.link, display_url: 'apollo.online' }],
          call_to_action_types: [CTA], ad_formats: ['AUTOMATIC_FORMAT'], optimization_type: 'PLACEMENT',
          asset_customization_rules: RULES,
        }),
        url_tags: URL_TAGS,
      }, `creative ${an} ${c.city}`);
      let cr;
      for (let i = 1; i <= 5; i++) {
        try { cr = await mkCreative(); break; }
        catch (e) {
          if (!/1487390|Повторіть спробу|try again/i.test(e.message) || i === 5) throw e;
          console.log(`     ⏳ ${an} ${c.city}: тимчасова помилка Meta, повтор ${i}/5 через 20 с`);
          await sleep(20000);
        }
      }
      const ad = await G.createAd({ name: an, adset_id: adset.id, creative: { creative_id: cr.id } });
      console.log(`     ✅ ${an} — ${ad.id}`);
      report.push({ id: ad.id, name: an, city: c.city, link: c.link, creativeId: cr.id,
                    thumbs: [h.thumb_hash, sq.thumb_hash, st.thumb_hash] });
    }
  }

  console.log('\n🔍 Звірка (одне оголошення на місто):');
  const seen = new Set();
  for (const r of report) {
    if (seen.has(r.city)) continue; seen.add(r.city);
    const v = await G.verifyAd(r.id, { creativeId: r.creativeId, thumbHashes: r.thumbs, link: r.link });
    const p = await G.checkPreviews(r.id, ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY', 'DESKTOP_FEED_STANDARD']);
    console.log(`   ${v.ok && p.ok ? '✅' : '❌'} ${r.city.padEnd(16)} ${r.name} | ${v.problems.join(';') || 'дані ок'} | ${p.INSTAGRAM_STANDARD}/${p.INSTAGRAM_STORY}/${p.DESKTOP_FEED_STANDARD}`);
  }

  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  hist.push({ date: '2026-10-30', campaigns: CITIES.map(campName),
    note: 'Листопадові охватні: 8 міст, 18-40, $8000, IMPRESSIONS, FB+IG+Threads. 3 відео × 3 формати, оффер 1 грн. Все PAUSED.' });
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));

  await verify();
  console.log('\n✅ Готово — все PAUSED.');
}

async function verify() {
  const all = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '400' })).data || [];
  console.log('\n📊 Листопад:');
  let tot = 0;
  for (const c of CITIES) {
    const camp = all.find(x => x.name === campName(c));
    if (!camp) { console.log(`   ❌ нема ${campName(c)}`); continue; }
    const s = (await apiGet(`${camp.id}/adsets`, { fields: 'id,name,status,daily_budget,targeting', limit: '5' })).data || [];
    for (const a of s) {
      tot += +a.daily_budget;
      const ads = (await apiGet(`${a.id}/ads`, { fields: 'id', limit: '20' })).data || [];
      console.log(`   ${c.city.padEnd(16)} $${String((+a.daily_budget / 100).toFixed(2)).padStart(7)}/д  ${a.status.padEnd(7)} ${a.targeting.age_min}-${a.targeting.age_max}  оголош. ${ads.length}`);
    }
  }
  console.log(`   ${''.padEnd(16)} ─────────`);
  console.log(`   ${'разом'.padEnd(16)} $${(tot / 100).toFixed(2)}/д  ×30 = $${(tot / 100 * DAYS).toFixed(0)}`);
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'upload') await upload();
  else if (cmd === 'build') await build();
  else if (cmd === 'verify') await verify();
  else plan();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
