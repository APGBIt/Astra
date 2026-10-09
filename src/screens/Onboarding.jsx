import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { TChip, Avatar, AreaTile, Bolts, NumberChips, NumberField, money, num, toast, areaInk, areaColor, areaSoft, cuantos, focusOnMount } from '../ui/kit.jsx';
import { act, useApp, importData } from '../app/store.js';
import { go, back } from '../app/router.js';
import { AREAS, AREA, GOALS, DEADLINES, INTENSITIES, SOURCES, GOAL_PRESETS } from '../game/content.js';
import { className, startCampaign, suggestedMissions, goalTemplate, fmtHours } from '../game/logic.js';
import { toNumber } from '../game/parse.js';
import { addDays, diffDays, fmtDay } from '../app/dates.js';

export function Welcome() {
  const onImport = async (e) => {
    const f = e.currentTarget.files && e.currentTarget.files[0];
    if (!f) return;
    try {
      importData(await f.text());
      toast('Copia recuperada');
      go('/', { replace: true });
    } catch (err) {
      toast(err.message || 'No se pudo leer la copia', 'info');
    }
  };
  const feats = [
    ['heart', 'var(--vit)', 'Vitalidad y energía', 'Una barra de vida que refleja cómo te cuidas y un presupuesto de energía para tu día.'],
    ['map', 'var(--ink)', 'Caminos y metas', 'Eliges tu camino, fijas una meta y la conviertes en una campaña con capítulos.'],
    ['sword', 'var(--xp)', 'Misiones y jefes', 'Tus hábitos son misiones. Tus metas grandes, jefes que vas derrotando golpe a golpe.'],
  ];
  return (
    <main class="screen no-nav" style={{ paddingTop: 48, minHeight: '100dvh' }}>
      <div class="stack-lg center" style={{ display: 'flex' }}>
        <Logo size={96} />
        <div class="stack-sm">
          <h1 class="h1 lg">Astra</h1>
          <p class="lead">Tu vida en modo juego de rol. Crece en seis áreas, sube de nivel y vence a tus propios jefes.</p>
        </div>
      </div>
      <div class="card" style={{ gap: 18 }}>
        {feats.map(([ic, c, t, d]) => (
          <div class="row-top" key={t}>
            <span class="tile" style={{ background: 'var(--soft)', color: c }}><Icon name={ic} /></span>
            <div class="stack-xs"><span class="strong">{t}</span><span class="small muted">{d}</span></div>
          </div>
        ))}
      </div>
      <div class="spacer" />
      <div class="stack">
        <a class="btn block" href="#/crear">Crear mi personaje<Icon name="right" size={20} /></a>
        <label class="btn ghost block" style={{ position: 'relative' }}>
          Ya tengo una copia: recuperarla
          <input type="file" accept="application/json,.json" onChange={onImport} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
        </label>
        <span class="row tiny muted" style={{ justifyContent: 'center' }}><Icon name="lock" size={14} />Todo se guarda solo en tu teléfono.</span>
      </div>
    </main>
  );
}

export function Logo({ size = 64 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Astra" style={{ flexShrink: 0 }}>
      <rect width="64" height="64" rx="18" fill="var(--boss)" />
      <path d="M32 12l4.6 13.4L50 30l-13.4 4.6L32 48l-4.6-13.4L14 30l13.4-4.6z" fill="var(--xp)" />
      <circle cx="47" cy="17" r="3" fill="#FAFAF7" />
    </svg>
  );
}

function Steps({ n, total }) {
  return (
    <div role="img" aria-label={`Paso ${n} de ${total}`} class="row" style={{ gap: 6 }}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} style={{ width: i + 1 === n ? 22 : 8, height: 8, borderRadius: 4, background: i + 1 <= n ? 'var(--ink)' : 'var(--line-2)', display: 'block' }} />
      ))}
    </div>
  );
}

// ---------- Crear personaje: nombre, estado inicial, caminos y metas ----------

