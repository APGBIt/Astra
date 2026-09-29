import { useEffect, useState } from 'preact/hooks';

let depth = 0;

export function parseHash() {
  const raw = (typeof location !== 'undefined' ? location.hash : '').replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const clean = path.startsWith('/') ? path : '/' + path;
  return { path: clean, parts: clean.split('/').filter(Boolean), query: new URLSearchParams(qs || '') };
}

export function go(path, { replace = false } = {}) {
  const h = '#' + path;
  if (replace) {
    history.replaceState(null, '', h);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    depth++;
    location.hash = path;
  }
}

export function back(fallback = '/') {
  if (depth > 0) {
    depth--;
    history.back();
  } else {
    go(fallback, { replace: true });
  }
}

export function useRoute() {
  const [r, setR] = useState(parseHash());
  useEffect(() => {
    const f = () => {
      setR(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}
