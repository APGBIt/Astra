// Copiloto (2.0): mira todo lo que hay en la app y propone el siguiente paso. Es el «sistema que decide» de
// una planta 4.0 aplicado a tu día: en vez de recorrer 40 pantallas para ver qué toca, una sola respuesta.
//
// - `candidates`: todo lo que podrías hacer ahora, con puntaje y la razón (urgencia, importancia, tu energía,
//   tu preparación de hoy, la hora y tu restricción: el sistema de tu vida que hoy está más bajo).
// - `nextUp`: lo siguiente (uno) y dos alternativas.
// - `dayPlan`: el plan del día con horas, hasta tu hora de dormir, según el tiempo libre que tienes.
// - `levelWeek`: reparte los pendientes de la semana para que ningún día quede sobrecargado (heijunka).
//
// Es puro. Posponer un aviso se guarda en `s.plus.snooze`.
import { addDays, diffDays, weekday } from '../app/dates.js';
import { AREA } from './content.js';
import {
  dayMissions, energyInfo, inRecovery, todosDue, pendingTodos, duePeople, upcomingBirthdays, recordAlerts, alertStatus, dueCards,
  timeToMin, minToTime, fmtClock, dailyGoal, postponeTodo, isScheduled, fmtHours,
} from './logic.js';
import { dosesFor } from './health.js';
import { readiness, sleepNeed, bedtimeForNeed } from './vitals.js';
import { dueItems } from './money.js';
import { shopSummary } from './shop.js';
import { planWeek, PLAN_KIND, ROUTINE, routineMinutes } from './routines.js';
import { reportDue } from './report.js';
import { risks, systems, lifeIndex, SYSTEM } from './twin.js';
import { kaizenRunning } from './lean.js';
import { ensurePlus, plusOf } from './plus.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rd = (v) => `RD$${Math.round(v).toLocaleString('en-US')}`;
const safe = (fn, fb = null) => { try { return fn(); } catch { return fb; } };
const cuantos = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const H = (s, d) => (s.health && s.health[d]) || {};

// A qué hora conviene acostarse hoy (si pusiste a qué hora te levantas).
export function bedtime(s, today) {
  const wake = s.profile.wakeGoal;
  if (!wake) return null;
  const need = safe(() => sleepNeed(s, today));
  if (!need) return null;
  const t = bedtimeForNeed(s, wake, need.need);
  return t ? { time: t, min: timeToMin(t), need: need.need, wake } : null;
}

const SYS_OF_AREA = { salud: 'cuerpo', emocional: 'mente', finanzas: 'dinero', relaciones: 'vinculos', crecimiento: 'crecimiento', laborales: 'trabajo' };

// ---------- Todo lo que podrías hacer ahora ----------

