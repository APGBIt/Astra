import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/game/logic.js';
import * as M from '../src/game/money.js';
import * as G from '../src/game/ledger.js';
import * as T from '../src/game/stats.js';
import * as D from '../src/game/debts.js';

const DAY = '2026-10-20';
function fresh(day = DAY) {
  const s = L.defaultState(day);
  s.profile.onboarded = true;
  s.money.fx.manual = 60;
  return s;
}
const tx = (s, p, day = DAY) => L.addTx(s, { day, ...p }, day, []);

test('impuesto a transferencias: 0.15 % hasta el 2 de julio de 2026 y 0.20 % desde el 3 (Ley 30-26)', () => {
  const s = fresh();
  assert.equal(L.transferTaxRate(s, '2026-07-02'), 0.0015);
  assert.equal(L.transferTaxRate(s, '2026-07-03'), 0.002);
  assert.equal(L.taxPct(0.002), '0.20 %');
  assert.equal(L.taxPct(0.0015), '0.15 %');
  s.money.tax.rate = 0.003;
  assert.equal(L.transferTaxRate(s, '2026-10-01'), 0.003);
});

test('impuesto: se sugiere al transferir a terceros o pagar la tarjeta desde el banco; no entre tus cuentas ni desde efectivo', () => {
  const s = fresh();
  const bank = L.addAccount(s, { name: 'Ahorro Banreservas', kind: 'cuenta', bank: 'Banreservas', last4: '1111' });
  const deb = L.addAccount(s, { name: 'Débito', kind: 'debito', last4: '2222', of: bank.id });
  const card = L.addAccount(s, { name: 'Visa', kind: 'tarjeta', last4: '3333' });
  const sug = (p) => L.taxSuggestion(s, { day: DAY, amount: 10000, ...p });
  assert.deepEqual([sug({ type: 'gasto', cat: 'terceros', account: bank.id }).on, sug({ type: 'gasto', cat: 'terceros', account: bank.id }).tax], [true, 20]);
  assert.equal(sug({ type: 'transfer', cat: 'pago_tarjeta', account: bank.id, to: card.id }).on, true);
  assert.equal(sug({ type: 'transfer', cat: 'entre_cuentas', account: bank.id }).on, false);
  assert.equal(sug({ type: 'transfer', cat: 'retiro', account: bank.id }).exempt, true);
  // Una compra con la débito puede pagarlo, pero no se marca sola.
  assert.deepEqual([sug({ type: 'gasto', cat: 'super', account: deb.id }).can, sug({ type: 'gasto', cat: 'super', account: deb.id }).on], [true, false]);
  assert.equal(sug({ type: 'gasto', cat: 'super', merchant: 'Transferencia a Juan', account: bank.id }).on, true);
  assert.equal(sug({ type: 'gasto', cat: 'terceros', account: 'efectivo' }).can, false);
  assert.equal(sug({ type: 'gasto', cat: 'terceros', account: card.id }).can, false);
  assert.equal(sug({ type: 'ingreso', cat: 'salario', account: bank.id }).can, false);
  // Antes del cambio de tasa.
  assert.equal(sug({ type: 'gasto', cat: 'terceros', account: bank.id, day: '2026-06-30' }).tax, 15);
});

