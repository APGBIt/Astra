// 1.17: salud al estilo WHOOP (preparación, carga, sueño que necesitas, señales, hábitos), análisis de laboratorio
// e informe semanal.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/game/logic.js';
import * as LB from '../src/game/labs.js';
import * as V from '../src/game/vitals.js';
import * as R from '../src/game/report.js';
import * as RM from '../src/game/reminders.js';
import { LAB_MARKER } from '../src/game/labcatalog.js';
import { addMed } from '../src/game/health.js';
import { buildTables } from '../src/game/tables.js';
import { mergeStates } from '../src/game/merge.js';
import { migrate } from '../src/app/store.js';
import { addDays } from '../src/app/dates.js';

const D = '2026-11-08'; // domingo
function fresh(day = D) {
  const s = L.defaultState(addDays(day, -120));
  s.profile.onboarded = true;
  s.profile.name = 'Ana Prueba';
  return s;
}
const clone = (x) => JSON.parse(JSON.stringify(x));
const vigor = (s) => s.attrs.salud || 0;

// Un informe como los de República Dominicana (datos inventados).
const REPORT = `LABORATORIO CLÍNICO AMADITA
Paciente: ANA PRUEBA                       Edad: 34 años
Cédula: 001-0000000-0
Fecha de nacimiento: 12/03/1992
Médico: DR. JUAN EJEMPLO
Fecha de toma: 03/11/2026     Fecha de emisión: 05/11/2026

QUÍMICA
GLUCOSA EN AYUNAS        104    mg/dL     70 - 100
HEMOGLOBINA GLICOSILADA  5.6    %         4.0 - 5.6
COLESTEROL TOTAL         212 *  mg/dL     < 200
COLESTEROL HDL           48     mg/dL     H: > 40   M: > 50
COLESTEROL LDL           136    mg/dL     Óptimo: < 100  Casi óptimo: 100 - 129  Límite alto: 130 - 159
TRIGLICÉRIDOS            140    mg/dL     < 150
TSH                      2.10   µUI/mL    0.40 - 4.00
VITAMINA D 25-OH         24.5   ng/mL     30 - 100
CERULOPLASMINA           30     mg/dL     20 - 60

HEMOGRAMA
LEUCOCITOS               7500             4500 - 11000
NEUTRÓFILOS              55     %         40 - 70
`;

// ---------- Análisis: leer el informe ----------

test('análisis: lee la fecha de la toma (no la de nacimiento), el laboratorio y cada prueba con su rango', () => {
  const r = LB.parseLabText(REPORT, D, { sex: 'f' });
  assert.equal(r.day, '2026-11-03');
  assert.match(r.lab, /Amadita/);
  assert.equal(r.personal, 4, 'paciente, cédula, nacimiento y médico');
  assert.equal(r.items.length, 11);
  const by = Object.fromEntries(r.items.map((it) => [it.key || it.name, it]));
  assert.deepEqual([by.glucosa.value, by.glucosa.unit, by.glucosa.lo, by.glucosa.hi], [104, 'mg/dL', 70, 100]);
  assert.equal(LB.itemStatus(by.glucosa).st, 'alto');
  assert.equal(LB.itemStatus(by.hba1c).st, 'ok', 'el borde del rango cuenta como dentro');
  assert.equal(by.col_total.hi, 200);
  assert.equal(by.col_total.hx, true);
  assert.equal(LB.itemStatus(by.col_total).st, 'alto');
  assert.equal(by.hdl.lo, 50, 'mujer: el rango de M');
  assert.equal(LB.itemStatus(by.hdl).st, 'bajo');
  assert.equal(by.ldl.hi, 100, 'de las categorías se toma la óptima');
  assert.equal(by.ldl.ref, 'Óptimo: < 100 Casi óptimo: 100 - 129 Límite alto: 130 - 159', 'el rango tal como está escrito, sin cortar números');
  assert.equal(by.tsh.unit, 'µUI/mL');
  assert.equal(LB.itemStatus(by.vitd).st, 'bajo');
  assert.equal(by.Ceruloplasmina.key, null, 'una prueba fuera del catálogo se guarda con su nombre');
  assert.equal(LB.itemStatus(by.Ceruloplasmina).st, 'ok');
  assert.equal(by.leucocitos.unit, '/mm³', 'leucocitos 7500 sin unidad son por mm³');
  assert.equal(by.neutrofilos_pct.name, 'Neutrófilos (%)', 'el % se guarda aparte del conteo');
  assert.ok(!JSON.stringify(r.items).includes('ANA PRUEBA'));
});

test('análisis: el rango por sexo depende de lo que elijas; sin elegir, se usa la guía', () => {
  const m = LB.parseLabText(REPORT, D, { sex: 'm' }).items.find((it) => it.key === 'hdl');
  assert.equal(m.lo, 40);
  assert.equal(LB.itemStatus(m).st, 'ok');
  const none = LB.parseLabText(REPORT, D).items.find((it) => it.key === 'hdl');
  assert.equal(none.lo, undefined);
  assert.deepEqual([LB.itemStatus(none).st, LB.itemStatus(none).src], ['ok', 'guia']);
  assert.deepEqual(LB.parseRange('Hombres: 13.5 - 17.5 Mujeres: 12.0 - 15.5', { sex: 'f' }), { lo: 12, hi: 15.5, lx: false, hx: false });
  assert.deepEqual(LB.parseRange('F: 0.5 - 1.1 M: 0.7 - 1.3', { sex: 'f' }), { lo: 0.5, hi: 1.1, lx: false, hx: false });
  assert.equal(LB.parseRange('H: 40 - 60 M: 50 - 70'), null);
});

