// Tus análisis de laboratorio (1.17), como Advanced Labs Uploads de WHOOP, Vision Cloud de Ultrahuman o los
// Health Records de Bevel: subes el PDF, la foto o el texto de tus resultados, Astra separa cada prueba con su
// valor, su unidad y el rango de tu laboratorio, tú lo revisas y queda tu historial con tendencias.
//
// Privacidad: los informes traen tu nombre, cédula, fecha de nacimiento y médico. Esas líneas se descartan antes de
// leer (y antes de mandar algo a la IA); solo se guardan las pruebas, la fecha y el laboratorio.
import { addDays, diffDays } from '../app/dates.js';
import { datesIn } from './scan.js';
import { uid, gainXP, getDay, addTodo, checkAchievements } from './logic.js';
import { LAB_MARKERS, LAB_MARKER, LAB_GROUPS, LAB_GROUP, SUPP_CHECK, SUPP_CHECK_DAYS } from './labcatalog.js';
import { nutrientOf } from './nutrients.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const txt = (v, n = 80) => String(v == null ? '' : v).trim().slice(0, n);
// El rango como texto, sin cortar un número a la mitad: «… 130 - 159» y no «… 130 - 15».
const refText = (v, n = 90) => {
  const t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s:;,·-]+$/, '')}…`;
};
const fin = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const r3 = (v) => Math.round(v * 1000) / 1000;

// Minúsculas, sin tildes y con la µ como «u»: así se comparan nombres y unidades.
export const plain = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[µμ]/g, 'u').toLowerCase();

// ---------- Números, unidades y rangos ----------

// «5,2» y «5.2» → 5.2; «7,500» y «250,000» → miles; «1.234,5» → 1234.5.
export function numOf(raw) {
  let t = String(raw || '').replace(/\s/g, '');
  if (!t) return null;
  const hasDot = t.includes('.'); const hasComma = t.includes(',');
  if (hasDot && hasComma) {
    if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(/,/g, '');
  } else if (hasComma) {
    t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  } else if ((t.match(/\./g) || []).length > 1) {
    t = t.replace(/\./g, '');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Unidades al inicio de un texto ya simplificado (minúsculas, µ → u). [unidad, expresión].
const UNITS = [
  ['mL/min/1.73 m²', /^ml\s*\/\s*min(\s*\/\s*1[.,]73\s*m?\s*(2|²)?)?/],
  ['mg/dL', /^mg\s*\/\s*d\s*l/],
  ['g/dL', /^gr?s?\s*\/\s*d\s*l/],
  ['mg/L', /^mg\s*\/\s*l(?![a-z])/],
  ['g/L', /^g\s*\/\s*l(?![a-z])/],
  ['mg/g', /^mg\s*\/\s*g(?![a-z])/],
  ['mmol/mol', /^mmol\s*\/\s*mol/],
  ['mmol/L', /^mmol\s*\/\s*l/],
  ['µmol/L', /^(u|mc)mol\s*\/\s*l/],
  ['nmol/L', /^nmol\s*\/\s*l/],
  ['pmol/L', /^pmol\s*\/\s*l/],
  ['mEq/L', /^meq\s*\/\s*l/],
  ['µUI/mL', /^(u|mc)\s*(ui|iu|u)\s*\/\s*ml/],
  ['mUI/mL', /^m\s*(ui|iu|u)\s*\/\s*ml/],
  ['mUI/L', /^m\s*(ui|iu|u)\s*\/\s*l(?![a-z])/],
  ['UI/mL', /^(ui|iu)\s*\/\s*ml/],
  ['U/L', /^(u|ui|iu)\s*\/\s*l(?![a-z])/],
  ['ng/mL', /^ng\s*\/\s*ml/],
  ['ng/dL', /^ng\s*\/\s*dl/],
  ['pg/mL', /^pg\s*\/\s*ml/],
  ['µg/dL', /^(u|mc)g\s*\/\s*dl/],
  ['µg/L', /^(u|mc)g\s*\/\s*l(?![a-z])/],
  ['x10⁶/µL', /^(x\s*)?10\s*(\^|e|\*\*)?\s*(6|⁶)\s*\/\s*(u|m)?\s*l|^mill(on|ones)\s*(\/|x|por)\s*(u|mm)/],
  ['x10³/µL', /^(x\s*)?10\s*(\^|e|\*\*)?\s*(3|³)\s*\/\s*(u|m)?\s*l|^miles?\s*(\/|x|por)\s*(u|mm)|^k\s*\/\s*ul/],
  ['/mm³', /^(\/|x|por)\s*mm\s*(3|³)|^(cel|celulas)\s*\/\s*mm|^mm\s*(3|³)/],
  ['mm/h', /^mm\s*\/\s*h/],
  ['fL', /^fl(?![a-z])/],
  ['pg', /^pg(?![a-z/])/],
  ['%', /^%/],
  ['seg', /^seg(undos)?(?![a-z])/],
];
// Para el formulario: las que más se usan.
export const COMMON_UNITS = ['mg/dL', 'g/dL', '%', 'ng/mL', 'pg/mL', 'µUI/mL', 'U/L', 'mEq/L', 'mmol/L', 'x10³/µL', 'x10⁶/µL', 'fL', 'pg', 'mg/L', 'µg/dL', 'mm/h', 'mL/min/1.73 m²'];

export function unitAt(text) {
  const t = plain(text).replace(/^\s+/, '');
  for (const [u, re] of UNITS) { const m = t.match(re); if (m) return { unit: u, len: (text.length - text.replace(/^\s+/, '').length) + m[0].length }; }
  return null;
}
export const unitOf = (text) => { const u = unitAt(text); return u ? u.unit : ''; };

const NUM = '\\d+(?:[.,]\\d+)*';
const TWO = new RegExp(`(?:^|[^\\d.,])(${NUM})\\s*(?:-|–|—|a|al|hasta)\\s*(${NUM})(?![\\d.,]*\\s*(?:anos|ano|a\\b))`);
const LT = new RegExp(`(?:<\\s*=?|≤|menor\\s+(?:de|que|a)|menos\\s+de|inferior\\s+a|hasta)\\s*(${NUM})`);
const GT = new RegExp(`(?:>\\s*=?|≥|mayor\\s+(?:de|que|a)|mas\\s+de|superior\\s+a|desde)\\s*(${NUM})(?!\\s*(?:anos|ano)\\b)`);

// «70 - 100», «De 3,80 a 5,80», «< 200», «Mayor de 40», «Hasta 150». Devuelve { lo, hi, lx, hx } (lx/hx: sin incluir).
// Si el informe trae varias categorías («Óptimo: <100 Casi óptimo: 100-129…»), se usa la deseable.
// Si trae rangos de hombre y de mujer, se usa el que elegiste (o ninguno, si no elegiste).
// «H: 13.5 - 17.5  M: 12.0 - 15.5» (hombre y mujer) o «F: … M: …» (female y male).
function sexMarks(t) {
  if (/\bh\s*:/.test(t) && /\bm\s*:/.test(t)) return { f: /\bm\s*:/, m: /\bh\s*:/ };
  if (/\bf\s*:/.test(t) && /\bm\s*:/.test(t)) return { f: /\bf\s*:/, m: /\bm\s*:/ };
  const f = /(mujer(es)?|femenino|fem\.)/; const m = /(hombre(s)?|masculino|masc\.|varon(es)?)/;
  return f.test(t) && m.test(t) ? { f, m } : null;
}
const BEST = /(optimo|deseable|normal|ideal|recomendado|adecuado|saludable)\s*:?\s*/;
const NEXT_CAT = /(casi|limite|limitrofe|alto|elevado|bajo|riesgo|moderado|muy|intermedio|deficien|insuficien|toxic)/;

function rangeIn(t) {
  const two = t.match(TWO);
  if (two) {
    const a = numOf(two[1]); const b = numOf(two[2]);
    if (a != null && b != null && b > a) return { lo: a, hi: b, lx: false, hx: false };
  }
  const lt = t.match(LT);
  if (lt) { const b = numOf(lt[1]); if (b != null) return { lo: null, hi: b, lx: false, hx: (/</.test(lt[0]) && !/=/.test(lt[0])) || /menor|menos|inferior/.test(lt[0]) }; }
  const gt = t.match(GT);
  if (gt) { const a = numOf(gt[1]); if (a != null) return { lo: a, hi: null, lx: (/>/.test(gt[0]) && !/=/.test(gt[0])) || /mayor|mas de|superior/.test(gt[0]), hx: false }; }
  return null;
}

export function parseRange(raw, { sex = '' } = {}) {
  let t = plain(raw).replace(/\s+/g, ' ');
  const sx = sexMarks(t);
  if (sx) {
    if (sex !== 'f' && sex !== 'm') return null;
    const me = (sex === 'f' ? sx.f : sx.m).exec(t);
    const other = sex === 'f' ? sx.m : sx.f;
    let part = t.slice(me.index + me[0].length);
    const o = other.exec(part);
    if (o) part = part.slice(0, o.index);
    return rangeIn(part);
  }
  const b = BEST.exec(t);
  if (b) {
    let part = t.slice(b.index + b[0].length);
    const n = NEXT_CAT.exec(part);
    if (n && n.index > 0) part = part.slice(0, n.index);
    const r = rangeIn(part);
    if (r) return r;
  }
  return rangeIn(t);
}

export function rangeText(it) {
  if (!it) return '';
  const f = (n) => fmtNum(n);
  if (it.lo != null && it.hi != null) return `${f(it.lo)} – ${f(it.hi)}`;
  if (it.hi != null) return `${it.hx ? 'menos de' : 'hasta'} ${f(it.hi)}`;
  if (it.lo != null) return `${it.lx ? 'más de' : 'desde'} ${f(it.lo)}`;
  return '';
}
export const fmtNum = (n) => (n == null ? '' : Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('en-US') : String(r3(n)));

// ---------- Encontrar la prueba ----------

const COMPILED = LAB_MARKERS.map((m) => ({ m, res: m.al.map((a) => new RegExp(`^(?:${a})(?![a-z])`)) }));

// La prueba con la que empieza una línea (la coincidencia más larga: «colesterol hdl» antes que «colesterol»).
export function matchMarker(line) {
  const t = plain(line).replace(/^[\s+*•·|:>\-–—.]+/, '').replace(/^\d{4,}\s*[-–—]?\s*/, '');
  let best = null; let len = 0;
  for (const { m, res } of COMPILED) for (const re of res) { const x = t.match(re); if (x && x[0].length > len) { best = m; len = x[0].length; } }
  return best ? { marker: best, len, rest: t.slice(len) } : null;
}
// Para un nombre suelto (lo que escribió la IA o la persona).
export const markerFor = (name) => { const r = matchMarker(name); return r ? r.marker : null; };

// Líneas con datos personales: no se leen ni se mandan a la IA.
const PERSONAL = /\b(cedula|ced\s*\/\s*pas|ced\.|pasaporte|paciente|nombre|sr\s*\(a\)|sra?\.\s|fec(ha)?\.?\s*(de\s*)?nac|nacimiento|edad\s*:|sexo|genero|telefono|tel\.|celular|direccion|correo|e-?mail|medico|doctor|\bdra?\.\s|solicitado por|referido|\bars\b|seguro medico|afiliado|poliza|record|expediente|historia clinica)/;
export const isPersonal = (line) => PERSONAL.test(plain(line));
// Encabezados y notas que no son pruebas.
const NOT_TEST = /^(resultado|resultados|unidad|unidades|valores?( de)? referencia|valor(es)? normal|rango|prueba|pruebas|analisis|examen|metodo|pagina|fecha|hora|muestra|toma|laboratorio|informe|nota|observacion|comentario|firma|autorizado|validado|impreso|interpretacion|tipo de muestra|departamento|seccion|bioquimica|hematologia|quimica|inmunologia|hormonas|perfil|panel)\b/;
const QUAL = /\b(negativo|positivo|no reactivo|reactivo|normal|trazas|ausente|presente|no detectado|detectado)\b/;
const METHOD = /^(enzimatico|colorimetrico|calculado|calculada|cinetico|inmunoensayo|quimioluminiscencia|electroquimioluminiscencia|clia|eclia|cmia|hplc|turbidimetrico|automatizado|ise|directo|indirecto|espectrofotometria|citometria|impedancia|suero|plasma|sangre total)\b/;

const cleanRest = (rest) => {
  let r = rest.replace(/^[\s:()\-–.,]+/, '');
  for (let i = 0; i < 3; i++) { const m = r.match(METHOD); if (!m) break; r = r.slice(m[0].length).replace(/^[\s:()\-–.,]+/, ''); }
  return r;
};

// Lee lo que viene después del nombre: valor, unidad, rango y marca (H, L, *).
function readValues(rest, sex = '') {
  const r = cleanRest(rest);
  const out = { value: null, text: '', unit: '', range: null, flag: null, op: '', ref: '' };
  const vm = r.match(new RegExp(`^(\\*?\\s*)([<>]=?|≤|≥)?\\s*(${NUM})`)) || r.match(new RegExp(`(?:^|\\s)([<>]=?|≤|≥)?\\s*(${NUM})`));
  if (!vm) {
    const q = r.match(QUAL);
    if (q) { out.text = q[1].charAt(0).toUpperCase() + q[1].slice(1); return out; }
    return null;
  }
  const isFirst = vm.index === 0 || /^\*/.test(vm[0]);
  const op = isFirst ? vm[2] : vm[1];
  const numStr = isFirst ? vm[3] : vm[2];
  const at = vm.index + vm[0].length;
  // Si el primer número empieza un rango («70 - 100 mg/dL 92»), el valor es el número que sigue al rango.
  const after = r.slice(at);
  if (!op && /^\s*(-|–|a\s)\s*\d/.test(after) && !/^\s*-\s*\d+(\.\d+)?\s*(-|–)/.test(after)) {
    const rg = parseRange(r.slice(vm.index), { sex });
    const tail = r.slice(at).replace(/^\s*(-|–|a)\s*\d+(?:[.,]\d+)*/, '');
    const v2 = tail.match(new RegExp(`(?:^|\\s)(${NUM})`));
    if (rg && v2) {
      out.value = numOf(v2[1]);
      out.range = rg;
      const u = unitAt(tail.replace(new RegExp(`.*?${v2[1].replace('.', '\\.')}`), ''));
      out.unit = (u && u.unit) || unitOf(tail) || '';
      return out.value == null ? null : out;
    }
  }
  out.value = numOf(numStr);
  if (out.value == null) return null;
  out.op = op ? (op.startsWith('<') || op === '≤' ? '<' : '>') : '';
  if (/^\*|\*\s*$/.test(vm[0]) || /^\s*\*/.test(after)) out.flag = 'fuera';
  let tail = after;
  const fl = tail.match(/^\s*(\*|h|l|a|b|↑|↓|alto|bajo|elevado|disminuido)(?![a-z0-9])/);
  if (fl) {
    const f = fl[1];
    out.flag = /^(h|a|↑|alto|elevado)$/.test(f) ? 'alto' : /^(l|b|↓|bajo|disminuido)$/.test(f) ? 'bajo' : 'fuera';
    tail = tail.slice(fl[0].length);
  }
  const u = unitAt(tail);
  if (u) { out.unit = u.unit; tail = tail.slice(u.len); }
  out.range = parseRange(tail, { sex });
  if (/\d/.test(tail)) out.ref = tail.replace(/^[\s:()\-–.,*]+|[\s()]+$/g, '').slice(0, 200);
  if (!out.unit) out.unit = unitAfterRange(tail);
  if (!out.flag) { const f2 = tail.match(/(?:^|\s)(\*|↑|↓)(?:\s|$)/); if (f2) out.flag = f2[1] === '↑' ? 'alto' : f2[1] === '↓' ? 'bajo' : 'fuera'; }
  return out;
}

// «0.50 - 0.90 mg/dL»: la unidad viene después del rango.
function unitAfterRange(tail) {
  const t = plain(tail);
  const m = t.match(new RegExp(`(?:${NUM})\\s*(?:-|–|a|al|hasta)?\\s*(?:${NUM})?\\s*(.*)$`));
  if (!m) return '';
  return unitOf(m[1]) || '';
}

// Una línea → una prueba, o null. Las que no están en el catálogo se guardan como «otras» si traen unidad o rango.
export function parseLabLine(line, { sex = '' } = {}) {
  if (!line || line.length < 3 || isPersonal(line)) return null;
  const hit = matchMarker(line);
  if (hit) {
    const v = readValues(hit.rest, sex);
    if (!v || (v.value == null && !v.text)) return null;
    v.ref = origSlice(line, v.ref);
    return finishItem({ key: hit.marker.key, name: hit.marker.name, raw: line.trim().slice(0, 140), ...v });
  }
  // Sin catálogo: «NOMBRE  12.3  unidad  rango».
  const t = plain(line).replace(/^[\s+*•·|:>\-–—.]+/, '');
  if (NOT_TEST.test(t)) return null;
  const m = t.match(new RegExp(`^([a-z][a-z0-9 ()/.,'-]{2,48}?)\\s+(\\*?\\s*[<>]?=?\\s*${NUM})\\s*(.*)$`));
  if (!m) return null;
  const name = m[1].trim();
  if ((name.match(/[a-z]/g) || []).length < 3 || /\d{4,}/.test(name) || NOT_TEST.test(name)) return null;
  const v = readValues(`${m[2]} ${m[3]}`, sex);
  if (!v || v.value == null || (!v.unit && !v.range)) return null;
  v.ref = origSlice(line, v.ref);
  const orig = line.replace(/^[\s+*•·|:>\-–—.]+/, '').slice(0, name.length).trim();
  return finishItem({ key: null, name: titleCase(orig || name), raw: line.trim().slice(0, 140), ...v });
}

// El rango como está escrito en el informe (con sus mayúsculas y tildes).
function origSlice(line, ref) {
  if (!ref) return '';
  const pl = plain(line);
  const i = pl.lastIndexOf(ref);
  return i >= 0 && pl.length === line.length ? line.slice(i, i + ref.length) : ref;
}

const titleCase = (t) => (t === t.toUpperCase() ? t.toLowerCase().replace(/(^|\s|\()([a-záéíóúñü])/g, (x, a, b) => a + b.toUpperCase()) : t).replace(/\s+/g, ' ');

function finishItem(it) {
  const marker = it.key ? LAB_MARKER[it.key] : null;
  let key = it.key;
  let name = it.name;
  let unit = it.unit || '';
  // Conteos en %: neutrófilos 55 % no es lo mismo que neutrófilos 3.4 ×10³/µL.
  if (marker && marker.abs && unit === '%') { key = `${marker.key}_pct`; name = `${marker.name} (%)`; }
  // Leucocitos 7500 sin unidad: son por mm³.
  if (marker && !unit && marker.conv && marker.conv['/mm³'] && it.value >= 1000) unit = '/mm³';
  const out = { id: uid(), key, name: txt(name, 60), value: it.value, text: txt(it.text, 30), unit, raw: it.raw || '' };
  if (it.op) out.op = it.op;
  if (it.range) Object.assign(out, { lo: it.range.lo, hi: it.range.hi, lx: !!it.range.lx, hx: !!it.range.hx });
  if (it.flag) out.flag = it.flag;
  if (it.ref) out.ref = refText(it.ref);
  return out;
}

const MONTH_WORDS = /(fecha|f\.)\s*(de\s*)?(toma|muestra|extraccion|recoleccion|obtencion)/;
const DATE_RANK = [
  [/(toma|muestra|extraccion|recoleccion|obtencion)/, 1],
  [/(recepcion|registro|ingreso|orden|fact)/, 2],
  [/(emision|impresion|reporte|resultado|validacion|entrega|informe|fecha)/, 3],
];

// La fecha de la muestra (o, si no está, la del informe). Nunca la de nacimiento.
export function labDate(lines, today = null) {
  let best = null; let rank = 9;
  for (const line of lines) {
    const p = plain(line);
    if (/nac/.test(p)) continue;
    const ds = datesIn(line).filter((d) => d >= '2000-01-01' && (!today || d <= today));
    if (!ds.length) continue;
    const r = (DATE_RANK.find(([re]) => re.test(p)) || [null, 4])[1];
    if (r < rank) { best = ds[0]; rank = r; }
    if (MONTH_WORDS.test(p)) break;
  }
  return best;
}

// Laboratorios que más se ven en la República Dominicana (y cualquier línea que diga «laboratorio»).
const LABS = [
  [/amadita/, 'Laboratorio Amadita'],
  [/referencia laboratorio|laboratorio( clinico)? referencia|^referencia\b/, 'Referencia Laboratorio Clínico'],
  [/patria rivas/, 'Laboratorio Patria Rivas'],
  [/cedimat/, 'CEDIMAT'],
  [/plaza de la salud|hgps/, 'Hospital General Plaza de la Salud'],
  [/union medica/, 'Unión Médica del Norte'],
  [/corazones unidos/, 'Corazones Unidos'],
  [/hospiten/, 'Hospiten'],
  [/homs/, 'HOMS'],
  [/quest diagnostics/, 'Quest Diagnostics'],
  [/labcorp/, 'Labcorp'],
];
export function labName(lines) {
  for (const line of lines.slice(0, 40)) {
    const p = plain(line);
    for (const [re, name] of LABS) if (re.test(p)) return name;
  }
  for (const line of lines.slice(0, 15)) {
    const p = plain(line);
    if (/laboratorio|lab\.|centro (medico|de diagnostico)|clinica|hospital/.test(p) && !isPersonal(line) && !/resultado|valores|referencia de/.test(p)) return txt(line.replace(/\s+/g, ' '), 60);
  }
  return '';
}

// Todo el texto (de la foto, del PDF o pegado) → { day, lab, items, personal }.
export function parseLabText(text, today = null, { sex = '' } = {}) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map((l) => l.replace(/[ \t]/g, ' ').replace(/[–—]/g, '-').trim()).filter(Boolean);
  const items = [];
  const seen = new Set();
  let personal = 0;
  for (const line of lines) {
    if (isPersonal(line)) { personal += 1; continue; }
    const it = parseLabLine(line, { sex });
    if (!it) continue;
    const k = `${it.key || plain(it.name)}|${it.value}|${it.text}`;
    if (seen.has(k)) continue;
    seen.add(k);
    items.push(it);
    if (items.length >= 120) break;
  }
  return { day: labDate(lines, today), lab: labName(lines), items, personal, lines: lines.length };
}

// El texto sin las líneas personales (para la IA).
export const safeLabText = (text) => String(text || '').split('\n').filter((l) => !isPersonal(l)).join('\n').slice(0, 6000);

// ---------- Unidades y estado ----------

// Pasa un valor a la unidad del catálogo. null si no se puede (unidad distinta y sin conversión).
export function toStd(marker, value, unit) {
  if (value == null || !marker) return value;
  if (!unit || unit === marker.u) return value;
  const f = marker.conv && marker.conv[unit];
  if (f == null) return null;
  return r3(typeof f === 'function' ? f(value) : value * f);
}
const markerOfItem = (it) => (it && it.key ? LAB_MARKER[String(it.key).replace(/_pct$/, '')] || null : null);

// ¿Está en rango? Primero el rango de tu laboratorio; si no lo trae, la marca del informe; si tampoco, la guía.
// { st: 'ok' | 'atento' | 'alto' | 'bajo' | 'fuera' | 'sin', label, src: 'lab' | 'marca' | 'guia' | '' }
export function itemStatus(it) {
  if (!it || (it.value == null && !it.text)) return { st: 'sin', label: 'Sin dato', src: '' };
  if (it.value == null) {
    const pos = /^(positivo|reactivo|presente|detectado)/i.test(it.text);
    return { st: pos ? 'fuera' : 'sin', label: it.text, src: pos ? 'marca' : '' };
  }
  const v = it.value;
  const hasRange = it.lo != null || it.hi != null;
  if (hasRange) {
    if (it.lo != null && (it.lx ? v <= it.lo : v < it.lo) && !(it.op === '>')) return { st: 'bajo', label: 'Bajo', src: 'lab' };
    if (it.hi != null && (it.hx ? v >= it.hi : v > it.hi) && !(it.op === '<')) return { st: 'alto', label: 'Alto', src: 'lab' };
    return { st: 'ok', label: 'En rango', src: 'lab' };
  }
  if (it.flag) return { st: it.flag === 'alto' ? 'alto' : it.flag === 'bajo' ? 'bajo' : 'fuera', label: it.flag === 'alto' ? 'Alto' : it.flag === 'bajo' ? 'Bajo' : 'Fuera de rango', src: 'marca' };
  const m = markerOfItem(it);
  if (m && m.guide && !String(it.key).endsWith('_pct')) {
    const std = toStd(m, v, it.unit);
    if (std != null) {
      const cut = m.guide.cuts.find(([top]) => std < top) || m.guide.cuts[m.guide.cuts.length - 1];
      return { st: cut[1], label: cut[2], src: 'guia', guide: m.guide.src };
    }
  }
  return { st: 'sin', label: 'Sin rango', src: '' };
}
export const isOut = (st) => st === 'alto' || st === 'bajo' || st === 'fuera';
export const STATUS_TONE = { ok: 'good', atento: 'xp', alto: 'vit', bajo: 'vit', fuera: 'vit', sin: '' };

// ---------- Estado de la app ----------

const SOURCES = ['foto', 'pdf', 'texto', 'manual', 'ia'];

function normItem(x) {
  if (!isObj(x)) return null;
  const name = txt(x.name, 60);
  const value = fin(x.value);
  const text = txt(x.text, 30);
  if (!name || (value == null && !text)) return null;
  const key = x.key && (LAB_MARKER[x.key] || (String(x.key).endsWith('_pct') && LAB_MARKER[String(x.key).replace(/_pct$/, '')])) ? String(x.key) : null;
  const out = { id: String(x.id || uid()), key, name, value, text, unit: txt(x.unit, 20) };
  const lo = fin(x.lo); const hi = fin(x.hi);
  if (lo != null) out.lo = lo;
  if (hi != null) out.hi = hi;
  if (lo != null && hi != null && hi < lo) { out.lo = hi; out.hi = lo; }
  if (x.lx) out.lx = true;
  if (x.hx) out.hx = true;
  if (x.op === '<' || x.op === '>') out.op = x.op;
  if (x.flag === 'alto' || x.flag === 'bajo' || x.flag === 'fuera') out.flag = x.flag;
  if (x.ref) out.ref = refText(x.ref);
  return out;
}

function normPanel(p) {
  if (!isObj(p) || !p.id || !isDay(p.day)) return null;
  const items = (Array.isArray(p.items) ? p.items : []).map(normItem).filter(Boolean).slice(0, 150);
  if (!items.length) return null;
  return {
    id: String(p.id), day: p.day, lab: txt(p.lab, 60), note: txt(p.note, 300), items,
    source: SOURCES.includes(p.source) ? p.source : 'manual', created: Number(p.created) || 0,
    photos: Array.isArray(p.photos) ? p.photos.filter((x) => typeof x === 'string').slice(0, 6) : [],
  };
}

export function ensureLabs(s) {
  if (!Array.isArray(s.labs)) s.labs = [];
  s.labs = s.labs.map(normPanel).filter(Boolean).sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0)).slice(0, 300);
}

