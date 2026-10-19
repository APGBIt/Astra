import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Sheet, SheetHead, TChip, Switch, Bar, money, usd, cur, toast, ask, plural, areaColor, focusOnMount } from '../ui/kit.jsx';
import { act } from '../app/store.js';
import { addDays, diffDays, fmtDay, fmtShort, monthKey, monthName, parseDay, weekday, DAYS, MONTHS } from '../app/dates.js';
import { accountOf, accountLabel, addAccount, updateAccount, removeAccount, catOf, catName, frequentCats, setBudget } from '../game/logic.js';
import {
  balances, moneyTotals, cardInfo, isCard, accountCur, ownsBalance, setAccountBalance, setCardStatement, untilPayday, dueItems,
  forecast, monthPlan, budgetRows, planDates, addPlan, updatePlan, removePlan, skipPlanDate, unmarkPlanDate, isFundPlan, isMonthly,
  fundInfo, addToFund, setRollover, carryFor, planFreqLabel, recurringSuggestions, dismissRecurring,
} from '../game/money.js';
import { ACCOUNT_KINDS, PLAN_TEMPLATES } from '../game/content.js';
import { toNumber } from '../game/parse.js';
import { CatPicker } from '../ui/catpicker.jsx';

const ACC_ICON = Object.fromEntries(ACCOUNT_KINDS.map((k) => [k.key, k.icon]));
const num = (v) => toNumber(String(v || '').replace(/[^\d.,-]/g, '')) || 0;

// «RD$1,200 y US$40»: solo las monedas que tienen algo.
export function both(o, empty = money(0)) {
  const parts = [o.DOP > 0 ? money(o.DOP) : null, o.USD > 0 ? usd(o.USD) : null].filter(Boolean);
  return parts.length ? parts.join(' y ') : empty;
}
// En una fila: pesos arriba y dólares debajo (así un monto largo no empuja el nombre).
export function Amt({ o, color, size, sign = '' }) {
  const lines = [o.DOP > 0 ? money(o.DOP) : null, o.USD > 0 ? usd(o.USD) : null].filter(Boolean);
  if (!lines.length) lines.push(money(0));
  return (
    <span class="stack-xs" style={{ alignItems: 'flex-end', gap: 0, flexShrink: 0 }}>
      {lines.map((l, i) => <span key={l} class={i ? 'small strong tab-num' : 'strong tab-num'} style={{ color, fontSize: !i && size ? size : undefined, whiteSpace: 'nowrap' }}>{sign}{l}</span>)}
    </span>
  );
}
// Día corto: «mié 22 oct».
export const dayShort = (d) => `${DAYS[weekday(d)].slice(0, 3)} ${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1].slice(0, 3)}`;

export function whenText(date, today) {
  const n = diffDays(today, date);
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Mañana';
  if (n === -1) return 'Ayer';
  if (n < 0) return `Hace ${-n} días`;
  if (n < 7) return `${DAYS[weekday(date)]} ${parseDay(date).getDate()}`;
  return fmtShort(date);
}

export const freqLabel = planFreqLabel;

const planIcon = (s, p) => catOf(s, p.cat).icon || (p.kind === 'ingreso' ? 'coins' : 'tag');
const firstBank = (s) => (s.money.accounts.find((a) => a.kind === 'cuenta') || s.money.accounts.find((a) => !isCard(a)) || {}).id || '';

// Lo que abre la hoja de movimiento para pagar (o cobrar) algo.
export function payInitial(s, it, today) {
  if (it.type === 'card') {
    const usdOnly = !(it.toPay.DOP > 0) && it.toPay.USD > 0;
    return {
      kind: 'tx', type: 'transfer', cat: 'pago_tarjeta', currency: usdOnly ? 'USD' : 'DOP', amount: usdOnly ? it.toPay.USD : it.toPay.DOP,
      merchant: `Pago a ${accountLabel(it.a)}`, account: it.a.payFrom || firstBank(s), to: it.a.id, day: today,
    };
  }
  return {
    kind: 'tx', type: it.kind, amount: it.amount || '', currency: it.currency, cat: it.p.cat, merchant: it.p.name, account: it.p.account,
    day: today, link: { plan: it.p.id, date: it.date, name: it.p.name },
  };
}

// ---------- Resumen ----------

export function MoneyOverview({ s, today, setSheet, setTab }) {
  const bal = balances(s);
  const t = moneyTotals(s, today, bal);
  const pay = untilPayday(s, today);
  const due = dueItems(s, today, addDays(today, 14), today, { bal }).filter((it) => !it.estimate);
  const salary = PLAN_TEMPLATES.ingreso[0];
  return (
    <>
      {t.ready ? (
        <section class="card" aria-label="Tu dinero hoy">
          <span class="eyebrow">Tienes hoy</span>
          <span class="stack-xs">
            <span class="display-num tab-num" style={{ fontSize: 40 }}>{money(t.have.DOP)}</span>
            {t.have.USD !== 0 && <span class="h2 tab-num">{usd(t.have.USD)}</span>}
          </span>
          <span class="small muted">En tus cuentas y efectivo.{t.have.USD ? ` Todo en pesos: ${money(t.haveDOP)}.` : ''}</span>
          <div class="stack-xs" style={{ marginTop: 2 }}>
            {(t.owe.DOP > 0 || t.owe.USD > 0) && (
              <button type="button" class="lrow" style={{ minHeight: 48 }} onClick={() => setTab('cuentas')}>
                <span class="grow semi">Debes en tarjetas</span><Amt o={t.owe} color="var(--vit-ink)" /><Icon name="right" size={16} />
              </button>
            )}
            <div class="lrow" style={{ minHeight: 48 }}><span class="grow semi">Neto</span><span class="strong tab-num" style={{ color: t.net < 0 ? 'var(--vit-ink)' : 'var(--ink)' }}>{money(t.net)}</span></div>
          </div>
        </section>
      ) : (
        <section class="card" aria-label="Tu dinero hoy" style={{ background: 'var(--finanzas-soft)', borderColor: 'transparent' }}>
          <span class="eyebrow" style={{ color: 'var(--finanzas-ink)' }}>Tu dinero</span>
          <h2 class="h2">¿Cuánto tienes hoy?</h2>
          <span class="small">Pon el saldo de tus cuentas y lo que debes en tus tarjetas. Desde ahí, cada movimiento lo sube o lo baja solo.</span>
          <button type="button" class="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setTab('cuentas')}><Icon name="bank" size={18} />Poner mis saldos</button>
        </section>
      )}

      {pay ? <PaydayCard s={s} pay={pay} today={today} /> : (
        <button type="button" class="note" style={{ border: 'none', textAlign: 'left', color: 'var(--ink)' }} onClick={() => setSheet({ kind: 'plan', tpl: { ...salary, kind: 'ingreso' } })}>
          <Icon name="briefcase" size={20} /><span class="grow">¿Cuándo cobras? Agrega tu sueldo y te digo cuánto puedes gastar por día hasta el próximo cobro.</span><Icon name="right" size={18} />
        </button>
      )}

      <section class="card flush" aria-label="Por pagar">
        <div class="between-c" style={{ padding: '14px 0 4px' }}>
          <h2 class="h2">Por pagar y cobrar</h2>
          <button type="button" class="link-btn" onClick={() => setTab('plan')}>Calendario<Icon name="right" size={16} /></button>
        </div>
        {!due.length && (
          <p class="small muted" style={{ padding: '2px 0 14px' }}>
            {(s.money.plans || []).length || s.money.accounts.some((a) => isCard(a) && a.cut) ? 'Nada en los próximos 14 días.' : 'Agrega tus pagos fijos (alquiler, luz, colegio…) y la fecha de corte de tus tarjetas para verlos aquí antes de que venzan.'}
          </p>
        )}
        {due.slice(0, 6).map((it) => <DueRow key={`${it.type}-${it.type === 'card' ? it.a.id : it.p.id}-${it.date}`} s={s} it={it} today={today} onPay={() => setSheet(payInitial(s, it, today))} onOpen={() => setSheet(it.type === 'card' ? { kind: 'card', id: it.a.id } : { kind: 'due', item: { plan: it.p.id, date: it.date } })} />)}
        {due.length > 6 && <button type="button" class="lrow" style={{ justifyContent: 'center', fontWeight: 700 }} onClick={() => setTab('plan')}>Ver {due.length - 6} más</button>}
        {!(s.money.plans || []).length && <button type="button" class="lrow" style={{ justifyContent: 'center', fontWeight: 700, color: 'var(--ink)' }} onClick={() => setSheet({ kind: 'plan', tpl: null, planKind: 'gasto' })}><Icon name="plus" size={18} />Agregar un pago fijo</button>}
      </section>
    </>
  );
}

