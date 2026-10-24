import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/game/logic.js';
import * as C from '../src/game/credits.js';
import * as M from '../src/game/money.js';

const D = '2026-10-24';
function fresh() {
  const s = L.defaultState(D);
  s.profile.onboarded = true;
  s.money.fx.manual = 60;
  s.money.accounts.push({ id: 'ban', name: 'Banco', kind: 'cuenta', bank: 'APAP', last4: '1234', base: { day: '2026-10-01', DOP: 500000, USD: 0, ts: 0 } });
  return s;
}
const gasto = (s, p) => L.addTx(s, { type: 'gasto', currency: 'DOP', account: 'ban', ...p }, D, []);

test('precio e inicial: lo financiado es la diferencia', () => {
  const s = fresh();
  const c = C.addCredit(s, { name: 'Carro', price: 1200000, down: 300000, apr: 12, term: 48, start: '2026-09-27', first: '2026-10-27' }, D, []);
  assert.equal(c.principal, 900000);
  const inf = C.creditInfo(c, D);
  assert.equal(inf.buy.price, 1200000);
  assert.equal(inf.buy.down, 300000);
  assert.ok(inf.buy.total > 1200000);
  assert.equal(inf.buy.pctFinanced, 0.75);
});

test('el inicial se puede anotar como gasto (sin contar en el mes) y crear lo que compraste', () => {
  const s = fresh();
  const c = C.addCredit(s, { name: 'Carro', price: 1200000, down: 300000, apr: 12, term: 48, start: '2026-10-10', first: '2026-11-10', downAccount: 'ban', asset: true, assetKind: 'vehiculo' }, D, []);
  assert.ok(c.downTx);
  const tx = s.money.tx.find((t) => t.id === c.downTx);
  assert.equal(Math.abs(tx.amount), 300000);
  assert.ok(tx.noStats);
  assert.equal((M.balances(s).ban || {}).DOP, 200000);
  assert.equal(s.money.assets.length, 1);
  assert.equal(s.money.assets[0].credit, c.id);
  assert.equal(s.money.assets[0].vals[0].value, 1200000);
});

test('gastos ya hechos: se encuentran como cuota, abono o inicial y se vinculan al confirmar', () => {
  const s = fresh();
  const c = C.addCredit(s, { name: 'Préstamo del carro', lender: 'Banco X', principal: 100000, down: 20000, apr: 18, term: 12, start: '2026-09-27', first: '2026-10-27', fee: 300 }, D, []);
  const init = gasto(s, { cat: 'deuda', merchant: 'Inicial Banco X', amount: 20000, day: '2026-09-27' });
  const q1 = gasto(s, { cat: 'deuda', merchant: 'Cuota préstamo del carro', link: { skip: true }, amount: C.creditOf(s, c.id).payment + 300, day: '2026-09-27' });
  const otro = gasto(s, { cat: 'comida', merchant: 'Colmado', amount: 500, day: '2026-10-02' });
  const found = C.creditCandidates(s, c.id, D);
  const ids = found.map((f) => f.tx.id);
  assert.ok(ids.includes(init.id) && ids.includes(q1.id));
  assert.ok(!ids.includes(otro.id));
  assert.equal(found.find((f) => f.tx.id === init.id).kind, 'inicial');
  const res = C.linkCreditTxs(s, c.id, found.map((f) => ({ tx: f.tx.id, kind: f.kind })), D, []);
  assert.equal(res.down, true);
  assert.equal(res.cuotas, 1);
  assert.equal(C.creditOf(s, c.id).downTx, init.id);
  assert.equal(C.creditInfo(C.creditOf(s, c.id), D).nPaid, 1);
  assert.equal(C.creditCandidates(s, c.id, D).length, 0);
});

test('un gasto vinculado como inicial ya no se ofrece, y si lo borras se desvincula', () => {
  const s = fresh();
  const c = C.addCredit(s, { name: 'Casa', principal: 500000, down: 100000, term: 120, start: '2026-09-01', first: '2026-10-01' }, D, []);
  const tx = gasto(s, { cat: 'deuda', merchant: 'Inicial casa', amount: 100000, day: '2026-09-01' });
  assert.ok(C.setCreditDown(s, c.id, tx.id));
  assert.ok(C.creditTxIds(s).has(tx.id));
  C.dropCreditTx(s, [tx.id]);
  assert.equal(C.creditOf(s, c.id).downTx, null);
});
