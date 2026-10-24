// Astra · caché para usar sin conexión (no guarda datos personales)
const CACHE = 'astra-5c87035160';
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
// El lector de texto (ocr/) vive en su propia caché: no se vuelve a descargar con cada versión de la app.
const OCR = 'astra-ocr-1';
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== OCR).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put('./index.html', cp)); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  if (url.origin === location.origin && url.pathname.includes('/ocr/')) {
    e.respondWith(caches.open(OCR).then((c) => c.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }))));
    return;
  }
  if (url.origin === location.origin || url.host.endsWith('fonts.googleapis.com') || url.host.endsWith('fonts.gstatic.com')) {
    e.respondWith(caches.match(req).then((hit) => {
      const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); } return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});

// Avisos (1.8): la app deja guardados los de hoy y mañana; aquí se muestran los que ya tocan
// cuando el sistema despierta al service worker (sincronización periódica) o cuando la app lo pide.
function kv(mode, fn) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('astra', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const t = req.result.transaction('kv', mode);
      const r = fn(t.objectStore('kv'));
      t.oncomplete = () => resolve(r && r.result);
      t.onerror = () => reject(t.error);
    };
  });
}
async function dueReminders() {
  const box = await kv('readonly', (st) => st.get('reminders')).catch(() => null);
  const sent = new Set((await kv('readonly', (st) => st.get('remindersSent')).catch(() => null)) || []);
  const now = Date.now();
  const due = ((box && box.items) || []).filter((r) => r.at <= now && r.at > now - 6 * 60 * 60 * 1000 && !sent.has(r.id));
  for (const r of due) {
    await self.registration.showNotification(r.title, { body: r.body, tag: r.tag || r.id, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: r.url || '#/' }, lang: 'es' });
    sent.add(r.id);
  }
  if (due.length) await kv('readwrite', (st) => st.put([...sent].slice(-300), 'remindersSent')).catch(() => {});
}
self.addEventListener('periodicsync', (e) => { if (e.tag === 'astra-avisos') e.waitUntil(dueReminders()); });
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '#/', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) {
      if ('focus' in c) { if ('navigate' in c) c.navigate(url).catch(() => {}); return c.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
