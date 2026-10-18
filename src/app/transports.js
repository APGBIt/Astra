// Cómo habla Astra con Drive. Dos conectores con la misma forma:
//   head() → { rev, updated, device } | null      (qué versión hay en Drive)
//   pull() → { rev, text }                         (descargar)
//   push(text, expect, meta) → { rev }             (subir; si Drive cambió desde `expect`, error «conflict»)
//   putPhoto(blob, meta) → fileId, getPhoto(fileId) → Blob, delPhoto(fileId)
import { toCSV } from '../game/tables.js';

export class SyncError extends Error {
  constructor(code, message, extra = {}) {
    super(message || code);
    this.code = code;
    Object.assign(this, extra);
  }
}

const b64ToBlob = (b64, mime) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime || 'image/jpeg' });
};
const blobToB64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

async function timed(promise, ms, ctl) {
  const t = setTimeout(() => ctl && ctl.abort(), ms);
  try { return await promise; } finally { clearTimeout(t); }
}

// ---------- Conector propio (Apps Script en el Drive de cada persona) ----------

export function scriptTransport({ url, key }) {
  const call = async (op, payload = {}, ms = 45000) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new SyncError('offline', 'Sin conexión');
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let r;
    try {
      // text/plain evita la consulta previa de CORS; Apps Script responde con una redirección que sí la permite.
      r = await timed(fetch(url, { method: 'POST', body: JSON.stringify({ op, clave: key, ...payload }), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', signal: ctl ? ctl.signal : undefined }), ms, ctl);
    } catch (e) {
      throw new SyncError(e && e.name === 'AbortError' ? 'timeout' : 'network', 'No se pudo llegar al conector');
    }
    if (!r.ok) throw new SyncError('http', `El conector respondió ${r.status}`);
    let j;
    try { j = await r.json(); } catch { throw new SyncError('respuesta', 'El conector no respondió como se esperaba'); }
    if (!j || j.ok !== true) {
      if (j && j.conflicto) throw new SyncError('conflict', 'Drive cambió mientras sincronizabas', { rev: j.rev });
      throw new SyncError(j && j.error === 'clave' ? 'clave' : 'remoto', (j && j.error) || 'Error del conector');
    }
    return j;
  };
  return {
    kind: 'script',
    hello: () => call('hola'),
    async head() { const j = await call('estado'); return j.rev ? { rev: j.rev, updated: j.updated, device: j.device } : null; },
    async pull() { const j = await call('leer'); return { rev: j.rev, text: j.data }; },
    async push(text, expect, meta = {}) {
      const j = await call('guardar', { data: text, expect, device: meta.device || '', tablas: meta.tables || null }, 90000);
      return { rev: j.rev };
    },
    async putPhoto(blob, meta = {}) {
      const j = await call('foto', { b64: await blobToB64(blob), mime: blob.type || 'image/jpeg', name: meta.name, kind: meta.folder, id: meta.id, desc: meta.desc || '' }, 90000);
      return j.fileId;
    },
    async getPhoto(fileId) { const j = await call('leerFoto', { fileId }, 90000); return b64ToBlob(j.b64, j.mime); },
    async delPhoto(fileId) { await call('borrarFoto', { fileId }); },
  };
}

// ---------- Google Drive con la cuenta de cada persona (permiso «drive.file») ----------

const API = 'https://www.googleapis.com/drive/v3';
const UP = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';

function multipart(meta, content, mime) {
  const boundary = `astra${Math.random().toString(36).slice(2)}`;
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  return { body: new Blob([head, content, tail]), type: `multipart/related; boundary=${boundary}` };
}

export function driveTransport({ token, ids = {}, saveIds = () => {}, folderName = 'Astra' }) {
  const req = async (url, { method = 'GET', body, type, as = 'json' } = {}) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new SyncError('offline', 'Sin conexión');
    let r;
    try {
      r = await fetch(url, { method, body, headers: { Authorization: `Bearer ${token}`, ...(type ? { 'Content-Type': type } : {}) } });
    } catch {
      throw new SyncError('network', 'No se pudo llegar a Google Drive');
    }
    if (r.status === 401) throw new SyncError('auth', 'Tu sesión de Google venció');
    if (r.status === 404) throw new SyncError('notfound', 'No se encontró el archivo en Drive');
    if (!r.ok) {
      let msg = `Google Drive respondió ${r.status}`;
      try { const j = await r.json(); if (j && j.error && j.error.message) msg = j.error.message; } catch { /* sin detalle */ }
      throw new SyncError(r.status === 403 ? 'forbidden' : 'http', msg);
    }
    if (as === 'none' || r.status === 204) return null;
    if (as === 'text') return r.text();
    if (as === 'blob') return r.blob();
    return r.json();
  };
  const q = (s) => encodeURIComponent(s);
  const find = async (query, fields = 'files(id,name,appProperties,modifiedTime)') => {
    const j = await req(`${API}/files?q=${q(`${query} and trashed=false`)}&spaces=drive&pageSize=100&fields=${q(fields)}`);
    return (j && j.files) || [];
  };
  const byRole = (role) => `appProperties has { key='astra' and value='${role}' }`;
  const keep = (role, id) => { ids[role] = id; saveIds({ ...ids }); return id; };

  async function folder(role, name, parent) {
    if (ids[role]) return ids[role];
    const found = (await find(`${byRole(role)} and mimeType='${FOLDER}'`))[0];
    if (found) return keep(role, found.id);
    const meta = { name, mimeType: FOLDER, appProperties: { astra: role }, ...(parent ? { parents: [parent] } : {}) };
    const f = await req(`${API}/files?fields=id`, { method: 'POST', body: JSON.stringify(meta), type: 'application/json' });
    return keep(role, f.id);
  }
  const root = () => folder('root', folderName, null);
  async function sub(role, name) { return folder(role, name, await root()); }

  async function dataFile() {
    if (ids.data) return ids.data;
    const f = (await find(byRole('data')))[0];
    return f ? keep('data', f.id) : null;
  }
  async function head() {
    const id = await dataFile();
    if (!id) return null;
    try {
      const f = await req(`${API}/files/${id}?fields=${q('id,modifiedTime,appProperties')}`);
      const p = f.appProperties || {};
      return { rev: Number(p.rev || 0), updated: f.modifiedTime, device: p.device || null };
    } catch (e) {
      if (e.code === 'notfound') { delete ids.data; saveIds({ ...ids }); return null; }
      throw e;
    }
  }
  async function upload(id, meta, content, mime) {
    const m = multipart(meta, content, mime);
    if (id) return req(`${UP}/files/${id}?uploadType=multipart&fields=id`, { method: 'PATCH', body: m.body, type: m.type });
    return req(`${UP}/files?uploadType=multipart&fields=id`, { method: 'POST', body: m.body, type: m.type });
  }

  return {
    kind: 'google',
    async hello() {
      const about = await req(`${API}/about?fields=${q('user(displayName,emailAddress)')}`);
      const id = await root();
      return { cuenta: about && about.user ? about.user.emailAddress : '', nombre: about && about.user ? about.user.displayName : '', url: `https://drive.google.com/drive/folders/${id}` };
    },
    head,
    async pull() {
      const id = await dataFile();
      if (!id) return { rev: 0, text: null };
      const h = await head();
      return { rev: h ? h.rev : 0, text: await req(`${API}/files/${id}?alt=media`, { as: 'text' }) };
    },
    async push(text, expect, meta = {}) {
      const h = await head();
      if (h && expect != null && h.rev !== expect) throw new SyncError('conflict', 'Drive cambió mientras sincronizabas', { rev: h.rev });
      const rev = (h ? h.rev : 0) + 1;
      const props = { astra: 'data', rev: String(rev), device: String(meta.device || '') };
      const id = await dataFile();
      const f = id
        ? await upload(id, { appProperties: props }, text, 'application/json')
        : await upload(null, { name: 'astra-datos.json', mimeType: 'application/json', parents: [await root()], appProperties: props }, text, 'application/json');
      keep('data', f.id);
      return { rev };
    },
    // Copia del día en «Respaldos» (se guardan 30).
    async backup(day) {
      const id = await dataFile();
      if (!id) return;
      const dir = await sub('respaldos', 'Respaldos');
      const name = `astra-${day}.json`;
      const prev = (await find(`'${dir}' in parents and name='${name}'`))[0];
      if (prev) await req(`${API}/files/${prev.id}`, { method: 'DELETE', as: 'none' });
      await req(`${API}/files/${id}/copy?fields=id`, { method: 'POST', body: JSON.stringify({ name, parents: [dir], appProperties: { astra: 'respaldo' } }), type: 'application/json' });
      const all = (await find(`'${dir}' in parents`, 'files(id,name)')).sort((a, b) => (a.name < b.name ? 1 : -1));
      for (const f of all.slice(30)) await req(`${API}/files/${f.id}`, { method: 'DELETE', as: 'none' }).catch(() => {});
    },
    // Tablas legibles como CSV en «Tablas» (se abren con Hojas de cálculo).
    async tables(tables) {
      const dir = await sub('tablas', 'Tablas');
      const have = await find(`'${dir}' in parents`, 'files(id,name,appProperties)');
      for (const [name, rows] of Object.entries(tables)) {
        const prev = have.find((f) => f.appProperties && f.appProperties.tabla === name);
        const csv = toCSV(rows);
        if (prev) await upload(prev.id, {}, csv, 'text/csv');
        else await upload(null, { name: `${name}.csv`, mimeType: 'text/csv', parents: [dir], appProperties: { astra: 'tabla', tabla: name } }, csv, 'text/csv');
      }
    },
    async putPhoto(blob, meta = {}) {
      const fotos = await sub('fotos', 'Fotos');
      const role = `fotos-${meta.folder || 'Otras'}`;
      const dir = ids[role] || await folder(role, meta.folder || 'Otras', fotos);
      const f = await upload(null, { name: meta.name || `foto-${meta.id}.jpg`, parents: [dir], description: meta.desc || '', appProperties: { astra: 'foto', id: String(meta.id || '') } }, blob, blob.type || 'image/jpeg');
      return f.id;
    },
    getPhoto: (fileId) => req(`${API}/files/${fileId}?alt=media`, { as: 'blob' }),
    async delPhoto(fileId) { await req(`${API}/files/${fileId}`, { method: 'DELETE', as: 'none' }).catch((e) => { if (e.code !== 'notfound') throw e; }); },
  };
}
