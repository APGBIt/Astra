import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Nav, TopBar, Sheet, SheetHead, TChip, toast, ask, areaColor, areaSoft, areaInk, plural } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { fmtDay, monthName, monthKey, relDay } from '../app/dates.js';
import { JOURNAL_KINDS } from '../game/wellness.js';
import { addJournal, updateJournal, removeJournal, promptOfDay, setIntent, goodThings } from '../game/mind.js';

// Diario: pregunta del día, escritura libre, tres cosas buenas y lo que aprendiste. Solo vive en tu teléfono
// (y en tu Drive si lo conectas); no va a las tablas legibles.

const KIND_LABEL = { libre: 'Libre', pregunta: 'Pregunta del día', gratitud: 'Tres cosas buenas', aprendizaje: 'Lo que aprendí', nota: 'Nota' };
const KIND_ICON = { libre: 'edit', pregunta: 'sparkle', gratitud: 'heart', aprendizaje: 'book', nota: 'note' };
const PLACEHOLDER = { libre: 'Escribe lo que quieras…', pregunta: 'Escribe tu respuesta…', aprendizaje: '¿Qué aprendiste hoy? De un libro, de una persona, de un error…' };

export function Journal({ query }) {
  const s = useApp();
  const today = s.energy.day;
  const k0 = query && query.get('k');
  const [kind, setKind] = useState(k0 === 'gratitud' ? 'gratitud' : k0 === 'aprender' ? 'aprendizaje' : 'pregunta');
  const [offset, setOffset] = useState(0);
  const [text, setText] = useState('');
  const [items, setItems] = useState(['', '', '']);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [limit, setLimit] = useState(20);
  const prompt = promptOfDay(today, offset);
  const wroteToday = s.journal.some((j) => j.day === today && j.kind !== 'nota');
  const intent = s.mind.intents[today];
  const ok = kind === 'gratitud' ? items.some((x) => x.trim()) : text.trim().length > 0;
  const save = () => {
    const e = act((st, t, ev) => addJournal(st, { kind, text, prompt, items }, t, ev));
    if (!e) return;
    toast(wroteToday ? 'Guardado en tu diario' : 'Guardado · +10 XP de Sabiduría', 'book');
    setText(''); setItems(['', '', '']);
  };
  const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const nq = norm(q.trim());
  const list = s.journal.filter((j) => !nq || norm(`${j.text} ${j.prompt || ''} ${(j.items || []).join(' ')}`).includes(nq));
  const shown = list.slice(0, limit);
  const groups = [];
  for (const j of shown) {
    const mk = monthKey(j.day);
    if (!groups.length || groups[groups.length - 1].mk !== mk) groups.push({ mk, list: [] });
    groups[groups.length - 1].list.push(j);
  }
  const monthDays = new Set(s.journal.filter((j) => monthKey(j.day) === monthKey(today)).map((j) => j.day)).size;
  return (
    <>
      <main class="screen">
        <TopBar backTo="/aprender" />
        <div class="stack-xs">
          <span class="eyebrow" style={{ color: areaInk('crecimiento') }}>Sabiduría · Crecimiento personal</span>
          <h1 class="h1">Diario</h1>
          <p class="lead">Escribir te ayuda a entender lo que sientes y a ver cuánto avanzas.</p>
        </div>
        {intent && (
          <div class="note" style={{ background: areaSoft('emocional'), color: areaInk('emocional') }}>
            <Icon name="target" size={18} /><span><b>Tu intención de hoy:</b> {intent.text}{intent.done === 'si' ? ' · cumplida' : ''}</span>
          </div>
        )}
        <section class="card" aria-label="Escribir">
          <div class="chips scroll" role="group" aria-label="Tipo de entrada" style={{ margin: '0 -20px', padding: '2px 20px' }}>
            {JOURNAL_KINDS.map((x) => <TChip key={x.id} sm icon={x.icon} on={kind === x.id} onClick={() => setKind(x.id)}>{x.label}</TChip>)}
          </div>
          {kind === 'pregunta' && (
            <div class="stack-xs">
              <span class="h2" style={{ fontSize: 19, lineHeight: 1.3 }}>{prompt}</span>
              <button type="button" class="link-btn" style={{ alignSelf: 'flex-start', minHeight: 30 }} onClick={() => setOffset(offset + 1)}><Icon name="repeat" size={15} />Otra pregunta</button>
            </div>
          )}
          {kind === 'gratitud' ? (
            <div class="stack-sm">
              <span class="small muted">Tres cosas que salieron bien hoy, grandes o pequeñas, y si quieres, por qué pasaron.</span>
              {items.map((v, i) => <input key={i} class="input" value={v} maxLength={200} placeholder={`${i + 1}.`} aria-label={`Cosa buena ${i + 1}`} onInput={(e) => setItems(items.map((x, j) => (j === i ? e.currentTarget.value : x)))} />)}
              <textarea class="input" rows={2} value={text} maxLength={2000} onInput={(e) => setText(e.currentTarget.value)} placeholder="¿Por qué crees que pasaron? (opcional)" aria-label="Por qué pasaron" />
            </div>
          ) : <textarea class="input" rows={6} value={text} maxLength={4000} onInput={(e) => setText(e.currentTarget.value)} placeholder={PLACEHOLDER[kind]} aria-label="Tu entrada" />}
          <button type="button" class="btn" style={{ alignSelf: 'flex-start' }} disabled={!ok} onClick={save}><Icon name="check" size={18} />Guardar{wroteToday ? '' : ' · +10 XP'}</button>
        </section>
        <div class="kpis">
          <div class="kpi"><span class="v tab-num">{s.journal.length}</span><span class="l">entradas</span></div>
          <div class="kpi"><span class="v tab-num">{monthDays}</span><span class="l">días este mes</span></div>
          <div class="kpi"><span class="v tab-num">{goodThings(s)}</span><span class="l">cosas buenas</span></div>
        </div>
        {s.journal.length > 0 && (
          <section class="stack-sm" aria-label="Tus entradas">
            <input class="input" type="search" value={q} onInput={(e) => setQ(e.currentTarget.value)} placeholder="Buscar en tu diario" aria-label="Buscar en tu diario" />
            {!list.length && <p class="small muted">Nada con «{q}».</p>}
            {groups.map((g) => (
              <section key={g.mk} class="card flush" aria-label={monthName(g.mk)}>
                <div style={{ padding: '14px 0 4px' }}><h2 class="eyebrow" style={{ textTransform: 'capitalize' }}>{monthName(g.mk)}</h2></div>
                {g.list.map((j) => (
                  <button key={j.id} type="button" class="lrow jrow" onClick={() => setOpen(j.id)}>
                    <span class="tile sm" style={{ background: areaSoft('crecimiento'), color: areaColor('crecimiento') }}><Icon name={KIND_ICON[j.kind] || 'edit'} size={16} /></span>
                    <span class="stack-xs grow" style={{ minWidth: 0 }}>
                      <span class="tiny muted semi">{relDay(j.day, today)} · {KIND_LABEL[j.kind] || 'Entrada'}</span>
                      {j.prompt && <span class="small semi clamp2">{j.prompt}</span>}
                      {(j.items || []).length > 0 && <span class="small clamp2">{j.items.join(' · ')}</span>}
                      {j.text && <span class="small muted clamp3">{j.text}</span>}
                    </span>
                  </button>
                ))}
              </section>
            ))}
            {list.length > limit && <button type="button" class="btn ghost block" onClick={() => setLimit(limit + 30)}>Ver más</button>}
          </section>
        )}
        <p class="tiny muted">Tu diario se guarda en este teléfono y, si sincronizas, en tu propio Drive. No aparece en las tablas que se pueden leer.</p>
      </main>
      <Nav active="areas" />
      {open && <EntrySheet id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function EntrySheet({ id, onClose }) {
  const s = useApp();
  const j = s.journal.find((x) => x.id === id);
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(j ? j.text : '');
  const [items, setItems] = useState(j && j.items ? [...j.items] : []);
  if (!j) return null;
  const save = () => { act((st) => updateJournal(st, id, { text, items: items.length ? items : undefined })); toast('Guardado', 'check'); setEdit(false); };
  const del = async () => { if (await ask('¿Borrar esta entrada del diario?', { ok: 'Borrar', danger: true })) { act((st) => removeJournal(st, id)); onClose(); } };
  return (
    <Sheet onClose={onClose} label="Entrada del diario">
      <SheetHead title={fmtDay(j.day)} onClose={onClose} />
      <span class="chip sm" style={{ alignSelf: 'flex-start' }}><Icon name={KIND_ICON[j.kind] || 'edit'} size={13} />{KIND_LABEL[j.kind] || 'Entrada'}</span>
      {j.prompt && <span class="h2" style={{ fontSize: 18 }}>{j.prompt}</span>}
      {edit ? (
        <>
          {items.map((v, i) => <input key={i} class="input" value={v} maxLength={200} onInput={(e) => setItems(items.map((x, k) => (k === i ? e.currentTarget.value : x)))} aria-label={`Cosa buena ${i + 1}`} />)}
          <textarea class="input" rows={7} value={text} maxLength={4000} onInput={(e) => setText(e.currentTarget.value)} aria-label="Texto" />
          <div class="row"><button type="button" class="btn grow" onClick={save}><Icon name="check" size={18} />Guardar</button><button type="button" class="btn ghost" onClick={() => setEdit(false)}>Cancelar</button></div>
        </>
      ) : (
        <>
          {(j.items || []).length > 0 && <ol class="steps">{j.items.map((x, i) => <li key={i}>{x}</li>)}</ol>}
          {j.text && <p style={{ whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.55 }}>{j.text}</p>}
          <div class="row wrap" style={{ justifyContent: 'center', gap: 18 }}>
            <button type="button" class="link-btn" onClick={() => setEdit(true)}><Icon name="edit" size={16} />Editar</button>
            <button type="button" class="link-btn" style={{ color: 'var(--vit-ink)' }} onClick={del}><Icon name="trash" size={16} />Borrar</button>
          </div>
        </>
      )}
    </Sheet>
  );
}

// Para Hoy (por la mañana): una intención para el día.
export function IntentPrompt() {
  const [v, setV] = useState('');
  const save = () => { if (!v.trim()) return; act((st, t, ev) => setIntent(st, v, t, ev)); toast('Intención guardada · la revisas en la posada', 'target'); };
  return (
    <section class="card" aria-label="Intención del día" style={{ background: areaSoft('emocional'), borderColor: 'transparent' }}>
      <div class="row-top">
        <span class="tile" style={{ background: 'var(--surface)', color: areaColor('emocional') }}><Icon name="target" /></span>
        <div class="stack-xs grow"><span class="strong">¿Cuál es tu intención para hoy?</span><span class="small" style={{ color: areaInk('emocional') }}>Una frase: cómo quieres vivir el día, no una tarea.</span></div>
      </div>
      <div class="row" style={{ gap: 8 }}>
        <input class="input grow" value={v} maxLength={160} onInput={(e) => setV(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} placeholder="Ej. Escuchar con calma" aria-label="Tu intención" />
        <button type="button" class="btn sm" disabled={!v.trim()} onClick={save}>Guardar</button>
      </div>
    </section>
  );
}

// Para la pantalla de Crecimiento: la pregunta del día y cómo vas.
export function JournalCard({ s, today }) {
  const days = new Set(s.journal.filter((j) => monthKey(j.day) === monthKey(today)).map((j) => j.day)).size;
  const wrote = s.journal.some((j) => j.day === today && j.kind !== 'nota');
  return (
    <a href="#/diario" class="card" aria-label="Diario" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
      <div class="between-c"><h2 class="h2">Diario</h2><span class="small muted">{plural(days, 'día', 'días')} este mes</span></div>
      <span class="small muted">Pregunta de hoy</span>
      <span class="strong" style={{ fontSize: 16, lineHeight: 1.35 }}>{promptOfDay(today)}</span>
      <span class="row small strong" style={{ gap: 6, color: areaInk('crecimiento') }}><Icon name={wrote ? 'check' : 'edit'} size={16} />{wrote ? 'Ya escribiste hoy' : 'Escribir · +10 XP'}</span>
    </a>
  );
}
