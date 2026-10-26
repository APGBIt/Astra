// Salud 1.14: plan de la semana (fuerza, cardio, movilidad), rutinas guiadas sin equipo y pausas activas.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Sheet, SheetHead, toast, areaColor, areaSoft, plural } from '../ui/kit.jsx';
import { act } from '../app/store.js';
import { vibrate } from '../app/env.js';
import { DAYS_SHORT } from '../app/dates.js';
import { bell, speak, hush, canSpeak, keepAwake, pref, setPref, unlockAudio } from '../app/sound.js';
import { ROUTINES, ROUTINE, routineMinutes, routineSeconds, finishRoutine, PLAN_KINDS, PLAN_KIND, DEFAULT_EX_PLAN, exPlan, setExPlan, planWeek } from '../game/routines.js';

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const mmss = (sec) => { const v = Math.max(0, Math.ceil(sec)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };

// ---------- Tarjeta: tu semana de movimiento ----------

export function TrainingCard({ s, today, onPlay }) {
  const [sheet, setSheet] = useState(null);
  const wk = planWeek(s, today);
  const breaks = (s.health[today] || {}).breaks || 0;
  const todayK = wk.todayKind ? PLAN_KIND[wk.todayKind] : null;
  return (
    <section class="card" aria-label="Tu semana de movimiento">
      <div class="between-c"><h2 class="h2">Tu plan de movimiento</h2><button type="button" class="link-btn" onClick={() => setSheet('plan')}><Icon name="edit" size={15} />{wk.planned ? 'Cambiar' : 'Armar'}</button></div>
      {wk.planned ? (
        <>
          <div class="daypick" role="list" aria-label="Esta semana">
            {wk.days.map((d) => {
              const k = d.kind ? PLAN_KIND[d.kind] : null;
              return (
                <span key={d.day} role="listitem" class="stack-xs" style={{ alignItems: 'center', gap: 4, padding: '6px 0', borderRadius: 12, border: d.today ? '1.5px solid var(--ink)' : '1.5px solid transparent' }}
                  aria-label={`${DAYS_SHORT[d.wd]}: ${k ? `${k.label}${d.done ? ', hecho' : d.future ? '' : ', pendiente'}` : 'libre'}`}>
                  <span class="tiny muted semi">{DAYS_SHORT[d.wd]}</span>
                  <span style={{ width: 30, height: 30, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
                    background: d.done ? areaColor('salud') : k ? areaSoft('salud') : 'var(--soft)', color: d.done ? 'var(--on-ink)' : k ? 'var(--ink)' : 'var(--faint)' }}>
                    {d.done ? <Icon name="check" size={15} stroke={2.8} /> : k ? k.short : '·'}
                  </span>
                </span>
              );
            })}
          </div>
          <span class="small muted">{wk.done} de {wk.planned} días hechos esta semana · F fuerza · C caminar o cardio · M movilidad</span>
          {todayK && !wk.todayDone && (
            <button type="button" class="lrow" style={{ minHeight: 60 }} onClick={() => onPlay(todayK.routine)}>
              <span class="tile sm" style={{ background: areaSoft('salud'), color: areaColor('salud') }}><Icon name="play" size={16} fill /></span>
              <span class="stack-xs grow"><span class="strong">Hoy toca: {todayK.label.toLowerCase()}</span><span class="tiny muted semi">{ROUTINE[todayK.routine].title} · {routineMinutes(ROUTINE[todayK.routine])} min</span></span>
              <Icon name="right" size={18} />
            </button>
          )}
          {todayK && wk.todayDone && <div class="note tone-good"><Icon name="check" size={18} /><span>Hoy ya cumpliste: {todayK.label.toLowerCase()}.</span></div>}
        </>
      ) : (
        <span class="small muted">Elige qué días haces fuerza y qué días caminas. Te aviso el día que toca y marco lo cumplido.</span>
      )}
      <div class="row wrap" style={{ gap: 8 }}>
        <button type="button" class="btn sm soft" onClick={() => setSheet('routines')}><Icon name="dumbbell" size={17} />Rutinas guiadas</button>
        <button type="button" class="btn sm ghost" onClick={() => onPlay('pausa')}><Icon name="clock" size={17} />Pausa activa{breaks ? ` · ${breaks} hoy` : ''}</button>
      </div>
      <span class="tiny muted">La OMS recomienda reducir el tiempo sentado: cualquier movimiento suma. Una pausa de 5 minutos cada 1 o 2 horas ayuda.</span>
      {sheet === 'plan' && <PlanSheet s={s} onClose={() => setSheet(null)} />}
      {sheet === 'routines' && <RoutinesSheet onClose={() => setSheet(null)} onPlay={(id) => { setSheet(null); onPlay(id); }} />}
    </section>
  );
}

export function PlanSheet({ s, onClose }) {
  const cur = exPlan(s);
  const [plan, setPlan] = useState(() => (Object.keys(cur).length ? cur : { ...DEFAULT_EX_PLAN }));
  const cycle = (d) => {
    const order = [null, 'fuerza', 'cardio', 'movilidad'];
    const nx = order[(order.indexOf(plan[d] || null) + 1) % order.length];
    const p = { ...plan };
    if (nx) p[d] = nx; else delete p[d];
    setPlan(p);
  };
  const n = (k) => Object.values(plan).filter((v) => v === k).length;
  const save = () => { act((x) => setExPlan(x, plan)); toast('Plan guardado', 'dumbbell'); onClose(); };
  return (
    <Sheet onClose={onClose} label="Tu plan de movimiento">
      <SheetHead title="Tu plan de movimiento" onClose={onClose} />
      <span class="small muted">Toca cada día para cambiar: libre → fuerza → cardio → movilidad.</span>
      {DAY_ORDER.map((d) => {
        const k = plan[d] ? PLAN_KIND[plan[d]] : null;
        return (
          <button key={d} type="button" class="lrow" style={{ minHeight: 52 }} onClick={() => cycle(d)} aria-label={`${DAYS_SHORT[d]}: ${k ? k.label : 'libre'}. Tocar para cambiar`}>
            <span class="semi" style={{ width: 48 }}>{DAYS_SHORT[d]}</span>
            <span class="grow" style={{ color: k ? 'var(--ink)' : 'var(--faint)' }}>{k ? k.label : 'Libre'}</span>
            <Icon name="repeat" size={16} />
          </button>
        );
      })}
      <div class={`note ${n('fuerza') >= 2 ? 'tone-good' : 'tone-xp'}`}><Icon name={n('fuerza') >= 2 ? 'check' : 'info'} size={18} /><span>{n('fuerza') >= 2 ? `Fuerza ${n('fuerza')} días: cumples lo que pide la OMS (2 o más).` : 'La OMS pide fuerza al menos 2 días a la semana.'} {n('cardio') ? `Con ${n('cardio')} ${n('cardio') === 1 ? 'día' : 'días'} de 30 min de caminar rápido llegas a ${n('cardio') * 30} de los 150 minutos.` : ''}</span></div>
      <button type="button" class="btn block" onClick={save}><Icon name="check" size={20} />Guardar</button>
      {Object.keys(cur).length > 0 && <button type="button" class="link-btn" style={{ alignSelf: 'center' }} onClick={() => { act((x) => setExPlan(x, {})); onClose(); }}>Quitar el plan</button>}
    </Sheet>
  );
}

export function RoutinesSheet({ onClose, onPlay }) {
  return (
    <Sheet onClose={onClose} label="Rutinas guiadas">
      <SheetHead title="Rutinas guiadas" onClose={onClose} />
      {ROUTINES.map((r) => (
        <button key={r.id} type="button" class="lrow" style={{ minHeight: 72 }} onClick={() => onPlay(r.id)}>
          <span class="tile sm" style={{ background: areaSoft('salud'), color: areaColor('salud') }}><Icon name={r.icon} size={18} /></span>
          <span class="stack-xs grow" style={{ minWidth: 0 }}><span class="semi">{r.title} · {routineMinutes(r)} min</span><span class="tiny muted">{r.desc}</span></span>
          <Icon name="play" size={16} />
        </button>
      ))}
      <span class="tiny muted">Sin equipo y a tu ritmo. Si sientes dolor en el pecho, mareo o falta de aire fuera de lo normal, para y consulta a tu médico.</span>
    </Sheet>
  );
}

// ---------- Reproductor ----------

export function RoutinePlayer({ id, onClose }) {
  const r = ROUTINE[id];
  const total = routineSeconds(r);
  const starts = r.steps.reduce((a, x, i) => [...a, i ? a[i - 1] + r.steps[i - 1].sec : 0], []);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [voice, setVoice] = useState(() => pref('vozRutina', true) && canSpeak());
  const [done, setDone] = useState(null);
  const base = useRef({ start: Date.now(), acc: 0 });
  const said = useRef(-1);
  let si = starts.findIndex((v, i) => elapsed < v + r.steps[i].sec);
  if (si < 0) si = r.steps.length - 1;
  const step = r.steps[si];
  const left = starts[si] + step.sec - elapsed;
  const next = r.steps[si + 1];
  useEffect(() => { unlockAudio(); keepAwake(); return () => hush(); }, []);
  useEffect(() => {
    if (paused || done) return undefined;
    const t = setInterval(() => {
      const e = base.current.acc + (Date.now() - base.current.start) / 1000;
      if (e >= total) { finish(total); return; }
      setElapsed(e);
    }, 250);
    return () => clearInterval(t);
  }, [paused, done]);
  useEffect(() => {
    if (said.current === si || done) return;
    said.current = si;
    if (si > 0) { bell(1, 0.3); vibrate(60); }
    if (voice) speak(step.rest ? `Descansa.${next ? ` Sigue: ${next.name}.` : ''}` : `${step.name}. ${step.sec} segundos.`);
  }, [si, done]);
  function finish(sec) {
    hush();
    bell(2, 0.35);
    const res = act((x, t, ev) => finishRoutine(x, id, sec, t, ev));
    setDone({ sec, res });
  }
  const togglePause = () => {
    if (paused) { base.current.start = Date.now(); setPaused(false); }
    else { base.current.acc += (Date.now() - base.current.start) / 1000; setPaused(true); hush(); }
  };
  const skip = () => {
    const to = starts[si] + step.sec;
    base.current.acc = to; base.current.start = Date.now();
    setElapsed(to);
    if (to >= total) finish(total);
  };
  const stop = () => {
    if (done) { onClose(); return; }
    if (elapsed >= 60) finish(elapsed); else { hush(); onClose(); }
  };
  const toggleVoice = () => { const v = !voice; setVoice(v); setPref('vozRutina', v); if (!v) hush(); };
  const R = 110; const C = 2 * Math.PI * R;
  const frac = step.sec ? left / step.sec : 0;
  return (
    <div class="focus-full calm-player workout-player" role="dialog" aria-modal="true" aria-label={r.title}>
      <div class="cp-top">
        <span class="eyebrow" style={{ color: '#B9BBC2' }}>{r.title}{step.rounds ? ` · vuelta ${step.round} de ${step.rounds}` : ''}</span>
        <button type="button" class="cp-icon" aria-label={done ? 'Cerrar' : 'Terminar la rutina'} onClick={stop}><Icon name="close" size={22} /></button>
      </div>
      {done ? (
        <div class="stack center cp-done" style={{ display: 'flex' }}>
          <span class="cp-orb still wp-orb" aria-hidden="true" />
          <span class="h1" style={{ color: '#F2F2EF' }}>¡Listo! · {plural(Math.max(1, Math.round(done.sec / 60)), 'minuto', 'minutos')}</span>
          <span style={{ color: '#B9BBC2' }}>{r.break ? 'Pausa activa anotada. Cortar el tiempo sentado también es salud.' : `Se sumó a tu ejercicio de hoy${r.strength ? ' como día de fuerza' : ''}.`}</span>
          <button type="button" class="btn cp-btn" onClick={onClose}>Cerrar</button>
        </div>
      ) : (
        <>
          <div class="cp-stage">
            <div class="wp-timer" aria-hidden="true">
              <svg width="260" height="260" viewBox="0 0 260 260">
                <circle cx="130" cy="130" r={R} fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="12" />
                <circle cx="130" cy="130" r={R} fill="none" stroke={step.rest ? '#9EA1A8' : '#5FD3B0'} stroke-width="12" stroke-linecap="round"
                  stroke-dasharray={C} stroke-dashoffset={C * (1 - frac)} transform="rotate(-90 130 130)" style={{ transition: 'stroke-dashoffset 0.25s linear' }} />
              </svg>
              <span class="wp-time tab-num">{mmss(left)}</span>
            </div>
          </div>
          <div class="cp-text" aria-live="polite">
            <span class="h1" style={{ color: '#F2F2EF' }}>{step.name}</span>
            <span class="cp-sub">{step.how}</span>
            {next && <span class="tiny" style={{ color: '#9EA1A8' }}>Después: {next.name}</span>}
          </div>
          <div class="cp-bottom">
            <div class="cp-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((elapsed / total) * 100)} aria-label="Avance de la rutina"><i style={{ width: `${(elapsed / total) * 100}%`, background: '#5FD3B0' }} /></div>
            <span class="tiny tab-num" style={{ color: '#9EA1A8' }}>{mmss(total - elapsed)} restantes · paso {si + 1} de {r.steps.length}</span>
            <div class="row" style={{ gap: 10, justifyContent: 'center' }}>
              {canSpeak() && <button type="button" class="cp-icon" aria-pressed={voice ? 'true' : 'false'} aria-label={voice ? 'Quitar la voz' : 'Poner la voz'} onClick={toggleVoice}><Icon name={voice ? 'chat' : 'eyeoff'} size={20} /></button>}
              <button type="button" class="cp-main" aria-label={paused ? 'Continuar' : 'Pausa'} onClick={togglePause}><Icon name={paused ? 'play' : 'pause'} size={30} fill={paused} /></button>
              <button type="button" class="cp-pill" aria-label="Saltar este paso" onClick={skip}><Icon name="skip" size={16} />Saltar</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

