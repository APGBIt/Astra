// Sonidos y voz para la calma, hechos en el teléfono (sin archivos ni internet):
// campanas con armónicos de cuenco, sonidos de fondo con ruido filtrado y voz con la síntesis del sistema.

let ctx = null;

function audio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// Despierta el audio dentro de un toque (los navegadores lo piden).
export function unlockAudio() { audio(); }

// Una campana tipo cuenco: varios armónicos que se apagan despacio.
function strike(c, t, vol) {
  const out = c.createGain();
  out.gain.value = vol;
  out.connect(c.destination);
  const f0 = 396;
  for (const [ratio, amp, decay] of [[1, 1, 7], [2.76, 0.42, 4.5], [5.4, 0.2, 2.6], [8.93, 0.09, 1.6]]) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f0 * ratio;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + decay + 0.05);
  }
}

export function bell(strikes = 1, volume = 0.35) {
  const c = audio();
  if (!c) return;
  for (let i = 0; i < strikes; i++) strike(c, c.currentTime + 0.05 + i * 2.4, volume);
}

// ---------- Sonidos de fondo ----------

let amb = null;

function noise(c, color) {
  const len = c.sampleRate * 6;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  let b0 = 0; let b1 = 0; let b2 = 0; let b3 = 0; let b4 = 0; let b5 = 0; let b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    } else {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  // Une el final con el principio para que el bucle no se note.
  const fade = Math.floor(c.sampleRate * 0.25);
  for (let i = 0; i < fade; i++) { const k = i / fade; d[len - fade + i] = d[len - fade + i] * (1 - k) + d[i] * k; }
  return buf;
}

export function startAmbient(kind) {
  stopAmbient(0.2);
  if (!kind || kind === 'silencio') return;
  const c = audio();
  if (!c) return;
  const src = c.createBufferSource();
  src.buffer = noise(c, kind === 'lluvia' ? 'pink' : 'brown');
  src.loop = true;
  const main = c.createGain();
  main.gain.value = 0.0001;
  let node = src;
  const filter = (type, f, q = 0.7) => { const x = c.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; node.connect(x); node = x; };
  const extra = [];
  if (kind === 'lluvia') { filter('highpass', 400); filter('lowpass', 7000); }
  else if (kind === 'olas') {
    filter('lowpass', 1100);
    // Ola: el volumen sube y baja cada ~11 segundos.
    const swell = c.createGain();
    swell.gain.value = 0.55;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.09;
    const depth = c.createGain();
    depth.gain.value = 0.42;
    lfo.connect(depth);
    depth.connect(swell.gain);
    lfo.start();
    node.connect(swell);
    node = swell;
    extra.push(lfo);
  } else filter('lowpass', 700);
  node.connect(main);
  main.connect(c.destination);
  const target = kind === 'lluvia' ? 0.5 : kind === 'olas' ? 0.75 : 0.55;
  main.gain.exponentialRampToValueAtTime(target, c.currentTime + 2);
  src.start();
  amb = { src, main, extra };
}

export function stopAmbient(fade = 1.2) {
  if (!amb || !ctx) { amb = null; return; }
  const { src, main, extra } = amb;
  amb = null;
  try {
    main.gain.cancelScheduledValues(ctx.currentTime);
    main.gain.setValueAtTime(Math.max(0.0001, main.gain.value), ctx.currentTime);
    main.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + fade);
    src.stop(ctx.currentTime + fade + 0.05);
    for (const x of extra) x.stop(ctx.currentTime + fade + 0.05);
  } catch { /* ya se detuvo */ }
}

// ---------- Voz ----------

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';

function spanishVoice() {
  try {
    const vs = window.speechSynthesis.getVoices() || [];
    const es = vs.filter((v) => /^es([-_]|$)/i.test(v.lang));
    const pref = ['es-DO', 'es-US', 'es-419', 'es-MX', 'es-CO', 'es-ES'];
    for (const p of pref) { const v = es.find((x) => x.lang.replace('_', '-').toLowerCase() === p.toLowerCase()); if (v) return v; }
    return es[0] || null;
  } catch {
    return null;
  }
}

export function speak(text) {
  if (!canSpeak() || !text) return;
  try {
    window.speechSynthesis.cancel();
    const u = new window.SpeechSynthesisUtterance(text);
    const v = spanishVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'es-US';
    u.rate = 0.88;
    u.pitch = 1;
    u.volume = 0.95;
    window.speechSynthesis.speak(u);
  } catch { /* sin voz */ }
}

export function hush() {
  try { if (canSpeak()) window.speechSynthesis.cancel(); } catch { /* sin voz */ }
}

// ---------- Pantalla encendida durante la sesión ----------

export async function keepAwake() {
  try {
    if (navigator.wakeLock && navigator.wakeLock.request) return await navigator.wakeLock.request('screen');
  } catch { /* no permitido */ }
  return null;
}

// Preferencias de este teléfono (voz y sonido de fondo).
export function pref(key, fallback) {
  try { const v = localStorage.getItem(`astra.ui.${key}`); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function setPref(key, value) {
  try { localStorage.setItem(`astra.ui.${key}`, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
}
