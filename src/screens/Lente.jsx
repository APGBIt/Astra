// La Lente (2.0): realidad aumentada. La cámara busca etiquetas de Astra y códigos de barras, y encima de
// cada uno aparece lo que Astra sabe: si la rutina toca hoy, la toma pendiente, el último precio del producto,
// si está en tu lista. Un toque en la tarjeta hace la acción. El video no se guarda ni sale del teléfono.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Sheet, SheetHead, toast, focusOnMount } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { go } from '../app/router.js';
import { openCamera, cameraSupported, cameraErrorText } from '../app/camera.js';
import { detectCodes, canScanProducts } from '../app/scanner.js';
import { lookupBarcode } from '../ai/ai.js';
import { lensCard, rememberCode, lensToList, follow, toScreen } from '../game/lens.js';
import { tagOf } from '../game/tags.js';
import { fireTag } from './Mundo.jsx';

const KEEP_MS = 900; // una tarjeta se queda un momento aunque el código se pierda de vista
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const toneVar = (tone) => (tone === 'good' ? 'var(--good)' : tone === 'xp' ? 'var(--xp)' : tone === 'vit' ? 'var(--vit)' : tone === 'muted' ? '#9a9ca3' : '#ffffff');

export function Lente() {
  const s = useApp();
  const today = s.energy.day;
  const video = useRef(null);
  const wrap = useRef(null);
  const canvas = useRef(null);
  const cam = useRef(null);
  const seen = useRef(new Map()); // código → { raw, kind, box, pts, at }
  const asked = useRef(new Map()); // código de barras → 'buscando' | 'no'
  const [, tick] = useState(0);
  const [state, setState] = useState('abriendo'); // abriendo | on | error
  const [msg, setMsg] = useState('');
  const [torch, setTorch] = useState(false);
  const [products, setProducts] = useState(true);
  const [sheet, setSheet] = useState(null);
  const [manual, setManual] = useState('');

  useEffect(() => {
    let alive = true;
    let timer = null;
    canScanProducts().then((v) => { if (alive) setProducts(v); });
    const loop = async () => {
      if (!alive) return;
      const v = video.current;
      try {
        if (v && v.readyState >= 2 && !document.hidden) {
          const found = await detectCodes(v, canvas.current);
          const now = performance.now();
          const view = wrap.current ? { w: wrap.current.clientWidth, h: wrap.current.clientHeight } : null;
          for (const c of found) {
            if (!view) break;
            const vid = { w: v.videoWidth, h: v.videoHeight };
            const box = toScreen(c.box, vid, view);
            const prev = seen.current.get(c.raw);
            seen.current.set(c.raw, { raw: c.raw, kind: c.kind, at: now, box: follow(prev && prev.box, box), pts: c.pts.map((p) => toScreen({ x: p.x, y: p.y, w: 0, h: 0 }, vid, view)) });
          }
          for (const [k, e] of seen.current) if (now - e.at > KEEP_MS) seen.current.delete(k);
          tick((n) => (n + 1) % 1e6);
        }
      } catch { /* un cuadro que falla no detiene la lente */ }
      timer = setTimeout(loop, 110);
    };
    (async () => {
      if (!cameraSupported()) { setState('error'); setMsg('Este navegador no deja usar la cámara desde aquí.'); return; }
      try {
        cam.current = await openCamera(video.current);
        if (!alive) { cam.current.stop(); return; }
        setState('on');
        loop();
      } catch (err) { if (alive) { setState('error'); setMsg(cameraErrorText(err)); } }
    })();
    return () => { alive = false; if (timer) clearTimeout(timer); if (cam.current) { cam.current.torch(false); cam.current.stop(); cam.current = null; } };
  }, []);

  // Producto con código que todavía no tiene nombre: se busca una vez (solo se envía el número).
  const lookup = (code) => {
    if (asked.current.has(code)) return;
    asked.current.set(code, 'buscando');
    lookupBarcode(code).then((name) => {
      if (name) { act((st) => rememberCode(st, code, name)); asked.current.delete(code); } else asked.current.set(code, 'no');
      tick((n) => n + 1);
    });
  };

  const cards = [];
  for (const e of seen.current.values()) {
    let c = lensCard(s, e.raw, e.kind, today, nowMin());
    if (!c) continue;
    if (c.type === 'buscar') {
      lookup(c.code);
      if (asked.current.get(c.code) === 'no') c = { ...c, type: 'nombrar', lines: ['No lo conozco todavía'], verb: 'Ponerle nombre', tone: 'ink' };
    }
    cards.push({ e, c });
  }

  const tap = (c) => {
    if (c.type === 'etiqueta') { const t = tagOf(s, c.id); const r = fireTag(c.id, { follow: !!(t && t.action.type === 'open') }); if (r && r.ok && navigator.vibrate) navigator.vibrate(30); return; }
    if (c.type === 'nueva') { go(`/mando?ver=mundo&nueva=${c.id}`); return; }
    if (c.type === 'codigo') { go(`/mando?ver=mundo&codigo=${encodeURIComponent(c.code)}`); return; }
    if (c.type === 'nombrar') { setSheet({ code: c.code }); return; }
    if (c.type === 'producto' && !c.inList) { act((st, d) => lensToList(st, c.name, d)); toast(`${c.name} a tu lista`, 'cart'); if (navigator.vibrate) navigator.vibrate(30); }
  };

  const flip = async () => { if (cam.current) { const on = !torch; if (await cam.current.torch(on)) setTorch(on); } };
  const runManual = () => {
    const id = manual.trim().toLowerCase();
    if (!/^[a-z0-9]{4,12}$/.test(id)) return;
    if (tagOf(s, id)) fireTag(id); else go(`/t/${id}`);
    setManual('');
  };
  const view = wrap.current ? { w: wrap.current.clientWidth, h: wrap.current.clientHeight } : { w: 390, h: 800 };

  return (
    <main class="lens" ref={wrap}>
      <video ref={video} class="lens-video" playsInline muted aria-label="Vista de la cámara" />
      <canvas ref={canvas} hidden />
      <svg class="lens-marks" aria-hidden="true" width={view.w} height={view.h}>
        {cards.map(({ e, c }) => (e.pts.length >= 3
          ? <polygon key={e.raw} points={e.pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={toneVar(c.tone)} stroke-width="3" stroke-linejoin="round" />
          : <rect key={e.raw} x={e.box.x} y={e.box.y} width={e.box.w} height={e.box.h} rx="8" fill="none" stroke={toneVar(c.tone)} stroke-width="3" />))}
      </svg>
      {cards.map(({ e, c }) => {
        const W = Math.min(260, view.w - 24);
        const left = Math.max(12, Math.min(view.w - W - 12, e.box.x + e.box.w / 2 - W / 2));
        const below = e.box.y + e.box.h + 10;
        const top = below + 120 > view.h - 110 ? Math.max(70, e.box.y - 130) : below;
        const Tag = c.verb ? 'button' : 'div';
        return (
          <Tag key={e.raw} type={c.verb ? 'button' : undefined} class="lens-card" style={{ width: `${W}px`, transform: `translate(${Math.round(left)}px, ${Math.round(top)}px)`, borderColor: toneVar(c.tone) }} onClick={c.verb ? () => tap(c) : undefined} aria-label={`${c.title}. ${c.lines.join('. ')}${c.verb ? `. ${c.verb}` : ''}`}>
            <span class="row" style={{ gap: 8 }}><Icon name={c.done ? 'check' : c.icon} size={18} /><b class="grow">{c.title}</b></span>
            {c.lines.map((l) => <span key={l} class="lens-line">{l}</span>)}
            {c.verb && <span class="lens-verb">{c.verb}<Icon name="right" size={15} /></span>}
          </Tag>
        );
      })}

      <header class="lens-top">
        <button type="button" class="lens-btn" aria-label="Cerrar la lente" onClick={() => (history.length > 1 ? history.back() : go('/mando?ver=mundo'))}><Icon name="close" /></button>
        <span class="lens-title">Lente</span>
        {cam.current && cam.current.hasTorch
          ? <button type="button" class="lens-btn" aria-pressed={torch ? 'true' : 'false'} aria-label="Linterna" onClick={flip}><Icon name="bolt" fill={torch} /></button>
          : <span style={{ width: 44 }} />}
      </header>

      <footer class="lens-foot" role="status" aria-live="polite">
        {state === 'abriendo' && <span>Abriendo la cámara…</span>}
        {state === 'on' && !cards.length && <span>Apunta a una etiqueta de Astra{products ? ' o al código de barras de un producto' : ''}</span>}
        {state === 'on' && !products && !cards.length && <span class="lens-sub">Este teléfono lee etiquetas QR; los códigos de barras, solo en Chrome para Android.</span>}
        {state === 'error' && (
          <div class="lens-error">
            <b>{msg}</b>
            <span>También puedes escribir la clave que trae la etiqueta (debajo del código):</span>
            <span class="row" style={{ gap: 8 }}>
              <input class="input grow" value={manual} maxLength={12} placeholder="Ej. abc234" aria-label="Clave de la etiqueta" autocapitalize="none" onInput={(e) => setManual(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') runManual(); }} />
              <button type="button" class="btn" onClick={runManual}>Abrir</button>
            </span>
          </div>
        )}
      </footer>
      {sheet && <NameSheet code={sheet.code} onClose={() => setSheet(null)} onSaved={() => { asked.current.delete(sheet.code); setSheet(null); }} />}
    </main>
  );
}

function NameSheet({ code, onClose, onSaved }) {
  const [name, setName] = useState('');
  const save = () => { if (act((st) => rememberCode(st, code, name))) { toast('La próxima vez lo reconozco', 'check'); onSaved(); } };
  return (
    <Sheet onClose={onClose} label="Nombre del producto">
      <SheetHead title="¿Qué producto es?" onClose={onClose} />
      <p class="small muted">Código {code}. Con el nombre, la Lente te muestra su precio y si está en tu lista o en tu despensa.</p>
      <div class="field"><label for="ln-n">Nombre</label><input id="ln-n" class="input big" value={name} maxLength={60} placeholder="Ej. Leche entera" ref={focusOnMount} onInput={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim().length >= 2) save(); }} /></div>
      <button type="button" class="btn block" disabled={name.trim().length < 2} onClick={save}><Icon name="check" size={20} />Guardar</button>
    </Sheet>
  );
}
