import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/game/logic.js';
import * as N from '../src/game/nutrients.js';
import * as F from '../src/game/food.js';
import * as R from '../src/game/routines.js';
import { addMed } from '../src/game/health.js';
import { buildReminders } from '../src/game/reminders.js';
import { buildTables } from '../src/game/tables.js';
import { mergeStates } from '../src/game/merge.js';
import { addDays } from '../src/app/dates.js';

const D = '2026-10-26'; // lunes
function fresh() {
  const s = L.defaultState(D);
  s.profile.onboarded = true;
  return s;
}
const med = (s, name, dose, times, extra = {}) => addMed(s, { name, dose, times, kind: 'suplemento', ...extra }, D);

test('reconoce nutrientes y medicinas por el nombre', () => {
  assert.equal(N.nutrientOf('Vitamina D3 1000 UI').key, 'vitd');
  assert.equal(N.nutrientOf('Sulfato ferroso').key, 'hierro');
  assert.equal(N.nutrientOf('Citrato de magnesio').key, 'magnesio');
  assert.equal(N.nutrientOf('Ácido fólico').key, 'folato');
  assert.equal(N.nutrientOf('Omega 3').key, 'omega3');
  assert.equal(N.nutrientOf('Centrum').key, 'multi');
  assert.equal(N.nutrientOf('Losartán'), null);
  assert.equal(N.drugOf('Eutirox 50').key, 'levo');
  assert.equal(N.drugOf('Losartán 50 mg').key, 'k');
  // Todos los nutrientes tienen momento, texto y unidades coherentes.
  for (const n of N.NUTRIENTS) {
    assert.ok(N.SLOT[n.slot], n.key);
    assert.ok(n.what && n.with && n.period, n.key);
    for (const [k] of n.gap) assert.ok(k === '*' || N.NUTRIENT[k], `${n.key} → ${k}`);
  }
  for (const r of N.DRUG_RULES) for (const k of r.with) assert.ok(N.NUTRIENT[k], `${r.key} → ${k}`);
});

test('dosis: UI de vitamina D a mcg, mg y g, y sales que no se comparan', () => {
  assert.equal(N.parseDose('1,000 UI', N.NUTRIENT.vitd).value, 25);
  assert.equal(N.parseDose('50 mg', N.NUTRIENT.zinc).value, 50);
  assert.equal(N.parseDose('1 g', N.NUTRIENT.omega3).value, 1);
  assert.equal(N.parseDose('1000 mg', N.NUTRIENT.omega3).value, 1);
  assert.equal(N.parseDose('5000 UI', N.NUTRIENT.vita), null); // las UI de A dependen de la forma
  assert.ok(N.saltOnly({ name: 'Sulfato ferroso', dose: '300 mg' }, N.NUTRIENT.hierro));
  assert.ok(!N.saltOnly({ name: 'Hierro', dose: '65 mg elemental' }, N.NUTRIENT.hierro));
});

test('horarios: salen de tus comidas', () => {
  const s = fresh();
  assert.equal(N.slotTime(s, 'ayunas'), '07:00');
  assert.equal(N.slotTime(s, 'noche'), '22:00');
  N.setMealTimes(s, { desayuno: '06:30', dormir: '23:00' });
  assert.equal(N.suggestTimes(s, N.NUTRIENT.hierro)[0], '06:00');
  assert.equal(N.suggestTimes(s, N.NUTRIENT.magnesio)[0], '22:30');
  assert.equal(N.suggestTimes(s, N.NUTRIENT.vitd)[0], '12:30');
  assert.equal(N.slotOf(s, '10:00'), 'entre');
});

test('plan: choques entre suplementos y propuesta que los resuelve', () => {
  const s = fresh();
  med(s, 'Hierro', '65 mg elemental', ['08:00']);
  med(s, 'Calcio', '500 mg', ['08:00']);
  med(s, 'Vitamina D', '1000 UI', ['12:30']);
  const p = N.supplementPlan(s);
  assert.ok(p.warn.some((w) => /Hierro y Calcio/.test(w.text)));
  assert.ok(Object.keys(p.fix).length >= 1);
  N.applyPlanTimes(s, p.fix);
  const p2 = N.supplementPlan(s);
  assert.ok(!p2.warn.some((w) => w.icon === 'clock'), 'ya no choca');
  assert.deepEqual(Object.keys(p2.fix), []);
});

test('plan: levotiroxina, fibra, límites y dosis grandes', () => {
  const s = fresh();
  addMed(s, { name: 'Eutirox', dose: '50 mcg', times: ['06:30'], kind: 'medicina' }, D);
  med(s, 'Calcio', '600 mg', ['08:00']);
  med(s, 'Psilio', '', ['08:00']);
  med(s, 'Vitamina D3', '50,000 UI', ['08:00'], { days: [0] });
  const p = N.supplementPlan(s);
  const txt = p.warn.map((w) => w.text).join('\n');
  assert.match(txt, /levotiroxina/);
  assert.equal(p.warn[0].level, 3, 'lo de la medicina va primero');
  assert.match(txt, /Psilio está a menos de 2 horas/);
  assert.match(txt, /7,143 UI/); // 50,000 UI a la semana ≈ 7,143 al día
  assert.match(txt, /500 mg o menos por toma/);
  N.applyPlanTimes(s, p.fix);
  const after = N.supplementPlan(s);
  assert.ok(!after.warn.some((w) => w.level === 3), 'sin choque con la levotiroxina tras acomodar');
  assert.equal(s.meds.find((m) => m.name === 'Eutirox').times[0], '06:30', 'la medicina no se mueve');
});

