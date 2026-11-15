// Compras → Precios (1.18): tu libreta de precios del súper. Anotas lo que cuesta cada producto (a mano, con la
// foto de la etiqueta o con la del recibo) y ves su histórico, la tienda más barata y cuánto sube tu canasta.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Sheet, SheetHead, TChip, Switch, NumberField, Bar, toast, ask, plural, money, moneyR, areaColor, areaSoft, areaInk } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { fmtShort, fmtDay, diffDays } from '../app/dates.js';
import { ocrSupported, readText, stopOCR } from '../app/ocr.js';
import { addPhoto } from '../app/photos.js';
import { PhotoThumb, PhotoViewer } from '../ui/photos.jsx';
import { aiProvider, aiJSON, aiErrorText, prepareImage, receiptPrompt, checkReceipt } from '../ai/ai.js';
import { parseScan } from '../game/scan.js';
import { AISLES, UNITS, suggestProducts } from '../game/shoplex.js';
import { shopOf, addShopItems } from '../game/shop.js';
import {
  priceBook, priceStats, pricesOf, addPrice, removePrice, setTracked, perBase, showFactor, priceUnit, perText, sizeText, sizesFor, productFor,
  basket, receiptItems, receiptPrices, labelInfo, inBase, sizeIn, STAPLES,
} from '../game/prices.js';

const AREA = 'finanzas';
const pctTxt = (v) => `${Math.round(Math.abs(v) * 100)} %`;
const nameOf = (rows, key) => { const r = rows.find((x) => x.key === key); return r ? r.name : productFor('', key).name; };
// «el cartón de 30» → «del cartón de 30»; «la libra» → «de la libra».
// En la revisión del recibo: «la libra» si es el precio por libra; si no, el tamaño («10 lb», «cartón de 30»).
const MEASURE = new Set(['lb', 'kg', 'g', 'oz', 'l', 'ml', 'gal']);
const lineSize = (r) => (Number(r.qty) === 1 && MEASURE.has(r.unit) ? perText(r.unit) : sizeText(r));
const delText = (per) => (per.startsWith('el ') ? `del ${per.slice(3)}` : `de ${per}`);
// «Sin unidad» y «unidad» son lo mismo al comparar tamaños.
const sameSize = (a, b) => !!a && !!b && Math.abs(a.qty - b.qty) < 1e-9 && (a.unit || 'u') === (b.unit || 'u');

// Cambio frente al precio anterior: ↑ rojo (subió), ↓ verde (bajó). Menos de 1 %, igual.
export function ChangeChip({ change, label = '' }) {
  if (change == null) return null;
  if (Math.abs(change) < 0.01) return <span class="chip sm">Igual</span>;
  const up = change > 0;
  return <span class={`chip sm ${up ? 'tone-vit' : 'tone-good'}`} aria-label={`${up ? 'Subió' : 'Bajó'} ${pctTxt(change)}${label}`}><Icon name={up ? 'arrowup' : 'arrowdown'} size={12} />{pctTxt(change)}</span>;
}

function Spark({ series }) {
  const vs = series.slice(-8).map((p) => p.v);
  if (vs.length < 2) return null;
  const W = 56; const H = 24;
  const lo = Math.min(...vs); const hi = Math.max(...vs);
  const pts = vs.map((v, i) => [3 + (i * (W - 6)) / (vs.length - 1), hi === lo ? H / 2 : 3 + (1 - (v - lo) / (hi - lo)) * (H - 6)]);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={`M${pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' L')}`} fill="none" stroke="var(--muted)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" fill="var(--ink)" />
    </svg>
  );
}

// Un botón que abre la cámara (o la galería) tocando directo el campo de archivo: así funciona en todos los
// teléfonos, también con la app instalada (un campo escondido que se «toca» desde otro botón a veces no abre).
export function FilePick({ onFiles, camera = false, multiple = false, children, cls = 'btn soft grow', label }) {
  return (
    <label class={`${cls} filepick`}>
      {children}
      <input type="file" accept="image/*" capture={camera ? 'environment' : undefined} multiple={!camera && multiple}
        aria-label={label} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', fontSize: 0 }}
        onChange={(e) => { const fs = Array.from(e.currentTarget.files || []); e.currentTarget.value = ''; if (fs.length) onFiles(fs); }} />
    </label>
  );
}

// ---------- La pestaña ----------

