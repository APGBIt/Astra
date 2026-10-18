// Fotos (recibos, documentos del expediente, evidencias de logros). Se guardan en el teléfono
// y, si sincronizas, se suben a tu Drive (carpeta «Astra/Fotos»). En los datos solo va su id.
import { act, getState } from './store.js';
import { photoGet, photoPut, photoDel } from './idb.js';
import { downloadPhoto } from './sync.js';
import { uid } from '../game/logic.js';

export const PHOTO_FOLDERS = { recibo: 'Recibos', expediente: 'Expediente', logro: 'Logros', otra: 'Otras' };

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ img, url }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

// Reduce la foto (lado mayor 1600 px, JPEG) para que pese poco y suba rápido.
async function shrink(file, max, quality) {
  const { img, url } = await loadImage(file);
  try {
    const w0 = img.naturalWidth || img.width;
    const h0 = img.naturalHeight || img.height;
    const k = Math.min(1, max / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * k));
    const h = Math.max(1, Math.round(h0 * k));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
    return { blob: blob || file, w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

let persistAsked = false;
function keepStorage() {
  if (persistAsked) return;
  persistAsked = true;
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch { /* no disponible */ }
}

export async function addPhoto(file, { kind = 'otra', desc = '' } = {}) {
  const full = await shrink(file, 1600, 0.82);
  const thumb = await shrink(file, 360, 0.7);
  const id = `p${uid()}`;
  await photoPut({ id, blob: full.blob, thumb: thumb.blob, mime: 'image/jpeg', w: full.w, h: full.h, size: full.blob.size, created: Date.now() });
  act((st, t) => {
    if (!st.photos) st.photos = {};
    st.photos[id] = { kind, folder: PHOTO_FOLDERS[kind] || 'Otras', day: t, w: full.w, h: full.h, size: full.blob.size, desc: String(desc).slice(0, 120), remote: null, added: Date.now() };
  });
  keepStorage();
  return id;
}

export function removePhoto(id) {
  act((st) => {
    const p = st.photos && st.photos[id];
    if (!p) return;
    if (p.remote) p.deleted = true; else delete st.photos[id];
  });
  photoDel(id).catch(() => {});
  forget(id);
}

const cache = new Map();
function forget(id) {
  for (const k of [`${id}:t`, `${id}:f`]) { const u = cache.get(k); if (u) { URL.revokeObjectURL(u); cache.delete(k); } }
}

// Dirección para mostrar la foto. Si no está en este teléfono pero sí en Drive, se descarga.
export async function photoURL(id, thumb = false) {
  const k = `${id}:${thumb ? 't' : 'f'}`;
  if (cache.has(k)) return cache.get(k);
  let rec = await photoGet(id).catch(() => null);
  let blob = rec && (thumb && rec.thumb ? rec.thumb : rec.blob);
  if (!blob) {
    const meta = (getState().photos || {})[id];
    if (!meta || !meta.remote) return null;
    blob = await downloadPhoto(id).catch(() => null);
    if (!blob) return null;
  }
  const u = URL.createObjectURL(blob);
  cache.set(k, u);
  return u;
}
