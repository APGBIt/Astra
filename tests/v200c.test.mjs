// 2.0 «Renacer», parte 3: automatizaciones («si pasa esto → haz esto») y el buscador universal.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/game/logic.js';
import * as R from '../src/game/rules.js';
import * as F from '../src/game/search.js';
import * as G from '../src/game/tags.js';
import * as S from '../src/game/shop.js';
import { plusOf } from '../src/game/plus.js';
import { mergeStates } from '../src/game/merge.js';
import { addDays } from '../src/app/dates.js';
import { simulate } from './helpers/sim.mjs';

const D = '2026-11-15'; // domingo
const clone = (x) => JSON.parse(JSON.stringify(x));
function fresh(day = D) {
  const s = L.defaultState(addDays(day, -30));
  s.profile.onboarded = true;
  L.reconcile(s, day);
  s.money.accounts.push({ id: 'ban', name: 'Banco', kind: 'cuenta', bank: 'APAP', last4: '1234', base: { day: addDays(day, -30), DOP: 50000, USD: 0, ts: 0 } });
  return s;
}
// Un cambio como los de la app: copia, cambia y pasa por las reglas.
function step(s, fn, day = D) {
  const next = clone(s);
  const ev = [];
  fn(next, ev);
  const msgs = R.runRules(s, next, day);
  return { s: next, msgs };
}

// ---------- Reglas ----------

test('regla «cuando cobro → pendiente»: se dispara con el ingreso, no con un gasto ni con uno pequeño', () => {
  let s = fresh();
  const r = R.addRule(s, { when: { type: 'income', min: 5000 }, then: { type: 'todo', title: 'Apartar para el ahorro', due: 'hoy' } }, D);
  assert.ok(r && r.on);
  assert.equal(R.ruleText(s, r).full, 'Cuando registro un ingreso de RD$5,000 o más → pendiente «Apartar para el ahorro»');
  let out = step(s, (x, ev) => L.addTx(x, { type: 'gasto', amount: 9000, cat: 'super', account: 'ban', day: D }, D, ev));
  assert.equal(out.msgs.length, 0);
  out = step(out.s, (x, ev) => L.addTx(x, { type: 'ingreso', amount: 800, cat: 'otros_ing', account: 'ban', day: D }, D, ev));
  assert.equal(out.msgs.length, 0);
  out = step(out.s, (x, ev) => L.addTx(x, { type: 'ingreso', amount: 45000, cat: 'salario', account: 'ban', day: D }, D, ev));
  assert.equal(out.msgs.length, 1);
  assert.equal(out.msgs[0].type, 'rule');
  s = out.s;
  const todo = s.todos.find((t) => t.title === 'Apartar para el ahorro');
  assert.ok(todo && todo.due === D && !todo.done);
  assert.equal(R.rulesOf(s)[0].runs, 1);
  assert.equal(plusOf(s).ruleLog[0].why, 'Ingreso de RD$45,000');
  // Otro ingreso el mismo día no repite el pendiente que sigue sin hacer.
  out = step(s, (x, ev) => L.addTx(x, { type: 'ingreso', amount: 6000, cat: 'otros_ing', account: 'ban', day: D }, D, ev));
  assert.equal(out.msgs.length, 0);
  assert.equal(out.s.todos.filter((t) => t.title === 'Apartar para el ahorro').length, 1);
});

test('reglas de sueño, vitalidad, compra y gasto grande', () => {
  let s = fresh();
  R.addRule(s, { when: { type: 'sleep', hours: 6 }, then: { type: 'todo', title: 'Acostarme una hora antes', due: 'hoy' } }, D);
  R.addRule(s, { when: { type: 'vit', level: 40 }, then: { type: 'note', text: 'Hoy solo lo esencial.' } }, D);
  R.addRule(s, { when: { type: 'trip' }, then: { type: 'shop', text: 'fundas de basura' } }, D);
  R.addRule(s, { when: { type: 'expense', min: 5000 }, then: { type: 'todo', title: 'Revisar el gasto grande', due: 'manana' } }, D);
  let out = step(s, (x, ev) => L.logHealth(x, D, { sleep: 7.5 }, D, ev));
  assert.equal(out.msgs.length, 0);
  s.health[D] = {};
  out = step(s, (x, ev) => L.logHealth(x, D, { sleep: 5 }, D, ev));
  assert.deepEqual(out.msgs.map((m) => m.text), ['Pendiente creado: Acostarme una hora antes']);
  // Corregir el sueño después no vuelve a disparar.
  out = step(out.s, (x, ev) => L.logHealth(x, D, { sleep: 4.5 }, D, ev));
  assert.equal(out.msgs.length, 0);
  s = out.s;
  s.vit = 55;
  out = step(s, (x) => { x.vit = 38; });
  assert.deepEqual(out.msgs.map((m) => m.text), ['Hoy solo lo esencial.']);
  out = step(out.s, (x) => { x.vit = 30; }); // ya estaba abajo: no repite
  assert.equal(out.msgs.length, 0);
  s = out.s;
  S.parseAndAdd(s, 'leche, pan', { today: D });
  for (const it of S.shopOf(s).items) S.toggleItem(s, it.id, D);
  out = step(s, (x, ev) => S.closeTrip(x, { list: S.shopOf(x).lists[0].id, total: 500, saveTx: false }, D, ev));
  assert.ok(out.msgs.some((m) => /fundas de basura/.test(m.text)));
  assert.ok(S.shopOf(out.s).items.some((i) => /funda/i.test(i.name)));
  out = step(out.s, (x, ev) => L.addTx(x, { type: 'gasto', amount: 12000, cat: 'compras', account: 'ban', day: D }, D, ev));
  const t = out.s.todos.find((x) => x.title === 'Revisar el gasto grande');
  assert.equal(t.due, addDays(D, 1));
});

