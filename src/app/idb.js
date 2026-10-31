// IndexedDB mínimo: un almacén de claves (estado común de la sincronización) y otro de fotos.
const DB = 'astra';
const VERSION = 1;
let opening = null;

function open() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Sin IndexedDB')); return; }
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  opening.catch(() => { opening = null; });
  return opening;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const st = t.objectStore(store);
    let out;
    const r = fn(st);
    if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const kvGet = (k) => tx('kv', 'readonly', (st) => st.get(k));
export const kvSet = (k, v) => tx('kv', 'readwrite', (st) => st.put(v, k));
// Varias claves en una sola transacción (o se guardan todas o ninguna).
export const kvSetMany = (entries) => tx('kv', 'readwrite', (st) => { let r = null; for (const [k, v] of entries) r = st.put(v, k); return r; });
export const kvDel = (k) => tx('kv', 'readwrite', (st) => st.delete(k));
export const photoGet = (id) => tx('photos', 'readonly', (st) => st.get(id));
export const photoPut = (rec) => tx('photos', 'readwrite', (st) => st.put(rec));
export const photoDel = (id) => tx('photos', 'readwrite', (st) => st.delete(id));
export const photoKeys = () => tx('photos', 'readonly', (st) => st.getAllKeys());
