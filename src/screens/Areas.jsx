import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Nav, TopBar, Bar, Ring, TChip, Stepper, Sheet, SheetHead, Bolts, NumberChips, toast, areaColor, areaSoft, areaInk, plural, ask, num } from '../ui/kit.jsx';
import { AreaTodos } from './Todos.jsx';
import { RecordCard } from './Record.jsx';
import { GoalsSheet } from './Goals.jsx';
import { HogarCard } from './Hogar.jsx';
import { WinsCard } from './Wins.jsx';
import { SleepSheet, SleepWeek, SleepInsights } from './Sleep.jsx';
import { HealthHighlights, WellbeingCard, WheelCard, ValuesCard } from './Reflect.jsx';
import { JournalCard } from './Journal.jsx';
import { vibrate } from '../app/env.js';
import { go } from '../app/router.js';
import { act, useApp } from '../app/store.js';
import { GrowthCard } from './Growth.jsx';
import { addDays, relDay, DAYS_SHORT, weekday, fmtShort } from '../app/dates.js';
import { AREAS, AREA, AREA_ROUTE, CIRCLES, EXERCISE_TYPES } from '../game/content.js';
import { calmMinutes, calmStreak, journalDays } from '../game/mind.js';
import {
  attrLevel, talentsFor, dayMissions, isDone, completeMission, undoMission, logHealth, fmtHours, dailyGoal, todosForArea,
  addPerson, updatePerson, removePerson, contactPerson, personStatus, duePeople,
  upcomingBirthdays, waLink, addBook, logPages, addCard, dueCards, reviewCard, logPractice, finishFocus, closeWorkday, bossHP,
} from '../game/logic.js';
import { MissionRow } from './Home.jsx';
import { ActivityCard, ExerciseSheet, MedsCard, MedsSheet, MedSheet, TrendsCard } from './HealthPlus.jsx';

// ---------- Mapa de áreas ----------

export function Areas() {
  const s = useApp();
  return (
    <>
      <main class="screen">
        <div class="stack-xs"><h1 class="h1">Áreas</h1><p class="lead">Seis atributos. Cada uno crece con lo que haces en su área.</p></div>
        <div class="stack">
          {AREAS.map((a) => {
            const lv = attrLevel(s.attrs[a.key] || 0);
            const tal = talentsFor(s, a.key).filter((t) => t.unlocked).length;
            const todo = todosForArea(s, a.key).length;
            return (
              <a key={a.key} href={`#${AREA_ROUTE[a.key]}`} class="card tight" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
                <div class="row">
                  <span class="tile" style={{ background: areaSoft(a.key), color: areaColor(a.key) }}><Icon name={a.icon} /></span>
                  <span class="stack-xs grow"><span class="strong">{a.attr}<span class="muted semi"> · {a.area}</span></span><span class="tiny muted semi">{tal ? `${tal} ${tal === 1 ? 'talento' : 'talentos'} · ` : ''}{lv.into} / {lv.need} XP{todo ? ` · ${plural(todo, 'pendiente', 'pendientes')}` : ''}</span></span>
                  <span class="display-num" style={{ fontSize: 22 }}>{lv.n}</span>
                  <Icon name="right" size={18} />
                </div>
                <Bar value={lv.progress} color={areaColor(a.key)} label={`${a.attr}: ${Math.round(lv.progress * 100)} % al nivel ${lv.n + 1}`} />
              </a>
            );
          })}
        </div>
        <MindCard s={s} />
        <HogarCard />
        <WinsCard />
        <RecordCard />
      </main>
      <Nav active="areas" />
    </>
  );
}

// Calma y Diario a un toque desde el mapa de áreas.
function MindCard({ s }) {
  const today = s.energy.day;
  const min = calmMinutes(s, today);
  const streak = calmStreak(s, today);
  const jd = journalDays(s);
  return (
    <section class="card tight" aria-label="Mente en calma">
      <div class="row" style={{ gap: 10 }}>
        <span class="tile" style={{ background: areaSoft('emocional'), color: areaColor('emocional') }}><Icon name="sparkle" /></span>
        <span class="stack-xs grow"><span class="strong">Mente en calma</span><span class="tiny muted semi">{min ? `${min} min de calma hoy` : 'Respira, medita o escribe'}{streak > 1 ? ` · ${streak} días seguidos` : ''}</span></span>
      </div>
      <div class="row" style={{ gap: 8 }}>
        <a class="btn sm soft grow" href="#/calma"><Icon name="sparkle" size={16} />Calma</a>
        <a class="btn sm soft grow" href="#/diario"><Icon name="book" size={16} />Diario{jd ? ` · ${jd} días` : ''}</a>
      </div>
    </section>
  );
}

