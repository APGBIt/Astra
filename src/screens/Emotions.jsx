import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Nav, TopBar, TChip, toast, areaColor, areaSoft, areaInk, plural } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { relDay, DAYS_SHORT } from '../app/dates.js';
import { MOOD_QUADS, INFLUENCES } from '../game/content.js';
import { addMood } from '../game/logic.js';
import { emotionsFor, strategiesFor, emotionOf, moodPatterns, dayMoods, calmMinutes, distinctEmotions, BODY } from '../game/mind.js';
import { AreaHeader, AreaMissions } from './Areas.jsx';
import { AreaTodos } from './Todos.jsx';
import { CalmPlayer, WorrySheet, ThoughtSheet, runAction } from './Calm.jsx';

// Emociones: check-in con nombre exacto (cada emoción con su significado), qué influyó y dónde lo sientes;
// después, estrategias según cómo te sientes; y tus patrones: año en píxeles y lo que acompaña a tus días.

const SHOW_WORDS = 10;
const SHOW_INFL = 9;

const toggleIn = (list, k, max) => (list.includes(k) ? list.filter((x) => x !== k) : list.length >= max ? [...list.slice(1), k] : [...list, k]);

export function CheckIn({ compact = false, onDone, onAction }) {
  const [quad, setQuad] = useState(null);
  const [words, setWords] = useState([]);
  const [last, setLast] = useState(null);
  const [moreW, setMoreW] = useState(false);
  const [infl, setInfl] = useState([]);
  const [moreI, setMoreI] = useState(false);
  const [body, setBody] = useState([]);
  const [showBody, setShowBody] = useState(false);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(null);
  const emos = quad == null ? [] : emotionsFor(quad);
  const pick = (w) => { setWords(toggleIn(words, w, 3)); setLast(words.includes(w) ? null : w); };
  const save = () => {
    if (quad == null) return;
    act((st, t, ev) => addMood(st, { quad, words, influences: infl, body, note }, t, ev));
    toast('Check-in guardado · +15 XP de Temple', 'face');
    setSaved({ quad, words });
  };
  const reset = () => { setQuad(null); setWords([]); setLast(null); setInfl([]); setBody([]); setNote(''); setSaved(null); setMoreW(false); setMoreI(false); setShowBody(false); };

  if (saved) {
    const list = strategiesFor(saved.quad);
    const pleasant = saved.quad === 1 || saved.quad === 3;
    return (
      <section class="stack-sm" aria-label="Después del check-in">
        <div class="note" style={{ background: areaSoft('emocional'), color: areaInk('emocional') }}>
          <Icon name="check" size={18} />
          <span>{saved.words.length ? `Nombraste ${saved.words.map((w) => w.toLowerCase()).join(', ')}. ` : ''}{pleasant ? 'Aprovecha este momento:' : 'Ponerle nombre ya ayuda. Si quieres, prueba algo de esto:'}</span>
        </div>
        <div class="stack-xs">
          {list.slice(0, compact ? 3 : 5).map((x) => (
            <button key={x.id} type="button" class="lrow strat" onClick={() => onAction(x.action)}>
              <span class="tile sm" style={{ background: areaSoft('emocional'), color: areaColor('emocional') }}><Icon name={x.icon} size={18} /></span>
              <span class="stack-xs grow" style={{ minWidth: 0 }}><span class="strong">{x.title}</span><span class="tiny muted semi">{x.desc}</span></span>
              <Icon name="right" size={16} />
            </button>
          ))}
        </div>
        <div class="row" style={{ gap: 8 }}>
          <button type="button" class="btn sm ghost grow" onClick={reset}>Otro check-in</button>
          {onDone && <button type="button" class="btn sm grow" onClick={onDone}>Listo</button>}
        </div>
      </section>
    );
  }

  return (
    <section class="stack" aria-label="Check-in">
      <div class="stack-sm">
        <h2 class="h2">¿Cómo te sientes ahora mismo?</h2>
        <div class="between tiny strong muted"><span>Desagradable</span><span>Agradable</span></div>
        <div class="row" style={{ alignItems: 'stretch', gap: 8 }}>
          <div class="stack-xs tiny strong muted" style={{ width: 16, justifyContent: 'space-between', alignItems: 'center' }}><span>+</span><span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Energía</span><span>−</span></div>
          <div class="mood-grid grow">
            {MOOD_QUADS.map((q) => (
              <button key={q.key} type="button" class={q.tone} aria-pressed={quad === q.key ? 'true' : 'false'} aria-label={`${q.label}: ${q.desc}`} onClick={() => { setQuad(q.key); setWords([]); setLast(null); setMoreW(false); }} style={compact ? { minHeight: 84 } : undefined}>
                <span class="strong">{q.label}</span><span class="tiny muted">{q.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      {quad != null && (
        <>
          <section class="stack-sm" aria-label="Ponle nombre">
            <span class="label">Ponle nombre exacto (hasta 3)</span>
            <div class="chips">
              {(moreW ? emos : emos.slice(0, SHOW_WORDS)).map((e) => <TChip key={e.word} sm on={words.includes(e.word)} onClick={() => pick(e.word)}>{e.word}</TChip>)}
              {!moreW && <TChip sm icon="plus" onClick={() => setMoreW(true)}>{emos.length - SHOW_WORDS} más</TChip>}
            </div>
            {last && <span class="small emo-def"><b>{last}:</b> {(emos.find((e) => e.word === last) || {}).def}</span>}
          </section>
          {!compact && (
            <>
              <section class="stack-sm" aria-label="Qué influyó">
                <span class="label">¿Qué influyó?</span>
                <div class="chips">
                  {(moreI ? INFLUENCES : INFLUENCES.slice(0, SHOW_INFL)).map((i) => <TChip key={i.key} sm on={infl.includes(i.key)} icon={i.icon} onClick={() => setInfl(toggleIn(infl, i.key, 6))}>{i.label}</TChip>)}
                  {!moreI && <TChip sm icon="plus" onClick={() => setMoreI(true)}>Más</TChip>}
                </div>
              </section>
              {showBody ? (
                <section class="stack-sm" aria-label="Dónde lo sientes">
                  <span class="label">¿Dónde lo sientes en el cuerpo?</span>
                  <div class="chips">{BODY.map((b) => <TChip key={b} sm on={body.includes(b)} onClick={() => setBody(toggleIn(body, b, 5))}>{b}</TChip>)}</div>
                </section>
              ) : <button type="button" class="link-btn" style={{ alignSelf: 'flex-start', minHeight: 32 }} onClick={() => setShowBody(true)}><Icon name="plus" size={15} />Dónde lo sientes en el cuerpo</button>}
              <div class="field"><label for="mnote">Nota (opcional)</label><textarea id="mnote" class="input" rows={2} value={note} maxLength={500} onInput={(e) => setNote(e.currentTarget.value)} placeholder="¿Qué pasó? ¿Qué necesitas?" /></div>
            </>
          )}
          <button type="button" class="btn block" onClick={save}><Icon name="check" size={20} />Guardar check-in · +15 XP</button>
        </>
      )}
    </section>
  );
}

// ---------- Pantalla de Emociones ----------

export function Mood() {
  const s = useApp();
  const today = s.energy.day;
  const [play, setPlay] = useState(null);
  const [tool, setTool] = useState(null);
  const pat = moodPatterns(s, today);
  const calmToday = calmMinutes(s, today);
  const names = distinctEmotions(s);
  return (
    <>
      <main class="screen">
        <TopBar backTo="/areas" />
        <AreaHeader area="emocional" />
        <a href="#/calma" class="card tight calm-link" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
          <div class="row">
            <span class="tile" style={{ background: areaSoft('emocional'), color: areaColor('emocional') }}><Icon name="sparkle" /></span>
            <span class="stack-xs grow"><span class="strong">Calma</span><span class="small muted">Respiraciones, meditaciones guiadas, pausa SOS y herramientas para la mente.{calmToday ? ` Hoy: ${calmToday} min.` : ''}</span></span>
            <Icon name="right" size={18} />
          </div>
        </a>
        <CheckIn onAction={(a) => runAction(a, { setPlay, setTool })} />
        {s.moods.length > 0 && <Pixels s={s} today={today} />}
        {pat.n >= 5 && <Patterns pat={pat} names={names} />}
        {s.moods.length > 0 && <History s={s} today={today} />}
        <AreaMissions area="emocional" />
        <AreaTodos area="emocional" />
      </main>
      <Nav active="areas" />
      {tool === 'descarga' && <WorrySheet onClose={() => setTool(null)} />}
      {tool === 'replantear' && <ThoughtSheet onClose={() => setTool(null)} />}
      {play && <CalmPlayer session={play} onClose={() => setPlay(null)} />}
    </>
  );
}

// Año en píxeles: cada día con el color de su ánimo (como Daylio).
const MONTH_LETTERS = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const QCOLOR = ['var(--mood-0)', 'var(--mood-1)', 'var(--mood-2)', 'var(--mood-3)'];
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Cada ánimo con forma propia además del color: cuadrado = mucha energía, círculo = poca;
// el punto del centro = desagradable. Así no depende solo del color (daltonismo).
export function MoodGlyph({ q, x = 0, y = 0, size = 10, title }) {
  const r = size / 2;
  const high = q === 0 || q === 1;
  const bad = q === 0 || q === 2;
  return (
    <g>
      {title && <title>{title}</title>}
      {high ? <rect x={x} y={y} width={size} height={size} rx={size * 0.18} fill={QCOLOR[q]} /> : <circle cx={x + r} cy={y + r} r={r} fill={QCOLOR[q]} />}
      {bad && <circle cx={x + r} cy={y + r} r={size * 0.17} fill="var(--surface)" />}
    </g>
  );
}

export function MoodKey({ counts }) {
  return (
    <div class="row wrap tiny muted semi" style={{ gap: 12 }}>
      {MOOD_QUADS.map((q) => (
        <span key={q.key} class="row" style={{ gap: 5 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><MoodGlyph q={q.key} x={1} y={1} size={10} /></svg>
          {q.label}{counts ? ` ${counts[q.key]}` : ''}
        </span>
      ))}
    </div>
  );
}

export function Pixels({ s, today }) {
  const year = Number(today.slice(0, 4));
  const map = dayMoods(s, `${year}-01-01`, `${year}-12-31`);
  const cell = 10;
  const gap = 2;
  const left = 16;
  const W = left + 31 * (cell + gap);
  const H = 12 * (cell + gap);
  const days = map.size;
  const counts = [0, 0, 0, 0];
  for (const q of map.values()) counts[q] += 1;
  return (
    <section class="card" aria-label="Tu año en píxeles">
      <div class="between-c"><h2 class="h2">Tu año en píxeles</h2><span class="small muted">{plural(days, 'día', 'días')}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${year}: ${MOOD_QUADS.map((q) => `${q.label} ${counts[q.key]} días`).join(', ')}`}>
        {MONTH_LETTERS.map((l, m) => <text key={m} x="0" y={m * (cell + gap) + cell - 1.5} font-size="9" font-weight="700" fill="var(--muted)" font-family="Figtree, sans-serif">{l}</text>)}
        {Array.from({ length: 12 }, (_, m) => Array.from({ length: 31 }, (_, d) => {
          const key = `${year}-${String(m + 1).padStart(2, '0')}-${String(d + 1).padStart(2, '0')}`;
          const real = new Date(year, m, d + 1).getMonth() === m;
          if (!real) return null;
          const q = map.get(key);
          const future = key > today;
          const x = left + d * (cell + gap);
          const y = m * (cell + gap);
          const label = `${d + 1} de ${MONTH_NAMES[m]}: ${q != null ? MOOD_QUADS[q].label.toLowerCase() : future ? 'todavía no llega' : 'sin check-in'}`;
          if (q != null) return <g key={key}><MoodGlyph q={q} x={x} y={y} size={cell} title={label} />{key === today && <rect x={x - 1} y={y - 1} width={cell + 2} height={cell + 2} rx="3" fill="none" stroke="var(--ink)" stroke-width="1.2" />}</g>;
          return <rect key={key} x={x} y={y} width={cell} height={cell} rx="2.5" fill={future ? 'none' : 'var(--soft-2)'} stroke={future ? 'var(--line)' : key === today ? 'var(--ink)' : 'none'} stroke-width={key === today ? 1.4 : 0.8}><title>{label}</title></rect>;
        }))}
      </svg>
      <MoodKey counts={counts} />
      <span class="tiny muted">Cuadrado: mucha energía. Círculo: poca. Con punto: desagradable. Tus check-ins, uno por uno, están abajo.</span>
    </section>
  );
}

const pct = (v) => `${Math.round((v || 0) * 100)} %`;
const bar = (v) => `${Math.round((v || 0) * 100)}%`; // para CSS: sin espacio

function Compare({ label, yes, no, yesLabel, noLabel, note }) {
  return (
    <div class="stack-xs cmp">
      <span class="semi">{label}</span>
      <div class="cmp-row"><span class="tiny muted semi">{yesLabel}</span><span class="cmp-bar" title={`${yesLabel}: ${pct(yes)} agradable`}><i style={{ width: bar(yes) }} /></span><span class="tiny strong tab-num">{pct(yes)}</span></div>
      <div class="cmp-row"><span class="tiny muted semi">{noLabel}</span><span class="cmp-bar" title={`${noLabel}: ${pct(no)} agradable`}><i style={{ width: bar(no) }} /></span><span class="tiny strong tab-num">{pct(no)}</span></div>
      <span class="tiny muted">{note}</span>
    </div>
  );
}

function Patterns({ pat, names }) {
  const best = Math.max(...pat.weekdays.filter((w) => w.n).map((w) => w.pct || 0));
  return (
    <section class="card" aria-label="Tus patrones">
      <div class="between-c"><h2 class="h2">Tus patrones</h2><span class="small muted">90 días</span></div>
      <span class="small muted">De tus {plural(pat.n, 'check-in', 'check-ins')}, el {pct(pat.pleasant)} fue en el lado agradable. Las barras dicen qué parte de tus check-ins fue agradable en cada caso.</span>
      {pat.sleep && <Compare label="Cuando duermes tu meta" {...pat.sleep} yesLabel="Dormiste" noLabel="No" note={`${plural(pat.sleep.dy, 'día', 'días')} durmiendo tu meta y ${pat.sleep.dn} sin dormirla.`} />}
      {pat.exercise && <Compare label="Días con 20 min de actividad" {...pat.exercise} yesLabel="Con actividad" noLabel="Sin" note={`${plural(pat.exercise.dy, 'día', 'días')} con actividad y ${pat.exercise.dn} sin.`} />}
      {pat.calm && <Compare label="Días con una pausa de calma" {...pat.calm} yesLabel="Con calma" noLabel="Sin" note={`${plural(pat.calm.dy, 'día', 'días')} con calma y ${pat.calm.dn} sin.`} />}
      {!pat.sleep && !pat.exercise && !pat.calm && <span class="small muted">Registra tu sueño y tu actividad unos días más y verás cómo se relacionan con tu ánimo.</span>}
      {pat.influences.length > 0 && (
        <div class="stack-xs">
          <span class="label">Lo que más pesa</span>
          {pat.influences.slice(0, 4).map((x) => (
            <div key={x.key} class="between-c" style={{ minHeight: 30 }}>
              <span class="stack-xs"><span class="semi">{x.label}</span><span class="tiny muted">{plural(x.n, 'check-in', 'check-ins')}</span></span>
              <span class="small strong tab-num" style={{ textAlign: 'right' }}>{pct(x.pct)} agradable{x.other != null && <span class="tiny muted semi" style={{ display: 'block' }}>sin esto: {pct(x.other)}</span>}</span>
            </div>
          ))}
        </div>
      )}
      <div class="stack-xs">
        <span class="label">Por día de la semana</span>
        <div class="wd-bars" role="img" aria-label={pat.weekdays.map((w, i) => `${DAYS_SHORT[i]}: ${w.n ? pct(w.pct) : 'sin datos'}`).join(', ')}>
          {pat.weekdays.map((w, i) => (
            <div key={i} class="cb" title={w.n ? `${pct(w.pct)} agradable en ${plural(w.n, 'check-in', 'check-ins')}` : 'Sin datos'}>
              <span class="tiny muted tab-num" style={{ minHeight: 14 }}>{w.n && w.pct === best ? pct(w.pct) : ''}</span>
              <i style={{ height: `${w.n ? Math.max(4, (w.pct || 0) * 60) : 4}px`, background: w.n ? 'var(--emocional)' : 'var(--soft-2)' }} />
              <span class="tiny muted semi">{DAYS_SHORT[i]}</span>
            </div>
          ))}
        </div>
        <span class="tiny muted">Altura: qué parte de tus check-ins de ese día fue agradable. Se marca el mejor día.</span>
      </div>
      {pat.top.length > 0 && (
        <div class="stack-xs">
          <span class="label">Lo que más sientes (30 días)</span>
          <div class="chips">{pat.top.map((t) => <span key={t.word} class="chip sm"><svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><MoodGlyph q={t.quad} x={1} y={1} size={10} /></svg>{t.word} · {t.n}</span>)}</div>
        </div>
      )}
      <span class="tiny muted">Has nombrado {plural(names, 'emoción distinta', 'emociones distintas')}. Ponerle nombre exacto a lo que sientes ayuda a manejarlo mejor.</span>
    </section>
  );
}

function History({ s, today }) {
  const [all, setAll] = useState(false);
  const list = s.moods.slice(0, all ? 40 : 8);
  return (
    <section class="card flush" aria-label="Tus check-ins">
      <div style={{ padding: '14px 0 4px' }}><h2 class="h2">Tus check-ins</h2></div>
      {list.map((m) => {
        const infl = (m.influences || []).map((k) => (INFLUENCES.find((i) => i.key === k) || {}).label).filter(Boolean);
        return (
          <div class="lrow" key={m.id} style={{ alignItems: 'flex-start', paddingTop: 10, paddingBottom: 10 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0, marginTop: 4 }} role="img" aria-label={MOOD_QUADS[m.quad].label}><MoodGlyph q={m.quad} x={1} y={1} size={12} /></svg>
            <span class="stack-xs grow" style={{ minWidth: 0 }}>
              <span class="semi">{m.words.length ? m.words.map((w) => (emotionOf(w) || { word: w }).word).join(', ') : MOOD_QUADS[m.quad].label}</span>
              {(infl.length > 0 || (m.body || []).length > 0) && <span class="tiny muted">{[infl.join(', '), (m.body || []).length ? `en ${m.body.join(', ').toLowerCase()}` : ''].filter(Boolean).join(' · ')}</span>}
              {m.note && <span class="small muted">{m.note}</span>}
            </span>
            <span class="tiny muted" style={{ whiteSpace: 'nowrap' }}>{relDay(m.day, today)}</span>
          </div>
        );
      })}
      {s.moods.length > 8 && <button type="button" class="lrow" style={{ justifyContent: 'center', fontWeight: 700 }} onClick={() => setAll(!all)}>{all ? 'Ver menos' : 'Ver más'}</button>}
    </section>
  );
}
