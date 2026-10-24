import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Nav, Bar, Sheet, SheetHead, TChip, Switch, money, usd, cur, rateText, toast, ask, focusOnMount, plural } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { go } from '../app/router.js';
import { monthKey, relDay, fmtDay, fmtShort } from '../app/dates.js';
import { refreshRate, rateForDay } from '../app/fx.js';
import { saveFile } from '../app/files.js';
import {
  attrLevel, addTx, updateTx, removeTx, setBudget, catOf, catName, catGroups, catsOfType, addCategory, updateCategory, removeCategory,
  bossHP, fxRate, fxIsManual, setManualRate, toDOP, toUSD, txKind, txCur, txOrig, txRate, accountOf, accountLabel,
  guessTxCat, learnRule, txTags, undoImport, frequentCats, taxSuggestion, taxChildren, findTaxFor, setTaxRecords, taxPct, TAX_LABEL, transferTaxRate,
} from '../game/logic.js';
import { parseBankAlerts, toNumber } from '../game/parse.js';
import { CATEGORY_GROUPS, ACCOUNT_KINDS, CATEGORY_ICONS } from '../game/content.js';
import { AreaTodos } from './Todos.jsx';
import { CatPicker } from '../ui/catpicker.jsx';
import { setPending } from './Import.jsx';
import { PhotoStrip } from '../ui/photos.jsx';
import {
  MoneyOverview, AccountsTab, PlanTab, CardSheet, AccountSheet, PlanSheet, DueSheet, FundSheet, BudgetCatSheet, payInitial, AccountForm, BudgetSuggestSheet,
} from './Money.jsx';
import { monthPlan, isCard, setGroupBudget } from '../game/money.js';
import { Analysis } from './Stats.jsx';
import { Movements, TxRow, csvOf, KIND_LABEL, fxWhen } from './Movements.jsx';
import { WorkSheet, TaxSheet, RulesSheet, DebtSheet, CatDetailSheet, MoveCatSheet, SplitSheet } from './FinTools.jsx';
import { LoanSheet } from './Loans.jsx';
import { CreditSheet, AssetSheet } from './Credits.jsx';
import { DebtsTab } from './Debts.jsx';
import { openCredits, creditForTx, payCredit } from '../game/credits.js';
import { takePendingTx } from '../app/handoff.js';
import { ocrSupported, readText, ocrErrorText } from '../app/ocr.js';
import { photoURL } from '../app/photos.js';
import { parseScan, voucherTx } from '../game/scan.js';
import { loanForTx, loanFromTx, openLoans, payLoan, leftOf } from '../game/loans.js';
import {
  emptyFilter, normFilter, workInfo, workHours, fmtWork, sameMerchantOthers, bulkEdit, rulesList, periodRange, filterTx,
} from '../game/ledger.js';

const SRC_LABEL = { recibo: 'Recibo', comprobante: 'Comprobante', alerta: 'Aviso del banco', voz: 'Registro rápido', manual: 'A mano', importado: 'Importado', correo: 'Correo del banco' };
const ACC_ICON = Object.fromEntries(ACCOUNT_KINDS.map((k) => [k.key, k.icon]));
const num = (v) => toNumber(String(v || '').replace(/[^\d.,]/g, '')) || 0;

const TABS = [['resumen', 'Resumen'], ['cuentas', 'Cuentas'], ['deudas', 'Deudas'], ['plan', 'Plan'], ['analisis', 'Análisis'], ['movimientos', 'Movimientos']];