export function PricesTab({ s, today, list, setSheet }) {
  const sh = shopOf(s);
  const [q, setQ] = useState('');
  const rows = priceBook(s, today, { q });
  const withPrice = rows.filter((r) => r.stats.last);
  const b = basket(s, today);
  // Para agregar: lo básico que no sigues y lo que compras seguido (de tus compras con lista).
  const often = Object.entries(sh.hist).filter(([k, h]) => h.n >= 2 && !sh.track.includes(k)).sort((a, b) => b[1].n - a[1].n).map(([k, h]) => productFor(h.name, k));
  const untracked = [...STAPLES.filter((k) => !sh.track.includes(k)).map((k) => productFor('', k)), ...often].filter((p, i, xs) => xs.findIndex((y) => y.key === p.key) === i).slice(0, 8);
  const groups = [];
  for (const a of AISLES) { const xs = rows.filter((r) => r.aisle === a.id); if (xs.length) groups.push({ a, xs }); }
  const up = b.change != null && b.change > 0.005;
  return (
    <>
      <section class="stack-sm" aria-label="Resumen de precios">
        <span class="eyebrow" style={{ color: areaInk(AREA) }}>Precios</span>
        <h1 class="h1">{withPrice.length ? `${plural(withPrice.length, 'producto', 'productos')} con precio` : 'Tu libreta de precios'}</h1>
        <p class="lead">{b.change != null
          ? `Tu canasta ${up ? 'subió' : b.change < -0.005 ? 'bajó' : 'está igual'}${Math.abs(b.change) >= 0.005 ? ` ${pctTxt(b.change)}` : ''} en unos 3 meses (${plural(b.moved, 'producto', 'productos')}).`
          : 'Anota lo que cuesta cada cosa: con eso calculo tu lista, ves dónde sale más barato y si los precios suben.'}</p>
      </section>
      {(b.up.length > 0 || b.down.length > 0) && (
        <div class="stack-xs" aria-label="Lo que más cambió">
          {b.up.length > 0 && <div class="chips scroll" role="group" aria-label="Lo que más subió"><span class="tiny semi muted" style={{ alignSelf: 'center', minWidth: 34 }}>Subió</span>{b.up.map((x) => <button key={x.key} type="button" class="chip sm tone-vit" onClick={() => setSheet({ t: 'product', key: x.key })}><Icon name="arrowup" size={12} />{nameOf(rows, x.key)} {pctTxt(x.st.change3)}</button>)}</div>}
          {b.down.length > 0 && <div class="chips scroll" role="group" aria-label="Lo que bajó"><span class="tiny semi muted" style={{ alignSelf: 'center', minWidth: 34 }}>Bajó</span>{b.down.map((x) => <button key={x.key} type="button" class="chip sm tone-good" onClick={() => setSheet({ t: 'product', key: x.key })}><Icon name="arrowdown" size={12} />{nameOf(rows, x.key)} {pctTxt(x.st.change3)}</button>)}</div>}
        </div>
      )}
      {/* Sin «capture»: el teléfono deja elegir entre la cámara y la galería. Anotar a mano es el botón +. */}
      <div class="quick2">
        <FilePick cls="qbtn" onFiles={(fs) => setSheet({ t: 'price', initial: { file: fs[0], store: list ? list.store : '' } })} label="Foto de una etiqueta de precio">
          <span class="tile sm" style={{ background: areaSoft(AREA), color: areaInk(AREA) }}><Icon name="camera" size={18} /></span>
          <b>Foto de la etiqueta</b>
          <span class="tiny muted">Leo el precio del producto</span>
        </FilePick>
        <FilePick cls="qbtn" onFiles={(fs) => setSheet({ t: 'receipt', file: fs[0] })} label="Foto del recibo del súper">
          <span class="tile sm" style={{ background: areaSoft(AREA), color: areaInk(AREA) }}><Icon name="receipt" size={18} /></span>
          <b>Foto del recibo</b>
          <span class="tiny muted">Guardo todos sus precios</span>
        </FilePick>
      </div>
      {rows.length > 8 && <input class="input" type="search" value={q} placeholder="Buscar producto" aria-label="Buscar en tus precios" onInput={(e) => setQ(e.currentTarget.value)} />}
      {!rows.length && !q && <p class="small muted">Empieza con lo que más compras: huevos, leche, arroz, pollo…</p>}
      {groups.map(({ a, xs }) => (
        <section key={a.id} class="stack-xs" aria-label={a.name}>
          <h2 class="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name={a.icon} size={14} />{a.name}</h2>
          <div>{xs.map((r) => <PriceRow key={r.key} r={r} today={today} onOpen={() => setSheet({ t: r.stats.last ? 'product' : 'price', key: r.key })} />)}</div>
        </section>
      ))}
      {untracked.length > 0 && (
        <section class="stack-xs" aria-label="Agregar a tu libreta">
          <h2 class="eyebrow">Agregar a tu libreta</h2>
          <div class="chips">{untracked.map((p) => <TChip key={p.key} sm icon="plus" onClick={() => { act((st) => setTracked(st, p.key, true)); toast(`${p.name} en tu libreta`, 'tag'); }}>{p.name}</TChip>)}</div>
        </section>
      )}
      <p class="tiny muted">Cada precio se pasa a una medida para comparar (la libra, el litro, el cartón de 30). Lo que pagas al terminar una compra con precios también se anota aquí.</p>
    </>
  );
}

