// Precios del súper (1.18): una libreta con lo que cuesta cada producto (huevos, leche, atún, arroz…), en qué
// tienda y cuándo, con la foto de la etiqueta o del recibo si quieres. Cada precio se pasa a una medida para
// comparar (la libra, el litro, la unidad), así «RD$295 el cartón de 30» y «RD$118 la docena» se pueden poner
// lado a lado. De ahí salen el histórico, la tienda más barata, cuánto subió tu canasta y el costo de tu lista.
// Es puro: recibe el estado (`s.shop`) y lo cambia.
import { addDays, diffDays, monthKey } from '../app/dates.js';
import { uid } from './logic.js';
import { amountsIn } from './scan.js';
import { aisleIndex, isCountUnit, matchProduct, norm, productOf, qtyText, unitOf } from './shoplex.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const txt = (v, n = 80) => String(v == null ? '' : v).trim().slice(0, n);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pos = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const slug = (t) => `x-${norm(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`;
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);

export const PRICE_MAX = 3000;
// Para comparar tiendas solo cuentan los precios de los últimos 3 meses (uno viejo saldría «más barato» por viejo).
export const STORE_DAYS = 90;
export const PRICE_SRC = ['manual', 'foto', 'recibo', 'compra'];
// Lo que se sigue de entrada: lo que casi toda casa dominicana compra cada semana o cada mes.
export const STAPLES = ['huevos', 'leche', 'arroz', 'pollo', 'aceite', 'atun', 'azucar', 'habichuelas-rojas', 'platano-verde', 'pan', 'cafe', 'salami'];

// ---------- Medidas para comparar ----------

// Peso → libra; volumen → litro; conteo: unidad, docena (12) y cartón (30).
const WEIGHT = { lb: 1, kg: 2.20462, g: 0.00220462, oz: 0.0625 };
const VOLUME = { l: 1, ml: 0.001, gal: 3.78541 };
const COUNT = { u: 1, doc: 12, carton: 30 };

// Cómo se compara cada producto: `base` (la medida del cálculo) y `show` (cómo se dice el precio).
// Los huevos se piensan por cartón y el aceite por galón; lo demás, por la medida de su catálogo.
const PRICE_UNIT = { huevos: { base: 'u', show: 'carton' }, aceite: { base: 'l', show: 'gal' } };

export function priceUnit(key) {
  if (PRICE_UNIT[key]) return PRICE_UNIT[key];
  const p = productOf(key);
  const u = p ? p.unit : 'u';
  if (WEIGHT[u]) return { base: 'lb', show: 'lb' };
  if (VOLUME[u]) return { base: 'l', show: 'l' };
  if (COUNT[u]) return { base: 'u', show: u === 'doc' ? 'doc' : 'u' };
  return { base: u, show: u };
}

// Cuántas veces cabe la medida `base` en `qty` de `unit` (null si no se pueden comparar: libras con litros).
// Sin unidad es «una pieza»: vale para la unidad y para lo que se cuenta por latas, fundas o paquetes.
export function inBase(qty, unit, base) {
  const q = Number(qty) > 0 ? Number(qty) : 1;
  const u = unit || 'u';
  if (u === base) return q;
  if (WEIGHT[u] && WEIGHT[base]) return (q * WEIGHT[u]) / WEIGHT[base];
  if (VOLUME[u] && VOLUME[base]) return (q * VOLUME[u]) / VOLUME[base];
  if (COUNT[u] && COUNT[base]) return (q * COUNT[u]) / COUNT[base];
  if (u === 'u' && isCountUnit(base) && !COUNT[base]) return q;
  return null;
}