test('impuesto: queda como gasto aparte ligado a su transferencia, la sigue al corregirla y se borra con ella', () => {
  const s = fresh();
  const bank = L.addAccount(s, { name: 'Ahorro', kind: 'cuenta', last4: '1111' });
  M.setAccountBalance(s, bank.id, { DOP: 50000 }, '2026-10-01');
  const t = tx(s, { type: 'gasto', amount: 10000, cat: 'terceros', merchant: 'Juan Pérez', account: bank.id, tax: true, fee: 50 });
  const kids = L.taxChildren(s, t.id);
  assert.equal(kids.length, 2);
  const tax = kids.find((k) => k.taxKind === 'tax');
  assert.equal(L.txOrig(tax), 20);
  assert.equal(tax.cat, 'comisiones');
  assert.equal(tax.merchant, L.TAX_LABEL);
  assert.equal(L.txOrig(kids.find((k) => k.taxKind === 'fee')), 50);
  assert.equal(M.balances(s)[bank.id].DOP, 50000 - 10000 - 20 - 50);
  // Cambia el monto y la fecha: el impuesto se recalcula (antes del 3 de julio, 0.15 %).
  L.updateTx(s, t.id, { amount: 20000, day: '2026-06-30' });
  const tax2 = L.taxChildren(s, t.id).find((k) => k.taxKind === 'tax');
  assert.equal(L.txOrig(tax2), 30);
  assert.equal(tax2.day, '2026-06-30');
  assert.equal(tax2.id, tax.id);
  // Quitar solo el impuesto.
  L.setTaxRecords(s, t.id, { tax: false });
  assert.equal(L.taxChildren(s, t.id).length, 1);
  L.removeTx(s, t.id);
  assert.equal(s.money.tx.length, 0);
});

test('impuesto: el del aviso del banco queda ligado y conserva su monto', () => {
  const s = fresh();
  L.importTxs(s, {
    label: 'Avisos', accounts: [{ id: 'x1', name: 'Ahorro Banreservas', kind: 'cuenta', bank: 'Banreservas', last4: '4321' }],
    items: [
      { kind: 'gasto', amount: 5000, currency: 'DOP', day: '2026-10-05', merchant: 'Ana Gómez', cat: 'terceros', account: 'x1', ref: '998877' },
      { kind: 'gasto', amount: 7.5, currency: 'DOP', day: '2026-10-05', merchant: 'Impuesto a transferencias', cat: 'comisiones', account: 'x1', ref: '998877-imp' },
    ],
  }, DAY, []);
  const parent = s.money.tx.find((t) => t.ref === '998877');
  const kid = s.money.tx.find((t) => t.ref === '998877-imp');
  assert.equal(kid.taxOf, parent.id);
  assert.equal(L.findTaxFor(s, parent), kid);
  // Al corregir la transferencia, el impuesto del banco no se recalcula.
  L.updateTx(s, parent.id, { merchant: 'Ana María Gómez' });
  assert.equal(L.txOrig(s.money.tx.find((t) => t.id === kid.id)), 7.5);
  // Agregar en grupo no lo duplica.
  assert.equal(G.bulkAddTax(s, [parent.id]), 0);
});

test('agregar el impuesto en grupo a las que les falta, con deshacer', () => {
  const s = fresh();
  const bank = L.addAccount(s, { name: 'Ahorro', kind: 'cuenta', last4: '1111' });
  const a = tx(s, { type: 'gasto', amount: 1000, cat: 'terceros', account: bank.id });
  const b = tx(s, { type: 'transfer', amount: 2000, cat: 'entre_cuentas', account: bank.id });
  const c = tx(s, { type: 'gasto', amount: 3000, cat: 'super', account: 'efectivo' });
  assert.deepEqual(G.taxable(s, [a.id, b.id, c.id]).map((t) => t.id), [a.id]);
  assert.equal(G.bulkAddTax(s, [a.id, b.id, c.id]), 1);
  assert.equal(L.txOrig(L.taxChildren(s, a.id)[0]), 2);
  assert.equal(G.undoBulk(s), 1);
  assert.equal(L.taxChildren(s, a.id).length, 0);
  assert.equal(s.money.tx.length, 3);
});

