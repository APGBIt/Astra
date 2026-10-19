// Crecimiento (1.8): lo que quieres dejar de hacer (días sin, recaídas, lo que ahorras), metas medibles con su
// progreso y la lista de cosas que quieres lograr en la vida.
import { addDays, diffDays } from '../app/dates.js';
import { AREA } from './content.js';
import { gainXP, addGold, uid, checkAchievements, addWin, addTodo } from './logic.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const txt = (v, n = 200) => String(v == null ? '' : v).trim().slice(0, n);
const numOr = (v, d = null) => (v === '' || v == null || !Number.isFinite(Number(v)) ? d : Number(v));
const r2 = (v) => Math.round(v * 100) / 100;
const areaOr = (a, d = 'crecimiento') => (AREA[a] ? a : d);

export function defaultGrowth() {
  return { quit: [], targets: [], dreams: [] };
}

export function ensureGrowth(s) {
  if (!isObj(s.growth)) s.growth = defaultGrowth();
  const g = s.growth;
  for (const k of ['quit', 'targets', 'dreams']) {
    if (!Array.isArray(g[k])) g[k] = [];
    g[k] = g[k].filter((x) => isObj(x) && x.id);
  }
  for (const q of g.quit) {
    if (!isDay(q.since)) q.since = isDay(q.created) ? q.created : null;
    if (!Array.isArray(q.slips)) q.slips = [];
    q.slips = q.slips.filter((x) => isObj(x) && isDay(x.day));
    if (!isObj(q.claimed)) q.claimed = {};
  }
  g.quit = g.quit.filter((q) => q.since && q.name);
  for (const t of g.targets) {
    if (!Array.isArray(t.log)) t.log = [];
    t.log = t.log.filter((x) => isObj(x) && isDay(x.day) && Number.isFinite(Number(x.v)));
    if (!Array.isArray(t.hits)) t.hits = [];
  }
  g.targets = g.targets.filter((t) => t.name && Number.isFinite(Number(t.target)));
  for (const d of g.dreams) if (!Array.isArray(d.steps)) d.steps = [];
  g.dreams = g.dreams.filter((d) => d.title);
}

// ---------- Dejar de hacer ----------

export const QUIT_TEMPLATES = [
  { name: 'Fumar o vapear', icon: 'flame', area: 'salud', cost: 150 },
  { name: 'Tomar alcohol', icon: 'glass', area: 'salud', cost: 300 },
  { name: 'Refrescos y jugos azucarados', icon: 'drop', area: 'salud', cost: 60 },
  { name: 'Comida chatarra', icon: 'utensils', area: 'salud', cost: 250 },
  { name: 'Redes sociales en la cama', icon: 'phone', area: 'emocional' },
  { name: 'Revisar el celular al despertar', icon: 'phone', area: 'emocional' },
  { name: 'Compras por impulso', icon: 'bag', area: 'finanzas', cost: 300 },
  { name: 'Pedir delivery', icon: 'box', area: 'finanzas', cost: 400 },
  { name: 'Apostar o jugar lotería', icon: 'dice', area: 'finanzas', cost: 200 },
  { name: 'Dejar las cosas para después', icon: 'clock', area: 'laborales' },
  { name: 'Llegar tarde', icon: 'timer', area: 'laborales' },
  { name: 'Quejarme', icon: 'chat', area: 'relaciones' },
  { name: 'Morderme las uñas', icon: 'scissors', area: 'emocional' },
  { name: 'Café después de las 3', icon: 'coffee', area: 'salud', cost: 100 },
];

// Lo que suele empujar a recaer: se guarda para ver el patrón.
export const QUIT_TRIGGERS = ['Estrés', 'Aburrimiento', 'Cansancio', 'Con amigos', 'Una fiesta', 'Tristeza', 'Ansiedad', 'Hambre', 'La costumbre', 'Otro'];

// Días seguidos que se celebran.
export const QUIT_MILESTONES = [1, 3, 7, 14, 21, 30, 60, 90, 180, 365];

