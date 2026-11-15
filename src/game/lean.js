// Tablero Lean (2.0): las herramientas con las que una planta mejora todos los días, aplicadas a tu semana.
//
// - OEE personal: Disponibilidad × Rendimiento × Calidad.
//     Disponibilidad: la energía con la que contaste (según lo que dormiste) frente a la de una noche completa.
//     Rendimiento:    lo que hiciste frente a lo que tenías planeado (misiones y pendientes con fecha).
//     Calidad:        lo que salió bien a la primera (a tiempo, sin omitir, sin caídas).
//   En una fábrica 85 % es «clase mundial». Aquí la comparación útil es contigo: tu promedio de 8 semanas.
// - Muda: los ocho desperdicios, medidos con tus datos, cada uno con su contramedida.
// - Kaizen: una mejora pequeña por semana (PDCA): se mide una línea base, pasan 7 días y se compara.
//
// Todo es puro y de solo lectura, menos el Kaizen, que guarda sus experimentos en `s.plus.kaizen`.
import { addDays, diffDays, weekday } from '../app/dates.js';
import { AREA, AREA_KEYS } from './content.js';
import { isScheduled, doneCount, energyMaxFromSleep, fmtHours, gainXP, addGold, uid, txKind, txDOP, inStats } from './logic.js';
import { dosesFor } from './health.js';
import { shopOf } from './shop.js';
import { ensurePlus, plusOf } from './plus.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const rd = (v) => `RD$${Math.round(v).toLocaleString('en-US')}`;
const H = (s, d) => (s.health && s.health[d]) || {};
const range = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
const cuantos = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const safe = (fn, fb = null) => { try { return fn(); } catch { return fb; } };
const weekOf = (day) => addDays(day, -((weekday(day) + 6) % 7)); // lunes

// ---------- OEE ----------

export function oee(s, from, to) {
  const days = range(from, to);
  const goal = Number(s.profile.sleepGoal) || 7;
  const full = energyMaxFromSleep(goal, goal) || 1;
  // Disponibilidad.
  const nights = days.map((d) => H(s, d).sleep).filter((v) => v != null);
  const a = nights.length >= 3 ? clamp(mean(nights.map((v) => energyMaxFromSleep(v, goal))) / full, 0, 1) : null;
  // Rendimiento.
  let mDone = 0; let mPlan = 0;
  for (const d of days) {
    const x = s.days && s.days[d];
    const n = doneCount(x);
    const habits = (s.missions || []).filter((m) => m.kind === 'habit' && !m.archived && m.created <= d && isScheduled(m, d)).length;
    const once = (s.missions || []).filter((m) => m.kind === 'once' && m.doneOn === d).length;
    mDone += n; mPlan += Math.max(habits + once, n);
  }
  const inW = (d) => d && d >= from && d <= to;
  const todos = s.todos || [];
  const tDone = todos.filter((t) => inW(t.done)).length;
  const tOpen = todos.filter((t) => !t.done && t.due && t.due <= to).length;
  const plan = mPlan + tDone + tOpen;
  const p = plan >= 5 ? clamp((mDone + tDone) / plan, 0, 1) : null;
  // Calidad: a la primera.
  let good = 0; let total = 0;
  for (const t of todos) if (inW(t.done)) { total += 1; if (!t.due || t.done <= t.due || t.repeat) good += 1; }
  for (const d of days) for (const x of safe(() => dosesFor(s, d), [])) { if (x.status === 'si') { good += 1; total += 1; } else if (x.status === 'no') total += 1; }
  const txDay = new Map(((s.money && s.money.tx) || []).map((t) => [t.id, t.day]));
  for (const pl of (s.money && s.money.plans) || []) {
    if (pl.kind !== 'gasto') continue;
    for (const [date, id] of Object.entries(pl.done || {})) {
      const paid = txDay.get(id);
      if (!paid || !inW(paid)) continue;
      total += 1; if (paid <= date) good += 1;
    }
  }
  for (const d of days) {
    const x = s.days && s.days[d];
    if (!x || x.c) continue;
    for (const m of (s.missions || []).filter((mi) => mi.kind === 'avoid' && !mi.archived && mi.created <= d)) { total += 1; if (!(x.slips && x.slips[m.id])) good += 1; }
  }
  const q = total >= 5 ? good / total : null;
  const on = [a, p, q].filter((v) => v != null);
  const value = on.length === 3 ? a * p * q : null;
  // La pérdida mayor: el factor más bajo.
  const facts = [['a', a], ['p', p], ['q', q]].filter((x) => x[1] != null).sort((x, y) => x[1] - y[1]);
  return {
    from, to, a, p, q, oee: value, partial: on.length > 0 && on.length < 3,
    done: mDone + tDone, plan, good, total, nights: nights.length,
    loss: facts.length ? facts[0][0] : null,
  };
}

