// Заливка вересневих роликів у медіатеку Meta + прев'ю.
// 6 концептів × 2 формати (1:1 у стрічку/Threads, 9:16 у сторіс/рілс).
// 4K 16:9 не заливаємо: у плейсментах лише Instagram + Threads, горизонталь там не рендериться.
const fs = require('fs');
const path = require('path');
const https = require('https');
const { apiGet, apiPost } = require('./meta_api');
const { uploadVideoBufferToMeta } = require('./creative_builder');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const DIR = '/Users/antonvarvarinec/Downloads/Vids sept';
const MANIFEST = path.join(__dirname, '../history/sept_vids_manifest.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// підтверджено за фінальними титрами роликів
const CONCEPTS = [
  { key: 'A1', offer: '1grn', sq: 'IMG_5975.MP4', st: 'IMG_5976.MP4', desc: 'Четвертий день' },
  { key: 'A2', offer: '1grn', sq: 'IMG_5978.MP4', st: 'IMG_5979.MP4', desc: 'Ти не схуднеш за тиждень' },
  { key: 'A3', offer: '1grn', sq: 'IMG_5997.MP4', st: 'IMG_5998.MP4', desc: 'Гадаєш або тренуєшся' },
  { key: 'B1', offer: '50off', sq: 'IMG_6001.MP4', st: 'IMG_6002.MP4', desc: 'Причина твоя' },
  { key: 'B2', offer: '50off', sq: 'IMG_6004.MP4', st: 'IMG_6005.MP4', desc: 'Ми не продамо спортзал' },
  { key: 'B3', offer: '50off', sq: 'IMG_6007.MP4', st: 'IMG_6008.MP4', desc: 'Вся правда про Apollo' },
];

async function waitReady(id, label) {
  for (let i = 0; i < 90; i++) {
    const r = await apiGet(id, { fields: 'status' });
    const st = r.status && r.status.video_status;
    if (st === 'ready') return;
    if (st === 'error') throw new Error(label + ': помилка обробки');
    await sleep(5000);
  }
  throw new Error(label + ': не дочекались ready');
}

async function thumbHash(id, label) {
  for (let i = 0; i < 20; i++) {
    const r = await apiGet(`${id}/thumbnails`, { fields: 'uri,is_preferred' });
    const list = r.data || [];
    const pref = list.find(t => t.is_preferred) || list[0];
    if (pref && pref.uri) {
      const buf = await new Promise((res, rej) => https.get(pref.uri, x => { const c = []; x.on('data', d => c.push(d)); x.on('end', () => res(Buffer.concat(c))); }).on('error', rej));
      const up = await apiPost(`${ACCT}/adimages`, { bytes: buf.toString('base64'), name: `thumb_${id}.jpg` });
      if (up.error) throw new Error('thumb: ' + up.error.message);
      return Object.values(up.images || {})[0].hash;
    }
    await sleep(3000);
  }
  throw new Error(label + ': превʼю не зʼявилось');
}

(async () => {
  const man = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  const files = CONCEPTS.flatMap(c => [{ f: c.sq, k: c.key + '_sq' }, { f: c.st, k: c.key + '_st' }]);
  for (const { f, k } of files) {
    if (man[k] && man[k].video_id) { console.log(`⏭  ${k} (${f}) вже залито`); continue; }
    const buf = fs.readFileSync(path.join(DIR, f));
    console.log(`⬆️  ${k} ← ${f} (${Math.round(buf.length / 1024 / 1024)} MB)…`);
    const id = await uploadVideoBufferToMeta(buf, `sept_${k}_${f}`);
    man[k] = { file: f, video_id: id };
    fs.writeFileSync(MANIFEST, JSON.stringify(man, null, 2));
    console.log(`    video_id ${id}`);
  }
  for (const { f, k } of files) {
    await waitReady(man[k].video_id, k);
    if (!man[k].thumb_hash) {
      man[k].thumb_hash = await thumbHash(man[k].video_id, k);
      fs.writeFileSync(MANIFEST, JSON.stringify(man, null, 2));
    }
    console.log(`    ✅ ${k} готове`);
  }
  console.log(`\n✅ 12 роликів у медіатеці. Manifest: ${MANIFEST}`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
