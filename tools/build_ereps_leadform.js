// AI_Apollo_leads_All_EREPS_1609 — повний аналог A_EREPS_1203 на лід-формах.
//
// Те саме, що в оригіналі: 7 груп, їхні гео/вік/бюджети, ті самі 9 оголошень
// (ті самі картинки, тексти, заголовки, адаптація під плейсменти).
//
// Відмінності — тільки те, що вимагає лід-форма:
//   ціль кампанії   OUTCOME_SALES      → OUTCOME_LEADS
//   оптимізація     OFFSITE_CONVERSIONS → LEAD_GENERATION
//   promoted_object пиксель+конверсія   → {page_id}
//   destination     UNDEFINED           → ON_AD
//   креатив         link_urls на лендінг → call_to_actions з lead_gen_form_id
//   вік             17-...              → 18-... (див. нижче)
//
// ⚠️ Вік: Meta забороняє лід-форми на аудиторію молодше 18 (subcode 1885176).
// В оригіналі 6 із 7 груп мають age_min 17, тут вони підняті до 18. Це єдине
// місце, де повний аналог неможливий — обмеження платформи, не вибір.
//
// Форма — Academy lead-form 1706-copy (перевірена робоча структура креативу:
// asset_feed_spec.call_to_actions, а не link_urls). Замінити на свою:
// поміняти LEAD_FORM_ID і перезапустити build — креативи переробляться.
//
// Все PAUSED. Usage: node tools/build_ereps_leadform.js plan | build | verify
const fs = require('fs');
const path = require('path');
const G = require('./meta_guard');
const { apiGet, apiPost } = require('./meta_api');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const IG_ID = process.env.META_INSTAGRAM_ACTOR_ID || '17841447539432480';

const SRC_CAMPAIGN = '120240881962870193';          // A_EREPS_1203
const CAMPAIGN_NAME = 'AI_Apollo_leads_All_EREPS_1609';
const LEAD_FORM_ID = '1123200918911955';            // Academy lead-form 1706-copy
const URL_TAGS = 'utm_source=facebook&utm_medium=leadform&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';

// Порядок картинок у оригіналі: [0] — сторіс, [1] — стрічка (звірено за
// asset_customization_rules: правило priority 1 = story/reels бере images[0]).
const RULES = [
  { customization_spec: { publisher_platforms: ['instagram'], instagram_positions: ['story', 'reels'] }, image_label: { name: 'st_img' }, priority: 1 },
  { customization_spec: {}, image_label: { name: 'sq_img' }, priority: 2 },
];

// Лід-форми не показуються людям молодше 18 (1885176) — піднімаємо мінімум.
function leadSafeTargeting(src, adsetName) {
  const t = JSON.parse(JSON.stringify(src));
  if (t.age_min !== undefined && t.age_min < 18) {
    console.log(`   ⚠️  ${adsetName}: вік ${t.age_min}-${t.age_max} → 18-${t.age_max} (лід-форми від 18)`);
    t.age_min = 18;
  }
  return t;
}

async function readSource() {
  const c = await apiGet(SRC_CAMPAIGN, { fields: 'name,objective' });
  if (c.error) throw new Error('джерело: ' + G.errMsg(c.error));
  const s = await apiGet(`${SRC_CAMPAIGN}/adsets`, { fields: 'id,name,status,daily_budget,billing_event,bid_strategy,targeting,attribution_spec,start_time,end_time', limit: '50' });
  if (s.error) throw new Error('групи джерела: ' + G.errMsg(s.error));
  const adsets = [];
  const creatives = {};
  for (const a of s.data || []) {
    const ads = await apiGet(`${a.id}/ads`, { fields: 'name,status,creative{asset_feed_spec,url_tags}', limit: '30' });
    if (ads.error) throw new Error(`оголошення ${a.name}: ${G.errMsg(ads.error)}`);
    adsets.push({ ...a, ads: (ads.data || []).map(x => ({ name: x.name, status: x.status })) });
    for (const x of ads.data || []) {
      if (creatives[x.name]) continue;
      const f = x.creative.asset_feed_spec || {};
      creatives[x.name] = {
        st: f.images[0].hash, sq: f.images[1].hash,
        body: f.bodies[0].text, title: f.titles[0].text,
        link: (f.link_urls[0] || {}).website_url,
      };
    }
  }
  return { campaign: c, adsets, creatives };
}

