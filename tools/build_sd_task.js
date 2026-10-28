// Збірка таска short-drama з брифу (sd-brief/1) → Meta, усе PAUSED.
//
// Бриф готує реєстр short-drama (`npm run brief -- --task N` у ../short-drama):
// кампанія, група, таргетинг, оголошення з ГОТОВИМИ іменами, файли й тексти.
// Цей інструмент нічого не вигадує:
//   - імена оголошень беремо з брифу дослівно — це ключ звʼязку з CRM (utm_content);
//   - UTM беремо з брифу (формат short-drama);
//   - запис лише через meta_guard: validate_only, PAUSED, явний attribution_spec.
// Результат (sd-result/1) пишемо в brief.result_path; його забирає
// `npm run sync-launch` у short-drama і записує ID у реєстр.
//
// Usage: node tools/build_sd_task.js plan|build|verify <шлях до брифу>
const fs = require('fs');
const path = require('path');
const G = require('./meta_guard');
const { apiGet, apiPost } = require('./meta_api');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const PREVIEW_FORMATS = ['INSTAGRAM_STORY', 'INSTAGRAM_REELS', 'FACEBOOK_STORY_MOBILE', 'FACEBOOK_REELS_MOBILE'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadBrief(file) {
  if (!file) throw new Error('вкажи шлях до брифу: node tools/build_sd_task.js plan <brief.json>');
  const b = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (b.schema !== 'sd-brief/1') throw new Error(`очікувався sd-brief/1, отримано ${b.schema}`);
  if (b.account_id !== ACCT) throw new Error(`бриф для ${b.account_id}, а ppc-agent працює з ${ACCT}`);
  if (!/^AI_Apollo_/.test(b.campaign.name)) throw new Error(`кампанія «${b.campaign.name}» — агентські кампанії мають починатися з AI_Apollo_ (rules.md)`);
  if (!b.adset.attribution_spec) throw new Error('у брифі нема attribution_spec');
  if (!/utm_content=\{\{ad\.name\}\}/.test(b.url_tags)) throw new Error('url_tags без utm_content={{ad.name}} — short-drama не звʼяже оплати з оголошенням');
  const names = b.ads.map(a => a.ad_name);
  if (new Set(names).size !== names.length) throw new Error('у брифі повторюються імена оголошень');
  return b;
}

function linksAlive(b) {
  return Date.now() < Date.parse(b.video_urls_expire_at) - 10 * 60_000;
}

async function findCampaign(name) {
  const all = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name,status', limit: '400' })).data || [];
  return all.find(c => c.name === name) || null;
}

async function findAdset(campaignId, name) {
  const sets = (await apiGet(`${campaignId}/adsets`, { fields: 'id,name,status', limit: '100' })).data || [];
  return sets.find(s => s.name === name) || null;
}

async function adsOf(adsetId) {
  return (await apiGet(`${adsetId}/ads`, { fields: 'id,name,status,creative{id,object_story_spec,url_tags}', limit: '100' })).data || [];
}

function adsetPayload(b, campaignId) {
  const a = b.adset;
  return {
    name: a.name, campaign_id: campaignId,
    optimization_goal: a.optimization_goal, billing_event: a.billing_event, bid_strategy: a.bid_strategy,
    daily_budget: String(a.daily_budget),
    promoted_object: JSON.stringify(a.promoted_object),
    attribution_spec: JSON.stringify(a.attribution_spec),
    targeting: a.targeting,
  };
}

// ── plan: нічого не пише, перевіряє бриф і групу через validate_only ─────────
async function plan(file) {
  const b = loadBrief(file);
  const camp = await findCampaign(b.campaign.name);
  const set = camp && await findAdset(camp.id, b.adset.name);
  const t = b.adset.targeting;
  console.log(`\n🎬 short-drama · таск ${b.task_id} «${b.task_name}»`);
  console.log(`📁 ${b.campaign.name} — ${camp ? camp.id + ' (наявна, ' + camp.status + ')' : 'буде створена, PAUSED'}`);
  console.log(`📂 ${b.adset.name} — ${set ? set.id + ' (наявна)' : 'буде створена, PAUSED'} · $${(b.adset.daily_budget / 100).toFixed(2)}/д`);
  console.log(`   ${b.adset.optimization_goal} · ${b.adset.attribution_spec.map(x => (x.event_type === 'CLICK_THROUGH' ? 'click' : 'view') + x.window_days + 'd').join('+')}`);
  console.log(`   ${t.geo_locations.countries} · ${t.age_min}-${t.age_max} · стать ${t.genders || 'усі'} · advantage=${t.targeting_automation.advantage_audience}`);
  console.log(`   виключено: ${(t.excluded_custom_audiences || []).map(x => x.id).join(', ') || '—'} · плейсменти: ${t.publisher_platforms ? JSON.stringify([t.facebook_positions, t.instagram_positions]) : 'авто'}`);
  const existing = set ? (await adsOf(set.id)).map(a => a.name) : [];
  for (const a of b.ads) {
    console.log(`   ${existing.includes(a.ad_name) ? '⏭ ' : '➕'} ${a.ad_name} [${a.cta}] ${a.link}`);
  }
  console.log(`   текст: ${b.ads[0].primary_text}\n   заголовок: ${b.ads[0].headline}`);
  console.log(`   посилання на відео ${linksAlive(b) ? 'дійсні до ' + b.video_urls_expire_at : '❌ ПРОТЕРМІНОВАНІ — перезбери бриф'}`);

  if (!set) {
    const check = await apiPost(`${ACCT}/adsets`, {
      ...adsetPayload(b, camp ? camp.id : '0'),
      targeting: JSON.stringify(G.normalizeTargeting(b.adset.targeting)), status: 'PAUSED',
      execution_options: JSON.stringify(['validate_only']),
    });
    // Без кампанії Meta не дасть перевірити групу — це очікувано, перевірка буде в build
    if (camp) console.log(`   validate_only групи: ${check.error ? '❌ ' + G.errMsg(check.error) : '✅'}`);
  }
  console.log('\nНічого не створено. Після апруву: node tools/build_sd_task.js build ' + file);
}

async function waitVideo(videoId, timeoutMs = 15 * 60_000) {
  const start = Date.now();
  for (;;) {
    const v = await apiGet(videoId, { fields: 'status' });
    const s = v.status && v.status.video_status;
    if (s === 'ready') return;
    if (s === 'error') throw new Error(`Meta не обробила відео ${videoId}: ${JSON.stringify(v.status)}`);
    if (Date.now() - start > timeoutMs) throw new Error(`відео ${videoId} обробляється довше ${timeoutMs / 60000} хв`);
    await sleep(10_000);
  }
}

// Прев'ю відео → adimage: звіряємо оголошення по image_hash, не по video_id (CLAUDE.md, п.3)
async function thumbnailHash(videoId, name) {
  const th = (await apiGet(`${videoId}/thumbnails`)).data || [];
  const pick = th.find(t => t.is_preferred) || th[0];
  if (!pick) throw new Error(`у відео ${videoId} нема прев'ю`);
  const img = await fetch(pick.uri);
  if (!img.ok) throw new Error(`прев'ю ${videoId}: HTTP ${img.status}`);
  const up = await apiPost(`${ACCT}/adimages`, { bytes: Buffer.from(await img.arrayBuffer()).toString('base64'), name: `${name}_thumb.jpg` });
  if (up.error) throw new Error(`прев'ю ${name}: ${G.errMsg(up.error)}`);
  return { hash: Object.values(up.images || {})[0].hash, uri: pick.uri };
}

// ── build: створює все PAUSED і пише sd-result/1 ─────────────────────────────
async function build(file) {
  const b = loadBrief(file);
  if (!linksAlive(b)) throw new Error('посилання на відео протерміновані — перезбери бриф у short-drama (npm run brief)');

  const camp = await findCampaign(b.campaign.name) || await G.createChecked(`${ACCT}/campaigns`, {
    name: b.campaign.name, objective: b.campaign.objective, buying_type: 'AUCTION',
    special_ad_categories: JSON.stringify([]), is_adset_budget_sharing_enabled: 'false', status: 'PAUSED',
  }, 'campaign');
  console.log(`\n📁 ${b.campaign.name} — ${camp.id}`);

  const set = await findAdset(camp.id, b.adset.name) || await G.createAdSet(adsetPayload(b, camp.id));
  console.log(`  📂 ${b.adset.name} — ${set.id}`);

  const live = await adsOf(set.id);
  const out = [];
  for (const a of b.ads) {
    const prior = live.find(x => x.name === a.ad_name);
    if (prior) { console.log(`     ⏭  ${a.ad_name} вже є — ${prior.id}`); out.push({ ad_name: a.ad_name, ad_id: prior.id, creative_id: prior.creative && prior.creative.id }); continue; }

    const up = await apiPost(`${ACCT}/advideos`, { file_url: a.video.url, name: a.ad_name });
    if (up.error) throw new Error(`відео ${a.ad_name}: ${G.errMsg(up.error)}`);
    await waitVideo(up.id);
    const thumb = await thumbnailHash(up.id, a.ad_name);

    const story = {
      page_id: b.page_id,
      video_data: {
        video_id: up.id, image_hash: thumb.hash,
        message: a.primary_text, title: a.headline,
        call_to_action: { type: a.cta, value: { link: a.link } },
      },
    };
    if (b.ig_user_id) story.instagram_user_id = b.ig_user_id;
    const cr = await G.createChecked(`${ACCT}/adcreatives`, {
      name: `${a.ad_name}_creative`, object_story_spec: JSON.stringify(story), url_tags: b.url_tags,
    }, `creative ${a.ad_name}`);
    const ad = await G.createAd({ name: a.ad_name, adset_id: set.id, creative: { creative_id: cr.id } });
    console.log(`     ✅ ${a.ad_name} — ${ad.id}`);
    out.push({ ad_name: a.ad_name, ad_id: ad.id, creative_id: cr.id, video_id: up.id, image_hash: thumb.hash, thumbnail_url: thumb.uri });
  }

  const ads = await verifyAds(b, set.id, out);
  const result = {
    schema: 'sd-result/1', task_id: b.task_id, created_at: new Date().toISOString(),
    campaign_id: camp.id, campaign_name: b.campaign.name, adset_id: set.id, adset_name: b.adset.name, ads,
  };
  fs.writeFileSync(b.result_path, JSON.stringify(result, null, 2));
  console.log(`\n📝 результат: ${b.result_path}`);

  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  hist.push({ date: new Date().toISOString().slice(0, 10), campaign_name: b.campaign.name, campaign_id: camp.id,
    note: `short-drama таск ${b.task_id} «${b.task_name}»: група ${b.adset.name} (${set.id}), ${ads.length} оголошень з брифу sd-brief/1. Імена й UTM — з реєстру short-drama. Атрибуція 7d click + 1d view. PAUSED.` });
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));

  const bad = ads.filter(a => !a.verified);
  console.log(bad.length ? `\n❌ ${bad.length} оголошень з розбіжностями — sync-launch їх не прийме` : '\n✅ Готово — усе PAUSED. Далі в short-drama: npm run sync-launch -- ' + b.result_path);
}