function PriceRow({ r, today, onOpen }) {
  const st = r.stats;
  const last = st.last;
  return (
    <button type="button" class="mrow price-row" onClick={onOpen} aria-label={last ? `${r.name}: ${money(last.show)} ${st.per}, ${last.e.store || 'sin tienda'}, ${fmtShort(last.e.day)}` : `${r.name}: sin precio. Anotar`}>
      <span class="body">
        <span class="title">{r.name}</span>
        <span class="meta">{last ? <>{money(last.show)} {st.per}{last.e.store ? ` · ${last.e.store}` : ''} · {diffDays(last.e.day, today) <= 1 ? (last.e.day === today ? 'hoy' : 'ayer') : fmtShort(last.e.day)}</> : 'Sin precio: toca para anotar'}</span>
      </span>
      {last ? <span class="row" style={{ gap: 8, flexShrink: 0 }}><Spark series={st.series} /><ChangeChip change={st.change} /></span> : <Icon name="plus" size={18} />}
    </button>
  );
}

// ---------- Anotar un precio ----------

export function PriceSheet({ initial = {}, list = null, onClose }) {
  const s = useApp();
  const today = s.energy.day;
  const sh = shopOf(s);
  const [prod, setProd] = useState(() => (initial.key || initial.name ? productFor(initial.name || '', initial.key || null) : null));
  const [query, setQuery] = useState('');
  const [price, setPrice] = useState(initial.price || 0);
  const sizes = prod ? sizesFor(prod.key) : [];
  const [size, setSize] = useState(() => (initial.unit !== undefined && initial.qty ? { qty: initial.qty, unit: initial.unit } : null));
  const [custom, setCustom] = useState(false);
  // La tienda: la que te dieron, la de la lista o, si ya anotaste algo hoy, la de ese precio (sigues en el súper).
  const [store, setStore] = useState(() => initial.store || (list && list.store) || (sh.prices.find((e) => e.day === today && e.store) || {}).store || '');
  const [day, setDay] = useState(today);
  const [file, setFile] = useState(initial.file || null);
  const [ocr, setOcr] = useState({ busy: false, amounts: [], prods: [], size: null, unit: null, msg: '', n: 0 });
  const [saving, setSaving] = useState(false);
  const thumb = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (thumb) URL.revokeObjectURL(thumb); }, [thumb]);
  useEffect(() => () => { stopOCR(); }, []);
  // Al elegir el producto, el tamaño más común (el primero de la lista).
  useEffect(() => { if (prod && !size) { const z = sizesFor(prod.key)[0]; setSize({ qty: z.qty, unit: z.unit }); } }, [prod && prod.key]);
  const stores = useMemo(() => {
    const out = [];
    const add = (x) => { const t = String(x || '').trim(); if (t && !out.some((y) => y.toLowerCase() === t.toLowerCase())) out.push(t); };
    for (const e of sh.prices.slice(0, 200)) add(e.store);
    for (const t of sh.trips) add(t.store);
    for (const l of sh.lists) add(l.store);
    for (const x of ['Supermercado Nacional', 'Jumbo', 'La Sirena', 'Bravo', 'Plaza Lama', 'Olé', 'PriceSmart', 'Colmado']) add(x);
    return out.slice(0, 10);
  }, []);
  const sug = query.trim().length >= 2 ? suggestProducts(query, 6) : [];
  const recent = sh.track.slice(0, 12).map((k) => productFor('', k));
  const st = prod ? priceStats(s, prod.key, today) : null;
  const entry = prod && price > 0 && size ? { key: prod.key, price, qty: size.qty, unit: size.unit } : null;
  const per = entry ? perBase(entry) : null;
  const show = per != null ? per * showFactor(prod.key) : null;
  const vsLast = st && st.last && per != null ? per / st.last.per - 1 : null;
  const pu = prod ? priceUnit(prod.key) : null;
  const isShow = !!(pu && size && sameSize(size, { qty: 1, unit: pu.show }));
  // La etiqueta: el precio más probable queda puesto (los otros montos, para tocarlos), los productos que se
  // reconocen se proponen y el tamaño que dice se elige cuando sirve para el producto.
  const readLabel = async (f) => {
    if (!ocrSupported()) return;
    setOcr({ busy: true, amounts: [], prods: [], size: null, unit: null, msg: '', n: 0 });
    try {
      const prepared = await prepareImage(f, 1800);
      const { text } = await readText(prepared.bitmap);
      const r = labelInfo(text);
      setOcr({ busy: false, amounts: r.amounts, prods: r.prods, size: r.size, unit: r.unit, n: Date.now(), msg: !r.amounts.length ? 'No encontré un precio en la foto. Escríbelo.' : r.amounts.length > 1 ? 'Puse el que parece el precio; si no es, toca el correcto.' : '' });
      if (r.amounts.length) setPrice((p) => p || r.amounts[0]);
    } catch {
      setOcr({ busy: false, amounts: [], prods: [], size: null, unit: null, msg: 'No pude leer la foto. Escribe el precio.', n: 0 });
    }
  };
  useEffect(() => {
    if (!prod || !ocr.n) return;
    const base = priceUnit(prod.key).base;
    let z = null;
    if (ocr.unit && base === 'lb') z = { qty: 1, unit: ocr.unit };
    else if (ocr.size && inBase(ocr.size.qty, ocr.size.unit, base) != null) z = ocr.size;
    if (!z) return;
    if (base === 'u' && (z.unit || 'u') === 'u') z = z.qty === 30 ? { qty: 1, unit: 'carton' } : z.qty === 12 ? { qty: 1, unit: 'doc' } : z;
    setSize(z);
    setCustom(!sizesFor(prod.key).some((x) => sameSize(x, z)));
  }, [prod && prod.key, ocr.n]);
  const onPhoto = (fs) => { const f = fs[0]; setFile(f); readLabel(f); };
  // Si llegaste con la foto ya tomada (desde Precios), la leo mientras eliges el producto.
  useEffect(() => { if (initial.file) readLabel(initial.file); }, []);
  const save = async () => {
    if (!entry || saving) return;
    setSaving(true);
    let photo = '';
    if (file) { try { photo = await addPhoto(file, { kind: 'precio', desc: prod.name }); } catch { /* sin foto */ } }
    const r = act((stt, t) => addPrice(stt, { key: prod.key, name: prod.name, price, qty: size.qty, unit: size.unit, store, day, photo, src: file ? 'foto' : 'manual' }, t));
    setSaving(false);
    if (!r) { toast('No pude guardar el precio', 'info'); return; }
    toast(r.change != null && Math.abs(r.change) >= 0.01 ? `${prod.name}: ${r.change > 0 ? 'subió' : 'bajó'} ${pctTxt(r.change)} desde ${r.prev.store ? `${r.prev.store}, ` : ''}${fmtShort(r.prev.day)}` : `Precio de ${prod.name.toLowerCase()} guardado`, 'tag');
    onClose();
  };
  return (
    <Sheet onClose={onClose} label="Anotar precio">
      <SheetHead title="Anotar precio" onClose={onClose} />
      {!prod && thumb && (
        <div class="row" style={{ gap: 12 }}>
          <img src={thumb} alt="Tu foto de la etiqueta" class="receipt-thumb" />
          <span class="small muted" role="status">{ocr.busy ? 'Leyendo la etiqueta…' : ocr.amounts.length ? `Leí ${money(ocr.amounts[0])}. ¿De qué producto es?` : ocr.msg || '¿De qué producto es?'}</span>
        </div>
      )}
      {!prod ? (
        <div class="field">
          <label for="pp-q">Producto</label>
          <input id="pp-q" class="input big" value={query} placeholder="Ej. huevos, leche, atún" autoFocus={!thumb} onInput={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && query.trim().length >= 2) setProd(productFor(query.trim())); }} />
          {ocr.prods.length > 0 && !sug.length && (
            <div class="chips" role="group" aria-label="Productos de la foto">
              {ocr.prods.map((p) => <TChip key={p.key} sm icon="camera" on onClick={() => setProd(p)}>{p.name}</TChip>)}
            </div>
          )}
          <div class="chips" role="group" aria-label="Productos">
            {(sug.length ? sug.map((c) => productFor('', c.key)) : recent.filter((p) => !ocr.prods.some((x) => x.key === p.key))).map((p) => <TChip key={p.key} sm onClick={() => setProd(p)}>{p.name}</TChip>)}
            {query.trim().length >= 2 && !sug.some((c) => c.name.toLowerCase() === query.trim().toLowerCase()) && <TChip sm icon="plus" onClick={() => setProd(productFor(query.trim()))}>«{query.trim()}»</TChip>}
          </div>
        </div>
      ) : (
        <div class="between-c">
          <span class="stack-xs" style={{ gap: 0 }}><span class="tiny semi muted">Producto</span><span class="h2">{prod.name}</span></span>
          {!initial.key && <button type="button" class="link-btn" onClick={() => { setProd(null); setSize(null); }}>Cambiar</button>}
        </div>
      )}
      {prod && (
        <>
          <div class="field">
            <div class="between-c"><label for="pp-p">Precio</label>
              {/* Sin «capture»: el teléfono deja elegir cámara o galería. La foto se guarda con el precio. */}
              <FilePick cls="link-btn" onFiles={onPhoto} label={file ? 'Cambiar la foto de la etiqueta' : 'Foto de la etiqueta'}><Icon name="camera" size={16} />{file ? 'Otra foto' : 'Foto de la etiqueta'}</FilePick>
            </div>
            <NumberField id="pp-p" value={price} onChange={setPrice} step={5} min={0} prefix="RD$" label="Precio" />
            {thumb && (
              <div class="row" style={{ gap: 10 }}>
                <img src={thumb} alt="Tu foto de la etiqueta" class="receipt-thumb sm" />
                <span class="tiny muted" role="status">{ocr.busy ? 'Leyendo el precio de la foto…' : ocr.msg || (ocr.amounts.length ? `Leí ${money(ocr.amounts[0])} en la foto.` : 'La foto se guarda con el precio.')}</span>
              </div>
            )}
            {ocr.amounts.length > 1 && <div class="chips" role="group" aria-label="Montos de la foto">{ocr.amounts.map((v) => <TChip key={v} sm icon="camera" on={price === v} onClick={() => setPrice(v)}>{money(v)}</TChip>)}</div>}
          </div>
          <div class="field"><label>¿De qué tamaño?</label>
            <div class="chips" role="group" aria-label="Tamaño">
              {sizes.map((z) => <TChip key={z.label} sm on={!custom && sameSize(size, z)} onClick={() => { setCustom(false); setSize({ qty: z.qty, unit: z.unit }); }}>{z.label}</TChip>)}
              <TChip sm on={custom} onClick={() => setCustom(true)}>Otro</TChip>
            </div>
            {custom && (
              <>
                <NumberField value={size ? size.qty : 1} onChange={(v) => setSize({ qty: v || 1, unit: size ? size.unit : null })} step={1} min={0} label="Cantidad" />
                <div class="chips scroll" role="group" aria-label="Unidad">
                  {UNITS.filter((u) => u.k !== 'u').slice(0, 16).map((u) => <TChip key={u.k} sm on={size && size.unit === u.k} onClick={() => setSize({ qty: size ? size.qty : 1, unit: u.k })}>{u.short}</TChip>)}
                  <TChip sm on={size && !size.unit} onClick={() => setSize({ qty: size ? size.qty : 1, unit: null })}>unidad</TChip>
                </div>
              </>
            )}
          </div>
          {show != null && (!isShow || vsLast != null) && (
            <div class="note" style={{ margin: 0 }}>
              <Icon name="tag" size={18} />
              <span>
                {!isShow && <>Equivale a <b>{money(Math.round(show * 100) / 100)} {perText(pu.show)}</b>. </>}
                {vsLast != null && (Math.abs(vsLast) < 0.01
                  ? <>Igual que la última vez</>
                  : <><b style={{ color: vsLast > 0 ? 'var(--vit-ink)' : 'var(--good-ink)' }}>{pctTxt(vsLast)} {vsLast > 0 ? 'más caro' : 'más barato'}</b> que la última vez</>)}
                {vsLast != null && ` (${st.last.e.store ? `${st.last.e.store}, ` : ''}${fmtShort(st.last.e.day)}).`}
              </span>
            </div>
          )}
          {per == null && price > 0 && size && <span class="tiny" style={{ color: 'var(--vit-ink)' }}>Con esa medida no lo puedo comparar con tus otros precios de {prod.name.toLowerCase()} ({perText(priceUnit(prod.key).show)}).</span>}
          <div class="field"><label for="pp-st">Tienda</label>
            <input id="pp-st" class="input" value={store} maxLength={40} placeholder="Ej. Jumbo, Nacional, el colmado" onInput={(e) => setStore(e.currentTarget.value)} />
            <div class="chips scroll" role="group" aria-label="Tiendas">{stores.map((x) => <TChip key={x} sm on={store.toLowerCase() === x.toLowerCase()} onClick={() => setStore(x)}>{x}</TChip>)}</div>
          </div>
          <div class="field"><label for="pp-d">Fecha</label><input id="pp-d" class="input" type="date" value={day} max={today} onInput={(e) => setDay(e.currentTarget.value || today)} /></div>
          <button type="button" class="btn block" disabled={!entry || saving} onClick={save}><Icon name="check" size={20} />{saving ? 'Guardando…' : 'Guardar precio'}</button>
        </>
      )}
    </Sheet>
  );
}

