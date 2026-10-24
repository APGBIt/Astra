// La pestaña «Deudas» (1.11): todo lo que debes en un solo lugar, en vez de repartido entre Cuentas, Plan y el menú.
import { Icon } from '../ui/icons.jsx';
import { money, plural } from '../ui/kit.jsx';
import { balances, moneyTotals, isCard } from '../game/money.js';
import { loanTotals } from '../game/loans.js';
import { creditTotals } from '../game/credits.js';
import { CardRow, DebtCard } from './Money.jsx';
import { CreditsCard } from './Credits.jsx';
import { LoansCard } from './Loans.jsx';

export function DebtsTab({ s, today, setSheet }) {
  const bal = balances(s);
  const t = moneyTotals(s, today, bal);
  const lt = loanTotals(s, today);
  const ct = creditTotals(s, today);
  const cards = s.money.accounts.filter((a) => isCard(a) && !a.hidden);
  const total = t.oweDOP + lt.yo + ct.owe;
  const nothing = !total && !(s.money.credits || []).length && !(s.money.loans || []).length && !cards.length;
  return (
    <>
      <section class="card" aria-label="Lo que debes">
        <span class="eyebrow">Debes en total</span>
        <span class="display-num tab-num" style={{ fontSize: 36, color: total > 0 ? 'var(--vit-ink)' : 'var(--ink)' }}>{money(Math.round(total))}</span>
        <div class="stack-xs">
          {ct.owe > 0 && <div class="lrow" style={{ minHeight: 44 }}><span class="grow semi muted">Préstamos</span><span class="strong tab-num">{money(Math.round(ct.owe))}</span></div>}
          {t.oweDOP > 0 && <div class="lrow" style={{ minHeight: 44 }}><span class="grow semi muted">Tarjetas</span><span class="strong tab-num">{money(Math.round(t.oweDOP))}</span></div>}
          {lt.yo > 0 && <div class="lrow" style={{ minHeight: 44 }}><span class="grow semi muted">A personas</span><span class="strong tab-num">{money(Math.round(lt.yo))}</span></div>}
        </div>
        {ct.monthly > 0 && <span class="small semi" style={{ color: 'var(--finanzas-ink)' }}>En cuotas de préstamos pagas {money(Math.round(ct.monthly))} al mes{ct.interestLeft > 0 ? ` y te faltan ${money(Math.round(ct.interestLeft))} de intereses` : ''}.</span>}
        {nothing && <span class="small muted">No tienes deudas anotadas. Si tienes un préstamo, una tarjeta con saldo o le debes a alguien, anótalo aquí y te ayudo a salir de ello.</span>}
      </section>

      <CreditsCard s={s} today={today} setSheet={setSheet} />

      <section class="card flush" aria-label="Tarjetas de crédito">
        <div style={{ padding: '14px 0 4px' }}><h2 class="h2">Tarjetas</h2></div>
        {!cards.length && <p class="small muted" style={{ padding: '2px 0 12px' }}>Agrega tu tarjeta con su fecha de corte y de pago: te digo cuánto pagar y cuándo.</p>}
        {cards.map((a) => <CardRow key={a.id} s={s} a={a} today={today} bal={bal} onOpen={() => setSheet({ kind: 'card', id: a.id })} />)}
        <button type="button" class="lrow" style={{ justifyContent: 'center', fontWeight: 700, color: 'var(--ink)' }} onClick={() => setSheet({ kind: 'account', id: null })}><Icon name="plus" size={18} />Agregar tarjeta</button>
      </section>

      <LoansCard s={s} today={today} setSheet={setSheet} />
      <DebtCard s={s} today={today} onOpen={() => setSheet({ kind: 'debts' })} />
    </>
  );
}
