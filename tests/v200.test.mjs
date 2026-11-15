// 2.0 «Renacer», parte 1: copiloto, gemelo digital, alertas tempranas y tablero Lean.
// Todo se calcula con lo que ya estaba registrado: la versión de datos sigue en 4 y nada cambia de forma.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/game/logic.js';
import * as M from '../src/game/money.js';
import * as T from '../src/game/twin.js';
import * as C from '../src/game/copilot.js';
import * as Ln from '../src/game/lean.js';
import { ensurePlus, plusOf, defaultPlus, tidyPlus } from '../src/game/plus.js';
import { addMed } from '../src/game/health.js';
import { mergeStates } from '../src/game/merge.js';
import { migrate } from '../src/app/store.js';
import { addDays } from '../src/app/dates.js';
import { simulate } from './helpers/sim.mjs';

const D = '2026-11-15'; // domingo
const clone = (x) => JSON.parse(JSON.stringify(x));
const good = simulate({ end: D, profile: 'constante' });
const bad = simulate({ end: D, profile: 'apurada' });
function fresh(day = D) {
  const s = L.defaultState(addDays(day, -30));
  s.profile.onboarded = true;
  s.profile.name = 'Ana Prueba';
  L.reconcile(s, day);
  return s;
}

// ---------- Los datos de antes no se tocan ----------

test('una copia de la 1.18 abre igual: se agrega `plus` y nada más cambia', () => {
  const old = migrate(clone(good)); // como la dejó la 1.18
  delete old.plus;
  const before = clone(old);
  const m = migrate(clone(old));
  assert.equal(m.v, 4);
  assert.deepEqual(m.plus, defaultPlus());
  for (const k of Object.keys(before)) {
    if (k === 'plus') continue;
    assert.deepEqual(m[k], before[k], `cambió «${k}»`);
  }
});

test('`plus` dañado se repara sin perder lo que sí sirve', () => {
  const s = fresh();
  s.plus = { snooze: 'x', kaizen: [{ id: 'k1', key: 'espera', state: 'run' }, null, 5], tags: 'no', sim: { sleepMin: '30', spendPct: 'abc' }, cfg: { freeWeek: 90 } };
  const p = ensurePlus(s);
  assert.deepEqual(p.snooze, {});
  assert.equal(p.kaizen.length, 1);
  assert.deepEqual(p.tags, []);
  assert.equal(p.sim.sleepMin, 30);
  assert.equal(p.sim.spendPct, 0);
  assert.equal(p.cfg.freeWeek, 90);
  assert.equal(p.cfg.freeWeekend, 240);
});

test('leer `plus` de un estado viejo no lo modifica', () => {
  const s = fresh();
  delete s.plus;
  const p = plusOf(s);
  assert.deepEqual(p, defaultPlus());
  assert.equal(s.plus, undefined);
});

test('lo pospuesto de días anteriores se limpia', () => {
  const s = fresh();
  ensurePlus(s).snooze = { a: addDays(D, -1), b: D, c: addDays(D, 3) };
  tidyPlus(s, D);
  assert.deepEqual(Object.keys(s.plus.snooze).sort(), ['b', 'c']);
});

// ---------- Gemelo ----------

test('gemelo: siete sistemas entre 0 y 100, con sus partes', () => {
  for (const s of [good, bad]) {
    const list = T.systems(s, D);
    assert.equal(list.length, 7);
    for (const x of list) {
      assert.ok(x.score == null || (x.score >= 0 && x.score <= 100), `${x.key} ${x.score}`);
      for (const p of x.parts) assert.ok(p.score >= 0 && p.score <= 100 && p.text && p.w > 0);
    }
  }
});

test('gemelo: la persona constante sale mejor que la apurada, y la restricción es su sistema más bajo', () => {
  const a = T.lifeIndex(T.systems(good, D));
  const b = T.lifeIndex(T.systems(bad, D));
  assert.ok(a.score > b.score + 10, `${a.score} vs ${b.score}`);
  assert.equal(a.zone, 'verde');
  assert.ok(b.constraint);
  const min = Math.min(...T.systems(bad, D).filter((x) => x.score != null).map((x) => x.score));
  assert.equal(b.constraint.score, min);
  assert.equal(b.constraint.key, 'cuerpo');
});

