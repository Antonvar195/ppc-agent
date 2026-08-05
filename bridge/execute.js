/**
 * bridge/execute.js — исполнение проверенной спецификации.
 *
 * Мост между аналитиком и кабинетом. Аналитик собрал спецификацию, проверил
 * её своими проверками и положил в карточку; человек согласовал; сюда приходит
 * результат. Здесь спецификация не обсуждается — здесь она исполняется или
 * отклоняется целиком.
 *
 * Три вещи, ради которых этот файл вообще нужен:
 *
 * 1. Расхождение с реальностью. Спецификацию собрали вчера по вчерашнему
 *    снимку. За сутки объект могли переименовать, остановить, поменять ему
 *    бюджет вручную. Исполнить старое решение по новому объекту — значит
 *    испортить и объект, и замер. Поэтому перед каждым шагом состояние
 *    сверяется вживую, и любое расхождение останавливает всю карточку.
 *
 * 2. Откат. Состояние «как было» снимается прямо перед изменением, а не
 *    берётся из спецификации: между сборкой и исполнением проходят сутки.
 *    Если шаг три упал, шаги один и два откатываются.
 *
 * 3. Ничего не включается. Проверка стоит в словаре операций, но здесь она
 *    повторяется на итоговом теле запроса. Одна проверка — это отсутствие
 *    проверки: тот, кто добавит операцию в словарь, про инвариант забудет.
 */

require('dotenv').config();
const { apiGet, apiPost } = require('../tools/meta_api');
const ops = require('./ops');

/** Поля, по которым сверяемся и из которых собирается откат. */
const WATCH = {
  campaign: ['name', 'status', 'daily_budget', 'lifetime_budget'],
  adset:    ['name', 'status', 'daily_budget', 'lifetime_budget', 'bid_amount'],
  ad:       ['name', 'status']
};

async function liveState(level, id) {
  const fields = WATCH[level].join(',');
  return apiGet(`/${id}`, { fields });
}

/**
 * Сверка снимка с живым состоянием.
 * Сверяем не всё подряд, а то, на чём основано решение: имя (по нему человек
 * читал карточку) и поля, которые шаг собирается менять. Расход и статистика
 * меняются постоянно — сверять их бессмысленно.
 */
function drift(step, snapshotState, live) {
  const out = [];
  if (!live || !live.id) return [{ field: 'объект', was: 'существовал', now: 'не найден' }];

  if (snapshotState?.name && live.name !== snapshotState.name) {
    out.push({ field: 'имя', was: snapshotState.name, now: live.name });
  }
  if (snapshotState?.status && live.status !== snapshotState.status) {
    out.push({ field: 'статус', was: snapshotState.status, now: live.status });
  }
  for (const key of Object.keys(step.set || {})) {
    if (!(key in (snapshotState || {}))) continue;
    // Бюджет в снимке аналитика хранится в долларах, у Meta — в центах
    const was = key.endsWith('_budget') ? Math.round(Number(snapshotState[key]) * 100) : snapshotState[key];
    const now = key.endsWith('_budget') ? Number(live[key]) : live[key];
    if (String(was) !== String(now)) out.push({ field: key, was, now });
  }
  return out;
}

/** Из живого состояния собрать шаг, возвращающий всё как было. */
function revertFrom(step, live) {
  const set = {};
  for (const key of Object.keys(step.set || {})) {
    if (live[key] !== undefined) set[key] = key.endsWith('_budget') || key === 'bid_amount'
      ? Number(live[key]) : live[key];
  }
  if (step.op === 'pause') set.status = live.status;
  // Вернуть в ACTIVE мост не может — и не должен: включает владелец.
  if (set.status && ops.FORBIDDEN.has(set.status)) delete set.status;
  if (!Object.keys(set).length) return null;
  return { op: 'update', level: step.level, match: { id: step.match.id }, set };
}

/**
 * Исполнить спецификацию.
 * @param spec {opsVersion, steps:[{op,level,match:{id,name},set}], snapshot}
 */
async function run(spec, { dryRun = false } = {}) {
  const report = { ok: false, dryRun, steps: [], applied: [], reverted: [], stoppedAt: null, error: null };

  if (!ops.versionMatches(spec.opsVersion)) {
    report.error = `спецификация собрана под словарь v${spec.opsVersion}, у исполнителя v${ops.VERSION} — не исполняю`;
    return report;
  }
  const steps = spec.steps || [];
  if (!steps.length) { report.error = 'в спецификации нет шагов'; return report; }
  const limit = ops.REGISTRY.limits.max_steps_per_card;
  if (steps.length > limit) {
    report.error = `${steps.length} шагов при пределе ${limit} — разбей карточку`;
    return report;
  }

  // Сначала компилируем всё. Упасть на шаге 4 из-за опечатки, уже изменив
  // первые три, — худший из возможных исходов.
  const compiled = [];
  for (const [i, step] of steps.entries()) {
    const c = ops.compile(step);
    if (!c.ok) { report.error = `шаг ${i + 1}: ${c.says}`; return report; }
    compiled.push(c);
  }

  const byId = new Map((spec.snapshot?.objects || []).map(o => [String(o.id), o.state]));

  for (const [i, step] of steps.entries()) {
    const entry = { n: i + 1, op: step.op, level: step.level,
                    object: step.match.name || step.match.id, id: step.match.id };
    let live;
    try { live = await liveState(step.level, step.match.id); }
    catch (e) { entry.error = `не прочитал объект: ${e.message}`; report.steps.push(entry); report.stoppedAt = i + 1; break; }

    const d = drift(step, byId.get(String(step.match.id)), live);
    if (d.length) {
      entry.drift = d;
      entry.error = 'состояние объекта изменилось после сборки спецификации: ' +
        d.map(x => `${x.field} было ${x.was}, стало ${x.now}`).join('; ');
      report.steps.push(entry); report.stoppedAt = i + 1; break;
    }

    entry.call = compiled[i].call;
    entry.revert = compiled[i].reversible ? revertFrom(step, live) : null;

    if (dryRun) { entry.ok = true; entry.note = 'проверка без исполнения'; report.steps.push(entry); continue; }

    try {
      entry.result = await apiPost(compiled[i].call.path, compiled[i].call.params);
      entry.ok = true;
      report.applied.push(entry);
    } catch (e) {
      entry.error = `Meta отказала: ${e.message}`;
      report.steps.push(entry); report.stoppedAt = i + 1; break;
    }
    report.steps.push(entry);
  }

  // Частично исполненная карточка — это состояние, которого нет ни в одном
  // замере. Откатываем то, что успели.
  if (report.stoppedAt && report.applied.length && !dryRun) {
    for (const done of [...report.applied].reverse()) {
      if (!done.revert) { report.reverted.push({ n: done.n, ok: false, says: 'необратимо, откатить нечем' }); continue; }
      const c = ops.compile(done.revert);
      if (!c.ok) { report.reverted.push({ n: done.n, ok: false, says: c.says }); continue; }
      try { await apiPost(c.call.path, c.call.params); report.reverted.push({ n: done.n, ok: true }); }
      catch (e) { report.reverted.push({ n: done.n, ok: false, says: e.message }); }
    }
  }

  report.ok = !report.stoppedAt;
  return report;
}

module.exports = { run, drift, revertFrom, liveState };
