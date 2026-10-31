// Estado persistente de Astra. Vive solo en este teléfono:
// - en la base de datos del navegador (IndexedDB), que no tiene el tope de unos 5 MB de localStorage;
// - y en una copia rápida en localStorage mientras quepa (abre sin esperas y avisa a otras ventanas).
// Si un guardado no queda en ningún lado, la app lo dice (antes fallaba en silencio).
import { useEffect, useReducer } from 'preact/hooks';
import { defaultState, reconcile, ensureRecord, ensureMoney, ensureHome, playerLevel } from '../game/logic.js';
import { ensureMind } from '../game/mind.js';
import { ensureGrowth, claimQuit } from '../game/growth.js';
import { ensureNotify } from '../game/reminders.js';
import { ensureHealthPlus } from '../game/health.js';
import { ensureShop } from '../game/shop.js';
import { ensureFood } from '../game/food.js';
import { dayKey } from './dates.js';
import { AREA } from '../game/content.js';
import { kvGet, kvSetMany } from './idb.js';
import { takeSnap, readSnap } from './snapshots.js';

const KEY = 'astra.v1';
const LSAT = 'astra.lsat'; // cuándo se guardó la copia de localStorage
const AT = 'astra.at'; // cuándo se guardó lo último (en cualquiera de los dos lados)
const WHERE = 'astra.where'; // «idb»: lo último solo está en la base de datos (localStorage se llenó)

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
  for (const k of ['missions', 'vitLog', 'campaigns', 'bosses', 'moods', 'people', 'contacts', 'books', 'reads', 'cards', 'practice', 'focus', 'rewards', 'redeemed', 'titles', 'journal', 'todos', 'todoLists', 'chores', 'wins', 'meds']) {
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
  // 1.10: medicinas y suplementos, actividad con intensidad.
  ensureHealthPlus(m);
  // 1.13: listas de compras, despensa, compras hechas y deseos.
  ensureShop(m);
  // 1.14: «Tu plato» (comidas con el método del plato).
  ensureFood(m);
  m.v = 4;
  if (!Array.isArray(m.profile.classKeys)) m.profile.classKeys = [];
  m.profile.classKeys = m.profile.classKeys.filter((k) => AREA[k]).slice(0, 2);
  if (!Array.isArray(m.streak.freezeDays)) m.streak.freezeDays = [];
  return m;
}

// ---------- Dónde y cómo se guarda ----------

const BROWSER = typeof window !== 'undefined' && typeof document !== 'undefined';
const num = (v) => Number(v) || 0;
export const isQuota = (e) => !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

export const storage = {
  ok: true, // lo último quedó guardado en algún lado
  ls: true, // localStorage disponible
  idb: null, // base de datos disponible (null: todavía no se sabe)
  lsFull: false, // la copia rápida ya no cabe en localStorage
  failing: false, // el último guardado no quedó en ningún lado
  blocked: false, // hay datos guardados que no se pudieron abrir: no se guarda nada encima
  stale: false, // si está bloqueado: hay una copia rápida más vieja en este teléfono
  staleAt: 0, // de cuándo es esa copia (0: no se sabe)
  savedAt: 0, // cuándo se guardó lo último
  persisted: null, // el navegador prometió no borrar los datos para hacer espacio
  size: 0, // tamaño de tus datos (caracteres)
};
try {
  localStorage.setItem('astra.t', '1');
  localStorage.removeItem('astra.t');
} catch (e) {
  if (isQuota(e)) storage.lsFull = true; else storage.ls = false;
}

let rescue = null; // datos que no se pudieron abrir: se guardan como punto de restauración
let lsAt = 0;
let hadLocal = false;
function loadLocal() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    lsAt = num(localStorage.getItem(LSAT));
    if (raw) { const s = migrate(JSON.parse(raw)); hadLocal = true; return s; }
  } catch {
    // Si los datos guardados no se pueden leer, se guardan aparte antes de empezar de cero, para no perderlos.
    rescue = raw;
    try { if (raw) localStorage.setItem(`${KEY}.rescate`, raw); } catch { /* sin espacio */ }
  }
  return null;
}

let state = loadLocal() || defaultState();

let current = state; // lo último que se pintó
const subs = new Set();
const listeners = new Set();
// Avisos de «cambió algo tuyo» (para la sincronización). No se avisan los datos que llegan de Drive.
const changeSubs = new Set();
export function onChange(fn) { changeSubs.add(fn); return () => changeSubs.delete(fn); }
const changed = () => changeSubs.forEach((f) => { try { f(); } catch { /* sin efecto */ } });

