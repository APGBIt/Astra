// Salud (1.10): actividad con intensidad y días de fuerza, medicinas y suplementos con horario, y tus últimas semanas.
import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Sheet, SheetHead, TChip, NumberChips, Bar, Switch, toast, ask, areaColor, areaSoft, num } from '../ui/kit.jsx';
import { act } from '../app/store.js';
import { fmtShort, DAYS_SHORT } from '../app/dates.js';
import { EXERCISE_TYPES } from '../game/content.js';
import { fmtHours, fmtClock, timeToMin } from '../game/logic.js';
import {
  activityWeek, INTENSITIES, typeOf, dosesFor, logDose, medsToday, medAdherence, addMed, updateMed, archiveMed, restoreMed, removeMed,
  MED_KINDS, healthWeeks, TREND_METRICS, trendOf,
} from '../game/health.js';

const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const pct = (v) => `${Math.round((v || 0) * 100)} %`;
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// ---------- Actividad ----------

export function ActivityCard({ s, today, onLog }) {
  const ex = activityWeek(s, today);
  const left = Math.max(0, ex.goal - ex.equiv);
  return (
    <section class="card" aria-label="Actividad de la semana">
      <div class="between-c"><h2 class="h2">Actividad de la semana</h2><span class="small muted tab-num">{ex.equiv} de {ex.goal} min</span></div>
      <Bar value={ex.equiv / ex.goal} size="lg" color={areaColor('salud')} label={`${ex.equiv} de ${ex.goal} minutos de actividad en 7 días`} />
      <span class="small muted">
        {ex.equiv >= ex.goal ? 'Cumpliste lo que recomienda la OMS: 150 minutos moderados (o 75 intensos) a la semana.' : `La OMS recomienda 150 minutos moderados a la semana (o 75 intensos). Te faltan ${left}.`}
        {ex.vig > 0 ? ` Tus ${ex.vig} min intensos cuentan doble.` : ''}
      </span>
      <div class="between-c" style={{ gap: 12 }}>
        <span class="stack-xs" style={{ gap: 6, flex: 1 }}>
          <span class="small semi">Fuerza: {ex.strength} de {ex.strengthGoal} días</span>
          <span class="prog-dots" aria-hidden="true">{Array.from({ length: ex.strengthGoal }, (_, i) => <i key={i} class={i < ex.strength ? 'on' : ''} style={i < ex.strength ? { background: areaColor('salud') } : undefined} />)}</span>
        </span>
        <span class="tiny muted" style={{ flex: 1.4 }}>Pesas, ligas o tu propio peso, 2 días a la semana (OMS).</span>
      </div>
      {ex.byType.length > 0 && (
        <div class="chips">{ex.byType.map(([k, v]) => { const t = typeOf(k); return <span key={k} class="chip sm"><Icon name={t.icon} size={13} />{t.label} · {v} min</span>; })}</div>
      )}
      <button type="button" class="btn sm soft" style={{ alignSelf: 'flex-start' }} onClick={onLog}><Icon name="dumbbell" size={18} />Registrar actividad</button>
    </section>
  );
}

