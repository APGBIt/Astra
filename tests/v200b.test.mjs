// 2.0 «Renacer», parte 2: el mundo físico. Etiquetas inteligentes (NFC y QR), la Lente de realidad aumentada,
// el pulso con la cámara y los aparatos Bluetooth.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as L from '../src/game/logic.js';
import * as G from '../src/game/tags.js';
import * as Lens from '../src/game/lens.js';
import * as P from '../src/game/ppg.js';
import * as B from '../src/app/ble.js';
import * as S from '../src/game/shop.js';
import { addPrice } from '../src/game/prices.js';
import { qrMatrix, qrSvg, qrVersionFor, QR_MAX_BYTES } from '../src/app/qr.js';
import { addMed } from '../src/game/health.js';
import { mergeStates } from '../src/game/merge.js';
import { plusOf } from '../src/game/plus.js';
import { addDays } from '../src/app/dates.js';

const jsQR = createRequire(import.meta.url)('jsqr');
const D = '2026-11-15';
const clone = (x) => JSON.parse(JSON.stringify(x));
function fresh(day = D) {
  const s = L.defaultState(addDays(day, -30));
  s.profile.onboarded = true;
  L.reconcile(s, day);
  return s;
}
// Dibuja la matriz como una imagen (blanco y negro) para leerla con un lector de verdad.
function pixels(text, scale = 5, margin = 4) {
  const q = qrMatrix(text);
  const n = q.size; const W = (n + margin * 2) * scale;
  const d = new Uint8ClampedArray(W * W * 4).fill(255);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.rows[y][x]) for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) { const i = (((y + margin) * scale + dy) * W + (x + margin) * scale + dx) * 4; d[i] = d[i + 1] = d[i + 2] = 0; }
  return { d, W };
}
const readQR = (text) => { const { d, W } = pixels(text); const r = jsQR(d, W, W); return r ? r.data : null; };

// ---------- Códigos QR ----------

test('QR: lo que genera Astra lo lee un lector de verdad (direcciones, acentos y el tamaño máximo)', () => {
  for (const t of ['https://apgbit.github.io/Astra/#/t/abc234', 'a', 'Ñandú, café y más', 'x'.repeat(100), 'y'.repeat(QR_MAX_BYTES)]) assert.equal(readQR(t), t);
});

test('QR: elige la versión más pequeña que alcanza; si no cabe, no inventa', () => {
  assert.equal(qrVersionFor(10), 1);
  assert.ok(qrVersionFor(60) > qrVersionFor(20));
  assert.equal(qrMatrix('z'.repeat(QR_MAX_BYTES + 1)), null);
  assert.equal(qrSvg('z'.repeat(QR_MAX_BYTES + 1)), '');
  const svg = qrSvg('hola', { title: 'Código "de" prueba' });
  assert.ok(svg.startsWith('<svg') && svg.includes('&quot;de&quot;'));
});

// ---------- Etiquetas ----------

test('etiqueta de una rutina: se marca hecha, da XP, no cuenta dos veces y se deshace', () => {
  const s = fresh();
  const c = L.addChore(s, { title: 'Lavar la ropa', freq: { type: 'every', n: 7, unit: 'day' }, start: D }, D);
  const t = G.addTag(s, { action: { type: 'chore', ref: c.id }, where: 'En la lavadora' }, D);
  assert.match(t.id, /^[a-z0-9]{6}$/);
  assert.equal(t.name, 'Lavar la ropa');
  assert.equal(G.tagStatus(s, t, D).line, 'Toca hoy');
  const xp = s.xp;
  const ev = [];
  const r = G.runTag(s, t.id, D, ev, { now: 1000 });
  assert.ok(r.ok && r.undo);
  assert.ok(s.xp > xp);
  assert.equal(G.tagStatus(s, G.tagOf(s, t.id), D).done, true);
  // Una segunda lectura enseguida (doble toque del NFC) no hace nada.
  const again = G.runTag(s, t.id, D, [], { now: 2000 });
  assert.equal(again.ok, false);
  assert.equal(again.repeat, true);
  assert.equal(G.tagOf(s, t.id).uses, 1);
  assert.equal(G.undoTag(s, r.undo, D), true);
  assert.equal(G.tagStatus(s, G.tagOf(s, t.id), D).done, false);
});