test('período, filtros combinados y totales por categoría y familia', () => {
  const s = fresh();
  const bank = L.addAccount(s, { name: 'Ahorro', kind: 'cuenta', last4: '1111' });
  tx(s, { type: 'ingreso', amount: 60000, cat: 'salario', account: bank.id, day: '2026-10-15' });
  tx(s, { type: 'gasto', amount: 4000, cat: 'super', merchant: 'Bravo', account: bank.id, day: '2026-10-02' });
  tx(s, { type: 'gasto', amount: 300, cat: 'cafe', merchant: 'Café Santo', day: '2026-10-03' });
  tx(s, { type: 'gasto', amount: 900, cat: 'comida', merchant: 'Pizza', tag: 'Viaje', day: '2026-10-04' });
  tx(s, { type: 'gasto', amount: 10, currency: 'USD', cat: 'suscripciones', merchant: 'Netflix', day: '2026-10-05' });
  tx(s, { type: 'gasto', amount: 2500, cat: 'super', merchant: 'Bravo', day: '2026-09-20' });
  const per = G.periodRange({ kind: 'mes', mk: '2026-10' }, DAY);
  assert.deepEqual([per.from, per.to], ['2026-10-01', '2026-10-31']);
  let list = G.filterTx(s, per, { kind: 'gasto' });
  assert.equal(list.length, 4);
  const sum = G.summarize(s, list);
  assert.equal(sum.spent, 4000 + 300 + 900 + 600);
  assert.equal(sum.nSpent, 4);
  // Varias categorías, monto y texto.
  list = G.filterTx(s, per, { cats: ['super', 'cafe'], min: 500 });
  assert.deepEqual(list.map((t) => t.merchant), ['Bravo']);
  assert.equal(G.filterTx(s, per, { q: 'pizza viaje' }).length, 1);
  assert.equal(G.filterTx(s, per, { cur: 'USD' }).length, 1);
  assert.equal(G.filterTx(s, per, { accounts: [bank.id] }).length, 2);
  // El filtro de antes ({ cat, account, tag }) sigue sirviendo.
  assert.equal(G.filterTx(s, per, { cat: 'comida', tag: 'Viaje' }).length, 1);
  assert.equal(G.filterCount({ kind: 'gasto', cats: ['super'], min: 1 }), 3);
  // 3 meses incluye septiembre.
  assert.equal(G.filterTx(s, G.periodRange({ kind: '3m' }, DAY), { cats: ['super'] }).length, 2);
  // Totales por categoría y por familia.
  const all = G.filterTx(s, per, {});
  const cats = G.catTotals(s, all);
  assert.equal(cats.total, 5800);
  assert.equal(cats.rows[0].key, 'super');
  const fam = G.catTotals(s, all, { by: 'familia' });
  assert.equal(fam.rows.find((r) => r.key === 'comida').total, 4000 + 300 + 900);
  const inc = G.catTotals(s, all, { type: 'ingreso' });
  assert.equal(inc.rows[0].key, 'salario');
  // Agrupar por categoría: subtotal y parte.
  const groups = G.groupList(s, all, 'categoria');
  assert.equal(groups[0].key, 'super');
  assert.equal(groups[0].sum.spent, 4000);
  assert.ok(Math.abs(groups[0].share - 4000 / 5800) < 1e-9);
  assert.equal(groups[groups.length - 1].isIncome, true);
  // Ordenar por monto.
  assert.equal(G.sortList(G.filterTx(s, per, { kind: 'gasto' }), 'mayor')[0].merchant, 'Bravo');
});

test('no contar en el análisis: mueve el saldo pero no entra en totales ni presupuestos', () => {
  const s = fresh();
  const bank = L.addAccount(s, { name: 'Ahorro', kind: 'cuenta', last4: '1111' });
  M.setAccountBalance(s, bank.id, { DOP: 100000 }, '2026-10-01');
  const big = tx(s, { type: 'gasto', amount: 50000, cat: 'terceros', merchant: 'Préstamo a Luis', account: bank.id, day: '2026-10-06' });
  tx(s, { type: 'gasto', amount: 1000, cat: 'super', account: bank.id, day: '2026-10-06' });
  L.setBudget(s, 'terceros', 10000, DAY);
  assert.equal(G.bulkEdit(s, [big.id], { noStats: true }), 1);
  assert.equal(M.balances(s)[bank.id].DOP, 49000);
  assert.equal(T.totals(s, '2026-10-01', DAY).spent, 1000);
  assert.equal(L.monthSummary(s, '2026-10').spent, 1000);
  assert.equal(M.budgetRows(s, '2026-10', DAY).find((r) => r.c.id === 'terceros').spent, 0);
  const sum = G.summarize(s, G.filterTx(s, G.periodRange({ kind: 'mes', mk: '2026-10' }, DAY), {}));
  assert.deepEqual([sum.spent, sum.excluded, sum.nExcluded], [1000, 50000, 1]);
  assert.equal(G.filterTx(s, G.periodRange({ kind: 'mes', mk: '2026-10' }, DAY), { only: 'excluded' }).length, 1);
});

