import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/game/logic.js';
import * as M from '../src/game/money.js';

const D = '2026-10-19';
const RATE = 61.1477;

function fresh(day = D) {
  const s = L.defaultState(day);
  s.profile.onboarded = true;
  s.money.fx.manual = RATE;
  return s;
}
const tx = (s, p, day = D) => L.addTx(s, { day, ...p }, day, []);

test('saldo: lo anotado más lo que pasa después; lo de antes ya estaba incluido', () => {
  const s = fresh();
  const bank = L.addAccount(s, { name: 'Ahorro Popular', kind: 'cuenta', bank: 'Popular', last4: '1111' });
  tx(s, { type: 'gasto', amount: 500, cat: 'super', account: bank.id }, '2026-10-17');
  M.setAccountBalance(s, bank.id, { DOP: 20000 }, '2026-10-18', new Date('2026-10-18T10:00:00').getTime());
  tx(s, { type: 'gasto', amount: 1000, cat: 'super', account: bank.id, time: '09:00' }, '2026-10-18');
  tx(s, { type: 'gasto', amount: 300, cat: 'comida', account: bank.id, time: '12:30' }, '2026-10-18');
  tx(s, { type: 'ingreso', amount: 5000, cat: 'salario', account: bank.id }, D);
  const b = M.balances(s)[bank.id];
  assert.equal(b.DOP, 20000 - 300 + 5000);
});

test('una tarjeta de débito mueve el dinero de su cuenta', () => {
  const s = fresh();
  const bank = L.addAccount(s, { name: 'Ahorro BHD', kind: 'cuenta', bank: 'BHD', last4: '2222' });
  const deb = L.addAccount(s, { name: 'Débito BHD', kind: 'debito', bank: 'BHD', last4: '3333', of: bank.id });
  M.setAccountBalance(s, bank.id, { DOP: 10000 }, '2026-10-18');
  tx(s, { type: 'gasto', amount: 1200, cat: 'super', account: deb.id });
  const b = M.balances(s);
  assert.equal(b[bank.id].DOP, 8800);
  assert.equal(b[deb.id].DOP, 0);
  assert.ok(!M.ownsBalance(s, deb));
});

test('cuenta en dólares: un gasto en pesos se resta convertido', () => {
  const s = fresh();
  const usdAcc = L.addAccount(s, { name: 'Cuenta en dólares', kind: 'cuenta', currency: 'USD' });
  M.setAccountBalance(s, usdAcc.id, { USD: 1000 }, '2026-10-18');
  tx(s, { type: 'gasto', amount: RATE * 10, currency: 'DOP', cat: 'comida', account: usdAcc.id });
  assert.equal(Math.round(M.balances(s)[usdAcc.id].USD * 100) / 100, 990);
});

test('fechas de la tarjeta: último corte, próximo corte y fecha límite', () => {
  const card = { kind: 'tarjeta', cut: 15, due: 10 };
  assert.deepEqual(M.cardCycle(card, '2026-10-19'), { last: '2026-10-15', next: '2026-11-15', due: '2026-11-10', nextDue: '2026-12-10', best: '2026-11-16' });
  // El día de corte el estado todavía está abierto.
  assert.equal(M.cardCycle(card, '2026-10-15').last, '2026-09-15');
  // Corte 31 en febrero = último día; pago el 25 del mismo mes si cae después del corte.
  const c2 = M.cardCycle({ kind: 'tarjeta', cut: 31, due: 25 }, '2027-03-10');
  assert.equal(c2.last, '2027-02-28');
  assert.equal(c2.due, '2027-03-25');
});

