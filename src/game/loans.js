// Préstamos con personas (1.10): lo que te deben y lo que debes a alguien, con abonos, fecha acordada y aviso.
// El dinero que prestas o te prestan mueve tus cuentas, pero no es un gasto ni un ingreso: sus movimientos van
// marcados «no contar en el análisis». Lo que te deben suma a tu patrimonio; lo que debes, resta.
import { diffDays } from '../app/dates.js';
import { uid, addTx, gainXP, addGold, txOrig, txCur, txKind, fxRate, toDOP } from './logic.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const txt = (v, n = 200) => String(v == null ? '' : v).trim().slice(0, n);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pos = (v) => r2(Math.max(0, Math.abs(Number(v) || 0)));

// «me»: te deben (prestaste). «yo»: debes (te prestaron).
export const LOAN_DIRS = [['me', 'Te deben'], ['yo', 'Debes']];
// Categorías de los movimientos que se crean desde aquí.
export const LOAN_CATS = { lend: 'prestamo_dado', back: 'prestamo_cobrado', borrow: 'prestamo_recibido', repay: 'deuda' };

export function ensureLoans(s) {
  const m = s.money;
  if (!Array.isArray(m.loans)) m.loans = [];
  const ids = new Set((m.tx || []).map((t) => t.id));
  m.loans = m.loans.filter((l) => isObj(l) && l.id && (l.dir === 'me' || l.dir === 'yo') && Number(l.amount) > 0 && isDay(l.day));
  for (const l of m.loans) {
    l.who = txt(l.who, 60) || 'Alguien';
    l.amount = pos(l.amount);
    l.currency = l.currency === 'USD' ? 'USD' : 'DOP';
    l.note = txt(l.note, 200);
    if (!isDay(l.due)) l.due = null;
    if (!isDay(l.closed)) l.closed = null;
    l.forgiven = !!(l.closed && l.forgiven);
    if (l.tx && !ids.has(l.tx)) l.tx = null;
    if (!Array.isArray(l.pays)) l.pays = [];
    l.pays = l.pays.filter((p) => isObj(p) && p.id && Number(p.amount) > 0 && isDay(p.day));
    for (const p of l.pays) { p.amount = pos(p.amount); if (p.tx && !ids.has(p.tx)) p.tx = null; }
  }
}

export const loanOf = (s, id) => ((s.money && s.money.loans) || []).find((l) => l.id === id) || null;
export const paidOf = (l, upTo = null) => r2(l.pays.filter((p) => !upTo || p.day <= upTo).reduce((a, p) => a + p.amount, 0));

// Cuánto falta (en la moneda del préstamo). Saldado o perdonado: 0.
export function leftOf(l, upTo = null) {
  if (upTo && l.day > upTo) return 0;
  if (l.closed && (!upTo || l.closed <= upTo)) return 0;
  return r2(Math.max(0, l.amount - paidOf(l, upTo)));
}

export function loanInfo(l, today) {
  const paid = paidOf(l);
  const left = leftOf(l);
  const late = !l.closed && left > 0 && !!l.due && l.due < today;
  return {
    paid, left, pct: l.amount ? Math.min(1, paid / l.amount) : 0, late, open: !l.closed && left > 0,
    daysLate: late ? diffDays(l.due, today) : 0, dueIn: l.due && !late && !l.closed ? diffDays(today, l.due) : null,
  };
}

// Lo pendiente con personas, en pesos (los dólares, a la tasa de hoy o del día que pidas).
export function loanTotals(s, day) {
  const rate = fxRate(s, day);
  const out = { me: 0, yo: 0, nMe: 0, nYo: 0, late: 0 };
  for (const l of (s.money && s.money.loans) || []) {
    const left = leftOf(l, day);
    if (!(left > 0)) continue;
    const v = toDOP(left, l.currency, rate);
    if (l.dir === 'me') { out.me += v; out.nMe += 1; } else { out.yo += v; out.nYo += 1; }
    if (l.due && l.due < day) out.late += 1;
  }
  out.me = r2(out.me); out.yo = r2(out.yo);
  return out;
}

export function openLoans(s, dir = null) {
  return ((s.money && s.money.loans) || []).filter((l) => (!dir || l.dir === dir) && !l.closed && leftOf(l) > 0);
}

// El movimiento de dinero de un préstamo o de un abono (no cuenta en el análisis).
function moneyTx(s, l, kind, amount, day, account, today, ev) {
  if (!account) return null;
  const lend = l.dir === 'me';
  const p = kind === 'start'
    ? { type: lend ? 'gasto' : 'ingreso', cat: lend ? LOAN_CATS.lend : LOAN_CATS.borrow, merchant: lend ? `Préstamo a ${l.who}` : `Préstamo de ${l.who}` }
    : { type: lend ? 'ingreso' : 'gasto', cat: lend ? LOAN_CATS.back : LOAN_CATS.repay, merchant: lend ? `${l.who} te devolvió` : `Pago a ${l.who}` };
  return addTx(s, { ...p, amount, currency: l.currency, account, day, noStats: true, note: l.note ? `Préstamo: ${l.note}` : '' }, today, ev);
}

