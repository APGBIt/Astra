// Sobrantes y faltantes (2.1). Cada vez que cuadras una cuenta con el banco queda en una libreta: lo que Astra
// calculaba, lo que dijo el banco y la diferencia. Un faltante es dinero que salió sin anotarse (o una comisión, o
// un error); un sobrante, dinero que entró sin anotarse. Antes eso se quedaba dentro de cada cuenta (hasta 40
// ajustes) y, al «solo poner el saldo», se perdía.
//
// Con la libreta se puede ver:
// - cuánto se te escapa al mes sin anotar y qué parte de tus gastos es (la «fuga»), con su tendencia;
// - el pronóstico: cuánto esperar que falte la próxima vez que cuadres cada cuenta, y cómo terminaría el mes
//   contando lo que se te suele escapar;
// - el cierre de cada mes: lo que sobró o faltó del plan y de cada presupuesto, y lo que se pronosticaba.
//
// Todo se calcula con lo ya registrado: quien actualiza ve sus cuadres anteriores desde el primer minuto.
import { addDays, diffDays, monthKey, MONTHS } from '../app/dates.js';
import { ensurePlus, plusOf } from './plus.js';
import { accountOf, fxRate, toDOP, gainXP, addGold, txOrig, txKind, txDOP, uid, catName } from './logic.js';
import { isCard, monthPlan, budgetRows, monthEnd } from './money.js';
import { monthView } from './overview.js';
import { totals, prevMonth } from './stats.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const ADJ_CATS = new Set(['ajuste', 'ajuste_ingreso']);
// Un cuadre «limpio»: la diferencia con el banco es de RD$50 o menos.
export const CLEAN_DOP = 50;
// Ventana para aprender tu ritmo: los cuadres de los últimos 120 días.
const WINDOW = 120;

export const REASONS_OUT = [
  ['olvido', 'Gasto que no anoté'],
  ['comision', 'Comisión o cargo del banco'],
  ['efectivo', 'Efectivo que se fue'],
  ['interes', 'Intereses'],
  ['error', 'Error al anotar'],
  ['pendiente', 'El banco aún no lo reflejaba'],
  ['otro', 'Otra cosa'],
];
export const REASONS_IN = [
  ['ingreso', 'Ingreso que no anoté'],
  ['reembolso', 'Devolución o reembolso'],
  ['interes', 'Intereses a favor'],
  ['error', 'Error al anotar'],
  ['pendiente', 'El banco aún no lo reflejaba'],
  ['otro', 'Otra cosa'],
];
export const reasonLabel = (x) => (((x.diff < 0 ? REASONS_OUT : REASONS_IN).find(([k]) => k === x.why) || [])[1] || '');

const stamp = (x) => `${x.day} ${x.time || '99:99'}`;
const byTime = (a, b) => (stamp(a) < stamp(b) ? -1 : stamp(a) > stamp(b) ? 1 : 0);
// Cuadres que tienen diferencia (no el primer saldo de una cuenta).
const counted = (x) => x.mode !== 'inicio' && x.diff != null;

// La diferencia en pesos (negativo = faltante). Los dólares se pasan con la tasa de ese día.
export const cuadreDOP = (s, x) => (x.diff == null ? 0 : x.c === 'USD' ? r2(toDOP(x.diff, 'USD', fxRate(s, x.day))) : r2(x.diff));

// ---------- Guardar ----------

// Lo llama `reconcileBalance` por cada moneda cuadrada. `r`: { c, expected, target, diff }; `mode`: inicio, ajuste,
// reiniciar o igual. Devuelve el cuadre guardado (con `clean` si fue limpio y dio premio).
export function recordCuadre(s, a, r, { day, time = '', mode, tx = null, src = '', now = Date.now(), today = day } = {}) {
  const p = ensurePlus(s);
  const prev = lastCuadre(s, a.id, r.c);
  const exp = mode === 'inicio' ? null : expectedFor(s, a.id, r.c, day);
  const x = {
    id: `cq${uid()}`, day, time, acc: a.id, name: String(a.name || '').slice(0, 60), card: isCard(a), c: r.c === 'USD' ? 'USD' : 'DOP',
    was: r.expected == null ? null : r2(r.expected), now: r2(r.target), diff: mode === 'inicio' || r.diff == null ? null : r2(r.diff),
    mode, tx, src: String(src || '').slice(0, 80), exp: exp ? exp.dop : null, why: '', note: '', at: now,
  };
  p.cuadres.push(x);
  p.cuadres.sort(byTime);
  if (p.cuadres.length > 600) p.cuadres = p.cuadres.slice(-600);
  // Premio por un cuadre limpio, si había pasado al menos una semana desde el anterior de esa cuenta.
  if (counted(x) && Math.abs(cuadreDOP(s, x)) <= CLEAN_DOP && prev && diffDays(prev.day, day) >= 7) {
    gainXP(s, 'finanzas', 10, today, []);
    addGold(s, 3, today);
    return { ...x, clean: true };
  }
  return x;
}

