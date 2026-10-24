import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/game/logic.js';
import * as M from '../src/game/money.js';
import * as C from '../src/game/credits.js';
import * as A from '../src/game/assets.js';
import * as W from '../src/game/worth.js';
import * as Db from '../src/game/debts.js';
import { buildReminders } from '../src/game/reminders.js';
import { buildTables } from '../src/game/tables.js';
import { mergeStates } from '../src/game/merge.js';
import { migrate } from '../src/app/store.js';

const D = '2026-10-24';
function fresh(day = D) {
  const s = L.defaultState(day);
  s.profile.onboarded = true;
  s.money.fx.manual = 60;
  s.money.accounts.push({ id: 'ban', name: 'Banco', kind: 'cuenta', bank: 'APAP', last4: '1234', base: { day: '2026-10-01', DOP: 200000, USD: 0, ts: 0 } });
  return s;
}
// Préstamo de 100,000 al 18 % anual en 12 cuotas de 9,168, con 300 de seguro; la primera cuota vence el 27 de octubre.
const car = (s, p = {}) => C.addCredit(s, { name: 'Préstamo del carro', kind: 'vehiculo', lender: 'Banco X', principal: 100000, apr: 18, term: 12, start: '2026-09-27', first: '2026-10-27', fee: 300, account: 'ban', ...p }, D, []);

// ---------- Matemática ----------

test('la cuota fija sale del sistema francés: 100,000 al 18 % en 12 cuotas = 9,168', () => {
  assert.equal(C.annuity(100000, 0.18 / 12, 12), 9168);
  assert.equal(C.annuity(120000, 0, 12), 10000);
  assert.equal(C.suggestPayment({ principal: 100000, apr: 18, term: 12, freq: 'mes' }), 9168);
  // Cada 2 semanas: 26 cuotas al año.
  assert.ok(C.suggestPayment({ principal: 100000, apr: 18, term: 26, freq: '2sem' }) > 4000);
});

test('las fechas de las cuotas: el mismo día cada mes, y el 31 pasa al último día del mes corto', () => {
  const c = { freq: 'mes', first: '2026-01-31' };
  assert.equal(C.dueDateOf(c, 1), '2026-01-31');
  assert.equal(C.dueDateOf(c, 2), '2026-02-28');
  assert.equal(C.dueDateOf(c, 3), '2026-03-31');
  assert.equal(C.dueDateOf({ freq: '2sem', first: '2026-10-02' }, 3), '2026-10-30');
  assert.equal(C.dueDateOf({ freq: 'sem', first: '2026-10-02' }, 2), '2026-10-09');
});

test('pagar las 12 cuotas deja el préstamo en cero y cerrado, con los intereses de la tabla', () => {
  const s = fresh();
  const c = car(s);
  assert.equal(c.payment, 9168);
  for (let k = 1; k <= 12; k++) C.payCredit(s, c.id, { amount: c.payment + c.fee, day: C.dueDateOf(c, k) }, D, []);
  const i = C.creditInfo(c, D);
  assert.equal(i.balance, 0);
  assert.equal(i.open, false);
  assert.ok(c.closed);
  assert.ok(Math.abs(i.paidInterest - 10016) < 1);
  assert.equal(i.paidFee, 3600);
  assert.ok(Math.abs(i.paidPrincipal - 100000) < 0.01);
});

test('cada cuota separa intereses, seguro y capital; el primer mes son 1,500 de intereses', () => {
  const s = fresh();
  const c = car(s);
  C.payCredit(s, c.id, { amount: 9468, day: '2026-10-27' }, D, []);
  const r = C.creditLedger(c).rows[0];
  assert.equal(r.interest, 1500);
  assert.equal(r.fee, 300);
  assert.equal(r.principal, 7668);
  assert.equal(r.balance, 92332);
});

// ---------- Estado, atrasos y próxima cuota ----------

test('estado: próxima cuota, «pronto» y atraso con días y cuotas', () => {
  const s = fresh();
  const c = car(s);
  let i = C.creditInfo(c, D);
  assert.equal(i.status, 'soon');
  assert.equal(i.next.date, '2026-10-27');
  assert.equal(i.nextAmount, 9468);
  assert.equal(i.behind, 0);
  i = C.creditInfo(c, '2026-12-01');
  assert.equal(i.status, 'late');
  assert.equal(i.behind, 2);
  assert.equal(i.daysLate, 35);
  assert.equal(C.creditInfo(c, '2026-10-27').status, 'today');
});

