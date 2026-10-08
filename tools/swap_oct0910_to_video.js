// Уточнення до TZ_reach_oct_switch: в охватних кампаніях мають бути ВІДЕО
// за офферною розкладкою жовтня, а не банери з конверсійних кампаній.
//
//   1 грн  → Київ, Бориспіль   (ролики A1-A3)
//   −50%   → Житомир, БЦ        (ролики B1-B3)
//
// Ролики — ті самі, що в живих охватних oct_0110 (залиті у вересні).
// Текст, заголовок і правила адаптації — дослівно як у живих охватних;
// посилання — на клуб свого міста.
//
// Банерні оголошення з ТЗ видаляються: кампанії PAUSED, витрат не було.
// Usage: node tools/swap_oct0910_to_video.js plan | apply
const fs = require('fs');
const path = require('path');
const https = require('https');
const G = require('./meta_guard');
const { apiGet, apiPost } = require('./meta_api');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const IG_ID = process.env.META_INSTAGRAM_ACTOR_ID || '17841447539432480';
const TOKEN = process.env.META_ACCESS_TOKEN;
const VIDS = JSON.parse(fs.readFileSync(path.join(__dirname, '../history/sept_vids_manifest.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const URL_TAGS = 'utm_source=facebook&utm_medium=reach&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';

const BODY_1GRN = `Лети до мети з APOLLO NEXT 🧡

Перший тиждень спорту — 1 грн. Без зобовʼязань: приходь, дивись, пробуй.

▫️ 48 групових тренувань на тиждень
▫️ План тренувань і харчування
▫️ Безкоштовне перше тренування з тренером
▫️ З 06:30 до 23:00

Працюємо у «жовту» тривогу — графік тренувань лишається твоїм.

Акція діє з 01.10 до 31.10.2026.`;

const BODY_50OFF = `Лети до мети з APOLLO NEXT 🧡

−50% на спорт: чотири тижні за півціни, щоб звичка встигла зʼявитись.

▫️ 48 групових тренувань на тиждень
▫️ План тренувань і харчування
▫️ Безкоштовне перше тренування з тренером
▫️ З 06:30 до 23:00, без обмежень по годинах

Працюємо у «жовту» тривогу — графік тренувань лишається твоїм.

Акція діє з 01.10 до 31.10.2026.`;

const OFFERS = {
  '1grn':  { title: 'Перший тиждень — 1 ₴',      body: BODY_1GRN,  vids: ['A1', 'A2', 'A3'] },
  '50off': { title: '−50% на перші 4 тижні',      body: BODY_50OFF, vids: ['B1', 'B2', 'B3'] },
};

const CITIES = [
  { city: 'Kyiv',        campaign: 'AI_Apollo_reach_Kyiv_oct_0910',        offer: '1grn',  link: 'https://apollo.online/clubs/kyyiv/' },
  { city: 'Boryspil',    campaign: 'AI_Apollo_reach_Boryspil_oct_0910',    offer: '1grn',  link: 'https://apollo.online/clubs/apollo-next-027-czum-kyyivskyj-shlyah/' },
  { city: 'Zhytomyr',    campaign: 'AI_Apollo_reach_Zhytomyr_oct_0910',    offer: '50off', link: 'https://apollo.online/clubs/apollo-next-041-yarmarok/' },
  { city: 'BilaTserkva', campaign: 'AI_Apollo_reach_BilaTserkva_oct_0910', offer: '50off', link: 'https://apollo.online/clubs/apollo-next-035/' },
];

// порожній customization_spec для відео заборонений (2446501)
const RULES = [
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'] }, video_label: { name: 'st_vid' }, priority: 1 },
  { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed', 'right_hand_column', 'instream_video', 'marketplace'], instagram_positions: ['stream', 'explore', 'explore_home', 'profile_feed'] }, video_label: { name: 'sq_vid' }, priority: 2 },
];

const apiDelete = node => new Promise((res, rej) => {
  const q = new URLSearchParams({ access_token: TOKEN }).toString();
  const r = https.request({ hostname: 'graph.facebook.com', path: `/v21.0/${node}?${q}`, method: 'DELETE' },
    x => { let d = ''; x.on('data', c => d += c); x.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); });
  r.on('error', rej); r.end();
});

async function resolve() {
  const all = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name,effective_status', limit: '400' })).data || [];
  const out = [];
  for (const c of CITIES) {
    const camp = all.find(x => x.name === c.campaign);
    if (!camp) throw new Error('нема кампанії ' + c.campaign);
    const s = (await apiGet(`${camp.id}/adsets`, { fields: 'id,name,status,daily_budget,targeting', limit: '5' })).data || [];
    const ads = (await apiGet(`${s[0].id}/ads`, { fields: 'id,name,status', limit: '20' })).data || [];
    out.push({ ...c, campId: camp.id, campStatus: camp.effective_status, adset: s[0], ads });
  }
  return out;
}

async function plan() {
  const rows = await resolve();
  console.log('\nЗаміна банерів на відео в охватних oct_0910\n');
  for (const r of rows) {
    const o = OFFERS[r.offer];
    console.log(`📁 ${r.city.padEnd(13)} ${r.offer.padEnd(6)} ${r.campStatus}  $${(+r.adset.daily_budget / 100).toFixed(2)}/д  вік ${r.adset.targeting.age_min}-${r.adset.targeting.age_max}`);
    console.log(`     видалити: ${r.ads.map(a => a.name).join(', ') || '—'}`);
    console.log(`     створити: ${o.vids.map(v => '0910_' + v).join(', ')}  «${o.title}»`);
    console.log(`     лінк: ${r.link}`);
  }
  const live = rows.filter(r => r.campStatus === 'ACTIVE');
  if (live.length) console.log(`\n⚠️ ${live.length} кампанії(й) ЖИВІ — заміна зачепить відкрут`);
  else console.log('\n✅ усі чотири PAUSED — заміна безпечна, витрат не було');
  console.log('\n(plan — нічого не змінено)');
}

async function apply() {
  const rows = await resolve();
  const liveOnes = rows.filter(r => r.campStatus === 'ACTIVE');
  if (liveOnes.length) throw new Error(`кампанії ${liveOnes.map(r => r.city).join(', ')} ЖИВІ — зупини або підтверди окремо`);

  const made = [];
  for (const r of rows) {
    const o = OFFERS[r.offer];
    console.log(`\n📁 ${r.city} (${r.offer})`);

    for (const a of r.ads) {
      const d = await apiDelete(a.id);
      console.log(`   🗑  ${a.name} ${d.error ? '❌ ' + d.error.message.slice(0, 50) : 'видалено'}`);
    }

    for (const v of o.vids) {
      const sq = VIDS[`${v}_sq`], st = VIDS[`${v}_st`];
      if (!sq || !st) throw new Error('нема ролика ' + v + ' у маніфесті');
      const cr = await G.createChecked(`${ACCT}/adcreatives`, {
        name: `0910_${v}_${r.city}_creative`,
        object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
        asset_feed_spec: JSON.stringify({
          videos: [
            { video_id: sq.video_id, thumbnail_hash: sq.thumb_hash, adlabels: [{ name: 'sq_vid' }] },
            { video_id: st.video_id, thumbnail_hash: st.thumb_hash, adlabels: [{ name: 'st_vid' }] },
          ],
          bodies: [{ text: o.body }], titles: [{ text: o.title }], descriptions: [{ text: '' }],
          link_urls: [{ website_url: r.link, display_url: 'apollo.online' }],
          call_to_action_types: ['LEARN_MORE'],
          ad_formats: ['AUTOMATIC_FORMAT'], optimization_type: 'PLACEMENT',
          asset_customization_rules: RULES,
        }),
        url_tags: URL_TAGS,
      }, `creative 0910_${v} ${r.city}`);
      const ad = await G.createAd({ name: `0910_${v}`, adset_id: r.adset.id, creative: { creative_id: cr.id } });
      console.log(`   ✅ 0910_${v} — ${ad.id}`);
      made.push({ id: ad.id, name: `0910_${v}`, city: r.city, link: r.link, creativeId: cr.id,
                  thumbs: [sq.thumb_hash, st.thumb_hash] });
      await sleep(1000);
    }
  }

  console.log('\n🔍 Звірка:');
  const seen = new Set();
  for (const m of made) {
    if (seen.has(m.city)) continue;
    seen.add(m.city);
    const v = await G.verifyAd(m.id, { creativeId: m.creativeId, thumbHashes: m.thumbs, link: m.link });
    const p = await G.checkPreviews(m.id, ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY', 'DESKTOP_FEED_STANDARD']);
    console.log(`   ${v.ok && p.ok ? '✅' : '❌'} ${m.city.padEnd(13)} ${m.name} ${v.status} | ${v.problems.join(';') || 'дані ок'} | ${p.INSTAGRAM_STANDARD}/${p.INSTAGRAM_STORY}/${p.DESKTOP_FEED_STANDARD}`);
  }

  console.log('\n📊 Підсумок:');
  for (const r of await resolve()) {
    const ads = r.ads.length ? r.ads : (await apiGet(`${r.adset.id}/ads`, { fields: 'name', limit: '20' })).data || [];
    console.log(`   ${r.city.padEnd(13)} ${r.campStatus.padEnd(7)} $${(+r.adset.daily_budget / 100).toFixed(2)}/д  оголошення: ${ads.map(a => a.name).sort().join(', ')}`);
  }
}

const cmd = process.argv[2];
(async () => { if (cmd === 'apply') await apply(); else await plan(); })()
  .catch(e => { console.error('❌', e.message); process.exit(1); });
