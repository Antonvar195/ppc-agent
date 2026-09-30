// Жовтневий план Meta: 8 кампаній, одне місто = одна кампанія = одна широка група.
// Бюджети й цілі — з плану (Google Sheet, вкладка «ЖОВТЕНЬ 2026»), місячні суми
// поділені на 31 день.
//
//   КОНВЕРСІЇ ($5 361/міс)   Київ · Житомир · Бориспіль · Біла Церква
//   ОХОПЛЕННЯ ($8 472/міс)   Львів · Одеса · Івано-Франківськ · Вінниця
//
// Офери (за вказівкою): 1 грн — Київ, Вінниця, Бориспіль, Львів;
//                       −50%  — БЦ, Одеса, Житомир, ІФ.
// ⚠️ Львів у вересневій охватній крутив ролики −50%; у жовтні в нього 1 грн,
// тому беруться ролики A, а не B.
//
// Охватні: оптимізація IMPRESSIONS. Цільової частоти в аукціоні НЕМАЄ:
//   • frequency_control_specs — це СТЕЛЯ, і працює лише з REACH (1815211);
//   • REACH максимізує охоплення, тобто ЗАНИЖУЄ частоту — протилежне меті;
//   • справжня цільова частота існує лише в Reach & Frequency (RESERVED),
//     який бронюється наперед із фіксованим бюджетом і не редагується.
// Тому частота тримається оптимізацією IMPRESSIONS + шириною аудиторії.
// Факт вересня на IMPRESSIONS: Львів 5.16, Одеса 4.80, БЦ 5.93, Вінниця 4.21
// при вдвічі меншому бюджеті.
//
// ⚠️ Ліміт частоти, раз поставлений, НЕ знімається через API: [], '' і 'null'
// приймаються без помилки й мовчки ігноруються. Групу доводиться перестворювати.
//
// Все PAUSED. Usage: node tools/build_october.js plan | build | verify
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

const START = '2026-10-01T00:01:00+0300';
const END   = '2026-10-31T23:59:00+0200';   // 25.10 перехід на зимовий час
const DAYS  = 31;

const CONV_DROPBOX = 'https://www.dropbox.com/scl/fo/jmdjw06qabehdlbwbtr5k/AD4wveoyYH28WAHBtw0bYVY?rlkey=dd7iuomhozz9rh1219tngrl8q&e=3&dl=0';
const CONV_MANIFEST = path.join(__dirname, '../history/october_conv_manifest.json');
const VID_MANIFEST  = path.join(__dirname, '../history/sept_vids_manifest.json');

const CITY = {
  Kyiv:           { geo: { regions: [{ key: '4290', country: 'UA' }] },      link: 'https://apollo.online/clubs/kyyiv/' },
  Zhytomyr:       { geo: { cities: [{ key: '2401072', country: 'UA' }] },    link: 'https://apollo.online/clubs/apollo-next-041-yarmarok/' },
  Boryspil:       { geo: { cities: [{ key: '2364576', country: 'UA' }] },    link: 'https://apollo.online/clubs/apollo-next-027-czum-kyyivskyj-shlyah/' },
  BilaTserkva:    { geo: { cities: [{ key: '2363654', country: 'UA' }] },    link: 'https://apollo.online/clubs/apollo-next-035/' },
  Lviv:           { geo: { cities: [{ key: '2378495', country: 'UA' }] },    link: 'https://apollo.online/clubs/lviv/' },
  Odessa:         { geo: { cities: [{ key: '2384095', country: 'UA' }] },    link: 'https://apollo.online/clubs/odesa/' },
  IvanoFrankivsk: { geo: { cities: [{ key: '2371245', country: 'UA' }] },    link: 'https://apollo.online/clubs/apollo-next-039/' },
  Vinnytsia:      { geo: { cities: [{ key: '2397330', country: 'UA' }] },    link: 'https://apollo.online/clubs/apollo-next-033-tcz-magigrand/' },
};

// широка аудиторія на місто: без інтересів, 18-65, усі три майданчики
const broadTargeting = geo => ({
  age_min: 18, age_max: 65,
  geo_locations: { ...geo, location_types: ['home', 'recent'] },
  targeting_automation: { advantage_audience: 0, individual_setting: { geo: 0 } },
  publisher_platforms: ['facebook', 'instagram', 'threads'],
  facebook_positions: ['feed', 'story', 'facebook_reels', 'right_hand_column', 'instream_video', 'marketplace'],
  instagram_positions: ['stream', 'story', 'reels', 'explore', 'explore_home', 'profile_feed'],
  threads_positions: ['threads_stream'],
  device_platforms: ['mobile', 'desktop'],
});

