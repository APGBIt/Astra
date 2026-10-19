// Tablas legibles para la hoja «Base de datos de Astra» (o los CSV de la carpeta Tablas).
// Se rehacen en cada sincronización a partir de los datos. No incluyen el expediente ni tus claves.
import {
  ACCOUNT_KINDS, AREA, CHORE_XP, EXERCISE_TYPES, INFLUENCES, MOOD_QUADS, SLEEP_QUALITY, SLEEP_ROUTINE, WIN_SCOPES, WIN_TYPES,
} from './content.js';
import { addDays } from '../app/dates.js';
import { balances, cardInfo, fundInfo, isCard, isFundPlan, moneyAccount, planDates, planFreqLabel, planStatus } from './money.js';
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
  const bal = s.money ? balances(s) : {};
  const plans = (s.money && s.money.plans) || [];
  return {
    Movimientos: table(
      ['Fecha', 'Hora', 'Tipo', 'Monto RD$', 'Moneda', 'Monto original', 'Tasa', 'Categoría', 'Comercio', 'Cuenta', 'Hacia', 'Etiqueta', 'Nota'],
      tx.map((t) => [t.day, t.time || '', KIND[txKind(t)] || '', round2(txDOP(t)), txCur(t), round2(txOrig(t)), txCur(t) === 'USD' ? round2(txRate(s, t)) : '', catName(s, t.cat), t.merchant || '', acc(t.account), txKind(t) === 'transfer' && t.to ? acc(t.to) : '', t.tag || '', t.note || '']),
    ),
    // Saldos de hoy. En una tarjeta, el saldo en negativo es lo que debes.
    Cuentas: table(
      ['Cuenta', 'Tipo', 'Saldo RD$', 'Saldo US$', 'Saldo desde', 'Límite RD$', 'Límite US$', 'Día de corte', 'Día de pago', 'Por pagar RD$', 'Por pagar US$', 'Pagar antes del', 'Nota'],
      accounts.filter((a) => !a.hidden).map((a) => {
        const kind = `${label(ACCOUNT_KINDS, a.kind)}${a.save ? ' (ahorro)' : ''}`;
        const own = moneyAccount(s, a.id);
        if (own && own.id !== a.id) return [accountLabel(a), kind, '', '', '', '', '', '', '', '', '', '', `Usa el saldo de ${accountLabel(own)}`];
        const b = bal[a.id] || { DOP: 0, USD: 0 };
        const row = [accountLabel(a), kind, round2(b.DOP), round2(b.USD), a.base ? a.base.day : ''];
        if (!isCard(a)) return [...row, '', '', '', '', '', '', '', a.base ? '' : 'Sin saldo inicial: solo suma lo registrado'];
        const ci = cardInfo(s, a, today, bal);
        const c = ci.cycle;
        return [...row, ci.limit.DOP || '', ci.limit.USD || '', a.cut || '', a.due || '', c ? ci.toPay.DOP : '', c ? ci.toPay.USD : '', c && c.due ? c.due : '', 'En negativo: lo que debes'];
      }),
    ),
    // Pagos y cobros programados, con su próxima fecha y, en los pagos de cada cierto tiempo, lo apartado.
    Pagos: table(
      ['Pago o cobro', 'Tipo', 'Monto', 'Moneda', 'Aproximado', 'Frecuencia', 'Próxima fecha', 'Atrasado desde', 'Categoría', 'Cuenta', 'Apartado RD$', 'Estado'],
      plans.map((p) => {
        const next = p.paused ? '' : planDates(p, today, addDays(today, 800))[0] || '';
        const late = p.paused ? '' : planDates(p, addDays(today, -35), addDays(today, -1)).find((d) => planStatus(p, d, today) === 'late') || '';
        const fund = isFundPlan(p) ? fundInfo(s, p, today) : null;
        return [p.name, p.kind === 'ingreso' ? 'Cobro' : 'Pago', round2(p.amount), p.currency === 'USD' ? 'USD' : 'DOP', p.variable ? 'Sí' : '', planFreqLabel(p), next, late, catName(s, p.cat), acc(p.account), fund ? round2(fund.saved) : '', p.paused ? 'En pausa' : next || late ? 'Activo' : 'Terminado'];
      }),
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
