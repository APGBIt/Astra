// Análisis (1.7, ampliado en 1.9): ingresos y gastos por mes, categorías y familias frente a tu promedio,
// comercios, cuentas, días de la semana, el ritmo del mes y la proyección al cierre; en 1.9 también el período
// anterior, de dónde vienen tus ingresos, el detalle de una categoría, los gastos hormiga, lo que te cobra el
// banco y tu salud financiera. Todo en pesos (los dólares, a su tasa). Lo marcado «no contar» no entra.
import { addDays, diffDays, monthKey, weekday, MONTHS } from '../app/dates.js';
import { txKind, txDOP, catOf, merchantKey, accountOf, fxRate, inStats } from './logic.js';
import {
  monthEnd, nextMonth, planOccurrences, budgetRows, budgetTotal, budgetFor, budgetCatOf, isGroupId, GROUP_PREFIX, isCard, balances,
  moneyTotals, cardInfo, dayOf, monthPlan,
} from './money.js';
import { CATEGORY_GROUPS } from './content.js';
import { dayMoods } from './mind.js';
import { creditMonth, creditTxIds, creditCosts } from './credits.js';
import { debtList } from './debts.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const daysIn = (mk) => Number(monthEnd(mk).slice(8));
export const prevMonth = (mk) => {
  const [y, m] = mk.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
export const monthLabel = (mk) => MONTHS[Number(mk.slice(5)) - 1];
export const monthShort = (mk) => MONTHS[Number(mk.slice(5)) - 1].slice(0, 3);

// Períodos: este mes, el pasado, los últimos 3, 6 o 12 meses (completos más el actual) y este año.
export const PERIODS = [['mes', 'Este mes'], ['pasado', 'Mes pasado'], ['3m', '3 meses'], ['6m', '6 meses'], ['12m', '12 meses'], ['ano', 'Este año']];
export function periodOf(kind, today) {
  const cur = monthKey(today);
  if (kind === 'pasado') { const p = prevMonth(cur); return { kind, from: `${p}-01`, to: monthEnd(p), mks: [p], partial: false }; }
  if (kind === 'ano') {
    const mks = [cur];
    while (!mks[0].endsWith('-01')) mks.unshift(prevMonth(mks[0]));
    return { kind, from: `${cur.slice(0, 4)}-01-01`, to: today, mks, partial: true };
  }
  const n = kind === '3m' ? 3 : kind === '6m' ? 6 : kind === '12m' ? 12 : 1;
  const mks = [cur];
  while (mks.length < n) mks.unshift(prevMonth(mks[0]));
  return { kind, from: `${mks[0]}-01`, to: today, mks, partial: true };
}

// El período de antes, del mismo largo, para comparar: este mes hasta hoy contra el mes pasado hasta el
// mismo día; este año contra el año pasado hasta la misma fecha; lo demás, los mismos días justo antes.
export function prevPeriodOf(period, today) {
  const { kind, from, to } = period;
  if (kind === 'mes') {
    const p = prevMonth(monthKey(today));
    const [y, m] = p.split('-').map(Number);
    return { from: `${p}-01`, to: dayOf(y, m, Number(today.slice(8))), label: 'el mes pasado a esta altura' };
  }
  if (kind === 'pasado') { const p = prevMonth(period.mks[0]); return { from: `${p}-01`, to: monthEnd(p), label: 'el mes anterior' }; }
  if (kind === 'ano') {
    const y = Number(from.slice(0, 4)) - 1;
    const [m, d] = [Number(to.slice(5, 7)), Number(to.slice(8))];
    return { from: `${y}-01-01`, to: dayOf(y, m, d), label: 'el año pasado a esta altura' };
  }
  const len = diffDays(from, to) + 1;
  const pto = addDays(from, -1);
  return { from: addDays(pto, -(len - 1)), to: pto, label: 'los mismos días de antes' };
}

const inRange = (t, from, to) => t.day >= from && t.day <= to;
const spentTx = (s, from, to) => s.money.tx.filter((t) => inRange(t, from, to) && txKind(t) === 'gasto' && inStats(t));

// Ingresos, gastos y lo que quedó, mes por mes (las transferencias entre tus cuentas no cuentan).
export function cashflow(s, mks) {
  const by = Object.fromEntries(mks.map((mk) => [mk, { mk, income: 0, spent: 0 }]));
  for (const t of s.money.tx) {
    const row = by[monthKey(t.day)];
    if (!row || !inStats(t)) continue;
    const k = txKind(t);
    if (k === 'ingreso') row.income += txDOP(t);
    else if (k === 'gasto') row.spent += txDOP(t);
  }
  return mks.map((mk) => {
    const r = by[mk];
    const net = r.income - r.spent;
    return { mk, income: r2(r.income), spent: r2(r.spent), net: r2(net), rate: r.income > 0 ? net / r.income : null };
  });
}

export function totals(s, from, to) {
  let income = 0; let spent = 0; let n = 0;
  for (const t of s.money.tx) {
    if (!inRange(t, from, to) || !inStats(t)) continue;
    const k = txKind(t);
    if (k === 'ingreso') income += txDOP(t);
    else if (k === 'gasto') { spent += txDOP(t); n += 1; }
  }
  const days = Math.max(1, diffDays(from, to) + 1);
  return { income: r2(income), spent: r2(spent), net: r2(income - spent), rate: income > 0 ? (income - spent) / income : null, n, perDay: r2(spent / days), days };
}

// Este período frente al de antes (cambio en %; null si antes no hubo nada).
export function compareTotals(s, period, today) {
  const cur = totals(s, period.from, period.to);
  const pp = prevPeriodOf(period, today);
  const prev = totals(s, pp.from, pp.to);
  const ch = (a, b) => (b > 0 ? (a - b) / b : null);
  return { cur, prev, label: pp.label, from: pp.from, to: pp.to, dIncome: ch(cur.income, prev.income), dSpent: ch(cur.spent, prev.spent), any: prev.income > 0 || prev.spent > 0 };
}

// Gasto por categoría, comparado con tu promedio de los 3 meses anteriores al período.
// El mes en curso se compara con lo que llevabas ese mismo día en esos meses (1.10): así el alquiler
// que pagas el día 1 no sale «48 % más» a mitad de mes, y la luz del 18 tampoco.
export function categoryStats(s, period, today) {
  const { from, to, mks } = period;
  const by = {};
  for (const t of spentTx(s, from, to)) {
    if (!by[t.cat]) by[t.cat] = { cat: t.cat, total: 0, n: 0 };
    by[t.cat].total += txDOP(t);
    by[t.cat].n += 1;
  }
  const exp = expectedSpend(s, period, today);
  const total = Object.values(by).reduce((a, x) => a + x.total, 0);
  return Object.values(by).map((x) => {
    const e = exp.of(x.cat);
    return { ...x, total: r2(x.total), share: total ? x.total / total : 0, avg: e.avg, expect: e.expect, delta: e.expect ? (x.total - e.expect) / e.expect : null, isNew: exp.n > 0 && !e.seen };
  }).sort((a, b) => b.total - a.total);
}

// Lo que sueles gastar en un período, con los 3 meses completos antes de él. Para el mes en curso, lo que llevabas
// a ese mismo día del mes; para los meses completos del período, el mes entero. `key(t)` agrupa (categoría o familia).
export function expectedSpend(s, period, today, key = (t) => t.cat) {
  const { to, mks } = period;
  const base = [];
  let m = prevMonth(mks[0]);
  while (base.length < 3) { base.unshift(m); m = prevMonth(m); }
  const cur = monthKey(today);
  const live = mks.includes(cur) && to >= today;
  const dayN = Number(today.slice(8));
  const full = {}; const upTo = {};
  const months = new Set();
  for (const t of s.money.tx) {
    const mk = monthKey(t.day);
    if (!base.includes(mk) || txKind(t) !== 'gasto' || !inStats(t)) continue;
    months.add(mk);
    const k = key(t);
    full[k] = (full[k] || 0) + txDOP(t);
    if (Number(t.day.slice(8)) <= dayN) upTo[k] = (upTo[k] || 0) + txDOP(t);
  }
  const n = months.size;
  const nFull = live ? mks.length - 1 : mks.length;
  return {
    n, live,
    of(k) {
      if (!n) return { avg: null, expect: null, seen: false };
      const avg = (full[k] || 0) / n;
      const expect = avg * nFull + (live ? (upTo[k] || 0) / n : 0);
      return { avg: r2(avg), expect: r2(expect), seen: (full[k] || 0) > 0 };
    },
  };
}

// Las mismas cifras por familia (comida, transporte, casa…), con sus categorías dentro.
export function groupStats(s, period, today) {
  const rows = categoryStats(s, period, today);
  const by = new Map();
  for (const r of rows) {
    const g = catOf(s, r.cat).group || 'otros';
    if (!by.has(g)) by.set(g, { group: g, name: (CATEGORY_GROUPS.find((x) => x.id === g) || { name: 'Otros' }).name, total: 0, n: 0, expect: 0, hasExpect: false, cats: [] });
    const x = by.get(g);
    x.total += r.total;
    x.n += r.n;
    if (r.expect != null) { x.expect += r.expect; x.hasExpect = true; }
    x.cats.push(r);
  }
  const total = rows.reduce((a, r) => a + r.total, 0);
  return [...by.values()].map((x) => ({
    ...x, total: r2(x.total), share: total ? x.total / total : 0, delta: x.hasExpect && x.expect > 0 ? (x.total - x.expect) / x.expect : null,
  })).sort((a, b) => b.total - a.total);
}

// De dónde vienen tus ingresos en el período.
export function incomeStats(s, period) {
  const by = {};
  for (const t of s.money.tx) {
    if (!inRange(t, period.from, period.to) || txKind(t) !== 'ingreso' || !inStats(t)) continue;
    if (!by[t.cat]) by[t.cat] = { cat: t.cat, total: 0, n: 0 };
    by[t.cat].total += txDOP(t);
    by[t.cat].n += 1;
  }
  const total = Object.values(by).reduce((a, x) => a + x.total, 0);
  return Object.values(by).map((x) => ({ ...x, total: r2(x.total), share: total ? x.total / total : 0 })).sort((a, b) => b.total - a.total);
}

// Dónde gastas más: comercios agrupados por nombre (Uber, Uber Rides y UBER*RIDES son el mismo).
export function merchantStats(s, from, to, n = 8, filter = null) {
  const by = new Map();
  for (const t of spentTx(s, from, to)) {
    if (filter && !filter(t)) continue;
    const k = merchantKey(t.merchant) || `cat:${t.cat}`;
    if (!t.merchant) continue;
    if (!by.has(k)) by.set(k, { key: k, names: {}, total: 0, n: 0, cat: t.cat });
    const x = by.get(k);
    x.total += txDOP(t);
    x.n += 1;
    x.names[t.merchant] = (x.names[t.merchant] || 0) + 1;
  }
  return [...by.values()].map((x) => ({
    key: x.key, name: Object.entries(x.names).sort((a, b) => b[1] - a[1])[0][0], total: r2(x.total), n: x.n, avg: r2(x.total / x.n), cat: x.cat,
  })).sort((a, b) => b.total - a.total).slice(0, n);
}

// Con qué pagaste: cada cuenta o tarjeta.
export function accountStats(s, from, to) {
  const by = {};
  for (const t of spentTx(s, from, to)) {
    const id = t.account || '';
    if (!by[id]) by[id] = { id, total: 0, n: 0 };
    by[id].total += txDOP(t);
    by[id].n += 1;
  }
  const total = Object.values(by).reduce((a, x) => a + x.total, 0);
  return Object.values(by).map((x) => {
    const a = accountOf(s, x.id);
    return { ...x, total: r2(x.total), share: total ? x.total / total : 0, name: a ? a.name : 'Sin cuenta', last4: a ? a.last4 : '', card: isCard(a) };
  }).sort((a, b) => b.total - a.total);
}

// Por día de la semana: cuánto sueles gastar un lunes, un martes… (promedio por día de ese tipo).
export function weekdayStats(s, from, to) {
  const tot = Array(7).fill(0);
  const count = Array(7).fill(0);
  for (let d = from; d <= to; d = addDays(d, 1)) count[weekday(d)] += 1;
  for (const t of spentTx(s, from, to)) tot[weekday(t.day)] += txDOP(t);
  return tot.map((v, i) => ({ wd: i, total: r2(v), avg: count[i] ? r2(v / count[i]) : 0 }));
}

// Gasto de cada día del mes (para el calendario).
export function dailyTotals(s, mk) {
  const out = {};
  for (const t of s.money.tx) if (monthKey(t.day) === mk && txKind(t) === 'gasto' && inStats(t)) out[t.day] = (out[t.day] || 0) + txDOP(t);
  for (const k of Object.keys(out)) out[k] = r2(out[k]);
  return out;
}

const fixedIds = (s) => {
  const ids = new Set();
  for (const p of s.money.plans || []) for (const v of Object.values(p.done || {})) if (v && v !== 'skip') ids.add(v);
  for (const id of creditTxIds(s)) ids.add(id);
  return ids;
};

// Ritmo: lo gastado acumulado día por día este mes, el mes pasado y el promedio de los 3 anteriores.
export function paceSeries(s, today) {
  const mk = monthKey(today);
  const acc = (m) => {
    const n = daysIn(m);
    const daily = Array(n).fill(0);
    for (const t of s.money.tx) if (monthKey(t.day) === m && txKind(t) === 'gasto' && inStats(t)) daily[Number(t.day.slice(8)) - 1] += txDOP(t);
    let run = 0;
    return daily.map((v) => r2((run += v)));
  };
  const cur = acc(mk).slice(0, Number(today.slice(8)));
  const p1 = prevMonth(mk);
  const prev = acc(p1);
  const hasPrev = prev[prev.length - 1] > 0;
  const base = [p1, prevMonth(p1), prevMonth(prevMonth(p1))].map(acc).filter((a) => a[a.length - 1] > 0);
  const len = daysIn(mk);
  const avg = base.length ? Array.from({ length: len }, (_, i) => r2(base.reduce((a, arr) => a + arr[Math.min(i, arr.length - 1)], 0) / base.length)) : null;
  const budget = budgetTotal(s, budgetRows(s, mk, today));
  return { mk, len, cur, prev: hasPrev ? prev : null, avg, budget: budget > 0 ? r2(budget) : null, prevMk: p1 };
}

// Proyección del mes: lo gastado + lo que falta pagar de lo programado + tu gasto diario de siempre por los días que quedan.
export function monthProjection(s, today) {
  const mk = monthKey(today);
  const from = `${mk}-01`;
  const end = monthEnd(mk);
  const day = Number(today.slice(8));
  const len = daysIn(mk);
  const left = len - day;
  const fixed = fixedIds(s);
  let spent = 0; let variable = 0; let income = 0;
  for (const t of s.money.tx) {
    if (!inRange(t, from, today) || !inStats(t)) continue;
    const k = txKind(t);
    if (k === 'gasto') { spent += txDOP(t); if (!fixed.has(t.id)) variable += txDOP(t); }
    else if (k === 'ingreso') income += txDOP(t);
  }
  // Gasto diario sin pagos fijos: el de este mes, mezclado con el de los 3 anteriores al empezar el mes.
  const hist = [];
  let m = prevMonth(mk);
  for (let i = 0; i < 3; i++, m = prevMonth(m)) {
    let v = 0;
    for (const t of s.money.tx) if (monthKey(t.day) === m && txKind(t) === 'gasto' && !fixed.has(t.id) && inStats(t)) v += txDOP(t);
    if (v > 0) hist.push(v / daysIn(m));
  }
  const histDaily = hist.length ? hist.reduce((a, b) => a + b, 0) / hist.length : null;
  const curDaily = variable / Math.max(1, day);
  const w = Math.min(1, day / 15);
  const daily = histDaily == null ? curDaily : day < 3 ? histDaily : curDaily * w + histDaily * (1 - w);
  let toPay = 0; let toGet = 0;
  for (const o of planOccurrences(s, addDays(today, 1) > end ? end : addDays(today, 1), end, today)) {
    if (o.status === 'done' || o.status === 'skip') continue;
    const v = Number(o.p.amount) || 0;
    const dop = o.p.currency === 'USD' ? v * fxRate(s, today) : v;
    if (o.p.kind === 'ingreso') toGet += dop; else toPay += dop;
  }
  // 1.11: lo que falta de cuotas de préstamos este mes.
  if (addDays(today, 1) <= end) toPay += creditMonth(s, addDays(today, 1), end, today).due;
  const projected = spent + toPay + daily * left;
  const projIncome = income + toGet;
  const budget = budgetTotal(s, budgetRows(s, mk, today));
  return {
    mk, day, len, left, spent: r2(spent), variable: r2(variable), daily: r2(daily), toPay: r2(toPay), toGet: r2(toGet), income: r2(income),
    projected: r2(projected), projIncome: r2(projIncome), projNet: r2(projIncome - projected), budget: budget > 0 ? r2(budget) : null,
    hasHistory: hist.length > 0,
  };
}

// Qué decir de la proyección (1.10): lo que ya falta aunque no gastes nada más va aparte de lo que faltaría a este ritmo.
const rdw = (v) => `RD$${Math.round(Math.abs(Number(v) || 0)).toLocaleString('en-US')}`;
export function projectionNote(pr) {
  if (pr.projNet >= 0) return `Te quedarían unos ${rdw(pr.projNet)}.`;
  const already = pr.spent + pr.toPay - pr.projIncome;
  const atPace = pr.left > 0 ? `; a este ritmo, serían unos ${rdw(pr.projNet)}` : '';
  if (already <= 0) return `Te faltarían unos ${rdw(pr.projNet)}: para cuadrar, gasta hasta ${rdw(already / Math.max(1, pr.left))} por día.`;
  if (pr.spent > pr.projIncome) return `Ya gastaste ${rdw(pr.spent - pr.projIncome)} más de lo que entra este mes${atPace}.`;
  return `Con lo programado que falta, te faltarían ${rdw(already)} aunque no gastes nada más${atPace}. Mira si algún pago se puede mover.`;
}

// Proyección de cada presupuesto: a este ritmo, ¿en cuánto terminas?
export function budgetPace(row, today) {
  const mk = monthKey(today);
  const day = Number(today.slice(8));
  const len = daysIn(mk);
  if (day >= len || row.spent <= 0) return null;
  const proj = r2((row.spent / day) * len);
  return { proj, over: r2(proj - row.avail) };
}

const roundUp = (v, step = 100) => Math.ceil(v / step) * step;
// Presupuestos sugeridos: tu promedio de los últimos 3 meses completos en cada categoría.
export function budgetSuggestions(s, today) {
  const mk = monthKey(today);
  const base = [prevMonth(mk)];
  while (base.length < 3) base.push(prevMonth(base[base.length - 1]));
  const sum = {};
  const seen = new Set();
  for (const t of s.money.tx) {
    const m = monthKey(t.day);
    if (!base.includes(m) || txKind(t) !== 'gasto' || !inStats(t)) continue;
    seen.add(m);
    sum[t.cat] = (sum[t.cat] || 0) + txDOP(t);
  }
  const n = seen.size;
  if (!n) return { months: 0, rows: [] };
  const rows = budgetRows(s, mk, today).filter((r) => !r.isGroup);
  const cur = Object.fromEntries(rows.map((r) => [r.c.id, r.budget]));
  return {
    months: n,
    rows: Object.entries(sum).map(([cat, v]) => ({ cat, avg: r2(v / n), suggested: roundUp(v / n), current: cur[cat] || 0 }))
      .filter((x) => x.avg >= 100 && catOf(s, x.cat).type === 'gasto').sort((a, b) => b.avg - a.avg),
  };
}

// 50/30/20: necesidades, gustos y ahorro (o deudas) frente a tus ingresos del mes.
const NEEDS = new Set(['super', 'combustible', 'transporte', 'peajes', 'vehiculo', 'vivienda', 'servicios', 'gas', 'agua_botellon', 'energia', 'telecom', 'hogar', 'domestico', 'salud', 'farmacia', 'terapia', 'educacion', 'cursos', 'libros', 'hijos', 'seguros', 'impuestos', 'comisiones', 'intereses_pagados', 'familia', 'mascotas', 'trabajo', 'imprevistos']);
// Ahorro, inversión y deudas; lo que prestas también, porque es dinero que debe volver.
const SAVE = new Set(['ahorro', 'inversion', 'deuda', 'prestamo_dado']);
export const groupOf503020 = (cat) => (SAVE.has(cat) ? 'ahorro' : NEEDS.has(cat) ? 'necesidades' : 'gustos');
export function split503020(s, mk) {
  const out = { necesidades: 0, gustos: 0, ahorro: 0, income: 0 };
  for (const t of s.money.tx) {
    if (monthKey(t.day) !== mk || !inStats(t)) continue;
    const k = txKind(t);
    if (k === 'ingreso') out.income += txDOP(t);
    else if (k === 'gasto') out[groupOf503020(t.cat)] += txDOP(t);
    else if (k === 'transfer' && t.cat === 'entre_cuentas') {
      const to = accountOf(s, t.to);
      if (to && to.save) out.ahorro += txDOP(t);
    }
  }
  for (const k of Object.keys(out)) out[k] = r2(out[k]);
  return out;
}

// ----- Detalle de una categoría o familia (1.9) -----
// 12 meses con su presupuesto, el promedio de los meses completos, cada cuánto y en qué comercios.
export function categoryDetail(s, id, today, months = 12) {
  const group = isGroupId(id) ? id.slice(GROUP_PREFIX.length) : null;
  const match = (t) => txKind(t) === 'gasto' && inStats(t) && (group ? (catOf(s, t.cat).group || 'otros') === group : t.cat === id);
  const cur = monthKey(today);
  const mks = [cur];
  while (mks.length < months) mks.unshift(prevMonth(mks[0]));
  const by = Object.fromEntries(mks.map((m) => [m, { mk: m, total: 0, n: 0 }]));
  let first = null;
  for (const t of s.money.tx) {
    if (!match(t)) continue;
    if (!first || t.day < first) first = t.day;
    const row = by[monthKey(t.day)];
    if (!row) continue;
    row.total += txDOP(t);
    row.n += 1;
  }
  const c = budgetCatOf(s, id);
  const rows = mks.map((m) => ({ ...by[m], total: r2(by[m].total), budget: c ? budgetFor(s, c, m) : 0 }));
  // Promedio de los meses completos desde el primero con gastos de esta categoría.
  const full = rows.filter((r) => r.mk !== cur && first && r.mk >= monthKey(first));
  const avg = full.length ? r2(full.reduce((a, r) => a + r.total, 0) / full.length) : null;
  const total = r2(rows.reduce((a, r) => a + r.total, 0));
  const n = rows.reduce((a, r) => a + r.n, 0);
  const from = `${mks[Math.max(0, mks.length - 3)]}-01`;
  return {
    id, group, months: rows, avg, total, n, avgTicket: n ? r2(total / n) : 0, thisMonth: rows[rows.length - 1].total,
    merchants: merchantStats(s, from, today, 5, match), first,
  };
}

// ----- Gastos hormiga (1.9) -----
// Compras pequeñas y frecuentes que casi no se notan (café, delivery, pasajes, recargas…): cuántas fueron,
// cuánto suman, cuánto serían en un año y dónde se van. `max`: monto de una compra pequeña, en pesos.
const NOT_ANTS = new Set(['comisiones', 'intereses_pagados', 'impuestos']);
const isAnt = (t, max) => !t.taxOf && !NOT_ANTS.has(t.cat) && txDOP(t) <= max;
export function smallSpends(s, period, { max = 500 } = {}) {
  const list = spentTx(s, period.from, period.to).filter((t) => isAnt(t, max));
  const total = list.reduce((a, t) => a + txDOP(t), 0);
  const all = totals(s, period.from, period.to).spent;
  const days = Math.max(1, diffDays(period.from, period.to) + 1);
  const perMonth = (total / days) * (365 / 12);
  const cats = {};
  for (const t of list) { if (!cats[t.cat]) cats[t.cat] = { cat: t.cat, n: 0, total: 0 }; cats[t.cat].n += 1; cats[t.cat].total += txDOP(t); }
  return {
    max, n: list.length, total: r2(total), share: all ? total / all : 0, days, perMonth: r2(perMonth), perYear: r2(perMonth * 12),
    cats: Object.values(cats).map((x) => ({ ...x, total: r2(x.total) })).sort((a, b) => b.total - a.total).slice(0, 4),
    merchants: merchantStats(s, period.from, period.to, 4, (t) => isAnt(t, max)),
  };
}

// ----- Lo que te cuesta el banco (1.9): impuesto a transferencias, comisiones e intereses -----
const isTaxTx = (t) => t.taxKind === 'tax' || /impuesto|dgii|\b0[.,](15|20)\s*%?/i.test(`${t.merchant} ${t.note}`);
export function bankCosts(s, period) {
  const out = { tax: 0, fees: 0, interest: 0, n: 0, total: 0, nTax: 0 };
  for (const t of spentTx(s, period.from, period.to)) {
    if (t.cat === 'intereses_pagados') out.interest += txDOP(t);
    else if (t.cat === 'comisiones') { if (isTaxTx(t)) { out.tax += txDOP(t); out.nTax += 1; } else out.fees += txDOP(t); }
    else continue;
    out.n += 1;
  }
  out.total = r2(out.tax + out.fees + out.interest);
  for (const k of ['tax', 'fees', 'interest']) out[k] = r2(out[k]);
  return out;
}

// ----- Salud financiera (1.9) -----
// Cuánto guardas de lo que entra, para cuántos meses te alcanza lo que tienes, cuánto usas de tus tarjetas
// y cuánto debes en ellas frente a un mes de ingresos. Con los 3 últimos meses completos.
export function healthSnapshot(s, today) {
  const cur = monthKey(today);
  const mks = [prevMonth(cur)];
  while (mks.length < 3) mks.push(prevMonth(mks[mks.length - 1]));
  const cf = cashflow(s, mks).filter((r) => r.income > 0 || r.spent > 0);
  const income = cf.reduce((a, r) => a + r.income, 0);
  const spent = cf.reduce((a, r) => a + r.spent, 0);
  const n = cf.length;
  const avgIncome = n ? income / n : 0;
  const avgSpent = n ? spent / n : 0;
  const bal = balances(s);
  const mt = moneyTotals(s, today, bal);
  let limit = 0; let owedLim = 0;
  const rate = fxRate(s, today);
  for (const a of s.money.accounts) {
    if (!isCard(a) || a.hidden) continue;
    const ci = cardInfo(s, a, today, bal);
    if (ci.limit.DOP > 0) { limit += ci.limit.DOP; owedLim += ci.owed.DOP; }
    if (ci.limit.USD > 0) { limit += ci.limit.USD * rate; owedLim += ci.owed.USD * rate; }
  }
  return {
    months: n,
    saveRate: income > 0 ? (income - spent) / income : null,
    avgIncome: r2(avgIncome), avgSpent: r2(avgSpent),
    cushion: mt.ready && avgSpent > 0 ? (mt.liquid + mt.savings) / avgSpent : null,
    have: r2(mt.liquid + mt.savings), ready: mt.ready,
    cardUse: limit > 0 ? owedLim / limit : null,
    owe: mt.oweDOP, oweMonths: avgIncome > 0 ? mt.oweDOP / avgIncome : null,
  };
}

// ----- Ánimo y dinero (1.10) -----
// Cuánto gastas los días en que te sentiste tenso o bajo, frente a los días agradables (el ánimo del día es el que
// más se repitió en tus check-ins): todo el día a día y, aparte, los gustos (comer fuera, delivery, antojos, compras),
// que es donde más se nota. Sin pagos programados, impuestos ni lo que no cuenta. Solo con al menos 5 días de cada
// lado, para no sacar conclusiones con muy pocos datos (como Bearable).
// Estar triste puede hacer que pagues más por lo mismo (Cryder, Lerner y colegas, Psychological Science, 2008).
// Gustos que suelen moverse con el ánimo: comer fuera, pedir, antojos, salidas, compras, ropa, tecnología, juegos.
export const IMPULSE_CATS = new Set(['comida', 'cafe', 'delivery', 'bebidas', 'ocio', 'compras', 'ropa', 'tecnologia', 'hobbies', 'loteria', 'cuidado', 'regalos']);
export function moodMoney(s, today, days = 90) {
  const from = addDays(today, -days + 1);
  const dm = dayMoods(s, from, today);
  const fixed = fixedIds(s);
  const all = new Map(); const wants = new Map(); const byCat = new Map();
  const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
  for (const t of s.money.tx) {
    if (t.day < from || t.day > today || !dm.has(t.day) || txKind(t) !== 'gasto' || !inStats(t) || fixed.has(t.id) || t.taxOf) continue;
    const v = txDOP(t);
    add(all, t.day, v);
    if (IMPULSE_CATS.has(t.cat)) { add(wants, t.day, v); add(byCat, `${t.day}|${t.cat}`, v); }
  }
  const entries = [...dm.entries()];
  const good = entries.filter(([, q]) => q === 1 || q === 3).map(([d]) => d);
  const tense = entries.filter(([, q]) => q === 0).map(([d]) => d);
  const low = entries.filter(([, q]) => q === 2).map(([d]) => d);
  const bad = [...tense, ...low];
  const base = { nGood: good.length, nBad: bad.length, ready: good.length >= 5 && bad.length >= 5 };
  if (!base.ready) return base;
  const avgOf = (m, list) => (list.length ? r2(list.reduce((a, d) => a + (m.get(d) || 0), 0) / list.length) : null);
  const side = (m) => { const g = avgOf(m, good); const b = avgOf(m, bad); return { good: g, bad: b, delta: g > 0 ? (b - g) / g : null }; };
  const goodSet = new Set(good);
  const cats = {};
  for (const [k, v] of byCat) {
    const [d, cat] = k.split('|');
    if (!cats[cat]) cats[cat] = { cat, good: 0, bad: 0 };
    if (goodSet.has(d)) cats[cat].good += v; else cats[cat].bad += v;
  }
  const rows = Object.values(cats).map((c) => ({ cat: c.cat, good: r2(c.good / good.length), bad: r2(c.bad / bad.length) }))
    .map((c) => ({ ...c, diff: r2(c.bad - c.good) })).filter((c) => c.diff > 0 && c.bad >= 50).sort((x, y) => y.diff - x.diff).slice(0, 3);
  return {
    ...base, all: side(all), wants: side(wants), cats: rows,
    tense: tense.length >= 3 ? { n: tense.length, all: avgOf(all, tense), wants: avgOf(wants, tense) } : null,
    low: low.length >= 3 ? { n: low.length, all: avgOf(all, low), wants: avgOf(wants, low) } : null,
  };
}

// Lo que más cambió, en frases cortas.
export function insights(s, today) {
  const out = [];
  const per = periodOf('mes', today);
  const cats = categoryStats(s, per, today).filter((c) => c.delta != null && c.total >= 500);
  const up = cats.filter((c) => c.delta >= 0.25).sort((a, b) => b.delta - a.delta)[0];
  const down = cats.filter((c) => c.delta <= -0.25).sort((a, b) => a.delta - b.delta)[0];
  if (up) out.push({ icon: 'up', key: 'up', cat: up.cat, text: `${catOf(s, up.cat).name}: llevas ${Math.round(up.delta * 100)} % más de lo que sueles a esta altura del mes.` });
  if (down) out.push({ icon: 'down', key: 'down', cat: down.cat, text: `${catOf(s, down.cat).name}: vas ${Math.round(-down.delta * 100)} % por debajo de tu promedio.` });
  const top = merchantStats(s, per.from, today, 1)[0];
  if (top && top.n >= 4) out.push({ icon: 'receipt', key: 'merchant', text: `${top.name} es donde más gastas este mes: ${top.n} veces.` });
  const proj = monthProjection(s, today);
  if (proj.projIncome > 0 && proj.day >= 5) {
    out.push(proj.projNet >= 0
      ? { icon: 'coins', key: 'proj', text: `A este ritmo terminarías el mes con unos RD$${Math.round(proj.projNet).toLocaleString('en-US')} de sobra.` }
      : { icon: 'info', key: 'proj', tone: 'vit', text: `A este ritmo gastarías unos RD$${Math.round(-proj.projNet).toLocaleString('en-US')} más de lo que entra este mes.` });
  }
  return out.slice(0, 4);
}

export { nextMonth };


// ---------- 1.11: deudas, fondo de emergencia y suscripciones ----------

// Cuánto de lo que ganas se va en pagos de deudas cada mes: cuotas de préstamos, mínimos de tarjetas y pagos que pusiste.
export function debtLoad(s, today) {
  const h = healthSnapshot(s, today);
  let income = h.avgIncome;
  if (!(income > 0)) { try { income = monthPlanIncome(s, today); } catch (e) { income = 0; } }
  const list = debtList(s, today).filter((x) => x.on !== false);
  const commitments = r2(list.reduce((a, x) => a + (x.min || 0) + (x.fee || 0), 0));
  const owe = r2(list.reduce((a, x) => a + (x.balance || 0), 0));
  const dti = income > 0 ? commitments / income : null;
  return { income: r2(income), commitments, owe, dti, n: list.length, missing: list.filter((x) => !(x.min > 0)).length };
}
function monthPlanIncome(s, today) {
  return monthPlan(s, monthKey(today), today).income || 0;
}

// Fondo de emergencia: lo que tienes ahorrado frente a lo que necesitas para vivir 3 meses.
export function emergencyFund(s, today) {
  const bal = balances(s);
  const mt = moneyTotals(s, today, bal);
  const cur = monthKey(today);
  const mks = [prevMonth(cur), prevMonth(prevMonth(cur)), prevMonth(prevMonth(prevMonth(cur)))];
  const needs = mks.map((mk) => split503020(s, mk).necesidades).filter((v) => v > 0);
  const monthly = needs.length ? needs.reduce((a, v) => a + v, 0) / needs.length : 0;
  const saved = mt.savings;
  return {
    ready: mt.ready && monthly > 0, monthly: r2(monthly), saved: r2(saved), liquid: r2(mt.liquid),
    months: monthly > 0 ? saved / monthly : null, monthsAll: monthly > 0 ? (saved + mt.liquid) / monthly : null,
    goal3: r2(monthly * 3), goal6: r2(monthly * 6), pct: monthly > 0 ? Math.min(1, saved / (monthly * 3)) : 0, hasSavings: s.money.accounts.some((a) => a.save && !a.hidden),
  };
}

// Suscripciones: lo que pagas cada mes en la categoría «Suscripciones y apps» (promedio de los últimos 3 meses).
export function subscriptionStats(s, today) {
  const from = addDays(today, -90);
  const by = new Map();
  for (const t of s.money.tx) {
    if (t.cat !== 'suscripciones' || txKind(t) !== 'gasto' || t.day < from || t.day > today || !inStats(t)) continue;
    const k = merchantKey(t.merchant) || 'otras';
    if (!by.has(k)) by.set(k, { key: k, name: t.merchant || 'Suscripción', total: 0, n: 0, last: t.day });
    const x = by.get(k);
    x.total += txDOP(t); x.n += 1; if (t.day > x.last) { x.last = t.day; x.name = t.merchant || x.name; }
  }
  const list = [...by.values()].map((x) => ({ ...x, monthly: r2(x.total / 3) })).sort((a, b) => b.total - a.total);
  const perMonth = r2(list.reduce((a, x) => a + x.monthly, 0));
  return { list, perMonth, perYear: r2(perMonth * 12) };
}

// Lo que te costaron los préstamos del banco en el período: intereses, seguros y cargos, frente a lo que fue a capital.
export function loanCosts(s, period) {
  const c = creditCosts(s, period.from, period.to);
  return { ...c, cost: r2(c.interest + c.fees), costShare: c.total > 0 ? (c.interest + c.fees) / c.total : 0 };
}