const OFFER = {
  '1grn': {
    title: 'Спорт 1 грн — перший тиждень',
    banners: [1, 2, 3],
    videos: ['A1', 'A2', 'A3'],
    vidTitle: 'Перший тиждень — 1 ₴',
    body: `Лети до мети з APOLLO NEXT 🧡

Перший тиждень спорту — 1 грн. Без зобовʼязань: приходь, дивись, пробуй.

▫️ Понад 120 групових програм на тиждень
▫️ Вільні ваги, кардіо, функціонал, йога
▫️ Перше тренування з тренером: розбір техніки й аналіз тіла
▫️ З 06:30 до 23:00

Працюємо у «жовту» тривогу — графік тренувань лишається твоїм.

Акція діє з 01.10 до 31.10.2026.`,
  },
  '50off': {
    title: '−50% на спорт',
    banners: [4, 5, 6],
    videos: ['B1', 'B2', 'B3'],
    vidTitle: '−50% на перші 4 тижні',
    body: `Лети до мети з APOLLO NEXT 🧡

−50% на спорт: чотири тижні за півціни, щоб звичка встигла зʼявитись.

▫️ Понад 120 групових програм на тиждень
▫️ Вільні ваги, кардіо, функціонал, йога
▫️ Тренера обираєш ти, а не він тебе
▫️ З 06:30 до 23:00, без обмежень по годинах

Працюємо у «жовту» тривогу — графік тренувань лишається твоїм.

Акція діє з 01.10 до 31.10.2026.`,
  },
};

// місто → {режим, оффер, місячний бюджет $}
const PLAN = [
  { city: 'Kyiv',           mode: 'conv',  offer: '1grn',  monthly: 3021.39, goal: 120 },
  { city: 'Zhytomyr',       mode: 'conv',  offer: '50off', monthly: 1050.00, goal: 35 },
  { city: 'Boryspil',       mode: 'conv',  offer: '1grn',  monthly: 690.00,  goal: 23 },
  { city: 'BilaTserkva',    mode: 'conv',  offer: '50off', monthly: 600.00,  goal: 20 },
  { city: 'Lviv',           mode: 'reach', offer: '1grn',  monthly: 2890.58 },
  { city: 'Odessa',         mode: 'reach', offer: '50off', monthly: 2636.00 },
  { city: 'IvanoFrankivsk', mode: 'reach', offer: '50off', monthly: 1556.47 },
  { city: 'Vinnytsia',      mode: 'reach', offer: '1grn',  monthly: 1388.90 },
];

const daily = m => Math.round(m / DAYS * 100);
const campName = p => `AI_Apollo_${p.mode === 'conv' ? 'conversion' : 'reach'}_${p.city}_oct_0110`;
const adsetName = p => `${p.city}_18-65_broad`;

// банери: 3 формати
const IMG_RULES = [
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'] }, image_label: { name: 'st_img' }, priority: 1 },
  { customization_spec: { publisher_platforms: ['facebook'], facebook_positions: ['right_hand_column', 'instream_video', 'marketplace'] }, image_label: { name: 'h_img' }, priority: 2 },
  { customization_spec: {}, image_label: { name: 'sq_img' }, priority: 3 },
];
// відео: порожній customization_spec для відео заборонений (2446501)
const VID_RULES = [
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'] }, video_label: { name: 'st_vid' }, priority: 1 },
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed', 'right_hand_column', 'instream_video', 'marketplace'], instagram_positions: ['stream', 'explore', 'explore_home', 'profile_feed'] }, video_label: { name: 'sq_vid' }, priority: 2 },
];

function plan() {
  let conv = 0, reach = 0;
  console.log('\nЖОВТЕНЬ 2026 — Meta, 8 кампаній (одне місто = одна кампанія)\n');
  for (const mode of ['conv', 'reach']) {
    console.log(mode === 'conv' ? '═══ КОНВЕРСІЇ ═══' : '\n═══ ОХОПЛЕННЯ (REACH + частота ≤8/30дн) ═══');
    for (const p of PLAN.filter(x => x.mode === mode)) {
      const d = daily(p.monthly);
      if (mode === 'conv') conv += p.monthly; else reach += p.monthly;
      const o = OFFER[p.offer];
      const creo = mode === 'conv' ? `банери ${o.banners.join(',')}` : `ролики ${o.videos.join(',')}`;
      console.log(`  ${p.city.padEnd(16)} $${String((d / 100).toFixed(2)).padStart(6)}/д  ($${p.monthly}/міс)  ${p.offer.padEnd(6)} ${creo}${p.goal ? '  ціль ' + p.goal : ''}`);
    }
  }
  console.log(`\nконверсії $${conv.toFixed(2)} + охоплення $${reach.toFixed(2)} = $${(conv + reach).toFixed(2)}/міс`);
  console.log('\n(plan — нічого не створено)');
}

