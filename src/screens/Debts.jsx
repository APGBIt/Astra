// La pestaña «Deudas» (1.11; en 1.18 separada en largo y corto plazo): todo lo que debes en un solo lugar.
import { DebtCard } from './Money.jsx';
import { DebtsView } from './Overview.jsx';

export function DebtsTab({ s, today, setSheet }) {
  return <DebtsView s={s} today={today} setSheet={setSheet} DebtCard={DebtCard} />;
}
