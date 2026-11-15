// Centro de mando (2.0): el cerebro de Astra. Cuatro vistas sobre lo que ya registras:
// - Copiloto: lo siguiente, el plan del día con horas y la semana repartida.
// - Gemelo: los siete sistemas de tu vida, el pronóstico y «¿qué pasa si…?».
// - Alertas: lo que viene mal, antes de que pase, con cómo evitarlo.
// - Lean: tu OEE, los ocho desperdicios y la mejora de la semana.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { TopBar, ScrollTabs, Ring, Bar, Sheet, SheetHead, Stepper, Empty, toast, useHour, areaColor, areaSoft, areaInk } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { go } from '../app/router.js';
import { addDays, fmtShort, DAYS, weekday } from '../app/dates.js';
import { completeMission, completeTodo, logHealth, fmtClock, addMission } from '../game/logic.js';
import { logDose } from '../game/health.js';
import { SleepSheet } from './Sleep.jsx';
import { nextUp, dayPlan, levelWeek, applyLevel, snooze, setFree } from '../game/copilot.js';
import { systems, lifeIndex, risks, cashOutlook, levelOutlook, vitOutlook, whatIf, setLever, LEVERS, ZONE, RISK_LEVEL, SYSTEM } from '../game/twin.js';
import { oeeTrend, oeeWeek, muda, OEE_PART, MUDA_LEVEL, kaizenRunning, kaizenProgress, kaizenHistory, startKaizen, dropKaizen, kaizenUnit, KAIZEN_DAYS, MUDA } from '../game/lean.js';
import { plusOf } from '../game/plus.js';
import { WorldTab } from './Mundo.jsx';

