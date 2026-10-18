import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/game/logic.js';
import { isHomeTask, parseTodo } from '../src/game/parse.js';
import { addDays, weekday } from '../src/app/dates.js';

const D = '2026-09-28'; // lunes

function fresh() {
  const s = L.defaultState(D);
  s.profile.onboarded = true;
  return s;
}
const openOf = (s, c) => s.todos.filter((t) => t.chore === c.id && !t.done);

// ---------- Hogar ----------

test('hogar: una rutina deja un solo pendiente en la categoría Hogar', () => {
  const s = fresh();
  const c = L.addChore(s, { title: 'Limpiar el baño', freq: { type: 'every', n: 7, unit: 'day' }, mins: 30 }, D);
  const open = openOf(s, c);
  assert.equal(open.length, 1);
  assert.equal(open[0].cat, 'hogar');
  assert.equal(open[0].due, D);
  assert.equal(L.todoCategory(s, 'hogar').name, 'Hogar');
  L.syncChores(s, D);
  L.syncChores(s, D);
  assert.equal(openOf(s, c).length, 1);
});

test('hogar: «cada 3 días» cuenta desde el día en que la haces', () => {
  const s = fresh();
  const c = L.addChore(s, { title: 'Barrer y trapear', freq: { type: 'every', n: 3, unit: 'day' }, mins: 30 }, D);
  // Se hace con 2 días de atraso: la próxima es 3 días después de hacerla.
  const late = addDays(D, 2);
  const r = L.completeTodo(s, openOf(s, c)[0].id, late, []);
  assert.equal(r.next, addDays(late, 3));
  assert.equal(r.area, 'emocional');
  assert.equal(r.xp, L.choreXP(30));
  assert.equal(s.chores[0].log[0], late);
  assert.equal(openOf(s, c).length, 1);
});

test('hogar: «los sábados» da por cubierto el sábado que adelantaste', () => {
  const s = fresh();
  const c = L.addChore(s, { title: 'Lavar la ropa', freq: { type: 'weekdays', days: [6] }, mins: 45 }, D);
  const sat = openOf(s, c)[0].due;
  assert.equal(weekday(sat), 6);
  assert.equal(sat, '2026-10-03');
  // Se hace el jueves: la próxima es el sábado siguiente, no este.
  const r = L.completeTodo(s, openOf(s, c)[0].id, '2026-10-01', []);
  assert.equal(r.next, '2026-10-10');
  assert.equal(L.freqLabel(c.freq), 'Los sábados');
  assert.equal(L.freqLabel({ type: 'weekdays', days: [1, 3, 5] }), 'Los lunes, miércoles y viernes');
  assert.equal(L.freqLabel({ type: 'weekdays', days: [1, 2, 3, 4, 5] }), 'De lunes a viernes');
});

test('hogar: deshacer devuelve la fecha anterior y quita la próxima', () => {
  const s = fresh();
  const c = L.addChore(s, { title: 'Planchar', freq: { type: 'every', n: 1, unit: 'week' }, mins: 40 }, D);
  const t = openOf(s, c)[0];
  const xp0 = s.xp;
  L.completeTodo(s, t.id, D, []);
  assert.ok(s.xp > xp0);
  L.uncompleteTodo(s, t.id);
  assert.equal(s.xp, xp0);
  const open = openOf(s, c);
  assert.equal(open.length, 1);
  assert.equal(open[0].id, t.id);
  assert.equal(s.chores[0].log.length, 0);
  assert.equal(s.chores[0].base, null);
});

test('hogar: si se atrasa sigue atrasada (no se mueve sola)', () => {
  const s = fresh();
  const c = L.addChore(s, { title: 'Sacar la basura', freq: { type: 'weekdays', days: [1, 3, 5] }, mins: 5 }, D);
  assert.equal(openOf(s, c)[0].due, D);
  const later = addDays(D, 3);
  L.reconcile(s, later);
  assert.equal(openOf(s, c)[0].due, D);
  assert.equal(L.choreStatus(s, s.chores[0], later).state, 'late');
  assert.equal(L.houseSummary(s, later).late, 1);
});

