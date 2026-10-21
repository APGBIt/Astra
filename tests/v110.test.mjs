import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/game/logic.js';
import * as M from '../src/game/money.js';
import * as T from '../src/game/stats.js';
import * as Lo from '../src/game/loans.js';
import * as W from '../src/game/worth.js';
import * as H from '../src/game/health.js';
import * as Mind from '../src/game/mind.js';
import { buildReminders } from '../src/game/reminders.js';
import { migrate } from '../src/app/store.js';
import { addDays } from '../src/app/dates.js';

const D = '2026-10-21';
function fresh(day = D) {
  const s = L.defaultState(day);
  s.profile.onboarded = true;
  s.money.fx.manual = 60;
  return s;
}
const tx = (s, p) => L.addTx(s, p, p.day || D, []);

// ---------- Finanzas: comparaciones del mes y proyección ----------

test('a esta altura del mes: el alquiler del día 1 y la luz del 18 no salen «48 % más»', () => {
  const s = fresh();
  for (const mk of ['2026-07', '2026-08', '2026-09', '2026-10']) {
    tx(s, { type: 'gasto', amount: 28000, cat: 'vivienda', day: `${mk}-01` });
    tx(s, { type: 'gasto', amount: 3200, cat: 'servicios', day: `${mk}-18` });
    tx(s, { type: 'gasto', amount: 900, cat: 'cafe', day: `${mk}-05` });
    if (mk !== '2026-10') tx(s, { type: 'gasto', amount: 900, cat: 'cafe', day: `${mk}-25` });
  }
  tx(s, { type: 'gasto', amount: 2000, cat: 'cafe', day: '2026-10-12' });
  const rows = T.categoryStats(s, T.periodOf('mes', D), D);
  const by = Object.fromEntries(rows.map((r) => [r.cat, r]));
  assert.equal(by.vivienda.delta, 0);
  assert.equal(by.servicios.delta, 0);
  // Café: a esta altura solías llevar 900 (el del 5); llevas 2900.
  assert.equal(by.cafe.expect, 900);
  assert.ok(Math.abs(by.cafe.delta - 2000 / 900) < 1e-9);
  // 3 meses (dos completos y este a la fecha): 2 × 1800 + 900 esperado en café.
  const r3 = T.categoryStats(s, T.periodOf('3m', D), D).find((r) => r.cat === 'cafe');
  assert.equal(r3.expect, 2 * 1800 + 900);
  // El mes pasado completo contra su promedio completo.
  const rp = T.categoryStats(s, T.periodOf('pasado', D), D).find((r) => r.cat === 'vivienda');
  assert.equal(rp.delta, 0);
  assert.ok(!T.insights(s, D).some((x) => /Alquiler|Luz/.test(x.text)));
});

test('proyección: lo que ya falta va aparte de lo que faltaría a este ritmo', () => {
  const pr = { spent: 110000, toPay: 0, projIncome: 85000, projNet: -62000, left: 10, daily: 3700 };
  assert.match(T.projectionNote(pr), /^Ya gastaste RD\$25,000 más de lo que entra este mes; a este ritmo, serían unos RD\$62,000\.$/);
  assert.match(T.projectionNote({ spent: 50000, toPay: 10000, projIncome: 85000, projNet: -5000, left: 10, daily: 3000 }), /para cuadrar, gasta hasta RD\$2,500 por día/);
  assert.match(T.projectionNote({ spent: 50000, toPay: 40000, projIncome: 85000, projNet: -35000, left: 10, daily: 3000 }), /Con lo programado que falta, te faltarían RD\$5,000 aunque no gastes nada más/);
  assert.match(T.projectionNote({ spent: 50000, toPay: 0, projIncome: 85000, projNet: 5000, left: 10, daily: 3000 }), /Te quedarían unos RD\$5,000/);
});

