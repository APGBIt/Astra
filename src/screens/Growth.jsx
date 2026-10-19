// Crecimiento (1.8): lo que quieres dejar de hacer, tus metas con su progreso y lo que quieres lograr en la vida.
import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Nav, TopBar, Sheet, SheetHead, TChip, Bar, Switch, toast, ask, plural, money, areaColor, areaSoft, areaInk, focusOnMount } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { addDays, diffDays, fmtShort, relDay } from '../app/dates.js';
import { go } from '../app/router.js';
import { AREAS, AREA } from '../game/content.js';
import { fxRate, accountLabel } from '../game/logic.js';
import { toNumber } from '../game/parse.js';
import { balances, isCard } from '../game/money.js';
import {
  QUIT_TEMPLATES, QUIT_TRIGGERS, addQuit, updateQuit, removeQuit, quitDays, quitBest, quitTotals, nextMilestone, slipQuit, undoSlip, quitTriggers,
  TARGET_TEMPLATES, addTarget, updateTarget, removeTarget, targetProgress, logTarget, undoTargetLog, claimTargets,
  HORIZONS, DREAM_IDEAS, addDream, updateDream, removeDream, addDreamStep, toggleDreamStep, removeDreamStep, dreamStepToTodo, completeDream, reopenDream,
  growthSummary,
} from '../game/growth.js';

const num = (v) => toNumber(String(v || '').replace(/[^\d.,-]/g, '')) || 0;
const TABS = [['dejar', 'Dejar de hacer'], ['metas', 'Metas'], ['lograr', 'Por lograr']];
const lower = (t) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : '');
const fmtNum = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 100) / 100));
const withUnit = (v, unit) => (unit === 'RD$' ? money(v) : unit === 'US$' ? `US$${fmtNum(v)}` : `${fmtNum(v)}${unit ? ` ${unit}` : ''}`);
const daysText = (n) => (n === 1 ? '1 día' : `${n} días`);

// Valor de una cuenta ligada, en pesos (los dólares con la tasa de hoy).
export function useBalanceOf(s) {
  const today = s.energy.day;
  const bal = s.money ? balances(s) : {};
  const rate = s.money ? fxRate(s, today) : 60;
  return (id) => { const v = bal[id]; return v ? v.DOP + v.USD * rate : null; };
}

function AreaPick({ value, onChange }) {
  return (
    <div class="stack-sm">
      <span class="label">Área de tu vida</span>
      <div class="chips" role="group" aria-label="Área">
        {AREAS.map((a) => <TChip key={a.key} sm on={value === a.key} onClick={() => onChange(a.key)}><span class="dot" style={{ background: areaColor(a.key) }} />{a.area}</TChip>)}
      </div>
    </div>
  );
}

export function Growth({ query }) {
  const s = useApp();
  const today = s.energy.day;
  const [tab, setTab] = useState(() => { const t = query && query.get('ver'); return TABS.some(([k]) => k === t) ? t : 'dejar'; });
  const [sheet, setSheet] = useState(null);
  const balanceOf = useBalanceOf(s);
  // Las metas ligadas a una cuenta avanzan solas con su saldo.
  useEffect(() => { if (s.growth.targets.some((t) => t.link && !t.done)) act((st, t, ev) => claimTargets(st, t, ev, balanceGetter(st))); }, []);
  const pick = (k) => { setTab(k); go(`/metas?ver=${k}`, { replace: true }); };
  return (
    <>
      <main class="screen">
        <TopBar backTo="/aprender" />
        <div class="stack-sm">
          <span class="eyebrow" style={{ color: areaInk('crecimiento') }}>Sabiduría · Crecimiento personal</span>
          <h1 class="h1">Tus metas</h1>
          <span class="small muted">Lo que quieres dejar atrás, lo que estás construyendo y lo que sueñas lograr.</span>
        </div>
        <div class="seg" role="tablist" aria-label="Lista">
          {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k ? 'true' : 'false'} onClick={() => pick(k)}>{l}</button>)}
        </div>
        {tab === 'dejar' && <QuitTab s={s} today={today} setSheet={setSheet} />}
        {tab === 'metas' && <TargetsTab s={s} today={today} setSheet={setSheet} balanceOf={balanceOf} />}
        {tab === 'lograr' && <DreamsTab s={s} today={today} setSheet={setSheet} />}
      </main>
      <Nav active="areas" />
      {sheet && sheet.kind === 'quit' && <QuitSheet id={sheet.id} tpl={sheet.tpl} onClose={() => setSheet(null)} />}
      {sheet && sheet.kind === 'quitView' && <QuitView id={sheet.id} onClose={() => setSheet(null)} onEdit={() => setSheet({ kind: 'quit', id: sheet.id })} onSlip={() => setSheet({ kind: 'slip', id: sheet.id })} />}
      {sheet && sheet.kind === 'slip' && <SlipSheet id={sheet.id} onClose={() => setSheet(null)} />}
      {sheet && sheet.kind === 'target' && <TargetSheet id={sheet.id} tpl={sheet.tpl} onClose={() => setSheet(null)} />}
      {sheet && sheet.kind === 'targetLog' && <TargetLogSheet id={sheet.id} onClose={() => setSheet(null)} onEdit={() => setSheet({ kind: 'target', id: sheet.id })} />}
      {sheet && sheet.kind === 'dream' && <DreamSheet id={sheet.id} tpl={sheet.tpl} onClose={() => setSheet(null)} />}
      {sheet && sheet.kind === 'dreamView' && <DreamView id={sheet.id} onClose={() => setSheet(null)} onEdit={() => setSheet({ kind: 'dream', id: sheet.id })} onDone={() => setSheet({ kind: 'dreamDone', id: sheet.id })} />}
      {sheet && sheet.kind === 'dreamDone' && <DreamDoneSheet id={sheet.id} onClose={() => setSheet(null)} />}
    </>
  );
}

