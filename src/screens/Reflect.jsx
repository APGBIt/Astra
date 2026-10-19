import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Sheet, SheetHead, TChip, Ring, toast, areaColor, areaSoft, areaInk, plural, money } from '../ui/kit.jsx';
import { act } from '../app/store.js';
import { fmtDay, fmtShort, addDays, diffDays } from '../app/dates.js';
import { WHO5_ITEMS, WHO5_OPTIONS, WHO5_LOW, WHEEL, WHEEL_AREA, VALUES, VALUE, HELP } from '../game/wellness.js';
import {
  healthHighlights, addWellbeing, wellbeingInfo, addWheel, wheelInfo, setValues, saveReview, reviewFor, weekSummary, weekStart,
} from '../game/mind.js';
import { HelpSheet, Scale } from './Calm.jsx';

// Reflexión y bienestar: lo destacado de la salud, el chequeo OMS-5, la rueda de la vida, tus valores
// y la revisión de la semana.

// ---------- Salud: lo destacado de la semana ----------

export function HealthHighlights({ s, today }) {
  const list = healthHighlights(s, today);
  if (!list.length) return null;
  return (
    <section class="card" aria-label="Lo destacado de la semana">
      <h2 class="h2">Lo destacado de la semana</h2>
      {list.map((x) => (
        <div key={x.key} class="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          <span class="tile sm" style={{ background: x.tone === 'good' ? 'var(--good-soft)' : x.tone === 'vit' ? 'var(--vit-soft)' : areaSoft('salud'), color: x.tone === 'good' ? 'var(--good-ink)' : x.tone === 'vit' ? 'var(--vit-ink)' : areaColor('salud') }}><Icon name={x.icon} size={17} /></span>
          <span class="small grow" style={{ paddingTop: 6 }}>{x.text}</span>
        </div>
      ))}
    </section>
  );
}

// ---------- Bienestar OMS-5 ----------

function Spark({ values }) {
  if (values.length < 2) return null;
  const W = 120; const H = 34;
  const pts = values.map((v, i) => [4 + (i * (W - 8)) / (values.length - 1), H - 4 - (v / 100) * (H - 8)]);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path d={`M${pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' L')}`} fill="none" stroke="var(--salud)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 3.6 : 2.4} fill={i === pts.length - 1 ? 'var(--salud)' : 'var(--surface)'} stroke="var(--salud)" stroke-width="1.6" />)}
    </svg>
  );
}

export function WellbeingCard({ s, today }) {
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const w = wellbeingInfo(s, today);
  const trend = w.list.slice(0, 6).reverse().map((x) => x.score);
  return (
    <section class="card" aria-label="Bienestar de dos semanas">
      <div class="between-c"><h2 class="h2">Tu bienestar</h2>{w.due && w.last && <span class="chip sm tone-xp">Toca hacerlo</span>}</div>
      {w.last ? (
        <>
          <div class="row" style={{ gap: 14 }}>
            <Ring value={w.last.score / 100} size={66} stroke={7} color={w.low ? 'var(--xp)' : areaColor('salud')} label={`Bienestar ${w.last.score} de 100`}>
              <text x="33" y="39" text-anchor="middle" font-family="Bricolage Grotesque, sans-serif" font-size="19" font-weight="800" fill="var(--ink)">{w.last.score}</text>
            </Ring>
            <span class="stack-xs grow">
              <span class="strong">{w.low ? 'Bienestar bajo estas semanas' : w.last.score >= 76 ? 'Muy buen bienestar' : 'Buen bienestar'}</span>
              <span class="tiny muted semi">{fmtDay(w.last.day, { weekdayName: false })}{w.change == null ? '' : w.change === 0 ? ' · igual que el anterior' : ` · ${w.change > 0 ? '+' : '−'}${Math.abs(w.change)} frente al anterior${Math.abs(w.change) >= 10 ? ' (un cambio importante)' : ''}`}</span>
            </span>
            <Spark values={trend} />
          </div>
          {w.low && (
            <div class="note tone-xp"><Icon name="heart" size={18} /><span>Estas dos semanas han sido pesadas. No es un diagnóstico, pero si sigue así o te preocupa, conversa con alguien de confianza o con un profesional. <button type="button" class="link-btn" style={{ display: 'inline', minHeight: 0, padding: 0 }} onClick={() => setHelp(true)}>Ver ayuda</button></span></div>
          )}
        </>
      ) : <span class="small muted">Cinco preguntas sobre tus últimas dos semanas (el índice OMS-5 de la Organización Mundial de la Salud). Toma un minuto y te deja ver cómo cambias.</span>}
      <button type="button" class={`btn sm ${w.due ? '' : 'soft'}`} style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}><Icon name="pulse" size={17} />{w.last ? (w.due ? 'Hacer el chequeo' : 'Repetir el chequeo') : 'Hacer el chequeo · 1 min'}</button>
      {open && <Who5Sheet s={s} today={today} onClose={() => setOpen(false)} />}
      {help && <HelpSheet onClose={() => setHelp(false)} />}
    </section>
  );
}