export function AreaHeader({ area, right }) {
  const s = useApp();
  const lv = attrLevel(s.attrs[area] || 0);
  const a = AREA[area];
  return (
    <section class="stack-sm" aria-label={a.area}>
      <div class="between-c">
        <div class="stack-xs"><span class="eyebrow" style={{ color: areaInk(area) }}>{a.area}</span><h1 class="h1">{a.attr} · Nv {lv.n}</h1></div>
        {right}
      </div>
      <Bar value={lv.progress} size="lg" color={areaColor(area)} label={`Progreso al nivel ${lv.n + 1}: ${Math.round(lv.progress * 100)} %`} />
      <span class="small muted semi">{lv.into} / {lv.need} XP para el nivel {lv.n + 1}</span>
    </section>
  );
}

export function AreaMissions({ area }) {
  const s = useApp();
  const today = s.energy.day;
  const { pending, done } = dayMissions(s, today);
  const list = [...pending, ...done].filter((m) => m.area === area);
  const toggle = (m) => act((st, t, ev) => (isDone(st, m, t) ? undoMission(st, m.id, t) : completeMission(st, m.id, t, ev)));
  return (
    <section class="stack-xs" aria-label="Misiones">
      <div class="between-c"><h2 class="eyebrow">Misiones de hoy</h2><a class="link-btn" href="#/mision/nueva">Nueva<Icon name="plus" size={16} /></a></div>
      {!list.length && <p class="small muted">No tienes misiones de {AREA[area].attr} para hoy.</p>}
      <div>{list.map((m) => <MissionRow key={m.id} m={m} done={isDone(s, m, today)} onToggle={() => toggle(m)} />)}</div>
    </section>
  );
}

function Talents({ area }) {
  const s = useApp();
  const t = talentsFor(s, area);
  return (
    <section class="card" aria-label="Talentos">
      <h2 class="h2">Talentos</h2>
      {t.map((x) => (
        <div class="row" key={x.name}>
          <span class="tile sm" style={x.unlocked ? { background: areaColor(area), color: 'var(--on-accent)' } : { background: 'var(--soft)', color: 'var(--faint)' }}><Icon name={x.unlocked ? 'star' : 'lock'} size={16} /></span>
          <span class="stack-xs grow"><span class="strong" style={{ color: x.unlocked ? undefined : 'var(--muted)' }}>{x.name}</span><span class="tiny muted">Nivel {x.level} · +5 % de XP en {AREA[area].attr}</span></span>
        </div>
      ))}
    </section>
  );
}

// ---------- Salud ----------

