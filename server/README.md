# Lector de recibos de Astra (servidor opcional)

Astra puede leer recibos con IA de tres formas. Este servidor es la más segura para uso diario, porque tu clave de API queda guardada en el servidor y no en el teléfono.

| Forma | Dónde vive la clave | Cuándo usarla |
|---|---|---|
| Vista previa dentro de Claude | No hace falta clave | Para probar la app |
| **Este servidor** (Cloudflare Worker) | En Cloudflare, como secreto | Para el uso diario |
| Clave en Ajustes | En el navegador del teléfono | Solo en un teléfono que es tuyo |

## Qué hace

1. Recibe la foto del recibo desde Astra (ya reducida y sin datos de ubicación).
2. La envía a la API de Claude junto con las instrucciones de lectura.
3. Devuelve a la app los datos: comercio, RNC, e-NCF, fecha, subtotal, ITBIS, total, categoría y artículos.

No guarda fotos ni datos. Solo acepta peticiones desde el dominio de tu app y con tu token.

## Publicarlo gratis en Cloudflare (sin programar)

1. Crea una cuenta en https://dash.cloudflare.com.
2. Ve a **Workers & Pages → Create → Create Worker**, ponle de nombre `astra-lector` y pulsa **Deploy**.
3. Pulsa **Edit code**, borra lo que hay, pega el contenido de `worker.js` y pulsa **Deploy**.
4. En **Settings → Variables and Secrets** agrega:
   - `ANTHROPIC_API_KEY` (tipo *Secret*): tu clave de https://console.anthropic.com.
   - `APP_TOKEN` (tipo *Secret*): una contraseña larga inventada por ti.
   - `ALLOWED_ORIGIN` (tipo *Text*): `https://apgbit.github.io`.
5. Copia la dirección del worker (algo como `https://astra-lector.tu-usuario.workers.dev`).
6. En Astra: **Personaje → Ajustes → Lectura con IA → Servidor propio**. Pega la dirección y el token.

## Con la terminal (opcional)

```bash
cd server
npx wrangler deploy
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put APP_TOKEN
```

## Costo

Cloudflare Workers tiene un plan gratuito amplio. La API de Claude cobra por uso: una foto de recibo consume pocos tokens. Revisa los precios actuales en https://www.anthropic.com/pricing.
