// Te deben y debes (1.10): préstamos con personas, con abonos y fecha acordada; y tu patrimonio mes a mes.
import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Sheet, SheetHead, TChip, Switch, Bar, money, cur, toast, ask, plural, focusOnMount } from '../ui/kit.jsx';
import { act } from '../app/store.js';
import { fmtDay, fmtShort, monthKey, monthName, MONTHS } from '../app/dates.js';
import { accountLabel, fxRate, toDOP } from '../game/logic.js';
import { isCard } from '../game/money.js';
import { toNumber } from '../game/parse.js';
import { ACCOUNT_KINDS } from '../game/content.js';
import {
  loanOf, loanInfo, loanTotals, addLoan, payLoan, removePay, forgiveLoan, reopenLoan, updateLoan, removeLoan,
} from '../game/loans.js';
import { worthSeries } from '../game/worth.js';

const ACC_ICON = Object.fromEntries(ACCOUNT_KINDS.map((k) => [k.key, k.icon]));
const num = (v) => toNumber(String(v || '').replace(/[^\d.,]/g, '')) || 0;
const whole = (v) => money(Math.round(v || 0));
const lcur = (l, v) => cur(v, l.currency);

// «Quedó para el 30 nov», «Venció hace 3 días», «Desde el 7 oct».
function dueText(l, info, today) {
  if (l.closed) return l.forgiven ? `Perdonado el ${fmtShort(l.closed)}` : `Saldado el ${fmtShort(l.closed)}`;
  if (info.late) return `Venció hace ${plural(info.daysLate, 'día', 'días')}`;
  if (l.due) return info.dueIn === 0 ? 'Vence hoy' : info.dueIn === 1 ? 'Vence mañana' : `Quedó para el ${fmtShort(l.due)}`;
  return `Desde el ${fmtShort(l.day)}`;
}

// En el detalle, con la fecha completa: «Quedó para el 30 de noviembre, en 40 días».
function dueLong(l, info, today) {
  if (l.closed || !l.due) return l.closed ? dueText(l, info, today) : 'Sin fecha acordada';
  const d = fmtDay(l.due, { weekdayName: false });
  if (info.late) return `Quedó para el ${d}: venció hace ${plural(info.daysLate, 'día', 'días')}`;
  if (info.dueIn === 0) return 'Quedó para hoy';
  if (info.dueIn === 1) return 'Quedó para mañana';
  return `Quedó para el ${d}, en ${plural(info.dueIn, 'día', 'días')}`;
}

