import { Icon } from '../ui/icons.jsx';
import { Sheet, SheetHead, NumberChips, num } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { GOAL_PRESETS } from '../game/content.js';
import { dailyGoal, setDailyGoal, fmtHours, setWakeGoal, bedtimeFor, fmtClock } from '../game/logic.js';

// Metas diarias propias: sueño, pasos, agua y ejercicio. Opciones rápidas o el número que quieras.
const ROWS = [
  { k: 'sleep', icon: 'moon', label: 'Sueño', help: 'Dormirla llena tu energía del día.', unit: 'horas', step: 0.25, min: 4, max: 12, format: (v) => fmtHours(v) },
  { k: 'steps', icon: 'pulse', label: 'Pasos', help: 'Cuenta para tus misiones y jefes de pasos.', unit: 'pasos', step: 1, min: 500, max: 60000, format: (v) => num(v) },
  { k: 'water', icon: 'drop', label: 'Agua', help: 'Vasos al día.', unit: 'vasos', step: 1, min: 1, max: 30, format: (v) => `${v} vasos` },
  { k: 'exercise', icon: 'dumbbell', label: 'Ejercicio', help: 'Minutos al día.', unit: 'min', step: 1, min: 5, max: 600, format: (v) => `${v} min` },
];

export function DailyGoalsEditor() {
  const s = useApp();
  // Tus misiones de pasos siguen la meta (las que usaban la anterior pasan a la nueva).
  const setGoal = (k, v) => act((st, t) => setDailyGoal(st, k, v, t));
  return (
    <div class="stack-lg">
      {ROWS.map((r) => (
        <div class="stack-sm" key={r.k}>
          <div class="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <span style={{ display: 'flex', paddingTop: 1 }}><Icon name={r.icon} size={18} /></span>
            <span class="stack-xs"><span class="strong">{r.label}</span><span class="small muted">{r.help}</span></span>
          </div>
          <NumberChips value={dailyGoal(s, r.k)} onChange={(v) => setGoal(r.k, v)} presets={GOAL_PRESETS[r.k]} unit={r.unit} step={r.step} min={r.min} max={r.max} format={r.format} label={`Meta de ${r.label.toLowerCase()}`} delay={700} />
          {r.k === 'sleep' && <WakeGoal />}
        </div>
      ))}
    </div>
  );
}

// Hora de levantarte: con ella se calcula a qué hora acostarte para dormir tu meta.
function WakeGoal() {
  const s = useApp();
  const w = s.profile.wakeGoal || '';
  const bed = bedtimeFor(s, w);
  return (
    <div class="stack-xs" style={{ paddingTop: 4 }}>
      <div class="row" style={{ gap: 10 }}>
        <label for="wakegoal" class="small semi grow">Me levanto normalmente a las</label>
        <input id="wakegoal" type="time" class="input" value={w} onInput={(e) => act((st) => setWakeGoal(st, e.currentTarget.value))} style={{ width: 'auto', minHeight: 44 }} />
      </div>
      <span class="small muted">{bed ? `Para dormir ${fmtHours(s.profile.sleepGoal || 7)}, acuéstate a las ${fmtClock(bed)}` : 'Escríbela y te digo a qué hora acostarte.'}</span>
    </div>
  );
}

export function GoalsSheet({ onClose }) {
  return (
    <Sheet onClose={onClose} label="Tus metas diarias">
      <SheetHead title="Tus metas diarias" onClose={onClose} />
      <p class="small muted">Elige una opción o toca «Otro» para escribir tu número. Se guarda al instante.</p>
      <DailyGoalsEditor />
      <button type="button" class="btn block" onClick={onClose}><Icon name="check" size={20} />Listo</button>
    </Sheet>
  );
}
