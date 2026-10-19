import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/game/logic.js';
import * as M from '../src/game/money.js';
import * as T from '../src/game/stats.js';

const D = '2026-10-19';
function fresh(day = D) {
  const s = L.defaultState(day);
  s.profile.onboarded = true;
  s.money.fx.manual = 60;
  return s;
}
const tx = (s, p) => L.addTx(s, p, D, []);

// Tres meses de historia: agosto y septiembre parecidos, octubre con más comida.
function seed() {
  const s = fresh();
  for (const mk of ['2026-07', '2026-08', '2026-09']) {
    tx(s, { type: 'ingreso', amount: 60000, cat: 'salario', day: `${mk}-15` });
    for (let d = 1; d <= 28; d += 3) tx(s, { type: 'gasto', amount: 300, cat: 'comida', merchant: 'Cafetería', day: `${mk}-${String(d).padStart(2, '0')}` });
    tx(s, { type: 'gasto', amount: 4000, cat: 'super', merchant: 'Supermercado', day: `${mk}-10` });
    tx(s, { type: 'gasto', amount: 1500, cat: 'transporte', merchant: 'Uber', day: `${mk}-12` });
  }
  tx(s, { type: 'ingreso', amount: 60000, cat: 'salario', day: '2026-10-15' });
  for (let d = 1; d <= 19; d += 2) tx(s, { type: 'gasto', amount: 600, cat: 'comida', merchant: 'Cafetería', day: `2026-10-${String(d).padStart(2, '0')}` });
  tx(s, { type: 'gasto', amount: 4000, cat: 'super', merchant: 'Supermercado', day: '2026-10-10' });
  for (const d of ['02', '05', '08', '11', '14']) tx(s, { type: 'gasto', amount: 200, cat: 'transporte', merchant: 'Uber', day: `2026-10-${d}` });
  tx(s, { type: 'transfer', amount: 10000, cat: 'entre_cuentas', day: '2026-10-16' });
  return s;
}

test('ingresos, gastos y ahorro por mes (sin contar lo que mueves entre tus cuentas)', () => {
  const s = seed();
  const cf = T.cashflow(s, ['2026-09', '2026-10']);
  assert.deepEqual(cf.map((x) => x.mk), ['2026-09', '2026-10']);
  assert.equal(cf[0].income, 60000);
  assert.equal(cf[0].spent, 300 * 10 + 4000 + 1500);
  assert.equal(cf[1].spent, 600 * 10 + 4000 + 1000);
  assert.ok(Math.abs(cf[1].rate - (60000 - 11000) / 60000) < 1e-9);
  const tot = T.totals(s, '2026-10-01', D);
  assert.equal(tot.spent, 11000);
  assert.equal(tot.days, 19);
});

test('categorías frente al promedio a esta altura del mes', () => {
  const s = seed();
  const rows = T.categoryStats(s, T.periodOf('mes', D), D);
  const comida = rows.find((r) => r.cat === 'comida');
  assert.equal(comida.total, 6000);
  assert.equal(comida.avg, 3000);
  // Esperado a esta altura: 3000 × 19/31; llevas 6000.
  assert.ok(Math.abs(comida.delta - (6000 - 3000 * 19 / 31) / (3000 * 19 / 31)) < 1e-9);
  assert.equal(rows[0].cat, 'comida');
  const p3 = T.periodOf('3m', D);
  assert.deepEqual(p3.mks, ['2026-08', '2026-09', '2026-10']);
});

test('comercios, cuentas y días de la semana', () => {
  const s = seed();
  const top = T.merchantStats(s, '2026-10-01', D, 3);
  assert.equal(top[0].name, 'Cafetería');
  assert.equal(top[0].n, 10);
  assert.equal(top[0].avg, 600);
  const wd = T.weekdayStats(s, '2026-10-01', D);
  assert.equal(wd.length, 7);
  assert.equal(wd.reduce((a, x) => a + x.total, 0), 11000);
  const daily = T.dailyTotals(s, '2026-10');
  assert.equal(daily['2026-10-10'], 4000);
});

test('ritmo del mes y proyección al cierre', () => {
  const s = seed();
  const p = T.paceSeries(s, D);
  assert.equal(p.cur.length, 19);
  assert.equal(p.cur[18], 11000);
  assert.equal(p.prev.length, 30);
  assert.equal(p.prev[29], 8500);
  const pr = T.monthProjection(s, D);
  assert.equal(pr.spent, 11000);
  assert.equal(pr.left, 12);
  assert.ok(pr.projected > 11000);
  assert.equal(pr.projIncome, 60000);
  assert.equal(pr.projNet, Math.round((60000 - pr.projected) * 100) / 100);
});

test('presupuestos sugeridos con tu promedio y 50/30/20', () => {
  const s = seed();
  const sug = T.budgetSuggestions(s, D);
  assert.equal(sug.months, 3);
  const super_ = sug.rows.find((r) => r.cat === 'super');
  assert.equal(super_.avg, 4000);
  assert.equal(super_.suggested, 4000);
  assert.equal(sug.rows.find((r) => r.cat === 'comida').suggested, 3000);
  const sp = T.split503020(s, '2026-10');
  assert.equal(sp.income, 60000);
  assert.equal(sp.necesidades, 4000 + 1000);
  assert.equal(sp.gustos, 6000);
  // A este ritmo: 6000 en 19 días → ~9789 al cierre.
  L.setBudget(s, 'comida', 5000, '2026-10');
  const row = M.budgetRows(s, '2026-10', D).find((r) => r.c.id === 'comida');
  const bp = T.budgetPace(row, D);
  assert.equal(bp.proj, Math.round((6000 / 19) * 31 * 100) / 100);
  assert.ok(bp.over > 0);
});

test('frases de lo que cambió', () => {
  const s = seed();
  const ins = T.insights(s, D);
  assert.ok(ins.some((x) => x.key === 'up' && x.cat === 'comida'));
  assert.ok(ins.some((x) => x.key === 'proj'));
});
