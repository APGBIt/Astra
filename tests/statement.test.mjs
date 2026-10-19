import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import * as L from '../src/game/logic.js';
import * as M from '../src/game/money.js';
import * as S from '../src/game/statement.js';
import { readXlsx, readHtmlTable, sniff, excelDate } from '../src/app/xlsx.js';
import { parseBankAlerts, prettyMerchant } from '../src/game/parse.js';

const D = '2026-10-19';
const inflate = async (b) => new Uint8Array(inflateRawSync(b));
function fresh(day = D) {
  const s = L.defaultState(day);
  s.profile.onboarded = true;
  s.money.fx.manual = 61.1477;
  return s;
}

test('CSV: adivina el separador y respeta comillas', () => {
  const a = S.readCSV('Fecha;Descripción;Monto\n01/10/2026;"SUPER, OLE";-1.234,56\n02/10/2026;Pago;500,00\n');
  assert.equal(a.delimiter, ';');
  assert.deepEqual(a.rows[1], ['01/10/2026', 'SUPER, OLE', '-1.234,56']);
  const b = S.readCSV('﻿Fecha,Descripcion,Debito,Credito,Balance\r\n"01/10/2026","Compra ""Uno""","1,200.50","","10,000.00"\r\n');
  assert.equal(b.delimiter, ',');
  assert.equal(b.rows[1][1], 'Compra "Uno"');
  assert.equal(S.readCSV('a\tb\tc\n1\t2\t3').delimiter, '\t');
});

test('números: pesos, dólares, paréntesis y signos al final', () => {
  assert.equal(S.parseNum('RD$ 1,234.56'), 1234.56);
  assert.equal(S.parseNum('(1,234.56)'), -1234.56);
  assert.equal(S.parseNum('-1.234,56'), -1234.56);
  assert.equal(S.parseNum('1,234.56-'), -1234.56);
  assert.equal(S.parseNum('US$162.70'), 162.7);
  assert.equal(S.parseNum('12,50'), 12.5);
  assert.equal(S.parseNum('1.500'), 1500);
  assert.equal(S.parseNum('DOP 103.23'), 103.23);
  assert.equal(S.parseNum(''), null);
  assert.equal(S.parseNum('abc'), null);
});

test('fechas: día/mes, texto en español, serie de Excel y orden', () => {
  assert.deepEqual(S.parseDate('09/10/2026 02:49 PM'), { day: '2026-10-09', time: '14:49' });
  assert.deepEqual(S.parseDate('10/09/2026', 'mdy'), { day: '2026-10-09', time: '' });
  assert.deepEqual(S.parseDate('2026-10-01 13:51'), { day: '2026-10-01', time: '13:51' });
  assert.deepEqual(S.parseDate('01-oct-2026'), { day: '2026-10-01', time: '' });
  assert.deepEqual(S.parseDate('9 de octubre de 2026'), { day: '2026-10-09', time: '' });
  assert.equal(S.parseDate(46304).day, '2026-10-09');
  assert.equal(excelDate(46304.5), '2026-10-09 12:00');
  assert.equal(S.dateOrder(['13/10/2026', '01/10/2026']), 'dmy');
  assert.equal(S.dateOrder(['10/13/2026', '10/01/2026']), 'mdy');
  assert.equal(S.parseDate('Saldo anterior'), null);
});