function PaydayCard({ s, pay, today }) {
  const amt = pay.next.p.amount;
  return (
    <section class="card" aria-label="Hasta tu próximo cobro">
      <div class="between-c">
        <span class="eyebrow">Hasta tu próximo cobro</span>
        <span class="chip sm tone-good">{pay.days === 0 ? 'Hoy' : pay.days === 1 ? 'Mañana' : `En ${pay.days} días`}</span>
      </div>
      {pay.ready ? (pay.free >= 0 ? (
        <span class="stack-xs">
          <span class="small semi muted">Puedes gastar</span>
          <span class="display-num tab-num" style={{ fontSize: 34 }}>{money(pay.free)}</span>
          {pay.perDay != null && <span class="small strong" style={{ color: 'var(--finanzas-ink)' }}>{money(pay.perDay)} por día hasta cobrar</span>}
          {pay.savings > 0 && <span class="tiny muted semi">Sin contar tus ahorros ({money(pay.savings)}).</span>}
        </span>
      ) : (
        <div class="note tone-vit"><Icon name="info" size={18} /><span>Te faltan <b>{money(-pay.free)}</b> para cubrir los pagos antes de cobrar. Mira si alguno se puede mover.</span></div>
      )) : <span class="small muted">Pon el saldo de tus cuentas para saber cuánto puedes gastar por día.</span>}
      <div class="stack-xs">
        <div class="lrow" style={{ minHeight: 46 }}>
          <span class="tile xs" style={{ background: 'var(--good-soft)', color: 'var(--good-ink)' }}><Icon name="coins" size={15} /></span>
          <span class="grow semi">Cobras: {pay.next.p.name} · {whenText(pay.next.date, today)}</span>
          <span class="strong tab-num" style={{ color: 'var(--good-ink)' }}>+{cur(amt, pay.next.p.currency)}</span>
        </div>
        {pay.items.length > 0 && (
          <div class="lrow" style={{ minHeight: 46 }}>
            <span class="tile xs" style={{ background: 'var(--finanzas-soft)', color: 'var(--finanzas-ink)' }}><Icon name="calendar" size={15} /></span>
            <span class="grow semi">Antes pagas {plural(pay.items.length, 'cosa', 'cosas')}</span>
            <span class="strong tab-num">−{money(pay.pay)}</span>
          </div>
        )}
      </div>
    </section>
  );
}

export function DueRow({ s, it, today, onPay, onOpen }) {
  const late = it.status === 'late';
  const card = it.type === 'card';
  const name = card ? `Tarjeta ${accountLabel(it.a)}` : it.p.name;
  const icon = card ? 'card' : planIcon(s, it.p);
  const amount = card ? both(it.toPay) : `${it.p.variable ? '≈ ' : ''}${cur(it.amount, it.currency)}`;
  const inc = it.kind === 'ingreso';
  const when = late ? `Venció ${whenText(it.date, today).toLowerCase()}` : it.date === today ? (inc ? 'Hoy' : 'Vence hoy') : whenText(it.date, today);
  return (
    <div class="lrow" style={{ minHeight: 60 }}>
      <button type="button" class="row grow" style={{ gap: 12, background: 'none', border: 0, padding: 0, color: 'inherit', textAlign: 'left', minWidth: 0, font: 'inherit' }} onClick={onOpen} aria-label={`${name}: ${amount}, ${when}`}>
        <span class="tile sm" style={{ background: inc ? 'var(--good-soft)' : late ? 'var(--vit-soft)' : 'var(--finanzas-soft)', color: inc ? 'var(--good-ink)' : late ? 'var(--vit-ink)' : 'var(--finanzas-ink)' }}><Icon name={icon} size={18} /></span>
        <span class="stack-xs grow" style={{ minWidth: 0 }}>
          <span class="strong clamp2" style={{ lineHeight: 1.25 }}>{name}</span>
          <span class="tiny semi" style={{ color: late ? 'var(--vit-ink)' : 'var(--muted)' }}>{when}{it.estimate ? ' · estimado' : ''}{card && it.info && it.info.min && (it.info.min.DOP || it.info.min.USD) ? ` · mínimo ${both(it.info.min)}` : ''}</span>
        </span>
        {card ? <Amt o={it.toPay} /> : <span class="strong tab-num" style={{ color: inc ? 'var(--good-ink)' : 'var(--ink)', whiteSpace: 'nowrap' }}>{inc ? '+' : ''}{amount}</span>}
      </button>
      {!it.estimate && <button type="button" class="btn xs soft" onClick={onPay}>{inc ? 'Recibí' : 'Pagar'}</button>}
    </div>
  );
}

// ---------- Cuentas y tarjetas ----------

export function AccountsTab({ s, today, setSheet }) {
  const bal = balances(s);
  const t = moneyTotals(s, today, bal);
  const cards = s.money.accounts.filter((a) => isCard(a) && !a.hidden);
  const others = s.money.accounts.filter((a) => !isCard(a) && !a.hidden);
  return (
    <>
      <section class="card flush" aria-label="Resumen de cuentas">
        <div class="lrow" style={{ minHeight: 52 }}><span class="grow semi muted">Tienes</span><Amt o={t.have} /></div>
        <div class="lrow" style={{ minHeight: 52 }}><span class="grow semi muted">Debes</span><Amt o={t.owe} color={t.oweDOP > 0 ? 'var(--vit-ink)' : undefined} /></div>
        <div class="lrow" style={{ minHeight: 52 }}><span class="grow semi muted">Neto</span><span class="strong tab-num" style={{ color: t.net < 0 ? 'var(--vit-ink)' : 'var(--good-ink)', fontSize: 19 }}>{money(t.net)}</span></div>
      </section>
      {!t.ready && <div class="note tone-xp"><Icon name="info" size={18} /><span>Toca cada cuenta y pon su saldo de hoy (y en cada tarjeta, lo que debes). Así los saldos cuadran con tu banco.</span></div>}

      <section class="card flush" aria-label="Tarjetas de crédito">
        <div style={{ padding: '14px 0 4px' }}><h2 class="h2">Tarjetas de crédito</h2></div>
        {!cards.length && <p class="small muted" style={{ padding: '2px 0 12px' }}>Agrega tu tarjeta con su fecha de corte y de pago: te digo cuánto pagar y cuándo, en pesos y en dólares.</p>}
        {cards.map((a) => <CardRow key={a.id} s={s} a={a} today={today} bal={bal} onOpen={() => setSheet({ kind: 'card', id: a.id })} />)}
      </section>

      <section class="card flush" aria-label="Cuentas y efectivo">
        <div style={{ padding: '14px 0 4px' }}><h2 class="h2">Cuentas y efectivo</h2></div>
        {others.map((a) => {
          const parent = a.kind === 'debito' && !ownsBalance(s, a) ? accountOf(s, a.of) : null;
          const v = (bal[a.id] || {})[accountCur(a)] || 0;
          return (
            <button type="button" key={a.id} class="lrow" style={{ minHeight: 60 }} onClick={() => setSheet({ kind: 'account', id: a.id })}>
              <span class="tile sm" style={{ background: 'var(--soft)' }}><Icon name={ACC_ICON[a.kind] || 'bank'} size={18} /></span>
              <span class="stack-xs grow" style={{ minWidth: 0 }}>
                <span class="strong clamp2" style={{ lineHeight: 1.25 }}>{accountLabel(a)}</span>
                <span class="tiny muted semi clip">{parent ? `Usa el saldo de ${accountLabel(parent)}` : `${a.save ? 'Ahorro · ' : ''}${a.base ? `saldo puesto el ${fmtShort(a.base.day)}` : 'toca para poner su saldo'}`}</span>
              </span>
              {!parent && <span class="strong tab-num" style={{ color: v < 0 ? 'var(--vit-ink)' : 'var(--ink)' }}>{cur(v, accountCur(a))}</span>}
            </button>
          );
        })}
      </section>
      <button type="button" class="btn ghost block" onClick={() => setSheet({ kind: 'account', id: null })}><Icon name="plus" size={18} />Agregar cuenta o tarjeta</button>
    </>
  );
}

function CardRow({ s, a, today, bal, onOpen }) {
  const ci = cardInfo(s, a, today, bal);
  const pill = ci.status === 'late' ? ['tone-vit', `Vencida: paga ${both(ci.toPay)}`]
    : ci.status === 'due' ? [ci.daysToDue <= 3 ? 'tone-xp' : '', `Paga ${both(ci.toPay)} antes del ${fmtShort(ci.cycle.due)}`]
      : ci.status === 'paid' ? ['tone-good', 'Estado pagado']
        : ci.status === 'none' ? ['', 'Nada que pagar del último corte'] : ['', 'Pon el día de corte y de pago'];
  return (
    <button type="button" class="lrow" style={{ minHeight: 76, alignItems: 'stretch', flexDirection: 'column', gap: 8 }} onClick={onOpen} aria-label={`${accountLabel(a)}: debes ${both(ci.owed)}. ${pill[1]}`}>
      <span class="row" style={{ gap: 12, width: '100%' }}>
        <span class="tile sm" style={{ background: 'var(--finanzas-soft)', color: 'var(--finanzas-ink)' }}><Icon name="card" size={18} /></span>
        <span class="stack-xs grow" style={{ minWidth: 0 }}><span class="strong clamp2" style={{ lineHeight: 1.25 }}>{accountLabel(a)}</span><span class="tiny muted semi">Debes</span></span>
        <Amt o={ci.owed} />
      </span>
      <span class="stack-xs" style={{ paddingLeft: 48, gap: 8 }}>
        <span class={`chip sm ${pill[0]}`} style={{ alignSelf: 'flex-start', whiteSpace: 'normal', minHeight: 26, padding: '4px 10px', lineHeight: 1.3 }}>{pill[1]}</span>
        {(ci.limit.DOP > 0 || ci.limit.USD > 0) && (
          <>
            <Bar value={ci.use} color={ci.use > 0.7 ? 'var(--vit)' : ci.use > 0.3 ? 'var(--xp)' : areaColor('finanzas')} label={`Usas el ${Math.round(ci.use * 100)} % del límite`} />
            <span class="tiny muted semi tab-num">Usas el {Math.round(ci.use * 100)} % · disponible {both({ DOP: ci.avail.DOP || 0, USD: ci.avail.USD || 0 })}</span>
          </>
        )}
      </span>
    </button>
  );
}

