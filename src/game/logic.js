// Astra · lógica del juego (sin interfaz). Todas las funciones que cambian el estado reciben el
// estado (una copia editable), el día de hoy y una lista `ev` donde se anotan los eventos a celebrar.
import { dayKey, addDays, diffDays, weekday, monthKey, DAYS, MONTHS } from '../app/dates.js';
import {
  AREA, AREA_KEYS, GOALS, CUSTOM_CHAPTERS, TALENTS, TALENT_LEVELS, POTIONS, SHOP_ITEMS,
  CATEGORIES, DEFAULT_REWARDS, INTENSITIES, MOOD_QUADS, INFLUENCES, DEFAULT_GOALS,
  TODO_GENERAL, TODO_XP, TODO_GOLD, RECORD_SECTIONS, RECORD_SCHEMAS, RECORD_XP,
  CATEGORY_GROUPS, DEFAULT_ACCOUNTS, FX_DEFAULT, TODO_HOGAR, CHORE_XP, SLEEP_LATENCY_MIN, SLEEP_ROUTINE, WIN_XP, WIN_SCOPES, WIN_TYPES,
  EXERCISE_TYPES, EXERCISE_WEEK_GOAL,
} from './content.js';
import { norm, guessCategory, guessIncome } from './parse.js';
import { wordOf } from './daily.js';
import { afterTx, ensureMoneyPlus } from './money.js';
import { defaultMind, bestCalmStreak, distinctEmotions, goodThings, journalDays } from './mind.js';
import { PROGRAM } from './wellness.js';

export const ENERGY_CAP = 10;
export const STEPS_GOAL = DEFAULT_GOALS.steps;

// Metas diarias de la persona (pasos, agua, ejercicio y sueño).
export function dailyGoal(s, key) {
  if (key === 'sleep') return Number(s.profile.sleepGoal) || 7;
  const v = Number(s.profile.goals && s.profile.goals[key]);
  return v > 0 ? v : DEFAULT_GOALS[key];
}

// Cambia una meta diaria. Las misiones que dependen de ella la siguen:
// «8,000 pasos» pasa a «10,000 pasos» y la energía de hoy se recalcula con tu nueva meta de sueño.
export function setDailyGoal(s, key, value, today = null) {
  const v = Math.round(Number(value) * 100) / 100;
  if (!(v > 0)) return;
  const before = dailyGoal(s, key);
  if (key === 'sleep') {
    s.profile.sleepGoal = v;
    const sl = today && s.health[today] ? s.health[today].sleep : null;
    if (sl != null && s.energy && s.energy.day === today) s.energy.max = energyMaxFromSleep(sl, v);
    return;
  }
  s.profile.goals = { ...(s.profile.goals || {}), [key]: v };
  if (key !== 'steps' || before === v) return;
  const old = new RegExp(`(^|\\D)${String(Math.round(before)).replace(/\B(?=(\d{3})+$)/g, '[,.]?')}(?!\\d)`);
  for (const m of s.missions) {
    if (!m.auto || m.auto.metric !== 'steps' || Number(m.auto.gte) !== before) continue;
    m.auto = { ...m.auto, gte: v };
    if (old.test(m.title)) m.title = m.title.replace(old, (_, pre) => `${pre}${v.toLocaleString('en-US')}`);
  }
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const validDay = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
// Fotos: en los registros solo va su id; la imagen vive en el teléfono (y en Drive si sincronizas).
export const cleanPhotos = (x) => (Array.isArray(x) ? [...new Set(x.filter((id) => typeof id === 'string' && /^p[\w-]{4,40}$/.test(id)))].slice(0, 8) : []);

export function defaultState(today = dayKey()) {
  return {
    v: 4,
    profile: { name: '', emblem: 'star', onboarded: false, created: today, classKeys: [], sleepGoal: 7, wakeGoal: '', selfRating: {}, goals: { ...DEFAULT_GOALS } },
    settings: { theme: 'auto', aiMode: 'auto', aiKey: '', aiModel: 'claude-sonnet-5-5', serverUrl: '', serverToken: '', lastBackup: null, hideNumbers: true, showDaily: true },
    xp: 0,
    attrs: Object.fromEntries(AREA_KEYS.map((k) => [k, 0])),
    gold: 0,
    vit: 80,
    energy: { day: today, max: 8, used: 0, bonus: 0 },
    streak: { count: 0, best: 0, lastDay: null, freezes: 1, freezeDays: [] },
    recovery: null,
    processed: today,
    stats: { done: 0, recovered: 0, todos: 0 },
    missions: [],
    days: {},
    vitLog: [],
    campaigns: [],
    bosses: [],
    health: {},
    moods: [],
    inn: {},
    people: [],
    contacts: [],
    books: [],
    reads: [],
    cards: [],
    practice: [],
    focus: [],
    money: defaultMoney(),
    rewards: DEFAULT_REWARDS.map((r) => ({ id: uid(), ...r })),
    redeemed: [],
    achievements: {},
    titles: [],
    journal: [],
    todos: [],
    todoLists: [],
    chores: [],
    wins: [],
    wordLog: {},
    photos: {},
    record: buildRecord(),
    mind: defaultMind(),
  };
}

// ---------- Días ----------

export function getDay(s, day) {
  if (!s.days[day]) s.days[day] = { done: {}, slips: {}, avoided: {}, excused: {}, xp: 0, xpBy: {}, gold: 0, potions: {}, fed: {}, vitEnd: null };
  const d = s.days[day];
  for (const k of ['done', 'slips', 'avoided', 'excused', 'xpBy', 'potions', 'fed']) if (!d[k]) d[k] = {};
  return d;
}

// ---------- Niveles ----------

export function levelInfo(xp, base, step) {
  let n = 1;
  let need = base;
  let acc = 0;
  while (xp >= acc + need) {
    acc += need;
    n += 1;
    need = base + step * (n - 1);
  }
  return { n, into: xp - acc, need, progress: (xp - acc) / need, nextAt: acc + need };
}
export const playerLevel = (xp) => levelInfo(xp, 100, 50);
export const attrLevel = (xp) => levelInfo(xp, 50, 25);

export function talentsFor(s, area) {
  const n = attrLevel(s.attrs[area] || 0).n;
  return TALENTS[area].map((name, i) => ({ name, level: TALENT_LEVELS[i], unlocked: n >= TALENT_LEVELS[i] }));
}
export const talentCount = (s, area) => talentsFor(s, area).filter((t) => t.unlocked).length;

export function className(keys) {
  if (!keys || !keys.length) return 'Aventurero';
  return keys.map((k) => AREA[k].cls).join(' ');
}

export function attrMult(s, area, today) {
  let mult = 1;
  if (s.profile.classKeys.includes(area)) mult += 0.2;
  mult += 0.05 * talentCount(s, area);
  for (const st of statuses(s, today)) mult += st.xp || 0;
  return mult;
}

export function gainXP(s, area, base, today, ev, { applyMods = true } = {}) {
  const mult = applyMods ? attrMult(s, area, today) : 1;
  const amt = Math.max(1, Math.round(base * mult));
  const beforeP = playerLevel(s.xp).n;
  const beforeA = attrLevel(s.attrs[area] || 0).n;
  const beforeT = talentCount(s, area);
  s.xp += amt;
  s.attrs[area] = (s.attrs[area] || 0) + amt;
  const d = getDay(s, today);
  d.xp += amt;
  d.xpBy[area] = (d.xpBy[area] || 0) + amt;
  const afterP = playerLevel(s.xp).n;
  const afterA = attrLevel(s.attrs[area]).n;
  if (afterP > beforeP) ev.push({ type: 'level', n: afterP });
  if (afterA > beforeA) ev.push({ type: 'attr', area, n: afterA });
  const t = talentsFor(s, area);
  if (talentCount(s, area) > beforeT) {
    const got = t.filter((x) => x.unlocked).pop();
    ev.push({ type: 'talent', area, name: got.name });
  }
  return amt;
}

// XP que sube el nivel del jugador sin pasar por un atributo (pendientes «General», por ejemplo).
function gainPlayerXP(s, base, today, ev, { applyMods = true } = {}) {
  let mult = 1;
  if (applyMods) for (const st of statuses(s, today)) mult += st.xp || 0;
  const amt = Math.max(1, Math.round(base * mult));
  const before = playerLevel(s.xp).n;
  s.xp += amt;
  getDay(s, today).xp += amt;
  const after = playerLevel(s.xp).n;
  if (after > before) ev.push({ type: 'level', n: after });
  return amt;
}

export function addGold(s, n, today) {
  s.gold = Math.max(0, s.gold + n);
  getDay(s, today).gold += n;
}

// ---------- Vitalidad y recuperación ----------

export function inRecovery(s, day) {
  return !!s.recovery && s.recovery.until >= day;
}

export function changeVit(s, delta, reason, day, ev = []) {
  const before = s.vit;
  s.vit = clamp(Math.round(s.vit + delta), 0, 100);
  const real = s.vit - before;
  if (real !== 0) {
    s.vitLog.unshift({ day, delta: real, reason });
    s.vitLog = s.vitLog.slice(0, 80);
  }
  getDay(s, day).vitEnd = s.vit;
  if (s.vit === 0 && !inRecovery(s, day)) {
    s.recovery = { start: day, until: addDays(day, 2), quests: {} };
    ev.push({ type: 'recovery' });
  } else if (s.recovery && s.vit >= 50) {
    s.recovery = null;
    s.stats.recovered = (s.stats.recovered || 0) + 1;
    ev.push({ type: 'recovered' });
  }
  return real;
}

// ---------- Sueño y energía ----------

export function energyMaxFromSleep(hours, goal = 7) {
  if (hours == null || Number.isNaN(hours)) return 8;
  if (hours >= goal) return ENERGY_CAP;
  return Math.max(4, ENERGY_CAP - Math.ceil((goal - hours) * 2));
}

export function ensureEnergyDay(s, today) {
  if (!s.energy || s.energy.day !== today) {
    s.energy = { day: today, max: energyMaxFromSleep(s.health[today]?.sleep, s.profile.sleepGoal), used: 0, bonus: 0 };
  }
  return s.energy;
}

export function energyInfo(s, today) {
  const e = s.energy && s.energy.day === today ? s.energy : { max: energyMaxFromSleep(s.health[today]?.sleep, s.profile.sleepGoal), used: 0, bonus: 0 };
  const total = Math.min(ENERGY_CAP, e.max + e.bonus);
  return { total, used: e.used, left: Math.max(0, total - e.used), max: e.max, bonus: e.bonus };
}

function spendEnergy(s, cost, today, ev) {
  ensureEnergyDay(s, today);
  const { left } = energyInfo(s, today);
  const shortfall = Math.max(0, cost - left);
  s.energy.used = Math.min(ENERGY_CAP + 5, s.energy.used + cost);
  if (shortfall > 0) changeVit(s, -2 * shortfall, 'Te sobreexigiste sin energía', today, ev);
  return shortfall;
}

export function statuses(s, today) {
  const out = [];
  const sl = s.health[today]?.sleep;
  const goal = s.profile.sleepGoal || 7;
  if (sl != null && sl >= goal) out.push({ id: 'descansado', label: 'Descansado', desc: '+10 % de XP hoy por dormir tu meta', icon: 'moon', tone: 'good', xp: 0.1 });
  else if (sl != null && sl < goal - 0.5) out.push({ id: 'cansado', label: 'Cansancio leve', desc: `−10 % de XP hasta que duermas ${fmtHours(goal)}`, icon: 'moon', tone: 'vit', xp: -0.1 });
  const lastOk = s.streak.lastDay && diffDays(s.streak.lastDay, today) <= 1;
  if (s.streak.count >= 7 && lastOk) out.push({ id: 'racha', label: 'Racha encendida', desc: `+5 % de XP por ${s.streak.count} días seguidos`, icon: 'flame', tone: 'xp', xp: 0.05 });
  if (inRecovery(s, today)) out.push({ id: 'recuperacion', label: 'Recuperación', desc: 'Cada misión devuelve el doble de vitalidad', icon: 'heart', tone: 'vit', xp: 0 });
  if (s.energy && s.energy.day === today && energyInfo(s, today).left <= 0) out.push({ id: 'reserva', label: 'En reserva', desc: 'Sin energía: cada misión extra cuesta vitalidad', icon: 'bolt', tone: 'ene', xp: 0 });
  return out;
}

// ---------- Racha ----------

export const MILESTONES = [3, 7, 14, 30, 60, 100, 200, 365];

function touchStreak(s, today, ev) {
  const st = s.streak;
  if (st.lastDay === today) return;
  if (st.lastDay && diffDays(st.lastDay, today) === 1) st.count += 1;
  else st.count = 1;
  st.lastDay = today;
  if (st.count > st.best) st.best = st.count;
  if (MILESTONES.includes(st.count)) ev.push({ type: 'streak', n: st.count });
}

// ---------- Misiones ----------

export function makeMission(p, today) {
  const cost = clamp(Number(p.cost) || 1, 1, 3);
  return {
    id: uid(),
    title: String(p.title || '').trim().slice(0, 80) || 'Misión',
    area: AREA[p.area] ? p.area : 'crecimiento',
    cost,
    kind: ['habit', 'once', 'avoid'].includes(p.kind) ? p.kind : 'habit',
    days: Array.isArray(p.days) && p.days.length && p.days.length < 7 ? [...p.days].sort() : null,
    penalty: !!p.penalty,
    auto: p.auto || null,
    feed: p.feed || null,
    campaignId: p.campaignId || null,
    created: today,
    archived: false,
    doneOn: null,
  };
}

export const missionXP = (m) => 10 * m.cost + (m.kind === 'once' ? 5 : 0);
export const missionGold = (m) => 5 * m.cost;
export const missionDamage = (m) => 3 * m.cost;

export function addMission(s, p, today) {
  const m = makeMission(p, today);
  s.missions.push(m);
  return m;
}

export function isScheduled(m, day) {
  if (m.archived || m.created > day) return false;
  if (m.kind === 'once') return !m.doneOn || m.doneOn === day;
  if (m.kind === 'avoid') return true;
  return !m.days || m.days.includes(weekday(day));
}

export function isDone(s, m, day) {
  return !!(s.days[day] && s.days[day].done && s.days[day].done[m.id]);
}

export function dayMissions(s, day) {
  const list = s.missions.filter((m) => isScheduled(m, day) && m.kind !== 'avoid');
  const done = list.filter((m) => isDone(s, m, day));
  const pending = list.filter((m) => !isDone(s, m, day));
  pending.sort((a, b) => (b.penalty - a.penalty) || (a.cost - b.cost));
  return { pending, done, avoid: s.missions.filter((m) => m.kind === 'avoid' && isScheduled(m, day)), all: list };
}

export function plannedEnergy(s, day) {
  return dayMissions(s, day).pending.reduce((a, m) => a + m.cost, 0);
}

export function completeMission(s, id, today, ev, { auto = false } = {}) {
  const m = s.missions.find((x) => x.id === id);
  if (!m || m.kind === 'avoid') return null;
  const d = getDay(s, today);
  if (d.done[id]) return null;
  spendEnergy(s, m.cost, today, ev);
  const xp = gainXP(s, m.area, missionXP(m), today, ev);
  const gold = missionGold(m);
  addGold(s, gold, today);
  const baseVit = m.area === 'salud' ? 2 : 1;
  const vit = changeVit(s, inRecovery(s, today) ? baseVit * 2 : baseVit, `Cumpliste «${m.title}»`, today, ev);
  d.done[id] = { ts: Date.now(), xp, gold, vit, cost: m.cost, auto };
  if (m.kind === 'once') m.doneOn = today;
  s.stats.done = (s.stats.done || 0) + 1;
  touchStreak(s, today, ev);
  if (m.feed) bossFeed(s, m.feed, 1, today, ev);
  if (m.campaignTaskId) setTask(s, m.campaignId, m.campaignTaskId, true, today, ev);
  checkAchievements(s, today, ev);
  return { xp, gold, vit };
}

export function undoMission(s, id, today) {
  const m = s.missions.find((x) => x.id === id);
  const d = getDay(s, today);
  const rec = d.done[id];
  if (!m || !rec) return false;
  s.xp = Math.max(0, s.xp - rec.xp);
  s.attrs[m.area] = Math.max(0, (s.attrs[m.area] || 0) - rec.xp);
  d.xp = Math.max(0, d.xp - rec.xp);
  d.xpBy[m.area] = Math.max(0, (d.xpBy[m.area] || 0) - rec.xp);
  s.gold = Math.max(0, s.gold - rec.gold);
  d.gold -= rec.gold;
  if (s.energy.day === today) s.energy.used = Math.max(0, s.energy.used - rec.cost);
  s.vit = clamp(s.vit - (rec.vit || 0), 0, 100);
  const i = s.vitLog.findIndex((l) => l.day === today && l.reason === `Cumpliste «${m.title}»`);
  if (i >= 0) s.vitLog.splice(i, 1);
  d.vitEnd = s.vit;
  if (m.kind === 'once') m.doneOn = null;
  s.stats.done = Math.max(0, (s.stats.done || 0) - 1);
  delete d.done[id];
  return true;
}

// Mal hábito: «caí».
export function slipMission(s, id, today, ev) {
  const m = s.missions.find((x) => x.id === id);
  if (!m || m.kind !== 'avoid') return 0;
  const d = getDay(s, today);
  d.slips[id] = (d.slips[id] || 0) + 1;
  return changeVit(s, -missionDamage(m), `Caíste en «${m.title}»`, today, ev);
}

// Un día que no puedes: usa un protector y la misión no quita vitalidad.
export function excuseMission(s, id, today) {
  if (s.streak.freezes <= 0) return false;
  const d = getDay(s, today);
  if (d.excused[id]) return false;
  s.streak.freezes -= 1;
  d.excused[id] = true;
  return true;
}

export function updateMission(s, id, patch) {
  const m = s.missions.find((x) => x.id === id);
  if (!m) return;
  const fixed = makeMission({ ...m, ...patch }, m.created);
  Object.assign(m, { ...fixed, id: m.id, created: m.created, doneOn: m.doneOn, campaignTaskId: m.campaignTaskId });
}

export function archiveMission(s, id) {
  const m = s.missions.find((x) => x.id === id);
  if (m) m.archived = true;
}

export function restoreMission(s, id) {
  const m = s.missions.find((x) => x.id === id);
  if (m) m.archived = false;
}

// ---------- Misiones automáticas ----------

export function metricValue(s, metric, day) {
  switch (metric) {
    case 'steps': return s.health[day]?.steps || 0;
    case 'sleep': return s.health[day]?.sleep ?? 0;
    case 'tx': return s.money.tx.filter((t) => t.day === day).length;
    case 'mood': return s.moods.filter((m) => m.day === day).length;
    case 'contact': return s.contacts.filter((c) => c.day === day).length;
    case 'focus': return s.focus.filter((f) => f.day === day && !f.broken).length;
    case 'calm': return ((s.mind && s.mind.calm) || []).filter((x) => x.day === day).reduce((a, x) => a + x.minutes, 0);
    case 'journal': return (s.journal || []).filter((j) => j.day === day).length;
    case 'gratitude': return ((s.inn[day] && s.inn[day].goods) || []).filter(Boolean).length + (s.journal || []).filter((j) => j.day === day).reduce((a, j) => a + ((j.items || []).length), 0);
    default: return 0;
  }
}

export function autoCheck(s, today, ev) {
  for (const m of s.missions) {
    if (!m.auto || m.kind === 'avoid' || !isScheduled(m, today) || isDone(s, m, today)) continue;
    const need = m.auto.gte === 'goal' ? s.profile.sleepGoal : m.auto.gte;
    if (metricValue(s, m.auto.metric, today) >= need) completeMission(s, m.id, today, ev, { auto: true });
  }
}

export function autoLabel(m) {
  if (!m.auto) return '';
  return {
    steps: 'Se completa con tus pasos',
    sleep: 'Se completa con tu sueño',
    tx: 'Se completa al registrar un gasto',
    mood: 'Se completa con un check-in',
    contact: 'Se completa al contactar a alguien',
    focus: 'Se completa con una sesión de enfoque',
    calm: `Se completa con ${m.auto.gte} min de calma`,
    journal: 'Se completa al escribir en tu diario',
    gratitude: 'Se completa al anotar algo bueno',
  }[m.auto.metric] || 'Automática';
}

// ---------- Cierre de días (al abrir la app) ----------

function closeDay(s, day, ev, { penalize }) {
  const d = getDay(s, day);
  if (d.closed) return;
  d.closed = true;
  for (const m of s.missions) {
    if (m.archived || m.created > day) continue;
    if (m.kind === 'avoid') {
      if (!d.slips[m.id]) {
        gainXP(s, m.area, 5 * m.cost, day, ev, { applyMods: false });
        addGold(s, 2 * m.cost, day);
        d.avoided[m.id] = true;
      }
      continue;
    }
    if (m.kind === 'habit' && m.penalty && penalize && isScheduled(m, day) && !d.done[m.id] && !d.excused[m.id]) {
      changeVit(s, -missionDamage(m), `No cumpliste «${m.title}»`, day, ev);
    }
  }
  if (d.vitEnd == null) d.vitEnd = s.vit;
}

export function reconcile(s, today) {
  const ev = [];
  const last = s.processed || today;
  if (last < today) {
    // Si vuelves tras mucho tiempo, solo se revisan los últimos 7 días y solo los 2 últimos quitan vitalidad.
    let day = diffDays(last, today) > 7 ? addDays(today, -7) : last;
    while (day < today) {
      closeDay(s, day, ev, { penalize: diffDays(day, today) <= 2 });
      day = addDays(day, 1);
    }
    s.processed = today;
    // Racha: los protectores cubren los días sin actividad.
    const st = s.streak;
    if (st.lastDay && st.count > 0) {
      const missed = diffDays(st.lastDay, today) - 1;
      if (missed > 0) {
        if (st.freezes >= missed) {
          st.freezes -= missed;
          for (let i = 1; i <= missed; i += 1) st.freezeDays.push(addDays(st.lastDay, i));
          st.freezeDays = st.freezeDays.slice(-30);
          st.lastDay = addDays(today, -1);
          ev.push({ type: 'freezeUsed', n: missed });
        } else {
          ev.push({ type: 'streakLost', count: st.count });
          st.count = 0;
        }
      }
    }
    if (s.recovery && s.recovery.until < today) {
      s.recovery = null;
      if (s.vit < 30) changeVit(s, 30 - s.vit, 'Terminó tu recuperación', today, ev);
    }
    // Poda de días viejos.
    const keys = Object.keys(s.days).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 120))) delete s.days[k];
  }
  ensureEnergyDay(s, today);
  if (s.chores && s.chores.length) syncChores(s, today);
  return ev;
}

