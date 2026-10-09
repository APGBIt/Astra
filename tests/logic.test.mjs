import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/game/logic.js';
import { addDays } from '../src/app/dates.js';

const D = '2026-09-28'; // lunes

function fresh() {
  const s = L.defaultState(D);
  s.profile.onboarded = true;
  return s;
}

test('niveles: umbrales crecientes', () => {
  assert.equal(L.playerLevel(0).n, 1);
  assert.equal(L.playerLevel(99).n, 1);
  assert.equal(L.playerLevel(100).n, 2);
  assert.equal(L.playerLevel(250).n, 3);
  assert.equal(L.attrLevel(50).n, 2);
});

test('energía según el sueño', () => {
  assert.equal(L.energyMaxFromSleep(7, 7), 10);
  assert.equal(L.energyMaxFromSleep(6, 7), 8);
  assert.equal(L.energyMaxFromSleep(6.5, 7), 9);
  assert.equal(L.energyMaxFromSleep(2, 7), 4);
  assert.equal(L.energyMaxFromSleep(null, 7), 8);
});

test('completar misión: XP, oro, energía, vitalidad y racha', () => {
  const s = fresh();
  const m = L.addMission(s, { title: 'Leer 20 páginas', area: 'crecimiento', cost: 1 }, D);
  const ev = [];
  const r = L.completeMission(s, m.id, D, ev);
  assert.ok(r.xp >= 10);
  assert.equal(s.gold, 5 + 25); // misión + logro «Primer paso»
  assert.equal(L.energyInfo(s, D).used, 1);
  assert.equal(s.vit, 81);
  assert.equal(s.streak.count, 1);
  assert.ok(ev.some((e) => e.type === 'achievement'));
  // no se completa dos veces
  assert.equal(L.completeMission(s, m.id, D, []), null);
  // deshacer
  assert.ok(L.undoMission(s, m.id, D));
  assert.equal(s.vit, 80);
  assert.equal(L.energyInfo(s, D).used, 0);
});

test('bono de clase +20 %', () => {
  const s = fresh();
  s.profile.classKeys = ['finanzas'];
  const a = L.addMission(s, { title: 'Anota gastos', area: 'finanzas', cost: 1 }, D);
  const b = L.addMission(s, { title: 'Leer', area: 'crecimiento', cost: 1 }, D);
  const ra = L.completeMission(s, a.id, D, []);
  const rb = L.completeMission(s, b.id, D, []);
  assert.equal(ra.xp, 12);
  assert.equal(rb.xp, 10);
});

test('sin energía, la misión cuesta vitalidad', () => {
  const s = fresh();
  s.energy.used = 8; // total 8 sin datos de sueño
  const m = L.addMission(s, { title: 'Entrenar', area: 'salud', cost: 2 }, D);
  L.completeMission(s, m.id, D, []);
  assert.equal(s.vit, 80 - 4 + 2);
});

test('cierre de día: penaliza misiones marcadas y premia malos hábitos evitados', () => {
  const s = fresh();
  L.addMission(s, { title: 'Dormir 7 horas', area: 'salud', cost: 1, penalty: true }, D);
  const av = L.addMission(s, { title: 'Cero refrescos', area: 'salud', cost: 1, kind: 'avoid' }, D);
  const ev = L.reconcile(s, addDays(D, 1));
  assert.equal(s.vit, 77);
  assert.ok(s.days[D].avoided[av.id]);
  assert.ok(s.attrs.salud >= 5);
  assert.ok(Array.isArray(ev));
});

test('al volver tras muchos días solo penalizan los dos últimos', () => {
  const s = fresh();
  L.addMission(s, { title: 'Hábito', area: 'salud', cost: 1, penalty: true }, D);
  L.reconcile(s, addDays(D, 10));
  assert.equal(s.vit, 80 - 3 * 2);
});

test('protectores cubren un día sin actividad', () => {
  const s = fresh();
  const m = L.addMission(s, { title: 'Leer', area: 'crecimiento', cost: 1 }, D);
  L.completeMission(s, m.id, D, []);
  const d2 = addDays(D, 2);
  const ev = L.reconcile(s, d2);
  assert.ok(ev.some((e) => e.type === 'freezeUsed'));
  assert.equal(s.streak.freezes, 0);
  L.completeMission(s, m.id, d2, []);
  assert.equal(s.streak.count, 2);
});

