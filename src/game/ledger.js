// Libro de movimientos (1.9): período y filtros, totales por categoría, familia, comercio, cuenta o etiqueta,
// edición masiva con deshacer, mover una categoría completa, reglas de comercio, dividir un movimiento
// y lo que cuesta cada gasto en horas de tu trabajo.
import { monthKey } from '../app/dates.js';
import { CATEGORY_GROUPS } from './content.js';
import {
  txKind, txCur, txOrig, txDOP, txUSD, inStats, catOf, catName, accountOf, accountLabel, merchantKey,
  updateTx, removeTx, learnRule, setTaxRecords, taxSuggestion, findTaxFor, uid, fxRate, toDOP,
} from './logic.js';
import { monthEnd, planDOP, isCard, WORK_DEFAULT } from './money.js';
import { norm } from './parse.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const prevMk = (mk) => { const [y, m] = mk.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
const groupOf = (s, cat) => catOf(s, cat).group || 'otros';
export const groupName = (g) => (CATEGORY_GROUPS.find((x) => x.id === g) || { name: 'Otros' }).name;

// ----- Período de la lista -----
// { kind: 'mes', mk } · { kind: '3m' | '6m' | '12m' | 'ano' | 'todo' } · { kind: 'rango', from, to }
export const RANGE_KINDS = [['mes', 'Un mes'], ['3m', '3 meses'], ['6m', '6 meses'], ['12m', '12 meses'], ['ano', 'Este año'], ['todo', 'Todo'], ['rango', 'Elegir fechas']];
export function periodRange(p, today) {
  const kind = p && p.kind ? p.kind : 'mes';
  if (kind === 'rango' && isDay(p.from) && isDay(p.to)) {
    const [from, to] = p.from <= p.to ? [p.from, p.to] : [p.to, p.from];
    return { kind, from, to };
  }
  if (kind === 'todo') return { kind, from: '1900-01-01', to: '2999-12-31' };
  if (kind === 'ano') return { kind, from: `${today.slice(0, 4)}-01-01`, to: today };
  if (['3m', '6m', '12m'].includes(kind)) {
    let mk = monthKey(today);
    for (let i = 1; i < Number(kind.replace('m', '')); i++) mk = prevMk(mk);
    return { kind, from: `${mk}-01`, to: today };
  }
  const mk = p && /^\d{4}-\d{2}$/.test(p.mk || '') ? p.mk : monthKey(today);
  return { kind: 'mes', mk, from: `${mk}-01`, to: monthEnd(mk) };
}

// ----- Filtros -----
// kind: 'all' | 'gasto' | 'ingreso' | 'transfer'; cats, accounts, tags, srcs: listas (vacía = todos);
// min, max: monto en pesos; cur: 'DOP' | 'USD' | null; only: null | 'photo' | 'split' | 'excluded' | 'tax' | 'noaccount'; q: texto.
export const SOURCES = [['alerta', 'Avisos del banco'], ['importado', 'Importados'], ['recibo', 'Recibos'], ['voz', 'Registro rápido'], ['manual', 'A mano'], ['correo', 'Correo del banco']];
export const ONLY = [['photo', 'Con foto'], ['split', 'Divididos'], ['tax', 'Con impuesto o comisión'], ['excluded', 'Que no cuentan'], ['noaccount', 'Sin cuenta']];
export const emptyFilter = () => ({ kind: 'all', cats: [], accounts: [], tags: [], srcs: [], min: null, max: null, cur: null, only: null, q: '' });

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);
// Acepta también el filtro de antes ({ cat, account, tag }).
export function normFilter(f) {
  const o = { ...emptyFilter(), ...(f || {}) };
  o.cats = asList(f && (f.cats || f.cat));
  o.accounts = asList(f && (f.accounts || f.account));
  o.tags = asList(f && (f.tags || f.tag));
  o.srcs = asList(f && f.srcs);
  for (const k of ['cat', 'account', 'tag']) delete o[k];
  return o;
}
export function filterCount(f) {
  const o = normFilter(f);
  return (o.kind !== 'all' ? 1 : 0) + (o.cats.length ? 1 : 0) + (o.accounts.length ? 1 : 0) + (o.tags.length ? 1 : 0) + (o.srcs.length ? 1 : 0)
    + (o.min != null || o.max != null ? 1 : 0) + (o.cur ? 1 : 0) + (o.only ? 1 : 0);
}
export const isFiltered = (f) => filterCount(f) > 0 || !!String((f && f.q) || '').trim();