test('un préstamo que ya venía pagándose: cuotas pagadas y saldo del banco ajustan el calendario', () => {
  const s = fresh();
  const c = C.addCredit(s, { name: 'Hipoteca', kind: 'hipoteca', principal: 3000000, apr: 9, term: 240, start: '2024-03-10', first: '2024-04-10' }, D, []);
  const n = C.dueCount(c, D);
  assert.equal(n, 31);
  assert.equal(C.creditInfo(c, D).behind, 31);
  const bal = C.scheduledBalance(c, n);
  C.syncCredit(s, c.id, bal, D, D, { paid: n });
  const i = C.creditInfo(c, D);
  assert.equal(i.behind, 0);
  assert.equal(i.nPaid, 31);
  assert.equal(i.next.n, 32);
  assert.equal(i.next.date, '2026-11-10');
  assert.equal(i.balance, bal);
  assert.ok(i.balance < 3000000 && i.balance > 2800000);
});

test('«cuadrar con el banco» cambia el saldo desde ese día y se puede quitar', () => {
  const s = fresh();
  const c = car(s);
  C.payCredit(s, c.id, { amount: 9468, day: '2026-10-27' }, D, []);
  const sy = C.syncCredit(s, c.id, 90000, '2026-10-28', D);
  assert.equal(C.creditInfo(c, D).balance, 90000);
  C.removeSync(s, c.id, sy.id);
  assert.equal(C.creditInfo(c, D).balance, 92332);
});

// ---------- Abonos a capital ----------

test('un abono a capital baja el saldo y acorta el plazo; el simulador dice cuánto ahorras', () => {
  const s = fresh();
  const c = car(s);
  const base = C.creditProject(c);
  assert.equal(base.left, 12);
  const w = C.creditWhatIf(c, { extra: 2000 });
  assert.equal(w.cuotas, 2);
  assert.ok(w.interest > 1000);
  const w2 = C.creditWhatIf(c, { lump: 20000 });
  assert.ok(w2.cuotas >= 2 && w2.interest > 1500);
  C.payCredit(s, c.id, { amount: 20000, kind: 'abono', day: D }, D, []);
  const i = C.creditInfo(c, D);
  assert.equal(i.balance, 80000);
  assert.ok(i.nLeft < 12);
});

test('si el abono baja la cuota (en vez del plazo), el plazo se queda y la cuota baja', () => {
  const s = fresh();
  const c = car(s, { reduce: 'cuota' });
  C.payCredit(s, c.id, { amount: 30000, kind: 'abono', day: D }, D, []);
  const p = C.creditProject(c);
  assert.equal(p.left, 12);
  assert.ok(p.payment < 9168 * 0.8);
});

test('saldar hoy: capital, intereses desde el último pago y cargo por cancelar antes', () => {
  const s = fresh();
  const c = car(s, { prepay: 2 });
  C.payCredit(s, c.id, { amount: 9468, day: '2026-10-27' }, '2026-10-27', []);
  const i = C.creditInfo(c, '2026-11-10');
  assert.equal(i.payoff.balance, 92332);
  assert.ok(i.payoff.accrued > 600 && i.payoff.accrued < 700);
  assert.equal(i.payoff.fee, 1846.64);
  assert.equal(i.payoff.total, r2(92332 + i.payoff.accrued + 1846.64));
});
const r2 = (n) => Math.round(n * 100) / 100;

test('si la cuota no alcanza ni para los intereses, el plan avisa que no termina', () => {
  const s = fresh();
  const c = car(s, { payment: 1000 });
  const p = C.creditProject(c);
  assert.equal(p.ok, false);
  assert.equal(C.creditInfo(c, D).ok, false);
});

// ---------- Pagos, movimientos y premios ----------

test('pagar con una cuenta anota un gasto en «Pago de deuda», una sola vez, y premia pagar a tiempo', () => {
  const s = fresh();
  const c = car(s);
  const ev = [];
  const xp0 = s.xp;
  const pay = C.payCredit(s, c.id, { amount: 9468, day: D, account: 'ban' }, D, ev);
  assert.ok(pay.tx);
  const t = s.money.tx.find((x) => x.id === pay.tx);
  assert.equal(t.cat, 'deuda');
  assert.equal(t.merchant, 'Cuota de Préstamo del carro');
  assert.equal(c.pays.length, 1);
  assert.equal(s.money.tx.filter((x) => x.cat === 'deuda').length, 1);
  assert.ok(ev.some((e) => e.type === 'creditPaid' && e.onTime));
  assert.ok(s.xp > xp0);
});

test('el jefe de deudas recibe solo el capital que pagaste, no los intereses ni el seguro', () => {
  const s = fresh();
  const b = L.createBoss(s, { title: 'Libre de deudas', area: 'finanzas', money: true, target: 100000, source: 'debtPay', unit: 'RD$' }, D);
  const c = car(s);
  C.payCredit(s, c.id, { amount: 9468, day: D, account: 'ban' }, D, []);
  assert.equal(b.progress, 7668);
});

