import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Nav, Segs, Bar, Bolts, Avatar, AreaDot, TChip, Stepper, toast, useHour, areaColor, areaSoft, dueLabel } from '../ui/kit.jsx';
import { TodoRow, doneText } from './Todos.jsx';
import { RecordAlertsNote } from './Record.jsx';
import { act, useApp } from '../app/store.js';
import { go } from '../app/router.js';
import { fmtDay } from '../app/dates.js';
import { AREA, TIPS } from '../game/content.js';
import {
  playerLevel, className, energyInfo, statuses, dayMissions, isDone, completeMission, undoMission, slipMission,
  missionXP, nextBestAction, activeCampaigns, campaignProgress, currentChapter, logHealth, inRecovery, autoLabel,
  usePotion, fmtHours, bossHP, todosDue, pendingTodos, completeTodo, todoCategory,
} from '../game/logic.js';

export function Home() {
  const s = useApp();
  const hour = useHour();
  const today = s.energy.day;
  const lvl = playerLevel(s.xp);
  const en = energyInfo(s, today);
  const sts = statuses(s, today);
  const { pending, done, avoid } = dayMissions(s, today);
  const planned = pending.reduce((a, m) => a + m.cost, 0);
  const nba = nextBestAction(s, today, hour);
  const camps = activeCampaigns(s);
  const noSleep = s.health[today]?.sleep == null;
  const dueTodos = todosDue(s, today);
  const openTodos = pendingTodos(s).length;

  const toggle = (m) => act((st, t, ev) => {
    if (isDone(st, m, t)) undoMission(st, m.id, t);
    else completeMission(st, m.id, t, ev);
  });

  return (
    <>
      <main class="screen">
        <header class="between-c">
          <div class="stack-xs">
            <span class="small muted semi">{fmtDay(today)}</span>
            <h1 class="h1">{greeting(hour)}, {s.profile.name.split(' ')[0] || 'aventurero'}</h1>
          </div>
          <div class="row" style={{ gap: 8 }}>
            <a class="chip tone-xp" href="#/tienda" style={{ textDecoration: 'none', minHeight: 36, padding: '0 12px' }} aria-label={`${s.gold} de oro: abrir la tienda`}><Icon name="coin" size={16} />{s.gold}</a>
            <a href="#/personaje" aria-label="Tu personaje" style={{ display: 'flex' }}><Avatar name={s.profile.name} size={44} /></a>
          </div>
        </header>

        {inRecovery(s, today) && (
          <a class="note tone-vit" href="#/recuperacion" style={{ textDecoration: 'none' }}>
            <Icon name="heart" size={20} fill />
            <span class="grow"><b>Modo recuperación.</b> Misiones cortas que devuelven vitalidad. No pierdes nada.</span>
            <Icon name="right" size={18} />
          </a>
        )}

        <StatusCard s={s} lvl={lvl} en={en} sts={sts} />

        {noSleep && hour < 15 && <SleepPrompt goal={s.profile.sleepGoal} />}

        {nba && !(nba.kind === 'sleep') && <BestMove nba={nba} s={s} today={today} />}

        <RecordAlertsNote />

        <div class="row" style={{ minHeight: 56, padding: '0 6px 0 0', borderRadius: 20, border: '1.5px solid var(--line-2)', background: 'var(--surface)' }}>
          <a href="#/registrar" class="row grow" style={{ alignSelf: 'stretch', padding: '0 4px 0 18px', textDecoration: 'none', color: 'var(--muted)' }}>
            <span class="grow semi">Cuéntame qué hiciste…</span>
            <Icon name="mic" size={20} />
          </a>
          <a href="#/recibo" class="icon-btn" aria-label="Escanear un recibo"><Icon name="camera" size={20} /></a>
        </div>

        {camps.map((c) => {
          const boss = s.bosses.find((b) => b.id === c.bossId);
          const ch = currentChapter(c);
          return (
            <a key={c.id} href={`#/camino?c=${c.id}`} class="row" style={{ gap: 14, textDecoration: 'none', color: 'var(--ink)' }}>
              <span class="tile" style={{ background: areaSoft(c.area), color: areaColor(c.area) }}><Icon name="map" /></span>
              <span class="stack-sm grow">
                <span class="between"><span class="strong">{c.title}</span><span class="small muted semi">{ch < c.chapters.length ? `Cap. ${ch + 1} de ${c.chapters.length + 1}` : `Jefe ${Math.round(bossHP(boss) * 100)} %`}</span></span>
                <Bar value={campaignProgress(s, c)} color={areaColor(c.area)} label={`Campaña ${Math.round(campaignProgress(s, c) * 100)} %`} />
              </span>
              <Icon name="right" size={18} />
            </a>
          );
        })}
        {!camps.length && (
          <a href="#/meta/nueva" class="note" style={{ textDecoration: 'none' }}><Icon name="map" size={20} /><span class="grow">Elige una meta para empezar una campaña con jefe final.</span><Icon name="right" size={18} /></a>
        )}

        <section class="stack-xs" aria-label="Plan de hoy">
          <div class="between">
            <h2 class="eyebrow">Plan de hoy</h2>
            <span class="row small strong" style={{ gap: 10 }}>
              <span class="row" style={{ gap: 3, color: planned > en.left ? 'var(--vit-ink)' : 'var(--ene-ink)' }} aria-label={`Tu plan pide ${planned} de energía y tienes ${en.left}`}>pide <Icon name="bolt" size={13} fill />{planned} de {en.left}</span>
              <a class="link-btn muted" href="#/misiones" style={{ minHeight: 28, fontSize: 13 }}>Todas<Icon name="right" size={14} /></a>
            </span>
          </div>
          {!pending.length && !done.length && (
            <div class="empty" style={{ marginTop: 8 }}>
              <Icon name="plus" size={24} />
              <span>Todavía no tienes misiones para hoy.</span>
              <a class="btn sm" href="#/mision/nueva">Agregar misión</a>
            </div>
          )}
          <div>
            {pending.map((m) => <MissionRow key={m.id} m={m} done={false} onToggle={() => toggle(m)} />)}
            {done.map((m) => <MissionRow key={m.id} m={m} done onToggle={() => toggle(m)} />)}
          </div>
          {planned > en.left && pending.length > 0 && (
            <p class="small" style={{ color: 'var(--vit-ink)', paddingTop: 6 }}>Tu plan pide más energía de la que tienes. Toma una poción o deja algo para mañana.</p>
          )}
        </section>

        {dueTodos.length > 0 ? (
          <section class="stack-xs" aria-label="Pendientes para hoy">
            <div class="between">
              <h2 class="eyebrow">Pendientes para hoy</h2>
              <a class="link-btn muted" href="#/pendientes" style={{ minHeight: 28, fontSize: 13 }}>Ver todos · {openTodos}<Icon name="right" size={14} /></a>
            </div>
            <div>{dueTodos.slice(0, 5).map((t) => <TodoRow key={t.id} s={s} t={t} today={today} />)}</div>
            {dueTodos.length > 5 && <a class="link-btn muted" href="#/pendientes">y {dueTodos.length - 5} más para hoy</a>}
          </section>
        ) : openTodos > 0 && (
          <a href="#/pendientes" class="row" style={{ gap: 12, minHeight: 52, padding: '0 16px', borderRadius: 18, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', textDecoration: 'none' }}>
            <Icon name="list" size={20} /><span class="grow semi">{openTodos === 1 ? '1 pendiente, nada vence hoy' : `${openTodos} pendientes, nada vence hoy`}</span><Icon name="right" size={18} />
          </a>
        )}

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

        <a href="#/posada" class="row" style={{ gap: 14, padding: 16, borderRadius: 20, background: 'var(--emocional-soft)', color: 'var(--emocional-ink)', textDecoration: 'none' }}>
          <span class="tile" style={{ background: 'var(--surface)', color: 'var(--emocional)' }}><Icon name="moon" /></span>
          <span class="stack-xs grow"><span class="strong">{s.inn[today] ? 'Ya descansaste en la posada' : 'Cierra el día en la posada'}</span><span class="small">{s.inn[today] ? 'Puedes editar tu cierre de hoy.' : 'Repasa tu día y recupera +5 de vitalidad.'}</span></span>
          <Icon name="right" size={18} />
        </a>

        <p class="small muted" style={{ textAlign: 'center', padding: '0 12px' }}>{TIPS[Number(today.slice(-2)) % TIPS.length]}</p>
      </main>
      <Nav active="hoy" />
    </>
  );
}

function greeting(h) {
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

function StatusCard({ s, lvl, en, sts }) {
  return (
    <a href="#/personaje" class="card" aria-label="Estado de tu personaje" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
      <div class="between-c">
        <span class="strong small">Nivel {lvl.n} · {className(s.profile.classKeys)}</span>
        <span class="row small strong muted" style={{ gap: 2 }}>Estado<Icon name="right" size={16} /></span>
      </div>
      <div class="stack-sm">
        <div class="between small strong"><span class="row" style={{ gap: 6, color: 'var(--vit-ink)' }}><Icon name="heart" size={15} fill />Vitalidad</span><span class="tab-num">{s.vit} / 100</span></div>
        <Segs value={s.vit / 10} color="var(--vit)" label={`Vitalidad ${s.vit} de 100`} />
      </div>
      <div class="stack-sm">
        <div class="between small strong"><span class="row" style={{ gap: 6, color: 'var(--ene-ink)' }}><Icon name="bolt" size={15} fill />Energía</span><span class="tab-num">{en.left} / 10</span></div>
        <Segs value={en.left} color="var(--ene)" label={`Energía ${en.left} de 10`} />
      </div>
      <div class="stack-xs">
        <div class="between tiny strong muted"><span>Experiencia</span><span class="tab-num">{lvl.into.toLocaleString('en-US')} / {lvl.need.toLocaleString('en-US')}</span></div>
        <Bar value={lvl.progress} color="var(--xp)" label={`Experiencia ${Math.round(lvl.progress * 100)} %`} />
      </div>
      {(sts.length > 0 || s.streak.count > 0) && (
        <div class="chips" style={{ gap: 6 }}>
          {sts.map((x) => <span key={x.id} class={`chip sm tone-${x.tone}`}><Icon name={x.icon} size={13} />{x.label}</span>)}
          {s.streak.count > 0 && !sts.some((x) => x.id === 'racha') && <span class="chip sm tone-xp"><Icon name="flame" size={13} />Racha {s.streak.count}</span>}
        </div>
      )}
    </a>
  );
}

function SleepPrompt({ goal }) {
  const [h, setH] = useState(goal);
  return (
    <section class="card" aria-label="Sueño de anoche">
      <div class="row-top">
        <span class="tile" style={{ background: 'var(--ene-soft)', color: 'var(--ene)' }}><Icon name="moon" /></span>
        <div class="stack-xs grow"><span class="strong">¿Cuánto dormiste anoche?</span><span class="small muted">Define tu energía de hoy. {fmtHours(goal)} la llenan.</span></div>
      </div>
      <Stepper value={h} onChange={setH} step={0.5} min={0} max={14} format={fmtHours} label="Horas de sueño" />
      <button type="button" class="btn sm block" onClick={() => {
        act((st, t, ev) => logHealth(st, t, { sleep: h }, t, ev));
        toast(h >= goal ? 'Energía llena para hoy' : 'Energía del día ajustada a tu sueño', 'bolt');
      }}>Guardar</button>
    </section>
  );
}

function BestMove({ nba, s, today }) {
  let title = '';
  let sub = '';
  let action = null;
  if (nba.kind === 'mission') {
    const m = nba.mission;
    title = m.title;
    sub = `+${missionXP(m)} XP de ${AREA[m.area].attr}${m.penalty ? ' · si la saltas pierdes vitalidad' : ''}.`;
    const AUTO_ROUTE = { steps: '/area/salud', sleep: '/area/salud', tx: '/finanzas', mood: '/animo', contact: '/personas', focus: '/enfoque' };
    action = m.auto
      ? <a class="btn sm" href={`#${AUTO_ROUTE[m.auto.metric] || '/'}`}><Icon name="plus" size={18} />Registrar</a>
      : <button type="button" class="btn sm" onClick={() => act((st, t, ev) => completeMission(st, m.id, t, ev))}><Icon name="check" size={18} />Hecha</button>;
    if (m.auto) sub = `${autoLabel(m)}. +${missionXP(m)} XP de ${AREA[m.area].attr}.`;
  } else if (nba.kind === 'todo') {
    const t = nba.todo;
    const cat = todoCategory(s, t.cat);
    title = t.title;
    sub = `Pendiente de ${cat.name} · ${dueLabel(t.due, today).toLowerCase()}.`;
    action = <button type="button" class="btn sm" onClick={() => { const r = act((st, d, ev) => completeTodo(st, t.id, d, ev)); if (r) toast(doneText(r), 'check'); }}><Icon name="check" size={18} />Hecho</button>;
  } else if (nba.kind === 'potion') {
    title = 'Tu energía está baja';
    sub = 'Una siesta corta o una pausa sin pantalla te recargan.';
    action = <button type="button" class="btn sm" onClick={() => act((st, t, ev) => usePotion(st, 'pausa', t, ev))}>Pausa sin pantalla (+1)</button>;
  } else if (nba.kind === 'inn') {
    title = 'Cierra el día en la posada';
    sub = 'Repasa lo bueno y recupera vitalidad.';
    action = <a class="btn sm" href="#/posada">Ir a la posada</a>;
  } else if (nba.kind === 'person') {
    title = `Escríbele a ${nba.person.name}`;
    sub = 'Hace rato que no hablan.';
    action = <a class="btn sm" href="#/personas">Ver</a>;
  } else if (nba.kind === 'recovery') {
    title = 'Empieza tu recuperación';
    sub = 'Tres misiones cortas que devuelven vitalidad.';
    action = <a class="btn sm" href="#/recuperacion">Ver misiones</a>;
  }
  return (
    <section class="card" aria-label="Tu mejor jugada" style={{ borderColor: 'var(--ink)' }}>
      <span class="row eyebrow" style={{ gap: 6, color: 'var(--ink)' }}><Icon name="sparkle" size={15} />Tu mejor jugada ahora</span>
      <div class="stack-xs"><span class="h2">{title}</span><span class="small muted">{sub}</span></div>
      <div class="row">{action}</div>
    </section>
  );
}

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