test('tarjeta: saldo al corte, consumos del ciclo y cuánto falta pagar (pesos y dólares)', () => {
  const s = fresh();
  const bank = L.addAccount(s, { name: 'Ahorro', kind: 'cuenta', last4: '4444' });
  const card = L.addAccount(s, { name: 'Visa APAP', kind: 'tarjeta', bank: 'APAP', last4: '5555', cut: 15, due: 10, limit: { DOP: 100000, USD: 2000 } });
  M.setAccountBalance(s, bank.id, { DOP: 50000 }, '2026-10-01');
  M.setAccountBalance(s, card.id, { DOP: 0, USD: 0 }, '2026-10-01');
  tx(s, { type: 'gasto', amount: 8000, cat: 'super', account: card.id }, '2026-10-05');
  tx(s, { type: 'gasto', amount: 100, currency: 'USD', cat: 'viajes', account: card.id }, '2026-10-12');
  tx(s, { type: 'gasto', amount: 2000, cat: 'comida', account: card.id }, '2026-10-17');
  let ci = M.cardInfo(s, L.accountOf(s, card.id), D);
  assert.deepEqual(ci.owed, { DOP: 10000, USD: 100 });
  assert.deepEqual(ci.stmt, { DOP: 8000, USD: 100 });
  assert.deepEqual(ci.since, { DOP: 2000, USD: 0 });
  assert.deepEqual(ci.toPay, { DOP: 8000, USD: 100 });
  assert.equal(ci.status, 'due');
  assert.equal(ci.daysToDue, 22);
  assert.equal(ci.avail.DOP, 90000);
  // Pago parcial desde el banco.
  tx(s, { type: 'transfer', amount: 5000, cat: 'pago_tarjeta', account: bank.id, to: card.id }, D);
  ci = M.cardInfo(s, L.accountOf(s, card.id), D);
  assert.equal(ci.toPay.DOP, 3000);
  assert.equal(M.balances(s)[bank.id].DOP, 45000);
  // Lo que dice el estado manda (y el pago ya hecho se descuenta).
  M.setCardStatement(s, card.id, '2026-10-15', { DOP: 8500, USD: 100, minDOP: 1200 });
  ci = M.cardInfo(s, L.accountOf(s, card.id), D);
  assert.equal(ci.toPay.DOP, 3500);
  assert.equal(ci.min.DOP, 1200);
  assert.equal(ci.estimated, false);
  // Vencida si pasa la fecha sin pagar todo.
  assert.equal(M.cardInfo(s, L.accountOf(s, card.id), '2026-11-11').status, 'late');
});

test('pagar el estado completo a tiempo da XP una sola vez, pega al jefe de deudas y cuenta para la insignia', () => {
  const s = fresh();
  const bank = L.addAccount(s, { name: 'Ahorro', kind: 'cuenta', last4: '4444' });
  const card = L.addAccount(s, { name: 'Visa', kind: 'tarjeta', last4: '5555', cut: 15, due: 10 });
  M.setAccountBalance(s, card.id, { DOP: 0 }, '2026-10-01');
  L.startCampaign(s, { area: 'finanzas', goalId: 'deudas', target: 50000 }, '2026-10-01');
  tx(s, { type: 'gasto', amount: 4000, cat: 'super', account: card.id }, '2026-10-10');
  const xp0 = s.attrs.finanzas || 0;
  const ev = [];
  L.addTx(s, { type: 'transfer', amount: 4000, cat: 'pago_tarjeta', account: bank.id, to: card.id, day: D }, D, ev);
  assert.ok(ev.some((e) => e.type === 'cardPaid'));
  assert.ok((s.attrs.finanzas || 0) >= xp0 + 15);
  assert.equal(L.accountOf(s, card.id).paidCuts['2026-10-15'], D);
  const boss = s.bosses.find((b) => b.source === 'debtPay');
  assert.ok(boss.progress >= 4000);
  const ev2 = [];
  L.addTx(s, { type: 'transfer', amount: 100, cat: 'pago_tarjeta', account: bank.id, to: card.id, day: D }, D, ev2);
  assert.ok(!ev2.some((e) => e.type === 'cardPaid'));
});