export function Create() {
  const s = useApp();
  const [step, setStep] = useState(1);
  const [name, setName] = useState(s.profile.name || '');
  const [sleepGoal, setSleepGoal] = useState(s.profile.sleepGoal || 7);
  const [ratings, setRatings] = useState({ salud: 3, emocional: 3, relaciones: 3, crecimiento: 3, finanzas: 3, laborales: 3, ...s.profile.selfRating });
  const [paths, setPaths] = useState([]);
  const [goals, setGoals] = useState({});
  const total = 3 + Math.max(1, paths.length);

  const togglePath = (k) => setPaths((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length >= 2 ? [p[1], k] : [...p, k]));

  const finish = () => {
    act((st, today) => {
      st.profile.name = name.trim() || 'Aventurero';
      st.profile.sleepGoal = sleepGoal;
      st.profile.selfRating = ratings;
      const avg = Object.values(ratings).reduce((a, b) => a + b, 0) / 6;
      st.vit = Math.round(50 + avg * 8);
      st.profile.classKeys = [...paths];
      for (const k of paths) {
        const g = goals[k];
        if (g) startCampaign(st, { area: k, ...g }, today);
      }
      st.profile.onboarded = true;
    });
    go('/', { replace: true });
  };

  if (step === 1) {
    return (
      <main class="screen no-nav">
        <header class="between-c"><button type="button" class="icon-btn" aria-label="Volver" onClick={() => back('/')}><Icon name="left" /></button><Steps n={1} total={total} /><span style={{ width: 44 }} /></header>
        <div class="stack-sm"><h1 class="h1">Crea tu personaje</h1><p class="lead">Sé honesto: tu punto de partida define tus primeras misiones, no tu valor.</p></div>
        <div class="row" style={{ gap: 14 }}>
          <Avatar name={name || 'A'} size={64} />
          <div class="field grow"><label for="nombre">¿Cómo te llamamos?</label><input id="nombre" class="input" value={name} maxLength={30} autoComplete="given-name" onInput={(e) => setName(e.currentTarget.value)} placeholder="Tu nombre" /></div>
        </div>
        <section class="card" aria-label="Cómo estás hoy">
          <div class="stack-xs"><h2 class="h2">¿Cómo estás hoy en cada área?</h2><span class="small muted">1 = muy descuidada · 5 = en su mejor momento</span></div>
          {AREAS.map((a) => (
            <div class="row" key={a.key} style={{ gap: 10 }}>
              <AreaTile area={a.key} size="sm" />
              <span class="grow strong small">{a.area}</span>
              <div class="row" role="group" aria-label={a.area} style={{ gap: 4 }}>
                {[1, 2, 3, 4, 5].map((v) => {
                  const on = v <= ratings[a.key];
                  const sel = v === ratings[a.key];
                  return (
                    <button key={v} type="button" aria-label={`${v} de 5`} aria-pressed={sel ? 'true' : 'false'}
                      onClick={() => setRatings({ ...ratings, [a.key]: v })}
                      style={{ width: 36, height: 40, borderRadius: 10, border: on ? 'none' : '1.5px solid var(--line-2)', background: sel ? areaInk(a.key) : on ? areaSoft(a.key) : 'var(--surface)', color: sel ? 'var(--surface)' : on ? areaInk(a.key) : 'var(--muted)', fontWeight: 800, fontSize: 13 }}>{v}</button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
        <div class="stack-sm">
          <span class="label">¿Cuántas horas quieres dormir?</span>
          <NumberChips value={sleepGoal} onChange={setSleepGoal} presets={GOAL_PRESETS.sleep} format={(v) => (Number.isInteger(v) ? `${v} horas` : fmtHours(v))} unit="horas" step={0.25} min={4} max={12} label="Meta de sueño" sm={false} />
          <span class="small muted">Dormir tu meta llena tu energía del día. Puedes cambiarla después.</span>
        </div>
        <button type="button" class="btn block" onClick={() => setStep(2)}>Siguiente: tu camino<Icon name="right" size={20} /></button>
      </main>
    );
  }

  if (step === 2) {
    return (
      <main class="screen no-nav">
        <header class="between-c"><button type="button" class="icon-btn" aria-label="Volver" onClick={() => setStep(1)}><Icon name="left" /></button><Steps n={2} total={total} /><span style={{ width: 44 }} /></header>
        <PathPicker paths={paths} onToggle={togglePath} />
        <button type="button" class="btn block" disabled={!paths.length} onClick={() => setStep(3)}>Siguiente: tu meta<Icon name="right" size={20} /></button>
      </main>
    );
  }

  const goalIdx = step - 3;
  if (goalIdx < paths.length) {
    const area = paths[goalIdx];
    return (
      <main class="screen no-nav">
        <header class="between-c"><button type="button" class="icon-btn" aria-label="Volver" onClick={() => setStep(step - 1)}><Icon name="left" /></button><Steps n={step} total={total} /><span style={{ width: 44 }} /></header>
        <GoalForm
          key={area}
          area={area}
          initial={goals[area]}
          cta={goalIdx + 1 < paths.length ? `Siguiente: camino del ${AREA[paths[goalIdx + 1]].cls}` : 'Ver mi personaje'}
          onDone={(g) => { setGoals({ ...goals, [area]: g }); setStep(step + 1); }}
        />
      </main>
    );
  }

  // Resumen final
  const avg = Object.values(ratings).reduce((a, b) => a + b, 0) / 6;
  return (
    <main class="screen no-nav">
      <header class="between-c"><button type="button" class="icon-btn" aria-label="Volver" onClick={() => setStep(step - 1)}><Icon name="left" /></button><Steps n={total} total={total} /><span style={{ width: 44 }} /></header>
      <div class="stack-lg center" style={{ display: 'flex' }}>
        <Avatar name={name || 'A'} size={96} />
        <div class="stack-xs"><h1 class="h1">{name.trim() || 'Aventurero'}</h1><span class="muted strong">Nivel 1 · {className(paths)}</span></div>
      </div>
      <section class="card">
        <div class="between-c"><span class="row strong" style={{ color: 'var(--vit-ink)' }}><Icon name="heart" size={18} fill />Vitalidad inicial</span><span class="strong">{Math.round(50 + avg * 8)} / 100</span></div>
        <span class="small muted">Sale de cómo te sientes hoy en tus seis áreas. Tu energía de cada día saldrá de tu sueño.</span>
      </section>
      {paths.map((k) => {
        const g = goals[k];
        const tpl = g && goalTemplate(k, g.goalId);
        return (
          <section class="card tight" key={k}>
            <div class="row"><AreaTile area={k} /><div class="stack-xs grow"><span class="tiny strong" style={{ color: areaInk(k) }}>Camino del {AREA[k].cls}</span><span class="strong">{tpl ? tpl.title : g.title}</span></div></div>
            <span class="small muted">{g.days} días · {g.missions.length} {g.missions.length === 1 ? 'misión diaria' : 'misiones'} · Jefe: {tpl ? tpl.boss : `El jefe de «${g.title}»`}</span>
          </section>
        );
      })}
      <div class="note tone-xp"><Icon name="sparkle" size={20} /><span>Clase <b>{className(paths)}</b>: las misiones de {paths.map((k) => AREA[k].attr).join(' y ')} dan +20 % de XP.</span></div>
      <button type="button" class="btn block" onClick={finish}>Empezar la aventura<Icon name="right" size={20} /></button>
    </main>
  );
}

export function PathPicker({ paths, onToggle, title = 'Elige tu camino', sub = 'Escoge hasta dos. Tu clase sale de la mezcla y puedes cambiarla cuando quieras.' }) {
  return (
    <>
      <div class="stack-sm"><h1 class="h1">{title}</h1><p class="lead">{sub}</p></div>
      <div class="grid2">
        {AREAS.map((a) => {
          const on = paths.includes(a.key);
          return (
            <button key={a.key} type="button" aria-pressed={on ? 'true' : 'false'} onClick={() => onToggle(a.key)}
              style={{ position: 'relative', textAlign: 'left', padding: 16, borderRadius: 24, border: on ? '2px solid var(--ink)' : '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {on && <span style={{ position: 'absolute', top: 12, right: 12, width: 26, height: 26, borderRadius: 13, background: 'var(--ink)', color: 'var(--on-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={16} stroke={2.8} /></span>}
              <AreaTile area={a.key} />
              <span class="stack-xs"><span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700 }}>{a.cls}</span><span class="tiny strong" style={{ color: areaInk(a.key) }}>{a.attr} · {a.area}</span></span>
              <span class="small muted" style={{ lineHeight: 1.35 }}>{a.desc}</span>
            </button>
          );
        })}
      </div>
      {paths.length > 0 && <div class="note"><Icon name="sparkle" size={20} /><span>Tu clase: <b>{className(paths)}</b>. Las misiones de {paths.map((k) => AREA[k].attr).join(' y ')} dan +20 % de XP.</span></div>}
    </>
  );
}

// ---------- Meta de un camino ----------

export function GoalForm({ area, initial, onDone, cta = 'Empezar el camino' }) {
  const s = useApp();
  const today = s.energy.day;
  const a = AREA[area];
  const templates = GOALS[area] || [];
  const [goalId, setGoalId] = useState(initial ? initial.goalId : templates[0].id);
  const [title, setTitle] = useState(initial && initial.goalId === 'custom' ? initial.title : '');
  const [unit, setUnit] = useState(initial && initial.unit ? initial.unit : 'avances');
  const tpl = goalTemplate(area, goalId);
  const [target, setTarget] = useState(initial ? Number(initial.target) || 0 : tpl && tpl.target ? tpl.target : 0);
  const [days, setDays] = useState(initial ? initial.days : 90);
  const [otherDate, setOtherDate] = useState(initial ? !DEADLINES.some((d) => d.days === initial.days) : false);
  const [intensity, setIntensity] = useState(initial ? initial.intensity : 'normal');
  const [picked, setPicked] = useState(() => (initial ? initial.missions.map((m) => m.orig || m.title) : suggestedMissions(area, goalId, 'normal', s).filter((m) => m.picked).map((m) => m.title)));
  const [names, setNames] = useState(() => (initial ? Object.fromEntries(initial.missions.filter((m) => m.orig).map((m) => [m.orig, m.title])) : {}));
  const [editName, setEditName] = useState(null);

  const choose = (id) => {
    setGoalId(id);
    const t = goalTemplate(area, id);
    setTarget(t && t.target ? t.target : 0);
    setNames({});
    setPicked(suggestedMissions(area, id, intensity, s).filter((m) => m.picked).map((m) => m.title));
  };
  const chooseIntensity = (k) => {
    setIntensity(k);
    setPicked(suggestedMissions(area, goalId, k, s).filter((m) => m.picked).map((m) => m.title));
  };
  const sugg = suggestedMissions(area, goalId, intensity, s);
  const targetNum = Number(target) || 0;
  const valid = targetNum > 0 && (goalId === 'custom' ? title.trim().length > 1 : !!tpl);
  const it = INTENSITIES.find((x) => x.key === intensity);
  const isMoney = !!(tpl && tpl.money);
  const step = isMoney ? 1000 : targetNum >= 300 ? 50 : targetNum >= 60 ? 5 : 1;

  // Una misión con su número cambiado («10,000 pasos», «Leer 30 páginas»).
  const finalMission = (m) => {
    const name = (names[m.title] || '').trim();
    const { picked: _p, ...out } = m;
    if (!name || name === m.title) return out;
    out.title = name;
    out.orig = m.title;
    if (m.auto && m.auto.metric === 'steps') {
      const n = toNumber((name.match(/(\d[\d.,]*)/) || [])[1] || '');
      if (n) out.auto = { metric: 'steps', gte: n };
    }
    return out;
  };

  const submit = () => {
    if (!valid || (goalId !== 'custom' && !tpl)) return;
    onDone({
      goalId,
      title: goalId === 'custom' ? title.trim() : tpl.title,
      unit: goalId === 'custom' ? unit : tpl.unit,
      target: targetNum,
      days,
      intensity,
      missions: sugg.filter((m) => picked.includes(m.title)).map(finalMission),
    });
  };

  return (
    <>
      <div class="stack-sm">
        <span class="row small strong" style={{ color: areaInk(area), gap: 6 }}><Icon name={a.icon} size={16} />Camino del {a.cls}</span>
        <h1 class="h1">¿Cuál es tu meta?</h1>
      </div>
      <div class="stack" role="radiogroup" aria-label="Metas">
        {templates.map((g) => (
          <button key={g.id} type="button" role="radio" aria-checked={goalId === g.id ? 'true' : 'false'} onClick={() => choose(g.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 68, padding: '12px 16px', borderRadius: 20, border: goalId === g.id ? '2px solid var(--ink)' : '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', textAlign: 'left' }}>
            <span class="stack-xs grow"><span class="strong" style={{ fontSize: 16 }}>{g.title}</span><span class="small muted">{g.desc}</span></span>
            <Radio on={goalId === g.id} />
          </button>
        ))}
        <button type="button" role="radio" aria-checked={goalId === 'custom' ? 'true' : 'false'} onClick={() => choose('custom')}
          style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '0 16px', borderRadius: 20, border: goalId === 'custom' ? '2px solid var(--ink)' : '1.5px dashed var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', textAlign: 'left', fontWeight: 700 }}>
          <Icon name="edit" size={18} /><span class="grow">Escribir mi propia meta</span><Radio on={goalId === 'custom'} />
        </button>
      </div>
      {goalId === 'custom' && (
        <div class="stack">
          <div class="field"><label for="gt">Tu meta</label><input id="gt" class="input" value={title} maxLength={60} onInput={(e) => setTitle(e.currentTarget.value)} placeholder="Ej. Terminar mi diplomado" /></div>
          <div class="field"><label for="gu">¿Cómo la vas a medir?</label><input id="gu" class="input" value={unit} maxLength={20} onInput={(e) => setUnit(e.currentTarget.value)} placeholder="Ej. módulos, kilos, avances" /></div>
        </div>
      )}
      <div class="field">
        <label for="gtarget">{goalId === 'custom' ? `${cuantos(unit || 'avances').slice(0, -1)} para lograrla?` : tpl.targetLabel || `${cuantos(tpl.unit)} Pon tu número`}</label>
        <NumberField id="gtarget" value={targetNum} onChange={setTarget} step={step} min={0} prefix={isMoney ? 'RD$' : ''} unit={isMoney ? '' : goalId === 'custom' ? (unit || 'avances') : tpl.unit} label="Número de tu meta" />
        {tpl && tpl.target && targetNum !== tpl.target && <button type="button" class="link-btn muted" style={{ alignSelf: 'flex-start' }} onClick={() => setTarget(tpl.target)}><Icon name="undo" size={16} />Volver a la sugerencia: {num(tpl.target)} {tpl.unit}</button>}
        {tpl && tpl.target && targetNum === tpl.target && <span class="small muted">Sugerido: {num(tpl.target)} {tpl.unit}. Cámbialo con − y + o escribe el tuyo.</span>}
        {isMoney && targetNum > 0 && <span class="small muted">{money(targetNum)} · será la vida de tu jefe.</span>}
        {tpl && !tpl.money && <span class="small muted">{SOURCES[tpl.source]}.</span>}
      </div>
      <div class="stack-sm">
        <span class="label">¿En cuánto tiempo?</span>
        <div class="chips">
          {DEADLINES.map((d) => <TChip key={d.days} on={!otherDate && days === d.days} onClick={() => { setOtherDate(false); setDays(d.days); }}>{d.label}</TChip>)}
          <TChip icon="calendar" on={otherDate} onClick={() => setOtherDate(true)}>{otherDate ? `${days} días` : 'Otra fecha'}</TChip>
        </div>
        {otherDate && <input type="date" class="input" aria-label="Fecha límite de la meta" min={addDays(today, 7)} value={addDays(today, days)} onInput={(e) => { const v = e.currentTarget.value; if (v && v > today) setDays(Math.max(1, diffDays(today, v))); }} />}
        <span class="small muted">Hasta el {fmtDay(addDays(today, days), { weekdayName: false })}.</span>
      </div>
      <div class="stack-sm">
        <span class="label">Intensidad</span>
        <div class="chips">{INTENSITIES.map((x) => <TChip key={x.key} on={intensity === x.key} onClick={() => chooseIntensity(x.key)} icon="bolt" fill color="var(--ene)">{x.label}</TChip>)}</div>
        <span class="small muted">{it.label} usa unos {it.energy} de energía al día.</span>
      </div>
      {sugg.length > 0 && (
        <section class="card flush" aria-label="Misiones sugeridas">
          <div style={{ padding: '14px 0 4px' }}><span class="eyebrow">Misiones para empezar</span></div>
          {sugg.map((m) => {
            const on = picked.includes(m.title);
            const shown = names[m.title] || m.title;
            return (
              <div key={m.title} class="lrow" style={{ gap: 10 }}>
                {editName === m.title ? (
                  <input class="input grow" style={{ minHeight: 44 }} value={shown} maxLength={80} aria-label="Nombre de la misión" ref={focusOnMount} enterKeyHint="done"
                    onInput={(e) => setNames({ ...names, [m.title]: e.currentTarget.value })}
                    onBlur={() => { setEditName(null); if ((names[m.title] || '').trim() && names[m.title].trim() !== m.title && !on) setPicked([...picked, m.title]); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
                ) : (
                  <label class="row grow" style={{ cursor: 'pointer', gap: 12, minHeight: 44 }}>
                    <input type="checkbox" checked={on} onChange={() => setPicked(on ? picked.filter((x) => x !== m.title) : [...picked, m.title])} style={{ width: 22, height: 22, accentColor: 'var(--ink)', margin: 0, flexShrink: 0 }} />
                    <span class="grow semi">{shown}{m.kind === 'avoid' && <span class="tiny muted"> · evitar</span>}</span>
                  </label>
                )}
                {editName !== m.title && <button type="button" class="icon-btn plain" aria-label={`Cambiar el número o el nombre de «${shown}»`} onClick={() => setEditName(m.title)}><Icon name="edit" size={16} /></button>}
                <Bolts n={m.cost} />
              </div>
            );
          })}
          <p class="tiny muted" style={{ padding: '6px 0 12px' }}>Toca el lápiz para poner tu número (por ejemplo, «Leer 30 páginas» o «10,000 pasos»).</p>
        </section>
      )}
      {tpl && (
        <section class="card" aria-label="Tu campaña">
          <span class="eyebrow">Tu campaña</span>
          {tpl.chapters.map((ch, i) => (
            <div class="row" key={ch.title}><span class="tile sm" style={{ background: 'var(--soft)', fontWeight: 800, fontSize: 13 }}>{i + 1}</span><span class="grow strong">{ch.title}</span><span class="small muted">{ch.tasks.length} tareas</span></div>
          ))}
          <div class="row"><span class="tile sm" style={{ background: 'var(--boss)', color: 'var(--xp)' }}><Icon name="sword" size={18} /></span><span class="grow strong">{tpl.boss}</span><span class="small muted">Jefe</span></div>
        </section>
      )}
      <button type="button" class="btn block" disabled={!valid} onClick={submit}>{cta}<Icon name="right" size={20} /></button>
    </>
  );
}

function Radio({ on }) {
  return <span aria-hidden="true" style={{ width: 24, height: 24, flexShrink: 0, boxSizing: 'border-box', borderRadius: 12, border: on ? '7px solid var(--ink)' : '2px solid var(--line-2)', display: 'block' }} />;
}

// Nueva meta desde el Camino (con o sin camino elegido).
export function NewGoal({ query }) {
  const s = useApp();
  const [area, setArea] = useState(query.get('area') || null);
  if (!area) {
    return (
      <main class="screen no-nav">
        <header class="between-c"><button type="button" class="icon-btn" aria-label="Volver" onClick={() => back('/camino')}><Icon name="left" /></button></header>
        <div class="stack-sm"><h1 class="h1">Nueva meta</h1><p class="lead">¿En qué camino?</p></div>
        <div class="stack">
          {AREAS.map((a) => (
            <button key={a.key} type="button" class="card tight" onClick={() => setArea(a.key)} style={{ flexDirection: 'row', alignItems: 'center', textAlign: 'left', color: 'var(--ink)' }}>
              <AreaTile area={a.key} />
              <span class="stack-xs grow"><span class="strong">{a.cls}</span><span class="small muted">{a.attr} · {a.area}</span></span>
              {s.profile.classKeys.includes(a.key) && <span class="chip sm tone-ink">Tu clase</span>}
              <Icon name="right" size={18} />
            </button>
          ))}
        </div>
      </main>
    );
  }
  return (
    <main class="screen no-nav">
      <header class="between-c"><button type="button" class="icon-btn" aria-label="Volver" onClick={() => (query.get('area') ? back('/camino') : setArea(null))}><Icon name="left" /></button></header>
      <GoalForm area={area} onDone={(g) => {
        const c = act((st, today) => startCampaign(st, { area, ...g }, today));
        toast('Nueva campaña en tu camino', 'map');
        go(c ? `/camino?c=${c.id}` : '/camino', { replace: true });
      }} />
    </main>
  );
}
