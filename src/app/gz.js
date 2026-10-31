// Comprimir y descomprimir texto (gzip) con lo que trae el navegador. Si no hay soporte, se trabaja sin comprimir.
// Se usa para gastar menos datos al sincronizar y menos espacio en los puntos de restauración.

export const canGzip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function' && typeof Response === 'function';

async function pipe(data, stream) {
  const src = new Blob([data]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(src).arrayBuffer());
}

export const gzip = (text) => pipe(text, new CompressionStream('gzip'));
export async function gunzip(bytes) {
  const out = await pipe(bytes, new DecompressionStream('gzip'));
  return new TextDecoder().decode(out);
}

// Base64 por pedazos (un texto de varios MB no cabe en una sola llamada a String.fromCharCode).
export function toB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function fromB64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const gzipB64 = async (text) => toB64(await gzip(text));
export const gunzipB64 = async (b64) => gunzip(fromB64(b64));
