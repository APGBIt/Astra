import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Sheet, SheetHead, Stepper, TChip, toast, areaColor, plural } from '../ui/kit.jsx';
import { act } from '../app/store.js';
import { addDays, fmtShort, weekday, DAYS_SHORT, DAYS } from '../app/dates.js';
import { SLEEP_QUALITY, SLEEP_ROUTINE } from '../game/content.js';
import { logHealth, fmtHours, sleepFromTimes, sleepInsights, fmtClock, bedtimeFor } from '../game/logic.js';

// Sueño: por horas o por horario (a qué hora te acostaste y te levantaste), con la calidad del descanso.

const pref = {
  get(k, d) { try { return localStorage.getItem(`astra.ui.${k}`) || d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`astra.ui.${k}`, v); } catch { /* sin almacenamiento */ } },
};

export const qualityLabel = (q) => (q == null ? '' : (SLEEP_QUALITY.find((x) => x.v === Math.round(q)) || {}).label || '');
const fmtDur = (m) => (m >= 60 ? fmtHours(Math.round(m / 15) / 4) : `${Math.round(m)} min`);
const nightOf = (day, today) => (day === today ? 'anoche' : `la noche del ${fmtShort(addDays(day, -1))}`);

// Formulario de una noche. `day` es el día en que te levantaste.
export function SleepForm({ s, day, today, onSaved, compact = false }) {
  const h = s.health[day] || {};
  const inn = s.inn[addDays(day, -1)] || {};
  const goal = s.profile.sleepGoal || 7;
  const wake0 = h.wake || inn.wake || s.profile.wakeGoal || '06:30';
  const [mode, setModeState] = useState(h.bed && h.wake ? 'horario' : h.sleep != null ? 'horas' : pref.get('sleepMode', 'horas'));
  const setMode = (m) => { setModeState(m); pref.set('sleepMode', m); };
  const [hours, setHours] = useState(h.sleep ?? goal);
  const [bed, setBed] = useState(h.bed || inn.bed || bedtimeFor(s, wake0) || '23:00');
  const [wake, setWake] = useState(wake0);
  const [quality, setQuality] = useState(h.quality || null);
  const calc = sleepFromTimes(bed, wake);
  const odd = mode === 'horario' && calc != null && (calc > 14 || calc < 2);
  const value = mode === 'horario' ? calc : hours;
  const save = () => {
    if (value == null) return;
    const patch = mode === 'horario' ? { bed, wake, sleep: calc, quality } : { sleep: hours, quality, bed: '', wake: '' };
    act((st, t, ev) => logHealth(st, day, patch, t, ev));
    toast(day !== today ? 'Sueño guardado' : value >= goal ? 'Energía llena para hoy' : 'Energía del día ajustada a tu sueño', 'bolt');
    if (onSaved) onSaved();
  };
  return (
    <div class="stack">
      <div class="seg" role="tablist" aria-label="Cómo registrar">
        <button type="button" role="tab" aria-selected={mode === 'horas' ? 'true' : 'false'} onClick={() => setMode('horas')}><Icon name="moon" size={16} />Horas</button>
        <button type="button" role="tab" aria-selected={mode === 'horario' ? 'true' : 'false'} onClick={() => setMode('horario')}><Icon name="clock" size={16} />Horario</button>
      </div>
      {mode === 'horas' ? (
        <Stepper value={hours} onChange={setHours} step={0.25} min={0} max={16} format={fmtHours} label="Horas de sueño" />
      ) : (
        <div class="stack-sm">
          <div class="timepair">
            <div class="field"><label for={`sb${day}`}>Me acosté</label><input id={`sb${day}`} type="time" class="input" value={bed} onInput={(e) => setBed(e.currentTarget.value)} /></div>
            <div class="field"><label for={`sw${day}`}>Me levanté</label><input id={`sw${day}`} type="time" class="input" value={wake} onInput={(e) => setWake(e.currentTarget.value)} /></div>
          </div>
          <span class="small strong" style={{ color: odd ? 'var(--vit-ink)' : undefined }} aria-live="polite">
            {calc == null ? 'Escribe las dos horas.' : odd ? `Salen ${fmtHours(calc)}. Revisa si las horas están bien (mañana o tarde).` : `Dormiste ${fmtHours(calc)}.`}
          </span>
        </div>
      )}
      <div class="stack-sm">
        <span class="label">¿Cómo descansaste? (opcional)</span>
        <div class="chips" role="group" aria-label="Calidad del sueño">
          {SLEEP_QUALITY.map((q) => <TChip key={q.v} sm on={quality === q.v} onClick={() => setQuality(quality === q.v ? null : q.v)}>{q.label}</TChip>)}
        </div>
      </div>
      {!compact && <span class="small muted">Tu meta es {fmtHours(goal)}. Dormirla llena tu energía del día y suma +5 de vitalidad.</span>}
      <button type="button" class={`btn block${compact ? ' sm' : ''}`} disabled={value == null} onClick={save}><Icon name="check" size={20} />Guardar</button>
    </div>
  );
}

export function SleepSheet({ s, day, today, onClose }) {
  const title = day === today ? 'Sueño de anoche' : `Noche del ${fmtShort(addDays(day, -1))}`;
  return (
    <Sheet onClose={onClose} label={title}>
      <SheetHead title={title} onClose={onClose} />
      <SleepForm s={s} day={day} today={today} onSaved={onClose} />
    </Sheet>
  );
}

