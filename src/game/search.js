// Buscador universal (2.0): un solo lugar para llegar a cualquier pantalla, hacer algo o encontrar un dato.
// Astra tiene más de cincuenta pantallas; nadie debería tener que recordar dónde está cada cosa.
// Es puro: recibe lo escrito y devuelve resultados ordenados, cada uno con a dónde lleva.
import { pendingTodos, accountLabel, txDOP, txKind, catName } from './logic.js';
import { shopOf } from './shop.js';
import { plusOf } from './plus.js';

export const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Las pantallas, con las palabras con que alguien las buscaría.
export const PLACES = [
  ['Hoy', '/', 'home', 'inicio dia principal'],
  ['Centro de mando', '/mando', 'compass', 'copiloto plan del dia siguiente paso que hago'],
  ['Gemelo digital', '/mando?ver=gemelo', 'layers', 'pronostico simulador que pasa si sistemas indice de vida futuro proyeccion'],
  ['Alertas tempranas', '/mando?ver=alertas', 'radar', 'riesgos avisos prediccion'],
  ['Tablero Lean', '/mando?ver=lean', 'gauge', 'oee desperdicios muda kaizen mejora eficiencia productividad'],
  ['Mundo físico', '/mando?ver=mundo', 'nfc', 'etiquetas nfc qr sensores bluetooth pulso camara'],
  ['Automatizaciones', '/mando?ver=reglas', 'wand', 'reglas automatico si pasa esto'],
  ['Lente', '/lente', 'scan', 'realidad aumentada camara escanear codigo qr barras'],
  ['Registrar', '/registrar', 'mic', 'anotar dictar contar captura rapida'],
  ['Pendientes', '/pendientes', 'list', 'tareas por hacer lista to do'],
  ['Nuevo pendiente', '/pendientes/nuevo', 'plus', 'agregar tarea crear'],
  ['Misiones', '/misiones', 'sword', 'habitos rutinas diarias'],
  ['Nueva misión', '/mision/nueva', 'plus', 'crear habito agregar'],
  ['Camino', '/camino', 'map', 'campaña capitulos metas jefe'],
  ['Áreas', '/areas', 'grid', 'areas de la vida'],
  ['Finanzas', '/finanzas', 'wallet', 'dinero resumen disponible plata'],
  ['Movimientos', '/finanzas?tab=movimientos', 'swap', 'gastos ingresos transacciones historial'],
  ['Nuevo movimiento', '/finanzas?nuevo=1', 'plus', 'anotar gasto ingreso transferencia pago'],
  ['Plan del mes', '/finanzas?tab=plan', 'calendar', 'presupuesto pagos fijos cobros'],
  ['Cuentas', '/finanzas?tab=cuentas', 'bank', 'bancos tarjetas saldos ahorros'],
  ['Deudas', '/finanzas?tab=deudas', 'percent', 'prestamos tarjetas debo me deben cuotas'],
  ['Análisis de gastos', '/finanzas?tab=analisis', 'chart', 'estadisticas categorias graficas'],
  ['Escanear un recibo', '/recibo', 'receipt', 'foto factura comprobante'],
  ['Importar movimientos', '/importar', 'upload', 'estado de cuenta excel banco'],
  ['Compras', '/compras', 'cart', 'lista supermercado super mandado'],
  ['Precios', '/compras?ver=precios', 'tag', 'libreta historico canasta cuanto cuesta'],
  ['Despensa', '/compras?ver=despensa', 'box', 'nevera inventario comida que hay'],
  ['Deseos', '/compras?ver=deseos', 'gift', 'antojos quiero comprar espera'],
  ['Hogar', '/hogar', 'home', 'casa limpieza rutinas tareas domesticas'],
  ['Salud', '/area/salud', 'heart', 'agua pasos ejercicio comida medicinas peso'],
  ['¿Cómo amaneciste?', '/area/salud?checkin=1', 'pulse', 'preparacion mañana recuperacion'],
  ['Análisis de laboratorio', '/analiticas', 'flask', 'examenes sangre resultados colesterol glucosa'],
  ['Vitaminas y minerales', '/nutrientes', 'pill', 'suplementos nutrientes guia'],
  ['Ánimo', '/animo', 'face', 'emociones como me siento estado'],
  ['Calma', '/calma', 'moon', 'respirar ansiedad meditacion estres preocupacion'],
  ['Diario', '/diario', 'note', 'escribir reflexion gratitud'],
  ['Personas', '/personas', 'people', 'contactos relaciones amigos familia cumpleaños'],
  ['Aprender', '/aprender', 'book', 'libros lectura tarjetas estudio'],
  ['Enfoque', '/enfoque', 'timer', 'pomodoro concentracion trabajo profundo'],
  ['Metas de crecimiento', '/metas', 'target', 'dejar de hacer habitos malos lograr sueños'],
  ['Logros', '/logros', 'trophy', 'exitos cv curriculum reconocimientos'],
  ['Expediente', '/expediente', 'idcard', 'documentos cedula pasaporte seguro datos personales vencimientos'],
  ['Personaje', '/personaje', 'user', 'nivel atributos perfil avatar'],
  ['Posada: cerrar el día', '/posada', 'bed', 'dormir noche cierre'],
  ['Tienda', '/tienda', 'coin', 'oro recompensas pociones canjear'],
  ['Crónica', '/cronica', 'clock', 'historia semana pasado'],
  ['Informe semanal', '/informe', 'chart', 'progreso resumen semana reporte'],
  ['Palabra del día', '/palabra', 'book', 'vocabulario frase'],
  ['Sincronización', '/sincronizar', 'sync', 'drive google copia nube'],
  ['Ajustes', '/ajustes', 'gear', 'configuracion tema notificaciones copia datos ia'],
  ['Códigos para imprimir', '/etiquetas', 'printer', 'qr etiquetas hoja'],
].map(([title, href, icon, words]) => ({ title, href, icon, n: norm(title), words: norm(words) }));

