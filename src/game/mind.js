// Mente y bienestar (1.6): sesiones de calma, programa de inicio, emociones y sus patrones, diario, intención del día,
// descarga mental, pensamientos replanteados, chequeo OMS-5, rueda de la vida, valores y revisión de la semana.
import { addDays, diffDays, weekday, monthKey } from '../app/dates.js';
import {
  EMOTIONS, LEGACY_EMOTIONS, STRATEGIES, PROGRAM, WHO5_LOW, WHEEL, VALUE, JOURNAL_PROMPTS, BODY_SPOTS,
} from './wellness.js';
import { INFLUENCES } from './content.js';
import { gainXP, addGold, autoCheck, checkAchievements, addTodo, uid, dailyGoal, getDay, logCalm, txKind, txDOP } from './logic.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const txt = (v, n = 500) => String(v == null ? '' : v).trim().slice(0, n);
const plain = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// ---------- Datos ----------

export function defaultMind() {
  return { calm: [], program: {}, checks: [], wheel: [], values: { keys: [], since: null }, reviews: [], worries: [], thoughts: [], intents: {} };
}

export function ensureMind(s) {
  if (!isObj(s.mind)) s.mind = defaultMind();
  const m = s.mind;
  for (const k of ['calm', 'checks', 'wheel', 'reviews', 'worries', 'thoughts']) {
    if (!Array.isArray(m[k])) m[k] = [];
    m[k] = m[k].filter((x) => isObj(x) && x.id && isDay(x.day));
  }
  for (const k of ['program', 'intents']) if (!isObj(m[k])) m[k] = {};
  if (!isObj(m.values)) m.values = { keys: [], since: null };
  if (!Array.isArray(m.values.keys)) m.values.keys = [];
  m.values.keys = m.values.keys.filter((k) => VALUE[k]).slice(0, 5);
  if (!Array.isArray(s.journal)) s.journal = [];
  s.journal = s.journal.filter((j) => isObj(j) && j.id && isDay(j.day) && typeof j.text === 'string');
  // Misiones de meditar o respirar con minutos: se completan solas con tus sesiones de calma.
  // (Cada sesión ya cuenta para el jefe de la calma, así que la misión deja de contarla otra vez.)
  for (const ms of s.missions || []) {
    if (!isObj(ms) || ms.auto || ms.kind === 'avoid') continue;
    const t = plain(ms.title);
    const mins = (t.match(/(\d+)\s*(?:min\b|minutos?)/) || [])[1];
    if (mins && /(medit|respir|calma|mindful)/.test(t)) { ms.auto = { metric: 'calm', gte: Number(mins) }; if (ms.feed === 'calm') ms.feed = null; }
    else if (/(escribir|escribe|anotar) en (mi|tu|el) diario/.test(t)) ms.auto = { metric: 'journal', gte: 1 };
  }
}

// Una vez por día por tipo (para que la XP no se repita).
function firstToday(s, today, key) {
  const d = getDay(s, today);
  if (!isObj(d.mind)) d.mind = {};
  if (d.mind[key]) return false;
  d.mind[key] = true;
  return true;
}

// ---------- Calma: sesiones, racha y programa ----------

export const CALM_KINDS = { respira: 'Respiración', guiada: 'Meditación guiada', libre: 'Meditación libre', sos: 'Pausa SOS', registro: 'Registrada' };

export function logCalmSession(s, p, today, ev = []) {
  const minutes = clamp(Math.round(Number(p.minutes) || 0), 1, 240);
  const entry = {
    id: uid(), day: today, ts: Date.now(), kind: CALM_KINDS[p.kind] ? p.kind : 'libre', ref: txt(p.ref, 40), title: txt(p.title, 60) || CALM_KINDS[p.kind] || 'Calma',
    minutes, after: null,
  };
  s.mind.calm.unshift(entry);
  s.mind.calm = s.mind.calm.slice(0, 3000);
  logCalm(s, minutes, today, ev);
  if (p.program != null) programDone(s, Number(p.program), today, ev);
  autoCheck(s, today, ev);
  checkAchievements(s, today, ev);
  return entry;
}

export function setCalmAfter(s, id, after) {
  const e = s.mind.calm.find((x) => x.id === id);
  if (e) e.after = ['mejor', 'igual', 'peor'].includes(after) ? after : null;
  return e;
}

export const calmMinutes = (s, day) => (s.mind ? s.mind.calm : []).filter((x) => x.day === day).reduce((a, x) => a + x.minutes, 0);