// Datos de una tarjeta: estado, pagar, lo que dice tu estado de cuenta y ajustes.
export function CardSheet({ s, id, onClose, onPay, onMovements }) {
  const today = s.energy.day;
  const a = accountOf(s, id);
  const [showStmt, setShowStmt] = useState(false);
  const [showCfg, setShowCfg] = useState(!a || !a.cut);
  const [showOwed, setShowOwed] = useState(false);
  if (!a) return null;
  const ci = cardInfo(s, a, today);
  const cy = ci.cycle;
  return (
    <Sheet onClose={onClose} label={accountLabel(a)}>
      <SheetHead title={accountLabel(a)} onClose={onClose} />
      <section class="card" style={{ gap: 6 }}>
        <span class="small semi muted">Debes hoy</span>
        <span class="stack-xs">
          <span class="display-num tab-num" style={{ fontSize: 32 }}>{money(ci.owed.DOP)}</span>
          {ci.owed.USD > 0 && <span class="h2 tab-num">{usd(ci.owed.USD)}</span>}
        </span>
        {(ci.favor.DOP > 0 || ci.favor.USD > 0) && <span class="small strong" style={{ color: 'var(--good-ink)' }}>Saldo a favor: {both(ci.favor)}</span>}
        {(ci.limit.DOP > 0 || ci.limit.USD > 0) && (
          <>
            <Bar value={ci.use} size="lg" color={ci.use > 0.7 ? 'var(--vit)' : ci.use > 0.3 ? 'var(--xp)' : areaColor('finanzas')} label={`Usas el ${Math.round(ci.use * 100)} % del límite`} />
            {ci.limit.DOP > 0 && <span class="small muted tab-num">Disponible {money(ci.avail.DOP)} de {money(ci.limit.DOP)}</span>}
            {ci.limit.USD > 0 && <span class="small muted tab-num">Disponible {usd(ci.avail.USD)} de {usd(ci.limit.USD)}</span>}
            {ci.use > 0.3 && <span class="small" style={{ color: 'var(--xp-ink)' }}>Usas el {Math.round(ci.use * 100)} % de tu límite. Lo sano es quedarte por debajo del 30 %.</span>}
          </>
        )}
        <button type="button" class="link-btn" style={{ alignSelf: 'flex-start', minHeight: 32 }} onClick={() => setShowOwed(!showOwed)}><Icon name="edit" size={15} />{a.base ? 'Corregir lo que debes' : 'Poner lo que debes hoy'}</button>
        {showOwed && <OwedForm a={a} owed={ci.owed} onDone={() => setShowOwed(false)} />}
      </section>

      {cy && cy.due && (
        <section class="card" aria-label="Estado del último corte" style={{ gap: 10 }}>
          <div class="between-c"><h2 class="h2">Corte del {fmtShort(cy.last)}</h2>{ci.estimated && ci.status !== 'none' && <span class="chip sm">Calculado</span>}</div>
          <div class="stack-xs">
            <div class="between-c"><span class="small semi muted">Saldo al corte</span><Amt o={ci.stmt} /></div>
            {(ci.paid.DOP > 0 || ci.paid.USD > 0) && <div class="between-c"><span class="small semi muted">Pagaste desde el corte</span><Amt o={ci.paid} color="var(--good-ink)" sign="−" /></div>}
            {ci.min && (ci.min.DOP > 0 || ci.min.USD > 0) && <div class="between-c"><span class="small semi muted">Pago mínimo</span><Amt o={ci.min} /></div>}
          </div>
          {ci.status === 'paid' && <div class="note tone-good"><Icon name="check" size={18} /><span>Pagaste todo el estado: no pagas intereses por estas compras.</span></div>}
          {ci.status === 'none' && <span class="small muted">No debías nada al corte.</span>}
          {(ci.status === 'due' || ci.status === 'late') && (
            <>
              <div class={`note ${ci.status === 'late' ? 'tone-vit' : ci.daysToDue <= 3 ? 'tone-xp' : ''}`}>
                <Icon name="calendar" size={18} />
                <span>Para no pagar intereses, paga <b>{both(ci.toPay)}</b> {ci.status === 'late' ? `(venció el ${fmtShort(cy.due)})` : `antes del ${fmtDay(cy.due, { weekdayName: false })} (${ci.daysToDue === 0 ? 'hoy' : ci.daysToDue === 1 ? 'mañana' : `en ${ci.daysToDue} días`})`}.{ci.min && ci.min.DOP > 0 ? ' El mínimo evita la mora, pero genera intereses.' : ''}</span>
              </div>
              <div class="row wrap" style={{ gap: 8 }}>
                {ci.toPay.DOP > 0 && <button type="button" class="btn sm" onClick={() => onPay({ type: 'card', a, toPay: { DOP: ci.toPay.DOP, USD: 0 } })}><Icon name="check" size={17} />Pagar {money(ci.toPay.DOP)}</button>}
                {ci.toPay.USD > 0 && <button type="button" class="btn sm" onClick={() => onPay({ type: 'card', a, toPay: { DOP: 0, USD: ci.toPay.USD } })}><Icon name="check" size={17} />Pagar {usd(ci.toPay.USD)}</button>}
              </div>
            </>
          )}
          <button type="button" class="link-btn" style={{ alignSelf: 'flex-start', minHeight: 32 }} onClick={() => setShowStmt(!showStmt)}><Icon name="receipt" size={15} />¿Tu estado de cuenta dice otra cosa?</button>
          {showStmt && <StatementForm a={a} cut={cy.last} ci={ci} onDone={() => setShowStmt(false)} />}
        </section>
      )}

      {cy && (
        <section class="card" aria-label="Ciclo actual" style={{ gap: 8 }}>
          <h2 class="h2">Desde el corte</h2>
          <div class="between-c"><span class="small semi muted">Compras (van al próximo estado)</span><Amt o={ci.since} /></div>
          <div class="between"><span class="small semi muted">Próximo corte</span><span class="strong">{fmtDay(cy.next, { weekdayName: false })}</span></div>
          {cy.nextDue && <div class="between"><span class="small semi muted">Y se paga antes del</span><span class="strong">{fmtDay(cy.nextDue, { weekdayName: false })}</span></div>}
          <span class="small muted">Lo que compres desde el {fmtShort(cy.best)} entra en el estado siguiente: es el día con más tiempo para pagar.</span>
        </section>
      )}

      <button type="button" class="btn soft block" onClick={() => onMovements(a.id)}><Icon name="list" size={18} />Ver los movimientos de esta tarjeta</button>
      <button type="button" class="link-btn" style={{ alignSelf: 'center' }} onClick={() => setShowCfg(!showCfg)}><Icon name={showCfg ? 'down' : 'gear'} size={16} />Ajustes de la tarjeta</button>
      {showCfg && <AccountForm s={s} acc={a} onDone={(rid) => { setShowCfg(false); if (rid === null) onClose(); }} />}
    </Sheet>
  );
}

function OwedForm({ a, owed, onDone }) {
  const [dop, setDop] = useState(owed.DOP ? String(owed.DOP) : '');
  const [us, setUs] = useState(owed.USD ? String(owed.USD) : '');
  return (
    <div class="panel stack-sm">
      <span class="small">Lo que debes hoy según tu banco (saldo actual, no solo el del corte):</span>
      <div class="grid2">
        <div class="field"><label for="ow-d">En pesos</label><div class="numrow"><span class="unit">RD$</span><input id="ow-d" class="input" inputMode="decimal" value={dop} placeholder="0" onInput={(e) => setDop(e.currentTarget.value)} ref={focusOnMount} /></div></div>
        <div class="field"><label for="ow-u">En dólares</label><div class="numrow"><span class="unit">US$</span><input id="ow-u" class="input" inputMode="decimal" value={us} placeholder="0" onInput={(e) => setUs(e.currentTarget.value)} /></div></div>
      </div>
      <button type="button" class="btn sm" onClick={() => { act((st, t) => setAccountBalance(st, a.id, { DOP: num(dop), USD: num(us) }, t)); toast('Listo: desde hoy lo calculo con tus movimientos', 'check'); onDone(); }}><Icon name="check" size={17} />Guardar</button>
    </div>
  );
}