export function LoansCard({ s, today, setSheet }) {
  const loans = s.money.loans || [];
  const open = loans.filter((l) => loanInfo(l, today).open);
  const closed = loans.filter((l) => !loanInfo(l, today).open);
  const lt = loanTotals(s, today);
  const [showClosed, setShowClosed] = useState(false);
  return (
    <section class="card flush" aria-label="Te deben y debes">
      <div class="between-c" style={{ padding: '14px 0 4px' }}>
        <h2 class="h2">Te deben y debes</h2>
        <button type="button" class="link-btn" onClick={() => setSheet({ kind: 'loan', id: null })}>Anotar<Icon name="plus" size={16} /></button>
      </div>
      {!loans.length && <p class="small muted" style={{ padding: '2px 0 14px' }}>Lo que prestas o te prestan otras personas, con sus abonos y la fecha en que quedaron. No cuenta como gasto ni como ingreso, pero sí en lo que tienes.</p>}
      {open.map((l) => {
        const info = loanInfo(l, today);
        const me = l.dir === 'me';
        return (
          <button key={l.id} type="button" class="lrow" style={{ minHeight: 62 }} onClick={() => setSheet({ kind: 'loan', id: l.id })} aria-label={`${me ? `${l.who} te debe` : `Le debes a ${l.who}`} ${lcur(l, info.left)}. ${dueText(l, info, today)}`}>
            <span class="tile sm" style={{ background: me ? 'var(--good-soft)' : 'var(--vit-soft)', color: me ? 'var(--good-ink)' : 'var(--vit-ink)' }}><Icon name={me ? 'download' : 'upload'} size={18} /></span>
            <span class="stack-xs grow" style={{ minWidth: 0 }}>
              <span class="strong clip">{l.who}</span>
              <span class="tiny semi" style={{ color: info.late ? 'var(--vit-ink)' : 'var(--muted)' }}>{me ? 'Te debe' : 'Le debes'} · {dueText(l, info, today)}{info.paid > 0 ? ` · abonado ${lcur(l, info.paid)}` : ''}</span>
            </span>
            <span class="strong tab-num" style={{ color: me ? 'var(--good-ink)' : 'var(--vit-ink)', whiteSpace: 'nowrap' }}>{lcur(l, info.left)}</span>
          </button>
        );
      })}
      {open.length > 0 && (
        <div class="between-c" style={{ padding: '10px 0 12px', gap: 10 }}>
          <span class="small semi muted">{lt.me > 0 ? `Te deben ${whole(lt.me)}` : ''}{lt.me > 0 && lt.yo > 0 ? ' · ' : ''}{lt.yo > 0 ? `Debes ${whole(lt.yo)}` : ''}</span>
          {lt.late > 0 && <span class="chip sm tone-vit">{plural(lt.late, 'vencido', 'vencidos')}</span>}
        </div>
      )}
      {closed.length > 0 && (
        <button type="button" class="lrow" style={{ justifyContent: 'center', fontWeight: 700 }} aria-expanded={showClosed ? 'true' : 'false'} onClick={() => setShowClosed(!showClosed)}>
          {showClosed ? 'Ocultar los saldados' : `Saldados · ${closed.length}`}
        </button>
      )}
      {showClosed && closed.map((l) => (
        <button key={l.id} type="button" class="lrow" style={{ minHeight: 54 }} onClick={() => setSheet({ kind: 'loan', id: l.id })}>
          <span class="tile sm" style={{ background: 'var(--soft)' }}><Icon name="check" size={18} /></span>
          <span class="stack-xs grow" style={{ minWidth: 0 }}><span class="semi clip">{l.who}</span><span class="tiny muted semi">{l.dir === 'me' ? 'Le prestaste' : 'Te prestó'} {lcur(l, l.amount)} · {dueText(l, loanInfo(l, today), today)}</span></span>
        </button>
      ))}
    </section>
  );
}

// Nuevo préstamo, o el detalle de uno: abonos, perdonar, editar y borrar.
export function LoanSheet({ s, id, initial = {}, onClose, onOpenTx = null }) {
  const today = s.energy.day;
  const l = id ? loanOf(s, id) : null;
  const [edit, setEdit] = useState(!l);
  if (l && !edit) return <LoanDetail s={s} l={l} today={today} onClose={onClose} onEdit={() => setEdit(true)} onOpenTx={onOpenTx} />;
  return <LoanForm s={s} l={l} initial={initial} today={today} onClose={l ? () => setEdit(false) : onClose} onDone={onClose} />;
}

function AccountChips({ s, value, onChange, label }) {
  const list = s.money.accounts.filter((a) => !a.hidden);
  return (
    <div class="chips" role="group" aria-label={label}>
      {list.map((a) => <TChip key={a.id} sm icon={ACC_ICON[a.kind] || 'card'} on={value === a.id} onClick={() => onChange(a.id)}>{accountLabel(a)}</TChip>)}
    </div>
  );
}

const firstMoneyAcc = (s) => (s.money.accounts.find((a) => a.kind === 'cuenta' && !a.hidden) || s.money.accounts.find((a) => !isCard(a) && !a.hidden) || {}).id || '';