export function addQuit(s, p, today) {
  const name = txt(p.name, 60);
  if (name.length < 2) return null;
  const since = isDay(p.since) && p.since <= today ? p.since : today;
  const q = {
    id: `q${uid()}`, name, icon: txt(p.icon, 20) || 'flag', area: areaOr(p.area), why: txt(p.why, 300), instead: txt(p.instead, 200),
    cost: Math.max(0, numOr(p.cost, 0) || 0), since, created: today, slips: [], claimed: {}, archived: false,
  };
  // Si ya llevabas días sin hacerlo, esos hitos cuentan como alcanzados (sin XP: el premio es para lo que viene).
  const days = diffDays(since, today);
  q.claimed[since] = QUIT_MILESTONES.filter((m) => m <= days);
  s.growth.quit.unshift(q);
  return q;
}

export function updateQuit(s, id, p) {
  const q = s.growth.quit.find((x) => x.id === id);
  if (!q) return null;
  if (p.name != null && txt(p.name, 60).length >= 2) q.name = txt(p.name, 60);
  if (p.why != null) q.why = txt(p.why, 300);
  if (p.instead != null) q.instead = txt(p.instead, 200);
  if (p.area) q.area = areaOr(p.area, q.area);
  if (p.icon) q.icon = txt(p.icon, 20);
  if (p.cost != null) q.cost = Math.max(0, numOr(p.cost, 0) || 0);
  if (p.archived != null) q.archived = !!p.archived;
  return q;
}

export const removeQuit = (s, id) => { s.growth.quit = s.growth.quit.filter((x) => x.id !== id); };

// Desde cuándo va la racha actual: el día después de la última recaída (o el día en que empezaste).
export function quitStart(q) {
  const last = q.slips.reduce((a, x) => (x.day > a ? x.day : a), '');
  return last && last >= q.since ? addDays(last, 1) : q.since;
}
// Días seguidos sin hacerlo (el de hoy cuenta cuando termina: empezar hoy = 0 días).
export const quitDays = (q, today) => Math.max(0, diffDays(quitStart(q), today));

// Racha más larga, incluida la de ahora.
export function quitBest(q, today) {
  const days = [...new Set(q.slips.map((x) => x.day))].filter((d) => d >= q.since).sort();
  let best = 0;
  let from = q.since;
  for (const d of days) { best = Math.max(best, diffDays(from, d)); from = addDays(d, 1); }
  return Math.max(best, quitDays(q, today));
}

// Días limpios en total y lo que te ahorraste (si pusiste cuánto te costaba por día).
export function quitTotals(q, today) {
  const total = Math.max(0, diffDays(q.since, today));
  const slipDays = new Set(q.slips.filter((x) => x.day >= q.since && x.day < today).map((x) => x.day)).size;
  const clean = Math.max(0, total - slipDays);
  return { clean, saved: r2(clean * (q.cost || 0)), slips: q.slips.length };
}

export const nextMilestone = (days) => QUIT_MILESTONES.find((m) => m > days) || null;

export function slipQuit(s, id, p, today) {
  const q = s.growth.quit.find((x) => x.id === id);
  if (!q) return null;
  const day = isDay(p && p.day) && p.day <= today && p.day >= q.since ? p.day : today;
  q.slips.unshift({ id: uid(), day, trigger: QUIT_TRIGGERS.includes(p && p.trigger) ? p.trigger : '', note: txt(p && p.note, 300) });
  q.slips.sort((a, b) => (a.day < b.day ? 1 : -1));
  q.slips = q.slips.slice(0, 500);
  return q;
}

export function undoSlip(s, id, slipId) {
  const q = s.growth.quit.find((x) => x.id === id);
  if (q) q.slips = q.slips.filter((x) => x.id !== slipId);
  return q;
}

// Qué empuja más a recaer.
export function quitTriggers(q) {
  const n = {};
  for (const x of q.slips) if (x.trigger) n[x.trigger] = (n[x.trigger] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1]);
}

const milestoneXP = (m) => (m >= 90 ? 60 : m >= 30 ? 40 : m >= 7 ? 20 : 8);