// Guardar un análisis. +15 XP de Vigor (hasta dos al día): cuidar tus chequeos también es avanzar.
export function addLabPanel(s, p, today, ev = []) {
  if (!Array.isArray(s.labs)) s.labs = [];
  const panel = normPanel({ ...p, id: uid(), day: isDay(p.day) && p.day <= today ? p.day : today, created: Date.now() });
  if (!panel) return null;
  s.labs.push(panel);
  s.labs.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  const d = getDay(s, today);
  d.labs = (d.labs || 0) + 1;
  if (d.labs <= 2) gainXP(s, 'salud', 15, today, ev);
  checkAchievements(s, today, ev);
  return panel;
}

export function updateLabPanel(s, id, p) {
  const i = (s.labs || []).findIndex((x) => x.id === id);
  if (i < 0) return null;
  const next = normPanel({ ...s.labs[i], ...p, id });
  if (!next) return null;
  s.labs[i] = next;
  s.labs.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  return next;
}

export function removeLabPanel(s, id) {
  s.labs = (s.labs || []).filter((x) => x.id !== id);
}

// La clave con la que se agrupa una prueba en el historial (las que no están en el catálogo, por su nombre).
export const itemKey = (it) => it.key || `x:${plain(it.name).replace(/[^a-z0-9]+/g, ' ').trim()}`;

