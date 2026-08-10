// Переробка вимкненої конверсійної AI_Apollo_sales_Kyiv_040_0108 в охватну.
// Було: 3 групи (local / engagement / advantage) по $30/д, в кожній те саме
// оголошення 0108_1. Стало: одна група, один креатив (той самий), $30/д.
// Гео зберігається — всі три custom_locations старих груп об'єднані в одну групу.
// Креатив клонується з джерела (ті самі image hash), змінюються тільки
// utm_medium=reach і display_url=apollo.online (config/rules.md).
// Все в PAUSED. Usage: node tools/build_reach_040.js plan | build
const fs = require('fs');
const path = require('path');
const { apiGet: rawGet, apiPost: rawPost } = require('./meta_api');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const IG_ID = process.env.META_INSTAGRAM_ACTOR_ID;

const SRC_CAMPAIGN = '120249881354580193'; // AI_Apollo_sales_Kyiv_040_0108
const NEW_NAME = 'AI_Apollo_reach_Kyiv_040_1008';
const ADSET_NAME = 'Kyiv040_18-50';
const AD_NAME = '1008_1';
const DAILY_BUDGET = 3000; // $30
const END_TIME = '2026-08-31T23:59:00+0300'; // акція в тексті креативу — до 31.08
const AGE = { age_min: 18, age_max: 50 };
const DISPLAY_URL = 'apollo.online';
const URL_TAGS = 'utm_source=facebook&utm_medium=reach&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';

const CALL_TIMEOUT_MS = 90000;
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

// Збирає з джерельної кампанії: всі точки гео, всі плейсменти, креатив оголошення
async function readSource() {
  const camp = await apiGet(SRC_CAMPAIGN, { fields: 'name,objective' });
  const adsets = await apiGet(`${SRC_CAMPAIGN}/adsets`, { fields: 'id,name,daily_budget,targeting', limit: 50 });

  const locations = [];
  const igPos = new Set();
  const thPos = new Set();
  let creativeId = null;

  for (const a of adsets.data) {
    const t = a.targeting || {};
    for (const loc of ((t.geo_locations || {}).custom_locations || [])) {
      const dup = locations.some(l => l.latitude === loc.latitude && l.longitude === loc.longitude);
      if (!dup) locations.push({
        distance_unit: loc.distance_unit, latitude: loc.latitude, longitude: loc.longitude,
        radius: loc.radius, primary_city_id: loc.primary_city_id, region_id: loc.region_id, country: loc.country
      });
    }
    (t.instagram_positions || []).forEach(p => igPos.add(p));
    (t.threads_positions || []).forEach(p => thPos.add(p));

    const ads = await apiGet(`${a.id}/ads`, { fields: 'name,creative{id,asset_feed_spec}', limit: 20 });
    for (const ad of (ads.data || [])) if (!creativeId) creativeId = ad.creative.id;
  }

  const creative = await apiGet(creativeId, { fields: 'id,name,asset_feed_spec' });
  return { camp, srcAdsets: adsets.data, locations, igPos: [...igPos], thPos: [...thPos], creative };
}

function buildTargeting(locations, igPos, thPos) {
  return {
    ...AGE,
    geo_locations: { custom_locations: locations, location_types: ['home', 'recent'] },
    publisher_platforms: ['instagram', 'threads'],
    instagram_positions: igPos,
    threads_positions: thPos,
    device_platforms: ['mobile', 'desktop'],
    targeting_automation: { advantage_audience: 0, individual_setting: { geo: 0 } },
  };
}

function cleanRules(rules) {
  return (rules || []).map(r => {
    const spec = { ...r.customization_spec };
    delete spec.age_min; delete spec.age_max;
    const out = { customization_spec: spec, priority: r.priority };
    if (r.image_label) out.image_label = { name: r.image_label.name };
    if (r.video_label) out.video_label = { name: r.video_label.name };
    return out;
  });
}

function cloneSpec(afs) {
  const spec = {
    bodies: afs.bodies.map(b => ({ text: b.text })),
    titles: afs.titles.map(t => ({ text: t.text })),
    descriptions: (afs.descriptions || [{ text: '' }]).map(d => ({ text: d.text })),
    link_urls: afs.link_urls.map(l => ({ website_url: l.website_url, display_url: DISPLAY_URL })),
    call_to_action_types: afs.call_to_action_types,
    ad_formats: afs.ad_formats || ['AUTOMATIC_FORMAT'],
    optimization_type: afs.optimization_type || 'PLACEMENT',
    asset_customization_rules: cleanRules(afs.asset_customization_rules),
  };
  if (afs.images) spec.images = afs.images.map(i => ({ hash: i.hash, adlabels: [{ name: i.adlabels[0].name }] }));
  if (afs.videos) spec.videos = afs.videos.map(v => ({ video_id: v.video_id, thumbnail_hash: v.thumbnail_hash, adlabels: [{ name: v.adlabels[0].name }] }));
  return spec;
}