// Звірка: імʼя, PAUSED, image_hash, лінк, UTM + прев'ю у вертикальних плейсментах
async function verifyAds(b, adsetId, made) {
  const live = await adsOf(adsetId);
  console.log('\n🔍 Звірка:');
  const out = [];
  for (const m of made) {
    const brief = b.ads.find(a => a.ad_name === m.ad_name);
    const ad = live.find(x => x.id === m.ad_id);
    const problems = [];
    if (!ad) problems.push('оголошення не знайдено в групі');
    const vd = ad && ad.creative && ad.creative.object_story_spec && ad.creative.object_story_spec.video_data || {};
    if (ad && ad.status !== 'PAUSED') problems.push(`статус ${ad.status}`);
    if (m.image_hash && vd.image_hash !== m.image_hash) problems.push(`image_hash ${vd.image_hash} ≠ ${m.image_hash}`);
    const link = vd.call_to_action && vd.call_to_action.value && vd.call_to_action.value.link;
    if (link && link.replace(/\/$/, '') !== brief.link.replace(/\/$/, '')) problems.push(`лінк ${link} ≠ ${brief.link}`);
    if (ad && ad.creative.url_tags !== b.url_tags) problems.push('url_tags не збігаються з брифом');
    const p = ad ? await G.checkPreviews(m.ad_id, PREVIEW_FORMATS) : { ok: false };
    if (!p.ok) problems.push(`прев'ю: ${PREVIEW_FORMATS.map(f => f + '=' + p[f]).join(' ')}`);
    console.log(`   ${problems.length ? '❌' : '✅'} ${m.ad_name} ${problems.join('; ') || 'дані й прев\'ю ок'}`);
    out.push({ ...m, verified: !problems.length, problems, previews: p });
  }
  return out;
}

async function verify(file) {
  const b = loadBrief(file);
  const camp = await findCampaign(b.campaign.name);
  if (!camp) throw new Error('кампанію не знайдено');
  const set = await findAdset(camp.id, b.adset.name);
  if (!set) throw new Error('групу не знайдено');
  const live = await adsOf(set.id);
  await verifyAds(b, set.id, live.filter(x => b.ads.some(a => a.ad_name === x.name)).map(x => ({ ad_name: x.name, ad_id: x.id, creative_id: x.creative.id })));
  const s = await G.campaignSummary(camp.id);
  G.printSummary ? G.printSummary(s) : console.log(JSON.stringify(s, null, 2));
}

const [cmd, file] = process.argv.slice(2);
(async () => {
  if (cmd === 'build') await build(file);
  else if (cmd === 'verify') await verify(file);
  else await plan(file);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
