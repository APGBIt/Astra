// Resumen de Finanzas (1.18): lo que tienes disponible, separado de los gastos del mes; y lo que debes a largo
// plazo, separado de lo del día a día. Un solo cálculo para el Resumen, la pestaña Deudas y el Análisis, así
// «te queda» y «debes» dicen lo mismo en todas partes.
import { addDays, diffDays, monthKey } from '../app/dates.js';
import { fxRate, toDOP } from './logic.js';
import { balances, moneyTotals, untilPayday, dueItems, monthPlan, monthEnd, isCard, cardInfo, nextMonth } from './money.js';
import { monthProjection, prevMonth, debtLoad } from './stats.js';
import { openCredits, creditInfo, creditBalanceAt, creditKind } from './credits.js';
import { openLoans, leftOf } from './loans.js';
import { balancesAt } from './worth.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sum = (xs, f = (x) => x) => r2(xs.reduce((a, x) => a + (Number(f(x)) || 0), 0));

// ---------- Disponible ----------

// Lo que puedes usar sin tocar tus ahorros: lo que hay en cuentas y efectivo menos lo que ya está comprometido
// hasta tu próximo cobro (pagos fijos, cuotas, lo que quedaste en pagarle a alguien). Sin sueldo programado,
// hasta fin de mes.
export function availableNow(s, today) {
  const bal = balances(s);
  const t = moneyTotals(s, today, bal);
  const pay = untilPayday(s, today);
  if (pay) {
    // Lo que vence el mismo día del cobro sale de lo que cobras: no resta del disponible, pero se avisa.
    const onPayday = pay.days > 0 ? dueItems(s, pay.next.date, pay.next.date, today, { bal }).filter((it) => it.kind === 'gasto' && !(it.type === 'plan' && it.viaCard) && !it.estimate) : [];
    return {
      ready: t.ready, liquid: t.liquid, savings: t.savings, have: t.haveDOP, committed: pay.pay, items: pay.items, loans: pay.loans,
      free: pay.free, perDay: pay.perDay, until: pay.next.date, days: pay.days, kind: 'cobro', next: pay.next, credit: t.credit,
      onPayday, onPaydayTotal: sum(onPayday, (it) => it.dop),
    };
  }
  const end = monthEnd(monthKey(today));
  const rate = fxRate(s, today);
  const items = dueItems(s, today, end, today, { bal }).filter((it) => it.kind === 'gasto' && !(it.type === 'plan' && it.viaCard) && !it.estimate);
  const loans = openLoans(s, 'yo').filter((l) => l.due && l.due <= end).map((l) => ({ l, dop: toDOP(leftOf(l), l.currency, rate) }));
  const committed = r2(sum(items, (it) => it.dop) + sum(loans, (x) => x.dop));
  const days = diffDays(today, end) + 1;
  const free = t.ready ? r2(t.liquid - committed) : null;
  return { ready: t.ready, liquid: t.liquid, savings: t.savings, have: t.haveDOP, committed, items, loans, free, perDay: free != null ? r2(free / days) : null, until: end, days, kind: 'mes', next: null, credit: t.credit, onPayday: [], onPaydayTotal: 0 };
}

// ---------- Los gastos del mes ----------

// Entra, lo fijo (pagado y por pagar, con las cuotas de préstamos), lo apartado para pagos futuros y el día a
// día. «Te queda» es lo que sobra para el día a día después de lo fijo y lo apartado; el ritmo dice si, gastando
// como vas, te alcanza.
export function monthView(s, today) {
  const mk = monthKey(today);
  const mp = monthPlan(s, mk, today);
  const pr = monthProjection(s, today);
  const daysLeft = mp.daysLeft || 1;
  const paceNeed = r2(pr.daily * daysLeft);
  const paceEnd = r2(mp.left - paceNeed);
  return {
    mk, income: mp.income, got: mp.got, toGet: r2(Math.max(0, mp.income - mp.got)), planned: mp.planned, extra: mp.extra,
    fixed: mp.fixed, fixedPaid: mp.fixedPaid, fixedLeft: r2(Math.max(0, mp.fixed - mp.fixedPaid)), funds: mp.funds,
    variable: mp.variable, spent: r2(mp.fixedPaid + mp.variable), budgets: mp.budgets, hasPlans: mp.hasPlans,
    left: mp.left, daysLeft, perDay: mp.left > 0 ? r2(mp.left / daysLeft) : 0, daily: pr.daily, paceEnd, over: paceEnd < 0,
    committedTotal: r2(mp.fixed + mp.funds),
  };
}

// ---------- Lo que debes ----------

// A largo plazo: los préstamos que terminan en más de un año (hipoteca, carro, estudios). A corto plazo (lo del
// día a día): tarjetas, préstamos que terminan en un año o menos y lo que le debes a otras personas.
export const LONG_DAYS = 365;
export function isLongTerm(c, inf, today) {
  if (inf.end) return diffDays(today, inf.end) > LONG_DAYS;
  return (Number(c.term) || 0) > 12;
}