test('fechas de un pago programado: quincena (15 y último día), cada 2 semanas, anual y una vez', () => {
  const q = { freq: { type: 'month', days: [15, 31] }, start: '2026-01-01' };
  assert.deepEqual(M.planDates(q, '2027-02-01', '2027-03-20'), ['2027-02-15', '2027-02-28', '2027-03-15']);
  const w = { freq: { type: 'week', n: 2, anchor: '2026-10-02' }, start: '2026-10-02' };
  assert.deepEqual(M.planDates(w, '2026-10-19', '2026-11-20'), ['2026-10-30', '2026-11-13']);
  const y = { freq: { type: 'months', n: 12, anchor: '2026-03-15' }, start: '2026-01-01' };
  assert.deepEqual(M.planDates(y, '2026-10-19', '2028-01-01'), ['2027-03-15']);
  const o = { freq: { type: 'once', date: '2026-12-20' }, start: '2026-10-01' };
  assert.deepEqual(M.planDates(o, '2026-10-19', '2026-12-31'), ['2026-12-20']);
  const ended = { freq: { type: 'month', days: [5] }, start: '2026-01-01', until: '2026-11-30' };
  assert.deepEqual(M.planDates(ended, '2026-10-19', '2027-01-31'), ['2026-11-05']);
});

test('un movimiento parecido marca solo el pago programado; borrarlo lo deja pendiente', () => {
  const s = fresh();
  const luz = M.addPlan(s, { kind: 'gasto', name: 'Luz', amount: 2500, cat: 'servicios', variable: true, freq: { type: 'month', days: [22] } }, D);
  const ev = [];
  const t = L.addTx(s, { type: 'gasto', amount: 2900, cat: 'servicios', merchant: 'Edesur', day: D }, D, ev);
  assert.equal(luz.done['2026-10-22'], t.id);
  assert.ok(ev.some((e) => e.type === 'planLinked' && e.name === 'Luz'));
  L.removeTx(s, t.id);
  assert.equal(luz.done['2026-10-22'], undefined);
  // Un monto muy distinto no se liga (salvo que se elija a mano).
  const t2 = tx(s, { type: 'gasto', amount: 9000, cat: 'servicios' });
  assert.equal(luz.done['2026-10-22'], undefined);
  L.addTx(s, { type: 'gasto', amount: 9000, cat: 'servicios', day: D, link: { plan: luz.id, date: '2026-10-22' } }, D, []);
  assert.ok(luz.done['2026-10-22'] && luz.done['2026-10-22'] !== t2.id);
});

test('pagar a tiempo da XP; tarde, no', () => {
  const s = fresh();
  const net = M.addPlan(s, { kind: 'gasto', name: 'Internet', amount: 1800, cat: 'telecom', freq: { type: 'month', days: [20] } }, D);
  const gold0 = s.gold;
  L.addTx(s, { type: 'gasto', amount: 1800, cat: 'telecom', day: D, link: { plan: net.id, date: '2026-10-20' } }, D, []);
  assert.equal(s.gold, gold0 + 2);
  const late = M.addPlan(s, { kind: 'gasto', name: 'Gimnasio', amount: 1500, cat: 'deporte', freq: { type: 'month', days: [10] } }, D);
  const gold1 = s.gold;
  L.addTx(s, { type: 'gasto', amount: 1500, cat: 'deporte', day: D, link: { plan: late.id, date: '2026-10-10' } }, D, []);
  assert.equal(s.gold, gold1);
  assert.ok(late.done['2026-10-10']);
});

test('apartado: cuánto guardar por mes para un pago que no es mensual', () => {
  const s = fresh();
  const seg = M.addPlan(s, { kind: 'gasto', name: 'Seguro del carro', amount: 24000, cat: 'seguros', freq: { type: 'months', n: 12, anchor: '2027-03-15' } }, D);
  let f = M.fundInfo(s, seg, D);
  assert.equal(f.next, '2027-03-15');
  assert.equal(f.months, 5);
  assert.equal(f.perMonth, 4800);
  M.addToFund(s, seg.id, 4800);
  f = M.fundInfo(s, seg, D);
  assert.equal(f.need, 19200);
  assert.equal(f.perMonth, 3840);
  // Al pagarlo, lo apartado se usa.
  L.addTx(s, { type: 'gasto', amount: 24000, cat: 'seguros', day: '2027-03-14', link: { plan: seg.id, date: '2027-03-15' } }, '2027-03-14', []);
  assert.equal(seg.fund.saved, 0);
});

