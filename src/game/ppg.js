// Pulso con la cámara (2.0): fotopletismografía. Con la yema del dedo sobre la cámara y el flash encendido,
// cada latido cambia un poco cuánta luz roja deja pasar la piel. De esa onda salen el pulso (latidos por
// minuto) y una estimación de la VFC (RMSSD), que alimentan tu preparación de cada mañana.
//
// Es puro: recibe las muestras (momento en ms y brillo rojo medio de la imagen) y devuelve el resultado con
// su calidad. No es un dispositivo médico: si la señal no es buena, no da un número.

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
const sd = (xs) => { if (xs.length < 2) return 0; const m = mean(xs); return Math.sqrt(xs.reduce((a, v) => a + (v - m) ** 2, 0) / (xs.length - 1)); };

export const PPG_FS = 30; // muestras por segundo después de remuestrear
export const PPG_SECONDS = 30; // lo que dura una medición
export const PPG_MIN_SECONDS = 12;

// ¿El dedo tapa la cámara con el flash encendido? La imagen queda roja y bastante pareja.
export function fingerOn({ r, g, b }) {
  return r >= 90 && r > g * 1.6 && r > b * 1.6;
}

// A intervalos iguales (las cámaras no entregan los cuadros a un ritmo exacto).
function resample(samples, fs) {
  const t0 = samples[0].t; const t1 = samples[samples.length - 1].t;
  const n = Math.floor(((t1 - t0) / 1000) * fs);
  const out = new Float64Array(Math.max(0, n));
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + (i * 1000) / fs;
    while (j < samples.length - 2 && samples[j + 1].t < t) j += 1;
    const a = samples[j]; const b = samples[j + 1];
    const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
    out[i] = a.v + (b.v - a.v) * Math.min(1, Math.max(0, k));
  }
  return out;
}

function movingAvg(x, w) {
  const n = x.length; const out = new Float64Array(n); const h = Math.floor(w / 2);
  let sum = 0; let cnt = 0; let lo = 0; let hi = -1;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - h); const b = Math.min(n - 1, i + h);
    while (hi < b) { hi += 1; sum += x[hi]; cnt += 1; }
    while (lo < a) { sum -= x[lo]; lo += 1; cnt -= 1; }
    out[i] = sum / cnt;
  }
  return out;
}

// La onda limpia: sin la deriva lenta (dedo que se mueve, cámara que ajusta) ni el ruido de cuadro a cuadro.
export function cleanWave(samples, fs = PPG_FS) {
  const raw = resample(samples, fs);
  if (raw.length < fs * 3) return new Float64Array(0);
  const base = movingAvg(raw, Math.round(fs * 1.0) | 1);
  const det = raw.map((v, i) => v - base[i]);
  const sm = movingAvg(det, 5);
  const s = sd(Array.from(sm)) || 1;
  return sm.map((v) => -v / s); // con cada latido la imagen se oscurece: se voltea para que el latido sea un pico
}

// El período dominante por autocorrelación (entre 40 y 190 latidos por minuto).
function period(x, fs) {
  const n = x.length;
  const lo = Math.round((fs * 60) / 190); const hi = Math.round((fs * 60) / 40);
  let e0 = 0;
  for (let i = 0; i < n; i++) e0 += x[i] * x[i];
  const acf = [];
  for (let lag = lo; lag <= hi && lag < n / 2; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < n; i++) sum += x[i] * x[i + lag];
    acf.push({ lag, r: e0 ? sum / e0 : 0 });
  }
  // El primer pico claro: así no se toma el doble del período (la mitad del pulso real).
  const top = acf.reduce((a, c) => (c.r > a.r ? c : a), { r: -1, lag: 0 });
  let best = top;
  for (let i = 1; i < acf.length - 1; i++) {
    const c = acf[i];
    if (c.r > acf[i - 1].r && c.r >= acf[i + 1].r && c.r >= top.r * 0.85) { best = c; break; }
  }
  return best;
}

