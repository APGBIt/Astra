// Gemelo digital (2.0): un modelo vivo de tu vida, hecho con lo que ya registras. Como el gemelo digital de una
// planta: muestra el estado de cada sistema, pronostica lo que viene y deja probar cambios antes de hacerlos.
//
// - `systems`: siete sistemas (cuerpo, mente, dinero, vínculos, crecimiento, trabajo y hogar) con un índice de
//   0 a 100, su tendencia frente a las dos semanas anteriores y qué parte lo baja.
// - `constraint`: tu restricción (teoría de restricciones): el sistema que hoy limita a los demás.
// - `cashOutlook`, `levelOutlook`, `vitOutlook`: pronósticos.
// - `risks`: alertas tempranas (mantenimiento predictivo): la falla antes de que ocurra, con días de aviso.
// - `whatIf`: «¿qué pasa si…?» con cuatro palancas.
//
// Todo es puro (recibe el estado y devuelve números) y cada número dice de dónde sale. Nada diagnostica.
import { addDays, diffDays } from '../app/dates.js';
import {
  doneCount, isScheduled, playerLevel, energyMaxFromSleep, fmtHours, duePeople, pendingTodos, choreStatus, recordAlerts, alertStatus,
  txKind, txDOP, inStats, accountOf, dailyGoal, inRecovery,
} from './logic.js';
import { dosesFor } from './health.js';
import { readiness, loadInfo } from './vitals.js';
import { isPleasant, wellbeingInfo } from './mind.js';
import { forecast, dueItems, isCard, moneyTotals } from './money.js';
import { emergencyFund, debtLoad } from './stats.js';
import { monthView } from './overview.js';
import { workInfo, workHours, fmtWorkShort } from './ledger.js';
import { shopOf, runningLow, expiring } from './shop.js';
import { plusOf, ensurePlus } from './plus.js';
import { cuadreOutlook } from './cuadres.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (v) => Math.round(v * 10) / 10;
const rd = (v) => `RD$${Math.round(v).toLocaleString('en-US')}`;
const H = (s, d) => (s.health && s.health[d]) || {};
const range = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
const safe = (fn, fb = null) => { try { return fn(); } catch { return fb; } };
const cuantos = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const SYSTEMS = [
  { key: 'cuerpo', name: 'Cuerpo', area: 'salud', icon: 'heart', href: '/area/salud' },
  { key: 'mente', name: 'Mente', area: 'emocional', icon: 'sparkle', href: '/animo' },
  { key: 'dinero', name: 'Dinero', area: 'finanzas', icon: 'wallet', href: '/finanzas' },
  { key: 'vinculos', name: 'Vínculos', area: 'relaciones', icon: 'people', href: '/personas' },
  { key: 'crecimiento', name: 'Crecimiento', area: 'crecimiento', icon: 'book', href: '/aprender' },
  { key: 'trabajo', name: 'Trabajo', area: 'laborales', icon: 'target', href: '/enfoque' },
  { key: 'hogar', name: 'Hogar', area: null, icon: 'home', href: '/hogar' },
];
export const SYSTEM = Object.fromEntries(SYSTEMS.map((x) => [x.key, x]));

// ---------- Las partes de cada sistema en una ventana de días ----------

function part(label, score, text, w) {
  return score == null || !Number.isFinite(score) ? null : { label, score: clamp(Math.round(score), 0, 100), text, w };
}

function bodyParts(s, from, to) {
  const days = range(from, to);
  const n = days.length;
  const goal = Number(s.profile.sleepGoal) || 7;
  const hs = days.map((d) => H(s, d));
  const sl = hs.map((h) => h.sleep).filter((v) => v != null);
  const out = [];
  if (sl.length >= 4) {
    const avg = mean(sl);
    out.push(part('Sueño', ((avg / goal - 0.7) / 0.3) * 100, `${fmtHours(Math.round(avg * 4) / 4)} por noche (meta ${fmtHours(goal)})`, 35));
  }
  const equiv = hs.reduce((a, h) => a + (h.exercise || 0) + Math.min(h.exercise || 0, h.exVig || 0), 0);
  const anyMove = hs.some((h) => h.exercise != null || h.steps != null);
  if (anyMove) {
    const perWeek = (equiv / n) * 7;
    out.push(part('Movimiento', (perWeek / 150) * 100, `${Math.round(perWeek)} min por semana (meta 150)`, 25));
  }
  const rds = days.map((d) => safe(() => readiness(s, d))).filter(Boolean);
  if (rds.length >= 4) out.push(part('Preparación', mean(rds.map((r) => r.score)), `${Math.round(mean(rds.map((r) => r.score)))} de 100 en promedio`, 20));
  const st = hs.map((h) => h.steps).filter((v) => v != null);
  if (st.length >= 4) {
    const g = dailyGoal(s, 'steps') || 8000;
    out.push(part('Pasos', (mean(st) / g) * 100, `${Math.round(mean(st)).toLocaleString('en-US')} al día (meta ${g.toLocaleString('en-US')})`, 10));
  }
  let mt = 0; let mk = 0;
  for (const d of days) for (const x of safe(() => dosesFor(s, d), [])) { if (!x.status && d === to) continue; mt += 1; if (x.status === 'si') mk += 1; }
  if (mt >= 4) out.push(part('Tomas', (mk / mt) * 100, `${mk} de ${mt} tomas`, 10));
  return out.filter(Boolean);
}