test('análisis: rangos de un lado y por categorías', () => {
  assert.deepEqual(LB.parseRange('70 - 100'), { lo: 70, hi: 100, lx: false, hx: false });
  assert.deepEqual(LB.parseRange('< 200'), { lo: null, hi: 200, lx: false, hx: true });
  assert.deepEqual(LB.parseRange('> 40'), { lo: 40, hi: null, lx: true, hx: false });
  assert.deepEqual(LB.parseRange('Deseable: < 200 Limítrofe: 200 - 239 Alto: >= 240'), { lo: null, hi: 200, lx: false, hx: true });
});

test('análisis: unidades de otros países se pasan a la del catálogo', () => {
  assert.equal(LB.toStd(LAB_MARKER.hba1c, 38, 'mmol/mol'), 5.6);
  assert.equal(LB.toStd(LAB_MARKER.vitd, 60, 'nmol/L'), 24);
  assert.equal(Math.round(LB.toStd(LAB_MARKER.glucosa, 5.5, 'mmol/L')), 99);
  assert.equal(Math.round(LB.toStd(LAB_MARKER.col_total, 5.2, 'mmol/L')), 201);
  assert.equal(LB.toStd(LAB_MARKER.glucosa, 5.5, 'g/L'), null, 'sin conversión conocida: no se inventa');
});

test('análisis: primero el rango del laboratorio, luego la marca del informe y por último la guía', () => {
  const g = { key: 'glucosa', name: 'Glucosa', value: 104, unit: 'mg/dL' };
  assert.deepEqual(LB.itemStatus(g), { st: 'atento', label: 'En el rango de prediabetes (100 a 125)', src: 'guia', guide: 'ADA' });
  assert.equal(LB.itemStatus({ ...g, value: 5.8, unit: 'mmol/L' }).st, 'atento', 'la guía también con mmol/L');
  assert.deepEqual(LB.itemStatus({ ...g, flag: 'alto' }), { st: 'alto', label: 'Alto', src: 'marca' });
  assert.deepEqual(LB.itemStatus({ ...g, lo: 70, hi: 110, flag: 'alto' }), { st: 'ok', label: 'En rango', src: 'lab' });
  assert.equal(LB.itemStatus({ key: null, name: 'X', value: 3, unit: 'mg/dL' }).st, 'sin');
  assert.equal(LB.itemStatus({ name: 'VIH', value: null, text: 'No reactivo' }).st, 'sin');
  assert.equal(LB.itemStatus({ name: 'Antígeno', value: null, text: 'Positivo' }).st, 'fuera');
});

test('análisis: sin datos personales para la IA y su respuesta se convierte igual que el lector del teléfono', () => {
  const safe = LB.safeLabText(REPORT);
  assert.ok(!/ANA PRUEBA|001-0000000|1992|JUAN/.test(safe));
  assert.match(safe, /GLUCOSA EN AYUNAS/);
  const prompt = LB.labPrompt(safe);
  assert.match(prompt, /nunca incluyas nombre, cédula/);
  assert.match(prompt, /GLUCOSA EN AYUNAS/);
  const ai = LB.fromAI({ fecha: '2026-11-03', laboratorio: 'Laboratorio Referencia', resultados: [
    { prueba: 'Nombre del paciente', valor: null, texto: 'Ana Prueba' },
    { prueba: 'Glucosa', valor: '104', unidad: 'mg/dL', referencia: '70 - 100', marca: 'alto' },
    { prueba: 'Vitamina D 25-OH', valor: 60, unidad: 'nmol/L', referencia: '75 - 250' },
    { prueba: 'Prueba de embarazo', valor: null, texto: 'Negativo' },
    { prueba: 'Sin resultado', valor: null, texto: null },
  ] }, D);
  assert.equal(ai.day, '2026-11-03');
  assert.deepEqual(ai.items.map((it) => it.key || it.name), ['glucosa', 'vitd', 'Prueba de embarazo']);
  assert.deepEqual([ai.items[0].value, ai.items[0].flag, ai.items[0].lo, ai.items[0].hi], [104, 'alto', 70, 100]);
  assert.equal(LB.itemStatus(ai.items[1]).st, 'bajo');
  assert.equal(LB.fromAI({ fecha: '2027-01-01', resultados: [] }, D).day, null, 'una fecha futura no se acepta');
  assert.deepEqual(LB.fromAI(null, D).items, []);
});

// ---------- Análisis: guardarlos ----------

function withLabs() {
  const s = fresh();
  const old = LB.parseLabText('Fecha de toma: 02/05/2026\nVITAMINA D 25-OH 40.5 nmol/L 75 - 250\nGLUCOSA 96 mg/dL 70 - 100', D);
  LB.addLabPanel(s, { day: old.day, lab: 'Laboratorio Amadita', items: old.items, source: 'texto' }, '2026-05-02');
  const r = LB.parseLabText(REPORT, D, { sex: 'f' });
  LB.addLabPanel(s, { day: r.day, lab: r.lab, items: r.items, source: 'pdf' }, D);
  return s;
}