test('hogar: saltar, pausar, reanudar, cambiar frecuencia y borrar', () => {
  const s = fresh();
  const c = L.addChore(s, { title: 'Regar las plantas', freq: { type: 'every', n: 3, unit: 'day' }, mins: 10 }, D);
  const next = L.skipChore(s, c.id, D);
  assert.equal(next, addDays(D, 3));
  assert.equal(openOf(s, c)[0].due, next);
  L.updateChore(s, c.id, { paused: true }, D);
  assert.equal(openOf(s, c).length, 0);
  L.updateChore(s, c.id, { paused: false }, addDays(D, 30));
  assert.equal(openOf(s, c).length, 1);
  assert.ok(openOf(s, c)[0].due >= addDays(D, 3));
  L.updateChore(s, c.id, { freq: { type: 'every', n: 1, unit: 'month' } }, addDays(D, 30));
  assert.equal(L.freqLabel(s.chores[0].freq), 'Cada mes');
  L.removeChore(s, c.id);
  assert.equal(s.chores.length, 0);
  assert.equal(s.todos.filter((t) => t.chore === c.id && !t.done).length, 0);
});

test('hogar: cada mes respeta el fin de mes', () => {
  const s = fresh();
  const c = L.addChore(s, { title: 'Limpiar la nevera', freq: { type: 'every', n: 1, unit: 'month' }, mins: 30, start: '2026-01-31' }, '2026-01-31');
  const r = L.completeTodo(s, openOf(s, c)[0].id, '2026-01-31', []);
  assert.equal(r.next, '2026-02-28');
});

test('hogar: el título y la fecha editados en Pendientes pasan a la rutina', () => {
  const s = fresh();
  const c = L.addChore(s, { title: 'Lavar sábanas', freq: { type: 'every', n: 1, unit: 'week' }, mins: 30 }, D);
  const t = openOf(s, c)[0];
  L.updateTodo(s, t.id, { title: 'Lavar sábanas y toallas', due: addDays(D, 2) }, D);
  assert.equal(s.chores[0].title, 'Lavar sábanas y toallas');
  L.syncChores(s, D);
  assert.equal(openOf(s, c)[0].due, addDays(D, 2));
  L.postponeTodo(s, t.id, addDays(D, 4));
  L.syncChores(s, D);
  assert.equal(openOf(s, c)[0].due, addDays(D, 4));
});

test('hogar: el atributo elegido recibe la XP (o solo el nivel)', () => {
  const s = fresh();
  const c = L.addChore(s, { title: 'Hacer la compra del súper', freq: { type: 'every', n: 1, unit: 'week' }, mins: 60, attr: 'finanzas' }, D);
  const r = L.completeTodo(s, openOf(s, c)[0].id, D, []);
  assert.equal(r.area, 'finanzas');
  assert.equal(r.xp, L.choreXP(60));
  const c2 = L.addChore(s, { title: 'Ordenar la casa', freq: { type: 'every', n: 2, unit: 'day' }, mins: 20, attr: null }, D);
  const r2 = L.completeTodo(s, openOf(s, c2)[0].id, D, []);
  assert.equal(r2.area, null);
});

test('hogar: las rutinas nuevas se reparten en la semana', () => {
  const s = fresh();
  const list = [
    { title: 'Lavar la ropa', freq: { type: 'every', n: 1, unit: 'week' }, mins: 45 },
    { title: 'Planchar', freq: { type: 'every', n: 1, unit: 'week' }, mins: 40 },
    { title: 'Limpiar el baño', freq: { type: 'every', n: 1, unit: 'week' }, mins: 30 },
    { title: 'Sacar la basura', freq: { type: 'every', n: 2, unit: 'day' }, mins: 5 },
  ];
  const made = L.addChores(s, list, D);
  assert.equal(made.length, 4);
  const dues = new Set(s.todos.filter((t) => t.chore && !t.done && t.title !== 'Sacar la basura').map((t) => t.due));
  assert.equal(dues.size, 3);
  const week = L.choreWeek(s, D);
  assert.equal(week.length, 7);
  assert.ok(week.reduce((a, d) => a + d.items.length, 0) >= 6);
});

test('hogar: datos viejos o dañados se reparan sin borrar lo que sirve', () => {
  const s = fresh();
  s.chores = [{ id: 'h1', title: 'Lavar', freq: { type: 'every', n: 'x' }, log: ['2026-09-01', 'malo'] }, null, { title: 'sin id' }];
  s.wins = [{ id: 'w1', title: 'Algo', day: '2026-09-01' }, { id: 'w2', title: 'Sin fecha' }];
  L.ensureHome(s);
  assert.equal(s.chores.length, 1);
  assert.deepEqual(s.chores[0].freq, { type: 'every', n: 1, unit: 'day' });
  assert.deepEqual(s.chores[0].log, ['2026-09-01']);
  assert.equal(s.wins.length, 1);
  assert.deepEqual(s.wins[0].skills, []);
});

