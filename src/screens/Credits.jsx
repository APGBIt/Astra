// Préstamos del banco (1.11): lo que pagas en cuotas. Aquí está la lista, el simulador «antes de pedirlo», el detalle
// con su tabla de amortización, los pagos y abonos, y los bienes que se compran con ellos.
import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Sheet, SheetHead, TChip, Switch, Bar, money, cur, toast, ask, plural, focusOnMount } from '../ui/kit.jsx';
import { act } from '../app/store.js';
import { fmtDay, fmtShort } from '../app/dates.js';
import { accountLabel, fxRate, toDOP } from '../game/logic.js';
import { isCard } from '../game/money.js';
import { toNumber } from '../game/parse.js';
import { ACCOUNT_KINDS } from '../game/content.js';
import {
  CREDIT_KINDS, CREDIT_FREQS, creditKind, creditOf, creditInfo, creditTotals, creditProject, creditWhatIf, creditPlanMatches,
  suggestPayment, dueDateOf, dueCount, scheduledBalance, addCredit, updateCredit, removeCredit, payCredit, removeCreditPay,
  syncCredit, removeSync, closeCredit, reopenCredit, creditCandidates, linkCreditTxs, recordDown,
} from '../game/credits.js';
import { ASSET_KINDS, assetKind, assetOf, assetInfo, assetTotals, addAsset, updateAsset, removeAsset } from '../game/assets.js';

const ACC_ICON = Object.fromEntries(ACCOUNT_KINDS.map((k) => [k.key, k.icon]));
const num = (v) => toNumber(String(v || '').replace(/[^\d.,]/g, '')) || 0;
const whole = (v) => money(Math.round(v || 0));
const ccur = (c, v) => cur(v, c.currency);
const firstMoneyAcc = (s) => (s.money.accounts.find((a) => a.kind === 'cuenta' && !a.hidden) || s.money.accounts.find((a) => !isCard(a) && !a.hidden) || {}).id || '';
const freqOf = (k) => CREDIT_FREQS.find((f) => f.key === k) || CREDIT_FREQS[0];

function AccountChips({ s, value, onChange, label }) {
  const list = s.money.accounts.filter((a) => !a.hidden && !isCard(a));
  return (
    <div class="chips" role="group" aria-label={label}>
      {list.map((a) => <TChip key={a.id} sm icon={ACC_ICON[a.kind] || 'card'} on={value === a.id} onClick={() => onChange(a.id)}>{accountLabel(a)}</TChip>)}
    </div>
  );
}

function CurrencyIn({ id, label, currency, setCurrency, value, setValue, autoFocus = false }) {
  return (
    <div class="field">
      <label for={id}>{label}</label>
      <div class="amount-in">
        <div class="cur-toggle" role="group" aria-label="Moneda">
          <button type="button" aria-pressed={currency === 'DOP' ? 'true' : 'false'} onClick={() => setCurrency('DOP')}>RD$</button>
          <button type="button" aria-pressed={currency === 'USD' ? 'true' : 'false'} onClick={() => setCurrency('USD')}>US$</button>
        </div>
        <input id={id} inputMode="decimal" value={value} onInput={(e) => setValue(e.currentTarget.value)} placeholder="0.00" aria-label={label} ref={autoFocus ? focusOnMount : undefined} />
      </div>
    </div>
  );
}

// «Termina en marzo de 2028», «en 14 cuotas».
const endText = (end) => (end ? fmtDay(end, { weekdayName: false }) : '—');

function dueText(c, info, today) {
  if (c.closed) return `Terminaste de pagarlo el ${fmtShort(c.closed)}`;
  if (!info.next) return 'Sin cuotas pendientes';
  if (info.status === 'late') return info.behind > 1 ? `${info.behind} cuotas atrasadas` : `Atrasada ${plural(info.daysLate, 'día', 'días')}`;
  if (info.status === 'today') return 'La cuota es hoy';
  return `Próxima cuota: ${fmtShort(info.next.date)}`;
}

// ---------- Lista (en la pestaña Deudas) ----------

export function CreditsCard({ s, today, setSheet }) {
  const credits = s.money.credits || [];
  const infos = credits.map((c) => ({ c, i: creditInfo(c, today) }));
  const open = infos.filter((x) => x.i.open);
  const closed = infos.filter((x) => !x.i.open);
  const t = creditTotals(s, today);
  const [showClosed, setShowClosed] = useState(false);
  return (
    <section class="card flush" aria-label="Préstamos del banco">
      <div class="between-c" style={{ padding: '14px 0 4px' }}>
        <h2 class="h2">Préstamos</h2>
        <button type="button" class="link-btn" onClick={() => setSheet({ kind: 'credit', id: null })}>Agregar<Icon name="plus" size={16} /></button>
      </div>
      {!credits.length && (
        <p class="small muted" style={{ padding: '2px 0 12px' }}>Un préstamo del banco, de la cooperativa o una compra a cuotas: te digo cuánto va a intereses, cuándo terminas y cuánto ahorras si abonas de más.</p>
      )}
      {open.map(({ c, i }) => {
        const k = creditKind(c.kind);
        const late = i.status === 'late';
        return (
          <button key={c.id} type="button" class="lrow" style={{ minHeight: 66 }} onClick={() => setSheet({ kind: 'credit', id: c.id })}
            aria-label={`${c.name}: debes ${ccur(c, i.balance)}. ${dueText(c, i, today)}`}>
            <span class="tile sm" style={{ background: late ? 'var(--vit-soft)' : 'var(--finanzas-soft)', color: late ? 'var(--vit-ink)' : 'var(--finanzas-ink)' }}><Icon name={k.icon} size={18} /></span>
            <span class="stack-xs grow" style={{ minWidth: 0 }}>
              <span class="strong clip">{c.name}</span>
              <span class="tiny semi" style={{ color: late ? 'var(--vit-ink)' : 'var(--muted)' }}>{dueText(c, i, today)} · {ccur(c, i.nextAmount)}</span>
              <Bar value={i.pct} size="sm" color="var(--finanzas)" label={`Pagado ${Math.round(i.pct * 100)} %`} />
            </span>
            <span class="stack-xs" style={{ alignItems: 'flex-end', gap: 0 }}>
              <span class="strong tab-num" style={{ color: 'var(--vit-ink)', whiteSpace: 'nowrap' }}>{ccur(c, i.balance)}</span>
              <span class="tiny muted semi">{i.nLeft != null ? `${i.nLeft} cuotas` : 'revisa la cuota'}</span>
            </span>
          </button>
        );
      })}
      {open.length > 0 && (
        <div class="between-c" style={{ padding: '10px 0 12px', gap: 10 }}>
          <span class="small semi muted">Pagas {whole(t.monthly)} al mes</span>
          {t.late > 0 && <span class="chip sm tone-vit">{plural(t.late, 'atrasado', 'atrasados')}</span>}
        </div>
      )}
      {closed.length > 0 && (
        <button type="button" class="lrow" style={{ justifyContent: 'center', fontWeight: 700 }} aria-expanded={showClosed ? 'true' : 'false'} onClick={() => setShowClosed(!showClosed)}>
          {showClosed ? 'Ocultar los terminados' : `Terminados · ${closed.length}`}
        </button>
      )}
      {showClosed && closed.map(({ c }) => (
        <button key={c.id} type="button" class="lrow" style={{ minHeight: 54 }} onClick={() => setSheet({ kind: 'credit', id: c.id })}>
          <span class="tile sm" style={{ background: 'var(--soft)' }}><Icon name="check" size={18} /></span>
          <span class="stack-xs grow" style={{ minWidth: 0 }}><span class="semi clip">{c.name}</span><span class="tiny muted semi">{ccur(c, c.principal)} · {dueText(c, { next: null }, today)}</span></span>
        </button>
      ))}
      <button type="button" class="lrow" style={{ justifyContent: 'center', fontWeight: 700, color: 'var(--ink)' }} onClick={() => setSheet({ kind: 'credit', id: null, sim: true })}>
        <Icon name="percent" size={18} />¿Cuánto me costaría un préstamo?
      </button>
    </section>
  );
}

