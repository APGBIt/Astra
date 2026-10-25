// Compras (1.13): listas de supermercado y de otras tiendas, despensa (qué hay, qué queda poco, qué se vence),
// lo que ya te toca comprar según tus hábitos, la compra terminada (con su gasto en Finanzas) y los deseos
// con la regla de esperar antes de comprar. Todo vive en `s.shop`. Es puro: recibe el estado y lo cambia.
import { addDays, diffDays, monthKey, weekday } from '../app/dates.js';
import { uid, getDay, gainXP, addGold, addTx, checkAchievements, fxRate, toDOP, removeTodo } from './logic.js';
import { budgetRows } from './money.js';
import { workInfo, workHours, fmtWork } from './ledger.js';
import { AISLES, AISLE_IDS, BASICS, aisleIndex, aisleOf, isCountUnit, matchProduct, norm, parseShopLine, productOf, qtyText, unitOf, UNITS } from './shoplex.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const txt = (v, n = 80) => String(v == null ? '' : v).trim().slice(0, n);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const slug = (t) => `x-${norm(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`;
const pos = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

export const LEVELS = [['ok', 'Hay'], ['low', 'Queda poco'], ['out', 'Se acabó']];
export const WISH_DAYS = [7, 14, 30, 60];
export const LIST_ICONS = ['cart', 'bag', 'pill', 'wrench', 'gift', 'utensils', 'paw', 'baby', 'home', 'box'];

export function defaultShop() {
  return {
    lists: [{ id: 'l-super', name: 'Supermercado', icon: 'cart', store: '', created: '' }],
    items: [], hist: {}, pantry: [], trips: [], wishes: [], codes: {}, saved: 0,
    cfg: { day: null, staples: false, wishDays: 30, autoAdd: true, autoPantry: true, budget: 0 },
  };
}

function normList(l, i) {
  return { id: String(l.id), name: txt(l.name, 40) || `Lista ${i + 1}`, icon: LIST_ICONS.includes(l.icon) ? l.icon : 'cart', store: txt(l.store, 40), created: isDay(l.created) ? l.created : '', archived: isDay(l.archived) ? l.archived : null };
}
function normItem(it, lists) {
  const prod = matchProduct(it.name);
  return {
    id: String(it.id), list: lists.some((l) => l.id === it.list) ? it.list : lists[0].id, name: txt(it.name, 60),
    key: it.key ? String(it.key) : prod ? prod.key : slug(it.name), aisle: AISLE_IDS.includes(it.aisle) ? it.aisle : prod ? prod.aisle : 'otros',
    qty: pos(it.qty) || null, unit: unitOf(it.unit) ? it.unit : null, price: r2(pos(it.price)), note: txt(it.note, 100),
    done: isDay(it.done) ? it.done : null, added: isDay(it.added) ? it.added : '', by: ['manual', 'voz', 'foto', 'despensa', 'habito', 'pendiente', 'receta'].includes(it.by) ? it.by : 'manual',
  };
}

