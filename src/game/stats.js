// Análisis (1.7): ingresos y gastos por mes, categorías frente a tu promedio, comercios, cuentas,
// días de la semana, el ritmo del mes y la proyección al cierre. Todo en pesos (los dólares, a su tasa).
import { addDays, diffDays, monthKey, weekday, MONTHS } from '../app/dates.js';
import { txKind, txDOP, catOf, merchantKey, accountOf, fxRate } from './logic.js';
import { monthEnd, nextMonth, planOccurrences, budgetRows, isCard } from './money.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const daysIn = (mk) => Number(monthEnd(mk).slice(8));
export const prevMonth = (mk) => {
  const [y, m] = mk.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
export const monthLabel = (mk) => MONTHS[Number(mk.slice(5)) - 1];
export const monthShort = (mk) => MONTHS[Number(mk.slice(5)) - 1].slice(0, 3);

// Períodos: este mes, el pasado y los últimos 3, 6 o 12 meses (completos más el actual).
export const PERIODS = [['mes', 'Este mes'], ['pasado', 'Mes pasado'], ['3m', '3 meses'], ['6m', '6 meses'], ['12m', '12 meses']];
export function periodOf(kind, today) {
  const cur = monthKey(today);
  if (kind === 'pasado') { const p = prevMonth(cur); return { kind, from: `${p}-01`, to: monthEnd(p), mks: [p], partial: false }; }
  const n = kind === '3m' ? 3 : kind === '6m' ? 6 : kind === '12m' ? 12 : 1;
  const mks = [cur];
  while (mks.length < n) mks.unshift(prevMonth(mks[0]));
  return { kind, from: `${mks[0]}-01`, to: today, mks, partial: true };
}

const inRange = (t, from, to) => t.day >= from && t.day <= to;
const spentTx = (s, from, to) => s.money.tx.filter((t) => inRange(t, from, to) && txKind(t) === 'gasto');

// Ingresos, gastos y lo que quedó, mes por mes (las transferencias entre tus cuentas no cuentan).
export function cashflow(s, mks) {
  const by = Object.fromEntries(mks.map((mk) => [mk, { mk, income: 0, spent: 0 }]));
  for (const t of s.money.tx) {
    const row = by[monthKey(t.day)];
    if (!row) continue;
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
    if (!inRange(t, from, to)) continue;
    const k = txKind(t);
    if (k === 'ingreso') income += txDOP(t);
    else if (k === 'gasto') { spent += txDOP(t); n += 1; }
  }
  const days = Math.max(1, diffDays(from, to) + 1);
  return { income: r2(income), spent: r2(spent), net: r2(income - spent), rate: income > 0 ? (income - spent) / income : null, n, perDay: r2(spent / days), days };
}

// Gasto por categoría, comparado con tu promedio de los 3 meses anteriores al período.
// En el mes en curso se compara con lo que sueles llevar a esta altura del mes.
export function categoryStats(s, period, today) {
  const { from, to, mks } = period;
  const by = {};
  for (const t of spentTx(s, from, to)) {
    if (!by[t.cat]) by[t.cat] = { cat: t.cat, total: 0, n: 0 };
    by[t.cat].total += txDOP(t);
    by[t.cat].n += 1;
  }
  // Base: los 3 meses completos antes del período.
  const base = [];
  let m = prevMonth(mks[0]);
  while (base.length < 3) { base.unshift(m); m = prevMonth(m); }
  const prev = {};
  const months = new Set();
  for (const t of s.money.tx) {
    const mk = monthKey(t.day);
    if (!base.includes(mk) || txKind(t) !== 'gasto') continue;
    months.add(mk);
    prev[t.cat] = (prev[t.cat] || 0) + txDOP(t);
  }
  const nBase = months.size;
  const cur = monthKey(today);
  const frac = mks.length === 1 && mks[0] === cur ? Number(today.slice(8)) / daysIn(cur) : 1;
  const total = Object.values(by).reduce((a, x) => a + x.total, 0);
  return Object.values(by).map((x) => {
    const avg = nBase ? (prev[x.cat] || 0) / nBase : null;
    const expect = avg != null ? avg * mks.length * frac : null;
    return { ...x, total: r2(x.total), share: total ? x.total / total : 0, avg: avg != null ? r2(avg) : null, delta: expect ? (x.total - expect) / expect : null, isNew: nBase > 0 && !(prev[x.cat] > 0) };
  }).sort((a, b) => b.total - a.total);
}

// Dónde gastas más: comercios agrupados por nombre (Uber, Uber Rides y UBER*RIDES son el mismo).
export function merchantStats(s, from, to, n = 8) {
  const by = new Map();
  for (const t of spentTx(s, from, to)) {
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
  for (const t of s.money.tx) if (monthKey(t.day) === mk && txKind(t) === 'gasto') out[t.day] = (out[t.day] || 0) + txDOP(t);
  for (const k of Object.keys(out)) out[k] = r2(out[k]);
  return out;
}

const fixedIds = (s) => {
  const ids = new Set();
  for (const p of s.money.plans || []) for (const v of Object.values(p.done || {})) if (v && v !== 'skip') ids.add(v);
  return ids;
};

// Ritmo: lo gastado acumulado día por día este mes, el mes pasado y el promedio de los 3 anteriores.
export function paceSeries(s, today) {
  const mk = monthKey(today);
  const acc = (m) => {
    const n = daysIn(m);
    const daily = Array(n).fill(0);
    for (const t of s.money.tx) if (monthKey(t.day) === m && txKind(t) === 'gasto') daily[Number(t.day.slice(8)) - 1] += txDOP(t);
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
  const budget = budgetRows(s, mk, today).reduce((a, r) => a + r.avail, 0);
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
    if (!inRange(t, from, today)) continue;
    const k = txKind(t);
    if (k === 'gasto') { spent += txDOP(t); if (!fixed.has(t.id)) variable += txDOP(t); }
    else if (k === 'ingreso') income += txDOP(t);
  }
  // Gasto diario sin pagos fijos: el de este mes, mezclado con el de los 3 anteriores al empezar el mes.
  const hist = [];
  let m = prevMonth(mk);
  for (let i = 0; i < 3; i++, m = prevMonth(m)) {
    let v = 0;
    for (const t of s.money.tx) if (monthKey(t.day) === m && txKind(t) === 'gasto' && !fixed.has(t.id)) v += txDOP(t);
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
  const projected = spent + toPay + daily * left;
  const projIncome = income + toGet;
  const budget = budgetRows(s, mk, today).reduce((a, r) => a + r.avail, 0);
  return {
    mk, day, len, left, spent: r2(spent), variable: r2(variable), daily: r2(daily), toPay: r2(toPay), toGet: r2(toGet), income: r2(income),
    projected: r2(projected), projIncome: r2(projIncome), projNet: r2(projIncome - projected), budget: budget > 0 ? r2(budget) : null,
    hasHistory: hist.length > 0,
  };
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
    if (!base.includes(m) || txKind(t) !== 'gasto') continue;
    seen.add(m);
    sum[t.cat] = (sum[t.cat] || 0) + txDOP(t);
  }
  const n = seen.size;
  if (!n) return { months: 0, rows: [] };
  const rows = budgetRows(s, mk, today);
  const cur = Object.fromEntries(rows.map((r) => [r.c.id, r.budget]));
  return {
    months: n,
    rows: Object.entries(sum).map(([cat, v]) => ({ cat, avg: r2(v / n), suggested: roundUp(v / n), current: cur[cat] || 0 }))
      .filter((x) => x.avg >= 100 && catOf(s, x.cat).type === 'gasto').sort((a, b) => b.avg - a.avg),
  };
}

// 50/30/20: necesidades, gustos y ahorro (o deudas) frente a tus ingresos del mes.
const NEEDS = new Set(['super', 'combustible', 'transporte', 'peajes', 'vehiculo', 'vivienda', 'servicios', 'telecom', 'hogar', 'domestico', 'salud', 'educacion', 'seguros', 'impuestos', 'comisiones', 'familia', 'mascotas', 'trabajo']);
const SAVE = new Set(['ahorro', 'deuda']);
export const groupOf503020 = (cat) => (SAVE.has(cat) ? 'ahorro' : NEEDS.has(cat) ? 'necesidades' : 'gustos');
export function split503020(s, mk) {
  const out = { necesidades: 0, gustos: 0, ahorro: 0, income: 0 };
  for (const t of s.money.tx) {
    if (monthKey(t.day) !== mk) continue;
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

// Lo que más cambió, en frases cortas.
export function insights(s, today) {
  const out = [];
  const mk = monthKey(today);
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