// ---------- Hoja: nuevo / detalle ----------

export function CreditSheet({ s, id, sim = false, onClose, onOpenTx = null, onPlan = null }) {
  const today = s.energy.day;
  const c = id ? creditOf(s, id) : null;
  const [edit, setEdit] = useState(!c);
  if (c && !edit) return <CreditDetail s={s} c={c} today={today} onClose={onClose} onEdit={() => setEdit(true)} onOpenTx={onOpenTx} onPlan={onPlan} />;
  return <CreditForm s={s} c={c} sim={sim} today={today} onClose={c ? () => setEdit(false) : onClose} onDone={onClose} />;
}

// El préstamo que se va armando en el formulario, para ver la cuota y el costo antes de guardar.
function draftOf(f) {
  const principal = num(f.principal);
  const base = { principal, apr: num(f.apr), term: Math.max(1, Math.round(num(f.term)) || 0), freq: f.freq, fee: num(f.fee), currency: f.currency };
  const payment = num(f.payment) || (principal > 0 && base.term > 0 ? suggestPayment(base) : 0);
  return { ...base, payment, first: f.first, start: f.start, pays: [], syncs: [], reduce: 'plazo', prepay: 0, remind: 3 };
}

function CreditForm({ s, c, sim, today, onClose, onDone }) {
  const [name, setName] = useState(c ? c.name : '');
  const [kind, setKind] = useState(c ? c.kind : 'personal');
  const [lender, setLender] = useState(c ? c.lender : '');
  const [currency, setCurrency] = useState(c ? c.currency : 'DOP');
  const [principal, setPrincipal] = useState(c ? String(c.principal) : '');
  const [apr, setApr] = useState(c ? String(c.apr || '') : '');
  const [term, setTerm] = useState(c ? String(c.term) : '12');
  const [freq, setFreq] = useState(c ? c.freq : 'mes');
  const [start, setStart] = useState(c ? c.start : today);
  const [first, setFirst] = useState(c ? c.first : dueDateOf({ freq: 'mes', first: today }, 2));
  const [fee, setFee] = useState(c && c.fee ? String(c.fee) : '');
  const [payment, setPayment] = useState(c ? String(c.payment) : '');
  const [remind, setRemind] = useState(c ? c.remind : 3);
  const [prepay, setPrepay] = useState(c && c.prepay ? String(c.prepay) : '');
  const [reduce, setReduce] = useState(c ? c.reduce : 'plazo');
  const [note, setNote] = useState(c ? c.note : '');
  const [price, setPrice] = useState(c && c.price ? String(c.price) : '');
  const [down, setDown] = useState(c && c.down ? String(c.down) : '');
  const [upfront, setUpfront] = useState(c && c.upfront ? String(c.upfront) : '');
  const [recDown, setRecDown] = useState(true);
  const [recUp, setRecUp] = useState(false);
  const [recAsset, setRecAsset] = useState(true);
  const [mode, setMode] = useState(c ? 'edit' : sim ? 'sim' : 'new'); // new: lo acabo de recibir · old: ya lo vengo pagando · sim: solo calcular
  const [paidN, setPaidN] = useState('');
  const [bal, setBal] = useState('');
  const [recv, setRecv] = useState(true);
  const [account, setAccount] = useState(firstMoneyAcc(s));
  const [tab, setTab] = useState(false);

  const f = { principal, apr, term, freq, fee, payment, currency, first, start };
  const d = draftOf(f);
  const proj = d.principal > 0 && d.term > 0 ? creditProject({ ...d, closed: null }) : null;
  const ok = d.principal > 0 && d.term >= 1 && d.payment > 0;
  const nameOk = name.trim().length >= 2;
  const priceN = num(price);
  const downN = num(down);
  const onBuy = (np, nd) => { if (np > nd && nd >= 0 && (np > 0)) setPrincipal(String(Math.round((np - nd) * 100) / 100)); };
  const toDate = (v, fallback) => v || fallback;
  const onFreq = (k) => { setFreq(k); if (!c) setFirst(dueDateOf({ freq: k, first: start }, 2)); };
  const onStart = (v) => { const x = v || today; setStart(x); if (!c) setFirst(dueDateOf({ freq, first: x }, 2)); };
  const oldN = Math.max(0, Math.round(num(paidN)));
  const guessBal = mode === 'old' && ok ? scheduledBalance({ ...d, first: toDate(first, today) }, oldN) : 0;
  const saveOk = ok && nameOk && (mode !== 'old' || (oldN >= 0 && (num(bal) > 0 || guessBal > 0))) && (mode !== 'new' || !recv || account);

  const save = () => {
    if (!saveOk) return;
    const p = { name, kind, lender, currency, principal: d.principal, apr: d.apr, term: d.term, freq, start: toDate(start, today), first: toDate(first, today), fee: d.fee, payment: num(payment), remind, prepay: num(prepay), reduce, note, price: priceN, down: downN, upfront: num(upfront) };
    if (c) {
      act((st) => updateCredit(st, c.id, p));
      toast('Préstamo actualizado', 'check');
      onClose();
      return;
    }
    const made = act((st, t, ev) => {
      const k = addCredit(st, {
        ...p, received: mode === 'new' && recv ? account : '', downAccount: mode === 'new' && recDown && downN > 0 ? account : '',
        upfrontAccount: mode === 'new' && recUp && num(upfront) > 0 ? account : '', asset: recAsset && priceN > 0 && mode !== 'sim',
        assetKind: kind === 'vehiculo' ? 'vehiculo' : kind === 'hipoteca' ? 'casa' : kind === 'negocio' ? 'negocio' : 'otro', assetName: name,
      }, t, ev);
      if (k && mode === 'old') syncCredit(st, k.id, num(bal) > 0 ? num(bal) : guessBal, t, t, { paid: oldN });
      return k;
    });
    toast(`Anotado: ${name.trim()}`, 'check');
    onDone();
    return made;
  };

  const titleTxt = c ? 'Editar préstamo' : sim ? 'Cuánto cuesta un préstamo' : 'Nuevo préstamo';
  return (
    <Sheet onClose={onClose} label={titleTxt}>
      <SheetHead title={titleTxt} onClose={onClose} />
      {!c && (
        <div class="seg" role="tablist" aria-label="Cómo está el préstamo">
          <button type="button" role="tab" aria-selected={mode === 'sim' ? 'true' : 'false'} onClick={() => setMode('sim')}>Calcular</button>
          <button type="button" role="tab" aria-selected={mode === 'new' ? 'true' : 'false'} onClick={() => setMode('new')}>Nuevo</button>
          <button type="button" role="tab" aria-selected={mode === 'old' ? 'true' : 'false'} onClick={() => setMode('old')}>Ya lo pago</button>
        </div>
      )}
      {mode !== 'sim' && (
        <>
          <div class="field"><label for="cname">Nombre</label><input id="cname" class="input" value={name} maxLength={50} placeholder="Ej. Préstamo del carro" onInput={(e) => setName(e.currentTarget.value)} /></div>
          <div class="chips" role="group" aria-label="Tipo de préstamo">
            {CREDIT_KINDS.map((k) => <TChip key={k.key} sm icon={k.icon} on={kind === k.key} onClick={() => setKind(k.key)}>{k.label}</TChip>)}
          </div>
          <div class="field"><label for="clender">¿Quién te lo dio? (opcional)</label><input id="clender" class="input" value={lender} maxLength={50} placeholder="Ej. Banco Popular" onInput={(e) => setLender(e.currentTarget.value)} /></div>
        </>
      )}
      <CurrencyIn id="cprin" label={mode === 'old' ? 'Monto original del préstamo' : 'Monto que te prestan'} currency={currency} setCurrency={setCurrency} value={principal} setValue={setPrincipal} autoFocus={mode === 'sim'} />
      <details class="panel" open={!!(priceN || downN)}>
        <summary class="semi" style={{ cursor: 'pointer', minHeight: 40 }}>¿Es para comprar algo? Precio e inicial</summary>
        <div class="stack-sm" style={{ paddingTop: 10 }}>
          <div class="grid2">
            <div class="field"><label for="cprice">Precio de lo que compras</label><input id="cprice" class="input" inputMode="decimal" value={price} placeholder="Ej. 1,200,000" onInput={(e) => { setPrice(e.currentTarget.value); onBuy(num(e.currentTarget.value), downN); }} /></div>
            <div class="field"><label for="cdown">Inicial que diste</label><input id="cdown" class="input" inputMode="decimal" value={down} placeholder="Ej. 300,000" onInput={(e) => { setDown(e.currentTarget.value); onBuy(priceN, num(e.currentTarget.value)); }} /></div>
          </div>
          {priceN > 0 && priceN > downN && <span class="tiny muted">Financias {cur(priceN - downN, currency)} ({Math.round(((priceN - downN) / priceN) * 100)} % del precio). Puse ese monto arriba; puedes cambiarlo.</span>}
          {mode === 'new' && downN > 0 && s.money.accounts.some((a) => !isCard(a) && !a.hidden) && (
            <label class="between-c" style={{ cursor: 'pointer', gap: 12 }}>
              <span class="stack-xs"><span class="semi">Anotar el inicial como gasto</span><span class="small muted">Sale de la cuenta que elegiste arriba. No cuenta en tus gastos del mes. Si ya lo anotaste, déjalo apagado: después lo vinculas.</span></span>
              <Switch checked={recDown} onChange={setRecDown} label="Anotar el inicial como gasto" />
            </label>
          )}
          {mode !== 'sim' && priceN > 0 && (
            <label class="between-c" style={{ cursor: 'pointer', gap: 12 }}>
              <span class="stack-xs"><span class="semi">Guardar lo que compraste como un bien</span><span class="small muted">Suma a tu patrimonio por el precio y baja con lo que debes.</span></span>
              <Switch checked={recAsset} onChange={setRecAsset} label="Guardar como bien" />
            </label>
          )}
        </div>
      </details>
      <div class="grid2">
        <div class="field"><label for="capr">Interés anual (%)</label><input id="capr" class="input" inputMode="decimal" value={apr} onInput={(e) => setApr(e.currentTarget.value)} placeholder="Ej. 18" /></div>
        <div class="field"><label for="cterm">Número de cuotas</label><input id="cterm" class="input" inputMode="numeric" value={term} onInput={(e) => setTerm(e.currentTarget.value)} /></div>
      </div>
      <div class="chips" role="group" aria-label="Cada cuánto pagas">
        {CREDIT_FREQS.map((x) => <TChip key={x.key} sm on={freq === x.key} onClick={() => onFreq(x.key)}>{x.label}</TChip>)}
      </div>
      <div class="field"><label for="cfee">Seguro y cargos por cuota (opcional)</label><input id="cfee" class="input" inputMode="decimal" value={fee} onInput={(e) => setFee(e.currentTarget.value)} placeholder="0" /></div>

      {proj && ok && (
        <section class="panel stack-sm" aria-label="Lo que te cuesta" aria-live="polite">
          <div class="between-c"><span class="small semi muted">Cuota {freqOf(freq).short === 'mes' ? 'mensual' : `cada ${freqOf(freq).short}`}</span><span class="h2 tab-num">{cur(d.payment + d.fee, currency)}</span></div>
          {proj.ok ? (
            <>
              <div class="between-c"><span class="small semi muted">Intereses en total</span><span class="strong tab-num" style={{ color: 'var(--vit-ink)' }}>{cur(proj.interest, currency)}</span></div>
              <div class="between-c"><span class="small semi muted">Pagarías en total</span><span class="strong tab-num">{cur(proj.total, currency)}</span></div>
              <span class="tiny muted">Por cada {cur(100, currency)} que te prestan, devuelves {cur(Math.round((proj.total / d.principal) * 100), currency)}.</span>
            </>
          ) : <span class="small" style={{ color: 'var(--vit-ink)' }}>Con esa cuota no alcanzas ni a pagar los intereses. Súbela o baja el monto.</span>}
        </section>
      )}

      {mode === 'sim' && (
        <>
          <p class="small muted">Esto es solo un cálculo: no se guarda nada.</p>
          {ok && proj && proj.ok && <button type="button" class="btn block" onClick={() => { setMode('new'); }}><Icon name="plus" size={18} />Anotarlo como préstamo</button>}
        </>
      )}

      {mode !== 'sim' && (
        <>
          <div class="grid2">
            <div class="field"><label for="cstart">Fecha del desembolso</label><input id="cstart" type="date" class="input" value={start} max={mode === 'new' ? today : undefined} onInput={(e) => onStart(e.currentTarget.value)} /></div>
            <div class="field"><label for="cfirst">Primera cuota</label><input id="cfirst" type="date" class="input" value={first} min={start} onInput={(e) => setFirst(e.currentTarget.value)} /></div>
          </div>
          {mode === 'old' && (
            <section class="panel stack-sm" aria-label="Dónde vas">
              <span class="small muted">Dime dónde vas y arranco desde ahí, sin repasar cuota por cuota.</span>
              <div class="grid2">
                <div class="field"><label for="cpaidn">Cuotas ya pagadas</label><input id="cpaidn" class="input" inputMode="numeric" value={paidN} onInput={(e) => setPaidN(e.currentTarget.value)} placeholder={String(dueCount({ ...d, first: toDate(first, today) }, today))} /></div>
                <div class="field"><label for="cbal">Saldo que dice el banco</label><input id="cbal" class="input" inputMode="decimal" value={bal} onInput={(e) => setBal(e.currentTarget.value)} placeholder={guessBal ? String(Math.round(guessBal)) : '0'} /></div>
              </div>
              {!num(bal) && guessBal > 0 && <span class="tiny muted">Sin el saldo del banco, uso el de la tabla: {cur(Math.round(guessBal), currency)}.</span>}
            </section>
          )}
          {mode === 'new' && s.money.accounts.some((a) => !isCard(a) && !a.hidden) && (
            <section class="panel stack-sm">
              <label class="between-c" style={{ cursor: 'pointer', gap: 12 }}>
                <span class="stack-xs"><span class="semi">El dinero entró a una cuenta</span><span class="small muted">Lo anoto como entrada para que tu saldo cuadre. No cuenta como ingreso.</span></span>
                <Switch checked={recv} onChange={setRecv} label="Anotar la entrada del dinero" />
              </label>
              {recv && <AccountChips s={s} value={account} onChange={setAccount} label="Cuenta a donde entró" />}
            </section>
          )}
          <details class="panel">
            <summary class="semi" style={{ cursor: 'pointer', minHeight: 40 }}>Más opciones</summary>
            <div class="stack-sm" style={{ paddingTop: 10 }}>
              <div class="field"><label for="cpay">Cuota exacta del banco (sin seguro)</label><input id="cpay" class="input" inputMode="decimal" value={payment} onInput={(e) => setPayment(e.currentTarget.value)} placeholder={d.payment ? String(d.payment) : 'La calculo yo'} /><span class="tiny muted">Si tu banco redondea distinto, pon la cuota que te dieron.</span></div>
              <div class="field"><label for="cupfront">Gastos de apertura (comisión, legal, tasación)</label><input id="cupfront" class="input" inputMode="decimal" value={upfront} onInput={(e) => setUpfront(e.currentTarget.value)} placeholder="0" /><span class="tiny muted">Lo que pagaste una sola vez al sacar el préstamo. Cuenta en el costo total.</span></div>
              {mode === 'new' && num(upfront) > 0 && (
                <label class="between-c" style={{ cursor: 'pointer', gap: 12 }}><span class="semi">Anotarlo como gasto</span><Switch checked={recUp} onChange={setRecUp} label="Anotar los gastos de apertura" /></label>
              )}
              <div class="field"><label for="cprepay">Cargo por pagar antes de tiempo (%)</label><input id="cprepay" class="input" inputMode="decimal" value={prepay} onInput={(e) => setPrepay(e.currentTarget.value)} placeholder="0" /></div>
              <div class="stack-sm"><span class="label">Cuando abonas de más, ¿qué baja?</span>
                <div class="chips"><TChip sm on={reduce === 'plazo'} onClick={() => setReduce('plazo')}>Termino antes</TChip><TChip sm on={reduce === 'cuota'} onClick={() => setReduce('cuota')}>Baja la cuota</TChip></div>
              </div>
              <div class="stack-sm"><span class="label">Avisarme antes de cada cuota</span>
                <div class="chips">{[0, 1, 3, 5, 7].map((n) => <TChip key={n} sm on={remind === n} onClick={() => setRemind(n)}>{n === 0 ? 'El mismo día' : n === 1 ? '1 día' : `${n} días`}</TChip>)}</div>
              </div>
              <div class="field"><label for="cnote">Nota (opcional)</label><input id="cnote" class="input" value={note} maxLength={200} onInput={(e) => setNote(e.currentTarget.value)} /></div>
            </div>
          </details>
          {proj && proj.ok && (
            <>
              <button type="button" class="link-btn" style={{ alignSelf: 'flex-start' }} aria-expanded={tab ? 'true' : 'false'} onClick={() => setTab(!tab)}><Icon name="list" size={16} />{tab ? 'Ocultar la tabla de pagos' : 'Ver la tabla de pagos'}</button>
              {tab && <AmortTable rows={proj.rows.slice(0, 60)} currency={currency} />}
            </>
          )}
          <button type="button" class="btn block" disabled={!saveOk} onClick={save}><Icon name="check" size={20} />Guardar</button>
        </>
      )}
    </Sheet>
  );
}