function notify() { current = state; subs.forEach((f) => f()); }

storage.savedAt = lsAt;
let json = null; // el estado ya convertido a texto (null: cambió y hay que volver a convertirlo)
const serialize = () => (json != null ? json : (json = JSON.stringify(state)));
let dirty = false;
let timer = null;

const statusKey = () => `${storage.ok}|${storage.failing}|${storage.lsFull}|${storage.idb}|${storage.blocked}|${storage.persisted}`;
const statusSubs = new Set();
const emitStorage = () => statusSubs.forEach((f) => { try { f(); } catch { /* sin efecto */ } });
export function onStorage(fn) { statusSubs.add(fn); return () => statusSubs.delete(fn); }
export function useStorage() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => onStorage(force), []);
  return storage;
}

function withTimeout(p, ms) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); })]).finally(() => clearTimeout(t));
}

// Al abrir: si lo último quedó en la base de datos (porque localStorage se llenó o es más nuevo), se usa eso.
// Nunca se empieza de cero si había datos que no se pudieron abrir.
async function boot() {
  const at = num(lsGet(AT));
  const needIdb = lsGet(WHERE) === 'idb' || at > lsAt;
  let rec = null;
  let idbAt = 0;
  try {
    // Si la copia rápida es lo último, basta con saber de cuándo es lo de la base de datos (sin leerlo todo).
    if (needIdb || !hadLocal) rec = await withTimeout(kvGet('state'), needIdb ? 10000 : 3000);
    else idbAt = num(await withTimeout(kvGet('stateAt'), 3000));
    if (rec) idbAt = num(rec.at);
    storage.idb = true;
  } catch {
    storage.idb = false;
  }
  if (rec && typeof rec.json === 'string' && num(rec.at) > (hadLocal ? lsAt : 0)) {
    try {
      state = migrate(JSON.parse(rec.json));
      json = null;
      storage.savedAt = num(rec.at);
    } catch {
      rescue = rescue || rec.json;
      if (needIdb && !hadLocal) storage.blocked = true;
    }
  } else if (needIdb && !rec) {
    // Lo último está en la base de datos y no se pudo leer: no se guarda nada encima. Se puede reintentar.
    storage.blocked = true;
    storage.stale = hadLocal;
    storage.staleAt = hadLocal ? lsAt : 0;
  }
  if (storage.idb && !storage.blocked && (!idbAt || idbAt < storage.savedAt || !storage.savedAt)) {
    // Primera vez con la base de datos (o quedó atrás): se guarda ahí también, sin hacer esperar a la pantalla.
    dirty = true;
    flush();
  }
  if (rescue) takeSnap('rescate', rescue, null).catch(() => {});
  current = state;
  emitStorage();
}
export const ready = boot().catch(() => {});
export const dataSize = () => serialize().length;

// Si está bloqueado: seguir con la copia rápida más vieja de este teléfono (la persona lo decide).
export function useStaleCopy() {
  storage.blocked = false;
  storage.stale = false;
  storage.staleAt = 0;
  dirty = true;
  flush();
  notify();
  emitStorage();
}

function persist() {
  dirty = true;
  clearTimeout(timer);
  timer = setTimeout(flush, 150);
}

// Guarda ya (también al salir de la app). Devuelve una promesa que termina cuando la base de datos respondió.
export function flush() {
  clearTimeout(timer);
  timer = null;
  if (!dirty || storage.blocked) return Promise.resolve();
  dirty = false;
  const before = statusKey();
  const text = serialize();
  const at = Math.max(Date.now(), storage.savedAt + 1);
  storage.savedAt = at;
  storage.size = text.length;
  let lsOk = false;
  if (storage.ls) {
    try {
      localStorage.setItem(KEY, text);
      localStorage.setItem(LSAT, String(at));
      lsAt = at;
      lsOk = true;
      storage.lsFull = false;
      try { localStorage.removeItem(WHERE); } catch { /* */ }
    } catch (e) {
      if (isQuota(e)) storage.lsFull = true;
      // La copia vieja ya no es la última y ocupa el espacio de lo demás: si la base de datos funciona, se quita.
      if (storage.idb) { try { localStorage.removeItem(KEY); localStorage.removeItem(LSAT); lsAt = 0; } catch { /* */ } }
    }
  }
  try {
    localStorage.setItem(AT, String(at));
    if (!lsOk) localStorage.setItem(WHERE, 'idb');
  } catch { /* */ }
  // Si al abrir la base de datos tardó demasiado, se vuelve a intentar cuando localStorage no alcanzó.
  const tryIdb = storage.idb !== false || !lsOk;
  const idbP = tryIdb ? kvSetMany([['state', { at, json: text }], ['stateAt', at]]).then(() => true, () => false) : Promise.resolve(false);
  return idbP.then((idbOk) => {
    if (idbOk) storage.idb = true;
    const failing = !lsOk && !idbOk;
    if (failing) dirty = true; // se reintenta con el próximo cambio
    storage.failing = failing;
    storage.ok = !failing;
    // Solo se avisa si cambió algo que se muestra (así guardar no vuelve a pintar toda la pantalla).
    if (statusKey() !== before) emitStorage();
    if (!failing) broadcast(at);
  });
}
export const retrySave = () => { dirty = true; return flush(); };

