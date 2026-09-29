// Astra · lector de recibos con IA (Cloudflare Worker).
// Guarda tu clave de API en el servidor, nunca en el teléfono.
// Variables (Settings → Variables and Secrets):
//   ANTHROPIC_API_KEY  (secreto)  tu clave de la API de Claude
//   APP_TOKEN          (secreto)  una contraseña larga que también pones en Astra → Ajustes → IA
//   ALLOWED_ORIGIN     (texto)    el dominio de tu app, p. ej. https://apgbit.github.io
//   MODEL              (texto, opcional) por defecto claude-sonnet-5-5

const MAX_PROMPT = 8000;
const MAX_IMAGE_B64 = 7 * 1024 * 1024;
const MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function corsHeaders(req, env) {
  const origin = req.headers.get('origin') || '';
  const allowed = String(env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.length === 0 || allowed.includes(origin);
  return {
    ok,
    headers: {
      'access-control-allow-origin': ok ? (origin || '*') : 'null',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-max-age': '86400',
      vary: 'origin',
    },
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function parseLoose(text) {
  try { return JSON.parse(text); } catch { /* sigue */ }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* sigue */ } }
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch { /* sigue */ } }
  return null;
}

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: cors.ok ? 204 : 403, headers: cors.headers });
    const url = new URL(req.url);
    if (req.method !== 'POST' || url.pathname !== '/leer') return json({ error: 'not_found' }, 404, cors.headers);
    if (!cors.ok) return json({ error: 'origin_not_allowed' }, 403, cors.headers);
    if (!env.APP_TOKEN || req.headers.get('authorization') !== `Bearer ${env.APP_TOKEN}`) return json({ error: 'unauthorized' }, 401, cors.headers);
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'server_not_configured' }, 500, cors.headers);

    let body;
    try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400, cors.headers); }
    const task = body.task === 'recibo' ? 'recibo' : 'texto';
    const prompt = String(body.prompt || '').slice(0, MAX_PROMPT);
    if (!prompt) return json({ error: 'empty_prompt' }, 400, cors.headers);
    const content = [];
    if (task === 'recibo') {
      const img = body.image || {};
      if (!img.data || !MEDIA.has(img.mediaType) || img.data.length > MAX_IMAGE_B64) return json({ error: 'bad_image' }, 400, cors.headers);
      content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } });
    }
    content.push({ type: 'text', text: `${prompt}\n\nResponde únicamente con un objeto JSON válido.` });

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: env.MODEL || 'claude-sonnet-5-5', max_tokens: 2000, messages: [{ role: 'user', content }] }),
    });
    if (!res.ok) return json({ error: 'upstream', status: res.status }, res.status === 429 ? 429 : 502, cors.headers);
    const data = await res.json();
    const text = (data.content || []).map((c) => c.text || '').join('');
    const parsed = parseLoose(text);
    if (!parsed) return json({ error: 'invalid_json' }, 502, cors.headers);
    return json(parsed, 200, cors.headers);
  },
};