const hasTaxKids = (s) => { const ids = new Set(); for (const t of s.money.tx) if (t.taxOf) ids.add(t.taxOf); return ids; };

export function txMatches(s, t, f, ctx = {}) {
  const k = txKind(t);
  if (f.kind !== 'all' && k !== f.kind) return false;
  if (f.cats.length && !f.cats.includes(t.cat)) return false;
  if (f.accounts.length) {
    const a = accountOf(s, t.account);
    if (!(f.accounts.includes(t.account) || f.accounts.includes(t.to) || (a && f.accounts.includes(a.of)))) return false;
  }
  if (f.tags.length && !f.tags.includes(t.tag)) return false;
  if (f.srcs.length && !f.srcs.includes(t.source || 'manual')) return false;
  if (f.cur && txCur(t) !== f.cur) return false;
  const v = txDOP(t);
  if (f.min != null && v < Number(f.min)) return false;
  if (f.max != null && v > Number(f.max)) return false;
  if (f.only === 'photo' && !(t.photos && t.photos.length)) return false;
  if (f.only === 'split' && !t.split) return false;
  if (f.only === 'excluded' && inStats(t)) return false;
  if (f.only === 'noaccount' && t.account) return false;
  if (f.only === 'tax' && !(t.taxOf || (ctx.parents && ctx.parents.has(t.id)))) return false;
  const q = norm(String(f.q || '')).trim();
  if (q) {
    const hay = norm(`${t.merchant} ${t.note} ${catName(s, t.cat)} ${t.tag} ${accountLabel(accountOf(s, t.account))} ${txOrig(t)}`);
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

// Movimientos del período que cumplen el filtro (de más nuevo a más viejo, como se guardan).
export function filterTx(s, per, f0) {
  const f = normFilter(f0);
  const ctx = f.only === 'tax' ? { parents: hasTaxKids(s) } : {};
  return s.money.tx.filter((t) => t.day >= per.from && t.day <= per.to && txMatches(s, t, f, ctx));
}

export const SORTS = [['reciente', 'Más recientes'], ['antiguo', 'Más antiguos'], ['mayor', 'Monto mayor'], ['menor', 'Monto menor']];
export function sortList(list, sort = 'reciente') {
  if (sort === 'reciente') return list;
  const out = [...list];
  if (sort === 'antiguo') out.reverse();
  else if (sort === 'mayor') out.sort((a, b) => txDOP(b) - txDOP(a));
  else if (sort === 'menor') out.sort((a, b) => txDOP(a) - txDOP(b));
  return out;
}

// Totales de una lista: lo que cuenta (gastos, ingresos, entre cuentas) en pesos y dólares, y aparte
// lo que marcaste «no contar».
export function summarize(s, list) {
  const o = { n: list.length, spent: 0, spentUSD: 0, income: 0, incomeUSD: 0, moved: 0, nSpent: 0, nIncome: 0, excluded: 0, nExcluded: 0, days: new Set() };
  for (const t of list) {
    if (!inStats(t)) { o.excluded += txDOP(t); o.nExcluded += 1; continue; }
    const k = txKind(t);
    if (k === 'gasto') { o.spent += txDOP(t); o.spentUSD += txUSD(s, t); o.nSpent += 1; o.days.add(t.day); }
    else if (k === 'ingreso') { o.income += txDOP(t); o.incomeUSD += txUSD(s, t); o.nIncome += 1; }
    else o.moved += txDOP(t);
  }
  const out = { ...o, days: o.days.size };
  for (const k of ['spent', 'spentUSD', 'income', 'incomeUSD', 'moved', 'excluded']) out[k] = r2(o[k]);
  out.net = r2(out.income - out.spent);
  out.netUSD = r2(out.incomeUSD - out.spentUSD);
  out.avg = out.nSpent ? r2(out.spent / out.nSpent) : 0;
  return out;
}

// ----- Agrupar -----
export const GROUP_BY = [['dia', 'Día'], ['categoria', 'Categoría'], ['familia', 'Familia'], ['comercio', 'Comercio'], ['cuenta', 'Cuenta'], ['etiqueta', 'Etiqueta']];

function keyOf(s, t, by) {
  if (by === 'categoria') return t.cat;
  if (by === 'familia') return groupOf(s, t.cat);
  if (by === 'comercio') return merchantKey(t.merchant) || `cat:${t.cat}`;
  if (by === 'cuenta') return t.account || '';
  if (by === 'etiqueta') return t.tag || '';
  return t.day;
}
function labelOf(s, key, by, sample) {
  if (by === 'categoria') { const c = catOf(s, key); return { name: c.name, icon: c.icon || 'tag', sub: groupName(c.group) }; }
  if (by === 'familia') return { name: groupName(key), icon: 'grid', sub: '' };
  if (by === 'comercio') return { name: sample.merchant || catName(s, sample.cat), icon: catOf(s, sample.cat).icon || 'tag', sub: catName(s, sample.cat) };
  if (by === 'cuenta') { const a = accountOf(s, key); return { name: a ? accountLabel(a) : 'Sin cuenta', icon: a ? (isCard(a) ? 'card' : a.kind === 'efectivo' ? 'cash' : 'bank') : 'dots', sub: '' }; }
  if (by === 'etiqueta') return { name: key || 'Sin etiqueta', icon: 'tag', sub: '' };
  return { name: key, icon: 'calendar', sub: '' };
}

// Grupos con su subtotal. Ordenados por día (los días) o por lo que más pesa (lo demás).
// `share`: parte de los gastos (o, si el grupo solo tiene ingresos, de los ingresos) de toda la lista.
export function groupList(s, list, by = 'dia') {
  const map = new Map();
  for (const t of list) {
    const key = keyOf(s, t, by);
    if (!map.has(key)) map.set(key, { key, items: [] });
    map.get(key).items.push(t);
  }
  const all = summarize(s, list);
  const groups = [...map.values()].map((g) => {
    const sum = summarize(s, g.items);
    const lab = labelOf(s, g.key, by, g.items[0]);
    const main = sum.spent > 0 || !(sum.income > 0) ? sum.spent : sum.income;
    const base = sum.spent > 0 || !(sum.income > 0) ? all.spent : all.income;
    return { ...g, ...lab, sum, main, share: base > 0 ? main / base : 0, isIncome: !(sum.spent > 0) && sum.income > 0 };
  });
  if (by === 'dia') return groups;
  return groups.sort((a, b) => (b.isIncome === a.isIncome ? b.main - a.main : a.isIncome ? 1 : -1));
}

// Totales por categoría (o familia) de gastos o de ingresos, para la tarjeta «Por categoría».
export function catTotals(s, list, { type = 'gasto', by = 'categoria' } = {}) {
  const rows = new Map();
  let total = 0;
  for (const t of list) {
    if (!inStats(t) || txKind(t) !== type) continue;
    const key = by === 'familia' ? groupOf(s, t.cat) : t.cat;
    if (!rows.has(key)) rows.set(key, { key, total: 0, usd: 0, n: 0, cats: new Set() });
    const r = rows.get(key);
    r.total += txDOP(t);
    r.usd += txUSD(s, t);
    r.n += 1;
    r.cats.add(t.cat);
    total += txDOP(t);
  }
  return {
    total: r2(total),
    rows: [...rows.values()].map((r) => ({
      ...r, cats: [...r.cats], total: r2(r.total), usd: r2(r.usd), share: total ? r.total / total : 0,
      name: by === 'familia' ? groupName(r.key) : catName(s, r.key), icon: by === 'familia' ? 'grid' : catOf(s, r.key).icon || 'tag',
    })).sort((a, b) => b.total - a.total),
  };
}

// ----- Tu hora de trabajo (como «Your Money or Your Life»: cada gasto cuesta horas de tu vida) -----

// Lo que cobras cada mes según tus cobros fijos (los que no son mensuales, repartidos por mes).
export function plannedMonthlyIncome(s, today) {
  let total = 0;
  const parts = [];
  for (const p of s.money.plans || []) {
    if (p.kind !== 'ingreso' || p.paused || (p.until && p.until < today)) continue;
    const f = p.freq || {};
    const k = f.type === 'month' ? (f.days || []).length : f.type === 'week' ? 52 / 12 / Math.max(1, f.n) : f.type === 'months' ? 1 / Math.max(1, f.n) : 0;
    if (!(k > 0)) continue;
    const v = planDOP(s, p, today) * k;
    total += v;
    parts.push({ name: p.name, monthly: r2(v) });
  }
  return { total: r2(total), parts };
}

// Promedio de lo que entró en los últimos meses completos (sin reembolsos ni préstamos que te devuelven).
const NOT_EARNED = new Set(['reembolsos', 'prestamo_cobrado']);
export function avgMonthlyIncome(s, today, n = 3) {
  const mks = [prevMk(monthKey(today))];
  while (mks.length < n) mks.push(prevMk(mks[mks.length - 1]));
  const by = Object.fromEntries(mks.map((m) => [m, 0]));
  for (const t of s.money.tx) {
    const mk = monthKey(t.day);
    if (!(mk in by) || txKind(t) !== 'ingreso' || !inStats(t) || NOT_EARNED.has(t.cat)) continue;
    by[mk] += txDOP(t);
  }
  const vals = Object.values(by).filter((v) => v > 0);
  return { avg: vals.length ? r2(vals.reduce((a, b) => a + b, 0) / vals.length) : 0, months: vals.length };
}

export function workInfo(s, today) {
  const w = { ...WORK_DEFAULT, ...((s.money && s.money.work) || {}) };
  let income = 0;
  let source = null;
  let parts = [];
  if (!w.auto && w.income > 0) { income = Number(w.income); source = 'manual'; }
  else {
    const pl = plannedMonthlyIncome(s, today);
    if (pl.total > 0) { income = pl.total; source = 'plan'; parts = pl.parts; }
    else {
      const h = avgMonthlyIncome(s, today);
      if (h.avg > 0) { income = h.avg; source = 'hist'; parts = [{ name: `Promedio de ${h.months === 1 ? 'el último mes' : `${h.months} meses`}`, monthly: h.avg }]; }
    }
  }
  const hours = Math.min(100, Math.max(1, Number(w.hours) || WORK_DEFAULT.hours));
  const commute = Math.min(80, Math.max(0, Number(w.commute) || 0));
  const monthHours = (hours * 52) / 12;
  const hourly = income > 0 ? income / monthHours : 0;
  const realHourly = income > 0 ? Math.max(0, income - (Number(w.costs) || 0)) / (((hours + commute) * 52) / 12) : 0;
  const useReal = !!w.real && realHourly > 0;
  const rate = r2(useReal ? realHourly : hourly);
  return {
    ...w, hours, commute, income: r2(income), source, parts, monthHours: r2(monthHours), hourly: r2(hourly), realHourly: r2(realHourly),
    useReal, rate, dayHours: hours / 5, ready: rate > 0,
  };
}

// Horas de trabajo que cuesta un monto en pesos.
export const workHours = (dop, wi) => (wi && wi.rate > 0 ? Math.abs(Number(dop) || 0) / wi.rate : null);

const one = (v) => { const t = (Math.round(v * 10) / 10).toFixed(1); return t.endsWith('.0') ? t.slice(0, -2) : t; };
// «12 min», «2 h 15 min», «1.5 días», «2.3 meses» (de trabajo). Un día = tus horas de la semana ÷ 5.
export function fmtWork(h, wi) {
  if (h == null || !Number.isFinite(h)) return '';
  const min = h * 60;
  if (min < 1) return 'menos de 1 min';
  if (min < 59.5) return `${Math.round(min)} min`;
  const day = (wi && wi.dayHours) || 8;
  if (h < day) {
    let hh = Math.floor(h);
    let mm = Math.round(((h - hh) * 60) / 5) * 5;
    if (mm === 60) { hh += 1; mm = 0; }
    return `${hh} h${mm ? ` ${mm} min` : ''}`;
  }
  const days = h / day;
  const monthHours = (wi && wi.monthHours) || (day * 5 * 52) / 12;
  if (h < monthHours) return `${one(days)} ${one(days) === '1' ? 'día' : 'días'}`;
  const months = h / monthHours;
  return `${one(months)} ${one(months) === '1' ? 'mes' : 'meses'}`;
}

// ----- Deshacer lo último que cambiaste en grupo -----
// Se guarda cómo estaban los movimientos tocados, los que se agregaron y, si cambiaron, las categorías,
// las reglas y los pagos programados.
function snapshot(s, ids, label, extra = {}) {
  const set = new Set(ids);
  // Los impuestos ligados se mueven con su transferencia.
  for (const t of s.money.tx) if (t.taxOf && set.has(t.taxOf)) set.add(t.id);
  return {
    id: `u${uid()}`, label, at: Date.now(), n: ids.length,
    before: s.money.tx.filter((t) => set.has(t.id)).map((t) => structuredClone(t)),
    added: [],
    ...(extra.plans ? { plans: structuredClone(s.money.plans || []) } : {}),
    ...(extra.rules ? { rules: structuredClone(s.money.rules || {}) } : {}),
    ...(extra.categories ? { categories: structuredClone(s.money.categories) } : {}),
  };
}
function sortAll(s) {
  s.money.tx.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : (b.time || '') < (a.time || '') ? -1 : (b.time || '') > (a.time || '') ? 1 : (b.created || 0) - (a.created || 0)));
}

