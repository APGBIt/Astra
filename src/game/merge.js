// Junta los cambios de dos equipos (este teléfono y lo que hay en Drive) a partir del último estado común.
// Regla general: si solo un lado cambió algo, gana ese lado. Si cambiaron los dos:
// - listas con id (pendientes, movimientos, misiones…): se juntan elemento por elemento;
// - contadores (XP, oro, vitalidad, agua…): se suman los avances de ambos;
// - fechas de «último» (racha, último día procesado): gana la más reciente;
// - lo demás: gana este teléfono.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const json = (v) => JSON.stringify(v);

export function same(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.prototype.hasOwnProperty.call(b, k) || !same(a[k], b[k])) return false;
  return true;
}

// Rutas: claves separadas por «.»; los elementos de listas con id se escriben «lista[]».
const COUNTERS = [
  /^xp$/, /^gold$/, /^vit$/, /^attrs\.[^.]+$/, /^stats\.[^.]+$/, /^energy\.(used|bonus)$/, /^streak\.freezes$/,
  /^days\.[^.]+\.(?!vitEnd$)[^.]+$/, /^days\.[^.]+\.(xpBy|slips|potions)\.[^.]+$/,
  /^health\.[^.]+\.(water|exercise|veg|exVig|breaks)$/, /^health\.[^.]+\.exTypes\.[^.]+$/,
  /^bosses\[\]\.progress$/, /^books\[\]\.read$/,
];
const MAXES = [/^streak\.(count|best|lastDay)$/, /^processed$/, /^v$/, /^health\.[^.]+\.steps$/, /^chores\[\]\.base$/, /^people\[\]\.last$/, /^settings\.lastBackup$/];

const isCounter = (p) => COUNTERS.some((re) => re.test(p));
const isMax = (p) => MAXES.some((re) => re.test(p));
const hasId = (x) => isObj(x) && (typeof x.id === 'string' || typeof x.id === 'number');

function mergeScalar(b, l, r, path) {
  if (typeof l === 'number' && typeof r === 'number' && isCounter(path)) {
    // Sin estado común (dos historias que no se conocían), no se suma: se queda el mayor.
    if (typeof b !== 'number') return Math.max(l, r);
    return b + (l - b) + (r - b);
  }
  if (isMax(path) && l != null && r != null && typeof l === typeof r) return l > r ? l : r;
  return l === undefined ? r : l;
}

function mergeIdArray(b, l, r, path) {
  const bm = new Map((b || []).filter(hasId).map((x) => [x.id, x]));
  const lm = new Map(l.map((x) => [x.id, x]));
  const rm = new Map(r.map((x) => [x.id, x]));
  const out = [];
  const keep = new Map();
  for (const x of l) {
    const id = x.id;
    if (rm.has(id)) keep.set(id, merge3(bm.get(id), x, rm.get(id), `${path}[]`));
    else if (bm.has(id) && same(bm.get(id), x)) continue; // lo borraron en el otro equipo y aquí no cambió
    else keep.set(id, x); // nuevo aquí (o cambiado aquí y borrado allá: se conserva)
  }
  for (const x of r) {
    const id = x.id;
    if (lm.has(id) || keep.has(id)) continue;
    if (bm.has(id) && same(bm.get(id), x)) continue; // lo borraste aquí y allá no cambió
    keep.set(id, x);
  }
  // Orden: el de este teléfono; lo que llegó de Drive entra junto a su vecino anterior.
  for (const x of l) if (keep.has(x.id)) out.push(keep.get(x.id));
  let prev = null;
  for (const x of r) {
    if (!keep.has(x.id)) continue;
    if (!out.some((y) => y.id === x.id)) {
      const at = prev ? out.findIndex((y) => y.id === prev) + 1 : 0;
      out.splice(at, 0, keep.get(x.id));
    }
    prev = x.id;
  }
  return out;
}

function mergeList(b, l, r) {
  // Listas sin id (fechas, etiquetas, registros): se juntan; lo que uno quitó y el otro no tocó, se quita.
  const bs = new Set((b || []).map(json));
  const ls = new Set(l.map(json));
  const rs = new Set(r.map(json));
  const out = [];
  const seen = new Set();
  const add = (x) => { const k = json(x); if (!seen.has(k)) { seen.add(k); out.push(x); } };
  for (const x of l) { const k = json(x); if (bs.has(k) && !rs.has(k)) continue; add(x); }
  for (const x of r) { const k = json(x); if (bs.has(k) && !ls.has(k)) continue; add(x); }
  return out;
}

