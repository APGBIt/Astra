// Ajustes → Tus datos: dónde están, cuánto ocupan, si el navegador promete no borrarlos,
// puntos de restauración, copia en archivo y errores recientes.
import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { toast, ask } from '../ui/kit.jsx';
import { act, useApp, useStorage, exportData, importBackup, readBackup, summaryOf, resetAll, restoreSnap, snapshotNow, storageEstimate, askPersist, dataSize, migrate } from '../app/store.js';
import { listSnaps, readSnap, SNAP_REASONS } from '../app/snapshots.js';
import { saveFile } from '../app/files.js';
import { recentErrors, clearErrors, errorText, downloadBackup } from '../ui/guard.jsx';
import { go } from '../app/router.js';
import { env } from '../app/env.js';
import { dayKey, fmtDay } from '../app/dates.js';

export const fmtBytes = (n) => {
  const v = Number(n) || 0;
  if (v < 1024 * 1024) return `${Math.max(1, Math.round(v / 1024))} KB`;
  return `${(v / (1024 * 1024)).toFixed(v < 10 * 1024 * 1024 ? 1 : 0)} MB`;
};
const pad = (n) => String(n).padStart(2, '0');
export const fmtWhen = (at) => {
  const d = new Date(at);
  const h = d.getHours();
  return `${fmtDay(dayKey(d), { weekdayName: false })}, ${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? 'a. m.' : 'p. m.'}`;
};
// «Nivel 12 · 340 movimientos · 85 check-ins»
export function summaryText(m) {
  if (!m) return '';
  const parts = [`Nivel ${m.level}`];
  if (m.tx) parts.push(`${m.tx.toLocaleString('en-US')} ${m.tx === 1 ? 'movimiento' : 'movimientos'}`);
  if (m.todos) parts.push(`${m.todos.toLocaleString('en-US')} ${m.todos === 1 ? 'pendiente' : 'pendientes'}`);
  if (m.moods) parts.push(`${m.moods.toLocaleString('en-US')} check-ins`);
  if (m.last) parts.push(`último registro: ${fmtDay(m.last, { weekdayName: false })}`);
  return parts.join(' · ');
}

export function DataCard() {
  const st = useStorage();
  const [est, setEst] = useState(null);
  useEffect(() => { storageEstimate().then(setEst); if (st.persisted == null) askPersist(); }, []);
  const size = dataSize();
  const where = st.idb ? 'en la base de datos del navegador' : st.ls ? 'en el almacenamiento del navegador' : null;
  return (
    <section class="card" aria-label="Tus datos en este teléfono">
      <div class="stack-xs">
        <h2 class="h2">Tus datos en este teléfono</h2>
        <span class="small muted">{where ? `Se guardan ${where}, solo aquí` : 'Este navegador no deja guardar datos: lo que hagas se pierde al cerrar.'}{where && (st.lsFull ? '. La copia rápida ya no cabe en el espacio pequeño del navegador; no pasa nada, la base de datos no tiene ese tope.' : '.')}</span>
      </div>
      <div class="panel stack-xs">
        <span class="small"><b>Tamaño:</b> tus datos ocupan unos {fmtBytes(size)}{est && est.usage > size ? `; con fotos y copias, ${fmtBytes(est.usage)} en total` : ''}.</span>
        {st.persisted === true && <span class="small"><b>Protegidos:</b> el navegador prometió no borrarlos para hacer espacio.</span>}
        {st.persisted === false && <span class="small"><b>Sin protección:</b> si el teléfono se queda sin espacio, el navegador podría borrarlos. Instalar Astra en la pantalla de inicio y usarla seguido ayuda a que los proteja; conectar Drive te da una copia fuera del teléfono.</span>}
      </div>
      {env.isIOS && !env.standalone && !env.framed && (
        <div class="note tone-vit"><Icon name="info" size={18} /><span>En iPhone, Safari borra los datos de las páginas que no abres en 7 días. Agrega Astra a tu pantalla de inicio (botón Compartir → «Agregar a inicio») y ábrela desde ahí, o conecta tu Drive.</span></div>
      )}
      {!st.ok && <div class="note tone-vit"><Icon name="info" size={18} /><span>Lo último no se pudo guardar. Descarga una copia en archivo ahora.</span></div>}
    </section>
  );
}

