import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { TopBar, TChip, toast, ask } from '../ui/kit.jsx';
import { act, useApp, exportData, importData, resetAll, applyTheme, storage } from '../app/store.js';
import { go } from '../app/router.js';
import { env } from '../app/env.js';
import { installState, promptInstall } from '../app/pwa.js';
import { AREAS } from '../game/content.js';
import { className } from '../game/logic.js';
import { aiProvider, providerLabel } from '../ai/ai.js';

const MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (recomendado)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (más rápido y económico)' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (máxima precisión)' },
];

export function Settings() {
  const s = useApp();
  const [name, setName] = useState(s.profile.name);
  const [prov, setProv] = useState(undefined);
  const [inst, setInst] = useState(installState());
  const set = (fn) => act((st) => fn(st));

  useEffect(() => { aiProvider(s.settings, { needImages: true }).then(setProv).catch(() => setProv(null)); }, [s.settings.aiMode, s.settings.aiKey, s.settings.serverUrl, s.settings.serverToken]);
  useEffect(() => {
    const f = () => setInst(installState());
    window.addEventListener('astra-install', f);
    return () => window.removeEventListener('astra-install', f);
  }, []);

  const togglePath = (k) => set((st) => {
    const keys = st.profile.classKeys;
    st.profile.classKeys = keys.includes(k) ? keys.filter((x) => x !== k) : keys.length >= 2 ? [keys[1], k] : [...keys, k];
  });

  const download = async () => {
    const name = `astra-copia-${s.energy.day}.json`;
    const data = exportData();
    // Dentro de Claude, las descargas pasan por su propio aviso.
    if (window.claude && typeof window.claude.use === 'function') {
      const dl = await Promise.resolve(window.claude.use('downloads')).catch(() => null);
      if (dl) {
        try {
          const r = await dl.save({ filename: name, data });
          if (r && r.status === 'saved') toast('Copia descargada', 'download');
        } catch { /* la persona canceló o esta vista no permite descargas */ }
        return;
      }
    }
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Copia descargada', 'download');
  };
  const onImport = async (e) => {
    const f = e.currentTarget.files && e.currentTarget.files[0];
    if (!f) return;
    try { importData(await f.text()); toast('Copia recuperada', 'check'); } catch (err) { toast(err.message || 'No se pudo leer la copia', 'info'); }
  };

  const mode = s.settings.aiMode;
  return (
    <main class="screen no-nav">
      <TopBar backTo="/personaje" title="Ajustes" />
      {!storage.ok && <div class="note tone-vit"><Icon name="info" size={18} /><span>Este navegador no deja guardar datos. Tus avances se perderán al cerrar.</span></div>}

      <section class="card" aria-label="Perfil">
        <h2 class="h2">Perfil</h2>
        <div class="field"><label for="nm">Nombre</label><input id="nm" class="input" value={name} maxLength={30} onInput={(e) => setName(e.currentTarget.value)} onBlur={() => set((st) => { st.profile.name = name.trim() || st.profile.name; })} /></div>
        <div class="stack-sm"><span class="label">Meta de sueño</span><div class="chips">{[6, 7, 8, 9].map((h) => <TChip key={h} sm on={s.profile.sleepGoal === h} onClick={() => set((st) => { st.profile.sleepGoal = h; })}>{h} horas</TChip>)}</div></div>
      </section>

      <section class="card" aria-label="Clase">
        <div class="stack-xs"><h2 class="h2">Tu clase: {className(s.profile.classKeys)}</h2><span class="small muted">Hasta dos caminos. Sus atributos ganan +20 % de XP.</span></div>
        <div class="chips">{AREAS.map((a) => <TChip key={a.key} sm on={s.profile.classKeys.includes(a.key)} icon={a.icon} color={`var(--${a.key})`} onClick={() => togglePath(a.key)}>{a.cls}</TChip>)}</div>
      </section>

      <section class="card" aria-label="Tema">
        <h2 class="h2">Tema</h2>
        <div class="chips">
          {[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([k, l]) => <TChip key={k} sm on={s.settings.theme === k} onClick={() => { set((st) => { st.settings.theme = k; }); applyTheme(k); }}>{l}</TChip>)}
        </div>
      </section>

      <section class="card" aria-label="Lectura con IA">
        <div class="stack-xs"><h2 class="h2">Lectura con IA</h2><span class="small muted">Para leer recibos y frases difíciles. Estado: <b>{prov === undefined ? 'revisando…' : providerLabel(prov)}</b>.</span></div>
        <div class="chips">
          {[['auto', 'Automático'], ['server', 'Servidor propio'], ['key', 'Clave en este teléfono'], ['off', 'Desactivada']].map(([k, l]) => <TChip key={k} sm on={mode === k} onClick={() => set((st) => { st.settings.aiMode = k; })}>{l}</TChip>)}
        </div>
        {(mode === 'auto' || mode === 'server') && (
          <div class="stack">
            <div class="field"><label for="su">Dirección de tu servidor</label><input id="su" class="input" inputMode="url" value={s.settings.serverUrl} placeholder="https://astra-lector.tu-usuario.workers.dev" onChange={(e) => set((st) => { st.settings.serverUrl = e.currentTarget.value.trim(); })} /></div>
            <div class="field"><label for="st">Token del servidor</label><input id="st" class="input" type="password" autoComplete="off" value={s.settings.serverToken} onChange={(e) => set((st) => { st.settings.serverToken = e.currentTarget.value.trim(); })} /></div>
            <span class="small muted">Recomendado para uso diario: tu clave de API queda en el servidor y no en el teléfono. Las instrucciones están en la carpeta «server» del proyecto.</span>
          </div>
        )}
        {(mode === 'auto' || mode === 'key') && (
          <div class="stack">
            <div class="field"><label for="ak">Clave de API de Claude</label><input id="ak" class="input" type="password" autoComplete="off" value={s.settings.aiKey} placeholder="sk-ant-…" onChange={(e) => set((st) => { st.settings.aiKey = e.currentTarget.value.trim(); })} /></div>
            <div class="field"><label for="am">Modelo</label>
              <select id="am" class="input" value={s.settings.aiModel} onChange={(e) => set((st) => { st.settings.aiModel = e.currentTarget.value; })}>
                {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <span class="small muted">La clave se guarda solo en este navegador y no se incluye en tus copias. Úsala solo en un teléfono que sea tuyo.</span>
          </div>
        )}
        <span class="small muted">La IA solo recibe la foto del recibo o el texto que decides enviar, cuando tocas el botón. La foto no se guarda.</span>
      </section>

      {(inst.canPrompt || (!inst.installed && env.canInstall)) && (
        <section class="card" aria-label="Instalar">
          <h2 class="h2">Instalar como app</h2>
          {inst.canPrompt ? <button type="button" class="btn sm" style={{ alignSelf: 'flex-start' }} onClick={promptInstall}><Icon name="download" size={18} />Instalar Astra</button>
            : <span class="small muted">{env.isIOS ? 'En Safari: botón Compartir → «Agregar a inicio».' : 'En Chrome: menú ⋮ → «Instalar app» o «Agregar a la pantalla de inicio».'}</span>}
        </section>
      )}

      <section class="card" aria-label="Tus datos">
        <h2 class="h2">Tus datos</h2>
        <span class="small muted">Todo vive en este navegador. Descarga una copia para no perder tu progreso o para pasarlo a otro teléfono.</span>
        <div class="row wrap">
          <button type="button" class="btn sm" onClick={download}><Icon name="download" size={18} />Descargar copia</button>
          <label class="btn sm ghost" style={{ position: 'relative' }}><Icon name="upload" size={18} />Recuperar copia<input type="file" accept="application/json,.json" onChange={onImport} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} /></label>
        </div>
        <button type="button" class="link-btn" style={{ color: 'var(--vit-ink)', alignSelf: 'flex-start' }} onClick={async () => { if (await ask('¿Borrar todo tu progreso? Se borran tu personaje, misiones y registros. No se puede deshacer.', { ok: 'Borrar todo', danger: true })) { resetAll(); go('/', { replace: true }); } }}><Icon name="trash" size={16} />Borrar todo y empezar de cero</button>
      </section>

      <section class="card" aria-label="Privacidad">
        <h2 class="h2">Privacidad</h2>
        <p class="small muted">Astra no tiene cuentas ni servidores propios. Tus misiones, gastos, ánimo y notas se guardan solo en este navegador. Nada se envía a otro lugar, salvo la foto de un recibo o una frase cuando pides leerla con IA, y solo al proveedor que tú configuras.</p>
      </section>
      <p class="tiny muted" style={{ textAlign: 'center' }}>Astra 1.0 · versión web instalable</p>
    </main>
  );
}
