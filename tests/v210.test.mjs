// 2.1: libreta de sobrantes y faltantes. Cada cuadre con el banco queda guardado (también «solo poner el saldo»),
// se explica (repartiéndolo o con un motivo) y de ahí sale el pronóstico: cuánto se escapa al mes, cuánto esperar en
// el próximo cuadre de cada cuenta y cómo terminaría el mes contando eso. Además, el cierre de cada mes.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/game/logic.js';
import * as R from '../src/game/reconcile.js';
import * as C from '../src/game/cuadres.js';
import { ensurePlus } from '../src/game/plus.js';
import { addPlan } from '../src/game/money.js';
import { splitTx } from '../src/game/ledger.js';
import { buildTables } from '../src/game/tables.js';
import { mergeStates } from '../src/game/merge.js';
import { addDays } from '../src/app/dates.js';

const D = '2026-11-20';
const T = (day, h = 9) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`).getTime();
function fresh(day = '2026-07-01') {
  const s = L.defaultState(day);
  s.profile.onboarded = true;
  s.money.fx.manual = 60;
  s.money.accounts.push({ id: 'ban', name: 'BHD', kind: 'cuenta' });
  s.money.accounts.push({ id: 'efe', name: 'Efectivo', kind: 'efectivo' });
  s.money.accounts.push({ id: 'tc', name: 'Visa', kind: 'tarjeta', limit: { DOP: 50000, USD: 0 } });
  return s;
}
const gasto = (s, day, amount, account = 'ban') => L.addTx(s, { type: 'gasto', cat: 'comida', account, day, amount }, day, []);
const clone = (x) => JSON.parse(JSON.stringify(x));

// Una cuenta que pierde RD$100 por día sin anotar: cada semana el banco dice 700 menos de lo que Astra calcula.
function leaky(s, start = '2026-09-01', weeks = 10, perDay = 100) {
  let bank = 100000;
  R.reconcileBalance(s, 'ban', { DOP: bank }, start, T(start));
  for (let w = 1; w <= weeks; w++) {
    const day = addDays(start, w * 7);
    gasto(s, addDays(day, -2), 1000);
    bank -= 1000 + perDay * 7;
    R.reconcileBalance(s, 'ban', { DOP: bank }, day, T(day));
  }
  return addDays(start, weeks * 7);
}

test('cada cuadre queda en la libreta: el primer saldo, el ajuste, el «igual» y también «solo poner el saldo»', () => {
  const s = fresh();
  R.reconcileBalance(s, 'ban', { DOP: 10000 }, '2026-11-01', T('2026-11-01'));
  gasto(s, '2026-11-02', 500);
  R.reconcileBalance(s, 'ban', { DOP: 9000 }, '2026-11-05', T('2026-11-05'));
  R.reconcileBalance(s, 'ban', { DOP: 9000 }, '2026-11-06', T('2026-11-06'));
  R.reconcileBalance(s, 'ban', { DOP: 9400 }, '2026-11-07', T('2026-11-07'), { mode: 'reiniciar' });
  const xs = C.cuadresOf(s);
  assert.deepEqual(xs.map((x) => x.mode), ['inicio', 'ajuste', 'igual', 'reiniciar']);
  assert.equal(xs[1].diff, -500);
  assert.equal(xs[1].was, 9500);
  assert.equal(xs[1].now, 9000);
  assert.ok(xs[1].tx && s.money.tx.some((t) => t.id === xs[1].tx));
  // Antes, «solo poner el saldo» no dejaba rastro de la diferencia; ahora sí (400 que sobraron).
  assert.equal(xs[3].diff, 400);
  assert.equal(xs[3].tx, null);
  const tot = C.cuadreTotals(s, '2026-11-01', '2026-11-30');
  assert.equal(tot.n, 3);
  assert.equal(tot.falt, 500);
  assert.equal(tot.sobr, 400);
  assert.equal(tot.clean, 1);
});

test('en una tarjeta, deber más de lo anotado es un faltante', () => {
  const s = fresh();
  R.reconcileBalance(s, 'tc', { DOP: 5000 }, '2026-11-01', T('2026-11-01'));
  R.reconcileBalance(s, 'tc', { DOP: 5800 }, '2026-11-08', T('2026-11-08'));
  const x = C.cuadresOf(s).at(-1);
  assert.equal(x.card, true);
  assert.equal(x.diff, -800);
  assert.equal(C.cuadreTotals(s, '2026-11-01', '2026-11-30').falt, 800);
});

test('los cuadres de antes de la 2.1 se pasan solos a la libreta, una sola vez y sin duplicarse al sincronizar', () => {
  const s = fresh();
  R.reconcileBalance(s, 'ban', { DOP: 10000 }, '2026-10-01', T('2026-10-01'));
  R.reconcileBalance(s, 'ban', { DOP: 9000 }, '2026-10-10', T('2026-10-10'));
  // Como lo dejó la 2.0: el historial en la cuenta y nada en `plus`.
  const old = clone(s);
  delete old.plus.cuadres; delete old.plus.cuadresFrom;
  const a = clone(old); const b = clone(old);
  ensurePlus(a); ensurePlus(b);
  assert.equal(a.plus.cuadres.length, 2);
  assert.equal(a.plus.cuadres[1].diff, -1000);
  ensurePlus(a);
  assert.equal(a.plus.cuadres.length, 2, 'no se repite');
  const m = mergeStates(old, a, b);
  assert.equal(m.plus.cuadres.length, 2, 'los dos teléfonos dan los mismos ids');
});

test('un faltante se explica repartiéndolo en categorías o diciendo el motivo', () => {
  const s = fresh();
  R.reconcileBalance(s, 'ban', { DOP: 10000 }, '2026-11-01', T('2026-11-01'));
  R.reconcileBalance(s, 'ban', { DOP: 9000 }, '2026-11-08', T('2026-11-08'));
  const x = C.cuadresOf(s).at(-1);
  assert.equal(C.cuadreStatus(s, x), 'sin_explicar');
  splitTx(s, x.tx, [{ cat: 'comida', amount: 600 }, { cat: 'ajuste', amount: 400 }]);
  assert.equal(C.cuadreStatus(s, x), 'parcial');
  assert.equal(C.explainOf(s, x).left, 400);
  // Los 600 ya tienen categoría: el análisis ya no los cuenta como «sin anotar».
  assert.equal(R.adjustTotals(s, '2026-11-01', '2026-11-30').out, 400);
  C.setCuadreWhy(s, x.id, 'comision', 'Cargo por mantenimiento');
  assert.equal(C.cuadreStatus(s, x), 'motivo');
  assert.equal(C.reasonLabel(x), 'Comisión o cargo del banco');
  assert.equal(C.setCuadreWhy(s, x.id, 'reembolso').why, '', 'un motivo de sobrante no sirve para un faltante');
  // Si borras el ajuste, el cuadre sigue guardado.
  const parts = s.money.tx.filter((t) => t.adjust).map((t) => t.id);
  for (const id of parts) L.removeTx(s, id);
  assert.equal(C.cuadresOf(s).length, 2);
  assert.equal(C.explainOf(s, x).gone, true);
});

test('el pronóstico aprende tu ritmo: cuánto se escapa al mes y cuánto esperar en el próximo cuadre', () => {
  const s = fresh();
  const last = leaky(s);
  const o = C.cuadreOutlook(s, last);
  assert.equal(o.conf, 'buena');
  assert.ok(Math.abs(o.daily + 100) < 0.01, `ritmo ${o.daily}`);
  assert.ok(Math.abs(o.perMonth + 3040) < 1);
  // 10 días después, si cuadras: unos RD$1,000 de faltante.
  const later = addDays(last, 10);
  const e = C.expectedFor(s, 'ban', 'DOP', later);
  assert.equal(e.since, 10);
  assert.ok(Math.abs(e.dop + 1000) < 0.01);
  // Al cuadrar, el cuadre guarda lo que se esperaba.
  gasto(s, addDays(later, -1), 300);
  const rows = R.reconcileBalance(s, 'ban', { DOP: C.cuadresOf(s).at(-1).now - 300 - 900 }, later, T(later));
  assert.ok(Math.abs(rows[0].exp + 1000) < 0.01);
  const lines = C.outlookLines(C.cuadreOutlook(s, later)).map((l) => l.k);
  assert.ok(lines.includes('ritmo'));
  // La fuga: lo que no estaba anotado frente a todo lo que salió.
  const lk = C.leakOf(s, addDays(later, -90), later);
  assert.ok(lk.pct > 0.3 && lk.pct < 0.5, `fuga ${lk.pct}`);
});

test('sin suficientes cuadres no hay pronóstico, solo una invitación a cuadrar', () => {
  const s = fresh();
  R.reconcileBalance(s, 'ban', { DOP: 10000 }, D, T(D));
  const o = C.cuadreOutlook(s, D);
  assert.equal(o.daily, null);
  assert.equal(C.outlookLines(o)[0].k, 'aprende');
});

test('la tendencia dice si se escapa menos que antes', () => {
  const s = fresh();
  let bank = 100000;
  const start = '2026-06-01';
  R.reconcileBalance(s, 'ban', { DOP: bank }, start, T(start));
  for (let w = 1; w <= 24; w++) {
    const day = addDays(start, w * 7);
    bank -= w <= 16 ? 1400 : 210; // de RD$200 al día a RD$30
    R.reconcileBalance(s, 'ban', { DOP: bank }, day, T(day));
  }
  const o = C.cuadreOutlook(s, addDays(start, 24 * 7));
  assert.equal(o.trend, 'mejor');
  assert.ok(C.outlookLines(o).some((l) => l.k === 'tendencia' && l.tone === 'good'));
});

test('un cuadre limpio después de una semana da XP y oro; uno con diferencia, no', () => {
  const s = fresh();
  R.reconcileBalance(s, 'ban', { DOP: 10000 }, '2026-11-01', T('2026-11-01'));
  const xp0 = s.xp; const g0 = s.gold;
  const r1 = R.reconcileBalance(s, 'ban', { DOP: 9970 }, '2026-11-09', T('2026-11-09'));
  assert.equal(r1[0].clean, true);
  assert.ok(s.xp > xp0);
  assert.equal(s.gold, g0 + 3);
  const xp1 = s.xp;
  R.reconcileBalance(s, 'ban', { DOP: 8000 }, '2026-11-18', T('2026-11-18'));
  assert.equal(s.xp, xp1);
});

test('el cierre del mes guarda lo que sobró o faltó del plan, de cada presupuesto y de los cuadres', () => {
  const s = fresh('2026-09-01');
  addPlan(s, { kind: 'ingreso', name: 'Sueldo', amount: 60000, currency: 'DOP', cat: 'sueldo', freq: { type: 'month', day: 1 }, start: '2026-09-01' }, '2026-09-01');
  L.setBudget(s, 'comida', 8000);
  R.reconcileBalance(s, 'ban', { DOP: 50000 }, '2026-10-01', T('2026-10-01'));
  L.addTx(s, { type: 'ingreso', cat: 'sueldo', account: 'ban', day: '2026-10-01', amount: 60000 }, '2026-10-01', []);
  gasto(s, '2026-10-05', 9500);
  R.reconcileBalance(s, 'ban', { DOP: 99000 }, '2026-10-20', T('2026-10-20'));
  C.tidyCierres(s, '2026-11-02');
  const cz = s.plus.cierres['2026-10'];
  assert.ok(cz);
  const com = cz.budgets.find((b) => b.id === 'comida');
  assert.equal(com.left, -1500); // 8,000 − 9,500: te faltaron 1,500 en comida (lo sin anotar va aparte)
  assert.equal(cz.falt, 1500);
  assert.equal(cz.n, 1);
  // Lo guardado no se rehace: si después anotas algo de octubre, el cierre queda como estaba.
  gasto(s, '2026-10-30', 100);
  C.tidyCierres(s, '2026-11-03');
  assert.equal(s.plus.cierres['2026-10'].variable, cz.variable);
  const list = C.monthCloses(s, '2026-11-03');
  assert.equal(list[0].mk, '2026-10');
  assert.equal(list[0].saved, true);
});

test('una vez por semana se guarda el pronóstico del mes, para comparar con lo que pasó', () => {
  const s = fresh('2026-10-01');
  addPlan(s, { kind: 'ingreso', name: 'Sueldo', amount: 60000, currency: 'DOP', cat: 'sueldo', freq: { type: 'month', day: 1 }, start: '2026-10-01' }, '2026-10-01');
  gasto(s, '2026-11-02', 2000);
  C.tidyCierres(s, '2026-11-04');
  C.tidyCierres(s, '2026-11-06');
  C.tidyCierres(s, '2026-11-11');
  assert.equal(s.plus.pron['2026-11'].length, 2);
  assert.equal(C.monthClose(s, '2026-11', '2026-11-20').pron.length, 2);
});

test('Drive: la tabla «Cuadres» con cada sobrante y faltante', () => {
  const s = fresh();
  R.reconcileBalance(s, 'ban', { DOP: 10000 }, '2026-11-01', T('2026-11-01'));
  R.reconcileBalance(s, 'ban', { DOP: 9000 }, '2026-11-08', T('2026-11-08'));
  const t = buildTables(s, D).Cuadres;
  assert.equal(t[0][0], 'Fecha');
  assert.equal(t.length, 2);
  assert.equal(t[1][8], 'Faltó');
  assert.equal(t[1][7], -1000);
});
