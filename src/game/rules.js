// Automatizaciones (2.0): «si pasa esto → haz esto». Reglas pequeñas que Astra cumple sola cuando ocurre
// algo que ya registras (cobras, duermes poco, lees una etiqueta, terminas la compra) o cuando llega un día
// y una hora. Viven en `s.plus.rules`; lo que hicieron queda anotado en `s.plus.ruleLog`.
//
// El motor es puro: compara el estado de antes con el de después de cada cambio, y aplica la acción sobre el
// de después. Las acciones de una regla no disparan otras reglas (no hay cadenas ni ciclos).
import { addTodo, txKind, txDOP, uid } from './logic.js';
import { parseAndAdd } from './shop.js';
import { ensurePlus, plusOf } from './plus.js';
import { addDays, weekday } from '../app/dates.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const txt = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
const clampN = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
const okTime = (t) => (/^([01]?\d|2[0-3]):[0-5]\d$/.test(t || '') ? t.padStart(5, '0') : null);
const DAYS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
const rd = (v) => `RD$${Math.round(v).toLocaleString('en-US')}`;
const clock = (t) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'a. m.' : 'p. m.'}`; };

export const RULE_MAX = 30;
export const RULE_DAILY = 5; // una misma regla, como mucho tantas veces al día

// Cuándo se dispara una regla.
export const WHEN = {
  income: { label: 'Cuando registro un ingreso', icon: 'cash', fields: ['min'] },
  expense: { label: 'Cuando hago un gasto grande', icon: 'card', fields: ['min'] },
  sleep: { label: 'Cuando duermo poco', icon: 'moon', fields: ['hours'] },
  vit: { label: 'Cuando mi vitalidad baja', icon: 'heart', fields: ['level'] },
  trip: { label: 'Cuando termino una compra', icon: 'cart', fields: [] },
  tag: { label: 'Cuando leo una etiqueta', icon: 'nfc', fields: ['tag'] },
  time: { label: 'Un día y una hora', icon: 'clock', fields: ['days', 'at'] },
};
// Qué hace.
export const THEN = {
  todo: { label: 'Crear un pendiente', icon: 'list', fields: ['title', 'due'] },
  shop: { label: 'Agregar a la lista de compras', icon: 'cart', fields: ['text'] },
  note: { label: 'Mostrarme un aviso', icon: 'bell', fields: ['text'] },
};

function cleanWhen(s, w) {
  if (!isObj(w) || !WHEN[w.type]) return null;
  if (w.type === 'income') return { type: 'income', min: clampN(w.min, 0, 1e9, 0) };
  if (w.type === 'expense') { const min = Number(w.min); return Number.isFinite(min) && min > 0 ? { type: 'expense', min: Math.min(min, 1e9) } : null; }
  if (w.type === 'sleep') return { type: 'sleep', hours: clampN(w.hours, 3, 9, 6) };
  if (w.type === 'vit') return { type: 'vit', level: clampN(w.level, 5, 95, 40) };
  if (w.type === 'trip') return { type: 'trip' };
  if (w.type === 'tag') return plusOf(s).tags.some((t) => t.id === w.tag) ? { type: 'tag', tag: w.tag } : null;
  const at = okTime(w.at);
  const days = [...new Set((Array.isArray(w.days) ? w.days : []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
  return at && days.length ? { type: 'time', days, at } : null;
}
function cleanThen(t) {
  if (!isObj(t) || !THEN[t.type]) return null;
  if (t.type === 'todo') { const title = txt(t.title, 100); return title.length >= 2 ? { type: 'todo', title, due: t.due === 'manana' ? 'manana' : 'hoy' } : null; }
  const text = txt(t.text, t.type === 'shop' ? 60 : 140);
  return text.length >= 2 ? { type: t.type, text } : null;
}

// La regla dicha en una frase: «Cuando registro un ingreso → pendiente «Apartar para el ahorro»».
export function ruleText(s, r) {
  const w = r.when; const t = r.then;
  let a = '';
  if (w.type === 'income') a = w.min > 0 ? `Cuando registro un ingreso de ${rd(w.min)} o más` : 'Cuando registro un ingreso';
  else if (w.type === 'expense') a = `Cuando hago un gasto de ${rd(w.min)} o más`;
  else if (w.type === 'sleep') a = `Cuando duermo menos de ${String(w.hours).replace('.5', ' y media')} horas`;
  else if (w.type === 'vit') a = `Cuando mi vitalidad baja de ${w.level}`;
  else if (w.type === 'trip') a = 'Cuando termino una compra';
  else if (w.type === 'tag') { const tag = plusOf(s).tags.find((x) => x.id === w.tag); a = `Cuando leo la etiqueta «${tag ? tag.name : 'borrada'}»`; }
  else a = `${w.days.length === 7 ? 'Todos los días' : `Los ${w.days.map((d) => DAYS[d]).join(', ').replace(/, ([^,]*)$/, ' y $1')}`} a las ${clock(w.at)}`;
  const b = t.type === 'todo' ? `pendiente «${t.title}»${t.due === 'manana' ? ' para mañana' : ''}` : t.type === 'shop' ? `«${t.text}» a la lista de compras` : `aviso «${t.text}»`;
  return { when: a, then: b, full: `${a} → ${b}` };
}

export const rulesOf = (s) => plusOf(s).rules;

export function addRule(s, p, today, nowMin = null) {
  const when = cleanWhen(s, p.when); const then = cleanThen(p.then);
  if (!when || !then) return null;
  const pl = ensurePlus(s);
  if (pl.rules.length >= RULE_MAX) return null;
  const r = { id: `r${uid()}`, on: true, when, then, created: today, runs: 0, last: null, day: null, n: 0 };
  // Una regla de hora creada después de su hora no se dispara ese mismo día.
  if (when.type === 'time' && nowMin != null) r.madeAt = nowMin;
  pl.rules.push(r);
  return r;
}
export function updateRule(s, id, p) {
  const r = ensurePlus(s).rules.find((x) => x.id === id);
  if (!r) return null;
  if (p.on !== undefined) r.on = !!p.on;
  if (p.when !== undefined) { const w = cleanWhen(s, p.when); if (w) r.when = w; }
  if (p.then !== undefined) { const t = cleanThen(p.then); if (t) r.then = t; }
  return r;
}
export function removeRule(s, id) {
  const pl = ensurePlus(s);
  pl.rules = pl.rules.filter((r) => r.id !== id);
}

// ---------- El motor ----------

// Hace la acción de una regla sobre el estado y la deja anotada. Devuelve el aviso para mostrar, o null.
function fire(s, r, today, why) {
  if (r.day !== today) { r.day = today; r.n = 0; }
  if (r.n >= RULE_DAILY) return null;
  const t = r.then;
  let text = '';
  let href = null;
  if (t.type === 'todo') {
    const due = t.due === 'manana' ? addDays(today, 1) : today;
    // Si ya hay uno igual sin hacer para ese día, no se repite.
    if (s.todos.some((x) => !x.done && x.title === t.title && x.due === due)) return null;
    if (!addTodo(s, { title: t.title, due, src: `regla:${r.id}` }, today)) return null;
    text = `Pendiente creado: ${t.title}`; href = '/pendientes';
  } else if (t.type === 'shop') {
    const res = parseAndAdd(s, t.text, { today, by: 'regla' });
    if (!res || !(res.added.length + res.merged.length)) return null;
    text = `${t.text}: a tu lista de compras`; href = '/compras';
  } else {
    text = t.text;
  }
  r.n += 1; r.runs = (r.runs || 0) + 1; r.last = today;
  const pl = ensurePlus(s);
  pl.ruleLog.unshift({ id: uid(), rule: r.id, day: today, text, why });
  if (pl.ruleLog.length > 60) pl.ruleLog.length = 60;
  return { type: 'rule', text, why, href, icon: THEN[t.type].icon };
}

const newOnes = (before, after) => {
  if (!Array.isArray(after) || !Array.isArray(before) || after.length <= before.length) return [];
  const had = new Set(before.map((x) => x && x.id));
  return after.filter((x) => x && !had.has(x.id));
};

// Después de cada cambio: ¿pasó algo que alguna regla espera? `prev` es el estado de antes y `next` el de después
// (sobre el que se aplican las acciones). Devuelve los avisos.
export function runRules(prev, next, today) {
  const rules = isObj(next.plus) && Array.isArray(next.plus.rules) ? next.plus.rules : null;
  if (!rules || !rules.length || !prev) return [];
  const active = rules.filter((r) => r && r.on && r.when && r.then && r.when.type !== 'time');
  if (!active.length) return [];
  const out = [];
  const need = (type) => active.some((r) => r.when.type === type);
  const push = (r, why) => { const m = fire(next, r, today, why); if (m) out.push(m); };

  if (need('income') || need('expense')) {
    const txs = newOnes(prev.money && prev.money.tx, next.money && next.money.tx).filter((t) => !t.parent && !t.noStats);
    // Importar muchos movimientos de una vez (un estado de cuenta) no dispara reglas: son cosas que ya pasaron.
    if (txs.length && txs.length <= 3) {
      for (const t of txs) {
        const kind = txKind(t); const amt = txDOP(t);
        for (const r of active) {
          if (r.when.type === 'income' && kind === 'ingreso' && amt >= (r.when.min || 0)) push(r, `Ingreso de ${rd(amt)}`);
          if (r.when.type === 'expense' && kind === 'gasto' && amt >= r.when.min) push(r, `Gasto de ${rd(amt)}`);
        }
      }
    }
  }
  if (need('sleep')) {
    const a = ((prev.health || {})[today] || {}).sleep; const b = ((next.health || {})[today] || {}).sleep;
    if (a == null && b != null) for (const r of active) if (r.when.type === 'sleep' && b < r.when.hours) push(r, `Dormiste ${String(Math.round(b * 10) / 10)} h`);
  }
  if (need('vit')) {
    for (const r of active) if (r.when.type === 'vit' && prev.vit >= r.when.level && next.vit < r.when.level) push(r, `Vitalidad en ${Math.round(next.vit)}`);
  }
  if (need('trip')) {
    const trips = newOnes(prev.shop && prev.shop.trips, next.shop && next.shop.trips);
    if (trips.length === 1) for (const r of active) if (r.when.type === 'trip') push(r, 'Compra terminada');
  }
  if (need('tag')) {
    const before = new Map(((prev.plus && prev.plus.tags) || []).map((t) => [t.id, t.lastAt || 0]));
    for (const t of next.plus.tags || []) {
      if ((t.lastAt || 0) > (before.get(t.id) || 0)) for (const r of active) if (r.when.type === 'tag' && r.when.tag === t.id) push(r, `Etiqueta ${t.name}`);
    }
  }
  return out;
}

// Reglas de día y hora: se revisan al abrir la app y cada minuto mientras está abierta. Si la app estaba
// cerrada a esa hora, se cumplen al abrirla ese mismo día (no se acumulan de días anteriores).
export function tickRules(s, today, nowMin) {
  const rules = isObj(s.plus) && Array.isArray(s.plus.rules) ? s.plus.rules : [];
  const out = [];
  const wd = weekday(today);
  for (const r of rules) {
    if (!r || !r.on || !r.when || r.when.type !== 'time' || !r.then) continue;
    if (!r.when.days.includes(wd) || r.timeDay === today) continue;
    const [h, m] = r.when.at.split(':').map(Number);
    if (nowMin < h * 60 + m) continue;
    r.timeDay = today;
    // Creada hoy después de su hora: empieza la próxima vez.
    if (r.created === today && r.madeAt != null && r.madeAt > h * 60 + m) continue;
    const msg = fire(s, r, today, `${DAYS[wd].replace(/s$/, '')} ${clock(r.when.at)}`);
    if (msg) out.push(msg);
  }
  return out;
}

// ---------- Recetas: reglas listas para activar con un toque ----------

export function ruleIdeas(s) {
  const have = new Set(rulesOf(s).map((r) => `${r.when.type}>${r.then.type}`));
  const ideas = [
    { key: 'cobro', why: 'Págate primero: lo que apartas el día que cobras no se gasta.', when: { type: 'income', min: 5000 }, then: { type: 'todo', title: 'Apartar para el ahorro antes de gastar', due: 'hoy' } },
    { key: 'sueno', why: 'Un día con poco sueño se arregla esa misma noche.', when: { type: 'sleep', hours: 6 }, then: { type: 'todo', title: 'Acostarme una hora antes', due: 'hoy' } },
    { key: 'gasto', why: 'Regla de las 24 horas: mirar con calma un gasto grande evita repetirlo.', when: { type: 'expense', min: 5000 }, then: { type: 'todo', title: 'Revisar el gasto grande de ayer', due: 'manana' } },
    { key: 'semana', why: 'Diez minutos el domingo ordenan toda la semana.', when: { type: 'time', days: [0], at: '18:00' }, then: { type: 'todo', title: 'Planear la semana', due: 'hoy' } },
    { key: 'vida', why: 'Cuando la barra de vida baja, menos es más.', when: { type: 'vit', level: 40 }, then: { type: 'note', text: 'Tu vitalidad está baja: hoy solo lo esencial y a dormir temprano.' } },
    { key: 'compra', why: 'Los precios del recibo alimentan tu libreta y tu canasta.', when: { type: 'trip' }, then: { type: 'todo', title: 'Tomar foto del recibo para guardar los precios', due: 'hoy' } },
  ];
  return ideas.filter((i) => !have.has(`${i.when.type}>${i.then.type}`)).map((i) => ({ ...i, text: ruleText(s, i) }));
}

export function ruleStats(s) {
  const pl = plusOf(s);
  return { n: pl.rules.length, on: pl.rules.filter((r) => r.on).length, runs: pl.rules.reduce((a, r) => a + (r.runs || 0), 0), log: pl.ruleLog.slice(0, 12) };
}