test('hogar: se detecta al escribir un pendiente', () => {
  assert.equal(isHomeTask('Lavar la ropa'), true);
  assert.equal(isHomeTask('Planchar camisas'), true);
  assert.equal(isHomeTask('Superar el examen'), false);
  assert.equal(parseTodo('Sacar la basura mañana', D).home, true);
});

// ---------- Sueño ----------

test('sueño: horas desde el horario, aunque cruce la medianoche', () => {
  assert.equal(L.sleepFromTimes('23:30', '06:45'), 7.25);
  assert.equal(L.sleepFromTimes('00:30', '07:00'), 6.5);
  assert.equal(L.sleepFromTimes('22:00', '22:00'), 24);
  assert.equal(L.fmtClock('22:15'), '10:15 p. m.');
  assert.equal(L.fmtClock('00:05'), '12:05 a. m.');
  assert.equal(L.fmtClock('12:00'), '12:00 p. m.');
});

test('sueño: registrar por horario llena la energía y guarda la calidad', () => {
  const s = fresh();
  L.logHealth(s, D, { bed: '22:45', wake: '06:00', quality: 4 }, D, []);
  const h = s.health[D];
  assert.equal(h.sleep, 7.25);
  assert.equal(h.bed, '22:45');
  assert.equal(h.wake, '06:00');
  assert.equal(h.quality, 4);
  assert.equal(s.energy.max, 10);
  // Corregir a horas sin horario borra las horas de acostarse y levantarse.
  L.logHealth(s, D, { sleep: 5, bed: '', wake: '' }, D, []);
  assert.equal(s.health[D].bed, '');
  assert.equal(s.health[D].sleep, 5);
});

test('sueño: deuda, regularidad (aunque cruce la medianoche) y hora sugerida', () => {
  const s = fresh();
  s.profile.sleepGoal = 8;
  const nights = [['23:30', '06:30'], ['00:30', '07:00'], ['23:00', '06:30'], ['01:00', '07:00']];
  nights.forEach(([b, w], i) => L.logHealth(s, addDays(D, -i), { bed: b, wake: w }, D, []));
  const ins = L.sleepInsights(s, D);
  assert.equal(ins.n, 4);
  assert.equal(ins.debt, 1 + 1.5 + 0.5 + 2);
  assert.equal(ins.spread, 120);
  assert.equal(ins.met, 0);
  assert.ok(ins.tip);
  // Sin hora de levantarte propia, se usa el promedio (6:45).
  assert.equal(ins.wakeAt, '06:45');
  assert.equal(ins.bedAt, '22:30');
  L.setWakeGoal(s, '6:00');
  assert.equal(s.profile.wakeGoal, '06:00');
  assert.equal(L.sleepInsights(s, D).bedAt, '21:45');
  assert.equal(L.bedtimeFor(s, '07:00'), '22:45');
});

test('sueño: la rutina de la posada da XP de Vigor una sola vez por paso', () => {
  const s = fresh();
  const before = s.attrs.salud || 0;
  L.saveInn(s, { mood: 'Bien', routine: ['pantallas', 'cafeina'] }, D, []);
  const one = s.attrs.salud || 0;
  assert.ok(one > before);
  L.saveInn(s, { mood: 'Bien', routine: [] }, D, []);
  L.saveInn(s, { mood: 'Bien', routine: ['pantallas', 'cafeina'] }, D, []);
  assert.equal(s.attrs.salud, one);
  L.saveInn(s, { mood: 'Bien', routine: ['pantallas', 'cafeina', 'cuarto', 'inventado'] }, D, []);
  assert.ok(s.attrs.salud > one);
  assert.deepEqual(s.inn[D].routine, ['pantallas', 'cafeina', 'cuarto']);
  // La hora de levantarte de esa noche no cambia tu meta.
  L.saveInn(s, { wake: '08:30' }, D, []);
  assert.equal(s.profile.wakeGoal, '');
  assert.equal(s.inn[D].wake, '08:30');
});