const FEM = new Set(['libra', 'docena', 'unidad', 'lata', 'funda', 'botella', 'caja', 'mano', 'bandeja', 'cabeza', 'onza']);
// «la libra», «el litro», «el cartón de 30».
export function perText(unit) {
  if (unit === 'carton') return 'el cartón de 30';
  if (unit === 'u') return 'la unidad';
  const u = unitOf(unit);
  if (!u) return 'cada uno';
  return `${FEM.has(u.one) ? 'la' : 'el'} ${u.one}`;
}
// Lo que dice el precio anotado: «cartón de 30», «5 lb», «1 galón», «1 lata».
export function sizeText(e) {
  if (!e) return '';
  if (e.unit === 'carton') return Number(e.qty) === 1 ? 'cartón de 30' : `${qtyText(e.qty, 'carton')} de 30`;
  if (!e.unit || e.unit === 'u') return Number(e.qty) > 1 ? `${r2(e.qty)} unidades` : '1 unidad';
  return qtyText(e.qty, e.unit) || `1 ${(unitOf(e.unit) || {}).one || ''}`.trim();
}

// Tamaños para elegir rápido al anotar un precio.
const SIZES = {
  huevos: [[1, 'carton', 'Cartón (30)'], [1, 'doc', 'Docena'], [6, 'u', 'Media docena'], [1, 'u', 'Unidad']],
  leche: [[1, 'l', '1 litro'], [1, 'gal', 'Galón'], [0.5, 'gal', '½ galón'], [946, 'ml', '946 ml']],
  aceite: [[1, 'gal', 'Galón'], [0.5, 'gal', '½ galón'], [1, 'l', '1 litro'], [500, 'ml', '500 ml']],
  arroz: [[1, 'lb', '1 libra'], [5, 'lb', '5 libras'], [10, 'lb', '10 libras'], [25, 'lb', '25 libras']],
  azucar: [[1, 'lb', '1 libra'], [5, 'lb', '5 libras'], [10, 'lb', '10 libras']],
};
export function sizesFor(key) {
  if (SIZES[key]) return SIZES[key].map(([qty, unit, label]) => ({ qty, unit, label }));
  const { base } = priceUnit(key);
  if (base === 'lb') return [{ qty: 1, unit: 'lb', label: '1 libra' }, { qty: 0.5, unit: 'lb', label: '½ libra' }, { qty: 2, unit: 'lb', label: '2 libras' }, { qty: 1, unit: 'kg', label: '1 kilo' }];
  if (base === 'l') return [{ qty: 1, unit: 'l', label: '1 litro' }, { qty: 1, unit: 'gal', label: 'Galón' }, { qty: 0.5, unit: 'gal', label: '½ galón' }, { qty: 500, unit: 'ml', label: '500 ml' }];
  const u = unitOf(base);
  return [{ qty: 1, unit: base === 'u' ? null : base, label: base === 'u' ? 'Unidad' : cap(u ? u.one : 'unidad') }];
}

// Precio de una anotación en la medida `base` de su producto (null si no se puede comparar).
export function perBase(e) {
  if (!e || !(e.price > 0)) return null;
  const q = inBase(e.qty, e.unit, priceUnit(e.key).base);
  return q ? e.price / q : null;
}
// De la medida base a la que se muestra (la libra, el cartón…).
export const showFactor = (key) => { const pu = priceUnit(key); return inBase(1, pu.show, pu.base) || 1; };

// ---------- Datos ----------

function normPrice(e) {
  if (!isObj(e)) return null;
  const key = txt(e.key, 60);
  const name = txt(e.name, 60);
  const price = r2(pos(e.price));
  if (!key || !name || !(price > 0) || !isDay(e.day)) return null;
  return {
    id: String(e.id || uid()), key, name, day: e.day, price, qty: pos(e.qty) || 1, unit: unitOf(e.unit) ? e.unit : null, store: txt(e.store, 40),
    photo: typeof e.photo === 'string' ? e.photo.slice(0, 40) : '', src: PRICE_SRC.includes(e.src) ? e.src : 'manual', note: txt(e.note, 80),
  };
}

