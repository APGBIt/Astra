import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync, gunzipSync } from 'node:zlib';
import * as L from '../src/game/logic.js';
import { keepSnaps } from '../src/app/snapshots.js';
import { gzipB64, gunzipB64, toB64, fromB64, canGzip } from '../src/app/gz.js';
import { act, getState, readBackup, summaryOf, migrate, isQuota } from '../src/app/store.js';
import { scriptTransport } from '../src/app/transports.js';
import { CONNECTOR_CODE, CONNECTOR_VERSION } from '../src/app/connector.js';
import { buildTables } from '../src/game/tables.js';
import { weekSummary } from '../src/game/mind.js';
import { mergeStates } from '../src/game/merge.js';
import { addDays } from '../src/app/dates.js';

const D = '2026-10-31'; // sábado
function fresh(day = D) {
  const s = L.defaultState(day);
  s.profile.onboarded = true;
  return s;
}

// ---------- Puntos de restauración: cuáles se quedan ----------

const snap = (day, reason = 'dia', h = 8) => ({ id: `${reason}-${day}-${h}`, day, reason, at: new Date(`${day}T${String(h).padStart(2, '0')}:00:00`).getTime() });

test('puntos: una copia del día por cada uno de los últimos 7 días y una por semana del mes anterior', () => {
  const list = [];
  for (let i = 0; i < 40; i++) list.push(snap(addDays(D, -i)), snap(addDays(D, -i), 'dia', 20));
  const kept = keepSnaps(list, D);
  const recent = kept.filter((x) => x.day > addDays(D, -7));
  assert.equal(recent.length, 7, 'una por día en la última semana');
  assert.ok(recent.every((x) => x.id.endsWith('-20')), 'de cada día, la más reciente');
  const older = kept.filter((x) => x.day <= addDays(D, -7));
  assert.ok(older.length >= 4 && older.length <= 5, `una por semana: ${older.length}`);
  assert.ok(kept.every((x) => x.day > addDays(D, -35)), 'nada de más de 5 semanas');
});

test('puntos: los de antes de un cambio grande duran 30 días (hasta 8) y los de rescate 90', () => {
  const list = [snap(addDays(D, -31), 'importar'), snap(addDays(D, -60), 'rescate'), snap(addDays(D, -95), 'rescate')];
  for (let i = 0; i < 10; i++) list.push(snap(addDays(D, -i), 'borrar', 10));
  const kept = keepSnaps(list, D);
  assert.equal(kept.filter((x) => x.reason === 'borrar').length, 8);
  assert.ok(!kept.some((x) => x.reason === 'importar'), 'el de hace 31 días se va');
  assert.deepEqual(kept.filter((x) => x.reason === 'rescate').map((x) => x.day), [addDays(D, -60)]);
  assert.ok(kept.length <= 20);
});

test('puntos: nunca más de 20 y uno con fecha futura (reloj cambiado) no se borra', () => {
  const list = [snap(addDays(D, 2), 'dia')];
  for (let i = 0; i < 40; i++) list.push(snap(addDays(D, -(i % 6)), 'manual', i % 24));
  const kept = keepSnaps(list, D);
  assert.ok(kept.length <= 20);
  assert.ok(kept.some((x) => x.day === addDays(D, 2)));
});

// ---------- Comprimir ----------

test('gzip: el texto va y vuelve igual (acentos, varios MB) y pesa mucho menos', async () => {
  assert.ok(canGzip());
  const text = JSON.stringify({ a: 'Ánimo, café, niño, ñandú — «comillas» 😀', list: Array.from({ length: 20000 }, (_, i) => ({ id: `x${i}`, day: '2026-10-31', note: 'Supermercado Nacional' })) });
  const b64 = await gzipB64(text);
  assert.equal(await gunzipB64(b64), text);
  assert.ok(b64.length < text.length / 5, `${b64.length} vs ${text.length}`);
  // Compatible con gzip estándar (lo que usa Apps Script).
  assert.equal(gunzipSync(Buffer.from(b64, 'base64')).toString('utf8'), text);
  const big = new Uint8Array(300000).map((_, i) => (i * 7) % 256);
  assert.deepEqual(fromB64(toB64(big)), big);
});

