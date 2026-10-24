// Cuadrar una cuenta con el banco (1.12). Antes, al poner «mi saldo es X» se reemplazaba el saldo y la diferencia con lo
// que Astra tenía se perdía sin dejar rastro: los gastos anotados no explicaban la caída del saldo. Ahora la diferencia
// se anota como un ajuste («Gastos sin anotar» o «Ingresos sin anotar»), que se puede repartir en categorías, y queda
// un historial. Es lo que hacen YNAB (ajuste de conciliación), Firefly III (transacción de corrección) y Actual.
import { addTx, accountOf } from './logic.js';
import { txLegs, anchorOf, afterAnchor, isCard, accountCur, moneyAccount, setAccountBalance, balances } from './money.js';

const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const hm = (now) => { const d = new Date(now); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const CURS = ['DOP', 'USD'];
export const EPS = 0.01;

// ¿Pasó este movimiento hasta ese momento? (sin hora, cuenta todo el día)
const upTo = (t, when) => t.day < when.day || (t.day === when.day && (!when.time || !t.time || t.time <= when.time));

// Lo que Astra calcula que hay en la cuenta (en una tarjeta, negativo = lo que debes) en un momento, en una moneda.
// Sin `when`, hoy (con todo lo anotado).
export function expectedBalance(s, id, c, when = null) {
  const a = accountOf(s, id);
  if (!a) return 0;
  if (!when) return (balances(s)[id] || {})[c] || 0;
  let v = a.base ? Number(a.base[c]) || 0 : 0;
  const anchor = anchorOf(a, c);
  for (const t of s.money.tx) {
    if (!afterAnchor(anchor, t) || !upTo(t, when)) continue;
    for (const [lid, lc, lv] of txLegs(s, t)) if (lid === id && lc === c) v += lv;
  }
  return r2(v);
}

// Qué monedas se pueden cuadrar en una cuenta.
export const balanceCurrencies = (a) => (isCard(a) ? CURS : [accountCur(a)]);

// Lo que se va a cambiar al cuadrar: por moneda, lo que Astra tenía, lo que dice el banco y la diferencia.
// `amounts`: en una cuenta, su saldo; en una tarjeta, lo que debes (positivo).
export function reconcilePreview(s, id, amounts, today, now = Date.now(), when = null) {
  const a = moneyAccount(s, id) || accountOf(s, id);
  if (!a) return [];
  const w = { day: when && isDay(when.day) ? when.day : today, time: when ? when.time || '' : hm(now) };
  const rows = [];
  for (const c of balanceCurrencies(a)) {
    if (amounts[c] === undefined || amounts[c] === '' || !Number.isFinite(Number(amounts[c]))) continue;
    const target = isCard(a) ? -Math.abs(Number(amounts[c])) : Number(amounts[c]);
    const expected = a.base ? expectedBalance(s, a.id, c, when ? w : null) : null;
    rows.push({ c, target: r2(target), expected: expected == null ? null : r2(expected), diff: expected == null ? null : r2(target - expected), first: !a.base });
  }
  return rows;
}

const note = (a, c, was, now) => `Astra tenía ${fmt(was, c)} ${isCard(a) ? 'de saldo' : ''}y el banco dice ${fmt(now, c)}.`.replace('  ', ' ');
const fmt = (v, c) => `${c === 'USD' ? 'US$' : 'RD$'}${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}${v < 0 ? ' (debes)' : ''}`;

function log(a, entry) {
  a.recon = [...(Array.isArray(a.recon) ? a.recon : []), entry].slice(-40);
}

// Cuadra una cuenta o tarjeta con el banco. `mode`:
//  · 'ajuste' (por defecto): anota la diferencia como un movimiento de ajuste y deja el resto como estaba.
//  · 'reiniciar': pone el saldo como punto de partida nuevo (lo anterior queda dentro de él) y no anota nada.
// Devuelve las filas con `tx` (el ajuste anotado) y `mode`.
export function reconcileBalance(s, id, amounts, today, now = Date.now(), opts = {}) {
  const a = moneyAccount(s, id) || accountOf(s, id);
  if (!a) return [];
  const when = opts.when && isDay(opts.when.day) ? opts.when : null;
  const mode = opts.mode === 'reiniciar' ? 'reiniciar' : 'ajuste';
  const day = when ? when.day : today;
  const time = when ? when.time || '' : hm(now);
  const rows = reconcilePreview(s, a.id, amounts, today, now, when);
  const out = [];
  if (!rows.length) return out;
  // Primer saldo, o reiniciar: punto de partida nuevo.
  const restart = mode === 'reiniciar' || rows.some((r) => r.first);
  if (restart) {
    const cur = {};
    for (const c of balanceCurrencies(a)) cur[c] = amounts[c] !== undefined && amounts[c] !== '' ? Number(amounts[c]) : isCard(a) ? Math.abs(Number(a.base && a.base[c]) || 0) : Number(a.base && a.base[c]) || 0;
    setAccountBalance(s, a.id, cur, today, now, when ? { day, time } : null);
    if (opts.src) a.base.src = String(opts.src).slice(0, 80);
    for (const r of rows) { log(a, { day, time, c: r.c, was: r.expected, now: r.target, diff: r.diff, mode: r.first ? 'inicio' : 'reiniciar', tx: null }); out.push({ ...r, tx: null, mode: r.first ? 'inicio' : 'reiniciar' }); }
    return out;
  }
  for (const r of rows) {
    if (Math.abs(r.diff) < EPS) { log(a, { day, time, c: r.c, was: r.expected, now: r.target, diff: 0, mode: 'igual', tx: null }); out.push({ ...r, tx: null, mode: 'igual' }); continue; }
    const gasto = r.diff < 0;
    const tx = addTx(s, {
      type: gasto ? 'gasto' : 'ingreso', cat: gasto ? 'ajuste' : 'ajuste_ingreso', merchant: 'Ajuste de saldo', amount: Math.abs(r.diff), currency: r.c,
      account: a.id, day, time, note: note(a, r.c, r.expected, r.target), adjust: true, late: true, source: 'ajuste', batch: opts.batch || '',
    }, today, []);
    if (opts.src && tx) tx.note = `${tx.note} ${String(opts.src).slice(0, 60)}`.trim();
    log(a, { day, time, c: r.c, was: r.expected, now: r.target, diff: r.diff, mode: 'ajuste', tx: tx ? tx.id : null });
    out.push({ ...r, tx: tx ? tx.id : null, mode: 'ajuste' });
  }
  return out;
}

// Lo que dice el banco que tienes disponible (alertas, estados de cuenta, importaciones), pero cuadrando con un ajuste
// en vez de reemplazar el saldo. Devuelve lo mismo que `setAvailable`: 'balance', 'card', 'avail' u ''.
export function reconcileAvailable(s, id, p, today, now = Date.now(), opts = {}, legacy) {
  const a = moneyAccount(s, id);
  if (!a || !isDay(p.day) || !Number.isFinite(Number(p.amount))) return '';
  const c = p.currency === 'USD' ? 'USD' : 'DOP';
  const when = { day: p.day, time: p.time || '' };
  const newer = (b) => !b || p.day > b.day || (p.day === b.day && (p.time || '') >= (b.time || ''));
  if (!a.base || opts.mode === 'reiniciar') return legacy(s, id, p, today, now);
  if (!isCard(a)) {
    if (accountCur(a) !== c || !newer(a.base)) return '';
    reconcileBalance(s, a.id, { [c]: Number(p.amount) }, today, now, { ...opts, when, src: p.source });
    return 'balance';
  }
  // Tarjeta: el disponible y el límite se guardan como siempre; la deuda se cuadra con un ajuste.
  if (!a.bankAvail || typeof a.bankAvail !== 'object') a.bankAvail = {};
  if (a.bankAvail[c] && !newer(a.bankAvail[c])) return '';
  a.bankAvail[c] = { amount: r2(p.amount), day: p.day, time: p.time || '', src: String(p.source || '').slice(0, 80) };
  if (Number(p.limit) > 0) a.limit = { ...(a.limit || { DOP: 0, USD: 0 }), [c]: r2(p.limit) };
  const lim = Number(a.limit && a.limit[c]) || 0;
  if (!(lim > 0)) return 'avail';
  const owed = r2(Math.max(0, lim - Number(p.amount)));
  reconcileBalance(s, a.id, { [c]: owed }, today, now, { ...opts, when, src: p.source });
  return 'card';
}

// Lo que pasó desde el último saldo: para explicar de dónde sale el número (y por qué un gasto no lo movió).
export function balanceBreakdown(s, id, c) {
  const a = accountOf(s, id);
  if (!a) return null;
  const anchor = a.base ? anchorOf(a, c) : null;
  const out = { base: a.base ? r2(a.base[c]) : null, day: anchor ? anchor.day : null, time: anchor ? anchor.time || '' : '', src: a.base && a.base.src ? a.base.src : '', in: 0, out: 0, moved: 0, adjust: 0, inside: [], n: 0 };
  for (const t of s.money.tx) {
    for (const [lid, lc, lv] of txLegs(s, t)) {
      if (lid !== id || lc !== c) continue;
      if (!afterAnchor(anchor, t)) { out.inside.push(t.id); continue; }
      out.n += 1;
      if (t.adjust) out.adjust += lv;
      else if (t.kind === 'transfer' || t.to) out.moved += lv;
      else if (lv > 0) out.in += lv;
      else out.out += lv;
    }
  }
  for (const k of ['in', 'out', 'moved', 'adjust']) out[k] = r2(out[k]);
  out.expected = r2((out.base || 0) + out.in + out.out + out.moved + out.adjust);
  return out;
}

// ¿Este movimiento ya está dentro del saldo que pusiste (por ser de antes)? Para avisarlo al anotarlo.
export function insideBalance(s, t) {
  if (t.late) return null;
  for (const [id, c] of txLegs(s, t)) {
    const a = accountOf(s, id);
    if (!a || !a.base) continue;
    const anchor = anchorOf(a, c);
    if (!afterAnchor(anchor, t)) return { account: a, day: anchor.day, time: anchor.time || '', c };
  }
  return null;
}

// Cuánto sin explicar hay en un período: la suma de los ajustes anotados (para el análisis).
export function adjustTotals(s, from, to) {
  let out = 0; let inc = 0; let n = 0;
  for (const t of s.money.tx) {
    if (!t.adjust || t.day < from || t.day > to) continue;
    const dop = Math.abs(Number(t.amount) || 0);
    if (t.kind === 'ingreso') inc += dop; else out += dop;
    n += 1;
  }
  return { out: r2(out), in: r2(inc), n };
}
