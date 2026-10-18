import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Nav, TopBar, Bar, Sheet, SheetHead, TChip, Switch, Avatar, toast, ask, areaColor, areaSoft, areaInk, plural, focusOnMount } from '../ui/kit.jsx';
import { norm } from '../game/parse.js';
import { act, useApp } from '../app/store.js';
import { PhotoStrip, PhotoThumb } from '../ui/photos.jsx';
import { back, go } from '../app/router.js';
import { diffDays, fmtShort, fmtDay } from '../app/dates.js';
import { AREA, AREAS, RECORD_ICONS, RECORD_XP } from '../game/content.js';
import {
  recordSection, recordSchema, recordAlerts, recordProgress, setRecordField, addRecordField, updateRecordField, removeRecordField,
  addRecordItem, updateRecordItem, removeRecordItem, addRecordSection, updateRecordSection, removeRecordSection,
  alertToTodo, alertStatus, waLink,
} from '../game/logic.js';

// Oculta los números salvo los últimos 4 y deja las letras: «001-1234567-8» → «•••• 567-8»,
// «Popular 1234567» → «Popular •••• 4567». Un dato marcado como oculto sin números largos se oculta completo.
export function maskValue(v, strict = true) {
  const s = String(v || '');
  if (!s) return '';
  const idx = [];
  for (let i = 0; i < s.length; i++) if (s[i] >= '0' && s[i] <= '9') idx.push(i);
  if (idx.length <= 4) return strict ? '••••' : s;
  const keepFrom = idx[idx.length - 4];
  return (s.slice(0, keepFrom).replace(/\d[\d\s./-]*/g, '•••• ') + s.slice(keepFrom)).replace(/\s+/g, ' ').trim();
}