test('vitalidad en 0 abre el modo recuperación y se sale al llegar a 50', () => {
  const s = fresh();
  s.vit = 5;
  const ev = [];
  L.changeVit(s, -10, 'prueba', D, ev);
  assert.equal(s.vit, 0);
  assert.ok(L.inRecovery(s, D));
  assert.ok(ev.some((e) => e.type === 'recovery'));
  L.changeVit(s, 50, 'prueba', D, ev);
  assert.equal(s.recovery, null);
  assert.ok(ev.some((e) => e.type === 'recovered'));
});

test('campaña: tareas, capítulos y jefe con alimentación automática', () => {
  const s = fresh();
  const c = L.startCampaign(s, { area: 'finanzas', goalId: 'deudas', target: 10000, days: 90, intensity: 'normal', missions: L.suggestedMissions('finanzas', 'deudas', 'normal').filter((m) => m.picked) }, D);
  assert.equal(s.missions.length, 2);
  assert.deepEqual(s.profile.classKeys, ['finanzas']);
  const b = s.bosses.find((x) => x.id === c.bossId);
  assert.equal(b.source, 'debtPay');
  const ev = [];
  for (const t of c.chapters[0].tasks) L.setTask(s, c.id, t.id, true, D, ev);
  assert.equal(L.currentChapter(c), 1);
  assert.ok(ev.some((e) => e.type === 'chapter'));
  L.addTx(s, { type: 'gasto', amount: 4000, cat: 'deuda' }, D, ev);
  assert.equal(b.progress, 4000);
  assert.ok(Math.abs(L.bossHP(b) - 0.6) < 1e-9);
  L.addTx(s, { type: 'gasto', amount: 6000, cat: 'deuda' }, D, ev);
  assert.equal(b.status, 'won');
  assert.equal(c.status, 'won');
  assert.ok(s.titles.includes('Libre de cadenas'));
  assert.ok(ev.some((e) => e.type === 'boss'));
});

test('misiones automáticas: pasos y gastos', () => {
  const s = fresh();
  const steps = L.addMission(s, { title: '8,000 pasos', area: 'salud', cost: 1, auto: { metric: 'steps', gte: 8000 } }, D);
  const tx = L.addMission(s, { title: 'Anota gastos', area: 'finanzas', cost: 1, auto: { metric: 'tx', gte: 1 } }, D);
  L.logHealth(s, D, { steps: 8500 }, D, []);
  assert.ok(L.isDone(s, steps, D));
  L.addTx(s, { type: 'gasto', amount: 850, cat: 'super' }, D, []);
  assert.ok(L.isDone(s, tx, D));
});

test('sueño: energía del día y efecto en vitalidad sin duplicar', () => {
  const s = fresh();
  L.logHealth(s, D, { sleep: 6 }, D, []);
  assert.equal(L.energyInfo(s, D).total, 8);
  L.logHealth(s, D, { sleep: 5 }, D, []);
  assert.equal(s.vit, 75);
  L.logHealth(s, D, { sleep: 7.5 }, D, []);
  assert.equal(s.vit, 85);
  assert.equal(L.energyInfo(s, D).total, 10);
  assert.ok(L.statuses(s, D).some((x) => x.id === 'descansado'));
});

test('pociones con límite diario', () => {
  const s = fresh();
  assert.ok(L.usePotion(s, 'siesta', D, []));
  assert.equal(L.usePotion(s, 'siesta', D, []), false);
  assert.equal(L.energyInfo(s, D).total, 10);
});

test('finanzas: resumen del mes y por asignar', () => {
  const s = fresh();
  L.addTx(s, { type: 'ingreso', amount: 30000 }, D, []);
  L.addTx(s, { type: 'gasto', amount: 850, cat: 'super' }, D, []);
  L.setBudget(s, 'super', 9000);
  const m = L.monthSummary(s, '2026-09');
  assert.equal(m.income, 30000);
  assert.equal(m.spent, 850);
  assert.equal(m.unassigned, 21000);
});

test('relaciones: vencidos y cumpleaños', () => {
  const s = fresh();
  const p = L.addPerson(s, { name: 'Luis', every: 14, birthday: '10-02' }, addDays(D, -21));
  assert.equal(L.duePeople(s, D)[0].p.id, p.id);
  assert.equal(L.upcomingBirthdays(s, D)[0].inDays, 4);
  L.contactPerson(s, p.id, 'llamada', D, []);
  assert.equal(L.duePeople(s, D).length, 0);
  assert.equal(L.waLink('809-555-1234'), 'https://wa.me/18095551234');
});