// ---------- Recuperación ----------

export function completeRecoveryQuest(s, qid, today, ev) {
  if (!s.recovery || s.recovery.quests[qid]) return;
  s.recovery.quests[qid] = true;
  changeVit(s, 10, 'Misión de recuperación', today, ev);
}

// ---------- Pociones y tienda ----------

export function potionUses(s, pid, today) {
  return (s.days[today] && s.days[today].potions && s.days[today].potions[pid]) || 0;
}

export function usePotion(s, pid, today, ev) {
  const p = POTIONS.find((x) => x.id === pid);
  if (!p || potionUses(s, pid, today) >= p.perDay) return false;
  ensureEnergyDay(s, today);
  const d = getDay(s, today);
  d.potions[pid] = (d.potions[pid] || 0) + 1;
  if (p.effect.energy) s.energy.bonus = Math.min(ENERGY_CAP, s.energy.bonus + p.effect.energy);
  if (p.effect.vit) changeVit(s, p.effect.vit, p.title, today, ev);
  return true;
}

export function buyItem(s, itemId, today, ev) {
  const it = SHOP_ITEMS.find((x) => x.id === itemId);
  if (!it || s.gold < it.cost) return false;
  if (itemId === 'protector') {
    if (s.streak.freezes >= it.max) return false;
    s.streak.freezes += 1;
  }
  if (itemId === 'pocion') {
    const d = getDay(s, today);
    if (d.shopPotion) return false;
    d.shopPotion = true;
    changeVit(s, 20, 'Poción de vitalidad', today, ev);
  }
  addGold(s, -it.cost, today);
  return true;
}

export function redeemReward(s, rid, today) {
  const r = s.rewards.find((x) => x.id === rid);
  if (!r || s.gold < r.cost) return false;
  addGold(s, -r.cost, today);
  s.redeemed.unshift({ id: uid(), rewardId: rid, title: r.title, cost: r.cost, day: today });
  s.redeemed = s.redeemed.slice(0, 100);
  return true;
}

// ---------- Jefes ----------

export const bossHP = (b) => clamp(1 - b.progress / b.target, 0, 1);

export function hitBoss(s, id, amount, note, today, ev, source = 'manual') {
  const b = s.bosses.find((x) => x.id === id);
  const n = Number(amount);
  if (!b || b.status !== 'active' || !(n > 0)) return 0;
  b.progress = Math.min(b.target, b.progress + n);
  b.hits.unshift({ day: today, amount: n, note: note || '', source });
  b.hits = b.hits.slice(0, 200);
  gainXP(s, b.area, clamp(Math.round((300 * n) / b.target), 3, 60), today, ev);
  if (b.progress >= b.target) defeatBoss(s, b, today, ev);
  checkAchievements(s, today, ev);
  return n;
}

function defeatBoss(s, b, today, ev) {
  if (b.status !== 'active') return;
  b.status = 'won';
  b.wonOn = today;
  gainXP(s, b.area, b.reward.xp, today, ev, { applyMods: false });
  addGold(s, b.reward.gold, today);
  if (b.reward.title && !s.titles.includes(b.reward.title)) s.titles.push(b.reward.title);
  const c = s.campaigns.find((x) => x.id === b.campaignId);
  if (c) { c.status = 'won'; c.wonOn = today; }
  ev.push({ type: 'boss', title: b.title, reward: b.reward });
}

// Estas fuentes cuentan días (un entrenamiento, una noche, un día de pasos): solo suman una vez al día.
const DAILY_SOURCES = new Set(['training', 'sleepNight', 'stepsDay']);

export function bossFeed(s, source, amount, today, ev, { oncePerDay = DAILY_SOURCES.has(source), note = '' } = {}) {
  const d = getDay(s, today);
  if (oncePerDay) {
    if (d.fed[source]) return;
    d.fed[source] = true;
  }
  for (const b of s.bosses) if (b.status === 'active' && b.source === source) hitBoss(s, b.id, amount, note || SOURCE_NOTE[source] || '', today, ev, source);
}

const SOURCE_NOTE = {
  debtPay: 'Pago a la deuda', saving: 'Ahorro', training: 'Entrenamiento', sleepNight: 'Noche de buen sueño', stepsDay: 'Meta de pasos',
  mood: 'Check-in de ánimo', calm: 'Sesión de calma', contact: 'Contacto con tu gente', pages: 'Páginas leídas', practice: 'Práctica', focus: 'Sesión de enfoque',
};

export function createBoss(s, p, today) {
  const b = {
    id: uid(),
    title: String(p.title || 'Jefe').slice(0, 60),
    area: AREA[p.area] ? p.area : 'crecimiento',
    unit: p.unit || 'avances',
    money: !!p.money,
    target: Math.max(1, Number(p.target) || 1),
    progress: 0,
    hits: [],
    source: p.source || 'manual',
    start: today,
    deadline: p.deadline || null,
    status: 'active',
    reward: { xp: 500, gold: 200, title: p.rewardTitle || '' },
    campaignId: p.campaignId || null,
  };
  s.bosses.push(b);
  return b;
}

// ---------- Caminos y campañas ----------

export function goalTemplate(area, goalId) {
  return (GOALS[area] || []).find((g) => g.id === goalId) || null;
}

export function startCampaign(s, p, today) {
  const tpl = goalTemplate(p.area, p.goalId);
  const days = Number(p.days) || 90;
  const c = {
    id: uid(),
    area: p.area,
    goalId: tpl ? tpl.id : 'custom',
    title: tpl ? tpl.title : String(p.title || 'Mi meta').slice(0, 60),
    start: today,
    days,
    deadline: addDays(today, days),
    intensity: p.intensity || 'normal',
    chapters: (tpl ? tpl.chapters : CUSTOM_CHAPTERS).map((ch) => ({ title: ch.title, tasks: ch.tasks.map((t) => ({ id: uid(), title: t, done: null })) })),
    status: 'active',
    bossId: null,
  };
  const b = createBoss(s, {
    title: tpl ? tpl.boss : `El jefe de «${c.title}»`,
    area: p.area,
    unit: tpl ? tpl.unit : (p.unit || 'avances'),
    money: tpl ? !!tpl.money : !!p.money,
    target: Number(p.target) || (tpl && tpl.target) || 10,
    source: tpl ? tpl.source : 'manual',
    deadline: c.deadline,
    rewardTitle: tpl ? tpl.title2 : c.title,
    campaignId: c.id,
  }, today);
  c.bossId = b.id;
  s.campaigns.push(c);
  const picked = p.missions || [];
  for (const mp of picked) addMission(s, { area: p.area, ...mp, campaignId: c.id }, today);
  if (!s.profile.classKeys.includes(p.area) && s.profile.classKeys.length < 2) s.profile.classKeys.push(p.area);
  return c;
}

export function currentChapter(c) {
  const i = c.chapters.findIndex((ch) => ch.tasks.some((t) => !t.done));
  return i < 0 ? c.chapters.length : i;
}

export function campaignProgress(s, c) {
  const tasks = c.chapters.flatMap((ch) => ch.tasks);
  const tp = tasks.length ? tasks.filter((t) => t.done).length / tasks.length : 1;
  const b = s.bosses.find((x) => x.id === c.bossId);
  const bp = b ? 1 - bossHP(b) : 0;
  return c.status === 'won' ? 1 : 0.4 * tp + 0.6 * bp;
}

export function setTask(s, cid, tid, done, today, ev) {
  const c = s.campaigns.find((x) => x.id === cid);
  if (!c) return;
  const before = currentChapter(c);
  for (const ch of c.chapters) {
    const t = ch.tasks.find((x) => x.id === tid);
    if (!t || !!t.done === !!done) continue;
    if (done) {
      t.done = today;
      t.xp = gainXP(s, c.area, 15, today, ev);
    } else {
      takeBackXP(s, c.area, t.xp ?? 15, t.done);
      t.done = null;
      t.xp = 0;
    }
  }
  const after = currentChapter(c);
  if (after > before) ev.push({ type: 'chapter', title: c.chapters[before].title, battle: after >= c.chapters.length });
  checkAchievements(s, today, ev);
}

// Cambia la meta después de creada: nombre, número, unidad y fecha límite.
export function editCampaign(s, cid, p, today, ev) {
  const c = s.campaigns.find((x) => x.id === cid);
  if (!c) return null;
  const b = s.bosses.find((x) => x.id === c.bossId);
  if (p.title != null && String(p.title).trim().length > 1) c.title = String(p.title).trim().slice(0, 60);
  if (p.deadline && /^\d{4}-\d{2}-\d{2}$/.test(p.deadline) && p.deadline > c.start) {
    c.deadline = p.deadline;
    c.days = Math.max(1, diffDays(c.start, p.deadline));
    if (b) b.deadline = p.deadline;
  }
  if (b) {
    if (p.unit != null && String(p.unit).trim()) b.unit = String(p.unit).trim().slice(0, 20);
    const t = Number(p.target);
    if (t > 0) {
      b.target = Math.round(t * 100) / 100;
      if (b.status === 'active' && b.progress >= b.target) {
        b.progress = b.target;
        defeatBoss(s, b, today, ev);
      }
    }
  }
  checkAchievements(s, today, ev);
  return c;
}

export function addTask(s, cid, chapterIndex, title) {
  const c = s.campaigns.find((x) => x.id === cid);
  const t = String(title || '').trim().slice(0, 80);
  if (!c || t.length < 2) return null;
  const ch = c.chapters[clamp(Number(chapterIndex) || 0, 0, c.chapters.length - 1)];
  const task = { id: uid(), title: t, done: null };
  ch.tasks.push(task);
  return task;
}

export function renameTask(s, cid, tid, title) {
  const c = s.campaigns.find((x) => x.id === cid);
  const t = String(title || '').trim().slice(0, 80);
  if (!c || t.length < 2) return;
  for (const ch of c.chapters) for (const x of ch.tasks) if (x.id === tid) x.title = t;
}

export function removeTask(s, cid, tid) {
  const c = s.campaigns.find((x) => x.id === cid);
  if (!c) return;
  for (const ch of c.chapters) {
    // Quitar una tarea hecha devuelve su XP: agregar, marcar y borrar no suma nada.
    for (const t of ch.tasks) if (t.id === tid && t.done) takeBackXP(s, c.area, t.xp ?? 15, t.done);
    ch.tasks = ch.tasks.filter((x) => x.id !== tid);
  }
}

// Devuelve XP ganada (al desmarcar o borrar): total, atributo y el día en que se ganó.
function takeBackXP(s, area, amt, day) {
  const n = Math.max(0, Number(amt) || 0);
  if (!n) return;
  s.xp = Math.max(0, s.xp - n);
  if (area) s.attrs[area] = Math.max(0, (s.attrs[area] || 0) - n);
  const d = day && s.days[day];
  if (d) {
    d.xp = Math.max(0, (d.xp || 0) - n);
    if (area && d.xpBy) d.xpBy[area] = Math.max(0, (d.xpBy[area] || 0) - n);
  }
}