test('análisis: guardar da XP (hasta dos al día), el logro y la fecha nunca queda en el futuro', () => {
  const s = fresh();
  const xp0 = vigor(s);
  const ev = [];
  const items = LB.parseLabText(REPORT, D, { sex: 'f' }).items;
  const p1 = LB.addLabPanel(s, { day: '2027-02-01', lab: 'X', items, source: 'pdf' }, D, ev);
  assert.equal(p1.day, D);
  LB.addLabPanel(s, { day: D, items, source: 'pdf' }, D);
  LB.addLabPanel(s, { day: D, items, source: 'pdf' }, D);
  assert.equal(vigor(s) - xp0 >= 30, true);
  assert.ok(vigor(s) - xp0 < 45, 'el tercero del día no suma');
  assert.ok(s.achievements.analisis1, 'logro «Chequeo al día»');
  assert.equal(LB.addLabPanel(s, { day: D, items: [] }, D), null, 'sin pruebas no se guarda');
});

test('análisis: resumen por sistema, historial con unidades convertidas y tendencia', () => {
  const s = withLabs();
  const sum = LB.labSummary(s);
  assert.equal(sum.panels.length, 2);
  assert.equal(sum.last.day, '2026-11-03');
  assert.equal(sum.total, 11);
  assert.deepEqual(sum.counts, { ok: 6, atento: 0, fuera: 5, sin: 0 });
  assert.deepEqual(sum.out.map((x) => x.key).sort(), ['col_total', 'glucosa', 'hdl', 'ldl', 'vitd']);
  assert.equal(sum.groups[0].key, 'azucar');
  const hist = LB.labHistory(s, 'vitd');
  assert.deepEqual(hist.map((h) => [h.day, h.std, h.unit]), [['2026-05-02', 16.2, 'ng/mL'], ['2026-11-03', 24.5, 'ng/mL']]);
  const vit = sum.groups.flatMap((g) => g.items).find((x) => x.key === 'vitd');
  const tr = LB.trendOfItem(vit);
  assert.equal(Math.round(tr.diff * 10) / 10, 8.3);
  assert.equal(tr.flat, false);
  const rows = LB.labRows(s);
  assert.equal(rows.length, 13);
  const t = buildTables(s, D);
  assert.deepEqual(t['Análisis'][0], ['Fecha', 'Laboratorio', 'Prueba', 'Resultado', 'Unidad', 'Rango del informe', 'Estado', 'Según']);
  assert.ok(t['Análisis'].some((r) => r[2] === 'Glucosa en ayunas' && r[6] === 'Alto' && r[7] === 'Rango del laboratorio'));
});

test('análisis: editar, borrar y limpiar datos dañados', () => {
  const s = withLabs();
  const p = s.labs[0];
  LB.updateLabPanel(s, p.id, { lab: 'Otro laboratorio' });
  assert.equal(s.labs[0].lab, 'Otro laboratorio');
  LB.removeLabPanel(s, p.id);
  assert.equal(s.labs.length, 1);
  s.labs.push({ id: 'x', day: 'ayer', items: [{ name: 'A', value: 1 }] }, { id: 'y', day: D, items: [] }, { day: D, items: [{ name: 'B', value: 2 }] });
  s.labs.push({ id: 'z', day: '2026-01-01', items: [{ name: 'Rara', value: 5, lo: 9, hi: 3, key: 'inventada' }, { name: '', value: 3 }] });
  LB.ensureLabs(s);
  assert.deepEqual(s.labs.map((x) => x.id).slice(-1), ['z']);
  assert.equal(s.labs.length, 2);
  const z = s.labs.find((x) => x.id === 'z');
  assert.deepEqual([z.items.length, z.items[0].lo, z.items[0].hi, z.items[0].key], [1, 3, 9, null]);
});

test('análisis: sugerencias (suplemento a los 3 meses, llevar al médico, chequeo anual) y pendientes sin repetir', () => {
  const s = withLabs();
  addMed(s, { name: 'Vitamina D3 2000 UI', start: '2026-07-01' }, '2026-07-01');
  let sug = LB.labSuggestions(s, D);
  assert.ok(sug.some((x) => x.kind === 'medico'));
  assert.ok(!sug.some((x) => x.kind === 'supl'), 'ya hay un análisis de vitamina D después de empezar');
  s.labs = s.labs.filter((p) => p.day !== '2026-11-03');
  sug = LB.labSuggestions(s, D);
  const supl = sug.find((x) => x.kind === 'supl');
  assert.equal(supl.marker, 'vitd');
  assert.match(supl.text, /Pregúntale a tu médico/);
  const later = LB.labSuggestions(s, '2027-06-01');
  assert.ok(later.some((x) => x.kind === 'anual'));
  // Pendiente desde la sugerencia: una sola vez.
  const s2 = withLabs();
  const med = LB.labSuggestions(s2, D).find((x) => x.kind === 'medico');
  const t1 = LB.labTodo(s2, { title: med.todo, src: med.src }, D);
  assert.equal(t1.cat, 'salud');
  assert.equal(t1.due, addDays(D, 7));
  assert.equal(LB.labTodo(s2, { title: med.todo, src: med.src }, D), null);
  assert.ok(!LB.labSuggestions(s2, D).some((x) => x.kind === 'medico'), 'ya está en pendientes');
  assert.equal(LB.repeatDue('2026-11-02', 6), '2027-05-02');
  assert.equal(LB.repeatDue('2026-01-31', 1), '2026-02-28');
});

