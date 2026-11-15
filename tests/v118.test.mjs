// 1.18: libreta de precios del súper (fotos de etiquetas y recibos, histórico, tiendas, canasta) y Finanzas con lo
// disponible separado de los gastos del mes y las deudas a largo plazo separadas de las del día a día.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/game/logic.js';
import * as SH from '../src/game/shop.js';
import * as P from '../src/game/prices.js';
import * as OV from '../src/game/overview.js';
import { matchProduct, aisleIndex } from '../src/game/shoplex.js';
import { addPlan, setAccountBalance } from '../src/game/money.js';
import { addCredit } from '../src/game/credits.js';
import { addLoan } from '../src/game/loans.js';
import { cashflow } from '../src/game/stats.js';
import { buildTables } from '../src/game/tables.js';
import { mergeStates } from '../src/game/merge.js';
import { migrate } from '../src/app/store.js';
import { addDays } from '../src/app/dates.js';

const D = '2026-11-10'; // martes
function fresh(day = D) {
  const s = L.defaultState(addDays(day, -120));
  s.profile.onboarded = true;
  s.profile.name = 'Ana Prueba';
  SH.ensureShop(s);
  return s;
}
const clone = (x) => JSON.parse(JSON.stringify(x));
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const add = (s, p) => P.addPrice(s, p, D);

// Un recibo de súper como los de aquí (datos inventados).
const RECEIPT = `SUPERMERCADO BRAVO
RNC 101-00000-1
FECHA 13/11/2026 HORA 10:42
LECHE RICA ENTERA 1LT
2 X 74.75            149.50
ARROZ SELECTO 10 LB          439.00
HUEVOS 30 UND                251.00
POLLO ENTERO
4.20 LB X 86.50        363.30
ATUN PEPITO EN ACEITE 5OZ     81.00
ACEITE CRISOL 1 GAL          562.00
ZQX MULTIUSO ESPECIAL        120.00
SUBTOTAL                    1965.80
ITBIS                        122.40
TOTAL                       2088.20
TARJETA VISA ****7731`;

// ---------- Medidas ----------

test('precios: medidas comparables (cartón, docena, galón, kilo) y lo que no se compara', () => {
  assert.equal(P.inBase(1, 'carton', 'u'), 30);
  assert.equal(P.inBase(1, 'doc', 'u'), 12);
  assert.ok(near(P.inBase(1, 'gal', 'l'), 3.78541));
  assert.ok(near(P.inBase(1, 'kg', 'lb'), 2.20462));
  assert.ok(near(P.inBase(500, 'ml', 'l'), 0.5));
  assert.equal(P.inBase(1, 'l', 'lb'), null, 'litros con libras no');
  assert.equal(P.showFactor('huevos'), 30);
  assert.equal(P.perBase({ key: 'huevos', price: 240, qty: 1, unit: 'carton' }), 8);
  assert.equal(P.perBase({ key: 'huevos', price: 0, qty: 1, unit: 'carton' }), null);
  assert.deepEqual(P.priceUnit('huevos'), { base: 'u', show: 'carton' });
  assert.deepEqual(P.priceUnit('aceite'), { base: 'l', show: 'gal' });
  assert.deepEqual(P.priceUnit('pollo'), { base: 'lb', show: 'lb' });
  assert.equal(P.perText('carton'), 'el cartón de 30');
  assert.equal(P.perText('lb'), 'la libra');
  assert.equal(P.sizeText({ qty: 1, unit: 'carton' }), 'cartón de 30');
  assert.equal(P.sizesFor('huevos')[0].label, 'Cartón (30)');
});

// ---------- Anotar ----------