export function candidates(s, today, { hour = new Date().getHours(), minute = 0, twin = null } = {}) {
  const now = hour * 60 + minute;
  const out = [];
  const push = (c) => out.push({ mins: 5, cost: 0, area: null, icon: 'check', do: null, href: '/', ...c });
  const en = energyInfo(s, today);
  const rdy = safe(() => readiness(s, today));
  const h = H(s, today);
  const list = twin || safe(() => systems(s, today), []);
  const idx = lifeIndex(list);
  const weakSys = idx.constraint ? idx.constraint.key : null;

  if (inRecovery(s, today)) push({ id: 'recuperacion', kind: 'recovery', title: 'Haz una misión de recuperación', why: 'Tu vitalidad llegó a cero. Cada misión suave te devuelve el doble.', icon: 'heart', area: 'salud', href: '/recuperacion', score: 96 });

  // Dinero: lo vencido y lo de hoy.
  for (const it of safe(() => dueItems(s, today, addDays(today, 3), today), [])) {
    if (it.estimate) continue;
    const name = it.type === 'card' ? `la tarjeta ${it.a.name}` : it.type === 'credit' ? `la cuota de ${it.c.name}` : it.p.name;
    const key = it.type === 'card' ? `c:${it.a.id}` : it.type === 'credit' ? `q:${it.c.id}` : `p:${it.p.id}`;
    const n = diffDays(today, it.date);
    if (it.kind === 'ingreso') {
      if (n <= 0) push({ id: `cobro:${key}:${it.date}`, kind: 'income', title: `¿Ya recibiste ${name.toLowerCase()}?`, why: `Lo esperabas ${n === 0 ? 'hoy' : `hace ${cuantos(-n, 'día', 'días')}`}. Anotarlo deja tus cuentas al día.`, icon: 'wallet', area: 'finanzas', href: '/finanzas?tab=plan', mins: 2, score: 52 });
      continue;
    }
    if (it.status === 'late') push({ id: `pago:${key}:${it.date}`, kind: 'pay', title: `Pagar ${name}`, why: `Venció hace ${cuantos(-n, 'día', 'días')} (${rd(it.dop)}). Cada día suma recargo o mora.`, icon: 'wallet', area: 'finanzas', href: '/finanzas?tab=plan', mins: 5, score: 94 });
    else if (n === 0) push({ id: `pago:${key}:${it.date}`, kind: 'pay', title: `Pagar ${name}`, why: `Vence hoy (${rd(it.dop)}).`, icon: 'wallet', area: 'finanzas', href: '/finanzas?tab=plan', mins: 5, score: 86 });
    else if (it.type !== 'plan') push({ id: `pago:${key}:${it.date}`, kind: 'pay', title: `Pagar ${name}`, why: `Vence en ${cuantos(n, 'día', 'días')} (${rd(it.dop)}). Hoy te quita un pendiente de encima.`, icon: 'wallet', area: 'finanzas', href: '/finanzas?tab=plan', mins: 5, score: 58 });
  }

  // Tomas.
  for (const d of safe(() => dosesFor(s, today), [])) {
    if (d.status) continue;
    const t = timeToMin(d.time);
    if (t == null || t > now + 30) continue;
    const late = now - t;
    push({ id: `toma:${d.key}`, kind: 'dose', title: `Tomar ${d.med.name}`, why: late > 60 ? `Tocaba a las ${fmtClock(d.time)}.` : `Toca a las ${fmtClock(d.time)}.`, icon: 'pill', area: 'salud', do: { type: 'dose', key: d.key }, href: '/area/salud', mins: 1, score: late > 60 ? 92 : 90 });
  }

  // La mañana: sueño, cómo amaneciste e intención.
  if (h.sleep == null && hour < 15) push({ id: 'sueno', kind: 'sleep', title: 'Anota cómo dormiste', why: 'Con eso se calcula tu energía de hoy y tu preparación.', icon: 'moon', area: 'salud', do: { type: 'sleep' }, mins: 1, score: 72 });
  if (h.sleep != null && !h.ready && hour >= 5 && hour < 12) push({ id: 'amanecer', kind: 'ready', title: '¿Cómo amaneciste?', why: 'Cuatro toques y sabes si hoy conviene exigirte o ir suave.', icon: 'sun', area: 'salud', href: '/area/salud?checkin=1', mins: 1, score: 66 });

  // Pendientes vencidos y de hoy.
  for (const t of safe(() => todosDue(s, today), [])) {
    const late = t.due < today ? diffDays(t.due, today) : 0;
    const chore = t.chore ? (s.chores || []).find((c) => c.id === t.chore) : null;
    push({
      id: `pend:${t.id}`, kind: t.chore ? 'chore' : 'todo', title: t.title,
      why: late ? `Venció hace ${cuantos(late, 'día', 'días')}${t.important ? ' y es importante' : ''}.` : t.important ? 'Es para hoy y lo marcaste importante.' : 'Es para hoy.',
      icon: t.chore ? 'home' : 'list', area: null, do: { type: 'todo', id: t.id }, href: `/pendientes/${t.id}`, mins: chore ? chore.mins || 15 : 15,
      score: (late ? 78 + Math.min(10, late) : 68) + (t.important ? 8 : 0) - (t.chore ? 6 : 0),
    });
  }

  // Misiones de hoy.
  const dm = safe(() => dayMissions(s, today), { pending: [] });
  for (const m of dm.pending) {
    if (m.auto) continue;
    let score = 58 + (m.penalty ? 14 : 0) + ((s.profile.classKeys || []).includes(m.area) ? 4 : 0) + (m.campaignId ? 5 : 0);
    let why = m.penalty ? 'Si no la haces hoy, te quita vitalidad.' : m.campaignId ? 'Avanza tu campaña.' : `Suma a ${AREA[m.area] ? AREA[m.area].attr : 'tu día'}.`;
    if (m.cost > en.left) { score -= 25; why = `Pide ${m.cost} de energía y te queda ${en.left}. ${why}`; } else if (rdy && rdy.zone === 'rojo' && m.cost >= 2) { score -= 15; why = `Hoy tu preparación está baja: si puedes, hazla suave. ${why}`; } else if (rdy && rdy.zone === 'verde' && m.cost >= 2 && hour < 13) { score += 8; why = `Estás en tu mejor momento del día para lo que más cuesta. ${why}`; }
    if (weakSys && SYS_OF_AREA[m.area] === weakSys) { score += 6; why = `${why} ${SYSTEM[weakSys].name} es hoy tu sistema más bajo.`; }
    push({ id: `mision:${m.id}`, kind: 'mission', title: m.title, why, icon: 'sword', area: m.area, do: { type: 'mission', id: m.id }, href: `/mision/${m.id}`, mins: m.cost * 15, cost: m.cost, score });
  }

  // Plan de movimiento.
  const wk = safe(() => planWeek(s, today));
  if (wk && wk.todayKind && !wk.todayDone && hour >= 6) {
    const k = PLAN_KIND[wk.todayKind];
    const r = k && ROUTINE[k.routine];
    if (r) push({ id: 'movimiento', kind: 'move', title: `Hoy toca: ${k.label.toLowerCase()}`, why: rdy && rdy.zone === 'rojo' ? 'Tu preparación está baja: hazla suave o cambia por una caminata.' : `${r.title}, guiada y sin equipo.`, icon: r.icon || 'heart', area: 'salud', href: `/area/salud?rutina=${r.id}`, mins: routineMinutes(r), score: (hour >= 12 ? 62 : 56) + (weakSys === 'cuerpo' ? 6 : 0) });
  }

  // Expediente, cumpleaños y personas.
  for (const a of safe(() => recordAlerts(s, today, 30), []).filter((x) => !alertStatus(s, x.sec.id, x.item)).slice(0, 2)) {
    push({ id: `doc:${a.item.id}`, kind: 'doc', title: `Renovar: ${a.item.name || a.sec.title}`, why: a.inDays < 0 ? `Venció hace ${cuantos(-a.inDays, 'día', 'días')}.` : `Vence en ${cuantos(a.inDays, 'día', 'días')}.`, icon: 'folder', href: `/expediente/${a.sec.id}`, mins: 10, score: 60 + (a.inDays <= 7 ? 15 : 0) });
  }
  for (const b of safe(() => upcomingBirthdays(s, today, 0), [])) push({ id: `cumple:${b.p.id}`, kind: 'person', title: `Felicita a ${b.p.name}`, why: 'Hoy es su cumpleaños.', icon: 'gift', area: 'relaciones', href: '/personas', mins: 3, score: 80 });
  const ppl = safe(() => duePeople(s, today), []);
  if (ppl[0]) push({ id: `persona:${ppl[0].p.id}`, kind: 'person', title: `Escríbele a ${ppl[0].p.name}`, why: `Hace ${ppl[0].since} días que no hablan; te propusiste cada ${ppl[0].p.every}.`, icon: 'people', area: 'relaciones', href: '/personas', mins: 5, score: 36 + Math.min(20, Math.round((ppl[0].ratio - 1) * 20)) + (weakSys === 'vinculos' ? 6 : 0) });

  // Compras.
  const shop = safe(() => shopSummary(s, today));
  if (shop) {
    if (shop.shopDay && shop.pending) push({ id: 'compras', kind: 'shop', title: 'Hacer la compra', why: `Hoy es tu día de compras y tienes ${cuantos(shop.pending, 'producto', 'productos')} en la lista.`, icon: 'cart', area: 'finanzas', href: '/compras', mins: 60, score: 52 });
    else if (shop.expiring) push({ id: 'vence', kind: 'shop', title: `Usar lo que se vence: ${shop.expList.slice(0, 2).map((x) => x.name).join(' y ')}`, why: 'Se vence en los próximos días. Cocinarlo hoy es no botarlo.', icon: 'box', href: '/compras?ver=despensa', mins: 5, score: 46 });
  }

  // Agua, ánimo, informe, tarjetas de estudio.
  const wGoal = dailyGoal(s, 'water') || 8;
  if (hour >= 11 && hour < 21 && (h.water || 0) < wGoal * clamp((hour - 7) / 14, 0, 1) * 0.6) push({ id: 'agua', kind: 'water', title: 'Toma un vaso de agua', why: `Llevas ${h.water || 0} de ${wGoal} y ya va más de medio día.`, icon: 'drop', area: 'salud', do: { type: 'water' }, mins: 1, score: 28 });
  if (hour >= 12 && !(s.moods || []).some((m) => m.day === today)) push({ id: 'animo', kind: 'mood', title: '¿Cómo te sientes?', why: 'Un check-in al día es lo que permite ver qué te sube y qué te baja.', icon: 'sparkle', area: 'emocional', href: '/animo', mins: 1, score: 30 + (weakSys === 'mente' ? 8 : 0) });
  const rep = safe(() => reportDue(s, today, hour));
  if (rep) push({ id: `informe:${rep}`, kind: 'report', title: 'Lee tu informe de la semana', why: 'Tus logros, lo que conviene mejorar y un foco para esta semana.', icon: 'chart', href: `/informe?semana=${rep}`, mins: 3, score: 44 });
  const cards = safe(() => dueCards(s, today), []).length;
  if (cards) push({ id: 'tarjetas', kind: 'cards', title: `Repasar ${cuantos(cards, 'tarjeta', 'tarjetas')}`, why: 'Tocan hoy: repasarlas a tiempo es lo que las fija.', icon: 'book', area: 'crecimiento', href: '/aprender', mins: Math.min(10, cards), score: 30 + (weakSys === 'crecimiento' ? 8 : 0) });

  // Kaizen de la semana.
  const kz = safe(() => kaizenRunning(s));
  if (kz && hour >= 7 && hour < 12) push({ id: `kaizen:${kz.id}:${today}`, kind: 'kaizen', title: `Tu mejora de la semana: ${kz.text}`, why: 'Es el experimento que elegiste. Un paso hoy.', icon: 'target', href: '/mando?ver=lean', mins: 5, score: 40 });

  // La noche: posada y hora de dormir.
  if (hour >= 18 && !(s.inn && s.inn[today])) push({ id: 'posada', kind: 'inn', title: 'Cierra el día en la posada', why: hour >= 21 ? 'Tres cosas buenas y a qué hora te acuestas: +5 de vitalidad.' : 'Cuando termines lo de hoy: +5 de vitalidad.', icon: 'moon', area: 'emocional', href: '/posada', mins: 3, score: hour >= 21 ? 82 : 50 });
  const bt = bedtime(s, today);
  if (bt) {
    // Pasada la medianoche la hora de dormir de «hoy» ya fue: se compara en un reloj que empieza al mediodía.
    const rel = (m) => (m - 720 + 1440) % 1440;
    if (rel(now) >= rel(bt.min) - 30 && (hour >= 19 || hour < 4)) push({ id: 'dormir', kind: 'bed', title: 'Hora de acostarte', why: `Para dormir ${fmtHours(bt.need)} y levantarte a las ${fmtClock(bt.wake)}, acuéstate a las ${fmtClock(bt.time)}.`.replace(/\.\.$/, '.'), icon: 'moon', area: 'salud', href: '/posada', mins: 0, score: 88 });
  }

  // Alertas tempranas del gemelo que piden actuar.
  for (const r of safe(() => risks(s, today, { hour }), [])) {
    if (r.level === 'baja') continue;
    if (['racha'].includes(r.id) && out.some((c) => c.kind === 'mission')) continue;
    if (out.some((c) => c.kind === 'pay') && (r.id === 'pago-corto')) continue;
    push({ id: `r:${r.id}`, kind: 'risk', title: r.title, why: r.fix ? `${r.detail} Cómo evitarlo: ${r.fix.toLowerCase()}.` : r.detail, icon: 'shield', area: r.sys && SYSTEM[r.sys] ? SYSTEM[r.sys].area : null, href: r.action.href, mins: 5, score: r.level === 'alta' ? 76 : 48, risk: r });
  }

  const snooze = plusOf(s).snooze;
  return out
    .filter((c) => !(snooze[c.id] >= today))
    .sort((a, b) => (b.score - a.score) || (a.mins - b.mins));
}