const TABS = [['copiloto', 'Copiloto'], ['gemelo', 'Gemelo'], ['alertas', 'Alertas'], ['lean', 'Lean'], ['mundo', 'Mundo físico']];
const rd = (v) => `RD$${Math.round(v).toLocaleString('en-US')}`;
const rdK = (v) => (Math.abs(v) >= 1000 ? `${v < 0 ? '−' : ''}RD$${(Math.abs(v) / 1000).toFixed(Math.abs(v) >= 100000 ? 0 : 1).replace(/\.0$/, '')}k` : rd(v));
const pct = (v) => `${Math.round(v * 100)} %`;
const minsText = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}` : `${m} min`);
const toneColor = (tone) => (tone === 'good' ? 'var(--good)' : tone === 'xp' ? 'var(--xp)' : tone === 'vit' ? 'var(--vit)' : 'var(--muted)');
const zoneColor = (z) => (z ? toneColor(ZONE[z].tone) : 'var(--soft-2)');

// Hacer con un toque lo que se puede hacer desde aquí. Devuelve false si hay que abrir otra pantalla.
export function runDo(c, s, today, openSleep) {
  if (!c || !c.do) return false;
  const d = c.do;
  if (d.type === 'mission') { act((st, t, ev) => completeMission(st, d.id, t, ev)); toast('Misión cumplida', 'sword'); return true; }
  if (d.type === 'todo') { act((st, t, ev) => completeTodo(st, d.id, t, ev)); toast('Hecho', 'check'); return true; }
  if (d.type === 'dose') { act((st, t, ev) => logDose(st, today, d.key, 'si', t, ev)); toast('Toma anotada', 'pill'); return true; }
  if (d.type === 'water') { act((st, t, ev) => logHealth(st, today, { water: ((st.health[today] || {}).water || 0) + 1 }, t, ev)); toast('Un vaso más', 'drop'); return true; }
  if (d.type === 'sleep' && openSleep) { openSleep(); return true; }
  return false;
}

export function Mando({ query }) {
  const s = useApp();
  const hour = useHour();
  const today = s.energy.day;
  const [tab, setTab] = useState(() => { const v = query && query.get('ver'); return TABS.some((t) => t[0] === v) ? v : 'copiloto'; });
  // Un enlace a otra vista estando ya aquí (por ejemplo, desde una alerta) cambia de pestaña.
  const want = query ? query.get('ver') : null;
  useEffect(() => { if (want && TABS.some((t) => t[0] === want)) setTab(want); }, [want]);
  const rk = useMemo(() => risks(s, today, { hour }), [s, today, hour]);
  const high = rk.filter((r) => r.level === 'alta').length;
  const tabs = TABS.map(([k, l]) => (k === 'alertas' && rk.length ? [k, `Alertas · ${rk.length}`] : [k, l]));
  return (
    <main class="screen no-nav">
      <TopBar backTo="/" title="Centro de mando" heading />
      <ScrollTabs tabs={tabs} value={tab} onChange={setTab} label="Vistas del centro de mando" sticky />
      {tab === 'copiloto' && <CopilotTab s={s} today={today} hour={hour} high={high} onAlerts={() => setTab('alertas')} />}
      {tab === 'gemelo' && <TwinTab s={s} today={today} />}
      {tab === 'alertas' && <RiskTab s={s} today={today} list={rk} />}
      {tab === 'lean' && <LeanTab s={s} today={today} />}
      {tab === 'mundo' && <WorldTab s={s} today={today} query={query} />}
    </main>
  );
}

// ---------- Copiloto ----------

function Meta({ c }) {
  return (
    <span class="row wrap small muted semi" style={{ gap: 10 }}>
      {c.mins > 0 && <span class="row" style={{ gap: 4 }}><Icon name="clock" size={14} />{minsText(c.mins)}</span>}
      {c.cost > 0 && <span class="row" style={{ gap: 3, color: 'var(--ene-ink)' }}><Icon name="bolt" size={14} fill />{c.cost}</span>}
    </span>
  );
}

function CopilotTab({ s, today, hour, high, onAlerts }) {
  const minute = new Date().getMinutes();
  const [sleep, setSleep] = useState(false);
  const [sheet, setSheet] = useState(null);
  const up = useMemo(() => nextUp(s, today, { hour, minute }), [s, today, hour]);
  const plan = useMemo(() => dayPlan(s, today, { hour, minute }), [s, today, hour]);
  const lw = useMemo(() => levelWeek(s, today), [s, today]);
  const c = up.next;
  const doIt = (x) => { if (!runDo(x, s, today, () => setSleep(true))) go(x.href); };
  const later = (x) => { act((st, t) => snooze(st, x.id, t)); toast('Listo, por hoy no te lo recuerdo', 'clock'); };
  const maxLoad = Math.max(1, ...lw.before.map((d) => Math.max(d.mins, d.cap)));
  return (
    <>
      {c ? (
        <section class="card cp-next" aria-label="Lo siguiente">
          <div class="between-c">
            <span class="eyebrow" style={{ color: areaInk(c.area) }}>Lo siguiente</span>
            <Meta c={c} />
          </div>
          <div class="row-top" style={{ gap: 14 }}>
            <span class="tile lg" style={{ background: areaSoft(c.area), color: areaColor(c.area) }}><Icon name={c.icon} size={26} /></span>
            <div class="stack-xs grow">
              <h2 class="h2" style={{ margin: 0 }}>{c.title}</h2>
              <p class="small muted" style={{ margin: 0 }}>{c.why}</p>
            </div>
          </div>
          <div class="row" style={{ gap: 8 }}>
            <button type="button" class="btn grow" onClick={() => doIt(c)}><Icon name={c.do && c.do.type !== 'sleep' ? 'check' : 'right'} size={20} />{c.do && c.do.type !== 'sleep' ? 'Hecho' : 'Abrir'}</button>
            {c.do && c.do.type !== 'sleep' && c.href !== '/' && <a class="btn soft" href={`#${c.href}`} aria-label="Ver el detalle"><Icon name="right" size={20} /></a>}
            <button type="button" class="btn soft" style={{ whiteSpace: 'nowrap', padding: '0 16px' }} onClick={() => later(c)}>Ahora no</button>
          </div>
          {up.alt.length > 0 && (
            <div>
              <span class="tiny muted semi">O, si prefieres:</span>
              {up.alt.map((x) => (
                <button key={x.id} type="button" class="lrow" style={{ minHeight: 52 }} onClick={() => doIt(x)}>
                  <span class="tile sm" style={{ background: areaSoft(x.area), color: areaColor(x.area) }}><Icon name={x.icon} size={18} /></span>
                  <span class="stack-xs grow" style={{ textAlign: 'left' }}><span class="semi">{x.title}</span><span class="tiny muted clamp2">{x.why}</span></span>
                  <Icon name={x.do && x.do.type !== 'sleep' ? 'check' : 'right'} size={18} />
                </button>
              ))}
            </div>
          )}
        </section>
      ) : (
        <Empty icon="check">No hay nada que pida tu atención ahora. Disfruta el rato o adelanta algo de tu camino.</Empty>
      )}

      {high > 0 && (
        <button type="button" class="note tone-vit" style={{ border: 0, width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer' }} onClick={onAlerts}>
          <Icon name="shield" size={20} /><span class="grow"><b>{high === 1 ? 'Una alerta pide' : `${high} alertas piden`} actuar hoy.</b> Tócalo para verlas.</span><Icon name="right" size={18} />
        </button>
      )}

      <section class="stack-xs" aria-label="Plan de hoy">
        <div class="between-c">
          <h2 class="eyebrow">Plan de hoy</h2>
          <button type="button" class="link-btn muted" style={{ minHeight: 36, fontSize: 13 }} onClick={() => setSheet('free')}>Tiempo libre: {minsText(plan.cap)}<Icon name="edit" size={13} /></button>
        </div>
        {plan.soft && <p class="small" style={{ color: 'var(--vit-ink)', margin: 0 }}>Hoy tu preparación está baja: el plan se queda en lo esencial.</p>}
        <div class="card flush">
          {plan.blocks.map((b) => (
            <div key={b.item.id} class="plan-row">
              <span class="plan-time tab-num">{fmtClock(b.at)}</span>
              <span class="plan-dot" style={{ background: b.fixed ? 'var(--ink)' : areaColor(b.item.area) }} />
              <button type="button" class="plan-body" onClick={() => go(b.item.href)}>
                <span class="semi clamp2">{b.item.title}</span>
                {b.mins > 0 && <span class="tiny muted">{minsText(b.mins)}{b.item.cost ? ` · ${b.item.cost} de energía` : ''}</span>}
              </button>
              {b.item.do && b.item.do.type !== 'sleep' && (
                <button type="button" class="check" aria-label={`Hecho: ${b.item.title}`} onClick={() => doIt(b.item)}><span style={{ borderColor: areaColor(b.item.area) }} /></button>
              )}
            </div>
          ))}
        </div>
        {plan.over && (
          <div class="note">
            <Icon name="info" size={20} />
            <span class="grow">No cabe todo en {minsText(plan.cap)}: {plan.later.length === 1 ? 'queda 1 cosa' : `quedan ${plan.later.length} cosas`} fuera del plan ({plan.later.slice(0, 2).map((x) => x.title).join(', ')}{plan.later.length > 2 ? '…' : ''}).
              {plan.movable.length > 0 && <> <button type="button" class="link-btn" style={{ display: 'inline', minHeight: 0, padding: 0 }} onClick={() => { const n = act((st, t) => applyLevel(st, plan.movable.map((x) => ({ id: x.do.id, to: addDays(t, 1) })))); toast(`${n === 1 ? 'Un pendiente pasó' : `${n} pendientes pasaron`} a mañana`, 'calendar'); }}>Pasar {plan.movable.length === 1 ? 'el pendiente' : `los ${plan.movable.length} pendientes`} a mañana</button></>}
            </span>
          </div>
        )}
      </section>

      <section class="card" aria-label="Tu semana">
        <div class="between-c"><h2 class="h2">Tu semana</h2><span class="tiny muted semi">minutos planeados por día</span></div>
        <div class="load-week" role="img" aria-label={`Carga de los próximos 7 días: ${lw.before.map((d) => `${DAYS[weekday(d.day)]} ${d.mins} de ${d.cap} minutos`).join(', ')}`}>
          {lw.before.map((d, i) => (
            <div key={d.day} class="load-col">
              <span class="tiny tab-num" style={{ color: d.over ? 'var(--vit-ink)' : 'var(--muted)', fontWeight: 700 }}>{d.mins}</span>
              <div class="load-track">
                <span class="load-cap" style={{ bottom: `${(d.cap / maxLoad) * 100}%` }} />
                <span class="load-bar" style={{ height: `${Math.max(3, (d.mins / maxLoad) * 100)}%`, background: d.over ? 'var(--vit)' : 'var(--ink)' }} />
              </div>
              <span class="tiny muted semi">{i === 0 ? 'Hoy' : DAYS[weekday(d.day)].slice(0, 2)}</span>
            </div>
          ))}
        </div>
        {lw.moves.length > 0 ? (
          <>
            <p class="small muted" style={{ margin: 0 }}>{lw.overDays === 1 ? 'Un día tiene' : `${lw.overDays} días tienen`} más de lo que cabe (la raya marca tu tiempo libre). Puedo mover {lw.moves.length === 1 ? 'un pendiente' : `${lw.moves.length} pendientes`} a días con espacio, sin tocar lo importante.</p>
            <button type="button" class="btn soft" onClick={() => setSheet('level')}><Icon name="swap" size={18} />Repartir la semana</button>
          </>
        ) : (
          <p class="small muted" style={{ margin: 0 }}>{lw.overDays ? 'Hay días cargados, pero no encontré a dónde mover sin tocar lo importante.' : 'Tu semana cabe en tu tiempo libre. Así se sostiene.'}</p>
        )}
      </section>

      {sleep && <SleepSheet s={s} day={today} today={today} onClose={() => setSleep(false)} />}
      {sheet === 'free' && <FreeSheet s={s} onClose={() => setSheet(null)} />}
      {sheet === 'level' && (
        <Sheet onClose={() => setSheet(null)} label="Repartir la semana">
          <SheetHead title="Repartir la semana" onClose={() => setSheet(null)} />
          <p class="small muted">Lo que cambiaría de día. Los importantes y los que se repiten no se tocan.</p>
          <div>
            {lw.moves.map((m) => (
              <div key={m.id} class="mrow"><span class="body"><span class="title">{m.title}</span><span class="meta">{fmtShort(m.from)} → {fmtShort(m.to)} · {minsText(m.mins)}</span></span></div>
            ))}
          </div>
          <button type="button" class="btn block" onClick={() => { const n = act((st) => applyLevel(st, lw.moves)); toast(`${n === 1 ? 'Un pendiente cambió' : `${n} pendientes cambiaron`} de día`, 'swap'); setSheet(null); }}><Icon name="check" size={20} />Mover</button>
        </Sheet>
      )}
    </>
  );
}

