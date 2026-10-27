import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/game/logic.js';
import * as M from '../src/game/money.js';
import * as CR from '../src/game/credits.js';
import * as LO from '../src/game/loans.js';
import { parseCapture, futureTodo } from '../src/game/parse.js';
import { monthProjection, projectionNote, planShortText } from '../src/game/stats.js';
import { fmtWorkShort } from '../src/game/ledger.js';
import { joinY, initialsOf, hoursShort } from '../src/app/text.js';
import { tidy } from '../src/ui/typo.js';
import { addDays } from '../src/app/dates.js';

const D = '2026-10-27'; // martes
const NB = ' ';
function fresh() {
  const s = L.defaultState(D);
  s.profile.onboarded = true;
  return s;
}
const kinds = (text) => parseCapture(text, { today: D }).map((i) => (i.kind === 'todo' ? `todo:${i.title}@${i.due}` : i.kind));

// ---------- Registrar: algo por hacer con su fecha ----------

test('registrar: «mañana pagar la luz» es un pendiente para mañana', () => {
  assert.deepEqual(kinds('mañana pagar la luz'), ['todo:Pagar la luz@2026-10-28']);
  assert.deepEqual(kinds('pagar la luz mañana'), ['todo:Pagar la luz@2026-10-28']);
  assert.deepEqual(kinds('el viernes renovar el marbete'), ['todo:Renovar el marbete@2026-10-30']);
  assert.deepEqual(kinds('llamar a mamá el sábado'), ['todo:Llamar a mamá@2026-10-31']);
  assert.deepEqual(kinds('ir al banco el viernes'), ['todo:Ir al banco@2026-10-30']);
  assert.deepEqual(kinds('el lunes cita con el dentista'), ['todo:Cita con el dentista@2026-11-02']);
});

test('registrar: lo hecho y los gastos no se vuelven pendientes', () => {
  assert.deepEqual(kinds('mañana gasté 300 en café'), ['tx']);
  assert.deepEqual(kinds('hoy caminé 30 minutos'), ['health']);
  assert.deepEqual(kinds('ayer fui al bar'), ['note']);
  assert.deepEqual(kinds('hablar con Pedro'), ['note']); // sin fecha sigue siendo nota
  assert.equal(futureTodo('par de zapatos el sábado', D), null);
  assert.equal(futureTodo('mar el domingo', D), null);
});

test('registrar: una frase con gasto, actividad y pendiente da tres cosas', () => {
  assert.deepEqual(kinds('Gasté 850 en el súper y caminé 40 minutos, mañana pagar la luz'), ['tx', 'health', 'todo:Pagar la luz@2026-10-28']);
  // «tengo que…» sigue igual
  assert.deepEqual(kinds('tengo que llamar al banco mañana'), ['todo:Llamar al banco@2026-10-28']);
});

// ---------- Pagos que se repiten ----------

test('pagos que se repiten: no sugiere la cuota de un préstamo que ya está en Deudas', () => {
  const s = fresh();
  const bank = L.addAccount(s, { name: 'Cuenta Banreservas', kind: 'cuenta', bank: 'Banreservas', last4: '4521' });
  const c = CR.addCredit(s, { name: 'Préstamo del carro', principal: 650000, apr: 11.5, term: 60, start: '2026-01-10', first: '2026-02-10', account: bank.id }, '2026-01-10');
  for (const day of ['2026-07-10', '2026-08-10', '2026-09-10', '2026-10-10']) CR.payCredit(s, c.id, { amount: c.payment, day, account: bank.id }, day, []);
  // El mismo patrón con un comercio cualquiera sí se sugiere (control).
  for (const day of ['2026-08-05', '2026-09-05', '2026-10-05']) L.addTx(s, { type: 'gasto', amount: 1200, cat: 'deporte', merchant: 'Gimnasio Body Shop', account: bank.id, day }, day, []);
  const names = M.recurringSuggestions(s, D).map((r) => r.name);
  assert.ok(names.includes('Gimnasio Body Shop'), names.join(', '));
  assert.ok(!names.some((n) => /Préstamo del carro|Cuota/i.test(n)), names.join(', '));
});

test('pagos que se repiten: lo que le prestas a alguien tampoco', () => {
  const s = fresh();
  const bank = L.addAccount(s, { name: 'Cuenta', kind: 'cuenta', bank: 'BHD', last4: '1111' });
  for (const day of ['2026-08-20', '2026-09-20', '2026-10-20']) LO.addLoan(s, { dir: 'me', who: 'Carlos', amount: 3000, day, account: bank.id }, day, []);
  const names = M.recurringSuggestions(s, D).map((r) => r.name);
  assert.ok(!names.some((n) => /Carlos/i.test(n)), names.join(', '));
});

// ---------- El mes: el mismo «te pasaste» en Resumen, Plan y Análisis ----------