function mindParts(s, from, to) {
  const n = diffDays(from, to) + 1;
  const inW = (d) => d >= from && d <= to;
  const out = [];
  const moods = (s.moods || []).filter((m) => inW(m.day));
  if (moods.length >= 4) {
    const p = moods.filter((m) => isPleasant(m.quad)).length / moods.length;
    out.push(part('Ánimo', 25 + 75 * p, `${Math.round(p * 100)} % de tus momentos fueron agradables`, 40));
  }
  const calmAll = (s.mind && s.mind.calm) || [];
  if (calmAll.length) {
    const min = calmAll.filter((c) => inW(c.day)).reduce((a, c) => a + (c.minutes || 0), 0);
    const perWeek = (min / n) * 7;
    out.push(part('Calma', (perWeek / 30) * 100, `${Math.round(perWeek)} min por semana`, 20));
  }
  const innDays = range(from, to).filter((d) => s.inn && s.inn[d]).length;
  if (Object.keys(s.inn || {}).length) out.push(part('Cierre del día', (innDays / n) * 100, `${innDays} de ${n} noches en la posada`, 20));
  const wb = safe(() => wellbeingInfo(s, to));
  if (wb && wb.last && diffDays(wb.last.day, to) <= 30) out.push(part('Bienestar', wb.last.score, `Chequeo de bienestar: ${wb.last.score} de 100`, 20));
  return out.filter(Boolean);
}

function moneyParts(s, today) {
  const out = [];
  const mt = safe(() => moneyTotals(s, today));
  if (!mt || !mt.ready) return out;
  const mv = safe(() => monthView(s, today));
  if (mv && mv.income > 0) {
    const sc = mv.paceEnd >= 0 ? 100 : 100 - Math.min(100, (Math.abs(mv.paceEnd) / mv.income) * 400);
    out.push(part('Ritmo del mes', sc, mv.paceEnd >= 0 ? `A este ritmo te sobran ${rd(mv.paceEnd)}` : `A este ritmo te faltan ${rd(-mv.paceEnd)}`, 30));
  }
  const ef = safe(() => emergencyFund(s, today));
  if (ef && ef.ready) out.push(part('Colchón', (ef.months / 3) * 100, `${r1(ef.months)} meses de gastos básicos ahorrados (meta 3)`, 25));
  const dl = safe(() => debtLoad(s, today));
  if (dl && dl.dti != null && dl.n > 0) out.push(part('Deudas', ((0.5 - dl.dti) / 0.3) * 100, `${Math.round(dl.dti * 100)} % de lo que entra se va en deudas`, 20));
  const late = safe(() => dueItems(s, today, today, today), []).filter((it) => it.status === 'late' && it.kind === 'gasto' && !it.estimate).length;
  if ((s.money.plans || []).length || late) out.push(part('Pagos al día', 100 - 30 * late, late ? `${cuantos(late, 'pago atrasado', 'pagos atrasados')}` : 'Sin pagos atrasados', 25));
  return out.filter(Boolean);
}

function bondParts(s, from, to) {
  const out = [];
  const people = s.people || [];
  if (!people.length) return out;
  const due = safe(() => duePeople(s, to), []).length;
  out.push(part('Al día', (1 - due / people.length) * 100, due ? `${cuantos(due, 'persona espera', 'personas esperan')} noticias tuyas` : 'Al día con todos', 60));
  const n = diffDays(from, to) + 1;
  const want = people.reduce((a, p) => a + n / Math.max(1, p.every), 0);
  const got = (s.contacts || []).filter((c) => c.day >= from && c.day <= to).length;
  if (want >= 1) out.push(part('Contactos', (got / want) * 100, `${got} de ${Math.round(want)} contactos que te propusiste`, 40));
  return out.filter(Boolean);
}

const activeDays = (s, from, to, area) => range(from, to).filter((d) => { const x = s.days && s.days[d]; return x && x.xpBy && x.xpBy[area] > 0; }).length;

function growthParts(s, from, to) {
  const n = diffDays(from, to) + 1;
  const out = [];
  const act = activeDays(s, from, to, 'crecimiento');
  const ever = (s.attrs && s.attrs.crecimiento > 0) || (s.reads || []).length || (s.practice || []).length;
  if (!ever) return out;
  out.push(part('Constancia', (act / (n * (4 / 7))) * 100, `${act} de ${n} días con algo de crecimiento (meta 4 por semana)`, 60));
  const pages = (s.reads || []).filter((r) => r.day >= from && r.day <= to).reduce((a, r) => a + (r.pages || 0), 0);
  const prac = (s.practice || []).filter((p) => p.day >= from && p.day <= to).reduce((a, p) => a + (p.minutes || 0), 0);
  if ((s.reads || []).length || (s.practice || []).length) out.push(part('Lectura y práctica', ((pages * 2 + prac) / ((n / 7) * 120)) * 100, `${pages} páginas y ${prac} min de práctica`, 40));
  return out.filter(Boolean);
}

