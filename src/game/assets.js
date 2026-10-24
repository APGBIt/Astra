// Bienes e inversiones (1.11): lo que tienes que vale dinero y no está en una cuenta (la casa, el carro, un solar,
// un certificado, un negocio). Suman a tu patrimonio con el valor que tú estimas. Si lo estás pagando con un préstamo,
// se liga a él y se ve cuánto es realmente tuyo (valor menos lo que debes).
import { uid, fxRate, toDOP } from './logic.js';
import { creditOf, creditBalanceAt } from './credits.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pos = (v) => r2(Math.max(0, Math.abs(Number(v) || 0)));
const txt = (v, n = 60) => String(v == null ? '' : v).trim().slice(0, n);

export const ASSET_KINDS = [
  { key: 'casa', label: 'Casa o apartamento', icon: 'home' },
  { key: 'terreno', label: 'Terreno o solar', icon: 'map' },
  { key: 'vehiculo', label: 'Vehículo', icon: 'car' },
  { key: 'inversion', label: 'Inversión (certificado, fondo, acciones)', icon: 'trend' },
  { key: 'negocio', label: 'Negocio', icon: 'briefcase' },
  { key: 'otro', label: 'Otro bien', icon: 'box' },
];
export const assetKind = (k) => ASSET_KINDS.find((x) => x.key === k) || ASSET_KINDS[ASSET_KINDS.length - 1];

export function ensureAssets(s) {
  const m = s.money;
  if (!Array.isArray(m.assets)) m.assets = [];
  m.assets = m.assets.filter((a) => isObj(a) && a.id && txt(a.name));
  for (const a of m.assets) {
    a.name = txt(a.name, 50);
    a.kind = ASSET_KINDS.some((k) => k.key === a.kind) ? a.kind : 'otro';
    a.currency = a.currency === 'USD' ? 'USD' : 'DOP';
    if (!Array.isArray(a.vals)) a.vals = [];
    a.vals = a.vals.filter((v) => isObj(v) && isDay(v.day) && Number(v.value) >= 0).map((v) => ({ day: v.day, value: pos(v.value) }));
    a.vals.sort((x, y) => (x.day < y.day ? -1 : x.day > y.day ? 1 : 0));
    if (!a.vals.length) a.vals = [{ day: isDay(a.since) ? a.since : '2026-01-01', value: 0 }];
    if (!isDay(a.since)) a.since = a.vals[0].day;
    a.credit = a.credit && creditOf(s, a.credit) ? a.credit : null;
    a.note = txt(a.note, 200);
  }
}

export const assetOf = (s, id) => ((s.money && s.money.assets) || []).find((a) => a.id === id) || null;

// Su valor un día: la última estimación hasta ese día. Antes de tenerlo, 0.
export function assetValueAt(a, day) {
  if (a.since > day) return 0;
  let v = a.vals[0] ? a.vals[0].value : 0;
  for (const x of a.vals) if (x.day <= day) v = x.value;
  return v;
}

export function addAsset(s, p, today) {
  const name = txt(p.name, 50);
  const value = pos(p.value);
  if (name.length < 2 || !(value > 0)) return null;
  const a = {
    id: uid(), name, kind: ASSET_KINDS.some((k) => k.key === p.kind) ? p.kind : 'otro', currency: p.currency === 'USD' ? 'USD' : 'DOP',
    since: isDay(p.since) ? p.since : today, vals: [], credit: p.credit && creditOf(s, p.credit) ? p.credit : null, note: txt(p.note, 200), created: Date.now(),
  };
  a.vals = [{ day: a.since < today ? a.since : today, value }];
  s.money.assets.push(a);
  return a;
}

export function updateAsset(s, id, p, today) {
  const a = assetOf(s, id);
  if (!a) return null;
  if (p.name !== undefined && txt(p.name, 50).length >= 2) a.name = txt(p.name, 50);
  if (p.kind !== undefined && ASSET_KINDS.some((k) => k.key === p.kind)) a.kind = p.kind;
  if (p.currency !== undefined) a.currency = p.currency === 'USD' ? 'USD' : 'DOP';
  if (p.since !== undefined && isDay(p.since)) a.since = p.since;
  if (p.credit !== undefined) a.credit = p.credit && creditOf(s, p.credit) ? p.credit : null;
  if (p.note !== undefined) a.note = txt(p.note, 200);
  // Un valor nuevo se anota con su fecha; así el patrimonio de meses pasados no cambia.
  if (p.value !== undefined && pos(p.value) > 0 && pos(p.value) !== assetValueAt(a, today)) {
    a.vals = a.vals.filter((v) => v.day !== today);
    a.vals.push({ day: today, value: pos(p.value) });
    a.vals.sort((x, y) => (x.day < y.day ? -1 : x.day > y.day ? 1 : 0));
  }
  return a;
}

export function removeAsset(s, id) {
  s.money.assets = (s.money.assets || []).filter((a) => a.id !== id);
}

// Lo que valen y lo que es realmente tuyo (valor menos el préstamo ligado), en pesos.
export function assetInfo(s, a, day) {
  const rate = fxRate(s, day);
  const value = assetValueAt(a, day);
  const c = a.credit ? creditOf(s, a.credit) : null;
  const owe = c ? creditBalanceAt(c, day) : 0;
  const valueDOP = toDOP(value, a.currency, rate);
  const oweDOP = c ? toDOP(owe, c.currency, rate) : 0;
  return { value, valueDOP: r2(valueDOP), credit: c, owe, oweDOP: r2(oweDOP), equity: r2(valueDOP - oweDOP), pctOwned: valueDOP > 0 ? Math.max(0, Math.min(1, (valueDOP - oweDOP) / valueDOP)) : 0 };
}

// Lo que valen todos tus bienes un día, en pesos (sin restar los préstamos: esos se restan aparte en el patrimonio).
export function assetTotals(s, day) {
  const rate = fxRate(s, day);
  let value = 0; let n = 0;
  for (const a of (s.money && s.money.assets) || []) {
    const v = assetValueAt(a, day);
    if (v > 0) { value += toDOP(v, a.currency, rate); n += 1; }
  }
  return { value: r2(value), n };
}