// ---------- Cómo amaneciste y preparación ----------

test('preparación: sueño + cómo amaneciste; XP una vez; enfermo la deja en rojo', () => {
  const s = fresh();
  L.logHealth(s, D, { sleep: 7 }, D, []);
  assert.equal(V.readiness(s, D).partial, true, 'solo con el sueño es parcial');
  const xp0 = vigor(s);
  V.logReady(s, D, { e: 4, c: 4, s: 3, a: 4, rhr: 200, hrv: 60 }, D);
  V.logReady(s, D, { e: 4, c: 4, s: 3, a: 4 }, D);
  assert.equal(vigor(s) - xp0, 3);
  assert.equal(s.health[D].rhr, undefined, 'un pulso de 200 en reposo no se guarda');
  assert.equal(s.health[D].hrv, 60);
  const rd = V.readiness(s, D);
  assert.equal(rd.partial, false);
  assert.equal(rd.zone, 'verde');
  assert.ok(rd.score >= 67);
  V.logReady(s, D, { e: 2, c: 3, s: 3, a: 3, sick: true }, D);
  const sick = V.readiness(s, D);
  assert.equal(sick.zone, 'rojo');
  assert.ok(sick.score <= 33);
  assert.equal(V.readiness(fresh(), D), null);
});

test('preparación: un pulso en reposo muy por encima de tu normal la baja', () => {
  const s = fresh();
  for (let i = 1; i <= 20; i++) s.health[addDays(D, -i)] = { rhr: 60 + (i % 3), sleep: 7.5 };
  L.logHealth(s, D, { sleep: 7.5 }, D, []);
  V.logReady(s, D, { e: 4, c: 4, s: 4, a: 4, rhr: 61 }, D);
  const normal = V.readiness(s, D).score;
  V.logReady(s, D, { e: 4, c: 4, s: 4, a: 4, rhr: 70 }, D);
  const high = V.readiness(s, D);
  assert.ok(high.score < normal - 5, `${high.score} < ${normal}`);
  assert.match(high.worst.text, /más alto que tu normal/);
});

// ---------- Carga ----------

test('carga: minutos × esfuerzo al registrar actividad; al bajar los minutos, baja en proporción', () => {
  const s = fresh();
  L.logHealth(s, D, { exercise: 30, exType: 'caminar', rpe: 3 }, D, []);
  assert.equal(s.health[D].load, 90);
  L.logHealth(s, D, { exercise: 50, exType: 'gimnasio', rpe: 7 }, D, []);
  assert.equal(s.health[D].load, 230);
  L.logHealth(s, D, { exercise: 25 }, D, []);
  assert.equal(s.health[D].load, 115);
  L.logHealth(s, D, { exercise: 0 }, D, []);
  assert.equal(s.health[D].load, undefined);
  assert.equal(V.dayLoad({ exercise: 40, exVig: 10 }), 30 * 3 + 10 * 6, 'días de antes: estimada con la intensidad');
  assert.equal(V.rpeDefault('intensa'), 6);
});

test('carga: estable, subiendo o salto frente a tus últimas 4 semanas', () => {
  const s = fresh();
  for (let i = 7; i < 35; i++) if (i % 2) s.health[addDays(D, -i)] = { exercise: 40, load: 160 };
  assert.equal(V.loadInfo(s, D).status, 'bajando');
  for (let i = 0; i < 7; i++) if (i % 2) s.health[addDays(D, -i)] = { exercise: 40, load: 160 };
  const st = V.loadInfo(s, D);
  assert.equal(st.status, 'estable');
  assert.equal(st.activeAvg, 160);
  for (let i = 0; i < 7; i++) s.health[addDays(D, -i)] = { exercise: 60, load: 300 };
  const jump = V.loadInfo(s, D);
  assert.equal(jump.status, 'salto');
  assert.ok(jump.ratio > 1.5);
  assert.equal(jump.activeAvg, 209, 'tu día activo normal ya incluye los últimos días');
  assert.equal(jump.level, 'alta', '300 es 1.4 veces tu día activo normal');
});

// ---------- Sueño que necesitas ----------

test('sueño que necesitas: meta + una parte de la deuda + esfuerzo − siesta, y la cuenta cuadra con el texto', () => {
  const s = fresh();
  s.profile.sleepGoal = 7;
  assert.equal(V.sleepNeed(s, D).need, 7);
  for (let i = 0; i < 7; i++) s.health[addDays(D, -i)] = { sleep: 6 }; // 7 h de deuda
  let n = V.sleepNeed(s, D);
  assert.equal(n.debt, 7);
  assert.equal(n.debtAdd, 1, 'hasta 1 hora extra por noche');
  assert.equal(n.need, 8);
  s.health = {};
  s.health[addDays(D, -1)] = { sleep: 5.75 }; // 1 h 15 de deuda → 25 % ≈ 20 min (en pasos de 5)
  n = V.sleepNeed(s, D);
  assert.equal(Math.round(n.debtAdd * 60), 20);
  assert.equal(L.fmtHours(n.need), '7 h 20');
  assert.equal(V.needText(n), 'tu meta de 7 h + 20 min para ponerte al día');
  assert.equal(V.bedtimeForNeed(s, '06:00', n.need), '22:25', '7 h 20 + 15 min para dormirte');
  s.health[D] = { ...(s.health[D] || {}), nap: 30 };
  n = V.sleepNeed(s, D);
  assert.equal(L.fmtHours(n.need), '6 h 50');
  assert.equal(V.needText(n), 'tu meta de 7 h + 20 min para ponerte al día − 30 min de siesta');
  s.health = { [D]: { nap: 90 } };
  n = V.sleepNeed(s, D);
  assert.equal(n.need, 6.5, 'la siesta nunca deja la noche en menos de tu meta − 30 min');
  assert.equal(V.needText(n), 'tu meta de 7 h − 30 min de siesta');
});