test('columnas: encuentra el título aunque haya filas antes, con débito y crédito', () => {
  const rows = [
    ['Banco de Reservas'], ['Cuenta de ahorro ****6620'], [],
    ['Fecha Posteo', 'Descripción', 'No. Referencia', 'Débito', 'Crédito', 'Balance'],
    ['01/10/2026', 'COMPRA SUPERMERCADO NACIONAL', '123', '1,500.00', '', '48,500.00'],
    ['02/10/2026', 'PAGO DE NOMINA', '124', '', '35,000.00', '83,500.00'],
    ['03/10/2026', 'RETIRO CAJERO ATM', '125', '2,000.00', '', '81,500.00'],
    ['03/10/2026', 'TRANSFERENCIA A TERCEROS JUAN', '126', '700.00', '', '80,800.00'],
    ['04/10/2026', 'COMISION MANEJO DE CUENTA', '127', '150.00', '', '80,650.00'],
    ['', 'Total', '', '4,350.00', '35,000.00', ''],
  ];
  const det = S.detectColumns(rows);
  assert.equal(det.header, 3);
  assert.equal(det.amountMode, 'split');
  assert.equal(det.cols.debit, 3);
  assert.equal(det.cols.balance, 5);
  const r = S.statementItems(rows, { ...det, currency: 'DOP', accountKind: 'cuenta', account: 'acc1' });
  assert.equal(r.items.length, 5);
  assert.equal(r.skipped, 1);
  const by = Object.fromEntries(r.items.map((i) => [i.ref, i]));
  assert.equal(by['123'].kind, 'gasto');
  assert.equal(by['123'].cat, 'super');
  assert.equal(by['124'].kind, 'ingreso');
  assert.equal(by['124'].cat, 'salario');
  assert.equal(by['125'].kind, 'transfer');
  assert.equal(by['125'].to, 'efectivo');
  assert.equal(by['126'].cat, 'terceros');
  assert.equal(by['127'].cat, 'comisiones');
  assert.deepEqual(r.balance, { amount: 80650, day: '2026-10-04', time: '', currency: 'DOP' });
});

test('tarjeta con un solo monto: compras en positivo y pagos que no son gasto', () => {
  const rows = [['Fecha', 'Concepto', 'Monto', 'Moneda'],
    ['05/10/2026', 'UBER *RIDES SANTO DOMINGO', '298.75', 'RD$'],
    ['06/10/2026', 'SU PAGO GRACIAS', '-15,000.00', 'RD$'],
    ['07/10/2026', 'PUERTO RICO RENTAL', '390.57', 'US$'],
    ['08/10/2026', 'DEVOLUCION TIENDA', '-50.00', 'RD$']];
  const det = S.detectColumns(rows);
  assert.equal(det.amountMode, 'signed');
  const r = S.statementItems(rows, { ...det, flip: true, currency: 'DOP', accountKind: 'tarjeta', account: 'card1', payFrom: 'bank1' });
  assert.equal(r.items[0].kind, 'gasto');
  assert.equal(r.items[0].merchant, 'Uber');
  assert.equal(r.items[0].cat, 'transporte');
  assert.equal(r.items[1].kind, 'transfer');
  assert.equal(r.items[1].cat, 'pago_tarjeta');
  assert.equal(r.items[1].to, 'card1');
  assert.equal(r.items[1].account, 'bank1');
  assert.equal(r.items[2].currency, 'USD');
  assert.equal(r.items[3].kind, 'ingreso');
  assert.equal(r.items[3].cat, 'reembolsos');
});

test('tabla web guardada como .xls y archivos que no se pueden leer', () => {
  const html = '<html><table><tr><th>Fecha</th><th>Descripci&oacute;n</th><th>Monto</th></tr><tr><td>01/10/2026</td><td>COMPRA <b>X</b></td><td>-100.00</td></tr></table></html>';
  const enc = new TextEncoder();
  assert.equal(sniff(enc.encode(html)), 'html');
  assert.deepEqual(readHtmlTable(html)[1], ['01/10/2026', 'COMPRA X', '-100.00']);
  assert.equal(sniff(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])), 'xls');
  assert.equal(sniff(enc.encode('%PDF-1.7')), 'pdf');
});

test('Excel de revisión: movimientos, cuentas por nombre y saldos del banco', async () => {
  const bytes = readFileSync(new URL('./fixtures/revision-ejemplo.xlsx', import.meta.url));
  assert.equal(sniff(new Uint8Array(bytes)), 'xlsx');
  const sheets = await readXlsx(bytes, inflate);
  assert.deepEqual(sheets.map((x) => [x.name, x.hidden]), [['Movimientos', false], ['Saldos disponibles', false], ['Listas', true]]);
  const s = fresh();
  const book = S.readBook(sheets, s.money.categories);
  assert.equal(book.kind, 'template');
  assert.equal(book.items.length, 6);
  const [hold, uber, usd, own, cash, dinner] = book.items;
  assert.equal(hold.on, false);
  assert.equal(hold.check, 'Retención inicial');
  assert.equal(uber.on, true);
  assert.equal(uber.cat, 'transporte');
  assert.equal(uber.day, '2026-10-01');
  assert.deepEqual(uber.account, { name: 'Banco Ejemplo Visa', last4: '1111', bank: '', kind: 'tarjeta' });
  assert.equal(usd.currency, 'USD');
  assert.equal(usd.cat, 'viajes');
  assert.equal(own.kind, 'transfer');
  assert.equal(own.cat, 'entre_cuentas');
  assert.deepEqual(own.to, { name: 'APAP Ahorro', last4: '4444', bank: 'APAP', kind: 'cuenta' });
  assert.equal(cash.on, true);
  assert.equal(cash.to.kind, 'efectivo');
  assert.equal(dinner.amount, 1250.5);
  assert.equal(book.balances.length, 3);
  assert.deepEqual(book.balances[0], { account: { name: 'APAP Visa Familiar', last4: '2222', bank: 'APAP', kind: 'tarjeta' }, currency: 'DOP', amount: 80000.25, limit: 100000, day: '2026-10-10', time: '10:47', source: 'Aviso de APAP' });
  assert.equal(book.balances[1].limit, null);
});

