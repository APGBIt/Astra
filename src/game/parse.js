// Astra · entender texto en español sin conexión: frases del día, misiones nuevas y alertas del banco.
import { AREA_WORDS, CATEGORY_WORDS, INCOME_WORDS, MOOD_QUADS } from './content.js';
import { parseShopPhrase } from './shoplex.js';

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

const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Gana la palabra más larga que aparezca. «~palabra» se busca también dentro de otra palabra.
function bestWord(text, table) {
  const t = norm(text);
  let best = null;
  for (const [cat, words] of Object.entries(table)) {
    for (const raw of words) {
      const inside = raw.startsWith('~');
      const w = inside ? raw.slice(1) : raw;
      const hit = inside ? t.includes(w) : new RegExp(`\\b${esc(w)}`).test(t);
      if (hit && (!best || w.length > best.len)) best = { cat, len: w.length };
    }
  }
  return best ? best.cat : null;
}

export function guessCategory(text) {
  return bestWord(text, CATEGORY_WORDS) || 'otros';
}

export function guessIncome(text) {
  return bestWord(text, INCOME_WORDS) || 'ingreso';
}

// «US$», «USD», «dólares» → dólares; lo demás, pesos.
export function currencyIn(text) {
  return /(us\$|\busd\b|\bd[oó]lar|\bdollars?\b|\bu\$s\b)/i.test(String(text || '')) ? 'USD' : 'DOP';
}