// «Vence en 3 días», «Próximo mañana», «Fecha clave hoy», «Venció hace 2 días».
function dueText(n, label = 'Vence') {
  const days = (k) => plural(k, 'día', 'días');
  const when = n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${days(n)}`;
  if (label === 'Vence') return n < 0 ? `Venció hace ${days(-n)}` : `Vence ${when}`;
  if (n < 0) return label === 'Próximo' ? `Atrasado ${days(-n)}` : `Pasó hace ${days(-n)}`;
  return `${label} ${when}`;
}
const dueTone = (n) => (n < 0 ? 'vit' : n <= 30 ? 'xp' : '');

// Fechas que piden atención y todavía no están en pendientes ni atendidas.
export function openAlerts(s, today, within = 30) {
  return recordAlerts(s, today, within).filter((a) => !alertStatus(s, a.sec.id, a.item));
}

function SecTile({ sec, size = '' }) {
  return <span class={`tile ${size}`} style={{ background: areaSoft(sec.area), color: areaColor(sec.area) }}><Icon name={sec.icon || 'folder'} size={size === 'sm' ? 18 : 22} /></span>;
}

function sectionSummary(s, sec, today) {
  if (sec.kind === 'fields') {
    const n = sec.fields.filter((f) => String(f.value || '').trim()).length;
    return n ? `${n} de ${sec.fields.length} datos` : 'Sin datos todavía';
  }
  const sch = recordSchema(sec);
  if (!sec.items.length) return 'Sin registros';
  const next = sch.alert ? sec.items.filter((i) => i.end).map((i) => ({ i, n: diffDays(today, i.end) })).sort((a, b) => a.n - b.n)[0] : null;
  const base = plural(sec.items.length, sch.item, sch.items || `${sch.item}s`);
  return next ? `${base} · ${next.i.title}, ${dueText(next.n, sch.alert).toLowerCase()}` : base;
}

// ---------- Tarjeta resumen (Personaje y Áreas) ----------

export function RecordCard() {
  const s = useApp();
  const today = s.energy.day;
  const p = recordProgress(s);
  const alerts = openAlerts(s, today);
  const late = alerts.filter((a) => a.inDays < 0).length;
  const alertText = alerts.length === 1
    ? `${alerts[0].item.title}: ${dueText(alerts[0].inDays, recordSchema(alerts[0].sec).alert).toLowerCase()}`
    : late ? `${plural(late, 'fecha vencida', 'fechas vencidas')}${alerts.length > late ? ` y ${plural(alerts.length - late, 'próxima', 'próximas')}` : ''}`
      : `${plural(alerts.length, 'fecha próxima', 'fechas próximas')} por atender`;
  return (
    <a href="#/expediente" class="card" style={{ textDecoration: 'none', color: 'var(--ink)' }} aria-label="Expediente personal">
      <div class="row">
        <span class="tile" style={{ background: 'var(--soft)', color: 'var(--ink)' }}><Icon name="folder" /></span>
        <span class="stack-xs grow"><span class="strong">Expediente personal</span><span class="small muted">Datos, documentos, salud, formación y trayectoria</span></span>
        <Icon name="right" size={18} />
      </div>
      <div class="stack-xs">
        <div class="between tiny strong muted"><span>Completo al {Math.round(p.pct * 100)} %</span><span>{p.filled} de {p.total}</span></div>
        <Bar value={p.pct} color="var(--ink)" label={`Expediente completo al ${Math.round(p.pct * 100)} %`} />
      </div>
      {alerts.length > 0 && <span class="row small strong" style={{ gap: 6, color: alerts.some((a) => a.inDays < 0) ? 'var(--vit-ink)' : 'var(--xp-ink)' }}><Icon name="bell" size={16} />{alertText}</span>}
    </a>
  );
}

// ---------- Aviso en Hoy: vencimientos cercanos ----------

export function RecordAlertsNote() {
  const s = useApp();
  const today = s.energy.day;
  const alerts = openAlerts(s, today);
  if (!alerts.length) return null;
  const a = alerts[0];
  const sch = recordSchema(a.sec);
  return (
    <section class={`note ${a.inDays < 0 ? 'tone-vit' : 'tone-xp'}`} aria-label="Fechas del expediente">
      <Icon name="bell" size={20} />
      <span class="stack-sm grow">
        <span><b>{a.item.title}</b>: {dueText(a.inDays, sch.alert).toLowerCase()}.{alerts.length > 1 ? ` Y ${plural(alerts.length - 1, 'fecha más', 'fechas más')} en tu expediente.` : ''}</span>
        <span class="row wrap" style={{ gap: 14 }}>
          <button type="button" class="btn sm" onClick={() => { const t = act((st, d) => alertToTodo(st, a.sec.id, a.item.id, d)); if (t) toast(`En pendientes: ${t.title}`, 'list'); }}><Icon name="plus" size={16} />A pendientes</button>
          <a class="link-btn" href="#/expediente" style={{ color: 'inherit' }}>Ver expediente<Icon name="right" size={15} /></a>
        </span>
      </span>
    </section>
  );
}

// ---------- Ficha: lo esencial a la mano (también para una emergencia) ----------

function fieldValue(s, secId, label) {
  const sec = recordSection(s, secId);
  const f = sec && sec.kind === 'fields' && sec.fields.find((x) => norm(x.label) === norm(label));
  return f ? String(f.value || '').trim() : '';
}
const clip = (t, n) => (t.length > n ? `${t.slice(0, n - 1).trim()}…` : t);

function Ficha({ s, p }) {
  const name = fieldValue(s, 'datos', 'Nombre completo') || s.profile.name;
  const birth = fieldValue(s, 'datos', 'Fecha de nacimiento');
  const job = fieldValue(s, 'datos', 'Profesión u ocupación');
  const blood = fieldValue(s, 'salud', 'Tipo de sangre');
  const allergies = fieldValue(s, 'salud', 'Alergias');
  const ars = fieldValue(s, 'salud', 'Seguro médico (ARS)');
  const em = recordSection(s, 'emergencia');
  const contact = em && em.kind === 'list' ? em.items.find((i) => i.phone) : null;
  const sub = [/^\d{4}-\d{2}-\d{2}$/.test(birth) ? `${age(birth)} años` : '', job].filter(Boolean).join(' · ');
  const facts = [blood && ['drop', `Sangre ${blood}`], allergies && ['info', `Alergias: ${clip(allergies, 28)}`], ars && ['shield', clip(ars, 24)]].filter(Boolean);
  const pct = Math.round(p.pct * 100);
  return (
    <section class="card ficha" aria-label="Tu ficha">
      <div class="row" style={{ gap: 14 }}>
        <Avatar name={name} size={56} />
        <div class="stack-xs grow">
          <span class="h2">{name || 'Tu nombre'}</span>
          {sub ? <span class="small muted semi">{sub}</span> : <a class="small strong" href="#/expediente/datos" style={{ color: 'var(--ink)' }}>Completa tus datos personales</a>}
        </div>
      </div>
      {facts.length > 0 && <div class="chips" style={{ gap: 6 }}>{facts.map(([ic, t]) => <span key={t} class="chip"><Icon name={ic} size={14} />{t}</span>)}</div>}
      {contact ? (
        <div class="between-c panel" style={{ padding: '8px 8px 8px 14px', borderRadius: 18 }}>
          <span class="stack-xs grow"><span class="tiny strong muted">En caso de emergencia</span><span class="strong">{contact.title}{contact.detail ? <span class="muted semi"> · {contact.detail}</span> : ''}</span></span>
          <span class="row" style={{ gap: 6 }}>
            <a class="icon-btn" href={`tel:${contact.phone}`} aria-label={`Llamar a ${contact.title}`} style={{ background: 'var(--surface)' }}><Icon name="phone" size={18} /></a>
            <a class="icon-btn" href={waLink(contact.phone)} target="_blank" rel="noopener" aria-label={`Escribir a ${contact.title} por WhatsApp`} style={{ background: 'var(--surface)' }}><Icon name="chat" size={18} /></a>
          </span>
        </div>
      ) : (
        <a class="link-btn muted" href="#/expediente/emergencia" style={{ alignSelf: 'flex-start' }}><Icon name="plus" size={16} />Agrega un contacto de emergencia</a>
      )}
      <div class="stack-xs">
        <div class="between tiny strong muted"><span>Completo al {pct} %</span><span>{p.filled} de {p.total}</span></div>
        <Bar value={p.pct} color="var(--ink)" label={`Expediente completo al ${pct} %`} />
        <span class="tiny muted">Cada dato nuevo suma +{RECORD_XP.field} XP y cada registro +{RECORD_XP.item} XP.</span>
      </div>
    </section>
  );
}

// ---------- Pantalla principal del expediente ----------

export function Record() {
  const s = useApp();
  const today = s.energy.day;
  const p = recordProgress(s);
  const alerts = recordAlerts(s, today, 45);
  const hide = s.settings.hideNumbers !== false;
  const [adding, setAdding] = useState(false);
  return (
    <>
      <main class="screen">
        <TopBar backTo="/personaje" right={
          <button type="button" class="icon-btn" aria-pressed={hide ? 'true' : 'false'} aria-label={hide ? 'Mostrar números ocultos' : 'Ocultar números'} onClick={() => act((st) => { st.settings.hideNumbers = !hide; })}><Icon name={hide ? 'eyeoff' : 'eye'} /></button>
        } />
        <div class="stack-sm">
          <h1 class="h1">Expediente personal</h1>
          <p class="lead">Tus datos, documentos y trayectoria en un solo lugar. Te aviso antes de que algo venza.</p>
        </div>
        <Ficha s={s} p={p} />

        {alerts.length > 0 && (
          <section class="stack-sm" aria-label="Próximas fechas">
            <h2 class="eyebrow">Próximas fechas</h2>
            <div class="card flush">
              {alerts.map((a) => {
                const sch = recordSchema(a.sec);
                const st = alertStatus(s, a.sec.id, a.item);
                return (
                  <div key={a.item.id} class="lrow" style={{ alignItems: 'flex-start', minHeight: 64 }}>
                    <SecTile sec={a.sec} size="sm" />
                    <span class="stack-xs grow">
                      <a href={`#/expediente/${a.sec.id}`} class="stack-xs" style={{ textDecoration: 'none', color: 'inherit' }}>
                        <span class="strong">{a.item.title}</span>
                        <span class="tiny strong" style={{ color: a.inDays < 0 ? 'var(--vit-ink)' : a.inDays <= 30 ? 'var(--xp-ink)' : 'var(--muted)' }}>{dueText(a.inDays, sch.alert)} · {fmtShort(a.item.end)}</span>
                      </a>
                      {st === 'pending' ? <span class="tiny strong row" style={{ gap: 4, color: 'var(--good-ink)', minHeight: 32 }}><Icon name="check" size={14} />Ya está en tus pendientes</span>
                        : st === 'done' ? <a class="tiny strong row" href={`#/expediente/${a.sec.id}`} style={{ gap: 4, color: 'var(--good-ink)', minHeight: 32, textDecoration: 'none' }}><Icon name="check" size={14} />Atendido · pon la fecha nueva</a>
                        : <button type="button" class="link-btn" style={{ alignSelf: 'flex-start', fontSize: 13.5 }} onClick={() => { const t = act((st, d) => alertToTodo(st, a.sec.id, a.item.id, d)); if (t) toast(`En pendientes: ${t.title}`, 'list'); }}><Icon name="plus" size={15} />Pasar a pendientes</button>}
                    </span>
                    <a href={`#/expediente/${a.sec.id}`} class="icon-btn plain" aria-label={`Abrir ${a.sec.title}`}><Icon name="right" size={18} /></a>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section class="stack" aria-label="Secciones">
          {s.record.sections.map((sec) => (
            <a key={sec.id} href={`#/expediente/${sec.id}`} class="card tight" style={{ flexDirection: 'row', alignItems: 'center', textDecoration: 'none', color: 'var(--ink)' }}>
              <SecTile sec={sec} />
              <span class="stack-xs grow"><span class="strong">{sec.title}</span><span class="small muted">{sectionSummary(s, sec, today)}</span></span>
              <Icon name="right" size={18} />
            </a>
          ))}
        </section>
        <button type="button" class="btn ghost block" onClick={() => setAdding(true)}><Icon name="plus" size={18} />Nueva sección</button>
        <div class="note"><Icon name="lock" size={20} /><span>El expediente vive solo en este teléfono y viaja en tu copia de seguridad (Ajustes). Guarda esa copia en un lugar seguro. Toca el ojo de arriba para ocultar o mostrar los números.</span></div>
      </main>
      <Nav active="personaje" fab={null} />
      {adding && <SectionSheet onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); go(`/expediente/${id}`); }} />}
    </>
  );
}