export function abandonCampaign(s, cid) {
  const c = s.campaigns.find((x) => x.id === cid);
  if (!c) return;
  c.status = 'abandoned';
  const b = s.bosses.find((x) => x.id === c.bossId);
  if (b && b.status === 'active') b.status = 'abandoned';
  for (const m of s.missions) if (m.campaignId === cid) m.archived = true;
}

export function activeCampaigns(s) {
  return s.campaigns.filter((c) => c.status === 'active');
}

// ---------- Salud ----------

export function logHealth(s, day, patch, today, ev) {
  const h = s.health[day] || (s.health[day] = {});
  const goal = s.profile.sleepGoal || 7;
  // Con la hora de acostarte y la de levantarte, las horas de sueño salen solas.
  if (patch.sleep == null && patch.bed && patch.wake) {
    const hrs = sleepFromTimes(patch.bed, patch.wake);
    if (hrs != null) patch = { ...patch, sleep: hrs };
  }
  if (patch.steps != null) {
    h.steps = Math.max(0, Math.round(Number(patch.steps) || 0));
    if (h.steps >= dailyGoal(s, 'steps')) bossFeed(s, 'stepsDay', 1, day, ev);
  }
  if (patch.sleep != null) {
    h.sleep = clamp(Math.round(Number(patch.sleep) * 4) / 4, 0, 16);
    const eff = h.sleep >= goal ? 5 : h.sleep < goal - 1 ? -5 : 0;
    const prev = h.sleepVit || 0;
    if (eff !== prev) changeVit(s, eff - prev, eff > 0 ? 'Dormiste tu meta' : eff < 0 ? `Dormiste ${fmtHours(h.sleep)} (meta ${fmtHours(goal)})` : 'Ajuste de sueño', day, ev);
    h.sleepVit = eff;
    if (day === today) {
      ensureEnergyDay(s, today);
      s.energy.max = energyMaxFromSleep(h.sleep, goal);
    }
    if (h.sleep >= goal) bossFeed(s, 'sleepNight', 1, day, ev);
  }
  for (const k of ['bed', 'wake']) if (patch[k] !== undefined) h[k] = timeToMin(patch[k]) != null ? minToTime(timeToMin(patch[k])) : '';
  if (patch.quality !== undefined) h.quality = clamp(Math.round(Number(patch.quality) || 0), 0, 4) || null;
  if (patch.water != null) h.water = clamp(Math.round(Number(patch.water) || 0), 0, 30);
  if (patch.veg != null) {
    const before = h.veg || 0;
    h.veg = clamp(Math.round(Number(patch.veg) || 0), 0, 20);
    if (before < dailyGoal(s, 'veg') && h.veg >= dailyGoal(s, 'veg')) gainXP(s, 'salud', 5, day, ev);
  }
  if (patch.exercise != null) {
    const before = h.exercise || 0;
    h.exercise = clamp(Math.round(Number(patch.exercise) || 0), 0, 600);
    // Minutos por tipo (caminar, gimnasio…): lo que sumas ahora va al tipo que elegiste.
    if (h.exercise > before && patch.exType) {
      const k = EXERCISE_TYPES.some((x) => x.key === patch.exType) ? patch.exType : 'otro';
      h.exTypes = { ...(h.exTypes || {}), [k]: ((h.exTypes || {})[k] || 0) + (h.exercise - before) };
    } else if (h.exercise < before && h.exTypes) {
      // Si bajas el total, se descuenta de los tipos (del último al primero).
      let extra = Object.values(h.exTypes).reduce((a, b) => a + b, 0) - h.exercise;
      for (const k of Object.keys(h.exTypes).reverse()) { if (extra <= 0) break; const cut = Math.min(extra, h.exTypes[k]); h.exTypes[k] -= cut; extra -= cut; if (!h.exTypes[k]) delete h.exTypes[k]; }
    }
    if (h.exercise > before) gainXP(s, 'salud', Math.min(30, Math.round((h.exercise - before) / 2)), day, ev);
    if (h.exercise >= 20) bossFeed(s, 'training', 1, day, ev);
  }
  if (day === today) autoCheck(s, today, ev);
  checkAchievements(s, today, ev);
}

export function fmtHours(h) {
  if (h == null) return '—';
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm ? `${hh} h ${mm}` : `${hh} h`;
}

// ---------- Emociones ----------

export function addMood(s, p, today, ev) {
  const entry = { id: uid(), day: today, ts: Date.now(), quad: clamp(Number(p.quad) || 0, 0, 3), words: (p.words || []).slice(0, 4), influences: (p.influences || []).slice(0, 6), note: String(p.note || '').slice(0, 500) };
  if (Array.isArray(p.body) && p.body.length) entry.body = p.body.map((x) => String(x).slice(0, 30)).slice(0, 5);
  s.moods.unshift(entry);
  s.moods = s.moods.slice(0, 500);
  const today2 = s.moods.filter((m) => m.day === today).length;
  if (today2 <= 2) gainXP(s, 'emocional', 15, today, ev);
  bossFeed(s, 'mood', 1, today, ev);
  autoCheck(s, today, ev);
  checkAchievements(s, today, ev);
  return entry;
}

export function logCalm(s, minutes, today, ev) {
  gainXP(s, 'emocional', Math.min(20, 5 + Math.round(minutes)), today, ev);
  bossFeed(s, 'calm', 1, today, ev);
  checkAchievements(s, today, ev);
}

const pleasant = (q) => q === 1 || q === 3;

export function moodInsight(s) {
  if (s.moods.length < 5) return null;
  let best = null;
  for (const inf of INFLUENCES) {
    const withI = s.moods.filter((m) => m.influences.includes(inf.key));
    const without = s.moods.filter((m) => !m.influences.includes(inf.key));
    if (withI.length < 2 || without.length < 2) continue;
    const a = withI.filter((m) => pleasant(m.quad)).length / withI.length;
    const b = without.filter((m) => pleasant(m.quad)).length / without.length;
    const diff = a - b;
    if (Math.abs(diff) >= 0.2 && (!best || Math.abs(diff) > Math.abs(best.diff))) best = { inf, diff };
  }
  if (!best) return 'Todavía no veo un patrón claro. Sigue registrando: con unos días más aparece.';
  const lab = best.inf.label.toLowerCase();
  return best.diff > 0
    ? `Los días en que marcas «${lab}» suelen terminar en el lado agradable.`
    : `Los días en que marcas «${lab}» suelen terminar en el lado desagradable.`;
}

export function moodCounts(s, days = 30, today = dayKey()) {
  const from = addDays(today, -days + 1);
  const out = [0, 0, 0, 0];
  for (const m of s.moods) if (m.day >= from) out[m.quad] += 1;
  return out;
}

export { MOOD_QUADS };

// ---------- Relaciones ----------

export function addPerson(s, p, today) {
  const person = {
    id: uid(),
    name: String(p.name || '').trim().slice(0, 40) || 'Persona',
    circle: p.circle || 'Amistad',
    every: clamp(Number(p.every) || 14, 1, 365),
    phone: String(p.phone || '').replace(/[^\d+]/g, '').slice(0, 16),
    birthday: /^\d{2}-\d{2}$/.test(p.birthday || '') ? p.birthday : '',
    last: p.last || null,
    created: today,
  };
  s.people.push(person);
  return person;
}

export function updatePerson(s, id, patch) {
  const p = s.people.find((x) => x.id === id);
  if (!p) return;
  if (patch.name != null) p.name = String(patch.name).trim().slice(0, 40) || p.name;
  if (patch.circle) p.circle = patch.circle;
  if (patch.every != null) p.every = clamp(Number(patch.every) || p.every, 1, 365);
  if (patch.phone != null) p.phone = String(patch.phone).replace(/[^\d+]/g, '').slice(0, 16);
  if (patch.birthday != null) p.birthday = /^\d{2}-\d{2}$/.test(patch.birthday) ? patch.birthday : '';
}

export function removePerson(s, id) {
  s.people = s.people.filter((p) => p.id !== id);
}

export function contactPerson(s, pid, kind, today, ev) {
  const p = s.people.find((x) => x.id === pid);
  if (!p) return;
  p.last = today;
  s.contacts.unshift({ id: uid(), pid, day: today, kind: kind || 'contacto' });
  s.contacts = s.contacts.slice(0, 500);
  const n = s.contacts.filter((c) => c.day === today).length;
  if (n <= 4) gainXP(s, 'relaciones', 15, today, ev);
  bossFeed(s, 'contact', 1, today, ev);
  autoCheck(s, today, ev);
  checkAchievements(s, today, ev);
}

export function personStatus(p, today) {
  const since = diffDays(p.last || p.created, today);
  return { since, ratio: since / p.every, due: since >= p.every };
}

export function duePeople(s, today) {
  return s.people
    .map((p) => ({ p, ...personStatus(p, today) }))
    .filter((x) => x.due)
    .sort((a, b) => b.ratio - a.ratio);
}

export function upcomingBirthdays(s, today, within = 14) {
  const out = [];
  const y = Number(today.slice(0, 4));
  for (const p of s.people) {
    if (!p.birthday) continue;
    let k = `${y}-${p.birthday}`;
    if (k < today) k = `${y + 1}-${p.birthday}`;
    const n = diffDays(today, k);
    if (n <= within) out.push({ p, day: k, inDays: n });
  }
  return out.sort((a, b) => a.inDays - b.inDays);
}

export function waLink(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  const full = digits.length === 10 ? `1${digits}` : digits;
  return `https://wa.me/${full}`;
}

// ---------- Crecimiento ----------

export function addBook(s, p) {
  const b = { id: uid(), title: String(p.title || '').trim().slice(0, 80) || 'Libro', pages: Math.max(1, Number(p.pages) || 200), read: 0, done: null };
  s.books.unshift(b);
  return b;
}

export function logPages(s, bookId, pages, today, ev) {
  const b = s.books.find((x) => x.id === bookId);
  const n = Math.max(0, Math.round(Number(pages) || 0));
  if (!b || !n) return;
  b.read = Math.min(b.pages, b.read + n);
  s.reads.unshift({ id: uid(), day: today, bookId, pages: n });
  s.reads = s.reads.slice(0, 1000);
  gainXP(s, 'crecimiento', Math.min(30, Math.max(2, Math.round(n / 2))), today, ev);
  bossFeed(s, 'pages', n, today, ev);
  if (b.read >= b.pages && !b.done) {
    b.done = today;
    gainXP(s, 'crecimiento', 50, today, ev, { applyMods: false });
    ev.push({ type: 'book', title: b.title });
  }
  checkAchievements(s, today, ev);
}

export const CARD_INTERVALS = [1, 2, 4, 8, 16];

export function addCard(s, front, back, today) {
  const c = { id: uid(), front: String(front).slice(0, 200), back: String(back).slice(0, 400), box: 1, due: today };
  s.cards.push(c);
  return c;
}

export function dueCards(s, today) {
  return s.cards.filter((c) => c.due <= today);
}

export function reviewCard(s, id, correct, today, ev) {
  const c = s.cards.find((x) => x.id === id);
  if (!c) return;
  c.box = correct ? Math.min(5, c.box + 1) : 1;
  c.due = addDays(today, CARD_INTERVALS[c.box - 1]);
  const d = getDay(s, today);
  d.cardsReviewed = (d.cardsReviewed || 0) + 1;
  if (d.cardsReviewed <= 20) gainXP(s, 'crecimiento', 2, today, ev);
}

export function logPractice(s, minutes, label, today, ev) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (!m) return;
  s.practice.unshift({ id: uid(), day: today, minutes: m, label: String(label || '').slice(0, 60) });
  gainXP(s, 'crecimiento', Math.min(40, Math.max(3, Math.round(m / 3))), today, ev);
  bossFeed(s, 'practice', Math.round((m / 60) * 100) / 100, today, ev);
}

// ---------- Enfoque (laborales) ----------

export function finishFocus(s, p, today, ev) {
  const minutes = Math.max(1, Math.round(Number(p.minutes) || 25));
  const entry = { id: uid(), day: today, minutes, label: String(p.label || '').slice(0, 60), broken: !!p.broken };
  s.focus.unshift(entry);
  s.focus = s.focus.slice(0, 500);
  if (entry.broken) {
    gainXP(s, 'laborales', 5, today, ev);
  } else {
    spendEnergy(s, 1, today, ev);
    gainXP(s, 'laborales', Math.round(minutes * 0.8), today, ev);
    bossFeed(s, 'focus', 1, today, ev);
    autoCheck(s, today, ev);
  }
  checkAchievements(s, today, ev);
  return entry;
}

export function closeWorkday(s, today, ev) {
  const d = getDay(s, today);
  if (d.closeWork) return false;
  d.closeWork = true;
  gainXP(s, 'laborales', 10, today, ev);
  changeVit(s, 2, 'Cerraste la jornada a tiempo', today, ev);
  return true;
}

// ---------- Posada (cierre del día) ----------

export function saveInn(s, p, today, ev) {
  const prev = s.inn[today];
  const first = !prev;
  const routine = (Array.isArray(p.routine) ? p.routine : []).filter((k) => SLEEP_ROUTINE.some((x) => x.key === k));
  const paid = prev ? prev.routinePaid || 0 : 0;
  const t = (v) => (timeToMin(v) != null ? minToTime(timeToMin(v)) : '');
  const goods = (Array.isArray(p.goods) ? p.goods : []).map((x) => String(x || '').trim().slice(0, 200)).filter(Boolean).slice(0, 3);
  const good = goods.length ? goods.join(' · ') : String(p.good || '').slice(0, 500);
  s.inn[today] = { mood: p.mood || '', good, goods, better: String(p.better || '').slice(0, 500), bed: t(p.bed), wake: t(p.wake), routine, routinePaid: Math.max(paid, routine.length) };
  if (first) {
    changeVit(s, 5, 'Descansaste en la posada', today, ev);
    gainXP(s, 'emocional', 10, today, ev);
  }
  // Tres cosas buenas: +5 de Temple una vez al día (también cuenta si las anotas en el diario).
  if (goods.length) {
    const d = getDay(s, today);
    if (!d.mind || typeof d.mind !== 'object') d.mind = {};
    if (!d.mind.gratitude) { d.mind.gratitude = true; gainXP(s, 'emocional', 5, today, ev); }
  }
  // La intención de hoy: ¿la cumpliste?
  if (p.intent && s.mind && s.mind.intents && s.mind.intents[today]) {
    const it = s.mind.intents[today];
    const was = it.done;
    it.done = ['si', 'parte', 'no'].includes(p.intent) ? p.intent : null;
    if (it.done === 'si' && was !== 'si') gainXP(s, 'emocional', 5, today, ev);
  }
  autoCheck(s, today, ev);
  // Cada paso de la rutina para dormir suma +2 XP de Vigor (una vez por paso al día).
  if (routine.length > paid) gainXP(s, 'salud', 2 * (routine.length - paid), today, ev);

  checkAchievements(s, today, ev);
  return first;
}

// ---------- Finanzas ----------
// Cada movimiento guarda su moneda (RD$ o US$), el monto en esa moneda (`orig`) y la tasa del día
// (pesos por US$1). `amount` es siempre el monto en pesos, con signo: + ingreso, − gasto o salida.
// Así los totales suman en pesos y cada movimiento muestra también su equivalente en la otra moneda.

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const r4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
const okRate = (r) => Number.isFinite(Number(r)) && Number(r) > 20 && Number(r) < 250;
export const TX_KINDS = ['gasto', 'ingreso', 'transfer'];

export function defaultMoney() {
  return {
    categories: CATEGORIES.map((c) => ({ ...c })),
    tx: [],
    accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })),
    rules: {},
    fx: { rate: FX_DEFAULT.rate, day: FX_DEFAULT.day, source: FX_DEFAULT.source, auto: true, manual: null, history: { [FX_DEFAULT.day]: FX_DEFAULT.rate }, fetched: null },
    lastImport: null,
    plans: [],
    budgetHist: {},
  };
}

// «Lo que sobra pasa al mes siguiente» (1.5): se conserva al poner al día las categorías.
const rollOf = (o) => (o && o.roll && /^\d{4}-\d{2}$/.test(o.rollFrom || '') ? { roll: true, rollFrom: o.rollFrom } : {});