// ---------- Copia de los datos en cada cambio ----------

test('act: cada cambio trabaja sobre una copia; si algo falla, no queda a medias', () => {
  const before = getState();
  act((s) => { s.profile.name = 'Ana'; s.xp = 10; });
  const after = getState();
  assert.notEqual(after, before);
  assert.equal(after.profile.name, 'Ana');
  assert.notEqual(after.profile, before.profile, 'los objetos internos no se comparten');
  assert.throws(() => act((s) => { s.xp = 999; throw new Error('falla'); }));
  assert.equal(getState().xp, 10, 'lo que falló no se aplicó');
  assert.equal(getState(), after);
  const ret = act((s) => s.missions.push({ id: 'm1', title: 'x' }) && s.missions[0]);
  assert.equal(ret, getState().missions[0], 'lo que devuelve es parte del estado nuevo');
});

test('isQuota reconoce el error de espacio lleno de cada navegador', () => {
  assert.ok(isQuota({ name: 'QuotaExceededError' }));
  assert.ok(isQuota({ name: 'NS_ERROR_DOM_QUOTA_REACHED' }));
  assert.ok(isQuota({ code: 22 }));
  assert.ok(!isQuota({ name: 'SecurityError' }));
  assert.ok(!isQuota(null));
});

// ---------- Copia en archivo ----------

test('copia en archivo: se lee sin cambiar nada y dice qué trae', () => {
  const s = fresh();
  s.xp = 700;
  L.addTx(s, { type: 'gasto', amount: 500, cat: 'super', merchant: 'Nacional', day: D }, D, []);
  L.addMood(s, { quad: 1 }, D, []);
  const text = JSON.stringify({ app: 'astra', v: 1, exportedAt: '2026-10-30T15:00:00.000Z', data: s });
  const b = readBackup(text);
  assert.equal(b.exportedAt, '2026-10-30T15:00:00.000Z');
  assert.equal(b.summary.tx, 1);
  assert.equal(b.summary.moods, 1);
  assert.equal(b.summary.level, L.playerLevel(s.xp).n);
  assert.equal(b.summary.last, D);
  assert.throws(() => readBackup('{"hola":1}'), /no es una copia de Astra/);
  assert.throws(() => readBackup('no es json'), /no es una copia de Astra/);
  assert.equal(summaryOf(null), null);
});

// ---------- Historia que ya no se borra ----------

test('historia: el ánimo, los contactos y el enfoque guardan más de 500 registros', () => {
  const s = fresh('2025-01-01');
  const p = L.addPerson(s, { name: 'Mamá' }, '2025-01-01');
  for (let i = 0; i < 700; i++) {
    const day = addDays('2025-01-01', Math.floor(i / 2));
    L.addMood(s, { quad: i % 4 }, day, []);
    L.contactPerson(s, p.id, 'mensaje', day, []);
    L.finishFocus(s, { minutes: 25 }, day, []);
  }
  assert.equal(s.moods.length, 700);
  assert.equal(s.contacts.length, 700);
  assert.equal(s.focus.length, 700);
  assert.equal(s.moods[s.moods.length - 1].day, '2025-01-01', 'el primer check-in sigue ahí');
  assert.ok(L.HISTORY_MAX >= 5000);
});

