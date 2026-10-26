// Salud 1.14: «Tu plato». Marca cada comida en dos toques con el método del plato, sin contar calorías.
import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Sheet, SheetHead, Switch, toast, areaColor, areaSoft } from '../ui/kit.jsx';
import { act } from '../app/store.js';
import { MEAL, PLATE_GOOD, PLATE_WATCH, logMeal, mealsOn, plateScore, foodWeek } from '../game/food.js';

const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)} %`);
const SCORE_TXT = ['Anotada', 'Le faltan partes', 'Buen plato', 'Plato completo'];

// Dibujo del plato: la mitad vegetales, un cuarto integral, un cuarto proteína. Se llena lo que marcaste.
function PlateIcon({ m, size = 44 }) {
  const on = (k) => (m && m[k] ? areaColor('salud') : 'var(--soft-2)');
  const r = size / 2 - 2;
  const c = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <path d={`M${c},${c} L${c},${c - r} A${r},${r} 0 0,0 ${c},${c + r} Z`} fill={on('veg')} />
      <path d={`M${c},${c} L${c},${c - r} A${r},${r} 0 0,1 ${c + r},${c} Z`} fill={on('integ')} opacity={m && m.integ ? 0.75 : 1} />
      <path d={`M${c},${c} L${c + r},${c} A${r},${r} 0 0,1 ${c},${c + r} Z`} fill={on('prot')} opacity={m && m.prot ? 0.55 : 1} />
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--line-strong, var(--line))" stroke-width="2" />
      <line x1={c} y1={c - r} x2={c} y2={c + r} stroke="var(--surface)" stroke-width="2" />
      <line x1={c} y1={c} x2={c + r} y2={c} stroke="var(--surface)" stroke-width="2" />
    </svg>
  );
}

export function PlateCard({ s, today }) {
  const [open, setOpen] = useState(null);
  const meals = mealsOn(s, today);
  const wk = foodWeek(s, today);
  return (
    <section class="card" aria-label="Tu plato">
      <div class="between-c"><h2 class="h2">Tu plato</h2><span class="small muted">{wk.meals ? `${wk.full} de ${wk.meals} completos en 7 días` : 'Método del plato'}</span></div>
      <span class="small muted">Mitad vegetales o frutas, un cuarto proteína y un cuarto integral o víveres. Toca cada comida y marca lo que tuvo.</span>
      <div class="grid2">
        {meals.map((m) => (
          <button key={m.key} type="button" class="panel row" style={{ gap: 10, border: 'none', textAlign: 'left', color: 'var(--ink)', minHeight: 64 }} onClick={() => setOpen(m.key)} aria-label={`${m.label}: ${m.marks ? SCORE_TXT[plateScore(m.marks)] : 'sin anotar'}`}>
            <PlateIcon m={m.marks} size={40} />
            <span class="stack-xs grow" style={{ minWidth: 0 }}><span class="semi">{m.label}</span><span class="tiny muted semi">{m.marks ? SCORE_TXT[plateScore(m.marks)] : 'Sin anotar'}</span></span>
          </button>
        ))}
      </div>
      {wk.meals >= 3 && (
        <div class="kpis">
          <div class="kpi"><span class="v tab-num">{pct(wk.pct.veg)}</span><span class="l">con vegetales o frutas</span></div>
          <div class="kpi"><span class="v tab-num">{pct(wk.pct.prot)}</span><span class="l">con proteína</span></div>
          <div class="kpi"><span class="v tab-num">{wk.count.frito + wk.count.ultra + wk.count.azucar}</span><span class="l">fritos, embutidos o azúcar</span></div>
        </div>
      )}
      {wk.tip && <div class="note"><Icon name={wk.tip.icon} size={18} /><span>{wk.tip.text}</span></div>}
      <span class="tiny muted">Un plato con 2 partes buenas da +2 XP de Vigor; completo, +3 (hasta 3 comidas al día). La sal: menos de 5 g al día (una cucharadita), según la OMS.</span>
      {open && <MealSheet s={s} today={today} meal={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

export function MealSheet({ s, today, meal, onClose }) {
  const cur = (((s.health[today] || {}).food) || {})[meal] || {};
  const [m, setM] = useState({ ...cur });
  const flip = (k) => setM({ ...m, [k]: !m[k] });
  const save = () => {
    act((x, t, ev) => logMeal(x, today, meal, m, t, ev));
    const sc = plateScore(m);
    toast(Object.keys(m).some((k) => m[k]) ? `${MEAL[meal].label}: ${SCORE_TXT[sc].toLowerCase()}` : `${MEAL[meal].label} quitada`, 'utensils');
    onClose();
  };
  const row = (x) => (
    <label key={x.key} class="between-c" style={{ cursor: 'pointer', minHeight: 52, gap: 12 }}>
      <span class="stack-xs"><span class="semi">{x.label}</span>{x.hint && <span class="tiny muted">{x.hint}</span>}</span>
      <Switch checked={!!m[x.key]} onChange={() => flip(x.key)} label={x.label} />
    </label>
  );
  return (
    <Sheet onClose={onClose} label={MEAL[meal].label}>
      <SheetHead title={MEAL[meal].label} onClose={onClose} />
      <div class="row" style={{ gap: 14 }}>
        <span style={{ background: areaSoft('salud'), borderRadius: 999, padding: 6, display: 'flex' }}><PlateIcon m={m} size={64} /></span>
        <span class="small muted">{SCORE_TXT[plateScore(m)]}. {plateScore(m) < 3 ? 'Lo que falta se ve gris en el plato.' : '¡Así se come!'}</span>
      </div>
      <span class="label">¿Qué tuvo?</span>
      {PLATE_GOOD.map(row)}
      <span class="label">También hubo (sin culpa, es para ver tu semana)</span>
      {PLATE_WATCH.map(row)}
      <button type="button" class="btn block" onClick={save}><Icon name="check" size={20} />Guardar</button>
    </Sheet>
  );
}