// ---------- Una sección ----------

export function RecordSection({ id }) {
  const s = useApp();
  const today = s.energy.day;
  const sec = recordSection(s, id);
  const hide = s.settings.hideNumbers !== false;
  const [sheet, setSheet] = useState(null);
  const [edit, setEdit] = useState(false);
  if (!sec) return <main class="screen no-nav"><TopBar backTo="/expediente" /><div class="empty">Esta sección ya no existe.</div></main>;
  const sch = sec.kind === 'list' ? recordSchema(sec) : null;
  return (
    <>
      <main class="screen">
        <TopBar backTo="/expediente" right={
          <div class="row" style={{ gap: 6 }}>
            <button type="button" class="icon-btn" aria-pressed={hide ? 'true' : 'false'} aria-label={hide ? 'Mostrar números ocultos' : 'Ocultar números'} onClick={() => act((st) => { st.settings.hideNumbers = !hide; })}><Icon name={hide ? 'eyeoff' : 'eye'} /></button>
            <button type="button" class="icon-btn" aria-label="Opciones de la sección" onClick={() => setSheet({ kind: 'section' })}><Icon name="dots" /></button>
          </div>
        } />
        <div class="row" style={{ gap: 14 }}>
          <SecTile sec={sec} size="lg" />
          <div class="stack-xs grow"><h1 class="h1 sm">{sec.title}</h1><span class="small semi" style={{ color: areaInk(sec.area) }}>{sec.area ? `Suma XP a ${AREA[sec.area].attr}` : 'Suma XP a tu nivel'}</span></div>
        </div>

        {sec.kind === 'fields' && (
          <>
            <section class="card" aria-label={sec.title} style={{ gap: 4 }}>
              {!sec.fields.length && <p class="small muted">Esta sección no tiene datos todavía. Agrega el primero abajo.</p>}
              {sec.fields.map((f) => <FieldRow key={f.id} sec={sec} f={f} hide={hide} edit={edit} onEdit={() => setSheet({ kind: 'field', f })} />)}
            </section>
            <div class="row" style={{ justifyContent: 'space-between' }}>
              <button type="button" class="btn sm soft" onClick={() => setSheet({ kind: 'field' })}><Icon name="plus" size={18} />Agregar dato</button>
              {sec.fields.length > 0 && <button type="button" class="btn sm ghost" aria-pressed={edit ? 'true' : 'false'} onClick={() => setEdit(!edit)}><Icon name={edit ? 'check' : 'edit'} size={18} />{edit ? 'Listo' : 'Editar datos'}</button>}
            </div>
          </>
        )}

        {(sec.id === 'hitos' || sec.id === 'trayectoria') && (
          <a href="#/logros" class="row" style={{ gap: 10, minHeight: 52, padding: '8px 14px', borderRadius: 16, background: 'var(--laborales-soft)', color: 'var(--laborales-ink)', textDecoration: 'none' }}>
            <Icon name="trophy" size={19} /><span class="grow semi">{(s.wins || []).length ? `Tus logros con impacto y habilidades · ${(s.wins || []).length}` : 'Anota tus logros con su impacto en «Logros»: listos para tu evaluación y tu CV'}</span><Icon name="right" size={16} />
          </a>
        )}

        {sec.kind === 'list' && (
          <>
            {!sec.items.length && <div class="empty"><Icon name={sec.icon || 'folder'} size={26} /><span>Todavía no hay registros. {sch.alert ? `Anota la fecha «${sch.labels.end.toLowerCase()}» y te aviso a tiempo.` : ''}</span></div>}
            {sec.items.length > 0 && (
              <section class="card flush" aria-label={sec.title}>
                {sortedItems(sec, sch).map((it) => <ItemRow key={it.id} s={s} sec={sec} sch={sch} it={it} today={today} hide={hide} onOpen={() => setSheet({ kind: 'item', it })} />)}
              </section>
            )}
            <button type="button" class="btn block" onClick={() => setSheet({ kind: 'item' })}><Icon name="plus" size={20} />Agregar {sch.item}</button>
          </>
        )}
      </main>
      <Nav active="personaje" fab={null} />
      {sheet && sheet.kind === 'field' && <FieldSheet sec={sec} f={sheet.f} onClose={() => setSheet(null)} />}
      {sheet && sheet.kind === 'item' && <ItemSheet sec={sec} sch={sch} it={sheet.it} onClose={() => setSheet(null)} />}
      {sheet && sheet.kind === 'section' && <SectionSheet sec={sec} onClose={() => setSheet(null)} onDeleted={() => { setSheet(null); go('/expediente', { replace: true }); }} />}
    </>
  );
}

