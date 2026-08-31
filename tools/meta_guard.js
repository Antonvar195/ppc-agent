// Запобіжники для запису в Meta Ads API.
//
// Сюди переїжджають граблі, на які ми вже наступали. Сенс модуля в тому, щоб
// правило не треба було памʼятати: якщо створювати обʼєкти через ці функції,
// відому помилку зробити структурно неможливо.
//
// Кожен запобіжник підписаний реальним симптомом (кодом помилки Meta), щоб
// його можна було перевірити, а не приймати на віру. Новий урок з бойового
// запуску → нова перевірка тут + рядок у docs/LESSONS.md.
//
// Usage:
//   const G = require('./meta_guard');
//   const po = await G.promotedObjectFrom('120240881962810193');
//   const adset = await G.createAdSet({ name, campaign_id, targeting, ... });
//
// Самоперевірка: node tools/meta_guard.js selftest <adset_id_еталона>
const { apiGet, apiPost } = require('./meta_api');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const warn = m => console.log(`   🛡  ${m}`);
const errMsg = e => (e.error_user_msg || e.message || JSON.stringify(e)) +
  (e.error_subcode ? ` [subcode ${e.error_subcode}]` : e.code ? ` [code ${e.code}]` : '');

// ── 1. Плейсменти ────────────────────────────────────────────────────────────
// Meta не приймає explore_home без explore (subcode 2490392). Живі групи,
// створені до появи цієї перевірки, читаються без explore — копіювати їх
// дослівно не можна.
function normalizeTargeting(targeting) {
  const t = JSON.parse(JSON.stringify(targeting));

  const ig = t.instagram_positions;
  if (Array.isArray(ig) && ig.includes('explore_home') && !ig.includes('explore')) {
    ig.splice(ig.indexOf('explore_home'), 0, 'explore');
    warn('додав instagram_positions.explore — Meta не приймає explore_home без нього (2490392)');
  }

  // advantage_audience мусить бути заданий явно, інакше Meta трактує його
  // на свій розсуд і група мовчки їде не на ту аудиторію.
  if (!t.targeting_automation || t.targeting_automation.advantage_audience === undefined) {
    throw new Error('targeting: задай targeting_automation.advantage_audience явно (0 або 1)');
  }

  const geo = t.geo_locations || {};
  if (!geo.cities && !geo.regions && !geo.countries && !geo.custom_locations) {
    throw new Error('targeting: у geo_locations нема жодного гео');
  }

  // Радіус навколо МІСТА має бути >= 10 миль (17 км) — менше Meta відхиляє
  // з subcode 1487110. Для меншого радіуса є custom_locations (lat/lng),
  // але коло від точки може не покрити все місто.
  for (const c of geo.cities || []) {
    if (c.radius === undefined) continue;
    const km = c.distance_unit === 'mile' ? c.radius * 1.609 : c.radius;
    if (km < 16.9) {
      throw new Error(`targeting: радіус ${c.radius} ${c.distance_unit || 'km'} навколо міста замалий — ` +
        'Meta приймає від 17 км (10 миль) [1487110]. Менше — тільки через custom_locations.');
    }
  }
  return t;
}

// ── 2. promoted_object з кастомною конверсією ────────────────────────────────
// Meta звіряє pixel_rule з custom_conversion_id ПОСИМВОЛЬНО. JSON.stringify
// дає "https://…", а API зберігає "https:\/\/…" — той самий JSON після
// парсингу, але перевірка падає з subcode 1885014. Тому promoted_object не
// збираємо руками, а копіюємо дослівно з живої групи.
async function promotedObjectFrom(referenceAdsetId) {
  const ref = await apiGet(referenceAdsetId, { fields: 'name,promoted_object' });
  if (ref.error) throw new Error(`еталонна група ${referenceAdsetId}: ${errMsg(ref.error)}`);
  const po = ref.promoted_object;
  if (!po) throw new Error(`у групі «${ref.name}» нема promoted_object`);
  if (po.custom_conversion_id && !po.pixel_rule) {
    throw new Error(`у «${ref.name}» є custom_conversion_id без pixel_rule — Meta відхилить (1885014)`);
  }
  warn(`promoted_object скопійовано з «${ref.name}»${po.custom_conversion_id ? ` (конверсія ${po.custom_conversion_id})` : ''}`);
  const out = { pixel_id: po.pixel_id, custom_event_type: po.custom_event_type };
  if (po.pixel_rule) out.pixel_rule = po.pixel_rule;                      // дослівно, не перезбирати
  if (po.custom_conversion_id) out.custom_conversion_id = po.custom_conversion_id;
  return out;
}

