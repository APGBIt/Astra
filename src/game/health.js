// Salud (1.10): medicinas y suplementos con horario (tomada u omitida, como Medicamentos de Apple Salud),
// actividad con intensidad (los minutos intensos cuentan doble, como los Puntos Cardio de Google Fit y la guía
// de la OMS: 150 min moderados o 75 intensos a la semana, y fuerza 2 días) y tus últimas semanas de salud.
import { addDays, weekday } from '../app/dates.js';
import { uid, gainXP, getDay, timeToMin, minToTime, dailyGoal } from './logic.js';
import { EXERCISE_TYPES, EXERCISE_WEEK_GOAL } from './content.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const txt = (v, n = 80) => String(v == null ? '' : v).trim().slice(0, n);
const hhmm = (t) => (timeToMin(t) != null ? minToTime(timeToMin(t)) : null);
const r1 = (v) => Math.round(v * 10) / 10;
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// ---------- Medicinas y suplementos ----------

export const MED_KINDS = [['medicina', 'Medicina'], ['suplemento', 'Suplemento o vitamina']];
export const STRENGTH_WEEK_GOAL = 2;

function normMed(m, today) {
  const times = [...new Set((Array.isArray(m.times) ? m.times : []).map(hhmm).filter(Boolean))].sort().slice(0, 6);
  const days = Array.isArray(m.days) ? [...new Set(m.days.map(Number).filter((d) => d >= 0 && d <= 6))].sort() : null;
  return {
    id: String(m.id), name: txt(m.name, 50), dose: txt(m.dose, 40), kind: m.kind === 'suplemento' ? 'suplemento' : 'medicina',
    times: times.length ? times : ['08:00'], days: days && days.length && days.length < 7 ? days : null,
    start: isDay(m.start) ? m.start : today, end: isDay(m.end) ? m.end : null, note: txt(m.note, 160),
    archived: isDay(m.archived) ? m.archived : null, created: Number(m.created) || 0,
  };
}

export function ensureHealthPlus(s, today = null) {
  const d = today || (s.energy && s.energy.day) || '2026-01-01';
  if (!Array.isArray(s.meds)) s.meds = [];
  s.meds = s.meds.filter((m) => isObj(m) && m.id && txt(m.name)).map((m) => normMed(m, d));
  for (const h of Object.values(s.health || {})) {
    if (!isObj(h)) continue;
    if (h.meds !== undefined && !isObj(h.meds)) delete h.meds;
    if (isObj(h.meds)) for (const [k, v] of Object.entries(h.meds)) if (v !== 'si' && v !== 'no') delete h.meds[k];
    if (h.exVig != null) h.exVig = Math.max(0, Math.min(Number(h.exercise) || 0, Math.round(Number(h.exVig) || 0)));
    if (h.strength !== undefined && typeof h.strength !== 'boolean') h.strength = !!h.strength;
  }
}

export function addMed(s, p, today) {
  const name = txt(p.name, 50);
  if (!name) return null;
  const m = normMed({ ...p, id: uid(), name, start: isDay(p.start) ? p.start : today, created: Date.now() }, today);
  s.meds.push(m);
  return m;
}

export function updateMed(s, id, p, today) {
  const i = s.meds.findIndex((m) => m.id === id);
  if (i < 0) return null;
  s.meds[i] = normMed({ ...s.meds[i], ...p, id }, today);
  return s.meds[i];
}

// Dejar de tomarla: se guarda su historial (y deja de salir en tu día).
export function archiveMed(s, id, today) {
  const m = s.meds.find((x) => x.id === id);
  if (!m) return null;
  m.archived = today;
  if (!m.end || m.end > today) m.end = today;
  return m;
}

export function restoreMed(s, id) {
  const m = s.meds.find((x) => x.id === id);
  if (!m) return null;
  m.archived = null;
  m.end = null;
  return m;
}

export function removeMed(s, id) {
  s.meds = s.meds.filter((m) => m.id !== id);
  for (const h of Object.values(s.health || {})) {
    if (!isObj(h) || !isObj(h.meds)) continue;
    for (const k of Object.keys(h.meds)) if (k.startsWith(`${id}@`)) delete h.meds[k];
    if (!Object.keys(h.meds).length) delete h.meds;
  }
}

export function medOn(m, day) {
  if (day < m.start || (m.end && day > m.end) || (m.archived && day > m.archived)) return false;
  return !m.days || m.days.includes(weekday(day));
}

// Las tomas de un día, en orden de hora: { key, med, time, status: 'si' | 'no' | null }.
export function dosesFor(s, day) {
  const log = ((s.health && s.health[day]) || {}).meds || {};
  const out = [];
  for (const m of s.meds || []) {
    if (!medOn(m, day)) continue;
    for (const time of m.times) { const key = `${m.id}@${time}`; out.push({ key, med: m, time, status: log[key] || null }); }
  }
  return out.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.med.name < b.med.name ? -1 : 1));
}

// Marca una toma. `status`: 'si' (tomada), 'no' (omitida) o null (quitar la marca).
// Tomar todas las del día da +3 XP de Vigor, una vez al día. No tomar una no quita nada: tu salud no es un castigo.
export function logDose(s, day, key, status, today, ev = []) {
  const h = s.health[day] || (s.health[day] = {});
  if (!isObj(h.meds)) h.meds = {};
  if (status === 'si' || status === 'no') h.meds[key] = status;
  else delete h.meds[key];
  if (!Object.keys(h.meds).length) delete h.meds;
  const all = dosesFor(s, day);
  if (day === today && all.length && all.every((d) => d.status === 'si')) {
    const dd = getDay(s, today);
    if (!dd.medsXp) { dd.medsXp = true; gainXP(s, 'salud', 3, today, ev); }
  }
  return all.find((d) => d.key === key) || null;
}

