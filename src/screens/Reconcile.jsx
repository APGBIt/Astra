// Cuadrar una cuenta o tarjeta con el banco (1.12): se ve la diferencia antes de guardar, se anota como ajuste (que luego
// se reparte en categorías) y queda un historial. «¿De dónde sale este saldo?» explica el número.
import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { cur, toast, plural } from '../ui/kit.jsx';
import { act } from '../app/store.js';
import { fmtShort } from '../app/dates.js';
import { isCard } from '../game/money.js';
import { reconcilePreview, reconcileBalance, balanceBreakdown, balanceCurrencies, EPS } from '../game/reconcile.js';

const shown = (a, v) => (isCard(a) ? Math.abs(v) : v);

// `amounts`: lo que escribió la persona ({ DOP, USD }; en una tarjeta, lo que debe). Muestra qué cambia y guarda.
export function ReconcilePanel({ s, a, amounts, onDone, label = 'Guardar saldo' }) {
  const today = s.energy.day;
  const rows = reconcilePreview(s, a.id, amounts, today);
  const [busy, setBusy] = useState(false);
  if (!rows.length) return null;
  const first = rows.every((r) => r.first);
  const diffs = rows.filter((r) => r.diff != null && Math.abs(r.diff) >= EPS);
  const run = (mode) => {
    if (busy) return;
    setBusy(true);
    const out = act((st, t) => reconcileBalance(st, a.id, amounts, t, Date.now(), { mode }));
    const adj = out.filter((r) => r.mode === 'ajuste');
    toast(first ? 'Saldo guardado: desde aquí lo calculo con tus movimientos' : adj.length ? `Cuadrado: anoté ${adj.length === 1 ? 'un ajuste' : 'ajustes'} de ${adj.map((r) => cur(Math.abs(r.diff), r.c)).join(' y ')}` : mode === 'reiniciar' ? 'Saldo puesto como punto de partida' : 'Tu saldo ya cuadraba con el banco', 'check');
    onDone();
  };
  return (
    <div class="stack-sm" aria-live="polite">
      {!first && diffs.length === 0 && <div class="note tone-good"><Icon name="check" size={18} /><span>Cuadra: es lo mismo que Astra calculó con tus movimientos.</span></div>}
      {diffs.map((r) => {
        const less = r.diff < 0;
        return (
          <div key={r.c} class={`note ${less ? 'tone-xp' : ''}`}>
            <Icon name="info" size={18} />
            <span class="stack-xs">
              <span>Astra calculó <b>{cur(shown(a, r.expected), r.c)}</b>{isCard(a) ? ' de deuda' : ''} y tu banco dice <b>{cur(shown(a, r.target), r.c)}</b>.</span>
              <span class="small">{isCard(a) ? (less ? 'Debes más de lo que anotaste' : 'Debes menos de lo que anotaste') : less ? 'Salió más dinero del que anotaste' : 'Entró más dinero del que anotaste'}: <b>{cur(Math.abs(r.diff), r.c)}</b>.</span>
            </span>
          </div>
        );
      })}
      <div class="row wrap" style={{ gap: 8 }}>
        <button type="button" class="btn sm" disabled={busy} onClick={() => run('ajuste')}><Icon name="check" size={17} />{first ? label : diffs.length ? 'Cuadrar y anotar la diferencia' : 'Confirmar'}</button>
      </div>
      {diffs.length > 0 && <span class="tiny muted">La diferencia se anota como «{diffs.some((r) => r.diff < 0) ? 'Gastos sin anotar' : 'Ingresos sin anotar'}» para que tus gastos expliquen el saldo; luego la puedes repartir en categorías.</span>}
      {diffs.length > 0 && <button type="button" class="link-btn" style={{ alignSelf: 'flex-start', minHeight: 32 }} disabled={busy} onClick={() => run('reiniciar')}>Solo poner este saldo, sin anotar nada</button>}
    </div>
  );
}

