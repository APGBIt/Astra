// Préstamos para pagar (1.11): préstamo del banco, financiamiento del carro, hipoteca, cooperativa, compra a cuotas…
// Cada préstamo guarda lo que pediste, la tasa, el plazo, la cuota y lo que te cobran de más en cada cuota
// (seguro, cargos). De ahí salen la tabla de pagos, lo que debes hoy, lo que pagas de intereses y cuándo terminas.
//
// Como en las tarjetas, no se guarda ningún saldo que se pueda desfasar: el saldo sale de lo que pediste y de los
// pagos que anotaste. Si tu banco dice otro saldo, «Cuadrar con el banco» lo corrige desde ese día.
//
// Cada cuota que pagas es un gasto en «Pago de deuda» (sale de tu bolsillo, cuenta en tus pagos fijos del mes);
// aquí se separa cuánto fue a capital, cuánto a intereses y cuánto a seguro y cargos.
import { addDays, diffDays } from '../app/dates.js';
import {
  uid, addTx, gainXP, addGold, bossFeed, fxRate, toDOP, accountOf, txOrig, txCur, txDOP, txUSD, txKind,
} from './logic.js';
import { addAsset } from './assets.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const txt = (v, n = 80) => String(v == null ? '' : v).trim().slice(0, n);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pos = (v) => r2(Math.max(0, Math.abs(Number(v) || 0)));
const between = (v, a, b, d) => (Number.isFinite(Number(v)) && Number(v) >= a && Number(v) <= b ? Number(v) : d);
const EPS = 0.005;

export const CREDIT_KINDS = [
  { key: 'personal', label: 'Préstamo personal', icon: 'cash' },
  { key: 'vehiculo', label: 'Vehículo', icon: 'car' },
  { key: 'hipoteca', label: 'Vivienda o hipoteca', icon: 'home' },
  { key: 'estudio', label: 'Estudios', icon: 'cap' },
  { key: 'negocio', label: 'Negocio', icon: 'briefcase' },
  { key: 'cooperativa', label: 'Cooperativa o asociación', icon: 'people' },
  { key: 'comercio', label: 'Compra a cuotas', icon: 'bag' },
  { key: 'otro', label: 'Otro', icon: 'coins' },
];
export const creditKind = (k) => CREDIT_KINDS.find((x) => x.key === k) || CREDIT_KINDS[CREDIT_KINDS.length - 1];

// Cada cuánto se paga, y cuántas cuotas tiene un año.
export const CREDIT_FREQS = [
  { key: 'mes', label: 'Cada mes', short: 'mes', ppy: 12, perMonth: 1 },
  { key: '2sem', label: 'Cada 2 semanas', short: '2 semanas', ppy: 26, perMonth: 26 / 12 },
  { key: 'sem', label: 'Cada semana', short: 'semana', ppy: 52, perMonth: 52 / 12 },
];
const freqOf = (c) => CREDIT_FREQS.find((f) => f.key === c.freq) || CREDIT_FREQS[0];

// ---------- Matemática del préstamo ----------

// Tasa de cada período (la anual entre las cuotas del año).
export const periodRate = (apr, freq = 'mes') => Math.max(0, Number(apr) || 0) / 100 / (CREDIT_FREQS.find((f) => f.key === freq) || CREDIT_FREQS[0]).ppy;

// Cuota fija (capital + intereses) para pagar `principal` en `term` cuotas: el sistema francés que usan los bancos.
export function annuity(principal, rate, term) {
  const P = Number(principal) || 0;
  const n = Math.max(1, Math.round(Number(term) || 1));
  if (!(P > 0)) return 0;
  if (!(rate > 0)) return r2(P / n);
  return r2((P * rate) / (1 - (1 + rate) ** -n));
}

export const suggestPayment = (p) => annuity(p.principal, periodRate(p.apr, p.freq), p.term);

const pad = (n) => String(n).padStart(2, '0');
const daysIn = (y, m) => new Date(y, m, 0).getDate();

// Fecha de la cuota número n (la 1 es `first`). Cada mes cae el mismo día (31 en un mes corto pasa al último día).
export function dueDateOf(c, n) {
  const k = Math.max(1, Math.round(n));
  if (c.freq === '2sem') return addDays(c.first, 14 * (k - 1));
  if (c.freq === 'sem') return addDays(c.first, 7 * (k - 1));
  const [y, m, d] = c.first.split('-').map(Number);
  const t = y * 12 + (m - 1) + (k - 1);
  const y2 = Math.floor(t / 12);
  const m2 = (t % 12) + 1;
  return `${y2}-${pad(m2)}-${pad(Math.min(d, daysIn(y2, m2)))}`;
}

// ---------- Datos ----------