// ---------- Presión, peso y señales ----------

test('presión: categorías AHA/ACC 2025', () => {
  assert.equal(V.bpCategory(118, 76).key, 'normal');
  assert.equal(V.bpCategory(124, 78).key, 'elevada');
  assert.equal(V.bpCategory(126, 80).key, 'etapa1', 'basta con la de abajo');
  assert.equal(V.bpCategory(132, 70).key, 'etapa1');
  assert.equal(V.bpCategory(141, 85).key, 'etapa2');
  assert.equal(V.bpCategory(182, 100).key, 'crisis');
  assert.equal(V.bpCategory(150, 121).key, 'crisis');
});

test('presión: tomas válidas, XP una vez al día, promedio de 7 días y semana de presión sin el primer día', () => {
  const s = fresh();
  assert.equal(V.addBP(s, D, { sys: 80, dia: 90 }, D), null);
  assert.equal(V.addBP(s, D, { sys: 300, dia: 90 }, D), null);
  const xp0 = vigor(s);
  V.addBP(s, D, { sys: 128, dia: 82, pulse: 66, time: '20:10' }, D);
  V.addBP(s, D, { sys: 124, dia: 80, time: '07:05' }, D);
  assert.equal(vigor(s) - xp0, 2);
  assert.deepEqual(s.health[D].bp.map((r) => r.t), ['07:05', '20:10']);
  assert.equal(s.health[D].bp[1].pulse, 66);
  const st = V.bpStats(s, D);
  assert.deepEqual([st.n, st.sys, st.dia, st.cat.key], [2, 126, 81, 'etapa1']);
  V.removeBP(s, D, s.health[D].bp[0].id);
  assert.equal(s.health[D].bp.length, 1);
  // Semana de presión.
  const w = fresh();
  const start = addDays(D, -7);
  w.vitals.bpWeek = { start };
  V.addBP(w, start, { sys: 150, dia: 95, time: '07:00' }, D);
  for (let i = 1; i < 7; i++) {
    const d = addDays(start, i);
    V.addBP(w, d, { sys: 122, dia: 78, time: '07:00' }, D);
    V.addBP(w, d, { sys: 126, dia: 80, time: '20:00' }, D);
  }
  const info = V.bpWeekInfo(w, D);
  assert.equal(info.done, true);
  assert.equal(info.n, 12);
  assert.deepEqual(info.res, { sys: 124, dia: 79 }, 'el primer día (150/95) no cuenta');
  assert.equal(info.cat.key, 'elevada');
  assert.deepEqual(info.days[1], { day: addDays(start, 1), am: 1, pm: 1 });
});

test('peso: se guarda en kg, se muestra en tu unidad y se mira la tendencia de 7 días', () => {
  const s = fresh();
  assert.equal(V.logWeight(s, D, 20, 'kg'), null);
  assert.equal(V.logWeight(s, addDays(D, -8), 154, 'lb'), 69.9);
  V.logWeight(s, addDays(D, -9), 154, 'lb');
  V.logWeight(s, D, 152, 'lb');
  assert.equal(V.weightUnit(s), 'lb');
  const wi = V.weightInfo(s, D);
  assert.equal(wi.last.day, D);
  assert.equal(Math.round(V.fromKg(wi.last.kg, 'lb')), 152);
  assert.equal(wi.change, -1, '68.9 kg frente a 69.9 kg');
  V.logWeight(s, D, 69, 'kg');
  assert.equal(V.weightUnit(s), 'kg');
});

test('señales: tu normal de 30 días y aviso suave cuando varias salen a la vez', () => {
  const s = fresh();
  for (let i = 1; i <= 30; i++) s.health[addDays(D, -i)] = { rhr: 60 + (i % 3), hrv: 55 + (i % 5) };
  s.health[D] = { rhr: 72, hrv: 38, ready: { e: 2, c: 3, s: 3, a: 3 } };
  const sig = V.signals(s, D);
  assert.equal(sig.find((x) => x.key === 'rhr').off, true);
  assert.equal(sig.find((x) => x.key === 'hrv').off, true);
  assert.match(V.radar(s, D).text, /pulso en reposo está más alto/);
  s.health[D] = { rhr: 61 };
  assert.equal(V.radar(s, D), null);
});

// ---------- Hábitos ----------

