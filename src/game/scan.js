// Lo que dice un recibo o un comprobante (1.10). Convierte el texto que lee el OCR del teléfono en los datos de un
// gasto: comercio, RNC, NCF, fecha, ITBIS, propina y total de una factura; o beneficiario, monto, referencia y
// cuentas de un comprobante de transferencia o de pago. Lo que no se lee con seguridad queda marcado como duda.
import { toNumber, guessCategory } from './parse.js';

const U = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const pad = (n) => String(n).padStart(2, '0');
const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

// ---------- Montos ----------

// Un monto: con centavos (1,234.50 · 1.234,50 · 566.99), con separador de miles (25,000) o con su moneda (RD$ 500).
const AMT = /(RD\$|US\$|USD|DOP|\$)?\s?(-?\d{1,3}(?:[,.]\d{3})+(?:[.,]\d{1,2})?|-?\d+[.,]\d{2}\b|-?\d+)(?!\s?%)(?![\d/:-])/g;
export function amountsIn(line) {
  const out = [];
  const L = U(line);
  // Fechas, horas, porcentajes y números largos (teléfonos, cuentas, RNC) no son montos.
  const clean = L.replace(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/g, ' ').replace(/\d{1,2}:\d{2}(:\d{2})?/g, ' ').replace(/\d+([.,]\d+)?\s?%/g, ' ').replace(/\d{9,}/g, ' ').replace(/(\d)\s([.,])\s?(\d{2})\b/g, '$1$2$3');
  for (const m of clean.matchAll(AMT)) {
    const cur = m[1] || '';
    const raw = m[2];
    const hasDec = /[.,]\d{1,2}$/.test(raw);
    const hasThou = /\d[,.]\d{3}/.test(raw);
    if (!cur && !hasDec && !hasThou) continue;
    const v = toNumber(raw);
    if (v == null || !Number.isFinite(v)) continue;
    out.push({ v: Math.abs(v), usd: /US|USD/.test(cur) });
  }
  return out;
}
const lastAmount = (line) => { const a = amountsIn(line); return a.length ? a[a.length - 1] : null; };

// ---------- Fechas y horas ----------

const MONTHS = { ENE: 1, JAN: 1, FEB: 2, MAR: 3, ABR: 4, APR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, AUG: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12, DEC: 12 };
function mkDay(y, m, d) {
  let yy = Number(y);
  if (yy < 100) yy += 2000;
  const mm = Number(m); const dd = Number(d);
  if (!(mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && yy >= 2000 && yy <= 2100)) return null;
  const dt = new Date(Date.UTC(yy, mm - 1, dd));
  if (dt.getUTCMonth() !== mm - 1) return null;
  return `${yy}-${pad(mm)}-${pad(dd)}`;
}
export function datesIn(line) {
  const L = U(line);
  const out = [];
  for (const m of L.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) { const d = mkDay(m[1], m[2], m[3]); if (d) out.push(d); }
  for (const m of L.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g)) {
    // En la República Dominicana se escribe día/mes/año; si el segundo número pasa de 12, es mes/día.
    let [a, b] = [Number(m[1]), Number(m[2])];
    if (b > 12 && a <= 12) [a, b] = [b, a];
    const d = mkDay(m[3], b, a);
    if (d) out.push(d);
  }
  for (const m of L.matchAll(/\b(\d{1,2})[\s/-]*(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|SET|OCT|NOV|DIC|JAN|APR|AUG|DEC)[A-Z.]*[\s/,-]*(?:DE[L]?\s+)?(\d{2,4})\b/g)) {
    const d = mkDay(m[3], MONTHS[m[2]], m[1]);
    if (d) out.push(d);
  }
  return out;
}
export function timeIn(line) {
  const m = U(line).match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(A\.?\s?M\.?|P\.?\s?M\.?)?/);
  if (!m) return '';
  let h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return '';
  if (m[3] && /P/.test(m[3]) && h < 12) h += 12;
  if (m[3] && /A/.test(m[3]) && h === 12) h = 0;
  return `${pad(h)}:${pad(mi)}`;
}

// ---------- Bancos ----------

