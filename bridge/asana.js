/**
 * lib/asana.js — клиент Asana поверх REST.
 *
 * Без MCP и внешних зависимостей: модуль должен работать на Railway
 * внутри планировщика, а не только в чьей-то интерактивной сессии.
 *
 * Asana здесь — ПУЛЬТ, а не источник правды. Источник — memory/decisions.jsonl:
 * по нему считается факт и выносится вердикт. В Asana это видно и апрувится.
 * Две правды мы уже однажды чуть не завели с KPI-файлом; повторять не будем.
 */

const https = require('https');

const TOKEN = () => process.env.ASANA_TOKEN;
const WORKSPACE = () => process.env.ASANA_WORKSPACE || '1203455362584325';

function call(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify({ data: body }) : null;
    const req = https.request({
      hostname: 'app.asana.com',
      path: '/api/1.0' + path,
      method,
      headers: {
        Authorization: 'Bearer ' + TOKEN(),
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        let j;
        try { j = JSON.parse(d); } catch { return reject(new Error(`Asana вернула не JSON: ${d.slice(0, 200)}`)); }
        if (j.errors) return reject(new Error('Asana: ' + j.errors.map(e => e.message).join('; ')));
        resolve(j.data);
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const get = (p) => call('GET', p);
const post = (p, b) => call('POST', p, b);
const put = (p, b) => call('PUT', p, b);

/** Все страницы разом — у Asana лимит 100 на запрос. */
async function getAll(path, opt = '') {
  const sep = path.includes('?') ? '&' : '?';
  let out = [], offset = null;
  do {
    const url = `${path}${sep}limit=100${opt ? '&' + opt : ''}${offset ? '&offset=' + offset : ''}`;
    const res = await call('GET', url);
    out = out.concat(res || []);
    offset = null; // Asana отдаёт next_page отдельно; для наших объёмов хватает одной страницы
  } while (offset);
  return out;
}

const projects = () => get(`/projects?workspace=${WORKSPACE()}&opt_fields=name,archived`);
const sections = (projectGid) => get(`/projects/${projectGid}/sections?opt_fields=name`);
const tasks = (projectGid, fields) =>
  get(`/projects/${projectGid}/tasks?limit=100&opt_fields=${fields || 'name,completed,start_on,due_on,memberships.section.name,custom_fields.name,custom_fields.display_value,notes'}`);

const createProject = (name, notes) =>
  post('/projects', { name, notes, workspace: WORKSPACE(), default_view: 'timeline' });

const createSection = (projectGid, name, insertBefore = null) =>
  post(`/projects/${projectGid}/sections`, { name, ...(insertBefore ? { insert_before: insertBefore } : {}) });

const createTask = (data) => post('/tasks', { workspace: WORKSPACE(), ...data });
const updateTask = (gid, data) => put(`/tasks/${gid}`, data);
const addComment = (gid, text) => post(`/tasks/${gid}/stories`, { text });
const moveToSection = (sectionGid, taskGid) =>
  post(`/sections/${sectionGid}/addTask`, { task: taskGid });

/** Кастомное поле на уровне пространства + привязка к проекту. */
async function ensureField(spec, projectGid, existing) {
  const found = existing.find(f => f.name === spec.name);
  if (found) return found;
  const field = await post('/custom_fields', { workspace: WORKSPACE(), ...spec });
  await post(`/projects/${projectGid}/addCustomFieldSetting`, {
    custom_field: field.gid, is_important: true
  });
  return field;
}

const workspaceFields = () => get(`/workspaces/${WORKSPACE()}/custom_fields?opt_fields=name,resource_subtype,enum_options.name`);

/**
 * Вложения карточки.
 *
 * Через них проходит апрув креативов: мост кладёт вариации в карточку,
 * человек удаляет ненужные, а размещаются те, что остались. Кастомные поля
 * для этого не нужны (их и нет на бесплатном тарифе), и главное — удалить
 * лишнюю картинку понятнее, чем выставить галочку напротив её имени.
 */
const attachments = (taskGid) =>
  get(`/tasks/${taskGid}/attachments?opt_fields=name,download_url,resource_subtype,created_at`);

function attach(taskGid, filename, buffer, contentType = 'image/jpeg') {
  const https = require('https');
  const boundary = '----asana' + Buffer.from(filename).toString('hex').slice(0, 16);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="parent"\r\n\r\n${taskGid}\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, buffer, tail]);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'app.asana.com', path: '/api/1.0/attachments', method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN(),
                 'Content-Type': `multipart/form-data; boundary=${boundary}`,
                 'Content-Length': body.length }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        let j; try { j = JSON.parse(d); } catch { return reject(new Error(`Asana вернула не JSON: ${d.slice(0, 200)}`)); }
        if (j.errors) return reject(new Error('Asana: ' + j.errors.map(e => e.message).join('; ')));
        resolve(j.data);
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

module.exports = {
  get, post, put, getAll, projects, sections, tasks, attachments, attach,
  createProject, createSection, createTask, updateTask, addComment,
  moveToSection, ensureField, workspaceFields,
  WORKSPACE, configured: () => !!TOKEN()
};
