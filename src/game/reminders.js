// Avisos en el teléfono (1.8): qué avisar hoy y mañana, a qué hora y con qué texto.
// Es puro: recibe el estado y la hora, y devuelve la lista. Quien los muestra es app/notify.js (y el service worker).
import { addDays, diffDays } from '../app/dates.js';
import { dayMissions, todosDue, accountLabel } from './logic.js';
import { dueItems } from './money.js';
import { quitDays, QUIT_MILESTONES } from './growth.js';
import { openLoans, leftOf } from './loans.js';
import { dosesFor } from './health.js';

export const NOTIFY_KINDS = [
  { key: 'resumen', label: 'Resumen de la mañana', help: 'Misiones, pendientes y pagos del día.', time: 'morning' },
  { key: 'pagos', label: 'Pagos, cobros y tarjetas', help: 'Unos días antes de que venzan y el mismo día.', time: 'morning' },
  { key: 'misiones', label: 'Misiones de la tarde', help: 'Si te faltan misiones del día.', time: 'afternoon' },
  { key: 'posada', label: 'Cierre del día', help: 'La posada: cómo te fue y tu intención de mañana.', time: 'evening' },
  { key: 'dejar', label: 'Días sin lo que quieres dejar', help: 'Cuando cumples 1, 3, 7, 14, 21, 30… días.', time: 'morning' },
  { key: 'metas', label: 'Metas con progreso', help: 'El domingo, si una meta lleva una semana sin avance.', time: 'evening' },
  { key: 'animo', label: 'Cómo te sientes', help: 'Un check-in de ánimo a media tarde.', time: 'afternoon' },
  { key: 'medicinas', label: 'Medicinas y suplementos', help: 'A la hora de cada toma que pusiste en Salud.', time: 'exact' },
];

export function defaultNotify() {
  return {
    on: false,
    kinds: { resumen: true, pagos: true, misiones: true, posada: true, dejar: true, metas: true, animo: false, medicinas: true },
    morning: '08:00', afternoon: '17:30', evening: '20:30', quietFrom: '22:00', quietTo: '07:00',
  };
}

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
export function ensureNotify(s) {
  const d = defaultNotify();
  const n = s.settings.notify && typeof s.settings.notify === 'object' ? s.settings.notify : {};
  s.settings.notify = {
    on: !!n.on,
    kinds: { ...d.kinds, ...(n.kinds && typeof n.kinds === 'object' ? Object.fromEntries(Object.entries(n.kinds).filter(([k]) => k in d.kinds).map(([k, v]) => [k, !!v])) : {}) },
    morning: HM.test(n.morning) ? n.morning : d.morning,
    afternoon: HM.test(n.afternoon) ? n.afternoon : d.afternoon,
    evening: HM.test(n.evening) ? n.evening : d.evening,
    quietFrom: HM.test(n.quietFrom) ? n.quietFrom : d.quietFrom,
    quietTo: HM.test(n.quietTo) ? n.quietTo : d.quietTo,
  };
}

const mins = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const toHM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// Si la hora cae en tus horas de silencio, pasa al final del silencio.
export function outOfQuiet(hm, cfg) {
  const t = mins(hm); const a = mins(cfg.quietFrom); const b = mins(cfg.quietTo);
  if (a === b) return hm;
  const inQuiet = a < b ? t >= a && t < b : t >= a || t < b;
  return inQuiet ? toHM(b) : hm;
}

// Fecha y hora local → milisegundos.
export function atOf(day, hm) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, Number(hm.slice(0, 2)), Number(hm.slice(3, 5)), 0, 0).getTime();
}

