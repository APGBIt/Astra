// Informe semanal (1.17): tu progreso y lo que conviene mejorar en todas las áreas, como la evaluación semanal de
// WHOOP (llega cada lunes) o los resúmenes semanales de Samsung Health y Garmin, pero de tu vida completa:
// salud, emociones, dinero, relaciones, crecimiento, trabajo, hogar y el juego.
//
// Es puro: recibe el estado y devuelve el informe. Compara con la semana anterior y con tu promedio de 4 semanas,
// escoge hasta 3 logros y 3 aspectos a mejorar (con una acción para cada uno) y revisa el foco que elegiste.
import { addDays, diffDays, weekday, fmtShort, MONTHS, parseDay } from '../app/dates.js';
import { AREA } from './content.js';
import {
  isScheduled, doneCount, gainXP, addGold, fmtHours, catName, txKind, txDOP, inStats, duePeople, pendingTodos, timeToMin, minToTime, sleepInsights,
} from './logic.js';
import { dosesFor } from './health.js';
import { readiness, loadInfo, bpStats, sleepNeed, bedtimeForNeed } from './vitals.js';
import { labSuggestions } from './labs.js';
import { isPleasant } from './mind.js';
import { budgetRows, dueItems } from './money.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (v) => Math.round(v * 10) / 10;
const rd = (v) => `RD$${Math.round(v).toLocaleString('en-US')}`;
const pctTxt = (v) => `${Math.round(v * 100)} %`;
const H = (s, d) => (s.health && s.health[d]) || {};

// ---------- Semanas ----------

export const weekOf = (day) => addDays(day, -((weekday(day) + 6) % 7)); // lunes
export const REPORT_HOUR = 18;

// El informe «listo»: el de esta semana desde el domingo a las 6 p. m.; antes, el de la semana pasada.
export function readyWeek(today, hour) {
  const wk = weekOf(today);
  return weekday(today) === 0 && hour >= REPORT_HOUR ? wk : addDays(wk, -7);
}

export function weekLabel(wk) {
  const a = parseDay(wk); const b = parseDay(addDays(wk, 6));
  const same = a.getMonth() === b.getMonth();
  return same ? `${a.getDate()} al ${b.getDate()} de ${MONTHS[b.getMonth()]}` : `${a.getDate()} de ${MONTHS[a.getMonth()]} al ${b.getDate()} de ${MONTHS[b.getMonth()]}`;
}

// ---------- Medidas de una semana ----------

export function weekMetrics(s, wk, today) {
  const from = wk;
  const to = addDays(wk, 6) < today ? addDays(wk, 6) : today;
  const days = from <= to ? diffDays(from, to) + 1 : 0;
  const list = Array.from({ length: days }, (_, i) => addDays(from, i));
  const inW = (d) => d >= from && d <= to;
  const m = { wk, from, to, days };
  // Juego: XP, misiones hechas y planeadas.
  let xp = 0; let gold = 0; let done = 0; let planned = 0;
  for (const d of list) {
    const x = s.days && s.days[d];
    xp += (x && x.xp) || 0; gold += (x && x.gold) || 0;
    const n = doneCount(x);
    done += n;
    const habits = (s.missions || []).filter((mi) => mi.kind === 'habit' && isScheduled(mi, d)).length;
    const once = (s.missions || []).filter((mi) => mi.kind === 'once' && mi.doneOn === d).length;
    planned += Math.max(habits + once, n);
  }
  Object.assign(m, { xp, gold, done, planned, pct: planned ? Math.min(1, done / planned) : null });
  // Salud.
  const hs = list.map((d) => ({ d, h: H(s, d) }));
  const goal = Number(s.profile.sleepGoal) || 7;
  const sl = hs.filter((x) => x.h.sleep != null).map((x) => x.h.sleep);
  const beds = hs.map((x) => timeToMin(x.h.bed)).filter((v) => v != null).map((v) => (v - 720 + 1440) % 1440);
  m.sleepN = sl.length;
  m.sleepAvg = sl.length ? r1(mean(sl)) : null;
  m.sleepGoalNights = sl.filter((v) => v >= goal).length;
  m.debt = Math.round(sl.reduce((a, v) => a + Math.max(0, goal - v), 0) * 4) / 4;
  m.bedSpread = beds.length >= 4 ? Math.max(...beds) - Math.min(...beds) : null;
  const rds = list.map((d) => readiness(s, d)).filter(Boolean);
  m.readyN = rds.length;
  m.readyAvg = rds.length ? Math.round(mean(rds.map((r) => r.score))) : null;
  m.green = rds.filter((r) => r.zone === 'verde').length;
  m.red = rds.filter((r) => r.zone === 'rojo').length;
  m.equiv = hs.reduce((a, x) => a + (x.h.exercise || 0) + Math.min(x.h.exercise || 0, x.h.exVig || 0), 0);
  m.exDays = hs.filter((x) => x.h.exercise > 0).length;
  m.strength = hs.filter((x) => x.h.strength || (x.h.exTypes || {}).gimnasio > 0 || (x.h.exTypes || {}).fuerza > 0).length;
  const st = hs.filter((x) => x.h.steps != null).map((x) => x.h.steps);
  m.stepsN = st.length; m.stepsAvg = st.length ? Math.round(mean(st)) : null;
  const vg = hs.filter((x) => x.h.veg != null).map((x) => x.h.veg);
  m.vegN = vg.length; m.vegAvg = vg.length ? r1(mean(vg)) : null;
  const wa = hs.filter((x) => x.h.water != null).map((x) => x.h.water);
  m.waterAvg = wa.length ? r1(mean(wa)) : null;
  let mt = 0; let mk = 0;
  for (const d of list) for (const x of dosesFor(s, d)) { if (d === today && !x.status) continue; mt += 1; if (x.status === 'si') mk += 1; }
  m.meds = { total: mt, taken: mk, pct: mt ? mk / mt : null };
  m.load = loadInfo(s, to);
  m.bp = bpStats(s, to, days || 1);
  // Emociones.
  const moods = (s.moods || []).filter((x) => inW(x.day));
  m.checkins = moods.length;
  m.checkinDays = new Set(moods.map((x) => x.day)).size;
  m.pleasant = moods.length ? moods.filter((x) => isPleasant(x.quad)).length / moods.length : null;
  const words = {};
  for (const x of moods) for (const w of x.words || []) words[w] = (words[w] || 0) + 1;
  m.topWord = Object.entries(words).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  m.calm = ((s.mind && s.mind.calm) || []).filter((x) => inW(x.day)).reduce((a, x) => a + (x.minutes || 0), 0);
  m.journal = (s.journal || []).filter((j) => inW(j.day) && j.kind !== 'nota').length;
  m.posada = list.filter((d) => s.inn && s.inn[d]).length;
  m.goods = list.reduce((a, d) => a + ((s.inn && s.inn[d] && s.inn[d].goods) || []).filter(Boolean).length, 0);
  // Finanzas.
  const cats = {};
  let spent = 0; let income = 0;
  for (const t of (s.money && s.money.tx) || []) {
    if (!inW(t.day) || !inStats(t)) continue;
    const k = txKind(t);
    if (k === 'gasto') { spent += txDOP(t); cats[t.cat] = (cats[t.cat] || 0) + txDOP(t); } else if (k === 'ingreso') income += txDOP(t);
  }
  m.spent = Math.round(spent); m.income = Math.round(income);
  m.cats = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, v]) => ({ id, name: s.money ? catName(s, id) : id, amount: Math.round(v) }));
  // Relaciones, crecimiento y trabajo.
  m.contacts = (s.contacts || []).filter((c) => inW(c.day)).length;
  m.pages = (s.reads || []).filter((r) => inW(r.day)).reduce((a, r) => a + (r.pages || 0), 0);
  m.readDays = new Set((s.reads || []).filter((r) => inW(r.day)).map((r) => r.day)).size;
  m.practice = (s.practice || []).filter((p) => inW(p.day)).reduce((a, p) => a + (p.minutes || 0), 0);
  const fo = (s.focus || []).filter((f) => inW(f.day) && !f.broken);
  m.focusN = fo.length; m.focusMin = fo.reduce((a, f) => a + (f.minutes || 0), 0);
  m.wins = (s.wins || []).filter((w) => inW(w.day)).length;
  // Hogar y pendientes.
  m.todosDone = (s.todos || []).filter((t) => t.done && inW(t.done)).length;
  m.overdue = pendingTodos(s).filter((t) => t.due && t.due < to).length;
  m.chores = (s.chores || []).reduce((a, c) => a + (c.log || []).filter((l) => inW(typeof l === 'string' ? l : l && l.day)).length, 0);
  return m;
}