export function Who5Sheet({ s, today, onClose }) {
  const [vals, setVals] = useState([null, null, null, null, null]);
  const [res, setRes] = useState(null);
  const [help, setHelp] = useState(false);
  const prev = wellbeingInfo(s, today).last;
  const ok = vals.every((v) => v != null);
  const save = () => {
    const e = act((st, t, ev) => addWellbeing(st, vals, t, ev));
    if (e) setRes(e);
  };
  if (res) {
    const low = res.score < WHO5_LOW;
    const change = prev ? res.score - prev.score : null;
    return (
      <Sheet onClose={onClose} label="Tu bienestar">
        <SheetHead title="Tu bienestar" onClose={onClose} />
        <div class="row" style={{ gap: 14 }}>
          <Ring value={res.score / 100} size={86} stroke={9} color={low ? 'var(--xp)' : areaColor('salud')} label={`${res.score} de 100`}>
            <text x="43" y="50" text-anchor="middle" font-family="Bricolage Grotesque, sans-serif" font-size="24" font-weight="800" fill="var(--ink)">{res.score}</text>
          </Ring>
          <span class="stack-xs grow">
            <span class="h2">{low ? 'Bienestar bajo' : res.score >= 76 ? 'Muy buen bienestar' : 'Buen bienestar'}</span>
            <span class="small muted">de 100 · más alto es mejor{change == null ? '' : change === 0 ? ' · igual que la vez anterior' : ` · ${change > 0 ? '+' : '−'}${Math.abs(change)} frente a la vez anterior`}</span>
          </span>
        </div>
        {low ? (
          <div class="note tone-xp"><Icon name="heart" size={18} /><span>Tus respuestas dicen que estas dos semanas han sido difíciles. No es un diagnóstico. Cuídate con lo que te ayuda (dormir, moverte, hablar con alguien) y, si sigue así o te preocupa, busca a un profesional de la salud.</span></div>
        ) : <span class="small muted">Repítelo en dos semanas para ver cómo cambias. Un cambio de 10 puntos o más es importante.</span>}
        {low && <button type="button" class="btn soft block" onClick={() => setHelp(true)}><Icon name="phone" size={18} />Ayuda ({HELP.line} y {HELP.emergency})</button>}
        <button type="button" class="btn block" onClick={onClose}>Listo</button>
        {help && <HelpSheet onClose={() => setHelp(false)} />}
      </Sheet>
    );
  }
  return (
    <Sheet onClose={onClose} label="Chequeo de bienestar">
      <SheetHead title="Tus últimas dos semanas" onClose={onClose} />
      <span class="small muted">Para cada frase, elige qué tan seguido te has sentido así en las últimas dos semanas.</span>
      {WHO5_ITEMS.map((q, i) => (
        <div key={i} class="stack-sm who5">
          <span class="strong">{i + 1}. {q}</span>
          <div class="chips">{WHO5_OPTIONS.map(([v, l]) => <TChip key={v} sm on={vals[i] === v} onClick={() => setVals(vals.map((x, j) => (j === i ? v : x)))}>{l}</TChip>)}</div>
        </div>
      ))}
      <button type="button" class="btn block" disabled={!ok} onClick={save}><Icon name="check" size={20} />Ver mi resultado</button>
      <span class="tiny muted">Índice de bienestar OMS-5 (WHO-5), de la Organización Mundial de la Salud.</span>
    </Sheet>
  );
}

