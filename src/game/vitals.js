// Salud al estilo WHOOP sin un reloj (1.17): preparación de hoy, carga, sueño que necesitas, señales vitales
// con tu rango normal, hábitos y su efecto, y hábitos de largo plazo.
//
// WHOOP, Oura y Garmin calculan la preparación con la variabilidad del pulso (VFC) medida toda la noche. Astra no
// tiene sensor, así que usa lo que sí sabes: cómo dormiste, cómo amaneces (energía, cuerpo, calma y ánimo, como el
// cuestionario de Hooper) y la carga de tus últimos días. Una revisión de 56 estudios (Saw, Main y Gastin, British
// Journal of Sports Medicine, 2016) encontró que estas respuestas reflejan la carga mejor que las medidas objetivas
// más usadas. Si tienes reloj o tensiómetro, el pulso en reposo y la VFC se suman al cálculo.
//
// La carga es el método sRPE de Foster (2001): minutos × qué tan duro fue (0 a 10).
import { addDays, diffDays, weekday } from '../app/dates.js';
import { uid, gainXP, getDay, timeToMin, minToTime, fmtHours } from './logic.js';
import { SLEEP_LATENCY_MIN, EXERCISE_WEEK_GOAL } from './content.js';
import { STRENGTH_WEEK_GOAL } from './health.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const r1 = (v) => Math.round(v * 10) / 10;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function sd(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}
const H = (s, d) => (s.health && s.health[d]) || {};

// ---------- Cómo amaneciste ----------

export const READY_ITEMS = [
  { key: 'e', label: 'Energía', q: '¿Cómo está tu energía?', low: 'Sin energía' },
  { key: 'c', label: 'Cuerpo', q: '¿Cómo está tu cuerpo? (dolor o rigidez)', low: 'Con dolor' },
  { key: 's', label: 'Calma', q: '¿Cuánta calma sientes? (poco estrés = muy bien)', low: 'Con estrés' },
  { key: 'a', label: 'Ánimo', q: '¿Cómo está tu ánimo?', low: 'Con el ánimo bajo' },
];
export const READY_SCALE = ['Muy mal', 'Mal', 'Normal', 'Bien', 'Muy bien'];

function setNum(h, key, v, lo, hi) {
  if (v === null || v === '' || v === undefined) { delete h[key]; return; }
  const n = Math.round(Number(v));
  if (Number.isFinite(n) && n >= lo && n <= hi) h[key] = n;
}

// Guarda cómo amaneciste (1 a 5 en cada pregunta), si te sientes enfermo y, si los tienes, pulso y VFC.
// +3 XP de Vigor la primera vez del día.
export function logReady(s, day, p, today, ev = []) {
  const h = s.health[day] || (s.health[day] = {});
  const r = {};
  for (const it of READY_ITEMS) { const v = Math.round(Number(p[it.key])); if (v >= 1 && v <= 5) r[it.key] = v; }
  if (p.sick) r.sick = true;
  if (Object.keys(r).length) h.ready = r;
  if (p.rhr !== undefined) setNum(h, 'rhr', p.rhr, 30, 140);
  if (p.hrv !== undefined) setNum(h, 'hrv', p.hrv, 5, 250);
  if (day === today) {
    const d = getDay(s, today);
    if (!d.readyXp && h.ready) { d.readyXp = true; gainXP(s, 'salud', 3, today, ev); }
  }
  return h;
}

// ---------- Carga (sRPE) ----------

// Escala de esfuerzo de Foster (CR-10), la que se usa para la carga.
export const RPE = [
  [2, 'Fácil', 'Podrías seguir mucho rato'],
  [3, 'Moderado', 'Respiras más rápido, pero hablas bien'],
  [4, 'Algo duro', 'Hablar ya cuesta un poco'],
  [5, 'Duro', 'Solo dices frases cortas'],
  [7, 'Muy duro', 'Casi no puedes hablar'],
  [9, 'Casi al máximo', 'No lo aguantarías mucho más'],
];
export const rpeDefault = (inten) => (inten === 'intensa' ? 6 : 3);