export const OEE_PART = {
  a: { name: 'Disponibilidad', short: 'Energía', help: 'La energía con la que contaste, según lo que dormiste, frente a la de una noche completa.', fix: 'Dormir tu meta: es lo que más energía te devuelve.', href: '/area/salud' },
  p: { name: 'Rendimiento', short: 'Cumplido', help: 'Lo que hiciste frente a lo que tenías planeado: misiones del día y pendientes con fecha.', fix: 'Planear menos o repartir mejor: lo que no cabe en el día baja este número.', href: '/mando?ver=copiloto' },
  q: { name: 'Calidad', short: 'A la primera', help: 'Lo que salió bien a la primera: a tiempo, sin omitir tomas y sin caídas.', fix: 'Poner fecha y recordatorio a lo que suele atrasarse.', href: '/pendientes' },
};

export function oeeWeek(s, today) {
  const from = weekOf(today);
  return oee(s, from, today);
}

// Las últimas semanas completas (y la actual), para ver la tendencia y tu promedio.
export function oeeTrend(s, today, n = 8) {
  const out = [];
  const wk = weekOf(today);
  for (let i = n - 1; i >= 0; i--) {
    const from = addDays(wk, -7 * i);
    if (addDays(from, 6) < (s.profile.created || from)) continue;
    const to = i === 0 ? today : addDays(from, 6);
    out.push({ wk: from, ...oee(s, from, to), current: i === 0 });
  }
  const past = out.filter((x) => !x.current && x.oee != null).map((x) => x.oee);
  return { weeks: out, avg: past.length ? mean(past) : null, best: past.length ? Math.max(...past) : null };
}

// ---------- Muda: los ocho desperdicios ----------

const openAt = (t, day) => t.created <= day && (!t.done || t.done > day);

// Cada medida es un número (menos es mejor) en una ventana de días: sirve para el tablero y para el Kaizen.
export const MEASURES = {
  espera: (s, from, to) => (s.todos || []).filter((t) => t.due && t.due < to && openAt(t, to)).length,
  inventario: (s, from, to) => (s.todos || []).filter((t) => !t.due && !t.chore && t.created <= addDays(to, -30) && openAt(t, to)).length,
  sobreproduccion: (s, from, to) => Math.max(0, (s.todos || []).filter((t) => !t.chore && t.created >= from && t.created <= to).length - (s.todos || []).filter((t) => !t.chore && t.done && t.done >= from && t.done <= to).length),
  defectos: (s, from, to) => {
    let n = (s.todos || []).filter((t) => t.done && t.done >= from && t.done <= to && t.due && t.done > t.due && !t.repeat).length;
    for (const d of range(from, to)) {
      n += safe(() => dosesFor(s, d), []).filter((x) => x.status === 'no').length;
      const x = s.days && s.days[d];
      if (x && x.slips) n += Object.values(x.slips).reduce((a, v) => a + (Number(v) || 0), 0);
    }
    const txDay = new Map(((s.money && s.money.tx) || []).map((t) => [t.id, t.day]));
    for (const pl of (s.money && s.money.plans) || []) {
      if (pl.kind !== 'gasto') continue;
      for (const [date, id] of Object.entries(pl.done || {})) { const paid = txDay.get(id); if (paid && paid >= from && paid <= to && paid > date) n += 1; }
    }
    return n;
  },
  movimiento: (s, from, to) => safe(() => shopOf(s).trips, []).filter((t) => t.day >= from && t.day <= to).length,
  sobreproceso: (s, from, to) => Math.round(((s.money && s.money.tx) || []).filter((t) => t.day >= from && t.day <= to && txKind(t) === 'gasto' && inStats(t) && (t.cat === 'comisiones' || t.cat === 'intereses_pagados')).reduce((a, t) => a + txDOP(t), 0)),
  talento: (s, from, to) => AREA_KEYS.filter((k) => !range(from, to).some((d) => { const x = s.days && s.days[d]; return x && x.xpBy && x.xpBy[k] > 0; })).length,
  energia: (s, from, to) => {
    const goal = Number(s.profile.sleepGoal) || 7;
    return Math.round(range(from, to).reduce((a, d) => a + (H(s, d).sleep != null ? Math.max(0, goal - H(s, d).sleep) : 0), 0) * 4) / 4;
  },
};

