import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/game/logic.js';
import * as M from '../src/game/mind.js';
import { PROGRAM, EMOTIONS, WHEEL } from '../src/game/wellness.js';
import { migrate } from '../src/app/store.js';
import { merge3 } from '../src/game/merge.js';
import { classifyMission } from '../src/game/parse.js';

const D = '2026-10-19';

function fresh(day = D) {
  const s = L.defaultState(day);
  s.profile.onboarded = true;
  return s;
}
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

test('sesión de calma: se guarda, da XP de Temple, suma minutos y completa la misión de meditar', () => {
  const s = fresh();
  const m = L.addMission(s, { title: 'Meditar 10 minutos', area: 'emocional', cost: 1, kind: 'habit', auto: { metric: 'calm', gte: 10 } }, D);
  const before = s.attrs.emocional;
  const ev = [];
  M.logCalmSession(s, { kind: 'guiada', ref: 'respiracion', title: 'Respiración consciente', minutes: 5 }, D, ev);
  assert.equal(M.calmMinutes(s, D), 5);
  assert.ok(s.attrs.emocional > before);
  assert.ok(!L.isDone(s, s.missions.find((x) => x.id === m.id), D));
  M.logCalmSession(s, { kind: 'libre', minutes: 6 }, D, ev);
  assert.equal(L.metricValue(s, 'calm', D), 11);
  assert.ok(L.isDone(s, s.missions.find((x) => x.id === m.id), D), 'la misión se completó sola');
  const e = s.mind.calm[0];
  M.setCalmAfter(s, e.id, 'mejor');
  assert.equal(M.calmStats(s, D).better, 1);
});

test('racha de calma y la insignia de 7 días seguidos', () => {
  const s = fresh();
  for (let i = 6; i >= 0; i--) M.logCalmSession(s, { kind: 'respira', minutes: 3 }, addDays(D, -i), []);
  assert.equal(M.calmStreak(s, D), 7);
  assert.equal(M.calmStreak(s, addDays(D, 1)), 7, 'si hoy todavía no, cuenta hasta ayer');
  assert.equal(M.bestCalmStreak(s), 7);
  assert.ok(s.achievements.calma7);
});

test('programa de siete días: cada día una vez y premio al terminar', () => {
  const s = fresh();
  const ev = [];
  for (let n = 1; n <= PROGRAM.days.length; n++) {
    assert.equal(M.programState(s).next, n);
    M.logCalmSession(s, { kind: 'guiada', minutes: 5, program: n }, addDays(D, n), ev);
  }
  M.logCalmSession(s, { kind: 'guiada', minutes: 5, program: 3 }, D, ev); // repetir no cuenta doble
  const st = M.programState(s);
  assert.equal(st.next, null);
  assert.equal(st.count, 7);
  assert.ok(ev.some((e) => e.type === 'programDone'));
  assert.ok(s.achievements.programa7);
});

test('emociones: los sustantivos y las palabras de antes (también en femenino) son la misma emoción', () => {
  assert.equal(EMOTIONS.flat().length, 80);
  assert.equal(M.emotionOf('Ansiedad').quad, 0);
  assert.equal(M.emotionOf('Estresado').word, 'Estrés');
  assert.equal(M.emotionOf('estresada').word, 'Estrés');
  assert.equal(M.emotionOf('Agradecida').word, 'Gratitud');
  assert.equal(M.emotionOf('En calma').word, 'Calma');
  assert.equal(M.emotionOf('xyz'), null);
  const s = fresh();
  L.addMood(s, { quad: 0, words: ['Estresado', 'Estrés', 'Ansiedad'] }, D, []);
  L.addMood(s, { quad: 3, words: ['Gratitud'], body: ['Pecho', 'Hombros'] }, D, []);
  assert.equal(M.distinctEmotions(s), 3);
  assert.deepEqual(s.moods[0].body, ['Pecho', 'Hombros']);
});

test('patrones: el ánimo con y sin dormir la meta, por influencia y por día de la semana', () => {
  const s = fresh();
  s.profile.sleepGoal = 7;
  for (let i = 0; i < 12; i++) {
    const day = addDays(D, -i);
    const good = i % 2 === 0;
    s.health[day] = { sleep: good ? 8 : 5 };
    s.moods.push({ id: `m${i}`, day, ts: new Date(`${day}T09:00:00`).getTime(), quad: good ? 3 : 2, words: [good ? 'Calma' : 'Cansancio'], influences: good ? ['familia'] : ['trabajo'], note: '' });
  }
  const p = M.moodPatterns(s, D);
  assert.equal(p.n, 12);
  assert.equal(p.sleep.yes, 1);
  assert.equal(p.sleep.no, 0);
  assert.ok(p.influences.find((x) => x.key === 'trabajo').diff < 0);
  assert.ok(p.influences.find((x) => x.key === 'familia').diff > 0);
  assert.equal(p.top[0].n, 6);
  const map = M.dayMoods(s, addDays(D, -20), D);
  assert.equal(map.get(D), 3);
  assert.equal(map.size, 12);
});