// Pone al día los datos de dinero guardados por versiones anteriores (sin perder nada).
export function ensureMoney(s) {
  const d = defaultMoney();
  if (!s.money || typeof s.money !== 'object') s.money = d;
  const m = s.money;
  // Categorías: las de la app con su nombre nuevo (y tu presupuesto); las tuyas se quedan.
  const old = Array.isArray(m.categories) ? m.categories.filter((c) => c && typeof c === 'object' && c.id) : [];
  const byId = Object.fromEntries(old.map((c) => [c.id, c]));
  const builtin = CATEGORIES.map((c) => {
    const o = byId[c.id];
    return { ...c, budget: o ? Math.max(0, Math.round(Number(o.budget) || 0)) : 0, name: o && o.renamed ? String(o.name).slice(0, 40) : c.name, renamed: !!(o && o.renamed), hidden: !!(o && o.hidden), ...rollOf(o) };
  });
  const ids = new Set(CATEGORIES.map((c) => c.id));
  const custom = old.filter((c) => !ids.has(c.id)).map((c) => ({
    id: c.id, name: String(c.name || 'Sin nombre').slice(0, 40), group: CATEGORY_GROUPS.some((g) => g.id === c.group) ? c.group : 'otros',
    icon: c.icon || 'tag', type: TX_KINDS.includes(c.type) ? c.type : 'gasto', budget: Math.max(0, Math.round(Number(c.budget) || 0)), custom: true, hidden: !!c.hidden,
    ...rollOf(c),
  }));
  m.categories = [...builtin, ...custom];
  if (!Array.isArray(m.accounts) || !m.accounts.length) m.accounts = d.accounts;
  m.accounts = m.accounts.filter((a) => a && typeof a === 'object' && a.id && a.name);
  if (!m.rules || typeof m.rules !== 'object' || Array.isArray(m.rules)) m.rules = {};
  if (!m.fx || typeof m.fx !== 'object') m.fx = d.fx;
  m.fx = { ...d.fx, ...m.fx, history: { ...d.fx.history, ...(m.fx.history && typeof m.fx.history === 'object' ? m.fx.history : {}) } };
  if (!okRate(m.fx.rate)) { m.fx.rate = d.fx.rate; m.fx.day = d.fx.day; }
  if (m.fx.manual != null && !okRate(m.fx.manual)) m.fx.manual = null;
  if (!Array.isArray(m.tx)) m.tx = [];
  m.tx = m.tx.filter((t) => t && typeof t === 'object' && t.id && Number.isFinite(Number(t.amount)));
  for (const t of m.tx) {
    if (!t.currency) {
      // La 1.x guardaba los recibos en dólares sin convertir: se pasan a pesos con la tasa de referencia.
      if (t.note === 'Monto en US$') {
        t.currency = 'USD';
        t.orig = r2(Math.abs(t.amount));
        t.rate = fxRate(s, t.day);
        t.amount = -r2(t.orig * t.rate);
        t.note = '';
      } else t.currency = 'DOP';
    }
    if (!TX_KINDS.includes(t.kind)) t.kind = t.amount > 0 ? 'ingreso' : 'gasto';
    if (t.orig == null) t.orig = r2(Math.abs(t.amount));
    if (t.kind === 'ingreso' && !m.categories.some((c) => c.id === t.cat && c.type === 'ingreso')) t.cat = 'ingreso';
  }
  if (m.lastImport && (typeof m.lastImport !== 'object' || !m.lastImport.batch)) m.lastImport = null;
  ensureMoneyPlus(s);
  return m;
}

// ----- Tasa del dólar -----

// Pesos por US$1 para un día: tu tasa propia si la pusiste; si no, la de ese día (o la más cercana
// anterior que la app conozca); si no, la más reciente.
export function fxRate(s, day = null) {
  const fx = (s.money && s.money.fx) || {};
  if (okRate(fx.manual)) return Number(fx.manual);
  const h = fx.history || {};
  if (day && okRate(h[day])) return Number(h[day]);
  if (day) {
    const prev = Object.keys(h).filter((k) => k <= day && okRate(h[k])).sort().pop();
    if (prev && diffDays(prev, day) <= 10) return Number(h[prev]);
  }
  return okRate(fx.rate) ? Number(fx.rate) : FX_DEFAULT.rate;
}

// Anota la tasa de un día. Si es la más nueva, pasa a ser la tasa de hoy.
export function recordRate(s, day, rate, source = '') {
  if (!okRate(rate) || !validDay(day)) return false;
  const fx = s.money.fx;
  fx.history = { ...(fx.history || {}), [day]: r4(rate) };
  const keys = Object.keys(fx.history).sort();
  if (keys.length > 400) for (const k of keys.slice(0, keys.length - 400)) delete fx.history[k];
  if (!fx.day || day >= fx.day) { fx.rate = r4(rate); fx.day = day; if (source) fx.source = source; }
  return true;
}

export function setManualRate(s, rate) {
  s.money.fx.manual = rate == null || rate === '' ? null : okRate(rate) ? r4(rate) : s.money.fx.manual;
}

export const fxIsManual = (s) => okRate(s.money.fx && s.money.fx.manual);

export const toDOP = (amount, currency, rate) => r2(currency === 'USD' ? Number(amount) * Number(rate) : Number(amount));
export const toUSD = (dop, rate) => r2(Number(dop) / Number(rate));

// ----- Lectura de un movimiento -----

export const txKind = (t) => (TX_KINDS.includes(t.kind) ? t.kind : t.amount > 0 ? 'ingreso' : 'gasto');
export const txCur = (t) => (t.currency === 'USD' ? 'USD' : 'DOP');
export const txOrig = (t) => (t.orig != null ? Number(t.orig) : Math.abs(Number(t.amount) || 0));
export const txDOP = (t) => Math.abs(Number(t.amount) || 0);
export const txRate = (s, t) => (okRate(t.rate) ? Number(t.rate) : fxRate(s, t.day));
// Equivalente en dólares: el monto original si fue en US$; si fue en pesos, con la tasa de su día.
export const txUSD = (s, t) => (txCur(t) === 'USD' ? txOrig(t) : r2(txDOP(t) / txRate(s, t)));

// ----- Categorías -----

const FALLBACK_CAT = { gasto: 'otros', ingreso: 'ingreso', transfer: 'entre_cuentas' };

export function catOf(s, id) {
  const c = s.money.categories.find((x) => x.id === id);
  if (c) return c;
  if (id === 'ingreso') return { id: 'ingreso', name: 'Otros ingresos', icon: 'coins', type: 'ingreso', group: 'ingresos' };
  return { id: id || 'otros', name: 'Otros gastos', icon: 'dots', type: 'gasto', group: 'otros' };
}
export const catName = (s, id) => catOf(s, id).name;
export const catsOfType = (s, type = 'gasto') => s.money.categories.filter((c) => c.type === type && !c.hidden);

// Categorías de un tipo agrupadas por familia, en el orden de la app.
export function catGroups(s, type = 'gasto') {
  const list = catsOfType(s, type);
  return CATEGORY_GROUPS.map((g) => ({ ...g, cats: list.filter((c) => c.group === g.id) })).filter((g) => g.cats.length);
}

export function addCategory(s, p) {
  const name = String(p.name || '').trim().slice(0, 40);
  if (name.length < 2) return null;
  const type = TX_KINDS.includes(p.type) ? p.type : 'gasto';
  const dup = s.money.categories.find((c) => norm(c.name) === norm(name) && c.type === type);
  if (dup) { dup.hidden = false; return dup; }
  const group = CATEGORY_GROUPS.some((g) => g.id === p.group) ? p.group : type === 'ingreso' ? 'ingresos' : 'otros';
  const c = { id: `c${uid()}`, name, group, icon: p.icon || 'tag', type, budget: 0, custom: true };
  s.money.categories.push(c);
  return c;
}

export function updateCategory(s, id, p) {
  const c = s.money.categories.find((x) => x.id === id);
  if (!c) return null;
  if (p.name != null && String(p.name).trim().length >= 2) {
    const name = String(p.name).trim().slice(0, 40);
    if (name !== c.name) { c.name = name; if (!c.custom) c.renamed = true; }
  }
  if (p.icon) c.icon = p.icon;
  if (p.group && c.custom && CATEGORY_GROUPS.some((g) => g.id === p.group)) c.group = p.group;
  if (p.hidden != null) c.hidden = !!p.hidden;
  return c;
}

// Solo las tuyas se borran. Sus movimientos pasan a «Otros».
export function removeCategory(s, id) {
  const c = s.money.categories.find((x) => x.id === id);
  if (!c || !c.custom) return false;
  const to = FALLBACK_CAT[c.type] || 'otros';
  for (const t of s.money.tx) if (t.cat === id) t.cat = to;
  for (const k of Object.keys(s.money.rules)) if (s.money.rules[k] === id) delete s.money.rules[k];
  s.money.categories = s.money.categories.filter((x) => x.id !== id);
  return true;
}

export function setBudget(s, catId, amount, today = null) {
  const c = s.money.categories.find((x) => x.id === catId);
  if (!c || c.type !== 'gasto') return;
  const v = Math.max(0, Math.round(Number(amount) || 0));
  if (today && v !== (Number(c.budget) || 0)) {
    if (!s.money.budgetHist) s.money.budgetHist = {};
    const mk = monthKey(today);
    if (!s.money.budgetHist[mk]) s.money.budgetHist[mk] = {};
    s.money.budgetHist[mk][catId] = v;
  }
  c.budget = v;
}

// ----- Comercio → categoría (lo que aprendes al corregir) -----

export function merchantKey(m) {
  return norm(m).replace(/#?\d+/g, ' ').replace(/[^a-z& ]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
}
export function ruleFor(s, merchant) {
  const k = merchantKey(merchant);
  return k && s.money.rules[k] && s.money.categories.some((c) => c.id === s.money.rules[k]) ? s.money.rules[k] : null;
}
export function learnRule(s, merchant, cat) {
  const k = merchantKey(merchant);
  if (!k || k.length < 3 || !s.money.categories.some((c) => c.id === cat)) return;
  s.money.rules[k] = cat;
  const keys = Object.keys(s.money.rules);
  if (keys.length > 400) delete s.money.rules[keys[0]];
}

// Categoría probable: primero lo que aprendiste; después, las palabras del comercio o la nota.
export function guessTxCat(s, { merchant = '', text = '', type = 'gasto' } = {}) {
  const r = ruleFor(s, merchant);
  if (r && catOf(s, r).type === type) return r;
  if (type === 'ingreso') return guessIncome(`${merchant} ${text}`);
  if (type === 'transfer') return 'entre_cuentas';
  return guessCategory(`${merchant} ${text}`);
}

// ----- Cuentas y tarjetas -----

export const accountOf = (s, id) => (id ? s.money.accounts.find((a) => a.id === id) || null : null);
export const accountLabel = (a) => (a ? `${a.name}${a.last4 ? ` ·${a.last4}` : ''}` : '');
const last4Of = (v) => String(v || '').replace(/\D/g, '').slice(-4);

export function addAccount(s, p) {
  const name = String(p.name || '').trim().slice(0, 40);
  if (name.length < 2) return null;
  const last4 = last4Of(p.last4);
  const bank = String(p.bank || '').trim().slice(0, 30);
  const same = s.money.accounts.find((a) => (last4 && a.last4 === last4 && norm(a.bank) === norm(bank)) || (!last4 && norm(a.name) === norm(name)));
  if (same) return same;
  const kind = ['tarjeta', 'debito', 'cuenta', 'efectivo'].includes(p.kind) ? p.kind : 'cuenta';
  const a = { id: p.id && !accountOf(s, p.id) ? String(p.id).slice(0, 40) : `a${uid()}`, name, kind, bank, last4 };
  s.money.accounts.push(a);
  accountExtras(s, a, p);
  return a;
}

const dayNum = (v) => (Number(v) >= 1 && Number(v) <= 31 ? Math.round(Number(v)) : 0);
// Lo propio de cada tipo de cuenta (1.5).
function accountExtras(s, a, p) {
  if (a.kind === 'tarjeta') {
    delete a.currency;
    delete a.of;
    const lim = p.limit || a.limit || {};
    a.limit = { DOP: Math.max(0, Number(lim.DOP) || 0), USD: Math.max(0, Number(lim.USD) || 0) };
    if (p.cut !== undefined) a.cut = dayNum(p.cut); else if (a.cut === undefined) a.cut = 0;
    if (p.due !== undefined) a.due = dayNum(p.due); else if (a.due === undefined) a.due = 0;
    if (p.payFrom !== undefined) a.payFrom = p.payFrom && accountOf(s, p.payFrom) && p.payFrom !== a.id ? p.payFrom : '';
    if (!a.paidCuts) a.paidCuts = {};
  } else {
    if (p.currency) a.currency = p.currency === 'USD' ? 'USD' : 'DOP'; else if (!a.currency) a.currency = 'DOP';
    if (a.kind === 'debito') { if (p.of !== undefined) a.of = p.of && accountOf(s, p.of) && p.of !== a.id ? p.of : ''; } else delete a.of;
    if (p.save !== undefined) a.save = !!p.save && a.kind === 'cuenta';
    delete a.limit; delete a.cut; delete a.due; delete a.payFrom;
  }
  if (p.hidden !== undefined) a.hidden = !!p.hidden;
}

export function updateAccount(s, id, p) {
  const a = accountOf(s, id);
  if (!a) return null;
  if (p.name != null && String(p.name).trim().length >= 2) a.name = String(p.name).trim().slice(0, 40);
  if (p.kind && ['tarjeta', 'debito', 'cuenta', 'efectivo'].includes(p.kind)) a.kind = p.kind;
  if (p.bank != null) a.bank = String(p.bank).trim().slice(0, 30);
  if (p.last4 != null) a.last4 = last4Of(p.last4);
  accountExtras(s, a, p);
  return a;
}

export function removeAccount(s, id) {
  s.money.accounts = s.money.accounts.filter((a) => a.id !== id);
  for (const t of s.money.tx) { if (t.account === id) t.account = ''; if (t.to === id) t.to = ''; }
  for (const a of s.money.accounts) { if (a.of === id) a.of = ''; if (a.payFrom === id) a.payFrom = ''; }
  for (const p of s.money.plans || []) if (p.account === id) p.account = '';
}

// ----- Registrar, corregir y borrar -----

function buildTx(s, p, prev = null) {
  const kind = TX_KINDS.includes(p.type) ? p.type : prev ? prev.kind : 'gasto';
  const currency = p.currency === 'USD' ? 'USD' : 'DOP';
  const day = validDay(p.day) || (prev && prev.day) || dayKey();
  const orig = r2(Math.abs(Number(p.amount) || 0));
  const rate = okRate(p.rate) ? r4(p.rate) : fxRate(s, day);
  const dop = toDOP(orig, currency, rate);
  const valid = s.money.categories.some((c) => c.id === p.cat && c.type === kind);
  const cat = valid ? p.cat : kind === 'gasto' ? guessTxCat(s, { merchant: p.merchant, text: p.note, type: 'gasto' }) : FALLBACK_CAT[kind];
  const account = p.account && accountOf(s, p.account) ? p.account : '';
  const to = kind === 'transfer' && p.to && accountOf(s, p.to) && p.to !== account ? p.to : '';
  return {
    id: prev ? prev.id : uid(),
    day,
    time: /^\d{1,2}:\d{2}$/.test(p.time || '') ? p.time : '',
    kind,
    amount: kind === 'ingreso' ? dop : -dop,
    currency,
    orig,
    rate,
    cat,
    merchant: String(p.merchant || '').trim().slice(0, 60),
    note: String(p.note || '').slice(0, 200),
    account,
    to,
    tag: String(p.tag || '').trim().slice(0, 30),
    source: p.source || (prev && prev.source) || 'manual',
    ref: String(p.ref || (prev && prev.ref) || '').slice(0, 80),
    batch: (prev && prev.batch) || p.batch || '',
    rnc: p.rnc != null ? p.rnc : prev ? prev.rnc : '',
    ncf: p.ncf != null ? p.ncf : prev ? prev.ncf : '',
    itbis: Number(p.itbis != null ? p.itbis : prev ? prev.itbis : 0) || 0,
    photos: cleanPhotos(p.photos != null ? p.photos : prev ? prev.photos : []),
    created: prev ? prev.created : Date.now(),
  };
}

const sortTx = (s) => s.money.tx.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : (b.time || '') < (a.time || '') ? -1 : (b.time || '') > (a.time || '') ? 1 : (b.created || 0) - (a.created || 0)));

// `p`: { type: gasto|ingreso|transfer, amount (en su moneda), currency: DOP|USD, rate, cat, merchant, note,
//        day, time, account, tag, source, ref, batch, rnc, ncf, itbis }
export function addTx(s, p, today, ev) {
  if (!(Math.abs(Number(p.amount) || 0) > 0)) return null;
  const tx = buildTx(s, { ...p, day: validDay(p.day) || today });
  if (!tx.orig) return null;
  s.money.tx.unshift(tx);
  sortTx(s);
  afterTx(s, tx, today, ev, p.link || null);
  if (tx.kind === 'transfer') return tx;
  const d = getDay(s, today);
  d.txXp = (d.txXp || 0) + 1;
  if (d.txXp <= 3) gainXP(s, 'finanzas', 5, today, ev);
  const abs = txDOP(tx);
  if (tx.kind === 'gasto' && tx.cat === 'deuda') bossFeed(s, 'debtPay', abs, today, ev, { note: tx.merchant ? `Pago: ${tx.merchant}` : '' });
  if (tx.kind === 'gasto' && tx.cat === 'ahorro') bossFeed(s, 'saving', abs, today, ev, { note: tx.merchant ? `Ahorro: ${tx.merchant}` : '' });
  autoCheck(s, today, ev);
  checkAchievements(s, today, ev);
  return tx;
}

