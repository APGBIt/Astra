import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Nav, Segs, Bar, Bolts, Avatar, AreaDot, Sheet, SheetHead, TChip, toast, useHour, areaColor, areaSoft, money, cur } from '../ui/kit.jsx';
import { TodoRow } from './Todos.jsx';
import { RecordAlertsNote, openAlerts } from './Record.jsx';
import { SleepForm, SleepSheet } from './Sleep.jsx';
import { WinPrompt } from './Wins.jsx';
import { DailyCard } from './Word.jsx';
import { TxSheet } from './Finance.jsx';
import { SyncBadge } from './Sync.jsx';
import { both, whenText, payInitial } from './Money.jsx';
import { dueItems } from '../game/money.js';
import { CheckIn } from './Emotions.jsx';
import { CalmPlayer, WorrySheet, ThoughtSheet, runAction } from './Calm.jsx';
import { IntentPrompt } from './Journal.jsx';
import { ReviewPrompt, Who5Prompt } from './Reflect.jsx';
import { reviewDue, wellbeingInfo } from '../game/mind.js';
import { act, useApp } from '../app/store.js';
import { fmtDay, addDays, diffDays } from '../app/dates.js';
import { AREA, MOOD_QUADS } from '../game/content.js';
import {
  playerLevel, className, energyInfo, statuses, dayMissions, isDone, completeMission, undoMission, slipMission,
  missionXP, activeCampaigns, campaignProgress, currentChapter, inRecovery, autoLabel, logHealth, dailyGoal,
  usePotion, fmtHours, bossHP, todosDue, pendingTodos, sortTodos, duePeople, winPromptDue, txKind, txDOP, accountLabel,
} from '../game/logic.js';

// Hoy: lo esencial en una sola pantalla. Un aviso a la vez, registro rápido sin salir de aquí
// y una sola lista con todo lo del día (misiones, pendientes y tareas del hogar), para hacerlo ahí mismo.

const SHOW = 7;