export function Health() {
  const s = useApp();
  const today = s.energy.day;
  const h = s.health[today] || {};
  const [sheet, setSheet] = useState(null);
  const [sleepDay, setSleepDay] = useState(today);
  const goal = dailyGoal(s, 'sleep');
  const g = { steps: dailyGoal(s, 'steps'), water: dailyGoal(s, 'water'), exercise: dailyGoal(s, 'exercise'), veg: dailyGoal(s, 'veg'), calm: dailyGoal(s, 'calm') };
  const calmToday = calmMinutes(s, today);
  const save = (patch, msg) => { act((st, t, ev) => logHealth(st, t, patch, t, ev)); if (msg) toast(msg, 'check'); setSheet(null); };
  const editSleep = (d) => { setSleepDay(d); setSheet('sleep'); };
  const tiles = [
    { key: 'steps', icon: 'pulse', label: 'Pasos', value: h.steps != null ? num(h.steps) : '—', sub: `meta ${num(g.steps)}`, pct: (h.steps || 0) / g.steps },
    { key: 'sleep', icon: 'moon', label: 'Sueño', value: h.sleep != null ? fmtHours(h.sleep) : '—', sub: `meta ${fmtHours(goal)}`, pct: (h.sleep || 0) / goal },
    { key: 'water', icon: 'drop', label: 'Agua', value: h.water != null ? String(h.water) : '0', sub: `de ${g.water} vasos`, pct: (h.water || 0) / g.water },
    { key: 'exercise', icon: 'dumbbell', label: 'Ejercicio', value: h.exercise != null ? `${h.exercise} min` : '0 min', sub: `meta ${g.exercise} min`, pct: (h.exercise || 0) / g.exercise },
    { key: 'veg', icon: 'sprout', label: 'Frutas y verduras', value: String(h.veg || 0), sub: `de ${g.veg} porciones`, pct: (h.veg || 0) / g.veg },
    { key: 'calm', icon: 'sparkle', label: 'Calma', value: `${calmToday} min`, sub: `meta ${g.calm} min`, pct: calmToday / g.calm },
  ];
  const tap = (k) => (k === 'water' ? save({ water: (h.water || 0) + 1 }, 'Un vaso más') : k === 'veg' ? save({ veg: (h.veg || 0) + 1 }, 'Una porción más de frutas o verduras') : k === 'sleep' ? editSleep(today) : k === 'calm' ? go('/calma') : setSheet(k));
  const minus = { water: ['Quitar un vaso', 'Un vaso menos'], veg: ['Quitar una porción', 'Una porción menos'] };
  return (
    <>
      <main class="screen">
        <TopBar backTo="/areas" right={<button type="button" class="btn sm soft" onClick={() => setSheet('goals')}><Icon name="target" size={18} />Mis metas</button>} />
        <AreaHeader area="salud" />
        <div class="grid2">
          {tiles.map((t) => (
            <div key={t.key} style={{ position: 'relative' }}>
              <button type="button" class="card tight" onClick={() => tap(t.key)} style={{ textAlign: 'left', color: 'var(--ink)', width: '100%', height: '100%' }}
                aria-label={t.key === 'water' ? `Agua: ${t.value} de ${g.water} vasos. Tocar para sumar uno` : t.key === 'veg' ? `Frutas y verduras: ${t.value} de ${g.veg} porciones. Tocar para sumar una` : t.key === 'calm' ? `Calma: ${t.value} hoy. Tocar para abrir Calma` : `${t.label}: ${t.value}. Tocar para registrar`}>
                <div class="between-c"><span style={{ color: areaColor('salud'), display: 'flex' }}><Icon name={t.icon} /></span><Ring value={t.pct} size={30} stroke={5} color={areaColor('salud')} /></div>
                <span class="display-num" style={{ fontSize: 24 }}>{t.value}</span>
                <span class="tiny muted semi">{t.label} · {t.sub}</span>
              </button>
              {minus[t.key] && (h[t.key] || 0) > 0 && <button type="button" class="icon-btn plain" aria-label={minus[t.key][0]} onClick={() => save({ [t.key]: (h[t.key] || 0) - 1 }, minus[t.key][1])} style={{ position: 'absolute', right: 6, bottom: 6, width: 36, height: 36 }}><Icon name="minus" size={18} /></button>}
            </div>
          ))}
        </div>
        <MedsCard s={s} today={today} onAdd={() => setSheet({ kind: 'med', id: null })} onList={() => setSheet('meds')} />
        <HealthHighlights s={s} today={today} />
        <section class="card" aria-label="Tu sueño">
          <div class="between-c"><h2 class="h2">Tu sueño</h2><span class="small muted">meta {fmtHours(goal)}</span></div>
          <SleepWeek s={s} today={today} onEdit={editSleep} />
          <span class="tiny muted">Toca una noche para registrarla o corregirla.</span>
          <SleepInsights s={s} today={today} onWakeGoal={() => setSheet('goals')} />
          <a href="#/posada" class="link-btn" style={{ alignSelf: 'flex-start' }}><Icon name="moon" size={16} />Rutina para dormir en la posada</a>
        </section>
        <ActivityCard s={s} today={today} onLog={() => setSheet('exercise')} />
        <TrendsCard s={s} today={today} />
        <WellbeingCard s={s} today={today} />
        <span class="small muted">Frutas y verduras: la OMS recomienda al menos 400 g al día, unas 5 porciones. Una porción es una fruta mediana o media taza de vegetales.</span>
        <div class="note"><Icon name="info" size={18} /><span>En la versión para Android (APK), tus pasos y tu sueño llegarán solos desde Health Connect. Por ahora los registras aquí o con «Cuéntame qué hiciste».</span></div>
        <AreaMissions area="salud" />
        <AreaTodos area="salud" />
        <Talents area="salud" />
      </main>
      <Nav active="areas" />
      {sheet === 'goals' && <GoalsSheet onClose={() => setSheet(null)} />}
      {sheet === 'steps' && <NumberSheet title="Pasos de hoy" label="Pasos" initial={h.steps || ''} onClose={() => setSheet(null)} onSave={(v) => save({ steps: v }, 'Pasos guardados')} />}
      {sheet === 'exercise' && <ExerciseSheet onClose={() => setSheet(null)} onSave={(v, type, inten, strength) => save({ exercise: (h.exercise || 0) + v, exType: type, exIntensity: inten, strength }, `+${v} minutos de ${(EXERCISE_TYPES.find((x) => x.key === type) || { label: 'actividad' }).label.toLowerCase()}${inten === 'intensa' ? ' (cuentan doble)' : ''}`)} />}
      {sheet === 'meds' && <MedsSheet s={s} today={today} onClose={() => setSheet(null)} onEdit={(id) => setSheet({ kind: 'med', id })} />}
      {sheet && sheet.kind === 'med' && <MedSheet key={sheet.id || 'nueva'} s={s} id={sheet.id} onClose={() => setSheet(null)} />}
      {sheet === 'sleep' && <SleepSheet s={s} day={sleepDay} today={today} onClose={() => setSheet(null)} />}
    </>
  );
}