// Completa lo que falte en datos viejos o dañados (se llama al abrir y al juntar datos de Drive).
export function ensureShop(s) {
  const d = defaultShop();
  const o = isObj(s.shop) ? s.shop : {};
  const lists = (Array.isArray(o.lists) ? o.lists : []).filter((l) => isObj(l) && l.id).map(normList);
  if (!lists.length) lists.push(d.lists[0]);
  const cfg = isObj(o.cfg) ? o.cfg : {};
  const hist = {};
  for (const [k, h] of Object.entries(isObj(o.hist) ? o.hist : {})) {
    if (!isObj(h) || !txt(h.name)) continue;
    hist[k] = {
      name: txt(h.name, 60), aisle: AISLE_IDS.includes(h.aisle) ? h.aisle : 'otros', unit: unitOf(h.unit) ? h.unit : null, n: Math.max(0, Math.round(Number(h.n) || 0)),
      last: isDay(h.last) ? h.last : '', days: (Array.isArray(h.days) ? h.days.filter(isDay) : []).sort().reverse().slice(0, 10),
      price: r2(pos(h.price)), store: txt(h.store, 40), prices: (Array.isArray(h.prices) ? h.prices : []).filter((p) => isObj(p) && isDay(p.d) && pos(p.p)).map((p) => ({ d: p.d, p: r2(p.p), st: txt(p.st, 40) })).slice(0, 8),
    };
  }
  s.shop = {
    lists,
    items: (Array.isArray(o.items) ? o.items : []).filter((it) => isObj(it) && it.id && txt(it.name)).map((it) => normItem(it, lists)).slice(0, 600),
    hist,
    pantry: (Array.isArray(o.pantry) ? o.pantry : []).filter((p) => isObj(p) && p.id && txt(p.name)).map((p) => {
      const prod = matchProduct(p.name);
      return {
        id: String(p.id), key: p.key ? String(p.key) : prod ? prod.key : slug(p.name), name: txt(p.name, 60), aisle: AISLE_IDS.includes(p.aisle) ? p.aisle : prod ? prod.aisle : 'otros',
        qty: pos(p.qty) || null, unit: unitOf(p.unit) ? p.unit : null, level: ['ok', 'low', 'out'].includes(p.level) ? p.level : 'ok', basic: !!p.basic,
        best: isDay(p.best) ? p.best : null, seen: isDay(p.seen) ? p.seen : '', src: txt(p.src, 12),
      };
    }).slice(0, 400),
    trips: (Array.isArray(o.trips) ? o.trips : []).filter((t) => isObj(t) && t.id && isDay(t.day)).map((t) => ({
      id: String(t.id), day: t.day, list: String(t.list || ''), store: txt(t.store, 40), n: Math.max(0, Math.round(Number(t.n) || 0)), total: r2(pos(t.total)), est: r2(pos(t.est)), tx: t.tx ? String(t.tx) : '',
      items: (Array.isArray(t.items) ? t.items : []).filter((x) => isObj(x) && txt(x.name)).map((x) => ({ name: txt(x.name, 60), qty: pos(x.qty) || null, unit: unitOf(x.unit) ? x.unit : null, price: r2(pos(x.price)) })).slice(0, 80),
    })).slice(0, 60),
    wishes: (Array.isArray(o.wishes) ? o.wishes : []).filter((w) => isObj(w) && w.id && txt(w.name)).map((w) => ({
      id: String(w.id), name: txt(w.name, 80), price: r2(pos(w.price)), cur: w.cur === 'USD' ? 'USD' : 'DOP', added: isDay(w.added) ? w.added : '', until: isDay(w.until) ? w.until : '',
      note: txt(w.note, 160), url: txt(w.url, 200), state: ['wait', 'bought', 'dropped'].includes(w.state) ? w.state : 'wait', decided: isDay(w.decided) ? w.decided : null,
    })).slice(0, 200),
    codes: Object.fromEntries(Object.entries(isObj(o.codes) ? o.codes : {}).filter(([k, v]) => /^\d{6,14}$/.test(k) && txt(v)).map(([k, v]) => [k, txt(v, 60)]).slice(0, 300)),
    saved: r2(pos(o.saved)),
    cfg: {
      day: Number.isInteger(cfg.day) && cfg.day >= 0 && cfg.day <= 6 ? cfg.day : null, staples: !!cfg.staples, wishDays: WISH_DAYS.includes(cfg.wishDays) ? cfg.wishDays : d.cfg.wishDays,
      autoAdd: cfg.autoAdd !== false, autoPantry: cfg.autoPantry !== false, budget: Math.max(0, Math.round(Number(cfg.budget) || 0)),
    },
  };
  return s.shop;
}

export function shopOf(s) {
  if (!s.shop || !Array.isArray(s.shop.lists) || !s.shop.cfg) ensureShop(s);
  return s.shop;
}

// ---------- Listas ----------

export const listOf = (s, id) => { const sh = shopOf(s); return sh.lists.find((l) => l.id === id) || sh.lists.find((l) => !l.archived) || sh.lists[0]; };

export function addList(s, p, today) {
  const sh = shopOf(s);
  const name = txt(p.name, 40);
  if (!name) return null;
  const l = normList({ id: uid(), name, icon: p.icon, store: p.store, created: today }, sh.lists.length);
  sh.lists.push(l);
  return l;
}
export function updateList(s, id, p) {
  const l = shopOf(s).lists.find((x) => x.id === id);
  if (!l) return null;
  if (p.name != null && txt(p.name)) l.name = txt(p.name, 40);
  if (p.icon && LIST_ICONS.includes(p.icon)) l.icon = p.icon;
  if (p.store != null) l.store = txt(p.store, 40);
  return l;
}
// Borrar una lista pasa lo que tenía a la primera que quede (no se pierde nada por accidente).
export function removeList(s, id) {
  const sh = shopOf(s);
  if (sh.lists.length <= 1) return false;
  const to = sh.lists.find((l) => l.id !== id);
  for (const it of sh.items) if (it.list === id) it.list = to.id;
  sh.lists = sh.lists.filter((l) => l.id !== id);
  return true;
}