test('precios: anotar dice cuánto cambió frente al anterior, no repite el mismo día y tienda, y sigue el producto', () => {
  const s = fresh();
  const a = add(s, { key: 'huevos', name: 'Huevos', price: 240, qty: 1, unit: 'carton', store: 'Jumbo', day: '2026-11-01' });
  assert.equal(a.change, null);
  const b = add(s, { key: 'huevos', price: 255, qty: 1, unit: 'carton', store: 'Bravo', day: D });
  assert.ok(near(b.change, 255 / 240 - 1));
  assert.equal(b.prev.store, 'Jumbo');
  const c = add(s, { key: 'huevos', price: 250, qty: 1, unit: 'carton', store: 'bravo', day: D });
  assert.equal(P.pricesOf(s, 'huevos').length, 2, 'mismo día, tienda y tamaño: se cambia');
  assert.equal(c.e.price, 250);
  const d = add(s, { key: 'leche', price: 75, qty: 1, unit: 'l', day: '2027-01-05' });
  assert.equal(d.e.day, D, 'una fecha futura queda en hoy');
  assert.equal(add(s, { key: 'leche', price: 0, day: D }), null);
  const x = add(s, { name: 'zqx limpiador raro', price: 95, day: D });
  assert.match(x.e.key, /^x-/);
  assert.equal(x.e.name, 'Zqx limpiador raro');
  assert.ok(SH.shopOf(s).track.includes(x.e.key), 'lo que anotas se sigue');
  P.setTracked(s, x.e.key, false);
  assert.ok(!SH.shopOf(s).track.includes(x.e.key));
  assert.ok(P.removePrice(s, x.e.id));
  assert.equal(P.pricesOf(s, x.e.key).length, 0);
});

// ---------- Lo que dice la libreta ----------

function eggs(s) {
  add(s, { key: 'huevos', price: 220, qty: 1, unit: 'carton', store: 'Jumbo', day: '2026-07-01' }); // viejo: más de 3 meses
  add(s, { key: 'huevos', price: 245, qty: 1, unit: 'carton', store: 'Nacional', day: '2026-08-20' });
  add(s, { key: 'huevos', price: 238, qty: 1, unit: 'carton', store: 'La Sirena', day: '2026-10-01' });
  add(s, { key: 'huevos', price: 240, qty: 1, unit: 'carton', store: 'Jumbo', day: '2026-11-01' });
  add(s, { key: 'huevos', price: 255, qty: 1, unit: 'carton', store: 'Bravo', day: D });
}

test('precios: último, anterior, más bajo y promedio de 90 días, y tiendas solo con precios de 3 meses', () => {
  const s = fresh();
  eggs(s);
  const st = P.priceStats(s, 'huevos', D);
  assert.equal(st.n, 5);
  assert.equal(st.per, 'el cartón de 30');
  assert.equal(st.last.show, 255);
  assert.equal(st.prev.e.store, 'Jumbo');
  assert.ok(near(st.change, 255 / 240 - 1));
  assert.equal(st.min.show, 238);
  assert.equal(st.avg, 244.5, 'sin el de julio');
  assert.deepEqual(st.stores.map((x) => x.store), ['La Sirena', 'Jumbo', 'Nacional', 'Bravo']);
  assert.equal(st.stores.find((x) => x.store === 'Jumbo').show, 240, 'el de julio no cuenta para Jumbo');
  assert.equal(st.cheapest.store, 'La Sirena');
  assert.equal(st.series.length, 5);
  assert.equal(st.series[0].day, '2026-07-01', 'la serie va de lo viejo a lo nuevo');
});

test('precios: el cambio en 3 meses compara promedios (pesa menos haber cambiado de tienda)', () => {
  const s = fresh();
  eggs(s);
  const st = P.priceStats(s, 'huevos', D);
  // Último mes: 240 y 255 (promedio 247.5); hace 2 a 4 meses: 245.
  assert.ok(near(st.change3, 247.5 / 245 - 1));
  assert.equal(st.old.e.day, '2026-08-20');
  // Si lo último es de hace más de 2 meses, no se calcula.
  assert.equal(P.priceStats(s, 'huevos', '2027-02-20').change3, null);
});

test('precios: la libreta trae lo básico aunque no tenga precio, por pasillo, y se puede buscar', () => {
  const s = fresh();
  add(s, { key: 'pollo', price: 88, qty: 1, unit: 'lb', store: 'Jumbo', day: D });
  const rows = P.priceBook(s, D);
  assert.equal(rows.length, P.STAPLES.length);
  assert.ok(rows.find((r) => r.key === 'pollo').stats.last);
  assert.equal(rows.find((r) => r.key === 'leche').stats.last, null);
  const idx = rows.map((r) => aisleIndex(r.aisle));
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b), 'por pasillo');
  assert.deepEqual(P.priceBook(s, D, { q: 'pol' }).map((r) => r.key), ['pollo']);
});