// Cada hito de días seguidos da XP una sola vez por racha (al recaer, la próxima racha vuelve a darlos).
export function claimQuit(s, today, ev = []) {
  for (const q of s.growth.quit) {
    if (q.archived) continue;
    const start = quitStart(q);
    const days = quitDays(q, today);
    const got = Array.isArray(q.claimed[start]) ? q.claimed[start] : [];
    const best = Math.max(0, ...Object.values(q.claimed).flat().filter((x) => typeof x === 'number'));
    for (const m of QUIT_MILESTONES) {
      if (m > days || got.includes(m)) continue;
      got.push(m);
      // Solo da XP y oro si es un récord: recaer y volver a contar no repite el premio.
      if (m > best) {
        const xp = gainXP(s, q.area, milestoneXP(m), today, ev);
        if (m >= 7) addGold(s, m >= 30 ? 20 : 10, today);
        ev.push({ type: 'quitDays', name: q.name, n: m, xp });
      }
    }
    q.claimed = { [start]: got, ...Object.fromEntries(Object.entries(q.claimed).filter(([k]) => k !== start).slice(-20)) };
  }
  checkAchievements(s, today, ev);
}

// ---------- Metas con progreso ----------

export const TARGET_TEMPLATES = [
  { name: 'Fondo de emergencia', area: 'finanzas', unit: 'RD$', mode: 'sum', target: 100000, icon: 'piggy' },
  { name: 'Leer libros este año', area: 'crecimiento', unit: 'libros', mode: 'sum', target: 12, icon: 'book' },
  { name: 'Bajar de peso', area: 'salud', unit: 'lb', mode: 'value', target: 170, icon: 'pulse' },
  { name: 'Pagar una deuda', area: 'finanzas', unit: 'RD$', mode: 'sum', target: 50000, icon: 'card' },
  { name: 'Correr kilómetros', area: 'salud', unit: 'km', mode: 'sum', target: 200, icon: 'dumbbell' },
  { name: 'Horas de inglés', area: 'crecimiento', unit: 'horas', mode: 'sum', target: 100, icon: 'chat' },
  { name: 'Cursos terminados', area: 'laborales', unit: 'cursos', mode: 'sum', target: 4, icon: 'cap' },
  { name: 'Salidas con la familia', area: 'relaciones', unit: 'salidas', mode: 'sum', target: 24, icon: 'people' },
];

// mode «sum»: cada registro se suma (ahorrar, leer). «value»: cada registro es el valor de hoy (tu peso).
// link {kind:'account', id}: el valor es el saldo de esa cuenta en pesos (un fondo de ahorro).
export function addTarget(s, p, today) {
  const name = txt(p.name, 60);
  const target = numOr(p.target);
  if (name.length < 2 || target == null) return null;
  const mode = p.mode === 'value' ? 'value' : 'sum';
  const start = numOr(p.start, mode === 'sum' ? 0 : null);
  if (mode === 'value' && start == null) return null;
  const t = {
    id: `t${uid()}`, name, icon: txt(p.icon, 20) || 'target', area: areaOr(p.area), unit: txt(p.unit, 16), mode, start, target,
    due: isDay(p.due) && p.due > today ? p.due : null, why: txt(p.why, 300), link: p.link && p.link.kind === 'account' && p.link.id ? { kind: 'account', id: String(p.link.id) } : null,
    created: today, log: [], hits: [], done: null, archived: false,
  };
  s.growth.targets.unshift(t);
  return t;
}

export function updateTarget(s, id, p, today) {
  const t = s.growth.targets.find((x) => x.id === id);
  if (!t) return null;
  if (p.name != null && txt(p.name, 60).length >= 2) t.name = txt(p.name, 60);
  if (p.target != null && numOr(p.target) != null) t.target = numOr(p.target);
  if (p.start != null && numOr(p.start) != null) t.start = numOr(p.start);
  if (p.unit != null) t.unit = txt(p.unit, 16);
  if (p.area) t.area = areaOr(p.area, t.area);
  if (p.why != null) t.why = txt(p.why, 300);
  if (p.due !== undefined) t.due = isDay(p.due) && p.due > (today || '') ? p.due : null;
  if (p.link !== undefined) t.link = p.link && p.link.kind === 'account' && p.link.id ? { kind: 'account', id: String(p.link.id) } : null;
  if (p.archived != null) t.archived = !!p.archived;
  return t;
}

export const removeTarget = (s, id) => { s.growth.targets = s.growth.targets.filter((x) => x.id !== id); };

// Valor de hoy: el saldo de la cuenta ligada, la suma de lo registrado o el último valor.
export function targetValue(t, balanceOf = null) {
  if (t.link && balanceOf) { const v = balanceOf(t.link.id); if (v != null) return r2(v); }
  if (t.mode === 'sum') return r2((t.start || 0) + t.log.reduce((a, x) => a + Number(x.v), 0));
  const last = [...t.log].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : (b.ts || 0) - (a.ts || 0)))[0];
  return last ? Number(last.v) : t.start;
}

