// Salud 1.14: rutinas guiadas sin equipo y plan de la semana para cumplir la guía de la OMS
// (150 a 300 minutos moderados o 75 a 150 intensos a la semana, más fuerza 2 días) y cortar el tiempo sentado.
import { addDays, weekday } from '../app/dates.js';
import { gainXP, getDay, logHealth } from './logic.js';

const ex = (name, sec, how) => ({ name, sec, how });
const rest = (sec = 20) => ({ name: 'Descansa', sec, rest: true, how: 'Respira y prepárate para el siguiente.' });
const rounds = (n, list) => Array.from({ length: n }, (_, r) => list.map((x) => ({ ...x, round: r + 1, rounds: n }))).flat();

const STRENGTH = [
  ex('Sentadillas', 40, 'Pies al ancho de los hombros. Baja como si te sentaras en una silla, con el pecho arriba, y sube empujando con los talones.'), rest(),
  ex('Flexiones', 40, 'En la pared, con las rodillas en el piso o completas. Cuerpo recto, baja el pecho y empuja.'), rest(),
  ex('Puente de glúteos', 40, 'Boca arriba con las rodillas dobladas. Sube la cadera apretando los glúteos y baja despacio.'), rest(),
  ex('Remo con mochila', 40, 'Una mochila o un galón de agua en cada mano. Inclínate un poco y lleva los codos hacia atrás.'), rest(),
  ex('Zancadas alternas', 40, 'Un paso largo al frente, baja la rodilla de atrás hacia el piso y vuelve. Cambia de pierna.'), rest(),
  ex('Plancha', 30, 'Apoyado en antebrazos y puntas de los pies (o rodillas). Abdomen firme y espalda recta.'), rest(30),
];

export const ROUTINES = [
  {
    id: 'fuerza20', title: 'Fuerza en casa', icon: 'dumbbell', type: 'fuerza', intensity: 'moderada', strength: true,
    desc: 'Tres vueltas de seis ejercicios con tu propio peso. Sin equipo: una mochila o un galón sirven de pesa.',
    steps: [
      ex('Calentamiento: marcha en el sitio', 60, 'Sube las rodillas y mueve los brazos.'),
      ex('Calentamiento: círculos de brazos y cadera', 60, 'Círculos amplios hacia adelante y hacia atrás.'),
      ...rounds(3, STRENGTH),
      ex('Estira piernas', 60, 'De pie, lleva un talón a los glúteos; cambia. Luego inclínate hacia una pierna estirada.'),
      ex('Estira pecho y espalda', 60, 'Entrelaza las manos atrás y abre el pecho; luego abrázate y redondea la espalda.'),
    ],
  },
  {
    id: 'fuerza10', title: 'Fuerza exprés', icon: 'bolt', type: 'fuerza', intensity: 'moderada', strength: true,
    desc: 'Para los días con poco tiempo: dos vueltas de cuatro ejercicios.',
    steps: [
      ex('Calentamiento: marcha en el sitio', 60, 'Sube las rodillas y mueve los brazos.'),
      ...rounds(2, [
        ex('Sentadillas', 45, 'Baja como si te sentaras y sube empujando con los talones.'), rest(15),
        ex('Flexiones', 45, 'En la pared, con las rodillas en el piso o completas.'), rest(15),
        ex('Puente de glúteos', 45, 'Sube la cadera apretando los glúteos y baja despacio.'), rest(15),
        ex('Plancha', 30, 'Abdomen firme y espalda recta.'), rest(30),
      ]),
    ],
  },
  {
    id: 'intervalos', title: 'Caminata con intervalos', icon: 'pulse', type: 'caminar', intensity: 'moderada',
    desc: 'Alterna 2 minutos rápido con 2 normal. Te aviso con una campana cuando cambies de ritmo.',
    steps: [
      ex('Camina suave', 300, 'Calienta a tu paso.'),
      ...Array.from({ length: 6 }, () => [ex('Rápido', 120, 'Como si llegaras tarde: puedes hablar, pero no cantar.'), ex('Normal', 120, 'Recupera el aire sin parar.')]).flat(),
      ex('Camina suave', 180, 'Baja el ritmo poco a poco.'),
    ],
  },
  {
    id: 'movilidad', title: 'Movilidad y estiramiento', icon: 'heart', type: 'yoga', intensity: 'moderada',
    desc: 'Diez minutos para soltar cuello, espalda y caderas. Buena para la mañana o antes de dormir.',
    steps: [
      ex('Cuello', 60, 'Lleva la oreja al hombro, despacio, y cambia. Luego mira a un lado y al otro.'),
      ex('Hombros', 60, 'Círculos hacia atrás y hacia adelante; luego sube y suelta los hombros.'),
      ex('Gato y vaca', 90, 'En cuatro apoyos: redondea la espalda al botar el aire y arquéala al tomarlo.'),
      ex('Giro de tronco', 60, 'Sentado o de pie, gira el pecho a un lado y al otro sin forzar.'),
      ex('Flexores de cadera', 90, 'Una rodilla en el piso y la otra pierna al frente. Empuja la cadera hacia adelante; cambia a los 45 segundos.'),
      ex('Parte de atrás de las piernas', 90, 'Sentado con una pierna estirada, inclínate hacia el pie con la espalda recta; cambia.'),
      ex('Pantorrillas', 60, 'Manos en la pared, una pierna atrás con el talón en el piso; cambia.'),
      ex('Respira', 60, 'Acostado o sentado: toma aire en 4 tiempos y bótalo en 6.'),
    ],
  },
  {
    id: 'pausa', title: 'Pausa activa', icon: 'clock', type: 'pausa', intensity: 'ligera', break: true,
    desc: 'Cinco minutos para cortar el tiempo sentado, en la oficina o en casa. Hazla cada 1 o 2 horas.',
    steps: [
      ex('Párate y estírate', 30, 'Brazos arriba, entrelaza las manos y estírate hacia el techo.'),
      ex('Cuello y hombros', 45, 'Oreja al hombro a cada lado y círculos de hombros hacia atrás.'),
      ex('Sentarte y pararte', 45, 'Desde la silla, sin usar las manos, a tu ritmo.'),
      ex('Talones arriba', 30, 'Sube en puntas de pie y baja despacio.'),
      ex('Camina', 90, 'Por la oficina, el pasillo o la escalera.'),
      ex('Muñecas y espalda', 30, 'Círculos de muñecas; luego manos en la cintura y arquea un poco hacia atrás.'),
      ex('Mira lejos', 30, 'Mira algo a más de 6 metros: descansa la vista de la pantalla.'),
    ],
  },
];
export const ROUTINE = Object.fromEntries(ROUTINES.map((r) => [r.id, r]));
export const routineSeconds = (r) => r.steps.reduce((a, x) => a + x.sec, 0);
export const routineMinutes = (r) => Math.round(routineSeconds(r) / 60);