test('edición masiva: categoría, etiqueta, cuenta, tipo y fecha; respeta el tipo de cada movimiento y se deshace', () => {
  const s = fresh();
  const bank = L.addAccount(s, { name: 'Ahorro', kind: 'cuenta', last4: '1111' });
  const a = tx(s, { type: 'gasto', amount: 100, cat: 'otros', merchant: 'A' });
  const b = tx(s, { type: 'gasto', amount: 200, cat: 'otros', merchant: 'B' });
  const c = tx(s, { type: 'ingreso', amount: 300, cat: 'salario', merchant: 'C' });
  const n = G.bulkEdit(s, [a.id, b.id, c.id], { cat: 'comida', tag: 'Viaje', account: bank.id });
  assert.equal(n, 3);
  const get = (id) => s.money.tx.find((t) => t.id === id);
  assert.deepEqual([get(a.id).cat, get(b.id).cat, get(c.id).cat], ['comida', 'comida', 'salario']);
  assert.deepEqual([get(a.id).tag, get(c.id).tag, get(c.id).account], ['Viaje', 'Viaje', bank.id]);
  // Cambiar el tipo: la categoría que ya no sirve pasa a la general del tipo.
  G.bulkEdit(s, [a.id], { type: 'transfer' });
  assert.deepEqual([L.txKind(get(a.id)), get(a.id).cat], ['transfer', 'entre_cuentas']);
  G.bulkEdit(s, [b.id], { day: '2026-10-01', note: 'revisado' });
  assert.deepEqual([get(b.id).day, get(b.id).note], ['2026-10-01', 'revisado']);
  // Deshacer el último cambio en grupo.
  G.undoBulk(s);
  assert.deepEqual([get(b.id).day, get(b.id).note], [DAY, '']);
  // Borrar en grupo y deshacer (también vuelve la liga con su pago programado).
  const plan = M.addPlan(s, { kind: 'gasto', name: 'Luz', amount: 200, cat: 'comida', freq: { type: 'month', days: [20] } }, DAY);
  M.linkPlan(s, plan.id, DAY, get(b.id), DAY, []);
  assert.equal(G.bulkRemove(s, [b.id, c.id]), 2);
  assert.equal(s.money.tx.length, 1);
  assert.equal(s.money.plans[0].done[DAY], undefined);
  G.undoBulk(s);
  assert.equal(s.money.tx.length, 3);
  assert.equal(s.money.plans[0].done[DAY], b.id);
});

test('mover todos los movimientos de una categoría a otra y unir una categoría tuya', () => {
  const s = fresh();
  const mine = L.addCategory(s, { name: 'Colmado', type: 'gasto' });
  L.setBudget(s, mine.id, 3000, DAY);
  tx(s, { type: 'gasto', amount: 100, cat: mine.id, merchant: 'Colmado Juan' });
  tx(s, { type: 'gasto', amount: 150, cat: mine.id, merchant: 'Colmado Juan' });
  s.money.rules['colmado juan'] = mine.id;
  assert.equal(G.moveCategory(s, mine.id, 'super', { remove: true }), 2);
  assert.ok(s.money.tx.every((t) => t.cat === 'super'));
  assert.ok(!s.money.categories.some((c) => c.id === mine.id));
  // La regla de ese comercio pasa a la categoría nueva.
  assert.equal(s.money.rules['colmado juan'], 'super');
  assert.equal(s.money.categories.find((c) => c.id === 'super').budget, 3000);
  // No se mezcla un gasto con un ingreso.
  assert.equal(G.moveCategory(s, 'super', 'salario'), 0);
  G.undoBulk(s);
  assert.ok(s.money.categories.some((c) => c.id === mine.id));
  assert.ok(s.money.tx.every((t) => t.cat === mine.id));
});