// Corrige un movimiento. Si cambias la categoría de un comercio, la app la recuerda para la próxima.
export function updateTx(s, id, p, { learn = true } = {}) {
  const i = s.money.tx.findIndex((t) => t.id === id);
  if (i < 0) return null;
  const prev = s.money.tx[i];
  const merged = {
    type: p.type || prev.kind, amount: p.amount != null ? p.amount : txOrig(prev), currency: p.currency || txCur(prev),
    rate: p.rate != null ? p.rate : prev.rate, cat: p.cat || prev.cat, merchant: p.merchant != null ? p.merchant : prev.merchant,
    note: p.note != null ? p.note : prev.note, day: p.day || prev.day, time: p.time != null ? p.time : prev.time,
    account: p.account != null ? p.account : prev.account, tag: p.tag != null ? p.tag : prev.tag,
    photos: p.photos != null ? p.photos : prev.photos, to: p.to != null ? p.to : prev.to,
  };
  if (!(Math.abs(Number(merged.amount) || 0) > 0)) return null;
  const tx = buildTx(s, merged, prev);
  s.money.tx[i] = tx;
  sortTx(s);
  if (learn && tx.merchant && tx.cat !== prev.cat && tx.kind === 'gasto') learnRule(s, tx.merchant, tx.cat);
  return tx;
}

export function removeTx(s, id) {
  s.money.tx = s.money.tx.filter((t) => t.id !== id);
  // Si era el pago de algo programado, esa fecha vuelve a quedar pendiente.
  for (const p of s.money.plans || []) for (const [d, v] of Object.entries(p.done || {})) if (v === id) delete p.done[d];
}

// ----- Resumen del mes -----

export function monthSummary(s, mk) {
  const txs = s.money.tx.filter((t) => monthKey(t.day) === mk);
  let income = 0; let incomeUSD = 0; let spent = 0; let spentUSD = 0; let moved = 0;
  const byCat = {}; const byCatUSD = {}; const paidIn = { DOP: 0, USD: 0 }; const byTag = {}; const byTagUSD = {};
  for (const t of txs) {
    const k = txKind(t);
    if (k === 'transfer') { moved += txDOP(t); continue; }
    if (k === 'ingreso') { income += txDOP(t); incomeUSD += txUSD(s, t); continue; }
    spent += txDOP(t);
    spentUSD += txUSD(s, t);
    byCat[t.cat] = (byCat[t.cat] || 0) + txDOP(t);
    byCatUSD[t.cat] = (byCatUSD[t.cat] || 0) + txUSD(s, t);
    paidIn[txCur(t)] += txOrig(t);
    if (t.tag) { byTag[t.tag] = (byTag[t.tag] || 0) + txDOP(t); byTagUSD[t.tag] = (byTagUSD[t.tag] || 0) + txUSD(s, t); }
  }
  const assigned = s.money.categories.filter((c) => c.type === 'gasto').reduce((a, c) => a + (Number(c.budget) || 0), 0);
  return {
    income: r2(income), incomeUSD: r2(incomeUSD), spent: r2(spent), spentUSD: r2(spentUSD), moved: r2(moved),
    byCat, byCatUSD, paidIn, byTag, byTagUSD, assigned, unassigned: r2(income - assigned), count: txs.length, txs,
  };
}

// Etiquetas usadas (viajes, proyectos), de la más reciente a la más vieja.
export function txTags(s) {
  const seen = [];
  for (const t of s.money.tx) if (t.tag && !seen.includes(t.tag)) seen.push(t.tag);
  return seen.slice(0, 12);
}

export function tagTotal(s, tag) {
  let dop = 0; let usd = 0; let n = 0;
  for (const t of s.money.tx) if (t.tag === tag && txKind(t) === 'gasto') { dop += txDOP(t); usd += txUSD(s, t); n += 1; }
  return { dop: r2(dop), usd: r2(usd), n };
}

// ----- Importar varios movimientos (avisos del banco, archivo o enlace) -----

// ¿Ya está? Mismo número de referencia, o mismo día, moneda, monto y comercio.
// El comercio se compara «a lo largo»: «WENDYS 12 PLAZA» y «Wendy's Plaza» son el mismo.
const looseName = (m) => norm(m).replace(/[^a-z]/g, '').slice(0, 6);
export function findDuplicate(s, it, pool = s.money.tx) {
  const ref = String(it.ref || '');
  const cur = it.currency === 'USD' ? 'USD' : 'DOP';
  const amt = r2(Math.abs(Number(it.amount) || 0));
  const mk = looseName(it.merchant || '');
  return pool.find((t) => (ref && t.ref === ref)
    || (t.day === it.day && txCur(t) === cur && Math.abs(txOrig(t) - amt) < 0.005
      && ((it.time && t.time && it.time === t.time) || !mk || !looseName(t.merchant) || looseName(t.merchant) === mk))) || null;
}

// Busca una cuenta conocida (por banco y últimos 4) o la crea.
export function resolveAccount(s, desc) {
  if (!desc) return '';
  if (typeof desc === 'string') return accountOf(s, desc) ? desc : '';
  const last4 = last4Of(desc.last4);
  const hit = s.money.accounts.find((a) => (desc.id && a.id === desc.id) || (last4 && a.last4 === last4 && (!desc.bank || !a.bank || norm(a.bank) === norm(desc.bank))));
  if (hit) return hit.id;
  const a = addAccount(s, desc);
  return a ? a.id : '';
}

// `pack`: { label, accounts: [...], rates: { día: tasa }, items: [{ on, kind, amount, currency, rate, day, time, merchant, cat, account, tag, note, ref }] }
export function importTxs(s, pack, today, ev) {
  const batch = `b${uid()}`;
  const accMap = {};
  const before = new Set(s.money.accounts.map((a) => a.id));
  for (const a of pack.accounts || []) {
    const id = resolveAccount(s, a);
    if (a.id) accMap[a.id] = id;
  }
  for (const [day, rate] of Object.entries(pack.rates || {})) {
    if (!(s.money.fx.history && okRate(s.money.fx.history[day]))) recordRate(s, day, rate, pack.rateSource || 'Tasa oficial DGII');
  }
  let added = 0; let skipped = 0;
  for (const it of pack.items || []) {
    if (it.on === false) continue;
    if (findDuplicate(s, it)) { skipped += 1; continue; }
    const account = typeof it.account === 'string' ? accMap[it.account] || (accountOf(s, it.account) ? it.account : '') : resolveAccount(s, it.account);
    const to = !it.to ? '' : typeof it.to === 'string' ? accMap[it.to] || (accountOf(s, it.to) ? it.to : '') : resolveAccount(s, it.to);
    const tx = addTx(s, {
      type: it.kind, amount: it.amount, currency: it.currency, rate: it.rate || (pack.rates && pack.rates[it.day]), cat: it.cat, merchant: it.merchant, note: it.note,
      day: it.day, time: it.time, account, to, tag: it.tag, ref: it.ref, batch, source: it.source || pack.source || 'importado',
    }, today, ev);
    if (tx) added += 1;
  }
  // Las cuentas que trajo el paquete y que no se usaron no se quedan.
  const used = new Set(s.money.tx.flatMap((t) => [t.account, t.to]));
  const created = s.money.accounts.filter((a) => !before.has(a.id));
  s.money.accounts = s.money.accounts.filter((a) => before.has(a.id) || used.has(a.id));
  if (added) s.money.lastImport = { batch, label: String(pack.label || 'Movimientos importados').slice(0, 80), n: added, day: today, accounts: created.filter((a) => used.has(a.id)).map((a) => a.id) };
  return { batch, added, skipped };
}

export function undoImport(s, batch) {
  const before = s.money.tx.length;
  s.money.tx = s.money.tx.filter((t) => t.batch !== batch);
  if (s.money.lastImport && s.money.lastImport.batch === batch) {
    // Las cuentas que creó esa importación se quitan si ya no tienen movimientos.
    const made = new Set(s.money.lastImport.accounts || []);
    const used = new Set(s.money.tx.flatMap((t) => [t.account, t.to]));
    s.money.accounts = s.money.accounts.filter((a) => !made.has(a.id) || used.has(a.id));
    s.money.lastImport = null;
  }
  return before - s.money.tx.length;
}

// Las categorías que más usas (para elegir rápido).
export function frequentCats(s, type = 'gasto', n = 6) {
  const count = {};
  for (const t of s.money.tx.slice(0, 300)) if (txKind(t) === type) count[t.cat] = (count[t.cat] || 0) + 1;
  const base = type === 'gasto' ? ['super', 'comida', 'combustible', 'transporte', 'servicios', 'salud'] : type === 'ingreso' ? ['salario', 'honorarios', 'ventas', 'remesas', 'ingreso'] : ['pago_tarjeta', 'entre_cuentas', 'retiro'];
  const ids = [...Object.keys(count).sort((a, b) => count[b] - count[a]), ...base];
  const out = [];
  for (const id of ids) {
    const c = s.money.categories.find((x) => x.id === id && x.type === type && !x.hidden);
    if (c && !out.includes(c)) out.push(c);
    if (out.length >= n) break;
  }
  return out;
}

// ---------- Pendientes ----------


export function todoCategories(s) {
  return [
    { ...TODO_GENERAL, builtin: true },
    { ...TODO_HOGAR, builtin: true },
    ...AREA_KEYS.map((k) => ({ id: k, name: AREA[k].area, area: k, builtin: true })),
    ...s.todoLists.map((l) => ({ id: l.id, name: l.name, area: l.area || null, builtin: false })),
  ];
}

export function todoCategory(s, cat) {
  if (cat === TODO_HOGAR.id) return { ...TODO_HOGAR, builtin: true };
  if (AREA[cat]) return { id: cat, name: AREA[cat].area, area: cat, builtin: true };
  const l = s.todoLists.find((x) => x.id === cat);
  if (l) return { id: l.id, name: l.name, area: l.area || null, builtin: false };
  return { ...TODO_GENERAL, builtin: true };
}

const validCat = (s, cat) => (AREA[cat] || cat === TODO_HOGAR.id || s.todoLists.some((l) => l.id === cat) ? cat : 'general');

// Pendientes que se repiten: al completarlos aparece el siguiente con su nueva fecha.
export const TODO_REPEATS = [
  { key: 'semana', label: 'Cada semana', short: 'Semanal' },
  { key: 'mes', label: 'Cada mes', short: 'Mensual' },
  { key: 'ano', label: 'Cada año', short: 'Anual' },
];
const validRepeat = (r) => (TODO_REPEATS.some((x) => x.key === r) ? r : null);
export const repeatLabel = (r) => (TODO_REPEATS.find((x) => x.key === r) || { label: '' }).label;

const pad2 = (n) => String(n).padStart(2, '0');
// Siguiente fecha: misma semana +7, mismo día del mes (o el último si no existe) o mismo día del año.
export function nextRepeat(due, repeat, anchor = null) {
  if (!validDay(due)) return null;
  if (repeat === 'semana') return addDays(due, 7);
  const [y, m, d] = due.split('-').map(Number);
  const day = anchor || d;
  if (repeat === 'mes') {
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    return `${ny}-${pad2(nm)}-${pad2(Math.min(day, new Date(ny, nm, 0).getDate()))}`;
  }
  if (repeat === 'ano') return `${y + 1}-${pad2(m)}-${pad2(Math.min(day, new Date(y + 1, m, 0).getDate()))}`;
  return null;
}

export function addTodo(s, p, today) {
  const title = String(p.title || '').trim().slice(0, 120);
  if (!title) return null;
  const repeat = validRepeat(p.repeat);
  // Si se repite y no tiene fecha, empieza hoy.
  const due = validDay(p.due) || (repeat ? today : null);
  const t = {
    id: uid(),
    title,
    cat: validCat(s, p.cat),
    due,
    important: !!p.important,
    note: String(p.note || '').slice(0, 1000),
    created: today,
    done: null,
    reward: null,
    src: p.src || null,
    repeat,
    anchor: repeat ? (Number(p.anchor) || (due ? Number(due.slice(8)) : null)) : null,
  };
  s.todos.unshift(t);
  return t;
}

export function updateTodo(s, id, patch, today = null) {
  const t = s.todos.find((x) => x.id === id);
  if (!t) return;
  if (patch.title != null && String(patch.title).trim()) t.title = String(patch.title).trim().slice(0, 120);
  if (patch.cat != null) t.cat = validCat(s, patch.cat);
  const before = { due: t.due, repeat: t.repeat };
  if (patch.due !== undefined) t.due = validDay(patch.due);
  if (patch.important != null) t.important = !!patch.important;
  if (patch.note != null) t.note = String(patch.note).slice(0, 1000);
  if (patch.repeat !== undefined) t.repeat = validRepeat(patch.repeat);
  if (t.repeat && !t.due && !t.done) t.due = today || dayKey();
  // El día ancla (p. ej. el 31) solo cambia si cambias la fecha o la repetición: editar la nota no lo pierde.
  if (!t.repeat) t.anchor = null;
  else if (t.due !== before.due || t.repeat !== before.repeat || !t.anchor) t.anchor = t.due ? Number(t.due.slice(8)) : null;
  // Cambiar la fecha a mano mueve la serie completa (posponer, en cambio, mueve solo esta vez).
  if (t.due !== before.due || t.repeat !== before.repeat) t.sched = null;
  if (t.chore) {
    const c = s.chores.find((x) => x.id === t.chore);
    if (c) {
      c.title = t.title;
      if (t.due && t.due !== before.due) c.nextOverride = t.due;
    }
  }
}

export function removeTodo(s, id) {
  s.todos = s.todos.filter((x) => x.id !== id);
}

export const todoReward = (t) => ({
  xp: TODO_XP.base + (t.important ? TODO_XP.important : 0) + (Number(t.xpBonus) || 0),
  gold: TODO_GOLD.base + (t.important ? TODO_GOLD.important : 0),
});

export function completeTodo(s, id, today, ev) {
  const t = s.todos.find((x) => x.id === id);
  if (!t || t.done) return null;
  // Las tareas del hogar suben el atributo que elegiste para esa rutina (o solo tu nivel).
  const area = t.chore && t.attr !== undefined ? (AREA[t.attr] ? t.attr : null) : todoCategory(s, t.cat).area;
  const d = getDay(s, today);
  d.todos = (d.todos || 0) + 1;
  let got = { xp: 0, gold: 0, area };
  // Tope: 20 pendientes con recompensa al día (deshacer uno libera su cupo).
  if ((d.todosPaid || 0) < 20) {
    const { xp, gold } = todoReward(t);
    const amt = area ? gainXP(s, area, xp, today, ev) : gainPlayerXP(s, xp, today, ev);
    addGold(s, gold, today);
    d.todosPaid = (d.todosPaid || 0) + 1;
    got = { xp: amt, gold, area };
  }
  t.done = today;
  t.reward = got;
  s.stats.todos = (s.stats.todos || 0) + 1;
  if (t.src) markAlertHandled(s, t.src, true);
  // Tarea del hogar: queda anotada y aparece la próxima vez según su frecuencia.
  if (t.chore) {
    const n = choreCompleted(s, t, today);
    if (n) { t.spawned = n.id; got.next = n.due; }
  }
  // Si se repite, deja listo el siguiente (aunque estuviera atrasado, la próxima fecha queda en el futuro).
  if (t.repeat) {
    const prev = t.spawned && s.todos.find((x) => x.id === t.spawned);
    if (prev) got.next = prev.due;
    else {
      let next = nextRepeat(t.sched || t.due || today, t.repeat, t.anchor);
      for (let i = 0; next && next <= today && i < 400; i++) next = nextRepeat(next, t.repeat, t.anchor);
      const n = next && addTodo(s, { title: t.title, cat: t.cat, due: next, important: t.important, note: t.note, repeat: t.repeat, anchor: t.anchor }, today);
      if (n) { t.spawned = n.id; got.next = next; }
    }
  }
  touchStreak(s, today, ev);
  checkAchievements(s, today, ev);
  return got;
}

