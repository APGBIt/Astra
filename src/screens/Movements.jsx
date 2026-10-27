// Movimientos (1.9): período (un mes, 3, 6 o 12 meses, el año, todo o tus fechas), filtros combinados,
// totales por categoría o familia, agrupar y ordenar, y seleccionar varios para editarlos juntos (con deshacer).
import { useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Sheet, SheetHead, TChip, money, moneyR, usd, cur, rateText, toast, ask, plural, focusOnMount } from '../ui/kit.jsx';
import { act } from '../app/store.js';
import { monthKey, monthName, fmtDay, fmtShort } from '../app/dates.js';
import { saveFile } from '../app/files.js';
import {
  catOf, catName, accountOf, accountLabel, txKind, txCur, txOrig, txDOP, txUSD, txRate, fxRate, fxIsManual, txTags, taxPct, transferTaxRate,
} from '../game/logic.js';
import {
  periodRange, RANGE_KINDS, normFilter, emptyFilter, filterCount, isFiltered, filterTx, sortList, SORTS, summarize, groupList, GROUP_BY, catTotals,
  SOURCES, ONLY, workInfo, workHours, fmtWork, fmtWorkShort, bulkEdit, bulkRemove, bulkAddTax, taxable, undoBulk, groupName,
} from '../game/ledger.js';
import { CATEGORY_GROUPS, ACCOUNT_KINDS } from '../game/content.js';
import { toNumber } from '../game/parse.js';
import { CatPicker } from '../ui/catpicker.jsx';

const ACC_ICON = Object.fromEntries(ACCOUNT_KINDS.map((k) => [k.key, k.icon]));
export const KIND_LABEL = { gasto: 'Gasto', ingreso: 'Ingreso', transfer: 'Entre cuentas' };
const num = (v) => toNumber(String(v || '').replace(/[^\d.,]/g, ''));

function shiftMonth(mk, n) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const signed = (t) => {
  const k = txKind(t);
  const v = cur(txOrig(t), txCur(t));
  return k === 'ingreso' ? `+${v}` : k === 'transfer' ? v : `−${v}`;
};
// La otra moneda del movimiento: si fue en US$, cuánto fue en pesos; si fue en pesos, cuánto en US$.
const otherSide = (s, t) => (txCur(t) === 'USD' ? moneyR(txDOP(t)) : usd(txUSD(s, t)));

export const fxWhen = (s, today) => {
  const fx = s.money.fx;
  if (fxIsManual(s)) return 'Tu tasa';
  if (!fx.day) return '';
  return fx.day === today ? 'Hoy' : fmtShort(fx.day);
};

// «1 ago – 20 oct»
const rangeText = (r) => (r.kind === 'todo' ? 'Todo lo registrado' : `${fmtShort(r.from)} – ${fmtShort(r.to)}`);
export function periodLabel(per, today) {
  const r = periodRange(per, today);
  if (r.kind === 'mes') return monthName(r.mk);
  const k = RANGE_KINDS.find(([x]) => x === r.kind);
  return r.kind === 'rango' ? rangeText(r) : k ? k[1] : '';
}

// ---------- Fila de un movimiento ----------

export function TxRow({ s, t, onOpen, day = null, wi = null, selecting = false, selected = false }) {
  const c = catOf(s, t.cat);
  const k = txKind(t);
  const a = accountOf(s, t.account);
  const to = k === 'transfer' || (k === 'gasto' && t.to) ? accountOf(s, t.to) : null;
  const where = to ? `${a ? `${accountLabel(a)} → ` : '→ '}${accountLabel(to)}` : a && accountLabel(a);
  const tone = k === 'ingreso' ? ['var(--good-soft)', 'var(--good-ink)'] : k === 'transfer' ? ['var(--soft)', 'var(--muted)'] : ['var(--finanzas-soft)', 'var(--finanzas-ink)'];
  const showHrs = wi && wi.ready && wi.show && k === 'gasto' && !t.noStats;
  const hrs = showHrs ? fmtWork(workHours(txDOP(t), wi), wi) : '';
  const hrsShort = showHrs ? fmtWorkShort(workHours(txDOP(t), wi), wi) : '';
  const marks = [t.split ? `parte ${t.split.i + 1} de ${t.split.n}` : '', t.noStats ? 'no cuenta' : '', t.adjust ? 'ajuste de saldo' : ''].filter(Boolean);
  // 1.15: dos líneas por lado. Izquierda: comercio y detalle. Derecha: el monto y, debajo, la otra moneda y las horas de trabajo.
  return (
    <button type="button" class={`lrow txrow${selected ? ' sel' : ''}`} onClick={onOpen} aria-pressed={selecting ? (selected ? 'true' : 'false') : undefined}
      aria-label={`${selecting ? (selected ? 'Seleccionado: ' : 'Seleccionar: ') : ''}${t.merchant || c.name}, ${signed(t)}, ${c.name}${hrs ? `, ${hrs} de trabajo` : ''}`}>
      {selecting && <span class="selbox" aria-hidden="true">{selected && <Icon name="check" size={15} stroke={3} />}</span>}
      <span class="tile sm" style={{ background: tone[0], color: tone[1] }}><Icon name={c.icon || 'tag'} size={18} /></span>
      <span class="tx-body">
        <span class="tx-line">
          <span class="strong tx-name">{t.merchant || c.name}</span>
          <span class="strong tab-num tx-amt" style={{ color: k === 'ingreso' ? 'var(--good-ink)' : k === 'transfer' ? 'var(--muted)' : 'var(--ink)', textDecoration: t.noStats ? 'line-through' : undefined }}>{signed(t)}</span>
        </span>
        <span class="tx-line tiny muted semi">
          <span class="tx-meta">{[day, t.time, to && k === 'transfer' ? null : c.name, where, t.tag, ...marks].filter(Boolean).join(' · ')}</span>
          <span class="tab-num tx-sub">{otherSide(s, t)}{hrsShort && <><span>·</span><Icon name="clock" size={11} stroke={2.4} />{hrsShort}</>}</span>
        </span>
      </span>
    </button>
  );
}

// ---------- Aviso de «deshacer» lo último que cambiaste en grupo ----------

export function UndoBulk({ s }) {
  const u = s.money.lastBulk;
  if (!u) return null;
  return (
    <div class="note tone-good" role="status">
      <Icon name="check" size={20} />
      <span class="stack-sm grow">
        <span>{u.label}.</span>
        <span class="row wrap" style={{ gap: 14 }}>
          <button type="button" class="link-btn" style={{ color: 'inherit', minHeight: 32 }} onClick={() => { act((st) => undoBulk(st)); toast('Listo: quedó como estaba', 'undo'); }}><Icon name="undo" size={15} />Deshacer</button>
          <button type="button" class="link-btn" style={{ color: 'inherit', minHeight: 32 }} onClick={() => act((st) => { st.money.lastBulk = null; })}>Listo</button>
        </span>
      </span>
    </div>
  );
}

