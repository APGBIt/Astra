import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/game/logic.js';
import * as S from '../src/game/shop.js';
import { parseShopLine, parseShopPhrase } from '../src/game/shoplex.js';
import { parseCapture } from '../src/game/parse.js';
import { mergeStates } from '../src/game/merge.js';
import { checkShopScan } from '../src/ai/ai.js';

const D = '2026-10-24';
function fresh() {
  const s = L.defaultState(D);
  s.profile.onboarded = true;
  return s;
}
const add = (s, text, day = D) => S.parseAndAdd(s, text, { today: day });

test('parser: lista con comas y cantidades', () => {
  const p = parseShopLine('leche, 2 lb de pollo y pan');
  assert.equal(p.length, 3);
  const pollo = p.find((x) => /pollo/i.test(x.name));
  assert.equal(pollo.qty, 2);
  assert.equal(pollo.unit, 'lb');
});

test('frases: "se acabó el café" y "falta arroz"', () => {
  const a = parseShopPhrase('se acabó el café');
  assert.ok(a && a.out && a.items.length === 1);
  const b = parseShopPhrase('falta arroz');
  assert.ok(b && !b.out);
  assert.equal(parseShopPhrase('hoy hice ejercicio'), null);
});

test('captura rápida produce un item shop', () => {
  const items = parseCapture('agrega leche y huevos a la lista');
  assert.ok(items.some((i) => i.kind === 'shop'));
});

test('agregar junta duplicados y suma cantidades', () => {
  const s = fresh();
  add(s, '2 lb de pollo');
  add(s, '1 lb de pollo');
  const pend = S.shopOf(s).items.filter((i) => !i.done);
  assert.equal(pend.length, 1);
  assert.equal(pend[0].qty, 3);
});

test('cerrar compra: gasto en finanzas, historial, despensa y XP', () => {
  const s = fresh();
  add(s, 'leche, pan, huevos, arroz');
  for (const it of S.shopOf(s).items) S.toggleItem(s, it.id, D);
  const ev = [];
  const r = S.closeTrip(s, { list: S.shopOf(s).lists[0].id, total: 1200, store: 'Jumbo' }, D, ev);
  assert.equal(r.n, 4);
  assert.ok(r.tx && r.tx.cat === 'super');
  assert.equal(S.shopOf(s).items.length, 0);
  assert.equal(S.shopOf(s).pantry.length, 4);
  assert.ok(Object.keys(S.shopOf(s).hist).length === 4);
  assert.ok(r.xp > 0);
  // Segunda compra el mismo día no repite el XP.
  add(s, 'leche, pan, huevos');
  for (const it of S.shopOf(s).items) S.toggleItem(s, it.id, D);
  const r2 = S.closeTrip(s, { list: S.shopOf(s).lists[0].id, total: 300 }, D, ev);
  assert.equal(r2.xp, 0);
});

test('"ya te toca" por frecuencia de compra', () => {
  const s = fresh();
  const days = ['2026-09-10', '2026-09-24', '2026-10-08'];
  for (const d of days) {
    S.parseAndAdd(s, 'leche', { today: d });
    for (const it of S.shopOf(s).items) S.toggleItem(s, it.id, d);
    S.closeTrip(s, { list: S.shopOf(s).lists[0].id, total: 100, saveTx: false, day: d }, d, []);
  }
  const due = S.dueSuggestions(s, '2026-10-23');
  assert.ok(due.some((x) => /leche/i.test(x.name)), JSON.stringify(due));
});

test('despensa: nivel agotado agrega a la lista', () => {
  const s = fresh();
  const e = S.pantryUpsert(s, { name: 'café', level: 'ok' }, D);
  const r = S.setLevel(s, e.id, 'out', D);
  assert.ok(r.added);
  assert.equal(S.shopOf(s).items.length, 1);
});