function StatementForm({ a, cut, ci, onDone }) {
  const [v, setV] = useState({ DOP: String(ci.stmt.DOP || ''), USD: String(ci.stmt.USD || ''), minDOP: ci.min ? String(ci.min.DOP || '') : '', minUSD: ci.min ? String(ci.min.USD || '') : '' });
  const set = (k) => (e) => setV({ ...v, [k]: e.currentTarget.value });
  return (
    <div class="panel stack-sm">
      <span class="small">Copia los montos de tu estado del {fmtShort(cut)}. Mandan sobre lo calculado hasta el próximo corte.</span>
      <div class="grid2">
        <div class="field"><label for="st-d">Saldo al corte RD$</label><input id="st-d" class="input" inputMode="decimal" value={v.DOP} onInput={set('DOP')} placeholder="0" /></div>
        <div class="field"><label for="st-u">Saldo al corte US$</label><input id="st-u" class="input" inputMode="decimal" value={v.USD} onInput={set('USD')} placeholder="0" /></div>
        <div class="field"><label for="st-md">Pago mínimo RD$</label><input id="st-md" class="input" inputMode="decimal" value={v.minDOP} onInput={set('minDOP')} placeholder="Opcional" /></div>
        <div class="field"><label for="st-mu">Pago mínimo US$</label><input id="st-mu" class="input" inputMode="decimal" value={v.minUSD} onInput={set('minUSD')} placeholder="Opcional" /></div>
      </div>
      <div class="row wrap" style={{ gap: 8 }}>
        <button type="button" class="btn sm" onClick={() => { act((st) => setCardStatement(st, a.id, cut, { DOP: num(v.DOP), USD: num(v.USD), minDOP: num(v.minDOP), minUSD: num(v.minUSD) })); toast('Estado guardado', 'check'); onDone(); }}><Icon name="check" size={17} />Guardar</button>
        {a.stmt && a.stmt.cut === cut && <button type="button" class="btn sm ghost" onClick={() => { act((st) => setCardStatement(st, a.id, cut, null)); onDone(); }}>Usar lo calculado</button>}
      </div>
    </div>
  );
}

// Formulario de cuenta o tarjeta (nueva o para editar). En tarjetas: corte, pago, límite y con qué pagas.
export function AccountForm({ s, acc, onDone, kind0 = 'tarjeta', withBalance = false }) {
  const [name, setName] = useState(acc ? acc.name : '');
  const [kind, setKind] = useState(acc ? acc.kind : kind0);
  const [bank, setBank] = useState(acc ? acc.bank : '');
  const [last4, setLast4] = useState(acc ? acc.last4 : '');
  const [currency, setCurrency] = useState(acc ? accountCur(acc) : 'DOP');
  const [cut, setCut] = useState(acc && acc.cut ? String(acc.cut) : '');
  const [due, setDue] = useState(acc && acc.due ? String(acc.due) : '');
  const [limD, setLimD] = useState(acc && acc.limit && acc.limit.DOP ? String(acc.limit.DOP) : '');
  const [limU, setLimU] = useState(acc && acc.limit && acc.limit.USD ? String(acc.limit.USD) : '');
  const [payFrom, setPayFrom] = useState(acc ? acc.payFrom || '' : '');
  const [of, setOf] = useState(acc ? acc.of || '' : '');
  const [isSave, setIsSave] = useState(acc ? !!acc.save : false);
  const [b1, setB1] = useState('');
  const [b2, setB2] = useState('');
  const banks = s.money.accounts.filter((a) => a.kind === 'cuenta' && (!acc || a.id !== acc.id));
  const card = kind === 'tarjeta';
  const dayOk = (v) => !v || (Number(v) >= 1 && Number(v) <= 31);
  const ok = name.trim().length >= 2 && dayOk(cut) && dayOk(due);
  const save = () => {
    const p = { name, kind, bank, last4, currency, cut: num(cut), due: num(due), limit: { DOP: num(limD), USD: num(limU) }, payFrom, of, save: isSave };
    const id = act((st, t) => {
      const a = acc ? updateAccount(st, acc.id, p) : addAccount(st, p);
      if (a && withBalance && (b1 !== '' || b2 !== '')) setAccountBalance(st, a.id, card ? { DOP: num(b1), USD: num(b2) } : { [currency]: num(b1) }, t);
      return a ? a.id : null;
    });
    toast(acc ? 'Cuenta actualizada' : 'Cuenta agregada', 'card');
    onDone(id);
  };
  return (
    <section class="panel stack" aria-label={acc ? `Editar ${acc.name}` : 'Nueva cuenta o tarjeta'}>
      <div class="chips" role="group" aria-label="Tipo">{ACCOUNT_KINDS.map((k) => <TChip key={k.key} sm icon={k.icon} on={kind === k.key} onClick={() => setKind(k.key)}>{k.label}</TChip>)}</div>
      <div class="field"><label for="aname">Nombre</label><input id="aname" class="input" value={name} maxLength={40} placeholder={card ? 'Ej. Visa Popular' : kind === 'efectivo' ? 'Ej. Efectivo' : 'Ej. Ahorro Banreservas'} onInput={(e) => setName(e.currentTarget.value)} /></div>
      {kind !== 'efectivo' && (
        <div class="grid2">
          <div class="field"><label for="abank">Banco</label><input id="abank" class="input" value={bank} maxLength={30} placeholder="Ej. Banreservas" onInput={(e) => setBank(e.currentTarget.value)} /></div>
          <div class="field"><label for="a4">Últimos 4</label><input id="a4" class="input" inputMode="numeric" value={last4} maxLength={4} placeholder="1234" onInput={(e) => setLast4(e.currentTarget.value.replace(/\D/g, '').slice(0, 4))} /></div>
        </div>
      )}
      {!card && kind !== 'debito' && (
        <div class="stack-sm"><span class="label">Moneda</span><div class="chips"><TChip sm on={currency === 'DOP'} onClick={() => setCurrency('DOP')}>Pesos (RD$)</TChip><TChip sm on={currency === 'USD'} onClick={() => setCurrency('USD')}>Dólares (US$)</TChip></div></div>
      )}
      {kind === 'cuenta' && (
        <label class="between-c panel" style={{ cursor: 'pointer', background: 'var(--surface)' }}>
          <span class="stack-xs"><span class="semi">Es dinero de ahorro</span><span class="small muted">No lo cuento en «Puedes gastar» ni en el flujo de los próximos días.</span></span>
          <Switch checked={isSave} onChange={setIsSave} label="Es dinero de ahorro" />
        </label>
      )}
      {kind === 'debito' && banks.length > 0 && (
        <div class="stack-sm"><span class="label">¿De qué cuenta es?</span><div class="chips">{[['', 'Ninguna'], ...banks.map((a) => [a.id, accountLabel(a)])].map(([v, l]) => <TChip key={v || 'none'} sm on={of === v} onClick={() => setOf(v)}>{l}</TChip>)}</div><span class="small muted">Lo que pagas con la débito sale de esa cuenta.</span></div>
      )}
      {card && (
        <>
          <div class="grid2">
            <div class="field"><label for="acut">Día de corte</label><input id="acut" class="input" inputMode="numeric" value={cut} maxLength={2} placeholder="Ej. 15" onInput={(e) => setCut(e.currentTarget.value.replace(/\D/g, '').slice(0, 2))} /></div>
            <div class="field"><label for="adue">Día límite de pago</label><input id="adue" class="input" inputMode="numeric" value={due} maxLength={2} placeholder="Ej. 10" onInput={(e) => setDue(e.currentTarget.value.replace(/\D/g, '').slice(0, 2))} /></div>
          </div>
          <div class="grid2">
            <div class="field"><label for="alimd">Límite RD$</label><input id="alimd" class="input" inputMode="decimal" value={limD} placeholder="Opcional" onInput={(e) => setLimD(e.currentTarget.value)} /></div>
            <div class="field"><label for="alimu">Límite US$</label><input id="alimu" class="input" inputMode="decimal" value={limU} placeholder="Opcional" onInput={(e) => setLimU(e.currentTarget.value)} /></div>
          </div>
          {s.money.accounts.some((a) => !isCard(a)) && (
            <div class="stack-sm"><span class="label">La pagas desde</span><div class="chips">{[['', 'Sin indicar'], ...s.money.accounts.filter((a) => !isCard(a) && a.kind !== 'efectivo').map((a) => [a.id, accountLabel(a)])].map(([v, l]) => <TChip key={v || 'none'} sm on={payFrom === v} onClick={() => setPayFrom(v)}>{l}</TChip>)}</div></div>
          )}
          {(cut && !dayOk(cut)) || (due && !dayOk(due)) ? <span class="small" style={{ color: 'var(--vit-ink)' }}>Los días van del 1 al 31.</span> : <span class="small muted">Están en tu estado de cuenta. Si el corte es el 31, en meses más cortos se toma el último día.</span>}
        </>
      )}
      {withBalance && (
        card ? (
          <div class="grid2">
            <div class="field"><label for="ab1">Debes hoy RD$</label><input id="ab1" class="input" inputMode="decimal" value={b1} placeholder="0" onInput={(e) => setB1(e.currentTarget.value)} /></div>
            <div class="field"><label for="ab2">Debes hoy US$</label><input id="ab2" class="input" inputMode="decimal" value={b2} placeholder="0" onInput={(e) => setB2(e.currentTarget.value)} /></div>
          </div>
        ) : kind !== 'debito' && (
          <div class="field"><label for="ab1">Saldo de hoy</label><div class="numrow"><span class="unit">{currency === 'USD' ? 'US$' : 'RD$'}</span><input id="ab1" class="input" inputMode="decimal" value={b1} placeholder="0" onInput={(e) => setB1(e.currentTarget.value)} /></div></div>
        )
      )}
      <span class="small muted">Solo los últimos 4 números: nunca el número completo ni claves.</span>
      <div class="row">
        <button type="button" class="btn sm grow" disabled={!ok} onClick={save}><Icon name="check" size={18} />Guardar</button>
        <button type="button" class="btn sm ghost" onClick={() => onDone(undefined)}>Cancelar</button>
      </div>
      {acc && <button type="button" class="link-btn" style={{ color: 'var(--vit-ink)', alignSelf: 'flex-start' }} onClick={async () => { if (await ask(`¿Quitar «${accountLabel(acc)}»? Sus movimientos se quedan, sin cuenta.`, { ok: 'Quitar', danger: true })) { act((st) => removeAccount(st, acc.id)); onDone(null); } }}><Icon name="trash" size={16} />Quitar</button>}
    </section>
  );
}

