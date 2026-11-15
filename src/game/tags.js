// Etiquetas inteligentes (2.0): el «internet de las cosas» de tu casa, sin comprar aparatos. Una etiqueta
// NFC de las baratas, un código QR impreso o el código de barras que ya trae un objeto queda ligado a una
// acción de Astra: acercas el teléfono (o lo miras con la Lente) y la acción se hace sola.
//
//   La lavadora  → marca «Lavar la ropa» como hecha.
//   El pastillero → anota la toma que toca.
//   El botellón  → suma un vaso de agua, o «se acabó» y va a la lista de compras.
//   La mesa de noche → abre la posada para cerrar el día.
//
// La etiqueta guarda solo una dirección de Astra con su identificador (…#/t/abc123): nada personal.
// Se guardan en `s.plus.tags` y viajan con la sincronización como todo lo demás.
import {
  completeTodo, uncompleteTodo, completeMission, undoMission, isDone, isScheduled, logHealth, dailyGoal, choreStatus, fmtClock, timeToMin,
} from './logic.js';
import { dosesFor, logDose } from './health.js';
import { shopOf, parseAndAdd, removeItem } from './shop.js';
import { parseShopLine } from './shoplex.js';
import { ensurePlus, plusOf } from './plus.js';

const cuantos = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const safe = (fn, fb = null) => { try { return fn(); } catch { return fb; } };

export const TAG_ACTIONS = {
  chore: { label: 'Marcar una rutina de la casa', icon: 'home', needs: 'chore' },
  mission: { label: 'Cumplir una misión', icon: 'sword', needs: 'mission' },
  dose: { label: 'Anotar una toma', icon: 'pill', needs: 'med' },
  water: { label: 'Sumar un vaso de agua', icon: 'drop', needs: null },
  buy: { label: 'Se acabó: agregar a la lista de compras', icon: 'cart', needs: 'text' },
  open: { label: 'Abrir una pantalla', icon: 'right', needs: 'route' },
};
export const TAG_ROUTES = [
  ['/compras?ver=despensa', 'Despensa'], ['/compras', 'Lista de compras'], ['/posada', 'Posada: cerrar el día'], ['/registrar', 'Registrar'],
  ['/enfoque', 'Enfoque'], ['/calma', 'Calma'], ['/area/salud', 'Salud'], ['/hogar', 'Hogar'], ['/recibo', 'Escanear un recibo'], ['/mando', 'Centro de mando'],
];
const routeLabel = (r) => (TAG_ROUTES.find((x) => x[0] === r) || [r, 'Astra'])[1];

// Identificador corto, sin letras que se confundan al escribirlo a mano.
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
export function newTagId(rand = Math.random) {
  let out = '';
  for (let i = 0; i < 6; i++) out += ALPHA[Math.floor(rand() * ALPHA.length)];
  return out;
}

export const tagsOf = (s) => plusOf(s).tags;
export const tagOf = (s, id) => tagsOf(s).find((t) => t.id === id) || null;

function cleanAction(s, a) {
  const type = TAG_ACTIONS[a && a.type] ? a.type : null;
  if (!type) return null;
  if (type === 'chore') return (s.chores || []).some((c) => c.id === a.ref) ? { type, ref: a.ref } : null;
  if (type === 'mission') return (s.missions || []).some((m) => m.id === a.ref && m.kind !== 'avoid') ? { type, ref: a.ref } : null;
  if (type === 'dose') return (s.meds || []).some((m) => m.id === a.ref) ? { type, ref: a.ref } : null;
  if (type === 'buy') { const text = String(a.text || '').trim().slice(0, 60); return text.length >= 2 ? { type, text } : null; }
  if (type === 'open') return TAG_ROUTES.some((x) => x[0] === a.route) ? { type, route: a.route } : null;
  return { type };
}

// El nombre que se propone para una etiqueta según su acción.
export function tagTitle(s, a) {
  if (!a) return 'Etiqueta';
  if (a.type === 'chore') return ((s.chores || []).find((c) => c.id === a.ref) || { title: 'Rutina' }).title;
  if (a.type === 'mission') return ((s.missions || []).find((m) => m.id === a.ref) || { title: 'Misión' }).title;
  if (a.type === 'dose') return ((s.meds || []).find((m) => m.id === a.ref) || { name: 'Toma' }).name;
  if (a.type === 'water') return 'Vaso de agua';
  if (a.type === 'buy') return `Se acabó: ${a.text}`;
  if (a.type === 'open') return routeLabel(a.route);
  return 'Etiqueta';
}