test('foto: analyzePantry separa lo visto de lo que falta', () => {
  const s = fresh();
  add(s, 'leche');
  for (const it of S.shopOf(s).items) S.toggleItem(s, it.id, D);
  S.closeTrip(s, { list: S.shopOf(s).lists[0].id, total: 100, saveTx: false }, D, []);
  S.parseAndAdd(s, 'leche', { today: '2026-10-10' });
  for (const it of S.shopOf(s).items) S.toggleItem(s, it.id, '2026-10-10');
  S.closeTrip(s, { list: S.shopOf(s).lists[0].id, total: 100, saveTx: false, day: '2026-10-10' }, '2026-10-10', []);
  const a = S.analyzePantry(s, [{ name: 'huevos', level: 'ok' }, { name: 'mantequilla', level: 'low' }], D, [{ name: 'queso rallado', why: 'combina con pasta' }]);
  assert.equal(a.seen.length, 2);
  assert.ok(a.missing.some((m) => /mantequilla/i.test(m.name) && m.src === 'poco'));
  assert.ok(a.missing.some((m) => /leche/i.test(m.name) && m.src === 'habito'));
  assert.ok(a.missing.some((m) => /queso/i.test(m.name) && m.src === 'ia'));
  const r = S.applyScan(s, { seen: a.seen, add: a.missing.filter((m) => m.src === 'poco') }, { today: D, ev: [] });
  assert.equal(r.seen, 2);
  assert.equal(r.added, 1);
});

test('checkShopScan limpia lo que devuelve la IA', () => {
  const r = checkShopScan({ productos: [{ nombre: ' Leche ', cantidad: 2, unidad: 'xx', nivel: 'poco', vence: 'mañana' }, { nombre: '' }], ideas: [{ nombre: 'sal', motivo: 'falta' }] }, 'despensa');
  assert.equal(r.seen.length, 1);
  assert.equal(r.seen[0].unit, null);
  assert.equal(r.seen[0].level, 'low');
  assert.equal(r.seen[0].best, null);
  assert.equal(r.ideas.length, 1);
  assert.deepEqual(checkShopScan(null, 'lista').items, []);
});

test('deseos: soltar suma ahorro y se puede reabrir', () => {
  const s = fresh();
  const w = S.addWish(s, { name: 'Audífonos', price: 3000 }, D);
  assert.equal(w.until, '2026-11-23');
  const r = S.dropWish(s, w.id, D, []);
  assert.equal(r.dop, 3000);
  assert.equal(S.shopOf(s).saved, 3000);
  S.reopenWish(s, w.id, D);
  assert.equal(S.shopOf(s).saved, 0);
});

test('pendiente "Comprar leche y pan" pasa a la lista', () => {
  const s = fresh();
  L.addTodo(s, { title: 'Comprar leche y pan' }, D);
  const t = s.todos[0];
  assert.ok(S.isBuyTodo(t.title));
  const r = S.todoToShop(s, t.id, D);
  assert.equal(r.added.length, 2);
  assert.equal(s.todos.length, 0);
});

test('datos viejos sin compras se completan', () => {
  const s = fresh();
  delete s.shop;
  S.ensureShop(s);
  assert.equal(S.shopOf(s).lists.length, 1);
  assert.equal(S.shopOf(s).cfg.wishDays, 30);
});

test('sincronizar: dos equipos agregan el mismo producto sin duplicar', () => {
  const base = fresh();
  const a = structuredClone(base);
  const b = structuredClone(base);
  add(a, 'pollo');
  add(b, 'pollo');
  const m = mergeStates(base, a, b);
  assert.equal(m.shop.items.filter((i) => !i.done && i.key === a.shop.items[0].key).length, 1);
});

test('resumen y recordatorio de compras', () => {
  const s = fresh();
  add(s, 'leche, pan');
  const sum = S.shopSummary(s, D);
  assert.equal(sum.pending, 2);
  assert.equal(S.shopText(s, null).includes('Leche'), true);
});