// Completa la libreta (se llama desde ensureShop). La primera vez pasa los precios que ya se habían aprendido
// de tus compras (los últimos de cada producto) y empieza a seguir los productos de siempre.
export function ensurePrices(sh, src) {
  const o = isObj(src) ? src : {};
  let list = Array.isArray(o.prices) ? o.prices.map(normPrice).filter(Boolean) : null;
  if (!list) {
    list = [];
    for (const [key, h] of Object.entries(isObj(o.hist) ? o.hist : {})) {
      if (!isObj(h) || !Array.isArray(h.prices)) continue;
      // Un precio aprendido sin unidad era «uno» de la lista: para lo que se cuenta por cartón o docena (los
      // huevos), uno es el cartón o la docena, no un huevo.
      const pu = priceUnit(key);
      const unit = h.unit || (pu.base === 'u' && pu.show !== 'u' ? pu.show : null);
      for (const p of h.prices) {
        const e = normPrice({ key, name: h.name, day: p && p.d, price: p && p.p, qty: 1, unit, store: p && p.st, src: 'compra' });
        if (e) list.push(e);
      }
    }
  }
  sh.prices = list.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0)).slice(0, PRICE_MAX);
  sh.track = Array.isArray(o.track) ? [...new Set(o.track.filter((k) => typeof k === 'string' && k).map((k) => k.slice(0, 60)))].slice(0, 120) : [...STAPLES];
  return sh;
}

const shopIn = (s) => { if (!Array.isArray(s.shop.prices)) ensurePrices(s.shop, s.shop); return s.shop; };
const byDayDesc = (a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0);

// El producto de un nombre: el del catálogo o uno propio.
export function productFor(name, key = null) {
  if (key) { const p = productOf(key); return { key, name: p ? p.name : txt(name, 60), aisle: p ? p.aisle : 'otros', known: !!p }; }
  const p = matchProduct(name);
  if (p) return { key: p.key, name: p.name, aisle: p.aisle, known: true };
  const nm = cap(txt(name, 60));
  return { key: slug(nm), name: nm, aisle: 'otros', known: false };
}

// Anota un precio. Si ya hay uno del mismo producto, el mismo día, en la misma tienda y del mismo tamaño, lo
// cambia (así la lista y la compra no lo repiten). Devuelve la anotación, la anterior y cuánto cambió (0.12 = +12 %).
export function addPrice(s, p, today) {
  const sh = shopIn(s);
  const prod = productFor(p.name, p.key || null);
  const e = normPrice({ ...p, id: uid(), key: prod.key, name: prod.name, day: isDay(p.day) && p.day <= today ? p.day : today });
  if (!e) return null;
  const prevEntry = sh.prices.filter((x) => x.key === e.key && x.day <= e.day && perBase(x) != null).sort(byDayDesc).find((x) => !(x.day === e.day && norm(x.store) === norm(e.store)));
  const same = sh.prices.find((x) => x.key === e.key && x.day === e.day && norm(x.store) === norm(e.store) && x.unit === e.unit && Math.abs(x.qty - e.qty) < 1e-9);
  let out = e;
  if (same) { Object.assign(same, { price: e.price, photo: e.photo || same.photo, note: e.note || same.note, src: e.src }); out = same; }
  else { sh.prices.unshift(e); sh.prices.sort(byDayDesc); if (sh.prices.length > PRICE_MAX) sh.prices.length = PRICE_MAX; }
  if (!sh.track.includes(e.key)) sh.track.push(e.key);
  const a = perBase(out); const b = prevEntry ? perBase(prevEntry) : null;
  return { e: out, prev: prevEntry || null, change: a != null && b ? a / b - 1 : null };
}

export function updatePrice(s, id, p) {
  const sh = shopIn(s);
  const e = sh.prices.find((x) => x.id === id);
  if (!e) return null;
  const next = normPrice({ ...e, ...p, id: e.id, key: e.key, name: e.name });
  if (!next) return null;
  Object.assign(e, next);
  sh.prices.sort(byDayDesc);
  return e;
}
export function removePrice(s, id) { const sh = shopIn(s); const e = sh.prices.find((x) => x.id === id); sh.prices = sh.prices.filter((x) => x.id !== id); return e || null; }
export function setTracked(s, key, on) {
  const sh = shopIn(s);
  sh.track = on ? [...new Set([...sh.track, key])] : sh.track.filter((k) => k !== key);
  return sh.track;
}
export const pricesOf = (s, key) => shopIn(s).prices.filter((e) => e.key === key).sort(byDayDesc);

