// Tasa del dólar en internet (pesos por US$1). Solo se pide la tasa: no se envía ningún dato tuyo.
// Si no hay conexión, o el lugar donde corre la app no deja salir a internet, se usa la última tasa
// conocida o la que pongas a mano.
import { act, getState } from './store.js';
import { dayKey } from './dates.js';
import { recordRate } from '../game/logic.js';

const ok = (r) => Number.isFinite(r) && r > 20 && r < 250;

async function getJSON(url, ms = 6000) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = setTimeout(() => ctl && ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl ? ctl.signal : undefined, cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// Fuentes gratuitas y públicas, en orden. `day` = 'AAAA-MM-DD' para una fecha pasada, o nada para hoy.
const SOURCES = [
  {
    name: 'Mercado (currency-api)',
    url: (day) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${day || 'latest'}/v1/currencies/usd.json`,
    read: (j) => ({ rate: Number(j && j.usd && j.usd.dop), day: j && j.date }),
  },
  {
    name: 'Mercado (currency-api)',
    url: (day) => `https://${day || 'latest'}.currency-api.pages.dev/v1/currencies/usd.json`,
    read: (j) => ({ rate: Number(j && j.usd && j.usd.dop), day: j && j.date }),
  },
  {
    name: 'Mercado (ExchangeRate-API)',
    latestOnly: true,
    url: () => 'https://open.er-api.com/v6/latest/USD',
    read: (j) => ({ rate: Number(j && j.rates && j.rates.DOP), day: j && j.time_last_update_unix ? dayKey(new Date(j.time_last_update_unix * 1000)) : dayKey() }),
  },
];

export async function fetchRate(day = null) {
  let lastErr = null;
  for (const src of SOURCES) {
    if (day && src.latestOnly) continue;
    try {
      const out = src.read(await getJSON(src.url(day)));
      if (ok(out.rate)) return { rate: Math.round(out.rate * 10000) / 10000, day: /^\d{4}-\d{2}-\d{2}$/.test(out.day || '') ? out.day : day || dayKey(), source: src.name };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Sin tasa');
}

let inflight = null;

// Actualiza la tasa de hoy una vez al día (o cuando la pides con `force`).
export function refreshRate({ force = false } = {}) {
  const s = getState();
  const fx = s.money && s.money.fx;
  if (!fx) return Promise.resolve(null);
  const today = dayKey();
  if (!force && (!fx.auto || fx.fetched === today)) return Promise.resolve(null);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve(null);
  if (inflight) return inflight;
  inflight = fetchRate()
    .then((r) => {
      act((st) => { recordRate(st, r.day, r.rate, r.source); st.money.fx.fetched = today; st.money.fx.checkedAt = Date.now(); });
      return r;
    })
    .catch(() => {
      act((st) => { st.money.fx.fetched = today; st.money.fx.failedAt = Date.now(); });
      return null;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

// Tasa de un día pasado (para un gasto en dólares con fecha vieja). Se guarda para no volver a pedirla.
const asked = new Set();
export async function rateForDay(day) {
  const s = getState();
  const h = (s.money && s.money.fx && s.money.fx.history) || {};
  if (ok(Number(h[day]))) return Number(h[day]);
  if (asked.has(day) || day > dayKey()) return null;
  asked.add(day);
  try {
    const r = await fetchRate(day);
    act((st) => { recordRate(st, day, r.rate, r.source); });
    return r.rate;
  } catch {
    return null;
  }
}