test('importar el Excel crea las cuentas, el efectivo y cuadra con lo que dice el banco', async () => {
  const bytes = readFileSync(new URL('./fixtures/revision-ejemplo.xlsx', import.meta.url));
  const s = fresh();
  const book = S.readBook(await readXlsx(bytes, inflate), s.money.categories);
  const r = L.importTxs(s, { label: 'Prueba', items: book.items.map((it) => ({ ...it, on: it.on })) }, D, []);
  assert.equal(r.added, 5);
  const cash = s.money.accounts.find((a) => a.kind === 'efectivo');
  assert.ok(cash);
  const ret = s.money.tx.find((t) => t.merchant === 'Retiro en ventanilla');
  assert.equal(ret.to, cash.id);
  const card = s.money.accounts.find((a) => a.last4 === '2222');
  assert.equal(card.kind, 'tarjeta');
  // Pesos: con límite → lo que debes = límite − disponible, desde ese momento.
  assert.equal(M.setAvailable(s, card.id, { ...book.balances[0] }, D), 'card');
  // Dólares sin límite: solo se guarda lo disponible.
  assert.equal(M.setAvailable(s, card.id, { ...book.balances[1] }, D), 'avail');
  L.addTx(s, { type: 'gasto', amount: 1000, currency: 'DOP', cat: 'comida', account: card.id, day: '2026-10-11', time: '12:00' }, D, []);
  L.addTx(s, { type: 'gasto', amount: 20, currency: 'USD', cat: 'comida', account: card.id, day: '2026-10-16', time: '09:00' }, D, []);
  const ci = M.cardInfo(s, card, D);
  assert.equal(ci.owed.DOP, 100000 - 80000.25 + 1000);
  assert.equal(ci.avail.DOP, 80000.25 - 1000);
  assert.equal(ci.avail.USD, 162.7 - 20);
  // Una cuenta: el saldo del banco en esa fecha; lo de después se suma o se resta.
  const bank = s.money.accounts.find((a) => a.last4 === '3333');
  assert.equal(M.setAvailable(s, bank.id, { ...book.balances[2] }, D), 'balance');
  L.addTx(s, { type: 'gasto', amount: 500, cat: 'super', account: bank.id, day: '2026-10-13' }, D, []);
  assert.equal(M.balances(s)[bank.id].DOP, 24500);
  // Algo más viejo que lo que ya se sabe no cambia nada.
  assert.equal(M.setAvailable(s, bank.id, { currency: 'DOP', amount: 1, day: '2026-10-01' }, D), '');
  // Crédito disponible en el total.
  assert.equal(M.moneyTotals(s, D).credit.USD, 142.7);
});

test('deshacer una importación devuelve los saldos a como estaban', () => {
  const s = fresh();
  const bank = L.addAccount(s, { name: 'Ahorro', kind: 'cuenta', bank: 'Banreservas', last4: '6620' });
  M.setAccountBalance(s, bank.id, { DOP: 1000 }, '2026-10-01');
  const before = JSON.parse(JSON.stringify(bank.base));
  const r = L.importTxs(s, { label: 'Estado', items: [{ kind: 'gasto', amount: 100, currency: 'DOP', day: '2026-10-05', merchant: 'X', cat: 'otros', account: bank.id }] }, D, []);
  s.money.lastImport.anchors = [{ id: bank.id, base: before, bankAvail: null }];
  M.setAvailable(s, bank.id, { currency: 'DOP', amount: 777, day: '2026-10-06' }, D);
  assert.equal(M.balances(s)[bank.id].DOP, 777);
  L.undoImport(s, r.batch);
  assert.equal(M.balances(s)[bank.id].DOP, 1000);
});