async function uploadBanners() {
  const man = fs.existsSync(CONV_MANIFEST) ? JSON.parse(fs.readFileSync(CONV_MANIFEST, 'utf8')) : {};
  const need = [];
  for (const n of [1, 2, 3, 4, 5, 6]) need.push(`s0${n}.jpg`, `stories0${n}.jpg`, `h0${n}.jpg`);
  if (need.every(f => man[f])) { console.log('♻️  усі 18 банерів уже залиті'); return man; }
  await refreshDropboxToken();
  for (const f of need) {
    if (man[f]) continue;
    const r = await dropboxRequest(t => axios({ method: 'post', url: 'https://content.dropboxapi.com/2/sharing/get_shared_link_file',
      headers: { Authorization: `Bearer ${t}`, 'Dropbox-API-Arg': JSON.stringify({ url: CONV_DROPBOX, path: '/' + f }), 'Content-Type': '' },
      data: '', responseType: 'arraybuffer', maxContentLength: 50 * 1024 * 1024 }));
    const up = await apiPost(`${ACCT}/adimages`, { bytes: Buffer.from(r.data).toString('base64'), name: `oct_${f}` });
    if (up.error) throw new Error(`${f}: ${G.errMsg(up.error)}`);
    man[f] = Object.values(up.images || {})[0].hash;
    fs.writeFileSync(CONV_MANIFEST, JSON.stringify(man, null, 2));
    console.log(`  ⬆️ ${f} → ${man[f].slice(0, 12)}…`);
  }
  return man;
}