test('días viejos: después de 120 días se quedan con su resumen, no se borran', () => {
  const start = '2026-03-01';
  const s = fresh(start);
  const m = L.addMission(s, { title: 'Leer', area: 'crecimiento', cost: 2 }, start);
  let day = start;
  for (let i = 0; i < 200; i++) {
    day = addDays(start, i);
    L.reconcile(s, day);
    L.completeMission(s, m.id, day, []);
  }
  L.reconcile(s, addDays(day, 1));
  const keys = Object.keys(s.days).sort();
  assert.equal(keys[0], start, 'el primer día sigue');
  const old = s.days[start];
  assert.equal(old.c, 1);
  assert.equal(old.n, 1, 'cuántas misiones se hicieron');
  assert.ok(old.xp > 0 && old.gold > 0);
  assert.equal(old.closed, true, 'un día resumido no se vuelve a cerrar');
  assert.equal(old.done, undefined, 'el detalle pesado se quita');
  const full = keys.filter((k) => !s.days[k].c);
  assert.ok(full.length <= 121 && full.length >= 119, `${full.length} días completos`);
  assert.equal(L.doneCount(old), 1);
  assert.equal(L.doneCount(s.days[keys[keys.length - 2]]), 1);
  // La tabla «Días» de Drive tiene toda la historia, con las misiones de los días resumidos.
  const t = buildTables(s, addDays(day, 1)).Días;
  assert.equal(t.length - 1, keys.length);
  const row = t.find((r) => r[0] === start);
  assert.equal(row[1], 1);
  // Volver a cerrar no cambia nada (ya estaba resumido) y juntar con Drive no lo rompe.
  const again = JSON.parse(JSON.stringify(s));
  L.reconcile(again, addDays(day, 2));
  assert.deepEqual(again.days[start], old);
  const merged = mergeStates(JSON.parse(JSON.stringify(s)), again, JSON.parse(JSON.stringify(s)));
  assert.deepEqual(merged.days[start], old);
  assert.equal(weekSummary(s, day).missions, 7);
});

// ---------- Sincronización comprimida ----------

function fakeFetch(handler) {
  const calls = [];
  const f = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const out = await handler(body);
    return { ok: true, status: 200, json: async () => out };
  };
  return { f, calls };
}

test('conector 2: lo que sube va comprimido y lo que baja llega igual', async () => {
  const text = JSON.stringify({ app: 'astra', v: 1, data: { profile: { name: 'Ánimo' }, tx: Array.from({ length: 3000 }, (_, i) => ({ id: `t${i}`, day: '2026-10-31', merchant: 'Supermercado Nacional', cat: 'super', amount: -1250, note: '' })) } });
  const tables = { Movimientos: [['Fecha', 'Monto'], ['2026-10-31', 500]] };
  let stored = null;
  const { f, calls } = fakeFetch(async (b) => {
    if (b.op === 'estado') return { ok: true, rev: 4, v: 2, gz: true };
    if (b.op === 'guardar') {
      stored = b.enc === 'gzip' ? gunzipSync(Buffer.from(b.data, 'base64')).toString('utf8') : b.data;
      return { ok: true, rev: 5 };
    }
    if (b.op === 'leer') return b.acepta === 'gzip' ? { ok: true, rev: 5, enc: 'gzip', data: gzipSync(stored).toString('base64') } : { ok: true, rev: 5, data: stored };
    return { ok: false };
  });
  const old = globalThis.fetch;
  globalThis.fetch = f;
  try {
    const tr = scriptTransport({ url: 'https://script.google.com/macros/s/x/exec', key: 'k'.repeat(24) });
    const h = await tr.head();
    assert.deepEqual(tr.caps, { v: 2, gz: true });
    assert.equal(h.rev, 4);
    await tr.push(text, 4, { device: 'd1', tables });
    const up = calls.find((c) => c.op === 'guardar');
    assert.equal(up.enc, 'gzip');
    assert.ok(up.data.length < text.length / 4, 'pesa mucho menos');
    assert.equal(stored, text);
    assert.deepEqual(JSON.parse(gunzipSync(Buffer.from(up.tablasGz, 'base64')).toString('utf8')), tables);
    assert.equal(up.tablas, undefined);
    const got = await tr.pull();
    assert.equal(calls[calls.length - 1].acepta, 'gzip');
    assert.equal(got.text, text);
  } finally { globalThis.fetch = old; }
});

test('conector 1: nunca recibe datos comprimidos (aunque la app creyera que sí)', async () => {
  const { f, calls } = fakeFetch(async (b) => {
    if (b.op === 'estado') return { ok: true, rev: 3 };
    if (b.op === 'guardar') return { ok: true, rev: 4 };
    if (b.op === 'leer') return { ok: true, rev: 4, data: '{"app":"astra"}' };
    return { ok: false };
  });
  const old = globalThis.fetch;
  globalThis.fetch = f;
  try {
    const tr = scriptTransport({ url: 'https://script.google.com/macros/s/x/exec', key: 'k'.repeat(24), gz: true });
    await tr.head();
    assert.deepEqual(tr.caps, { v: 1, gz: false });
    await tr.push('{"app":"astra"}', 3, { tables: { A: [['x']] } });
    const up = calls.find((c) => c.op === 'guardar');
    assert.equal(up.enc, undefined);
    assert.equal(up.data, '{"app":"astra"}');
    assert.deepEqual(up.tablas, { A: [['x']] });
    const got = await tr.pull();
    assert.equal(calls[calls.length - 1].acepta, undefined);
    assert.equal(got.text, '{"app":"astra"}');
  } finally { globalThis.fetch = old; }
});