// ── 3. Запис із попередньою валідацією ───────────────────────────────────────
// execution_options:['validate_only'] повертає ту саму помилку, що й реальний
// запис, але нічого не створює. Дешевий спосіб не засмічувати акаунт
// напівствореними обʼєктами. Meta віддає помилки по одній — після фіксу
// першої може вилізти наступна.
async function createChecked(edge, payload, label) {
  const check = await apiPost(edge, { ...payload, execution_options: JSON.stringify(['validate_only']) });
  if (check.error) throw new Error(`${label} (перевірка): ${errMsg(check.error)}`);
  const res = await apiPost(edge, payload);
  if (res.error) throw new Error(`${label}: ${errMsg(res.error)}`);
  return res;
}

// ── 4. PAUSED завжди ─────────────────────────────────────────────────────────
// Правило проєкту (CLAUDE.md). Живий запуск — тільки з явним allowLive,
// щоб він ніколи не сталося через пропущене поле.
function assertPaused(payload, label, allowLive) {
  if (payload.status === 'PAUSED') return;
  if (allowLive) { warn(`${label} створюється НЕ на паузі — свідомий allowLive`); return; }
  throw new Error(`${label}: статус має бути PAUSED (див. CLAUDE.md). Явний запуск — createX(payload, {allowLive:true})`);
}

async function createAdSet(payload, opts = {}) {
  const p = { status: 'PAUSED', ...payload };
  assertPaused(p, `adset ${p.name}`, opts.allowLive);
  if (!p.targeting) throw new Error('adset: нема targeting');

  // Ліміт частоти Meta приймає ТІЛЬКИ з optimization_goal REACH (subcode 1815211).
  // На IMPRESSIONS його поставити не можна — а саме IMPRESSIONS дає вищу
  // частоту, тож обирати доводиться між керованою стелею і більшою частотою.
  if (p.frequency_control_specs && p.optimization_goal !== 'REACH') {
    throw new Error(`adset ${p.name}: frequency_control_specs можливий лише з optimization_goal REACH, ` +
      `а тут ${p.optimization_goal} [1815211]. Або прибери ліміт, або перемкни на REACH.`);
  }
  const t = typeof p.targeting === 'string' ? JSON.parse(p.targeting) : p.targeting;
  p.targeting = JSON.stringify(normalizeTargeting(t));
  if (p.promoted_object && typeof p.promoted_object !== 'string') p.promoted_object = JSON.stringify(p.promoted_object);
  return createChecked(`${ACCT}/adsets`, p, `adset ${p.name}`);
}

async function createAd(payload, opts = {}) {
  const p = { status: 'PAUSED', ...payload };
  assertPaused(p, `ad ${p.name}`, opts.allowLive);
  if (p.creative && typeof p.creative !== 'string') p.creative = JSON.stringify(p.creative);
  return createChecked(`${ACCT}/ads`, p, `ad ${p.name}`);
}

// ── 5. Звірка креативів ──────────────────────────────────────────────────────
// НЕ порівнювати video_id: при створенні креатива Meta робить власну копію
// ролика і в asset_feed_spec віддає СВОЇ id, а не ті, що заливались в акаунт.
// Пряме порівняння завжди дає розбіжність і виглядає як помилка там, де все
// правильно. Звіряти по creative.id + thumbnail_hash / image hash — їх
// задаємо ми і вони унікальні на файл.
async function verifyAd(adId, expected = {}) {
  const r = await apiGet(adId, { fields: 'name,status,creative{id,asset_feed_spec}' });
  if (r.error) throw new Error(`ad ${adId}: ${errMsg(r.error)}`);
  const cr = r.creative || {};
  const s = cr.asset_feed_spec || {};
  const problems = [];

  if (expected.creativeId && cr.id !== expected.creativeId) {
    problems.push(`креатив ${cr.id}, очікували ${expected.creativeId}`);
  }
  if (expected.thumbHashes) {
    const got = (s.videos || []).map(v => v.thumbnail_hash).sort();
    const want = [...expected.thumbHashes].sort();
    if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`thumbnail_hash ${got.join(',')} ≠ ${want.join(',')}`);
  }
  if (expected.imageHashes) {
    const got = (s.images || []).map(i => i.hash).sort();
    const want = [...expected.imageHashes].sort();
    if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`image hash ${got.join(',')} ≠ ${want.join(',')}`);
  }
  if (expected.link) {
    const got = ((s.link_urls || [])[0] || {}).website_url;
    if (got !== expected.link) problems.push(`лінк ${got} ≠ ${expected.link}`);
  }
  return { ok: !problems.length, name: r.name, status: r.status, creativeId: cr.id, problems };
}