// ---------- Lo que dice la libreta de cada producto ----------

// Último precio, el anterior, el más bajo y el promedio de 90 días, cuánto cambió en 3 meses, la tienda más
// barata y la serie para la gráfica. Todo en la medida que se muestra (la libra, el litro, el cartón).
export function priceStats(s, key, today) {
  const all = pricesOf(s, key);
  const f = showFactor(key);
  const comp = all.map((e) => ({ e, per: perBase(e) })).filter((x) => x.per != null).map((x) => ({ ...x, show: r2(x.per * f) }));
  const last = comp[0] || null;
  const prev = last ? comp.find((x) => x.e.day < last.e.day) || null : null;
  const recent = comp.filter((x) => diffDays(x.e.day, today) <= 90);
  const min = recent.length ? recent.reduce((a, x) => (x.show < a.show ? x : a)) : null;
  const avg = recent.length ? r2(mean(recent.map((x) => x.show))) : null;
  // En unos 3 meses: el promedio del último mes frente al de hace 2 a 4 meses (así pesa menos haber cambiado de
  // tienda). `old` es la anotación más vieja de ese período, para decir «desde…».
  const now = last ? comp.filter((x) => diffDays(x.e.day, last.e.day) <= 30) : [];
  const then = last ? comp.filter((x) => { const d = diffDays(x.e.day, last.e.day); return d >= 60 && d <= 120; }) : [];
  const old = then.length ? then[then.length - 1] : null;
  const change3 = last && then.length && diffDays(last.e.day, today) <= 60 ? mean(now.map((x) => x.per)) / mean(then.map((x) => x.per)) - 1 : null;
  const stores = [];
  for (const x of comp) {
    if (!x.e.store || diffDays(x.e.day, today) > STORE_DAYS || stores.some((y) => norm(y.store) === norm(x.e.store))) continue;
    stores.push({ store: x.e.store, show: x.show, day: x.e.day });
  }
  stores.sort((a, b) => a.show - b.show);
  const pu = priceUnit(key);
  return {
    key, n: all.length, pu, factor: f, per: perText(pu.show), last, prev,
    change: last && prev ? last.per / prev.per - 1 : null,
    change3, old,
    min, avg, stores, cheapest: stores.length >= 2 ? stores[0] : null,
    series: [...comp].reverse().map((x) => ({ day: x.e.day, v: x.show, store: x.e.store, id: x.e.id })),
    other: all.filter((e) => perBase(e) == null),
  };
}

// La libreta: lo que sigues y lo que tiene precios, por pasillo. `q` filtra por nombre.
export function priceBook(s, today, { q = '' } = {}) {
  const sh = shopIn(s);
  const keys = [...new Set([...sh.track, ...sh.prices.map((e) => e.key)])];
  const qq = norm(q);
  const rows = [];
  for (const key of keys) {
    const p = productOf(key);
    const lastE = sh.prices.find((e) => e.key === key);
    const name = p ? p.name : lastE ? lastE.name : key;
    if (qq && !norm(name).includes(qq)) continue;
    rows.push({ key, name, aisle: p ? p.aisle : 'otros', tracked: sh.track.includes(key), stats: priceStats(s, key, today) });
  }
  return rows.sort((a, b) => aisleIndex(a.aisle) - aisleIndex(b.aisle) || a.name.localeCompare(b.name, 'es'));
}

// Qué es «uno» de un artículo de la lista (su precio se multiplica por la cantidad): su unidad si la tiene
// («2 lb de pollo» → la libra). Sin unidad, «12 huevos» son piezas; «huevos» o «leche x2» es el paquete que
// sueles comprar (el último que anotaste) o, si no hay, la medida de la libreta (el cartón, el litro…).
export function itemUnitSize(s, it) {
  if (it.unit) return { qty: 1, unit: it.unit };
  const pu = priceUnit(it.key);
  if (it.qty && pu.base === 'u') return { qty: 1, unit: null };
  const e = shopIn(s).prices.find((x) => x.key === it.key && perBase(x) != null);
  if (e) return { qty: e.qty, unit: e.unit };
  return { qty: 1, unit: pu.show === 'u' ? null : pu.show };
}