test('reglas: verlas, aplicarlas a lo anterior y comercios iguales en otra categoría', () => {
  const s = fresh();
  const a = tx(s, { type: 'gasto', amount: 250, cat: 'otros', merchant: 'UBER *RIDES' });
  tx(s, { type: 'gasto', amount: 300, cat: 'otros', merchant: 'Uber Rides' });
  tx(s, { type: 'gasto', amount: 320, cat: 'transporte', merchant: 'uber rides' });
  const others = G.sameMerchantOthers(s, s.money.tx.find((t) => t.cat === 'transporte'));
  assert.equal(others.length, 2);
  const key = G.setRule(s, 'Uber Rides', 'transporte');
  assert.equal(key, 'uber rides');
  const r = G.rulesList(s).find((x) => x.key === key);
  assert.deepEqual([r.n, r.off], [3, 2]);
  assert.equal(G.applyRule(s, key), 2);
  assert.equal(s.money.tx.find((t) => t.id === a.id).cat, 'transporte');
  G.removeRule(s, key);
  assert.equal(G.rulesList(s).length, 0);
});

test('dividir un movimiento en varias categorías y volver a juntarlo', () => {
  const s = fresh();
  const card = L.addAccount(s, { name: 'Visa', kind: 'tarjeta', last4: '3333' });
  M.setAccountBalance(s, card.id, { DOP: 0 }, '2026-10-01');
  const t = tx(s, { type: 'gasto', amount: 3000, cat: 'super', merchant: 'Sirena', account: card.id, ref: '5555' });
  assert.equal(G.splitTx(s, t.id, [{ cat: 'super', amount: 2000 }, { cat: 'cuidado', amount: 999 }]), null);
  const parts = G.splitTx(s, t.id, [{ cat: 'super', amount: 2000 }, { cat: 'cuidado', amount: 600 }, { cat: 'hogar', amount: 400, note: 'Escoba' }]);
  assert.equal(parts.length, 3);
  assert.equal(parts[0].id, t.id);
  assert.deepEqual(G.splitParts(s, parts[0].split.id).map((x) => [x.cat, L.txOrig(x)]), [['super', 2000], ['cuidado', 600], ['hogar', 400]]);
  assert.equal(M.balances(s)[card.id].DOP, -3000);
  assert.equal(T.totals(s, '2026-10-01', DAY).spent, 3000);
  // El aviso repetido del banco sigue contando como repetido.
  assert.ok(L.findDuplicate(s, { day: DAY, amount: 3000, currency: 'DOP', merchant: 'SIRENA' }));
  const back = G.unsplitTx(s, parts[0].split.id);
  assert.equal(L.txOrig(back), 3000);
  assert.equal(back.split, undefined);
  assert.equal(s.money.tx.length, 1);
});

