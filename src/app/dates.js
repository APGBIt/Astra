// Fechas locales en formato AAAA-MM-DD (sin zonas horarias).

export const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const DAYS_SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function parseDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

// Días desde a hasta b (b − a).
export function diffDays(a, b) {
  return Math.round((parseDay(b) - parseDay(a)) / 86400000);
}

export function weekday(key) {
  return parseDay(key).getDay();
}

export function monthKey(key) {
  return key.slice(0, 7);
}

export function monthName(mk) {
  const [y, m] = mk.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function fmtDay(key, { weekdayName = true } = {}) {
  const d = parseDay(key);
  const w = DAYS[d.getDay()];
  const base = `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
  return weekdayName ? `${w[0].toUpperCase()}${w.slice(1)} ${base}` : base;
}

export function fmtShort(key) {
  const d = parseDay(key);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

export function relDay(key, today) {
  const n = diffDays(key, today);
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Ayer';
  if (n > 1 && n < 7) return `Hace ${n} días`;
  return fmtShort(key);
}
