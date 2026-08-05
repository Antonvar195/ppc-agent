#!/usr/bin/env node
/**
 * bridge/run.js — исполнитель карточек.
 *
 *   node bridge/run.js            исполнить всё из «В работу»
 *   node bridge/run.js --dry      показать, что бы сделал, ничего не меняя
 *   node bridge/run.js --once     один проход (так его зовёт планировщик)
 *
 * Замыкает контур. Аналитик кладёт карточку с проверенной спецификацией,
 * человек читает, комментирует и двигает её в «В работу» — дальше сюда.
 *
 * Что здесь важно и почему:
 *
 * Секция «В работу» — единственный вход. Ни одна карточка не исполняется
 * потому, что она «выглядит согласованной»: перенос делает человек, и это
 * его подпись под решением.
 *
 * Результат уезжает в «Готово к запуску», а не в «Запущено». Мост меняет
 * настройки и создаёт копии, но ничего не включает — включает владелец,
 * руками. Разница между этими двумя секциями и есть граница автоматики.
 *
 * Повторный проход по той же карточке ничего не повторяет. Карточка,
 * которую не удалось исполнить, остаётся на месте, и без отметки о
 * попытке она собирала бы один и тот же комментарий каждые полчаса —
 * до тех пор, пока человек не перестал бы их читать вообще.
 */

require('dotenv').config();
const crypto = require('crypto');
const A = require('./asana');
const { run: execute } = require('./execute');
const ops = require('./ops');

const PROJECT_NAME = process.env.ASANA_PROJECT_NAME || 'Apollo · PPC тесты';
const IN = 'В работу';
const DONE = 'Готово к запуску';
const BACK = 'На апрув';
const MARK = '⚙️ Исполнитель';

/** Проект и секции по именам: gid'ы живут в другом сервисе, здесь их нет. */
async function locate() {
  const project = (await A.projects()).find(p => p.name === PROJECT_NAME && !p.archived);
  if (!project) throw new Error(`проект «${PROJECT_NAME}» не найден`);
  const sections = {};
  for (const s of await A.sections(project.gid)) sections[s.name] = s.gid;
  for (const need of [IN, DONE, BACK]) {
    if (!sections[need]) throw new Error(`нет секции «${need}» — прогони asana_setup в ppc-analyst`);
  }
  return { project: project.gid, sections };
}

const specOf = (notes) => {
  const m = String(notes || '').match(/```json\s*([\s\S]*?)```/);
  if (!m) return null;
  try { return JSON.parse(m[1].trim()); } catch { return null; }
};

const fingerprint = (spec) => crypto.createHash('sha1')
  .update(JSON.stringify(spec?.steps || [])).digest('hex').slice(0, 10);

/** Бралась ли эта же спецификация в работу раньше. */
async function alreadyTried(taskGid, fp) {
  const stories = await A.get(`/tasks/${taskGid}/stories?opt_fields=text,type`);
  return (stories || []).some(s => (s.text || '').includes(`${MARK} · ${fp}`));
}

function renderReport(report, fp) {
  const L = [`${MARK} · ${fp}`];
  if (report.error) { L.push('Не исполнено: ' + report.error); return L.join('\n'); }

  for (const s of report.steps) {
    const head = `${s.n}. ${s.op} · ${s.object}`;
    if (s.ok) L.push(`✅ ${head}${s.note ? ` — ${s.note}` : ''}`);
    else L.push(`❌ ${head} — ${s.error}`);
    if (s.drift) for (const d of s.drift) L.push(`     ${d.field}: было ${d.was}, стало ${d.now}`);
  }
  if (report.reverted.length) {
    L.push('');
    L.push('Откат: ' + report.reverted.map(r => `шаг ${r.n} ${r.ok ? 'вернули' : '— ' + r.says}`).join('; '));
  }
  L.push('');
  L.push(report.ok
    ? (report.dryRun
        ? 'Проверка прошла, ничего не менял.'
        : 'Исполнено. Всё лежит НА ПАУЗЕ — включаешь ты, вручную.')
    : 'Карточка возвращена на апрув: часть шагов не прошла.');
  return L.join('\n');
}

async function once({ dryRun = false } = {}) {
  if (!A.configured()) throw new Error('нет ASANA_TOKEN');
  const { project, sections } = await locate();

  const tasks = await A.tasks(project, 'name,notes,completed,memberships.section.name');
  const queue = tasks.filter(t => !t.completed &&
    (t.memberships || []).some(m => m.section?.name === IN));

  const out = [];
  for (const t of queue) {
    const spec = specOf(t.notes);
    if (!spec) {
      const fp = 'no-spec';
      if (await alreadyTried(t.gid, fp)) { out.push({ task: t.name, skipped: 'уже сообщал' }); continue; }
      await A.addComment(t.gid, `${MARK} · ${fp}\nВ карточке нет блока спецификации — исполнять нечего. ` +
        `Либо это ручная задача, либо аналитик не смог её перевести: причина написана в описании.`);
      await A.moveToSection(sections[BACK], t.gid);
      out.push({ task: t.name, error: 'нет спецификации' });
      continue;
    }

    const fp = fingerprint(spec);
    if (await alreadyTried(t.gid, fp)) { out.push({ task: t.name, skipped: 'эта спецификация уже бралась' }); continue; }

    const report = await execute(spec, { dryRun });
    await A.addComment(t.gid, renderReport(report, fp));
    if (!dryRun) await A.moveToSection(sections[report.ok ? DONE : BACK], t.gid);
    out.push({ task: t.name, ok: report.ok, steps: report.steps.length, error: report.error || null });
  }
  return { checked: queue.length, results: out, opsVersion: ops.VERSION, dryRun };
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry');
  once({ dryRun }).then(r => {
    console.log(`секция «${IN}»: ${r.checked} карточек${r.dryRun ? ' (сухой прогон)' : ''}`);
    for (const x of r.results) {
      console.log('  ' + (x.skipped ? `— ${x.task}: ${x.skipped}` : `${x.ok ? '✅' : '❌'} ${x.task}${x.error ? ': ' + x.error : ''}`));
    }
    if (!r.checked) console.log('  пусто — ждём, пока человек передвинет карточку');
  }).catch(e => { console.error('✗', e.message); process.exit(1); });
}

module.exports = { once, locate, specOf, fingerprint };