// Lo siguiente y dos alternativas (de tipos distintos, para que elegir sea rápido).
export function nextUp(s, today, opts = {}) {
  const list = candidates(s, today, opts);
  const next = list[0] || null;
  const alt = [];
  for (const c of list.slice(1)) {
    if (alt.length >= 2) break;
    if (next && c.kind === next.kind && list.length > 4) continue;
    if (alt.some((x) => x.kind === c.kind)) continue;
    alt.push(c);
  }
  return { next, alt, total: list.length, list };
}

// «Ahora no»: lo esconde por hoy (o hasta un día).
export function snooze(s, id, today, until = today) {
  const p = ensurePlus(s);
  p.snooze[id] = until >= today ? until : today;
  return p.snooze;
}
export function unsnooze(s, id) {
  const p = ensurePlus(s);
  delete p.snooze[id];
}

// ---------- El plan del día ----------

const FLEX = new Set(['mission', 'todo', 'chore', 'move', 'pay', 'person', 'shop', 'doc', 'cards', 'kaizen', 'risk', 'recovery']);

// Tiempo libre de hoy (minutos) según tus preferencias y lo que queda del día.
export function freeMinutes(s, today, now, bedMin = null) {
  const cfg = plusOf(s).cfg;
  const wd = weekday(today);
  const base = wd === 0 || wd === 6 ? cfg.freeWeekend : cfg.freeWeek;
  const end = bedMin != null && bedMin > 12 * 60 ? bedMin : 22 * 60 + 30;
  const left = Math.max(0, end - now);
  // De lo que queda del día, como mucho la mitad es tuya (el resto es trabajo, comer, traslados).
  return Math.round(Math.min(base, left * 0.5));
}

