// Tu patrimonio mes a mes (1.10): lo que tienes en cuentas y efectivo, menos lo que debes en tarjetas, más lo que
// te deben y menos lo que debes a personas, al cierre de cada mes (y hoy). Como el «Net worth» de Monarch.
// Se calcula con tus movimientos y los saldos que pusiste: antes del saldo se descuenta lo que pasó después.
import { monthKey } from '../app/dates.js';
import { fxRate } from './logic.js';
import { txLegs, anchorOf, afterAnchor, ownsBalance, isCard, monthEnd } from './money.js';
import { loanTotals } from './loans.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const prevMk = (mk) => { const [y, m] = mk.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };

// Saldo de cada cuenta al terminar un día: { id: { DOP, USD } }.
// saldo(día) = saldo que pusiste + lo que pasó después hasta ese día − lo que ya estaba dentro del saldo pero pasó después de ese día.
export function balancesAt(s, day) {
  const out = {};
  for (const a of s.money.accounts) out[a.id] = { DOP: Number(a.base && a.base.DOP) || 0, USD: Number(a.base && a.base.USD) || 0 };
  for (const t of s.money.tx) {
    for (const [id, c, v] of txLegs(s, t)) {
      const a = s.money.accounts.find((x) => x.id === id);
      if (!a) continue;
      const counted = afterAnchor(anchorOf(a, c), t);
      if (counted && t.day <= day) out[id][c] = r2(out[id][c] + v);
      else if (!counted && t.day > day) out[id][c] = r2(out[id][c] - v);
    }
  }
  return out;
}

// Patrimonio en un día, en pesos (los dólares a la tasa de ese día).
export function worthAt(s, day) {
  const b = balancesAt(s, day);
  const rate = fxRate(s, day);
  let have = 0; let owe = 0;
  for (const a of s.money.accounts) {
    if (!ownsBalance(s, a)) continue;
    const v = b[a.id] || { DOP: 0, USD: 0 };
    const dop = v.DOP + v.USD * rate;
    if (isCard(a)) { if (dop < 0) owe += -dop; else have += dop; } else have += dop;
  }
  const lt = loanTotals(s, day);
  return { day, have: r2(have), owe: r2(owe), lentOut: lt.me, borrowed: lt.yo, net: r2(have - owe + lt.me - lt.yo) };
}

// Desde cuándo hay datos: el primer saldo que pusiste o el primer movimiento.
export function worthStart(s) {
  let first = null;
  for (const a of s.money.accounts) if (a.base && a.base.day && (!first || a.base.day < first)) first = a.base.day;
  for (const t of s.money.tx) if (!first || t.day < first) first = t.day;
  for (const l of s.money.loans || []) if (!first || l.day < first) first = l.day;
  return first;
}

// Cierre de cada mes (hasta `months`) y hoy. Sin saldos puestos no hay serie: no se puede saber de dónde partes.
export function worthSeries(s, today, months = 12) {
  const ready = s.money.accounts.some((a) => a.base);
  const start = worthStart(s);
  if (!ready || !start) return { ready, points: [] };
  const cur = monthKey(today);
  const mks = [cur];
  while (mks.length < months && mks[0] > monthKey(start)) mks.unshift(prevMk(mks[0]));
  const points = mks.map((mk) => worthAt(s, mk === cur ? today : monthEnd(mk)));
  const last = points[points.length - 1];
  const prev = points.length > 1 ? points[points.length - 2] : null;
  const first = points[0];
  return {
    ready, points, last, start,
    dMonth: prev ? r2(last.net - prev.net) : null,
    dAll: points.length > 1 ? r2(last.net - first.net) : null,
  };
}