// ---------- Movimientos ----------

export function Movements({ s, today, per, setPer, filter, setFilter, setSheet, sel, setSel }) {
  const f = normFilter(filter);
  const [showSearch, setShowSearch] = useState(!!f.q);
  const [limit, setLimit] = useState(60);
  const [by, setBy] = useState('dia');
  const [sort, setSort] = useState('reciente');
  const [open, setOpen] = useState({});
  const [view, setView] = useState(null); // hojas propias: 'filtros', 'periodo', 'bulk'
  const listRef = useRef(null);
  const range = periodRange(per, today);
  const filtered = isFiltered(f);
  const all = filterTx(s, range, emptyFilter());
  const list = sortList(filtered ? filterTx(s, range, f) : all, sort);
  const sum = summarize(s, list);
  const wi = workInfo(s, today);
  const rate = fxRate(s, today);
  const isMonth = range.kind === 'mes';
  const isNow = isMonth && range.mk === monthKey(today);
  const selecting = !!sel;
  const setF = (patch) => { setFilter({ ...f, ...patch }); setLimit(60); };
  const toList = () => setTimeout(() => listRef.current && listRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  const toggle = (id) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setSel(n); };
  const tap = (t) => (selecting ? toggle(t.id) : setSheet({ kind: 'tx', tx: t }));
  const chosen = selecting ? list.filter((t) => sel.has(t.id)) : [];
  const selSum = summarize(s, chosen);
  const groups = by === 'dia' ? null : groupList(s, list, by);
  const shown = list.slice(0, limit);
  const days = [];
  if (by === 'dia') {
    for (const t of shown) {
      const last = days[days.length - 1];
      if (last && last.day === t.day) last.list.push(t); else days.push({ day: t.day, list: [t] });
    }
  }
  const tags = [...new Set(all.map((t) => t.tag).filter(Boolean))];
  const hrsAll = wi.ready ? fmtWork(workHours(sum.spent, wi), wi) : '';
  const exportCsv = async (items, name) => {
    const ok = await saveFile(name, csvOf(s, items, wi), 'text/csv');
    if (ok) toast('Archivo descargado', 'download');
  };

  return (
    <>
      <UndoBulk s={s} />
      <div class="between-c">
        {isMonth ? <button type="button" class="icon-btn plain" aria-label="Mes anterior" onClick={() => { setPer({ kind: 'mes', mk: shiftMonth(range.mk, -1) }); setLimit(60); }}><Icon name="left" /></button> : <span style={{ width: 44 }} />}
        <button type="button" class="link-btn" style={{ fontSize: 16, textTransform: isMonth ? 'capitalize' : undefined, gap: 6 }} onClick={() => setView('periodo')} aria-label={`Período: ${periodLabel(per, today)}. Cambiar`}>
          <span class="stack-xs" style={{ alignItems: 'center', gap: 0 }}><span>{periodLabel(per, today)}</span>{!isMonth && range.kind !== 'rango' && <span class="tiny muted semi" style={{ textTransform: 'none' }}>{rangeText(range)}</span>}</span>
          <Icon name="down" size={15} />
        </button>
        {isMonth ? <button type="button" class="icon-btn plain" aria-label="Mes siguiente" disabled={isNow} style={isNow ? { opacity: 0.3 } : null} onClick={() => { setPer({ kind: 'mes', mk: shiftMonth(range.mk, 1) }); setLimit(60); }}><Icon name="right" /></button> : <button type="button" class="icon-btn plain" aria-label="Volver a este mes" onClick={() => setPer({ kind: 'mes', mk: monthKey(today) })}><Icon name="calendar" size={19} /></button>}
      </div>

      {/* Totales de lo que estás viendo, en pesos y en dólares, y en horas de tu trabajo. */}
      <section class="card flush" aria-label="Resumen">
        {filtered && <div class="between-c" style={{ padding: '12px 0 2px' }}><span class="tiny strong muted" style={{ letterSpacing: 0.4, textTransform: 'uppercase' }}>Con tus filtros</span><span class="tiny muted semi">{plural(list.length, 'movimiento', 'movimientos')} de {all.length}</span></div>}
        {[['Ingresos', sum.income, sum.incomeUSD, null], ['Gastos', sum.spent, sum.spentUSD, null], ['Balance', sum.net, sum.netUSD, sum.net < 0 ? 'var(--vit-ink)' : sum.net > 0 ? 'var(--good-ink)' : null]].map(([l, dop, u, c]) => (
          <div key={l} class="lrow" style={{ minHeight: 56 }}>
            <span class="stack-xs grow" style={{ gap: 0 }}>
              <span class="semi muted">{l}</span>
              {l === 'Gastos' && hrsAll && <span class="tiny semi row hrs" style={{ color: 'var(--finanzas-ink)' }}><Icon name="clock" size={12} stroke={2.4} />{hrsAll} de trabajo</span>}
            </span>
            <span class="stack-xs" style={{ alignItems: 'flex-end', gap: 2 }}>
              <span class="display-num tab-num" style={{ fontSize: l === 'Balance' ? 22 : 19, color: c || undefined }}>{moneyR(dop)}</span>
              <span class="tiny semi muted tab-num">{usd(u, { decimals: 0 })}</span>
            </span>
          </div>
        ))}
        {(sum.moved > 0 || sum.nExcluded > 0) && (
          <div class="lrow" style={{ minHeight: 44 }}>
            <span class="tiny muted semi">{[sum.moved > 0 ? `Entre tus cuentas: ${moneyR(sum.moved)} (no es gasto)` : '', sum.nExcluded ? `${plural(sum.nExcluded, 'movimiento', 'movimientos')} sin contar: ${moneyR(sum.excluded)}` : ''].filter(Boolean).join(' · ')}</span>
          </div>
        )}
      </section>

      <CatTotals s={s} list={list} wi={wi} f={f} onPick={(cats) => { setF({ cats }); toList(); }} />

      {tags.length > 0 && (
        <section class="card flush" aria-label="Etiquetas">
          <div style={{ padding: '14px 0 4px' }}><h2 class="h2">Etiquetas</h2></div>
          {tags.map((tg) => {
            const ts = summarize(s, list.filter((t) => t.tag === tg));
            return (
              <button type="button" key={tg} class="lrow" onClick={() => { setF({ tags: f.tags.includes(tg) ? [] : [tg] }); toList(); }} aria-pressed={f.tags.includes(tg) ? 'true' : 'false'}>
                <span class="tile sm" style={{ background: f.tags.includes(tg) ? 'var(--finanzas-soft)' : 'var(--soft)' }}><Icon name="tag" size={17} /></span>
                <span class="grow semi">{tg}</span>
                <span class="stack-xs" style={{ alignItems: 'flex-end', gap: 0 }}><span class="strong tab-num">{moneyR(ts.spent)}</span><span class="tiny muted semi tab-num">{usd(ts.spentUSD, { decimals: 0 })}</span></span>
              </button>
            );
          })}
        </section>
      )}

      <section class="card flush" aria-label="Movimientos" ref={listRef} style={{ scrollMarginTop: 12 }}>
        <div class="between-c" style={{ padding: '14px 0 6px' }}>
          <span class="stack-xs" style={{ gap: 0, minWidth: 0 }}>
            <h2 class="h2">{selecting ? `${chosen.length} de ${list.length}` : 'Movimientos'}</h2>
            {!selecting && <span class="tiny muted semi tab-num">{filtered ? `${list.length} de ${all.length}` : plural(list.length, 'movimiento', 'movimientos')}</span>}
          </span>
          <span class="row" style={{ gap: 2 }}>
            {!selecting && <button type="button" class="icon-btn plain" aria-label="Buscar movimientos" aria-pressed={showSearch ? 'true' : 'false'} onClick={() => { if (showSearch) setF({ q: '' }); setShowSearch(!showSearch); }}><Icon name="search" size={19} /></button>}
            {!selecting && <button type="button" class="icon-btn plain badge-btn" aria-label={`Filtros y vista${filterCount(f) ? `: ${filterCount(f)} activos` : ''}`} onClick={() => setView('filtros')}><Icon name="filter" size={19} />{filterCount(f) > 0 && <span class="badge">{filterCount(f)}</span>}</button>}
            {list.length > 0 && <button type="button" class="icon-btn plain" aria-label={selecting ? 'Terminar de seleccionar' : 'Seleccionar varios'} aria-pressed={selecting ? 'true' : 'false'} onClick={() => setSel(selecting ? null : new Set())}><Icon name={selecting ? 'close' : 'list'} size={19} /></button>}
          </span>
        </div>
        {showSearch && !selecting && <input class="input" type="search" value={f.q} placeholder="Comercio, nota, categoría, cuenta o monto" aria-label="Buscar movimientos" onInput={(e) => setF({ q: e.currentTarget.value })} ref={focusOnMount} style={{ marginBottom: 8 }} />}
        {selecting ? (
          <div class="row wrap" style={{ gap: 8, padding: '0 0 10px' }}>
            <TChip sm on={chosen.length === list.length && list.length > 0} onClick={() => setSel(new Set(list.map((t) => t.id)))}>Todos ({list.length})</TChip>
            <TChip sm onClick={() => setSel(new Set())}>Ninguno</TChip>
            {['gasto', 'ingreso', 'transfer'].filter((k) => list.some((t) => txKind(t) === k)).map((k) => <TChip key={k} sm onClick={() => setSel(new Set(list.filter((t) => txKind(t) === k).map((t) => t.id)))}>Solo {k === 'gasto' ? 'gastos' : k === 'ingreso' ? 'ingresos' : 'entre cuentas'}</TChip>)}
          </div>
        ) : (all.length > 0 || filtered) && (
          <>
            <div class="chips scroll" role="group" aria-label="Tipo de movimiento" style={{ margin: '0 -18px', padding: '2px 18px 8px' }}>
              <TChip sm on={f.kind === 'all'} onClick={() => setF({ kind: 'all' })}>Todos</TChip>
              <TChip sm on={f.kind === 'gasto'} onClick={() => setF({ kind: f.kind === 'gasto' ? 'all' : 'gasto' })}>Gastos</TChip>
              <TChip sm on={f.kind === 'ingreso'} onClick={() => setF({ kind: f.kind === 'ingreso' ? 'all' : 'ingreso' })}>Ingresos</TChip>
              {all.some((t) => txKind(t) === 'transfer') && <TChip sm on={f.kind === 'transfer'} onClick={() => setF({ kind: f.kind === 'transfer' ? 'all' : 'transfer' })}>Entre cuentas</TChip>}
              <TChip sm icon="grid" onClick={() => setView('filtros')}>{by === 'dia' ? 'Por día' : `Por ${GROUP_BY.find(([k]) => k === by)[1].toLowerCase()}`}{sort !== 'reciente' ? ` · ${SORTS.find(([k]) => k === sort)[1].toLowerCase()}` : ''}</TChip>
            </div>
            <ActiveFilters s={s} f={f} setF={setF} clear={() => { setFilter(emptyFilter()); setShowSearch(false); }} />
          </>
        )}
        {!all.length && <p class="small muted" style={{ padding: '4px 0 16px' }}>{isMonth ? 'Sin movimientos este mes. Toca + para agregar uno, o pega los avisos de tu banco.' : 'Sin movimientos en este período.'}</p>}
        {all.length > 0 && !list.length && <p class="small muted" style={{ padding: '4px 0 16px' }}>Nada coincide con el filtro.</p>}
        {by === 'dia' && days.map((d) => {
          const net = d.list.reduce((a, t) => a + (t.noStats ? 0 : txKind(t) === 'gasto' ? -txDOP(t) : txKind(t) === 'ingreso' ? txDOP(t) : 0), 0);
          return (
            <div key={d.day} class="txday">
              <div class="between-c dayhead"><span class="eyebrow" style={{ fontSize: 11.5 }}>{d.day === today ? 'Hoy' : fmtDay(d.day)}</span>{net !== 0 && <span class="tiny strong muted tab-num">{moneyR(net, { sign: net > 0 })}</span>}</div>
              {d.list.map((t) => <TxRow key={t.id} s={s} t={t} wi={wi} selecting={selecting} selected={selecting && sel.has(t.id)} onOpen={() => tap(t)} />)}
            </div>
          );
        })}
        {by === 'dia' && list.length > shown.length && <button type="button" class="lrow" style={{ justifyContent: 'center', fontWeight: 700, minHeight: 52 }} onClick={() => setLimit(limit + 80)}>Ver {Math.min(80, list.length - shown.length)} más</button>}
        {groups && groups.map((g) => {
          const isOpen = open[g.key] != null ? open[g.key] : groups.length <= 2;
          const gh = !g.isIncome && wi.ready ? fmtWork(workHours(g.sum.spent, wi), wi) : '';
          const allSel = selecting && g.items.every((t) => sel.has(t.id));
          return (
            <div key={g.key || 'none'} class="txday">
              <div class="grp-head">
                {selecting && <button type="button" class="selbox-btn" aria-label={`${allSel ? 'Quitar' : 'Seleccionar'} los ${g.items.length} de ${g.name}`} aria-pressed={allSel ? 'true' : 'false'} onClick={() => { const n = new Set(sel); for (const t of g.items) { if (allSel) n.delete(t.id); else n.add(t.id); } setSel(n); }}><span class="selbox">{allSel && <Icon name="check" size={15} stroke={3} />}</span></button>}
                <button type="button" class="grp-btn" aria-expanded={isOpen ? 'true' : 'false'} onClick={() => setOpen({ ...open, [g.key]: !isOpen })}>
                  <span class="tile xs" style={{ background: g.isIncome ? 'var(--good-soft)' : 'var(--finanzas-soft)', color: g.isIncome ? 'var(--good-ink)' : 'var(--finanzas-ink)' }}><Icon name={g.icon} size={15} /></span>
                  <span class="stack-xs grow" style={{ minWidth: 0, gap: 4 }}>
                    <span class="between-c" style={{ gap: 8 }}><span class="semi clip">{g.name}</span><span class="strong tab-num" style={{ whiteSpace: 'nowrap', color: g.isIncome ? 'var(--good-ink)' : undefined }}>{g.isIncome ? '+' : ''}{moneyR(g.main)}</span></span>
                    <span class="hbar"><i style={{ width: `${Math.max(2, g.share * 100)}%`, background: g.isIncome ? 'var(--good)' : undefined }} /></span>
                    <span class="tiny muted semi row wrap" style={{ gap: 4 }}>{plural(g.items.length, 'movimiento', 'movimientos')} · {Math.round(g.share * 100)} %{g.sum.income > 0 && g.sum.spent > 0 ? ` · entró ${money(g.sum.income)}` : ''}{gh && <span class="row hrs">· <Icon name="clock" size={11} stroke={2.4} />{gh}</span>}</span>
                  </span>
                  <Icon name={isOpen ? 'down' : 'right'} size={16} />
                </button>
              </div>
              {isOpen && g.items.slice(0, open[`${g.key}+`] ? 400 : 25).map((t) => <TxRow key={t.id} s={s} t={t} wi={wi} day={fmtShort(t.day)} selecting={selecting} selected={selecting && sel.has(t.id)} onOpen={() => tap(t)} />)}
              {isOpen && g.items.length > 25 && !open[`${g.key}+`] && <button type="button" class="lrow" style={{ justifyContent: 'center', fontWeight: 700 }} onClick={() => setOpen({ ...open, [`${g.key}+`]: true })}>Ver los {g.items.length}</button>}
            </div>
          );
        })}
        {!selecting && list.length > 0 && <button type="button" class="lrow" style={{ justifyContent: 'center', fontWeight: 700, color: 'var(--ink)' }} onClick={() => exportCsv(list, `astra-movimientos-${range.kind === 'todo' ? 'todo' : range.kind === 'mes' ? range.mk : `${range.from}-a-${range.to > today ? today : range.to}`}.csv`)}><Icon name="upload" size={17} />Exportar lo que ves (Excel)</button>}
      </section>

      {selecting && (
        <div class="selbar" role="region" aria-label="Seleccionados">
          <span class="stack-xs grow" style={{ minWidth: 0, gap: 0 }}>
            <span class="strong">{plural(chosen.length, 'seleccionado', 'seleccionados')}</span>
            <span class="tiny semi muted tab-num row" style={{ gap: 4, flexWrap: 'wrap' }}>{chosen.length ? [selSum.spent ? `Gastos ${money(selSum.spent)}` : '', selSum.income ? `ingresos ${money(selSum.income)}` : '', selSum.moved ? `entre cuentas ${money(selSum.moved)}` : ''].filter(Boolean).join(' · ') : 'Toca los movimientos'}{chosen.length > 0 && selSum.spent > 0 && wi.ready && <span class="row hrs">· <Icon name="clock" size={11} stroke={2.4} />{fmtWork(workHours(selSum.spent, wi), wi)}</span>}</span>
          </span>
          <button type="button" class="btn sm" disabled={!chosen.length} onClick={() => setView('bulk')}><Icon name="edit" size={17} />Editar</button>
        </div>
      )}

      {view === 'filtros' && <FilterSheet s={s} f={f} all={all} by={by} sort={sort} onApply={(nf, nb, ns) => { setFilter(nf); setBy(nb); setSort(ns); setLimit(60); setOpen({}); setView(null); if (nf.q) setShowSearch(true); }} onClose={() => setView(null)} />}
      {view === 'periodo' && <PeriodSheet per={per} today={today} onPick={(p) => { setPer(p); setLimit(60); setView(null); }} onClose={() => setView(null)} />}
      {view === 'bulk' && selecting && <BulkSheet s={s} items={chosen} wi={wi} onExport={() => exportCsv(chosen, `astra-seleccion-${today}.csv`)} onDone={() => { setView(null); setSel(null); }} onClose={() => setView(null)} />}
    </>
  );
}

