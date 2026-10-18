// Sincronización: Astra funciona sin internet y, cuando hay conexión, junta los cambios con tu Drive.
// Cada persona conecta su propio Drive (conector propio de Apps Script o «Conectar con Google»).
// Lo que se sube: tus datos de Astra sin tus claves de IA, una copia por día y las fotos que agregues.
import { useEffect, useReducer } from 'preact/hooks';
import { act, getState, applyRemote, cleanData, onChange, onReset, runReconcile } from './store.js';
import { dayKey } from './dates.js';
import { kvGet, kvSet, kvDel, photoGet, photoPut, photoDel } from './idb.js';
import { scriptTransport, driveTransport, SyncError } from './transports.js';
import { googleToken, clearGoogleToken } from './google.js';
import { mergeStates } from '../game/merge.js';
import { buildTables } from '../game/tables.js';
import { referencedPhotos } from '../game/logic.js';

const KEY = 'astra.sync';
const DEFAULTS = {
  provider: null, auto: true, device: '', script: null, google: { ids: {} }, account: '', folderUrl: '',
  changes: 0, synced: 0, lastSync: null, lastBackupDay: null, tablesHash: '', tablesAt: 0, connectedAt: null,
};

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
let cfg = load();
const subs = new Set();
const emit = () => subs.forEach((f) => f());
function save(patch) {
  cfg = { ...cfg, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* sin almacenamiento */ }
  emit();
}
if (!cfg.device) save({ device: `d${Math.random().toString(36).slice(2, 10)}` });

let status = { phase: cfg.provider ? 'idle' : 'off', msg: '' };
function setStatus(phase, msg = '') { status = { phase, msg }; emit(); }

export const syncConfig = () => cfg;
export function syncState() {
  return { ...status, provider: cfg.provider, auto: cfg.auto, lastSync: cfg.lastSync, dirty: cfg.changes > cfg.synced, account: cfg.account, folderUrl: cfg.folderUrl, device: cfg.device };
}
export function useSync() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => { subs.add(force); return () => subs.delete(force); }, []);
  return syncState();
}

// ---------- Transporte según el conector ----------

function transport() {
  if (cfg.provider === 'script' && cfg.script) return scriptTransport(cfg.script);
  if (cfg.provider === 'google') {
    const token = googleToken();
    if (!token) return null;
    return driveTransport({ token, ids: { ...(cfg.google && cfg.google.ids) }, saveIds: (ids) => save({ google: { ...cfg.google, ids } }) });
  }
  return null;
}

// ---------- Datos ----------

const pack = (data) => JSON.stringify({ app: 'astra', v: 1, exportedAt: new Date().toISOString(), device: cfg.device, data });
function unpack(text) {
  if (!text) return null;
  const o = JSON.parse(text);
  if (!o || o.app !== 'astra' || !o.data) throw new SyncError('formato', 'El archivo de Drive no es de Astra');
  return o.data;
}
// Un teléfono «nuevo» (sin nada propio) toma lo de Drive sin preguntar.
function isFresh(s) {
  return !s.profile.onboarded || (s.xp === 0 && !s.todos.length && !s.missions.length && !(s.money.tx || []).length && !(s.wins || []).length && !(s.chores || []).length);
}
const getBase = () => kvGet('base').catch(() => null);
const setBase = (rev, data) => kvSet('base', { rev, provider: cfg.provider, text: JSON.stringify(data) }).catch(() => {});
const hash = (t) => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return String(h >>> 0); };

function applyMerged(data) {
  applyRemote(data);
  // Las rutinas y los días se ajustan con el día de hoy de este teléfono (sin contar como cambio tuyo).
  runReconcile();
}

// ---------- Fotos ----------

async function syncPhotos(tr) {
  const s = getState();
  const photos = s.photos || {};
  const used = referencedPhotos(s);
  for (const [id, p] of Object.entries(photos)) {
    try { await syncPhoto(tr, id, p, used); } catch { /* una foto que falle no detiene lo demás; se reintenta luego */ }
  }
}

async function syncPhoto(tr, id, p, used) {
  // Fotos sueltas (de un registro que ya no existe) se limpian después de un rato.
  if (!p.deleted && !used.has(id) && p.added && Date.now() - p.added > 30 * 60000) {
    act((st) => { if (st.photos[id]) { if (st.photos[id].remote) st.photos[id].deleted = true; else delete st.photos[id]; } });
    photoDel(id).catch(() => {});
    return;
  }
  if (p.deleted) {
    if (p.remote) await tr.delPhoto(p.remote).catch(() => {});
    act((st) => { delete st.photos[id]; });
    photoDel(id).catch(() => {});
    return;
  }
  if (p.remote) return;
  const rec = await photoGet(id).catch(() => null);
  if (!rec || !rec.blob) return;
  const fileId = await tr.putPhoto(rec.blob, { id, name: `${p.day || dayKey()}-${id}.jpg`, folder: p.folder || 'Otras', desc: p.desc || '' });
  act((st) => { if (st.photos[id]) st.photos[id].remote = fileId; });
}