export function debtSplit(s, today) {
  const rate = fxRate(s, today);
  const bal = balances(s);
  const long = []; const short = []; const me = [];
  for (const c of openCredits(s)) {
    const inf = creditInfo(c, today);
    const row = { type: 'credit', id: c.id, c, inf, name: c.name, icon: creditKind(c.kind).icon, balance: r2(toDOP(inf.balance, c.currency, rate)), monthly: r2(toDOP(inf.perMonth, c.currency, rate)), end: inf.end || null, late: inf.late };
    (isLongTerm(c, inf, today) ? long : short).push(row);
  }
  for (const a of s.money.accounts) {
    if (!isCard(a) || a.hidden) continue;
    const ci = cardInfo(s, a, today, bal);
    const owed = r2(ci.owed.DOP + ci.owed.USD * rate);
    if (!(owed > 0)) continue;
    const toPay = r2(ci.toPay.DOP + ci.toPay.USD * rate);
    short.push({ type: 'card', id: a.id, a, ci, name: a.name, icon: 'card', balance: owed, monthly: toPay, due: ci.cycle ? ci.cycle.due : null, late: ci.status === 'late' });
  }
  for (const l of openLoans(s)) {
    const left = r2(toDOP(leftOf(l), l.currency, rate));
    if (!(left > 0)) continue;
    const row = { type: 'loan', id: l.id, l, name: l.who, icon: l.dir === 'me' ? 'download' : 'upload', balance: left, due: l.due, late: !!(l.due && l.due < today) };
    (l.dir === 'me' ? me : short).push(row);
  }
  long.sort((a, b) => b.balance - a.balance);
  const order = { card: 0, credit: 1, loan: 2 };
  short.sort((a, b) => order[a.type] - order[b.type] || b.balance - a.balance);
  // Lo que se va en deudas cada mes (cuotas, cargos y el pago de tus tarjetas) frente a lo que entra: el mismo
  // cálculo de «Lo que se va en deudas» del Análisis.
  const dl = debtLoad(s, today);
  const income = dl.income > 0 ? dl.income : monthlyIncome(s, today);
  const installments = dl.commitments;
  return {
    long: { items: long, total: sum(long, (x) => x.balance), monthly: sum(long, (x) => x.monthly) },
    short: { items: short, total: sum(short, (x) => x.balance), cards: sum(short.filter((x) => x.type === 'card'), (x) => x.balance), people: sum(short.filter((x) => x.type === 'loan'), (x) => x.balance) },
    me: { items: me, total: sum(me, (x) => x.balance) },
    total: r2(sum(long, (x) => x.balance) + sum(short, (x) => x.balance)),
    installments, income, dti: income > 0 ? installments / income : null,
  };
}

// Lo que te entra en un mes normal: el promedio de los últimos 3 meses completos; si no hay, lo programado.
export function monthlyIncome(s, today) {
  const vals = [];
  let mk = prevMonth(monthKey(today));
  for (let i = 0; i < 3; i++, mk = prevMonth(mk)) { const mp = monthPlan(s, mk, today); if (mp.got > 0) vals.push(mp.got); }
  if (vals.length) return r2(vals.reduce((a, b) => a + b, 0) / vals.length);
  return monthPlan(s, monthKey(today), today).income;
}

// Pagos de deudas sobre ingresos (como en el Análisis): hasta 20 % es sano; hasta 36 %, con cuidado; más, alto.
export function dtiLevel(dti) {
  if (dti == null) return null;
  if (dti <= 0.2) return { key: 'ok', label: 'Sano', tone: 'good' };
  if (dti <= 0.36) return { key: 'atento', label: 'Con cuidado', tone: 'xp' };
  return { key: 'alto', label: 'Alto', tone: 'vit' };
}

// ---------- Mes a mes (para el Análisis) ----------

const lastMonths = (today, n) => { const mks = [monthKey(today)]; while (mks.length < n) mks.unshift(prevMonth(mks[0])); return mks; };
const monthCut = (mk, today) => { const e = monthEnd(mk); return e > today ? today : e; };

// Lo fijo (pagos fijos y cuotas que pagaste), el día a día y lo que entró, por mes.
export function fixedVarSeries(s, today, n = 6) {
  return lastMonths(today, n).map((mk) => {
    const mp = monthPlan(s, mk, today);
    return { mk, fixed: mp.fixedPaid, variable: mp.variable, income: mp.got, current: mk === monthKey(today) };
  });
}

// Lo que debías al cierre de cada mes, a largo y a corto plazo (con la clasificación de hoy de cada préstamo).
export function debtSeries(s, today, n = 6) {
  const longIds = new Set(debtSplit(s, today).long.items.map((x) => x.id));
  return lastMonths(today, n).map((mk) => {
    const day = monthCut(mk, today);
    const rate = fxRate(s, day);
    let long = 0; let short = 0;
    for (const c of s.money.credits || []) {
      const b = toDOP(creditBalanceAt(c, day), c.currency, rate);
      if (longIds.has(c.id)) long += b; else short += b;
    }
    const b = balancesAt(s, day);
    for (const a of s.money.accounts) {
      if (!isCard(a) || a.hidden) continue;
      const v = b[a.id] || { DOP: 0, USD: 0 };
      const dop = v.DOP + v.USD * rate;
      if (dop < 0) short += -dop;
    }
    for (const l of s.money.loans || []) {
      if (l.dir !== 'yo' || l.day > day || (l.closed && l.closed <= day)) continue;
      short += toDOP(leftOf(l, day), l.currency, rate);
    }
    return { mk, long: r2(long), short: r2(short), current: mk === monthKey(today) };
  });
}

export { addDays, nextMonth };