function sortedItems(sec, sch) {
  const list = [...sec.items];
  if (sch.alert) return list.sort((a, b) => (a.end || '9999') < (b.end || '9999') ? -1 : 1);
  if (sec.schema === 'jobs' || sec.schema === 'study' || sec.schema === 'milestones') return list.sort((a, b) => ((b.end || b.start || '9999') < (a.end || a.start || '9999') ? -1 : 1));
  return list;
}

function FieldRow({ sec, f, hide, edit, onEdit }) {
  const [draft, setDraft] = useState(f.value || '');
  const [reveal, setReveal] = useState(false);
  const focused = useRef(false);
  const saved = useRef(f.value || '');
  const latest = useRef(draft);
  latest.current = draft;
  // Si el dato cambia por fuera (por ejemplo, al recuperar una copia), se muestra, salvo que estés escribiendo aquí.
  useEffect(() => { saved.current = f.value || ''; if (!focused.current) setDraft(f.value || ''); }, [f.value]);
  const commit = (v = latest.current) => {
    if (v === saved.current) return;
    saved.current = v;
    act((st, t, ev) => setRecordField(st, sec.id, f.id, v, t, ev));
  };
  // Se guarda al dejar de escribir, al salir del campo y al salir de la pantalla (aunque uses el botón atrás del teléfono).
  useEffect(() => { const id = setTimeout(() => commit(draft), 800); return () => clearTimeout(id); }, [draft]);
  useEffect(() => () => commit(latest.current), []);
  const masked = f.secret && hide && !reveal && f.value;
  const inputId = `f-${f.id}`;
  return (
    <div class="rfield">
      <div class="between-c">
        <label for={inputId} class="small semi muted">{f.label}{f.secret && <Icon name="lock" size={12} style={{ marginLeft: 5, verticalAlign: -1 }} label="Dato oculto" />}</label>
        {edit ? <button type="button" class="link-btn" style={{ minHeight: 28 }} onClick={onEdit}><Icon name="edit" size={14} />Editar</button>
          : !f.xp && !f.value && <span class="tiny strong" style={{ color: 'var(--xp-ink)' }}>+{RECORD_XP.field} XP</span>}
      </div>
      {masked ? (
        <button type="button" class="rvalue masked" onClick={() => setReveal(true)} aria-label={`Mostrar ${f.label}`}>
          <span class="grow" style={{ textAlign: 'left' }}>{maskValue(f.value)}</span><Icon name="eye" size={18} />
        </button>
      ) : f.type === 'long' ? (
        <textarea id={inputId} class="input" rows={3} value={draft} maxLength={2000} onFocus={() => { focused.current = true; }} onInput={(e) => setDraft(e.currentTarget.value)} onBlur={() => { focused.current = false; commit(); }} placeholder="Escribe aquí" />
      ) : (
        <input id={inputId} class="input" type={f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text'} inputMode={f.type === 'tel' ? 'tel' : undefined} autoComplete="off" value={draft} maxLength={200}
          onFocus={() => { focused.current = true; }}
          onInput={(e) => { setDraft(e.currentTarget.value); if (f.type === 'date') commit(e.currentTarget.value); }} onBlur={() => { focused.current = false; commit(); setReveal(false); }} placeholder={f.type === 'date' ? '' : 'Sin dato'} />
      )}
      {f.type === 'date' && f.value && /fecha de nacimiento/i.test(f.label) && <span class="tiny muted">{fmtDay(f.value, { weekdayName: false })} · {age(f.value)} años</span>}
    </div>
  );
}

function age(day) {
  const [y, m, d] = day.split('-').map(Number);
  const now = new Date();
  let a = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) a -= 1;
  return Math.max(0, a);
}

