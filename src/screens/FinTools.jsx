// Herramientas de finanzas (1.9): tu hora de trabajo, el impuesto a transferencias, las reglas de categorías,
// el plan para salir de deudas, el detalle de una categoría, mover una categoría completa y dividir un movimiento.
import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Sheet, SheetHead, TChip, Switch, NumberChips, money, cur, toast, ask, plural, focusOnMount } from '../ui/kit.jsx';
import { act } from '../app/store.js';
import { monthKey, monthName } from '../app/dates.js';
import { catOf, catName, txKind, txOrig, txCur, fxRate, toDOP, taxPct, transferTaxRate } from '../game/logic.js';
import {
  workInfo, workHours, fmtWork, rulesList, ruleMismatches, setRule, removeRule, applyRule, moveCategory, splitTx, unsplitTx, splitParts,
  bulkAddTax, taxable, periodRange, filterTx, groupName,
} from '../game/ledger.js';
import { debtList, compareDebtPlans, monthAfter, setDebtPrefs, saveDebt, removeDebt } from '../game/debts.js';
import { categoryDetail, monthShort } from '../game/stats.js';
import { budgetCatOf, isGroupId } from '../game/money.js';
import { TRANSFER_TAX } from '../game/content.js';
import { toNumber } from '../game/parse.js';
import { CatPicker } from '../ui/catpicker.jsx';

const num = (v) => toNumber(String(v == null ? '' : v).replace(/[^\d.,-]/g, '')) || 0;
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const mName = (mk) => cap(monthName(mk));

// ---------- ¿Cuánto trabajo cuesta? ----------

export function WorkCalc({ s, wi }) {
  const [amt, setAmt] = useState('');
  const [currency, setCurrency] = useState('DOP');
  const [often, setOften] = useState('una');
  const n = num(amt);
  const dop = toDOP(n, currency, fxRate(s, s.energy.day));
  const h = workHours(dop, wi);
  const perYear = often === 'dia' ? 365 : often === 'semana' ? 52 : often === 'mes' ? 12 : 1;
  return (
    <div class="panel stack-sm" aria-label="¿Cuánto trabajo cuesta?">
      <span class="semi">¿Cuánto trabajo cuesta?</span>
      <div class="amount-in" style={{ background: 'var(--surface)' }}>
        <div class="cur-toggle" role="group" aria-label="Moneda">
          <button type="button" aria-pressed={currency === 'DOP' ? 'true' : 'false'} onClick={() => setCurrency('DOP')}>RD$</button>
          <button type="button" aria-pressed={currency === 'USD' ? 'true' : 'false'} onClick={() => setCurrency('USD')}>US$</button>
        </div>
        <input inputMode="decimal" value={amt} placeholder="Precio" onInput={(e) => setAmt(e.currentTarget.value)} aria-label="Precio de lo que quieres comprar" />
      </div>
      <div class="chips" role="group" aria-label="Cada cuánto">{[['una', 'Una vez'], ['dia', 'Cada día'], ['semana', 'Cada semana'], ['mes', 'Cada mes']].map(([k, l]) => <TChip key={k} sm on={often === k} onClick={() => setOften(k)}>{l}</TChip>)}</div>
      {n > 0 && h != null && (
        <span class="stack-xs" aria-live="polite">
          <span class="h2 tab-num">{fmtWork(h, wi)} de trabajo{often !== 'una' ? ' cada vez' : ''}</span>
          {often !== 'una' && <span class="small strong" style={{ color: 'var(--finanzas-ink)' }}>En un año: {money(Math.round(dop * perYear))} = {fmtWork(h * perYear, wi)} de trabajo.</span>}
        </span>
      )}
    </div>
  );
}

// ---------- Tu hora de trabajo ----------