// ---------- Artículos ----------

const pendingOf = (sh, listId = null) => sh.items.filter((i) => !i.done && (!listId || i.list === listId));
export const pendingKeys = (s) => new Set(pendingOf(shopOf(s)).map((i) => i.key));

// `parsed`: [{ name, qty, unit, note, key?, aisle?, prod? }]. Si ya está en la lista, junta las cantidades.
export function addShopItems(s, parsed, { list = null, by = 'manual', today }) {
  const sh = shopOf(s);
  const lid = sh.lists.some((l) => l.id === list) ? list : listOf(s, null).id;
  const added = [];
  const merged = [];
  for (const p of parsed || []) {
    const name = txt(p.name, 60);
    if (!name) continue;
    const prod = p.prod || matchProduct(name);
    const key = p.key || (prod ? prod.key : slug(name));
    const unit = unitOf(p.unit) ? p.unit : null;
    const qty = pos(p.qty) || null;
    const ex = sh.items.find((i) => i.list === lid && i.key === key && !i.done);
    if (ex) {
      if (qty && ex.unit === unit) ex.qty = (ex.qty || 1) + qty;
      else if (qty && !ex.qty) { ex.qty = qty; ex.unit = unit; }
      merged.push(ex);
      continue;
    }
    const back = sh.items.find((i) => i.list === lid && i.key === key && i.done);
    if (back) { back.done = null; if (qty) { back.qty = qty; back.unit = unit; } merged.push(back); continue; }
    const it = normItem({ id: uid(), list: lid, name, key, aisle: p.aisle || (prod ? prod.aisle : 'otros'), qty, unit, note: p.note, added: today, by }, sh.lists);
    sh.items.push(it);
    added.push(it);
  }
  return { added, merged, list: lid };
}

export function parseAndAdd(s, text, opts) {
  return addShopItems(s, parseShopLine(text), opts);
}

export function updateItem(s, id, p) {
  const sh = shopOf(s);
  const it = sh.items.find((x) => x.id === id);
  if (!it) return null;
  if (p.name != null && txt(p.name)) {
    it.name = txt(p.name, 60);
    const prod = matchProduct(it.name);
    it.key = prod ? prod.key : slug(it.name);
    if (p.aisle == null && prod) it.aisle = prod.aisle;
  }
  if (p.qty !== undefined) it.qty = pos(p.qty) || null;
  if (p.unit !== undefined) it.unit = unitOf(p.unit) ? p.unit : null;
  if (p.price !== undefined) it.price = r2(pos(p.price));
  if (p.note != null) it.note = txt(p.note, 100);
  if (p.aisle && AISLE_IDS.includes(p.aisle)) it.aisle = p.aisle;
  if (p.list && sh.lists.some((l) => l.id === p.list)) it.list = p.list;
  return it;
}
export function removeItem(s, id) { const sh = shopOf(s); sh.items = sh.items.filter((i) => i.id !== id); }
export function toggleItem(s, id, today) {
  const it = shopOf(s).items.find((x) => x.id === id);
  if (!it) return null;
  it.done = it.done ? null : today;
  return it;
}
// Quita de la lista lo ya marcado, sin registrar la compra.
export function clearChecked(s, listId) { const sh = shopOf(s); sh.items = sh.items.filter((i) => !(i.done && i.list === listId)); }

// ---------- Precios y totales ----------

export const priceOf = (s, it) => it.price > 0 ? it.price : ((shopOf(s).hist[it.key] || {}).price || 0);
export const itemTotal = (s, it) => priceOf(s, it) * (it.qty || 1);

export function listTotals(s, listId = null) {
  const sh = shopOf(s);
  const all = sh.items.filter((i) => !listId || i.list === listId);
  const left = all.filter((i) => !i.done);
  const done = all.filter((i) => i.done);
  const sum = (xs) => r2(xs.reduce((a, i) => a + itemTotal(s, i), 0));
  const unknown = left.filter((i) => !(priceOf(s, i) > 0)).length;
  return { n: all.length, left: left.length, done: done.length, est: sum(left), estAll: sum(all), estDone: sum(done), unknown, known: left.length - unknown };
}

