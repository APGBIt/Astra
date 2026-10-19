import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { TopBar, Sheet, SheetHead, TChip, Switch, money, usd, cur, rateText, toast, plural, focusOnMount } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { go } from '../app/router.js';
import { fmtDay, fmtShort } from '../app/dates.js';
import { catOf, catName, fxRate, toDOP, toUSD, findDuplicate, accountLabel, accountOf, importTxs, guessTxCat, resolveAccount } from '../game/logic.js';
import { parseBankAlerts, norm, toNumber } from '../game/parse.js';
import { readXlsx, readHtmlTable, sniff } from '../app/xlsx.js';
import { readCSV, readBook, statementItems, formatKey, last4FromName, bankOf, parseNum } from '../game/statement.js';
import { setAvailable, isCard, accountCur } from '../game/money.js';
import { CatPicker } from '../ui/catpicker.jsx';
import { ACCOUNT_KINDS } from '../game/content.js';

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

// La cuenta de Astra que corresponde a una descripción (banco y últimos 4), si ya existe.
function knownAccount(s, a) {
  if (!a) return null;
  if (typeof a === 'string') return accountOf(s, a);
  return s.money.accounts.find((x) => (a.id && x.id === a.id) || (a.last4 && x.last4 === a.last4 && (!a.bank || !x.bank || norm(x.bank) === norm(a.bank))) || (!a.last4 && a.name && norm(x.name) === norm(a.name))) || null;
}
// ¿Lo que dice el banco es más nuevo que lo que ya sabe Astra de esa cuenta?
function isNewer(s, b) {
  const a = knownAccount(s, b.account);
  if (!a) return true;
  const ref = isCard(a) ? (a.bankAvail && a.bankAvail[b.currency]) || (a.base && ((a.base.by && a.base.by[b.currency]) || a.base)) : a.base;
  if (!ref || !b.day) return !!b.day;
  return b.day > ref.day || (b.day === ref.day && (b.time || '') >= (ref.time || ''));
}

// Valida y prepara: qué va marcado, qué ya está en Astra, qué cuentas son nuevas y qué saldos dice el banco.
function prepare(s, raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items)) throw new Error('Ese archivo no tiene movimientos de Astra.');
  if (raw.app && !/^astra/.test(String(raw.app))) throw new Error('Ese archivo no es de Astra.');
  const accounts = Array.isArray(raw.accounts) ? raw.accounts.filter((a) => a && a.name) : [];
  // Si llevas el saldo de tus cuentas, los pagos de tarjeta y lo que mueves entre cuentas también se
  // agregan (mueven saldos). Un pago de tarjeta además cuenta como golpe al jefe de deudas.
  const balances = s.money.accounts.some((a) => a.base);
  const items = raw.items.slice(0, 1500).map((it, i) => {
    const kind = ['gasto', 'ingreso', 'transfer', 'declined'].includes(it.kind) ? it.kind : 'gasto';
    const currency = it.currency === 'USD' ? 'USD' : 'DOP';
    const amount = Math.abs(Number(it.amount) || 0);
    const day = /^\d{4}-\d{2}-\d{2}$/.test(it.day || '') ? it.day : s.energy.day;
    const dup = kind !== 'declined' && !!findDuplicate(s, { ...it, currency, amount, day });
    const cat = it.cat && catOf(s, it.cat).type === (kind === 'declined' ? 'gasto' : kind) ? it.cat : guessTxCat(s, { merchant: it.merchant, text: it.note, type: kind === 'declined' ? 'gasto' : kind });
    return {
      key: `${i}`, kind, currency, amount, day, time: it.time || '', merchant: String(it.merchant || '').slice(0, 60), cat,
      account: it.account || null, to: it.to || null, tag: it.tag || '', note: it.note || '', ref: it.ref || '', rate: Number(it.rate) || null,
      why: it.why || (dup ? 'Ya está en Astra.' : ''), check: it.check || '', dup, source: it.source || '',
      on: kind !== 'declined' && !dup && it.on !== false && (kind !== 'transfer' || it.on === true || balances),
    };
  }).filter((it) => it.amount > 0);
  // Lo que dice el banco: hoja «Saldos disponibles», el saldo final de un estado o el disponible de los avisos.
  const found = [];
  for (const b of raw.balances || []) if (b && b.account && Number.isFinite(Number(b.amount))) found.push({ ...b });
  for (const it of raw.items) {
    if (!it.avail || !it.account || !it.day) continue;
    found.push({ account: it.account, currency: it.avail.currency, amount: it.avail.amount, day: it.day, time: it.time || '', source: 'Aviso del banco' });
  }
  const latest = new Map();
  for (const b of found) {
    const a = typeof b.account === 'string' ? { id: b.account } : b.account;
    const k = `${a.id || ''}|${a.bank || ''}|${a.last4 || a.name || ''}|${b.currency}`;
    const prev = latest.get(k);
    if (!prev || (b.day || '') > (prev.day || '') || ((b.day || '') === (prev.day || '') && (b.time || '') >= (prev.time || ''))) latest.set(k, b);
  }
  const bal = [...latest.values()].map((b, i) => ({ ...b, key: `b${i}`, currency: b.currency === 'USD' ? 'USD' : 'DOP', on: isNewer(s, b) }));
  return { label: String(raw.label || 'Movimientos').slice(0, 80), source: raw.source || 'importado', accounts, rates: raw.rates || {}, rateSource: raw.rateSource || '', items, balances: bal, format: raw.format || null };
}

