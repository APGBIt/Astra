import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Nav, Bar, Sheet, SheetHead, TChip, money, toast, areaColor, ask } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { go } from '../app/router.js';
import { monthKey, monthName, relDay } from '../app/dates.js';
import { attrLevel, monthSummary, addTx, removeTx, setBudget, catName, bossHP } from '../game/logic.js';
import { parseBankAlert, toNumber, guessCategory } from '../game/parse.js';
import { AreaTodos } from './Todos.jsx';

const SRC_ICON = { recibo: 'receipt', alerta: 'mail', voz: 'mic', manual: 'edit' };
const SRC_LABEL = { recibo: 'recibo', alerta: 'alerta del banco', voz: 'registro rápido', manual: 'manual' };

function shiftMonth(mk, n) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function Finance({ query }) {
  const s = useApp();
  const today = s.energy.day;
  const [mk, setMk] = useState(monthKey(today));
  const [sheet, setSheet] = useState(query.get('alerta') ? { kind: 'alert' } : null);
  const sum = monthSummary(s, mk);
  const lvl = attrLevel(s.attrs.finanzas);
  const cats = s.money.categories.filter((c) => c.budget > 0 || sum.byCat[c.id]);
  const bosses = s.bosses.filter((b) => b.area === 'finanzas' && b.status === 'active');
  const isNow = mk === monthKey(today);

  return (
    <>
      <main class="screen">
        <header class="between-c">
          <div class="stack-xs"><span class="eyebrow" style={{ color: 'var(--finanzas-ink)' }}>Fortuna · Nv {lvl.n}</span><h1 class="h1">Finanzas</h1></div>
          <div class="row" style={{ gap: 8 }}>
            <button type="button" class="icon-btn" aria-label="Pegar alerta del banco" onClick={() => setSheet({ kind: 'alert' })}><Icon name="paste" size={20} /></button>
            <button type="button" class="icon-btn" aria-label="Agregar movimiento" onClick={() => setSheet({ kind: 'tx' })}><Icon name="plus" size={20} /></button>
            <a class="btn sm" href="#/recibo"><Icon name="camera" size={18} />Recibo</a>
          </div>
        </header>

        <div class="between-c">
          <button type="button" class="icon-btn plain" aria-label="Mes anterior" onClick={() => setMk(shiftMonth(mk, -1))}><Icon name="left" /></button>
          <span class="strong" style={{ textTransform: 'capitalize' }}>{monthName(mk)}</span>
          <button type="button" class="icon-btn plain" aria-label="Mes siguiente" disabled={isNow} style={isNow ? { opacity: 0.3 } : null} onClick={() => setMk(shiftMonth(mk, 1))}><Icon name="right" /></button>
        </div>

        {sum.income > 0 ? (
          <section class="card" style={{ background: sum.unassigned >= 0 ? 'var(--finanzas-soft)' : 'var(--vit-soft)', borderColor: 'transparent' }} aria-label="Por asignar">
            <span class="small strong" style={{ color: sum.unassigned >= 0 ? 'var(--finanzas-ink)' : 'var(--vit-ink)' }}>{sum.unassigned > 0 ? 'Falta darle trabajo a' : sum.unassigned < 0 ? 'Asignaste de más' : 'Cada peso tiene un trabajo'}</span>
            <span class="display-num" style={{ fontSize: 38 }}>{money(Math.abs(sum.unassigned))}</span>
            <span class="small">{sum.unassigned > 0 ? 'Repártelo entre tus categorías o dáselo a tu jefe para ganar XP.' : sum.unassigned < 0 ? 'Tus presupuestos suman más que tus ingresos. Ajusta alguno.' : 'Buen trabajo: todo tu ingreso tiene destino.'}</span>
            <button type="button" class="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setSheet({ kind: 'budgets' })}>Asignar presupuestos</button>
          </section>
        ) : (
          <button type="button" class="note" onClick={() => setSheet({ kind: 'tx', type: 'ingreso' })} style={{ border: 'none', textAlign: 'left', color: 'var(--ink)' }}>
            <Icon name="coins" size={20} /><span class="grow">Registra tus ingresos del mes para repartir cada peso.</span><Icon name="right" size={18} />
          </button>
        )}

        {/* En filas: los montos largos (RD$150,000.00) caben sin cortarse. */}
        <section class="card flush" aria-label="Resumen del mes">
          {[['Ingresos', sum.income, null], ['Gastos', sum.spent, null], ['Balance', sum.income - sum.spent, sum.income - sum.spent < 0 ? 'var(--vit-ink)' : sum.income - sum.spent > 0 ? 'var(--good-ink)' : null]].map(([l, v, c]) => (
            <div key={l} class="lrow" style={{ minHeight: 50 }}>
              <span class="grow semi muted">{l}</span>
              <span class="display-num tab-num" style={{ fontSize: l === 'Balance' ? 22 : 19, color: c || undefined }}>{money(v)}</span>
            </div>
          ))}
        </section>

        <section class="card" aria-label="Presupuesto">
          <div class="between-c"><h2 class="h2">Presupuesto</h2><button type="button" class="link-btn" onClick={() => setSheet({ kind: 'budgets' })}>Editar<Icon name="right" size={16} /></button></div>
          {!cats.length && <span class="small muted">Ponle un presupuesto a tus categorías para ver cuánto te queda en cada una.</span>}
          {cats.map((c) => {
            const spent = sum.byCat[c.id] || 0;
            const over = c.budget > 0 && spent > c.budget;
            return (
              <div class="stack-sm" key={c.id}>
                <div class="between"><span class="strong">{c.name}</span><span class="small strong" style={{ color: over ? 'var(--vit-ink)' : 'var(--muted)' }}>{c.budget > 0 ? (over ? `${money(spent - c.budget)} de más` : `Quedan ${money(c.budget - spent)}`) : `${money(spent)} sin presupuesto`}</span></div>
                {c.budget > 0 && <Bar value={spent / c.budget} size="lg" color={over ? 'var(--vit)' : areaColor('finanzas')} label={`${c.name}: ${Math.round((spent / c.budget) * 100)} %`} />}
              </div>
            );
          })}
        </section>

        {bosses.map((b) => (
          <a key={b.id} href={`#/jefe/${b.id}`} class="card" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
            <div class="row"><span class="tile" style={{ background: 'var(--boss)', color: 'var(--xp)' }}><Icon name="sword" /></span><span class="stack-xs grow"><span class="tiny strong muted">Jefe</span><span class="strong">{b.title}</span></span><span class="strong">{Math.round(bossHP(b) * 100)} %</span></div>
            <Bar value={bossHP(b)} size="lg" color="var(--vit)" label={`Vida del jefe ${Math.round(bossHP(b) * 100)} %`} />
            <span class="small muted">{b.money ? `Faltan ${money(b.target - b.progress)}. Registra los pagos con la categoría «${b.source === 'saving' ? 'Ahorro' : 'Pago de deuda'}».` : `${b.progress} de ${b.target} ${b.unit}.`}</span>
          </a>
        ))}

        <AreaTodos area="finanzas" />

        <section class="card flush" aria-label="Movimientos">
          <div class="between-c" style={{ padding: '14px 0 4px' }}><h2 class="h2">Movimientos</h2><span class="small muted">{sum.count}</span></div>
          {!sum.txs.length && <p class="small muted" style={{ padding: '4px 0 16px' }}>Sin movimientos este mes.</p>}
          {sum.txs.slice(0, 60).map((t) => (
            <button type="button" key={t.id} class="lrow" onClick={() => setSheet({ kind: 'detail', tx: t })}>
              <span class="tile sm" style={{ background: 'var(--soft)' }}><Icon name={SRC_ICON[t.source] || 'edit'} size={18} /></span>
              <span class="stack-xs grow"><span class="strong">{t.merchant || catName(s, t.cat)}</span><span class="tiny muted semi">{relDay(t.day, today)} · {catName(s, t.cat)}</span></span>
              <span class="strong tab-num" style={{ color: t.amount > 0 ? 'var(--good-ink)' : 'var(--ink)' }}>{money(t.amount, { sign: t.amount > 0 })}</span>
            </button>
          ))}
        </section>
      </main>
      <Nav active="areas" />
      {sheet && sheet.kind === 'tx' && <TxSheet s={s} initial={sheet} onClose={() => setSheet(null)} />}
      {sheet && sheet.kind === 'alert' && <AlertSheet s={s} onClose={() => setSheet(null)} onParsed={(p) => setSheet({ kind: 'tx', ...p, source: 'alerta' })} />}
      {sheet && sheet.kind === 'budgets' && <BudgetSheet s={s} income={sum.income} onClose={() => setSheet(null)} />}
      {sheet && sheet.kind === 'detail' && <TxDetail s={s} tx={sheet.tx} onClose={() => setSheet(null)} />}
    </>
  );
}