export function dayPlan(s, today, { hour = new Date().getHours(), minute = 0 } = {}) {
  const now = hour * 60 + minute;
  const bt = bedtime(s, today);
  const bedMin = bt && bt.min > 12 * 60 ? bt.min : null;
  const list = candidates(s, today, { hour, minute });
  const rdy = safe(() => readiness(s, today));
  // Con la preparación en rojo, el plan se queda en lo esencial: 60 % del tiempo.
  const soft = !!(rdy && rdy.zone === 'rojo');
  const cap = Math.round(freeMinutes(s, today, now, bedMin) * (soft ? 0.6 : 1));
  // Lo flexible: primero lo urgente; en un día verde, lo que más cuesta va temprano.
  const flex = list.filter((c) => FLEX.has(c.kind));
  const quick = list.filter((c) => !FLEX.has(c.kind) && c.kind !== 'inn' && c.kind !== 'bed');
  const order = [...flex].sort((a, b) => {
    const ua = a.score >= 76 ? 1 : 0; const ub = b.score >= 76 ? 1 : 0;
    if (ua !== ub) return ub - ua;
    if (rdy && rdy.zone === 'verde' && hour < 13 && a.cost !== b.cost) return b.cost - a.cost;
    return b.score - a.score;
  });
  const blocks = [];
  const later = [];
  let t = Math.ceil(now / 5) * 5;
  let used = 0;
  for (const c of quick) { blocks.push({ at: minToTime(t), mins: c.mins, item: c, quick: true }); t += Math.max(1, c.mins); }
  for (const c of order) {
    const m = Math.max(5, c.mins);
    if (used + m > cap && c.score < 76) { later.push(c); continue; }
    blocks.push({ at: minToTime(t), mins: m, item: c });
    t += m + 5; used += m;
  }
  const end = bedMin != null ? bedMin : 22 * 60 + 30;
  const inn = list.find((c) => c.kind === 'inn');
  if (!(s.inn && s.inn[today])) {
    const at = Math.max(t, end - 30);
    blocks.push({ at: minToTime(at), mins: 3, item: inn || { id: 'posada', kind: 'inn', title: 'Cierra el día en la posada', why: 'Tres cosas buenas y a dormir.', icon: 'moon', href: '/posada', mins: 3, score: 50 }, fixed: true });
  }
  if (bt) blocks.push({ at: bt.time, mins: 0, item: { id: 'dormir', kind: 'bed', title: 'A dormir', why: `Para levantarte a las ${fmtClock(bt.wake)} con ${fmtHours(bt.need)} de sueño.`, icon: 'moon', href: '/posada', mins: 0, score: 88 }, fixed: true });
  const movable = later.filter((c) => c.do && c.do.type === 'todo');
  return { blocks, later, movable, used, cap, soft, over: later.length > 0, bed: bt, ends: minToTime(t) };
}