// ---------- La lista con tus precios ----------

test('lista: el precio de cada artículo sale de la libreta según lo que es «uno»', () => {
  const s = fresh();
  add(s, { key: 'huevos', price: 240, qty: 1, unit: 'carton', store: 'Jumbo', day: D });
  add(s, { key: 'aceite', price: 560, qty: 1, unit: 'gal', store: 'Jumbo', day: D });
  add(s, { key: 'pollo', price: 88, qty: 1, unit: 'lb', store: 'Jumbo', day: D });
  assert.equal(P.listPrice(s, { key: 'huevos', qty: null, unit: null }), 240, '«huevos»: el cartón que sueles comprar');
  assert.equal(P.listPrice(s, { key: 'huevos', qty: 12, unit: null }), 8, '«12 huevos»: cada huevo');
  assert.equal(P.listPrice(s, { key: 'huevos', qty: 2, unit: 'carton' }), 240);
  assert.equal(P.listPrice(s, { key: 'aceite', qty: null, unit: null }), 560, '«aceite»: el galón');
  assert.equal(P.listPrice(s, { key: 'aceite', qty: 1, unit: 'l' }), Math.round((560 / 3.78541) * 100) / 100);
  assert.equal(P.listPrice(s, { key: 'pollo', qty: 4, unit: 'lb' }), 88);
  assert.equal(P.listPrice(s, { key: 'arroz', qty: 1, unit: 'lb' }), 0, 'sin precio');
  assert.deepEqual(P.itemUnitSize(s, { key: 'leche', qty: 2, unit: null }), { qty: 1, unit: 'l' }, 'sin anotación: la medida de la libreta');
  SH.parseAndAdd(s, '1 cartón de huevos, 4 lb de pollo, aceite', { today: D });
  const t = SH.listTotals(s);
  assert.equal(t.est, 240 + 4 * 88 + 560);
  const it = SH.shopOf(s).items.find((i) => i.key === 'pollo');
  SH.updateItem(s, it.id, { price: 95 });
  assert.equal(SH.priceOf(s, SH.shopOf(s).items.find((i) => i.key === 'pollo')), 95, 'el precio que tú pones manda');
});

test('compra terminada: los precios de la lista van a la libreta con su tamaño real (y no se repiten si vinieron del recibo)', () => {
  const s = fresh();
  SH.parseAndAdd(s, 'huevos, 2 lb de pollo, aceite', { today: D });
  const items = SH.shopOf(s).items;
  for (const it of items) SH.toggleItem(s, it.id, D);
  const egg = items.find((i) => i.key === 'huevos');
  const hen = items.find((i) => i.key === 'pollo');
  SH.updateItem(s, egg.id, { price: 245 });
  SH.updateItem(s, hen.id, { price: 90 });
  SH.closeTrip(s, { list: egg.list, total: 425, store: 'Bravo', saveTx: false }, D, []);
  const e = P.pricesOf(s, 'huevos')[0];
  assert.deepEqual([e.price, e.qty, e.unit, e.src, e.store], [245, 1, 'carton', 'compra', 'Bravo'], '«huevos» sin unidad es un cartón, no un huevo');
  const h = P.pricesOf(s, 'pollo')[0];
  assert.deepEqual([h.price, h.qty, h.unit], [90, 1, 'lb']);
  assert.equal(P.pricesOf(s, 'aceite').length, 0, 'sin precio no se anota');

  const s2 = fresh();
  SH.parseAndAdd(s2, '2 lb de pollo', { today: D });
  const it2 = SH.shopOf(s2).items[0];
  SH.toggleItem(s2, it2.id, D);
  SH.updateItem(s2, it2.id, { price: 90 });
  SH.closeTrip(s2, { list: it2.list, total: 180, store: 'Bravo', saveTx: false, skipPrices: [it2.id] }, D, []);
  assert.equal(P.pricesOf(s2, 'pollo').length, 0);
});

// ---------- Fotos: recibo y etiqueta ----------

