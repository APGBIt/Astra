// Análisis (1.7): cómo entra y sale tu dinero, el ritmo del mes, categorías frente a tu promedio,
// comercios, calendario, días de la semana y cuentas. Colores validados para daltonismo en claro y oscuro.
import { adjustTotals } from '../game/reconcile.js';
import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { TChip, money, plural } from '../ui/kit.jsx';
import { DAYS, DAYS_SHORT, fmtShort, monthKey, monthName, weekday } from '../app/dates.js';
import { catOf } from '../game/logic.js';
import {
  PERIODS, periodOf, cashflow, totals, categoryStats, merchantStats, accountStats, weekdayStats, dailyTotals, paceSeries,
  monthProjection, insights, monthShort, prevMonth, compareTotals, groupStats, incomeStats, smallSpends, bankCosts, healthSnapshot, moodMoney,
  debtLoad, emergencyFund, subscriptionStats, loanCosts,
} from '../game/stats.js';
import { workInfo, workHours, fmtWork } from '../game/ledger.js';
import { WorkCalc } from './FinTools.jsx';
import { WorthCard } from './Loans.jsx';
import { Bar } from '../ui/kit.jsx';

const pct = (v) => { const n = Math.round((v || 0) * 100); return `${n < 0 ? '−' : ''}${Math.abs(n)} %`; };
// «12 mil», «1.5 mil», «850».
export const short = (v) => {
  const a = Math.abs(v);
  const t = a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)} M` : a >= 1000 ? `${(a / 1000).toFixed(a >= 10000 ? 0 : 1)} mil` : `${Math.round(a)}`;
  return `${v < 0 ? '−' : ''}${t.replace('.0 ', ' ')}`;
};
const niceMax = (v) => {
  if (!(v > 0)) return 1000;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => m <= x) || 10) * p;
};
const whole = (v) => money(Math.round(v || 0));
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
// «los lunes», «los sábados».
const daysPlural = (d) => (/s$/.test(d) ? d : `${d}s`);

const VIEWS = [['resumen', 'Resumen'], ['gastos', 'Gastos'], ['ingresos', 'Ingresos'], ['deudas', 'Deudas y ahorro'], ['vida', 'Tu vida']];

export function Analysis({ s, today, onCat, setSheet = () => {} }) {
  const [per, setPer] = useState('mes');
  const [view, setView] = useState('resumen');
  const period = periodOf(per, today);
  const tot = totals(s, period.from, period.to);
  const cmp = compareTotals(s, period, today);
  const wi = workInfo(s, today);
  const single = period.mks.length === 1;
  const cfMks = period.mks.length >= 3 ? period.mks : (() => { const m = [monthKey(today)]; while (m.length < 6) m.unshift(prevMonth(m[0])); return m; })();
  const any = s.money.tx.some((t) => t.day >= period.from && t.day <= period.to);
  const adj = adjustTotals(s, period.from, period.to);
  const ch = (d, good) => (d == null || Math.abs(d) < 0.01 ? null : <span class="row" style={{ gap: 2, color: (d > 0) === good ? 'var(--good-ink)' : 'var(--vit-ink)' }}><Icon name={d > 0 ? 'arrowup' : 'arrowdown'} size={12} />{pct(Math.abs(d))}</span>);
  return (
    <>
      <div class="chips stat-periods" role="group" aria-label="Período">
        {PERIODS.map(([k, l]) => <TChip key={k} sm on={per === k} onClick={() => setPer(k)}>{l}</TChip>)}
      </div>
      <section class="card" aria-label="Ingresos y gastos del período">
        <div class={`kpis3${[tot.income, tot.spent, tot.net].some((v) => whole(Math.abs(v)).length > 10) ? ' stack' : ''}`}>
          <div class="stack-xs"><span class="tiny semi muted">Ingresos</span><span class="strong tab-num kpi-v">{whole(tot.income)}</span>{cmp.any && <span class="tiny semi">{ch(cmp.dIncome, true)}</span>}</div>
          <div class="stack-xs"><span class="tiny semi muted">Gastos</span><span class="strong tab-num kpi-v">{whole(tot.spent)}</span>{cmp.any && <span class="tiny semi">{ch(cmp.dSpent, false)}</span>}</div>
          <div class="stack-xs"><span class="tiny semi muted">{tot.net >= 0 ? 'Te quedó' : 'Gastaste de más'}</span><span class="strong tab-num kpi-v" style={{ color: tot.net < 0 ? 'var(--vit-ink)' : 'var(--ink)' }}>{whole(Math.abs(tot.net))}</span></div>
        </div>
        <span class="small muted">
          {tot.rate != null ? (tot.rate >= 0 ? `Guardaste el ${pct(tot.rate)} de lo que entró. ` : 'Salió más de lo que entró. ') : ''}
          {tot.n ? `${plural(tot.n, 'gasto', 'gastos')} · ${whole(tot.perDay)} por día en promedio.` : 'Sin gastos en este período.'}
          {cmp.any ? ` Las flechas comparan con ${cmp.label} (${whole(cmp.prev.spent)} de gastos).` : ''}
        </span>
        {wi.ready && tot.spent > 0 && <span class="small semi row hrs" style={{ color: 'var(--finanzas-ink)' }}><Icon name="clock" size={14} />Lo que gastaste son {fmtWork(workHours(tot.spent, wi), wi)} de tu trabajo.</span>}
      </section>

      {adj.n > 0 && (adj.out > 0 || adj.in > 0) && (
        <section class="note tone-xp" aria-label="Movimientos sin explicar">
          <Icon name="search" size={18} />
          <span class="stack-xs"><span class="semi">Hay {adj.out > 0 ? `${whole(adj.out)} de gastos sin anotar` : ''}{adj.out > 0 && adj.in > 0 ? ' y ' : ''}{adj.in > 0 ? `${whole(adj.in)} de ingresos sin anotar` : ''}</span>
            <span class="small">Salen de cuadrar tus cuentas con el banco. Entra a Movimientos, ábrelos y ponles su categoría para que el análisis sea real.</span></span>
        </section>
      )}
      <div class="seg fin-tabs" role="tablist" aria-label="Qué quieres ver">
        {VIEWS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={view === k ? 'true' : 'false'} onClick={() => setView(k)}>{l}</button>)}
      </div>
      {view === 'resumen' && (
        <>
          {per === 'mes' && <Insights s={s} today={today} onCat={onCat} />}
          {per === 'mes' && <PaceCard s={s} today={today} />}
          <HealthCard s={s} today={today} />
          <CashflowCard s={s} mks={cfMks} today={today} />
          <WorthCard s={s} today={today} />
        </>
      )}
      {view === 'gastos' && (
        <>
          {any && <CategoriesCard s={s} period={period} today={today} onCat={onCat} wi={wi} />}
          {any && <MerchantsCard s={s} period={period} />}
          <SubsCard s={s} today={today} onCat={onCat} />
          {any && <BankCard s={s} period={period} wi={wi} onTax={() => setSheet({ kind: 'tax' })} />}
          {single && any && <CalendarCard s={s} mk={period.mks[0]} today={today} />}
          {any && <WeekdayCard s={s} period={period} />}
        </>
      )}
      {view === 'ingresos' && (
        <>
          {any && <IncomeCard s={s} period={period} />}
          {any && <WorkCard s={s} period={period} wi={wi} onSet={() => setSheet({ kind: 'work' })} />}
          {!tot.income && <p class="small muted" style={{ textAlign: 'center' }}>Aquí verás de dónde viene tu dinero cuando registres ingresos en este período.</p>}
        </>
      )}
      {view === 'deudas' && (
        <>
          <DebtLoadCard s={s} today={today} onDebts={() => setSheet({ kind: 'debts' })} />
          <LoanCostCard s={s} period={period} />
          <EmergencyCard s={s} today={today} />
          {any && <AccountsCard s={s} period={period} />}
        </>
      )}
      {view === 'vida' && (
        <>
          <MoodMoneyCard s={s} today={today} onCat={onCat} />
          {any && <AntsCard s={s} period={period} wi={wi} onCat={onCat} />}
        </>
      )}
      {!any && (view === 'resumen' || view === 'gastos') && <p class="small muted" style={{ textAlign: 'center' }}>Cuando registres o importes movimientos de este período, aquí verás tus números.</p>}
    </>
  );
}

function Insights({ s, today, onCat }) {
  const list = insights(s, today);
  if (!list.length) return null;
  return (
    <section class="card" aria-label="Lo que cambió">
      <h2 class="h2">Lo que cambió</h2>
      {list.map((x) => (
        <button key={x.key} type="button" class="insight" disabled={!x.cat} onClick={() => x.cat && onCat(x.cat)}>
          <span class="tile xs" style={{ background: x.tone === 'vit' ? 'var(--vit-soft)' : 'var(--finanzas-soft)', color: x.tone === 'vit' ? 'var(--vit-ink)' : 'var(--finanzas-ink)' }}>
            <Icon name={x.icon === 'up' ? 'arrowup' : x.icon === 'down' ? 'arrowdown' : x.icon} size={15} />
          </span>
          <span class="small grow" style={{ textAlign: 'left' }}>{x.text}</span>
          {x.cat && <Icon name="right" size={16} />}
        </button>
      ))}
    </section>
  );
}

// ---------- Ritmo del mes ----------

function PaceCard({ s, today }) {
  const p = paceSeries(s, today);
  const pr = monthProjection(s, today);
  const [hover, setHover] = useState(null);
  const W = 340; const H = 170; const L = 40; const R = 12; const T = 12; const B = 22;
  const vals = [...p.cur, ...(p.prev || []), pr.projected];
  const max = niceMax(Math.max(...vals, 1));
  const prevName = cap(monthName(p.prevMk).split(' ')[0]);
  const x = (i) => L + (i / Math.max(1, p.len - 1)) * (W - L - R);
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const lastI = p.cur.length - 1;
  const ticks = [0, max / 2, max];
  const hv = hover != null ? { d: hover + 1, cur: p.cur[hover], prev: p.prev ? p.prev[Math.min(hover, p.prev.length - 1)] : null } : null;
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * (p.len - 1));
    setHover(Math.max(0, Math.min(p.len - 1, i)));
  };
  const label = `Llevas ${whole(p.cur[lastI] || 0)} al día ${lastI + 1}${p.prev ? `; en ${prevName.toLowerCase()} a esta altura llevabas ${whole(p.prev[Math.min(lastI, p.prev.length - 1)])}` : ''}; a este ritmo terminarías en unos ${whole(pr.projected)}.`;
  return (
    <section class="card" aria-label="Ritmo del mes">
      <div class="between-c"><h2 class="h2">Ritmo del mes</h2><span class="small muted">{monthName(p.mk)}</span></div>
      <div class="legend">
        <span><i class="sw line s-in" />Este mes</span>
        {p.prev && <span><i class="sw line dash s-out" />{prevName}</span>}
        {lastI < p.len - 1 && <span><i class="sw line dot-line s-in" />A este ritmo</span>}
      </div>
      <div class="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} style={{ touchAction: 'pan-y' }}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} class="grid" />
              <text x={L - 6} y={y(v) + 4} text-anchor="end" class="axis">{short(v)}</text>
            </g>
          ))}
          {[1, 10, 20, p.len].map((d) => <text key={d} x={x(d - 1)} y={H - 6} text-anchor="middle" class="axis">{d}</text>)}
          {p.prev && <path d={path(p.prev.slice(0, p.len))} class="ln s-out dash" />}
          {lastI >= 0 && lastI < p.len - 1 && <path d={`M${x(lastI).toFixed(1)},${y(p.cur[lastI]).toFixed(1)}L${x(p.len - 1).toFixed(1)},${y(pr.projected).toFixed(1)}`} class="ln s-in dotted" />}
          {lastI >= 0 && lastI < p.len - 1 && <text x={x(p.len - 1)} y={y(pr.projected) - 8} text-anchor="end" class="axis strong-axis">{short(pr.projected)}</text>}
          {lastI >= 0 && <path d={path(p.cur)} class="ln s-in" />}
          {lastI >= 0 && <circle cx={x(lastI)} cy={y(p.cur[lastI])} r="4.5" class="dot s-in" />}
          {hv && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} class="cross" />
              {hv.cur != null && <circle cx={x(hover)} cy={y(hv.cur)} r="4" class="dot s-in" />}
              {hv.prev != null && <circle cx={x(hover)} cy={y(hv.prev)} r="4" class="dot s-out" />}
            </g>
          )}
        </svg>
        {hv && (
          <div class="tip" style={{ left: `${Math.min(70, Math.max(8, (x(hover) / W) * 100))}%` }}>
            <b>Día {hv.d}</b>
            {hv.cur != null && <span>Este mes: {whole(hv.cur)}</span>}
            {hv.prev != null && <span>{prevName}: {whole(hv.prev)}</span>}
          </div>
        )}
      </div>
      <span class="small">Llevas <b class="tab-num">{whole(pr.spent)}</b>{pr.left > 0 ? <>; a este ritmo terminas el mes en unos <b class="tab-num">{whole(pr.projected)}</b>.</> : '.'}{pr.projIncome > 0 ? (pr.projNet >= 0 ? ` Con ${whole(pr.projIncome)} de ingresos, te quedarían unos ${whole(pr.projNet)}.` : ` Con ${whole(pr.projIncome)} de ingresos, te faltarían unos ${whole(-pr.projNet)}.`) : ''}</span>
      {!pr.hasHistory && <span class="tiny muted">Con más meses registrados, la estimación usa tu gasto de siempre.</span>}
    </section>
  );
}

// ---------- Ingresos y gastos por mes ----------

function CashflowCard({ s, mks, today }) {
  const rows = cashflow(s, mks);
  const curMk = monthKey(today);
  const [tip, setTip] = useState(null);
  const W = 340; const H = 170; const L = 40; const R = 6; const T = 10; const B = 36;
  const max = niceMax(Math.max(...rows.map((r) => Math.max(r.income, r.spent)), 1));
  const gw = (W - L - R) / rows.length;
  const bw = Math.min(22, (gw - 10) / 2);
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const bar = (x0, v, cls, label) => {
    const h = Math.max(0, H - B - y(v));
    if (h <= 0) return null;
    const r = Math.min(4, h, bw / 2);
    const top = H - B - h;
    const d = `M${x0},${H - B}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + bw - r}Q${x0 + bw},${top} ${x0 + bw},${top + r}V${H - B}Z`;
    return <path d={d} class={cls}><title>{label}</title></path>;
  };
  const last = rows[rows.length - 1];
  return (
    <section class="card" aria-label="Ingresos y gastos por mes">
      <h2 class="h2">Ingresos y gastos</h2>
      <div class="legend"><span><i class="sw s-in" />Ingresos</span><span><i class="sw s-out" />Gastos</span></div>
      <div class="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={rows.map((r) => `${monthShort(r.mk)}: entraron ${money(r.income)}, salieron ${money(r.spent)}`).join('. ')}>
          {[0, max / 2, max].map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} class="grid" />
              <text x={L - 6} y={y(v) + 4} text-anchor="end" class="axis">{short(v)}</text>
            </g>
          ))}
          {rows.map((r, i) => {
            const gx = L + i * gw + (gw - (bw * 2 + 2)) / 2;
            return (
              <g key={r.mk} onPointerDown={() => setTip(tip === i ? null : i)} style={{ cursor: 'pointer' }}>
                <rect x={L + i * gw} y={T} width={gw} height={H - T - B} fill="transparent" />
                {bar(gx, r.income, 's-in fill', `${monthShort(r.mk)}: ingresos ${money(r.income)}`)}
                {bar(gx + bw + 2, r.spent, 's-out fill', `${monthShort(r.mk)}: gastos ${money(r.spent)}`)}
                <text x={L + i * gw + gw / 2} y={H - B + 14} text-anchor="middle" class="axis strong-axis">{cap(monthShort(r.mk))}</text>
                <text x={L + i * gw + gw / 2} y={H - B + 28} text-anchor="middle" class="axis">{r.mk === curMk ? 'en curso' : r.rate != null ? pct(r.rate) : '—'}</text>
              </g>
            );
          })}
        </svg>
        {tip != null && rows[tip] && (
          <div class="tip" style={{ left: `${Math.min(64, Math.max(6, ((L + tip * gw) / W) * 100))}%` }}>
            <b style={{ textTransform: 'capitalize' }}>{monthName(rows[tip].mk)}</b>
            <span>Ingresos: {whole(rows[tip].income)}</span>
            <span>Gastos: {whole(rows[tip].spent)}</span>
            <span>{rows[tip].net >= 0 ? 'Quedó' : 'Faltó'}: {whole(Math.abs(rows[tip].net))}</span>
          </div>
        )}
      </div>
      <span class="tiny muted">Debajo de cada mes: qué parte de lo que entró guardaste{rows.some((r) => r.mk === curMk) ? ' (el mes en curso todavía no termina)' : ''}. Toca un mes para ver los montos.</span>
      {last && <span class="small muted">En {monthName(last.mk).split(' ')[0]}{last.mk === curMk ? ', hasta hoy,' : ''} entraron {whole(last.income)} y salieron {whole(last.spent)}.</span>}
      <details class="table-view"><summary>Ver como tabla</summary>
        <table><thead><tr><th>Mes</th><th>Ingresos</th><th>Gastos</th><th>Quedó</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.mk}><td style={{ textTransform: 'capitalize' }}>{monthShort(r.mk)}</td><td class="tab-num">{money(r.income)}</td><td class="tab-num">{money(r.spent)}</td><td class="tab-num">{money(r.net)}</td></tr>)}</tbody>
        </table>
      </details>
    </section>
  );
}

// ---------- Categorías ----------

function CategoriesCard({ s, period, today, onCat, wi }) {
  const [by, setBy] = useState('categoria');
  const [all, setAll] = useState(false);
  const fam = by === 'familia';
  const rows = fam ? groupStats(s, period, today).map((g) => ({ ...g, key: `g:${g.group}`, label: g.name })) : categoryStats(s, period, today).map((r) => ({ ...r, key: r.cat, label: catOf(s, r.cat).name }));
  const top = rows[0] ? rows[0].total : 1;
  const list = all ? rows : rows.slice(0, 7);
  const cmp = period.mks.length === 1 && period.mks[0] === monthKey(today) ? 'de lo que sueles llevar a esta altura' : 'de tu promedio';
  return (
    <section class="card flush" aria-label="Gastos por categoría">
      <div class="stack-xs" style={{ padding: '14px 0 6px' }}>
        <div class="between-c"><h2 class="h2">Por {fam ? 'familia' : 'categoría'}</h2><div class="seg mini" role="tablist" aria-label="Ver por">{[['categoria', 'Categorías'], ['familia', 'Familias']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={by === k ? 'true' : 'false'} onClick={() => { setBy(k); setAll(false); }}>{l}</button>)}</div></div>
        <span class="small muted">Comparado {cmp} (3 meses antes). Toca para ver el detalle.</span>
      </div>
      {list.map((r) => {
        const d = r.delta;
        const hrs = wi && wi.ready ? fmtWork(workHours(r.total, wi), wi) : '';
        return (
          <button key={r.key} type="button" class="lrow cat-stat" onClick={() => onCat(r.key, period)} aria-label={`${r.label}: ${money(r.total)}, ${pct(r.share)} del gasto${d != null ? `, ${d >= 0 ? 'más' : 'menos'} ${pct(Math.abs(d))} ${cmp}` : ''}. Ver detalle`}>
            <span class="stack-xs grow" style={{ minWidth: 0, gap: 6 }}>
              <span class="between-c" style={{ gap: 8 }}><span class="semi clip">{r.label}</span><span class="strong tab-num" style={{ whiteSpace: 'nowrap' }}>{whole(r.total)}</span></span>
              <span class="hbar"><i style={{ width: `${Math.max(2, (r.total / top) * 100)}%` }} /></span>
              <span class="tiny semi muted row wrap" style={{ gap: 4 }}>
                {pct(r.share)} del gasto · {plural(r.n, 'vez', 'veces')}{hrs ? ` · ${hrs}` : ''}
                {d != null && Math.abs(d) >= 0.1 && <span class="row" style={{ gap: 2, color: 'var(--ink-2, var(--ink))' }}>· <Icon name={d > 0 ? 'arrowup' : 'arrowdown'} size={12} />{pct(Math.abs(d))}</span>}
                {r.isNew && ' · nuevo'}
              </span>
            </span>
          </button>
        );
      })}
      {rows.length > 7 && <button type="button" class="lrow" style={{ justifyContent: 'center', fontWeight: 700 }} onClick={() => setAll(!all)}>{all ? 'Ver menos' : `Ver las ${rows.length}`}</button>}
    </section>
  );
}

// ---------- De dónde viene tu dinero ----------

function IncomeCard({ s, period }) {
  const rows = incomeStats(s, period);
  if (!rows.length) return null;
  const top = rows[0].total;
  return (
    <section class="card flush" aria-label="De dónde viene tu dinero">
      <div style={{ padding: '14px 0 4px' }}><h2 class="h2">De dónde viene tu dinero</h2></div>
      {rows.map((r) => {
        const c = catOf(s, r.cat);
        return (
          <div key={r.cat} class="lrow" style={{ minHeight: 60, alignItems: 'stretch', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
            <span class="between-c" style={{ gap: 8 }}><span class="semi clip">{c.name}</span><span class="strong tab-num" style={{ whiteSpace: 'nowrap', color: 'var(--good-ink)' }}>{whole(r.total)}</span></span>
            <span class="hbar"><i style={{ width: `${Math.max(2, (r.total / top) * 100)}%`, background: 'var(--good)' }} /></span>
            <span class="tiny muted semi">{pct(r.share)} de lo que entró · {plural(r.n, 'vez', 'veces')}</span>
          </div>
        );
      })}
    </section>
  );
}

// ---------- Tu tiempo y tu dinero ----------

function WorkCard({ s, period, wi, onSet }) {
  const rows = categoryStats(s, period, period.to).slice(0, 3);
  if (!wi.ready) {
    return (
      <button type="button" class="note" style={{ border: 'none', textAlign: 'left', color: 'var(--ink)', font: 'inherit' }} onClick={onSet}>
        <Icon name="clock" size={20} /><span class="grow">¿Cuántas horas de trabajo te cuesta cada gasto? Pon tu ingreso y tus horas de trabajo.</span><Icon name="right" size={18} />
      </button>
    );
  }
  return (
    <section class="card" aria-label="Tu tiempo y tu dinero">
      <div class="stack-xs">
        <h2 class="h2">Tu tiempo y tu dinero</h2>
        <span class="between-c"><span class="small muted">Tu hora vale <b style={{ color: 'var(--ink)' }}>{money(Math.round(wi.rate))}</b>{wi.useReal ? ' (hora real)' : ''}. Lo que más trabajo te costó:</span><button type="button" class="link-btn" style={{ minHeight: 32, flexShrink: 0 }} onClick={onSet}>Ajustar<Icon name="right" size={14} /></button></span>
      </div>
      {rows.length > 0 && (
        <div class="stack-xs">
          {rows.map((r) => (
            <div key={r.cat} class="between-c" style={{ minHeight: 34 }}>
              <span class="semi clip">{catOf(s, r.cat).name}</span>
              <span class="small strong tab-num row hrs" style={{ whiteSpace: 'nowrap' }}><Icon name="clock" size={13} />{fmtWork(workHours(r.total, wi), wi)}</span>
            </div>
          ))}
        </div>
      )}
      <WorkCalc s={s} wi={wi} />
    </section>
  );
}

// ---------- Gastos hormiga ----------

function AntsCard({ s, period, wi, onCat }) {
  const [max, setMax] = useState(500);
  const a = smallSpends(s, period, { max });
  if (!a.n) return null;
  return (
    <section class="card" aria-label="Gastos hormiga">
      <div class="stack-xs"><h2 class="h2">Gastos hormiga</h2><span class="small muted">Compras pequeñas y seguidas que casi no se notan, pero suman.</span></div>
      <div class="row wrap" style={{ gap: 8 }} role="group" aria-label="Compra pequeña: hasta"><span class="small semi muted">De hasta</span>{[300, 500, 1000].map((v) => <TChip key={v} sm on={max === v} onClick={() => setMax(v)}>{money(v)}</TChip>)}</div>
      <span class="stack-xs">
        <span class="display-num tab-num" style={{ fontSize: 28 }}>{whole(a.total)}</span>
        <span class="small muted">{plural(a.n, 'compra', 'compras')} · {pct(a.share)} de lo que gastaste{wi.ready ? ` · ${fmtWork(workHours(a.total, wi), wi)} de trabajo` : ''}</span>
        <span class="small strong" style={{ color: 'var(--finanzas-ink)' }}>A este ritmo, al año son unos {whole(Math.round(a.perYear / 100) * 100)}{wi.ready ? ` (${fmtWork(workHours(a.perYear, wi), wi)} de trabajo)` : ''}.</span>
      </span>
      <div class="stack-xs">
        {a.cats.map((c) => (
          <button key={c.cat} type="button" class="between-c insight" style={{ minHeight: 40 }} onClick={() => onCat(c.cat)}>
            <span class="semi clip" style={{ textAlign: 'left' }}>{catOf(s, c.cat).name}</span>
            <span class="small strong tab-num" style={{ whiteSpace: 'nowrap' }}>{plural(c.n, 'vez', 'veces')} · {whole(c.total)}</span>
          </button>
        ))}
      </div>
      {a.merchants.length > 0 && <span class="small muted">Donde más: {a.merchants.slice(0, 3).map((m) => `${m.name} (${m.n})`).join(', ')}.</span>}
    </section>
  );
}

// ---------- Tu ánimo y tus gastos (1.10) ----------

export function moodMoneyText(mm) {
  const d = mm.wants.delta;
  if (d == null) return mm.wants.bad > 0 ? 'Los días tensos o bajos gastas en gustos y los días agradables casi nada.' : 'Todavía no hay gustos en tus días con check-in.';
  if (d >= 0.15) return `Los días tensos o bajos gastas ${pct(d)} más en gustos que los días agradables.`;
  if (d <= -0.15) return `Los días tensos o bajos gastas ${pct(-d)} menos en gustos que los días agradables.`;
  return 'Tu ánimo casi no cambia lo que gastas en gustos.';
}

function MoodMoneyCard({ s, today, onCat }) {
  const mm = moodMoney(s, today);
  if (!mm.ready) return null;
  const max = Math.max(mm.wants.good || 0, mm.wants.bad || 0, 1);
  const row = (label, v) => (
    <div class="cmp-row" style={{ gridTemplateColumns: '100px 1fr auto' }}><span class="tiny muted semi">{label}</span><span class="cmp-bar"><i style={{ width: `${Math.max(2, (v / max) * 100)}%`, background: 'var(--finanzas)' }} /></span><span class="tiny strong tab-num" style={{ textAlign: 'right', minWidth: 64 }}>{whole(v)}</span></div>
  );
  return (
    <section class="card" aria-label="Tu ánimo y tus gastos">
      <div class="stack-xs"><h2 class="h2">Tu ánimo y tus gastos</h2><span class="small muted">Últimos 90 días, con tus check-ins: {plural(mm.nGood, 'día agradable', 'días agradables')} y {plural(mm.nBad, 'día tenso o bajo', 'días tensos o bajos')}.</span></div>
      <div class="stack-xs cmp">
        <span class="semi">En gustos, por día</span>
        {row('Agradables', mm.wants.good)}
        {row('Tensos o bajos', mm.wants.bad)}
        <span class="tiny muted">Comer fuera, delivery, antojos, salidas, compras y ropa.</span>
      </div>
      <span class="small strong" style={{ color: mm.wants.delta >= 0.15 ? 'var(--vit-ink)' : 'var(--finanzas-ink)' }}>{moodMoneyText(mm)}</span>
      {mm.cats.length > 0 && mm.wants.delta >= 0.15 && (
        <div class="stack-xs">
          {mm.cats.map((c) => (
            <button key={c.cat} type="button" class="between-c insight" style={{ minHeight: 40 }} onClick={() => onCat(c.cat)}>
              <span class="semi clip" style={{ textAlign: 'left' }}>{catOf(s, c.cat).name}</span>
              <span class="small strong tab-num" style={{ whiteSpace: 'nowrap' }}>{whole(c.bad)} vs {whole(c.good)}</span>
            </button>
          ))}
          <span class="tiny muted">Por día tenso o bajo frente a un día agradable.</span>
        </div>
      )}
      <span class="small muted">En todo el día a día: {whole(mm.all.bad)} por día tenso o bajo, frente a {whole(mm.all.good)} en un día agradable.</span>
      {mm.wants.delta >= 0.15 && <div class="note" style={{ margin: 0 }}><Icon name="sparkle" size={18} /><span>Cuando estés mal y te den ganas de comprar, espera 10 minutos o haz una pausa en Calma primero. La tristeza puede hacer que pagues más por lo mismo (estudio de Harvard y Carnegie Mellon).</span></div>}
    </section>
  );
}

// ---------- Lo que te cobra el banco ----------

function BankCard({ s, period, wi, onTax }) {
  const b = bankCosts(s, period);
  if (!(b.total > 0)) return null;
  const rows = [['Impuesto a transferencias', b.tax], ['Comisiones y cargos', b.fees], ['Intereses y mora', b.interest]].filter(([, v]) => v > 0);
  return (
    <section class="card" aria-label="Lo que te cobra el banco">
      <div class="between-c"><h2 class="h2">Lo que te cobra el banco</h2><span class="strong tab-num">{whole(b.total)}</span></div>
      <div class="stack-xs">{rows.map(([l, v]) => <div key={l} class="between-c" style={{ minHeight: 30 }}><span class="small semi muted">{l}</span><span class="small strong tab-num">{money(v)}</span></div>)}</div>
      {wi.ready && <span class="small semi row hrs" style={{ color: 'var(--finanzas-ink)' }}><Icon name="clock" size={14} />{fmtWork(workHours(b.total, wi), wi)} de tu trabajo.</span>}
      {b.interest > 0 && <span class="small muted">Los intereses se evitan pagando el saldo completo de la tarjeta antes de la fecha límite.</span>}
      <button type="button" class="link-btn" style={{ alignSelf: 'flex-start', minHeight: 32 }} onClick={onTax}><Icon name="percent" size={15} />Cómo se anota el impuesto<Icon name="right" size={14} /></button>
    </section>
  );
}

// ---------- Salud financiera ----------

function HealthCard({ s, today }) {
  const h = healthSnapshot(s, today);
  if (!h.months && h.cardUse == null) return null;
  const items = [];
  // El tono sale del mismo número que se muestra (así «20 %» no sale como «regular»).
  const r1 = (v) => Math.round(v * 10) / 10;
  const meses = (v) => `${v >= 10 ? Math.round(v) : r1(v)} ${r1(v) === 1 ? 'mes' : 'meses'}`;
  if (h.saveRate != null) { const v = Math.round(h.saveRate * 100); items.push(['Guardas de lo que entra', pct(h.saveRate), v >= 20 ? 'good' : v >= 10 ? 'mid' : 'low', 'La guía: 20 % o más.']); }
  if (h.cushion != null) { const v = r1(h.cushion); items.push(['Te alcanza lo que tienes', meses(h.cushion), v >= 3 ? 'good' : v >= 1 ? 'mid' : 'low', 'De gastos, sin cobrar. La guía: de 3 a 6.']); }
  if (h.cardUse != null) { const v = Math.round(h.cardUse * 100); items.push(['Usas de tus tarjetas', pct(h.cardUse), v < 30 ? 'good' : v < 70 ? 'mid' : 'low', 'Del límite. Lo sano: menos del 30 %.']); }
  if (h.oweMonths != null && h.owe > 0) { const v = r1(h.oweMonths); items.push(['Debes en tarjetas', meses(h.oweMonths), v <= 0.5 ? 'good' : v <= 1 ? 'mid' : 'low', 'De tus ingresos de un mes.']); }
  if (!items.length) return null;
  const tone = { good: ['var(--good-soft)', 'var(--good-ink)', 'Bien'], mid: ['var(--xp-soft)', 'var(--xp-ink)', 'Regular'], low: ['var(--vit-soft)', 'var(--vit-ink)', 'Ojo'] };
  return (
    <section class="card" aria-label="Tu salud financiera">
      <div class="stack-xs"><h2 class="h2">Tu salud financiera</h2><span class="small muted">{h.months ? `Con tus últimos ${h.months === 1 ? 'mes completo' : `${h.months} meses completos`} y tus saldos de hoy.` : 'Con tus saldos de hoy.'}</span></div>
      <div class="health-grid">
        {items.map(([l, v, k, sub]) => (
          <div key={l} class="health" style={{ background: tone[k][0] }}>
            <span class="tiny semi" style={{ color: tone[k][1] }}>{l}</span>
            <span class="strong tab-num" style={{ fontSize: 20, color: tone[k][1] }}>{v}</span>
            <span class="tiny semi" style={{ color: tone[k][1] }}>{tone[k][2]} · {sub}</span>
          </div>
        ))}
      </div>
      {!h.ready && <span class="tiny muted">Pon el saldo de tus cuentas para saber para cuántos meses te alcanza.</span>}
    </section>
  );
}

// ---------- Comercios ----------

function MerchantsCard({ s, period }) {
  const rows = merchantStats(s, period.from, period.to, 8);
  if (!rows.length) return null;
  return (
    <section class="card flush" aria-label="Dónde más gastas">
      <div style={{ padding: '14px 0 4px' }}><h2 class="h2">Dónde más gastas</h2></div>
      {rows.map((r) => {
        const c = catOf(s, r.cat);
        return (
          <div key={r.key} class="lrow" style={{ minHeight: 56 }}>
            <span class="tile sm" style={{ background: 'var(--soft)' }}><Icon name={c.icon || 'tag'} size={17} /></span>
            <span class="stack-xs grow" style={{ minWidth: 0 }}><span class="semi clip">{r.name}</span><span class="tiny muted semi">{r.n > 1 ? `${plural(r.n, 'vez', 'veces')} · ${whole(r.avg)} cada vez` : '1 vez'}</span></span>
            <span class="strong tab-num" style={{ whiteSpace: 'nowrap' }}>{whole(r.total)}</span>
          </div>
        );
      })}
    </section>
  );
}

// ---------- Calendario ----------

function CalendarCard({ s, mk, today }) {
  const daily = dailyTotals(s, mk);
  const n = Number(mk === monthKey(today) ? today.slice(8) : new Date(Number(mk.slice(0, 4)), Number(mk.slice(5)), 0).getDate());
  const len = new Date(Number(mk.slice(0, 4)), Number(mk.slice(5)), 0).getDate();
  const vals = Object.values(daily).filter((v) => v > 0).sort((a, b) => a - b);
  const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] || 0;
  const cuts = [q(0.2), q(0.4), q(0.6), q(0.8)];
  const bin = (v) => (v <= 0 ? 0 : 1 + cuts.filter((c) => v > c).length);
  const first = weekday(`${mk}-01`);
  const cells = [...Array(first).fill(null), ...Array.from({ length: len }, (_, i) => i + 1)];
  const maxDay = Object.entries(daily).sort((a, b) => b[1] - a[1])[0];
  const zero = Array.from({ length: n }, (_, i) => `${mk}-${String(i + 1).padStart(2, '0')}`).filter((d) => !daily[d]).length;
  return (
    <section class="card" aria-label="Calendario de gastos">
      <div class="between-c"><h2 class="h2">Día por día</h2><span class="small muted" style={{ textTransform: 'capitalize' }}>{monthName(mk)}</span></div>
      <div class="cal-grid" role="img" aria-label={`Gasto de cada día de ${monthName(mk)}. ${maxDay ? `El día que más: ${Number(maxDay[0].slice(8))}, con ${money(maxDay[1])}.` : ''}`}>
        {DAYS_SHORT.map((d, i) => <span key={`h${i}`} class="cal-h" aria-hidden="true">{d}</span>)}
        {cells.map((d, i) => {
          if (d == null) return <span key={`e${i}`} />;
          const key = `${mk}-${String(d).padStart(2, '0')}`;
          const v = daily[key] || 0;
          const future = key > today;
          return <span key={key} class={`cal-d heat-${future ? 'f' : bin(v)} ${key === today ? 'today' : ''}`} title={`${d} de ${monthName(mk).split(' ')[0]}: ${future ? 'todavía no llega' : v ? money(v) : 'sin gastos'}`}>{d}</span>;
        })}
      </div>
      <div class="row" style={{ gap: 6, alignItems: 'center' }} aria-hidden="true">
        <span class="tiny muted semi">Menos</span>{[1, 2, 3, 4, 5].map((k) => <i key={k} class={`cal-key heat-${k}`} />)}<span class="tiny muted semi">Más</span>
      </div>
      <span class="small muted">{maxDay ? `El día que más gastaste fue el ${Number(maxDay[0].slice(8))} (${whole(maxDay[1])}).` : ''}{zero > 0 ? ` ${plural(zero, 'día', 'días')} sin gastos.` : ''}</span>
    </section>
  );
}

// ---------- Días de la semana ----------

function WeekdayCard({ s, period }) {
  const rows = weekdayStats(s, period.from, period.to);
  const order = [1, 2, 3, 4, 5, 6, 0];
  const max = Math.max(...rows.map((r) => r.avg), 1);
  const best = rows.reduce((a, r) => (r.avg > a.avg ? r : a), rows[0]);
  return (
    <section class="card" aria-label="Por día de la semana">
      <h2 class="h2">Por día de la semana</h2>
      <div class="wd-bars" role="img" aria-label={order.map((i) => `${DAYS[i]}: ${whole(rows[i].avg)} en promedio`).join(', ')}>
        {order.map((i) => (
          <div key={i} class="cb" title={`${cap(DAYS[i])}: ${whole(rows[i].avg)} en promedio`}>
            <span class="tiny muted tab-num" style={{ minHeight: 14 }}>{rows[i] === best && best.avg > 0 ? short(best.avg) : ''}</span>
            <i style={{ height: `${Math.max(4, (rows[i].avg / max) * 64)}px`, background: rows[i].avg ? 'var(--finanzas)' : 'var(--soft-2)' }} />
            <span class="tiny muted semi">{DAYS_SHORT[i]}</span>
          </div>
        ))}
      </div>
      {best.avg > 0 && <span class="small muted">Los {daysPlural(DAYS[best.wd])} gastas más: {whole(best.avg)} en promedio.</span>}
    </section>
  );
}

// ---------- Cuentas y tarjetas ----------

function AccountsCard({ s, period }) {
  const rows = accountStats(s, period.from, period.to);
  if (!rows.length || (rows.length === 1 && !rows[0].id)) return null;
  return (
    <section class="card flush" aria-label="Con qué pagaste">
      <div style={{ padding: '14px 0 4px' }}><h2 class="h2">Con qué pagaste</h2></div>
      {rows.map((r) => (
        <div key={r.id || 'none'} class="lrow" style={{ minHeight: 60, alignItems: 'stretch', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
          <span class="between-c" style={{ gap: 8 }}><span class="semi clip">{r.name}{r.last4 ? ` ·${r.last4}` : ''}</span><span class="strong tab-num" style={{ whiteSpace: 'nowrap' }}>{whole(r.total)}</span></span>
          <span class="hbar"><i style={{ width: `${Math.max(2, r.share * 100)}%` }} /></span>
          <span class="tiny muted semi">{pct(r.share)} · {plural(r.n, 'gasto', 'gastos')}{r.card ? ' · tarjeta de crédito' : ''}</span>
        </div>
      ))}
    </section>
  );
}

export { fmtShort };


// ---------- 1.11: deudas, préstamos, fondo de emergencia y suscripciones ----------

function DebtLoadCard({ s, today, onDebts }) {
  const d = debtLoad(s, today);
  if (!d.n) return null;
  const v = d.dti == null ? null : Math.round(d.dti * 100);
  const tone = v == null ? 'mid' : v <= 20 ? 'good' : v <= 36 ? 'mid' : 'low';
  const label = { good: 'Sano', mid: 'Con cuidado', low: 'Alto' }[tone];
  const col = { good: 'var(--good-ink)', mid: 'var(--xp-ink)', low: 'var(--vit-ink)' }[tone];
  return (
    <section class="card" aria-label="Cuánto se va en deudas">
      <div class="between-c"><h2 class="h2">Lo que se va en deudas</h2>{v != null && <span class="chip sm" style={{ color: col }}>{label}</span>}</div>
      {v != null ? (
        <>
          <span class="display-num tab-num" style={{ fontSize: 34, color: col }}>{v} %</span>
          <span class="small muted">de tus ingresos de cada mes ({whole(d.income)}) se va en pagar deudas: {whole(d.commitments)} al mes. La guía: menos del 36 %, y lo ideal por debajo del 20 %.</span>
          <Bar value={Math.min(1, d.dti / 0.5)} size="lg" color={col} label={`Deudas: ${v} % de tus ingresos`} />
        </>
      ) : <span class="small muted">Pagas {whole(d.commitments)} al mes en deudas. Agrega tu sueldo a tu plan para ver qué parte de tus ingresos es.</span>}
      <div class="between-c"><span class="small semi muted">Debes en total</span><span class="strong tab-num">{whole(d.owe)}</span></div>
      {d.missing > 0 && <span class="tiny muted">A {plural(d.missing, 'deuda', 'deudas')} le falta el pago mensual; con él, este número sube.</span>}
      <button type="button" class="link-btn" style={{ alignSelf: 'flex-start', minHeight: 32 }} onClick={onDebts}><Icon name="trend" size={15} />Plan para salir de deudas</button>
    </section>
  );
}

function LoanCostCard({ s, period }) {
  const c = loanCosts(s, period);
  if (!c.n) return null;
  return (
    <section class="card" aria-label="Lo que te cuestan los préstamos">
      <h2 class="h2">Lo que te cuestan los préstamos</h2>
      <span class="small muted">De {whole(c.total)} que pagaste en cuotas y abonos en este período:</span>
      <div class="stack-xs">
        <div class="between-c"><span class="small semi muted">A capital (debes menos)</span><span class="strong tab-num" style={{ color: 'var(--good-ink)' }}>{whole(c.principal)}</span></div>
        <div class="between-c"><span class="small semi muted">A intereses</span><span class="strong tab-num" style={{ color: 'var(--vit-ink)' }}>{whole(c.interest)}</span></div>
        {c.fees > 0 && <div class="between-c"><span class="small semi muted">A seguros y cargos</span><span class="strong tab-num" style={{ color: 'var(--vit-ink)' }}>{whole(c.fees)}</span></div>}
      </div>
      <Bar value={c.costShare} size="lg" color="var(--vit)" label={`El ${pct(c.costShare)} fue costo`} />
      <span class="tiny muted">El {pct(c.costShare)} de lo que pagaste fue costo del préstamo. Un abono a capital baja los intereses de las cuotas que vienen.</span>
    </section>
  );
}

function EmergencyCard({ s, today }) {
  const e = emergencyFund(s, today);
  if (!e.ready) {
    return (
      <section class="card" aria-label="Fondo de emergencia">
        <h2 class="h2">Fondo de emergencia</h2>
        <span class="small muted">Con tus saldos y un par de meses de gastos registrados te digo para cuántos meses te alcanza lo que tienes ahorrado. La guía es tener de 3 a 6 meses de gastos necesarios.</span>
      </section>
    );
  }
  const m = e.months || 0;
  const tone = m >= 3 ? 'var(--good)' : m >= 1 ? 'var(--xp)' : 'var(--vit)';
  return (
    <section class="card" aria-label="Fondo de emergencia">
      <div class="between-c"><h2 class="h2">Fondo de emergencia</h2><span class="strong tab-num">{m >= 10 ? Math.round(m) : Math.round(m * 10) / 10} {Math.round(m * 10) / 10 === 1 ? 'mes' : 'meses'}</span></div>
      <Bar value={e.pct} size="lg" color={tone} label={`Llevas el ${Math.round(e.pct * 100)} % de 3 meses`} />
      <span class="small muted">Ahorrado: {whole(e.saved)}. Tus gastos necesarios (casa, comida, transporte, salud, servicios) son unos {whole(e.monthly)} al mes: 3 meses son {whole(e.goal3)} y 6 meses, {whole(e.goal6)}.</span>
      {!e.hasSavings && <span class="tiny muted">Marca una cuenta como «Ahorro» para contarla aquí. Ahora cuento solo las cuentas de ahorro: con todo el efectivo te alcanzaría para {Math.round((e.monthsAll || 0) * 10) / 10} meses.</span>}
      {e.hasSavings && m < 3 && <span class="small semi" style={{ color: 'var(--finanzas-ink)' }}>Te faltan {whole(Math.max(0, e.goal3 - e.saved))} para los 3 meses.</span>}
    </section>
  );
}

function SubsCard({ s, today, onCat }) {
  const x = subscriptionStats(s, today);
  if (!x.list.length) return null;
  return (
    <section class="card flush" aria-label="Suscripciones">
      <div class="between-c" style={{ padding: '14px 0 4px' }}><h2 class="h2">Suscripciones</h2><span class="strong tab-num">{whole(x.perMonth)} al mes</span></div>
      <span class="small muted" style={{ padding: '0 0 6px' }}>Son {whole(x.perYear)} al año. Promedio de los últimos 3 meses.</span>
      {x.list.slice(0, 8).map((m) => (
        <div key={m.key} class="lrow" style={{ minHeight: 48 }}>
          <span class="grow semi clip">{m.name}</span>
          <span class="tiny muted semi">{plural(m.n, 'cobro', 'cobros')}</span>
          <span class="strong tab-num">{whole(m.monthly)}</span>
        </div>
      ))}
      <button type="button" class="lrow" style={{ justifyContent: 'center', fontWeight: 700 }} onClick={() => onCat('suscripciones')}>Ver el detalle de la categoría</button>
    </section>
  );
}
