// Astra 2.0: lo nuevo vive en una sola clave aparte (`s.plus`), que se crea sola. Nada de lo que ya
// estaba registrado cambia de forma: la versión de datos sigue siendo la 4 y una copia de la 1.x abre igual.
//
// - snooze: avisos del copiloto que dejaste «para después» (id → hasta qué día).
// - kaizen: mejoras de una semana (plan, línea base, resultado).
// - tags: etiquetas inteligentes (NFC o QR) pegadas a cosas de tu casa.
// - rules: automatizaciones «si pasa esto → haz esto».
// - sim: las palancas que dejaste puestas en el simulador del gemelo.
// - cfg: preferencias de lo nuevo (tiempo libre al día, copiloto en Hoy…).
// - cuadres (2.1): cada vez que cuadras una cuenta con el banco, lo que sobró o faltó (ver cuadres.js).
// - cierres (2.1): cómo terminó cada mes (lo que sobró o faltó del plan y de cada presupuesto).
// - pron (2.1): lo que Astra pronosticaba para el mes, una vez por semana, para compararlo con lo que pasó.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function defaultPlus() {
  return {
    v: 1,
    snooze: {},
    kaizen: [],
    tags: [],
    rules: [],
    ruleLog: [],
    sim: { sleepMin: 0, spendPct: 0, moveDays: 0, saveMonthly: 0 },
    cfg: { copilot: true, freeWeek: 120, freeWeekend: 240 },
    cuadres: [],
    cierres: {},
    pron: {},
  };
}

const CUADRE_MODES = new Set(['inicio', 'ajuste', 'reiniciar', 'igual']);
const isDayKey = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const isMonthKey = (m) => typeof m === 'string' && /^\d{4}-\d{2}$/.test(m);
const numOrNull = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 100) / 100);

// Un cuadre guardado, limpio. Devuelve null si no sirve.
export function cleanCuadre(x) {
  if (!isObj(x) || !x.id || !isDayKey(x.day) || !x.acc) return null;
  return {
    id: String(x.id), day: x.day, time: typeof x.time === 'string' ? x.time.slice(0, 5) : '', acc: String(x.acc), name: String(x.name || '').slice(0, 60),
    card: !!x.card, c: x.c === 'USD' ? 'USD' : 'DOP', was: numOrNull(x.was), now: numOrNull(x.now), diff: numOrNull(x.diff),
    mode: CUADRE_MODES.has(x.mode) ? x.mode : 'ajuste', tx: x.tx ? String(x.tx) : null, src: String(x.src || '').slice(0, 80),
    exp: numOrNull(x.exp), why: typeof x.why === 'string' ? x.why.slice(0, 20) : '', note: String(x.note || '').slice(0, 200), at: Number(x.at) || 0,
  };
}

// Los cuadres de antes de la 2.1 están en el historial de cada cuenta (`recon`): se pasan a la libreta una vez,
// con un id que sale de sus datos (así dos teléfonos que los pasan por su lado no los duplican al sincronizar).
function backfillCuadres(s, p) {
  if (p.cuadresFrom || !s.money || !Array.isArray(s.money.accounts)) return;
  const have = new Set(p.cuadres.map((x) => x.id));
  for (const a of s.money.accounts) {
    (Array.isArray(a.recon) ? a.recon : []).forEach((r, i) => {
      if (!isObj(r) || !isDayKey(r.day)) return;
      const id = `cq-${a.id}-${r.day}-${String(r.time || '').replace(':', '')}-${r.c === 'USD' ? 'USD' : 'DOP'}-${i}`;
      if (have.has(id)) return;
      const x = cleanCuadre({ ...r, id, acc: a.id, name: a.name, card: a.kind === 'tarjeta', mode: r.mode, at: 0 });
      if (x) { p.cuadres.push(x); have.add(id); }
    });
  }
  p.cuadres.sort((a, b) => (a.day + a.time < b.day + b.time ? -1 : a.day + a.time > b.day + b.time ? 1 : 0));
  p.cuadresFrom = true;
}

export function ensurePlus(s) {
  const d = defaultPlus();
  if (!isObj(s.plus)) s.plus = d;
  const p = s.plus;
  if (!isObj(p.snooze)) p.snooze = {};
  for (const k of ['kaizen', 'tags', 'rules', 'ruleLog']) {
    if (!Array.isArray(p[k])) p[k] = [];
    p[k] = p[k].filter((x) => isObj(x) && x.id);
  }
  // Los cuadres que ya están bien se dejan como están (mismo objeto); solo se rehacen los dañados.
  const okCuadre = (x) => isObj(x) && typeof x.id === 'string' && isDayKey(x.day) && typeof x.acc === 'string' && CUADRE_MODES.has(x.mode) && 'diff' in x;
  p.cuadres = (Array.isArray(p.cuadres) ? p.cuadres : []).map((x) => (okCuadre(x) ? x : cleanCuadre(x))).filter(Boolean);
  if (p.cuadres.length > 600) p.cuadres = p.cuadres.slice(-600);
  if (!isObj(p.cierres)) p.cierres = {};
  for (const k of Object.keys(p.cierres)) if (!isMonthKey(k) || !isObj(p.cierres[k])) delete p.cierres[k];
  if (!isObj(p.pron)) p.pron = {};
  for (const k of Object.keys(p.pron)) {
    if (!isMonthKey(k) || !Array.isArray(p.pron[k])) { delete p.pron[k]; continue; }
    p.pron[k] = p.pron[k].filter((x) => isObj(x) && isDayKey(x.day) && Number.isFinite(Number(x.end))).slice(-8);
  }
  backfillCuadres(s, p);
  p.sim = { ...d.sim, ...(isObj(p.sim) ? p.sim : {}) };
  p.cfg = { ...d.cfg, ...(isObj(p.cfg) ? p.cfg : {}) };
  for (const k of Object.keys(p.sim)) p.sim[k] = Number.isFinite(Number(p.sim[k])) ? Number(p.sim[k]) : 0;
  p.v = 1;
  return p;
}

// Lectura segura y sin tocar el estado: sirve aunque todavía no haya pasado por `ensurePlus` (datos viejos).
// Para escribir se usa `ensurePlus(s)`.
export function plusOf(s) {
  return isObj(s.plus) && isObj(s.plus.snooze) && Array.isArray(s.plus.kaizen) && Array.isArray(s.plus.tags) && Array.isArray(s.plus.rules) && isObj(s.plus.sim) && isObj(s.plus.cfg) && Array.isArray(s.plus.cuadres) && isObj(s.plus.cierres) && isObj(s.plus.pron)
    ? s.plus
    : ensurePlus({ plus: isObj(s.plus) ? JSON.parse(JSON.stringify(s.plus)) : null });
}

// Limpia lo pospuesto de días anteriores (se llama al abrir el día).
export function tidyPlus(s, today) {
  const p = ensurePlus(s);
  for (const [k, until] of Object.entries(p.snooze)) if (!(until >= today)) delete p.snooze[k];
  if (p.ruleLog.length > 60) p.ruleLog = p.ruleLog.slice(0, 60);
  if (p.cuadres.length > 600) p.cuadres = p.cuadres.slice(-600);
  const months = Object.keys(p.cierres).sort();
  for (const k of months.slice(0, Math.max(0, months.length - 36))) delete p.cierres[k];
  const pm = Object.keys(p.pron).sort();
  for (const k of pm.slice(0, Math.max(0, pm.length - 14))) delete p.pron[k];
  return p;
}