function LoanForm({ s, l, initial, today, onClose, onDone }) {
  const [dir, setDir] = useState(l ? l.dir : initial.dir || 'me');
  const [who, setWho] = useState(l ? l.who : initial.who || '');
  const [currency, setCurrency] = useState(l ? l.currency : 'DOP');
  const [amount, setAmount] = useState(l ? String(l.amount) : '');
  const [day, setDay] = useState(l ? l.day : today);
  const [due, setDue] = useState(l ? l.due || '' : '');
  const [note, setNote] = useState(l ? l.note : '');
  const [withTx, setWithTx] = useState(!l && s.money.accounts.some((a) => a.base));
  const [account, setAccount] = useState(firstMoneyAcc(s));
  const n = num(amount);
  const me = dir === 'me';
  const ok = n > 0 && who.trim().length > 1 && (!withTx || account);
  const save = () => {
    if (!ok) return;
    if (l) {
      act((st) => updateLoan(st, l.id, { who, amount: n, currency, day, due: due || null, note }));
      toast('Préstamo actualizado', 'check');
      onClose();
      return;
    }
    act((st, t, ev) => addLoan(st, { dir, who, amount: n, currency, day, due: due || null, note, account: withTx ? account : '' }, t, ev));
    toast(me ? `Anotado: ${who.trim()} te debe ${cur(n, currency)}` : `Anotado: le debes ${cur(n, currency)} a ${who.trim()}`, 'check');
    onDone();
  };
  return (
    <Sheet onClose={onClose} label={l ? 'Editar préstamo' : 'Anotar un préstamo'}>
      <SheetHead title={l ? 'Editar préstamo' : 'Anotar un préstamo'} onClose={onClose} />
      {!l && (
        <div class="seg" role="tablist" aria-label="Quién le debe a quién">
          <button type="button" role="tab" aria-selected={me ? 'true' : 'false'} onClick={() => setDir('me')}>Presté (me deben)</button>
          <button type="button" role="tab" aria-selected={!me ? 'true' : 'false'} onClick={() => setDir('yo')}>Me prestaron (debo)</button>
        </div>
      )}
      <div class="field"><label for="lwho">{me ? '¿A quién le prestaste?' : '¿Quién te prestó?'}</label><input id="lwho" class="input" value={who} maxLength={60} onInput={(e) => setWho(e.currentTarget.value)} placeholder="Ej. Luis" ref={l ? undefined : focusOnMount} /></div>
      <div class="field">
        <label for="lamt">Monto</label>
        <div class="amount-in">
          <div class="cur-toggle" role="group" aria-label="Moneda">
            <button type="button" aria-pressed={currency === 'DOP' ? 'true' : 'false'} onClick={() => setCurrency('DOP')}>RD$</button>
            <button type="button" aria-pressed={currency === 'USD' ? 'true' : 'false'} onClick={() => setCurrency('USD')}>US$</button>
          </div>
          <input id="lamt" inputMode="decimal" value={amount} onInput={(e) => setAmount(e.currentTarget.value)} placeholder="0.00" aria-label={`Monto en ${currency === 'USD' ? 'dólares' : 'pesos'}`} />
        </div>
      </div>
      <div class="grid2">
        <div class="field"><label for="lday">Fecha</label><input id="lday" type="date" class="input" value={day} max={today} onInput={(e) => setDay(e.currentTarget.value || today)} /></div>
        <div class="field"><label for="ldue">¿Para cuándo quedó?</label><input id="ldue" type="date" class="input" value={due} min={day} onInput={(e) => setDue(e.currentTarget.value)} /></div>
      </div>
      <div class="field"><label for="lnote">Nota (opcional)</label><input id="lnote" class="input" value={note} maxLength={200} onInput={(e) => setNote(e.currentTarget.value)} placeholder="Ej. Para la inscripción, me paga en dos partes" /></div>
      {!l && (
        <section class="panel stack-sm">
          <label class="between-c" style={{ cursor: 'pointer', gap: 12 }}>
            <span class="stack-xs"><span class="semi">{me ? 'El dinero salió de una cuenta' : 'El dinero entró a una cuenta'}</span><span class="small muted">Lo anoto como movimiento para que tu saldo cuadre. No cuenta como {me ? 'gasto' : 'ingreso'}.</span></span>
            <Switch checked={withTx} onChange={setWithTx} label={me ? 'Anotar la salida del dinero' : 'Anotar la entrada del dinero'} />
          </label>
          {withTx && <AccountChips s={s} value={account} onChange={setAccount} label={me ? 'Cuenta de donde salió' : 'Cuenta a donde entró'} />}
        </section>
      )}
      <button type="button" class="btn block" disabled={!ok} onClick={save}><Icon name="check" size={20} />Guardar</button>
    </Sheet>
  );
}

