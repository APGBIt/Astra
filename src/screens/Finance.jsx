import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Nav, Bar, Sheet, SheetHead, TChip, Switch, money, usd, cur, rateText, toast, ask, focusOnMount, plural } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { go } from '../app/router.js';
import { monthKey, monthName, relDay, fmtDay } from '../app/dates.js';
import { refreshRate, rateForDay } from '../app/fx.js';
import { saveFile } from '../app/files.js';
import {
  attrLevel, monthSummary, addTx, updateTx, removeTx, setBudget, catOf, catName, catGroups, catsOfType, addCategory, updateCategory, removeCategory,
  bossHP, fxRate, fxIsManual, setManualRate, toDOP, toUSD, txKind, txCur, txOrig, txDOP, txUSD, txRate, accountOf, accountLabel,
  guessTxCat, learnRule, txTags, undoImport, frequentCats,
} from '../game/logic.js';
import { parseBankAlerts, toNumber } from '../game/parse.js';
import { CATEGORY_GROUPS, ACCOUNT_KINDS, CATEGORY_ICONS } from '../game/content.js';
import { AreaTodos } from './Todos.jsx';
import { CatPicker } from '../ui/catpicker.jsx';
import { setPending } from './Import.jsx';
import { PhotoStrip } from '../ui/photos.jsx';
import {
  MoneyOverview, AccountsTab, PlanTab, CardSheet, AccountSheet, PlanSheet, DueSheet, FundSheet, BudgetCatSheet, payInitial, AccountForm,
} from './Money.jsx';
import { monthPlan, isCard } from '../game/money.js';

const SRC_LABEL = { recibo: 'Recibo', alerta: 'Aviso del banco', voz: 'Registro rápido', manual: 'A mano', importado: 'Importado', correo: 'Correo del banco' };
const KIND_LABEL = { gasto: 'Gasto', ingreso: 'Ingreso', transfer: 'Entre cuentas' };
const ACC_ICON = Object.fromEntries(ACCOUNT_KINDS.map((k) => [k.key, k.icon]));

function shiftMonth(mk, n) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const signed = (t) => {
  const k = txKind(t);
  const v = cur(txOrig(t), txCur(t));
  return k === 'ingreso' ? `+${v}` : k === 'transfer' ? v : `−${v}`;
};
// La otra moneda del movimiento: si fue en US$, cuánto fue en pesos; si fue en pesos, cuánto en US$.
const otherSide = (s, t) => (txCur(t) === 'USD' ? money(txDOP(t)) : usd(txUSD(s, t)));

const fxWhen = (s, today) => {
  const fx = s.money.fx;
  if (fxIsManual(s)) return 'Tu tasa';
  if (!fx.day) return '';
  return fx.day === today ? 'Hoy' : relDay(fx.day, today);
};

const TABS = [['resumen', 'Resumen'], ['cuentas', 'Cuentas'], ['plan', 'Plan'], ['movimientos', 'Movimientos']];

export function Finance({ query }) {
  const s = useApp();
  const today = s.energy.day;
  const q0 = query.get('tab');
  const [tab, setTabState] = useState(TABS.some(([k]) => k === q0) ? q0 : 'resumen');
  const [sheet, setSheet] = useState(query.get('alerta') ? { kind: 'alert' } : query.get('nuevo') ? { kind: 'tx' } : null);
  const [filter, setFilter] = useState({ kind: 'all', cat: null, account: null, tag: null });
  const [mk, setMk] = useState(monthKey(today));
  useEffect(() => { refreshRate(); }, []);

  const lvl = attrLevel(s.attrs.finanzas);
  const rate = fxRate(s, today);
  const bosses = s.bosses.filter((b) => b.area === 'finanzas' && b.status === 'active');
  const imp = s.money.lastImport;
  const setTab = (t) => { setTabState(t); go(`/finanzas?tab=${t}`, { replace: true }); window.scrollTo(0, 0); };
  // Desde una cuenta, una tarjeta o un presupuesto: sus movimientos de este mes.
  const showMovements = (account = null, cat = null) => {
    setSheet(null);
    setFilter({ kind: 'all', cat, account, tag: null });
    setMk(monthKey(today));
    setTab('movimientos');
  };
  const pay = (it) => setSheet(payInitial(s, it, today));

  return (
    <>
      <main class="screen">
        <header class="between-c">
          <div class="stack-xs"><span class="eyebrow" style={{ color: 'var(--finanzas-ink)' }}>Fortuna · Nv {lvl.n}</span><h1 class="h1">Finanzas</h1></div>
          <div class="row" style={{ gap: 8 }}>
            <button type="button" class="icon-btn" aria-label="Pegar avisos del banco" onClick={() => setSheet({ kind: 'alert' })}><Icon name="paste" size={20} /></button>
            <button type="button" class="icon-btn" aria-label="Más opciones de finanzas" onClick={() => setSheet({ kind: 'more' })}><Icon name="dots" size={20} /></button>
            <a class="btn sm" href="#/recibo"><Icon name="camera" size={18} />Recibo</a>
          </div>
        </header>

        <div class="seg fin-tabs" role="tablist" aria-label="Secciones de finanzas">
          {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k ? 'true' : 'false'} onClick={() => setTab(k)}>{l}</button>)}
        </div>

        {imp && (tab === 'resumen' || tab === 'movimientos') && (
          <div class="note tone-good" role="status">
            <Icon name="check" size={20} />
            <span class="stack-sm grow">
              <span>Agregaste {plural(imp.n, 'movimiento', 'movimientos')} de «{imp.label}».</span>
              <span class="row wrap" style={{ gap: 14 }}>
                <button type="button" class="link-btn" style={{ color: 'inherit', minHeight: 32 }} onClick={async () => {
                  if (!(await ask(`¿Quitar los ${imp.n} movimientos que agregaste de «${imp.label}»?`, { ok: 'Quitar', danger: true }))) return;
                  const n = act((st) => undoImport(st, imp.batch));
                  toast(`Se quitaron ${plural(n, 'movimiento', 'movimientos')}`, 'undo');
                }}><Icon name="undo" size={15} />Deshacer</button>
                <button type="button" class="link-btn" style={{ color: 'inherit', minHeight: 32 }} onClick={() => act((st) => { st.money.lastImport = null; })}>Listo</button>
              </span>
            </span>
          </div>
        )}

        {tab === 'resumen' && (
          <>
            <MoneyOverview s={s} today={today} setSheet={setSheet} setTab={setTab} />
            <RecentTx s={s} today={today} onOpen={(t) => setSheet({ kind: 'tx', tx: t })} onAll={() => setTab('movimientos')} />
            {bosses.map((b) => (
              <a key={b.id} href={`#/jefe/${b.id}`} class="card" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
                <div class="row"><span class="tile" style={{ background: 'var(--boss)', color: 'var(--xp)' }}><Icon name="sword" /></span><span class="stack-xs grow"><span class="tiny strong muted">Jefe</span><span class="strong">{b.title}</span></span><span class="strong">{Math.round(bossHP(b) * 100)} %</span></div>
                <Bar value={bossHP(b)} size="lg" color="var(--vit)" label={`Vida del jefe ${Math.round(bossHP(b) * 100)} %`} />
                <span class="small muted">{b.money ? `Faltan ${money(b.target - b.progress)} (${usd(toUSD(b.target - b.progress, rate))}). ${b.source === 'saving' ? 'Registra el ahorro con la categoría «Ahorro e inversión».' : 'Cada pago a tus tarjetas o con «Pago de deuda» es un golpe.'}` : `${b.progress} de ${b.target} ${b.unit}.`}</span>
              </a>
            ))}
            <AreaTodos area="finanzas" />
            <section class="card flush" aria-label="Tasa del dólar">
              <button type="button" class="lrow" style={{ minHeight: 56 }} onClick={() => setSheet({ kind: 'fx' })} aria-label={`Tasa del dólar: US$1 = ${rateText(rate)}. Convertir`}>
                <span class="tile sm" style={{ background: 'var(--soft)' }}><Icon name="swap" size={18} /></span>
                <span class="stack-xs grow"><span class="semi">US$1 = {rateText(rate)}</span><span class="tiny muted semi">{fxWhen(s, today)}{s.money.fx.auto && !fxIsManual(s) ? ' · se actualiza sola' : ''}</span></span>
                <span class="small strong">Convertir</span><Icon name="right" size={16} />
              </button>
            </section>
          </>
        )}
        {tab === 'cuentas' && <AccountsTab s={s} today={today} setSheet={setSheet} />}
        {tab === 'plan' && <PlanTab s={s} today={today} setSheet={setSheet} />}
        {tab === 'movimientos' && <Movements s={s} today={today} mk={mk} setMk={setMk} filter={filter} setFilter={setFilter} setSheet={setSheet} />}
      </main>
      <Nav active="areas" fab={{ onClick: () => setSheet({ kind: 'tx' }), label: 'Nuevo movimiento' }} />
      {sheet && sheet.kind === 'tx' && <TxSheet key={sheet.tx ? sheet.tx.id : `nuevo-${sheet.link ? sheet.link.plan + sheet.link.date : sheet.to || ''}`} s={s} initial={sheet} tx={sheet.tx} onClose={() => setSheet(null)} />}
      {sheet && sheet.kind === 'alert' && <AlertSheet onClose={() => setSheet(null)} />}
      {sheet && sheet.kind === 'budgets' && <BudgetSheet s={s} rate={rate} onClose={() => setSheet(null)} />}
      {sheet && sheet.kind === 'budgetcat' && <BudgetCatSheet s={s} id={sheet.id} onClose={() => setSheet(null)} onMovements={showMovements} />}
      {sheet && sheet.kind === 'fx' && <FxSheet s={s} onClose={() => setSheet(null)} />}
      {sheet && sheet.kind === 'more' && <MoreSheet s={s} mk={mk} onPick={(k) => (k === 'accounts' ? (setSheet(null), setTab('cuentas')) : setSheet({ kind: k }))} onClose={() => setSheet(null)} />}
      {sheet && sheet.kind === 'cats' && <CatsSheet s={s} onClose={() => setSheet(null)} />}
      {sheet && sheet.kind === 'card' && <CardSheet s={s} id={sheet.id} onClose={() => setSheet(null)} onPay={pay} onMovements={showMovements} />}
      {sheet && sheet.kind === 'account' && <AccountSheet s={s} id={sheet.id} onClose={() => setSheet(null)} onMovements={showMovements} />}
      {sheet && sheet.kind === 'plan' && <PlanSheet key={sheet.id || (sheet.tpl ? sheet.tpl.name : sheet.planKind || 'nuevo')} s={s} id={sheet.id} tpl={sheet.tpl} planKind={sheet.planKind} future={sheet.future} onClose={() => setSheet(null)} />}
      {sheet && sheet.kind === 'due' && <DueSheet s={s} item={sheet.item} onClose={() => setSheet(null)} onPay={pay} onEdit={() => setSheet({ kind: 'plan', id: sheet.item.plan })} />}
      {sheet && sheet.kind === 'fund' && <FundSheet s={s} id={sheet.id} onClose={() => setSheet(null)} />}
    </>
  );
}