function workParts(s, from, to) {
  const n = diffDays(from, to) + 1;
  const out = [];
  const ever = (s.attrs && s.attrs.laborales > 0) || (s.focus || []).length;
  if (!ever) return out;
  const fo = (s.focus || []).filter((f) => f.day >= from && f.day <= to && !f.broken);
  if ((s.focus || []).length) {
    const perWeek = (fo.reduce((a, f) => a + (f.minutes || 0), 0) / n) * 7;
    out.push(part('Enfoque', (perWeek / 125) * 100, `${Math.round(perWeek)} min de enfoque por semana (meta 125)`, 55));
  }
  const act = activeDays(s, from, to, 'laborales');
  out.push(part('Constancia', (act / (n * (4 / 7))) * 100, `${act} de ${n} días con avance`, 45));
  return out.filter(Boolean);
}

function homeParts(s, today) {
  const out = [];
  const chores = (s.chores || []).filter((c) => !c.paused);
  if (chores.length) {
    const late = chores.filter((c) => safe(() => choreStatus(s, c, today).state) === 'late').length;
    out.push(part('Rutinas a tiempo', (1 - late / chores.length) * 100, late ? `${cuantos(late, 'rutina atrasada', 'rutinas atrasadas')} de ${chores.length}` : `${cuantos(chores.length, 'rutina', 'rutinas')} al día`, 50));
  }
  const pend = pendingTodos(s);
  if ((s.todos || []).length) {
    const over = pend.filter((t) => t.due && t.due < today).length;
    out.push(part('Pendientes', 100 - 12 * over, over ? `${cuantos(over, 'pendiente vencido', 'pendientes vencidos')}` : 'Nada vencido', 30));
  }
  const sh = safe(() => shopOf(s));
  if (sh && sh.pantry.length) {
    const low = safe(() => runningLow(s), []).length;
    const exp = safe(() => expiring(s, today, 3), []).length;
    out.push(part('Despensa', 100 - 10 * low - 15 * exp, low || exp ? `${low} por acabarse${exp ? ` y ${exp} por vencer` : ''}` : 'Abastecida', 20));
  }
  return out.filter(Boolean);
}

function partsFor(key, s, from, to) {
  switch (key) {
    case 'cuerpo': return bodyParts(s, from, to);
    case 'mente': return mindParts(s, from, to);
    case 'dinero': return moneyParts(s, to);
    case 'vinculos': return bondParts(s, from, to);
    case 'crecimiento': return growthParts(s, from, to);
    case 'trabajo': return workParts(s, from, to);
    case 'hogar': return homeParts(s, to);
    default: return [];
  }
}

const scoreOf = (parts) => {
  const W = parts.reduce((a, p) => a + p.w, 0);
  return W ? Math.round(parts.reduce((a, p) => a + p.score * p.w, 0) / W) : null;
};

export const zoneOf = (score) => (score == null ? null : score >= 75 ? 'verde' : score >= 50 ? 'amarillo' : 'rojo');
export const ZONE = {
  verde: { label: 'En forma', tone: 'good' },
  amarillo: { label: 'Atento', tone: 'xp' },
  rojo: { label: 'Necesita cuidado', tone: 'vit' },
};

// Los siete sistemas hoy. La tendencia compara las últimas dos semanas con las dos anteriores
// (dinero y hogar miran el estado de hoy, así que no llevan tendencia).
export function systems(s, today, days = 14) {
  const from = addDays(today, -(days - 1));
  const pTo = addDays(from, -1);
  const pFrom = addDays(pTo, -(days - 1));
  return SYSTEMS.map((sys) => {
    const parts = partsFor(sys.key, s, from, today);
    const score = scoreOf(parts);
    const hist = sys.key !== 'dinero' && sys.key !== 'hogar';
    const prev = hist && (s.profile.created || today) <= pFrom ? scoreOf(partsFor(sys.key, s, pFrom, pTo)) : null;
    const weak = [...parts].sort((a, b) => a.score - b.score)[0] || null;
    return {
      ...sys, parts, score, zone: zoneOf(score), prev, trend: score != null && prev != null ? score - prev : null,
      weak: weak && weak.score < 75 ? weak : null,
      conf: parts.length >= 3 ? 'alta' : parts.length === 2 ? 'media' : parts.length === 1 ? 'baja' : null,
    };
  });
}

