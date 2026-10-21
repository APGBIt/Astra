import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScan, scanKind, amountsIn, datesIn, voucherTx } from '../src/game/scan.js';
import * as L from '../src/game/logic.js';

const TODAY = '2026-10-21';

const SUPER = `SUPERMERCADO BRAVO
AV. INDEPENDENCIA #1250
RNC: 1-01-12345-6
TEL. 809-555-1234
FACTURA PARA CONSUMIDOR FINAL
NCF: B0200012345
FECHA: 18/10/2026 HORA: 14:35
---------------------------------
2 X LECHE ENTERA 1L        170.00
PAN SOBAO                   65.00
ARROZ SELECTO 5LB          245.50
---------------------------------
SUBTOTAL                   480.50
ITBIS 18%                   86.49
TOTAL RD$                  566.99
EFECTIVO                   600.00
CAMBIO                      33.01
GRACIAS POR SU COMPRA`;

const RESTAURANTE = `Restaurante El Pescador
RNC 130-12345-7
e-NCF E320000012345
21-10-2026 20:15
Mesa 4  Mesero: Juan
SUBTOTAL 2,500.00
ITBIS 18% 450.00
LEY 10% 250.00
TOTAL A PAGAR 3,200.00
VISA ************4321
Propina voluntaria: ______`;

const BANRESERVAS = `Banreservas
Transferencia exitosa
Monto
RD$ 6,500.00
Beneficiario
CARLA MARIA PEREZ
Cuenta destino
Banco Popular ****5678
Cuenta origen
Ahorro ****4321
Concepto
Pago de la cena
Fecha
13/10/2026 10:42 a.m.
No. de referencia
123456789
Impuesto DGII (0.15%) RD$ 9.75`;

const POPULAR = `Comprobante de transferencia
Transacción realizada con éxito
Desde: Cuenta de ahorro *8765
Para: Luis Gómez - BHD
Monto: RD$25,000.00
Comisión: RD$0.00
Fecha y hora: 07/10/2026 3:15 PM
Número de confirmación: TRX-2026-000998877`;

const TARJETA = `APAP
Pago de tarjeta exitoso
Tarjeta VISA ****5555
Monto pagado
RD$12,000.00
Desde cuenta ****4321
Fecha 11/10/2026
Referencia 55667788`;

test('montos y fechas: con centavos, miles y moneda; sin teléfonos ni porcentajes', () => {
  assert.deepEqual(amountsIn('TOTAL RD$ 1,234.50').map((a) => a.v), [1234.5]);
  assert.deepEqual(amountsIn('ITBIS 18% 86.49').map((a) => a.v), [86.49]);
  assert.deepEqual(amountsIn('TEL. 809-555-1234').map((a) => a.v), []);
  assert.deepEqual(amountsIn('2 X LECHE 170.00').map((a) => a.v), [170]);
  assert.equal(amountsIn('Monto: US$ 120.00')[0].usd, true);
  assert.deepEqual(datesIn('FECHA: 18/10/2026'), ['2026-10-18']);
  assert.deepEqual(datesIn('07-oct-2026'), ['2026-10-07']);
  assert.deepEqual(datesIn('10/31/2026'), ['2026-10-31']);
});

test('OCR de una factura: comercio, RNC, NCF, fecha, ITBIS, total y forma de pago', () => {
  const r = parseScan(SUPER, TODAY);
  assert.equal(r.kind, 'recibo');
  assert.equal(r.merchant, 'Supermercado Bravo');
  assert.equal(r.rnc, '101123456');
  assert.equal(r.ncf, 'B0200012345');
  assert.equal(r.day, '2026-10-18');
  assert.equal(r.time, '14:35');
  assert.equal(r.subtotal, 480.5);
  assert.equal(r.itbis, 86.49);
  assert.equal(r.total, 566.99);
  assert.equal(r.method, 'efectivo');
  assert.equal(r.cat, 'super');
  assert.equal(r.doubts.has('total'), false);
});

test('OCR de un restaurante: e-NCF, ley 10 %, total a pagar y tarjeta', () => {
  const r = parseScan(RESTAURANTE, TODAY);
  assert.equal(r.kind, 'recibo');
  assert.equal(r.rnc, '130123457');
  assert.equal(r.ncf, 'E320000012345');
  assert.equal(r.day, '2026-10-21');
  assert.equal(r.total, 3200);
  assert.equal(r.itbis, 450);
  assert.equal(r.tip, 250);
  assert.equal(r.method, 'tarjeta');
  assert.equal(r.last4, '4321');
  assert.equal(r.doubts.has('total'), false);
});