// Cuánto llevas gastado en el súper este mes frente a su presupuesto (el de Finanzas o el que pongas aquí).
export function monthBudget(s, today) {
  const mk = monthKey(today);
  const row = (s.money ? budgetRows(s, mk, today) : []).find((r) => !r.isGroup && r.c.id === 'super');
  const own = shopOf(s).cfg.budget;
  const spent = r2(s.money.tx.filter((t) => monthKey(t.day) === mk && t.cat === 'super' && t.kind === 'gasto' && !t.noStats).reduce((a, t) => a + Math.abs(Number(t.amount) || 0), 0));
  const budget = own > 0 ? own : row ? row.avail : 0;
  return { has: budget > 0, budget: r2(budget), spent, left: r2(budget - spent), pct: budget > 0 ? spent / budget : 0, own: own > 0 };
}

// ---------- Historial y hábitos ----------

function learn(sh, it, store, day, price) {
  const h = sh.hist[it.key] || (sh.hist[it.key] = { name: it.name, aisle: it.aisle, unit: it.unit, n: 0, last: '', days: [], price: 0, store: '', prices: [] });
  h.name = it.name; h.aisle = it.aisle; if (it.unit) h.unit = it.unit;
  if (!h.days.includes(day)) { h.n += 1; h.days = [day, ...h.days].sort().reverse().slice(0, 10); }
  if (!h.last || day > h.last) h.last = day;
  if (price > 0) {
    h.price = r2(price); h.store = txt(store, 40);
    h.prices = [{ d: day, p: r2(price), st: txt(store, 40) }, ...h.prices.filter((p) => !(p.d === day && p.st === txt(store, 40)))].slice(0, 8);
  }
}

// Más barato conocido de un producto: { store, price } o null.
export function cheapest(s, key) {
  const h = shopOf(s).hist[key];
  if (!h || !h.prices.length) return null;
  const by = {};
  for (const p of h.prices) if (p.st && !by[p.st]) by[p.st] = p.p;
  const list = Object.entries(by).sort((a, b) => a[1] - b[1]);
  return list.length >= 2 ? { store: list[0][0], price: list[0][1], others: list.slice(1).map(([store, price]) => ({ store, price })) } : null;
}

// Lo que ya te toca: lo que compras cada cierto tiempo y ya pasó ese tiempo.
export function dueSuggestions(s, today, limit = 8) {
  const sh = shopOf(s);
  const pend = pendingKeys(s);
  const out = [];
  for (const [key, h] of Object.entries(sh.hist)) {
    if (h.n < 3 || h.days.length < 3 || pend.has(key)) continue;
    const gaps = [];
    for (let i = 0; i < h.days.length - 1; i++) gaps.push(diffDays(h.days[i + 1], h.days[i]));
    gaps.sort((a, b) => a - b);
    const gap = gaps[Math.floor(gaps.length / 2)];
    if (gap < 3 || gap > 120) continue;
    const since = diffDays(h.last, today);
    const p = sh.pantry.find((x) => x.key === key);
    if (p && p.level === 'ok' && p.seen && diffDays(p.seen, today) < gap * 0.6) continue;
    if (since >= gap - 1) out.push({ key, name: h.name, aisle: h.aisle, unit: h.unit, gap, since, ratio: since / gap, why: `Lo compras cada ${gap} días · hace ${since}` });
  }
  return out.sort((a, b) => b.ratio - a.ratio).slice(0, limit);
}

// ---------- Despensa ----------

export function pantryUpsert(s, p, today) {
  const sh = shopOf(s);
  const name = txt(p.name, 60);
  if (!name) return null;
  const prod = p.prod || matchProduct(name);
  const key = p.key || (prod ? prod.key : slug(name));
  let e = sh.pantry.find((x) => x.key === key);
  const unit = unitOf(p.unit) ? p.unit : null;
  const best = isDay(p.best) ? p.best : prod && prod.shelf > 0 && prod.shelf <= 45 && p.level !== 'out' && p.restock ? addDays(today, prod.shelf) : e ? e.best : null;
  if (!e) {
    e = { id: uid(), key, name: prod && norm(name) === norm(prod.name) ? prod.name : name, aisle: p.aisle || (prod ? prod.aisle : 'otros'), qty: null, unit: null, level: 'ok', basic: false, best: null, seen: '', src: '' };
    sh.pantry.push(e);
    if (sh.pantry.length > 400) sh.pantry.shift();
  }
  if (p.qty !== undefined) e.qty = pos(p.qty) || null;
  if (unit) e.unit = unit;
  if (p.level && ['ok', 'low', 'out'].includes(p.level)) e.level = p.level;
  if (p.basic !== undefined) e.basic = !!p.basic;
  if (best !== undefined) e.best = best;
  e.seen = today;
  if (p.src) e.src = txt(p.src, 12);
  return e;
}

