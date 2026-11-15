// Aparatos Bluetooth (2.0): bandas de pulso, tensiómetros y básculas que hablan el estándar Bluetooth
// de salud (GATT). Astra lee la medición directo del aparato, sin la app del fabricante ni ninguna nube.
// Funciona en Chrome (Android y computadora); el iPhone no deja a las páginas usar Bluetooth.
//
// La primera mitad son funciones puras (cómo se lee cada medición, según la norma); la segunda, la conexión.

// ---------- Leer las mediciones (norma Bluetooth SIG) ----------

// Número de 16 bits «SFLOAT» (IEEE 11073): 12 bits de mantisa y 4 de exponente, con signo.
export function sfloat(raw) {
  if (raw === 0x07ff || raw === 0x0800 || raw === 0x07fe || raw === 0x0802 || raw === 0x0801) return null;
  let m = raw & 0x0fff; if (m >= 0x0800) m -= 0x1000;
  let e = raw >> 12; if (e >= 0x08) e -= 0x10;
  return m * 10 ** e;
}

// Pulso (característica 0x2A37): latidos por minuto y, si la banda los da, los intervalos entre latidos (ms).
export function parseHeartRate(dv) {
  if (!dv || dv.byteLength < 2) return null;
  const flags = dv.getUint8(0);
  let i = 1;
  const wide = flags & 0x01;
  if (wide && dv.byteLength < 3) return null;
  const bpm = wide ? dv.getUint16(i, true) : dv.getUint8(i);
  i += wide ? 2 : 1;
  const contactKnown = (flags & 0x04) !== 0;
  const contact = contactKnown ? (flags & 0x02) !== 0 : null;
  if (flags & 0x08) i += 2; // energía gastada
  const rr = [];
  if (flags & 0x10) for (; i + 1 < dv.byteLength; i += 2) rr.push(Math.round((dv.getUint16(i, true) * 1000) / 1024));
  return { bpm, rr, contact };
}

// Presión (0x2A35): sistólica, diastólica y pulso. Si el aparato mide en kPa, se pasa a mmHg.
export function parseBloodPressure(dv) {
  if (!dv || dv.byteLength < 7) return null;
  const flags = dv.getUint8(0);
  const kpa = (flags & 0x01) !== 0;
  const k = kpa ? 7.50062 : 1;
  const sys = sfloat(dv.getUint16(1, true)); const dia = sfloat(dv.getUint16(3, true));
  if (sys == null || dia == null) return null;
  let i = 7;
  if (flags & 0x02) i += 7; // fecha y hora del aparato
  let pulse = null;
  if ((flags & 0x04) && i + 1 < dv.byteLength) { pulse = sfloat(dv.getUint16(i, true)); i += 2; }
  return { sys: Math.round(sys * k), dia: Math.round(dia * k), pulse: pulse != null ? Math.round(pulse) : null };
}

// Peso (0x2A9D): en kilos, venga en kilos o en libras.
export function parseWeight(dv) {
  if (!dv || dv.byteLength < 3) return null;
  const flags = dv.getUint8(0);
  const raw = dv.getUint16(1, true);
  if (raw === 0xffff) return null;
  const kg = (flags & 0x01) ? raw * 0.01 * 0.45359237 : raw * 0.005;
  return { kg: Math.round(kg * 100) / 100 };
}

// De los intervalos entre latidos: pulso y VFC (RMSSD), sin los latidos mal leídos.
export function rrStats(rr) {
  const xs = (rr || []).filter((v) => v >= 300 && v <= 2000);
  if (xs.length < 20) return { ok: false, n: xs.length };
  const sorted = [...xs].sort((a, b) => a - b);
  const med = sorted[sorted.length >> 1];
  const keep = xs.map((v) => Math.abs(v - med) <= med * 0.25);
  const good = xs.filter((_, i) => keep[i]);
  if (good.length < 20) return { ok: false, n: good.length };
  const bpm = 60000 / (good.reduce((a, b) => a + b, 0) / good.length);
  const diffs = [];
  for (let i = 1; i < xs.length; i++) if (keep[i] && keep[i - 1]) diffs.push(xs[i] - xs[i - 1]);
  const rmssd = diffs.length >= 15 ? Math.sqrt(diffs.reduce((a, d) => a + d * d, 0) / diffs.length) : null;
  return { ok: true, n: good.length, bpm: Math.round(bpm), rmssd: rmssd != null ? Math.round(rmssd) : null, clean: good.length / xs.length };
}

// ---------- Conexión ----------

export const bleSupported = () => typeof navigator !== 'undefined' && !!navigator.bluetooth && typeof navigator.bluetooth.requestDevice === 'function';

export const BLE_KINDS = {
  pulso: { service: 'heart_rate', char: 'heart_rate_measurement', parse: parseHeartRate, name: 'Banda de pulso', icon: 'pulse', hint: 'Bandas de pecho y de brazo (Polar, Garmin, Wahoo, Coospo…) y relojes en modo «transmitir pulso».' },
  presion: { service: 'blood_pressure', char: 'blood_pressure_measurement', parse: parseBloodPressure, name: 'Tensiómetro', icon: 'heart', hint: 'Tensiómetros con Bluetooth estándar (Omron, A&D, Beurer y otros). Toma la presión y la lectura llega sola.' },
  peso: { service: 'weight_scale', char: 'weight_measurement', parse: parseWeight, name: 'Báscula', icon: 'gauge', hint: 'Básculas con Bluetooth estándar. Súbete después de conectar.' },
};

export function bleErrorText(err) {
  const n = err && err.name;
  if (n === 'NotFoundError') return ''; // cerró la lista sin elegir
  if (n === 'SecurityError' || n === 'NotAllowedError') return 'No hay permiso para usar Bluetooth. Revisa que esté encendido y permitido para el navegador.';
  if (n === 'NetworkError') return 'Se perdió la conexión con el aparato. Acércalo y vuelve a intentar.';
  if (n === 'NotSupportedError') return 'Ese aparato no usa el estándar de salud de Bluetooth. Sus lecturas se anotan a mano.';
  return 'No pude conectar con el aparato.';
}

// Conecta y entrega cada medición en `onData`. Devuelve { name, stop }.
export async function connectBle(kind, onData, onLost) {
  const k = BLE_KINDS[kind];
  const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [k.service] }] });
  const lost = () => { if (onLost) onLost(); };
  device.addEventListener('gattserverdisconnected', lost);
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(k.service);
  const ch = await service.getCharacteristic(k.char);
  const onValue = (e) => { const v = k.parse(e.target.value); if (v) onData(v); };
  ch.addEventListener('characteristicvaluechanged', onValue);
  await ch.startNotifications();
  const stop = () => {
    try { ch.removeEventListener('characteristicvaluechanged', onValue); } catch { /* ya no está */ }
    try { device.removeEventListener('gattserverdisconnected', lost); } catch { /* ya no está */ }
    try { if (device.gatt.connected) device.gatt.disconnect(); } catch { /* ya estaba desconectado */ }
  };
  return { name: device.name || k.name, stop };
}