// Nuevo préstamo. Con `account`, también anota la salida (o entrada) de dinero. Con `tx`, lo liga a un movimiento que ya existe.
export function addLoan(s, p, today, ev = []) {
  const amount = pos(p.amount);
  if (!(amount > 0)) return null;
  const l = {
    id: uid(), dir: p.dir === 'yo' ? 'yo' : 'me', who: txt(p.who, 60) || 'Alguien', amount, currency: p.currency === 'USD' ? 'USD' : 'DOP',
    day: isDay(p.day) ? p.day : today, due: isDay(p.due) ? p.due : null, note: txt(p.note, 200), tx: null, pays: [], closed: null, forgiven: false,
    created: Date.now(),
  };
  if (p.tx) {
    const t = s.money.tx.find((x) => x.id === p.tx);
    if (t) { l.tx = t.id; t.noStats = true; }
  } else if (p.account) {
    const t = moneyTx(s, l, 'start', amount, l.day, p.account, today, ev);
    if (t) l.tx = t.id;
  }
  s.money.loans.unshift(l);
  return l;
}

// Un movimiento que ya anotaste (una transferencia a Luis) se vuelve préstamo: «me lo van a devolver».
export function loanFromTx(s, txId, p = {}, today, ev = []) {
  const t = s.money.tx.find((x) => x.id === txId);
  if (!t || loanForTx(s, txId)) return null;
  const k = txKind(t);
  if (k === 'transfer') return null;
  return addLoan(s, { dir: k === 'ingreso' ? 'yo' : 'me', who: p.who || t.merchant, amount: txOrig(t), currency: txCur(t), day: t.day, due: p.due, note: p.note || t.note, tx: t.id }, today, ev);
}

// El préstamo (y el abono) al que pertenece un movimiento.
export function loanForTx(s, txId) {
  for (const l of (s.money && s.money.loans) || []) {
    if (l.tx === txId) return { loan: l, pay: null };
    const pay = l.pays.find((p) => p.tx === txId);
    if (pay) return { loan: l, pay };
  }
  return null;
}

function settle(s, l, day, today, ev) {
  if (l.closed || leftOf(l) > 0) return;
  l.closed = day;
  if (l.dir === 'yo') { gainXP(s, 'finanzas', 15, today, ev); addGold(s, 5, today); }
  else gainXP(s, 'finanzas', 5, today, ev);
  ev.push({ type: 'loanDone', dir: l.dir, who: l.who });
}

// Un abono. Con `account`, anota el dinero que entra (o sale). Con `tx`, lo liga a un movimiento que ya anotaste.
export function payLoan(s, id, p, today, ev = []) {
  const l = loanOf(s, id);
  if (!l || l.closed) return null;
  const amount = Math.min(pos(p.amount), leftOf(l));
  if (!(amount > 0)) return null;
  const pay = { id: uid(), day: isDay(p.day) ? p.day : today, amount, tx: null };
  if (p.tx) {
    const t = s.money.tx.find((x) => x.id === p.tx);
    if (t && !loanForTx(s, t.id)) { pay.tx = t.id; t.noStats = true; }
  } else if (p.account) {
    const t = moneyTx(s, l, 'pay', amount, pay.day, p.account, today, ev);
    if (t) pay.tx = t.id;
  }
  l.pays.push(pay);
  l.pays.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  settle(s, l, pay.day, today, ev);
  return pay;
}

// Quita un abono (y su movimiento, si lo creó Astra o si lo pides).
export function removePay(s, id, payId, { withTx = true } = {}) {
  const l = loanOf(s, id);
  if (!l) return false;
  const pay = l.pays.find((p) => p.id === payId);
  if (!pay) return false;
  l.pays = l.pays.filter((p) => p.id !== payId);
  if (withTx && pay.tx) s.money.tx = s.money.tx.filter((t) => t.id !== pay.tx && t.taxOf !== pay.tx);
  if (l.closed && !l.forgiven && leftOf({ ...l, closed: null }) > 0) l.closed = null;
  return true;
}

// Perdonar lo que falta (o «me lo perdonaron»): se cierra sin más abonos.
export function forgiveLoan(s, id, today) {
  const l = loanOf(s, id);
  if (!l || l.closed) return null;
  l.closed = today;
  l.forgiven = true;
  return l;
}

export function reopenLoan(s, id) {
  const l = loanOf(s, id);
  if (!l) return null;
  l.closed = null;
  l.forgiven = false;
  return l;
}

export function updateLoan(s, id, p) {
  const l = loanOf(s, id);
  if (!l) return null;
  if (p.who !== undefined) l.who = txt(p.who, 60) || l.who;
  if (p.amount !== undefined && pos(p.amount) > 0) l.amount = pos(p.amount);
  if (p.currency !== undefined) l.currency = p.currency === 'USD' ? 'USD' : 'DOP';
  if (p.day !== undefined && isDay(p.day)) l.day = p.day;
  if (p.due !== undefined) l.due = isDay(p.due) ? p.due : null;
  if (p.note !== undefined) l.note = txt(p.note, 200);
  if (l.closed && !l.forgiven && leftOf({ ...l, closed: null }) > 0) l.closed = null;
  else if (!l.closed && leftOf(l) <= 0 && l.pays.length) l.closed = l.pays[l.pays.length - 1].day;
  return l;
}

// Borra el préstamo. Con `withTx`, también los movimientos que lo acompañan.
export function removeLoan(s, id, { withTx = false } = {}) {
  const l = loanOf(s, id);
  if (!l) return false;
  if (withTx) {
    const drop = new Set([l.tx, ...l.pays.map((p) => p.tx)].filter(Boolean));
    s.money.tx = s.money.tx.filter((t) => !drop.has(t.id) && !drop.has(t.taxOf));
  }
  s.money.loans = s.money.loans.filter((x) => x.id !== id);
  return true;
}

// Para los avisos: préstamos con fecha acordada entre `from` y `to`.
export function loansDue(s, from, to) {
  return openLoans(s).filter((l) => l.due && l.due >= from && l.due <= to);
}