// Índice de vida: el promedio de los sistemas con datos. Tu restricción: el más bajo (si está por debajo de 75).
export function lifeIndex(list) {
  const on = list.filter((x) => x.score != null);
  if (!on.length) return { score: null, zone: null, n: 0, of: list.length, constraint: null, best: null };
  const score = Math.round(mean(on.map((x) => x.score)));
  const sorted = [...on].sort((a, b) => a.score - b.score);
  return {
    score, zone: zoneOf(score), n: on.length, of: list.length,
    constraint: sorted[0].score < 75 ? sorted[0] : null,
    best: sorted[sorted.length - 1],
    trend: on.every((x) => x.trend == null) ? null : Math.round(mean(on.filter((x) => x.trend != null).map((x) => x.trend))),
  };
}

// ---------- Pronósticos ----------

// Tu gasto del día a día (lo que no es un pago programado) que sale de tus cuentas y efectivo, por día,
// en las últimas 8 semanas. Lo de la tarjeta no se cuenta aquí: llega con el pago de la tarjeta.
export function dailySpend(s, today, weeks = 8) {
  const from = addDays(today, -(weeks * 7));
  const linked = new Set();
  for (const p of (s.money && s.money.plans) || []) for (const id of Object.values(p.done || {})) linked.add(id);
  const perWeek = Array.from({ length: weeks }, () => 0);
  let n = 0;
  for (const t of (s.money && s.money.tx) || []) {
    if (t.day <= from || t.day >= today) continue;
    if (txKind(t) !== 'gasto' || !inStats(t) || linked.has(t.id) || t.adjust || t.taxOf) continue;
    if (t.cat === 'deuda' || t.cat === 'ahorro' || t.to) continue;
    if (isCard(accountOf(s, t.account))) continue;
    const i = Math.min(weeks - 1, Math.floor((diffDays(from, t.day) - 1) / 7));
    perWeek[i] += txDOP(t);
    n += 1;
  }
  const first = (s.money.tx.length ? s.money.tx[s.money.tx.length - 1].day : today);
  const live = Math.min(weeks, Math.max(1, Math.ceil(diffDays(first > from ? first : from, today) / 7)));
  const used = perWeek.slice(weeks - live);
  const sorted = [...used].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
  return { n, weeks: live, mean: mean(used) / 7, low: q(0.25) / 7, high: q(0.75) / 7 };
}

// Tu caja día por día: los cobros y pagos que vienen (los que ya tienes en tu plan) menos tu gasto del día a día.
// `zero`: el primer día en que tus cuentas quedarían en negativo; `min`: el punto más bajo.
export function cashOutlook(s, today, days = 45, { spendPct = 0 } = {}) {
  const fc = safe(() => forecast(s, today, days));
  if (!fc || !fc.ready) return null;
  const ds = dailySpend(s, today);
  const k = 1 - clamp(spendPct, 0, 90) / 100;
  const points = fc.points.map((p, i) => ({ day: p.day, planned: p.bal, bal: Math.round(p.bal - ds.mean * k * i), low: Math.round(p.bal - ds.high * k * i), high: Math.round(p.bal - ds.low * k * i), list: p.list }));
  const zero = points.find((p) => p.bal < 0) || null;
  const zeroLow = points.find((p) => p.low < 0) || null;
  let min = points[0];
  for (const p of points) if (p.bal < min.bal) min = p;
  const income = points.find((p, i) => i > 0 && p.list.some((it) => it.kind === 'ingreso')) || null;
  return {
    start: fc.start, daily: Math.round(ds.mean * k), spend: ds, points, zero, zeroLow, min, end: points[points.length - 1].bal,
    nextIncome: income ? income.day : null, enough: ds.n >= 8,
  };
}

// Cuándo subes de nivel, al ritmo de tus últimos 14 días.
export function levelOutlook(s, today) {
  const lvl = playerLevel(s.xp);
  let xp = 0; let n = 0;
  for (let i = 1; i <= 14; i++) { const d = s.days && s.days[addDays(today, -i)]; if (d) { xp += d.xp || 0; n += 1; } }
  const perDay = n >= 3 ? xp / 14 : null;
  const left = lvl.need - lvl.into;
  const days = perDay > 0 ? Math.ceil(left / perDay) : null;
  return { level: lvl.n, left, perDay: perDay != null ? Math.round(perDay) : null, days, date: days != null ? addDays(today, days) : null };
}

// Hacia dónde va tu vitalidad: la pendiente de los últimos 7 días (mínimos cuadrados).
export function vitOutlook(s, today) {
  const pts = [];
  for (let i = 7; i >= 1; i--) { const d = s.days && s.days[addDays(today, -i)]; if (d && d.vitEnd != null) pts.push([7 - i, d.vitEnd]); }
  pts.push([7, s.vit]);
  if (pts.length < 4) return { vit: s.vit, slope: null, days: null };
  const mx = mean(pts.map((p) => p[0])); const my = mean(pts.map((p) => p[1]));
  const den = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  const slope = den ? pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / den : 0;
  const days = slope < -0.5 && s.vit > 0 ? Math.ceil(s.vit / -slope) : null;
  return { vit: s.vit, slope: r1(slope), days };
}

// ---------- Alertas tempranas (mantenimiento predictivo) ----------