// Cuánto llevas, si vas a tiempo para la fecha y cuánto toca por semana.
export function targetProgress(t, today, balanceOf = null) {
  const value = targetValue(t, balanceOf);
  const span = t.target - t.start;
  const pct = span === 0 ? 1 : Math.max(0, Math.min(1, (value - t.start) / span));
  const left = r2(Math.max(0, t.target >= t.start ? t.target - value : value - t.target));
  let expected = null; let status = null; let perWeek = null; let daysLeft = null;
  if (t.due && !t.done) {
    const total = Math.max(1, diffDays(t.created, t.due));
    const gone = Math.max(0, Math.min(total, diffDays(t.created, today)));
    expected = gone / total;
    daysLeft = Math.max(0, diffDays(today, t.due));
    perWeek = daysLeft > 0 ? r2(left / Math.max(1, daysLeft / 7)) : left;
    status = pct >= 1 ? 'lista' : pct + 0.03 >= expected ? 'a tiempo' : 'atrasada';
  }
  return { value, pct, left, expected, status, perWeek, daysLeft, done: !!t.done || pct >= 1 };
}

const TARGET_STEPS = [0.25, 0.5, 0.75, 1];

export function logTarget(s, id, p, today, ev = [], balanceOf = null) {
  const t = s.growth.targets.find((x) => x.id === id);
  const v = numOr(p && p.v);
  if (!t || v == null || t.link) return null;
  t.log.unshift({ id: uid(), day: isDay(p.day) && p.day <= today ? p.day : today, ts: Date.now(), v: r2(v), note: txt(p.note, 200) });
  t.log = t.log.slice(0, 2000);
  claimTarget(s, t, today, ev, balanceOf);
  return t;
}

export function undoTargetLog(s, id, logId) {
  const t = s.growth.targets.find((x) => x.id === id);
  if (t) t.log = t.log.filter((x) => x.id !== logId);
  return t;
}

// Cada cuarto del camino da XP una sola vez; al llegar, la meta queda lista.
export function claimTarget(s, t, today, ev = [], balanceOf = null) {
  const pr = targetProgress(t, today, balanceOf);
  for (const step of TARGET_STEPS) {
    if (pr.pct + 1e-9 < step || t.hits.includes(step)) continue;
    t.hits.push(step);
    const xp = gainXP(s, t.area, step === 1 ? 60 : 15, today, ev);
    if (step === 1) {
      addGold(s, 30, today);
      t.done = today;
      ev.push({ type: 'targetDone', name: t.name, xp });
    } else ev.push({ type: 'targetStep', name: t.name, pct: Math.round(step * 100), xp });
  }
  checkAchievements(s, today, ev);
}

export function claimTargets(s, today, ev = [], balanceOf = null) {
  for (const t of s.growth.targets) if (!t.archived && !t.done) claimTarget(s, t, today, ev, balanceOf);
}

// ---------- Por lograr ----------

export const HORIZONS = [
  { key: 'pronto', label: 'Este año' },
  { key: 'medio', label: 'En 1 a 3 años' },
  { key: 'algun', label: 'Algún día' },
];

export const DREAM_IDEAS = [
  { title: 'Viajar a un país que no conozco', area: 'emocional', icon: 'plane' },
  { title: 'Aprender a nadar', area: 'salud', icon: 'drop' },
  { title: 'Correr un 10K', area: 'salud', icon: 'dumbbell' },
  { title: 'Hablar inglés con fluidez', area: 'crecimiento', icon: 'chat' },
  { title: 'Terminar la maestría', area: 'crecimiento', icon: 'cap' },
  { title: 'Comprar mi casa', area: 'finanzas', icon: 'home' },
  { title: 'Salir de todas mis deudas', area: 'finanzas', icon: 'card' },
  { title: 'Emprender mi negocio', area: 'laborales', icon: 'briefcase' },
  { title: 'Llevar a mis padres de viaje', area: 'relaciones', icon: 'people' },
  { title: 'Ser voluntario en algo que me importe', area: 'relaciones', icon: 'heart' },
];

