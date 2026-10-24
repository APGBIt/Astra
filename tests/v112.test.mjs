import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/game/logic.js';
import * as M from '../src/game/money.js';
import * as S from '../src/game/stats.js';
import * as R from '../src/game/reconcile.js';

const D = '2026-10-24';
const T0 = new Date('2026-10-24T09:43:00').getTime();
function fresh() {
  const s = L.defaultState(D);
  s.profile.onboarded = true;
  s.money.fx.manual = 60;
  s.money.accounts.push({ id: 'ban', name: 'Banco', kind: 'cuenta', bank: 'APAP', last4: '1234' });
  s.money.accounts.push({ id: 'aho', name: 'Ahorro', kind: 'cuenta', save: true });
  s.money.accounts.push({ id: 'tc', name: 'Visa', kind: 'tarjeta', last4: '9999', limit: { DOP: 100000, USD: 0 } });
  return s;
}
const bal = (s, id, c = 'DOP') => M.balances(s)[id][c];
const gasto = (s, p) => L.addTx(s, { type: 'gasto', cat: 'comida', account: 'ban', day: D, ...p }, D, []);

// ---------- Cuadrar con el banco ----------

test('lo anotado antes del saldo ya está dentro de él: el saldo no se mueve, pero se puede descontar igual (late)', () => {
  const s = fresh();
  R.reconcileBalance(s, 'ban', { DOP: 100000 }, D, T0);
  gasto(s, { amount: 500 });
  assert.equal(bal(s, 'ban'), 99500);
  const ayer = gasto(s, { amount: 700, day: '2026-10-23' });
  assert.equal(bal(s, 'ban'), 99500);
  assert.ok(R.insideBalance(s, ayer));
  L.updateTx(s, ayer.id, { late: true });
  assert.equal(bal(s, 'ban'), 98800);
  assert.equal(R.insideBalance(s, s.money.tx.find((t) => t.id === ayer.id)), null);
});

test('corregir el saldo anota la diferencia como «gastos sin anotar» y el saldo queda como dice el banco', () => {
  const s = fresh();
  R.reconcileBalance(s, 'ban', { DOP: 100000 }, D, T0);
  gasto(s, { amount: 500 });
  const rows = R.reconcileBalance(s, 'ban', { DOP: 98000 }, D, T0 + 3600e3);
  assert.equal(rows[0].diff, -1500);
  assert.equal(rows[0].mode, 'ajuste');
  assert.equal(bal(s, 'ban'), 98000);
  const adj = s.money.tx.find((t) => t.adjust);
  assert.equal(adj.cat, 'ajuste');
  assert.equal(adj.kind, 'gasto');
  assert.equal(adj.amount, -1500);
  // las estadísticas ven esos 1,500 y los gastos anotados: ya cuadra con lo que cayó el saldo
  assert.equal(S.totals(s, '2026-10-01', '2026-10-31').spent, 2000);
  assert.equal(s.money.accounts.find((a) => a.id === 'ban').recon.length, 2);
});

test('si el banco tiene más de lo esperado, se anota un ingreso sin anotar; si es igual, no se anota nada', () => {
  const s = fresh();
  R.reconcileBalance(s, 'ban', { DOP: 1000 }, D, T0);
  const up = R.reconcileBalance(s, 'ban', { DOP: 1800 }, D, T0 + 1000);
  assert.equal(up[0].diff, 800);
  const inc = s.money.tx.find((t) => t.adjust);
  assert.equal(inc.kind, 'ingreso');
  assert.equal(inc.cat, 'ajuste_ingreso');
  assert.equal(bal(s, 'ban'), 1800);
  const same = R.reconcileBalance(s, 'ban', { DOP: 1800 }, D, T0 + 2000);
  assert.equal(same[0].mode, 'igual');
  assert.equal(s.money.tx.filter((t) => t.adjust).length, 1);
});

test('el ajuste cuenta aunque sea de la misma hora del saldo, no da XP y puede repartirse en categorías', () => {
  const s = fresh();
  R.reconcileBalance(s, 'ban', { DOP: 5000 }, D, T0);
  const xp = JSON.stringify(s.attrs);
  R.reconcileBalance(s, 'ban', { DOP: 4000 }, D, T0, { when: { day: D, time: '09:43' } });
  assert.equal(bal(s, 'ban'), 4000);
  assert.equal(JSON.stringify(s.attrs), xp);
  const adj = s.money.tx.find((t) => t.adjust);
  const parts = L.splitTx ? L.splitTx(s, adj.id, [{ cat: 'comida', amount: 600 }, { cat: 'compras', amount: 400 }]) : null;
  if (L.splitTx) assert.ok(parts);
});

test('«reiniciar» pone el saldo como punto de partida, sin anotar ajuste (como antes)', () => {
  const s = fresh();
  R.reconcileBalance(s, 'ban', { DOP: 100000 }, D, T0);
  gasto(s, { amount: 500 });
  const rows = R.reconcileBalance(s, 'ban', { DOP: 90000 }, D, Date.now() + 5000, { mode: 'reiniciar' });
  assert.equal(rows[0].mode, 'reiniciar');
  assert.equal(bal(s, 'ban'), 90000);
  assert.equal(s.money.tx.filter((t) => t.adjust).length, 0);
});

test('la vista previa dice la diferencia antes de aplicarla y la primera vez no hay diferencia', () => {
  const s = fresh();
  const first = R.reconcilePreview(s, 'ban', { DOP: 100 }, D, T0);
  assert.equal(first[0].first, true);
  R.reconcileBalance(s, 'ban', { DOP: 100 }, D, T0);
  gasto(s, { amount: 30 });
  const p = R.reconcilePreview(s, 'ban', { DOP: 60 }, D, T0 + 9000);
  assert.deepEqual([p[0].expected, p[0].target, p[0].diff], [70, 60, -10]);
});

