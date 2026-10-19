// Análisis (1.7): cómo entra y sale tu dinero, el ritmo del mes, categorías frente a tu promedio,
// comercios, calendario, días de la semana y cuentas. Colores validados para daltonismo en claro y oscuro.
import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { TChip, money, plural } from '../ui/kit.jsx';
import { DAYS, DAYS_SHORT, fmtShort, monthKey, monthName, weekday } from '../app/dates.js';
import { catOf } from '../game/logic.js';
import {
  PERIODS, periodOf, cashflow, totals, categoryStats, merchantStats, accountStats, weekdayStats, dailyTotals, paceSeries,
  monthProjection, insights, monthShort, prevMonth,
} from '../game/stats.js';

const pct = (v) => { const n = Math.round((v || 0) * 100); return `${n < 0 ? '−' : ''}${Math.abs(n)} %`; };
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

export function Analysis({ s, today, onCat }) {
  const [per, setPer] = useState('mes');
  const period = periodOf(per, today);
  const tot = totals(s, period.from, period.to);
  const single = period.mks.length === 1;
  const cfMks = period.mks.length >= 3 ? period.mks : (() => { const m = [monthKey(today)]; while (m.length < 6) m.unshift(prevMonth(m[0])); return m; })();
  const any = s.money.tx.some((t) => t.day >= period.from && t.day <= period.to);
  return (
    <>
      <div class="chips stat-periods" role="group" aria-label="Período">
        {PERIODS.map(([k, l]) => <TChip key={k} sm on={per === k} onClick={() => setPer(k)}>{l}</TChip>)}
      </div>
      <section class="card" aria-label="Ingresos y gastos del período">
        <div class={`kpis3${[tot.income, tot.spent, tot.net].some((v) => whole(Math.abs(v)).length > 10) ? ' stack' : ''}`}>
          <div class="stack-xs"><span class="tiny semi muted">Ingresos</span><span class="strong tab-num kpi-v">{whole(tot.income)}</span></div>
          <div class="stack-xs"><span class="tiny semi muted">Gastos</span><span class="strong tab-num kpi-v">{whole(tot.spent)}</span></div>
          <div class="stack-xs"><span class="tiny semi muted">{tot.net >= 0 ? 'Te quedó' : 'Gastaste de más'}</span><span class="strong tab-num kpi-v" style={{ color: tot.net < 0 ? 'var(--vit-ink)' : 'var(--ink)' }}>{whole(Math.abs(tot.net))}</span></div>
        </div>
        <span class="small muted">
          {tot.rate != null ? (tot.rate >= 0 ? `Guardaste el ${pct(tot.rate)} de lo que entró. ` : 'Salió más de lo que entró. ') : ''}
          {tot.n ? `${plural(tot.n, 'gasto', 'gastos')} · ${whole(tot.perDay)} por día en promedio.` : 'Sin gastos en este período.'}
        </span>
      </section>

      {per === 'mes' && <Insights s={s} today={today} onCat={onCat} />}
      {per === 'mes' && <PaceCard s={s} today={today} />}
      <CashflowCard s={s} mks={cfMks} />
      {any && <CategoriesCard s={s} period={period} today={today} onCat={onCat} />}
      {any && <MerchantsCard s={s} period={period} />}
      {single && any && <CalendarCard s={s} mk={period.mks[0]} today={today} />}
      {any && <WeekdayCard s={s} period={period} />}
      {any && <AccountsCard s={s} period={period} />}
      {!any && <p class="small muted" style={{ textAlign: 'center' }}>Cuando registres o importes movimientos de este período, aquí verás tus números.</p>}
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
      <div class="stack-xs">
        <div class="between-c"><span class="small semi muted">Llevas</span><span class="strong tab-num">{whole(pr.spent)}</span></div>
        {pr.toPay > 0 && <div class="between-c"><span class="small semi muted">Falta pagar de lo programado</span><span class="strong tab-num">{whole(pr.toPay)}</span></div>}
        {pr.left > 0 && <div class="between-c"><span class="small semi muted">Día a día ({whole(pr.daily)} × {plural(pr.left, 'día', 'días')})</span><span class="strong tab-num">{whole(pr.daily * pr.left)}</span></div>}
        <div class="between-c" style={{ borderTop: '1.5px solid var(--line)', paddingTop: 8 }}><span class="semi">Gasto estimado del mes</span><span class="strong tab-num">{whole(pr.projected)}</span></div>
        {pr.projIncome > 0 && <span class="small" style={{ color: pr.projNet < 0 ? 'var(--vit-ink)' : 'var(--muted)' }}>{pr.projNet >= 0 ? `Con ${whole(pr.projIncome)} de ingresos, te quedarían unos ${whole(pr.projNet)}.` : `Con ${whole(pr.projIncome)} de ingresos, te faltarían unos ${whole(-pr.projNet)}.`}</span>}
        {!pr.hasHistory && <span class="tiny muted">Con más meses registrados, la estimación usa tu gasto de siempre.</span>}
      </div>
    </section>
  );
}

