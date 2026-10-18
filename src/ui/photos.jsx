import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { Sheet, SheetHead, toast, ask } from './kit.jsx';
import { addPhoto, removePhoto, photoURL } from '../app/photos.js';
import { useApp } from '../app/store.js';

// Miniatura que carga sola (del teléfono o, si hace falta, de Drive).
export function PhotoThumb({ id, size = 64, onOpen, label = 'Foto' }) {
  const [url, setUrl] = useState(null);
  const [miss, setMiss] = useState(false);
  useEffect(() => {
    let alive = true;
    photoURL(id, true).then((u) => { if (alive) { setUrl(u); setMiss(!u); } }).catch(() => { if (alive) setMiss(true); });
    return () => { alive = false; };
  }, [id]);
  return (
    <button type="button" class="photo-thumb" style={{ width: size, height: size }} onClick={onOpen} aria-label={label}>
      {url ? <img src={url} alt="" /> : <Icon name={miss ? 'cloudoff' : 'image'} size={20} />}
    </button>
  );
}

// Fotos de un registro: agregar (cámara o galería), ver y quitar.
export function PhotoStrip({ ids = [], onChange, kind = 'otra', label = 'Fotos', hint = '', max = 6 }) {
  const s = useApp();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const list = ids.filter((id) => s.photos && s.photos[id] && !s.photos[id].deleted);
  const pick = async (e) => {
    const files = Array.from(e.currentTarget.files || []).slice(0, max - list.length);
    e.currentTarget.value = '';
    if (!files.length) return;
    setBusy(true);
    try {
      const added = [];
      for (const f of files) added.push(await addPhoto(f, { kind }));
      onChange([...list, ...added]);
    } catch {
      toast('No se pudo guardar la foto', 'image');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="stack-sm">
      <span class="label">{label}</span>
      <div class="photo-strip">
        {list.map((id, i) => <PhotoThumb key={id} id={id} onOpen={() => setOpen(id)} label={`Ver foto ${i + 1}`} />)}
        {list.length < max && (
          <button type="button" class="photo-thumb add" onClick={() => input.current && input.current.click()} disabled={busy} aria-label="Agregar foto">
            <Icon name={busy ? 'sync' : 'camera'} size={20} />
          </button>
        )}
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={pick} />
      </div>
      {hint && <span class="small muted">{hint}</span>}
      {open && <PhotoViewer id={open} onClose={() => setOpen(null)} onRemove={() => { removePhoto(open); onChange(list.filter((x) => x !== open)); setOpen(null); }} />}
    </div>
  );
}

export function PhotoViewer({ id, onClose, onRemove }) {
  const s = useApp();
  const [url, setUrl] = useState(null);
  const [miss, setMiss] = useState(false);
  const meta = (s.photos || {})[id] || {};
  useEffect(() => {
    let alive = true;
    photoURL(id, false).then((u) => { if (alive) { setUrl(u); setMiss(!u); } }).catch(() => { if (alive) setMiss(true); });
    return () => { alive = false; };
  }, [id]);
  return (
    <Sheet onClose={onClose} label="Foto">
      <SheetHead title="Foto" onClose={onClose} />
      <div class="photo-full">
        {url ? <img src={url} alt="Foto adjunta" /> : <span class="small muted">{miss ? 'Esta foto está en Drive. Se descarga cuando haya conexión.' : 'Cargando…'}</span>}
      </div>
      <span class="small muted">{meta.remote ? 'Guardada en este teléfono y en tu Drive.' : 'Guardada en este teléfono. Si sincronizas, se sube a tu Drive.'}</span>
      {onRemove && <button type="button" class="link-btn" style={{ color: 'var(--vit-ink)', alignSelf: 'center' }} onClick={async () => { if (await ask('¿Quitar esta foto? También se borra de tu Drive.', { ok: 'Quitar', danger: true })) onRemove(); }}><Icon name="trash" size={16} />Quitar foto</button>}
    </Sheet>
  );
}