export function ExerciseSheet({ onClose, onSave }) {
  const [type, setType] = useState(() => { try { return localStorage.getItem('astra.ui.exType') || 'caminar'; } catch { return 'caminar'; } });
  const [min, setMin] = useState(30);
  const [inten, setInten] = useState(() => typeOf(type).intensity || 'moderada');
  const [strength, setStrength] = useState(() => !!typeOf(type).strength);
  const pick = (k) => {
    setType(k);
    setInten(typeOf(k).intensity || 'moderada');
    setStrength(!!typeOf(k).strength);
    try { localStorage.setItem('astra.ui.exType', k); } catch { /* sin almacenamiento */ }
  };
  const info = INTENSITIES.find(([k]) => k === inten);
  return (
    <Sheet onClose={onClose} label="Registrar actividad">
      <SheetHead title="Registrar actividad" onClose={onClose} />
      <div class="stack-sm">
        <span class="label">¿Qué hiciste?</span>
        <div class="chips" role="group" aria-label="Tipo de actividad">{EXERCISE_TYPES.map((t) => <TChip key={t.key} sm icon={t.icon} on={type === t.key} onClick={() => pick(t.key)}>{t.label}</TChip>)}</div>
      </div>
      <div class="stack-sm">
        <span class="label">Minutos</span>
        <NumberChips value={min} onChange={setMin} presets={[10, 20, 30, 45, 60]} format={(v) => `${v} min`} unit="min" min={1} max={600} label="Minutos de actividad" />
      </div>
      <div class="stack-sm">
        <span class="label">¿Qué tan intensa?</span>
        <div class="seg" role="tablist" aria-label="Intensidad">{INTENSITIES.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={inten === k ? 'true' : 'false'} onClick={() => setInten(k)}>{l}</button>)}</div>
        <span class="small muted">{info[2]}{inten === 'intensa' ? ' Cuenta doble para tu meta de la semana.' : ''}</span>
      </div>
      <label class="between-c panel" style={{ cursor: 'pointer' }}>
        <span class="stack-xs"><span class="semi">Trabajé fuerza</span><span class="small muted">Pesas, ligas o ejercicios con tu peso (sentadillas, planchas).</span></span>
        <Switch checked={strength} onChange={setStrength} label="Trabajé fuerza" />
      </label>
      <span class="small muted">Se suma a tu ejercicio de hoy y da XP de Vigor.</span>
      <button type="button" class="btn block" disabled={!min} onClick={() => onSave(min, type, inten, strength)}><Icon name="check" size={20} />Guardar</button>
    </Sheet>
  );
}

// ---------- Medicinas y suplementos ----------

// Una toma del día: el círculo la marca como tomada; «Omitir» si hoy no la tomas. También se usa en Hoy.
export function DoseRow({ d, late = false, onMark, href = null }) {
  const done = d.status === 'si';
  const skipped = d.status === 'no';
  const Body = href ? 'a' : 'span';
  return (
    <div class={`mrow ${done ? 'done' : ''}`}>
      <button type="button" class="check" aria-pressed={done ? 'true' : 'false'} aria-label={done ? `Desmarcar ${d.med.name}` : `Marcar ${d.med.name} de las ${fmtClock(d.time)} como tomada`} onClick={() => onMark(done ? null : 'si')}>
        <span>{done && <Icon name="check" size={16} stroke={2.8} />}</span>
      </button>
      <Body class="body" href={href || undefined} style={{ textDecoration: 'none' }}>
        <span class="title">{d.med.name}{d.med.dose ? ` · ${d.med.dose}` : ''}</span>
        <span class="meta"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}><Icon name="pill" size={13} />{fmtClock(d.time)}</span>{skipped ? <span>· omitida</span> : late && !done ? <span class="late" style={{ whiteSpace: 'nowrap' }}>· atrasada</span> : null}</span>
      </Body>
      {!done && !skipped && <button type="button" class="link-btn muted" style={{ fontSize: 13, minHeight: 40 }} onClick={() => onMark('no')} aria-label={`Omitir ${d.med.name} de las ${fmtClock(d.time)}`}>Omitir</button>}
      {skipped && <button type="button" class="link-btn muted" style={{ fontSize: 13, minHeight: 40 }} onClick={() => onMark(null)} aria-label={`Deshacer: ${d.med.name} omitida`}>Deshacer</button>}
    </div>
  );
}

export function MedsCard({ s, today, onAdd, onList }) {
  const now = nowMin();
  const mt = medsToday(s, today, now);
  const meds = (s.meds || []).filter((m) => !m.archived);
  const mark = (d, st) => {
    act((x, t, ev) => logDose(x, today, d.key, st, t, ev));
    if (st === 'si') toast(`${d.med.name}: tomada`, 'pill');
  };
  return (
    <section class="card" aria-label="Medicinas y suplementos">
      <div class="between-c" style={{ alignItems: 'flex-start' }}>
        <span class="stack-xs"><h2 class="h2">Medicinas y suplementos</h2>{mt.total > 0 && <span class="small muted">{mt.taken} de {mt.total} {mt.total === 1 ? 'toma' : 'tomas'} hoy{mt.taken === mt.total ? ' · +3 XP de Vigor' : ''}</span>}</span>
        {meds.length > 0 ? <button type="button" class="link-btn" style={{ flexShrink: 0 }} onClick={onList}>Todas<Icon name="right" size={16} /></button> : <button type="button" class="link-btn" style={{ flexShrink: 0 }} onClick={onAdd}>Agregar<Icon name="plus" size={16} /></button>}
      </div>
      {!meds.length && <span class="small muted">Anota lo que tomas y a qué hora: te aviso y marcas cada toma. Si se te pasa una, no pierdes nada en el juego.</span>}
      {meds.length > 0 && !mt.total && <span class="small muted">Hoy no te toca ninguna.</span>}
      {mt.total > 0 && <div>{mt.list.map((d) => <DoseRow key={d.key} d={d} late={timeToMin(d.time) + 60 < now} onMark={(st) => mark(d, st)} />)}</div>}
    </section>
  );
}

