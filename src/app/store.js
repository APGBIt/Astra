// Estado persistente de Astra. Se guarda solo en este navegador.
import { useEffect, useReducer } from 'preact/hooks';
import { defaultState, reconcile } from '../game/logic.js';
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

function migrate(s) {
  const d = defaultState();
  if (!s || typeof s !== 'object') return d;
  const m = merge(d, s);
  // Listas: si vienen dañadas, se reinician vacías.
  for (const k of ['missions', 'vitLog', 'campaigns', 'bosses', 'moods', 'people', 'contacts', 'books', 'reads', 'cards', 'practice', 'focus', 'rewards', 'redeemed', 'titles', 'journal']) {
    if (!Array.isArray(m[k])) m[k] = [];
  }
  if (!Array.isArray(m.money.tx)) m.money.tx = [];
  if (!Array.isArray(m.money.categories) || !m.money.categories.length) m.money.categories = d.money.categories;
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
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch { /* sin almacenamiento */ }
  return defaultState();
}

let state = load();
const subs = new Set();
let timer = null;
const listeners = new Set();

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
  act((s, t) => { ev = reconcile(s, t); });
  return ev;
}

export function resetAll() {
  const theme = state.settings.theme;
  state = defaultState();
  state.settings.theme = theme;
  persist();
  notify();
}

export function exportData() {
  const clean = { ...state, settings: { ...state.settings, aiKey: '', serverToken: '' } };
  return JSON.stringify({ app: 'astra', v: 1, exportedAt: new Date().toISOString(), data: clean }, null, 1);
}

export function importData(text) {
  const o = JSON.parse(text);
  if (!o || o.app !== 'astra' || !o.data) throw new Error('El archivo no es una copia de Astra.');
  const keep = { aiKey: state.settings.aiKey, serverToken: state.settings.serverToken };
  state = migrate(o.data);
  Object.assign(state.settings, keep);
  persist();
  notify();
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}
