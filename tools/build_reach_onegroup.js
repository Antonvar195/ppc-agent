// Reach 399/499, консолідована структура: одна група на місто, 3 креативи всередині.
// Джерело — живі кампанії AI_Apollo_reach_399_0108 / _499_0108, де на кожен креатив
// була окрема група. Креативи не перезаливаються: video_id + thumbnail_hash беруться
// з existing creatives, тому відео ті самі. Бюджет групи = сума трьох старих груп.
// display_url = apollo.online (config/rules.md → ПРАВИЛО ПОСИЛАНЬ).
// Все створюється в PAUSED. Старі кампанії не чіпаються.
// Usage: node tools/build_reach_onegroup.js plan | build
// build ідемпотентний: якщо кампанія з такою назвою вже є — дозбирає те, чого бракує
// (група міста / окреме оголошення), нічого не дублюючи. Meta інколи не відповідає
// на створенні відео-креативу, тому кожен виклик під таймаутом і ретраєм.
const fs = require('fs');
const path = require('path');
const { apiGet: rawGet, apiPost: rawPost } = require('./meta_api');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const CALL_TIMEOUT_MS = 90000;
const CALL_TRIES = 3;

function withTimeout(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${CALL_TIMEOUT_MS / 1000}s: ${label}`)), CALL_TIMEOUT_MS))
  ]);
}
async function retry(fn, label) {
  let last;
  for (let i = 1; i <= CALL_TRIES; i++) {
    try { return await withTimeout(fn(), label); }
    catch (e) {
      last = e;
      console.log(`     ⏳ ${label}: спроба ${i}/${CALL_TRIES} — ${e.message}`);
      await new Promise(r => setTimeout(r, 3000 * i));
    }
  }
  throw last;
}
const apiGet = (p, params) => retry(() => rawGet(p, params), `GET ${p}`);
const apiPost = (p, params) => retry(() => rawPost(p, params), `POST ${p}`);

const ACCT = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const IG_ID = process.env.META_INSTAGRAM_ACTOR_ID;
const END_TIME = '2026-08-31T23:59:00+0300';
const DISPLAY_URL = 'apollo.online';

const SOURCES = [
  { srcId: '120249942789670193', newName: 'AI_Apollo_reach_399_1008' },
  { srcId: '120249943754500193', newName: 'AI_Apollo_reach_499_1008' },
];

// Читає джерельну кампанію і згортає групи по містах
async function readSource(srcId) {
  const camp = await apiGet(srcId, { fields: 'name,objective,buying_type,special_ad_categories' });
  if (camp.error) throw new Error('source campaign: ' + camp.error.message);

  const adsets = await apiGet(`${srcId}/adsets`, {
    fields: 'id,name,daily_budget,optimization_goal,billing_event,bid_strategy,promoted_object,targeting',
    limit: 100
  });
  if (adsets.error) throw new Error('source adsets: ' + adsets.error.message);

  const cities = new Map();
  for (const a of adsets.data) {
    const city = a.name.replace(/_AP\d+$/, ''); // Odessa_18-55_AP01 → Odessa_18-55
    if (!cities.has(city)) {
      cities.set(city, {
        name: city,
        budget: 0,
        optimization_goal: a.optimization_goal,
        billing_event: a.billing_event,
        bid_strategy: a.bid_strategy,
        targeting: a.targeting,
        ads: []
      });
    }
    const c = cities.get(city);
    c.budget += Number(a.daily_budget);

    const ads = await apiGet(`${a.id}/ads`, { fields: 'id,name,creative{id,asset_feed_spec,url_tags}', limit: 50 });
    if (ads.error) throw new Error(`ads of ${a.name}: ${ads.error.message}`);
    for (const ad of (ads.data || [])) c.ads.push({ name: ad.name, srcCreative: ad.creative });
  }

  for (const c of cities.values()) c.ads.sort((x, y) => x.name.localeCompare(y.name));
  return { camp, cities: [...cities.values()] };
}

// Meta повертає targeting з ехо-полями (name, region) — вони не заважають,
// але кастомізаційні спеки обростають age_min/age_max, які ми не задавали.
function cleanRules(rules) {
  return (rules || []).map(r => {
    const spec = { ...r.customization_spec };
    delete spec.age_min; delete spec.age_max;
    const out = { customization_spec: spec, priority: r.priority };
    if (r.video_label) out.video_label = { name: r.video_label.name };
    if (r.image_label) out.image_label = { name: r.image_label.name };
    return out;
  });
}

// Клон asset_feed_spec джерельного креативу + display_url
function cloneAssetFeedSpec(afs) {
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
  if (afs.videos) {
    spec.videos = afs.videos.map(v => ({
      video_id: v.video_id,
      thumbnail_hash: v.thumbnail_hash,
      adlabels: [{ name: v.adlabels[0].name }]
    }));
  }
  if (afs.images) {
    spec.images = afs.images.map(i => ({
      hash: i.hash,
      adlabels: [{ name: i.adlabels[0].name }]
    }));
  }
  return spec;
}

async function plan() {
  for (const s of SOURCES) {
    const { camp, cities } = await readSource(s.srcId);
    console.log(`\n═══ ${camp.name} → ${s.newName} (${camp.objective})`);
    let total = 0;
    for (const c of cities) {
      total += c.budget;
      const geo = c.targeting.geo_locations;
      const where = geo.cities ? geo.cities.map(x => x.name).join(',') : (geo.regions || []).map(x => x.name + ' обл.').join(',');
      console.log(`  📂 ${c.name} | $${c.budget / 100}/д | ${where} | ${c.optimization_goal}/${c.billing_event}`);
      for (const ad of c.ads) {
        const afs = ad.srcCreative.asset_feed_spec;
        const media = (afs.videos || []).map(v => `${v.adlabels[0].name}=${v.video_id}`).join(' ');
        console.log(`     • ${ad.name} "${afs.titles[0].text}" → ${afs.link_urls[0].website_url}`);
        console.log(`       ${media}`);
      }
    }
    console.log(`  Разом: ${cities.length} груп, ${cities.reduce((n, c) => n + c.ads.length, 0)} оголошень, $${total / 100}/день`);
  }
  console.log('\n(plan — нічого не створено)');
}

// Шукає вже створену кампанію з такою назвою — щоб build можна було перезапустити
async function findCampaign(name) {
  const r = await apiGet(`${ACCT}/campaigns`, { fields: 'id,name', filtering: JSON.stringify([{ field: 'name', operator: 'EQUAL', value: name }]), limit: 5 });
  return (r.data || []).find(c => c.name === name) || null;
}

async function build() {
  const startTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const logEntries = [];

  for (const s of SOURCES) {
    const { camp, cities } = await readSource(s.srcId);
    console.log(`\n═══ ${s.newName} (з ${camp.name})`);

    let newCamp = await findCampaign(s.newName);
    if (newCamp) {
      console.log(`📁 campaign ${newCamp.id} — вже існує, дозбираю`);
    } else {
      newCamp = await apiPost(`${ACCT}/campaigns`, {
        name: s.newName,
        objective: camp.objective,
        buying_type: camp.buying_type || 'AUCTION',
        special_ad_categories: JSON.stringify([]),
        is_adset_budget_sharing_enabled: 'false',
        status: 'PAUSED'
      });
      if (newCamp.error) throw new Error('campaign: ' + newCamp.error.message);
      console.log('📁 campaign', newCamp.id);
    }

    // Що вже є в цільовій кампанії
    const existingAdsets = new Map();
    const got = await apiGet(`${newCamp.id}/adsets`, { fields: 'id,name', limit: 100 });
    for (const a of (got.data || [])) {
      const ads = await apiGet(`${a.id}/ads`, { fields: 'name', limit: 50 });
      existingAdsets.set(a.name, { id: a.id, ads: new Set((ads.data || []).map(x => x.name)) });
    }

    const entry = { date: '2026-08-10', campaign_name: s.newName, campaign_id: newCamp.id, adsets: [], ads_count: 0 };

    for (const c of cities) {
      let target = existingAdsets.get(c.name);
      if (target) {
        console.log(`  📂 ${c.name} — ${target.id} (є) | ${target.ads.size}/${c.ads.length} оголошень`);
      } else {
        const adset = await apiPost(`${ACCT}/adsets`, {
          name: c.name,
          campaign_id: newCamp.id,
          optimization_goal: c.optimization_goal,
          billing_event: c.billing_event,
          bid_strategy: c.bid_strategy || 'LOWEST_COST_WITHOUT_CAP',
          daily_budget: String(c.budget),
          promoted_object: JSON.stringify({ page_id: PAGE_ID }),
          targeting: JSON.stringify(c.targeting),
          start_time: startTime,
          end_time: END_TIME,
          status: 'PAUSED'
        });
        if (adset.error) throw new Error(`adset "${c.name}": ${adset.error.error_user_msg || adset.error.message}`);
        target = { id: adset.id, ads: new Set() };
        console.log(`  📂 ${c.name} — ${adset.id} | $${c.budget / 100}/д`);
      }

      for (const ad of c.ads) {
        if (target.ads.has(ad.name)) { console.log(`     ↷ ${ad.name} вже є`); entry.ads_count++; continue; }

        const afs = cloneAssetFeedSpec(ad.srcCreative.asset_feed_spec);
        const creative = await apiPost(`${ACCT}/adcreatives`, {
          name: `${c.name}_${ad.name}`,
          object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
          asset_feed_spec: JSON.stringify(afs),
          url_tags: ad.srcCreative.url_tags
        });
        if (creative.error) throw new Error(`creative ${c.name}/${ad.name}: ${creative.error.error_user_msg || creative.error.message}`);

        const newAd = await apiPost(`${ACCT}/ads`, {
          name: ad.name,
          adset_id: target.id,
          creative: JSON.stringify({ creative_id: creative.id }),
          status: 'PAUSED'
        });
        if (newAd.error) throw new Error(`ad ${c.name}/${ad.name}: ${newAd.error.error_user_msg || newAd.error.message}`);
        console.log(`     ✅ ${ad.name} — ad ${newAd.id} | creative ${creative.id}`);
        entry.ads_count++;
      }
      entry.adsets.push({ name: c.name, id: target.id, budget_usd: c.budget / 100, ads: c.ads.length });
    }
    logEntries.push(entry);
  }

  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  for (const e of logEntries) {
    e.note = 'Консолідована структура: одна група на місто, 3 креативи всередині. Аналог AI_Apollo_reach_*_0108 (там група на кожен креатив). Бюджет групи = сума трьох старих. Кінець 31.08.';
    hist.push(e);
  }
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));

  console.log('\n✅ DONE — все в PAUSED, старт по активації, кінець 31.08 23:59');
  logEntries.forEach(e => console.log(`   ${e.campaign_name} ${e.campaign_id}: ${e.adsets.length} груп / ${e.ads_count} оголошень`));
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'plan') await plan();
  else if (cmd === 'build') await build();
  else console.log('cmd: plan | build');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