test('recibo: saca cada producto con su precio, cantidad, peso y tamaño (sin subtotal, ITBIS ni total)', () => {
  const items = P.receiptItems(RECEIPT);
  const descs = items.map((x) => x.desc);
  assert.ok(!descs.some((d) => /TOTAL|ITBIS|TARJETA|RNC|FECHA/.test(d)));
  const milk = items.find((x) => /LECHE/.test(x.desc));
  assert.deepEqual([milk.qty, milk.each, milk.total], [2, 74.75, 149.5]);
  assert.deepEqual(milk.size, { qty: 1, unit: 'l', text: '1LT' });
  const hen = items.find((x) => /POLLO/.test(x.desc));
  assert.deepEqual(hen.weight, { qty: 4.2, unit: 'lb' });
  assert.deepEqual([hen.each, hen.total], [86.5, 363.3]);
});

test('recibo → libreta: precio comparable de lo conocido; lo desconocido queda sin marcar', () => {
  const rows = P.receiptPrices(P.receiptItems(RECEIPT));
  const by = Object.fromEntries(rows.filter((r) => r.key).map((r) => [r.key, r]));
  assert.deepEqual([by.leche.price, by.leche.qty, by.leche.unit], [74.75, 1, 'l']);
  assert.deepEqual([by.arroz.price, by.arroz.qty, by.arroz.unit], [439, 10, 'lb']);
  assert.deepEqual([by.huevos.price, by.huevos.qty, by.huevos.unit], [251, 1, 'carton'], '30 UND es un cartón');
  assert.deepEqual([by.pollo.price, by.pollo.qty, by.pollo.unit], [86.5, 1, 'lb'], 'el precio por libra');
  assert.deepEqual([by.atun.price, by.atun.unit, by.atun.note], [81, 'lata', '5oz'], 'atún en aceite es atún');
  assert.deepEqual([by.aceite.price, by.aceite.qty, by.aceite.unit], [562, 1, 'gal']);
  const unknown = rows.find((r) => !r.key);
  assert.ok(unknown && unknown.on === false && /Zqx/.test(unknown.name));
  assert.ok(rows.filter((r) => r.key).every((r) => r.on));
  // Lo que trae la IA es solo { desc, total }: el tamaño sale del nombre.
  const ai = P.receiptPrices([{ desc: 'ARROZ SELECTO 10 LB', total: 439 }, { desc: 'HUEVOS 30 UND', total: 251 }]);
  assert.deepEqual(ai.map((r) => [r.key, r.qty, r.unit]), [['arroz', 10, 'lb'], ['huevos', 1, 'carton']]);
});

test('etiqueta: el precio más probable primero, el producto que se ve y el tamaño que dice', () => {
  const r = P.labelInfo('SUPERMERCADO\nHUEVOS BLANCOS GRANDES\n30 UND\nRD$ 249.95\nPRECIO X UND 8.33');
  assert.equal(r.amounts[0], 249.95);
  assert.deepEqual(r.prods.map((p) => p.key), ['huevos']);
  assert.deepEqual(r.size, { qty: 30, unit: 'u' });
  const w = P.labelInfo('POLLO ENTERO\nPRECIO POR LIBRA\n$87.50');
  assert.equal(w.unit, 'lb');
  assert.equal(w.amounts[0], 87.5);
  assert.deepEqual(P.labelInfo('sin precio aquí').amounts, []);
});

test('productos: en español manda la primera palabra («atún en aceite» es atún) y el nombre más completo', () => {
  assert.equal(matchProduct('atun en aceite').key, 'atun');
  assert.equal(matchProduct('ATUN PEPITO EN ACEITE').key, 'atun');
  assert.equal(matchProduct('pollo entero').key, 'pollo');
  assert.equal(matchProduct('huevos').key, 'huevos');
});

// ---------- Tiendas y canasta ----------

test('tiendas: dónde sale más barata tu lista con los precios de los últimos 3 meses', () => {
  const s = fresh();
  for (const [key, unit, j, b] of [['huevos', 'carton', 240, 255], ['leche', 'l', 72, 76], ['pollo', 'lb', 86, 90]]) {
    add(s, { key, price: j, qty: 1, unit, store: 'Jumbo', day: '2026-11-01' });
    add(s, { key, price: b, qty: 1, unit, store: 'Bravo', day: '2026-11-05' });
  }
  SH.parseAndAdd(s, '1 cartón de huevos, 2 litros de leche, 3 lb de pollo, café', { today: D });
  const items = SH.shopOf(s).items;
  const c = P.storeCompare(s, items, D);
  assert.equal(c.cheap.store, 'Jumbo');
  assert.equal(c.other.store, 'Bravo');
  assert.equal(c.n, 3);
  assert.equal(c.of, 4);
  assert.equal(c.save, (255 - 240) + 2 * (76 - 72) + 3 * (90 - 86));
  assert.equal(P.storeCompare(s, items, '2027-03-01'), null, 'con precios viejos no se compara');
});