export function Finance({ query }) {
  const s = useApp();
  const today = s.energy.day;
  const q0 = query.get('tab');
  const [tab, setTabState] = useState(TABS.some(([k]) => k === q0) ? q0 : 'resumen');
  // «nuevo»: un movimiento a medio llenar que puede venir de otra pantalla (un comprobante leído, 1.10).
  const [sheet, setSheet] = useState(() => (query.get('alerta') ? { kind: 'alert' } : query.get('nuevo') ? { kind: 'tx', ...(takePendingTx() || {}) } : null));
  const [filter, setFilter] = useState(emptyFilter());
  const [per, setPer] = useState({ kind: 'mes', mk: monthKey(today) });
  const [sel, setSel] = useState(null);
  useEffect(() => { refreshRate(); }, []);

  const lvl = attrLevel(s.attrs.finanzas);
  const rate = fxRate(s, today);
  const bosses = s.bosses.filter((b) => b.area === 'finanzas' && b.status === 'active');
  const imp = s.money.lastImport;
  const setTab = (t) => { setTabState(t); setSel(null); go(`/finanzas?tab=${t}`, { replace: true }); window.scrollTo(0, 0); };
  // Desde una cuenta, una tarjeta, un presupuesto o una categoría: sus movimientos (de este mes o del período que se pida).
  const showMovements = (account = null, cat = null, month = null) => {
    setSheet(null);
    setFilter(normFilter({ cats: cat ? (Array.isArray(cat) ? cat : [cat]) : [], accounts: account ? [account] : [] }));
    setPer(month && typeof month === 'object' ? month : { kind: 'mes', mk: month || monthKey(today) });
    setTab('movimientos');
  };
  const pay = (it) => setSheet(payInitial(s, it, today));
  const close = () => setSheet(null);

  return (
    <>
      <main class="screen" style={sel ? { paddingBottom: 'calc(200px + env(safe-area-inset-bottom, 0px))' } : null}>
        <header class="between-c fin-head">
          <div class="stack-xs" style={{ minWidth: 0 }}><span class="eyebrow" style={{ color: 'var(--finanzas-ink)' }}>Fortuna · Nv {lvl.n}</span><h1 class="h1">Finanzas</h1></div>
          <div class="row" style={{ gap: 8, flexShrink: 0 }}>
            <button type="button" class="icon-btn" aria-label="Pegar avisos del banco" onClick={() => setSheet({ kind: 'alert' })}><Icon name="paste" size={20} /></button>
            <button type="button" class="icon-btn" aria-label="Más opciones de finanzas" onClick={() => setSheet({ kind: 'more' })}><Icon name="dots" size={20} /></button>
            <a class="btn sm" href="#/recibo" aria-label="Escanear recibo"><Icon name="camera" size={18} /><span class="fin-head-l">Recibo</span></a>
          </div>
        </header>

        <div class="seg fin-tabs" role="tablist" aria-label="Secciones de finanzas">
          {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k ? 'true' : 'false'} onClick={() => setTab(k)}>{l}</button>)}
        </div>

        {imp && (tab === 'resumen' || tab === 'movimientos') && (
          <div class="note tone-good" role="status">
            <Icon name="check" size={20} />
            <span class="stack-sm grow">
              <span>{imp.n ? `Agregaste ${plural(imp.n, 'movimiento', 'movimientos')} de «${imp.label}».` : `Cuadraste tus saldos con «${imp.label}».`}{imp.n && imp.anchors && imp.anchors.length ? ` También cuadraste ${plural(imp.anchors.length, 'cuenta', 'cuentas')} con lo que dice el banco.` : ''}</span>
              <span class="row wrap" style={{ gap: 14 }}>
                <button type="button" class="link-btn" style={{ color: 'inherit', minHeight: 32 }} onClick={async () => {
                  const q = imp.n ? `¿Quitar los ${imp.n} movimientos que agregaste de «${imp.label}»?${imp.anchors && imp.anchors.length ? ' Los saldos vuelven a como estaban.' : ''}` : '¿Volver tus saldos a como estaban antes?';
                  if (!(await ask(q, { ok: imp.n ? 'Quitar' : 'Volver', danger: true }))) return;
                  const n = act((st) => undoImport(st, imp.batch));
                  toast(imp.n ? `Se quitaron ${plural(n, 'movimiento', 'movimientos')}` : 'Los saldos volvieron a como estaban', 'undo');
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
        {tab === 'deudas' && <DebtsTab s={s} today={today} setSheet={setSheet} />}
        {tab === 'plan' && <PlanTab s={s} today={today} setSheet={setSheet} />}
        {tab === 'analisis' && <Analysis s={s} today={today} setSheet={setSheet} onCat={(cat) => setSheet({ kind: 'catdetail', id: cat })} />}
        {tab === 'movimientos' && <Movements s={s} today={today} per={per} setPer={setPer} filter={filter} setFilter={setFilter} setSheet={setSheet} sel={sel} setSel={setSel} />}
      </main>
      <Nav active="areas" fab={sel ? null : { onClick: () => setSheet({ kind: 'tx' }), label: 'Nuevo movimiento' }} />
      {sheet && sheet.kind === 'tx' && <TxSheet key={sheet.tx ? sheet.tx.id : `nuevo-${sheet.link ? (sheet.link.plan || sheet.link.credit) + sheet.link.date : sheet.to || ''}`} s={s} initial={sheet} tx={sheet.tx} onClose={close}
        onSplit={(id) => setSheet({ kind: 'split', id })} onOpenTx={(t) => setSheet({ kind: 'tx', tx: t })} onWork={() => setSheet({ kind: 'work' })} onLoan={(id) => setSheet({ kind: 'loan', id })} onCredit={(id) => setSheet({ kind: 'credit', id })} />}
      {sheet && sheet.kind === 'alert' && <AlertSheet onClose={close} />}
      {sheet && sheet.kind === 'budgets' && <BudgetSheet s={s} rate={rate} onClose={close} />}
      {sheet && sheet.kind === 'suggest' && <BudgetSuggestSheet s={s} onClose={close} />}
      {sheet && sheet.kind === 'budgetcat' && <BudgetCatSheet s={s} id={sheet.id} onClose={close} onMovements={showMovements} onDetail={(id) => setSheet({ kind: 'catdetail', id })} />}
      {sheet && sheet.kind === 'fx' && <FxSheet s={s} onClose={close} />}
      {sheet && sheet.kind === 'more' && <MoreSheet s={s} per={per} today={today} onPick={(k) => setSheet({ kind: k })} onClose={close} />}
      {sheet && sheet.kind === 'cats' && <CatsSheet s={s} onClose={close} onMove={(id) => setSheet({ kind: 'movecat', id })} onDetail={(id) => setSheet({ kind: 'catdetail', id })} />}
      {sheet && sheet.kind === 'card' && <CardSheet s={s} id={sheet.id} onClose={close} onPay={pay} onMovements={showMovements} onDebts={() => setSheet({ kind: 'debts' })} />}
      {sheet && sheet.kind === 'account' && <AccountSheet s={s} id={sheet.id} onClose={close} onMovements={showMovements} />}
      {sheet && sheet.kind === 'plan' && <PlanSheet key={sheet.id || (sheet.tpl ? sheet.tpl.name : sheet.planKind || 'nuevo')} s={s} id={sheet.id} tpl={sheet.tpl} planKind={sheet.planKind} future={sheet.future} onClose={close} />}
      {sheet && sheet.kind === 'due' && <DueSheet s={s} item={sheet.item} onClose={close} onPay={pay} onEdit={() => setSheet({ kind: 'plan', id: sheet.item.plan })} />}
      {sheet && sheet.kind === 'fund' && <FundSheet s={s} id={sheet.id} onClose={close} />}
      {sheet && sheet.kind === 'work' && <WorkSheet s={s} onClose={close} />}
      {sheet && sheet.kind === 'tax' && <TaxSheet s={s} onClose={close} />}
      {sheet && sheet.kind === 'rules' && <RulesSheet s={s} onClose={close} />}
      {sheet && sheet.kind === 'debts' && <DebtSheet s={s} onClose={close} />}
      {sheet && sheet.kind === 'catdetail' && <CatDetailSheet s={s} id={sheet.id} onClose={close} onMovements={(cats, p) => showMovements(null, cats, p)} onBudget={(id) => setSheet({ kind: 'budgetcat', id })} onMove={(id) => setSheet({ kind: 'movecat', id })} />}
      {sheet && sheet.kind === 'movecat' && <MoveCatSheet s={s} from={sheet.id} onClose={close} />}
      {sheet && sheet.kind === 'split' && <SplitSheet s={s} id={sheet.id} onClose={close} onOpenTx={(t) => setSheet({ kind: 'tx', tx: t })} />}
      {sheet && sheet.kind === 'credit' && <CreditSheet key={sheet.id || (sheet.sim ? 'sim' : 'nuevo')} s={s} id={sheet.id} sim={sheet.sim} onClose={close} onOpenTx={(t) => setSheet({ kind: 'tx', tx: t })} onPlan={(id) => setSheet({ kind: 'plan', id })} />}
      {sheet && sheet.kind === 'asset' && <AssetSheet key={sheet.id || 'nuevo'} s={s} id={sheet.id} onClose={close} />}
      {sheet && sheet.kind === 'loan' && <LoanSheet key={sheet.id || 'nuevo'} s={s} id={sheet.id} initial={sheet.initial} onClose={close} onOpenTx={(t) => setSheet({ kind: 'tx', tx: t })} />}
    </>
  );
}

// ---------- Últimos movimientos (en el resumen) ----------

function RecentTx({ s, today, onOpen, onAll }) {
  const list = s.money.tx.filter((t) => t.day <= today).slice(0, 4);
  if (!list.length) return null;
  const wi = workInfo(s, today);
  return (
    <section class="card flush" aria-label="Últimos movimientos">
      <div class="between-c" style={{ padding: '14px 0 4px' }}>
        <h2 class="h2">Últimos movimientos</h2>
        <button type="button" class="link-btn" onClick={onAll}>Ver todos<Icon name="right" size={16} /></button>
      </div>
      {list.map((t) => <TxRow key={t.id} s={s} t={t} wi={wi} day={relDay(t.day, today)} onOpen={() => onOpen(t)} />)}
    </section>
  );
}

// ---------- Hoja: nuevo o editar movimiento ----------

export function TxSheet({ s, initial, tx, onClose, onSplit = null, onOpenTx = null, onWork = null, onLoan, onCredit = null }) {
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
  // 1.9: impuesto y comisión de la transferencia, «no contar» y horas de trabajo.
  const kids = tx ? taxChildren(s, tx.id) : [];
  const kidTax = kids.find((k) => k.taxKind === 'tax') || null;
  const kidFee = kids.find((k) => k.taxKind === 'fee') || null;
  const looseTax = tx && !kidTax ? findTaxFor(s, tx) : null;
  // Un comprobante leído puede traer el impuesto y la comisión que cobró el banco.
  const [taxPick, setTaxPick] = useState(!tx && initial.tax ? true : null);
  const [showFee, setShowFee] = useState(!!kidFee || (!tx && Number(initial.fee) > 0));
  const [fee, setFee] = useState(kidFee ? String(txOrig(kidFee)) : !tx && Number(initial.fee) > 0 ? String(initial.fee) : s.money.tax.fee ? String(s.money.tax.fee) : '');
  const [noStats, setNoStats] = useState(tx ? !!tx.noStats : false);
  const parent = tx && tx.taxOf ? s.money.tx.find((t) => t.id === tx.taxOf) : null;
  const n = toNumber(String(amount).replace(/[^\d.,]/g, '')) || 0;
  const guess = guessTxCat(s, { merchant, text: note, type });
  const effCat = cat && catOf(s, cat).type === type ? cat : guess;
  const c = catOf(s, effCat);
  const tags = txTags(s);
  const sug = tx && tx.taxOf ? { can: false } : taxSuggestion(s, { type, cat: effCat, account, amount: n, currency, day, merchant, note, split: tx && tx.split });
  const taxOn = taxPick != null ? taxPick : editing ? !!kidTax : sug.on;
  const wi = workInfo(s, today);
  const dop = toDOP(n, currency, rate);
  const hrs = type === 'gasto' && wi.ready && n > 0 ? fmtWork(workHours(dop, wi), wi) : '';
  // 1.10: préstamos con personas. Un préstamo que das (o te hacen) va a «Te deben» (o «Debes») y no cuenta como gasto;
  // un cobro de «Préstamos que te devuelven» o un «Pago de deuda» puede ser el abono de uno.
  const lk = tx ? loanForTx(s, tx.id) : null;
  const loanable = !lk && !(tx && (tx.taxOf || tx.split)) && ((type === 'gasto' && (effCat === 'prestamo_dado' || effCat === 'terceros')) || (type === 'ingreso' && effCat === 'prestamo_recibido'));
  const [loanPick, setLoanPick] = useState(null);
  const loanOn = loanable && (loanPick != null ? loanPick : !editing && (effCat === 'prestamo_dado' || effCat === 'prestamo_recibido'));
  const [loanDue, setLoanDue] = useState('');
  const payDir = !editing ? (type === 'ingreso' && effCat === 'prestamo_cobrado' ? 'me' : type === 'gasto' && effCat === 'deuda' ? 'yo' : null) : null;
  const payable = payDir ? openLoans(s, payDir) : [];
  const [payTo, setPayTo] = useState(null);
  // 1.11: un «Pago de deuda» nuevo puede ser la cuota (o un abono a capital) de un préstamo del banco.
  const ck = tx ? creditForTx(s, tx.id) : null;
  const credits = !editing && type === 'gasto' && effCat === 'deuda' && !link ? openCredits(s) : [];
  const [credTo, setCredTo] = useState(null);
  const [credAbono, setCredAbono] = useState(false);
  const inLoanCur = (l) => (l.currency === currency ? n : l.currency === 'USD' ? toUSD(dop, rate) : dop);
  // 1.10: leer la foto que adjuntaste (recibo o comprobante) con el lector de texto del teléfono y llenar lo que falta.
  const [scan, setScan] = useState(null);
  const readPhoto = async () => {
    const id = photos[photos.length - 1];
    if (!id || scan) return;
    setScan({ label: 'Preparando el lector…', pct: 0.02 });
    try {
      const url = await photoURL(id);
      if (!url) throw new Error('missing');
      const bmp = await createImageBitmap(await (await fetch(url)).blob());
      const { text } = await readText(bmp, setScan);
      const r = parseScan(text, today);
      const v = r.kind === 'transferencia' ? voucherTx(s, r) : null;
      let got = 0;
      if (!n && r.total) { setAmount(String(r.total)); if (r.currency === 'USD') setCurrency('USD'); got += 1; }
      const name = v ? v.merchant : r.merchant;
      if (!merchant.trim() && name) { setMerchant(name); got += 1; }
      if (r.day && day === today && r.day !== today) { setDay(r.day); got += 1; }
      if (v) {
        if (!note.trim() && v.note) { setNote(v.note); got += 1; }
        if (!account && v.account) setAccount(v.account);
        if (!cat && v.cat && v.type === type) setCat(v.cat);
      } else if (!cat && r.cat && r.cat !== 'otros' && type === 'gasto') setCat(r.cat);
      toast(got ? 'Leí la foto: revisa los datos' : 'No encontré datos claros en la foto', got ? 'check' : 'info');
    } catch (e) {
      toast(ocrErrorText(e), 'info');
    } finally {
      setScan(null);
    }
  };

  // La tasa sigue la fecha (si no la cambiaste tú). Para días pasados se busca la de ese día.
  useEffect(() => {
    if (touched.current) return;
    setRate(fxRate(s, day));
    if (currency === 'USD' && day !== today) rateForDay(day).then((r) => { if (r && !touched.current) setRate(r); });
  }, [day, currency]);

  const converted = currency === 'USD' ? money(dop) : usd(toUSD(n, rate));
  const save = async () => {
    if (!n) return;
    const p = { type, amount: n, currency, rate, cat: effCat, merchant, day, account, to: type === 'transfer' ? to : '', tag, note, photos };
    const feeN = sug.can && showFee ? num(fee) : 0;
    const res = act((st, t, ev) => {
      if (editing) {
        const nt = updateTx(st, tx.id, { ...p, noStats });
        if (!nt) return null;
        if (loanOn) loanFromTx(st, nt.id, { due: loanDue || null }, t, ev);
        if (sug.can && !looseTax) setTaxRecords(st, tx.id, { tax: taxOn, fee: feeN });
        else if (!sug.can && kids.length) setTaxRecords(st, tx.id, { tax: false, fee: 0 });
        // ¿Otros gastos de este comercio en otra categoría? Se ofrece cambiarlos también.
        return { nt, others: nt.cat !== tx.cat && nt.kind === 'gasto' && !nt.split ? sameMerchantOthers(st, nt).map((x) => x.id) : [] };
      }
      const nt = addTx(st, { ...p, source: initial.source || 'manual', link: link && type !== 'transfer' ? link : null, tax: sug.can && taxOn, fee: feeN }, t, ev);
      if (cat && merchant && type === 'gasto') learnRule(st, merchant, effCat);
      if (nt && loanOn) loanFromTx(st, nt.id, { due: loanDue || null }, t, ev);
      const pl = nt && payTo ? payable.find((l) => l.id === payTo) : null;
      if (pl) payLoan(st, pl.id, { amount: inLoanCur(pl), day: nt.day, tx: nt.id }, t, ev);
      if (nt && credTo && !pl) payCredit(st, credTo, { tx: nt.id, kind: credAbono ? 'abono' : 'cuota' }, t, ev);
      return { nt, others: [] };
    });
    toast(loanOn ? (type === 'gasto' ? 'Préstamo anotado en «Te deben»' : 'Préstamo anotado en «Debes»') : !editing && payTo ? 'Abono anotado en el préstamo' : !editing && credTo ? (credAbono ? 'Abono anotado en tu préstamo' : 'Cuota anotada en tu préstamo') : editing ? 'Movimiento actualizado' : link ? `«${link.name}»: ${type === 'ingreso' ? 'recibido' : 'pagado'}` : type === 'ingreso' ? 'Ingreso guardado' : type === 'transfer' ? (effCat === 'pago_tarjeta' ? 'Pago de tarjeta guardado' : 'Movimiento entre cuentas guardado') : 'Gasto guardado', 'check');
    onClose();
    if (res && res.others && res.others.length) {
      const nm = res.nt.merchant;
      if (await ask(`Hay ${plural(res.others.length, 'gasto más', 'gastos más')} de «${nm}» en otra categoría. ¿Pasarlos también a «${catName(s, res.nt.cat)}»?`, { ok: `Pasar ${res.others.length === 1 ? 'ese' : `los ${res.others.length}`}` })) {
        const k = act((st) => bulkEdit(st, res.others, { cat: res.nt.cat }, { label: `Pasaste ${plural(res.others.length, 'gasto', 'gastos')} de «${nm}» a «${catName(s, res.nt.cat)}»` }));
        toast(`Listo: ${plural(k, 'gasto', 'gastos')} en «${catName(s, res.nt.cat)}»`, 'check');
      }
    }
  };
  const del = async () => {
    if (!(await ask(kids.length ? '¿Borrar este movimiento? También se borra su impuesto.' : '¿Borrar este movimiento?', { ok: 'Borrar', danger: true }))) return;
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
      <SheetHead title={editing ? 'Movimiento' : link ? `${initial.type === 'ingreso' ? 'Cobro' : 'Pago'}: ${link.name}` : initial.scanned ? 'Revisa el comprobante' : initial.cat === 'pago_tarjeta' ? 'Pago de tarjeta' : 'Nuevo movimiento'} onClose={onClose} />
      {initial.scanned && !editing && <div class="note tone-good"><Icon name="eye" size={18} /><span>Lo leí del comprobante. Revisa el monto, la cuenta y el impuesto antes de guardar.</span></div>}
      {parent && (
        <div class="note"><Icon name="percent" size={18} /><span class="stack-xs">Es el {tx.taxKind === 'fee' ? 'cargo del banco' : 'impuesto'} de «{parent.merchant || catName(s, parent.cat)}» ({cur(txOrig(parent), txCur(parent))}, {fmtShort(parent.day)}).{onOpenTx && <button type="button" class="link-btn" style={{ minHeight: 30, alignSelf: 'flex-start' }} onClick={() => onOpenTx(parent)}>Abrir la transferencia<Icon name="right" size={14} /></button>}</span></div>
      )}
      {tx && tx.split && (
        <div class="note"><Icon name="scissors" size={18} /><span class="stack-xs">Parte {tx.split.i + 1} de {tx.split.n} de un movimiento de {cur(tx.split.total, txCur(tx))}.{onSplit && <button type="button" class="link-btn" style={{ minHeight: 30, alignSelf: 'flex-start' }} onClick={() => onSplit(tx.id)}>Ver las partes<Icon name="right" size={14} /></button>}</span></div>
      )}
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
        {hrs && <span class="small semi row hrs" style={{ color: 'var(--finanzas-ink)' }} aria-live="polite"><Icon name="clock" size={14} stroke={2.3} />{hrs} de tu trabajo</span>}
        {type === 'gasto' && !wi.ready && onWork && n > 0 && <button type="button" class="link-btn muted" style={{ minHeight: 30, fontSize: 13, alignSelf: 'flex-start' }} onClick={onWork}><Icon name="clock" size={13} />¿Cuántas horas de trabajo es? Pon tu ingreso</button>}
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
        {editing && onSplit && !tx.split && !tx.taxOf && type !== 'transfer' && txKind(tx) !== 'transfer' && <button type="button" class="link-btn" style={{ alignSelf: 'flex-start', minHeight: 32 }} onClick={() => onSplit(tx.id)}><Icon name="scissors" size={15} />Dividir en varias categorías</button>}
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
      {sug.can && effCat !== 'retiro' && (looseTax ? (
        <div class="note"><Icon name="percent" size={18} /><span>Su impuesto ya está anotado aparte: {cur(txOrig(looseTax), txCur(looseTax))} el {fmtShort(looseTax.day)}.</span></div>
      ) : (
        <section class="panel stack-sm" aria-label="Impuesto a transferencias">
          <label class="between-c" style={{ cursor: 'pointer', gap: 12 }}>
            <span class="stack-xs">
              <span class="semi">Impuesto a transferencias ({taxPct(sug.rate)})</span>
              <span class="small muted">{sug.exempt ? 'Entre tus cuentas no se paga. Márcalo solo si tu banco te lo cobró.' : taxOn ? `${cur(sug.tax, sug.currency)} aparte, como gasto en «Comisiones e impuestos del banco».` : sug.likely ? `Una transferencia así suele pagarlo: serían ${cur(sug.tax, sug.currency)}.` : 'Las transferencias a otras personas y los pagos de tarjeta o préstamo desde tu cuenta lo pagan; las compras con tarjeta, no.'}</span>
            </span>
            <Switch checked={taxOn} onChange={(v) => setTaxPick(v)} label={`Anotar el impuesto a transferencias de ${cur(sug.tax || 0, sug.currency)}`} />
          </label>
          {showFee ? (
            <div class="field"><label for="tfee2">Comisión del banco (otro banco, ACH o LBTR)</label><div class="numrow"><span class="unit">{sug.currency === 'USD' ? 'US$' : 'RD$'}</span><input id="tfee2" class="input" inputMode="decimal" value={fee} placeholder="0" onInput={(e) => setFee(e.currentTarget.value)} ref={kidFee ? undefined : focusOnMount} /><button type="button" class="btn xs ghost" onClick={() => { setShowFee(false); setFee(''); }}>Quitar</button></div></div>
          ) : <button type="button" class="link-btn" style={{ alignSelf: 'flex-start', minHeight: 30, fontSize: 13.5 }} onClick={() => setShowFee(true)}><Icon name="plus" size={14} />Comisión del banco</button>}
        </section>
      ))}
      {link && type !== 'transfer' && <div class="note tone-good"><Icon name="calendar" size={18} /><span>{link.credit ? `Se anota como una cuota pagada de «${link.name}».` : `Se marca «${link.name}» del ${fmtDay(link.date, { weekdayName: false })} como ${type === 'ingreso' ? 'recibido' : 'pagado'}.`}</span></div>}
      {lk && (
        <div class="note tone-good"><Icon name="coins" size={18} /><span class="stack-xs">{lk.pay ? `Es un abono de tu préstamo con ${lk.loan.who}.` : lk.loan.dir === 'me' ? `Es un préstamo a ${lk.loan.who}: ${lk.loan.closed ? 'ya está saldado' : `te debe ${cur(leftOf(lk.loan), lk.loan.currency)}`}.` : `Es un préstamo de ${lk.loan.who}: ${lk.loan.closed ? 'ya está saldado' : `le debes ${cur(leftOf(lk.loan), lk.loan.currency)}`}.`}{onLoan && <button type="button" class="link-btn" style={{ minHeight: 30, alignSelf: 'flex-start', color: 'inherit' }} onClick={() => onLoan(lk.loan.id)}>Ver el préstamo<Icon name="right" size={14} /></button>}</span></div>
      )}
      {ck && (
        <div class="note tone-good"><Icon name="coins" size={18} /><span class="stack-xs">{ck.pay.kind === 'abono' ? 'Es un abono a capital de' : 'Es una cuota de'} «{ck.credit.name}».{onCredit && <button type="button" class="link-btn" style={{ minHeight: 30, alignSelf: 'flex-start', color: 'inherit' }} onClick={() => onCredit(ck.credit.id)}>Ver el préstamo<Icon name="right" size={14} /></button>}</span></div>
      )}
      {loanable && (
        <section class="panel stack-sm" aria-label="Préstamo">
          <label class="between-c" style={{ cursor: 'pointer', gap: 12 }}>
            <span class="stack-xs"><span class="semi">{type === 'gasto' ? 'Es un préstamo: me lo van a devolver' : 'Es un préstamo: lo tengo que devolver'}</span><span class="small muted">Lo anoto en «{type === 'gasto' ? 'Te deben' : 'Debes'}» y no cuenta como {type === 'gasto' ? 'gasto' : 'ingreso'}.</span></span>
            <Switch checked={loanOn} onChange={(v) => setLoanPick(v)} label="Es un préstamo" />
          </label>
          {loanOn && <div class="field"><label for="tldue">¿Para cuándo quedó? (opcional)</label><input id="tldue" type="date" class="input" value={loanDue} min={day} onInput={(e) => setLoanDue(e.currentTarget.value)} /></div>}
        </section>
      )}
      {payable.length > 0 && (
        <div class="stack-sm">
          <span class="label">{payDir === 'me' ? '¿Quién te pagó?' : '¿Es lo que le debes a alguien?'}</span>
          <div class="chips" role="group" aria-label={payDir === 'me' ? 'Quién te pagó' : 'A quién le pagaste'}>
            {payDir === 'yo' && <TChip sm on={!payTo} onClick={() => setPayTo(null)}>No, es otra deuda</TChip>}
            {payable.map((l) => <TChip key={l.id} sm on={payTo === l.id} onClick={() => setPayTo(payTo === l.id ? null : l.id)}>{l.who} · {cur(leftOf(l), l.currency)}</TChip>)}
          </div>
          {payTo && <span class="small muted">Se anota como abono y no cuenta como {payDir === 'me' ? 'ingreso' : 'gasto'}.</span>}
        </div>
      )}
      {credits.length > 0 && !payTo && (
        <div class="stack-sm">
          <span class="label">¿Es de un préstamo del banco?</span>
          <div class="chips" role="group" aria-label="Préstamo del banco">
            <TChip sm on={!credTo} onClick={() => setCredTo(null)}>No</TChip>
            {credits.map((c) => <TChip key={c.id} sm on={credTo === c.id} onClick={() => setCredTo(credTo === c.id ? null : c.id)}>{c.name}</TChip>)}
          </div>
          {credTo && (
            <label class="between-c" style={{ cursor: 'pointer', gap: 12 }}>
              <span class="small semi">Es un abono extra a capital (no la cuota)</span>
              <Switch checked={credAbono} onChange={setCredAbono} label="Abono a capital" />
            </label>
          )}
          {credTo && <span class="small muted">Se anota en el préstamo: te digo cuánto fue a intereses y cuánto a capital.</span>}
        </div>
      )}
      <div class="field"><label for="tnote">Nota (opcional)</label><input id="tnote" class="input" value={note} maxLength={200} onInput={(e) => setNote(e.currentTarget.value)} placeholder="Detalle, para quién, número de referencia…" /></div>
      <PhotoStrip ids={photos} onChange={setPhotos} kind="recibo" label="Foto del recibo, factura o comprobante (opcional)" max={4} />
      {photos.length > 0 && ocrSupported() && (scan ? (
        <div class="stack-xs" aria-live="polite"><span class="small semi muted">{scan.label}</span><Bar value={scan.pct} color="var(--finanzas)" label="Leyendo la foto" /></div>
      ) : <button type="button" class="link-btn" style={{ alignSelf: 'flex-start', minHeight: 32 }} onClick={readPhoto}><Icon name="eye" size={15} />Leer los datos de la foto</button>)}
      {type === 'transfer' && <div class="note"><Icon name="info" size={18} /><span>Los pagos de tarjeta y lo que mueves entre tus cuentas no cuentan como gasto (las compras ya se cuentan una por una), pero sí mueven tus saldos.</span></div>}
      {editing && (
        <label class="between-c panel" style={{ cursor: 'pointer' }}>
          <span class="stack-xs"><span class="semi">No contar en el análisis</span><span class="small muted">Sigue moviendo tu saldo, pero no suma en gastos, presupuestos ni gráficas. Para algo que te van a reembolsar (los préstamos con personas van en «Te deben»).</span></span>
          <Switch checked={noStats} onChange={setNoStats} label="No contar en el análisis" />
        </label>
      )}
      <button type="button" class="btn block" disabled={!n} onClick={save}><Icon name="check" size={20} />{editing ? 'Guardar cambios' : 'Guardar'}</button>
      {editing && (
        <>
          {(tx.rnc || tx.ncf || tx.itbis > 0 || tx.source) && (
            <div class="card flush" aria-label="Detalles">
              <div class="lrow"><span class="grow muted semi">Registrado</span><span class="strong">{SRC_LABEL[tx.source] || tx.source}</span></div>
              {tx.rnc && <div class="lrow"><span class="grow muted semi">RNC</span><span class="strong">{tx.rnc}</span></div>}
              {tx.ncf && <div class="lrow"><span class="grow muted semi">NCF / e-NCF</span><span class="strong">{tx.ncf}</span></div>}
              {tx.itbis > 0 && <div class="lrow"><span class="grow muted semi">ITBIS</span><span class="strong">{money(tx.itbis)}</span></div>}
              {kids.map((k) => <button key={k.id} type="button" class="lrow" onClick={() => onOpenTx && onOpenTx(k)} disabled={!onOpenTx}><span class="grow muted semi">{k.taxKind === 'fee' ? 'Comisión del banco' : TAX_LABEL}</span><span class="strong">{cur(txOrig(k), txCur(k))}</span></button>)}
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

// ---------- Hoja: presupuestos (por categoría o por toda una familia) ----------

function BudgetSheet({ s, rate, onClose }) {
  const today = s.energy.day;
  const mp = monthPlan(s, monthKey(today), today);
  const income = mp.income;
  const cats = catsOfType(s, 'gasto');
  const gb = s.money.groupBudgets || {};
  const [vals, setVals] = useState(Object.fromEntries(cats.map((c) => [c.id, c.budget ? String(c.budget) : ''])));
  const [gvals, setGvals] = useState(Object.fromEntries(CATEGORY_GROUPS.map((g) => [g.id, gb[g.id] && gb[g.id].budget ? String(gb[g.id].budget) : ''])));
  const [open, setOpen] = useState(() => Object.fromEntries(CATEGORY_GROUPS.map((g) => [g.id, cats.some((c) => c.group === g.id && c.budget > 0) || !!(gb[g.id] && gb[g.id].budget)])));
  // Lo asignado sin contar dos veces: si una familia tiene tope, sus categorías ya van dentro.
  const groupsOn = new Set(Object.entries(gvals).filter(([, v]) => (toNumber(v) || 0) > 0).map(([k]) => k));
  const total = [...groupsOn].reduce((a, g) => a + (toNumber(gvals[g]) || 0), 0)
    + cats.filter((c) => !groupsOn.has(c.group)).reduce((a, c) => a + (toNumber(vals[c.id]) || 0), 0);
  const save = () => {
    act((st, t) => {
      for (const [k, v] of Object.entries(vals)) setBudget(st, k, toNumber(v) || 0, t);
      for (const [g, v] of Object.entries(gvals)) if ((toNumber(v) || 0) > 0 || (st.money.groupBudgets || {})[g]) setGroupBudget(st, g, toNumber(v) || 0, t);
    });
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
      <span class="small muted">En pesos. Los gastos en dólares cuentan convertidos con la tasa de su día. Puedes ponerle tope a toda una familia (por ejemplo, Comida: súper, restaurantes, café y delivery) o a cada categoría. Toca un presupuesto en «Plan» para que lo que sobre pase al mes siguiente.</span>
      {catGroups(s, 'gasto').map((g) => {
        const sub = g.cats.reduce((a, c) => a + (toNumber(vals[c.id]) || 0), 0);
        const gv = toNumber(gvals[g.id]) || 0;
        return (
          <div key={g.id} class="card flush">
            <button type="button" class="lrow" style={{ minHeight: 52 }} aria-expanded={open[g.id] ? 'true' : 'false'} onClick={() => setOpen({ ...open, [g.id]: !open[g.id] })}>
              <span class="grow strong">{g.name}</span><span class="small muted tab-num">{gv ? `Tope ${money(gv)}` : sub ? money(sub) : ''}</span><Icon name={open[g.id] ? 'down' : 'right'} size={16} />
            </button>
            {open[g.id] && (
              <label class="lrow" style={{ minHeight: 60, background: 'var(--soft)', margin: '0 -18px', padding: '10px 18px', width: 'calc(100% + 36px)' }}>
                <span class="tile xs" style={{ background: 'var(--surface)' }}><Icon name="grid" size={15} /></span>
                <span class="stack-xs grow" style={{ gap: 0 }}><span class="semi">Toda la familia</span><span class="tiny muted semi">Tope para todas (opcional)</span></span>
                <input class="input" inputMode="decimal" value={gvals[g.id]} placeholder="0" onInput={(e) => setGvals({ ...gvals, [g.id]: e.currentTarget.value })} style={{ width: 120, minHeight: 44, textAlign: 'right' }} aria-label={`Tope de toda la familia ${g.name} en pesos`} />
              </label>
            )}
            {open[g.id] && g.cats.map((c) => (
              <label key={c.id} class="lrow" style={{ minHeight: 56 }}>
                <span class="tile xs" style={{ background: 'var(--soft)' }}><Icon name={c.icon || 'tag'} size={15} /></span>
                <span class="semi grow">{c.name}</span>
                <input class="input" inputMode="decimal" value={vals[c.id]} placeholder="0" onInput={(e) => setVals({ ...vals, [c.id]: e.currentTarget.value })} style={{ width: 120, minHeight: 44, textAlign: 'right' }} aria-label={`Presupuesto de ${c.name} en pesos`} />
              </label>
            ))}
            {open[g.id] && gv > 0 && sub > gv && <p class="tiny" style={{ color: 'var(--xp-ink)', padding: '0 0 10px' }}>Las categorías suman {money(sub)}, más que el tope de la familia.</p>}
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

function MoreSheet({ s, per, today, onPick, onClose }) {
  const wi = workInfo(s, today);
  const nRules = rulesList(s).length;
  const r = periodRange(per, today);
  const items = [
    ['download', 'Importar movimientos', 'Estado de cuenta en Excel o CSV, avisos del banco o un archivo de Astra', () => { onClose(); go('/importar'); }],
    ['tag', 'Categorías', `${catsOfType(s, 'gasto').length} de gastos y ${catsOfType(s, 'ingreso').length} de ingresos · pasar o unir`, () => onPick('cats')],
    ['sparkle', 'Reglas de categorías', nRules ? `${plural(nRules, 'comercio', 'comercios')} con su categoría` : 'Este comercio siempre va en esta categoría', () => onPick('rules')],
    ['clock', 'Tu hora de trabajo', wi.ready ? `${money(Math.round(wi.rate))} la hora · cuánto trabajo cuesta cada gasto` : 'Cuánto trabajo cuesta cada gasto', () => onPick('work')],
    ['percent', 'Impuesto a transferencias', `${taxPct(transferTaxRate(s, today))} · se anota aparte como gasto`, () => onPick('tax')],
    ['upload', r.kind === 'mes' ? 'Exportar el mes (Excel)' : 'Exportar el período (Excel)', 'Archivo CSV con pesos, dólares, tasa y horas de trabajo', async () => {
      const ok = await saveFile(`astra-movimientos-${r.kind === 'mes' ? r.mk : `${r.from}-a-${r.to > today ? today : r.to}`}.csv`, csvOf(s, filterTx(s, r, {}), wi), 'text/csv');
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

function CatForm({ type, cat, onDone, onMove = null, count = 0 }) {
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
      {cat && onMove && <button type="button" class="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => onMove(cat.id)}><Icon name="swap" size={16} />{count ? `Pasar sus ${plural(count, 'movimiento', 'movimientos')} a otra categoría` : 'Unir con otra categoría'}</button>}
      {cat && cat.custom && <button type="button" class="link-btn" style={{ color: 'var(--vit-ink)', alignSelf: 'flex-start' }} onClick={async () => { if (await ask(`¿Borrar «${cat.name}»? Sus movimientos pasan a «Otros».`, { ok: 'Borrar', danger: true })) { act((st) => removeCategory(st, cat.id)); onDone(null); } }}><Icon name="trash" size={16} />Borrar categoría</button>}
      {cat && !cat.custom && <button type="button" class="link-btn muted" style={{ alignSelf: 'flex-start' }} onClick={() => { act((st) => updateCategory(st, cat.id, { hidden: true })); toast(`«${cat.name}» ya no aparece al elegir`, 'eyeoff'); onDone(null); }}><Icon name="eyeoff" size={16} />Ocultar al elegir</button>}
    </section>
  );
}

function CatsSheet({ s, onClose, onMove, onDetail }) {
  const [type, setType] = useState('gasto');
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const hidden = s.money.categories.filter((c) => c.hidden && c.type === type);
  const counts = {};
  for (const t of s.money.tx) counts[t.cat] = (counts[t.cat] || 0) + 1;
  return (
    <Sheet onClose={onClose} label="Categorías">
      <SheetHead title="Categorías" onClose={onClose} />
      <div class="seg" role="tablist" aria-label="Tipo">
        {[['gasto', 'Gastos'], ['ingreso', 'Ingresos'], ['transfer', 'Entre cuentas']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={type === k ? 'true' : 'false'} onClick={() => { setType(k); setEditing(null); setAdding(false); }}>{l}</button>)}
      </div>
      {!adding && !editing && <button type="button" class="btn ghost block" onClick={() => setAdding(true)}><Icon name="plus" size={18} />Nueva categoría</button>}
      {(adding || editing) && <CatForm key={editing ? editing.id : `new-${type}`} type={type} cat={editing} count={editing ? counts[editing.id] || 0 : 0} onMove={onMove} onDone={() => { setAdding(false); setEditing(null); }} />}
      {catGroups(s, type).map((g) => (
        <section key={g.id} class="card flush" aria-label={g.name}>
          <div style={{ padding: '12px 0 2px' }}><span class="tiny strong muted" style={{ letterSpacing: 0.6, textTransform: 'uppercase' }}>{g.name}</span></div>
          {g.cats.map((c) => (
            <div key={c.id} class="lrow" style={{ minHeight: 52 }}>
              <button type="button" class="row grow" style={{ gap: 12, background: 'none', border: 0, padding: 0, color: 'inherit', textAlign: 'left', font: 'inherit', minWidth: 0 }} onClick={() => { setEditing(c); setAdding(false); }} aria-label={`Editar ${c.name}`}>
                <span class="tile xs" style={{ background: 'var(--soft)' }}><Icon name={c.icon || 'tag'} size={15} /></span>
                <span class="grow semi">{c.name}</span>{c.custom && <span class="chip sm">Tuya</span>}
                {counts[c.id] > 0 && <span class="tiny muted semi tab-num">{counts[c.id]}</span>}
              </button>
              {type === 'gasto' && counts[c.id] > 0 && <button type="button" class="icon-btn plain" aria-label={`Ver el detalle de ${c.name}`} onClick={() => onDetail(c.id)}><Icon name="chart" size={17} /></button>}
            </div>
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