const schedText = (m) => `${m.times.map(fmtClock).join(', ')} · ${m.days ? DAY_ORDER.filter((d) => m.days.includes(d)).map((d) => DAYS_SHORT[d].toLowerCase()).join(', ') : 'todos los días'}`;

export function MedsSheet({ s, today, onClose, onEdit }) {
  const active = (s.meds || []).filter((m) => !m.archived);
  const old = (s.meds || []).filter((m) => m.archived);
  return (
    <Sheet onClose={onClose} label="Medicinas y suplementos">
      <SheetHead title="Medicinas y suplementos" onClose={onClose} />
      {active.map((m) => {
        const a = medAdherence(s, m, today);
        return (
          <button key={m.id} type="button" class="lrow" style={{ minHeight: 64 }} onClick={() => onEdit(m.id)}>
            <span class="tile sm" style={{ background: areaSoft('salud'), color: areaColor('salud') }}><Icon name="pill" size={18} /></span>
            <span class="stack-xs grow" style={{ minWidth: 0 }}>
              <span class="semi clip">{m.name}{m.dose ? ` · ${m.dose}` : ''}</span>
              <span class="tiny muted semi">{schedText(m)}</span>
              {a.pct != null && <span class="tiny semi" style={{ color: a.pct >= 0.9 ? 'var(--good-ink)' : a.pct >= 0.7 ? 'var(--xp-ink)' : 'var(--vit-ink)' }}>Tomaste {pct(a.pct)} de las tomas en 30 días ({a.taken} de {a.total})</span>}
            </span>
            <Icon name="right" size={16} />
          </button>
        );
      })}
      <button type="button" class="btn ghost block" onClick={() => onEdit(null)}><Icon name="plus" size={18} />Agregar medicina o suplemento</button>
      {old.length > 0 && (
        <details class="small">
          <summary class="semi" style={{ cursor: 'pointer', minHeight: 32 }}>Ya no las tomas · {old.length}</summary>
          {old.map((m) => (
            <div key={m.id} class="between-c" style={{ minHeight: 44 }}>
              <span class="muted">{m.name} · hasta el {fmtShort(m.archived)}</span>
              <button type="button" class="link-btn" onClick={() => act((x) => restoreMed(x, m.id))}>Volver a tomarla</button>
            </div>
          ))}
        </details>
      )}
      <span class="tiny muted">Astra te ayuda a acordarte; no reemplaza las indicaciones de tu médico. Para algo delicado, usa también la alarma del teléfono.</span>
    </Sheet>
  );
}