// ---------- El conector, probado con Apps Script simulado ----------

function appsScript() {
  const props = new Map();
  const files = new Map();
  let nid = 0;
  const blob = (bytes, type = '', name = '') => ({
    bytes: Buffer.from(bytes), type, name,
    getBytes() { return [...this.bytes].map((b) => (b > 127 ? b - 256 : b)); },
    getDataAsString() { return this.bytes.toString('utf8'); },
    getContentType() { return this.type; },
  });
  const mkFile = (name, content, parent) => {
    const f = {
      id: `f${++nid}`, name, content, parent, trashed: false,
      getId() { return this.id; }, getName() { return this.name; },
      setContent(t) { this.content = t; }, getBlob() { return blob(Buffer.from(this.content, 'utf8'), 'application/json'); },
      setTrashed(v) { this.trashed = v; }, setDescription() {},
      getParents() { const p = [this.parent]; return { hasNext: () => p.length > 0, next: () => p.shift() }; },
    };
    files.set(f.id, f);
    return f;
  };
  const iter = (arr) => { const a = [...arr]; return { hasNext: () => a.length > 0, next: () => a.shift() }; };
  const mkFolder = (name, parent = null) => {
    const folder = {
      id: `d${++nid}`, name, parent, kids: [],
      getId() { return this.id; }, getName() { return this.name; }, getUrl() { return `https://drive/${this.id}`; },
      getFilesByName(n) { return iter([...files.values()].filter((f) => f.parent === this && f.name === n && !f.trashed)); },
      getFiles() { return iter([...files.values()].filter((f) => f.parent === this && !f.trashed)); },
      getFoldersByName(n) { return iter(this.kids.filter((k) => k.name === n)); },
      createFolder(n) { const k = mkFolder(n, this); this.kids.push(k); return k; },
      createFile(n, t) { return mkFile(n, typeof t === 'string' ? t : t.getDataAsString(), this); },
      getParents() { return iter(this.parent ? [this.parent] : []); },
    };
    return folder;
  };
  const root = mkFolder('Astra');
  const g = {
    Utilities: {
      base64Decode: (s) => [...Buffer.from(s, 'base64')].map((b) => (b > 127 ? b - 256 : b)),
      base64Encode: (bytes) => Buffer.from(bytes.map((b) => (b < 0 ? b + 256 : b))).toString('base64'),
      newBlob: (data, type, name) => blob(typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data.map((b) => (b < 0 ? b + 256 : b))), type, name),
      gzip: (b) => blob(gzipSync(b.bytes), 'application/x-gzip'),
      ungzip: (b) => blob(gunzipSync(b.bytes)),
      formatDate: () => '2026-10-31',
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, v),
      setProperties: (o) => Object.entries(o).forEach(([k, v]) => props.set(k, v)), deleteProperty: (k) => props.delete(k),
    }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    DriveApp: {
      getFolderById: (id) => { if (id === root.id) return root; throw new Error('no'); },
      getFoldersByName: (n) => iter(n === 'Astra' ? [root] : []),
      createFolder: () => root,
      getFileById: (id) => files.get(id),
    },
    SpreadsheetApp: { getActiveSpreadsheet: () => null, openById: () => { throw new Error('no'); }, open: () => null, create: () => { throw new Error('sin hojas en la prueba'); } },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'ana@example.com' }), getScriptTimeZone: () => 'America/Santo_Domingo' },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
    Logger: { log() {} },
  };
  root.getOwner = () => ({ getEmail: () => 'ana@example.com' });
  const names = Object.keys(g);
  // eslint-disable-next-line no-new-func
  const api = new Function(...names, `${CONNECTOR_CODE}\nreturn { doPost, doGet };`)(...names.map((k) => g[k]));
  const post = (o) => JSON.parse(api.doPost({ postData: { contents: JSON.stringify(o) } }).text);
  return { post, files, props, doGet: () => JSON.parse(api.doGet().text) };
}