export function uncompleteTodo(s, id) {
  const t = s.todos.find((x) => x.id === id);
  if (!t || !t.done) return;
  const r = t.reward || { xp: 0, gold: 0, area: null };
  s.xp = Math.max(0, s.xp - r.xp);
  if (r.area) s.attrs[r.area] = Math.max(0, (s.attrs[r.area] || 0) - r.xp);
  s.gold = Math.max(0, s.gold - r.gold);
  const d = s.days[t.done];
  if (d) {
    d.xp = Math.max(0, d.xp - r.xp);
    if (r.area && d.xpBy) d.xpBy[r.area] = Math.max(0, (d.xpBy[r.area] || 0) - r.xp);
    d.gold -= r.gold;
    d.todos = Math.max(0, (d.todos || 1) - 1);
    if (r.xp > 0 || r.gold > 0) d.todosPaid = Math.max(0, (d.todosPaid || 1) - 1);
  }
  s.stats.todos = Math.max(0, (s.stats.todos || 0) - 1);
  // Deshacer también quita el siguiente que se había creado, si sigue sin hacer.
  // Si el siguiente ya se completó, se queda y el enlace también (así no se duplica al volver a marcar).
  if (t.spawned) {
    const n = s.todos.find((x) => x.id === t.spawned);
    if (n && !n.done) { s.todos = s.todos.filter((x) => x.id !== n.id); t.spawned = null; }
    else if (!n) t.spawned = null;
  }
  if (t.src) markAlertHandled(s, t.src, false);
  if (t.chore) choreUndone(s, t);
  t.done = null;
  t.reward = null;
}

export function clearDoneTodos(s) {
  s.todos = s.todos.filter((t) => !t.done);
}

export const TODO_BUCKETS = [
  { key: 'vencidos', label: 'Vencidos' },
  { key: 'hoy', label: 'Hoy' },
  { key: 'manana', label: 'Mañana' },
  { key: 'semana', label: 'Próximos 7 días' },
  { key: 'despues', label: 'Más adelante' },
  { key: 'sinfecha', label: 'Sin fecha' },
];

export function todoBucket(t, today) {
  if (!t.due) return 'sinfecha';
  const n = diffDays(today, t.due);
  if (n < 0) return 'vencidos';
  if (n === 0) return 'hoy';
  if (n === 1) return 'manana';
  if (n <= 7) return 'semana';
  return 'despues';
}

export function sortTodos(list) {
  return [...list].sort((a, b) => (Number(b.important) - Number(a.important))
    || ((a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : 0)
    || (a.created < b.created ? 1 : a.created > b.created ? -1 : 0));
}

export const pendingTodos = (s) => s.todos.filter((t) => !t.done);
export const todosDue = (s, today) => sortTodos(pendingTodos(s).filter((t) => t.due && t.due <= today));
export const todosIn = (s, cat) => pendingTodos(s).filter((t) => t.cat === cat);
// Lo de un área: su categoría y tus categorías propias que suben su atributo (p. ej. «Maestría» en Crecimiento).
export const todosForArea = (s, area) => pendingTodos(s).filter((t) => t.cat === area || s.todoLists.some((l) => l.id === t.cat && l.area === area));

// Posponer cambia solo esta vez: si se repite, la serie sigue en su fecha de siempre
// (la fecha original queda en `sched` y de ahí sale la siguiente).
function moveDue(t, d, s = null) {
  if (t.repeat && t.due && !t.sched) t.sched = t.due;
  t.due = d;
  // Posponer una tarea del hogar mueve su próxima vez (la frecuencia sigue igual).
  if (t.chore && s) { const c = s.chores.find((x) => x.id === t.chore); if (c) c.nextOverride = d; }
}

export function postponeTodo(s, id, due) {
  const t = s.todos.find((x) => x.id === id);
  const d = validDay(due);
  if (!t || t.done || !d) return null;
  moveDue(t, d, s);
  return t;
}

// «Pasar a hoy»: los vencidos (todos, o solo los que ves con tu filtro) vuelven a la lista de hoy.
export function overdueToToday(s, today, ids = null) {
  let n = 0;
  for (const t of s.todos) {
    if (t.done || !t.due || t.due >= today || (ids && !ids.includes(t.id))) continue;
    moveDue(t, today, s);
    n += 1;
  }
  return n;
}

export function addTodoList(s, p) {
  const name = String(p.name || '').trim().slice(0, 30);
  if (name.length < 2) return null;
  const l = { id: `l${uid()}`, name, area: AREA[p.area] ? p.area : null };
  s.todoLists.push(l);
  return l;
}

export function updateTodoList(s, id, p) {
  const l = s.todoLists.find((x) => x.id === id);
  if (!l) return;
  if (p.name != null && String(p.name).trim().length > 1) l.name = String(p.name).trim().slice(0, 30);
  if (p.area !== undefined) l.area = AREA[p.area] ? p.area : null;
}

export function removeTodoList(s, id) {
  s.todoLists = s.todoLists.filter((x) => x.id !== id);
  for (const t of s.todos) if (t.cat === id) t.cat = 'general';
}

// ---------- Hogar: tareas personales que se repiten ----------
// Cada rutina (lavar la ropa, planchar…) tiene una frecuencia. Su «próxima vez» vive como un pendiente
// de la categoría Hogar: así aparece en Hoy y en Pendientes. Al completarlo se anota y se crea el siguiente,
// contando desde el día en que la hiciste («cada 3 días») o en el próximo día fijo («los sábados»).

const UNITS = ['day', 'week', 'month'];
export function normFreq(f) {
  if (f && f.type === 'weekdays') {
    const days = [...new Set((f.days || []).map(Number).filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
    return days.length ? { type: 'weekdays', days } : { type: 'every', n: 1, unit: 'week' };
  }
  return { type: 'every', n: clamp(Math.round(Number(f && f.n) || 1), 1, 365), unit: UNITS.includes(f && f.unit) ? f.unit : 'day' };
}

const PLURAL_DAYS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
const listY = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);
export function freqLabel(f) {
  const q = normFreq(f);
  if (q.type === 'weekdays') {
    if (q.days.length === 7) return 'Cada día';
    if (q.days.join() === '1,2,3,4,5') return 'De lunes a viernes';
    if (q.days.join() === '0,6') return 'Los fines de semana';
    const order = [...q.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    return `Los ${listY(order.map((d) => PLURAL_DAYS[d]))}`;
  }
  if (q.unit === 'day') return q.n === 1 ? 'Cada día' : `Cada ${q.n} días`;
  if (q.unit === 'week') return q.n === 1 ? 'Cada semana' : `Cada ${q.n} semanas`;
  return q.n === 1 ? 'Cada mes' : `Cada ${q.n} meses`;
}
// Días aproximados entre una vez y la siguiente (para ordenar y calcular la carga de la semana).
export function freqDays(f) {
  const q = normFreq(f);
  if (q.type === 'weekdays') return 7 / q.days.length;
  return q.n * (q.unit === 'day' ? 1 : q.unit === 'week' ? 7 : 30);
}

function addPeriod(day, n, unit) {
  if (unit === 'day') return addDays(day, n);
  if (unit === 'week') return addDays(day, 7 * n);
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(y, m - 1 + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(Math.min(d, last))}`;
}
function nextWeekday(from, days) {
  let d = from;
  for (let i = 0; i < 8; i++) { if (days.includes(weekday(d))) return d; d = addDays(d, 1); }
  return from;
}

// Repara datos viejos o dañados (sin borrar lo que sirve).
export function ensureHome(s) {
  s.chores = (Array.isArray(s.chores) ? s.chores : []).filter((c) => c && typeof c === 'object' && c.id && c.title).map((c) => ({
    ...c, freq: normFreq(c.freq), mins: clamp(Math.round(Number(c.mins) || 15), 1, 600), log: (Array.isArray(c.log) ? c.log : []).filter(validDay).slice(0, 120),
    base: validDay(c.base), nextOverride: validDay(c.nextOverride), start: validDay(c.start) || validDay(c.created) || null, paused: !!c.paused,
  }));
  s.wins = (Array.isArray(s.wins) ? s.wins : []).filter((w) => w && typeof w === 'object' && w.id && w.title && validDay(w.day))
    .map((w) => ({ ...w, skills: Array.isArray(w.skills) ? w.skills : [], scope: WIN_SCOPE[w.scope] ? w.scope : 'profesional' }));
  if (typeof s.profile.wakeGoal !== 'string') s.profile.wakeGoal = '';
  if (!s.wordLog || typeof s.wordLog !== 'object' || Array.isArray(s.wordLog)) s.wordLog = {};
  if (!s.photos || typeof s.photos !== 'object' || Array.isArray(s.photos)) s.photos = {};
}

// Fotos que usa algún registro (las demás se pueden limpiar).
export function referencedPhotos(s) {
  const out = new Set();
  const add = (list) => { for (const id of list || []) out.add(id); };
  for (const t of (s.money && s.money.tx) || []) add(t.photos);
  for (const w of s.wins || []) add(w.photos);
  for (const sec of (s.record && s.record.sections) || []) for (const it of sec.items || []) add(it.photos);
  return out;
}

// ---------- Palabra del día ----------

// «La usé hoy»: +5 XP de Sabiduría, una vez al día.
export const WORD_XP = 5;
export function useWord(s, today, ev) {
  if (!s.wordLog) s.wordLog = {};
  if (s.wordLog[today]) return false;
  s.wordLog[today] = wordOf(today).word;
  const keys = Object.keys(s.wordLog).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete s.wordLog[k];
  gainXP(s, 'crecimiento', WORD_XP, today, ev);
  checkAchievements(s, today, ev);
  return true;
}

// Guardarla como tarjeta de repaso (sin repetir).
export function wordToCard(s, day, today) {
  const w = wordOf(day);
  const front = `«${w.word}»: ¿qué significa?`;
  if (s.cards.some((c) => c.front === front)) return null;
  return addCard(s, front, `${w.meaning}\nEjemplo: ${w.example}`, today);
}

export const choreXP = (mins) => CHORE_XP.base + Math.min(CHORE_XP.max, Math.round((Number(mins) || 0) / 10) * CHORE_XP.per10);

// Próxima vez que toca. `base`: el último día cubierto (el día que la hiciste, o su fecha si la adelantaste).
export function choreNext(c, today) {
  const q = normFreq(c.freq);
  if (c.nextOverride && (!c.base || c.nextOverride > c.base)) return c.nextOverride;
  if (q.type === 'weekdays') return nextWeekday(c.base ? addDays(c.base, 1) : c.start || today, q.days);
  if (!c.base) return c.start || today;
  return addPeriod(c.base, q.n, q.unit);
}

const openChoreTodos = (s, id) => s.todos.filter((t) => t.chore === id && !t.done);

function choreTodo(s, c, due, today) {
  const t = addTodo(s, { title: c.title, cat: TODO_HOGAR.id, due, note: c.note || '' }, today);
  if (!t) return null;
  t.chore = c.id;
  t.attr = c.attr === undefined ? TODO_HOGAR.area : c.attr;
  t.xpBonus = choreXP(c.mins) - CHORE_XP.base;
  return t;
}

// Deja cada rutina con un solo pendiente abierto, con su título y atributo al día.
// La fecha del pendiente abierto solo se recalcula si cambió la frecuencia o la próxima fecha (`redate`):
// si se atrasa, sigue atrasado hasta que lo hagas.
export function syncChores(s, today, redate = null) {
  if (!Array.isArray(s.chores)) s.chores = [];
  const ids = new Set(s.chores.map((c) => c.id));
  s.todos = s.todos.filter((t) => !t.chore || t.done || ids.has(t.chore));
  for (const c of s.chores) {
    const open = openChoreTodos(s, c.id).sort((a, b) => ((a.due || '') < (b.due || '') ? -1 : 1));
    if (c.paused) { s.todos = s.todos.filter((t) => !(t.chore === c.id && !t.done)); continue; }
    if (!open.length) { choreTodo(s, c, choreNext(c, today), today); continue; }
    const [t, ...extra] = open;
    if (extra.length) s.todos = s.todos.filter((x) => !extra.includes(x));
    t.title = c.title;
    t.cat = TODO_HOGAR.id;
    if (redate === true || redate === c.id) t.due = choreNext(c, today);
    t.note = c.note || t.note || '';
    t.attr = c.attr === undefined ? TODO_HOGAR.area : c.attr;
    t.xpBonus = choreXP(c.mins) - CHORE_XP.base;
  }
}

export function addChore(s, p, today) {
  const title = String(p.title || '').trim().slice(0, 80);
  if (!title) return null;
  const c = {
    id: `h${uid()}`, title, icon: p.icon || 'home', group: p.group || 'casa', freq: normFreq(p.freq || { type: 'every', n: 7, unit: 'day' }),
    mins: clamp(Math.round(Number(p.mins) || 15), 1, 600), attr: p.attr === undefined ? TODO_HOGAR.area : (AREA[p.attr] ? p.attr : null),
    note: String(p.note || '').slice(0, 300), start: validDay(p.start) || today, base: validDay(p.last) || null, nextOverride: null,
    paused: false, log: validDay(p.last) ? [p.last] : [], created: today,
  };
  s.chores.push(c);
  syncChores(s, today);
  return c;
}

export function updateChore(s, id, p, today) {
  const c = s.chores.find((x) => x.id === id);
  if (!c) return null;
  if (p.title != null && String(p.title).trim()) c.title = String(p.title).trim().slice(0, 80);
  if (p.icon) c.icon = p.icon;
  if (p.group) c.group = p.group;
  if (p.freq) {
    c.freq = normFreq(p.freq);
    c.nextOverride = null;
    // Si nunca la has hecho y eliges días fijos, cuenta desde hoy (no desde la fecha en que se repartió).
    if (c.freq.type === 'weekdays' && !c.base) c.start = today;
  }
  if (p.mins != null) c.mins = clamp(Math.round(Number(p.mins) || 15), 1, 600);
  if (p.attr !== undefined) c.attr = AREA[p.attr] ? p.attr : null;
  if (p.note != null) c.note = String(p.note).slice(0, 300);
  if (p.next !== undefined) c.nextOverride = validDay(p.next);
  const resumed = p.paused === false && c.paused;
  if (p.paused != null) c.paused = !!p.paused;
  // Al reanudar una rutina pausada, no arranca con atraso: toca hoy como muy tarde.
  if (resumed && !c.nextOverride && choreNext(c, today) < today) c.nextOverride = today;
  syncChores(s, today, p.freq || p.next !== undefined || resumed ? c.id : null);
  return c;
}

export function removeChore(s, id) {
  s.chores = s.chores.filter((c) => c.id !== id);
  s.todos = s.todos.filter((t) => !(t.chore === id && !t.done));
}

// Saltar esta vez: la próxima pasa a la siguiente fecha que tocaría.
export function skipChore(s, id, today) {
  const c = s.chores.find((x) => x.id === id);
  if (!c) return null;
  const q = normFreq(c.freq);
  const cur = choreNext(c, today);
  const from = cur > today ? cur : today;
  c.nextOverride = q.type === 'weekdays' ? nextWeekday(addDays(from, 1), q.days) : addPeriod(from, q.n, q.unit);
  syncChores(s, today, c.id);
  return c.nextOverride;
}

// Al completar su pendiente: se anota el día y se crea la próxima vez.
function choreCompleted(s, t, today) {
  const c = s.chores.find((x) => x.id === t.chore);
  if (!c) return null;
  t.prevBase = c.base || null;
  t.prevOverride = c.nextOverride || null;
  c.log = [today, ...(c.log || [])].slice(0, 120);
  // «Cada 3 días» cuenta desde el día en que la hiciste; «los sábados» da por cubierto el sábado que adelantaste.
  c.base = normFreq(c.freq).type === 'weekdays' && t.due && t.due > today ? t.due : today;
  c.nextOverride = null;
  if (c.paused) return null;
  return choreTodo(s, c, choreNext(c, today), today);
}

function choreUndone(s, t) {
  const c = s.chores.find((x) => x.id === t.chore);
  if (!c) return;
  const i = (c.log || []).indexOf(t.done);
  if (i >= 0) c.log.splice(i, 1);
  // Si la vez siguiente ya se hizo, su fecha manda y no se toca.
  if (t.spawned && s.todos.some((x) => x.id === t.spawned && x.done)) return;
  c.base = t.prevBase || null;
  c.nextOverride = t.prevOverride || null;
}

// Estado de una rutina hoy.
export function choreStatus(s, c, today) {
  const t = openChoreTodos(s, c.id)[0] || null;
  const due = t ? t.due : choreNext(c, today);
  const n = due ? diffDays(today, due) : 0;
  const state = c.paused ? 'paused' : n < 0 ? 'late' : n === 0 ? 'today' : n <= 2 ? 'soon' : 'ok';
  return { todo: t, due, inDays: n, state, last: (c.log || [])[0] || null };
}

// Plan de los próximos 7 días (si las haces a tiempo).
export function choreWeek(s, today) {
  const end = addDays(today, 6);
  const days = Array.from({ length: 7 }, (_, i) => ({ day: addDays(today, i), items: [], mins: 0 }));
  for (const c of s.chores) {
    if (c.paused) continue;
    const q = normFreq(c.freq);
    let d = choreStatus(s, c, today).due;
    if (d && d < today) d = today;
    for (let i = 0; d && d <= end && i < 10; i++) {
      const slot = days[diffDays(today, d)];
      if (slot) { slot.items.push(c); slot.mins += c.mins || 0; }
      d = q.type === 'weekdays' ? nextWeekday(addDays(d, 1), q.days) : addPeriod(d, q.n, q.unit);
    }
  }
  return days;
}

export function houseSummary(s, today) {
  const st = s.chores.filter((c) => !c.paused).map((c) => ({ c, ...choreStatus(s, c, today) }));
  const due = st.filter((x) => x.state === 'late' || x.state === 'today');
  const weekAgo = addDays(today, -6);
  const doneWeek = s.chores.reduce((a, c) => a + (c.log || []).filter((d) => d >= weekAgo && d <= today).length, 0);
  const doneToday = s.chores.reduce((a, c) => a + (c.log || []).filter((d) => d === today).length, 0);
  return {
    total: st.length, due: due.length, late: st.filter((x) => x.state === 'late').length,
    mins: due.reduce((a, x) => a + (x.c.mins || 0), 0), doneWeek, doneToday,
    // La que más se atrasa (para darle prioridad).
    worst: st.filter((x) => x.state === 'late').sort((a, b) => a.inDays - b.inDays)[0] || null,
  };
}

// ---------- Sueño: horario, calidad y rutina ----------

export const timeToMin = (t) => (/^\d{1,2}:\d{2}$/.test(t || '') ? Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]) : null);
export const minToTime = (m) => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return `${pad2(Math.floor(x / 60))}:${pad2(x % 60)}`; };
// «22:15» → «10:15 p. m.»
export function fmtClock(t) {
  const m = timeToMin(t);
  if (m == null) return '';
  const h = Math.floor(m / 60);
  const mm = pad2(m % 60);
  return `${h % 12 || 12}:${mm} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}
// Horas dormidas entre la hora de acostarte y la de levantarte (redondeado al cuarto de hora).
export function sleepFromTimes(bed, wake) {
  const b = timeToMin(bed);
  const w = timeToMin(wake);
  if (b == null || w == null) return null;
  let m = w - b;
  if (m <= 0) m += 1440;
  return Math.round(m / 15) / 4;
}

// Lo que dice tu sueño de los últimos 7 días: promedio, deuda, regularidad, calidad y hora sugerida.
export function sleepInsights(s, today) {
  const goal = s.profile.sleepGoal || 7;
  const nights = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, -i);
    const h = s.health[d];
    if (h && h.sleep != null) nights.push({ day: d, ...h });
  }
  const n = nights.length;
  const avg = n ? nights.reduce((a, x) => a + x.sleep, 0) / n : null;
  const debt = nights.reduce((a, x) => a + Math.max(0, goal - x.sleep), 0);
  const met = nights.filter((x) => x.sleep >= goal).length;
  // Las horas de acostarse se miden desde el mediodía, para que 11:30 p. m. y 12:30 a. m. queden cerca.
  const beds = nights.map((x) => timeToMin(x.bed)).filter((m) => m != null).map((m) => (m - 720 + 1440) % 1440);
  const wakes = nights.map((x) => timeToMin(x.wake)).filter((m) => m != null);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const spread = beds.length >= 3 ? Math.max(...beds) - Math.min(...beds) : null;
  const avgBed = beds.length ? minToTime(mean(beds) + 720) : null;
  const avgWake = wakes.length ? minToTime(mean(wakes)) : null;
  const q = nights.map((x) => x.quality).filter((v) => v >= 1 && v <= 4);
  const wakeAt = s.profile.wakeGoal || (wakes.length >= 3 ? avgWake : null);
  const bedAt = wakeAt ? minToTime(timeToMin(wakeAt) - goal * 60 - SLEEP_LATENCY_MIN) : null;
  const routine = [];
  for (let i = 1; i <= 7; i++) { const inn = s.inn[addDays(today, -i)]; if (inn && Array.isArray(inn.routine)) routine.push(inn.routine.length); }
  let tip = null;
  if (n >= 2 && debt >= 3) tip = { icon: 'moon', text: `Te faltaron ${fmtHours(debt)} de sueño esta semana. Acostarte 30 minutos antes unos días la paga sin dormir de más el fin de semana.` };
  else if (spread != null && spread > 90) tip = { icon: 'clock', text: `Tu hora de acostarte varía ${fmtHours(spread / 60)} entre noches. Una hora fija (más o menos media hora) hace que te duermas antes y despiertes con más energía.` };
  else if (q.length >= 3 && mean(q) < 2.5) tip = { icon: 'eyeoff', text: 'Duermes las horas, pero descansas poco. Prueba la rutina para dormir de la posada: sin pantallas y cena ligera.' };
  else if (n >= 5 && met >= 5) tip = { icon: 'star', text: 'Buen descanso: cumpliste tu meta casi todas las noches. Así se sostiene la energía.' };
  return { goal, n, avg, debt, met, spread, avgBed, avgWake, quality: q.length ? mean(q) : null, wakeAt, bedAt, routineNights: routine.filter((x) => x > 0).length, tip };
}

// Hora sugerida para acostarte según a qué hora te levantas y tu meta de sueño.
export function bedtimeFor(s, wake) {
  const w = timeToMin(wake);
  if (w == null) return null;
  return minToTime(w - (s.profile.sleepGoal || 7) * 60 - SLEEP_LATENCY_MIN);
}

export function setWakeGoal(s, v) {
  s.profile.wakeGoal = timeToMin(v) != null ? minToTime(timeToMin(v)) : '';
}

// Ejercicio de la semana (últimos 7 días) contra la recomendación de la OMS.
export function exerciseWeek(s, today) {
  let total = 0;
  const byType = {};
  let days = 0;
  for (let i = 0; i < 7; i++) {
    const h = s.health[addDays(today, -i)];
    if (!h || !h.exercise) continue;
    total += h.exercise;
    days += 1;
    let typed = 0;
    for (const [k, v] of Object.entries(h.exTypes || {})) { byType[k] = (byType[k] || 0) + v; typed += v; }
    if (h.exercise > typed) byType.otro = (byType.otro || 0) + (h.exercise - typed);
  }
  return { total, days, goal: EXERCISE_WEEK_GOAL, byType: Object.entries(byType).sort((a, b) => b[1] - a[1]) };
}

// Reparte las rutinas nuevas en la semana para que no toquen todas el mismo día.
export function spreadChoreStarts(list, today, s = null) {
  const load = Array(7).fill(0);
  if (s) for (const [i, d] of choreWeek(s, today).entries()) load[i] = d.mins;
  const out = new Array(list.length).fill(today);
  const order = list.map((x, i) => ({ x, i })).sort((a, b) => freqDays(a.x.freq) - freqDays(b.x.freq) || (b.x.mins || 0) - (a.x.mins || 0));
  for (const { x, i } of order) {
    const q = normFreq(x.freq);
    const step = Math.max(1, Math.round(freqDays(q)));
    if (q.type === 'weekdays') {
      out[i] = today;
      for (let d = 0; d < 7; d++) if (q.days.includes(weekday(addDays(today, d)))) load[d] += x.mins || 0;
      continue;
    }
    const span = Math.min(7, step);
    let best = 0;
    for (let d = 1; d < span; d++) if (load[d] < load[best]) best = d;
    out[i] = addDays(today, best);
    for (let d = best; d < 7; d += step) load[d] += x.mins || 0;
  }
  return out;
}

export function addChores(s, list, today) {
  const starts = spreadChoreStarts(list, today, s);
  return list.map((x, i) => addChore(s, { ...x, start: starts[i] }, today)).filter(Boolean);
}

// ---------- Logros (profesionales, académicos y personales) ----------

const WIN_SCOPE = Object.fromEntries(WIN_SCOPES.map((x) => [x.key, x]));
export function addWin(s, p, today, ev) {
  const title = String(p.title || '').trim().slice(0, 140);
  if (!title) return null;
  const scope = WIN_SCOPE[p.scope] ? p.scope : 'profesional';
  const w = {
    id: `w${uid()}`, day: validDay(p.day) || today, title, scope, type: WIN_TYPES.some((x) => x.key === p.type) ? p.type : 'otro',
    impact: String(p.impact || '').slice(0, 600), skills: [...new Set((p.skills || []).map((x) => String(x).trim().slice(0, 40)).filter(Boolean))].slice(0, 6),
    evidence: String(p.evidence || '').slice(0, 300), photos: cleanPhotos(p.photos), created: Date.now(), reward: null,
  };
  s.wins.unshift(w);
  s.wins.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : (b.created || 0) - (a.created || 0)));
  const d = getDay(s, today);
  d.wins = (d.wins || 0) + 1;
  if (d.wins <= WIN_XP.daily) {
    const area = WIN_SCOPE[scope].area;
    const xp = area ? gainXP(s, area, WIN_XP.xp, today, ev) : gainPlayerXP(s, WIN_XP.xp, today, ev);
    addGold(s, WIN_XP.gold, today);
    w.reward = { xp, gold: WIN_XP.gold, area };
  }
  checkAchievements(s, today, ev);
  return w;
}