// Gráfica de 7 noches: toca una barra para corregir esa noche.
export function SleepWeek({ s, today, onEdit }) {
  const goal = s.profile.sleepGoal || 7;
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  return (
    <div class="row sleep-bars" style={{ alignItems: 'flex-end', gap: 6, height: 118 }}>
      {week.map((d) => {
        const v = s.health[d]?.sleep;
        const pct = v != null ? Math.min(1, v / 10) : 0;
        return (
          <button key={d} type="button" onClick={() => onEdit(d)} aria-label={`${DAYS[weekday(d)]} ${fmtShort(d)}: ${v != null ? fmtHours(v) : 'sin dato'}. Tocar para ${v != null ? 'corregir' : 'registrar'}`}>
            <span class="tiny strong">{v != null ? v : ''}</span>
            <span style={{ width: '100%', maxWidth: 28, height: `${Math.max(4, pct * 70)}px`, borderRadius: 8, background: v == null ? 'var(--soft-2)' : v >= goal ? areaColor('salud') : 'var(--vit)', display: 'block' }} />
            <span class="tiny muted">{d === today ? 'Hoy' : DAYS_SHORT[weekday(d)]}</span>
          </button>
        );
      })}
    </div>
  );
}

// Lo que dice tu sueño: promedio, deuda, regularidad, calidad y a qué hora acostarte.
export function SleepInsights({ s, today, onWakeGoal }) {
  const ins = sleepInsights(s, today);
  if (!ins.n) return <span class="small muted">Registra tus noches para ver tu promedio, tu deuda de sueño y tu hora ideal para acostarte.</span>;
  return (
    <div class="stack-sm">
      <div class="sleep-kpis">
        <div><span class="v">{fmtHours(Math.round(ins.avg * 4) / 4)}</span><span class="l">Promedio por noche</span></div>
        <div><span class="v" style={{ color: ins.debt >= 3 ? 'var(--vit-ink)' : undefined }}>{ins.debt ? fmtHours(Math.round(ins.debt * 4) / 4) : '0 h'}</span><span class="l">Te faltó dormir</span></div>
        <div><span class="v">{ins.met} de {ins.n}</span><span class="l">Noches en tu meta</span></div>
        <div><span class="v">{ins.spread != null ? `±${fmtDur(ins.spread / 2)}` : '—'}</span><span class="l">{ins.spread != null ? 'Variación al acostarte' : 'Usa «Horario» para ver tu regularidad'}</span></div>
      </div>
      {(ins.spread != null || ins.wakeSpread != null) && (
        <span class="small">Regularidad: {ins.spread != null ? <>te acuestas con <b>±{fmtDur(ins.spread / 2)}</b> de diferencia</> : null}{ins.spread != null && ins.wakeSpread != null ? ' y ' : ''}{ins.wakeSpread != null ? <>te levantas con <b>±{fmtDur(ins.wakeSpread / 2)}</b></> : null} entre noches. {Math.max(ins.spread || 0, ins.wakeSpread || 0) <= 60 ? 'Bien parejo.' : 'Lo ideal: más o menos media hora, también el fin de semana.'}</span>
      )}
      {ins.quality != null && <span class="small">Calidad promedio: <b>{qualityLabel(ins.quality)}</b>{ins.routineNights ? ` · rutina para dormir ${plural(ins.routineNights, 'noche', 'noches')}` : ''}</span>}
      {ins.bedAt ? (
        <div class="note" style={{ background: 'var(--ene-soft)', color: 'var(--ene-ink)', margin: 0 }}>
          <Icon name="clock" size={18} />
          <span class="grow">Acuéstate a las <b>{fmtClock(ins.bedAt)}</b> para dormir {fmtHours(ins.goal)} y levantarte a las <b>{fmtClock(ins.wakeAt)}</b>{!s.profile.wakeGoal ? ' (tu hora promedio de levantarte)' : ''}</span>
        </div>
      ) : onWakeGoal && (
        <button type="button" class="link-btn" style={{ alignSelf: 'flex-start' }} onClick={onWakeGoal}><Icon name="clock" size={16} />Dime a qué hora te levantas y te digo a qué hora acostarte</button>
      )}
      {ins.tip && <div class="note" style={{ margin: 0 }}><Icon name={ins.tip.icon} size={18} /><span>{ins.tip.text}</span></div>}
    </div>
  );
}

// Rutina para dormir (en la posada): cada paso suma XP de Vigor una vez al día.
export function RoutineChecklist({ value, onChange }) {
  const toggle = (k) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  return (
    <div class="stack-sm" role="group" aria-label="Rutina para dormir">
      {SLEEP_ROUTINE.map((r) => (
        <button key={r.key} type="button" class="routine-row" aria-pressed={value.includes(r.key) ? 'true' : 'false'} onClick={() => toggle(r.key)}>
          <span class="box">{value.includes(r.key) && <Icon name="check" size={16} stroke={3} />}</span>
          <span class="grow semi">{r.label}</span>
          <Icon name={r.icon} size={18} />
        </button>
      ))}
    </div>
  );
}
