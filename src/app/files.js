// Guardar un archivo en el teléfono. Dentro de Claude pasa por su propio aviso de descarga.
export async function saveFile(name, data, type = 'application/json') {
  if (typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function') {
    const dl = await Promise.resolve(window.claude.use('downloads')).catch(() => null);
    if (dl) {
      try {
        const r = await dl.save({ filename: name, data });
        return !!(r && r.status === 'saved');
      } catch {
        return false;
      }
    }
  }
  const blob = new Blob([data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return true;
}