// Pone al día (y limpia) los préstamos guardados.
export function ensureCredits(s) {
  const m = s.money;
  if (!Array.isArray(m.credits)) m.credits = [];
  const ids = new Set((m.tx || []).map((t) => t.id));
  m.credits = m.credits.filter((c) => isObj(c) && c.id && Number(c.principal) > 0 && isDay(c.first));
  for (const c of m.credits) {
    c.name = txt(c.name, 50) || 'Préstamo';
    c.kind = CREDIT_KINDS.some((k) => k.key === c.kind) ? c.kind : 'personal';
    c.lender = txt(c.lender, 50);
    c.principal = pos(c.principal);
    c.currency = c.currency === 'USD' ? 'USD' : 'DOP';
    c.apr = between(c.apr, 0, 300, 0);
    c.term = Math.round(between(c.term, 1, 600, 12));
    c.freq = CREDIT_FREQS.some((f) => f.key === c.freq) ? c.freq : 'mes';
    if (!isDay(c.start)) c.start = c.first;
    c.fee = pos(c.fee);
    c.payment = pos(c.payment) || suggestPayment(c);
    c.account = c.account && accountOf(s, c.account) ? c.account : '';
    c.remind = Math.round(between(c.remind, 0, 14, 3));
    c.prepay = between(c.prepay, 0, 20, 0);
    c.price = pos(c.price);
    c.down = pos(c.down);
    c.upfront = pos(c.upfront);
    if (c.downTx && !ids.has(c.downTx)) c.downTx = null;
    if (!c.downTx) c.downTx = null;
    c.reduce = c.reduce === 'cuota' ? 'cuota' : 'plazo';
    c.note = txt(c.note, 200);
    if (!isDay(c.closed)) c.closed = null;
    if (!Array.isArray(c.pays)) c.pays = [];
    c.pays = c.pays.filter((p) => isObj(p) && p.id && Number(p.amount) > 0 && isDay(p.day));
    for (const p of c.pays) {
      p.amount = pos(p.amount);
      p.kind = p.kind === 'abono' ? 'abono' : 'cuota';
      if (p.tx && !ids.has(p.tx)) p.tx = null;
    }
    c.pays.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    if (!Array.isArray(c.syncs)) c.syncs = [];
    c.syncs = c.syncs.filter((x) => isObj(x) && x.id && isDay(x.day) && Number(x.balance) >= 0).map((x) => ({
      id: x.id, day: x.day, balance: pos(x.balance), paid: Number.isFinite(Number(x.paid)) && x.paid !== null && x.paid !== '' ? Math.min(c.term + 600, Math.max(0, Math.round(Number(x.paid)))) : null,
    }));
    c.manual = !!(c.manual && c.closed);
    c.syncs.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  }
}

export const creditOf = (s, id) => ((s.money && s.money.credits) || []).find((c) => c.id === id) || null;

// ---------- El historial: lo que de verdad pasó ----------

const byDay = (a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.t === b.t ? 0 : a.t === 'pay' ? -1 : 1);

// Pago por pago: cuánto fue a intereses, a seguro y cargos, y a capital; y lo que quedaba debiendo después.
// Los intereses de cada cuota son el saldo que había por la tasa del período (como en la tabla del banco).
export function creditLedger(c, upTo = null) {
  const r = periodRate(c.apr, c.freq);
  let B = c.principal;
  let k = 0;
  const rows = [];
  const evs = [...c.pays.map((p) => ({ ...p, t: 'pay' })), ...c.syncs.map((x) => ({ ...x, t: 'sync' }))]
    .filter((e) => !upTo || e.day <= upTo).sort(byDay);
  for (const e of evs) {
    if (e.t === 'sync') {
      B = r2(Math.max(0, e.balance));
      if (e.paid != null) k = e.paid;
      rows.push({ type: 'sync', id: e.id, day: e.day, balance: B, paid: k });
      continue;
    }
    if (e.kind === 'abono') {
      const take = r2(Math.min(e.amount, B));
      B = r2(B - take);
      rows.push({ type: 'abono', id: e.id, day: e.day, amount: e.amount, interest: 0, fee: 0, principal: take, balance: B, tx: e.tx || null });
      continue;
    }
    k += 1;
    const interest = r2(B * r);
    const fee = r2(Math.min(c.fee, e.amount));
    let principal = r2(e.amount - fee - interest);
    if (principal > B) principal = B;
    B = r2(Math.max(0, B - principal));
    rows.push({ type: 'cuota', id: e.id, n: k, day: e.day, amount: e.amount, interest, fee, principal, balance: B, tx: e.tx || null });
  }
  return { rows, balance: B, nPaid: k };
}