test('avisos pegados en una sola línea: comercio limpio, aprobación y disponible', () => {
  const t = [
    'Notificación de Consumo Su tarjeta VISA GOLD MULTIMONED ••7731 presenta un consumo. Monto: DOP 108.85 Estado: APROBADO Comercio: UBER*RIDES SANTO DOMINGODO Fecha de transacción: 01/10/2026 07:49 AM Número de aprobación: 900123',
    'Notificación de Consumo Su tarjeta VISA GOLD MULTIMONED ••7731 presenta un consumo. Monto: DOP 108.85 Estado: APROBADO Comercio: UBER*RIDES SANTO DOMINGODO Fecha de transacción: 01/10/2026 07:58 AM Número de aprobación: 900123',
    'Notificación de Consumo Su tarjeta VISA GOLD MULTIMONED ••7731 presenta un consumo. Monto: DOP 109.15 Estado: APROBADO Comercio: UBER*RIDES SANTO DOMINGODO Fecha de transacción: 01/10/2026 07:58 AM Número de aprobación: 601865',
    'Notificación de Consumo Su tarjeta VISA GOLD MULTIMONED ••7731 presenta un consumo. Monto: DOP 166.28 Estado: APROBADO Comercio: UBR* PENDING.UBER.COM Amsterdam NL Fecha de transacción: 08/10/2026 08:17 PM Número de aprobación: 194769',
    'Hola CLIENTE, Tu tarjeta de Crédito titular-Visa Familiar APAP terminada en 4417 presenta una transacción, con el siguiente detalle: Detalle de la transacción Fecha: 01/10/2026 Hora: 13:51 Moneda: RD pesos dominicanos Monto: 825.00 Comercio: CLUB LIBANES SIRIO PAL Estado: APROBADA Balance disponible: RD$86,381.33',
    '¡Transacción realizada! Te notificamos que la siguiente transacción fue realizada desde una oficina comercial: Monto: DOP 21,576.00 Transacción: 022N - Retiro de ahorros sin libreta Cuenta: DOP - ***6620 Fecha de transacción: 09 DE OCTUBRE DEL 2026 - 2:49 P. M. Número de transacción: 261009002480010221',
  ].join('\n\n');
  const items = parseBankAlerts(t);
  assert.equal(items.length, 5);
  const [hold, fin, pend, apap, cash] = items;
  assert.equal(hold.merchant, 'Uber');
  assert.equal(hold.account.last4, '7731');
  assert.equal(hold.on, false);
  assert.match(hold.check, /retención inicial/);
  assert.equal(fin.on, undefined);
  assert.equal(fin.ref, '601865');
  assert.equal(pend.on, false);
  assert.equal(apap.merchant, 'Club Libanes Sirio Pal');
  assert.deepEqual(apap.avail, { currency: 'DOP', amount: 86381.33 });
  assert.equal(cash.kind, 'transfer');
  assert.equal(cash.day, '2026-10-09');
  assert.equal(cash.time, '14:49');
  assert.equal(prettyMerchant('GOOGLE *G1AI101M 855-836-3987 US'), 'Google');
  assert.equal(prettyMerchant('HIPER OLE INDEPENDENCI SANTO DOMINGODO'), 'Hiper Ole Independenci');
});

test('nombres de cuenta y los últimos 4 en el nombre del archivo', () => {
  assert.deepEqual(S.accountFromLabel('Banreservas Visa Gold ·7731'), { name: 'Banreservas Visa Gold', last4: '7731', bank: 'Banreservas', kind: 'tarjeta' });
  assert.equal(S.accountFromLabel('Efectivo').kind, 'efectivo');
  assert.equal(S.last4FromName('Estado de cuenta XXXXXX3394.csv'), '3394');
  assert.equal(S.last4FromName('movimientos_6620.xlsx'), '6620');
  assert.equal(S.bankOf('Banco de Reservas de la R.D.'), 'Banreservas');
  assert.ok(S.formatKey(['Fecha', 'Descripción', 'Débito']).startsWith('fecha|descripcion|debito'));
});
