// Lector pequeño de Excel (.xlsx) sin librerías: abre el zip, lee las hojas y devuelve sus filas.
// `inflateRaw(bytes)` descomprime «deflate»: en el navegador usa DecompressionStream; en las pruebas, zlib.

const td = new TextDecoder();

export async function browserInflate(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no puede abrir archivos de Excel. Guárdalo como .csv.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ¿Qué es este archivo? «xlsx» (zip), «xls» (Excel antiguo), «html» (tabla web con otro nombre), «pdf» o «text».
export function sniff(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'xlsx';
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'xls';
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
  const head = td.decode(b.slice(0, 2048)).toLowerCase();
  if (/<(html|table|!doctype)/.test(head)) return 'html';
  return 'text';
}

// ----- Zip -----

function unzipEntries(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('El archivo de Excel está dañado.');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = new Map();
  for (let k = 0; k < count; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true);
    const elen = v.getUint16(p + 30, true);
    const clen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = td.decode(bytes.slice(p + 46, p + 46 + nlen));
    const ln = v.getUint16(local + 26, true);
    const le = v.getUint16(local + 28, true);
    const start = local + 30 + ln + le;
    out.set(name.replace(/^\//, ''), { method, data: bytes.subarray(start, start + csize) });
    p += 46 + nlen + elen + clen;
  }
  return out;
}

async function readEntry(entries, name, inflateRaw) {
  const e = entries.get(name) || entries.get(name.replace(/^xl\//, 'xl/'));
  if (!e) return null;
  if (e.method === 0) return td.decode(e.data);
  if (e.method === 8) return td.decode(await inflateRaw(e.data));
  throw new Error('El archivo de Excel usa una compresión que no conozco.');
}

// ----- XML -----

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function unescapeXml(t) {
  return String(t).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e.toLowerCase()] ?? m;
  });
}
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`)); return m ? unescapeXml(m[1]) : null; };
const textOf = (xml) => unescapeXml((xml.match(/<t\b[^>]*>[\s\S]*?<\/t>|<t\b[^>]*\/>/g) || []).map((t) => t.replace(/^<t\b[^>]*>|<\/t>$|^<t\b[^>]*\/>$/g, '')).join(''));

function colIndex(ref) {
  const letters = (ref.match(/^[A-Z]+/) || [''])[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// Formatos de número que son fechas (los de Excel y los propios con d, m o y).
const DATE_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
function isDateCode(code) {
  const c = String(code || '').replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').toLowerCase();
  return /[dy]/.test(c) || /(^|[^a-z])m{1,4}([^a-z]|$)/.test(c) && /[/\-.]/.test(c);
}
function dateStyles(stylesXml) {
  if (!stylesXml) return new Set();
  const custom = {};
  for (const m of stylesXml.matchAll(/<numFmt\b[^>]*>/g)) custom[attr(m[0], 'numFmtId')] = attr(m[0], 'formatCode');
  const xfs = (stylesXml.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/) || [''])[0];
  const out = new Set();
  let i = 0;
  for (const m of xfs.matchAll(/<xf\b[^>]*?(?:\/>|>)/g)) {
    const id = Number(attr(m[0], 'numFmtId') || 0);
    if (DATE_IDS.has(id) || (custom[id] && isDateCode(custom[id]))) out.add(i);
    i += 1;
  }
  return out;
}

const pad = (n) => String(n).padStart(2, '0');
// Número de serie de Excel → «AAAA-MM-DD» (y la hora si la trae).
export function excelDate(serial) {
  const ms = Math.round((Number(serial) - 25569) * 86400000);
  const d = new Date(ms);
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const frac = Number(serial) % 1;
  return frac > 0.0001 ? `${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : day;
}

function parseSheet(xml, shared, dates) {
  const rows = [];
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(attr(`<row ${rm[1] || ''}>`, 'r')) || rows.length + 1;
    const cells = [];
    for (const cm of (rm[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = `<c ${cm[1]}>`;
      const ref = attr(tag, 'r');
      const idx = ref ? colIndex(ref) : cells.length;
      const t = attr(tag, 't');
      const s = Number(attr(tag, 's') || -1);
      const inner = cm[2] || '';
      const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
      const raw = vm ? unescapeXml(vm[1]) : null;
      let val = null;
      if (t === 's') val = raw != null ? shared[Number(raw)] ?? '' : '';
      else if (t === 'inlineStr') val = textOf(inner);
      else if (t === 'str' || t === 'e') val = raw ?? '';
      else if (t === 'b') val = raw === '1';
      else if (t === 'd') val = raw;
      else if (raw != null && raw !== '') {
        const n = Number(raw);
        val = Number.isFinite(n) ? (dates.has(s) && n > 0 ? excelDate(n) : n) : raw;
      }
      cells[idx] = val;
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = null;
    rows[r - 1] = cells;
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

// → [{ name, hidden, rows: [[celda, …], …] }]. Las fechas con formato de fecha llegan como «AAAA-MM-DD».
export async function readXlsx(input, inflateRaw = browserInflate) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const entries = unzipEntries(bytes);
  const wb = await readEntry(entries, 'xl/workbook.xml', inflateRaw);
  if (!wb) throw new Error('Ese archivo no es un libro de Excel.');
  const relsXml = (await readEntry(entries, 'xl/_rels/workbook.xml.rels', inflateRaw)) || '';
  const rels = {};
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) rels[attr(m[0], 'Id')] = attr(m[0], 'Target');
  const sharedXml = (await readEntry(entries, 'xl/sharedStrings.xml', inflateRaw)) || '';
  const shared = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)].map((m) => textOf(m[1] || ''));
  const dates = dateStyles(await readEntry(entries, 'xl/styles.xml', inflateRaw));
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], 'name');
    const rid = attr(m[0], 'r:id') || attr(m[0], 'id');
    let target = rels[rid] || '';
    target = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const xml = await readEntry(entries, target, inflateRaw);
    if (xml == null) continue;
    sheets.push({ name, hidden: /hidden/.test(attr(m[0], 'state') || ''), rows: parseSheet(xml, shared, dates) });
  }
  return sheets;
}

// Tabla de una página web guardada como «.xls» (algunos bancos la descargan así) → filas.
export function readHtmlTable(text) {
  const rows = [];
  for (const tr of String(text).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => unescapeXml(c[1].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ')).replace(/\s+/g, ' ').trim());
    if (cells.length) rows.push(cells);
  }
  return rows;
}
