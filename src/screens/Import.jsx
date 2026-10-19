import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { TopBar, Sheet, SheetHead, TChip, money, usd, cur, rateText, toast, plural, focusOnMount } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { go } from '../app/router.js';
import { fmtDay } from '../app/dates.js';
import { catOf, catName, fxRate, toDOP, toUSD, findDuplicate, accountLabel, importTxs, guessTxCat } from '../game/logic.js';
import { parseBankAlerts, norm } from '../game/parse.js';
import { CatPicker } from '../ui/catpicker.jsx';

// Movimientos que llegan de otra pantalla (avisos pegados) para revisarlos aquí.
let pending = null;
export function setPending(p) { pending = p; }

// Enlace «#/importar?d=…»: «z» + base64url de JSON comprimido (deflate) o «j» + base64url de JSON.
// Los datos van después del «#», así que nunca salen de tu teléfono hacia ningún servidor.
function fromB64url(t) {
  const b = t.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export async function decodePack(d) {
  const kind = d[0];
  const bytes = fromB64url(d.slice(1));
  let text;
  if (kind === 'z') {
    if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no puede abrir el enlace. Usa el archivo.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    text = await new Response(stream).text();
  } else text = new TextDecoder().decode(bytes);
  return JSON.parse(text);
}

// Valida y prepara: qué va marcado, qué ya está en Astra y qué cuentas son nuevas.
function prepare(s, raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items)) throw new Error('Ese archivo no tiene movimientos de Astra.');
  if (raw.app && !/^astra/.test(String(raw.app))) throw new Error('Ese archivo no es de Astra.');
  const accounts = Array.isArray(raw.accounts) ? raw.accounts.filter((a) => a && a.name) : [];
  // Si llevas el saldo de tus cuentas, los pagos de tarjeta y lo que mueves entre cuentas también se
  // agregan (mueven saldos). Un pago de tarjeta además cuenta como golpe al jefe de deudas.
  const balances = s.money.accounts.some((a) => a.base);
  const items = raw.items.slice(0, 500).map((it, i) => {
    const kind = ['gasto', 'ingreso', 'transfer', 'declined'].includes(it.kind) ? it.kind : 'gasto';
    const currency = it.currency === 'USD' ? 'USD' : 'DOP';
    const amount = Math.abs(Number(it.amount) || 0);
    const day = /^\d{4}-\d{2}-\d{2}$/.test(it.day || '') ? it.day : s.energy.day;
    const dup = kind !== 'declined' && !!findDuplicate(s, { ...it, currency, amount, day });
    const cat = it.cat && catOf(s, it.cat).type === (kind === 'declined' ? 'gasto' : kind) ? it.cat : guessTxCat(s, { merchant: it.merchant, text: it.note, type: kind === 'declined' ? 'gasto' : kind });
    return {
      key: `${i}`, kind, currency, amount, day, time: it.time || '', merchant: String(it.merchant || '').slice(0, 60), cat,
      account: it.account || null, to: it.to || null, tag: it.tag || '', note: it.note || '', ref: it.ref || '', rate: Number(it.rate) || null,
      why: it.why || (dup ? 'Ya está en Astra.' : ''), check: it.check || '', dup,
      on: kind !== 'declined' && !dup && it.on !== false && (kind !== 'transfer' || it.on === true || balances),
    };
  }).filter((it) => it.amount > 0);
  return { label: String(raw.label || 'Movimientos').slice(0, 80), source: raw.source || 'importado', accounts, rates: raw.rates || {}, rateSource: raw.rateSource || '', items };
}

// Nombre de la cuenta de un movimiento (de la lista del paquete o descrita en el aviso).
function accName(s, pack, a) {
  if (!a) return '';
  if (typeof a === 'string') {
    const inPack = pack.accounts.find((x) => x.id === a);
    const known = s.money.accounts.find((x) => x.id === a);
    return accountLabel(known || inPack);
  }
  return accountLabel(a);
}
// Cuentas que se van a crear al importar.
function newAccounts(s, pack) {
  const out = [];
  const known = (a) => s.money.accounts.some((x) => (a.id && x.id === a.id) || (a.last4 && x.last4 === a.last4 && (!a.bank || !x.bank || norm(x.bank) === norm(a.bank))));
  const seen = new Set();
  for (const it of pack.items) {
    if (!it.on) continue;
    for (const ref of [it.account, it.to]) {
      const a = typeof ref === 'string' ? pack.accounts.find((x) => x.id === ref) : ref;
      if (!a || known(a)) continue;
      const k = `${a.bank}|${a.last4}|${a.name}`;
      if (!seen.has(k)) { seen.add(k); out.push(a); }
    }
  }
  return out;
}

