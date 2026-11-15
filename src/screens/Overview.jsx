// Resumen de Finanzas (1.18): «Disponible» separado de «Gastos del mes», y lo que debes a largo plazo separado
// de lo del día a día. Los números salen de src/game/overview.js (los mismos en Resumen, Deudas y Análisis).
import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Bar, moneyR, money, plural } from '../ui/kit.jsx';
import { MONTHS, fmtShort, diffDays } from '../app/dates.js';
import { availableNow, monthView, debtSplit, dtiLevel } from '../game/overview.js';
import { creditInfo } from '../game/credits.js';
import { loanInfo } from '../game/loans.js';
import { PLAN_TEMPLATES } from '../game/content.js';
import { balances } from '../game/money.js';
import { CardRow, whenText } from './Money.jsx';

const pct = (v) => `${Math.round(v * 100)} %`;
const monthWord = (mk) => MONTHS[Number(mk.slice(5)) - 1];
// Montos largos (millones) en letra más pequeña para que no se partan.
const numCls = (t) => `strong tab-num debt-num${t.length >= 12 ? ' xl' : t.length >= 10 ? ' lg' : ''}`;
const endText = (d) => { if (!d) return ''; const [y, m] = d.split('-'); return `${MONTHS[Number(m) - 1].slice(0, 3)} ${y}`; };

// ---------- Disponible ----------

const dueName = (it) => (it.type === 'card' ? `tarjeta ${it.a.name}` : it.type === 'credit' ? `cuota de ${it.c.name}` : it.p.name);
const capFirst = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);