// Historial de una prueba, del más viejo al más nuevo, con el valor en la unidad del catálogo cuando se puede.
export function labHistory(s, key) {
  const out = [];
  for (const p of s.labs || []) {
    for (const it of p.items) {
      if (itemKey(it) !== key) continue;
      const m = markerOfItem(it);
      const std = m && !String(it.key).endsWith('_pct') ? toStd(m, it.value, it.unit) : it.value;
      out.push({ day: p.day, panel: p, it, value: it.value, std, unit: std != null && m && !String(it.key).endsWith('_pct') ? m.u : it.unit, status: itemStatus(it) });
    }
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

const groupOf = (it) => { const m = markerOfItem(it); return m ? m.group : 'otros'; };
const orderOf = (it) => { const i = LAB_MARKERS.findIndex((m) => it.key && (m.key === it.key || `${m.key}_pct` === it.key)); return i < 0 ? 999 : i + (String(it.key).endsWith('_pct') ? 0.5 : 0); };

// Lo último de cada prueba, por sistema, con cuántas están en rango (como el resumen de Labs de WHOOP).
export function labSummary(s) {
  const latest = new Map();
  for (const p of [...(s.labs || [])].sort((a, b) => (a.day < b.day ? -1 : 1))) for (const it of p.items) latest.set(itemKey(it), { it, day: p.day, panel: p });
  const counts = { ok: 0, atento: 0, fuera: 0, sin: 0 };
  const groups = new Map();
  for (const [key, x] of latest) {
    const st = itemStatus(x.it);
    const c = isOut(st.st) ? 'fuera' : st.st;
    counts[c] = (counts[c] || 0) + 1;
    const g = groupOf(x.it);
    if (!groups.has(g)) groups.set(g, []);
    const hist = labHistory(s, key);
    groups.get(g).push({ key, ...x, st, n: hist.length, prev: hist.length > 1 ? hist[hist.length - 2] : null, last: hist[hist.length - 1] });
  }
  const list = LAB_GROUPS.filter((g) => groups.has(g.key)).map((g) => ({ ...g, items: groups.get(g.key).sort((a, b) => orderOf(a.it) - orderOf(b.it)) }));
  const panels = [...(s.labs || [])];
  return { panels, last: panels[0] || null, counts, total: latest.size, groups: list, out: list.flatMap((g) => g.items.filter((x) => isOut(x.st.st))) };
}

// Cambio frente al análisis anterior (en la misma unidad).
export function trendOfItem(x) {
  if (!x || !x.prev || x.last.std == null || x.prev.std == null) return null;
  const d = x.last.std - x.prev.std;
  const base = Math.abs(x.prev.std) || 1;
  return { diff: d, pct: d / base, flat: Math.abs(d / base) < 0.03 };
}

// Sugerencias: revisar un suplemento a los 3 meses (vitamina D, hierro, B12, ácido fólico), llevar lo que salió
// fuera de rango a tu médico y, si hace más de un año, repetir el chequeo. Nunca dice qué tomar ni qué tienes.
export function labSuggestions(s, today) {
  const out = [];
  const sum = labSummary(s);
  for (const m of (s.meds || []).filter((x) => !x.archived)) {
    const n = nutrientOf(m.name);
    const mk = n && SUPP_CHECK[n.key];
    if (!mk || !m.start || diffDays(m.start, today) < SUPP_CHECK_DAYS) continue;
    const since = labHistory(s, mk).filter((h) => h.day >= m.start);
    if (since.length) continue;
    if (out.some((x) => x.marker === mk)) continue;
    out.push({ kind: 'supl', marker: mk, med: m.name, src: `lab:supl:${mk}:${m.start}`, text: `Llevas más de 3 meses con ${m.name}. Pregúntale a tu médico si toca medir tu ${LAB_MARKER[mk].name.toLowerCase()} para ver si te está ayudando.`, todo: `Preguntar al médico por un análisis de ${LAB_MARKER[mk].name.toLowerCase()}` });
  }
  if (sum.last && sum.out.length) {
    const src = `lab:med:${sum.last.id}`;
    if (!(s.todos || []).some((t) => t.src === src)) out.push({ kind: 'medico', src, text: `${sum.out.length === 1 ? 'Un resultado salió' : `${sum.out.length} resultados salieron`} fuera del rango de tu laboratorio. Llévalos a tu médico: solo él o ella puede decir qué significan para ti.`, todo: 'Llevar mis análisis al médico' });
  }
  if (sum.last && diffDays(sum.last.day, today) > 365) {
    const src = `lab:anual:${sum.last.id}`;
    if (!(s.todos || []).some((t) => t.src === src)) out.push({ kind: 'anual', src, text: `Tus últimos análisis son del ${sum.last.day.split('-').reverse().join('/')}. Si tu médico te los pide cada año, ya toca.`, todo: 'Agendar mis análisis de chequeo' });
  }
  return out;
}

// Convierte una sugerencia (o «repetir en N meses») en un pendiente de Salud.
export function labTodo(s, { title, src, due = null }, today) {
  if (src && (s.todos || []).some((t) => t.src === src && !t.done)) return null;
  const t = addTodo(s, { title, cat: 'salud', due: due || addDays(today, 7) }, today);
  if (t && src) t.src = src;
  return t;
}
export function repeatDue(day, months) {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, Math.min(d, 28)));
  return dt.toISOString().slice(0, 10);
}