// Carga de un día: lo guardado (minutos × esfuerzo) o, en días de antes de la 1.17, estimada con la intensidad.
export function dayLoad(h) {
  if (!h) return 0;
  if (h.load != null) return Math.round(h.load);
  const ex = Number(h.exercise) || 0;
  const vig = Math.min(ex, Number(h.exVig) || 0);
  return Math.round((ex - vig) * 3 + vig * 6);
}

const LEVELS = [[0.5, 'ligera'], [1.2, 'moderada'], [1.8, 'alta'], [Infinity, 'muy alta']];

// Tu carga: hoy, los últimos 7 días y frente a tu promedio de 4 semanas (carga aguda y crónica).
export function loadInfo(s, today) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((d) => ({ day: d, load: dayLoad(H(s, d)) }));
  const sum7 = days.reduce((a, x) => a + x.load, 0);
  const prev = Array.from({ length: 28 }, (_, i) => dayLoad(H(s, addDays(today, -28 + i))));
  const active = prev.filter((x) => x > 0);
  const avg28 = prev.reduce((a, b) => a + b, 0) / 28;
  const activeAvg = active.length ? mean(active) : null;
  const ratio = active.length >= 3 && avg28 > 0 ? sum7 / (avg28 * 7) : null;
  const status = ratio == null ? 'nuevo' : ratio > 1.5 ? 'salto' : ratio > 1.1 ? 'subiendo' : ratio >= 0.8 ? 'estable' : 'bajando';
  const lv = (load) => {
    if (!load) return 'descanso';
    if (activeAvg) return (LEVELS.find(([top]) => load / activeAvg < top) || LEVELS[3])[1];
    return load < 100 ? 'ligera' : load < 250 ? 'moderada' : load < 450 ? 'alta' : 'muy alta';
  };
  const todayLoad = days[6].load;
  return { days, sum7, avg28: Math.round(avg28), activeAvg: activeAvg ? Math.round(activeAvg) : null, ratio: ratio != null ? Math.round(ratio * 100) / 100 : null, status, today: todayLoad, level: lv(todayLoad), levelOf: lv };
}

export const LOAD_STATUS = {
  nuevo: 'Registra unas semanas de actividad y verás si tu carga sube o baja.',
  salto: 'Subiste la carga de golpe: más de 1.5 veces lo que solías hacer. Sube de a poco para que el cuerpo se adapte y no te lesiones.',
  subiendo: 'Estás construyendo: un poco más que tus últimas semanas, sin pasarte.',
  estable: 'Carga estable: parecida a la de tus últimas 4 semanas.',
  bajando: 'Bajaste la carga. Si estás descansando a propósito, perfecto; si no, retoma poco a poco.',
};

// ---------- Sueño que necesitas (como el Sleep Planner de WHOOP) ----------

// Para la noche que empieza el día `day`: tu meta + una parte de la deuda de los últimos 7 días + el esfuerzo del día
// − la siesta. La deuda se paga de a poco (hasta 1 hora extra por noche), sin «dormir de más» el fin de semana.
export function sleepNeed(s, day) {
  const goal = Number(s.profile.sleepGoal) || 7;
  let debt = 0;
  for (let i = 0; i < 7; i++) { const h = H(s, addDays(day, -i)); if (h.sleep != null) debt += Math.max(0, goal - h.sleep); }
  const debtAdd = Math.min(1, Math.round(debt * 0.25 * 12) / 12);
  const li = loadInfo(s, day);
  const rel = li.activeAvg ? li.today / li.activeAvg : 0;
  const strainAdd = li.today > 0 && rel >= 2 ? 0.5 : li.today > 0 && rel >= 1.5 ? 0.25 : 0;
  const dd = s.days && s.days[day];
  const napMin = Math.round(Number(H(s, day).nap) || (dd && dd.potions && dd.potions.siesta ? 20 : 0));
  // La siesta resta, pero nunca deja la noche en menos de tu meta − 30 min. Todo en minutos
  // enteros para que «meta + deuda − siesta» sume exactamente lo que se muestra.
  const napSub = Math.min(napMin / 60, 0.5 + debtAdd + strainAdd);
  const need = Math.round((goal + debtAdd + strainAdd - napSub) * 60) / 60;
  return { goal, debt: Math.round(debt * 4) / 4, debtAdd, strainAdd, napSub, need };
}

