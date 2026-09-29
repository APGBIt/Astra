// Qué permite este navegador y este lugar (app propia, archivo local o vista dentro de Claude).

function detect() {
  if (typeof window === 'undefined') return { ssr: true };
  const ua = navigator.userAgent || '';
  const isIOS = /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  let framed = false;
  try { framed = window.self !== window.top; } catch { framed = true; }
  let standalone = false;
  try { standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch { /* sin soporte */ }
  const secure = !!window.isSecureContext;
  const fileProtocol = location.protocol === 'file:';
  return {
    isIOS,
    isAndroid,
    framed,
    standalone,
    secure,
    fileProtocol,
    hasClaude: typeof window.claude === 'object' && window.claude !== null,
    hasBarcode: 'BarcodeDetector' in window,
    canVibrate: typeof navigator.vibrate === 'function' && !isIOS,
    canInstall: !framed && !fileProtocol && secure && 'serviceWorker' in navigator,
  };
}

export const env = detect();

export function vibrate(pattern) {
  try { if (env.canVibrate) navigator.vibrate(pattern); } catch { /* ignorar */ }
}
