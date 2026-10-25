import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Nav, TopBar, Sheet, SheetHead, TChip, Switch, NumberField, NumberChips, Bar, Empty, toast, ask, plural, money, areaColor, areaSoft, areaInk, focusOnMount } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { go } from '../app/router.js';
import { addDays, diffDays, fmtShort } from '../app/dates.js';
import { dictate, canDictate } from '../ui/dictate.js';
import { ocrSupported, readText, stopOCR } from '../app/ocr.js';
import {
  aiProvider, aiJSON, aiErrorText, prepareImage, shopScanPrompt, checkShopScan, receiptPrompt, checkReceipt, readBarcode, lookupBarcode,
} from '../ai/ai.js';
import {
  AISLES, UNITS, LEVELS, WISH_DAYS, LIST_ICONS, aisleOf, qtyText, unitOf, parseShopLine, shopOf, listOf, addList, updateList, removeList,
  addShopItems, parseAndAdd, updateItem, removeItem, toggleItem, clearChecked, priceOf, itemTotal, listTotals, monthBudget, cheapest, dueSuggestions,
  pantryUpsert, setLevel, removePantry, toggleBasic, expiring, runningLow, analyzePantry, applyScan, closeTrip, matchReceipt, applyPrices,
  addWish, updateWish, removeWish, wishInfo, dropWish, buyWish, reopenWish, shopText, shopSummary,
} from '../game/shop.js';
import { suggestProducts } from '../game/shoplex.js';

// Compras: listas, despensa (con foto) y deseos. Todo lo que se compra termina en Finanzas como gasto de supermercado.

const AREA = 'finanzas';
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : '');
const TABS = [['lista', 'Lista'], ['despensa', 'Despensa'], ['deseos', 'Deseos']];

function groupByAisle(items) {
  const out = [];
  for (const a of AISLES) {
    const xs = items.filter((i) => i.aisle === a.id);
    if (xs.length) out.push({ a, xs });
  }
  return out;
}

// ---------- Pantalla ----------

export function Compras({ query }) {
  const s = useApp();
  const today = s.energy.day;
  const sh = shopOf(s);
  const [tab, setTab] = useState(() => { const v = query && query.get('ver'); return TABS.some((t) => t[0] === v) ? v : 'lista'; });
  const [listId, setListId] = useState(() => (query && query.get('l')) || null);
  const [sheet, setSheet] = useState(() => (query && query.get('foto') ? { t: 'scan' } : null));
  const lists = sh.lists.filter((l) => !l.archived);
  const list = lists.find((l) => l.id === listId) || listOf(s, null);
  const close = () => setSheet(null);

  return (
    <>
      <main class="screen" style={{ paddingBottom: 150 }}>
        <TopBar backTo="/areas" right={<button type="button" class="icon-btn" aria-label="Ajustes de compras" onClick={() => setSheet({ t: 'cfg' })}><Icon name="gear" /></button>} />
        <div class="seg" role="tablist" aria-label="Compras">
          {TABS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k ? 'true' : 'false'} onClick={() => setTab(k)}>{label}</button>)}
        </div>
        {tab === 'lista' && <ListTab s={s} today={today} list={list} lists={lists} setListId={setListId} setSheet={setSheet} />}
        {tab === 'despensa' && <PantryTab s={s} today={today} list={list} setSheet={setSheet} />}
        {tab === 'deseos' && <WishTab s={s} today={today} setSheet={setSheet} />}
      </main>
      <Nav active="areas" fab={tab === 'deseos' ? { onClick: () => setSheet({ t: 'wish' }), label: 'Nuevo deseo' } : { onClick: () => setSheet({ t: 'scan' }), label: 'Foto' }} />
      {sheet && sheet.t === 'item' && <ItemSheet id={sheet.id} onClose={close} />}
      {sheet && sheet.t === 'scan' && <ScanSheet list={list} mode={sheet.mode} onClose={close} />}
      {sheet && sheet.t === 'trip' && <TripSheet list={list} onClose={close} />}
      {sheet && sheet.t === 'list' && <ListSheet id={sheet.id} onClose={(newId) => { close(); if (typeof newId === 'string') setListId(newId); }} />}
      {sheet && sheet.t === 'wish' && <WishSheet id={sheet.id} onClose={close} />}
      {sheet && sheet.t === 'pantry' && <PantrySheet id={sheet.id} list={list} onClose={close} />}
      {sheet && sheet.t === 'cfg' && <CfgSheet onClose={close} />}
      {sheet && sheet.t === 'review' && <ReviewSheet list={list} onClose={close} />}
    </>
  );
}

// ---------- Pestaña Lista ----------

