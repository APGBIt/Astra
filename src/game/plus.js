// Astra 2.0: lo nuevo vive en una sola clave aparte (`s.plus`), que se crea sola. Nada de lo que ya
// estaba registrado cambia de forma: la versión de datos sigue siendo la 4 y una copia de la 1.x abre igual.
//
// - snooze: avisos del copiloto que dejaste «para después» (id → hasta qué día).
// - kaizen: mejoras de una semana (plan, línea base, resultado).
// - tags: etiquetas inteligentes (NFC o QR) pegadas a cosas de tu casa.
// - rules: automatizaciones «si pasa esto → haz esto».
// - sim: las palancas que dejaste puestas en el simulador del gemelo.
// - cfg: preferencias de lo nuevo (tiempo libre al día, copiloto en Hoy…).

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
  };
}

export function ensurePlus(s) {
  const d = defaultPlus();
  if (!isObj(s.plus)) { s.plus = d; return s.plus; }
  const p = s.plus;
  if (!isObj(p.snooze)) p.snooze = {};
  for (const k of ['kaizen', 'tags', 'rules', 'ruleLog']) {
    if (!Array.isArray(p[k])) p[k] = [];
    p[k] = p[k].filter((x) => isObj(x) && x.id);
  }
  p.sim = { ...d.sim, ...(isObj(p.sim) ? p.sim : {}) };
  p.cfg = { ...d.cfg, ...(isObj(p.cfg) ? p.cfg : {}) };
  for (const k of Object.keys(p.sim)) p.sim[k] = Number.isFinite(Number(p.sim[k])) ? Number(p.sim[k]) : 0;
  p.v = 1;
  return p;
}

// Lectura segura y sin tocar el estado: sirve aunque todavía no haya pasado por `ensurePlus` (datos viejos).
// Para escribir se usa `ensurePlus(s)`.
export function plusOf(s) {
  return isObj(s.plus) && isObj(s.plus.snooze) && Array.isArray(s.plus.kaizen) && Array.isArray(s.plus.tags) && Array.isArray(s.plus.rules) && isObj(s.plus.sim) && isObj(s.plus.cfg)
    ? s.plus
    : ensurePlus({ plus: isObj(s.plus) ? JSON.parse(JSON.stringify(s.plus)) : null });
}

// Limpia lo pospuesto de días anteriores (se llama al abrir el día).
export function tidyPlus(s, today) {
  const p = ensurePlus(s);
  for (const [k, until] of Object.entries(p.snooze)) if (!(until >= today)) delete p.snooze[k];
  if (p.ruleLog.length > 60) p.ruleLog = p.ruleLog.slice(0, 60);
  return p;
}