// Para Hoy: el chequeo cada dos semanas.
export function Who5Prompt({ s, today }) {
  const [open, setOpen] = useState(false);
  const w = wellbeingInfo(s, today);
  return (
    <section class="card" aria-label="Chequeo de bienestar" style={{ background: areaSoft('salud'), borderColor: 'transparent' }}>
      <div class="row-top">
        <span class="tile" style={{ background: 'var(--surface)', color: areaColor('salud') }}><Icon name="pulse" /></span>
        <div class="stack-xs grow"><span class="strong">¿Cómo han sido tus últimas dos semanas?</span><span class="small" style={{ color: areaInk('salud') }}>{w.last ? `Tu último chequeo fue el ${fmtShort(w.last.day)}: ${w.last.score} de 100.` : 'Cinco preguntas, un minuto.'}</span></div>
      </div>
      <button type="button" class="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>Hacer el chequeo</button>
      {open && <Who5Sheet s={s} today={today} onClose={() => setOpen(false)} />}
    </section>
  );
}

// ---------- Rueda de la vida ----------

function WheelRadar({ last, prev, size = 300 }) {
  const n = WHEEL.length;
  const cx = size / 2;
  const R = size / 2 - 56;
  const pt = (i, r) => [cx + r * Math.sin((2 * Math.PI * i) / n), cx - r * Math.cos((2 * Math.PI * i) / n)];
  const poly = (sc) => WHEEL.map((a, i) => pt(i, (R * (sc[a.id] || 0)) / 10).map((x) => x.toFixed(1)).join(',')).join(' ');
  return (
    <svg width="100%" viewBox={`-40 0 ${size + 80} ${size}`} role="img" aria-label={`Rueda de la vida: ${WHEEL.map((a) => `${a.label} ${last.scores[a.id]}`).join(', ')}`} style={{ alignSelf: 'center', maxWidth: 380 }}>
      {[10, 7.5, 5, 2.5].map((f) => <polygon key={f} points={WHEEL.map((_, i) => pt(i, (R * f) / 10).map((x) => x.toFixed(1)).join(',')).join(' ')} fill={f === 10 ? 'var(--soft)' : 'none'} stroke="var(--line-2)" stroke-width="1.1" />)}
      {WHEEL.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={cx} y1={cx} x2={x} y2={y} stroke="var(--line)" stroke-width="1" />; })}
      {prev && <polygon points={poly(prev.scores)} fill="none" stroke="var(--muted)" stroke-width="1.6" stroke-dasharray="4 4" />}
      <polygon points={poly(last.scores)} fill="var(--crecimiento)" fill-opacity="0.14" stroke="var(--crecimiento)" stroke-width="2.4" stroke-linejoin="round" />
      {WHEEL.map((a, i) => { const [x, y] = pt(i, (R * last.scores[a.id]) / 10); return <circle key={a.id} cx={x} cy={y} r="4.5" fill={`var(--${a.color})`} stroke="var(--surface)" stroke-width="2" />; })}
      {WHEEL.map((a, i) => {
        const [x, y] = pt(i, R + 22);
        const anchor = Math.abs(x - cx) < 8 ? 'middle' : x > cx ? 'start' : 'end';
        const words = a.label.split(' ');
        const lines = a.label.length > 12 && words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [a.label];
        return (
          <text key={a.id} x={x} y={y + 4 - (lines.length - 1) * 6} text-anchor={anchor} font-size="11.5" font-weight="800" fill="var(--ink)" font-family="Figtree, sans-serif">
            {lines.map((l, k) => <tspan key={k} x={x} dy={k ? 13 : 0}>{l}</tspan>)}
            <tspan x={x} dy="13" font-weight="700" fill="var(--muted)">{last.scores[a.id]}</tspan>
          </text>
        );
      })}
    </svg>
  );
}

