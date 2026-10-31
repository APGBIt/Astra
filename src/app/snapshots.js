// Puntos de restauración: copias completas de tus datos guardadas en este teléfono (IndexedDB).
// Se hace una al empezar cada día y otra antes de cada acción que reemplaza o borra datos
// (recuperar una copia, borrar todo, juntar con Drive, volver a un punto). Así un toque equivocado
// o un error de la app no te hace perder nada, aunque no uses Drive.
import { kvGet, kvSet, kvDel } from './idb.js';
import { canGzip, gzip, gunzip } from './gz.js';
import { dayKey, addDays, diffDays, weekday } from './dates.js';

const INDEX = 'snaps';

export const SNAP_REASONS = {
  dia: 'Copia del día',
  importar: 'Antes de recuperar una copia',
  borrar: 'Antes de borrar todo',
  drive: 'Antes de juntar con Drive',
  volver: 'Antes de volver a un punto',
  rescate: 'Datos que no se pudieron abrir',
  manual: 'Guardado por ti',
};

const weekOf = (day) => addDays(day, -((weekday(day) + 6) % 7));

// Qué puntos se quedan (función pura):
// - copia del día: la más reciente de cada uno de los últimos 7 días y una por semana de las 4 semanas anteriores;
// - antes de algo que reemplaza o borra: las de los últimos 30 días, hasta 8;
// - datos que no se pudieron abrir: 90 días;
// - nunca más de 20 en total.
export function keepSnaps(list, today) {
  const sorted = [...list].filter((x) => x && x.id && x.day).sort((a, b) => b.at - a.at);
  const keep = new Set();
  const days = new Set();
  const weeks = new Set();
  let events = 0;
  for (const x of sorted) {
    const age = diffDays(x.day, today);
    if (age < 0) { keep.add(x.id); continue; } // reloj del teléfono cambiado: no se borra
    if (x.reason === 'dia') {
      if (age < 7) { if (!days.has(x.day)) { days.add(x.day); keep.add(x.id); } } else if (age < 35) {
        const w = weekOf(x.day);
        if (!weeks.has(w)) { weeks.add(w); keep.add(x.id); }
      }
    } else if (x.reason === 'rescate') {
      if (age <= 90) keep.add(x.id);
    } else if (age <= 30 && events < 8) {
      events += 1;
      keep.add(x.id);
    }
  }
  return sorted.filter((x) => keep.has(x.id)).slice(0, 20);
}

// Avisos de «hay un punto nuevo» (para que Ajustes muestre la lista al día).
const subs = new Set();
export function onSnap(fn) { subs.add(fn); return () => subs.delete(fn); }
const emit = () => subs.forEach((f) => { try { f(); } catch { /* */ } });

let queue = Promise.resolve();
const serial = (fn) => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; };

export async function listSnaps() {
  const idx = await kvGet(INDEX).catch(() => null);
  return Array.isArray(idx) ? [...idx].sort((a, b) => b.at - a.at) : [];
}

// Guarda un punto con el texto completo de tus datos. `oncePerDay`: si ya hay uno con ese motivo hoy, no repite.
export function takeSnap(reason, text, summary = null, { oncePerDay = false, now = Date.now() } = {}) {
  return serial(async () => {
    if (!text) return null;
    const day = dayKey(new Date(now));
    const idx = await listSnaps();
    if (oncePerDay && idx.some((x) => x.reason === reason && x.day === day)) return null;
    const id = `s${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    let body = text;
    let enc = '';
    if (canGzip()) {
      try { body = await gzip(text); enc = 'gzip'; } catch { body = text; enc = ''; }
    }
    await kvSet(`snap:${id}`, { enc, body });
    const rec = { id, at: now, day, reason: SNAP_REASONS[reason] ? reason : 'dia', size: text.length, stored: enc ? body.length : text.length, summary };
    const all = [rec, ...idx];
    const kept = keepSnaps(all, day);
    const ids = new Set(kept.map((x) => x.id));
    await kvSet(INDEX, kept);
    for (const x of all) if (!ids.has(x.id)) await kvDel(`snap:${x.id}`).catch(() => {});
    emit();
    return rec;
  });
}

export async function readSnap(id) {
  const r = await kvGet(`snap:${id}`);
  if (!r) throw new Error('Ese punto de restauración ya no está en este teléfono.');
  return r.enc === 'gzip' ? gunzip(r.body) : String(r.body);
}

export function dropSnap(id) {
  return serial(async () => {
    const idx = await listSnaps();
    await kvSet(INDEX, idx.filter((x) => x.id !== id));
    await kvDel(`snap:${id}`).catch(() => {});
  });
}