// ---------- Otras ventanas con Astra abierta ----------
// Si abres Astra en dos ventanas (la app instalada y una pestaña), la que vuelve al frente toma lo más
// reciente antes de que la toques: así una ventana vieja ya no borra lo que hiciste en la otra.

const me = Math.random().toString(36).slice(2);
let chan = null;
function broadcast(at) { try { if (chan) chan.postMessage({ t: 'saved', at, from: me }); } catch { /* */ } }
const externalSubs = new Set();
export function onExternal(fn) { externalSubs.add(fn); return () => externalSubs.delete(fn); }

let adopting = null;
export function adoptNewer() {
  if (adopting || storage.blocked) return adopting || Promise.resolve(false);
  adopting = (async () => {
    if (dirty) { await flush(); return false; } // lo de esta ventana va primero
    const at = num(lsGet(AT));
    if (at <= storage.savedAt) return false;
    const la = num(lsGet(LSAT));
    let text = null;
    let src = 0;
    if (la >= at) { text = lsGet(KEY); src = la; } else {
      const rec = await kvGet('state').catch(() => null);
      if (rec) { text = rec.json; src = num(rec.at); }
    }
    if (!text || src <= storage.savedAt) return false;
    try {
      state = migrate(JSON.parse(text));
      json = null;
      storage.savedAt = src;
      lsAt = la;
      notify();
      externalSubs.forEach((f) => { try { f(); } catch { /* */ } });
      return true;
    } catch { return false; }
  })().finally(() => { adopting = null; });
  return adopting;
}

if (BROWSER) {
  try {
    if (typeof BroadcastChannel === 'function') {
      chan = new BroadcastChannel('astra');
      chan.onmessage = (e) => { const m = e.data; if (m && m.t === 'saved' && m.from !== me && num(m.at) > storage.savedAt) adoptNewer(); };
    }
  } catch { chan = null; }
  window.addEventListener('storage', (e) => { if (e.key === AT && num(e.newValue) > storage.savedAt) adoptNewer(); });
  // Al salir de la app se guarda en el momento (no se espera la pausa de 150 ms).
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); else adoptNewer(); });
  window.addEventListener('pagehide', () => { flush(); });
}

// El navegador puede borrar los datos de un sitio cuando el teléfono se queda sin espacio, salvo que
// prometa conservarlos («almacenamiento persistente»). Se pide una vez por sesión.
export async function askPersist() {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.persisted) return null;
    let p = await navigator.storage.persisted();
    if (!p && navigator.storage.persist) p = await navigator.storage.persist();
    storage.persisted = !!p;
    emitStorage();
    return storage.persisted;
  } catch { return null; }
}

export async function storageEstimate() {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) return null;
    const e = await navigator.storage.estimate();
    return { usage: num(e.usage), quota: num(e.quota) };
  } catch { return null; }
}

// ---------- Cambios ----------


export function getState() { return state; }

// Cambia el estado. `fn(copia, hoy, ev)` puede anotar eventos en `ev` para celebrarlos.
// La copia se hace desde el texto ya guardado (JSON), unas 3 veces más rápido que structuredClone
// cuando hay meses de datos; es la misma forma en que los datos vuelven al abrir la app.
export function act(fn) {
  const next = JSON.parse(serialize());
  const ev = [];
  const today = dayKey();
  const ret = fn(next, today, ev);
  state = next;
  json = null;
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
    // Si el estado cambió entre que se pintó y se suscribió (por ejemplo, llegó de otra ventana), se repinta.
    if (current !== state) force();
    return () => subs.delete(force);
  }, []);
  return state;
}

// ---------- Resúmenes y puntos de restauración ----------