export function medsToday(s, today, nowMin = null) {
  const list = dosesFor(s, today);
  const taken = list.filter((d) => d.status === 'si').length;
  const pending = list.filter((d) => !d.status);
  const late = nowMin == null ? [] : pending.filter((d) => timeToMin(d.time) + 60 < nowMin);
  return { list, total: list.length, taken, pending: pending.length, next: pending[0] || null, late: late.length };
}

// Cuántas tomas marcaste como tomadas en los últimos días (hasta ayer, más las de hoy ya marcadas).
export function medAdherence(s, m, today, days = 30) {
  let total = 0; let taken = 0; let skipped = 0;
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    if (!medOn(m, d)) continue;
    const log = ((s.health[d] || {}).meds) || {};
    for (const t of m.times) {
      const st = log[`${m.id}@${t}`];
      if (d === today && !st) continue;
      total += 1;
      if (st === 'si') taken += 1; else if (st === 'no') skipped += 1;
    }
  }
  return { total, taken, skipped, missed: total - taken - skipped, pct: total ? taken / total : null };
}

// ---------- Actividad con intensidad ----------

export const INTENSITIES = [['moderada', 'Moderada', 'Puedes hablar, pero no cantar: caminar rápido, bailar, bici suave.'], ['intensa', 'Intensa', 'Te cuesta decir más de unas palabras: correr, subir lomas, deportes rápidos.']];
export const typeOf = (k) => EXERCISE_TYPES.find((x) => x.key === k) || EXERCISE_TYPES[EXERCISE_TYPES.length - 1];

// La semana de actividad (últimos 7 días): minutos, los intensos cuentan doble para la meta de la OMS, y días de fuerza.
export function activityWeek(s, today) {
  let total = 0; let vig = 0; let days = 0; let strength = 0;
  const byType = {};
  for (let i = 0; i < 7; i++) {
    const h = s.health[addDays(today, -i)];
    if (!h) continue;
    if (h.strength || ((h.exTypes || {}).gimnasio > 0)) strength += 1;
    if (!h.exercise) continue;
    total += h.exercise;
    vig += Math.min(h.exercise, h.exVig || 0);
    days += 1;
    let typed = 0;
    for (const [k, v] of Object.entries(h.exTypes || {})) { byType[k] = (byType[k] || 0) + v; typed += v; }
    if (h.exercise > typed) byType.otro = (byType.otro || 0) + (h.exercise - typed);
  }
  return {
    total, vig, equiv: total + vig, days, strength, goal: EXERCISE_WEEK_GOAL, strengthGoal: STRENGTH_WEEK_GOAL,
    byType: Object.entries(byType).sort((a, b) => b[1] - a[1]),
  };
}

// ---------- Tus últimas semanas ----------

// Bloques de 7 días que terminan hoy (el último es «estos 7 días»), del más viejo al más nuevo.
export function healthWeeks(s, today, n = 8) {
  const out = [];
  for (let w = n - 1; w >= 0; w--) {
    const to = addDays(today, -7 * w);
    const from = addDays(to, -6);
    const sl = []; const st = []; const wa = []; const ve = [];
    let active = 0; let any = 0;
    for (let i = 0; i < 7; i++) {
      const h = s.health[addDays(from, i)];
      if (!h) continue;
      let has = false;
      if (h.sleep != null) { sl.push(h.sleep); has = true; }
      if (h.steps != null) { st.push(h.steps); has = true; }
      if (h.water != null) { wa.push(h.water); has = true; }
      if (h.veg != null) { ve.push(h.veg); has = true; }
      if (h.exercise) { active += h.exercise + Math.min(h.exercise, h.exVig || 0); has = true; }
      if (has) any += 1;
    }
    out.push({
      from, to, days: any,
      sleep: sl.length ? r1(avg(sl)) : null, steps: st.length ? Math.round(avg(st)) : null, active: any ? active : null,
      water: wa.length ? r1(avg(wa)) : null, veg: ve.length ? r1(avg(ve)) : null,
    });
  }
  return out;
}

export const TREND_METRICS = [
  { key: 'sleep', label: 'Sueño', unit: 'por noche', goal: (s) => dailyGoal(s, 'sleep') },
  { key: 'steps', label: 'Pasos', unit: 'pasos al día', goal: (s) => dailyGoal(s, 'steps') },
  { key: 'active', label: 'Actividad', unit: 'a la semana', goal: () => EXERCISE_WEEK_GOAL },
  { key: 'water', label: 'Agua', unit: 'vasos al día', goal: (s) => dailyGoal(s, 'water') },
];

// Las 4 semanas más recientes frente a las 4 anteriores, de una medida.
export function trendOf(weeks, key) {
  const vals = (list) => list.map((w) => w[key]).filter((v) => v != null);
  const half = Math.floor(weeks.length / 2);
  const a = avg(vals(weeks.slice(half)));
  const b = avg(vals(weeks.slice(0, half)));
  return { recent: a, before: b, diff: a != null && b != null ? a - b : null, n: vals(weeks).length };
}