// ---------- Nivelar la semana (heijunka) ----------

// Carga de cada uno de los próximos 7 días (minutos): pendientes con fecha y misiones del día.
export function weekLoad(s, today) {
  const days = Array.from({ length: 7 }, (_, i) => ({ day: addDays(today, i), mins: 0, todos: [], missions: 0 }));
  const at = (d) => days[diffDays(today, d)] || null;
  for (const t of pendingTodos(s)) {
    if (!t.due) continue;
    const slot = at(t.due < today ? today : t.due);
    if (!slot) continue;
    const chore = t.chore ? (s.chores || []).find((c) => c.id === t.chore) : null;
    const mins = chore ? chore.mins || 15 : 15;
    slot.todos.push({ t, mins, late: t.due < today });
    slot.mins += mins;
  }
  for (const d of days) {
    const ms = (s.missions || []).filter((m) => m.kind === 'habit' && !m.archived && !m.auto && m.created <= d.day && isScheduled(m, d.day));
    d.missions = ms.length;
    d.mins += ms.reduce((a, m) => a + m.cost * 15, 0);
  }
  const cfg = plusOf(s).cfg;
  for (const d of days) { const wd = weekday(d.day); d.cap = wd === 0 || wd === 6 ? cfg.freeWeekend : cfg.freeWeek; d.over = d.mins > d.cap; }
  return days;
}

