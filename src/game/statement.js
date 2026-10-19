// Estados de cuenta en CSV o Excel (Banreservas, APAP y casi cualquier banco) y el archivo de revisión
// de Astra → movimientos para la pantalla de importar. Todo pasa en el teléfono: nada sale a internet.
import { norm, prettyMerchant, guessCategory, guessIncome } from './parse.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');
const clean = (v) => (v == null ? '' : String(v).replace(/ /g, ' ').replace(/\s+/g, ' ').trim());
const key = (v) => norm(clean(v)).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// ----- CSV -----

// Separa en filas y celdas respetando comillas. El separador se adivina: coma, punto y coma, tabulador o barra.
export function readCSV(text) {
  const t = String(text || '').replace(/^﻿/, '');
  const lines = t.split(/\r?\n/).filter((l) => l.trim()).slice(0, 40);
  let best = ',';
  let bestScore = -1;
  for (const d of [',', ';', '\t', '|']) {
    const counts = lines.map((l) => splitLine(l, d).length).filter((n) => n > 1);
    if (!counts.length) continue;
    const freq = {};
    for (const n of counts) freq[n] = (freq[n] || 0) + 1;
    const [n, f] = Object.entries(freq).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const score = f * 10 + Number(n);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"' && cell.trim() === '') { q = true; cell = ''; }
    else if (ch === best) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()));
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()));
  return { rows, delimiter: best };
}
function splitLine(line, d) {
  const out = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; } else if (ch === '"') q = true;
    else if (ch === d) { out.push(cell); cell = ''; } else cell += ch;
  }
  out.push(cell);
  return out;
}

// ----- Números y fechas -----

// «RD$ 1,234.56», «(1,234.56)», «-1.234,56», «1,234.56-», «DOP 103.23» → número con signo.
export function parseNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = clean(v);
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/(rd\$|us\$|dop|usd|\$|€)/gi, '').replace(/\s+/g, '');
  if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
  if (/^-/.test(s)) { neg = !neg; s = s.slice(1); }
  if (/^\+/.test(s)) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let n;
  if (lastDot >= 0 && lastComma >= 0) {
    n = lastComma > lastDot ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s.replace(/,/g, ''));
  } else if (lastComma >= 0) {
    const dec = s.length - lastComma - 1;
    n = (s.match(/,/g) || []).length === 1 && dec > 0 && dec <= 2 ? Number(s.replace(',', '.')) : Number(s.replace(/,/g, ''));
  } else if (lastDot >= 0) {
    const dec = s.length - lastDot - 1;
    n = (s.match(/\./g) || []).length > 1 || dec === 3 ? Number(s.replace(/\./g, '')) : Number(s);
  } else n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

const MON = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12 };
const MON_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const okDate = (y, m, d) => y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
function hm(t) {
  const m = String(t || '').match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])?\.?\s*m?\.?/i);
  if (!m) return '';
  let h = Number(m[1]);
  const ap = (m[3] || '').toLowerCase();
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  return h < 24 && Number(m[2]) < 60 ? `${pad(h)}:${m[2]}` : '';
}

// Orden de día y mes en una columna de fechas: «dmy» (lo normal en RD) salvo que algo diga lo contrario.
export function dateOrder(values) {
  let dmy = 0;
  let mdy = 0;
  for (const v of values) {
    const m = clean(v).match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
    if (!m) continue;
    if (Number(m[1]) > 12) dmy++;
    if (Number(m[2]) > 12) mdy++;
  }
  return mdy > dmy ? 'mdy' : 'dmy';
}