export const BANKS = [
  ['Banreservas', /BANRESERVAS|BANCO DE RESERVAS/], ['Popular', /BANCO POPULAR|\bPOPULAR\b(?! DE AHORROS)/], ['BHD', /\bBHD\b/],
  ['Scotiabank', /SCOTIA/], ['APAP', /\bAPAP\b|ASOCIACION POPULAR/], ['Banesco', /BANESCO/], ['Santa Cruz', /SANTA CRUZ/],
  ['Promerica', /PROMERICA/], ['Lafise', /LAFISE/], ['Asociación Cibao', /ASOCIACION CIBAO|\bACAP\b/], ['Ademi', /ADEMI/], ['BDI', /\bBDI\b/],
  ['Banco Caribe', /BANCO CARIBE/], ['Vimenca', /VIMENCA/], ['López de Haro', /LOPEZ DE HARO/], ['Alaver', /ALAVER/], ['La Nacional', /LA NACIONAL/],
  ['Qik', /\bQIK\b/], ['Bellbank', /BELLBANK/], ['Citibank', /CITI/], ['JMMB', /JMMB/], ['Banco Atlántico', /BANCO ATLANTICO/],
];
export const bankIn = (line) => { const L = U(line); const b = BANKS.find(([, re]) => re.test(L)); return b ? b[0] : ''; };

// ---------- Utilidades de líneas ----------

