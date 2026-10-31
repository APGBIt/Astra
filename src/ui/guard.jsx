// Si una pantalla falla, la app no se queda en blanco: muestra qué pasó, deja volver a Hoy y bajar una
// copia de los datos. Los errores se anotan (solo en este teléfono) para poder revisarlos después.
import { useErrorBoundary, useState } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { go } from '../app/router.js';
import { exportData, useStorage, retrySave, useStaleCopy, ready } from '../app/store.js';
import { saveFile } from '../app/files.js';
import { dayKey, fmtDay } from '../app/dates.js';
import { APP_VERSION } from '../app/config.js';

const LOG = 'astra.errores';

export function recentErrors() {
  try { const a = JSON.parse(localStorage.getItem(LOG) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
export function clearErrors() { try { localStorage.removeItem(LOG); } catch { /* */ } }

export function logError(err, where = '') {
  const e = err || {};
  const item = {
    at: Date.now(),
    where: String(where || (typeof location !== 'undefined' ? location.hash : '') || '').slice(0, 80),
    msg: String(e.message || e).slice(0, 300),
    stack: String(e.stack || '').split('\n').slice(0, 8).join('\n').slice(0, 1200),
    v: APP_VERSION,
  };
  try {
    const list = [item, ...recentErrors().filter((x) => !(x.msg === item.msg && x.where === item.where && item.at - x.at < 60000))].slice(0, 10);
    localStorage.setItem(LOG, JSON.stringify(list));
  } catch { /* sin espacio: no importa */ }
  return item;
}

export const errorText = (x) => `Astra ${x.v} · ${new Date(x.at).toLocaleString('es-DO')}\nPantalla: ${x.where || '—'}\n${x.msg}\n${x.stack || ''}`.trim();

// Errores fuera de una pantalla (promesas, temporizadores): se anotan sin interrumpir.
export function watchErrors() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => { if (e && e.error) logError(e.error, 'fuera de una pantalla'); });
  window.addEventListener('unhandledrejection', (e) => { const r = e && e.reason; if (r && (r.stack || r.message)) logError(r, 'tarea en segundo plano'); });
}

export async function downloadBackup() {
  return saveFile(`astra-copia-${dayKey()}.json`, exportData());
}

export function Guard({ children, where = '' }) {
  const [err, reset] = useErrorBoundary((e) => { logError(e, where); });
  if (err) return <Crash error={err} reset={reset} />;
  return children;
}

function Crash({ error, reset }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const info = { at: Date.now(), where: typeof location !== 'undefined' ? location.hash : '', msg: String((error && error.message) || error), stack: String((error && error.stack) || '').split('\n').slice(0, 8).join('\n'), v: APP_VERSION };
  const copy = async () => { try { await navigator.clipboard.writeText(errorText(info)); setCopied(true); } catch { setCopied(false); } };
  const home = () => { go('/', { replace: true }); setTimeout(reset, 0); };
  const settings = () => { go('/ajustes', { replace: true }); setTimeout(reset, 0); };
  return (
    <main class="screen no-nav" role="alert">
      <section class="stack-sm" style={{ paddingTop: 24 }}>
        <span class="tile" style={{ background: 'var(--vit-soft)', color: 'var(--vit-ink)' }}><Icon name="info" /></span>
        <h1 class="h1">Esta pantalla tuvo un problema</h1>
        <p class="lead">Tus datos están a salvo: este error no los borra. Puedes volver a Hoy o bajar una copia por si acaso.</p>
      </section>
      <div class="stack-sm">
        <button type="button" class="btn block" onClick={home}><Icon name="home" size={18} />Volver a Hoy</button>
        <button type="button" class="btn block soft" onClick={async () => { setSaved(await downloadBackup()); }}><Icon name="download" size={18} />{saved ? 'Copia descargada' : 'Descargar una copia de mis datos'}</button>
        <button type="button" class="btn block ghost" onClick={settings}><Icon name="gear" size={18} />Ir a Ajustes</button>
      </div>
      <section class="card tight">
        <span class="small semi">Detalle del error</span>
        <span class="tiny muted" style={{ fontFamily: 'ui-monospace, monospace', wordBreak: 'break-word' }}>{info.msg}</span>
        <button type="button" class="link-btn" style={{ alignSelf: 'flex-start' }} onClick={copy}><Icon name="copy" size={16} />{copied ? 'Copiado' : 'Copiar el detalle para reportarlo'}</button>
      </section>
    </main>
  );
}

// Aviso fijo cuando lo último no se pudo guardar en ningún lado (antes pasaba en silencio).
export function SaveAlert() {
  const st = useStorage();
  const [busy, setBusy] = useState(false);
  if (!st.failing) return null;
  // Navegador que no deja guardar nada desde el principio (por ejemplo, una vista previa): se avisa sin alarma.
  if (!st.ls && st.idb === false) {
    return (
      <div class="save-alert" role="status">
        <span class="row-top" style={{ gap: 10 }}><Icon name="info" size={18} /><span>Aquí el navegador no deja guardar datos: lo que hagas se pierde al cerrar. Abre Astra desde su enlace o instálala para guardar tu progreso.</span></span>
      </div>
    );
  }
  return (
    <div class="save-alert" role="alert">
      <span class="row-top" style={{ gap: 10 }}><Icon name="info" size={18} /><span>No se pudieron guardar tus últimos cambios en este teléfono. Descarga una copia para no perderlos.</span></span>
      <span class="row" style={{ gap: 6, paddingLeft: 28 }}>
        <button type="button" class="btn xs" onClick={() => downloadBackup()}><Icon name="download" size={15} />Descargar copia</button>
        <button type="button" class="btn xs ghost" disabled={busy} onClick={async () => { setBusy(true); await retrySave(); setBusy(false); }}>Reintentar</button>
      </span>
    </div>
  );
}

// Lo último quedó en la base de datos del navegador y no se pudo abrir: no se empieza de cero.
export function Blocked({ onImport }) {
  const st = useStorage();
  return (
    <main class="screen no-nav" role="alert">
      <section class="stack-sm" style={{ paddingTop: 24 }}>
        <span class="tile" style={{ background: 'var(--vit-soft)', color: 'var(--vit-ink)' }}><Icon name="info" /></span>
        <h1 class="h1">No pude abrir tus datos</h1>
        <p class="lead">Tus datos siguen guardados en este teléfono, pero el navegador no los entregó a tiempo. No voy a guardar nada encima. Casi siempre se arregla al reintentar.</p>
      </section>
      <div class="stack-sm">
        <button type="button" class="btn block" onClick={() => location.reload()}><Icon name="sync" size={18} />Reintentar</button>
        {st.stale && <button type="button" class="btn block soft" onClick={useStaleCopy}>{st.staleAt > 0 ? `Seguir con la copia rápida del ${fmtDay(dayKey(new Date(st.staleAt)), { weekdayName: false })}` : 'Seguir con la copia rápida de este teléfono'}</button>}
        {st.stale && <span class="small muted">La copia rápida puede no tener lo último que hiciste.</span>}
        <label class="btn block ghost" style={{ position: 'relative' }}><Icon name="upload" size={18} />Recuperar desde un archivo de copia<input type="file" accept="application/json,.json" onChange={onImport} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} /></label>
      </div>
      <p class="small muted">Si tienes Drive conectado, tus datos también están a salvo ahí.</p>
    </main>
  );
}

export { ready };