// Una cuenta de banco o efectivo: saldo, ajustarlo y editarla. Sin id: cuenta nueva.
export function AccountSheet({ s, id, onClose, onMovements }) {
  const today = s.energy.day;
  const a = id ? accountOf(s, id) : null;
  const [edit, setEdit] = useState(!a);
  const [val, setVal] = useState('');
  if (id && !a) return null;
  if (!a) {
    return (
      <Sheet onClose={onClose} label="Nueva cuenta o tarjeta">
        <SheetHead title="Nueva cuenta o tarjeta" onClose={onClose} />
        <AccountForm s={s} acc={null} kind0="cuenta" withBalance onDone={(rid) => { if (rid !== undefined) onClose(rid); else onClose(); }} />
      </Sheet>
    );
  }
  const bal = balances(s);
  const parent = a.kind === 'debito' && !ownsBalance(s, a) ? accountOf(s, a.of) : null;
  const c = accountCur(a);
  const v = (bal[a.id] || {})[c] || 0;
  const saveBal = () => {
    act((st, t) => setAccountBalance(st, a.id, { [c]: num(val) }, t));
    setVal('');
    toast('Saldo guardado: desde aquí lo calculo con tus movimientos', 'check');
  };
  return (
    <Sheet onClose={onClose} label={accountLabel(a)}>
      <SheetHead title={accountLabel(a)} onClose={onClose} />
      {parent ? (
        <div class="note"><Icon name="info" size={18} /><span>Lo que pagas con esta tarjeta de débito sale de <b>{accountLabel(parent)}</b>.</span></div>
      ) : (
        <section class="card" style={{ gap: 8 }}>
          <span class="small semi muted">Saldo</span>
          <span class="display-num tab-num" style={{ fontSize: 34, color: v < 0 ? 'var(--vit-ink)' : 'var(--ink)' }}>{cur(v, c)}</span>
          <span class="small muted">{a.base ? `Pusiste el saldo el ${fmtDay(a.base.day, { weekdayName: false })}; lo demás sale de tus movimientos.` : 'Calculado con tus movimientos. Pon el saldo de hoy para que cuadre con tu banco.'}</span>
          <div class="field">
            <label for="bal">{a.base ? 'Corregir el saldo de hoy' : 'Saldo de hoy'}</label>
            <div class="numrow"><span class="unit">{c === 'USD' ? 'US$' : 'RD$'}</span><input id="bal" class="input" inputMode="decimal" value={val} placeholder={String(v)} onInput={(e) => setVal(e.currentTarget.value)} /></div>
          </div>
          <button type="button" class="btn sm" style={{ alignSelf: 'flex-start' }} disabled={val.trim() === ''} onClick={saveBal}><Icon name="check" size={17} />Guardar saldo</button>
        </section>
      )}
      <button type="button" class="btn soft block" onClick={() => onMovements(a.id)}><Icon name="list" size={18} />Ver sus movimientos</button>
      {!edit && <button type="button" class="link-btn" style={{ alignSelf: 'center' }} onClick={() => setEdit(true)}><Icon name="gear" size={16} />Editar la cuenta</button>}
      {edit && <AccountForm s={s} acc={a} onDone={(rid) => { setEdit(false); if (rid === null) onClose(); }} />}
    </Sheet>
  );
}

// ---------- Plan: el mes, el calendario, los pagos programados y los presupuestos ----------

