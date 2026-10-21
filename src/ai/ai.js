// IA opcional de Astra: lee recibos y frases libres.
// Orden de proveedores: dentro de Claude (vista previa) → tu servidor propio → tu clave de API en este teléfono.
import { toNumber } from '../game/parse.js';
import { CATEGORIES } from '../game/content.js';

let samplePromise = null;

export function claudeSample() {
  if (typeof window === 'undefined' || !window.claude || typeof window.claude.use !== 'function') return Promise.resolve(null);
  if (!samplePromise) samplePromise = Promise.resolve(window.claude.use('sample')).catch(() => null);
  return samplePromise;
}

export async function aiProvider(settings, { needImages = false } = {}) {
  const mode = settings.aiMode || 'auto';
  if (mode === 'off') return null;
  if (mode === 'auto') {
    const sample = await claudeSample();
    if (sample) {
      if (!needImages) return { kind: 'claude', sample };
      const lim = await sample.limits().catch(() => null);
      if (lim && lim.images) return { kind: 'claude', sample };
    }
  }
  if ((mode === 'auto' || mode === 'server') && settings.serverUrl) return { kind: 'server', url: settings.serverUrl.replace(/\/+$/, ''), token: settings.serverToken || '' };
  if ((mode === 'auto' || mode === 'key') && settings.aiKey) return { kind: 'api', key: settings.aiKey, model: settings.aiModel || 'claude-sonnet-5-5' };
  return null;
}

export function providerLabel(p) {
  if (!p) return 'Sin IA';
  return { claude: 'Claude (vista previa)', server: 'Tu servidor', api: 'Tu clave de API' }[p.kind];
}

function parseLoose(text) {
  try { return JSON.parse(text); } catch { /* sigue */ }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* sigue */ } }
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch { /* sigue */ } }
  throw { code: 'invalid_json', message: 'La respuesta no se pudo leer.' };
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function httpError(res) {
  const code = res.status === 401 || res.status === 403 ? 'bad_key' : res.status === 429 ? 'rate_limited' : 'upstream_error';
  return { code, message: `Error ${res.status}` };
}

// Llama a la IA con una instrucción y, si hace falta, una imagen. Devuelve JSON.
export async function aiJSON(provider, prompt, { image = null, signal, task = 'texto' } = {}) {
  if (!provider) throw { code: 'no_ai' };
  if (provider.kind === 'claude') {
    return provider.sample.json(prompt, { images: image || undefined, signal, cache: false });
  }
  const img = image ? { data: await blobToBase64(image), mediaType: image.type || 'image/jpeg' } : null;
  let res;
  try {
    if (provider.kind === 'server') {
      res = await fetch(`${provider.url}/leer`, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', ...(provider.token ? { authorization: `Bearer ${provider.token}` } : {}) },
        body: JSON.stringify({ task, prompt, image: img }),
      });
    } else {
      const content = [];
      if (img) content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } });
      content.push({ type: 'text', text: `${prompt}\n\nResponde únicamente con un objeto JSON válido.` });
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': provider.key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model: provider.model, max_tokens: 2000, messages: [{ role: 'user', content }] }),
      });
    }
  } catch (e) {
    if (e && e.name === 'AbortError') throw { code: 'cancelled' };
    throw { code: 'network', message: 'Sin conexión con el servicio de IA.' };
  }
  if (!res.ok) throw await httpError(res);
  const data = await res.json();
  if (provider.kind === 'server') return data;
  const text = (data.content || []).map((c) => c.text || '').join('');
  return parseLoose(text);
}

export function aiErrorText(e) {
  const code = e && e.code;
  if (code === 'cancelled') return '';
  if (code === 'no_ai') return 'La lectura con IA no está configurada. Actívala en Ajustes o llena los datos a mano.';
  if (code === 'not_granted') return 'No se dio permiso para usar la IA en esta vista.';
  if (code === 'rate_limited') return 'La IA recibió demasiadas solicitudes. Prueba en un momento.';
  if (code === 'bad_key') return 'La clave o el token no son válidos. Revísalos en Ajustes.';
  if (code === 'network') return 'Sin conexión con el servicio de IA.';
  if (code === 'image_rejected') return 'La foto no se pudo usar. Prueba con otra más nítida.';
  if (code === 'images_unavailable') return 'Esta vista no puede enviar fotos a la IA.';
  if (code === 'invalid_json') return 'La IA respondió algo que no pude leer. Inténtalo otra vez.';
  return 'La IA no respondió. Inténtalo de nuevo.';
}

