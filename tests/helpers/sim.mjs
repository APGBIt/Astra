// Una persona que usa Astra todos los días, con las funciones reales de la app. Sirve para probar lo que solo
// se ve con historia (gemelo, alertas, OEE) y para sembrar el recorrido en el navegador.
// Determinista: misma semilla, mismos datos (salvo los identificadores).
import * as L from '../../src/game/logic.js';
import * as M from '../../src/game/money.js';
import * as V from '../../src/game/vitals.js';
import * as S from '../../src/game/shop.js';
import { addDays, weekday } from '../../src/app/dates.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PROFILES = {
  // Constante: cumple casi todo, duerme bien y gasta con medida.
  constante: { mission: 0.82, todo: 0.8, sleep: 7.3, sleepSd: 0.7, inn: 0.8, mood: 0.75, spend: 1, chore: 0.85, people: 0.7, exercise: 0.6 },
  // Apurada: duerme poco, deja cosas para después y gasta de más.
  apurada: { mission: 0.42, todo: 0.16, sleep: 5.9, sleepSd: 0.9, inn: 0.3, mood: 0.4, spend: 1.45, chore: 0.4, people: 0.2, exercise: 0.2 },
};

export function simulate({ end = '2026-11-15', days = 90, seed = 7, profile = 'constante', money = true } = {}) {
  const P = typeof profile === 'string' ? PROFILES[profile] : profile;
  const r = rng(seed);
  const norm = () => { let u = 0; for (let i = 0; i < 6; i++) u += r(); return (u - 3) / 0.707; };
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const start = addDays(end, -days);
  const s = L.defaultState(start);
  s.profile.onboarded = true;
  s.profile.name = 'Ana Prueba';
  s.profile.sleepGoal = 7;
  s.profile.wakeGoal = '06:30';
  const ev = [];

  // Dinero: cuenta, ahorro, tarjeta y pagos fijos.
  let bank = null; let card = null;
  if (money) {
    bank = L.addAccount(s, { name: 'Banco', kind: 'cuenta', bank: 'BHD', last4: '1234' });
    const save = L.addAccount(s, { name: 'Ahorro', kind: 'cuenta', bank: 'APAP', last4: '9911', save: true });
    card = L.addAccount(s, { name: 'Visa', kind: 'tarjeta', bank: 'BHD', last4: '4321', limit: { DOP: 80000, USD: 0 }, cut: 20, due: 12 });
    M.setAccountBalance(s, bank.id, { DOP: 38000 }, start);
    M.setAccountBalance(s, save.id, { DOP: 60000 }, start);
    M.setAccountBalance(s, card.id, { DOP: 0 }, start);
    s.money.fx.manual = 60;
    M.addPlan(s, { kind: 'ingreso', name: 'Salario', amount: 42000, cat: 'salario', account: bank.id, freq: { type: 'month', days: [15, 30] }, start }, start);
    M.addPlan(s, { kind: 'gasto', name: 'Alquiler', amount: 22000, cat: 'vivienda', account: bank.id, freq: { type: 'month', days: [1] }, start }, start);
    M.addPlan(s, { kind: 'gasto', name: 'Luz', amount: 2600, cat: 'servicios', account: bank.id, freq: { type: 'month', days: [10] }, start, variable: true }, start);
    M.addPlan(s, { kind: 'gasto', name: 'Internet', amount: 1850, cat: 'servicios', account: bank.id, freq: { type: 'month', days: [5] }, start }, start);
    M.addPlan(s, { kind: 'gasto', name: 'Netflix', amount: 560, cat: 'suscripciones', account: bank.id, freq: { type: 'month', days: [12] }, start }, start);
    M.addPlan(s, { kind: 'gasto', name: 'Gimnasio', amount: 1500, cat: 'suscripciones', account: bank.id, freq: { type: 'month', days: [3] }, start }, start);
  }

  // Misiones, rutinas del hogar y personas.
  const walk = L.addMission(s, { title: 'Caminar 30 minutos', area: 'salud', cost: 2, kind: 'habit', penalty: true }, start);
  const read = L.addMission(s, { title: 'Leer 20 minutos', area: 'crecimiento', cost: 1, kind: 'habit' }, start);
  const calm = L.addMission(s, { title: 'Meditar 5 minutos', area: 'emocional', cost: 1, kind: 'habit' }, start);
  const study = L.addMission(s, { title: 'Avanzar el proyecto', area: 'laborales', cost: 2, kind: 'habit', days: [1, 2, 3, 4, 5] }, start);
  L.addMission(s, { title: 'Sin refrescos', area: 'salud', cost: 1, kind: 'avoid' }, start);
  const habits = [walk, read, calm, study];
  L.addChore(s, { title: 'Lavar la ropa', freq: { type: 'every', n: 7, unit: 'day' }, mins: 40 }, start);
  L.addChore(s, { title: 'Limpiar el baño', freq: { type: 'every', n: 7, unit: 'day' }, mins: 25 }, start);
  L.addChore(s, { title: 'Cambiar las sábanas', freq: { type: 'every', n: 14, unit: 'day' }, mins: 10 }, start);
  const people = [
    L.addPerson(s, { name: 'Mamá', circle: 'Familia', every: 7 }, start),
    L.addPerson(s, { name: 'Carla', circle: 'Amistad', every: 14 }, start),
    L.addPerson(s, { name: 'Luis', circle: 'Amistad', every: 30 }, start),
  ];
  const book = L.addBook(s, { title: 'Hábitos atómicos', pages: 320 });

  const TODOS = ['Llamar al banco', 'Renovar el seguro', 'Enviar el informe', 'Comprar regalo', 'Cita con el dentista', 'Revisar el carro', 'Pagar el colegio', 'Ordenar el clóset', 'Responder correos', 'Sacar copias'];
  const SPENDS = [['comida', 'Comedor', 380, 120], ['transporte', 'Uber', 260, 90], ['cafe', 'Café', 190, 40], ['super', 'Nacional', 2400, 700], ['delivery', 'PedidosYa', 850, 200], ['ocio', 'Cine', 900, 300], ['salud', 'Farmacia', 650, 250]];
  const BUY = ['leche', 'huevos', 'pan', 'arroz', 'pollo', 'café', 'aceite', 'queso'];

  for (let i = 0; i <= days; i++) {
    const d = addDays(start, i);
    const wd = weekday(d);
    const isLast = i === days;
    L.reconcile(s, d);
    // Mañana: sueño y cómo amaneció.
    const tired = wd === 1 ? -0.4 : wd === 6 || wd === 0 ? 0.5 : 0;
    const sleep = Math.max(3.5, Math.min(9.5, P.sleep + tired + norm() * P.sleepSd));
    if (r() < 0.92) L.logHealth(s, d, { sleep, quality: sleep >= 7 ? 3 : 2 }, d, ev);
    if (r() < 0.7) V.logReady(s, d, { e: sleep >= 7 ? 4 : sleep >= 6 ? 3 : 2, m: 3 + (r() < 0.3 ? 1 : 0), a: 3, d: r() < 0.2 ? 2 : 4 }, d, ev);
    // Misiones.
    for (const m of habits) {
      if (!L.isScheduled(m, d)) continue;
      if (isLast && m !== walk) continue; // hoy todavía queda por hacer
      if (r() < P.mission) L.completeMission(s, m.id, d, ev);
    }
    if (!isLast) {
      // Salud.
      L.logHealth(s, d, { steps: Math.round(4500 + r() * 6000 * (P.exercise + 0.4)), water: Math.round(3 + r() * 6) }, d, ev);
      if (r() < P.exercise) L.logHealth(s, d, { exercise: pick([25, 30, 40, 50]), intensity: r() < 0.3 ? 'intensa' : 'moderada', type: 'caminar' }, d, ev);
      // Ánimo, enfoque, lectura, personas.
      if (r() < P.mood) L.addMood(s, { quad: sleep < 6 ? pick([0, 2, 2]) : pick([1, 3, 3, 2]), words: [] }, d, ev);
      if (wd >= 1 && wd <= 5 && r() < P.mission) L.finishFocus(s, { minutes: 25, label: 'Proyecto' }, d, ev);
      if (r() < P.mission * 0.6) L.logPages(s, book.id, 8, d, ev);
      for (const p of people) if (L.personStatus(p, d).due && r() < P.people) L.contactPerson(s, p.id, 'llamada', d, ev);
      // Pendientes: entran casi a diario; se cierran según la persona.
      if (r() < 0.75) L.addTodo(s, { title: pick(TODOS), due: addDays(d, Math.floor(r() * 4)), important: r() < 0.25 }, d);
      for (const t of L.todosDue(s, d)) if (r() < (t.chore ? P.chore : P.todo)) L.completeTodo(s, t.id, d, ev);
    }
    // Dinero.
    if (money) {
      for (const o of M.planOccurrences(s, d, d, d)) {
        if (o.status === 'done') continue;
        const late = o.p.kind === 'gasto' && r() > P.todo + 0.15;
        if (late && !isLast) continue; // se le pasa; lo paga otro día (o queda atrasado)
        if (isLast && o.p.kind === 'gasto') continue;
        L.addTx(s, { amount: o.p.amount, type: o.p.kind, cat: o.p.cat, merchant: o.p.name, account: bank.id, day: d, link: { plan: o.p.id, date: o.date } }, d, ev);
      }
      // Pagos atrasados de días anteriores.
      if (!isLast) for (const it of M.dueItems(s, d, d, d)) {
        if (it.type === 'plan' && it.status === 'late' && it.kind === 'gasto' && r() < 0.35) L.addTx(s, { amount: it.amount, type: 'gasto', cat: it.p.cat, merchant: it.p.name, account: bank.id, day: d, link: { plan: it.p.id, date: it.date } }, d, ev);
      }
      if (!isLast) {
        const n = 1 + (r() < 0.6 ? 1 : 0) + (r() < 0.25 * P.spend ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const [cat, merchant, base, sd] = wd === 6 && k === 0 ? SPENDS[3] : pick(SPENDS.filter((x) => x[0] !== 'super'));
          const amount = Math.max(60, Math.round((base + norm() * sd) * P.spend));
          L.addTx(s, { amount, type: 'gasto', cat, merchant, account: r() < 0.25 ? card.id : bank.id, day: d }, d, ev);
        }
      }
    }
    // Compras: sábado, con lista.
    if (wd === 6 && !isLast) {
      S.parseAndAdd(s, BUY.filter(() => r() < 0.7).join(', ') || 'leche', { today: d });
      for (const it of S.shopOf(s).items) S.toggleItem(s, it.id, d);
      S.closeTrip(s, { list: S.shopOf(s).lists[0].id, total: 0, saveTx: false, day: d }, d, ev);
    }
    // Noche: posada.
    if (!isLast && r() < P.inn) L.saveInn(s, { mood: 'bien', goods: ['Un buen día'], bed: sleep >= 7 ? '22:45' : '00:15', wake: '06:30', routine: [] }, d, ev);
  }
  return s;
}
