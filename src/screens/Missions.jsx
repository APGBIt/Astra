import { useState, useEffect, useRef } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Sheet, SheetHead, TChip, Bolts, AreaDot, Switch, toast, areaColor, areaSoft, areaInk, ask } from '../ui/kit.jsx';
import { canDictate, dictate } from '../ui/dictate.js';
import { act, useApp } from '../app/store.js';
import { back } from '../app/router.js';
import { DAYS_SHORT, DAYS } from '../app/dates.js';
import { AREAS, AREA } from '../game/content.js';
import { classifyMission } from '../game/parse.js';
import {
  addMission, updateMission, archiveMission, missionXP, missionGold, missionDamage, isDone, completeMission, undoMission,
  excuseMission, activeCampaigns, goalTemplate, autoLabel,
} from '../game/logic.js';

const FREQS = [
  { key: 'once', label: 'Una vez' },
  { key: 'daily', label: 'Cada día', icon: 'repeat' },
  { key: 'some', label: 'Algunos días' },
];

export function NewMission({ id }) {
  const s = useApp();
  const editing = id ? s.missions.find((m) => m.id === id) : null;
  const [text, setText] = useState(editing ? editing.title : '');
  const [area, setArea] = useState(editing ? editing.area : null);
  const [cost, setCost] = useState(editing ? editing.cost : null);
  const [freq, setFreq] = useState(editing ? (editing.kind === 'once' ? 'once' : editing.days ? 'some' : 'daily') : null);
  const [days, setDays] = useState(editing && editing.days ? editing.days : [1, 2, 3, 4, 5]);
  const [avoid, setAvoid] = useState(editing ? editing.kind === 'avoid' : null);
  const [penalty, setPenalty] = useState(editing ? editing.penalty : false);
  const [pickArea, setPickArea] = useState(false);
  const [more, setMore] = useState(!!editing);
  const [listening, setListening] = useState(false);

  const cls = classifyMission(text);
  const effArea = area || cls.area;
  const effCost = cost || cls.cost;
  const effAvoid = avoid != null ? avoid : cls.kind === 'avoid';
  const effFreq = freq || (cls.kind === 'once' ? 'once' : cls.days ? 'some' : 'daily');
  const effDays = freq ? days : cls.days || days;
  const kind = effAvoid ? 'avoid' : effFreq === 'once' ? 'once' : 'habit';
  const preview = { cost: effCost, kind };

  const close = () => back('/');

  const save = () => {
    const title = (editing ? text.trim() : cls.title) || text.trim();
    if (title.length < 2) return;
    const p = {
      title,
      area: effArea,
      cost: effCost,
      kind,
      days: kind === 'habit' && effFreq === 'some' ? effDays : null,
      penalty: kind === 'habit' ? penalty : false,
      auto: editing ? editing.auto : cls.auto,
    };
    act((st, today) => {
      if (editing) updateMission(st, editing.id, p);
      else addMission(st, p, today);
    });
    toast(editing ? 'Misión actualizada' : 'Misión agregada', 'check');
    close();
  };

  // Sugerencias de tus campañas que aún no tienes.
  const titles = new Set(s.missions.filter((m) => !m.archived).map((m) => m.title.toLowerCase()));
  const sugg = [];
  for (const c of activeCampaigns(s)) {
    const tpl = goalTemplate(c.area, c.goalId);
    for (const m of (tpl ? tpl.missions : [])) if (!titles.has(m.title.toLowerCase())) sugg.push({ ...m, area: c.area, campaignId: c.id });
  }

  const addSugg = (m) => {
    act((st, today) => addMission(st, m, today));
    toast(`Agregada: ${m.title}`, 'check');
  };

  const stop = useRef(null);
  const mic = () => {
    if (listening) { if (stop.current) stop.current(); setListening(false); return; }
    setListening(true);
    stop.current = dictate((t) => setText(t), () => setListening(false));
  };

  return (
    <Sheet onClose={close} label={editing ? 'Editar misión' : 'Nueva misión'}>
      <SheetHead title={editing ? 'Editar misión' : 'Nueva misión'} onClose={close} />
      <div class="field">
        <label for="mision">¿Qué vas a hacer?</label>
        <div class="inline-input">
          <input id="mision" value={text} maxLength={80} placeholder="Ej. Leer 20 páginas" onInput={(e) => setText(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} autoFocus={!editing} />
          {canDictate && <button type="button" class="icon-btn" aria-label={listening ? 'Detener dictado' : 'Dictar'} aria-pressed={listening ? 'true' : 'false'} onClick={mic} style={listening ? { background: 'var(--vit)', color: '#fff' } : null}><Icon name="mic" size={20} /></button>}
        </div>
        {text.trim().length > 1 && (
          <div class="row wrap" style={{ gap: 6 }}>
            <span class="row tiny strong muted" style={{ gap: 4 }}><Icon name="sparkle" size={14} />{area || cost ? 'Así queda:' : 'Lo ajusté solo:'}</span>
            <button type="button" class="chip" style={{ border: 'none', background: areaSoft(effArea), color: areaInk(effArea), fontWeight: 700, minHeight: 36 }} onClick={() => setPickArea(!pickArea)} aria-expanded={pickArea ? 'true' : 'false'}>
              <Icon name={AREA[effArea].icon} size={15} />{AREA[effArea].attr}<Icon name="down" size={14} />
            </button>
            <button type="button" class="chip tone-ene" style={{ border: 'none', fontWeight: 700, minHeight: 36 }} onClick={() => setCost(effCost >= 3 ? 1 : effCost + 1)} aria-label={`Cuesta ${effCost} de energía. Tocar para cambiar`}>
              <Bolts n={effCost} size={14} color="currentColor" label="" />Cuesta {effCost}
            </button>
            {!effAvoid && <span class="chip tone-xp" style={{ fontWeight: 700, minHeight: 36 }}>+{missionXP(preview)} XP</span>}
            {effAvoid && <span class="chip tone-vit" style={{ fontWeight: 700, minHeight: 36 }}>Mal hábito</span>}
          </div>
        )}
        {pickArea && (
          <div class="chips" role="group" aria-label="Atributo">
            {AREAS.map((a) => <TChip key={a.key} sm on={effArea === a.key} onClick={() => { setArea(a.key); setPickArea(false); }} icon={a.icon} color={areaColor(a.key)}>{a.attr}</TChip>)}
          </div>
        )}
      </div>

      {!effAvoid && (
        <div class="stack-sm">
          <span class="label">¿Cada cuándo?</span>
          <div class="chips" role="group" aria-label="Frecuencia">
            {FREQS.map((f) => <TChip key={f.key} on={effFreq === f.key} icon={f.icon} onClick={() => { setFreq(f.key); if (f.key === 'some' && !freq && cls.days) setDays(cls.days); }}>{f.label}</TChip>)}
          </div>
          {effFreq === 'some' && (
            <div class="row" role="group" aria-label="Días" style={{ gap: 6 }}>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const on = effDays.includes(d);
                return <button key={d} type="button" aria-label={DAYS[d]} aria-pressed={on ? 'true' : 'false'} onClick={() => { setFreq('some'); setDays(on ? effDays.filter((x) => x !== d) : [...effDays, d]); }} style={{ flex: '1 1 0', height: 44, borderRadius: 12, border: on ? 'none' : '1.5px solid var(--line-2)', background: on ? 'var(--ink)' : 'var(--surface)', color: on ? 'var(--on-ink)' : 'var(--muted)', fontWeight: 700 }}>{DAYS_SHORT[d]}</button>;
              })}
            </div>
          )}
        </div>
      )}

      <button type="button" class="btn block" disabled={text.trim().length < 2 || (kind === 'habit' && effFreq === 'some' && !effDays.length)} onClick={save}>
        <Icon name="check" size={20} />{editing ? 'Guardar cambios' : 'Agregar misión'}
      </button>

      {!editing && sugg.length > 0 && (
        <div class="stack-sm">
          <span class="label">O agrega una de tu camino</span>
          {sugg.slice(0, 4).map((m) => (
            <button key={m.title} type="button" onClick={() => addSugg(m)} class="row" style={{ minHeight: 52, padding: '0 14px', borderRadius: 16, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', textAlign: 'left' }}>
              <AreaDot area={m.area} size={10} /><span class="grow semi">{m.title}</span><Icon name="plus" size={20} />
            </button>
          ))}
        </div>
      )}

      {!more ? (
        <button type="button" class="link-btn muted" style={{ alignSelf: 'center' }} onClick={() => setMore(true)}>Más opciones: mal hábito, penalización<Icon name="right" size={16} /></button>
      ) : (
        <section class="card flush" aria-label="Más opciones">
          <label class="lrow" style={{ minHeight: 60 }}>
            <span class="stack-xs grow"><span class="semi">Es un mal hábito que quiero evitar</span><span class="small muted">Da XP cada día limpio; quita vitalidad cuando caes.</span></span>
            <Switch checked={effAvoid} onChange={setAvoid} label="Mal hábito" />
          </label>
          {kind === 'habit' && (
            <label class="lrow" style={{ minHeight: 60 }}>
              <span class="stack-xs grow"><span class="semi">Quita vitalidad si la salto</span><span class="small muted">−{missionDamage({ cost: effCost })} al cerrar el día si no la cumples.</span></span>
              <Switch checked={penalty} onChange={setPenalty} label="Penalización" />
            </label>
          )}
        </section>
      )}
    </Sheet>
  );
}