// ---------- Un producto: su histórico ----------

function PriceChart({ series, per }) {
  const pts = series.filter((p) => p.v > 0);
  if (pts.length < 2) return null;
  const W = 320; const H = 140; const L = 46; const R = 10; const T = 12; const B = 24;
  const vs = pts.map((p) => p.v);
  let lo = Math.min(...vs); let hi = Math.max(...vs);
  if (hi === lo) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.18; lo -= pad; hi += pad;
  const x = (i) => L + (i * (W - L - R)) / Math.max(1, pts.length - 1);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = `M${pts.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' L')}`;
  const ticks = [lo + pad, hi - pad];
  return (
    <div class="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Precio ${per}: ${pts.map((p) => `${fmtShort(p.day)} ${money(p.v)}${p.store ? ` en ${p.store}` : ''}`).join(', ')}`}>
        {ticks.map((g) => <g key={g}><line x1={L} x2={W - R} y1={y(g)} y2={y(g)} class="grid" /><text x={L - 6} y={y(g) + 4} text-anchor="end" class="axis">{moneyR(g).replace('RD$', '')}</text></g>)}
        <path d={path} class="ln" style={{ stroke: areaColor(AREA) }} />
        {pts.map((p, i) => <circle key={p.id} cx={x(i)} cy={y(p.v)} r={i === pts.length - 1 ? 5 : 4} class="dot" style={{ fill: i === pts.length - 1 ? 'var(--ink)' : areaColor(AREA) }}><title>{`${fmtShort(p.day)}${p.store ? ` · ${p.store}` : ''}: ${money(p.v)}`}</title></circle>)}
        <text x={x(0)} y={H - 6} text-anchor="start" class="axis">{fmtShort(pts[0].day)}</text>
        <text x={x(pts.length - 1)} y={H - 6} text-anchor="end" class="axis">{fmtShort(pts[pts.length - 1].day)}</text>
      </svg>
      <span class="tiny muted">Precio {delText(per)}, en pesos. El punto oscuro es el último.</span>
    </div>
  );
}

