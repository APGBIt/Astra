import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Nav, Sheet, SheetHead, TChip, Switch, DuePicker, dueLabel, nextMonday, toast, ask, areaColor, areaSoft, areaInk, plural, focusOnMount } from '../ui/kit.jsx';
import { canDictate, dictate } from '../ui/dictate.js';
import { act, useApp } from '../app/store.js';
import { back, go } from '../app/router.js';
import { AREA, AREAS } from '../game/content.js';
import { norm, parseTodo, classifyMission } from '../game/parse.js';
import {
  todoCategories, todoCategory, addTodo, updateTodo, removeTodo, completeTodo, uncompleteTodo, clearDoneTodos,
  TODO_BUCKETS, todoBucket, sortTodos, pendingTodos, todosIn, todosDue, todoReward, addTodoList, updateTodoList, removeTodoList,
  addMission, TODO_REPEATS, repeatLabel, nextRepeat, postponeTodo, overdueToToday, freqLabel, skipChore,
} from '../game/logic.js';
import { isBuyTodo, todoToShop } from '../game/shop.js';
import { fmtShort, addDays, diffDays, weekday, DAYS } from '../app/dates.js';

// Preferencias de vista (solo en este navegador).
const pref = {
  get(k, d) { try { return localStorage.getItem(`astra.ui.${k}`) || d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`astra.ui.${k}`, v); } catch { /* sin almacenamiento */ } },
};

// Color de una categoría: el suyo propio (Hogar) o el de su atributo.
export const tone = (c) => (c && (c.color || c.area)) || null;
const catColor = (s, cat) => areaColor(tone(todoCategory(s, cat)));

// La pantalla se vuelve a montar al abrir y cerrar un pendiente: el filtro se recuerda mientras la app está abierta.
const memo = { filter: 'all', showDone: false };

// Elige la categoría a partir de lo escrito: #etiqueta, el filtro activo o el área que sugiere el texto.
function resolveCat(s, parsed, fallback) {
  if (parsed.tag) {
    const t = norm(parsed.tag);
    const hit = todoCategories(s).find((c) => norm(c.name).replace(/\s+/g, '') === t.replace(/\s+/g, '') || norm(c.name).startsWith(t) || (AREA[c.id] && norm(AREA[c.id].attr) === t));
    if (hit) return hit.id;
  }
  if (fallback) return fallback;
  if (parsed.home) return 'hogar';
  return parsed.area || 'general';
}

// «mañana», «el lunes», «el 21 oct».
function whenText(d, today) {
  const n = diffDays(today, d);
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  return n > 1 && n < 7 ? `el ${DAYS[weekday(d)]}` : `el ${fmtShort(d)}`;
}

// Aviso al completar: XP, oro y, si se repite, cuándo vuelve.
export function doneText(r) {
  const base = r.xp ? `Hecho · +${r.xp} XP${r.area ? ` de ${AREA[r.area].attr}` : ''} y +${r.gold} de oro` : 'Hecho';
  return r.next ? `${base} · vuelve el ${fmtShort(r.next)}` : base;
}

// ---------- Fila de un pendiente (se usa en Pendientes, Hoy y las áreas) ----------

export function TodoRow({ s, t, today, showCat = true }) {
  const cat = todoCategory(s, t.cat);
  const color = areaColor(tone(cat));
  const late = t.due && !t.done && t.due < today;
  const chore = t.chore && (s.chores || []).find((c) => c.id === t.chore);
  const toggle = () => {
    if (t.done) { act((st) => uncompleteTodo(st, t.id)); return; }
    const r = act((st, d, ev) => completeTodo(st, t.id, d, ev));
    if (r) toast(doneText(r), 'check');
  };
  return (
    <div class={`mrow todo ${t.done ? 'done' : ''}`}>
      <button type="button" class="check" aria-pressed={t.done ? 'true' : 'false'} aria-label={t.done ? `Desmarcar ${t.title}` : `Completar ${t.title}`} onClick={toggle}>
        <span style={t.done ? null : { borderColor: color }}>{t.done && <Icon name="check" size={16} stroke={2.8} />}</span>
      </button>
      <a class="body" href={`#/pendientes/${t.id}`} style={{ textDecoration: 'none' }}>
        <span class="title">{t.important && !t.done && <Icon name="star" size={15} fill style={{ color: 'var(--xp)', marginRight: 5, verticalAlign: -2 }} label="Importante" />}{t.title}</span>
        {(showCat || t.due || t.note || t.repeat || chore) && (
          <span class="meta">
            {showCat && <span class="row" style={{ gap: 5 }}><span class="dot" style={{ background: color }} />{cat.name}</span>}
            {t.due && !t.done && <span class={late ? 'late' : t.due === today ? 'soon' : ''}>{showCat ? '· ' : ''}{dueLabel(t.due, today)}</span>}
            {t.repeat && !t.done && <span class="row" style={{ gap: 3 }}><Icon name="repeat" size={13} label={repeatLabel(t.repeat)} />{(TODO_REPEATS.find((x) => x.key === t.repeat) || {}).short}</span>}
            {chore && !t.done && <span class="row" style={{ gap: 3 }}><Icon name="repeat" size={13} label="Rutina del hogar" />{freqLabel(chore.freq).toLowerCase()}</span>}
            {t.note && <Icon name="note" size={13} label="Tiene nota" />}
          </span>
        )}
      </a>
    </div>
  );
}

