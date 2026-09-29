// Astra · lógica del juego (sin interfaz). Todas las funciones que cambian el estado reciben el
// estado (una copia editable), el día de hoy y una lista `ev` donde se anotan los eventos a celebrar.
import { dayKey, addDays, diffDays, weekday, monthKey } from '../app/dates.js';
import {
  AREA, AREA_KEYS, GOALS, CUSTOM_CHAPTERS, TALENTS, TALENT_LEVELS, POTIONS, SHOP_ITEMS,
  CATEGORIES, DEFAULT_REWARDS, INTENSITIES, MOOD_QUADS, INFLUENCES,
} from './content.js';

export const ENERGY_CAP = 10;
export const STEPS_GOAL = 8000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export function defaultState(today = dayKey()) {
  return {
    v: 1,
    profile: { name: '', emblem: 'star', onboarded: false, created: today, classKeys: [], sleepGoal: 7, selfRating: {} },
    settings: { theme: 'auto', aiMode: 'auto', aiKey: '', aiModel: 'claude-sonnet-5-5', serverUrl: '', serverToken: '' },
    xp: 0,
    attrs: Object.fromEntries(AREA_KEYS.map((k) => [k, 0])),
    gold: 0,
    vit: 80,
    energy: { day: today, max: 8, used: 0, bonus: 0 },
    streak: { count: 0, best: 0, lastDay: null, freezes: 1, freezeDays: [] },
    recovery: null,
    processed: today,
    stats: { done: 0, recovered: 0 },
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
    money: { categories: CATEGORIES.map((c) => ({ ...c })), tx: [] },
    rewards: DEFAULT_REWARDS.map((r) => ({ id: uid(), ...r })),
    redeemed: [],
    achievements: {},
    titles: [],
    journal: [],
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

function addGold(s, n, today) {
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
  else if (sl != null && sl < goal - 0.5) out.push({ id: 'cansado', label: 'Cansancio leve', desc: `−10 % de XP hasta que duermas ${goal} h`, icon: 'moon', tone: 'vit', xp: -0.1 });
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

// ---------- Misiones automáticas ----------

export function metricValue(s, metric, day) {
  switch (metric) {
    case 'steps': return s.health[day]?.steps || 0;
    case 'sleep': return s.health[day]?.sleep ?? 0;
    case 'tx': return s.money.tx.filter((t) => t.day === day).length;
    case 'mood': return s.moods.filter((m) => m.day === day).length;
    case 'contact': return s.contacts.filter((c) => c.day === day).length;
    case 'focus': return s.focus.filter((f) => f.day === day && !f.broken).length;
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
  if (b.progress >= b.target) {
    b.status = 'won';
    b.wonOn = today;
    gainXP(s, b.area, b.reward.xp, today, ev, { applyMods: false });
    addGold(s, b.reward.gold, today);
    if (b.reward.title && !s.titles.includes(b.reward.title)) s.titles.push(b.reward.title);
    const c = s.campaigns.find((x) => x.id === b.campaignId);
    if (c) { c.status = 'won'; c.wonOn = today; }
    ev.push({ type: 'boss', title: b.title, reward: b.reward });
  }
  checkAchievements(s, today, ev);
  return n;
}

export function bossFeed(s, source, amount, today, ev, { oncePerDay = false, note = '' } = {}) {
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
    t.done = done ? today : null;
    if (done) gainXP(s, c.area, 15, today, ev);
    else {
      s.xp = Math.max(0, s.xp - 15);
      s.attrs[c.area] = Math.max(0, (s.attrs[c.area] || 0) - 15);
    }
  }
  const after = currentChapter(c);
  if (after > before) ev.push({ type: 'chapter', title: c.chapters[before].title, battle: after >= c.chapters.length });
  checkAchievements(s, today, ev);
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
  if (patch.steps != null) {
    h.steps = Math.max(0, Math.round(Number(patch.steps) || 0));
    if (h.steps >= STEPS_GOAL) bossFeed(s, 'stepsDay', 1, day, ev, { oncePerDay: true });
  }
  if (patch.sleep != null) {
    h.sleep = clamp(Math.round(Number(patch.sleep) * 4) / 4, 0, 16);
    const eff = h.sleep >= goal ? 5 : h.sleep < goal - 1 ? -5 : 0;
    const prev = h.sleepVit || 0;
    if (eff !== prev) changeVit(s, eff - prev, eff > 0 ? 'Dormiste tu meta' : eff < 0 ? `Dormiste ${fmtHours(h.sleep)} (meta ${goal} h)` : 'Ajuste de sueño', day, ev);
    h.sleepVit = eff;
    if (day === today) {
      ensureEnergyDay(s, today);
      s.energy.max = energyMaxFromSleep(h.sleep, goal);
    }
    if (h.sleep >= goal) bossFeed(s, 'sleepNight', 1, day, ev, { oncePerDay: true });
  }
  if (patch.water != null) h.water = clamp(Math.round(Number(patch.water) || 0), 0, 30);
  if (patch.exercise != null) {
    const before = h.exercise || 0;
    h.exercise = clamp(Math.round(Number(patch.exercise) || 0), 0, 600);
    if (h.exercise > before) gainXP(s, 'salud', Math.min(30, Math.round((h.exercise - before) / 2)), day, ev);
    if (h.exercise >= 20) bossFeed(s, 'training', 1, day, ev, { oncePerDay: true });
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
  const first = !s.inn[today];
  s.inn[today] = { mood: p.mood || '', good: String(p.good || '').slice(0, 500), better: String(p.better || '').slice(0, 500), bed: p.bed || '' };
  if (first) {
    changeVit(s, 5, 'Descansaste en la posada', today, ev);
    gainXP(s, 'emocional', 10, today, ev);
  }
  checkAchievements(s, today, ev);
  return first;
}

// ---------- Finanzas ----------

export function addTx(s, p, today, ev) {
  const abs = Math.abs(Math.round((Number(p.amount) || 0) * 100) / 100);
  if (!abs) return null;
  const isIncome = p.type === 'ingreso';
  const cat = isIncome ? 'ingreso' : (s.money.categories.some((c) => c.id === p.cat) ? p.cat : 'otros');
  const tx = {
    id: uid(),
    day: p.day || today,
    amount: isIncome ? abs : -abs,
    cat,
    merchant: String(p.merchant || '').slice(0, 60),
    note: String(p.note || '').slice(0, 200),
    source: p.source || 'manual',
    rnc: p.rnc || '',
    ncf: p.ncf || '',
    itbis: Number(p.itbis) || 0,
  };
  s.money.tx.unshift(tx);
  s.money.tx.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  const d = getDay(s, today);
  d.txXp = (d.txXp || 0) + 1;
  if (d.txXp <= 3) gainXP(s, 'finanzas', 5, today, ev);
  if (cat === 'deuda') bossFeed(s, 'debtPay', abs, today, ev, { note: tx.merchant ? `Pago: ${tx.merchant}` : '' });
  if (cat === 'ahorro') bossFeed(s, 'saving', abs, today, ev, { note: tx.merchant ? `Ahorro: ${tx.merchant}` : '' });
  autoCheck(s, today, ev);
  checkAchievements(s, today, ev);
  return tx;
}

export function removeTx(s, id) {
  s.money.tx = s.money.tx.filter((t) => t.id !== id);
}

export function monthSummary(s, mk) {
  const txs = s.money.tx.filter((t) => monthKey(t.day) === mk);
  const income = txs.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
  const byCat = {};
  for (const t of txs) if (t.amount < 0) byCat[t.cat] = (byCat[t.cat] || 0) - t.amount;
  const spent = Object.values(byCat).reduce((a, b) => a + b, 0);
  const assigned = s.money.categories.reduce((a, c) => a + (Number(c.budget) || 0), 0);
  return { income, spent, byCat, assigned, unassigned: income - assigned, count: txs.length, txs };
}

export function setBudget(s, catId, amount) {
  const c = s.money.categories.find((x) => x.id === catId);
  if (c) c.budget = Math.max(0, Math.round(Number(amount) || 0));
}

export const catName = (s, id) => (id === 'ingreso' ? 'Ingreso' : (s.money.categories.find((c) => c.id === id) || { name: 'Otros' }).name);

// ---------- Logros ----------

const sumPages = (s) => s.reads.reduce((a, r) => a + r.pages, 0);

export const ACHIEVEMENTS = [
  { id: 'primera', icon: 'check', title: 'Primer paso', desc: 'Completa tu primera misión.', test: (s) => (s.stats.done || 0) >= 1 },
  { id: 'racha7', icon: 'flame', title: 'Una semana', desc: 'Racha de 7 días.', test: (s) => s.streak.best >= 7 },
  { id: 'racha30', icon: 'flame', title: 'Un mes entero', desc: 'Racha de 30 días.', test: (s) => s.streak.best >= 30 },
  { id: 'nivel5', icon: 'star', title: 'Aventurero curtido', desc: 'Llega al nivel 5.', test: (s) => playerLevel(s.xp).n >= 5 },
  { id: 'nivel10', icon: 'star', title: 'Leyenda en marcha', desc: 'Llega al nivel 10.', test: (s) => playerLevel(s.xp).n >= 10 },
  { id: 'capitulo', icon: 'map', title: 'Primer capítulo', desc: 'Completa un capítulo de un camino.', test: (s) => s.campaigns.some((c) => c.chapters[0] && c.chapters[0].tasks.every((t) => t.done)) },
  { id: 'jefe', icon: 'sword', title: 'Cazador de jefes', desc: 'Derrota a tu primer jefe.', test: (s) => s.bosses.some((b) => b.status === 'won') },
  { id: 'contador', icon: 'coins', title: 'Contador', desc: 'Registra 10 gastos.', test: (s) => s.money.tx.filter((t) => t.amount < 0).length >= 10 },
  { id: 'posada', icon: 'moon', title: 'Huésped fiel', desc: 'Cierra 7 días en la posada.', test: (s) => Object.keys(s.inn).length >= 7 },
  { id: 'animo', icon: 'face', title: 'Mirada interior', desc: '10 check-ins de ánimo.', test: (s) => s.moods.length >= 10 },
  { id: 'vinculo', icon: 'people', title: 'Presente', desc: '10 contactos con tu gente.', test: (s) => s.contacts.length >= 10 },
  { id: 'lector', icon: 'book', title: 'Página a página', desc: 'Lee 500 páginas.', test: (s) => sumPages(s) >= 500 },
  { id: 'enfoque', icon: 'timer', title: 'Mente de acero', desc: '10 sesiones de enfoque completas.', test: (s) => s.focus.filter((f) => !f.broken).length >= 10 },
  { id: 'plena', icon: 'heart', title: 'Vitalidad plena', desc: 'Llega a 100 de vitalidad.', test: (s) => s.vit >= 100 },
  { id: 'fenix', icon: 'sparkle', title: 'Fénix', desc: 'Sal del modo recuperación.', test: (s) => (s.stats.recovered || 0) >= 1 },
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
    out.push({ day, done, xp: d ? d.xp : 0, vit: day === today ? s.vit : vit, xpBy: d ? d.xpBy || {} : {} });
  }
  return out;
}

export function weekXpBy(s, today) {
  const by = Object.fromEntries(AREA_KEYS.map((k) => [k, 0]));
  for (const w of weekStats(s, today)) for (const [k, v] of Object.entries(w.xpBy)) by[k] = (by[k] || 0) + v;
  return by;
}

export function suggestedMissions(area, goalId, intensity) {
  const tpl = goalTemplate(area, goalId);
  const list = tpl ? tpl.missions : [];
  const n = (INTENSITIES.find((x) => x.key === intensity) || INTENSITIES[1]).missions;
  return list.map((m, i) => ({ ...m, picked: i < n }));
}
