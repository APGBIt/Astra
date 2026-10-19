import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/game/logic.js';
import * as G from '../src/game/growth.js';
import { migrate } from '../src/app/store.js';

const D = '2026-10-19';
function fresh(day = D) {
  const s = L.defaultState(day);
  s.profile.onboarded = true;
  return s;
}

test('dejar de hacer: días seguidos, recaídas, mejor racha y lo ahorrado', () => {
  const s = fresh();
  const q = G.addQuit(s, { name: 'Refrescos', area: 'salud', cost: 60, since: '2026-09-19' }, D);
  assert.equal(G.quitDays(q, D), 30);
  G.slipQuit(s, q.id, { day: '2026-10-09', trigger: 'Estrés' }, D);
  assert.equal(G.quitStart(q), '2026-10-10');
  assert.equal(G.quitDays(q, D), 9);
  assert.equal(G.quitBest(q, D), 20);
  const tot = G.quitTotals(q, D);
  assert.equal(tot.clean, 29);
  assert.equal(tot.saved, 29 * 60);
  assert.deepEqual(G.quitTriggers(q), [['Estrés', 1]]);
  // Recaer hoy: la cuenta vuelve a cero, sin días negativos.
  G.slipQuit(s, q.id, {}, D);
  assert.equal(G.quitDays(q, D), 0);
  assert.equal(G.nextMilestone(0), 1);
  // Si ya llevabas días, esos hitos no dan XP al anotarlo.
  const b = G.addQuit(s, { name: 'Azúcar', since: '2026-10-09' }, D);
  assert.deepEqual(b.claimed['2026-10-09'], [1, 3, 7]);
});

test('hitos de días seguidos: XP una vez y la insignia de 30 días', () => {
  const s = fresh();
  // Empezó hoy… y pasaron 34 días.
  const q = G.addQuit(s, { name: 'Fumar', area: 'salud' }, '2026-09-15');
  assert.deepEqual(q.claimed, { '2026-09-15': [] });
  const ev = [];
  const xp0 = s.xp;
  G.claimQuit(s, D, ev);
  const got = ev.filter((e) => e.type === 'quitDays').map((e) => e.n);
  assert.deepEqual(got, [1, 3, 7, 14, 21, 30]);
  assert.ok(s.xp > xp0);
  assert.ok(s.achievements.libre30);
  // Otra vez el mismo día: nada nuevo.
  const ev2 = [];
  G.claimQuit(s, D, ev2);
  assert.equal(ev2.filter((e) => e.type === 'quitDays').length, 0);
  // Recaer y volver a contar no repite el premio de hitos ya alcanzados.
  G.slipQuit(s, q.id, { day: '2026-10-11' }, D);
  const ev3 = [];
  G.claimQuit(s, D, ev3);
  assert.equal(ev3.filter((e) => e.type === 'quitDays').length, 0);
});

test('metas con progreso: suma, valor, ritmo y cuartos del camino', () => {
  const s = fresh();
  const ahorro = G.addTarget(s, { name: 'Fondo de emergencia', area: 'finanzas', unit: 'RD$', target: 100000, due: '2027-04-19' }, '2026-10-19');
  ahorro.created = '2026-07-19';
  const ev = [];
  G.logTarget(s, ahorro.id, { v: 40000 }, D, ev);
  let pr = G.targetProgress(ahorro, D);
  assert.equal(pr.value, 40000);
  assert.equal(pr.left, 60000);
  assert.equal(pr.status, 'a tiempo');
  assert.ok(ev.some((e) => e.type === 'targetStep' && e.pct === 25));
  G.logTarget(s, ahorro.id, { v: 60000 }, D, ev);
  pr = G.targetProgress(ahorro, D);
  assert.equal(pr.done, true);
  assert.equal(ahorro.done, D);
  assert.ok(ev.some((e) => e.type === 'targetDone'));
  assert.ok(s.achievements.meta1);

  const peso = G.addTarget(s, { name: 'Bajar de peso', mode: 'value', start: 190, target: 170, unit: 'lb' }, D);
  G.logTarget(s, peso.id, { v: 185 }, D);
  pr = G.targetProgress(peso, D);
  assert.equal(pr.value, 185);
  assert.equal(pr.pct, 0.25);
  assert.equal(pr.left, 15);
  // Ligada a una cuenta: el valor es el saldo.
  const fondo = G.addTarget(s, { name: 'Ahorro', target: 50000, link: { kind: 'account', id: 'a1' } }, D);
  assert.equal(G.targetValue(fondo, () => 12500), 12500);
  assert.equal(G.logTarget(s, fondo.id, { v: 10 }, D), null);
});

test('por lograr: pasos, pendiente, lograrlo y guardarlo en tus logros', () => {
  const s = fresh();
  const d = G.addDream(s, { title: 'Correr un 10K', area: 'salud', horizon: 'pronto', steps: ['Inscribirme', 'Correr 5K'] }, D);
  assert.equal(d.steps.length, 2);
  G.toggleDreamStep(s, d.id, d.steps[0].id, D);
  assert.equal(d.steps[0].done, D);
  const todo = G.dreamStepToTodo(s, d.id, d.steps[1].id, D);
  assert.equal(todo.title, 'Correr 5K');
  const ev = [];
  G.completeDream(s, d.id, { note: 'En 58 minutos', asWin: true }, D, ev);
  assert.equal(d.done, D);
  assert.ok(ev.some((e) => e.type === 'dreamDone'));
  assert.equal(s.wins[0].title, 'Correr un 10K');
  assert.ok(s.achievements.sueno1);
  const sum = G.growthSummary(s, D);
  assert.equal(sum.dreamsDone, 1);
});

test('datos viejos y dañados se arreglan al abrir', () => {
  const s = fresh();
  delete s.growth;
  let m = migrate(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(m.growth, { quit: [], targets: [], dreams: [] });
  m.growth.quit.push({ id: 'x', name: 'Algo', since: '2026-10-01', slips: 'mal' }, { nope: 1 });
  m.growth.targets.push({ id: 't', name: 'Sin número' });
  m = migrate(m);
  assert.equal(m.growth.quit.length, 1);
  assert.deepEqual(m.growth.quit[0].slips, []);
  assert.equal(m.growth.targets.length, 0);
});
