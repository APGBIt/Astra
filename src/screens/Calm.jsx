import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Nav, TopBar, Sheet, SheetHead, TChip, NumberChips, Bar, toast, areaColor, areaSoft, areaInk, plural, focusOnMount } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { env, vibrate } from '../app/env.js';
import { DAYS_SHORT, weekday, relDay } from '../app/dates.js';
import {
  BREATHS, BREATH, breathCycle, GUIDED, GUIDE, SOS, PROGRAM, SOUNDS, THINKING_TRAPS, REFRAME_HELP, HELP, EMOTIONS,
} from '../game/wellness.js';
import { logCalmSession, setCalmAfter, calmStats, calmWeek, programState, addWorries, addThought, CALM_KINDS } from '../game/mind.js';
import { usePotion } from '../game/logic.js';
import { go } from '../app/router.js';
import { bell, startAmbient, stopAmbient, speak, hush, canSpeak, keepAwake, pref, setPref, unlockAudio } from '../app/sound.js';

// Calma: respiraciones, meditaciones guiadas, meditación libre con campanas y sonidos, pausa SOS,
// programa de siete días y herramientas para la mente (descarga mental y replantear un pensamiento).

// ---------- Sesiones ----------

export function breathSession(id, minutes) {
  const b = BREATH[id];
  const c = breathCycle(b);
  const dur = b.cycles ? b.cycles * c : Math.max(1, Math.round((minutes * 60) / c)) * c;
  return { kind: 'respira', ref: id, title: b.title, segments: [{ breath: id, dur }], total: dur };
}

export function guidedSession(id, program = null) {
  const g = GUIDE[id];
  const total = g.minutes * 60;
  const segments = g.steps.map(([at, text], i) => ({ text, dur: (i + 1 < g.steps.length ? g.steps[i + 1][0] : total) - at }));
  return { kind: 'guiada', ref: id, title: g.title, segments, total, program, voice: true };
}

export function timerSession(minutes, every = 0, program = null) {
  return { kind: 'libre', ref: 'timer', title: `Meditación libre · ${minutes} min`, segments: [{ silent: true, dur: minutes * 60 }], total: minutes * 60, every, program };
}

export function sosSession() {
  return { kind: 'sos', ref: 'sos', title: SOS.title, segments: SOS.segments, total: SOS.segments.reduce((a, x) => a + x.dur, 0), voice: true };
}

export function programSession(n) {
  const d = PROGRAM.days[n - 1];
  if (!d) return null;
  const sess = d.guided ? guidedSession(d.guided, n) : timerSession(d.timer.minutes, d.timer.every, n);
  return { ...sess, title: `Día ${n} · ${d.title}` };
}

// Abre lo que propone una estrategia (desde el check-in de ánimo, por ejemplo).
export function runAction(a, { setPlay, setTool }) {
  if (!a) { toast('Buena idea: hazlo ahora y vuelve cuando quieras.', 'pulse'); return; }
  if (a.breath) setPlay(breathSession(a.breath, a.min || 3));
  else if (a.guided) setPlay(guidedSession(a.guided));
  else if (a.sos) setPlay(sosSession());
  else if (a.tool) setTool(a.tool);
  else if (a.route) go(a.route);
  else if (a.potion) { if (act((st, t, ev) => usePotion(st, a.potion, t, ev))) toast('+3 de vitalidad y +1 de energía: sal un rato', 'sun'); else toast('Ya usaste esa poción hoy: igual sal un rato si puedes.', 'sun'); }
}

// «Inhala 2 s · un poco más 1 s · exhala 6 s»
const PHASE_WORD = { in: 'inhala', in2: 'un poco más', hold: 'sostén', out: 'exhala', hold2: 'sostén' };
export const breathSteps = (b) => {
  const t = b.phases.map((p) => `${PHASE_WORD[p[0]]} ${p[1]} s`).join(' · ');
  return `${t[0].toUpperCase()}${t.slice(1)}${b.cycles ? ` · ${b.cycles} ciclos` : ''}`;
};

const mmss = (sec) => { const v = Math.max(0, Math.ceil(sec)); return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; };

// ---------- Reproductor a pantalla completa ----------

function phaseAt(b, t) {
  const c = breathCycle(b);
  let x = ((t % c) + c) % c;
  for (let i = 0; i < b.phases.length; i++) {
    const [kind, sec, label] = b.phases[i];
    if (x < sec) return { kind, sec, label, p: x / sec, left: sec - x, next: b.phases[(i + 1) % b.phases.length][0] };
    x -= sec;
  }
  const last = b.phases[b.phases.length - 1];
  return { kind: last[0], sec: last[1], label: last[2], p: 1, left: 0, next: b.phases[0][0] };
}

