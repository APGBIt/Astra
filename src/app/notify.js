// Notificaciones en el teléfono (1.8). Sin servidor: Astra calcula los avisos de hoy y mañana y
// - mientras la app está abierta o en segundo plano, los muestra a su hora;
// - los deja guardados para el service worker, que los muestra cuando el sistema lo despierta
//   (sincronización periódica en Android con la app instalada) o al volver a abrir la app.
import { env } from './env.js';
import { kvGet, kvSet } from './idb.js';
import { buildReminders } from '../game/reminders.js';

const KEY = 'reminders';
const SENT = 'remindersSent';
const SYNC_TAG = 'astra-avisos';
let timers = [];

export function notifyStatus() {
  if (typeof window === 'undefined' || !('Notification' in window)) return env.isIOS && !env.standalone ? 'ios' : 'unsupported';
  if (env.framed) return 'framed';
  if (!window.isSecureContext) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

async function registration() {
  if (!('serviceWorker' in navigator)) return null;
  try { return (await navigator.serviceWorker.getRegistration()) || null; } catch { return null; }
}

async function sentSet() {
  try { return new Set((await kvGet(SENT)) || []); } catch { return new Set(); }
}
async function markSent(id) {
  try { const s = await sentSet(); s.add(id); await kvSet(SENT, [...s].slice(-300)); } catch { /* sin IndexedDB */ }
}

export async function showNow(r) {
  if (notifyStatus() !== 'granted') return false;
  const opts = { body: r.body, tag: r.tag || r.id, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: r.url || '#/' }, lang: 'es' };
  const reg = await registration();
  try {
    if (reg) await reg.showNotification(r.title, opts);
    else { const n = new Notification(r.title, opts); n.onclick = () => { window.focus(); location.hash = (r.url || '#/').replace(/^#/, ''); n.close(); }; }
    return true;
  } catch { return false; }
}

// Pide permiso y prepara el aviso en segundo plano (si el navegador lo permite).
export async function enableNotifications() {
  const st = notifyStatus();
  if (st === 'unsupported' || st === 'framed' || st === 'ios') return st;
  let perm = Notification.permission;
  if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch { perm = Notification.permission; } }
  if (perm === 'granted') await registerPeriodic();
  return perm;
}

async function registerPeriodic() {
  const reg = await registration();
  if (!reg || !('periodicSync' in reg)) return false;
  try {
    const p = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (p.state !== 'granted') return false;
    await reg.periodicSync.register(SYNC_TAG, { minInterval: 3 * 60 * 60 * 1000 });
    return true;
  } catch { return false; }
}

export async function backgroundState() {
  const reg = await registration();
  if (!reg || !('periodicSync' in reg)) return 'no';
  try { return (await reg.periodicSync.getTags()).includes(SYNC_TAG) ? 'si' : 'no'; } catch { return 'no'; }
}

// Calcula los avisos, los guarda para el service worker y programa los de las próximas horas.
export async function scheduleReminders(s) {
  timers.forEach(clearTimeout);
  timers = [];
  const list = notifyStatus() === 'granted' ? buildReminders(s, new Date()) : [];
  try { await kvSet(KEY, { items: list, updated: Date.now() }); } catch { /* sin IndexedDB */ }
  if (!list.length) return list;
  const sent = await sentSet();
  const now = Date.now();
  for (const r of list) {
    if (sent.has(r.id)) continue;
    const wait = r.at - now;
    if (wait > 26 * 60 * 60 * 1000) continue;
    timers.push(setTimeout(async () => {
      if ((await sentSet()).has(r.id)) return;
      if (await showNow(r)) markSent(r.id);
    }, Math.max(0, wait)));
  }
  return list;
}

let debounce = null;
export function startNotifications(getState, onChange) {
  if (typeof window === 'undefined') return;
  const run = () => { clearTimeout(debounce); debounce = setTimeout(() => scheduleReminders(getState()), 1500); };
  run();
  onChange(run);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
  // Una vez por hora se recalcula (el día cambia, se pagan cosas, se cumplen misiones).
  setInterval(run, 60 * 60 * 1000);
}

export async function testNotification() {
  return showNow({ id: `prueba-${Date.now()}`, title: 'Así se verán tus avisos', body: 'Astra te avisará de tus pagos, tus metas y el cierre del día.', url: '#/ajustes', tag: 'astra-prueba' });
}