export function addTag(s, p, today) {
  const action = cleanAction(s, p.action);
  if (!action) return null;
  const pl = ensurePlus(s);
  let id = /^[a-z0-9]{4,12}$/.test(p.id || '') && !pl.tags.some((t) => t.id === p.id) ? p.id : newTagId();
  while (pl.tags.some((t) => t.id === id)) id = newTagId();
  const tag = {
    id, name: String(p.name || '').trim().slice(0, 40) || tagTitle(s, action), where: String(p.where || '').trim().slice(0, 40),
    action, code: cleanCode(p.code), created: today, uses: 0, last: null, lastAt: 0,
  };
  pl.tags.push(tag);
  if (pl.tags.length > 80) pl.tags = pl.tags.slice(-80);
  return tag;
}

export function updateTag(s, id, p) {
  const t = ensurePlus(s).tags.find((x) => x.id === id);
  if (!t) return null;
  if (p.name !== undefined) t.name = String(p.name || '').trim().slice(0, 40) || t.name;
  if (p.where !== undefined) t.where = String(p.where || '').trim().slice(0, 40);
  if (p.action !== undefined) { const a = cleanAction(s, p.action); if (a) t.action = a; }
  if (p.code !== undefined) t.code = cleanCode(p.code);
  return t;
}

export function removeTag(s, id) {
  const pl = ensurePlus(s);
  pl.tags = pl.tags.filter((t) => t.id !== id);
}

// ---------- La dirección de una etiqueta y cómo reconocerla ----------

export const tagPath = (id) => `/t/${id}`;
export const tagUrl = (base, id) => `${String(base || '').replace(/#.*$/, '')}#${tagPath(id)}`;

// Un código ajeno (el de barras de un producto, el QR de un aparato) también puede ser una etiqueta.
function cleanCode(v) {
  const c = String(v || '').trim();
  return c && c.length <= 200 && !/#\/t\/[a-z0-9]{4,12}/.test(c) ? c : '';
}