// Precio estimado de un artículo de la lista (por «uno» del artículo), con la última anotación del producto.
export function listPrice(s, it) {
  const e = shopIn(s).prices.find((x) => x.key === it.key && perBase(x) != null);
  if (!e) return 0;
  const z = itemUnitSize(s, it);
  const q = inBase(z.qty, z.unit, priceUnit(it.key).base);
  return q ? r2(perBase(e) * q) : 0;
}

// ---------- Tu canasta ----------

// Cuánto cambiaron, en unos 3 meses, los productos que sigues (cada uno pesa igual), lo que más subió y lo que
// bajó, y lo que cuesta hoy «uno de cada uno». La serie es un índice encadenado mes a mes (100 = el primer mes).
export function basket(s, today, months = 6) {
  const sh = shopIn(s);
  const rows = sh.track.map((key) => ({ key, st: priceStats(s, key, today) })).filter((x) => x.st.last);
  const moved = rows.filter((x) => x.st.change3 != null && diffDays(x.st.last.e.day, today) <= 60);
  const change = moved.length >= 2 ? mean(moved.map((x) => x.st.change3)) : null;
  const up = [...moved].sort((a, b) => b.st.change3 - a.st.change3);
  const cost = r2(rows.reduce((a, x) => a + x.st.last.show, 0));
  // Índice por mes.
  const mks = [];
  let m = monthKey(today);
  for (let i = 0; i < months; i++) { mks.unshift(m); const [y, mo] = m.split('-').map(Number); m = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`; }
  const avgIn = (key, mk) => { const xs = sh.prices.filter((e) => e.key === key && monthKey(e.day) === mk).map(perBase).filter((v) => v != null); return xs.length ? mean(xs) : null; };
  const series = [];
  let idx = 100;
  for (let i = 0; i < mks.length; i++) {
    if (i === 0) { series.push({ mk: mks[i], v: 100, n: rows.filter((x) => avgIn(x.key, mks[i]) != null).length }); continue; }
    const ratios = rows.map((x) => { const a = avgIn(x.key, mks[i - 1]); const b = avgIn(x.key, mks[i]); return a && b ? b / a : null; }).filter((v) => v != null);
    if (ratios.length) idx *= mean(ratios);
    series.push({ mk: mks[i], v: r2(idx), n: ratios.length });
  }
  const useful = series.filter((x) => x.n >= 2).length >= 3;
  return { n: rows.length, moved: moved.length, change, up: up.slice(0, 3).filter((x) => x.st.change3 > 0.005), down: up.reverse().filter((x) => x.st.change3 < -0.005).slice(0, 2), cost, series: useful ? series : [] };
}

// ---------- ¿En qué tienda sale más barata tu lista? ----------

// Con el último precio de cada tienda (de los últimos 3 meses), lo que costarían los productos que tienen precio
// en las dos tiendas que más cubren tu lista. null si no hay con qué comparar.
export function storeCompare(s, items, today) {
  const sh = shopIn(s);
  const byStore = new Map();
  for (const it of items) {
    const base = priceUnit(it.key).base;
    const q = inBase(it.qty || 1, it.unit || 'u', base);
    if (!q) continue;
    const seen = new Set();
    for (const e of sh.prices) {
      if (e.key !== it.key || !e.store || diffDays(e.day, today) > STORE_DAYS) continue;
      const k = norm(e.store);
      if (seen.has(k)) continue;
      const per = perBase(e);
      if (per == null) continue;
      seen.add(k);
      if (!byStore.has(k)) byStore.set(k, { store: e.store, items: new Map() });
      byStore.get(k).items.set(it.id, r2(per * q));
    }
  }
  const stores = [...byStore.values()].sort((a, b) => b.items.size - a.items.size);
  if (stores.length < 2) return null;
  const [a, b] = stores;
  const common = [...a.items.keys()].filter((id) => b.items.has(id));
  if (common.length < 2) return null;
  const tot = (st) => r2(common.reduce((x, id) => x + st.items.get(id), 0));
  const res = [{ store: a.store, total: tot(a) }, { store: b.store, total: tot(b) }].sort((x, y) => x.total - y.total);
  return { n: common.length, of: items.length, cheap: res[0], other: res[1], save: r2(res[1].total - res[0].total) };
}

// ---------- Leer precios de una foto ----------

const ReceiptSkip = /\b(SUB\s?-?TOTAL|TOTAL|ITBIS|IMPUESTO|CAMBIO|EFECTIVO|TARJETA|VISA|MASTER|AMEX|DESCUENTO|AHORRO|AHORRASTE|RNC|NCF|E-NCF|FECHA|HORA|CAJA|CAJER[OA]|GRACIAS|PUNTOS|BALANCE|PAGO|PAGADO|DEVUELTA|RECIBIDO|CLIENTE|CEDULA|TEL(EFONO)?|DIRECCION|FACTURA|COMPROBANTE|ARTICULOS|CANTIDAD|DESCRIPCION|VALOR|PROPINA|LEY|AUTORIZACION|REF(ERENCIA)?|TERMINAL|CONSUMIDOR|CREDITO FISCAL|VENDEDOR|SUCURSAL)\b/;
const UNIT_TOK = [
  [/^(LBS?|LIBRAS?)$/, 'lb'], [/^(KGS?|KILOS?)$/, 'kg'], [/^(G|GR|GRS|GRAMOS?)$/, 'g'], [/^(OZ|ONZ|ONZAS?)$/, 'oz'],
  [/^(ML|MLS)$/, 'ml'], [/^(L|LT|LTS|LITROS?)$/, 'l'], [/^(GAL|GALON|GALONES|GL)$/, 'gal'], [/^(U|UN|UND|UNDS|UDS|UNID|UNIDADES|PZ|PZS|PIEZAS?)$/, 'u'],
  [/^(DOC|DOCENA)$/, 'doc'],
];
const U = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const unitTok = (t) => { const T = U(t).replace(/\.$/, ''); const m = UNIT_TOK.find(([re]) => re.test(T)); return m ? m[1] : null; };

// El tamaño que viene en el nombre: «LECHE RICA 1LT», «ARROZ 10 LB», «HUEVOS 30 UND», «ATUN 5OZ».
export function sizeIn(desc) {
  const T = U(desc);
  const m = T.match(/(\d+(?:[.,]\d+)?)\s?(LBS?|LIBRAS?|KGS?|KILOS?|GRS?|GRAMOS?|G|OZ|ONZ|ML|LTS?|LITROS?|L|GAL(?:ON(?:ES)?)?|GL|UNDS?|UNID(?:ADES)?|UN|UDS|U|PZS?|DOC(?:ENA)?)\b/);
  if (!m) return null;
  const unit = unitTok(m[2]);
  const qty = Number(m[1].replace(',', '.'));
  return unit && qty > 0 ? { qty, unit, text: m[0] } : null;
}

// Las líneas de productos de un recibo de supermercado leído con el lector del teléfono (o la IA):
// [{ desc, total, qty, each, size, weight }]. La línea de cantidad («2 X 45.50» o «1.85 LB X 89.95») puede ir
// antes o después del producto, o debajo de un nombre que no trae monto («POLLO ENTERO»).
export function receiptItems(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.replace(/[|¦]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const QX = /(\d+(?:[.,]\d+)?)\s?(LBS?|KGS?|UNDS?|UN|U)?\s?[X@*]\s?(\d+(?:[.,]\d{3})*[.,]\d{2})/;
  const num = (t) => Number(String(t).replace(/,(?=\d{3})/g, '').replace(',', '.'));
  const near = (a, b) => a > 0 && b > 0 && Math.abs(a - b) <= Math.max(1, b * 0.02);
  const out = [];
  let pendDesc = null;
  let pendQty = null;
  const applyQty = (it, q) => {
    if (q.w === 'lb' || q.w === 'kg') { it.weight = { qty: q.q, unit: q.w }; it.qty = 1; } else it.qty = q.q;
    it.each = r2(q.each);
    if (q.total) it.total = r2(q.total);
  };
  const cleanDesc = (d) => d.replace(/^\s*\d{4,}\s+/, '').replace(/\s{2,}/g, ' ').trim();
  for (const line of lines) {
    const T = U(line);
    if (ReceiptSkip.test(T)) { pendDesc = null; pendQty = null; continue; }
    const amts = amountsIn(line);
    const qx = T.match(QX);
    const letters = (T.replace(new RegExp(QX.source, 'g'), ' ').match(/[A-ZÑ]/g) || []).length;
    if (letters < 3) {
      if (!qx) continue;
      const q = { q: num(qx[1]), w: qx[2] ? unitTok(qx[2]) : null, each: num(qx[3]), total: amts.length >= 2 ? amts[amts.length - 1].v : null };
      if (!(q.q > 0 && q.each > 0)) continue;
      const prev = out[out.length - 1];
      if (pendDesc) {
        // «POLLO ENTERO» y debajo «1.85 LB X 89.95 166.41».
        const it = { desc: pendDesc.slice(0, 60), total: r2(q.total || q.q * q.each), qty: 1, each: q.each, size: sizeIn(pendDesc), weight: null };
        applyQty(it, q);
        out.push(it);
        pendDesc = null;
      } else if (prev && !prev.qtySet && near(prev.total, q.q * q.each)) { applyQty(prev, q); prev.qtySet = true; }
      else pendQty = q; // va con el producto que sigue
      continue;
    }
    if (!amts.length) { pendDesc = cleanDesc(line); pendQty = null; continue; }
    pendDesc = null;
    const total = amts[amts.length - 1].v;
    if (!(total > 0) || total > 50000) { pendQty = null; continue; }
    let desc = line.replace(/\s*[-–]?\s*(RD\$|\$)?\s?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\s*[A-Z]?\s*$/i, '');
    const it = { desc: '', total: r2(total), qty: 1, each: r2(total), size: null, weight: null };
    if (qx) {
      applyQty(it, { q: num(qx[1]), w: qx[2] ? unitTok(qx[2]) : null, each: num(qx[3]), total: null });
      it.qtySet = true;
      desc = desc.replace(/(\d+(?:[.,]\d+)?)\s?(LBS?|KGS?|UNDS?|UN|U)?\s?[Xx@*]\s?\d[\d.,]*/, ' ');
    } else if (pendQty && near(total, pendQty.q * pendQty.each)) {
      applyQty(it, { ...pendQty, total: null });
      it.qtySet = true;
    }
    pendQty = null;
    desc = cleanDesc(desc);
    if ((desc.match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]/g) || []).length < 3) continue;
    it.desc = desc.slice(0, 60);
    it.size = sizeIn(desc);
    out.push(it);
    if (out.length >= 80) break;
  }
  return out.map(({ qtySet, ...it }) => it);
}

// Lo leído del recibo → precios para la libreta: [{ key, name, price, qty, unit, line, known, on }].
// Lo que se reconoce queda marcado; lo demás, sin marcar, con su nombre limpio para que decidas.
export function receiptPrices(items) {
  const out = [];
  for (const raw of items || []) {
    // Lo que trae la IA es solo { desc, total }: el tamaño se saca del nombre.
    const it = raw.size === undefined ? { ...raw, size: sizeIn(raw.desc) } : raw;
    const clean = String(it.desc || '').replace(it.size ? it.size.text : '', ' ').replace(/\b\d+[A-Z]*\b/gi, ' ').replace(/\s+/g, ' ').trim();
    const prod = matchProduct(clean) || matchProduct(it.desc || '');
    const each = r2(it.each || (it.total / (it.qty || 1)));
    if (!(each > 0)) continue;
    let qty = 1; let unit = null; let note = '';
    if (prod) {
      const { base } = priceUnit(prod.key);
      if (it.weight && inBase(it.weight.qty, it.weight.unit, base) != null) { qty = 1; unit = it.weight.unit; }
      else if (it.size && inBase(it.size.qty, it.size.unit, base) != null) { qty = it.size.qty; unit = it.size.unit; }
      else if (it.size) note = it.size.text.toLowerCase();
      if (!unit && base !== 'u' && !isCountUnit(base)) continue; // sin tamaño no se puede comparar la libra o el litro
      // «HUEVOS 30 UND» es un cartón y «12 UND», una docena: así se anota como lo compras.
      if (base === 'u' && unit === 'u' && (qty === 30 || qty === 12)) { unit = qty === 30 ? 'carton' : 'doc'; qty = 1; }
      out.push({ key: prod.key, name: prod.name, price: each, qty, unit: unit || (base !== 'u' && isCountUnit(base) ? base : null), note, line: it.desc, known: true, on: true });
    } else {
      const name = cap(clean.toLowerCase()).slice(0, 60);
      if (name.length < 3) continue;
      const sz = it.weight || it.size;
      out.push({ key: null, name, price: each, qty: sz ? sz.qty : 1, unit: sz ? sz.unit : null, note: '', line: it.desc, known: false, on: false });
    }
  }
  return out;
}

// Los montos de la foto de una etiqueta del súper, el más probable primero; y si dice «por libra» o «por kilo».
export function labelPrices(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const seen = new Map();
  lines.forEach((line, i) => {
    for (const a of amountsIn(line)) {
      if (!(a.v > 0) || a.v >= 100000) continue;
      const k = a.v.toFixed(2);
      const score = (/RD\$|\$/.test(line) ? 3 : 0) + (/PRECIO|OFERTA|AHORA|ESPECIAL/i.test(line) ? 2 : 0) - i * 0.01 + (/X\s?LB|POR\s+LIB|C\/U/i.test(line) ? -1 : 0);
      if (!seen.has(k) || seen.get(k).score < score) seen.set(k, { v: a.v, score });
    }
  });
  const T = U(text);
  const unit = /POR\s+LIBRA|X\s?LB\b|\bLB\b|LIBRA/.test(T) ? 'lb' : /POR\s+KILO|\bKG\b|KILO/.test(T) ? 'kg' : null;
  return { amounts: [...seen.values()].sort((a, b) => b.score - a.score).slice(0, 5).map((x) => x.v), unit };
}

// Todo lo que sirve de la foto de una etiqueta: los montos (el más probable primero), si es por libra o kilo,
// los productos que se reconocen en el texto (para proponerlos) y el tamaño que dice («30 UND», «1 GAL»).
export function labelInfo(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]{3}/.test(l));
  const prods = [];
  for (const l of lines) {
    const p = matchProduct(l.replace(/\b\d+[.,]?\d*\s?[A-Za-z]{0,6}\b/g, ' '));
    if (p && !prods.some((x) => x.key === p.key)) prods.push({ key: p.key, name: p.name, aisle: p.aisle, known: true });
    if (prods.length >= 3) break;
  }
  let size = null;
  for (const l of lines) { const z = sizeIn(l); if (z) { size = { qty: z.qty, unit: z.unit }; break; } }
  return { ...labelPrices(text), prods, size };
}

// ---------- Drive ----------

export function priceRows(s) {
  return shopIn(s).prices.map((e) => {
    const per = perBase(e);
    const pu = priceUnit(e.key);
    return [e.day, e.name, e.price, e.qty, e.unit || 'unidad', per != null ? r2(per * showFactor(e.key)) : '', per != null ? perText(pu.show) : '', e.store, { manual: 'A mano', foto: 'Foto', recibo: 'Recibo', compra: 'Compra' }[e.src] || ''];
  });
}

export { addDays };
