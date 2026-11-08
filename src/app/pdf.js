// Lector de PDF (1.17) para tus análisis: pdf.js de Mozilla (licencia Apache 2.0), en la carpeta pdf/ junto a la app.
// Se descarga la primera vez que abres un PDF (unos 1.9 MB) y queda guardado para usar sin internet.
// El PDF no sale del teléfono: se lee aquí mismo. Si el PDF es una imagen escaneada, se dibuja cada página para
// el lector de texto (OCR).
const BASE = 'pdf/';
let libPromise = null;

const abs = (p) => new URL(p, document.baseURI).href;

export function pdfSupported() {
  return typeof window !== 'undefined' && typeof Worker === 'function' && typeof document !== 'undefined';
}

function loadLib() {
  if (!libPromise) {
    // La dirección se arma en el momento: así el empaquetador no intenta meter pdf.js dentro de la app.
    const url = abs(`${BASE}pdf.min.mjs`);
    libPromise = import(/* webpackIgnore: true */ url)
      .then((m) => { m.GlobalWorkerOptions.workerSrc = abs(`${BASE}pdf.worker.min.mjs`); return m; })
      .catch((e) => { libPromise = null; throw e; });
  }
  return libPromise;
}

// Junta los pedazos de texto de una página en líneas, de arriba abajo y de izquierda a derecha.
// Un espacio grande entre columnas se deja como tres espacios (así el valor no se pega al rango).
export function linesOf(items) {
  const rows = [];
  for (const it of items || []) {
    if (!it || typeof it.str !== 'string' || !it.str.trim()) continue;
    const tr = it.transform || [1, 0, 0, 1, 0, 0];
    const x = tr[4]; const y = tr[5];
    const h = Math.abs(tr[3]) || it.height || 8;
    let row = null;
    for (const r of rows) if (Math.abs(r.y - y) <= Math.max(2, Math.min(r.h, h) * 0.45)) { row = r; break; }
    if (!row) { row = { y, h, parts: [] }; rows.push(row); }
    row.parts.push({ x, w: Number(it.width) || 0, s: it.str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    r.parts.sort((a, b) => a.x - b.x);
    let line = ''; let end = null;
    for (const p of r.parts) {
      if (end != null) { const gap = p.x - end; line += gap > r.h * 1.2 ? '   ' : gap > r.h * 0.12 && !/\s$/.test(line) && !/^\s/.test(p.s) ? ' ' : ''; }
      line += p.s;
      end = p.x + p.w;
    }
    return line.replace(/\s+$/, '');
  }).filter(Boolean).join('\n');
}

// El texto de un PDF (hasta 10 páginas). `scanned`: casi sin texto (es una imagen); usa pdfPageImages para el OCR.
export async function pdfText(file, progress = null) {
  if (!pdfSupported()) throw new Error('pdf-unsupported');
  if (progress) progress({ label: 'Preparando el lector de PDF (la primera vez tarda un poco)…', pct: 0.05 });
  const pdfjs = await loadLib();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true, wasmUrl: abs(`${BASE}wasm/`), useWasm: true }).promise;
  const n = Math.min(doc.numPages, 10);
  const out = [];
  for (let i = 1; i <= n; i++) {
    if (progress) progress({ label: `Leyendo la página ${i} de ${n}…`, pct: 0.1 + (0.85 * i) / n });
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    out.push(linesOf(tc.items));
    page.cleanup();
  }
  const text = out.join('\n');
  return { text, pages: doc.numPages, doc, scanned: text.replace(/\s/g, '').length < 40 * n };
}

// Las páginas como imágenes (para un PDF escaneado), hasta 4.
export async function pdfPageImages(doc, max = 4, scale = 2) {
  const out = [];
  for (let i = 1; i <= Math.min(doc.numPages, max); i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    out.push(c);
    page.cleanup();
  }
  return out;
}

export function pdfErrorText(e) {
  const m = String((e && (e.name || e.message)) || e || '');
  if (/Password/i.test(m)) return 'Ese PDF tiene contraseña. Ábrelo, cópialo sin contraseña o toma una captura.';
  if (/unsupported/.test(m)) return 'Este navegador no puede leer PDF. Toma una captura de pantalla del resultado.';
  if (/Invalid|Format|Corrupt/i.test(m)) return 'No pude abrir ese PDF. Prueba con otra copia o con una captura.';
  return 'No pude cargar el lector de PDF. La primera vez necesita internet (unos 1.9 MB); después funciona sin conexión.';
}