// ---------- Recibos ----------

export async function prepareImage(file, maxSide = 1600) {
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bmp = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
  const w = bmp.width;
  const h = bmp.height;
  const k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  return { blob, bitmap: bmp, width: c.width, height: c.height };
}

// Código QR de factura electrónica (e-CF): lee sus datos si el navegador puede.
export async function readQR(bitmap) {
  try {
    if (!('BarcodeDetector' in window)) return null;
    const det = new window.BarcodeDetector({ formats: ['qr_code'] });
    const codes = await det.detect(bitmap);
    if (!codes || !codes.length) return null;
    return parseQRData(codes[0].rawValue);
  } catch {
    return null;
  }
}

export function parseQRData(raw) {
  const out = { raw };
  let params;
  try { params = new URL(raw).searchParams; } catch { return out; }
  for (const [k, v] of params.entries()) {
    const key = k.toLowerCase();
    if (/rnc.?emisor/.test(key)) out.rnc = v;
    else if (/^e?ncf$|encf/.test(key)) out.ncf = v;
    else if (/monto.?total|^total$/.test(key)) out.total = toNumber(v);
    else if (/fecha.?emision/.test(key)) {
      const m = v.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
      if (m) out.day = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
  }
  return out;
}

const SPEND = CATEGORIES.filter((c) => c.type === 'gasto');
const CAT_IDS = SPEND.filter((c) => !['deuda', 'ahorro', 'terceros', 'familia'].includes(c.id)).map((c) => `${c.id} (${c.name})`).join(', ');
const INCOME_IDS = CATEGORIES.filter((c) => c.type === 'ingreso').map((c) => c.id).join('|');

export function receiptPrompt() {
  return `Eres un asistente contable en República Dominicana. La imagen es un recibo o factura de compra, o un comprobante de transferencia o de pago (por ejemplo, una captura de la app del banco).
Extrae los datos tal como aparecen; no inventes nada. Si un dato no se ve, usa null.
- "tipo": "recibo" si es una factura o recibo de compra; "transferencia" si es un comprobante de transferencia o de pago.
- Montos como números sin símbolos ni separadores de miles (ej. 1500.50).
- ITBIS es el impuesto (normalmente 18 %). "Ley" o "propina legal" es el 10 % de servicio.
- NCF o e-NCF es el comprobante fiscal (ej. B0100000123 o E310000000123). RNC es el número del comercio.
- Fecha en formato AAAA-MM-DD.
- En un comprobante: el beneficiario (a quién se envió), el banco de destino, los últimos 4 dígitos de la cuenta de origen y de destino, la referencia o número de confirmación, el concepto, la comisión y el impuesto (DGII, 0.15 % o 0.20 %) si aparecen. "pago_de": "tarjeta" si es el pago de una tarjeta de crédito, "servicio" si es una factura de luz, agua, teléfono o internet, "prestamo" si es la cuota de un préstamo, "tercero" si es una transferencia a otra persona.
- En un recibo, elige la categoría más probable entre: ${CAT_IDS}.
Devuelve JSON con esta forma:
{"tipo": "recibo" o "transferencia", "comercio": "texto", "rnc": "texto o null", "ncf": "texto o null", "fecha": "AAAA-MM-DD o null", "hora": "HH:MM o null", "subtotal": número o null, "itbis": número o null, "propina": número o null, "total": número, "moneda": "DOP" o "USD", "metodo_pago": "efectivo, tarjeta, transferencia o null", "tarjeta_ultimos4": "texto o null", "categoria": "id", "articulos": [{"descripcion": "texto", "total": número}], "beneficiario": "texto o null", "banco_destino": "texto o null", "cuenta_origen_ultimos4": "texto o null", "cuenta_destino_ultimos4": "texto o null", "referencia": "texto o null", "concepto": "texto o null", "comision": número o null, "impuesto": número o null, "pago_de": "tarjeta, servicio, prestamo, tercero o null", "dudas": ["nombres de campos que no se leen con seguridad"]}
Incluye como máximo 25 artículos.`;
}

const l4 = (v) => (String(v || '').match(/(\d{4})\s*$/) || [])[1] || '';
export function checkReceipt(r) {
  const out = {
    kind: r.tipo === 'transferencia' ? 'transferencia' : 'recibo',
    merchant: String(r.comercio || '').slice(0, 60),
    rnc: r.rnc || '',
    ncf: r.ncf || '',
    day: /^\d{4}-\d{2}-\d{2}$/.test(r.fecha || '') ? r.fecha : null,
    time: r.hora || '',
    subtotal: Number(r.subtotal) || null,
    itbis: Number(r.itbis) || 0,
    tip: Number(r.propina) || 0,
    total: Number(r.total) || 0,
    currency: r.moneda === 'USD' ? 'USD' : 'DOP',
    method: r.metodo_pago || '',
    last4: r.tarjeta_ultimos4 || '',
    cat: SPEND.some((c) => c.id === r.categoria) ? r.categoria : 'otros',
    items: Array.isArray(r.articulos) ? r.articulos.slice(0, 25).map((a) => ({ desc: String(a.descripcion || '').slice(0, 60), total: Number(a.total) || 0 })) : [],
    doubts: new Set(Array.isArray(r.dudas) ? r.dudas.map(String) : []),
  };
  if (out.kind === 'transferencia') {
    const pay = ['tarjeta', 'servicio', 'prestamo', 'tercero'].includes(r.pago_de) ? r.pago_de : 'tercero';
    Object.assign(out, {
      payKind: pay, toName: String(r.beneficiario || '').slice(0, 60), toBank: String(r.banco_destino || '').slice(0, 40),
      fromLast4: l4(r.cuenta_origen_ultimos4), toLast4: l4(r.cuenta_destino_ultimos4), cardLast4: pay === 'tarjeta' ? l4(r.cuenta_destino_ultimos4 || r.tarjeta_ultimos4) : '',
      ref: String(r.referencia || '').slice(0, 40), concept: String(r.concepto || '').slice(0, 80), fee: Number(r.comision) || 0, tax: Number(r.impuesto) || 0,
    });
    out.cat = pay === 'tarjeta' ? 'pago_tarjeta' : pay === 'prestamo' ? 'deuda' : pay === 'servicio' ? out.cat : 'terceros';
    out.merchant = pay === 'tarjeta' ? 'Pago de tarjeta' : pay === 'servicio' ? out.merchant : out.toName || out.merchant || 'Transferencia';
  }
  if (out.kind === 'recibo' && out.subtotal != null && out.total) {
    const sum = out.subtotal + out.itbis + out.tip;
    if (Math.abs(sum - out.total) > 1) out.doubts.add('total');
  }
  if (!out.total) out.doubts.add('total');
  if (!out.day) out.doubts.add('fecha');
  return out;
}

// ---------- Frases libres (cuando el analizador sin conexión no entiende) ----------

export function capturePrompt(text, people, today = '') {
  return `Interpreta lo que una persona en República Dominicana cuenta sobre su día y conviértelo en registros para una app de hábitos.
Frase: """${String(text).slice(0, 1500)}"""
Personas conocidas: ${people.map((p) => p.name).join(', ') || 'ninguna'}.${today ? `\nHoy es ${today}.` : ''}
Tipos posibles:
- {"kind":"tx","type":"gasto" o "ingreso","amount":número,"currency":"DOP" o "USD" (USD si dice dólares, US$ o USD),"cat":"${SPEND.map((c) => c.id).join('|')}" (gastos) o "${INCOME_IDS}" (ingresos),"merchant":"texto"}
- {"kind":"health","field":"steps|sleep|water|exercise","value":número} (sueño en horas, ejercicio en minutos)
- {"kind":"pages","value":número}
- {"kind":"contact","name":"nombre"}
- {"kind":"mood","quad":0-3,"word":"emoción"} (0 tenso, 1 animado, 2 bajo, 3 tranquilo)
- {"kind":"focus","minutes":número}
- {"kind":"todo","title":"lo que tiene pendiente, sin la fecha","due":"AAAA-MM-DD o null","important":true o false,"repeat":"semana|mes|ano o null","cat":"general|salud|emocional|relaciones|crecimiento|finanzas|laborales"} (cosas que tiene que hacer: «tengo que», «hay que», «no olvidar»; repeat si dice «cada mes», «cada semana»…)
- {"kind":"note","text":"texto"}
Devuelve JSON: {"items": [ ... ]}`;
}
