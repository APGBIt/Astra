// Construye Astra: un solo HTML con todo dentro, más los archivos para instalarla como app.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, cpSync } from 'node:fs';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const DEV = process.argv.includes('--dev');
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
  define: { 'process.env.NODE_ENV': DEV ? '"development"' : '"production"' },
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
`);

writeFileSync('dist/LEEME.txt', `ASTRA · Tu vida en modo juego de rol
====================================

Esta carpeta es la app completa. Funciona en el navegador y se instala en el celular.
Tus datos se guardan solo en tu teléfono.

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
`);

// Copia para GitHub Pages (se publica la carpeta docs/).
rmSync('docs', { recursive: true, force: true });
cpSync('dist', 'docs', { recursive: true, filter: (src) => !basename(src).startsWith('_') });
writeFileSync('docs/.nojekyll', '');

if (existsSync('astra-web.zip')) rmSync('astra-web.zip');
try { execSync("cd dist && zip -qr ../astra-web.zip . -x '_*'"); } catch { /* sin zip */ }
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log('dist/index.html', kb(full.length), '| artifact', kb(fragment.length), '| js', kb(js.length));
