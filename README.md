# Astra

Tu vida en modo juego de rol. App web instalable (y futura APK) para crecer en seis áreas de la vida con barras de vitalidad y energía, caminos, misiones y jefes.

## Qué incluye (versión 1.0)

- **Personaje**: nivel, clase según tus caminos (Atleta, Monje, Guardián, Erudito, Mercader, Artesano), seis atributos (Vigor, Temple, Vínculo, Sabiduría, Fortuna, Oficio) y talentos que suman XP.
- **Vitalidad**: tu barra de vida (0–100). Sube al cuidarte y cumplir; baja al fallar misiones marcadas, al caer en malos hábitos o al dormir poco. En 0 entras en **modo recuperación**: no pierdes nada y cada misión devuelve el doble.
- **Energía**: tu presupuesto del día (0–10) según tu sueño. Cada misión cuesta de 1 a 3. Las **pociones** son acciones reales que recargan (siesta, pausa sin pantalla, comida casera, aire libre).
- **Estados**: descansado, cansancio leve, racha encendida, recuperación y en reserva, con efecto en la XP.
- **Caminos y metas**: eliges hasta dos caminos y una meta (plantilla o propia). Se convierte en una campaña con capítulos, tareas y un **jefe final** con barra de vida.
- **Misiones**: hábitos, tareas únicas y malos hábitos a evitar. Se agregan en una línea: la app sugiere atributo, costo de energía y XP. Algunas se completan solas (pasos, sueño, gastos, ánimo, contactos, enfoque).
- **Registrar**: escribe o dicta lo que hiciste («gasté 850 en el súper y caminé 40 minutos») y la app lo convierte en registros.
- **Finanzas**: ingresos, gastos, presupuesto por categoría y dinero por asignar. Tres formas de registrar: recibo con IA (incluye RNC, e-NCF e ITBIS; lee el QR de facturas electrónicas), alerta del banco pegada y entrada manual o por voz.
- **Áreas**: salud (pasos, sueño, agua, ejercicio), ánimo (check-in de dos ejes, patrones, respiración), relaciones (frecuencia por persona, cumpleaños, WhatsApp), crecimiento (libros, tarjetas de repaso, práctica) y enfoque (sesiones que se agrietan si sales de la app, cierre de jornada).
- **Posada** (cierre del día), **Tienda** (recompensas propias con oro, protectores de racha), **Crónica** (semana, gráfico de vitalidad, XP por atributo, logros, títulos).
- Modo claro y oscuro, sin conexión después de la primera visita, copia de seguridad descargable.

## Privacidad

No hay cuentas ni servidores propios. Todo se guarda en el navegador. La IA es opcional y solo recibe la foto de un recibo o el texto que decides enviar. La foto no se guarda.

## Lectura de recibos con IA

En **Personaje → Ajustes → Lectura con IA**:

- **Servidor propio** (recomendado): publica `server/worker.js` en Cloudflare Workers. Instrucciones en [`server/README.md`](server/README.md).
- **Clave en este teléfono**: pega tu clave de la API de Claude (solo en un teléfono que sea tuyo).
- Dentro de la vista previa de Claude funciona sin configurar nada.

## Desarrollo

Requiere Node.js 20 o más reciente.

```bash
npm install
npm run build   # genera dist/, docs/ (GitHub Pages), artifact/ y astra-web.zip
npm test        # pruebas de la lógica del juego y del analizador de texto
```

- `src/game`: reglas del juego (`logic.js`), contenido (`content.js`) y analizador de frases y alertas (`parse.js`).
- `src/ai`: lectura de recibos y frases con IA.
- `src/screens` y `src/ui`: pantallas y componentes (Preact).
- `server`: lector de recibos opcional para Cloudflare Workers.

GitHub Pages publica la carpeta `docs/`. Después de cambiar el código, ejecuta `npm run build` y sube los cambios.

## Camino a la APK

La app ya es instalable desde Chrome. Para la tienda de Android el plan es empaquetarla con Capacitor, lo que además permite leer pasos y sueño de Health Connect y poner widgets en la pantalla de inicio.