test('OCR de un comprobante de transferencia: beneficiario, banco, cuentas, referencia e impuesto', () => {
  assert.equal(scanKind(BANRESERVAS), 'transferencia');
  const r = parseScan(BANRESERVAS, TODAY);
  assert.equal(r.kind, 'transferencia');
  assert.equal(r.total, 6500);
  assert.equal(r.toName, 'Carla Maria Perez');
  assert.equal(r.toBank, 'Popular');
  assert.equal(r.fromLast4, '4321');
  assert.equal(r.toLast4, '5678');
  assert.equal(r.concept, 'Pago de la cena');
  assert.equal(r.day, '2026-10-13');
  assert.equal(r.ref, '123456789');
  assert.equal(r.tax, 9.75);
  assert.equal(r.cat, 'terceros');
  const p = parseScan(POPULAR, TODAY);
  assert.equal(p.kind, 'transferencia');
  assert.equal(p.total, 25000);
  assert.equal(p.toName, 'Luis Gómez');
  assert.equal(p.toBank, 'BHD');
  assert.equal(p.fromLast4, '8765');
  assert.equal(p.day, '2026-10-07');
  assert.equal(p.time, '15:15');
  assert.equal(p.ref, 'TRX-2026-000998877');
  assert.equal(p.fee, 0);
});

test('un comprobante se vuelve el movimiento: cuenta por sus últimos 4, tarjeta pagada y nota con la referencia', () => {
  const s = L.defaultState(TODAY);
  const bank = L.addAccount(s, { name: 'Ahorro Banreservas', kind: 'cuenta', last4: '4321' });
  const deb = L.addAccount(s, { name: 'Débito', kind: 'debito', last4: '8765', of: bank.id });
  const visa = L.addAccount(s, { name: 'Visa APAP', kind: 'tarjeta', last4: '5555' });
  const t1 = voucherTx(s, parseScan(BANRESERVAS, TODAY));
  assert.equal(t1.type, 'gasto');
  assert.equal(t1.cat, 'terceros');
  assert.equal(t1.account, bank.id);
  assert.equal(t1.merchant, 'Carla Maria Perez');
  assert.match(t1.note, /Pago de la cena/);
  assert.match(t1.note, /Ref\. 123456789/);
  const t2 = voucherTx(s, parseScan(POPULAR, TODAY));
  assert.equal(t2.account, bank.id, 'la tarjeta de débito mueve la cuenta de su banco');
  const t3 = voucherTx(s, parseScan(TARJETA, TODAY));
  assert.equal(t3.type, 'transfer');
  assert.equal(t3.cat, 'pago_tarjeta');
  assert.equal(t3.to, visa.id);
  assert.equal(t3.account, bank.id);
  assert.equal(t3.amount, 12000);
  assert.equal(deb.of, bank.id);
});

test('texto sin total claro: toma el monto mayor y lo marca para revisar', () => {
  const r = parseScan('FERRETERIA OCHOA\nTornillos 125.00\nPintura 1,450.00\nGracias', TODAY);
  assert.equal(r.total, 1450);
  assert.ok(r.doubts.has('total'));
  assert.ok(r.doubts.has('fecha'));
});

test('el texto tal como lo leyó el OCR (con sus errores): ITBIS mal leído, «S5LB» y el porcentaje', () => {
  const raw = `SUPERMERCADO BRAVO
AV. INDEPENDENCIA %1250
RNC: 1-01-12345-6
TEL. 809-555-1234
FACTURA PARA CONSUMIDOR FINAL
NCF: B0200012345
FECHA: 18/10/2026 HORA: 14:35
2 X LECHE ENTERA 1L 170.00
PAN SOBAO 65.00
ARROZ SELECTO S5LB 245.50
SUBTOTAL 480.50
I1T1BIS 13% 86.49
TOTAL RD$ 566.99
EFECTIVO 600.00
CAMBIO 33.01
GRACIAS POR SU COMPRA`;
  const r = parseScan(raw, TODAY);
  assert.equal(r.total, 566.99);
  assert.equal(r.subtotal, 480.5);
  assert.equal(r.itbis, 86.49);
  assert.equal(r.doubts.has('total'), false);
  assert.equal(r.time, '14:35');
});