// Propone mover pendientes de los días sobrecargados al día más libre de la semana (nunca los importantes
// ni los que vencen por fuera: solo cambia la fecha de los que tú pusiste para ese día).
export function levelWeek(s, today) {
  const days = weekLoad(s, today).map((d) => ({ ...d, todos: [...d.todos] }));
  const moves = [];
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    const movable = d.todos.filter((x) => !x.t.important && !x.t.repeat).sort((a, b) => b.mins - a.mins);
    while (d.mins > d.cap && movable.length) {
      const x = movable.shift();
      // El día con más espacio después de este.
      let best = null;
      for (let j = i + 1; j < days.length; j++) {
        const room = days[j].cap - days[j].mins;
        if (room >= x.mins && (!best || room > best.room)) best = { j, room };
      }
      if (!best) break;
      d.mins -= x.mins; d.todos = d.todos.filter((y) => y !== x);
      days[best.j].mins += x.mins; days[best.j].todos.push(x);
      moves.push({ id: x.t.id, title: x.t.title, from: d.day, to: days[best.j].day, mins: x.mins });
    }
  }
  const before = weekLoad(s, today);
  return { before, after: days.map((d) => ({ day: d.day, mins: d.mins, cap: d.cap, over: d.mins > d.cap })), moves, overDays: before.filter((d) => d.over).length };
}

export function applyLevel(s, moves) {
  let n = 0;
  for (const m of moves || []) if (postponeTodo(s, m.id, m.to)) n += 1;
  return n;
}

export function setFree(s, { week, weekend }) {
  const p = ensurePlus(s);
  if (week != null) p.cfg.freeWeek = clamp(Math.round(Number(week) / 15) * 15, 15, 600);
  if (weekend != null) p.cfg.freeWeekend = clamp(Math.round(Number(weekend) / 15) * 15, 15, 900);
  return p.cfg;
}