export function MissionDetail({ id }) {
  const s = useApp();
  const m = s.missions.find((x) => x.id === id);
  const today = s.energy.day;
  const close = () => back('/');
  useEffect(() => { if (!m) close(); }, [m]);
  if (!m) return null;
  const done = isDone(s, m, today);
  const excused = !!s.days[today]?.excused?.[m.id];
  const freq = m.kind === 'once' ? 'Una vez' : m.kind === 'avoid' ? 'Mal hábito a evitar' : m.days ? m.days.map((d) => DAYS[d].slice(0, 3)).join(', ') : 'Cada día';
  const camp = m.campaignId && s.campaigns.find((c) => c.id === m.campaignId);
  return (
    <Sheet onClose={close} label={m.title}>
      <SheetHead title={m.title} onClose={close} />
      <div class="chips">
        <span class="chip" style={{ background: areaSoft(m.area), color: areaInk(m.area), fontWeight: 700 }}><Icon name={AREA[m.area].icon} size={14} />{AREA[m.area].attr}</span>
        <span class="chip"><Icon name="repeat" size={14} />{freq}</span>
        {m.kind !== 'avoid' && <span class="chip tone-ene"><Bolts n={m.cost} size={13} color="currentColor" label="" />Cuesta {m.cost}</span>}
      </div>
      <div class="kpis">
        <div class="kpi"><span class="v" style={{ color: 'var(--xp-ink)' }}>+{m.kind === 'avoid' ? 5 * m.cost : missionXP(m)}</span><span class="l">XP</span></div>
        <div class="kpi"><span class="v">+{m.kind === 'avoid' ? 2 * m.cost : missionGold(m)}</span><span class="l">Oro</span></div>
        <div class="kpi"><span class="v" style={{ color: 'var(--vit-ink)' }}>{m.kind === 'avoid' || m.penalty ? `−${missionDamage(m)}` : `+${m.area === 'salud' ? 2 : 1}`}</span><span class="l">{m.kind === 'avoid' ? 'Si caes' : m.penalty ? 'Si la saltas' : 'Vitalidad'}</span></div>
      </div>
      {m.auto && <div class="note tone-good"><Icon name="sparkle" size={18} /><span>{autoLabel(m)}. También puedes marcarla a mano.</span></div>}
      {camp && <div class="note"><Icon name="map" size={18} /><span>Parte de tu campaña «{camp.title}».</span></div>}
      {m.kind !== 'avoid' && (
        <div class="stack">
          <button type="button" class={`btn block ${done ? 'ghost' : ''}`} onClick={() => { act((st, t, ev) => (done ? undoMission(st, m.id, t) : completeMission(st, m.id, t, ev))); close(); }}>
            <Icon name={done ? 'undo' : 'check'} size={20} />{done ? 'Desmarcar' : 'Completar misión'}
          </button>
          {m.penalty && !done && !excused && (
            <button type="button" class="btn ghost block" disabled={s.streak.freezes <= 0} onClick={() => { if (act((st, t) => excuseMission(st, m.id, t))) { toast('Hoy no cuenta. Usaste un protector.', 'shield'); close(); } }}>
              <Icon name="shield" size={18} />Hoy no puedo · usar protector ({s.streak.freezes})
            </button>
          )}
          {excused && <p class="small muted" style={{ textAlign: 'center' }}>Hoy está cubierta por un protector.</p>}
        </div>
      )}
      <div class="row" style={{ justifyContent: 'space-between' }}>
        <a class="btn sm soft" href={`#/mision/${m.id}/editar`}><Icon name="edit" size={18} />Editar</a>
        <button type="button" class="btn sm soft" style={{ color: 'var(--vit-ink)' }} onClick={async () => { if (await ask('¿Archivar esta misión? Deja de aparecer en tus días.', { ok: 'Archivar', danger: true })) { act((st) => archiveMission(st, m.id)); toast('Misión archivada', 'trash'); close(); } }}><Icon name="trash" size={18} />Archivar</button>
      </div>
    </Sheet>
  );
}