test('importar un estado de cuenta no dispara reglas; una regla apagada tampoco', () => {
  const s = fresh();
  const r = R.addRule(s, { when: { type: 'income', min: 0 }, then: { type: 'note', text: 'Llegó dinero' } }, D);
  let out = step(s, (x, ev) => { for (let i = 0; i < 6; i++) L.addTx(x, { type: 'ingreso', amount: 1000 + i, cat: 'otros_ing', account: 'ban', day: addDays(D, -i) }, D, ev); });
  assert.equal(out.msgs.length, 0);
  R.updateRule(s, r.id, { on: false });
  out = step(s, (x, ev) => L.addTx(x, { type: 'ingreso', amount: 1000, cat: 'otros_ing', account: 'ban', day: D }, D, ev));
  assert.equal(out.msgs.length, 0);
});

test('regla de etiqueta: al leerla, además agrega algo a la lista', () => {
  const s = fresh();
  const tag = G.addTag(s, { action: { type: 'water' }, name: 'Botellón' }, D);
  const r = R.addRule(s, { when: { type: 'tag', tag: tag.id }, then: { type: 'todo', title: 'Pedir botellones', due: 'hoy' } }, D);
  assert.match(R.ruleText(s, r).when, /etiqueta «Botellón»/);
  const out = step(s, (x, ev) => G.runTag(x, tag.id, D, ev, { now: 5000 }));
  assert.equal(out.msgs.length, 1);
  assert.ok(out.s.todos.some((t) => t.title === 'Pedir botellones'));
  assert.equal(R.addRule(s, { when: { type: 'tag', tag: 'no-existe' }, then: { type: 'note', text: 'hola' } }, D), null);
});

test('regla de día y hora: una vez ese día, a partir de su hora; no se acumula ni corre el día que se creó tarde', () => {
  const s = fresh();
  const r = R.addRule(s, { when: { type: 'time', days: [0], at: '18:00' }, then: { type: 'todo', title: 'Planear la semana', due: 'hoy' } }, addDays(D, -3), 600);
  assert.equal(R.ruleText(s, r).when, 'Los domingos a las 6 p. m.');
  assert.equal(R.tickRules(s, D, 17 * 60 + 59).length, 0);
  assert.equal(R.tickRules(s, D, 18 * 60).length, 1);
  assert.equal(R.tickRules(s, D, 20 * 60).length, 0);
  assert.equal(R.tickRules(s, addDays(D, 1), 20 * 60).length, 0); // lunes
  assert.equal(R.tickRules(s, addDays(D, 7), 22 * 60).length, 1); // el domingo siguiente, aunque se abra tarde
  assert.equal(s.todos.filter((t) => t.title === 'Planear la semana').length, 2);
  // Creada hoy a las 7 p. m. para las 6 p. m.: empieza la próxima semana.
  const s2 = fresh();
  R.addRule(s2, { when: { type: 'time', days: [0], at: '18:00' }, then: { type: 'note', text: 'x y' } }, D, 19 * 60);
  assert.equal(R.tickRules(s2, D, 19 * 60 + 1).length, 0);
  assert.equal(R.tickRules(s2, addDays(D, 7), 18 * 60).length, 1);
});

