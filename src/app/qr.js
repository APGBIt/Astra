// Generador de códigos QR (2.0), para las etiquetas inteligentes: se imprimen y se pegan en la casa.
// Hecho aquí mismo, sin bibliotecas: modo de bytes (UTF-8), corrección de errores nivel M, versiones 1 a 10
// (hasta 213 bytes: de sobra para la dirección de una etiqueta). Norma ISO/IEC 18004.

// [bloques, bytes de datos por bloque] por grupo, y bytes de corrección por bloque (nivel M).
const VERSIONS = [
  null,
  { ec: 10, groups: [[1, 16]] },
  { ec: 16, groups: [[1, 28]] },
  { ec: 26, groups: [[1, 44]] },
  { ec: 18, groups: [[2, 32]] },
  { ec: 24, groups: [[2, 43]] },
  { ec: 16, groups: [[4, 27]] },
  { ec: 18, groups: [[4, 31]] },
  { ec: 22, groups: [[2, 38], [2, 39]] },
  { ec: 22, groups: [[3, 36], [2, 37]] },
  { ec: 26, groups: [[4, 43], [1, 44]] },
];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const dataBytes = (v) => VERSIONS[v].groups.reduce((a, [n, k]) => a + n * k, 0);
export const QR_MAX_BYTES = dataBytes(10) - 3;

// ---------- Reed-Solomon sobre GF(256) ----------
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsGenerator(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= mul(g[j], EXP[i]); }
    g = next;
  }
  return g; // g[0] = 1 (el término de mayor grado)
}

export function rsRemainder(data, n) {
  const g = rsGenerator(n);
  const rem = new Array(n).fill(0);
  for (const b of data) {
    const f = b ^ rem.shift();
    rem.push(0);
    for (let i = 0; i < n; i++) rem[i] ^= mul(g[i + 1], f);
  }
  return rem;
}

// ---------- Datos → palabras de código ----------
function utf8(text) {
  if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(String(text)));
  return Array.from(unescape(encodeURIComponent(String(text)))).map((c) => c.charCodeAt(0));
}

export function qrVersionFor(nBytes) {
  for (let v = 1; v <= 10; v++) if (nBytes <= dataBytes(v) - (v >= 10 ? 3 : 2)) return v;
  return 0;
}

function codewords(bytes, v) {
  const cap = dataBytes(v);
  const bits = [];
  const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); // modo de bytes
  put(bytes.length, v >= 10 ? 16 : 8);
  for (const b of bytes) put(b, 8);
  for (let i = 0; i < 4 && bits.length < cap * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < cap; pad ^= 0xec ^ 0x11) data.push(pad);
  // Bloques, su corrección y el entrelazado.
  const { ec, groups } = VERSIONS[v];
  const blocks = [];
  let at = 0;
  for (const [n, k] of groups) for (let i = 0; i < n; i++) { const d = data.slice(at, at + k); at += k; blocks.push({ d, e: rsRemainder(d, ec) }); }
  const out = [];
  const longest = Math.max(...blocks.map((b) => b.d.length));
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < ec; i++) for (const b of blocks) out.push(b.e[i]);
  return out;
}

// ---------- La matriz ----------
const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function formatBits(mask) {
  const data = (0 << 3) | mask; // nivel M = 00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function build(v, cw, mask) {
  const size = 17 + 4 * v;
  const m = Array.from({ length: size }, () => new Uint8Array(size));
  const fn = Array.from({ length: size }, () => new Uint8Array(size));
  const set = (x, y, dark) => { if (x >= 0 && y >= 0 && x < size && y < size) { m[y][x] = dark ? 1 : 0; fn[y][x] = 1; } };
  // Patrones de posición, sincronía y alineación.
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, d !== 2 && d !== 4); }
  }
  const al = ALIGN[v];
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // Formato (dos copias) y versión (desde la 7).
  const fb = formatBits(mask);
  const bit = (val, i) => ((val >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) set(8, i, bit(fb, i));
  set(8, 7, bit(fb, 6)); set(8, 8, bit(fb, 7)); set(7, 8, bit(fb, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(fb, i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(fb, i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(fb, i));
  set(8, size - 8, true);
  if (v >= 7) {
    let rem = v;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const vb = (v << 12) | rem;
    for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3); const b = Math.floor(i / 3); set(a, b, bit(vb, i)); set(b, a, bit(vb, i)); }
  }
  // Datos en zigzag, con la máscara.
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const up = ((right + 1) & 2) === 0;
        const y = up ? size - 1 - vert : vert;
        if (fn[y][x]) continue;
        const dark = k < cw.length * 8 ? ((cw[k >>> 3] >>> (7 - (k & 7))) & 1) === 1 : false;
        k += 1;
        m[y][x] = (dark !== MASKS[mask](x, y)) ? 1 : 0;
      }
    }
  }
  return m;
}

// Qué tan difícil de leer queda con una máscara (las cuatro reglas de la norma).
function penalty(m) {
  const n = m.length;
  let p = 0;
  const line = (get) => {
    for (let a = 0; a < n; a++) {
      let run = 1;
      for (let b = 1; b < n; b++) {
        if (get(a, b) === get(a, b - 1)) { run += 1; if (run === 5) p += 3; else if (run > 5) p += 1; } else run = 1;
      }
      for (let b = 0; b + 10 < n; b++) {
        const s = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => get(a, b + i)).join('');
        if (s === '10111010000' || s === '00001011101') p += 40;
      }
    }
  };
  line((y, x) => m[y][x]);
  line((x, y) => m[y][x]);
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
  let dark = 0;
  for (const row of m) for (const c of row) dark += c;
  p += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return p;
}

// La matriz del código: `rows[y][x]` es 1 si el módulo es oscuro. null si el texto no cabe.
export function qrMatrix(text) {
  const bytes = utf8(text);
  const v = qrVersionFor(bytes.length);
  if (!v) return null;
  const cw = codewords(bytes, v);
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const m = build(v, cw, mask);
    const p = penalty(m);
    if (!best || p < best.p) best = { m, p, mask };
  }
  return { version: v, size: best.m.length, mask: best.mask, rows: best.m };
}

// El código como SVG (con su margen blanco de 4 módulos). Siempre negro sobre blanco: así lo lee cualquier cámara.
export function qrSvg(text, { margin = 4, size = 200, title = '' } = {}) {
  const q = qrMatrix(text);
  if (!q) return '';
  const n = q.size + margin * 2;
  let d = '';
  for (let y = 0; y < q.size; y++) {
    let x = 0;
    while (x < q.size) {
      if (!q.rows[y][x]) { x += 1; continue; }
      let w = 1;
      while (x + w < q.size && q.rows[y][x + w]) w += 1;
      d += `M${x + margin} ${y + margin}h${w}v1h-${w}z`;
      x += w;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img"${title ? ` aria-label="${String(title).replace(/"/g, '&quot;')}"` : ''}><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