// ---------- Agregar rápido ----------

export function QuickAdd({ s, today, fixedCat = null, defaultCat = null, placeholder = 'Agregar pendiente…', compact = false }) {
  const [text, setText] = useState('');
  const [cat, setCat] = useState(null);
  const [due, setDue] = useState(undefined);
  const [important, setImportant] = useState(null);
  const [repeat, setRepeat] = useState(undefined);
  const [panel, setPanel] = useState(null);
  const [listening, setListening] = useState(false);
  const stop = useRef(null);
  const parsed = parseTodo(text, today);
  const effCat = fixedCat || cat || resolveCat(s, parsed, defaultCat);
  const effDue = due !== undefined ? due : parsed.due;
  const effImp = important != null ? important : parsed.important;
  const effRep = repeat !== undefined ? repeat : parsed.repeat;
  const c = todoCategory(s, effCat);

  const save = () => {
    const title = parsed.title || text.trim();
    if (!title) return;
    act((st, t) => addTodo(st, { title, cat: effCat, due: effDue, important: effImp, repeat: effRep }, t));
    toast(`Agregado a ${c.name}${effDue ? ` · ${dueLabel(effDue, today).toLowerCase()}` : ''}${effRep ? ` · ${repeatLabel(effRep).toLowerCase()}` : ''}`, 'list');
    setText(''); setCat(null); setDue(undefined); setImportant(null); setRepeat(undefined); setPanel(null);
  };
  const mic = () => {
    if (listening) { if (stop.current) stop.current(); setListening(false); return; }
    setListening(true);
    stop.current = dictate((t) => setText(t), () => setListening(false));
  };
  const typing = text.trim().length > 0;
  return (
    <section class="quick" aria-label="Agregar pendiente">
      <div class="inline-input" style={compact ? { minHeight: 52 } : null}>
        <input value={text} maxLength={140} placeholder={placeholder} aria-label={placeholder} onInput={(e) => setText(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        {canDictate && !typing && <button type="button" class="icon-btn plain" aria-label={listening ? 'Detener dictado' : 'Dictar'} aria-pressed={listening ? 'true' : 'false'} onClick={mic} style={listening ? { background: 'var(--vit)', color: 'var(--on-accent)' } : null}><Icon name="mic" size={20} /></button>}
        <button type="button" class="icon-btn" aria-label="Agregar" disabled={!typing} onClick={save} style={typing ? { background: 'var(--ink)', color: 'var(--on-ink)' } : { opacity: 0.5 }}><Icon name="plus" size={22} stroke={2.4} /></button>
      </div>
      {typing && (
        <div class="row wrap" style={{ gap: 6 }}>
          {!fixedCat && (
            <button type="button" class="chip" aria-expanded={panel === 'cat' ? 'true' : 'false'} onClick={() => setPanel(panel === 'cat' ? null : 'cat')} style={{ border: 'none', background: areaSoft(tone(c)), color: areaInk(tone(c)), fontWeight: 700, minHeight: 34 }}>
              <span class="dot" style={{ background: areaColor(tone(c)) }} />{c.name}<Icon name="down" size={14} />
            </button>
          )}
          <button type="button" class="chip" aria-expanded={panel === 'due' ? 'true' : 'false'} onClick={() => setPanel(panel === 'due' ? null : 'due')} style={{ border: 'none', minHeight: 34, fontWeight: 700 }}>
            <Icon name="calendar" size={14} />{effDue ? dueLabel(effDue, today) : 'Sin fecha'}<Icon name="down" size={14} />
          </button>
          <button type="button" class="chip" aria-pressed={effImp ? 'true' : 'false'} onClick={() => setImportant(!effImp)} style={{ border: 'none', minHeight: 34, fontWeight: 700, background: effImp ? 'var(--xp-soft)' : 'var(--soft)', color: effImp ? 'var(--xp-ink)' : 'var(--ink)' }}>
            <Icon name="star" size={14} fill={effImp} />Importante
          </button>
          {effRep && (
            <button type="button" class="chip" aria-label={`${repeatLabel(effRep)}: quitar`} onClick={() => setRepeat(null)} style={{ border: 'none', minHeight: 34, fontWeight: 700, background: 'var(--ene-soft)', color: 'var(--ene-ink)' }}>
              <Icon name="repeat" size={14} />{repeatLabel(effRep)}<Icon name="close" size={12} />
            </button>
          )}
        </div>
      )}
      {typing && panel === 'cat' && <CatPicker s={s} value={effCat} onChange={(v) => { setCat(v); setPanel(null); }} />}
      {typing && panel === 'due' && <DuePicker value={effDue} today={today} onChange={(v) => { setDue(v); }} />}
    </section>
  );
}

// ---------- Selector de categoría ----------

export function CatPicker({ s, value, onChange, allowNew = true }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [area, setArea] = useState(null);
  const create = () => {
    const l = act((st) => addTodoList(st, { name, area }));
    if (l) { onChange(l.id); toast(`Categoría «${l.name}» creada`, 'tag'); }
    setAdding(false); setName(''); setArea(null);
  };
  return (
    <div class="stack-sm">
      <div class="chips" role="group" aria-label="Categoría">
        {todoCategories(s).map((c) => (
          <TChip key={c.id} sm on={value === c.id} onClick={() => onChange(c.id)}>
            <span class="dot" style={{ background: areaColor(tone(c)) }} />{c.name}
          </TChip>
        ))}
        {allowNew && <TChip sm icon="plus" on={adding} onClick={() => setAdding(!adding)}>Nueva</TChip>}
      </div>
      {adding && (
        <div class="panel stack-sm">
          <div class="field"><label for="ncat">Nombre de la categoría</label><input id="ncat" class="input" value={name} maxLength={30} placeholder="Ej. Casa, Maestría, Trámites" onInput={(e) => setName(e.currentTarget.value)} ref={focusOnMount} /></div>
          <AttrPicker value={area} onChange={setArea} />
          <button type="button" class="btn sm" disabled={name.trim().length < 2} onClick={create}><Icon name="check" size={18} />Crear categoría</button>
        </div>
      )}
    </div>
  );
}

export function AttrPicker({ value, onChange, label = '¿Qué atributo sube al completar?' }) {
  return (
    <div class="stack-sm">
      <span class="label">{label}</span>
      <div class="chips" role="group" aria-label="Atributo">
        <TChip sm on={!value} onClick={() => onChange(null)}>Ninguno (solo tu nivel)</TChip>
        {AREAS.map((a) => <TChip key={a.key} sm on={value === a.key} icon={a.icon} color={areaColor(a.key)} onClick={() => onChange(a.key)}>{a.attr}</TChip>)}
      </div>
    </div>
  );
}

// ---------- Pantalla Pendientes ----------

export function Todos({ query }) {
  const s = useApp();
  const today = s.energy.day;
  const [rawFilter, setFilterState] = useState(() => { const c = query.get('cat'); if (c) memo.filter = c; return memo.filter; });
  const setFilter = (f) => { memo.filter = f; setFilterState(f); };
  const [group, setGroup] = useState(pref.get('todoGroup', 'fecha'));
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showDone, setShowDoneState] = useState(memo.showDone);
  const setShowDone = (v) => { memo.showDone = v; setShowDoneState(v); };
  const [cats, setCats] = useState(false);
  const all = todoCategories(s);
  const filter = rawFilter !== 'all' && !all.some((c) => c.id === rawFilter) ? 'all' : rawFilter;
  const pend = pendingTodos(s);
  const q = norm(search);
  const match = (t) => !q || norm(`${t.title} ${t.note}`).includes(q);
  const visible = sortTodos(pend.filter((t) => (filter === 'all' || t.cat === filter) && match(t)));
  const done = s.todos.filter((t) => t.done && (filter === 'all' || t.cat === filter) && match(t)).sort((a, b) => (a.done < b.done ? 1 : -1));
  const counts = {};
  for (const t of pend) counts[t.cat] = (counts[t.cat] || 0) + 1;
  const dueCount = todosDue(s, today).length;
  const setG = (g) => { setGroup(g); pref.set('todoGroup', g); };

  let groups;
  if (group === 'categoria') {
    groups = all.map((c) => ({ key: c.id, label: c.name, color: areaColor(tone(c)), items: visible.filter((t) => t.cat === c.id) })).filter((g) => g.items.length);
  } else {
    groups = TODO_BUCKETS.map((b) => ({ key: b.key, label: b.label, late: b.key === 'vencidos', items: visible.filter((t) => todoBucket(t, today) === b.key) })).filter((g) => g.items.length);
  }
  const shownCats = all.filter((c) => counts[c.id] || c.id === filter);

  return (
    <>
      <main class="screen">
        <header class="between-c">
          <div class="stack-xs">
            <span class="small muted semi">{pend.length ? `${pend.length} por hacer${dueCount ? ` · ${dueCount} para hoy` : ''}` : 'Lista general'}</span>
            <h1 class="h1">Pendientes</h1>
          </div>
          <div class="row" style={{ gap: 8 }}>
            <button type="button" class="icon-btn" aria-label="Buscar" aria-pressed={showSearch ? 'true' : 'false'} onClick={() => { setShowSearch(!showSearch); setSearch(''); }}><Icon name="search" /></button>
            <button type="button" class="icon-btn" aria-label="Categorías" onClick={() => setCats(true)}><Icon name="tag" /></button>
          </div>
        </header>

        {showSearch && <input class="input" type="search" value={search} placeholder="Buscar en tus pendientes" aria-label="Buscar en tus pendientes" onInput={(e) => setSearch(e.currentTarget.value)} ref={focusOnMount} />}

        <QuickAdd s={s} today={today} defaultCat={filter !== 'all' ? filter : null} placeholder={filter !== 'all' ? `Agregar a ${todoCategory(s, filter).name}…` : '¿Qué tienes pendiente?'} />

        {filter === 'hogar' && (
          <a href="#/hogar" class="row" style={{ gap: 10, minHeight: 52, padding: '0 14px', borderRadius: 16, background: areaSoft('hogar'), color: areaInk('hogar'), textDecoration: 'none' }}>
            <Icon name="home" size={19} /><span class="grow semi">{(s.chores || []).length ? 'Tus rutinas del hogar: frecuencias y plan de la semana' : 'Crea tus rutinas: lavar, planchar, limpiar… y se repiten solas'}</span><Icon name="right" size={16} />
          </a>
        )}

        <div class="stack-sm">
          <div class="chips scroll" role="group" aria-label="Filtrar por categoría">
            <TChip sm on={filter === 'all'} onClick={() => setFilter('all')}>Todas · {pend.length}</TChip>
            {shownCats.map((c) => (
              <TChip key={c.id} sm on={filter === c.id} onClick={() => setFilter(filter === c.id ? 'all' : c.id)}>
                <span class="dot" style={{ background: areaColor(tone(c)) }} />{c.name} · {counts[c.id] || 0}
              </TChip>
            ))}
            <TChip sm icon="plus" onClick={() => setCats(true)}>Categoría</TChip>
          </div>
          <div class="seg" role="tablist" aria-label="Agrupar">
            <button type="button" role="tab" aria-selected={group === 'fecha' ? 'true' : 'false'} onClick={() => setG('fecha')}><Icon name="calendar" size={16} />Por fecha</button>
            <button type="button" role="tab" aria-selected={group === 'categoria' ? 'true' : 'false'} onClick={() => setG('categoria')}><Icon name="tag" size={16} />Por categoría</button>
          </div>
        </div>

        {!visible.length && (
          <div class="empty">
            <Icon name="list" size={26} />
            <span>{q ? 'Nada coincide con tu búsqueda.' : filter !== 'all' ? `No tienes pendientes en ${todoCategory(s, filter).name}.` : 'Tu lista está vacía. Escribe arriba lo que tengas pendiente: la fecha y la categoría se detectan solas.'}</span>
          </div>
        )}

        {groups.map((g) => (
          <section key={g.key} class="stack-xs" aria-label={g.label}>
            <div class="between-c" style={{ minHeight: 28 }}>
              <h2 class="eyebrow row" style={{ gap: 6, color: g.late ? 'var(--vit-ink)' : undefined }}>
                {g.color && <span class="dot" style={{ background: g.color }} />}{g.label} · {g.items.length}
              </h2>
              {g.late && (
                <button type="button" class="link-btn" style={{ minHeight: 32, fontSize: 13.5 }} onClick={() => {
                  const ids = g.items.map((t) => t.id);
                  const n = act((st, d) => overdueToToday(st, d, ids));
                  if (n) toast(n === 1 ? 'Lo pasaste a hoy' : `${n} pendientes pasaron a hoy`, 'calendar');
                }}><Icon name="calendar" size={15} />Pasar a hoy</button>
              )}
            </div>
            <div>{g.items.map((t) => <TodoRow key={t.id} s={s} t={t} today={today} showCat={group !== 'categoria'} />)}</div>
          </section>
        ))}

        {done.length > 0 && (
          <section class="card flush" aria-label="Hechos">
            <button type="button" class="lrow" style={{ minHeight: 56 }} aria-expanded={showDone ? 'true' : 'false'} onClick={() => setShowDone(!showDone)}>
              <span class="grow h2" style={{ fontSize: 17 }}>Hechos · {done.length}</span><Icon name={showDone ? 'down' : 'right'} size={18} />
            </button>
            {showDone && (
              <>
                {done.slice(0, 40).map((t) => <TodoRow key={t.id} s={s} t={t} today={today} />)}
                <button type="button" class="lrow" style={{ justifyContent: 'center', color: 'var(--vit-ink)', fontWeight: 700, minHeight: 52 }} onClick={async () => { if (await ask('¿Borrar de la lista los pendientes hechos? La XP que ganaste se queda.', { ok: 'Borrar hechos', danger: true })) { act((st) => clearDoneTodos(st)); toast('Lista limpia', 'trash'); } }}>
                  <Icon name="trash" size={16} />Borrar los hechos
                </button>
              </>
            )}
          </section>
        )}

        <p class="small muted" style={{ textAlign: 'center', padding: '0 12px' }}>
          Cada pendiente hecho da +{todoReward({}).xp} XP (+{todoReward({ important: true }).xp} si es importante) en el atributo de su categoría.
        </p>
      </main>
      <Nav active="pendientes" fab={{ href: filter !== 'all' ? `/pendientes/nuevo?cat=${filter}` : '/pendientes/nuevo', label: 'Nuevo pendiente' }} />
      {cats && <CatsSheet onClose={() => setCats(false)} />}
    </>
  );
}

// ---------- Hoja: nuevo o editar ----------

export function TodoSheet({ id, query }) {
  const s = useApp();
  const today = s.energy.day;
  const t = id ? s.todos.find((x) => x.id === id) : null;
  // Se cierra una sola vez (al borrar, la hoja también se cerraría sola al desaparecer el pendiente).
  const closing = useRef(false);
  const close = () => { if (closing.current) return; closing.current = true; back('/pendientes'); };
  useEffect(() => { if (id && !t) close(); }, [t]);
  const [title, setTitle] = useState(t ? t.title : '');
  const [cat, setCat] = useState(t ? t.cat : (query && query.get('cat')) || null);
  const [due, setDue] = useState(t ? t.due : undefined);
  const [important, setImportant] = useState(t ? t.important : null);
  const [repeat, setRepeat] = useState(t ? t.repeat || null : undefined);
  const [note, setNote] = useState(t ? t.note : '');
  if (id && !t) return null;
  const chore = t && t.chore ? (s.chores || []).find((c) => c.id === t.chore) : null;
  const parsed = t ? { title, due: null, important: false, area: null, tag: null } : parseTodo(title, today);
  const effCat = chore ? 'hogar' : cat || resolveCat(s, parsed, null);
  const effDue = due !== undefined ? due : parsed.due;
  const effImp = important != null ? important : parsed.important;
  const effRep = chore ? null : repeat !== undefined ? repeat : parsed.repeat || null;
  const finalTitle = t ? title.trim() : (parsed.title || title.trim());

  const save = () => {
    if (!finalTitle) return;
    act((st, d) => (t ? updateTodo(st, t.id, { title: finalTitle, cat: effCat, due: effDue, important: effImp, note, repeat: effRep }, d) : addTodo(st, { title: finalTitle, cat: effCat, due: effDue, important: effImp, note, repeat: effRep }, d)));
    toast(t ? 'Pendiente actualizado' : `Agregado a ${todoCategory(s, effCat).name}`, 'list');
    close();
  };
  // Posponer guarda también lo que hayas cambiado en la hoja.
  const postpone = (d) => {
    act((st, day) => { updateTodo(st, t.id, { title: finalTitle || t.title, cat: effCat, important: effImp, note, repeat: effRep }, day); postponeTodo(st, t.id, d); });
    toast(`Pospuesto para ${whenText(d, today)}`, 'calendar');
    close();
  };
  const toMission = async () => {
    const cls = classifyMission(finalTitle);
    const area = todoCategory(s, effCat).area || cls.area;
    if (!(await ask(`¿Convertir «${finalTitle}» en misión de hoy? Cuesta ${cls.cost} de energía y da más XP de ${AREA[area].attr}.`, { ok: 'Convertir' }))) return;
    act((st, d) => { addMission(st, { title: finalTitle, area, cost: cls.cost, kind: 'once' }, d); if (t) removeTodo(st, t.id); });
    toast('Ahora es una misión de hoy', 'sword');
    closing.current = true;
    go('/', { replace: true });
  };

  return (
    <Sheet onClose={close} label={t ? 'Editar pendiente' : 'Nuevo pendiente'}>
      <SheetHead title={t ? 'Pendiente' : 'Nuevo pendiente'} onClose={close} />
      <div class="field">
        <label for="tt">¿Qué tienes pendiente?</label>
        <input id="tt" class="input big" value={title} maxLength={140} placeholder="Ej. Renovar el marbete el viernes" onInput={(e) => setTitle(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !t) save(); }} autoFocus={!t} />
        {!t && parsed.title && parsed.title !== title.trim() && <span class="small muted row" style={{ gap: 6 }}><Icon name="sparkle" size={14} />Se guardará como «{parsed.title}»</span>}
      </div>
      {chore ? (
        <a href={`#/hogar?r=${chore.id}`} class="row" style={{ gap: 12, minHeight: 56, padding: '8px 14px', borderRadius: 16, background: areaSoft('hogar'), color: areaInk('hogar'), textDecoration: 'none' }}>
          <Icon name={chore.icon || 'home'} size={20} />
          <span class="stack-xs grow"><span class="semi">Rutina del hogar · {freqLabel(chore.freq).toLowerCase()}</span><span class="small">Al hacerla vuelve sola. Toca para cambiar la frecuencia o pausarla.</span></span>
          <Icon name="right" size={16} />
        </a>
      ) : <div class="stack-sm"><span class="label">Categoría</span><CatPicker s={s} value={effCat} onChange={setCat} /></div>}
      <div class="stack-sm"><span class="label">{chore ? '¿Cuándo toca esta vez?' : '¿Para cuándo?'}</span><DuePicker value={effDue} today={today} onChange={setDue} allowNone={!chore} /></div>
      {!chore && <div class="stack-sm">
        <span class="label">¿Se repite?</span>
        <div class="chips" role="group" aria-label="Se repite">
          <TChip sm on={!effRep} onClick={() => setRepeat(null)}>No</TChip>
          {TODO_REPEATS.map((r) => <TChip key={r.key} sm icon="repeat" on={effRep === r.key} onClick={() => setRepeat(r.key)}>{r.label}</TChip>)}
        </div>
        {effRep && <span class="small muted">Al completarlo aparece el siguiente{(() => { const n = nextRepeat(effDue || today, effRep); return n ? `, para el ${fmtShort(n)}` : ''; })()}.{!effDue ? ' Empieza hoy.' : ''}</span>}
      </div>}
      <label class="between-c panel" style={{ cursor: 'pointer' }}>
        <span class="row" style={{ gap: 10 }}><Icon name="star" size={20} fill={effImp} style={{ color: effImp ? 'var(--xp)' : undefined }} /><span class="stack-xs"><span class="semi">Importante</span><span class="small muted">Sube arriba en la lista y da el doble de XP.</span></span></span>
        <Switch checked={effImp} onChange={setImportant} label="Importante" />
      </label>
      <div class="field"><label for="tn">Nota (opcional)</label><textarea id="tn" class="input" rows={2} value={note} maxLength={1000} onInput={(e) => setNote(e.currentTarget.value)} placeholder="Detalles, dirección, número de referencia…" /></div>
      <button type="button" class="btn block" disabled={!finalTitle} onClick={save}><Icon name="check" size={20} />{t ? 'Guardar cambios' : 'Agregar pendiente'}</button>
      {t && (
        <div class="stack-sm">
          <button type="button" class="btn ghost block" onClick={() => {
            if (t.done) act((st) => uncompleteTodo(st, t.id));
            else { const r = act((st, d, ev) => completeTodo(st, t.id, d, ev)); if (r) toast(doneText(r), 'check'); }
            close();
          }}><Icon name={t.done ? 'undo' : 'check'} size={18} />{t.done ? 'Desmarcar' : 'Marcar como hecho'}</button>
          {!t.done && t.due && t.due <= today && (
            <div class="stack-sm panel">
              <span class="small semi">¿Hoy no llegas? Posponer{t.repeat ? ' (solo esta vez; la serie sigue igual)' : ''}</span>
              <div class="chips" role="group" aria-label="Posponer">
                {[['Mañana', addDays(today, 1)], ['En 3 días', addDays(today, 3)], ['Próxima semana', nextMonday(today)]].map(([l, d]) => (
                  <TChip key={l} sm onClick={() => postpone(d)}>{l}</TChip>
                ))}
              </div>
            </div>
          )}
          {chore ? (!t.done && (
            <button type="button" class="btn sm soft" style={{ alignSelf: 'flex-start' }} onClick={() => {
              const n = act((st, d) => skipChore(st, chore.id, d));
              if (n) toast(`Saltada esta vez · vuelve ${whenText(n, today)}`, 'skip');
              close();
            }}><Icon name="skip" size={18} />Saltar esta vez</button>
          )) : (
            <div class="row" style={{ justifyContent: 'space-between' }}>
              {!t.done && isBuyTodo(t.title) ? <button type="button" class="btn sm soft" onClick={() => { const r = act((st, d) => todoToShop(st, t.id, d)); if (r) { toast('Pasó a tu lista de compras', 'cart'); close(); } }}><Icon name="cart" size={18} />A la lista</button> : null}
              {!t.done ? <button type="button" class="btn sm soft" onClick={toMission}><Icon name="sword" size={18} />Hacerla misión</button> : <span />}
              <button type="button" class="btn sm soft" style={{ color: 'var(--vit-ink)' }} onClick={async () => { if (await ask('¿Borrar este pendiente?', { ok: 'Borrar', danger: true })) { act((st) => removeTodo(st, t.id)); toast('Pendiente borrado', 'trash'); close(); } }}><Icon name="trash" size={18} />Borrar</button>
            </div>
          )}
        </div>
      )}
      {!t && <button type="button" class="link-btn muted" style={{ alignSelf: 'center' }} onClick={toMission} disabled={!finalTitle}>¿Es algo para hoy que cuesta esfuerzo? Hazlo misión<Icon name="right" size={16} /></button>}
    </Sheet>
  );
}