test('ejercicio: minutos por tipo y semana contra la recomendación', () => {
  const s = fresh();
  L.logHealth(s, D, { exercise: 30, exType: 'caminar' }, D, []);
  L.logHealth(s, D, { exercise: 75, exType: 'gimnasio' }, D, []);
  L.logHealth(s, addDays(D, -1), { exercise: 20 }, D, []);
  assert.deepEqual(s.health[D].exTypes, { caminar: 30, gimnasio: 45 });
  const w = L.exerciseWeek(s, D);
  assert.equal(w.total, 95);
  assert.equal(w.goal, 150);
  assert.deepEqual(w.byType[0], ['gimnasio', 45]);
  L.logHealth(s, D, { exercise: 50 }, D, []);
  assert.equal(Object.values(s.health[D].exTypes).reduce((a, b) => a + b, 0), 50);
});

// ---------- Logros ----------

test('logros: XP en Oficio o Sabiduría, con tope diario', () => {
  const s = fresh();
  const w = L.addWin(s, { title: 'Entregué el informe trimestral', scope: 'profesional', type: 'entrega', impact: 'Cierre de 5 a 3 días', skills: ['Análisis de datos', 'Análisis de datos', ''] }, D, []);
  assert.equal(w.reward.area, 'laborales');
  assert.deepEqual(w.skills, ['Análisis de datos']);
  const a = L.addWin(s, { title: 'Aprobé la certificación', scope: 'academico', type: 'aprendizaje' }, D, []);
  assert.equal(a.reward.area, 'crecimiento');
  const p = L.addWin(s, { title: 'Corrí mis primeros 10 km', scope: 'personal', type: 'meta' }, D, []);
  assert.equal(p.reward.area, null);
  const extra = L.addWin(s, { title: 'Otro más', scope: 'profesional' }, D, []);
  assert.equal(extra.reward, null);
  assert.equal(s.wins.length, 4);
  assert.equal(L.winStats(s.wins).byType.entrega, 1);
});

test('logros: orden por fecha, edición, períodos y resumen para la evaluación', () => {
  const s = fresh();
  L.addWin(s, { title: 'Viejo', day: '2026-01-15', scope: 'profesional', type: 'reconocimiento' }, D, []);
  L.addWin(s, { title: 'Nuevo', day: '2026-09-20', scope: 'profesional', type: 'mejora', impact: 'Ahorro de 4 horas por semana', skills: ['Mejora continua'] }, D, []);
  assert.equal(s.wins[0].title, 'Nuevo');
  L.updateWin(s, s.wins[1].id, { day: '2026-09-25' });
  assert.equal(s.wins[0].title, 'Viejo');
  const q = L.periodRange('trimestre', D);
  assert.equal(q.from, '2026-07-01');
  assert.equal(L.periodRange('semestre', D).from, '2026-07-01');
  assert.equal(L.periodRange('ano', D).from, '2026-01-01');
  const txt = L.winsText(s.wins, 'Este año');
  assert.match(txt, /^Logros · Este año \(2\)/);
  assert.match(txt, /PROFESIONAL/);
  assert.match(txt, /Impacto: Ahorro de 4 horas por semana/);
  assert.match(txt, /20 de septiembre de 2026/);
  const csv = L.winsCSV([{ day: D, scope: 'profesional', type: 'otro', title: 'Con; punto y coma', impact: 'Dijo "bien"', skills: [], evidence: '' }]);
  assert.match(csv, /"Con; punto y coma"/);
  assert.match(csv, /"Dijo ""bien"""/);
  L.removeWin(s, s.wins[0].id);
  assert.equal(s.wins.length, 1);
});

test('logros: recordatorio de fin de semana', () => {
  const s = fresh();
  assert.equal(L.winPromptDue(s, D), false); // lunes
  const fri = '2026-10-02';
  assert.equal(L.winPromptDue(s, fri), true);
  L.dismissWinPrompt(s, fri);
  assert.equal(L.winPromptDue(s, '2026-10-03'), false);
  assert.equal(L.winPromptDue(s, '2026-10-09'), true);
  L.addWin(s, { title: 'Algo', scope: 'personal' }, '2026-10-09', []);
  assert.equal(L.winPromptDue(s, '2026-10-10'), false);
});

test('insignias nuevas: casa en orden, buen descanso y hoja de vida viva', () => {
  const s = fresh();
  for (let i = 0; i < 7; i++) L.logHealth(s, addDays(D, -i), { sleep: 7.5 }, D, []);
  assert.ok(s.achievements.descanso7);
  for (let i = 0; i < 10; i++) L.addWin(s, { title: `Logro ${i}`, scope: 'personal' }, addDays(D, i), []);
  assert.ok(s.achievements.logros10);
});