test('diario: XP una vez al día, cosas buenas y la métrica del diario', () => {
  const s = fresh();
  const ev = [];
  const x0 = s.attrs.crecimiento;
  M.addJournal(s, { kind: 'pregunta', prompt: M.promptOfDay(D), text: 'Hoy aprendí a pedir ayuda.' }, D, ev);
  const x1 = s.attrs.crecimiento;
  assert.ok(x1 > x0);
  M.addJournal(s, { kind: 'libre', text: 'Otra entrada.' }, D, ev);
  assert.equal(s.attrs.crecimiento, x1, 'la segunda entrada del día no da XP');
  assert.equal(M.addJournal(s, { kind: 'libre', text: '   ' }, D, ev), null);
  M.addJournal(s, { kind: 'gratitud', items: ['El café con mamá', '', 'Terminé el informe'] }, D, ev);
  assert.equal(M.goodThings(s), 2);
  assert.equal(L.metricValue(s, 'journal', D), 3);
  assert.equal(L.metricValue(s, 'gratitude', D), 2);
  assert.equal(M.journalDays(s), 1);
  assert.notEqual(M.promptOfDay(D), M.promptOfDay(D, 1));
});

test('posada: tres cosas buenas y la intención del día', () => {
  const s = fresh();
  M.setIntent(s, 'Escuchar con calma', D, []);
  const x0 = s.attrs.emocional;
  L.saveInn(s, { mood: 'Bien', goods: ['Caminé con mi hermana', 'Terminé el informe', ''], better: 'Dormir antes', intent: 'si' }, D, []);
  assert.deepEqual(s.inn[D].goods, ['Caminé con mi hermana', 'Terminé el informe']);
  assert.equal(s.inn[D].good, 'Caminé con mi hermana · Terminé el informe');
  assert.equal(s.mind.intents[D].done, 'si');
  assert.ok(s.attrs.emocional >= x0 + 10 + 5 + 5);
  assert.equal(M.goodThings(s), 2);
});

test('descarga mental: lo que depende de ti se vuelve pendiente; lo demás se suelta', () => {
  const s = fresh();
  const r = M.addWorries(s, [
    { text: 'La cuota del carro', kind: 'puedo', step: 'Llamar al banco el lunes' },
    { text: 'El clima del viaje', kind: 'no' },
    { text: '  ', kind: 'puedo' },
  ], D, []);
  assert.deepEqual(r, { todos: 1, released: 1 });
  assert.equal(s.todos[0].title, 'Llamar al banco el lunes');
  assert.match(s.todos[0].note, /cuota del carro/);
  assert.equal(s.mind.worries.length, 2);
});

test('replantear un pensamiento: guarda antes y después', () => {
  const s = fresh();
  assert.equal(M.addThought(s, { thought: '' }, D, []), null);
  const e = M.addThought(s, { situation: 'No me respondió', thought: 'Está molesta conmigo', emotion: 'Ansiedad', before: 8, traps: ['mente', 'futuro'], alt: 'Puede estar ocupada', after: 4 }, D, []);
  assert.equal(e.before, 8);
  assert.equal(e.after, 4);
  assert.deepEqual(e.traps, ['mente', 'futuro']);
});

test('OMS-5: puntaje de 0 a 100, bienestar bajo bajo 52 y cada dos semanas', () => {
  const s = fresh();
  assert.equal(M.wellbeingInfo(s, D).due, true);
  const a = M.addWellbeing(s, [3, 3, 2, 4, 3], addDays(D, -20), []);
  assert.equal(a.score, 60);
  assert.equal(M.addWellbeing(s, [1, 2], D, []), null);
  const b = M.addWellbeing(s, [2, 2, 2, 2, 2], D, []);
  assert.equal(b.score, 40);
  const w = M.wellbeingInfo(s, D);
  assert.equal(w.last.id, b.id);
  assert.equal(w.change, -20);
  assert.equal(w.low, true);
  assert.equal(w.due, false);
  assert.equal(M.wellbeingInfo(s, addDays(D, 14)).due, true);
});

test('rueda de la vida y valores', () => {
  const s = fresh();
  const sc = { salud: 7, mente: 6, relaciones: 8, crecimiento: 7, dinero: 4, trabajo: 6, hogar: 9, disfrute: 4 };
  M.addWheel(s, sc, D, []);
  const w = M.wheelInfo(s);
  assert.deepEqual(w.low, ['dinero', 'disfrute']);
  assert.equal(w.avg, Object.values(sc).reduce((a, b) => a + b, 0) / WHEEL.length);
  assert.ok(s.achievements.rueda);
  M.setValues(s, ['familia', 'salud', 'inventado', 'fe', 'aprendizaje', 'paz', 'humor'], D);
  assert.deepEqual(s.mind.values.keys, ['familia', 'salud', 'fe', 'aprendizaje', 'paz']);
});