// Al terminar (o al parar después de 1 minuto): suma minutos de ejercicio con su tipo, la fuerza y XP de Vigor.
// La pausa activa no cuenta como ejercicio moderado: suma a «pausas» del día (+2 XP, hasta 4 al día).
export function finishRoutine(s, id, seconds, today, ev = []) {
  const r = ROUTINE[id];
  if (!r) return null;
  const min = Math.max(1, Math.round(Math.min(seconds, routineSeconds(r) + 120) / 60));
  const h = s.health[today] || (s.health[today] = {});
  if (r.break) {
    h.breaks = (h.breaks || 0) + 1;
    if (h.breaks <= 4) gainXP(s, 'salud', 2, today, ev);
    return { min, breaks: h.breaks };
  }
  const full = seconds >= routineSeconds(r) * 0.8;
  logHealth(s, today, { exercise: (h.exercise || 0) + min, exType: r.type, exIntensity: r.intensity, strength: !!r.strength }, today, ev);
  const dd = getDay(s, today);
  if (full && !dd.routineXp) { dd.routineXp = true; gainXP(s, 'salud', 10, today, ev); }
  return { min, full };
}

// ---------- Plan de la semana ----------

// `s.profile.exPlan`: { 0..6: 'fuerza' | 'cardio' | 'movilidad' } (0 = domingo). Vacío = sin plan.
export const PLAN_KINDS = [
  { key: 'fuerza', label: 'Fuerza', short: 'F', routine: 'fuerza20' },
  { key: 'cardio', label: 'Caminar o cardio', short: 'C', routine: 'intervalos' },
  { key: 'movilidad', label: 'Movilidad', short: 'M', routine: 'movilidad' },
];
export const PLAN_KIND = Object.fromEntries(PLAN_KINDS.map((k) => [k.key, k]));
export const DEFAULT_EX_PLAN = { 1: 'fuerza', 2: 'cardio', 3: 'cardio', 4: 'fuerza', 5: 'cardio', 6: 'movilidad' };

export function exPlan(s) {
  const p = (s.profile && s.profile.exPlan) || {};
  const out = {};
  for (const [d, k] of Object.entries(p)) if (PLAN_KIND[k] && Number(d) >= 0 && Number(d) <= 6) out[d] = k;
  return out;
}

export function setExPlan(s, plan) {
  const out = {};
  for (const [d, k] of Object.entries(plan || {})) if (PLAN_KIND[k] && Number(d) >= 0 && Number(d) <= 6) out[Number(d)] = k;
  s.profile.exPlan = out;
}

// ¿Se cumplió lo planeado ese día? Fuerza: día de fuerza. Cardio: tu meta diaria de ejercicio (o 20 min).
// Movilidad: cualquier yoga o estiramiento.
export function planDone(s, day, kind) {
  const h = (s.health || {})[day] || {};
  const t = h.exTypes || {};
  if (kind === 'fuerza') return !!(h.strength || t.gimnasio > 0 || t.fuerza > 0);
  if (kind === 'movilidad') return (t.yoga || 0) > 0;
  const goal = Number(s.profile && s.profile.goals && s.profile.goals.exercise) || 30;
  return (h.exercise || 0) - (t.yoga || 0) >= Math.min(goal, 20);
}

// La semana actual (lunes a domingo) con lo planeado y lo hecho.
export function planWeek(s, today) {
  const plan = exPlan(s);
  const wd = weekday(today);
  const monday = addDays(today, -((wd + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    const k = plan[weekday(d)] || null;
    return { day: d, wd: weekday(d), kind: k, done: k ? planDone(s, d, k) : false, future: d > today, today: d === today };
  });
  const planned = days.filter((x) => x.kind);
  const due = planned.filter((x) => !x.future);
  return { days, planned: planned.length, done: planned.filter((x) => x.done).length, missed: due.filter((x) => !x.done && !x.today).length, todayKind: plan[wd] || null, todayDone: plan[wd] ? planDone(s, today, plan[wd]) : false };
}