test('tarjetas de repaso tipo Leitner', () => {
  const s = fresh();
  const c = L.addCard(s, 'DAX', 'Lenguaje de fórmulas', D);
  L.reviewCard(s, c.id, true, D, []);
  assert.equal(c.box, 2);
  assert.equal(c.due, addDays(D, 2));
  L.reviewCard(s, c.id, false, D, []);
  assert.equal(c.box, 1);
});

test('siguiente mejor jugada', () => {
  const s = fresh();
  assert.equal(L.nextBestAction(s, D, 8).kind, 'sleep');
  L.logHealth(s, D, { sleep: 7 }, D, []);
  const m = L.addMission(s, { title: 'Entrenar', area: 'salud', cost: 2, penalty: true }, D);
  assert.equal(L.nextBestAction(s, D, 9).mission.id, m.id);
});

// ---------- Versión 1.1 ----------

test('pendientes: XP en su atributo, oro, deshacer y categoría General', () => {
  const s = fresh();
  const a = L.addTodo(s, { title: 'Pagar la luz', cat: 'finanzas', important: true }, D);
  const g = L.addTodo(s, { title: 'Lavar el carro' }, D);
  assert.equal(g.cat, 'general');
  const ev = [];
  const r = L.completeTodo(s, a.id, D, ev);
  assert.equal(r.area, 'finanzas');
  assert.ok(r.xp >= 10);
  assert.ok(s.attrs.finanzas >= 10);
  assert.equal(s.stats.todos, 1);
  assert.equal(s.streak.count, 1);
  const gold = s.gold;
  L.uncompleteTodo(s, a.id);
  assert.equal(s.attrs.finanzas, 0);
  assert.equal(s.gold, gold - r.gold);
  const r2 = L.completeTodo(s, g.id, D, []);
  assert.equal(r2.area, null);
  assert.ok(s.xp >= 5);
  assert.equal(L.completeTodo(s, g.id, D, []), null);
});

test('pendientes: grupos por fecha y orden', () => {
  const s = fresh();
  L.addTodo(s, { title: 'Ayer', due: addDays(D, -1) }, D);
  L.addTodo(s, { title: 'Hoy', due: D }, D);
  L.addTodo(s, { title: 'Mañana', due: addDays(D, 1) }, D);
  L.addTodo(s, { title: 'Semana', due: addDays(D, 5) }, D);
  L.addTodo(s, { title: 'Luego', due: addDays(D, 20) }, D);
  L.addTodo(s, { title: 'Sin fecha' }, D);
  const by = Object.fromEntries(s.todos.map((t) => [t.title, L.todoBucket(t, D)]));
  assert.deepEqual(by, { Ayer: 'vencidos', Hoy: 'hoy', Mañana: 'manana', Semana: 'semana', Luego: 'despues', 'Sin fecha': 'sinfecha' });
  assert.deepEqual(L.todosDue(s, D).map((t) => t.title), ['Ayer', 'Hoy']);
  L.addTodo(s, { title: 'Urgente', important: true, due: addDays(D, 3) }, D);
  assert.equal(L.sortTodos(L.pendingTodos(s))[0].title, 'Urgente');
});

test('pendientes: categorías propias con atributo y al borrarlas pasan a General', () => {
  const s = fresh();
  const l = L.addTodoList(s, { name: 'Casa', area: 'salud' });
  const t = L.addTodo(s, { title: 'Limpiar nevera', cat: l.id }, D);
  assert.equal(L.todoCategory(s, t.cat).name, 'Casa');
  const r = L.completeTodo(s, t.id, D, []);
  assert.equal(r.area, 'salud');
  L.uncompleteTodo(s, t.id);
  L.removeTodoList(s, l.id);
  assert.equal(t.cat, 'general');
  assert.equal(L.todoCategories(s).length, 7);
});

test('expediente: secciones fijas, XP una sola vez por dato y avisos de vencimiento', () => {
  const s = fresh();
  assert.ok(L.recordSection(s, 'datos'));
  const f = L.recordSection(s, 'datos').fields[0];
  L.setRecordField(s, 'datos', f.id, 'Ana Prueba', D, []);
  const xp1 = s.xp;
  assert.ok(xp1 > 0);
  L.setRecordField(s, 'datos', f.id, 'Ana Prueba Pérez', D, []);
  assert.equal(s.xp, xp1);
  const doc = L.addRecordItem(s, 'documentos', { title: 'Pasaporte', end: addDays(D, 20) }, D, []);
  L.addRecordItem(s, 'documentos', { title: 'Licencia', end: addDays(D, 400) }, D, []);
  const al = L.recordAlerts(s, D);
  assert.equal(al.length, 1);
  assert.equal(al[0].item.id, doc.id);
  assert.equal(al[0].inDays, 20);
  const t = L.alertToTodo(s, 'documentos', doc.id, D);
  assert.equal(t.title, 'Renovar pasaporte');
  assert.equal(t.due, addDays(D, 6));
  assert.equal(L.alertToTodo(s, 'documentos', doc.id, D), null);
  assert.ok(L.hasAlertTodo(s, 'documentos', doc));
  const p = L.recordProgress(s);
  assert.ok(p.filled >= 2 && p.pct > 0);
});