async function plan() {
  const src = await readSource();
  console.log(`\n${CAMPAIGN_NAME} — аналог «${src.campaign.name}» на лід-формах\n`);
  console.log(`   лід-форма: ${LEAD_FORM_ID} (Academy lead-form 1706-copy)`);
  console.log(`   OUTCOME_LEADS · LEAD_GENERATION · destination ON_AD\n`);
  let total = 0;
  for (const a of src.adsets) {
    total += (+a.daily_budget || 0);
    const t = a.targeting, g = t.geo_locations || {};
    const geo = [...(g.regions || []).map(x => x.name + '(обл)'), ...(g.cities || []).map(x => x.name)].join(',');
    const age = t.age_min < 18 ? `${t.age_min}→18-${t.age_max}` : `${t.age_min}-${t.age_max}`;
    console.log(`   📂 ${a.name.padEnd(48)} $${String((+a.daily_budget || 0) / 100).padStart(3)}/д  ${age.padEnd(9)} ${geo}`);
    console.log(`        ${a.ads.map(x => x.name).sort().join(', ')}`);
  }
  console.log(`\nРазом: ${src.adsets.length} груп, ${Object.keys(src.creatives).length} унікальних оголошень, $${total / 100}/день`);
  console.log('\n(plan — нічого не створено)');
}