function ListTab({ s, today, list, lists, setListId, setSheet }) {
  const sh = shopOf(s);
  const [text, setText] = useState('');
  const [mic, setMic] = useState(false);
  const stopMic = useRef(null);
  useEffect(() => () => { if (stopMic.current) stopMic.current(); }, []);
  const items = sh.items.filter((i) => i.list === list.id);
  const left = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const tot = listTotals(s, list.id);
  const bud = monthBudget(s, today);
  const sug = useMemo(() => {
    const last = text.split(/[,\n]/).pop().trim();
    return last.length >= 2 ? suggestProducts(last, 5) : [];
  }, [text]);
  const due = dueSuggestions(s, today, 6);
  const low = runningLow(s).slice(0, 6);
  const groups = groupByAisle(left);
  const parsed = useMemo(() => parseShopLine(text), [text]);

  const add = (value) => {
    const v = String(value == null ? text : value).trim();
    if (!v) return;
    const p = parseShopLine(v);
    if (!p.length) return;
    const r = act((st, d) => addShopItems(st, p, { list: list.id, by: mic ? 'voz' : 'manual', today: d }));
    setText('');
    const n = r.added.length + r.merged.length;
    toast(r.merged.length && !r.added.length ? 'Ya estaba: sumé la cantidad' : n === 1 ? `${(r.added[0] || r.merged[0]).name} a la lista` : `${n} productos a la lista`, 'cart');
  };
  const pickSug = (c) => {
    const parts = text.split(/([,\n])/);
    parts[parts.length - 1] = ` ${c.name}`;
    const joined = parts.join('').replace(/^\s+/, '');
    setText(joined);
    add(joined);
  };
  const startMic = () => {
    if (mic) { if (stopMic.current) stopMic.current(); return; }
    setMic(true);
    stopMic.current = dictate((t) => setText(t), () => setMic(false));
  };
  const addKnown = (x) => {
    act((st, d) => addShopItems(st, [{ name: x.name, key: x.key, aisle: x.aisle, unit: x.unit }], { list: list.id, by: 'habito', today: d }));
    toast(`${x.name} a la lista`, 'cart');
  };
  const share = async () => {
    const t = shopText(s, list.id);
    try {
      if (navigator.share) { await navigator.share({ title: list.name, text: t }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(t); toast('Lista copiada', 'copy'); } catch { toast('No pude copiar la lista', 'info'); }
  };

  return (
    <>
      <section class="stack-sm" aria-label="Resumen">
        <span class="eyebrow" style={{ color: areaInk(AREA) }}>Compras</span>
        <h1 class="h1">{tot.left ? `${plural(tot.left, 'producto', 'productos')} por comprar` : 'Tu lista está vacía'}</h1>
        {tot.left > 0 && (
          <p class="lead">
            {tot.known ? `Calculo unos ${money(tot.est)}${tot.unknown ? ` (faltan precios de ${tot.unknown})` : ''}.` : 'Aún no tengo precios: se aprenden cuando registras tus compras.'}
            {bud.has ? ` Llevas ${money(bud.spent)} de ${money(bud.budget)} este mes.` : ''}
          </p>
        )}
        {bud.has && <Bar value={Math.min(1, bud.pct)} color={bud.pct > 1 ? 'var(--vit)' : areaColor(AREA)} label={`Presupuesto del súper: ${Math.round(bud.pct * 100)} %`} />}
      </section>

      <div class="chips scroll" role="group" aria-label="Listas">
        {lists.map((l) => <TChip key={l.id} sm icon={l.icon} on={l.id === list.id} onClick={() => setListId(l.id)}>{l.name}</TChip>)}
        <TChip sm icon="plus" onClick={() => setSheet({ t: 'list', id: null })}>Nueva lista</TChip>
      </div>

      <section class="stack-xs" aria-label="Agregar">
        <div class="row" style={{ gap: 8 }}>
          <input class="input grow" value={text} placeholder="Ej. leche, 2 lb de pollo y pan" aria-label="Agregar a la lista" enterKeyHint="send"
            onInput={(e) => setText(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          {text.trim() ? (
            <button type="button" class="btn" style={{ minWidth: 52 }} aria-label="Agregar" onClick={() => add()}><Icon name="plus" size={20} /></button>
          ) : (
            <>
              {canDictate && <button type="button" class={`btn soft${mic ? ' on' : ''}`} style={{ minWidth: 52 }} aria-pressed={mic ? 'true' : 'false'} aria-label="Dictar" onClick={startMic}><Icon name="mic" size={20} /></button>}
              <button type="button" class="btn soft" style={{ minWidth: 52 }} aria-label="Foto" onClick={() => setSheet({ t: 'scan' })}><Icon name="camera" size={20} /></button>
            </>
          )}
        </div>
        {parsed.length > 1 && <span class="tiny muted semi">Voy a agregar: {parsed.map((p) => `${qtyText(p.qty, p.unit) ? `${qtyText(p.qty, p.unit)} ` : ''}${p.name.toLowerCase()}`).join(' · ')}</span>}
        {sug.length > 0 && (
          <div class="chips scroll" role="group" aria-label="Sugerencias">
            {sug.map((c) => <TChip key={c.key} sm icon="plus" onClick={() => pickSug(c)}>{c.name}</TChip>)}
          </div>
        )}
      </section>

      {(due.length > 0 || low.length > 0) && (
        <section class="stack-xs" aria-label="Te puede faltar">
          <h2 class="eyebrow">Te puede faltar</h2>
          <div class="chips scroll" role="group" aria-label="Productos sugeridos">
            {low.map((p) => <TChip key={`l${p.id}`} sm icon="plus" onClick={() => addKnown(p)}>{p.name}<span class="tiny muted"> · {p.level === 'out' ? 'se acabó' : 'poco'}</span></TChip>)}
            {due.filter((d) => !low.some((p) => p.key === d.key)).map((d) => <TChip key={d.key} sm icon="plus" onClick={() => addKnown(d)}>{d.name}<span class="tiny muted"> · ya te toca</span></TChip>)}
          </div>
        </section>
      )}

      {!items.length && (
        <Empty icon="cart" action={<button type="button" class="btn sm soft" onClick={() => setSheet({ t: 'scan' })}><Icon name="camera" size={18} />Tomar foto de la nevera</button>}>
          Escribe o dicta lo que falta. Con una foto de la nevera o la despensa te digo qué hay y qué podría faltar.
        </Empty>
      )}

      {groups.map(({ a, xs }) => (
        <section key={a.id} class="stack-xs" aria-label={a.name}>
          <h2 class="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name={a.icon} size={14} />{a.name}</h2>
          <div>{xs.map((i) => <ItemRow key={i.id} s={s} it={i} today={today} onOpen={() => setSheet({ t: 'item', id: i.id })} />)}</div>
        </section>
      ))}

      {done.length > 0 && (
        <section class="stack-xs" aria-label="En el carrito">
          <div class="between-c"><h2 class="eyebrow">En el carrito · {done.length}</h2>
            <button type="button" class="btn sm ghost" onClick={() => { act((st) => clearChecked(st, list.id)); toast('Quité lo marcado', 'undo'); }}>Quitar</button></div>
          <div>{done.map((i) => <ItemRow key={i.id} s={s} it={i} today={today} onOpen={() => setSheet({ t: 'item', id: i.id })} />)}</div>
        </section>
      )}

      {items.length > 0 && (
        <div class="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" class="btn sm soft" onClick={share}><Icon name="send" size={18} />Compartir lista</button>
          <button type="button" class="btn sm soft" onClick={() => setSheet({ t: 'list', id: list.id })}><Icon name="edit" size={18} />Editar lista</button>
        </div>
      )}

      {done.length > 0 && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 96, padding: '0 20px', zIndex: 5, display: 'flex', justifyContent: 'center' }}>
          <button type="button" class="btn block" style={{ maxWidth: 480 }} onClick={() => setSheet({ t: 'trip' })}>
            <Icon name="check" size={20} />Terminé la compra · {done.length}
          </button>
        </div>
      )}
    </>
  );
}

function ItemRow({ s, it, today, onOpen }) {
  const q = qtyText(it.qty, it.unit);
  const price = priceOf(s, it);
  const best = !it.done ? cheapest(s, it.key) : null;
  const toggle = () => act((st, d) => toggleItem(st, it.id, d));
  return (
    <div class={`mrow todo${it.done ? ' done' : ''}`}>
      <button type="button" class="check" aria-pressed={it.done ? 'true' : 'false'} aria-label={it.done ? `Quitar del carrito: ${it.name}` : `En el carrito: ${it.name}`} onClick={toggle}>
        <span style={it.done ? null : { borderColor: areaColor(AREA) }}>{it.done && <Icon name="check" size={16} stroke={2.8} />}</span>
      </button>
      <button type="button" class="body" onClick={onOpen}>
        <span class="title">{it.name}{q ? <span class="muted semi"> · {q}</span> : null}</span>
        <span class="meta">
          {price > 0 && <span>{money(itemTotal(s, it))}</span>}
          {it.note && <span>· {it.note}</span>}
          {best && best.store && <span>· más barato en {best.store}</span>}
          {it.by === 'foto' && <span>· de la foto</span>}
        </span>
      </button>
    </div>
  );
}

// ---------- Hoja de un producto ----------

function ItemSheet({ id, onClose }) {
  const s = useApp();
  const it = shopOf(s).items.find((x) => x.id === id);
  const [name, setName] = useState(it ? it.name : '');
  const [qty, setQty] = useState(it && it.qty ? it.qty : 0);
  const [unit, setUnit] = useState(it ? it.unit : null);
  const [price, setPrice] = useState(it && it.price ? it.price : 0);
  const [note, setNote] = useState(it ? it.note : '');
  const [aisle, setAisle] = useState(it ? it.aisle : 'otros');
  const [lid, setLid] = useState(it ? it.list : null);
  if (!it) return null;
  const sh = shopOf(s);
  const known = (sh.hist[it.key] || {}).price || 0;
  const best = cheapest(s, it.key);
  const save = () => {
    act((st) => updateItem(st, id, { name, qty: qty || null, unit, price, note, aisle, list: lid }));
    onClose();
  };
  return (
    <Sheet onClose={onClose} label="Producto">
      <SheetHead title="Producto" onClose={onClose} />
      <div class="field"><label for="in">Nombre</label><input id="in" class="input big" value={name} maxLength={60} onInput={(e) => setName(e.currentTarget.value)} /></div>
      <div class="field"><label>Cantidad</label>
        <NumberField value={qty} onChange={setQty} step={1} min={0} max={999} label="Cantidad" />
        <div class="chips scroll" role="group" aria-label="Unidad">
          {UNITS.slice(0, 14).map((u) => <TChip key={u.k} sm on={unit === u.k} onClick={() => setUnit(unit === u.k ? null : u.k)}>{u.short}</TChip>)}
        </div>
      </div>
      <div class="field"><label>Precio {unitOf(unit) && !unitOf(unit).count ? `por ${unitOf(unit).short}` : 'de cada uno'} (opcional)</label>
        <NumberField value={price} onChange={setPrice} step={5} min={0} prefix="RD$" label="Precio" />
        {known > 0 && !price && <span class="tiny muted">La última vez pagaste {money(known)}.</span>}
        {best && <span class="tiny muted">Más barato: {best.store} a {money(best.price)}.</span>}
      </div>
      <div class="field"><label for="inn">Nota (marca, tamaño…)</label><input id="inn" class="input" value={note} maxLength={100} onInput={(e) => setNote(e.currentTarget.value)} /></div>
      <div class="field"><label>Pasillo</label>
        <div class="chips scroll" role="group" aria-label="Pasillo">{AISLES.map((a) => <TChip key={a.id} sm on={aisle === a.id} onClick={() => setAisle(a.id)}>{a.name}</TChip>)}</div></div>
      {sh.lists.length > 1 && (
        <div class="field"><label>Lista</label>
          <div class="chips" role="group" aria-label="Lista">{sh.lists.filter((l) => !l.archived).map((l) => <TChip key={l.id} sm on={lid === l.id} onClick={() => setLid(l.id)}>{l.name}</TChip>)}</div></div>
      )}
      <button type="button" class="btn block" disabled={name.trim().length < 2} onClick={save}><Icon name="check" size={20} />Guardar</button>
      <button type="button" class="btn ghost block" style={{ color: 'var(--vit-ink)' }} onClick={() => { act((st) => removeItem(st, id)); onClose(); toast('Quitado de la lista', 'trash'); }}><Icon name="trash" size={18} />Quitar de la lista</button>
    </Sheet>
  );
}

// ---------- Hoja de lista ----------

function ListSheet({ id, onClose }) {
  const s = useApp();
  const l = id ? shopOf(s).lists.find((x) => x.id === id) : null;
  const [name, setName] = useState(l ? l.name : '');
  const [icon, setIcon] = useState(l ? l.icon : 'cart');
  const [store, setStore] = useState(l ? l.store : '');
  const save = () => {
    const created = act((st, d) => (l ? updateList(st, l.id, { name, icon, store }) : addList(st, { name, icon, store }, d)));
    toast(l ? 'Lista actualizada' : 'Lista creada', 'cart');
    onClose(created && created.id);
  };
  return (
    <Sheet onClose={() => onClose()} label="Lista">
      <SheetHead title={l ? 'Editar lista' : 'Nueva lista'} onClose={() => onClose()} />
      <div class="field"><label for="ln">Nombre</label><input id="ln" class="input big" value={name} maxLength={40} placeholder="Ej. Farmacia, Ferretería, Fiesta" ref={focusOnMount} onInput={(e) => setName(e.currentTarget.value)} /></div>
      <div class="field"><label for="ls">Tienda (opcional)</label><input id="ls" class="input" value={store} maxLength={40} placeholder="Ej. Jumbo, Nacional, Bravo" onInput={(e) => setStore(e.currentTarget.value)} /></div>
      <div class="field"><label>Ícono</label><div class="chips" role="group" aria-label="Ícono">{LIST_ICONS.map((i) => <TChip key={i} sm icon={i} on={icon === i} label={i} onClick={() => setIcon(i)} />)}</div></div>
      <button type="button" class="btn block" disabled={name.trim().length < 2} onClick={save}><Icon name="check" size={20} />{l ? 'Guardar' : 'Crear lista'}</button>
      {l && shopOf(s).lists.length > 1 && (
        <button type="button" class="btn ghost block" style={{ color: 'var(--vit-ink)' }} onClick={async () => {
          if (await ask('¿Borrar esta lista? Lo que tenga pasa a otra lista.', { ok: 'Borrar', danger: true })) { act((st) => removeList(st, l.id)); toast('Lista borrada', 'trash'); onClose(); }
        }}><Icon name="trash" size={18} />Borrar lista</button>
      )}
    </Sheet>
  );
}

// ---------- Foto: nevera, despensa, lista escrita o producto ----------

const MODES = [['despensa', 'Nevera o despensa', 'Veo qué tienes y qué puede faltar'], ['lista', 'Lista, receta o producto', 'Paso lo escrito a tu lista']];

function ScanSheet({ list, mode: mode0, onClose }) {
  const s = useApp();
  const today = s.energy.day;
  const [mode, setMode] = useState(mode0 || 'despensa');
  const [provider, setProvider] = useState(undefined);
  const [files, setFiles] = useState([]);
  const [phase, setPhase] = useState('pick');
  const [msg, setMsg] = useState('');
  const [prog, setProg] = useState(null);
  const [res, setRes] = useState(null);
  const [pickSeen, setPickSeen] = useState(new Set());
  const [pickAdd, setPickAdd] = useState(new Set());
  const ctl = useRef(null);
  const run = useRef(0);
  const inp = useRef(null);
  const canOCR = ocrSupported();

  useEffect(() => {
    aiProvider(s.settings, { needImages: true }).then(setProvider).catch(() => setProvider(null));
    return () => { run.current += 1; if (ctl.current) ctl.current.abort(); stopOCR(); };
  }, []);

  const onFiles = (e) => {
    const fs = Array.from(e.currentTarget.files || []);
    e.currentTarget.value = '';
    if (fs.length) setFiles((old) => [...old, ...fs].slice(0, 6));
  };
  const thumbs = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => thumbs.forEach((u) => URL.revokeObjectURL(u)), [thumbs]);

  const known = useMemo(() => Object.values(shopOf(s).hist).sort((a, b) => b.n - a.n).slice(0, 40).map((h) => h.name), []);

  const analyze = async () => {
    const me = ++run.current;
    setPhase('reading'); setMsg(''); setProg(null);
    const seen = [];
    const ideas = [];
    const adds = [];
    let note = '';
    let title = '';
    let code = null;
    for (const f of files) {
      let prepared;
      try { prepared = await prepareImage(f); } catch { note = 'No pude abrir una de las fotos.'; continue; }
      if (run.current !== me) return;
      if (mode === 'lista') {
        const c = await readBarcode(prepared.bitmap);
        if (c) {
          code = c;
          const cached = shopOf(s).codes[c];
          const nm = cached || await lookupBarcode(c);
          if (nm) { adds.push({ name: nm, qty: null, unit: null, note: '' }); if (!cached) act((st) => { shopOf(st).codes[c] = nm; }); continue; }
        }
      }
      let r = null;
      if (provider) {
        ctl.current = new AbortController();
        try {
          const raw = await aiJSON(provider, shopScanPrompt(mode, known), { image: prepared.blob, signal: ctl.current.signal, task: 'compras' });
          r = checkShopScan(raw, mode);
        } catch (err) {
          if (err && err.code === 'cancelled') return;
          note = aiErrorText(err);
        }
      }
      if (!r && mode === 'lista' && canOCR) {
        try {
          const { text } = await readText(prepared.bitmap, (p) => { if (run.current === me) setProg(p); });
          if (run.current !== me) return;
          const lines = String(text || '').split('\n').map((l) => l.replace(/^[\s•\-*·o\d.)]+(?=[A-Za-zÁÉÍÓÚáéíóúñÑ])/, '').trim()).filter((l) => l.length >= 3 && /[a-záéíóúñ]{3}/i.test(l));
          r = { mode: 'lista', title: '', items: lines.flatMap((l) => parseShopLine(l).map((p) => ({ name: p.name, qty: p.qty, unit: p.unit, note: p.note || '' }))), doubts: ['Lo leí con el lector de texto del teléfono: revisa los nombres.'] };
          note = note ? `${note} Usé el lector de texto del teléfono.` : '';
        } catch { /* sin lector */ }
      }
      if (!r) continue;
      if (r.mode === 'lista') { adds.push(...r.items); if (r.title) title = r.title; if (r.doubts && r.doubts.length) note = note || r.doubts[0]; } else { seen.push(...r.seen); ideas.push(...r.ideas); if (r.doubts && r.doubts.length) note = note || r.doubts[0]; }
    }
    if (run.current !== me) return;
    if (mode === 'lista') {
      const items = [];
      const names = new Set();
      for (const a of adds) { const k = a.name.toLowerCase(); if (!names.has(k)) { names.add(k); items.push(a); } }
      if (!items.length) {
        setPhase('pick');
        setMsg(note || (provider || canOCR ? (code ? 'Leí el código pero no lo conozco. Escribe el nombre del producto.' : 'No encontré productos en la foto. Prueba con más luz o más cerca.') : 'Para leer fotos necesitas activar la IA en Ajustes.'));
        return;
      }
      setRes({ mode, items, title });
      setPickAdd(new Set(items.map((_, i) => i)));
      setMsg(note);
      setPhase('review');
      return;
    }
    if (!seen.length) {
      setPhase('pick');
      setMsg(note || (provider ? 'No pude identificar productos en la foto. Prueba con más luz o más cerca.' : 'Reconocer lo que hay en la nevera necesita la IA. Actívala en Ajustes, o usa «Revisión rápida» en la despensa.'));
      return;
    }
    const a = analyzePantry(s, seen, today, ideas);
    setRes({ mode, ...a });
    setPickSeen(new Set(a.seen.map((x) => x.key)));
    setPickAdd(new Set(a.missing.filter((m) => m.src === 'poco' || m.src === 'habito').map((m) => m.key)));
    setMsg(note);
    setPhase('review');
  };

  const toggleIn = (set, setter, k) => { const n = new Set(set); if (n.has(k)) n.delete(k); else n.add(k); setter(n); };

  const save = () => {
    if (res.mode === 'lista') {
      const chosen = res.items.filter((_, i) => pickAdd.has(i));
      const r = act((st, d) => addShopItems(st, chosen, { list: list.id, by: 'foto', today: d }));
      toast(`${plural(r.added.length + r.merged.length, 'producto', 'productos')} a ${list.name}`, 'cart');
    } else {
      const r = act((st, d, ev) => applyScan(st, { seen: res.seen.filter((x) => pickSeen.has(x.key)), add: res.missing.filter((m) => pickAdd.has(m.key)) }, { list: list.id, today: d, ev }));
      toast(`${r.seen ? `${plural(r.seen, 'producto', 'productos')} en tu despensa` : 'Listo'}${r.added ? ` · ${r.added} a la lista` : ''}`, 'cart');
    }
    onClose();
  };

  const hasReader = !!provider || (mode === 'lista' && canOCR);
  return (
    <Sheet onClose={onClose} label="Foto de compras">
      <SheetHead title={phase === 'review' ? 'Revisa lo que vi' : 'Foto'} onClose={onClose} />
      {phase === 'pick' && (
        <>
          <div class="stack-xs" role="group" aria-label="Qué vas a fotografiar">
            {MODES.map(([k, t, d]) => (
              <button key={k} type="button" class="lrow" style={{ minHeight: 56, opacity: mode === k ? 1 : 0.6 }} aria-pressed={mode === k ? 'true' : 'false'} onClick={() => setMode(k)}>
                <span class="tile sm" style={{ background: mode === k ? areaSoft(AREA) : 'var(--soft)', color: mode === k ? areaColor(AREA) : 'var(--muted)' }}><Icon name={k === 'despensa' ? 'box' : 'list'} size={18} /></span>
                <span class="stack-xs grow"><span class="semi">{t}</span><span class="tiny muted">{d}</span></span>
                {mode === k && <Icon name="check" size={18} />}
              </button>
            ))}
          </div>
          <input ref={inp} type="file" accept="image/*" capture="environment" multiple hidden onChange={onFiles} />
          <input id="gal" type="file" accept="image/*" multiple hidden onChange={onFiles} />
          {files.length > 0 && (
            <div class="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {thumbs.map((u, i) => (
                <div key={u} style={{ position: 'relative' }}>
                  <img src={u} alt={`Foto ${i + 1}`} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 14 }} />
                  <button type="button" class="icon-btn" aria-label={`Quitar foto ${i + 1}`} style={{ position: 'absolute', top: -10, right: -10, background: 'var(--surface)', borderRadius: 18, width: 32, height: 32 }} onClick={() => setFiles(files.filter((_, j) => j !== i))}><Icon name="close" size={14} /></button>
                </div>
              ))}
            </div>
          )}
          <div class="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" class="btn soft grow" onClick={() => inp.current && inp.current.click()}><Icon name="camera" size={20} />{files.length ? 'Otra foto' : 'Tomar foto'}</button>
            <button type="button" class="btn soft grow" onClick={() => { const g = document.getElementById('gal'); if (g) g.click(); }}><Icon name="image" size={20} />Galería</button>
          </div>
          <p class="small muted">{mode === 'despensa' ? 'Abre la nevera o la alacena y toma fotos por partes (hasta 6). Lo que se ve borroso o tapado, no lo invento.' : 'Sirve para tu lista a mano, una receta, un folleto o un producto (si tiene código de barras, lo busco).'}</p>
          {provider === null && !hasReader && <p class="small" style={{ color: 'var(--vit-ink)' }}>La IA no está activada. {mode === 'lista' ? 'Puedo leer texto impreso con el lector del teléfono, pero no manuscrito.' : 'Actívala en Ajustes para reconocer productos.'}</p>}
          {msg && <p class="small" role="status" style={{ color: 'var(--vit-ink)' }}>{msg}</p>}
          <button type="button" class="btn block" disabled={!files.length || provider === undefined} onClick={analyze}><Icon name="sparkle" size={20} />{mode === 'despensa' ? 'Ver qué hay y qué falta' : 'Pasar a la lista'}</button>
          {mode === 'despensa' && <button type="button" class="btn ghost block" onClick={() => { onClose(); go('/compras?ver=despensa'); }}>Prefiero revisar a mano</button>}
        </>
      )}
      {phase === 'reading' && (
        <div class="stack-sm" role="status" aria-live="polite">
          <p class="lead">{prog && prog.status ? 'Leyendo el texto de la foto…' : 'Mirando la foto…'}</p>
          <Bar value={prog && prog.progress ? prog.progress : 0.15} color={areaColor(AREA)} label="Progreso" />
          <button type="button" class="btn ghost block" onClick={() => { run.current += 1; if (ctl.current) ctl.current.abort(); stopOCR(); setPhase('pick'); }}>Cancelar</button>
        </div>
      )}
      {phase === 'review' && res && res.mode === 'lista' && (
        <>
          {res.title && <p class="small muted">{res.title}</p>}
          <div>
            {res.items.map((it, i) => (
              <label key={i} class="mrow" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={pickAdd.has(i)} onChange={() => toggleIn(pickAdd, setPickAdd, i)} aria-label={it.name} />
                <span class="body"><span class="title">{it.name}</span>{(qtyText(it.qty, it.unit) || it.note) && <span class="meta">{qtyText(it.qty, it.unit)} {it.note}</span>}</span>
              </label>
            ))}
          </div>
          {msg && <p class="small muted">{msg}</p>}
          <button type="button" class="btn block" disabled={!pickAdd.size} onClick={save}><Icon name="check" size={20} />Agregar {pickAdd.size} a {list.name}</button>
        </>
      )}
      {phase === 'review' && res && res.mode === 'despensa' && (
        <>
          <section class="stack-xs" aria-label="Lo que veo">
            <h3 class="eyebrow">Lo que veo · {res.seen.length}</h3>
            <div>
              {res.seen.map((x) => (
                <label key={x.key} class="mrow" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={pickSeen.has(x.key)} onChange={() => toggleIn(pickSeen, setPickSeen, x.key)} aria-label={x.name} />
                  <span class="body"><span class="title">{x.name}</span><span class="meta">{qtyText(x.qty, x.unit)}{x.level === 'low' ? ' · queda poco' : ''}{x.best ? ` · vence ${fmtShort(x.best)}` : ''}</span></span>
                </label>
              ))}
            </div>
          </section>
          <section class="stack-xs" aria-label="Lo que podría faltar">
            <h3 class="eyebrow">Podría faltar · {res.missing.length}</h3>
            {!res.missing.length && <p class="small muted">No veo nada que falte según lo que sueles comprar.</p>}
            <div>
              {res.missing.map((m) => (
                <label key={m.key} class="mrow" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={pickAdd.has(m.key)} onChange={() => toggleIn(pickAdd, setPickAdd, m.key)} aria-label={`Agregar ${m.name}`} />
                  <span class="body"><span class="title">{m.name}</span><span class="meta">{m.why}</span></span>
                </label>
              ))}
            </div>
          </section>
          {msg && <p class="small muted">{msg}</p>}
          <button type="button" class="btn block" onClick={save}><Icon name="check" size={20} />Guardar{pickAdd.size ? ` y agregar ${pickAdd.size} a la lista` : ''}</button>
        </>
      )}
    </Sheet>
  );
}

