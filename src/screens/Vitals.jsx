// Salud al estilo WHOOP (1.17): preparación de hoy, cómo amaneciste, carga, sueño que necesitas, tus señales
// (pulso, VFC, presión y peso), hábitos y su efecto, hábitos de largo plazo y el resumen de tus análisis.
import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Sheet, SheetHead, TChip, Switch, Ring, toast, areaColor, plural, num } from '../ui/kit.jsx';
import { act } from '../app/store.js';
import { addDays, DAYS_SHORT, weekday, fmtShort, relDay } from '../app/dates.js';
import { fmtHours, fmtClock, sleepInsights } from '../game/logic.js';
import {
  READY_ITEMS, READY_SCALE, logReady, readiness, ZONES, loadInfo, LOAD_STATUS, RPE, sleepNeed, bedtimeForNeed, needText,
  bpCategory, BP_CRISIS, addBP, removeBP, bpStats, bpWeekInfo, logWeight, weightInfo, fromKg, weightUnit, signals, radar,
  HABITS, habitEffects, effectText, longTerm,
} from '../game/vitals.js';
import { labSummary, labSuggestions, labTodo, itemStatus, isOut, STATUS_TONE, fmtNum } from '../game/labs.js';

const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const ZONE_COLOR = { verde: 'var(--good)', amarillo: 'var(--xp)', rojo: 'var(--vit)' };
const ZONE_WORD = { verde: 'Verde', amarillo: 'Amarillo', rojo: 'Rojo' };

// ---------- Preparación de hoy ----------

export function ReadinessCard({ s, today, onCheckIn, onSleep }) {
  const [how, setHow] = useState(false);
  const h = s.health[today] || {};
  const rd = readiness(s, today);
  const rad = radar(s, today);
  if (!rd) {
    return (
      <section class="card" aria-label="Tu preparación de hoy">
        <div class="row-top">
          <span class="tile" style={{ background: 'var(--salud-soft)', color: 'var(--salud)' }}><Icon name="heart" /></span>
          <div class="stack-xs grow"><h2 class="h2">Tu preparación de hoy</h2><span class="small muted">Dime cómo dormiste y cómo amaneciste (20 segundos) y te digo si hoy conviene exigirte o ir suave.</span></div>
        </div>
        <div class="row" style={{ gap: 8 }}>
          <button type="button" class="btn sm grow" onClick={onCheckIn}><Icon name="sun" size={17} />¿Cómo amaneciste?</button>
          {h.sleep == null && onSleep && <button type="button" class="btn sm soft grow" onClick={onSleep}><Icon name="moon" size={17} />Mi sueño</button>}
        </div>
      </section>
    );
  }
  const z = ZONES[rd.zone];
  const missing = h.sleep == null ? 'tu sueño' : !h.ready ? 'cómo amaneciste' : '';
  return (
    <section class="card" aria-label="Tu preparación de hoy">
      <div class="row" style={{ gap: 14 }}>
        <Ring value={rd.score / 100} size={78} stroke={8} color={ZONE_COLOR[rd.zone]} label={`Preparación ${rd.score} de 100, ${ZONE_WORD[rd.zone].toLowerCase()}`}>
          <text x="39" y="44" text-anchor="middle" style={{ font: '800 22px var(--font-display)', fill: 'var(--ink)' }}>{rd.score}</text>
        </Ring>
        <div class="stack-xs grow">
          <span class="eyebrow">Preparación de hoy</span>
          <span class="strong">{z.label}</span>
          <span class={`chip sm tone-${z.tone}`} style={{ alignSelf: 'flex-start' }}><Icon name={rd.zone === 'verde' ? 'check' : rd.zone === 'rojo' ? 'heart' : 'info'} size={13} />{ZONE_WORD[rd.zone]}{rd.sick ? ' · te sientes mal' : ''}</span>
        </div>
      </div>
      <span class="small">{z.effort}</span>
      <div class="stack-xs">
        {rd.best && <span class="small row" style={{ gap: 6, alignItems: 'flex-start' }}><Icon name="arrowup" size={15} style={{ color: 'var(--good-ink)' }} /><span>{rd.best.text}.</span></span>}
        {rd.worst && <span class="small row" style={{ gap: 6, alignItems: 'flex-start' }}><Icon name="arrowdown" size={15} style={{ color: 'var(--vit-ink)' }} /><span>{rd.worst.text}.</span></span>}
      </div>
      {missing && <span class="small muted">Falta {missing} para afinarla.</span>}
      {rad && <div class="note tone-xp" style={{ margin: 0 }}><Icon name="info" size={18} /><span>{rad.text}</span></div>}
      <div class="row wrap" style={{ gap: 8 }}>
        <button type="button" class="btn sm soft" onClick={onCheckIn}><Icon name="sun" size={17} />{h.ready ? 'Cambiar cómo amanecí' : '¿Cómo amaneciste?'}</button>
        <button type="button" class="link-btn" aria-expanded={how ? 'true' : 'false'} onClick={() => setHow(!how)}>Cómo se calcula<Icon name={how ? 'down' : 'right'} size={15} /></button>
      </div>
      {how && (
        <div class="stack-xs panel">
          {rd.parts.map((p) => <span key={p.key} class="small between-c" style={{ gap: 8 }}><span>{p.text}</span><span class="strong tab-num">{p.score}</span></span>)}
          <span class="tiny muted">Sueño frente a lo que necesitabas, cómo amaneciste (energía, cuerpo, calma y ánimo), la carga de ayer y, si los anotas, tu pulso en reposo y tu VFC frente a tu normal. Verde 67 o más, rojo 33 o menos. Sin un reloj, Astra usa sobre todo lo que tú sientes: en una revisión de 56 estudios (Saw y colegas, 2016), estas respuestas siguieron la carga mejor que las medidas objetivas más usadas. No es un diagnóstico.</span>
        </div>
      )}
    </section>
  );
}