test('gemelo: sin datos no inventa números', () => {
  const s = fresh();
  const list = T.systems(s, D);
  assert.ok(list.every((x) => x.score == null));
  const idx = T.lifeIndex(list);
  assert.equal(idx.score, null);
  assert.equal(idx.constraint, null);
  assert.equal(T.cashOutlook(s, D), null);
  assert.deepEqual(T.risks(s, D), []);
});

function tight() {
  // Poco en la cuenta, un pago grande en 5 días y el cobro después.
  const s = fresh();
  const bank = L.addAccount(s, { name: 'Banco', kind: 'cuenta' });
  M.setAccountBalance(s, bank.id, { DOP: 9000 }, addDays(D, -29));
  M.addPlan(s, { kind: 'gasto', name: 'Alquiler', amount: 15000, cat: 'vivienda', account: bank.id, freq: { type: 'once', date: addDays(D, 5) } }, D);
  M.addPlan(s, { kind: 'ingreso', name: 'Salario', amount: 40000, cat: 'salario', account: bank.id, freq: { type: 'once', date: addDays(D, 12) } }, D);
  return { s, bank };
}

test('pronóstico de caja: resta tu gasto del día a día y encuentra el día en que no alcanza', () => {
  const { s, bank } = tight();
  for (let i = 1; i <= 20; i++) L.addTx(s, { type: 'gasto', amount: 400, cat: 'comida', merchant: 'Comedor', account: bank.id, day: addDays(D, -i) }, D, []);
  const ds = T.dailySpend(s, D);
  assert.ok(ds.mean > 250 && ds.mean < 450, String(ds.mean));
  const co = T.cashOutlook(s, D);
  assert.equal(co.start, 1000);
  assert.ok(co.zero, 'debía detectar el día en negativo');
  assert.ok(co.zero.day <= addDays(D, 5));
  assert.equal(co.nextIncome, addDays(D, 12));
  assert.ok(co.points[0].bal === 1000 && co.end > 0);
  // Gastar menos mueve el punto más bajo hacia arriba.
  const alt = T.cashOutlook(s, D, 45, { spendPct: 30 });
  assert.ok(alt.min.bal > co.min.bal);
});

test('alertas tempranas: la caja en negativo sale primero y dice en cuántos días', () => {
  const { s, bank } = tight();
  for (let i = 1; i <= 20; i++) L.addTx(s, { type: 'gasto', amount: 400, cat: 'comida', merchant: 'Comedor', account: bank.id, day: addDays(D, -i) }, D, []);
  const rk = T.risks(s, D);
  assert.equal(rk[0].sys, 'dinero');
  assert.equal(rk[0].level, 'alta');
  assert.ok(rk[0].days <= 5 && rk[0].action.href.startsWith('/finanzas'));
  // «Ya lo sé»: no vuelve a salir esta semana.
  C.snooze(s, `r:${rk[0].id}`, D, addDays(D, 6));
  assert.ok(!T.risks(s, D).some((r) => r.id === rk[0].id));
});

test('alertas tempranas: agotamiento cuando se juntan varias señales; la racha en riesgo solo por la tarde', () => {
  const rk = T.risks(bad, D, { hour: 16 });
  assert.ok(rk.some((r) => r.id === 'agotamiento'));
  assert.ok(rk.some((r) => r.id === 'ritmo'));
  assert.ok(!T.risks(good, D, { hour: 16 }).some((r) => r.id === 'agotamiento'));
  const s = fresh();
  s.streak = { count: 12, best: 12, lastDay: addDays(D, -1), freezes: 0, freezeDays: [] };
  assert.ok(!T.risks(s, D, { hour: 9 }).some((r) => r.id === 'racha'));
  const eve = T.risks(s, D, { hour: 21 }).find((r) => r.id === 'racha');
  assert.equal(eve.level, 'alta');
  s.streak.freezes = 1;
  assert.ok(!T.risks(s, D, { hour: 21 }).some((r) => r.id === 'racha'));
});

