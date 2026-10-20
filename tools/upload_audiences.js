// Заливка клієнтських баз у Meta як Custom Audiences.
//
// Персональні дані НЕ залишають машину в сирому вигляді: кожне поле
// нормалізується за правилами Meta і хешується SHA-256 локально,
// у Meta йдуть лише хеші.
//
// Джерела (тека «Аудиторії META»), 4 файли → 5 аудиторій:
//   1. відвал за весь час            88-колонковий формат
//   2. вся база                      88-колонковий формат
//   3-4. старт за рік / за два роки  два аркуші, 10 колонок
//   5. активні на дату вивантаження  9 колонок
//
// Usage: node tools/upload_audiences.js prepare | upload | verify
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { apiGet, apiPost } = require('./meta_api');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ACCT = process.env.META_AD_ACCOUNT_ID;
const OUT = path.join(process.env.HOME, '.claude/jobs/e8b6ebbc/tmp/aud');
const STATE = path.join(__dirname, '../history/audiences_upload.json');
const BATCH = 5000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const sha = v => crypto.createHash('sha256').update(v).digest('hex');

// ── нормалізація за правилами Meta ───────────────────────────────────────────
const normEmail = v => {
  if (!v) return '';
  const s = String(v).trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : '';
};
const normPhone = v => {
  if (!v) return '';
  const d = String(v).replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 12 && d.startsWith('380')) return d;
  if (d.length === 11 && d.startsWith('80')) return '3' + d;      // формат файлів 3-4
  if (d.length === 10 && d.startsWith('0')) return '38' + d;
  if (d.length === 9) return '380' + d;
  return '';                                                       // решта — не український номер
};
const normName = v => {
  if (!v) return '';
  return String(v).trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, '').replace(/\s+/g, ' ').trim();
};
const normGender = v => {
  const s = String(v || '').trim().toLowerCase();
  if (s.startsWith('f') || s.startsWith('ж')) return 'f';
  if (s.startsWith('m') || s.startsWith('ч')) return 'm';
  return '';
};
const normYear = v => {
  if (!v) return '';
  const m = String(v).match(/(19|20)\d{2}/);
  return m ? m[0] : '';
};
const h = v => (v ? sha(v) : '');

// ── джерела ──────────────────────────────────────────────────────────────────
const DIR = path.join(process.env.HOME, 'Downloads/Аудитории META');
const SOURCES = [
  { key: 'churn_all',  name: 'Apollo · відвал за весь час · 05.10.26',
    file: '1. кто отвалился за все время.xlsx', sheet: 0, header: 1,
    cols: { fn: 5, ln: 7, doby: 8, gen: 10, email: 11, phone: 12 } },
  { key: 'all_base',   name: 'Apollo · вся база · 05.10.26',
    file: '2. apollo_2026-10-05_AllMembers.xlsx', sheet: 0, header: 1,
    cols: { fn: 5, ln: 7, doby: 8, gen: 10, email: 11, phone: 12 } },
  { key: 'buy_1y',     name: 'Apollo · купували за рік · 05.10.26',
    file: '3-4. Старт за останній рік та за два останніх роки (1).xlsx', sheet: 'пункт 4', header: 4,
    cols: { fn: 3, ln: 4, email: 5, phone: 6 } },
  { key: 'buy_2y',     name: 'Apollo · купували за два роки · 05.10.26',
    file: '3-4. Старт за останній рік та за два останніх роки (1).xlsx', sheet: 'пункт 5', header: 4,
    cols: { fn: 3, ln: 4, email: 5, phone: 6 } },
  { key: 'active',     name: 'Apollo · активні на 05.10.26',
    file: '5. База гостей на ранок 05.10.26 (1).xlsx', sheet: 0, header: 2,
    cols: { fullname: 3, phone: 4, email: 5 } },
];

const SCHEMA = ['EMAIL', 'PHONE', 'FN', 'LN', 'GEN', 'DOBY'];

function readState() { return fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {}; }
function writeState(s) { fs.writeFileSync(STATE, JSON.stringify(s, null, 2)); }

async function prepare() {
  const openpyxlPy = path.join(OUT, '_extract.py');
  fs.mkdirSync(OUT, { recursive: true });
  const state = readState();

  for (const s of SOURCES) {
    const outFile = path.join(OUT, s.key + '.tsv');
    if (fs.existsSync(outFile)) { console.log(`⏭  ${s.key} вже підготовано`); continue; }
    console.log(`\n📄 ${s.key} ← ${s.file}${typeof s.sheet === 'string' ? ' / ' + s.sheet : ''}`);
    fs.writeFileSync(openpyxlPy, PY_EXTRACT);
    const { execFileSync } = require('child_process');
    const raw = execFileSync('python3', [openpyxlPy, path.join(DIR, s.file), String(s.sheet), String(s.header), JSON.stringify(s.cols)],
      { maxBuffer: 1024 * 1024 * 1024, encoding: 'utf8' });

    const seen = new Set();
    const lines = [];
    let rows = 0, withEmail = 0, withPhone = 0, dropped = 0;
    for (const line of raw.split('\n')) {
      if (!line) continue;
      rows++;
      const [email, phone, fn, ln, gen, doby] = line.split('\t');
      const e = normEmail(email), p = normPhone(phone);
      if (!e && !p) { dropped++; continue; }          // без контакту Meta не змечить
      if (e) withEmail++;
      if (p) withPhone++;
      const rec = [h(e), h(p), h(normName(fn)), h(normName(ln)), h(normGender(gen)), h(normYear(doby))];
      const k = rec[0] + '|' + rec[1];
      if (seen.has(k)) continue;
      seen.add(k);
      lines.push(rec.join('\t'));
    }
    fs.writeFileSync(outFile, lines.join('\n'));
    console.log(`   рядків: ${rows} → унікальних: ${lines.length} (без контакту відкинуто ${dropped})`);
    console.log(`   з email: ${withEmail} · з телефоном: ${withPhone}`);
    state[s.key] = { ...(state[s.key] || {}), name: s.name, rows: lines.length, prepared: true };
    writeState(state);
  }
  console.log(`\n✅ Готово. Хешовані файли: ${OUT}`);
}

