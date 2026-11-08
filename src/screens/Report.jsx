// Informe semanal (1.17): lo que salió bien, los aspectos a mejorar con una acción cada uno, tu foco de la semana,
// el detalle por área, lo que viene, tus últimas 8 semanas y tu revisión en palabras. Se puede copiar, compartir
// o guardar como PDF (imprimir).
import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { TopBar, toast, areaColor, areaSoft, areaInk, useHour } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { go } from '../app/router.js';
import { addDays, fmtShort } from '../app/dates.js';
import { addMission, addTodo, fmtHours, accountLabel } from '../game/logic.js';
import { weeklyReport, reportText, readyWeek, weekOf, markSeen, setFocus, claimFocus, reportTrend, FOCUS } from '../game/report.js';
import { WeeklyReviewCard } from './Reflect.jsx';
import { whenText } from './Money.jsx';

const rd = (v) => `RD$${Math.round(v).toLocaleString('en-US')}`;
const openAll = () => document.querySelectorAll('details.report-sec').forEach((d) => { d.open = true; });

export function Report({ query }) {
  const s = useApp();
  const today = s.energy.day;
  const hour = useHour();
  const cur = weekOf(today);
  const [wk, setWk] = useState(() => {
    const q = query && query.get('semana');
    return q && /^\d{4}-\d{2}-\d{2}$/.test(q) && q <= cur ? weekOf(q) : readyWeek(today, hour);
  });
  const rep = weeklyReport(s, wk, today);
  useEffect(() => { if (rep.complete && !(s.reports && s.reports.seen && s.reports.seen[wk])) act((st, t) => markSeen(st, wk, t)); }, [wk]);
  // Al imprimir (o guardar como PDF) se abren todas las secciones.
  useEffect(() => { window.addEventListener('beforeprint', openAll); return () => window.removeEventListener('beforeprint', openAll); }, []);
  const name = (s.profile.name || '').split(' ')[0];
  const text = () => reportText(rep, name);
  const copy = async () => { try { await navigator.clipboard.writeText(text()); toast('Informe copiado', 'copy'); } catch { toast('No se pudo copiar', 'info'); } };
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: `Informe semanal · ${rep.label}`, text: text() }); } catch { /* cancelado */ } } else copy();
  };
  const chooseFocus = (f) => {
    const same = rep.focusNext && rep.focusNext.key === f.key;
    act((st, t) => setFocus(st, wk, same ? null : f, t));
    toast(same ? 'Foco quitado' : `Tu foco de la próxima semana: ${f.text.toLowerCase()}`, 'target');
  };
  const runAction = (a) => {
    if (!a) return;
    if (a.kind === 'route') { go(a.href.replace(/^#/, '')); return; }
    if (a.kind === 'mission') { act((st, t) => addMission(st, a.mission, t)); toast(`Misión creada: ${a.mission.title}`, 'sword'); return; }
    if (a.kind === 'todo') {
      const ok = act((st, t) => {
        if (a.todo.src && st.todos.some((x) => x.src === a.todo.src && !x.done)) return false;
        const td = addTodo(st, { title: a.todo.title, cat: 'salud', due: addDays(t, 7) }, t);
        if (td && a.todo.src) td.src = a.todo.src;
        return !!td;
      });
      toast(ok ? 'Agregado a tus pendientes' : 'Ya está en tus pendientes', 'list');
    }
  };
  const claim = () => { if (act((st, t, ev) => claimFocus(st, wk, t, ev))) toast('Foco cumplido · +30 XP y 10 de oro', 'trophy'); };
  const m = rep.m;
  const cmpTxt = (a, b, f = (x) => String(x), better = 'up') => {
    if (a == null || b == null || a === b) return null;
    const up = a > b;
    return <span class="tiny" style={{ color: (better === 'up' ? up : !up) ? 'var(--good-ink)' : 'var(--vit-ink)', display: 'inline-flex', alignItems: 'center', gap: 2 }}><Icon name={up ? 'arrowup' : 'arrowdown'} size={12} />{f(Math.abs(a - b))}</span>;
  };
  const p = rep.prev;
  return (
    <main class="screen no-nav report">
      <TopBar backTo="/personaje" title="Informe semanal" heading right={<button type="button" class="icon-btn no-print" aria-label="Compartir el informe" onClick={share}><Icon name="send" /></button>} />
      <div class="between-c no-print" role="group" aria-label="Semana">
        <button type="button" class="icon-btn" aria-label="Semana anterior" onClick={() => setWk(addDays(wk, -7))}><Icon name="left" /></button>
        <span class="stack-xs center" style={{ display: 'flex', textAlign: 'center' }}>
          <span class="strong">Semana del {rep.label}</span>
          {rep.current && !rep.complete ? <span class="chip sm tone-ene" style={{ alignSelf: 'center' }}>En curso · hasta hoy</span> : <span class="tiny muted">lunes a domingo</span>}
        </span>
        <button type="button" class="icon-btn" aria-label="Semana siguiente" disabled={wk >= cur} onClick={() => setWk(addDays(wk, 7))}><Icon name="right" /></button>
      </div>
      <h2 class="print-only h2">Semana del {rep.label}</h2>
      <section class="card" aria-label="Tu semana en una frase" style={{ background: 'var(--crecimiento-soft)', borderColor: 'transparent' }}>
        <span class="eyebrow" style={{ color: 'var(--crecimiento-ink)' }}>Tu semana{name ? `, ${name}` : ''}</span>
        <p class="lead" style={{ color: 'var(--ink)', margin: 0 }}>{rep.sentence}</p>
      </section>
      {!rep.empty && (
        <div class="kpis four">
          <div class="kpi"><span class="v">{m.pct != null ? `${Math.round(m.pct * 100)} %` : '—'}</span><span class="l">Misiones {p && cmpTxt(m.pct != null ? Math.round(m.pct * 100) : null, p.pct != null ? Math.round(p.pct * 100) : null, (x) => `${x}`)}</span></div>
          <div class="kpi"><span class="v">{m.sleepAvg != null ? fmtHours(Math.round(m.sleepAvg * 4) / 4) : '—'}</span><span class="l">Sueño {p && cmpTxt(m.sleepAvg, p.sleepAvg, (x) => fmtHours(Math.round(x * 4) / 4))}</span></div>
          <div class="kpi"><span class="v">{m.equiv} min</span><span class="l">Actividad {p && cmpTxt(m.equiv, p.equiv)}</span></div>
          <div class="kpi"><span class="v" style={{ fontSize: 19 }}>{rd(m.spent)}</span><span class="l">Gastos {p && cmpTxt(m.spent, p.spent, rd, 'down')}</span></div>
        </div>
      )}
      {rep.focusPrev && (
        <section class="card" aria-label="Tu foco de esta semana">
          <div class="row-top">
            <span class="tile" style={{ background: rep.focusPrev.done ? 'var(--good-soft)' : 'var(--soft)', color: rep.focusPrev.done ? 'var(--good-ink)' : 'var(--ink)' }}><Icon name={rep.focusPrev.done ? 'trophy' : 'target'} /></span>
            <div class="stack-xs grow">
              <span class="eyebrow">Tu foco de esta semana</span>
              <span class="strong">{rep.focusPrev.text}</span>
              <span class="small muted">{rep.focusPrev.done ? '¡Lo cumpliste!' : rep.focusPrev.pending ? 'Vas bien: se confirma al cerrar la semana.' : rep.complete ? 'Esta vez no se logró. Puedes repetirlo o elegir otro.' : 'Todavía hay tiempo.'}{rep.focusPrev.value != null ? ` Llevas ${focusValue(rep.focusPrev)}.` : ''}</span>
            </div>
          </div>
          {rep.focusPrev.done && !rep.focusPrev.claimed && <button type="button" class="btn sm no-print" style={{ alignSelf: 'flex-start' }} onClick={claim}><Icon name="gift" size={17} />Cobrar · +30 XP y 10 de oro</button>}
          {rep.focusPrev.claimed && <span class="chip sm tone-good" style={{ alignSelf: 'flex-start' }}><Icon name="check" size={13} />Premio cobrado</span>}
        </section>
      )}
      {rep.wins.length > 0 && (
        <section class="stack-xs" aria-label="Lo que salió bien">
          <h2 class="eyebrow">Lo que salió bien</h2>
          {rep.wins.map((w) => (
            <div key={w.id} class="card tight" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <span class="tile sm" style={{ background: 'var(--good-soft)', color: 'var(--good-ink)' }}><Icon name={w.icon} size={18} /></span>
              <span class="stack-xs grow"><span class="semi">{w.title}</span><span class="small muted">{w.text}</span></span>
            </div>
          ))}
        </section>
      )}
      {rep.improve.length > 0 && (
        <section class="stack-xs" aria-label="Aspectos a mejorar">
          <h2 class="eyebrow">Aspectos a mejorar</h2>
          {rep.improve.map((x) => {
            const isFocus = rep.focusNext && x.focus && rep.focusNext.key === x.focus.key;
            return (
              <div key={x.id} class="card tight improve">
                <div class="row-top" style={{ gap: 12 }}>
                  <span class="tile sm" style={{ background: areaSoft(x.area), color: areaInk(x.area) }}><Icon name={x.icon} size={18} /></span>
                  <span class="stack-xs grow">
                    <span class="semi">{x.title}</span>
                    <span class="small muted">{x.text}</span>
                    {x.tip && <span class="small"><b>Prueba:</b> {x.tip}</span>}
                  </span>
                </div>
                {(x.focus || x.action) && (
                  <div class="row wrap no-print" style={{ gap: 8 }}>
                    {x.focus && <button type="button" class={`btn sm ${isFocus ? '' : 'soft'}`} aria-pressed={isFocus ? 'true' : 'false'} onClick={() => chooseFocus(x.focus)}><Icon name={isFocus ? 'check' : 'target'} size={16} />{isFocus ? 'Es tu foco' : 'Hacerlo mi foco'}</button>}
                    {x.action && <button type="button" class="btn sm soft" onClick={() => runAction(x.action)}><Icon name={x.action.kind === 'mission' ? 'sword' : x.action.kind === 'todo' ? 'list' : 'right'} size={16} />{x.action.label}</button>}
                  </div>
                )}
              </div>
            );
          })}
          {rep.focusNext && <span class="small muted">Foco de la próxima semana: <b>{rep.focusNext.text}</b>. Si lo cumples, en el próximo informe cobras +30 XP y 10 de oro.</span>}
          {!rep.focusNext && rep.improve.some((x) => x.focus) && <span class="tiny muted">Elige un solo foco: el próximo informe te dice si lo lograste.</span>}
        </section>
      )}
      {!rep.empty && rep.sections.map((sec) => (sec.rows.length ? (
        <details key={sec.key} class="card report-sec" open={sec.key === 'salud'}>
          <summary class="between-c" style={{ cursor: 'pointer', minHeight: 40 }}>
            <span class="row" style={{ gap: 10 }}><span class="tile sm" style={{ background: areaSoft(sec.area), color: areaColor(sec.area) }}><Icon name={sec.icon} size={17} /></span><span class="h2">{sec.title}</span></span>
            <Icon name="down" size={18} />
          </summary>
          <div>
            {sec.rows.map((r) => (
              <div key={r.label} class="lrow" style={{ cursor: 'default', alignItems: 'flex-start' }}>
                <span class="stack-xs grow"><span class="small semi">{r.label}</span>{r.note && <span class="tiny muted">{r.note}</span>}</span>
                <span class="stack-xs" style={{ alignItems: 'flex-end', textAlign: 'right', maxWidth: '58%' }}>
                  <span class="small strong tab-num">{r.value}</span>
                  {r.cmp && <span class="tiny" style={{ color: r.cmp.tone === 'good' ? 'var(--good-ink)' : r.cmp.tone === 'vit' ? 'var(--vit-ink)' : 'var(--muted)' }}>{r.cmp.text}</span>}
                </span>
              </div>
            ))}
          </div>
        </details>
      ) : null))}
      {rep.bills.length > 0 && (
        <section class="card" aria-label="Lo que viene">
          <h2 class="h2">Lo que viene la próxima semana</h2>
          {rep.bills.map((it, i) => (
            <div key={i} class="between-c small" style={{ minHeight: 34, gap: 8 }}>
              <span class="grow">{it.type === 'credit' ? it.c.name : it.type === 'card' ? accountLabel(it.a) : it.p ? it.p.name : 'Pago'}{it.status === 'late' ? ' · atrasado' : ''}</span>
              <span class="muted">{whenText(it.date, today)}</span>
              <b class="tab-num">{it.kind === 'ingreso' ? '+' : ''}{rd(it.dop != null ? it.dop : it.amount || 0)}</b>
            </div>
          ))}
        </section>
      )}
      <TrendCard s={s} today={today} wk={wk} />
      <div class="no-print"><WeeklyReviewCard s={s} today={today} day={wk} focusHint={rep.focusNext ? rep.focusNext.text : ''} /></div>
      <section class="row wrap no-print" style={{ gap: 8 }} aria-label="Compartir">
        <button type="button" class="btn sm soft grow" onClick={copy}><Icon name="copy" size={17} />Copiar</button>
        <button type="button" class="btn sm soft grow" onClick={share}><Icon name="send" size={17} />Compartir</button>
        <button type="button" class="btn sm soft grow" onClick={() => { openAll(); window.print(); }}><Icon name="printer" size={17} />Imprimir o PDF</button>
      </section>
      <span class="tiny muted">El informe compara con tu semana anterior y con tu promedio de 4 semanas. Los consejos de salud son generales: no reemplazan a tu médico.</span>
    </main>
  );
}

function focusValue(f) {
  const def = FOCUS[f.key];
  if (!def || f.value == null) return '';
  if (def.unit === '%') return `${f.value} %`;
  if (def.unit === 'RD$') return rd(f.value);
  if (f.key === 'bed_regular') return `±${Math.round(f.value / 2)} min`;
  return `${typeof f.value === 'number' ? f.value.toLocaleString('en-US') : f.value} ${def.unit}`;
}

// Tus últimas 8 semanas: cuatro barras pequeñas, una por medida (sin ejes dobles: cada una con su escala).
function TrendCard({ s, today, wk }) {
  const tr = reportTrend(s, today, 8, wk);
  const rows = [
    { key: 'pct', label: 'Misiones cumplidas', fmt: (v) => `${Math.round(v * 100)} %`, color: areaColor('crecimiento') },
    { key: 'sleep', label: 'Sueño promedio', fmt: (v) => fmtHours(Math.round(v * 4) / 4), color: areaColor('salud') },
    { key: 'active', label: 'Actividad', fmt: (v) => `${v} min`, color: areaColor('salud') },
    { key: 'pleasant', label: 'Ánimo agradable', fmt: (v) => `${Math.round(v * 100)} %`, color: areaColor('emocional') },
    { key: 'spent', label: 'Gastos', fmt: rd, color: areaColor('finanzas') },
  ].filter((r) => tr.filter((w) => w[r.key] != null && (r.key !== 'spent' || w[r.key] > 0) && (r.key !== 'active' || w[r.key] > 0)).length >= 2);
  if (!rows.length) return null;
  const W = 150; const H = 34;
  return (
    <section class="card" aria-label="Tus últimas 8 semanas">
      <h2 class="h2">Tus últimas 8 semanas</h2>
      {rows.map((r) => {
        const vals = tr.map((w) => w[r.key]);
        const max = Math.max(...vals.filter((v) => v != null), 1e-9);
        const bw = W / 8 - 4;
        const last = vals[vals.length - 1];
        return (
          <div key={r.key} class="between-c" style={{ gap: 10 }}>
            <span class="stack-xs grow" style={{ minWidth: 0 }}><span class="small semi">{r.label}</span><span class="tiny muted">{last != null ? `Esta semana: ${r.fmt(last)}` : 'Esta semana: sin datos'}</span></span>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${r.label}: ${tr.map((w, i) => `${fmtShort(w.wk)} ${vals[i] != null ? r.fmt(vals[i]) : 'sin datos'}`).join(', ')}`} style={{ flexShrink: 0 }}>
              {vals.map((v, i) => {
                const h = v != null ? Math.max(3, (v / max) * (H - 4)) : 2;
                return <rect key={i} x={i * (W / 8) + 2} y={H - h} width={bw} height={h} rx="3" fill={v == null ? 'var(--soft-2)' : r.color} opacity={i === vals.length - 1 ? 1 : 0.45}><title>{`Semana del ${fmtShort(tr[i].wk)}: ${v != null ? r.fmt(v) : 'sin datos'}`}</title></rect>;
              })}
            </svg>
          </div>
        );
      })}
      <span class="tiny muted">La barra más fuerte es la semana de este informe. Cada medida tiene su propia escala.</span>
    </section>
  );
}

// Para Hoy: el domingo desde las 6 p. m. y al inicio de la semana, si no lo has abierto.
export function ReportPrompt({ wk }) {
  return (
    <a href={`#/informe?semana=${wk}`} class="row" style={{ gap: 14, padding: 16, borderRadius: 20, background: 'var(--crecimiento-soft)', color: 'var(--crecimiento-ink)', textDecoration: 'none' }}>
      <span class="tile" style={{ background: 'var(--surface)', color: 'var(--crecimiento)' }}><Icon name="chart" /></span>
      <span class="stack-xs grow"><span class="strong">Tu informe de la semana está listo</span><span class="small">Lo que salió bien, lo que conviene mejorar y tu foco para la próxima.</span></span>
      <Icon name="right" size={18} />
    </a>
  );
}