// Cambia cuánto queda. Si se acaba (o queda poco) y lo tienes activado, lo agrega a tu lista.
export function setLevel(s, id, level, today, { list = null, addToList = null } = {}) {
  const sh = shopOf(s);
  const e = sh.pantry.find((x) => x.id === id);
  if (!e || !['ok', 'low', 'out'].includes(level)) return null;
  e.level = level;
  e.seen = today;
  let added = null;
  if ((level === 'out' || level === 'low') && (addToList != null ? addToList : sh.cfg.autoAdd)) {
    const r = addShopItems(s, [{ name: e.name, key: e.key, aisle: e.aisle, unit: e.unit }], { list, by: 'despensa', today });
    added = r.added[0] || null;
  }
  return { e, added };
}
export function removePantry(s, id) { const sh = shopOf(s); sh.pantry = sh.pantry.filter((p) => p.id !== id); }
export function toggleBasic(s, id) { const e = shopOf(s).pantry.find((x) => x.id === id); if (e) e.basic = !e.basic; return e; }

// Se vence pronto: la fecha que pusiste (o la que leyó la foto) está a `days` días o menos.
export function expiring(s, today, days = 3) {
  return shopOf(s).pantry.filter((p) => p.best && p.level !== 'out' && diffDays(today, p.best) <= days).sort((a, b) => (a.best < b.best ? -1 : 1));
}

export function pantryCounts(s) {
  const p = shopOf(s).pantry;
  return { total: p.length, low: p.filter((x) => x.level === 'low').length, out: p.filter((x) => x.level === 'out').length };
}

// Lo que se acabó o queda poco y todavía no está en tu lista.
export function runningLow(s) {
  const sh = shopOf(s);
  const pend = pendingKeys(s);
  return sh.pantry.filter((p) => p.level !== 'ok' && !pend.has(p.key));
}

// ---------- Foto de la nevera o la despensa ----------

// `seenRaw`: lo que se ve en la foto: [{ name, qty, unit, level: 'ok' | 'low', best }].
// Devuelve lo visto (con su producto y pasillo) y lo que podría faltar, con el motivo de cada uno.
export function analyzePantry(s, seenRaw, today, ideas = []) {
  const sh = shopOf(s);
  const seen = [];
  const keys = new Set();
  for (const r of seenRaw || []) {
    const name = txt(r.name, 60);
    if (!name) continue;
    const prod = matchProduct(name);
    const key = prod ? prod.key : slug(name);
    if (keys.has(key)) continue;
    keys.add(key);
    seen.push({
      key, name: prod && norm(name) === norm(prod.name) ? prod.name : name, aisle: prod ? prod.aisle : 'otros', qty: pos(r.qty) || null, unit: unitOf(r.unit) ? r.unit : prod && prod.unit && prod.unit !== 'u' ? null : null,
      level: r.level === 'low' ? 'low' : 'ok', best: isDay(r.best) ? r.best : null, known: !!prod,
    });
  }
  const pend = pendingKeys(s);
  const miss = new Map();
  const put = (m) => { if (!keys.has(m.key) && !pend.has(m.key) && !miss.has(m.key)) miss.set(m.key, m); };
  // 1. Lo que se ve casi vacío.
  for (const x of seen) if (x.level === 'low' && !pend.has(x.key)) miss.set(x.key, { key: x.key, name: x.name, aisle: x.aisle, unit: x.unit, src: 'poco', why: 'Se ve que queda poco' });
  // 2. Lo que compras seguido y no se ve.
  for (const [key, h] of Object.entries(sh.hist)) {
    if (h.n >= 2) put({ key, name: h.name, aisle: h.aisle, unit: h.unit, src: 'habito', why: `Lo compras seguido · última vez hace ${Math.max(0, diffDays(h.last || today, today))} días` });
  }
  // 3. Lo que marcaste como básico.
  for (const p of sh.pantry) if (p.basic) put({ key: p.key, name: p.name, aisle: p.aisle, unit: p.unit, src: 'basico', why: 'Lo marcaste como básico' });
  // 4. Los básicos de la casa (si los activaste).
  if (sh.cfg.staples) for (const c of BASICS) put({ key: c.key, name: c.name, aisle: c.aisle, unit: c.unit === 'u' ? null : null, src: 'basico', why: 'Básico de la casa' });
  // 5. Ideas de la IA: lo que combina con lo que se ve.
  for (const i of ideas || []) {
    const name = txt(i.name, 60);
    if (!name) continue;
    const prod = matchProduct(name);
    put({ key: prod ? prod.key : slug(name), name: prod && norm(name) === norm(prod.name) ? prod.name : name, aisle: prod ? prod.aisle : 'otros', unit: null, src: 'ia', why: txt(i.why, 90) || 'Combina con lo que tienes' });
  }
  const order = { poco: 0, habito: 1, basico: 2, ia: 3 };
  const missing = [...miss.values()].sort((a, b) => order[a.src] - order[b.src] || aisleIndex(a.aisle) - aisleIndex(b.aisle)).slice(0, 40);
  return { seen: seen.sort((a, b) => aisleIndex(a.aisle) - aisleIndex(b.aisle)), missing };
}