test('hasta tu próximo cobro: pagos antes de cobrar y cuánto queda por día', () => {
  const s = fresh();
  const bank = L.addAccount(s, { name: 'Nómina', kind: 'cuenta', last4: '6666' });
  M.setAccountBalance(s, bank.id, { DOP: 30000 }, '2026-10-18');
  M.addPlan(s, { kind: 'ingreso', name: 'Quincena', amount: 45000, cat: 'salario', account: bank.id, freq: { type: 'month', days: [15, 31] } }, '2026-10-01');
  M.addPlan(s, { kind: 'gasto', name: 'Alquiler', amount: 18000, cat: 'vivienda', account: bank.id, freq: { type: 'month', days: [25] } }, '2026-10-01');
  const col = M.addPlan(s, { kind: 'gasto', name: 'Colegio', amount: 9000, cat: 'educacion', account: bank.id, freq: { type: 'month', days: [5] } }, '2026-10-01');
  // El colegio de octubre sigue pendiente (vencido): cuenta como pago antes del cobro.
  assert.equal(M.untilPayday(s, D).pay, 27000);
  M.skipPlanDate(s, col.id, '2026-10-05');
  const u = M.untilPayday(s, D);
  assert.equal(u.next.date, '2026-10-31');
  assert.equal(u.days, 12);
  assert.equal(u.pay, 18000);
  assert.equal(u.free, 12000);
  assert.equal(u.perDay, 1000);
});

test('flujo: saldo día a día y el punto más bajo', () => {
  const s = fresh();
  const bank = L.addAccount(s, { name: 'Nómina', kind: 'cuenta', last4: '6666' });
  M.setAccountBalance(s, bank.id, { DOP: 10000 }, '2026-10-18');
  M.addPlan(s, { kind: 'gasto', name: 'Alquiler', amount: 18000, cat: 'vivienda', account: bank.id, freq: { type: 'month', days: [25] } }, '2026-10-01');
  M.addPlan(s, { kind: 'ingreso', name: 'Quincena', amount: 45000, cat: 'salario', account: bank.id, freq: { type: 'month', days: [31] } }, '2026-10-01');
  const f = M.forecast(s, D, 30);
  assert.equal(f.start, 10000);
  assert.deepEqual(f.low, { bal: -8000, date: '2026-10-25' });
  assert.equal(f.points.find((p) => p.day === '2026-10-31').bal, 37000);
});

test('presupuesto: lo que sobra pasa al mes siguiente y el ritmo del mes', () => {
  const s = fresh('2026-08-01');
  L.setBudget(s, 'comida', 6000, '2026-08-01');
  M.setRollover(s, 'comida', true, '2026-08-01');
  tx(s, { type: 'gasto', amount: 4000, cat: 'comida' }, '2026-08-10');
  tx(s, { type: 'gasto', amount: 7000, cat: 'comida' }, '2026-09-10');
  L.setBudget(s, 'comida', 8000, '2026-10-02');
  tx(s, { type: 'gasto', amount: 1000, cat: 'comida' }, '2026-10-05');
  const row = M.budgetRows(s, '2026-10', D).find((r) => r.c.id === 'comida');
  // Agosto: sobran 2,000; septiembre: faltan 1,000 → pasan +1,000 a octubre.
  assert.equal(row.carry, 1000);
  assert.equal(row.budget, 8000);
  assert.equal(row.avail, 9000);
  assert.equal(row.left, 8000);
  assert.equal(row.pace, Math.round(9000 * 19 / 31 * 100) / 100);
  // Septiembre usaba el presupuesto de entonces (6,000).
  assert.equal(M.budgetFor(s, L.catOf(s, 'comida'), '2026-09'), 6000);
  // Al abrir la app (puesta al día de datos) se conserva.
  L.ensureMoney(s);
  assert.equal(M.budgetRows(s, '2026-10', D).find((r) => r.c.id === 'comida').carry, 1000);
});

test('aviso al pasar el 80 % y el 100 % del presupuesto', () => {
  const s = fresh();
  L.setBudget(s, 'ocio', 1000, D);
  const ev = [];
  L.addTx(s, { type: 'gasto', amount: 850, cat: 'ocio', day: D }, D, ev);
  assert.ok(ev.some((e) => e.type === 'budget' && e.level === 80));
  const ev2 = [];
  L.addTx(s, { type: 'gasto', amount: 200, cat: 'ocio', day: D }, D, ev2);
  assert.ok(ev2.some((e) => e.type === 'budget' && e.level === 100));
});