async function build() {
  const img = await uploadBanners();
  const vid = JSON.parse(fs.readFileSync(VID_MANIFEST, 'utf8'));
  const known = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '400' })).data || [];
  const made = [];

  for (const p of PLAN) {
    const o = OFFER[p.offer], c = CITY[p.city], nm = campName(p);
    const prior = known.find(x => x.name === nm);
    const camp = prior || await G.createChecked(`${ACCT}/campaigns`, {
      name: nm,
      objective: p.mode === 'conv' ? 'OUTCOME_SALES' : 'OUTCOME_AWARENESS',
      buying_type: 'AUCTION', special_ad_categories: JSON.stringify([]),
      is_adset_budget_sharing_enabled: 'false', status: 'PAUSED',
    }, 'campaign ' + nm);
    console.log(`\n📁 ${nm} — ${camp.id}${prior ? ' (наявна)' : ''}`);

    const liveSets = (await apiGet(`${camp.id}/adsets`, { fields: 'id,name', limit: '20' })).data || [];
    const asName = adsetName(p);
    const extra = p.mode === 'conv'
      ? { optimization_goal: 'OFFSITE_CONVERSIONS', promoted_object: JSON.stringify({ pixel_id: PIXEL_ID, custom_event_type: 'PURCHASE' }) }
      : { optimization_goal: 'IMPRESSIONS' };   // див. коментар про частоту вгорі
    const adset = liveSets.find(x => x.name === asName) || await G.createAdSet({
      name: asName, campaign_id: camp.id,
      billing_event: 'IMPRESSIONS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      daily_budget: String(daily(p.monthly)),
      targeting: broadTargeting(c.geo),
      start_time: START, end_time: END,
      ...extra,
    });
    console.log(`  📂 ${asName} — ${adset.id} | $${(daily(p.monthly) / 100).toFixed(2)}/д`);

    const liveAds = (await apiGet(`${adset.id}/ads`, { fields: 'id,name', limit: '20' })).data || [];
    const items = p.mode === 'conv' ? o.banners : o.videos;
    for (const it of items) {
      const adNm = p.mode === 'conv' ? `0110_${it}` : `0110_${it}`;
      if (liveAds.find(x => x.name === adNm)) { console.log(`     ⏭  ${adNm} вже є`); continue; }

      const spec = p.mode === 'conv'
        ? {
            images: [
              { hash: img[`s0${it}.jpg`],       adlabels: [{ name: 'sq_img' }] },
              { hash: img[`stories0${it}.jpg`], adlabels: [{ name: 'st_img' }] },
              { hash: img[`h0${it}.jpg`],       adlabels: [{ name: 'h_img' }] },
            ],
            titles: [{ text: o.title }],
            asset_customization_rules: IMG_RULES,
          }
        : {
            videos: [
              { video_id: vid[`${it}_sq`].video_id, thumbnail_hash: vid[`${it}_sq`].thumb_hash, adlabels: [{ name: 'sq_vid' }] },
              { video_id: vid[`${it}_st`].video_id, thumbnail_hash: vid[`${it}_st`].thumb_hash, adlabels: [{ name: 'st_vid' }] },
            ],
            titles: [{ text: o.vidTitle }],
            asset_customization_rules: VID_RULES,
          };

      const cr = await G.createChecked(`${ACCT}/adcreatives`, {
        name: `${adNm}_${p.city}_creative`,
        object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
        asset_feed_spec: JSON.stringify({
          ...spec,
          bodies: [{ text: o.body }], descriptions: [{ text: '' }],
          link_urls: [{ website_url: c.link, display_url: 'apollo.online' }],
          call_to_action_types: [p.mode === 'conv' ? 'APPLY_NOW' : 'LEARN_MORE'],
          ad_formats: ['AUTOMATIC_FORMAT'], optimization_type: 'PLACEMENT',
        }),
        url_tags: `utm_source=facebook&utm_medium=${p.mode === 'conv' ? 'conversion' : 'reach'}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}`,
      }, `creative ${adNm} ${p.city}`);

      const ad = await G.createAd({ name: adNm, adset_id: adset.id, creative: { creative_id: cr.id } });
      console.log(`     ✅ ${adNm} — ${ad.id}`);
      made.push({ id: ad.id, name: adNm, city: p.city, mode: p.mode, link: c.link });
    }
  }

  console.log('\n🔍 Звірка (одне оголошення на кампанію):');
  const seen = new Set();
  for (const m of made) {
    if (seen.has(m.city)) continue;
    seen.add(m.city);
    const v = await G.verifyAd(m.id, { link: m.link });
    const p = await G.checkPreviews(m.id, ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY', 'DESKTOP_FEED_STANDARD']);
    console.log(`   ${v.ok && p.ok ? '✅' : '❌'} ${m.city.padEnd(16)} ${m.mode.padEnd(5)} ${m.name} | ${v.problems.join(';') || 'дані ок'} | ${p.INSTAGRAM_STANDARD}/${p.INSTAGRAM_STORY}/${p.DESKTOP_FEED_STANDARD}`);
  }

  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  hist.push({ date: '2026-09-30', campaigns: PLAN.map(campName),
    note: 'Жовтневий план Meta: 4 конверсійні (Київ/Житомир/Бориспіль/БЦ) + 4 охватні (Львів/Одеса/ІФ/Вінниця), одне місто = одна кампанія, широка 18-65 FB+IG+Threads. Охватні REACH + ліміт частоти 8/30дн. Офери: 1грн Київ/Вінниця/Бориспіль/Львів, -50% БЦ/Одеса/Житомир/ІФ. Все PAUSED.' });
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));

  await verify();
  console.log('\n✅ Готово — все PAUSED.');
}

async function verify() {
  const known = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '400' })).data || [];
  console.log('\n📊 Жовтень:');
  let tot = 0;
  for (const p of PLAN) {
    const c = known.find(x => x.name === campName(p));
    if (!c) { console.log(`   ❌ нема ${campName(p)}`); continue; }
    const s = await apiGet(`${c.id}/adsets`, { fields: 'name,status,daily_budget,optimization_goal,frequency_control_specs', limit: '10' });
    for (const a of s.data || []) {
      const b = +a.daily_budget; tot += b;
      const f = a.frequency_control_specs ? ` freq≤${a.frequency_control_specs[0].max_frequency}/${a.frequency_control_specs[0].interval_days}д` : '';
      console.log(`   ${p.city.padEnd(16)} ${p.mode.padEnd(5)} $${String((b / 100).toFixed(2)).padStart(6)}/д  ${a.status.padEnd(7)} ${a.optimization_goal}${f}`);
    }
  }
  console.log(`   ${''.padEnd(16)}       ────────`);
  console.log(`   ${'разом'.padEnd(16)}       $${(tot / 100).toFixed(2)}/д  ≈ $${(tot / 100 * DAYS).toFixed(0)}/міс`);
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'build') await build();
  else if (cmd === 'verify') await verify();
  else plan();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