test('hora de trabajo: con tus cobros fijos, con tu promedio o con tu número; horas y días por gasto', () => {
  const s = fresh();
  // Sin datos todavía.
  assert.equal(G.workInfo(s, DAY).ready, false);
  // Promedio de los meses anteriores (sin reembolsos).
  tx(s, { type: 'ingreso', amount: 52000, cat: 'salario', day: '2026-09-15' });
  tx(s, { type: 'ingreso', amount: 5000, cat: 'reembolsos', day: '2026-09-16' });
  let wi = G.workInfo(s, DAY);
  assert.equal(wi.source, 'hist');
  assert.equal(wi.income, 52000);
  // 40 horas a la semana = 173.33 horas al mes.
  assert.equal(Math.round(wi.hourly), 300);
  // Con el sueldo quincenal programado.
  M.addPlan(s, { kind: 'ingreso', name: 'Sueldo', amount: 30000, cat: 'salario', freq: { type: 'month', days: [15, 31] } }, DAY);
  M.addPlan(s, { kind: 'ingreso', name: 'Regalía', amount: 60000, cat: 'regalia', freq: { type: 'months', n: 12, anchor: '2026-12-20' } }, DAY);
  wi = G.workInfo(s, DAY);
  assert.equal(wi.source, 'plan');
  assert.equal(wi.income, 65000);
  // Tu número y tus horas; y la hora real con traslados y gastos del trabajo.
  s.money.work = { ...s.money.work, auto: false, income: 44000, hours: 44, commute: 6, costs: 4000, real: true };
  wi = G.workInfo(s, DAY);
  assert.equal(wi.source, 'manual');
  assert.equal(Math.round(wi.hourly * 100) / 100, Math.round((44000 / (44 * 52 / 12)) * 100) / 100);
  assert.equal(Math.round(wi.realHourly * 100) / 100, Math.round((40000 / (50 * 52 / 12)) * 100) / 100);
  assert.equal(wi.rate, wi.realHourly);
  // Formato.
  const w = { dayHours: 8, monthHours: 173.33 };
  assert.equal(G.fmtWork(0.2, w), '12 min');
  assert.equal(G.fmtWork(2.26, w), '2 h 15 min');
  assert.equal(G.fmtWork(1.99, w), '2 h');
  assert.equal(G.fmtWork(12, w), '1.5 días');
  assert.equal(G.fmtWork(8, w), '1 día');
  assert.equal(G.fmtWork(400, w), '2.3 meses');
  assert.equal(G.workHours(600, { rate: 300 }), 2);
});

test('presupuesto por familia: junta sus categorías, no se cuenta dos veces y avisa', () => {
  const s = fresh();
  M.setGroupBudget(s, 'comida', 10000, DAY);
  L.setBudget(s, 'delivery', 2000, DAY);
  L.setBudget(s, 'ropa', 3000, DAY);
  tx(s, { type: 'gasto', amount: 6000, cat: 'super', day: '2026-10-05' });
  tx(s, { type: 'gasto', amount: 1500, cat: 'delivery', day: '2026-10-06' });
  const rows = M.budgetRows(s, '2026-10', DAY);
  const fam = rows.find((r) => r.isGroup);
  assert.equal(fam.c.id, 'g:comida');
  assert.equal(fam.spent, 7500);
  assert.equal(M.budgetTotal(s, rows), 10000 + 3000);
  // Al pasar del 80 % de la familia, aviso.
  const ev = [];
  L.addTx(s, { type: 'gasto', amount: 600, cat: 'cafe', day: DAY }, DAY, ev);
  assert.ok(ev.some((e) => e.type === 'budget' && e.name === 'Comida' && e.level === 80));
  // Sobrante que pasa al mes siguiente, también por familia.
  M.setRollover(s, 'g:comida', true, '2026-09-01');
  s.money.groupBudgets.comida.rollFrom = '2026-09';
  const nov = M.budgetRows(s, '2026-11', '2026-11-02').find((r) => r.isGroup);
  assert.equal(nov.carry, 10000 + (10000 - 8100));
  // Detalle de la familia.
  const det = T.categoryDetail(s, 'g:comida', DAY);
  assert.equal(det.thisMonth, 8100);
  M.setGroupBudget(s, 'comida', 0, DAY);
  assert.ok(M.budgetRows(s, '2026-10', DAY).every((r) => !r.isGroup || r.c.roll));
});