// Прев'ю — єдина перевірка, що креатив реально рендериться в плейсменті.
// Порожнє прев'ю = оголошення не покажеться, хоча API створення пройшло.
async function checkPreviews(adId, formats = ['INSTAGRAM_STORY', 'INSTAGRAM_STANDARD', 'MOBILE_FEED_STANDARD', 'DESKTOP_FEED_STANDARD']) {
  const out = {};
  for (const f of formats) {
    const p = await apiGet(`${adId}/previews`, { ad_format: f });
    out[f] = p.error ? `ERR ${errMsg(p.error)}` : (p.data && p.data[0] ? 'ok' : 'empty');
  }
  out.ok = Object.entries(out).every(([k, v]) => k === 'ok' || v === 'ok');
  return out;
}

// Підсумок по кампанії — щоб не звітувати «готово» без фактичних цифр.
async function campaignSummary(campaignId) {
  const r = await apiGet(`${campaignId}/adsets`, { fields: 'name,status,daily_budget,targeting', limit: '100' });
  if (r.error) throw new Error(errMsg(r.error));
  let total = 0, active = 0;
  const rows = r.data.sort((a, b) => a.name.localeCompare(b.name)).map(a => {
    const b = parseInt(a.daily_budget, 10) || 0;
    total += b; if (a.status === 'ACTIVE') active += b;
    const g = (a.targeting || {}).geo_locations || {};
    return { name: a.name, status: a.status, budget_usd: b / 100, age: `${a.targeting.age_min}-${a.targeting.age_max}`,
             geo: [...(g.regions || []).map(x => x.name), ...(g.cities || []).map(x => x.name)].join(', ') };
  });
  return { rows, total_usd: total / 100, active_usd: active / 100 };
}

function printSummary(s) {
  for (const r of s.rows) {
    console.log(`   ${r.name.padEnd(42)} $${String(r.budget_usd).padStart(4)}/д  ${r.status.padEnd(7)} ${r.age.padEnd(6)} ${r.geo}`);
  }
  console.log(`   ${''.padEnd(42)} ─────────`);
  console.log(`   ${'разом'.padEnd(42)} $${s.total_usd}/д   (ACTIVE: $${s.active_usd}/д)`);
}