export async function downloadPhoto(id) {
  const meta = (getState().photos || {})[id];
  const tr = transport();
  if (!meta || !meta.remote || !tr) return null;
  const blob = await tr.getPhoto(meta.remote);
  await photoPut({ id, blob, thumb: null, mime: blob.type, created: Date.now() }).catch(() => {});
  return blob;
}

// ---------- Sincronizar ----------

let running = null;
let again = false;
let timer = null;

export function syncNow(opts = {}) {
  if (running) { again = true; return running; }
  running = run(opts).finally(() => {
    running = null;
    if (again) { again = false; schedule(3000); }
  });
  return running;
}

async function run({ manual = false } = {}) {
  if (!cfg.provider) { setStatus('off'); return; }
  // Si falta tu decisión (juntar o usar lo de Drive), no se insiste solo.
  if (status.phase === 'choose' && !manual) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { setStatus('offline'); return; }
  const tr = transport();
  if (!tr) { setStatus('auth', 'Inicia sesión con Google para seguir sincronizando.'); return; }
  setStatus('syncing');
  try {
    let done = false;
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      const head = await tr.head();
      const base = await getBase();
      const validBase = base && base.provider === cfg.provider && base.rev != null && head && base.rev <= head.rev;
      if (!head) {
        // Drive vacío: se sube lo de este teléfono.
        await syncPhotos(tr);
        const k = cfg.changes;
        const data = cleanData(getState());
        const { rev } = await tr.push(pack(data), null, await metaFor(data, manual));
        await setBase(rev, data);
        save({ synced: k, lastSync: Date.now() });
        done = true;
        break;
      }
      if (!validBase) {
        const remote = await tr.pull();
        const rdata = unpack(remote.text);
        if (!rdata) throw new SyncError('formato', 'El archivo de Drive está vacío');
        if (isFresh(getState())) {
          const k = cfg.changes;
          applyMerged(rdata);
          await setBase(remote.rev, rdata);
          save({ synced: k, lastSync: Date.now() });
          done = true;
          break;
        }
        // Ya hay datos aquí y en Drive: la persona elige (juntar o usar los de Drive).
        setStatus('choose', 'Ya hay datos de Astra en este Drive.');
        return;
      }
      const dirty = cfg.changes > cfg.synced;
      if (head.rev === base.rev && !dirty) { done = true; break; }
      let data;
      let expect = head.rev;
      if (head.rev === base.rev) {
        data = cleanData(getState());
      } else {
        const remote = await tr.pull();
        const rdata = unpack(remote.text);
        expect = remote.rev;
        if (!dirty) {
          const k = cfg.changes;
          applyMerged(rdata);
          await setBase(remote.rev, rdata);
          save({ synced: k, lastSync: Date.now() });
          done = true;
          break;
        }
        // Cambios aquí y allá: se juntan con el estado común (se lee el estado de ahora, sin esperas en medio).
        const merged = mergeStates(JSON.parse(base.text), cleanData(getState()), rdata);
        applyMerged(merged);
        data = cleanData(getState());
      }
      await syncPhotos(tr);
      const k = cfg.changes;
      data = cleanData(getState());
      try {
        const { rev } = await tr.push(pack(data), expect, await metaFor(data, manual));
        await setBase(rev, data);
        save({ synced: k, lastSync: Date.now() });
        done = true;
      } catch (e) {
        if (e.code !== 'conflict') throw e; // otro equipo subió algo justo ahora: se repite
      }
    }
    if (!done) throw new SyncError('busy', 'Drive está cambiando; se intenta de nuevo en un momento');
    await extras(tr, manual);
    setStatus('ok');
  } catch (e) {
    const code = e && e.code;
    if (code === 'auth') { clearGoogleToken(); setStatus('auth', 'Tu sesión de Google venció. Inicia sesión para seguir sincronizando.'); return; }
    if (code === 'offline' || code === 'network' || code === 'timeout') { setStatus('offline', 'Sin conexión con Drive. Se intenta de nuevo cuando vuelva.'); return; }
    if (code === 'clave') { setStatus('error', 'La clave no coincide con la del conector. Usa el código de enlace del otro equipo.'); return; }
    setStatus('error', (e && e.message) || 'No se pudo sincronizar');
    schedule(120000);
  }
}

async function metaFor(data, manual) {
  const meta = { device: cfg.device };
  if (cfg.provider === 'script') {
    const t = tablesIfDue(data, manual);
    if (t) meta.tables = t.tables;
  }
  return meta;
}

function tablesIfDue(data, manual) {
  const tables = buildTables(data, dayKey());
  const h = hash(JSON.stringify(tables));
  if (h === cfg.tablesHash) return null;
  if (!manual && Date.now() - (cfg.tablesAt || 0) < 15 * 60000) return null;
  save({ tablesHash: h, tablesAt: Date.now() });
  return { tables };
}

// Copia del día y tablas (Google). El conector propio las hace solo.
async function extras(tr, manual) {
  if (cfg.provider !== 'google') return;
  const today = dayKey();
  try {
    if (cfg.lastBackupDay !== today && tr.backup) { await tr.backup(today); save({ lastBackupDay: today }); }
    const t = tablesIfDue(cleanData(getState()), manual);
    if (t && tr.tables) await tr.tables(t.tables);
  } catch { /* lo principal ya se guardó */ }
}