function LoanDetail({ s, l, today, onClose, onEdit, onOpenTx }) {
  const info = loanInfo(l, today);
  const me = l.dir === 'me';
  const [pay, setPay] = useState(false);
  const [amount, setAmount] = useState(String(info.left));
  const [day, setDay] = useState(today);
  const [withTx, setWithTx] = useState(s.money.accounts.some((a) => a.base));
  const [account, setAccount] = useState(firstMoneyAcc(s));
  const n = Math.min(num(amount), info.left);
  const savePay = () => {
    if (!(n > 0)) return;
    const ev = [];
    act((st, t, e) => { payLoan(st, l.id, { amount: n, day, account: withTx ? account : '' }, t, e); ev.push(...e); });
    const done = n >= info.left - 0.005;
    toast(done ? (me ? `${l.who} terminó de pagarte` : `Saldaste lo que le debías a ${l.who} · +15 XP`) : `Abono de ${lcur(l, n)} anotado`, done ? 'trophy' : 'check');
    setPay(false);
    if (done) onClose();
  };
  const tx0 = l.tx ? s.money.tx.find((t) => t.id === l.tx) : null;
  const rate = fxRate(s, today);
  return (
    <Sheet onClose={onClose} label={`Préstamo: ${l.who}`}>
      <SheetHead title={l.who} onClose={onClose} />
      <section class="stack-sm">
        <span class="small semi muted">{l.closed ? (l.forgiven ? (me ? 'Lo perdonaste' : 'Te lo perdonaron') : 'Saldado') : me ? 'Te debe' : 'Le debes'}</span>
        <span class="display-num tab-num" style={{ fontSize: 34, color: l.closed ? 'var(--ink)' : me ? 'var(--good-ink)' : 'var(--vit-ink)' }}>{lcur(l, l.closed ? l.amount : info.left)}</span>
        {l.currency === 'USD' && !l.closed && <span class="tiny muted semi">≈ {whole(toDOP(info.left, 'USD', rate))}</span>}
        <Bar value={info.pct} size="lg" color={me ? 'var(--good)' : 'var(--finanzas)'} label={`Pagado ${Math.round(info.pct * 100)} %`} />
        <span class="small muted">{me ? 'Le prestaste' : 'Te prestó'} {lcur(l, l.amount)} el {fmtDay(l.day, { weekdayName: false })}{info.paid > 0 ? ` · abonado ${lcur(l, info.paid)}` : ''}.</span>
        <span class="small semi" style={{ color: info.late ? 'var(--vit-ink)' : 'var(--muted)' }}>{dueLong(l, info, today)}.</span>
        {l.note && <span class="small"><span class="muted">Nota: </span>{l.note}</span>}
      </section>
      {l.pays.length > 0 && (
        <section class="card flush" aria-label="Abonos">
          <div style={{ padding: '12px 0 2px' }}><h3 class="eyebrow">Abonos</h3></div>
          {[...l.pays].reverse().map((p) => (
            <div key={p.id} class="lrow" style={{ minHeight: 50 }}>
              <span class="grow semi">{fmtDay(p.day, { weekdayName: false })}</span>
              <span class="strong tab-num">{lcur(l, p.amount)}</span>
              <button type="button" class="icon-btn plain" aria-label={`Quitar el abono del ${fmtShort(p.day)}`} onClick={async () => {
                if (!(await ask(p.tx ? '¿Quitar este abono? También se borra su movimiento.' : '¿Quitar este abono?', { ok: 'Quitar', danger: true }))) return;
                act((st) => removePay(st, l.id, p.id));
              }}><Icon name="trash" size={17} /></button>
            </div>
          ))}
        </section>
      )}
      {!l.closed && (pay ? (
        <section class="panel stack-sm" aria-label="Anotar un abono">
          <div class="grid2">
            <div class="field"><label for="pamt">Abono ({l.currency === 'USD' ? 'US$' : 'RD$'})</label><input id="pamt" class="input" inputMode="decimal" value={amount} onInput={(e) => setAmount(e.currentTarget.value)} ref={focusOnMount} /></div>
            <div class="field"><label for="pday">Fecha</label><input id="pday" type="date" class="input" value={day} max={today} min={l.day} onInput={(e) => setDay(e.currentTarget.value || today)} /></div>
          </div>
          <label class="between-c" style={{ cursor: 'pointer', gap: 12 }}>
            <span class="small semi">{me ? 'Entró a una cuenta' : 'Salió de una cuenta'}</span>
            <Switch checked={withTx} onChange={setWithTx} label={me ? 'Anotar la entrada del dinero' : 'Anotar la salida del dinero'} />
          </label>
          {withTx && <AccountChips s={s} value={account} onChange={setAccount} label={me ? 'Cuenta a donde entró' : 'Cuenta de donde salió'} />}
          <div class="row" style={{ gap: 8 }}>
            <button type="button" class="btn sm ghost grow" onClick={() => setPay(false)}>Cancelar</button>
            <button type="button" class="btn sm grow" disabled={!(n > 0) || (withTx && !account)} onClick={savePay}><Icon name="check" size={18} />Guardar abono</button>
          </div>
        </section>
      ) : <button type="button" class="btn block" onClick={() => setPay(true)}><Icon name="coins" size={20} />{me ? 'Me pagó (anotar abono)' : 'Pagué (anotar abono)'}</button>)}
      <div class="row wrap" style={{ gap: 14, justifyContent: 'center' }}>
        {tx0 && onOpenTx && <button type="button" class="link-btn" onClick={() => onOpenTx(tx0)}><Icon name="receipt" size={16} />Ver el movimiento</button>}
        <button type="button" class="link-btn" onClick={onEdit}><Icon name="edit" size={16} />Editar</button>
        {!l.closed && <button type="button" class="link-btn" onClick={async () => {
          if (!(await ask(me ? `¿Perdonarle a ${l.who} lo que falta (${lcur(l, info.left)})?` : `¿${l.who} te perdonó lo que falta (${lcur(l, info.left)})?`, { ok: me ? 'Perdonar' : 'Sí, me lo perdonó' }))) return;
          act((st, t) => forgiveLoan(st, l.id, t));
          toast(me ? 'Lo perdonaste. Se cierra sin más abonos.' : 'Cerrado: ya no lo debes', 'heart');
        }}><Icon name="heart" size={16} />{me ? 'Perdonar lo que falta' : 'Me lo perdonaron'}</button>}
        {l.closed && <button type="button" class="link-btn" onClick={() => act((st) => reopenLoan(st, l.id))}><Icon name="undo" size={16} />Volver a abrir</button>}
      </div>
      <button type="button" class="link-btn" style={{ color: 'var(--vit-ink)', alignSelf: 'center' }} onClick={async () => {
        const hasTx = l.tx || l.pays.some((p) => p.tx);
        if (!(await ask(hasTx ? '¿Borrar este préstamo? Sus movimientos se quedan en tus cuentas (los puedes borrar aparte).' : '¿Borrar este préstamo?', { ok: 'Borrar', danger: true }))) return;
        act((st) => removeLoan(st, l.id));
        toast('Préstamo borrado', 'trash');
        onClose();
      }}><Icon name="trash" size={16} />Borrar préstamo</button>
    </Sheet>
  );
}

