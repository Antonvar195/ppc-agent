// Replace videos in 5 active "reach" campaigns.
// Target: 5 campaigns x 4 identical broad adsets x 4 video ads (PAUSED).
// Usage:
//   node tools/replace_reach_videos.js upload        -> upload 7 videos, save manifest
//   node tools/replace_reach_videos.js test-creative -> build ONE PAC video creative to validate
//   node tools/replace_reach_videos.js build         -> full mutation (adsets + ads), all PAUSED
const https = require('https');
const fs = require('fs');
const path = require('path');
const { apiGet, apiPost } = require('./meta_api');
const { uploadVideoBufferToMeta } = require('./creative_builder');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID; // act_915627749178795
const TOKEN = process.env.META_ACCESS_TOKEN;
const API = 'v21.0';
const PAGE_ID = '107996248132865';
const IG_ID = '17841447539432480';
const VIDEO_DIR = '/private/tmp/claude-501/-Users-antonvarvarinec/d4d222cf-ece4-494e-a13d-9a8c8484107d/scratchpad/drive_videos/Apollo DGTL';
const MANIFEST = path.join(__dirname, '../history/reach_video_manifest.json');

// Shared ad copy (identical across all 5 campaigns; only link differs)
const AD_TEXT = `Думаєш, що в залі всі будуть на тебе дивитись, і не знаєш, з якого тренажера почати?

В APOLLO NEXT ми розуміємо ці побоювання. Саме тому твоє перше тренування починається не зі стресу, а зі спокійної розмови з тренером. На тебе чекає професійна діагностика тіла, знайомство з обладнанням та м'яка підтримка на кожному кроці.

🎁 Спеціальна пропозиція: Забирай перший тиждень тренувань всього за 1 грн + отримай комплексну програму STARWAY у подарунок!

STARWAY закриває всі твої потреби у фітнесі:

- Стартове тренування з тренером.
- Персональна програма тренувань.
- Готові раціони харчування.
- Контроль та керування процесом.

Почни свій шлях комфортно та без страху.
👉 Тисни «Детальніше», щоб забрати свій абонемент!`;

const URL_TAGS = 'utm_source=facebook&utm_medium=reach&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}';

// Launch schedule: 01.07.2026 00:01 Europe/Kiev (UTC+3). DDMM token = 0107.
const START_TIME = '2026-07-01T00:01:00+0300';
const DATE_TOKEN = '0107';

// 4 unique videos. Match the live campaigns exactly: single vertical 9:16 video
// per ad (object_story_spec, no asset_feed_spec) — lets 4 ads coexist per ad set.
const VIDEOS = [
  { n: 1, single: true, feed: 'AP_ADS_1_9x16.mp4', story: 'AP_ADS_1_9x16.mp4' },
  { n: 2, single: true, feed: 'AP_ADS_2_9x16.mp4', story: 'AP_ADS_2_9x16.mp4' },
  { n: 3, single: true, feed: 'AP_ADS_3_9x16.mp4', story: 'AP_ADS_3_9x16.mp4' },
  { n: 4, single: true, feed: 'AP_ADS_4_9x16.mp4', story: 'AP_ADS_4_9x16.mp4' },
];

// 5 NEW campaigns to create (the old june campaigns stay untouched).
// geo token + city link + per-group daily budget (cents USD) + template adset (june video1)
// from which we replicate optimization/geo/placement settings.
const CAMPAIGNS = [
  { geo: 'Vinnitsa', link: 'https://apollo.online/clubs/apollo-next-033-tcz-magigrand/', budget: 1000, template: '120246608880200193' },
  { geo: 'BC',       link: 'https://apollo.online/clubs/apollo-next-035-tcz-germes/',     budget: 1000, template: '120246608774740193' },
  { geo: 'Odessa',   link: 'https://apollo.online/clubs/odesa/',                          budget: 3000, template: '120246608703640193' },
  { geo: 'Lviv',     link: 'https://apollo.online/clubs/lviv/',                           budget: 3000, template: '120246608637260193' },
  { geo: 'Kyiv',     link: 'https://apollo.online/clubs/kyyiv/',                          budget: 9000, template: '120246606749310193' },
];

function apiDelete(node) {
  return new Promise((resolve, reject) => {
    const q = new URLSearchParams({ access_token: TOKEN }).toString();
    const req = https.request({ hostname: 'graph.facebook.com', path: `/${API}/${node}?${q}`, method: 'DELETE' },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } }); });
    req.on('error', reject); req.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitVideoReady(videoId, label) {
  for (let i = 0; i < 60; i++) {
    const r = await apiGet(videoId, { fields: 'status' });
    const st = r.status && r.status.video_status;
    if (st === 'ready') { console.log(`    ✅ ${label} ready`); return true; }
    if (st === 'error') throw new Error(`${label} processing error`);
    await sleep(5000);
  }
  throw new Error(`${label} not ready (timeout)`);
}