test('pagos que se repiten: no sugiere lo que ya está en tu plan con otro nombre', () => {
  const s = fresh();
  M.addPlan(s, { kind: 'gasto', name: 'Internet y cable', amount: 2900, cat: 'telecom', freq: { type: 'month', days: [10] } }, '2026-07-01');
  for (const mk of ['2026-07', '2026-08', '2026-09', '2026-10']) {
    tx(s, { type: 'gasto', amount: 2900, cat: 'telecom', merchant: 'Altice', day: `${mk}-10` });
    tx(s, { type: 'gasto', amount: 650, cat: 'suscripciones', merchant: 'Netflix', day: `${mk}-08` });
  }
  const names = M.recurringSuggestions(s, D).map((r) => r.name);
  assert.ok(!names.includes('Altice'));
  assert.ok(names.includes('Netflix'));
});

test('la revisión de la semana no cuenta lo marcado «no contar»', () => {
  const s = fresh();
  tx(s, { type: 'gasto', amount: 500, cat: 'cafe', day: D });
  tx(s, { type: 'gasto', amount: 9000, cat: 'terceros', day: D, noStats: true });
  assert.equal(Mind.weekSummary(s, D).spent, 500);
});

// ---------- Préstamos con personas ----------

test('préstamo que das: sale de tu cuenta sin contar como gasto, abonos y se cierra solo', () => {
  const s = fresh();
  const bank = L.addAccount(s, { name: 'Banco', kind: 'cuenta', last4: '4321' });
  M.setAccountBalance(s, bank.id, { DOP: 50000 }, '2026-10-01', 1);
  const ev = [];
  const l = Lo.addLoan(s, { dir: 'me', who: 'Luis', amount: 20000, day: '2026-10-05', due: '2026-11-30', account: bank.id }, D, ev);
  assert.equal(M.balances(s)[bank.id].DOP, 30000);
  const t0 = s.money.tx.find((t) => t.id === l.tx);
  assert.equal(t0.cat, 'prestamo_dado');
  assert.equal(t0.noStats, true);
  assert.equal(T.totals(s, '2026-10-01', D).spent, 0);
  assert.equal(Lo.loanTotals(s, D).me, 20000);
  Lo.payLoan(s, l.id, { amount: 5000, day: '2026-10-15', account: bank.id }, D, ev);
  assert.equal(Lo.leftOf(l), 15000);
  assert.equal(M.balances(s)[bank.id].DOP, 35000);
  assert.equal(T.totals(s, '2026-10-01', D).income, 0, 'lo que te devuelven no es ingreso');
  const xp0 = s.attrs.finanzas;
  Lo.payLoan(s, l.id, { amount: 99999, day: '2026-10-20' }, D, ev);
  assert.equal(Lo.leftOf(l), 0);
  assert.equal(l.closed, '2026-10-20');
  assert.ok(s.attrs.finanzas > xp0);
  assert.equal(l.pays[1].amount, 15000, 'el abono no pasa de lo que falta');
  // Quitar un abono vuelve a abrirlo.
  Lo.removePay(s, l.id, l.pays[1].id);
  assert.equal(l.closed, null);
  assert.equal(Lo.leftOf(l), 15000);
});

test('un movimiento ya anotado se vuelve préstamo, y el préstamo que te hacen resta de lo que tienes', () => {
  const s = fresh();
  const t = tx(s, { type: 'gasto', amount: 6500, cat: 'terceros', merchant: 'Carla', day: '2026-10-13' });
  const l = Lo.loanFromTx(s, t.id, { due: '2026-12-01' }, D);
  assert.equal(l.who, 'Carla');
  assert.equal(l.amount, 6500);
  assert.equal(t.noStats, true);
  assert.equal(Lo.loanForTx(s, t.id).loan.id, l.id);
  assert.equal(Lo.loanFromTx(s, t.id, {}, D), null, 'no se duplica');
  const b = Lo.addLoan(s, { dir: 'yo', who: 'Rosa', amount: 100, currency: 'USD', day: '2026-10-10', due: '2026-10-18' }, D);
  const tot = Lo.loanTotals(s, D);
  assert.equal(tot.yo, 6000);
  assert.equal(tot.late, 1);
  assert.equal(Lo.loanInfo(b, D).late, true);
  Lo.forgiveLoan(s, b.id, D);
  assert.equal(Lo.loanTotals(s, D).yo, 0);
  // Migración: préstamos dañados se descartan y las ligas sueltas se limpian.
  s.money.loans.push({ id: 'x', dir: 'otro', amount: 5 });
  s.money.tx = s.money.tx.filter((x) => x.id !== t.id);
  const m = migrate(JSON.parse(JSON.stringify(s)));
  assert.equal(m.money.loans.length, 2);
  assert.equal(m.money.loans.find((x) => x.who === 'Carla').tx, null);
});