export function AvailableCard({ s, today, setTab, setSheet }) {
  const av = availableNow(s, today);
  const [open, setOpen] = useState(false);
  if (!av.ready) {
    return (
      <section class="card" aria-label="Disponible" style={{ background: 'var(--finanzas-soft)', borderColor: 'transparent' }}>
        <span class="eyebrow" style={{ color: 'var(--finanzas-ink)' }}>Tu dinero</span>
        <h2 class="h2">¿Cuánto tienes hoy?</h2>
        <span class="small">Pon el saldo de tus cuentas y lo que debes en tus tarjetas. Desde ahí, cada movimiento lo sube o lo baja solo, y te digo cuánto puedes gastar.</span>
        <button type="button" class="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setTab('cuentas')}><Icon name="bank" size={18} />Poner mis saldos</button>
      </section>
    );
  }
  const short = av.free < 0;
  const when = av.kind === 'cobro' ? (av.days === 0 ? 'Cobras hoy' : av.days === 1 ? 'Hasta tu cobro de mañana' : `Hasta tu cobro, en ${av.days} días`) : `Hasta fin de mes · ${plural(av.days, 'día', 'días')}`;
  const salary = PLAN_TEMPLATES.ingreso[0];
  return (
    <section class="card avail" aria-label="Disponible">
      <div class="between-c"><span class="eyebrow">Disponible</span><span class="chip sm tone-good">{when}</span></div>
      {short ? (
        <span class="stack-xs">
          <span class="display-num tab-num" style={{ fontSize: 34, color: 'var(--vit-ink)' }}>−{moneyR(-av.free)}</span>
          <span class="small strong" style={{ color: 'var(--vit-ink)' }}>Te falta esto para cubrir lo que vence {av.kind === 'cobro' ? 'antes de cobrar' : 'este mes'}. Mira si algún pago se puede mover.</span>
        </span>
      ) : (
        <span class="stack-xs">
          <span class="display-num tab-num" style={{ fontSize: 40 }}>{moneyR(av.free)}</span>
          {av.perDay != null && av.days > 1 && <span class="small strong" style={{ color: 'var(--finanzas-ink)' }}>{moneyR(av.perDay)} por día {av.kind === 'cobro' ? 'hasta que cobres' : 'hasta fin de mes'}</span>}
        </span>
      )}
      <div class="calc" role="group" aria-label="Cómo se calcula lo disponible">
        <div class="calc-row"><span>En tus cuentas y efectivo</span><span class="tab-num">{moneyR(av.liquid)}</span></div>
        <button type="button" class="calc-row" aria-expanded={open ? 'true' : 'false'} onClick={() => setOpen(!open)} disabled={!av.items.length && !av.loans.length}>
          <span class="row" style={{ gap: 4 }}>− Ya comprometido {av.kind === 'cobro' ? 'antes del cobro' : 'este mes'}{(av.items.length + av.loans.length) > 0 && <Icon name={open ? 'down' : 'right'} size={14} />}</span>
          <span class="tab-num">{moneyR(av.committed)}</span>
        </button>
        {open && (
          <div class="calc-list">
            {av.items.map((it, i) => <div key={i} class="calc-sub"><span class="clip">{capFirst(dueName(it))} · {whenText(it.date, today).toLowerCase()}</span><span class="tab-num">{moneyR(it.dop)}</span></div>)}
            {av.loans.map((x) => <div key={x.l.id} class="calc-sub"><span class="clip">Le debes a {x.l.who}</span><span class="tab-num">{moneyR(x.dop)}</span></div>)}
          </div>
        )}
        <div class="calc-row total"><span>= Disponible</span><span class="tab-num" style={{ color: short ? 'var(--vit-ink)' : 'inherit' }}>{short ? '−' : ''}{moneyR(Math.abs(av.free))}</span></div>
      </div>
      <div class="stack-xs">
        {av.savings > 0 && (
          <button type="button" class="lrow" style={{ minHeight: 46 }} onClick={() => setTab('cuentas')}>
            <span class="tile xs" style={{ background: 'var(--good-soft)', color: 'var(--good-ink)' }}><Icon name="piggy" size={15} /></span>
            <span class="stack-xs grow" style={{ gap: 0 }}><span class="semi">Ahorros</span><span class="tiny muted semi">Aparte: no cuentan como disponible</span></span>
            <span class="strong tab-num">{moneyR(av.savings)}</span><Icon name="right" size={16} />
          </button>
        )}
        {av.next && (
          <div class="lrow" style={{ minHeight: 46 }}>
            <span class="tile xs" style={{ background: 'var(--good-soft)', color: 'var(--good-ink)' }}><Icon name="coins" size={15} /></span>
            <span class="stack-xs grow" style={{ gap: 0 }}>
              <span class="semi">Cobras: {av.next.p.name} · {whenText(av.next.date, today).toLowerCase()}</span>
              {av.onPaydayTotal > 0 && <span class="tiny muted semi">Ese día también pagas {moneyR(av.onPaydayTotal)} ({av.onPayday.slice(0, 2).map(dueName).join(', ')}{av.onPayday.length > 2 ? '…' : ''}): sale de lo que cobras.</span>}
            </span>
            <span class="strong tab-num" style={{ color: 'var(--good-ink)' }}>+{moneyR(av.next.p.amount)}</span>
          </div>
        )}
        {av.credit && (av.credit.DOP > 0 || av.credit.USD > 0) && (
          <button type="button" class="lrow" style={{ minHeight: 46 }} onClick={() => setTab('deudas')}>
            <span class="tile xs" style={{ background: 'var(--soft)' }}><Icon name="card" size={15} /></span>
            <span class="stack-xs grow" style={{ gap: 0 }}><span class="semi">Crédito en tus tarjetas</span><span class="tiny muted semi">No es dinero tuyo: si lo usas, lo debes</span></span>
            <span class="strong tab-num muted">{moneyR(av.credit.DOP)}</span><Icon name="right" size={16} />
          </button>
        )}
      </div>
      {av.kind === 'mes' && (
        <button type="button" class="link-btn" style={{ alignSelf: 'flex-start', minHeight: 32 }} onClick={() => setSheet({ kind: 'plan', tpl: { ...salary, kind: 'ingreso' } })}><Icon name="briefcase" size={15} />Agrega tu sueldo y lo calculo hasta tu cobro</button>
      )}
    </section>
  );
}

// ---------- Gastos del mes ----------

