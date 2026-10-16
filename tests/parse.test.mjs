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
  assert.equal(a.cat, 'combustible');
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

test('pendientes en lenguaje natural', async () => {
  const { parseTodo } = await import('../src/game/parse.js');
  const T = '2026-10-09'; // viernes
  assert.deepEqual(
    (({ title, due, important }) => ({ title, due, important }))(parseTodo('Pagar el marbete el viernes', T)),
    { title: 'Pagar el marbete', due: '2026-10-16', important: false },
  );
  assert.equal(parseTodo('Llamar a Luis mañana', T).due, '2026-10-10');
  assert.equal(parseTodo('Llamar a Luis mañana', T).area, 'relaciones');
  assert.equal(parseTodo('Correr en la mañana', T).due, null);
  assert.equal(parseTodo('Renovar pasaporte pasado mañana !', T).important, true);
  assert.equal(parseTodo('Entregar informe el 15', T).due, '2026-10-15');
  assert.equal(parseTodo('Entregar informe el 5', T).due, '2026-11-05');
  assert.equal(parseTodo('Cita 20/10', T).due, '2026-10-20');
  assert.equal(parseTodo('Reunión 3 de noviembre', T).due, '2026-11-03');
  assert.equal(parseTodo('Revisar presupuesto la próxima semana', T).due, '2026-10-12');
  assert.equal(parseTodo('Pagar la luz en 3 días urgente', T).due, '2026-10-12');
  assert.equal(parseTodo('Pagar tarjeta fin de mes', T).due, '2026-10-31');
  assert.equal(parseTodo('Comprar leche hoy #super', T).tag, 'super');
  assert.equal(parseTodo('Leer 20 páginas', T).title, 'Leer 20 páginas');
});

test('«tengo que…» en el registro rápido se vuelve pendiente', () => {
  const items = parseCapture('Gasté 850 en el súper. Tengo que pagar la luz el viernes. Hay que renovar el pasaporte, es urgente', { today: '2026-10-09' });
  assert.deepEqual(items.map((i) => i.kind), ['tx', 'todo', 'todo']);
  assert.equal(items[1].title, 'Pagar la luz');
  assert.equal(items[1].due, '2026-10-16');
  assert.equal(items[2].important, true);
});

test('pendientes que se repiten en lenguaje natural', async () => {
  const { parseTodo } = await import('../src/game/parse.js');
  const T = '2026-10-09'; // viernes
  const pick = (t) => (({ title, due, repeat }) => ({ title, due, repeat }))(parseTodo(t, T));
  assert.deepEqual(pick('Pagar la luz cada mes'), { title: 'Pagar la luz', due: null, repeat: 'mes' });
  assert.deepEqual(pick('Pagar el alquiler el 30 de cada mes'), { title: 'Pagar el alquiler', due: '2026-10-30', repeat: 'mes' });
  assert.deepEqual(pick('Sacar la basura cada lunes'), { title: 'Sacar la basura', due: '2026-10-12', repeat: 'semana' });
  assert.deepEqual(pick('Regar las plantas todos los sábados'), { title: 'Regar las plantas', due: '2026-10-10', repeat: 'semana' });
  assert.deepEqual(pick('Renovar el seguro cada año'), { title: 'Renovar el seguro', due: null, repeat: 'ano' });
  assert.equal(pick('Revisar el presupuesto semanalmente').repeat, 'semana');
  assert.equal(pick('Llamar a mamá mañana').repeat, null);
});