// Lo que se paga en la próxima cuota (sin seguro ni cargos): la tuya, o, si pediste que los abonos bajen la cuota,
// lo que toca para terminar en el plazo de siempre.
function nextPayment(c, led) {
  if (c.reduce === 'cuota' && c.pays.some((p) => p.kind === 'abono') && c.term - led.nPaid >= 1) {
    return annuity(led.balance, periodRate(c.apr, c.freq), c.term - led.nPaid);
  }
  return c.payment;
}

// ---------- Lo que falta: las cuotas que vienen ----------

// `extra`: lo que sumas a cada cuota para pagar capital. `lump`: un abono de una vez, ahora.
export function creditProject(c, { extra = 0, lump = 0 } = {}) {
  const led = creditLedger(c);
  const r = periodRate(c.apr, c.freq);
  let B = r2(Math.max(0, led.balance - Math.max(0, Number(lump) || 0)));
  let k = led.nPaid;
  const base = nextPayment(c, led);
  const add = Math.max(0, Number(extra) || 0);
  const rows = [];
  let interest = 0; let total = 0; let ok = true;
  let guard = 0;
  while (B > EPS && guard++ < 1500) {
    k += 1;
    const i = r2(B * r);
    let pay = r2(base + add);
    let principal = r2(pay - i);
    if (principal <= EPS) { ok = false; break; }
    if (principal >= B) { principal = B; pay = r2(B + i); }
    B = r2(B - principal);
    interest += i;
    total += pay + c.fee;
    rows.push({ n: k, date: dueDateOf(c, k), payment: pay, fee: c.fee, interest: i, principal, balance: B });
  }
  if (guard >= 1500) ok = false;
  const last = rows[rows.length - 1];
  return { ok, rows, left: rows.length, end: ok && last ? last.date : null, interest: r2(interest), total: r2(total), payment: base };
}

// Qué pasa si abonas de más: cuánto antes terminas y cuánto te ahorras en intereses.
export function creditWhatIf(c, opts) {
  const a = creditProject(c);
  const b = creditProject(c, opts);
  return {
    base: a, plan: b, ok: a.ok ? b.ok : b.ok,
    cuotas: a.ok && b.ok ? a.left - b.left : null,
    interest: a.ok && b.ok ? r2(a.interest - b.interest) : null,
  };
}

// ---------- El estado de hoy ----------

export function creditInfo(c, today) {
  const led = creditLedger(c);
  const proj = creditProject(c);
  const rows = led.rows.filter((r) => r.type === 'cuota' || r.type === 'abono');
  const sum = (key) => r2(rows.reduce((a, r) => a + r[key], 0));
  const balance = led.balance;
  const open = !c.closed && balance > EPS;
  const next = open && proj.rows.length ? proj.rows[0] : null;
  const behind = open ? proj.rows.filter((r) => r.date < today).length : 0;
  const paidPrincipal = sum('principal');
  const lastDay = rows.length ? rows[rows.length - 1].day : c.start;
  const status = !open ? 'closed' : !next ? 'none' : next.date < today ? 'late' : next.date === today ? 'today' : diffDays(today, next.date) <= c.remind ? 'soon' : 'later';
  // Cuánto se debe hoy si lo cancelas ya: el capital, los intereses que corrieron desde el último pago y el cargo por cancelar antes.
  const accrued = open ? r2(balance * (Number(c.apr) / 100) * (Math.max(0, diffDays(lastDay, today)) / 365)) : 0;
  const prepayFee = open ? r2(balance * (c.prepay / 100)) : 0;
  return {
    open, status, balance, nPaid: led.nPaid, nLeft: proj.ok ? proj.left : null, ok: proj.ok, end: proj.end,
    paid: sum('amount'), paidInterest: sum('interest'), paidFee: sum('fee'), paidPrincipal,
    pct: c.principal ? Math.min(1, Math.max(0, paidPrincipal / c.principal)) : 0,
    interestLeft: proj.interest, totalLeft: proj.total, interestAll: r2(sum('interest') + proj.interest),
    next, nextAmount: next ? r2(next.payment + next.fee) : r2(c.payment + c.fee), behind, late: status === 'late',
    daysLate: next && next.date < today ? diffDays(next.date, today) : 0,
    payoff: { balance, accrued, fee: prepayFee, total: r2(balance + accrued + prepayFee) },
    ledger: led, proj,
    perMonth: r2((c.payment + c.fee) * freqOf(c).perMonth),
    buy: creditBuy(c, sum('amount'), proj.total),
  };
}

// Precio, inicial y costo total de lo que compraste con el préstamo.
function creditBuy(c, paid, left) {
  const price = c.price > 0 ? c.price : c.down > 0 ? r2(c.principal + c.down) : 0;
  const down = c.down > 0 ? c.down : price > c.principal ? r2(price - c.principal) : 0;
  const total = r2(down + c.upfront + paid + (Number.isFinite(left) ? left : 0));
  return { price, down, upfront: c.upfront, financed: c.principal, pctFinanced: price > 0 ? Math.min(1, c.principal / price) : 1, total, extra: price > 0 ? r2(Math.max(0, total - price)) : 0 };
}