test('esta semana: lo del día a día del mes repartido por días, sin los pagos programados', () => {
  const s = fresh();
  const plan = M.addPlan(s, { kind: 'ingreso', name: 'Sueldo', amount: 62000, cat: 'salario', freq: { type: 'month', days: [15] } }, '2026-10-01');
  const rent = M.addPlan(s, { kind: 'gasto', name: 'Alquiler', amount: 31000, cat: 'vivienda', freq: { type: 'month', days: [1] } }, '2026-10-01');
  assert.ok(plan && rent);
  // Lunes 19 a domingo 25 de octubre de 2026.
  const t = tx(s, { type: 'gasto', amount: 31000, cat: 'vivienda', day: '2026-10-19', link: { plan: rent.id, date: '2026-10-01' } });
  assert.ok(t);
  tx(s, { type: 'gasto', amount: 1500, cat: 'comida', day: '2026-10-19' });
  tx(s, { type: 'gasto', amount: 500, cat: 'cafe', day: '2026-10-18' });
  const w = M.weekFlex(s, DAY);
  assert.deepEqual([w.start, w.end], ['2026-10-19', '2026-10-25']);
  assert.equal(w.allowance, Math.round(((62000 - 31000) * 7 / 31) * 100) / 100);
  assert.equal(w.spent, 1500);
  assert.equal(w.daysLeft, 6);
});

test('salir de deudas: avalancha ahorra intereses, bola de nieve termina antes la más pequeña', () => {
  const debts = [
    { id: 'a', name: 'Visa', balance: 50000, apr: 60, min: 3000 },
    { id: 'b', name: 'Préstamo', balance: 10000, apr: 18, min: 1000 },
  ];
  const av = D.payoff(debts, { extra: 3000, method: 'avalanche' });
  const sb = D.payoff(debts, { extra: 3000, method: 'snowball' });
  const mn = D.payoff(debts, { method: 'none' });
  assert.ok(av.ok && sb.ok && mn.ok);
  assert.ok(av.interest < sb.interest);
  assert.ok(av.months <= sb.months);
  assert.equal(sb.order[0].id, 'b');
  // Con la bola de nieve la más pequeña termina mucho antes; la avalancha paga menos intereses en la más cara.
  assert.ok(sb.order.find((x) => x.id === 'b').month < av.order.find((x) => x.id === 'b').month);
  assert.ok(av.order.find((x) => x.id === 'a').interest < sb.order.find((x) => x.id === 'a').interest);
  assert.ok(mn.months > av.months && mn.interest > av.interest);
  assert.equal(av.budget, 7000);
  // Un pago que no cubre los intereses nunca termina.
  const never = D.payoff([{ id: 'x', name: 'X', balance: 100000, apr: 60, min: 1000 }], { method: 'none' });
  assert.equal(never.ok, false);
  // Las tarjetas salen de lo que debes en Astra; los préstamos se agregan.
  const s = fresh();
  const card = L.addAccount(s, { name: 'Visa APAP', kind: 'tarjeta', last4: '5555', cut: 15, due: 10 });
  M.setAccountBalance(s, card.id, { DOP: 20000, USD: 100 }, '2026-10-01');
  D.saveDebt(s, { kind: 'card', account: card.id, apr: 54, min: 1500 });
  D.saveDebt(s, { kind: 'loan', name: 'Préstamo del carro', balance: 300000, apr: 14, min: 9000 });
  const list = D.debtList(s, DAY);
  assert.equal(list.length, 2);
  assert.equal(list[0].balance, 20000 + 100 * 60);
  assert.deepEqual([list[0].apr, list[0].min], [54, 1500]);
  assert.equal(D.monthAfter('2026-10-20', 3), '2027-01');
});

