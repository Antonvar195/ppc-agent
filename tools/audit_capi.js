/**
 * audit_capi.js — read-only аудит настройки Conversions API / пикселя.
 *
 * Проверяет то, от чего зависит качество всей оптимизации:
 *  - какие датасеты подключены к аккаунту, когда последний раз стреляли
 *  - объём событий и их источник (браузер vs сервер) — есть ли дубли
 *  - качество матчинга и диагностика от Meta
 *  - что уходит в value: первый платёж или LTV
 *  - разброс атрибуции 1d_view / 1d_click / 7d_click — ширина интервала правды
 *
 * Ничего не меняет. Запуск: node tools/audit_capi.js
 */

const { apiGet } = require('./meta_api');
require('dotenv').config();

const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;

const line = (s = '') => console.log(s);
const h1 = (s) => { line(); line('═'.repeat(64)); line(s); line('═'.repeat(64)); };
const h2 = (s) => { line(); line('── ' + s + ' ' + '─'.repeat(Math.max(0, 58 - s.length))); };

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

// Обёртка: не роняем весь аудит из-за одного недоступного эндпоинта
async function probe(label, path, params) {
  try {
    const r = await apiGet(path, params);
    if (r.error) return { ok: false, label, error: `${r.error.message} (code ${r.error.code})` };
    return { ok: true, label, data: r };
  } catch (e) {
    return { ok: false, label, error: e.message };
  }
}

// /stats отдаёт почасовые бакеты вида
// {data:[{start_time, aggregation, data:[{value:"PageView", count:1084}]}]}
function sumStats(payload) {
  const totals = {};
  for (const bucket of (payload.data || [])) {
    for (const item of (bucket.data || [])) {
      const k = String(item.value);
      totals[k] = (totals[k] || 0) + Number(item.count || 0);
    }
  }
  return totals;
}