function AmortTable({ rows, currency, from = 0 }) {
  return (
    <div class="card flush" style={{ overflowX: 'auto' }} role="region" aria-label="Tabla de pagos" tabIndex={0}>
      <table class="tab-num" style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', minWidth: 420 }}>
        <thead><tr style={{ textAlign: 'right', color: 'var(--muted)' }}><th scope="col" style={{ textAlign: 'left', padding: '8px 6px' }}>#</th><th scope="col" style={{ textAlign: 'left' }}>Fecha</th><th scope="col">Cuota</th><th scope="col">Interés</th><th scope="col">Capital</th><th scope="col" style={{ paddingRight: 6 }}>Debes</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.n + from} style={{ textAlign: 'right', borderTop: '1px solid var(--line)' }}>
              <td style={{ textAlign: 'left', padding: '7px 6px' }}>{r.n}</td><td style={{ textAlign: 'left' }}>{fmtShort(r.date)}</td>
              <td>{Math.round(r.payment + r.fee).toLocaleString('en-US')}</td><td>{Math.round(r.interest).toLocaleString('en-US')}</td><td>{Math.round(r.principal).toLocaleString('en-US')}</td><td style={{ paddingRight: 6 }}>{Math.round(r.balance).toLocaleString('en-US')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Detalle ----------

function CreditDetail({ s, c, today, onClose, onEdit, onOpenTx, onPlan }) {
  const i = creditInfo(c, today);
  const [panel, setPanel] = useState(null); // 'cuota' | 'abono' | 'sync' | 'sim' | 'tabla'
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState(today);
  const [withAcc, setWithAcc] = useState(s.money.accounts.some((a) => !isCard(a) && a.base));
  const [account, setAccount] = useState(firstMoneyAcc(s));
  const [syncBal, setSyncBal] = useState('');
  const [syncN, setSyncN] = useState('');
  const [extra, setExtra] = useState('');
  const [lump, setLump] = useState('');
  const k = creditKind(c.kind);
  const rate = fxRate(s, today);
  const matches = i.open ? creditPlanMatches(s, c) : [];

  const open = (p) => {
    setPanel(panel === p ? null : p);
    if (p === 'cuota') setAmount(String(i.nextAmount));
    if (p === 'abono') setAmount('');
    if (p === 'sync') { setSyncBal(String(i.balance)); setSyncN(String(i.nPaid)); }
    setDay(today);
  };
  const n = num(amount);
  const doPay = (kind) => {
    if (!(n > 0)) return;
    const ev = [];
    act((st, t, e) => { payCredit(st, c.id, { amount: n, kind, day, account: withAcc ? account : '' }, t, e); ev.push(...e); });
    const fin = ev.some((e) => e.type === 'creditDone');
    setPanel(null);
    if (fin) onClose();
  };
  const w = panel === 'sim' && (num(extra) > 0 || num(lump) > 0) ? creditWhatIf(c, { extra: num(extra), lump: num(lump) }) : null;
  const rows = i.ledger.rows;
  const cands = c.closed ? [] : creditCandidates(s, c.id, today);
  const [skip, setSkip] = useState({});
  const picked = cands.filter((x) => !skip[x.tx.id]);
  const link = () => {
    const res = act((st, t, e) => linkCreditTxs(st, c.id, picked.map((x) => ({ tx: x.tx.id, kind: x.kind })), t, e));
    const bits = [res.cuotas && plural(res.cuotas, 'cuota', 'cuotas'), res.abonos && plural(res.abonos, 'abono', 'abonos'), res.down && 'el inicial'].filter(Boolean);
    toast(bits.length ? `Vinculé ${bits.join(', ')}` : 'No pude vincular esos gastos', bits.length ? 'check' : 'info');
  };
  const buy = i.buy;

  return (
    <Sheet onClose={onClose} label={`Préstamo: ${c.name}`}>
      <SheetHead title={c.name} onClose={onClose} />
      <section class="stack-sm">
        <span class="small semi muted">{c.closed ? 'Terminado' : 'Debes'}{c.lender ? ` · ${c.lender}` : ''} · {k.label}</span>
        <span class="display-num tab-num" style={{ fontSize: 34, color: c.closed ? 'var(--ink)' : 'var(--vit-ink)' }}>{ccur(c, c.closed ? c.principal : i.balance)}</span>
        {c.currency === 'USD' && !c.closed && <span class="tiny muted semi">≈ {whole(toDOP(i.balance, 'USD', rate))}</span>}
        <Bar value={i.pct} size="lg" color="var(--finanzas)" label={`Capital pagado ${Math.round(i.pct * 100)} %`} />
        <span class="small muted">Pediste {ccur(c, c.principal)} al {c.apr}% anual · {plural(c.term, 'cuota', 'cuotas')} {freqOf(c.freq).short === 'mes' ? 'mensuales' : `cada ${freqOf(c.freq).short}`}. Llevas {i.nPaid} pagadas.</span>
        {!c.closed && <span class="small semi" style={{ color: i.late ? 'var(--vit-ink)' : 'var(--muted)' }}>{dueText(c, i, today)}{i.next ? ` · ${ccur(c, i.nextAmount)}` : ''}</span>}
        {i.open && i.ok === false && <div class="note tone-vit" role="alert"><Icon name="info" size={18} /><span>Con esta cuota el saldo no baja. Revisa la cuota o el interés.</span></div>}
      </section>

      {cands.length > 0 && (
        <section class="panel stack-sm" aria-label="Gastos que parecen de este préstamo">
          <span class="semi">Encontré {plural(cands.length, 'gasto', 'gastos')} que {cands.length === 1 ? 'parece' : 'parecen'} de este préstamo</span>
          <span class="small muted">Ya los habías anotado. Si los vinculas, el préstamo los cuenta como pagados y no se duplican. Quita los que no sean.</span>
          {cands.map((x) => (
            <label key={x.tx.id} class="lrow" style={{ minHeight: 52, cursor: 'pointer' }}>
              <input type="checkbox" checked={!skip[x.tx.id]} onChange={() => setSkip({ ...skip, [x.tx.id]: !skip[x.tx.id] })} aria-label={`Vincular ${x.tx.merchant}`} />
              <span class="stack-xs grow" style={{ minWidth: 0, gap: 0 }}><span class="semi clip">{x.tx.merchant}</span><span class="tiny muted semi">{fmtShort(x.day)} · {x.kind === 'inicial' ? 'Inicial' : x.kind === 'abono' ? 'Abono a capital' : 'Cuota'}</span></span>
              <span class="strong tab-num">{ccur(c, x.amount)}</span>
            </label>
          ))}
          <button type="button" class="btn sm" style={{ alignSelf: 'flex-start' }} disabled={!picked.length} onClick={link}><Icon name="check" size={17} />Vincular {picked.length}</button>
        </section>
      )}
      {buy && (buy.price > 0 || buy.down > 0 || buy.upfront > 0) && (
        <section class="card flush" aria-label="Lo que costó en total">
          {buy.price > 0 && <div class="lrow" style={{ minHeight: 48 }}><span class="grow semi muted">Precio de lo que compraste</span><span class="strong tab-num">{ccur(c, buy.price)}</span></div>}
          {buy.down > 0 && (
            <div class="lrow" style={{ minHeight: 48 }}><span class="stack-xs grow" style={{ gap: 0 }}><span class="semi muted">Inicial</span><span class="tiny muted">{c.downTx ? 'Vinculado a un gasto tuyo' : 'No está anotado como gasto'}</span></span><span class="strong tab-num">{ccur(c, buy.down)}</span></div>
          )}
          {buy.down > 0 && !c.downTx && !c.closed && s.money.accounts.some((a) => !isCard(a) && !a.hidden) && (
            <div class="stack-sm" style={{ padding: '4px 0 12px' }}>
              <AccountChips s={s} value={account} onChange={setAccount} label="¿De qué cuenta salió el inicial?" />
              <button type="button" class="link-btn" style={{ alignSelf: 'flex-start', minHeight: 36 }} onClick={() => { act((st, t, e) => recordDown(st, c.id, account, t, e)); toast('Anoté el inicial como gasto (no cuenta en el mes)', 'check'); }}>Anotar el inicial como gasto</button>
            </div>
          )}
          {buy.upfront > 0 && <div class="lrow" style={{ minHeight: 48 }}><span class="grow semi muted">Gastos de apertura</span><span class="strong tab-num">{ccur(c, buy.upfront)}</span></div>}
          <div class="lrow" style={{ minHeight: 48 }}><span class="stack-xs grow" style={{ gap: 0 }}><span class="semi muted">Costo total de comprarlo así</span><span class="tiny muted">Inicial + todas las cuotas + cargos{buy.price > 0 && buy.extra > 0 ? ` · ${ccur(c, buy.extra)} más que el precio` : ''}</span></span><span class="strong tab-num">{ccur(c, buy.total)}</span></div>
        </section>
      )}
      {i.open && (
        <section class="card flush" aria-label="Lo que falta">
          <div class="lrow" style={{ minHeight: 48 }}><span class="grow semi muted">Termina</span><span class="strong">{endText(i.end)}</span></div>
          <div class="lrow" style={{ minHeight: 48 }}><span class="grow semi muted">Cuotas que faltan</span><span class="strong tab-num">{i.nLeft != null ? i.nLeft : '—'}</span></div>
          <div class="lrow" style={{ minHeight: 48 }}><span class="grow semi muted">Intereses que faltan</span><span class="strong tab-num" style={{ color: 'var(--vit-ink)' }}>{ccur(c, i.interestLeft)}</span></div>
          <div class="lrow" style={{ minHeight: 48 }}><span class="grow semi muted">Intereses pagados hasta hoy</span><span class="strong tab-num">{ccur(c, i.paidInterest)}</span></div>
          {c.fee > 0 && <div class="lrow" style={{ minHeight: 48 }}><span class="grow semi muted">Seguro y cargos pagados</span><span class="strong tab-num">{ccur(c, i.paidFee)}</span></div>}
          <div class="lrow" style={{ minHeight: 48 }}><span class="stack-xs grow" style={{ gap: 0 }}><span class="semi muted">Para saldarlo hoy</span><span class="tiny muted">Saldo + intereses corridos{c.prepay ? ` + ${c.prepay}% por cancelar` : ''}</span></span><span class="strong tab-num">{ccur(c, i.payoff.total)}</span></div>
        </section>
      )}
      {!i.open && (
        <section class="card flush" aria-label="Cuánto costó">
          <div class="lrow" style={{ minHeight: 48 }}><span class="grow semi muted">Pagaste en total</span><span class="strong tab-num">{ccur(c, i.paid)}</span></div>
          <div class="lrow" style={{ minHeight: 48 }}><span class="grow semi muted">De eso, en intereses</span><span class="strong tab-num" style={{ color: 'var(--vit-ink)' }}>{ccur(c, i.paidInterest)}</span></div>
        </section>
      )}

      {matches.length > 0 && (
        <div class="note tone-xp"><Icon name="info" size={18} /><span class="grow">Ya tienes un pago fijo parecido («{matches[0].name}»). Si lo dejas, la cuota sale dos veces en Por pagar.</span>{onPlan && <button type="button" class="link-btn" onClick={() => onPlan(matches[0].id)}>Verlo</button>}</div>
      )}

      {i.open && (
        <div class="grid2">
          <button type="button" class={`btn${panel === 'cuota' ? '' : ''}`} onClick={() => open('cuota')} aria-expanded={panel === 'cuota' ? 'true' : 'false'}><Icon name="coins" size={20} />Pagar cuota</button>
          <button type="button" class="btn soft" onClick={() => open('abono')} aria-expanded={panel === 'abono' ? 'true' : 'false'}><Icon name="plus" size={20} />Abonar</button>
        </div>
      )}

      {(panel === 'cuota' || panel === 'abono') && (
        <section class="panel stack-sm" aria-label={panel === 'cuota' ? 'Pagar una cuota' : 'Abonar a capital'}>
          {panel === 'abono' && <span class="small muted">Un abono va entero al capital: debes menos y pagas menos intereses.</span>}
          <div class="grid2">
            <div class="field"><label for="ppamt">{panel === 'cuota' ? 'Cuota' : 'Abono'} ({c.currency === 'USD' ? 'US$' : 'RD$'})</label><input id="ppamt" class="input" inputMode="decimal" value={amount} onInput={(e) => setAmount(e.currentTarget.value)} ref={focusOnMount} /></div>
            <div class="field"><label for="ppday">Fecha</label><input id="ppday" type="date" class="input" value={day} max={today} min={c.start} onInput={(e) => setDay(e.currentTarget.value || today)} /></div>
          </div>
          {s.money.accounts.some((a) => !isCard(a) && !a.hidden) && (
            <>
              <label class="between-c" style={{ cursor: 'pointer', gap: 12 }}>
                <span class="small semi">Salió de una cuenta</span>
                <Switch checked={withAcc} onChange={setWithAcc} label="Anotar la salida del dinero" />
              </label>
              {withAcc && <AccountChips s={s} value={account} onChange={setAccount} label="Cuenta de donde salió" />}
            </>
          )}
          <div class="row" style={{ gap: 8 }}>
            <button type="button" class="btn sm ghost grow" onClick={() => setPanel(null)}>Cancelar</button>
            <button type="button" class="btn sm grow" disabled={!(n > 0) || (withAcc && !account)} onClick={() => doPay(panel)}><Icon name="check" size={18} />Guardar</button>
          </div>
        </section>
      )}

      {i.open && (
        <section class="card flush" aria-label="Si abonas de más">
          <button type="button" class="lrow" style={{ minHeight: 56 }} onClick={() => open('sim')} aria-expanded={panel === 'sim' ? 'true' : 'false'}>
            <span class="tile sm" style={{ background: 'var(--soft)' }}><Icon name="trend" size={18} /></span>
            <span class="stack-xs grow"><span class="strong">¿Y si abono de más?</span><span class="tiny muted semi">Cuánto antes terminas y cuánto ahorras</span></span><Icon name={panel === 'sim' ? 'up' : 'down'} size={16} />
          </button>
          {panel === 'sim' && (
            <div class="stack-sm" style={{ padding: '4px 0 14px' }}>
              <div class="grid2">
                <div class="field"><label for="wextra">Extra en cada cuota</label><input id="wextra" class="input" inputMode="decimal" value={extra} onInput={(e) => setExtra(e.currentTarget.value)} placeholder="Ej. 2000" /></div>
                <div class="field"><label for="wlump">Un abono ahora</label><input id="wlump" class="input" inputMode="decimal" value={lump} onInput={(e) => setLump(e.currentTarget.value)} placeholder="Ej. 20000" /></div>
              </div>
              {w && (w.ok ? (
                <div class="panel stack-xs" aria-live="polite">
                  <span class="strong">Terminas {w.cuotas > 0 ? `${plural(w.cuotas, 'cuota', 'cuotas')} antes` : 'igual'}, el {endText(w.plan.end)}.</span>
                  <span class="small">Te ahorras <b style={{ color: 'var(--good-ink)' }}>{ccur(c, w.interest)}</b> en intereses.</span>
                </div>
              ) : <span class="small" style={{ color: 'var(--vit-ink)' }}>Con esos números el préstamo no termina.</span>)}
            </div>
          )}
        </section>
      )}

      {i.open && (
        <section class="card flush" aria-label="Cuadrar con el banco">
          <button type="button" class="lrow" style={{ minHeight: 56 }} onClick={() => open('sync')} aria-expanded={panel === 'sync' ? 'true' : 'false'}>
            <span class="tile sm" style={{ background: 'var(--soft)' }}><Icon name="bank" size={18} /></span>
            <span class="stack-xs grow"><span class="strong">Cuadrar con el banco</span><span class="tiny muted semi">Si el saldo del banco es otro, lo pongo igual</span></span><Icon name={panel === 'sync' ? 'up' : 'down'} size={16} />
          </button>
          {panel === 'sync' && (
            <div class="stack-sm" style={{ padding: '4px 0 14px' }}>
              <div class="grid2">
                <div class="field"><label for="sbal">Saldo según el banco</label><input id="sbal" class="input" inputMode="decimal" value={syncBal} onInput={(e) => setSyncBal(e.currentTarget.value)} /></div>
                <div class="field"><label for="sn">Cuotas pagadas</label><input id="sn" class="input" inputMode="numeric" value={syncN} onInput={(e) => setSyncN(e.currentTarget.value)} /></div>
              </div>
              <button type="button" class="btn sm" disabled={!(num(syncBal) >= 0) || syncBal === ''} onClick={() => {
                act((st, t) => syncCredit(st, c.id, num(syncBal), t, t, { paid: syncN === '' ? null : Math.round(num(syncN)) }));
                toast('Cuadrado con el banco', 'check');
                setPanel(null);
              }}><Icon name="check" size={18} />Cuadrar</button>
            </div>
          )}
        </section>
      )}

      {rows.length > 0 && (
        <section class="card flush" aria-label="Historial de pagos">
          <div style={{ padding: '12px 0 2px' }}><h3 class="eyebrow">Lo que has pagado</h3></div>
          {[...rows].reverse().map((r) => r.type === 'sync' ? (
            <div key={r.id} class="lrow" style={{ minHeight: 50 }}>
              <span class="stack-xs grow"><span class="semi">Cuadrado con el banco</span><span class="tiny muted semi">{fmtShort(r.day)} · saldo {ccur(c, r.balance)}</span></span>
              <button type="button" class="icon-btn plain" aria-label={`Quitar el cuadre del ${fmtShort(r.day)}`} onClick={() => act((st) => removeSync(st, c.id, r.id))}><Icon name="trash" size={17} /></button>
            </div>
          ) : (
            <div key={r.id} class="lrow" style={{ minHeight: 56 }}>
              <span class="stack-xs grow" style={{ minWidth: 0 }}>
                <span class="semi">{r.type === 'abono' ? 'Abono a capital' : `Cuota ${r.n}`} · {fmtShort(r.day)}</span>
                <span class="tiny muted semi">{r.type === 'abono' ? `Debes ${ccur(c, r.balance)}` : `Interés ${ccur(c, r.interest)}${r.fee ? ` · cargos ${ccur(c, r.fee)}` : ''} · capital ${ccur(c, r.principal)}`}</span>
              </span>
              <span class="strong tab-num">{ccur(c, r.amount)}</span>
              {r.tx && onOpenTx && <button type="button" class="icon-btn plain" aria-label="Ver el movimiento" onClick={() => { const t = s.money.tx.find((x) => x.id === r.tx); if (t) onOpenTx(t); }}><Icon name="receipt" size={17} /></button>}
              <button type="button" class="icon-btn plain" aria-label={`Quitar el pago del ${fmtShort(r.day)}`} onClick={async () => {
                if (!(await ask(r.tx ? '¿Quitar este pago? También se borra su movimiento.' : '¿Quitar este pago?', { ok: 'Quitar', danger: true }))) return;
                act((st) => removeCreditPay(st, c.id, r.id));
              }}><Icon name="trash" size={17} /></button>
            </div>
          ))}
        </section>
      )}

      {i.proj.ok && i.proj.rows.length > 0 && (
        <section class="stack-sm">
          <button type="button" class="link-btn" style={{ alignSelf: 'flex-start' }} aria-expanded={panel === 'tabla' ? 'true' : 'false'} onClick={() => open('tabla')}><Icon name="list" size={16} />{panel === 'tabla' ? 'Ocultar la tabla de pagos' : 'Ver lo que falta, cuota por cuota'}</button>
          {panel === 'tabla' && <AmortTable rows={i.proj.rows.slice(0, 120)} currency={c.currency} />}
        </section>
      )}

      <div class="row wrap" style={{ gap: 14, justifyContent: 'center' }}>
        <button type="button" class="link-btn" onClick={onEdit}><Icon name="edit" size={16} />Editar</button>
        {i.open && <button type="button" class="link-btn" onClick={async () => {
          if (!(await ask(`¿Ya terminaste de pagar «${c.name}»? Se cierra aunque el cálculo diga que falta.`, { ok: 'Sí, ya lo pagué' }))) return;
          const ev = [];
          act((st, t, e) => { closeCredit(st, c.id, t, t, e); ev.push(...e); });
          toast(`¡Terminaste de pagar ${c.name}! +100 XP`, 'trophy');
        }}><Icon name="check" size={16} />Ya lo terminé de pagar</button>}
        {c.closed && c.manual && <button type="button" class="link-btn" onClick={() => act((st) => reopenCredit(st, c.id))}><Icon name="undo" size={16} />Volver a abrir</button>}
      </div>
      <button type="button" class="link-btn" style={{ color: 'var(--vit-ink)', alignSelf: 'center' }} onClick={async () => {
        if (!(await ask(`¿Borrar «${c.name}»?`, { ok: 'Borrar', danger: true }))) return;
        const nTx = c.pays.filter((p) => p.tx).length;
        const withTx = nTx > 0 && (await ask(`¿Borrar también ${plural(nTx, 'su movimiento', 'sus movimientos')} de tus cuentas? Si no, se quedan ahí.`, { ok: 'Borrar también', danger: true }));
        act((st) => removeCredit(st, c.id, { withTx: !!withTx }));
        toast('Préstamo borrado', 'trash');
        onClose();
      }}><Icon name="trash" size={16} />Borrar préstamo</button>
    </Sheet>
  );
}

// ---------- Bienes e inversiones ----------

export function AssetsCard({ s, today, setSheet }) {
  const list = s.money.assets || [];
  const t = assetTotals(s, today);
  return (
    <section class="card flush" aria-label="Tus bienes">
      <div class="between-c" style={{ padding: '14px 0 4px' }}>
        <h2 class="h2">Bienes e inversiones</h2>
        <button type="button" class="link-btn" onClick={() => setSheet({ kind: 'asset', id: null })}>Agregar<Icon name="plus" size={16} /></button>
      </div>
      {!list.length && <p class="small muted" style={{ padding: '2px 0 14px' }}>La casa, el carro, un solar, un certificado o un negocio. Con lo que valen, tu patrimonio cuenta lo que de verdad tienes, no solo el dinero de las cuentas.</p>}
      {list.map((a) => {
        const info = assetInfo(s, a, today);
        const k = assetKind(a.kind);
        return (
          <button key={a.id} type="button" class="lrow" style={{ minHeight: 62 }} onClick={() => setSheet({ kind: 'asset', id: a.id })}>
            <span class="tile sm" style={{ background: 'var(--good-soft)', color: 'var(--good-ink)' }}><Icon name={k.icon} size={18} /></span>
            <span class="stack-xs grow" style={{ minWidth: 0 }}>
              <span class="strong clip">{a.name}</span>
              <span class="tiny muted semi">{info.credit ? `Es tuyo el ${Math.round(info.pctOwned * 100)} % · debes ${whole(info.oweDOP)}` : k.label}</span>
            </span>
            <span class="strong tab-num" style={{ whiteSpace: 'nowrap' }}>{cur(info.value, a.currency)}</span>
          </button>
        );
      })}
      {list.length > 0 && <div class="between-c" style={{ padding: '10px 0 12px' }}><span class="small semi muted">Valen {whole(t.value)}</span></div>}
    </section>
  );
}

export function AssetSheet({ s, id, onClose }) {
  const today = s.energy.day;
  const a = id ? assetOf(s, id) : null;
  const [name, setName] = useState(a ? a.name : '');
  const [kind, setKind] = useState(a ? a.kind : 'casa');
  const [currency, setCurrency] = useState(a ? a.currency : 'DOP');
  const [value, setValue] = useState('');
  const [credit, setCredit] = useState(a ? a.credit || '' : '');
  const [note, setNote] = useState(a ? a.note : '');
  const info = a ? assetInfo(s, a, today) : null;
  const credits = (s.money.credits || []).filter((c) => !c.closed || (a && a.credit === c.id));
  const v = num(value);
  const ok = name.trim().length >= 2 && (a ? true : v > 0);
  const save = () => {
    if (!ok) return;
    if (a) {
      act((st, t) => updateAsset(st, a.id, { name, kind, currency, credit: credit || null, note, ...(v > 0 ? { value: v } : {}) }, t));
      toast('Actualizado', 'check');
    } else {
      act((st, t) => addAsset(st, { name, kind, currency, value: v, credit: credit || null, note }, t));
      toast(`Agregaste ${name.trim()}`, 'check');
    }
    onClose();
  };
  return (
    <Sheet onClose={onClose} label={a ? a.name : 'Nuevo bien'}>
      <SheetHead title={a ? a.name : 'Nuevo bien o inversión'} onClose={onClose} />
      {info && (
        <section class="stack-sm">
          <span class="small semi muted">Hoy vale</span>
          <span class="display-num tab-num" style={{ fontSize: 32 }}>{cur(info.value, a.currency)}</span>
          {info.credit && (
            <>
              <Bar value={info.pctOwned} size="lg" color="var(--good)" label={`Es tuyo el ${Math.round(info.pctOwned * 100)} %`} />
              <span class="small muted">Debes {whole(info.oweDOP)} de «{info.credit.name}». Lo que de verdad es tuyo: <b>{whole(info.equity)}</b>.</span>
            </>
          )}
          {a.vals.length > 1 && <span class="tiny muted semi">{a.vals.length} valores anotados · el primero, {cur(a.vals[0].value, a.currency)} ({fmtShort(a.vals[0].day)})</span>}
        </section>
      )}
      <div class="field"><label for="aname">Nombre</label><input id="aname" class="input" value={name} maxLength={50} placeholder="Ej. Mi carro" onInput={(e) => setName(e.currentTarget.value)} ref={a ? undefined : focusOnMount} /></div>
      <div class="chips" role="group" aria-label="Tipo de bien">
        {ASSET_KINDS.map((k) => <TChip key={k.key} sm icon={k.icon} on={kind === k.key} onClick={() => setKind(k.key)}>{k.label}</TChip>)}
      </div>
      <CurrencyIn id="aval" label={a ? 'Nuevo valor (si cambió)' : 'Cuánto vale hoy'} currency={currency} setCurrency={setCurrency} value={value} setValue={setValue} />
      {a && <span class="tiny muted" style={{ marginTop: -6 }}>Guardo cada valor con su fecha: el patrimonio de meses pasados no cambia.</span>}
      {credits.length > 0 && (
        <div class="stack-sm"><span class="label">¿Lo estás pagando con un préstamo?</span>
          <div class="chips"><TChip sm on={!credit} onClick={() => setCredit('')}>No</TChip>{credits.map((c) => <TChip key={c.id} sm on={credit === c.id} onClick={() => setCredit(c.id)}>{c.name}</TChip>)}</div>
        </div>
      )}
      <div class="field"><label for="anote">Nota (opcional)</label><input id="anote" class="input" value={note} maxLength={200} onInput={(e) => setNote(e.currentTarget.value)} /></div>
      <button type="button" class="btn block" disabled={!ok} onClick={save}><Icon name="check" size={20} />Guardar</button>
      {a && (
        <button type="button" class="link-btn" style={{ color: 'var(--vit-ink)', alignSelf: 'center' }} onClick={async () => {
          if (!(await ask(`¿Quitar «${a.name}» de tus bienes?`, { ok: 'Quitar', danger: true }))) return;
          act((st) => removeAsset(st, a.id));
          onClose();
        }}><Icon name="trash" size={16} />Quitar</button>
      )}
    </Sheet>
  );
}