export function MonthCard({ s, today, setTab, setSheet }) {
  const mv = monthView(s, today);
  if (!(mv.income > 0) && !(mv.spent > 0) && !(mv.fixed > 0)) return null;
  const committed = mv.fixed + mv.funds;
  const used = committed + mv.variable;
  const base = Math.max(mv.income, used, 1);
  const w = (v) => `${Math.max(0, (v / base) * 100)}%`;
  const leftover = mv.income - used;
  return (
    <section class="card" aria-label={`Gastos de ${monthWord(mv.mk)}`}>
      <div class="between-c"><span class="eyebrow">Gastos de {monthWord(mv.mk)}</span><span class="chip sm">Quedan {plural(mv.daysLeft, 'día', 'días')}</span></div>
      <span class="stack-xs">
        <span class="small semi muted">Llevas gastado</span>
        <span class="display-num tab-num" style={{ fontSize: 32 }}>{moneyR(mv.spent)}</span>
      </span>
      <div class="mbar" role="img" aria-label={`De ${moneyR(mv.income)} que entran: fijos pagados ${moneyR(mv.fixedPaid)}, fijos por pagar ${moneyR(mv.fixedLeft)}, apartado ${moneyR(mv.funds)}, día a día ${moneyR(mv.variable)}${leftover >= 0 ? `, te quedan ${moneyR(leftover)}` : `, te pasas ${moneyR(-leftover)}`}.`}>
        <i class="mb-fixed" style={{ width: w(mv.fixedPaid) }} />
        <i class="mb-fixed-left" style={{ width: w(mv.fixedLeft) }} />
        <i class="mb-funds" style={{ width: w(mv.funds) }} />
        <i class="mb-daily" style={{ width: w(mv.variable) }} />
        {used > mv.income && mv.income > 0 && <b style={{ left: w(mv.income) }} />}
      </div>
      <div class="legend">
        <span><i class="sw mb-fixed" />Fijos pagados</span>
        {mv.fixedLeft > 0 && <span><i class="sw mb-fixed-left" />Por pagar</span>}
        {mv.funds > 0 && <span><i class="sw mb-funds" />Apartado</span>}
        <span><i class="sw mb-daily" />Día a día</span>
        {leftover > 0 && <span><i class="sw mb-left" />Te queda</span>}
        {used > mv.income && mv.income > 0 && <span><i class="sw mark" />Lo que entra</span>}
      </div>
      <div class="stack-xs">
        <button type="button" class="lrow" style={{ minHeight: 54 }} onClick={() => setTab('plan')}>
          <span class="stack-xs grow" style={{ gap: 0 }}><span class="semi">Pagos fijos y cuotas</span><span class="tiny muted semi">Pagado {moneyR(mv.fixedPaid)}{mv.fixedLeft > 0 ? ` · falta ${moneyR(mv.fixedLeft)}` : ' · todo al día'}</span></span>
          <span class="strong tab-num">{moneyR(mv.fixed)}</span><Icon name="right" size={16} />
        </button>
        <button type="button" class="lrow" style={{ minHeight: 54 }} onClick={() => setSheet({ kind: 'budgets' })}>
          <span class="stack-xs grow" style={{ gap: 0 }}><span class="semi">Día a día</span><span class="tiny muted semi">{mv.budgets > 0 ? `Presupuesto ${moneyR(mv.budgets)}` : 'Comida, transporte, salidas… sin presupuesto'}</span></span>
          <span class="strong tab-num">{moneyR(mv.variable)}</span><Icon name="right" size={16} />
        </button>
        {mv.funds > 0 && (
          <button type="button" class="lrow" style={{ minHeight: 54 }} onClick={() => setTab('plan')}>
            <span class="stack-xs grow" style={{ gap: 0 }}><span class="semi">Apartado para pagos futuros</span><span class="tiny muted semi">Seguros, marbete y lo que no es de cada mes</span></span>
            <span class="strong tab-num">{moneyR(mv.funds)}</span><Icon name="right" size={16} />
          </button>
        )}
        <div class="lrow" style={{ minHeight: 54 }}>
          <span class="stack-xs grow" style={{ gap: 0 }}><span class="semi">Lo que entra este mes</span><span class="tiny muted semi">{mv.toGet > 0 ? `Recibido ${moneyR(mv.got)} · por recibir ${moneyR(mv.toGet)}` : 'Todo recibido'}</span></span>
          <span class="strong tab-num" style={{ color: 'var(--good-ink)' }}>+{moneyR(mv.income)}</span>
        </div>
      </div>
      {mv.left >= 0 ? (
        <div class={`note ${mv.over ? 'tone-vit' : 'tone-good'}`} style={{ margin: 0 }}>
          <Icon name={mv.over ? 'info' : 'check'} size={18} />
          <span><b>Te quedan {moneyR(mv.left)} para el día a día:</b> {moneyR(mv.perDay)} por día.{mv.daily > 0 ? (mv.over ? ` Vas gastando ${moneyR(mv.daily)} por día: a ese ritmo te faltarían ${moneyR(-mv.paceEnd)}.` : ` A tu ritmo (${moneyR(mv.daily)} por día) te sobrarían ${moneyR(mv.paceEnd)}.`) : ''}</span>
        </div>
      ) : (
        <div class="note tone-vit" style={{ margin: 0 }}><Icon name="info" size={18} /><span><b>Este mes sale más de lo que entra:</b> lo fijo, lo apartado y lo que llevas pasan lo que entra por {moneyR(-mv.left)}.</span></div>
      )}
    </section>
  );
}