export function PlanTab({ s, today, setSheet }) {
  const mk = monthKey(today);
  const mp = monthPlan(s, mk, today);
  const [days, setDays] = useState(30);
  const [group, setGroup] = useState('mes');
  const fc = forecast(s, today, days);
  const plans = s.money.plans || [];
  const lists = {
    cobros: plans.filter((p) => p.kind === 'ingreso'),
    mes: plans.filter((p) => p.kind === 'gasto' && isMonthly(p)),
    futuros: plans.filter((p) => isFundPlan(p)),
  };
  const rows = budgetRows(s, mk, today);
  const byDay = fc.points.filter((p) => p.list.length);
  const recurHere = group === 'futuros' ? [] : recurringSuggestions(s, today).filter((r) => (group === 'cobros') === (r.kind === 'ingreso'));
  return (
    <>
      <section class="card" aria-label="Plan del mes">
        <div class="between-c"><h2 class="h2" style={{ textTransform: 'capitalize' }}>{monthName(mk)}</h2>{mp.daysLeft != null && <span class="chip sm">Quedan {plural(mp.daysLeft, 'día', 'días')}</span>}</div>
        {!mp.hasPlans && <span class="small muted">Agrega tu sueldo y tus pagos fijos: así sé cuánto te queda para el día a día.</span>}
        <div class="stack-xs">
          <PlanLine label="Ingresos del mes" sub={mp.got < mp.income ? `recibido ${money(mp.got)}` : 'todo recibido'} value={mp.income} tone="good" />
          <PlanLine label="Pagos fijos" sub={mp.fixed ? `pagado ${money(mp.fixedPaid)}` : ''} value={-mp.fixed} />
          {mp.funds > 0 && <PlanLine label="Apartar para pagos futuros" value={-mp.funds} />}
          <PlanLine label="Gastos del día a día" sub="hasta hoy" value={-mp.variable} />
        </div>
        <div class="between-c" style={{ borderTop: '1.5px solid var(--line)', paddingTop: 10 }}>
          <span class="stack-xs"><span class="strong">{mp.left >= 0 ? 'Te queda' : 'Te pasaste'}</span>{mp.perDay != null && mp.left > 0 && <span class="small semi" style={{ color: 'var(--finanzas-ink)' }}>{money(mp.perDay)} por día hasta fin de mes</span>}</span>
          <span class="display-num tab-num" style={{ fontSize: 28, color: mp.left < 0 ? 'var(--vit-ink)' : 'var(--ink)' }}>{money(Math.abs(mp.left))}</span>
        </div>
      </section>

      <section class="card flush" aria-label="Próximos días">
        <div class="between-c" style={{ padding: '14px 0 6px', gap: 8 }}>
          <h2 class="h2">Lo que viene</h2>
          <div class="chips" role="group" aria-label="Período" style={{ flexWrap: 'nowrap', gap: 6 }}>{[30, 60].map((n) => <TChip key={n} sm on={days === n} onClick={() => setDays(n)}>{n} días</TChip>)}</div>
        </div>
        {fc.ready && (
          <div class={`note ${fc.low.bal < 0 ? 'tone-vit' : ''}`} style={{ marginBottom: 6 }}>
            <Icon name={fc.low.bal < 0 ? 'info' : 'chart'} size={18} />
            <span>{fc.low.bal < 0
              ? <>El <b>{fmtDay(fc.low.date, { weekdayName: false })}</b> tus cuentas quedarían en <b>{money(fc.low.bal)}</b>. Mueve un pago o aparta antes.</>
              : <>Hoy tienes {money(fc.start)} en cuentas; con lo que viene, el punto más bajo es {money(fc.low.bal)} ({whenText(fc.low.date, today).toLowerCase()}) y terminas con {money(fc.end)}.</>}</span>
          </div>
        )}
        {!byDay.length && <p class="small muted" style={{ padding: '2px 0 14px' }}>Sin pagos ni cobros en este período.</p>}
        {byDay.map((d) => (
          <div key={d.day} class="txday">
            <div class="between-c dayhead"><span class="eyebrow" style={{ fontSize: 11.5 }}>{d.day === today ? 'Hoy' : dayShort(d.day)}</span>{fc.ready && <span class="tiny strong tab-num" style={{ color: d.bal < 0 ? 'var(--vit-ink)' : 'var(--muted)', whiteSpace: 'nowrap' }}>Quedaría {money(d.bal)}</span>}</div>
            {d.list.map((it) => <DueRow key={`${it.type}-${it.type === 'card' ? it.a.id : it.p.id}-${it.date}-${it.estimate ? 'e' : ''}`} s={s} it={it} today={today} onPay={() => setSheet(payInitial(s, it, today))} onOpen={() => setSheet(it.type === 'card' ? { kind: 'card', id: it.a.id } : { kind: 'due', item: { plan: it.p.id, date: it.date } })} />)}
          </div>
        ))}
        {fc.items.some((it) => it.type === 'plan' && it.viaCard) && <p class="tiny muted" style={{ padding: '4px 0 12px' }}>Los pagos que haces con tarjeta de crédito salen de tus cuentas cuando pagas la tarjeta.</p>}
      </section>

      <section class="card flush" aria-label="Pagos y cobros programados">
        <div class="between-c" style={{ padding: '14px 0 8px' }}><h2 class="h2">Pagos y cobros fijos</h2></div>
        <div class="seg" role="tablist" aria-label="Tipo">
          {[['mes', 'Del mes'], ['futuros', 'Futuros'], ['cobros', 'Cobros']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={group === k ? 'true' : 'false'} onClick={() => setGroup(k)}>{l}{lists[k].length ? ` · ${lists[k].length}` : ''}</button>)}
        </div>
        {recurHere.length > 0 && (
          <div class="panel stack-sm" style={{ margin: '10px 0 4px' }} aria-label="Pagos que se repiten">
            <span class="small semi"><Icon name="repeat" size={15} /> Se repiten cada mes en tus movimientos. ¿Los agrego a tu plan?</span>
            {recurHere.map((r) => (
              <div key={r.id} class="between-c" style={{ gap: 8 }}>
                <span class="stack-xs" style={{ minWidth: 0 }}>
                  <span class="strong clamp2" style={{ lineHeight: 1.25 }}>{r.name}</span>
                  <span class="tiny muted semi">{r.variable ? '≈ ' : ''}{cur(r.amount, r.currency)} · cerca del {r.day >= 31 ? 'último día' : `día ${r.day}`} · {plural(r.count, 'mes', 'meses')}</span>
                </span>
                <span class="row" style={{ gap: 6, flexShrink: 0 }}>
                  <button type="button" class="btn xs" onClick={() => setSheet({ kind: 'plan', planKind: r.kind, tpl: { kind: r.kind, name: r.name, cat: r.cat, freq: 'mensual', day: r.day, amount: r.amount, currency: r.currency, account: r.account, variable: r.variable } })}>Agregar</button>
                  <button type="button" class="btn xs ghost" aria-label={`No sugerir ${r.name}`} onClick={() => act((st) => dismissRecurring(st, r.id))}><Icon name="close" size={14} /></button>
                </span>
              </div>
            ))}
          </div>
        )}
        {group === 'futuros' && <p class="small muted" style={{ padding: '10px 0 2px' }}>Lo que no pagas cada mes (marbete, seguro, inscripción, Navidad): te digo cuánto apartar al mes para llegar sin apuros.</p>}
        {!lists[group].length && <p class="small muted" style={{ padding: '10px 0 6px' }}>{group === 'cobros' ? 'Tu sueldo y otros ingresos fijos.' : group === 'mes' ? 'Alquiler, luz, internet, colegio, préstamo…' : 'Todavía no hay pagos futuros.'}</p>}
        {lists[group].map((p) => <PlanRow key={p.id} s={s} p={p} today={today} onOpen={() => setSheet({ kind: 'plan', id: p.id })} onFund={() => setSheet({ kind: 'fund', id: p.id })} />)}
        <button type="button" class="lrow" style={{ justifyContent: 'center', fontWeight: 700, color: 'var(--ink)' }} onClick={() => setSheet({ kind: 'plan', planKind: group === 'cobros' ? 'ingreso' : 'gasto', future: group === 'futuros' })}><Icon name="plus" size={18} />{group === 'cobros' ? 'Agregar un cobro' : group === 'futuros' ? 'Agregar un pago futuro' : 'Agregar un pago'}</button>
      </section>

      <section class="card" aria-label="Presupuestos">
        <div class="between-c"><h2 class="h2">Presupuestos</h2><button type="button" class="link-btn" onClick={() => setSheet({ kind: 'budgets' })}>Asignar<Icon name="right" size={16} /></button></div>
        {mp.income > 0 && (
          <span class="small semi" style={{ color: mp.unassigned < 0 ? 'var(--vit-ink)' : 'var(--muted)' }}>
            {mp.unassigned > 0 ? `Sin asignar: ${money(mp.unassigned)} de tus ingresos del mes.` : mp.unassigned < 0 ? `Asignaste ${money(-mp.unassigned)} más de lo que entra.` : 'Cada peso del mes tiene un trabajo.'}
          </span>
        )}
        {!rows.length && <span class="small muted">Ponle un tope a lo que más se te va (comida, salidas, compras) y te aviso al llegar al 80 %.</span>}
        {rows.map((r) => <BudgetRow key={r.c.id} r={r} onOpen={() => setSheet({ kind: 'budgetcat', id: r.c.id })} />)}
      </section>
    </>
  );
}

function PlanLine({ label, sub, value, tone }) {
  return (
    <div class="between-c" style={{ minHeight: 30 }}>
      <span class="stack-xs" style={{ gap: 0 }}><span class="semi">{label}</span>{sub && <span class="tiny muted semi">{sub}</span>}</span>
      <span class="strong tab-num" style={{ color: tone === 'good' ? 'var(--good-ink)' : 'var(--ink)' }}>{value > 0 ? '+' : value < 0 ? '−' : ''}{money(Math.abs(value))}</span>
    </div>
  );
}

function PlanRow({ s, p, today, onOpen, onFund }) {
  const next = planDates(p, today, addDays(today, 800)).find((d) => !p.done[d]);
  const f = fundInfo(s, p, today);
  const inc = p.kind === 'ingreso';
  return (
    <div class="lrow" style={{ minHeight: 64, alignItems: 'flex-start', flexDirection: 'column', gap: 8, opacity: p.paused ? 0.6 : 1 }}>
      <button type="button" class="row" style={{ gap: 12, width: '100%', background: 'none', border: 0, padding: 0, color: 'inherit', textAlign: 'left', font: 'inherit' }} onClick={onOpen} aria-label={`Editar ${p.name}`}>
        <span class="tile sm" style={{ background: inc ? 'var(--good-soft)' : 'var(--finanzas-soft)', color: inc ? 'var(--good-ink)' : 'var(--finanzas-ink)' }}><Icon name={planIcon(s, p)} size={18} /></span>
        <span class="stack-xs grow" style={{ minWidth: 0 }}>
          <span class="strong clamp2" style={{ lineHeight: 1.25 }}>{p.name}{p.paused ? ' · en pausa' : ''}</span>
          <span class="tiny muted semi">{freqLabel(p)}{next && !p.paused ? ` · próximo: ${whenText(next, today).toLowerCase()}` : ''}</span>
        </span>
        <span class="strong tab-num" style={{ color: inc ? 'var(--good-ink)' : 'var(--ink)', whiteSpace: 'nowrap' }}>{inc ? '+' : ''}{p.variable ? '≈ ' : ''}{cur(p.amount, p.currency)}</span>
      </button>
      {f && (
        <span class="stack-xs" style={{ width: '100%', paddingLeft: 48, gap: 6 }}>
          <Bar value={f.pct} color={areaColor('finanzas')} label={`Apartado ${Math.round(f.pct * 100)} %`} />
          <span class="between-c" style={{ gap: 8 }}>
            <span class="tiny semi muted tab-num">Apartado {money(f.saved)} de {money(f.amount)}{f.need > 0 ? ` · aparta ${money(f.perMonth)} al mes` : ' · listo'}</span>
            {f.need > 0 && <button type="button" class="btn xs soft" onClick={onFund}>Apartar</button>}
          </span>
        </span>
      )}
    </div>
  );
}

function BudgetRow({ r, onOpen }) {
  const color = r.over ? 'var(--vit)' : r.pct >= 0.8 ? 'var(--xp)' : areaColor('finanzas');
  const pacePct = r.pace != null && r.avail > 0 ? Math.min(1, r.pace / r.avail) : null;
  return (
    <button type="button" class="stack-sm budget-row" onClick={onOpen} aria-label={`${r.c.name}: ${r.over ? `${money(-r.left)} de más` : `quedan ${money(r.left)}`}`}>
      <span class="between"><span class="strong" style={{ minWidth: 0 }}>{r.c.name}</span><span class="small strong" style={{ color: r.over ? 'var(--vit-ink)' : 'var(--muted)', whiteSpace: 'nowrap' }}>{r.over ? `${money(-r.left)} de más` : `Quedan ${money(r.left)}`}</span></span>
      <span class="pace">
        <Bar value={r.pct} size="lg" color={color} />
        {pacePct != null && <b style={{ left: `${pacePct * 100}%` }} title="Lo esperado a hoy" />}
      </span>
      <span class="tiny muted semi tab-num">
        {money(r.spent)} de {money(r.avail)}{r.carry ? ` (${r.carry > 0 ? '+' : '−'}${money(Math.abs(r.carry))} del mes pasado)` : ''}
        {r.pace != null && !r.over ? (r.ahead > r.avail * 0.05 ? ` · vas ${money(Math.round(r.ahead))} por encima del ritmo` : ' · vas a buen ritmo') : ''}
      </span>
    </button>
  );
}