async function plan() {
  const src = await readSource();
  const afs = src.creative.asset_feed_spec;
  console.log(`\nБуло: ${src.camp.name} (${src.camp.objective})`);
  src.srcAdsets.forEach(a => console.log(`  • ${a.name} — $${a.daily_budget / 100}/д`));
  console.log(`\nСтане: ${NEW_NAME} (OUTCOME_AWARENESS / REACH)`);
  console.log(`  📂 ${ADSET_NAME} — $${DAILY_BUDGET / 100}/д | вік ${AGE.age_min}-${AGE.age_max} | кінець ${END_TIME}`);
  console.log(`     гео: ${src.locations.length} точки радіусом ${src.locations[0].radius} ${src.locations[0].distance_unit}`);
  src.locations.forEach(l => console.log(`       ${l.latitude}, ${l.longitude}`));
  console.log(`     плейсменти: instagram ${src.igPos.join(',')} | threads ${src.thPos.join(',')}`);
  console.log(`     • ${AD_NAME} "${afs.titles[0].text}"`);
  console.log(`       креатив ${src.creative.id} → клон, images ${(afs.images || []).map(i => i.adlabels[0].name + '=' + i.hash.slice(0, 8)).join(' ')}`);
  console.log(`       ${afs.link_urls[0].website_url} | display ${DISPLAY_URL}`);
  console.log(`       ${URL_TAGS}`);
  console.log('\n(plan — нічого не створено)');
}

async function build() {
  const src = await readSource();
  const startTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const camp = await apiPost(`${ACCT}/campaigns`, {
    name: NEW_NAME,
    objective: 'OUTCOME_AWARENESS',
    buying_type: 'AUCTION',
    special_ad_categories: JSON.stringify([]),
    is_adset_budget_sharing_enabled: 'false',
    status: 'PAUSED'
  });
  if (camp.error) throw new Error('campaign: ' + camp.error.message);
  console.log('📁 campaign', camp.id);

  const adset = await apiPost(`${ACCT}/adsets`, {
    name: ADSET_NAME,
    campaign_id: camp.id,
    optimization_goal: 'REACH',
    billing_event: 'IMPRESSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    daily_budget: String(DAILY_BUDGET),
    promoted_object: JSON.stringify({ page_id: PAGE_ID }),
    targeting: JSON.stringify(buildTargeting(src.locations, src.igPos, src.thPos)),
    start_time: startTime,
    end_time: END_TIME,
    status: 'PAUSED'
  });
  if (adset.error) throw new Error(`adset: ${adset.error.error_user_msg || adset.error.message}`);
  console.log(`  📂 ${ADSET_NAME} — ${adset.id} | $${DAILY_BUDGET / 100}/д`);

  const creative = await apiPost(`${ACCT}/adcreatives`, {
    name: `${ADSET_NAME}_${AD_NAME}`,
    object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
    asset_feed_spec: JSON.stringify(cloneSpec(src.creative.asset_feed_spec)),
    url_tags: URL_TAGS
  });
  if (creative.error) throw new Error(`creative: ${creative.error.error_user_msg || creative.error.message}`);

  const ad = await apiPost(`${ACCT}/ads`, {
    name: AD_NAME,
    adset_id: adset.id,
    creative: JSON.stringify({ creative_id: creative.id }),
    status: 'PAUSED'
  });
  if (ad.error) throw new Error(`ad: ${ad.error.error_user_msg || ad.error.message}`);
  console.log(`     ✅ ${AD_NAME} — ad ${ad.id} | creative ${creative.id}`);

  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  hist.push({
    date: '2026-08-10', campaign_name: NEW_NAME, campaign_id: camp.id,
    adsets: [{ name: ADSET_NAME, id: adset.id, budget_usd: DAILY_BUDGET / 100, ads: 1 }], ads_count: 1,
    note: `Охватна переробка вимкненої ${src.camp.name}: 3 групи → одна аудиторія, той самий креатив, гео об'єднане (${src.locations.length} точки), $${DAILY_BUDGET / 100}/д, кінець 31.08.`
  });
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));

  console.log('\n✅ DONE — PAUSED, старт по активації, кінець 31.08 23:59');
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'plan') await plan();
  else if (cmd === 'build') await build();
  else console.log('cmd: plan | build');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