// Una celda de fecha → { day: «AAAA-MM-DD», time: «HH:MM» } o null.
export function parseDate(v, order = 'dmy') {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) {
      const ms = Math.round((v - 25569) * 86400000);
      const d = new Date(ms);
      const frac = v % 1;
      return { day: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, time: frac > 0.0001 ? `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : '' };
    }
    return null;
  }
  const s = clean(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](.*))?$/);
  if (m && okDate(+m[1], +m[2], +m[3])) return { day: `${m[1]}-${pad(m[2])}-${pad(m[3])}`, time: hm(m[4] || '') };
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:\s+(.*))?$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const [d, mo] = order === 'mdy' ? [Number(m[2]), Number(m[1])] : [Number(m[1]), Number(m[2])];
    if (okDate(y, mo, d)) return { day: `${y}-${pad(mo)}-${pad(d)}`, time: hm(m[4] || '') };
  }
  m = norm(s).match(/^(\d{1,2})[\s/\-.]+([a-z]{3,10})\.?[\s/\-.,]+(?:de\s+)?(\d{2,4})(?:\s+(.*))?$/);
  if (m) {
    const word = m[2].replace(/^de\s+/, '');
    const mo = MON[word.slice(0, 3)] || MON_LONG.indexOf(word) + 1;
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    if (mo && okDate(y, mo, Number(m[1]))) return { day: `${y}-${pad(mo)}-${pad(m[1])}`, time: hm(m[4] || '') };
  }
  m = norm(s).match(/^(\d{1,2}) de ([a-z]+)(?: de)? (\d{4})(?:\s*-?\s*(.*))?$/);
  if (m && MON_LONG.includes(m[2])) return { day: `${m[3]}-${pad(MON_LONG.indexOf(m[2]) + 1)}-${pad(m[1])}`, time: hm(m[4] || '') };
  return null;
}

// ----- Columnas -----

// Nombres de columna que usan los bancos (sin acentos ni signos).
const HEADS = {
  include: ['incluir'],
  date: ['fecha', 'fecha transaccion', 'fecha de transaccion', 'fecha efectiva', 'fecha valor', 'fecha posteo', 'fecha de posteo', 'fecha contable', 'fecha operacion', 'fecha movimiento', 'fecha del movimiento', 'date', 'transaction date', 'posting date', 'dia'],
  time: ['hora', 'time'],
  desc: ['descripcion', 'concepto', 'detalle', 'comercio', 'establecimiento', 'description', 'narrativa', 'beneficiario', 'detalle de la transaccion', 'descripcion del movimiento', 'descripcion de la transaccion', 'movimiento', 'payee', 'memo', 'transaccion', 'descripcion corta'],
  debit: ['debito', 'debitos', 'cargo', 'cargos', 'retiro', 'retiros', 'monto debito', 'valor debito', 'debit', 'debits', 'withdrawal', 'withdrawals', 'salida', 'salidas', 'egreso', 'egresos', 'consumos', 'consumo'],
  credit: ['credito', 'creditos', 'abono', 'abonos', 'deposito', 'depositos', 'monto credito', 'valor credito', 'credit', 'credits', 'deposit', 'deposits', 'entrada', 'entradas', 'pagos'],
  amount: ['monto', 'importe', 'valor', 'cantidad', 'amount', 'monto rd', 'monto us', 'monto transaccion', 'monto de la transaccion'],
  balance: ['balance', 'saldo', 'balance disponible', 'saldo disponible', 'balance final', 'saldo final', 'running balance', 'balance contable', 'saldo contable'],
  currency: ['moneda', 'divisa', 'currency'],
  ref: ['referencia', 'no referencia', 'numero de referencia', 'num referencia', 'documento', 'no documento', 'numero de documento', 'aprobacion', 'autorizacion', 'numero de aprobacion', 'reference', 'serial', 'secuencia', 'no transaccion', 'numero de transaccion'],
  type: ['tipo', 'tipo de transaccion', 'tipo transaccion', 'naturaleza', 'db cr', 'dr cr', 'd c', 'signo', 'tipo movimiento', 'tipo de movimiento'],
  category: ['categoria'],
  account: ['cuenta o tarjeta', 'cuenta', 'tarjeta'],
  to: ['hacia', 'hacia entre cuentas'],
  note: ['nota', 'notas'],
  check: ['revisar'],
};
const FIELD_ORDER = ['include', 'debit', 'credit', 'balance', 'currency', 'ref', 'time', 'date', 'category', 'to', 'account', 'note', 'check', 'type', 'amount', 'desc'];

function fieldOf(h) {
  const k = key(h);
  if (!k) return null;
  for (const f of FIELD_ORDER) if (HEADS[f].includes(k)) return f;
  if (/^fecha\b/.test(k)) return 'date';
  if (/\b(debito|cargo|retiro|debit)/.test(k)) return 'debit';
  if (/\b(credito|abono|deposito|credit)/.test(k)) return 'credit';
  if (/\b(balance|saldo)\b/.test(k)) return 'balance';
  if (/\b(monto|importe|valor|amount)\b/.test(k)) return 'amount';
  if (/\b(descripcion|concepto|detalle|comercio)/.test(k)) return 'desc';
  if (/\b(referencia|documento|aprobacion)\b/.test(k)) return 'ref';
  return null;
}

// Busca la fila de títulos y qué columna es cada cosa.
export function detectColumns(rows) {
  let best = null;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cols = {};
    let score = 0;
    (rows[i] || []).forEach((h, j) => {
      const f = fieldOf(h);
      if (f && cols[f] == null) { cols[f] = j; score += f === 'date' || f === 'amount' || f === 'debit' || f === 'credit' ? 2 : 1; }
    });
    const usable = cols.date != null && (cols.amount != null || cols.debit != null || cols.credit != null);
    if (usable && (!best || score > best.score)) best = { header: i, cols, score };
  }
  if (!best) return null;
  const { cols } = best;
  const template = cols.include != null && cols.category != null && cols.type != null;
  const amountMode = cols.debit != null || cols.credit != null ? 'split' : 'signed';
  const data = rows.slice(best.header + 1);
  const order = dateOrder(data.map((r) => r[cols.date]));
  return { header: best.header, cols, template, amountMode, order, headers: (rows[best.header] || []).map(clean) };
}

// Firma de un formato (para recordar cómo se lee el archivo de cada banco).
export const formatKey = (headers) => headers.map(key).filter(Boolean).join('|').slice(0, 300);

// ----- Cuentas por nombre -----

const BANKS = [['apap', 'APAP'], ['asociacion popular', 'APAP'], ['banreservas', 'Banreservas'], ['reservas', 'Banreservas'], ['popular', 'Banco Popular'], ['bhd', 'BHD'], ['scotiabank', 'Scotiabank'],
  ['santa cruz', 'Banco Santa Cruz'], ['promerica', 'Promerica'], ['caribe', 'Banco Caribe'], ['banesco', 'Banesco'], ['vimenca', 'Banco Vimenca'], ['qik', 'Qik'], ['lopez de haro', 'Banco López de Haro'],
  ['ademi', 'Banco Ademi'], ['bdi', 'Banco BDI'], ['lafise', 'Banco Lafise'], ['cibao', 'Asociación Cibao'], ['la nacional', 'Asociación La Nacional']];
export function bankOf(text) {
  const t = key(text);
  for (const [w, name] of BANKS) if (new RegExp(`\\b${w}\\b`).test(t)) return name;
  return '';
}
// «APAP Visa Familiar ·4417» → { name, last4, bank, kind }.
export function accountFromLabel(label) {
  const raw = clean(label);
  if (!raw) return null;
  const m = raw.match(/^(.*?)[\s·•*\-x]*(\d{4})\s*$/i);
  const name = (m ? m[1] : raw).replace(/[\s·•*\-]+$/, '').trim() || raw;
  const last4 = m ? m[2] : '';
  const t = key(raw);
  const kind = /\b(efectivo|cash)\b/.test(t) ? 'efectivo' : /\b(debito)\b/.test(t) ? 'debito' : /\b(visa|master|mastercard|amex|tarjeta|credito|gold|platinum|infinite|black)\b/.test(t) ? 'tarjeta' : 'cuenta';
  return { name: name.slice(0, 40), last4, bank: bankOf(raw), kind };
}

// ----- Filas → movimientos -----

const OWN_TRANSFER = /(transferencia|transf)\b.*\b(propia|mis cuentas|entre cuentas)|\bentre cuentas\b/;
function classify(desc, dir, accountKind) {
  const t = key(desc);
  if (/\b(retiro|cajero|atm)\b/.test(t) && !/\bcomision\b/.test(t) && dir < 0 && accountKind !== 'tarjeta') return { kind: 'transfer', cat: 'retiro', to: 'efectivo' };
  if (accountKind === 'tarjeta') {
    if (dir > 0 && /\b(pago|abono|payment|su pago|gracias)\b/.test(t)) return { kind: 'transfer', cat: 'pago_tarjeta', toSelf: true };
    if (dir > 0) return { kind: 'ingreso', cat: 'reembolsos' };
    if (/\b(interes|intereses|cargo por financiamiento)\b/.test(t)) return { kind: 'gasto', cat: 'comisiones' };
  } else if (dir < 0 && /\b(pago (a )?(tc|tarjeta|tarj)|pago tarjeta)\b/.test(t)) return { kind: 'transfer', cat: 'pago_tarjeta' };
  if (accountKind !== 'tarjeta' && dir < 0 && /\b(transferencia|transf|trf|ach|lbtr)\b/.test(t) && !OWN_TRANSFER.test(t)) return { kind: 'gasto', cat: 'terceros' };
  if (OWN_TRANSFER.test(t)) return { kind: 'transfer', cat: 'entre_cuentas' };
  if (dir < 0 && /\b(comision|cargo por servicio|cargo mensual|impuesto|itbis|0 15|dgii|manejo de cuenta|mantenimiento)\b/.test(t)) return { kind: 'gasto', cat: 'comisiones' };
  if (dir > 0) return { kind: 'ingreso', cat: /\b(interes|intereses)\b/.test(t) ? 'intereses' : guessIncome(desc) };
  return { kind: 'gasto', cat: guessCategory(desc) };
}

const curOf = (v, fallback) => {
  const t = key(v);
  if (!t) return fallback;
  if (/\b(us|usd|dolar|dolares|us\$)\b/.test(t) || /us\$/i.test(String(v))) return 'USD';
  if (/\b(rd|dop|peso|pesos)\b/.test(t) || /rd\$/i.test(String(v))) return 'DOP';
  return fallback;
};
const directionOf = (v) => {
  const t = key(v);
  if (!t) return 0;
  if (/^(db|dr|d|deb|debito|debit|cargo|retiro|consumo|egreso|salida)\b/.test(t)) return -1;
  if (/^(cr|c|cred|credito|credit|abono|deposito|ingreso|entrada|pago)\b/.test(t)) return 1;
  return 0;
};

// Estado de cuenta → { items, balance, skipped }.
// cfg: { header, cols, amountMode: split|signed, flip, order, currency, accountKind: cuenta|tarjeta, account }
export function statementItems(rows, cfg) {
  const items = [];
  let skipped = 0;
  let balance = null;
  const c = cfg.cols;
  const cell = (r, f) => (c[f] != null ? r[c[f]] : null);
  for (const r of rows.slice(cfg.header + 1)) {
    if (!r || !r.some((x) => clean(x))) continue;
    const when = parseDate(cell(r, 'date'), cfg.order);
    if (!when) { skipped++; continue; }
    let v;
    if (cfg.amountMode === 'split') {
      const deb = Math.abs(parseNum(cell(r, 'debit')) || 0);
      const cre = Math.abs(parseNum(cell(r, 'credit')) || 0);
      v = cre - deb;
    } else {
      v = parseNum(cell(r, 'amount'));
      if (v == null) { skipped++; continue; }
      const dir = directionOf(cell(r, 'type'));
      if (dir) v = dir * Math.abs(v);
      else if (cfg.flip) v = -v;
    }
    v = r2(v);
    if (!v) { skipped++; continue; }
    const desc = clean(cell(r, 'desc')) || (v < 0 ? 'Cargo' : 'Crédito');
    const currency = curOf(cell(r, 'currency'), cfg.currency || 'DOP');
    const k = classify(desc, v < 0 ? -1 : 1, cfg.accountKind);
    const time = hm(clean(cell(r, 'time'))) || when.time || '';
    const ref = clean(cell(r, 'ref')).slice(0, 60);
    const it = {
      kind: k.kind, cat: k.cat, amount: Math.abs(v), currency, day: when.day, time, merchant: prettyMerchant(desc) || desc.slice(0, 60), note: '', ref,
      account: cfg.account || null, to: null, source: 'estado',
    };
    if (k.kind === 'transfer') {
      if (k.toSelf) { it.to = cfg.account || null; it.account = cfg.payFrom || null; it.merchant = it.merchant || 'Pago de tarjeta'; }
      else if (k.to === 'efectivo') it.to = 'efectivo';
    }
    items.push(it);
    const b = parseNum(cell(r, 'balance'));
    if (b != null && (!balance || when.day > balance.day || (when.day === balance.day && (time || '') >= (balance.time || '')))) balance = { amount: r2(b), day: when.day, time, currency };
  }
  return { items, balance, skipped };
}

// ----- Archivo de revisión de Astra (el Excel que prepara Claude) -----

const YES = /^(si|s|yes|y|1|true|x)$/;
const KIND = { gasto: 'gasto', ingreso: 'ingreso', 'entre cuentas': 'transfer', transferencia: 'transfer', transfer: 'transfer' };
export function templateItems(rows, det, cats) {
  const c = det.cols;
  const byName = new Map(cats.map((x) => [key(x.name), x]));
  const byId = new Map(cats.map((x) => [x.id, x]));
  const items = [];
  let skipped = 0;
  for (const r of rows.slice(det.header + 1)) {
    if (!r || !r.some((x) => clean(x))) continue;
    const when = parseDate(r[c.date], det.order);
    const amount = Math.abs(parseNum(r[c.amount]) || 0);
    if (!when || !amount) { skipped++; continue; }
    const kind = KIND[key(r[c.type])] || 'gasto';
    const catRaw = clean(r[c.category]);
    let cat = byName.get(key(catRaw)) || byId.get(catRaw);
    if (cat && (cat.type !== kind)) cat = null;
    const desc = clean(r[c.desc]);
    items.push({
      on: c.include == null ? true : YES.test(key(r[c.include])),
      kind, amount: r2(amount), currency: curOf(r[c.currency], 'DOP'), day: when.day, time: hm(clean(r[c.time])) || when.time || '',
      // Lo que viene todo en mayúsculas del banco («CASA GAZCUE») se escribe normal; lo que escribiste tú se respeta.
      merchant: (/[A-ZÁÉÍÓÚÑ]{3}/.test(desc) && desc === desc.toUpperCase() ? prettyMerchant(desc) || desc : desc).slice(0, 60),
      cat: cat ? cat.id : kind === 'gasto' ? guessCategory(desc) : kind === 'ingreso' ? guessIncome(desc) : 'entre_cuentas',
      account: accountFromLabel(r[c.account]), to: kind === 'transfer' ? accountFromLabel(r[c.to]) : null,
      note: clean(r[c.note]).slice(0, 200), ref: clean(r[c.ref]).slice(0, 60), check: clean(r[c.check]).slice(0, 200), source: 'importado',
    });
  }
  return { items, skipped };
}

// Hoja «Saldos disponibles»: lo que dice el banco de cada cuenta o tarjeta.
export function templateBalances(rows) {
  let h = -1;
  let cols = null;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const ks = (rows[i] || []).map(key);
    const acc = ks.findIndex((k) => k === 'cuenta o tarjeta' || k === 'cuenta');
    const amt = ks.findIndex((k) => /^disponible/.test(k) || k === 'saldo' || k === 'balance');
    if (acc >= 0 && amt >= 0) { h = i; cols = { acc, amt, cur: ks.indexOf('moneda'), limit: ks.findIndex((k) => /^limite/.test(k)), date: ks.findIndex((k) => /^fecha/.test(k)), time: ks.indexOf('hora'), src: ks.findIndex((k) => /^de donde/.test(k)) }; break; }
  }
  if (h < 0) return [];
  const out = [];
  for (const r of rows.slice(h + 1)) {
    const amount = parseNum(r[cols.amt]);
    const account = accountFromLabel(r[cols.acc]);
    if (amount == null || !account) continue;
    const when = cols.date >= 0 ? parseDate(r[cols.date]) : null;
    const limit = cols.limit >= 0 ? parseNum(r[cols.limit]) : null;
    out.push({ account, currency: curOf(cols.cur >= 0 ? r[cols.cur] : '', 'DOP'), amount: r2(amount), limit: limit != null && limit > 0 ? r2(limit) : null, day: when ? when.day : null, time: cols.time >= 0 ? hm(clean(r[cols.time])) : '', source: cols.src >= 0 ? clean(r[cols.src]) : '' });
  }
  return out;
}

// Un libro o un CSV ya leído (hojas con filas) → lo que hace falta para importar.
// → { kind: 'template', items, balances } | { kind: 'statement', sheet, rows, det } | null
export function readBook(sheets, cats) {
  const visible = sheets.filter((s) => !s.hidden);
  for (const sh of visible) {
    const det = detectColumns(sh.rows);
    if (det && det.template) {
      const { items, skipped } = templateItems(sh.rows, det, cats);
      const sal = visible.find((x) => /saldo|disponible/i.test(x.name));
      return { kind: 'template', items, skipped, balances: sal ? templateBalances(sal.rows) : [], sheet: sh.name };
    }
  }
  let best = null;
  for (const sh of visible) {
    const det = detectColumns(sh.rows);
    if (det && (!best || sh.rows.length - det.header > best.rows.length - best.det.header)) best = { sheet: sh.name, rows: sh.rows, det };
  }
  return best ? { kind: 'statement', ...best } : null;
}

// Los últimos 4 de la cuenta en el nombre del archivo («Estado de cuenta XXXXXX3394.csv»).
export function last4FromName(name) {
  const m = String(name || '').match(/(?:x{2,}|\*{2,}|-|_|\s)(\d{4})(?=\D*$)/i);
  return m ? m[1] : '';
}