export function WheelCard({ s, today }) {
  const [open, setOpen] = useState(false);
  const w = wheelInfo(s);
  const due = !w.last || diffDays(w.last.day, today) >= 30;
  return (
    <section class="card" aria-label="Rueda de la vida">
      <div class="between-c"><h2 class="h2">Rueda de la vida</h2>{w.last && <span class="small muted">{fmtShort(w.last.day)}</span>}</div>
      {w.last ? (
        <>
          <WheelRadar last={w.last} prev={w.prev} />
          <span class="small muted">Promedio {w.avg.toFixed(1)} de 10{w.prev ? ' · la línea punteada es la vez anterior' : ''}. Lo más bajo: <b>{w.low.map((id) => WHEEL.find((a) => a.id === id).label.toLowerCase()).join(' y ')}</b>.</span>
          {WHEEL_AREA[w.low[0]] && <a class="link-btn" style={{ alignSelf: 'flex-start' }} href={`#/meta/nueva?area=${WHEEL_AREA[w.low[0]]}`}><Icon name="map" size={16} />Crear una meta para mejorarlo</a>}
        </>
      ) : <span class="small muted">Califica del 1 al 10 tu satisfacción de hoy en cada área de tu vida. Ver la rueda completa muestra dónde poner energía este mes.</span>}
      <button type="button" class={`btn sm ${due ? '' : 'soft'}`} style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}><Icon name="target" size={17} />{w.last ? (due ? 'Hacer la de este mes' : 'Actualizar') : 'Hacer mi rueda · 2 min'}</button>
      {open && <WheelSheet s={s} last={w.last} onClose={() => setOpen(false)} />}
    </section>
  );
}

function WheelSheet({ last, onClose }) {
  const [sc, setSc] = useState(() => Object.fromEntries(WHEEL.map((a) => [a.id, last ? last.scores[a.id] : null])));
  const ok = WHEEL.every((a) => sc[a.id] != null);
  const save = () => { act((st, t, ev) => addWheel(st, sc, t, ev)); toast('Rueda guardada · +15 XP de Sabiduría', 'target'); onClose(); };
  return (
    <Sheet onClose={onClose} label="Rueda de la vida">
      <SheetHead title="Rueda de la vida" onClose={onClose} />
      <span class="small muted">Tu satisfacción en cada área, del 1 (muy baja) al 10 (plena). Sin pensarlo mucho: lo primero que sientas.</span>
      {WHEEL.map((a) => (
        <div key={a.id} class="stack-xs">
          <span class="strong">{a.label}</span>
          <Scale value={sc[a.id]} onChange={(v) => setSc({ ...sc, [a.id]: v })} from={1} to={10} label={a.label} />
        </div>
      ))}
      <button type="button" class="btn block" disabled={!ok} onClick={save}><Icon name="check" size={20} />Guardar</button>
    </Sheet>
  );
}

// ---------- Valores ----------

export function ValuesCard({ s }) {
  const [open, setOpen] = useState(false);
  const keys = s.mind.values.keys;
  return (
    <section class="card" aria-label="Tus valores">
      <div class="between-c"><h2 class="h2">Tus valores</h2><button type="button" class="link-btn" onClick={() => setOpen(true)}>{keys.length ? 'Cambiar' : 'Elegir'}<Icon name="right" size={16} /></button></div>
      {keys.length ? (
        <>
          <div class="chips">{keys.map((k) => <span key={k} class="chip" style={{ background: areaSoft('crecimiento'), color: areaInk('crecimiento') }}><Icon name="star" size={13} />{VALUE[k].label}</span>)}</div>
          <span class="small muted">Lo que más te importa. Cada semana, en tu revisión, miras si viviste de acuerdo con ellos.</span>
        </>
      ) : <span class="small muted">Elige de 3 a 5 valores: lo que más te importa en la vida. Te ayudan a decidir y a medir lo que de verdad cuenta.</span>}
      {open && <ValuesSheet keys={keys} onClose={() => setOpen(false)} />}
    </section>
  );
}