function FreeSheet({ s, onClose }) {
  const cfg = plusOf(s).cfg;
  const fmt = (v) => minsText(v);
  return (
    <Sheet onClose={onClose} label="Tu tiempo libre">
      <SheetHead title="Tu tiempo libre" onClose={onClose} />
      <p class="small muted">Cuánto tiempo tienes al día para tus misiones, pendientes y tareas de la casa. Con eso se arma el plan y se reparte la semana.</p>
      <div class="between-c"><span class="semi">De lunes a viernes</span><Stepper value={cfg.freeWeek} onChange={(v) => act((st) => setFree(st, { week: v }))} step={15} min={15} max={600} format={fmt} label="Tiempo libre entre semana" /></div>
      <div class="between-c"><span class="semi">Sábado y domingo</span><Stepper value={cfg.freeWeekend} onChange={(v) => act((st) => setFree(st, { weekend: v }))} step={15} min={15} max={900} format={fmt} label="Tiempo libre el fin de semana" /></div>
      <button type="button" class="btn block" onClick={onClose}><Icon name="check" size={20} />Listo</button>
    </Sheet>
  );
}

// ---------- Gemelo ----------

function Trend({ v, unit = '' }) {
  if (v == null || v === 0) return null;
  const up = v > 0;
  return <span class="tiny" style={{ color: up ? 'var(--good-ink)' : 'var(--vit-ink)', display: 'inline-flex', alignItems: 'center', gap: 2, fontWeight: 700 }}><Icon name={up ? 'arrowup' : 'arrowdown'} size={12} />{Math.abs(v)}{unit}</span>;
}

