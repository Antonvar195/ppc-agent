/**
 * bridge/ops.js — разбор шага спецификации в вызов Meta API.
 *
 * Что здесь делается и почему именно так:
 *
 * Список операций лежит в ops.json, а не в коде. Требование было прямым:
 * жёсткого перечня действий быть не должно, иначе через месяц окажется,
 * что нужного действия нет, и его придётся дописывать в трёх местах.
 * Здесь — только механика: проверить шаг по словарю и собрать вызов.
 *
 * Проверка идёт на белом списке. Всё, чего нет в словаре, отклоняется —
 * не потому, что оно опасно, а потому, что неизвестное поле уходит в API
 * молча и меняет объект не так, как ожидал человек, читавший карточку.
 *
 * Отдельно и жёстко: ни один путь отсюда не может выставить ACTIVE.
 * Включает владелец руками. Это не настройка, это инвариант контура,
 * и он проверяется дважды — на поле status и на итоговом теле запроса.
 */

const fs = require('fs');
const path = require('path');

const REGISTRY = JSON.parse(fs.readFileSync(path.join(__dirname, 'ops.json'), 'utf8'));

const VERSION = REGISTRY.version;

/** Значения статуса, которые мост не выставляет ни при каких условиях. */
const FORBIDDEN = new Set(REGISTRY.forbidden.status_values);

function fail(says, extra = {}) { return { ok: false, says, ...extra }; }

/** Привести значение к тому, чего ждёт API, либо объяснить отказ. */
function coerce(name, spec, value) {
  switch (spec.type) {
    case 'cents': {
      const n = Number(value);
      if (!Number.isFinite(n)) return fail(`${name}: «${value}» не число`);
      if (!Number.isInteger(n)) return fail(`${name}: бюджет задаётся целым числом центов, пришло ${value}`);
      if (spec.min != null && n < spec.min) return fail(`${name}: ${n} меньше минимума ${spec.min}`);
      return { ok: true, value: n };
    }
    case 'json':
      if (value && typeof value === 'object') return { ok: true, value: JSON.stringify(value) };
      if (typeof value === 'string') return { ok: true, value };
      return fail(`${name}: ожидался объект или строка JSON`);
    case 'enum':
      if (!spec.values.includes(value)) return fail(`${name}: «${value}» не входит в ${spec.values.join('/')}`);
      return { ok: true, value };
    case 'string':
      if (typeof value !== 'string' || !value.trim()) return fail(`${name}: ожидалась непустая строка`);
      return { ok: true, value };
    default:
      return fail(`${name}: неизвестный тип ${spec.type} в словаре`);
  }
}

/**
 * Шаг → вызов API.
 * Возвращает {ok, call:{path, params}, reversible} либо {ok:false, says}.
 */
function compile(step) {
  const { op, level, match, set = {} } = step || {};

  const def = REGISTRY.ops[op];
  if (!def) {
    return fail(`операция «${op}» словарю неизвестна; есть: ${Object.keys(REGISTRY.ops).join(', ')}`);
  }
  if (!def.levels.includes(level)) {
    return fail(`«${op}» не применяется к уровню «${level}»; можно: ${def.levels.join(', ')}`);
  }
  if (!match || !match.id) {
    return fail('шаг без идентификатора объекта — исполнять по имени мост не будет');
  }

  const params = { ...(def.body || {}) };
  const declared = def.fields || {};

  for (const [key, raw] of Object.entries(set)) {
    const fieldSpec = declared[key];
    if (!fieldSpec) {
      return fail(`поле «${key}» для операции «${op}» не объявлено в словаре`);
    }
    if (!fieldSpec.levels.includes(level)) {
      return fail(`поле «${key}» не задаётся на уровне «${level}»`);
    }
    const c = coerce(key, fieldSpec, raw);
    if (!c.ok) return c;
    params[key] = c.value;
  }

  // Инвариант контура. Проверяется на итоговом теле, а не на входе:
  // статус может прийти и из словаря, и из set, и путей должно быть ноль.
  if (params.status && FORBIDDEN.has(params.status)) {
    return fail(`мост не выставляет статус ${params.status} — включение только вручную`);
  }
  if (params.status_option && FORBIDDEN.has(params.status_option)) {
    return fail(`копия не может родиться в статусе ${params.status_option}`);
  }

  // rename_suffix — удобство спецификации, у API такого поля нет
  if (params.rename_suffix != null) {
    params.rename_options = { rename_suffix: params.rename_suffix };
    delete params.rename_suffix;
  }

  const apiPath = def.endpoint ? `/${match.id}/${def.endpoint}` : `/${match.id}`;
  return { ok: true, call: { path: apiPath, params }, reversible: !!def.reversible, title: def.title };
}

/** Совпадает ли словарь, под который собрана спецификация, с нашим. */
function versionMatches(specVersion) {
  return String(specVersion) === String(VERSION);
}

const list = () => Object.entries(REGISTRY.ops).map(([op, d]) => ({
  op, title: d.title, levels: d.levels,
  fields: Object.entries(d.fields || {}).map(([f, s]) => ({ field: f, levels: s.levels, type: s.type }))
}));

module.exports = { compile, list, versionMatches, VERSION, REGISTRY, FORBIDDEN };