// Lo mismo que useBalanceOf, pero dentro de act (sin hooks).
function balanceGetter(st) {
  const bal = balances(st);
  const rate = fxRate(st, st.energy.day);
  return (id) => { const v = bal[id]; return v ? v.DOP + v.USD * rate : null; };
}

// ---------- Dejar de hacer ----------

function QuitTab({ s, today, setSheet }) {
  const list = s.growth.quit.filter((q) => !q.archived);
  const archived = s.growth.quit.filter((q) => q.archived);
  return (
    <>
      {!list.length && (
        <section class="card" aria-label="Para empezar">
          <h2 class="h2">¿Qué quieres dejar atrás?</h2>
          <span class="small muted">Cuento los días seguidos sin hacerlo, celebro cada hito (1, 3, 7, 14, 21, 30, 60, 90 días…) y, si te cuesta dinero, te digo cuánto vas ahorrando. Si recaes, tu mejor racha y tus días limpios no se borran.</span>
          <div class="chips" role="group" aria-label="Ideas">
            {QUIT_TEMPLATES.map((t) => <TChip key={t.name} sm icon={t.icon} onClick={() => setSheet({ kind: 'quit', tpl: t })}>{t.name}</TChip>)}
          </div>
        </section>
      )}
      {list.map((q) => <QuitCard key={q.id} q={q} today={today} onOpen={() => setSheet({ kind: 'quitView', id: q.id })} onSlip={() => setSheet({ kind: 'slip', id: q.id })} />)}
      <button type="button" class="btn soft block" onClick={() => setSheet({ kind: 'quit' })}><Icon name="plus" size={18} />Algo que quiero dejar</button>
      {archived.length > 0 && (
        <section class="card flush" aria-label="Archivados">
          <div style={{ padding: '14px 0 6px' }}><span class="label">Archivados</span></div>
          {archived.map((q) => <button key={q.id} type="button" class="lrow" style={{ width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--line)', textAlign: 'left', font: 'inherit', color: 'inherit' }} onClick={() => setSheet({ kind: 'quitView', id: q.id })}><span class="grow semi">{q.name}</span><span class="tiny muted semi">mejor racha {daysText(quitBest(q, today))}</span></button>)}
        </section>
      )}
    </>
  );
}

function QuitCard({ q, today, onOpen, onSlip }) {
  const days = quitDays(q, today);
  const next = nextMilestone(days);
  const prev = [0, 1, 3, 7, 14, 21, 30, 60, 90, 180, 365].filter((m) => m <= days).pop() || 0;
  const tot = quitTotals(q, today);
  return (
    <section class="card" aria-label={`${q.name}: ${daysText(days)} sin hacerlo`}>
      <button type="button" class="row" style={{ gap: 14, width: '100%', background: 'none', border: 0, padding: 0, textAlign: 'left', font: 'inherit', color: 'inherit', alignItems: 'center' }} onClick={onOpen}>
        <span class="tile" style={{ background: areaSoft(q.area), color: areaColor(q.area) }}><Icon name={q.icon || 'flag'} /></span>
        <span class="stack-xs grow" style={{ minWidth: 0 }}>
          <span class="strong clamp2" style={{ lineHeight: 1.25 }}>{q.name}</span>
          <span class="tiny muted semi">{AREA[q.area].attr}{tot.saved > 0 ? ` · ahorraste ${money(tot.saved)}` : ''}</span>
        </span>
        <span class="stack-xs" style={{ alignItems: 'flex-end', gap: 0, flexShrink: 0 }}>
          <span class="display-num tab-num" style={{ fontSize: 30, lineHeight: 1 }}>{days}</span>
          <span class="tiny muted semi">{days === 1 ? 'día sin' : 'días sin'}</span>
        </span>
      </button>
      {next && <Bar value={(days - prev) / (next - prev)} color={areaColor(q.area)} label={`${daysText(days)} de ${daysText(next)}`} />}
      <div class="between-c" style={{ gap: 8 }}>
        <span class="tiny muted semi">{next ? `Próximo hito: ${daysText(next)} (${next - days === 1 ? 'mañana' : `en ${daysText(next - days)}`})` : '¡Más de un año!'}{quitBest(q, today) > days ? ` · mejor racha ${daysText(quitBest(q, today))}` : ''}</span>
        <button type="button" class="btn xs ghost" onClick={onSlip}>Recaí</button>
      </div>
    </section>
  );
}

function QuitSheet({ id, tpl, onClose }) {
  const s = useApp();
  const today = s.energy.day;
  const q = id ? s.growth.quit.find((x) => x.id === id) : null;
  const t0 = tpl || {};
  const [name, setName] = useState(q ? q.name : t0.name || '');
  const [area, setArea] = useState(q ? q.area : t0.area || 'crecimiento');
  const [why, setWhy] = useState(q ? q.why : '');
  const [instead, setInstead] = useState(q ? q.instead : '');
  const [since, setSince] = useState(q ? q.since : today);
  const [cost, setCost] = useState(q ? (q.cost ? String(q.cost) : '') : t0.cost ? String(t0.cost) : '');
  const ok = name.trim().length >= 2;
  const save = () => {
    if (!ok) return;
    const p = { name, area, why, instead, cost: num(cost) || 0, icon: q ? q.icon : t0.icon };
    if (q) { act((st) => updateQuit(st, q.id, p)); toast('Guardado', 'check'); } else {
      act((st, t, ev) => { addQuit(st, { ...p, since }, t); });
      toast(since < today ? `Llevas ${daysText(diffDays(since, today))} sin ${lower(name.trim())}` : 'Hoy empieza tu cuenta', 'flag');
    }
    onClose();
  };
  return (
    <Sheet onClose={onClose} label={q ? 'Editar' : 'Algo que quiero dejar'}>
      <SheetHead title={q ? 'Editar' : 'Quiero dejar de…'} onClose={onClose} />
      <div class="field"><label for="qn">¿Qué quieres dejar de hacer?</label><input id="qn" class="input" value={name} maxLength={60} placeholder="Ej. Pedir delivery entre semana" onInput={(e) => setName(e.currentTarget.value)} autoFocus={!q && !tpl} /></div>
      <AreaPick value={area} onChange={setArea} />
      <div class="field"><label for="qw">¿Por qué lo quieres dejar?</label><textarea id="qw" class="input" rows={2} maxLength={300} value={why} placeholder="Te lo recuerdo cuando lo necesites." onInput={(e) => setWhy(e.currentTarget.value)} /></div>
      <div class="field"><label for="qi">¿Qué harás en su lugar?</label><input id="qi" class="input" maxLength={200} value={instead} placeholder="Ej. Tomar agua con limón, caminar 5 minutos" onInput={(e) => setInstead(e.currentTarget.value)} /></div>
      {!q && <div class="field"><label for="qs">¿Desde cuándo no lo haces?</label><input id="qs" type="date" class="input" value={since} max={today} onInput={(e) => setSince(e.currentTarget.value || today)} /></div>}
      <div class="field">
        <label for="qc">¿Cuánto te cuesta al día? (opcional)</label>
        <div class="numrow"><span class="unit">RD$</span><input id="qc" class="input tab-num" inputMode="decimal" value={cost} placeholder="0" onInput={(e) => setCost(e.currentTarget.value)} /></div>
        <span class="small muted">Con esto te digo cuánto vas ahorrando.</span>
      </div>
      <button type="button" class="btn block" disabled={!ok} onClick={save}><Icon name="check" size={20} />{q ? 'Guardar' : 'Empezar a contar'}</button>
    </Sheet>
  );
}

function QuitView({ id, onClose, onEdit, onSlip }) {
  const s = useApp();
  const today = s.energy.day;
  const q = s.growth.quit.find((x) => x.id === id);
  useEffect(() => { if (!q) onClose(); }, [q]);
  if (!q) return null;
  const days = quitDays(q, today);
  const tot = quitTotals(q, today);
  const trig = quitTriggers(q);
  const del = async () => { if (await ask(`¿Borrar «${q.name}» y su historial?`, { ok: 'Borrar', danger: true })) { act((st) => removeQuit(st, q.id)); onClose(); } };
  return (
    <Sheet onClose={onClose} label={q.name}>
      <SheetHead title={q.name} onClose={onClose} />
      <div class="kpis3">
        <div class="stack-xs"><span class="tiny muted semi">Ahora</span><span class="strong tab-num" style={{ fontSize: 20 }}>{daysText(days)}</span></div>
        <div class="stack-xs"><span class="tiny muted semi">Mejor racha</span><span class="strong tab-num" style={{ fontSize: 20 }}>{daysText(quitBest(q, today))}</span></div>
        <div class="stack-xs"><span class="tiny muted semi">{q.cost ? 'Ahorrado' : 'Días limpios'}</span><span class="strong tab-num" style={{ fontSize: 20 }}>{q.cost ? money(tot.saved) : tot.clean}</span></div>
      </div>
      {q.why && <div class="panel stack-xs"><span class="label">Por qué lo dejas</span><span>{q.why}</span></div>}
      {q.instead && <div class="panel stack-xs"><span class="label">En su lugar</span><span>{q.instead}</span></div>}
      <span class="small muted">Empezaste el {fmtShort(q.since)}. {plural(tot.clean, 'día limpio', 'días limpios')} en total{tot.slips ? ` y ${plural(tot.slips, 'recaída', 'recaídas')}` : ''}.</span>
      {trig.length > 0 && <span class="small muted">Lo que más te empuja: {trig.slice(0, 3).map(([k, n]) => `${lower(k)} (${n})`).join(', ')}.</span>}
      {q.slips.length > 0 && (
        <section class="card flush" aria-label="Recaídas">
          <div style={{ padding: '12px 0 4px' }}><span class="label">Recaídas</span></div>
          {q.slips.slice(0, 12).map((x) => (
            <div key={x.id} class="lrow" style={{ minHeight: 48 }}>
              <span class="stack-xs grow"><span class="semi">{relDay(x.day, today)}{x.trigger ? ` · ${x.trigger}` : ''}</span>{x.note && <span class="tiny muted">{x.note}</span>}</span>
              <button type="button" class="btn xs ghost" aria-label={`Quitar la recaída del ${fmtShort(x.day)}`} onClick={() => act((st) => undoSlip(st, q.id, x.id))}><Icon name="undo" size={14} /></button>
            </div>
          ))}
        </section>
      )}
      {!q.archived && <button type="button" class="btn soft block" onClick={onSlip}>Recaí</button>}
      <div class="row wrap" style={{ gap: 8 }}>
        <button type="button" class="btn sm ghost" onClick={onEdit}><Icon name="edit" size={16} />Editar</button>
        <button type="button" class="btn sm ghost" onClick={() => { act((st) => updateQuit(st, q.id, { archived: !q.archived })); toast(q.archived ? 'De vuelta en tu lista' : 'Archivado', 'archive'); onClose(); }}><Icon name="archive" size={16} />{q.archived ? 'Volver a la lista' : 'Archivar'}</button>
        <button type="button" class="btn sm ghost" onClick={del}><Icon name="trash" size={16} />Borrar</button>
      </div>
    </Sheet>
  );
}

function SlipSheet({ id, onClose }) {
  const s = useApp();
  const today = s.energy.day;
  const q = s.growth.quit.find((x) => x.id === id);
  const [day, setDay] = useState(today);
  const [trigger, setTrigger] = useState('');
  const [note, setNote] = useState('');
  if (!q) return null;
  const best = quitBest(q, today);
  const save = () => {
    act((st, t) => slipQuit(st, q.id, { day, trigger, note }, t));
    toast(best > 0 ? `Anotado. Tu mejor racha sigue siendo ${daysText(best)}: vuelve a empezar hoy.` : 'Anotado. Vuelve a empezar hoy.', 'flag');
    onClose();
  };
  const yesterday = addDays(today, -1);
  return (
    <Sheet onClose={onClose} label="Anotar una recaída">
      <SheetHead title="Pasa. Lo importante es seguir" onClose={onClose} />
      <span class="small muted">Anotarlo te ayuda a ver qué lo provoca. Tus días limpios y tu mejor racha se quedan.</span>
      {q.instead && <div class="note tone-good"><Icon name="info" size={18} /><span>La próxima vez, prueba: {q.instead}</span></div>}
      <div class="stack-sm">
        <span class="label">¿Cuándo?</span>
        <div class="chips" role="group" aria-label="Cuándo">
          <TChip sm on={day === today} onClick={() => setDay(today)}>Hoy</TChip>
          {yesterday >= q.since && <TChip sm on={day === yesterday} onClick={() => setDay(yesterday)}>Ayer</TChip>}
        </div>
      </div>
      <div class="stack-sm">
        <span class="label">¿Qué lo provocó?</span>
        <div class="chips" role="group" aria-label="Qué lo provocó">
          {QUIT_TRIGGERS.map((k) => <TChip key={k} sm on={trigger === k} onClick={() => setTrigger(trigger === k ? '' : k)}>{k}</TChip>)}
        </div>
      </div>
      <div class="field"><label for="sn">Nota (opcional)</label><input id="sn" class="input" maxLength={300} value={note} onInput={(e) => setNote(e.currentTarget.value)} /></div>
      <button type="button" class="btn block" onClick={save}><Icon name="check" size={20} />Anotar</button>
    </Sheet>
  );
}

// ---------- Metas con progreso ----------

function TargetsTab({ s, today, setSheet, balanceOf }) {
  const list = s.growth.targets.filter((t) => !t.archived && !t.done);
  const done = s.growth.targets.filter((t) => t.done);
  return (
    <>
      {!list.length && (
        <section class="card" aria-label="Para empezar">
          <h2 class="h2">Una meta que se pueda medir</h2>
          <span class="small muted">Ahorrar, leer, bajar de peso, horas de práctica… Registras lo que avanzas y te digo si vas a tiempo para tu fecha y cuánto te toca por semana. Cada cuarto del camino da XP.</span>
          <div class="chips" role="group" aria-label="Ideas">
            {TARGET_TEMPLATES.map((t) => <TChip key={t.name} sm icon={t.icon} onClick={() => setSheet({ kind: 'target', tpl: t })}>{t.name}</TChip>)}
          </div>
        </section>
      )}
      {list.map((t) => <TargetCard key={t.id} t={t} today={today} balanceOf={balanceOf} onOpen={() => setSheet({ kind: 'targetLog', id: t.id })} />)}
      <button type="button" class="btn soft block" onClick={() => setSheet({ kind: 'target' })}><Icon name="plus" size={18} />Nueva meta</button>
      {done.length > 0 && (
        <section class="card flush" aria-label="Metas cumplidas">
          <div style={{ padding: '14px 0 6px' }}><span class="label">Cumplidas</span></div>
          {done.map((t) => <button key={t.id} type="button" class="lrow" style={{ width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--line)', textAlign: 'left', font: 'inherit', color: 'inherit' }} onClick={() => setSheet({ kind: 'targetLog', id: t.id })}><Icon name="check" size={18} /><span class="grow semi">{t.name}</span><span class="tiny muted semi">{fmtShort(t.done)}</span></button>)}
        </section>
      )}
    </>
  );
}

function statusText(t, pr) {
  if (pr.done) return 'Cumplida';
  if (!t.due) return `Faltan ${withUnit(pr.left, t.unit)}`;
  if (pr.daysLeft === 0) return `Hoy es la fecha · faltan ${withUnit(pr.left, t.unit)}`;
  return `${pr.status === 'atrasada' ? 'Vas atrasado' : 'Vas a tiempo'} · ${withUnit(Math.ceil(pr.perWeek), t.unit)} por semana hasta el ${fmtShort(t.due)}`;
}

function TargetCard({ t, today, balanceOf, onOpen }) {
  const pr = targetProgress(t, today, balanceOf);
  const late = pr.status === 'atrasada';
  return (
    <button type="button" class="card" style={{ width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' }} onClick={onOpen} aria-label={`${t.name}: ${Math.round(pr.pct * 100)} %`}>
      <div class="row" style={{ gap: 14, alignItems: 'center' }}>
        <span class="tile" style={{ background: areaSoft(t.area), color: areaColor(t.area) }}><Icon name={t.icon || 'target'} /></span>
        <span class="stack-xs grow" style={{ minWidth: 0 }}>
          <span class="strong clamp2" style={{ lineHeight: 1.25 }}>{t.name}</span>
          <span class="tiny muted semi tab-num">{withUnit(pr.value, t.unit)} de {withUnit(t.target, t.unit)}{t.link ? ' · con el saldo de tu cuenta' : ''}</span>
        </span>
        <span class="strong tab-num" style={{ fontSize: 20 }}>{Math.round(pr.pct * 100)} %</span>
      </div>
      <span class="pace">
        <Bar value={pr.pct} size="lg" color={areaColor(t.area)} />
        {pr.expected != null && !pr.done && <b style={{ left: `${Math.min(1, pr.expected) * 100}%` }} title="Donde deberías ir a hoy" />}
      </span>
      <span class="tiny semi" style={{ color: late ? 'var(--xp-ink)' : 'var(--muted)' }}>{statusText(t, pr)}</span>
    </button>
  );
}

function TargetSheet({ id, tpl, onClose }) {
  const s = useApp();
  const today = s.energy.day;
  const t = id ? s.growth.targets.find((x) => x.id === id) : null;
  const t0 = tpl || {};
  const [name, setName] = useState(t ? t.name : t0.name || '');
  const [mode, setMode] = useState(t ? t.mode : t0.mode || 'sum');
  const [start, setStart] = useState(t ? String(t.start ?? '') : '');
  const [target, setTarget] = useState(t ? String(t.target) : t0.target ? String(t0.target) : '');
  const [unit, setUnit] = useState(t ? t.unit : t0.unit || '');
  const [due, setDue] = useState(t ? t.due || '' : '');
  const [area, setArea] = useState(t ? t.area : t0.area || 'crecimiento');
  const [link, setLink] = useState(t && t.link ? t.link.id : '');
  const accounts = ((s.money && s.money.accounts) || []).filter((a) => !a.hidden && !isCard(a) && a.kind !== 'debito' && a.kind !== 'efectivo');
  const money_ = unit === 'RD$';
  const ok = name.trim().length >= 2 && num(target) > 0 && (mode === 'sum' || start !== '');
  const save = () => {
    if (!ok) return;
    const p = { name, mode, start: mode === 'sum' ? num(start) || 0 : num(start), target: num(target), unit, due: due || null, area, icon: t ? t.icon : t0.icon, link: link ? { kind: 'account', id: link } : null };
    if (t) act((st, d) => updateTarget(st, t.id, p, d));
    else act((st, d) => addTarget(st, p, d));
    toast(t ? 'Meta guardada' : 'Meta creada', 'target');
    onClose();
  };
  const del = async () => { if (await ask(`¿Borrar la meta «${t.name}» y lo registrado?`, { ok: 'Borrar', danger: true })) { act((st) => removeTarget(st, t.id)); onClose(); } };
  return (
    <Sheet onClose={onClose} label={t ? 'Editar meta' : 'Nueva meta'}>
      <SheetHead title={t ? 'Editar meta' : 'Nueva meta'} onClose={onClose} />
      <div class="field"><label for="tn">Tu meta</label><input id="tn" class="input" value={name} maxLength={60} placeholder="Ej. Ahorrar para el viaje" onInput={(e) => setName(e.currentTarget.value)} autoFocus={!t && !tpl} /></div>
      <div class="seg" role="tablist" aria-label="Cómo se mide">
        {[['sum', 'Voy sumando'], ['value', 'Marco un valor']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={mode === k ? 'true' : 'false'} onClick={() => setMode(k)}>{l}</button>)}
      </div>
      <span class="small muted">{mode === 'sum' ? 'Cada vez que avanzas, sumas lo que hiciste (dinero ahorrado, libros, kilómetros).' : 'Cada vez anotas cómo estás hoy (tu peso, tu marca en 5K).'}</span>
      <div class="map-grid">
        <div class="field"><label for="tst">{mode === 'sum' ? 'Ya llevas' : 'Hoy estás en'}</label><input id="tst" class="input tab-num" inputMode="decimal" value={start} placeholder={mode === 'sum' ? '0' : ''} onInput={(e) => setStart(e.currentTarget.value)} /></div>
        <div class="field"><label for="tt">Meta</label><input id="tt" class="input tab-num" inputMode="decimal" value={target} onInput={(e) => setTarget(e.currentTarget.value)} /></div>
      </div>
      <div class="field">
        <label for="tu">Unidad</label>
        <input id="tu" class="input" maxLength={16} value={unit} placeholder="lb, km, libros…" onInput={(e) => setUnit(e.currentTarget.value)} />
        <div class="chips" role="group" aria-label="Unidades comunes">{['RD$', 'US$', 'libros', 'km', 'lb', 'horas', 'veces'].map((u) => <TChip key={u} sm on={unit === u} onClick={() => setUnit(u)}>{u}</TChip>)}</div>
      </div>
      {money_ && mode === 'sum' && accounts.length > 0 && (
        <div class="stack-sm">
          <span class="label">¿La llevas en una cuenta de ahorro?</span>
          <div class="chips" role="group" aria-label="Cuenta">
            <TChip sm on={!link} onClick={() => setLink('')}>No, la registro yo</TChip>
            {accounts.map((a) => <TChip key={a.id} sm on={link === a.id} onClick={() => setLink(a.id)}>{accountLabel(a)}</TChip>)}
          </div>
          {link && <span class="small muted">El progreso será el saldo de esa cuenta: avanza solo.</span>}
        </div>
      )}
      <div class="field"><label for="td">Fecha límite (opcional)</label><input id="td" type="date" class="input" value={due} min={addDays(today, 1)} onInput={(e) => setDue(e.currentTarget.value)} /></div>
      <AreaPick value={area} onChange={setArea} />
      <button type="button" class="btn block" disabled={!ok} onClick={save}><Icon name="check" size={20} />{t ? 'Guardar' : 'Crear meta'}</button>
      {t && <button type="button" class="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={del}><Icon name="trash" size={16} />Borrar meta</button>}
    </Sheet>
  );
}

function TargetLogSheet({ id, onClose, onEdit }) {
  const s = useApp();
  const today = s.energy.day;
  const t = s.growth.targets.find((x) => x.id === id);
  const balanceOf = useBalanceOf(s);
  const [v, setV] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { if (!t) onClose(); }, [t]);
  if (!t) return null;
  const pr = targetProgress(t, today, balanceOf);
  const add = () => {
    const n = num(v);
    if (!(t.mode === 'sum' ? n !== 0 : v !== '')) return;
    act((st, d, ev) => logTarget(st, t.id, { v: n, note }, d, ev));
    toast(t.mode === 'sum' ? `+${withUnit(n, t.unit)} a «${t.name}»` : `Anotado: ${withUnit(n, t.unit)}`, 'target');
    setV(''); setNote('');
  };
  return (
    <Sheet onClose={onClose} label={t.name}>
      <SheetHead title={t.name} onClose={onClose} />
      <div class="stack-xs">
        <span class="display-num tab-num" style={{ fontSize: 32 }}>{withUnit(pr.value, t.unit)}</span>
        <span class="small muted tab-num">de {withUnit(t.target, t.unit)} · {Math.round(pr.pct * 100)} %{t.due ? ` · fecha: ${fmtShort(t.due)}` : ''}</span>
      </div>
      <span class="pace"><Bar value={pr.pct} size="lg" color={areaColor(t.area)} />{pr.expected != null && !pr.done && <b style={{ left: `${Math.min(1, pr.expected) * 100}%` }} />}</span>
      <span class="small semi" style={{ color: pr.status === 'atrasada' ? 'var(--xp-ink)' : 'var(--muted)' }}>{statusText(t, pr)}</span>
      {t.link ? <div class="note"><Icon name="bank" size={18} /><span>Avanza sola con el saldo de tu cuenta. Para sumar, registra el depósito en Finanzas.</span></div> : !t.done && (
        <div class="panel stack-sm">
          <div class="field">
            <label for="tl">{t.mode === 'sum' ? '¿Cuánto avanzaste?' : '¿Cuánto marcas hoy?'}</label>
            <div class="numrow">{t.unit && <span class="unit">{t.unit}</span>}<input id="tl" class="input tab-num" inputMode="decimal" value={v} onInput={(e) => setV(e.currentTarget.value)} ref={focusOnMount} /></div>
          </div>
          <input class="input" maxLength={200} value={note} placeholder="Nota (opcional)" aria-label="Nota" onInput={(e) => setNote(e.currentTarget.value)} />
          <button type="button" class="btn block" disabled={v === ''} onClick={add}><Icon name="plus" size={20} />{t.mode === 'sum' ? 'Sumar' : 'Anotar'}</button>
        </div>
      )}
      {t.log.length > 0 && (
        <section class="card flush" aria-label="Historial">
          <div style={{ padding: '12px 0 4px' }}><span class="label">Historial</span></div>
          {t.log.slice(0, 15).map((x) => (
            <div key={x.id} class="lrow" style={{ minHeight: 48 }}>
              <span class="stack-xs grow"><span class="semi tab-num">{t.mode === 'sum' && x.v > 0 ? '+' : ''}{withUnit(x.v, t.unit)}</span><span class="tiny muted">{relDay(x.day, today)}{x.note ? ` · ${x.note}` : ''}</span></span>
              <button type="button" class="btn xs ghost" aria-label="Quitar este registro" onClick={() => act((st) => undoTargetLog(st, t.id, x.id))}><Icon name="undo" size={14} /></button>
            </div>
          ))}
        </section>
      )}
      <div class="row wrap" style={{ gap: 8 }}>
        <button type="button" class="btn sm ghost" onClick={onEdit}><Icon name="edit" size={16} />Editar meta</button>
        {!t.done && <button type="button" class="btn sm ghost" onClick={() => { act((st) => updateTarget(st, t.id, { archived: !t.archived })); toast('Archivada', 'archive'); onClose(); }}><Icon name="archive" size={16} />Archivar</button>}
      </div>
    </Sheet>
  );
}

// ---------- Por lograr ----------

function DreamsTab({ s, today, setSheet }) {
  const open = s.growth.dreams.filter((d) => !d.done);
  const done = s.growth.dreams.filter((d) => d.done);
  return (
    <>
      {!open.length && (
        <section class="card" aria-label="Para empezar">
          <h2 class="h2">Lo que quieres vivir</h2>
          <span class="small muted">Tu lista de cosas por lograr: viajes, retos, estudios, tu casa. Divídelas en pasos pequeños, pasa el primero a tus pendientes y, cuando lo logres, guárdalo en tus logros.</span>
          <div class="chips" role="group" aria-label="Ideas">
            {DREAM_IDEAS.map((t) => <TChip key={t.title} sm icon={t.icon} onClick={() => setSheet({ kind: 'dream', tpl: t })}>{t.title}</TChip>)}
          </div>
        </section>
      )}
      {HORIZONS.map((h) => {
        const list = open.filter((d) => d.horizon === h.key);
        if (!list.length) return null;
        return (
          <section key={h.key} class="card flush" aria-label={h.label}>
            <div style={{ padding: '14px 0 4px' }}><span class="label">{h.label}</span></div>
            {list.map((d) => {
              const stepsDone = d.steps.filter((x) => x.done).length;
              return (
                <button key={d.id} type="button" class="lrow" style={{ width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--line)', textAlign: 'left', font: 'inherit', color: 'inherit', minHeight: 64, gap: 12 }} onClick={() => setSheet({ kind: 'dreamView', id: d.id })}>
                  <span class="tile sm" style={{ background: areaSoft(d.area), color: areaColor(d.area) }}><Icon name={d.icon || 'star'} size={18} /></span>
                  <span class="stack-xs grow" style={{ minWidth: 0 }}>
                    <span class="strong clamp2" style={{ lineHeight: 1.25 }}>{d.title}</span>
                    <span class="tiny muted semi">{d.steps.length ? `${stepsDone} de ${plural(d.steps.length, 'paso', 'pasos')}` : 'Sin pasos todavía'}{d.due ? ` · para el ${fmtShort(d.due)}` : ''}</span>
                  </span>
                  {d.steps.length > 0 && <span style={{ width: 44 }}><Bar value={stepsDone / d.steps.length} color={areaColor(d.area)} /></span>}
                </button>
              );
            })}
          </section>
        );
      })}
      <button type="button" class="btn soft block" onClick={() => setSheet({ kind: 'dream' })}><Icon name="plus" size={18} />Algo que quiero lograr</button>
      {done.length > 0 && (
        <section class="card flush" aria-label="Logrado">
          <div style={{ padding: '14px 0 6px' }}><span class="label">Logrado · {done.length}</span></div>
          {done.map((d) => <button key={d.id} type="button" class="lrow" style={{ width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--line)', textAlign: 'left', font: 'inherit', color: 'inherit' }} onClick={() => setSheet({ kind: 'dreamView', id: d.id })}><Icon name="star" size={18} /><span class="grow semi">{d.title}</span><span class="tiny muted semi">{fmtShort(d.done)}</span></button>)}
        </section>
      )}
    </>
  );
}

function DreamSheet({ id, tpl, onClose }) {
  const s = useApp();
  const d = id ? s.growth.dreams.find((x) => x.id === id) : null;
  const t0 = tpl || {};
  const [title, setTitle] = useState(d ? d.title : t0.title || '');
  const [area, setArea] = useState(d ? d.area : t0.area || 'crecimiento');
  const [horizon, setHorizon] = useState(d ? d.horizon : 'pronto');
  const [due, setDue] = useState(d ? d.due || '' : '');
  const [why, setWhy] = useState(d ? d.why : '');
  const [first, setFirst] = useState('');
  const ok = title.trim().length >= 2;
  const save = () => {
    if (!ok) return;
    const p = { title, area, horizon, due: due || null, why, icon: d ? d.icon : t0.icon };
    if (d) act((st) => updateDream(st, d.id, p));
    else act((st, t) => addDream(st, { ...p, steps: first.trim() ? [first] : [] }, t));
    toast(d ? 'Guardado' : 'A tu lista', 'star');
    onClose();
  };
  const del = async () => { if (await ask(`¿Borrar «${d.title}» de tu lista?`, { ok: 'Borrar', danger: true })) { act((st) => removeDream(st, d.id)); onClose(); } };
  return (
    <Sheet onClose={onClose} label={d ? 'Editar' : 'Algo que quiero lograr'}>
      <SheetHead title={d ? 'Editar' : 'Quiero lograr…'} onClose={onClose} />
      <div class="field"><label for="dt">¿Qué quieres lograr?</label><input id="dt" class="input" value={title} maxLength={100} placeholder="Ej. Conocer Japón" onInput={(e) => setTitle(e.currentTarget.value)} autoFocus={!d && !tpl} /></div>
      <div class="stack-sm">
        <span class="label">¿Para cuándo?</span>
        <div class="chips" role="group" aria-label="Para cuándo">{HORIZONS.map((h) => <TChip key={h.key} sm on={horizon === h.key} onClick={() => setHorizon(h.key)}>{h.label}</TChip>)}</div>
      </div>
      <div class="field"><label for="dd">Fecha (opcional)</label><input id="dd" type="date" class="input" value={due} onInput={(e) => setDue(e.currentTarget.value)} /></div>
      <AreaPick value={area} onChange={setArea} />
      <div class="field"><label for="dw">¿Por qué es importante para ti?</label><textarea id="dw" class="input" rows={2} maxLength={300} value={why} onInput={(e) => setWhy(e.currentTarget.value)} /></div>
      {!d && <div class="field"><label for="df">Primer paso (opcional)</label><input id="df" class="input" maxLength={120} value={first} placeholder="Ej. Averiguar cuánto cuesta el pasaje" onInput={(e) => setFirst(e.currentTarget.value)} /></div>}
      <button type="button" class="btn block" disabled={!ok} onClick={save}><Icon name="check" size={20} />{d ? 'Guardar' : 'Agregar a mi lista'}</button>
      {d && <button type="button" class="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={del}><Icon name="trash" size={16} />Borrar</button>}
    </Sheet>
  );
}

function DreamView({ id, onClose, onEdit, onDone }) {
  const s = useApp();
  const today = s.energy.day;
  const d = s.growth.dreams.find((x) => x.id === id);
  const [step, setStep] = useState('');
  useEffect(() => { if (!d) onClose(); }, [d]);
  if (!d) return null;
  const addStep = () => { if (!step.trim()) return; act((st) => addDreamStep(st, d.id, step)); setStep(''); };
  return (
    <Sheet onClose={onClose} label={d.title}>
      <SheetHead title={d.title} onClose={onClose} />
      <span class="small muted">{(HORIZONS.find((h) => h.key === d.horizon) || {}).label}{d.due ? ` · para el ${fmtShort(d.due)}` : ''} · {AREA[d.area].area}{d.done ? ` · logrado el ${fmtShort(d.done)}` : ''}</span>
      {d.why && <div class="panel stack-xs"><span class="label">Por qué</span><span>{d.why}</span></div>}
      {d.done && d.note && <div class="panel stack-xs"><span class="label">Cómo fue</span><span>{d.note}</span></div>}
      <section class="card flush" aria-label="Pasos">
        <div style={{ padding: '12px 0 4px' }}><span class="label">Pasos</span></div>
        {!d.steps.length && <span class="small muted" style={{ padding: '4px 0 10px' }}>Divídelo en pasos pequeños: el primero debería caber en una semana.</span>}
        {d.steps.map((x) => (
          <div key={x.id} class="lrow" style={{ minHeight: 52, gap: 10 }}>
            <label class="check" style={{ margin: '-8px -4px -8px -8px' }}>
              <input type="checkbox" class="sr-only" checked={!!x.done} onChange={() => act((st, t, ev) => toggleDreamStep(st, d.id, x.id, t, ev))} aria-label={`${x.done ? 'Desmarcar' : 'Marcar'} ${x.text}`} />
              <span aria-hidden="true" style={x.done ? { background: 'var(--ink)', borderColor: 'var(--ink)', color: 'var(--on-ink)' } : null}>{x.done && <Icon name="check" size={16} stroke={2.8} />}</span>
            </label>
            <span class="grow semi" style={{ textDecoration: x.done ? 'line-through' : 'none', color: x.done ? 'var(--muted)' : 'var(--ink)' }}>{x.text}</span>
            {!x.done && <button type="button" class="btn xs ghost" aria-label={`Pasar «${x.text}» a pendientes`} onClick={() => { act((st, t) => dreamStepToTodo(st, d.id, x.id, t)); toast('Pasó a tus pendientes', 'list'); }}><Icon name="list" size={14} /></button>}
            <button type="button" class="btn xs ghost" aria-label={`Quitar ${x.text}`} onClick={() => act((st) => removeDreamStep(st, d.id, x.id))}><Icon name="close" size={14} /></button>
          </div>
        ))}
        <div class="row" style={{ gap: 8, padding: '10px 0 14px' }}>
          <input class="input grow" maxLength={120} value={step} placeholder="Nuevo paso" aria-label="Nuevo paso" onInput={(e) => setStep(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') addStep(); }} />
          <button type="button" class="btn sm" disabled={!step.trim()} onClick={addStep}><Icon name="plus" size={18} />Agregar</button>
        </div>
      </section>
      {!d.done
        ? <button type="button" class="btn block" onClick={onDone}><Icon name="star" size={20} />¡Lo logré!</button>
        : <button type="button" class="btn soft block" onClick={() => { act((st) => reopenDream(st, d.id)); toast('De vuelta en tu lista', 'star'); }}>Volver a la lista</button>}
      <button type="button" class="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={onEdit}><Icon name="edit" size={16} />Editar</button>
    </Sheet>
  );
}

function DreamDoneSheet({ id, onClose }) {
  const s = useApp();
  const d = s.growth.dreams.find((x) => x.id === id);
  const [note, setNote] = useState('');
  const [asWin, setAsWin] = useState(true);
  if (!d) return null;
  const save = () => { act((st, t, ev) => completeDream(st, d.id, { note, asWin }, t, ev)); onClose(); };
  return (
    <Sheet onClose={onClose} label="Lo logré">
      <SheetHead title={`¡${d.title}!`} onClose={onClose} />
      <div class="field"><label for="dn">¿Cómo fue? (opcional)</label><textarea id="dn" class="input" rows={3} maxLength={300} value={note} onInput={(e) => setNote(e.currentTarget.value)} ref={focusOnMount} /></div>
      <label class="between-c panel" style={{ cursor: 'pointer' }}>
        <span class="stack-xs"><span class="semi">Guardarlo en mis logros</span><span class="small muted">Queda en tu lista de logros, con lo que escribiste.</span></span>
        <Switch checked={asWin} onChange={setAsWin} label="Guardarlo en mis logros" />
      </label>
      <button type="button" class="btn block" onClick={save}><Icon name="star" size={20} />Lo logré · +80 XP</button>
    </Sheet>
  );
}

// ---------- Tarjeta para la pantalla de Crecimiento ----------

export function GrowthCard({ s, today }) {
  const balanceOf = useBalanceOf(s);
  const sum = growthSummary(s, today, balanceOf);
  const Row = ({ ver, icon, title, sub }) => (
    <a href={`#/metas?ver=${ver}`} class="lrow" style={{ textDecoration: 'none', color: 'inherit', gap: 12, minHeight: 60 }}>
      <span class="tile sm" style={{ background: areaSoft('crecimiento'), color: areaColor('crecimiento') }}><Icon name={icon} size={18} /></span>
      <span class="stack-xs grow" style={{ minWidth: 0 }}><span class="strong">{title}</span><span class="tiny muted semi">{sub}</span></span>
      <Icon name="right" size={18} />
    </a>
  );
  return (
    <section class="card flush" aria-label="Tus metas">
      <div class="between-c" style={{ padding: '14px 0 2px' }}><h2 class="h2">Tus metas</h2></div>
      <Row ver="dejar" icon="flag" title="Dejar de hacer" sub={sum.best ? `${sum.quit} en tu lista · ${daysText(sum.best.days)} sin ${lower(sum.best.q.name)}` : 'Malos hábitos que quieres soltar, con días seguidos sin ellos'} />
      <Row ver="metas" icon="target" title="Metas y progreso" sub={sum.targets ? `${plural(sum.targets, 'meta activa', 'metas activas')}${sum.behind.length ? ` · ${sum.behind.length} atrasada${sum.behind.length > 1 ? 's' : ''}` : ''}${sum.targetsDone ? ` · ${sum.targetsDone} cumplida${sum.targetsDone > 1 ? 's' : ''}` : ''}` : 'Ahorro, lectura, peso, horas de práctica…'} />
      <Row ver="lograr" icon="star" title="Por lograr" sub={sum.dreams || sum.dreamsDone ? `${plural(sum.dreams, 'pendiente', 'pendientes')}${sum.dreamsDone ? ` · ${sum.dreamsDone} logrado${sum.dreamsDone > 1 ? 's' : ''}` : ''}` : 'Viajes, retos y sueños, paso a paso'} />
    </section>
  );
}