export function Import({ query }) {
  const s = useApp();
  const today = s.energy.day;
  const [pack, setPack] = useState(() => {
    const p = pending;
    pending = null;
    try { return p ? prepare(s, p) : null; } catch { return null; }
  });
  const [err, setErr] = useState('');
  const d = query.get('d') || '';
  const [loading, setLoading] = useState(!pack && !!d);
  const [paste, setPaste] = useState('');
  const [edit, setEdit] = useState(null);

  // Un enlace con movimientos («#/importar?d=…»). Si abres otro enlace aquí mismo, se carga el nuevo.
  useEffect(() => {
    if (!d) return;
    setLoading(true);
    decodePack(d)
      .then((raw) => { setPack(prepare(s, raw)); setErr(''); })
      .catch((e) => setErr(e && e.message && !/JSON|atob|decode/i.test(e.message) ? e.message : 'No pude abrir esos movimientos. El enlace puede estar incompleto: ábrelo de nuevo o usa el archivo.'))
      .finally(() => setLoading(false));
  }, [d]);

  const onFile = async (e) => {
    const f = e.currentTarget.files && e.currentTarget.files[0];
    if (!f) return;
    try { setPack(prepare(s, JSON.parse(await f.text()))); setErr(''); } catch (x) { setErr(x && x.message && !/JSON/.test(x.message) ? x.message : 'No pude leer ese archivo.'); }
  };
  const readPaste = () => {
    const items = parseBankAlerts(paste);
    if (!items.length) { setErr('No encontré movimientos en ese texto.'); return; }
    setPack(prepare(s, { label: 'Avisos del banco', source: 'alerta', items }));
    setErr('');
  };

  if (loading) {
    return (
      <main class="screen no-nav">
        <TopBar title="Importar" backTo="/finanzas" />
        <div class="stack">{[80, 60, 90, 50].map((w, i) => <div key={i} class="skeleton" style={{ height: 18, width: `${w}%` }} />)}</div>
      </main>
    );
  }

  if (!pack) {
    return (
      <main class="screen no-nav">
        <TopBar title="Importar movimientos" backTo="/finanzas" />
        <div class="stack-sm"><h1 class="h1">Agrega varios movimientos a la vez</h1><p class="lead">Revisas cada uno antes de guardarlo: categoría, moneda y si ya estaba.</p></div>
        {err && <div class="note tone-vit" role="alert"><Icon name="info" size={18} /><span>{err}</span></div>}
        <section class="card" aria-label="Desde un archivo">
          <div class="row"><span class="tile" style={{ background: 'var(--finanzas-soft)', color: 'var(--finanzas-ink)' }}><Icon name="folder" /></span><span class="stack-xs grow"><span class="strong">Archivo de movimientos</span><span class="small muted">El archivo .json que te preparó Claude o que guardaste de Astra.</span></span></div>
          <label class="btn block" style={{ position: 'relative' }}>
            <Icon name="folder" size={20} />Elegir archivo
            <input type="file" accept="application/json,.json" onChange={onFile} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} aria-label="Elegir archivo de movimientos" />
          </label>
        </section>
        <section class="card" aria-label="Desde avisos del banco">
          <div class="row"><span class="tile" style={{ background: 'var(--finanzas-soft)', color: 'var(--finanzas-ink)' }}><Icon name="mail" /></span><span class="stack-xs grow"><span class="strong">Avisos del banco</span><span class="small muted">Pega uno o varios correos o SMS de consumo, pago o transferencia.</span></span></div>
          <textarea class="input" rows={5} value={paste} onInput={(e) => { setPaste(e.currentTarget.value); setErr(''); }} aria-label="Texto de los avisos" placeholder="Pega aquí los avisos" />
          <button type="button" class="btn block" disabled={paste.trim().length < 6} onClick={readPaste}>Leer avisos<Icon name="right" size={20} /></button>
        </section>
      </main>
    );
  }

  const rate = fxRate(s, today);
  const sel = pack.items.filter((it) => it.on);
  const gastos = sel.filter((it) => it.kind === 'gasto');
  const rateOf = (it) => it.rate || pack.rates[it.day] || fxRate(s, it.day);
  const dopOf = (it) => toDOP(it.amount, it.currency, rateOf(it));
  const usdOf = (it) => (it.currency === 'USD' ? it.amount : toUSD(it.amount, rateOf(it)));
  const totDOP = gastos.reduce((a, it) => a + dopOf(it), 0);
  const totUSD = gastos.reduce((a, it) => a + usdOf(it), 0);
  const inUSD = gastos.filter((it) => it.currency === 'USD').reduce((a, it) => a + it.amount, 0);
  const inDOP = gastos.filter((it) => it.currency === 'DOP').reduce((a, it) => a + it.amount, 0);
  const accs = newAccounts(s, pack);
  const days = [];
  for (const it of [...pack.items].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.time < b.time ? 1 : -1))) {
    const last = days[days.length - 1];
    if (last && last.day === it.day) last.list.push(it); else days.push({ day: it.day, list: [it] });
  }
  const setItem = (key, patch) => setPack({ ...pack, items: pack.items.map((it) => (it.key === key ? { ...it, ...patch } : it)) });
  const setAll = (on) => setPack({ ...pack, items: pack.items.map((it) => (it.kind === 'declined' ? it : { ...it, on: on && !it.dup && it.kind !== 'transfer' })) });

  const doImport = () => {
    const r = act((st, t, ev) => importTxs(st, pack, t, ev));
    toast(r.added ? `Agregados ${plural(r.added, 'movimiento', 'movimientos')}${r.skipped ? ` · ${r.skipped} ya estaban` : ''}` : 'No había movimientos nuevos', r.added ? 'check' : 'info');
    go('/finanzas', { replace: true });
  };

  return (
    <>
      <main class="screen no-nav" style={{ paddingBottom: 'calc(110px + env(safe-area-inset-bottom, 0px))' }}>
        <TopBar title="Revisar movimientos" backTo="/finanzas" />
        <div class="stack-sm">
          <span class="eyebrow">{pack.label}</span>
          <h1 class="h1 sm">{plural(gastos.length, 'gasto', 'gastos')} por agregar</h1>
        </div>
        <section class="card" aria-label="Total">
          <div class="between"><span class="semi muted">Total de gastos</span><span class="stack-xs" style={{ alignItems: 'flex-end', gap: 2 }}><span class="display-num tab-num" style={{ fontSize: 24 }}>{money(totDOP)}</span><span class="small semi muted tab-num">{usd(totUSD)}</span></span></div>
          {inUSD > 0 && <span class="small muted">{usd(inUSD)} se pagaron en dólares{inDOP > 0 ? ` y ${money(inDOP)} en pesos` : ''}. Cada gasto en dólares se convierte con la tasa oficial de su día.</span>}
          {accs.length > 0 && <span class="small row" style={{ gap: 6, alignItems: 'flex-start' }}><Icon name="card" size={16} /><span>Se agregan a tus cuentas: {accs.map((a) => accountLabel(a)).join(', ')}.</span></span>}
        </section>
        <div class="row wrap" style={{ gap: 8 }}>
          <button type="button" class="btn xs soft" onClick={() => setAll(true)}><Icon name="check" size={15} />Marcar todos los gastos</button>
          <button type="button" class="btn xs soft" onClick={() => setAll(false)}>Ninguno</button>
        </div>
        {days.map((d) => (
          <section key={d.day} class="card flush" aria-label={fmtDay(d.day)}>
            <div class="dayhead" style={{ padding: '12px 0 2px' }}><span class="eyebrow" style={{ fontSize: 11.5 }}>{fmtDay(d.day)}</span></div>
            {d.list.map((it) => {
              const c = catOf(s, it.cat);
              const off = it.kind === 'declined';
              const acc = it.kind === 'transfer' && it.to ? [accName(s, pack, it.account), accName(s, pack, it.to)].filter(Boolean).join(' → ') : accName(s, pack, it.account);
              return (
                <div key={it.key} class="lrow imp-row" style={{ opacity: it.on || off ? 1 : 0.72 }}>
                  <label class="check" style={{ margin: '-8px -4px -8px -8px' }}>
                    <input type="checkbox" class="sr-only" checked={it.on} disabled={off} onChange={(e) => setItem(it.key, { on: e.currentTarget.checked })} aria-label={`${it.on ? 'Quitar' : 'Agregar'} ${it.merchant || c.name}`} />
                    <span aria-hidden="true" style={it.on ? { background: 'var(--ink)', borderColor: 'var(--ink)', color: 'var(--on-ink)' } : off ? { borderStyle: 'dashed' } : null}>{it.on && <Icon name="check" size={16} stroke={2.8} />}</span>
                  </label>
                  <button type="button" class="stack-xs grow" disabled={off} onClick={() => setEdit(it.key)} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: 'inherit', minWidth: 0 }} aria-label={`Cambiar la categoría de ${it.merchant || c.name}`}>
                    <span class="strong clip" style={{ textDecoration: off ? 'line-through' : 'none' }}>{it.merchant || c.name}</span>
                    {!off && <span class="tiny semi clip" style={{ color: 'var(--muted)' }}>{[it.time, <span key="c" class="cat-pill"><Icon name={c.icon || 'tag'} size={12} />{c.name}</span>, acc, it.tag].filter(Boolean).reduce((a, x, i) => (i ? [...a, ' · ', x] : [x]), [])}</span>}
                    {it.why && <span class="tiny" style={{ color: 'var(--muted)' }}>{it.why}</span>}
                    {it.check && it.on && <span class="tiny strong" style={{ color: 'var(--xp-ink)' }}>{it.check}</span>}
                  </button>
                  <span class="stack-xs" style={{ alignItems: 'flex-end', flexShrink: 0, gap: 2 }}>
                    <span class="strong tab-num" style={{ color: it.kind === 'ingreso' ? 'var(--good-ink)' : off || it.kind === 'transfer' ? 'var(--muted)' : 'var(--ink)', textDecoration: off ? 'line-through' : 'none' }}>{it.kind === 'ingreso' ? '+' : it.kind === 'gasto' ? '−' : ''}{cur(it.amount, it.currency)}</span>
                    <span class="tiny muted semi tab-num">{it.currency === 'USD' ? money(dopOf(it)) : usd(usdOf(it))}</span>
                  </span>
                </div>
              );
            })}
          </section>
        ))}
        <p class="small muted" style={{ textAlign: 'center' }}>Los pagos de tarjeta y lo que mueves entre tus cuentas no son gastos nuevos: {s.money.accounts.some((a) => a.base) ? 'se agregan para que tus saldos cuadren' : 'van sin marcar'}. Las transacciones declinadas no se cobraron.</p>
      </main>
      <div class="cta-bar">
        <button type="button" class="btn block" disabled={!sel.length} onClick={doImport}><Icon name="check" size={20} />Agregar {plural(sel.length, 'movimiento', 'movimientos')}</button>
      </div>
      {edit && (() => {
        const it = pack.items.find((x) => x.key === edit);
        return it ? <ItemSheet s={s} it={it} rate={rateOf(it)} onSave={(patch) => { setItem(it.key, patch); setEdit(null); }} onClose={() => setEdit(null)} /> : null;
      })()}
    </>
  );
}

