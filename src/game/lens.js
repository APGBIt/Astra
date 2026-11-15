// La Lente (2.0): realidad aumentada con lo que Astra ya sabe. La cámara encuentra un código (una etiqueta de
// Astra, el código de barras de un producto) y aquí se decide qué mostrar encima de ese objeto.
// Es puro: recibe lo leído y devuelve la tarjeta; la cámara y el dibujo viven en la pantalla.
import { findTag, isTagUrl, tagStatus } from './tags.js';
import { shopOf, addShopItems } from './shop.js';
import { productFor, priceStats } from './prices.js';
import { diffDays } from '../app/dates.js';

const rd = (v) => `RD$${(Math.round(v * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: v >= 100 ? 0 : 2 })}`;
const ago = (day, today) => { const n = diffDays(day, today); return n <= 0 ? 'hoy' : n === 1 ? 'ayer' : n < 60 ? `hace ${n} días` : `hace ${Math.round(n / 30)} meses`; };
export const isProductCode = (raw) => /^\d{8,14}$/.test(String(raw || '').trim());

// Lo que se sabe de un producto por su nombre: precio, tienda más barata, despensa y lista.
export function productCard(s, name, today) {
  const prod = productFor(name);
  const sh = shopOf(s);
  const st = priceStats(s, prod.key, today);
  const lines = [];
  let tone = 'ink';
  if (st.last) {
    lines.push(`${rd(st.last.show)} ${st.per}${st.last.e.store ? ` en ${st.last.e.store}` : ''} · ${ago(st.last.e.day, today)}`);
    if (st.cheapest && st.last.e.store && st.cheapest.store !== st.last.e.store && st.cheapest.show < st.last.show) lines.push(`Más barato en ${st.cheapest.store}: ${rd(st.cheapest.show)}`);
    if (st.change3 != null && Math.abs(st.change3) >= 0.05) { lines.push(`${st.change3 > 0 ? 'Subió' : 'Bajó'} ${Math.round(Math.abs(st.change3) * 100)} % en 3 meses`); if (st.change3 > 0) tone = 'vit'; }
  } else lines.push('Sin precios anotados todavía');
  const inList = sh.items.some((i) => !i.done && i.key === prod.key);
  const pan = sh.pantry.find((x) => x.key === prod.key) || null;
  if (pan) lines.push(pan.level === 'ok' ? 'En casa: hay' : pan.level === 'low' ? 'En casa: queda poco' : 'En casa: se acabó');
  if (inList) lines.push('Está en tu lista');
  return { type: 'producto', key: prod.key, name: prod.name, title: prod.name, lines, tone: inList ? 'good' : tone, inList, pantry: pan ? pan.level : null, hasPrice: !!st.last, icon: 'cart', verb: inList ? '' : 'A la lista' };
}

// La tarjeta para un código leído. `raw`: lo que trae el código; `kind`: 'qr' | 'barras' | 'nfc'.
export function lensCard(s, raw, kind, today, nowMin = null) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const tag = findTag(s, text);
  if (tag && !tag.unknown) {
    const st = tagStatus(s, tag, today, nowMin);
    return { type: 'etiqueta', id: tag.id, title: st.title, lines: [st.line, tag.where].filter(Boolean), tone: st.tone, icon: st.icon, verb: st.can ? st.verb : '', done: st.done };
  }
  if (tag && tag.unknown) return { type: 'nueva', id: tag.id, title: 'Etiqueta sin configurar', lines: ['Todavía no hace nada en este teléfono'], tone: 'xp', icon: 'nfc', verb: 'Configurar' };
  if (isProductCode(text) && kind !== 'nfc') {
    const name = shopOf(s).codes[text];
    if (name) return { ...productCard(s, name, today), code: text };
    return { type: 'buscar', code: text, title: 'Producto', lines: ['Buscando su nombre…'], tone: 'muted', icon: 'cart', verb: '' };
  }
  if (isTagUrl(text)) return null;
  return { type: 'codigo', code: text.slice(0, 200), title: kind === 'nfc' ? 'Etiqueta NFC' : 'Código', lines: ['Puedes ligarlo a una acción de Astra'], tone: 'ink', icon: kind === 'nfc' ? 'nfc' : 'scan', verb: 'Ligar' };
}

// Guarda el nombre de un producto para su código (la próxima vez sale sin internet).
export function rememberCode(s, code, name) {
  const c = String(code || '').trim(); const n = String(name || '').trim().slice(0, 60);
  if (!/^\d{6,14}$/.test(c) || n.length < 2) return false;
  const sh = shopOf(s);
  sh.codes[c] = n;
  const keys = Object.keys(sh.codes);
  if (keys.length > 300) delete sh.codes[keys[0]];
  return true;
}

// «A la lista» desde la Lente.
export function lensToList(s, name, today) {
  const prod = productFor(name);
  return addShopItems(s, [{ name: prod.name, key: prod.key, aisle: prod.aisle }], { by: 'lente', today });
}

// Suaviza la posición de una tarjeta entre un cuadro y el siguiente (para que no tiemble).
export function follow(prev, box, k = 0.45) {
  if (!prev) return { ...box };
  return { x: prev.x + (box.x - prev.x) * k, y: prev.y + (box.y - prev.y) * k, w: prev.w + (box.w - prev.w) * k, h: prev.h + (box.h - prev.h) * k };
}

// De coordenadas del video a coordenadas de la pantalla (el video se muestra recortado para llenar: «cover»).
export function toScreen(box, video, view) {
  const scale = Math.max(view.w / video.w, view.h / video.h);
  const ox = (view.w - video.w * scale) / 2; const oy = (view.h - video.h * scale) / 2;
  return { x: box.x * scale + ox, y: box.y * scale + oy, w: box.w * scale, h: box.h * scale };
}