// A qué hora acostarte para dormir lo que necesitas y levantarte a tu hora.
export function bedtimeForNeed(s, wake, need) {
  const w = timeToMin(wake);
  if (w == null) return null;
  return minToTime(w - Math.round(need * 60) - SLEEP_LATENCY_MIN);
}

export function needText(n) {
  let t = `tu meta de ${fmtHours(n.goal)}`;
  if (n.debtAdd > 0) t += ` + ${Math.round(n.debtAdd * 60)} min para ponerte al día`;
  if (n.strainAdd > 0) t += ` + ${Math.round(n.strainAdd * 60)} min por el esfuerzo de hoy`;
  if (n.napSub > 0) t += ` − ${Math.round(n.napSub * 60)} min de siesta`;
  return t;
}

// ---------- Tu rango normal ----------

// Promedio y desviación de los últimos `days` días (sin contar hoy).
export function baseline(s, key, today, days = 30, fn = (h) => h[key]) {
  const xs = [];
  for (let i = 1; i <= days; i++) { const v = fn(H(s, addDays(today, -i))); if (v != null && Number.isFinite(Number(v))) xs.push(Number(v)); }
  const m = mean(xs);
  return { n: xs.length, mean: m, sd: sd(xs) };
}

// ---------- Preparación de hoy ----------

export const ZONES = {
  verde: { label: 'Lista para exigirte', tone: 'good', effort: 'Buen día para entrenar fuerte o para tu tarea más difícil.' },
  amarillo: { label: 'Ve a un ritmo medio', tone: 'xp', effort: 'Entrena, pero sin buscar récords. Cuida tu hora de dormir.' },
  rojo: { label: 'Prioriza recuperarte', tone: 'vit', effort: 'Hoy, suave: caminata, movilidad o descanso. Acuéstate temprano.' },
};

