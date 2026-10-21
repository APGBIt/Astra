// Dinero (1.5): saldo de cada cuenta, tarjetas con corte y pago, pagos y cobros programados,
// apartados para pagos futuros, flujo de los próximos días, plan del mes y presupuestos con ritmo y sobrante.
// Todo se calcula a partir de los movimientos: no hay saldos guardados que se puedan desfasar.
import { addDays, diffDays, monthKey, fmtDay, weekday, DAYS, MONTHS } from '../app/dates.js';
import {
  txKind, txCur, txOrig, txDOP, txUSD, accountOf, fxRate, toDOP, catOf, uid, merchantKey,
  gainXP, addGold, bossFeed, inStats,
} from './logic.js';
import { CATEGORY_GROUPS } from './content.js';
import { ensureLoans, openLoans, leftOf } from './loans.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const CURS = ['DOP', 'USD'];
const zero = () => ({ DOP: 0, USD: 0 });
const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const pos = (n) => Math.max(0, r2(n));

// ----- Fechas por mes -----

const ym = (day) => day.split('-').slice(0, 2).map(Number);
const daysIn = (y, m) => new Date(y, m, 0).getDate();
// Un día del mes; 31 (o 30) en un mes más corto pasa al último día.
export function dayOf(y, m, d) {
  const dd = Math.min(Math.max(1, Number(d) || 1), daysIn(y, m));
  return `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}
function addMonths(y, m, n) {
  const t = y * 12 + (m - 1) + n;
  return [Math.floor(t / 12), (t % 12) + 1];
}
export const monthEnd = (mk) => { const [y, m] = mk.split('-').map(Number); return dayOf(y, m, 31); };
export const nextMonth = (mk) => { const [y, m] = mk.split('-').map(Number); const [a, b] = addMonths(y, m, 1); return `${a}-${String(b).padStart(2, '0')}`; };
export function monthsUntil(today, day) {
  const [y1, m1] = ym(today);
  const [y2, m2] = ym(day);
  return (y2 - y1) * 12 + (m2 - m1);
}

// ----- Cuentas y saldos -----

export const isCard = (a) => !!a && a.kind === 'tarjeta';
export const accountCur = (a) => (a && a.currency === 'USD' ? 'USD' : 'DOP');

// La cuenta que de verdad se mueve: una tarjeta de débito mueve el dinero de su cuenta de banco.
export function moneyAccount(s, id) {
  const a = accountOf(s, id);
  if (!a) return null;
  if (a.kind === 'debito' && a.of) {
    const p = accountOf(s, a.of);
    if (p && p.kind !== 'debito' && p.kind !== 'tarjeta') return p;
  }
  return a;
}

// Qué le hace un movimiento a cada cuenta: [[id, moneda, cambio]].
// Las tarjetas llevan dos saldos (pesos y dólares); las demás cuentas, uno en su moneda.
export function txLegs(s, t) {
  const out = [];
  const k = txKind(t);
  const leg = (id, sign) => {
    const a = moneyAccount(s, id);
    if (!a) return;
    if (isCard(a)) { out.push([a.id, txCur(t), sign * txOrig(t)]); return; }
    const c = accountCur(a);
    const v = c === txCur(t) ? txOrig(t) : c === 'DOP' ? txDOP(t) : txUSD(s, t);
    out.push([a.id, c, sign * v]);
  };
  if (k === 'gasto') leg(t.account, -1);
  else if (k === 'ingreso') leg(t.account, 1);
  else {
    leg(t.account, -1);
    if (t.to && t.to !== t.account) leg(t.to, 1);
  }
  return out;
}

// ¿Cuenta este movimiento? Lo anterior al saldo que anotaste ya está dentro de ese saldo.
// Cada moneda puede tener su propio momento (`base.by.USD`): lo que dijo el banco de cada una.
export function anchorOf(a, c) {
  const b = a && a.base;
  if (!b) return null;
  return (b.by && b.by[c]) || b;
}
export function afterAnchor(b, t) {
  if (!b || !isDay(b.day)) return true;
  if (t.day !== b.day) return t.day > b.day;
  if (t.time && b.time) return t.time > b.time;
  return (Number(t.created) || 0) > (Number(b.at) || 0);
}
function counts(a, t, c) {
  return afterAnchor(anchorOf(a, c), t);
}

// Saldo de cada cuenta: { id: { DOP, USD } }. En una tarjeta, negativo = lo que debes.
export function balances(s) {
  const out = {};
  for (const a of s.money.accounts) {
    out[a.id] = zero();
    if (a.base) { out[a.id].DOP = Number(a.base.DOP) || 0; out[a.id].USD = Number(a.base.USD) || 0; }
  }
  for (const t of s.money.tx) {
    for (const [id, c, v] of txLegs(s, t)) {
      const a = accountOf(s, id);
      if (a && counts(a, t, c)) out[id][c] = r2(out[id][c] + v);
    }
  }
  return out;
}

// Las cuentas que se muestran con saldo propio (una tarjeta de débito ligada a su cuenta, no).
export const ownsBalance = (s, a) => !a.hidden && (moneyAccount(s, a.id) || {}).id === a.id;

// Lo que tienes (cuentas y efectivo), lo que debes (tarjetas) y el neto, en pesos y en dólares.
export function moneyTotals(s, today, bal = null) {
  const b = bal || balances(s);
  const rate = fxRate(s, today);
  const have = zero();
  const owe = zero();
  let liquid = 0;
  let savings = 0;
  for (const a of s.money.accounts) {
    if (!ownsBalance(s, a)) continue;
    const v = b[a.id] || zero();
    for (const c of CURS) {
      if (isCard(a)) { if (v[c] < 0) owe[c] += -v[c]; else have[c] += v[c]; }
      else have[c] += v[c];
    }
    if (!isCard(a)) { if (a.save) savings += v.DOP + v.USD * rate; else liquid += v.DOP + v.USD * rate; }
  }
  const haveDOP = have.DOP + have.USD * rate;
  const oweDOP = owe.DOP + owe.USD * rate;
  const credit = zero();
  let creditKnown = false;
  for (const a of s.money.accounts) {
    if (!isCard(a) || a.hidden) continue;
    const ci = cardInfo(s, a, today, b);
    for (const c of CURS) if (ci.avail[c] != null) { credit[c] += Math.max(0, ci.avail[c]); creditKnown = true; }
  }
  return {
    credit: creditKnown ? { DOP: r2(credit.DOP), USD: r2(credit.USD) } : null,
    have: { DOP: r2(have.DOP), USD: r2(have.USD) }, owe: { DOP: r2(owe.DOP), USD: r2(owe.USD) },
    haveDOP: r2(haveDOP), oweDOP: r2(oweDOP), net: r2(haveDOP - oweDOP), liquid: r2(liquid), savings: r2(savings), rate,
    ready: s.money.accounts.some((a) => a.base),
  };
}

const hm = (now) => { const d = new Date(now); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// «Mi saldo de hoy es…»: guarda el saldo de este momento; lo que registres después se suma o se resta.
// En una tarjeta se pasa lo que debes (positivo) y se guarda como saldo negativo.
// `when` (opcional): { day, time } de otro momento, como la fecha de un estado de cuenta.
export function setAccountBalance(s, id, amounts, today, now = Date.now(), when = null) {
  const a = accountOf(s, id);
  if (!a) return null;
  const v = (c) => r2(Math.abs(Number(amounts[c]) || 0));
  const day = when && isDay(when.day) ? when.day : today;
  const time = when ? when.time || '' : hm(now);
  a.base = isCard(a)
    ? { day, at: now, time, DOP: -v('DOP'), USD: -v('USD') }
    : { day, at: now, time, DOP: accountCur(a) === 'DOP' ? r2(Number(amounts.DOP) || 0) : 0, USD: accountCur(a) === 'USD' ? r2(Number(amounts.USD) || 0) : 0 };
  return a;
}

// Lo que dice el banco que tienes disponible (en una tarjeta, el crédito disponible) en un momento dado.
// En una cuenta, ese es su saldo. En una tarjeta con límite, lo que debes = límite − disponible.
// Sin límite se guarda igual y el disponible de hoy se calcula con los movimientos que vinieron después.
// Devuelve 'balance' (ajustó el saldo), 'card' (ajustó la deuda), 'avail' (solo guardó el disponible) u '' (más viejo que lo que ya había).
export function setAvailable(s, id, { currency = 'DOP', amount, day, time = '', limit = null, source = '' }, today, now = Date.now()) {
  const a = moneyAccount(s, id);
  if (!a || !isDay(day) || !Number.isFinite(Number(amount))) return '';
  const c = currency === 'USD' ? 'USD' : 'DOP';
  const when = { day, time };
  const newer = (b) => !b || day > b.day || (day === b.day && (time || '') >= (b.time || ''));
  if (!isCard(a)) {
    if (accountCur(a) !== c || !newer(a.base)) return '';
    setAccountBalance(s, a.id, { [c]: Number(amount) }, today, now, when);
    a.base.src = String(source || '').slice(0, 80);
    return 'balance';
  }
  if (!a.bankAvail || typeof a.bankAvail !== 'object') a.bankAvail = {};
  if (a.bankAvail[c] && !newer(a.bankAvail[c])) return '';
  a.bankAvail[c] = { amount: r2(amount), day, time, src: String(source || '').slice(0, 80) };
  if (Number(limit) > 0) a.limit = { ...(a.limit || { DOP: 0, USD: 0 }), [c]: r2(limit) };
  const lim = Number(a.limit && a.limit[c]) || 0;
  if (!(lim > 0)) return 'avail';
  const owed = r2(Math.max(0, lim - Number(amount)));
  if (!a.base) a.base = { day, time, at: now, DOP: 0, USD: 0 };
  if (!a.base.by) a.base.by = {};
  a.base[c] = -owed;
  a.base.by[c] = { day, time, at: now };
  return 'card';
}

// Disponible de hoy a partir de lo último que dijo el banco y lo que pasó después (sin conocer el límite).
function availFromBank(s, a, c) {
  const ref = a.bankAvail && a.bankAvail[c];
  if (!ref) return null;
  let v = Number(ref.amount) || 0;
  for (const t of s.money.tx) {
    if (!afterAnchor(ref, t)) continue;
    for (const [id, cc, d] of txLegs(s, t)) if (id === a.id && cc === c) v += d;
  }
  return r2(v);
}

// ----- Tarjetas de crédito: corte, pago y estado -----

// El corte cierra al final de su día. `last`: el corte más reciente antes de hoy; `due`: su fecha límite de pago.
export function cardCycle(a, today) {
  if (!isCard(a) || !(Number(a.cut) >= 1)) return null;
  const [y, m] = ym(today);
  const thisCut = dayOf(y, m, a.cut);
  let last;
  let next;
  if (thisCut < today) {
    last = thisCut;
    const [ny, nm] = addMonths(y, m, 1);
    next = dayOf(ny, nm, a.cut);
  } else {
    const [py, pm] = addMonths(y, m, -1);
    last = dayOf(py, pm, a.cut);
    next = thisCut;
  }
  const dueOf = (cut) => {
    if (!(Number(a.due) >= 1)) return null;
    const [cy, cm] = ym(cut);
    let d = dayOf(cy, cm, a.due);
    if (d <= cut) { const [ny, nm] = addMonths(cy, cm, 1); d = dayOf(ny, nm, a.due); }
    return d;
  };
  return { last, next, due: dueOf(last), nextDue: dueOf(next), best: addDays(next, 1) };
}

// Todo lo de una tarjeta: deuda, disponible, estado del último corte y cuánto falta pagar.
export function cardInfo(s, a, today, bal = null) {
  const b = (bal || balances(s))[a.id] || zero();
  const owed = { DOP: pos(-b.DOP), USD: pos(-b.USD) };
  const favor = { DOP: pos(b.DOP), USD: pos(b.USD) };
  const limit = { DOP: Number(a.limit && a.limit.DOP) || 0, USD: Number(a.limit && a.limit.USD) || 0 };
  const avail = {
    DOP: limit.DOP ? r2(limit.DOP - owed.DOP) : availFromBank(s, a, 'DOP'),
    USD: limit.USD ? r2(limit.USD - owed.USD) : availFromBank(s, a, 'USD'),
  };
  const use = Math.max(limit.DOP ? owed.DOP / limit.DOP : 0, limit.USD ? owed.USD / limit.USD : 0);
  const cycle = cardCycle(a, today);
  const info = { a, owed, favor, limit, avail, use, cycle, bank: a.bankAvail || {}, since: zero(), paid: zero(), stmt: zero(), toPay: zero(), min: null, estimated: false, status: 'nocut', daysToDue: null };
  if (!cycle) return info;
  const after = zero();
  for (const t of s.money.tx) {
    if (t.day <= cycle.last) continue;
    for (const [id, c, v] of txLegs(s, t)) {
      if (id !== a.id) continue;
      after[c] += v;
      if (v < 0) info.since[c] += -v;
      else if (txKind(t) === 'transfer') info.paid[c] += v;
      else info.since[c] -= v; // devolución
    }
  }
  for (const c of CURS) { info.since[c] = pos(info.since[c]); info.paid[c] = r2(info.paid[c]); }
  const own = a.stmt && a.stmt.cut === cycle.last ? a.stmt : null;
  if (own) {
    info.stmt = { DOP: pos(own.DOP), USD: pos(own.USD) };
    info.min = { DOP: pos(own.minDOP), USD: pos(own.minUSD) };
  } else {
    // Saldo al corte = saldo de hoy sin lo que pasó después del corte.
    info.stmt = { DOP: pos(-(b.DOP - after.DOP)), USD: pos(-(b.USD - after.USD)) };
    info.estimated = true;
  }
  info.toPay = { DOP: pos(info.stmt.DOP - info.paid.DOP), USD: pos(info.stmt.USD - info.paid.USD) };
  info.daysToDue = cycle.due ? diffDays(today, cycle.due) : null;
  const any = (o) => o.DOP > 0 || o.USD > 0;
  info.status = !any(info.stmt) ? 'none' : !any(info.toPay) ? 'paid' : info.daysToDue != null && info.daysToDue < 0 ? 'late' : 'due';
  return info;
}

// Lo que dice tu estado de cuenta (si no coincide con lo calculado). Se borra solo con el corte siguiente.
export function setCardStatement(s, id, cut, p) {
  const a = accountOf(s, id);
  if (!isCard(a)) return null;
  if (!p) { a.stmt = null; return a; }
  a.stmt = { cut, DOP: pos(p.DOP), USD: pos(p.USD), minDOP: pos(p.minDOP), minUSD: pos(p.minUSD) };
  return a;
}

// ----- Pagos y cobros programados -----
// plan: { id, kind: gasto|ingreso, name, amount, currency, variable, cat, account, freq, start, until, remind,
//         paused, fund: { saved } | null, done: { fecha: txId | 'skip' }, created }
// freq: { type: 'month', days: [15, 31] } (31 = último día) · { type: 'week', n, anchor }
//       { type: 'months', n, anchor } (cada n meses; 12 = cada año) · { type: 'once', date }

const dayMonth = (d) => `${Number(d.slice(8))} de ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
// «Cada mes, el 25», «Los días 15 y último día», «Cada año, el 31 de enero»…
export function planFreqLabel(p) {
  const f = p.freq;
  const dayTxt = (d) => (d >= 31 ? 'último día' : String(d));
  if (f.type === 'month') {
    if (f.days.length === 1) return f.days[0] >= 31 ? 'Cada mes, el último día' : `Cada mes, el ${f.days[0]}`;
    return `Los días ${f.days.slice(0, -1).map(dayTxt).join(', ')} y ${dayTxt(f.days[f.days.length - 1])}`;
  }
  if (f.type === 'week') return f.n === 1 ? `Cada ${DAYS[weekday(f.anchor)]}` : `Cada ${f.n} semanas (${DAYS[weekday(f.anchor)]})`;
  if (f.type === 'months') return f.n === 12 ? `Cada año, el ${dayMonth(f.anchor)}` : f.n === 1 ? `Cada mes, el ${Number(f.anchor.slice(8))}` : `Cada ${f.n} meses`;
  return `Una vez, el ${fmtDay(f.date, { weekdayName: false })}`;
}

export function normPlanFreq(f, today) {
  const o = f && typeof f === 'object' ? f : {};
  if (o.type === 'once') return { type: 'once', date: isDay(o.date) ? o.date : today };
  if (o.type === 'week') return { type: 'week', n: Math.min(8, Math.max(1, Math.round(Number(o.n) || 1))), anchor: isDay(o.anchor) ? o.anchor : today };
  if (o.type === 'months') return { type: 'months', n: Math.min(24, Math.max(1, Math.round(Number(o.n) || 1))), anchor: isDay(o.anchor) ? o.anchor : today };
  const days = [...new Set((Array.isArray(o.days) ? o.days : [Number(today.slice(8))]).map((d) => Math.round(Number(d))).filter((d) => d >= 1 && d <= 31))].sort((a, b) => a - b).slice(0, 4);
  return { type: 'month', days: days.length ? days : [Number(today.slice(8))] };
}

// Pagos de cada mes (o más seguido) frente a pagos que llegan de vez en cuando (se aparta para ellos).
export const isMonthly = (p) => p.freq.type === 'month' || p.freq.type === 'week' || (p.freq.type === 'months' && p.freq.n === 1);
export const isFundPlan = (p) => p.kind === 'gasto' && !isMonthly(p);

export function planDates(p, from, to) {
  const f = p.freq || {};
  const out = [];
  const start = p.start && p.start > from ? p.start : from;
  const end = p.until && p.until < to ? p.until : to;
  if (start > end) return out;
  if (f.type === 'once') { if (f.date >= start && f.date <= end) out.push(f.date); return out; }
  if (f.type === 'month') {
    let [y, m] = ym(start);
    const [ey, em] = ym(end);
    let guard = 0;
    while ((y < ey || (y === ey && m <= em)) && guard++ < 400) {
      for (const d of f.days || []) { const k = dayOf(y, m, d); if (k >= start && k <= end && !out.includes(k)) out.push(k); }
      [y, m] = addMonths(y, m, 1);
    }
    return out.sort();
  }
  if (f.type === 'week') {
    const step = Math.max(1, Number(f.n) || 1) * 7;
    let k = f.anchor;
    const gap = diffDays(f.anchor, start);
    if (gap > 0) k = addDays(f.anchor, Math.ceil(gap / step) * step);
    let guard = 0;
    while (k <= end && guard++ < 400) { if (k >= start) out.push(k); k = addDays(k, step); }
    return out;
  }
  if (f.type === 'months') {
    const n = Math.max(1, Number(f.n) || 1);
    const [ay, am] = ym(f.anchor);
    const ad = Number(f.anchor.slice(8));
    const [sy, sm] = ym(start);
    let i = Math.max(0, Math.floor(((sy - ay) * 12 + (sm - am)) / n) - 1);
    for (let guard = 0; guard < 400; guard++, i++) {
      const [yy, mm] = addMonths(ay, am, i * n);
      const k = dayOf(yy, mm, ad);
      if (k > end) break;
      if (k >= start) out.push(k);
    }
    return out;
  }
  return out;
}

export const planDOP = (s, p, today) => toDOP(Number(p.amount) || 0, p.currency === 'USD' ? 'USD' : 'DOP', fxRate(s, today));
const txById = (s, id) => (id && id !== 'skip' ? s.money.tx.find((t) => t.id === id) || null : null);

export function planStatus(p, date, today) {
  const d = p.done && p.done[date];
  if (d === 'skip') return 'skip';
  if (d) return 'done';
  if (date < today) return 'late';
  if (date === today) return 'today';
  return diffDays(today, date) <= (Number(p.remind) >= 0 ? Number(p.remind) : 3) ? 'soon' : 'later';
}

// Fechas de todos los planes entre dos días, con su estado y (si ya se pagó) su movimiento.
export function planOccurrences(s, from, to, today) {
  const out = [];
  for (const p of s.money.plans || []) {
    if (p.paused) continue;
    for (const date of planDates(p, from, to)) {
      const status = planStatus(p, date, today);
      const tx = status === 'done' ? txById(s, p.done[date]) : null;
      out.push({ p, date, status, tx });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function addPlan(s, p, today) {
  const name = String(p.name || '').trim().slice(0, 50);
  const amount = r2(Math.abs(Number(p.amount) || 0));
  if (name.length < 2) return null;
  const kind = p.kind === 'ingreso' ? 'ingreso' : 'gasto';
  const plan = {
    id: `pl${uid()}`, kind, name, amount, currency: p.currency === 'USD' ? 'USD' : 'DOP', variable: !!p.variable,
    cat: p.cat && catOf(s, p.cat).type === kind ? p.cat : kind === 'ingreso' ? 'salario' : 'otros',
    account: p.account && accountOf(s, p.account) ? p.account : '',
    freq: normPlanFreq(p.freq, today), start: isDay(p.start) ? p.start : today, until: isDay(p.until) ? p.until : null,
    remind: Number.isFinite(Number(p.remind)) ? Math.min(14, Math.max(0, Math.round(Number(p.remind)))) : 3,
    paused: false, fund: null, done: {}, created: Date.now(),
  };
  if (isFundPlan(plan)) plan.fund = { saved: pos(p.saved) };
  if (!s.money.plans) s.money.plans = [];
  s.money.plans.push(plan);
  return plan;
}

export function updatePlan(s, id, p, today) {
  const plan = (s.money.plans || []).find((x) => x.id === id);
  if (!plan) return null;
  if (p.name != null && String(p.name).trim().length >= 2) plan.name = String(p.name).trim().slice(0, 50);
  if (p.amount != null) plan.amount = r2(Math.abs(Number(p.amount) || 0));
  if (p.currency) plan.currency = p.currency === 'USD' ? 'USD' : 'DOP';
  if (p.variable != null) plan.variable = !!p.variable;
  if (p.kind) plan.kind = p.kind === 'ingreso' ? 'ingreso' : 'gasto';
  if (p.cat && catOf(s, p.cat).type === plan.kind) plan.cat = p.cat;
  if (p.account != null) plan.account = p.account && accountOf(s, p.account) ? p.account : '';
  if (p.freq) plan.freq = normPlanFreq(p.freq, today);
  if (p.start !== undefined && isDay(p.start)) plan.start = p.start;
  if (p.until !== undefined) plan.until = isDay(p.until) ? p.until : null;
  if (p.remind != null) plan.remind = Math.min(14, Math.max(0, Math.round(Number(p.remind) || 0)));
  if (p.paused != null) plan.paused = !!p.paused;
  if (isFundPlan(plan) && !plan.fund) plan.fund = { saved: 0 };
  if (!isFundPlan(plan)) plan.fund = null;
  return plan;
}

// Lo que de verdad pagaste (o cobraste) las últimas veces, del más nuevo al más viejo, y el promedio
// en la moneda del plan. Sirve para ajustar los pagos que cambian (luz, agua) a lo real.
export function planHistory(s, p, n = 6) {
  const rows = Object.entries(p.done || {}).filter(([, v]) => v && v !== 'skip').map(([date, id]) => ({ date, tx: txById(s, id) })).filter((r) => r.tx)
    .sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, n);
  const vals = rows.map((r) => (txCur(r.tx) === p.currency ? txOrig(r.tx) : p.currency === 'USD' ? txUSD(s, r.tx) : txDOP(r.tx)));
  const last3 = vals.slice(0, 3);
  return { rows: rows.map((r, i) => ({ ...r, amount: r2(vals[i]) })), avg: last3.length ? r2(last3.reduce((a, b) => a + b, 0) / last3.length) : null };
}

export function removePlan(s, id) {
  s.money.plans = (s.money.plans || []).filter((p) => p.id !== id);
}

export function skipPlanDate(s, id, date) {
  const p = (s.money.plans || []).find((x) => x.id === id);
  if (p) p.done[date] = 'skip';
}
export function unmarkPlanDate(s, id, date) {
  const p = (s.money.plans || []).find((x) => x.id === id);
  if (p && p.done) delete p.done[date];
}

// Un pago o cobro hecho: queda ligado a su fecha. Pagar a tiempo da XP de Fortuna.
export function linkPlan(s, planId, date, tx, today, ev = []) {
  const p = (s.money.plans || []).find((x) => x.id === planId);
  if (!p || !tx) return null;
  p.done[date] = tx.id;
  if (p.fund) p.fund.saved = pos((Number(p.fund.saved) || 0) - txDOP(tx));
  if (p.kind === 'gasto' && tx.day <= date) {
    gainXP(s, 'finanzas', 5, today, ev);
    addGold(s, 2, today);
  }
  return p;
}

// Al registrar un movimiento, si se parece a un pago o cobro pendiente (misma categoría o nombre,
// monto parecido, fecha cercana), se marca solo.
export function autoLinkPlan(s, tx, today, ev = []) {
  if (!tx || txKind(tx) === 'transfer') return null;
  const rate = fxRate(s, today);
  let best = null;
  for (const p of s.money.plans || []) {
    if (p.paused || p.kind !== txKind(tx)) continue;
    const byName = merchantKey(p.name) && merchantKey(p.name) === merchantKey(tx.merchant);
    if (p.cat !== tx.cat && !byName) continue;
    const want = toDOP(Number(p.amount) || 0, p.currency, rate);
    const gap = Math.abs(txDOP(tx) - want);
    if (want > 0 && gap > want * (p.variable ? 0.5 : 0.15)) continue;
    for (const date of planDates(p, addDays(tx.day, -10), addDays(tx.day, 10))) {
      if (p.done[date]) continue;
      const score = gap / Math.max(1, want) + Math.abs(diffDays(date, tx.day)) / 30 - (byName ? 0.2 : 0);
      if (!best || score < best.score) best = { p, date, score };
    }
  }
  if (!best) return null;
  linkPlan(s, best.p.id, best.date, tx, today, ev);
  ev.push({ type: 'planLinked', name: best.p.name, kind: best.p.kind });
  return best;
}

// ----- Pagos que se repiten en tus movimientos (como Rocket Money, Monarch o Wallet) -----
// Un comercio con un movimiento por mes, montos parecidos y cerca del mismo día, que todavía no está en tu plan.

const dayGap = (a, b) => { const d = Math.abs(a - b); return Math.min(d, 30 - d); };

export function recurringSuggestions(s, today, { months = 4, max = 4 } = {}) {
  const from = addDays(today, -(months * 31 + 5));
  const groups = new Map();
  for (const t of s.money.tx) {
    if (t.day < from || t.day > today || t.taxOf || !inStats(t) || (t.split && t.split.i > 0)) continue;
    const k = txKind(t);
    if (k === 'transfer') continue;
    const key = merchantKey(t.merchant);
    if (!key || key.length < 3) continue;
    const id = `${k}:${key}`;
    if (!groups.has(id)) groups.set(id, { id, kind: k, key, list: [] });
    groups.get(id).list.push(t);
  }
  const plans = s.money.plans || [];
  const planned = new Set(plans.map((p) => `${p.kind}:${merchantKey(p.name)}`));
  const dismissed = new Set(s.money.recurNo || []);
  // Lo que ya pagaste como parte de tu plan (1.10): Altice ligado a «Internet y cable» no se vuelve a sugerir.
  const linked = new Set();
  for (const p of plans) for (const v of Object.values(p.done || {})) if (v && v !== 'skip') linked.add(v);
  // Un pago de tu plan con otro nombre, pero de la misma categoría y con monto y día parecidos.
  const samePlan = (kind, cat, avg, day) => plans.some((p) => {
    if (p.kind !== kind || p.cat !== cat || !p.freq || p.freq.type !== 'month') return false;
    const amt = planDOP(s, p, today);
    if (!(amt > 0) || Math.abs(amt - avg) > Math.max(amt, avg) * 0.25) return false;
    return (p.freq.days || []).some((d) => dayGap(Math.min(30, d), Math.min(30, day)) <= 5);
  });
  const out = [];
  for (const g of groups.values()) {
    if (planned.has(g.id) || dismissed.has(g.id)) continue;
    if (g.list.some((t) => linked.has(t.id))) continue;
    const byMonth = new Map();
    for (const t of g.list) { const mk = monthKey(t.day); if (!byMonth.has(mk)) byMonth.set(mk, t); }
    if (byMonth.size < 2 || g.list.length > byMonth.size + 1) continue; // el súper de cada semana no es un pago fijo
    const list = [...byMonth.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
    const last = list[list.length - 1];
    if (diffDays(last.day, today) > 45) continue; // ya no se repite
    const amts = list.map((t) => txDOP(t));
    const avg = amts.reduce((a, b) => a + b, 0) / amts.length;
    if (!(avg > 0) || amts.some((a) => Math.abs(a - avg) > avg * 0.25)) continue;
    const days = list.map((t) => Number(t.day.slice(8)));
    if (days.some((d) => days.some((e) => dayGap(d, e) > 5))) continue;
    const day = days[days.length - 1];
    if (samePlan(g.kind, last.cat, avg, day)) continue;
    out.push({
      id: g.id, kind: g.kind, name: last.merchant, amount: r2(txOrig(last)), currency: txCur(last), cat: last.cat,
      account: last.account || '', day: day >= 29 ? 31 : day, count: list.length, variable: amts.some((a) => Math.abs(a - avg) > avg * 0.03),
    });
  }
  return out.sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1)).slice(0, max);
}

export function dismissRecurring(s, id) {
  if (!Array.isArray(s.money.recurNo)) s.money.recurNo = [];
  if (!s.money.recurNo.includes(id)) s.money.recurNo.push(id);
  s.money.recurNo = s.money.recurNo.slice(-200);
}

// «Pagué 5,000 a la tarjeta»: la tarjeta a la que se refiere (por sus últimos 4, su nombre o su banco), o la única que tienes.
export function cardForText(s, text) {
  const cards = s.money.accounts.filter((a) => isCard(a) && !a.hidden);
  if (!cards.length) return null;
  const t = String(text || '').toLowerCase();
  const by4 = cards.find((a) => a.last4 && t.includes(a.last4));
  if (by4) return by4;
  const words = (a) => [a.name, a.bank].filter(Boolean).join(' ').toLowerCase().split(/[^a-záéíóúñ0-9]+/).filter((w) => w.length >= 4 && w !== 'tarjeta');
  const named = cards.filter((a) => words(a).some((w) => t.includes(w)));
  if (named.length === 1) return named[0];
  return cards.length === 1 ? cards[0] : null;
}

// ----- Apartados: cuánto guardar cada mes para un pago que no es mensual -----

export function fundInfo(s, p, today) {
  if (!isFundPlan(p) || p.paused) return null;
  const next = planDates(p, addDays(today, -35), addDays(today, 800)).find((d) => !p.done[d]);
  if (!next) return null;
  const amount = planDOP(s, p, today);
  const saved = pos(p.fund && p.fund.saved);
  const need = pos(amount - saved);
  const months = Math.max(1, monthsUntil(today, next));
  return { next, amount, saved, need, months, perMonth: r2(need / months), pct: amount ? Math.min(1, saved / amount) : 0, late: next < today };
}

export function addToFund(s, id, amount) {
  const p = (s.money.plans || []).find((x) => x.id === id);
  if (!p || !p.fund) return null;
  p.fund.saved = pos((Number(p.fund.saved) || 0) + Number(amount || 0));
  return p;
}

// ----- Lo que toca pagar o cobrar (planes y tarjetas) -----

export function dueItems(s, from, to, today, { lateDays = 35, bal = null } = {}) {
  const rate = fxRate(s, today);
  const b = bal || balances(s);
  const out = [];
  const lateFrom = addDays(today, -lateDays);
  for (const o of planOccurrences(s, lateFrom < from ? lateFrom : from, to, today)) {
    if (o.status === 'done' || o.status === 'skip') continue;
    if (o.date < from && o.status !== 'late') continue;
    const acc = moneyAccount(s, o.p.account);
    out.push({ type: 'plan', kind: o.p.kind, p: o.p, date: o.date, status: o.status, amount: Number(o.p.amount) || 0, currency: o.p.currency, dop: planDOP(s, o.p, today), viaCard: isCard(acc) });
  }
  for (const a of s.money.accounts) {
    if (!isCard(a) || a.hidden) continue;
    const ci = cardInfo(s, a, today, b);
    if (!ci.cycle || !ci.cycle.due) continue;
    if ((ci.toPay.DOP > 0 || ci.toPay.USD > 0) && ci.cycle.due <= to) {
      out.push({ type: 'card', kind: 'gasto', a, date: ci.cycle.due, status: ci.status === 'late' ? 'late' : planStatus({ done: {}, remind: 5 }, ci.cycle.due, today), toPay: ci.toPay, dop: r2(ci.toPay.DOP + ci.toPay.USD * rate), info: ci });
    }
    if (ci.cycle.nextDue && ci.cycle.nextDue <= to && (ci.since.DOP > 0 || ci.since.USD > 0)) {
      out.push({ type: 'card', kind: 'gasto', a, date: ci.cycle.nextDue, status: 'later', estimate: true, toPay: ci.since, dop: r2(ci.since.DOP + ci.since.USD * rate), info: ci });
    }
  }
  return out.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}

// Saldo día por día de tus cuentas (sin tarjetas) con los cobros y pagos que vienen.
export function forecast(s, today, days = 30) {
  const bal = balances(s);
  const t = moneyTotals(s, today, bal);
  const items = dueItems(s, today, addDays(today, days), today, { bal }).filter((it) => !(it.type === 'plan' && it.viaCard));
  const byDay = new Map();
  for (const it of items) {
    const d = it.date < today ? today : it.date;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(it);
  }
  let run = t.liquid;
  let low = { bal: run, date: today };
  const points = [];
  for (let i = 0; i <= days; i++) {
    const d = addDays(today, i);
    const list = byDay.get(d) || [];
    for (const it of list) run = r2(run + (it.kind === 'ingreso' ? it.dop : -it.dop));
    points.push({ day: d, bal: run, list });
    if (run < low.bal) low = { bal: run, date: d };
  }
  return { start: t.liquid, ready: t.ready, points, low, items, end: run };
}

// Hasta tu próximo cobro: qué te toca pagar antes y cuánto te queda para gastar por día.
export function untilPayday(s, today) {
  let next = null;
  for (const p of s.money.plans || []) {
    if (p.paused || p.kind !== 'ingreso') continue;
    const d = planDates(p, today, addDays(today, 70)).find((x) => !p.done[x]);
    if (d && (!next || d < next.date || (d === next.date && p.cat === 'salario'))) next = { p, date: d };
  }
  if (!next) return null;
  const bal = balances(s);
  const t = moneyTotals(s, today, bal);
  const items = next.date > today ? dueItems(s, today, addDays(next.date, -1), today, { bal }).filter((it) => it.kind === 'gasto' && !(it.type === 'plan' && it.viaCard) && !it.estimate) : [];
  // Lo que quedaste en pagarle a alguien antes de cobrar (1.10).
  const rate = fxRate(s, today);
  const loans = openLoans(s, 'yo').filter((l) => l.due && l.due < next.date).map((l) => ({ l, dop: toDOP(leftOf(l), l.currency, rate) }));
  const pay = r2(items.reduce((a, it) => a + it.dop, 0) + loans.reduce((a, x) => a + x.dop, 0));
  const days = diffDays(today, next.date);
  const free = t.ready ? r2(t.liquid - pay) : null;
  return { next, days, items, loans, pay, free, perDay: free != null && days > 0 ? r2(free / days) : null, liquid: t.liquid, savings: t.savings, ready: t.ready };
}

// ----- Presupuestos: lo de cada mes, el sobrante que pasa y el ritmo -----
// Un presupuesto es de una categoría o de toda una familia (1.9: «Comida» junta súper, restaurantes,
// café y delivery). Las familias se guardan en `money.groupBudgets` y en el historial con la clave «g:familia».

export const GROUP_PREFIX = 'g:';
export const isGroupId = (id) => typeof id === 'string' && id.startsWith(GROUP_PREFIX);
const groupName = (g) => (CATEGORY_GROUPS.find((x) => x.id === g) || { name: g }).name;
// La familia como si fuera una categoría (para el historial, el sobrante y las filas).
export function groupBudgetCat(s, g) {
  const o = (s.money.groupBudgets || {})[g] || {};
  return { id: `${GROUP_PREFIX}${g}`, group: g, name: groupName(g), icon: 'grid', type: 'gasto', isGroup: true, budget: Number(o.budget) || 0, roll: !!o.roll, rollFrom: o.rollFrom || null };
}
// Las familias de gastos que tienen (o tuvieron) tope.
export function budgetGroups(s) {
  const gb = s.money.groupBudgets || {};
  return CATEGORY_GROUPS.filter((g) => !['ingresos', 'movimientos'].includes(g.id) && gb[g.id]).map((g) => groupBudgetCat(s, g.id));
}

export function budgetFor(s, c, mk) {
  const h = s.money.budgetHist || {};
  if (h[mk] && h[mk][c.id] != null) return Number(h[mk][c.id]) || 0;
  let best = null;
  for (const k of Object.keys(h)) if (k < mk && h[k] && h[k][c.id] != null && (!best || k > best)) best = k;
  return best ? Number(h[best][c.id]) || 0 : Number(c.budget) || 0;
}

// Gasto por mes y categoría, en pesos (una sola pasada). También por familia («g:comida»).
export function spentByMonth(s) {
  const out = {};
  for (const t of s.money.tx) {
    if (txKind(t) !== 'gasto' || !inStats(t)) continue;
    const mk = monthKey(t.day);
    if (!out[mk]) out[mk] = {};
    const v = txDOP(t);
    out[mk][t.cat] = (out[mk][t.cat] || 0) + v;
    const g = `${GROUP_PREFIX}${catOf(s, t.cat).group || 'otros'}`;
    out[mk][g] = (out[mk][g] || 0) + v;
  }
  return out;
}

// Lo que sobró (o faltó) de los meses anteriores, desde que activaste «pasa al mes siguiente».
export function carryFor(s, c, mk, spent = null) {
  if (!c.roll || !c.rollFrom || c.rollFrom >= mk) return 0;
  const sp = spent || spentByMonth(s);
  let carry = 0;
  let m = c.rollFrom;
  for (let guard = 0; m < mk && guard < 24; guard++) {
    carry = r2(carry + budgetFor(s, c, m) - ((sp[m] && sp[m][c.id]) || 0));
    m = nextMonth(m);
  }
  return carry;
}

// Filas de presupuesto del mes: primero las familias con tope, después las categorías.
export function budgetRows(s, mk, today) {
  const sp = spentByMonth(s);
  const rows = [];
  const isNow = mk === monthKey(today);
  const [y, m] = mk.split('-').map(Number);
  const frac = isNow ? Number(today.slice(8)) / daysIn(y, m) : 1;
  const row = (c) => {
    const budget = budgetFor(s, c, mk);
    const carry = carryFor(s, c, mk, sp);
    if (!(budget > 0) && !carry) return;
    const avail = r2(budget + carry);
    const spent = r2((sp[mk] && sp[mk][c.id]) || 0);
    const pace = isNow && avail > 0 ? r2(avail * frac) : null;
    rows.push({ c, isGroup: !!c.isGroup, budget, carry, avail, spent, left: r2(avail - spent), pct: avail > 0 ? spent / avail : spent > 0 ? 1 : 0, pace, over: spent > avail, ahead: pace != null ? r2(spent - pace) : 0 });
  };
  for (const g of budgetGroups(s)) row(g);
  for (const c of s.money.categories) if (c.type === 'gasto') row(c);
  return rows;
}

// Lo asignado del mes sin contar dos veces: el tope de una familia ya incluye sus categorías.
export function budgetTotal(s, rows, skipCats = null) {
  const groups = new Set(rows.filter((r) => r.isGroup).map((r) => r.c.group));
  let sum = 0;
  for (const r of rows) {
    if (r.isGroup) { sum += r.avail; continue; }
    if (groups.has(r.c.group) || (skipCats && skipCats.has(r.c.id))) continue;
    sum += r.avail;
  }
  return r2(sum);
}

// Tope para toda una familia de categorías (0 = sin tope). Se guarda en el historial del mes.
export function setGroupBudget(s, g, amount, today = null) {
  if (!CATEGORY_GROUPS.some((x) => x.id === g) || ['ingresos', 'movimientos'].includes(g)) return null;
  if (!s.money.groupBudgets || typeof s.money.groupBudgets !== 'object') s.money.groupBudgets = {};
  const v = Math.max(0, Math.round(Number(amount) || 0));
  const o = s.money.groupBudgets[g] || { budget: 0, roll: false, rollFrom: null };
  if (today && v !== (Number(o.budget) || 0)) {
    if (!s.money.budgetHist) s.money.budgetHist = {};
    const mk = monthKey(today);
    if (!s.money.budgetHist[mk]) s.money.budgetHist[mk] = {};
    s.money.budgetHist[mk][`${GROUP_PREFIX}${g}`] = v;
  }
  o.budget = v;
  if (!v && !o.roll) delete s.money.groupBudgets[g];
  else s.money.groupBudgets[g] = o;
  return o;
}

export function setRollover(s, catId, on, today) {
  if (isGroupId(catId)) {
    const g = catId.slice(GROUP_PREFIX.length);
    if (!s.money.groupBudgets || !s.money.groupBudgets[g]) return null;
    const o = s.money.groupBudgets[g];
    o.roll = !!on;
    o.rollFrom = on ? o.rollFrom || monthKey(today) : null;
    return groupBudgetCat(s, g);
  }
  const c = s.money.categories.find((x) => x.id === catId);
  if (!c || c.type !== 'gasto') return null;
  c.roll = !!on;
  c.rollFrom = on ? c.rollFrom || monthKey(today) : null;
  return c;
}

// La categoría o familia de un presupuesto por su id («super» o «g:comida»).
export function budgetCatOf(s, id) {
  if (isGroupId(id)) return groupBudgetCat(s, id.slice(GROUP_PREFIX.length));
  return s.money.categories.find((x) => x.id === id) || null;
}

// ----- Plan del mes: ingresos − pagos fijos − apartados − gastos del día a día = lo que te queda -----

export function monthPlan(s, mk, today) {
  const rate = fxRate(s, today);
  const from = `${mk}-01`;
  const to = monthEnd(mk);
  const linked = new Set();
  for (const p of s.money.plans || []) for (const v of Object.values(p.done || {})) if (v && v !== 'skip') linked.add(v);
  let income = 0; let incomeGot = 0; let fixed = 0; let fixedPaid = 0;
  const fixedCats = new Set();
  for (const o of planOccurrences(s, from, to, today)) {
    if (o.status === 'skip') continue;
    const v = o.tx ? txDOP(o.tx) : toDOP(Number(o.p.amount) || 0, o.p.currency, rate);
    if (o.p.kind === 'ingreso') { income += v; if (o.tx) incomeGot += v; }
    else { fixed += v; if (o.tx) fixedPaid += v; fixedCats.add(o.p.cat); }
  }
  let extra = 0; let variable = 0;
  for (const t of s.money.tx) {
    if (monthKey(t.day) !== mk || linked.has(t.id) || !inStats(t)) continue;
    const k = txKind(t);
    if (k === 'ingreso') extra += txDOP(t);
    else if (k === 'gasto') variable += txDOP(t);
  }
  const isNow = mk === monthKey(today);
  let funds = 0;
  if (isNow) for (const p of s.money.plans || []) { const f = fundInfo(s, p, today); if (f && !f.late && f.next > to) funds += f.perMonth; }
  const budgets = budgetTotal(s, budgetRows(s, mk, today), fixedCats);
  const totalIncome = income + extra;
  const left = totalIncome - fixed - funds - variable;
  const [y, m] = mk.split('-').map(Number);
  const daysLeft = isNow ? daysIn(y, m) - Number(today.slice(8)) + 1 : null;
  return {
    income: r2(totalIncome), planned: r2(income), got: r2(incomeGot + extra), extra: r2(extra), fixed: r2(fixed), fixedPaid: r2(fixedPaid),
    funds: r2(funds), variable: r2(variable), left: r2(left), daysLeft, perDay: daysLeft ? r2(Math.max(0, left) / daysLeft) : null,
    budgets: r2(budgets), unassigned: r2(totalIncome - fixed - funds - budgets), hasPlans: (s.money.plans || []).length > 0,
  };
}

// ----- Después de registrar un movimiento -----
// Liga pagos programados, premia pagar la tarjeta completa a tiempo, avisa si te acercas al presupuesto
// y cuenta los pagos de tarjeta como golpe al jefe de deudas.
export function afterTx(s, tx, today, ev = [], link = null) {
  if (!tx) return;
  const k = txKind(tx);
  if (link && link.plan && link.date) {
    linkPlan(s, link.plan, link.date, tx, today, ev);
  } else autoLinkPlan(s, tx, today, ev);
  if (k === 'transfer' && tx.to) {
    const a = accountOf(s, tx.to);
    if (isCard(a)) {
      bossFeed(s, 'debtPay', txDOP(tx), today, ev, { note: `Pago a ${a.name}` });
      const ci = cardInfo(s, a, today);
      if (ci.status === 'paid' && ci.cycle && ci.cycle.due && tx.day <= ci.cycle.due && !(a.paidCuts && a.paidCuts[ci.cycle.last])) {
        if (!a.paidCuts) a.paidCuts = {};
        a.paidCuts[ci.cycle.last] = tx.day;
        gainXP(s, 'finanzas', 15, today, ev);
        addGold(s, 5, today);
        ev.push({ type: 'cardPaid', name: a.name });
      }
    }
  }
  if (k === 'gasto' && inStats(tx) && monthKey(tx.day) === monthKey(today)) {
    const g = catOf(s, tx.cat).group;
    for (const row of budgetRows(s, monthKey(today), today).filter((r) => r.c.id === tx.cat || (r.isGroup && r.c.group === g))) {
      if (!(row.avail > 0)) continue;
      const before = (row.spent - txDOP(tx)) / row.avail;
      const after = row.spent / row.avail;
      if (before < 1 && after >= 1) ev.push({ type: 'budget', name: row.c.name, level: 100 });
      else if (before < 0.8 && after >= 0.8) ev.push({ type: 'budget', name: row.c.name, level: 80 });
    }
  }
}

// ----- Esta semana: lo que te toca para el día a día (como la vista semanal de Monarch) -----
// Lo del mes para el día a día (ingresos − pagos fijos − apartados), repartido por días: 7 días = una semana.
// Gastado: lo de esta semana (lunes a domingo) que no es un pago programado.
export function weekFlex(s, today) {
  const start = addDays(today, -((weekday(today) + 6) % 7));
  const end = addDays(start, 6);
  const mk = monthKey(today);
  const mp = monthPlan(s, mk, today);
  const [y, m] = mk.split('-').map(Number);
  const flexMonth = mp.income - mp.fixed - mp.funds;
  const allowance = mp.income > 0 && flexMonth > 0 ? r2((flexMonth * 7) / daysIn(y, m)) : null;
  const linked = new Set();
  for (const p of s.money.plans || []) for (const v of Object.values(p.done || {})) if (v && v !== 'skip') linked.add(v);
  let spent = 0;
  for (const t of s.money.tx) if (t.day >= start && t.day <= today && txKind(t) === 'gasto' && inStats(t) && !linked.has(t.id)) spent += txDOP(t);
  const daysLeft = diffDays(today, end) + 1;
  const left = allowance != null ? r2(allowance - spent) : null;
  return { start, end, allowance, spent: r2(spent), left, daysLeft, perDay: left != null && left > 0 ? r2(left / daysLeft) : null, flexMonth: r2(flexMonth) };
}

// ----- Puesta al día de datos viejos -----

// Tu hora de trabajo (1.9): ingreso del mes (automático o el tuyo), horas a la semana y, para la «hora real»,
// horas de traslado y gastos de ir a trabajar. `show`: ver las horas en cada gasto.
export const WORK_DEFAULT = { auto: true, income: 0, hours: 40, commute: 0, costs: 0, real: false, show: true };
const between = (v, a, b, d) => (Number.isFinite(Number(v)) && Number(v) >= a && Number(v) <= b ? Number(v) : d);

export function ensureMoneyPlus(s) {
  const m = s.money;
  // 1.9: impuesto a transferencias, hora de trabajo, presupuestos por familia, plan de deudas y deshacer.
  const tx0 = m.tax && typeof m.tax === 'object' && !Array.isArray(m.tax) ? m.tax : {};
  m.tax = { auto: tx0.auto !== false, rate: Number(tx0.rate) > 0 && Number(tx0.rate) < 0.05 ? Number(tx0.rate) : null, fee: pos(tx0.fee) };
  const w0 = m.work && typeof m.work === 'object' && !Array.isArray(m.work) ? m.work : {};
  m.work = {
    auto: w0.auto !== false, income: pos(w0.income), hours: between(w0.hours, 1, 100, WORK_DEFAULT.hours), commute: between(w0.commute, 0, 80, 0),
    costs: pos(w0.costs), real: !!w0.real, show: w0.show !== false,
  };
  if (!m.groupBudgets || typeof m.groupBudgets !== 'object' || Array.isArray(m.groupBudgets)) m.groupBudgets = {};
  for (const [g, o] of Object.entries(m.groupBudgets)) {
    if (!CATEGORY_GROUPS.some((x) => x.id === g) || !o || typeof o !== 'object') { delete m.groupBudgets[g]; continue; }
    m.groupBudgets[g] = { budget: Math.round(pos(o.budget)), roll: !!o.roll, rollFrom: o.roll && /^\d{4}-\d{2}$/.test(o.rollFrom || '') ? o.rollFrom : null };
  }
  const d0 = m.debts && typeof m.debts === 'object' && !Array.isArray(m.debts) ? m.debts : {};
  m.debts = {
    method: d0.method === 'snowball' ? 'snowball' : 'avalanche', extra: pos(d0.extra),
    items: (Array.isArray(d0.items) ? d0.items : []).filter((x) => x && typeof x === 'object' && x.id).map((x) => ({
      id: String(x.id), kind: x.kind === 'card' ? 'card' : 'loan', account: x.account ? String(x.account) : '', name: String(x.name || '').slice(0, 50),
      balance: pos(x.balance), apr: between(x.apr, 0, 300, 0), min: pos(x.min), on: x.on !== false,
    })),
  };
  if (m.lastBulk && (typeof m.lastBulk !== 'object' || !Array.isArray(m.lastBulk.before))) m.lastBulk = null;
  if (!Array.isArray(m.plans)) m.plans = [];
  m.plans = m.plans.filter((p) => p && typeof p === 'object' && p.id && p.name);
  for (const p of m.plans) {
    p.kind = p.kind === 'ingreso' ? 'ingreso' : 'gasto';
    p.currency = p.currency === 'USD' ? 'USD' : 'DOP';
    p.amount = r2(Math.abs(Number(p.amount) || 0));
    p.freq = normPlanFreq(p.freq, isDay(p.start) ? p.start : '2026-01-01');
    if (!p.done || typeof p.done !== 'object' || Array.isArray(p.done)) p.done = {};
    if (isFundPlan(p) && !p.fund) p.fund = { saved: 0 };
  }
  if (!m.budgetHist || typeof m.budgetHist !== 'object' || Array.isArray(m.budgetHist)) m.budgetHist = {};
  if (!Array.isArray(m.recurNo)) m.recurNo = [];
  if (!m.importFormats || typeof m.importFormats !== 'object' || Array.isArray(m.importFormats)) m.importFormats = {};
  for (const a of m.accounts) {
    if (a.kind !== 'tarjeta') a.currency = a.currency === 'USD' ? 'USD' : 'DOP';
    else {
      a.limit = { DOP: pos(a.limit && a.limit.DOP), USD: pos(a.limit && a.limit.USD) };
      a.cut = Number(a.cut) >= 1 && Number(a.cut) <= 31 ? Math.round(Number(a.cut)) : 0;
      a.due = Number(a.due) >= 1 && Number(a.due) <= 31 ? Math.round(Number(a.due)) : 0;
      if (!a.paidCuts || typeof a.paidCuts !== 'object') a.paidCuts = {};
    }
    if (a.base && (typeof a.base !== 'object' || !isDay(a.base.day))) a.base = null;
    if (a.bankAvail && (typeof a.bankAvail !== 'object' || Array.isArray(a.bankAvail))) a.bankAvail = null;
  }
  // Pagos de tarjeta y retiros de antes: se busca a dónde fue el dinero.
  for (const t of m.tx) {
    if (txKind(t) !== 'transfer' || t.to !== undefined) continue;
    t.to = '';
    const acc = accountOf(s, t.account);
    if (t.cat === 'pago_tarjeta') {
      if (isCard(acc)) { t.to = t.account; t.account = ''; }
      else {
        const end4 = (String(t.merchant || '').match(/(\d{4})\s*$/) || [])[1];
        const card = end4 && m.accounts.find((a) => isCard(a) && a.last4 === end4);
        if (card) t.to = card.id;
      }
    } else if (t.cat === 'retiro') {
      const cash = m.accounts.find((a) => a.kind === 'efectivo');
      if (cash && cash.id !== t.account) t.to = cash.id;
    }
  }
  // Ligas de 1.9 que quedaron sueltas (un impuesto cuya transferencia ya no está se queda como gasto normal).
  const ids = new Set(m.tx.map((t) => t.id));
  for (const t of m.tx) {
    if (t.taxOf && !ids.has(t.taxOf)) { delete t.taxOf; delete t.taxKind; delete t.taxAuto; }
    if (t.noStats !== undefined && !t.noStats) delete t.noStats;
    if (t.split && (typeof t.split !== 'object' || !t.split.id || !(Number(t.split.total) > 0))) delete t.split;
  }
  // 1.10: préstamos con personas.
  ensureLoans(s);
}