test('plan del mes: ingresos − pagos fijos − apartados − gastos del día a día', () => {
  const s = fresh();
  const q = M.addPlan(s, { kind: 'ingreso', name: 'Quincena', amount: 40000, cat: 'salario', freq: { type: 'month', days: [15, 31] } }, '2026-10-01');
  M.addPlan(s, { kind: 'gasto', name: 'Alquiler', amount: 20000, cat: 'vivienda', freq: { type: 'month', days: [25] } }, '2026-10-01');
  M.addPlan(s, { kind: 'gasto', name: 'Marbete', amount: 3000, cat: 'impuestos', freq: { type: 'months', n: 12, anchor: '2027-01-31' } }, '2026-10-01');
  L.addTx(s, { type: 'ingreso', amount: 40000, cat: 'salario', day: '2026-10-15', link: { plan: q.id, date: '2026-10-15' } }, D, []);
  tx(s, { type: 'gasto', amount: 6000, cat: 'super' }, '2026-10-16');
  const mp = M.monthPlan(s, '2026-10', D);
  assert.equal(mp.income, 80000);
  assert.equal(mp.got, 40000);
  assert.equal(mp.fixed, 20000);
  assert.equal(mp.funds, 1000);
  assert.equal(mp.variable, 6000);
  assert.equal(mp.left, 53000);
  assert.equal(mp.daysLeft, 13);
});

test('lo que toca pagar: pendientes, vencidos y el pago de la tarjeta', () => {
  const s = fresh();
  const card = L.addAccount(s, { name: 'Visa', kind: 'tarjeta', last4: '5555', cut: 15, due: 25 });
  M.setAccountBalance(s, card.id, { DOP: 0 }, '2026-10-01');
  tx(s, { type: 'gasto', amount: 3000, cat: 'super', account: card.id }, '2026-10-10');
  M.addPlan(s, { kind: 'gasto', name: 'Agua', amount: 600, cat: 'servicios', freq: { type: 'month', days: [12] } }, '2026-10-01');
  const items = M.dueItems(s, D, '2026-10-31', D);
  const agua = items.find((i) => i.type === 'plan');
  assert.equal(agua.status, 'late');
  const pay = items.find((i) => i.type === 'card' && !i.estimate);
  assert.equal(pay.date, '2026-10-25');
  assert.equal(pay.dop, 3000);
});

test('datos viejos: el pago de tarjeta guardado con la tarjeta como cuenta pasa a «hacia la tarjeta»', () => {
  const s = fresh();
  const card = L.addAccount(s, { name: 'Visa', kind: 'tarjeta', last4: '5555' });
  s.money.tx.push({ id: 'old1', day: '2026-10-10', kind: 'transfer', amount: -5000, currency: 'DOP', orig: 5000, rate: RATE, cat: 'pago_tarjeta', merchant: 'Pago de tarjeta', account: card.id, created: 1 });
  s.money.tx.push({ id: 'old2', day: '2026-10-10', kind: 'transfer', amount: -2000, currency: 'DOP', orig: 2000, rate: RATE, cat: 'retiro', merchant: 'Retiro', account: '', created: 2 });
  L.ensureMoney(s);
  const t1 = s.money.tx.find((t) => t.id === 'old1');
  assert.equal(t1.to, card.id);
  assert.equal(t1.account, '');
  assert.equal(s.money.tx.find((t) => t.id === 'old2').to, 'efectivo');
  assert.deepEqual(s.money.plans, []);
});