// Lo que debes de todos tus préstamos, en pesos, y lo que pagas al mes.
export function creditTotals(s, day) {
  const rate = fxRate(s, day);
  const out = { owe: 0, n: 0, monthly: 0, late: 0, interestLeft: 0, nextMonth: 0 };
  for (const c of (s.money && s.money.credits) || []) {
    const led = creditLedger(c, day);
    if (c.closed && c.closed <= day) continue;
    if (c.start > day || !(led.balance > EPS)) continue;
    out.owe += toDOP(led.balance, c.currency, rate);
    out.n += 1;
    if (!c.closed) {
      const inf = creditInfo(c, day);
      out.monthly += toDOP(inf.perMonth, c.currency, rate);
      out.interestLeft += toDOP(inf.interestLeft, c.currency, rate);
      if (inf.late) out.late += 1;
    }
  }
  for (const k of ['owe', 'monthly', 'interestLeft']) out[k] = r2(out[k]);
  return out;
}

export const openCredits = (s) => ((s.money && s.money.credits) || []).filter((c) => !c.closed && creditLedger(c).balance > EPS);

// Saldo de un préstamo al terminar un día (para el patrimonio mes a mes). Antes de pedirlo, 0.
export function creditBalanceAt(c, day) {
  if (c.start > day) return 0;
  if (c.closed && c.closed <= day) return 0;
  return creditLedger(c, day).balance;
}

// ---------- Cuotas que vienen: «Por pagar», calendario, Hoy y avisos ----------

// Una cuota por préstamo abierto: la próxima sin pagar y las siguientes que caigan hasta `to`.
export function creditDues(s, from, to, today) {
  const rate = fxRate(s, today);
  const out = [];
  for (const c of (s.money && s.money.credits) || []) {
    if (c.closed) continue;
    const inf = creditInfo(c, today);
    if (!inf.open || !inf.ok) continue;
    for (const row of inf.proj.rows) {
      if (row.date > to) break;
      const late = row.date < today;
      if (row.date < from && !late) continue;
      const amount = r2(row.payment + row.fee);
      const status = late ? 'late' : row.date === today ? 'today' : diffDays(today, row.date) <= c.remind ? 'soon' : 'later';
      out.push({ type: 'credit', kind: 'gasto', c, n: row.n, date: row.date, status, amount, currency: c.currency, dop: toDOP(amount, c.currency, rate), row });
      if (late && out.filter((x) => x.c === c && x.status === 'late').length >= 3) break;
    }
  }
  return out;
}

// Lo que toca pagar de préstamos en un rango de días (un mes), en pesos: lo ya pagado y lo que falta.
// Para el plan del mes y la proyección.
export function creditMonth(s, from, to, today) {
  const rate = fxRate(s, today);
  const txs = new Map((s.money.tx || []).map((t) => [t.id, t]));
  let paid = 0; let due = 0; let left = 0;
  for (const c of (s.money && s.money.credits) || []) {
    for (const r of creditLedger(c).rows) {
      if (r.type !== 'cuota' || r.day < from || r.day > to) continue;
      const t = r.tx ? txs.get(r.tx) : null;
      paid += t ? txDOP(t) : toDOP(r.amount, c.currency, rate);
    }
    if (c.closed) continue;
    const inf = creditInfo(c, today);
    if (!inf.open || !inf.ok) continue;
    for (const row of inf.proj.rows) {
      if (row.date > to) break;
      if (row.date < from) continue;
      const v = toDOP(row.payment + row.fee, c.currency, rate);
      due += v;
      if (row.date > today) left += v;
    }
  }
  return { paid: r2(paid), due: r2(due), total: r2(paid + due), left: r2(left) };
}

// Los movimientos que ya son cuotas de un préstamo (no se cuentan dos veces como «gasto del día a día»).
export function creditTxIds(s) {
  const ids = new Set();
  for (const c of (s.money && s.money.credits) || []) { for (const p of c.pays) if (p.tx) ids.add(p.tx); if (c.downTx) ids.add(c.downTx); }
  return ids;
}

export function creditForTx(s, txId) {
  for (const c of (s.money && s.money.credits) || []) {
    const pay = c.pays.find((p) => p.tx === txId);
    if (pay) return { credit: c, pay };
  }
  return null;
}

// ---------- Guardar ----------

