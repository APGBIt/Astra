// La cámara en vivo (2.0): para la Lente y para medir el pulso con el dedo.
// El video nunca sale del teléfono: se mira cuadro a cuadro aquí mismo y no se guarda.

export const cameraSupported = () => typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

export function cameraErrorText(err) {
  const n = err && err.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'No diste permiso para usar la cámara. Puedes darlo en los ajustes del sitio (el candado junto a la dirección).';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No encontré una cámara en este equipo.';
  if (n === 'NotReadableError') return 'Otra aplicación está usando la cámara. Ciérrala y vuelve a intentar.';
  return 'No pude abrir la cámara.';
}

// Abre la cámara de atrás y la conecta al <video>. Devuelve { stream, track, torch(on), hasTorch, stop }.
export async function openCamera(video, { width = 1280, height = 720, low = false } = {}) {
  if (!cameraSupported()) { const e = new Error('sin cámara'); e.name = 'NotFoundError'; throw e; }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: low ? { facingMode: { ideal: 'environment' }, width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 30 } }
      : { facingMode: { ideal: 'environment' }, width: { ideal: width }, height: { ideal: height } },
  });
  const track = stream.getVideoTracks()[0];
  if (video) {
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    video.muted = true;
    try { await video.play(); } catch { /* el navegador lo arranca al tocar */ }
  }
  let hasTorch = false;
  try { const caps = track.getCapabilities ? track.getCapabilities() : {}; hasTorch = !!caps.torch; } catch { hasTorch = false; }
  const torch = async (on) => {
    if (!hasTorch) return false;
    try { await track.applyConstraints({ advanced: [{ torch: !!on }] }); return true; } catch { return false; }
  };
  const stop = () => { try { stream.getTracks().forEach((t) => t.stop()); } catch { /* ya estaba cerrada */ } if (video) video.srcObject = null; };
  return { stream, track, torch, hasTorch, stop };
}

// El color medio del centro de la imagen (para el pulso): { r, g, b } de 0 a 255.
export function frameColor(video, canvas) {
  const S = 32;
  if (canvas.width !== S) { canvas.width = S; canvas.height = S; }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const w = video.videoWidth; const h = video.videoHeight;
  if (!w || !h) return null;
  const side = Math.min(w, h) * 0.5;
  ctx.drawImage(video, (w - side) / 2, (h - side) / 2, side, side, 0, 0, S, S);
  let d;
  try { d = ctx.getImageData(0, 0, S, S).data; } catch { return null; }
  let r = 0; let g = 0; let b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4;
  return { r: r / n, g: g / n, b: b / n };
}
