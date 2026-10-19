// Ajustes de las notificaciones en el teléfono (1.8).
import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Switch, toast } from '../ui/kit.jsx';
import { act, useApp, getState } from '../app/store.js';
import { env } from '../app/env.js';
import { NOTIFY_KINDS, buildReminders } from '../game/reminders.js';
import { notifyStatus, enableNotifications, testNotification, scheduleReminders, backgroundState } from '../app/notify.js';

const fmtAt = (ms) => {
  const d = new Date(ms);
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  return `${same ? 'Hoy' : 'Mañana'} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function NotifyCard() {
  const s = useApp();
  const cfg = s.settings.notify;
  const [st, setSt] = useState(notifyStatus());
  const [bg, setBg] = useState('no');
  useEffect(() => { backgroundState().then(setBg); }, [st]);
  const set = (fn) => act((x) => { fn(x.settings.notify); });
  const turnOn = async () => {
    const r = await enableNotifications();
    setSt(notifyStatus());
    if (r === 'granted') {
      set((n) => { n.on = true; });
      setTimeout(() => scheduleReminders(getState()), 50);
      toast('Notificaciones activadas', 'bell');
    } else if (r === 'denied') toast('El teléfono no dio permiso. Actívalo en los ajustes del navegador.', 'info');
  };
  const upcoming = cfg.on && st === 'granted' ? buildReminders(s, new Date()).slice(0, 4) : [];
  const blocked = st === 'framed' || st === 'unsupported' || st === 'ios';
  return (
    <section class="card" aria-label="Notificaciones">
      <div class="between-c" style={{ gap: 12 }}>
        <span class="stack-xs"><h2 class="h2">Notificaciones</h2><span class="small muted">Pagos que vencen, tus metas, misiones y el cierre del día.</span></span>
        {!blocked && st === 'granted' && <Switch checked={cfg.on} onChange={(v) => { set((n) => { n.on = v; }); setTimeout(() => scheduleReminders(getState()), 50); }} label="Notificaciones" />}
      </div>
      {st === 'framed' && <div class="note"><Icon name="info" size={18} /><span>Aquí dentro de Claude no se pueden mostrar notificaciones. Abre Astra desde su enlace (o instálala) y actívalas ahí.</span></div>}
      {st === 'ios' && <div class="note"><Icon name="info" size={18} /><span>En iPhone, primero agrega Astra a tu pantalla de inicio (Compartir → Agregar a inicio) y ábrela desde ahí.</span></div>}
      {st === 'unsupported' && <div class="note"><Icon name="info" size={18} /><span>Este navegador no permite notificaciones.</span></div>}
      {st === 'denied' && <div class="note tone-vit"><Icon name="info" size={18} /><span>Las bloqueaste para Astra. Para activarlas: en el navegador, toca el candado o los ajustes del sitio → Notificaciones → Permitir.</span></div>}
      {st === 'default' && <button type="button" class="btn block" onClick={turnOn}><Icon name="bell" size={20} />Activar notificaciones</button>}
      {st === 'granted' && !cfg.on && <button type="button" class="btn soft block" onClick={turnOn}><Icon name="bell" size={20} />Activar notificaciones</button>}
      {st === 'granted' && cfg.on && (
        <>
          <div class="stack-xs">
            {NOTIFY_KINDS.map((k) => (
              <label key={k.key} class="between-c" style={{ gap: 12, minHeight: 52, cursor: 'pointer' }}>
                <span class="stack-xs" style={{ gap: 0 }}><span class="semi">{k.label}</span><span class="tiny muted">{k.help}</span></span>
                <Switch checked={!!cfg.kinds[k.key]} onChange={(v) => set((n) => { n.kinds[k.key] = v; })} label={k.label} />
              </label>
            ))}
          </div>
          <div class="map-grid">
            {[['morning', 'Mañana'], ['afternoon', 'Tarde'], ['evening', 'Noche']].map(([k, l]) => (
              <div key={k} class="field"><label for={`nt-${k}`}>{l}</label><input id={`nt-${k}`} type="time" class="input" value={cfg[k]} onChange={(e) => { const v = e.currentTarget.value; if (v) set((n) => { n[k] = v; }); }} /></div>
            ))}
          </div>
          <div class="stack-xs">
            <span class="label">Horas de silencio</span>
            <div class="map-grid">
              <div class="field"><label for="nq1">Desde</label><input id="nq1" type="time" class="input" value={cfg.quietFrom} onChange={(e) => { const v = e.currentTarget.value; if (v) set((n) => { n.quietFrom = v; }); }} /></div>
              <div class="field"><label for="nq2">Hasta</label><input id="nq2" type="time" class="input" value={cfg.quietTo} onChange={(e) => { const v = e.currentTarget.value; if (v) set((n) => { n.quietTo = v; }); }} /></div>
            </div>
          </div>
          {upcoming.length > 0 && (
            <div class="panel stack-xs" aria-label="Próximos avisos">
              <span class="label">Próximos avisos</span>
              {upcoming.map((r) => <span key={r.id} class="small"><b class="tab-num">{fmtAt(r.at)}</b> · {r.title}</span>)}
            </div>
          )}
          <button type="button" class="btn sm soft" style={{ alignSelf: 'flex-start' }} onClick={async () => { if (!(await testNotification())) toast('No se pudo mostrar la notificación', 'info'); }}><Icon name="bell" size={16} />Probar</button>
          <span class="tiny muted">
            {bg === 'si'
              ? 'Llegan a su hora mientras Astra está abierta o en segundo plano. Con la app cerrada, Android la despierta cada pocas horas para mostrar lo que toca.'
              : env.isAndroid ? 'Llegan a su hora mientras Astra está abierta o en segundo plano. Instálala en tu pantalla de inicio para que también lleguen con la app cerrada (Android decide cada cuánto la despierta).' : 'Llegan a su hora mientras Astra está abierta o en segundo plano.'}
          </span>
        </>
      )}
    </section>
  );
}