export function merge3(b, l, r, path = '') {
  if (same(l, r)) return l;
  if (b !== undefined && same(b, l)) return r;
  if (b !== undefined && same(b, r)) return l;
  if (l === undefined) return r;
  if (r === undefined) return l;
  if (isObj(l) && isObj(r)) {
    // Energía: si los días no coinciden, vale la del día más reciente.
    if (path === 'energy' && l.day !== r.day) return (l.day || '') > (r.day || '') ? l : r;
    const out = {};
    const bo = isObj(b) ? b : {};
    const keys = new Set([...Object.keys(l), ...Object.keys(r)]);
    for (const k of keys) {
      const p = path ? `${path}.${k}` : k;
      const inL = Object.prototype.hasOwnProperty.call(l, k);
      const inR = Object.prototype.hasOwnProperty.call(r, k);
      const inB = Object.prototype.hasOwnProperty.call(bo, k);
      if (inL && inR) out[k] = merge3(inB ? bo[k] : undefined, l[k], r[k], p);
      else if (inL) { if (!(inB && same(bo[k], l[k]))) out[k] = l[k]; }
      else if (!(inB && same(bo[k], r[k]))) out[k] = r[k];
    }
    return out;
  }
  if (Array.isArray(l) && Array.isArray(r)) {
    const all = [...(Array.isArray(b) ? b : []), ...l, ...r];
    if (all.length && all.every(hasId)) return mergeIdArray(Array.isArray(b) ? b : [], l, r, path);
    if (all.every((x) => !isObj(x) || !hasId(x))) return mergeList(Array.isArray(b) ? b : [], l, r);
    return l;
  }
  return mergeScalar(b, l, r, path);
}

const dedupeBy = (list, key) => {
  if (!Array.isArray(list)) return list;
  const seen = new Set();
  return list.filter((x) => { const k = key(x); if (k == null) return true; if (seen.has(k)) return false; seen.add(k); return true; });
};

// Ajustes después de juntar: límites, rutinas sin duplicar y pendientes repetidos.
// `noBase`: se juntaron dos historias independientes (dos equipos que nunca se habían sincronizado).
export function tidyMerged(s, { noBase = false } = {}) {
  if (noBase) {
    const n = (t) => String(t || '').trim().toLowerCase();
    s.rewards = dedupeBy(s.rewards, (r) => n(r.title));
    s.missions = dedupeBy(s.missions, (m) => json([n(m.title), m.kind, m.area]));
    s.people = dedupeBy(s.people, (p) => n(p.name));
    s.todoLists = dedupeBy(s.todoLists, (l) => n(l.name));
    s.chores = dedupeBy(s.chores, (c) => n(c.title));
    if (s.shop) {
      s.shop.lists = dedupeBy(s.shop.lists, (l) => n(l.name));
      s.shop.pantry = dedupeBy(s.shop.pantry, (p) => p.key);
    }
    s.campaigns = dedupeBy(s.campaigns, (c) => n(c.title));
    if (s.money && Array.isArray(s.money.accounts)) s.money.accounts = dedupeBy(s.money.accounts, (a) => json([n(a.name), a.last4 || '']));
    for (const sec of (s.record && s.record.sections) || []) {
      if (sec.kind !== 'fields' || !Array.isArray(sec.fields)) continue;
      // Un dato por etiqueta: el que tenga valor.
      const by = new Map();
      for (const f of sec.fields) { const k = n(f.label); const prev = by.get(k); if (!prev || (!prev.value && f.value)) by.set(k, f); }
      sec.fields = sec.fields.filter((f) => by.get(n(f.label)) === f);
    }
  }
  if (typeof s.vit === 'number') s.vit = Math.max(0, Math.min(100, Math.round(s.vit)));
  if (typeof s.xp === 'number') s.xp = Math.max(0, s.xp);
  if (typeof s.gold === 'number') s.gold = Math.max(0, s.gold);
  if (s.streak && typeof s.streak.freezes === 'number') s.streak.freezes = Math.max(0, Math.min(3, s.streak.freezes));
  if (s.energy) s.energy.used = Math.max(0, s.energy.used || 0);
  // Compras: lo que se juntó de dos equipos no repite el mismo producto pendiente en la misma lista.
  if (s.shop && Array.isArray(s.shop.items)) {
    const seenK = new Set();
    s.shop.items = s.shop.items.filter((i) => { if (!i || i.done) return true; const k = json([i.list, i.key]); if (seenK.has(k)) return false; seenK.add(k); return true; });
  }
  for (const c of s.chores || []) if (Array.isArray(c.log)) c.log = [...new Set(c.log)].sort().reverse().slice(0, 120);
  // Dos equipos pueden crear «la siguiente vez» del mismo pendiente: se deja uno.
  if (Array.isArray(s.todos)) {
    const seen = new Set();
    s.todos = s.todos.filter((t) => {
      if (!t || t.done) return true;
      const k = json([t.title, t.cat, t.due, t.repeat || null, t.chore || null]);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  return s;
}

export function mergeStates(base, local, remote) {
  return tidyMerged(merge3(base, local, remote, ''), { noBase: base == null });
}