function clean(p, base = {}) {
  const out = { ...base };
  if (p.name !== undefined) out.name = txt(p.name, 50) || base.name || 'Préstamo';
  if (p.kind !== undefined && CREDIT_KINDS.some((k) => k.key === p.kind)) out.kind = p.kind;
  if (p.lender !== undefined) out.lender = txt(p.lender, 50);
  if (p.principal !== undefined && pos(p.principal) > 0) out.principal = pos(p.principal);
  if (p.currency !== undefined) out.currency = p.currency === 'USD' ? 'USD' : 'DOP';
  if (p.apr !== undefined) out.apr = between(p.apr, 0, 300, base.apr || 0);
  if (p.term !== undefined) out.term = Math.round(between(p.term, 1, 600, base.term || 12));
  if (p.freq !== undefined && CREDIT_FREQS.some((f) => f.key === p.freq)) out.freq = p.freq;
  if (p.start !== undefined && isDay(p.start)) out.start = p.start;
  if (p.first !== undefined && isDay(p.first)) out.first = p.first;
  if (p.fee !== undefined) out.fee = pos(p.fee);
  if (p.account !== undefined) out.account = p.account || '';
  if (p.remind !== undefined) out.remind = Math.round(between(p.remind, 0, 14, 3));
  if (p.prepay !== undefined) out.prepay = between(p.prepay, 0, 20, 0);
  if (p.price !== undefined) out.price = pos(p.price);
  if (p.down !== undefined) out.down = pos(p.down);
  if (p.upfront !== undefined) out.upfront = pos(p.upfront);
  if (p.reduce !== undefined) out.reduce = p.reduce === 'cuota' ? 'cuota' : 'plazo';
  if (p.note !== undefined) out.note = txt(p.note, 200);
  return out;
}

// Nuevo préstamo. Con `received` (una cuenta) también anota el dinero que entró (no cuenta como ingreso).
export function addCredit(s, p, today, ev = []) {
  // Con el precio y el inicial, lo financiado es la diferencia (comprar un carro de 1,200,000 con 300,000 de inicial).
  let principal = pos(p.principal);
  if (!(principal > 0) && pos(p.price) > pos(p.down)) principal = r2(pos(p.price) - pos(p.down));
  if (!(principal > 0)) return null;
  const start = isDay(p.start) ? p.start : today;
  const first = isDay(p.first) ? p.first : dueDateOf({ freq: CREDIT_FREQS.some((f) => f.key === p.freq) ? p.freq : 'mes', first: start }, 2);
  const c = clean({ ...p, first, start }, {
    id: uid(), name: 'Préstamo', kind: 'personal', lender: '', principal, currency: 'DOP', apr: 0, term: 12, freq: 'mes', start, first, fee: 0, payment: 0,
    account: '', remind: 3, prepay: 0, reduce: 'plazo', note: '', pays: [], syncs: [], closed: null, created: Date.now(), price: 0, down: 0, upfront: 0, downTx: null,
  });
  c.payment = pos(p.payment) || suggestPayment(c);
  if (p.received && accountOf(s, p.received)) {
    addTx(s, { type: 'ingreso', cat: 'prestamo_recibido', merchant: `Préstamo: ${c.name}`, amount: c.principal, currency: c.currency, account: p.received, day: c.start, noStats: true, note: c.lender ? `Desembolso de ${c.lender}` : '' }, today, ev);
  }
  s.money.credits.unshift(c);
  // El inicial: un gasto que ya anotaste, o uno nuevo (no cuenta en los gastos del mes: compraste algo que te queda).
  if (c.down > 0 && p.downTx && setCreditDown(s, c.id, p.downTx)) { /* vinculado */ }
  else if (c.down > 0 && p.downAccount && accountOf(s, p.downAccount)) {
    const tx = addTx(s, { type: 'gasto', cat: 'deuda', merchant: `Inicial de ${c.name}`, amount: c.down, currency: c.currency, account: p.downAccount, day: c.start, noStats: true, noBoss: true, link: { skip: true }, note: c.lender || '' }, today, ev);
    if (tx) c.downTx = tx.id;
  }
  if (c.upfront > 0 && p.upfrontAccount && accountOf(s, p.upfrontAccount)) {
    addTx(s, { type: 'gasto', cat: 'deuda', merchant: `Gastos de apertura: ${c.name}`, amount: c.upfront, currency: c.currency, account: p.upfrontAccount, day: c.start, noBoss: true, link: { skip: true }, note: 'Comisión, legal, tasación' }, today, ev);
  }
  // Lo que compraste con el préstamo, para el patrimonio (vale el precio; el préstamo es lo que debes por él).
  if (p.asset && (c.price > 0 || c.down > 0)) {
    addAsset(s, { name: txt(p.assetName, 50) || c.name, kind: p.assetKind, currency: c.currency, value: c.price || r2(c.principal + c.down), since: c.start, credit: c.id }, today);
  }
  return c;
}

