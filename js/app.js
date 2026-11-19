import { db, uid, cloud, useCloud, localBackend } from './db.js';
import {
  METRICS, DERIVED, EXTRA, TAPE, GOALS, withDerived, num, fmt, fmtDelta, deltaQuality, clientAge,
  parseScaleText, parseBlocks, parseExercise, todayISO, fmtDate, rangeFor, classify,
} from './metrics.js';
import { buildReportPDF } from './pdf.js';
import { buildFoodDB, BUILTIN_FOODS, analyzeMeal, analyzeDiet, fmtMacros, setCookWord } from './nutrition.js';

const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');

const DEFAULT_SETTINGS = {
  business: '', coachName: '', phone: '', social: '', color: '#1f3a5f', logo: '', scale: 'omron',
};
let foods = BUILTIN_FOODS;
async function loadFoods() { foods = buildFoodDB(await db.all('foods')); }
const COLORS = ['#1f3a5f', '#0f766e', '#7c2d12', '#b91c1c', '#6d28d9', '#111827', '#c2410c', '#15803d'];

let settings = { ...DEFAULT_SETTINGS };

// ---------------- utilidades ----------------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const initials = n => (n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const parseNum = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? undefined : n; };

function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, ms);
}

function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); return fn(...a); };
  return d;
}

function openModal(html, onMount) {
  modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const bd = $('.modal-backdrop', modalRoot);
  bd.addEventListener('click', e => { if (e.target === bd) closeModal(); });
  const close = () => closeModal();
  $$('[data-close]', modalRoot).forEach(b => b.addEventListener('click', close));
  onMount && onMount($('.modal', modalRoot));
  const first = $('input, textarea, select', modalRoot);
  if (first && window.innerWidth > 640) first.focus();
}
function closeModal() { modalRoot.innerHTML = ''; }

function confirmDialog(msg, okLabel = 'Eliminar') {
  return new Promise(resolve => {
    openModal(`<h2>¿Seguro?</h2><p>${esc(msg)}</p>
      <div class="actions"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="ok">${esc(okLabel)}</button></div>`,
    m => {
      $('#ok', m).onclick = () => { closeModal(); resolve(true); };
      $$('[data-close]', m).forEach(b => b.addEventListener('click', () => resolve(false)));
    });
  });
}

function applyTheme() {
  document.documentElement.style.setProperty('--accent', settings.color);
  document.documentElement.style.setProperty('--accent-soft', `color-mix(in srgb, ${settings.color} 10%, white)`);
  $('meta[name=theme-color]').setAttribute('content', settings.color);
  $('#brand').textContent = settings.business || 'Reportes Coach';
}

