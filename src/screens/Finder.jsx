// Buscador universal (2.0): se abre desde Hoy, desde el centro de mando o con Ctrl + K. Escribes dos letras y
// aparece a dónde ir, lo que tienes anotado con ese nombre y, si parece algo para registrar, el atajo para anotarlo.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Sheet, useHour } from '../ui/kit.jsx';
import { useApp } from '../app/store.js';
import { go } from '../app/router.js';
import { searchAll, quickPlaces, norm } from '../game/search.js';

let setOpenRef = null;
export function openFinder() { if (setOpenRef) setOpenRef(true); }

export function Finder() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpenRef = setOpen;
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setOpen(true); } };
    document.addEventListener('keydown', onKey);
    return () => { setOpenRef = null; document.removeEventListener('keydown', onKey); };
  }, []);
  return open ? <FinderSheet onClose={() => setOpen(false)} /> : null;
}

function FinderSheet({ onClose }) {
  const s = useApp();
  const hour = useHour();
  const today = s.energy.day;
  const [q, setQ] = useState('');
  const groups = useMemo(() => searchAll(s, q, today), [s, q, today]);
  const quick = useMemo(() => quickPlaces(hour), [hour]);
  const open = (href) => { onClose(); setTimeout(() => go(href), 0); };
  const words = norm(q).split(' ').filter(Boolean);
  // Algo para anotar: varias palabras, o trae un número («almuerzo 350», «dormí 7 horas»).
  const capture = q.trim().length >= 4 && (words.length >= 3 || /\d/.test(q));
  const first = groups.length ? groups[0].items[0] : null;
  return (
    <Sheet onClose={onClose} label="Buscar en Astra">
      <div class="row" style={{ gap: 8 }}>
        <div class="finder-box grow">
          <Icon name="search" size={20} />
          <input class="finder-input" type="search" value={q} placeholder="Buscar o ir a…" aria-label="Buscar en Astra" autofocus enterKeyHint="go"
            onInput={(e) => setQ(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') { if (first) open(first.href); else if (capture) open(`/registrar?t=${encodeURIComponent(q.trim())}`); } }} />
        </div>
        <button type="button" class="icon-btn" aria-label="Cerrar" onClick={onClose}><Icon name="close" /></button>
      </div>
      {q.trim().length < 2 && (
        <section class="stack-xs" aria-label="Atajos">
          <h3 class="eyebrow">Atajos de ahora</h3>
          <div>{quick.map((p) => <Row key={p.href} it={p} onOpen={open} />)}</div>
          <p class="small muted">Escribe el nombre de una pantalla, un pendiente, una persona, un producto o un comercio.</p>
        </section>
      )}
      {groups.map((g) => (
        <section key={g.key} class="stack-xs" aria-label={g.title}>
          <h3 class="eyebrow">{g.title}</h3>
          <div>{g.items.map((it, i) => <Row key={`${it.href}:${it.title}:${i}`} it={it} onOpen={open} />)}</div>
        </section>
      ))}
      {capture && (
        <section class="stack-xs" aria-label="Registrar">
          <h3 class="eyebrow">Registrar</h3>
          <Row it={{ title: `Anotar «${q.trim().slice(0, 40)}»`, sub: 'Abre Registrar con este texto', icon: 'mic', href: `/registrar?t=${encodeURIComponent(q.trim())}` }} onOpen={open} />
        </section>
      )}
      {q.trim().length >= 2 && !groups.length && !capture && <p class="lead" role="status">No encontré nada con «{q.trim()}».</p>}
    </Sheet>
  );
}

function Row({ it, onOpen }) {
  return (
    <button type="button" class="lrow" style={{ minHeight: 52 }} onClick={() => onOpen(it.href)}>
      <span class="tile sm" style={{ background: 'var(--soft)', color: 'var(--ink)' }}><Icon name={it.icon} size={18} /></span>
      <span class="stack-xs grow" style={{ minWidth: 0 }}>
        <span class="semi" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
        {it.sub && <span class="tiny muted">{it.sub}</span>}
      </span>
      <Icon name="right" size={16} />
    </button>
  );
}
