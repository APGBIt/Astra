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
  return { title, due, important, tag, repeat, area: guessArea(title) };
}

function localToday() {
  const d = new Date();
  return dkey(d.getFullYear(), d.getMonth() + 1, d.getDate());
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