test('¿qué pasa si…?: cada palanca da su efecto y sin palancas no dice nada', () => {
  assert.deepEqual(T.whatIf(bad, D, {}), []);
  const fx = T.whatIf(bad, D, { sleepMin: 45, spendPct: 15, moveDays: 2, saveMonthly: 5000 });
  const keys = fx.map((e) => e.key);
  for (const k of ['descanso', 'gasto', 'caja', 'movimiento', 'ahorro']) assert.ok(keys.includes(k), k);
  const g = fx.find((e) => e.key === 'gasto');
  assert.match(g.text, /al año/);
  const s = clone(bad);
  T.setLever(s, 'sleepMin', 37);
  assert.equal(s.plus.sim.sleepMin, 30);
  T.setLever(s, 'spendPct', 500);
  assert.equal(s.plus.sim.spendPct, 30);
  assert.equal(T.setLever(s, 'otra', 5), null);
});

test('pronósticos de nivel y vitalidad', () => {
  const lo = T.levelOutlook(good, D);
  assert.ok(lo.perDay > 0 && lo.days > 0 && lo.date > D);
  const s = fresh();
  for (let i = 7; i >= 1; i--) L.getDay(s, addDays(D, -i)).vitEnd = 30 + i * 6;
  s.vit = 28;
  const vo = T.vitOutlook(s, D);
  assert.ok(vo.slope < -3, String(vo.slope));
  assert.ok(vo.days >= 3 && vo.days <= 7, String(vo.days));
  assert.ok(T.risks(s, D).some((r) => r.id === 'vitalidad'));
});

// ---------- Lean ----------

test('OEE: tres factores entre 0 y 1 y su producto', () => {
  for (const s of [good, bad]) {
    const w = Ln.oee(s, addDays(D, -13), addDays(D, -7));
    for (const k of ['a', 'p', 'q']) assert.ok(w[k] >= 0 && w[k] <= 1, `${k} ${w[k]}`);
    assert.ok(Math.abs(w.oee - w.a * w.p * w.q) < 1e-9);
    assert.ok(['a', 'p', 'q'].includes(w.loss));
  }
  const a = Ln.oeeTrend(good, D);
  const b = Ln.oeeTrend(bad, D);
  assert.equal(a.weeks.length, 8);
  assert.ok(a.avg > b.avg + 0.2, `${a.avg} vs ${b.avg}`);
  assert.equal(a.weeks[7].current, true);
});

test('OEE: sin datos suficientes no da un número', () => {
  const s = fresh();
  const w = Ln.oee(s, addDays(D, -6), D);
  assert.equal(w.oee, null);
  assert.equal(w.a, null);
});

test('muda: ocho desperdicios; la persona apurada tiene defectos, espera y capacidad perdida', () => {
  const a = Ln.muda(good, D);
  const b = Ln.muda(bad, D);
  assert.equal(a.length, 8);
  assert.ok(a.every((m) => m.level <= 1), JSON.stringify(a.map((m) => [m.key, m.level])));
  const lv = Object.fromEntries(b.map((m) => [m.key, m.level]));
  assert.ok(lv.defectos >= 2 && lv.energia >= 2 && lv.espera >= 1, JSON.stringify(lv));
  assert.ok(b[0].level >= b[7].level);
});

test('muda: pendientes viejos sin fecha son inventario; comisiones, sobreproceso', () => {
  const s = fresh();
  for (let i = 0; i < 6; i++) { const t = L.addTodo(s, { title: `Viejo ${i}` }, addDays(D, -29)); t.created = addDays(D, -45); }
  const bank = L.addAccount(s, { name: 'Banco', kind: 'cuenta' });
  L.addTx(s, { type: 'gasto', amount: 1500, cat: 'comisiones', merchant: 'Comisión', account: bank.id, day: addDays(D, -3) }, D, []);
  const m = Object.fromEntries(Ln.muda(s, D).map((x) => [x.key, x]));
  assert.equal(m.inventario.value, 6);
  assert.equal(m.inventario.level, 2);
  assert.equal(m.sobreproceso.value, 1500);
  assert.equal(m.sobreproceso.cost, 1500);
});