function ValuesSheet({ keys, onClose }) {
  const [sel, setSel] = useState(keys);
  const [last, setLast] = useState(null);
  const toggle = (id) => { if (sel.includes(id)) { setSel(sel.filter((x) => x !== id)); setLast(null); } else if (sel.length < 5) { setSel([...sel, id]); setLast(id); } };
  const save = () => { act((st, t) => setValues(st, sel, t)); toast('Valores guardados', 'star'); onClose(); };
  return (
    <Sheet onClose={onClose} label="Tus valores">
      <SheetHead title="Tus valores" onClose={onClose} />
      <span class="small muted">Elige de 3 a 5. No hay respuestas correctas: piensa en lo que te gustaría que dijeran de ti.</span>
      <div class="chips">{VALUES.map((v) => <TChip key={v.id} sm on={sel.includes(v.id)} onClick={() => toggle(v.id)}>{v.label}</TChip>)}</div>
      {last && <span class="small emo-def"><b>{VALUE[last].label}:</b> {VALUE[last].desc}</span>}
      <button type="button" class="btn block" disabled={sel.length < 3} onClick={save}><Icon name="check" size={20} />Guardar · {sel.length} de 5</button>
    </Sheet>
  );
}

// ---------- Revisión de la semana ----------

export function WeeklyReviewCard({ s, today }) {
  const [open, setOpen] = useState(false);
  const r = reviewFor(s, today);
  const past = s.mind.reviews.filter((x) => x.week !== weekStart(today)).slice(0, 3);
  return (
    <section class="card" aria-label="Revisión de la semana">
      <div class="between-c"><h2 class="h2">Tu semana en palabras</h2>{r && <span class="chip sm tone-good"><Icon name="check" size={13} />Hecha</span>}</div>
      {r ? (
        <div class="stack-xs">
          {r.good && <span class="small"><b>Salió bien:</b> {r.good}</span>}
          {r.hard && <span class="small"><b>Costó:</b> {r.hard}</span>}
          {r.learned && <span class="small"><b>Aprendí:</b> {r.learned}</span>}
          {r.focus && <span class="small"><b>Foco de la próxima:</b> {r.focus}</span>}
        </div>
      ) : <span class="small muted">Diez minutos para mirar tu semana: qué salió bien, qué costó, qué aprendiste y en qué te vas a enfocar. +20 XP de Sabiduría.</span>}
      <button type="button" class={`btn sm ${r ? 'soft' : ''}`} style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}><Icon name="edit" size={17} />{r ? 'Editar' : 'Hacer la revisión'}</button>
      {past.length > 0 && (
        <details class="small">
          <summary class="semi" style={{ cursor: 'pointer', minHeight: 32 }}>Semanas anteriores</summary>
          <div class="stack-sm" style={{ paddingTop: 6 }}>{past.map((x) => <div key={x.id} class="stack-xs"><span class="tiny strong muted">Semana del {fmtShort(x.week)}</span>{x.focus && <span>Foco: {x.focus}</span>}{x.learned && <span class="muted">Aprendí: {x.learned}</span>}</div>)}</div>
        </details>
      )}
      {open && <ReviewSheet s={s} today={today} onClose={() => setOpen(false)} />}
    </section>
  );
}