// Preparación de hoy de 0 a 100, con lo que sumó y lo que restó. null si no hay sueño ni check-in del día.
export function readiness(s, day) {
  const h = H(s, day);
  const parts = [];
  const nd = sleepNeed(s, addDays(day, -1));
  if (h.sleep != null) {
    const ratio = h.sleep / nd.need;
    let sc = clamp((ratio - 0.6) / 0.4, 0, 1) * 100;
    if (h.quality >= 1 && h.quality <= 4) sc += [-15, -5, 0, 5][h.quality - 1];
    parts.push({ key: 'sleep', w: 35, score: clamp(Math.round(sc), 0, 100), text: `Dormiste ${fmtHours(h.sleep)} de ${fmtHours(nd.need)} que necesitabas` });
  }
  const r = isObj(h.ready) ? h.ready : null;
  const vals = r ? READY_ITEMS.map((it) => r[it.key]).filter((v) => v >= 1 && v <= 5) : [];
  if (vals.length) {
    const sc = ((mean(vals) - 1) / 4) * 100;
    const low = READY_ITEMS.filter((it) => r[it.key] && r[it.key] <= 2).map((it) => it.low.toLowerCase());
    parts.push({ key: 'ready', w: 35, score: Math.round(sc), text: low.length ? `Amaneciste ${low.join(' y ')}` : mean(vals) >= 4 ? 'Amaneciste bien' : 'Amaneciste normal' });
  }
  if (!parts.length) return null;
  const li = loadInfo(s, addDays(day, -1));
  if (li.activeAvg) {
    const y = li.today;
    const rel = y / li.activeAvg;
    const sc = !y ? 100 : rel <= 1.2 ? 100 : rel >= 2.5 ? 30 : Math.round(100 - ((rel - 1.2) / 1.3) * 70);
    parts.push({ key: 'load', w: 15, score: sc, text: !y ? 'Ayer descansaste' : rel > 1.2 ? `Ayer tu carga fue ${rel >= 2 ? 'el doble o más' : 'más alta'} de lo habitual` : 'Ayer tu carga fue la de siempre' });
  }
  if (h.rhr) {
    const b = baseline(s, 'rhr', day);
    if (b.n >= 5) {
      const z = (h.rhr - b.mean) / Math.max(b.sd || 0, 2);
      parts.push({ key: 'rhr', w: 15, score: clamp(Math.round(100 - Math.max(0, z) * 25), 0, 100), text: z >= 1 ? `Tu pulso en reposo está ${Math.round(h.rhr - b.mean)} más alto que tu normal` : 'Tu pulso en reposo está en tu normal' });
    }
  }
  if (h.hrv) {
    const b = baseline(s, 'hrv', day, 30, (x) => (x.hrv ? Math.log(x.hrv) : null));
    if (b.n >= 5) {
      const z = (Math.log(h.hrv) - b.mean) / Math.max(b.sd || 0, 0.05);
      parts.push({ key: 'hrv', w: 20, score: clamp(Math.round(75 + z * 25), 0, 100), text: z <= -1 ? 'Tu VFC está por debajo de tu normal' : z >= 1 ? 'Tu VFC está por encima de tu normal' : 'Tu VFC está en tu normal' });
    }
  }
  const W = parts.reduce((a, p) => a + p.w, 0);
  let score = Math.round(parts.reduce((a, p) => a + p.score * p.w, 0) / W);
  const sick = !!(r && r.sick);
  if (sick) score = Math.min(score, 33);
  const zone = score >= 67 ? 'verde' : score >= 34 ? 'amarillo' : 'rojo';
  const sorted = [...parts].sort((a, b) => a.score - b.score);
  return {
    score, zone, sick, parts, partial: !(h.sleep != null && vals.length),
    worst: sorted[0].score < 60 ? sorted[0] : null, best: sorted[sorted.length - 1].score >= 75 ? sorted[sorted.length - 1] : null,
  };
}

// ---------- Presión arterial (guía AHA/ACC 2025) ----------

export function bpCategory(sys, dia) {
  if (sys > 180 || dia > 120) return { key: 'crisis', label: 'Muy alta', tone: 'vit' };
  if (sys >= 140 || dia >= 90) return { key: 'etapa2', label: 'Alta (etapa 2)', tone: 'vit' };
  if (sys >= 130 || dia >= 80) return { key: 'etapa1', label: 'Alta (etapa 1)', tone: 'vit' };
  if (sys >= 120) return { key: 'elevada', label: 'Elevada', tone: 'xp' };
  return { key: 'normal', label: 'Normal', tone: 'good' };
}
export const BP_CRISIS = 'Si vuelve a salir así tras 5 minutos de reposo, llama a tu médico hoy. Si además tienes dolor de pecho, falta de aire, debilidad o cambios en la vista o el habla, llama al 911.';

export function addBP(s, day, p, today, ev = []) {
  const sys = Math.round(Number(p.sys)); const dia = Math.round(Number(p.dia));
  if (!(sys >= 60 && sys <= 260 && dia >= 30 && dia <= 160 && sys > dia)) return null;
  const h = s.health[day] || (s.health[day] = {});
  const t = timeToMin(p.time) != null ? minToTime(timeToMin(p.time)) : '08:00';
  const reading = { id: uid(), t, sys, dia };
  const pulse = Math.round(Number(p.pulse));
  if (pulse >= 30 && pulse <= 200) reading.pulse = pulse;
  h.bp = [...(Array.isArray(h.bp) ? h.bp : []), reading].sort((a, b) => (a.t < b.t ? -1 : 1)).slice(-12);
  if (day === today) {
    const d = getDay(s, today);
    if (!d.bpXp) { d.bpXp = true; gainXP(s, 'salud', 2, today, ev); }
  }
  return reading;
}

export function removeBP(s, day, id) {
  const h = s.health[day];
  if (!h || !Array.isArray(h.bp)) return;
  h.bp = h.bp.filter((r) => r.id !== id);
  if (!h.bp.length) delete h.bp;
}