test('kaizen: línea base, siete días, se compara y premia si mejoró', () => {
  const s = fresh();
  for (let i = 0; i < 4; i++) L.addTodo(s, { title: `Atrasado ${i}`, due: addDays(D, -9) }, addDays(D, -12));
  const k = Ln.startKaizen(s, 'espera', D);
  assert.equal(k.base, 4);
  assert.equal(k.end, addDays(D, 6));
  assert.equal(Ln.startKaizen(s, 'energia', D), null, 'una mejora a la vez');
  assert.equal(Ln.kaizenRunning(s).id, k.id);
  // Durante la semana cierra tres.
  for (const t of L.pendingTodos(s).slice(0, 3)) L.completeTodo(s, t.id, addDays(D, 2), []);
  assert.equal(Ln.kaizenProgress(s, k, addDays(D, 3)).now, 1);
  assert.deepEqual(Ln.checkKaizen(s, addDays(D, 6), []), [], 'todavía no termina');
  const xp = s.xp; const ev = [];
  const out = Ln.checkKaizen(s, addDays(D, 7), ev);
  assert.equal(out[0].state, 'ok');
  assert.equal(out[0].after, 1);
  assert.ok(s.xp > xp);
  assert.ok(ev.some((e) => e.type === 'kaizen'));
  assert.equal(Ln.kaizenRunning(s), null);
  assert.deepEqual(Ln.kaizenHistory(s).ok, 1);
});

test('kaizen: si no mejora, queda anotado sin premio', () => {
  const s = fresh();
  for (let i = 0; i < 3; i++) L.addTodo(s, { title: `Atrasado ${i}`, due: addDays(D, -9) }, addDays(D, -12));
  Ln.startKaizen(s, 'espera', D);
  const xp = s.xp;
  const out = Ln.checkKaizen(s, addDays(D, 8), []);
  assert.equal(out[0].state, 'no');
  assert.equal(s.xp, xp);
});

// ---------- Copiloto ----------

test('copiloto: un pago vencido va antes que una misión; cada paso dice por qué', () => {
  const list = C.candidates(bad, D, { hour: 10 });
  assert.ok(list.length >= 5);
  for (const c of list) assert.ok(c.id && c.title && c.why && c.icon && Number.isFinite(c.score), JSON.stringify(c));
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].score >= list[i].score);
  const pay = list.findIndex((c) => c.kind === 'pay');
  const mis = list.findIndex((c) => c.kind === 'mission');
  assert.ok(pay >= 0 && mis >= 0 && pay < mis);
  assert.equal(new Set(list.map((c) => c.id)).size, list.length, 'sin pasos repetidos');
});

test('copiloto: en la mañana pide el sueño; de noche, la posada y la hora de dormir', () => {
  const s = fresh();
  s.profile.wakeGoal = '06:30';
  const am = C.nextUp(s, D, { hour: 8 });
  assert.equal(am.next.kind, 'sleep');
  assert.deepEqual(am.next.do, { type: 'sleep' });
  L.logHealth(s, D, { sleep: 7.5 }, D, []);
  assert.equal(C.nextUp(s, D, { hour: 8 }).next.kind, 'ready');
  assert.ok(!C.candidates(s, D, { hour: 21, minute: 0 }).some((c) => c.kind === 'bed'), 'aún es temprano');
  const pm = C.candidates(s, D, { hour: 23, minute: 0 });
  assert.equal(pm[0].kind, 'bed');
  assert.equal(pm[1].kind, 'inn');
  assert.doesNotMatch(pm[0].why, /\.\.$/);
});

test('copiloto: la toma que ya toca sale arriba y se puede marcar con un toque', () => {
  const s = fresh();
  L.logHealth(s, D, { sleep: 7.5 }, D, []);
  addMed(s, { name: 'Vitamina D', kind: 'suplemento', times: ['08:00'] }, D);
  const before = C.candidates(s, D, { hour: 7, minute: 0 });
  assert.ok(!before.some((c) => c.kind === 'dose'), 'falta más de media hora');
  const c = C.candidates(s, D, { hour: 8, minute: 10 })[0];
  assert.equal(c.kind, 'dose');
  assert.equal(c.do.type, 'dose');
});