export function addDream(s, p, today) {
  const title = txt(p.title, 100);
  if (title.length < 2) return null;
  const d = {
    id: `d${uid()}`, title, icon: txt(p.icon, 20) || 'star', area: areaOr(p.area), horizon: HORIZONS.some((h) => h.key === p.horizon) ? p.horizon : 'pronto',
    due: isDay(p.due) ? p.due : null, why: txt(p.why, 300), steps: [], created: today, done: null, note: '',
  };
  for (const st of p.steps || []) if (txt(st, 120)) d.steps.push({ id: uid(), text: txt(st, 120), done: null });
  s.growth.dreams.unshift(d);
  return d;
}

export function updateDream(s, id, p) {
  const d = s.growth.dreams.find((x) => x.id === id);
  if (!d) return null;
  if (p.title != null && txt(p.title, 100).length >= 2) d.title = txt(p.title, 100);
  if (p.area) d.area = areaOr(p.area, d.area);
  if (p.horizon && HORIZONS.some((h) => h.key === p.horizon)) d.horizon = p.horizon;
  if (p.due !== undefined) d.due = isDay(p.due) ? p.due : null;
  if (p.why != null) d.why = txt(p.why, 300);
  return d;
}

export const removeDream = (s, id) => { s.growth.dreams = s.growth.dreams.filter((x) => x.id !== id); };

export function addDreamStep(s, id, text) {
  const d = s.growth.dreams.find((x) => x.id === id);
  if (!d || !txt(text, 120) || d.steps.length >= 30) return null;
  d.steps.push({ id: uid(), text: txt(text, 120), done: null });
  return d;
}

export function toggleDreamStep(s, id, stepId, today, ev = []) {
  const d = s.growth.dreams.find((x) => x.id === id);
  const st = d && d.steps.find((x) => x.id === stepId);
  if (!st) return null;
  st.done = st.done ? null : today;
  if (st.done && !st.xp) { st.xp = true; gainXP(s, d.area, 5, today, ev); }
  return d;
}

export const removeDreamStep = (s, id, stepId) => {
  const d = s.growth.dreams.find((x) => x.id === id);
  if (d) d.steps = d.steps.filter((x) => x.id !== stepId);
};

// Un paso de la lista también puede ir a tus pendientes.
export function dreamStepToTodo(s, id, stepId, today) {
  const d = s.growth.dreams.find((x) => x.id === id);
  const st = d && d.steps.find((x) => x.id === stepId);
  if (!st) return null;
  return addTodo(s, { title: st.text, cat: d.area }, today);
}

const WIN_SCOPE_OF = { laborales: 'profesional', crecimiento: 'academico' };

// Lograrlo da XP y oro; si quieres, también queda en tus logros.
export function completeDream(s, id, p, today, ev = []) {
  const d = s.growth.dreams.find((x) => x.id === id);
  if (!d || d.done) return null;
  d.done = isDay(p && p.day) && p.day <= today ? p.day : today;
  d.note = txt(p && p.note, 300);
  const xp = gainXP(s, d.area, 80, today, ev);
  addGold(s, 40, today);
  ev.push({ type: 'dreamDone', name: d.title, xp });
  if (p && p.asWin) addWin(s, { title: d.title, scope: WIN_SCOPE_OF[d.area] || 'personal', type: 'otro', impact: d.note || d.why, day: d.done }, today, ev);
  checkAchievements(s, today, ev);
  return d;
}

export function reopenDream(s, id) {
  const d = s.growth.dreams.find((x) => x.id === id);
  if (d) d.done = null;
  return d;
}

// ---------- Resumen para Crecimiento y Hoy ----------

export function growthSummary(s, today, balanceOf = null) {
  const g = s.growth;
  const quit = g.quit.filter((q) => !q.archived);
  const targets = g.targets.filter((t) => !t.archived);
  const open = targets.filter((t) => !t.done);
  const best = quit.map((q) => ({ q, days: quitDays(q, today) })).sort((a, b) => b.days - a.days)[0] || null;
  const behind = open.map((t) => ({ t, pr: targetProgress(t, today, balanceOf) })).filter((x) => x.pr.status === 'atrasada');
  return {
    quit: quit.length, best, targets: open.length, targetsDone: targets.length - open.length, behind,
    dreams: g.dreams.filter((d) => !d.done).length, dreamsDone: g.dreams.filter((d) => d.done).length,
    soon: g.dreams.filter((d) => !d.done && d.due && diffDays(today, d.due) <= 30 && d.due >= today),
  };
}