export function WorkSheet({ s, onClose }) {
  const today = s.energy.day;
  const w = s.money.work;
  const [auto, setAuto] = useState(w.auto !== false);
  const [income, setIncome] = useState(w.income ? String(w.income) : '');
  const [hours, setHours] = useState(w.hours || 40);
  const [commute, setCommute] = useState(w.commute ? String(w.commute) : '');
  const [costs, setCosts] = useState(w.costs ? String(w.costs) : '');
  const [real, setReal] = useState(!!w.real);
  const [show, setShow] = useState(w.show !== false);
  const [more, setMore] = useState(!!(w.commute || w.costs || w.real));
  const draft = { ...s, money: { ...s.money, work: { auto, income: num(income), hours, commute: num(commute), costs: num(costs), real, show } } };
  const wi = workInfo(draft, today);
  const save = () => {
    act((st) => { st.money.work = { ...draft.money.work }; });
    toast(wi.ready ? `Tu hora vale ${money(Math.round(wi.rate))}` : 'Guardado', 'clock');
    onClose();
  };
  const src = wi.source === 'plan' ? `De tus cobros fijos: ${wi.parts.map((p) => `${p.name} ${money(Math.round(p.monthly))}`).join(' + ')}${wi.parts.length > 1 ? '' : ''} al mes.`
    : wi.source === 'hist' ? `Lo que entró en promedio en ${wi.parts[0] ? wi.parts[0].name.replace('Promedio de ', '') : 'los últimos meses'} (sin reembolsos).`
      : 'Todavía no sé cuánto cobras: agrega tu sueldo en Plan → Cobros o escribe tu ingreso.';
  return (
    <Sheet onClose={onClose} label="Tu hora de trabajo">
      <SheetHead title="Tu hora de trabajo" onClose={onClose} />
      <p class="lead">Cada gasto también cuesta horas de tu vida. Astra divide tu ingreso del mes entre tus horas de trabajo y te dice cuánto trabajo es cada compra.</p>
      <section class="card" style={{ gap: 6 }} aria-live="polite">
        <span class="small semi muted">Tu hora vale</span>
        <span class="display-num tab-num" style={{ fontSize: 38 }}>{wi.ready ? money(Math.round(wi.rate)) : '—'}</span>
        {wi.ready && <span class="small muted">{wi.useReal ? `Hora real (en el papel: ${money(Math.round(wi.hourly))}). ` : ''}Un día de trabajo ({Math.round(wi.dayHours * 10) / 10} h) = {money(Math.round(wi.rate * wi.dayHours))}.</span>}
      </section>
      <div class="stack-sm">
        <span class="label">Tu ingreso del mes</span>
        <div class="seg" role="tablist" aria-label="Ingreso del mes">{[[true, 'Automático'], [false, 'Escribirlo']].map(([k, l]) => <button key={l} type="button" role="tab" aria-selected={auto === k ? 'true' : 'false'} onClick={() => setAuto(k)}>{l}</button>)}</div>
        {auto ? <span class="small muted">{src}</span> : (
          <div class="field"><label for="winc">Lo que cobras al mes (neto)</label><div class="numrow"><span class="unit">RD$</span><input id="winc" class="input" inputMode="decimal" value={income} placeholder="0" onInput={(e) => setIncome(e.currentTarget.value)} ref={focusOnMount} /></div></div>
        )}
      </div>
      <div class="stack-sm">
        <span class="label">Horas de trabajo a la semana</span>
        <NumberChips value={hours} onChange={setHours} presets={[40, 44, 48]} min={1} max={100} unit="horas" format={(v) => `${v} h`} label="Horas a la semana" />
        <span class="small muted">En la República Dominicana la jornada máxima es de 44 horas a la semana. Pon las tuyas.</span>
      </div>
      <button type="button" class="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setMore(!more)} aria-expanded={more ? 'true' : 'false'}><Icon name={more ? 'down' : 'right'} size={15} />Tu hora real (traslados y gastos del trabajo)</button>
      {more && (
        <div class="panel stack-sm">
          <span class="small">Como en el libro <i>La bolsa o la vida</i> (Vicki Robin): al trabajo también le das las horas de ir y venir, y dinero en pasajes, almuerzos o ropa. Con eso tu hora real vale menos.</span>
          <div class="grid2">
            <div class="field"><label for="wcom">Horas de traslado a la semana</label><input id="wcom" class="input" inputMode="decimal" value={commute} placeholder="0" onInput={(e) => setCommute(e.currentTarget.value)} /></div>
            <div class="field"><label for="wcos">Gastos de ir a trabajar al mes</label><div class="numrow"><span class="unit">RD$</span><input id="wcos" class="input" inputMode="decimal" value={costs} placeholder="0" onInput={(e) => setCosts(e.currentTarget.value)} /></div></div>
          </div>
          {wi.realHourly > 0 && <span class="small strong">Tu hora real: {money(Math.round(wi.realHourly))}</span>}
          <label class="between-c" style={{ cursor: 'pointer' }}>
            <span class="semi">Usar la hora real</span>
            <Switch checked={real} onChange={setReal} label="Usar la hora real" />
          </label>
        </div>
      )}
      <label class="between-c panel" style={{ cursor: 'pointer' }}>
        <span class="stack-xs"><span class="semi">Ver las horas en cada gasto</span><span class="small muted">En la lista de movimientos, debajo del monto.</span></span>
        <Switch checked={show} onChange={setShow} label="Ver las horas en cada gasto" />
      </label>
      {wi.ready && <WorkCalc s={s} wi={wi} />}
      <button type="button" class="btn block" onClick={save}><Icon name="check" size={20} />Guardar</button>
    </Sheet>
  );
}

// ---------- Impuesto a transferencias ----------

