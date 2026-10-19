// Construye Astra: un solo HTML con todo dentro, más los archivos para instalarla como app.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, cpSync } from 'node:fs';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const DEV = process.argv.includes('--dev');
const PKG = JSON.parse(readFileSync('package.json', 'utf8'));
const out = await build({
  entryPoints: ['src/main.jsx'],
  bundle: true,
  minify: !DEV,
  format: 'iife',
  target: ['es2020', 'safari14', 'chrome90'],
  jsx: 'automatic',
  jsxImportSource: 'preact',
  write: false,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': DEV ? '"development"' : '"production"', __APP_VERSION__: JSON.stringify(PKG.version) },
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync('src/styles.css', 'utf8');
const minCss = DEV ? css : css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s*/g, '\n').replace(/\n+/g, '\n');

const FONTS = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Figtree:wght@400;500;600;700&display=swap';
const TITLE = 'Astra';
const DESC = 'Tu vida en modo juego de rol: vitalidad, energía, caminos, misiones y jefes para crecer en seis áreas de la vida.';

const body = `<div id="astra"></div>
<noscript><p style="padding:24px;font-family:system-ui">Astra necesita JavaScript para funcionar.</p></noscript>
<script>${js}</script>`;

mkdirSync('dist/icons', { recursive: true });
mkdirSync('artifact', { recursive: true });

const full = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${TITLE}</title>
<meta name="description" content="${DESC}">
<meta name="theme-color" content="#FAFAF7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#111214" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Astra">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>
:root{padding-top:env(safe-area-inset-top,0px)}
${minCss}
</style>
</head>
<body>
${body}
</body>
</html>
`;
writeFileSync('dist/index.html', full);

// Versión para la vista previa en Claude (sin doctype, head ni body propios).
const fragment = `<title>${TITLE}</title>
<link rel="stylesheet" href="${FONTS}">
<style>
${minCss}
</style>
${body}
`;
writeFileSync('artifact/astra.html', fragment);

writeFileSync('dist/manifest.webmanifest', JSON.stringify({
  name: 'Astra · Crece en modo juego',
  short_name: 'Astra',
  description: DESC,
  lang: 'es',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#FAFAF7',
  theme_color: '#FAFAF7',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  shortcuts: [
    { name: 'Nuevo pendiente', url: './#/pendientes/nuevo' },
    { name: 'Nueva misión', url: './#/mision/nueva' },
    { name: 'Registrar', url: './#/registrar' },
    { name: 'Escanear recibo', url: './#/recibo' },
  ],
}, null, 2));

const iconSvg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="${pad ? 0 : 120}" fill="#141519"/>
<g transform="translate(256 256) scale(${pad ? 0.72 : 0.95}) translate(-256 -256)">
<path d="M256 88l37 107 107 37-107 37-37 107-37-107-107-37 107-37z" fill="#F0B93A"/>
<circle cx="380" cy="132" r="22" fill="#FAFAF7"/>
</g>
</svg>`;
writeFileSync('dist/icons/icon.svg', iconSvg(false));
const sharp = (await import('sharp')).default;
await sharp(Buffer.from(iconSvg(false))).resize(192, 192).png().toFile('dist/icons/icon-192.png');
await sharp(Buffer.from(iconSvg(false))).resize(512, 512).png().toFile('dist/icons/icon-512.png');
await sharp(Buffer.from(iconSvg(true))).resize(512, 512).png().toFile('dist/icons/icon-maskable-512.png');
await sharp(Buffer.from(iconSvg(true))).resize(180, 180).png().toFile('dist/icons/apple-touch-icon.png');

// Service worker: funciona sin conexión después de la primera visita.
const version = createHash('sha1').update(full).digest('hex').slice(0, 10);
writeFileSync('dist/sw.js', `// Astra · caché para usar sin conexión (no guarda datos personales)
const CACHE = 'astra-${version}';
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put('./index.html', cp)); return r; }).catch(() => caches.match('./index.html')));
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
`);

writeFileSync('dist/LEEME.txt', `ASTRA · Tu vida en modo juego de rol
====================================

Esta carpeta es la app completa. Funciona en el navegador y se instala en el celular.
Tus datos se guardan en tu teléfono y, si lo conectas, en tu propio Google Drive.

1) PROBARLA EN LA COMPUTADORA
   Abre index.html con Google Chrome o Microsoft Edge.

2) PUBLICARLA CON TU PROPIO ENLACE (gratis)
   GitHub Pages: sube el proyecto a un repositorio y activa Pages sobre la carpeta docs/.
   Netlify: entra en https://app.netlify.com/drop y arrastra ESTA carpeta.

3) INSTALARLA EN EL CELULAR
   Android (Chrome): menú ⋮ → «Instalar app».
   iPhone (Safari): Compartir → «Agregar a inicio».

4) LECTURA DE RECIBOS CON IA
   Personaje → Ajustes → Lectura con IA. Lo más seguro es el servidor propio (carpeta server/).

5) TUS DATOS
   Personaje → Ajustes → «Descargar copia» para guardar tu progreso o pasarlo a otro teléfono.

6) SINCRONIZAR CON TU DRIVE
   Personaje → Ajustes → Sincronización. Cada persona conecta su propio Drive:
   con el conector propio (un script en su Drive) o con «Conectar con Google».
   El código del conector está en conector.gs/ (se abre en el navegador para copiarlo).
`);

// Código del conector propio (Apps Script): una página para verlo y copiarlo (…/conector.gs/).
const { CONNECTOR_CODE, CONNECTOR_VERSION } = await import('./src/app/connector.js');
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
rmSync('dist/conector.gs', { recursive: true, force: true });
mkdirSync('dist/conector.gs', { recursive: true });
writeFileSync('dist/conector.gs/index.html', `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Conector de Astra</title>
<style>
:root { --bg: #f7f6f2; --surface: #ffffff; --ink: #17181c; --muted: #5d6068; --line: #e2e0d8; --accent: #17181c; --on-accent: #ffffff; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --bg: #121316; --surface: #1c1d22; --ink: #f1f0ec; --muted: #a4a6ad; --line: #2e3037; --accent: #f1f0ec; --on-accent: #121316; color-scheme: dark; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 880px; margin: 0 auto; padding: 28px 16px 48px; display: flex; flex-direction: column; gap: 16px; }
h1 { font-size: 26px; line-height: 1.2; margin: 0; }
p { margin: 0; color: var(--muted); }
ol { margin: 0; padding-left: 22px; display: flex; flex-direction: column; gap: 6px; }
button { align-self: flex-start; min-height: 44px; padding: 0 18px; border: 0; border-radius: 22px; background: var(--accent); color: var(--on-accent); font: inherit; font-weight: 700; cursor: pointer; }
button:focus-visible { outline: 3px solid var(--ink); outline-offset: 3px; }
pre { margin: 0; padding: 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; overflow: auto; max-height: 70vh; font: 12.5px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre; }
#ok { color: var(--muted); font-size: 14px; min-height: 1.5em; }
</style>
</head>
<body>
<main>
<h1>Conector de Astra para tu Drive</h1>
<p>Versión ${CONNECTOR_VERSION}. Cada persona lo instala en su propia cuenta de Google, y sus datos de Astra quedan en su Drive.</p>
<ol>
<li>Copia el código con el botón.</li>
<li>Pégalo en Apps Script (en tu hoja «Base de datos de Astra»: Extensiones → Apps Script; o en un proyecto nuevo de script.google.com) y guarda.</li>
<li>Implementar → Nueva implementación → Aplicación web. Ejecutar como: Yo. Quién tiene acceso: Cualquier usuario.</li>
<li>Copia la URL que termina en /exec y pégala en Astra → Ajustes → Sincronización → Conector propio.</li>
</ol>
<button type="button" id="copy">Copiar el código</button>
<span id="ok" role="status"></span>
<pre id="code">${esc(CONNECTOR_CODE)}</pre>
</main>
<script>
document.getElementById('copy').addEventListener('click', async function () {
  var code = document.getElementById('code');
  var ok = document.getElementById('ok');
  try { await navigator.clipboard.writeText(code.textContent); ok.textContent = 'Código copiado.'; }
  catch (e) { var r = document.createRange(); r.selectNodeContents(code); var s = getSelection(); s.removeAllRanges(); s.addRange(r); ok.textContent = 'Selecciona y copia el código (Ctrl + C).'; }
});
</script>
</body>
</html>
`);

// Copia para GitHub Pages (se publica la carpeta docs/).
rmSync('docs', { recursive: true, force: true });
cpSync('dist', 'docs', { recursive: true, filter: (src) => !basename(src).startsWith('_') });
writeFileSync('docs/.nojekyll', '');

if (existsSync('astra-web.zip')) rmSync('astra-web.zip');
try { execSync("cd dist && zip -qr ../astra-web.zip . -x '_*'"); } catch { /* sin zip */ }
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log('dist/index.html', kb(full.length), '| artifact', kb(fragment.length), '| js', kb(js.length));