// ---------- Lo que debes (en el Resumen) ----------

function DtiLine({ ds }) {
  const lv = dtiLevel(ds.dti);
  if (!lv || !(ds.installments > 0)) return null;
  return (
    <div class="stack-xs" style={{ gap: 6 }}>
      <div class="between-c"><span class="small semi">Pagar tus deudas se lleva el {pct(ds.dti)} de lo que entra</span><span class={`chip sm tone-${lv.tone}`}>{lv.label}</span></div>
      <Bar value={Math.min(1, ds.dti / 0.5)} color={`var(--${lv.tone === 'good' ? 'good' : lv.tone === 'xp' ? 'xp' : 'vit'})`} label={`Deudas: ${pct(ds.dti)} de tus ingresos`} />
      <span class="tiny muted semi">{moneyR(ds.installments)} al mes de {moneyR(ds.income)} que te entran. Lo ideal: menos del 20 %; la guía: hasta 36 %.</span>
    </div>
  );
}

export function DebtSummary({ s, today, setTab }) {
  const ds = debtSplit(s, today);
  if (!(ds.total > 0) && !(ds.me.total > 0)) return null;
  const shortParts = [ds.short.cards > 0 ? 'tarjetas' : '', ds.short.items.some((x) => x.type === 'credit') ? 'préstamos cortos' : '', ds.short.people > 0 ? 'personas' : ''].filter(Boolean);
  return (
    <section class="card" aria-label="Lo que debes">
      <div class="between-c"><h2 class="h2">Lo que debes</h2><button type="button" class="link-btn" onClick={() => setTab('deudas')}>Deudas<Icon name="right" size={16} /></button></div>
      <div class="debt-split">
        <button type="button" class="debt-box" onClick={() => setTab('deudas')} aria-label={`A largo plazo: ${moneyR(ds.long.total)}`}>
          <span class="tiny semi muted">A largo plazo</span>
          <span class={numCls(moneyR(ds.long.total))}>{moneyR(ds.long.total)}</span>
          <span class="tiny muted semi">{ds.long.items.length ? `${plural(ds.long.items.length, 'préstamo', 'préstamos')} · ${moneyR(ds.long.monthly)}/mes` : 'Nada a más de un año'}</span>
        </button>
        <button type="button" class="debt-box" onClick={() => setTab('deudas')} aria-label={`A corto plazo: ${moneyR(ds.short.total)}`}>
          <span class="tiny semi muted">A corto plazo</span>
          <span class={numCls(moneyR(ds.short.total))} style={{ color: ds.short.total > 0 ? 'var(--vit-ink)' : 'inherit' }}>{moneyR(ds.short.total)}</span>
          <span class="tiny muted semi">{shortParts.length ? shortParts.join(', ') : 'Nada pendiente'}</span>
        </button>
      </div>
      {ds.me.total > 0 && (
        <button type="button" class="lrow" style={{ minHeight: 46 }} onClick={() => setTab('deudas')}>
          <span class="grow semi">Te deben</span><span class="strong tab-num" style={{ color: 'var(--good-ink)' }}>{moneyR(ds.me.total)}</span><Icon name="right" size={16} />
        </button>
      )}
      <DtiLine ds={ds} />
    </section>
  );
}