export function calmWeek(s, today) {
  return Array.from({ length: 7 }, (_, i) => { const day = addDays(today, i - 6); return { day, minutes: calmMinutes(s, day) }; });
}

// Días seguidos con al menos una sesión (si hoy todavía no, cuenta hasta ayer).
export function calmStreak(s, today) {
  const days = new Set(s.mind.calm.map((x) => x.day));
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d) && n < 3650) { n += 1; d = addDays(d, -1); }
  return n;
}

export function bestCalmStreak(s) {
  const days = [...new Set(((s.mind && s.mind.calm) || []).map((x) => x.day))].sort();
  let best = 0; let run = 0; let prev = null;
  for (const d of days) { run = prev && diffDays(prev, d) === 1 ? run + 1 : 1; prev = d; best = Math.max(best, run); }
  return best;
}

export function calmStats(s, today) {
  const list = s.mind.calm;
  const answered = list.filter((x) => x.after);
  const week = calmWeek(s, today).reduce((a, d) => a + d.minutes, 0);
  return {
    today: calmMinutes(s, today), week, total: list.reduce((a, x) => a + x.minutes, 0), sessions: list.length,
    streak: calmStreak(s, today), answered: answered.length, better: answered.length ? answered.filter((x) => x.after === 'mejor').length / answered.length : null,
  };
}

export function programState(s) {
  const done = isObj(s.mind.program[PROGRAM.id]) ? s.mind.program[PROGRAM.id] : {};
  let next = null;
  for (let i = 1; i <= PROGRAM.days.length; i++) if (!done[i]) { next = i; break; }
  return { done, next, count: Object.keys(done).length, total: PROGRAM.days.length };
}

function programDone(s, n, today, ev) {
  if (!(n >= 1 && n <= PROGRAM.days.length)) return;
  if (!isObj(s.mind.program[PROGRAM.id])) s.mind.program[PROGRAM.id] = {};
  const done = s.mind.program[PROGRAM.id];
  if (done[n]) return;
  done[n] = today;
  gainXP(s, 'emocional', 10, today, ev);
  if (Object.keys(done).length === PROGRAM.days.length) {
    gainXP(s, 'emocional', 50, today, ev);
    addGold(s, 25, today);
    ev.push({ type: 'programDone', title: PROGRAM.title });
  }
}

// ---------- Emociones ----------

const EMO = new Map();
EMOTIONS.forEach((list, quad) => list.forEach(([w, def], i) => EMO.set(plain(w), { word: w, def, quad, i })));

// La emoción de una palabra guardada (también las de antes: «Estresado» cuenta como «Estrés»).
export function emotionOf(word) {
  const k = plain(word);
  if (!k) return null;
  if (EMO.has(k)) return EMO.get(k);
  const legacy = LEGACY_EMOTIONS[k] || LEGACY_EMOTIONS[k.replace(/a$/, 'o')] || LEGACY_EMOTIONS[k.replace(/as$/, 'os')];
  return legacy ? EMO.get(plain(legacy)) || null : null;
}

export const emotionsFor = (quad) => (EMOTIONS[quad] || []).map(([word, def]) => ({ word, def }));
export const strategiesFor = (quad) => STRATEGIES[quad] || [];
export const isPleasant = (q) => q === 1 || q === 3;

// El cuadrante del día: el que más se repitió (si empatan, el último).
export function dayMoods(s, from, to) {
  const by = new Map();
  for (const m of s.moods) {
    if (m.day < from || m.day > to) continue;
    if (!by.has(m.day)) by.set(m.day, []);
    by.get(m.day).push(m);
  }
  const out = new Map();
  for (const [day, list] of by) {
    const n = [0, 0, 0, 0];
    for (const m of list) n[m.quad] += 1;
    const max = Math.max(...n);
    const latest = list.reduce((a, b) => ((b.ts || 0) > (a.ts || 0) ? b : a));
    out.set(day, n[latest.quad] === max ? latest.quad : n.indexOf(max));
  }
  return out;
}

const share = (list) => (list.length ? list.filter((m) => isPleasant(m.quad)).length / list.length : null);