// Guarda lo visto en la despensa y agrega a la lista lo que elegiste.
export function applyScan(s, { seen = [], add = [] }, { list = null, today, ev = [] }) {
  const sh = shopOf(s);
  let n = 0;
  for (const x of seen) { pantryUpsert(s, { ...x, src: 'foto', restock: false }, today); n += 1; }
  const r = addShopItems(s, add.map((m) => ({ name: m.name, key: m.key, aisle: m.aisle, unit: m.unit })), { list, by: 'foto', today });
  const d = getDay(s, today);
  if (!d.shopScan && (n || r.added.length)) { d.shopScan = true; gainXP(s, 'finanzas', 4, today, ev); }
  void sh;
  return { seen: n, added: r.added.length, merged: r.merged.length };
}

// ---------- Compra terminada ----------

// `p`: { list, total (lo que pagaste, en RD$), store, account, day, saveTx, ids }.
export function closeTrip(s, p, today, ev = []) {
  const sh = shopOf(s);
  const lid = sh.lists.some((l) => l.id === p.list) ? p.list : listOf(s, null).id;
  const idSet = p.ids ? new Set(p.ids) : null;
  const items = sh.items.filter((i) => i.list === lid && i.done && (!idSet || idSet.has(i.id)));
  const day = isDay(p.day) ? p.day : today;
  const store = txt(p.store || (sh.lists.find((l) => l.id === lid) || {}).store, 40);
  const est = r2(items.reduce((a, i) => a + itemTotal(s, i), 0));
  const total = r2(pos(p.total));
  // Si pagaste lo que dice la lista, el precio de cada cosa se queda; si no, los precios que tú pusiste se aprenden.
  for (const it of items) learn(sh, it, store, day, it.price);
  for (const it of items) {
    if (sh.cfg.autoPantry) {
      const prod = productOf(it.key);
      pantryUpsert(s, { name: it.name, key: it.key, aisle: it.aisle, unit: it.unit, qty: it.qty, level: 'ok', restock: true, prod }, day);
    } else {
      const e = sh.pantry.find((x) => x.key === it.key);
      if (e) { e.level = 'ok'; e.seen = day; }
    }
  }
  const gone = new Set(items.map((i) => i.id));
  sh.items = sh.items.filter((i) => !gone.has(i.id));
  let tx = null;
  if (total > 0 && p.saveTx !== false) {
    tx = addTx(s, { type: 'gasto', amount: total, currency: 'DOP', cat: 'super', merchant: store || 'Supermercado', account: p.account || '', day, note: `${items.length} ${items.length === 1 ? 'producto' : 'productos'} de tu lista`, photos: p.photos || [], source: 'manual' }, today, ev);
  }
  const trip = { id: uid(), day, list: lid, store, n: items.length, total, est, tx: tx ? tx.id : '', items: items.slice(0, 60).map((i) => ({ name: i.name, qty: i.qty, unit: i.unit, price: priceOf(s, i) })) };
  sh.trips.unshift(trip);
  sh.trips = sh.trips.slice(0, 60);
  // Recompensa: ir con lista (+8 XP), y +7 si lo pagado no pasó de lo estimado. Una vez al día para no premiar el ir y venir.
  const d = getDay(s, today);
  let xp = 0;
  const under = est > 0 && total > 0 && total <= est * 1.05;
  if (items.length >= 3 && !d.tripXp) {
    d.tripXp = true;
    xp += gainXP(s, 'finanzas', 8, today, ev);
    if (under) xp += gainXP(s, 'finanzas', 7, today, ev);
    addGold(s, under ? 5 : 3, today);
    s.stats.trips = (s.stats.trips || 0) + 1;
  }
  checkAchievements(s, today, ev);
  return { trip, tx, n: items.length, total, est, under, xp };
}