test('patrimonio mes a mes: saldos al cierre de cada mes, con lo que te deben y lo que debes', () => {
  const s = fresh();
  const bank = L.addAccount(s, { name: 'Banco', kind: 'cuenta' });
  const visa = L.addAccount(s, { name: 'Visa', kind: 'tarjeta', limit: { DOP: 50000, USD: 0 } });
  M.setAccountBalance(s, bank.id, { DOP: 100000 }, '2026-09-01', 1);
  M.setAccountBalance(s, visa.id, { DOP: 0 }, '2026-09-01', 1);
  tx(s, { type: 'gasto', amount: 10000, cat: 'super', account: bank.id, day: '2026-09-10' });
  tx(s, { type: 'gasto', amount: 4000, cat: 'comida', account: visa.id, day: '2026-10-02' });
  tx(s, { type: 'ingreso', amount: 30000, cat: 'salario', account: bank.id, day: '2026-10-15' });
  assert.equal(W.balancesAt(s, '2026-09-30')[bank.id].DOP, 90000);
  assert.equal(W.balancesAt(s, D)[bank.id].DOP, M.balances(s)[bank.id].DOP);
  Lo.addLoan(s, { dir: 'me', who: 'Luis', amount: 5000, day: '2026-10-05' }, D);
  const ser = W.worthSeries(s, D);
  assert.deepEqual(ser.points.map((p) => p.day), ['2026-09-30', D]);
  assert.equal(ser.points[0].net, 90000);
  assert.equal(ser.last.net, 120000 - 4000 + 5000);
  assert.equal(ser.dMonth, 31000);
  // Antes del saldo puesto, se descuenta lo que pasó después.
  M.setAccountBalance(s, bank.id, { DOP: 120000 }, D, 2);
  assert.equal(W.balancesAt(s, '2026-09-30')[bank.id].DOP, 90000);
});

test('antes de cobrar también cuenta lo que quedaste en pagarle a alguien', () => {
  const s = fresh();
  const bank = L.addAccount(s, { name: 'Banco', kind: 'cuenta' });
  M.setAccountBalance(s, bank.id, { DOP: 20000 }, D, 1);
  M.addPlan(s, { kind: 'ingreso', name: 'Sueldo', amount: 40000, cat: 'salario', account: bank.id, freq: { type: 'month', days: [30] } }, '2026-10-01');
  Lo.addLoan(s, { dir: 'yo', who: 'Rosa', amount: 3000, day: '2026-10-10', due: '2026-10-25' }, D);
  const pay = M.untilPayday(s, D);
  assert.equal(pay.loans.length, 1);
  assert.equal(pay.free, 17000);
});

test('avisos: préstamos por vencer y medicinas a su hora', () => {
  const s = fresh();
  s.settings.notify.on = true;
  Lo.addLoan(s, { dir: 'me', who: 'Luis', amount: 2000, day: '2026-10-01', due: '2026-10-22' }, D);
  H.ensureHealthPlus(s, D);
  H.addMed(s, { name: 'Losartán', dose: '50 mg', times: ['21:00'] }, D);
  const list = buildReminders(s, new Date('2026-10-21T08:00:00'), D);
  assert.ok(list.some((r) => /Luis quedó en devolverte RD\$2,000 mañana/.test(r.title)));
  const med = list.find((r) => r.kind === 'medicinas' && r.day === D);
  assert.ok(med);
  assert.equal(new Date(med.at).getHours(), 21, 'a la hora exacta, aunque caiga en horas de silencio');
});

// ---------- Ánimo y dinero ----------