export function undoBulk(s) {
  const u = s.money.lastBulk;
  if (!u) return 0;
  const drop = new Set([...u.before.map((t) => t.id), ...(u.added || [])]);
  s.money.tx = s.money.tx.filter((t) => !drop.has(t.id)).concat(u.before.map((t) => structuredClone(t)));
  if (u.plans) s.money.plans = u.plans;
  if (u.rules) s.money.rules = u.rules;
  if (u.categories) s.money.categories = u.categories;
  sortAll(s);
  s.money.lastBulk = null;
  return u.n;
}

// ----- Editar varios a la vez -----
// patch: { type, cat, account, to, tag, merchant, day, note (se agrega), noStats }. Solo se cambia lo que viene.
export function bulkEdit(s, ids, patch, { label = '' } = {}) {
  const list = ids.map((id) => s.money.tx.find((t) => t.id === id)).filter(Boolean);
  if (!list.length) return 0;
  s.money.lastBulk = snapshot(s, list.map((t) => t.id), label || `Cambiaste ${list.length === 1 ? '1 movimiento' : `${list.length} movimientos`}`);
  let n = 0;
  for (const t of list) {
    const type = patch.type || txKind(t);
    const p = {};
    if (patch.type && patch.type !== txKind(t)) p.type = patch.type;
    // La categoría tiene que ser del tipo del movimiento: una de gastos no se pone a un ingreso.
    // Si cambió el tipo y la suya ya no sirve, pasa a la general de ese tipo.
    const valid = (c) => s.money.categories.some((x) => x.id === c && x.type === type);
    if (patch.cat && valid(patch.cat)) { if (patch.cat !== t.cat) p.cat = patch.cat; }
    else if (!valid(t.cat)) p.cat = type === 'ingreso' ? 'ingreso' : type === 'transfer' ? 'entre_cuentas' : 'otros';
    if (patch.account !== undefined) p.account = patch.account;
    if (patch.to !== undefined && type === 'transfer') p.to = patch.to;
    if (patch.tag !== undefined) p.tag = patch.tag;
    if (patch.merchant != null && String(patch.merchant).trim()) p.merchant = String(patch.merchant).trim();
    if (patch.day && isDay(patch.day)) p.day = patch.day;
    if (patch.note && String(patch.note).trim()) p.note = [t.note, String(patch.note).trim()].filter(Boolean).join(' · ').slice(0, 200);
    if (patch.noStats !== undefined) p.noStats = !!patch.noStats;
    if (!Object.keys(p).length) continue;
    if (updateTx(s, t.id, p, { learn: false })) n += 1;
  }
  if (!n) s.money.lastBulk = null;
  return n;
}

