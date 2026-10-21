// Lector de texto en el teléfono (OCR, 1.10) para recibos y comprobantes: Tesseract.js en español, sin IA ni clave.
// Sus archivos están en ocr/ junto a la app; se cargan la primera vez que se usan (unos 6 MB) y después funcionan
// sin internet. La imagen se pasa a grises con más contraste (y se invierte si es de fondo oscuro) antes de leerla.
const BASE = 'ocr/';
const CORE_SIMD = 'tesseract-core-simd-lstm.wasm.js';
// Teléfonos sin WebAssembly SIMD (muy viejos): el núcleo sin SIMD, del CDN.
const CORE_NO_SIMD = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0/tesseract-core-lstm.wasm.js';
const IDLE_MS = 90000;

let libPromise = null;
let workerPromise = null;
let idleTimer = null;
let onProgress = null;

const abs = (p) => new URL(p, document.baseURI).href;

export function ocrSupported() {
  return typeof window !== 'undefined' && typeof WebAssembly === 'object' && typeof Worker === 'function' && typeof document !== 'undefined';
}

function simdOK() {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch {
    return false;
  }
}

function loadLib() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = abs(`${BASE}tesseract.min.js`);
      sc.async = true;
      sc.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error('ocr-missing')));
      sc.onerror = () => reject(new Error('ocr-missing'));
      document.head.appendChild(sc);
    }).catch((e) => { libPromise = null; throw e; });
  }
  return libPromise;
}

// Mensajes de avance en español: { label, pct }.
function report(m) {
  if (!onProgress || !m) return;
  const st = String(m.status || '');
  const p = typeof m.progress === 'number' ? m.progress : 0;
  if (/core/.test(st)) onProgress({ label: 'Preparando el lector (la primera vez tarda un poco)…', pct: 0.05 + p * 0.25 });
  else if (/traineddata|language/.test(st)) onProgress({ label: 'Cargando el español…', pct: 0.3 + p * 0.2 });
  else if (/initializ/.test(st)) onProgress({ label: 'Preparando el lector…', pct: 0.5 });
  else if (/recogniz/.test(st)) onProgress({ label: 'Leyendo el texto…', pct: 0.55 + p * 0.45 });
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const T = await loadLib();
      const w = await T.createWorker('spa', 1, {
        workerPath: abs(`${BASE}worker.min.js`),
        corePath: simdOK() ? abs(`${BASE}${CORE_SIMD}`) : CORE_NO_SIMD,
        langPath: abs(BASE).replace(/\/$/, ''),
        cacheMethod: 'write',
        logger: report,
        errorHandler: () => {},
      });
      // Un bloque de texto que se lee línea por línea (así el monto queda en la misma línea que su etiqueta),
      // sin juntar los espacios entre columnas.
      await w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
      return w;
    })().catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

// Grises, contraste estirado (percentiles 2 y 98) e inversión si el fondo es oscuro (capturas en modo oscuro).
export function prepForOCR(source, maxSide = 2000) {
  const w0 = source.width || source.naturalWidth;
  const h0 = source.height || source.naturalHeight;
  const k = Math.min(2, maxSide / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * k));
  c.height = Math.max(1, Math.round(h0 * k));
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(source, 0, 0, c.width, c.height);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const v = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0;
    d[i] = v;
    hist[v] += 1;
    sum += v;
  }
  const n = c.width * c.height;
  const dark = sum / n < 110;
  let lo = 0; let hi = 255; let acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.02) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.02) { hi = v; break; } }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    let v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span | 0));
    if (dark) v = 255 - v;
    d[i] = v; d[i + 1] = v; d[i + 2] = v;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Lee el texto de una imagen (bitmap, imagen o canvas). `progress({ label, pct })` informa el avance.
export async function readText(source, progress = null) {
  if (!ocrSupported()) throw new Error('ocr-unsupported');
  clearTimeout(idleTimer);
  onProgress = progress;
  try {
    if (progress) progress({ label: 'Preparando el lector…', pct: 0.02 });
    const w = await getWorker();
    const canvas = prepForOCR(source);
    const { data } = await w.recognize(canvas);
    if (progress) progress({ label: 'Listo', pct: 1 });
    return { text: (data && data.text) || '', confidence: (data && data.confidence) || 0 };
  } finally {
    onProgress = null;
    idleTimer = setTimeout(stopOCR, IDLE_MS);
  }
}

// Para cancelar una lectura (o liberar memoria): apaga el lector; la próxima vez se vuelve a preparar.
export async function stopOCR() {
  clearTimeout(idleTimer);
  const p = workerPromise;
  workerPromise = null;
  if (!p) return;
  try { (await p).terminate(); } catch { /* ya estaba apagado */ }
}

export function ocrErrorText(e) {
  const m = String((e && e.message) || e || '');
  if (/unsupported/.test(m)) return 'Este navegador no puede leer el texto de las fotos. Llena los datos a mano.';
  if (/missing|Failed to fetch|NetworkError|network|load/i.test(m)) return 'No pude cargar el lector de texto. La primera vez necesita internet (unos 6 MB); después funciona sin conexión.';
  return 'No pude leer el texto de la foto. Prueba con otra más nítida o llena los datos a mano.';
}