test('fechas: sin falsos positivos con calles, nombres, fracciones ni palabras que terminan en -la o -el', async () => {
  const { parseTodo, parseCapture } = await import('../src/game/parse.js');
  const T = '2026-10-09'; // viernes
  const pick = (t, today = T) => (({ title, due }) => ({ title, due }))(parseTodo(t, today));
  assert.deepEqual(pick('Ir a Santo Domingo'), { title: 'Ir a Santo Domingo', due: null });
  assert.deepEqual(pick('Llevar los papeles a Santo Domingo el martes'), { title: 'Llevar los papeles a Santo Domingo', due: '2026-10-13' });
  assert.deepEqual(pick('Llamar a Domingo'), { title: 'Llamar a Domingo', due: null });
  assert.deepEqual(pick('Ver a Domingo el domingo'), { title: 'Ver a Domingo', due: '2026-10-11' });
  assert.deepEqual(pick('Pasar por el banco de la 27 de Febrero'), { title: 'Pasar por el banco de la 27 de Febrero', due: null });
  assert.deepEqual(pick('Reunión en la Av. 27 de Febrero el lunes'), { title: 'Reunión en la Av. 27 de Febrero', due: '2026-10-12' });
  assert.deepEqual(pick('Llamar a la abuela hoy'), { title: 'Llamar a la abuela', due: T });
  assert.deepEqual(pick('Preparar la presentación del lunes'), { title: 'Preparar la presentación', due: '2026-10-12' });
  assert.deepEqual(pick('Comprar papel lunes'), { title: 'Comprar papel', due: '2026-10-12' });
  assert.deepEqual(pick('Comprar 1/2 libra de queso'), { title: 'Comprar 1/2 libra de queso', due: null });
  assert.deepEqual(pick('Comprar 2-3 libras de arroz'), { title: 'Comprar 2-3 libras de arroz', due: null });
  assert.deepEqual(pick('Pagar el préstamo el 15-11-2026'), { title: 'Pagar el préstamo', due: '2026-11-15' });
  assert.deepEqual(pick('Pagar el alquiler el 30', '2027-01-31'), { title: 'Pagar el alquiler', due: '2027-03-30' });
  const card = parseTodo('Pagar la tarjeta el día 15 de cada mes', T);
  assert.deepEqual([card.title, card.due, card.repeat], ['Pagar la tarjeta', '2026-10-15', 'mes']);
  const exclam = parseTodo('¡Llamar a mamá!', T);
  assert.deepEqual([exclam.title, exclam.important], ['Llamar a mamá', false]);
  assert.equal(parseTodo('Llamar a mamá !', T).important, true);
  assert.equal(parseCapture('Debo 500 pesos a Juan', { today: T }).some((i) => i.kind === 'todo'), false);
  assert.equal(parseCapture('Debo ir al médico el jueves', { today: T })[0].due, '2026-10-15');
});

// ---------- Avisos del banco (formatos de APAP y Banreservas, con datos de prueba) ----------
import { parseBankAlerts, currencyIn, prettyMerchant, guessIncome } from '../src/game/parse.js';

const APAP_CONSUMO = `Hola PEREZ/JUAN, Tu tarjeta de Crédito titular-Visa Familiar APAP terminada en 1234 presenta una transacción, con el siguiente detalle:
Detalle de la transacción
Fecha:	11/10/2026
Hora:	19:8
Moneda:	USD dólar estadounidense
Monto:	23.50
Comercio:	MINIMARKET LA ESQUINA #12
Estado:	APROBADA
Balance disponible:	US$1,183.12`;
const APAP_PAGO = `| Hola PEREZ/JUAN, Tu titular Visa Familiar terminada en 1234 ha recibido un pago con el siguiente detalle: |
| Fecha: | 10/10/2026 |
| Hora: | 10:47 |
| Moneda: | RD pesos dominicanos |
| Monto: | 15,000.00 |
| Estado: | Transacción Aprobada |
Realiza los pagos de tu Tarjeta de Crédito APAP`;
const APAP_DECLINADA = `| Hola PEREZ/JUAN, Tu tarjeta Visa Familiar APAP terminada en 1234 presenta una transacción declinada, con el siguiente detalle: |
| Fecha: | 16/10/2026 |
| Hora: | 11 :3 |
| Moneda: | USD dólar estadounidense |
| Monto: | 200.00 |
| Comercio: | AUTO RENTAL |
| Estado: | Fondos Insuficientes |`;
const BR_TERCERO = `Comprobante de Pago - Banreservas
¡Transacción realizada!
Te notificamos que la siguiente transacción fue realizada desde tu App Banreservas:
Monto:
DOP 8,000.00
para mami
Transacción:
Transferencia a Tercero
Origen:
JUAN PEREZ, Cuenta de ahorro DOP ** - 5555
Destino:
SR PEDRO PEREZ, Cuenta de ahorro DOP ** - 9999
Fecha de transacción:
11 de Octubre de 2026 - 2:00 PM
Impuestos:
16.00
Número de transacción:
100000000001`;
const BR_PROPIA = `| ¡Transacción realizada! |
| Monto: |
| DOP 8,000.00 |
| #concept# |
| | Transacción: |
| Transferencia ACH |
| | Origen: |
| JUAN PEREZ, CuentaAhorro DOP ** - 5555 |
| | Destino: |
| JUAN PEREZ, CuentaAhorro DOP ** - 7777 |
| | Fecha de transacción: |
| 14 de Octubre de 2026 - 7:49 PM |
| | Impuestos: |
| #tax# |
| | Número de transacción: |
| 100000000002 |`;