export function updateWin(s, id, p) {
  const w = s.wins.find((x) => x.id === id);
  if (!w) return null;
  if (p.title != null && String(p.title).trim()) w.title = String(p.title).trim().slice(0, 140);
  if (p.day && validDay(p.day)) w.day = p.day;
  if (p.scope && WIN_SCOPE[p.scope]) w.scope = p.scope;
  if (p.type && WIN_TYPES.some((x) => x.key === p.type)) w.type = p.type;
  if (p.impact != null) w.impact = String(p.impact).slice(0, 600);
  if (p.skills) w.skills = [...new Set(p.skills.map((x) => String(x).trim().slice(0, 40)).filter(Boolean))].slice(0, 6);
  if (p.evidence != null) w.evidence = String(p.evidence).slice(0, 300);
  if (p.photos != null) w.photos = cleanPhotos(p.photos);
  s.wins.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : (b.created || 0) - (a.created || 0)));
  return w;
}

export function removeWin(s, id) {
  s.wins = s.wins.filter((w) => w.id !== id);
}

// Períodos para revisar logros (y llevarlos a tu evaluación).
export function periodRange(key, today) {
  const [y, m] = today.split('-').map(Number);
  if (key === 'trimestre') { const q0 = Math.floor((m - 1) / 3) * 3 + 1; return { from: `${y}-${pad2(q0)}-01`, to: today, label: `Trimestre ${Math.floor((m - 1) / 3) + 1} de ${y}` }; }
  if (key === 'semestre') { const h0 = m <= 6 ? 1 : 7; return { from: `${y}-${pad2(h0)}-01`, to: today, label: `${m <= 6 ? 'Primer' : 'Segundo'} semestre de ${y}` }; }
  if (key === 'ano') return { from: `${y}-01-01`, to: today, label: `Año ${y}` };
  if (key === '12m') return { from: addDays(today, -364), to: today, label: 'Últimos 12 meses' };
  return { from: '0000-01-01', to: '9999-12-31', label: 'Todo' };
}

const longDay = (d) => { const [y, m, dd] = d.split('-').map(Number); return `${dd} de ${MONTHS[m - 1]} de ${y}`; };

// Resumen en texto para pegar en tu evaluación de desempeño, tu CV o un correo.
export function winsText(list, label = '') {
  const lines = [`Logros${label ? ` · ${label}` : ''} (${list.length})`];
  for (const sc of WIN_SCOPES) {
    const xs = list.filter((w) => w.scope === sc.key);
    if (!xs.length) continue;
    lines.push('', sc.label.toUpperCase());
    for (const w of xs) {
      const type = (WIN_TYPES.find((t) => t.key === w.type) || {}).label;
      lines.push(`• ${longDay(w.day)}: ${w.title}${type && w.type !== 'otro' ? ` (${type.toLowerCase()})` : ''}`);
      if (w.impact) lines.push(`  Impacto: ${w.impact}`);
      if (w.skills && w.skills.length) lines.push(`  Habilidades: ${w.skills.join(', ')}`);
      if (w.evidence) lines.push(`  Evidencia: ${w.evidence}`);
    }
  }
  return lines.join('\n');
}