test('revisión de la semana: una por semana, con su foco como pendiente', () => {
  const s = fresh(); // lunes 19 de octubre de 2026
  assert.equal(M.weekStart(D), '2026-10-19');
  assert.equal(M.weekStart('2026-10-25'), '2026-10-19');
  assert.equal(M.reviewDue(s, '2026-10-25', 10), true);
  assert.equal(M.reviewDue(s, '2026-10-22', 20), false);
  const x0 = s.attrs.crecimiento;
  M.saveReview(s, { good: 'Avancé', hard: 'Dormí poco', learned: 'Pedir ayuda', focus: 'Terminar la presentación', focusTodo: true, values: { familia: 4 } }, '2026-10-25', []);
  assert.equal(M.reviewDue(s, '2026-10-25', 10), false);
  assert.equal(s.todos[0].title, 'Terminar la presentación');
  const x1 = s.attrs.crecimiento;
  assert.ok(x1 > x0);
  M.saveReview(s, { good: 'Avancé mucho', focus: 'Terminar la presentación', focusTodo: true }, '2026-10-25', []);
  assert.equal(s.attrs.crecimiento, x1, 'editarla no da XP otra vez');
  assert.equal(s.todos.filter((t) => t.title === 'Terminar la presentación').length, 1);
  assert.equal(s.mind.reviews.length, 1);
});

test('salud: frutas y verduras, lo destacado y las nuevas métricas', () => {
  const s = fresh();
  L.logHealth(s, D, { veg: 5 }, D, []);
  assert.equal(s.health[D].veg, 5);
  for (let i = 0; i < 14; i++) {
    const day = addDays(D, -i);
    L.logHealth(s, day, { sleep: i < 7 ? 7.5 : 6.5, steps: i < 7 ? 9000 : 7000 }, D, []);
  }
  const h = M.healthHighlights(s, D);
  assert.ok(h.length >= 2);
  assert.ok(h.some((x) => x.key === 'steps' && /2,000 más/.test(x.text)), JSON.stringify(h));
  assert.ok(h.some((x) => x.key === 'sleep' && /1 h más/.test(x.text)), JSON.stringify(h));
});

test('migración: datos de antes reciben su espacio de mente y las misiones de meditar se vuelven automáticas', () => {
  const old = fresh();
  delete old.mind;
  old.journal = [{ id: 'j1', day: D, text: 'Nota vieja' }, { bad: true }];
  old.missions.push({ id: 'mx', title: 'Meditar 10 minutos', area: 'emocional', cost: 1, kind: 'habit', days: null, created: D, auto: null, feed: 'calm' });
  old.missions.push({ id: 'my', title: '5 minutos de respiración', area: 'emocional', cost: 1, kind: 'habit', days: null, created: D, auto: null });
  const m = migrate(JSON.parse(JSON.stringify(old)));
  assert.ok(Array.isArray(m.mind.calm));
  assert.deepEqual(m.mind.values, { keys: [], since: null });
  assert.equal(m.journal.length, 1);
  assert.deepEqual(m.missions.find((x) => x.id === 'mx').auto, { metric: 'calm', gte: 10 });
  assert.equal(m.missions.find((x) => x.id === 'mx').feed, null);
  assert.deepEqual(m.missions.find((x) => x.id === 'my').auto, { metric: 'calm', gte: 5 });
  assert.deepEqual(classifyMission('Meditar 15 minutos').auto, { metric: 'calm', gte: 15 });
  assert.deepEqual(classifyMission('Escribir en mi diario').auto, { metric: 'journal', gte: 1 });
});

test('sincronización: sesiones y entradas hechas en dos teléfonos se juntan', () => {
  const base = fresh();
  L.logHealth(base, D, { veg: 1 }, D, []);
  const a = JSON.parse(JSON.stringify(base));
  const b = JSON.parse(JSON.stringify(base));
  M.logCalmSession(a, { kind: 'respira', minutes: 3 }, D, []);
  M.addJournal(a, { kind: 'libre', text: 'Desde el teléfono' }, D, []);
  M.logCalmSession(b, { kind: 'guiada', minutes: 10 }, D, []);
  M.addWellbeing(b, [3, 3, 3, 3, 3], D, []);
  L.logHealth(a, D, { veg: 3 }, D, []); // +2 en este teléfono
  L.logHealth(b, D, { veg: 4 }, D, []); // +3 en el otro
  const m = merge3(base, a, b, '');
  assert.equal(m.mind.calm.length, 2);
  assert.equal(m.journal.length, 1);
  assert.equal(m.mind.checks.length, 1);
  assert.equal(m.health[D].veg, 6, 'las porciones se suman como el agua');
});