function ItemRow({ s, sec, sch, it, today, hide, onOpen }) {
  const n = it.end ? diffDays(today, it.end) : null;
  const detail = it.detail ? (sch.secretDetail && hide ? maskValue(it.detail, false) : it.detail) : '';
  const dates = [it.start && sch.labels.start ? `${sch.labels.start}: ${fmtShort(it.start)}` : '', it.end && sch.labels.end && !sch.alert ? `${sch.labels.end.split(' ')[0]}: ${fmtShort(it.end)}` : ''].filter(Boolean).join(' · ');
  const current = sec.schema === 'jobs' && it.start && !it.end;
  return (
    <div class="lrow" style={{ minHeight: 64 }}>
      <button type="button" class="stack-xs grow" onClick={onOpen} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: 'inherit', minHeight: 44 }}>
        <span class="strong">{it.title}{current && <span class="chip sm tone-good" style={{ marginLeft: 8 }}>Actual</span>}</span>
        {(detail || dates) && <span class="small muted">{[detail, dates].filter(Boolean).join(' · ')}</span>}
        {sch.alert && it.end && <span class="tiny strong" style={{ color: dueTone(n) ? `var(--${dueTone(n)}-ink)` : 'var(--muted)' }}>{dueText(n, sch.alert)} · {fmtShort(it.end)}{(() => { const st = alertStatus(s, sec.id, it); return st === 'pending' ? ' · en pendientes' : st === 'done' ? ' · atendido' : ''; })()}</span>}
      </button>
      {(it.photos || []).length > 0 && <PhotoThumb id={it.photos[0]} size={44} onOpen={onOpen} label={`${it.title}: ver foto`} />}
      {sec.schema === 'contacts' && it.phone ? (
        <span class="row" style={{ gap: 6 }}>
          <a class="icon-btn" href={`tel:${it.phone}`} aria-label={`Llamar a ${it.title}`}><Icon name="phone" size={18} /></a>
          <a class="icon-btn" href={waLink(it.phone)} target="_blank" rel="noopener" aria-label={`Escribir a ${it.title} por WhatsApp`}><Icon name="chat" size={18} /></a>
        </span>
      ) : <Icon name="right" size={18} />}
    </div>
  );
}

