// Правка тексту в живих жовтневих оголошеннях.
//
//   було                                            стало
//   Понад 120 групових програм на тиждень        →  48 групових тренувань на тиждень
//   Вільні ваги, кардіо, функціонал, йога        →  План тренувань і харчування
//   Перше тренування з тренером: розбір…         →  Безкоштовне перше тренування з тренером
//   Тренера обираєш ти, а не він тебе            →  Безкоштовне перше тренування з тренером
//
// Креатив у Meta незмінний: створюється новий із тим самим набором картинок,
// відео й правил, і оголошення переводиться на нього. Решта полів береться з
// живого креатива дослівно, щоб нічого не загубити.
//
// ⚠️ Кампанії ЖИВІ. Зміна креатива скидає фазу навчання оголошення.
// Usage: node tools/update_october_copy.js plan | apply
const path = require('path');
const G = require('./meta_guard');
const { apiGet, apiPost } = require('./meta_api');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const PAGE_ID = '107996248132865';
const IG_ID = process.env.META_INSTAGRAM_ACTOR_ID || '17841447539432480';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const REPLACEMENTS = [
  ['▫️ Понад 120 групових програм на тиждень',              '▫️ 48 групових тренувань на тиждень'],
  ['▫️ Вільні ваги, кардіо, функціонал, йога',              '▫️ План тренувань і харчування'],
  ['▫️ Перше тренування з тренером: розбір техніки й аналіз тіла', '▫️ Безкоштовне перше тренування з тренером'],
  ['▫️ Тренера обираєш ти, а не він тебе',                  '▫️ Безкоштовне перше тренування з тренером'],
];

function rewrite(body) {
  let out = body, hits = 0;
  for (const [from, to] of REPLACEMENTS) {
    if (out.includes(from)) { out = out.split(from).join(to); hits++; }
  }
  return { out, hits };
}

async function collect() {
  const camps = (await apiGet(`${ACCT}/campaigns`, { fields: 'id,name,effective_status', limit: '400' })).data || [];
  const oct = camps.filter(x => /_oct_0110$/.test(x.name));
  const items = [];
  for (const c of oct) {
    const sets = (await apiGet(`${c.id}/adsets`, { fields: 'id,name', limit: '10' })).data || [];
    for (const s of sets) {
      const ads = (await apiGet(`${s.id}/ads`, { fields: 'id,name,status,creative{id,name,asset_feed_spec,object_story_spec,url_tags}', limit: '30' })).data || [];
      for (const a of ads) {
        const spec = a.creative.asset_feed_spec || {};
        const body = ((spec.bodies || [])[0] || {}).text || '';
        items.push({ campaign: c.name, status: c.effective_status, adId: a.id, adName: a.name, creative: a.creative, body });
      }
    }
  }
  return items;
}

async function plan() {
  const items = await collect();
  let ok = 0, miss = 0;
  console.log(`\nЗнайдено оголошень: ${items.length}\n`);
  for (const it of items) {
    const { hits } = rewrite(it.body);
    if (hits === 3) ok++; else { miss++; console.log(`   ⚠️ ${it.campaign} / ${it.adName}: замін ${hits}/3`); }
  }
  console.log(`   ✅ готові до заміни: ${ok}   ⚠️ потребують уваги: ${miss}`);
  const sample = items[0];
  console.log('\n─── приклад «було» ───');
  console.log(sample.body);
  console.log('\n─── приклад «стало» ───');
  console.log(rewrite(sample.body).out);
  console.log('\n(plan — нічого не змінено)');
}

async function apply() {
  const items = await collect();
  console.log(`\n↻ Оновлюю ${items.length} оголошень…\n`);
  let done = 0, skipped = 0;
  for (const it of items) {
    const { out, hits } = rewrite(it.body);
    if (hits === 0) { console.log(`   ⏭  ${it.adName} (${it.campaign}) — текст уже новий`); skipped++; continue; }
    if (hits !== 3) { console.log(`   ⚠️  ${it.adName} (${it.campaign}) — замін ${hits}/3, пропускаю`); skipped++; continue; }

    const spec = JSON.parse(JSON.stringify(it.creative.asset_feed_spec));
    spec.bodies = [{ text: out }];
    // adlabels із живого креатива містять id — Meta їх не приймає назад, лишаємо лише name
    const strip = arr => (arr || []).map(x => ({ ...x, adlabels: (x.adlabels || []).map(l => ({ name: l.name })) }));
    if (spec.images) spec.images = strip(spec.images);
    if (spec.videos) spec.videos = strip(spec.videos);
    if (spec.asset_customization_rules) {
      spec.asset_customization_rules = spec.asset_customization_rules.map(r => {
        const o = { customization_spec: r.customization_spec, priority: r.priority };
        for (const k of ['image_label', 'video_label', 'body_label', 'title_label', 'link_url_label']) {
          if (r[k]) o[k] = { name: r[k].name };
        }
        return o;
      });
    }

    const cr = await G.createChecked(`${ACCT}/adcreatives`, {
      name: `${it.creative.name || it.adName}_v2`.slice(0, 100),
      object_story_spec: JSON.stringify(it.creative.object_story_spec || { page_id: PAGE_ID, instagram_user_id: IG_ID }),
      asset_feed_spec: JSON.stringify(spec),
      ...(it.creative.url_tags ? { url_tags: it.creative.url_tags } : {}),
    }, `creative ${it.adName}`);

    let res = await apiPost(it.adId, { creative: JSON.stringify({ creative_id: cr.id }) });
    for (let i = 1; res.error && res.error.error_subcode === 4841018 && i <= 4; i++) {
      await sleep(35000);
      res = await apiPost(it.adId, { creative: JSON.stringify({ creative_id: cr.id }) });
    }
    if (res.error) throw new Error(`${it.adName}: ${G.errMsg(res.error)}`);
    console.log(`   ✅ ${it.campaign.replace('AI_Apollo_', '').padEnd(32)} ${it.adName} → creative ${cr.id}`);
    done++;
    await sleep(1200);
  }

  console.log(`\nоновлено: ${done}, пропущено: ${skipped}`);
  console.log('\n🔍 Звірка:');
  const after = await collect();
  let bad = 0;
  for (const it of after) {
    const okText = it.body.includes('48 групових тренувань') && it.body.includes('План тренувань і харчування') && it.body.includes('Безкоштовне перше тренування');
    if (!okText) { bad++; console.log(`   ❌ ${it.campaign} / ${it.adName}`); }
  }
  console.log(`   ${bad ? '❌ ' + bad + ' оголошень із старим текстом' : '✅ усі ' + after.length + ' оголошень мають новий текст'}`);
}

const cmd = process.argv[2];
(async () => { if (cmd === 'apply') await apply(); else await plan(); })()
  .catch(e => { console.error('❌', e.message); process.exit(1); });