test('ánimo y dinero: gustos en días tensos o bajos frente a días agradables (con 5 días de cada lado)', () => {
  const s = fresh();
  for (let i = 0; i < 12; i++) {
    const day = addDays(D, -i);
    const bad = i % 2 === 0;
    L.addMood(s, { quad: bad ? 0 : 3, words: [] }, day, []);
    tx(s, { type: 'gasto', amount: bad ? 1200 : 400, cat: 'delivery', day });
    tx(s, { type: 'gasto', amount: 3000, cat: 'super', day });
  }
  const mm = T.moodMoney(s, D);
  assert.equal(mm.ready, true);
  assert.equal(mm.nBad, 6);
  assert.equal(mm.wants.bad, 1200);
  assert.equal(mm.wants.good, 400);
  assert.ok(Math.abs(mm.wants.delta - 2) < 1e-9);
  assert.equal(mm.cats[0].cat, 'delivery');
  assert.equal(mm.all.bad, 4200);
  const few = fresh();
  L.addMood(few, { quad: 0 }, D, []);
  assert.equal(T.moodMoney(few, D).ready, false);
});

// ---------- Salud ----------

test('actividad: los minutos intensos cuentan doble y gimnasio cuenta como día de fuerza', () => {
  const s = fresh();
  L.logHealth(s, D, { exercise: 30, exType: 'correr' }, D, []);
  L.logHealth(s, addDays(D, -1), { exercise: 40, exType: 'caminar' }, D, []);
  L.logHealth(s, addDays(D, -2), { exercise: 45, exType: 'gimnasio' }, D, []);
  L.logHealth(s, addDays(D, -3), { exercise: 20, exType: 'baile', exIntensity: 'intensa', strength: true }, D, []);
  const w = H.activityWeek(s, D);
  assert.equal(w.total, 135);
  assert.equal(w.vig, 50);
  assert.equal(w.equiv, 185);
  assert.equal(w.strength, 2);
  // 135 minutos, pero con los intensos al doble ya pasa de 150: lo que recomienda la OMS.
  assert.ok(Mind.healthHighlights(s, D).some((x) => /recomienda la OMS \(los intensos cuentan doble\)/.test(x.text)));
  // Bajar los minutos baja también los intensos.
  L.logHealth(s, D, { exercise: 10 }, D, []);
  assert.equal(s.health[D].exVig, 10);
});

test('medicinas: tomas del día, solo los días que tocan, XP al tomarlas todas y lo que tomaste en 30 días', () => {
  const s = fresh();
  H.ensureHealthPlus(s, D);
  const a = H.addMed(s, { name: 'Losartán', dose: '50 mg', times: ['20:00', '08:00'], start: addDays(D, -10) }, D);
  const b = H.addMed(s, { name: 'Vitamina D', times: ['13:00'], days: [1, 3, 5], start: addDays(D, -10) }, D);
  assert.deepEqual(a.times, ['08:00', '20:00']);
  const today = H.dosesFor(s, D);
  assert.deepEqual(today.map((d) => `${d.med.name}@${d.time}`), ['Losartán@08:00', 'Vitamina D@13:00', 'Losartán@20:00']);
  assert.equal(H.dosesFor(s, '2026-10-22').length, 2, 'el jueves no toca la vitamina');
  const xp0 = s.attrs.salud;
  for (const d of today) H.logDose(s, D, d.key, 'si', D, []);
  assert.equal(s.attrs.salud - xp0 >= 3, true);
  const xp1 = s.attrs.salud;
  H.logDose(s, D, today[0].key, null, D, []);
  H.logDose(s, D, today[0].key, 'si', D, []);
  assert.equal(s.attrs.salud, xp1, 'la XP de las tomas es una vez al día');
  H.logDose(s, addDays(D, -1), `${a.id}@08:00`, 'si', D, []);
  H.logDose(s, addDays(D, -1), `${a.id}@20:00`, 'no', D, []);
  const ad = H.medAdherence(s, a, D, 2);
  assert.deepEqual([ad.total, ad.taken, ad.skipped], [4, 3, 1]);
  H.archiveMed(s, b.id, D);
  assert.equal(H.dosesFor(s, '2026-10-23').length, 2);
  H.removeMed(s, a.id);
  assert.equal(Object.keys((s.health[D] || {}).meds || {}).some((k) => k.startsWith(a.id)), false);
});