// ---------- Recibo → precios ----------

const tok = (t) => norm(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 4).map((w) => (w.endsWith('s') && w.length > 4 ? w.slice(0, -1) : w));
// Une las líneas de un recibo ({ desc, total }) con lo que tenías en la lista y devuelve los precios: [{ id, price }].
export function matchReceipt(s, recItems, listId = null) {
  const sh = shopOf(s);
  const pool = sh.items.filter((i) => (!listId || i.list === listId) && i.done);
  const used = new Set();
  const out = [];
  for (const r of recItems || []) {
    const total = pos(r.total);
    if (!total) continue;
    const prod = matchProduct(r.desc);
    const rt = new Set(tok(r.desc));
    let best = null;
    let bestScore = 0;
    for (const it of pool) {
      if (used.has(it.id)) continue;
      let score = 0;
      if (prod && prod.key === it.key) score = 3;
      else { const common = tok(it.name).filter((w) => rt.has(w)).length; score = common; }
      if (score > bestScore) { best = it; bestScore = score; }
    }
    if (best) { used.add(best.id); out.push({ id: best.id, price: r2(total / (best.qty || 1)), line: r.desc }); }
  }
  return out;
}
export function applyPrices(s, pairs) {
  const sh = shopOf(s);
  let n = 0;
  for (const p of pairs || []) { const it = sh.items.find((x) => x.id === p.id); if (it && pos(p.price)) { it.price = r2(p.price); n += 1; } }
  return n;
}

// ---------- Deseos (esperar antes de comprar) ----------

export function addWish(s, p, today) {
  const sh = shopOf(s);
  const name = txt(p.name, 80);
  if (!name) return null;
  const days = WISH_DAYS.includes(Number(p.days)) ? Number(p.days) : sh.cfg.wishDays;
  const w = { id: uid(), name, price: r2(pos(p.price)), cur: p.cur === 'USD' ? 'USD' : 'DOP', added: today, until: addDays(today, days), note: txt(p.note, 160), url: txt(p.url, 200), state: 'wait', decided: null };
  sh.wishes.unshift(w);
  return w;
}
export function updateWish(s, id, p) {
  const w = shopOf(s).wishes.find((x) => x.id === id);
  if (!w) return null;
  if (p.name != null && txt(p.name)) w.name = txt(p.name, 80);
  if (p.price !== undefined) w.price = r2(pos(p.price));
  if (p.cur) w.cur = p.cur === 'USD' ? 'USD' : 'DOP';
  if (p.note != null) w.note = txt(p.note, 160);
  if (p.url != null) w.url = txt(p.url, 200);
  if (isDay(p.until)) w.until = p.until;
  return w;
}
export function removeWish(s, id) { const sh = shopOf(s); sh.wishes = sh.wishes.filter((w) => w.id !== id); }

// Cuánto cuesta en pesos, en horas de trabajo y cuánto falta para decidir.
export function wishInfo(s, w, today) {
  const rate = fxRate(s, today);
  const dop = w.price > 0 ? toDOP(w.price, w.cur, rate) : 0;
  const wi = s.money ? workInfo(s, today) : { ready: false };
  const hours = dop > 0 && wi.ready ? workHours(dop, wi) : null;
  const left = w.state === 'wait' && w.until ? diffDays(today, w.until) : 0;
  return { dop, hours, hoursText: hours != null ? fmtWork(hours, wi) : '', left: Math.max(0, left), ready: w.state === 'wait' && left <= 0 };
}