test('hábitos: se guardan todos (sí o no) y se ve su efecto con al menos 5 días de cada lado', () => {
  const s = fresh();
  assert.deepEqual(V.setHabits(s, D, ['alcohol', 'inventado']), { alcohol: 1, cafe: 0, cena: 0, pantallas: 0, siesta: 0, noche: 0, estres: 0, sol: 0, lectura: 0 });
  assert.equal(V.setHabits(s, D, { sol: true, alcohol: false }).sol, 1);
  const t = fresh();
  for (let i = 1; i <= 24; i++) {
    const d = addDays(D, -i);
    const drank = i % 2 === 0;
    V.setHabits(t, d, drank ? ['alcohol'] : []);
    // La mañana siguiente:
    t.health[addDays(d, 1)] = { ...(t.health[addDays(d, 1)] || {}), sleep: drank ? 5.5 : 7.5, ready: drank ? { e: 2, c: 3, s: 3, a: 3 } : { e: 4, c: 4, s: 4, a: 4 } };
  }
  const eff = V.habitEffects(t, D);
  const alc = eff.find((e) => e.key === 'alcohol');
  assert.equal(alc.metric, 'ready');
  assert.equal(alc.big, true);
  assert.ok(alc.diff <= -20);
  assert.ok(alc.yes >= 5 && alc.no >= 5);
  assert.match(V.effectText(alc), /^Los días con alcohol, al día siguiente tu preparación fue \d+ puntos más baja/);
  assert.equal(eff[0].key, 'alcohol', 'lo más claro primero');
  assert.deepEqual(V.habitEffects(fresh(), D), []);
});

// ---------- Hábitos de largo plazo ----------

test('largo plazo: últimos 30 días frente a los 30 anteriores, con flechas que siguen al número', () => {
  const s = fresh();
  for (let i = 0; i < 60; i++) {
    const d = addDays(D, -i);
    const recent = i < 30;
    s.health[d] = { sleep: recent ? 7.25 : 6.5, steps: recent ? 8000 : 6000, veg: recent ? 3 : 4, rhr: recent ? 60 : 64, exercise: i % 2 ? 40 : 0 };
  }
  const lt = V.longTerm(s, D);
  const by = Object.fromEntries(lt.items.map((x) => [x.key, x]));
  assert.deepEqual([by.sleepH.st, by.sleepH.trend, by.sleepH.dir], ['ok', 'mejor', 1]);
  assert.deepEqual([by.steps.text, by.steps.trend], ['8,000', 'mejor']);
  assert.deepEqual([by.veg.st, by.veg.trend, by.veg.dir], ['cerca', 'peor', -1]);
  assert.deepEqual([by.rhr.trend, by.rhr.dir], ['mejor', -1], 'el pulso baja y eso es mejor');
  assert.equal(by.active.text, '140 min');
  assert.equal(by.active.target, '150 min a la semana');
  assert.deepEqual([by.strength.text, by.strength.st], ['0 días', 'lejos']);
  assert.equal(lt.focus.key, 'strength', 'lo más lejos de su meta (frutas y verduras va después)');
});

test('salud: los datos dañados se limpian al abrir', () => {
  const s = fresh();
  s.vitals = { wunit: 'stone', bpWeek: { start: 'ayer' }, sex: 'x' };
  s.health[D] = { ready: 5, bp: [{ id: 'a', sys: 80, dia: 90 }, { id: 'b', sys: 120, dia: 80 }, null], habits: [1], load: 'mucho', rhr: 'n/a', weight: 70 };
  V.ensureVitals(s);
  assert.deepEqual(s.vitals, { wunit: 'lb', bpWeek: null, sex: '' });
  assert.deepEqual(s.health[D], { bp: [{ id: 'b', sys: 120, dia: 80 }], weight: 70 });
});

// ---------- Informe semanal ----------

// Ocho semanas de datos con una semana pasada clara: buen ejercicio, horario de dormir disparejo.
function withWeeks() {
  const s = fresh();
  s.profile.sleepGoal = 7;
  for (let i = 0; i < 60; i++) {
    const d = addDays(D, -i);
    s.health[d] = { sleep: 6.75, bed: i % 2 ? '22:30' : '00:45', wake: '06:30', steps: 7000 + (i % 4) * 300, exercise: 40, exTypes: { caminar: 40 }, veg: 3 };
  }
  return s;
}

test('informe: la semana es de lunes a domingo y está lista el domingo desde las 6 p. m.', () => {
  assert.equal(R.weekOf(D), '2026-11-02');
  assert.equal(R.weekOf('2026-11-02'), '2026-11-02');
  assert.equal(R.readyWeek(D, 17), '2026-10-26');
  assert.equal(R.readyWeek(D, 18), '2026-11-02');
  assert.equal(R.readyWeek('2026-11-04', 21), '2026-10-26');
  assert.equal(R.weekLabel('2026-10-26'), '26 de octubre al 1 de noviembre');
  assert.equal(R.weekLabel('2026-11-02'), '2 al 8 de noviembre');
});