export function RestorePoints() {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState('');
  const load = () => listSnaps().then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const back = async (x) => {
    if (!await ask(`¿Volver a como estaban tus datos el ${fmtWhen(x.at)}? Lo de ahora se reemplaza. Antes guardo un punto con lo de ahora, por si te arrepientes.`, { ok: 'Volver a este punto', danger: true })) return;
    setBusy(x.id);
    try { await restoreSnap(x.id); toast('Listo: volviste a ese punto', 'undo'); go('/', { replace: true }); } catch (e) { toast((e && e.message) || 'No se pudo abrir ese punto', 'info'); } finally { setBusy(''); load(); }
  };
  const download = async (x) => {
    setBusy(x.id);
    try {
      const data = migrate(JSON.parse(await readSnap(x.id)));
      await saveFile(`astra-punto-${x.day}.json`, exportData(data));
    } catch (e) { toast((e && e.message) || 'No se pudo descargar', 'info'); } finally { setBusy(''); }
  };
  const now = async () => {
    setBusy('now');
    await snapshotNow('manual');
    setBusy('');
    toast('Punto de restauración guardado', 'check');
    load();
  };
  return (
    <section class="card" aria-label="Puntos de restauración">
      <div class="stack-xs">
        <h2 class="h2">Puntos de restauración</h2>
        <span class="small muted">Astra guarda una copia de tus datos al empezar cada día y antes de recuperar una copia, borrar todo o juntar con Drive. Se quedan los últimos 7 días, uno por semana del mes anterior y los de antes de cada cambio grande (30 días). Viven en este teléfono.</span>
      </div>
      {list === null ? <span class="small muted">Buscando…</span> : !list.length ? <span class="small muted">Todavía no hay puntos. El primero se guarda hoy.</span> : (
        <div class="stack-sm">
          {list.map((x) => (
            <div key={x.id} class="panel stack-xs">
              <span class="small semi">{SNAP_REASONS[x.reason] || 'Copia'} · {fmtWhen(x.at)}</span>
              {x.summary && <span class="tiny muted">{summaryText(x.summary)}</span>}
              <span class="row wrap" style={{ gap: 6 }}>
                <button type="button" class="btn xs" disabled={!!busy} onClick={() => back(x)}><Icon name="undo" size={15} />Volver aquí</button>
                <button type="button" class="btn xs ghost" disabled={!!busy} onClick={() => download(x)}><Icon name="download" size={15} />Descargar</button>
              </span>
            </div>
          ))}
        </div>
      )}
      <button type="button" class="link-btn" style={{ alignSelf: 'flex-start' }} disabled={!!busy} onClick={now}><Icon name="plus" size={16} />Guardar un punto ahora</button>
    </section>
  );
}

export function BackupCard() {
  const s = useApp();
  const download = async () => {
    if (await downloadBackup()) { act((st, t) => { st.settings.lastBackup = t; }); toast('Copia descargada', 'download'); }
  };
  const onImport = async (e) => {
    const input = e.currentTarget;
    const f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    let b;
    try { b = readBackup(await f.text()); } catch (err) { toast(err.message || 'No se pudo leer la copia', 'info'); return; }
    const mine = summaryOf(s);
    const when = b.exportedAt ? fmtWhen(Date.parse(b.exportedAt)) : 'fecha desconocida';
    const msg = `¿Reemplazar tus datos por esta copia? La copia es del ${when}: ${summaryText(b.summary)}. Ahora tienes: ${summaryText(mine)}. Antes guardo un punto de restauración con lo de ahora.`;
    if (!await ask(msg, { ok: 'Reemplazar por la copia', danger: true })) return;
    try { importBackup(b.data); toast('Copia recuperada', 'check'); } catch (err) { toast(err.message || 'No se pudo leer la copia', 'info'); }
  };
  return (
    <section class="card" aria-label="Copia en archivo">
      <h2 class="h2">Copia en archivo</h2>
      <span class="small muted">Para guardarla fuera del teléfono o pasarla a otro equipo. Incluye tu expediente: guárdala en un lugar seguro. No incluye las fotos (esas viajan con Drive).</span>
      <span class="small strong">{s.settings.lastBackup ? `Última copia: ${fmtDay(s.settings.lastBackup, { weekdayName: false })}` : 'Todavía no has descargado una copia.'}</span>
      <div class="row wrap">
        <button type="button" class="btn sm" onClick={download}><Icon name="download" size={18} />Descargar copia</button>
        <label class="btn sm ghost" style={{ position: 'relative' }}><Icon name="upload" size={18} />Recuperar copia<input type="file" accept="application/json,.json" onChange={onImport} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} /></label>
      </div>
      <button type="button" class="link-btn" style={{ color: 'var(--vit-ink)', alignSelf: 'flex-start' }} onClick={async () => { if (await ask('¿Borrar todo tu progreso? Se borran tu personaje, misiones y registros de este teléfono. Antes guardo un punto de restauración, por si te arrepientes.', { ok: 'Borrar todo', danger: true })) { resetAll(); go('/', { replace: true }); } }}><Icon name="trash" size={16} />Borrar todo y empezar de cero</button>
    </section>
  );
}

export function ErrorsCard() {
  const [list, setList] = useState(recentErrors());
  if (!list.length) return null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(list.map(errorText).join('\n\n')); toast('Detalle copiado', 'copy'); } catch { toast('No se pudo copiar', 'info'); }
  };
  return (
    <section class="card" aria-label="Errores recientes">
      <div class="stack-xs">
        <h2 class="h2">Errores recientes</h2>
        <span class="small muted">La app anotó {list.length === 1 ? 'un error' : `${list.length} errores`} en este teléfono. Tus datos no se tocaron. Si algo no funciona bien, copia el detalle y compártelo para arreglarlo.</span>
      </div>
      {list.slice(0, 3).map((x) => <span key={x.at} class="tiny muted" style={{ fontFamily: 'ui-monospace, monospace', wordBreak: 'break-word' }}>{fmtWhen(x.at)} · {x.where || '—'} · {x.msg}</span>)}
      <span class="row wrap" style={{ gap: 6 }}>
        <button type="button" class="btn xs soft" onClick={copy}><Icon name="copy" size={15} />Copiar el detalle</button>
        <button type="button" class="btn xs ghost" onClick={() => { clearErrors(); setList([]); }}>Borrar la lista</button>
      </span>
    </section>
  );
}
