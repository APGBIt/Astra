// Plan para salir de deudas (1.9), como Undebt.it: avalancha (la tasa más alta primero, pagas menos intereses)
// o bola de nieve (el saldo más pequeño primero, ves avances antes). Cada mes: intereses, los pagos de cada
// deuda y todo lo extra a la que toca; al terminar una, lo que pagabas en ella pasa a la siguiente.
import { monthKey } from '../app/dates.js';
import { accountLabel, fxRate, uid } from './logic.js';
import { balances, cardInfo, isCard, nextMonth } from './money.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pos = (n) => Math.max(0, r2(n));

// Tus deudas: las tarjetas con saldo (el que calcula Astra, en pesos; los dólares a la tasa de hoy)
// y los préstamos que agregues. De cada una se guarda la tasa anual y el pago de cada mes.
export function debtList(s, today) {
  const d = s.money.debts || { items: [] };
  const bal = balances(s);
  const rate = fxRate(s, today);
  const cards = new Map(d.items.filter((x) => x.kind === 'card').map((x) => [x.account, x]));
  const out = [];
  for (const a of s.money.accounts) {
    if (!isCard(a) || a.hidden) continue;
    const ci = cardInfo(s, a, today, bal);
    const owed = r2(ci.owed.DOP + ci.owed.USD * rate);
    const x = cards.get(a.id);
    if (!(owed > 0)) continue;
    const minStmt = ci.min ? r2(ci.min.DOP + ci.min.USD * rate) : 0;
    out.push({
      id: x ? x.id : `card-${a.id}`, kind: 'card', account: a.id, name: accountLabel(a), balance: owed, apr: x ? x.apr : 0,
      min: x && x.min > 0 ? x.min : minStmt, on: x ? x.on !== false : true, saved: !!x, minStmt, usd: ci.owed.USD > 0,
    });
  }
  for (const x of d.items) if (x.kind !== 'card') out.push({ ...x, saved: true });
  return out;
}

// Simula mes a mes. `method`: 'avalanche', 'snowball' o 'none' (cada deuda solo con su pago, sin extra
// ni pasar lo que se libera). Devuelve en cuántos meses terminas, los intereses y el orden.
export function payoff(items, { extra = 0, method = 'avalanche', maxMonths = 600 } = {}) {
  const ds = items.filter((x) => x.on !== false && Number(x.balance) > 0).map((x) => ({
    id: x.id, name: x.name, bal: Number(x.balance), apr: Math.max(0, Number(x.apr) || 0), min: Math.max(0, Number(x.min) || 0), interest: 0, month: null,
  }));
  if (!ds.length) return { ok: true, months: 0, interest: 0, total: 0, budget: 0, order: [], curve: [] };
  const roll = method !== 'none';
  const budget = ds.reduce((a, d) => a + d.min, 0) + (roll ? Math.max(0, Number(extra) || 0) : 0);
  let month = 0; let interest = 0; let total = 0;
  const curve = [r2(ds.reduce((a, d) => a + d.bal, 0))];
  while (ds.some((d) => d.bal > 0.005) && month < maxMonths) {
    month += 1;
    for (const d of ds) {
      if (d.bal <= 0.005) continue;
      const i = d.bal * (d.apr / 100 / 12);
      d.bal += i; d.interest += i; interest += i;
    }
    let pool = budget;
    for (const d of ds) {
      if (d.bal <= 0.005) continue;
      const pay = Math.min(d.min, d.bal);
      d.bal -= pay; total += pay; pool -= pay;
    }
    if (roll) {
      const order = ds.filter((d) => d.bal > 0.005).sort(method === 'snowball' ? (a, b) => a.bal - b.bal || b.apr - a.apr : (a, b) => b.apr - a.apr || a.bal - b.bal);
      for (const d of order) {
        if (pool <= 0.005) break;
        const pay = Math.min(pool, d.bal);
        d.bal -= pay; total += pay; pool -= pay;
      }
    }
    for (const d of ds) if (d.bal <= 0.005 && d.month == null) { d.bal = 0; d.month = month; }
    curve.push(r2(ds.reduce((a, d) => a + d.bal, 0)));
  }
  const ok = ds.every((d) => d.month != null);
  return {
    ok, months: ok ? month : null, interest: r2(interest), total: r2(total), budget: r2(budget), curve,
    order: [...ds].sort((a, b) => (a.month ?? 1e9) - (b.month ?? 1e9)).map((d) => ({ id: d.id, name: d.name, month: d.month, interest: r2(d.interest) })),
  };
}

// Los dos métodos y «solo los pagos de cada mes», para comparar.
export function compareDebtPlans(items, extra) {
  return { avalanche: payoff(items, { extra, method: 'avalanche' }), snowball: payoff(items, { extra, method: 'snowball' }), minimum: payoff(items, { method: 'none' }) };
}

// El mes en que terminas: «2027-03» a partir de hoy y n meses.
export function monthAfter(today, n) {
  let mk = monthKey(today);
  for (let i = 0; i < n; i++) mk = nextMonth(mk);
  return mk;
}

// ----- Guardar -----
export function setDebtPrefs(s, { method, extra }) {
  if (method) s.money.debts.method = method === 'snowball' ? 'snowball' : 'avalanche';
  if (extra != null) s.money.debts.extra = pos(extra);
}

// Tasa y pago de una tarjeta (se guarda por cuenta) o datos de un préstamo.
export function saveDebt(s, p) {
  const items = s.money.debts.items;
  const apr = Math.min(300, Math.max(0, Number(p.apr) || 0));
  const min = pos(p.min);
  if (p.kind === 'card') {
    let x = items.find((i) => i.kind === 'card' && i.account === p.account);
    if (!x) { x = { id: `d${uid()}`, kind: 'card', account: p.account, name: '', balance: 0, apr: 0, min: 0, on: true }; items.push(x); }
    x.apr = apr; x.min = min;
    if (p.on !== undefined) x.on = !!p.on;
    return x;
  }
  const name = String(p.name || '').trim().slice(0, 50);
  if (name.length < 2 || !(Number(p.balance) > 0)) return null;
  let x = p.id ? items.find((i) => i.id === p.id) : null;
  if (!x) { x = { id: `d${uid()}`, kind: 'loan', account: '', name, balance: 0, apr: 0, min: 0, on: true }; items.push(x); }
  x.name = name; x.balance = pos(p.balance); x.apr = apr; x.min = min;
  if (p.on !== undefined) x.on = !!p.on;
  return x;
}

export function removeDebt(s, id) {
  s.money.debts.items = s.money.debts.items.filter((x) => x.id !== id);
}