export const RISK_LEVEL = { alta: { label: 'Actúa hoy', tone: 'vit', n: 3 }, media: { label: 'Esta semana', tone: 'xp', n: 2 }, baja: { label: 'Tenlo a la vista', tone: 'muted', n: 1 } };

function burnout(s, today) {
  const days = range(addDays(today, -6), today);
  const goal = Number(s.profile.sleepGoal) || 7;
  const sl = days.map((d) => H(s, d).sleep).filter((v) => v != null);
  const debt = sl.reduce((a, v) => a + Math.max(0, goal - v), 0);
  const signs = [];
  if (sl.length >= 4 && debt >= 5) signs.push(`debes ${fmtHours(Math.round(debt * 4) / 4)} de sueño`);
  const rds = days.map((d) => safe(() => readiness(s, d))).filter(Boolean);
  if (rds.length >= 3 && (mean(rds.map((r) => r.score)) < 50 || rds.filter((r) => r.zone === 'rojo').length >= 3)) signs.push('tu preparación lleva varios días baja');
  const moods = (s.moods || []).filter((m) => m.day >= days[0] && m.day <= today);
  if (moods.length >= 3 && moods.filter((m) => isPleasant(m.quad)).length / moods.length < 0.4) signs.push('la mayoría de tus momentos fueron desagradables');
  const li = safe(() => loadInfo(s, today));
  if (li && li.status === 'salto') signs.push('subiste tu carga de ejercicio de golpe');
  const done = days.reduce((a, d) => a + doneCount(s.days && s.days[d]), 0);
  const planned = days.reduce((a, d) => a + (s.missions || []).filter((m) => m.kind === 'habit' && !m.archived && m.created <= d && isScheduled(m, d)).length, 0);
  if (planned >= 10 && done / planned < 0.4) signs.push('estás cumpliendo menos de la mitad de lo que te propones');
  const rest = days.filter((d) => s.inn && s.inn[d]).length;
  if (signs.length >= 2 && rest <= 1) signs.push('casi no has cerrado el día en la posada');
  return signs;
}