function ReadyScale({ value, onChange, label }) {
  return (
    <div class="stack-xs">
      <div class="scale10 five" role="group" aria-label={label}>
        {READY_SCALE.map((l, i) => <button key={l} type="button" aria-pressed={value === i + 1 ? 'true' : 'false'} aria-label={`${label}: ${l}`} onClick={() => onChange(i + 1)}>{i + 1}</button>)}
      </div>
      <div class="between tiny muted" aria-hidden="true"><span>Muy mal</span><span>Muy bien</span></div>
    </div>
  );
}

export function CheckInSheet({ s, day, today, onClose }) {
  const h = s.health[day] || {};
  const r = h.ready || {};
  const [v, setV] = useState({ e: r.e || null, c: r.c || null, s: r.s || null, a: r.a || null, sick: !!r.sick, rhr: h.rhr || '', hrv: h.hrv || '' });
  const [more, setMore] = useState(!!(h.rhr || h.hrv));
  const n = READY_ITEMS.filter((it) => v[it.key]).length;
  const save = () => {
    const rd = act((st, t, ev) => { logReady(st, day, { ...v, rhr: v.rhr === '' ? null : v.rhr, hrv: v.hrv === '' ? null : v.hrv }, t, ev); return readiness(st, day); });
    toast(rd ? `Preparación de hoy: ${rd.score} · ${ZONE_WORD[rd.zone].toLowerCase()}` : 'Guardado', 'heart');
    onClose();
  };
  return (
    <Sheet onClose={onClose} label="Cómo amaneciste">
      <SheetHead title="¿Cómo amaneciste?" onClose={onClose} />
      <span class="small muted">Cuatro toques. Responde por cómo te sientes ahora, no por cómo deberías sentirte.</span>
      {READY_ITEMS.map((it) => (
        <div key={it.key} class="stack-sm">
          <span class="label">{it.q}</span>
          <ReadyScale value={v[it.key]} onChange={(x) => setV({ ...v, [it.key]: x })} label={it.label} />
        </div>
      ))}
      <label class="between-c panel" style={{ cursor: 'pointer' }}>
        <span class="stack-xs"><span class="semi">Me siento enfermo o enferma</span><span class="small muted">Gripe, fiebre, dolor fuerte: hoy toca descansar.</span></span>
        <Switch checked={v.sick} onChange={(x) => setV({ ...v, sick: x })} label="Me siento enfermo o enferma" />
      </label>
      <button type="button" class="link-btn" style={{ alignSelf: 'flex-start' }} aria-expanded={more ? 'true' : 'false'} onClick={() => setMore(!more)}>Pulso y VFC (si tienes reloj o tensiómetro)<Icon name={more ? 'down' : 'right'} size={15} /></button>
      {more && (
        <div class="stack-sm">
          <div class="timepair">
            <div class="field"><label for="ci-rhr">Pulso en reposo (lpm)</label><input id="ci-rhr" class="input" inputMode="numeric" value={v.rhr} onInput={(e) => setV({ ...v, rhr: e.currentTarget.value.replace(/\D/g, '').slice(0, 3) })} placeholder="Ej. 62" /></div>
            <div class="field"><label for="ci-hrv">VFC (ms)</label><input id="ci-hrv" class="input" inputMode="numeric" value={v.hrv} onInput={(e) => setV({ ...v, hrv: e.currentTarget.value.replace(/\D/g, '').slice(0, 3) })} placeholder="Ej. 45" /></div>
          </div>
          <span class="tiny muted">Pulso en reposo: al despertar, antes de levantarte, cuenta tus latidos 30 segundos y multiplica por 2 (o usa tu reloj). La VFC solo si tu reloj o anillo la mide: compárala siempre contigo, no con otras personas.</span>
        </div>
      )}
      <button type="button" class="btn block" disabled={!n && !v.rhr && !v.hrv && !v.sick} onClick={save}><Icon name="check" size={20} />Guardar{day === today && !h.ready ? ' · +3 XP de Vigor' : ''}</button>
    </Sheet>
  );
}