// Por qué sobró o faltó, y una nota (lo que tú sabes y Astra no).
export function setCuadreWhy(s, id, why, note = null) {
  const x = ensurePlus(s).cuadres.find((y) => y.id === id);
  if (!x) return null;
  const ok = (x.diff < 0 ? REASONS_OUT : REASONS_IN).some(([k]) => k === why);
  x.why = ok ? why : '';
  if (note != null) x.note = String(note).slice(0, 200);
  return x;
}

// ---------- Leer ----------

export const cuadresOf = (s) => plusOf(s).cuadres;

export function lastCuadre(s, acc, c = null) {
  const xs = cuadresOf(s);
  for (let i = xs.length - 1; i >= 0; i--) if (xs[i].acc === acc && (!c || xs[i].c === c)) return xs[i];
  return null;
}

// Lo que ya se explicó de un faltante o sobrante: las partes del ajuste que ya tienen su categoría.
export function explainOf(s, x) {
  const total = Math.abs(Number(x.diff) || 0);
  if (!counted(x) || total === 0) return { total: 0, explained: 0, left: 0, parts: [], gone: false };
  if (!x.tx) return { total, explained: 0, left: total, parts: [], gone: false };
  const t = s.money.tx.find((y) => y.id === x.tx);
  if (!t) return { total, explained: 0, left: total, parts: [], gone: true };
  const parts = t.split ? s.money.tx.filter((y) => y.split && y.split.id === t.split.id) : [t];
  const explained = r2(parts.filter((y) => !ADJ_CATS.has(y.cat)).reduce((a, y) => a + txOrig(y), 0));
  return { total, explained: Math.min(total, explained), left: r2(Math.max(0, total - explained)), parts, gone: false };
}

// En qué quedó un cuadre: limpio, repartido (todo con categoría), parcial, con motivo o sin explicar.
export function cuadreStatus(s, x) {
  if (x.mode === 'inicio') return 'inicio';
  if (Math.abs(cuadreDOP(s, x)) <= CLEAN_DOP) return 'limpio';
  const e = explainOf(s, x);
  if (e.total > 0 && e.left <= 0.01) return 'repartido';
  if (x.why) return 'motivo';
  if (e.explained > 0) return 'parcial';
  return 'sin_explicar';
}
export const STATUS_LABEL = { inicio: 'Primer saldo', limpio: 'Limpio', repartido: 'Repartido', motivo: 'Con motivo', parcial: 'A medias', sin_explicar: 'Sin explicar' };

// Totales de un período (en pesos): lo que sobró, lo que faltó, el neto, los limpios y lo que falta explicar.
export function cuadreTotals(s, from, to) {
  let sobr = 0; let falt = 0; let n = 0; let clean = 0; let open = 0; let openDop = 0;
  const why = {};
  for (const x of cuadresOf(s)) {
    if (!counted(x) || x.day < from || x.day > to) continue;
    const v = cuadreDOP(s, x);
    n += 1;
    if (Math.abs(v) <= CLEAN_DOP) { clean += 1; continue; }
    if (v > 0) sobr += v; else falt -= v;
    const st = cuadreStatus(s, x);
    if (st === 'sin_explicar' || st === 'parcial') { open += 1; openDop += Math.abs(v) * (explainOf(s, x).left / Math.max(1, Math.abs(x.diff))); }
    if (v < 0) { const k = x.why || 'sin'; why[k] = r2((why[k] || 0) - v); }
  }
  return { n, clean, sobr: r2(sobr), falt: r2(falt), net: r2(sobr - falt), open, openDop: r2(openDop), why };
}

// Mes a mes (los últimos `n`, el último es el de hoy).
export function cuadreSeries(s, today, n = 6) {
  const mks = [monthKey(today)];
  while (mks.length < n) mks.unshift(prevMonth(mks[0]));
  return mks.map((mk) => ({ mk, current: mk === monthKey(today), ...cuadreTotals(s, `${mk}-01`, monthEnd(mk)) }));
}