// De lo que leyó la cámara o el NFC a la etiqueta: una dirección de Astra (…#/t/id) o un código ligado.
export function findTag(s, raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const m = text.match(/#\/t\/([a-z0-9]{4,12})\b/);
  if (m) return tagOf(s, m[1]) || { unknown: true, id: m[1] };
  return tagsOf(s).find((t) => t.code && t.code === text) || null;
}
export const isTagUrl = (raw) => /#\/t\/[a-z0-9]{4,12}\b/.test(String(raw || ''));

// ---------- El estado de una etiqueta (lo que muestra la Lente encima del objeto) ----------

export function tagStatus(s, tag, today, nowMin = null) {
  const a = tag.action;
  const base = { icon: TAG_ACTIONS[a.type].icon, title: tag.name, can: true, done: false, tone: 'ink', verb: 'Hacer' };
  if (a.type === 'chore') {
    const c = (s.chores || []).find((x) => x.id === a.ref);
    if (!c) return { ...base, line: 'Esta rutina ya no existe', can: false, tone: 'muted' };
    const st = safe(() => choreStatus(s, c, today));
    if (!st) return { ...base, line: '', can: false };
    const doneToday = (c.log || [])[0] === today;
    if (doneToday) return { ...base, line: 'Hecha hoy', done: true, can: false, tone: 'good' };
    if (c.paused) return { ...base, line: 'En pausa', can: false, tone: 'muted' };
    const n = st.inDays;
    return { ...base, verb: 'Hecha', line: n < 0 ? `Atrasada ${cuantos(-n, 'día', 'días')}` : n === 0 ? 'Toca hoy' : `Toca en ${cuantos(n, 'día', 'días')}`, tone: n < 0 ? 'vit' : n === 0 ? 'xp' : 'ink', can: !!st.todo };
  }
  if (a.type === 'mission') {
    const m = (s.missions || []).find((x) => x.id === a.ref);
    if (!m || m.archived) return { ...base, line: 'Esta misión ya no está activa', can: false, tone: 'muted' };
    if (isDone(s, m, today)) return { ...base, line: 'Cumplida hoy', done: true, can: false, tone: 'good' };
    if (m.kind === 'habit' && !isScheduled(m, today)) return { ...base, line: 'Hoy no toca', can: true, tone: 'muted', verb: 'Cumplir' };
    return { ...base, verb: 'Cumplir', line: `Pendiente · ${m.cost} de energía`, tone: 'xp' };
  }
  if (a.type === 'dose') {
    const list = safe(() => dosesFor(s, today), []).filter((d) => d.med.id === a.ref);
    if (!list.length) return { ...base, line: 'Hoy no hay tomas', can: false, tone: 'muted' };
    const next = list.find((d) => !d.status);
    if (!next) return { ...base, line: `${cuantos(list.length, 'toma anotada', 'tomas anotadas')} hoy`, done: true, can: false, tone: 'good' };
    const late = nowMin != null && timeToMin(next.time) + 60 < nowMin;
    return { ...base, verb: 'Tomada', line: `${late ? 'Tocaba' : 'Toca'} a las ${fmtClock(next.time)}`, tone: late ? 'vit' : 'xp' };
  }
  if (a.type === 'water') {
    const w = ((s.health || {})[today] || {}).water || 0;
    const g = dailyGoal(s, 'water') || 8;
    return { ...base, verb: '+1 vaso', line: `${w} de ${g} vasos hoy`, tone: w >= g ? 'good' : 'ink', done: w >= g };
  }
  if (a.type === 'buy') {
    const sh = safe(() => shopOf(s));
    const want = safe(() => parseShopLine(a.text).map((p) => p.key), []);
    const on = sh && want.length > 0 && want.every((k) => sh.items.some((i) => !i.done && i.key === k));
    return on ? { ...base, line: 'Ya está en tu lista', done: true, can: false, tone: 'good' } : { ...base, verb: 'Se acabó', line: `Agrega «${a.text}» a la lista`, tone: 'ink' };
  }
  return { ...base, verb: 'Abrir', line: routeLabel(a.route), tone: 'ink' };
}

// ---------- Ejecutar una etiqueta ----------

export const TAG_REPEAT_MS = 45000;

// Hace la acción de la etiqueta. `now`: la hora en milisegundos (evita que una doble lectura cuente dos veces).
// Devuelve { ok, text, icon, href?, undo? }.
export function runTag(s, id, today, ev = [], { now = Date.now(), nowMin = null } = {}) {
  const tag = ensurePlus(s).tags.find((t) => t.id === id);
  if (!tag) return { ok: false, unknown: true, text: 'No conozco esta etiqueta en este teléfono.', icon: 'info' };
  const a = tag.action;
  if (a.type !== 'open' && tag.lastAt && now - tag.lastAt < TAG_REPEAT_MS) return { ok: false, repeat: true, tag, text: `${tag.name}: ya la leí hace un momento.`, icon: 'check' };
  const used = () => { tag.uses = (tag.uses || 0) + 1; tag.last = today; tag.lastAt = now; };
  const st = tagStatus(s, tag, today, nowMin);
  if (a.type === 'open') { used(); return { ok: true, tag, text: tag.name, icon: 'right', href: a.route }; }
  if (!st.can) return { ok: false, tag, text: `${tag.name}: ${st.line.charAt(0).toLowerCase()}${st.line.slice(1)}.`, icon: st.done ? 'check' : 'info', done: st.done };
  if (a.type === 'chore') {
    const c = s.chores.find((x) => x.id === a.ref);
    const todo = choreStatus(s, c, today).todo;
    const r = completeTodo(s, todo.id, today, ev);
    used();
    return { ok: true, tag, text: `${c.title}: hecha${r && r.xp ? ` · +${r.xp} XP` : ''}`, icon: 'home', undo: { type: 'todo', id: todo.id } };
  }
  if (a.type === 'mission') {
    const m = s.missions.find((x) => x.id === a.ref);
    completeMission(s, m.id, today, ev);
    used();
    return { ok: true, tag, text: `${m.title}: cumplida`, icon: 'sword', undo: { type: 'mission', id: m.id } };
  }
  if (a.type === 'dose') {
    const next = dosesFor(s, today).find((d) => d.med.id === a.ref && !d.status);
    logDose(s, today, next.key, 'si', today, ev);
    used();
    return { ok: true, tag, text: `${next.med.name}: toma de las ${fmtClock(next.time)} anotada`, icon: 'pill', undo: { type: 'dose', key: next.key } };
  }
  if (a.type === 'water') {
    const w = ((s.health[today] || {}).water || 0) + 1;
    logHealth(s, today, { water: w }, today, ev);
    used();
    return { ok: true, tag, text: `Agua: ${w} de ${dailyGoal(s, 'water') || 8} vasos`, icon: 'drop', undo: { type: 'water' } };
  }
  if (a.type === 'buy') {
    const r = parseAndAdd(s, a.text, { today, by: 'etiqueta' });
    used();
    const it = r && (r.added[0] || r.merged[0]);
    return { ok: true, tag, text: `${a.text}: a tu lista de compras`, icon: 'cart', href: '/compras', undo: it && r.added.length ? { type: 'buy', id: it.id } : null };
  }
  return { ok: false, tag, text: 'Esta etiqueta no tiene una acción.', icon: 'info' };
}

export function undoTag(s, undo, today, ev = []) {
  if (!undo) return false;
  if (undo.type === 'todo') { const t = (s.todos || []).find((x) => x.id === undo.id); if (!t || !t.done) return false; uncompleteTodo(s, undo.id); return true; }
  if (undo.type === 'mission') { undoMission(s, undo.id, today); return true; }
  if (undo.type === 'dose') { logDose(s, today, undo.key, null, today, ev); return true; }
  if (undo.type === 'water') { const w = (s.health[today] || {}).water || 0; if (w > 0) logHealth(s, today, { water: w - 1 }, today, ev); return true; }
  if (undo.type === 'buy') { removeItem(s, undo.id); return true; }
  return false;
}

// ---------- Ideas: dónde pegar la primera etiqueta ----------

export function tagIdeas(s) {
  const have = new Set(tagsOf(s).map((t) => `${t.action.type}:${t.action.ref || t.action.route || t.action.text || ''}`));
  const out = [];
  const add = (action, name, where, why) => { const k = `${action.type}:${action.ref || action.route || action.text || ''}`; if (!have.has(k) && !out.some((o) => o.k === k)) out.push({ k, action, name, where, why }); };
  const spot = (title) => {
    const t = title.toLowerCase();
    if (/ropa|lavar|lavadora/.test(t)) return 'En la lavadora';
    if (/baño|inodoro|ducha/.test(t)) return 'Detrás de la puerta del baño';
    if (/basura|zafac/.test(t)) return 'En la tapa del zafacón';
    if (/sábana|cama/.test(t)) return 'En la cabecera de la cama';
    if (/nevera|refriger/.test(t)) return 'En la puerta de la nevera';
    if (/planta|regar/.test(t)) return 'En una maceta';
    if (/carro|vehícul|aceite/.test(t)) return 'En el tablero del carro';
    if (/cocina|estufa|trastes|platos/.test(t)) return 'En la cocina';
    return 'Donde haces esa tarea';
  };
  for (const c of (s.chores || []).filter((x) => !x.paused).slice(0, 4)) add({ type: 'chore', ref: c.id }, c.title, spot(c.title), 'Al terminar, acercas el teléfono y queda hecha.');
  for (const m of (s.meds || []).filter((x) => !x.archived).slice(0, 2)) add({ type: 'dose', ref: m.id }, m.name, 'En el frasco o el pastillero', 'Tomas la pastilla, tocas el frasco y queda anotada.');
  add({ type: 'water' }, 'Vaso de agua', 'En tu botella o el botellón', 'Cada vez que te sirves, un toque.');
  add({ type: 'open', route: '/compras?ver=despensa' }, 'Despensa', 'En la puerta de la nevera', 'Abre la despensa para marcar lo que se acaba.');
  add({ type: 'open', route: '/posada' }, 'Cerrar el día', 'En tu mesa de noche', 'Al acostarte, un toque y cierras el día.');
  for (const m of (s.missions || []).filter((x) => x.kind === 'habit' && !x.archived && !x.auto).slice(0, 2)) add({ type: 'mission', ref: m.id }, m.title, 'Donde la haces', 'La cumples sin abrir la app.');
  add({ type: 'open', route: '/enfoque' }, 'Enfoque', 'En tu escritorio', 'Te sientas, tocas y empieza tu sesión.');
  return out.slice(0, 8);
}

export function tagStats(s) {
  const list = tagsOf(s);
  return { n: list.length, uses: list.reduce((a, t) => a + (t.uses || 0), 0), top: [...list].sort((a, b) => (b.uses || 0) - (a.uses || 0))[0] || null };
}
