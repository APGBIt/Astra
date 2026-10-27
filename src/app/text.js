// Textos que se arman igual en toda la app (1.15). Sin interfaz: se pueden probar en Node.

// «a, b y c» (y «e» antes de i- o hi-: «salud e ingresos»).
export function joinY(list) {
  const a = (list || []).filter((x) => x != null && x !== '');
  if (a.length <= 1) return a[0] || '';
  const last = String(a[a.length - 1]);
  return `${a.slice(0, -1).join(', ')} ${/^h?i(?![aeouáéó])/i.test(last) ? 'e' : 'y'} ${last}`;
}

// Iniciales para el avatar. Solo letras y números: «Pedro (mentor)» → «PE», «María José» → «MJ».
export function initialsOf(name) {
  const parts = String(name || '').replace(/\([^)]*\)/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'A';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Las horas de una noche en poco espacio: «7h15», «8h» (antes salía «7.25»).
export function hoursShort(h) {
  const v = Number(h);
  if (!Number.isFinite(v)) return '';
  let hh = Math.floor(v);
  let mm = Math.round((v - hh) * 60);
  if (mm === 60) { hh += 1; mm = 0; }
  return mm ? `${hh}h${String(mm).padStart(2, '0')}` : `${hh}h`;
}