const readingsIn = (s, from, to) => {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) for (const r of (Array.isArray(H(s, d).bp) ? H(s, d).bp : [])) out.push({ ...r, day: d });
  return out;
};

export function bpStats(s, today, days = 7) {
  const list = readingsIn(s, addDays(today, -(days - 1)), today);
  if (!list.length) return { n: 0, last: null };
  const sys = Math.round(mean(list.map((r) => r.sys)));
  const dia = Math.round(mean(list.map((r) => r.dia)));
  return { n: list.length, days: new Set(list.map((r) => r.day)).size, sys, dia, cat: bpCategory(sys, dia), last: list[list.length - 1] };
}

// Semana de presión: 2 tomas en la mañana y 2 en la noche durante 7 días; el promedio sin el primer día
// es tu presión en casa (como piden la AHA y otras guías). Lo que se mide en casa suele salir más bajo que en consulta.
export function bpWeekInfo(s, today) {
  const w = s.vitals && s.vitals.bpWeek;
  if (!w || !w.start) return null;
  const end = addDays(w.start, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(w.start, i)).map((d) => {
    const rs = Array.isArray(H(s, d).bp) ? H(s, d).bp : [];
    return { day: d, am: rs.filter((r) => r.t < '12:00').length, pm: rs.filter((r) => r.t >= '12:00').length };
  });
  const inWindow = readingsIn(s, addDays(w.start, 1), end);
  const done = today > end;
  const res = inWindow.length >= 4 ? { sys: Math.round(mean(inWindow.map((r) => r.sys))), dia: Math.round(mean(inWindow.map((r) => r.dia))) } : null;
  return { start: w.start, end, days, day: clamp(diffDays(w.start, today) + 1, 1, 8), done, n: inWindow.length, res, cat: res ? bpCategory(res.sys, res.dia) : null };
}

// ---------- Peso ----------

export const toKg = (v, unit) => (unit === 'lb' ? Number(v) * 0.45359237 : Number(v));
export const fromKg = (kg, unit) => (unit === 'lb' ? kg / 0.45359237 : kg);
export const weightUnit = (s) => (s.vitals && s.vitals.wunit === 'kg' ? 'kg' : 'lb');

export function logWeight(s, day, value, unit) {
  const kg = toKg(value, unit);
  if (!(kg >= 25 && kg <= 350)) return null;
  const h = s.health[day] || (s.health[day] = {});
  h.weight = r1(kg);
  if (!s.vitals) s.vitals = {};
  s.vitals.wunit = unit === 'kg' ? 'kg' : 'lb';
  return h.weight;
}

// Último peso y el cambio de tu promedio de 7 días frente a los 7 anteriores (sin metas de peso: solo la tendencia).
export function weightInfo(s, today) {
  let last = null;
  for (let i = 0; i < 120 && !last; i++) { const d = addDays(today, -i); if (H(s, d).weight) last = { day: d, kg: H(s, d).weight }; }
  const avg = (from, to) => mean(Array.from({ length: diffDays(from, to) + 1 }, (_, i) => H(s, addDays(from, i)).weight).filter(Boolean));
  const a = avg(addDays(today, -6), today);
  const b = avg(addDays(today, -13), addDays(today, -7));
  return { last, avg7: a, prev7: b, change: a != null && b != null ? r1(a - b) : null };
}

// ---------- Tus señales (como el Health Monitor de WHOOP o Signos vitales de Apple) ----------

export function signals(s, today) {
  const out = [];
  const latest = (key) => { for (let i = 0; i < 3; i++) { const d = addDays(today, -i); if (H(s, d)[key]) return { day: d, v: H(s, d)[key] }; } return null; };
  for (const [key, label, unit, bad] of [['rhr', 'Pulso en reposo', 'lpm', 1], ['hrv', 'VFC', 'ms', -1]]) {
    const l = latest(key);
    const b = baseline(s, key, l ? l.day : today);
    if (!l && !b.n) continue;
    const z = l && b.n >= 5 && b.sd ? (l.v - b.mean) / Math.max(b.sd, key === 'rhr' ? 2 : 3) : null;
    out.push({ key, label, unit, last: l, base: b, z, off: z != null && z * bad >= 1.5 });
  }
  return out;
}

