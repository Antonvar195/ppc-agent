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
 * Один вход — «В работу», но карточка проходит его дважды.
 *
 * У креатива два разных согласования, и склеивать их нельзя:
 *   первое — решение «делаем вариации этого победителя вообще»;
 *   второе — решение «берём вот эти две картинки, остальные нет».
 * Первое принимается по цифрам, второе глазами, и между ними обязана
 * лежать работа. Поэтому:
 *
 *   1-й проход через «В работу» → производство. Мост делает вариации,
 *      кладёт их картинками в карточку и возвращает её на апрув.
 *   2-й проход через «В работу» → размещение. Мост создаёт объявления
 *      из того, что осталось во вложениях. Всё на паузе.
 *
 * Производство не запускается само по факту предложения аналитика.
 * Раньше запускалось — и это было неверно: рекомендация не равна
 * решению, а генерация стоит денег и внимания.
 *
 * Апрув креатива устроен вычитанием: размещается то, что осталось
 * во вложениях. Не понравился вариант — удалите картинку из карточки.
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
const NEW = 'Предложено';
const APPROVE = 'На апрув';
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
  for (const need of [NEW, APPROVE, IN, DONE, BACK]) {
    if (!sections[need]) throw new Error(`нет секции «${need}» — прогони asana_setup в ppc-analyst`);
  }
  return { project: project.gid, sections };
}

/**
 * Подпись спецификации: та ли это работа, которую предложила система.
 *
 * Проверка закрытая: нет ключа — не исполняем; подпись не сошлась —
 * не исполняем. Блок спецификации лежит в описании карточки, а описание
 * правится руками, и без подписи мост исполнял бы любое распоряжение,
 * которое кто-нибудь туда вписал.
 */
function verify(spec) {
  const key = process.env.BRIDGE_SECRET;
  if (!key) return 'на исполнителе нет BRIDGE_SECRET — проверить происхождение карточки нечем';
  if (!spec.sig) return 'спецификация без подписи: похоже, блок вписан вручную';
  const body = { opsVersion: spec.opsVersion, entry: spec.entry ?? null, steps: spec.steps };
  const mine = crypto.createHmac('sha256', key).update(JSON.stringify(body)).digest('hex').slice(0, 32);
  if (mine !== spec.sig) return 'подпись не сошлась: спецификацию правили после того, как её собрал аналитик';
  return null;
}

const specOf = (notes) => {
  const m = String(notes || '').match(/```json\s*([\s\S]*?)```/);
  if (!m) return null;
  try { return JSON.parse(m[1].trim()); } catch { return null; }
};

const fingerprint = (spec, stage) => crypto.createHash('sha1')
  .update(stage + '|' + JSON.stringify(spec?.steps || [])).digest('hex').slice(0, 10);

/** Есть ли в спецификации шаги данной стадии. */
const hasStage = (spec, stage) =>
  (spec?.steps || []).some(s => ops.stageOf(s.op) === stage);

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
    if (s.rejected) L.push(`     Не подошло: ${s.rejected}`);
    if (s.warn) L.push(`     ⚠️ ${s.warn}`);
    if (s.drift) for (const d of s.drift) L.push(`     ${d.field}: было ${d.was}, стало ${d.now}`);
  }
  if (report.reverted.length) {
    L.push('');
    L.push('Откат: ' + report.reverted.map(r => `шаг ${r.n} ${r.ok ? 'вернули' : '— ' + r.says}`).join('; '));
  }
  L.push('');
  if (!report.ok) {
    L.push(report.stage === 'production'
      ? 'Карточка осталась на месте: производство не прошло.'
      : 'Карточка возвращена на апрув: часть шагов не прошла.');
  } else if (report.dryRun) {
    L.push('Проверка прошла, ничего не менял.');
  } else if (report.stage === 'production') {
    L.push('Вариации во вложениях карточки. Посмотри и удали те, что не нужны — ' +
           'разместятся только оставшиеся. Потом верни карточку в «В работу»: ' +
           'вторым проходом они станут объявлениями, на паузе.');
  } else {
    L.push('Исполнено. Всё лежит НА ПАУЗЕ — включаешь ты, вручную.');
  }
  return L.join('\n');
}

