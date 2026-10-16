import { Icon } from './icons.jsx';
import { TChip } from './kit.jsx';
import { catGroups } from '../game/logic.js';

// Categorías de un tipo (gasto, ingreso o entre cuentas), agrupadas por familia.
export function CatPicker({ s, type, value, onChange, onNew }) {
  const groups = catGroups(s, type);
  return (
    <div class="stack">
      {groups.map((g) => (
        <div class="stack-sm" key={g.id}>
          {groups.length > 1 && <span class="tiny strong muted" style={{ letterSpacing: 0.6, textTransform: 'uppercase' }}>{g.name}</span>}
          <div class="chips" role="group" aria-label={g.name}>
            {g.cats.map((c) => <TChip key={c.id} sm icon={c.icon || 'tag'} on={value === c.id} onClick={() => onChange(c.id)}>{c.name}</TChip>)}
          </div>
        </div>
      ))}
      {onNew && <button type="button" class="link-btn" style={{ alignSelf: 'flex-start' }} onClick={onNew}><Icon name="plus" size={16} />Nueva categoría</button>}
    </div>
  );
}