// ── 6. Аудит наявних скриптів ────────────────────────────────────────────────
// Перевіряє tools/*.js на відомі граблі. Свідомі відступи від правил
// декларуються маркером у файлі: `// guard:allow-live <причина>`.
//
// ВАЖЛИВО: аудит показує ПІДОЗРИ, а не вироки. Перша його версія дала 3 з 3
// хибних спрацювань і мало не спричинила «виправлення» робочого коду.
// Кожну знахідку відкривати й читати в контексті перед тим, як чіпати файл.
function auditScripts() {
  const fs = require('fs');
  const dir = __dirname;
  const out = [];

  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js') && x !== 'meta_guard.js')) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    if (!/(adsets|adcreatives|\/ads)[`'"]/.test(src)) continue;   // не пише в Meta
    const uses = /require\(['"]\.\/meta_guard['"]\)/.test(src);
    const issues = [];

    // Кастомну конверсію зібрали руками? Копія цілого promoted_object — ок.
    const copiesPO = /promoted_object:\s*JSON\.stringify\(\s*[A-Za-z_$][\w$.]*\.promoted_object\s*\)/.test(src)
      || /promotedObjectFrom/.test(src);
    // Ламається САМЕ пара pixel_id + custom_conversion_id без pixel_rule.
    // Один custom_conversion_id — валідний (так створена fest-кампанія).
    if (/custom_conversion_id/.test(src) && !copiesPO) {
      if (/i_contains/.test(src) && /pixel_rule/.test(src)) {
        issues.push(['BUG', 'pixel_rule збирається руками → 1885014']);
      } else if (/pixel_id/.test(src) && !/pixel_rule/.test(src)) {
        issues.push(['BUG', 'pixel_id + custom_conversion_id без pixel_rule → 1885014']);
      }
    }

    // explore_home без explore
    if (/explore_home/.test(src) && !/['"]explore['"]/.test(src) && !uses) {
      issues.push(['BUG', 'explore_home без explore → 2490392']);
    }

    // Створення живих обʼєктів без декларації
    if (/status: *['"]ACTIVE['"]/.test(src) && !/guard:allow-live/.test(src)) {
      issues.push(['CHECK', 'створює ACTIVE без маркера guard:allow-live']);
    }

    if (!/validate_only/.test(src) && !uses) issues.push(['INFO', 'без validate_only перед записом']);
    if (issues.length) out.push({ file: f, issues });
  }
  return out;
}

function printAudit(rows) {
  const rank = { BUG: 0, CHECK: 1, INFO: 2 };
  const flat = rows.flatMap(r => r.issues.map(([sev, msg]) => ({ file: r.file, sev, msg })))
    .sort((a, b) => rank[a.sev] - rank[b.sev] || a.file.localeCompare(b.file));
  const icon = { BUG: '🔴', CHECK: '🟡', INFO: '⚪️' };
  for (const r of flat) console.log(`  ${icon[r.sev]} ${r.sev.padEnd(5)} ${r.file.padEnd(26)} ${r.msg}`);
  const n = s => flat.filter(x => x.sev === s).length;
  console.log(`\n  🔴 ${n('BUG')} зламають запис · 🟡 ${n('CHECK')} перевірити вручну · ⚪️ ${n('INFO')} не критично`);
  console.log('  Кожну знахідку відкрити й прочитати в контексті — аудит дає підозри, не вироки.');
}

module.exports = {
  normalizeTargeting, promotedObjectFrom, createChecked, createAdSet, createAd,
  verifyAd, checkPreviews, campaignSummary, printSummary, errMsg,
  auditScripts, printAudit,
};

// ── самоперевірка ────────────────────────────────────────────────────────────
if (require.main === module) {
  const [cmd, ref] = process.argv.slice(2);
  if (cmd === 'audit') { printAudit(auditScripts()); process.exit(0); }
  if (cmd !== 'selftest') { console.log('cmd: selftest <reference_adset_id> | audit'); process.exit(0); }
  (async () => {
    console.log('1) explore_home без explore →');
    const t = normalizeTargeting({
      age_min: 18, age_max: 45,
      geo_locations: { cities: [{ key: '2384095', country: 'UA' }], location_types: ['home'] },
      targeting_automation: { advantage_audience: 0 },
      instagram_positions: ['stream', 'explore_home'],
    });
    console.log('   →', JSON.stringify(t.instagram_positions),
      t.instagram_positions.includes('explore') ? '✅ виправлено' : '❌ НЕ виправлено');

    console.log('2) targeting без advantage_audience →');
    try { normalizeTargeting({ geo_locations: { countries: ['UA'] } }); console.log('   ❌ пропустив'); }
    catch (e) { console.log('   ✅ зупинив:', e.message); }

    console.log('3) adset не на паузі →');
    try { assertPaused({ status: 'ACTIVE' }, 'test', false); console.log('   ❌ пропустив'); }
    catch (e) { console.log('   ✅ зупинив:', e.message.split('.')[0]); }

    if (ref) {
      console.log('4) promoted_object з живої групи →');
      const po = await promotedObjectFrom(ref);
      console.log('   pixel_rule зі слешами як в API:', /\\\//.test(po.pixel_rule || '') ? '✅ так' : '— (правила нема)');
    }
  })().catch(e => { console.error('❌', e.message); process.exit(1); });
}