function avgOf(list, key) {
  const xs = list.map((x) => (typeof key === 'function' ? key(x) : x[key])).filter((v) => v != null && Number.isFinite(v));
  return xs.length ? mean(xs) : null;
}

// ---------- Logros y aspectos a mejorar ----------

// Focos medibles: lo que se revisa la semana siguiente.
export const FOCUS = {
  sleep_nights: { sum: true, area: 'salud', unit: 'noches', test: (m, t) => m.sleepGoalNights >= t, val: (m) => m.sleepGoalNights, txt: (t) => `Dormir tu meta ${t} noches` },
  bed_regular: { area: 'salud', unit: 'min', test: (m, t) => m.bedSpread != null && m.bedSpread <= t, val: (m) => m.bedSpread, txt: () => 'Acostarte a la misma hora (±30 min)' },
  active_min: { sum: true, area: 'salud', unit: 'min', test: (m, t) => m.equiv >= t, val: (m) => m.equiv, txt: (t) => `${t} minutos de actividad` },
  strength_days: { sum: true, area: 'salud', unit: 'días', test: (m, t) => m.strength >= t, val: (m) => m.strength, txt: (t) => `Fuerza ${t} días` },
  steps_avg: { area: 'salud', unit: 'pasos', test: (m, t) => m.stepsAvg != null && m.stepsAvg >= t, val: (m) => m.stepsAvg, txt: (t) => `${t.toLocaleString('en-US')} pasos al día` },
  veg_avg: { area: 'salud', unit: 'porciones', test: (m, t) => m.vegAvg != null && m.vegAvg >= t, val: (m) => m.vegAvg, txt: (t) => `${t} porciones de frutas y verduras al día` },
  meds_pct: { area: 'salud', unit: '%', test: (m, t) => m.meds.pct != null && m.meds.pct >= t, val: (m) => (m.meds.pct != null ? Math.round(m.meds.pct * 100) : null), txt: () => 'Tomar todas tus medicinas a su hora' },
  missions_pct: { area: 'crecimiento', unit: '%', test: (m, t) => m.pct != null && m.pct >= t, val: (m) => (m.pct != null ? Math.round(m.pct * 100) : null), txt: (t) => `Cumplir el ${Math.round(t * 100)} % de tus misiones` },
  checkins: { sum: true, area: 'emocional', unit: 'días', test: (m, t) => m.checkinDays >= t, val: (m) => m.checkinDays, txt: (t) => `Un check-in de ánimo ${t} días` },
  calm_min: { sum: true, area: 'emocional', unit: 'min', test: (m, t) => m.calm >= t, val: (m) => m.calm, txt: (t) => `${t} minutos de calma en la semana` },
  posada_nights: { sum: true, area: 'emocional', unit: 'noches', test: (m, t) => m.posada >= t, val: (m) => m.posada, txt: (t) => `Cerrar el día en la posada ${t} noches` },
  spend_cap: { area: 'finanzas', unit: 'RD$', test: (m, t) => m.spent <= t, val: (m) => m.spent, txt: (t) => `Gastar como mucho ${rd(t)} en la semana` },
  overdue_zero: { area: 'crecimiento', unit: 'pendientes', test: (m, t) => m.overdue <= t, val: (m) => m.overdue, txt: () => 'Terminar la semana sin pendientes vencidos' },
  contacts: { sum: true, area: 'relaciones', unit: 'contactos', test: (m, t) => m.contacts >= t, val: (m) => m.contacts, txt: (t) => `Hablar con ${t} personas de tu lista` },
  reading: { sum: true, area: 'crecimiento', unit: 'días', test: (m, t) => m.readDays >= t, val: (m) => m.readDays, txt: (t) => `Leer ${t} días` },
};
const focusOf = (key, target) => ({ key, target, area: FOCUS[key].area, text: FOCUS[key].txt(target) });