// La lista ordenada: primero lo más grave y lo más cercano. Cada alerta trae cómo prevenirla.
export function risks(s, today, { hour = 12 } = {}) {
  const out = [];
  const add = (r) => out.push({ days: null, ...r });
  // Caja.
  const co = safe(() => cashOutlook(s, today));
  if (co) {
    if (co.zero && co.enough) {
      const n = diffDays(today, co.zero.day);
      add({ id: 'caja', sys: 'dinero', level: n <= 10 ? 'alta' : n <= 25 ? 'media' : 'baja', days: n, title: n <= 0 ? 'Tus cuentas no alcanzan para lo de hoy' : `En ${cuantos(n, 'día', 'días')} tus cuentas quedarían en negativo`, detail: `Con tus pagos programados y gastando ${rd(co.daily)} al día como hasta ahora, llegarías a ${rd(co.zero.bal)}${co.nextIncome && co.nextIncome > co.zero.day ? ' antes de tu próximo cobro' : ''}.`, action: { label: 'Ver lo que viene', href: '/finanzas?tab=plan' }, fix: `Bajar el gasto diario o mover un pago` });
    } else if (co.zeroLow && co.enough) {
      const n = diffDays(today, co.zeroLow.day);
      add({ id: 'caja-justa', sys: 'dinero', level: 'baja', days: n, title: 'Vas justo hasta tu próximo cobro', detail: `Si tienes una semana de las caras (${rd(co.spend.high)} al día), tus cuentas quedarían en negativo en ${cuantos(n, 'día', 'días')}.`, action: { label: 'Ver lo que viene', href: '/finanzas?tab=plan' } });
    }
    // Un pago en los próximos 7 días que hoy no cabe en tus cuentas.
    const big = co.points.slice(0, 8).flatMap((p) => p.list.filter((it) => it.kind === 'gasto' && !it.estimate).map((it) => ({ it, day: p.day, planned: p.planned })));
    const tight = big.find((x) => x.planned < 0);
    if (tight && !(co.zero && diffDays(today, co.zero.day) <= diffDays(today, tight.day))) {
      const n = diffDays(today, tight.day);
      const name = tight.it.type === 'card' ? `la tarjeta ${tight.it.a.name}` : tight.it.type === 'credit' ? `la cuota de ${tight.it.c.name}` : tight.it.p.name;
      add({ id: 'pago-corto', sys: 'dinero', level: 'alta', days: n, title: `No alcanza para ${name}`, detail: `Vence ${n <= 0 ? 'hoy' : `en ${cuantos(n, 'día', 'días')}`} (${rd(tight.it.dop)}) y en tus cuentas habría ${rd(tight.planned + tight.it.dop)}.`, action: { label: 'Ver lo que viene', href: '/finanzas?tab=plan' } });
    }
  }
  const mv = safe(() => monthView(s, today));
  if (mv && mv.income > 0 && mv.over && Number(today.slice(8)) >= 5) {
    const gap = -mv.paceEnd;
    add({ id: 'ritmo', sys: 'dinero', level: gap > mv.income * 0.1 ? 'alta' : 'media', days: mv.daysLeft, title: `A este ritmo te pasas por ${rd(gap)} este mes`, detail: `Gastas ${rd(mv.daily)} al día en el día a día; para llegar a fin de mes te toca ${rd(mv.perDay)}.`, action: { label: 'Ver el mes', href: '/finanzas' }, fix: `Gastar ${rd(mv.perDay)} al día` });
  }
  // Agotamiento.
  const signs = burnout(s, today);
  if (signs.length >= 2) add({ id: 'agotamiento', sys: 'cuerpo', level: signs.length >= 3 ? 'alta' : 'media', title: 'Señales de agotamiento', detail: `Esta semana ${signs.slice(0, 3).join(', ')}. Cuando se juntan, lo que sigue suele ser dejarlo todo unos días.`, action: { label: 'Ver tu preparación', href: '/area/salud' }, fix: 'Dormir tu meta dos noches seguidas y bajar la carga' });
  // Vitalidad.
  const vo = vitOutlook(s, today);
  if (!inRecovery(s, today) && vo.days != null && vo.days <= 7) add({ id: 'vitalidad', sys: 'cuerpo', level: vo.days <= 3 ? 'alta' : 'media', days: vo.days, title: `Tu vitalidad baja ${Math.abs(vo.slope)} por día`, detail: `Vas en ${s.vit}. Si sigue así, en ${cuantos(vo.days, 'día', 'días')} entras en recuperación.`, action: { label: 'Ver por qué baja', href: '/personaje' }, fix: 'Dormir tu meta (+5) y cerrar el día en la posada (+5)' });
  // Racha.
  const st = s.streak || {};
  if (st.count >= 5 && st.lastDay !== today && !(st.freezes > 0) && hour >= 15) add({ id: 'racha', sys: null, level: hour >= 20 ? 'alta' : 'media', days: 0, title: `Tu racha de ${st.count} días se rompe hoy`, detail: 'Todavía no has completado nada hoy y no te quedan protectores.', action: { label: 'Ir a Hoy', href: '/' }, fix: 'Completar una misión' });
  // Documentos.
  for (const a of safe(() => recordAlerts(s, today, 30), []).filter((x) => !alertStatus(s, x.sec.id, x.item)).slice(0, 2)) {
    add({ id: `doc:${a.item.id}`, sys: null, level: a.inDays <= 7 ? 'alta' : 'media', days: Math.max(0, a.inDays), title: a.inDays < 0 ? `Venció: ${a.item.name || a.sec.title}` : `${a.item.name || a.sec.title} vence en ${cuantos(a.inDays, 'día', 'días')}`, detail: 'Está en tu expediente. Renovarlo a tiempo evita filas y recargos.', action: { label: 'Abrir el expediente', href: `/expediente/${a.sec.id}` } });
  }
  // Medicinas.
  let mt = 0; let mk = 0;
  for (const d of range(addDays(today, -14), addDays(today, -1))) for (const x of safe(() => dosesFor(s, d), [])) { mt += 1; if (x.status === 'si') mk += 1; }
  if (mt >= 8 && mk / mt < 0.7) add({ id: 'tomas', sys: 'cuerpo', level: 'media', title: `Tomaste ${Math.round((mk / mt) * 100)} % de tus tomas en 2 semanas`, detail: 'Por debajo del 80 %, un tratamiento suele perder efecto. Si la hora no te funciona, cámbiala.', action: { label: 'Ver tus tomas', href: '/area/salud' } });
  // Personas.
  const far = safe(() => duePeople(s, today), []).filter((x) => x.ratio >= 2)[0];
  if (far) add({ id: `persona:${far.p.id}`, sys: 'vinculos', level: 'baja', title: `Llevas ${far.since} días sin hablar con ${far.p.name}`, detail: `Te propusiste hacerlo cada ${far.p.every} días.`, action: { label: 'Abrir Personas', href: '/personas' } });
  // Pendientes y rutinas.
  const over = pendingTodos(s).filter((t) => t.due && t.due < today);
  const oldest = over.reduce((a, t) => (!a || t.due < a.due ? t : a), null);
  if (over.length >= 5 || (oldest && diffDays(oldest.due, today) > 14)) add({ id: 'pendientes', sys: 'hogar', level: over.length >= 8 ? 'media' : 'baja', title: `${cuantos(over.length, 'pendiente vencido', 'pendientes vencidos')}`, detail: oldest ? `El más viejo, «${oldest.title}», venció hace ${diffDays(oldest.due, today)} días. Lo que se queda vencido deja de verse.` : '', action: { label: 'Repartir la semana', href: '/mando?ver=copiloto' }, fix: 'Decidir cada uno: hacerlo, darle fecha o borrarlo' });
  // Despensa.
  const out0 = safe(() => runningLow(s), []);
  const exp = safe(() => expiring(s, today, 2), []);
  if (exp.length) add({ id: 'vence', sys: 'hogar', level: 'baja', days: 2, title: `${cuantos(exp.length, 'producto se vence', 'productos se vencen')} en 2 días`, detail: exp.slice(0, 3).map((x) => x.name).join(', '), action: { label: 'Ver la despensa', href: '/compras?ver=despensa' } });
  else if (out0.length >= 4) add({ id: 'despensa', sys: 'hogar', level: 'baja', title: `${out0.length} productos por acabarse`, detail: out0.slice(0, 4).map((x) => x.name).join(', '), action: { label: 'Ver la lista', href: '/compras' } });
  // Colchón.
  const ef = safe(() => emergencyFund(s, today));
  if (ef && ef.ready && ef.monthsAll != null && ef.monthsAll < 1) add({ id: 'colchon', sys: 'dinero', level: 'baja', title: 'Menos de un mes de colchón', detail: `Entre tus cuentas y ahorros tienes para ${r1(ef.monthsAll)} meses de gastos básicos. Un imprevisto te llevaría a endeudarte.`, action: { label: 'Ver tu fondo', href: '/finanzas?tab=analisis' } });
  // 2.1: lo que se escapa sin anotar (sale de cuadrar con el banco) y las cuentas que hace mucho no cuadras.
  const cq = safe(() => cuadreOutlook(s, today));
  if (cq) {
    const inc = safe(() => monthView(s, today).income, 0) || 0;
    if (cq.daily != null && cq.daily < 0 && cq.conf && -cq.perMonth >= Math.max(500, inc * 0.02)) {
      add({ id: 'fuga', sys: 'dinero', level: inc > 0 && -cq.perMonth >= inc * 0.08 ? 'media' : 'baja', title: `Se te escapan ${rd(-cq.perMonth)} al mes sin anotar`, detail: `Es lo que falta, en promedio, cada vez que cuadras tus cuentas con el banco (${rd(-cq.daily)} al día).${cq.trend === 'peor' ? ' Y va en aumento.' : ''}`, action: { label: 'Ver sobrantes y faltantes', href: '/cuadres' }, fix: 'Anotar cada gasto el mismo día y cuadrar cada semana' });
    }
    const old = [...cq.accounts.filter((r) => r.since >= 21), ...cq.never.filter((r) => r.since >= 21)].sort((a, b) => b.since - a.since)[0];
    if (old) add({ id: `cuadre:${old.a.id}`, sys: 'dinero', level: 'baja', title: `Hace ${old.since} días que no cuadras ${old.a.name}`, detail: old.exp != null && Math.abs(old.exp) >= 100 ? `Con tu ritmo, espera que ${old.exp < 0 ? 'falten' : 'sobren'} unos ${rd(Math.abs(old.exp))}. Mientras más esperas, más difícil es saber qué fue.` : 'Mientras más esperas, más difícil es saber qué fue cada diferencia.', action: { label: 'Cuadrar ahora', href: `/finanzas?tab=cuentas&cuenta=${old.a.id}` } });
  }
  const snooze = plusOf(s).snooze;
  return out
    .filter((r) => !(snooze[`r:${r.id}`] >= today))
    .sort((a, b) => (RISK_LEVEL[b.level].n - RISK_LEVEL[a.level].n) || ((a.days ?? 99) - (b.days ?? 99)));
}