export function bulkRemove(s, ids) {
  const list = ids.filter((id) => s.money.tx.some((t) => t.id === id));
  if (!list.length) return 0;
  s.money.lastBulk = snapshot(s, list, `Borraste ${list.length === 1 ? '1 movimiento' : `${list.length} movimientos`}`, { plans: true });
  for (const id of list) removeTx(s, id);
  return list.length;
}

// Agrega el impuesto a las transferencias que pueden pagarlo y todavía no lo tienen.
export function bulkAddTax(s, ids, { fee = 0 } = {}) {
  const list = taxable(s, ids);
  if (!list.length) return 0;
  const u = snapshot(s, [], `Agregaste el impuesto a ${list.length === 1 ? '1 transferencia' : `${list.length} transferencias`}`);
  u.n = list.length;
  for (const t of list) {
    const made = setTaxRecords(s, t.id, { tax: true, ...(fee > 0 ? { fee } : {}) });
    u.added.push(...made.map((x) => x.id));
  }
  s.money.lastBulk = u;
  return list.length;
}

// ¿A cuáles de estos se les puede agregar el impuesto? A las transferencias y pagos desde tu cuenta de banco
// (a terceros, de tarjeta o de préstamo) que todavía no lo tienen. Una compra con la débito, no.
export function taxable(s, ids) {
  return ids.map((id) => s.money.tx.find((t) => t.id === id)).filter((t) => {
    if (!t || t.taxOf) return false;
    const sg = taxSuggestion(s, t);
    return sg.can && sg.likely && !findTaxFor(s, t);
  });
}

