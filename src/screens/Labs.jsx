// Tus análisis de laboratorio (1.17): subir el PDF, la foto o el texto, revisar cada prueba, el historial por prueba
// y por análisis, y sugerencias para llevar a tu médico. Todo se lee en el teléfono; la IA es opcional.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { TopBar, Sheet, SheetHead, TChip, Bar, toast, ask, plural, areaColor } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { go } from '../app/router.js';
import { fmtShort, fmtDay } from '../app/dates.js';
import { LAB_MARKERS, LAB_MARKER, LAB_GROUPS, LAB_GROUP, LAB_LINKS } from '../game/labcatalog.js';
import {
  parseLabText, safeLabText, labPrompt, fromAI, addLabPanel, updateLabPanel, removeLabPanel, labSummary, labHistory, labSuggestions, labTodo,
  itemStatus, isOut, STATUS_TONE, rangeText, fmtNum, numOf, parseRange, unitOf, COMMON_UNITS, trendOfItem, itemKey, repeatDue, plain, toStd,
} from '../game/labs.js';
import { uid } from '../game/logic.js';
import { ocrSupported, readText, stopOCR, ocrErrorText } from '../app/ocr.js';
import { pdfText, pdfPageImages, pdfErrorText } from '../app/pdf.js';
import { aiProvider, aiJSON, aiErrorText, prepareImage, providerLabel } from '../ai/ai.js';

const SRC_LABEL = { foto: 'Foto', pdf: 'PDF', texto: 'Texto pegado', manual: 'A mano', ia: 'Leído con IA' };