// Los filtros puestos, cada uno con su «×».
function ActiveFilters({ s, f, setF, clear }) {
  const chips = [];
  if (f.cats.length) chips.push([f.cats.length === 1 ? catName(s, f.cats[0]) : `${f.cats.length} categorías`, () => setF({ cats: [] })]);
  if (f.accounts.length) chips.push([f.accounts.length === 1 ? accountLabel(accountOf(s, f.accounts[0])) || 'Cuenta' : `${f.accounts.length} cuentas`, () => setF({ accounts: [] })]);
  if (f.tags.length) chips.push([f.tags.join(', '), () => setF({ tags: [] })]);
  if (f.min != null || f.max != null) chips.push([f.min != null && f.max != null ? `${money(f.min)} a ${money(f.max)}` : f.min != null ? `Desde ${money(f.min)}` : `Hasta ${money(f.max)}`, () => setF({ min: null, max: null })]);
  if (f.cur) chips.push([f.cur === 'USD' ? 'En dólares' : 'En pesos', () => setF({ cur: null })]);
  if (f.srcs.length) chips.push([f.srcs.map((k) => (SOURCES.find(([x]) => x === k) || [k, k])[1]).join(', '), () => setF({ srcs: [] })]);
  if (f.only) chips.push([(ONLY.find(([x]) => x === f.only) || ['', ''])[1], () => setF({ only: null })]);
  if (!chips.length) return null;
  return (
    <div class="row wrap" style={{ padding: '0 0 10px', gap: 8 }}>
      {chips.map(([label, off]) => (
        <button key={label} type="button" class="chip" style={{ background: 'var(--finanzas-soft)', color: 'var(--finanzas-ink)', border: 'none', minHeight: 32 }} onClick={off} aria-label={`Quitar filtro: ${label}`}>
          <Icon name="filter" size={13} />{label}<Icon name="close" size={13} stroke={2.6} />
        </button>
      ))}
      {chips.length > 1 && <button type="button" class="link-btn muted" style={{ minHeight: 32, fontSize: 13 }} onClick={clear}>Quitar todos</button>}
    </div>
  );
}