export function ProductSheet({ k, list, onClose, onAdd }) {
  const s = useApp();
  const today = s.energy.day;
  const sh = shopOf(s);
  const st = priceStats(s, k, today);
  const entries = pricesOf(s, k);
  const prod = productFor(entries[0] ? entries[0].name : '', k);
  const tracked = sh.track.includes(k);
  const [photo, setPhoto] = useState(null);
  const last = st.last;
  const del = async (e) => {
    if (!(await ask(`¿Borrar el precio del ${fmtShort(e.day)}${e.store ? ` en ${e.store}` : ''}?`, { ok: 'Borrar', danger: true }))) return;
    act((stt) => removePrice(stt, e.id));
    toast('Precio borrado', 'trash');
  };
  const toList = () => {
    act((stt, d) => addShopItems(stt, [{ name: prod.name, key: k, aisle: prod.aisle }], { list: list ? list.id : null, by: 'manual', today: d }));
    toast(`${prod.name} a tu lista`, 'cart');
  };
  return (
    <Sheet onClose={onClose} label={`Precios de ${prod.name}`}>
      <SheetHead title={prod.name} onClose={onClose} />
      {last ? (
        <div class="stack-xs">
          <span class="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}><span class="display-num tab-num" style={{ fontSize: 36 }}>{money(last.show)}</span><span class="small semi muted">{st.per}</span><ChangeChip change={st.change} label=" desde el anterior" /></span>
          <span class="small muted">{last.e.store || 'Sin tienda'} · {fmtDay(last.e.day, { weekdayName: false })}{sameSize(last.e, { qty: 1, unit: st.pu.show }) ? '' : ` · ${sizeText(last.e)} a ${money(last.e.price)}`}</span>
        </div>
      ) : <p class="lead">Todavía no tiene precio.</p>}
      {last && (
        <div class="kpis3 price-kpis">
          <div class="stack-xs"><span class="tiny semi muted">Más bajo</span><span class="strong tab-num kpi-v">{st.min ? money(st.min.show) : '—'}</span><span class="kpi-sub">{st.min && st.min.e.store ? st.min.e.store : '90 días'}</span></div>
          <div class="stack-xs"><span class="tiny semi muted">Promedio</span><span class="strong tab-num kpi-v">{st.avg != null ? money(st.avg) : '—'}</span><span class="kpi-sub">90 días</span></div>
          <div class="stack-xs"><span class="tiny semi muted">En 3 meses</span><span class="strong tab-num kpi-v" style={{ color: st.change3 > 0.01 ? 'var(--vit-ink)' : st.change3 < -0.01 ? 'var(--good-ink)' : 'var(--ink)' }}>{st.change3 != null ? `${st.change3 > 0 ? '+' : st.change3 < 0 ? '−' : ''}${pctTxt(st.change3)}` : '—'}</span><span class="kpi-sub">{st.old ? `desde ${fmtShort(st.old.e.day)}` : 'faltan datos'}</span></div>
        </div>
      )}
      <PriceChart series={st.series} per={st.per} />
      {st.stores.length >= 2 && (
        <div class="stack-xs">
          <span class="label">Por tienda (últimos 3 meses)</span>
          {st.stores.map((x, i) => (
            <div key={x.store} class="between-c small" style={{ minHeight: 34 }}>
              <span class="row" style={{ gap: 6 }}>{i === 0 && <Icon name="star" size={14} />}<span class={i === 0 ? 'semi' : ''}>{x.store}</span><span class="tiny muted">· {fmtShort(x.day)}</span></span>
              <b class="tab-num">{money(x.show)}</b>
            </div>
          ))}
        </div>
      )}
      <div class="stack-xs">
        <span class="label">Histórico · {plural(entries.length, 'precio', 'precios')}</span>
        {entries.map((e) => {
          const pb = perBase(e);
          return (
            <div key={e.id} class="hist-row">
              {e.photo ? <PhotoThumb id={e.photo} size={40} onOpen={() => setPhoto(e.photo)} label={`Foto del ${fmtShort(e.day)}`} /> : <span class="tile xs" style={{ background: 'var(--soft)' }}><Icon name={e.src === 'recibo' ? 'receipt' : e.src === 'compra' ? 'cart' : 'tag'} size={14} /></span>}
              <span class="stack-xs grow" style={{ gap: 0, minWidth: 0 }}>
                <span class="small semi">{fmtShort(e.day)}{e.store ? ` · ${e.store}` : ''}</span>
                <span class="tiny muted">{sizeText(e)}{pb != null && (e.unit !== priceUnit(k).show || e.qty !== 1) ? ` · ${money(Math.round(pb * showFactor(k) * 100) / 100)} ${perText(priceUnit(k).show)}` : ''}{e.note ? ` · ${e.note}` : ''}</span>
              </span>
              <b class="tab-num small" style={{ whiteSpace: 'nowrap' }}>{money(e.price)}</b>
              <button type="button" class="icon-btn sm plain" aria-label={`Borrar precio del ${fmtShort(e.day)}`} onClick={() => del(e)}><Icon name="trash" size={16} /></button>
            </div>
          );
        })}
      </div>
      <div class="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" class="btn grow" onClick={onAdd}><Icon name="plus" size={20} />Anotar precio</button>
        <button type="button" class="btn soft grow" onClick={toList}><Icon name="cart" size={20} />A la lista</button>
      </div>
      <label class="between-c" style={{ cursor: 'pointer', minHeight: 48 }}>
        <span class="stack-xs" style={{ gap: 0 }}><span class="semi">Seguir en mi libreta</span><span class="tiny muted">Sale en Precios y cuenta para tu canasta.</span></span>
        <Switch checked={tracked} onChange={(v) => act((stt) => setTracked(stt, k, v))} label="Seguir en mi libreta" />
      </label>
      {photo && <PhotoViewer id={photo} onClose={() => setPhoto(null)} />}
    </Sheet>
  );
}