export function Labs({ query }) {
  const s = useApp();
  const today = s.energy.day;
  const [adding, setAdding] = useState(() => (query && query.get('nuevo') ? { mode: 'new' } : null));
  const [marker, setMarker] = useState(null);
  const [panel, setPanel] = useState(null);
  const sum = labSummary(s);
  const sug = labSuggestions(s, today);
  const sex = (s.vitals && s.vitals.sex) || '';
  const addTodo = (x) => { act((st, t) => labTodo(st, { title: x.todo, src: x.src }, t)); toast('Agregado a tus pendientes de Salud', 'list'); };
  return (
    <>
      <main class="screen no-nav">
        <TopBar backTo="/area/salud" title="Tus análisis" heading right={<button type="button" class="icon-btn" aria-label="Agregar análisis" onClick={() => setAdding({ mode: 'new' })}><Icon name="plus" /></button>} />
        {!sum.last ? (
          <section class="stack">
            <p class="lead">Sube tus resultados de laboratorio y míralos contigo en el tiempo: cada prueba con el rango de tu laboratorio y cómo cambia de un análisis a otro.</p>
            <div class="empty">
              <Icon name="flask" size={26} />
              <span>PDF del laboratorio, foto del papel o captura de pantalla. Astra lee el texto aquí mismo, quita tu nombre, cédula y fecha de nacimiento, y te deja revisar cada prueba antes de guardar.</span>
              <button type="button" class="btn sm" onClick={() => setAdding({ mode: 'new' })}><Icon name="upload" size={17} />Agregar mis análisis</button>
            </div>
          </section>
        ) : (
          <>
            <section class="stack-sm" aria-label="Resumen">
              <span class="small muted semi">Último análisis: {fmtDay(sum.last.day, { weekdayName: false })}{sum.last.lab ? ` · ${sum.last.lab}` : ''}</span>
              <div class="kpis">
                <div class="kpi"><span class="v" style={{ color: 'var(--good-ink)' }}>{sum.counts.ok}</span><span class="l">En rango</span></div>
                <div class="kpi"><span class="v" style={{ color: 'var(--xp-ink)' }}>{sum.counts.atento}</span><span class="l">Para vigilar</span></div>
                <div class="kpi"><span class="v" style={{ color: 'var(--vit-ink)' }}>{sum.counts.fuera}</span><span class="l">Fuera de rango</span></div>
              </div>
              {sum.counts.sin > 0 && <span class="tiny muted">{plural(sum.counts.sin, 'prueba', 'pruebas')} sin rango en el informe.</span>}
            </section>
            {sug.map((x) => (
              <div key={x.src} class="note" style={{ margin: 0 }}>
                <Icon name="info" size={18} />
                <span class="stack-xs grow"><span class="small">{x.text}</span><button type="button" class="link-btn" style={{ alignSelf: 'flex-start', minHeight: 36 }} onClick={() => addTodo(x)}>Agregar a pendientes<Icon name="plus" size={15} /></button></span>
              </div>
            ))}
            {sum.groups.map((g) => (
              <section key={g.key} class="stack-xs" aria-label={g.label}>
                <h2 class="eyebrow">{g.label}</h2>
                <div class="card flush" style={{ padding: '0 16px' }}>
                  {g.items.map((x) => <MarkerRow key={x.key} s={s} x={x} onOpen={() => setMarker(x.key)} />)}
                </div>
              </section>
            ))}
            <section class="stack-xs" aria-label="Historial de análisis">
              <h2 class="eyebrow">Tus análisis · {sum.panels.length}</h2>
              <div class="card flush" style={{ padding: '0 16px' }}>
                {sum.panels.map((p) => {
                  const out = p.items.filter((it) => isOut(itemStatus(it).st)).length;
                  return (
                    <button key={p.id} type="button" class="lrow" onClick={() => setPanel(p.id)}>
                      <span class="tile sm" style={{ background: 'var(--salud-soft)', color: 'var(--salud)' }}><Icon name="flask" size={17} /></span>
                      <span class="stack-xs grow"><span class="semi">{fmtDay(p.day, { weekdayName: false })}</span><span class="tiny muted">{p.lab || 'Laboratorio'} · {plural(p.items.length, 'prueba', 'pruebas')}{out ? ` · ${out} fuera de rango` : ''}</span></span>
                      <Icon name="right" size={18} />
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        )}
        <section class="card" aria-label="Rangos por sexo">
          <span class="semi">Si tu informe trae un rango para hombres y otro para mujeres</span>
          <span class="small muted">Astra usa el que elijas. Si no eliges, esa prueba queda sin rango hasta que lo revises.</span>
          <div class="seg" role="tablist" aria-label="Rangos">
            {[['f', 'Mujer'], ['m', 'Hombre'], ['', 'No elegir']].map(([k, l]) => <button key={k || 'no'} type="button" role="tab" aria-selected={sex === k ? 'true' : 'false'} onClick={() => act((st) => { st.vitals = { ...(st.vitals || {}), sex: k }; })}>{l}</button>)}
          </div>
        </section>
        <div class="note"><Icon name="info" size={18} /><span>Astra no da diagnósticos. El rango que vale es el que imprime tu laboratorio (cada uno tiene el suyo), y quien interpreta tus resultados es tu médico. Las guías generales (ADA, NHLBI, NIH) solo se usan cuando el informe no trae rango, y se dice de dónde salen.</span></div>
      </main>
      {adding && <AddLabSheet key={adding.id || 'nuevo'} s={s} today={today} edit={adding.panel || null} onClose={() => setAdding(null)} />}
      {marker && <MarkerSheet s={s} k={marker} today={today} onClose={() => setMarker(null)} />}
      {panel && <PanelSheet s={s} id={panel} today={today} onClose={() => setPanel(null)} onEdit={(p) => { setPanel(null); setAdding({ mode: 'edit', panel: p, id: p.id }); }} />}
    </>
  );
}

function MarkerRow({ s, x, onOpen }) {
  const tr = trendOfItem(x);
  const v = x.it.value != null ? fmtNum(x.it.value) : x.it.text;
  return (
    <button type="button" class="lrow" onClick={onOpen} aria-label={`${x.it.name}: ${v} ${x.it.unit}, ${x.st.label}. Tocar para ver el historial`}>
      <span class="stack-xs grow" style={{ minWidth: 0 }}>
        <span class="semi">{x.it.name}</span>
        <span class="tiny muted">{fmtShort(x.day)}{x.n > 1 ? ` · ${x.n} análisis` : ''}{tr && !tr.flat ? ` · ${tr.diff > 0 ? 'subió' : 'bajó'} ${Math.abs(Math.round(tr.pct * 100))} %` : tr ? ' · estable' : ''}</span>
      </span>
      {x.n > 1 && <Spark s={s} x={x} />}
      <span class="stack-xs" style={{ alignItems: 'flex-end', flexShrink: 0 }}>
        <span class="strong tab-num">{v} <span class="tiny muted">{x.it.unit}</span></span>
        <span class={`chip sm ${STATUS_TONE[x.st.st] ? `tone-${STATUS_TONE[x.st.st]}` : ''}`}>{x.st.st === 'sin' ? 'Sin rango' : x.st.label.length > 18 ? shortLabel(x.st) : x.st.label}</span>
      </span>
    </button>
  );
}
const shortLabel = (st) => ({ ok: 'En lo deseable', atento: 'Para vigilar', alto: 'Alto', bajo: 'Bajo', fuera: 'Fuera de rango' }[st.st] || st.label);

// Pequeña línea con los últimos valores (en la misma unidad).
function Spark({ s, x }) {
  const hist = labHistory(s, x.key).filter((h) => h.std != null).slice(-6);
  if (hist.length < 2) return null;
  const W = 56; const H = 24;
  const vs = hist.map((h) => h.std);
  const lo = Math.min(...vs); const hi = Math.max(...vs);
  const pts = vs.map((v, i) => [3 + (i * (W - 6)) / (vs.length - 1), hi === lo ? H / 2 : 3 + (1 - (v - lo) / (hi - lo)) * (H - 6)]);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={`M${pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' L')}`} fill="none" stroke="var(--muted)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" fill="var(--ink)" />
    </svg>
  );
}

// ---------- Una prueba: historial ----------

function MarkerSheet({ s, k, today, onClose }) {
  const hist = labHistory(s, k);
  if (!hist.length) return null;
  const last = hist[hist.length - 1];
  const m = last.it.key ? LAB_MARKER[String(last.it.key).replace(/_pct$/, '')] : null;
  const st = last.status;
  const addTodo = () => { act((x, t) => labTodo(x, { title: `Preguntar al médico por mi ${last.it.name.toLowerCase()}`, src: `lab:item:${k}:${last.day}` }, t)); toast('Agregado a tus pendientes de Salud', 'list'); };
  return (
    <Sheet onClose={onClose} label={last.it.name}>
      <SheetHead title={last.it.name} onClose={onClose} />
      <div class="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span class="display-num" style={{ fontSize: 34 }}>{last.it.value != null ? fmtNum(last.it.value) : last.it.text}</span>
        <span class="small muted">{last.it.unit}</span>
        <span class={`chip sm ${STATUS_TONE[st.st] ? `tone-${STATUS_TONE[st.st]}` : ''}`}>{st.label}</span>
      </div>
      <span class="small muted">{fmtDay(last.day, { weekdayName: false })}{last.panel.lab ? ` · ${last.panel.lab}` : ''}{rangeText(last.it) ? ` · rango del informe: ${rangeText(last.it)}` : last.it.ref ? ` · referencia: ${last.it.ref}` : ''}</span>
      {st.src === 'guia' && <span class="tiny muted">El informe no traía rango: la categoría sale de la guía {st.guide}.</span>}
      <RangeBar it={last.it} />
      {hist.filter((h) => h.std != null).length >= 2 && <HistoryChart hist={hist.filter((h) => h.std != null)} m={m} />}
      <div class="stack-xs">
        <span class="label">Historial</span>
        {[...hist].reverse().map((h) => (
          <div key={h.it.id} class="between-c small" style={{ minHeight: 36 }}>
            <span>{fmtShort(h.day)}{h.panel.lab ? ` · ${h.panel.lab}` : ''}</span>
            <span class="row" style={{ gap: 8, flexShrink: 0 }}><b class="tab-num" style={{ whiteSpace: 'nowrap' }}>{h.it.value != null ? fmtNum(h.it.value) : h.it.text} {h.it.unit}</b><span class={`chip sm ${STATUS_TONE[h.status.st] ? `tone-${STATUS_TONE[h.status.st]}` : ''}`}>{shortLabel(h.status)}</span></span>
          </div>
        ))}
      </div>
      {m && m.what && <div class="stack-xs"><span class="label">Qué es</span><span class="small">{m.what}</span>{m.moves && <span class="small muted">{m.moves}</span>}</div>}
      {m && m.guide && (
        <div class="stack-xs">
          <span class="label">Guía general ({m.guide.src})</span>
          {m.guide.cuts.map(([, k2, t]) => <span key={t} class="small row" style={{ gap: 6 }}><span class={`dot-s tone-${STATUS_TONE[k2] || 'ink'}`} aria-hidden="true" />{t}</span>)}
          <span class="tiny muted">En {m.u}. Para tu caso, manda el rango de tu laboratorio y lo que diga tu médico.</span>
        </div>
      )}
      {m && m.links && <div class="chips">{m.links.map((l) => <a key={l} class="chip" href={LAB_LINKS[l].href} style={{ textDecoration: 'none' }} onClick={onClose}><Icon name={LAB_LINKS[l].icon} size={14} />{LAB_LINKS[l].label}</a>)}</div>}
      {isOut(st.st) && <button type="button" class="btn sm soft" style={{ alignSelf: 'flex-start' }} onClick={addTodo}><Icon name="list" size={17} />Pendiente: preguntarle a mi médico</button>}
    </Sheet>
  );
}

// Dónde cae el valor dentro del rango del laboratorio.
function RangeBar({ it }) {
  if (it.value == null || it.lo == null || it.hi == null || it.hi <= it.lo) return null;
  const span = it.hi - it.lo;
  const min = it.lo - span * 0.5; const max = it.hi + span * 0.5;
  const pos = Math.max(0, Math.min(1, (it.value - min) / (max - min)));
  const a = (it.lo - min) / (max - min); const b = (it.hi - min) / (max - min);
  return (
    <div class="range-bar" role="img" aria-label={`${fmtNum(it.value)} dentro de un rango de ${fmtNum(it.lo)} a ${fmtNum(it.hi)}`}>
      <span class="band" style={{ left: `${a * 100}%`, width: `${(b - a) * 100}%` }} />
      <span class="mark" style={{ left: `${pos * 100}%` }} />
      <span class="tick" style={{ left: `${a * 100}%` }}>{fmtNum(it.lo)}</span>
      <span class="tick" style={{ left: `${b * 100}%` }}>{fmtNum(it.hi)}</span>
    </div>
  );
}

function HistoryChart({ hist, m }) {
  const W = 320; const H = 130; const L = 34; const R = 10; const T = 12; const B = 22;
  const vs = hist.map((h) => h.std);
  const los = hist.map((h) => (h.unit === (m && m.u) || !m ? toStdRange(h, m, 'lo') : null)).filter((v) => v != null);
  const his = hist.map((h) => (h.unit === (m && m.u) || !m ? toStdRange(h, m, 'hi') : null)).filter((v) => v != null);
  const bandLo = los.length ? los[los.length - 1] : null; const bandHi = his.length ? his[his.length - 1] : null;
  let lo = Math.min(...vs, bandLo ?? Infinity); let hi = Math.max(...vs, bandHi ?? -Infinity);
  if (hi === lo) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.15; lo -= pad; hi += pad;
  const x = (i) => L + (i * (W - L - R)) / Math.max(1, hist.length - 1);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = `M${hist.map((h, i) => `${x(i).toFixed(1)},${y(h.std).toFixed(1)}`).join(' L')}`;
  // Etiquetas del eje: los bordes del rango del informe (o, sin rango, el mínimo y el máximo); si quedan
  // muy juntas, solo la de arriba.
  let ticks = bandLo != null && bandHi != null ? [bandLo, bandHi] : [lo + pad, hi - pad];
  if (Math.abs(y(ticks[0]) - y(ticks[1])) < 13) ticks = [ticks[1]];
  return (
    <div class="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Historial: ${hist.map((h) => `${fmtShort(h.day)} ${fmtNum(h.std)}`).join(', ')}`}>
        {bandLo != null && bandHi != null && <rect x={L} y={y(bandHi)} width={W - L - R} height={Math.max(2, y(bandLo) - y(bandHi))} fill="var(--good-soft)" rx="4" />}
        {ticks.map((g) => <text key={g} x={L - 6} y={y(g) + 4} text-anchor="end" class="axis">{fmtNum(Math.round(g * 10) / 10)}</text>)}
        <path d={path} class="ln" style={{ stroke: 'var(--muted)' }} />
        {hist.map((h, i) => <circle key={h.it.id} cx={x(i)} cy={y(h.std)} r="4.5" class="dot" style={{ fill: isOut(h.status.st) ? 'var(--vit)' : areaColor('salud') }}><title>{`${fmtShort(h.day)}: ${fmtNum(h.std)} ${h.unit}`}</title></circle>)}
        {hist.map((h, i) => (i === 0 || i === hist.length - 1 ? <text key={`t${h.it.id}`} x={x(i)} y={H - 5} text-anchor={i === 0 ? 'start' : 'end'} class="axis">{fmtShort(h.day)}</text> : null))}
      </svg>
      <span class="tiny muted">{bandLo != null && bandHi != null ? 'Franja verde: rango de tu último informe. ' : ''}Punto rojo: fuera de rango{m ? `. En ${m.u}` : ''}.</span>
    </div>
  );
}
function toStdRange(h, m, k) {
  const v = h.it[k];
  if (v == null) return null;
  return m ? toStd(m, v, h.it.unit) : v;
}

// ---------- Un análisis ----------

function PanelSheet({ s, id, today, onClose, onEdit }) {
  const p = (s.labs || []).find((x) => x.id === id);
  if (!p) return null;
  const remind = (months) => {
    const due = repeatDue(p.day, months);
    act((st, t) => labTodo(st, { title: `Repetir mis análisis${p.lab ? ` (${p.lab})` : ''}`, src: `lab:rep:${p.id}`, due: due < t ? t : due }, t));
    toast(`Te lo recuerdo el ${fmtShort(due < today ? today : due)}`, 'calendar');
  };
  const del = async () => {
    if (!(await ask('¿Borrar este análisis? Se borran todas sus pruebas.', { ok: 'Borrar', danger: true }))) return;
    act((st) => removeLabPanel(st, id));
    toast('Análisis borrado', 'trash');
    onClose();
  };
  const groups = LAB_GROUPS.map((g) => ({ ...g, items: p.items.filter((it) => (it.key ? (LAB_MARKER[String(it.key).replace(/_pct$/, '')] || {}).group : 'otros') === g.key) })).filter((g) => g.items.length);
  return (
    <Sheet onClose={onClose} label="Análisis">
      <SheetHead title={fmtDay(p.day, { weekdayName: false })} onClose={onClose} />
      <span class="small muted">{p.lab || 'Laboratorio'} · {plural(p.items.length, 'prueba', 'pruebas')} · {SRC_LABEL[p.source] || ''}</span>
      {p.note && <span class="small">{p.note}</span>}
      {groups.map((g) => (
        <div key={g.key} class="stack-xs">
          <span class="label">{g.label}</span>
          {g.items.map((it) => { const st = itemStatus(it); return (
            <div key={it.id} class="between-c small" style={{ minHeight: 34, gap: 8 }}>
              <span class="grow">{it.name}</span>
              <span class="tab-num"><b>{it.value != null ? fmtNum(it.value) : it.text}</b> {it.unit}</span>
              <span class={`chip sm ${STATUS_TONE[st.st] ? `tone-${STATUS_TONE[st.st]}` : ''}`}>{shortLabel(st)}</span>
            </div>
          ); })}
        </div>
      ))}
      <div class="stack-xs">
        <span class="label">Recordarme repetirlo</span>
        <div class="chips">{[[3, 'En 3 meses'], [6, 'En 6 meses'], [12, 'En un año']].map(([n, l]) => <TChip key={n} sm onClick={() => remind(n)}>{l}</TChip>)}</div>
        <span class="tiny muted">Queda como pendiente de Salud. Cada cuánto repetir lo decide tu médico.</span>
      </div>
      <div class="row" style={{ gap: 8 }}>
        <button type="button" class="btn sm soft grow" onClick={() => onEdit(p)}><Icon name="edit" size={17} />Editar</button>
        <button type="button" class="btn sm soft grow" onClick={del}><Icon name="trash" size={17} />Borrar</button>
      </div>
    </Sheet>
  );
}

// ---------- Agregar (o editar) un análisis ----------

const blankItem = () => ({ id: uid(), key: null, name: '', value: null, text: '', unit: '', lo: null, hi: null, on: true, edit: true });

function AddLabSheet({ s, today, edit = null, onClose }) {
  const sex = (s.vitals && s.vitals.sex) || '';
  const [phase, setPhase] = useState(edit ? 'review' : 'pick');
  const [prog, setProg] = useState(null);
  const [msg, setMsg] = useState('');
  const [text, setText] = useState('');
  const [paste, setPaste] = useState(false);
  const [data, setData] = useState(() => (edit ? { day: edit.day, lab: edit.lab, note: edit.note || '', items: edit.items.map((it) => ({ ...it, on: true })), personal: 0, source: edit.source } : null));
  const [item, setItem] = useState(null);
  const [provider, setProvider] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const run = useRef(0);
  const ctl = useRef(null);
  const imgRef = useRef(null);
  const pdfRef = useRef(null);
  useEffect(() => {
    aiProvider(s.settings).then(setProvider).catch(() => setProvider(null));
    return () => { run.current += 1; if (ctl.current) ctl.current.abort(); stopOCR(); };
  }, []);

  const finish = (raw, source, note = '') => {
    const r = parseLabText(raw, today, { sex });
    setText(raw);
    setData({ day: r.day || today, lab: r.lab, note: '', items: r.items.map((it) => ({ ...it, on: true })), personal: r.personal, source });
    setMsg(note || (!r.items.length ? 'No encontré pruebas en el texto. Prueba con otra foto más nítida, pega el texto o escríbelas a mano.' : ''));
    setPhase('review');
  };

  const onImages = async (e) => {
    const files = [...(e.currentTarget.files || [])].slice(0, 6);
    e.currentTarget.value = '';
    if (!files.length) return;
    if (!ocrSupported()) { setMsg('Este navegador no puede leer el texto de las fotos. Pega el texto o escribe las pruebas a mano.'); return; }
    const me = ++run.current;
    setPhase('reading'); setMsg('');
    const parts = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const prepared = await prepareImage(files[i], 2400);
        if (run.current !== me) return;
        imgRef.current = prepared.blob;
        const { text: t } = await readText(prepared.bitmap, (p) => { if (run.current === me) setProg({ label: files.length > 1 ? `Foto ${i + 1} de ${files.length}: ${p.label}` : p.label, pct: (i + p.pct) / files.length }); });
        parts.push(t);
      }
    } catch (err) {
      if (run.current !== me) return;
      setPhase('pick'); setMsg(ocrErrorText(err)); return;
    }
    if (run.current !== me) return;
    finish(parts.join('\n'), 'foto');
  };

  const onPdf = async (e) => {
    const f = e.currentTarget.files && e.currentTarget.files[0];
    e.currentTarget.value = '';
    if (!f) return;
    const me = ++run.current;
    setPhase('reading'); setMsg('');
    try {
      const r = await pdfText(f, (p) => { if (run.current === me) setProg(p); });
      if (run.current !== me) return;
      if (!r.scanned) { finish(r.text, 'pdf'); return; }
      // PDF escaneado: cada página pasa por el lector de texto.
      if (!ocrSupported()) { finish(r.text, 'pdf', 'Ese PDF es una imagen y este navegador no puede leerla. Toma una captura o escribe las pruebas.'); return; }
      const pages = await pdfPageImages(r.doc, 4);
      const parts = [];
      for (let i = 0; i < pages.length; i++) {
        const { text: t } = await readText(pages[i], (p) => { if (run.current === me) setProg({ label: `Página ${i + 1} de ${pages.length} (escaneada): ${p.label}`, pct: (i + p.pct) / pages.length }); });
        if (run.current !== me) return;
        parts.push(t);
      }
      finish(parts.join('\n'), 'pdf');
    } catch (err) {
      if (run.current !== me) return;
      setPhase('pick'); setMsg(err && /ocr/.test(String(err.message)) ? ocrErrorText(err) : pdfErrorText(err));
    }
  };

  const onPaste = () => { if (text.trim()) finish(text, 'texto'); };
  const manual = () => { setData({ day: today, lab: '', note: '', items: [], personal: 0, source: 'manual' }); setPhase('review'); setItem(blankItem()); };
  const cancel = () => { run.current += 1; if (ctl.current) ctl.current.abort(); stopOCR(); setProg(null); setPhase('pick'); };

  // «Mejorar con IA»: se manda el texto sin las líneas personales (no la foto).
  const improve = async () => {
    if (!provider || !text.trim()) return;
    setAiBusy(true); setMsg('');
    ctl.current = new AbortController();
    try {
      const raw = await aiJSON(provider, labPrompt(safeLabText(text)), { signal: ctl.current.signal, task: 'analitica', maxTokens: 4000 });
      const r = fromAI(raw, today, { sex });
      if (!r.items.length) { setMsg('La IA no encontró más pruebas.'); return; }
      setData({ ...data, day: r.day || data.day, lab: r.lab || data.lab, items: r.items.map((it) => ({ ...it, on: true })), source: 'ia' });
      setMsg(`La IA leyó ${plural(r.items.length, 'prueba', 'pruebas')}. Revísalas antes de guardar.`);
    } catch (err) {
      const t = aiErrorText(err);
      if (t) setMsg(t);
    } finally { setAiBusy(false); }
  };

  const setIt = (it) => setData({ ...data, items: data.items.some((x) => x.id === it.id) ? data.items.map((x) => (x.id === it.id ? it : x)) : [...data.items, it] });
  const removeIt = (id) => setData({ ...data, items: data.items.filter((x) => x.id !== id) });
  const chosen = data ? data.items.filter((x) => x.on && (x.value != null || x.text)) : [];
  const save = () => {
    if (!chosen.length) return;
    const payload = { day: data.day || today, lab: data.lab, note: data.note, items: chosen.map(({ on, edit: _e, raw, ...it }) => it), source: data.source || 'manual' };
    if (edit) { act((st) => updateLabPanel(st, edit.id, payload)); toast('Análisis actualizado', 'check'); } else {
      const p = act((st, t, ev) => addLabPanel(st, payload, t, ev));
      if (!p) { toast('No pude guardar: revisa las pruebas', 'info'); return; }
      const out = p.items.filter((it) => isOut(itemStatus(it).st)).length;
      toast(`${plural(p.items.length, 'prueba guardada', 'pruebas guardadas')}${out ? ` · ${out} fuera de rango` : ''} · +15 XP de Vigor`, 'flask');
    }
    onClose();
  };

  return (
    <>
    <Sheet onClose={onClose} label={edit ? 'Editar análisis' : 'Agregar análisis'}>
      <SheetHead title={edit ? 'Editar análisis' : 'Agregar análisis'} onClose={onClose} />
      {phase === 'pick' && (
        <div class="stack">
          <span class="small muted">El PDF o la foto se leen aquí, en tu teléfono. Antes de leer, Astra quita las líneas con tu nombre, cédula, fecha de nacimiento y médico, y no guarda el archivo.</span>
          <label class="btn block" style={{ cursor: 'pointer' }}><Icon name="download" size={20} />PDF del laboratorio<input type="file" accept="application/pdf,.pdf" class="sr-only" onChange={onPdf} /></label>
          <label class="btn block soft" style={{ cursor: 'pointer' }}><Icon name="camera" size={20} />Foto o captura (hasta 6)<input type="file" accept="image/*" multiple class="sr-only" onChange={onImages} /></label>
          <button type="button" class="btn block soft" onClick={() => setPaste(!paste)} aria-expanded={paste ? 'true' : 'false'}><Icon name="paste" size={20} />Pegar el texto</button>
          {paste && (
            <div class="stack-sm">
              <textarea class="input" rows={6} value={text} onInput={(e) => setText(e.currentTarget.value)} placeholder={'Copia el texto del PDF o del portal del laboratorio y pégalo aquí. Ej.:\nGLUCOSA 92 mg/dL 70 - 100'} aria-label="Texto del resultado" />
              <button type="button" class="btn sm" style={{ alignSelf: 'flex-start' }} disabled={!text.trim()} onClick={onPaste}><Icon name="search" size={17} />Leer el texto</button>
            </div>
          )}
          <button type="button" class="link-btn" style={{ alignSelf: 'flex-start' }} onClick={manual}><Icon name="edit" size={16} />Escribirlas a mano</button>
          {msg && <div class="note tone-xp" style={{ margin: 0 }}><Icon name="info" size={18} /><span>{msg}</span></div>}
          <span class="tiny muted">La primera vez se descarga el lector de PDF (unos 1.9 MB) o el de fotos (unos 6 MB); después funcionan sin internet.</span>
        </div>
      )}
      {phase === 'reading' && (
        <div class="stack" aria-live="polite">
          <span class="semi">{(prog && prog.label) || 'Leyendo…'}</span>
          <Bar value={(prog && prog.pct) || 0.05} size="lg" color={areaColor('salud')} label="Avance de la lectura" />
          <button type="button" class="btn sm soft" style={{ alignSelf: 'flex-start' }} onClick={cancel}>Cancelar</button>
        </div>
      )}
      {phase === 'review' && data && (
        <div class="stack">
          <div class="timepair">
            <div class="field"><label for="lab-d">Fecha de la muestra</label><input id="lab-d" type="date" class="input" max={today} value={data.day} onInput={(e) => setData({ ...data, day: e.currentTarget.value })} /></div>
            <div class="field"><label for="lab-l">Laboratorio</label><input id="lab-l" class="input" value={data.lab} maxLength={60} onInput={(e) => setData({ ...data, lab: e.currentTarget.value })} placeholder="Ej. Amadita" /></div>
          </div>
          {data.personal > 0 && <span class="tiny muted"><Icon name="shield" size={13} /> Quité {plural(data.personal, 'línea', 'líneas')} con datos personales.</span>}
          {msg && <div class="note" style={{ margin: 0 }}><Icon name="info" size={18} /><span>{msg}</span></div>}
          {data.items.length > 0 && <span class="small muted">Revisa cada prueba: toca una para corregirla. Las que desmarques no se guardan.</span>}
          <div>
            {data.items.map((it) => { const st = itemStatus(it); return (
              <div key={it.id} class="lrow" style={{ gap: 10 }}>
                <input type="checkbox" checked={it.on} onChange={(e) => setIt({ ...it, on: e.currentTarget.checked })} aria-label={`Guardar ${it.name}`} style={{ width: 22, height: 22, flexShrink: 0 }} />
                <button type="button" class="grow stack-xs" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'var(--ink)', minWidth: 0 }} onClick={() => setItem(it)} aria-label={`Corregir ${it.name}`}>
                  <span class="semi" style={{ opacity: it.on ? 1 : 0.5 }}>{it.name}{!it.key && <span class="tiny muted"> · otra</span>}</span>
                  <span class="tiny muted">{it.value != null ? fmtNum(it.value) : it.text} {it.unit}{rangeText(it) ? ` · ${rangeText(it)}` : it.ref ? ` · ${it.ref}` : ''}</span>
                </button>
                <span class={`chip sm ${STATUS_TONE[st.st] ? `tone-${STATUS_TONE[st.st]}` : ''}`}>{shortLabel(st)}</span>
              </div>
            ); })}
          </div>
          <button type="button" class="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setItem(blankItem())}><Icon name="plus" size={16} />Agregar una prueba</button>
          {provider && text.trim() && !edit && (
            <button type="button" class="btn sm soft" style={{ alignSelf: 'flex-start' }} disabled={aiBusy} onClick={improve}><Icon name="sparkle" size={17} />{aiBusy ? 'Leyendo con IA…' : `Mejorar con IA (${providerLabel(provider)})`}</button>
          )}
          {provider && text.trim() && !edit && <span class="tiny muted">A la IA se manda solo el texto, sin las líneas con tus datos personales.</span>}
          {text.trim() && !edit && (
            <details class="small">
              <summary class="semi" style={{ cursor: 'pointer', minHeight: 32 }}>Ver el texto leído</summary>
              <pre class="code-box" style={{ whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto' }}>{safeLabText(text)}</pre>
            </details>
          )}
          <div class="field"><label for="lab-n">Nota (opcional)</label><input id="lab-n" class="input" maxLength={300} value={data.note} onInput={(e) => setData({ ...data, note: e.currentTarget.value })} placeholder="Ej. Chequeo anual, en ayunas" /></div>
          <button type="button" class="btn block" disabled={!chosen.length} onClick={save}><Icon name="check" size={20} />{edit ? 'Guardar cambios' : chosen.length ? `Guardar ${plural(chosen.length, 'prueba', 'pruebas')}` : 'Guardar'}</button>
          {!edit && <button type="button" class="link-btn muted" style={{ alignSelf: 'flex-start' }} onClick={() => { setPhase('pick'); setMsg(''); }}>Leer otro archivo</button>}
        </div>
      )}
    </Sheet>
    {item && <ItemSheet item={item} sex={sex} onClose={() => setItem(null)} onSave={(it) => { setIt(it); setItem(null); }} onRemove={(id) => { removeIt(id); setItem(null); }} />}
    </>
  );
}

// ---------- Corregir una prueba ----------

function ItemSheet({ item, sex, onClose, onSave, onRemove }) {
  const [key, setKey] = useState(item.key ? String(item.key) : '');
  const [name, setName] = useState(item.key ? '' : item.name);
  const [val, setVal] = useState(item.value != null ? String(item.value) : item.text || '');
  const [unit, setUnit] = useState(item.unit || '');
  const [ref, setRef] = useState(rangeText(item) || item.ref || '');
  const baseKey = key.replace(/_pct$/, '');
  const m = LAB_MARKER[baseKey] || null;
  const n = numOf(val);
  const rg = parseRange(ref, { sex });
  const draft = { ...item, key: key || null, name: m ? (key.endsWith('_pct') ? `${m.name} (%)` : m.name) : name.trim(), value: n, text: n == null ? val.trim().slice(0, 30) : '', unit: unitOf(unit) || unit.trim(), lo: rg ? rg.lo : null, hi: rg ? rg.hi : null, lx: !!(rg && rg.lx), hx: !!(rg && rg.hx), ref: ref.trim().slice(0, 60), on: true, edit: false };
  if (!rg) { delete draft.lo; delete draft.hi; }
  delete draft.flag;
  const st = itemStatus(draft);
  const ok = draft.name && (draft.value != null || draft.text);
  const exists = !item.edit || item.name;
  return (
    <Sheet onClose={onClose} label="Corregir prueba">
      <SheetHead title={exists ? 'Corregir prueba' : 'Nueva prueba'} onClose={onClose} />
      <div class="field">
        <label for="it-k">Prueba</label>
        <select id="it-k" class="input" value={key} onChange={(e) => { setKey(e.currentTarget.value); const mk = LAB_MARKER[e.currentTarget.value.replace(/_pct$/, '')]; if (mk && !unit) setUnit(e.currentTarget.value.endsWith('_pct') ? '%' : mk.u); }}>
          <option value="">Otra (escribe el nombre)</option>
          {LAB_GROUPS.filter((g) => g.key !== 'otros').map((g) => (
            <optgroup key={g.key} label={g.label}>
              {LAB_MARKERS.filter((x) => x.group === g.key).flatMap((x) => (x.abs ? [x, { ...x, key: `${x.key}_pct`, name: `${x.name} (%)` }] : [x])).map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      {!m && <div class="field"><label for="it-n">Nombre</label><input id="it-n" class="input" value={name} maxLength={60} onInput={(e) => setName(e.currentTarget.value)} placeholder="Ej. Homocisteína" /></div>}
      <div class="timepair">
        <div class="field"><label for="it-v">Resultado</label><input id="it-v" class="input" inputMode="decimal" value={val} maxLength={30} onInput={(e) => setVal(e.currentTarget.value)} placeholder="Ej. 92 o Negativo" autoFocus={!exists} /></div>
        <div class="field"><label for="it-u">Unidad</label><input id="it-u" class="input" list="lab-units" value={unit} maxLength={20} onInput={(e) => setUnit(e.currentTarget.value)} placeholder={m ? m.u : 'mg/dL'} /></div>
      </div>
      <datalist id="lab-units">{COMMON_UNITS.map((u) => <option key={u} value={u} />)}</datalist>
      <div class="field"><label for="it-r">Rango de referencia del informe</label><input id="it-r" class="input" value={ref} maxLength={60} onInput={(e) => setRef(e.currentTarget.value)} placeholder="Ej. 70 - 100, < 200 o > 40" /></div>
      {ok && <span class="small">Así queda: <span class={`chip sm ${STATUS_TONE[st.st] ? `tone-${STATUS_TONE[st.st]}` : ''}`}>{st.label}</span>{st.src === 'guia' ? <span class="tiny muted"> (guía {st.guide}, porque no pusiste rango)</span> : null}</span>}
      {m && unit && unitOf(unit) && unitOf(unit) !== (key.endsWith('_pct') ? '%' : m.u) && toStd(m, n || 1, unitOf(unit)) == null && <span class="tiny muted">Esta unidad no se puede comparar con tus otros análisis de {m.name.toLowerCase()} (en {m.u}).</span>}
      <button type="button" class="btn block" disabled={!ok} onClick={() => onSave(draft)}><Icon name="check" size={20} />Listo</button>
      {exists && <button type="button" class="link-btn muted" style={{ alignSelf: 'flex-start' }} onClick={() => onRemove(item.id)}><Icon name="trash" size={16} />Quitar esta prueba</button>}
    </Sheet>
  );
}

export { itemKey, plain };