// ---------- IA (opcional) ----------

// Se manda el texto sin las líneas personales. Con una foto, la IA ve la imagen completa: por eso, por defecto,
// Astra lee primero en el teléfono y la IA queda como «Mejorar con IA».
export function labPrompt(text = '') {
  return `Eres un lector de resultados de laboratorio clínico en español. ${text ? 'Este es el texto del informe (ya sin datos personales):\n"""\n' + text + '\n"""\n' : 'Lee la imagen del informe.'}
Devuelve SOLO este JSON:
{"fecha":"AAAA-MM-DD de la toma de la muestra (o del informe) o null","laboratorio":"nombre o null","resultados":[{"prueba":"nombre como aparece","valor":número o null,"texto":"resultado no numérico (Negativo, Positivo…) o null","unidad":"unidad o null","referencia":"rango de referencia como aparece o null","marca":"alto, bajo o null si el informe lo marca"}]}
Reglas: incluye todas las pruebas con resultado; usa punto decimal; no inventes rangos que no aparezcan; nunca incluyas nombre, cédula, edad, fecha de nacimiento, teléfono ni médico.`;
}

// La respuesta de la IA → las mismas pruebas que el lector del teléfono.
export function fromAI(raw, today = null, { sex = '' } = {}) {
  const res = (raw && Array.isArray(raw.resultados) ? raw.resultados : []).slice(0, 120);
  const items = [];
  for (const r of res) {
    if (!isObj(r)) continue;
    const name = txt(r.prueba, 60);
    if (!name || isPersonal(name)) continue;
    const marker = markerFor(name);
    const value = typeof r.valor === 'number' ? r.valor : numOf(r.valor);
    const text = value == null ? txt(r.texto, 30) : '';
    if (value == null && !text) continue;
    const unit = unitOf(String(r.unidad || '')) || txt(r.unidad, 20);
    const range = r.referencia ? parseRange(String(r.referencia), { sex }) : null;
    const flag = /alto|alta|high/i.test(r.marca || '') ? 'alto' : /bajo|baja|low/i.test(r.marca || '') ? 'bajo' : null;
    items.push(finishItem({ key: marker ? marker.key : null, name: marker ? marker.name : name, value, text, unit, range, flag, raw: name, ref: r.referencia ? String(r.referencia) : '' }));
  }
  const day = isDay(raw && raw.fecha) && (!today || raw.fecha <= today) ? raw.fecha : null;
  return { day, lab: txt(raw && raw.laboratorio, 60), items, personal: 0 };
}

// ---------- Tablas de Drive ----------

export function labRows(s) {
  const rows = [];
  for (const p of s.labs || []) {
    for (const it of p.items) {
      const st = itemStatus(it);
      rows.push([p.day, p.lab, it.name, it.value != null ? it.value : it.text, it.unit, rangeText(it), st.label, st.src === 'guia' ? `Guía ${st.guide}` : st.src === 'lab' ? 'Rango del laboratorio' : st.src === 'marca' ? 'Marca del informe' : '']);
    }
  }
  return rows;
}

export { LAB_GROUP };