async function getThumbHash(videoId) {
  // get auto thumbnail uri -> download -> upload as adimage -> hash
  for (let i = 0; i < 20; i++) {
    const r = await apiGet(`${videoId}/thumbnails`, { fields: 'uri,is_preferred' });
    const list = (r.data || []);
    const pref = list.find(t => t.is_preferred) || list[0];
    if (pref && pref.uri) {
      const buf = await new Promise((resolve, reject) => {
        https.get(pref.uri, res => { const ch = []; res.on('data', c => ch.push(c)); res.on('end', () => resolve(Buffer.concat(ch))); }).on('error', reject);
      });
      const up = await apiPost(`${ACCT}/adimages`, { bytes: buf.toString('base64'), name: `thumb_${videoId}.jpg` });
      if (up.error) throw new Error('thumb upload: ' + up.error.message);
      return Object.values(up.images || {})[0].hash;
    }
    await sleep(3000);
  }
  throw new Error('no thumbnail for ' + videoId);
}

// ---------- UPLOAD ----------
async function uploadAll() {
  const files = [...new Set(VIDEOS.flatMap(v => v.single ? [v.story] : [v.feed, v.story]))];
  const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  for (const f of files) {
    if (manifest[f] && manifest[f].video_id) { console.log(`⏭  ${f} already uploaded: ${manifest[f].video_id}`); continue; }
    const buf = fs.readFileSync(path.join(VIDEO_DIR, f));
    console.log(`⬆️  ${f} (${Math.round(buf.length / 1024)}KB)...`);
    const id = await uploadVideoBufferToMeta(buf, f);
    manifest[f] = { video_id: id };
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    console.log(`    video_id: ${id}`);
  }
  // wait ready + thumbnails
  for (const f of files) {
    await waitVideoReady(manifest[f].video_id, f);
    if (!manifest[f].thumb_hash) {
      manifest[f].thumb_hash = await getThumbHash(manifest[f].video_id);
      fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
      console.log(`    thumb_hash: ${manifest[f].thumb_hash}`);
    }
  }
  console.log('\n✅ Upload complete. Manifest:', MANIFEST);
  return manifest;
}

// build creative payload for one video in one campaign
function buildCreative(video, campaign, manifest, name) {
  const feed = manifest[video.feed], story = manifest[video.story];
  if (video.single) {
    return {
      name,
      object_story_spec: JSON.stringify({
        page_id: PAGE_ID, instagram_user_id: IG_ID,
        video_data: {
          video_id: feed.video_id, image_hash: feed.thumb_hash, message: AD_TEXT,
          call_to_action: { type: 'LEARN_MORE', value: { link: campaign.link } }
        }
      }),
      url_tags: URL_TAGS,
    };
  }
  // Multi-asset video creative: square (feed) + vertical (stories/reels) in one ad.
  // No asset_customization_rules (account lacks PAC capability) — Meta auto-matches
  // aspect ratio to placement via adapt_to_placement.
  const afs = {
    bodies: [{ text: AD_TEXT }],
    link_urls: [{ website_url: campaign.link }],
    call_to_action_types: ['LEARN_MORE'],
    ad_formats: ['SINGLE_VIDEO'],
    videos: [
      { video_id: feed.video_id,  thumbnail_hash: feed.thumb_hash },
      { video_id: story.video_id, thumbnail_hash: story.thumb_hash },
    ],
  };
  return {
    name,
    object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_ID }),
    asset_feed_spec: JSON.stringify(afs),
    degrees_of_freedom_spec: JSON.stringify({ creative_features_spec: {
      adapt_to_placement: { enroll_status: 'OPT_IN' } } }),
    url_tags: URL_TAGS,
  };
}

async function createCreative(payload) {
  const r = await apiPost(`${ACCT}/adcreatives`, payload);
  if (r.error) throw new Error(`creative ${r.error.code}/${r.error.error_subcode || '-'}: ${r.error.message} ${JSON.stringify(r.error.error_data || {})}`);
  return r.id;
}

// ---------- TEST ONE CREATIVE ----------
async function testCreative() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const kyiv = CAMPAIGNS.find(c => c.geo === 'Kyiv');
  console.log('Building PAC video2 creative for Kyiv...');
  const id = await createCreative(buildCreative(VIDEOS[1], kyiv, manifest, 'TEST_3006_video2'));
  console.log('✅ creative_id:', id);
  const d = await apiGet(id, { fields: 'id,name,asset_feed_spec' });
  const afs = d.asset_feed_spec || {};
  console.log('  videos:', (afs.videos || []).length, '| rules:', (afs.asset_customization_rules || []).length);
  const prev = await apiGet(`${ACCT}/generatepreviews`, { creative: JSON.stringify({ creative_id: id }), ad_format: 'INSTAGRAM_STORY' });
  console.log('  story preview:', prev.error ? prev.error.message : 'OK');
  console.log('\n(test creative left in library, not attached to any ad)');
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'upload') await uploadAll();
  else if (cmd === 'test-creative') await testCreative();
  else if (cmd === 'build') await build();
  else console.log('cmd: upload | test-creative | build');
})().catch(e => { console.error('❌', e.message); process.exit(1); });