const csvCell = (v) => { const t = String(v == null ? '' : v); return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
export function winsCSV(list) {
  const head = ['Fecha', 'Ámbito', 'Tipo', 'Logro', 'Impacto', 'Habilidades', 'Evidencia'];
  const rows = list.map((w) => [w.day, (WIN_SCOPE[w.scope] || {}).label || '', (WIN_TYPES.find((t) => t.key === w.type) || {}).label || '', w.title, w.impact, (w.skills || []).join(', '), w.evidence]);
  return `\uFEFF${[head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')}`;
}

// Recordatorio semanal (viernes a domingo) si no anotaste ningún logro en la semana.
const weekStart = (d) => addDays(d, -((weekday(d) + 6) % 7));
export function winPromptDue(s, today) {
  const wd = weekday(today);
  if (wd !== 5 && wd !== 6 && wd !== 0) return false;
  if (s.profile.winAskWeek === weekStart(today)) return false;
  return !s.wins.some((w) => w.day >= weekStart(today) || (w.created && dayKey(new Date(w.created)) >= weekStart(today)));
}
export function dismissWinPrompt(s, today) {
  s.profile.winAskWeek = weekStart(today);
}

export function winStats(list) {
  const byType = {};
  const skills = {};
  for (const w of list) {
    byType[w.type] = (byType[w.type] || 0) + 1;
    for (const k of w.skills || []) skills[k] = (skills[k] || 0) + 1;
  }
  return { n: list.length, byType, skills: Object.entries(skills).sort((a, b) => b[1] - a[1]) };
}

// ---------- Expediente personal ----------

const str = (v, n) => String(v ?? '').trim().slice(0, n);

function sectionFromTemplate(t) {
  const sec = { id: t.id, kind: t.kind, title: t.title, icon: t.icon, area: t.area || null, builtin: true };
  if (t.kind === 'fields') sec.fields = t.fields.map(([label, type = 'text', secret = false]) => ({ id: uid(), label, type, secret: !!secret, value: '' }));
  else { sec.schema = t.schema; sec.items = []; }
  return sec;
}

export function buildRecord() {
  return { sections: RECORD_SECTIONS.map(sectionFromTemplate) };
}

// Completa un expediente guardado con las secciones fijas que falten (al actualizar la app).
export function ensureRecord(s) {
  if (!s.record || typeof s.record !== 'object' || !Array.isArray(s.record.sections)) s.record = buildRecord();
  const ok = (x) => x && typeof x === 'object' && x.id;
  // Entradas dañadas (por ejemplo, de una copia editada a mano) se descartan en vez de romper la app.
  s.record.sections = s.record.sections.filter((x) => ok(x) && (x.kind === 'fields' || x.kind === 'list'));
  // Una sección fija nueva entra en su lugar: después de la sección fija anterior que ya tengas.
  RECORD_SECTIONS.forEach((t, i) => {
    if (s.record.sections.some((x) => x.id === t.id)) return;
    const prev = RECORD_SECTIONS.slice(0, i).reverse().map((p) => s.record.sections.findIndex((x) => x.id === p.id)).find((k) => k >= 0);
    s.record.sections.splice(prev == null ? 0 : prev + 1, 0, sectionFromTemplate(t));
  });
  for (const sec of s.record.sections) {
    if (sec.kind === 'fields') sec.fields = Array.isArray(sec.fields) ? sec.fields.filter(ok) : [];
    if (sec.kind === 'list') sec.items = Array.isArray(sec.items) ? sec.items.filter(ok) : [];
  }
  return s.record;
}

export const recordSection = (s, id) => (s.record && s.record.sections.find((x) => x.id === id)) || null;
export const recordSchema = (sec) => RECORD_SCHEMAS[sec && sec.schema] || RECORD_SCHEMAS.generic;

function recordXP(s, sec, base, today, ev) {
  const d = getDay(s, today);
  d.recordXp = d.recordXp || 0;
  if (d.recordXp >= RECORD_XP.dailyCap) return 0;
  const amt = Math.min(base, RECORD_XP.dailyCap - d.recordXp);
  d.recordXp += amt;
  return sec.area ? gainXP(s, sec.area, amt, today, ev, { applyMods: false }) : gainPlayerXP(s, amt, today, ev, { applyMods: false });
}

export function setRecordField(s, secId, fieldId, value, today, ev) {
  const sec = recordSection(s, secId);
  const f = sec && sec.kind === 'fields' && sec.fields.find((x) => x.id === fieldId);
  if (!f) return;
  f.value = String(value ?? '').slice(0, f.type === 'long' ? 2000 : 200);
  if (f.value.trim() && !f.xp) {
    f.xp = true;
    recordXP(s, sec, RECORD_XP.field, today, ev);
  }
  checkAchievements(s, today, ev);
}

const FIELD_TYPES = ['text', 'long', 'date', 'tel', 'email'];

export function addRecordField(s, secId, p) {
  const sec = recordSection(s, secId);
  const label = str(p.label, 40);
  if (!sec || sec.kind !== 'fields' || label.length < 2) return null;
  const f = { id: uid(), label, type: FIELD_TYPES.includes(p.type) ? p.type : 'text', secret: !!p.secret, value: '' };
  sec.fields.push(f);
  return f;
}

export function updateRecordField(s, secId, fieldId, p) {
  const sec = recordSection(s, secId);
  const f = sec && sec.kind === 'fields' && sec.fields.find((x) => x.id === fieldId);
  if (!f) return;
  if (p.label != null && str(p.label, 40).length > 1) f.label = str(p.label, 40);
  if (p.type && FIELD_TYPES.includes(p.type)) f.type = p.type;
  if (p.secret != null) f.secret = !!p.secret;
}

export function removeRecordField(s, secId, fieldId) {
  const sec = recordSection(s, secId);
  if (sec && sec.kind === 'fields') sec.fields = sec.fields.filter((x) => x.id !== fieldId);
}

function cleanItem(p) {
  return {
    title: str(p.title, 80),
    detail: str(p.detail, 120),
    phone: String(p.phone || '').replace(/[^\d+]/g, '').slice(0, 16),
    start: validDay(p.start),
    end: validDay(p.end),
    note: str(p.note, 1000),
    photos: cleanPhotos(p.photos),
  };
}

// En cuentas y tarjetas se guarda solo el final del número: «Popular 4111 1111 1111 1234» → «Popular •••• 1234».
export function keepLast4(text) {
  return String(text || '').replace(/\d[\d\s.-]{6,}\d/g, (m) => {
    const digits = m.replace(/\D/g, '');
    return digits.length >= 8 ? `•••• ${digits.slice(-4)}` : m;
  });
}

function cleanFor(sec, p) {
  const it = cleanItem(p);
  if (recordSchema(sec).last4) it.detail = keepLast4(it.detail);
  return it;
}

export function addRecordItem(s, secId, p, today, ev) {
  const sec = recordSection(s, secId);
  if (!sec || sec.kind !== 'list') return null;
  const it = cleanFor(sec, p);
  if (it.title.length < 2) return null;
  it.id = uid();
  it.created = today;
  sec.items.push(it);
  recordXP(s, sec, RECORD_XP.item, today, ev);
  checkAchievements(s, today, ev);
  return it;
}

export function updateRecordItem(s, secId, itemId, p) {
  const sec = recordSection(s, secId);
  const it = sec && sec.kind === 'list' && sec.items.find((x) => x.id === itemId);
  if (!it) return;
  const c = cleanFor(sec, { ...it, ...p });
  if (c.title.length < 2) c.title = it.title;
  Object.assign(it, c);
}

export function removeRecordItem(s, secId, itemId) {
  const sec = recordSection(s, secId);
  if (sec && sec.kind === 'list') sec.items = sec.items.filter((x) => x.id !== itemId);
}

export function addRecordSection(s, p) {
  const title = str(p.title, 40);
  if (title.length < 2) return null;
  const kind = p.kind === 'fields' ? 'fields' : 'list';
  const sec = { id: `x${uid()}`, kind, title, icon: p.icon || 'folder', area: AREA[p.area] ? p.area : null, builtin: false };
  if (kind === 'fields') sec.fields = [];
  else { sec.schema = 'generic'; sec.items = []; }
  s.record.sections.push(sec);
  return sec;
}

export function updateRecordSection(s, secId, p) {
  const sec = recordSection(s, secId);
  if (!sec) return;
  if (p.title != null && str(p.title, 40).length > 1) sec.title = str(p.title, 40);
  if (p.icon) sec.icon = p.icon;
  if (p.area !== undefined) sec.area = AREA[p.area] ? p.area : null;
}

export function removeRecordSection(s, secId) {
  s.record.sections = s.record.sections.filter((x) => x.id !== secId || x.builtin);
}

// Fechas que avisan: vencimientos de documentos, próximos chequeos y fechas clave.
export function recordAlerts(s, today, within = 45) {
  const out = [];
  if (!s.record) return out;
  for (const sec of s.record.sections) {
    if (sec.kind !== 'list' || !recordSchema(sec).alert) continue;
    for (const it of sec.items) {
      if (!it.end) continue;
      const n = diffDays(today, it.end);
      if (n <= within) out.push({ sec, item: it, inDays: n });
    }
  }
  return out.sort((a, b) => a.inDays - b.inDays);
}

export function recordProgress(s) {
  let total = 0;
  let filled = 0;
  for (const sec of (s.record ? s.record.sections : [])) {
    if (sec.kind === 'fields') {
      total += sec.fields.length;
      filled += sec.fields.filter((f) => String(f.value || '').trim()).length;
    } else {
      total += 1;
      filled += sec.items.length ? 1 : 0;
    }
  }
  return { total, filled, pct: total ? filled / total : 0 };
}

const lowerFirst = (t) => (t.length > 1 && t[1] === t[1].toLowerCase() ? t[0].toLowerCase() + t.slice(1) : t);
export const alertSrc = (secId, it) => `exp:${secId}:${it.id}:${it.end}`;
// «pending»: está en pendientes · «done»: ya lo atendiste (aunque borres los hechos) · null: falta.
// Al cambiar la fecha del documento, el aviso vuelve para la fecha nueva.
export function alertStatus(s, secId, it) {
  const src = alertSrc(secId, it);
  const t = s.todos.find((x) => x.src === src);
  if (t) return t.done ? 'done' : 'pending';
  return it.handled && it.handled === it.end ? 'done' : null;
}
export const hasAlertTodo = (s, secId, it) => alertStatus(s, secId, it) != null;

// Marca (o desmarca) el registro del expediente cuando se completa el pendiente que salió de su aviso.
function markAlertHandled(s, src, on) {
  const m = /^exp:([^:]+):([^:]+):(\d{4}-\d{2}-\d{2})$/.exec(src || '');
  if (!m) return;
  const sec = recordSection(s, m[1]);
  const it = sec && sec.kind === 'list' && sec.items.find((x) => x.id === m[2]);
  if (!it || it.end !== m[3]) return;
  if (on) it.handled = it.end;
  else if (it.handled === it.end) it.handled = null;
}

// Pasa un vencimiento a Pendientes (dos semanas antes, o hoy si ya está cerca).
export function alertToTodo(s, secId, itemId, today) {
  const sec = recordSection(s, secId);
  const it = sec && sec.kind === 'list' && sec.items.find((x) => x.id === itemId);
  if (!it || !it.end || hasAlertTodo(s, secId, it)) return null;
  const verb = sec.schema === 'checkups' ? 'Agendar' : sec.schema === 'docs' ? 'Renovar' : 'Atender';
  const due = diffDays(today, it.end) > 14 ? addDays(it.end, -14) : today;
  return addTodo(s, { title: `${verb} ${lowerFirst(it.title)}`, cat: sec.area || 'general', due, important: diffDays(today, it.end) <= 14, src: alertSrc(secId, it) }, today);
}

// ---------- Logros ----------

const sumPages = (s) => s.reads.reduce((a, r) => a + r.pages, 0);

export const ACHIEVEMENTS = [
  { id: 'primera', icon: 'check', title: 'Primer paso', desc: 'Completa tu primera misión.', test: (s) => (s.stats.done || 0) >= 1 },
  { id: 'racha7', icon: 'flame', title: 'Una semana', desc: 'Racha de 7 días.', test: (s) => s.streak.best >= 7 },
  { id: 'racha30', icon: 'flame', title: 'Un mes entero', desc: 'Racha de 30 días.', test: (s) => s.streak.best >= 30 },
  { id: 'nivel5', icon: 'star', title: 'Aventurero curtido', desc: 'Llega al nivel 5.', test: (s) => playerLevel(s.xp).n >= 5 },
  { id: 'nivel10', icon: 'star', title: 'Leyenda en marcha', desc: 'Llega al nivel 10.', test: (s) => playerLevel(s.xp).n >= 10 },
  { id: 'capitulo', icon: 'map', title: 'Primer capítulo', desc: 'Completa un capítulo de un camino.', test: (s) => s.campaigns.some((c) => c.chapters[0] && c.chapters[0].tasks.length > 0 && c.chapters[0].tasks.every((t) => t.done)) },
  { id: 'jefe', icon: 'sword', title: 'Cazador de jefes', desc: 'Derrota a tu primer jefe.', test: (s) => s.bosses.some((b) => b.status === 'won') },
  { id: 'contador', icon: 'coins', title: 'Contador', desc: 'Registra 10 gastos.', test: (s) => s.money.tx.filter((t) => txKind(t) === 'gasto').length >= 10 },
  { id: 'posada', icon: 'moon', title: 'Huésped fiel', desc: 'Cierra 7 días en la posada.', test: (s) => Object.keys(s.inn).length >= 7 },
  { id: 'animo', icon: 'face', title: 'Mirada interior', desc: '10 check-ins de ánimo.', test: (s) => s.moods.length >= 10 },
  { id: 'vinculo', icon: 'people', title: 'Presente', desc: '10 contactos con tu gente.', test: (s) => s.contacts.length >= 10 },
  { id: 'lector', icon: 'book', title: 'Página a página', desc: 'Lee 500 páginas.', test: (s) => sumPages(s) >= 500 },
  { id: 'enfoque', icon: 'timer', title: 'Mente de acero', desc: '10 sesiones de enfoque completas.', test: (s) => s.focus.filter((f) => !f.broken).length >= 10 },
  { id: 'plena', icon: 'heart', title: 'Vitalidad plena', desc: 'Llega a 100 de vitalidad.', test: (s) => s.vit >= 100 },
  { id: 'fenix', icon: 'sparkle', title: 'Fénix', desc: 'Sal del modo recuperación.', test: (s) => (s.stats.recovered || 0) >= 1 },
  { id: 'aldia', icon: 'list', title: 'Al día', desc: 'Completa 20 pendientes.', test: (s) => (s.stats.todos || 0) >= 20 },
  { id: 'expediente', icon: 'folder', title: 'Expediente en orden', desc: 'Completa la mitad de tu expediente.', test: (s) => !!s.record && recordProgress(s).pct >= 0.5 },
  { id: 'hogar20', icon: 'home', title: 'Casa en orden', desc: 'Completa 20 tareas del hogar.', test: (s) => (s.chores || []).reduce((a, c) => a + (c.log || []).length, 0) >= 20 },
  { id: 'descanso7', icon: 'moon', title: 'Buen descanso', desc: 'Duerme tu meta 7 noches seguidas.', test: (s) => {
    const goal = s.profile.sleepGoal || 7;
    let best = 0; let run = 0; let prev = null;
    for (const d of Object.keys(s.health).sort()) {
      const ok = s.health[d] && s.health[d].sleep >= goal;
      run = ok ? (prev && diffDays(prev, d) === 1 ? run + 1 : 1) : 0;
      prev = ok ? d : null;
      best = Math.max(best, run);
    }
    return best >= 7;
  } },
  { id: 'logros10', icon: 'trophy', title: 'Hoja de vida viva', desc: 'Anota 10 logros.', test: (s) => (s.wins || []).length >= 10 },
  { id: 'aldia10', icon: 'calendar', title: 'Cuentas al día', desc: 'Paga a tiempo 10 pagos programados.', test: (s) => {
    let n = 0;
    for (const p of (s.money && s.money.plans) || []) {
      if (p.kind !== 'gasto') continue;
      for (const [d, id] of Object.entries(p.done || {})) { const t = id !== 'skip' && s.money.tx.find((x) => x.id === id); if (t && t.day <= d) n += 1; }
    }
    return n >= 10;
  } },
  { id: 'tarjeta3', icon: 'card', title: 'Tarjeta sin intereses', desc: 'Paga el estado completo de tu tarjeta a tiempo 3 veces.', test: (s) => ((s.money && s.money.accounts) || []).reduce((a, x) => a + Object.keys(x.paidCuts || {}).length, 0) >= 3 },
  { id: 'palabras10', icon: 'book', title: 'Buen vocabulario', desc: 'Usa 10 palabras del día.', test: (s) => Object.keys(s.wordLog || {}).length >= 10 },
  { id: 'calma7', icon: 'sparkle', title: 'Mente serena', desc: 'Una pausa de calma 7 días seguidos.', test: (s) => !!s.mind && bestCalmStreak(s) >= 7 },
  { id: 'calma300', icon: 'clock', title: 'Trescientos minutos', desc: 'Suma 300 minutos de calma.', test: (s) => !!s.mind && s.mind.calm.reduce((a, x) => a + x.minutes, 0) >= 300 },
  { id: 'programa7', icon: 'map', title: 'Primeros siete días', desc: 'Completa «Siete días para empezar».', test: (s) => !!s.mind && Object.keys((s.mind.program || {})[PROGRAM.id] || {}).length >= PROGRAM.days.length },
  { id: 'emociones25', icon: 'face', title: 'Vocabulario emocional', desc: 'Nombra 25 emociones distintas.', test: (s) => distinctEmotions(s) >= 25 },
  { id: 'diario10', icon: 'book', title: 'Diario vivo', desc: 'Escribe en tu diario 10 días distintos.', test: (s) => journalDays(s) >= 10 },
  { id: 'gratitud21', icon: 'heart', title: 'Ojos agradecidos', desc: 'Anota 21 cosas buenas.', test: (s) => goodThings(s) >= 21 },
  { id: 'rueda', icon: 'target', title: 'Mapa de tu vida', desc: 'Completa tu primera rueda de la vida.', test: (s) => !!s.mind && s.mind.wheel.length >= 1 },
];

export function checkAchievements(s, today, ev) {
  for (const a of ACHIEVEMENTS) {
    if (s.achievements[a.id]) continue;
    if (a.test(s)) {
      s.achievements[a.id] = today;
      addGold(s, 25, today);
      ev.push({ type: 'achievement', id: a.id, title: a.title });
    }
  }
}

// ---------- Siguiente mejor jugada ----------

export function nextBestAction(s, today, hour = new Date().getHours()) {
  if (inRecovery(s, today)) return { kind: 'recovery' };
  if (s.health[today]?.sleep == null && hour < 15) return { kind: 'sleep' };
  const { pending } = dayMissions(s, today);
  const { left } = energyInfo(s, today);
  const doable = pending.filter((m) => m.cost <= Math.max(1, left));
  const pick = [...doable].sort((a, b) =>
    ((a.auto ? 1 : 0) - (b.auto ? 1 : 0))
    || (b.penalty - a.penalty)
    || (s.profile.classKeys.includes(b.area) - s.profile.classKeys.includes(a.area))
    || (a.cost - b.cost))[0];
  if (pick) return { kind: 'mission', mission: pick };
  const todo = todosDue(s, today)[0];
  if (todo) return { kind: 'todo', todo };
  if (left <= 1 && pending.length) return { kind: 'potion' };
  if (hour >= 18 && !s.inn[today]) return { kind: 'inn' };
  const due = duePeople(s, today)[0];
  if (due) return { kind: 'person', person: due.p };
  return null;
}

// ---------- Crónica ----------

export function weekStats(s, today) {
  const out = [];
  let vit = null;
  for (let i = 6; i >= 0; i -= 1) {
    const day = addDays(today, -i);
    const d = s.days[day];
    const done = d ? Object.keys(d.done || {}).length : 0;
    if (d && d.vitEnd != null) vit = d.vitEnd;
    out.push({ day, done, todos: d ? d.todos || 0 : 0, xp: d ? d.xp : 0, vit: day === today ? s.vit : vit, xpBy: d ? d.xpBy || {} : {} });
  }
  return out;
}

export function weekXpBy(s, today) {
  const by = Object.fromEntries(AREA_KEYS.map((k) => [k, 0]));
  for (const w of weekStats(s, today)) for (const [k, v] of Object.entries(w.xpBy)) by[k] = (by[k] || 0) + v;
  return by;
}

export function suggestedMissions(area, goalId, intensity, s = null) {
  const tpl = goalTemplate(area, goalId);
  const list = tpl ? tpl.missions : [];
  const n = (INTENSITIES.find((x) => x.key === intensity) || INTENSITIES[1]).missions;
  const steps = s ? dailyGoal(s, 'steps') : DEFAULT_GOALS.steps;
  return list.map((m, i) => {
    const out = { ...m, picked: i < n };
    // Las misiones de pasos usan tu propia meta diaria.
    if (m.auto && m.auto.metric === 'steps') {
      out.title = `${steps.toLocaleString('en-US')} pasos`;
      out.auto = { metric: 'steps', gte: steps };
    }
    return out;
  });
}