test('conector (Apps Script simulado): guarda texto normal en Drive aunque llegue comprimido', async () => {
  assert.equal(CONNECTOR_VERSION, 2);
  const gs = appsScript();
  const key = 'c'.repeat(24);
  assert.equal(gs.doGet().v, 2);
  const hi = gs.post({ op: 'hola', clave: key });
  assert.equal(hi.ok, true);
  assert.equal(hi.estado.gz, true);
  const text = JSON.stringify({ app: 'astra', data: { nota: 'Ánimo: café ☕' } });
  const r = gs.post({ op: 'guardar', clave: key, data: await gzipB64(text), enc: 'gzip', expect: null, device: 'd1', tablasGz: await gzipB64(JSON.stringify({ A: [['x']] })) });
  assert.equal(r.ok, true);
  assert.equal(r.rev, 1);
  const datos = [...gs.files.values()].find((f) => f.name === 'astra-datos.json');
  assert.equal(datos.content, text, 'en Drive queda el JSON legible');
  const backup = [...gs.files.values()].find((f) => f.name === 'astra-2026-10-31.json');
  assert.equal(backup.content, text, 'el respaldo del día también');
  const z = gs.post({ op: 'leer', clave: key, acepta: 'gzip' });
  assert.equal(z.enc, 'gzip');
  assert.equal(await gunzipB64(z.data), text);
  const plain = gs.post({ op: 'leer', clave: key });
  assert.equal(plain.enc, undefined);
  assert.equal(plain.data, text, 'una app vieja sigue recibiendo texto normal');
  const v1 = gs.post({ op: 'guardar', clave: key, data: text, expect: 1 });
  assert.equal(v1.rev, 2, 'una app vieja puede seguir guardando sin comprimir');
  assert.equal(gs.post({ op: 'guardar', clave: key, data: text, expect: 1 }).conflicto, true);
  assert.equal(gs.post({ op: 'estado', clave: 'otra'.repeat(6) }).error, 'clave');
});

test('migrate de datos con días resumidos y listas largas no pierde nada', () => {
  const s = fresh();
  s.days['2025-01-01'] = { c: 1, xp: 40, gold: 10, vitEnd: 90, n: 2, closed: true };
  for (let i = 0; i < 900; i++) s.moods.push({ id: `m${i}`, day: '2025-06-01', quad: 1 });
  const m = migrate(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(m.days['2025-01-01'], s.days['2025-01-01']);
  assert.equal(m.moods.length, 900);
});

test('sincronizar de punta a punta con el conector 2: la primera subida va comprimida y Drive queda legible', async () => {
  const gs = appsScript();
  const ops = [];
  const old = globalThis.fetch;
  globalThis.fetch = async (url, init) => { const b = JSON.parse(init.body); ops.push(b); return { ok: true, status: 200, json: async () => gs.post(b) }; };
  try {
    const { connectScript, syncState } = await import('../src/app/sync.js');
    act((s) => { s.profile.onboarded = true; s.profile.name = 'Ana Prueba'; L.addTx(s, { type: 'gasto', amount: 850, cat: 'super', merchant: 'La Sirena', day: D }, D, []); });
    await connectScript('https://script.google.com/macros/s/abc123/exec', 'k'.repeat(32));
    const st = syncState();
    assert.equal(st.connV, 2);
    assert.equal(st.gz, true);
    const up = ops.find((o) => o.op === 'guardar');
    assert.ok(up, 'subió los datos');
    assert.equal(up.enc, 'gzip');
    assert.ok(up.tablasGz, 'las tablas también van comprimidas');
    const datos = [...gs.files.values()].find((f) => f.name === 'astra-datos.json');
    const o = JSON.parse(datos.content);
    assert.equal(o.app, 'astra');
    assert.equal(o.data.profile.name, 'Ana Prueba');
    assert.equal(o.data.money.tx[0].merchant, 'La Sirena');
    assert.equal(o.data.settings.aiKey, '', 'las claves no suben');
  } finally { globalThis.fetch = old; }
});
