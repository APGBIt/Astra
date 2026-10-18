import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { TopBar, Switch, toast, ask } from '../ui/kit.jsx';
import { useApp } from '../app/store.js';
import { HOME_URL } from '../app/config.js';
import { env } from '../app/env.js';
import {
  useSync, syncNow, resolveFirst, connectScript, disconnect, setAuto, linkCode, parseLinkCode, normalizeScriptUrl,
} from '../app/sync.js';
import { googleClientId, setGoogleClientId, validClientId, startGoogleLogin, googleToken, redirectUri } from '../app/google.js';
import { CONNECTOR_CODE } from '../app/connector.js';
import { saveFile } from '../app/files.js';

// Sincronización con Drive: cada persona conecta SU Drive. Astra sigue funcionando sin internet.

const PROVIDER = { script: 'Conector propio', google: 'Google Drive' };

export function ago(ts) {
  if (!ts) return 'nunca';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'hace un momento';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

function statusLine(st) {
  if (!st.provider) return { icon: 'cloudoff', tone: 'muted', text: 'Tus datos están solo en este teléfono.' };
  if (st.phase === 'syncing') return { icon: 'sync', spin: true, tone: 'ink', text: 'Sincronizando…' };
  if (st.phase === 'offline') return { icon: 'cloudoff', tone: 'muted', text: st.dirty ? 'Sin conexión. Tus cambios se guardan aquí y se suben cuando vuelva.' : 'Sin conexión. Todo sigue funcionando.' };
  if (st.phase === 'auth') return { icon: 'lock', tone: 'xp', text: st.msg || 'Inicia sesión con Google para seguir sincronizando.' };
  if (st.phase === 'error') return { icon: 'info', tone: 'vit', text: st.msg || 'No se pudo sincronizar.' };
  if (st.phase === 'choose') return { icon: 'info', tone: 'xp', text: 'Ya hay datos de Astra en este Drive. Elige qué hacer.' };
  if (st.dirty) return { icon: 'cloud', tone: 'ink', text: `Hay cambios por subir · última vez ${ago(st.lastSync)}` };
  return { icon: 'cloud', tone: 'good', text: `Al día · ${ago(st.lastSync)}` };
}

// Ícono pequeño en Hoy (solo si hay un conector).
export function SyncBadge() {
  const st = useSync();
  if (!st.provider) return null;
  const line = statusLine(st);
  const icon = st.phase === 'syncing' ? 'sync' : st.phase === 'offline' || st.phase === 'error' || st.phase === 'auth' ? 'cloudoff' : 'cloud';
  return (
    <a href="#/sincronizar" class={`icon-btn${st.dirty && st.phase !== 'syncing' ? ' sync-dot' : ''}`} aria-label={`Sincronización: ${line.text}`} style={{ width: 40, height: 40 }}>
      <Icon name={icon} size={20} spin={st.phase === 'syncing'} />
    </a>
  );
}

// Tarjeta en Ajustes.
export function SyncCard() {
  const st = useSync();
  const line = statusLine(st);
  return (
    <a href="#/sincronizar" class="card tight" style={{ textDecoration: 'none', color: 'var(--ink)' }} aria-label="Sincronización con Drive">
      <div class="row">
        <span class="tile" style={{ background: 'var(--ene-soft)', color: 'var(--ene)' }}><Icon name={st.provider ? 'cloud' : 'cloudoff'} /></span>
        <span class="stack-xs grow"><span class="strong">Sincronización con Drive</span><span class="small muted">{st.provider ? `${PROVIDER[st.provider]}${st.account ? ` · ${st.account}` : ''}` : 'Guarda tus datos y fotos en tu propio Drive'}</span></span>
        <Icon name="right" size={18} />
      </div>
      {st.provider && <span class="small semi" style={{ color: `var(--${line.tone === 'muted' ? 'muted' : line.tone === 'ink' ? 'ink' : `${line.tone}-ink`})` }}>{line.text}</span>}
    </a>
  );
}

export function SyncScreen() {
  const s = useApp();
  const st = useSync();
  // Si «Conectar con Google» ya está activado, es lo primero que se ofrece (lo más fácil para cualquiera).
  const googleReady = validClientId(googleClientId()) && !env.framed;
  const [open, setOpen] = useState(st.provider ? null : googleReady ? 'google' : 'script');
  const line = statusLine(st);
  const tone = line.tone === 'muted' ? 'var(--muted)' : line.tone === 'ink' ? 'var(--ink)' : `var(--${line.tone}-ink)`;
  const photos = Object.values(s.photos || {}).filter((p) => !p.deleted);
  const pendingPhotos = photos.filter((p) => !p.remote).length;
  const now = async () => { await syncNow({ manual: true }); };
  const google = (
    <Connector id="google" open={open} setOpen={setOpen} icon="user" title={googleReady ? 'Conectar con Google: lo más fácil' : 'Conectar con Google'}
      sub={googleReady ? 'Inicias sesión con tu cuenta y Astra crea su carpeta en tu Drive. Solo puede ver lo que Astra crea.' : 'Inicias sesión con tu cuenta, sin instalar nada. Antes, quien administra Astra lo activa una sola vez.'}>
      <GoogleSetup />
    </Connector>
  );
  return (
    <main class="screen no-nav">
      <TopBar backTo="/ajustes" />
      <section class="stack-sm">
        <span class="eyebrow" style={{ color: 'var(--ene-ink)' }}>Sincronización</span>
        <h1 class="h1">Tus datos, en tu Drive</h1>
        <p class="lead">Astra funciona sin internet. Cuando hay conexión, guarda una copia en tu propio Google Drive y junta los cambios de tus equipos. Cada persona conecta su Drive: nadie más ve tus datos.</p>
      </section>

      <section class="card" aria-label="Estado">
        <div class="row" style={{ gap: 12 }}>
          <span class="tile" style={{ background: st.provider ? 'var(--ene-soft)' : 'var(--soft)', color: st.provider ? 'var(--ene)' : 'var(--muted)' }}>
            <Icon name={line.icon} spin={!!line.spin} />
          </span>
          <span class="stack-xs grow">
            <span class="strong">{st.provider ? PROVIDER[st.provider] : 'Sin conectar'}</span>
            {st.account && <span class="small muted">{st.account}</span>}
          </span>
        </div>
        <span class="small semi" style={{ color: tone }} role="status">{line.text}</span>
        {st.phase === 'choose' && <FirstChoice />}
        {st.provider && st.phase !== 'choose' && (
          <>
            {st.phase === 'auth'
              ? <button type="button" class="btn block" onClick={() => startGoogleLogin({ intent: 'resume', hint: st.account })}><Icon name="lock" size={18} />Iniciar sesión con Google</button>
              : <button type="button" class="btn block" disabled={st.phase === 'syncing'} onClick={now}><Icon name="sync" size={18} />Sincronizar ahora</button>}
            <label class="between-c panel" style={{ cursor: 'pointer' }}>
              <span class="stack-xs"><span class="semi">Automática</span><span class="small muted">Al abrir Astra, al volver la conexión y unos segundos después de cada cambio.{st.provider === 'google' ? ' Con Google, la sesión dura una hora; después basta un toque para seguir.' : ''}</span></span>
              <Switch checked={st.auto} onChange={setAuto} label="Sincronización automática" />
            </label>
            {st.folderUrl && <a class="btn soft block" href={st.folderUrl} target="_blank" rel="noopener"><Icon name="folder" size={18} />Abrir mi carpeta Astra en Drive</a>}
            <span class="small muted">Fotos: {photos.length}{pendingPhotos ? ` · ${pendingPhotos} por subir` : photos.length ? ' · todas en Drive' : ''}. Copia diaria en «Respaldos» (se guardan 30 días).</span>
          </>
        )}
      </section>

      {st.provider === 'script' && <LinkShare />}

      {!st.provider && (
        <>
          <h2 class="eyebrow">Elige cómo conectar tu Drive</h2>
          {googleReady && google}
          <Connector id="script" open={open} setOpen={setOpen} icon="folder" title="Conector propio: se sincroniza solo"
            sub="Un pequeño programa en tu Drive. Sincroniza solo, sin volver a iniciar sesión. Se instala una vez, mejor desde una computadora.">
            <ScriptSetup />
          </Connector>
          {!googleReady && google}
          <Connector id="code" open={open} setOpen={setOpen} icon="paste" title="Tengo un código de enlace"
            sub="Si ya conectaste Astra en otro equipo con el conector propio, pega aquí su código.">
            <LinkPaste />
          </Connector>
        </>
      )}

      <section class="card" aria-label="Qué se guarda">
        <h2 class="h2">Qué se guarda</h2>
        <ul class="steps">
          <li><b>Tus datos de Astra</b> (misiones, pendientes, finanzas, expediente, logros…) en <b>astra-datos.json</b>, dentro de tu carpeta «Astra».</li>
          <li><b>Una copia por día</b> en «Respaldos».</li>
          <li><b>Tus fotos</b> (recibos, documentos, evidencias) en «Fotos».</li>
          <li><b>Tablas para leer</b> (movimientos, pendientes, hogar, salud, logros, ánimo, posada y días) en la hoja «Base de datos de Astra» o en «Tablas». No incluyen tu expediente.</li>
          <li><b>No se suben</b> tus claves de IA.</li>
        </ul>
      </section>

      {st.provider && (
        <button type="button" class="link-btn" style={{ color: 'var(--vit-ink)', alignSelf: 'center' }} onClick={async () => {
          if (await ask('¿Desconectar este teléfono? Tus datos se quedan aquí y en tu Drive; solo deja de sincronizar.', { ok: 'Desconectar', danger: true })) { disconnect(); toast('Desconectado', 'cloudoff'); }
        }}><Icon name="cloudoff" size={16} />Desconectar este teléfono</button>
      )}
    </main>
  );
}

function Connector({ id, open, setOpen, icon, title, sub, children }) {
  const on = open === id;
  return (
    <section class="card" aria-label={title} style={{ gap: on ? 14 : 8 }}>
      <button type="button" class="row" style={{ gap: 12, textAlign: 'left', background: 'none', border: 0, padding: 0, color: 'var(--ink)', font: 'inherit', cursor: 'pointer' }} aria-expanded={on ? 'true' : 'false'} onClick={() => setOpen(on ? null : id)}>
        <span class="tile" style={{ background: 'var(--soft)', color: 'var(--ink)' }}><Icon name={icon} /></span>
        <span class="stack-xs grow"><span class="strong">{title}</span><span class="small muted">{sub}</span></span>
        <Icon name={on ? 'down' : 'right'} size={18} />
      </button>
      {on && children}
    </section>
  );
}

function ScriptSetup() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [showCode, setShowCode] = useState(false);
  const ok = !!normalizeScriptUrl(url);
  const copy = async () => {
    try { await navigator.clipboard.writeText(CONNECTOR_CODE); toast('Código copiado', 'copy'); } catch { setShowCode(true); }
  };
  const connect = async () => {
    setBusy(true); setErr('');
    try { await connectScript(url); toast('Conectado a tu Drive', 'cloud'); } catch (e) { setErr((e && e.message) || 'No se pudo conectar'); } finally { setBusy(false); }
  };
  return (
    <div class="stack">
      <ol class="steps">
        <li>En una computadora, entra a <b>script.google.com</b> con tu cuenta y toca <b>Nuevo proyecto</b>. (Si ya tienes la hoja «Base de datos de Astra», ábrela y ve a <b>Extensiones → Apps Script</b>.)</li>
        <li>Borra lo que hay, pega el <b>código del conector</b> y guarda. Lo copias con los botones de abajo o, en la computadora, desde <a href={`${HOME_URL}conector.gs/`} target="_blank" rel="noopener">{HOME_URL.replace(/^https:\/\//, '')}conector.gs</a>.</li>
        <li><b>Implementar → Nueva implementación → ⚙ Aplicación web.</b> Ejecutar como: <b>Yo</b>. Quién tiene acceso: <b>Cualquier usuario</b>.</li>
        <li><b>Autorizar acceso</b> → tu cuenta → <b>Configuración avanzada → Ir a… (no seguro) → Permitir</b>. Es tu propio script; Google avisa porque no lo ha revisado.</li>
        <li>Copia la <b>URL de la aplicación web</b> (termina en /exec) y pégala aquí.</li>
      </ol>
      <div class="row wrap" style={{ gap: 8 }}>
        <button type="button" class="btn sm soft" onClick={copy}><Icon name="copy" size={17} />Copiar el código</button>
        <button type="button" class="btn sm soft" onClick={() => saveFile('astra-conector.gs', CONNECTOR_CODE, 'text/plain')}><Icon name="download" size={17} />Descargar</button>
        <button type="button" class="btn sm ghost" onClick={() => setShowCode(!showCode)}>{showCode ? 'Ocultar código' : 'Ver código'}</button>
      </div>
      {showCode && <textarea class="input code-box" rows={8} readOnly value={CONNECTOR_CODE} onFocus={(e) => e.currentTarget.select()} aria-label="Código del conector" />}
      <div class="field">
        <label for="surl">Dirección del conector</label>
        <input id="surl" class="input" inputMode="url" value={url} placeholder="https://script.google.com/macros/s/…/exec" onInput={(e) => setUrl(e.currentTarget.value)} />
      </div>
      {err && <span class="small" style={{ color: 'var(--vit-ink)' }}>{err}</span>}
      <button type="button" class="btn block" disabled={!ok || busy} onClick={connect}><Icon name={busy ? 'sync' : 'cloud'} size={18} />{busy ? 'Conectando…' : 'Conectar'}</button>
    </div>
  );
}

function GoogleSetup() {
  const [cid, setCid] = useState(googleClientId());
  const [edit, setEdit] = useState(!googleClientId());
  const ready = validClientId(googleClientId());
  if (env.framed) return <span class="small muted">Para conectar con Google, abre Astra desde su enlace o desde la app instalada (aquí dentro no se puede iniciar sesión).</span>;
  return (
    <div class="stack">
      {ready ? (
        <button type="button" class="btn block" onClick={() => (googleToken() ? startGoogleLogin({ intent: 'connect', pick: false }) : startGoogleLogin({ intent: 'connect', pick: true }))}>
          <Icon name="user" size={18} />Conectar con Google
        </button>
      ) : (
        <span class="small muted">Este conector se activa una sola vez registrando Astra en Google Cloud (gratis). Después, cualquiera puede conectar su propio Drive con un toque.</span>
      )}
      <details>
        <summary class="small semi" style={{ cursor: 'pointer' }}>{ready ? 'Configuración de Google' : 'Cómo activarlo (para quien administra Astra)'}</summary>
        <ol class="steps" style={{ marginTop: 10 }}>
          <li>Entra a <b>console.cloud.google.com</b> y crea un proyecto («Astra»).</li>
          <li>Activa la <b>Google Drive API</b> (API y servicios → Biblioteca).</li>
          <li>En <b>Google Auth Platform</b>: nombre «Astra», tu correo y público <b>Externo</b>. En <b>Acceso a los datos</b> agrega el permiso <b>…/auth/drive.file</b> (solo los archivos que crea Astra).</li>
          <li>Decide <b>quién puede usarlo</b> (en <b>Público</b>): déjalo <b>en prueba</b> y agrega el correo de cada persona como usuario de prueba (hasta 100; Google les muestra un aviso antes de seguir), o toca <b>Publicar app</b> para que cualquiera con cuenta de Google conecte su propio Drive.</li>
          <li>En <b>Clientes → Crear cliente → Aplicación web</b>. Origen autorizado: <b>{location.origin}</b>. URI de redireccionamiento: <b>{redirectUri()}</b>.</li>
          <li>Copia el <b>ID de cliente</b> y pégalo aquí. Para que aparezca listo para todos, pásaselo a quien publica Astra.</li>
        </ol>
        {edit ? (
          <div class="stack-sm" style={{ marginTop: 10 }}>
            <input class="input" value={cid} placeholder="123…apps.googleusercontent.com" aria-label="ID de cliente de Google" onInput={(e) => setCid(e.currentTarget.value)} />
            <button type="button" class="btn sm" disabled={!validClientId(cid)} onClick={() => { setGoogleClientId(cid); setEdit(false); toast('ID de cliente guardado', 'check'); }}>Guardar</button>
          </div>
        ) : <button type="button" class="link-btn" style={{ marginTop: 6 }} onClick={() => setEdit(true)}>Cambiar el ID de cliente</button>}
      </details>
    </div>
  );
}

function LinkPaste() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const link = parseLinkCode(code);
  const connect = async () => {
    setBusy(true); setErr('');
    try { await connectScript(link.url, link.key); toast('Conectado a tu Drive', 'cloud'); } catch (e) { setErr((e && e.message) || 'No se pudo conectar'); } finally { setBusy(false); }
  };
  return (
    <div class="stack-sm">
      <textarea class="input" rows={3} value={code} placeholder="astra-enlace:…" aria-label="Código de enlace" onInput={(e) => setCode(e.currentTarget.value)} />
      {code && !link && <span class="small" style={{ color: 'var(--vit-ink)' }}>Ese código no es válido. Cópialo completo desde el otro equipo.</span>}
      {err && <span class="small" style={{ color: 'var(--vit-ink)' }}>{err}</span>}
      <button type="button" class="btn block" disabled={!link || busy} onClick={connect}><Icon name="cloud" size={18} />{busy ? 'Conectando…' : 'Conectar'}</button>
    </div>
  );
}

function LinkShare() {
  const [show, setShow] = useState(false);
  const code = linkCode();
  const copy = async () => { try { await navigator.clipboard.writeText(code); toast('Código de enlace copiado', 'copy'); } catch { setShow(true); } };
  return (
    <section class="card" aria-label="Otro equipo">
      <h2 class="h2">¿Otro equipo?</h2>
      <span class="small muted">En el otro teléfono o computadora: Ajustes → Sincronización → «Tengo un código de enlace». El código lleva la clave de tu conector: compártelo solo contigo mismo.</span>
      <div class="row wrap" style={{ gap: 8 }}>
        <button type="button" class="btn sm soft" onClick={copy}><Icon name="copy" size={17} />Copiar código de enlace</button>
        <button type="button" class="btn sm ghost" onClick={() => setShow(!show)}>{show ? 'Ocultar' : 'Ver'}</button>
      </div>
      {show && <textarea class="input code-box" rows={3} readOnly value={code} onFocus={(e) => e.currentTarget.select()} aria-label="Código de enlace" />}
    </section>
  );
}

function FirstChoice() {
  const [busy, setBusy] = useState(false);
  const pick = async (c) => { setBusy(true); await resolveFirst(c); setBusy(false); };
  return (
    <div class="stack-sm">
      <span class="small">En este teléfono también tienes datos. Nada se borra sin preguntarte:</span>
      <button type="button" class="btn block" disabled={busy} onClick={() => pick('merge')}><Icon name="sync" size={18} />Juntar los dos (recomendado)</button>
      <button type="button" class="btn ghost block" disabled={busy} onClick={async () => { if (await ask('¿Usar solo los datos de Drive en este teléfono? Lo de aquí se guarda aparte por si lo necesitas.', { ok: 'Usar los de Drive' })) pick('remote'); }}>Usar solo los de Drive</button>
    </div>
  );
}