export function TaxSheet({ s, onClose }) {
  const today = s.energy.day;
  const t = s.money.tax;
  const [auto, setAuto] = useState(t.auto !== false);
  const [own, setOwn] = useState(t.rate ? String(Math.round(t.rate * 100000) / 1000) : '');
  const [fee, setFee] = useState(t.fee ? String(t.fee) : '');
  const ownN = num(own);
  const ownOk = own.trim() === '' || (ownN > 0 && ownN < 5);
  const rate = transferTaxRate(s, today);
  const mk = monthKey(today);
  const pending = taxable(s, filterTx(s, periodRange({ kind: 'mes', mk }, today), {}).map((x) => x.id));
  const save = () => {
    act((st) => { st.money.tax = { auto, rate: own.trim() === '' ? null : ownN / 100, fee: Math.max(0, num(fee)) }; });
    toast('Guardado', 'check');
    onClose();
  };
  const addAll = () => {
    const n = act((st) => bulkAddTax(st, pending.map((x) => x.id), { fee: Number(t.fee) || 0 }));
    toast(`Impuesto agregado a ${plural(n, 'transferencia', 'transferencias')}. Puedes deshacerlo en Movimientos.`, 'percent');
    onClose();
  };
  return (
    <Sheet onClose={onClose} label="Impuesto a transferencias">
      <SheetHead title="Impuesto a transferencias" onClose={onClose} />
      <section class="card" style={{ gap: 8 }}>
        <span class="small semi muted">Hoy se cobra</span>
        <span class="display-num tab-num" style={{ fontSize: 36 }}>{taxPct(rate)}</span>
        <span class="small muted">RD${(rate * 1000).toFixed(2)} por cada RD$1,000. {t.rate ? 'Es tu tasa propia.' : `Desde el 3 de julio de 2026 (Ley 30-26); antes era ${TRANSFER_TAX[1].label}. Astra usa la tasa del día de cada movimiento.`}</span>
      </section>
      <div class="stack-xs">
        <span class="semi">Lo pagan (lo retiene tu banco para la DGII)</span>
        <span class="small muted">Las transferencias a otras personas (del mismo banco o de otro), los pagos de tarjetas y préstamos desde tu cuenta, los pagos por internet y los cheques.</span>
        <span class="semi" style={{ marginTop: 6 }}>No lo pagan</span>
        <span class="small muted">Lo que mueves entre tus cuentas (aunque sean de bancos distintos), los retiros de efectivo, los pagos de impuestos al Estado, la Seguridad Social, los fondos de pensiones y las compras con tarjeta.</span>
      </div>
      <div class="note"><Icon name="info" size={18} /><span>Astra lo anota aparte como gasto en «Comisiones e impuestos del banco», ligado a su transferencia: si la corriges o la borras, el impuesto la sigue. Si el aviso del banco ya trae el impuesto, se usa ese.</span></div>
      <label class="between-c panel" style={{ cursor: 'pointer' }}>
        <span class="stack-xs"><span class="semi">Sugerirlo al registrar</span><span class="small muted">En las transferencias a terceros y los pagos de tarjeta o préstamo desde tu cuenta de banco.</span></span>
        <Switch checked={auto} onChange={setAuto} label="Sugerir el impuesto al registrar" />
      </label>
      <div class="field"><label for="trate">Tasa propia (opcional)</label><div class="numrow"><input id="trate" class="input" inputMode="decimal" value={own} placeholder={(rate * 100).toFixed(2)} onInput={(e) => setOwn(e.currentTarget.value)} aria-invalid={ownOk ? 'false' : 'true'} /><span class="unit">%</span></div><span class="small muted">Por si cambia la ley. Vacía, Astra usa la tasa de la ley según la fecha.</span></div>
      <div class="field"><label for="tfee">Comisión de tu banco por transferir a otro banco (opcional)</label><div class="numrow"><span class="unit">RD$</span><input id="tfee" class="input" inputMode="decimal" value={fee} placeholder="0" onInput={(e) => setFee(e.currentTarget.value)} /></div><span class="small muted">ACH o LBTR. Se sugiere cuando agregas la comisión a una transferencia.</span></div>
      {pending.length > 0 && (
        <div class="panel stack-sm">
          <span class="small"><b>{plural(pending.length, 'transferencia', 'transferencias')}</b> de este mes desde tu cuenta no {pending.length === 1 ? 'tiene' : 'tienen'} su impuesto anotado.</span>
          <button type="button" class="btn sm soft" style={{ alignSelf: 'flex-start' }} onClick={addAll}><Icon name="percent" size={16} />Agregarlo a {pending.length === 1 ? 'esa' : `las ${pending.length}`}</button>
        </div>
      )}
      <button type="button" class="btn block" disabled={!ownOk} onClick={save}><Icon name="check" size={20} />Guardar</button>
      <span class="tiny muted">Fuentes: Ley 30-26 y lo publicado por los bancos y la DGII en julio de 2026. Si tu banco te cobró otro monto, corrígelo en el movimiento.</span>
    </Sheet>
  );
}

// ---------- Reglas de categorías ----------