export function MedSheet({ s, id, onClose }) {
  const today = s.energy.day;
  const m = id ? (s.meds || []).find((x) => x.id === id) : null;
  const [name, setName] = useState(m ? m.name : '');
  const [dose, setDose] = useState(m ? m.dose : '');
  const [kind, setKind] = useState(m ? m.kind : 'medicina');
  const [times, setTimes] = useState(m ? [...m.times] : ['08:00']);
  const [days, setDays] = useState(m && m.days ? [...m.days] : null);
  const [end, setEnd] = useState(m && m.end && !m.archived ? m.end : '');
  const [note, setNote] = useState(m ? m.note : '');
  const ok = name.trim().length > 1 && times.length > 0 && (!days || days.length > 0);
  const save = () => {
    const p = { name, dose, kind, times, days, end: end || null, note };
    act((x, t) => (m ? updateMed(x, m.id, p, t) : addMed(x, p, t)));
    toast(m ? 'Guardado' : `${name.trim()} agregada`, 'pill');
    onClose();
  };
  const setTime = (i, v) => setTimes(times.map((x, j) => (j === i ? v : x)));
  const toggleDay = (d) => { const cur = days || [0, 1, 2, 3, 4, 5, 6]; const nx = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]; setDays(nx.length === 7 ? null : nx); };
  return (
    <Sheet onClose={onClose} label={m ? m.name : 'Nueva medicina o suplemento'}>
      <SheetHead title={m ? m.name : 'Agregar'} onClose={onClose} />
      <div class="seg" role="tablist" aria-label="Tipo">{MED_KINDS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={kind === k ? 'true' : 'false'} onClick={() => setKind(k)}>{l}</button>)}</div>
      <div class="field"><label for="mdn">Nombre</label><input id="mdn" class="input" value={name} maxLength={50} onInput={(e) => setName(e.currentTarget.value)} placeholder={kind === 'medicina' ? 'Ej. Losartán' : 'Ej. Vitamina D'} autoFocus={!m} /></div>
      <div class="field"><label for="mdd">Dosis (opcional)</label><input id="mdd" class="input" value={dose} maxLength={40} onInput={(e) => setDose(e.currentTarget.value)} placeholder="Ej. 50 mg, 1 tableta" /></div>
      <div class="stack-sm">
        <span class="label">¿A qué hora?</span>
        {times.map((t, i) => (
          <div key={i} class="row" style={{ gap: 8 }}>
            <input type="time" class="input grow" value={t} onInput={(e) => setTime(i, e.currentTarget.value)} aria-label={`Hora de la toma ${i + 1}`} />
            {times.length > 1 && <button type="button" class="icon-btn" aria-label={`Quitar la toma ${i + 1}`} onClick={() => setTimes(times.filter((_, j) => j !== i))}><Icon name="minus" size={18} /></button>}
          </div>
        ))}
        {times.length < 6 && <button type="button" class="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setTimes([...times, times.length ? '20:00' : '08:00'])}><Icon name="plus" size={15} />Otra toma al día</button>}
      </div>
      <div class="stack-sm">
        <span class="label">¿Qué días?</span>
        <div class="chips" role="group" aria-label="Frecuencia"><TChip sm on={!days} onClick={() => setDays(null)}>Todos los días</TChip><TChip sm on={!!days} onClick={() => setDays(days || [1, 3, 5])}>Algunos días</TChip></div>
        {days && <div class="daypick" role="group" aria-label="Días de la semana">{DAY_ORDER.map((d) => <button key={d} type="button" aria-pressed={days.includes(d) ? 'true' : 'false'} onClick={() => toggleDay(d)}>{DAYS_SHORT[d]}</button>)}</div>}
      </div>
      <div class="field"><label for="mde">¿Hasta cuándo? (opcional)</label><input id="mde" type="date" class="input" value={end} min={today} onInput={(e) => setEnd(e.currentTarget.value)} /><span class="small muted">Por ejemplo, un antibiótico de 7 días. Vacío: sin fecha de fin.</span></div>
      <div class="field"><label for="mdo">Nota (opcional)</label><input id="mdo" class="input" value={note} maxLength={160} onInput={(e) => setNote(e.currentTarget.value)} placeholder="Ej. Con comida" /></div>
      <span class="small muted">Te aviso a la hora de cada toma si activas las notificaciones (Personaje → Ajustes).</span>
      <button type="button" class="btn block" disabled={!ok} onClick={save}><Icon name="check" size={20} />Guardar</button>
      {m && (
        <div class="row wrap" style={{ gap: 16, justifyContent: 'center' }}>
          <button type="button" class="link-btn" onClick={() => { act((x, t) => archiveMed(x, m.id, t)); toast(`${m.name}: ya no sale en tu día`, 'pill'); onClose(); }}><Icon name="archive" size={16} />Dejar de tomarla</button>
          <button type="button" class="link-btn" style={{ color: 'var(--vit-ink)' }} onClick={async () => {
            if (!(await ask(`¿Borrar ${m.name} y todo su historial?`, { ok: 'Borrar', danger: true }))) return;
            act((x) => removeMed(x, m.id));
            onClose();
          }}><Icon name="trash" size={16} />Borrar</button>
        </div>
      )}
    </Sheet>
  );
}