function candidates(s, m, prev, avg4, today) {
  const out = [];
  const add = (x) => out.push(x);
  const goal = Number(s.profile.sleepGoal) || 7;
  const full = m.days >= 5;
  // Constancia (misiones).
  if (m.planned >= 5 && m.pct != null) {
    if (m.pct >= 0.8) add({ id: 'misiones', kind: 'win', area: 'crecimiento', icon: 'sword', score: 0.6 + (m.pct - 0.8), title: `Cumpliste el ${pctTxt(m.pct)} de tus misiones`, text: `${m.done} de ${m.planned}${prev && prev.pct != null ? ` (la semana anterior, ${pctTxt(prev.pct)})` : ''}.` });
    else if (prev && prev.pct != null && m.pct - prev.pct >= 0.15) add({ id: 'misiones', kind: 'win', area: 'crecimiento', icon: 'sword', score: 0.55, title: `Subiste de ${pctTxt(prev.pct)} a ${pctTxt(m.pct)} en tus misiones`, text: 'Vas en la dirección correcta.' });
    else if (m.pct < 0.6 && full) add({ id: 'misiones', kind: 'improve', area: 'crecimiento', icon: 'sword', score: 0.5 + (0.6 - m.pct), title: `Cumpliste el ${pctTxt(m.pct)} de tus misiones`, text: `${m.done} de ${m.planned}. Cuando las misiones piden más energía de la que tienes, se caen todas.`, tip: 'Quita una o bájale el costo: mejor 3 que cumples que 6 que no.', action: { kind: 'route', href: '#/misiones', label: 'Revisar mis misiones' }, focus: focusOf('missions_pct', 0.8) });
  }
  // Sueño.
  if (m.sleepN >= 4) {
    const wake = s.profile.wakeGoal || sleepInsights(s, today).avgWake;
    const bed = wake ? bedtimeForNeed(s, wake, sleepNeed(s, today).need) : null;
    if (m.sleepAvg >= goal) add({ id: 'sueno', kind: 'win', area: 'salud', icon: 'moon', score: 0.65 + (m.sleepGoalNights >= 6 ? 0.1 : 0), title: `Dormiste ${fmtHours(Math.round(m.sleepAvg * 4) / 4)} en promedio`, text: `Tu meta es ${fmtHours(goal)}: la cumpliste ${m.sleepGoalNights} de ${m.sleepN} noches.` });
    else if (prev && prev.sleepAvg != null && m.sleepAvg - prev.sleepAvg >= 0.4) add({ id: 'sueno', kind: 'win', area: 'salud', icon: 'moon', score: 0.55, title: `Dormiste ${fmtHours(Math.round((m.sleepAvg - prev.sleepAvg) * 4) / 4)} más por noche`, text: `De ${fmtHours(Math.round(prev.sleepAvg * 4) / 4)} a ${fmtHours(Math.round(m.sleepAvg * 4) / 4)} en promedio.` });
    else if (m.sleepAvg < goal - 0.5) add({ id: 'sueno', kind: 'improve', area: 'salud', icon: 'moon', score: 0.5 + (goal - m.sleepAvg) / goal, title: `Dormiste ${fmtHours(Math.round(m.sleepAvg * 4) / 4)} en promedio (tu meta: ${fmtHours(goal)})`, text: `Te faltaron ${fmtHours(m.debt)} en la semana.`, tip: bed ? `Acuéstate a las ${clock(bed)} para dormir lo que necesitas.` : 'Adelanta 30 minutos tu hora de acostarte unos días.', action: bed ? { kind: 'mission', label: 'Crear misión', mission: { title: `Acostarme a las ${clock(bed)}`, area: 'salud', cost: 1, kind: 'habit' } } : null, focus: focusOf('sleep_nights', 5) });
  }
  if (m.bedSpread != null && m.bedSpread > 90) add({ id: 'horario', kind: 'improve', area: 'salud', icon: 'clock', score: 0.5 + Math.min(0.3, (m.bedSpread - 90) / 300), title: `Te acostaste a horas muy distintas (hasta ${fmtHours(Math.round(m.bedSpread / 15) / 4)} de diferencia)`, text: 'Dormir con horario parejo importa tanto como las horas.', tip: 'Una hora fija para acostarte, más o menos media hora, también el fin de semana.', focus: focusOf('bed_regular', 60) });
  // Preparación.
  if (m.readyN >= 3) {
    if (m.red >= 2) add({ id: 'preparacion', kind: 'improve', area: 'salud', icon: 'heart', score: 0.5 + m.red * 0.05, title: `${m.red} días en rojo de preparación`, text: 'Tu cuerpo pidió descanso más de una vez.', tip: 'Mira «Qué te ayuda y qué te afecta» en Salud: ahí ves qué baja tu preparación.', action: { kind: 'route', href: '#/area/salud', label: 'Ver mi salud' } });
    else if (m.green >= 4) add({ id: 'preparacion', kind: 'win', area: 'salud', icon: 'heart', score: 0.45, title: `${m.green} días en verde`, text: `Preparación promedio de ${m.readyAvg}.` });
  }
  // Actividad.
  const anyEx = m.equiv > 0 || (prev && prev.equiv > 0) || (avg4 && avg4.equiv > 0);
  if (m.equiv >= 150) add({ id: 'actividad', kind: 'win', area: 'salud', icon: 'dumbbell', score: 0.65, title: `${m.equiv} minutos de actividad`, text: 'Cumpliste lo que recomienda la OMS (150 a la semana; los intensos cuentan doble).' });
  else if (full && m.equiv < 75) add({ id: 'actividad', kind: 'improve', area: 'salud', icon: 'dumbbell', score: 0.45 + (150 - m.equiv) / 400, title: m.equiv ? `${m.equiv} minutos de actividad` : 'Sin actividad registrada', text: 'La OMS recomienda 150 minutos a la semana.', tip: 'Tres caminatas de 25 minutos ya son la mitad.', action: { kind: 'mission', label: 'Crear misión', mission: { title: 'Caminar 25 minutos', area: 'salud', cost: 1, kind: 'habit', days: [1, 3, 5] } }, focus: focusOf('active_min', 150) });
  if (anyEx && full) {
    if (m.strength >= 2) add({ id: 'fuerza', kind: 'win', area: 'salud', icon: 'dumbbell', score: 0.45, title: `Fuerza ${m.strength} días`, text: 'Los músculos fuertes cuidan tus huesos y tu azúcar.' });
    else if (m.strength === 0) add({ id: 'fuerza', kind: 'improve', area: 'salud', icon: 'dumbbell', score: 0.4, title: 'Ningún día de fuerza', text: 'La OMS pide 2 días a la semana.', tip: 'La rutina de fuerza en casa dura 20 minutos y no necesita equipo.', action: { kind: 'route', href: '#/area/salud?rutina=fuerza20', label: 'Empezar la rutina' }, focus: focusOf('strength_days', 2) });
  }
  if (m.load && m.load.status === 'salto') add({ id: 'carga', kind: 'improve', area: 'salud', icon: 'bolt', score: 0.5, title: 'Subiste tu carga de golpe', text: `Esta semana hiciste más de 1.5 veces lo que solías (carga ${m.load.sum7}).`, tip: 'Sube de a poco: así el cuerpo se adapta y no te lesionas.' });
  if (m.stepsN >= 4) {
    const sg = Math.max(7000, Number(s.profile.goals && s.profile.goals.steps) || 0);
    if (m.stepsAvg >= sg) add({ id: 'pasos', kind: 'win', area: 'salud', icon: 'pulse', score: 0.45, title: `${m.stepsAvg.toLocaleString('en-US')} pasos al día`, text: 'Más de 7,000 al día se asocia con menos riesgo de muchas enfermedades.' });
    else if (m.stepsAvg < 5000) add({ id: 'pasos', kind: 'improve', area: 'salud', icon: 'pulse', score: 0.4, title: `${m.stepsAvg.toLocaleString('en-US')} pasos al día`, text: 'Pasar de pocos pasos a unos 7,000 trae casi todo el beneficio.', tip: 'Una caminata de 15 minutos después de comer suma unos 1,500.', focus: focusOf('steps_avg', 7000) });
  }
  if (m.vegN >= 4) {
    if (m.vegAvg >= 5) add({ id: 'frutas', kind: 'win', area: 'salud', icon: 'sprout', score: 0.4, title: `${m.vegAvg} porciones de frutas y verduras al día`, text: 'Llegaste a lo que recomienda la OMS.' });
    else if (m.vegAvg < 3) add({ id: 'frutas', kind: 'improve', area: 'salud', icon: 'sprout', score: 0.35, title: `${m.vegAvg} porciones de frutas y verduras al día`, text: 'La OMS recomienda unas 5.', tip: 'Una fruta en el desayuno y vegetales en el almuerzo ya son 2 más.', focus: focusOf('veg_avg', 4) });
  }
  if (m.meds.total >= 5 && m.meds.pct != null) {
    if (m.meds.pct < 0.8) add({ id: 'medicinas', kind: 'improve', area: 'salud', icon: 'pill', score: 0.6, title: `Marcaste ${pctTxt(m.meds.pct)} de tus tomas`, text: `${m.meds.taken} de ${m.meds.total}.`, tip: '¿Las horas te quedan bien? Ajústalas en Salud o activa el aviso de medicinas.', action: { kind: 'route', href: '#/area/salud', label: 'Ver mis medicinas' }, focus: focusOf('meds_pct', 0.9) });
    else if (m.meds.pct >= 0.95) add({ id: 'medicinas', kind: 'win', area: 'salud', icon: 'pill', score: 0.35, title: 'Tus medicinas, a su hora', text: `${m.meds.taken} de ${m.meds.total} tomas.` });
  }
  if (m.bp && m.bp.n >= 3 && m.bp.cat && ['etapa1', 'etapa2', 'crisis'].includes(m.bp.cat.key)) add({ id: 'presion', kind: 'improve', area: 'salud', icon: 'heart', score: 0.7, title: `Tu presión en casa: ${m.bp.sys}/${m.bp.dia} (${m.bp.cat.label.toLowerCase()})`, text: `Promedio de ${m.bp.n} lecturas.`, tip: 'Llévale estas lecturas a tu médico: con eso decide mejor.', action: { kind: 'todo', label: 'Agregar pendiente', todo: { title: 'Llevar mis lecturas de presión al médico', src: `rep:bp:${m.wk}` } } });
  for (const sg of labSuggestions(s, today).filter((x) => x.kind === 'medico')) add({ id: 'analisis', kind: 'improve', area: 'salud', icon: 'flask', score: 0.65, title: 'Resultados fuera de rango sin revisar', text: sg.text, action: { kind: 'todo', label: 'Agregar pendiente', todo: { title: sg.todo, src: sg.src } } });
  // Emociones.
  if (m.checkins >= 3 && m.pleasant != null) {
    if (m.pleasant >= 0.6 && (!prev || prev.pleasant == null || m.pleasant >= prev.pleasant - 0.05)) add({ id: 'animo', kind: 'win', area: 'emocional', icon: 'face', score: 0.45 + (m.pleasant - 0.6), title: `${pctTxt(m.pleasant)} de tus check-ins fueron agradables`, text: m.topWord ? `La emoción que más nombraste: ${m.topWord.toLowerCase()}.` : `${m.checkins} check-ins en la semana.` });
    else if (m.pleasant < 0.4) add({ id: 'animo', kind: 'improve', area: 'emocional', icon: 'face', score: 0.5 + (0.4 - m.pleasant), title: `${pctTxt(m.pleasant)} de tus check-ins fueron agradables`, text: m.topWord ? `Lo que más nombraste: ${m.topWord.toLowerCase()}.` : 'Fue una semana pesada.', tip: 'La pausa SOS de 3 minutos y tus cartas para días difíciles están en Calma. Si te sientes así muchos días, habla con alguien de confianza o con un profesional.', action: { kind: 'route', href: '#/calma', label: 'Ir a Calma' }, focus: focusOf('calm_min', 35) });
  } else if (m.checkins === 0 && full && ((prev && prev.checkins > 0) || (avg4 && avg4.checkins > 0))) add({ id: 'animo', kind: 'improve', area: 'emocional', icon: 'face', score: 0.3, title: 'Sin check-ins de ánimo', text: 'Esta semana no anotaste cómo te sentías.', tip: 'Un check-in de 20 segundos al día te deja ver qué te sube y qué te baja.', action: { kind: 'route', href: '#/animo', label: 'Hacer un check-in' }, focus: focusOf('checkins', 5) });
  if (m.calm >= 35) add({ id: 'calma', kind: 'win', area: 'emocional', icon: 'sparkle', score: 0.4, title: `${m.calm} minutos de calma`, text: 'Respirar y meditar seguido baja el estrés con el tiempo.' });
  if (full && m.posada <= 2 && Object.keys(s.inn || {}).length >= 3) add({ id: 'posada', kind: 'improve', area: 'emocional', icon: 'moon', score: 0.3, title: `Cerraste el día ${m.posada === 1 ? '1 noche' : `${m.posada} noches`}`, text: 'La posada te ayuda a soltar el día y preparar la noche.', tip: 'Tres cosas buenas y tu hora de dormir: 2 minutos.', focus: focusOf('posada_nights', 5) });
  // Finanzas.
  if (avg4 && avg4.spent > 0 && avg4.n >= 2) {
    const ratio = m.spent / avg4.spent;
    const top = m.cats[0];
    if (full && ratio > 1.25 && m.spent - avg4.spent >= 2000) add({ id: 'gasto', kind: 'improve', area: 'finanzas', icon: 'wallet', score: 0.5 + Math.min(0.3, ratio - 1.25), title: `Gastaste ${rd(m.spent)}: ${Math.round((ratio - 1) * 100)} % más que tu promedio`, text: `Tu promedio de 4 semanas es ${rd(avg4.spent)}.${top ? ` Lo que más pesó: ${top.name.toLowerCase()} (${rd(top.amount)}).` : ''}`, tip: top ? `Mira ${top.name.toLowerCase()} en Movimientos y, si se repite, ponle presupuesto.` : 'Revisa tus movimientos de la semana.', action: { kind: 'route', href: '#/finanzas?tab=analisis', label: 'Ver el análisis' }, focus: focusOf('spend_cap', Math.round(avg4.spent / 100) * 100) });
    else if (full && ratio < 0.85 && avg4.spent - m.spent >= 1000) add({ id: 'gasto', kind: 'win', area: 'finanzas', icon: 'piggy', score: 0.5, title: `Gastaste ${Math.round((1 - ratio) * 100)} % menos que tu promedio`, text: `${rd(m.spent)} frente a ${rd(avg4.spent)}.` });
  }
  if (s.money && full) {
    const mk = m.to.slice(0, 7);
    const over = budgetRows(s, mk, m.to).filter((r) => r.budget > 0 && r.spent > r.avail);
    if (over.length) add({ id: 'presupuesto', kind: 'improve', area: 'finanzas', icon: 'wallet', score: 0.45, title: `Te pasaste en ${over.length === 1 ? '1 presupuesto' : `${over.length} presupuestos`} del mes`, text: over.slice(0, 3).map((r) => `${r.c.name} (${rd(r.spent)} de ${rd(r.avail)})`).join(', ') + '.', tip: 'Ajusta lo que queda del mes o mueve dinero de otra categoría.', action: { kind: 'route', href: '#/finanzas?tab=plan', label: 'Ver el plan' } });
  }
  // Relaciones.
  const due = duePeople(s, today).length;
  if (m.contacts >= 3) add({ id: 'personas', kind: 'win', area: 'relaciones', icon: 'people', score: 0.35, title: `Hablaste con ${m.contacts} personas de tu lista`, text: 'Cuidar los vínculos también es salud.' });
  else if (full && m.contacts === 0 && due >= 2) add({ id: 'personas', kind: 'improve', area: 'relaciones', icon: 'people', score: 0.35, title: `${due} personas esperan saber de ti`, text: 'Esta semana no anotaste ningún contacto.', tip: 'Un mensaje corto cuenta.', action: { kind: 'route', href: '#/personas', label: 'Ver a quién le toca' }, focus: focusOf('contacts', 2) });
  // Crecimiento y trabajo.
  if (m.pages >= 50) add({ id: 'lectura', kind: 'win', area: 'crecimiento', icon: 'book', score: 0.3, title: `Leíste ${m.pages} páginas`, text: `${m.readDays} ${m.readDays === 1 ? 'día' : 'días'} de lectura.` });
  if (m.focusMin >= 150) add({ id: 'enfoque', kind: 'win', area: 'laborales', icon: 'timer', score: 0.35, title: `${fmtHours(Math.round(m.focusMin / 15) / 4)} de enfoque`, text: `${m.focusN} sesiones sin distraerte.` });
  if (m.wins >= 1) add({ id: 'logros', kind: 'win', area: 'laborales', icon: 'trophy', score: 0.3 + Math.min(0.2, m.wins * 0.05), title: `Anotaste ${m.wins === 1 ? 'un logro' : `${m.wins} logros`}`, text: 'Te van a servir en tu evaluación y tu hoja de vida.' });
  // Pendientes.
  if (m.overdue >= 5) add({ id: 'pendientes', kind: 'improve', area: 'crecimiento', icon: 'list', score: 0.45 + Math.min(0.2, m.overdue / 50), title: `${m.overdue} pendientes vencidos`, text: 'Cuando se acumulan, pesan aunque no los mires.', tip: 'Pasa los urgentes a hoy y ponles fecha real a los demás (o bórralos).', action: { kind: 'route', href: '#/pendientes', label: 'Ver pendientes' }, focus: focusOf('overdue_zero', 0) });
  else if (m.todosDone >= 10) add({ id: 'pendientes', kind: 'win', area: 'crecimiento', icon: 'list', score: 0.35, title: `${m.todosDone} pendientes terminados`, text: 'Menos cosas dando vueltas en la cabeza.' });
  return out;
}