// Varias señales fuera de lo habitual el mismo día (como el Symptom Radar de Oura): un aviso suave, no un diagnóstico.
export function radar(s, today) {
  const sig = signals(s, today);
  const rhr = sig.find((x) => x.key === 'rhr' && x.last && x.last.day === today && x.off);
  const hrv = sig.find((x) => x.key === 'hrv' && x.last && x.last.day === today && x.off);
  const r = H(s, today).ready;
  const lowMorning = isObj(r) && ((r.e && r.e <= 2) || r.sick);
  const n = [rhr, hrv, lowMorning].filter(Boolean).length;
  if (n < 2) return null;
  return { text: `${rhr ? 'Tu pulso en reposo está más alto que de costumbre' : 'Tu VFC está más baja que de costumbre'}${lowMorning ? ' y amaneciste con poca energía' : hrv && rhr ? ' y tu VFC más baja' : ''}. Puede ser cansancio, estrés o el inicio de un resfriado: hoy, suave, y bebe agua.` };
}

// ---------- Hábitos y su efecto (como el Journal de WHOOP) ----------

export const HABITS = [
  { key: 'alcohol', label: 'Alcohol', icon: 'glass' },
  { key: 'cafe', label: 'Café después de las 2 p. m.', icon: 'coffee' },
  { key: 'cena', label: 'Cena tarde o pesada', icon: 'utensils' },
  { key: 'pantallas', label: 'Pantallas en la cama', icon: 'phone' },
  { key: 'siesta', label: 'Siesta', icon: 'bed' },
  { key: 'noche', label: 'Ejercicio en la noche', icon: 'dumbbell' },
  { key: 'estres', label: 'Día muy estresante', icon: 'flame' },
  { key: 'sol', label: 'Sol en la mañana', icon: 'sun' },
  { key: 'lectura', label: 'Leí antes de dormir', icon: 'book' },
];
export const HABIT = Object.fromEntries(HABITS.map((x) => [x.key, x]));

// Guarda los hábitos del día: cada uno sí (1) o no (0), para poder comparar días con y sin.
export function setHabits(s, day, on) {
  const h = s.health[day] || (s.health[day] = {});
  const set = new Set(Array.isArray(on) ? on : Object.keys(on || {}).filter((k) => on[k]));
  h.habits = Object.fromEntries(HABITS.map((x) => [x.key, set.has(x.key) ? 1 : 0]));
  return h.habits;
}

const MIN_DAYS = 5;

// Qué pasa al día siguiente de cada hábito: tu preparación (o tus horas de sueño), con al menos 5 días de cada lado.
export function habitEffects(s, today, days = 90) {
  const rows = [];
  for (let i = 1; i <= days; i++) {
    const d = addDays(today, -i);
    const hb = H(s, d).habits;
    if (!isObj(hb)) continue;
    const next = addDays(d, 1);
    const rd = readiness(s, next);
    rows.push({ d, hb, ready: rd ? rd.score : null, sleep: H(s, next).sleep ?? null });
  }
  const out = [];
  for (const hab of HABITS) {
    for (const [metric, unit] of [['ready', 'puntos'], ['sleep', 'h']]) {
      const yes = rows.filter((r) => r.hb[hab.key] === 1 && r[metric] != null).map((r) => r[metric]);
      const no = rows.filter((r) => r.hb[hab.key] === 0 && r[metric] != null).map((r) => r[metric]);
      if (yes.length < MIN_DAYS || no.length < MIN_DAYS) continue;
      const diff = mean(yes) - mean(no);
      const big = metric === 'ready' ? Math.abs(diff) >= 5 : Math.abs(diff) >= 0.25;
      out.push({ key: hab.key, habit: hab, metric, diff: metric === 'ready' ? Math.round(diff) : Math.round(diff * 4) / 4, yes: yes.length, no: no.length, big, unit });
      break;
    }
  }
  return out.sort((a, b) => (b.big - a.big) || Math.abs(b.metric === 'ready' ? b.diff / 10 : b.diff) - Math.abs(a.metric === 'ready' ? a.diff / 10 : a.diff));
}