function ItemSheet({ s, it, rate, onSave, onClose }) {
  const [cat, setCat] = useState(it.cat);
  const [merchant, setMerchant] = useState(it.merchant);
  const [tag, setTag] = useState(it.tag);
  const [kind, setKind] = useState(it.kind);
  return (
    <Sheet onClose={onClose} label={`Revisar ${it.merchant}`}>
      <SheetHead title="Revisar" onClose={onClose} />
      <div class="panel between-c">
        <span class="stack-xs"><span class="strong">{cur(it.amount, it.currency)}</span><span class="tiny muted semi">{fmtDay(it.day)}{it.time ? ` · ${it.time}` : ''}</span></span>
        <span class="small semi muted tab-num">{it.currency === 'USD' ? money(toDOP(it.amount, 'USD', rate)) : usd(toUSD(it.amount, rate))} · {rateText(rate)}</span>
      </div>
      <div class="seg" role="tablist" aria-label="Tipo">
        {[['gasto', 'Gasto'], ['ingreso', 'Ingreso'], ['transfer', 'Entre cuentas']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={kind === k ? 'true' : 'false'} onClick={() => { setKind(k); if (catOf(s, cat).type !== k) setCat(k === 'gasto' ? 'otros' : k === 'ingreso' ? 'ingreso' : 'entre_cuentas'); }}>{l}</button>)}
      </div>
      <div class="field"><label for="im">Comercio o descripción</label><input id="im" class="input" value={merchant} maxLength={60} onInput={(e) => setMerchant(e.currentTarget.value)} /></div>
      <div class="stack-sm"><span class="label">Categoría</span><CatPicker s={s} type={kind} value={cat} onChange={setCat} /></div>
      <div class="field"><label for="itag">Etiqueta (opcional)</label><input id="itag" class="input" value={tag} maxLength={30} onInput={(e) => setTag(e.currentTarget.value)} placeholder="Ej. Viaje" ref={focusOnMount} /></div>
      {it.note && <span class="small muted">{it.note}</span>}
      <button type="button" class="btn block" onClick={() => onSave({ cat, merchant, tag, kind, on: true, check: '' })}><Icon name="check" size={20} />Listo · {catName(s, cat)}</button>
    </Sheet>
  );
}