test('tus últimas semanas: promedios por bloque de 7 días y las 4 recientes frente a las 4 anteriores', () => {
  const s = fresh();
  for (let i = 0; i < 56; i++) {
    const day = addDays(D, -i);
    L.logHealth(s, day, { sleep: i < 28 ? 7.5 : 6.5, steps: i < 28 ? 9000 : 6000 }, D, []);
  }
  const weeks = H.healthWeeks(s, D, 8);
  assert.equal(weeks.length, 8);
  assert.equal(weeks[7].to, D);
  assert.equal(weeks[7].sleep, 7.5);
  assert.equal(weeks[0].sleep, 6.5);
  const tr = H.trendOf(weeks, 'steps');
  assert.equal(tr.recent, 9000);
  assert.equal(tr.before, 6000);
  assert.equal(tr.diff, 3000);
});

test('regularidad del sueño: también la hora de levantarte', () => {
  const s = fresh();
  const wakes = ['06:00', '06:10', '09:30', '06:05', '06:00'];
  wakes.forEach((w, i) => L.logHealth(s, addDays(D, -i), { bed: '23:00', wake: w }, D, []));
  const ins = L.sleepInsights(s, D);
  assert.equal(ins.wakeSpread, 210);
  assert.match(ins.tip.text, /Te levantas a horas muy distintas/);
});

// ---------- Emociones ----------

test('corregir y borrar un check-in, y semana a semana', () => {
  const s = fresh();
  const m = L.addMood(s, { quad: 0, words: ['Estrés'], influences: ['trabajo'] }, D, []);
  Mind.updateMood(s, m.id, { quad: 3 });
  assert.equal(m.quad, 3);
  assert.deepEqual(m.words, [], 'al cambiar de cuadrante se quitan las palabras del otro');
  Mind.updateMood(s, m.id, { words: ['Calma'], influences: ['descanso', 'inventada'], note: 'Mejor' });
  assert.deepEqual(m.influences, ['descanso']);
  assert.equal(m.note, 'Mejor');
  L.addMood(s, { quad: 2 }, addDays(D, -8), []);
  const wk = Mind.moodWeeks(s, D, 3);
  assert.deepEqual(wk.map((w) => w.n), [0, 1, 1]);
  assert.equal(wk[2].pleasant, 1);
  assert.equal(wk[1].low, 1);
  assert.equal(Mind.removeMood(s, m.id), true);
  assert.equal(s.moods.length, 1);
});

test('tus cartas para días difíciles: por cuadrante, sin repetir, y las ideas que faltan', () => {
  const s = fresh();
  const c1 = Mind.addCoping(s, { text: 'Un paso a la vez: solo el siguiente.', kind: 'frase' });
  assert.deepEqual(c1.quads, [0, 2]);
  assert.equal(Mind.addCoping(s, { text: 'un paso a la vez: solo el siguiente.' }), null);
  Mind.addCoping(s, { text: 'Llamar a mi hermana', kind: 'accion', quads: [2] });
  assert.equal(Mind.copingFor(s, 0).length, 1);
  assert.deepEqual(Mind.copingFor(s, 2).map((c) => c.kind), ['frase', 'accion']);
  assert.ok(!Mind.copingIdeas(s).some((c) => c.text === 'Un paso a la vez: solo el siguiente.'));
  Mind.updateCoping(s, c1.id, { quads: [5] });
  assert.deepEqual(c1.quads, [0, 2]);
  Mind.removeCoping(s, c1.id);
  assert.equal(s.mind.cards.length, 1);
  const m = migrate(JSON.parse(JSON.stringify({ ...s, mind: { ...s.mind, cards: [{ id: 'a', text: '' }, { id: 'b', text: 'Respira', quads: [9] }] } })));
  assert.deepEqual(m.mind.cards.map((c) => [c.text, c.quads]), [['Respira', [0, 2]]]);
});
