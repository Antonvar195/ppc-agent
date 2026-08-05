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
 *
 * 4. Стадии не смешиваются. Одна карточка может нести и производство
 *    («сделай вариации»), и размещение («поставь их объявлениями»), но
 *    исполняются они в разные моменты: производство до вашего апрува,
 *    размещение после. Шаги чужой стадии не ошибка — они просто ждут
 *    своего прохода.
 */

require('dotenv').config();
const { apiGet, apiPost } = require('../tools/meta_api');
const ops = require('./ops');

/** Поля, по которым сверяемся и из которых собирается откат. */
const WATCH = {
  campaign: ['name', 'status', 'effective_status', 'daily_budget', 'lifetime_budget'],
  adset:    ['name', 'status', 'effective_status', 'daily_budget', 'lifetime_budget', 'bid_amount'],
  ad:       ['name', 'status', 'effective_status']
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
function drift(step, snapshotState, live, { stage = 'placement' } = {}) {
  const out = [];
  if (!live || !live.id) return [{ field: 'объект', was: 'существовал', now: 'не найден' }];

  if (snapshotState?.name && live.name !== snapshotState.name) {
    out.push({ field: 'имя', was: snapshotState.name, now: live.name });
  }

  // Статус сверяем и с собственным, и с эффективным. Витрина хранит
  // эффективный (объявление внутри выключенной кампании — CAMPAIGN_PAUSED),
  // а API отдаёт собственный (ACTIVE). Сравнивать их напрямую — значит
  // получать расхождение там, где ничего не менялось.
  //
  // На производстве статус вообще не сверяем: исходником вариации служит
  // отработавший победитель, и то, что его успели выключить, — не помеха.
  if (stage !== 'production' && snapshotState?.status &&
      live.status !== snapshotState.status && live.effective_status !== snapshotState.status) {
    out.push({ field: 'статус', was: snapshotState.status,
               now: live.status + (live.effective_status && live.effective_status !== live.status
                                    ? ` (эффективный ${live.effective_status})` : '') });
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

/** Обработчик по имени из словаря: "creative.makeVariants". */
function resolveHandler(name) {
  const [mod, fn] = String(name).split('.');
  const m = { creative: () => require('./creative') }[mod];
  if (!m) throw new Error(`обработчик «${name}»: модуля ${mod} нет`);
  const f = m()[fn];
  if (typeof f !== 'function') throw new Error(`обработчик «${name}»: функции ${fn} нет`);
  return f;
}

/**
 * Исполнить спецификацию.
 * @param spec {opsVersion, steps:[{op,level,match:{id,name},set}], snapshot}
 * @param opts.stage какую стадию исполняем: production либо placement
 * @param opts.taskGid карточка — обработчикам нужно, куда класть материалы
 */
async function run(spec, { dryRun = false, stage = 'placement', taskGid = null } = {}) {
  const report = { ok: false, dryRun, stage, steps: [], applied: [], reverted: [],
                   skipped: [], stoppedAt: null, error: null };

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
  const ctx = { taskGid, dryRun };

  for (const [i, step] of steps.entries()) {
    const entry = { n: i + 1, op: step.op, level: step.level,
                    object: step.match.name || step.match.id, id: step.match.id };

    if ((compiled[i].stage || 'placement') !== stage) {
      report.skipped.push({ ...entry, why: `стадия ${compiled[i].stage}, сейчас идёт ${stage}` });
      continue;
    }
    let live;
    try { live = await liveState(step.level, step.match.id); }
    catch (e) { entry.error = `не прочитал объект: ${e.message}`; report.steps.push(entry); report.stoppedAt = i + 1; break; }

    const d = drift(step, byId.get(String(step.match.id)), live, { stage: compiled[i].stage });
    if (d.length) {
      entry.drift = d;
      entry.error = 'состояние объекта изменилось после сборки спецификации: ' +
        d.map(x => `${x.field} было ${x.was}, стало ${x.now}`).join('; ');
      report.steps.push(entry); report.stoppedAt = i + 1; break;
    }

    entry.call = compiled[i].call;
    // Откат есть только у изменений настроек. Производство откатывать
    // нечего — лишние картинки в карточке удаляются рукой.
    entry.revert = (compiled[i].kind === 'api' && compiled[i].reversible) ? revertFrom(step, live) : null;

    try {
      if (compiled[i].kind === 'handler') {
        const fn = resolveHandler(compiled[i].handler);
        entry.result = await fn(compiled[i].call, ctx);
        entry.note = entry.result?.summary || null;
        entry.warn = entry.result?.warn || null;
      } else if (dryRun) {
        entry.note = 'проверка без исполнения';
      } else {
        entry.result = await apiPost(compiled[i].call.path, compiled[i].call.params);
      }
      entry.ok = true;
      if (!dryRun) report.applied.push(entry);
    } catch (e) {
      entry.error = `${compiled[i].kind === 'handler' ? compiled[i].title : 'Meta'}: ${e.message}`;
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