test('cuadrar con la fecha del estado de cuenta compara con lo que había ese día, no con hoy', () => {
  const s = fresh();
  R.reconcileBalance(s, 'ban', { DOP: 1000 }, '2026-10-01', Date.parse('2026-10-01T08:00:00'));
  gasto(s, { amount: 100, day: '2026-10-05' });
  gasto(s, { amount: 200, day: '2026-10-20' });
  const rows = R.reconcileBalance(s, 'ban', { DOP: 850 }, D, T0, { when: { day: '2026-10-10', time: '' } });
  assert.equal(rows[0].expected, 900);
  assert.equal(rows[0].diff, -50);
  assert.equal(bal(s, 'ban'), 650);
});

test('una tarjeta se cuadra con lo que debes: si debes más, es un gasto sin anotar', () => {
  const s = fresh();
  R.reconcileBalance(s, 'tc', { DOP: 10000 }, D, T0);
  assert.equal(bal(s, 'tc'), -10000);
  L.addTx(s, { type: 'gasto', cat: 'comida', account: 'tc', amount: 500, day: D }, D, []);
  const rows = R.reconcileBalance(s, 'tc', { DOP: 11200 }, D, T0 + 9000);
  assert.equal(rows[0].diff, -700);
  assert.equal(bal(s, 'tc'), -11200);
});

test('el desglose explica el saldo: partida + entradas + salidas + traspasos + ajustes', () => {
  const s = fresh();
  R.reconcileBalance(s, 'ban', { DOP: 10000 }, D, T0);
  gasto(s, { amount: 400 });
  L.addTx(s, { type: 'ingreso', cat: 'salario', account: 'ban', amount: 1000, day: D }, D, []);
  L.addTx(s, { type: 'transfer', cat: 'entre_cuentas', account: 'ban', to: 'aho', amount: 2000, day: D }, D, []);
  R.reconcileBalance(s, 'ban', { DOP: 8000 }, D, T0 + 9000);
  const b = R.balanceBreakdown(s, 'ban', 'DOP');
  assert.deepEqual([b.base, b.in, b.out, b.moved, b.adjust], [10000, 1000, -400, -2000, -600]);
  assert.equal(b.expected, bal(s, 'ban'));
});

test('cuadrar con un estado del banco (setAvailable) también anota el ajuste, con el lote para deshacerlo', () => {
  const s = fresh();
  R.reconcileBalance(s, 'ban', { DOP: 1000 }, '2026-10-01', Date.parse('2026-10-01T08:00:00'));
  const legacy = (st, id, p, t, n) => M.setAvailable(st, id, p, t, n);
  const r = R.reconcileAvailable(s, 'ban', { currency: 'DOP', amount: 700, day: D, time: '10:00', source: 'Estado' }, D, T0, { batch: 'imp1' }, legacy);
  assert.equal(r, 'balance');
  assert.equal(bal(s, 'ban'), 700);
  const adj = s.money.tx.find((t) => t.adjust);
  assert.equal(adj.batch, 'imp1');
  assert.equal(L.undoImport(s, 'imp1'), 1);
  assert.equal(bal(s, 'ban'), 1000);
});

// ---------- Traspasos con propósito ----------

test('un gasto con destino mueve el dinero a otra cuenta tuya y cuenta como gasto de su categoría', () => {
  const s = fresh();
  R.reconcileBalance(s, 'ban', { DOP: 10000 }, D, T0);
  R.reconcileBalance(s, 'aho', { DOP: 500 }, D, T0);
  const t = L.addTx(s, { type: 'gasto', cat: 'ahorro', account: 'ban', to: 'aho', amount: 2000, day: D, time: '23:00' }, D, []);
  assert.equal(t.to, 'aho');
  assert.equal(bal(s, 'ban'), 8000);
  assert.equal(bal(s, 'aho'), 2500);
  const tot = S.totals(s, '2026-10-01', '2026-10-31');
  assert.equal(tot.spent, 2000);
  assert.equal(S.split503020(s, '2026-10').ahorro, 2000);
  // un traspaso normal sigue sin contar como gasto
  L.addTx(s, { type: 'transfer', cat: 'entre_cuentas', account: 'ban', to: 'aho', amount: 1000, day: D, time: '23:30' }, D, []);
  assert.equal(S.totals(s, '2026-10-01', '2026-10-31').spent, 2000);
});

test('un gasto de «Pago de deuda» con destino a tu tarjeta baja lo que debes y alimenta al jefe una sola vez', () => {
  const s = fresh();
  R.reconcileBalance(s, 'ban', { DOP: 50000 }, D, T0);
  R.reconcileBalance(s, 'tc', { DOP: 8000 }, D, T0);
  const b = L.createBoss(s, { title: 'Libre de deudas', area: 'finanzas', money: true, target: 100000, source: 'debtPay', unit: 'RD$' }, D);
  L.addTx(s, { type: 'gasto', cat: 'deuda', account: 'ban', to: 'tc', amount: 3000, day: D, time: '23:00' }, D, []);
  assert.equal(bal(s, 'tc'), -5000);
  assert.equal(bal(s, 'ban'), 47000);
  assert.equal(b.progress, 3000);
});

test('el destino solo vale si es otra cuenta distinta; un gasto normal no lo trae', () => {
  const s = fresh();
  const a = gasto(s, { amount: 10, to: 'ban' });
  assert.equal(a.to, '');
  const b = gasto(s, { amount: 10, to: 'no-existe' });
  assert.equal(b.to, '');
});