async function pass({ tasks, sections, stage, from, onOk, onFail, dryRun, mark = null, skip = null }) {
  const queue = tasks.filter(t => !t.completed &&
    (t.memberships || []).some(m => m.section?.name === from));

  const out = [];
  for (const t of queue) {
    if (skip && skip.has(t.gid)) { out.push({ task: t.name, skipped: 'только что произведено, ждёт просмотра' }); continue; }
    const spec = specOf(t.notes);

    if (!spec) {
      // На производственном проходе молчим: у большинства карточек нечего
      // производить, и ругаться на каждую значит завалить доску.
      if (stage === 'production') { out.push({ task: t.name, skipped: 'нет спецификации' }); continue; }
      const fp = 'no-spec';
      if (await alreadyTried(t.gid, fp)) { out.push({ task: t.name, skipped: 'уже сообщал' }); continue; }
      await A.addComment(t.gid, `${MARK} · ${fp}\nВ карточке нет блока спецификации — исполнять нечего. ` +
        `Либо это ручная задача, либо аналитик не смог её перевести: причина написана в описании.`);
      await A.moveToSection(sections[BACK], t.gid);
      out.push({ task: t.name, error: 'нет спецификации' });
      continue;
    }

    if (!hasStage(spec, stage)) { out.push({ task: t.name, skipped: `нечего делать на стадии ${stage}` }); continue; }

    const bad = verify(spec);
    if (bad) {
      const fp = 'unsigned';
      if (await alreadyTried(t.gid, fp)) { out.push({ task: t.name, skipped: 'про подпись уже сообщал' }); continue; }
      await A.addComment(t.gid, `${MARK} · ${fp}\nНе исполняю: ${bad}.`);
      if (!dryRun) await A.moveToSection(sections[BACK], t.gid);
      out.push({ task: t.name, error: bad });
      continue;
    }

    const fp = fingerprint(spec, stage);
    if (await alreadyTried(t.gid, fp)) { out.push({ task: t.name, skipped: 'эта спецификация уже бралась' }); continue; }

    const report = await execute(spec, { dryRun, stage, taskGid: t.gid });
    await A.addComment(t.gid, renderReport(report, fp));
    if (!dryRun) await A.moveToSection(sections[report.ok ? onOk : onFail], t.gid);
    if (mark && report.ok) mark.add(t.gid);
    out.push({ task: t.name, stage, ok: report.ok, steps: report.steps.length, error: report.error || null });
  }
  return out;
}

async function once({ dryRun = false } = {}) {
  if (!A.configured()) throw new Error('нет ASANA_TOKEN');
  const { project, sections } = await locate();
  const tasks = await A.tasks(project, 'name,notes,completed,memberships.section.name');

  // Производство первым: карточка, которая сейчас произвела материал,
  // уезжает на апрув и в этом же проходе размещаться не должна — иначе
  // картинки уйдут в кабинет, минуя ваш просмотр. Список задач прочитан
  // один раз и о переносе не знает, поэтому помним такие карточки явно.
  const producedNow = new Set();
  const production = await pass({ tasks, sections, dryRun, stage: 'production',
                                  from: IN, onOk: APPROVE, onFail: BACK,
                                  mark: producedNow });
  const placement = await pass({ tasks, sections, dryRun, stage: 'placement',
                                 from: IN, onOk: DONE, onFail: BACK,
                                 skip: producedNow });

  return { checked: production.length + placement.length,
           results: [...production, ...placement],
           opsVersion: ops.VERSION, dryRun };
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry');
  once({ dryRun }).then(r => {
    console.log(`«${NEW}» → производство, «${IN}» → размещение: ${r.checked} карточек${r.dryRun ? ' (сухой прогон)' : ''}`);
    for (const x of r.results) {
      console.log('  ' + (x.skipped ? `— ${x.task}: ${x.skipped}` : `${x.ok ? '✅' : '❌'} ${x.task}${x.error ? ': ' + x.error : ''}`));
    }
    if (!r.checked) console.log('  пусто — ждём, пока человек передвинет карточку');
  }).catch(e => { console.error('✗', e.message); process.exit(1); });
}

module.exports = { once, locate, specOf, fingerprint };