// ---------- Hoja: categorías ----------

function CatsSheet({ onClose }) {
  const s = useApp();
  const counts = {};
  for (const t of pendingTodos(s)) counts[t.cat] = (counts[t.cat] || 0) + 1;
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  return (
    <Sheet onClose={onClose} label="Categorías">
      <SheetHead title="Categorías" onClose={onClose} />
      <p class="small muted">General, Hogar y las seis áreas siempre están. Crea las tuyas (Trámites, Maestría…) y elige qué atributo sube cuando completas sus pendientes.</p>
      <section class="card flush" aria-label="Tus categorías">
        {todoCategories(s).map((c) => (
          <div key={c.id} class="lrow" style={{ minHeight: 56 }}>
            <span class="tile sm" style={{ background: areaSoft(tone(c)), color: areaColor(tone(c)) }}><Icon name={c.id === 'hogar' ? 'home' : c.area ? AREA[c.area].icon : c.builtin ? 'list' : 'tag'} size={18} /></span>
            <span class="stack-xs grow"><span class="strong">{c.name}</span><span class="tiny muted semi">{plural(counts[c.id] || 0, 'pendiente', 'pendientes')} · {c.id === 'hogar' ? `sube ${AREA[c.area].attr} o el atributo de cada rutina` : c.area ? `sube ${AREA[c.area].attr}` : 'sube tu nivel'}</span></span>
            {!c.builtin && <button type="button" class="icon-btn plain" aria-label={`Editar ${c.name}`} onClick={() => setEditing(c)}><Icon name="edit" size={18} /></button>}
          </div>
        ))}
      </section>
      {!adding && !editing && <button type="button" class="btn ghost block" onClick={() => setAdding(true)}><Icon name="plus" size={18} />Nueva categoría</button>}
      {(adding || editing) && <ListForm key={editing ? editing.id : 'new'} list={editing} onDone={() => { setAdding(false); setEditing(null); }} />}
    </Sheet>
  );
}