test('aviso de APAP: consumo en dólares con tarjeta y comercio', () => {
  const [a] = parseBankAlerts(APAP_CONSUMO);
  assert.equal(a.kind, 'gasto');
  assert.equal(a.currency, 'USD');
  assert.equal(a.amount, 23.5);
  assert.equal(a.day, '2026-10-11');
  assert.equal(a.time, '19:08');
  assert.equal(a.merchant, 'Minimarket la Esquina');
  assert.equal(a.cat, 'super');
  assert.equal(a.account.last4, '1234');
  assert.equal(a.account.bank, 'APAP');
});

test('aviso de APAP: un pago a la tarjeta no es gasto y una declinada no se cobra', () => {
  const [p] = parseBankAlerts(APAP_PAGO);
  assert.equal(p.kind, 'transfer');
  assert.equal(p.cat, 'pago_tarjeta');
  assert.equal(p.currency, 'DOP');
  assert.equal(p.amount, 15000);
  const [d] = parseBankAlerts(APAP_DECLINADA);
  assert.equal(d.kind, 'declined');
  assert.equal(d.time, '11:03');
});

test('aviso de Banreservas: transferencia a un familiar con su impuesto aparte', () => {
  const list = parseBankAlerts(BR_TERCERO);
  assert.equal(list.length, 2);
  assert.equal(list[0].kind, 'gasto');
  assert.equal(list[0].cat, 'familia');
  assert.equal(list[0].merchant, 'Pedro Perez');
  assert.equal(list[0].day, '2026-10-11');
  assert.equal(list[0].time, '14:00');
  assert.equal(list[0].ref, '100000000001');
  assert.equal(list[0].account.last4, '5555');
  assert.equal(list[1].cat, 'comisiones');
  assert.equal(list[1].amount, 16);
});

test('aviso de Banreservas: entre tus cuentas, y avisos repetidos se cuentan una vez', () => {
  const [t] = parseBankAlerts(BR_PROPIA);
  assert.equal(t.kind, 'transfer');
  assert.equal(t.cat, 'entre_cuentas');
  assert.equal(t.time, '19:49');
  const many = parseBankAlerts([APAP_CONSUMO, BR_TERCERO, BR_TERCERO, BR_PROPIA, APAP_DECLINADA].join('\n\n'));
  assert.equal(many.filter((x) => x.ref === '100000000001').length, 1);
  assert.deepEqual(many.map((x) => x.kind), ['gasto', 'gasto', 'gasto', 'transfer', 'declined']);
});

test('dólares en el registro rápido y categorías nuevas', () => {
  const [g] = parseCapture('Gasté 20 dólares en gasolina');
  assert.equal(g.currency, 'USD');
  assert.equal(g.amount, 20);
  assert.equal(g.cat, 'combustible');
  assert.equal(currencyIn('US$ 15'), 'USD');
  assert.equal(currencyIn('RD$ 15'), 'DOP');
  assert.equal(guessCategory('BURLINGTON STORE 101'), 'ropa');
  assert.equal(guessCategory('CENTROPARKINGMAQ'), 'peajes');
  assert.equal(guessCategory('CARIBBEAN CINEMAS'), 'ocio');
  assert.equal(guessCategory('NETFLIX.COM'), 'suscripciones');
  assert.equal(guessCategory('WENDYS 12 PLAZA CENTRAL'), 'comida');
  assert.equal(guessIncome('quincena de octubre'), 'salario');
  assert.equal(prettyMerchant('WENDYS 12 PLAZA CENTRAL'), 'Wendys Plaza Central');
  assert.equal(prettyMerchant('EL VERDE BBQ'), 'El Verde BBQ');
});