test('canasta: cuánto cambió lo que sigues en unos 3 meses, lo que más subió y lo que bajó', () => {
  const s = fresh();
  for (const [key, unit, then, now] of [['huevos', 'carton', 230, 253], ['leche', 'l', 70, 73.5], ['pollo', 'lb', 90, 85.5]]) {
    add(s, { key, price: then, qty: 1, unit, store: 'Jumbo', day: '2026-08-15' });
    add(s, { key, price: now, qty: 1, unit, store: 'Jumbo', day: '2026-11-05' });
  }
  const b = P.basket(s, D);
  assert.equal(b.moved, 3);
  assert.ok(near(b.change, (0.1 + 0.05 - 0.05) / 3));
  assert.deepEqual(b.up.map((x) => x.key), ['huevos', 'leche']);
  assert.deepEqual(b.down.map((x) => x.key), ['pollo']);
  assert.equal(b.n, 3);
});

// ---------- Datos: lo de antes, dos teléfonos y Drive ----------

test('datos de antes de la 1.18: los precios aprendidos pasan a la libreta (un huevo sin unidad es un cartón)', () => {
  const s = fresh();
  const old = clone(s);
  delete old.shop.prices;
  delete old.shop.track;
  old.shop.hist = {
    huevos: { name: 'Huevos', aisle: 'lacteos', unit: null, n: 3, last: '2026-10-20', days: [], price: 230, store: 'Jumbo', prices: [{ d: '2026-10-20', p: 230, st: 'Jumbo' }, { d: '2026-09-20', p: 225, st: 'Bravo' }] },
    pollo: { name: 'Pollo', aisle: 'carnes', unit: 'lb', n: 2, last: '2026-10-20', days: [], price: 85, store: 'Jumbo', prices: [{ d: '2026-10-20', p: 85, st: 'Jumbo' }] },
  };
  const m = migrate(old);
  const sh = SH.shopOf(m);
  assert.equal(sh.prices.length, 3);
  assert.equal(sh.prices[0].day, '2026-10-20', 'de lo nuevo a lo viejo');
  const egg = sh.prices.find((e) => e.key === 'huevos' && e.day === '2026-10-20');
  assert.deepEqual([egg.unit, egg.src], ['carton', 'compra']);
  assert.equal(P.priceStats(m, 'huevos', D).last.show, 230);
  assert.deepEqual(sh.track, P.STAPLES);
  // Al abrir otra vez, nada se duplica.
  assert.equal(SH.shopOf(migrate(clone(m))).prices.length, 3);
});

test('dos teléfonos: los precios anotados en cada uno se juntan sin perder ninguno', () => {
  const base = fresh();
  add(base, { key: 'leche', price: 72, qty: 1, unit: 'l', store: 'Jumbo', day: '2026-11-01' });
  const local = clone(base); const remote = clone(base);
  P.addPrice(local, { key: 'huevos', price: 240, qty: 1, unit: 'carton', store: 'Jumbo', day: '2026-11-08' }, D);
  P.addPrice(remote, { key: 'pollo', price: 88, qty: 1, unit: 'lb', store: 'Bravo', day: '2026-11-09' }, D);
  P.setTracked(remote, 'zqx', true);
  const m = migrate(mergeStates(clone(base), local, remote));
  const sh = SH.shopOf(m);
  assert.deepEqual(sh.prices.map((e) => e.key), ['pollo', 'huevos', 'leche']);
  assert.ok(sh.track.includes('zqx'));
});