test('informe: logros y aspectos a mejorar (hasta 3, uno por área) con una frase de resumen', () => {
  const s = withWeeks();
  const rep = R.weeklyReport(s, '2026-10-26', D);
  assert.equal(rep.complete, true);
  assert.equal(rep.current, false);
  assert.ok(rep.wins.length >= 1 && rep.wins.length <= 3);
  assert.ok(rep.improve.length >= 1 && rep.improve.length <= 3);
  // Con solo datos de salud se repite el área; con ánimo, el segundo logro ya es de otra área.
  assert.deepEqual(rep.wins.map((w) => w.area), ['salud', 'salud']);
  const withMood = withWeeks();
  for (const d of ['2026-10-27', '2026-10-28', '2026-10-30', '2026-10-31']) L.addMood(withMood, { quad: 1, words: ['Tranquila'] }, d, []);
  const rep2 = R.weeklyReport(withMood, '2026-10-26', D);
  assert.deepEqual(rep2.wins.slice(0, 2).map((w) => w.area).sort(), ['emocional', 'salud']);
  assert.match(rep2.wins.find((w) => w.area === 'emocional').text, /tranquila/);
  assert.ok(rep.wins.some((w) => /minutos de actividad/.test(w.title)), JSON.stringify(rep.wins.map((w) => w.title)));
  assert.ok(rep.improve.some((x) => x.id === 'horario'), JSON.stringify(rep.improve.map((x) => x.id)));
  assert.match(rep.sentence, /^Lo mejor: .+ Para la próxima: .*acostarte a la misma hora/);
  assert.equal(rep.m.equiv, 280);
  assert.deepEqual(rep.sections.map((x) => x.key), ['salud', 'mente', 'finanzas', 'vida', 'dia']);
  const salud = rep.sections[0].rows.find((r) => r.label === 'Actividad');
  assert.equal(salud.value, '280 min');
  const txt = R.reportText(rep, 'Ana');
  assert.match(txt, /^Informe semanal de Astra · Ana\nSemana del 26 de octubre al 1 de noviembre/);
  assert.match(txt, /Lo que salió bien:/);
  assert.match(txt, /Aspectos a mejorar:/);
  const empty = R.weeklyReport(fresh(), '2026-10-26', D);
  assert.equal(empty.empty, true);
  assert.match(empty.sentence, /Todavía no hay datos/);
});

test('informe: la semana en curso se marca y la tendencia de 8 semanas termina en la semana que miras', () => {
  const s = withWeeks();
  const cur = R.weeklyReport(s, '2026-11-02', '2026-11-05');
  assert.equal(cur.current, true);
  assert.equal(cur.complete, false);
  assert.equal(cur.m.days, 4);
  const tr = R.reportTrend(s, D, 8, '2026-10-26');
  assert.equal(tr.length, 8);
  assert.equal(tr[7].wk, '2026-10-26');
  assert.equal(tr[0].wk, '2026-09-07');
  assert.equal(tr[7].active, R.weeklyReport(s, '2026-10-26', D).m.equiv);
  assert.equal(R.reportTrend(s, D).at(-1).wk, '2026-11-02');
});

test('foco: lo que se acumula cuenta apenas llegas; los topes y promedios, al cerrar la semana', () => {
  const s = withWeeks();
  const xp0 = vigor(s);
  const gold0 = s.gold;
  // Foco para la semana del 2 de noviembre, elegido en el informe del 26 de octubre.
  R.setFocus(s, '2026-10-26', { key: 'active_min', target: 150 }, '2026-11-01');
  assert.equal(s.reports.focus['2026-11-02'].text, '150 minutos de actividad');
  const mid = R.weeklyReport(s, '2026-11-02', '2026-11-05');
  assert.equal(mid.focusPrev.done, true, '160 min el jueves: ya se cumplió');
  assert.equal(R.claimFocus(s, '2026-11-02', '2026-11-05'), true);
  assert.equal(R.claimFocus(s, '2026-11-02', '2026-11-05'), false, 'una sola vez');
  assert.equal(vigor(s) - xp0 >= 30, true);
  assert.equal(s.gold - gold0, 10);
  // Un tope: «gastar como mucho» el lunes no está cumplido todavía.
  const t = withWeeks();
  R.setFocus(t, '2026-10-26', { key: 'spend_cap', target: 5000 }, '2026-11-01');
  const monday = R.focusEval(t.reports.focus['2026-11-02'], R.weekMetrics(t, '2026-11-02', '2026-11-02'));
  assert.deepEqual([monday.done, monday.pending], [false, true]);
  assert.equal(R.claimFocus(t, '2026-11-02', '2026-11-02'), false);
  const sunday = R.focusEval(t.reports.focus['2026-11-02'], R.weekMetrics(t, '2026-11-02', D));
  assert.deepEqual([sunday.done, sunday.pending], [true, false]);
  assert.match(R.reportText(R.weeklyReport(t, '2026-11-02', '2026-11-03')), /Foco de esta semana: Gastar como mucho RD\$5,000 en la semana — vas bien/);
  // Quitar el foco.
  R.setFocus(t, '2026-10-26', null, '2026-11-01');
  assert.equal(t.reports.focus['2026-11-02'], undefined);
  assert.equal(R.setFocus(t, '2026-10-26', { key: 'inventado', target: 1 }, D), null);
});

test('foco: el logro «Semana a semana» llega con 3 focos cumplidos', () => {
  const s = withWeeks();
  for (const wk of ['2026-10-12', '2026-10-19', '2026-10-26']) {
    R.setFocus(s, addDays(wk, -7), { key: 'active_min', target: 150 }, wk);
    assert.equal(R.claimFocus(s, wk, D), true, wk);
  }
  L.checkAchievements(s, D, []);
  assert.ok(s.achievements.foco3);
});