// ---------- ¿Qué pasa si…? ----------

export const LEVERS = [
  { key: 'sleepMin', label: 'Dormir más', unit: 'min por noche', min: 0, max: 90, step: 15, icon: 'moon' },
  { key: 'spendPct', label: 'Gastar menos en el día a día', unit: '%', min: 0, max: 30, step: 5, icon: 'wallet' },
  { key: 'moveDays', label: 'Moverme más', unit: 'días de 30 min por semana', min: 0, max: 4, step: 1, icon: 'heart' },
  { key: 'saveMonthly', label: 'Apartar cada mes', unit: 'RD$', min: 0, max: 20000, step: 1000, icon: 'coin' },
];

// Lo que cambiaría con cada palanca, calculado con tus últimas 4 semanas. Cada efecto dice su supuesto.
export function whatIf(s, today, lv = {}) {
  const L = { sleepMin: 0, spendPct: 0, moveDays: 0, saveMonthly: 0, ...lv };
  const out = [];
  const days = range(addDays(today, -28), addDays(today, -1));
  const goal = Number(s.profile.sleepGoal) || 7;
  // Sueño: cuántas noches cambian de estado y cuánta energía ganas.
  const nights = days.map((d) => H(s, d).sleep).filter((v) => v != null);
  if (L.sleepMin > 0 && nights.length >= 7) {
    const add = L.sleepMin / 60;
    const rested = (xs) => xs.filter((v) => v >= goal).length;
    const tired = (xs) => xs.filter((v) => v < goal - 0.5).length;
    const after = nights.map((v) => v + add);
    const en = (xs) => mean(xs.map((v) => energyMaxFromSleep(v, goal)));
    const e0 = en(nights); const e1 = en(after);
    const per = 28 / nights.length;
    out.push({ key: 'descanso', sys: 'cuerpo', label: 'Noches en tu meta', before: `${Math.round(rested(nights) * per)} de 28`, after: `${Math.round(rested(after) * per)} de 28`, text: `Cada noche en tu meta da +10 % de XP y +5 de vitalidad; pasarías de ${Math.round(tired(nights) * per)} a ${Math.round(tired(after) * per)} noches con cansancio.` });
    if (e1 - e0 >= 0.2) out.push({ key: 'energia', sys: 'cuerpo', label: 'Energía por día', before: r1(e0), after: r1(e1), text: `Unas ${Math.round((e1 - e0) * 7)} de energía más por semana: lo que cuestan ${cuantos(Math.max(1, Math.round(((e1 - e0) * 7) / 1.5)), 'misión mediana', 'misiones medianas')}.` });
    const debt0 = nights.slice(-7).reduce((a, v) => a + Math.max(0, goal - v), 0);
    const debt1 = after.slice(-7).reduce((a, v) => a + Math.max(0, goal - v), 0);
    if (debt0 > 0) out.push({ key: 'deuda', sys: 'cuerpo', label: 'Deuda de sueño de la semana', before: fmtHours(Math.round(debt0 * 4) / 4), after: fmtHours(Math.round(debt1 * 4) / 4), text: 'Menos deuda sube tu preparación de cada mañana.' });
  }
  // Gasto: cuánto queda y cuándo se acaba la caja.
  const base = safe(() => cashOutlook(s, today, 45));
  if (L.spendPct > 0 && base && base.enough) {
    const alt = cashOutlook(s, today, 45, { spendPct: L.spendPct });
    const perMonth = (base.daily - alt.daily) * 30;
    const wi = safe(() => workInfo(s, today));
    const hrs = wi ? workHours(perMonth, wi) : null;
    out.push({ key: 'gasto', sys: 'dinero', label: 'Gasto del día a día', before: `${rd(base.daily)} al día`, after: `${rd(alt.daily)} al día`, text: `${rd(perMonth)} al mes y ${rd(perMonth * 12)} al año${hrs ? ` (${fmtWorkShort(hrs, wi)} de tu trabajo cada mes)` : ''}.` });
    out.push({ key: 'caja', sys: 'dinero', label: 'Tu punto más bajo en 45 días', before: rd(base.min.bal), after: rd(alt.min.bal), text: base.zero && !alt.zero ? 'Con ese cambio tus cuentas ya no quedarían en negativo.' : base.zero && alt.zero ? `Seguirían en negativo, ${diffDays(base.zero.day, alt.zero.day)} días más tarde.` : 'Más margen antes de tu próximo cobro.' });
  }
  // Movimiento.
  if (L.moveDays > 0) {
    const equiv = days.reduce((a, d) => { const h = H(s, d); return a + (h.exercise || 0) + Math.min(h.exercise || 0, h.exVig || 0); }, 0);
    const w0 = Math.round(equiv / 4); const w1 = w0 + L.moveDays * 30;
    out.push({ key: 'movimiento', sys: 'cuerpo', label: 'Minutos de actividad por semana', before: `${w0} min`, after: `${w1} min`, text: w1 >= 150 && w0 < 150 ? 'Llegarías a los 150 min por semana que recomienda la OMS.' : w1 >= 150 ? 'Sigues sobre los 150 min de la OMS; hasta 300 hay beneficio extra.' : `Te faltarían ${150 - w1} min para los 150 de la OMS.` });
  }
  // Ahorro.
  if (L.saveMonthly > 0) {
    const ef = safe(() => emergencyFund(s, today));
    const year = L.saveMonthly * 12;
    let text = `${rd(year)} en un año.`;
    if (ef && ef.ready && ef.monthly > 0) {
      const left = Math.max(0, ef.goal3 - ef.saved);
      text = left > 0 ? `Completarías tu fondo de 3 meses en ${Math.ceil(left / L.saveMonthly)} meses.` : `Tu fondo de 3 meses ya está; en un año sumarías ${r1(year / ef.monthly)} meses más de colchón.`;
    }
    out.push({ key: 'ahorro', sys: 'dinero', label: 'Ahorro en 12 meses', before: rd(0), after: rd(year), text });
  }
  return out;
}

export function setLever(s, key, value) {
  const lv = LEVERS.find((x) => x.key === key);
  if (!lv) return null;
  const p = ensurePlus(s);
  p.sim[key] = clamp(Math.round(Number(value) / lv.step) * lv.step, lv.min, lv.max);
  return p.sim;
}

// Resumen para la tarjeta de Hoy y el Centro de mando.
export function twinSummary(s, today, opts = {}) {
  const list = systems(s, today);
  const idx = lifeIndex(list);
  const rk = risks(s, today, opts);
  return { list, idx, risks: rk, top: rk[0] || null, high: rk.filter((r) => r.level === 'alta').length };
}