test('expediente: secciones propias y datos agregados', () => {
  const s = fresh();
  const sec = L.addRecordSection(s, { title: 'Mi carro', kind: 'fields', area: 'finanzas' });
  const f = L.addRecordField(s, sec.id, { label: 'Placa', secret: true });
  L.setRecordField(s, sec.id, f.id, 'A123456', D, []);
  assert.equal(L.recordSection(s, sec.id).fields[0].value, 'A123456');
  L.removeRecordSection(s, 'datos');
  assert.ok(L.recordSection(s, 'datos'), 'las secciones fijas no se borran');
  L.removeRecordSection(s, sec.id);
  assert.equal(L.recordSection(s, sec.id), null);
});

test('metas: editar el número del jefe y vencerlo al alcanzarlo', () => {
  const s = fresh();
  const c = L.startCampaign(s, { area: 'salud', goalId: 'entrenar', target: 24, days: 60, intensity: 'normal', missions: [] }, D);
  const b = s.bosses.find((x) => x.id === c.bossId);
  L.hitBoss(s, b.id, 10, '', D, []);
  L.editCampaign(s, c.id, { target: 30, deadline: addDays(D, 100), title: 'Entrenar fuerte' }, D, []);
  assert.equal(b.target, 30);
  assert.equal(c.days, 100);
  assert.equal(c.title, 'Entrenar fuerte');
  const ev = [];
  L.editCampaign(s, c.id, { target: 8 }, D, ev);
  assert.equal(b.status, 'won');
  assert.ok(ev.some((e) => e.type === 'boss'));
});

test('metas: tareas propias en los capítulos', () => {
  const s = fresh();
  const c = L.startCampaign(s, { area: 'crecimiento', goalId: 'custom', title: 'Terminar la maestría', target: 6, unit: 'módulos', days: 180, missions: [] }, D);
  const t = L.addTask(s, c.id, 0, 'Inscribirme en el módulo 3');
  assert.ok(c.chapters[0].tasks.some((x) => x.id === t.id));
  L.renameTask(s, c.id, t.id, 'Inscribirme en el módulo 4');
  assert.equal(t.title, 'Inscribirme en el módulo 4');
  L.removeTask(s, c.id, t.id);
  assert.ok(!c.chapters[0].tasks.some((x) => x.id === t.id));
});

test('metas diarias propias: la meta de pasos alimenta al jefe', () => {
  const s = fresh();
  s.profile.goals.steps = 10000;
  const c = L.startCampaign(s, { area: 'salud', goalId: 'moverse', target: 30, days: 30, intensity: 'normal', missions: [] }, D);
  const b = s.bosses.find((x) => x.id === c.bossId);
  L.logHealth(s, D, { steps: 9000 }, D, []);
  assert.equal(b.progress, 0);
  L.logHealth(s, D, { steps: 10500 }, D, []);
  assert.equal(b.progress, 1);
  const sug = L.suggestedMissions('salud', 'moverse', 'normal', s)[0];
  assert.equal(sug.title, '10,000 pasos');
  assert.equal(sug.auto.gte, 10000);
});

test('un entrenamiento cuenta una sola vez al día aunque marques la misión y el ejercicio', () => {
  const s = fresh();
  const c = L.startCampaign(s, { area: 'salud', goalId: 'entrenar', target: 24, days: 60, intensity: 'normal', missions: [{ title: 'Entrenar 30 minutos', cost: 2, feed: 'training' }] }, D);
  const b = s.bosses.find((x) => x.id === c.bossId);
  const m = s.missions[0];
  L.completeMission(s, m.id, D, []);
  L.logHealth(s, D, { exercise: 40 }, D, []);
  assert.equal(b.progress, 1);
});