test('un pago de deuda parecido a la cuota se liga solo; uno distinto no', () => {
  const s = fresh();
  const c = car(s);
  const ev = [];
  const t = L.addTx(s, { type: 'gasto', amount: 9400, cat: 'deuda', merchant: 'Pago préstamo', account: 'ban', day: D }, D, ev);
  assert.equal(c.pays.length, 1);
  assert.equal(C.creditForTx(s, t.id).pay.kind, 'cuota');
  const c2 = car(fresh(), {});
  const s2 = fresh();
  const k2 = car(s2);
  L.addTx(s2, { type: 'gasto', amount: 1500, cat: 'deuda', merchant: 'Tarjeta Visa', account: 'ban', day: D }, D, []);
  assert.equal(k2.pays.length, 0);
  assert.ok(c2);
});

test('borrar o corregir el movimiento de una cuota actualiza el préstamo', () => {
  const s = fresh();
  const c = car(s);
  const pay = C.payCredit(s, c.id, { amount: 9468, day: D, account: 'ban' }, D, []);
  L.updateTx(s, pay.tx, { amount: 9000 });
  assert.equal(c.pays[0].amount, 9000);
  L.removeTx(s, pay.tx);
  assert.equal(c.pays.length, 0);
  assert.equal(C.creditInfo(c, D).balance, 100000);
});

test('«Pagar» desde Por pagar liga el movimiento a la cuota (link.credit)', () => {
  const s = fresh();
  const c = car(s);
  const it = M.dueItems(s, D, '2026-11-30', D).find((x) => x.type === 'credit');
  assert.equal(it.c.id, c.id);
  assert.equal(it.n, 1);
  L.addTx(s, { type: 'gasto', amount: it.amount, cat: 'deuda', merchant: 'Lo que sea', account: 'ban', day: D, link: { credit: c.id, date: it.date, name: c.name } }, D, []);
  assert.equal(c.pays.length, 1);
  assert.equal(C.creditInfo(c, D).next.n, 2);
});

test('no se anota dos veces el mismo movimiento como pago', () => {
  const s = fresh();
  const c = car(s);
  const t = L.addTx(s, { type: 'gasto', amount: 9468, cat: 'deuda', merchant: 'Préstamo', account: 'ban', day: D }, D, []);
  assert.equal(c.pays.length, 1);
  assert.equal(C.payCredit(s, c.id, { tx: t.id }, D, []), null);
  assert.equal(c.pays.length, 1);
});

// ---------- Calendario, plan del mes y proyección ----------

test('las cuotas aparecen en «Por pagar» y en el flujo de los próximos días', () => {
  const s = fresh();
  car(s);
  const items = M.dueItems(s, D, '2026-12-31', D).filter((x) => x.type === 'credit');
  assert.deepEqual(items.map((x) => x.date), ['2026-10-27', '2026-11-27', '2026-12-27']);
  assert.equal(items[0].status, 'soon');
  const fc = M.forecast(s, D, 60);
  assert.ok(fc.end < fc.start - 9468 * 2 + 1);
});

test('el plan del mes cuenta la cuota como pago fijo; pagarla no la duplica como gasto del día a día', () => {
  const s = fresh();
  const c = car(s);
  let mp = M.monthPlan(s, '2026-10', D);
  assert.equal(mp.fixed, 9468);
  assert.equal(mp.fixedPaid, 0);
  C.payCredit(s, c.id, { amount: 9468, day: D, account: 'ban' }, D, []);
  mp = M.monthPlan(s, '2026-10', D);
  assert.equal(mp.fixed, 9468);
  assert.equal(mp.fixedPaid, 9468);
  assert.equal(mp.variable, 0);
});

test('antes de cobrar, la cuota cuenta en lo que tienes que pagar', () => {
  const s = fresh();
  car(s);
  M.addPlan(s, { kind: 'ingreso', name: 'Sueldo', amount: 50000, cat: 'salario', freq: { type: 'month', days: [30] } }, D);
  const pay = M.untilPayday(s, D);
  assert.equal(pay.items.length, 1);
  assert.equal(pay.pay, 9468);
});

// ---------- Patrimonio, deudas, avisos ----------

test('el patrimonio resta lo que debes del préstamo y suma el valor de tus bienes', () => {
  const s = fresh();
  const c = car(s);
  const w0 = W.worthAt(s, D);
  assert.equal(w0.credits, 100000);
  const a = A.addAsset(s, { name: 'Mi carro', kind: 'vehiculo', value: 450000, credit: c.id, since: '2026-09-27' }, D);
  const w1 = W.worthAt(s, D);
  assert.equal(w1.assets, 450000);
  assert.equal(w1.net, w0.net + 450000);
  const info = A.assetInfo(s, a, D);
  assert.equal(info.equity, 350000);
  // Un valor nuevo no cambia el pasado.
  A.updateAsset(s, a.id, { value: 400000 }, D);
  assert.equal(A.assetValueAt(a, '2026-10-01'), 450000);
  assert.equal(A.assetValueAt(a, D), 400000);
  assert.equal(A.assetValueAt(a, '2026-09-01'), 0);
});