test('línea del día agrupada por hora', () => {
  const s = fresh();
  med(s, 'Magnesio', '200 mg', ['22:00']);
  med(s, 'Omega 3', '1 g', ['12:30']);
  med(s, 'Vitamina D', '1000 UI', ['12:30']);
  const t = N.planTimeline(s);
  assert.deepEqual(t.map((x) => x.time), ['12:30', '22:00']);
  assert.equal(t[0].list.length, 2);
  assert.equal(t[1].slot, 'noche');
});

test('tu plato: XP, tope y semana', () => {
  const s = fresh();
  const xp0 = s.xp;
  F.logMeal(s, D, 'des', { veg: true, prot: true }, D);
  assert.ok(s.xp > xp0);
  const xp1 = s.xp;
  F.logMeal(s, D, 'des', { veg: true, prot: true, integ: true }, D);
  assert.equal(s.xp, xp1, 'la misma comida no da XP dos veces');
  F.logMeal(s, D, 'alm', { veg: true, prot: true, integ: true }, D);
  F.logMeal(s, D, 'cen', { prot: true, integ: true, frito: true }, D);
  const xp2 = s.xp;
  F.logMeal(s, D, 'mer', { veg: true, integ: true }, D);
  assert.equal(s.xp, xp2, 'máximo 3 comidas con XP al día');
  const w = F.foodWeek(s, D);
  assert.equal(w.meals, 4);
  assert.equal(w.full, 2);
  assert.equal(w.count.frito, 1);
  F.logMeal(s, D, 'mer', {}, D);
  assert.equal(Object.keys(s.health[D].food).length, 3, 'vacía = se quita');
  s.health[D].food.zzz = { veg: true };
  s.health[D].food.des.raro = true;
  F.ensureFood(s);
  assert.ok(!s.health[D].food.zzz && !s.health[D].food.des.raro);
});

test('rutinas: fuerza suma minutos, día de fuerza y XP; la pausa activa va aparte', () => {
  const s = fresh();
  const r = R.ROUTINE.fuerza20;
  assert.ok(R.routineMinutes(r) >= 18 && R.routineMinutes(r) <= 26);
  R.finishRoutine(s, 'fuerza20', R.routineSeconds(r), D);
  assert.equal(s.health[D].strength, true);
  assert.equal(s.health[D].exTypes.fuerza, R.routineMinutes(r));
  const ex = s.health[D].exercise;
  R.finishRoutine(s, 'pausa', 300, D);
  assert.equal(s.health[D].exercise, ex, 'la pausa no cuenta como ejercicio moderado');
  assert.equal(s.health[D].breaks, 1);
});

test('plan de la semana: lo hecho y lo que toca hoy', () => {
  const s = fresh();
  R.setExPlan(s, { 1: 'fuerza', 3: 'cardio', 9: 'fuerza', 5: 'nada' });
  assert.deepEqual(R.exPlan(s), { 1: 'fuerza', 3: 'cardio' });
  let w = R.planWeek(s, D);
  assert.equal(w.todayKind, 'fuerza');
  assert.equal(w.todayDone, false);
  R.finishRoutine(s, 'fuerza10', R.routineSeconds(R.ROUTINE.fuerza10), D);
  w = R.planWeek(s, D);
  assert.equal(w.todayDone, true);
  assert.equal(w.planned, 2);
  assert.equal(w.done, 1);
});

test('avisos: plan de movimiento y pausas activas', () => {
  const s = fresh();
  s.settings.notify.on = true;
  s.settings.notify.kinds.pausas = true;
  R.setExPlan(s, { 1: 'fuerza' });
  const list = buildReminders(s, new Date(2026, 9, 26, 9, 0), D);
  assert.ok(list.some((x) => x.kind === 'ejercicio' && /fuerza/.test(x.title)));
  assert.equal(list.filter((x) => x.kind === 'pausas' && x.day === D).length, 2);
});

test('Drive, fusión e insignias', () => {
  const s = fresh();
  med(s, 'Vitamina D', '1000 UI', ['12:30']);
  F.logMeal(s, D, 'alm', { veg: true, prot: true, integ: true }, D);
  const t = buildTables(s, D);
  assert.ok(t.Medicinas[1].includes('Vitamina D'));
  const sal = t.Salud;
  const i = sal[0].indexOf('Platos completos');
  assert.ok(i > 0);
  assert.ok(sal.slice(1).some((r) => Number(r[i]) === 1));
  // Pausas: contador que se suma entre equipos.
  s.health[D].breaks = 0;
  const base = JSON.parse(JSON.stringify(s));
  const a = JSON.parse(JSON.stringify(s)); const b = JSON.parse(JSON.stringify(s));
  a.health[D].breaks = 1; b.health[D].breaks = 2;
  assert.equal(mergeStates(base, a, b).health[D].breaks, 3);
  // Insignias.
  for (let i2 = 0; i2 < 8; i2++) { const d = addDays(D, -i2); s.health[d] = { ...(s.health[d] || {}), strength: true }; }
  L.checkAchievements(s, D, []);
  assert.ok(s.achievements.fuerza8);
});