// ----- Una categoría completa a otra (y, si es tuya, borrarla: unir dos categorías) -----
export function moveCategory(s, from, to, { remove = false, learn = true } = {}) {
  const a = catOf(s, from);
  const b = s.money.categories.find((c) => c.id === to);
  if (!b || from === to || a.type !== b.type) return 0;
  const list = s.money.tx.filter((t) => t.cat === from);
  s.money.lastBulk = snapshot(s, list.map((t) => t.id), `Pasaste ${list.length === 1 ? '1 movimiento' : `${list.length} movimientos`} de «${a.name}» a «${b.name}»`, { rules: true, categories: true, plans: true });
  for (const t of list) t.cat = to;
  for (const p of s.money.plans || []) if (p.cat === from) p.cat = to;
  if (learn) for (const k of Object.keys(s.money.rules)) if (s.money.rules[k] === from) s.money.rules[k] = to;
  if (remove && s.money.categories.find((c) => c.id === from && c.custom)) {
    const old = s.money.categories.find((c) => c.id === from);
    if (old && Number(old.budget) > 0 && !(Number(b.budget) > 0)) b.budget = old.budget;
    s.money.categories = s.money.categories.filter((c) => c.id !== from);
    for (const k of Object.keys(s.money.rules)) if (s.money.rules[k] === from) delete s.money.rules[k];
  }
  return list.length;
}