const clock = (t) => { const m = timeToMin(t); if (m == null) return t; const h = Math.floor(m / 60); return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`; };

// Hasta `n` con el puntaje más alto, uno por área.
function pick(list, n) {
  const out = []; const areas = new Set();
  for (const x of [...list].sort((a, b) => b.score - a.score)) {
    if (areas.has(x.area) && list.filter((y) => !areas.has(y.area)).length) continue;
    out.push(x); areas.add(x.area);
    if (out.length >= n) break;
  }
  return out;
}

// ---------- El informe ----------

export function weeklyReport(s, wk, today) {
  const m = weekMetrics(s, wk, today);
  const prev = weekMetrics(s, addDays(wk, -7), today);
  const past = [1, 2, 3, 4].map((i) => weekMetrics(s, addDays(wk, -7 * i), today)).filter((x) => x.days > 0);
  const withSpend = past.filter((x) => x.spent > 0);
  const avg4 = past.length ? {
    pct: avgOf(past, 'pct'), sleepAvg: avgOf(past, 'sleepAvg'), equiv: avgOf(past, 'equiv'), spent: withSpend.length ? mean(withSpend.map((x) => x.spent)) : 0, n: withSpend.length,
    pleasant: avgOf(past, 'pleasant'), checkins: avgOf(past, 'checkins'), xp: avgOf(past, 'xp'),
  } : null;
  const cand = candidates(s, m, prev.days ? prev : null, avg4, today);
  const wins = pick(cand.filter((x) => x.kind === 'win'), 3);
  const improve = pick(cand.filter((x) => x.kind === 'improve'), 3);
  const current = wk === weekOf(today);
  const complete = !current || (weekday(today) === 0);
  const rep = s.reports || {};
  const focusPrev = rep.focus && rep.focus[wk] ? { ...rep.focus[wk], ...focusEval(rep.focus[wk], m), claimed: !!(rep.claimed && rep.claimed[wk]) } : null;
  const focusNext = rep.focus && rep.focus[addDays(wk, 7)] ? rep.focus[addDays(wk, 7)] : null;
  const next = addDays(wk, 7);
  const bills = s.money ? dueItems(s, next, addDays(next, 6), today).filter((it) => !it.estimate).slice(0, 6) : [];
  const empty = !m.done && !m.sleepN && !m.checkins && !m.spent && !m.equiv && !m.todosDone;
  return {
    wk, label: weekLabel(wk), from: m.from, to: m.to, current, complete, empty, m, prev: prev.days ? prev : null, avg4,
    wins, improve, focusPrev, focusNext, bills, sentence: sentence(wins, improve, empty), sections: sections(s, m, prev.days ? prev : null),
  };
}

// Lo que toca la próxima semana, en pocas palabras.
const NEXT_TXT = {
  misiones: 'cumplir más misiones', sueno: 'dormir un poco más', horario: 'acostarte a la misma hora', preparacion: 'recuperarte mejor',
  actividad: 'moverte más', fuerza: 'sumar días de fuerza', carga: 'subir la carga de a poco', pasos: 'caminar más', frutas: 'más frutas y verduras',
  medicinas: 'tus medicinas a su hora', presion: 'llevar tu presión al médico', analisis: 'revisar tus análisis con tu médico', animo: 'cuidar tu ánimo',
  posada: 'cerrar el día en la posada', gasto: 'gastar más cerca de tu promedio', presupuesto: 'ajustar tus presupuestos', personas: 'escribirle a tu gente',
  pendientes: 'ponerte al día con los pendientes',
};

function sentence(wins, improve, empty) {
  if (empty) return 'Todavía no hay datos de esta semana. Registra tu día y aquí verás tu progreso.';
  const w = wins[0]; const i = improve[0];
  const nx = (x) => NEXT_TXT[x.id] || lowerFirst(x.title);
  if (w && i) return `Lo mejor: ${lowerFirst(w.title)}. Para la próxima: ${nx(i)}${improve[1] ? ` y ${nx(improve[1])}` : ''}.`;
  if (w) return `Lo mejor: ${lowerFirst(w.title)}. ${wins.length > 1 ? `Y ${lowerFirst(wins[1].title)}.` : 'Sigue así.'}`;
  if (i) return `Para la próxima: ${nx(i)}${improve[1] ? ` y ${nx(improve[1])}` : ''}.`;
  return 'Una semana tranquila: sin grandes cambios.';
}
const lowerFirst = (t) => (t && /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);

// Cambio frente a la semana anterior, en texto corto.
function cmp(a, b, { unit = '', better = 'up', fmt = (v) => String(v) } = {}) {
  if (a == null || b == null) return null;
  const d = a - b;
  if (Math.abs(d) < 1e-9) return { text: 'igual que la anterior', tone: '' };
  const good = better === 'up' ? d > 0 : better === 'down' ? d < 0 : null;
  return { text: `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}${unit} vs. la anterior`, tone: good == null ? '' : good ? 'good' : 'vit' };
}

function sections(s, m, p) {
  const goal = Number(s.profile.sleepGoal) || 7;
  const hh = (v) => fmtHours(Math.round(v * 4) / 4);
  const rows = (list) => list.filter((r) => r && r.value != null && r.value !== '');
  return [
    {
      key: 'salud', title: 'Salud', icon: 'pulse', area: 'salud', rows: rows([
        m.sleepN ? { label: 'Sueño promedio', value: hh(m.sleepAvg), note: `${m.sleepGoalNights} de ${m.sleepN} noches en tu meta (${fmtHours(goal)})`, cmp: p && cmp(m.sleepAvg, p.sleepAvg, { fmt: hh }) } : null,
        m.bedSpread != null ? { label: 'Horario de dormir', value: `±${Math.round(m.bedSpread / 2)} min`, note: 'diferencia al acostarte', cmp: p && p.bedSpread != null && cmp(Math.round(m.bedSpread / 2), Math.round(p.bedSpread / 2), { unit: ' min', better: 'down' }) } : null,
        m.readyN ? { label: 'Preparación promedio', value: `${m.readyAvg}`, note: `${m.green} en verde · ${m.red} en rojo`, cmp: p && p.readyAvg != null && cmp(m.readyAvg, p.readyAvg) } : null,
        { label: 'Actividad', value: `${m.equiv} min`, note: `meta de la OMS: 150 · fuerza ${m.strength} ${m.strength === 1 ? 'día' : 'días'}`, cmp: p && cmp(m.equiv, p.equiv, { unit: ' min' }) },
        m.stepsN ? { label: 'Pasos al día', value: m.stepsAvg.toLocaleString('en-US'), cmp: p && p.stepsAvg != null && cmp(m.stepsAvg, p.stepsAvg, { fmt: (v) => Math.round(v).toLocaleString('en-US') }) } : null,
        m.vegN ? { label: 'Frutas y verduras', value: `${m.vegAvg} al día`, note: 'la OMS recomienda 5' } : null,
        m.meds.total ? { label: 'Medicinas tomadas', value: pctTxt(m.meds.pct), note: `${m.meds.taken} de ${m.meds.total}` } : null,
        m.bp.n ? { label: 'Presión en casa', value: `${m.bp.sys}/${m.bp.dia}`, note: `${m.bp.cat.label} · ${m.bp.n} lecturas` } : null,
      ]),
    },
    {
      key: 'mente', title: 'Mente y emociones', icon: 'face', area: 'emocional', rows: rows([
        m.checkins ? { label: 'Check-ins agradables', value: pctTxt(m.pleasant), note: `${m.checkins} check-ins${m.topWord ? ` · lo que más sentiste: ${m.topWord.toLowerCase()}` : ''}`, cmp: p && p.pleasant != null && cmp(Math.round(m.pleasant * 100), Math.round(p.pleasant * 100), { unit: ' puntos' }) } : { label: 'Check-ins de ánimo', value: '0' },
        { label: 'Calma', value: `${m.calm} min`, cmp: p && cmp(m.calm, p.calm, { unit: ' min' }) },
        { label: 'Noches en la posada', value: `${m.posada} de ${m.days}`, note: m.goods ? `${m.goods} cosas buenas anotadas` : '' },
        m.journal ? { label: 'Diario', value: `${m.journal} ${m.journal === 1 ? 'entrada' : 'entradas'}` } : null,
      ]),
    },
    {
      key: 'finanzas', title: 'Finanzas', icon: 'wallet', area: 'finanzas', rows: rows([
        { label: 'Gastos', value: rd(m.spent), cmp: p && cmp(m.spent, p.spent, { better: 'down', fmt: rd }) },
        m.income ? { label: 'Ingresos', value: rd(m.income) } : null,
        m.cats.length ? { label: 'En qué se fue', value: m.cats.slice(0, 3).map((c) => `${c.name} ${rd(c.amount)}`).join(' · ') } : null,
      ]),
    },
    {
      key: 'vida', title: 'Relaciones, crecimiento y trabajo', icon: 'sprout', area: 'crecimiento', rows: rows([
        { label: 'Contactos', value: `${m.contacts}` },
        m.pages ? { label: 'Lectura', value: `${m.pages} páginas`, note: `${m.readDays} días` } : null,
        m.practice ? { label: 'Práctica', value: `${m.practice} min` } : null,
        m.focusN ? { label: 'Enfoque', value: hh(m.focusMin / 60), note: `${m.focusN} sesiones` } : null,
        m.wins ? { label: 'Logros anotados', value: `${m.wins}` } : null,
      ]),
    },
    {
      key: 'dia', title: 'Misiones, pendientes y hogar', icon: 'sword', area: 'laborales', rows: rows([
        m.planned ? { label: 'Misiones cumplidas', value: pctTxt(m.pct), note: `${m.done} de ${m.planned}`, cmp: p && p.pct != null && cmp(Math.round(m.pct * 100), Math.round(p.pct * 100), { unit: ' puntos' }) } : null,
        { label: 'XP ganada', value: `+${m.xp.toLocaleString('en-US')}`, cmp: p && cmp(m.xp, p.xp, { fmt: (v) => Math.round(v).toLocaleString('en-US') }) },
        { label: 'Pendientes hechos', value: `${m.todosDone}`, note: m.overdue ? `${m.overdue} vencidos` : 'ninguno vencido' },
        m.chores ? { label: 'Tareas del hogar', value: `${m.chores}` } : null,
      ]),
    },
  ];
}

// ---------- Foco de la semana ----------

// Lo que se acumula (noches, minutos, días, contactos) cuenta apenas llegas a la meta; lo demás (promedios,
// porcentajes y topes como «gastar como mucho») solo se confirma con la semana completa: el lunes todavía
// no has gastado nada y eso no es cumplir.
export function focusEval(f, m) {
  const def = f && FOCUS[f.key];
  if (!def || !m) return { done: false, value: null, pending: false };
  const ok = !!def.test(m, f.target);
  const full = m.to === addDays(m.wk, 6);
  return { done: ok && (!!def.sum || full), value: def.val(m), pending: ok && !def.sum && !full };
}

export function ensureReports(s) {
  if (!isObj(s.reports)) s.reports = {};
  const r = s.reports;
  for (const k of ['seen', 'focus', 'claimed']) if (!isObj(r[k])) r[k] = {};
  for (const [wk, f] of Object.entries(r.focus)) if (!isObj(f) || !FOCUS[f.key]) delete r.focus[wk];
  // Solo las últimas 104 semanas.
  for (const k of ['seen', 'focus', 'claimed']) {
    const keys = Object.keys(r[k]).sort();
    for (const old of keys.slice(0, Math.max(0, keys.length - 104))) delete r[k][old];
  }
}

export function markSeen(s, wk, today) {
  ensureReports(s);
  if (!s.reports.seen[wk]) s.reports.seen[wk] = today;
}

// Elegir el foco de la semana siguiente a la del informe (uno a la vez).
export function setFocus(s, wk, f, today) {
  ensureReports(s);
  const next = addDays(wk, 7);
  if (!f) { delete s.reports.focus[next]; return null; }
  if (!FOCUS[f.key]) return null;
  s.reports.focus[next] = { key: f.key, target: f.target, text: f.text || FOCUS[f.key].txt(f.target), area: FOCUS[f.key].area, set: today };
  return s.reports.focus[next];
}

// Si cumpliste el foco de esa semana: +30 XP en su área y +10 de oro (una vez).
export function claimFocus(s, wk, today, ev = []) {
  ensureReports(s);
  const f = s.reports.focus[wk];
  if (!f || s.reports.claimed[wk]) return false;
  const m = weekMetrics(s, wk, today);
  if (!focusEval(f, m).done) return false;
  s.reports.claimed[wk] = today;
  gainXP(s, AREA[f.area] ? f.area : 'crecimiento', 30, today, ev);
  addGold(s, 10, today);
  return true;
}

// ¿Mostrar el aviso «Tu informe está listo»? El domingo desde las 6 p. m. y hasta el miércoles, si no lo has visto.
export function reportDue(s, today, hour) {
  const wk = readyWeek(today, hour);
  if (s.profile.created && s.profile.created > addDays(wk, 4)) return null;
  if (s.reports && s.reports.seen && s.reports.seen[wk]) return null;
  const wd = weekday(today);
  if (!(wd === 0 && hour >= REPORT_HOUR) && !(wd >= 1 && wd <= 3)) return null;
  return wk;
}

// ---------- Tus últimas semanas ----------

// Las `n` semanas que terminan en `endWk` (por defecto, la de hoy).
export function reportTrend(s, today, n = 8, endWk = weekOf(today)) {
  const out = [];
  const cur = weekOf(endWk);
  for (let i = n - 1; i >= 0; i--) {
    const wk = addDays(cur, -7 * i);
    const m = weekMetrics(s, wk, today);
    out.push({ wk, pct: m.pct, sleep: m.sleepAvg, active: m.equiv, spent: m.spent, pleasant: m.pleasant, current: i === 0 });
  }
  return out;
}

// ---------- Texto para copiar o compartir ----------

export function reportText(rep, name = '') {
  const lines = [`Informe semanal de Astra${name ? ` · ${name}` : ''}`, `Semana del ${rep.label}${rep.current && !rep.complete ? ' (en curso)' : ''}`, '', rep.sentence];
  if (rep.wins.length) { lines.push('', 'Lo que salió bien:'); for (const w of rep.wins) lines.push(`• ${w.title}. ${w.text}`); }
  if (rep.improve.length) { lines.push('', 'Aspectos a mejorar:'); for (const i of rep.improve) lines.push(`• ${i.title}. ${i.text}${i.tip ? ` Prueba: ${i.tip}` : ''}`); }
  if (rep.focusPrev) lines.push('', `Foco de esta semana: ${rep.focusPrev.text} — ${rep.focusPrev.done ? 'cumplido' : rep.focusPrev.pending ? 'vas bien' : rep.complete ? 'no cumplido' : 'en curso'}.`);
  if (rep.focusNext) lines.push(`Foco de la próxima: ${rep.focusNext.text}.`);
  for (const sec of rep.sections) {
    if (!sec.rows.length) continue;
    lines.push('', `${sec.title}:`);
    for (const r of sec.rows) lines.push(`• ${r.label}: ${r.value}${r.note ? ` (${r.note})` : ''}${r.cmp ? ` · ${r.cmp.text}` : ''}`);
  }
  return lines.join('\n');
}

export { fmtShort };