// ---------- Hojas ----------

function ItemSheet({ sec, sch, it, onClose }) {
  const s = useApp();
  const today = s.energy.day;
  const [v, setV] = useState({ title: it ? it.title : '', detail: it ? it.detail : '', phone: it ? it.phone : '', start: it ? it.start || '' : '', end: it ? it.end || '' : '', note: it ? it.note : '', photos: it ? it.photos || [] : [] });
  const L = sch.labels;
  const set = (k) => (e) => setV({ ...v, [k]: e.currentTarget.value });
  const ok = v.title.trim().length > 1;
  const save = () => {
    if (!ok) return;
    if (it) act((st) => updateRecordItem(st, sec.id, it.id, v));
    else act((st, t, ev) => addRecordItem(st, sec.id, v, t, ev));
    toast(it ? 'Guardado' : `Agregado · +${RECORD_XP.item} XP`, 'folder');
    onClose();
  };
  const cur = it && sec.items.find((x) => x.id === it.id);
  const st = cur && cur.end ? alertStatus(s, sec.id, cur) : null;
  const has = !!st;
  return (
    <Sheet onClose={onClose} label={it ? it.title : `Nuevo ${sch.item}`}>
      <SheetHead title={it ? it.title : `Nuevo ${sch.item}`} onClose={onClose} />
      <div class="field">
        <label for="it-t">{L.title}</label>
        <input id="it-t" class="input" value={v.title} maxLength={80} onInput={set('title')} autoFocus={!it} />
        {!it && sch.suggest && <div class="chips">{sch.suggest.map((x) => <TChip key={x} sm on={v.title === x} onClick={() => setV({ ...v, title: x })}>{x}</TChip>)}</div>}
      </div>
      {L.detail && <div class="field"><label for="it-d">{L.detail}</label><input id="it-d" class="input" value={v.detail} maxLength={120} onInput={set('detail')} /></div>}
      {L.phone && <div class="field"><label for="it-p">{L.phone}</label><input id="it-p" class="input" inputMode="tel" value={v.phone} onInput={set('phone')} placeholder="809 555 1234" /></div>}
      {(L.start || L.end) && (
        <div class="grid2">
          {L.start && <div class="field"><label for="it-s">{L.start}</label><input id="it-s" type="date" class="input" value={v.start} onInput={set('start')} /></div>}
          {L.end && <div class="field"><label for="it-e">{L.end}</label><input id="it-e" type="date" class="input" value={v.end} onInput={set('end')} /></div>}
        </div>
      )}
      {sch.alert && <span class="small muted">Te aviso en Hoy cuando falten 30 días y puedes pasarlo a Pendientes.</span>}
      {sch.hint && <div class="note tone-xp" style={{ fontSize: 13.5 }}><Icon name="lock" size={18} /><span>{sch.hint}</span></div>}
      {(L.note || sec.schema === 'generic' || it) && <div class="field"><label for="it-n">{L.note || 'Nota'}</label><textarea id="it-n" class="input" rows={3} value={v.note} maxLength={1000} onInput={set('note')} /></div>}
      <PhotoStrip ids={v.photos} onChange={(photos) => setV({ ...v, photos })} kind="expediente" label="Fotos (opcional)" hint={sec.schema === 'docs' || sec.id === 'documentos' ? 'Una foto del documento por si lo pierdes. Se guarda en este teléfono y, si sincronizas, en tu Drive.' : ''} max={4} />
      <button type="button" class="btn block" disabled={!ok} onClick={save}><Icon name="check" size={20} />{it ? 'Guardar cambios' : `Agregar ${sch.item}`}</button>
      {cur && sch.alert && cur.end && !has && <button type="button" class="btn ghost block" onClick={() => { const t = act((st, d) => alertToTodo(st, sec.id, cur.id, d)); if (t) toast(`En pendientes: ${t.title}`, 'list'); onClose(); }}><Icon name="list" size={18} />Agregar a pendientes</button>}
      {cur && has && <span class="small muted row" style={{ gap: 6, justifyContent: 'center', textAlign: 'center' }}><Icon name="check" size={16} />{st === 'done' ? 'Ya lo atendiste. Cuando lo renueves, cambia la fecha y te aviso de nuevo.' : 'Ya está en tus pendientes.'}</span>}
      {it && <button type="button" class="link-btn" style={{ color: 'var(--vit-ink)', alignSelf: 'center' }} onClick={async () => { if (await ask(`¿Borrar «${it.title}» del expediente?`, { ok: 'Borrar', danger: true })) { act((st) => removeRecordItem(st, sec.id, it.id)); toast('Borrado', 'trash'); onClose(); } }}><Icon name="trash" size={16} />Borrar</button>}
    </Sheet>
  );
}

