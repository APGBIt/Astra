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
