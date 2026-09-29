// Instalación como app (solo cuando se abre desde su propio enlace https).
import { env } from './env.js';

let deferred = null;
let installed = false;

function ping() { window.dispatchEvent(new Event('astra-install')); }

export function initPWA() {
  if (typeof window === 'undefined' || env.framed || location.protocol === 'file:') return;
  if (!document.querySelector('link[rel="manifest"]')) {
    const l = document.createElement('link');
    l.rel = 'manifest';
    l.href = 'manifest.webmanifest';
    document.head.appendChild(l);
  }
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && secure) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; ping(); });
  window.addEventListener('appinstalled', () => { installed = true; deferred = null; ping(); });
}

export function installState() {
  return { canPrompt: !!deferred, installed: installed || env.standalone };
}

export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  try { await deferred.userChoice; } catch { /* */ }
  deferred = null;
  ping();
  return true;
}