test('análisis 1.9: período anterior, ingresos por categoría, gastos hormiga, costos del banco y salud financiera', () => {
  const s = fresh();
  const bank = L.addAccount(s, { name: 'Ahorro', kind: 'cuenta', last4: '1111' });
  const card = L.addAccount(s, { name: 'Visa', kind: 'tarjeta', last4: '2222', limit: { DOP: 100000 } });
  M.setAccountBalance(s, bank.id, { DOP: 90000 }, '2026-07-01');
  M.setAccountBalance(s, card.id, { DOP: 0 }, '2026-07-01');
  for (const mk of ['2026-07', '2026-08', '2026-09']) {
    tx(s, { type: 'ingreso', amount: 60000, cat: 'salario', account: bank.id, day: `${mk}-15` });
    tx(s, { type: 'gasto', amount: 30000, cat: 'vivienda', account: bank.id, day: `${mk}-01` });
  }
  tx(s, { type: 'ingreso', amount: 60000, cat: 'salario', account: bank.id, day: '2026-10-15' });
  tx(s, { type: 'ingreso', amount: 5000, cat: 'honorarios', account: bank.id, day: '2026-10-16' });
  for (let d = 1; d <= 20; d += 1) tx(s, { type: 'gasto', amount: 150, cat: 'cafe', merchant: 'Café', account: card.id, day: `2026-10-${String(d).padStart(2, '0')}` });
  tx(s, { type: 'gasto', amount: 10000, cat: 'terceros', merchant: 'Juan', account: bank.id, day: '2026-10-10', tax: true });
  tx(s, { type: 'gasto', amount: 350, cat: 'comisiones', merchant: 'Cargo por servicio', account: bank.id, day: '2026-10-11' });
  tx(s, { type: 'gasto', amount: 900, cat: 'intereses_pagados', merchant: 'Intereses', account: card.id, day: '2026-10-12' });
  const per = T.periodOf('mes', DAY);
  const cmp = T.compareTotals(s, per, DAY);
  assert.equal(cmp.prev.income, 60000);
  assert.ok(cmp.dIncome > 0);
  const inc = T.incomeStats(s, per);
  assert.deepEqual(inc.map((x) => x.cat), ['salario', 'honorarios']);
  const ants = T.smallSpends(s, per, { max: 500 });
  // El cargo del banco no es un gasto hormiga.
  assert.equal(ants.n, 20);
  assert.equal(ants.total, 20 * 150);
  assert.equal(ants.cats[0].cat, 'cafe');
  const bc = T.bankCosts(s, per);
  assert.deepEqual([bc.tax, bc.fees, bc.interest, bc.total], [20, 350, 900, 1270]);
  const hs = T.healthSnapshot(s, DAY);
  assert.equal(hs.months, 3);
  assert.equal(hs.saveRate, 0.5);
  assert.equal(hs.avgSpent, 30000);
  assert.ok(hs.cushion > 3);
  assert.ok(hs.cardUse > 0 && hs.cardUse < 0.1);
  const ano = T.periodOf('ano', DAY);
  assert.equal(ano.mks.length, 10);
  assert.equal(T.prevPeriodOf(ano, DAY).from, '2025-01-01');
  assert.equal(T.prevPeriodOf(per, DAY).to, '2026-09-20');
});

test('lo que de verdad pagaste en un pago programado y su promedio', () => {
  const s = fresh();
  const luz = M.addPlan(s, { kind: 'gasto', name: 'Luz', amount: 3000, variable: true, cat: 'servicios', freq: { type: 'month', days: [18] } }, '2026-07-01');
  for (const [d, v] of [['2026-07-18', 2800], ['2026-08-18', 3400], ['2026-09-18', 3100], ['2026-10-18', 3500]]) {
    tx(s, { type: 'gasto', amount: v, cat: 'servicios', merchant: 'Edesur', day: d, link: { plan: luz.id, date: d } }, d);
  }
  const h = M.planHistory(s, s.money.plans[0]);
  assert.deepEqual(h.rows.map((r) => r.amount), [3500, 3100, 3400, 2800]);
  assert.equal(h.avg, Math.round(((3500 + 3100 + 3400) / 3) * 100) / 100);
});