// ---------- La pestaña Deudas ----------

function CreditRow({ x, today, setSheet }) {
  const i = x.inf;
  const nextTxt = i.next ? `${i.late ? 'Atrasada desde' : 'Próxima'} ${whenText(i.next.date, today).toLowerCase()}` : 'Sin cuotas';
  return (
    <button type="button" class="lrow" style={{ minHeight: 70 }} onClick={() => setSheet({ kind: 'credit', id: x.id })} aria-label={`${x.name}: debes ${moneyR(x.balance)}. Cuota ${moneyR(i.nextAmount)}. ${x.end ? `Termina en ${endText(x.end)}` : ''}`}>
      <span class="tile sm" style={{ background: x.late ? 'var(--vit-soft)' : 'var(--finanzas-soft)', color: x.late ? 'var(--vit-ink)' : 'var(--finanzas-ink)' }}><Icon name={x.icon} size={18} /></span>
      <span class="stack-xs grow" style={{ minWidth: 0 }}>
        <span class="strong clamp2" style={{ lineHeight: 1.25 }}>{x.name}</span>
        <span class="tiny semi" style={{ color: x.late ? 'var(--vit-ink)' : 'var(--muted)' }}>{nextTxt} · {moneyR(i.nextAmount)}</span>
        <Bar value={i.pct} size="sm" color="var(--finanzas)" label={`Pagado ${pct(i.pct)}`} />
      </span>
      <span class="stack-xs" style={{ alignItems: 'flex-end', gap: 0, flexShrink: 0 }}>
        <span class="strong tab-num" style={{ whiteSpace: 'nowrap' }}>{moneyR(x.balance)}</span>
        <span class="tiny muted semi" style={{ whiteSpace: 'nowrap' }}>{x.end ? `hasta ${endText(x.end)}` : i.nLeft != null ? `${i.nLeft} cuotas` : ''}</span>
      </span>
    </button>
  );
}

function LoanRow({ x, today, setSheet }) {
  const l = x.l;
  const me = l.dir === 'me';
  const info = loanInfo(l, today);
  return (
    <button type="button" class="lrow" style={{ minHeight: 60 }} onClick={() => setSheet({ kind: 'loan', id: l.id })} aria-label={`${me ? `${l.who} te debe` : `Le debes a ${l.who}`} ${moneyR(x.balance)}`}>
      <span class="tile sm" style={{ background: me ? 'var(--good-soft)' : 'var(--vit-soft)', color: me ? 'var(--good-ink)' : 'var(--vit-ink)' }}><Icon name={me ? 'download' : 'upload'} size={18} /></span>
      <span class="stack-xs grow" style={{ minWidth: 0 }}>
        <span class="strong clip">{l.who}</span>
        <span class="tiny semi" style={{ color: info.late ? 'var(--vit-ink)' : 'var(--muted)' }}>{me ? 'Te debe' : 'Le debes'}{l.due ? ` · ${info.late ? 'venció' : 'quedó para'} el ${fmtShort(l.due)}` : ' · sin fecha'}{info.paid > 0 ? ` · abonado ${moneyR(info.paid)}` : ''}</span>
      </span>
      <span class="strong tab-num" style={{ color: me ? 'var(--good-ink)' : 'var(--ink)', whiteSpace: 'nowrap' }}>{moneyR(x.balance)}</span>
    </button>
  );
}

