// Código del conector propio (Google Apps Script). Cada persona lo instala en SU Drive: así sus datos
// quedan en su cuenta y la app no necesita ningún servidor. Se copia desde la app o desde conector.gs.
export const CONNECTOR_VERSION = 1;

export const CONNECTOR_CODE = `/**
 * Conector de Astra para tu Google Drive (versión 1).
 *
 * Guarda tus datos y tus fotos de Astra en la carpeta «Astra» de TU Drive.
 * Solo tu app de Astra, con su clave, puede leer o escribir aquí. Este código no envía nada a nadie más.
 *
 * Instalación (una vez, mejor desde una computadora):
 * 1. Pega este código en el editor (borra lo que había) y guarda (ícono del disquete).
 * 2. Implementar → Nueva implementación → ⚙ Tipo: «Aplicación web».
 * 3. Ejecutar como: «Yo». Quién tiene acceso: «Cualquier usuario».
 * 4. Implementar → Autorizar acceso → elige tu cuenta → «Configuración avanzada» → «Ir a … (no seguro)» → Permitir.
 *    Google lo marca así porque es un script tuyo que Google no ha revisado.
 * 5. Copia la «URL de la aplicación web» y pégala en Astra → Ajustes → Sincronización → Conector propio.
 *
 * Si algún día pierdes la clave (por ejemplo, cambias de teléfono sin el código de enlace),
 * ejecuta aquí la función reiniciarClave y vuelve a conectar desde Astra.
 */

var VERSION = 1;
var DATOS = 'astra-datos.json';
var HOJA = 'Base de datos de Astra';

function doGet() {
  return salida({ ok: true, app: 'astra-conector', v: VERSION, mensaje: 'El conector de Astra funciona. Copia la dirección de esta página y pégala en Astra.' });
}

function doPost(e) {
  var b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return salida({ ok: false, error: 'formato' }); }
  var props = PropertiesService.getScriptProperties();
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var clave = props.getProperty('CLAVE');
    if (!clave) {
      // La primera app que se conecta fija la clave; después todas deben enviarla.
      if (b.op !== 'hola' || !b.clave || String(b.clave).length < 20) return salida({ ok: false, error: 'clave' });
      props.setProperty('CLAVE', String(b.clave));
    } else if (b.clave !== clave) {
      return salida({ ok: false, error: 'clave' });
    }
    if (b.op === 'hola') return salida({ ok: true, v: VERSION, carpeta: carpeta().getName(), url: carpeta().getUrl(), cuenta: Session.getEffectiveUser().getEmail(), estado: estado() });
    if (b.op === 'estado') return salida(Object.assign({ ok: true }, estado()));
    if (b.op === 'leer') return salida(Object.assign({ ok: true, data: leer() }, estado()));
    if (b.op === 'guardar') return salida(guardar(b));
    if (b.op === 'foto') return salida(subirFoto(b));
    if (b.op === 'leerFoto') return salida(leerFoto(b));
    if (b.op === 'borrarFoto') return salida(borrarFoto(b));
    return salida({ ok: false, error: 'op' });
  } catch (err) {
    return salida({ ok: false, error: String((err && err.message) || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function salida(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// Carpeta «Astra»: la de esta hoja si el script está dentro de ella; si no, una carpeta «Astra» tuya (o una nueva).
function carpeta() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CARPETA');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = null;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) { var ps = DriveApp.getFileById(ss.getId()).getParents(); if (ps.hasNext()) f = ps.next(); }
  } catch (e) {}
  if (!f) {
    var yo = Session.getEffectiveUser().getEmail();
    var it = DriveApp.getFoldersByName('Astra');
    while (it.hasNext()) { var c = it.next(); try { if (c.getOwner() && c.getOwner().getEmail() === yo) { f = c; break; } } catch (e) {} }
    if (!f) f = DriveApp.createFolder('Astra');
  }
  props.setProperty('CARPETA', f.getId());
  return f;
}

function sub(nombre, padre) {
  var p = padre || carpeta();
  var it = p.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : p.createFolder(nombre);
}

function archivoDatos() {
  var it = carpeta().getFilesByName(DATOS);
  return it.hasNext() ? it.next() : null;
}

function estado() {
  var p = PropertiesService.getScriptProperties();
  return { rev: Number(p.getProperty('REV') || 0), updated: p.getProperty('UPDATED') || null, device: p.getProperty('DEVICE') || null };
}

function leer() {
  var f = archivoDatos();
  return f ? f.getBlob().getDataAsString('UTF-8') : null;
}

function guardar(b) {
  var st = estado();
  if (b.expect !== null && b.expect !== undefined && Number(b.expect) !== st.rev) return { ok: false, conflicto: true, rev: st.rev };
  var texto = String(b.data || '');
  if (!texto) return { ok: false, error: 'vacio' };
  var f = archivoDatos();
  if (f) f.setContent(texto); else carpeta().createFile(DATOS, texto, 'application/json');
  var rev = st.rev + 1;
  var ahora = new Date().toISOString();
  PropertiesService.getScriptProperties().setProperties({ REV: String(rev), UPDATED: ahora, DEVICE: String(b.device || '') });
  respaldo(texto);
  if (b.tablas) { try { tablas(b.tablas); } catch (e) {} }
  return { ok: true, rev: rev, updated: ahora };
}

// Una copia por día en «Respaldos»; se guardan los últimos 30 días.
function respaldo(texto) {
  var r = sub('Respaldos');
  var dia = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var nombre = 'astra-' + dia + '.json';
  var it = r.getFilesByName(nombre);
  if (it.hasNext()) it.next().setContent(texto); else r.createFile(nombre, texto, 'application/json');
  var todos = [];
  var all = r.getFiles();
  while (all.hasNext()) todos.push(all.next());
  todos.sort(function (a, b) { return a.getName() < b.getName() ? 1 : -1; });
  todos.slice(30).forEach(function (x) { x.setTrashed(true); });
}

function hoja() {
  try { var activa = SpreadsheetApp.getActiveSpreadsheet(); if (activa) return activa; } catch (e) {}
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('HOJA');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
  var it = carpeta().getFilesByName(HOJA);
  var ss;
  if (it.hasNext()) ss = SpreadsheetApp.open(it.next());
  else { ss = SpreadsheetApp.create(HOJA); DriveApp.getFileById(ss.getId()).moveTo(carpeta()); }
  props.setProperty('HOJA', ss.getId());
  return ss;
}

// Tablas legibles: Astra las rehace en cada sincronización (no las edites a mano).
function tablas(t) {
  var ss = hoja();
  Object.keys(t).forEach(function (nombre) {
    var filas = t[nombre];
    if (!filas || !filas.length) return;
    var sh = ss.getSheetByName(nombre);
    if (!sh) { sh = ss.insertSheet(nombre); sh.getRange(1, 1, 1, filas[0].length).setFontWeight('bold'); sh.setFrozenRows(1); }
    sh.clearContents();
    sh.getRange(1, 1, filas.length, filas[0].length).setValues(filas);
  });
  var vacia = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (vacia && ss.getSheets().length > 1 && vacia.getLastRow() === 0) ss.deleteSheet(vacia);
}

function dentroDe(file, folder) {
  var ps = file.getParents();
  while (ps.hasNext()) {
    var p = ps.next();
    if (p.getId() === folder.getId()) return true;
    var up = p.getParents();
    while (up.hasNext()) if (up.next().getId() === folder.getId()) return true;
  }
  return false;
}

function subirFoto(b) {
  var fotos = sub('Fotos');
  var destino = b.kind ? sub(String(b.kind), fotos) : fotos;
  var blob = Utilities.newBlob(Utilities.base64Decode(b.b64), b.mime || 'image/jpeg', b.name || ('foto-' + b.id + '.jpg'));
  var f = destino.createFile(blob);
  if (b.desc) f.setDescription(String(b.desc));
  return { ok: true, fileId: f.getId() };
}

function leerFoto(b) {
  var f = DriveApp.getFileById(b.fileId);
  if (!dentroDe(f, sub('Fotos'))) return { ok: false, error: 'fuera' };
  var blob = f.getBlob();
  return { ok: true, mime: blob.getContentType(), b64: Utilities.base64Encode(blob.getBytes()) };
}

function borrarFoto(b) {
  try { var f = DriveApp.getFileById(b.fileId); if (dentroDe(f, sub('Fotos'))) f.setTrashed(true); } catch (e) {}
  return { ok: true };
}

// Para usar desde el editor si perdiste la clave: la próxima app que se conecte fija una nueva.
function reiniciarClave() {
  PropertiesService.getScriptProperties().deleteProperty('CLAVE');
  Logger.log('Listo. Vuelve a conectar desde Astra con la dirección del conector.');
}
`;