// Tareas de la casa: lavar, planchar, limpiar, la basura, el súper… van a la categoría Hogar.
const HOME_RE = /\b(lavar|lavado|planchar|plancha|barrer|trapear|fregar|aspirar|sacudir|desempolvar|tender la (?:cama|ropa)|doblar (?:la )?ropa|basura|lavanderia|cocinar|regar|fumigar|sabanas|limpiar|limpieza|botellon|supermercado|super|colmado|mandados?|diligencias)\b/;
export const isHomeTask = (text) => HOME_RE.test(norm(text));

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
  else if (mins && /(medit|respir|calma|mindful)/.test(t) && !avoid) auto = { metric: 'calm', gte: mins };
  else if (/(escribir|escribe|anotar) en (mi|tu|el) diario/.test(t) && !avoid) auto = { metric: 'journal', gte: 1 };
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
  let raw = String(text || '').trim();
  if (!raw) return items;
  // Compras (1.13): «falta arroz, pan y leche», «se acabó el café», «agrega pollo a la lista». Se lee la frase entera
  // antes de partirla, para que una lista con comas no se convierta en varias cosas.
  const rest = [];
  for (const line of raw.split(/[\n.;]+/)) {
    const l = line.trim();
    if (!l) continue;
    const sp = parseShopPhrase(l);
    if (sp) items.push({ kind: 'shop', out: sp.out, items: sp.items.map((i) => ({ name: i.name, qty: i.qty, unit: i.unit, key: i.key, aisle: i.aisle, note: i.note })), text: l });
    else rest.push(l);
  }
  raw = rest.join('. ');
  if (!raw) return items;
  const clauses = raw.split(/(?:[.;\n]|,\s+(?=[a-záéíóúñ])|\s+y\s+(?=(?:me |le |la |lo |[a-záéíóúñ]+(?:é|í|ó)(?:[\s,.]|$))))/i).map((c) => c.trim()).filter(Boolean);
  const today = ctx.today || localToday();
  for (const c of clauses) {
    const t = norm(c);
    // Pendientes: «tengo que…», «hay que…», «recordar…»
    if (/^(?:y\s+)?(?:es\s+)?(?:muy\s+)?(?:urgente|importante)!*$/.test(t) && items.length && items[items.length - 1].kind === 'todo') {
      items[items.length - 1].important = true;
      continue;
    }
    const todo = c.match(/^\s*(?:tengo que|hay que|debo(?!\s+(?:RD\$|\$|\d))|necesito|recordar(?:me)?(?:\s+que)?|recu[eé]rdame(?:\s+que)?|no olvidar|no olvides|pendiente:?)\s+(.{2,})$/i);
    if (todo) {
      const p = parseTodo(todo[1], today);
      if (p.title) { items.push({ kind: 'todo', title: p.title, due: p.due, important: p.important, repeat: p.repeat, cat: p.area || 'general', text: c }); continue; }
    }
    const amount = parseAmount(t);
    // Dinero
    const currency = currencyIn(c);
    if (amount && /(gast|pagu|pague|pago|compr|consum|invit)/.test(t)) {
      const merchant = (c.match(/\ben\s+(?:el|la|los|las|un|una)?\s*([^,.;]+)$/i) || [])[1] || '';
      // «Pagué 5,000 a la tarjeta» cuenta como pago de deuda (y golpea al jefe «Libre de deudas»).
      const cat = /(tarjeta|prestamo|deuda|cuota|abono)/.test(t) ? 'deuda' : guessCategory(t);
      items.push({ kind: 'tx', type: 'gasto', amount, currency, cat, merchant: merchant.trim().slice(0, 40), text: c });
      continue;
    }
    if (amount && /(ahorr|guarde|aparte)/.test(t)) {
      items.push({ kind: 'tx', type: 'gasto', amount, currency, cat: 'ahorro', merchant: '', text: c });
      continue;
    }
    if (amount && /(cobr|recib|me pagaron|ingres|vend|gane|quincena|sueldo|salario)/.test(t)) {
      items.push({ kind: 'tx', type: 'ingreso', amount, currency, cat: guessIncome(t), merchant: '', text: c });
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

// ---------- Pendientes en lenguaje natural ----------

const WEEKDAYS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const MONTH_N = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const SMALL = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, quince: 15 };

function dkey(y, m, d) { return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
function shift(today, n) {
  const [y, m, d] = today.split('-').map(Number);
  const x = new Date(y, m - 1, d + n);
  return dkey(x.getFullYear(), x.getMonth() + 1, x.getDate());
}
function wday(today) { const [y, m, d] = today.split('-').map(Number); return new Date(y, m - 1, d).getDay(); }
function validDate(y, m, d) { const x = new Date(y, m - 1, d); return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d; }
// Fecha sin año: este año, o el próximo si ya pasó.
function nextDate(today, m, d, y = null) {
  const ty = Number(today.slice(0, 4));
  if (y) return validDate(y, m, d) ? dkey(y, m, d) : null;
  if (!validDate(ty, m, d)) return validDate(ty + 1, m, d) ? dkey(ty + 1, m, d) : null;
  const k = dkey(ty, m, d);
  return k < today ? dkey(ty + 1, m, d) : k;
}

// Palabras que anuncian una fecha («el viernes», «para el 15», «antes del lunes»).
const PREP = '(?:para el|para|antes del?|hasta el|hasta|a m[aá]s tardar el|del|el|este|esta|la)';
// Inicio y fin de palabra que entienden tildes y ñ (\b solo conoce letras sin tilde). Sin lookbehind: Safari viejo no lo entiende.
const START = '(?:^|\\s+)';
const END = '(?![\\p{L}\\p{N}])';
// Fracciones que no son fechas («1/2 libra», «3/4 de taza»).
const FRACTIONS = new Set(['1/2', '1/3', '2/3', '1/4', '3/4', '1/8', '3/8', '5/8', '7/8']);
// «la 27 de Febrero», «Av. 30 de Marzo», «calle 16 de Agosto»: calles, no fechas.
const STREET_BEFORE = /(?:^|\s)(?:la|av\.?|ave\.?|avenida|calle|c\/|esq\.?|esquina|autopista|carretera)\s*$/i;

// Busca una fecha en el texto («mañana», «el viernes», «15/10», «en 3 días»…) y la quita del título.
export function parseDue(text, today) {
  let t = String(text || '');
  let due = null;
  const pre = `${START}(?:${PREP}\\s+)?`;
  // Prueba cada coincidencia hasta que una sirva (ok decide si es fecha y cuál).
  const take = (src, fn) => {
    if (due) return;
    const re = new RegExp(src, 'giu');
    let m;
    while ((m = re.exec(t))) {
      const before = t.slice(0, m.index);
      const v = fn(m, before);
      if (v) {
        due = v;
        t = `${before} ${t.slice(m.index + m[0].length)}`;
        return;
      }
      if (m[0] === '') re.lastIndex += 1;
    }
  };
  const n = (w) => (/^\d+$/.test(w) ? Number(w) : SMALL[norm(w)] || null);
  // ¿La coincidencia empieza con «el», «para», «hasta»…? («la» no cuenta: «la 27 de Febrero» es una avenida).
  const hasPrep = (m) => /^\s*(?:para el|para|antes del?|hasta el|hasta|a m[aá]s tardar el|del|el|este|esta)\s/i.test(m[0]);
  take(`${pre}pasado\\s+ma[nñ]ana${END}`, () => shift(today, 2));
  // «mañana» como día (no «en la mañana» ni «cada mañana»).
  take(`${START}((?:para|el|este|esta)\\s+)?ma[nñ]ana${END}`, (m, before) => (!m[1] && /(?:^|\s)(?:la|por la|en la|de la|cada|toda la)\s*$/i.test(before) ? null : shift(today, 1)));
  take(`${pre}(?:hoy|esta noche|esta tarde)${END}`, () => today);
  take(`${START}en\\s+(\\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince)\\s+(d[ií]as?|semanas?|mes(?:es)?)${END}`, (m) => {
    const k = n(m[1]);
    if (!k) return null;
    const u = norm(m[2]);
    return shift(today, u.startsWith('sem') ? 7 * k : u.startsWith('mes') ? 30 * k : k);
  });
  take(`${pre}(?:pr[oó]xima semana|semana que viene)${END}`, () => shift(today, ((8 - wday(today)) % 7) || 7));
  take(`${pre}fin(?:es)? de semana${END}`, () => { const w = wday(today); return w === 6 || w === 0 ? today : shift(today, 6 - w); });
  take(`${pre}fin de mes${END}`, () => { const [y, m] = today.split('-').map(Number); const last = new Date(y, m, 0).getDate(); return dkey(y, m, last); });
  take(`${pre}(?:pr[oó]ximo\\s+)?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)(?:\\s+que viene)?${END}`, (m, before) => {
    // «Santo Domingo» es la ciudad y «Domingo», sin «el», suele ser un nombre.
    if (/santo\s*$/i.test(before)) return null;
    if (!hasPrep(m) && /^D/.test(m[1]) && before.trim()) return null;
    const target = WEEKDAYS[norm(m[1])];
    const diff = (target - wday(today) + 7) % 7;
    return shift(today, diff === 0 ? 7 : diff);
  });
  take(`${pre}(?:d[ií]a\\s+)?(\\d{1,2})\\s+de\\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\\s+(?:de|del)\\s+(\\d{4}))?${END}`, (m, before) => {
    if (!hasPrep(m) && STREET_BEFORE.test(before)) return null;
    if (/^\s*la\s/i.test(m[0])) return null;
    return nextDate(today, MONTH_N[norm(m[2])], Number(m[1]), m[3] ? Number(m[3]) : null);
  });
  take(`${pre}(\\d{1,2})([/-])(\\d{1,2})(?:\\2(\\d{2,4}))?${END}`, (m) => {
    const prep = hasPrep(m);
    // «1/2 libra» o «2-3 veces» no son fechas, salvo que digas «el 1/2» o pongas el año.
    if (!prep && !m[4] && (FRACTIONS.has(`${m[1]}/${m[3]}`) || m[2] === '-')) return null;
    const y = m[4] ? (m[4].length === 2 ? 2000 + Number(m[4]) : Number(m[4])) : null;
    return nextDate(today, Number(m[3]), Number(m[1]), y);
  });
  take(`${START}(?:(?:para|antes|hasta)\\s+)?(?:el|del)\\s+(?:d[ií]a\\s+)?(\\d{1,2})${END}(?!\\s*(?:%|pasos|p[aá]ginas|minutos|horas|vasos|de\\s+(?:la|los|las)\\b))`, (m) => {
    const d = Number(m[1]);
    if (d < 1 || d > 31) return null;
    const [y, mo] = today.split('-').map(Number);
    // Este mes si todavía no pasó; si no, el siguiente mes que tenga ese día.
    for (let i = 0; i < 4; i++) {
      const x = new Date(y, mo - 1 + i, 1);
      const yy = x.getFullYear();
      const mm = x.getMonth() + 1;
      if (validDate(yy, mm, d) && dkey(yy, mm, d) >= today) return dkey(yy, mm, d);
    }
    return null;
  });
  return { due, rest: t.replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').replace(/[,;:\s]+$/, '').trim() };
}

// «Pagar el marbete el viernes #carro !» → título, fecha, importancia, categoría sugerida y etiqueta.
export function parseTodo(text, today) {
  let t = String(text || '').trim();
  // «!» o «urgente» lo marcan importante. «¡Llamar a mamá!» es solo una exclamación.
  const bangs = (t.match(/!/g) || []).length;
  const opens = (t.match(/¡/g) || []).length;
  const words = /\b(urgente|importante)\b/i.test(t);
  const important = bangs > opens || words;
  t = t.replace(/[¡!]+/g, ' ');
  if (words) t = t.replace(/\s*[,(]?\s*\b(?:es\s+)?(?:muy\s+)?(?:urgente|importante)\b\s*\)?/gi, ' ');
  let tag = null;
  const tm = t.match(/(?:^|\s)#([\p{L}\d_-]{2,30})/u);
  if (tm) {
    tag = tm[1];
    t = t.replace(tm[0], ' ');
  }
  // Se repite: «cada mes», «el 15 de cada mes», «cada lunes», «todos los años»…
  let repeat = null;
  const rep = (re, key, put = ' ') => {
    if (repeat) return;
    const m = t.match(re);
    if (!m) return;
    repeat = key;
    t = t.slice(0, m.index) + (typeof put === 'function' ? put(m) : put) + t.slice(m.index + m[0].length);
  };
  rep(/\s*\b(?:el|los)\s+(?:d[ií]as?\s+)?(\d{1,2})\s+de\s+cada\s+mes\b/i, 'mes', (m) => ` el ${m[1]} `);
  rep(/\s*\bcada\s+(?:d[ií]a\s+)?(\d{1,2})\s+de(?:l)?\s+mes\b/i, 'mes', (m) => ` el ${m[1]} `);
  rep(/\s*\bcada\s+d[ií]a\s+(\d{1,2})(?!\d)/i, 'mes', (m) => ` el ${m[1]} `);
  rep(/\s*\b(?:cada|todos\s+los)\s+(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?)\b/i, 'semana', (m) => ` el ${m[1].replace(/^(s[aá]bado|domingo)s$/i, '$1')} `);
  rep(/\s*\b(?:cada\s+semana|semanal(?:mente)?|todas\s+las\s+semanas)\b/i, 'semana');
  rep(/\s*\b(?:cada\s+mes|mensual(?:mente)?|todos\s+los\s+meses)\b/i, 'mes');
  rep(/\s*\b(?:cada\s+a[nñ]o|anual(?:mente)?|todos\s+los\s+a[nñ]os)\b/i, 'ano');
  const { due, rest } = parseDue(t, today);
  let title = rest.replace(/\s+/g, ' ').trim();
  title = title ? title[0].toUpperCase() + title.slice(1) : '';
  return { title, due, important, tag, repeat, area: guessArea(title), home: isHomeTask(title) };
}

function localToday() {
  const d = new Date();
  return dkey(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// ---------- Avisos del banco (correo o SMS pegado) ----------

const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const pad = (n) => String(n).padStart(2, '0');

// «DL MINIMARKET / BAKERY #12» → «DL Minimarket / Bakery». Las siglas cortas se quedan en mayúsculas.
const KNOWN_MERCHANTS = [
  [/^ubr?\s*\*?\s*pending/i, 'Uber (retención)'], [/^uber\s*\*?\s*pending/i, 'Uber (retención)'], [/^uber\s*\*?\s*eats/i, 'Uber Eats'], [/^uber\b/i, 'Uber'],
  [/^smart\s*fit/i, 'Smart Fit'], [/^netflix/i, 'Netflix'], [/^spotify/i, 'Spotify'], [/^(amazon|amzn)/i, 'Amazon'], [/^apple\.?com/i, 'Apple'], [/^paypal/i, 'PayPal'],
  [/^google\s*\*?\s*youtube/i, 'YouTube'], [/^google\b/i, 'Google'], [/^didi\b/i, 'DiDi'], [/^pedidosya/i, 'PedidosYa'],
];
// Siglas que se escriben en mayúsculas aunque tengan vocales.
const KEEP_UPPER = new Set(['ATM', 'ACH', 'APAP', 'BHD', 'LBTR', 'POS', 'USD', 'DOP', 'RD', 'SRL', 'EIRL', 'SA', 'ITBIS', 'DGII', 'TSS', 'AFP', 'ARS', 'CAASD', 'INFOTEP', 'UASD', 'INTEC', 'PUCMM', 'UNIBE', 'APEC', 'UTESA', 'UNPHU', 'BBQ', 'KFC', 'TV', 'VIP']);
export function prettyMerchant(raw) {
  const known = KNOWN_MERCHANTS.find(([re]) => re.test(String(raw || '').trim()));
  if (known) return known[1];
  let t = String(raw || '')
    .replace(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g, ' ') // teléfonos
    .replace(/\b[\w.-]+\.(?:com|net|org)\b/gi, ' ') // direcciones web
    .replace(/\s+(?:santo\s+domingo(?:do)?|sto\.?\s*dgo\.?|santiago(?:\s+de\s+los\s+caballeros)?|punta\s+cana|la\s+romana)\b.*$/i, '')
    .replace(/\*/g, ' ').replace(/#\s*\d+/g, ' ').replace(/\s+/g, ' ').trim();
  // Números de sucursal («WENDYS 12 PLAZA», «STORE 101»), salvo que el nombre sea solo eso.
  const words = t.split(' ');
  if (words.length > 1) t = words.filter((w, i) => i === 0 || !/^\d{1,5}$/.test(w)).join(' ');
  if (!t) return '';
  if (t !== t.toUpperCase()) return t.slice(0, 60);
  const small = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'en', 'a']);
  return t.split(' ').map((w, i) => {
    const lw = w.toLowerCase();
    if (i > 0 && small.has(lw)) return lw;
    if (KEEP_UPPER.has(w.replace(/[.,]/g, ''))) return w;
    if (/^[A-Z]{2,3}$/.test(w) && !/[AEIOU]/.test(w)) return w;
    return lw.charAt(0).toUpperCase() + lw.slice(1);
  }).join(' ').slice(0, 60);
}

// «SR JUAN PEREZ» → «Juan Perez».
function personName(raw) {
  return prettyMerchant(String(raw || '').replace(/^\s*(?:sr|sra|srta|sres|don|dona)\.?\s+/i, ''));
}

// Valor de un campo «Etiqueta: valor» (también en tablas «| Etiqueta: | valor |» o en la línea siguiente).
// Si el aviso viene en una sola línea, el valor termina donde empieza la etiqueta siguiente.
const NEXT_LABEL = /\s(?:fecha(?: de transacci[oó]n)?|hora|moneda|monto|comercio|establecimiento|estado|balance disponible|n[uú]mero de (?:aprobaci[oó]n|transacci[oó]n|referencia)|origen|destino|impuestos?|transacci[oó]n|oficina de atenci[oó]n|cajero|cuenta(?: est[aá]ndar)?|s[ií]rvase pagar a|comentario|valor retirado en|monto comisi[oó]n)\s*:/i;
function field(raw, label) {
  const re = new RegExp(`(?:^|[\\n|]|\\s)${label}\\s*:?[\\s|]*([^\\n|]+)`, 'i');
  const m = raw.match(re);
  if (!m) return '';
  const v = m[1];
  const stop = v.search(NEXT_LABEL);
  return (stop > 0 ? v.slice(0, stop) : v).trim();
}

function dateIn(raw) {
  let m = raw.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})\b/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const d = Number(m[1]); const mo = Number(m[2]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${pad(mo)}-${pad(d)}`;
  }
  m = norm(raw).match(/(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?: del?)? (\d{4})/);
  if (m) return `${m[3]}-${pad(MONTHS_ES.indexOf(m[2]) + 1)}-${pad(m[1])}`;
  return null;
}

function timeIn(raw) {
  const m = raw.match(/hora\s*:?[\s|]*(\d{1,2})\s*:\s*(\d{1,2})/i) || raw.match(/\b(\d{1,2}):(\d{2})\s*(am|pm|a\.\s?m\.|p\.\s?m\.)?/i);
  if (!m) return '';
  let h = Number(m[1]);
  const mi = Number(m[2]);
  const ap = (m[3] || '').toLowerCase().replace(/[\s.]/g, '');
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h < 24 && mi < 60 ? `${pad(h)}:${pad(mi)}` : '';
}

// Corta un texto con varios avisos pegados en un aviso por pedazo.
function splitAlerts(raw) {
  const starts = [];
  const re = /(?:hola\s+[^,\n|]{2,60},|¡?\s*transacci[oó]n realizada\s*!?|¡?\s*pago realizado\s*!?|estimado cliente|comprobante de pago\b|notificaci[oó]n de consumo\b|(?:tu|su) tarjeta\b[^.\n|]{0,80}?presenta (?:una transacci[oó]n|un consumo)|tu titular\b[^.\n|]{0,60}?ha recibido un pago)/gi;
  let m;
  while ((m = re.exec(raw))) {
    const prev = starts[starts.length - 1];
    // «Comprobante de pago» seguido de «¡Transacción realizada!» es un solo aviso.
    if (prev != null && m.index - prev < 120 && !/monto/i.test(raw.slice(prev, m.index))) continue;
    starts.push(m.index);
  }
  if (starts.length <= 1) return [raw];
  const parts = starts.map((st, i) => raw.slice(st, starts[i + 1] ?? raw.length));
  if (starts[0] > 40 && /monto|rd\$|us\$|dop|usd/i.test(raw.slice(0, starts[0]))) parts.unshift(raw.slice(0, starts[0]));
  return parts;
}

function bankIn(raw) {
  return /apap|asociaci[oó]n popular/i.test(raw) ? 'APAP' : /banreservas|tub@nco/i.test(raw) ? 'Banreservas' : /banco popular|popular dominicano|\bbpd\b/i.test(raw) ? 'Banco Popular' : /\bbhd\b/i.test(raw) ? 'BHD' : /scotiabank/i.test(raw) ? 'Scotiabank' : /santa cruz/i.test(raw) ? 'Banco Santa Cruz' : /\bpromerica\b/i.test(raw) ? 'Promerica' : /banco caribe/i.test(raw) ? 'Banco Caribe' : /\bbanesco\b/i.test(raw) ? 'Banesco' : /\bvimenca\b/i.test(raw) ? 'Banco Vimenca' : '';
}

// Cuenta o tarjeta de donde salió el dinero (en una transferencia, el «Origen»).
function accountIn(raw, t) {
  const bank = bankIn(raw);
  const origin = field(raw, 'Origen');
  const from = origin || raw;
  const acc = from.match(/(cuenta\s*(?:de\s*)?(ahorros?|corriente)?)[^\n|]*?\*{1,}\s*-?\s*(\d{4})/i);
  if (origin && acc) {
    const type = /corriente/i.test(acc[0]) ? 'corriente' : 'ahorro';
    return { bank, kind: 'cuenta', last4: acc[3], name: `${type === 'corriente' ? 'Cuenta corriente' : 'Ahorro'}${bank ? ` ${bank}` : ''}` };
  }
  const card = raw.match(/(?:tarjeta|titular|visa|mastercard|master|amex)[^.\n|]{0,60}?(?:terminada|terminaci[oó]n|que termina) en\s*\*?(\d{4})/i) || raw.match(/(?:visa|mastercard|master|amex)[^\n|]{0,40}?[*•·]+\s*-?\s*(\d{4})/i);
  if (card) {
    const name = (raw.match(/(visa[^,\n|]*?|mastercard[^,\n|]*?|master[^,\n|]*?)\s+(?:apap\s+)?terminada/i) || raw.match(/((?:visa|mastercard|master|amex)[a-z0-9 ]{0,30}?)\s*[*•·]+\s*-?\s*\d{4}/i) || [])[1];
    const debit = /d[eé]bito/i.test(raw.slice(Math.max(0, card.index - 40), card.index + 40));
    const clean = String(name || 'Tarjeta').replace(/titular-?/i, '').trim();
    return { bank, kind: debit ? 'debito' : 'tarjeta', last4: card[1], name: prettyMerchant(`${clean}${bank && !clean.toLowerCase().includes(bank.toLowerCase()) ? ` ${bank}` : ''}`) };
  }
  if (acc) {
    const type = /corriente/i.test(acc[0]) ? 'corriente' : 'ahorro';
    return { bank, kind: 'cuenta', last4: acc[3], name: `${type === 'corriente' ? 'Cuenta corriente' : 'Ahorro'}${bank ? ` ${bank}` : ''}` };
  }
  const tail = t.match(/(?:\*{2,}|x{2,})\s*-?\s*(\d{4})/);
  if (tail) return { bank, kind: 'tarjeta', last4: tail[1], name: `Tarjeta${bank ? ` ${bank}` : ''}` };
  return bank ? { bank, kind: 'cuenta', last4: '', name: bank } : null;
}

// La cuenta o tarjeta a la que llegó el dinero (el «Destino» de una transferencia o de un pago).
function destIn(dest, bank) {
  if (!dest) return null;
  const end4 = (dest.match(/\*{1,}\s*-?\s*(\d{4})/) || dest.match(/(\d{4})\s*$/) || [])[1];
  if (!end4) return null;
  if (/tarjeta|visa|master|amex|cr[eé]dito/i.test(dest)) {
    const nm = prettyMerchant(dest.replace(/^[^,]*,\s*/, '').replace(/\*+\s*-?\s*\d{4}\s*$/, '').replace(/\b(dop|usd)\b/ig, '').trim()) || 'Tarjeta';
    return { bank, kind: 'tarjeta', last4: end4, name: `${nm}${bank && !nm.toLowerCase().includes(bank.toLowerCase()) ? ` ${bank}` : ''}` };
  }
  const type = /corriente/i.test(dest) ? 'corriente' : 'ahorro';
  return { bank, kind: 'cuenta', last4: end4, currency: /\busd\b|d[oó]lar/i.test(dest) ? 'USD' : 'DOP', name: `${type === 'corriente' ? 'Cuenta corriente' : 'Ahorro'}${bank ? ` ${bank}` : ''}` };
}

function parseOne(raw) {
  const t = norm(raw);
  if (!/(monto|rd\$|us\$|\bdop\b|\busd\b|\$)/i.test(raw)) return null;
  // Monto y moneda.
  let amount = null;
  let currency = 'DOP';
  const mf = raw.match(/monto\s*:?[\s|]*(RD\$|US\$|DOP|USD|\$)?\s*([\d.,]+\d)/i);
  if (mf) {
    amount = toNumber(mf[2]);
    const mon = field(raw, 'Moneda');
    currency = mf[1] ? (/us|usd/i.test(mf[1]) ? 'USD' : 'DOP') : mon ? (/(usd|d[oó]lar)/i.test(mon) ? 'USD' : 'DOP') : currencyIn(raw);
  } else {
    const ma = raw.match(/(RD\$|US\$|DOP|USD|\$)\s*([\d.,]+\d)/i);
    if (ma) { amount = toNumber(ma[2]); currency = /us|usd/i.test(ma[1]) ? 'USD' : 'DOP'; }
    else amount = parseAmount(raw);
  }
  if (!amount) return null;
  const day = dateIn(raw);
  const time = timeIn(raw);
  const account = accountIn(raw, t);
  const ref = (raw.match(/n[uú]mero de (?:transacci[oó]n|referencia|aprobaci[oó]n)\s*:?[\s|]*(\d{4,})/i) || raw.match(/\b(?:referencia|aprobaci[oó]n|autorizaci[oó]n)\s*:?[\s|]*(\d{4,})/i) || [])[1] || '';
  // Lo que el banco dice que queda disponible (APAP lo manda en cada aviso de la tarjeta).
  const av = raw.match(/balance disponible\s*:?[\s|]*(RD\$|US\$|DOP|USD)\s*([\d.,]+\d)/i);
  const avail = av ? { currency: /us/i.test(av[1]) ? 'USD' : 'DOP', amount: toNumber(av[2]) } : null;
  const tax = toNumber((raw.match(/impuestos?\s*:?[\s|]*(?:RD\$|DOP)?\s*([\d.,]*\d)/i) || [])[1] || '') || 0;
  const op = (raw.match(/(?:^|[\n|])\s*transacci[oó]n\s*:?[\s|]*([^\n|]{3,60})/i) || [])[1] || '';
  const opn = norm(op);
  const base = { amount, currency, day, time, account, ref, avail, tax: tax > 0 && tax < amount ? tax : 0 };
  // Rechazadas: no se cobran.
  if (/(declinad|rechazad|fondos insuficientes|no aprobad|denegad)/.test(t)) {
    return { ...base, kind: 'declined', merchant: prettyMerchant(field(raw, 'Comercio')), why: 'Transacción declinada: no se cobró.' };
  }
  // Pagos a una tarjeta: no son gasto nuevo.
  if (/ha recibido un pago|pago de tarjeta|pago a (?:tu |su )?tarjeta|abono a (?:tu |su )?tarjeta/.test(t)) {
    const dest = field(raw, 'Destino');
    const end4 = (dest.match(/(\d{4})\s*$/) || [])[1];
    const card = dest ? `${prettyMerchant(dest.replace(/\*+\s*-?\s*\d{4}\s*$/, ''))}${end4 ? ` ·${end4}` : ''}`.trim() : '';
    // A dónde fue: la tarjeta del «Destino»; si el aviso es de la misma tarjeta (APAP), esa tarjeta.
    let account = base.account;
    let to = dest ? destIn(dest, bankIn(raw)) : null;
    if (to) to.kind = 'tarjeta';
    if (!to && account && account.kind === 'tarjeta') { to = account; account = null; }
    return { ...base, account, to, kind: 'transfer', cat: 'pago_tarjeta', merchant: card ? `Pago a ${card}` : 'Pago de tarjeta', why: 'Pago de tarjeta: baja lo que debes en ella. Las compras ya se cuentan una por una.' };
  }
  // Transferencias (Banreservas y otros): a tu cuenta, a otra persona o recibidas.
  if (/transferencia|transf\b/.test(opn) || /transferencia/.test(t)) {
    const origin = field(raw, 'Origen');
    const dest = field(raw, 'Destino');
    const who = (s) => norm(s.split(',')[0]).replace(/^(sr|sra|srta)\.?\s+/, '');
    const concept = (raw.match(/monto\s*:?[\s|]*(?:RD\$|US\$|DOP|USD|\$)?\s*[\d.,]+\d[\s|]*\n[\s|]*([^\n|]{2,60})/i) || [])[1] || '';
    const note = /^#?concept#?$/i.test(concept.trim()) || /^transacci[oó]n/i.test(concept.trim()) ? '' : concept.trim();
    if (/recibid|acreditad|te enviaron|has recibido/.test(t)) {
      return { ...base, kind: 'ingreso', cat: guessIncome(`${note} ${t}`), merchant: origin ? personName(origin.split(',')[0]) : 'Transferencia recibida', note };
    }
    if (origin && dest && who(origin) && who(origin) === who(dest)) {
      return { ...base, to: destIn(dest, bankIn(raw)), kind: 'transfer', cat: 'entre_cuentas', merchant: 'Entre tus cuentas', note, why: 'Entre tus cuentas: el dinero sigue siendo tuyo.' };
    }
    const name = dest ? personName(dest.split(',')[0]) : 'Transferencia';
    const cat = bestWord(`${note}`, { familia: CATEGORY_WORDS.familia }) ? 'familia' : (bestWord(note, CATEGORY_WORDS) || 'terceros');
    return { ...base, kind: 'gasto', cat, merchant: name, note: note ? `Concepto: ${note}` : '', check: cat === 'terceros' ? '¿Para qué fue esta transferencia?' : '' };
  }
  if (/retiro|cajero|atm\b/.test(t) && !/comercio/.test(t)) {
    return { ...base, to: 'efectivo', kind: 'transfer', cat: 'retiro', merchant: 'Retiro de efectivo', why: 'Retiro: pasa de tu cuenta a efectivo.' };
  }
  // Depósitos e ingresos.
  if (/(deposito|credito a (?:tu|su) cuenta|abono a (?:tu|su) cuenta|nomina|pago recibido en tu cuenta)/.test(t)) {
    return { ...base, kind: 'ingreso', cat: guessIncome(t), merchant: prettyMerchant(field(raw, 'Comercio') || field(raw, 'Origen').split(',')[0] || 'Depósito') };
  }
  // Consumos con tarjeta o pagos de servicios.
  let merchant = field(raw, 'Comercio') || field(raw, 'Establecimiento') || field(raw, 'Merchant');
  if (!merchant) {
    const m2 = raw.match(/\ben\s+([A-Z0-9][A-Z0-9 &'./\-]{2,40})/);
    if (m2) merchant = m2[1].replace(/\s+(EL|POR|CON|FECHA|A LAS)\b.*$/i, '');
  }
  if (!merchant && op) merchant = op;
  merchant = prettyMerchant(merchant);
  return { ...base, kind: 'gasto', merchant, cat: guessCategory(`${merchant} ${op}`) };
}

// Uno o varios avisos pegados → movimientos. Cada uno trae: kind (gasto, ingreso, transfer o declined),
// amount y currency, day, time, merchant, cat, account { bank, kind, last4, name }, ref y, si el banco
// cobró impuesto a la transferencia, una línea aparte en «Comisiones e impuestos del banco».
export function parseBankAlerts(text) {
  const raw = String(text || '');
  const out = [];
  const seen = new Map();
  for (const part of splitAlerts(raw)) {
    const it = parseOne(part);
    if (!it) continue;
    const end4 = (it.account && it.account.last4) || '';
    const key = it.ref ? `r${end4}:${it.ref}` : `${it.day}|${it.time}|${it.currency}|${it.amount}|${norm(it.merchant)}|${it.kind}`;
    // Banreservas envía a veces el mismo aviso dos veces: se queda uno y se anota la hora del repetido.
    if (seen.has(key)) { const first = seen.get(key); if (it.time && it.time !== first.time) (first.again = first.again || []).push(it.time); continue; }
    seen.set(key, it);
    out.push(it);
    if (it.tax && it.kind !== 'declined') {
      out.push({ kind: 'gasto', amount: it.tax, currency: 'DOP', day: it.day, time: it.time, account: it.account, ref: it.ref ? `${it.ref}-imp` : '', merchant: 'Impuesto a transferencias', cat: 'comisiones', note: `Impuesto de: ${it.merchant || 'la transacción'}`, tax: 0 });
    }
  }
  return reviewHolds(out);
}

const isUber = (it) => /\bub(?:e)?r\b/i.test(it.merchant || '');
const mins = (t) => { const [h, m] = String(t || '').split(':').map(Number); return h * 60 + m; };
// Retenciones: Uber (y otros) primero retienen un monto y al final cobran el definitivo con otro número.
// Se cuenta el cobro final; la retención y las que dicen «pending» quedan sin marcar, con una nota.
export function reviewHolds(items) {
  for (const it of items) {
    if (it.kind === 'gasto' && /pending|retenci[oó]n/i.test(it.merchant || '')) {
      it.on = false;
      it.check = 'Retención temporal (pending): normalmente se libera. Márcala solo si te la cobraron.';
    }
  }
  for (const it of items) {
    if (it.kind !== 'gasto' || !it.again || !isUber(it) || it.on === false) continue;
    const end4 = (it.account && it.account.last4) || '';
    const fin = items.find((x) => x !== it && x.kind === 'gasto' && isUber(x) && x.day === it.day && ((x.account && x.account.last4) || '') === end4
      && x.time > it.time && it.again.some((t) => Math.abs(mins(t) - mins(x.time)) <= 3) && !/pending|retenci[oó]n/i.test(x.merchant || ''));
    if (!fin) continue;
    it.on = false;
    it.check = `Parece la retención inicial del viaje: a las ${fin.time} llegó el cobro final. Se cuenta solo ese.`;
    if (!fin.check) fin.check = `Cobro final del viaje (la retención de las ${it.time} no se cuenta).`;
  }
  return items;
}

// Compatibilidad: el primer movimiento de un aviso, con la forma de la versión 1.
export function parseBankAlert(text) {
  const it = parseBankAlerts(text).find((x) => x.kind !== 'declined');
  if (!it) return null;
  return { amount: it.amount, usd: it.currency === 'USD', currency: it.currency, type: it.kind === 'ingreso' ? 'ingreso' : it.kind === 'transfer' ? 'transfer' : 'gasto', merchant: it.merchant, cat: it.cat, day: it.day, time: it.time };
}

export { MOOD_QUADS };