const FIELD_TYPES = [['text', 'Texto'], ['long', 'Texto largo'], ['date', 'Fecha'], ['tel', 'Teléfono'], ['email', 'Correo']];

function FieldSheet({ sec, f, onClose }) {
  const [label, setLabel] = useState(f ? f.label : '');
  const [type, setType] = useState(f ? f.type : 'text');
  const [secret, setSecret] = useState(f ? f.secret : false);
  const ok = label.trim().length > 1;
  return (
    <Sheet onClose={onClose} label={f ? `Editar ${f.label}` : 'Nuevo dato'}>
      <SheetHead title={f ? 'Editar dato' : 'Nuevo dato'} onClose={onClose} />
      <div class="field"><label for="fl">Nombre del dato</label><input id="fl" class="input" value={label} maxLength={40} onInput={(e) => setLabel(e.currentTarget.value)} placeholder="Ej. Número de NSS, Talla, Placa" autoFocus={!f} /></div>
      <div class="stack-sm"><span class="label">Tipo</span><div class="chips">{FIELD_TYPES.map(([k, l]) => <TChip key={k} sm on={type === k} onClick={() => setType(k)}>{l}</TChip>)}</div></div>
      <label class="between-c panel" style={{ cursor: 'pointer' }}>
        <span class="stack-xs"><span class="semi">Ocultar este dato</span><span class="small muted">Se ve como «•••• 1234» mientras los números estén ocultos.</span></span>
        <Switch checked={secret} onChange={setSecret} label="Ocultar este dato" />
      </label>
      <button type="button" class="btn block" disabled={!ok} onClick={() => { act((st) => (f ? updateRecordField(st, sec.id, f.id, { label, type, secret }) : addRecordField(st, sec.id, { label, type, secret }))); toast(f ? 'Dato actualizado' : 'Dato agregado', 'check'); onClose(); }}><Icon name="check" size={20} />Guardar</button>
      {f && <button type="button" class="link-btn" style={{ color: 'var(--vit-ink)', alignSelf: 'center' }} onClick={async () => { if (await ask(`¿Quitar «${f.label}» de esta sección? Se borra lo que tenga escrito.`, { ok: 'Quitar', danger: true })) { act((st) => removeRecordField(st, sec.id, f.id)); onClose(); } }}><Icon name="trash" size={16} />Quitar dato</button>}
    </Sheet>
  );
}