test('reglas: lo que no tiene sentido se rechaza, hay un tope al día y las recetas no repiten las tuyas', () => {
  const s = fresh();
  assert.equal(R.addRule(s, { when: { type: 'expense', min: 0 }, then: { type: 'note', text: 'hola' } }, D), null);
  assert.equal(R.addRule(s, { when: { type: 'time', days: [], at: '18:00' }, then: { type: 'note', text: 'hola' } }, D), null);
  assert.equal(R.addRule(s, { when: { type: 'time', days: [1], at: '25:00' }, then: { type: 'note', text: 'hola' } }, D), null);
  assert.equal(R.addRule(s, { when: { type: 'income' }, then: { type: 'borrar' } }, D), null);
  assert.equal(R.addRule(s, { when: { type: 'income' }, then: { type: 'todo', title: ' ' } }, D), null);
  const n0 = R.ruleIdeas(s).length;
  assert.ok(n0 >= 5);
  const idea = R.ruleIdeas(s)[0];
  R.addRule(s, { when: idea.when, then: idea.then }, D);
  assert.equal(R.ruleIdeas(s).length, n0 - 1);
  // Tope: una regla de aviso no corre más de 5 veces en un día.
  const s2 = fresh();
  R.addRule(s2, { when: { type: 'income', min: 0 }, then: { type: 'note', text: 'Llegó dinero' } }, D);
  let cur = s2; let fired = 0;
  for (let i = 0; i < 8; i++) { const out = step(cur, (x, ev) => L.addTx(x, { type: 'ingreso', amount: 100 + i, cat: 'otros_ing', account: 'ban', day: D }, D, ev)); fired += out.msgs.length; cur = out.s; }
  assert.equal(fired, R.RULE_DAILY);
});

test('sincronizar: la misma regla en dos teléfonos no deja dos pendientes iguales', () => {
  const base = fresh();
  R.addRule(base, { when: { type: 'time', days: [0], at: '08:00' }, then: { type: 'todo', title: 'Planear la semana', due: 'hoy' } }, addDays(D, -5), 0);
  const a = clone(base); const b = clone(base);
  R.tickRules(a, D, 9 * 60); R.tickRules(b, D, 10 * 60);
  const m = mergeStates(base, a, b);
  assert.equal(m.todos.filter((t) => t.title === 'Planear la semana' && !t.done).length, 1);
  assert.equal(plusOf(m).rules.length, 1);
  assert.equal(plusOf(m).rules[0].runs, 1); // los dos hicieron lo mismo: cuenta como una vez
});

// ---------- Buscador ----------

const sim = simulate({ end: D, profile: 'constante' });

test('buscador: llega a las pantallas por su nombre o por cómo las llamaría alguien, con o sin acentos', () => {
  const first = (q) => { const g = F.searchAll(sim, q, D); return g.length ? g[0].items[0] : null; };
  assert.equal(first('despensa').href, '/compras?ver=despensa');
  assert.equal(first('DESPÉNSA').href, '/compras?ver=despensa');
  assert.equal(first('gemelo').href, '/mando?ver=gemelo');
  assert.equal(first('nevera').href, '/compras?ver=despensa');
  assert.equal(first('colesterol').href, '/analiticas');
  assert.equal(first('kaizen').href, '/mando?ver=lean');
  assert.equal(first('realidad aumentada').href, '/lente');
  assert.equal(first('presupuesto').href, '/finanzas?tab=plan');
  assert.deepEqual(F.searchAll(sim, 'a', D), []);
  assert.deepEqual(F.searchAll(sim, 'xqzwv', D), []);
});

test('buscador: encuentra tus datos (pendientes, rutinas, cuentas, movimientos, etiquetas) y lleva al lugar', () => {
  const s = clone(sim);
  L.addTodo(s, { title: 'Renovar el marbete', due: D }, D);
  G.addTag(s, { action: { type: 'water' }, name: 'Botellón', where: 'En la cocina' }, D);
  const find = (q, key) => (F.searchAll(s, q, D).find((g) => g.key === key) || { items: [] }).items;
  const t = find('marbete', 'pendientes')[0];
  assert.equal(t.title, 'Renovar el marbete');
  assert.match(t.href, /^\/pendientes\/.+/);
  assert.equal(t.sub, 'Para hoy');
  assert.equal(find('botellon', 'etiquetas')[0].title, 'Botellón');
  assert.equal(find('cocina', 'etiquetas')[0].title, 'Botellón'); // por dónde está pegada
  assert.ok(find('ahorro', 'cuentas').length >= 1);
  const mov = find('luz', 'movimientos');
  assert.ok(mov.length >= 1 && mov.length <= 4);
  assert.match(mov[0].href, /tab=movimientos&q=luz/);
  assert.match(mov[0].sub, /^−RD\$/);
  // Todas las palabras tienen que estar.
  assert.equal(find('marbete carro', 'pendientes').length, 0);
});

test('buscador: rápido con 90 días de datos y atajos según la hora', () => {
  const t0 = Date.now();
  for (let i = 0; i < 30; i++) F.searchAll(sim, ['super', 'pagar', 'le', 'compr'][i % 4], D);
  assert.ok((Date.now() - t0) / 30 < 25, `${(Date.now() - t0) / 30} ms por búsqueda`);
  assert.equal(F.quickPlaces(22)[0].href, '/posada');
  assert.equal(F.quickPlaces(8)[0].href, '/mando');
  assert.ok(F.PLACES.every((p) => p.href.startsWith('/') && p.title && p.icon));
});