// ---------- Tus últimas semanas ----------

function fmtMetric(key, v) {
  if (v == null) return '—';
  if (key === 'sleep') return fmtHours(Math.round(v * 4) / 4);
  if (key === 'steps') return num(Math.round(v));
  if (key === 'active') return `${Math.round(v)} min`;
  return `${String(Math.round(v * 10) / 10).replace('.0', '')}`;
}

export function TrendsCard({ s, today }) {
  const [key, setKey] = useState('sleep');
  const weeks = healthWeeks(s, today, 8);
  const metric = TREND_METRICS.find((m) => m.key === key);
  const goal = metric.goal(s);
  const vals = weeks.map((w) => w[key]);
  const known = vals.filter((v) => v != null);
  const tr = trendOf(weeks, key);
  if (weeks.every((w) => !w.days)) return null;
  const W = 340; const H = 140; const L = 6; const R = 6; const T = 18; const B = 22;
  const max = Math.max(goal * 1.15, ...known, 1);
  const gw = (W - L - R) / weeks.length;
  const bw = Math.min(26, gw - 10);
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const better = key === 'sleep' ? (v) => v >= goal : (v) => v >= goal;
  const diffTxt = tr.diff == null ? '' : Math.abs(tr.diff) < (key === 'steps' ? 150 : key === 'active' ? 10 : key === 'sleep' ? 0.1 : 0.3) ? 'igual que antes' : `${tr.diff > 0 ? 'más' : 'menos'} que antes (${fmtMetric(key, tr.before)})`;
  return (
    <section class="card" aria-label="Tus últimas semanas">
      <div class="between-c"><h2 class="h2">Tus últimas semanas</h2><span class="small muted">8 semanas</span></div>
      <div class="chips" role="group" aria-label="Qué ver">{TREND_METRICS.map((m) => <TChip key={m.key} sm on={key === m.key} onClick={() => setKey(m.key)}>{m.label}</TChip>)}</div>
      <div class="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={weeks.map((w, i) => `Semana del ${fmtShort(w.from)}: ${fmtMetric(key, vals[i])}`).join(', ')}>
          <line x1={L} x2={W - R} y1={y(goal)} y2={y(goal)} class="ref" />
          {weeks.map((w, i) => {
            const v = vals[i];
            const x = L + i * gw + (gw - bw) / 2;
            const h = v == null ? 3 : Math.max(3, H - B - y(v));
            return (
              <g key={w.to}>
                <rect x={x} y={H - B - h} width={bw} height={h} rx="5" fill={v == null ? 'var(--soft-2)' : better(v) ? areaColor('salud') : 'var(--salud-soft)'} stroke={v != null && !better(v) ? areaColor('salud') : 'none'} stroke-width="1.5"><title>{`${fmtShort(w.from)} – ${fmtShort(w.to)}: ${fmtMetric(key, v)}`}</title></rect>
                {(i === weeks.length - 1 || i % 2 === 1) && <text x={x + bw / 2} y={H - 6} text-anchor="middle" class={`axis${i === weeks.length - 1 ? ' strong-axis' : ''}`}>{i === weeks.length - 1 ? 'Esta' : fmtShort(w.from)}</text>}
                {i === weeks.length - 1 && v != null && <text x={x + bw / 2} y={H - B - h - 5} text-anchor="middle" class="axis strong-axis">{fmtMetric(key, v)}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <span class="small muted">
        {tr.recent == null ? `Registra ${metric.label.toLowerCase()} unos días y verás cómo cambias semana a semana.` : `Últimas 4 semanas: ${fmtMetric(key, tr.recent)} ${metric.unit}${diffTxt ? `, ${diffTxt}` : ''}.`}
      </span>
      <span class="tiny muted">Cada barra es una semana (7 días). Línea punteada: tu meta ({fmtMetric(key, goal)}{key === 'active' ? ' a la semana' : ''}). Llena: llegaste. Con borde: te faltó.</span>
    </section>
  );
}