// Un presupuesto: monto, sobrante que pasa al mes siguiente y movimientos.
export function BudgetCatSheet({ s, id, onClose, onMovements }) {
  const today = s.energy.day;
  const c = s.money.categories.find((x) => x.id === id);
  const [val, setVal] = useState(c ? String(c.budget || '') : '');
  if (!c) return null;
  const r = budgetRows(s, monthKey(today), today).find((x) => x.c.id === id);
  const carry = carryFor(s, c, monthKey(today));
  return (
    <Sheet onClose={onClose} label={`Presupuesto de ${c.name}`}>
      <SheetHead title={c.name} onClose={onClose} />
      {r && <span class="small muted tab-num">Este mes: {money(r.spent)} de {money(r.avail)}{r.pace != null ? ` · a hoy lo esperado era ${money(r.pace)}` : ''}.</span>}
      <div class="field">
        <label for="bud">Presupuesto de cada mes</label>
        <div class="numrow"><span class="unit">RD$</span><input id="bud" class="input" inputMode="decimal" value={val} placeholder="0" onInput={(e) => setVal(e.currentTarget.value)} ref={focusOnMount} /></div>
      </div>
      <label class="between-c panel" style={{ cursor: 'pointer' }}>
        <span class="stack-xs"><span class="semi">Lo que sobre pasa al mes siguiente</span><span class="small muted">Si gastas menos, ese dinero se suma al próximo mes; si te pasas, se resta.{carry ? ` Este mes: ${carry > 0 ? '+' : '−'}${money(Math.abs(carry))}.` : ''}</span></span>
        <Switch checked={!!c.roll} onChange={(v) => act((st, t) => setRollover(st, c.id, v, t))} label="El sobrante pasa al mes siguiente" />
      </label>
      <button type="button" class="btn block" onClick={() => { act((st, t) => setBudget(st, c.id, num(val), t)); toast('Presupuesto guardado', 'check'); onClose(); }}><Icon name="check" size={20} />Guardar</button>
      <button type="button" class="btn soft block" onClick={() => onMovements(null, c.id)}><Icon name="list" size={18} />Ver los gastos de {c.name.toLowerCase()}</button>
    </Sheet>
  );
}

// ---------- Hojas: pago programado, una fecha y apartar ----------

const FREQS = [
  ['mensual', 'Cada mes'], ['quincenal', 'Quincenal'], ['semanal', 'Cada semana'], ['bisemanal', 'Cada 2 semanas'],
  ['meses', 'Cada 2, 3 o 6 meses'], ['anual', 'Cada año'], ['una', 'Una vez'],
];
function freqKey(f) {
  if (!f) return 'mensual';
  if (f.type === 'month') return f.days.length > 1 ? 'quincenal' : 'mensual';
  if (f.type === 'week') return f.n === 2 ? 'bisemanal' : 'semanal';
  if (f.type === 'months') return f.n === 12 ? 'anual' : 'meses';
  return 'una';
}
// Próxima fecha con ese mes y día (para plantillas anuales: «12-20» → el próximo 20 de diciembre).
function nextMD(md, today) {
  const y = Number(today.slice(0, 4));
  const d = `${y}-${md}`;
  return d >= today ? d : `${y + 1}-${md}`;
}

export function PlanSheet({ s, id, tpl, planKind = 'gasto', future = false, onClose }) {
  const today = s.energy.day;
  const p = id ? (s.money.plans || []).find((x) => x.id === id) : null;
  const t0 = tpl || null;
  const [kind, setKind] = useState(p ? p.kind : t0 ? t0.kind || planKind : planKind);
  const [name, setName] = useState(p ? p.name : t0 ? t0.name : '');
  const [amount, setAmount] = useState(p ? String(p.amount || '') : t0 && t0.amount ? String(t0.amount) : '');
  const [currency, setCurrency] = useState(p ? p.currency : t0 && t0.currency === 'USD' ? 'USD' : 'DOP');
  const [variable, setVariable] = useState(p ? !!p.variable : !!(t0 && t0.variable));
  const [cat, setCat] = useState(p ? p.cat : t0 ? t0.cat : null);
  const [pickCat, setPickCat] = useState(false);
  const [account, setAccount] = useState(p ? p.account : t0 && t0.account ? t0.account : '');
  const [fk, setFk] = useState(p ? freqKey(p.freq) : t0 ? t0.freq : future ? 'anual' : 'mensual');
  const [day1, setDay1] = useState(p && p.freq.type === 'month' ? String(p.freq.days[0]) : t0 && t0.day ? String(t0.day) : t0 && t0.freq === 'quincenal' ? '15' : String(Number(today.slice(8))));
  const [day2, setDay2] = useState(p && p.freq.type === 'month' && p.freq.days[1] ? String(p.freq.days[1]) : '31');
  const [date, setDate] = useState(p ? p.freq.anchor || p.freq.date || today : t0 && t0.md ? nextMD(t0.md, today) : today);
  const [months, setMonths] = useState(p && p.freq.type === 'months' && p.freq.n !== 12 ? p.freq.n : 3);
  const [remind, setRemind] = useState(p ? p.remind : 3);
  const [saved, setSaved] = useState('');
  const n = num(amount);
  const freq = fk === 'mensual' ? { type: 'month', days: [num(day1) || 1] }
    : fk === 'quincenal' ? { type: 'month', days: [num(day1) || 15, num(day2) || 31] }
      : fk === 'semanal' ? { type: 'week', n: 1, anchor: date }
        : fk === 'bisemanal' ? { type: 'week', n: 2, anchor: date }
          : fk === 'meses' ? { type: 'months', n: months, anchor: date }
            : fk === 'anual' ? { type: 'months', n: 12, anchor: date } : { type: 'once', date };
  const preview = planDates({ freq, start: today }, today, addDays(today, 400)).slice(0, 3);
  const isFund = kind === 'gasto' && !['mensual', 'quincenal', 'semanal', 'bisemanal'].includes(fk);
  const templates = PLAN_TEMPLATES[kind];
  const accounts = s.money.accounts;
  const ok = name.trim().length >= 2 && n > 0 && (fk === 'mensual' || fk === 'quincenal' ? num(day1) >= 1 && num(day1) <= 31 : !!date);
  const useTpl = (t) => {
    setName(t.name); setCat(t.cat); setVariable(!!t.variable); setFk(t.freq);
    if (t.day) setDay1(String(t.day));
    if (t.freq === 'quincenal') { setDay1('15'); setDay2('31'); }
    if (t.md) setDate(nextMD(t.md, today));
  };
  const save = () => {
    const data = { kind, name, amount: n, currency, variable, cat, account, freq, remind, saved: num(saved) };
    act((st, t) => {
      if (p) updatePlan(st, p.id, { ...data, start: p.start }, t);
      else addPlan(st, { ...data, start: fk === 'mensual' || fk === 'quincenal' ? t : undefined }, t);
    });
    toast(p ? 'Guardado' : kind === 'ingreso' ? 'Cobro agregado' : 'Pago agregado', 'calendar');
    onClose();
  };
  const del = async () => {
    if (!(await ask(`¿Borrar «${p.name}»? Los movimientos que ya registraste se quedan.`, { ok: 'Borrar', danger: true }))) return;
    act((st) => removePlan(st, p.id));
    onClose();
  };
  const freqCats = frequentCats(s, kind, 6);
  const c = cat ? catOf(s, cat) : null;
  return (
    <Sheet onClose={onClose} label={p ? `Editar ${p.name}` : 'Nuevo pago o cobro'}>
      <SheetHead title={p ? p.name : kind === 'ingreso' ? 'Nuevo cobro' : 'Nuevo pago'} onClose={onClose} />
      {!p && (
        <div class="seg" role="tablist" aria-label="Tipo">
          {[['gasto', 'Pago'], ['ingreso', 'Cobro']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={kind === k ? 'true' : 'false'} onClick={() => { setKind(k); setCat(null); }}>{l}</button>)}
        </div>
      )}
      {!p && (
        <div class="chips scroll" role="group" aria-label="Ideas" style={{ margin: '0 -20px', padding: '2px 20px' }}>
          {templates.filter((t) => (future ? !['mensual', 'quincenal'].includes(t.freq) : true)).map((t) => <TChip key={t.name} sm icon={t.icon} on={name === t.name} onClick={() => useTpl(t)}>{t.name}</TChip>)}
        </div>
      )}
      <div class="field"><label for="pname">Nombre</label><input id="pname" class="input" value={name} maxLength={50} placeholder={kind === 'ingreso' ? 'Ej. Sueldo' : 'Ej. Luz'} onInput={(e) => setName(e.currentTarget.value)} /></div>
      <div class="field">
        <label for="pamt">{kind === 'ingreso' ? 'Monto que recibes' : 'Monto'}</label>
        <div class="amount-in">
          <div class="cur-toggle" role="group" aria-label="Moneda">
            <button type="button" aria-pressed={currency === 'DOP' ? 'true' : 'false'} onClick={() => setCurrency('DOP')}>RD$</button>
            <button type="button" aria-pressed={currency === 'USD' ? 'true' : 'false'} onClick={() => setCurrency('USD')}>US$</button>
          </div>
          <input id="pamt" inputMode="decimal" value={amount} onInput={(e) => setAmount(e.currentTarget.value)} placeholder="0.00" aria-label="Monto" />
        </div>
      </div>
      <label class="between-c panel" style={{ cursor: 'pointer' }}>
        <span class="stack-xs"><span class="semi">El monto cambia cada vez</span><span class="small muted">Como la luz: uso este monto como aproximado.</span></span>
        <Switch checked={variable} onChange={setVariable} label="El monto cambia cada vez" />
      </label>
      <div class="stack-sm">
        <span class="label">¿Cada cuánto?</span>
        <div class="chips" role="group" aria-label="Frecuencia">{FREQS.map(([k, l]) => <TChip key={k} sm on={fk === k} onClick={() => setFk(k)}>{l}</TChip>)}</div>
        {fk === 'mensual' && <div class="field"><label for="pd1">Día del mes</label><input id="pd1" class="input" inputMode="numeric" value={day1} maxLength={2} onInput={(e) => setDay1(e.currentTarget.value.replace(/\D/g, '').slice(0, 2))} /><span class="small muted">31 = el último día de cada mes.</span></div>}
        {fk === 'quincenal' && (
          <div class="grid2">
            <div class="field"><label for="pd1">Primer día</label><input id="pd1" class="input" inputMode="numeric" value={day1} maxLength={2} onInput={(e) => setDay1(e.currentTarget.value.replace(/\D/g, '').slice(0, 2))} /></div>
            <div class="field"><label for="pd2">Segundo día</label><input id="pd2" class="input" inputMode="numeric" value={day2} maxLength={2} onInput={(e) => setDay2(e.currentTarget.value.replace(/\D/g, '').slice(0, 2))} /></div>
          </div>
        )}
        {fk === 'meses' && <div class="chips" role="group" aria-label="Cada cuántos meses">{[2, 3, 6].map((m) => <TChip key={m} sm on={months === m} onClick={() => setMonths(m)}>Cada {m} meses</TChip>)}</div>}
        {!['mensual', 'quincenal'].includes(fk) && <div class="field"><label for="pdate">{fk === 'una' ? 'Fecha' : 'Próxima fecha'}</label><input id="pdate" type="date" class="input" value={date} onInput={(e) => setDate(e.currentTarget.value || today)} /></div>}
        {preview.length > 0 && <span class="small muted">Próximas: {preview.map((d) => fmtShort(d)).join(', ')}.</span>}
      </div>
      <div class="stack-sm">
        <span class="label">Categoría</span>
        {!pickCat ? (
          <div class="chips" role="group" aria-label="Categoría">
            {[...(c ? [c] : []), ...freqCats.filter((x) => !c || x.id !== c.id)].slice(0, 6).map((x) => <TChip key={x.id} sm icon={x.icon || 'tag'} on={cat === x.id} onClick={() => setCat(x.id)}>{x.name}</TChip>)}
            <TChip sm icon="grid" onClick={() => setPickCat(true)}>Todas</TChip>
          </div>
        ) : <CatPicker s={s} type={kind} value={cat} onChange={(v) => { setCat(v); setPickCat(false); }} onNew={() => setPickCat(false)} />}
      </div>
      {accounts.length > 0 && (
        <div class="stack-sm">
          <span class="label">{kind === 'ingreso' ? 'Entra a' : 'Lo pagas con'}</span>
          <div class="chips" role="group" aria-label="Cuenta">{[['', 'Sin indicar'], ...accounts.map((a) => [a.id, accountLabel(a)])].map(([v, l]) => <TChip key={v || 'none'} sm on={account === v} onClick={() => setAccount(v)}>{l}</TChip>)}</div>
        </div>
      )}
      <div class="stack-sm">
        <span class="label">Avisarme</span>
        <div class="chips" role="group" aria-label="Avisarme">{[[0, 'El mismo día'], [1, '1 día antes'], [3, '3 días antes'], [7, '1 semana antes']].map(([v, l]) => <TChip key={v} sm on={remind === v} onClick={() => setRemind(v)}>{l}</TChip>)}</div>
      </div>
      {isFund && !p && <div class="field"><label for="psaved">¿Ya tienes algo apartado? (opcional)</label><div class="numrow"><span class="unit">RD$</span><input id="psaved" class="input" inputMode="decimal" value={saved} placeholder="0" onInput={(e) => setSaved(e.currentTarget.value)} /></div></div>}
      <button type="button" class="btn block" disabled={!ok} onClick={save}><Icon name="check" size={20} />Guardar</button>
      {p && (
        <div class="row wrap" style={{ justifyContent: 'center', gap: 18 }}>
          <button type="button" class="link-btn" onClick={() => { act((st, t) => updatePlan(st, p.id, { paused: !p.paused }, t)); onClose(); }}><Icon name={p.paused ? 'play' : 'pause'} size={16} />{p.paused ? 'Reanudar' : 'Pausar'}</button>
          <button type="button" class="link-btn" style={{ color: 'var(--vit-ink)' }} onClick={del}><Icon name="trash" size={16} />Borrar</button>
        </div>
      )}
    </Sheet>
  );
}