// ---------- Terminé la compra ----------

function TripSheet({ list, onClose }) {
  const s = useApp();
  const today = s.energy.day;
  const sh = shopOf(s);
  const done = sh.items.filter((i) => i.list === list.id && i.done);
  const est = listTotals(s, list.id).estDone;
  const accounts = (s.money && s.money.accounts ? s.money.accounts : []).filter((a) => !a.archived);
  const [total, setTotal] = useState(est || 0);
  const [store, setStore] = useState(list.store || '');
  const [account, setAccount] = useState(accounts.length ? accounts[0].id : '');
  const [saveTx, setSaveTx] = useState(true);
  const [rec, setRec] = useState({ busy: false, msg: '', pairs: [] });
  const file = useRef(null);
  const [provider, setProvider] = useState(null);
  useEffect(() => { aiProvider(s.settings, { needImages: true }).then(setProvider).catch(() => setProvider(null)); }, []);

  const readReceipt = async (e) => {
    const f = e.currentTarget.files && e.currentTarget.files[0];
    e.currentTarget.value = '';
    if (!f || !provider) return;
    setRec({ busy: true, msg: '', pairs: [] });
    try {
      const prepared = await prepareImage(f);
      const raw = await aiJSON(provider, receiptPrompt(), { image: prepared.blob, task: 'recibo' });
      const r = checkReceipt(raw);
      if (r.total) setTotal(r.total);
      if (r.merchant && !store) setStore(r.merchant);
      const pairs = matchReceipt(s, r.items, list.id);
      setRec({ busy: false, msg: `Leí ${money(r.total || 0)}${pairs.length ? ` y ${plural(pairs.length, 'precio', 'precios')}` : ''}.`, pairs });
    } catch (err) {
      setRec({ busy: false, msg: aiErrorText(err) || 'No pude leer el recibo.', pairs: [] });
    }
  };

  const finish = () => {
    const r = act((st, d, ev) => {
      if (rec.pairs.length) applyPrices(st, rec.pairs);
      return closeTrip(st, { list: list.id, total, store, account, saveTx: saveTx && total > 0 }, d, ev);
    });
    toast(r.tx ? `Compra guardada: ${money(r.total)}${r.xp ? ` · +${r.xp} XP` : ''}` : `${plural(r.n, 'producto', 'productos')} a tu despensa`, 'cart');
    onClose();
    void today;
  };
  const diff = total && est ? total - est : 0;
  return (
    <Sheet onClose={onClose} label="Terminé la compra">
      <SheetHead title="Terminé la compra" onClose={onClose} />
      <p class="lead">{plural(done.length, 'producto', 'productos')} en el carrito{est ? ` · calculé ${money(est)}` : ''}.</p>
      <div class="field"><label>¿Cuánto pagaste?</label>
        <NumberField value={total} onChange={setTotal} step={50} min={0} prefix="RD$" label="Total pagado" />
        {diff !== 0 && <span class="tiny muted">{diff > 0 ? `${money(diff)} más de lo calculado` : `${money(-diff)} menos de lo calculado`}</span>}
      </div>
      <div class="field"><label for="st">Tienda</label><input id="st" class="input" value={store} maxLength={40} placeholder="Ej. Jumbo, Nacional" onInput={(e) => setStore(e.currentTarget.value)} /></div>
      {accounts.length > 0 && (
        <div class="field"><label>Pagaste con</label>
          <div class="chips scroll" role="group" aria-label="Cuenta">{accounts.map((a) => <TChip key={a.id} sm on={account === a.id} onClick={() => setAccount(a.id)}>{a.name}</TChip>)}</div></div>
      )}
      <div class="between-c"><span class="semi">Guardar como gasto de supermercado</span><Switch checked={saveTx} onChange={setSaveTx} label="Guardar como gasto" /></div>
      {provider && (
        <>
          <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={readReceipt} />
          <button type="button" class="btn soft block" disabled={rec.busy} onClick={() => file.current && file.current.click()}><Icon name="receipt" size={20} />{rec.busy ? 'Leyendo el recibo…' : 'Foto del recibo: total y precios'}</button>
          {rec.msg && <p class="small muted" role="status">{rec.msg}</p>}
        </>
      )}
      <button type="button" class="btn block" onClick={finish}><Icon name="check" size={20} />Guardar compra</button>
      <p class="small muted">Lo comprado pasa a tu despensa y aprendo cada cuánto lo compras. Ir con lista da XP de Fortuna (una vez al día).</p>
    </Sheet>
  );
}