function NumberSheet({ title, label, initial, onClose, onSave }) {
  const [v, setV] = useState(String(initial));
  const n = Math.round(Number(String(v).replace(/[^\d]/g, '')) || 0);
  return (
    <Sheet onClose={onClose} label={title}>
      <SheetHead title={title} onClose={onClose} />
      <div class="field"><label for="numv">{label}</label><input id="numv" class="input big" inputMode="numeric" value={v} onInput={(e) => setV(e.currentTarget.value)} autoFocus /></div>
      <button type="button" class="btn block" disabled={!n} onClick={() => onSave(n)}><Icon name="check" size={20} />Guardar</button>
    </Sheet>
  );
}

// ---------- Relaciones ----------

const EVERY = [3, 7, 14, 30, 90];

export function People() {
  const s = useApp();
  const today = s.energy.day;
  const [sheet, setSheet] = useState(null);
  const due = duePeople(s, today);
  const bdays = upcomingBirthdays(s, today, 14);
  const done = (p) => { act((st, t, ev) => contactPerson(st, p.id, 'contacto', t, ev)); toast(`Contacto con ${p.name} · +15 XP`, 'people'); };
  return (
    <>
      <main class="screen">
        <TopBar backTo="/areas" right={<button type="button" class="icon-btn" aria-label="Agregar persona" onClick={() => setSheet({ kind: 'person' })}><Icon name="plus" /></button>} />
        <AreaHeader area="relaciones" />
        {!s.people.length && (
          <div class="empty"><Icon name="people" size={26} /><span>Agrega a las personas que quieres cuidar y cada cuánto quieres hablar con ellas. Te aviso cuando toque.</span><button type="button" class="btn sm" onClick={() => setSheet({ kind: 'person' })}>Agregar persona</button></div>
        )}
        {due.length > 0 && (
          <section class="stack" aria-label="Hoy toca">
            <h2 class="eyebrow">Hoy toca</h2>
            {due.map(({ p, since }) => (
              <div key={p.id} class="card tight">
                <div class="row">
                  <Initials name={p.name} ratio={1} />
                  <span class="stack-xs grow"><span class="strong">{p.name}</span><span class="tiny muted semi">{p.circle} · cada {plural(p.every, 'día', 'días')}</span></span>
                  <span class="tiny strong" style={{ color: 'var(--vit-ink)', textAlign: 'right' }}>{p.last ? `Hace ${plural(since, 'día', 'días')}` : 'Sin contacto aún'}</span>
                </div>
                <div class="row">
                  {p.phone ? <a class="btn sm soft grow" href={waLink(p.phone)} target="_blank" rel="noopener"><Icon name="chat" size={17} />Escribir</a> : <button type="button" class="btn sm soft grow" onClick={() => setSheet({ kind: 'person', p })}><Icon name="edit" size={17} />Agregar número</button>}
                  {p.phone && <a class="btn sm soft grow" href={`tel:${p.phone}`}><Icon name="phone" size={17} />Llamar</a>}
                  <button type="button" class="icon-btn" style={{ background: 'var(--ink)', color: 'var(--on-ink)' }} aria-label={`Marcar contacto con ${p.name}`} onClick={() => done(p)}><Icon name="check" size={20} stroke={2.6} /></button>
                </div>
              </div>
            ))}
          </section>
        )}
        {bdays.map(({ p, inDays }) => (
          <div key={p.id} class="note" style={{ background: areaSoft('relaciones'), color: areaInk('relaciones') }}>
            <Icon name="gift" size={20} /><span class="grow"><b>Cumpleaños de {p.name}</b> {inDays === 0 ? 'es hoy' : inDays === 1 ? 'es mañana' : `en ${inDays} días`}.</span>
          </div>
        ))}
        {s.people.length > 0 && (
          <section class="card flush" aria-label="Tu gente">
            <div style={{ padding: '14px 0 4px' }}><h2 class="h2">Tu gente</h2></div>
            {CIRCLES.flatMap((c) => s.people.filter((p) => p.circle === c)).map((p) => {
              const st = personStatus(p, today);
              return (
                <button key={p.id} type="button" class="lrow" onClick={() => setSheet({ kind: 'person', p })}>
                  <Initials name={p.name} ratio={st.ratio} />
                  <span class="stack-xs grow"><span class="strong">{p.name}</span><span class="tiny muted semi">{p.circle} · {p.last ? relDay(p.last, today) : 'sin contacto'}</span></span>
                  <Icon name="right" size={18} />
                </button>
              );
            })}
          </section>
        )}
        <AreaMissions area="relaciones" />
        <AreaTodos area="relaciones" />
      </main>
      <Nav active="areas" />
      {sheet && sheet.kind === 'person' && <PersonSheet p={sheet.p} onClose={() => setSheet(null)} onContact={sheet.p ? () => { done(sheet.p); setSheet(null); } : null} />}
    </>
  );
}