test('«Salir de deudas» incluye tus préstamos con su tasa y su cuota, y se pueden dejar fuera', () => {
  const s = fresh();
  const c = car(s);
  let list = Db.debtList(s, D);
  const x = list.find((d) => d.kind === 'credit');
  assert.equal(x.balance, 100000);
  assert.equal(x.apr, 18);
  assert.equal(x.min, 9168);
  Db.saveDebt(s.money.debts ? s : s, { kind: 'credit', credit: c.id, on: false });
  list = Db.debtList(s, D);
  assert.equal(list.find((d) => d.kind === 'credit').on, false);
});

test('avisos: la cuota avisa tres días antes (o los días que pongas) y el mismo día', () => {
  const s = fresh();
  car(s);
  s.settings.notify.on = true;
  const r = buildReminders(s, new Date('2026-10-24T06:00:00'), D).filter((x) => x.kind === 'pagos');
  assert.ok(r.some((x) => /cuota de Préstamo del carro vence en 3 días/.test(x.title)));
  const r2d = buildReminders(s, new Date('2026-10-26T06:00:00'), '2026-10-26').filter((x) => x.kind === 'pagos');
  assert.ok(r2d.some((x) => /vence mañana/.test(x.title)));
});

test('costos: intereses y seguros pagados en un período', () => {
  const s = fresh();
  const c = car(s);
  C.payCredit(s, c.id, { amount: 9468, day: '2026-10-27' }, D, []);
  C.payCredit(s, c.id, { amount: 9468, day: '2026-11-27' }, D, []);
  const k = C.creditCosts(s, '2026-10-01', '2026-10-31');
  assert.equal(k.interest, 1500);
  assert.equal(k.fees, 300);
  assert.equal(k.n, 1);
});

// ---------- Datos viejos, fusión, Drive ----------

test('los datos de la 1.10 pasan a la 1.11 sin perder nada y con las listas nuevas', () => {
  const s = fresh();
  delete s.money.credits;
  delete s.money.assets;
  const out = migrate(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(out.money.credits, []);
  assert.deepEqual(out.money.assets, []);
  assert.equal(out.money.accounts.length, s.money.accounts.length);
});

test('dos equipos que anotan pagos distintos del mismo préstamo se juntan', () => {
  const base = fresh();
  const c = car(base);
  const a = JSON.parse(JSON.stringify(base));
  const b = JSON.parse(JSON.stringify(base));
  C.payCredit(a, c.id, { amount: 9468, day: '2026-10-27' }, D, []);
  C.payCredit(b, c.id, { amount: 9468, day: '2026-11-27' }, D, []);
  const m = mergeStates(base, a, b);
  assert.equal(m.money.credits.find((x) => x.id === c.id).pays.length, 2);
});

test('las tablas de Drive traen préstamos, cuotas y bienes', () => {
  const s = fresh();
  const c = car(s);
  C.payCredit(s, c.id, { amount: 9468, day: '2026-10-27' }, D, []);
  A.addAsset(s, { name: 'Solar', kind: 'terreno', value: 1200000 }, D);
  const t = buildTables(s, D);
  assert.equal(t['Préstamos del banco'].length, 2);
  assert.equal(t['Préstamos del banco'][1][0], 'Préstamo del carro');
  assert.ok(t.Cuotas.length > 12);
  assert.equal(t.Cuotas[1][9], 'Pagada');
  assert.equal(t.Bienes.length, 2);
});

test('lo que se va en deudas cuenta la cuota completa (con seguro) y el fondo de emergencia mide los ahorros', async () => {
  const S = await import('../src/game/stats.js');
  const s = fresh();
  car(s);
  M.addPlan(s, { kind: 'ingreso', name: 'Sueldo', amount: 50000, cat: 'salario', freq: { type: 'month', days: [30] } }, D);
  const d = S.debtLoad(s, D);
  assert.equal(d.commitments, 9468);
  assert.equal(d.owe, 100000);
  assert.ok(Math.abs(d.dti - 9468 / 50000) < 0.001);
  const e = S.emergencyFund(s, D);
  assert.equal(e.ready, false);
  assert.equal(S.subscriptionStats(s, D).perMonth, 0);
  const lc = S.loanCosts(s, { from: '2026-10-01', to: '2026-10-31' });
  assert.equal(lc.n, 0);
});