// El gasto que ya anotaste y fue el inicial (enganche) del préstamo.
export function setCreditDown(s, id, txId) {
  const c = creditOf(s, id);
  const tx = (s.money.tx || []).find((t) => t.id === txId);
  if (!c || !tx || txKind(tx) !== 'gasto' || creditForTx(s, tx.id) || creditTxIds(s).has(tx.id)) return null;
  c.downTx = tx.id;
  if (!(c.down > 0)) c.down = r2(inCreditCur(s, c, tx));
  return c;
}

// Anota el inicial como gasto (no cuenta en los gastos del mes) si todavía no está anotado.
export function recordDown(s, id, account, today, ev = []) {
  const c = creditOf(s, id);
  if (!c || !(c.down > 0) || c.downTx || !accountOf(s, account)) return null;
  const tx = addTx(s, { type: 'gasto', cat: 'deuda', merchant: `Inicial de ${c.name}`, amount: c.down, currency: c.currency, account, day: c.start <= today ? c.start : today, noStats: true, noBoss: true, link: { skip: true }, note: c.lender || '' }, today, ev);
  if (tx) c.downTx = tx.id;
  return tx;
}

const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Gastos que ya anotaste y parecen ser de este préstamo: cuotas, abonos grandes o el inicial. Se muestran para que
// la persona confirme; nada se vincula solo. (Los pagos con fecha anterior no cambian el saldo si hay un cuadre posterior.)
export function creditCandidates(s, id, today) {
  const c = creditOf(s, id);
  if (!c) return [];
  const linked = creditTxIds(s);
  for (const x of s.money.credits) if (x.downTx) linked.add(x.downTx);
  const want = c.payment + c.fee;
  const name = norm(c.name);
  const lender = norm(c.lender);
  const out = [];
  for (const t of s.money.tx || []) {
    if (txKind(t) !== 'gasto' || t.adjust || t.to || t.taxOf || linked.has(t.id) || t.day > today || t.day < addDays(c.start, -20)) continue;
    const text = norm(`${t.merchant} ${t.note || ''}`);
    const byName = (name.length > 3 && text.includes(name)) || (lender.length > 3 && text.includes(lender));
    const isDeuda = t.cat === 'deuda';
    if (!byName && !isDeuda) continue;
    const got = r2(inCreditCur(s, c, t));
    if (!(got > 0) || !(want > 0)) continue;
    const gapPay = Math.abs(got - want) / want;
    const gapDown = c.down > 0 ? Math.abs(got - c.down) / c.down : 9;
    const near = Math.abs(diffDays(c.start, t.day)) <= 20;
    let kind = '';
    if (c.down > 0 && !c.downTx && gapDown <= 0.03 && near && (byName || isDeuda)) kind = 'inicial';
    else if (gapPay <= 0.12 && (byName || gapPay <= 0.05)) kind = 'cuota';
    else if (byName && got > want * 1.5 && !near) kind = 'abono';
    if (!kind) continue;
    out.push({ tx: t, kind, amount: got, day: t.day, sure: byName });
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

// Vincula los gastos que la persona confirmó: [{ tx, kind }] con kind 'cuota' | 'abono' | 'inicial'.
export function linkCreditTxs(s, id, items, today, ev = []) {
  const res = { cuotas: 0, abonos: 0, down: false };
  const list = [...items].sort((a, b) => {
    const ta = (s.money.tx.find((t) => t.id === a.tx) || {}).day || '';
    const tb = (s.money.tx.find((t) => t.id === b.tx) || {}).day || '';
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });
  for (const it of list) {
    if (it.kind === 'inicial') { if (setCreditDown(s, id, it.tx)) res.down = true; continue; }
    const kind = it.kind === 'abono' ? 'abono' : 'cuota';
    if (payCredit(s, id, { tx: it.tx, kind }, today, ev)) res[kind === 'abono' ? 'abonos' : 'cuotas'] += 1;
  }
  return res;
}

export function updateCredit(s, id, p) {
  const c = creditOf(s, id);
  if (!c) return null;
  const prevFirst = c.first;
  Object.assign(c, clean(p, c));
  if (p.payment !== undefined && pos(p.payment) > 0) c.payment = pos(p.payment);
  else if (p.payment === 0 || p.payment === '') c.payment = suggestPayment(c);
  if (!isDay(c.first)) c.first = prevFirst;
  if (c.closed && !c.manual && creditLedger(c).balance > EPS) c.closed = null;
  return c;
}

export function removeCredit(s, id, { withTx = false } = {}) {
  const c = creditOf(s, id);
  if (!c) return false;
  if (withTx) {
    const drop = new Set(c.pays.map((p) => p.tx).filter(Boolean));
    s.money.tx = s.money.tx.filter((t) => !drop.has(t.id) && !drop.has(t.taxOf));
  }
  s.money.credits = s.money.credits.filter((x) => x.id !== id);
  return true;
}

// El monto de un movimiento en la moneda del préstamo.
function inCreditCur(s, c, t) {
  if (txCur(t) === c.currency) return txOrig(t);
  return c.currency === 'USD' ? txUSD(s, t) : txDOP(t);
}

function settle(s, c, day, today, ev) {
  if (c.closed || creditLedger(c).balance > EPS) return;
  c.closed = day;
  gainXP(s, 'finanzas', 100, today, ev);
  addGold(s, 50, today);
  ev.push({ type: 'creditDone', name: c.name });
}

// Un pago (cuota o abono a capital). Con `account`, anota el gasto; con `tx`, usa un movimiento que ya anotaste.
export function payCredit(s, id, p, today, ev = []) {
  const c = creditOf(s, id);
  if (!c || c.closed) return null;
  const kind = p.kind === 'abono' ? 'abono' : 'cuota';
  const day = isDay(p.day) ? p.day : today;
  let tx = null;
  let amount = pos(p.amount);
  if (p.tx) {
    tx = (s.money.tx || []).find((t) => t.id === p.tx) || null;
    if (!tx || creditForTx(s, tx.id) || txKind(tx) !== 'gasto') return null;
    if (!(amount > 0)) amount = r2(inCreditCur(s, c, tx));
  }
  if (!(amount > 0)) return null;
  const pay = { id: uid(), day: tx ? tx.day : day, amount, kind, tx: tx ? tx.id : null };
  if (!tx && p.account && accountOf(s, p.account)) {
    tx = addTx(s, {
      type: 'gasto', cat: 'deuda', merchant: `${kind === 'abono' ? 'Abono a' : 'Cuota de'} ${c.name}`, amount, currency: c.currency, account: p.account, day: pay.day,
      note: c.lender ? `${c.lender}${p.note ? ` · ${p.note}` : ''}` : p.note || '', noBoss: true, link: { skip: true },
    }, today, ev);
    if (tx) pay.tx = tx.id;
  }
  c.pays.push(pay);
  c.pays.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const row = creditLedger(c).rows.find((r) => r.id === pay.id);
  const recent = pay.day >= addDays(today, -3);
  if (row && recent) {
    if (row.type === 'cuota') {
      if (pay.day <= dueDateOf(c, row.n)) { gainXP(s, 'finanzas', 10, today, ev); addGold(s, 3, today); ev.push({ type: 'creditPaid', name: c.name, onTime: true }); }
    } else { gainXP(s, 'finanzas', 15, today, ev); ev.push({ type: 'creditPaid', name: c.name, extra: true }); }
    if (row.principal > 0) bossFeed(s, 'debtPay', toDOP(row.principal, c.currency, fxRate(s, pay.day)), today, ev, { note: `Pago: ${c.name}` });
  }
  settle(s, c, pay.day, today, ev);
  return pay;
}

// Quita un pago (y su movimiento, si lo pides).
export function removeCreditPay(s, id, payId, { withTx = true } = {}) {
  const c = creditOf(s, id);
  if (!c) return false;
  const pay = c.pays.find((p) => p.id === payId);
  if (!pay) return false;
  c.pays = c.pays.filter((p) => p.id !== payId);
  if (withTx && pay.tx) s.money.tx = s.money.tx.filter((t) => t.id !== pay.tx && t.taxOf !== pay.tx);
  if (c.closed && !c.manual && creditLedger(c).balance > EPS) c.closed = null;
  return true;
}

// «Cuadrar con el banco»: desde este día, el saldo es el que dice tu banco.
export function syncCredit(s, id, balance, day, today, { paid = null } = {}) {
  const c = creditOf(s, id);
  if (!c || !(Number(balance) >= 0)) return null;
  const d = isDay(day) ? day : today;
  c.syncs = c.syncs.filter((x) => x.day !== d);
  const sy = { id: uid(), day: d, balance: pos(balance), paid: paid != null && Number.isFinite(Number(paid)) ? Math.max(0, Math.round(Number(paid))) : null };
  c.syncs.push(sy);
  c.syncs.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  if (c.closed && !c.manual && creditLedger(c).balance > EPS) c.closed = null;
  return sy;
}

// Lo que debería quedar debiendo después de `n` cuotas pagadas, si se paga cada una a tiempo (la tabla del banco).
export function scheduledBalance(c, n) {
  const r = periodRate(c.apr, c.freq);
  const k = Math.max(0, Math.round(n));
  if (!k) return c.principal;
  if (!(r > 0)) return r2(Math.max(0, c.principal - c.payment * k));
  const g = (1 + r) ** k;
  return r2(Math.max(0, c.principal * g - c.payment * ((g - 1) / r)));
}

// Cuántas cuotas ya debieron pagarse a esta fecha (las que vencen hasta hoy).
export function dueCount(c, day) {
  let n = 0;
  while (n < 1200 && dueDateOf(c, n + 1) <= day) n += 1;
  return n;
}

export function removeSync(s, id, syncId) {
  const c = creditOf(s, id);
  if (!c) return false;
  c.syncs = c.syncs.filter((x) => x.id !== syncId);
  return true;
}

// «Ya lo terminé de pagar» (por ejemplo, lo cancelaste de una vez): se cierra aunque quede saldo en la cuenta.
export function closeCredit(s, id, day, today, ev = []) {
  const c = creditOf(s, id);
  if (!c || c.closed) return null;
  c.closed = isDay(day) ? day : today;
  c.manual = true;
  gainXP(s, 'finanzas', 100, today, ev);
  addGold(s, 50, today);
  ev.push({ type: 'creditDone', name: c.name });
  return c;
}

export function reopenCredit(s, id) {
  const c = creditOf(s, id);
  if (!c) return null;
  c.closed = null;
  c.manual = false;
  return c;
}

// ---------- Ligar movimientos ----------

// Un movimiento nuevo que se parece a la cuota de un préstamo (pago de deuda, monto parecido, fecha cerca de la cuota) se anota solo.
export function autoLinkCredit(s, tx, today, ev = []) {
  if (!tx || txKind(tx) !== 'gasto' || tx.cat !== 'deuda' || creditForTx(s, tx.id)) return null;
  const key = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const mer = key(tx.merchant);
  let best = null;
  for (const c of (s.money.credits || [])) {
    if (c.closed) continue;
    const inf = creditInfo(c, today);
    if (!inf.open || !inf.next) continue;
    const want = inf.nextAmount;
    const got = inCreditCur(s, c, tx);
    const byName = mer && (mer.includes(key(c.name)) || (c.lender && key(c.lender).length > 3 && mer.includes(key(c.lender))));
    const gap = Math.abs(got - want) / Math.max(1, want);
    if (gap > 0.12 && !(byName && gap <= 0.5)) continue;
    const near = Math.abs(diffDays(inf.next.date, tx.day)) <= 12;
    if (!near && !byName) continue;
    const score = gap + Math.abs(diffDays(inf.next.date, tx.day)) / 40 - (byName ? 0.3 : 0);
    if (!best || score < best.score) best = { c, score };
  }
  if (!best) return null;
  const pay = payCredit(s, best.c.id, { tx: tx.id, kind: 'cuota' }, today, ev);
  return pay ? { credit: best.c, pay } : null;
}

// Quitaste un movimiento: su pago sale del préstamo.
export function dropCreditTx(s, txIds) {
  const gone = txIds instanceof Set ? txIds : new Set(txIds);
  for (const c of (s.money && s.money.credits) || []) {
    const n = c.pays.length;
    if (c.downTx && gone.has(c.downTx)) c.downTx = null;
    c.pays = c.pays.filter((p) => !(p.tx && gone.has(p.tx)));
    if (c.pays.length !== n && c.closed && !c.manual && creditLedger(c).balance > EPS) c.closed = null;
  }
}

// Corregiste un movimiento: su pago toma el nuevo monto y fecha.
export function syncCreditTx(s, tx) {
  const found = tx ? creditForTx(s, tx.id) : null;
  if (!found) return;
  found.pay.amount = r2(inCreditCur(s, found.credit, tx));
  found.pay.day = tx.day;
  found.credit.pays.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

// Pagos fijos del plan que parecen ser este mismo préstamo (para no verlos dos veces en «Por pagar»).
export function creditPlanMatches(s, c) {
  const want = c.payment + c.fee;
  return (s.money.plans || []).filter((p) => p.kind === 'gasto' && !p.paused && p.currency === c.currency && (p.cat === 'deuda' || /prestamo|préstamo|financ|cuota/i.test(p.name))
    && want > 0 && Math.abs((Number(p.amount) || 0) - want) <= want * 0.25);
}

// ---------- Para el plan de salir de deudas y el análisis ----------

// Intereses y seguros que pagaste entre dos días, en pesos (de todos los préstamos).
export function creditCosts(s, from, to) {
  let interest = 0; let fees = 0; let principal = 0; let n = 0;
  for (const c of (s.money && s.money.credits) || []) {
    const rate = fxRate(s, to);
    for (const r of creditLedger(c).rows) {
      if ((r.type !== 'cuota' && r.type !== 'abono') || r.day < from || r.day > to) continue;
      interest += toDOP(r.interest, c.currency, rate);
      fees += toDOP(r.fee, c.currency, rate);
      principal += toDOP(r.principal, c.currency, rate);
      n += 1;
    }
  }
  return { interest: r2(interest), fees: r2(fees), principal: r2(principal), n, total: r2(interest + fees + principal) };
}