// Patrones: qué acompaña a tus días agradables y desagradables (como Daylio, How We Feel o Bearable).
export function moodPatterns(s, today, days = 90) {
  const from = addDays(today, -days + 1);
  const list = s.moods.filter((m) => m.day >= from && m.day <= today);
  const goal = dailyGoal(s, 'sleep');
  const calmDays = new Set(((s.mind && s.mind.calm) || []).map((x) => x.day));
  const split = (test) => {
    const yes = []; const no = [];
    for (const m of list) { const r = test(m); if (r === true) yes.push(m); else if (r === false) no.push(m); }
    const dy = new Set(yes.map((m) => m.day)).size;
    const dn = new Set(no.map((m) => m.day)).size;
    return dy >= 5 && dn >= 5 ? { yes: share(yes), no: share(no), dy, dn } : null;
  };
  const sleep = split((m) => { const h = s.health[m.day]; return h && h.sleep != null ? h.sleep >= goal : null; });
  const exercise = split((m) => ((s.health[m.day] || {}).exercise || 0) >= 20);
  const calm = split((m) => calmDays.has(m.day));
  const influences = [];
  for (const inf of INFLUENCES) {
    const withI = list.filter((m) => (m.influences || []).includes(inf.key));
    if (withI.length < 3) continue;
    const other = list.filter((m) => !(m.influences || []).includes(inf.key));
    const a = share(withI);
    const b = share(other);
    influences.push({ key: inf.key, label: inf.label, n: withI.length, pct: a, other: b, diff: b == null ? 0 : a - b });
  }
  influences.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
  const weekdays = Array.from({ length: 7 }, (_, wd) => { const l = list.filter((m) => weekday(m.day) === wd); return { n: l.length, pct: share(l) }; });
  const slot = (m) => { const h = m.ts ? new Date(m.ts).getHours() : null; return h == null ? null : h < 12 ? 'manana' : h < 19 ? 'tarde' : 'noche'; };
  const times = {};
  for (const k of ['manana', 'tarde', 'noche']) { const l = list.filter((m) => slot(m) === k); times[k] = { n: l.length, pct: share(l) }; }
  const counts = new Map();
  for (const m of list.filter((x) => x.day >= addDays(today, -29))) {
    for (const w of m.words || []) { const e = emotionOf(w); const key = e ? e.word : w; const c = counts.get(key) || { word: key, n: 0, quad: e ? e.quad : m.quad }; c.n += 1; counts.set(key, c); }
  }
  const top = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  return { n: list.length, pleasant: share(list), sleep, exercise, calm, influences: influences.slice(0, 6), weekdays, times, top };
}

// Cuántas emociones distintas has nombrado (vocabulario emocional).
export function distinctEmotions(s) {
  const set = new Set();
  for (const m of s.moods) for (const w of m.words || []) { const e = emotionOf(w); set.add(e ? e.word : plain(w)); }
  return set.size;
}

export const BODY = BODY_SPOTS;

// ---------- Salud: lo destacado de la semana (como «Destacados» de Apple Salud) ----------

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