export const MUDA = {
  espera: { name: 'Espera', what: 'Cosas detenidas esperando que las hagas', icon: 'clock' },
  inventario: { name: 'Inventario', what: 'Pendientes guardados sin fecha desde hace más de un mes', icon: 'box' },
  sobreproduccion: { name: 'Sobreproducción', what: 'Te pones más de lo que cierras', icon: 'list' },
  defectos: { name: 'Defectos', what: 'Lo que hubo que hacer tarde, se omitió o falló', icon: 'shield' },
  movimiento: { name: 'Movimiento', what: 'Viajes al súper de más', icon: 'cart' },
  sobreproceso: { name: 'Sobreproceso', what: 'Lo que pagas sin recibir nada: comisiones e intereses', icon: 'wallet' },
  talento: { name: 'Talento sin usar', what: 'Áreas de tu vida sin ningún avance', icon: 'star' },
  energia: { name: 'Capacidad perdida', what: 'Horas de sueño que te faltaron', icon: 'moon' },
};

// El tablero de hoy: cada desperdicio con su número (últimos 14 días, o el estado de hoy), qué tan grave es
// (0 a 3) y la contramedida.
export function muda(s, today) {
  const from = addDays(today, -13);
  const out = [];
  const row = (key, value, level, text, fix, cost = null) => out.push({ key, ...MUDA[key], value, level, text, fix, cost });
  const v = (k, a = from, b = today) => safe(() => MEASURES[k](s, a, b), 0);

  const esp = v('espera');
  const over = (s.todos || []).filter((t) => !t.done && t.due && t.due < today);
  const waitDays = over.reduce((a, t) => a + diffDays(t.due, today), 0);
  row('espera', esp, esp >= 8 ? 3 : esp >= 4 ? 2 : esp >= 1 ? 1 : 0, esp ? `${cuantos(esp, 'pendiente vencido', 'pendientes vencidos')}: ${cuantos(waitDays, 'día', 'días')} de espera acumulados` : 'Nada vencido', { label: 'Repartir la semana', href: '/mando?ver=copiloto' });

  const inv = v('inventario');
  row('inventario', inv, inv >= 10 ? 3 : inv >= 5 ? 2 : inv >= 2 ? 1 : 0, inv ? `${cuantos(inv, 'pendiente lleva', 'pendientes llevan')} más de un mes sin fecha` : 'Sin pendientes viejos sin fecha', { label: 'Decidir cada uno', href: '/pendientes' });

  const created = (s.todos || []).filter((t) => !t.chore && t.created >= from && t.created <= today).length;
  const closed = (s.todos || []).filter((t) => !t.chore && t.done && t.done >= from && t.done <= today).length;
  const net = v('sobreproduccion');
  row('sobreproduccion', net, created >= 6 && closed > 0 && created / closed >= 2 ? 3 : created >= 6 && created / Math.max(1, closed) >= 1.4 ? 2 : net >= 3 ? 1 : 0, `En 2 semanas anotaste ${created} y cerraste ${closed}`, { label: 'Poner un tope', href: '/pendientes' });

  const def = v('defectos');
  row('defectos', def, def >= 10 ? 3 : def >= 5 ? 2 : def >= 2 ? 1 : 0, def ? `${cuantos(def, 'cosa', 'cosas')} en 2 semanas: hechas tarde, tomas omitidas, caídas o pagos atrasados` : 'Todo salió a la primera', { label: 'Ver recordatorios', href: '/ajustes' });

  const trips = v('movimiento', addDays(today, -27), today);
  const perWeek = trips / 4;
  row('movimiento', Math.round(perWeek * 10) / 10, perWeek >= 3 ? 3 : perWeek >= 2 ? 2 : perWeek > 1.25 ? 1 : 0, trips ? `${String(Math.round(perWeek * 10) / 10)} ${Math.round(perWeek * 10) / 10 === 1 ? 'viaje' : 'viajes'} al súper por semana` : 'Sin compras registradas este mes', { label: 'Elegir un día de compras', href: '/compras' });

  const bank = v('sobreproceso', addDays(today, -29), today);
  row('sobreproceso', bank, bank >= 3000 ? 3 : bank >= 1000 ? 2 : bank > 0 ? 1 : 0, bank ? `${rd(bank)} en comisiones e intereses en 30 días` : 'Sin comisiones ni intereses este mes', { label: 'Ver qué te cobra el banco', href: '/finanzas?tab=analisis' }, bank || null);

  const idle = AREA_KEYS.filter((k) => !range(from, today).some((d) => { const x = s.days && s.days[d]; return x && x.xpBy && x.xpBy[k] > 0; }));
  row('talento', idle.length, idle.length >= 4 ? 3 : idle.length >= 2 ? 2 : idle.length >= 1 ? 1 : 0, idle.length ? `Sin avance en 2 semanas: ${idle.map((k) => AREA[k].name || AREA[k].attr).join(', ')}` : 'Avanzaste en todas tus áreas', { label: 'Ver tus áreas', href: '/areas' });

  const debt = v('energia', addDays(today, -6), today);
  row('energia', debt, debt >= 7 ? 3 : debt >= 4 ? 2 : debt >= 1.5 ? 1 : 0, debt ? `Te faltaron ${fmtHours(debt)} de sueño esta semana` : 'Dormiste lo que necesitas', { label: 'Ver tu sueño', href: '/area/salud' });

  return out.sort((a, b) => b.level - a.level);
}