// «¿De dónde sale este saldo?»: el último saldo, lo que entró, salió y se movió, los ajustes y lo que quedó dentro del saldo.
export function BalanceWhy({ s, a, onOpenTx = null }) {
  const [open, setOpen] = useState(false);
  const cs = balanceCurrencies(a).filter((c) => a.base && (c === (isCard(a) ? c : c)));
  if (!a.base) return null;
  const hist = (a.recon || []).filter((x) => x.mode === 'ajuste' || x.mode === 'reiniciar').slice(-5).reverse();
  return (
    <section class="card flush" aria-label="De dónde sale el saldo">
      <button type="button" class="lrow" style={{ minHeight: 52 }} aria-expanded={open ? 'true' : 'false'} onClick={() => setOpen(!open)}>
        <span class="tile sm" style={{ background: 'var(--soft)' }}><Icon name="list" size={17} /></span>
        <span class="grow strong">¿De dónde sale este saldo?</span><Icon name={open ? 'arrowup' : 'down'} size={16} />
      </button>
      {open && cs.map((c) => {
        const b = balanceBreakdown(s, a.id, c);
        if (!b) return null;
        const sg = (v) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${cur(Math.abs(v), c)}`;
        return (
          <div key={c} class="stack-xs" style={{ padding: '4px 0 12px' }}>
            {cs.length > 1 && <span class="eyebrow">{c === 'USD' ? 'Dólares' : 'Pesos'}</span>}
            <div class="between-c"><span class="small semi muted">Saldo que pusiste{b.day ? ` (${fmtShort(b.day)}${b.time ? `, ${b.time}` : ''})` : ''}</span><span class="strong tab-num">{cur(shown(a, b.base), c)}</span></div>
            {b.in !== 0 && <div class="between-c"><span class="small semi muted">Entradas desde entonces</span><span class="strong tab-num" style={{ color: 'var(--good-ink)' }}>{sg(b.in)}</span></div>}
            {b.out !== 0 && <div class="between-c"><span class="small semi muted">Gastos desde entonces</span><span class="strong tab-num">{sg(b.out)}</span></div>}
            {b.moved !== 0 && <div class="between-c"><span class="small semi muted">Traspasos y pagos entre cuentas</span><span class="strong tab-num">{sg(b.moved)}</span></div>}
            {b.adjust !== 0 && <div class="between-c"><span class="small semi muted">Ajustes con el banco</span><span class="strong tab-num">{sg(b.adjust)}</span></div>}
            <div class="between-c" style={{ borderTop: '1.5px solid var(--line)', paddingTop: 6 }}><span class="semi">Saldo ahora</span><span class="strong tab-num">{cur(shown(a, b.expected), c)}</span></div>
            {b.inside.length > 0 && <span class="tiny muted">{plural(b.inside.length, 'movimiento', 'movimientos')} {b.inside.length === 1 ? 'es' : 'son'} de antes de ese saldo: ya {b.inside.length === 1 ? 'estaba' : 'estaban'} dentro y no lo mueven. Si el banco aún no lo(s) cobraba, ábrelo(s) y activa «Descontarlo ahora».</span>}
          </div>
        );
      })}
      {open && hist.length > 0 && (
        <div class="stack-xs" style={{ padding: '0 0 12px' }}>
          <span class="eyebrow">Últimos ajustes</span>
          {hist.map((x, i) => (
            <button key={i} type="button" class="lrow" style={{ minHeight: 44 }} disabled={!x.tx || !onOpenTx} onClick={() => { const t = s.money.tx.find((y) => y.id === x.tx); if (t && onOpenTx) onOpenTx(t); }}>
              <span class="grow small semi">{fmtShort(x.day)} · {x.mode === 'reiniciar' ? 'saldo reiniciado' : x.diff < 0 ? 'gastos sin anotar' : 'ingresos sin anotar'}</span>
              <span class="strong tab-num">{x.mode === 'reiniciar' ? cur(Math.abs(x.now), x.c) : `${x.diff < 0 ? '−' : '+'}${cur(Math.abs(x.diff), x.c)}`}</span>
              {x.tx && onOpenTx && <Icon name="right" size={15} />}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