const cap = (t) => String(t).toLowerCase().replace(/(^|[\s.'-])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase());
const afterColon = (line) => { const i = line.indexOf(':'); return i >= 0 ? line.slice(i + 1).trim() : ''; };
// El valor de una etiqueta: lo que sigue a «:» en la misma línea o, si no hay, la línea siguiente.
function labelText(lines, upper, re, { skip = null } = {}) {
  for (let i = 0; i < upper.length; i++) {
    if (!re.test(upper[i]) || (skip && skip.test(upper[i]))) continue;
    const same = afterColon(lines[i]) || lines[i].replace(new RegExp(re.source, 'i'), '').replace(/^[\s:.#-]+/, '').trim();
    // Lo que queda de la etiqueta («No. de», «#») no es el valor: entonces va en la línea siguiente.
    const filler = U(same).replace(/\b(NO|N|NUM|NUMERO|DE|DEL|LA|EL|Y|HORA)\b\.?/g, '').replace(/[\s:.#°º-]/g, '');
    if (same && filler.length >= 2 && !re.test(U(same))) return { text: same, i };
    if (lines[i + 1]) return { text: lines[i + 1].trim(), i: i + 1 };
  }
  return null;
}
function labelAmount(lines, upper, re, { skip = null, next = true } = {}) {
  for (let i = 0; i < upper.length; i++) {
    if (!re.test(upper[i]) || (skip && skip.test(upper[i]))) continue;
    const a = lastAmount(lines[i]) || (next && lines[i + 1] ? lastAmount(lines[i + 1]) : null);
    if (a) return { ...a, i };
  }
  return null;
}
const last4In = (line) => { const m = U(line).match(/(?:\*|X|•|\.){2,}\s?-?\s?(\d{4})\b|\bTERMINA(?:DA)? EN (\d{4})\b|\b(\d{4})\s*$/); return m ? m[1] || m[2] || m[3] : ''; };

// ---------- Factura o comprobante ----------

const SKIP_NAME = /FACTURA|RECIBO|CONSUMIDOR|CREDITO FISCAL|\bRNC\b|\bTEL|FECHA|CAJER|\bCAJA\b|DIRECCION|^AV\b|AVENIDA|\bCALLE\b|^C\/|\bNCF\b|BIENVENID|GRACIAS|COPIA|ORIGINAL|SUCURSAL|WWW|@|\bHORA\b|TICKET|COMPROBANTE|TRANSACCION|^\W*$/;
const VOUCHER = [[/TRANSFERENCIA/, 2], [/BENEFICIARIO/, 2], [/DESTINATARIO/, 2], [/CUENTA (DE )?DESTINO/, 2], [/CUENTA (DE )?ORIGEN|PRODUCTO (DE )?ORIGEN/, 1], [/REFERENCIA|CONFIRMACION/, 1], [/EXITOS[AO]|REALIZAD[AO] CON EXITO|APROBAD[AO]/, 1], [/COMPROBANTE DE (PAGO|TRANSFERENCIA|TRANSACCION)/, 2], [/\bLBTR\b|\bACH\b/, 1], [/PAGO (DE |A )?(TARJETA|TC\b)|PAGO DE (SERVICIO|FACTURA|PRESTAMO)/, 2], [/\bMONTO\b/, 1], [/ENVIADO A|TRANSFERIDO A|\bPARA:/, 1]];
const RECEIPT = [[/\bNCF\b|E-?NCF|\b[BE]\d{2}\d{8}/, 2], [/\bI[1IL]?T[1IL]?[B8][I1L][S5]\b/, 2], [/SUB\s?-?TOTAL/, 1], [/CAJER|\bCAJA\b/, 1], [/CONSUMIDOR FINAL|CREDITO FISCAL/, 2], [/\bCANT\b|CANTIDAD|DESCRIPCION/, 1], [/CAMBIO|EFECTIVO/, 1], [/PROPINA|\bLEY\b/, 1]];
const score = (T, list) => list.reduce((a, [re, w]) => a + (re.test(T) ? w : 0), 0);

export function scanKind(text) {
  const T = U(text);
  const v = score(T, VOUCHER);
  const r = score(T, RECEIPT);
  return v >= 3 && v > r ? 'transferencia' : 'recibo';
}

// ITBIS, también como lo confunde el OCR («I1T1BIS», «ITB1S», «I.T.B.I.S.»).
const ITBIS_RE = /\bI[1IL]?\.?T[1IL]?\.?[B8]\.?[I1L]\.?[S5]\b/;
function findTotal(lines, upper) {
  const bad = /SUB\s?-?T[O0]TA[L1I]|T[O0]TA[L1I]\s*(DE\s*)?(ITBIS|IMPUESTO|DESC|ARTICULOS|ITEMS|UNIDADES|PAGADO|LINEAS|PRODUCTOS)|\bI[1IL]?T[1IL]?[B8][I1L][S5]\b|DESCUENTO/;
  const best = /T[O0]TA[L1I]\s*(A\s*PAGAR|GENERAL|NETO|FACTURA(DO)?|RD|DOP|US|\$|:?\s*$)|MONTO\s*TOTAL|TOTAL\s*A\s*PAGAR/;
  const cands = [];
  for (let i = 0; i < upper.length; i++) {
    if (!/T[O0]TA[L1I]\b|MONTO TOTAL/.test(upper[i]) || bad.test(upper[i])) continue;
    const a = lastAmount(lines[i]) || (lines[i + 1] && !/[A-Z]{4}/.test(upper[i + 1]) ? lastAmount(lines[i + 1]) : null);
    if (a) cands.push({ ...a, i, best: best.test(upper[i]) });
  }
  if (!cands.length) return null;
  const pref = cands.filter((c) => c.best);
  const pool = pref.length ? pref : cands;
  return pool.reduce((m, c) => (c.v > m.v ? c : m), pool[0]);
}

const RNC_RE = /R\.?\s?N\.?\s?C\.?/;
function findRnc(lines, upper) {
  for (let i = 0; i < upper.length; i++) {
    if (!RNC_RE.test(upper[i]) || /CLIENTE|COMPRADOR|ADQUIRIENTE/.test(upper[i])) continue;
    for (const ln of [lines[i], lines[i + 1] || '']) {
      const m = U(ln).replace(/[O]/g, '0').match(/(\d[\d\s-]{7,14}\d)/);
      if (!m) continue;
      const d = m[1].replace(/\D/g, '');
      if (d.length === 9 || d.length === 11) return d;
    }
  }
  return '';
}

const NCF_TYPES = /^(B(01|02|04|11|12|13|14|15|16|17)|E(31|32|33|34|41|43|44|45|46|47))$/;
function findNcf(text) {
  const T = U(text);
  for (const m of T.matchAll(/\b([BE8])\s?-?\s?([0-9OQ]{2})\s?-?\s?([0-9OQIL]{8,10})\b/g)) {
    const kind = (m[1] === '8' ? 'B' : m[1]) + m[2].replace(/[OQ]/g, '0');
    const num = m[3].replace(/[OQ]/g, '0').replace(/[IL]/g, '1');
    if (!NCF_TYPES.test(kind)) continue;
    if ((kind[0] === 'B' && num.length === 8) || (kind[0] === 'E' && num.length === 10)) return kind + num;
  }
  return '';
}

function findMerchant(lines, upper) {
  for (let i = 0; i < Math.min(6, lines.length); i++) {
    const L = upper[i];
    const letters = (L.match(/[A-Z]/g) || []).length;
    if (letters < 4 || SKIP_NAME.test(L) || (L.match(/\d/g) || []).length > letters) continue;
    const name = lines[i].replace(/[^\p{L}\p{N}&.,'\s-]/gu, '').replace(/\s{2,}/g, ' ').trim();
    if (name.length >= 3) return { name: cap(name).slice(0, 60), sure: !/[^A-Z0-9&.,'\s-]/.test(L) };
  }
  return null;
}

function bestDate(lines, upper, today) {
  const fromLabel = [];
  const all = [];
  for (let i = 0; i < upper.length; i++) {
    const ds = datesIn(lines[i]);
    all.push(...ds);
    if (/FECHA|EMISION|FECHA Y HORA/.test(upper[i])) { fromLabel.push(...ds); if (!ds.length && lines[i + 1]) fromLabel.push(...datesIn(lines[i + 1])); }
  }
  const ok = (d) => !today || (d <= addDay(today, 1) && d >= addDay(today, -730));
  return [...fromLabel, ...all].find(ok) || null;
}
function addDay(day, n) { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

function findTimeNear(lines, upper) {
  for (let i = 0; i < upper.length; i++) if (/HORA|FECHA/.test(upper[i])) { const t = timeIn(lines[i]) || (lines[i + 1] ? timeIn(lines[i + 1]) : ''); if (t) return t; }
  for (const l of lines) { const t = timeIn(l); if (t) return t; }
  return '';
}

function method(upper) {
  const T = upper.join('\n');
  if (/VISA|MASTER\s?CARD|AMEX|AMERICAN EXPRESS|TARJETA|CREDITO|DEBITO|\bTC\b|\bTD\b/.test(T)) return 'tarjeta';
  if (/TRANSFERENCIA/.test(T)) return 'transferencia';
  if (/EFECTIVO|CAMBIO/.test(T)) return 'efectivo';
  return '';
}

// Lee el texto del OCR. `today` (AAAA-MM-DD) sirve para descartar fechas imposibles.
export function parseScan(text, today = null, { kind: force = null } = {}) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.replace(/[|¦]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const upper = lines.map(U);
  const T = upper.join('\n');
  const kind = force === 'transferencia' || force === 'recibo' ? force : scanKind(text);
  const doubts = new Set();
  const currency = /US\$|\bUSD\b|DOLAR|DOLLAR/.test(T) ? 'USD' : 'DOP';
  const day = bestDate(lines, upper, today);
  if (!day) doubts.add('fecha');
  const time = findTimeNear(lines, upper);
  const out = { kind, text: lines.join('\n'), currency, day, time, doubts };

  if (kind === 'transferencia') {
    const amt = labelAmount(lines, upper, /^MONTO\b|MONTO (TRANSFERIDO|DEBITADO|ENVIADO|DEL PAGO|PAGADO|A PAGAR|TOTAL|DE LA TRANSFERENCIA)|\bIMPORTE\b|\bVALOR\b|\bMONTO:/, { skip: /COMISION|IMPUESTO|CARGO/ }) || findTotal(lines, upper);
    out.total = amt ? amt.v : 0;
    if (amt && amt.usd) out.currency = 'USD';
    if (!out.total) {
      const all = lines.flatMap((l, i) => (/COMISION|IMPUESTO|CARGO|BALANCE|DISPONIBLE|SALDO/.test(upper[i]) ? [] : amountsIn(l)));
      if (all.length) { out.total = Math.max(...all.map((a) => a.v)); doubts.add('total'); } else doubts.add('total');
    }
    const who = labelText(lines, upper, /BENEFICIARIO|DESTINATARIO|A NOMBRE DE|NOMBRE DEL BENEFICIARIO|ENVIADO A|TRANSFERIDO A|^PARA\b/);
    let toName = who ? who.text : '';
    let toBank = '';
    if (toName) {
      toBank = bankIn(toName);
      toName = toName.split(/\s[-–|]\s|,/)[0].replace(/[*•#]+\s?\d*|\b\d{3,}\b/g, '').replace(/\s{2,}/g, ' ').trim();
      if (bankIn(toName) && toName.split(' ').length <= 3) toName = '';
    }
    const destLine = labelText(lines, upper, /CUENTA (DE )?DESTINO|BANCO (DE )?DESTINO|BANCO RECEPTOR|ENTIDAD (DE )?DESTINO|CREDITADO A|^PARA\b/);
    if (destLine && !toBank) toBank = bankIn(destLine.text);
    if (!toBank) { const bi = upper.findIndex((l, i) => i > 0 && /DESTINO|BENEFICIARIO|PARA/.test(upper[i - 1]) && bankIn(l)); if (bi >= 0) toBank = bankIn(lines[bi]); }
    const fromLine = labelText(lines, upper, /CUENTA (DE )?ORIGEN|PRODUCTO (DE )?ORIGEN|^DESDE\b|DEBITADO DE|CUENTA DEBITADA|DE LA CUENTA/);
    out.fromLast4 = fromLine ? last4In(fromLine.text) : '';
    out.toLast4 = destLine ? last4In(destLine.text) : '';
    const ref = labelText(lines, upper, /REFERENCIA|\bREF\b|CONFIRMACION|N(O|UMERO)\.? (DE )?(TRANSACCION|COMPROBANTE|OPERACION)|AUTORIZACION|COMPROBANTE (NO|#)/);
    const refTok = ref ? (U(ref.text).match(/[A-Z0-9][A-Z0-9-]{3,}/) || [])[0] : '';
    out.ref = refTok && /\d/.test(refTok) ? refTok : '';
    const concept = labelText(lines, upper, /CONCEPTO|DESCRIPCION|COMENTARIO|MOTIVO|\bDETALLE\b/);
    out.concept = concept && !/^\d+$/.test(concept.text) ? concept.text.slice(0, 80) : '';
    const fee = labelAmount(lines, upper, /COMISION|CARGO POR (SERVICIO|TRANSFERENCIA)/, { skip: /IMPUESTO/ });
    out.fee = fee ? fee.v : 0;
    const tax = labelAmount(lines, upper, /IMPUESTO|\bDGII\b|0[.,](15|20)\s?%/, { skip: /ITBIS/ });
    out.tax = tax ? tax.v : 0;
    const cardPay = /PAGO (DE |A )?(TU |LA )?(TARJETA|TC\b)|PAGO TARJETA|PAGO DE TARJETA DE CREDITO/.test(T);
    const service = (T.match(/\b(EDESUR|EDENORTE|EDEESTE|CLARO|ALTICE|VIVA|CAASD|CORAASAN|INAPA|WIND TELECOM|TRICOM)\b/) || [])[1] || '';
    out.payKind = cardPay ? 'tarjeta' : service ? 'servicio' : /PRESTAMO/.test(T) ? 'prestamo' : 'tercero';
    out.toName = toName ? cap(toName).slice(0, 60) : '';
    out.toBank = toBank;
    out.service = service ? cap(service) : '';
    out.cardLast4 = cardPay ? (last4In((lines.find((l, i) => /TARJETA|\bTC\b/.test(upper[i]) && last4In(l))) || '') || out.toLast4) : '';
    out.merchant = out.payKind === 'servicio' ? out.service : out.payKind === 'tarjeta' ? 'Pago de tarjeta' : out.toName || 'Transferencia';
    out.cat = out.payKind === 'tarjeta' ? 'pago_tarjeta' : out.payKind === 'servicio' ? guessCategory(service) : out.payKind === 'prestamo' ? 'deuda' : 'terceros';
    if (!out.toName && out.payKind === 'tercero') doubts.add('beneficiario');
    out.method = 'transferencia';
    return out;
  }

  // Factura o recibo.
  const tot = findTotal(lines, upper);
  const sub = labelAmount(lines, upper, /SUB\s?-?T[O0]TA[L1I]/, { next: false });
  const itbis = labelAmount(lines, upper, ITBIS_RE, { skip: /SIN ITBIS|EXENTO|TOTAL SIN/, next: false });
  const tip = labelAmount(lines, upper, /PROPINA|\bLEY\b|SERVICIO 10|10\s?%\s?(DE\s)?(LEY|SERV)/, { next: false });
  out.subtotal = sub ? sub.v : null;
  out.itbis = itbis ? itbis.v : 0;
  out.tip = tip ? tip.v : 0;
  out.total = tot ? tot.v : 0;
  if (tot && tot.usd) out.currency = 'USD';
  if (!out.total && out.subtotal) { out.total = Math.round((out.subtotal + out.itbis + out.tip) * 100) / 100; doubts.add('total'); }
  if (!out.total) {
    const all = lines.flatMap((l, i) => (/CAMBIO|EFECTIVO|RECIBIDO|PAGADO CON|DEVUELTA/.test(upper[i]) ? [] : amountsIn(l)));
    if (all.length) out.total = Math.max(...all.map((a) => a.v));
    doubts.add('total');
  }
  if (out.subtotal != null && out.total && Math.abs(out.subtotal + out.itbis + out.tip - out.total) > 1) doubts.add('total');
  out.rnc = findRnc(lines, upper);
  out.ncf = findNcf(text);
  const mer = findMerchant(lines, upper);
  out.merchant = mer ? mer.name : '';
  if (!mer || !mer.sure) doubts.add('comercio');
  out.method = method(upper);
  out.last4 = out.method === 'tarjeta' ? (last4In(lines.find((l, i) => /VISA|MASTER|TARJETA|AMEX|\*{3,}|X{3,}/.test(upper[i]) && last4In(l)) || '') || '') : '';
  out.cat = guessCategory(`${out.merchant} ${lines.slice(0, 8).join(' ')}`);
  out.items = [];
  return out;
}

// El movimiento que sale de un comprobante (para la hoja de movimiento): cuenta de origen por sus últimos 4,
// tarjeta pagada, referencia y concepto en la nota.
export function voucherTx(s, r) {
  const accs = (s.money && s.money.accounts) || [];
  const byLast4 = (l4, pred = () => true) => (l4 ? accs.find((a) => a.last4 === l4 && pred(a)) : null);
  const from = byLast4(r.fromLast4, (a) => a.kind !== 'tarjeta');
  const fromAcc = from ? (from.kind === 'debito' && from.of ? from.of : from.id) : '';
  const card = r.payKind === 'tarjeta' ? byLast4(r.cardLast4 || r.toLast4, (a) => a.kind === 'tarjeta') || accs.find((a) => a.kind === 'tarjeta') : null;
  const note = [r.concept, r.toBank && r.payKind !== 'tarjeta' ? `Banco: ${r.toBank}` : '', r.ref ? `Ref. ${r.ref}` : ''].filter(Boolean).join(' · ').slice(0, 200);
  const base = { kind: 'tx', amount: r.total || '', currency: r.currency === 'USD' ? 'USD' : 'DOP', day: isDay(r.day) ? r.day : null, account: fromAcc, note, source: 'comprobante' };
  if (r.payKind === 'tarjeta' && card) return { ...base, type: 'transfer', cat: 'pago_tarjeta', to: card.id, merchant: `Pago a ${card.name}${card.last4 ? ` ·${card.last4}` : ''}` };
  return { ...base, type: 'gasto', cat: r.payKind === 'tarjeta' ? 'deuda' : r.cat || 'terceros', merchant: r.merchant || 'Transferencia', fee: r.fee > 0 ? r.fee : 0, tax: r.tax > 0 };
}