async function build() {
  const src = await readSource();
  console.log(`📋 структуру прочитано з «${src.campaign.name}»: ${src.adsets.length} груп, ${Object.keys(src.creatives).length} оголошень`);

  const all = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '400' })).data || [];
  const prior = all.find(x => x.name === CAMPAIGN_NAME);
  const camp = prior || await G.createChecked(`${ACCT}/campaigns`, {
    name: CAMPAIGN_NAME, objective: 'OUTCOME_LEADS', buying_type: 'AUCTION',
    special_ad_categories: JSON.stringify([]), is_adset_budget_sharing_enabled: 'false', status: 'PAUSED',
  }, 'campaign');
  console.log(`\n📁 ${CAMPAIGN_NAME} — ${camp.id}${prior ? ' (наявна)' : ''}`);

  // креативи з лід-формою — по одному на оголошення, спільні для всіх груп
  const creativeIds = {};
  const known = [];
  for (let after = '', page = 0; page < 12; page++) {
    const r = await apiGet(`${ACCT}/adcreatives`, { fields: 'id,name', limit: '200', ...(after ? { after } : {}) });
    known.push(...(r.data || []));
    after = ((r.paging || {}).cursors || {}).after;
    if (!after || !(r.data || []).length) break;
  }
  for (const [name, c] of Object.entries(src.creatives)) {
    const reuse = known.find(x => x.name === `${name}_${LEAD_FORM_ID}_leadform`);
    if (reuse) { creativeIds[name] = reuse.id; console.log(`  ♻️  ${name} — ${reuse.id} (наявний)`); continue; }
    const cr = await G.createChecked(`${ACCT}/adcreatives`, {
      name: `${name}_${LEAD_FORM_ID}_leadform`,
      object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
      asset_feed_spec: JSON.stringify({
        images: [{ hash: c.sq, adlabels: [{ name: 'sq_img' }] }, { hash: c.st, adlabels: [{ name: 'st_img' }] }],
        bodies: [{ text: c.body }], titles: [{ text: c.title }], descriptions: [{ text: '' }],
        // Лід-форма живе в call_to_actions. link_urls теж ОБОВʼЯЗКОВІ:
        // при asset_customization_rules Meta вимагає посилання (1885800),
        // хоча для lead ads воно не відкривається — клік веде у форму.
        link_urls: [{ website_url: c.link, display_url: 'apollo.online' }],
        call_to_actions: [{ type: 'APPLY_NOW', value: { lead_gen_form_id: LEAD_FORM_ID } }],
        ad_formats: ['AUTOMATIC_FORMAT'], optimization_type: 'PLACEMENT',
        asset_customization_rules: RULES,
      }),
      url_tags: URL_TAGS,
    }, `creative ${name}`);
    creativeIds[name] = cr.id;
    console.log(`  🎨 ${name} — ${cr.id}`);
  }

  const liveSets = (await apiGet(`${camp.id}/adsets`, { fields: 'id,name,daily_budget', limit: '50' })).data || [];
  const made = [];
  for (const a of src.adsets) {
    const had = liveSets.find(x => x.name === a.name);
    const adset = had || await G.createAdSet({
      name: a.name, campaign_id: camp.id,
      optimization_goal: 'LEAD_GENERATION',
      billing_event: 'IMPRESSIONS',
      bid_strategy: a.bid_strategy || 'LOWEST_COST_WITHOUT_CAP',
      daily_budget: String(a.daily_budget),
      destination_type: 'ON_AD',
      promoted_object: JSON.stringify({ page_id: PAGE_ID }),
      targeting: leadSafeTargeting(a.targeting, a.name),
    });
    console.log(`  📂 ${a.name.padEnd(48)} ${adset.id} | $${(+a.daily_budget) / 100}/д${had ? ' (наявна)' : ''}`);

    const liveAds = (await apiGet(`${adset.id}/ads`, { fields: 'id,name', limit: '50' })).data || [];
    for (const ad of a.ads) {
      const was = liveAds.find(x => x.name === ad.name);
      if (was) { console.log(`     ⏭  ${ad.name} вже є`); made.push({ id: was.id, name: ad.name, adset: a.name }); continue; }
      const created = await G.createAd({ name: ad.name, adset_id: adset.id, creative: { creative_id: creativeIds[ad.name] } });
      console.log(`     ✅ ${ad.name} — ${created.id}`);
      made.push({ id: created.id, name: ad.name, adset: a.name, creativeId: creativeIds[ad.name] });
    }
  }

  console.log('\n🔍 Звірка (по одному оголошенню з групи):');
  const seen = new Set();
  for (const m of made) {
    if (seen.has(m.adset)) continue;
    seen.add(m.adset);
    const r = await apiGet(m.id, { fields: 'name,status,creative{id,asset_feed_spec}' });
    const f = (r.creative || {}).asset_feed_spec || {};
    const form = ((f.call_to_actions || [])[0] || {}).value || {};
    const p = await G.checkPreviews(m.id, ['INSTAGRAM_STANDARD', 'INSTAGRAM_STORY']);
    const ok = form.lead_gen_form_id === LEAD_FORM_ID && p.ok;
    console.log(`   ${ok ? '✅' : '❌'} ${m.adset.padEnd(48)} ${m.name} | форма ${form.lead_gen_form_id || 'НЕМА'} | ${p.INSTAGRAM_STANDARD}/${p.INSTAGRAM_STORY}`);
  }

  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  hist.push({ date: '2026-09-16', campaign_name: CAMPAIGN_NAME, campaign_id: camp.id,
    note: `Аналог A_EREPS_1203 на лід-формах. Та сама структура, гео, бюджети й оголошення; змінені лише ціль (OUTCOME_LEADS/LEAD_GENERATION), promoted_object (page_id) і креатив (call_to_actions з lead_gen_form_id ${LEAD_FORM_ID}). Форма тимчасова — замінити вручну. Все PAUSED.` });
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));

  console.log(`\n📊 ${CAMPAIGN_NAME}:`);
  G.printSummary(await G.campaignSummary(camp.id));
  console.log('\n✅ Готово — все PAUSED.');
}

async function verify() {
  const all = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', limit: '400' })).data || [];
  const c = all.find(x => x.name === CAMPAIGN_NAME);
  if (!c) throw new Error('кампанію не знайдено');
  G.printSummary(await G.campaignSummary(c.id));
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'plan') await plan();
  else if (cmd === 'build') await build();
  else if (cmd === 'verify') await verify();
  else console.log('cmd: plan | build | verify');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