export function healthHighlights(s, today) {
  const days = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => addDays(today, -b + i));
  const cur = days(0, 6);
  const prev = days(7, 13);
  const vals = (list, k) => list.map((d) => (s.health[d] || {})[k]).filter((v) => v != null);
  const out = [];
  const fmtH = (h) => { const hh = Math.floor(h); const mm = Math.round((h - hh) * 60); return mm ? `${hh} h ${mm}` : `${hh} h`; };
  // Sueño
  const sc = vals(cur, 'sleep'); const sp = vals(prev, 'sleep');
  if (sc.length >= 3) {
    const a = avg(sc); const b = sp.length >= 3 ? avg(sp) : null;
    const diff = b == null ? 0 : a - b;
    out.push({ key: 'sleep', icon: 'moon', score: Math.abs(diff) * 2, tone: diff >= 0.25 ? 'good' : diff <= -0.25 ? 'vit' : '',
      text: `Dormiste en promedio ${fmtH(a)} por noche${b == null ? '' : Math.abs(diff) >= 0.25 ? `, ${fmtH(Math.abs(diff))} ${diff > 0 ? 'más' : 'menos'} que la semana anterior` : ', igual que la semana anterior'}.` });
  }
  // Pasos
  const pc = vals(cur, 'steps'); const pp = vals(prev, 'steps');
  if (pc.length >= 3) {
    const a = Math.round(avg(pc)); const b = pp.length >= 3 ? Math.round(avg(pp)) : null;
    const diff = b == null ? 0 : a - b;
    const big = b != null && Math.abs(diff) >= Math.max(500, b * 0.1);
    out.push({ key: 'steps', icon: 'pulse', score: b ? Math.abs(diff) / Math.max(1, b) : 0.1, tone: big ? (diff > 0 ? 'good' : 'vit') : '',
      text: `Caminaste ${a.toLocaleString('en-US')} pasos al día en promedio${big ? `, ${Math.abs(diff).toLocaleString('en-US')} ${diff > 0 ? 'más' : 'menos'} que la semana anterior` : ''}.` });
  }
  // Actividad
  const ec = vals(cur, 'exercise').reduce((a, b) => a + b, 0); const ep = vals(prev, 'exercise').reduce((a, b) => a + b, 0);
  if (ec > 0 || ep > 0) {
    const diff = ec - ep;
    out.push({ key: 'exercise', icon: 'dumbbell', score: Math.abs(diff) / Math.max(30, ep), tone: ec >= 150 ? 'good' : diff < -30 ? 'vit' : '',
      text: `${ec} minutos de actividad en 7 días${ep ? ` (${diff >= 0 ? '+' : '−'}${Math.abs(diff)} frente a la semana anterior)` : ''}${ec >= 150 ? ': cumples lo que recomienda la OMS.' : '.'}` });
  }
  // Agua
  const wc = vals(cur, 'water'); const goal = dailyGoal(s, 'water');
  if (wc.length >= 3) {
    const hit = wc.filter((v) => v >= goal).length;
    out.push({ key: 'water', icon: 'drop', score: 0.2, tone: hit >= 5 ? 'good' : '', text: `Llegaste a tu meta de agua ${hit === 1 ? '1 día' : `${hit} días`} de 7.` });
  }
  // Frutas y verduras
  const vc = vals(cur, 'veg');
  if (vc.length >= 3) {
    const a = avg(vc);
    out.push({ key: 'veg', icon: 'sprout', score: 0.15, tone: a >= 5 ? 'good' : '', text: `Comiste ${a.toFixed(1).replace('.0', '')} porciones de frutas y verduras al día en promedio${a >= 5 ? ': lo que recomienda la OMS.' : ' (la OMS recomienda 5).'}` });
  }
  // Calma
  const cm = s.mind ? calmWeek(s, today).reduce((a, d) => a + d.minutes, 0) : 0;
  if (cm > 0) out.push({ key: 'calm', icon: 'sparkle', score: 0.12, tone: 'good', text: `${cm} minutos de calma esta semana.` });
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

// ---------- Diario ----------

export function promptOfDay(day, offset = 0) {
  const n = Math.floor(Date.parse(`${day}T12:00:00Z`) / 86400000);
  return JOURNAL_PROMPTS[((n + offset) % JOURNAL_PROMPTS.length + JOURNAL_PROMPTS.length) % JOURNAL_PROMPTS.length];
}

const JKINDS = ['libre', 'pregunta', 'gratitud', 'aprendizaje', 'nota'];

export function addJournal(s, p, today, ev = []) {
  const kind = JKINDS.includes(p.kind) ? p.kind : 'libre';
  const items = kind === 'gratitud' ? (Array.isArray(p.items) ? p.items : []).map((x) => txt(x, 200)).filter(Boolean).slice(0, 5) : [];
  const text = txt(p.text, 4000);
  if (!text && !items.length) return null;
  const day = isDay(p.day) ? p.day : today;
  const entry = { id: uid(), day, ts: Date.now(), kind, text, prompt: kind === 'pregunta' ? txt(p.prompt, 200) : '', items };
  s.journal.unshift(entry);
  s.journal.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : (b.ts || 0) - (a.ts || 0)));
  s.journal = s.journal.slice(0, 3000);
  if (day === today && firstToday(s, today, 'journal')) gainXP(s, 'crecimiento', 10, today, ev);
  if (items.length && day === today && firstToday(s, today, 'gratitude')) gainXP(s, 'emocional', 5, today, ev);
  autoCheck(s, today, ev);
  checkAchievements(s, today, ev);
  return entry;
}

export function updateJournal(s, id, p) {
  const e = s.journal.find((x) => x.id === id);
  if (!e) return null;
  if (p.text != null) e.text = txt(p.text, 4000);
  if (Array.isArray(p.items)) e.items = p.items.map((x) => txt(x, 200)).filter(Boolean).slice(0, 5);
  return e;
}

export function removeJournal(s, id) {
  s.journal = s.journal.filter((x) => x.id !== id);
}

