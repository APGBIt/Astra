// Astra · entender texto en español sin conexión: frases del día, misiones nuevas y alertas del banco.
import { AREA_WORDS, CATEGORY_WORDS, MOOD_QUADS } from './content.js';

export function norm(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// «1,500.50», «1.500», «850», «2 mil», «RD$ 3,200» → número.
export function parseAmount(text) {
  const t = norm(text);
  const mil = t.match(/(\d+(?:[.,]\d+)?)\s*mil\b/);
  if (mil) return Math.round(parseFloat(mil[1].replace(',', '.')) * 1000);
  const m = t.match(/(?:rd\$|us\$|\$|dop)?\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  return toNumber(m[1]);
}

export function toNumber(raw) {
  let s = String(raw).trim();
  const lastSep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  if (lastSep >= 0) {
    const decimals = s.length - lastSep - 1;
    if (decimals === 3) s = s.replace(/[.,]/g, '');
    else s = s.slice(0, lastSep).replace(/[.,]/g, '') + '.' + s.slice(lastSep + 1);
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function minutesIn(t) {
  const h = t.match(/(\d+(?:[.,]\d+)?)\s*(?:h\b|hora|horas)/);
  const m = t.match(/(\d+)\s*(?:min|minuto|minutos)\b/);
  let total = 0;
  if (h) total += Math.round(parseFloat(h[1].replace(',', '.')) * 60);
  if (m) total += parseInt(m[1], 10);
  if (/media hora/.test(t)) total += 30;
  return total || null;
}

export function guessCategory(text) {
  const t = norm(text);
  let best = null;
  for (const [cat, words] of Object.entries(CATEGORY_WORDS)) {
    for (const w of words) {
      if (new RegExp(`\\b${w}`).test(t) && (!best || w.length > best.len)) best = { cat, len: w.length };
    }
  }
  return best ? best.cat : 'otros';
}

export function guessArea(text) {
  const t = norm(text);
  const score = {};
  for (const [area, words] of Object.entries(AREA_WORDS)) {
    for (const w of words) if (t.includes(w)) score[area] = (score[area] || 0) + w.length;
  }
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

// Nueva misión a partir de una frase: atributo, costo de energía y tipo.
export function classifyMission(text) {
  const t = norm(text);
  const area = guessArea(t) || 'crecimiento';
  const mins = minutesIn(t);
  let cost = 1;
  if (mins != null) cost = mins >= 45 ? 3 : mins >= 20 ? 2 : 1;
  else if (/\b(entren|corr|gimnasio|gym|pesas|limpiar|proyecto|estudiar)/.test(t)) cost = 2;
  const avoid = /^(no |nada de |cero |sin |evitar |dejar de )/.test(t);
  let days = null;
  let kind = avoid ? 'avoid' : 'habit';
  if (/\b(una vez|hoy|manana|agenda|agendar|llamar al|pagar la|comprar|entregar)\b/.test(t) && !avoid) kind = 'once';
  if (/\bcada (lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.test(t)) {
    const map = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
    days = [...t.matchAll(/(lunes|martes|miercoles|jueves|viernes|sabado|domingo)/g)].map((x) => map[x[1]]);
    kind = 'habit';
  } else if (/entre semana|de lunes a viernes/.test(t)) {
    days = [1, 2, 3, 4, 5];
  } else if (/fines? de semana/.test(t)) {
    days = [0, 6];
  }
  let auto = null;
  const steps = t.match(/(\d[\d.,]*)\s*pasos/);
  if (steps) auto = { metric: 'steps', gte: toNumber(steps[1]) || 8000 };
  else if (/dormir/.test(t) && /hora/.test(t)) auto = { metric: 'sleep', gte: 'goal' };
  return { area, cost, kind, days, auto, title: cleanTitle(text) };
}

// Quita del título las frases de horario («cada lunes y jueves», «entre semana»…).
export function cleanTitle(text) {
  const t = String(text || '')
    .replace(/\s*(?:,\s*)?\bcada\s+(?:(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)(?:\s*(?:,|y)\s*)?)+/gi, ' ')
    .replace(/\s*\b(?:entre semana|de lunes a viernes|los fines? de semana|todos los d[ií]as|cada d[ií]a|a diario)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

const POSITIVE = ['bien', 'feliz', 'contento', 'contenta', 'tranquilo', 'tranquila', 'motivado', 'motivada', 'alegre', 'agradecido', 'agradecida', 'en paz', 'relajado', 'relajada', 'animado', 'animada', 'genial'];
const TENSE = ['estresado', 'estresada', 'ansioso', 'ansiosa', 'frustrado', 'frustrada', 'molesto', 'molesta', 'nervioso', 'nerviosa', 'preocupado', 'preocupada', 'irritado', 'irritada'];
const LOW = ['cansado', 'cansada', 'triste', 'desanimado', 'desanimada', 'agotado', 'agotada', 'solo', 'sola', 'mal', 'bajo', 'baja'];

export function moodFromWord(w) {
  const t = norm(w);
  if (TENSE.some((x) => t.includes(x))) return 0;
  if (LOW.some((x) => t.includes(x))) return 2;
  if (/(motivad|alegre|feliz|animad|genial|emocionad)/.test(t)) return 1;
  if (POSITIVE.some((x) => t.includes(x))) return 3;
  return null;
}

const GENERIC = new Set(['minut', 'horas', 'hora', 'pagin', 'pasos', 'veces', 'diari', 'cada', 'media', 'tiemp', 'antes', 'despu', 'desde', 'hasta']);
function stems(text) {
  return norm(text).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 4 && !/^\d/.test(w)).map((w) => w.slice(0, 5)).filter((w) => !GENERIC.has(w));
}

export function matchMission(text, missions) {
  const a = new Set(stems(text));
  let best = null;
  for (const m of missions) {
    const b = stems(m.title);
    if (!b.length) continue;
    const hit = b.filter((x) => a.has(x)).length / b.length;
    if (hit >= 0.5 && (!best || hit > best.hit)) best = { m, hit };
  }
  return best ? best.m : null;
}

// Frase libre → lista de cosas a registrar.
// ctx: { people:[{id,name}], missions:[pendientes de hoy] }
export function parseCapture(text, ctx = {}) {
  const items = [];
  const raw = String(text || '').trim();
  if (!raw) return items;
  const clauses = raw.split(/(?:[.;\n]|,\s+(?=[a-záéíóúñ])|\s+y\s+(?=(?:me |le |la |lo |[a-záéíóúñ]+(?:é|í|ó)(?:[\s,.]|$))))/i).map((c) => c.trim()).filter(Boolean);
  for (const c of clauses) {
    const t = norm(c);
    const amount = parseAmount(t);
    // Dinero
    if (amount && /(gast|pagu|pague|pago|compr|consum|invit)/.test(t)) {
      const merchant = (c.match(/\ben\s+(?:el|la|los|las|un|una)?\s*([^,.;]+)$/i) || [])[1] || '';
      const cat = /(tarjeta|prestamo|deuda|cuota|abono)/.test(t) ? 'deuda' : guessCategory(t);
      items.push({ kind: 'tx', type: 'gasto', amount, cat, merchant: merchant.trim().slice(0, 40), text: c });
      continue;
    }
    if (amount && /(ahorr|guarde|aparte)/.test(t)) {
      items.push({ kind: 'tx', type: 'gasto', amount, cat: 'ahorro', merchant: '', text: c });
      continue;
    }
    if (amount && /(cobr|recib|me pagaron|ingres|vend|gane|quincena|sueldo|salario)/.test(t)) {
      items.push({ kind: 'tx', type: 'ingreso', amount, cat: 'ingreso', merchant: '', text: c });
      continue;
    }
    // Salud
    const steps = t.match(/(\d[\d.,]*)\s*pasos/);
    if (steps) { items.push({ kind: 'health', field: 'steps', value: toNumber(steps[1]), text: c }); continue; }
    const sleep = t.match(/dorm\w*\s+(?:como\s+)?(\d+(?:[.,]\d+)?|media)\s*(?:h\b|hora|horas)?/);
    if (sleep && /dorm/.test(t)) {
      const v = sleep[1] === 'media' ? 0.5 : parseFloat(sleep[1].replace(',', '.')) + (/y media/.test(t) ? 0.5 : 0);
      items.push({ kind: 'health', field: 'sleep', value: v, text: c });
      continue;
    }
    const water = t.match(/(\d+)\s*vasos?\s*(?:de\s+)?agua/);
    if (water) { items.push({ kind: 'health', field: 'water', value: parseInt(water[1], 10), text: c }); continue; }
    const pages = t.match(/le[ií]\w*\s+(\d+)\s*pag/);
    if (pages) { items.push({ kind: 'pages', value: parseInt(pages[1], 10), text: c }); continue; }
    // Relaciones
    const contact = c.match(/\b(llam[eé]|habl[eé]|escrib[ií]|visit[eé]|sal[ií] con|almorc[eé] con|cen[eé] con)\s+(?:a\s+|con\s+)?(mi\s+)?([A-Za-zÁÉÍÓÚÑáéíóúñ]+)/i);
    if (contact) {
      const name = contact[3];
      const person = (ctx.people || []).find((p) => norm(p.name).split(' ')[0] === norm(name));
      if (person || /^(mama|papa|abuel|herman|tia|tio|amig)/.test(norm(name))) {
        items.push({ kind: 'contact', personId: person ? person.id : null, name: person ? person.name : name, text: c });
        continue;
      }
    }
    // Ánimo
    const feel = t.match(/me siento\s+(?:muy\s+|un poco\s+|bastante\s+)?([a-zñ ]+)/);
    if (feel) {
      const q = moodFromWord(feel[1]);
      if (q != null) { items.push({ kind: 'mood', quad: q, word: feel[1].trim().split(' ')[0], text: c }); continue; }
    }
    // Misión pendiente que coincide
    const m = matchMission(c, ctx.missions || []);
    if (m) { items.push({ kind: 'mission', missionId: m.id, title: m.title, text: c }); continue; }
    // Ejercicio sin misión que coincida
    const mins = minutesIn(t);
    if (mins && /(camin|corr|entren|nad|bici|gym|gimnasio|ejercicio|yoga|pesas|bail)/.test(t)) {
      items.push({ kind: 'health', field: 'exercise', value: mins, text: c });
      continue;
    }
    if (mins && /(enfoque|concentr|trabaj)/.test(t)) {
      items.push({ kind: 'focus', minutes: mins, text: c });
      continue;
    }
    if (mins && /(medit|respir)/.test(t)) {
      items.push({ kind: 'calm', minutes: mins, text: c });
      continue;
    }
    items.push({ kind: 'note', text: c });
  }
  return items;
}

// Alertas de consumo que envían los bancos por correo o SMS (texto pegado).
export function parseBankAlert(text) {
  const raw = String(text || '');
  const t = norm(raw);
  const amt = raw.match(/(?:RD\$|DOP|US\$|USD|\$)\s*([\d.,]+)/i) || raw.match(/monto[:\s]+([\d.,]+)/i);
  const amount = amt ? toNumber(amt[1]) : parseAmount(raw);
  if (!amount) return null;
  const usd = /(us\$|usd)/i.test(amt ? amt[0] : '');
  let merchant = '';
  const m1 = raw.match(/(?:comercio|establecimiento|merchant)[:\s]+([^\n,.]+)/i);
  const m2 = raw.match(/\ben\s+([A-Z0-9][A-Z0-9 &'.\-]{2,40})/);
  if (m1) merchant = m1[1];
  else if (m2) merchant = m2[1];
  merchant = merchant.replace(/\s+(el|por|con|fecha|a las)\b.*$/i, '').trim();
  const isIncome = /(deposito|credito a su cuenta|transferencia recibida|abono a su cuenta)/.test(t);
  const date = raw.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  let day = null;
  if (date) {
    const y = date[3].length === 2 ? `20${date[3]}` : date[3];
    day = `${y}-${String(date[2]).padStart(2, '0')}-${String(date[1]).padStart(2, '0')}`;
  }
  return {
    amount,
    usd,
    type: isIncome ? 'ingreso' : 'gasto',
    merchant: merchant.slice(0, 40),
    cat: isIncome ? 'ingreso' : guessCategory(`${merchant} ${t}`),
    day,
  };
}

export { MOOD_QUADS };
