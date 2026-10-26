// Salud 1.14: «Tu plato». En vez de contar calorías, cada comida se marca con el método del plato
// (Harvard: mitad vegetales y frutas, un cuarto integrales o víveres, un cuarto proteína sana, agua para beber)
// y se anotan sin culpa los fritos, ultraprocesados y bebidas azucaradas para ver la semana.
import { addDays } from '../app/dates.js';
import { gainXP, getDay } from './logic.js';

export const MEALS = [
  { key: 'des', label: 'Desayuno', icon: 'coffee' },
  { key: 'alm', label: 'Almuerzo', icon: 'utensils' },
  { key: 'cen', label: 'Cena', icon: 'moon' },
  { key: 'mer', label: 'Merienda', icon: 'sprout' },
];
export const MEAL = Object.fromEntries(MEALS.map((m) => [m.key, m]));

export const PLATE_GOOD = [
  { key: 'veg', label: 'Vegetales o frutas', hint: 'La mitad del plato: ensalada, vegetales, frutas. La papa no cuenta aquí.' },
  { key: 'prot', label: 'Proteína sana', hint: 'Pescado, pollo, huevo, habichuelas, lentejas, queso o yogur.' },
  { key: 'integ', label: 'Integral o víveres', hint: 'Un cuarto del plato: arroz integral, avena, pan integral, yuca, batata, plátano.' },
  { key: 'agua', label: 'Bebí agua, café o té sin azúcar', hint: '' },
];
export const PLATE_WATCH = [
  { key: 'frito', label: 'Frito', hint: 'Frituras, empanadas, tostones fritos.' },
  { key: 'ultra', label: 'Embutido o de paquete', hint: 'Salami, salchicha, jamón, picaderas y comida rápida.' },
  { key: 'azucar', label: 'Refresco, jugo con azúcar o dulce', hint: '' },
];
const KEYS = [...PLATE_GOOD, ...PLATE_WATCH].map((x) => x.key);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function ensureFood(s) {
  for (const h of Object.values(s.health || {})) {
    if (!isObj(h) || h.food === undefined) continue;
    if (!isObj(h.food)) { delete h.food; continue; }
    for (const [mk, m] of Object.entries(h.food)) {
      if (!MEAL[mk] || !isObj(m)) { delete h.food[mk]; continue; }
      for (const k of Object.keys(m)) if (!KEYS.includes(k) || m[k] !== true) delete m[k];
    }
    if (!Object.keys(h.food).length) delete h.food;
  }
}

// Cuántas partes buenas del plato tiene (vegetales, proteína, integral): 0 a 3.
export const plateScore = (m) => (m ? ['veg', 'prot', 'integ'].filter((k) => m[k]).length : 0);
export const plateFull = (m) => plateScore(m) === 3;

// Guarda una comida. `marks`: { veg: true, frito: true… }; vacío = quitar la comida.
// Un plato con 2 o más partes buenas da +2 XP de Vigor (hasta 3 comidas al día); el plato completo, +1 más.
export function logMeal(s, day, meal, marks, today, ev = []) {
  if (!MEAL[meal]) return null;
  const h = s.health[day] || (s.health[day] = {});
  const clean = {};
  for (const k of KEYS) if (marks && marks[k]) clean[k] = true;
  if (!isObj(h.food)) h.food = {};
  if (Object.keys(clean).length) h.food[meal] = clean; else delete h.food[meal];
  if (!Object.keys(h.food).length) delete h.food;
  if (day === today && plateScore(clean) >= 2) {
    const dd = getDay(s, today);
    const got = Array.isArray(dd.foodXp) ? dd.foodXp : (dd.foodXp = []);
    if (!got.includes(meal) && got.length < 3) {
      got.push(meal);
      gainXP(s, 'salud', plateFull(clean) ? 3 : 2, today, ev);
    }
  }
  return clean;
}

export function mealsOn(s, day) {
  const f = ((s.health && s.health[day]) || {}).food || {};
  return MEALS.map((m) => ({ ...m, marks: f[m.key] || null }));
}

// Tu semana de comida (últimos 7 días): cuántas comidas anotaste y en cuántas hubo cada cosa.
export function foodWeek(s, today, days = 7) {
  let meals = 0; let full = 0;
  const count = Object.fromEntries(KEYS.map((k) => [k, 0]));
  let logged = 0;
  for (let i = 0; i < days; i++) {
    const f = ((s.health || {})[addDays(today, -i)] || {}).food;
    if (!f) continue;
    logged += 1;
    for (const m of Object.values(f)) {
      meals += 1;
      if (plateFull(m)) full += 1;
      for (const k of KEYS) if (m[k]) count[k] += 1;
    }
  }
  const main = (k) => (meals ? count[k] / meals : null);
  let tip = null;
  if (meals >= 5) {
    if (main('veg') < 0.5) tip = { icon: 'sprout', text: 'Menos de la mitad de tus comidas tuvo vegetales o frutas. Prueba agregar una ensalada o un guineo al almuerzo: es lo que más mejora el plato.' };
    else if (count.azucar >= 5) tip = { icon: 'glass', text: `Tomaste refresco, jugo con azúcar o dulce en ${count.azucar} comidas. Cambiar una al día por agua o jugo natural sin azúcar ya hace diferencia.` };
    else if (count.frito + count.ultra >= 6) tip = { icon: 'utensils', text: 'Hubo varios fritos o embutidos esta semana. Al horno, guisado o a la plancha te dan el mismo sabor con menos grasa y sal.' };
    else if (main('prot') < 0.5) tip = { icon: 'utensils', text: 'Pocas comidas con proteína. Huevo, habichuelas, pollo o pescado te mantienen lleno por más tiempo.' };
    else if (full >= meals * 0.5) tip = { icon: 'star', text: 'La mitad o más de tus comidas fueron un plato completo. Así se ve comer bien.' };
  }
  return { days: logged, meals, full, count, pct: { veg: main('veg'), prot: main('prot'), integ: main('integ') }, tip };
}

// Total de platos completos (para la insignia).
export function fullPlates(s) {
  let n = 0;
  for (const h of Object.values(s.health || {})) if (isObj(h) && isObj(h.food)) for (const m of Object.values(h.food)) if (plateFull(m)) n += 1;
  return n;
}