const lastDayOf = (s) => {
  let last = '';
  for (const k of Object.keys(s.days || {})) if (k > last) last = k;
  for (const t of (s.money && s.money.tx) || []) { if (t.day > last) last = t.day; break; }
  return last || null;
};

// Lo que tiene una copia, para comparar antes de reemplazar tus datos.
export function summaryOf(s) {
  if (!s || typeof s !== 'object') return null;
  const len = (x) => (Array.isArray(x) ? x.length : 0);
  return {
    name: (s.profile && s.profile.name) || '',
    level: playerLevel(Number(s.xp) || 0).n,
    xp: Number(s.xp) || 0,
    tx: len(s.money && s.money.tx),
    todos: len(s.todos),
    moods: len(s.moods),
    journal: len(s.journal),
    health: Object.keys(s.health || {}).length,
    last: lastDayOf(s),
  };
}

export function snapshotNow(reason, opts = {}) {
  // Sin personaje creado no hay nada que proteger.
  if (!state.profile.onboarded) return Promise.resolve(null);
  return takeSnap(reason, serialize(), summaryOf(state), opts).catch(() => null);
}

// Vuelve a un punto de restauración. Antes guarda cómo estabas, por si te arrepientes.
export async function restoreSnap(id) {
  const text = await readSnap(id);
  const o = JSON.parse(text);
  await takeSnap('volver', serialize(), summaryOf(state)).catch(() => null);
  const keep = { aiKey: state.settings.aiKey, serverToken: state.settings.serverToken };
  state = migrate(o);
  json = null;
  Object.assign(state.settings, keep);
  persist();
  notify();
  changed();
}

// Al abrir, y cada vez que la app vuelve al frente en un día nuevo: cierra los días pendientes.
// Antes de cerrar un día nuevo se guarda la copia del día (una por día).
export function runReconcile() {
  const today = dayKey();
  if (state.processed === today && state.energy && state.energy.day === today) return [];
  if (state.processed !== today) snapshotNow('dia', { oncePerDay: true });
  let ev = [];
  act((s, t, e) => { ev = reconcile(s, t); claimQuit(s, t, e); });
  return ev;
}

export function resetAll() {
  snapshotNow('borrar');
  const theme = state.settings.theme;
  state = defaultState();
  json = null;
  state.settings.theme = theme;
  persist();
  notify();
  resetSubs.forEach((f) => f());
}
// Al borrar todo, la sincronización se desconecta (lo que hay en Drive no se toca).
const resetSubs = new Set();
export const onReset = (fn) => { resetSubs.add(fn); return () => resetSubs.delete(fn); };

// Datos sin tus claves (para copias y para Drive). El «deshacer» de lo último que cambiaste en grupo
// se queda solo en este teléfono.
export function cleanData(s = state) {
  return { ...s, settings: { ...s.settings, aiKey: '', serverToken: '' }, ...(s.money ? { money: { ...s.money, lastBulk: null } } : {}) };
}

export function exportData(s = state) {
  return JSON.stringify({ app: 'astra', v: 1, exportedAt: new Date().toISOString(), data: cleanData(s) }, null, 1);
}

// Pone datos que llegaron de Drive (ya juntados). Conserva tus claves de este teléfono.
export function applyRemote(data) {
  const keep = { aiKey: state.settings.aiKey, serverToken: state.settings.serverToken };
  state = migrate(JSON.parse(JSON.stringify(data)));
  json = null;
  Object.assign(state.settings, keep);
  persist();
  notify();
}

// Lee un archivo de copia sin cambiar nada (para mostrar qué trae antes de reemplazar).
export function readBackup(text) {
  let o;
  try { o = JSON.parse(text); } catch { throw new Error('El archivo no es una copia de Astra.'); }
  if (!o || o.app !== 'astra' || !o.data || typeof o.data !== 'object') throw new Error('El archivo no es una copia de Astra.');
  return { data: o.data, exportedAt: o.exportedAt || null, summary: summaryOf(o.data) };
}

export function importData(text) {
  importBackup(readBackup(text).data);
}

// Reemplaza tus datos por los de una copia ya leída. Antes guarda un punto de restauración.
export function importBackup(data) {
  snapshotNow('importar');
  // Recuperar un archivo es una decisión explícita: si los datos estaban bloqueados, se reemplazan.
  if (storage.blocked) { storage.blocked = false; storage.stale = false; storage.staleAt = 0; emitStorage(); }
  const keep = { aiKey: state.settings.aiKey, serverToken: state.settings.serverToken };
  state = migrate(data);
  json = null;
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