test('etiquetas de agua, de toma y de «se acabó»', () => {
  const s = fresh();
  const w = G.addTag(s, { action: { type: 'water' } }, D);
  G.runTag(s, w.id, D, [], { now: 1 });
  G.runTag(s, w.id, D, [], { now: 1 + G.TAG_REPEAT_MS + 1 });
  assert.equal(s.health[D].water, 2);
  G.undoTag(s, { type: 'water' }, D);
  assert.equal(s.health[D].water, 1);

  const m = addMed(s, { name: 'Vitamina D', times: ['08:00'] }, D);
  const d = G.addTag(s, { action: { type: 'dose', ref: m.id } }, D);
  assert.match(G.tagStatus(s, d, D, 8 * 60).line, /^Toca a las/);
  assert.match(G.tagStatus(s, d, D, 11 * 60).line, /^Tocaba a las/);
  const r = G.runTag(s, d.id, D, [], { now: 5 });
  assert.ok(r.ok);
  assert.equal(G.tagStatus(s, G.tagOf(s, d.id), D).done, true);
  // Sin más tomas hoy: otra lectura avisa, no anota.
  assert.equal(G.runTag(s, d.id, D, [], { now: 5 + G.TAG_REPEAT_MS + 1 }).ok, false);

  const b = G.addTag(s, { action: { type: 'buy', text: 'papel higiénico' } }, D);
  const rb = G.runTag(s, b.id, D, [], { now: 9 });
  assert.ok(rb.ok);
  assert.equal(S.shopOf(s).items.filter((i) => !i.done).length, 1);
  assert.equal(G.tagStatus(s, G.tagOf(s, b.id), D).line, 'Ya está en tu lista');
});

test('etiqueta que abre una pantalla; acciones que no existen se rechazan', () => {
  const s = fresh();
  const o = G.addTag(s, { action: { type: 'open', route: '/posada' } }, D);
  const r = G.runTag(s, o.id, D, [], { now: 1 });
  assert.equal(r.href, '/posada');
  assert.equal(G.runTag(s, o.id, D, [], { now: 2 }).ok, true); // abrir no tiene espera
  assert.equal(G.addTag(s, { action: { type: 'open', route: 'javascript:alert(1)' } }, D), null);
  assert.equal(G.addTag(s, { action: { type: 'chore', ref: 'no-existe' } }, D), null);
  assert.equal(G.addTag(s, { action: { type: 'borrar-todo' } }, D), null);
  assert.equal(G.runTag(s, 'zzzzzz', D, []).unknown, true);
});

test('la dirección de una etiqueta se reconoce venga como venga; un código ajeno también puede ser etiqueta', () => {
  const s = fresh();
  const t = G.addTag(s, { action: { type: 'water' }, code: '7501234567890' }, D);
  const url = G.tagUrl('https://apgbit.github.io/Astra/#/mando?ver=mundo', t.id);
  assert.equal(url, `https://apgbit.github.io/Astra/#/t/${t.id}`);
  assert.equal(G.findTag(s, url).id, t.id);
  assert.equal(G.findTag(s, `  ${url}\n`).id, t.id);
  assert.equal(G.findTag(s, '7501234567890').id, t.id);
  assert.deepEqual(G.findTag(s, 'https://x.y/#/t/qqqqqq'), { unknown: true, id: 'qqqqqq' });
  assert.equal(G.findTag(s, 'https://example.com'), null);
  // Una etiqueta creada en otro teléfono se puede adoptar con su misma clave.
  const a = G.addTag(s, { id: 'qqqqqq', action: { type: 'open', route: '/hogar' } }, D);
  assert.equal(a.id, 'qqqqqq');
  // El QR de la etiqueta se lee y lleva a ella.
  assert.equal(G.findTag(s, readQR(url)).id, t.id);
});

test('ideas de etiquetas: salen de tus rutinas y medicinas, y no repiten las que ya tienes', () => {
  const s = fresh();
  const c = L.addChore(s, { title: 'Lavar la ropa' }, D);
  addMed(s, { name: 'Hierro', times: ['07:00'] }, D);
  const ideas = G.tagIdeas(s);
  assert.equal(ideas[0].where, 'En la lavadora');
  assert.ok(ideas.some((i) => i.action.type === 'dose'));
  G.addTag(s, { action: { type: 'chore', ref: c.id } }, D);
  assert.ok(!G.tagIdeas(s).some((i) => i.action.type === 'chore' && i.action.ref === c.id));
});

test('sincronizar: las etiquetas de dos teléfonos se juntan y los usos se conservan', () => {
  const base = fresh();
  const a = clone(base); const b = clone(base);
  const ta = G.addTag(a, { action: { type: 'water' }, name: 'Botellón' }, D);
  const tb = G.addTag(b, { action: { type: 'open', route: '/posada' } }, D);
  G.runTag(a, ta.id, D, [], { now: 1 });
  const m = mergeStates(base, a, b);
  assert.deepEqual(plusOf(m).tags.map((t) => t.id).sort(), [ta.id, tb.id].sort());
  assert.equal(G.tagOf(m, ta.id).uses, 1);
});