function TwinTab({ s, today }) {
  const list = useMemo(() => systems(s, today), [s, today]);
  const idx = lifeIndex(list);
  const [open, setOpen] = useState(null);
  const sim = plusOf(s).sim;
  const co = useMemo(() => cashOutlook(s, today, 45), [s, today]);
  const lo = levelOutlook(s, today);
  const vo = vitOutlook(s, today);
  const fx = useMemo(() => whatIf(s, today, sim), [s, today, sim.sleepMin, sim.spendPct, sim.moveDays, sim.saveMonthly]);
  const any = LEVERS.some((l) => sim[l.key] > 0);
  return (
    <>
      <section class="card" aria-label="Índice de vida">
        <div class="row" style={{ gap: 16 }}>
          <Ring value={(idx.score || 0) / 100} size={96} stroke={10} color={zoneColor(idx.zone)} label={idx.score != null ? `Índice de vida ${idx.score} de 100` : 'Sin datos suficientes'}>
            <text x="48" y="54" text-anchor="middle" font-size="28" font-weight="800" fill="currentColor" style={{ fontFamily: 'var(--font-display)' }}>{idx.score != null ? idx.score : '—'}</text>
          </Ring>
          <div class="stack-xs grow">
            <span class="eyebrow">Tu gemelo hoy</span>
            <span class="h2" style={{ margin: 0 }}>{idx.score != null ? ZONE[idx.zone].label : 'Aún sin datos'}</span>
            <span class="small muted">{idx.n} de {idx.of} sistemas con datos{idx.trend ? <> · <Trend v={idx.trend} /> en 2 semanas</> : null}</span>
          </div>
        </div>
        {idx.constraint ? (
          <div class="note" style={{ margin: 0 }}>
            <Icon name="target" size={20} />
            <span><b>Tu restricción: {idx.constraint.name}.</b> Es el sistema que hoy limita a los demás{idx.constraint.weak ? ` (${idx.constraint.weak.label.toLowerCase()}: ${idx.constraint.weak.text.charAt(0).toLowerCase()}${idx.constraint.weak.text.slice(1)})` : ''}. Mejorar ahí rinde más que mejorar en lo que ya va bien.</span>
          </div>
        ) : idx.score != null ? <p class="small muted" style={{ margin: 0 }}>Ningún sistema está por debajo de 75. Lo que toca es sostener.</p> : null}
      </section>

      <section class="stack-xs" aria-label="Tus sistemas">
        <h2 class="eyebrow">Tus sistemas</h2>
        <div class="card flush">
          {list.map((x) => (
            <div key={x.key}>
              <button type="button" class="lrow sys-row" aria-expanded={open === x.key ? 'true' : 'false'} onClick={() => setOpen(open === x.key ? null : x.key)}>
                <span class="tile sm" style={{ background: areaSoft(x.area || 'hogar'), color: areaColor(x.area || 'hogar') }}><Icon name={x.icon} size={18} /></span>
                <span class="stack-xs grow" style={{ textAlign: 'left' }}>
                  <span class="between"><span class="semi">{x.name}</span><span class="row" style={{ gap: 6 }}><Trend v={x.trend} /><span class="strong tab-num">{x.score != null ? x.score : '—'}</span></span></span>
                  <Bar value={(x.score || 0) / 100} color={zoneColor(x.zone)} label={x.score != null ? `${x.name}: ${x.score} de 100` : `${x.name}: sin datos`} />
                  <span class="tiny muted">{x.score == null ? 'Aún sin datos: se llena solo cuando registras.' : x.weak ? `${x.weak.label}: ${x.weak.text.charAt(0).toLowerCase()}${x.weak.text.slice(1)}` : 'En forma'}</span>
                </span>
                <Icon name={open === x.key ? 'down' : 'right'} size={16} />
              </button>
              {open === x.key && (
                <div class="stack-xs" style={{ padding: '4px 0 14px 48px' }}>
                  {x.parts.map((p) => (
                    <div key={p.label} class="stack-xs">
                      <span class="between small"><span class="semi">{p.label}</span><span class="tab-num muted">{p.score}</span></span>
                      <Bar value={p.score / 100} color={zoneColor(p.score >= 75 ? 'verde' : p.score >= 50 ? 'amarillo' : 'rojo')} size="sm" label={`${p.label}: ${p.score} de 100`} />
                      <span class="tiny muted">{p.text}</span>
                    </div>
                  ))}
                  {!x.parts.length && <span class="small muted">Registra algo de esta área y aquí aparecerá cómo va.</span>}
                  <a class="link-btn" href={`#${x.href}`} style={{ alignSelf: 'flex-start' }}>Abrir {x.name}<Icon name="right" size={15} /></a>
                </div>
              )}
            </div>
          ))}
        </div>
        <span class="tiny muted">Cada índice sale de tus últimas 2 semanas frente a tus propias metas. No es un diagnóstico.</span>
      </section>

      <section class="card" aria-label="Pronóstico">
        <h2 class="h2">Lo que viene</h2>
        {co ? (
          <>
            <CashChart co={co} today={today} />
            <p class="small muted" style={{ margin: 0 }}>
              Tu caja en 45 días: los cobros y pagos de tu plan menos {rd(co.daily)} al día de gasto corriente{co.enough ? '' : ' (aún con pocos datos)'}.
              {co.zero ? <> <b style={{ color: 'var(--vit-ink)' }}>Quedaría en negativo el {fmtShort(co.zero.day)}.</b></> : <> El punto más bajo sería {rd(co.min.bal)} el {fmtShort(co.min.day)}.</>}
            </p>
          </>
        ) : <p class="small muted" style={{ margin: 0 }}>Pon el saldo de una cuenta en Finanzas y aquí verás tu caja día por día.</p>}
        <div class="kpis four">
          <div class="kpi"><span class="v">{lo.date ? fmtShort(lo.date) : '—'}</span><span class="l">Nivel {lo.level + 1}{lo.perDay ? ` · ${lo.perDay} XP al día` : ''}</span></div>
          <div class="kpi"><span class="v">{vo.slope == null ? '—' : vo.slope > 0 ? `+${vo.slope}` : vo.slope}</span><span class="l">Vitalidad por día{vo.days != null ? ` · ${vo.days} d para cero` : ''}</span></div>
        </div>
      </section>

      <section class="card" aria-label="Qué pasa si">
        <div class="stack-xs"><h2 class="h2">¿Qué pasa si…?</h2><span class="small muted">Mueve una palanca y mira el efecto, calculado con tus últimas 4 semanas.</span></div>
        {LEVERS.map((l) => (
          <div key={l.key} class="between-c" style={{ gap: 10 }}>
            <span class="row grow" style={{ gap: 10, minWidth: 0 }}><Icon name={l.icon} size={18} /><span class="stack-xs" style={{ minWidth: 0 }}><span class="semi">{l.label}</span><span class="tiny muted">{l.unit}</span></span></span>
            <Stepper value={sim[l.key]} onChange={(v) => act((st) => setLever(st, l.key, v))} step={l.step} min={l.min} max={l.max} format={(v) => (l.key === 'saveMonthly' ? rdK(v) : String(v))} label={l.label} />
          </div>
        ))}
        {any && fx.length > 0 && (
          <div class="stack-xs">
            {fx.map((e) => (
              <div key={e.key} class="fx-row">
                <span class="tiny muted semi">{e.label}</span>
                <span class="row" style={{ gap: 8, flexWrap: 'wrap' }}><span class="muted tab-num">{e.before}</span><Icon name="right" size={14} /><span class="strong tab-num">{e.after}</span></span>
                <span class="small muted">{e.text}</span>
              </div>
            ))}
          </div>
        )}
        {any && !fx.length && <p class="small muted" style={{ margin: 0 }}>Todavía faltan datos para calcularlo: hacen falta al menos 7 noches de sueño o unos días de gastos.</p>}
        {sim.sleepMin > 0 && fx.some((e) => e.key === 'descanso') && (
          <button type="button" class="btn soft" onClick={() => {
            const wake = s.profile.wakeGoal;
            const title = wake ? `Acostarme ${sim.sleepMin} min antes` : `Dormir ${sim.sleepMin} min más`;
            act((st, t) => addMission(st, { title, area: 'salud', cost: 1, kind: 'habit' }, t));
            toast('Quedó como misión diaria', 'sword');
          }}><Icon name="sword" size={18} />Convertirlo en misión</button>
        )}
      </section>
    </>
  );
}