function ListForm({ list, onDone }) {
  const [name, setName] = useState(list ? list.name : '');
  const [area, setArea] = useState(list ? list.area : null);
  return (
    <section class="panel stack" aria-label={list ? `Editar ${list.name}` : 'Nueva categoría'}>
      <div class="field"><label for="lname">Nombre</label><input id="lname" class="input" value={name} maxLength={30} placeholder="Ej. Casa" onInput={(e) => setName(e.currentTarget.value)} ref={focusOnMount} /></div>
      <AttrPicker value={area} onChange={setArea} />
      <div class="row">
        <button type="button" class="btn sm grow" disabled={name.trim().length < 2} onClick={() => { act((st) => (list ? updateTodoList(st, list.id, { name, area }) : addTodoList(st, { name, area }))); toast(list ? 'Categoría actualizada' : 'Categoría creada', 'tag'); onDone(); }}><Icon name="check" size={18} />Guardar</button>
        <button type="button" class="btn sm ghost" onClick={onDone}>Cancelar</button>
      </div>
      {list && <button type="button" class="link-btn" style={{ color: 'var(--vit-ink)', alignSelf: 'flex-start' }} onClick={async () => { if (await ask(`¿Borrar la categoría «${list.name}»? Sus pendientes pasan a General.`, { ok: 'Borrar', danger: true })) { act((st) => removeTodoList(st, list.id)); onDone(); } }}><Icon name="trash" size={16} />Borrar categoría</button>}
    </section>
  );
}

