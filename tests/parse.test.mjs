import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, parseCapture, classifyMission, parseBankAlert, guessCategory } from '../src/game/parse.js';

test('montos en formatos dominicanos', () => {
  assert.equal(parseAmount('850'), 850);
  assert.equal(parseAmount('RD$ 1,500.50'), 1500.5);
  assert.equal(parseAmount('1.500'), 1500);
  assert.equal(parseAmount('2 mil'), 2000);
  assert.equal(parseAmount('3,200'), 3200);
});

test('frase con gasto y ejercicio', () => {
  const items = parseCapture('Gasté 850 en el súper y caminé 40 minutos');
  assert.equal(items.length, 2);
  assert.equal(items[0].kind, 'tx');
  assert.equal(items[0].amount, 850);
  assert.equal(items[0].cat, 'super');
  assert.equal(items[1].kind, 'health');
  assert.equal(items[1].field, 'exercise');
  assert.equal(items[1].value, 40);
});

test('frase que completa una misión pendiente', () => {
  const items = parseCapture('caminé 40 minutos', { missions: [{ id: 'm1', title: 'Camina 30 minutos' }] });
  assert.equal(items[0].kind, 'mission');
  assert.equal(items[0].missionId, 'm1');
});

test('sueño, pasos, páginas, contacto y ánimo', () => {
  const items = parseCapture('Dormí 6 horas. Hice 7,842 pasos. Leí 20 páginas. Llamé a Luis. Me siento cansado', { people: [{ id: 'p1', name: 'Luis' }] });
  assert.deepEqual(items.map((i) => i.kind), ['health', 'health', 'pages', 'contact', 'mood']);
  assert.equal(items[0].value, 6);
  assert.equal(items[1].value, 7842);
  assert.equal(items[3].personId, 'p1');
  assert.equal(items[4].quad, 2);
});

test('ingreso y pago de deuda', () => {
  const items = parseCapture('Cobré la quincena 25,000. Pagué 5,000 a la tarjeta');
  assert.equal(items[0].type, 'ingreso');
  assert.equal(items[0].amount, 25000);
  assert.equal(items[1].cat, 'deuda');
});

test('clasificar misiones nuevas', () => {
  assert.equal(classifyMission('Leer 20 páginas').area, 'crecimiento');
  assert.equal(classifyMission('Entrenar 45 minutos').cost, 3);
  assert.equal(classifyMission('Llamar a mamá').area, 'relaciones');
  assert.equal(classifyMission('No comprar por impulso').kind, 'avoid');
  assert.deepEqual(classifyMission('Correr cada lunes y jueves').days, [1, 4]);
  assert.deepEqual(classifyMission('10,000 pasos').auto, { metric: 'steps', gte: 10000 });
});

test('alerta de consumo del banco', () => {
  const a = parseBankAlert('Consumo aprobado con su tarjeta ****4417 por RD$ 1,500.00 en ESTACION TEXACO el 27/09/2026');
  assert.equal(a.amount, 1500);
  assert.equal(a.type, 'gasto');
  assert.equal(a.cat, 'transporte');
  assert.equal(a.day, '2026-09-27');
});

test('categorías', () => {
  assert.equal(guessCategory('farmacia carol'), 'salud');
  assert.equal(guessCategory('pedidosya'), 'comida');
});

test('título limpio y sin falsos emparejamientos', async () => {
  const { cleanTitle, matchMission } = await import('../src/game/parse.js');
  assert.equal(cleanTitle('leer 20 páginas cada lunes y jueves'), 'Leer 20 páginas');
  assert.equal(cleanTitle('Correr entre semana'), 'Correr');
  assert.equal(matchMission('caminé 40 minutos', [{ id: 'e', title: 'Entrenar 30 minutos' }]), null);
  assert.equal(matchMission('caminé 40 minutos', [{ id: 'c', title: 'Camina 30 minutos' }]).id, 'c');
});
