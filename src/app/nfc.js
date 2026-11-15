// Etiquetas NFC (2.0). Solo Chrome en Android deja escribirlas desde una página; en los demás teléfonos
// se usa el código QR. Una etiqueta escrita abre Astra en su dirección (…#/t/abc123) con solo acercar el
// teléfono, aunque la app esté cerrada: eso lo hace Android, no hace falta permiso para leerla.

export const nfcSupported = () => typeof window !== 'undefined' && 'NDEFReader' in window;

export function nfcErrorText(err) {
  const n = err && err.name;
  if (n === 'AbortError') return '';
  if (n === 'NotAllowedError') return 'No diste permiso para usar NFC, o está apagado en los ajustes del teléfono.';
  if (n === 'NotSupportedError') return 'Este teléfono no tiene NFC o está apagado.';
  if (n === 'NotReadableError') return 'No pude leer la etiqueta. Acércala de nuevo a la parte de atrás del teléfono.';
  if (n === 'NetworkError') return 'La etiqueta se alejó antes de terminar. Mantenla pegada al teléfono un segundo.';
  return 'No pude escribir la etiqueta. Puede estar protegida o ser de otro tipo.';
}

// Escribe la dirección en la próxima etiqueta que se acerque. Se cancela con `signal`.
export async function writeNfc(url, signal) {
  const reader = new window.NDEFReader();
  await reader.write({ records: [{ recordType: 'url', data: url }] }, { signal, overwrite: true });
  return true;
}

// Lee etiquetas mientras la app está abierta: `onRead(texto)` con la dirección o el texto que traiga.
export async function scanNfc(onRead, signal) {
  const reader = new window.NDEFReader();
  await reader.scan({ signal });
  reader.onreading = (e) => {
    const dec = new TextDecoder();
    for (const rec of e.message.records) {
      if (rec.recordType === 'url' || rec.recordType === 'text' || rec.recordType === 'absolute-url') {
        try { onRead(dec.decode(rec.data)); return; } catch { /* registro que no es texto */ }
      }
    }
    onRead(`nfc:${e.serialNumber || ''}`);
  };
  return reader;
}