// Una fecha de un pago o cobro: pagar, saltar o deshacer.
export function DueSheet({ s, item, onClose, onPay, onEdit }) {
  const today = s.energy.day;
  const p = (s.money.plans || []).find((x) => x.id === item.plan);
  if (!p) return null;
  const done = p.done[item.date];
  const inc = p.kind === 'ingreso';
  const it = { type: 'plan', kind: p.kind, p, date: item.date, amount: p.amount, currency: p.currency };
  return (
    <Sheet onClose={onClose} label={p.name}>
      <SheetHead title={p.name} onClose={onClose} />
      <section class="card" style={{ gap: 6 }}>
        <span class="small semi muted">{fmtDay(item.date)} · {freqLabel(p)}</span>
        <span class="display-num tab-num" style={{ fontSize: 32 }}>{p.variable ? '≈ ' : ''}{cur(p.amount, p.currency)}</span>
        <span class="small muted">{catName(s, p.cat)}{p.account && accountOf(s, p.account) ? ` · ${accountLabel(accountOf(s, p.account))}` : ''}</span>
      </section>
      {done ? (
        <>
          <div class="note tone-good"><Icon name="check" size={18} /><span>{done === 'skip' ? 'Esta vez la saltaste.' : inc ? 'Ya lo recibiste.' : 'Ya lo pagaste.'}</span></div>
          <button type="button" class="btn ghost block" onClick={() => { act((st) => unmarkPlanDate(st, p.id, item.date)); onClose(); }}>{done === 'skip' ? 'Ya no saltar' : 'Volver a pendiente'}</button>
        </>
      ) : (
        <>
          <button type="button" class="btn block" onClick={() => onPay(it)}><Icon name="check" size={20} />{inc ? 'Lo recibí' : 'Lo pagué'}</button>
          <button type="button" class="btn ghost block" onClick={() => { act((st) => skipPlanDate(st, p.id, item.date)); toast('Saltado esta vez', 'skip'); onClose(); }}><Icon name="skip" size={18} />Saltar esta vez</button>
        </>
      )}
      <button type="button" class="link-btn" style={{ alignSelf: 'center' }} onClick={onEdit}><Icon name="edit" size={16} />Editar {inc ? 'el cobro' : 'el pago'}</button>
    </Sheet>
  );
}

export function FundSheet({ s, id, onClose }) {
  const today = s.energy.day;
  const p = (s.money.plans || []).find((x) => x.id === id);
  const f = p ? fundInfo(s, p, today) : null;
  const [val, setVal] = useState(f ? String(Math.round(f.perMonth)) : '');
  if (!p || !f) return null;
  return (
    <Sheet onClose={onClose} label={`Apartar para ${p.name}`}>
      <SheetHead title={`Apartar para ${p.name}`} onClose={onClose} />
      <span class="small muted">Vence el {fmtDay(f.next, { weekdayName: false })}. Tienes {money(f.saved)} de {money(f.amount)}; si apartas {money(f.perMonth)} cada mes, llegas a tiempo.</span>
      <div class="field"><label for="fund">¿Cuánto apartaste?</label><div class="numrow"><span class="unit">RD$</span><input id="fund" class="input" inputMode="decimal" value={val} onInput={(e) => setVal(e.currentTarget.value)} ref={focusOnMount} /></div></div>
      <span class="small muted">Es una cuenta aparte en Astra: el dinero sigue en tu cuenta de banco, pero ya sabes que tiene destino. Al pagar, se usa lo apartado.</span>
      <button type="button" class="btn block" disabled={!(num(val) > 0)} onClick={() => { act((st) => addToFund(st, p.id, num(val))); toast(`Apartaste ${money(num(val))} para ${p.name}`, 'piggy'); onClose(); }}><Icon name="piggy" size={20} />Apartar</button>
      {f.saved > 0 && <button type="button" class="link-btn muted" style={{ alignSelf: 'center' }} onClick={() => { act((st) => addToFund(st, p.id, -Math.min(f.saved, num(val) || f.saved))); onClose(); }}>Sacar de lo apartado</button>}
    </Sheet>
  );
}