// ---------- Foto del recibo → precios ----------

export function ReceiptPricesSheet({ file = null, onClose }) {
  const s = useApp();
  const today = s.energy.day;
  const [phase, setPhase] = useState(file ? 'reading' : 'pick');
  const [prog, setProg] = useState(null);
  const [msg, setMsg] = useState('');
  const [rows, setRows] = useState([]);
  const [store, setStore] = useState('');
  const [day, setDay] = useState(today);
  const [provider, setProvider] = useState(undefined);
  const run = useRef(0);
  const auto = useRef(!!file);
  const canOCR = ocrSupported();
  useEffect(() => {
    aiProvider(s.settings, { needImages: true }).then(setProvider).catch(() => setProvider(null));
    return () => { run.current += 1; stopOCR(); };
  }, []);
  // Si llegaste con la foto ya tomada, se lee en cuanto sé si hay IA (sin lector en el teléfono, con la IA).
  useEffect(() => { if (auto.current && provider !== undefined) { auto.current = false; read([file], !canOCR); } }, [provider]);
  const finish = (items, merchant, d, note = '') => {
    const props = receiptPrices(items);
    if (merchant) setStore(merchant);
    if (d && d <= today) setDay(d);
    if (!props.length) { setPhase('pick'); setMsg(note || 'No encontré productos con precio. Prueba con la foto más derecha, con buena luz y completa.'); return; }
    setRows(props);
    setMsg(note);
    setPhase('review');
  };
  const read = async (fs, useAI = false) => {
    const f = fs[0];
    const me = ++run.current;
    setPhase('reading'); setMsg(''); setProg(null);
    let prepared;
    try { prepared = await prepareImage(f, 2000); } catch { setPhase('pick'); setMsg('No pude abrir la foto.'); return; }
    if (useAI && provider) {
      try {
        const raw = await aiJSON(provider, receiptPrompt(), { image: prepared.blob, task: 'recibo' });
        const r = checkReceipt(raw);
        if (run.current !== me) return;
        finish(r.items.map((x) => ({ desc: x.desc, total: x.total, qty: 1, each: x.total, size: sizeIn(x.desc), weight: null })), r.merchant, r.day);
      } catch (err) { if (run.current === me) { setPhase('pick'); setMsg(aiErrorText(err) || 'No pude leer el recibo.'); } }
      return;
    }
    if (!canOCR) { setPhase('pick'); setMsg('Este navegador no puede leer texto de fotos. Usa «Leer con IA» o anota los precios a mano.'); return; }
    try {
      const { text } = await readText(prepared.bitmap, (p) => { if (run.current === me) setProg(p); });
      if (run.current !== me) return;
      const head = parseScan(text, today, { kind: 'recibo' });
      finish(receiptItems(text), head.merchant, head.day, 'Lo leí con el lector del teléfono: revisa cada precio antes de guardar.');
    } catch { if (run.current === me) { setPhase('pick'); setMsg('No pude leer el recibo. Prueba otra foto.'); } }
  };
  const toggle = (i) => setRows(rows.map((r, j) => (j === i ? { ...r, on: !r.on } : r)));
  const n = rows.filter((r) => r.on).length;
  const save = () => {
    const chosen = rows.filter((r) => r.on);
    const res = act((st, t) => chosen.map((r) => addPrice(st, { key: r.key, name: r.name, price: r.price, qty: r.qty, unit: r.unit, note: r.note, store, day, src: 'recibo' }, t)).filter(Boolean));
    const ups = res.filter((r) => r.change != null && r.change >= 0.05).length;
    toast(`${plural(res.length, 'precio guardado', 'precios guardados')}${ups ? ` · ${ups} ${ups === 1 ? 'subió' : 'subieron'}` : ''}`, 'tag');
    onClose();
  };
  return (
    <Sheet onClose={onClose} label="Precios del recibo">
      <SheetHead title={phase === 'review' ? 'Revisa los precios' : 'Precios del recibo'} onClose={onClose} />
      {phase === 'pick' && (
        <>
          <p class="small muted">Toma la foto del recibo del súper derecho, con buena luz y completo. Saco cada producto con su precio y su tamaño (1 L, 10 lb, 30 und…); tú revisas antes de guardar.</p>
          <div class="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <FilePick camera onFiles={(fs) => read(fs)} label="Tomar foto del recibo"><Icon name="camera" size={20} />Tomar foto</FilePick>
            <FilePick onFiles={(fs) => read(fs)} label="Elegir foto del recibo"><Icon name="image" size={20} />Galería</FilePick>
          </div>
          {provider && <FilePick cls="btn ghost block" onFiles={(fs) => read(fs, true)} label="Leer el recibo con IA"><Icon name="sparkle" size={18} />Leer con IA (mejor con recibos borrosos)</FilePick>}
          {msg && <p class="small" role="status" style={{ color: 'var(--vit-ink)' }}>{msg}</p>}
        </>
      )}
      {phase === 'reading' && (
        <div class="stack-sm" role="status" aria-live="polite">
          <p class="lead">{prog ? prog.label : 'Preparando la foto…'}</p>
          <Bar value={prog ? prog.pct : 0.12} color={areaColor(AREA)} label={prog ? `${Math.round(prog.pct * 100)} %` : 'Progreso'} />
          <span class="tiny muted">La primera vez se descarga el lector (unos 6 MB); después funciona sin internet.</span>
          <button type="button" class="btn ghost block" onClick={() => { run.current += 1; stopOCR(); setPhase('pick'); }}>Cancelar</button>
        </div>
      )}
      {phase === 'review' && (
        <>
          <div class="field"><label for="rp-st">Tienda</label><input id="rp-st" class="input" value={store} maxLength={40} placeholder="Ej. Jumbo" onInput={(e) => setStore(e.currentTarget.value)} /></div>
          <div class="field"><label for="rp-d">Fecha</label><input id="rp-d" class="input" type="date" value={day} max={today} onInput={(e) => setDay(e.currentTarget.value || today)} /></div>
          <p class="small muted" style={{ margin: 0 }}>Encontré {plural(rows.length, 'producto', 'productos')} con precio. Se guardan los marcados; los que no conozco quedan sin marcar.</p>
          <div>
            {rows.map((r, i) => (
              <label key={i} class="mrow" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={r.on} onChange={() => toggle(i)} aria-label={r.name} />
                <span class="body">
                  <span class="title">{r.name}{!r.known && <span class="tiny muted"> · nuevo</span>}</span>
                  <span class="meta">{lineSize(r)} · {r.line}</span>
                </span>
                <b class="tab-num small" style={{ whiteSpace: 'nowrap' }}>{money(r.price)}</b>
              </label>
            ))}
          </div>
          {msg && <p class="small muted">{msg}</p>}
          <button type="button" class="btn block" disabled={!n} onClick={save}><Icon name="check" size={20} />Guardar {plural(n, 'precio', 'precios')}</button>
        </>
      )}
    </Sheet>
  );
}