const rd = (v) => `RD$${Math.round(v).toLocaleString('en-US')}`;
const lower = (t) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : '');
const whenWord = (n) => (n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`);

// Lo que se avisa en un día. `today` es el día real (para saber qué ya pasó).
function forDay(s, day, today, cfg) {
  const out = [];
  const k = cfg.kinds;
  const push = (kind, time, title, body, url, id) => out.push({ id: `${day}:${id || kind}`, kind, day, at: atOf(day, outOfQuiet(cfg[time], cfg)), title, body, url, tag: `astra-${id || kind}` });
  const name = (s.profile.name || '').split(' ')[0];

  // Pagos: el día del aviso que pusiste (o 3 días antes), el día anterior y el mismo día.
  const due = s.money ? dueItems(s, day, addDays(day, 14), today) : [];
  const payToday = [];
  if (k.pagos) {
    for (const it of due) {
      if (it.estimate) continue;
      const n = diffDays(day, it.date);
      if (n < 0) continue;
      const lead = it.type === 'plan' ? (Number(it.p.remind) >= 0 ? Number(it.p.remind) : 3) : it.type === 'credit' ? it.c.remind : 3;
      if (!(n === 0 || n === 1 || n === lead)) continue;
      if (it.type === 'credit') {
        const amt = it.currency === 'USD' ? `US$${it.amount.toFixed(2)}` : rd(it.amount);
        push('pagos', 'morning', n === 0 ? `Hoy toca la cuota de ${it.c.name}` : `La cuota de ${it.c.name} vence ${whenWord(n)}`, `${amt}${it.status === 'late' ? ' · está atrasada' : ''}. Si ya la pagaste, anótala en Astra.`, '#/finanzas?tab=deudas', `credit-${it.c.id}-${it.n}-${n}`);
        if (n === 0) payToday.push(it.c.name);
      } else if (it.type === 'card') {
        const owe = [it.toPay.DOP > 0 ? rd(it.toPay.DOP) : '', it.toPay.USD > 0 ? `US$${it.toPay.USD.toFixed(2)}` : ''].filter(Boolean).join(' y ');
        push('pagos', 'morning', n === 0 ? `Hoy vence tu ${accountLabel(it.a)}` : `Tu ${accountLabel(it.a)} vence ${whenWord(n)}`, `Para no pagar intereses, paga ${owe}.`, '#/finanzas?tab=plan', `card-${it.a.id}-${it.date}-${n}`);
        if (n === 0) payToday.push(accountLabel(it.a));
      } else if (it.kind === 'ingreso') {
        if (n === 0) push('pagos', 'morning', `Hoy cobras: ${it.p.name}`, `${it.p.variable ? '≈ ' : ''}${rd(it.dop)}. Cuando llegue, márcalo como recibido.`, '#/finanzas?tab=plan', `plan-${it.p.id}-${it.date}`);
      } else {
        push('pagos', 'morning', n === 0 ? `Hoy vence: ${it.p.name}` : `${it.p.name} vence ${whenWord(n)}`, `${it.p.variable ? 'Aproximadamente ' : ''}${rd(it.dop)}${it.status === 'late' ? ' · está atrasado' : ''}.`, '#/finanzas?tab=plan', `plan-${it.p.id}-${it.date}-${n}`);
        if (n === 0) payToday.push(it.p.name);
      }
    }
  }

  // Préstamos con personas (1.10): 3 días antes, el día anterior y el mismo día de la fecha acordada.
  if (k.pagos && s.money) {
    for (const l of openLoans(s)) {
      if (!l.due) continue;
      const n = diffDays(day, l.due);
      if (!(n === 0 || n === 1 || n === 3)) continue;
      const amt = l.currency === 'USD' ? `US$${leftOf(l).toFixed(2)}` : rd(leftOf(l));
      if (l.dir === 'me') push('pagos', 'morning', n === 0 ? `Hoy ${l.who} quedó en devolverte ${amt}` : `${l.who} quedó en devolverte ${amt} ${whenWord(n)}`, 'Si ya te pagó, anota el abono en Astra.', '#/finanzas?tab=deudas', `loan-${l.id}-${n}`);
      else push('pagos', 'morning', n === 0 ? `Hoy vence lo que le debes a ${l.who}` : `Lo que le debes a ${l.who} vence ${whenWord(n)}`, `Faltan ${amt}.`, '#/finanzas?tab=deudas', `loan-${l.id}-${n}`);
    }
  }

  // Medicinas y suplementos (1.10): a la hora exacta de cada toma (sin pasar por las horas de silencio).
  if (k.medicinas) {
    for (const d of dosesFor(s, day)) {
      if (d.status) continue;
      out.push({ id: `${day}:med-${d.key}`, kind: 'medicinas', day, at: atOf(day, d.time), title: `Hora de ${d.med.name}`, body: `${d.med.dose ? `${d.med.dose}. ` : ''}Márcala como tomada en Astra.`, url: '#/area/salud', tag: `astra-med-${d.key}` });
    }
  }

  if (k.resumen) {
    const { pending } = dayMissions(s, day);
    const todos = todosDue(s, day);
    const parts = [];
    if (pending.length) parts.push(`${pending.length} ${pending.length === 1 ? 'misión' : 'misiones'}`);
    if (todos.length) parts.push(`${todos.length} ${todos.length === 1 ? 'pendiente' : 'pendientes'}`);
    if (payToday.length) parts.push(`vence ${payToday.slice(0, 2).join(' y ')}`);
    const top = todos.find((t) => t.important) || todos[0];
    if (parts.length) push('resumen', 'morning', `Buenos días${name ? `, ${name}` : ''}`, `Hoy: ${parts.join(' · ')}.${top ? ` Primero: ${top.title}.` : ''}`, '#/');
  }

  if (k.dejar && s.growth) {
    for (const q of s.growth.quit) {
      if (q.archived) continue;
      const n = quitDays(q, day);
      if (QUIT_MILESTONES.includes(n)) push('dejar', 'morning', `${n === 1 ? 'Un día' : `${n} días`} sin ${lower(q.name)}`, q.why ? `Recuerda por qué: ${q.why}` : 'Cada día cuenta. Sigue así.', '#/metas?ver=dejar', `quit-${q.id}-${n}`);
    }
  }

  // Misiones de la tarde y cierre del día: solo para hoy (mañana se recalcula al abrir).
  if (day === today) {
    if (k.misiones) {
      const { pending } = dayMissions(s, day);
      if (pending.length) push('misiones', 'afternoon', `Te ${pending.length === 1 ? 'falta 1 misión' : `faltan ${pending.length} misiones`} de hoy`, pending.slice(0, 3).map((m) => m.title).join(' · '), '#/');
    }
    if (k.animo && !(s.moods || []).some((m) => m.day === day)) push('animo', 'afternoon', '¿Cómo te sientes ahora?', 'Un check-in de 20 segundos: ponle nombre a lo que sientes.', '#/animo');
    if (k.posada && !(s.inn && s.inn[day])) push('posada', 'evening', 'Cierra tu día en la posada', 'Cómo te fue, tres cosas buenas y tu intención de mañana.', '#/posada');
  }

  if (k.metas && s.growth && new Date(atOf(day, '12:00')).getDay() === 0) {
    const stale = s.growth.targets.filter((t) => !t.archived && !t.done && !t.link && (!t.log[0] || diffDays(t.log[0].day, day) >= 7));
    if (stale.length) push('metas', 'evening', '¿Cómo vas con tus metas?', `Anota tu avance de la semana: ${stale.slice(0, 2).map((t) => t.name).join(' y ')}.`, '#/metas?ver=metas');
  }
  return out;
}

// Avisos de hoy (los que faltan) y de mañana.
export function buildReminders(s, now = new Date(), today = null) {
  const cfg = s.settings.notify;
  if (!cfg || !cfg.on) return [];
  const d0 = today || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const t = now.getTime();
  return [...forDay(s, d0, d0, cfg), ...forDay(s, addDays(d0, 1), d0, cfg)]
    .filter((r) => r.at > t - 60000)
    .sort((a, b) => a.at - b.at)
    .slice(0, 40);
}
