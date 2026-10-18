// Tablas legibles para la hoja «Base de datos de Astra» (o los CSV de la carpeta Tablas).
// Se rehacen en cada sincronización a partir de los datos. No incluyen el expediente ni tus claves.
import {
  AREA, CHORE_XP, EXERCISE_TYPES, INFLUENCES, MOOD_QUADS, SLEEP_QUALITY, SLEEP_ROUTINE, WIN_SCOPES, WIN_TYPES,
} from './content.js';
import {
  accountLabel, catName, choreStatus, freqLabel, repeatLabel, todoCategory, txCur, txDOP, txKind, txOrig, txRate,
} from './logic.js';

const KIND = { gasto: 'Gasto', ingreso: 'Ingreso', transfer: 'Entre cuentas' };
const label = (list, key, k = 'key') => (list.find((x) => x[k] === key) || {}).label || '';
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
// Evita que una nota que empieza con «=» se lea como fórmula.
const cell = (v) => (v == null ? '' : typeof v === 'number' ? v : /^[=+\-@]/.test(String(v)) ? `'${v}` : String(v));
const table = (head, rows) => [head, ...rows].map((r) => r.map(cell));

export function buildTables(s, today) {
  const accounts = (s.money && s.money.accounts) || [];
  const acc = (id) => accountLabel(accounts.find((a) => a.id === id));
  const tx = [...((s.money && s.money.tx) || [])].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : String(b.time || '').localeCompare(String(a.time || '')))).slice(0, 5000);
  const days = Object.keys(s.health || {}).sort().reverse().slice(0, 730);
  const dayKeys = Object.keys(s.days || {}).sort().reverse();
  const innKeys = Object.keys(s.inn || {}).sort().reverse();
  return {
    Movimientos: table(
      ['Fecha', 'Hora', 'Tipo', 'Monto RD$', 'Moneda', 'Monto original', 'Tasa', 'Categoría', 'Comercio', 'Cuenta', 'Etiqueta', 'Nota'],
      tx.map((t) => [t.day, t.time || '', KIND[txKind(t)] || '', round2(txDOP(t)), txCur(t), round2(txOrig(t)), txCur(t) === 'USD' ? round2(txRate(s, t)) : '', catName(s, t.cat), t.merchant || '', acc(t.account), t.tag || '', t.note || '']),
    ),
    Pendientes: table(
      ['Pendiente', 'Categoría', 'Para', 'Importante', 'Estado', 'Se repite', 'Nota'],
      (s.todos || []).map((t) => [t.title, todoCategory(s, t.cat).name, t.due || '', t.important ? 'Sí' : '', t.done ? `Hecho el ${t.done}` : 'Pendiente', t.repeat ? repeatLabel(t.repeat) : t.chore ? 'Rutina del hogar' : '', t.note || '']),
    ),
    Hogar: table(
      ['Rutina', 'Frecuencia', 'Minutos', 'Atributo', 'Próxima vez', 'Última vez', 'Veces hecha', 'Estado'],
      (s.chores || []).map((c) => {
        const st = choreStatus(s, c, today);
        return [c.title, freqLabel(c.freq), c.mins || CHORE_XP.base, c.attr && AREA[c.attr] ? AREA[c.attr].attr : 'Nivel', c.paused ? '' : st.due || '', st.last || '', (c.log || []).length, c.paused ? 'En pausa' : st.state === 'late' ? 'Atrasada' : 'Activa'];
      }),
    ),
    Salud: table(
      ['Fecha', 'Sueño (horas)', 'Me acosté', 'Me levanté', 'Calidad', 'Pasos', 'Agua (vasos)', 'Ejercicio (min)', 'Tipo de ejercicio'],
      days.map((d) => {
        const h = s.health[d] || {};
        const types = Object.entries(h.exTypes || {}).map(([k, v]) => `${label(EXERCISE_TYPES, k)} ${v}`).join(', ');
        return [d, h.sleep ?? '', h.bed || '', h.wake || '', h.quality ? label(SLEEP_QUALITY, h.quality, 'v') : '', h.steps ?? '', h.water ?? '', h.exercise ?? '', types];
      }),
    ),
    Logros: table(
      ['Fecha', 'Ámbito', 'Tipo', 'Logro', 'Impacto', 'Habilidades', 'Evidencia'],
      (s.wins || []).map((w) => [w.day, label(WIN_SCOPES, w.scope), label(WIN_TYPES, w.type), w.title, w.impact || '', (w.skills || []).join(', '), w.evidence || '']),
    ),
    Ánimo: table(
      ['Fecha', 'Hora', 'Estado', 'Palabras', 'Qué influyó', 'Nota'],
      (s.moods || []).slice(0, 2000).map((m) => [m.day, m.ts ? new Date(m.ts).toTimeString().slice(0, 5) : '', (MOOD_QUADS[m.quad] || {}).label || '', (m.words || []).join(', '), (m.influences || []).map((k) => label(INFLUENCES, k)).join(', '), m.note || '']),
    ),
    Posada: table(
      ['Fecha', 'Cómo terminó el día', 'Lo que salió bien', 'Para mejorar', 'Me acuesto', 'Me levanto', 'Rutina para dormir'],
      innKeys.map((d) => {
        const x = s.inn[d] || {};
        return [d, x.mood || '', x.good || '', x.better || '', x.bed || '', x.wake || '', (x.routine || []).map((k) => label(SLEEP_ROUTINE, k)).join(', ')];
      }),
    ),
    Días: table(
      ['Fecha', 'Misiones hechas', 'Pendientes hechos', 'XP', 'Oro', 'Vitalidad al cierre'],
      dayKeys.map((d) => {
        const x = s.days[d] || {};
        return [d, Object.keys(x.done || {}).length, x.todos || 0, x.xp || 0, x.gold || 0, x.vitEnd ?? ''];
      }),
    ),
  };
}

const csvCell = (v) => { const t = String(v == null ? '' : v); return /[",;\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
export const toCSV = (rows) => `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}`;