test('el mes: el Plan explica lo que falta con el mismo número que el Resumen', () => {
  const s = fresh();
  const bank = L.addAccount(s, { name: 'Cuenta', kind: 'cuenta', bank: 'BHD', last4: '2222' });
  M.addPlan(s, { kind: 'ingreso', name: 'Salario', amount: 47500, cat: 'salario', account: bank.id, freq: { type: 'month', days: [15, 30] }, start: '2026-09-01' }, '2026-09-01');
  M.addPlan(s, { kind: 'gasto', name: 'Alquiler', amount: 26000, cat: 'vivienda', account: bank.id, freq: { type: 'month', days: [1] }, start: '2026-09-01' }, '2026-09-01');
  L.addTx(s, { type: 'gasto', amount: 26000, cat: 'vivienda', merchant: 'Alquiler', account: bank.id, day: '2026-10-01' }, '2026-10-01', []);
  L.addTx(s, { type: 'ingreso', amount: 47500, cat: 'salario', merchant: 'Salario', account: bank.id, day: '2026-10-15' }, '2026-10-15', []);
  for (let i = 0; i < 10; i++) L.addTx(s, { type: 'gasto', amount: 10000, cat: 'compras', merchant: `Tienda ${i}`, account: bank.id, day: addDays('2026-10-02', i * 2) }, addDays('2026-10-02', i * 2), []);
  const mp = M.monthPlan(s, '2026-10', D);
  const pr = monthProjection(s, D);
  assert.equal(mp.income, 95000);
  assert.equal(pr.projIncome, 95000);
  // 26,000 + 100,000 gastados frente a 95,000 que entran: 31,000 de más en los dos.
  assert.match(projectionNote(pr), /RD\$31,000 más de lo que entra/);
  assert.match(planShortText(mp), /^Ya gastaste RD\$31,000 más de lo que entra este mes/);
});

test('el mes: planShortText suma lo que falta pagar y lo que toca apartar', () => {
  const txt = planShortText({ income: 95000, fixed: 50000, fixedPaid: 40000, variable: 60000, funds: 10500 });
  assert.equal(txt, 'Ya gastaste RD$5,000 más de lo que entra este mes, faltan RD$10,000 de pagos fijos y toca apartar RD$10,500 para pagos futuros.');
  assert.equal(planShortText({ income: 95000, fixed: 20000, fixedPaid: 20000, variable: 10000, funds: 0 }), 'De lo que entra te quedan RD$65,000.');
});

// ---------- Textos ----------

test('textos: listas con «y» y «e»', () => {
  assert.equal(joinY([]), '');
  assert.equal(joinY(['salud']), 'salud');
  assert.equal(joinY(['salud', 'dinero']), 'salud y dinero');
  assert.equal(joinY(['salud', 'dinero', 'hogar']), 'salud, dinero y hogar');
  assert.equal(joinY(['gastos', 'ingresos']), 'gastos e ingresos');
  assert.equal(joinY(['agua', 'hierro']), 'agua y hierro'); // «hie-» suena distinto: se queda la «y»
  assert.equal(joinY(['salud', 'higiene']), 'salud e higiene');
  assert.equal(joinY(['agua', 'hielo']), 'agua y hielo');
});

test('textos: iniciales solo con letras', () => {
  assert.equal(initialsOf('Pedro (mentor)'), 'PE');
  assert.equal(initialsOf('María José'), 'MJ');
  assert.equal(initialsOf('ana'), 'AN');
  assert.equal(initialsOf(''), 'A');
  assert.equal(initialsOf('«Tía» Rosa'), 'TR');
});

test('textos: horas de sueño cortas', () => {
  assert.equal(hoursShort(7.25), '7h15');
  assert.equal(hoursShort(8), '8h');
  assert.equal(hoursShort(6.5), '6h30');
  assert.equal(hoursShort(7.999), '8h');
});

test('textos: el número y su unidad no se separan', () => {
  assert.equal(tidy('llevas 457 % más'), `llevas 457${NB}% más`);
  assert.equal(tidy(' %'), `${NB}%`);
  assert.equal(tidy('7 h 30'), `7${NB}h 30`);
  assert.equal(tidy('2 h 5 min de trabajo'), `2${NB}h 5${NB}min de trabajo`);
  assert.equal(tidy('8 horas'), '8 horas');
  assert.equal(tidy('Vitamina D3 · 2000 UI'), 'Vitamina D3 · 2000 UI');
});

test('horas de trabajo cortas para la lista de movimientos', () => {
  const wi = { dayHours: 8, monthHours: 8 * 5 * 52 / 12 };
  assert.equal(fmtWorkShort(0.5, wi), '30 min');
  assert.equal(fmtWorkShort(1.25, wi), '1h15');
  assert.equal(fmtWorkShort(2, wi), '2 h');
  assert.equal(fmtWorkShort(12, wi), '1.5 d');
  assert.equal(fmtWorkShort(260, wi), '1.5 mes');
});