function Initials({ name, ratio }) {
  const parts = String(name).trim().split(/\s+/);
  const ini = ((parts[0] || '')[0] || '') + ((parts[1] || '')[0] || '');
  const col = ratio >= 1 ? 'var(--vit)' : areaColor('relaciones');
  return (
    <span style={{ position: 'relative', width: 48, height: 48, flexShrink: 0 }}>
      <Ring value={Math.min(1, ratio)} size={48} stroke={4} color={col} />
      <span style={{ position: 'absolute', inset: 6, borderRadius: 18, background: areaSoft('relaciones'), color: areaInk('relaciones'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>{ini.toUpperCase()}</span>
    </span>
  );
}

function PersonSheet({ p, onClose, onContact }) {
  const s = useApp();
  const [name, setName] = useState(p ? p.name : '');
  const [circle, setCircle] = useState(p ? p.circle : 'Familia');
  const [every, setEvery] = useState(p ? p.every : 14);
  const [phone, setPhone] = useState(p ? p.phone : '');
  const [bday, setBday] = useState(p && p.birthday ? `2000-${p.birthday}` : '');
  const save = () => {
    const data = { name, circle, every, phone, birthday: bday ? bday.slice(5) : '' };
    act((st, t) => (p ? updatePerson(st, p.id, data) : addPerson(st, data, t)));
    toast(p ? 'Guardado' : `${name.trim()} agregado a tu gente`, 'people');
    onClose();
  };
  return (
    <Sheet onClose={onClose} label={p ? p.name : 'Nueva persona'}>
      <SheetHead title={p ? p.name : 'Nueva persona'} onClose={onClose} />
      <div class="field"><label for="pn">Nombre</label><input id="pn" class="input" value={name} maxLength={40} onInput={(e) => setName(e.currentTarget.value)} autoFocus={!p} /></div>
      <div class="stack-sm"><span class="label">Círculo</span><div class="chips">{CIRCLES.map((c) => <TChip key={c} sm on={circle === c} onClick={() => setCircle(c)}>{c}</TChip>)}</div></div>
      <div class="stack-sm"><span class="label">¿Cada cuánto quieres hablar?</span><NumberChips value={every} onChange={setEvery} presets={EVERY.map((d) => ({ v: d, label: d === 7 ? 'Semanal' : d === 30 ? 'Mensual' : `${d} días` }))} format={(v) => `Cada ${v} días`} unit="días" min={1} max={365} label="Frecuencia en días" /></div>
      <div class="field"><label for="pp">Teléfono (para escribir por WhatsApp)</label><input id="pp" class="input" inputMode="tel" value={phone} onInput={(e) => setPhone(e.currentTarget.value)} placeholder="809 555 1234" /></div>
      <div class="field"><label for="pb">Cumpleaños (opcional)</label><input id="pb" type="date" class="input" value={bday} onInput={(e) => setBday(e.currentTarget.value)} /></div>
      <button type="button" class="btn block" disabled={name.trim().length < 2} onClick={save}><Icon name="check" size={20} />Guardar</button>
      {p && onContact && <button type="button" class="btn ghost block" onClick={onContact}><Icon name="people" size={18} />Marcar contacto de hoy</button>}
      {p && <button type="button" class="link-btn muted" style={{ alignSelf: 'center', color: 'var(--vit-ink)' }} onClick={async () => { if (await ask(`¿Quitar a ${p.name} de tu lista?`, { ok: 'Quitar', danger: true })) { act((st) => removePerson(st, p.id)); onClose(); } }}>Quitar de mi lista</button>}
    </Sheet>
  );
}

// ---------- Crecimiento ----------

export function Learn() {
  const s = useApp();
  const today = s.energy.day;
  const [sheet, setSheet] = useState(null);
  const books = s.books;
  const current = books.find((b) => !b.done);
  const due = dueCards(s, today);
  const weekPractice = s.practice.filter((p) => p.day >= addDays(today, -6)).reduce((a, p) => a + p.minutes, 0);
  const pagesWeek = s.reads.filter((r) => r.day >= addDays(today, -6)).reduce((a, r) => a + r.pages, 0);
  return (
    <>
      <main class="screen">
        <TopBar backTo="/areas" />
        <AreaHeader area="crecimiento" />
        <GrowthCard s={s} today={today} />
        <JournalCard s={s} today={today} />
        <WheelCard s={s} today={today} />
        <ValuesCard s={s} />
        <section class="card" aria-label="Lectura">
          <div class="between-c"><h2 class="h2">Lectura</h2><button type="button" class="link-btn" onClick={() => setSheet({ kind: 'book' })}>Nuevo libro<Icon name="plus" size={16} /></button></div>
          {current ? (
            <>
              <div class="row"><span class="tile" style={{ background: areaSoft('crecimiento'), color: areaColor('crecimiento') }}><Icon name="book" /></span><span class="stack-xs grow"><span class="strong">{current.title}</span><span class="tiny muted semi">p. {current.read} de {current.pages}</span></span></div>
              <Bar value={current.read / current.pages} size="lg" color={areaColor('crecimiento')} label={`${Math.round((current.read / current.pages) * 100)} % leído`} />
              <button type="button" class="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setSheet({ kind: 'pages', book: current })}><Icon name="plus" size={18} />Registrar páginas</button>
            </>
          ) : <span class="small muted">Agrega el libro que estás leyendo para registrar tus páginas.</span>}
          {pagesWeek > 0 && <span class="small muted">{plural(pagesWeek, 'página', 'páginas')} esta semana.</span>}
          {books.filter((b) => b.done).slice(0, 3).map((b) => <div key={b.id} class="row small"><Icon name="check" size={16} /><span class="grow">{b.title}</span><span class="tiny muted">{fmtShort(b.done)}</span></div>)}
        </section>
        <section class="card" aria-label="Tarjetas de repaso">
          <div class="between-c"><h2 class="h2">Tarjetas de repaso</h2><button type="button" class="link-btn" onClick={() => setSheet({ kind: 'card' })}>Nueva<Icon name="plus" size={16} /></button></div>
          <span class="small muted">{s.cards.length ? `${plural(due.length, 'tarjeta toca', 'tarjetas tocan')} hoy de ${s.cards.length}.` : 'Escribe una pregunta y su respuesta. Te las repito justo antes de que se te olviden.'}</span>
          {due.length > 0 && <button type="button" class="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setSheet({ kind: 'review' })}><Icon name="cards" size={18} />Repasar {due.length}</button>}
        </section>
        <section class="card" aria-label="Práctica">
          <div class="between-c"><h2 class="h2">Práctica deliberada</h2><span class="small muted">{weekPractice} min esta semana</span></div>
          <span class="small muted">Curso, idioma, instrumento o la habilidad que estés entrenando.</span>
          <button type="button" class="btn sm soft" style={{ alignSelf: 'flex-start' }} onClick={() => setSheet({ kind: 'practice' })}><Icon name="timer" size={18} />Registrar práctica</button>
        </section>
        <WinsCard scope="academico" />
        <AreaMissions area="crecimiento" />
        <AreaTodos area="crecimiento" />
        <Talents area="crecimiento" />
      </main>
      <Nav active="areas" />
      {sheet && sheet.kind === 'book' && <BookSheet onClose={() => setSheet(null)} />}
      {sheet && sheet.kind === 'pages' && <NumberSheet title={`Páginas de «${sheet.book.title}»`} label="¿Cuántas páginas leíste?" initial="" onClose={() => setSheet(null)} onSave={(v) => { act((st, t, ev) => logPages(st, sheet.book.id, v, t, ev)); toast(`+${v} páginas`, 'book'); setSheet(null); }} />}
      {sheet && sheet.kind === 'card' && <CardSheet onClose={() => setSheet(null)} />}
      {sheet && sheet.kind === 'review' && <ReviewSheet onClose={() => setSheet(null)} />}
      {sheet && sheet.kind === 'practice' && <PracticeSheet onClose={() => setSheet(null)} />}
    </>
  );
}

function BookSheet({ onClose }) {
  const [title, setTitle] = useState('');
  const [pages, setPages] = useState('');
  return (
    <Sheet onClose={onClose} label="Nuevo libro">
      <SheetHead title="Nuevo libro" onClose={onClose} />
      <div class="field"><label for="bt">Título</label><input id="bt" class="input" value={title} maxLength={80} onInput={(e) => setTitle(e.currentTarget.value)} autoFocus /></div>
      <div class="field"><label for="bp">Páginas en total</label><input id="bp" class="input" inputMode="numeric" value={pages} onInput={(e) => setPages(e.currentTarget.value)} placeholder="Ej. 280" /></div>
      <button type="button" class="btn block" disabled={title.trim().length < 2} onClick={() => { act((st) => addBook(st, { title, pages: Number(pages) || 250 })); toast('Libro agregado', 'book'); onClose(); }}><Icon name="check" size={20} />Guardar</button>
    </Sheet>
  );
}

function CardSheet({ onClose }) {
  const [front, setFront] = useState('');
  const [backT, setBack] = useState('');
  return (
    <Sheet onClose={onClose} label="Nueva tarjeta">
      <SheetHead title="Nueva tarjeta" onClose={onClose} />
      <div class="field"><label for="cf">Pregunta</label><input id="cf" class="input" value={front} maxLength={200} onInput={(e) => setFront(e.currentTarget.value)} autoFocus /></div>
      <div class="field"><label for="cb">Respuesta</label><textarea id="cb" class="input" rows={3} value={backT} maxLength={400} onInput={(e) => setBack(e.currentTarget.value)} /></div>
      <button type="button" class="btn block" disabled={!front.trim() || !backT.trim()} onClick={() => { act((st, t) => addCard(st, front.trim(), backT.trim(), t)); toast('Tarjeta creada', 'cards'); setFront(''); setBack(''); }}><Icon name="plus" size={20} />Guardar y crear otra</button>
    </Sheet>
  );
}

function ReviewSheet({ onClose }) {
  const s = useApp();
  const today = s.energy.day;
  const [queue] = useState(() => dueCards(s, today).map((c) => c.id));
  const [i, setI] = useState(0);
  const [show, setShow] = useState(false);
  const card = s.cards.find((c) => c.id === queue[i]);
  const answer = (ok) => {
    act((st, t, ev) => reviewCard(st, queue[i], ok, t, ev));
    setShow(false);
    if (i + 1 >= queue.length) { toast('Repaso completo', 'check'); onClose(); } else setI(i + 1);
  };
  if (!card) return null;
  return (
    <Sheet onClose={onClose} label="Repaso">
      <SheetHead title={`Tarjeta ${i + 1} de ${queue.length}`} onClose={onClose} />
      <div class="card" style={{ minHeight: 160, justifyContent: 'center' }}>
        <span class="h2">{card.front}</span>
        {show && <><hr class="divider" /><span style={{ fontSize: 16 }}>{card.back}</span></>}
      </div>
      {!show ? <button type="button" class="btn block" onClick={() => setShow(true)}><Icon name="eye" size={20} />Ver respuesta</button> : (
        <div class="row"><button type="button" class="btn ghost grow" onClick={() => answer(false)}>No la sabía</button><button type="button" class="btn grow" onClick={() => answer(true)}>La sabía</button></div>
      )}
    </Sheet>
  );
}

function PracticeSheet({ onClose }) {
  const [min, setMin] = useState(30);
  const [label, setLabel] = useState('');
  return (
    <Sheet onClose={onClose} label="Registrar práctica">
      <SheetHead title="Registrar práctica" onClose={onClose} />
      <div class="field"><label for="pl">¿Qué practicaste?</label><input id="pl" class="input" value={label} maxLength={60} onInput={(e) => setLabel(e.currentTarget.value)} placeholder="Ej. Inglés, Power BI, guitarra" /></div>
      <Stepper value={min} onChange={setMin} step={5} min={5} max={300} format={(v) => `${v} min`} label="Minutos" />
      <button type="button" class="btn block" onClick={() => { act((st, t, ev) => logPractice(st, min, label, t, ev)); toast(`+${min} minutos de práctica`, 'timer'); onClose(); }}><Icon name="check" size={20} />Guardar</button>
    </Sheet>
  );
}

// ---------- Laborales: enfoque ----------

export function Focus() {
  const s = useApp();
  const today = s.energy.day;
  const [label, setLabel] = useState('');
  const [minutes, setMinutes] = useState(25);
  const [run, setRun] = useState(null);
  const sessions = s.focus.filter((f) => f.day === today);
  const bosses = s.bosses.filter((b) => b.status === 'active' && b.source === 'focus');
  const closed = !!s.days[today]?.closeWork;
  return (
    <>
      <main class="screen">
        <TopBar backTo="/areas" />
        <AreaHeader area="laborales" />
        <section class="card" aria-label="Nueva sesión de enfoque">
          <h2 class="h2">Sesión de enfoque</h2>
          <div class="field"><label for="fl">¿En qué te vas a enfocar?</label><input id="fl" class="input" value={label} maxLength={60} onInput={(e) => setLabel(e.currentTarget.value)} placeholder="Ej. Informe mensual" /></div>
          <NumberChips value={minutes} onChange={setMinutes} presets={[15, 25, 50]} format={(v) => `${v} min`} unit="minutos" min={1} max={240} label="Duración" sm={false} />
          <div class="note" style={{ margin: 0 }}><Icon name="shield" size={18} /><span>Tu escudo se forja mientras no sales de la app. Si sales, se agrieta y la sesión vale menos.</span></div>
          <div class="between-c"><span class="row small muted semi" style={{ gap: 6 }}><Bolts n={1} />+{Math.round(minutes * 0.8)} XP de Oficio</span><button type="button" class="btn" onClick={() => setRun({ minutes, label: label.trim() || 'Enfoque' })}><Icon name="play" size={18} fill />Empezar</button></div>
        </section>
        {sessions.length > 0 && (
          <section class="card flush" aria-label="Sesiones de hoy">
            <div style={{ padding: '14px 0 4px' }}><h2 class="h2">Hoy</h2></div>
            {sessions.map((f) => (
              <div class="lrow" key={f.id}><span class="tile sm" style={{ background: f.broken ? 'var(--vit-soft)' : areaSoft('laborales'), color: f.broken ? 'var(--vit)' : areaColor('laborales') }}><Icon name="shield" size={18} /></span><span class="stack-xs grow"><span class="semi">{f.label || 'Enfoque'}</span><span class="tiny muted">{f.minutes} min · {f.broken ? 'escudo agrietado' : 'escudo forjado'}</span></span></div>
            ))}
          </section>
        )}
        {bosses.map((b) => (
          <a key={b.id} href={`#/jefe/${b.id}`} class="card tight" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
            <div class="between"><span class="strong">{b.title}</span><span class="strong">{Math.round(bossHP(b) * 100)} %</span></div>
            <Bar value={bossHP(b)} color="var(--vit)" label="Vida del jefe" />
          </a>
        ))}
        <button type="button" class="card tight" disabled={closed} onClick={() => { if (act((st, t, ev) => closeWorkday(st, t, ev))) toast('Jornada cerrada · +10 XP y +2 de vitalidad', 'moon'); }} style={{ flexDirection: 'row', alignItems: 'center', textAlign: 'left', color: 'var(--ink)', opacity: closed ? 0.6 : 1 }}>
          <span class="tile" style={{ background: areaSoft('laborales'), color: areaColor('laborales') }}><Icon name="moon" /></span>
          <span class="stack-xs grow"><span class="strong">{closed ? 'Jornada cerrada' : 'Cerrar la jornada'}</span><span class="small muted">Desconectarte a tiempo también suma: +10 XP y +2 de vitalidad.</span></span>
        </button>
        <WinsCard scope="profesional" />
        <AreaMissions area="laborales" />
        <AreaTodos area="laborales" />
      </main>
      <Nav active="areas" />
      {run && <FocusRun run={run} onEnd={(res) => {
        setRun(null);
        if (!res) return;
        act((st, t, ev) => finishFocus(st, res, t, ev));
        toast(res.broken ? 'Sesión guardada con el escudo agrietado' : `Escudo forjado · +${Math.round(res.minutes * 0.8)} XP`, 'shield');
      }} />}
    </>
  );
}

function FocusRun({ run, onEnd }) {
  const total = run.minutes * 60;
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [cracked, setCracked] = useState(false);
  const base = useRef({ start: Date.now(), acc: 0 });
  const hiddenAt = useRef(null);
  useEffect(() => {
    const id = setInterval(() => {
      if (paused) return;
      const e = base.current.acc + (Date.now() - base.current.start) / 1000;
      setElapsed(Math.min(total, e));
    }, 500);
    return () => clearInterval(id);
  }, [paused]);
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) hiddenAt.current = Date.now();
      else if (hiddenAt.current) {
        if (!paused && Date.now() - hiddenAt.current > 15000) setCracked(true);
        hiddenAt.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [paused]);
  useEffect(() => {
    if (elapsed >= total) { vibrate([60, 60, 60]); onEnd({ minutes: run.minutes, label: run.label, broken: cracked }); }
  }, [elapsed]);
  const togglePause = () => {
    if (paused) { base.current.start = Date.now(); setPaused(false); } else { base.current.acc += (Date.now() - base.current.start) / 1000; setPaused(true); }
  };
  const left = Math.max(0, total - elapsed);
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(Math.floor(left % 60)).padStart(2, '0');
  return (
    <div class="focus-full" role="dialog" aria-modal="true" aria-label="Sesión de enfoque">
      <span class="eyebrow" style={{ color: '#A6A8AF' }}>Enfocado en · {run.label}</span>
      <Ring value={elapsed / total} size={230} stroke={14} color={cracked ? '#F4525A' : '#FBC031'} track="rgba(255,255,255,0.12)">
        <text x="115" y="122" text-anchor="middle" font-family="Bricolage Grotesque, sans-serif" font-size="50" font-weight="800" fill="#F2F2EF">{mm}:{ss}</text>
        <text x="115" y="152" text-anchor="middle" font-family="Figtree, sans-serif" font-size="14" font-weight="600" fill="#A6A8AF">de {run.minutes} min</text>
      </Ring>
      <span style={{ maxWidth: 300, color: cracked ? '#FEBAB7' : '#A6A8AF', fontSize: 15, lineHeight: 1.45 }}>
        {cracked ? 'Saliste de la app y el escudo se agrietó. Termina igual: todo esfuerzo cuenta.' : paused ? 'En pausa. El escudo espera.' : 'Tu escudo se forja mientras no sales de la app.'}
      </span>
      <div class="row" style={{ width: '100%', maxWidth: 340 }}>
        <button type="button" class="btn grow" style={{ background: 'rgba(255,255,255,0.12)', color: '#F2F2EF' }} onClick={togglePause}><Icon name={paused ? 'play' : 'pause'} size={20} />{paused ? 'Seguir' : 'Pausa'}</button>
        <button type="button" class="btn grow" style={{ background: '#FBC031', color: '#141519' }} onClick={() => onEnd(elapsed >= 60 ? { minutes: Math.max(1, Math.round(elapsed / 60)), label: run.label, broken: true } : null)}><Icon name="check" size={20} />Terminar</button>
      </div>
    </div>
  );
}