test('Drive: la tabla «Precios» con el precio comparable y de dónde salió', () => {
  const s = fresh();
  add(s, { key: 'huevos', price: 240, qty: 1, unit: 'carton', store: 'Jumbo', day: D, src: 'recibo' });
  add(s, { key: 'huevos', price: 70, qty: 6, unit: 'u', store: 'Colmado', day: D, src: 'foto' });
  const t = buildTables(s, D).Precios;
  assert.deepEqual(t[0], ['Fecha', 'Producto', 'Precio RD$', 'Cantidad', 'Medida', 'Precio comparable RD$', 'Por', 'Tienda', 'De dónde']);
  const byStore = Object.fromEntries(t.slice(1).map((r) => [r[7], r]));
  assert.deepEqual(byStore.Jumbo.slice(5), [240, 'el cartón de 30', 'Jumbo', 'Recibo']);
  assert.deepEqual(byStore.Colmado.slice(5), [350, 'el cartón de 30', 'Colmado', 'Foto']);
});

// ---------- Finanzas: disponible y gastos del mes ----------

function money(day = D, { salary = true } = {}) {
  const s = fresh(day);
  const at = new Date(`${day}T06:00:00`).getTime();
  const nom = L.addAccount(s, { name: 'Nómina', kind: 'cuenta', bank: 'Banco' });
  const aho = L.addAccount(s, { name: 'Ahorro', kind: 'cuenta', save: true });
  setAccountBalance(s, nom.id, { DOP: 50000 }, day, at);
  setAccountBalance(s, aho.id, { DOP: 100000 }, day, at);
  const P0 = (p) => addPlan(s, { account: nom.id, start: day, ...p }, day);
  if (salary) P0({ kind: 'ingreso', name: 'Sueldo', amount: 60000, cat: 'salario', freq: { type: 'month', days: [15, 30] } });
  P0({ name: 'Internet', amount: 2500, cat: 'telecom', freq: { type: 'month', days: [12] } });
  P0({ name: 'Luz', amount: 3000, cat: 'energia', freq: { type: 'month', days: [15] } });
  addLoan(s, { dir: 'yo', who: 'Carlos', amount: 4000, day: addDays(day, -5), due: addDays(day, 2) }, day);
  return { s, nom, aho };
}

test('disponible: lo de tus cuentas menos lo comprometido hasta el cobro (sin ahorros); lo del día del cobro se avisa', () => {
  const { s } = money();
  const av = OV.availableNow(s, D);
  assert.equal(av.kind, 'cobro');
  assert.equal(av.until, '2026-11-15');
  assert.equal(av.days, 5);
  assert.equal(av.liquid, 50000);
  assert.equal(av.savings, 100000);
  assert.equal(av.committed, 2500 + 4000, 'internet del 12 y lo que le debes a Carlos');
  assert.equal(av.free, 50000 - 6500);
  assert.equal(av.perDay, (50000 - 6500) / 5);
  assert.equal(av.onPaydayTotal, 3000, 'la luz vence el día del cobro');
  assert.deepEqual(av.onPayday.map((it) => it.p.name), ['Luz']);
});

test('disponible: sin sueldo programado, hasta fin de mes', () => {
  const { s } = money(D, { salary: false });
  const av = OV.availableNow(s, D);
  assert.equal(av.kind, 'mes');
  assert.equal(av.until, '2026-11-30');
  assert.equal(av.days, 21);
  assert.equal(av.committed, 2500 + 3000 + 4000);
  assert.equal(av.free, 50000 - 9500);
  assert.equal(av.onPaydayTotal, 0);
});

test('gastos del mes: «te queda» es lo que entra menos lo fijo, lo apartado y el día a día', () => {
  const { s, nom } = money();
  L.addTx(s, { type: 'gasto', amount: 3200, cat: 'super', merchant: 'Jumbo', account: nom.id, day: D }, D, []);
  const mv = OV.monthView(s, D);
  assert.equal(mv.income, 120000);
  assert.equal(mv.variable, 3200);
  assert.ok(near(mv.left, mv.income - mv.fixed - mv.funds - mv.variable, 0.011));
  assert.equal(mv.daysLeft, 21);
  assert.ok(near(mv.perDay, mv.left / mv.daysLeft, 0.011));
  assert.equal(mv.fixedLeft, mv.fixed - mv.fixedPaid);
  assert.equal(mv.toGet, 120000, 'aún no cobras');
});