// ---------- Pendientes dentro de cada área ----------

export function AreaTodos({ area }) {
  const s = useApp();
  const today = s.energy.day;
  const list = sortTodos(todosIn(s, area));
  // Tus categorías que suben este atributo (p. ej. «Maestría» en Crecimiento) tienen su acceso aquí.
  const linked = s.todoLists.filter((l) => l.area === area).map((l) => ({ l, n: todosIn(s, l.id).length })).filter((x) => x.n > 0);
  return (
    <section class="stack-sm" aria-label={`Pendientes de ${AREA[area].area}`}>
      <div class="between-c"><h2 class="eyebrow">Pendientes de {AREA[area].area}</h2><a class="link-btn" href={`#/pendientes?cat=${area}`}>Ver lista<Icon name="right" size={16} /></a></div>
      <QuickAdd s={s} today={today} fixedCat={area} compact placeholder={`Agregar a ${AREA[area].area}…`} />
      {list.length > 0 && <div>{list.slice(0, 6).map((t) => <TodoRow key={t.id} s={s} t={t} today={today} showCat={false} />)}</div>}
      {list.length > 6 && <a class="link-btn muted" href={`#/pendientes?cat=${area}`}>y {list.length - 6} más</a>}
      {linked.map(({ l, n }) => (
        <a key={l.id} class="row" href={`#/pendientes?cat=${l.id}`} style={{ gap: 10, minHeight: 48, padding: '0 14px', borderRadius: 16, background: areaSoft(area), color: areaInk(area), textDecoration: 'none' }}>
          <Icon name="tag" size={17} /><span class="grow semi">{l.name} · {plural(n, 'pendiente', 'pendientes')}</span><Icon name="right" size={16} />
        </a>
      ))}
    </section>
  );
}

export { catColor };