// ---------- Carga ----------

export function LoadCard({ s, today }) {
  const li = loadInfo(s, today);
  const rd = readiness(s, today);
  if (!li.sum7 && !li.activeAvg) return null;
  const W = 320; const H = 96; const T = 14; const B = 20;
  const max = Math.max(1, ...li.days.map((d) => d.load), (li.activeAvg || 0) * 1.4);
  const gw = W / 7; const bw = Math.min(28, gw - 12);
  const y = (v) => T + (1 - v / max) * (H - T - B);
  return (
    <section class="card" aria-label="Tu carga">
      <div class="between-c"><h2 class="h2">Tu carga</h2><span class="small muted">minutos × esfuerzo</span></div>
      <div class="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Carga de los últimos 7 días: ${li.days.map((d) => `${DAYS_SHORT[weekday(d.day)]} ${d.load}`).join(', ')}`}>
          {li.activeAvg ? <line x1="0" x2={W} y1={y(li.activeAvg)} y2={y(li.activeAvg)} class="ref" /> : null}
          {li.days.map((d, i) => {
            const x = i * gw + (gw - bw) / 2;
            const h = d.load ? Math.max(4, H - B - y(d.load)) : 3;
            const isToday = d.day === today;
            return (
              <g key={d.day}>
                <rect x={x} y={H - B - h} width={bw} height={h} rx="4" fill={d.load ? areaColor('salud') : 'var(--soft-2)'} opacity={isToday || !d.load ? 1 : 0.75}><title>{`${relDay(d.day, today)}: carga ${d.load}${d.load ? ` (${li.levelOf(d.load)})` : ''}`}</title></rect>
                <text x={x + bw / 2} y={H - 5} text-anchor="middle" class={`axis${isToday ? ' strong-axis' : ''}`}>{isToday ? 'Hoy' : DAYS_SHORT[weekday(d.day)]}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <span class="small"><b>Hoy: {li.today || 0}</b>{li.today ? ` (${li.level} para ti)` : ' (descanso)'} · <b>7 días: {li.sum7}</b>{li.avg28 ? ` · tu semana normal: ${li.avg28 * 7}` : ''}</span>
      <span class="small muted">{LOAD_STATUS[li.status]}</span>
      {rd && <div class={`note tone-${ZONES[rd.zone].tone}`} style={{ margin: 0 }}><Icon name="bolt" size={18} /><span><b>Esfuerzo sugerido hoy:</b> {ZONES[rd.zone].effort}</span></div>}
      <span class="tiny muted">Carga = minutos × qué tan duro fue (de 0 a 10), el método sRPE de Foster. La línea punteada es tu día activo normal. Al registrar actividad, elige qué tan duro fue.</span>
    </section>
  );
}

// «¿Qué tan duro fue?» para la hoja de actividad.
export function RpePicker({ value, onChange }) {
  const cur = RPE.find(([v]) => v === value);
  return (
    <div class="stack-sm">
      <span class="label">¿Qué tan duro fue?</span>
      <div class="chips" role="group" aria-label="Esfuerzo">{RPE.map(([v, l]) => <TChip key={v} sm on={value === v} onClick={() => onChange(v)}>{v} · {l}</TChip>)}</div>
      {cur && <span class="small muted">{cur[2]}.</span>}
    </div>
  );
}

// ---------- Sueño que necesitas ----------

export function SleepNeedNote({ s, today, wake = '' }) {
  const n = sleepNeed(s, today);
  const w = wake || s.profile.wakeGoal || sleepInsights(s, today).avgWake;
  const bed = w ? bedtimeForNeed(s, w, n.need) : null;
  return (
    <div class="note" style={{ background: 'var(--ene-soft)', color: 'var(--ene-ink)', margin: 0 }}>
      <Icon name="moon" size={18} />
      <span>Esta noche necesitas <b>{fmtHours(n.need)}</b>{n.need !== n.goal ? `: ${needText(n)}` : ''}.{bed ? <> Para levantarte a las {fmtClock(w)}, acuéstate a las <b>{fmtClock(bed)}</b>.</> : ''}</span>
    </div>
  );
}

// ---------- Tus señales ----------

const rangeTxt = (b, dec = 0) => (b && b.n >= 5 && b.sd != null ? `tu normal: ${Math.round(b.mean - b.sd)}–${Math.round(b.mean + b.sd)}` : b && b.n ? `${b.n} ${b.n === 1 ? 'dato' : 'datos'}: con 5 sale tu normal` : '');

// «+1.2 lb en 7 días», o «igual que hace 7 días» si el cambio redondea a 0.
function weightDelta(d, wu) {
  const r = Math.round(d * 10) / 10;
  if (!r) return 'igual que hace 7 días';
  return `${r > 0 ? '+' : '−'}${Math.abs(r)} ${wu} en 7 días`;
}

export function VitalsCard({ s, today, onOpen }) {
  const sig = signals(s, today);
  const bp = bpStats(s, today, 7);
  const bw = bpWeekInfo(s, today);
  const wi = weightInfo(s, today);
  const wu = weightUnit(s);
  const lastCat = bp.last ? bpCategory(bp.last.sys, bp.last.dia) : null;
  const row = (icon, label, value, sub, chip, key) => (
    <button type="button" class="lrow" onClick={() => onOpen(key)} aria-label={`${label}: ${value}. Tocar para registrar`}>
      <span class="tile sm" style={{ background: 'var(--salud-soft)', color: 'var(--salud)' }}><Icon name={icon} size={18} /></span>
      <span class="stack-xs grow"><span class="semi">{label}</span>{sub && <span class="tiny muted">{sub}</span>}</span>
      <span class="stack-xs" style={{ alignItems: 'flex-end' }}><span class="strong tab-num">{value}</span>{chip}</span>
    </button>
  );
  const rhr = sig.find((x) => x.key === 'rhr');
  const hrv = sig.find((x) => x.key === 'hrv');
  const offChip = (x, txt) => (x && x.off ? <span class="chip sm tone-xp">{txt}</span> : null);
  return (
    <section class="card" aria-label="Tus señales">
      <div class="between-c"><h2 class="h2">Tus señales</h2><span class="small muted">frente a tu normal</span></div>
      <div>
        {row('pulse', 'Pulso en reposo', rhr && rhr.last ? `${rhr.last.v} lpm` : '—', rhr ? rangeTxt(rhr.base) : 'Al despertar, antes de levantarte', offChip(rhr, 'más alto'), 'pulso')}
        {row('chart', 'VFC', hrv && hrv.last ? `${hrv.last.v} ms` : '—', hrv ? rangeTxt(hrv.base) : 'Solo si tu reloj o anillo la mide', offChip(hrv, 'más baja'), 'pulso')}
        {row('heart', 'Presión arterial', bp.last ? `${bp.last.sys}/${bp.last.dia}` : '—', bp.n ? `${relDay(bp.last.day, today)} · promedio de 7 días: ${bp.sys}/${bp.dia}` : 'Con tensiómetro de brazo', lastCat ? <span class={`chip sm tone-${lastCat.tone}`}>{lastCat.label}</span> : null, 'presion')}
        {row('target', 'Peso', wi.last ? `${num(Math.round(fromKg(wi.last.kg, wu) * 10) / 10)} ${wu}` : '—', wi.last ? `${relDay(wi.last.day, today)}${wi.change != null ? ` · ${weightDelta(fromKg(wi.change, wu), wu)}` : ''}` : 'Mira la tendencia, no el número de un día', null, 'peso')}
      </div>
      {lastCat && lastCat.key === 'crisis' && <div class="note tone-vit" style={{ margin: 0 }}><Icon name="info" size={18} /><span>{BP_CRISIS}</span></div>}
      <BpWeekBox s={s} today={today} info={bw} />
      <span class="tiny muted">Tu normal es tu promedio de 30 días, más o menos lo que sueles variar. Lo que sale fuera es una señal para mirar, no un diagnóstico. Categorías de presión: guía AHA/ACC 2025.</span>
    </section>
  );
}

function BpWeekBox({ s, today, info }) {
  const start = () => { act((st) => { st.vitals = { ...(st.vitals || {}), bpWeek: { start: today } }; }); toast('Semana de presión: 2 tomas en la mañana y 2 en la noche', 'heart'); };
  const stop = () => act((st) => { st.vitals = { ...(st.vitals || {}), bpWeek: null }; });
  if (!info) {
    return (
      <div class="panel stack-xs">
        <span class="semi">Semana de presión</span>
        <span class="small muted">Para saber tu presión de verdad: 7 días, 2 tomas en la mañana y 2 en la noche, con 1 minuto entre cada una. El promedio sin el primer día es tu presión en casa, la que piden la AHA y otras guías.</span>
        <button type="button" class="btn sm soft" style={{ alignSelf: 'flex-start' }} onClick={start}><Icon name="calendar" size={16} />Empezar hoy</button>
      </div>
    );
  }
  return (
    <div class="panel stack-sm">
      <div class="between-c"><span class="semi">Semana de presión</span><span class="small muted">{info.done ? 'Terminada' : `Día ${Math.min(7, info.day)} de 7`}</span></div>
      <div class="bp-days" role="img" aria-label={info.days.map((d) => `${DAYS_SHORT[weekday(d.day)]}: ${d.am} en la mañana, ${d.pm} en la noche`).join('; ')}>
        {info.days.map((d) => (
          <span key={d.day} class={d.day === today ? 'on' : ''}>
            <i class={d.am >= 2 ? 'full' : d.am ? 'half' : ''} /><i class={d.pm >= 2 ? 'full' : d.pm ? 'half' : ''} />
            <b>{DAYS_SHORT[weekday(d.day)]}</b>
          </span>
        ))}
      </div>
      <span class="tiny muted">Arriba la mañana, abajo la noche. Lleno: 2 tomas.</span>
      {info.res ? (
        <span class="small">{info.done ? 'Tu presión en casa' : 'Promedio hasta ahora'} (sin el primer día): <b>{info.res.sys}/{info.res.dia}</b> · <span class={`chip sm tone-${info.cat.tone}`}>{info.cat.label}</span>{info.done && ['etapa1', 'etapa2', 'crisis'].includes(info.cat.key) ? ' Llévale este promedio a tu médico.' : ''}</span>
      ) : <span class="small muted">Desde el segundo día se calcula tu promedio.</span>}
      <button type="button" class="link-btn muted" style={{ alignSelf: 'flex-start' }} onClick={info.done ? start : stop}>{info.done ? 'Hacer otra semana' : 'Dejar la semana'}</button>
    </div>
  );
}

export function VitalSheet({ s, today, kind, onClose }) {
  const [tab, setTab] = useState(kind === 'pulso' ? 'pulso' : kind === 'peso' ? 'peso' : 'presion');
  const h = s.health[today] || {};
  const [bp, setBp] = useState({ sys: '', dia: '', pulse: '', time: nowHM() });
  const wu = weightUnit(s);
  const [unit, setUnit] = useState(wu);
  const [w, setW] = useState('');
  const [pv, setPv] = useState({ rhr: h.rhr || '', hrv: h.hrv || '' });
  const cat = Number(bp.sys) > Number(bp.dia) && Number(bp.dia) > 0 ? bpCategory(Number(bp.sys), Number(bp.dia)) : null;
  const saveBp = () => {
    const r = act((st, t, ev) => addBP(st, t, bp, t, ev));
    if (!r) { toast('Revisa los números: la alta va primero', 'info'); return; }
    const c = bpCategory(r.sys, r.dia);
    toast(`${r.sys}/${r.dia}: ${c.label.toLowerCase()}`, 'heart');
    setBp({ sys: '', dia: '', pulse: '', time: nowHM() });
  };
  const saveW = () => { const ok = act((st, t) => logWeight(st, t, Number(String(w).replace(',', '.')), unit)); if (!ok) { toast('Revisa el peso', 'info'); return; } toast('Peso guardado', 'check'); onClose(); };
  const saveP = () => { act((st, t, ev) => logReady(st, t, { rhr: pv.rhr === '' ? null : pv.rhr, hrv: pv.hrv === '' ? null : pv.hrv }, t, ev)); toast('Guardado', 'pulse'); onClose(); };
  const todays = Array.isArray(h.bp) ? h.bp : [];
  const dig = (v, n = 3) => String(v).replace(/\D/g, '').slice(0, n);
  return (
    <Sheet onClose={onClose} label="Registrar una señal">
      <SheetHead title="Tus señales" onClose={onClose} />
      <div class="seg" role="tablist" aria-label="Qué registrar">
        {[['presion', 'Presión'], ['peso', 'Peso'], ['pulso', 'Pulso y VFC']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k ? 'true' : 'false'} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'presion' && (
        <div class="stack">
          <div class="grid3" style={{ gap: 8 }}>
            <div class="field"><label for="bp-s">Alta</label><input id="bp-s" class="input" inputMode="numeric" value={bp.sys} onInput={(e) => setBp({ ...bp, sys: dig(e.currentTarget.value) })} placeholder="120" autoFocus /></div>
            <div class="field"><label for="bp-d">Baja</label><input id="bp-d" class="input" inputMode="numeric" value={bp.dia} onInput={(e) => setBp({ ...bp, dia: dig(e.currentTarget.value) })} placeholder="80" /></div>
            <div class="field"><label for="bp-p">Pulso</label><input id="bp-p" class="input" inputMode="numeric" value={bp.pulse} onInput={(e) => setBp({ ...bp, pulse: dig(e.currentTarget.value) })} placeholder="70" /></div>
          </div>
          <div class="field"><label for="bp-t">Hora</label><input id="bp-t" type="time" class="input" value={bp.time} onInput={(e) => setBp({ ...bp, time: e.currentTarget.value })} /></div>
          {cat && <span class="small">Esta toma: <span class={`chip sm tone-${cat.tone}`}>{cat.label}</span></span>}
          {cat && cat.key === 'crisis' && <div class="note tone-vit" style={{ margin: 0 }}><Icon name="info" size={18} /><span>{BP_CRISIS}</span></div>}
          <span class="tiny muted">Siéntate 5 minutos con la espalda apoyada y los pies en el piso, el brazo a la altura del corazón y sin hablar. Haz 2 tomas con 1 minuto entre ellas. Mejor un tensiómetro de brazo validado que uno de muñeca.</span>
          <button type="button" class="btn block" disabled={!bp.sys || !bp.dia} onClick={saveBp}><Icon name="check" size={20} />Guardar toma</button>
          {todays.length > 0 && (
            <div class="stack-xs">
              <span class="label">Hoy</span>
              {todays.map((r) => <div key={r.id} class="between-c small"><span>{fmtClock(r.t)} · <b>{r.sys}/{r.dia}</b>{r.pulse ? ` · ${r.pulse} lpm` : ''}</span><button type="button" class="link-btn muted" style={{ minHeight: 36 }} onClick={() => act((st) => removeBP(st, today, r.id))} aria-label={`Borrar la toma de las ${fmtClock(r.t)}`}>Borrar</button></div>)}
            </div>
          )}
        </div>
      )}
      {tab === 'peso' && (
        <div class="stack">
          <div class="row" style={{ gap: 8 }}>
            <div class="field grow"><label for="w-v">Peso de hoy</label><input id="w-v" class="input big" inputMode="decimal" value={w} onInput={(e) => setW(e.currentTarget.value.replace(/[^\d.,]/g, '').slice(0, 6))} placeholder={unit === 'lb' ? '150' : '68'} autoFocus /></div>
            <div class="seg" role="tablist" aria-label="Unidad" style={{ alignSelf: 'flex-end', minWidth: 120 }}>{['lb', 'kg'].map((u) => <button key={u} type="button" role="tab" aria-selected={unit === u ? 'true' : 'false'} onClick={() => setUnit(u)}>{u}</button>)}</div>
          </div>
          <span class="tiny muted">Pésate a la misma hora (mejor en la mañana, antes de comer). El peso sube y baja de un día a otro: Astra te muestra la tendencia de 7 días.</span>
          <button type="button" class="btn block" disabled={!w} onClick={saveW}><Icon name="check" size={20} />Guardar</button>
        </div>
      )}
      {tab === 'pulso' && (
        <div class="stack">
          <div class="timepair">
            <div class="field"><label for="p-r">Pulso en reposo (lpm)</label><input id="p-r" class="input" inputMode="numeric" value={pv.rhr} onInput={(e) => setPv({ ...pv, rhr: dig(e.currentTarget.value) })} placeholder="62" /></div>
            <div class="field"><label for="p-h">VFC (ms)</label><input id="p-h" class="input" inputMode="numeric" value={pv.hrv} onInput={(e) => setPv({ ...pv, hrv: dig(e.currentTarget.value) })} placeholder="45" /></div>
          </div>
          <span class="tiny muted">Pulso en reposo: al despertar, antes de levantarte, cuenta tus latidos 30 segundos y multiplica por 2. Sirve compararlo contigo: si sube varios latidos sobre tu normal, puede ser cansancio, estrés o el inicio de un resfriado.</span>
          <button type="button" class="btn block" disabled={!pv.rhr && !pv.hrv} onClick={saveP}><Icon name="check" size={20} />Guardar</button>
        </div>
      )}
    </Sheet>
  );
}

// ---------- Hábitos y su efecto ----------

export function HabitPicker({ value, onChange }) {
  const on = new Set(value);
  const toggle = (k) => onChange(on.has(k) ? value.filter((x) => x !== k) : [...value, k]);
  return <div class="chips" role="group" aria-label="Hábitos de hoy">{HABITS.map((hb) => <TChip key={hb.key} sm icon={hb.icon} on={on.has(hb.key)} onClick={() => toggle(hb.key)}>{hb.label}</TChip>)}</div>;
}

export function HabitsEffectCard({ s, today }) {
  const eff = habitEffects(s, today);
  const marked = Object.values(s.health || {}).filter((h) => h && h.habits).length;
  const big = eff.filter((e) => e.big).slice(0, 4);
  const flat = eff.filter((e) => !e.big);
  return (
    <section class="card" aria-label="Qué te ayuda y qué te afecta">
      <div class="between-c"><h2 class="h2">Qué te ayuda y qué te afecta</h2><span class="small muted" style={{ whiteSpace: 'nowrap' }}>{plural(marked, 'día', 'días')}</span></div>
      {!eff.length ? (
        <span class="small muted">Marca tus hábitos cada noche en la posada (alcohol, café tarde, pantallas, sol en la mañana…). Con 5 días con y 5 sin de cada uno, verás qué le pasa a tu preparación y a tu sueño al día siguiente, como el diario de WHOOP.</span>
      ) : (
        <div class="stack-sm">
          {big.map((e) => (
            <div key={e.key} class="row-top" style={{ gap: 10 }}>
              <span class="tile sm" style={{ background: e.diff > 0 ? 'var(--good-soft)' : 'var(--vit-soft)', color: e.diff > 0 ? 'var(--good-ink)' : 'var(--vit-ink)' }}><Icon name={e.habit.icon} size={17} /></span>
              <span class="small grow">{effectText(e)}</span>
            </div>
          ))}
          {!big.length && <span class="small muted">Todavía no se ve una diferencia clara con ningún hábito.</span>}
          {flat.length > 0 && <span class="tiny muted">Sin diferencia clara: {flat.map((e) => e.habit.label.toLowerCase()).join(', ')}.</span>}
        </div>
      )}
      <a class="link-btn" href="#/posada" style={{ alignSelf: 'flex-start' }}><Icon name="moon" size={16} />Marcar los de hoy en la posada</a>
      <span class="tiny muted">Es una comparación de tus días, no una prueba de causa: otras cosas pudieron pasar esos mismos días.</span>
    </section>
  );
}

// ---------- Hábitos de largo plazo ----------

const LT_TONE = { ok: 'good', cerca: 'xp', lejos: 'vit', info: '' };
const LT_LABEL = { ok: 'En meta', cerca: 'Cerca', lejos: 'Lejos', info: '' };

export function LongTermCard({ s, today }) {
  const lt = longTerm(s, today);
  if (!lt.items.length) return null;
  return (
    <section class="card" aria-label="Tus hábitos de largo plazo">
      <div class="between-c"><h2 class="h2">Tus hábitos de largo plazo</h2><span class="small muted">30 días</span></div>
      <span class="small muted">Lo que más se asocia con vivir más y mejor, según estudios grandes. {lt.ok} de {lt.items.filter((x) => x.st !== 'info').length} en meta.</span>
      <div>
        {lt.items.map((x) => (
          <div key={x.key} class="lrow" style={{ cursor: 'default' }}>
            <span class="stack-xs grow"><span class="semi">{x.label}</span><span class="tiny muted">Meta: {x.target}{x.prevText ? ` · antes ${x.prevText}` : ''}</span></span>
            <span class="stack-xs" style={{ alignItems: 'flex-end' }}>
              <span class="strong tab-num row" style={{ gap: 4, whiteSpace: 'nowrap' }}>{(x.trend === 'mejor' || x.trend === 'peor') && x.dir !== 0 && <Icon name={x.dir > 0 ? 'arrowup' : 'arrowdown'} size={14} label={x.trend === 'mejor' ? 'Mejor que antes' : 'Peor que antes'} style={{ color: x.trend === 'mejor' ? 'var(--good-ink)' : 'var(--vit-ink)' }} />}{x.text}</span>
              {LT_LABEL[x.st] && <span class={`chip sm tone-${LT_TONE[x.st]}`}>{LT_LABEL[x.st]}</span>}
            </span>
          </div>
        ))}
      </div>
      {lt.focus && <div class="note" style={{ margin: 0 }}><Icon name="target" size={18} /><span>Lo que más te ayudaría ahora: <b>{lt.focus.label.toLowerCase()}</b> ({lt.focus.text} ahora; meta: {lt.focus.target}).</span></div>}
      <span class="tiny muted">WHOOP convierte algo así en una «edad»; Astra no, porque sin un reloj que mida tu condición física no se puede calcular bien. Metas: OMS (actividad, fuerza, frutas y verduras), AASM (sueño) y Ding y colegas, Lancet Public Health 2025 (pasos).</span>
    </section>
  );
}

// ---------- Tus análisis (resumen en Salud) ----------

export function LabsCard({ s, today }) {
  const sum = labSummary(s);
  const sug = labSuggestions(s, today);
  const addTodo = (x) => { act((st, t) => labTodo(st, { title: x.todo, src: x.src }, t)); toast('Agregado a tus pendientes de Salud', 'list'); };
  return (
    <section class="card" aria-label="Tus análisis">
      <div class="between-c"><h2 class="h2">Tus análisis</h2>{sum.last && <span class="small muted">{fmtShort(sum.last.day)}</span>}</div>
      {!sum.last ? (
        <span class="small muted">Sube el PDF o la foto de tus resultados de laboratorio. Astra separa cada prueba con el rango de tu laboratorio, quita tus datos personales y te muestra cómo cambian con el tiempo, como Advanced Labs de WHOOP.</span>
      ) : (
        <>
          <div class="chips">
            <span class="chip sm tone-good"><Icon name="check" size={13} />{sum.counts.ok} en rango</span>
            {sum.counts.atento > 0 && <span class="chip sm tone-xp"><Icon name="info" size={13} />{sum.counts.atento} para vigilar</span>}
            {sum.counts.fuera > 0 && <span class="chip sm tone-vit"><Icon name="flag" size={13} />{sum.counts.fuera} fuera de rango</span>}
          </div>
          {sum.out.slice(0, 3).map((x) => (
            <a key={x.key} class="lrow" href="#/analiticas" style={{ padding: '8px 0' }}>
              <span class="grow small semi">{x.it.name}</span>
              <span class="small tab-num">{x.it.value != null ? fmtNum(x.it.value) : x.it.text} {x.it.unit}</span>
              <span class={`chip sm tone-${STATUS_TONE[x.st.st]}`}>{x.st.label}</span>
            </a>
          ))}
        </>
      )}
      {sug[0] && (
        <div class="note" style={{ margin: 0 }}>
          <Icon name="info" size={18} />
          <span class="stack-xs grow"><span class="small">{sug[0].text}</span><button type="button" class="link-btn" style={{ alignSelf: 'flex-start', minHeight: 36 }} onClick={() => addTodo(sug[0])}>Agregar a pendientes<Icon name="plus" size={15} /></button></span>
        </div>
      )}
      <div class="row" style={{ gap: 8 }}>
        <a class="btn sm grow" href="#/analiticas?nuevo=1"><Icon name="upload" size={17} />Agregar análisis</a>
        {sum.last && <a class="btn sm soft grow" href="#/analiticas"><Icon name="flask" size={17} />Ver todos</a>}
      </div>
    </section>
  );
}

export { itemStatus, isOut };