// Qué tan bien responde un texto a lo buscado (0 = nada). Todas las palabras tienen que aparecer.
export function score(q, title, extra = '') {
  const t = norm(title); const x = norm(extra);
  const words = q.split(' ').filter(Boolean);
  if (!words.length) return 0;
  let total = 0;
  for (const w of words) {
    let best = 0;
    if (t === w) best = 12;
    else if (t.startsWith(w)) best = 9;
    else if (t.split(' ').some((p) => p.startsWith(w))) best = 7;
    else if (w.length >= 3 && t.includes(w)) best = 4;
    else if (x.split(' ').some((p) => p.startsWith(w))) best = 3;
    else if (w.length >= 4 && x.includes(w)) best = 1;
    if (!best) return 0;
    total += best;
  }
  return total / words.length + (t === q ? 5 : 0);
}

const rd = (v) => `RD$${Math.round(v).toLocaleString('en-US')}`;

// Los resultados de una búsqueda. Devuelve grupos: [{ key, title, items: [{ title, sub, href, icon }] }].
export function searchAll(s, text, today, { max = 6 } = {}) {
  const q = norm(text);
  if (q.length < 2) return [];
  const groups = [];
  const add = (key, title, rows) => {
    const items = rows.filter((r) => r.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, max);
    if (items.length) groups.push({ key, title, top: items[0].sc, items });
  };

  add('ir', 'Ir a', PLACES.map((p) => ({ sc: Math.max(score(q, p.title), score(q, '', p.words) ? score(q, '', p.words) : 0), title: p.title, sub: '', href: p.href, icon: p.icon })));

  add('pendientes', 'Pendientes', pendingTodos(s).map((t) => ({ sc: score(q, t.title, t.note), title: t.title, sub: t.due ? (t.due < today ? 'Atrasado' : t.due === today ? 'Para hoy' : `Para el ${t.due.slice(8)}/${t.due.slice(5, 7)}`) : 'Sin fecha', href: `/pendientes/${t.id}`, icon: 'list' })));

  add('misiones', 'Misiones', (s.missions || []).filter((m) => !m.archived).map((m) => ({ sc: score(q, m.title), title: m.title, sub: m.kind === 'habit' ? 'Hábito' : m.kind === 'avoid' ? 'Evitar' : 'Una vez', href: `/misiones/${m.id}`, icon: 'sword' })));

  add('hogar', 'Hogar', (s.chores || []).map((c) => ({ sc: score(q, c.title, c.note), title: c.title, sub: c.paused ? 'En pausa' : 'Rutina de la casa', href: `/hogar?r=${c.id}`, icon: 'home' })));

  add('personas', 'Personas', (s.people || []).map((p) => ({ sc: score(q, p.name, p.note), title: p.name, sub: p.last ? `Último contacto: ${p.last.slice(8)}/${p.last.slice(5, 7)}` : 'Sin contacto anotado', href: '/personas', icon: 'people' })));

  const sh = shopOf(s);
  const prods = new Map();
  for (const i of sh.items) if (!i.done) prods.set(i.key, { title: i.name, sub: 'En tu lista de compras', href: '/compras', icon: 'cart' });
  for (const p of sh.pantry) if (!prods.has(p.key)) prods.set(p.key, { title: p.name, sub: p.level === 'ok' ? 'En tu despensa: hay' : p.level === 'low' ? 'En tu despensa: queda poco' : 'En tu despensa: se acabó', href: '/compras?ver=despensa', icon: 'box' });
  for (const e of sh.prices || []) if (!prods.has(e.key)) prods.set(e.key, { title: e.name, sub: 'Tiene precios anotados', href: '/compras?ver=precios', icon: 'tag' });
  add('compras', 'Compras', [...prods.values()].map((p) => ({ ...p, sc: score(q, p.title) })));

  const money = s.money || {};
  add('cuentas', 'Cuentas y deudas', [
    ...(money.accounts || []).filter((a) => !a.archived).map((a) => ({ sc: score(q, a.name, `${a.bank || ''} ${a.last4 || ''}`), title: accountLabel(a), sub: a.kind === 'tarjeta' ? 'Tarjeta' : 'Cuenta', href: '/finanzas?tab=cuentas', icon: a.kind === 'tarjeta' ? 'card' : 'bank' })),
    ...(money.credits || []).map((c) => ({ sc: score(q, c.name), title: c.name, sub: 'Préstamo', href: '/finanzas?tab=deudas', icon: 'percent' })),
    ...(money.plans || []).map((p) => ({ sc: score(q, p.name), title: p.name, sub: 'Pago o cobro del plan', href: '/finanzas?tab=plan', icon: 'calendar' })),
  ]);

  // Movimientos: los más recientes que coincidan (el comercio, la nota o la categoría).
  const txs = [];
  const all = money.tx || [];
  for (let i = 0; i < all.length && txs.length < 40; i++) {
    const t = all[i];
    if (!t || t.parent) continue;
    const sc = score(q, t.merchant || t.note || '', `${t.note || ''} ${catName(s, t.cat)}`);
    if (sc > 0) txs.push({ sc: sc + (t.day || '').localeCompare('2000-01-01') * 0, day: t.day, title: t.merchant || t.note || catName(s, t.cat), sub: `${txKind(t) === 'ingreso' ? '+' : '−'}${rd(txDOP(t))} · ${t.day.slice(8)}/${t.day.slice(5, 7)}/${t.day.slice(2, 4)}`, href: `/finanzas?tab=movimientos&q=${encodeURIComponent(text.trim())}`, icon: 'swap' });
  }
  txs.sort((a, b) => (b.sc - a.sc) || (a.day < b.day ? 1 : -1));
  if (txs.length) groups.push({ key: 'movimientos', title: 'Movimientos', top: txs[0].sc - 2, items: txs.slice(0, 4) });

  add('salud', 'Medicinas y suplementos', (s.meds || []).filter((m) => !m.archived).map((m) => ({ sc: score(q, m.name), title: m.name, sub: (m.times || []).join(' · '), href: '/area/salud', icon: 'pill' })));

  add('metas', 'Metas y caminos', [
    ...(s.campaigns || []).filter((c) => !c.abandoned).map((c) => ({ sc: score(q, c.title), title: c.title, sub: 'Camino', href: `/camino?c=${c.id}`, icon: 'map' })),
    ...(s.bosses || []).filter((b) => !b.defeated).map((b) => ({ sc: score(q, b.title), title: b.title, sub: 'Jefe', href: `/jefe/${b.id}`, icon: 'crown' })),
    ...(((s.growth || {}).targets) || []).map((t) => ({ sc: score(q, t.name), title: t.name, sub: 'Meta', href: '/metas?ver=metas', icon: 'target' })),
  ]);

  add('etiquetas', 'Etiquetas', plusOf(s).tags.map((t) => ({ sc: score(q, t.name, t.where), title: t.name, sub: t.where || 'Etiqueta inteligente', href: '/mando?ver=mundo', icon: 'nfc' })));

  add('expediente', 'Expediente', ((s.record && s.record.sections) || []).map((sec) => ({ sc: score(q, sec.title || sec.name || '', [...(sec.fields || []).map((f) => f.label), ...(sec.items || []).map((it) => it.title || it.name || '')].join(' ')), title: sec.title || sec.name || 'Sección', sub: 'Expediente', href: `/expediente/${sec.id}`, icon: 'idcard' })));

  add('logros', 'Logros', (s.wins || []).map((w) => ({ sc: score(q, w.title, w.note), title: w.title, sub: w.day ? w.day.slice(0, 4) : '', href: '/logros', icon: 'trophy' })));

  groups.sort((a, b) => b.top - a.top);
  return groups.map(({ top, ...g }) => ({ ...g, items: g.items.map(({ sc, ...it }) => it) }));
}

// Con el buscador vacío: los lugares a los que más conviene ir ahora.
export function quickPlaces(hour = 12) {
  const pick = hour < 11 ? ['/mando', '/area/salud?checkin=1', '/pendientes', '/finanzas', '/compras', '/lente']
    : hour < 18 ? ['/mando', '/registrar', '/pendientes', '/finanzas?nuevo=1', '/compras', '/lente']
      : ['/posada', '/mando', '/diario', '/finanzas', '/informe', '/calma'];
  return pick.map((h) => PLACES.find((p) => p.href === h)).filter(Boolean).map(({ title, href, icon }) => ({ title, href, icon, sub: '' }));
}