async function main() {
  h1('АУДИТ CAPI / ПИКСЕЛЯ — ' + AD_ACCOUNT_ID);

  // ── 1. Аккаунт ────────────────────────────────────────────────
  const acc = await probe('account', AD_ACCOUNT_ID, {
    fields: 'id,name,account_status,currency,timezone_name,amount_spent'
  });
  h2('Аккаунт');
  if (acc.ok) {
    const a = acc.data;
    line(`  ${a.name}`);
    line(`  статус ${a.account_status === 1 ? 'активен' : a.account_status} · ${a.currency} · ${a.timezone_name}`);
  } else line('  ✗ ' + acc.error);

  // ── 2. Датасеты (пиксели) ─────────────────────────────────────
  h2('Датасеты, подключённые к аккаунту');
  const pixels = await probe('pixels', `${AD_ACCOUNT_ID}/adspixels`, {
    fields: [
      'id', 'name', 'last_fired_time', 'creation_time',
      'enable_automatic_matching', 'automatic_matching_fields',
      'data_use_setting', 'first_party_cookie_status',
      'is_unavailable', 'owner_business'
    ].join(',')
  });

  const pixelIds = [];
  if (pixels.ok) {
    const list = pixels.data.data || [];
    if (!list.length) line('  ⚠️  датасетов не найдено');
    for (const p of list) {
      pixelIds.push(p.id);
      line(`  • ${p.name}  [${p.id}]`);
      line(`      последнее событие: ${p.last_fired_time || '—'}`);
      line(`      auto matching:     ${p.enable_automatic_matching ? 'вкл' : 'ВЫКЛ'}` +
           (p.automatic_matching_fields ? ` (${p.automatic_matching_fields.join(', ')})` : ''));
      line(`      first-party cookie: ${p.first_party_cookie_status || '—'}`);
      line(`      data use:          ${p.data_use_setting || '—'}`);
      if (p.is_unavailable) line('      ⚠️  помечен как unavailable');
    }
  } else line('  ✗ ' + pixels.error);

  // ── 3. По каждому датасету: объём событий и источник ───────────
  for (const pid of pixelIds) {
    h2(`Датасет ${pid} — события за 28 дней`);

    // Разбивка по типу события
    const byEvent = await probe('stats-event', `${pid}/stats`, {
      aggregation: 'event',
      start_time: daysAgo(28),
      end_time: daysAgo(0)
    });
    if (byEvent.ok) {
      const totals = sumStats(byEvent.data);
      const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
      if (sorted.length) {
        line('  По типам событий (всего на сайте, не только из рекламы):');
        for (const [ev, n] of sorted) line(`    ${ev.padEnd(28)} ${n.toLocaleString('uk')}`);
      } else line('  (нет данных)');
    } else line('  ✗ по событиям: ' + byEvent.error);

    // Разбивка по источнику: браузер vs сервер — ключевая проверка на дубли
    const byHost = await probe('stats-host', `${pid}/stats`, {
      aggregation: 'host',
      start_time: daysAgo(28),
      end_time: daysAgo(0)
    });
    if (byHost.ok) {
      const totals = sumStats(byHost.data);
      const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
      if (sorted.length) {
        line('  По источнику (браузер / сервер) — проверка на дубли:');
        for (const [host, n] of sorted) line(`    ${String(host).padEnd(28)} ${n.toLocaleString('uk')}`);
      } else line('  (нет данных по источнику)');
    } else line('  ✗ по источнику: ' + byHost.error);

    // Диагностика от Meta — сюда попадают проблемы матчинга и дедупликации
    const checks = await probe('da_checks', `${pid}/da_checks`, {});
    if (checks.ok) {
      const rows = checks.data.data || [];
      const bad = rows.filter(c => String(c.result).toLowerCase() === 'failed');
      line(`  Диагностика Meta: ${rows.length} проверок, проблемных ${bad.length}`);
      for (const c of bad.slice(0, 12)) {
        line(`    ⚠️  ${c.key || c.title || '?'} → ${c.result}`);
        if (c.description) line(`        ${String(c.description).slice(0, 140)}`);
      }
    } else line('  ✗ диагностика: ' + checks.error);
  }

  // ── 4. Кастомные конверсии ────────────────────────────────────
  h2('Кастомные конверсии');
  const cc = await probe('customconversions', `${AD_ACCOUNT_ID}/customconversions`, {
    fields: 'id,name,custom_event_type,rule,is_archived,default_conversion_value',
    limit: 50
  });
  if (cc.ok) {
    const list = (cc.data.data || []).filter(c => !c.is_archived);
    if (!list.length) line('  (нет активных)');
    for (const c of list) {
      line(`  • ${c.name} [${c.id}] — ${c.custom_event_type}` +
           (c.default_conversion_value ? ` · default value ${c.default_conversion_value}` : ''));
    }
  } else line('  ✗ ' + cc.error);

  // ── 5. Офлайн-датасеты (если продажи льются как offline events) ─
  h2('Офлайн-датасеты');
  const off = await probe('offline', `${AD_ACCOUNT_ID}/offline_conversion_data_sets`, {
    fields: 'id,name,event_stats,last_upload_app,is_restricted_use'
  });
  if (off.ok) {
    const list = off.data.data || [];
    if (!list.length) line('  (нет — значит продажи идут через CAPI на пиксель, не как offline)');
    for (const o of list) line(`  • ${o.name} [${o.id}] · последняя загрузка: ${o.last_upload_app || '—'}`);
  } else line('  ✗ ' + off.error);

  // ── 6. Value: первый платёж или LTV ───────────────────────────
  h2('Что уходит в value (последние 30 дней)');
  const val = await probe('insights-value', `${AD_ACCOUNT_ID}/insights`, {
    fields: 'spend,actions,action_values,purchase_roas',
    time_range: JSON.stringify({ since: daysAgo(30), until: daysAgo(1) }),
    level: 'account'
  });
  if (val.ok) {
    const row = (val.data.data || [])[0];
    if (!row) line('  (нет данных за период)');
    else {
      const find = (arr, types) => {
        if (!arr) return null;
        for (const t of types) {
          const f = arr.find(x => x.action_type === t);
          if (f) return f;
        }
        return null;
      };
      const PURCHASE = ['purchase', 'offsite_conversion.fb_pixel_purchase'];
      const pc = find(row.actions, PURCHASE);
      const pv = find(row.action_values, PURCHASE);
      line(`  Расход:            $${Number(row.spend || 0).toFixed(2)}`);
      line(`  Покупок:           ${pc ? pc.value : 0}`);
      if (pv && pc && Number(pc.value) > 0) {
        const avg = Number(pv.value) / Number(pc.value);
        line(`  Сумма value:       ${Number(pv.value).toFixed(2)}`);
        line(`  Средний чек:       ${avg.toFixed(2)}   ← сверь с ценой абонемента`);
        line(`  ROAS:              ${row.purchase_roas ? row.purchase_roas[0]?.value : '—'}`);
      } else {
        line('  ⚠️  value НЕ передаётся — оптимизация по количеству, не по ценности');
      }
      // Все типы событий, которые вообще долетают
      if (row.actions) {
        line('  Все события в аккаунте:');
        for (const a of row.actions.sort((x, y) => Number(y.value) - Number(x.value)).slice(0, 15)) {
          line(`    ${a.action_type.padEnd(42)} ${Number(a.value).toLocaleString('uk')}`);
        }
      }
    }
  } else line('  ✗ ' + val.error);

  // ── 7. Ширина интервала атрибуции ─────────────────────────────
  h2('Разброс по окнам атрибуции (30 дней) — ширина «интервала правды»');
  const attr = await probe('insights-attr', `${AD_ACCOUNT_ID}/insights`, {
    fields: 'actions',
    time_range: JSON.stringify({ since: daysAgo(30), until: daysAgo(1) }),
    level: 'account',
    action_attribution_windows: JSON.stringify(['1d_view', '1d_click', '7d_click', '28d_click'])
  });
  if (attr.ok) {
    const row = (attr.data.data || [])[0];
    if (!row || !row.actions) line('  (нет данных)');
    else {
      const p = row.actions.find(a => ['purchase', 'offsite_conversion.fb_pixel_purchase'].includes(a.action_type));
      if (!p) line('  (покупок за период нет)');
      else {
        for (const w of ['1d_view', '1d_click', '7d_click', '28d_click']) {
          if (p[w] !== undefined) line(`    ${w.padEnd(12)} ${p[w]}`);
        }
        if (p['1d_view'] !== undefined && p['7d_click'] !== undefined) {
          const view = Number(p['1d_view']), click = Number(p['7d_click']);
          const share = (view + click) > 0 ? (view / (view + click) * 100) : 0;
          line();
          line(`  Доля view-through: ${share.toFixed(1)}%`);
          line('  Чем она выше, тем шире расхождение с CRM — CRM их не видит вообще.');
        }
      }
    }
  } else line('  ✗ ' + attr.error);

  h1('КОНЕЦ АУДИТА');
}

main().catch(e => { console.error('Фатальная ошибка:', e.message); process.exit(1); });