function breathScale(ph) {
  const lo = 0.55;
  const mid = 0.86;
  if (ph.kind === 'in') return lo + (ph.next === 'in2' ? mid - lo : 1 - lo) * ph.p;
  if (ph.kind === 'in2') return mid + (1 - mid) * ph.p;
  if (ph.kind === 'hold') return 1;
  if (ph.kind === 'out') return 1 - (1 - lo) * ph.p;
  return lo;
}

export function CalmPlayer({ session, onClose }) {
  const total = session.total;
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [voice, setVoice] = useState(() => pref('voz', true));
  const [sound, setSound] = useState(() => (session.sound != null ? session.sound : pref('sonido', 'silencio')));
  const [done, setDone] = useState(null);
  const base = useRef({ start: Date.now(), acc: 0 });
  const said = useRef(-1);
  const rang = useRef(0);
  const lock = useRef(null);
  const ended = useRef(false);
  const starts = [];
  let acc = 0;
  for (const seg of session.segments) { starts.push(acc); acc += seg.dur; }
  let si = starts.length - 1;
  while (si > 0 && starts[si] > elapsed) si -= 1;
  const seg = session.segments[si];
  const withVoice = session.voice && canSpeak();

  useEffect(() => {
    unlockAudio();
    bell(1);
    startAmbient(sound);
    keepAwake().then((l) => { lock.current = l; });
    return () => { hush(); stopAmbient(); try { if (lock.current) lock.current.release(); } catch { /* ya liberada */ } };
  }, []);

  useEffect(() => {
    if (paused || done) return undefined;
    const id = setInterval(() => setElapsed(Math.min(total, base.current.acc + (Date.now() - base.current.start) / 1000)), 200);
    return () => clearInterval(id);
  }, [paused, done]);

  // Voz al empezar cada paso; campanas de intervalo; final.
  useEffect(() => {
    if (done || paused) return;
    if (said.current !== si) {
      said.current = si;
      if (voice && withVoice && seg.text) speak(seg.text);
    }
    if (session.every > 0) {
      const n = Math.floor(elapsed / (session.every * 60));
      if (n > rang.current && elapsed < total - 2) { rang.current = n; bell(1, 0.28); }
    }
    if (elapsed >= total) finish(total);
  }, [elapsed, paused]);

  const finish = (sec) => {
    if (ended.current) return;
    ended.current = true;
    hush();
    stopAmbient(2);
    bell(2);
    vibrate([40, 60, 40]);
    const minutes = Math.max(1, Math.round(sec / 60));
    const id = act((st, t, ev) => {
      const e = logCalmSession(st, { kind: session.kind, ref: session.ref, title: session.title, minutes, program: session.program }, t, ev);
      return e ? e.id : null;
    });
    setDone({ id, minutes });
  };
  const togglePause = () => {
    if (paused) {
      base.current.start = Date.now();
      setPaused(false);
      startAmbient(sound);
      said.current = -1;
    } else {
      base.current.acc += (Date.now() - base.current.start) / 1000;
      setPaused(true);
      hush();
      stopAmbient(0.6);
    }
  };
  const stop = () => {
    if (done) { onClose(); return; }
    if (elapsed >= 60) finish(elapsed);
    else onClose();
  };
  const toggleVoice = () => { const v = !voice; setVoice(v); setPref('voz', v); if (!v) hush(); else if (seg.text) speak(seg.text); };
  const nextSound = () => {
    const i = SOUNDS.findIndex((x) => x.id === sound);
    const nx = SOUNDS[(i + 1) % SOUNDS.length].id;
    setSound(nx);
    setPref('sonido', nx);
    if (!paused && !done) startAmbient(nx);
  };
  const after = (v) => { if (done && done.id) act((st) => setCalmAfter(st, done.id, v)); onClose(); };

  const b = seg.breath ? BREATH[seg.breath] : null;
  const ph = b ? phaseAt(b, elapsed - starts[si]) : null;
  const scale = ph ? breathScale(ph) : 1;
  const soundLabel = (SOUNDS.find((x) => x.id === sound) || SOUNDS[0]).label;

  return (
    <div class="focus-full calm-player" role="dialog" aria-modal="true" aria-label={session.title}>
      <div class="cp-top">
        <span class="eyebrow" style={{ color: '#B9BBC2' }}>{session.title}</span>
        <button type="button" class="cp-icon" aria-label={done ? 'Cerrar' : 'Terminar la sesión'} onClick={stop}><Icon name="close" size={22} /></button>
      </div>
      {done ? (
        <div class="stack center cp-done" style={{ display: 'flex' }}>
          <span class="cp-orb still" aria-hidden="true" />
          <span class="h1" style={{ color: '#F2F2EF' }}>Listo · {plural(done.minutes, 'minuto', 'minutos')}</span>
          <span style={{ color: '#B9BBC2' }}>Cada minuto de calma suma XP de Temple.</span>
          <span class="label" style={{ color: '#F2F2EF', marginTop: 8 }}>¿Cómo te sientes ahora?</span>
          <div class="row" style={{ gap: 8, justifyContent: 'center' }}>
            {[['mejor', 'Mejor'], ['igual', 'Igual'], ['peor', 'Peor']].map(([k, l]) => <button key={k} type="button" class="btn cp-btn" onClick={() => after(k)}>{l}</button>)}
          </div>
          <button type="button" class="link-btn" style={{ color: '#B9BBC2' }} onClick={onClose}>Cerrar sin responder</button>
        </div>
      ) : (
        <>
          <div class="cp-stage">
            {b ? (
              <div class="cp-breath" aria-hidden="true"><span class="cp-ring" style={{ transform: `scale(${scale})` }}><span class="cp-core" /></span></div>
            ) : seg.silent ? (
              <div class="cp-timer" aria-hidden="true"><span class="cp-orb" /><span class="cp-time">{mmss(total - elapsed)}</span></div>
            ) : <span class="cp-orb" aria-hidden="true" />}
          </div>
          <div class="cp-text" aria-live="polite">
            {b ? (
              <>
                <span class="h1" style={{ color: '#F2F2EF' }}>{ph.label}</span>
                <span class="cp-count tab-num">{Math.ceil(ph.left)}</span>
                {seg.text && <span class="cp-sub">{seg.text}</span>}
              </>
            ) : seg.silent ? (
              <span class="cp-sub">{paused ? 'En pausa.' : session.every ? `Una campana cada ${session.every} min. Si la mente se va, vuelve a la respiración.` : 'Siéntate en calma. Si la mente se va, vuelve a la respiración.'}</span>
            ) : <span class="cp-say">{seg.text}</span>}
          </div>
          <div class="cp-bottom">
            <div class="cp-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((elapsed / total) * 100)} aria-label="Avance de la sesión"><i style={{ width: `${(elapsed / total) * 100}%` }} /></div>
            <span class="tiny tab-num" style={{ color: '#9EA1A8' }}>{mmss(total - elapsed)} restantes</span>
            <div class="row" style={{ gap: 10, justifyContent: 'center' }}>
              {withVoice && <button type="button" class="cp-icon" aria-pressed={voice ? 'true' : 'false'} aria-label={voice ? 'Quitar la voz' : 'Poner la voz'} onClick={toggleVoice}><Icon name={voice ? 'chat' : 'eyeoff'} size={20} /></button>}
              <button type="button" class="cp-main" aria-label={paused ? 'Continuar' : 'Pausa'} onClick={togglePause}><Icon name={paused ? 'play' : 'pause'} size={30} fill={paused} /></button>
              <button type="button" class="cp-pill" aria-label={`Sonido de fondo: ${soundLabel}. Tocar para cambiar`} onClick={nextSound}><Icon name="bell" size={16} />{soundLabel}</button>
            </div>
            {session.kind === 'sos' && <a class="link-btn" style={{ color: '#9EA1A8', fontSize: 13 }} href={`tel:${HELP.emergency}`}>¿En peligro? Llama al {HELP.emergency}</a>}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Pantalla ----------

const TIMER_MIN = [5, 10, 15, 20, 30];
const BELLS = [[0, 'Sin campanas'], [1, 'Cada 1 min'], [5, 'Cada 5 min'], [10, 'Cada 10 min']];

export function Calm({ query }) {
  const s = useApp();
  const today = s.energy.day;
  const [play, setPlay] = useState(null);
  const [sheet, setSheet] = useState(() => (query && query.get('t')) || null);
  const [tmin, setTmin] = useState(() => pref('timerMin', 10));
  const [every, setEvery] = useState(() => pref('timerBell', 5));
  const [tsound, setTsound] = useState(() => pref('timerSound', 'silencio'));
  const [showAll, setShowAll] = useState(false);
  const st = calmStats(s, today);
  const week = calmWeek(s, today);
  const maxW = Math.max(10, ...week.map((d) => d.minutes));
  const prog = programState(s);
  const history = s.mind.calm.slice(0, showAll ? 30 : 6);
  useEffect(() => { if (query && query.get('play') === 'sos') setPlay(sosSession()); }, []);
  const startTimer = () => { setPref('timerMin', tmin); setPref('timerBell', every); setPref('timerSound', tsound); setPlay({ ...timerSession(tmin, every), sound: tsound }); };
  return (
    <>
      <main class="screen">
        <TopBar backTo="/animo" />
        <div class="stack-xs">
          <span class="eyebrow" style={{ color: areaInk('emocional') }}>Temple · Paz mental</span>
          <h1 class="h1">Calma</h1>
          <p class="lead">Respira, medita y suelta lo que te pesa. Funciona sin internet.</p>
        </div>
        <div class="kpis">
          <div class="kpi"><span class="v tab-num">{st.today}</span><span class="l">min hoy</span></div>
          <div class="kpi"><span class="v tab-num">{st.week}</span><span class="l">min en 7 días</span></div>
          <div class="kpi"><span class="v tab-num">{st.streak}</span><span class="l">{st.streak === 1 ? 'día seguido' : 'días seguidos'}</span></div>
        </div>

        <section class="card sos-card" aria-label="Pausa SOS">
          <div class="row-top">
            <span class="tile" style={{ background: 'var(--surface)', color: areaColor('emocional') }}><Icon name="shield" /></span>
            <div class="stack-xs grow"><span class="strong">¿Necesitas calmarte ahora?</span><span class="small">Tres minutos: respiración con suspiros y tus cinco sentidos para volver al presente.</span></div>
          </div>
          <div class="row wrap" style={{ gap: 8 }}>
            <button type="button" class="btn sm" onClick={() => setPlay(sosSession())}><Icon name="play" size={16} fill />Pausa SOS · 3 min</button>
            <button type="button" class="btn sm ghost" onClick={() => setSheet('ayuda')}>Necesito ayuda</button>
          </div>
        </section>

        <section class="card" aria-label={PROGRAM.title}>
          <div class="between-c"><h2 class="h2">{PROGRAM.title}</h2><span class="small muted semi">{prog.count} de {prog.total}</span></div>
          <div class="prog-dots" role="img" aria-label={`${prog.count} de ${prog.total} días`}>{PROGRAM.days.map((_, i) => <i key={i} class={prog.done[i + 1] ? 'on' : prog.next === i + 1 ? 'next' : ''} />)}</div>
          {prog.next ? (
            <>
              <span class="small muted">{prog.count ? 'Sigue donde quedaste.' : PROGRAM.desc}</span>
              <button type="button" class="lrow" style={{ minHeight: 58 }} onClick={() => setPlay(programSession(prog.next))}>
                <span class="tile sm" style={{ background: areaSoft('emocional'), color: areaColor('emocional') }}><Icon name="play" size={16} fill /></span>
                <span class="stack-xs grow"><span class="strong">Día {prog.next} · {PROGRAM.days[prog.next - 1].title}</span><span class="tiny muted semi">{PROGRAM.days[prog.next - 1].guided ? `${GUIDE[PROGRAM.days[prog.next - 1].guided].minutes} min · guiada` : `${PROGRAM.days[prog.next - 1].timer.minutes} min · en silencio`}</span></span>
                <Icon name="right" size={18} />
              </button>
            </>
          ) : <div class="note tone-good"><Icon name="check" size={18} /><span>Completaste los siete días. Repite cualquiera abajo o sigue con la meditación libre.</span></div>}
        </section>

        <section class="card flush" aria-label="Respiraciones">
          <div style={{ padding: '14px 0 4px' }}><h2 class="h2">Respira</h2></div>
          {BREATHS.map((b) => (
            <button key={b.id} type="button" class="lrow" style={{ minHeight: 62 }} onClick={() => setSheet(`breath:${b.id}`)}>
              <span class="tile sm" style={{ background: areaSoft('emocional'), color: areaColor('emocional') }}><Icon name={b.icon} size={18} /></span>
              <span class="stack-xs grow" style={{ minWidth: 0 }}><span class="strong">{b.title}</span><span class="tiny muted semi clamp2">{breathSteps(b)}</span></span>
              <Icon name="right" size={18} />
            </button>
          ))}
        </section>

        <section class="card flush" aria-label="Meditaciones guiadas">
          <div class="between-c" style={{ padding: '14px 0 4px' }}><h2 class="h2">Meditaciones guiadas</h2>{canSpeak() && <span class="tiny muted semi">con voz</span>}</div>
          {GUIDED.map((g) => (
            <button key={g.id} type="button" class="lrow" style={{ minHeight: 66 }} onClick={() => setPlay(guidedSession(g.id))}>
              <span class="tile sm" style={{ background: areaSoft('emocional'), color: areaColor('emocional') }}><Icon name={g.icon} size={18} /></span>
              <span class="stack-xs grow" style={{ minWidth: 0 }}><span class="strong">{g.title}</span><span class="tiny muted semi clamp2">{g.desc}</span></span>
              <span class="small strong tab-num" style={{ whiteSpace: 'nowrap' }}>{g.minutes} min</span>
            </button>
          ))}
        </section>

        <section class="card" aria-label="Meditación libre">
          <h2 class="h2">Meditación libre</h2>
          <span class="small muted">Tú decides el tiempo; una campana marca el inicio, los intervalos y el final.</span>
          <div class="stack-sm"><span class="label">Duración</span><NumberChips value={tmin} onChange={setTmin} presets={TIMER_MIN} format={(v) => `${v} min`} unit="min" min={1} max={120} label="Minutos" /></div>
          <div class="stack-sm"><span class="label">Campana</span><div class="chips">{BELLS.map(([v, l]) => <TChip key={v} sm on={every === v} onClick={() => setEvery(v)}>{l}</TChip>)}</div></div>
          <div class="stack-sm"><span class="label">Sonido de fondo</span><div class="chips">{SOUNDS.map((x) => <TChip key={x.id} sm on={tsound === x.id} onClick={() => setTsound(x.id)}>{x.label}</TChip>)}</div></div>
          <button type="button" class="btn" style={{ alignSelf: 'flex-start' }} onClick={startTimer}><Icon name="play" size={18} fill />Empezar · {tmin} min</button>
        </section>

        <section class="card flush" aria-label="Para tu mente">
          <div style={{ padding: '14px 0 4px' }}><h2 class="h2">Para tu mente</h2></div>
          <button type="button" class="lrow" style={{ minHeight: 64 }} onClick={() => setSheet('descarga')}>
            <span class="tile sm" style={{ background: areaSoft('emocional'), color: areaColor('emocional') }}><Icon name="note" size={18} /></span>
            <span class="stack-xs grow"><span class="strong">Descarga mental</span><span class="tiny muted semi">Saca lo que te preocupa y separa lo que depende de ti.</span></span>
            <Icon name="right" size={18} />
          </button>
          <button type="button" class="lrow" style={{ minHeight: 64 }} onClick={() => setSheet('replantear')}>
            <span class="tile sm" style={{ background: areaSoft('emocional'), color: areaColor('emocional') }}><Icon name="edit" size={18} /></span>
            <span class="stack-xs grow"><span class="strong">Replantear un pensamiento</span><span class="tiny muted semi">Revisa un pensamiento que te pesa y busca una forma más justa de verlo.</span></span>
            <Icon name="right" size={18} />
          </button>
          <a class="lrow" style={{ minHeight: 64, textDecoration: 'none', color: 'var(--ink)' }} href="#/diario">
            <span class="tile sm" style={{ background: areaSoft('crecimiento'), color: areaColor('crecimiento') }}><Icon name="book" size={18} /></span>
            <span class="stack-xs grow"><span class="strong">Diario</span><span class="tiny muted semi">Escribe lo que sientes, tres cosas buenas o lo que aprendiste.</span></span>
            <Icon name="right" size={18} />
          </a>
        </section>

        <section class="card" aria-label="Tu semana de calma">
          <div class="between-c"><h2 class="h2">Tu semana</h2><span class="small muted">{st.week} min</span></div>
          <div class="calm-bars" role="img" aria-label={week.map((d) => `${d.day === today ? 'hoy' : DAYS_SHORT[weekday(d.day)]}: ${d.minutes} min`).join(', ')}>
            {week.map((d) => (
              <div key={d.day} class="cb" title={`${d.minutes} min`}>
                <span class="tiny strong tab-num" style={{ color: 'var(--muted)', minHeight: 14 }}>{d.minutes && (d.day === today || d.minutes === maxW) ? d.minutes : ''}</span>
                <i style={{ height: `${Math.max(4, (d.minutes / maxW) * 72)}px`, background: d.minutes ? areaColor('emocional') : 'var(--soft-2)' }} />
                <span class="tiny muted semi">{d.day === today ? 'Hoy' : DAYS_SHORT[weekday(d.day)]}</span>
              </div>
            ))}
          </div>
          {st.answered >= 3 && <span class="small muted">Después del {Math.round(st.better * 100)} % de tus sesiones te sentiste mejor.</span>}
          {st.total > 0 && <span class="small muted">En total: {plural(st.total, 'minuto', 'minutos')} en {plural(st.sessions, 'sesión', 'sesiones')}.</span>}
        </section>

        {history.length > 0 && (
          <section class="card flush" aria-label="Historial de calma">
            <div style={{ padding: '14px 0 4px' }}><h2 class="h2">Historial</h2></div>
            {history.map((c) => (
              <div class="lrow" key={c.id}>
                <span class="stack-xs grow" style={{ minWidth: 0 }}><span class="semi clip">{c.title}</span><span class="tiny muted">{c.minutes} min · {CALM_KINDS[c.kind]}{c.after ? ` · después: ${c.after}` : ''}</span></span>
                <span class="tiny muted" style={{ whiteSpace: 'nowrap' }}>{relDay(c.day, today)}</span>
              </div>
            ))}
            {s.mind.calm.length > 6 && <button type="button" class="lrow" style={{ justifyContent: 'center', fontWeight: 700 }} onClick={() => setShowAll(!showAll)}>{showAll ? 'Ver menos' : 'Ver más'}</button>}
          </section>
        )}

        <button type="button" class="note" style={{ border: 'none', textAlign: 'left', color: 'var(--ink)' }} onClick={() => setSheet('ayuda')}>
          <Icon name="heart" size={20} /><span class="grow">Esto ayuda, pero no reemplaza a un profesional. Si lo estás pasando mal, busca apoyo.</span><Icon name="right" size={18} />
        </button>
      </main>
      <Nav active="areas" />
      {sheet && sheet.startsWith('breath:') && <BreathSheet id={sheet.slice(7)} onClose={() => setSheet(null)} onStart={(sess) => { setSheet(null); setPlay(sess); }} />}
      {sheet === 'descarga' && <WorrySheet onClose={() => setSheet(null)} />}
      {sheet === 'replantear' && <ThoughtSheet onClose={() => setSheet(null)} />}
      {sheet === 'ayuda' && <HelpSheet onClose={() => setSheet(null)} />}
      {play && <CalmPlayer session={play} onClose={() => setPlay(null)} />}
    </>
  );
}

function BreathSheet({ id, onClose, onStart }) {
  const b = BREATH[id];
  const [min, setMin] = useState(b ? b.min : 3);
  if (!b) return null;
  return (
    <Sheet onClose={onClose} label={b.title}>
      <SheetHead title={b.title} onClose={onClose} />
      <p class="small">{b.desc}</p>
      <div class="chips">{b.phases.map((p, i) => <span key={i} class="chip sm">{p[2]} · {p[1]} s</span>)}</div>
      {b.cycles ? <span class="small muted">{b.cycles} ciclos · {Math.round((b.cycles * breathCycle(b)) / 6) / 10} min</span> : (
        <div class="stack-sm"><span class="label">Duración</span><div class="chips">{b.minutes.map((m) => <TChip key={m} sm on={min === m} onClick={() => setMin(m)}>{m} min</TChip>)}</div></div>
      )}
      <button type="button" class="btn block" onClick={() => onStart(breathSession(id, min))}><Icon name="play" size={18} fill />Empezar</button>
    </Sheet>
  );
}

export function HelpSheet({ onClose }) {
  return (
    <Sheet onClose={onClose} label="Ayuda">
      <SheetHead title="Ayuda ahora" onClose={onClose} />
      <div class="note tone-vit"><Icon name="info" size={18} /><span>Si estás en peligro o piensas en hacerte daño, llama al <b>{HELP.emergency}</b> ahora.</span></div>
      <a class="btn block" href={`tel:${HELP.emergency}`}><Icon name="phone" size={18} />Llamar al {HELP.emergency}</a>
      <section class="card" style={{ gap: 6 }}>
        <span class="strong">{HELP.lineName}</span>
        <span class="small muted">{HELP.lineDesc}</span>
        <a class="btn sm soft" style={{ alignSelf: 'flex-start' }} href={`tel:${HELP.line}`}><Icon name="phone" size={16} />Llamar al {HELP.line}</a>
      </section>
      <a class="lrow" href="#/personas" style={{ textDecoration: 'none', color: 'var(--ink)' }} onClick={onClose}><Icon name="people" size={18} /><span class="grow semi">Escríbele a alguien de confianza</span><Icon name="right" size={16} /></a>
      <span class="small muted">{HELP.abroad} Astra te acompaña, pero no reemplaza a un profesional de la salud.</span>
    </Sheet>
  );
}

// ---------- Descarga mental ----------

export function WorrySheet({ onClose }) {
  const [step, setStep] = useState(1);
  const [text, setText] = useState('');
  const [items, setItems] = useState([]);
  const [res, setRes] = useState(null);
  const lines = text.split('\n').map((l) => l.replace(/^[-•*\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 12);
  const set = (i, patch) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const ready = items.length > 0 && items.every((x) => x.kind);
  const save = () => {
    const r = act((st, t, ev) => addWorries(st, items, t, ev));
    setRes(r);
    setStep(3);
    toast(r.todos ? `${plural(r.todos, 'pendiente nuevo', 'pendientes nuevos')}` : 'Descarga guardada', 'note');
  };
  return (
    <Sheet onClose={onClose} label="Descarga mental">
      <SheetHead title="Descarga mental" onClose={onClose} />
      {step === 1 && (
        <>
          <span class="small">Escribe todo lo que te preocupa, una cosa por línea. Sin ordenar ni corregir.</span>
          <textarea class="input" rows={7} value={text} maxLength={2000} onInput={(e) => setText(e.currentTarget.value)} placeholder={'El informe del lunes\nLa cuota del carro\nLa salud de mamá'} ref={focusOnMount} aria-label="Lo que te preocupa" />
          <button type="button" class="btn block" disabled={!lines.length} onClick={() => { setItems(lines.map((l) => ({ text: l, kind: null, step: '' }))); setStep(2); }}><Icon name="right" size={18} />Seguir · {plural(lines.length, 'cosa', 'cosas')}</button>
        </>
      )}
      {step === 2 && (
        <>
          <span class="small">Para cada una: ¿puedes hacer algo, o no depende de ti? Lo que sí depende de ti se vuelve un pendiente con su siguiente paso.</span>
          {items.map((x, i) => (
            <div key={i} class="panel stack-sm">
              <span class="strong">{x.text}</span>
              <div class="chips">
                <TChip sm on={x.kind === 'puedo'} icon="check" onClick={() => set(i, { kind: 'puedo' })}>Puedo hacer algo</TChip>
                <TChip sm on={x.kind === 'no'} icon="sparkle" onClick={() => set(i, { kind: 'no' })}>No depende de mí</TChip>
              </div>
              {x.kind === 'puedo' && <input class="input" value={x.step} maxLength={120} onInput={(e) => set(i, { step: e.currentTarget.value })} placeholder="Siguiente paso (opcional): «Llamar al banco el lunes»" aria-label={`Siguiente paso para ${x.text}`} />}
              {x.kind === 'no' && <span class="tiny muted">Ya está anotado. Puedes soltarlo por ahora.</span>}
            </div>
          ))}
          <button type="button" class="btn block" disabled={!ready} onClick={save}><Icon name="check" size={18} />Guardar</button>
        </>
      )}
      {step === 3 && res && (
        <>
          <div class="note tone-good"><Icon name="check" size={18} /><span>{res.todos ? `${plural(res.todos, 'cosa quedó', 'cosas quedaron')} en Pendientes con su siguiente paso. ` : ''}{res.released ? `${plural(res.released, 'cosa no depende', 'cosas no dependen')} de ti: ya están fuera de tu cabeza.` : ''}</span></div>
          <span class="small muted">Si una preocupación vuelve, recuérdate que ya la anotaste. Puedes darle un rato fijo del día y soltarla el resto.</span>
          <button type="button" class="btn block" onClick={onClose}>Listo</button>
        </>
      )}
    </Sheet>
  );
}

// ---------- Replantear un pensamiento ----------

const Scale = ({ value, onChange, label, from = 0, to = 10 }) => (
  <div class="scale10" role="group" aria-label={label}>
    {Array.from({ length: to - from + 1 }, (_, i) => from + i).map((n) => <button key={n} type="button" aria-pressed={value === n ? 'true' : 'false'} onClick={() => onChange(n)}>{n}</button>)}
  </div>
);
export { Scale };

export function ThoughtSheet({ onClose }) {
  const [step, setStep] = useState(1);
  const [p, setP] = useState({ situation: '', thought: '', emotion: '', before: 7, traps: [], favor: '', contra: '', alt: '', after: 5 });
  const [saved, setSaved] = useState(null);
  const set = (k) => (e) => setP({ ...p, [k]: e.currentTarget.value });
  const words = [...EMOTIONS[0].slice(0, 8), ...EMOTIONS[2].slice(0, 8)].map((x) => x[0]);
  const toggleTrap = (id) => setP({ ...p, traps: p.traps.includes(id) ? p.traps.filter((x) => x !== id) : [...p.traps, id].slice(0, 4) });
  const save = () => { const e = act((st, t, ev) => addThought(st, p, t, ev)); setSaved(e); setStep(6); };
  const steps = 5;
  return (
    <Sheet onClose={onClose} label="Replantear un pensamiento">
      <SheetHead title="Replantear un pensamiento" onClose={onClose} />
      {step <= steps && <div class="prog-dots sm" aria-label={`Paso ${step} de ${steps}`}>{Array.from({ length: steps }, (_, i) => <i key={i} class={i < step ? 'on' : ''} />)}</div>}
      {step === 1 && (
        <>
          <div class="field"><label for="th-s">¿Qué pasó?</label><textarea id="th-s" class="input" rows={2} value={p.situation} maxLength={300} onInput={set('situation')} placeholder="Mi jefa no respondió mi mensaje" ref={focusOnMount} /></div>
          <div class="field"><label for="th-t">¿Qué pensaste?</label><textarea id="th-t" class="input" rows={3} value={p.thought} maxLength={300} onInput={set('thought')} placeholder="Seguro está molesta conmigo por el informe" /></div>
          <button type="button" class="btn block" disabled={!p.thought.trim()} onClick={() => setStep(2)}>Siguiente</button>
        </>
      )}
      {step === 2 && (
        <>
          <span class="label">¿Qué sentiste?</span>
          <div class="chips">{words.map((w) => <TChip key={w} sm on={p.emotion === w} onClick={() => setP({ ...p, emotion: w })}>{w}</TChip>)}</div>
          <span class="label">¿Con qué fuerza? (0 a 10)</span>
          <Scale value={p.before} onChange={(v) => setP({ ...p, before: v })} label="Fuerza de la emoción antes" />
          <div class="row"><button type="button" class="btn ghost grow" onClick={() => setStep(1)}>Atrás</button><button type="button" class="btn grow" onClick={() => setStep(3)}>Siguiente</button></div>
        </>
      )}
      {step === 3 && (
        <>
          <span class="small">¿Tu pensamiento cae en alguna de estas trampas? Elige las que veas (o ninguna).</span>
          <div class="stack-xs">{THINKING_TRAPS.map((t) => (
            <button key={t.id} type="button" class="trap" aria-pressed={p.traps.includes(t.id) ? 'true' : 'false'} onClick={() => toggleTrap(t.id)}>
              <span class="strong">{t.label}</span><span class="tiny muted">{t.desc}</span>
            </button>
          ))}</div>
          <div class="row"><button type="button" class="btn ghost grow" onClick={() => setStep(2)}>Atrás</button><button type="button" class="btn grow" onClick={() => setStep(4)}>Siguiente</button></div>
        </>
      )}
      {step === 4 && (
        <>
          <div class="field"><label for="th-f">¿Qué lo apoya? (los hechos)</label><textarea id="th-f" class="input" rows={2} value={p.favor} maxLength={500} onInput={set('favor')} /></div>
          <div class="field"><label for="th-c">¿Qué no lo apoya?</label><textarea id="th-c" class="input" rows={2} value={p.contra} maxLength={500} onInput={set('contra')} placeholder="Ayer me felicitó; suele tardar en responder" /></div>
          <div class="row"><button type="button" class="btn ghost grow" onClick={() => setStep(3)}>Atrás</button><button type="button" class="btn grow" onClick={() => setStep(5)}>Siguiente</button></div>
        </>
      )}
      {step === 5 && (
        <>
          <div class="panel stack-xs">{REFRAME_HELP.map((q) => <span key={q} class="small">· {q}</span>)}</div>
          <div class="field"><label for="th-a">Otra forma más justa de verlo</label><textarea id="th-a" class="input" rows={3} value={p.alt} maxLength={500} onInput={set('alt')} placeholder="Puede estar ocupada; si hay algo del informe, lo hablamos" /></div>
          <span class="label">¿Con qué fuerza lo sientes ahora? (0 a 10)</span>
          <Scale value={p.after} onChange={(v) => setP({ ...p, after: v })} label="Fuerza de la emoción después" />
          <div class="row"><button type="button" class="btn ghost grow" onClick={() => setStep(4)}>Atrás</button><button type="button" class="btn grow" onClick={save}><Icon name="check" size={18} />Guardar</button></div>
        </>
      )}
      {step === 6 && saved && (
        <>
          <div class="note tone-good"><Icon name="check" size={18} /><span>{saved.emotion || 'La emoción'} pasó de <b>{saved.before}</b> a <b>{saved.after}</b>.{saved.after < saved.before ? ' Mirarlo de otra forma ayudó.' : ' A veces el cambio llega después: date tiempo.'}</span></div>
          {saved.alt && <span class="small">«{saved.alt}»</span>}
          <button type="button" class="btn block" onClick={onClose}>Listo</button>
        </>
      )}
    </Sheet>
  );
}

export const calmEnv = env;