export function analyzePulse(samples, { fs = PPG_FS, minSeconds = PPG_MIN_SECONDS } = {}) {
  const fail = (reason, extra = {}) => ({ ok: false, bpm: null, rmssd: null, beats: 0, quality: 0, reason, ...extra });
  if (!Array.isArray(samples) || samples.length < 30) return fail('corta');
  const seconds = (samples[samples.length - 1].t - samples[0].t) / 1000;
  if (seconds < minSeconds) return fail('corta', { seconds });
  const x = cleanWave(samples, fs);
  if (!x.length) return fail('corta', { seconds });
  const per = period(x, fs);
  if (!per.lag || per.r < 0.25) return fail('ruido', { seconds, quality: Math.max(0, per.r) });
  // Picos: máximos locales separados al menos 0.6 períodos y por encima de una fracción de su vecindad.
  const minGap = Math.max(2, Math.round(per.lag * 0.6));
  const peaks = [];
  for (let i = 1; i < x.length - 1; i++) {
    if (!(x[i] > x[i - 1] && x[i] >= x[i + 1]) || x[i] < 0.2) continue;
    if (peaks.length && i - peaks[peaks.length - 1].i < minGap) { if (x[i] > peaks[peaks.length - 1].v) peaks[peaks.length - 1] = { i, v: x[i] }; continue; }
    peaks.push({ i, v: x[i] });
  }
  if (peaks.length < 6) return fail('ruido', { seconds, quality: per.r });
  // Momento de cada latido: donde la subida cruza la mitad entre el valle anterior y el pico (interpolado).
  // Es más estable que la punta del pico, que es plana y se mueve con el ruido.
  const back = Math.max(2, Math.round(per.lag * 0.5));
  const times = peaks.map(({ i }) => {
    let lo = i;
    for (let k = i; k >= Math.max(0, i - back); k--) if (x[k] < x[lo]) lo = k;
    const level = (x[lo] + x[i]) / 2;
    let k = lo;
    while (k < i && x[k + 1] < level) k += 1;
    const a = x[k]; const b = x[Math.min(i, k + 1)];
    const frac = b > a ? Math.min(1, Math.max(0, (level - a) / (b - a))) : 0;
    return ((k + frac) * 1000) / fs;
  });
  const rr = [];
  for (let i = 1; i < times.length; i++) rr.push(times[i] - times[i - 1]);
  const med = median(rr);
  const keep = rr.map((v) => Math.abs(v - med) <= med * 0.25);
  const good = rr.filter((_, i) => keep[i]);
  const quality = Math.max(0, Math.min(1, (good.length / rr.length) * Math.min(1, per.r / 0.6)));
  if (good.length < 6) return fail('ruido', { seconds, quality });
  const bpm = 60000 / mean(good);
  if (bpm < 35 || bpm > 190) return fail('ruido', { seconds, quality });
  const diffs = [];
  for (let i = 1; i < rr.length; i++) if (keep[i] && keep[i - 1]) diffs.push(rr[i] - rr[i - 1]);
  const rmssd = diffs.length >= 5 ? Math.sqrt(mean(diffs.map((d) => d * d))) : null;
  return {
    ok: quality >= 0.6, bpm: Math.round(bpm), bpmRaw: bpm, rmssd: rmssd != null ? Math.round(rmssd) : null, sdnn: Math.round(sd(good)),
    beats: good.length, quality: Math.round(quality * 100) / 100, acf: Math.round(per.r * 100) / 100, seconds: Math.round(seconds), reason: quality >= 0.6 ? '' : 'ruido',
    // La VFC solo se ofrece para guardar con una señal muy limpia y medio minuto de datos.
    hrvOk: rmssd != null && quality >= 0.85 && per.r >= 0.85 && seconds >= 25 && good.length >= 20,
  };
}

// Mientras mide: el pulso de los últimos segundos (para mostrarlo en vivo).
export function livePulse(samples, windowMs = 10000) {
  if (!samples.length) return null;
  const end = samples[samples.length - 1].t;
  const r = analyzePulse(samples.filter((s) => s.t >= end - windowMs), { minSeconds: 6 });
  return r.bpm ? r : null;
}

export const PULSE_TEXT = {
  corta: 'Hizo falta más tiempo. Mantén el dedo quieto hasta que termine.',
  ruido: 'La señal salió con ruido. Cubre la cámara y el flash con la yema del dedo, sin apretar, y no te muevas.',
};

// Una onda de prueba (para las pruebas y la demostración): latidos con su variación, deriva y ruido.
export function fakePulse({ bpm = 64, seconds = 30, fps = 30, hrv = 30, noise = 0.15, seed = 5, jitter = 4 } = {}) {
  let a = seed >>> 0;
  const rnd = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) / 0.707; };
  const beats = [];
  let t = 200; const base = 60000 / bpm; let prev = base;
  while (t < seconds * 1000 + 2000) {
    beats.push(t);
    const next = base + (prev - base) * 0.3 + gauss() * (hrv / Math.SQRT2) * 0.95;
    prev = Math.max(base * 0.7, Math.min(base * 1.3, next));
    t += prev;
  }
  const out = [];
  let ts = 0;
  while (ts <= seconds * 1000) {
    let v = 205 + 3 * Math.sin(ts / 4000) + (ts / 1000) * 0.15;
    for (const bt of beats) { const d = ts - bt; if (d > -100 && d < 500) v -= 2.2 * Math.exp(-((d - 120) ** 2) / (2 * 70 ** 2)) + 0.6 * Math.exp(-((d - 330) ** 2) / (2 * 90 ** 2)); }
    v += gauss() * noise;
    out.push({ t: ts, v });
    ts += 1000 / fps + (rnd() - 0.5) * jitter;
  }
  return { samples: out, beats };
}