// Cosas buenas anotadas (posada y diario).
export function goodThings(s) {
  let n = 0;
  for (const d of Object.values(s.inn || {})) n += Array.isArray(d && d.goods) ? d.goods.filter(Boolean).length : 0;
  for (const j of s.journal || []) n += Array.isArray(j.items) ? j.items.length : 0;
  return n;
}

export const journalDays = (s) => new Set((s.journal || []).filter((j) => j.kind !== 'nota').map((j) => j.day)).size;

// ---------- Intención del día ----------

export function setIntent(s, text, today, ev = []) {
  const t = txt(text, 160);
  if (!t) { delete s.mind.intents[today]; return null; }
  const prev = s.mind.intents[today];
  s.mind.intents[today] = { text: t, done: prev ? prev.done || null : null };
  if (firstToday(s, today, 'intent')) gainXP(s, 'emocional', 3, today, ev);
  return s.mind.intents[today];
}

export function markIntent(s, day, done, today, ev = []) {
  const it = s.mind.intents[day];
  if (!it) return null;
  it.done = ['si', 'parte', 'no'].includes(done) ? done : null;
  if (it.done === 'si' && firstToday(s, today, 'intentDone')) gainXP(s, 'emocional', 5, today, ev);
  return it;
}

// ---------- Descarga mental y pensamientos ----------

// Lo que te preocupa: lo que depende de ti se vuelve un pendiente con su siguiente paso; lo demás se suelta.
export function addWorries(s, list, today, ev = []) {
  let todos = 0; let released = 0;
  for (const w of list || []) {
    const text = txt(w.text, 200);
    if (!text) continue;
    const kind = w.kind === 'puedo' ? 'puedo' : 'no';
    let todo = null;
    if (kind === 'puedo') {
      const t = addTodo(s, { title: txt(w.step, 120) || text.slice(0, 120), cat: 'general', due: isDay(w.due) ? w.due : null, note: `De tu descarga mental: ${text}` }, today);
      if (t) { todo = t.id; todos += 1; }
    } else released += 1;
    s.mind.worries.unshift({ id: uid(), day: today, text, kind, todo });
  }
  s.mind.worries = s.mind.worries.slice(0, 1000);
  if (todos + released > 0 && firstToday(s, today, 'worries')) gainXP(s, 'emocional', 5, today, ev);
  return { todos, released };
}

export function addThought(s, p, today, ev = []) {
  const entry = {
    id: uid(), day: today, situation: txt(p.situation, 300), thought: txt(p.thought, 300), emotion: txt(p.emotion, 40),
    before: clamp(Math.round(Number(p.before) || 0), 0, 10), traps: (Array.isArray(p.traps) ? p.traps : []).map((x) => txt(x, 20)).slice(0, 5),
    favor: txt(p.favor, 500), contra: txt(p.contra, 500), alt: txt(p.alt, 500), after: clamp(Math.round(Number(p.after) || 0), 0, 10),
  };
  if (!entry.thought) return null;
  s.mind.thoughts.unshift(entry);
  s.mind.thoughts = s.mind.thoughts.slice(0, 500);
  if (firstToday(s, today, 'thought')) gainXP(s, 'emocional', 10, today, ev);
  checkAchievements(s, today, ev);
  return entry;
}

// ---------- Chequeo de bienestar OMS-5 ----------

export function addWellbeing(s, items, today, ev = []) {
  const vals = (Array.isArray(items) ? items : []).slice(0, 5).map((v) => clamp(Math.round(Number(v) || 0), 0, 5));
  if (vals.length !== 5) return null;
  const score = vals.reduce((a, b) => a + b, 0) * 4;
  const last = wellbeingInfo(s, today).last;
  const entry = { id: uid(), day: today, items: vals, score };
  s.mind.checks.unshift(entry);
  s.mind.checks = s.mind.checks.slice(0, 300);
  if (!last || diffDays(last.day, today) >= 7) gainXP(s, 'salud', 10, today, ev);
  checkAchievements(s, today, ev);
  return entry;
}

export function wellbeingInfo(s, today) {
  const list = [...((s.mind && s.mind.checks) || [])].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  const last = list[0] || null;
  const prev = list[1] || null;
  return {
    list, last, prev, change: last && prev ? last.score - prev.score : null,
    due: !last || diffDays(last.day, today) >= 14, low: !!last && last.score < WHO5_LOW, lowItem: !!last && last.items.some((v) => v <= 1),
  };
}

// ---------- Rueda de la vida ----------