test('totales: lo que tienes, lo que debes y el neto', () => {
  const s = fresh();
  const bank = L.addAccount(s, { name: 'Ahorro', kind: 'cuenta', last4: '4444' });
  const usdAcc = L.addAccount(s, { name: 'Dólares', kind: 'cuenta', currency: 'USD', last4: '7777' });
  const card = L.addAccount(s, { name: 'Visa', kind: 'tarjeta', last4: '5555' });
  M.setAccountBalance(s, bank.id, { DOP: 20000 }, D);
  M.setAccountBalance(s, usdAcc.id, { USD: 100 }, D);
  M.setAccountBalance(s, card.id, { DOP: 5000, USD: 50 }, D);
  const t = M.moneyTotals(s, D);
  assert.deepEqual(t.have, { DOP: 20000, USD: 100 });
  assert.deepEqual(t.owe, { DOP: 5000, USD: 50 });
  assert.equal(t.liquid, Math.round((20000 + 100 * RATE) * 100) / 100);
  assert.equal(t.net, Math.round((20000 + 100 * RATE - 5000 - 50 * RATE) * 100) / 100);
  assert.ok(t.ready);
});

test('pagos que se repiten: uno por mes, monto y día parecidos; el súper de cada semana no', () => {
  const s = fresh();
  const bank = L.addAccount(s, { name: 'Ahorro Popular', kind: 'cuenta', bank: 'Popular', last4: '1111' });
  for (const [day, amount] of [['2026-07-12', 520], ['2026-08-12', 520], ['2026-09-13', 520], ['2026-10-12', 520]]) {
    tx(s, { type: 'gasto', amount, cat: 'suscripciones', merchant: 'Netflix', account: bank.id }, day);
  }
  for (const day of ['2026-09-30', '2026-10-01']) tx(s, { type: 'gasto', amount: 2600, cat: 'servicios', merchant: 'Edesur', account: bank.id }, day);
  // Súper: cada semana, no es un pago fijo.
  for (const day of ['2026-09-05', '2026-09-12', '2026-09-19', '2026-10-03', '2026-10-10', '2026-10-17']) tx(s, { type: 'gasto', amount: 3000, cat: 'super', merchant: 'Supermercado Nacional', account: bank.id }, day);
  // Monto muy distinto: no.
  tx(s, { type: 'gasto', amount: 900, cat: 'comida', merchant: 'Pizzería', account: bank.id }, '2026-09-08');
  tx(s, { type: 'gasto', amount: 3100, cat: 'comida', merchant: 'Pizzería', account: bank.id }, '2026-10-08');
  const sug = M.recurringSuggestions(s, D);
  const names = sug.map((r) => r.name);
  assert.ok(names.includes('Netflix'), names.join());
  assert.ok(names.includes('Edesur'), names.join()); // 30 de septiembre y 1 de octubre: el mismo momento del mes
  assert.ok(!names.includes('Supermercado Nacional'));
  assert.ok(!names.includes('Pizzería'));
  const nf = sug.find((r) => r.name === 'Netflix');
  assert.equal(nf.count, 4);
  assert.equal(nf.day, 12);
  assert.equal(nf.kind, 'gasto');
  // Al agregarlo al plan o descartarlo, ya no se sugiere.
  M.addPlan(s, { kind: 'gasto', name: 'Netflix', amount: 520, cat: 'suscripciones', freq: { type: 'month', days: [12] } }, D);
  M.dismissRecurring(s, 'gasto:edesur');
  assert.deepEqual(M.recurringSuggestions(s, D).map((r) => r.name), []);
});

test('«pagué … a la tarjeta»: la tarjeta por sus últimos 4, su nombre o la única que hay', () => {
  const s = fresh();
  assert.equal(M.cardForText(s, 'pagué 5000 a la tarjeta'), null);
  const visa = L.addAccount(s, { name: 'Visa APAP', kind: 'tarjeta', bank: 'APAP', last4: '2899' });
  assert.equal(M.cardForText(s, 'pagué 5000 a la tarjeta').id, visa.id);
  const mc = L.addAccount(s, { name: 'Mastercard Popular', kind: 'tarjeta', bank: 'Popular', last4: '3108' });
  assert.equal(M.cardForText(s, 'pagué 5000 a la tarjeta'), null); // dos tarjetas: no adivina
  assert.equal(M.cardForText(s, 'pagué 5000 a la tarjeta del popular').id, mc.id);
  assert.equal(M.cardForText(s, 'abono de 3000 a la 2899').id, visa.id);
});