async function upload() {
  const state = readState();
  for (const s of SOURCES) {
    const f = path.join(OUT, s.key + '.tsv');
    if (!fs.existsSync(f)) throw new Error('спершу prepare: нема ' + f);
    const st = state[s.key] || {};
    const data = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => l.split('\t'));

    let audId = st.audience_id;
    if (!audId) {
      const r = await apiPost(`${ACCT}/customaudiences`, {
        name: s.name,
        subtype: 'CUSTOM',
        description: `Завантажено ${new Date().toISOString().slice(0, 10)} з «${s.file}». Хешування SHA-256 локально.`,
        customer_file_source: 'USER_PROVIDED_ONLY',
      });
      if (r.error) throw new Error(`${s.key}: ${r.error.error_user_msg || r.error.message}`);
      audId = r.id;
      state[s.key] = { ...st, audience_id: audId, name: s.name, sent: 0 };
      writeState(state);
      console.log(`\n📋 ${s.name} — створено ${audId}`);
    } else {
      console.log(`\n📋 ${s.name} — ${audId} (наявна, надіслано ${st.sent || 0})`);
    }

    const sessionId = String(st.session_id || Date.now());
    state[s.key].session_id = sessionId;
    let sent = state[s.key].sent || 0;
    const total = data.length;
    let seq = Math.floor(sent / BATCH) + 1;

    while (sent < total) {
      const chunk = data.slice(sent, sent + BATCH);
      const last = sent + chunk.length >= total;
      const r = await apiPost(`${audId}/users`, {
        session: JSON.stringify({ session_id: sessionId, batch_seq: seq, last_batch_flag: last, estimated_num_total: total }),
        payload: JSON.stringify({ schema: SCHEMA, data: chunk }),
      });
      if (r.error) {
        const m = r.error.error_user_msg || r.error.message;
        if (/rate|limit|#17|#4/i.test(m)) { console.log(`   ⏳ ліміт, пауза 60 с…`); await sleep(60000); continue; }
        throw new Error(`${s.key} batch ${seq}: ${m}`);
      }
      sent += chunk.length; seq++;
      state[s.key].sent = sent; writeState(state);
      process.stdout.write(`\r   ${sent}/${total} (${(sent / total * 100).toFixed(0)}%)   `);
      await sleep(400);
    }
    console.log(`\n   ✅ надіслано ${sent}`);
  }
  await verify();
}

async function verify() {
  const state = readState();
  console.log('\n📊 Аудиторії в кабінеті:');
  for (const s of SOURCES) {
    const id = (state[s.key] || {}).audience_id;
    if (!id) { console.log(`   ❌ ${s.name} — не створено`); continue; }
    const a = await apiGet(id, { fields: 'name,approximate_count_lower_bound,approximate_count_upper_bound,operation_status,delivery_status,data_source' });
    const lo = a.approximate_count_lower_bound, hi = a.approximate_count_upper_bound;
    const size = (lo === undefined || lo < 0) ? 'рахується…' : `${lo}–${hi}`;
    console.log(`   ${a.name.padEnd(46)} ${String(size).padStart(16)}  ${(a.operation_status || {}).description || ''}`);
  }
  console.log('\n   Розмір аудиторії Meta рахує 30–60 хв після заливки.');
}

const PY_EXTRACT = `
import sys, json, openpyxl
p, sheet, header, cols = sys.argv[1], sys.argv[2], int(sys.argv[3]), json.loads(sys.argv[4])
wb = openpyxl.load_workbook(p, read_only=True, data_only=True)
ws = wb[sheet] if not sheet.isdigit() else wb.worksheets[int(sheet)]
out = sys.stdout
for r in ws.iter_rows(min_row=header+1, values_only=True):
    if r is None: continue
    def g(k):
        i = cols.get(k)
        if i is None or i >= len(r): return ''
        v = r[i]
        return '' if v is None or str(v).strip() in ('', 'NULL') else str(v).strip()
    fn, ln = g('fn'), g('ln')
    if 'fullname' in cols:
        parts = g('fullname').split()
        fn = parts[0] if parts else ''
        ln = ' '.join(parts[1:]) if len(parts) > 1 else ''
    row = [g('email'), g('phone'), fn, ln, g('gen'), g('doby')]
    if not row[0] and not row[1]: continue
    out.write('\\t'.join(x.replace('\\t',' ').replace('\\n',' ') for x in row) + '\\n')
wb.close()
`;

const cmd = process.argv[2];
(async () => {
  if (cmd === 'prepare') await prepare();
  else if (cmd === 'upload') await upload();
  else if (cmd === 'verify') await verify();
  else console.log('cmd: prepare | upload | verify');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
