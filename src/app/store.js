// Estado persistente de Astra. Se guarda solo en este navegador.
import { useEffect, useReducer } from 'preact/hooks';
import { defaultState, reconcile, ensureRecord, ensureMoney, ensureHome } from '../game/logic.js';
import { ensureMind } from '../game/mind.js';
import { ensureGrowth, claimQuit } from '../game/growth.js';
import { ensureNotify } from '../game/reminders.js';
import { dayKey } from './dates.js';

const KEY = 'astra.v1';

function merge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over)) {
    const b = base ? base[k] : undefined;
    const o = over[k];
    out[k] = b && typeof b === 'object' && !Array.isArray(b) && o && typeof o === 'object' && !Array.isArray(o) ? merge(b, o) : o;
  }
  return out;
}

export function migrate(s) {
  const d = defaultState();
  if (!s || typeof s !== 'object') return d;
  const m = merge(d, s);
  // Listas: si vienen dañadas, se reinician vacías.
  for (const k of ['missions', 'vitLog', 'campaigns', 'bosses', 'moods', 'people', 'contacts', 'books', 'reads', 'cards', 'practice', 'focus', 'rewards', 'redeemed', 'titles', 'journal', 'todos', 'todoLists', 'chores', 'wins']) {
    if (!Array.isArray(m[k])) m[k] = [];
  }
  // Pendientes y categorías dañados se descartan uno a uno (no toda la lista).
  m.todos = m.todos.filter((t) => t && typeof t === 'object' && t.id && t.title);
  m.todoLists = m.todoLists.filter((l) => l && typeof l === 'object' && l.id && l.name);
  // Versión 2: pendientes, expediente y metas diarias propias.
  ensureRecord(m);
  if (!m.profile.goals || typeof m.profile.goals !== 'object') m.profile.goals = { ...d.profile.goals };
  // Versión 3: categorías nuevas, dólares y pesos, cuentas y tarjetas (los movimientos viejos se conservan).
  ensureMoney(m);
  // Versión 4: tareas del hogar, sueño por horario y logros (no cambia nada de lo anterior).
  ensureHome(m);
  // 1.6: calma, diario, chequeo de bienestar, rueda de la vida, valores y revisión de la semana.
  ensureMind(m);
  // 1.8: dejar de hacer, metas con progreso y cosas por lograr.
  ensureGrowth(m);
  ensureNotify(m);
  m.v = 4;
  if (!Array.isArray(m.profile.classKeys)) m.profile.classKeys = [];
  if (!Array.isArray(m.streak.freezeDays)) m.streak.freezeDays = [];
  return m;
}

export const storage = { ok: true };
try {
  localStorage.setItem('astra.t', '1');
  localStorage.removeItem('astra.t');
} catch {
  storage.ok = false;
}

function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch {
    // Si los datos guardados no se pueden leer, se guardan aparte antes de empezar de cero, para no perderlos.
    try { if (raw) localStorage.setItem(`${KEY}.rescate`, raw); } catch { /* sin espacio */ }
  }
  return defaultState();
}

let state = load();
const subs = new Set();
let timer = null;
const listeners = new Set();
// Avisos de «cambió algo tuyo» (para la sincronización). No se avisan los datos que llegan de Drive.
const changeSubs = new Set();
export function onChange(fn) { changeSubs.add(fn); return () => changeSubs.delete(fn); }
const changed = () => changeSubs.forEach((f) => { try { f(); } catch { /* sin efecto */ } });

function persist() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { storage.ok = false; }
  }, 100);
}

function notify() { subs.forEach((f) => f()); }

export function getState() { return state; }

// Cambia el estado. `fn(copia, hoy, ev)` puede anotar eventos en `ev` para celebrarlos.
export function act(fn) {
  const next = structuredClone(state);
  const ev = [];
  const today = dayKey();
  const ret = fn(next, today, ev);
  state = next;
  persist();
  notify();
  changed();
  if (ev.length) listeners.forEach((l) => l(ev));
  return ret;
}

export function onEvents(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useApp() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    subs.add(force);
    return () => subs.delete(force);
  }, []);
  return state;
}

// Al abrir, y cada vez que la app vuelve al frente en un día nuevo: cierra los días pendientes.
export function runReconcile() {
  const today = dayKey();
  if (state.processed === today && state.energy && state.energy.day === today) return [];
  let ev = [];
  act((s, t, e) => { ev = reconcile(s, t); claimQuit(s, t, e); });
  return ev;
}

export function resetAll() {
  const theme = state.settings.theme;
  state = defaultState();
  state.settings.theme = theme;
  persist();
  notify();
  resetSubs.forEach((f) => f());
}
// Al borrar todo, la sincronización se desconecta (lo que hay en Drive no se toca).
const resetSubs = new Set();
export const onReset = (fn) => { resetSubs.add(fn); return () => resetSubs.delete(fn); };

// Datos sin tus claves (para copias y para Drive).
export function cleanData(s = state) {
  return { ...s, settings: { ...s.settings, aiKey: '', serverToken: '' } };
}

export function exportData() {
  return JSON.stringify({ app: 'astra', v: 1, exportedAt: new Date().toISOString(), data: cleanData() }, null, 1);
}

// Pone datos que llegaron de Drive (ya juntados). Conserva tus claves de este teléfono.
export function applyRemote(data) {
  const keep = { aiKey: state.settings.aiKey, serverToken: state.settings.serverToken };
  state = migrate(structuredClone(data));
  Object.assign(state.settings, keep);
  persist();
  notify();
}

export function importData(text) {
  const o = JSON.parse(text);
  if (!o || o.app !== 'astra' || !o.data) throw new Error('El archivo no es una copia de Astra.');
  const keep = { aiKey: state.settings.aiKey, serverToken: state.settings.serverToken };
  state = migrate(o.data);
  Object.assign(state.settings, keep);
  persist();
  notify();
  changed();
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}