// ---------- FULL BUILD (create 5 NEW campaigns; old ones untouched) ----------
// Build clean writable targeting from a template (june) adset: omit genders
// (=> all genders), add 'explore' where 'explore_home' is present, keep advantage flag.
async function cleanTargetingFrom(templateAdsetId) {
  const r = await apiGet(templateAdsetId, { fields: 'targeting' });
  const s = r.targeting || {};
  const t = {};
  if (s.age_min) t.age_min = s.age_min;
  if (s.age_max) t.age_max = s.age_max;
  if (s.geo_locations) t.geo_locations = s.geo_locations;
  if (s.publisher_platforms) t.publisher_platforms = s.publisher_platforms;
  if (s.threads_positions) t.threads_positions = s.threads_positions;
  if (s.device_platforms) t.device_platforms = s.device_platforms;
  if (s.instagram_positions) {
    const ig = [...s.instagram_positions];
    if (ig.includes('explore_home') && !ig.includes('explore')) ig.push('explore');
    t.instagram_positions = ig;
  }
  const ta = s.targeting_automation || {};
  if (ta.advantage_audience === undefined) ta.advantage_audience = 0;
  t.targeting_automation = ta;
  return t; // genders omitted => all genders
}

async function createAdset(campaignId, name, budget, targeting) {
  const r = await apiPost(`${ACCT}/adsets`, {
    name, campaign_id: campaignId,
    optimization_goal: 'REACH', billing_event: 'IMPRESSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP', daily_budget: String(budget),
    promoted_object: JSON.stringify({ page_id: PAGE_ID }),
    attribution_spec: JSON.stringify([{ event_type: 'CLICK_THROUGH', window_days: 1 }]),
    targeting: JSON.stringify(targeting),
    start_time: START_TIME, status: 'PAUSED',
  });
  if (r.error) throw new Error(`adset "${name}": ${r.error.message}`);
  return r.id;
}

async function build() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const results = [];
  for (const c of CAMPAIGNS) {
    const campName = `AI_Apollo_reach_${c.geo}_july_${DATE_TOKEN}`;
    console.log(`\n######## ${campName} ########`);
    // 1. campaign
    const camp = await apiPost(`${ACCT}/campaigns`, {
      name: campName, objective: 'OUTCOME_AWARENESS', buying_type: 'AUCTION',
      special_ad_categories: JSON.stringify([]),
      is_adset_budget_sharing_enabled: 'false', // ABO: budget at ad set level
      status: 'PAUSED',
    });
    if (camp.error) throw new Error(`campaign ${c.geo}: ${camp.error.message}`);
    console.log(`  📁 campaign: ${camp.id}`);
    // 2. clean targeting from template
    const targeting = await cleanTargetingFrom(c.template);
    // 3. creatives (4, reused across the 4 adsets)
    const creatives = [];
    for (const v of VIDEOS) {
      const cid = await createCreative(buildCreative(v, c, manifest, `${DATE_TOKEN}_video${v.n}`));
      creatives.push({ n: v.n, creative_id: cid });
      console.log(`  🎬 creative video${v.n}: ${cid}`);
    }
    // 4. four identical broad adsets, each with 4 ads
    const campLog = { campaign: campName, campaign_id: camp.id, adsets: [], ads_count: 0 };
    for (let i = 1; i <= 4; i++) {
      const asName = `${c.geo}_18-55_inst_treads_${i}`;
      const asId = await createAdset(camp.id, asName, c.budget, targeting);
      console.log(`  📂 adset ${asName}: ${asId} | budget ${c.budget} | start ${START_TIME} | PAUSED`);
      for (const cr of creatives) {
        const r = await apiPost(`${ACCT}/ads`, {
          name: `${DATE_TOKEN}_video${cr.n}`, adset_id: asId,
          creative: JSON.stringify({ creative_id: cr.creative_id }), status: 'PAUSED',
        });
        if (r.error) throw new Error(`ad in ${asName}: ${r.error.message}`);
        console.log(`      + ad ${DATE_TOKEN}_video${cr.n} -> ${r.id}`);
        campLog.ads_count++;
      }
      campLog.adsets.push({ name: asName, id: asId });
    }
    results.push(campLog);
  }
  // append to launches history
  const histFile = path.join(__dirname, '../history/launches.json');
  let hist = [];
  try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {}
  for (const r of results) hist.push({ date: new Date().toISOString(), campaign_name: r.campaign, campaign_id: r.campaign_id, adsets: r.adsets, ads_count: r.ads_count });
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));
  console.log(`\n✅ BUILD COMPLETE — 5 new campaigns, ${results.reduce((s, r) => s + r.ads_count, 0)} ads, all PAUSED.`);
}