// ---------- Pestaña Despensa ----------

function PantryTab({ s, today, list, setSheet }) {
  const sh = shopOf(s);
  const [q, setQ] = useState('');
  const p = sh.pantry;
  const exp = expiring(s, today, 3);
  const shown = p.filter((x) => !q.trim() || x.name.toLowerCase().includes(q.trim().toLowerCase()));
  const groups = groupByAisle(shown);
  const low = p.filter((x) => x.level !== 'ok').length;
  const [adding, setAdding] = useState('');
  const quickAdd = () => {
    const items = parseShopLine(adding);
    if (!items.length) return;
    act((st, d) => { for (const it of items) pantryUpsert(st, { name: it.name, qty: it.qty, unit: it.unit, level: 'ok', src: 'manual' }, d); });
    setAdding('');
    toast(`${plural(items.length, 'producto', 'productos')} en la despensa`, 'box');
  };
  const setLvl = (x, level) => {
    const r = act((st, d) => setLevel(st, x.id, level, d, { list: list.id }));
    if (r && r.added) toast(`${x.name} a la lista`, 'cart');
  };
  return (
    <>
      <section class="stack-sm" aria-label="Resumen">
        <span class="eyebrow" style={{ color: areaInk(AREA) }}>Despensa</span>
        <h1 class="h1">{p.length ? `${plural(p.length, 'producto', 'productos')} en casa` : 'Tu despensa está vacía'}</h1>
        <p class="lead">{p.length ? (low ? `${low} se están acabando.` : 'Todo en orden.') : 'Toma una foto de la nevera o agrégalos aquí. Lo que compres también entra solo.'}</p>
      </section>
      <div class="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" class="btn soft grow" onClick={() => setSheet({ t: 'scan', mode: 'despensa' })}><Icon name="camera" size={20} />Foto de la nevera</button>
        {p.length > 0 && <button type="button" class="btn soft grow" onClick={() => setSheet({ t: 'review' })}><Icon name="check" size={20} />Revisión rápida</button>}
      </div>
      <div class="row" style={{ gap: 8 }}>
        <input class="input grow" value={adding} placeholder="Agregar a la despensa: arroz, aceite…" aria-label="Agregar a la despensa" onInput={(e) => setAdding(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') quickAdd(); }} />
        <button type="button" class="btn" style={{ minWidth: 52 }} aria-label="Agregar" disabled={!adding.trim()} onClick={quickAdd}><Icon name="plus" size={20} /></button>
      </div>
      {exp.length > 0 && (
        <section class="card" aria-label="Se vence pronto">
          <h2 class="h2">Se vence pronto</h2>
          {exp.map((x) => (
            <button key={x.id} type="button" class="lrow" onClick={() => setSheet({ t: 'pantry', id: x.id })}>
              <span class="grow semi">{x.name}</span><span class="tiny" style={{ color: 'var(--vit-ink)' }}>{diffDays(today, x.best) <= 0 ? 'Vencido' : diffDays(today, x.best) === 1 ? 'Mañana' : fmtShort(x.best)}</span>
            </button>
          ))}
        </section>
      )}
      {p.length > 8 && <input class="input" type="search" value={q} placeholder="Buscar en la despensa" aria-label="Buscar en la despensa" onInput={(e) => setQ(e.currentTarget.value)} />}
      {groups.map(({ a, xs }) => (
        <section key={a.id} class="stack-xs" aria-label={a.name}>
          <h2 class="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name={a.icon} size={14} />{a.name}</h2>
          <div>
            {xs.map((x) => (
              <div key={x.id} class="mrow">
                <button type="button" class="body" onClick={() => setSheet({ t: 'pantry', id: x.id })}>
                  <span class="title">{x.name}{x.basic && <span class="tiny muted"> · básico</span>}</span>
                  <span class="meta">{qtyText(x.qty, x.unit)}{x.best ? `${qtyText(x.qty, x.unit) ? ' · ' : ''}vence ${fmtShort(x.best)}` : ''}</span>
                </button>
                <div class="chips" role="group" aria-label={`Cuánto queda de ${x.name}`}>
                  {LEVELS.map(([k, label]) => <TChip key={k} sm on={x.level === k} onClick={() => setLvl(x, k)}>{k === 'ok' ? 'Hay' : k === 'low' ? 'Poco' : 'Nada'}</TChip>)}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

// Recorre la despensa de uno en uno: «hay», «poco» o «se acabó».
function ReviewSheet({ list, onClose }) {
  const s = useApp();
  const sh = shopOf(s);
  const queue = useMemo(() => [...shopOf(s).pantry].sort((a, b) => (a.seen || '') < (b.seen || '') ? -1 : 1).map((x) => x.id), []);
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);
  const id = queue[i];
  const x = sh.pantry.find((p) => p.id === id);
  if (!x || i >= queue.length) {
    return (
      <Sheet onClose={onClose} label="Revisión rápida">
        <SheetHead title="Revisión rápida" onClose={onClose} />
        <p class="lead">Listo. {n ? `${plural(n, 'producto', 'productos')} a tu lista.` : 'No falta nada.'}</p>
        <button type="button" class="btn block" onClick={onClose}><Icon name="check" size={20} />Cerrar</button>
      </Sheet>
    );
  }
  const pick = (level) => {
    const r = act((st, d) => setLevel(st, x.id, level, d, { list: list.id }));
    if (r && r.added) setN(n + 1);
    setI(i + 1);
  };
  return (
    <Sheet onClose={onClose} label="Revisión rápida">
      <SheetHead title={`Revisión rápida · ${i + 1}/${queue.length}`} onClose={onClose} />
      <Bar value={i / queue.length} color={areaColor(AREA)} label="Avance" />
      <h2 class="h1" style={{ textAlign: 'center', padding: '16px 0' }}>{x.name}</h2>
      <p class="small muted" style={{ textAlign: 'center' }}>¿Cuánto queda?</p>
      <div class="stack-xs">
        <button type="button" class="btn block" onClick={() => pick('ok')}>Hay</button>
        <button type="button" class="btn soft block" onClick={() => pick('low')}>Queda poco</button>
        <button type="button" class="btn soft block" onClick={() => pick('out')}>Se acabó</button>
        <button type="button" class="btn ghost block" onClick={() => setI(i + 1)}>Saltar</button>
      </div>
    </Sheet>
  );
}

function PantrySheet({ id, list, onClose }) {
  const s = useApp();
  const x = shopOf(s).pantry.find((p) => p.id === id);
  const [best, setBest] = useState(x && x.best ? x.best : '');
  const [qty, setQty] = useState(x && x.qty ? x.qty : 0);
  if (!x) return null;
  return (
    <Sheet onClose={onClose} label={x.name}>
      <SheetHead title={x.name} onClose={onClose} />
      <div class="chips" role="group" aria-label="Cuánto queda">
        {LEVELS.map(([k, label]) => <TChip key={k} on={x.level === k} onClick={() => { const r = act((st, d) => setLevel(st, x.id, k, d, { list: list.id })); if (r && r.added) toast(`${x.name} a la lista`, 'cart'); }}>{label}</TChip>)}
      </div>
      <div class="field"><label>Cantidad aproximada</label><NumberField value={qty} onChange={setQty} step={1} min={0} max={999} label="Cantidad" /></div>
      <div class="field"><label for="bd">Vence (opcional)</label><input id="bd" class="input" type="date" value={best} onInput={(e) => setBest(e.currentTarget.value)} /></div>
      <div class="between-c"><span class="semi">Es un básico (siempre debe haber)</span><Switch checked={x.basic} onChange={() => act((st) => toggleBasic(st, x.id))} label="Es un básico" /></div>
      <button type="button" class="btn block" onClick={() => { act((st, d) => pantryUpsert(st, { name: x.name, key: x.key, qty: qty || null, best: best || null }, d)); act((st) => { const e = shopOf(st).pantry.find((p) => p.id === x.id); if (e && !best) e.best = null; }); onClose(); }}><Icon name="check" size={20} />Guardar</button>
      <button type="button" class="btn soft block" onClick={() => { act((st, d) => addShopItems(st, [{ name: x.name, key: x.key, aisle: x.aisle, unit: x.unit }], { list: list.id, by: 'despensa', today: d })); toast(`${x.name} a la lista`, 'cart'); onClose(); }}><Icon name="cart" size={18} />Agregar a la lista</button>
      <button type="button" class="btn ghost block" style={{ color: 'var(--vit-ink)' }} onClick={() => { act((st) => removePantry(st, x.id)); onClose(); }}><Icon name="trash" size={18} />Quitar de la despensa</button>
    </Sheet>
  );
}

// ---------- Pestaña Deseos ----------

function WishTab({ s, today, setSheet }) {
  const sh = shopOf(s);
  const wait = sh.wishes.filter((w) => w.state === 'wait');
  const past = sh.wishes.filter((w) => w.state !== 'wait');
  const dropped = past.filter((w) => w.state === 'dropped').length;
  return (
    <>
      <section class="stack-sm" aria-label="Resumen">
        <span class="eyebrow" style={{ color: areaInk(AREA) }}>Deseos</span>
        <h1 class="h1">{wait.length ? `${plural(wait.length, 'cosa esperando', 'cosas esperando')}` : 'Nada en espera'}</h1>
        <p class="lead">Lo que quieres comprar y no es urgente espera {sh.cfg.wishDays} días. Si después sigues queriéndolo, lo compras tranquilo; si no, te ahorraste el gasto.</p>
      </section>
      {sh.saved > 0 && (
        <div class="kpis">
          <div class="kpi"><span class="v">{money(sh.saved)}</span><span class="l">Ahorrado al soltar</span></div>
          <div class="kpi"><span class="v">{dropped}</span><span class="l">Soltados</span></div>
          <div class="kpi"><span class="v">{wait.length}</span><span class="l">Esperando</span></div>
        </div>
      )}
      {!sh.wishes.length && <Empty icon="clock" action={<button type="button" class="btn sm soft" onClick={() => setSheet({ t: 'wish' })}><Icon name="plus" size={18} />Agregar un deseo</button>}>Anota lo que se te antoje comprar y deja que pasen unos días antes de decidir.</Empty>}
      <div>
        {wait.map((w) => <WishRow key={w.id} s={s} w={w} today={today} onOpen={() => setSheet({ t: 'wish', id: w.id })} />)}
      </div>
      {past.length > 0 && (
        <section class="stack-xs" aria-label="Ya decididos">
          <h2 class="eyebrow">Ya decididos</h2>
          <div>{past.map((w) => <WishRow key={w.id} s={s} w={w} today={today} onOpen={() => setSheet({ t: 'wish', id: w.id })} />)}</div>
        </section>
      )}
    </>
  );
}

function WishRow({ s, w, today, onOpen }) {
  const info = wishInfo(s, w, today);
  const state = w.state === 'dropped' ? 'Lo soltaste' : w.state === 'bought' ? 'Comprado' : info.ready ? 'Ya puedes decidir' : `Espera ${plural(info.left, 'día', 'días')}`;
  return (
    <div class="mrow">
      <button type="button" class="body" onClick={onOpen}>
        <span class="title">{w.name}</span>
        <span class="meta">
          <span class={info.ready ? 'soon' : ''}>{state}</span>
          {w.price > 0 && <span>· {money(info.dop)}</span>}
          {info.hoursText && <span>· {info.hoursText} de trabajo</span>}
        </span>
      </button>
      <Icon name="right" size={16} />
    </div>
  );
}

function WishSheet({ id, onClose }) {
  const s = useApp();
  const today = s.energy.day;
  const w = id ? shopOf(s).wishes.find((x) => x.id === id) : null;
  const [name, setName] = useState(w ? w.name : '');
  const [price, setPrice] = useState(w ? w.price : 0);
  const [cur, setCur] = useState(w ? w.cur : 'DOP');
  const [days, setDays] = useState(shopOf(s).cfg.wishDays);
  const [note, setNote] = useState(w ? w.note : '');
  const info = w ? wishInfo(s, w, today) : null;
  const save = () => {
    if (w) act((st) => updateWish(st, w.id, { name, price, cur, note }));
    else act((st, d) => addWish(st, { name, price, cur, days, note }, d));
    toast(w ? 'Deseo actualizado' : `Te aviso en ${days} días`, 'clock');
    onClose();
  };
  return (
    <Sheet onClose={onClose} label="Deseo">
      <SheetHead title={w ? 'Deseo' : 'Nuevo deseo'} onClose={onClose} />
      <div class="field"><label for="wn">¿Qué quieres comprar?</label><input id="wn" class="input big" value={name} maxLength={80} placeholder="Ej. Audífonos nuevos" ref={focusOnMount} onInput={(e) => setName(e.currentTarget.value)} /></div>
      <div class="field"><label>Precio aproximado</label>
        <NumberField value={price} onChange={setPrice} step={100} min={0} prefix={cur === 'USD' ? 'US$' : 'RD$'} label="Precio" />
        <div class="chips" role="group" aria-label="Moneda"><TChip sm on={cur === 'DOP'} onClick={() => setCur('DOP')}>RD$</TChip><TChip sm on={cur === 'USD'} onClick={() => setCur('USD')}>US$</TChip></div>
        {info && info.hoursText && <span class="tiny muted">Eso son {info.hoursText} de tu trabajo.</span>}
      </div>
      {!w && <div class="field"><label>Esperar</label><div class="chips" role="group" aria-label="Días de espera">{WISH_DAYS.map((d) => <TChip key={d} sm on={days === d} onClick={() => setDays(d)}>{d} días</TChip>)}</div></div>}
      <div class="field"><label for="wo">Nota o enlace (opcional)</label><input id="wo" class="input" value={note} maxLength={160} onInput={(e) => setNote(e.currentTarget.value)} /></div>
      <button type="button" class="btn block" disabled={name.trim().length < 2} onClick={save}><Icon name="check" size={20} />{w ? 'Guardar' : 'Agregar a la espera'}</button>
      {w && w.state === 'wait' && (
        <div class="row" style={{ gap: 8 }}>
          <button type="button" class="btn soft grow" onClick={() => { const r = act((st, d, ev) => dropWish(st, w.id, d, ev)); if (r) toast(r.dop ? `Te ahorraste ${money(r.dop)}` : 'Lo soltaste', 'coins'); onClose(); }}>Ya no lo quiero</button>
          <button type="button" class="btn soft grow" onClick={() => { act((st, d) => buyWish(st, w.id, d)); toast('Anótalo en Finanzas cuando lo pagues', 'info'); onClose(); }}>Lo compré</button>
        </div>
      )}
      {w && w.state !== 'wait' && <button type="button" class="btn soft block" onClick={() => { act((st, d) => reopenWish(st, w.id, d)); onClose(); }}>Volver a la espera</button>}
      {w && <button type="button" class="btn ghost block" style={{ color: 'var(--vit-ink)' }} onClick={() => { act((st) => removeWish(st, w.id)); onClose(); }}><Icon name="trash" size={18} />Borrar</button>}
    </Sheet>
  );
}

// ---------- Ajustes de compras ----------

function CfgSheet({ onClose }) {
  const s = useApp();
  const cfg = shopOf(s).cfg;
  const set = (p) => act((st) => { Object.assign(shopOf(st).cfg, p); });
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return (
    <Sheet onClose={onClose} label="Ajustes de compras">
      <SheetHead title="Ajustes de compras" onClose={onClose} />
      <div class="field"><label>Día de compras (te aviso ese día)</label>
        <div class="chips" role="group" aria-label="Día de compras">
          <TChip sm on={cfg.day == null} onClick={() => set({ day: null })}>Ninguno</TChip>
          {days.map((d, i) => <TChip key={d} sm on={cfg.day === i} onClick={() => set({ day: i })}>{d.slice(0, 3)}</TChip>)}
        </div></div>
      <div class="between-c"><span class="stack-xs"><span class="semi">Agregar a la lista lo que se acaba</span><span class="tiny muted">Al marcar «Poco» o «Se acabó» en la despensa</span></span><Switch checked={cfg.autoAdd} onChange={(v) => set({ autoAdd: v })} label="Agregar lo que se acaba" /></div>
      <div class="between-c"><span class="stack-xs"><span class="semi">Lo comprado entra a la despensa</span><span class="tiny muted">Al terminar una compra</span></span><Switch checked={cfg.autoPantry} onChange={(v) => set({ autoPantry: v })} label="Lo comprado entra a la despensa" /></div>
      <div class="between-c"><span class="stack-xs"><span class="semi">Sugerir los básicos de la casa</span><span class="tiny muted">Arroz, aceite, azúcar, sal…</span></span><Switch checked={cfg.staples} onChange={(v) => set({ staples: v })} label="Sugerir básicos" /></div>
      <div class="field"><label>Presupuesto mensual del súper (0 = el de Finanzas)</label><NumberField value={cfg.budget} onChange={(v) => set({ budget: v })} step={500} min={0} prefix="RD$" label="Presupuesto" /></div>
      <div class="field"><label>Días de espera para los deseos</label>
        <div class="chips" role="group" aria-label="Días de espera">{WISH_DAYS.map((d) => <TChip key={d} sm on={cfg.wishDays === d} onClick={() => set({ wishDays: d })}>{d}</TChip>)}</div></div>
      <button type="button" class="btn block" onClick={onClose}><Icon name="check" size={20} />Listo</button>
    </Sheet>
  );
}

// ---------- Tarjeta en Áreas ----------

export function ShopCard() {
  const s = useApp();
  const today = s.energy.day;
  const sum = shopSummary(s, today);
  const sub = sum.empty && !sum.trips
    ? 'Listas, despensa con foto y deseos'
    : sum.pending
      ? `${plural(sum.pending, 'producto', 'productos')} por comprar${sum.est ? ` · ${money(sum.est)}` : ''}`
      : sum.low ? `${plural(sum.low, 'producto', 'productos')} por acabarse` : 'Lista al día';
  return (
    <a href="#/compras" class="card" style={{ textDecoration: 'none', color: 'var(--ink)' }} aria-label={`Compras: ${sub}`}>
      <div class="row">
        <span class="tile" style={{ background: areaSoft(AREA), color: areaColor(AREA) }}><Icon name="cart" /></span>
        <span class="stack-xs grow"><span class="strong">Compras</span><span class="small muted">{sub}</span></span>
        <Icon name="right" size={18} />
      </div>
      {(sum.expiring > 0 || sum.wishReady > 0) && (
        <span class="tiny strong" style={{ color: 'var(--vit-ink)' }}>
          {sum.expiring > 0 ? `${plural(sum.expiring, 'se vence pronto', 'se vencen pronto')}` : ''}{sum.expiring > 0 && sum.wishReady > 0 ? ' · ' : ''}{sum.wishReady > 0 ? `${plural(sum.wishReady, 'deseo listo para decidir', 'deseos listos para decidir')}` : ''}
        </span>
      )}
    </a>
  );
}
