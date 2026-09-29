import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { TopBar, Bar, money, toast, areaColor } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { go, back } from '../app/router.js';
import { monthKey } from '../app/dates.js';
import { addTx, monthSummary } from '../game/logic.js';
import { toNumber } from '../game/parse.js';
import { aiProvider, aiJSON, providerLabel, prepareImage, readQR, receiptPrompt, checkReceipt, aiErrorText } from '../ai/ai.js';

const EMPTY = { merchant: '', rnc: '', ncf: '', day: null, time: '', subtotal: null, itbis: 0, tip: 0, total: 0, currency: 'DOP', method: '', last4: '', cat: 'otros', items: [], doubts: new Set() };

export function Receipt() {
  const s = useApp();
  const today = s.energy.day;
  const [provider, setProvider] = useState(undefined);
  const [phase, setPhase] = useState('pick');
  const [thumb, setThumb] = useState('');
  const [data, setData] = useState(EMPTY);
  const [msg, setMsg] = useState('');
  const [from, setFrom] = useState('');
  const [showItems, setShowItems] = useState(false);
  const ctl = useRef(null);

  useEffect(() => {
    aiProvider(s.settings, { needImages: true }).then(setProvider).catch(() => setProvider(null));
    return () => { if (ctl.current) ctl.current.abort(); };
  }, []);
  useEffect(() => () => { if (thumb) URL.revokeObjectURL(thumb); }, [thumb]);

  const onFile = async (e) => {
    const file = e.currentTarget.files && e.currentTarget.files[0];
    e.currentTarget.value = '';
    if (!file) return;
    setThumb(URL.createObjectURL(file));
    setPhase('reading');
    setMsg('');
    let prepared;
    try {
      prepared = await prepareImage(file);
    } catch {
      setPhase('pick');
      setMsg('No pude abrir esa imagen. Prueba con otra foto.');
      return;
    }
    const qr = await readQR(prepared.bitmap);
    let result = { ...EMPTY, doubts: new Set() };
    let source = '';
    if (provider) {
      ctl.current = new AbortController();
      try {
        const r = await aiJSON(provider, receiptPrompt(), { image: prepared.blob, signal: ctl.current.signal, task: 'recibo' });
        result = checkReceipt(r);
        source = 'ia';
      } catch (err) {
        if (err && err.code === 'cancelled') return;
        setMsg(aiErrorText(err));
      }
    }
    if (qr) {
      if (qr.rnc && (!result.rnc || result.doubts.has('rnc'))) result.rnc = qr.rnc;
      if (qr.ncf && (!result.ncf || result.doubts.has('ncf'))) result.ncf = qr.ncf;
      if (qr.total && (!result.total || result.doubts.has('total'))) { result.total = qr.total; result.doubts.delete('total'); }
      if (qr.day && (!result.day || result.doubts.has('fecha'))) { result.day = qr.day; result.doubts.delete('fecha'); }
      source = source ? 'ia+qr' : 'qr';
    }
    if (!result.day) result.day = today;
    setFrom(source);
    setData(result);
    setPhase('review');
  };

  const cancel = () => {
    if (ctl.current) ctl.current.abort();
    setPhase('pick');
  };

  const set = (k, v) => {
    const doubts = new Set(data.doubts);
    doubts.delete(k === 'day' ? 'fecha' : k === 'merchant' ? 'comercio' : k);
    setData({ ...data, [k]: v, doubts });
  };

  const save = () => {
    const total = Number(data.total) || 0;
    if (!total) return;
    act((st, t, ev) => addTx(st, {
      type: 'gasto',
      amount: data.currency === 'USD' ? total : total,
      cat: data.cat,
      merchant: data.merchant,
      note: data.currency === 'USD' ? 'Monto en US$' : '',
      day: data.day || t,
      source: 'recibo',
      rnc: data.rnc,
      ncf: data.ncf,
      itbis: data.itbis,
    }, t, ev));
    toast('Gasto guardado · la foto no se guardó', 'check');
    go('/finanzas', { replace: true });
  };

  if (phase === 'pick') {
    return (
      <main class="screen no-nav">
        <TopBar title="Escanear recibo" backTo="/" close />
        <div class="stack-sm"><h1 class="h1">Fotografía tu recibo</h1><p class="lead">Ponlo sobre una superficie plana, con buena luz y completo en la foto.</p></div>
        <div class="stack">
          <label class="btn block" style={{ position: 'relative' }}>
            <Icon name="camera" size={20} />Tomar foto
            <input type="file" accept="image/*" capture="environment" onChange={onFile} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} aria-label="Tomar foto del recibo" />
          </label>
          <label class="btn ghost block" style={{ position: 'relative' }}>
            <Icon name="image" size={20} />Elegir de la galería
            <input type="file" accept="image/*" onChange={onFile} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} aria-label="Elegir foto del recibo" />
          </label>
        </div>
        {msg && <div class="note tone-vit"><Icon name="info" size={18} /><span>{msg}</span></div>}
        <div class="card tight">
          <div class="row"><Icon name="sparkle" size={18} /><span class="grow strong small">Lectura con IA</span><span class="chip sm">{provider === undefined ? 'Revisando…' : providerLabel(provider)}</span></div>
          <span class="small muted">
            {provider ? 'La IA lee comercio, RNC, e-NCF, fecha, ITBIS y total. Tú revisas antes de guardar.' : 'Sin IA configurada puedes llenar los datos a mano. Actívala en Personaje → Ajustes.'}
          </span>
        </div>
        <div class="note"><Icon name="qr" size={20} /><span>Si es una factura electrónica (e-CF), también leo su código QR cuando el navegador lo permite.</span></div>
        <div class="note"><Icon name="lock" size={20} /><span>La foto se usa solo para leerla y no se guarda en la app.</span></div>
        <button type="button" class="link-btn" style={{ alignSelf: 'center' }} onClick={() => { setData({ ...EMPTY, day: today, doubts: new Set() }); setFrom(''); setPhase('review'); }}>Prefiero escribirlo a mano<Icon name="right" size={16} /></button>
      </main>
    );
  }

  if (phase === 'reading') {
    return (
      <main class="screen no-nav">
        <TopBar title="Leyendo tu recibo" onBack={cancel} close />
        <div class="row" style={{ gap: 16 }}>
          {thumb && <img class="receipt-thumb" src={thumb} alt="Tu recibo" />}
          <div class="stack-sm grow"><span class="h2">Leyendo…</span><span class="small muted">{provider ? `Con ${providerLabel(provider).toLowerCase()}. Suele tardar unos segundos.` : 'Buscando el código QR de la factura.'}</span></div>
        </div>
        <div class="stack">{[80, 60, 90, 50, 70].map((w, i) => <div key={i} class="skeleton" style={{ height: 18, width: `${w}%` }} />)}</div>
        <button type="button" class="btn ghost block" onClick={cancel}>Cancelar</button>
      </main>
    );
  }

  const doubt = (k) => data.doubts.has(k);
  const summary = monthSummary(s, monthKey(data.day || today));
  const cat = s.money.categories.find((c) => c.id === data.cat);
  const after = (summary.byCat[data.cat] || 0) + (Number(data.total) || 0);

  return (
    <main class="screen no-nav">
      <TopBar title="Revisa el recibo" backTo="/" close />
      <section class="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {thumb ? <img class="receipt-thumb" src={thumb} alt="Tu recibo" /> : <span class="tile lg" style={{ background: 'var(--finanzas-soft)', color: 'var(--finanzas)' }}><Icon name="receipt" size={26} /></span>}
        <div class="stack-xs grow">
          {from && <span class="row tiny strong" style={{ gap: 5, color: 'var(--finanzas-ink)', textTransform: 'uppercase', letterSpacing: 0.5 }}><Icon name={from === 'qr' ? 'qr' : 'sparkle'} size={14} />{from === 'qr' ? 'Leído del código QR' : from === 'ia+qr' ? 'Leído por IA y QR' : 'Leído por IA'}</span>}
          <input class="input" aria-label="Comercio" value={data.merchant} placeholder="Comercio" onInput={(e) => set('merchant', e.currentTarget.value)} style={{ minHeight: 44, fontWeight: 700, background: doubt('comercio') ? 'var(--xp-soft)' : undefined }} />
          <label class="row" style={{ gap: 6 }}>
            <span class="display-num" style={{ fontSize: 28 }}>RD$</span>
            <input aria-label="Total" inputMode="decimal" value={data.total || ''} placeholder="0.00" onInput={(e) => set('total', toNumber(e.currentTarget.value) || 0)}
              style={{ width: '100%', border: 'none', background: doubt('total') ? 'var(--xp-soft)' : 'transparent', borderRadius: 10, fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 800, color: 'var(--ink)', minHeight: 44 }} />
          </label>
        </div>
      </section>
      {msg && <div class="note tone-vit"><Icon name="info" size={18} /><span>{msg} Puedes llenar los datos a mano.</span></div>}
      {data.doubts.size > 0 && <div class="note tone-xp"><Icon name="bell" size={18} /><span>Revisa lo marcado en amarillo: no se leyó con seguridad.</span></div>}
      <section class="card flush" aria-label="Datos del recibo" style={{ padding: 6 }}>
        <Field label="Fecha" doubt={doubt('fecha')}><input type="date" value={data.day || ''} onInput={(e) => set('day', e.currentTarget.value)} /></Field>
        <Field label="RNC del comercio" doubt={doubt('rnc')}><input value={data.rnc} placeholder="—" onInput={(e) => set('rnc', e.currentTarget.value)} /></Field>
        <Field label="Comprobante (NCF / e-NCF)" doubt={doubt('ncf')}><input value={data.ncf} placeholder="—" onInput={(e) => set('ncf', e.currentTarget.value.toUpperCase())} /></Field>
        <Field label="Subtotal" doubt={doubt('subtotal')}><input inputMode="decimal" value={data.subtotal ?? ''} placeholder="—" onInput={(e) => set('subtotal', toNumber(e.currentTarget.value))} /></Field>
        <Field label="ITBIS" doubt={doubt('itbis')}><input inputMode="decimal" value={data.itbis || ''} placeholder="—" onInput={(e) => set('itbis', toNumber(e.currentTarget.value) || 0)} /></Field>
        {data.tip > 0 && <Field label="Propina legal"><input inputMode="decimal" value={data.tip} onInput={(e) => set('tip', toNumber(e.currentTarget.value) || 0)} /></Field>}
        {(data.method || data.last4) && <Field label="Pago" doubt={doubt('metodo_pago') || doubt('tarjeta_ultimos4')}><span class="strong">{data.method}{data.last4 ? ` · ${data.last4}` : ''}</span></Field>}
        {data.currency === 'USD' && <div class="note tone-xp" style={{ margin: 6 }}><Icon name="info" size={18} /><span>El recibo está en dólares. Se guardará el monto tal cual; conviértelo si lo necesitas.</span></div>}
        {data.items.length > 0 && (
          <>
            <button type="button" class="lrow" style={{ padding: '0 14px', minHeight: 52, fontWeight: 700 }} onClick={() => setShowItems(!showItems)} aria-expanded={showItems ? 'true' : 'false'}>
              <span class="grow">{data.items.length} artículos leídos</span><Icon name={showItems ? 'down' : 'right'} size={18} />
            </button>
            {showItems && data.items.map((it, i) => <div key={i} class="between small" style={{ padding: '6px 14px' }}><span>{it.desc}</span><span class="strong">{money(it.total)}</span></div>)}
          </>
        )}
      </section>
      <section class="card" aria-label="Categoría y presupuesto">
        <div class="field">
          <label for="cat">Categoría</label>
          <select id="cat" class="input" value={data.cat} onChange={(e) => set('cat', e.currentTarget.value)}>
            {s.money.categories.filter((c) => c.id !== 'ahorro').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {cat && cat.budget > 0 ? (
          <>
            <div class="between small"><span class="muted semi">Así queda {cat.name} este mes</span><span class="strong">{money(after)} de {money(cat.budget)}</span></div>
            <Bar value={after / cat.budget} size="lg" color={after > cat.budget ? 'var(--vit)' : areaColor('finanzas')} label={`${Math.round((after / cat.budget) * 100)} % del presupuesto`} />
          </>
        ) : <span class="small muted">Esta categoría no tiene presupuesto. Puedes ponerle uno en Finanzas.</span>}
      </section>
      <button type="button" class="btn block" disabled={!(Number(data.total) > 0)} onClick={save}><Icon name="check" size={20} />Guardar gasto</button>
      <button type="button" class="link-btn muted" style={{ alignSelf: 'center' }} onClick={() => { setPhase('pick'); setThumb(''); }}>Tomar otra foto</button>
    </main>
  );
}

function Field({ label, doubt, children }) {
  return (
    <label class={`dfield ${doubt ? 'doubt' : ''}`}>
      <span class="small semi" style={{ color: doubt ? 'var(--xp-ink)' : 'var(--muted)' }}>{doubt && <Icon name="bell" size={14} style={{ marginRight: 4, verticalAlign: -2 }} />}{label}</span>
      {children}
    </label>
  );
}

export { back };