// ---------- La Lente ----------

test('lente: una etiqueta muestra su estado y su acción; una desconocida pide configurarla', () => {
  const s = fresh();
  const c = L.addChore(s, { title: 'Sacar la basura', start: D }, D);
  const t = G.addTag(s, { action: { type: 'chore', ref: c.id }, where: 'En el zafacón' }, D);
  const card = Lens.lensCard(s, G.tagUrl('https://a.b/', t.id), 'qr', D);
  assert.equal(card.type, 'etiqueta');
  assert.equal(card.title, 'Sacar la basura');
  assert.deepEqual(card.lines, ['Toca hoy', 'En el zafacón']);
  assert.equal(card.verb, 'Hecha');
  G.runTag(s, t.id, D, [], { now: 1 });
  const after = Lens.lensCard(s, G.tagUrl('https://a.b/', t.id), 'qr', D);
  assert.equal(after.done, true);
  assert.equal(after.verb, '');
  assert.equal(Lens.lensCard(s, 'https://a.b/#/t/nnnnnn', 'qr', D).type, 'nueva');
  assert.equal(Lens.lensCard(s, 'cualquier texto', 'qr', D).type, 'codigo');
  assert.equal(Lens.lensCard(s, '', 'qr', D), null);
});

test('lente: un producto muestra su último precio, dónde sale más barato, la despensa y la lista', () => {
  const s = fresh();
  const code = '7460123456789';
  assert.equal(Lens.lensCard(s, code, 'barras', D).type, 'buscar');
  assert.equal(Lens.rememberCode(s, code, 'Leche entera Rica'), true);
  assert.equal(Lens.rememberCode(s, 'abc', 'x'), false);
  let card = Lens.lensCard(s, code, 'barras', D);
  assert.equal(card.type, 'producto');
  assert.equal(card.lines[0], 'Sin precios anotados todavía');
  addPrice(s, { name: 'leche', price: 80, qty: 1, unit: 'l', store: 'Jumbo', day: addDays(D, -3) }, D);
  addPrice(s, { name: 'leche', price: 72, qty: 1, unit: 'l', store: 'Bravo', day: addDays(D, -10) }, D);
  card = Lens.lensCard(s, code, 'barras', D);
  assert.match(card.lines[0], /RD\$80.* en Jumbo · hace 3 días/);
  assert.ok(card.lines.some((l) => /Más barato en Bravo: RD\$72/.test(l)), card.lines.join(' | '));
  assert.equal(card.verb, 'A la lista');
  Lens.lensToList(s, card.name, D);
  card = Lens.lensCard(s, code, 'barras', D);
  assert.equal(card.inList, true);
  assert.equal(card.verb, '');
  assert.ok(card.lines.includes('Está en tu lista'));
});

test('lente: la tarjeta sigue al código sin temblar y cae donde se ve el video', () => {
  const a = Lens.follow(null, { x: 100, y: 100, w: 50, h: 50 });
  const b = Lens.follow(a, { x: 120, y: 100, w: 50, h: 50 });
  assert.ok(b.x > 100 && b.x < 120);
  // Video 1280×720 mostrado en 390×800 recortado para llenar: el centro va al centro.
  const p = Lens.toScreen({ x: 640, y: 360, w: 0, h: 0 }, { w: 1280, h: 720 }, { w: 390, h: 800 });
  assert.equal(Math.round(p.x), 195);
  assert.equal(Math.round(p.y), 400);
});

// ---------- Pulso con la cámara ----------

test('pulso: acierta dentro de 2 latidos entre 50 y 120, con cámaras de 30 y de 24 cuadros', () => {
  for (const bpm of [50, 58, 64, 72, 88, 104, 120]) {
    for (const fps of [30, 24]) {
      const r = P.analyzePulse(P.fakePulse({ bpm, fps, seed: bpm + fps }).samples);
      assert.ok(r.ok, `${bpm} lpm a ${fps} cuadros: ${JSON.stringify(r)}`);
      assert.ok(Math.abs(r.bpm - bpm) <= 2, `${bpm} lpm a ${fps}: salió ${r.bpm}`);
    }
  }
});