// La fuga: de lo que salió en el período, qué parte no estaba anotada (salió a la luz al cuadrar).
export function leakOf(s, from, to) {
  const ct = cuadreTotals(s, from, to);
  const tot = totals(s, from, to);
  // `totals` ya cuenta los ajustes como gasto: lo anotado de verdad es el resto.
  let adj = 0;
  for (const t of s.money.tx) if (t.adjust && t.day >= from && t.day <= to && txKind(t) === 'gasto' && ADJ_CATS.has(t.cat)) adj += txDOP(t);
  const noted = r2(Math.max(0, tot.spent - adj));
  const base = noted + ct.falt;
  return { falt: ct.falt, noted, pct: base > 0 ? ct.falt / base : null };
}

// ---------- Pronóstico ----------

// Tu ritmo por cuenta y moneda: lo que cambió entre cuadres seguidos dividido por los días entre ellos (pesos por
// día; negativo = se escapa). Solo cuadres de los últimos 120 días; el anterior a ellos sirve de punto de partida.
function rates(s, today, { from = addDays(today, -WINDOW), to = today } = {}) {
  const groups = new Map();
  for (const x of cuadresOf(s)) {
    if (x.day > to) continue;
    const k = `${x.acc}|${x.c}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(x);
  }
  const out = [];
  for (const [k, xs] of groups) {
    xs.sort(byTime);
    let sum = 0; let days = 0; let pairs = 0;
    for (let i = 1; i < xs.length; i++) {
      const cur = xs[i];
      if (cur.day < from || !counted(cur)) continue;
      const gap = Math.max(0, diffDays(xs[i - 1].day, cur.day));
      sum += cuadreDOP(s, cur); days += gap; pairs += 1;
    }
    const [acc, c] = k.split('|');
    const last = xs[xs.length - 1];
    out.push({ acc, c, name: last.name, card: last.card, last, pairs, days, sum: r2(sum), perDay: days >= 7 ? sum / days : null });
  }
  return out;
}

// Cuánto esperar que sobre o falte si cuadras esa cuenta en `day` (con tu ritmo y los días desde el último cuadre).
export function expectedFor(s, acc, c, day) {
  const r = rates(s, day).find((x) => x.acc === acc && x.c === c);
  if (!r || r.perDay == null || !r.last) return null;
  const since = Math.max(0, diffDays(r.last.day, day));
  return { dop: r2(r.perDay * since), since, perDay: r2(r.perDay), pairs: r.pairs };
}

// El augurio: tu ritmo, cómo va, cuánto esperar en cada cuenta y cómo terminaría el mes contándolo.
export function cuadreOutlook(s, today) {
  const rs = rates(s, today);
  const known = rs.filter((r) => r.perDay != null);
  const daily = known.length ? r2(known.reduce((a, r) => a + r.perDay, 0)) : null;
  const pairs = rs.reduce((a, r) => a + r.pairs, 0);
  const days = known.reduce((a, r) => Math.max(a, r.days), 0);
  const conf = daily == null ? null : pairs >= 3 && days >= 21 ? 'buena' : 'poca';
  // Tendencia: los últimos 60 días frente a los 60–180 de antes.
  const recent = rates(s, today, { from: addDays(today, -60) }).filter((r) => r.perDay != null);
  const older = rates(s, addDays(today, -60), { from: addDays(today, -180) }).filter((r) => r.perDay != null);
  const rNow = recent.length ? recent.reduce((a, r) => a + r.perDay, 0) : null;
  const rOld = older.length ? older.reduce((a, r) => a + r.perDay, 0) : null;
  let trend = null;
  if (rNow != null && rOld != null && rOld < -1) trend = rNow > rOld * 0.7 ? 'mejor' : rNow < rOld * 1.3 ? 'peor' : 'igual';
  // Por cuenta: hace cuánto que no la cuadras y cuánto esperar.
  const accounts = rs.map((r) => {
    const a = accountOf(s, r.acc);
    const since = diffDays(r.last.day, today);
    const exp = r.perDay != null ? r2(r.perDay * since) : null;
    return { ...r, a, since, exp, stale: since >= 14 };
  }).filter((r) => r.a && !r.a.hidden).sort((x, y) => (x.exp ?? 0) - (y.exp ?? 0) || y.since - x.since);
  // Cuentas con saldo que nunca se han cuadrado desde que pusiste el saldo.
  const never = s.money.accounts.filter((a) => a.base && !a.hidden && !rs.some((r) => r.acc === a.id)).map((a) => ({ a, since: diffDays(a.base.day, today) }));
  // El mes: «a tu ritmo» (lo de siempre) y contando lo que se suele escapar en lo que queda.
  let month = null;
  try {
    const mv = monthView(s, today);
    if (mv.income > 0) {
      const leakLeft = daily != null && daily < 0 ? r2(daily * mv.daysLeft) : 0;
      month = { paceEnd: mv.paceEnd, leakLeft, withLeak: r2(mv.paceEnd + leakLeft), daysLeft: mv.daysLeft };
    }
  } catch { month = null; }
  const mk = monthKey(today);
  const mt = cuadreTotals(s, `${mk}-01`, today);
  const lk = leakOf(s, addDays(today, -90), today);
  // Lo que más explica tus faltantes de los últimos 90 días.
  const t90 = cuadreTotals(s, addDays(today, -90), today);
  const whyTop = Object.entries(t90.why).filter(([k]) => k !== 'sin').sort((a, b) => b[1] - a[1])[0] || null;
  return {
    daily, perMonth: daily != null ? r2(daily * 30.4) : null, perYear: daily != null ? r2(daily * 365) : null, conf, pairs, trend, rNow: rNow != null ? r2(rNow) : null, rOld: rOld != null ? r2(rOld) : null,
    accounts, never, month, mt, leak: lk, whyTop: whyTop ? { k: whyTop[0], dop: whyTop[1], share: t90.falt > 0 ? whyTop[1] / t90.falt : 0 } : null, open: t90.open, openDop: t90.openDop,
  };
}

const rd = (v) => `RD$${Math.round(Math.abs(v)).toLocaleString('en-US')}`;
const WHY_SHORT = { olvido: 'gastos que no anotaste', comision: 'comisiones y cargos del banco', efectivo: 'efectivo que se fue', interes: 'intereses', error: 'errores al anotar', pendiente: 'cosas que el banco aún no reflejaba', otro: 'otras cosas' };

// Las frases del augurio, de la más importante a la menos.
export function outlookLines(o) {
  const out = [];
  if (o.daily == null) {
    out.push({ k: 'aprende', tone: '', text: o.pairs ? 'Necesito al menos una semana entre dos cuadres de la misma cuenta para aprender tu ritmo.' : 'Cuadra tus cuentas con el banco cada semana o dos: así aprendo cuánto se te escapa y te aviso antes.' });
  } else if (Math.abs(o.perMonth) < CLEAN_DOP) {
    out.push({ k: 'ritmo', tone: 'good', text: 'Tus cuentas cuadran: casi todo lo que sale está anotado.' });
  } else if (o.daily < 0) {
    out.push({ k: 'ritmo', tone: 'bad', text: `Se te escapan unos ${rd(o.perMonth)} al mes sin anotar (${rd(o.daily)} al día). En un año serían ${rd(o.perYear)}.` });
  } else {
    out.push({ k: 'ritmo', tone: 'good', text: `Al cuadrar te suelen sobrar unos ${rd(o.perMonth)} al mes: hay ingresos o devoluciones que no anotas.` });
  }
  if (o.trend === 'mejor') out.push({ k: 'tendencia', tone: 'good', text: `Vas mejor: en los últimos 2 meses se escapa ${o.rOld && o.rNow != null ? `${rd(o.rNow * 30.4)} al mes; antes ${rd(o.rOld * 30.4)}` : 'menos que antes'}.` });
  else if (o.trend === 'peor') out.push({ k: 'tendencia', tone: 'bad', text: `Va en aumento: en los últimos 2 meses se escapan ${rd(o.rNow * 30.4)} al mes; antes ${rd(o.rOld * 30.4)}.` });
  if (o.month && o.daily != null && o.daily < 0 && o.month.leakLeft < -CLEAN_DOP) {
    const m = o.month;
    out.push({ k: 'mes', tone: m.withLeak < 0 ? 'bad' : '', text: `Este mes, a tu ritmo, ${m.paceEnd >= 0 ? `te sobrarían ${rd(m.paceEnd)}` : `te faltarían ${rd(m.paceEnd)}`}. Contando lo que se suele escapar, ${m.withLeak >= 0 ? `te quedarían ${rd(m.withLeak)}` : `te faltarían ${rd(m.withLeak)}`}.` });
  }
  const next = o.accounts.find((r) => r.exp != null && Math.abs(r.exp) >= CLEAN_DOP * 2 && r.since >= 7);
  if (next) out.push({ k: 'cuenta', tone: '', acc: next.acc, text: `Si cuadras ${next.name} hoy, espera que ${next.exp < 0 ? 'falten' : 'sobren'} unos ${rd(next.exp)}: hace ${next.since} días que no la cuadras.` });
  if (o.leak.pct != null && o.leak.pct >= 0.03 && o.leak.falt >= CLEAN_DOP * 4) out.push({ k: 'fuga', tone: o.leak.pct >= 0.1 ? 'bad' : '', text: `De cada RD$100 que salieron en 3 meses, RD$${Math.round(o.leak.pct * 100)} no estaban anotados.` });
  if (o.whyTop && o.whyTop.share >= 0.4) out.push({ k: 'motivo', tone: '', text: `Lo que más explica tus faltantes: ${WHY_SHORT[o.whyTop.k] || 'otras cosas'} (${Math.round(o.whyTop.share * 100)} %).` });
  return out;
}

// ---------- Cierre del mes ----------

// Cómo terminó un mes: lo que entró, lo fijo, el día a día y lo que sobró o faltó; cada presupuesto con su sobrante
// o faltante; los cuadres del mes y lo que Astra pronosticaba.
export function monthClose(s, mk, today) {
  const mp = monthPlan(s, mk, today);
  const rows = budgetRows(s, mk, today).filter((r) => r.avail > 0 || r.spent > 0);
  const ct = cuadreTotals(s, `${mk}-01`, monthEnd(mk));
  const pron = (plusOf(s).pron[mk] || []).map((x) => ({ day: x.day, end: r2(x.end), withLeak: x.withLeak != null ? r2(x.withLeak) : null }));
  return {
    mk, income: mp.income, fixed: mp.fixed, funds: mp.funds, variable: mp.variable, left: mp.left,
    budgets: rows.map((r) => ({ id: r.c.id, name: r.c.name, group: !!r.isGroup, avail: r2(r.avail), spent: r2(r.spent), left: r2(r.left) })).sort((a, b) => a.left - b.left),
    sobr: ct.sobr, falt: ct.falt, n: ct.n, clean: ct.clean, pron,
  };
}

// Guarda el cierre de los meses que ya terminaron (el pasado, y hasta 2 más si faltan y tienen movimientos) y,
// una vez por semana, lo que se pronostica para este mes. Se llama al abrir el día.
export function tidyCierres(s, today) {
  if (!s.money) return;
  const p = ensurePlus(s);
  const mk = monthKey(today);
  let m = prevMonth(mk);
  for (let i = 0; i < 3; i++, m = prevMonth(m)) {
    if (p.cierres[m]) continue;
    if (!s.money.tx.some((t) => monthKey(t.day) === m)) continue;
    p.cierres[m] = { ...monthClose(s, m, today), at: today };
  }
  try {
    const list = p.pron[mk] || (p.pron[mk] = []);
    const last = list[list.length - 1];
    if (last && diffDays(last.day, today) < 7) return;
    const mv = monthView(s, today);
    if (!(mv.income > 0) || Number(today.slice(8)) < 3) return;
    const o = cuadreOutlook(s, today);
    list.push({ day: today, end: r2(mv.paceEnd), withLeak: o.month ? o.month.withLeak : null });
    if (list.length > 8) list.splice(0, list.length - 8);
  } catch { /* sin plan del mes no hay pronóstico */ }
}

// Los últimos meses cerrados (lo guardado, o calculado si es de antes de la 2.1), del más reciente al más viejo.
export function monthCloses(s, today, n = 6) {
  const p = plusOf(s);
  const out = [];
  let m = prevMonth(monthKey(today));
  for (let i = 0; i < n; i++, m = prevMonth(m)) {
    const saved = p.cierres[m];
    if (saved) { out.push({ ...saved, saved: true }); continue; }
    if (!s.money.tx.some((t) => monthKey(t.day) === m)) continue;
    out.push({ ...monthClose(s, m, today), saved: false });
  }
  return out;
}

export const monthTitle = (mk) => `${MONTHS[Number(mk.slice(5)) - 1]} ${mk.slice(0, 4)}`;

// ---------- Para Drive ----------

export function cuadreRows(s) {
  return [...cuadresOf(s)].reverse().filter(counted).slice(0, 2000).map((x) => {
    const e = explainOf(s, x);
    return [
      x.day, x.time || '', x.name, x.card ? 'Tarjeta' : 'Cuenta', x.c, x.was != null ? Math.abs(x.was) : '', x.now != null ? Math.abs(x.now) : '', x.diff,
      x.diff < 0 ? 'Faltó' : x.diff > 0 ? 'Sobró' : 'Cuadró', cuadreDOP(s, x), x.exp != null ? x.exp : '', STATUS_LABEL[cuadreStatus(s, x)], reasonLabel(x),
      e.parts.filter((t) => !ADJ_CATS.has(t.cat)).map((t) => catName(s, t.cat)).join(', '), x.mode === 'reiniciar' ? 'Solo saldo' : x.mode === 'igual' ? 'Igual' : 'Ajuste', x.note || '',
    ];
  });
}