// ----- Reglas: este comercio siempre va en esta categoría -----
// Las reglas se aprenden al corregir la categoría de un comercio; aquí se ven, se cambian y se aplican atrás.
export function rulesList(s) {
  const counts = {};
  for (const t of s.money.tx) {
    if (txKind(t) !== 'gasto' || t.split || t.taxOf) continue;
    const k = merchantKey(t.merchant);
    if (!k || !s.money.rules[k]) continue;
    if (!counts[k]) counts[k] = { n: 0, off: 0, name: t.merchant };
    counts[k].n += 1;
    if (t.cat !== s.money.rules[k]) counts[k].off += 1;
  }
  return Object.entries(s.money.rules)
    .filter(([, cat]) => s.money.categories.some((c) => c.id === cat))
    .map(([key, cat]) => ({ key, cat, name: (counts[key] && counts[key].name) || key, n: counts[key] ? counts[key].n : 0, off: counts[key] ? counts[key].off : 0 }))
    .sort((a, b) => b.n - a.n || (a.name < b.name ? -1 : 1));
}

// Los gastos de ese comercio que están en otra categoría.
export function ruleMismatches(s, key, cat) {
  return s.money.tx.filter((t) => txKind(t) === 'gasto' && !t.split && !t.taxOf && merchantKey(t.merchant) === key && t.cat !== cat);
}