test('informe: el aviso sale el domingo desde las 6 p. m. y hasta el miércoles, si no lo has abierto', () => {
  const s = withWeeks();
  assert.equal(R.reportDue(s, D, 17), null);
  assert.equal(R.reportDue(s, D, 19), '2026-11-02');
  assert.equal(R.reportDue(s, '2026-11-10', 9), '2026-11-02');
  assert.equal(R.reportDue(s, '2026-11-12', 9), null, 'jueves: ya no');
  R.markSeen(s, '2026-11-02', D);
  assert.equal(R.reportDue(s, '2026-11-10', 9), null);
  const nuevo = fresh();
  nuevo.profile.created = '2026-11-07';
  assert.equal(R.reportDue(nuevo, D, 19), null, 'una cuenta de ayer no tiene semana que contar');
});

test('informe: notificación el domingo en la noche, no antes de las 6 p. m. y solo si no lo has visto', () => {
  const s = withWeeks();
  s.settings.notify.on = true;
  s.settings.notify.evening = '17:00';
  const list = RM.buildReminders(s, new Date(RM.atOf(D, '09:00')), D).filter((r) => r.kind === 'informe');
  assert.equal(list.length, 1);
  assert.equal(list[0].at, RM.atOf(D, '18:00'));
  assert.equal(list[0].url, '#/informe');
  R.markSeen(s, '2026-11-02', D);
  assert.equal(RM.buildReminders(s, new Date(RM.atOf(D, '09:00')), D).filter((r) => r.kind === 'informe').length, 0);
  assert.ok(RM.NOTIFY_KINDS.some((k) => k.key === 'informe'));
  assert.equal(L.defaultState(D).settings.notify.kinds.informe, true);
});

// ---------- Drive, sincronización y datos viejos ----------

test('tablas: Salud trae preparación, cómo amaneciste, carga, señales y hábitos', () => {
  const s = fresh();
  L.logHealth(s, D, { sleep: 7, exercise: 30, exType: 'caminar', rpe: 4 }, D, []);
  V.logReady(s, D, { e: 4, c: 4, s: 4, a: 4, rhr: 58, hrv: 61 }, D);
  V.addBP(s, D, { sys: 118, dia: 76, time: '07:00' }, D);
  V.logWeight(s, D, 150, 'lb');
  V.setHabits(s, D, ['sol', 'lectura']);
  const t = buildTables(s, D).Salud;
  const head = t[0];
  const row = t.find((r) => r[0] === D);
  const col = (name) => row[head.indexOf(name)];
  for (const h of ['Preparación', 'Cómo amaneciste', 'Carga', 'Pulso en reposo', 'VFC (ms)', 'Presión', 'Peso (kg)', 'Hábitos']) assert.ok(head.includes(h), h);
  assert.equal(col('Carga'), 120);
  assert.equal(col('Pulso en reposo'), 58);
  assert.match(String(col('Presión')), /^118\/76/);
  assert.equal(col('Peso (kg)'), 68);
  assert.match(String(col('Hábitos')), /Sol en la mañana/);
  assert.ok(Number(col('Preparación')) >= 67);
});

test('sincronizar: la carga se suma como contador y los análisis y las tomas de presión se unen por id', () => {
  const base = fresh();
  L.logHealth(base, D, { exercise: 20, exType: 'caminar', rpe: 3 }, D, []);
  const a = clone(base); const b = clone(base);
  L.logHealth(a, D, { exercise: 50, exType: 'caminar', rpe: 3 }, D, []); // +90
  L.logHealth(b, D, { exercise: 40, exType: 'gimnasio', rpe: 5 }, D, []); // +100
  const items = LB.parseLabText(REPORT, D).items;
  LB.addLabPanel(a, { day: '2026-11-03', items, source: 'pdf' }, D);
  LB.addLabPanel(b, { day: '2026-10-01', items: items.slice(0, 2), source: 'foto' }, D);
  V.addBP(a, D, { sys: 120, dia: 80, time: '07:00' }, D);
  V.addBP(b, D, { sys: 122, dia: 79, time: '20:00' }, D);
  V.setHabits(a, D, ['sol']);
  const m = mergeStates(base, a, b);
  assert.equal(m.health[D].load, 60 + 90 + 100);
  assert.equal(m.labs.length, 2);
  assert.equal(m.health[D].bp.length, 2);
  assert.equal(m.health[D].habits.sol, 1);
});

test('datos de antes de la 1.17: se abren con análisis, señales e informes vacíos', () => {
  const s = fresh();
  delete s.labs; delete s.vitals; delete s.reports;
  s.health[D] = { sleep: 7, exercise: 30 };
  const m = migrate(clone(s));
  assert.deepEqual(m.labs, []);
  assert.deepEqual(m.vitals, { wunit: 'lb', bpWeek: null, sex: '' });
  assert.deepEqual(m.reports, { seen: {}, focus: {}, claimed: {} });
  assert.equal(V.dayLoad(m.health[D]), 90, 'la carga de antes se estima');
  assert.ok(R.weeklyReport(m, '2026-11-02', D));
});

test('logro «Me escucho»: 14 mañanas anotadas', () => {
  const s = fresh();
  for (let i = 0; i < 14; i++) V.logReady(s, addDays(D, -i), { e: 3, c: 3, s: 3, a: 3 }, D);
  L.checkAchievements(s, D, []);
  assert.ok(s.achievements.manana14);
});
