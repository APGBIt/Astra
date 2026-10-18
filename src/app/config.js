// Configuración pública de Astra (no hay secretos aquí).
// ID de cliente de Google (OAuth) para «Conectar con Google». Se crea una vez en Google Cloud;
// mientras esté vacío, ese conector se puede activar pegando el ID en Ajustes → Sincronización.
export const GOOGLE_CLIENT_ID = '';

// Dirección pública de Astra (GitHub Pages). Ahí está también la página del conector: …/conector.gs/
export const HOME_URL = 'https://apgbit.github.io/Astra/';

// Versión de la app (la pone el build desde package.json).
// eslint-disable-next-line no-undef
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