test('pulso: con ruido o poco tiempo no da un número; la VFC de la cámara tiene un piso de ruido (por eso no se guarda)', () => {
  const noisy = P.analyzePulse(P.fakePulse({ bpm: 70, noise: 4 }).samples);
  assert.equal(noisy.ok, false);
  assert.equal(noisy.hrvOk, false);
  assert.equal(P.analyzePulse(P.fakePulse({ bpm: 70, seconds: 6 }).samples).reason, 'corta');
  assert.equal(P.analyzePulse([]).ok, false);
  const flat = Array.from({ length: 900 }, (_, i) => ({ t: i * 33.3, v: 200 }));
  assert.equal(P.analyzePulse(flat).ok, false);
  const clean = P.analyzePulse(P.fakePulse({ bpm: 62, hrv: 40 }).samples);
  assert.ok(clean.hrvOk);
  // La VFC estimada crece con la variación real entre latidos.
  const low = P.analyzePulse(P.fakePulse({ bpm: 62, hrv: 12, seed: 3 }).samples);
  assert.ok(clean.rmssd > low.rmssd, `${clean.rmssd} > ${low.rmssd}`);
  // Una onda sin ninguna variación entre latidos no da cero: ese es el piso de ruido de la cámara.
  const zero = P.analyzePulse(P.fakePulse({ bpm: 66, hrv: 0, seed: 2 }).samples);
  assert.ok(zero.ok && zero.rmssd >= 5, `piso de ruido: ${zero.rmssd}`);
});

test('pulso: el dedo sobre la cámara se reconoce por el color', () => {
  assert.equal(P.fingerOn({ r: 210, g: 40, b: 30 }), true);
  assert.equal(P.fingerOn({ r: 120, g: 110, b: 100 }), false); // una habitación
  assert.equal(P.fingerOn({ r: 20, g: 5, b: 5 }), false); // a oscuras, sin flash
  const live = P.livePulse(P.fakePulse({ bpm: 80 }).samples);
  assert.ok(live && Math.abs(live.bpm - 80) <= 3);
});

// ---------- Aparatos Bluetooth ----------

const dv = (bytes) => new DataView(Uint8Array.from(bytes).buffer);

test('Bluetooth: pulso de 8 y de 16 bits, con y sin intervalos entre latidos', () => {
  assert.deepEqual(B.parseHeartRate(dv([0x00, 72])), { bpm: 72, rr: [], contact: null });
  assert.deepEqual(B.parseHeartRate(dv([0x16, 60, 0x00, 0x04, 0x00, 0x04])), { bpm: 60, rr: [1000, 1000], contact: true });
  assert.equal(B.parseHeartRate(dv([0x01, 0x2c, 0x01])).bpm, 300);
  // Con «energía gastada» delante de los intervalos.
  assert.deepEqual(B.parseHeartRate(dv([0x18, 75, 0x10, 0x00, 0x00, 0x03])).rr, [750]);
  assert.equal(B.parseHeartRate(dv([0x00])), null);
});

test('Bluetooth: presión en mmHg y en kPa, con fecha del aparato; peso en kilos y en libras', () => {
  assert.deepEqual(B.parseBloodPressure(dv([0x04, 120, 0, 80, 0, 93, 0, 66, 0])), { sys: 120, dia: 80, pulse: 66 });
  // Con fecha (7 bytes) antes del pulso.
  assert.deepEqual(B.parseBloodPressure(dv([0x06, 135, 0, 85, 0, 100, 0, 0xea, 0x07, 11, 15, 8, 30, 0, 72, 0])), { sys: 135, dia: 85, pulse: 72 });
  // 16.0 kPa / 10.7 kPa ≈ 120/80 mmHg.
  assert.deepEqual(B.parseBloodPressure(dv([0x01, 0xa0, 0xf0, 0x6b, 0xf0, 0x7c, 0xf0])), { sys: 120, dia: 80, pulse: null });
  assert.equal(B.parseBloodPressure(dv([0x00, 0xff, 0x07, 80, 0, 90, 0])), null); // «sin dato»
  assert.equal(B.sfloat(0xf0a0), 16);
  assert.equal(B.sfloat(0x0800), null);
  assert.deepEqual(B.parseWeight(dv([0x00, 0x30, 0x3a])), { kg: 74.48 });
  assert.deepEqual(B.parseWeight(dv([0x01, 0x98, 0x3a])), { kg: 68.04 }); // 150.00 lb
});

test('Bluetooth: de los intervalos entre latidos salen el pulso y la VFC, sin los latidos mal leídos', () => {
  const rr = Array.from({ length: 60 }, (_, i) => 1000 + (i % 2 ? 20 : -20));
  const st = B.rrStats(rr);
  assert.ok(st.ok);
  assert.equal(st.bpm, 60);
  assert.equal(st.rmssd, 40);
  const dirty = [...rr]; dirty[20] = 1950; dirty[40] = 400;
  const sd = B.rrStats(dirty);
  assert.equal(sd.bpm, 60);
  assert.ok(sd.rmssd <= 41);
  assert.equal(B.rrStats([800, 810]).ok, false);
});
