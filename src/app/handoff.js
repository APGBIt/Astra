// Un movimiento a medio llenar que pasa de una pantalla a otra (1.10): por ejemplo, de un comprobante leído
// a la hoja de movimiento de Finanzas. Vive solo en memoria.
let pendingTx = null;
export function setPendingTx(tx) { pendingTx = tx || null; }
export function takePendingTx() { const t = pendingTx; pendingTx = null; return t; }