// ---------- Movimientos del mes ----------

function Movements({ s, today, mk, setMk, filter, setFilter, setSheet }) {
  const [q, setQ] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [limit, setLimit] = useState(40);
  const listRef = useRef(null);
  const sum = monthSummary(s, mk);
  const rate = fxRate(s, today);
  const isNow = mk === monthKey(today);

  // Dónde se fue el dinero: las categorías con más gasto (las demás juntas en «Otras»).
  const ranked = Object.entries(sum.byCat).map(([id, dop]) => ({ c: catOf(s, id), dop, usdv: sum.byCatUSD[id] || 0 })).sort((a, b) => b.dop - a.dop);
  // Con 7 categorías se ven todas; desde 8, las menores van juntas.
  const top = ranked.slice(0, ranked.length > 7 ? 6 : 7);
  const rest = ranked.slice(top.length);
  if (rest.length) top.push({ c: { id: '__otras', name: `Otras ${rest.length} categorías`, icon: 'dots' }, dop: rest.reduce((a, x) => a + x.dop, 0), usdv: rest.reduce((a, x) => a + x.usdv, 0), group: rest.map((x) => x.c.id) });
  const maxCat = top.length ? Math.max(...top.map((x) => x.dop)) : 0;

  const qn = q.trim().toLowerCase();
  const visible = sum.txs.filter((t) => (filter.kind === 'all' || txKind(t) === filter.kind)
    && (!filter.cat || (Array.isArray(filter.cat) ? filter.cat.includes(t.cat) : t.cat === filter.cat))
    && (!filter.account || t.account === filter.account || t.to === filter.account || (accountOf(s, t.account) || {}).of === filter.account)
    && (!filter.tag || t.tag === filter.tag)
    && (!qn || `${t.merchant} ${t.note} ${catName(s, t.cat)} ${t.tag}`.toLowerCase().includes(qn)));
  const shown = visible.slice(0, limit);
  const days = [];
  for (const t of shown) {
    const last = days[days.length - 1];
    if (last && last.day === t.day) last.list.push(t); else days.push({ day: t.day, list: [t] });
  }
  const monthAccounts = [...new Set(sum.txs.flatMap((t) => [t.account, t.to]).filter(Boolean))].map((id) => accountOf(s, id)).filter(Boolean);
  if (filter.account && !monthAccounts.some((a) => a.id === filter.account) && accountOf(s, filter.account)) monthAccounts.unshift(accountOf(s, filter.account));
  const monthTags = [...new Set(sum.txs.map((t) => t.tag).filter(Boolean))];
  const hasTransfers = sum.txs.some((t) => txKind(t) === 'transfer');
  const filtered = filter.kind !== 'all' || filter.cat || filter.account || filter.tag || qn;
  const toList = () => setTimeout(() => listRef.current && listRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  const setF = (patch) => { setFilter({ ...filter, ...patch }); setLimit(40); };
  const balance = sum.income - sum.spent;
  const balanceUSD = sum.incomeUSD - sum.spentUSD;

  return (
    <>
      <div class="between-c">
        <button type="button" class="icon-btn plain" aria-label="Mes anterior" onClick={() => { setMk(shiftMonth(mk, -1)); setLimit(40); }}><Icon name="left" /></button>
        <span class="strong" style={{ textTransform: 'capitalize' }}>{monthName(mk)}</span>
        <button type="button" class="icon-btn plain" aria-label="Mes siguiente" disabled={isNow} style={isNow ? { opacity: 0.3 } : null} onClick={() => { setMk(shiftMonth(mk, 1)); setLimit(40); }}><Icon name="right" /></button>
      </div>

      {/* Cada total en pesos y en dólares. En filas: los montos largos caben sin cortarse. */}
      <section class="card flush" aria-label="Resumen del mes">
        {[['Ingresos', sum.income, sum.incomeUSD, null], ['Gastos', sum.spent, sum.spentUSD, null], ['Balance', balance, balanceUSD, balance < 0 ? 'var(--vit-ink)' : balance > 0 ? 'var(--good-ink)' : null]].map(([l, dop, u, c]) => (
          <div key={l} class="lrow" style={{ minHeight: 58 }}>
            <span class="grow semi muted">{l}</span>
            <span class="stack-xs" style={{ alignItems: 'flex-end', gap: 2 }}>
              <span class="display-num tab-num" style={{ fontSize: l === 'Balance' ? 22 : 19, color: c || undefined }}>{money(dop)}</span>
              <span class="tiny semi muted tab-num">{usd(u)}</span>
            </span>
          </div>
        ))}
        <button type="button" class="lrow" style={{ minHeight: 52 }} onClick={() => setSheet({ kind: 'fx' })} aria-label={`Tasa del dólar: US$1 = ${rateText(rate)}. Cambiar`}>
          <span class="tile sm" style={{ background: 'var(--soft)' }}><Icon name="swap" size={18} /></span>
          <span class="stack-xs grow"><span class="semi">US$1 = {rateText(rate)}</span><span class="tiny muted semi">{fxWhen(s, today)}{s.money.fx.auto && !fxIsManual(s) ? ' · se actualiza sola' : ''}</span></span>
          <span class="small strong">Convertir</span><Icon name="right" size={16} />
        </button>
      </section>

      {ranked.length > 0 && (
        <section class="card" aria-label="Gastos por categoría">
          <div class="between-c"><h2 class="h2">Dónde se fue tu dinero</h2><span class="tiny muted semi">toca para ver</span></div>
          <div class="stack-sm">
            {top.map((x) => {
              const pct = sum.spent ? Math.round((x.dop / sum.spent) * 100) : 0;
              return (
                <button type="button" key={x.c.id} class="catbar" title={`${x.c.name}: ${money(x.dop)} · ${usd(x.usdv)} · ${pct} % del gasto`} aria-label={`${x.c.name}: ${money(x.dop)}, ${pct} por ciento. Ver movimientos`}
                  onClick={() => { setF({ cat: x.group || x.c.id, kind: 'all' }); toList(); }}>
                  <span class="row" style={{ gap: 10 }}>
                    <span class="tile xs" style={{ background: 'var(--finanzas-soft)', color: 'var(--finanzas-ink)' }}><Icon name={x.c.icon || 'tag'} size={15} /></span>
                    <span class="grow semi" style={{ minWidth: 0, lineHeight: 1.25 }}>{x.c.name}</span>
                    <span class="stack-xs" style={{ alignItems: 'flex-end', gap: 0 }}><span class="strong tab-num">{money(x.dop)}</span><span class="tiny muted semi tab-num">{pct} % · {usd(x.usdv, { decimals: 0 })}</span></span>
                  </span>
                  <span class="catbar-track" aria-hidden="true"><i style={{ width: `${maxCat ? Math.max(2, (x.dop / maxCat) * 100) : 0}%` }} /></span>
                </button>
              );
            })}
          </div>
          {sum.paidIn.USD > 0 && <span class="small muted">Pagaste {usd(sum.paidIn.USD)} en dólares{sum.paidIn.DOP > 0 ? ` y ${money(sum.paidIn.DOP)} en pesos` : ''}.</span>}
        </section>
      )}

      {monthTags.length > 0 && (
        <section class="card flush" aria-label="Etiquetas del mes">
          <div style={{ padding: '14px 0 4px' }}><h2 class="h2">Etiquetas</h2></div>
          {monthTags.map((tg) => (
            <button type="button" key={tg} class="lrow" onClick={() => { setF({ tag: filter.tag === tg ? null : tg }); toList(); }}>
              <span class="tile sm" style={{ background: 'var(--soft)' }}><Icon name="tag" size={17} /></span>
              <span class="grow semi">{tg}</span>
              <span class="stack-xs" style={{ alignItems: 'flex-end', gap: 0 }}><span class="strong tab-num">{money(sum.byTag[tg] || 0)}</span><span class="tiny muted semi tab-num">{usd(sum.byTagUSD[tg] || 0)}</span></span>
            </button>
          ))}
        </section>
      )}

      <section class="card flush" aria-label="Movimientos" ref={listRef} style={{ scrollMarginTop: 12 }}>
        <div class="between-c" style={{ padding: '14px 0 6px' }}>
          <h2 class="h2">Movimientos</h2>
          <span class="row" style={{ gap: 4 }}>
            <span class="small muted tab-num">{visible.length}{filtered ? ` de ${sum.count}` : ''}</span>
            <button type="button" class="icon-btn plain" aria-label="Buscar movimientos" aria-pressed={showSearch ? 'true' : 'false'} onClick={() => { setShowSearch(!showSearch); setQ(''); }}><Icon name="search" size={19} /></button>
          </span>
        </div>
        {showSearch && <input class="input" type="search" value={q} placeholder="Comercio, nota o categoría" aria-label="Buscar movimientos" onInput={(e) => setQ(e.currentTarget.value)} ref={focusOnMount} style={{ marginBottom: 8 }} />}
        {(sum.count > 0 || filtered) && (
          <div class="chips scroll" role="group" aria-label="Filtrar movimientos" style={{ margin: '0 -18px', padding: '2px 18px 8px' }}>
            <TChip sm on={!filtered} onClick={() => { setF({ kind: 'all', cat: null, account: null, tag: null }); setQ(''); }}>Todos</TChip>
            <TChip sm on={filter.kind === 'gasto'} onClick={() => setF({ kind: filter.kind === 'gasto' ? 'all' : 'gasto' })}>Gastos</TChip>
            <TChip sm on={filter.kind === 'ingreso'} onClick={() => setF({ kind: filter.kind === 'ingreso' ? 'all' : 'ingreso' })}>Ingresos</TChip>
            {hasTransfers && <TChip sm on={filter.kind === 'transfer'} onClick={() => setF({ kind: filter.kind === 'transfer' ? 'all' : 'transfer' })}>Entre cuentas</TChip>}
            {monthAccounts.map((a) => <TChip key={a.id} sm icon={ACC_ICON[a.kind] || 'card'} on={filter.account === a.id} onClick={() => setF({ account: filter.account === a.id ? null : a.id })}>{accountLabel(a)}</TChip>)}
            {monthTags.map((tg) => <TChip key={tg} sm icon="tag" on={filter.tag === tg} onClick={() => setF({ tag: filter.tag === tg ? null : tg })}>{tg}</TChip>)}
          </div>
        )}
        {filter.cat && (
          <div class="row" style={{ padding: '0 0 8px', gap: 8 }}>
            <span class="chip" style={{ background: 'var(--finanzas-soft)', color: 'var(--finanzas-ink)' }}><Icon name="filter" size={13} />{Array.isArray(filter.cat) ? 'Otras categorías' : catName(s, filter.cat)}</span>
            <button type="button" class="link-btn muted" style={{ minHeight: 30, fontSize: 13 }} onClick={() => setF({ cat: null })}>Quitar filtro</button>
          </div>
        )}
        {!sum.txs.length && <p class="small muted" style={{ padding: '4px 0 16px' }}>Sin movimientos este mes. Toca + para agregar uno, o pega los avisos de tu banco.</p>}
        {sum.txs.length > 0 && !visible.length && <p class="small muted" style={{ padding: '4px 0 16px' }}>Nada coincide con el filtro.</p>}
        {days.map((d) => {
          const net = d.list.reduce((a, t) => a + (txKind(t) === 'gasto' ? -txDOP(t) : txKind(t) === 'ingreso' ? txDOP(t) : 0), 0);
          return (
            <div key={d.day} class="txday">
              <div class="between-c dayhead"><span class="eyebrow" style={{ fontSize: 11.5 }}>{d.day === today ? 'Hoy' : fmtDay(d.day)}</span>{net !== 0 && <span class="tiny strong muted tab-num">{money(net, { sign: net > 0 })}</span>}</div>
              {d.list.map((t) => <TxRow key={t.id} s={s} t={t} onOpen={() => setSheet({ kind: 'tx', tx: t })} />)}
            </div>
          );
        })}
        {visible.length > shown.length && <button type="button" class="lrow" style={{ justifyContent: 'center', fontWeight: 700, minHeight: 52 }} onClick={() => setLimit(limit + 60)}>Ver {Math.min(60, visible.length - shown.length)} más</button>}
      </section>
    </>
  );
}

// ---------- Últimos movimientos (en el resumen) ----------

function RecentTx({ s, today, onOpen, onAll }) {
  const list = s.money.tx.filter((t) => t.day <= today).slice(0, 4);
  if (!list.length) return null;
  return (
    <section class="card flush" aria-label="Últimos movimientos">
      <div class="between-c" style={{ padding: '14px 0 4px' }}>
        <h2 class="h2">Últimos movimientos</h2>
        <button type="button" class="link-btn" onClick={onAll}>Ver todos<Icon name="right" size={16} /></button>
      </div>
      {list.map((t) => <TxRow key={t.id} s={s} t={t} day={relDay(t.day, today)} onOpen={() => onOpen(t)} />)}
    </section>
  );
}

// ---------- Fila de un movimiento ----------

function TxRow({ s, t, onOpen, day = null }) {
  const c = catOf(s, t.cat);
  const k = txKind(t);
  const a = accountOf(s, t.account);
  const to = k === 'transfer' ? accountOf(s, t.to) : null;
  const where = to ? `${a ? `${accountLabel(a)} → ` : '→ '}${accountLabel(to)}` : a && accountLabel(a);
  const tone = k === 'ingreso' ? ['var(--good-soft)', 'var(--good-ink)'] : k === 'transfer' ? ['var(--soft)', 'var(--muted)'] : ['var(--finanzas-soft)', 'var(--finanzas-ink)'];
  return (
    <button type="button" class="lrow txrow" onClick={onOpen} aria-label={`${t.merchant || c.name}, ${signed(t)}, ${c.name}`}>
      <span class="tile sm" style={{ background: tone[0], color: tone[1] }}><Icon name={c.icon || 'tag'} size={18} /></span>
      <span class="stack-xs grow" style={{ minWidth: 0 }}>
        <span class="strong clip">{t.merchant || c.name}</span>
        <span class="tiny muted semi clamp2">{[day, t.time, to ? null : c.name, where, t.tag].filter(Boolean).join(' · ')}</span>
      </span>
      <span class="stack-xs" style={{ alignItems: 'flex-end', flexShrink: 0, gap: 2 }}>
        <span class="strong tab-num" style={{ color: k === 'ingreso' ? 'var(--good-ink)' : k === 'transfer' ? 'var(--muted)' : 'var(--ink)' }}>{signed(t)}</span>
        <span class="tiny muted semi tab-num">{otherSide(s, t)}</span>
      </span>
    </button>
  );
}

// ---------- Hoja: nuevo o editar movimiento ----------

export function TxSheet({ s, initial, tx, onClose }) {
  const today = s.energy.day;
  const editing = !!tx;
  const lastAcc = (s.money.tx.find((t) => t.account && accountOf(s, t.account)) || {}).account || '';
  const [type, setType] = useState(tx ? txKind(tx) : initial.type || 'gasto');
  const [currency, setCurrency] = useState(tx ? txCur(tx) : initial.currency || 'DOP');
  const [amount, setAmount] = useState(tx ? String(txOrig(tx)) : initial.amount ? String(initial.amount) : '');
  const [day, setDay] = useState(tx ? tx.day : initial.day || today);
  const [rate, setRate] = useState(tx ? txRate(s, tx) : fxRate(s, initial.day || today));
  const [rateTxt, setRateTxt] = useState('');
  const [editRate, setEditRate] = useState(false);
  const touched = useRef(!!tx);
  const [cat, setCat] = useState(tx ? tx.cat : initial.cat || null);
  const [pickCat, setPickCat] = useState(false);
  const [merchant, setMerchant] = useState(tx ? tx.merchant : initial.merchant || '');
  const [account, setAccount] = useState(tx ? tx.account : initial.account && accountOf(s, initial.account) ? initial.account : lastAcc);
  const [to, setTo] = useState(tx ? tx.to || '' : initial.to || '');
  const link = !tx && initial.link ? initial.link : null;
  const [tag, setTag] = useState(tx ? tx.tag || '' : initial.tag || '');
  const [note, setNote] = useState(tx ? tx.note || '' : initial.note || '');
  const [photos, setPhotos] = useState(tx ? tx.photos || [] : initial.photos || []);
  const [newCat, setNewCat] = useState(false);
  const [newAcc, setNewAcc] = useState(false);
  const n = toNumber(String(amount).replace(/[^\d.,]/g, '')) || 0;
  const guess = guessTxCat(s, { merchant, text: note, type });
  const effCat = cat && catOf(s, cat).type === type ? cat : guess;
  const c = catOf(s, effCat);
  const tags = txTags(s);

  // La tasa sigue la fecha (si no la cambiaste tú). Para días pasados se busca la de ese día.
  useEffect(() => {
    if (touched.current) return;
    setRate(fxRate(s, day));
    if (currency === 'USD' && day !== today) rateForDay(day).then((r) => { if (r && !touched.current) setRate(r); });
  }, [day, currency]);

  const converted = currency === 'USD' ? money(toDOP(n, 'USD', rate)) : usd(toUSD(n, rate));
  const save = () => {
    if (!n) return;
    const p = { type, amount: n, currency, rate, cat: effCat, merchant, day, account, to: type === 'transfer' ? to : '', tag, note, photos };
    act((st, t, ev) => {
      if (editing) updateTx(st, tx.id, p);
      else {
        addTx(st, { ...p, source: initial.source || 'manual', link: link && type !== 'transfer' ? link : null }, t, ev);
        if (cat && merchant && type === 'gasto') learnRule(st, merchant, effCat);
      }
    });
    toast(editing ? 'Movimiento actualizado' : link ? `«${link.name}»: ${type === 'ingreso' ? 'recibido' : 'pagado'}` : type === 'ingreso' ? 'Ingreso guardado' : type === 'transfer' ? (effCat === 'pago_tarjeta' ? 'Pago de tarjeta guardado' : 'Movimiento entre cuentas guardado') : 'Gasto guardado', 'check');
    onClose();
  };
  const del = async () => {
    if (!(await ask('¿Borrar este movimiento?', { ok: 'Borrar', danger: true }))) return;
    act((st) => removeTx(st, tx.id));
    toast('Movimiento borrado', 'trash');
    onClose();
  };
  const setRateFrom = (raw) => {
    setRateTxt(raw);
    const r = toNumber(String(raw).replace(/[^\d.,]/g, ''));
    if (r && r > 20 && r < 250) { touched.current = true; setRate(r); }
  };

  return (
    <Sheet onClose={onClose} label={editing ? 'Editar movimiento' : 'Nuevo movimiento'}>
      <SheetHead title={editing ? 'Movimiento' : link ? `${initial.type === 'ingreso' ? 'Cobro' : 'Pago'}: ${link.name}` : initial.cat === 'pago_tarjeta' ? 'Pago de tarjeta' : 'Nuevo movimiento'} onClose={onClose} />
      <div class="seg" role="tablist" aria-label="Tipo de movimiento">
        {['gasto', 'ingreso', 'transfer'].map((k) => <button key={k} type="button" role="tab" aria-selected={type === k ? 'true' : 'false'} onClick={() => setType(k)}>{KIND_LABEL[k]}</button>)}
      </div>
      <div class="field">
        <label for="amt">Monto</label>
        <div class="amount-in">
          <div class="cur-toggle" role="group" aria-label="Moneda">
            <button type="button" aria-pressed={currency === 'DOP' ? 'true' : 'false'} onClick={() => setCurrency('DOP')}>RD$</button>
            <button type="button" aria-pressed={currency === 'USD' ? 'true' : 'false'} onClick={() => setCurrency('USD')}>US$</button>
          </div>
          <input id="amt" inputMode="decimal" value={amount} onInput={(e) => setAmount(e.currentTarget.value)} placeholder="0.00" autoFocus={!editing} aria-label={`Monto en ${currency === 'USD' ? 'dólares' : 'pesos'}`} />
        </div>
        <div class="conv" aria-live="polite">
          <span class="semi tab-num">= {converted}</span>
          <button type="button" class="link-btn muted" style={{ minHeight: 30, fontSize: 13 }} onClick={() => { setEditRate(!editRate); setRateTxt(String(rate)); }}>a {rateText(rate)} por US$1<Icon name={editRate ? 'down' : 'edit'} size={13} /></button>
        </div>
        {editRate && (
          <div class="numrow">
            <span class="unit">US$1 =</span>
            <input class="input" inputMode="decimal" value={rateTxt} onInput={(e) => setRateFrom(e.currentTarget.value)} aria-label="Tasa de este movimiento en pesos por dólar" ref={focusOnMount} />
            <button type="button" class="btn xs soft" onClick={() => { touched.current = false; setRate(fxRate(s, day)); setRateTxt(String(fxRate(s, day))); }}>Del día</button>
          </div>
        )}
      </div>
      <div class="field"><label for="mer">{type === 'gasto' ? 'Comercio o descripción' : type === 'ingreso' ? 'De dónde viene' : 'Descripción'}</label><input id="mer" class="input" value={merchant} maxLength={60} onInput={(e) => setMerchant(e.currentTarget.value)} placeholder={type === 'gasto' ? 'Ej. Farmacia Los Hidalgos' : type === 'ingreso' ? 'Ej. Quincena' : 'Ej. Pago de la tarjeta'} /></div>
      <div class="stack-sm">
        <span class="label">Categoría</span>
        {!pickCat ? (
          <>
            {editing ? (
              <button type="button" class="goalnum" onClick={() => setPickCat(true)}>
                <span class="tile sm" style={{ background: 'var(--finanzas-soft)', color: 'var(--finanzas-ink)' }}><Icon name={c.icon || 'tag'} size={18} /></span>
                <span class="grow strong">{c.name}</span><span class="small strong">Cambiar</span>
              </button>
            ) : (
              <div class="chips" role="group" aria-label="Categorías más usadas">
                {[c, ...frequentCats(s, type, 6).filter((x) => x.id !== c.id)].slice(0, 6).map((x) => <TChip key={x.id} sm icon={x.icon || 'tag'} on={effCat === x.id} onClick={() => setCat(x.id)}>{x.name}</TChip>)}
                <TChip sm icon="grid" onClick={() => setPickCat(true)}>Todas</TChip>
              </div>
            )}
            {!editing && !cat && merchant.trim().length > 2 && effCat !== 'otros' && <span class="small muted row" style={{ gap: 6 }}><Icon name="sparkle" size={14} />Sugerida por «{merchant.trim()}»</span>}
          </>
        ) : (
          <>
            <CatPicker s={s} type={type} value={effCat} onChange={(v) => { setCat(v); setPickCat(false); }} onNew={() => setNewCat(true)} />
            {newCat && <CatForm type={type} onDone={(id) => { setNewCat(false); if (id) { setCat(id); setPickCat(false); } }} />}
          </>
        )}
      </div>
      <div class="grid2">
        <div class="field"><label for="tday">Fecha</label><input id="tday" type="date" class="input" value={day} max={today} onInput={(e) => { setDay(e.currentTarget.value || today); }} /></div>
        <div class="field"><label for="ttag">Etiqueta (opcional)</label><input id="ttag" class="input" value={tag} maxLength={30} list="tags-list" placeholder="Ej. Viaje" onInput={(e) => setTag(e.currentTarget.value)} /></div>
      </div>
      {tags.length > 0 && !tag && <div class="chips" role="group" aria-label="Etiquetas usadas">{tags.slice(0, 5).map((tg) => <TChip key={tg} sm icon="tag" onClick={() => setTag(tg)}>{tg}</TChip>)}</div>}
      <datalist id="tags-list">{tags.map((tg) => <option key={tg} value={tg} />)}</datalist>
      <div class="stack-sm">
        <span class="label">{type === 'ingreso' ? 'Entró a' : type === 'transfer' ? 'Sale de' : 'Pagado con'}</span>
        <div class="chips" role="group" aria-label={type === 'transfer' ? 'Cuenta de donde sale' : 'Cuenta o tarjeta'}>
          <TChip sm on={!account} onClick={() => setAccount('')}>Sin indicar</TChip>
          {s.money.accounts.map((a) => <TChip key={a.id} sm icon={ACC_ICON[a.kind] || 'card'} on={account === a.id} onClick={() => setAccount(a.id)}>{accountLabel(a)}</TChip>)}
          <TChip sm icon="plus" on={newAcc} onClick={() => setNewAcc(!newAcc)}>Cuenta o tarjeta</TChip>
        </div>
        {newAcc && <AccountForm s={s} acc={null} kind0="cuenta" onDone={(id) => { setNewAcc(false); if (id) setAccount(id); }} />}
      </div>
      {type === 'transfer' && (
        <div class="stack-sm">
          <span class="label">{effCat === 'pago_tarjeta' ? 'A qué tarjeta' : 'Hacia'}</span>
          <div class="chips" role="group" aria-label="Cuenta a donde va">
            <TChip sm on={!to} onClick={() => setTo('')}>Sin indicar</TChip>
            {s.money.accounts.filter((a) => a.id !== account && (effCat !== 'pago_tarjeta' || isCard(a))).map((a) => <TChip key={a.id} sm icon={ACC_ICON[a.kind] || 'card'} on={to === a.id} onClick={() => setTo(a.id)}>{accountLabel(a)}</TChip>)}
          </div>
        </div>
      )}
      {link && type !== 'transfer' && <div class="note tone-good"><Icon name="calendar" size={18} /><span>Se marca «{link.name}» del {fmtDay(link.date, { weekdayName: false })} como {type === 'ingreso' ? 'recibido' : 'pagado'}.</span></div>}
      <div class="field"><label for="tnote">Nota (opcional)</label><input id="tnote" class="input" value={note} maxLength={200} onInput={(e) => setNote(e.currentTarget.value)} placeholder="Detalle, para quién, número de referencia…" /></div>
      <PhotoStrip ids={photos} onChange={setPhotos} kind="recibo" label="Foto del recibo o factura (opcional)" max={4} />
      {type === 'transfer' && <div class="note"><Icon name="info" size={18} /><span>Los pagos de tarjeta y lo que mueves entre tus cuentas no cuentan como gasto (las compras ya se cuentan una por una), pero sí mueven tus saldos.</span></div>}
      <button type="button" class="btn block" disabled={!n} onClick={save}><Icon name="check" size={20} />{editing ? 'Guardar cambios' : 'Guardar'}</button>
      {editing && (
        <>
          {(tx.rnc || tx.ncf || tx.itbis > 0 || tx.source) && (
            <div class="card flush" aria-label="Detalles">
              <div class="lrow"><span class="grow muted semi">Registrado</span><span class="strong">{SRC_LABEL[tx.source] || tx.source}</span></div>
              {tx.rnc && <div class="lrow"><span class="grow muted semi">RNC</span><span class="strong">{tx.rnc}</span></div>}
              {tx.ncf && <div class="lrow"><span class="grow muted semi">NCF / e-NCF</span><span class="strong">{tx.ncf}</span></div>}
              {tx.itbis > 0 && <div class="lrow"><span class="grow muted semi">ITBIS</span><span class="strong">{money(tx.itbis)}</span></div>}
            </div>
          )}
          <button type="button" class="link-btn" style={{ color: 'var(--vit-ink)', alignSelf: 'center' }} onClick={del}><Icon name="trash" size={16} />Borrar movimiento</button>
        </>
      )}
    </Sheet>
  );
}

// ---------- Hoja: pegar avisos del banco ----------

function AlertSheet({ onClose }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const paste = async () => {
    try { setText(await navigator.clipboard.readText()); setErr(''); } catch { setErr('No pude leer el portapapeles. Mantén presionado el campo y elige «Pegar».'); }
  };
  const read = () => {
    const items = parseBankAlerts(text);
    if (!items.length) { setErr('No encontré un monto en ese texto. Copia el aviso completo del banco.'); return; }
    setPending({ label: items.length === 1 ? 'Aviso del banco' : 'Avisos del banco', source: 'alerta', items });
    onClose();
    go('/importar');
  };
  return (
    <Sheet onClose={onClose} label="Pegar avisos del banco">
      <SheetHead title="Avisos del banco" onClose={onClose} />
      <p class="lead">Copia uno o varios avisos de consumo, pago o transferencia (correo o SMS) y pégalos aquí. Saco el monto, la moneda, el comercio, la fecha y la tarjeta o cuenta.</p>
      <div class="field">
        <label for="al">Texto de los avisos</label>
        <textarea id="al" class="input" rows={6} value={text} onInput={(e) => { setText(e.currentTarget.value); setErr(''); }} placeholder="Tu tarjeta terminada en 1234 presenta una transacción… Monto: 23.50 · Comercio: …" />
      </div>
      {navigator.clipboard && navigator.clipboard.readText && <button type="button" class="btn sm soft" onClick={paste} style={{ alignSelf: 'flex-start' }}><Icon name="paste" size={18} />Pegar del portapapeles</button>}
      {err && <span class="small" style={{ color: 'var(--vit-ink)' }}>{err}</span>}
      <button type="button" class="btn block" disabled={text.trim().length < 6} onClick={read}>Leer avisos<Icon name="right" size={20} /></button>
      <span class="small muted">Funciona con APAP, Banreservas y la mayoría de los bancos. Antes de guardar revisas cada movimiento. El texto se procesa en tu teléfono.</span>
    </Sheet>
  );
}

// ---------- Hoja: presupuestos ----------

function BudgetSheet({ s, rate, onClose }) {
  const today = s.energy.day;
  const mp = monthPlan(s, monthKey(today), today);
  const income = mp.income;
  const cats = catsOfType(s, 'gasto');
  const [vals, setVals] = useState(Object.fromEntries(cats.map((c) => [c.id, c.budget ? String(c.budget) : ''])));
  const [open, setOpen] = useState(() => Object.fromEntries(CATEGORY_GROUPS.map((g) => [g.id, cats.some((c) => c.group === g.id && c.budget > 0)])));
  const total = Object.values(vals).reduce((a, v) => a + (toNumber(v) || 0), 0);
  const save = () => {
    act((st, t) => { for (const [k, v] of Object.entries(vals)) setBudget(st, k, toNumber(v) || 0, t); });
    toast('Presupuestos guardados', 'check');
    onClose();
  };
  return (
    <Sheet onClose={onClose} label="Presupuestos del mes">
      <SheetHead title="Presupuestos" onClose={onClose} />
      <div class="panel stack-xs">
        <div class="between"><span class="small semi">Asignado a presupuestos</span><span class="stack-xs" style={{ alignItems: 'flex-end', gap: 0 }}><span class="strong tab-num">{money(total)}</span><span class="tiny muted semi tab-num">{usd(toUSD(total, rate))}</span></span></div>
        {income > 0 && <div class="between"><span class="small semi muted">Ingresos del mes</span><span class="small strong tab-num">{money(income)}</span></div>}
        {mp.fixed > 0 && <div class="between"><span class="small semi muted">Pagos fijos</span><span class="small strong tab-num">−{money(mp.fixed)}</span></div>}
        {mp.funds > 0 && <div class="between"><span class="small semi muted">Apartados</span><span class="small strong tab-num">−{money(mp.funds)}</span></div>}
        {income > 0 && (() => { const free = income - mp.fixed - mp.funds - total; return <div class="between"><span class="small strong">{free >= 0 ? 'Sin asignar' : 'Te pasaste'}</span><span class="small strong tab-num" style={{ color: free < 0 ? 'var(--vit-ink)' : 'var(--good-ink)' }}>{money(Math.abs(free))}</span></div>; })()}
      </div>
      <span class="small muted">En pesos. Los gastos en dólares cuentan convertidos con la tasa de su día. Toca un presupuesto en «Plan» para que lo que sobre pase al mes siguiente.</span>
      {catGroups(s, 'gasto').map((g) => {
        const sub = g.cats.reduce((a, c) => a + (toNumber(vals[c.id]) || 0), 0);
        return (
          <div key={g.id} class="card flush">
            <button type="button" class="lrow" style={{ minHeight: 52 }} aria-expanded={open[g.id] ? 'true' : 'false'} onClick={() => setOpen({ ...open, [g.id]: !open[g.id] })}>
              <span class="grow strong">{g.name}</span><span class="small muted tab-num">{sub ? money(sub) : ''}</span><Icon name={open[g.id] ? 'down' : 'right'} size={16} />
            </button>
            {open[g.id] && g.cats.map((c) => (
              <label key={c.id} class="lrow" style={{ minHeight: 56 }}>
                <span class="tile xs" style={{ background: 'var(--soft)' }}><Icon name={c.icon || 'tag'} size={15} /></span>
                <span class="semi grow">{c.name}</span>
                <input class="input" inputMode="decimal" value={vals[c.id]} placeholder="0" onInput={(e) => setVals({ ...vals, [c.id]: e.currentTarget.value })} style={{ width: 120, minHeight: 44, textAlign: 'right' }} aria-label={`Presupuesto de ${c.name} en pesos`} />
              </label>
            ))}
          </div>
        );
      })}
      <button type="button" class="btn block" onClick={save}><Icon name="check" size={20} />Guardar</button>
    </Sheet>
  );
}

// ---------- Hoja: tasa del dólar y convertidor ----------

function FxSheet({ s, onClose }) {
  const today = s.energy.day;
  const fx = s.money.fx;
  const manual = fxIsManual(s);
  const rate = fxRate(s, today);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState(manual ? String(fx.manual) : '');
  const [amt, setAmt] = useState('100');
  const [from, setFrom] = useState('USD');
  const a = toNumber(String(amt).replace(/[^\d.,]/g, '')) || 0;
  const res = from === 'USD' ? money(toDOP(a, 'USD', rate)) : usd(toUSD(a, rate));
  const mineN = toNumber(String(mine).replace(/[^\d.,]/g, ''));
  const mineOk = mineN && mineN > 20 && mineN < 250;
  const update = async () => {
    setBusy(true);
    const r = await refreshRate({ force: true });
    setBusy(false);
    toast(r ? `Tasa de hoy: ${rateText(r.rate)}` : 'Sin conexión con la fuente: se queda la última tasa', r ? 'check' : 'info');
  };
  return (
    <Sheet onClose={onClose} label="Tasa del dólar">
      <SheetHead title="Dólares y pesos" onClose={onClose} />
      <section class="card" style={{ gap: 6 }}>
        <span class="small semi muted">US$1 =</span>
        <span class="display-num tab-num" style={{ fontSize: 40 }}>{rateText(rate)}</span>
        <span class="small muted">{manual ? 'Tu propia tasa' : `${fx.source || 'Tasa de referencia'} · ${fx.day ? fmtDay(fx.day) : ''}`}</span>
      </section>
      <section class="panel stack-sm" aria-label="Convertir">
        <span class="label">Convertir</span>
        <div class="amount-in" style={{ background: 'var(--surface)' }}>
          <div class="cur-toggle" role="group" aria-label="De qué moneda">
            <button type="button" aria-pressed={from === 'USD' ? 'true' : 'false'} onClick={() => setFrom('USD')}>US$</button>
            <button type="button" aria-pressed={from === 'DOP' ? 'true' : 'false'} onClick={() => setFrom('DOP')}>RD$</button>
          </div>
          <input inputMode="decimal" value={amt} onInput={(e) => setAmt(e.currentTarget.value)} aria-label="Monto a convertir" />
        </div>
        <span class="h2 tab-num" aria-live="polite">= {res}</span>
      </section>
      <label class="between-c panel" style={{ cursor: 'pointer' }}>
        <span class="stack-xs"><span class="semi">Actualizar sola con internet</span><span class="small muted">Una vez al día, desde una fuente pública de tasas. No se envía ningún dato tuyo.</span></span>
        <Switch checked={fx.auto !== false} onChange={(v) => act((st) => { st.money.fx.auto = v; })} label="Actualizar la tasa sola" />
      </label>
      <button type="button" class="btn sm soft" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={update}><Icon name="repeat" size={16} />{busy ? 'Buscando…' : 'Actualizar ahora'}</button>
      <div class="field">
        <label for="myrate">Tu propia tasa (opcional)</label>
        <div class="numrow"><span class="unit">US$1 = RD$</span><input id="myrate" class="input" inputMode="decimal" value={mine} placeholder={String(rate)} onInput={(e) => setMine(e.currentTarget.value)} /></div>
        <span class="small muted">Úsala si tu banco te cobra otra tasa. Se aplica a los movimientos nuevos.</span>
      </div>
      <div class="row wrap">
        <button type="button" class="btn sm" disabled={!mineOk} onClick={() => { act((st) => setManualRate(st, mineN)); toast(`Usando tu tasa: ${rateText(mineN)}`, 'check'); }}>Usar mi tasa</button>
        {manual && <button type="button" class="btn sm ghost" onClick={() => { act((st) => setManualRate(st, null)); setMine(''); toast('Volviste a la tasa automática', 'check'); }}>Volver a la automática</button>}
      </div>
      <p class="small muted">Cada movimiento guarda la tasa de su día. Cambiar la tasa no cambia lo que ya registraste; puedes corregir la de un movimiento al abrirlo.</p>
    </Sheet>
  );
}

// ---------- Hoja: más opciones ----------

function csvOf(s, mk) {
  const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const rows = [['Fecha', 'Hora', 'Tipo', 'Comercio o descripción', 'Categoría', 'Cuenta', 'Etiqueta', 'Moneda', 'Monto original', 'Tasa', 'Monto en RD$', 'Equivalente en US$', 'Nota']];
  for (const t of monthSummary(s, mk).txs) {
    const k = txKind(t);
    const sign = k === 'ingreso' ? 1 : -1;
    rows.push([t.day, t.time || '', KIND_LABEL[k], t.merchant, catName(s, t.cat), accountLabel(accountOf(s, t.account)), t.tag || '', txCur(t), (sign * txOrig(t)).toFixed(2), txRate(s, t).toFixed(4), (sign * txDOP(t)).toFixed(2), (sign * txUSD(s, t)).toFixed(2), t.note || '']);
  }
  return `﻿${rows.map((r) => r.map(q).join(',')).join('\r\n')}\r\n`;
}

function MoreSheet({ s, mk, onPick, onClose }) {
  const items = [
    ['download', 'Importar movimientos', 'De un archivo de Astra o de avisos del banco', () => { onClose(); go('/importar'); }],
    ['tag', 'Categorías', `${catsOfType(s, 'gasto').length} de gastos y ${catsOfType(s, 'ingreso').length} de ingresos`, () => onPick('cats')],
    ['card', 'Cuentas y tarjetas', plural(s.money.accounts.length, 'cuenta', 'cuentas'), () => onPick('accounts')],
    ['swap', 'Dólares y pesos', `US$1 = ${rateText(fxRate(s, s.energy.day))}`, () => onPick('fx')],
    ['upload', 'Exportar el mes (Excel)', 'Archivo CSV con pesos, dólares y tasa', async () => {
      const ok = await saveFile(`astra-movimientos-${mk}.csv`, csvOf(s, mk), 'text/csv');
      if (ok) toast('Archivo descargado', 'download');
      onClose();
    }],
  ];
  return (
    <Sheet onClose={onClose} label="Más opciones de finanzas">
      <SheetHead title="Finanzas" onClose={onClose} />
      <section class="card flush">
        {items.map(([ic, t, d, fn]) => (
          <button type="button" key={t} class="lrow" style={{ minHeight: 64 }} onClick={fn}>
            <span class="tile sm" style={{ background: 'var(--soft)' }}><Icon name={ic} size={18} /></span>
            <span class="stack-xs grow"><span class="strong">{t}</span><span class="tiny muted semi">{d}</span></span>
            <Icon name="right" size={16} />
          </button>
        ))}
      </section>
    </Sheet>
  );
}

// ---------- Categorías ----------

function CatForm({ type, cat, onDone }) {
  const [name, setName] = useState(cat ? cat.name : '');
  const [icon, setIcon] = useState(cat ? cat.icon || 'tag' : 'tag');
  const [group, setGroup] = useState(cat ? cat.group : type === 'ingreso' ? 'ingresos' : 'otros');
  const custom = !cat || cat.custom;
  const groups = CATEGORY_GROUPS.filter((g) => (type === 'ingreso' ? g.id === 'ingresos' : type === 'transfer' ? g.id === 'movimientos' : !['ingresos', 'movimientos'].includes(g.id)));
  const save = () => {
    const id = act((st) => (cat ? (updateCategory(st, cat.id, { name, icon, group }) || {}).id : (addCategory(st, { name, icon, group, type }) || {}).id));
    toast(cat ? 'Categoría actualizada' : 'Categoría creada', 'tag');
    onDone(id);
  };
  return (
    <section class="panel stack" aria-label={cat ? `Editar ${cat.name}` : 'Nueva categoría'}>
      <div class="field"><label for="cname">Nombre</label><input id="cname" class="input" value={name} maxLength={40} placeholder="Ej. Colegio de los niños" onInput={(e) => setName(e.currentTarget.value)} ref={focusOnMount} /></div>
      {custom && groups.length > 1 && <div class="stack-sm"><span class="label">Familia</span><div class="chips">{groups.map((g) => <TChip key={g.id} sm on={group === g.id} onClick={() => setGroup(g.id)}>{g.name}</TChip>)}</div></div>}
      <div class="stack-sm"><span class="label">Ícono</span><div class="chips">{CATEGORY_ICONS.map((ic) => <button key={ic} type="button" class="icon-btn" aria-label={`Ícono ${ic}`} aria-pressed={icon === ic ? 'true' : 'false'} onClick={() => setIcon(ic)}><Icon name={ic} size={19} /></button>)}</div></div>
      <div class="row">
        <button type="button" class="btn sm grow" disabled={name.trim().length < 2} onClick={save}><Icon name="check" size={18} />Guardar</button>
        <button type="button" class="btn sm ghost" onClick={() => onDone(null)}>Cancelar</button>
      </div>
      {cat && cat.custom && <button type="button" class="link-btn" style={{ color: 'var(--vit-ink)', alignSelf: 'flex-start' }} onClick={async () => { if (await ask(`¿Borrar «${cat.name}»? Sus movimientos pasan a «Otros».`, { ok: 'Borrar', danger: true })) { act((st) => removeCategory(st, cat.id)); onDone(null); } }}><Icon name="trash" size={16} />Borrar categoría</button>}
      {cat && !cat.custom && <button type="button" class="link-btn muted" style={{ alignSelf: 'flex-start' }} onClick={() => { act((st) => updateCategory(st, cat.id, { hidden: true })); toast(`«${cat.name}» ya no aparece al elegir`, 'eyeoff'); onDone(null); }}><Icon name="eyeoff" size={16} />Ocultar al elegir</button>}
    </section>
  );
}

function CatsSheet({ s, onClose }) {
  const [type, setType] = useState('gasto');
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const hidden = s.money.categories.filter((c) => c.hidden && c.type === type);
  return (
    <Sheet onClose={onClose} label="Categorías">
      <SheetHead title="Categorías" onClose={onClose} />
      <div class="seg" role="tablist" aria-label="Tipo">
        {[['gasto', 'Gastos'], ['ingreso', 'Ingresos'], ['transfer', 'Entre cuentas']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={type === k ? 'true' : 'false'} onClick={() => { setType(k); setEditing(null); setAdding(false); }}>{l}</button>)}
      </div>
      {!adding && !editing && <button type="button" class="btn ghost block" onClick={() => setAdding(true)}><Icon name="plus" size={18} />Nueva categoría</button>}
      {(adding || editing) && <CatForm key={editing ? editing.id : `new-${type}`} type={type} cat={editing} onDone={() => { setAdding(false); setEditing(null); }} />}
      {catGroups(s, type).map((g) => (
        <section key={g.id} class="card flush" aria-label={g.name}>
          <div style={{ padding: '12px 0 2px' }}><span class="tiny strong muted" style={{ letterSpacing: 0.6, textTransform: 'uppercase' }}>{g.name}</span></div>
          {g.cats.map((c) => (
            <button type="button" key={c.id} class="lrow" style={{ minHeight: 52 }} onClick={() => { setEditing(c); setAdding(false); }} aria-label={`Editar ${c.name}`}>
              <span class="tile xs" style={{ background: 'var(--soft)' }}><Icon name={c.icon || 'tag'} size={15} /></span>
              <span class="grow semi">{c.name}</span>{c.custom && <span class="chip sm">Tuya</span>}<Icon name="edit" size={15} />
            </button>
          ))}
        </section>
      ))}
      {hidden.length > 0 && (
        <section class="card flush" aria-label="Ocultas">
          <div style={{ padding: '12px 0 2px' }}><span class="tiny strong muted" style={{ letterSpacing: 0.6, textTransform: 'uppercase' }}>Ocultas</span></div>
          {hidden.map((c) => (
            <button type="button" key={c.id} class="lrow" style={{ minHeight: 52 }} onClick={() => act((st) => updateCategory(st, c.id, { hidden: false }))}>
              <span class="tile xs" style={{ background: 'var(--soft)' }}><Icon name={c.icon || 'tag'} size={15} /></span><span class="grow semi muted">{c.name}</span><span class="small strong">Mostrar</span>
            </button>
          ))}
        </section>
      )}
    </Sheet>
  );
}

export { go };