// ---------- Totales por categoría o familia ----------

export function CatTotals({ s, list, wi, f, onPick }) {
  const [type0, setType] = useState('gasto');
  const [by, setBy] = useState('categoria');
  const [all, setAll] = useState(false);
  const hasIncome = list.some((t) => txKind(t) === 'ingreso' && !t.noStats);
  const hasSpent = list.some((t) => txKind(t) === 'gasto' && !t.noStats);
  if (!hasIncome && !hasSpent) return null;
  // Si solo hay ingresos (por ejemplo, con el filtro «Ingresos»), se ven los ingresos.
  const type = !hasSpent ? 'ingreso' : !hasIncome ? 'gasto' : type0;
  const ct = catTotals(s, list, { type, by });
  const rows = all ? ct.rows : ct.rows.slice(0, 5);
  const max = ct.rows.length ? ct.rows[0].total : 1;
  return (
    <section class="card" aria-label="Totales por categoría">
      <div class="between-c" style={{ gap: 8 }}>
        <h2 class="h2">Por {by === 'familia' ? 'familia' : 'categoría'}</h2>
        {hasIncome && hasSpent && <div class="seg mini" role="tablist" aria-label="Gastos o ingresos">{[['gasto', 'Gastos'], ['ingreso', 'Ingresos']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={type === k ? 'true' : 'false'} onClick={() => { setType(k); setAll(false); }}>{l}</button>)}</div>}
      </div>
      <div class="between-c" style={{ gap: 8 }}>
        <div class="seg mini" role="tablist" aria-label="Agrupar">{[['categoria', 'Categorías'], ['familia', 'Familias']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={by === k ? 'true' : 'false'} onClick={() => { setBy(k); setAll(false); }}>{l}</button>)}</div>
        <span class="tiny muted semi">toca para filtrar</span>
      </div>
      {!ct.rows.length && <span class="small muted">Sin {type === 'ingreso' ? 'ingresos' : 'gastos'} aquí.</span>}
      <div class="stack-sm">
        {rows.map((r) => {
          const pct = Math.round(r.share * 100);
          const hrs = type === 'gasto' && wi && wi.ready ? fmtWork(workHours(r.total, wi), wi) : '';
          const on = f.cats.length && r.cats.every((c) => f.cats.includes(c)) && f.cats.length === r.cats.length;
          return (
            <button type="button" key={r.key} class="catbar" aria-pressed={on ? 'true' : 'false'} aria-label={`${r.name}: ${money(r.total)}, ${pct} por ciento${hrs ? `, ${hrs} de trabajo` : ''}. Ver movimientos`}
              onClick={() => onPick(on ? [] : by === 'familia' ? catsOfGroup(s, r.key, type) : [r.key])}>
              <span class="row" style={{ gap: 10 }}>
                <span class="tile xs" style={{ background: type === 'ingreso' ? 'var(--good-soft)' : 'var(--finanzas-soft)', color: type === 'ingreso' ? 'var(--good-ink)' : 'var(--finanzas-ink)' }}><Icon name={r.icon} size={15} /></span>
                <span class="stack-xs grow" style={{ minWidth: 0, gap: 0 }}>
                  <span class="semi" style={{ lineHeight: 1.25 }}>{r.name}</span>
                  <span class="tiny muted semi">{plural(r.n, 'vez', 'veces')}{hrs ? ` · ${hrs} de trabajo` : ''}</span>
                </span>
                <span class="stack-xs" style={{ alignItems: 'flex-end', gap: 0, flexShrink: 0 }}><span class="strong tab-num">{moneyR(r.total)}</span><span class="tiny muted semi tab-num" style={{ whiteSpace: 'nowrap' }}>{pct} % · {usd(r.usd, { decimals: 0 })}</span></span>
              </span>
              <span class="catbar-track" aria-hidden="true"><i style={{ width: `${max ? Math.max(2, (r.total / max) * 100) : 0}%`, background: type === 'ingreso' ? 'var(--good)' : undefined }} /></span>
            </button>
          );
        })}
      </div>
      {ct.rows.length > 5 && <button type="button" class="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setAll(!all)}>{all ? 'Ver menos' : `Ver las ${ct.rows.length}`}<Icon name={all ? 'down' : 'right'} size={15} /></button>}
      {ct.rows.length > 0 && <div class="between-c" style={{ borderTop: '1.5px solid var(--line)', paddingTop: 10 }}><span class="semi">Total {type === 'ingreso' ? 'de ingresos' : 'de gastos'}</span><span class="strong tab-num">{moneyR(ct.total)}</span></div>}
    </section>
  );
}

const catsOfGroup = (s, g, type) => s.money.categories.filter((c) => c.group === g && c.type === type).map((c) => c.id);

// ---------- Hoja: filtros y vista ----------

function FilterSheet({ s, f, all, by: by0, sort: sort0, onApply, onClose }) {
  const [x, setX] = useState(() => ({ ...f, min: f.min != null ? String(f.min) : '', max: f.max != null ? String(f.max) : '' }));
  const [by, setBy] = useState(by0);
  const [sort, setSort] = useState(sort0);
  const [catType, setCatType] = useState(f.kind === 'ingreso' ? 'ingreso' : f.kind === 'transfer' ? 'transfer' : 'gasto');
  const [allCats, setAllCats] = useState(false);
  const set = (patch) => setX({ ...x, ...patch });
  const tog = (key, v) => set({ [key]: x[key].includes(v) ? x[key].filter((y) => y !== v) : [...x[key], v] });
  const used = new Set(all.map((t) => t.cat));
  const ofType = s.money.categories.filter((c) => c.type === catType);
  // Primero las que tienen movimientos en el período (y las que ya elegiste); las demás, al tocar «Ver todas».
  const few = !allCats && ofType.some((c) => used.has(c.id));
  const groups = CATEGORY_GROUPS.map((g) => ({ ...g, cats: ofType.filter((c) => c.group === g.id && (few ? used.has(c.id) || x.cats.includes(c.id) : !c.hidden || used.has(c.id))) })).filter((g) => g.cats.length);
  const hiddenN = few ? ofType.filter((c) => !c.hidden && !used.has(c.id) && !x.cats.includes(c.id)).length : 0;
  const accounts = s.money.accounts.filter((a) => !a.hidden || all.some((t) => t.account === a.id));
  const tags = txTags(s);
  const srcs = SOURCES.filter(([k]) => all.some((t) => (t.source || 'manual') === k));
  const apply = () => {
    const min = num(x.min); const max = num(x.max);
    onApply({ ...x, min: x.min.trim() !== '' && min != null ? min : null, max: x.max.trim() !== '' && max != null ? max : null }, by, sort);
  };
  const reset = () => { setX({ ...emptyFilter(), min: '', max: '' }); setBy('dia'); setSort('reciente'); };
  return (
    <Sheet onClose={onClose} label="Filtros y vista">
      <SheetHead title="Filtros y vista" onClose={onClose} />
      <div class="stack-sm">
        <span class="label">Agrupar por</span>
        <div class="chips" role="group" aria-label="Agrupar por">{GROUP_BY.map(([k, l]) => <TChip key={k} sm on={by === k} onClick={() => setBy(k)}>{l}</TChip>)}</div>
        <span class="small muted">Cada grupo muestra su total, cuántos son y qué parte del gasto es.</span>
      </div>
      <div class="stack-sm">
        <span class="label">Ordenar</span>
        <div class="chips" role="group" aria-label="Ordenar">{SORTS.map(([k, l]) => <TChip key={k} sm on={sort === k} onClick={() => setSort(k)}>{l}</TChip>)}</div>
      </div>
      <div class="stack-sm">
        <span class="label">Tipo</span>
        <div class="chips" role="group" aria-label="Tipo">{[['all', 'Todos'], ['gasto', 'Gastos'], ['ingreso', 'Ingresos'], ['transfer', 'Entre cuentas']].map(([k, l]) => <TChip key={k} sm on={x.kind === k} onClick={() => { set({ kind: k }); if (k !== 'all') setCatType(k); }}>{l}</TChip>)}</div>
      </div>
      <div class="stack-sm">
        <div class="between-c"><span class="label">Categorías{x.cats.length ? ` · ${x.cats.length}` : ''}</span>{x.cats.length > 0 && <button type="button" class="link-btn muted" style={{ minHeight: 30, fontSize: 13 }} onClick={() => set({ cats: [] })}>Ninguna</button>}</div>
        <div class="seg mini" role="tablist" aria-label="Categorías de">{[['gasto', 'Gastos'], ['ingreso', 'Ingresos'], ['transfer', 'Entre cuentas']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={catType === k ? 'true' : 'false'} onClick={() => setCatType(k)}>{l}</button>)}</div>
        {groups.map((g) => {
          const ids = g.cats.map((c) => c.id);
          const allOn = ids.every((id) => x.cats.includes(id));
          return (
            <div key={g.id} class="stack-xs">
              <button type="button" class="link-btn" style={{ minHeight: 30, fontSize: 12.5, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)', alignSelf: 'flex-start' }} onClick={() => set({ cats: allOn ? x.cats.filter((c) => !ids.includes(c)) : [...new Set([...x.cats, ...ids])] })} aria-pressed={allOn ? 'true' : 'false'}>{g.name}{ids.length > 1 ? (allOn ? ' · quitar todas' : ' · marcar todas') : ''}</button>
              <div class="chips" role="group" aria-label={g.name}>{g.cats.map((c) => <TChip key={c.id} sm icon={c.icon || 'tag'} on={x.cats.includes(c.id)} onClick={() => tog('cats', c.id)}>{c.name}</TChip>)}</div>
            </div>
          );
        })}
        {few && hiddenN > 0 && <button type="button" class="link-btn" style={{ alignSelf: 'flex-start', minHeight: 32 }} onClick={() => setAllCats(true)}><Icon name="plus" size={15} />Ver las otras {hiddenN} (sin movimientos aquí)</button>}
      </div>
      {accounts.length > 0 && (
        <div class="stack-sm">
          <span class="label">Cuentas y tarjetas</span>
          <div class="chips" role="group" aria-label="Cuentas">{accounts.map((a) => <TChip key={a.id} sm icon={ACC_ICON[a.kind] || 'card'} on={x.accounts.includes(a.id)} onClick={() => tog('accounts', a.id)}>{accountLabel(a)}</TChip>)}</div>
        </div>
      )}
      <div class="stack-sm">
        <span class="label">Monto (en pesos)</span>
        <div class="grid2">
          <div class="field"><label for="fmin">Desde</label><div class="numrow"><span class="unit">RD$</span><input id="fmin" class="input" inputMode="decimal" value={x.min} placeholder="0" onInput={(e) => set({ min: e.currentTarget.value })} /></div></div>
          <div class="field"><label for="fmax">Hasta</label><div class="numrow"><span class="unit">RD$</span><input id="fmax" class="input" inputMode="decimal" value={x.max} placeholder="Sin tope" onInput={(e) => set({ max: e.currentTarget.value })} /></div></div>
        </div>
        <div class="chips" role="group" aria-label="Moneda">{[[null, 'Las dos monedas'], ['DOP', 'Solo en pesos'], ['USD', 'Solo en dólares']].map(([k, l]) => <TChip key={l} sm on={x.cur === k} onClick={() => set({ cur: k })}>{l}</TChip>)}</div>
      </div>
      {tags.length > 0 && (
        <div class="stack-sm">
          <span class="label">Etiquetas</span>
          <div class="chips" role="group" aria-label="Etiquetas">{tags.map((tg) => <TChip key={tg} sm icon="tag" on={x.tags.includes(tg)} onClick={() => tog('tags', tg)}>{tg}</TChip>)}</div>
        </div>
      )}
      {srcs.length > 1 && (
        <div class="stack-sm">
          <span class="label">Cómo se registró</span>
          <div class="chips" role="group" aria-label="Cómo se registró">{srcs.map(([k, l]) => <TChip key={k} sm on={x.srcs.includes(k)} onClick={() => tog('srcs', k)}>{l}</TChip>)}</div>
        </div>
      )}
      <div class="stack-sm">
        <span class="label">Solo los que…</span>
        <div class="chips" role="group" aria-label="Solo los que">{ONLY.map(([k, l]) => <TChip key={k} sm on={x.only === k} onClick={() => set({ only: x.only === k ? null : k })}>{l}</TChip>)}</div>
      </div>
      <div class="field"><label for="fq">Texto</label><input id="fq" class="input" type="search" value={x.q} placeholder="Comercio, nota, cuenta o monto" onInput={(e) => set({ q: e.currentTarget.value })} /></div>
      <div class="row">
        <button type="button" class="btn grow" onClick={apply}><Icon name="check" size={20} />Ver</button>
        <button type="button" class="btn ghost" onClick={reset}>Limpiar</button>
      </div>
    </Sheet>
  );
}

// ---------- Hoja: período ----------

function PeriodSheet({ per, today, onPick, onClose }) {
  const r = periodRange(per, today);
  const [from, setFrom] = useState(r.kind === 'rango' ? r.from : `${monthKey(today)}-01`);
  const [to, setTo] = useState(r.kind === 'rango' ? r.to : today);
  const mk = monthKey(today);
  const opts = [
    [{ kind: 'mes', mk }, 'Este mes'], [{ kind: 'mes', mk: shiftMonth(mk, -1) }, 'Mes pasado'], [{ kind: '3m' }, 'Últimos 3 meses'],
    [{ kind: '6m' }, 'Últimos 6 meses'], [{ kind: '12m' }, 'Últimos 12 meses'], [{ kind: 'ano' }, `Este año (${today.slice(0, 4)})`], [{ kind: 'todo' }, 'Todo'],
  ];
  const same = (p) => p.kind === r.kind && (p.kind !== 'mes' || p.mk === r.mk);
  return (
    <Sheet onClose={onClose} label="Período">
      <SheetHead title="Período" onClose={onClose} />
      <section class="card flush">
        {opts.map(([p, l]) => (
          <button key={l} type="button" class="lrow" style={{ minHeight: 54 }} onClick={() => onPick(p)} aria-pressed={same(p) ? 'true' : 'false'}>
            <span class="grow semi">{l}</span>{same(p) && <Icon name="check" size={18} />}
          </button>
        ))}
      </section>
      <div class="stack-sm">
        <span class="label">Elegir fechas</span>
        <div class="grid2">
          <div class="field"><label for="pfrom">Desde</label><input id="pfrom" type="date" class="input" value={from} max={today} onInput={(e) => setFrom(e.currentTarget.value)} /></div>
          <div class="field"><label for="pto">Hasta</label><input id="pto" type="date" class="input" value={to} onInput={(e) => setTo(e.currentTarget.value)} /></div>
        </div>
        <button type="button" class="btn sm" style={{ alignSelf: 'flex-start' }} disabled={!from || !to} onClick={() => onPick({ kind: 'rango', from, to })}><Icon name="calendar" size={17} />Ver esas fechas</button>
      </div>
    </Sheet>
  );
}

// ---------- Hoja: editar varios ----------

const KEEP = '__keep';
function BulkSheet({ s, items, wi, onExport, onDone, onClose }) {
  const kinds = [...new Set(items.map((t) => txKind(t)))];
  const sum = summarize(s, items);
  const [type, setType] = useState(KEEP);
  const finalKind = type !== KEEP ? type : kinds.length === 1 ? kinds[0] : null;
  const [catFor, setCatFor] = useState(kinds.includes('gasto') ? 'gasto' : kinds[0]);
  const [cat, setCat] = useState(null);
  const [pick, setPick] = useState(false);
  const [account, setAccount] = useState(KEEP);
  const [tag, setTag] = useState(KEEP);
  const [tagTxt, setTagTxt] = useState('');
  const [merchant, setMerchant] = useState('');
  const [day, setDay] = useState('');
  const [note, setNote] = useState('');
  const [count, setCount] = useState(KEEP);
  const tags = txTags(s);
  const tx4tax = taxable(s, items.map((t) => t.id));
  const catKind = finalKind || catFor;
  const nFor = (k) => items.filter((t) => (type !== KEEP ? type : txKind(t)) === k).length;
  const patch = {};
  if (type !== KEEP) patch.type = type;
  if (cat && catOf(s, cat).type === catKind) patch.cat = cat;
  if (account !== KEEP) patch.account = account;
  if (tag !== KEEP) patch.tag = tag === '' ? '' : tagTxt.trim();
  if (merchant.trim()) patch.merchant = merchant.trim();
  if (day) patch.day = day;
  if (note.trim()) patch.note = note.trim();
  if (count !== KEEP) patch.noStats = count === 'no';
  const changes = Object.keys(patch).length;
  const save = async () => {
    if (patch.merchant && !(await ask(`¿Poner «${patch.merchant}» como comercio de los ${items.length}?`, { ok: 'Cambiar' }))) return;
    const n = act((st) => bulkEdit(st, items.map((t) => t.id), patch));
    toast(n ? `Cambiaste ${plural(n, 'movimiento', 'movimientos')}` : 'No había nada que cambiar', n ? 'check' : 'info');
    onDone();
  };
  const addTax = () => {
    const n = act((st) => bulkAddTax(st, tx4tax.map((t) => t.id), { fee: Number(s.money.tax.fee) || 0 }));
    toast(`Impuesto agregado a ${plural(n, 'transferencia', 'transferencias')}`, 'percent');
    onDone();
  };
  const del = async () => {
    if (!(await ask(`¿Borrar ${plural(items.length, 'movimiento', 'movimientos')}? Puedes deshacerlo justo después.`, { ok: 'Borrar', danger: true }))) return;
    const n = act((st) => bulkRemove(st, items.map((t) => t.id)));
    toast(`Borraste ${plural(n, 'movimiento', 'movimientos')}`, 'trash');
    onDone();
  };
  const keepChip = (on, fn) => <TChip sm on={on} onClick={fn}>No cambiar</TChip>;
  return (
    <Sheet onClose={onClose} label={`Editar ${items.length} movimientos`}>
      <SheetHead title={`Editar ${plural(items.length, 'movimiento', 'movimientos')}`} onClose={onClose} />
      <div class="panel stack-xs">
        {sum.spent > 0 && <div class="between"><span class="small semi">Gastos ({sum.nSpent})</span><span class="stack-xs" style={{ alignItems: 'flex-end', gap: 0 }}><span class="small strong tab-num">{money(sum.spent)}</span>{wi.ready && <span class="tiny semi muted row hrs"><Icon name="clock" size={11} stroke={2.4} />{fmtWork(workHours(sum.spent, wi), wi)} de trabajo</span>}</span></div>}
        {sum.income > 0 && <div class="between"><span class="small semi">Ingresos ({sum.nIncome})</span><span class="small strong tab-num" style={{ color: 'var(--good-ink)' }}>{money(sum.income)}</span></div>}
        {sum.moved > 0 && <div class="between"><span class="small semi">Entre cuentas</span><span class="small strong tab-num">{money(sum.moved)}</span></div>}
        {sum.nExcluded > 0 && <div class="between"><span class="small semi muted">Que no cuentan ({sum.nExcluded})</span><span class="small strong tab-num">{money(sum.excluded)}</span></div>}
      </div>
      <span class="small muted">Solo cambia lo que elijas; lo demás se queda como está. Puedes deshacerlo justo después.</span>

      <div class="stack-sm">
        <span class="label">Categoría</span>
        {!finalKind && <div class="seg mini" role="tablist" aria-label="Categorías de">{kinds.map((k) => <button key={k} type="button" role="tab" aria-selected={catFor === k ? 'true' : 'false'} onClick={() => { setCatFor(k); setCat(null); }}>{k === 'gasto' ? 'Gastos' : k === 'ingreso' ? 'Ingresos' : 'Entre cuentas'}</button>)}</div>}
        {!pick ? (
          <div class="chips">
            {keepChip(!cat, () => setCat(null))}
            {cat && <TChip sm on icon={catOf(s, cat).icon || 'tag'}>{catName(s, cat)}</TChip>}
            <TChip sm icon="grid" onClick={() => setPick(true)}>Elegir</TChip>
          </div>
        ) : <CatPicker s={s} type={catKind} value={cat} onChange={(v) => { setCat(v); setPick(false); }} />}
        {cat && !finalKind && <span class="small muted">Se pone a {plural(nFor(catKind), catKind === 'gasto' ? 'gasto' : catKind === 'ingreso' ? 'ingreso' : 'movimiento entre cuentas', catKind === 'gasto' ? 'gastos' : catKind === 'ingreso' ? 'ingresos' : 'movimientos entre cuentas')}; los demás se quedan con la suya.</span>}
      </div>

      <div class="stack-sm">
        <span class="label">Tipo</span>
        <div class="chips">{keepChip(type === KEEP, () => setType(KEEP))}{['gasto', 'ingreso', 'transfer'].map((k) => <TChip key={k} sm on={type === k} onClick={() => { setType(k); setCat(null); }}>{KIND_LABEL[k]}</TChip>)}</div>
        {type !== KEEP && <span class="small muted">Si su categoría no es de ese tipo, pasa a la general ({type === 'gasto' ? 'Otros gastos' : type === 'ingreso' ? 'Otros ingresos' : 'Entre tus cuentas'}), salvo que elijas otra.</span>}
      </div>

      <div class="stack-sm">
        <span class="label">Cuenta o tarjeta</span>
        <div class="chips">
          {keepChip(account === KEEP, () => setAccount(KEEP))}
          <TChip sm on={account === ''} onClick={() => setAccount('')}>Sin cuenta</TChip>
          {s.money.accounts.filter((a) => !a.hidden).map((a) => <TChip key={a.id} sm icon={ACC_ICON[a.kind] || 'card'} on={account === a.id} onClick={() => setAccount(a.id)}>{accountLabel(a)}</TChip>)}
        </div>
      </div>

      <div class="stack-sm">
        <span class="label">Etiqueta</span>
        <div class="chips">
          {keepChip(tag === KEEP, () => setTag(KEEP))}
          <TChip sm on={tag === ''} onClick={() => setTag('')}>Quitar</TChip>
          <TChip sm on={tag === 'set'} icon="tag" onClick={() => setTag('set')}>Poner</TChip>
        </div>
        {tag === 'set' && (
          <>
            <input class="input" value={tagTxt} maxLength={30} placeholder="Ej. Viaje a Samaná" onInput={(e) => setTagTxt(e.currentTarget.value)} ref={focusOnMount} aria-label="Etiqueta" />
            {tags.length > 0 && <div class="chips">{tags.slice(0, 6).map((tg) => <TChip key={tg} sm icon="tag" on={tagTxt === tg} onClick={() => setTagTxt(tg)}>{tg}</TChip>)}</div>}
          </>
        )}
      </div>

      <div class="stack-sm">
        <span class="label">¿Cuentan en el análisis y los presupuestos?</span>
        <div class="chips">{keepChip(count === KEEP, () => setCount(KEEP))}<TChip sm on={count === 'si'} onClick={() => setCount('si')}>Sí cuentan</TChip><TChip sm on={count === 'no'} icon="eyeoff" onClick={() => setCount('no')}>No contar</TChip></div>
        {count === 'no' && <span class="small muted">Siguen moviendo tus saldos, pero no suman en gastos, ingresos, presupuestos ni análisis. Sirve para un préstamo que diste o gastos que te van a reembolsar.</span>}
      </div>

      <div class="grid2">
        <div class="field"><label for="bday">Fecha</label><input id="bday" type="date" class="input" value={day} onInput={(e) => setDay(e.currentTarget.value)} /></div>
        <div class="field"><label for="bmer">Comercio</label><input id="bmer" class="input" value={merchant} maxLength={60} placeholder="No cambiar" onInput={(e) => setMerchant(e.currentTarget.value)} /></div>
      </div>
      <div class="field"><label for="bnote">Agregar a la nota</label><input id="bnote" class="input" value={note} maxLength={120} placeholder="Ej. Revisado con el estado de cuenta" onInput={(e) => setNote(e.currentTarget.value)} /></div>

      <button type="button" class="btn block" disabled={!changes || (tag === 'set' && !tagTxt.trim())} onClick={save}><Icon name="check" size={20} />{changes ? `Cambiar ${plural(items.length, 'movimiento', 'movimientos')}` : 'Elige qué cambiar'}</button>

      {tx4tax.length > 0 && (
        <button type="button" class="btn soft block" onClick={addTax}><Icon name="percent" size={18} />Agregar el impuesto ({taxPct(transferTaxRate(s, tx4tax[0].day))}) a {plural(tx4tax.length, 'transferencia', 'transferencias')}</button>
      )}
      <div class="row wrap" style={{ justifyContent: 'center', gap: 18 }}>
        <button type="button" class="link-btn" onClick={onExport}><Icon name="upload" size={16} />Exportar a Excel</button>
        <button type="button" class="link-btn" style={{ color: 'var(--vit-ink)' }} onClick={del}><Icon name="trash" size={16} />Borrar</button>
      </div>
    </Sheet>
  );
}

// ---------- Exportar a CSV (Excel) ----------

export function csvOf(s, list, wi = null) {
  const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const rows = [['Fecha', 'Hora', 'Tipo', 'Comercio o descripción', 'Categoría', 'Familia', 'Cuenta', 'Etiqueta', 'Moneda', 'Monto original', 'Tasa', 'Monto en RD$', 'Equivalente en US$', 'Horas de trabajo', 'Cuenta en el análisis', 'Nota']];
  for (const t of list) {
    const k = txKind(t);
    const sign = k === 'ingreso' ? 1 : -1;
    const h = k === 'gasto' && wi && wi.ready ? workHours(txDOP(t), wi) : null;
    rows.push([t.day, t.time || '', KIND_LABEL[k], t.merchant, catName(s, t.cat), groupName(catOf(s, t.cat).group), accountLabel(accountOf(s, t.account)), t.tag || '', txCur(t), (sign * txOrig(t)).toFixed(2), txRate(s, t).toFixed(4), (sign * txDOP(t)).toFixed(2), (sign * txUSD(s, t)).toFixed(2), h != null ? h.toFixed(2) : '', t.noStats ? 'No' : 'Sí', t.note || '']);
  }
  return `﻿${rows.map((r) => r.map(q).join(',')).join('\r\n')}\r\n`;
}