export function RulesSheet({ s, onClose }) {
  const rules = rulesList(s);
  const [edit, setEdit] = useState(null);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [cat, setCat] = useState(null);
  const add = () => {
    const k = act((st) => setRule(st, text, cat));
    if (!k) { toast('Escribe al menos tres letras del comercio', 'info'); return; }
    const n = ruleMismatches(s, k, cat).length;
    toast(n ? `Regla guardada. Hay ${plural(n, 'gasto', 'gastos')} de ese comercio en otra categoría: aplícala abajo.` : 'Regla guardada', 'check');
    setAdding(false); setText(''); setCat(null);
  };
  return (
    <Sheet onClose={onClose} label="Reglas de categorías">
      <SheetHead title="Reglas de categorías" onClose={onClose} />
      <p class="lead">Cuando corriges la categoría de un comercio, Astra lo recuerda para la próxima. Aquí ves esas reglas, las cambias y las aplicas a lo que ya registraste.</p>
      {!adding && <button type="button" class="btn ghost block" onClick={() => setAdding(true)}><Icon name="plus" size={18} />Nueva regla</button>}
      {adding && (
        <section class="panel stack">
          <div class="field"><label for="rtext">Si el comercio dice</label><input id="rtext" class="input" value={text} maxLength={60} placeholder="Ej. Uber Eats" onInput={(e) => setText(e.currentTarget.value)} ref={focusOnMount} /></div>
          <div class="stack-sm"><span class="label">Va en</span><CatPicker s={s} type="gasto" value={cat} onChange={setCat} /></div>
          <div class="row"><button type="button" class="btn sm grow" disabled={text.trim().length < 3 || !cat} onClick={add}><Icon name="check" size={18} />Guardar</button><button type="button" class="btn sm ghost" onClick={() => setAdding(false)}>Cancelar</button></div>
        </section>
      )}
      {!rules.length && !adding && <span class="small muted">Todavía no hay reglas. Se crean solas cuando cambias la categoría de un gasto con comercio.</span>}
      {rules.length > 0 && (
        <section class="card flush">
          {rules.map((r) => (
            <div key={r.key} class="lrow" style={{ minHeight: 64, flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <button type="button" class="row" style={{ gap: 12, background: 'none', border: 0, padding: 0, color: 'inherit', textAlign: 'left', font: 'inherit' }} onClick={() => setEdit(edit === r.key ? null : r.key)} aria-expanded={edit === r.key ? 'true' : 'false'}>
                <span class="tile sm" style={{ background: 'var(--finanzas-soft)', color: 'var(--finanzas-ink)' }}><Icon name={catOf(s, r.cat).icon || 'tag'} size={17} /></span>
                <span class="stack-xs grow" style={{ minWidth: 0 }}>
                  <span class="strong clip">{r.name}</span>
                  <span class="tiny muted semi">→ {catName(s, r.cat)} · {plural(r.n, 'gasto', 'gastos')}{r.off ? ` · ${r.off} en otra categoría` : ''}</span>
                </span>
                <Icon name={edit === r.key ? 'down' : 'right'} size={16} />
              </button>
              {r.off > 0 && edit !== r.key && <button type="button" class="btn xs soft" style={{ alignSelf: 'flex-start', marginLeft: 48 }} onClick={() => { const n = act((st) => applyRule(st, r.key)); toast(`Cambiaste ${plural(n, 'gasto', 'gastos')} a «${catName(s, r.cat)}»`, 'check'); }}>{r.off === 1 ? 'Pasar ese' : `Pasar los ${r.off}`} a «{catName(s, r.cat)}»</button>}
              {edit === r.key && (
                <div class="stack-sm" style={{ paddingLeft: 48 }}>
                  <CatPicker s={s} type="gasto" value={r.cat} onChange={(v) => { act((st) => setRule(st, r.name, v)); toast(`Ahora va en «${catName(s, v)}»`, 'check'); }} />
                  <div class="row wrap" style={{ gap: 14 }}>
                    {r.off > 0 && <button type="button" class="link-btn" onClick={() => { const n = act((st) => applyRule(st, r.key)); toast(`Cambiaste ${plural(n, 'gasto', 'gastos')}`, 'check'); }}><Icon name="check" size={15} />Aplicar a los {r.off}</button>}
                    <button type="button" class="link-btn" style={{ color: 'var(--vit-ink)' }} onClick={() => { act((st) => removeRule(st, r.key)); setEdit(null); }}><Icon name="trash" size={15} />Quitar regla</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </Sheet>
  );
}

// ---------- Salir de deudas ----------

export function DebtSheet({ s, onClose }) {
  const today = s.energy.day;
  const d = s.money.debts;
  const list = debtList(s, today);
  const [method, setMethod] = useState(d.method || 'avalanche');
  const [extra, setExtra] = useState(d.extra ? String(d.extra) : '');
  const [edit, setEdit] = useState(null);
  const ex = num(extra);
  const cmp = compareDebtPlans(list, ex);
  const plan = method === 'snowball' ? cmp.snowball : cmp.avalanche;
  const other = method === 'snowball' ? cmp.avalanche : cmp.snowball;
  const missing = list.filter((x) => x.on !== false && (!(x.min > 0)));
  const noApr = list.filter((x) => x.on !== false && !(x.apr > 0));
  const keep = (m = method, e = ex) => act((st) => setDebtPrefs(st, { method: m, extra: e }));
  const total = list.filter((x) => x.on !== false).reduce((a, x) => a + x.balance, 0);
  const when = (n) => (n == null ? '' : n === 0 ? 'ya' : `${mName(monthAfter(today, n))}`);
  return (
    <Sheet onClose={onClose} label="Salir de deudas">
      <SheetHead title="Salir de deudas" onClose={onClose} />
      <p class="lead">Paga lo de cada mes en todas y pon lo extra en una sola. Cuando la terminas, lo que pagabas en ella pasa a la siguiente.</p>
      <div class="seg" role="tablist" aria-label="Método">
        {[['avalanche', 'Avalancha'], ['snowball', 'Bola de nieve']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={method === k ? 'true' : 'false'} onClick={() => { setMethod(k); keep(k); }}>{l}</button>)}
      </div>
      <span class="small muted">{method === 'avalanche' ? 'Primero la de la tasa más alta: pagas menos intereses.' : 'Primero la de saldo más pequeño: terminas una antes y te motiva a seguir.'}</span>

      <section class="card flush" aria-label="Tus deudas">
        <div class="between-c" style={{ padding: '14px 0 4px' }}><h2 class="h2">Tus deudas</h2><span class="small strong tab-num">{money(Math.round(total))}</span></div>
        {!list.length && <p class="small muted" style={{ padding: '2px 0 12px' }}>No tienes tarjetas con saldo. Agrega un préstamo para planificarlo.</p>}
        {list.map((x) => (
          <div key={x.id} class="lrow" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, opacity: x.on === false ? 0.55 : 1 }}>
            <button type="button" class="row" style={{ gap: 12, background: 'none', border: 0, padding: 0, color: 'inherit', textAlign: 'left', font: 'inherit' }} onClick={() => setEdit(edit === x.id ? null : x.id)} aria-expanded={edit === x.id ? 'true' : 'false'}>
              <span class="tile sm" style={{ background: 'var(--finanzas-soft)', color: 'var(--finanzas-ink)' }}><Icon name={x.kind === 'card' ? 'card' : 'bank'} size={17} /></span>
              <span class="stack-xs grow" style={{ minWidth: 0 }}>
                <span class="strong clip">{x.name}</span>
                <span class="tiny muted semi">{x.apr > 0 ? `${x.apr} % al año` : 'sin tasa'} · {x.min > 0 ? `pagas ${money(x.min)} al mes` : 'sin pago mensual'}{x.on === false ? ' · fuera del plan' : ''}</span>
              </span>
              <span class="strong tab-num">{money(Math.round(x.balance))}</span>
            </button>
            {edit === x.id && <DebtForm s={s} x={x} onDone={() => setEdit(null)} />}
          </div>
        ))}
        {edit === 'new' ? <div class="lrow" style={{ flexDirection: 'column', alignItems: 'stretch' }}><DebtForm s={s} x={null} onDone={() => setEdit(null)} /></div>
          : <button type="button" class="lrow" style={{ justifyContent: 'center', fontWeight: 700, color: 'var(--ink)' }} onClick={() => setEdit('new')}><Icon name="plus" size={18} />Agregar un préstamo u otra deuda</button>}
      </section>
      {list.some((x) => x.usd) && <span class="tiny muted">Lo que debes en dólares se cuenta en pesos con la tasa de hoy.</span>}

      <div class="field">
        <label for="dext">Lo extra que puedes poner cada mes</label>
        <div class="numrow"><span class="unit">RD$</span><input id="dext" class="input" inputMode="decimal" value={extra} placeholder="0" onInput={(e) => setExtra(e.currentTarget.value)} onBlur={() => keep(method, ex)} /></div>
      </div>

      {(missing.length > 0 || noApr.length > 0) && list.length > 0 && <div class="note tone-xp"><Icon name="info" size={18} /><span>{missing.length ? `Pon el pago de cada mes de ${missing.map((x) => x.name).join(', ')}.` : ''}{noApr.length ? ` Sin la tasa anual de ${noApr.map((x) => x.name).join(', ')} no puedo calcular sus intereses (está en tu estado de cuenta o contrato).` : ''} Toca cada deuda para ponerlo.</span></div>}

      {list.length > 0 && (
        <section class="card" aria-label="Tu plan" style={{ gap: 10 }}>
          {plan.ok ? (
            <>
              <span class="small semi muted">Sin deudas en</span>
              <span class="display-num" style={{ fontSize: 30 }}>{plan.months === 0 ? 'Ya' : `${when(plan.months)}`}</span>
              <span class="small muted tab-num">{plural(plan.months, 'mes', 'meses')} pagando {money(Math.round(plan.budget))} al mes · intereses: {money(Math.round(plan.interest))}</span>
              <DebtCurve plan={plan} />
              <div class="stack-xs">
                {plan.order.map((o, i) => (
                  <div key={o.id} class="between-c" style={{ minHeight: 34 }}>
                    <span class="row" style={{ gap: 8, minWidth: 0 }}><span class="chip sm">{i + 1}</span><span class="semi clip">{o.name}</span></span>
                    <span class="small strong tab-num" style={{ whiteSpace: 'nowrap' }}>{when(o.month)}</span>
                  </div>
                ))}
              </div>
              {other.ok && list.filter((x) => x.on !== false).length > 1 && <span class="small muted">Con {method === 'snowball' ? 'la avalancha' : 'la bola de nieve'}: {plural(other.months, 'mes', 'meses')} e intereses de {money(Math.round(other.interest))} ({other.interest > plan.interest ? `${money(Math.round(other.interest - plan.interest))} más` : other.interest < plan.interest ? `${money(Math.round(plan.interest - other.interest))} menos` : 'lo mismo'}).</span>}
              {cmp.minimum.ok ? (cmp.minimum.months > plan.months && <span class="small strong" style={{ color: 'var(--finanzas-ink)' }}>Pagando solo lo de cada mes tardarías {plural(cmp.minimum.months, 'mes', 'meses')} y pagarías {money(Math.round(cmp.minimum.interest))} de intereses: con el plan terminas {plural(cmp.minimum.months - plan.months, 'mes', 'meses')} antes y te ahorras {money(Math.round(cmp.minimum.interest - plan.interest))}.</span>)
                : <span class="small strong" style={{ color: 'var(--finanzas-ink)' }}>Pagando solo lo de cada mes no terminarías nunca: los intereses son más que el pago.</span>}
            </>
          ) : (
            <div class="note tone-vit"><Icon name="info" size={18} /><span>Con estos pagos los intereses crecen más rápido de lo que pagas: no terminarías. Sube lo extra o el pago de cada mes.</span></div>
          )}
        </section>
      )}
      <span class="tiny muted">Es una guía con pagos fijos; en las tarjetas el mínimo baja con el saldo. No es asesoría financiera.</span>
    </Sheet>
  );
}

function DebtCurve({ plan }) {
  const pts = plan.curve;
  if (!pts || pts.length < 3) return null;
  const W = 320; const H = 70;
  const max = Math.max(...pts, 1);
  const x = (i) => (i / (pts.length - 1)) * W;
  const y = (v) => H - 4 - (v / max) * (H - 8);
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Lo que debes baja de ${money(Math.round(pts[0]))} a cero en ${plan.months} meses`}>
      <path d={`${d}L${W},${H}L0,${H}Z`} fill="var(--finanzas-soft)" />
      <path d={d} fill="none" stroke="var(--finanzas)" stroke-width="2.5" stroke-linejoin="round" />
    </svg>
  );
}

function DebtForm({ s, x, onDone }) {
  const card = x && x.kind === 'card';
  const [name, setName] = useState(x ? x.name : '');
  const [balance, setBalance] = useState(x && !card ? String(x.balance || '') : '');
  const [apr, setApr] = useState(x && x.apr ? String(x.apr) : '');
  const [min, setMin] = useState(x && x.min ? String(x.min) : '');
  const [on, setOn] = useState(x ? x.on !== false : true);
  const ok = card ? true : name.trim().length >= 2 && num(balance) > 0;
  const save = () => {
    act((st) => saveDebt(st, card ? { kind: 'card', account: x.account, apr: num(apr), min: num(min), on } : { id: x && x.saved ? x.id : null, kind: 'loan', name, balance: num(balance), apr: num(apr), min: num(min), on }));
    onDone();
  };
  return (
    <div class="panel stack-sm" style={{ background: 'var(--soft)' }}>
      {!card && <div class="field"><label for="dn">Nombre</label><input id="dn" class="input" value={name} maxLength={50} placeholder="Ej. Préstamo del carro" onInput={(e) => setName(e.currentTarget.value)} ref={focusOnMount} /></div>}
      {!card && <div class="field"><label for="db">Lo que debes hoy</label><div class="numrow"><span class="unit">RD$</span><input id="db" class="input" inputMode="decimal" value={balance} placeholder="0" onInput={(e) => setBalance(e.currentTarget.value)} /></div></div>}
      <div class="grid2">
        <div class="field"><label for="da">Tasa anual</label><div class="numrow"><input id="da" class="input" inputMode="decimal" value={apr} placeholder={card ? 'Ej. 54' : 'Ej. 14'} onInput={(e) => setApr(e.currentTarget.value)} ref={card ? focusOnMount : undefined} /><span class="unit">%</span></div></div>
        <div class="field"><label for="dm">Pago de cada mes</label><div class="numrow"><span class="unit">RD$</span><input id="dm" class="input" inputMode="decimal" value={min} placeholder={x && x.minStmt ? String(x.minStmt) : '0'} onInput={(e) => setMin(e.currentTarget.value)} /></div></div>
      </div>
      {card && <span class="small muted">El saldo es lo que debes según Astra. La tasa está en tu estado de cuenta (tasa anual o «tasa de interés»).{x.minStmt ? ` Tu pago mínimo del estado: ${money(x.minStmt)}.` : ''}</span>}
      <label class="between-c" style={{ cursor: 'pointer' }}><span class="semi">Incluir en el plan</span><Switch checked={on} onChange={setOn} label="Incluir en el plan" /></label>
      <div class="row wrap" style={{ gap: 8 }}>
        <button type="button" class="btn sm" disabled={!ok} onClick={save}><Icon name="check" size={17} />Guardar</button>
        <button type="button" class="btn sm ghost" onClick={onDone}>Cancelar</button>
        {x && !card && x.saved && <button type="button" class="link-btn" style={{ color: 'var(--vit-ink)' }} onClick={() => { act((st) => removeDebt(st, x.id)); onDone(); }}><Icon name="trash" size={15} />Quitar</button>}
      </div>
    </div>
  );
}

// ---------- Detalle de una categoría o familia ----------

export function CatDetailSheet({ s, id, onClose, onMovements, onBudget, onMove }) {
  const today = s.energy.day;
  const det = categoryDetail(s, id, today, 12);
  const group = isGroupId(id);
  const c = group ? budgetCatOf(s, id) : catOf(s, id);
  const wi = workInfo(s, today);
  const max = Math.max(...det.months.map((m) => Math.max(m.total, m.budget || 0)), 1);
  const cats = group ? s.money.categories.filter((x) => x.group === det.group && x.type === 'gasto').map((x) => x.id) : [id];
  const name = group ? groupName(det.group) : c.name;
  return (
    <Sheet onClose={onClose} label={`Detalle de ${name}`}>
      <SheetHead title={name} onClose={onClose} />
      {group && <span class="small muted">Familia: {cats.map((x) => catName(s, x)).join(', ')}.</span>}
      <section class="card" style={{ gap: 8 }}>
        <div class="kpis3">
          <div class="stack-xs"><span class="tiny semi muted">Este mes</span><span class="strong tab-num kpi-v">{money(Math.round(det.thisMonth))}</span></div>
          <div class="stack-xs"><span class="tiny semi muted">Promedio al mes</span><span class="strong tab-num kpi-v">{det.avg != null ? money(Math.round(det.avg)) : '—'}</span></div>
          <div class="stack-xs"><span class="tiny semi muted">Cada compra</span><span class="strong tab-num kpi-v">{det.n ? money(Math.round(det.avgTicket)) : '—'}</span></div>
        </div>
        {wi.ready && det.avg > 0 && <span class="small semi row hrs" style={{ color: 'var(--finanzas-ink)' }}><Icon name="clock" size={14} />Al mes te cuesta {fmtWork(workHours(det.avg, wi), wi)} de trabajo; al año, {fmtWork(workHours(det.avg * 12, wi), wi)}.</span>}
      </section>
      {det.total > 0 && (
        <section class="card" aria-label="Los últimos 12 meses" style={{ gap: 8 }}>
          <span class="small semi muted">Últimos 12 meses · {money(Math.round(det.total))}</span>
          <div class="bud-hist twelve" role="img" aria-label={det.months.map((m) => `${monthShort(m.mk)}: ${money(m.total)}${m.budget ? ` de ${money(m.budget)}` : ''}`).join(', ')}>
            {det.months.map((m) => (
              <div key={m.mk} class="cb" title={`${monthShort(m.mk)}: ${money(m.total)}${m.budget ? ` de ${money(m.budget)}` : ''}`}>
                <span class="bh-col">
                  {m.total > 0 && <i style={{ height: `${Math.max(3, (m.total / max) * 70)}px` }} />}
                  {m.budget > 0 && <b style={{ bottom: `${(m.budget / max) * 70}px` }} />}
                </span>
                <span class="tiny muted semi" style={{ textTransform: 'capitalize' }}>{monthShort(m.mk).slice(0, 1)}</span>
              </div>
            ))}
          </div>
          <span class="tiny muted">Barras: lo gastado cada mes. {det.months.some((m) => m.budget) ? 'Raya: el presupuesto de ese mes.' : ''}</span>
        </section>
      )}
      {det.merchants.length > 0 && (
        <section class="card flush" aria-label="Dónde">
          <div style={{ padding: '14px 0 4px' }}><h2 class="h2">Dónde (3 meses)</h2></div>
          {det.merchants.map((m) => (
            <div key={m.key} class="lrow" style={{ minHeight: 52 }}>
              <span class="stack-xs grow" style={{ minWidth: 0 }}><span class="semi clip">{m.name}</span><span class="tiny muted semi">{plural(m.n, 'vez', 'veces')} · {money(Math.round(m.avg))} cada vez</span></span>
              <span class="strong tab-num">{money(Math.round(m.total))}</span>
            </div>
          ))}
        </section>
      )}
      <button type="button" class="btn soft block" onClick={() => onMovements(cats, null)}><Icon name="list" size={18} />Ver los movimientos de este mes</button>
      <button type="button" class="btn ghost block" onClick={() => onMovements(cats, { kind: '12m' })}><Icon name="calendar" size={18} />Ver los de 12 meses</button>
      <div class="row wrap" style={{ justifyContent: 'center', gap: 18 }}>
        <button type="button" class="link-btn" onClick={() => onBudget(id)}><Icon name="target" size={16} />Presupuesto</button>
        {!group && c.type === 'gasto' && <button type="button" class="link-btn" onClick={() => onMove(id)}><Icon name="swap" size={16} />Pasar todo a otra categoría</button>}
      </div>
    </Sheet>
  );
}

// ---------- Pasar todos los movimientos de una categoría a otra ----------

export function MoveCatSheet({ s, from, onClose }) {
  const c = catOf(s, from);
  const n = s.money.tx.filter((t) => t.cat === from).length;
  const [to, setTo] = useState(null);
  const [del, setDel] = useState(false);
  const save = async () => {
    if (!(await ask(`¿Pasar ${plural(n, 'movimiento', 'movimientos')} de «${c.name}» a «${catName(s, to)}»?${del ? ` Después se borra «${c.name}».` : ''}`, { ok: 'Pasar' }))) return;
    const k = act((st) => moveCategory(st, from, to, { remove: del }));
    toast(`Listo: ${plural(k, 'movimiento', 'movimientos')} en «${catName(s, to)}». Puedes deshacerlo en Movimientos.`, 'swap');
    onClose();
  };
  return (
    <Sheet onClose={onClose} label={`Pasar ${c.name} a otra categoría`}>
      <SheetHead title={`Pasar «${c.name}»`} onClose={onClose} />
      <span class="small muted">{n ? `Sus ${plural(n, 'movimiento', 'movimientos')}, sus pagos programados y las reglas de comercio pasan a la categoría que elijas.` : 'No tiene movimientos todavía.'}</span>
      <CatPicker s={{ ...s, money: { ...s.money, categories: s.money.categories.filter((x) => x.id !== from) } }} type={c.type} value={to} onChange={setTo} />
      {c.custom && (
        <label class="between-c panel" style={{ cursor: 'pointer' }}>
          <span class="stack-xs"><span class="semi">Después, borrar «{c.name}»</span><span class="small muted">Así unes las dos. Su presupuesto pasa a la otra si no tenía.</span></span>
          <Switch checked={del} onChange={setDel} label={`Borrar ${c.name} después`} />
        </label>
      )}
      <button type="button" class="btn block" disabled={!to || (!n && !del)} onClick={save}><Icon name="swap" size={20} />{to ? `Pasar a «${catName(s, to)}»` : 'Elige la categoría'}</button>
    </Sheet>
  );
}

// ---------- Dividir un movimiento en varias categorías ----------

export function SplitSheet({ s, id, onClose, onOpenTx }) {
  const t = s.money.tx.find((x) => x.id === id);
  const total = t ? (t.split ? Number(t.split.total) : txOrig(t)) : 0;
  const [parts, setParts] = useState(() => (t ? [{ cat: t.cat, amount: '', auto: false }, { cat: null, amount: '', auto: true }] : []));
  const [pick, setPick] = useState(null);
  if (!t) return null;
  const type = txKind(t);
  const c = txCur(t);
  if (t.split) {
    const list = splitParts(s, t.split.id);
    return (
      <Sheet onClose={onClose} label="Movimiento dividido">
        <SheetHead title="Movimiento dividido" onClose={onClose} />
        <span class="small muted">{t.merchant || catName(s, t.cat)} · {cur(total, c)} en {plural(list.length, 'parte', 'partes')}. Toca una parte para cambiar su categoría, monto o nota.</span>
        <section class="card flush">
          {list.map((p) => (
            <button key={p.id} type="button" class="lrow" style={{ minHeight: 56 }} onClick={() => onOpenTx(p)}>
              <span class="tile sm" style={{ background: 'var(--finanzas-soft)', color: 'var(--finanzas-ink)' }}><Icon name={catOf(s, p.cat).icon || 'tag'} size={17} /></span>
              <span class="stack-xs grow" style={{ minWidth: 0 }}><span class="semi clip">{catName(s, p.cat)}</span>{p.note && <span class="tiny muted semi clip">{p.note}</span>}</span>
              <span class="strong tab-num">{cur(txOrig(p), c)}</span>
            </button>
          ))}
        </section>
        {Math.abs(list.reduce((a, p) => a + txOrig(p), 0) - total) > 0.011 && <div class="note tone-xp"><Icon name="info" size={18} /><span>Las partes ya no suman {cur(total, c)}: revisa los montos.</span></div>}
        <button type="button" class="btn ghost block" onClick={() => { act((st) => unsplitTx(st, t.split.id)); toast('Volvió a ser un solo movimiento', 'undo'); onClose(); }}><Icon name="undo" size={18} />Juntar de nuevo</button>
      </Sheet>
    );
  }
  const vals = parts.map((p) => num(p.amount));
  const used = Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100;
  const rest = Math.round((total - used) * 100) / 100;
  const ok = parts.length >= 2 && parts.every((p, i) => p.cat && vals[i] > 0) && Math.abs(rest) <= 0.01;
  const set = (i, patch) => setParts(parts.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  // Con dos partes, al escribir el monto de una, la otra se queda con lo que falta (si no la tocaste).
  const setAmount = (i, v) => {
    const next = parts.map((p, j) => (j === i ? { ...p, amount: v, auto: false } : p));
    if (next.length === 2) {
      const o = 1 - i;
      if (next[o].auto !== false || next[o].amount === '') {
        const rest2 = Math.round((total - num(v)) * 100) / 100;
        next[o] = { ...next[o], amount: rest2 > 0 ? String(rest2) : '', auto: true };
      }
    }
    setParts(next);
  };
  const fillRest = (i) => set(i, { amount: String(Math.round((num(parts[i].amount) + rest) * 100) / 100) });
  const save = () => {
    const out = act((st) => splitTx(st, t.id, parts.map((p, i) => ({ cat: p.cat, amount: vals[i], note: p.note || '' }))));
    toast(out ? `Dividido en ${parts.length} partes` : 'No se pudo dividir: revisa los montos', out ? 'scissors' : 'info');
    if (out) onClose();
  };
  return (
    <Sheet onClose={onClose} label="Dividir movimiento">
      <SheetHead title="Dividir en categorías" onClose={onClose} />
      <span class="small muted">{t.merchant || catName(s, t.cat)} · {cur(total, c)}. Por ejemplo, una compra del súper con algo de la casa y algo de cuidado personal. Las partes tienen que sumar el total.</span>
      {parts.map((p, i) => (
        <section key={i} class="panel stack-sm">
          <div class="between-c"><span class="label">Parte {i + 1}</span>{parts.length > 2 && <button type="button" class="link-btn muted" style={{ minHeight: 30 }} aria-label={`Quitar la parte ${i + 1}`} onClick={() => setParts(parts.filter((_, j) => j !== i))}><Icon name="close" size={15} /></button>}</div>
          {pick === i ? <CatPicker s={s} type={type} value={p.cat} onChange={(v) => { set(i, { cat: v }); setPick(null); }} />
            : <button type="button" class="goalnum" onClick={() => setPick(i)}>
              <span class="tile sm" style={{ background: 'var(--finanzas-soft)', color: 'var(--finanzas-ink)' }}><Icon name={p.cat ? catOf(s, p.cat).icon || 'tag' : 'grid'} size={17} /></span>
              <span class="grow strong">{p.cat ? catName(s, p.cat) : 'Elige la categoría'}</span><span class="small strong">Cambiar</span>
            </button>}
          <div class="numrow">
            <span class="unit">{c === 'USD' ? 'US$' : 'RD$'}</span>
            <input class="input" inputMode="decimal" value={p.amount} placeholder="0.00" aria-label={`Monto de la parte ${i + 1}`} onInput={(e) => setAmount(i, e.currentTarget.value)} />
            {Math.abs(rest) > 0.01 && rest > 0 && <button type="button" class="btn xs soft" onClick={() => fillRest(i)}>+ {cur(rest, c)}</button>}
          </div>
          <input class="input" value={p.note || ''} maxLength={120} placeholder="Nota (opcional)" aria-label={`Nota de la parte ${i + 1}`} onInput={(e) => set(i, { note: e.currentTarget.value })} />
        </section>
      ))}
      <button type="button" class="btn ghost block" onClick={() => setParts([...parts, { cat: null, amount: rest > 0 ? String(rest) : '' }])}><Icon name="plus" size={18} />Agregar parte</button>
      <div class="between-c"><span class="semi">{rest > 0.01 ? 'Falta repartir' : rest < -0.01 ? 'Te pasaste' : 'Todo repartido'}</span><span class="strong tab-num" style={{ color: Math.abs(rest) > 0.01 ? 'var(--vit-ink)' : 'var(--good-ink)' }}>{cur(Math.abs(rest), c)}</span></div>
      <button type="button" class="btn block" disabled={!ok} onClick={save}><Icon name="scissors" size={20} />Dividir</button>
    </Sheet>
  );
}

