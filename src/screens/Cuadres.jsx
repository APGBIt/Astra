// Sobrantes y faltantes (2.1): la libreta de cuadres con el banco, el pronóstico que sale de ella y el cierre de
// cada mes. Los números salen de src/game/cuadres.js.
import { useMemo, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { TopBar, ScrollTabs, Sheet, SheetHead, TChip, cur, moneyR, plural, toast, Empty } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { go } from '../app/router.js';
import { fmtShort, monthKey, MONTHS } from '../app/dates.js';
import { catName, txOrig } from '../game/logic.js';
import {
  cuadresOf, cuadreOutlook, outlookLines, cuadreSeries, cuadreStatus, cuadreDOP, explainOf, setCuadreWhy, monthCloses, monthTitle,
  REASONS_OUT, REASONS_IN, STATUS_LABEL, CLEAN_DOP, reasonLabel,
} from '../game/cuadres.js';

const TABS = [['pronostico', 'Pronóstico'], ['cuadres', 'Cuadres'], ['meses', 'Cierres de mes']];
const rd = (v) => moneyR(Math.abs(v));
const sg = (v) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${moneyR(Math.abs(v))}`;
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const mshort = (mk) => cap(MONTHS[Number(mk.slice(5)) - 1].slice(0, 3));
const TONE = { bad: 'tone-xp', good: 'tone-good', '': '' };
const ST_TONE = { limpio: 'tone-good', repartido: 'tone-good', motivo: '', parcial: 'tone-xp', sin_explicar: 'tone-xp', inicio: '' };

export function Cuadres({ query }) {
  const s = useApp();
  const today = s.energy.day;
  const q0 = query && query.get('ver');
  const [tab, setTab] = useState(TABS.some(([k]) => k === q0) ? q0 : 'pronostico');
  const [open, setOpen] = useState(null);
  const o = useMemo(() => cuadreOutlook(s, today), [s, today]);
  return (
    <main class="screen no-nav">
      <TopBar backTo="/finanzas" title="Sobrantes y faltantes" heading />
      <ScrollTabs tabs={TABS} value={tab} onChange={setTab} label="Vistas de sobrantes y faltantes" sticky />
      {tab === 'pronostico' && <Outlook s={s} today={today} o={o} onOpen={setOpen} onList={() => setTab('cuadres')} />}
      {tab === 'cuadres' && <List s={s} today={today} onOpen={setOpen} />}
      {tab === 'meses' && <Closes s={s} today={today} />}
      {open && <CuadreSheet s={s} id={open} onClose={() => setOpen(null)} />}
    </main>
  );
}

// ---------- Pronóstico ----------

function Outlook({ s, today, o, onOpen, onList }) {
  const lines = outlookLines(o);
  const mt = o.mt;
  const any = cuadresOf(s).some((x) => x.mode !== 'inicio');
  return (
    <>
      <section class="card" aria-label="Lo que te augura">
        <div class="between-c"><span class="eyebrow" style={{ color: 'var(--finanzas-ink)' }}>Pronóstico</span>{o.conf && <span class={`chip sm ${o.conf === 'buena' ? 'tone-good' : ''}`}>{o.conf === 'buena' ? `Con ${plural(o.pairs, 'cuadre', 'cuadres')}` : 'Aún aprendiendo'}</span>}</div>
        {o.perMonth != null && Math.abs(o.perMonth) >= CLEAN_DOP ? (
          <span class="stack-xs">
            <span class="display-num tab-num" style={{ fontSize: 34, color: o.perMonth < 0 ? 'var(--vit-ink)' : 'var(--good-ink)' }}>{sg(o.perMonth)}<span class="small semi muted"> al mes</span></span>
            <span class="small strong">{o.perMonth < 0 ? 'Lo que se escapa sin anotar, en promedio' : 'Lo que suele sobrar al cuadrar'}</span>
          </span>
        ) : o.perMonth != null ? <h2 class="h2">Tus cuentas cuadran</h2> : <h2 class="h2">Todavía estoy aprendiendo tu ritmo</h2>}
        <div class="stack-sm">
          {lines.map((l) => (
            <div key={l.k} class={`note ${TONE[l.tone] || ''}`}>
              <Icon name={l.k === 'tendencia' ? (l.tone === 'good' ? 'arrowdown' : 'arrowup') : l.k === 'mes' ? 'calendar' : l.k === 'cuenta' ? 'bank' : l.k === 'fuga' ? 'drop' : l.k === 'motivo' ? 'search' : 'scale'} size={18} />
              <span class="stack-xs grow"><span>{l.text}</span>
                {l.acc && <button type="button" class="link-btn" style={{ alignSelf: 'flex-start', minHeight: 32, color: 'inherit' }} onClick={() => go(`/finanzas?tab=cuentas&cuenta=${l.acc}`)}>Cuadrar ahora <Icon name="right" size={14} /></button>}
              </span>
            </div>
          ))}
        </div>
        <span class="tiny muted">Sale de comparar lo que Astra calculaba con lo que decía tu banco cada vez que cuadraste, dividido por los días entre un cuadre y otro (últimos 4 meses). Es un promedio, no una promesa.</span>
      </section>

      <section class="card" aria-label="Este mes">
        <h2 class="h2">Este mes</h2>
        {mt.n ? (
          <>
            <div class="kpis3">
              <div class="stack-xs"><span class="tiny semi muted">Sobró</span><span class="strong tab-num kpi-v" style={{ color: 'var(--good-ink)' }}>{rd(mt.sobr)}</span></div>
              <div class="stack-xs"><span class="tiny semi muted">Faltó</span><span class="strong tab-num kpi-v" style={{ color: mt.falt > 0 ? 'var(--vit-ink)' : 'var(--ink)' }}>{rd(mt.falt)}</span></div>
              <div class="stack-xs"><span class="tiny semi muted">Neto</span><span class="strong tab-num kpi-v">{sg(mt.net)}</span><span class="kpi-sub">{plural(mt.n, 'cuadre', 'cuadres')}</span></div>
            </div>
            <span class="small muted">{mt.clean ? `${plural(mt.clean, 'cuadre limpio', 'cuadres limpios')} (diferencia de ${moneyR(CLEAN_DOP)} o menos). ` : ''}{mt.open ? `${plural(mt.open, 'diferencia', 'diferencias')} por explicar.` : mt.n > mt.clean ? 'Todo explicado.' : ''}</span>
            {mt.open > 0 && <button type="button" class="btn sm soft" style={{ alignSelf: 'flex-start' }} onClick={onList}><Icon name="search" size={17} />Explicar lo que falta</button>}
          </>
        ) : <span class="small muted">Este mes todavía no has cuadrado ninguna cuenta. Abre una cuenta en Finanzas → Cuentas y pon lo que dice tu banco.</span>}
      </section>

      {(o.accounts.length > 0 || o.never.length > 0) && (
        <section class="card flush" aria-label="Tus cuentas">
          <div style={{ padding: '14px 0 4px' }}><h2 class="h2">Por cuenta</h2><span class="small muted">Cuándo la cuadraste y cuánto esperar si la cuadras hoy.</span></div>
          {o.accounts.map((r) => (
            <button key={`${r.acc}${r.c}`} type="button" class="lrow" style={{ minHeight: 60 }} onClick={() => go(`/finanzas?tab=cuentas&cuenta=${r.acc}`)}>
              <span class="tile sm" style={{ background: 'var(--finanzas-soft)', color: 'var(--finanzas-ink)' }}><Icon name={r.card ? 'card' : 'bank'} size={17} /></span>
              <span class="stack-xs grow" style={{ minWidth: 0 }}>
                <span class="semi clip">{r.name}{r.c === 'USD' ? ' (US$)' : ''}</span>
                <span class="tiny muted semi" style={r.stale ? { color: 'var(--vit-ink)' } : null}>{r.since === 0 ? 'Cuadrada hoy' : `Hace ${plural(r.since, 'día', 'días')}`}{r.perDay != null && Math.abs(r.perDay * 30.4) >= CLEAN_DOP ? ` · ${r.perDay < 0 ? 'se escapan' : 'sobran'} ${rd(r.perDay * 30.4)} al mes` : ''}</span>
              </span>
              {r.exp != null && Math.abs(r.exp) >= CLEAN_DOP ? <span class="stack-xs" style={{ alignItems: 'flex-end', gap: 0 }}><span class="tiny muted semi">Espera</span><span class="strong tab-num">{sg(r.exp)}</span></span> : null}
              <Icon name="right" size={15} />
            </button>
          ))}
          {o.never.map((r) => (
            <button key={r.a.id} type="button" class="lrow" style={{ minHeight: 56 }} onClick={() => go(`/finanzas?tab=cuentas&cuenta=${r.a.id}`)}>
              <span class="tile sm" style={{ background: 'var(--soft)' }}><Icon name={r.a.kind === 'tarjeta' ? 'card' : 'bank'} size={17} /></span>
              <span class="stack-xs grow" style={{ minWidth: 0 }}><span class="semi clip">{r.a.name}</span><span class="tiny muted semi">Sin cuadrar desde que pusiste el saldo{r.since > 0 ? ` (hace ${plural(r.since, 'día', 'días')})` : ''}</span></span>
              <span class="small strong">Cuadrar</span><Icon name="right" size={15} />
            </button>
          ))}
        </section>
      )}

      {any && <SeriesCard s={s} today={today} />}
      {any && <WhyCard s={s} today={today} o={o} />}
      {!any && (
        <section class="card">
          <h2 class="h2">¿Qué es cuadrar?</h2>
          <span class="small">Es poner lo que dice tu banco (o lo que hay en tu cartera) y ver si coincide con lo que anotaste. Lo que no coincide es un <b>faltante</b> (salió dinero que no anotaste) o un <b>sobrante</b> (entró dinero que no anotaste). Cada cuadre queda guardado aquí; con dos o tres, te digo cuánto se te escapa al mes y cuánto esperar la próxima vez.</span>
          <button type="button" class="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => go('/finanzas?tab=cuentas')}><Icon name="bank" size={18} />Ir a mis cuentas</button>
        </section>
      )}
    </>
  );
}

// Barras de 6 meses: hacia arriba lo que sobró, hacia abajo lo que faltó; la raya, el neto.
function SeriesCard({ s, today }) {
  const rows = cuadreSeries(s, today, 6);
  const [tip, setTip] = useState(null);
  if (!rows.some((r) => r.n)) return null;
  const W = 340; const H = 170; const L = 44; const R = 6; const T = 10; const B = 26;
  const max = Math.max(...rows.map((r) => Math.max(r.sobr, r.falt)), 1);
  const mid = T + (H - T - B) / 2;
  const half = (H - T - B) / 2;
  const y = (v) => mid - (v / max) * half;
  const gw = (W - L - R) / rows.length;
  const bw = Math.min(26, gw - 14);
  const bar = (x0, v, cls, label) => {
    if (!(Math.abs(v) > 0)) return null;
    const y1 = y(v);
    const top = Math.min(mid, y1); const h = Math.abs(y1 - mid);
    if (h < 0.5) return null;
    return <rect x={x0} y={top} width={bw} height={h} rx={Math.min(4, h / 2)} class={cls}><title>{label}</title></rect>;
  };
  const shortN = (v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v)));
  return (
    <section class="card" aria-label="Sobrantes y faltantes por mes">
      <h2 class="h2">Mes a mes</h2>
      <div class="legend"><span><i class="sw mb-fixed" />Sobró</span><span><i class="sw mb-daily" />Faltó</span><span><i class="sw mark" />Neto</span></div>
      <div class="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={rows.map((r) => `${mshort(r.mk)}: sobró ${moneyR(r.sobr)}, faltó ${moneyR(r.falt)}`).join('. ')}>
          {[max, 0, -max].map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} class="grid" />
              <text x={L - 6} y={y(v) + 4} text-anchor="end" class="axis">{v > 0 ? `+${shortN(v)}` : v < 0 ? `−${shortN(-v)}` : '0'}</text>
            </g>
          ))}
          {rows.map((r, i) => {
            const x0 = L + i * gw + (gw - bw) / 2;
            return (
              <g key={r.mk} onPointerDown={() => setTip(tip === i ? null : i)} style={{ cursor: 'pointer' }}>
                <rect x={L + i * gw} y={T} width={gw} height={H - T - B} fill="transparent" />
                {bar(x0, r.sobr, 'cf-fixed', `${mshort(r.mk)}: sobró ${moneyR(r.sobr)}`)}
                {bar(x0, -r.falt, 'cf-daily', `${mshort(r.mk)}: faltó ${moneyR(r.falt)}`)}
                {r.n > 0 && <line x1={x0 - 5} x2={x0 + bw + 5} y1={y(r.net)} y2={y(r.net)} class="cf-income"><title>{`${mshort(r.mk)}: neto ${sg(r.net)}`}</title></line>}
                <text x={L + i * gw + gw / 2} y={H - 8} text-anchor="middle" class="axis strong-axis">{mshort(r.mk)}{r.current ? '*' : ''}</text>
              </g>
            );
          })}
        </svg>
        {tip != null && rows[tip] && (
          <div class="tip" style={{ left: `${Math.min(64, Math.max(6, ((L + tip * gw) / W) * 100))}%` }}>
            <b>{cap(monthTitle(rows[tip].mk))}</b>
            <span>Sobró: {moneyR(rows[tip].sobr)}</span>
            <span>Faltó: {moneyR(rows[tip].falt)}</span>
            <span>{plural(rows[tip].n, 'cuadre', 'cuadres')}{rows[tip].clean ? ` · ${rows[tip].clean} limpios` : ''}</span>
          </div>
        )}
      </div>
      <span class="tiny muted">Cada mes cuenta los cuadres que hiciste en él. * El mes en curso. Toca un mes para ver los montos.</span>
      <details class="table-view"><summary>Ver como tabla</summary>
        <table><thead><tr><th>Mes</th><th>Sobró</th><th>Faltó</th><th>Neto</th><th>Cuadres</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.mk}><td>{mshort(r.mk)}</td><td class="tab-num">{moneyR(r.sobr)}</td><td class="tab-num">{moneyR(r.falt)}</td><td class="tab-num">{sg(r.net)}</td><td class="tab-num">{r.n}</td></tr>)}</tbody>
        </table>
      </details>
    </section>
  );
}

// Por qué faltó: lo que dijiste en cada cuadre (o lo repartido), en 3 meses.
function WhyCard({ s, today, o }) {
  const rows = useMemo(() => {
    const out = {};
    for (const x of cuadresOf(s)) {
      if (x.mode === 'inicio' || x.diff == null || !(x.diff < 0)) continue;
      const v = -cuadreDOP(s, x);
      if (v <= CLEAN_DOP) continue;
      const st = cuadreStatus(s, x);
      const k = x.why ? reasonLabel(x) : st === 'repartido' ? 'Repartido en categorías' : st === 'parcial' ? 'A medias' : 'Sin explicar';
      out[k] = (out[k] || 0) + v;
    }
    return Object.entries(out).sort((a, b) => b[1] - a[1]);
  }, [s, today]);
  if (!rows.length) return null;
  const total = rows.reduce((a, [, v]) => a + v, 0);
  return (
    <section class="card" aria-label="Por qué faltó">
      <h2 class="h2">Por qué faltó</h2>
      <span class="small muted">Todos tus faltantes guardados, por motivo. Explicar cada uno te dice dónde está la fuga.</span>
      <div class="stack-sm">
        {rows.map(([k, v]) => (
          <div key={k} class="stack-xs">
            <div class="between-c"><span class="small semi">{k}</span><span class="small strong tab-num">{moneyR(v)} · {Math.round((v / total) * 100)} %</span></div>
            <div class="mbar" aria-hidden="true"><i class={k === 'Sin explicar' || k === 'A medias' ? 'mb-daily' : 'mb-fixed'} style={{ width: `${Math.max(2, (v / total) * 100)}%`, borderRadius: 8 }} /></div>
          </div>
        ))}
      </div>
      {o.openDop > 0 && <span class="small muted">En los últimos 3 meses quedan {moneyR(o.openDop)} sin explicar.</span>}
    </section>
  );
}

// ---------- Lista de cuadres ----------

const FILTERS = [['todos', 'Todos'], ['abiertos', 'Por explicar'], ['faltantes', 'Faltantes'], ['sobrantes', 'Sobrantes']];

function List({ s, today, onOpen }) {
  const [f, setF] = useState('todos');
  const all = [...cuadresOf(s)].reverse().filter((x) => x.mode !== 'inicio' && x.diff != null);
  const list = all.filter((x) => {
    const v = cuadreDOP(s, x);
    if (f === 'faltantes') return v < -CLEAN_DOP;
    if (f === 'sobrantes') return v > CLEAN_DOP;
    if (f === 'abiertos') { const st = cuadreStatus(s, x); return st === 'sin_explicar' || st === 'parcial'; }
    return true;
  });
  const groups = [];
  for (const x of list.slice(0, 300)) {
    const mk = monthKey(x.day);
    if (!groups.length || groups[groups.length - 1].mk !== mk) groups.push({ mk, xs: [] });
    groups[groups.length - 1].xs.push(x);
  }
  return (
    <>
      <div class="chips" role="group" aria-label="Qué cuadres ver">
        {FILTERS.map(([k, l]) => <TChip key={k} sm on={f === k} onClick={() => setF(k)}>{l}</TChip>)}
      </div>
      {!all.length && <Empty icon="scale" action={<button type="button" class="btn sm" onClick={() => go('/finanzas?tab=cuentas')}><Icon name="bank" size={18} />Ir a mis cuentas</button>}>Todavía no hay cuadres. Cuando pongas lo que dice tu banco en una cuenta, la diferencia queda guardada aquí.</Empty>}
      {all.length > 0 && !list.length && <p class="small muted">{f === 'abiertos' ? 'Nada por explicar. Todo cuadra.' : 'No hay cuadres de este tipo.'}</p>}
      {groups.map((g) => {
        const net = g.xs.reduce((a, x) => a + cuadreDOP(s, x), 0);
        return (
          <section key={g.mk} class="card flush" aria-label={monthTitle(g.mk)}>
            <div class="between-c" style={{ padding: '12px 0 4px' }}><span class="eyebrow">{cap(monthTitle(g.mk))}</span><span class="small strong tab-num">{sg(net)}</span></div>
            {g.xs.map((x) => {
              const st = cuadreStatus(s, x);
              const v = cuadreDOP(s, x);
              return (
                <button key={x.id} type="button" class="lrow" style={{ minHeight: 60 }} onClick={() => onOpen(x.id)}>
                  <span class="tile sm" style={{ background: v < -CLEAN_DOP ? 'var(--xp-soft)' : v > CLEAN_DOP ? 'var(--good-soft)' : 'var(--soft)', color: v < -CLEAN_DOP ? 'var(--xp-ink)' : v > CLEAN_DOP ? 'var(--good-ink)' : 'var(--ink)' }}>
                    <Icon name={v < -CLEAN_DOP ? 'arrowdown' : v > CLEAN_DOP ? 'arrowup' : 'check'} size={17} />
                  </span>
                  <span class="stack-xs grow" style={{ minWidth: 0 }}>
                    <span class="semi clip">{x.name}</span>
                    <span class="tiny muted semi clip">{fmtShort(x.day)}{x.time ? `, ${x.time}` : ''} · {x.mode === 'reiniciar' ? 'solo saldo' : v < -CLEAN_DOP ? 'faltó' : v > CLEAN_DOP ? 'sobró' : 'cuadró'}{x.why ? ` · ${reasonLabel(x).toLowerCase()}` : ''}</span>
                  </span>
                  <span class="stack-xs" style={{ alignItems: 'flex-end', gap: 2 }}>
                    <span class="strong tab-num">{x.diff === 0 ? '—' : `${x.diff < 0 ? '−' : '+'}${cur(Math.abs(x.diff), x.c)}`}</span>
                    <span class={`chip sm ${ST_TONE[st] || ''}`}>{STATUS_LABEL[st]}</span>
                  </span>
                </button>
              );
            })}
          </section>
        );
      })}
    </>
  );
}

// ---------- Un cuadre ----------

function CuadreSheet({ s, id, onClose }) {
  const x = cuadresOf(s).find((y) => y.id === id);
  const [note, setNote] = useState(x ? x.note : '');
  if (!x) return null;
  const st = cuadreStatus(s, x);
  const e = explainOf(s, x);
  const out = x.diff < 0;
  const reasons = out ? REASONS_OUT : REASONS_IN;
  // En una tarjeta, lo que debes (positivo); en una cuenta, el saldo con su signo.
  const shown = (v) => (v == null ? '—' : x.card ? cur(Math.abs(v), x.c) : `${v < 0 ? '−' : ''}${cur(Math.abs(v), x.c)}`);
  const diffTxt = cur(Math.abs(x.diff || 0), x.c);
  const t = x.tx ? s.money.tx.find((y) => y.id === x.tx) : null;
  const pick = (k) => { act((st2) => setCuadreWhy(st2, x.id, x.why === k ? '' : k, note)); };
  const saveNote = () => { if (note !== x.note) { act((st2) => setCuadreWhy(st2, x.id, x.why, note)); toast('Nota guardada', 'check'); } };
  return (
    <Sheet onClose={() => { saveNote(); onClose(); }} label="Cuadre">
      <SheetHead title={x.diff === 0 ? 'Cuadró' : out ? 'Faltó dinero' : 'Sobró dinero'} onClose={() => { saveNote(); onClose(); }} />
      <span class="small muted">{x.name} · {fmtShort(x.day)}{x.time ? `, ${x.time}` : ''}{x.src ? ` · ${x.src}` : ''}</span>
      <div class="calc" role="group" aria-label="El cuadre">
        <div class="calc-row"><span>Astra calculaba{x.card ? ' (deuda)' : ''}</span><span class="tab-num">{shown(x.was)}</span></div>
        <div class="calc-row"><span>El banco decía{x.card ? ' (deuda)' : ''}</span><span class="tab-num">{shown(x.now)}</span></div>
        <div class="calc-row" style={{ fontWeight: 800 }}><span>{out ? 'Faltó' : x.diff > 0 ? 'Sobró' : 'Diferencia'}</span><span class="tab-num">{diffTxt}</span></div>
        {x.exp != null && <div class="calc-row"><span>Con tu ritmo esperaba</span><span class="tab-num">{sg(x.exp)}</span></div>}
      </div>
      <span class={`chip sm ${ST_TONE[st] || ''}`} style={{ alignSelf: 'flex-start' }}>{STATUS_LABEL[st]}</span>
      {x.mode === 'reiniciar' && <span class="small muted">Lo guardaste con «solo poner el saldo»: no se anotó ningún movimiento, pero la diferencia queda aquí para que sepas que existió.</span>}
      {st !== 'limpio' && x.diff !== 0 && (
        <>
          {x.tx && !e.gone && (
            <div class="stack-xs">
              <span class="label">{e.explained > 0 ? 'Repartido en categorías' : 'Anotado como'}</span>
              {e.parts.map((p) => <div key={p.id} class="between-c"><span class="small semi">{catName(s, p.cat)}</span><span class="small strong tab-num">{cur(txOrig(p), x.c)}</span></div>)}
              {e.left > 0.01 && <span class="tiny muted">Faltan {cur(e.left, x.c)} por repartir.</span>}
              <div class="row wrap" style={{ gap: 8 }}>
                {e.left > 0.01 && <button type="button" class="btn sm" onClick={() => go(`/finanzas?dividir=${x.tx}`)}><Icon name="scissors" size={17} />Repartir en categorías</button>}
                {t && <button type="button" class="btn sm ghost" onClick={() => go(`/finanzas?mov=${x.tx}`)}><Icon name="receipt" size={17} />Ver el movimiento</button>}
              </div>
            </div>
          )}
          {e.gone && <span class="small muted">El movimiento del ajuste ya no está (lo borraste), pero el cuadre sigue guardado.</span>}
          <span class="label">¿Qué fue?</span>
          <div class="chips" role="group" aria-label="Qué fue">
            {reasons.map(([k, l]) => <TChip key={k} sm on={x.why === k} onClick={() => pick(k)}>{l}</TChip>)}
          </div>
          <input class="input" value={note} maxLength={200} placeholder="Nota (por ejemplo: el almuerzo del viernes)" aria-label="Nota" onInput={(ev) => setNote(ev.currentTarget.value)} onBlur={saveNote} />
        </>
      )}
      {st === 'limpio' && <div class="note tone-good"><Icon name="check" size={18} /><span>Cuadre limpio: la diferencia fue de {moneyR(CLEAN_DOP)} o menos.</span></div>}
    </Sheet>
  );
}

// ---------- Cierres de mes ----------

function Closes({ s, today }) {
  const list = useMemo(() => monthCloses(s, today, 6), [s, today]);
  if (!list.length) return <Empty icon="calendar">Cuando termine tu primer mes con movimientos, aquí queda cómo cerró: lo que sobró o faltó del plan y de cada presupuesto.</Empty>;
  return (
    <>
      <p class="small muted" style={{ margin: 0 }}>Cómo terminó cada mes. Se guarda al empezar el mes siguiente; los meses de antes de esta versión se calculan con lo que tienes anotado.</p>
      {list.map((c) => <CloseCard key={c.mk} c={c} />)}
    </>
  );
}

function CloseCard({ c }) {
  const [open, setOpen] = useState(false);
  const over = c.budgets.filter((b) => b.left < -0.5);
  const under = c.budgets.filter((b) => b.left > 0.5);
  // El pronóstico de mediados de mes (el primero desde el día 8), para ver si acertó.
  const lastPron = c.pron && c.pron.length ? c.pron.find((x) => Number(x.day.slice(8)) >= 8) || c.pron[0] : null;
  return (
    <section class="card" aria-label={`Cierre de ${monthTitle(c.mk)}`}>
      <div class="between-c"><span class="eyebrow">{cap(monthTitle(c.mk))}</span>{!c.saved && <span class="chip sm">Calculado</span>}</div>
      {c.income > 0 ? (
        <span class="stack-xs">
          <span class="h2 tab-num" style={{ margin: 0, color: c.left < 0 ? 'var(--vit-ink)' : 'var(--good-ink)' }}>{c.left >= 0 ? `Te sobraron ${rd(c.left)}` : `Te faltaron ${rd(c.left)}`}</span>
          <span class="small muted">Entró {moneyR(c.income)}: {moneyR(c.fixed)} en fijos y cuotas{c.funds > 0 ? `, ${moneyR(c.funds)} apartado` : ''} y {moneyR(c.variable)} en el día a día.</span>
        </span>
      ) : <span class="small muted">Sin ingresos anotados ese mes: {moneyR(c.variable)} en el día a día.</span>}
      {(c.n > 0) && <span class="small">{c.falt > 0 || c.sobr > 0 ? `Al cuadrar: faltaron ${moneyR(c.falt)} y sobraron ${moneyR(c.sobr)}` : 'Todos tus cuadres fueron limpios'} ({plural(c.n, 'cuadre', 'cuadres')}).</span>}
      {lastPron && c.income > 0 && <span class="small muted">El {fmtShort(lastPron.day)} pronosticaba {lastPron.end >= 0 ? `que sobrarían ${rd(lastPron.end)}` : `que faltarían ${rd(lastPron.end)}`}{lastPron.withLeak != null && Math.abs(lastPron.withLeak - lastPron.end) >= CLEAN_DOP ? ` (${rd(lastPron.withLeak)} contando lo que se escapa)` : ''}. {Math.abs(c.left - lastPron.end) <= Math.max(500, Math.abs(c.income) * 0.03) ? 'Acertó.' : c.left > lastPron.end ? 'Terminó mejor.' : 'Terminó peor.'}</span>}
      {c.budgets.length > 0 && (
        <>
          <span class="small semi">{over.length ? `${plural(over.length, 'presupuesto', 'presupuestos')} con faltante` : 'Ningún presupuesto se pasó'}{under.length ? ` · ${under.length} con sobrante` : ''}</span>
          <button type="button" class="link-btn" style={{ alignSelf: 'flex-start', minHeight: 32 }} aria-expanded={open ? 'true' : 'false'} onClick={() => setOpen(!open)}>{open ? 'Ocultar presupuestos' : 'Ver cada presupuesto'} <Icon name={open ? 'arrowup' : 'down'} size={14} /></button>
          {open && (
            <div class="stack-xs">
              {c.budgets.map((b) => (
                <div key={b.id} class="between-c">
                  <span class="stack-xs" style={{ gap: 0 }}><span class="small semi">{b.name}</span><span class="tiny muted">{moneyR(b.spent)} de {moneyR(b.avail)}</span></span>
                  <span class="small strong tab-num" style={{ color: b.left < 0 ? 'var(--vit-ink)' : 'var(--good-ink)' }}>{b.left < 0 ? `Faltó ${rd(b.left)}` : `Sobró ${rd(b.left)}`}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ---------- Tarjeta en el Resumen de Finanzas ----------

export function CuadreCard({ s, today }) {
  const o = useMemo(() => cuadreOutlook(s, today), [s, today]);
  const hasBase = s.money.accounts.some((a) => a.base && !a.hidden);
  if (!hasBase) return null;
  const lines = outlookLines(o);
  const first = lines[0];
  const stale = [...o.accounts.filter((r) => r.stale), ...o.never.filter((r) => r.since >= 14)].length;
  const mt = o.mt;
  return (
    <a href="#/cuadres" class="card" style={{ textDecoration: 'none', color: 'var(--ink)' }} aria-label="Sobrantes y faltantes">
      <div class="row">
        <span class="tile" style={{ background: 'var(--finanzas-soft)', color: 'var(--finanzas-ink)' }}><Icon name="scale" /></span>
        <span class="stack-xs grow" style={{ minWidth: 0 }}>
          <span class="strong">Sobrantes y faltantes</span>
          <span class="small muted">{mt.n ? `Este mes: ${mt.falt > 0 ? `faltaron ${rd(mt.falt)}` : 'nada faltó'}${mt.sobr > 0 ? `, sobraron ${rd(mt.sobr)}` : ''}` : 'Sin cuadres este mes'}{stale ? ` · ${plural(stale, 'cuenta', 'cuentas')} por cuadrar` : ''}</span>
        </span>
        <Icon name="right" size={18} />
      </div>
      {first && <span class="small" style={first.tone === 'bad' ? { color: 'var(--vit-ink)', fontWeight: 600 } : null}>{first.text}</span>}
      {lines.find((l) => l.k === 'mes') && <span class="small muted">{lines.find((l) => l.k === 'mes').text}</span>}
    </a>
  );
}