export function effectText(e) {
  const lab = e.habit.label.toLowerCase();
  const n = `(${e.yes} ${e.yes === 1 ? 'día' : 'días'} con, ${e.no} sin)`;
  if (!e.big) return `Con ${lab}, al día siguiente no se ve una diferencia clara ${n}.`;
  if (e.metric === 'ready') return `Los días con ${lab}, al día siguiente tu preparación fue ${Math.abs(e.diff)} puntos ${e.diff > 0 ? 'más alta' : 'más baja'} ${n}.`;
  return `Los días con ${lab}, esa noche dormiste ${fmtHours(Math.abs(e.diff))} ${e.diff > 0 ? 'más' : 'menos'} ${n}.`;
}

// ---------- Hábitos de largo plazo (como Healthspan de WHOOP, sin calcular una «edad») ----------

// Últimos 30 días frente a los 30 anteriores. Metas: sueño 7 a 9 h (AASM), horario parejo (±45 min), 150 min de
// actividad a la semana y fuerza 2 días (OMS), 7,000 pasos (Ding y colegas, Lancet Public Health 2025) y
// 5 porciones de frutas y verduras (OMS).
export function longTerm(s, today) {
  const win = (from, to) => Array.from({ length: diffDays(from, to) + 1 }, (_, i) => addDays(from, i));
  const cur = win(addDays(today, -29), today);
  const prv = win(addDays(today, -59), addDays(today, -30));
  const calc = (list) => {
    const hs = list.map((d) => H(s, d));
    const sl = hs.map((h) => h.sleep).filter((v) => v != null);
    const beds = hs.map((h) => timeToMin(h.bed)).filter((m) => m != null).map((m) => (m - 720 + 1440) % 1440);
    const st = hs.map((h) => h.steps).filter((v) => v != null);
    const vg = hs.map((h) => h.veg).filter((v) => v != null);
    const rh = hs.map((h) => h.rhr).filter(Boolean);
    const equiv = hs.reduce((a, h) => a + (h.exercise || 0) + Math.min(h.exercise || 0, h.exVig || 0), 0);
    const anyEx = hs.some((h) => h.exercise || h.strength);
    const strength = hs.filter((h) => h.strength || ((h.exTypes || {}).gimnasio > 0) || ((h.exTypes || {}).fuerza > 0)).length;
    return {
      sleepH: sl.length >= 7 ? r1(mean(sl)) : null,
      sleepReg: beds.length >= 7 ? Math.round(sd(beds)) : null,
      active: anyEx ? Math.round((equiv * 7) / list.length) : null,
      strength: anyEx ? r1((strength * 7) / list.length) : null,
      steps: st.length >= 7 ? Math.round(mean(st)) : null,
      veg: vg.length >= 7 ? r1(mean(vg)) : null,
      rhr: rh.length >= 5 ? Math.round(mean(rh)) : null,
    };
  };
  const a = calc(cur); const b = calc(prv);
  const DEF = [
    { key: 'sleepH', label: 'Horas de sueño', unit: 'h', target: '7 a 9 h', st: (v) => (v >= 7 && v <= 9 ? 'ok' : v >= 6.5 && v <= 9.5 ? 'cerca' : 'lejos'), better: (x, y) => Math.abs(x - 8) < Math.abs(y - 8) - 0.1, fmt: (v) => fmtHours(Math.round(v * 4) / 4), gap: (v) => (v < 7 ? (7 - v) / 7 : v > 9 ? (v - 9) / 9 : 0) },
    { key: 'sleepReg', label: 'Horario parejo', unit: 'min', target: '±45 min', st: (v) => (v <= 45 ? 'ok' : v <= 75 ? 'cerca' : 'lejos'), better: (x, y) => x < y - 5, fmt: (v) => `±${v} min`, gap: (v) => Math.max(0, v - 45) / 45 },
    { key: 'active', label: 'Actividad', unit: 'min/sem', target: '150 min a la semana', st: (v) => (v >= 150 ? 'ok' : v >= 100 ? 'cerca' : 'lejos'), better: (x, y) => x > y + 10, fmt: (v) => `${v} min`, gap: (v) => Math.max(0, 150 - v) / 150 },
    { key: 'strength', label: 'Fuerza', unit: 'días/sem', target: `${STRENGTH_WEEK_GOAL} días a la semana`, st: (v) => (v >= STRENGTH_WEEK_GOAL ? 'ok' : v >= 1 ? 'cerca' : 'lejos'), better: (x, y) => x > y + 0.2, fmt: (v) => `${v} días`, gap: (v) => Math.max(0, STRENGTH_WEEK_GOAL - v) / STRENGTH_WEEK_GOAL },
    { key: 'steps', label: 'Pasos', unit: 'al día', target: '7,000 al día', st: (v) => (v >= 7000 ? 'ok' : v >= 5000 ? 'cerca' : 'lejos'), better: (x, y) => x > y + 300, fmt: (v) => v.toLocaleString('en-US'), gap: (v) => Math.max(0, 7000 - v) / 7000 },
    { key: 'veg', label: 'Frutas y verduras', unit: 'porciones', target: '5 al día', st: (v) => (v >= 5 ? 'ok' : v >= 3 ? 'cerca' : 'lejos'), better: (x, y) => x > y + 0.3, fmt: (v) => `${v} al día`, gap: (v) => Math.max(0, 5 - v) / 5 },
    { key: 'rhr', label: 'Pulso en reposo', unit: 'lpm', target: 'estable o bajando', st: () => 'info', better: (x, y) => x < y - 1, fmt: (v) => `${v} lpm`, gap: () => 0 },
  ];
  const items = DEF.filter((m) => a[m.key] != null).map((m) => {
    const v = a[m.key]; const p = b[m.key];
    const st = m.key === 'rhr' ? (p != null && v >= p + 3 ? 'cerca' : 'ok') : m.st(v);
    return { key: m.key, label: m.label, value: v, text: m.fmt(v), prev: p, prevText: p != null ? m.fmt(p) : '', target: m.target, st, trend: p == null ? null : m.better(v, p) ? 'mejor' : m.better(p, v) ? 'peor' : 'igual', dir: p == null || v === p ? 0 : v > p ? 1 : -1, gap: st === 'ok' ? 0 : m.gap(v) };
  });
  const focus = [...items].filter((x) => x.st !== 'ok' && x.key !== 'rhr').sort((x, y) => y.gap - x.gap)[0] || null;
  return { items, focus, ok: items.filter((x) => x.st === 'ok').length };
}

export function ensureVitals(s) {
  if (!isObj(s.vitals)) s.vitals = {};
  const v = s.vitals;
  if (v.wunit !== 'kg' && v.wunit !== 'lb') v.wunit = 'lb';
  if (!isObj(v.bpWeek) || !/^\d{4}-\d{2}-\d{2}$/.test(v.bpWeek.start || '')) v.bpWeek = null;
  if (v.sex !== 'f' && v.sex !== 'm') v.sex = '';
  for (const h of Object.values(s.health || {})) {
    if (!isObj(h)) continue;
    if (h.ready !== undefined && !isObj(h.ready)) delete h.ready;
    if (h.bp !== undefined) { if (!Array.isArray(h.bp)) delete h.bp; else h.bp = h.bp.filter((r) => isObj(r) && r.id && r.sys > r.dia); }
    if (h.habits !== undefined && !isObj(h.habits)) delete h.habits;
    for (const k of ['load', 'rhr', 'hrv', 'weight', 'nap']) if (h[k] !== undefined && !Number.isFinite(Number(h[k]))) delete h[k];
  }
}

export { EXERCISE_WEEK_GOAL, weekday };
