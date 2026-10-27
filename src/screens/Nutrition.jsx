// Salud 1.14: tu plan de suplementos (qué tomas a qué hora, qué choca y cómo acomodarlo) y la guía de
// vitaminas y minerales (para qué sirven, cuánto, cuándo, con qué, por cuánto tiempo y con qué medicinas cuidarse).
import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { TopBar, Nav, Sheet, SheetHead, TChip, toast, ask, areaColor, areaSoft, areaInk, joinY } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { fmtClock } from '../game/logic.js';
import {
  NUTRIENTS, NUTRIENT, NUTRIENT_KINDS, SLOT, supplementPlan, applyPlanTimes, planTimeline, suggestTimes, rdaText,
  mealTimes, setMealTimes, nutrientOf, fold, DEFAULT_MEALS,
} from '../game/nutrients.js';
import { MedSheet } from './HealthPlus.jsx';

const LEVEL_TONE = { 3: 'tone-vit', 2: 'tone-xp', 1: '' };

// ---------- Tarjeta en Salud: tu plan del día ----------

export function SuppPlanCard({ s, onEdit }) {
  const [all, setAll] = useState(false);
  const [sheet, setSheet] = useState(null);
  const meds = (s.meds || []).filter((m) => !m.archived);
  const plan = supplementPlan(s);
  const line = planTimeline(s);
  const nFix = Object.keys(plan.fix).length;
  const changes = Object.entries(plan.fix).map(([id, t]) => { const m = meds.find((x) => x.id === id); return { id, name: m.name, from: m.times, to: t }; });
  const fix = async () => {
    if (!(await ask(`¿Cambiar ${nFix === 1 ? 'esta hora' : `estas ${nFix} horas`}? Los avisos de tus tomas se mueven también.`, { ok: 'Cambiar' }))) return;
    act((x) => applyPlanTimes(x, plan.fix));
    toast('Horarios acomodados', 'clock');
  };
  const tip = (t) => { act((x) => applyPlanTimes(x, { [t.id]: [t.to] })); toast(`${t.name}: ${fmtClock(t.to)}`, 'clock'); };
  if (!meds.length) {
    return (
      <section class="card" aria-label="Vitaminas y minerales">
        <div class="row-top">
          <span class="tile" style={{ background: areaSoft('salud'), color: areaColor('salud') }}><Icon name="pill" /></span>
          <div class="stack-xs grow"><span class="strong">Vitaminas y minerales</span><span class="small muted">Para qué sirve cada una, cuánto necesitas, a qué hora tomarla, con qué no mezclarla y por cuánto tiempo.</span></div>
        </div>
        <a href="#/nutrientes" class="btn sm soft" style={{ alignSelf: 'flex-start' }}><Icon name="book" size={17} />Abrir la guía</a>
      </section>
    );
  }
  const warns = all ? plan.warn : plan.warn.slice(0, 2);
  return (
    <section class="card" aria-label="Tu plan de suplementos">
      <div class="between-c"><h2 class="h2">Tu plan del día</h2><button type="button" class="link-btn" onClick={() => setSheet('meals')}><Icon name="clock" size={15} />Mis horarios</button></div>
      <div class="stack-xs">
        {line.map((g) => (
          <div key={g.time} class="row-top" style={{ gap: 12, padding: '6px 0' }}>
            <span class="tab-num semi" style={{ width: 84, flexShrink: 0, whiteSpace: 'nowrap' }}>{fmtClock(g.time)}</span>
            <span class="stack-xs grow" style={{ minWidth: 0 }}>
              <span class="tiny muted semi">{g.label}</span>
              <span class="row wrap" style={{ gap: 6 }}>{g.list.map((x) => <button key={x.med.id} type="button" class="chip" style={{ minHeight: 36 }} onClick={() => onEdit(x.med.id)} aria-label={`Editar ${x.med.name}`}><Icon name="pill" size={13} />{x.med.name}</button>)}</span>
            </span>
          </div>
        ))}
      </div>
      {warns.map((w, i) => <div key={i} class={`note ${LEVEL_TONE[w.level]}`}><Icon name={w.icon} size={18} /><span>{w.text}</span></div>)}
      {plan.warn.length > 2 && <button type="button" class="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setAll(!all)}>{all ? 'Ver menos' : `Ver ${plan.warn.length - 2} ${plan.warn.length - 2 === 1 ? 'aviso más' : 'avisos más'}`}</button>}
      {nFix > 0 && (
        <div class="panel stack-xs">
          <span class="label">Propuesta para que nada choque</span>
          {changes.map((c) => <span key={c.id} class="small"><b>{c.name}:</b> {c.from.map(fmtClock).join(', ')} → <b>{c.to.map(fmtClock).join(', ')}</b></span>)}
        </div>
      )}
      {nFix > 0 && <button type="button" class="btn sm" style={{ alignSelf: 'flex-start' }} onClick={fix}><Icon name="clock" size={17} />Acomodar {nFix === 1 ? '1 horario' : `${nFix} horarios`}</button>}
      {!plan.warn.length && plan.count > 0 && <div class="note tone-good"><Icon name="check" size={18} /><span>Nada choca: tus suplementos están separados como se recomienda.</span></div>}
      {plan.tips.slice(0, 2).map((t) => (
        <div key={t.id} class="between-c small" style={{ gap: 10 }}>
          <span class="muted"><b style={{ color: 'var(--ink)' }}>{t.name}</b> se aprovecha mejor {SLOT[t.slot].label.toLowerCase()} ({fmtClock(t.to)}).</span>
          <button type="button" class="link-btn" style={{ flexShrink: 0 }} onClick={() => tip(t)}>Cambiar</button>
        </div>
      ))}
      <a href="#/nutrientes" class="link-btn" style={{ alignSelf: 'flex-start' }}><Icon name="book" size={16} />Guía de vitaminas y minerales</a>
      {sheet === 'meals' && <MealTimesSheet s={s} onClose={() => setSheet(null)} />}
    </section>
  );
}

export function MealTimesSheet({ s, onClose }) {
  const [m, setM] = useState(() => mealTimes(s));
  const rows = [['desayuno', 'Desayuno'], ['almuerzo', 'Almuerzo'], ['cena', 'Cena'], ['dormir', 'Me acuesto']];
  const save = () => { act((x) => setMealTimes(x, m)); toast('Horarios guardados', 'clock'); onClose(); };
  return (
    <Sheet onClose={onClose} label="Mis horarios">
      <SheetHead title="Mis horarios" onClose={onClose} />
      <span class="small muted">Con tus horas de comida, Astra sugiere cuándo tomar cada suplemento: en ayunas, con la comida que tiene grasa o en la noche.</span>
      {rows.map(([k, l]) => (
        <div key={k} class="between-c">
          <label class="semi" for={`mt-${k}`}>{l}</label>
          <input id={`mt-${k}`} type="time" class="input" style={{ width: 140 }} value={m[k]} onInput={(e) => setM({ ...m, [k]: e.currentTarget.value || DEFAULT_MEALS[k] })} />
        </div>
      ))}
      <button type="button" class="btn block" onClick={save}><Icon name="check" size={20} />Guardar</button>
    </Sheet>
  );
}

// ---------- Guía ----------

export function Nutrients({ query }) {
  const s = useApp();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('todos');
  const [open, setOpen] = useState(() => (query && NUTRIENT[query.get('n')] ? query.get('n') : null));
  const [add, setAdd] = useState(null);
  const qn = query ? query.get('n') : null;
  useEffect(() => { if (qn && NUTRIENT[qn]) { setAdd(null); setOpen(qn); } }, [qn]);
  const mine = new Map();
  for (const m of (s.meds || []).filter((x) => !x.archived)) { const n = nutrientOf(m.name); if (n) mine.set(n.key, [...(mine.get(n.key) || []), m]); }
  const f = fold(q);
  const list = NUTRIENTS.filter((n) => (kind === 'todos' || (kind === 'mios' ? mine.has(n.key) : n.kind === kind)) && (!f || fold(`${n.name} ${n.aliases.join(' ')} ${n.foods} ${n.what}`).includes(f)))
    .map((n, i) => [n, f && fold(`${n.name} ${n.aliases.join(' ')}`).includes(f) ? 0 : 1, i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map((x) => x[0]);
  return (
    <>
      <main class="screen">
        <TopBar backTo="/area/salud" />
        <div class="stack-xs">
          <span class="eyebrow" style={{ color: areaInk('salud') }}>Vigor · Salud</span>
          <h1 class="h1">Vitaminas y minerales</h1>
          <p class="lead">Para qué sirven, cuánto necesitas, a qué hora tomarlas y por cuánto tiempo.</p>
        </div>
        <div class="field"><label for="nq" class="sr-only">Buscar</label><input id="nq" class="input" type="search" placeholder="Buscar: hierro, calambres, aguacate…" value={q} onInput={(e) => setQ(e.currentTarget.value)} /></div>
        <div class="chips scroll" role="group" aria-label="Filtrar">
          <TChip sm on={kind === 'todos'} onClick={() => setKind('todos')}>Todos</TChip>
          {mine.size > 0 && <TChip sm on={kind === 'mios'} onClick={() => setKind('mios')}>Los que tomo · {mine.size}</TChip>}
          {NUTRIENT_KINDS.map(([k, l]) => <TChip key={k} sm on={kind === k} onClick={() => setKind(k)}>{l}</TChip>)}
        </div>
        <section class="card flush" aria-label="Lista">
          {list.map((n) => (
            <button key={n.key} type="button" class="lrow" style={{ padding: '12px 16px', minHeight: 64 }} onClick={() => setOpen(n.key)}>
              <span class="tile sm" style={{ background: areaSoft('salud'), color: areaColor('salud') }}><Icon name={n.icon} size={18} /></span>
              <span class="stack-xs grow" style={{ minWidth: 0 }}>
                <span class="semi">{n.name}{mine.has(n.key) && <span class="tiny" style={{ color: areaInk('salud') }}> · lo tomas</span>}</span>
                <span class="tiny muted semi clip">{SLOT[n.slot].label} · {rdaText(n)}</span>
              </span>
              <Icon name="right" size={16} />
            </button>
          ))}
          {!list.length && <div style={{ padding: 16 }} class="small muted">No encontré nada con «{q}».</div>}
        </section>
        <div class="note"><Icon name="info" size={18} /><span>Cantidades para adultos según las tablas de referencia de los Institutos Nacionales de Salud de EE. UU. (NIH). Es información general: antes de empezar o dejar un suplemento, sobre todo si tomas medicinas, estás embarazada o tienes una enfermedad, consulta a tu médico o farmacéutico. La comida variada es la primera fuente.</span></div>
      </main>
      <Nav active="areas" />
      {open && !add && <NutrientSheet s={s} n={NUTRIENT[open]} mine={mine.get(open) || []} onClose={() => setOpen(null)} onAdd={(p) => setAdd(p)} />}
      {add && <MedSheet s={s} id={null} preset={add} onClose={() => { setAdd(null); setOpen(null); }} />}
    </>
  );
}

function Fact({ icon, title, children }) {
  if (!children) return null;
  return (
    <div class="row-top" style={{ gap: 12 }}>
      <span style={{ color: areaColor('salud'), display: 'flex', marginTop: 2 }}><Icon name={icon} size={18} /></span>
      <span class="stack-xs grow"><span class="label">{title}</span><span class="small">{children}</span></span>
    </div>
  );
}

export function NutrientSheet({ s, n, mine, onClose, onAdd }) {
  const t = suggestTimes(s, n)[0];
  const gaps = (n.gap || []).map(([k, h]) => (k === '*' ? `medicinas y otros suplementos (${h} h)` : `${NUTRIENT[k].name.toLowerCase()} (${h} h)`));
  return (
    <Sheet onClose={onClose} label={n.name}>
      <SheetHead title={n.name} onClose={onClose} />
      <span class="small">{n.what}</span>
      <div class="panel stack-xs">
        <span class="label">Cuándo tomarlo</span>
        <span class="strong">{SLOT[n.slot].label} · {fmtClock(t)}</span>
        <span class="small">{n.with}</span>
        {gaps.length > 0 && <span class="small"><b>Sepáralo de:</b> {gaps.join(', ')}.</span>}
      </div>
      <Fact icon="target" title="Cuánto al día">{n.rda ? <>{rdaText(n)}.{n.older ? ` ${n.older}` : ''}</> : n.older || 'Según la etiqueta.'}</Fact>
      <Fact icon="shield" title="Límite superior">{n.ulText}</Fact>
      <Fact icon="calendar" title="Por cuánto tiempo">{n.period}</Fact>
      <Fact icon="utensils" title="Dónde está en la comida">{n.foods}</Fact>
      <Fact icon="people" title="Quién podría necesitarlo">{n.who}</Fact>
      <Fact icon="pill" title="Cuidado con medicinas">{n.meds}</Fact>
      {mine.length > 0 ? (
        <div class="note tone-good"><Icon name="check" size={18} /><span>Lo tomas: {mine.map((m) => `${m.name} a las ${joinY(m.times.map(fmtClock))}`).join('; ')}.</span></div>
      ) : (
        <button type="button" class="btn block soft" onClick={() => onAdd({ name: n.name, kind: 'suplemento', times: [t], note: n.with.split('. ')[0].slice(0, 160) })}><Icon name="plus" size={18} />Agregar a mis suplementos</button>
      )}
      <span class="tiny muted">Información general para adultos. No reemplaza a tu médico ni lo que diga la etiqueta del producto.</span>
    </Sheet>
  );
}