export function DebtsView({ s, today, setSheet, DebtCard }) {
  const ds = debtSplit(s, today);
  const bal = balances(s);
  const closedCredits = (s.money.credits || []).filter((c) => !creditInfo(c, today).open);
  const closedLoans = (s.money.loans || []).filter((l) => !loanInfo(l, today).open);
  const [showClosed, setShowClosed] = useState(false);
  const shortCredits = ds.short.items.filter((x) => x.type === 'credit');
  const cards = ds.short.items.filter((x) => x.type === 'card');
  const people = ds.short.items.filter((x) => x.type === 'loan');
  const cardAccounts = s.money.accounts.filter((a) => a.kind === 'tarjeta' && !a.hidden);
  const quietCards = cardAccounts.filter((a) => !cards.some((x) => x.id === a.id));
  const nothing = !ds.total && !ds.me.total && !cardAccounts.length && !(s.money.credits || []).length;
  return (
    <>
      <section class="card" aria-label="Resumen de deudas">
        <span class="eyebrow">Lo que debes</span>
        <div class="debt-split">
          <div class="debt-box static"><span class="tiny semi muted">A largo plazo</span><span class={numCls(moneyR(ds.long.total))}>{moneyR(ds.long.total)}</span><span class="tiny muted semi">Préstamos de más de un año</span></div>
          <div class="debt-box static"><span class="tiny semi muted">A corto plazo</span><span class={numCls(moneyR(ds.short.total))} style={{ color: ds.short.total > 0 ? 'var(--vit-ink)' : 'inherit' }}>{moneyR(ds.short.total)}</span><span class="tiny muted semi">Tarjetas, cortos y personas</span></div>
        </div>
        {ds.me.total > 0 && <div class="lrow" style={{ minHeight: 44 }}><span class="grow semi">Te deben</span><span class="strong tab-num" style={{ color: 'var(--good-ink)' }}>{moneyR(ds.me.total)}</span></div>}
        <DtiLine ds={ds} />
        {nothing && <span class="small muted">No tienes deudas anotadas. Si tienes un préstamo, una tarjeta con saldo o le debes a alguien, anótalo aquí y te ayudo a salir de ello.</span>}
      </section>

      <section class="card flush" aria-label="Deudas a largo plazo">
        <div class="between-c" style={{ padding: '14px 0 2px' }}>
          <span class="stack-xs" style={{ gap: 0 }}><h2 class="h2">A largo plazo</h2><span class="tiny muted semi">Préstamos que terminan en más de un año</span></span>
          <button type="button" class="link-btn" onClick={() => setSheet({ kind: 'credit', id: null })}>Agregar<Icon name="plus" size={16} /></button>
        </div>
        {!ds.long.items.length && <p class="small muted" style={{ padding: '6px 0 14px' }}>Aquí van la hipoteca, el préstamo del carro o de estudios: te digo cuánto va a intereses, cuándo terminas y cuánto ahorras si abonas de más.</p>}
        {ds.long.items.map((x) => <CreditRow key={x.id} x={x} today={today} setSheet={setSheet} />)}
        {ds.long.items.length > 0 && <div class="between-c" style={{ padding: '10px 0 12px' }}><span class="small semi muted">Cuotas: {moneyR(ds.long.monthly)} al mes</span><span class="small semi muted tab-num">{moneyR(ds.long.total)}</span></div>}
      </section>

      <section class="card flush" aria-label="Deudas a corto plazo">
        <div class="between-c" style={{ padding: '14px 0 2px' }}>
          <span class="stack-xs" style={{ gap: 0 }}><h2 class="h2">A corto plazo</h2><span class="tiny muted semi">Lo del día a día: se paga en menos de un año</span></span>
        </div>
        {cards.length > 0 && <h3 class="eyebrow" style={{ padding: '8px 0 0' }}>Tarjetas</h3>}
        {cards.map((x) => <CardRow key={x.id} s={s} a={x.a} today={today} bal={bal} onOpen={() => setSheet({ kind: 'card', id: x.id })} />)}
        {quietCards.map((a) => (
          <button key={a.id} type="button" class="lrow" style={{ minHeight: 52 }} onClick={() => setSheet({ kind: 'card', id: a.id })}>
            <span class="tile sm" style={{ background: 'var(--soft)' }}><Icon name="card" size={18} /></span><span class="grow semi">{a.name}</span><span class="tiny muted semi">Sin saldo</span>
          </button>
        ))}
        {shortCredits.length > 0 && <h3 class="eyebrow" style={{ padding: '10px 0 0' }}>Préstamos que terminan pronto</h3>}
        {shortCredits.map((x) => <CreditRow key={x.id} x={x} today={today} setSheet={setSheet} />)}
        {people.length > 0 && <h3 class="eyebrow" style={{ padding: '10px 0 0' }}>A personas</h3>}
        {people.map((x) => <LoanRow key={x.id} x={x} today={today} setSheet={setSheet} />)}
        {!ds.short.items.length && !quietCards.length && <p class="small muted" style={{ padding: '6px 0 14px' }}>Nada pendiente a corto plazo.</p>}
        <div class="row wrap" style={{ gap: 8, padding: '10px 0 14px' }}>
          <button type="button" class="btn sm soft" onClick={() => setSheet({ kind: 'account', id: null })}><Icon name="card" size={16} />Agregar tarjeta</button>
          <button type="button" class="btn sm soft" onClick={() => setSheet({ kind: 'loan', id: null })}><Icon name="people" size={16} />Anotar préstamo con alguien</button>
        </div>
      </section>

      {ds.me.items.length > 0 && (
        <section class="card flush" aria-label="Te deben">
          <div style={{ padding: '14px 0 2px' }}><h2 class="h2">Te deben</h2></div>
          {ds.me.items.map((x) => <LoanRow key={x.id} x={x} today={today} setSheet={setSheet} />)}
          <div class="between-c" style={{ padding: '10px 0 12px' }}><span class="small semi muted">En total</span><span class="small strong tab-num" style={{ color: 'var(--good-ink)' }}>{moneyR(ds.me.total)}</span></div>
        </section>
      )}

      {DebtCard && <DebtCard s={s} today={today} onOpen={() => setSheet({ kind: 'debts' })} />}
      <button type="button" class="btn soft block" onClick={() => setSheet({ kind: 'credit', id: null, sim: true })}><Icon name="percent" size={18} />¿Cuánto me costaría un préstamo?</button>

      {(closedCredits.length + closedLoans.length) > 0 && (
        <section class="card flush" aria-label="Deudas terminadas">
          <button type="button" class="lrow" style={{ justifyContent: 'center', fontWeight: 700 }} aria-expanded={showClosed ? 'true' : 'false'} onClick={() => setShowClosed(!showClosed)}>
            {showClosed ? 'Ocultar lo que ya pagaste' : `Ya pagado · ${closedCredits.length + closedLoans.length}`}
          </button>
          {showClosed && closedCredits.map((c) => (
            <button key={c.id} type="button" class="lrow" style={{ minHeight: 52 }} onClick={() => setSheet({ kind: 'credit', id: c.id })}>
              <span class="tile sm" style={{ background: 'var(--good-soft)', color: 'var(--good-ink)' }}><Icon name="check" size={18} /></span><span class="grow semi">{c.name}</span><span class="tiny muted semi">{c.closed ? `Terminado el ${fmtShort(c.closed)}` : 'Terminado'}</span>
            </button>
          ))}
          {showClosed && closedLoans.map((l) => (
            <button key={l.id} type="button" class="lrow" style={{ minHeight: 52 }} onClick={() => setSheet({ kind: 'loan', id: l.id })}>
              <span class="tile sm" style={{ background: 'var(--soft)' }}><Icon name="check" size={18} /></span><span class="grow semi">{l.who}</span><span class="tiny muted semi">{l.dir === 'me' ? 'Te pagó' : 'Le pagaste'}</span>
            </button>
          ))}
        </section>
      )}
    </>
  );
}

export { money, diffDays };