function ReviewSheet({ s, today, onClose }) {
  const r = reviewFor(s, today);
  const sum = weekSummary(s, today);
  const vals = s.mind.values.keys;
  const [p, setP] = useState({ good: r ? r.good : '', hard: r ? r.hard : '', learned: r ? r.learned : '', focus: r ? r.focus : '', values: r ? { ...(r.values || {}) } : {}, focusTodo: false });
  const set = (k) => (e) => setP({ ...p, [k]: e.currentTarget.value });
  const save = () => { act((st, t, ev) => saveReview(st, p, t, ev)); toast(r ? 'Revisión actualizada' : 'Semana cerrada · +20 XP de Sabiduría', 'book'); onClose(); };
  const moods = sum.moods.reduce((a, b) => a + b, 0);
  return (
    <Sheet onClose={onClose} label="Revisión de la semana">
      <SheetHead title="Tu semana" onClose={onClose} />
      <div class="sleep-kpis">
        <div><span class="v tab-num">{sum.missions}</span><span class="l">misiones</span></div>
        <div><span class="v tab-num">{sum.todos}</span><span class="l">pendientes hechos</span></div>
        <div><span class="v tab-num">{sum.sleep != null ? `${sum.sleep.toFixed(1)} h` : '—'}</span><span class="l">sueño promedio</span></div>
        <div><span class="v tab-num">{sum.exercise}</span><span class="l">min de actividad</span></div>
        <div><span class="v tab-num">{sum.calm}</span><span class="l">min de calma</span></div>
        <div><span class="v tab-num">{moods ? `${Math.round(((sum.moods[1] + sum.moods[3]) / moods) * 100)} %` : '—'}</span><span class="l">check-ins agradables</span></div>
      </div>
      {sum.spent > 0 && <span class="small muted">Gastaste {money(sum.spent)} esta semana{sum.wins ? ` y anotaste ${plural(sum.wins, 'logro', 'logros')}` : ''}.</span>}
      <div class="field"><label for="rv-g">¿Qué salió bien?</label><textarea id="rv-g" class="input" rows={2} value={p.good} maxLength={800} onInput={set('good')} /></div>
      <div class="field"><label for="rv-h">¿Qué te costó?</label><textarea id="rv-h" class="input" rows={2} value={p.hard} maxLength={800} onInput={set('hard')} /></div>
      <div class="field"><label for="rv-l">¿Qué aprendiste?</label><textarea id="rv-l" class="input" rows={2} value={p.learned} maxLength={800} onInput={set('learned')} /></div>
      <div class="field"><label for="rv-f">Tu foco para la próxima semana</label><input id="rv-f" class="input" value={p.focus} maxLength={120} onInput={set('focus')} placeholder="Una sola cosa" /></div>
      {p.focus.trim() && !(r && r.todo) && (
        <label class="between-c panel" style={{ cursor: 'pointer' }}>
          <span class="small semi">Agregarlo a Pendientes para esta semana</span>
          <input type="checkbox" checked={p.focusTodo} onChange={(e) => setP({ ...p, focusTodo: e.currentTarget.checked })} style={{ width: 22, height: 22 }} />
        </label>
      )}
      {vals.length > 0 && (
        <div class="stack-sm">
          <span class="label">¿Viviste según tus valores? (1 a 5)</span>
          {vals.map((k) => (
            <div key={k} class="stack-xs">
              <span class="semi">{VALUE[k].label}</span>
              <Scale value={p.values[k] || null} onChange={(v) => setP({ ...p, values: { ...p.values, [k]: v } })} from={1} to={5} label={VALUE[k].label} />
            </div>
          ))}
        </div>
      )}
      <button type="button" class="btn block" onClick={save}><Icon name="check" size={20} />{r ? 'Guardar' : 'Cerrar la semana · +20 XP'}</button>
    </Sheet>
  );
}

// Para Hoy: el fin de semana, si no has cerrado la semana.
export function ReviewPrompt() {
  return (
    <a href="#/cronica" class="row" style={{ gap: 14, padding: 16, borderRadius: 20, background: 'var(--crecimiento-soft)', color: 'var(--crecimiento-ink)', textDecoration: 'none' }}>
      <span class="tile" style={{ background: 'var(--surface)', color: 'var(--crecimiento)' }}><Icon name="book" /></span>
      <span class="stack-xs grow"><span class="strong">Cierra tu semana</span><span class="small">Qué salió bien, qué costó y tu foco para la próxima · +20 XP.</span></span>
      <Icon name="right" size={18} />
    </a>
  );
}

export { addDays };
