// Inicio de sesión con Google para usar Drive con la cuenta de cada persona.
// Se usa la redirección de OAuth (funciona también con la app instalada): Google vuelve a Astra con un
// permiso temporal (1 hora) para los archivos que crea Astra en tu Drive («drive.file»). No se guarda tu contraseña.
import { GOOGLE_CLIENT_ID } from './config.js';

const TOKEN = 'astra.gtoken';
const STATE = 'astra.gstate';
const CLIENT = 'astra.google.client';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const ss = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
  del(k) { try { sessionStorage.removeItem(k); } catch { /* sin almacenamiento */ } },
};

export function googleClientId() {
  try { return localStorage.getItem(CLIENT) || GOOGLE_CLIENT_ID; } catch { return GOOGLE_CLIENT_ID; }
}
export function setGoogleClientId(v) {
  try { if (v && v.trim()) localStorage.setItem(CLIENT, v.trim()); else localStorage.removeItem(CLIENT); } catch { /* sin almacenamiento */ }
}
export const validClientId = (v) => /^[\w-]+\.apps\.googleusercontent\.com$/.test(String(v || '').trim());

// La dirección a la que vuelve Google (debe estar registrada en Google Cloud tal cual).
export const redirectUri = () => `${location.origin}${location.pathname.replace(/index\.html$/, '')}`;

export function googleToken() {
  try {
    const t = JSON.parse(ss.get(TOKEN) || 'null');
    return t && t.exp > Date.now() + 60000 ? t.token : null;
  } catch { return null; }
}
export const clearGoogleToken = () => ss.del(TOKEN);

// intent: 'connect' (primera vez) o 'resume' (seguir sincronizando). `pick`: dejar elegir la cuenta.
export function startGoogleLogin({ intent = 'resume', pick = false, back = '#/sincronizar', hint = '' } = {}) {
  const st = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  ss.set(STATE, JSON.stringify({ st, back, intent }));
  const p = new URLSearchParams({
    client_id: googleClientId(), redirect_uri: redirectUri(), response_type: 'token', scope: DRIVE_SCOPE,
    include_granted_scopes: 'true', state: st,
  });
  if (pick) p.set('prompt', 'select_account');
  if (hint) p.set('login_hint', hint);
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
}

// Al volver de Google: guarda el permiso en esta sesión y deja la dirección como estaba.
export function handleGoogleRedirect() {
  const h = typeof location !== 'undefined' ? location.hash || '' : '';
  if (h.startsWith('#/') || !/(^#|&)(access_token|error)=/.test(h)) return null;
  const p = new URLSearchParams(h.slice(1));
  let saved = null;
  try { saved = JSON.parse(ss.get(STATE) || 'null'); } catch { saved = null; }
  ss.del(STATE);
  const back = saved && typeof saved.back === 'string' && saved.back.startsWith('#/') ? saved.back : '#/sincronizar';
  history.replaceState(null, '', `${location.pathname}${location.search}${back}`);
  if (!saved || p.get('state') !== saved.st) return { ok: false, error: 'state' };
  if (p.get('error')) return { ok: false, error: p.get('error'), intent: saved.intent };
  const token = p.get('access_token');
  if (!token) return { ok: false, error: 'token' };
  ss.set(TOKEN, JSON.stringify({ token, exp: Date.now() + (Number(p.get('expires_in')) || 3600) * 1000 }));
  return { ok: true, intent: saved.intent };
}