// Nombre de la cuenta de un movimiento (de la lista del paquete o descrita en el aviso).
function accName(s, pack, a) {
  if (!a) return '';
  if (a === 'efectivo') return 'Efectivo';
  if (typeof a === 'string') {
    const inPack = pack.accounts.find((x) => x.id === a);
    const known = s.money.accounts.find((x) => x.id === a);
    return accountLabel(known || inPack);
  }
  return accountLabel(knownAccount(s, a) || a);
}
// Cuentas que se van a crear al importar.
function newAccounts(s, pack) {
  const out = [];
  const seen = new Set();
  const add = (ref) => {
    const a = typeof ref === 'string' ? pack.accounts.find((x) => x.id === ref) : ref;
    if (!a || typeof a !== 'object' || knownAccount(s, a)) return;
    const k = `${a.bank}|${a.last4}|${a.name}`;
    if (!seen.has(k)) { seen.add(k); out.push(a); }
  };
  for (const it of pack.items) if (it.on) { add(it.account); add(it.to); }
  for (const b of pack.balances) if (b.on) add(b.account);
  return out;
}

const FILE_TYPES = '.json,.csv,.tsv,.txt,.xlsx,.xls,application/json,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';

// Un archivo (Astra, Excel o CSV) → { pack } o { book } para elegir columnas.
async function readFile(s, f) {
  const bytes = new Uint8Array(await f.arrayBuffer());
  const kind = sniff(bytes);
  const name = f.name || 'archivo';
  if (kind === 'xls') throw new Error('Ese es un Excel antiguo (.xls). Ábrelo y guárdalo como .xlsx o .csv, y vuelve a elegirlo.');
  if (kind === 'pdf') throw new Error('Los estados de cuenta en PDF no se pueden leer aquí. En la banca en línea descarga los movimientos en Excel o CSV.');
  let sheets;
  if (kind === 'xlsx') sheets = await readXlsx(bytes);
  else {
    const text = new TextDecoder().decode(bytes);
    if (/^\s*[[{]/.test(text)) return { pack: prepare(s, JSON.parse(text)) };
    sheets = [{ name, rows: kind === 'html' ? readHtmlTable(text) : readCSV(text).rows }];
  }
  const book = readBook(sheets, s.money.categories);
  if (!book) throw new Error('No encontré columnas de fecha y de monto en ese archivo.');
  if (book.kind === 'template') {
    return { pack: prepare(s, { label: name.replace(/\.[^.]+$/, ''), source: 'importado', items: book.items, balances: book.balances }) };
  }
  return { book: { ...book, fileName: name } };
}

export function Import({ query }) {
  const s = useApp();
  const today = s.energy.day;
  const [pack, setPack] = useState(() => {
    const p = pending;
    pending = null;
    try { return p ? prepare(s, p) : null; } catch { return null; }
  });
  const [book, setBook] = useState(null);
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
    e.currentTarget.value = '';
    if (!f) return;
    setLoading(true);
    try {
      const r = await readFile(s, f);
      if (r.pack) setPack(r.pack); else setBook(r.book);
      setErr('');
    } catch (x) {
      setErr(x && x.message && !/JSON|Unexpected token/.test(x.message) ? x.message : 'No pude leer ese archivo.');
    } finally { setLoading(false); }
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

  if (book && !pack) return <MapStep s={s} book={book} onBack={() => setBook(null)} onDone={(p) => { setPack(prepare(s, p)); setBook(null); }} />;

  if (!pack) {
    return (
      <main class="screen no-nav">
        <TopBar title="Importar movimientos" backTo="/finanzas" />
        <div class="stack-sm"><h1 class="h1">Agrega varios movimientos a la vez</h1><p class="lead">Revisas cada uno antes de guardarlo: monto, categoría y si ya estaba.</p></div>
        {err && <div class="note tone-vit" role="alert"><Icon name="info" size={18} /><span>{err}</span></div>}
        <section class="card" aria-label="Desde un archivo">
          <div class="row"><span class="tile" style={{ background: 'var(--finanzas-soft)', color: 'var(--finanzas-ink)' }}><Icon name="folder" /></span><span class="stack-xs grow"><span class="strong">Estado de cuenta o archivo</span><span class="small muted">Excel o CSV de Banreservas, APAP u otro banco, el Excel que te preparó Claude o una copia de Astra.</span></span></div>
          <label class="btn block" style={{ position: 'relative' }}>
            <Icon name="folder" size={20} />Elegir archivo
            <input type="file" accept={FILE_TYPES} onChange={onFile} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} aria-label="Elegir archivo de movimientos" />
          </label>
          <span class="tiny muted">En la banca en línea busca «Consultar movimientos» y descarga en Excel o CSV. El archivo se lee aquí: no sale de tu teléfono.</span>
        </section>
        <section class="card" aria-label="Desde avisos del banco">
          <div class="row"><span class="tile" style={{ background: 'var(--finanzas-soft)', color: 'var(--finanzas-ink)' }}><Icon name="mail" /></span><span class="stack-xs grow"><span class="strong">Avisos del banco</span><span class="small muted">Pega uno o varios correos o SMS de consumo, pago o transferencia.</span></span></div>
          <textarea class="input" rows={5} value={paste} onInput={(e) => { setPaste(e.currentTarget.value); setErr(''); }} aria-label="Texto de los avisos" placeholder="Pega aquí los avisos" />
          <button type="button" class="btn block" disabled={paste.trim().length < 6} onClick={readPaste}>Leer avisos<Icon name="right" size={20} /></button>
        </section>
      </main>
    );
  }

  const rateOf = (it) => it.rate || pack.rates[it.day] || fxRate(s, it.day);
  const dopOf = (it) => toDOP(it.amount, it.currency, rateOf(it));
  const usdOf = (it) => (it.currency === 'USD' ? it.amount : toUSD(it.amount, rateOf(it)));
  const sel = pack.items.filter((it) => it.on);
  const gastos = sel.filter((it) => it.kind === 'gasto');
  const totDOP = gastos.reduce((a, it) => a + dopOf(it), 0);
  const totUSD = gastos.reduce((a, it) => a + usdOf(it), 0);
  const inUSD = gastos.filter((it) => it.currency === 'USD').reduce((a, it) => a + it.amount, 0);
  const inDOP = gastos.filter((it) => it.currency === 'DOP').reduce((a, it) => a + it.amount, 0);
  const ingresos = sel.filter((it) => it.kind === 'ingreso').reduce((a, it) => a + dopOf(it), 0);
  const accs = newAccounts(s, pack);
  const balOn = pack.balances.filter((b) => b.on);
  const days = [];
  for (const it of [...pack.items].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.time < b.time ? 1 : -1))) {
    const last = days[days.length - 1];
    if (last && last.day === it.day) last.list.push(it); else days.push({ day: it.day, list: [it] });
  }
  const toReview = pack.items.filter((it) => it.check).length;
  const setItem = (key, patch) => setPack({ ...pack, items: pack.items.map((it) => (it.key === key ? { ...it, ...patch } : it)) });
  const setBal = (key, patch) => setPack({ ...pack, balances: pack.balances.map((b) => (b.key === key ? { ...b, ...patch } : b)) });
  const setAll = (on) => setPack({ ...pack, items: pack.items.map((it) => (it.kind === 'declined' ? it : { ...it, on: on && !it.dup && it.kind !== 'transfer' })) });

  const doImport = () => {
    const out = act((st, t, ev) => {
      // Para «Deshacer»: cómo estaban los saldos de las cuentas que se van a ajustar.
      const snap = [];
      const r = importTxs(st, pack, t, ev);
      let applied = 0;
      for (const b of pack.balances) {
        if (!b.on) continue;
        const id = resolveAccount(st, b.account);
        const a = accountOf(st, id);
        if (!a) continue;
        if (!snap.some((x) => x.id === a.id)) snap.push({ id: a.id, base: a.base ? JSON.parse(JSON.stringify(a.base)) : null, bankAvail: a.bankAvail ? JSON.parse(JSON.stringify(a.bankAvail)) : null, limit: a.limit ? { ...a.limit } : undefined });
        if (setAvailable(st, id, { currency: b.currency, amount: b.amount, day: b.day || t, time: b.time || '', limit: b.limit, source: b.source || pack.label }, t)) applied += 1;
      }
      if (pack.format && pack.format.key) {
        if (!st.money.importFormats) st.money.importFormats = {};
        st.money.importFormats[pack.format.key] = pack.format.value;
      }
      if (st.money.lastImport && st.money.lastImport.batch === r.batch) st.money.lastImport.anchors = snap;
      else if (applied) st.money.lastImport = { batch: r.batch, label: pack.label, n: 0, day: t, accounts: [], anchors: snap };
      return { ...r, applied };
    });
    const parts = [];
    if (out.added) parts.push(`Agregados ${plural(out.added, 'movimiento', 'movimientos')}`);
    if (out.skipped) parts.push(`${out.skipped} ya estaban`);
    if (out.applied) parts.push(`${plural(out.applied, 'saldo ajustado', 'saldos ajustados')}`);
    toast(parts.length ? parts.join(' · ') : 'No había movimientos nuevos', out.added || out.applied ? 'check' : 'info');
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
          {ingresos > 0 && <span class="small muted">Ingresos: <b class="tab-num">{money(ingresos)}</b>.</span>}
          {inUSD > 0 && <span class="small muted">{usd(inUSD)} se pagaron en dólares{inDOP > 0 ? ` y ${money(inDOP)} en pesos` : ''}. Cada gasto en dólares se convierte con la tasa oficial de su día.</span>}
          {accs.length > 0 && <span class="small row" style={{ gap: 6, alignItems: 'flex-start' }}><Icon name="card" size={16} /><span>Se agregan a tus cuentas: {accs.map((a) => accountLabel(a)).join(', ')}.</span></span>}
          {toReview > 0 && <span class="small row" style={{ gap: 6, alignItems: 'flex-start', color: 'var(--xp-ink)' }}><Icon name="info" size={16} /><span>{plural(toReview, 'movimiento tiene', 'movimientos tienen')} una nota para revisar.</span></span>}
        </section>
        {pack.balances.length > 0 && (
          <section class="card flush" aria-label="Lo que dice el banco">
            <div class="stack-xs" style={{ padding: '14px 0 6px' }}><h2 class="h2">Lo que dice el banco</h2><span class="small muted">Marca los saldos con los que quieres cuadrar tus cuentas. Lo que registres después se suma o se resta.</span></div>
            {pack.balances.map((b) => {
              const a = knownAccount(s, b.account);
              const card = a ? isCard(a) : typeof b.account === 'object' && b.account.kind === 'tarjeta';
              const noLimit = card && !(b.limit > 0) && !(a && a.limit && a.limit[b.currency] > 0);
              return (
                <label key={b.key} class="lrow" style={{ alignItems: 'flex-start', minHeight: 64, cursor: 'pointer' }}>
                  <span class="check" style={{ margin: '-6px -4px 0 -8px' }}>
                    <input type="checkbox" class="sr-only" checked={b.on} onChange={(e) => setBal(b.key, { on: e.currentTarget.checked })} aria-label={`Cuadrar ${accName(s, pack, b.account)}`} />
                    <span aria-hidden="true" style={b.on ? { background: 'var(--ink)', borderColor: 'var(--ink)', color: 'var(--on-ink)' } : null}>{b.on && <Icon name="check" size={16} stroke={2.8} />}</span>
                  </span>
                  <span class="stack-xs grow" style={{ minWidth: 0 }}>
                    <span class="strong clamp2" style={{ lineHeight: 1.25 }}>{accName(s, pack, b.account)}</span>
                    <span class="tiny muted semi">{card ? 'Crédito disponible' : 'Saldo'}{b.day ? ` al ${fmtShort(b.day)}${b.time ? ` ${b.time}` : ''}` : ''}{b.source ? ` · ${b.source}` : ''}</span>
                    {noLimit && <span class="tiny" style={{ color: 'var(--muted)' }}>Sin el límite de la tarjeta no sé cuánto debes; con esto sabrás cuánto te queda disponible.</span>}
                    {!b.on && !isNewer(s, b) && <span class="tiny" style={{ color: 'var(--muted)' }}>Astra ya tiene un saldo más reciente de esta cuenta.</span>}
                  </span>
                  <span class="strong tab-num" style={{ whiteSpace: 'nowrap' }}>{cur(b.amount, b.currency)}</span>
                </label>
              );
            })}
          </section>
        )}
        <div class="row wrap" style={{ gap: 8 }}>
          <button type="button" class="btn xs soft" onClick={() => setAll(true)}><Icon name="check" size={15} />Marcar todos los gastos</button>
          <button type="button" class="btn xs soft" onClick={() => setAll(false)}>Ninguno</button>
        </div>
        {days.map((dd) => (
          <section key={dd.day} class="card flush" aria-label={fmtDay(dd.day)}>
            <div class="dayhead" style={{ padding: '12px 0 2px' }}><span class="eyebrow" style={{ fontSize: 11.5 }}>{fmtDay(dd.day)}</span></div>
            {dd.list.map((it) => {
              const c = catOf(s, it.cat);
              const off = it.kind === 'declined';
              const acc = it.kind === 'transfer' && it.to ? [accName(s, pack, it.account), accName(s, pack, it.to)].filter(Boolean).join(' → ') : accName(s, pack, it.account);
              return (
                <div key={it.key} class="lrow imp-row" style={{ opacity: it.on || off ? 1 : 0.72 }}>
                  <label class="check" style={{ margin: '-8px -4px -8px -8px' }}>
                    <input type="checkbox" class="sr-only" checked={it.on} disabled={off} onChange={(e) => setItem(it.key, { on: e.currentTarget.checked })} aria-label={`${it.on ? 'Quitar' : 'Agregar'} ${it.merchant || c.name}`} />
                    <span aria-hidden="true" style={it.on ? { background: 'var(--ink)', borderColor: 'var(--ink)', color: 'var(--on-ink)' } : off ? { borderStyle: 'dashed' } : null}>{it.on && <Icon name="check" size={16} stroke={2.8} />}</span>
                  </label>
                  <button type="button" class="stack-xs grow" disabled={off} onClick={() => setEdit(it.key)} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: 'inherit', minWidth: 0 }} aria-label={`Revisar ${it.merchant || c.name}`}>
                    <span class="strong clamp2" style={{ lineHeight: 1.25, textDecoration: off ? 'line-through' : 'none' }}>{it.merchant || c.name}</span>
                    {!off && <span class="tiny semi imp-sub" style={{ color: 'var(--muted)' }}>{[it.time, <span key="c" class="cat-pill"><Icon name={c.icon || 'tag'} size={12} />{c.name}</span>, acc, it.tag].filter(Boolean).reduce((a, x, i) => (i ? [...a, ' · ', x] : [x]), [])}</span>}
                    {it.why && <span class="tiny" style={{ color: 'var(--muted)' }}>{it.why}</span>}
                    {it.check && <span class="tiny strong" style={{ color: 'var(--xp-ink)' }}>{it.check}</span>}
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
        <button type="button" class="btn block" disabled={!sel.length && !balOn.length} onClick={doImport}><Icon name="check" size={20} />{sel.length ? `Agregar ${plural(sel.length, 'movimiento', 'movimientos')}` : `Cuadrar ${plural(balOn.length, 'saldo', 'saldos')}`}</button>
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
  const [amount, setAmount] = useState(String(it.amount));
  const [currency, setCurrency] = useState(it.currency);
  const v = Math.abs(toNumber(String(amount).replace(/[^\d.,]/g, '')) || 0);
  return (
    <Sheet onClose={onClose} label={`Revisar ${it.merchant}`}>
      <SheetHead title="Revisar" onClose={onClose} />
      <div class="panel between-c">
        <span class="stack-xs"><span class="tiny muted semi">{fmtDay(it.day)}{it.time ? ` · ${it.time}` : ''}</span>{it.ref && <span class="tiny muted semi">Ref. {it.ref}</span>}</span>
        <span class="small semi muted tab-num">{currency === 'USD' ? money(toDOP(v, 'USD', rate)) : usd(toUSD(v, rate))} · {rateText(rate)}</span>
      </div>
      {it.check && <div class="note tone-xp"><Icon name="info" size={18} /><span>{it.check}</span></div>}
      <div class="seg" role="tablist" aria-label="Tipo">
        {[['gasto', 'Gasto'], ['ingreso', 'Ingreso'], ['transfer', 'Entre cuentas']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={kind === k ? 'true' : 'false'} onClick={() => { setKind(k); if (catOf(s, cat).type !== k) setCat(k === 'gasto' ? 'otros' : k === 'ingreso' ? 'ingreso' : 'entre_cuentas'); }}>{l}</button>)}
      </div>
      <div class="field">
        <label for="iamt">Monto</label>
        <div class="row" style={{ gap: 8 }}>
          <input id="iamt" class="input tab-num" inputMode="decimal" value={amount} onInput={(e) => setAmount(e.currentTarget.value)} style={{ flex: '1 1 auto' }} />
          <div class="seg" role="tablist" aria-label="Moneda" style={{ flex: '0 0 auto' }}>
            {['DOP', 'USD'].map((c) => <button key={c} type="button" role="tab" aria-selected={currency === c ? 'true' : 'false'} onClick={() => setCurrency(c)} style={{ padding: '0 12px' }}>{c === 'DOP' ? 'RD$' : 'US$'}</button>)}
          </div>
        </div>
      </div>
      <div class="field"><label for="im">Comercio o descripción</label><input id="im" class="input" value={merchant} maxLength={60} onInput={(e) => setMerchant(e.currentTarget.value)} /></div>
      <div class="stack-sm"><span class="label">Categoría</span><CatPicker s={s} type={kind} value={cat} onChange={setCat} /></div>
      <div class="field"><label for="itag">Etiqueta (opcional)</label><input id="itag" class="input" value={tag} maxLength={30} onInput={(e) => setTag(e.currentTarget.value)} placeholder="Ej. Viaje" ref={focusOnMount} /></div>
      {it.note && <span class="small muted">{it.note}</span>}
      <button type="button" class="btn block" disabled={!(v > 0)} onClick={() => onSave({ cat, merchant, tag, kind, amount: Math.round(v * 100) / 100, currency, on: true })}><Icon name="check" size={20} />Listo · {catName(s, cat)}</button>
    </Sheet>
  );
}

// ---------- Estado de cuenta: qué columna es cada cosa y de qué cuenta es ----------

const FIELDS = [['date', 'Fecha'], ['desc', 'Descripción'], ['amount', 'Monto'], ['debit', 'Débito (sale)'], ['credit', 'Crédito (entra)'], ['balance', 'Balance o saldo'], ['currency', 'Moneda'], ['ref', 'Referencia'], ['time', 'Hora'], ['type', 'Tipo (débito o crédito)']];

function MapStep({ s, book, onBack, onDone }) {
  const { det, rows } = book;
  const headers = det.headers;
  const fkey = formatKey(headers);
  const saved = (s.money.importFormats || {})[fkey] || null;
  const guessLast4 = last4FromName(book.fileName);
  const textHint = `${book.fileName} ${rows.slice(0, det.header + 1).flat().join(' ')}`;
  const guessBank = bankOf(textHint);
  const match = saved && saved.account && accountOf(s, saved.account) ? saved.account
    : (s.money.accounts.find((a) => guessLast4 && a.last4 === guessLast4) || {}).id || '';
  const [cols, setCols] = useState(saved ? saved.cols : det.cols);
  const [order, setOrder] = useState(saved ? saved.order : det.order);
  const [account, setAccount] = useState(match || 'nueva');
  const [neu, setNeu] = useState({ bank: guessBank, kind: /tarjeta|credito|crédito|visa|master/i.test(textHint) ? 'tarjeta' : 'cuenta', last4: guessLast4, currency: /\busd\b|d[oó]lar/i.test(textHint) ? 'USD' : 'DOP' });
  const acc = account !== 'nueva' ? accountOf(s, account) : null;
  const kind = acc ? (isCard(acc) ? 'tarjeta' : 'cuenta') : neu.kind;
  const currency = acc ? (isCard(acc) ? 'DOP' : accountCur(acc)) : neu.currency;
  const split = cols.debit != null || cols.credit != null;
  // ¿Los cargos vienen en positivo? En las tarjetas casi siempre (compras +, pagos −).
  const signedVals = split || cols.amount == null ? [] : rows.slice(det.header + 1).map((r) => parseNum(r[cols.amount])).filter((x) => x != null && x !== 0);
  const posShare = signedVals.length ? signedVals.filter((x) => x > 0).length / signedVals.length : 0;
  const [flip, setFlip] = useState(saved ? !!saved.flip : kind === 'tarjeta' && posShare >= 0.6);
  const desc = acc ? null : { name: `${neu.kind === 'tarjeta' ? 'Tarjeta' : 'Cuenta'}${neu.bank ? ` ${neu.bank}` : ''}`.trim(), bank: neu.bank, kind: neu.kind === 'tarjeta' ? 'tarjeta' : neu.kind === 'efectivo' ? 'efectivo' : 'cuenta', last4: String(neu.last4 || '').replace(/\D/g, '').slice(-4), currency: neu.currency };
  const cfg = { header: det.header, cols, amountMode: split ? 'split' : 'signed', flip: !split && flip, order, currency, accountKind: kind, account: acc ? acc.id : desc, payFrom: acc && acc.payFrom ? acc.payFrom : null };
  const ready = cols.date != null && (split || cols.amount != null);
  const res = ready ? statementItems(rows, cfg) : { items: [], balance: null, skipped: 0 };
  const sample = res.items.slice(0, 5);
  const setCol = (f, v) => setCols({ ...cols, [f]: v === '' ? undefined : Number(v) });
  const go2 = () => {
    const bal = res.balance ? [{ account: acc ? acc.id : desc, currency: res.balance.currency || currency, amount: res.balance.amount, day: res.balance.day, time: res.balance.time || '', source: 'Saldo final del estado' }] : [];
    onDone({ label: book.fileName.replace(/\.[^.]+$/, ''), source: 'estado', items: res.items, balances: bal, format: { key: fkey, value: { cols, order, flip: cfg.flip, account: acc ? acc.id : null } } });
  };
  return (
    <main class="screen no-nav" style={{ paddingBottom: 'calc(110px + env(safe-area-inset-bottom, 0px))' }}>
      <TopBar title="Leer el estado de cuenta" backTo="/finanzas" />
      <div class="stack-sm">
        <span class="eyebrow" style={{ overflowWrap: 'anywhere' }}>{book.fileName}</span>
        <h1 class="h1 sm">¿De qué cuenta es?</h1>
        <button type="button" class="link-btn" style={{ alignSelf: 'flex-start' }} onClick={onBack}><Icon name="folder" size={16} />Elegir otro archivo</button>
      </div>
      {saved && <div class="note tone-good"><Icon name="check" size={18} /><span>Ya leíste un archivo con este formato: uso lo que elegiste esa vez.</span></div>}
      <section class="card" aria-label="Cuenta del estado">
        <div class="chips" aria-label="Cuenta">
          {s.money.accounts.filter((a) => !a.hidden && a.kind !== 'efectivo').map((a) => <TChip key={a.id} on={account === a.id} onClick={() => setAccount(a.id)}>{accountLabel(a)}</TChip>)}
          <TChip on={account === 'nueva'} icon="plus" onClick={() => setAccount('nueva')}>Otra cuenta</TChip>
        </div>
        {account === 'nueva' && (
          <div class="stack-sm">
            <div class="seg" role="tablist" aria-label="Tipo de cuenta">
              {[['cuenta', 'Cuenta'], ['tarjeta', 'Tarjeta de crédito']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={neu.kind === k ? 'true' : 'false'} onClick={() => { setNeu({ ...neu, kind: k }); setFlip(k === 'tarjeta' && posShare >= 0.6); }}>{l}</button>)}
            </div>
            <div class="row" style={{ gap: 8 }}>
              <div class="field grow"><label for="mbank">Banco</label><input id="mbank" class="input" value={neu.bank} maxLength={30} onInput={(e) => setNeu({ ...neu, bank: e.currentTarget.value })} placeholder="Banreservas, APAP…" /></div>
              <div class="field" style={{ width: 110 }}><label for="m4">Últimos 4</label><input id="m4" class="input tab-num" inputMode="numeric" maxLength={4} value={neu.last4} onInput={(e) => setNeu({ ...neu, last4: e.currentTarget.value })} /></div>
            </div>
            {neu.kind !== 'tarjeta' && (
              <div class="seg" role="tablist" aria-label="Moneda de la cuenta">
                {[['DOP', 'Pesos'], ['USD', 'Dólares']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={neu.currency === k ? 'true' : 'false'} onClick={() => setNeu({ ...neu, currency: k })}>{l}</button>)}
              </div>
            )}
          </div>
        )}
      </section>
      <section class="card" aria-label="Columnas">
        <div class="stack-xs"><h2 class="h2">Columnas</h2><span class="small muted">Las encontré solas. Cámbialas si algo no cuadra con la vista previa.</span></div>
        <div class="map-grid">
          {FIELDS.map(([f, l]) => (
            <div key={f} class="field">
              <label for={`col-${f}`}>{l}</label>
              <select id={`col-${f}`} class="input" value={cols[f] != null ? String(cols[f]) : ''} onChange={(e) => setCol(f, e.currentTarget.value)}>
                <option value="">No usar</option>
                {headers.map((h, j) => <option key={j} value={String(j)}>{h || `Columna ${j + 1}`}</option>)}
              </select>
            </div>
          ))}
        </div>
        {!split && cols.amount != null && (
          <div class="between-c" style={{ gap: 12 }}>
            <span class="stack-xs"><span class="semi">Las compras vienen en positivo</span><span class="tiny muted">Actívalo si los cargos no traen signo menos (pasa en las tarjetas).</span></span>
            <Switch checked={flip} onChange={setFlip} label="Las compras vienen en positivo" />
          </div>
        )}
        <div class="seg" role="tablist" aria-label="Orden de las fechas">
          {[['dmy', 'Día/mes/año'], ['mdy', 'Mes/día/año']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={order === k ? 'true' : 'false'} onClick={() => setOrder(k)}>{l}</button>)}
        </div>
      </section>
      <section class="card flush" aria-label="Vista previa">
        <div class="stack-xs" style={{ padding: '14px 0 6px' }}><h2 class="h2">Vista previa</h2><span class="small muted">{ready ? `${plural(res.items.length, 'movimiento', 'movimientos')}${res.skipped ? ` · ${plural(res.skipped, 'fila', 'filas')} sin fecha o sin monto (totales, saldos anteriores)` : ''}` : 'Elige la columna de fecha y la de monto (o débito y crédito).'}</span></div>
        {sample.map((it, i) => (
          <div key={i} class="lrow" style={{ minHeight: 52 }}>
            <span class="stack-xs grow" style={{ minWidth: 0 }}><span class="semi clamp2" style={{ lineHeight: 1.25 }}>{it.merchant}</span><span class="tiny muted semi">{fmtShort(it.day)}{it.time ? ` ${it.time}` : ''} · {it.kind === 'transfer' ? 'Entre cuentas' : it.kind === 'ingreso' ? 'Entra' : 'Sale'} · {catName(s, it.cat)}</span></span>
            <span class="strong tab-num" style={{ color: it.kind === 'ingreso' ? 'var(--good-ink)' : 'var(--ink)' }}>{it.kind === 'ingreso' ? '+' : it.kind === 'gasto' ? '−' : ''}{cur(it.amount, it.currency)}</span>
          </div>
        ))}
        {res.balance && <div class="lrow" style={{ minHeight: 48 }}><span class="grow tiny muted semi">Saldo al final del estado ({fmtShort(res.balance.day)})</span><span class="strong tab-num">{cur(res.balance.amount, res.balance.currency || currency)}</span></div>}
      </section>
      <div class="cta-bar">
        <button type="button" class="btn block" disabled={!res.items.length} onClick={go2}>Revisar {plural(res.items.length, 'movimiento', 'movimientos')}<Icon name="right" size={18} /></button>
      </div>
    </main>
  );
}

export { prepare as prepareImport, readFile as readImportFile, ACCOUNT_KINDS };
