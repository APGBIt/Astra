import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { TopBar, Bar, Switch, money, usd, rateText, toast, areaColor } from '../ui/kit.jsx';
import { addPhoto } from '../app/photos.js';
import { act, useApp } from '../app/store.js';
import { go, back } from '../app/router.js';
import { monthKey } from '../app/dates.js';
import { addTx, monthSummary, fxRate, toDOP, toUSD, catGroups } from '../game/logic.js';
import { toNumber } from '../game/parse.js';
import { aiProvider, aiJSON, providerLabel, prepareImage, readQR, receiptPrompt, checkReceipt, aiErrorText } from '../ai/ai.js';
import { ocrSupported, readText, stopOCR, ocrErrorText } from '../app/ocr.js';
import { parseScan, voucherTx } from '../game/scan.js';
import { setPendingTx } from '../app/handoff.js';

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
  const [keep, setKeep] = useState(true);
  const [saving, setSaving] = useState(false);
  // 1.10: lector de texto en el teléfono (OCR).
  const [prog, setProg] = useState(null);
  const [rawText, setRawText] = useState('');
  const fileRef = useRef(null);
  const ctl = useRef(null);
  const run = useRef(0);
  const canOCR = ocrSupported();

  useEffect(() => {
    aiProvider(s.settings, { needImages: true }).then(setProvider).catch(() => setProvider(null));
    return () => { if (ctl.current) ctl.current.abort(); stopOCR(); };
  }, []);
  useEffect(() => () => { if (thumb) URL.revokeObjectURL(thumb); }, [thumb]);

  // Un comprobante de transferencia o de pago va a la hoja de movimiento (con su cuenta, impuesto y referencia).
  const toVoucher = async (r) => {
    let photo = null;
    if (fileRef.current) photo = await addPhoto(fileRef.current, { kind: 'recibo', desc: r.merchant || 'Comprobante' }).catch(() => null);
    const tx = voucherTx(s, r);
    setPendingTx({ ...tx, day: tx.day || today, photos: photo ? [photo] : [], scanned: true });
    toast('Comprobante leído: revisa y guarda', 'receipt');
    go('/finanzas?nuevo=1', { replace: true });
  };

  const onFile = async (e) => {
    const file = e.currentTarget.files && e.currentTarget.files[0];
    e.currentTarget.value = '';
    if (!file) return;
    const me = ++run.current;
    fileRef.current = file;
    setThumb(URL.createObjectURL(file));
    setPhase('reading');
    setMsg('');
    setRawText('');
    setProg(null);
    let prepared;
    try {
      prepared = await prepareImage(file);
    } catch {
      setPhase('pick');
      setMsg('No pude abrir esa imagen. Prueba con otra foto.');
      return;
    }
    const qr = await readQR(prepared.bitmap);
    let result = null;
    let source = '';
    let note = '';
    if (provider) {
      ctl.current = new AbortController();
      try {
        const r = await aiJSON(provider, receiptPrompt(), { image: prepared.blob, signal: ctl.current.signal, task: 'recibo' });
        result = checkReceipt(r);
        source = 'ia';
      } catch (err) {
        if (err && err.code === 'cancelled') return;
        note = aiErrorText(err);
      }
    }
    // Sin IA (o si la IA falló): el lector de texto del teléfono.
    if (!result && canOCR) {
      try {
        const { text } = await readText(prepared.bitmap, (p) => { if (run.current === me) setProg(p); });
        if (run.current !== me) return;
        result = parseScan(text, today);
        setRawText(result.text);
        source = 'ocr';
        if (note) note = `${note} Lo leí con el lector de texto del teléfono.`;
        if (!result.text.trim()) note = 'No encontré texto en la foto. Prueba con otra más nítida o con más luz.';
      } catch (err) {
        if (run.current !== me) return;
        note = note ? `${note} ${ocrErrorText(err)}` : ocrErrorText(err);
      }
    }
    if (run.current !== me) return;
    if (!result) result = { ...EMPTY, doubts: new Set() };
    if (qr) {
      if (qr.rnc && (!result.rnc || result.doubts.has('rnc'))) result.rnc = qr.rnc;
      if (qr.ncf && (!result.ncf || result.doubts.has('ncf'))) result.ncf = qr.ncf;
      if (qr.total && (!result.total || result.doubts.has('total'))) { result.total = qr.total; result.doubts.delete('total'); }
      if (qr.day && (!result.day || result.doubts.has('fecha'))) { result.day = qr.day; result.doubts.delete('fecha'); }
      source = source ? `${source}+qr` : 'qr';
    }
    if (result.kind === 'transferencia') { await toVoucher(result); return; }
    if (!result.day) result.day = today;
    setMsg(note);
    setFrom(source);
    setData({ ...EMPTY, ...result, items: result.items || [], doubts: result.doubts || new Set() });
    setPhase('review');
  };

  // «Es un comprobante, no un recibo»: se vuelve a leer el texto como comprobante.
  const asVoucher = () => {
    const r = rawText ? parseScan(rawText, today, { kind: 'transferencia' }) : { kind: 'transferencia', total: data.total, currency: data.currency, day: data.day, merchant: data.merchant, toName: data.merchant, payKind: 'tercero', cat: 'terceros', doubts: new Set() };
    if (!r.total && data.total) r.total = data.total;
    toVoucher(r);
  };

  const cancel = () => {
    run.current += 1;
    if (ctl.current) ctl.current.abort();
    stopOCR();
    setProg(null);
    setPhase('pick');
  };

  const set = (k, v) => {
    const doubts = new Set(data.doubts);
    doubts.delete(k === 'day' ? 'fecha' : k === 'merchant' ? 'comercio' : k);
    setData({ ...data, [k]: v, doubts });
  };

  const save = async () => {
    const total = Number(data.total) || 0;
    if (!total || saving) return;
    setSaving(true);
    // La foto se guarda con el gasto si quieres (en este teléfono y, si sincronizas, en tu Drive).
    let photo = null;
    if (keep && fileRef.current) photo = await addPhoto(fileRef.current, { kind: 'recibo', desc: data.merchant || '' }).catch(() => null);
    act((st, t, ev) => addTx(st, {
      type: 'gasto',
      amount: total,
      currency: data.currency === 'USD' ? 'USD' : 'DOP',
      rate: fxRate(st, data.day || t),
      cat: data.cat,
      merchant: data.merchant,
      note: '',
      day: data.day || t,
      source: 'recibo',
      // Pagado con una tarjeta tuya (por sus últimos 4 dígitos).
      account: (data.last4 && (st.money.accounts.find((a) => a.last4 === String(data.last4).slice(-4)) || {}).id) || '',
      rnc: data.rnc,
      ncf: data.ncf,
      itbis: data.itbis,
      photos: photo ? [photo] : [],
    }, t, ev));
    toast(photo ? 'Gasto guardado con la foto del recibo' : 'Gasto guardado · la foto no se guardó', 'check');
    go('/finanzas', { replace: true });
  };

  if (phase === 'pick') {
    return (
      <main class="screen no-nav">
        <TopBar title="Escanear recibo o comprobante" backTo="/" close />
        <div class="stack-sm"><h1 class="h1">Recibo o comprobante</h1><p class="lead">Toma una foto del recibo (plano, con buena luz y completo) o sube la captura del comprobante de tu banco.</p></div>
        <div class="stack">
          <label class="btn block" style={{ position: 'relative' }}>
            <Icon name="camera" size={20} />Tomar foto
            <input type="file" accept="image/*" capture="environment" onChange={onFile} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} aria-label="Tomar foto del recibo" />
          </label>
          <label class="btn ghost block" style={{ position: 'relative' }}>
            <Icon name="image" size={20} />Subir imagen o captura
            <input type="file" accept="image/*" onChange={onFile} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} aria-label="Elegir imagen del recibo o comprobante" />
          </label>
        </div>
        {msg && <div class="note tone-vit"><Icon name="info" size={18} /><span>{msg}</span></div>}
        <div class="card tight">
          <div class="row"><Icon name={provider ? 'sparkle' : 'eye'} size={18} /><span class="grow strong small">{provider ? 'Lectura con IA' : 'Lector de texto del teléfono'}</span><span class="chip sm">{provider === undefined ? 'Revisando…' : provider ? providerLabel(provider) : canOCR ? 'Sin IA' : 'No disponible'}</span></div>
          <span class="small muted">
            {provider
              ? `La IA lee comercio, RNC, e-NCF, fecha, ITBIS y total, o el monto, el beneficiario y la referencia de un comprobante. ${canOCR ? 'Si no responde, lo leo con el lector del teléfono. ' : ''}Tú revisas antes de guardar.`
              : canOCR
                ? 'Leo el texto aquí mismo (OCR): comercio, RNC, NCF, fecha, ITBIS y total de los recibos; monto, beneficiario, cuenta y referencia de los comprobantes. La primera vez se descarga el lector (unos 6 MB); después funciona sin internet. Tú revisas antes de guardar.'
                : 'Este navegador no puede leer el texto de las fotos. Puedes llenar los datos a mano.'}
          </span>
        </div>
        <div class="note"><Icon name="qr" size={20} /><span>Si es una factura electrónica (e-CF), también leo su código QR cuando el navegador lo permite.</span></div>
        <div class="note"><Icon name="lock" size={20} /><span>Al guardar eliges si la foto se queda con el gasto (en este teléfono y en tu Drive si sincronizas) o si solo se usa para leerla.</span></div>
        <button type="button" class="link-btn" style={{ alignSelf: 'center' }} onClick={() => { setData({ ...EMPTY, day: today, doubts: new Set() }); setFrom(''); setPhase('review'); }}>Prefiero escribirlo a mano<Icon name="right" size={16} /></button>
      </main>
    );
  }

  if (phase === 'reading') {
    const ocrRun = !!prog;
    return (
      <main class="screen no-nav">
        <TopBar title="Leyendo tu imagen" onBack={cancel} close />
        <div class="row" style={{ gap: 16 }}>
          {thumb && <img class="receipt-thumb" src={thumb} alt="Tu recibo o comprobante" />}
          <div class="stack-sm grow">
            <span class="h2">Leyendo…</span>
            <span class="small muted" aria-live="polite">{ocrRun ? prog.label : provider ? `Con ${providerLabel(provider).toLowerCase()}. Suele tardar unos segundos.` : 'Buscando el código QR de la factura.'}</span>
            {ocrRun && <Bar value={prog.pct} size="lg" color={areaColor('finanzas')} label={`${Math.round(prog.pct * 100)} %`} />}
          </div>
        </div>
        <div class="stack">{[80, 60, 90, 50, 70].map((w, i) => <div key={i} class="skeleton" style={{ height: 18, width: `${w}%` }} />)}</div>
        {ocrRun && <span class="small muted">El lector trabaja en tu teléfono: la imagen no sale de aquí.</span>}
        <button type="button" class="btn ghost block" onClick={cancel}>Cancelar</button>
      </main>
    );
  }

  const doubt = (k) => data.doubts.has(k);
  const summary = monthSummary(s, monthKey(data.day || today));
  const cat = s.money.categories.find((c) => c.id === data.cat);
  const after = (summary.byCat[data.cat] || 0) + (data.currency === 'USD' ? toDOP(Number(data.total) || 0, 'USD', fxRate(s, data.day || today)) : (Number(data.total) || 0));

  return (
    <main class="screen no-nav">
      <TopBar title="Revisa el recibo" backTo="/" close />
      <section class="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {thumb ? <img class="receipt-thumb" src={thumb} alt="Tu recibo" /> : <span class="tile lg" style={{ background: 'var(--finanzas-soft)', color: 'var(--finanzas)' }}><Icon name="receipt" size={26} /></span>}
        <div class="stack-xs grow">
          {from && <span class="row tiny strong" style={{ gap: 5, color: 'var(--finanzas-ink)', textTransform: 'uppercase', letterSpacing: 0.5 }}><Icon name={from === 'qr' ? 'qr' : from.startsWith('ocr') ? 'eye' : 'sparkle'} size={14} />{{ qr: 'Leído del código QR', 'ia+qr': 'Leído por IA y QR', ia: 'Leído por IA', ocr: 'Leído en tu teléfono', 'ocr+qr': 'Leído en tu teléfono y del QR' }[from] || 'Leído'}</span>}
          <input class="input" aria-label="Comercio" value={data.merchant} placeholder="Comercio" onInput={(e) => set('merchant', e.currentTarget.value)} style={{ minHeight: 44, fontWeight: 700, background: doubt('comercio') ? 'var(--xp-soft)' : undefined }} />
          <label class="row" style={{ gap: 6 }}>
            <button type="button" class="display-num cur-btn" style={{ fontSize: 26 }} aria-label={`Moneda: ${data.currency === 'USD' ? 'dólares' : 'pesos'}. Cambiar`} onClick={(e) => { e.preventDefault(); set('currency', data.currency === 'USD' ? 'DOP' : 'USD'); }}>{data.currency === 'USD' ? 'US$' : 'RD$'}</button>
            <input aria-label="Total" inputMode="decimal" value={data.total || ''} placeholder="0.00" onInput={(e) => set('total', toNumber(e.currentTarget.value) || 0)}
              style={{ width: '100%', border: 'none', background: doubt('total') ? 'var(--xp-soft)' : 'transparent', borderRadius: 10, fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 800, color: 'var(--ink)', minHeight: 44 }} />
          </label>
          {Number(data.total) > 0 && <span class="small semi muted tab-num">= {data.currency === 'USD' ? money(toDOP(data.total, 'USD', fxRate(s, data.day || today))) : usd(toUSD(data.total, fxRate(s, data.day || today)))}</span>}
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
        {data.currency === 'USD' && <div class="note" style={{ margin: 6 }}><Icon name="swap" size={18} /><span>El recibo está en dólares. Se guarda en US$ y en pesos a {rateText(fxRate(s, data.day || today))} por US$1.</span></div>}
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
            {catGroups(s, 'gasto').map((g) => <optgroup key={g.id} label={g.name}>{g.cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}
          </select>
        </div>
        {cat && cat.budget > 0 ? (
          <>
            <div class="between small"><span class="muted semi">Así queda {cat.name} este mes</span><span class="strong">{money(after)} de {money(cat.budget)}</span></div>
            <Bar value={after / cat.budget} size="lg" color={after > cat.budget ? 'var(--vit)' : areaColor('finanzas')} label={`${Math.round((after / cat.budget) * 100)} % del presupuesto`} />
          </>
        ) : <span class="small muted">Esta categoría no tiene presupuesto. Puedes ponerle uno en Finanzas.</span>}
      </section>
      {thumb && (
        <label class="between-c panel" style={{ cursor: 'pointer' }}>
          <span class="stack-xs"><span class="semi">Guardar la foto con el gasto</span><span class="small muted">Queda en este teléfono y, si sincronizas, en tu Drive (Astra/Fotos/Recibos).</span></span>
          <Switch checked={keep} onChange={setKeep} label="Guardar la foto con el gasto" />
        </label>
      )}
      {(from.startsWith('ocr') || from.startsWith('ia')) && (
        <button type="button" class="link-btn" style={{ alignSelf: 'flex-start', minHeight: 36 }} onClick={asVoucher}>
          <Icon name="send" size={16} />¿Es un comprobante de transferencia o de pago?<Icon name="right" size={14} />
        </button>
      )}
      {rawText && (
        <details class="table-view">
          <summary>Ver el texto leído</summary>
          <pre class="code-box" style={{ marginTop: 6 }}>{rawText}</pre>
        </details>
      )}
      <button type="button" class="btn block" disabled={!(Number(data.total) > 0) || saving} onClick={save}><Icon name="check" size={20} />Guardar gasto</button>
      <button type="button" class="link-btn muted" style={{ alignSelf: 'center' }} onClick={() => { setPhase('pick'); setThumb(''); fileRef.current = null; }}>Tomar otra foto</button>
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