test('misiones archivadas se pueden restaurar', () => {
  const s = fresh();
  const m = L.addMission(s, { title: 'Leer', area: 'crecimiento', cost: 1 }, D);
  L.archiveMission(s, m.id);
  assert.equal(L.dayMissions(s, D).all.length, 0);
  L.restoreMission(s, m.id);
  assert.equal(L.dayMissions(s, D).all.length, 1);
});

test('siguiente mejor jugada sugiere un pendiente vencido si no hay misiones', () => {
  const s = fresh();
  L.logHealth(s, D, { sleep: 7 }, D, []);
  const t = L.addTodo(s, { title: 'Pagar la luz', due: addDays(D, -1) }, D);
  const n = L.nextBestAction(s, D, 10);
  assert.equal(n.kind, 'todo');
  assert.equal(n.todo.id, t.id);
});

test('pendientes que se repiten: al completarlos aparece el siguiente y deshacer lo quita', () => {
  const s = fresh();
  const ev = [];
  const t = L.addTodo(s, { title: 'Pagar la luz', cat: 'finanzas', due: '2026-10-15', repeat: 'mes' }, D);
  assert.equal(t.anchor, 15);
  const r = L.completeTodo(s, t.id, D, ev);
  assert.equal(r.next, '2026-11-15');
  const next = s.todos.find((x) => !x.done && x.title === 'Pagar la luz');
  assert.equal(next.due, '2026-11-15');
  assert.equal(next.repeat, 'mes');
  L.uncompleteTodo(s, t.id);
  assert.equal(s.todos.filter((x) => x.title === 'Pagar la luz').length, 1);
  // Atrasado varios meses: el siguiente queda en el futuro.
  const old = L.addTodo(s, { title: 'Cuota del gimnasio', due: '2026-06-28', repeat: 'mes' }, D);
  assert.equal(L.completeTodo(s, old.id, D, ev).next, '2026-10-28');
  // Fin de mes: el 31 pasa al último día del mes siguiente y vuelve al 31.
  assert.equal(L.nextRepeat('2026-01-31', 'mes', 31), '2026-02-28');
  assert.equal(L.nextRepeat('2026-02-28', 'mes', 31), '2026-03-31');
  assert.equal(L.nextRepeat('2026-10-09', 'semana'), '2026-10-16');
  assert.equal(L.nextRepeat('2028-02-29', 'ano', 29), '2029-02-28');
  // Si se repite y no tiene fecha, empieza hoy.
  assert.equal(L.addTodo(s, { title: 'Regar las plantas', repeat: 'semana' }, D).due, D);
});

test('posponer un pendiente que se repite no mueve la serie', () => {
  const s = fresh();
  // Lunes 28 de septiembre: la factura vence el 20 y no llegaste.
  const t = L.addTodo(s, { title: 'Pagar el internet', cat: 'finanzas', due: '2026-09-20', repeat: 'mes' }, D);
  assert.equal(t.anchor, 20);
  L.postponeTodo(s, t.id, addDays(D, 1));
  assert.equal(t.due, '2026-09-29');
  assert.equal(t.anchor, 20);
  const r = L.completeTodo(s, t.id, addDays(D, 1), []);
  assert.equal(r.next, '2026-10-20');
  // Cambiar la fecha a mano sí mueve la serie.
  const w = L.addTodo(s, { title: 'Sacar la basura', due: D, repeat: 'semana' }, D);
  L.updateTodo(s, w.id, { due: addDays(D, 2) }, D);
  assert.equal(L.completeTodo(s, w.id, addDays(D, 2), []).next, addDays(D, 9));
  // Posponer uno semanal: el siguiente sigue en lunes.
  const g = L.addTodo(s, { title: 'Revisar el presupuesto', due: D, repeat: 'semana' }, D);
  L.postponeTodo(s, g.id, addDays(D, 2));
  assert.equal(L.completeTodo(s, g.id, addDays(D, 2), []).next, addDays(D, 7));
  assert.equal(L.postponeTodo(s, g.id, 'mañana'), null);
});

test('pasar a hoy los vencidos (todos o solo los que ves)', () => {
  const s = fresh();
  const a = L.addTodo(s, { title: 'A', due: addDays(D, -3) }, D);
  const b = L.addTodo(s, { title: 'B', due: addDays(D, -1), cat: 'salud' }, D);
  const c = L.addTodo(s, { title: 'C', due: addDays(D, 2) }, D);
  assert.equal(L.overdueToToday(s, D, [b.id]), 1);
  assert.equal(b.due, D);
  assert.equal(a.due, addDays(D, -3));
  assert.equal(L.overdueToToday(s, D), 1);
  assert.equal(a.due, D);
  assert.equal(c.due, addDays(D, 2));
});

