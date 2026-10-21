// Tablas legibles para la hoja «Base de datos de Astra» (o los CSV de la carpeta Tablas).
// Se rehacen en cada sincronización a partir de los datos. No incluyen el expediente ni tus claves.
import {
  ACCOUNT_KINDS, AREA, CHORE_XP, EXERCISE_TYPES, INFLUENCES, MOOD_QUADS, SLEEP_QUALITY, SLEEP_ROUTINE, WIN_SCOPES, WIN_TYPES,
} from './content.js';
import { addDays } from '../app/dates.js';
import { balances, cardInfo, fundInfo, isCard, isFundPlan, moneyAccount, planDates, planFreqLabel, planStatus, budgetRows } from './money.js';
import { workInfo, workHours, groupName } from './ledger.js';
import { debtList, payoff, monthAfter } from './debts.js';
import { CALM_KINDS } from './mind.js';
import { WHEEL } from './wellness.js';
import { loanInfo } from './loans.js';
import { dosesFor, medAdherence } from './health.js';
import {
  accountLabel, catName, catOf, choreStatus, freqLabel, repeatLabel, todoCategory, txCur, txDOP, txKind, txOrig, txRate,
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
  const wi = s.money ? workInfo(s, today) : { ready: false };
  const byId = new Map(tx.map((t) => [t.id, t]));
  const mk = today.slice(0, 7);
  const debts = s.money && s.money.debts ? debtList(s, today) : [];
  const dplan = debts.length ? payoff(debts, { extra: s.money.debts.extra, method: s.money.debts.method }) : null;
  return {
    // 1.9: familia, horas de trabajo, si cuenta en el análisis, a qué transferencia va un impuesto y partes de un movimiento dividido.
    Movimientos: table(
      ['Fecha', 'Hora', 'Tipo', 'Monto RD$', 'Moneda', 'Monto original', 'Tasa', 'Categoría', 'Comercio', 'Cuenta', 'Hacia', 'Etiqueta', 'Nota', 'Familia', 'Horas de trabajo', 'Cuenta en el análisis', 'Impuesto o cargo de', 'Parte'],
      tx.map((t) => [
        t.day, t.time || '', KIND[txKind(t)] || '', round2(txDOP(t)), txCur(t), round2(txOrig(t)), txCur(t) === 'USD' ? round2(txRate(s, t)) : '', catName(s, t.cat), t.merchant || '', acc(t.account), txKind(t) === 'transfer' && t.to ? acc(t.to) : '', t.tag || '', t.note || '',
        groupName(catOf(s, t.cat).group), txKind(t) === 'gasto' && wi.ready ? round2(workHours(txDOP(t), wi)) : '', t.noStats ? 'No' : 'Sí',
        t.taxOf && byId.get(t.taxOf) ? `${byId.get(t.taxOf).merchant || catName(s, byId.get(t.taxOf).cat)} (${byId.get(t.taxOf).day})` : '', t.split ? `${t.split.i + 1} de ${t.split.n}` : '',
      ]),
    ),
    // Presupuestos de este mes (por categoría o por toda una familia).
    Presupuestos: table(
      ['Mes', 'Presupuesto', 'De', 'Del mes', 'Sobrante del mes pasado', 'Disponible', 'Gastado', 'Queda', 'Lo que sobra pasa'],
      s.money ? budgetRows(s, mk, today).map((r) => [mk, r.c.name, r.isGroup ? 'Familia' : 'Categoría', round2(r.budget), round2(r.carry), round2(r.avail), round2(r.spent), round2(r.left), r.c.roll ? 'Sí' : '']) : [],
    ),
    // Plan para salir de deudas.
    Deudas: table(
      ['Deuda', 'Tipo', 'Saldo RD$', 'Tasa anual %', 'Pago de cada mes', 'En el plan', 'Terminas', 'Método', 'Extra al mes'],
      debts.map((d) => {
        const o = dplan && dplan.order.find((x) => x.id === d.id);
        return [d.name, d.kind === 'card' ? 'Tarjeta' : 'Préstamo', round2(d.balance), d.apr || '', round2(d.min), d.on === false ? 'No' : 'Sí', o && o.month != null ? monthAfter(today, o.month) : '', s.money.debts.method === 'snowball' ? 'Bola de nieve' : 'Avalancha', round2(s.money.debts.extra)];
      }),
    ),
    // 1.10: lo que te deben y lo que debes a personas.
    Préstamos: table(
      ['Persona', 'Quién debe', 'Monto', 'Moneda', 'Fecha', 'Quedó para', 'Abonado', 'Falta', 'Estado', 'Nota'],
      ((s.money && s.money.loans) || []).map((l) => {
        const i = loanInfo(l, today);
        return [l.who, l.dir === 'me' ? 'Te debe' : 'Le debes', round2(l.amount), l.currency, l.day, l.due || '', round2(i.paid), round2(i.left), l.closed ? (l.forgiven ? 'Perdonado' : 'Saldado') : i.late ? 'Vencido' : 'Abierto', l.note];
      }),
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
    // 1.10: minutos intensos, día de fuerza y medicinas tomadas.
    Salud: table(
      ['Fecha', 'Sueño (horas)', 'Me acosté', 'Me levanté', 'Calidad', 'Pasos', 'Agua (vasos)', 'Ejercicio (min)', 'Tipo de ejercicio', 'Frutas y verduras', 'Minutos intensos', 'Fuerza', 'Medicinas tomadas'],
      days.map((d) => {
        const h = s.health[d] || {};
        const types = Object.entries(h.exTypes || {}).map(([k, v]) => `${label(EXERCISE_TYPES, k)} ${v}`).join(', ');
        const doses = s.meds && s.meds.length ? dosesFor(s, d) : [];
        return [d, h.sleep ?? '', h.bed || '', h.wake || '', h.quality ? label(SLEEP_QUALITY, h.quality, 'v') : '', h.steps ?? '', h.water ?? '', h.exercise ?? '', types, h.veg ?? '',
          h.exVig || '', h.strength || (h.exTypes || {}).gimnasio > 0 ? 'Sí' : '', doses.length ? `${doses.filter((x) => x.status === 'si').length} de ${doses.length}` : ''];
      }),
    ),
    Medicinas: table(
      ['Nombre', 'Dosis', 'Tipo', 'Horas', 'Días', 'Desde', 'Hasta', 'Tomadas en 30 días', 'Nota'],
      (s.meds || []).map((m) => {
        const a = medAdherence(s, m, today);
        return [m.name, m.dose, m.kind === 'suplemento' ? 'Suplemento' : 'Medicina', m.times.join(', '), m.days ? m.days.map((x) => ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][x]).join(', ') : 'Todos', m.start, m.archived || m.end || '', a.pct != null ? `${Math.round(a.pct * 100)} %` : '', m.note];
      }),
    ),
    Logros: table(
      ['Fecha', 'Ámbito', 'Tipo', 'Logro', 'Impacto', 'Habilidades', 'Evidencia'],
      (s.wins || []).map((w) => [w.day, label(WIN_SCOPES, w.scope), label(WIN_TYPES, w.type), w.title, w.impact || '', (w.skills || []).join(', '), w.evidence || '']),
    ),
    Ánimo: table(
      ['Fecha', 'Hora', 'Estado', 'Palabras', 'Qué influyó', 'Dónde lo sentí', 'Nota'],
      (s.moods || []).slice(0, 2000).map((m) => [m.day, m.ts ? new Date(m.ts).toTimeString().slice(0, 5) : '', (MOOD_QUADS[m.quad] || {}).label || '', (m.words || []).join(', '), (m.influences || []).map((k) => label(INFLUENCES, k)).join(', '), (m.body || []).join(', '), m.note || '']),
    ),
    // Sesiones de calma (respiración, meditación, pausas SOS).
    Calma: table(
      ['Fecha', 'Hora', 'Tipo', 'Práctica', 'Minutos', 'Después me sentí'],
      ((s.mind && s.mind.calm) || []).slice(0, 3000).map((c) => [c.day, c.ts ? new Date(c.ts).toTimeString().slice(0, 5) : '', CALM_KINDS[c.kind] || '', c.title || '', c.minutes, c.after ? { mejor: 'Mejor', igual: 'Igual', peor: 'Peor' }[c.after] : '']),
    ),
    // Chequeos de bienestar (OMS-5, 0 a 100) y rueda de la vida (1 a 10 por área). Sin el diario: es solo tuyo.
    Bienestar: table(
      ['Fecha', 'Chequeo', 'Puntaje', 'Detalle'],
      [
        ...((s.mind && s.mind.checks) || []).map((c) => [c.day, 'Bienestar OMS-5', c.score, c.items.join(' · ')]),
        ...((s.mind && s.mind.wheel) || []).map((w) => [w.day, 'Rueda de la vida', Math.round((WHEEL.reduce((a, x) => a + (w.scores[x.id] || 0), 0) / WHEEL.length) * 10) / 10, WHEEL.map((x) => `${x.label} ${w.scores[x.id]}`).join(', ')]),
      ].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0)),
    ),
    // Metas con progreso y lo que quieres lograr. Lo que quieres dejar de hacer no va a las tablas: es solo tuyo.
    Metas: table(
      ['Tipo', 'Meta', 'Área', 'Lleva', 'Meta final', 'Unidad', 'Fecha límite', 'Estado', 'Creada'],
      [
        ...((s.growth && s.growth.targets) || []).map((g) => [
          'Meta con progreso', g.name, (AREA[g.area] || {}).area || '', g.link ? 'según la cuenta' : round2(g.mode === 'sum' ? (g.start || 0) + g.log.reduce((x, l) => x + Number(l.v), 0) : (g.log[0] ? g.log[0].v : g.start)), g.target, g.unit || '', g.due || '', g.done ? `Cumplida el ${g.done}` : g.archived ? 'Archivada' : 'En curso', g.created || '',
        ]),
        ...((s.growth && s.growth.dreams) || []).map((d) => [
          'Por lograr', d.title, (AREA[d.area] || {}).area || '', `${d.steps.filter((x) => x.done).length} de ${d.steps.length} pasos`, '', '', d.due || '', d.done ? `Logrado el ${d.done}` : 'Pendiente', d.created || '',
        ]),
      ],
    ),
    Posada: table(
      ['Fecha', 'Cómo terminó el día', 'Cosas buenas', 'Para mejorar', 'Me acuesto', 'Me levanto', 'Rutina para dormir'],
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