function TxSheet({ s, initial, onClose }) {
  const today = s.energy.day;
  const [type, setType] = useState(initial.type || 'gasto');
  const [amount, setAmount] = useState(initial.amount ? String(initial.amount) : '');
  const [cat, setCat] = useState(initial.cat && initial.cat !== 'ingreso' ? initial.cat : 'super');
  const [merchant, setMerchant] = useState(initial.merchant || '');
  const [day, setDay] = useState(initial.day || today);
  const n = toNumber(String(amount).replace(/[^\d.,]/g, '')) || 0;
  const save = () => {
    if (!n) return;
    act((st, t, ev) => addTx(st, { type, amount: n, cat, merchant, day, source: initial.source || 'manual' }, t, ev));
    toast(type === 'ingreso' ? 'Ingreso guardado' : 'Gasto guardado', 'check');
    onClose();
  };
  return (
    <Sheet onClose={onClose} label="Nuevo movimiento">
      <SheetHead title={initial.source === 'alerta' ? 'Revisa la alerta' : 'Nuevo movimiento'} onClose={onClose} />
      {initial.usd && <div class="note tone-xp"><Icon name="info" size={18} /><span>La alerta está en dólares. Escribe el monto en pesos si quieres convertirlo.</span></div>}
      <div class="chips" role="group" aria-label="Tipo">
        <TChip on={type === 'gasto'} onClick={() => setType('gasto')}>Gasto</TChip>
        <TChip on={type === 'ingreso'} onClick={() => setType('ingreso')}>Ingreso</TChip>
      </div>
      <div class="field"><label for="amt">Monto (RD$)</label><input id="amt" class="input big" inputMode="decimal" value={amount} onInput={(e) => setAmount(e.currentTarget.value)} placeholder="0.00" autoFocus /></div>
      {type === 'gasto' && (
        <div class="field"><label for="tcat">Categoría</label>
          <select id="tcat" class="input" value={cat} onChange={(e) => setCat(e.currentTarget.value)}>
            {s.money.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      <div class="field"><label for="mer">{type === 'gasto' ? 'Comercio o nota' : 'De dónde viene'}</label><input id="mer" class="input" value={merchant} maxLength={60} onInput={(e) => { setMerchant(e.currentTarget.value); if (type === 'gasto' && cat === 'super' && !initial.cat) setCat(guessCategory(e.currentTarget.value) === 'otros' ? cat : guessCategory(e.currentTarget.value)); }} placeholder={type === 'gasto' ? 'Ej. Farmacia' : 'Ej. Quincena'} /></div>
      <div class="field"><label for="tday">Fecha</label><input id="tday" type="date" class="input" value={day} max={today} onInput={(e) => setDay(e.currentTarget.value || today)} /></div>
      <button type="button" class="btn block" disabled={!n} onClick={save}><Icon name="check" size={20} />Guardar</button>
    </Sheet>
  );
}

function AlertSheet({ s, onClose, onParsed }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const paste = async () => {
    try { setText(await navigator.clipboard.readText()); } catch { setErr('No pude leer el portapapeles. Pega el texto a mano.'); }
  };
  const go2 = () => {
    const p = parseBankAlert(text);
    if (!p) { setErr('No encontré un monto en ese texto.'); return; }
    onParsed(p);
  };
  return (
    <Sheet onClose={onClose} label="Pegar alerta del banco">
      <SheetHead title="Alerta del banco" onClose={onClose} />
      <p class="lead">Copia el correo o SMS de consumo que te envía tu banco y pégalo aquí. Saco el monto, el comercio y la fecha.</p>
      <div class="field">
        <label for="al">Texto de la alerta</label>
        <textarea id="al" class="input" rows={5} value={text} onInput={(e) => { setText(e.currentTarget.value); setErr(''); }} placeholder="Consumo aprobado por RD$1,500.00 en ESTACION…" />
      </div>
      {navigator.clipboard && navigator.clipboard.readText && <button type="button" class="btn sm soft" onClick={paste} style={{ alignSelf: 'flex-start' }}><Icon name="paste" size={18} />Pegar del portapapeles</button>}
      {err && <span class="small" style={{ color: 'var(--vit-ink)' }}>{err}</span>}
      <button type="button" class="btn block" disabled={text.trim().length < 6} onClick={go2}>Leer alerta<Icon name="right" size={20} /></button>
      <span class="small muted">El texto se procesa en tu teléfono. No se envía a ningún lado.</span>
    </Sheet>
  );
}

function BudgetSheet({ s, income, onClose }) {
  const [vals, setVals] = useState(Object.fromEntries(s.money.categories.map((c) => [c.id, c.budget ? String(c.budget) : ''])));
  const total = Object.values(vals).reduce((a, v) => a + (toNumber(v) || 0), 0);
  const save = () => {
    act((st) => { for (const [k, v] of Object.entries(vals)) setBudget(st, k, toNumber(v) || 0); });
    toast('Presupuestos guardados', 'check');
    onClose();
  };
  return (
    <Sheet onClose={onClose} label="Presupuestos del mes">
      <SheetHead title="Presupuestos" onClose={onClose} />
      <div class="panel between"><span class="small semi">Asignado</span><span class="strong">{money(total)}{income > 0 ? ` de ${money(income)}` : ''}</span></div>
      <div class="stack-sm">
        {s.money.categories.map((c) => (
          <label key={c.id} class="between-c" style={{ minHeight: 52 }}>
            <span class="semi">{c.name}</span>
            <input class="input" inputMode="decimal" value={vals[c.id]} placeholder="0" onInput={(e) => setVals({ ...vals, [c.id]: e.currentTarget.value })} style={{ width: 140, textAlign: 'right' }} aria-label={`Presupuesto de ${c.name}`} />
          </label>
        ))}
      </div>
      <button type="button" class="btn block" onClick={save}><Icon name="check" size={20} />Guardar</button>
    </Sheet>
  );
}

function TxDetail({ s, tx, onClose }) {
  return (
    <Sheet onClose={onClose} label="Movimiento">
      <SheetHead title={tx.merchant || catName(s, tx.cat)} onClose={onClose} />
      <span class="display-num" style={{ fontSize: 34, color: tx.amount > 0 ? 'var(--good-ink)' : 'var(--ink)' }}>{money(tx.amount, { sign: tx.amount > 0 })}</span>
      <div class="card flush">
        <div class="lrow"><span class="grow muted semi">Fecha</span><span class="strong">{tx.day}</span></div>
        <div class="lrow"><span class="grow muted semi">Categoría</span><span class="strong">{catName(s, tx.cat)}</span></div>
        <div class="lrow"><span class="grow muted semi">Origen</span><span class="strong">{SRC_LABEL[tx.source] || tx.source}</span></div>
        {tx.rnc && <div class="lrow"><span class="grow muted semi">RNC</span><span class="strong">{tx.rnc}</span></div>}
        {tx.ncf && <div class="lrow"><span class="grow muted semi">NCF / e-NCF</span><span class="strong">{tx.ncf}</span></div>}
        {tx.itbis > 0 && <div class="lrow"><span class="grow muted semi">ITBIS</span><span class="strong">{money(tx.itbis)}</span></div>}
        {tx.note && <div class="lrow"><span class="grow muted semi">Nota</span><span class="strong">{tx.note}</span></div>}
      </div>
      <button type="button" class="btn ghost block" style={{ color: 'var(--vit-ink)' }} onClick={async () => { if (await ask('¿Borrar este movimiento?', { ok: 'Borrar', danger: true })) { act((st) => removeTx(st, tx.id)); toast('Movimiento borrado', 'trash'); onClose(); } }}><Icon name="trash" size={18} />Borrar</button>
    </Sheet>
  );
}

export { go };