function SectionSheet({ sec, onClose, onCreated, onDeleted }) {
  const [title, setTitle] = useState(sec ? sec.title : '');
  const [kind, setKind] = useState(sec ? sec.kind : 'list');
  const [icon, setIcon] = useState(sec ? sec.icon : 'folder');
  const [area, setArea] = useState(sec ? sec.area : null);
  const ok = title.trim().length > 1;
  const save = () => {
    if (!ok) return;
    if (sec) { act((st) => updateRecordSection(st, sec.id, { title, icon, area })); toast('Sección actualizada', 'folder'); onClose(); return; }
    const n = act((st) => addRecordSection(st, { title, kind, icon, area }));
    if (n) { toast('Sección creada', 'folder'); onCreated(n.id); }
  };
  return (
    <Sheet onClose={onClose} label={sec ? 'Editar sección' : 'Nueva sección'}>
      <SheetHead title={sec ? 'Editar sección' : 'Nueva sección'} onClose={onClose} />
      <div class="field"><label for="st">Nombre</label><input id="st" class="input" value={title} maxLength={40} onInput={(e) => setTitle(e.currentTarget.value)} placeholder="Ej. Mi vehículo, Propiedades, Mascotas" autoFocus={!sec} /></div>
      {!sec && (
        <div class="stack-sm">
          <span class="label">¿Qué vas a guardar?</span>
          <div class="grid2">
            {[['fields', 'Datos', 'Una ficha con datos sueltos (placa, color, póliza).'], ['list', 'Lista', 'Varios registros con fecha; te aviso antes de cada una.']].map(([k, l, d]) => (
              <button key={k} type="button" aria-pressed={kind === k ? 'true' : 'false'} onClick={() => setKind(k)} class="card tight" style={{ textAlign: 'left', color: 'var(--ink)', borderColor: kind === k ? 'var(--ink)' : undefined, borderWidth: kind === k ? 2 : undefined }}>
                <span class="strong">{l}</span><span class="small muted">{d}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div class="stack-sm"><span class="label">Ícono</span><div class="chips">{RECORD_ICONS.map((ic) => <button key={ic} type="button" class="icon-btn" aria-label={`Ícono ${ic}`} aria-pressed={icon === ic ? 'true' : 'false'} onClick={() => setIcon(ic)} style={icon === ic ? { background: 'var(--ink)', color: 'var(--on-ink)' } : null}><Icon name={ic} size={20} /></button>)}</div></div>
      <div class="stack-sm">
        <span class="label">¿Qué atributo sube al completarla?</span>
        <div class="chips">
          <TChip sm on={!area} onClick={() => setArea(null)}>Ninguno (tu nivel)</TChip>
          {AREAS.map((a) => <TChip key={a.key} sm on={area === a.key} icon={a.icon} color={areaColor(a.key)} onClick={() => setArea(a.key)}>{a.attr}</TChip>)}
        </div>
      </div>
      <button type="button" class="btn block" disabled={!ok} onClick={save}><Icon name="check" size={20} />{sec ? 'Guardar' : 'Crear sección'}</button>
      {sec && !sec.builtin && <button type="button" class="link-btn" style={{ color: 'var(--vit-ink)', alignSelf: 'center' }} onClick={async () => { if (await ask(`¿Borrar la sección «${sec.title}» y todo lo que tiene?`, { ok: 'Borrar', danger: true })) { act((st) => removeRecordSection(st, sec.id)); onDeleted(); } }}><Icon name="trash" size={16} />Borrar sección</button>}
      {sec && sec.builtin && <span class="small muted" style={{ textAlign: 'center' }}>Las secciones que vienen con la app no se borran, pero puedes cambiarles el nombre, el ícono y el atributo.</span>}
    </Sheet>
  );
}

export { back };
