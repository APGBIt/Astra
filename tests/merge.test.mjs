import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/game/logic.js';
import { merge3, mergeStates, same } from '../src/game/merge.js';

const D = '2026-10-18';
const clone = (x) => structuredClone(x);
function base() {
  const s = L.defaultState(D);
  s.profile.onboarded = true;
  s.profile.name = 'Ana Prueba';
  L.addTodo(s, { title: 'Pagar la luz', cat: 'finanzas', due: D }, D);
  L.addTodo(s, { title: 'Llamar a la tía', cat: 'relaciones', due: D }, D);
  return s;
}

test('si solo cambió un lado, gana ese lado', () => {
  const b = base();
  const l = clone(b);
  const r = clone(b);
  r.profile.name = 'Ana P.';
  assert.equal(mergeStates(b, l, r).profile.name, 'Ana P.');
  l.profile.sleepGoal = 8;
  const m = mergeStates(b, l, r);
  assert.equal(m.profile.name, 'Ana P.');
  assert.equal(m.profile.sleepGoal, 8);
});

test('pendientes de los dos equipos se juntan; lo borrado en uno se borra', () => {
  const b = base();
  const l = clone(b);
  const r = clone(b);
  L.addTodo(l, { title: 'Comprar pan', cat: 'general' }, D);
  L.addTodo(r, { title: 'Renovar el marbete', cat: 'finanzas' }, D);
  r.todos = r.todos.filter((t) => t.title !== 'Llamar a la tía');
  L.completeTodo(l, l.todos.find((t) => t.title === 'Pagar la luz').id, D, []);
  const m = mergeStates(b, l, r);
  const titles = m.todos.map((t) => t.title).sort();
  assert.deepEqual(titles, ['Comprar pan', 'Pagar la luz', 'Renovar el marbete']);
  assert.ok(m.todos.find((t) => t.title === 'Pagar la luz').done);
});

test('borrado en un lado pero editado en el otro: se conserva', () => {
  const b = base();
  const l = clone(b);
  const r = clone(b);
  const id = b.todos[0].id;
  l.todos = l.todos.filter((t) => t.id !== id);
  r.todos.find((t) => t.id === id).note = 'Antes del viernes';
  const m = mergeStates(b, l, r);
  assert.equal(m.todos.find((t) => t.id === id).note, 'Antes del viernes');
});

test('XP, oro y agua: se suman los avances de los dos', () => {
  const b = base();
  b.xp = 100; b.gold = 10; b.health[D] = { water: 2 };
  const l = clone(b);
  const r = clone(b);
  l.xp = 130; l.gold = 14; l.health[D].water = 3;
  r.xp = 120; r.gold = 12; r.health[D].water = 4;
  const m = mergeStates(b, l, r);
  assert.equal(m.xp, 150);
  assert.equal(m.gold, 16);
  assert.equal(m.health[D].water, 5);
});

test('vitalidad suma cambios pero no pasa de 100; la racha se queda con la mayor', () => {
  const b = base();
  b.vit = 90; b.streak = { count: 4, best: 6, lastDay: '2026-10-17', freezes: 1, freezeDays: [] };
  const l = clone(b);
  const r = clone(b);
  l.vit = 98; r.vit = 97;
  l.streak.count = 5; l.streak.lastDay = D;
  r.streak.count = 5; r.streak.lastDay = D; r.streak.best = 7;
  const m = mergeStates(b, l, r);
  assert.equal(m.vit, 100);
  assert.equal(m.streak.count, 5);
  assert.equal(m.streak.best, 7);
});

test('energía: vale la del día más reciente', () => {
  const b = base();
  const l = clone(b);
  const r = clone(b);
  l.energy = { day: '2026-10-17', max: 8, used: 5, bonus: 0 };
  r.energy = { day: D, max: 10, used: 2, bonus: 1 };
  assert.deepEqual(mergeStates(b, l, r).energy, r.energy);
});

test('rutinas del hogar hechas en los dos equipos: un solo pendiente abierto', () => {
  const b = base();
  const c = L.addChore(b, { title: 'Limpiar el baño', freq: { type: 'every', n: 7, unit: 'day' }, mins: 30 }, D);
  const l = clone(b);
  const r = clone(b);
  const tid = b.todos.find((t) => t.chore === c.id).id;
  L.completeTodo(l, tid, D, []);
  L.completeTodo(r, tid, D, []);
  const m = mergeStates(b, l, r);
  L.syncChores(m, D);
  assert.equal(m.todos.filter((t) => t.chore === c.id && !t.done).length, 1);
  assert.deepEqual(m.chores[0].log, [D]);
});

test('sin estado común: se juntan las listas, sin duplicar lo igual, y los contadores no se inflan', () => {
  const l = base();
  const r = base();
  l.xp = 500; r.xp = 520;
  L.addTodo(r, { title: 'Solo en el otro equipo', cat: 'general' }, D);
  const m = mergeStates(undefined, l, r);
  assert.equal(m.xp, 520);
  assert.equal(m.todos.length, 3);
  assert.equal(m.rewards.length, l.rewards.length);
  const datos = m.record.sections.find((x) => x.id === 'datos');
  assert.equal(datos.fields.length, l.record.sections.find((x) => x.id === 'datos').fields.length);
});

test('listas sin id: se juntan sin repetir y respetan lo que se quitó', () => {
  assert.deepEqual(merge3(['a', 'b'], ['a', 'b', 'c'], ['b', 'd'], 'x'), ['b', 'c', 'd']);
  assert.ok(same({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }));
  assert.ok(!same({ a: 1 }, { a: 1, b: undefined }));
});

test('movimientos nuevos en ambos equipos se conservan todos', () => {
  const b = base();
  const l = clone(b);
  const r = clone(b);
  L.addTx(l, { kind: 'gasto', amount: 500, cat: 'super', merchant: 'Súper', day: D }, D, []);
  L.addTx(r, { kind: 'gasto', amount: 300, cat: 'comida', merchant: 'Cafetería', day: D }, D, []);
  const m = mergeStates(b, l, r);
  assert.equal(m.money.tx.length, 2);
});