// Tu caja día por día: la línea es lo esperado; la franja, entre una semana barata y una cara.
function CashChart({ co, today }) {
  const W = 320; const Hh = 132; const padL = 6; const padR = 6; const padT = 14; const padB = 22;
  const pts = co.points;
  const lo = Math.min(0, ...pts.map((p) => p.low));
  const hi = Math.max(...pts.map((p) => p.high), 1);
  const x = (i) => padL + (i / (pts.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - lo) / (hi - lo || 1)) * (Hh - padT - padB);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.bal).toFixed(1)}`).join(' ');
  const band = `${pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.high).toFixed(1)}`).join(' ')} ${[...pts].reverse().map((p, i) => `L${x(pts.length - 1 - i).toFixed(1)} ${y(p.low).toFixed(1)}`).join(' ')} Z`;
  const incomes = pts.map((p, i) => ({ p, i })).filter((o) => o.i > 0 && o.p.list.some((it) => it.kind === 'ingreso'));
  const minI = pts.indexOf(co.min);
  const ticks = [0, 15, 30, 45].filter((i) => i < pts.length);
  return (
    <figure class="chart-wrap" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${Hh}`} width="100%" role="img" aria-label={`Tu caja en 45 días: empieza en ${rd(co.start)}, el punto más bajo es ${rd(co.min.bal)} el ${fmtShort(co.min.day)} y termina en ${rd(co.end)}.`}>
        <path d={band} fill="var(--finanzas-soft)" />
        {lo < 0 && <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="var(--vit)" stroke-width="1.5" stroke-dasharray="4 4" />}
        {incomes.map((o) => <line key={o.i} x1={x(o.i)} x2={x(o.i)} y1={padT} y2={Hh - padB} stroke="var(--line-2)" stroke-width="1" />)}
        <path d={line} fill="none" stroke="var(--finanzas)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
        <circle cx={x(minI)} cy={y(co.min.bal)} r="4.5" fill="var(--surface)" stroke={co.min.bal < 0 ? 'var(--vit)' : 'var(--finanzas)'} stroke-width="2.5" />
        <text x={Math.min(W - 44, Math.max(40, x(minI)))} y={Math.max(11, y(co.min.bal) - 9)} text-anchor="middle" font-size="11" font-weight="700" fill="var(--ink)" stroke="var(--surface)" stroke-width="3.5" paint-order="stroke" stroke-linejoin="round">{rdK(co.min.bal)}</text>
        {ticks.map((i) => <text key={i} x={x(i)} y={Hh - 6} text-anchor={i === 0 ? 'start' : i >= pts.length - 1 ? 'end' : 'middle'} font-size="10.5" fill="var(--muted)">{i === 0 ? 'Hoy' : fmtShort(addDays(today, i))}</text>)}
      </svg>
      <figcaption class="tiny muted">Línea: lo esperado. Franja: entre una semana barata y una cara. Rayas verticales: tus cobros.</figcaption>
    </figure>
  );
}

// ---------- Alertas tempranas ----------

function RiskTab({ s, today, list }) {
  return (
    <>
      <section class="stack-xs" aria-label="Alertas tempranas">
        <p class="lead">Lo que tus datos dicen que puede salir mal, antes de que pase, y qué hacer para evitarlo.</p>
      </section>
      {!list.length && <Empty icon="shield">Sin alertas. Nada en tus datos apunta a un problema en las próximas semanas.</Empty>}
      {list.map((r) => {
        const lv = RISK_LEVEL[r.level];
        const sys = r.sys ? SYSTEM[r.sys] : null;
        return (
          <section key={r.id} class="card" aria-label={r.title}>
            <div class="row-top" style={{ gap: 12 }}>
              <span class="tile" style={{ background: r.level === 'alta' ? 'var(--vit-soft)' : r.level === 'media' ? 'var(--xp-soft)' : 'var(--soft)', color: r.level === 'alta' ? 'var(--vit-ink)' : r.level === 'media' ? 'var(--xp-ink)' : 'var(--ink)' }}><Icon name={sys ? sys.icon : 'shield'} /></span>
              <div class="stack-xs grow">
                <span class="row wrap" style={{ gap: 6 }}>
                  <span class={`chip sm tone-${lv.tone === 'muted' ? 'ene' : lv.tone}`}>{lv.label}</span>
                  {r.days != null && r.days > 0 && <span class="tiny muted semi">en {r.days} {r.days === 1 ? 'día' : 'días'}</span>}
                </span>
                <span class="strong">{r.title}</span>
                {r.detail && <span class="small muted">{r.detail}</span>}
                {r.fix && <span class="small"><b>Cómo evitarlo:</b> {r.fix}.</span>}
              </div>
            </div>
            <div class="row wrap" style={{ gap: 8 }}>
              <a class="btn sm" href={`#${r.action.href}`}><Icon name="right" size={16} />{r.action.label}</a>
              <button type="button" class="btn sm soft" onClick={() => { act((st, t) => snooze(st, `r:${r.id}`, t, addDays(t, 6))); toast('No te lo recuerdo por una semana', 'clock'); }}>Ya lo sé</button>
            </div>
          </section>
        );
      })}
      <span class="tiny muted">Las alertas salen de tus registros y de reglas sencillas que puedes ver en cada una. No reemplazan a un médico ni a un asesor.</span>
    </>
  );
}