export function addWheel(s, scores, today, ev = []) {
  const out = {};
  for (const a of WHEEL) out[a.id] = clamp(Math.round(Number(scores && scores[a.id]) || 0), 1, 10);
  const prev = wheelInfo(s).last;
  const entry = { id: uid(), day: today, scores: out };
  s.mind.wheel.unshift(entry);
  s.mind.wheel = s.mind.wheel.slice(0, 200);
  if (!prev || diffDays(prev.day, today) >= 7) gainXP(s, 'crecimiento', 15, today, ev);
  checkAchievements(s, today, ev);
  return entry;
}

export function wheelInfo(s) {
  const list = [...((s.mind && s.mind.wheel) || [])].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  const last = list[0] || null;
  const prev = list[1] || null;
  if (!last) return { list, last, prev, low: [], avg: null };
  const min = Math.min(...WHEEL.map((a) => last.scores[a.id]));
  return { list, last, prev, low: WHEEL.filter((a) => last.scores[a.id] === min).map((a) => a.id), avg: avg(WHEEL.map((a) => last.scores[a.id])) };
}

// ---------- Valores ----------

export function setValues(s, keys, today) {
  s.mind.values = { keys: [...new Set((keys || []).filter((k) => VALUE[k]))].slice(0, 5), since: s.mind.values.since || today };
  return s.mind.values;
}

// ---------- Revisión de la semana ----------

export const weekStart = (day) => addDays(day, -((weekday(day) + 6) % 7)); // lunes

export function reviewFor(s, day) {
  const wk = weekStart(day);
  return ((s.mind && s.mind.reviews) || []).find((r) => r.week === wk) || null;
}

export function saveReview(s, p, today, ev = []) {
  const wk = weekStart(today);
  let r = reviewFor(s, today);
  const first = !r;
  if (!r) { r = { id: uid(), week: wk, day: today }; s.mind.reviews.unshift(r); }
  r.day = today;
  for (const k of ['good', 'hard', 'learned', 'focus']) r[k] = txt(p[k], 800);
  r.values = {};
  for (const [k, v] of Object.entries(p.values || {})) if (VALUE[k]) r.values[k] = clamp(Math.round(Number(v) || 0), 1, 5);
  if (p.focusTodo && r.focus && !r.todo) {
    const t = addTodo(s, { title: r.focus.slice(0, 120), cat: 'general', due: addDays(wk, 7) }, today);
    if (t) r.todo = t.id;
  }
  s.mind.reviews = s.mind.reviews.slice(0, 260);
  if (first) { gainXP(s, 'crecimiento', 20, today, ev); addGold(s, 5, today); }
  checkAchievements(s, today, ev);
  return r;
}

// Viernes por la tarde, sábado desde el mediodía o domingo, si esta semana no la has cerrado.
export function reviewDue(s, today, hour) {
  const wd = weekday(today);
  return (wd === 0 || (wd === 6 && hour >= 12) || (wd === 5 && hour >= 17)) && !reviewFor(s, today);
}

// Lo de los últimos 7 días, para mirar la semana antes de escribir.
export function weekSummary(s, today) {
  const from = addDays(today, -6);
  const inWeek = (d) => d >= from && d <= today;
  let missions = 0;
  for (const [d, x] of Object.entries(s.days || {})) if (inWeek(d)) missions += Object.keys((x && x.done) || {}).length;
  const moods = [0, 0, 0, 0];
  for (const m of s.moods) if (inWeek(m.day)) moods[m.quad] += 1;
  const sleeps = Object.entries(s.health || {}).filter(([d, h]) => inWeek(d) && h && h.sleep != null).map(([, h]) => h.sleep);
  const exercise = Object.entries(s.health || {}).filter(([d]) => inWeek(d)).reduce((a, [, h]) => a + ((h && h.exercise) || 0), 0);
  const spent = ((s.money && s.money.tx) || []).filter((t) => inWeek(t.day) && txKind(t) === 'gasto').reduce((a, t) => a + txDOP(t), 0);
  return {
    missions, todos: (s.todos || []).filter((t) => t.done && inWeek(t.done)).length, moods, sleep: avg(sleeps), exercise,
    calm: s.mind ? calmWeek(s, today).reduce((a, d) => a + d.minutes, 0) : 0, journal: (s.journal || []).filter((j) => inWeek(j.day)).length,
    wins: (s.wins || []).filter((w) => inWeek(w.day)).length, spent: Math.round(spent),
  };
}

export { monthKey };
