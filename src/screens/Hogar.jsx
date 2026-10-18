import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Nav, TopBar, Sheet, SheetHead, TChip, Switch, NumberChips, toast, ask, plural, areaColor, areaSoft, areaInk, dueLabel, Bar } from '../ui/kit.jsx';
import { AttrPicker, doneText } from './Todos.jsx';
import { act, useApp } from '../app/store.js';
import { addDays, diffDays, fmtShort, relDay, weekday, DAYS, DAYS_SHORT } from '../app/dates.js';
import { AREA, CHORE_GROUPS, CHORE_FREQS, CHORE_TEMPLATES, CHORE_ICONS, CHORE_XP, TODO_HOGAR } from '../game/content.js';
import {
  addChore, addChores, updateChore, removeChore, skipChore, choreStatus, choreWeek, houseSummary, freqLabel, freqDays,
  normFreq, choreXP, choreNext, completeTodo, uncompleteTodo,
} from '../game/logic.js';

// Tareas personales que se repiten: lavar, planchar, limpiar… Cada rutina tiene su frecuencia y vuelve sola.

const H = 'hogar';
export const fmtMins = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${Math.round(m)} min`);
const attrName = (a) => (a && AREA[a] ? AREA[a].attr : 'tu nivel');
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : '');
const WEEK = [1, 2, 3, 4, 5, 6, 0];

// «mañana», «el sábado», «el 3 nov».
function whenNext(due, today) {
  const n = diffDays(today, due);
  if (n <= 0) return 'hoy';
  if (n === 1) return 'mañana';
  return n < 7 ? `el ${DAYS[weekday(due)]}` : `el ${fmtShort(due)}`;
}

function stateText(r, today) {
  if (r.state === 'paused') return 'En pausa';
  if (r.state === 'late') return r.inDays === -1 ? 'Tocaba ayer' : `Atrasada ${-r.inDays} días`;
  if (r.state === 'today') return 'Hoy';
  return dueLabel(r.due, today);
}

// ---------- Pantalla Hogar ----------

export function Hogar({ query }) {
  const s = useApp();
  const today = s.energy.day;
  const [sheet, setSheet] = useState(() => { const r = query && query.get('r'); return r ? { id: r } : null; });
  const [day, setDay] = useState(0);
  const [showPaused, setShowPaused] = useState(false);
  const chores = s.chores || [];
  const open = (c) => setSheet({ id: c.id });
  const sheetEl = sheet && <ChoreSheet id={sheet.id || null} onClose={() => setSheet(null)} />;

  if (!chores.length) {
    return (
      <>
        <Setup onCustom={() => setSheet({ id: null })} />
        {sheetEl}
      </>
    );
  }

  const rows = chores.map((c) => ({ c, ...choreStatus(s, c, today) }));
  const active = rows.filter((r) => r.state !== 'paused');
  const now = active.filter((r) => r.state === 'late' || r.state === 'today').sort((a, b) => a.inDays - b.inDays);
  const doneNow = active.filter((r) => r.last === today && r.state !== 'late' && r.state !== 'today');
  const later = active.filter((r) => (r.state === 'soon' || r.state === 'ok') && r.last !== today).sort((a, b) => a.inDays - b.inDays || a.c.title.localeCompare(b.c.title));
  const paused = rows.filter((r) => r.state === 'paused');
  const sum = houseSummary(s, today);
  const week = choreWeek(s, today);
  const maxMins = Math.max(30, ...week.map((d) => d.mins));
  const sel = week[day] || week[0];
  const weekMins = week.reduce((a, d) => a + d.mins, 0);

  return (
    <>
      <main class="screen">
        <TopBar backTo="/areas" right={<button type="button" class="icon-btn" aria-label="Nueva rutina" onClick={() => setSheet({ id: null })}><Icon name="plus" /></button>} />
        <section class="stack-sm" aria-label="Resumen">
          <span class="eyebrow" style={{ color: areaInk(H) }}>Hogar</span>
          <h1 class="h1">{sum.due ? `${plural(sum.due, 'tarea toca', 'tareas tocan')} hoy` : 'Todo al día en casa'}</h1>
          <p class="lead">
            {sum.due ? `Unos ${fmtMins(sum.mins)} en total.${sum.late ? ` ${sum.late === 1 ? 'Una está atrasada' : `${sum.late} están atrasadas`}: empieza por ahí.` : ''}` : doneNow.length ? `Hoy hiciste ${plural(doneNow.length, 'tarea', 'tareas')}. Lo próximo toca ${later[0] ? whenNext(later[0].due, today) : 'más adelante'}.` : 'Nada pendiente por hoy. Lo próximo aparece aquí cuando toque.'}
          </p>
        </section>
        <div class="kpis">
          <div class="kpi"><span class="v">{sum.doneWeek}</span><span class="l">Hechas en 7 días</span></div>
          <div class="kpi"><span class="v">{sum.total}</span><span class="l">Rutinas activas</span></div>
          <div class="kpi"><span class="v">{weekMins >= 60 ? `${Math.floor(weekMins / 60)} h${Math.round(weekMins % 60) ? ` ${Math.round(weekMins % 60)}` : ''}` : `${Math.round(weekMins)} min`}</span><span class="l">Próximos 7 días</span></div>
        </div>

        {(now.length > 0 || doneNow.length > 0) && (
          <section class="stack-xs" aria-label="Para hoy">
            <h2 class="eyebrow">Para hoy</h2>
            <div>
              {now.map((r) => <ChoreRow key={r.c.id} s={s} r={r} today={today} onOpen={open} />)}
              {doneNow.map((r) => <ChoreRow key={r.c.id} s={s} r={r} today={today} onOpen={open} />)}
            </div>
          </section>
        )}

        <section class="card" aria-label="Tu semana">
          <div class="between-c"><h2 class="h2">Tu semana</h2><span class="small muted semi">si las haces a tiempo</span></div>
          <div class="week-plan" role="tablist" aria-label="Días de la semana">
            {week.map((d, i) => (
              <button key={d.day} type="button" role="tab" aria-selected={i === day ? 'true' : 'false'} onClick={() => setDay(i)}
                aria-label={`${i === 0 ? 'Hoy' : cap(DAYS[weekday(d.day)])}: ${d.items.length ? `${plural(d.items.length, 'tarea', 'tareas')}, ${fmtMins(d.mins)}` : 'libre'}`}>
                <span class="tiny strong">{d.items.length || ''}</span>
                <span class={`wbar${d.mins ? '' : ' none'}`} style={{ height: `${d.mins ? Math.max(8, Math.round((d.mins / maxMins) * 64)) : 4}px` }} />
                <span class="tiny muted semi">{i === 0 ? 'Hoy' : DAYS_SHORT[weekday(d.day)]}</span>
              </button>
            ))}
          </div>
          <div class="stack-xs">
            <span class="small strong">{day === 0 ? 'Hoy' : `${cap(DAYS[weekday(sel.day)])} ${fmtShort(sel.day)}`} · {sel.items.length ? fmtMins(sel.mins) : 'día libre'}</span>
            {sel.items.map((c) => (
              <button key={c.id} type="button" class="lrow" style={{ minHeight: 48, padding: '8px 0' }} onClick={() => open(c)}>
                <span style={{ color: areaColor(H), display: 'flex' }}><Icon name={c.icon || 'home'} size={18} /></span>
                <span class="grow semi">{c.title}</span>
                <span class="tiny muted">{fmtMins(c.mins)}</span>
              </button>
            ))}
          </div>
        </section>

        {later.length > 0 && (
          <section class="stack-xs" aria-label="Próximas">
            <h2 class="eyebrow">Próximas</h2>
            <div>{later.map((r) => <ChoreRow key={r.c.id} s={s} r={r} today={today} onOpen={open} />)}</div>
          </section>
        )}

        {paused.length > 0 && (
          <section class="card flush" aria-label="En pausa">
            <button type="button" class="lrow" style={{ minHeight: 56 }} aria-expanded={showPaused ? 'true' : 'false'} onClick={() => setShowPaused(!showPaused)}>
              <span class="grow h2" style={{ fontSize: 17 }}>En pausa · {paused.length}</span><Icon name={showPaused ? 'down' : 'right'} size={18} />
            </button>
            {showPaused && paused.map((r) => (
              <button key={r.c.id} type="button" class="lrow" onClick={() => open(r.c)}>
                <span style={{ color: 'var(--faint)', display: 'flex' }}><Icon name={r.c.icon || 'home'} size={18} /></span>
                <span class="stack-xs grow"><span class="semi">{r.c.title}</span><span class="tiny muted">{freqLabel(r.c.freq)} · {fmtMins(r.c.mins)}</span></span>
                <Icon name="right" size={16} />
              </button>
            ))}
          </section>
        )}

        <p class="small muted" style={{ textAlign: 'center', padding: '0 12px' }}>
          Cada tarea da +{CHORE_XP.base} XP, +{CHORE_XP.per10} por cada 10 minutos (hasta +{CHORE_XP.max}) y +{CHORE_XP.gold} de oro. Sube {AREA[TODO_HOGAR.area].attr} o el atributo que elijas. También aparecen en Hoy y en Pendientes.
        </p>
      </main>
      <Nav active="areas" fab={{ onClick: () => setSheet({ id: null }), label: 'Nueva rutina' }} />
      {sheetEl}
    </>
  );
}

function ChoreRow({ s, r, today, onOpen }) {
  const { c, todo, state } = r;
  const doneNow = r.last === today && state !== 'late' && state !== 'today';
  const toggle = () => {
    if (doneNow) {
      const done = s.todos.filter((x) => x.chore === c.id && x.done === today);
      const t = done.find((x) => todo && x.spawned === todo.id) || done[0];
      if (t) { act((st) => uncompleteTodo(st, t.id)); toast('Desmarcada', 'undo'); }
      return;
    }
    if (!todo) return;
    const res = act((st, d, ev) => completeTodo(st, todo.id, d, ev));
    if (res) toast(doneText(res), 'check');
  };
  return (
    <div class={`mrow todo chore${doneNow ? ' done' : ''}`}>
      <button type="button" class="check" aria-pressed={doneNow ? 'true' : 'false'} aria-label={doneNow ? `Desmarcar ${c.title}` : `Hecha: ${c.title}`} onClick={toggle}>
        <span style={doneNow ? null : { borderColor: areaColor(H) }}>{doneNow && <Icon name="check" size={16} stroke={2.8} />}</span>
      </button>
      <button type="button" class="body" onClick={() => onOpen(c)}>
        <span class="title">{c.title}</span>
        <span class="meta">
          <span class={state === 'late' ? 'late' : state === 'today' ? 'soon' : ''}>{doneNow ? `Hecha hoy · vuelve ${whenNext(r.due, today)}` : stateText(r, today)}</span>
          <span>· {freqLabel(c.freq).toLowerCase()}</span>
          <span>· {fmtMins(c.mins)}</span>
        </span>
      </button>
      <span class="tile sm" style={{ background: areaSoft(H), color: areaColor(H) }}><Icon name={c.icon || 'home'} size={18} /></span>
    </div>
  );
}

// ---------- Primera vez: elegir las rutinas ----------

function Setup({ onCustom }) {
  const [sel, setSel] = useState(() => new Set(CHORE_TEMPLATES.filter((t) => t.pick).map((t) => t.title)));
  const toggle = (t) => { const n = new Set(sel); if (n.has(t.title)) n.delete(t.title); else n.add(t.title); setSel(n); };
  const picked = CHORE_TEMPLATES.filter((t) => sel.has(t.title));
  const weekly = picked.reduce((a, t) => a + (t.mins * 7) / freqDays(t.freq), 0);
  const create = () => {
    const n = act((st, d) => addChores(st, picked.map((t) => ({ title: t.title, group: t.group, icon: t.icon, freq: t.freq, mins: t.mins, attr: t.attr })), d).length);
    toast(`${plural(n, 'rutina creada', 'rutinas creadas')}, repartidas en la semana`, 'home');
  };
  return (
    <>
      <main class="screen" style={{ paddingBottom: 140 }}>
        <TopBar backTo="/areas" />
        <section class="stack-sm">
          <span class="eyebrow" style={{ color: areaInk(H) }}>Hogar</span>
          <h1 class="h1">Tu casa, en modo misión</h1>
          <p class="lead">Marca las tareas que haces en casa. Cada una vuelve sola según su frecuencia y te da XP y oro al hacerla.</p>
        </section>
        {CHORE_GROUPS.map((g) => {
          const ts = CHORE_TEMPLATES.filter((t) => t.group === g.id);
          return (
            <section class="stack-sm" key={g.id} aria-label={g.name}>
              <h2 class="eyebrow">{g.name}</h2>
              {ts.map((t) => (
                <button key={t.title} type="button" class="routine-row hogar" aria-pressed={sel.has(t.title) ? 'true' : 'false'} onClick={() => toggle(t)}>
                  <span class="box">{sel.has(t.title) && <Icon name="check" size={16} stroke={3} />}</span>
                  <span class="stack-xs grow" style={{ textAlign: 'left' }}><span class="semi">{t.title}</span><span class="tiny muted semi">{freqLabel(t.freq)} · {fmtMins(t.mins)}</span></span>
                  <Icon name={t.icon} size={18} />
                </button>
              ))}
            </section>
          );
        })}
        <div class="note"><Icon name="info" size={18} /><span>Las reparto en la semana para que no se te junten. Después puedes cambiar la frecuencia, los días fijos y los minutos de cada una.</span></div>
        <button type="button" class="link-btn" style={{ alignSelf: 'center' }} onClick={onCustom}><Icon name="plus" size={16} />Crear una rutina propia</button>
      </main>
      <div class="cta-bar">
        <button type="button" class="btn block" disabled={!picked.length} onClick={create}>
          <Icon name="check" size={20} />{picked.length ? `Crear ${plural(picked.length, 'rutina', 'rutinas')} · ${fmtMins(Math.round(weekly / 5) * 5)} a la semana` : 'Marca al menos una'}
        </button>
      </div>
    </>
  );
}

// ---------- Hoja: nueva rutina o editar ----------

export function ChoreSheet({ id, onClose }) {
  const s = useApp();
  const today = s.energy.day;
  const c = id ? (s.chores || []).find((x) => x.id === id) : null;
  useEffect(() => { if (id && !c) onClose(); }, [c]);
  const f0 = c ? normFreq(c.freq) : { type: 'every', n: 1, unit: 'week' };
  const [title, setTitle] = useState(c ? c.title : '');
  const [icon, setIcon] = useState(c ? c.icon || 'home' : 'home');
  const [group, setGroup] = useState(c ? c.group || 'casa' : 'casa');
  const [ftype, setFtype] = useState(f0.type);
  const [n, setN] = useState(f0.type === 'every' ? f0.n : 1);
  const [nTxt, setNTxt] = useState(String(f0.type === 'every' ? f0.n : 1));
  const [unit, setUnit] = useState(f0.type === 'every' ? f0.unit : 'week');
  const [days, setDays] = useState(f0.type === 'weekdays' ? f0.days : [6]);
  const [mins, setMins] = useState(c ? c.mins : 30);
  const [attr, setAttr] = useState(c ? (c.attr === undefined ? TODO_HOGAR.area : c.attr) : TODO_HOGAR.area);
  const [note, setNote] = useState(c ? c.note || '' : '');
  const [start, setStart] = useState(today);
  const [next, setNext] = useState(undefined);
  if (id && !c) return null;
  const st = c ? choreStatus(s, c, today) : null;
  const freq = normFreq(ftype === 'weekdays' ? { type: 'weekdays', days } : { type: 'every', n, unit });
  const freqChanged = c && JSON.stringify(freq) !== JSON.stringify(normFreq(c.freq));
  // Próxima vez: la que elijas, o la que sale de la frecuencia.
  const preview = c
    ? (next !== undefined ? next : freqChanged ? choreNext({ ...c, freq, nextOverride: null, start: freq.type === 'weekdays' && !c.base ? today : c.start }, today) : st.due)
    : choreNext({ freq, start }, today);
  const presetOn = (p) => ftype === 'every' && n === p.freq.n && unit === p.freq.unit;
  const custom = ftype === 'every' && !CHORE_FREQS.some(presetOn);
  const templates = !c && !title.trim() ? CHORE_TEMPLATES.filter((t) => !(s.chores || []).some((x) => x.title === t.title)).slice(0, 8) : [];
  const useTemplate = (t) => {
    setTitle(t.title); setIcon(t.icon); setGroup(t.group); setMins(t.mins);
    const q = normFreq(t.freq);
    setFtype(q.type);
    if (q.type === 'every') { setN(q.n); setNTxt(String(q.n)); setUnit(q.unit); }
    if (t.attr !== undefined) setAttr(t.attr);
  };
  const setNum = (raw) => { setNTxt(raw); const v = Math.round(Number(String(raw).replace(/[^\d]/g, ''))); if (v >= 1 && v <= 365) setN(v); };
  const toggleDay = (d) => setDays(days.includes(d) ? (days.length > 1 ? days.filter((x) => x !== d) : days) : [...days, d]);
  const save = () => {
    const t = title.trim();
    if (!t) return;
    if (c) {
      const patch = { title: t, icon, group, mins, attr, note };
      if (freqChanged) patch.freq = freq;
      if (next !== undefined && next !== st.due) patch.next = next;
      act((x, d) => updateChore(x, c.id, patch, d));
      toast('Rutina guardada', 'home');
    } else {
      act((x, d) => addChore(x, { title: t, icon, group, freq, mins, attr, note, start }, d));
      toast(`Rutina creada · ${freqLabel(freq).toLowerCase()}`, 'home');
    }
    onClose();
  };
  const doneToday = () => {
    if (!st || !st.todo) return;
    const r = act((x, d, ev) => completeTodo(x, st.todo.id, d, ev));
    if (r) toast(doneText(r), 'check');
    onClose();
  };
  const skip = () => {
    const d = act((x, day) => skipChore(x, c.id, day));
    if (d) toast(`Saltada esta vez · vuelve ${whenNext(d, today)}`, 'skip');
    onClose();
  };
  const log = c ? c.log || [] : [];
  return (
    <Sheet onClose={onClose} label={c ? c.title : 'Nueva rutina'}>
      <SheetHead title={c ? 'Rutina del hogar' : 'Nueva rutina'} onClose={onClose} />
      <div class="field">
        <label for="ct">¿Qué tarea es?</label>
        <input id="ct" class="input big" value={title} maxLength={80} placeholder="Ej. Lavar la ropa" onInput={(e) => setTitle(e.currentTarget.value)} autoFocus={!c} />
      </div>
      {templates.length > 0 && (
        <div class="chips" role="group" aria-label="Ideas">
          {templates.map((t) => <TChip key={t.title} sm icon={t.icon} onClick={() => useTemplate(t)}>{t.title}</TChip>)}
        </div>
      )}

      <div class="stack-sm">
        <span class="label">¿Cada cuánto?</span>
        <div class="seg" role="tablist" aria-label="Tipo de frecuencia">
          <button type="button" role="tab" aria-selected={ftype === 'every' ? 'true' : 'false'} onClick={() => setFtype('every')}><Icon name="repeat" size={16} />Cada cierto tiempo</button>
          <button type="button" role="tab" aria-selected={ftype === 'weekdays' ? 'true' : 'false'} onClick={() => setFtype('weekdays')}><Icon name="calendar" size={16} />Días fijos</button>
        </div>
        {ftype === 'every' ? (
          <>
            <div class="chips" role="group" aria-label="Frecuencia">
              {CHORE_FREQS.map((p) => <TChip key={p.key} sm on={presetOn(p)} onClick={() => { setN(p.freq.n); setNTxt(String(p.freq.n)); setUnit(p.freq.unit); }}>{p.label}</TChip>)}
            </div>
            <div class="row wrap" style={{ gap: 8 }}>
              <span class="small semi">{custom ? 'Tu frecuencia:' : 'Otra:'} cada</span>
              <input class="input" inputMode="numeric" aria-label="Cada cuántos" value={nTxt} onInput={(e) => setNum(e.currentTarget.value)} style={{ width: 72, minHeight: 44, textAlign: 'center' }} />
              <div class="chips" role="group" aria-label="Unidad">
                {[['day', 'días'], ['week', 'semanas'], ['month', 'meses']].map(([u, l]) => <TChip key={u} sm on={unit === u} onClick={() => setUnit(u)}>{l}</TChip>)}
              </div>
            </div>
            <span class="small muted">Cuenta desde el día en que la haces: si te atrasas, la siguiente se corre.</span>
          </>
        ) : (
          <>
            <div class="daypick" role="group" aria-label="Días de la semana">
              {WEEK.map((d) => <button key={d} type="button" aria-pressed={days.includes(d) ? 'true' : 'false'} aria-label={DAYS[d]} onClick={() => toggleDay(d)}>{DAYS_SHORT[d]}</button>)}
            </div>
            <span class="small muted">{freqLabel(freq)}. Si te saltas uno, la tarea queda pendiente hasta que la hagas.</span>
          </>
        )}
      </div>

      <div class="stack-sm">
        <span class="label">¿Cuánto tiempo te toma?</span>
        <NumberChips value={mins} onChange={setMins} presets={[5, 10, 15, 30, 45, 60, 90]} format={fmtMins} unit="min" min={1} max={600} label="Minutos" />
      </div>

      <AttrPicker value={attr} onChange={setAttr} label="¿Qué atributo sube?" />
      <span class="small muted" style={{ marginTop: -6 }}>Cada vez: +{choreXP(mins)} XP de {attrName(attr)} y +{CHORE_XP.gold} de oro.</span>

      <div class="stack-sm">
        <span class="label">Ícono</span>
        <div class="icon-pick" role="group" aria-label="Ícono">
          {CHORE_ICONS.map((k) => <button key={k} type="button" aria-pressed={icon === k ? 'true' : 'false'} aria-label={`Ícono ${k}`} onClick={() => setIcon(k)}><Icon name={k} size={20} /></button>)}
        </div>
      </div>

      {c ? (
        !c.paused && (
          <div class="stack-sm">
            <span class="label">Próxima vez: {preview ? `${dueLabel(preview, today)}${diffDays(today, preview) > 1 && diffDays(today, preview) < 7 ? ` ${fmtShort(preview)}` : ''}` : '—'}</span>
            <NextPicker value={next} today={today} onChange={setNext} />
          </div>
        )
      ) : (
        <div class="stack-sm">
          <span class="label">{freq.type === 'weekdays' ? 'Empieza' : '¿Cuándo toca la primera vez?'}</span>
          <div class="chips" role="group" aria-label="Primera vez">
            {[['Hoy', today], ['Mañana', addDays(today, 1)], ['En 3 días', addDays(today, 3)], ['En una semana', addDays(today, 7)]].map(([l, d]) => <TChip key={l} sm on={start === d} onClick={() => setStart(d)}>{l}</TChip>)}
            <input type="date" class="input" aria-label="Otra fecha" value={start} min={today} onInput={(e) => setStart(e.currentTarget.value || today)} style={{ minHeight: 40, width: 'auto' }} />
          </div>
          <span class="small muted">Toca {whenNext(preview, today)}{diffDays(today, preview) > 1 ? ` (${fmtShort(preview)})` : ''}.</span>
        </div>
      )}

      <div class="field"><label for="cn">Nota (opcional)</label><textarea id="cn" class="input" rows={2} value={note} maxLength={300} onInput={(e) => setNote(e.currentTarget.value)} placeholder="Productos, pasos, quién ayuda…" /></div>

      <button type="button" class="btn block" disabled={!title.trim()} onClick={save}><Icon name="check" size={20} />{c ? 'Guardar cambios' : 'Crear rutina'}</button>

      {c && (
        <div class="stack-sm">
          {!c.paused && st && st.todo && (
            <div class="row">
              <button type="button" class="btn sm soft grow" onClick={doneToday}><Icon name="check" size={18} />Hecha hoy</button>
              <button type="button" class="btn sm soft grow" onClick={skip}><Icon name="skip" size={18} />Saltar esta vez</button>
            </div>
          )}
          <label class="between-c panel" style={{ cursor: 'pointer' }}>
            <span class="stack-xs"><span class="semi">En pausa</span><span class="small muted">No aparece en Hoy ni en Pendientes. Útil si viajas o alguien más la está haciendo.</span></span>
            <Switch checked={!!c.paused} onChange={(v) => { act((x, d) => updateChore(x, c.id, { paused: v }, d)); toast(v ? 'Rutina en pausa' : 'Rutina activa otra vez', 'home'); }} label="En pausa" />
          </label>
          <section class="panel stack-sm" aria-label="Historial">
            <span class="semi">{log.length ? `Hecha ${plural(log.length, 'vez', 'veces')} · la última ${relDay(log[0], today).toLowerCase()}` : 'Todavía no la has marcado como hecha.'}</span>
            {log.length > 1 && <span class="small muted">En promedio, cada {plural(Math.max(1, Math.round(diffDays(log[Math.min(log.length, 8) - 1], log[0]) / (Math.min(log.length, 8) - 1))), 'día', 'días')}.</span>}
            {log.length > 0 && <div class="hist">{log.slice(0, 8).map((d, i) => <span key={`${d}${i}`}>{fmtShort(d)}</span>)}</div>}
          </section>
          <button type="button" class="link-btn" style={{ color: 'var(--vit-ink)', alignSelf: 'center' }} onClick={async () => {
            if (await ask(`¿Borrar la rutina «${c.title}»? Lo que ganaste se queda.`, { ok: 'Borrar', danger: true })) { act((x) => removeChore(x, c.id)); toast('Rutina borrada', 'trash'); onClose(); }
          }}><Icon name="trash" size={16} />Borrar rutina</button>
        </div>
      )}
    </Sheet>
  );
}

// Cambiar la próxima vez (sin tocar la frecuencia).
function NextPicker({ value, today, onChange }) {
  const opts = [['Hoy', today], ['Mañana', addDays(today, 1)], ['En 3 días', addDays(today, 3)], ['Próxima semana', addDays(today, 7)]];
  const matched = opts.some(([, d]) => d === value);
  const [pick, setPick] = useState(value !== undefined && !matched);
  return (
    <div class="stack-sm">
      <div class="chips" role="group" aria-label="Próxima vez">
        <TChip sm on={value === undefined && !pick} onClick={() => { setPick(false); onChange(undefined); }}>Según la frecuencia</TChip>
        {opts.map(([l, d]) => <TChip key={l} sm on={!pick && value === d} onClick={() => { setPick(false); onChange(d); }}>{l}</TChip>)}
        <TChip sm icon="calendar" on={pick} onClick={() => setPick(true)}>{pick && value ? fmtShort(value) : 'Elegir fecha'}</TChip>
      </div>
      {pick && <input type="date" class="input" aria-label="Fecha de la próxima vez" value={value || ''} onInput={(e) => onChange(e.currentTarget.value || undefined)} />}
    </div>
  );
}

// ---------- Tarjeta en Áreas ----------

export function HogarCard() {
  const s = useApp();
  const today = s.energy.day;
  const sum = houseSummary(s, today);
  const sub = !sum.total
    ? 'Lavar, planchar, limpiar… cada una con su frecuencia'
    : sum.due
      ? `${plural(sum.due, 'tarea toca', 'tareas tocan')} hoy · ${fmtMins(sum.mins)}${sum.late ? ` · ${sum.late} atrasada${sum.late === 1 ? '' : 's'}` : ''}`
      : 'Todo al día';
  const pct = sum.total ? Math.min(1, sum.doneWeek / Math.max(1, sum.doneWeek + sum.due)) : 0;
  return (
    <a href="#/hogar" class="card" style={{ textDecoration: 'none', color: 'var(--ink)' }} aria-label={`Hogar: ${sub}`}>
      <div class="row">
        <span class="tile" style={{ background: areaSoft(H), color: areaColor(H) }}><Icon name="home" /></span>
        <span class="stack-xs grow"><span class="strong">Hogar</span><span class="small muted">{sub}</span></span>
        <Icon name="right" size={18} />
      </div>
      {sum.total > 0 && (
        <div class="stack-xs">
          <div class="between tiny strong muted"><span>{plural(sum.doneWeek, 'hecha', 'hechas')} en 7 días</span><span>{plural(sum.total, 'rutina', 'rutinas')}</span></div>
          <Bar value={pct} color={areaColor(H)} label={`${sum.doneWeek} tareas hechas en 7 días`} />
        </div>
      )}
    </a>
  );
}