export const MUDA_LEVEL = ['En orden', 'Leve', 'Medio', 'Alto'];

// ---------- Kaizen ----------

export const KAIZEN_DAYS = 7;
export const KAIZEN_IDEAS = {
  espera: 'Cada mañana, pasar a hoy o dar fecha nueva a un vencido',
  inventario: 'Decidir 3 pendientes viejos: hacerlo, darle fecha o borrarlo',
  sobreproduccion: 'Antes de anotar uno nuevo, cerrar uno',
  defectos: 'Poner hora y recordatorio a lo que más se me pasa',
  movimiento: 'Ir al súper un solo día, con la lista hecha',
  sobreproceso: 'Evitar una comisión: pagar antes del corte o transferir sin costo',
  talento: 'Una misión pequeña en el área que tengo parada',
  energia: 'Acostarme 30 minutos antes',
};

export const kaizenRunning = (s) => plusOf(s).kaizen.find((k) => k.state === 'run') || null;

// Planear: guarda la línea base (los 7 días anteriores) y empieza a contar.
export function startKaizen(s, key, today, text = '') {
  if (!MEASURES[key]) return null;
  const p = ensurePlus(s);
  if (p.kaizen.some((k) => k.state === 'run')) return null;
  const base = MEASURES[key](s, addDays(today, -KAIZEN_DAYS), addDays(today, -1));
  const k = { id: `k${uid()}`, key, text: String(text || KAIZEN_IDEAS[key]).slice(0, 140), start: today, end: addDays(today, KAIZEN_DAYS - 1), base, after: null, state: 'run' };
  p.kaizen.unshift(k);
  p.kaizen = p.kaizen.slice(0, 60);
  return k;
}

export function kaizenProgress(s, k, today) {
  const to = today < k.end ? today : k.end;
  const now = to >= k.start ? MEASURES[k.key](s, k.start, to) : 0;
  return { now, day: clamp(diffDays(k.start, today) + 1, 1, KAIZEN_DAYS), left: Math.max(0, diffDays(today, k.end)), done: today > k.end };
}

const improved = (base, after) => (base > 0 ? after <= base * 0.9 : after === 0);

// Verificar: al pasar los 7 días se compara con la línea base. Si mejoró, +20 XP y 10 de oro.
export function checkKaizen(s, today, ev = []) {
  const p = ensurePlus(s);
  const out = [];
  for (const k of p.kaizen) {
    if (k.state !== 'run' || today <= k.end) continue;
    k.after = MEASURES[k.key](s, k.start, k.end);
    k.state = improved(k.base, k.after) ? 'ok' : 'no';
    if (k.state === 'ok') { gainXP(s, 'crecimiento', 20, today, ev); addGold(s, 10, today); ev.push({ type: 'kaizen', text: k.text }); }
    out.push(k);
  }
  return out;
}

export function dropKaizen(s, id) {
  const p = ensurePlus(s);
  p.kaizen = p.kaizen.filter((k) => k.id !== id);
}

// Actuar: lo que funcionó se puede dejar como misión.
export function kaizenHistory(s) {
  const list = plusOf(s).kaizen.filter((k) => k.state !== 'run');
  return { list, ok: list.filter((k) => k.state === 'ok').length, total: list.length };
}

export const kaizenUnit = (key, v) => (key === 'sobreproceso' ? rd(v) : key === 'energia' ? fmtHours(v) : String(v));

export { weekOf };