export function dropWish(s, id, today, ev = []) {
  const sh = shopOf(s);
  const w = sh.wishes.find((x) => x.id === id);
  if (!w || w.state !== 'wait') return null;
  const info = wishInfo(s, w, today);
  w.state = 'dropped';
  w.decided = today;
  sh.saved = r2(sh.saved + info.dop);
  const d = getDay(s, today);
  d.wishXp = (d.wishXp || 0) + 1;
  if (d.wishXp <= 2) gainXP(s, 'finanzas', 10, today, ev);
  checkAchievements(s, today, ev);
  return { w, dop: info.dop };
}
export function buyWish(s, id, today) {
  const w = shopOf(s).wishes.find((x) => x.id === id);
  if (!w || w.state !== 'wait') return null;
  w.state = 'bought';
  w.decided = today;
  return w;
}
export function reopenWish(s, id, today) {
  const sh = shopOf(s);
  const w = sh.wishes.find((x) => x.id === id);
  if (!w || w.state === 'wait') return null;
  if (w.state === 'dropped') sh.saved = r2(Math.max(0, sh.saved - toDOP(w.price, w.cur, fxRate(s, today))));
  w.state = 'wait';
  w.decided = null;
  w.until = addDays(today, sh.cfg.wishDays);
  return w;
}
export const wishesDropped = (s) => shopOf(s).wishes.filter((w) => w.state === 'dropped').length;

// ---------- Pendientes y registro rápido ----------

export const isBuyTodo = (title) => /^\s*(?:comprar|compra de|pedir)\s+\S/i.test(String(title || ''));
// Pasa un pendiente «Comprar leche y pan» a la lista de compras (y quita el pendiente para no tenerlo dos veces).
export function todoToShop(s, todoId, today, list = null) {
  const t = s.todos.find((x) => x.id === todoId);
  if (!t) return null;
  const text = String(t.title).replace(/^\s*(?:comprar|compra de|pedir)\s+/i, '');
  const items = parseShopLine(text);
  if (!items.length) return null;
  const r = addShopItems(s, items, { list, by: 'pendiente', today });
  removeTodo(s, todoId);
  return r;
}

// «Se acabó el café» → la despensa lo marca como agotado y entra a la lista. «Falta arroz» → a la lista.
export function shopFromCapture(s, it, today, list = null) {
  const sh = shopOf(s);
  const r = addShopItems(s, it.items, { list, by: 'voz', today });
  if (it.out) {
    for (const x of it.items) {
      const prod = x.prod || matchProduct(x.name);
      const key = x.key || (prod ? prod.key : slug(x.name));
      const e = sh.pantry.find((p) => p.key === key);
      if (e) { e.level = 'out'; e.seen = today; }
      else if (sh.cfg.autoPantry) pantryUpsert(s, { name: x.name, key, aisle: x.aisle, level: 'out', prod }, today);
    }
  }
  return r;
}

// ---------- Compartir ----------

export function shopText(s, listId) {
  const sh = shopOf(s);
  const l = listOf(s, listId);
  const items = sh.items.filter((i) => i.list === l.id && !i.done);
  const lines = [`${l.name}${l.store ? ` · ${l.store}` : ''}`];
  for (const a of AISLES) {
    const xs = items.filter((i) => i.aisle === a.id);
    if (!xs.length) continue;
    lines.push('', a.name.toUpperCase());
    for (const i of xs) { const q = qtyText(i.qty, i.unit); lines.push(`• ${q ? `${q} ` : ''}${i.name}${i.note ? ` (${i.note})` : ''}`); }
  }
  if (items.length === 0) lines.push('', 'No hay nada pendiente.');
  return lines.join('\n');
}

// ---------- Resumen para Hoy, Áreas y avisos ----------

export function shopSummary(s, today) {
  const sh = shopOf(s);
  const tot = listTotals(s, null);
  const low = runningLow(s);
  const exp = expiring(s, today, 3);
  const due = dueSuggestions(s, today, 12);
  return { pending: tot.left, est: tot.est, low: low.length, lowList: low, expiring: exp.length, expList: exp, due: due.length, dueList: due, wishReady: sh.wishes.filter((w) => w.state === 'wait' && w.until && w.until <= today).length, shopDay: sh.cfg.day != null && sh.cfg.day === weekday(today), trips: sh.trips.length, empty: !sh.items.length && !sh.pantry.length && !sh.wishes.length };
}

export { AISLES, UNITS, aisleOf, isCountUnit, qtyText, unitOf, productOf, matchProduct, parseShopLine, BASICS, aisleIndex };