export function Home() {
  const s = useApp();
  const hour = useHour();
  const today = s.energy.day;
  const lvl = playerLevel(s.xp);
  const en = energyInfo(s, today);
  const sts = statuses(s, today);
  const { pending, done, avoid } = dayMissions(s, today);
  const [sheet, setSheet] = useState(null);
  const [more, setMore] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [play, setPlay] = useState(null);
  const [tool, setTool] = useState(null);

  // Primero lo que da más: sin automáticas, las que penalizan, las de tu clase y las más baratas.
  const missions = [...pending].sort((a, b) => ((a.auto ? 1 : 0) - (b.auto ? 1 : 0))
    || (b.penalty - a.penalty)
    || (s.profile.classKeys.includes(b.area) - s.profile.classKeys.includes(a.area))
    || (a.cost - b.cost));
  const todos = sortTodos(todosDue(s, today));
  const items = [...missions.map((m) => ({ kind: 'm', m })), ...todos.map((t) => ({ kind: 't', t }))];
  const doneTodos = s.todos.filter((t) => t.done === today);
  const doneCount = done.length + doneTodos.length;
  const total = items.length + doneCount;
  const planned = pending.reduce((a, m) => a + m.cost, 0);
  const openTodos = pendingTodos(s).length;
  const camps = activeCampaigns(s);
  const toggle = (m) => act((st, t, ev) => (isDone(st, m, t) ? undoMission(st, m.id, t) : completeMission(st, m.id, t, ev)));
  const prompts = homePrompts(s, today, hour, en, pending, (it) => setSheet({ kind: 'pay', initial: payInitial(s, it, today) }));

  return (
    <>
      <main class="screen">
        <header class="between-c">
          <div class="stack-xs">
            <span class="small muted semi">{fmtDay(today)}</span>
            <h1 class="h1">{greeting(hour)}, {s.profile.name.split(' ')[0] || 'aventurero'}</h1>
          </div>
          <div class="row" style={{ gap: 6 }}>
            <SyncBadge />
            <a class="chip tone-xp" href="#/tienda" style={{ textDecoration: 'none', minHeight: 36, padding: '0 12px' }} aria-label={`${s.gold} de oro: abrir la tienda`}><Icon name="coin" size={16} />{s.gold}</a>
            <a href="#/personaje" aria-label="Tu personaje" style={{ display: 'flex' }}><Avatar name={s.profile.name} size={44} /></a>
          </div>
        </header>

        {s.settings.showDaily !== false && <DailyCard today={today} />}

        <StatusCard s={s} lvl={lvl} en={en} sts={sts} />

        {prompts.length > 0 && <PromptSlot prompts={prompts} />}

        <section class="stack-sm" aria-label="Registrar">
          <div class="row" style={{ minHeight: 56, padding: '0 6px 0 0', borderRadius: 20, border: '1.5px solid var(--line-2)', background: 'var(--surface)' }}>
            <a href="#/registrar" class="row grow" style={{ alignSelf: 'stretch', padding: '0 4px 0 18px', textDecoration: 'none', color: 'var(--muted)' }}>
              <span class="grow semi">Cuéntame qué hiciste…</span>
              <Icon name="mic" size={20} />
            </a>
            <a href="#/recibo" class="icon-btn" aria-label="Escanear un recibo"><Icon name="camera" size={20} /></a>
          </div>
          <QuickLog s={s} today={today} onOpen={setSheet} />
        </section>

        <section class="stack-xs" aria-label="Tu día">
          <div class="between-c" style={{ minHeight: 28 }}>
            <h2 class="eyebrow">Tu día{total ? ` · ${doneCount} de ${total}` : ''}</h2>
            {planned > 0 && (
              <span class="row small strong" style={{ gap: 3, color: planned > en.left ? 'var(--vit-ink)' : 'var(--ene-ink)' }} aria-label={`Tus misiones piden ${planned} de energía y tienes ${en.left}`}>
                pide <Icon name="bolt" size={13} fill />{planned} de {en.left}
              </span>
            )}
          </div>
          {total > 0 && <Bar value={doneCount / total} color="var(--good)" label={`${doneCount} de ${total} hechas hoy`} />}
          {!items.length && (
            <div class="empty" style={{ marginTop: 6 }}>
              <Icon name={doneCount ? 'check' : 'sparkle'} size={24} />
              <span>{doneCount ? '¡Todo hecho por hoy! Cierra el día en la posada.' : 'No tienes nada para hoy todavía.'}</span>
              {!doneCount && (
                <span class="row" style={{ gap: 8 }}>
                  <a class="btn sm" href="#/mision/nueva"><Icon name="sword" size={16} />Misión</a>
                  <a class="btn sm soft" href="#/pendientes/nuevo"><Icon name="list" size={16} />Pendiente</a>
                </span>
              )}
            </div>
          )}
          <div>
            {(more ? items : items.slice(0, SHOW)).map((x) => (x.kind === 'm'
              ? <MissionRow key={x.m.id} m={x.m} done={false} onToggle={() => toggle(x.m)} />
              : <TodoRow key={x.t.id} s={s} t={x.t} today={today} />))}
          </div>
          {items.length > SHOW && (
            <button type="button" class="link-btn" style={{ alignSelf: 'flex-start' }} aria-expanded={more ? 'true' : 'false'} onClick={() => setMore(!more)}>
              {more ? 'Ver menos' : `Ver ${items.length - SHOW} más`}<Icon name={more ? 'down' : 'right'} size={15} />
            </button>
          )}
          {planned > en.left && pending.length > 0 && (
            <p class="small" style={{ color: 'var(--vit-ink)' }}>Tus misiones piden más energía de la que tienes. Toma una poción o deja algo para mañana.</p>
          )}
          {doneCount > 0 && (
            <section class="card flush" aria-label="Hechas hoy" style={{ marginTop: 6 }}>
              <button type="button" class="lrow" style={{ minHeight: 52 }} aria-expanded={showDone ? 'true' : 'false'} onClick={() => setShowDone(!showDone)}>
                <span class="grow semi">Hechas hoy · {doneCount}</span><Icon name={showDone ? 'down' : 'right'} size={18} />
              </button>
              {showDone && (
                <div style={{ padding: '0 0 4px' }}>
                  {done.map((m) => <MissionRow key={m.id} m={m} done onToggle={() => toggle(m)} />)}
                  {doneTodos.map((t) => <TodoRow key={t.id} s={s} t={t} today={today} />)}
                </div>
              )}
            </section>
          )}
          <div class="row wrap" style={{ gap: 6, paddingTop: 6 }}>
            <a class="chip" href="#/misiones" style={{ textDecoration: 'none' }}><Icon name="sword" size={14} />Misiones</a>
            <a class="chip" href="#/pendientes" style={{ textDecoration: 'none' }}><Icon name="list" size={14} />Pendientes{openTodos ? ` · ${openTodos}` : ''}</a>
            <a class="chip" href="#/posada" style={{ textDecoration: 'none' }}><Icon name="moon" size={14} />{s.inn[today] ? 'Posada' : 'Cerrar el día'}</a>
            <a class="chip" href="#/calma" style={{ textDecoration: 'none' }}><Icon name="sparkle" size={14} />Calma</a>
            <a class="chip" href="#/diario" style={{ textDecoration: 'none' }}><Icon name="book" size={14} />Diario</a>
          </div>
        </section>

        {avoid.length > 0 && (
          <section class="stack-xs" aria-label="Evitar hoy">
            <h2 class="eyebrow">Evitar hoy</h2>
            <div>
              {avoid.map((m) => {
                const slips = s.days[today]?.slips?.[m.id] || 0;
                return (
                  <div class="mrow" key={m.id}>
                    <span class="tile sm" style={{ background: slips ? 'var(--vit-soft)' : 'var(--good-soft)', color: slips ? 'var(--vit)' : 'var(--good)' }}><Icon name={slips ? 'heart' : 'shield'} size={18} /></span>
                    <a class="body" href={`#/mision/${m.id}`} style={{ textDecoration: 'none' }}>
                      <span class="title">{m.title}</span>
                      <span class="meta"><AreaDot area={m.area} />{AREA[m.area].attr} · {slips ? `Caíste ${slips === 1 ? 'una vez' : `${slips} veces`}` : 'Limpio hoy'}</span>
                    </a>
                    <button type="button" class="btn sm soft" onClick={() => { act((st, t, ev) => slipMission(st, m.id, t, ev)); toast(`−${3 * m.cost} de vitalidad. Mañana es otro día.`, 'heart'); }}>Caí</button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section class="stack-xs" aria-label="Tu camino">
          <div class="between-c"><h2 class="eyebrow">Tu camino</h2><a class="link-btn muted" href="#/camino" style={{ minHeight: 28, fontSize: 13 }}>Ver<Icon name="right" size={14} /></a></div>
          {camps.length ? camps.slice(0, 2).map((c) => {
            const boss = s.bosses.find((b) => b.id === c.bossId);
            const ch = currentChapter(c);
            return (
              <a key={c.id} href={`#/camino?c=${c.id}`} class="row" style={{ gap: 12, minHeight: 52, textDecoration: 'none', color: 'var(--ink)' }}>
                <span class="tile sm" style={{ background: areaSoft(c.area), color: areaColor(c.area) }}><Icon name="map" size={18} /></span>
                <span class="stack-xs grow">
                  <span class="between"><span class="semi">{c.title}</span><span class="tiny muted semi">{ch < c.chapters.length ? `Cap. ${ch + 1} de ${c.chapters.length + 1}` : `Jefe ${Math.round(bossHP(boss) * 100)} %`}</span></span>
                  <Bar value={campaignProgress(s, c)} color={areaColor(c.area)} label={`Campaña ${Math.round(campaignProgress(s, c) * 100)} %`} />
                </span>
              </a>
            );
          }) : (
            <a href="#/meta/nueva" class="note" style={{ textDecoration: 'none', margin: 0 }}><Icon name="map" size={20} /><span class="grow">Elige una meta para empezar una campaña con jefe final.</span><Icon name="right" size={18} /></a>
          )}
          {camps.length > 2 && <a class="link-btn muted" href="#/camino">y {camps.length - 2} más</a>}
        </section>
      </main>
      <Nav active="hoy" />
      {sheet === 'sleep' && <SleepSheet s={s} day={today} today={today} onClose={() => setSheet(null)} />}
      {sheet === 'mood' && <MoodSheet onClose={() => setSheet(null)} onAction={(a) => { setSheet(null); runAction(a, { setPlay, setTool }); }} />}
      {tool === 'descarga' && <WorrySheet onClose={() => setTool(null)} />}
      {tool === 'replantear' && <ThoughtSheet onClose={() => setTool(null)} />}
      {play && <CalmPlayer session={play} onClose={() => setPlay(null)} />}
      {sheet === 'tx' && <TxSheet s={s} initial={{}} onClose={() => setSheet(null)} />}
      {sheet && sheet.kind === 'pay' && <TxSheet s={s} initial={sheet.initial} onClose={() => setSheet(null)} />}
    </>
  );
}

function greeting(h) {
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

// ---------- Estado: vitalidad, energía y XP en una fila ----------

function StatusCard({ s, lvl, en, sts }) {
  const chips = sts.filter((x) => x.id !== 'racha');
  return (
    <a href="#/personaje" class="card status-card" aria-label="Estado de tu personaje" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
      <div class="between-c">
        <span class="strong small">Nivel {lvl.n} · {className(s.profile.classKeys)}</span>
        <span class="row small strong muted" style={{ gap: 6 }}>
          {s.streak.count > 0 && <span class="row" style={{ gap: 3, color: 'var(--xp-ink)' }} aria-label={`Racha de ${s.streak.count} días`}><Icon name="flame" size={14} />{s.streak.count}</span>}
          <Icon name="right" size={16} />
        </span>
      </div>
      <div class="meters">
        <div class="meter">
          <span class="ml" style={{ color: 'var(--vit-ink)' }}><Icon name="heart" size={13} fill />Vitalidad</span>
          <span class="mv tab-num">{s.vit}<span class="tiny muted"> /100</span></span>
          <Bar value={s.vit / 100} color="var(--vit)" label={`Vitalidad ${s.vit} de 100`} />
        </div>
        <div class="meter">
          <span class="ml" style={{ color: 'var(--ene-ink)' }}><Icon name="bolt" size={13} fill />Energía</span>
          <span class="mv tab-num">{en.left}<span class="tiny muted"> /10</span></span>
          <Segs value={en.left} color="var(--ene)" label={`Energía ${en.left} de 10`} />
        </div>
        <div class="meter">
          <span class="ml" style={{ color: 'var(--xp-ink)' }}><Icon name="star" size={13} fill />XP</span>
          <span class="mv tab-num">{Math.round(lvl.progress * 100)}<span class="tiny muted"> %</span></span>
          <Bar value={lvl.progress} color="var(--xp)" label={`Experiencia ${lvl.into} de ${lvl.need} para el nivel ${lvl.n + 1}`} />
        </div>
      </div>
      {chips.length > 0 && <div class="chips" style={{ gap: 6 }}>{chips.map((x) => <span key={x.id} class={`chip sm tone-${x.tone}`}><Icon name={x.icon} size={13} />{x.label}</span>)}</div>}
    </a>
  );
}

// ---------- Un aviso a la vez ----------

function homePrompts(s, today, hour, en, pending, onPay) {
  const out = [];
  if (inRecovery(s, today)) out.push({ key: 'recovery', el: <RecoveryPrompt /> });
  if (s.health[today]?.sleep == null && hour < 15) out.push({ key: 'sleep', el: <SleepPrompt s={s} today={today} /> });
  if (hour >= 5 && hour < 12 && s.mind && !s.mind.intents[today]) out.push({ key: 'intent', el: <IntentPrompt /> });
  const money = moneyDue(s, today);
  if (money.length) out.push({ key: 'money', el: <MoneyPrompt items={money} today={today} onPay={onPay} /> });
  if (en.left <= 1 && pending.length) out.push({ key: 'potion', el: <PotionPrompt /> });
  if (winPromptDue(s, today)) out.push({ key: 'win', el: <WinPrompt /> });
  if (hour >= 18 && !s.inn[today]) out.push({ key: 'inn', el: <InnPrompt /> });
  if (s.mind && reviewDue(s, today, hour)) out.push({ key: 'review', el: <ReviewPrompt /> });
  else if (s.mind && hour >= 17 && wellbeingInfo(s, today).due && (s.profile.created || today) <= addDays(today, -6)) out.push({ key: 'who5', el: <Who5Prompt s={s} today={today} /> });
  if (openAlerts(s, today).length) out.push({ key: 'record', el: <RecordAlertsNote /> });
  const person = duePeople(s, today)[0];
  if (person) out.push({ key: 'person', el: <PersonPrompt p={person.p} /> });
  return out;
}

function PromptSlot({ prompts }) {
  const [i, setI] = useState(0);
  const n = prompts.length;
  const k = i % n;
  const cur = prompts[k];
  return (
    <section class="stack-xs" aria-label="Ahora">
      {n > 1 && (
        <div class="between-c" style={{ minHeight: 24 }}>
          <span class="eyebrow">Ahora</span>
          <button type="button" class="link-btn muted" style={{ minHeight: 32, fontSize: 13 }} onClick={() => setI(k + 1)} aria-label={`Ver el siguiente aviso (${k + 1} de ${n})`}>
            {k + 1} de {n}<Icon name="right" size={14} />
          </button>
        </div>
      )}
      <div key={cur.key}>{cur.el}</div>
    </section>
  );
}

function SleepPrompt({ s, today }) {
  return (
    <section class="card" aria-label="Sueño de anoche">
      <div class="row-top">
        <span class="tile" style={{ background: 'var(--ene-soft)', color: 'var(--ene)' }}><Icon name="moon" /></span>
        <div class="stack-xs grow"><span class="strong">¿Cómo dormiste anoche?</span><span class="small muted">Define tu energía de hoy. {fmtHours(s.profile.sleepGoal || 7)} la llenan.</span></div>
      </div>
      <SleepForm s={s} day={today} today={today} compact />
    </section>
  );
}

function RecoveryPrompt() {
  return (
    <a class="note tone-vit" href="#/recuperacion" style={{ textDecoration: 'none', margin: 0 }}>
      <Icon name="heart" size={20} fill />
      <span class="grow"><b>Modo recuperación.</b> Misiones cortas que devuelven vitalidad. No pierdes nada.</span>
      <Icon name="right" size={18} />
    </a>
  );
}

function PotionPrompt() {
  return (
    <section class="card" aria-label="Energía baja">
      <div class="row-top">
        <span class="tile" style={{ background: 'var(--ene-soft)', color: 'var(--ene)' }}><Icon name="flask" /></span>
        <div class="stack-xs grow"><span class="strong">Tu energía está baja</span><span class="small muted">Una pausa sin pantalla o una siesta corta te recargan.</span></div>
      </div>
      <div class="row">
        <button type="button" class="btn sm grow" onClick={() => { if (act((st, t, ev) => usePotion(st, 'pausa', t, ev))) toast('+1 de energía', 'bolt'); }}>Pausa sin pantalla (+1)</button>
        <a class="btn sm soft" href="#/personaje">Más pociones</a>
      </div>
    </section>
  );
}

function InnPrompt() {
  return (
    <a href="#/posada" class="row" style={{ gap: 14, padding: 16, borderRadius: 20, background: 'var(--emocional-soft)', color: 'var(--emocional-ink)', textDecoration: 'none' }}>
      <span class="tile" style={{ background: 'var(--surface)', color: 'var(--emocional)' }}><Icon name="moon" /></span>
      <span class="stack-xs grow"><span class="strong">Cierra el día en la posada</span><span class="small">Repasa tu día, prepara la noche y recupera +5 de vitalidad.</span></span>
      <Icon name="right" size={18} />
    </a>
  );
}

// Pagos que vencen (o se pasaron) y cobros de hoy: lo de las tarjetas, 3 días antes.
function moneyDue(s, today) {
  return dueItems(s, today, addDays(today, 3), today)
    .filter((it) => !it.estimate && (it.status === 'late' || it.status === 'today' || (it.type === 'card' ? diffDays(today, it.date) <= 3 : it.status === 'soon' && it.kind === 'gasto' && diffDays(today, it.date) <= 1)))
    .sort((a, b) => ((b.status === 'late') - (a.status === 'late')) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function MoneyPrompt({ items, today, onPay }) {
  const it = items[0];
  const card = it.type === 'card';
  const inc = it.kind === 'ingreso';
  const late = it.status === 'late';
  const name = card ? `Tarjeta ${accountLabel(it.a)}` : it.p.name;
  const title = inc ? `¿Ya recibiste ${name.toLowerCase()}?` : late ? `Venció: ${name}` : it.date === today ? `Hoy vence: ${name}` : `${name} vence ${whenText(it.date, today).toLowerCase()}`;
  const amount = card ? both(it.toPay) : `${it.p.variable ? '≈ ' : ''}${inc ? '+' : ''}${cur(it.amount, it.currency)}`;
  const tone = late ? 'vit' : inc ? 'good' : 'finanzas';
  return (
    <div class="row" style={{ gap: 12, padding: 16, borderRadius: 20, background: `var(--${tone}-soft)`, color: `var(--${tone}-ink)` }}>
      <a href="#/finanzas" class="row grow" style={{ gap: 12, color: 'inherit', textDecoration: 'none', minWidth: 0 }}>
        <span class="tile" style={{ background: 'var(--surface)', color: `var(--${tone === 'finanzas' ? 'finanzas' : tone})` }}><Icon name={card ? 'card' : inc ? 'coins' : 'calendar'} /></span>
        <span class="stack-xs grow" style={{ minWidth: 0 }}><span class="strong">{title}</span><span class="small tab-num">{amount}{items.length > 1 ? ` · y ${items.length - 1} más` : ''}</span></span>
      </a>
      <button type="button" class="btn xs" onClick={() => onPay(it)}>{inc ? 'Recibí' : 'Pagar'}</button>
    </div>
  );
}

function PersonPrompt({ p }) {
  return (
    <a href="#/personas" class="row" style={{ gap: 14, padding: 16, borderRadius: 20, background: 'var(--relaciones-soft)', color: 'var(--relaciones-ink)', textDecoration: 'none' }}>
      <span class="tile" style={{ background: 'var(--surface)', color: 'var(--relaciones)' }}><Icon name="people" /></span>
      <span class="stack-xs grow"><span class="strong">Escríbele a {p.name}</span><span class="small">Hace rato que no hablan.</span></span>
      <Icon name="right" size={18} />
    </a>
  );
}

// ---------- Registro rápido: sin salir de Hoy ----------

function QuickLog({ s, today, onOpen }) {
  const h = s.health[today] || {};
  const water = h.water || 0;
  const goal = dailyGoal(s, 'water');
  const mood = s.moods.find((m) => m.day === today);
  const spent = s.money.tx.filter((t) => t.day === today && txKind(t) === 'gasto').reduce((a, t) => a + txDOP(t), 0);
  const addWater = () => { act((st, t, ev) => logHealth(st, t, { water: water + 1 }, t, ev)); toast(`Agua: ${water + 1} de ${goal} vasos`, 'drop'); };
  return (
    <div class="quick-log" role="group" aria-label="Registro rápido">
      <button type="button" class="ql" onClick={addWater} aria-label={`Agua: ${water} de ${goal} vasos. Tocar para sumar un vaso`}>
        <span class="qi" style={{ color: areaColor('salud') }}><Icon name="drop" size={20} /></span>
        <span class="qv">{water}<span class="tiny muted">/{goal}</span></span>
        <span class="ql-l">Agua +1</span>
      </button>
      <button type="button" class="ql" onClick={() => onOpen('sleep')} aria-label={h.sleep != null ? `Sueño: ${fmtHours(h.sleep)}. Tocar para corregir` : 'Registrar el sueño de anoche'}>
        <span class="qi" style={{ color: 'var(--ene)' }}><Icon name="moon" size={20} /></span>
        <span class="qv">{h.sleep != null ? fmtHours(h.sleep) : '—'}</span>
        <span class="ql-l">Sueño</span>
      </button>
      <button type="button" class="ql" onClick={() => onOpen('mood')} aria-label={mood ? `Ánimo de hoy: ${MOOD_QUADS[mood.quad].label}. Tocar para otro check-in` : 'Hacer un check-in de ánimo'}>
        <span class="qi" style={{ color: areaColor('emocional') }}><Icon name="face" size={20} /></span>
        <span class="qv">{mood ? MOOD_QUADS[mood.quad].label : '—'}</span>
        <span class="ql-l">Ánimo</span>
      </button>
      <button type="button" class="ql" onClick={() => onOpen('tx')} aria-label={`Gastos de hoy: ${money(spent)}. Tocar para anotar un gasto`}>
        <span class="qi" style={{ color: areaColor('finanzas') }}><Icon name="receipt" size={20} /></span>
        <span class="qv">{spent ? money(spent, { decimals: 0 }) : '—'}</span>
        <span class="ql-l">Gasto</span>
      </button>
    </div>
  );
}

function MoodSheet({ onClose, onAction }) {
  return (
    <Sheet onClose={onClose} label="¿Cómo te sientes?">
      <SheetHead title="Check-in" onClose={onClose} />
      <CheckIn compact onDone={onClose} onAction={onAction} />
      <a class="link-btn muted" href="#/animo" style={{ alignSelf: 'center' }}>Check-in completo y tus patrones<Icon name="right" size={15} /></a>
    </Sheet>
  );
}

// ---------- Fila de una misión (también en las áreas) ----------

export function MissionRow({ m, done, onToggle }) {
  return (
    <div class={`mrow ${done ? 'done' : ''}`}>
      <button type="button" class="check" aria-pressed={done ? 'true' : 'false'} aria-label={done ? `Desmarcar ${m.title}` : `Completar ${m.title}`} onClick={onToggle}>
        <span>{done && <Icon name="check" size={16} stroke={2.8} />}</span>
      </button>
      <a class="body" href={`#/mision/${m.id}`} style={{ textDecoration: 'none' }}>
        <span class="title">{m.title}</span>
        <span class="meta"><AreaDot area={m.area} />{AREA[m.area].attr}{m.auto ? ' · automática' : ''}{m.penalty && !done ? <span style={{ color: 'var(--vit-ink)' }}> · −{3 * m.cost} si la saltas</span> : ''}</span>
      </a>
      <span class="side">
        <Bolts n={m.cost} color={done ? 'var(--faint)' : undefined} />
        <span class="tiny strong" style={{ color: done ? 'var(--faint)' : 'var(--xp-ink)' }}>+{missionXP(m)} XP</span>
      </span>
    </div>
  );
}

export { autoLabel };