test('copiloto: sin energía, la misión cara baja; «ahora no» la esconde por hoy', () => {
  const s = fresh();
  L.logHealth(s, D, { sleep: 7.5 }, D, []);
  const m = L.addMission(s, { title: 'Entrenar fuerte', area: 'salud', cost: 3, kind: 'habit' }, D);
  const full = C.candidates(s, D, { hour: 14 }).find((c) => c.id === `mision:${m.id}`);
  s.energy.used = s.energy.max;
  const empty = C.candidates(s, D, { hour: 14 }).find((c) => c.id === `mision:${m.id}`);
  assert.ok(empty.score < full.score);
  assert.match(empty.why, /energía/);
  C.snooze(s, empty.id, D);
  assert.ok(!C.candidates(s, D, { hour: 14 }).some((c) => c.id === empty.id));
  assert.ok(C.candidates(s, addDays(D, 1), { hour: 14 }).some((c) => c.id === empty.id), 'mañana vuelve');
  C.unsnooze(s, empty.id);
  assert.ok(C.candidates(s, D, { hour: 14 }).some((c) => c.id === empty.id));
});

test('plan del día: horas en orden, termina en la posada y la hora de dormir; lo que no cabe queda fuera', () => {
  const pl = C.dayPlan(bad, D, { hour: 9 });
  const mins = pl.blocks.map((b) => L.timeToMin(b.at));
  for (let i = 1; i < mins.length; i++) assert.ok(mins[i] >= mins[i - 1], `${pl.blocks[i - 1].at} → ${pl.blocks[i].at}`);
  assert.equal(pl.blocks[pl.blocks.length - 1].item.kind, 'bed');
  assert.equal(pl.blocks[pl.blocks.length - 2].item.kind, 'inn');
  assert.ok(pl.used <= pl.cap || pl.blocks.some((b) => b.item.score >= 76));
  // Con poco tiempo libre, lo que no es urgente queda para después.
  const s = clone(bad);
  C.setFree(s, { week: 30, weekend: 30 });
  const small = C.dayPlan(s, D, { hour: 9 });
  assert.ok(small.over && small.later.length > 0);
  assert.ok(small.later.every((c) => c.score < 76));
  assert.ok(small.blocks.length < pl.blocks.length);
});

test('nivelar la semana: mueve lo que no es importante a un día con espacio', () => {
  const s = fresh();
  C.setFree(s, { week: 60, weekend: 60 });
  const day = addDays(D, 1);
  const ids = [];
  for (let i = 0; i < 6; i++) ids.push(L.addTodo(s, { title: `Tarea ${i}`, due: day, important: i === 0 }, D).id);
  const lw = C.levelWeek(s, D);
  assert.ok(lw.before[1].over);
  assert.ok(lw.moves.length >= 2);
  assert.ok(lw.moves.every((m) => m.id !== ids[0]), 'lo importante no se mueve');
  assert.ok(lw.moves.every((m) => m.to > day));
  assert.ok(lw.after.every((d) => !d.over));
  const n = C.applyLevel(s, lw.moves);
  assert.equal(n, lw.moves.length);
  assert.equal(C.levelWeek(s, D).moves.length, 0);
  assert.equal(s.todos.find((t) => t.id === ids[0]).due, day);
});

// ---------- Sincronización ----------

test('sincronizar: los kaizen y lo pospuesto de dos equipos se juntan', () => {
  const base = fresh();
  for (let i = 0; i < 3; i++) L.addTodo(base, { title: `Atrasado ${i}`, due: addDays(D, -9) }, addDays(D, -12));
  const a = clone(base); const b = clone(base);
  Ln.startKaizen(a, 'espera', D);
  C.snooze(b, 'agua', D);
  T.setLever(b, 'sleepMin', 30);
  const m = mergeStates(base, a, b);
  assert.equal(m.plus.kaizen.length, 1);
  assert.equal(m.plus.snooze.agua, D);
  assert.equal(m.plus.sim.sleepMin, 30);
  assert.equal(m.v, 4);
});

test('rapidez: el centro de mando completo en menos de 150 ms con 90 días de datos', () => {
  T.twinSummary(bad, D); C.dayPlan(bad, D, { hour: 9 }); Ln.oeeTrend(bad, D); // calentar
  const t0 = performance.now();
  T.twinSummary(bad, D, { hour: 10 });
  C.dayPlan(bad, D, { hour: 10 });
  C.levelWeek(bad, D);
  Ln.oeeTrend(bad, D);
  Ln.muda(bad, D);
  const ms = performance.now() - t0;
  assert.ok(ms < 150, `${Math.round(ms)} ms`);
});