test('los pendientes de un área incluyen tus categorías que suben ese atributo', () => {
  const s = fresh();
  const m = L.addTodoList(s, { name: 'Maestría', area: 'crecimiento' });
  L.addTodo(s, { title: 'Leer el caso', cat: 'crecimiento' }, D);
  L.addTodo(s, { title: 'Entregar el ensayo', cat: m.id }, D);
  L.addTodo(s, { title: 'Pagar la luz', cat: 'finanzas' }, D);
  assert.deepEqual(L.todosForArea(s, 'crecimiento').map((t) => t.title).sort(), ['Entregar el ensayo', 'Leer el caso']);
  assert.equal(L.todosIn(s, 'crecimiento').length, 1);
});

test('meta de pasos propia: las misiones de pasos la siguen', () => {
  const s = fresh();
  const m = L.addMission(s, { title: '8,000 pasos', area: 'salud', cost: 1, auto: { metric: 'steps', gte: 8000 } }, D);
  const other = L.addMission(s, { title: 'Caminata larga: 15000 pasos', area: 'salud', cost: 2, auto: { metric: 'steps', gte: 15000 } }, D);
  L.setDailyGoal(s, 'steps', 10000, D);
  assert.equal(L.dailyGoal(s, 'steps'), 10000);
  assert.equal(m.title, '10,000 pasos');
  assert.equal(m.auto.gte, 10000);
  assert.equal(other.auto.gte, 15000);
  assert.equal(other.title, 'Caminata larga: 15000 pasos');
  // Ya no se completa con 9,000 pasos.
  L.logHealth(s, D, { steps: 9000 }, D, []);
  assert.equal(L.isDone(s, m, D), false);
  L.logHealth(s, D, { steps: 10500 }, D, []);
  assert.equal(L.isDone(s, m, D), true);
  // Sueño: la energía de hoy se recalcula con la meta nueva.
  L.logHealth(s, D, { sleep: 7 }, D, []);
  assert.equal(L.energyInfo(s, D).max, 10);
  L.setDailyGoal(s, 'sleep', 8, D);
  assert.equal(s.profile.sleepGoal, 8);
  assert.equal(L.energyInfo(s, D).max, 8);
  L.setDailyGoal(s, 'water', 0, D);
  assert.equal(L.dailyGoal(s, 'water'), 8);
});

test('expediente: la sección de cuentas y seguros entra en su lugar al actualizar', () => {
  const s = fresh();
  const ids = s.record.sections.map((x) => x.id);
  assert.ok(ids.indexOf('patrimonio') === ids.indexOf('trayectoria') + 1);
  // Un expediente guardado antes de existir la sección la recibe después de «Trayectoria laboral».
  s.record.sections = s.record.sections.filter((x) => x.id !== 'patrimonio');
  L.addRecordSection(s, { title: 'Mi vehículo', kind: 'fields' });
  L.ensureRecord(s);
  const after = s.record.sections.map((x) => x.id);
  assert.equal(after[after.indexOf('trayectoria') + 1], 'patrimonio');
  assert.equal(after[after.length - 1].startsWith('x'), true);
  const it = L.addRecordItem(s, 'patrimonio', { title: 'Seguro de la casa', detail: 'Universal', end: addDays(D, 20) }, D, []);
  assert.ok(it);
  assert.ok(L.recordAlerts(s, D, 30).some((a) => a.item.id === it.id));
});

test('cuentas y tarjetas: se guarda solo el final del número', () => {
  const s = fresh();
  const it = L.addRecordItem(s, 'patrimonio', { title: 'Tarjeta de crédito', detail: 'Popular 4111 1111 1111 1234' }, D, []);
  assert.equal(it.detail, 'Popular •••• 1234');
  L.updateRecordItem(s, 'patrimonio', it.id, { detail: 'Banreservas 9600-1234-5678' });
  assert.equal(it.detail, 'Banreservas •••• 5678');
  assert.equal(L.keepLast4('AFP Popular · 1234'), 'AFP Popular · 1234');
  assert.equal(L.keepLast4('Placa A123456'), 'Placa A123456');
  // En documentos no se recorta (la cédula se guarda completa y se oculta en pantalla).
  const d = L.addRecordItem(s, 'documentos', { title: 'Cédula', detail: '001-1234567-8' }, D, []);
  assert.equal(d.detail, '001-1234567-8');
});