// ---------- Lean ----------

function Factor({ k, v }) {
  const p = OEE_PART[k];
  return (
    <div class="stack-xs">
      <span class="between small"><span class="semi">{p.name}</span><span class="tab-num strong">{v != null ? pct(v) : '—'}</span></span>
      <Bar value={v || 0} color="var(--ink)" label={`${p.name}: ${v != null ? pct(v) : 'sin datos'}`} />
      <span class="tiny muted">{p.help}</span>
    </div>
  );
}

function LeanTab({ s, today }) {
  const tr = useMemo(() => oeeTrend(s, today), [s, today]);
  const wk = tr.weeks[tr.weeks.length - 1] || oeeWeek(s, today);
  const md = useMemo(() => muda(s, today), [s, today]);
  const run = kaizenRunning(s);
  const hist = kaizenHistory(s);
  const [info, setInfo] = useState(false);
  const loss = wk.loss ? OEE_PART[wk.loss] : null;
  const maxO = Math.max(0.01, ...tr.weeks.map((w) => w.oee || 0));
  return (
    <>
      <section class="card" aria-label="OEE personal">
        <div class="row" style={{ gap: 16 }}>
          <Ring value={wk.oee || 0} size={96} stroke={10} color="var(--ink)" label={wk.oee != null ? `OEE de esta semana: ${pct(wk.oee)}` : 'OEE sin datos suficientes'}>
            <text x="48" y="54" text-anchor="middle" font-size="24" font-weight="800" fill="currentColor" style={{ fontFamily: 'var(--font-display)' }}>{wk.oee != null ? Math.round(wk.oee * 100) : '—'}</text>
          </Ring>
          <div class="stack-xs grow">
            <span class="eyebrow">Tu OEE esta semana</span>
            <span class="h2" style={{ margin: 0 }}>{wk.oee != null ? `${pct(wk.oee)} de tu capacidad` : 'Faltan datos'}</span>
            <span class="small muted">{tr.avg != null ? `Tu promedio de 8 semanas: ${pct(tr.avg)}${tr.best != null ? ` · tu mejor: ${pct(tr.best)}` : ''}` : 'Disponibilidad × Rendimiento × Calidad'}</span>
          </div>
        </div>
        <Factor k="a" v={wk.a} />
        <Factor k="p" v={wk.p} />
        <Factor k="q" v={wk.q} />
        {loss && wk.oee != null && (
          <div class="note" style={{ margin: 0 }}><Icon name="gauge" size={20} /><span><b>Tu mayor pérdida: {loss.name.toLowerCase()}.</b> {loss.fix}</span></div>
        )}
        {tr.weeks.length > 1 && (
          <div class="oee-trend" role="img" aria-label={`OEE por semana: ${tr.weeks.map((w) => (w.oee != null ? pct(w.oee) : 'sin datos')).join(', ')}`}>
            {tr.weeks.map((w) => (
              <div key={w.wk} class="load-col">
                <span class="tiny tab-num muted" style={{ fontWeight: 700 }}>{w.oee != null ? Math.round(w.oee * 100) : ''}</span>
                <div class="load-track"><span class="load-bar" style={{ height: `${Math.max(3, ((w.oee || 0) / maxO) * 100)}%`, background: w.current ? 'var(--ink)' : 'var(--line-2)' }} /></div>
                <span class="tiny muted">{fmtShort(w.wk).split(' ')[0]}</span>
              </div>
            ))}
          </div>
        )}
        <button type="button" class="link-btn muted" style={{ alignSelf: 'flex-start' }} aria-expanded={info ? 'true' : 'false'} onClick={() => setInfo(!info)}>¿Qué es el OEE?<Icon name={info ? 'down' : 'right'} size={14} /></button>
        {info && <p class="small muted" style={{ margin: 0 }}>Es la medida con la que una fábrica sabe cuánto de su capacidad real aprovecha: el tiempo que la máquina estuvo disponible, por lo que produjo frente a lo planeado, por lo que salió bien a la primera. En una planta, 85 % es clase mundial; en una persona lo útil es compararte contigo. Si está bajo, no es para exigirte más: casi siempre es dormir mejor o planear menos.</p>}
      </section>

      {run && <KaizenCard s={s} k={run} today={today} />}

      <section class="stack-xs" aria-label="Desperdicios">
        <h2 class="eyebrow">Los ocho desperdicios</h2>
        <div class="card flush">
          {md.map((m) => (
            <div key={m.key} class="mrow" style={{ alignItems: 'flex-start' }}>
              <span class="tile sm" style={{ background: m.level >= 2 ? 'var(--vit-soft)' : m.level === 1 ? 'var(--xp-soft)' : 'var(--good-soft)', color: m.level >= 2 ? 'var(--vit-ink)' : m.level === 1 ? 'var(--xp-ink)' : 'var(--good-ink)' }}><Icon name={m.icon} size={18} /></span>
              <div class="stack-xs grow">
                <span class="between"><span class="semi">{m.name}</span><span class="tiny muted semi">{MUDA_LEVEL[m.level]}</span></span>
                <span class="small muted">{m.text}</span>
                {m.level > 0 && (
                  <span class="row wrap" style={{ gap: 8, paddingTop: 4 }}>
                    <a class="btn sm soft" href={`#${m.fix.href}`}>{m.fix.label}</a>
                    {!run && <button type="button" class="btn sm soft" onClick={() => { act((st, t) => startKaizen(st, m.key, t)); toast('Mejora de la semana en marcha', 'target'); }}><Icon name="target" size={16} />Mejorar 7 días</button>}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <span class="tiny muted">Muda es todo lo que gasta tiempo, dinero o energía sin darte nada. Se mide con tus últimas 2 semanas.</span>
      </section>

      {hist.total > 0 && (
        <section class="card" aria-label="Mejoras anteriores">
          <div class="between-c"><h2 class="h2">Tus mejoras</h2><span class="tiny muted semi">{hist.ok} de {hist.total} funcionaron</span></div>
          <div>
            {hist.list.slice(0, 6).map((k) => (
              <div key={k.id} class="mrow">
                <span class="tile sm" style={{ background: k.state === 'ok' ? 'var(--good-soft)' : 'var(--soft)', color: k.state === 'ok' ? 'var(--good-ink)' : 'var(--muted)' }}><Icon name={k.state === 'ok' ? 'check' : 'repeat'} size={18} /></span>
                <span class="body"><span class="title" style={{ fontSize: 15 }}>{k.text}</span><span class="meta">{MUDA[k.key].name}: {kaizenUnit(k.key, k.base)} → {kaizenUnit(k.key, k.after)} · {fmtShort(k.start)}</span></span>
                {k.state === 'ok' && <button type="button" class="btn sm soft" onClick={() => { act((st, t) => addMission(st, { title: k.text.slice(0, 80), area: 'crecimiento', cost: 1, kind: 'habit' }, t)); toast('Quedó como misión', 'sword'); }}>Dejarlo fijo</button>}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function KaizenCard({ s, k, today }) {
  const pr = kaizenProgress(s, k, today);
  const better = k.base > 0 ? pr.now < k.base : pr.now === 0;
  return (
    <section class="card" aria-label="Mejora de la semana" style={{ background: 'var(--crecimiento-soft)', borderColor: 'transparent' }}>
      <div class="between-c"><span class="eyebrow" style={{ color: 'var(--crecimiento-ink)' }}>Kaizen · día {pr.day} de {KAIZEN_DAYS}</span><span class="tiny muted semi">{MUDA[k.key].name}</span></div>
      <span class="strong">{k.text}</span>
      <Bar value={pr.day / KAIZEN_DAYS} color="var(--crecimiento)" label={`Día ${pr.day} de ${KAIZEN_DAYS}`} />
      <div class="kpis four">
        <div class="kpi"><span class="v">{kaizenUnit(k.key, k.base)}</span><span class="l">Antes (7 días)</span></div>
        <div class="kpi"><span class="v" style={{ color: better ? 'var(--good-ink)' : 'var(--ink)' }}>{kaizenUnit(k.key, pr.now)}</span><span class="l">Hasta hoy</span></div>
      </div>
      <span class="small muted">Al terminar los 7 días se compara con tu línea base. Si mejora al menos un 10 %, ganas 20 XP y 10 de oro, y puedes dejarlo como misión.</span>
      <button type="button" class="link-btn muted" style={{ alignSelf: 'flex-start' }} onClick={() => { act((st) => dropKaizen(st, k.id)); toast('Mejora cancelada', 'undo'); }}>Cancelar esta mejora</button>
    </section>
  );
}

// ---------- En Hoy y en Áreas ----------

// La tarjeta de Hoy: lo siguiente en una línea, con un toque para hacerlo. `skip`: tipos que ya muestra un aviso de Hoy.
export function CopilotCard({ s, today, hour, skip = new Set(), onSleep }) {
  const up = useMemo(() => nextUp(s, today, { hour, minute: new Date().getMinutes() }), [s, today, hour]);
  const c = up.list.find((x) => !skip.has(x.kind)) || null;
  const high = up.list.filter((x) => x.kind === 'risk' && x.risk && x.risk.level === 'alta').length;
  if (!c) {
    return (
      <a href="#/mando" class="card tight cp-home" style={{ textDecoration: 'none', color: 'var(--ink)' }} aria-label="Centro de mando">
        <div class="row" style={{ gap: 12 }}>
          <span class="tile sm" style={{ background: 'var(--ink)', color: 'var(--on-ink)' }}><Icon name="compass" size={18} /></span>
          <span class="stack-xs grow"><span class="semi">Todo en orden por ahora</span><span class="tiny muted">Centro de mando: tu gemelo, alertas y plan</span></span>
          <Icon name="right" size={18} />
        </div>
      </a>
    );
  }
  const oneTap = c.do && c.do.type !== 'sleep';
  const doIt = () => { if (!runDo(c, s, today, onSleep)) go(c.href); };
  return (
    <section class="card tight cp-home" aria-label="Copiloto: lo siguiente">
      <div class="between-c" style={{ minHeight: 24 }}>
        <span class="row eyebrow" style={{ gap: 6 }}><Icon name="compass" size={14} />Lo siguiente</span>
        <a class="link-btn muted" href="#/mando" style={{ minHeight: 32, fontSize: 13 }}>{high ? `${high === 1 ? '1 alerta' : `${high} alertas`} · ` : ''}Centro de mando<Icon name="right" size={14} /></a>
      </div>
      <div class="row" style={{ gap: 12 }}>
        <span class="tile" style={{ background: areaSoft(c.area), color: areaColor(c.area) }}><Icon name={c.icon} /></span>
        <button type="button" class="stack-xs grow" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'inherit', font: 'inherit', minWidth: 0 }} onClick={() => go(oneTap ? c.href : '/mando')}>
          <span class="strong clamp2">{c.title}</span>
          <span class="small muted clamp2">{c.why}</span>
        </button>
        <button type="button" class="btn sm" style={{ flexShrink: 0 }} onClick={doIt}>{oneTap ? <><Icon name="check" size={16} />Hecho</> : <>Ir<Icon name="right" size={16} /></>}</button>
      </div>
    </section>
  );
}

export function MandoCard() {
  const s = useApp();
  const hour = useHour();
  const today = s.energy.day;
  const idx = useMemo(() => lifeIndex(systems(s, today)), [s, today]);
  const rk = useMemo(() => risks(s, today, { hour }), [s, today, hour]);
  const sub = idx.score != null ? `Índice de vida ${idx.score}${idx.constraint ? ` · restricción: ${idx.constraint.name.toLowerCase()}` : ''}` : 'Copiloto, gemelo digital, alertas y Lean';
  return (
    <a href="#/mando" class="card" style={{ textDecoration: 'none', color: 'var(--ink)' }} aria-label={`Centro de mando: ${sub}`}>
      <div class="row">
        <span class="tile" style={{ background: 'var(--ink)', color: 'var(--on-ink)' }}><Icon name="compass" /></span>
        <span class="stack-xs grow"><span class="strong">Centro de mando</span><span class="small muted">{sub}</span></span>
        <Icon name="right" size={18} />
      </div>
      {rk.length > 0 && <span class="tiny strong" style={{ color: rk.some((r) => r.level === 'alta') ? 'var(--vit-ink)' : 'var(--muted)' }}>{rk.length === 1 ? '1 alerta temprana' : `${rk.length} alertas tempranas`}: {rk[0].title.charAt(0).toLowerCase()}{rk[0].title.slice(1)}</span>}
    </a>
  );
}