// ---------- Tu patrimonio mes a mes ----------

const short = (v) => {
  const a = Math.abs(v);
  const t = a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)} M` : a >= 1000 ? `${(a / 1000).toFixed(a >= 10000 ? 0 : 1)} mil` : `${Math.round(a)}`;
  return `${v < 0 ? '−' : ''}${t.replace('.0 ', ' ')}`;
};
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export function WorthCard({ s, today }) {
  const w = worthSeries(s, today);
  const [tip, setTip] = useState(null);
  if (!w.ready || w.points.length < 2) return null;
  const pts = w.points;
  const W = 340; const H = 150; const L = 44; const R = 12; const T = 16; const B = 22;
  const vals = pts.map((p) => p.net);
  let lo = Math.min(...vals); let hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.15, Math.abs(hi) * 0.05, 1000);
  lo -= pad; hi += pad;
  const x = (i) => L + (i / Math.max(1, pts.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.net).toFixed(1)}`).join('');
  const area = `${path}L${x(pts.length - 1).toFixed(1)},${(H - B).toFixed(1)}L${x(0).toFixed(1)},${(H - B).toFixed(1)}Z`;
  const label = (p) => (p.day.slice(0, 7) === monthKey(today) ? 'Hoy' : cap(MONTHS[Number(p.day.slice(5, 7)) - 1].slice(0, 3)));
  const lastMonthName = pts.length > 1 ? monthName(pts[pts.length - 2].day.slice(0, 7)).split(' ')[0] : '';
  const firstName = monthName(pts[0].day.slice(0, 7)).split(' ')[0];
  const sign = (v) => `${v >= 0 ? '+' : '−'}${whole(Math.abs(v))}`;
  const t = tip != null ? pts[tip] : null;
  return (
    <section class="card" aria-label="Tu patrimonio mes a mes">
      <div class="between-c"><h2 class="h2">Tu patrimonio</h2><span class="strong tab-num" style={{ color: w.last.net < 0 ? 'var(--vit-ink)' : 'var(--ink)' }}>{whole(w.last.net)}</span></div>
      <span class="small muted">Lo que tienes menos lo que debes, al cierre de cada mes{w.last.lentOut > 0 || w.last.borrowed > 0 ? ' (con lo que te deben y lo que debes a personas)' : ''}.</span>
      <div class="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={pts.map((p) => `${label(p)}: ${whole(p.net)}`).join(', ')}>
          {[lo + pad, (lo + hi) / 2, hi - pad].map((v, i) => (
            <g key={i}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} class="grid" />
              <text x={L - 6} y={y(v) + 4} text-anchor="end" class="axis">{short(v)}</text>
            </g>
          ))}
          <path d={area} class="fill s-in" fill-opacity="0.12" />
          <path d={path} class="ln s-in" />
          {pts.map((p, i) => (
            <g key={p.day} onPointerDown={() => setTip(tip === i ? null : i)} style={{ cursor: 'pointer' }}>
              <rect x={x(i) - 14} y={T} width="28" height={H - T - B} fill="transparent" />
              <circle cx={x(i)} cy={y(p.net)} r={i === pts.length - 1 ? 4.5 : 3} class="dot s-in" />
              {(pts.length <= 7 || i % 2 === (pts.length - 1) % 2) && <text x={x(i)} y={H - 6} text-anchor="middle" class={`axis${i === pts.length - 1 ? ' strong-axis' : ''}`}>{label(p)}</text>}
            </g>
          ))}
        </svg>
        {t && (
          <div class="tip" style={{ left: `${Math.min(62, Math.max(6, (x(tip) / W) * 100 - 10))}%` }}>
            <b>{label(t) === 'Hoy' ? 'Hoy' : `Cierre de ${monthName(t.day.slice(0, 7)).split(' ')[0]}`}</b>
            <span>Tienes: {whole(t.have)}</span>
            {t.owe > 0 && <span>Debes en tarjetas: {whole(t.owe)}</span>}
            {t.credits > 0 && <span>Debes en préstamos: {whole(t.credits)}</span>}
            {t.assets > 0 && <span>Tus bienes: {whole(t.assets)}</span>}
            {t.lentOut > 0 && <span>Te deben: {whole(t.lentOut)}</span>}
            {t.borrowed > 0 && <span>Debes a personas: {whole(t.borrowed)}</span>}
            <span>Patrimonio: {whole(t.net)}</span>
          </div>
        )}
      </div>
      <span class="small semi" style={{ color: w.dMonth < 0 ? 'var(--vit-ink)' : 'var(--good-ink)' }}>
        {w.dMonth != null && `${sign(w.dMonth)} frente al cierre de ${lastMonthName}`}{w.dAll != null && pts.length > 2 ? ` · ${sign(w.dAll)} desde ${firstName}` : ''}.
      </span>
      <span class="tiny muted">Toca un mes para ver el detalle. Se calcula con tus saldos y tus movimientos; si falta alguno, el mes sale corrido.</span>
    </section>
  );
}