test('flujo por mes: lo fijo separado del día a día', () => {
  const { s, nom } = money();
  const plan = s.money.plans.find((p) => p.name === 'Internet');
  L.addTx(s, { type: 'gasto', amount: 2500, cat: 'telecom', merchant: 'Internet', account: nom.id, day: '2026-11-12', link: { plan: plan.id, date: '2026-11-12' } }, '2026-11-12', []);
  L.addTx(s, { type: 'gasto', amount: 900, cat: 'cafe', merchant: 'Café', account: nom.id, day: D }, D, []);
  const [row] = cashflow(s, ['2026-11']);
  assert.deepEqual([row.spent, row.fixed, row.variable], [3400, 2500, 900]);
});

// ---------- Finanzas: lo que debes ----------

test('deudas: a largo plazo (más de un año) separadas de tarjetas, préstamos cortos y personas', () => {
  const { s, nom } = money();
  const casa = addCredit(s, { name: 'Hipoteca', kind: 'hipoteca', lender: 'Banco', principal: 2000000, apr: 9, term: 240, start: '2026-01-01', first: '2026-02-01', account: nom.id }, D);
  const corto = addCredit(s, { name: 'Préstamo personal', kind: 'personal', lender: 'Banco', principal: 60000, apr: 20, term: 12, start: '2026-06-01', first: '2026-07-01', account: nom.id }, D);
  const visa = L.addAccount(s, { name: 'Visa', kind: 'tarjeta', cut: 25, due: 15, limit: { DOP: 100000, USD: 0 }, payFrom: nom.id });
  setAccountBalance(s, visa.id, { DOP: 20000 }, D, new Date(`${D}T07:00:00`).getTime());
  addLoan(s, { dir: 'me', who: 'Laura', amount: 3500, day: addDays(D, -3) }, D);
  const ds = OV.debtSplit(s, D);
  assert.deepEqual(ds.long.items.map((x) => x.id), [casa.id]);
  assert.deepEqual(ds.short.items.map((x) => x.type), ['card', 'credit', 'loan'], 'tarjetas, préstamos cortos, personas');
  assert.equal(ds.short.items.find((x) => x.type === 'credit').id, corto.id);
  assert.equal(ds.short.cards, 20000);
  assert.equal(ds.short.people, 4000);
  assert.equal(ds.me.total, 3500, 'lo que te deben va aparte');
  assert.ok(near(ds.total, ds.long.total + ds.short.total, 0.011));
  assert.ok(ds.long.total > 1900000);
  assert.ok(ds.dti == null || ds.dti > 0);
});

test('deudas: un préstamo es de largo plazo si le queda más de un año (o, sin fecha, si es de más de 12 cuotas)', () => {
  assert.equal(OV.LONG_DAYS, 365);
  assert.equal(OV.isLongTerm({ term: 60 }, { end: '2028-01-01' }, D), true);
  assert.equal(OV.isLongTerm({ term: 60 }, { end: '2027-06-01' }, D), false, 'le quedan menos de 12 meses');
  assert.equal(OV.isLongTerm({ term: 24 }, {}, D), true);
  assert.equal(OV.isLongTerm({ term: 12 }, {}, D), false);
});

test('deudas: qué tanto de lo que entra se va en deudas (sano, con cuidado, alto)', () => {
  assert.equal(OV.dtiLevel(null), null);
  assert.equal(OV.dtiLevel(0.15).label, 'Sano');
  assert.equal(OV.dtiLevel(0.2).key, 'ok');
  assert.equal(OV.dtiLevel(0.3).label, 'Con cuidado');
  assert.equal(OV.dtiLevel(0.4).label, 'Alto');
});

test('deudas: la evolución por mes separa largo y corto plazo', () => {
  const { s, nom } = money();
  addCredit(s, { name: 'Hipoteca', kind: 'hipoteca', lender: 'Banco', principal: 2000000, apr: 9, term: 240, start: '2026-01-01', first: '2026-02-01', account: nom.id }, D);
  const series = OV.debtSeries(s, D, 3);
  assert.equal(series.length, 3);
  assert.deepEqual(series.map((x) => x.mk), ['2026-09', '2026-10', '2026-11']);
  assert.ok(series.every((x) => x.long > 1900000));
  assert.ok(series[2].current);
});