export function setRule(s, merchantText, cat) {
  const k = merchantKey(merchantText);
  if (!k || k.length < 3 || catOf(s, cat).type !== 'gasto') return null;
  learnRule(s, merchantText, cat);
  return k;
}
export function removeRule(s, key) { delete s.money.rules[key]; }

// Aplica la regla a lo que ya registraste (con deshacer).
export function applyRule(s, key) {
  const cat = s.money.rules[key];
  if (!cat) return 0;
  const list = ruleMismatches(s, key, cat);
  if (!list.length) return 0;
  s.money.lastBulk = snapshot(s, list.map((t) => t.id), `Cambiaste ${list.length === 1 ? '1 movimiento' : `${list.length} movimientos`} a «${catName(s, cat)}»`);
  for (const t of list) t.cat = cat;
  return list.length;
}

// Otros gastos del mismo comercio en otra categoría (para ofrecer cambiarlos también).
export function sameMerchantOthers(s, tx) {
  const k = merchantKey(tx.merchant);
  if (!k || k.length < 3 || txKind(tx) !== 'gasto') return [];
  return s.money.tx.filter((t) => t.id !== tx.id && txKind(t) === 'gasto' && !t.split && !t.taxOf && merchantKey(t.merchant) === k && t.cat !== tx.cat);
}

// ----- Dividir un movimiento en varias categorías (como Copilot) -----
// parts: [{ cat, amount (en la moneda del movimiento), note }]. Tienen que sumar el monto completo.
// La primera parte se queda con el id (así no se pierden sus ligas: pago programado, impuesto, fotos).
export function splitTx(s, id, parts) {
  const t = s.money.tx.find((x) => x.id === id);
  if (!t || t.split || t.taxOf || txKind(t) === 'transfer') return null;
  const total = txOrig(t);
  const ps = (parts || []).map((p) => ({ cat: p.cat, amount: r2(Math.abs(Number(p.amount) || 0)), note: String(p.note || '').slice(0, 120) })).filter((p) => p.amount > 0);
  if (ps.length < 2 || Math.abs(ps.reduce((a, p) => a + p.amount, 0) - total) > 0.011) return null;
  const type = txKind(t);
  if (ps.some((p) => catOf(s, p.cat).type !== type || !s.money.categories.some((c) => c.id === p.cat))) return null;
  const sid = `sp${uid()}`;
  s.money.lastBulk = snapshot(s, [t.id], 'Dividiste un movimiento');
  const out = [];
  ps.forEach((p, i) => {
    const split = { id: sid, i, n: ps.length, total };
    if (i === 0) {
      out.push(updateTx(s, t.id, { amount: p.amount, cat: p.cat, note: p.note || t.note, split }, { learn: false }));
      return;
    }
    const nt = structuredClone(t);
    nt.id = uid();
    nt.created = (Number(t.created) || Date.now()) + i;
    nt.cat = p.cat;
    nt.orig = p.amount;
    nt.amount = (type === 'ingreso' ? 1 : -1) * toDOP(p.amount, txCur(t), Number(t.rate) || fxRate(s, t.day));
    nt.note = p.note || '';
    nt.photos = [];
    nt.split = split;
    delete nt.noStats;
    if (t.noStats) nt.noStats = true;
    s.money.tx.push(nt);
    s.money.lastBulk.added.push(nt.id);
    out.push(nt);
  });
  sortAll(s);
  return out;
}

export const splitParts = (s, sid) => s.money.tx.filter((t) => t.split && t.split.id === sid).sort((a, b) => a.split.i - b.split.i);

// Vuelve a juntar las partes en un solo movimiento (con la categoría de la primera).
export function unsplitTx(s, sid) {
  const parts = splitParts(s, sid);
  if (!parts.length) return null;
  const first = parts[0];
  s.money.lastBulk = snapshot(s, parts.map((t) => t.id), 'Juntaste un movimiento dividido');
  const others = new Set(parts.slice(1).map((t) => t.id));
  s.money.tx = s.money.tx.filter((t) => !others.has(t.id));
  return updateTx(s, first.id, { amount: first.split.total, split: null }, { learn: false });
}
