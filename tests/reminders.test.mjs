import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/game/logic.js';
import * as M from '../src/game/money.js';
import * as G from '../src/game/growth.js';
import * as R from '../src/game/reminders.js';
import { migrate } from '../src/app/store.js';

const D = '2026-10-19'; // lunes
function fresh() {
  const s = L.defaultState(D);
  s.profile.onboarded = true;
  s.profile.name = 'Ana María';
  s.settings.notify.on = true;
  return s;
}
const at = (day, hm) => R.atOf(day, hm);

test('apagadas: no hay avisos', () => {
  const s = fresh();
  s.settings.notify.on = false;
  assert.deepEqual(R.buildReminders(s, new Date(at(D, '06:00')), D), []);
});

test('pagos: el día del aviso, el día antes y el mismo día; resumen y posada', () => {
  const s = fresh();
  M.addPlan(s, { kind: 'gasto', name: 'Alquiler', amount: 18000, currency: 'DOP', cat: 'vivienda', freq: { type: 'month', days: [20] }, remind: 3 }, D);
  L.addTodo(s, { title: 'Llamar al banco', due: D, important: true }, D);
  const list = R.buildReminders(s, new Date(at(D, '06:00')), D);
  const pay = list.filter((r) => r.kind === 'pagos');
  assert.ok(pay.some((r) => r.day === D && r.title === 'Alquiler vence mañana'));
  assert.ok(pay.some((r) => r.day === '2026-10-20' && r.title === 'Hoy vence: Alquiler'));
  const res = list.find((r) => r.kind === 'resumen' && r.day === D);
  assert.equal(res.title, 'Buenos días, Ana');
  assert.match(res.body, /1 pendiente/);
  assert.match(res.body, /Primero: Llamar al banco/);
  assert.equal(res.at, at(D, '08:00'));
  assert.ok(list.some((r) => r.kind === 'posada' && r.at === at(D, '20:30')));
  // Lo que ya pasó no se vuelve a programar.
  const later = R.buildReminders(s, new Date(at(D, '21:00')), D);
  assert.ok(!later.some((r) => r.day === D && r.kind === 'resumen'));
});

test('días sin algo: el aviso sale la mañana del hito', () => {
  const s = fresh();
  G.addQuit(s, { name: 'Refrescos', since: '2026-10-13', why: 'Por mi salud' }, D);
  const list = R.buildReminders(s, new Date(at(D, '06:00')), D);
  const q = list.find((r) => r.kind === 'dejar');
  assert.equal(q.title, '7 días sin refrescos');
  assert.equal(q.day, '2026-10-20');
  assert.match(q.body, /Por mi salud/);
});

test('horas de silencio y ajustes dañados', () => {
  const cfg = { ...R.defaultNotify(), quietFrom: '22:00', quietTo: '07:00' };
  assert.equal(R.outOfQuiet('06:15', cfg), '07:00');
  assert.equal(R.outOfQuiet('23:30', cfg), '07:00');
  assert.equal(R.outOfQuiet('12:00', cfg), '12:00');
  const s = fresh();
  s.settings.notify = { on: 1, kinds: { pagos: false, raro: true }, morning: '25:00' };
  const m = migrate(JSON.parse(JSON.stringify(s)));
  assert.equal(m.settings.notify.on, true);
  assert.equal(m.settings.notify.kinds.pagos, false);
  assert.equal(m.settings.notify.kinds.raro, undefined);
  assert.equal(m.settings.notify.morning, '08:00');
});