// La persona eligió qué hacer cuando ya había datos en los dos lados.
export async function resolveFirst(choice) {
  const tr = transport();
  if (!tr) return;
  setStatus('syncing');
  try {
    const remote = await tr.pull();
    const rdata = unpack(remote.text);
    const local = cleanData(getState());
    await kvSet('antes-de-sincronizar', { at: Date.now(), text: JSON.stringify(local) }).catch(() => {});
    if (choice === 'remote') {
      const k = cfg.changes;
      applyMerged(rdata);
      await setBase(remote.rev, rdata);
      save({ synced: k, lastSync: Date.now() });
      setStatus('ok');
      return;
    }
    const merged = mergeStates(undefined, local, rdata);
    applyMerged(merged);
    await setBase(remote.rev, rdata);
    save({ synced: -1 }); // hay cambios que subir
    await syncNow({ manual: true });
  } catch (e) {
    setStatus('error', (e && e.message) || 'No se pudo sincronizar');
  }
}

// ---------- Programación automática ----------

function schedule(ms = 20000) {
  if (!cfg.provider || !cfg.auto) return;
  clearTimeout(timer);
  timer = setTimeout(() => { if (typeof document === 'undefined' || !document.hidden || ms > 60000) syncNow(); }, ms);
}

let started = false;
export function startSync() {
  if (started) return;
  started = true;
  onChange(() => { save({ changes: cfg.changes + 1 }); schedule(); });
  onReset(() => { disconnect(); });
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => schedule(1500));
    window.addEventListener('offline', () => { if (cfg.provider) setStatus('offline'); });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && cfg.provider && cfg.auto && Date.now() - (cfg.lastSync || 0) > 60000) schedule(1000);
    });
    setInterval(() => { if (cfg.provider && cfg.auto && !document.hidden && (cfg.changes > cfg.synced || Date.now() - (cfg.lastSync || 0) > 5 * 60000)) syncNow(); }, 60000);
  }
  if (cfg.provider && cfg.auto) schedule(1500);
}

// ---------- Conectar y desconectar ----------

const randomKey = () => {
  const a = new Uint8Array(24);
  (globalThis.crypto || window.crypto).getRandomValues(a);
  return Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 32);
};

export function normalizeScriptUrl(u) {
  const t = String(u || '').trim();
  const m = t.match(/^https:\/\/script\.google\.com\/(?:a\/[^/]+\/)?macros\/s\/([\w-]+)\/(?:exec|dev)/);
  return m ? `https://script.google.com/macros/s/${m[1]}/exec` : null;
}

export async function connectScript(url, key = null) {
  const u = normalizeScriptUrl(url);
  if (!u) throw new SyncError('url', 'Esa dirección no es la de un conector. Debe empezar con https://script.google.com/macros/s/ y terminar en /exec.');
  const k = key || randomKey();
  const tr = scriptTransport({ url: u, key: k });
  const hi = await tr.hello();
  await kvDel('base').catch(() => {});
  save({ provider: 'script', script: { url: u, key: k }, account: hi.cuenta || '', folderUrl: hi.url || '', synced: -1, connectedAt: Date.now() });
  setStatus('idle');
  return syncNow({ manual: true });
}

export async function connectGoogle() {
  const tr = driveTransport({ token: googleToken(), ids: {}, saveIds: (ids) => save({ google: { ...cfg.google, ids } }) });
  const hi = await tr.hello();
  if (cfg.provider !== 'google') await kvDel('base').catch(() => {});
  save({ provider: 'google', account: hi.cuenta || '', folderUrl: hi.url || '', synced: cfg.provider === 'google' ? cfg.synced : -1, connectedAt: cfg.connectedAt || Date.now() });
  setStatus('idle');
  return syncNow({ manual: true });
}

export function disconnect() {
  clearTimeout(timer);
  kvDel('base').catch(() => {});
  clearGoogleToken();
  save({ provider: null, script: null, google: { ids: {} }, account: '', folderUrl: '', synced: 0, changes: 0, lastSync: null, tablesHash: '', lastBackupDay: null });
  setStatus('off');
}

export function setAuto(v) { save({ auto: !!v }); if (v) schedule(1000); }

// Código para conectar otro equipo al mismo conector (lleva la dirección y la clave).
export function linkCode() {
  if (cfg.provider !== 'script' || !cfg.script) return '';
  const raw = JSON.stringify({ u: cfg.script.url, k: cfg.script.key });
  return `astra-enlace:${btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}
export function parseLinkCode(code) {
  const m = String(code || '').trim().match(/^astra-enlace:([\w-]+)$/);
  if (!m) return null;
  try {
    const b = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const o = JSON.parse(atob(b + '='.repeat((4 - (b.length % 4)) % 4)));
    return o && o.u && o.k ? { url: o.u, key: o.k } : null;
  } catch { return null; }
}

export { SyncError };