// ---------- Ingresos y gastos por mes ----------

function CashflowCard({ s, mks }) {
  const rows = cashflow(s, mks);
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
                <text x={L + i * gw + gw / 2} y={H - B + 28} text-anchor="middle" class="axis">{r.rate != null ? pct(r.rate) : '—'}</text>
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
      <span class="tiny muted">Debajo de cada mes: qué parte de lo que entró guardaste. Toca un mes para ver los montos.</span>
      {last && <span class="small muted">En {monthName(last.mk).split(' ')[0]} entraron {whole(last.income)} y salieron {whole(last.spent)}.</span>}
      <details class="table-view"><summary>Ver como tabla</summary>
        <table><thead><tr><th>Mes</th><th>Ingresos</th><th>Gastos</th><th>Quedó</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.mk}><td style={{ textTransform: 'capitalize' }}>{monthShort(r.mk)}</td><td class="tab-num">{money(r.income)}</td><td class="tab-num">{money(r.spent)}</td><td class="tab-num">{money(r.net)}</td></tr>)}</tbody>
        </table>
      </details>
    </section>
  );
}

// ---------- Categorías ----------

function CategoriesCard({ s, period, today, onCat }) {
  const rows = categoryStats(s, period, today);
  const [all, setAll] = useState(false);
  const top = rows[0] ? rows[0].total : 1;
  const list = all ? rows : rows.slice(0, 7);
  const cmp = period.mks.length === 1 && period.mks[0] === monthKey(today) ? 'de lo que sueles llevar a esta altura' : 'de tu promedio';
  return (
    <section class="card flush" aria-label="Gastos por categoría">
      <div class="stack-xs" style={{ padding: '14px 0 4px' }}><h2 class="h2">Por categoría</h2><span class="small muted">Comparado {cmp} (3 meses antes).</span></div>
      {list.map((r) => {
        const c = catOf(s, r.cat);
        const d = r.delta;
        return (
          <button key={r.cat} type="button" class="lrow cat-stat" onClick={() => onCat(r.cat, period)} aria-label={`${c.name}: ${money(r.total)}, ${pct(r.share)} del gasto${d != null ? `, ${d >= 0 ? 'más' : 'menos'} ${pct(Math.abs(d))} ${cmp}` : ''}`}>
            <span class="stack-xs grow" style={{ minWidth: 0, gap: 6 }}>
              <span class="between-c" style={{ gap: 8 }}><span class="semi clip">{c.name}</span><span class="strong tab-num" style={{ whiteSpace: 'nowrap' }}>{whole(r.total)}</span></span>
              <span class="hbar"><i style={{ width: `${Math.max(2, (r.total / top) * 100)}%` }} /></span>
              <span class="tiny semi muted row" style={{ gap: 4 }}>
                {pct(r.share)} del gasto · {plural(r.n, 'vez', 'veces')}
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
