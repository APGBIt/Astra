import { useEffect, useState } from 'preact/hooks';

// Cada entrada del historial lleva su número (`astra`). Así «Volver» sabe si hay una pantalla
// anterior de la app, también cuando llegaste tocando un enlace.
let idx = 0;

function stamp(prev) {
  if (typeof history === 'undefined') return;
  const st = history.state;
  if (st && typeof st.astra === 'number') idx = st.astra;
  else {
    idx = prev == null ? 0 : prev + 1;
    try { history.replaceState({ ...(st || {}), astra: idx }, ''); } catch { /* sin historial */ }
  }
}
stamp(null);

export function parseHash() {
  const raw = (typeof location !== 'undefined' ? location.hash : '').replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const clean = path.startsWith('/') ? path : '/' + path;
  return { path: clean, parts: clean.split('/').filter(Boolean), query: new URLSearchParams(qs || '') };
}

export function go(path, { replace = false } = {}) {
  const h = '#' + path;
  if (replace) {
    history.replaceState({ astra: idx }, '', h);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = path;
  }
}

// Dos «volver» seguidos (por ejemplo, borrar y cerrar a la vez) cuentan como uno.
let leaving = null;
export function back(fallback = '/') {
  if (leaving) return;
  if (idx > 0) {
    leaving = setTimeout(() => { leaving = null; }, 700);
    history.back();
  } else go(fallback, { replace: true });
}

// `sameScreen(antes, después)`: si la ruta nueva solo abre o cierra una hoja sobre la misma pantalla,
// no se vuelve arriba (así la lista queda donde estaba).
export function useRoute(sameScreen = () => false) {
  const [r, setR] = useState(parseHash());
  useEffect(() => {
    let cur = parseHash();
    const f = () => {
      clearTimeout(leaving);
      leaving = null;
      stamp(idx);
      const next = parseHash();
      if (!sameScreen(cur, next)) window.scrollTo(0, 0);
      cur = next;
      setR(next);
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}
