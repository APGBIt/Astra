// Leer códigos con la cámara (2.0): QR de las etiquetas de Astra y códigos de barras de productos.
// Si el navegador trae su propio lector (Chrome en Android), se usa ese: es rápido y lee códigos de barras.
// Si no (iPhone, computadoras), los QR se leen aquí mismo con jsQR (qr/jsqr.min.js, unos 130 KB que se
// descargan la primera vez que hacen falta); los códigos de barras no.

let jsqrPromise = null;
function loadJsQR() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (!jsqrPromise) {
    jsqrPromise = new Promise((resolve) => {
      const sc = document.createElement('script');
      sc.src = new URL('qr/jsqr.min.js', document.baseURI).href;
      sc.async = true;
      sc.onload = () => resolve(window.jsQR || null);
      sc.onerror = () => { jsqrPromise = null; resolve(null); };
      document.head.appendChild(sc);
    });
  }
  return jsqrPromise;
}

const FORMATS = ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
let detector;

async function nativeDetector() {
  if (detector !== undefined) return detector;
  detector = null;
  try {
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      const have = await window.BarcodeDetector.getSupportedFormats();
      const use = FORMATS.filter((f) => have.includes(f));
      if (use.includes('qr_code')) detector = { d: new window.BarcodeDetector({ formats: use }), products: use.some((f) => f.startsWith('ean') || f.startsWith('upc')) };
    }
  } catch { detector = null; }
  return detector;
}

// ¿Se pueden leer códigos de barras de productos en este teléfono?
export async function canScanProducts() {
  const n = await nativeDetector();
  return !!(n && n.products);
}

const boxOf = (pts) => {
  const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
  const x = Math.min(...xs); const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

// Los códigos que se ven en un cuadro de video (o imagen). Coordenadas en píxeles del cuadro.
// Devuelve [{ raw, kind: 'qr' | 'barras', box: { x, y, w, h }, pts }].
export async function detectCodes(source, canvas) {
  const w = source.videoWidth || source.naturalWidth || source.width;
  const h = source.videoHeight || source.naturalHeight || source.height;
  if (!w || !h) return [];
  const n = await nativeDetector();
  if (n) {
    try {
      const found = await n.d.detect(source);
      return found.filter((c) => c.rawValue).map((c) => {
        const pts = (c.cornerPoints || []).map((p) => ({ x: p.x, y: p.y }));
        const box = pts.length >= 3 ? boxOf(pts) : { x: c.boundingBox.x, y: c.boundingBox.y, w: c.boundingBox.width, h: c.boundingBox.height };
        return { raw: String(c.rawValue), kind: c.format === 'qr_code' ? 'qr' : 'barras', box, pts };
      });
    } catch { /* si el lector del navegador falla con este cuadro, se intenta con el propio */ }
  }
  if (!canvas) return [];
  // El lector propio trabaja sobre una copia pequeña del cuadro (más rápido y suficiente para un QR).
  const scale = Math.min(1, 640 / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale)); const ch = Math.max(1, Math.round(h * scale));
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, cw, ch);
  let img;
  try { img = ctx.getImageData(0, 0, cw, ch); } catch { return []; }
  const jsQR = await loadJsQR();
  if (!jsQR) return [];
  const r = jsQR(img.data, cw, ch, { inversionAttempts: 'dontInvert' });
  if (!r || !r.data) return [];
  const l = r.location;
  const pts = [l.topLeftCorner, l.topRightCorner, l.bottomRightCorner, l.bottomLeftCorner].map((p) => ({ x: p.x / scale, y: p.y / scale }));
  return [{ raw: r.data, kind: 'qr', box: boxOf(pts), pts }];
}