// ---------------- router ----------------
const routes = [
  [/^#?\/?$/, viewClients],
  [/^#\/cliente\/([^/]+)(?:\/(\w+))?$/, viewClient],
  [/^#\/plantillas$/, viewTemplates],
  [/^#\/ajustes$/, viewSettings],
];

async function router() {
  const hash = location.hash || '#/';
  closeModal();
  for (const [re, fn] of routes) {
    const m = hash.match(re);
    if (m) {
      $$('[data-nav]').forEach(a => a.classList.toggle('active',
        (a.dataset.nav === 'clients' && (hash === '#/' || hash.startsWith('#/cliente'))) ||
        (a.dataset.nav === 'templates' && hash.startsWith('#/plantillas')) ||
        (a.dataset.nav === 'settings' && hash.startsWith('#/ajustes'))));
      await fn(...m.slice(1));
      return;
    }
  }
  location.hash = '#/';
}

// ================= CLIENTES =================
async function viewClients() {
  const [clients, measurements] = await Promise.all([db.all('clients'), db.all('measurements')]);
  const last = {};
  const count = {};
  for (const m of measurements) {
    count[m.clientId] = (count[m.clientId] || 0) + 1;
    if (!last[m.clientId] || m.date >= last[m.clientId].date) last[m.clientId] = m;
  }
  const showArchived = viewClients.archived || false;
  const list = clients
    .filter(c => !!c.archived === showArchived)
    .sort((a, b) => ((last[b.id]?.date || b.createdAt || '')).localeCompare(last[a.id]?.date || a.createdAt || ''));

  app.innerHTML = `
    <div class="row between" style="margin-bottom:12px">
      <h1>${showArchived ? 'Clientes archivados' : 'Clientes'} <span class="muted small">(${list.length})</span></h1>
      <button class="btn primary" id="new-client">+ Nuevo cliente</button>
    </div>
    <input class="search" id="search" type="search" placeholder="Buscar cliente…" autocomplete="off">
    <div class="client-list" id="list"></div>
    <p class="small" style="text-align:center;margin-top:18px">
      <a href="#" id="toggle-archived">${showArchived ? '← Ver clientes activos' : 'Ver clientes archivados'}</a>
    </p>`;

  const render = q => {
    const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const items = list.filter(c => norm(c.name).includes(norm(q)) || norm(c.phone).includes(norm(q)));
    $('#list').innerHTML = items.length ? items.map(c => {
      const l = last[c.id];
      return `<a class="client-item" href="#/cliente/${c.id}">
        <div class="avatar">${esc(initials(c.name))}</div>
        <div class="grow">
          <div class="name">${esc(c.name)}</div>
          <div class="meta">${l ? `Última: ${fmtDate(l.date)} · ${fmt(l.weight)} kg` : 'Sin mediciones'}${count[c.id] ? ` · ${count[c.id]} medición${count[c.id] > 1 ? 'es' : ''}` : ''}</div>
        </div>
        <span class="pill">${esc((GOALS[c.goal] || '').split(' ')[0] || '')}</span>
      </a>`;
    }).join('') : `<div class="empty card">${clients.length ? 'Sin resultados.' : 'Aún no tienes clientes. Agrega el primero con <b>+ Nuevo cliente</b>.'}</div>`;
  };
  render('');
  $('#search').addEventListener('input', e => render(e.target.value));
  $('#new-client').onclick = () => clientForm();
  $('#toggle-archived').onclick = e => { e.preventDefault(); viewClients.archived = !showArchived; viewClients(); };
}

function clientForm(client) {
  const c = client || { sex: 'M', goal: 'bajar' };
  openModal(`
    <h2>${client ? 'Editar cliente' : 'Nuevo cliente'}</h2>
    <form id="cf" class="stack">
      <div><label>Nombre completo *</label><input name="name" required value="${esc(c.name)}"></div>
      <div class="grid">
        <div><label>Sexo</label><select name="sex">
          <option value="M" ${c.sex !== 'F' ? 'selected' : ''}>Hombre</option>
          <option value="F" ${c.sex === 'F' ? 'selected' : ''}>Mujer</option></select></div>
        <div><label>Fecha de nacimiento</label><input name="birthdate" type="date" value="${esc(c.birthdate)}"></div>
        <div><label>o Edad (años)</label><input name="age" inputmode="numeric" value="${esc(c.age)}"></div>
        <div><label>Estatura (cm)</label><input name="height" inputmode="decimal" value="${esc(c.height)}"></div>
      </div>
      <div class="grid two">
        <div><label>Objetivo</label><select name="goal">
          ${Object.entries(GOALS).map(([k, v]) => `<option value="${k}" ${c.goal === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select></div>
        <div><label>Teléfono / WhatsApp</label><input name="phone" type="tel" value="${esc(c.phone)}"></div>
      </div>
      <div><label>Notas (lesiones, padecimientos, etc.)</label><textarea name="notes">${esc(c.notes)}</textarea></div>
      <div class="actions">
        <button type="button" class="btn" data-close>Cancelar</button>
        <button class="btn primary">Guardar</button>
      </div>
    </form>`, m => {
    $('#cf', m).onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const data = {
        ...c,
        id: c.id || uid(),
        name: f.name.trim(),
        sex: f.sex,
        birthdate: f.birthdate || '',
        age: parseNum(f.age),
        height: parseNum(f.height),
        goal: f.goal,
        phone: f.phone.trim(),
        notes: f.notes.trim(),
        createdAt: c.createdAt || new Date().toISOString(),
      };
      await db.put('clients', data);
      closeModal();
      toast('Cliente guardado');
      if (!client) location.hash = `#/cliente/${data.id}`;
      else router();
    };
  });
}

// ================= DETALLE CLIENTE =================
async function viewClient(id, tab = 'mediciones') {
  const client = await db.get('clients', id);
  if (!client) { location.hash = '#/'; return; }
  const measurements = await db.byClient(id);
  const plan = (await db.get('plans', id)) || { clientId: id, diet: { meals: [] }, routine: { days: [] } };
  const age = clientAge(client);

  app.innerHTML = `
    <p class="small" style="margin:0 0 6px"><a href="#/">← Clientes</a></p>
    <div class="card">
      <div class="row between">
        <div class="row" style="flex-wrap:nowrap;min-width:0">
          <div class="avatar">${esc(initials(client.name))}</div>
          <div class="grow">
            <h1 style="margin:0">${esc(client.name)}</h1>
            <div class="muted small">${[client.sex === 'F' ? 'Mujer' : 'Hombre', age != null ? age + ' años' : null, num(client.height) ? client.height + ' cm' : null, GOALS[client.goal]].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        <div class="row">
          <button class="btn sm" id="edit-client">Editar</button>
          <button class="btn sm ghost" id="more">⋯</button>
        </div>
      </div>
      ${client.notes ? `<p class="small muted" style="margin:10px 0 0">${esc(client.notes)}</p>` : ''}
    </div>
    <nav class="tabs">
      ${[['mediciones', 'Mediciones'], ['dieta', 'Dieta'], ['rutina', 'Rutina'], ['reporte', 'Reporte PDF']]
        .map(([k, l]) => `<a href="#/cliente/${id}/${k}" class="${tab === k ? 'active' : ''}">${l}</a>`).join('')}
    </nav>
    <section id="tab"></section>`;

  $('#edit-client').onclick = () => clientForm(client);
  $('#more').onclick = () => openModal(`
    <h2>${esc(client.name)}</h2>
    <div class="stack">
      <button class="btn" id="archive" style="width:100%">${client.archived ? 'Restaurar cliente' : 'Archivar cliente (ya no entrena)'}</button>
      <button class="btn danger" id="del" style="width:100%">Eliminar cliente y todos sus datos</button>
    </div>
    <div class="actions"><button class="btn" data-close>Cerrar</button></div>`, m => {
    $('#archive', m).onclick = async () => {
      await db.put('clients', { ...client, archived: !client.archived });
      closeModal(); toast(client.archived ? 'Cliente restaurado' : 'Cliente archivado'); router();
    };
    $('#del', m).onclick = async () => {
      if (await confirmDialog(`Se eliminarán ${client.name}, sus ${measurements.length} mediciones, dieta y rutina. No se puede deshacer.`)) {
        await db.deleteClient(id); toast('Cliente eliminado'); location.hash = '#/';
      }
    };
  });

  const el = $('#tab');
  if (tab === 'dieta') return tabDiet(el, client, plan);
  if (tab === 'rutina') return tabRoutine(el, client, plan);
  if (tab === 'reporte') return tabReport(el, client, measurements, plan);
  return tabMeasurements(el, client, measurements);
}

// ---------- Mediciones ----------
function tabMeasurements(el, client, ms) {
  const goal = client.goal;
  const last = ms.length ? withDerived(ms[ms.length - 1]) : null;
  const prev = ms.length > 1 ? withDerived(ms[ms.length - 2]) : null;
  const first = ms.length > 1 ? withDerived(ms[0]) : null;

  const kpi = (def) => {
    if (!last || !num(last[def.key])) return '';
    const d = prev && num(prev[def.key]) ? last[def.key] - prev[def.key] : null;
    const dt = first && num(first[def.key]) ? last[def.key] - first[def.key] : null;
    const cls = classify(last[def.key], rangeFor(def.key, client, last));
    return `<div class="kpi"><div class="k">${esc(def.short || def.label)}</div>
      <div class="v">${fmt(last[def.key], def.dec)}<span class="small muted"> ${def.unit === 'nivel' ? '' : esc(def.unit)}</span></div>
      ${cls && cls.label ? `<div class="small muted">${esc(cls.label)}</div>` : ''}
      ${num(d) ? `<div class="d ${deltaQuality(def, d, goal)}">${fmtDelta(d, def.dec)} vs anterior</div>` : ''}
      ${num(dt) && first !== prev ? `<div class="d ${deltaQuality(def, dt, goal)}">${fmtDelta(dt, def.dec)} desde inicio</div>` : ''}
    </div>`;
  };

  el.innerHTML = `
    <div class="row between" style="margin-bottom:12px">
      <h2 style="margin:0">${last ? `Última medición · ${fmtDate(last.date)}` : 'Mediciones'}</h2>
      <button class="btn primary" id="add-m">+ Nueva medición</button>
    </div>
    ${last ? `<div class="kpis" style="margin-bottom:14px">${[...METRICS, ...EXTRA, ...DERIVED.filter(d => !(d.key === 'fatKg' && num(last.fatMassKg)))].map(kpi).join('')}</div>` : `<div class="card empty">Registra la primera medición de la báscula.</div>`}
    ${ms.length ? `<div class="card"><h3>Historial</h3><div class="table-wrap"><table class="data">
      <thead><tr><th>Fecha</th>${METRICS.map(d => `<th>${esc(d.short || d.label)}</th>`).join('')}<th></th></tr></thead>
      <tbody>${[...ms].reverse().map(m => `<tr>
        <td><b>${fmtDate(m.date)}</b></td>
        ${METRICS.map(d => `<td>${fmt(m[d.key], d.dec)}</td>`).join('')}
        <td><button class="btn sm ghost" data-edit="${m.id}">Editar</button></td>
      </tr>`).join('')}</tbody></table></div></div>` : ''}
    ${ms.some(m => TAPE.some(d => num(m[d.key]))) ? `<div class="card"><h3>Medidas con cinta (cm)</h3><div class="table-wrap"><table class="data">
      <thead><tr><th>Fecha</th>${TAPE.map(d => `<th>${esc(d.label)}</th>`).join('')}</tr></thead>
      <tbody>${[...ms].reverse().filter(m => TAPE.some(d => num(m[d.key]))).map(m => `<tr>
        <td><b>${fmtDate(m.date)}</b></td>${TAPE.map(d => `<td>${fmt(m[d.key], 1)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>` : ''}`;

  $('#add-m').onclick = () => measurementForm(client);
  $$('[data-edit]', el).forEach(b => b.onclick = () => measurementForm(client, ms.find(m => m.id === b.dataset.edit)));
}

function measurementForm(client, m) {
  const v = m || { date: todayISO() };
  openModal(`
    <h2>${m ? 'Editar medición' : 'Nueva medición'}</h2>
    <details ${m ? '' : 'open'} style="margin-bottom:12px">
      <summary class="small" style="cursor:pointer;font-weight:600">Pegar texto de la báscula (opcional)</summary>
      <textarea id="paste" placeholder="Peso:93.2&#10;BMI:30.4&#10;Porcentaje de grasa:28.0&#10;Porcentaje de músculo:34.4&#10;RM:1945&#10;Edad metabólica:57&#10;Grasa visceral:12" style="margin-top:8px;min-height:110px"></textarea>
      <button type="button" class="btn sm" id="parse" style="margin-top:6px">Llenar campos con el texto</button>
    </details>
    <form id="mf" class="stack">
      <div><label>Fecha</label><input name="date" type="date" required value="${esc(v.date)}"></div>
      <div class="grid">
        ${METRICS.map(d => `<div><label>${esc(d.label)}${d.unit ? ` (${esc(d.unit)})` : ''}${d.required ? ' *' : ''}</label>
          <input name="${d.key}" inputmode="decimal" ${d.required ? 'required' : ''} value="${num(v[d.key]) ? v[d.key] : ''}"></div>`).join('')}
      </div>
      <details ${settings.scale === 'inbody' || EXTRA.some(d => num(v[d.key])) ? 'open' : ''}>
        <summary class="small" style="cursor:pointer;font-weight:600">Datos extra de báscula InBody (opcional)</summary>
        <div class="grid" style="margin-top:8px">
          ${EXTRA.map(d => `<div><label>${esc(d.label)} (${esc(d.unit)})</label>
            <input name="${d.key}" inputmode="decimal" value="${num(v[d.key]) ? v[d.key] : ''}"></div>`).join('')}
        </div>
      </details>
      <details ${TAPE.some(d => num(v[d.key])) ? 'open' : ''}>
        <summary class="small" style="cursor:pointer;font-weight:600">Medidas con cinta (opcional, cm)</summary>
        <div class="grid" style="margin-top:8px">
          ${TAPE.map(d => `<div><label>${esc(d.label)}</label>
            <input name="${d.key}" inputmode="decimal" value="${num(v[d.key]) ? v[d.key] : ''}"></div>`).join('')}
        </div>
      </details>
      <div><label>Notas de esta medición</label><textarea name="notes" style="min-height:60px">${esc(v.notes)}</textarea></div>
      <div class="actions">
        ${m ? '<button type="button" class="btn danger" id="del-m" style="margin-right:auto">Eliminar</button>' : ''}
        <button type="button" class="btn" data-close>Cancelar</button>
        <button class="btn primary">Guardar</button>
      </div>
    </form>`, mod => {
    const form = $('#mf', mod);
    $('#parse', mod).onclick = () => {
      const data = parseScaleText($('#paste', mod).value);
      const keys = Object.keys(data);
      keys.forEach(k => { if (form.elements[k]) form.elements[k].value = data[k]; });
      keys.forEach(k => { const det = form.elements[k]?.closest('details'); if (det) det.open = true; });
      toast(keys.length ? `Se llenaron ${keys.length} campos` : 'No se reconocieron datos');
    };
    form.elements.weight.addEventListener('change', () => {
      const w = parseNum(form.elements.weight.value);
      if (w && num(client.height) && !form.elements.bmi.value) {
        form.elements.bmi.value = (w / (client.height / 100) ** 2).toFixed(1);
      }
    });
    if (m) $('#del-m', mod).onclick = async () => {
      if (await confirmDialog(`Eliminar la medición del ${fmtDate(m.date)}.`)) {
        await db.del('measurements', m.id); toast('Medición eliminada'); router();
      }
    };
    form.onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      const data = { ...v, id: v.id || uid(), clientId: client.id, date: f.date, notes: f.notes.trim(), createdAt: v.createdAt || new Date().toISOString() };
      for (const d of [...METRICS, ...EXTRA, ...TAPE]) data[d.key] = parseNum(f[d.key]);
      await db.put('measurements', data);
      closeModal(); toast('Medición guardada'); router();
    };
  });
}

// ---------- Dieta ----------
function tabDiet(el, client, plan) {
  const diet = plan.diet || (plan.diet = { meals: [] });
  const save = debounce(async () => {
    plan.updatedAt = new Date().toISOString();
    await db.put('plans', plan);
    const s = $('#saved', el); if (s) { s.textContent = '✓ Guardado'; setTimeout(() => s.textContent = '', 1500); }
  }, 500);

  const updateMacros = () => {
    const mode = diet.cookedMode || 'crudo';
    let any = false;
    diet.meals.forEach((m, i) => {
      const box = $(`[data-macro="${i}"]`, el);
      if (!box) return;
      const a = analyzeMeal(m.items, foods, mode);
      if (!a.items.length) { box.innerHTML = ''; return; }
      any = any || a.total.kcal > 0;
      box.innerHTML = `${a.total.kcal > 0 ? `<b>≈ ${esc(fmtMacros(a.total))}</b>` : ''}
        <details class="small"><summary>Ver detalle</summary>
          <table class="mini">${a.items.map(it => it.food
            ? `<tr><td>${esc(it.text)}</td><td class="muted">${esc(it.food.name)} · ${Math.round(it.grams)} g${it.mode ? `<div class="seg">${['crudo', 'cocido'].map(md => `<button type="button" class="${it.mode === md ? 'on' : ''}" data-cook="${i}" data-item="${esc(it.text)}" data-mode="${md}">${md === 'crudo' ? 'Crudo' : 'Cocido'}</button>`).join('')}</div>` : ''}</td><td>${Math.round(it.kcal)} kcal</td></tr>`
            : `<tr class="unk"><td>${esc(it.text)}</td><td colspan="2">No reconocido · <a href="#" data-addfood="${esc(it.text)}">agregar alimento</a></td></tr>`).join('')}</table>
        </details>
        ${a.unknown.length ? `<div class="unk small">⚠ No reconocido: ${a.unknown.map(u => `<a href="#" data-addfood="${esc(u)}">${esc(u)}</a>`).join(', ')}</div>` : ''}`;
    });
    const tot = analyzeDiet(diet, foods, mode).total;
    $('#day-total', el).innerHTML = any ? `<span class="muted small">Total del día (aprox.)</span><div><b>${esc(fmtMacros(tot))}</b></div>` : '';
    $$('[data-addfood]', el).forEach(a => a.onclick = e => { e.preventDefault(); foodForm(null, a.dataset.addfood, () => updateMacros()); });
    $$('[data-cook]', el).forEach(b => b.onclick = () => {
      const i = +b.dataset.cook, meal = diet.meals[i];
      const pos = meal.items.indexOf(b.dataset.item);
      if (pos < 0) return;
      meal.items = meal.items.slice(0, pos) + setCookWord(b.dataset.item, b.dataset.mode) + meal.items.slice(pos + b.dataset.item.length);
      const ta = $(`textarea[data-m="${i}"]`, el);
      if (ta) ta.value = meal.items;
      save(); updateMacros();
      const det = $(`[data-macro="${i}"] details`, el); if (det) det.open = true;
    });
  };

  const render = () => {
    el.innerHTML = `
      <div class="card">
        <div class="row between" style="margin-bottom:10px">
          <h2 style="margin:0">Plan de alimentación</h2><span class="saved" id="saved"></span>
        </div>
        <div class="row" style="margin-bottom:12px">
          <button class="btn sm" id="paste">Pegar texto</button>
          <button class="btn sm" id="load-tpl">Cargar plantilla</button>
          <button class="btn sm" id="save-tpl">Guardar como plantilla</button>
          ${diet.meals.length ? '<button class="btn sm danger" id="clear">Vaciar</button>' : ''}
        </div>
        <div class="grid two" style="margin-bottom:12px">
          <div><label>Título (opcional)</label><input data-f="title" value="${esc(diet.title)}" placeholder="Ej. Plan definición semana 1"></div>
          <div><label>Nota de calorías / macros (opcional)</label><input data-f="kcal" value="${esc(diet.kcal)}" placeholder="Ej. Objetivo: 2,100 kcal"></div>
          <div><label>Carnes, arroz y pasta: peso por defecto</label><select id="cooked">
            <option value="crudo" ${diet.cookedMode !== 'cocido' ? 'selected' : ''}>Crudo</option>
            <option value="cocido" ${diet.cookedMode === 'cocido' ? 'selected' : ''}>Cocido</option></select></div>
        </div>
        <p class="small muted" style="margin:-4px 0 10px">Si algún alimento se pesa diferente, cámbialo en "Ver detalle" con el botón Crudo / Cocido, o escribe "(cocido)" o "(crudo)" junto al alimento. Así también le aparece al cliente en su PDF.</p>
        <div class="macro-total" id="day-total"></div>
        <div id="meals">
          ${diet.meals.map((m, i) => `<div class="block">
            <div class="head">
              <input data-m="${i}" data-k="title" value="${esc(m.title)}" placeholder="Comida ${i + 1}">
              <button class="btn sm ghost" data-up="${i}" title="Subir" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button class="btn sm ghost danger" data-rm="${i}" title="Quitar">✕</button>
            </div>
            <textarea data-m="${i}" data-k="items" placeholder="Alimentos y cantidades (uno por línea o separados por coma)">${esc(m.items)}</textarea>
            <div class="macro-line" data-macro="${i}"></div>
          </div>`).join('') || '<div class="empty">Sin comidas. Agrega una o pega el texto de la dieta.</div>'}
        </div>
        <button class="btn" id="add" style="margin-top:10px">+ Agregar comida</button>
        <div style="margin-top:14px"><label>Indicaciones generales</label>
          <textarea data-f="notes" placeholder="Ej. Tomar 3 L de agua al día. Verduras libres. Evitar refrescos.">${esc(diet.notes)}</textarea></div>
      </div>`;

    $$('[data-f]', el).forEach(i => i.oninput = () => { diet[i.dataset.f] = i.value; save(); });
    $$('[data-m]', el).forEach(i => i.oninput = () => { diet.meals[i.dataset.m][i.dataset.k] = i.value; save(); if (i.dataset.k === 'items') updateMacros(); });
    $('#cooked', el).onchange = e => { diet.cookedMode = e.target.value; save(); updateMacros(); };
    updateMacros();
    $$('[data-rm]', el).forEach(b => b.onclick = () => { diet.meals.splice(+b.dataset.rm, 1); save(); render(); });
    $$('[data-up]', el).forEach(b => b.onclick = () => { const i = +b.dataset.up; [diet.meals[i - 1], diet.meals[i]] = [diet.meals[i], diet.meals[i - 1]]; save(); render(); });
    $('#add', el).onclick = () => { diet.meals.push({ title: `Comida ${diet.meals.length + 1}`, items: '' }); save(); render(); $$('[data-k=items]', el).pop()?.focus(); };
    const clr = $('#clear', el);
    if (clr) clr.onclick = async () => { if (await confirmDialog('Se borrarán todas las comidas de este cliente.', 'Vaciar')) { diet.meals = []; save(); render(); } };
    $('#paste', el).onclick = () => pasteDialog('dieta', text => {
      const blocks = parseBlocks(text);
      if (!blocks.length) return toast('No se encontró texto');
      diet.meals = blocks.map(b => ({ title: b.title, items: b.lines.join('\n') }));
      save(); render(); toast(`${blocks.length} comidas importadas`);
    });
    $('#save-tpl', el).onclick = () => saveTemplate('diet', diet);
    $('#load-tpl', el).onclick = () => loadTemplate('diet', data => { plan.diet = structuredClone(data); save(); tabDiet(el, client, plan); });
  };
  render();
}

// ---------- Rutina ----------
function tabRoutine(el, client, plan) {
  const routine = plan.routine || (plan.routine = { days: [] });
  const save = debounce(async () => {
    plan.updatedAt = new Date().toISOString();
    await db.put('plans', plan);
    const s = $('#saved', el); if (s) { s.textContent = '✓ Guardado'; setTimeout(() => s.textContent = '', 1500); }
  }, 500);

  const exRow = (di, ei, e) => `<div class="ex-row">
      <input data-d="${di}" data-e="${ei}" data-k="name" value="${esc(e.name)}" placeholder="Ejercicio">
      <input data-d="${di}" data-e="${ei}" data-k="sets" value="${esc(e.sets)}" placeholder="4" inputmode="numeric">
      <input data-d="${di}" data-e="${ei}" data-k="reps" value="${esc(e.reps)}" placeholder="10-12">
      <input class="ex-notes" data-d="${di}" data-e="${ei}" data-k="notes" value="${esc(e.notes)}" placeholder="Notas / descanso / peso">
      <button class="btn sm ghost danger" data-rmex="${di}:${ei}" title="Quitar">✕</button>
    </div>`;

  const render = () => {
    el.innerHTML = `
      <div class="card">
        <div class="row between" style="margin-bottom:10px">
          <h2 style="margin:0">Rutina de entrenamiento</h2><span class="saved" id="saved"></span>
        </div>
        <div class="row" style="margin-bottom:12px">
          <button class="btn sm" id="paste">Pegar texto</button>
          <button class="btn sm" id="load-tpl">Cargar plantilla</button>
          <button class="btn sm" id="save-tpl">Guardar como plantilla</button>
          ${routine.days.length ? '<button class="btn sm danger" id="clear">Vaciar</button>' : ''}
        </div>
        <div style="margin-bottom:12px"><label>Título (opcional)</label>
          <input data-f="title" value="${esc(routine.title)}" placeholder="Ej. Hipertrofia · 5 días"></div>
        <div id="days">
          ${routine.days.map((d, di) => `<div class="block">
            <div class="head">
              <input data-day="${di}" value="${esc(d.title)}" placeholder="Día ${di + 1} - Pierna">
              <button class="btn sm ghost" data-up="${di}" title="Subir" ${di === 0 ? 'disabled' : ''}>↑</button>
              <button class="btn sm ghost" data-dup="${di}" title="Duplicar">⧉</button>
              <button class="btn sm ghost danger" data-rm="${di}" title="Quitar día">✕</button>
            </div>
            <div class="ex-head"><span>Ejercicio</span><span>Series</span><span>Reps</span><span class="h-notes">Notas</span><span></span></div>
            ${(d.exercises || []).map((e, ei) => exRow(di, ei, e)).join('')}
            <button class="btn sm" data-addex="${di}">+ Ejercicio</button>
          </div>`).join('') || '<div class="empty">Sin días. Agrega uno o pega el texto de la rutina.</div>'}
        </div>
        <button class="btn" id="add" style="margin-top:10px">+ Agregar día</button>
        <div style="margin-top:14px"><label>Indicaciones generales</label>
          <textarea data-f="notes" placeholder="Ej. Calentar 10 min. Cardio 30 min al terminar.">${esc(routine.notes)}</textarea></div>
      </div>`;

    $$('[data-f]', el).forEach(i => i.oninput = () => { routine[i.dataset.f] = i.value; save(); });
    $$('[data-day]', el).forEach(i => i.oninput = () => { routine.days[i.dataset.day].title = i.value; save(); });
    $$('[data-e]', el).forEach(i => i.oninput = () => { routine.days[i.dataset.d].exercises[i.dataset.e][i.dataset.k] = i.value; save(); });
    $$('[data-rmex]', el).forEach(b => b.onclick = () => { const [d, e] = b.dataset.rmex.split(':'); routine.days[d].exercises.splice(+e, 1); save(); render(); });
    $$('[data-addex]', el).forEach(b => b.onclick = () => {
      const d = +b.dataset.addex; (routine.days[d].exercises ||= []).push({ name: '', sets: '', reps: '', notes: '' });
      save(); render(); $$(`[data-d="${d}"][data-k=name]`, el).pop()?.focus();
    });
    $$('[data-rm]', el).forEach(b => b.onclick = async () => {
      if (await confirmDialog(`Quitar "${routine.days[+b.dataset.rm].title || 'este día'}".`, 'Quitar')) { routine.days.splice(+b.dataset.rm, 1); save(); render(); }
    });
    $$('[data-up]', el).forEach(b => b.onclick = () => { const i = +b.dataset.up; [routine.days[i - 1], routine.days[i]] = [routine.days[i], routine.days[i - 1]]; save(); render(); });
    $$('[data-dup]', el).forEach(b => b.onclick = () => { const i = +b.dataset.dup; const c = structuredClone(routine.days[i]); c.title += ' (copia)'; routine.days.splice(i + 1, 0, c); save(); render(); });
    $('#add', el).onclick = () => { routine.days.push({ title: `Día ${routine.days.length + 1}`, exercises: [{ name: '', sets: '', reps: '', notes: '' }] }); save(); render(); };
    const clr = $('#clear', el);
    if (clr) clr.onclick = async () => { if (await confirmDialog('Se borrará toda la rutina de este cliente.', 'Vaciar')) { routine.days = []; save(); render(); } };
    $('#paste', el).onclick = () => pasteDialog('rutina', text => {
      const blocks = parseBlocks(text);
      if (!blocks.length) return toast('No se encontró texto');
      routine.days = blocks.map(b => ({ title: b.title, exercises: b.lines.map(parseExercise) }));
      save(); render(); toast(`${blocks.length} días importados`);
    });
    $('#save-tpl', el).onclick = () => saveTemplate('routine', routine);
    $('#load-tpl', el).onclick = () => loadTemplate('routine', data => { plan.routine = structuredClone(data); save(); tabRoutine(el, client, plan); });
  };
  render();
}

function pasteDialog(kind, onDone) {
  const example = kind === 'dieta'
    ? 'Comida 1\n2 huevos, 200g claras, 50g espinaca, 35g de aguacate\n\nComida 2\n1.5 tomas de proteína, 1 manzana verde, 5 almendras'
    : 'Día 1 - Pierna\nSentadilla 4x10\nPrensa 4x12-15\nExtensión de cuádriceps 3x15 al fallo\n\nDía 2 - Pecho\nPress banca 4x8 descanso 2 min';
  openModal(`
    <h2>Pegar ${kind}</h2>
    <p class="small muted">Pega el texto como lo mandas por WhatsApp. Cada bloque separado por una línea en blanco (o que empiece con "Comida", "Día", "Lunes"…) se convierte en ${kind === 'dieta' ? 'una comida' : 'un día; los ejercicios con formato 4x12 se separan en series y repeticiones'}. Reemplaza lo que haya.</p>
    <textarea id="txt" style="min-height:220px" placeholder="${esc(example)}"></textarea>
    <div class="actions"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="ok">Importar</button></div>`, m => {
    $('#ok', m).onclick = () => { const t = $('#txt', m).value; closeModal(); onDone(t); };
  });
}

async function saveTemplate(type, data) {
  openModal(`
    <h2>Guardar como plantilla</h2>
    <p class="small muted">Podrás cargarla a cualquier otro cliente y ajustarla.</p>
    <label>Nombre de la plantilla</label><input id="tn" value="${esc(data.title || '')}" placeholder="${type === 'diet' ? 'Ej. Definición 1800 kcal' : 'Ej. Torso / Pierna 4 días'}">
    <div class="actions"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="ok">Guardar</button></div>`, m => {
    $('#ok', m).onclick = async () => {
      const name = $('#tn', m).value.trim() || 'Sin nombre';
      await db.put('templates', { id: uid(), type, name, data: structuredClone(data), createdAt: new Date().toISOString() });
      closeModal(); toast('Plantilla guardada');
    };
  });
}

async function loadTemplate(type, onPick) {
  const list = (await db.all('templates')).filter(t => t.type === type).sort((a, b) => a.name.localeCompare(b.name));
  openModal(`
    <h2>Cargar plantilla de ${type === 'diet' ? 'dieta' : 'rutina'}</h2>
    ${list.length ? `<p class="small muted">Reemplazará ${type === 'diet' ? 'la dieta' : 'la rutina'} actual de este cliente.</p>
      <div class="stack">${list.map(t => `<button class="btn" style="width:100%;justify-content:space-between" data-t="${t.id}">
        <span>${esc(t.name)}</span><span class="muted small">${type === 'diet' ? (t.data.meals?.length || 0) + ' comidas' : (t.data.days?.length || 0) + ' días'}</span></button>`).join('')}</div>`
      : '<p class="muted">Aún no tienes plantillas. Arma una dieta o rutina y usa "Guardar como plantilla".</p>'}
    <div class="actions"><button class="btn" data-close>Cerrar</button></div>`, m => {
    $$('[data-t]', m).forEach(b => b.onclick = () => { const t = list.find(x => x.id === b.dataset.t); closeModal(); onPick(t.data); toast('Plantilla cargada'); });
  });
}

// ---------- Reporte ----------
function tabReport(el, client, ms, plan) {
  if (!ms.length) {
    el.innerHTML = `<div class="card empty">Registra al menos una medición para generar el reporte.<br><br><a class="btn primary" href="#/cliente/${client.id}/mediciones">Ir a mediciones</a></div>`;
    return;
  }
  const hasDiet = !!(plan.diet?.meals?.length || plan.diet?.notes);
  const hasRoutine = !!(plan.routine?.days?.length || plan.routine?.notes);
  const saved = client.reportPrefs || {};
  el.innerHTML = `
    <div class="card stack">
      <h2>Generar hoja de avances</h2>
      <div><label>Medición a reportar</label>
        <select id="mid">${[...ms].reverse().map((m, i) => `<option value="${m.id}">${fmtDate(m.date)} · ${fmt(m.weight)} kg${i === 0 ? ' (última)' : ''}</option>`).join('')}</select></div>
      <div class="grid two">
        <label class="check"><input type="checkbox" id="o-charts" checked> Gráficas de evolución</label>
        <label class="check"><input type="checkbox" id="o-history" checked> Historial de mediciones</label>
        <label class="check"><input type="checkbox" id="o-diet" ${hasDiet ? 'checked' : 'disabled'}> Incluir dieta ${hasDiet ? '' : '<span class="muted small">(vacía)</span>'}</label>
        <label class="check"><input type="checkbox" id="o-routine" ${hasRoutine ? 'checked' : 'disabled'}> Incluir rutina ${hasRoutine ? '' : '<span class="muted small">(vacía)</span>'}</label>
        <label class="check"><input type="checkbox" id="o-macros" ${hasDiet ? 'checked' : 'disabled'}> Calorías y macros en la dieta</label>
      </div>
      <div><label>Comentarios para el cliente (aparecen en el reporte)</label>
        <textarea id="comments" placeholder="Ej. ¡Excelente semana! Bajaste grasa y mantuviste músculo. Sigamos con el cardio en ayunas.">${esc(saved.comments || '')}</textarea></div>
      <div class="row">
        <button class="btn primary" id="share">Compartir PDF</button>
        <button class="btn" id="download">Descargar PDF</button>
        <button class="btn" id="preview">Vista previa</button>
      </div>
      ${!settings.business ? `<p class="small muted">Tip: agrega tu nombre/logo en <a href="#/ajustes">Ajustes</a> para que aparezcan en el encabezado del reporte.</p>` : ''}
    </div>
    <div id="preview-wrap"></div>`;

  const build = async () => {
    const comments = $('#comments', el).value;
    await db.put('clients', { ...client, reportPrefs: { comments } });
    client.reportPrefs = { comments };
    return buildReportPDF({
      settings, client, measurements: ms, currentId: $('#mid', el).value, plan,
      options: {
        includeCharts: $('#o-charts', el).checked,
        includeHistory: $('#o-history', el).checked,
        includeDiet: $('#o-diet', el).checked,
        includeRoutine: $('#o-routine', el).checked,
        includeMacros: $('#o-macros', el).checked,
        foods,
        comments,
      },
    });
  };
  const fileName = () => {
    const m = ms.find(x => x.id === $('#mid', el).value);
    const safe = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '');
    return `Reporte_${safe(client.name)}_${m.date}.pdf`;
  };
  const run = async (btn, fn) => {
    const t = btn.textContent; btn.disabled = true; btn.textContent = 'Generando…';
    try { await fn(); } catch (e) { console.error(e); toast('Error al generar el PDF: ' + e.message, 4000); }
    finally { btn.disabled = false; btn.textContent = t; }
  };

  $('#preview', el).onclick = e => run(e.target, async () => {
    const doc = await build();
    const url = URL.createObjectURL(doc.output('blob'));
    $('#preview-wrap', el).innerHTML = `<div class="card"><iframe class="pdf-frame" src="${url}" title="Vista previa"></iframe>
      <p class="small muted">Si no ves la vista previa en tu celular, usa "Descargar PDF".</p></div>`;
    $('#preview-wrap', el).scrollIntoView({ behavior: 'smooth' });
  });
  $('#download', el).onclick = e => run(e.target, async () => { (await build()).save(fileName()); });
  $('#share', el).onclick = e => run(e.target, async () => {
    const doc = await build();
    const file = new File([doc.output('blob')], fileName(), { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Reporte de avances', text: `Hola ${client.name.split(' ')[0]}, aquí está tu reporte de avances 💪` });
      } catch (err) { if (err.name !== 'AbortError') throw err; }
    } else {
      doc.save(fileName());
      toast('Tu navegador no permite compartir directo; se descargó el PDF.', 3500);
    }
  });
}

// ================= PLANTILLAS =================
async function viewTemplates() {
  const list = (await db.all('templates')).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  const section = (type, title) => {
    const items = list.filter(t => t.type === type);
    return `<div class="card"><h2>${title}</h2>
      ${items.length ? items.map(t => `<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)">
        <div><b>${esc(t.name)}</b> <span class="muted small">· ${type === 'diet' ? (t.data.meals?.length || 0) + ' comidas' : (t.data.days?.length || 0) + ' días'}</span></div>
        <div class="row"><button class="btn sm" data-ren="${t.id}">Renombrar</button><button class="btn sm danger" data-del="${t.id}">Eliminar</button></div>
      </div>`).join('') : '<p class="muted small">Sin plantillas. Ábrelas desde la dieta o rutina de un cliente con "Guardar como plantilla".</p>'}
    </div>`;
  };
  const custom = await db.all('foods');
  app.innerHTML = `<h1>Plantillas</h1>
    <p class="muted small">Guarda dietas y rutinas que usas seguido y cárgalas a cualquier cliente en segundos.</p>
    ${section('diet', 'Dietas')}${section('routine', 'Rutinas')}
    <div class="card">
      <div class="row between"><h2 style="margin:0">Mis alimentos</h2><button class="btn sm primary" id="add-food">+ Alimento</button></div>
      <p class="muted small">Agrega alimentos o marcas que la app no reconoce (por ejemplo tu proteína) para que el cálculo de calorías sea más exacto. Tus alimentos tienen prioridad sobre los de la app.</p>
      ${custom.length ? custom.sort((a, b) => a.name.localeCompare(b.name)).map(f => `<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)">
        <div><b>${esc(f.name)}</b> <span class="muted small">· ${f.kcal} kcal · P ${f.p} · C ${f.c} · G ${f.f} por 100 g</span></div>
        <div class="row"><button class="btn sm" data-editfood="${f.id}">Editar</button><button class="btn sm danger" data-delfood="${f.id}">Eliminar</button></div>
      </div>`).join('') : ''}
      <details style="margin-top:10px"><summary class="small" style="cursor:pointer;font-weight:600">Ver alimentos que ya reconoce la app (${BUILTIN_FOODS.length})</summary>
        <input type="search" id="food-q" placeholder="Buscar…" style="margin:8px 0">
        <div class="table-wrap"><table class="data" id="food-tbl"></table></div>
      </details>
    </div>`;
  const renderFoods = q => {
    const n = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const list = BUILTIN_FOODS.filter(f => !q || n(f.name + ' ' + f.aliases.join(' ')).includes(n(q)));
    $('#food-tbl').innerHTML = `<thead><tr><th>Alimento (100 g)</th><th>kcal</th><th>P</th><th>C</th><th>G</th><th>1 pieza/toma</th></tr></thead><tbody>${list.map(f => `<tr>
      <td>${esc(f.name)}${f.cooked ? ' <span class="muted small">(crudo)</span>' : ''}</td><td>${f.kcal}</td><td>${f.p}</td><td>${f.c}</td><td>${f.f}</td>
      <td class="muted small">${Object.entries(f.units || {}).map(([u, g]) => `${u} ${g} g`).join(', ')}</td></tr>`).join('')}</tbody>`;
  };
  renderFoods('');
  $('#food-q').oninput = e => renderFoods(e.target.value);
  $('#add-food').onclick = () => foodForm(null, '', viewTemplates);
  $$('[data-editfood]').forEach(b => b.onclick = () => foodForm(custom.find(f => f.id === b.dataset.editfood), '', viewTemplates));
  $$('[data-delfood]').forEach(b => b.onclick = async () => {
    const f = custom.find(x => x.id === b.dataset.delfood);
    if (await confirmDialog(`Eliminar el alimento "${f.name}".`)) { await db.del('foods', f.id); await loadFoods(); viewTemplates(); }
  });
  $$('[data-del]').forEach(b => b.onclick = async () => {
    const t = list.find(x => x.id === b.dataset.del);
    if (await confirmDialog(`Eliminar la plantilla "${t.name}".`)) { await db.del('templates', t.id); viewTemplates(); }
  });
  $$('[data-ren]').forEach(b => b.onclick = () => {
    const t = list.find(x => x.id === b.dataset.ren);
    openModal(`<h2>Renombrar</h2><input id="tn" value="${esc(t.name)}">
      <div class="actions"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="ok">Guardar</button></div>`, m => {
      $('#ok', m).onclick = async () => { t.name = $('#tn', m).value.trim() || t.name; await db.put('templates', t); closeModal(); viewTemplates(); };
    });
  });
}

function foodForm(food, suggested = '', onSaved) {
  const f = food || { name: suggested.replace(/^[\d.,/½\s]+(g|gr|grs|kg|ml|tomas?|scoops?|piezas?|tazas?|cdas?|rebanadas?)?\s*(de\s+)?/i, ''), aliases: [], units: {} };
  openModal(`
    <h2>${food ? 'Editar alimento' : 'Nuevo alimento'}</h2>
    <p class="small muted">Valores por cada 100 g (vienen en la etiqueta nutrimental o en internet).</p>
    <form id="ff" class="stack">
      <div><label>Nombre *</label><input name="name" required value="${esc(f.name)}" placeholder="Ej. Proteína Birdman vainilla"></div>
      <div><label>Otras formas de escribirlo (separadas por coma)</label><input name="aliases" value="${esc((f.aliases || []).join(', '))}" placeholder="Ej. proteina birdman, birdman"></div>
      <div class="grid">
        <div><label>Calorías (kcal)</label><input name="kcal" inputmode="decimal" required value="${esc(f.kcal)}"></div>
        <div><label>Proteína (g)</label><input name="p" inputmode="decimal" required value="${esc(f.p)}"></div>
        <div><label>Carbohidratos (g)</label><input name="c" inputmode="decimal" required value="${esc(f.c)}"></div>
        <div><label>Grasa (g)</label><input name="f" inputmode="decimal" required value="${esc(f.f)}"></div>
      </div>
      <div class="grid">
        <div><label>1 pieza pesa (g)</label><input name="pieza" inputmode="decimal" value="${esc(f.units?.pieza)}" placeholder="Ej. 50"></div>
        <div><label>1 toma / scoop (g)</label><input name="toma" inputmode="decimal" value="${esc(f.units?.toma)}" placeholder="Ej. 30"></div>
        <div><label>1 taza (g)</label><input name="taza" inputmode="decimal" value="${esc(f.units?.taza)}"></div>
      </div>
      <div class="actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary">Guardar</button></div>
    </form>`, m => {
    $('#ff', m).onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      const units = {};
      for (const u of ['pieza', 'toma', 'taza']) { const v = parseNum(d[u]); if (v) units[u] = v; }
      await db.put('foods', {
        id: f.id || uid(), name: d.name.trim(),
        aliases: d.aliases.split(',').map(x => x.trim()).filter(Boolean),
        kcal: parseNum(d.kcal) || 0, p: parseNum(d.p) || 0, c: parseNum(d.c) || 0, f: parseNum(d.f) || 0, units,
      });
      await loadFoods();
      closeModal(); toast('Alimento guardado');
      onSaved && onSaved();
    };
  });
}

// ================= AJUSTES =================
async function viewSettings() {
  const lastBackup = await db.getSetting('lastBackup');
  app.innerHTML = `
    <h1>Ajustes</h1>
    <div class="card stack">
      <h2>Datos del coach (encabezado del PDF)</h2>
      <div class="grid two">
        <div><label>Nombre del negocio / marca</label><input data-s="business" value="${esc(settings.business)}" placeholder="Ej. Team Fit Coaching"></div>
        <div><label>Nombre del coach</label><input data-s="coachName" value="${esc(settings.coachName)}" placeholder="Ej. Coach Juan Pérez"></div>
        <div><label>Teléfono / WhatsApp</label><input data-s="phone" value="${esc(settings.phone)}"></div>
        <div><label>Instagram / web</label><input data-s="social" value="${esc(settings.social)}" placeholder="@micoaching"></div>
      </div>
      <div><label>Báscula que usas</label><select id="scale">
        <option value="omron" ${settings.scale !== 'inbody' ? 'selected' : ''}>Omron (HBF-514C u otra de bioimpedancia)</option>
        <option value="inbody" ${settings.scale === 'inbody' ? 'selected' : ''}>InBody (muestra campos extra al capturar)</option></select></div>
      <div><label>Logo</label>
        <div class="row">
          ${settings.logo ? `<img class="logo-preview" src="${settings.logo}" alt="Logo">` : ''}
          <label class="btn sm" style="margin:0">${settings.logo ? 'Cambiar' : 'Subir logo'}<input type="file" id="logo" accept="image/png,image/jpeg" hidden></label>
          ${settings.logo ? '<button class="btn sm danger" id="rm-logo">Quitar</button>' : ''}
        </div></div>
      <div><label>Color principal</label>
        <div class="color-row">${COLORS.map(c => `<button class="swatch ${settings.color === c ? 'active' : ''}" style="background:${c}" data-color="${c}" aria-label="${c}"></button>`).join('')}
          <input type="color" id="custom-color" value="${settings.color}" style="width:44px;padding:2px;min-height:34px" title="Otro color"></div></div>
    </div>

    ${cloud.enabled ? `<div class="card stack">
      <h2>Cuenta</h2>
      <p class="small" style="margin:0">Sesión iniciada como <b>${esc(cloud.user?.email || '')}</b>. Tus datos se guardan en la nube y se sincronizan en todos los dispositivos donde entres con esta cuenta. También funciona sin internet: los cambios se suben al reconectar.</p>
      <div class="row"><button class="btn" id="logout">Cerrar sesión</button></div>
    </div>` : `<div class="card stack">
      <h2>Modo local</h2>
      <p class="small muted" style="margin:0">Los datos están solo en este dispositivo. Para sincronizar entre celular, tablet y computadora hay que configurar Firebase (instrucciones en el archivo LEEME-FIREBASE.md del proyecto).</p>
    </div>`}
    <div class="card stack">
      <h2>Respaldo de datos</h2>
      <p class="small muted" style="margin:0">${cloud.enabled
        ? 'Tus datos ya están en la nube. Aun así puedes descargar una copia de seguridad de vez en cuando (por ejemplo cada mes).'
        : 'Los datos se guardan <b>solo en este dispositivo/navegador</b>. Descarga un respaldo seguido (por ejemplo cada semana) y guárdalo en Drive, iCloud o envíatelo por correo. Con el respaldo puedes pasar todo a otro celular o computadora.'}</p>
      <p class="small" style="margin:0">Último respaldo: <b>${lastBackup ? new Date(lastBackup).toLocaleString('es-MX') : 'nunca'}</b></p>
      <div class="row">
        <button class="btn primary" id="export">Descargar respaldo</button>
        <label class="btn" style="margin:0">Restaurar respaldo<input type="file" id="import" accept="application/json,.json" hidden></label>
      </div>
    </div>`;

  const saveSettings = debounce(async () => { await db.setSetting('settings', settings); applyTheme(); }, 300);
  $$('[data-s]').forEach(i => i.oninput = () => { settings[i.dataset.s] = i.value; saveSettings(); });
  $('#scale').onchange = e => { settings.scale = e.target.value; saveSettings(); };
  const lo = $('#logout');
  if (lo) lo.onclick = async () => { if (await confirmDialog('Se cerrará la sesión en este dispositivo. Tus datos siguen en la nube.', 'Cerrar sesión')) await cloud.signOut(); };
  $$('[data-color]').forEach(b => b.onclick = async () => { settings.color = b.dataset.color; await saveSettings.flush(); viewSettings(); });
  $('#custom-color').onchange = async e => { settings.color = e.target.value; await saveSettings.flush(); viewSettings(); };
  $('#logo').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    settings.logo = await resizeImage(f, 500);
    await saveSettings.flush(); viewSettings(); toast('Logo guardado');
  };
  const rm = $('#rm-logo'); if (rm) rm.onclick = async () => { settings.logo = ''; await saveSettings.flush(); viewSettings(); };

  $('#export').onclick = async () => {
    const data = await db.exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const name = `respaldo-reportes-coach-${todayISO()}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      try { await navigator.share({ files: [file], title: name }); } catch (err) { if (err.name === 'AbortError') return; }
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    }
    await db.setSetting('lastBackup', new Date().toISOString());
    viewSettings();
  };
  $('#import').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const n = (data.clients || []).length;
      if (await confirmDialog(`El respaldo tiene ${n} clientes. Se combinará con los datos actuales (los registros iguales se reemplazan).`, 'Restaurar')) {
        data.settings = (data.settings || []).filter(x => x.key !== 'migratedTo');
        await db.importAll(data);
        await loadFoods();
        settings = { ...DEFAULT_SETTINGS, ...(await db.getSetting('settings', {})) };
        applyTheme(); toast('Respaldo restaurado'); viewSettings();
      }
    } catch (err) { toast('Archivo inválido: ' + err.message, 4000); }
  };
}

function resizeImage(file, max) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ================= SESIÓN (nube) =================
const AUTH_ERRORS = {
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/wrong-password': 'Correo o contraseña incorrectos.',
  'auth/user-not-found': 'No existe una cuenta con ese correo.',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese correo. Usa "Entrar".',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/invalid-email': 'El correo no es válido.',
  'auth/missing-password': 'Escribe tu contraseña.',
  'auth/network-request-failed': 'Sin conexión a internet. Intenta de nuevo.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
};
const authMsg = e => AUTH_ERRORS[e.code] || e.message;

function viewLogin() {
  document.body.classList.add('logged-out');
  app.innerHTML = `
    <div class="card login stack">
      <h1>Reportes Coach</h1>
      <p class="muted small" style="margin:0">Entra con tu cuenta para ver tus clientes en cualquier dispositivo.</p>
      <form id="lf" class="stack">
        <div><label>Correo</label><input name="email" type="email" autocomplete="username" required></div>
        <div><label>Contraseña</label><input name="pass" type="password" autocomplete="current-password" minlength="6" required></div>
        <p id="lerr" class="small bad" style="margin:0"></p>
        <button class="btn primary" style="width:100%;justify-content:center">Entrar</button>
      </form>
      <div class="row between small">
        <a href="#" id="signup">Crear cuenta (primera vez)</a>
        <a href="#" id="reset">Olvidé mi contraseña</a>
      </div>
    </div>`;
  const form = $('#lf');
  const err = m => { $('#lerr').textContent = m; };
  const busy = async (fn) => {
    const btns = $$('button, a', app); btns.forEach(b => b.style.pointerEvents = 'none');
    try { await fn(); } catch (e) { err(authMsg(e)); } finally { btns.forEach(b => b.style.pointerEvents = ''); }
  };
  form.onsubmit = e => { e.preventDefault(); err(''); busy(() => cloud.signIn(form.email.value.trim(), form.pass.value)); };
  $('#signup').onclick = e => {
    e.preventDefault(); err('');
    if (!form.reportValidity()) return;
    busy(() => cloud.signUp(form.email.value.trim(), form.pass.value));
  };
  $('#reset').onclick = e => {
    e.preventDefault(); err('');
    const email = form.email.value.trim();
    if (!email) return err('Escribe tu correo arriba y vuelve a tocar "Olvidé mi contraseña".');
    busy(async () => { await cloud.resetPassword(email); toast('Te enviamos un correo para cambiar tu contraseña', 4000); });
  };
}

async function offerMigration(user) {
  const localClients = await localBackend.all('clients').catch(() => []);
  const done = await localBackend.get('settings', 'migratedTo').catch(() => null);
  if (!localClients.length || (done && done.value === user.uid)) return;
  openModal(`
    <h2>Datos en este dispositivo</h2>
    <p>Encontramos <b>${localClients.length} cliente${localClients.length > 1 ? 's' : ''}</b> guardados solo en este dispositivo (de antes de usar la nube). ¿Quieres subirlos a tu cuenta para verlos en todos tus dispositivos?</p>
    <div class="actions"><button class="btn" id="no">Ahora no</button><button class="btn primary" id="yes">Subir a la nube</button></div>`, m => {
    $('#no', m).onclick = () => closeModal();
    $('#yes', m).onclick = async () => {
      const data = await db.exportAll(localBackend);
      data.settings = data.settings.filter(x => x.key !== 'migratedTo' && x.key !== 'lastBackup');
      await db.importAll(data);
      await localBackend.put('settings', { key: 'migratedTo', value: user.uid });
      settings = { ...DEFAULT_SETTINGS, ...(await db.getSetting('settings', {})) };
      await loadFoods(); applyTheme();
      closeModal(); toast('Datos subidos a la nube'); router();
    };
  });
}

let appReady = false;
async function startApp() {
  settings = { ...DEFAULT_SETTINGS, ...(await db.getSetting('settings', {})) };
  await loadFoods();
  applyTheme();
  document.body.classList.remove('logged-out');
  appReady = true;
  await router();
}

// Cambios que llegan desde otro dispositivo: se vuelve a dibujar la pantalla,
// pero sin interrumpir si el coach está escribiendo o tiene una ventana abierta.
const rerenderRemote = debounce(async () => {
  const a = document.activeElement;
  if (!appReady) return;
  if (modalRoot.innerHTML || (a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName))) { rerenderRemote(); return; }
  settings = { ...DEFAULT_SETTINGS, ...(await db.getSetting('settings', {})) };
  await loadFoods();
  applyTheme();
  const y = window.scrollY;
  await router();
  window.scrollTo(0, y);
}, 1200);

// ================= inicio =================
(async function init() {
  window.addEventListener('hashchange', () => { if (appReady) router(); });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (!cloud.enabled) { await startApp(); return; }
  app.innerHTML = '<div class="empty">Cargando…</div>';
  cloud.onRemoteChange(() => rerenderRemote());
  let lastErr = 0;
  cloud.onWriteError(e => {
    if (Date.now() - lastErr < 5000) return;
    lastErr = Date.now();
    toast('No se pudo guardar en la nube: ' + (e.code || e.message), 5000);
  });
  await cloud.init({
    onUser: async user => {
      if (user) {
        app.innerHTML = '<div class="empty">Cargando tus datos…</div>';
        await useCloud(user.uid);
        await startApp();
        await offerMigration(user);
      } else {
        appReady = false;
        closeModal();
        viewLogin();
      }
    },
  });
})();
