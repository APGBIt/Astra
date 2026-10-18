import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Nav, TopBar, Segs, Bar, Avatar, TChip, Sheet, SheetHead, NumberChips, toast, areaColor, areaSoft, plural, ask } from '../ui/kit.jsx';
import { RecordCard } from './Record.jsx';
import { RoutineChecklist } from './Sleep.jsx';
import { act, useApp } from '../app/store.js';
import { back } from '../app/router.js';
import { relDay, DAYS_SHORT, weekday, fmtDay, diffDays, addDays } from '../app/dates.js';
import { AREAS, AREA, AREA_ROUTE, POTIONS, SHOP_ITEMS, RECOVERY_QUESTS } from '../game/content.js';
import {
  playerLevel, attrLevel, className, energyInfo, statuses, usePotion, potionUses, buyItem, redeemReward, uid,
  saveInn, weekStats, weekXpBy, ACHIEVEMENTS, completeRecoveryQuest, inRecovery, dayMissions, talentsFor, recordProgress, fmtHours,
  bedtimeFor, fmtClock, sleepFromTimes,
} from '../game/logic.js';

// ¿Toca descargar una copia? Si nunca se hizo y ya hay datos, o si la última tiene más de 14 días.
export function backupDue(s, today) {
  const last = s.settings.lastBackup;
  const hasData = (s.stats.done || 0) + s.todos.length + recordProgress(s).filled > 5;
  if (!hasData) return false;
  if (!last) return diffDays(s.profile.created || today, today) >= 3;
  return diffDays(last, today) > 14;
}

// ---------- Personaje: estado de rol ----------

export function Character() {
  const s = useApp();
  const today = s.energy.day;
  const lvl = playerLevel(s.xp);
  const en = energyInfo(s, today);
  const sts = statuses(s, today);
  const [showLog, setShowLog] = useState(false);
  const lvls = AREAS.map((a) => attrLevel(s.attrs[a.key] || 0).n);
  const top = Math.max(5, ...lvls);
  const radar = lvls.map((n) => n / top);
  return (
    <>
      <main class="screen">
        <header class="between-c">
          <a class="icon-btn" href="#/cronica" aria-label="Crónica"><Icon name="chart" /></a>
          <a class="icon-btn" href="#/ajustes" aria-label="Ajustes"><Icon name="gear" /></a>
        </header>
        <section class="stack center" style={{ display: 'flex', marginTop: -20 }} aria-label="Ficha">
          <Avatar name={s.profile.name} size={96} />
          <div class="stack-xs">
            <h1 class="h1">{s.profile.name || 'Aventurero'}</h1>
            <div class="chips" style={{ justifyContent: 'center' }}>
              <span class="chip tone-ink strong">Nivel {lvl.n}</span>
              <span class="chip">{className(s.profile.classKeys)}</span>
              {s.streak.count > 0 && <span class="chip tone-xp"><Icon name="flame" size={14} />{s.streak.count}</span>}
            </div>
            {s.titles.length > 0 && <span class="small muted semi">«{s.titles[s.titles.length - 1]}»</span>}
          </div>
        </section>

        {backupDue(s, today) && (
          <a class="note tone-ene" href="#/ajustes" style={{ textDecoration: 'none' }}>
            <Icon name="download" size={20} />
            <span class="grow"><b>Descarga una copia de seguridad.</b> Tu progreso, pendientes y expediente viven solo en este teléfono.{s.settings.lastBackup ? ` La última es del ${fmtDay(s.settings.lastBackup, { weekdayName: false })}.` : ''}</span>
            <Icon name="right" size={18} />
          </a>
        )}

        <RecordCard />

        <section class="stack-sm" aria-label="Vitalidad">
          <div class="between">
            <span class="row h2" style={{ gap: 8, color: 'var(--vit-ink)' }}><Icon name="heart" size={22} fill />Vitalidad</span>
            <span class="display-num tab-num" style={{ fontSize: 22 }}>{s.vit}<span class="small muted semi"> / 100</span></span>
          </div>
          <Segs value={s.vit / 10} lg color="var(--vit)" label={`Vitalidad ${s.vit} de 100`} />
          <p class="small muted">Tu salud de fondo. Sube cuando te cuidas y cumples; baja cuando fallas lo que prometiste o duermes poco. En 0 entras en recuperación: no pierdes nada.</p>
        </section>

        <section class="stack-sm" aria-label="Energía">
          <div class="between">
            <span class="row h2" style={{ gap: 8, color: 'var(--ene-ink)' }}><Icon name="bolt" size={22} fill />Energía</span>
            <span class="display-num tab-num" style={{ fontSize: 22 }}>{en.left}<span class="small muted semi"> / 10</span></span>
          </div>
          <Segs value={en.left} lg color="var(--ene)" label={`Energía ${en.left} de 10`} />
          <p class="small muted">Tu presupuesto del día. Cada misión cuesta de 1 a 3. Se llena al dormir tu meta ({fmtHours(s.profile.sleepGoal)}); hoy empezaste con {en.max}{en.bonus ? ` y recuperaste ${en.bonus} con pociones` : ''}.</p>
        </section>

        <section class="stack-sm" aria-label="Experiencia">
          <div class="between small strong"><span>Experiencia · nivel {lvl.n + 1} en {(lvl.need - lvl.into).toLocaleString('en-US')} XP</span><span class="tab-num">{s.xp.toLocaleString('en-US')} XP</span></div>
          <Bar value={lvl.progress} color="var(--xp)" label={`Experiencia ${Math.round(lvl.progress * 100)} %`} />
        </section>

        {sts.length > 0 && (
          <section class="stack-sm" aria-label="Estados activos">
            <h2 class="eyebrow">Estados activos</h2>
            {sts.map((x) => (
              <div key={x.id} class={`note tone-${x.tone}`}><Icon name={x.icon} size={20} /><span class="stack-xs"><b>{x.label}</b><span>{x.desc}</span></span></div>
            ))}
          </section>
        )}

        <section class="stack-sm" aria-label="Pociones">
          <div class="between"><h2 class="eyebrow">Pociones</h2><span class="tiny muted semi">Acciones reales que recargan</span></div>
          {POTIONS.map((p) => {
            const used = potionUses(s, p.id, today);
            const left = p.perDay - used;
            const fx = [p.effect.energy ? `+${p.effect.energy} energía` : '', p.effect.vit ? `+${p.effect.vit} vitalidad` : ''].filter(Boolean).join(' · ');
            return (
              <button key={p.id} type="button" disabled={left <= 0} onClick={() => { if (act((st, t, ev) => usePotion(st, p.id, t, ev))) toast(`${p.title}: ${fx}`, p.icon); }}
                class="row" style={{ width: '100%', minHeight: 62, padding: '10px 14px', borderRadius: 18, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', textAlign: 'left', opacity: left <= 0 ? 0.5 : 1 }}>
                <span class="tile sm" style={{ background: p.effect.energy ? 'var(--ene-soft)' : 'var(--vit-soft)', color: p.effect.energy ? 'var(--ene)' : 'var(--vit)' }}><Icon name={p.icon} size={18} /></span>
                <span class="stack-xs grow"><span class="strong">{p.title}</span><span class="tiny semi"><span style={{ color: p.effect.energy ? 'var(--ene-ink)' : 'var(--vit-ink)' }}>{fx}</span><span class="muted"> · {left > 0 ? `te ${left === 1 ? 'queda 1' : `quedan ${left}`} hoy` : 'ya la usaste hoy'}</span></span></span>
                <Icon name="plus" size={20} />
              </button>
            );
          })}
        </section>

        <section class="card" aria-label="Atributos">
          <h2 class="h2">Tus seis atributos</h2>
          <Radar values={radar} />
          {AREAS.map((a) => {
            const lv = attrLevel(s.attrs[a.key] || 0);
            const tal = talentsFor(s, a.key).filter((t) => t.unlocked);
            return (
              <a key={a.key} href={`#${AREA_ROUTE[a.key]}`} class="row" style={{ gap: 12, textDecoration: 'none', color: 'var(--ink)', padding: '4px 0' }}>
                <span class="tile sm" style={{ background: areaSoft(a.key), color: areaColor(a.key) }}><Icon name={a.icon} size={18} /></span>
                <span class="stack-xs grow">
                  <span class="between"><span class="strong">{a.attr}</span><span class="strong small">Nv {lv.n}</span></span>
                  <Bar value={lv.progress} color={areaColor(a.key)} label={`${a.attr} nivel ${lv.n}`} />
                  {tal.length > 0 && <span class="tiny muted">{tal.map((t) => t.name).join(' · ')}</span>}
                </span>
              </a>
            );
          })}
        </section>

        <section class="card flush" aria-label="Por qué cambió tu vitalidad">
          <button type="button" class="lrow" style={{ minHeight: 56 }} onClick={() => setShowLog(!showLog)} aria-expanded={showLog ? 'true' : 'false'}>
            <span class="grow h2" style={{ fontSize: 18 }}>Por qué cambió tu vitalidad</span><Icon name={showLog ? 'down' : 'right'} size={18} />
          </button>
          {showLog && (s.vitLog.length ? s.vitLog.slice(0, 20).map((l, i) => (
            <div class="lrow" key={i}>
              <span class="display-num" style={{ width: 44, fontSize: 17, color: l.delta > 0 ? 'var(--good-ink)' : 'var(--vit-ink)' }}>{l.delta > 0 ? `+${l.delta}` : `−${-l.delta}`}</span>
              <span class="grow small">{l.reason}</span>
              <span class="tiny muted">{relDay(l.day, today)}</span>
            </div>
          )) : <p class="small muted" style={{ paddingBottom: 14 }}>Aún no hay cambios.</p>)}
        </section>

        <div class="grid2">
          <a href="#/tienda" class="card tight" style={{ textDecoration: 'none', color: 'var(--ink)' }}><span class="row"><Icon name="bag" /><span class="strong grow">Tienda</span></span><span class="small muted">{s.gold} de oro</span></a>
          <a href="#/posada" class="card tight" style={{ textDecoration: 'none', color: 'var(--ink)' }}><span class="row"><Icon name="moon" /><span class="strong grow">Posada</span></span><span class="small muted">{s.inn[today] ? 'Hoy cerrado' : 'Cierra el día'}</span></a>
          <a href="#/cronica" class="card tight" style={{ textDecoration: 'none', color: 'var(--ink)' }}><span class="row"><Icon name="chart" /><span class="strong grow">Crónica</span></span><span class="small muted">{Object.keys(s.achievements).length} insignias</span></a>
          <a href="#/misiones" class="card tight" style={{ textDecoration: 'none', color: 'var(--ink)' }}><span class="row"><Icon name="sword" /><span class="strong grow">Misiones</span></span><span class="small muted">{s.missions.filter((m) => !m.archived).length} activas</span></a>
          <a href="#/ajustes" class="card tight" style={{ textDecoration: 'none', color: 'var(--ink)', gridColumn: '1 / -1' }}><span class="row"><Icon name="gear" /><span class="strong grow">Ajustes</span><span class="small muted">Metas diarias, IA, copia de seguridad y tema</span></span></a>
        </div>
      </main>
      <Nav active="personaje" />
    </>
  );
}

function Radar({ values, size = 260 }) {
  const cx = size / 2;
  const R = size / 2 - 44;
  const pt = (i, r) => [cx + r * Math.sin((i * Math.PI) / 3), cx - r * Math.cos((i * Math.PI) / 3)];
  const poly = (f) => AREAS.map((_, i) => pt(i, R * f).map((n) => n.toFixed(1)).join(',')).join(' ');
  const vals = values.map((v, i) => pt(i, R * Math.max(0.06, v)));
  return (
    <svg width="100%" viewBox={`-50 0 ${size + 100} ${size}`} role="img" aria-label="Mapa de tus seis atributos" style={{ alignSelf: 'center', maxWidth: 360 }}>
      {[1, 0.66, 0.33].map((f) => <polygon key={f} points={poly(f)} fill={f === 1 ? 'var(--soft)' : 'none'} stroke="var(--line-2)" stroke-width="1.2" />)}
      <polygon points={vals.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')} fill="var(--ink)" fill-opacity="0.08" stroke="var(--ink)" stroke-width="2.2" stroke-linejoin="round" />
      {vals.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="5" fill={areaColor(AREAS[i].key)} stroke="var(--surface)" stroke-width="2" />)}
      {AREAS.map((a, i) => {
        const [x, y] = pt(i, R + 24);
        const anchor = i === 0 || i === 3 ? 'middle' : i < 3 ? 'start' : 'end';
        return <text key={a.key} x={x} y={y + 5} text-anchor={anchor} font-size="12.5" font-weight="800" fill={`var(--${a.key}-ink)`} font-family="Figtree, sans-serif">{a.attr}</text>;
      })}
    </svg>
  );
}

// ---------- Posada: cierre del día ----------

const INN_MOODS = ['Agotado', 'Bajo', 'Normal', 'Bien', 'Pleno'];

export function Inn() {
  const s = useApp();
  const today = s.energy.day;
  const prev = s.inn[today];
  const [mood, setMood] = useState(prev ? prev.mood : '');
  const [good, setGood] = useState(prev ? prev.good : '');
  const [better, setBetter] = useState(prev ? prev.better : '');
  const [wake, setWake] = useState(prev && prev.wake ? prev.wake : s.profile.wakeGoal || '');
  const [bed, setBed] = useState(prev && prev.bed ? prev.bed : (s.profile.wakeGoal && bedtimeFor(s, s.profile.wakeGoal)) || '');
  const [routine, setRoutine] = useState(prev && Array.isArray(prev.routine) ? prev.routine : []);
  const suggested = bedtimeFor(s, wake);
  const planned = sleepFromTimes(bed, wake);
  const paidRoutine = prev ? prev.routinePaid || 0 : 0;
  const d = s.days[today];
  const { done, all } = dayMissions(s, today);
  const vitToday = s.vitLog.filter((l) => l.day === today).reduce((a, l) => a + l.delta, 0);
  const todosToday = s.todos.filter((t) => t.done === today).length;
  const todosTomorrow = s.todos.filter((t) => !t.done && t.due && t.due <= addDays(today, 1)).length;
  const save = () => {
    const first = act((st, t, ev) => saveInn(st, { mood, good, better, bed, wake, routine }, t, ev));
    const extra = Math.max(0, routine.length - paidRoutine) * 2;
    toast(`${first ? 'Descansaste en la posada · +5 de vitalidad' : 'Cierre actualizado'}${extra ? ` · +${extra} XP de Vigor` : ''}`, 'moon');
    back('/');
  };
  return (
    <main class="screen no-nav">
      <TopBar backTo="/" close />
      <div class="stack-sm"><span style={{ color: 'var(--emocional)', display: 'flex' }}><Icon name="moon" size={30} /></span><h1 class="h1">La posada</h1><p class="lead">Repasa tu día, deja listo el de mañana y recupera vitalidad.</p></div>
      <div class="kpis">
        <div class="kpi"><span class="v">{done.length}/{all.length}</span><span class="l">Misiones</span></div>
        <div class="kpi"><span class="v" style={{ color: 'var(--xp-ink)' }}>+{d ? d.xp : 0}</span><span class="l">XP de hoy</span></div>
        <div class="kpi"><span class="v" style={{ color: vitToday >= 0 ? 'var(--good-ink)' : 'var(--vit-ink)' }}>{vitToday >= 0 ? `+${vitToday}` : `−${-vitToday}`}</span><span class="l">Vitalidad</span></div>
      </div>
      {(todosToday > 0 || todosTomorrow > 0) && (
        <a class="note" href="#/pendientes" style={{ textDecoration: 'none' }}>
          <Icon name="list" size={20} />
          <span class="grow">{todosToday > 0 ? `Hoy completaste ${plural(todosToday, 'pendiente', 'pendientes')}. ` : ''}{todosTomorrow > 0 ? `Para mañana tienes ${plural(todosTomorrow, 'pendiente', 'pendientes')}.` : ''}</span>
          <Icon name="right" size={18} />
        </a>
      )}
      <div class="stack-sm"><span class="label">¿Cómo termina tu día?</span><div class="chips" role="group" aria-label="Ánimo">{INN_MOODS.map((m) => <TChip key={m} sm on={mood === m} onClick={() => setMood(m)}>{m}</TChip>)}</div></div>
      <div class="field"><label for="g">¿Qué salió bien hoy?</label><textarea id="g" class="input" rows={3} value={good} maxLength={500} onInput={(e) => setGood(e.currentTarget.value)} /></div>
      <div class="field"><label for="b">Una cosa para mejorar mañana</label><textarea id="b" class="input" rows={2} value={better} maxLength={500} onInput={(e) => setBetter(e.currentTarget.value)} /></div>
      <section class="stack-sm" aria-label="Para dormir">
        <span class="label">Para dormir bien</span>
        <div class="timepair">
          <div class="field"><label for="wk">Mañana me levanto a las</label><input id="wk" type="time" class="input" value={wake} onInput={(e) => setWake(e.currentTarget.value)} /></div>
          <div class="field"><label for="bd">Me voy a acostar a las</label><input id="bd" type="time" class="input" value={bed} onInput={(e) => setBed(e.currentTarget.value)} /></div>
        </div>
        <span class="small muted">
          {suggested ? <>Para dormir {fmtHours(s.profile.sleepGoal)}, acuéstate a las <b>{fmtClock(suggested)}</b>{bed && suggested !== bed ? <> · <button type="button" class="link-btn" style={{ minHeight: 0, display: 'inline', padding: 0 }} onClick={() => setBed(suggested)}>usar esa hora</button>.</> : ''}</> : `Dormir ${fmtHours(s.profile.sleepGoal)} llena tu energía de mañana.`}
          {planned != null && bed && wake ? ` Así dormirías ${fmtHours(planned)}.` : ''}
        </span>
      </section>
      <section class="stack-sm" aria-label="Rutina para dormir">
        <div class="between-c"><span class="label">Rutina para dormir</span><span class="small muted semi">+2 XP de Vigor cada una</span></div>
        <RoutineChecklist value={routine} onChange={setRoutine} />
      </section>
      <button type="button" class="btn block" onClick={save}><Icon name="moon" size={20} />{prev ? 'Guardar cambios' : 'Descansar y guardar · +5 vitalidad'}</button>
    </main>
  );
}

// ---------- Tienda ----------

export function Shop() {
  const s = useApp();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [cost, setCost] = useState(100);
  return (
    <main class="screen no-nav">
      <TopBar backTo="/" title="Tienda" />
      <section class="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 14, background: 'var(--xp-soft)', borderColor: 'transparent' }} aria-label="Tu oro">
        <span class="tile lg" style={{ background: 'var(--surface)', color: 'var(--xp-ink)' }}><Icon name="coin" size={28} /></span>
        <span class="stack-xs"><span class="eyebrow" style={{ color: 'var(--xp-ink)' }}>Tu oro</span><span class="display-num" style={{ fontSize: 34 }}>{s.gold}</span></span>
      </section>
      <section class="card flush" aria-label="Tus recompensas">
        <div class="stack-xs" style={{ padding: '14px 0 6px' }}><h2 class="h2">Tus recompensas</h2><span class="small muted">Premios de la vida real que eliges y te ganas.</span></div>
        {s.rewards.map((r) => (
          <div class="lrow" key={r.id}>
            <span class="tile sm" style={{ background: 'var(--xp-soft)', color: 'var(--xp-ink)' }}><Icon name="gift" size={18} /></span>
            <span class="grow strong">{r.title}</span>
            <button type="button" class="btn sm" disabled={s.gold < r.cost} onClick={async () => { if (await ask(`¿Canjear «${r.title}» por ${r.cost} de oro?`, { ok: 'Canjear' }) && act((st, t) => redeemReward(st, r.id, t))) toast(`¡Disfruta: ${r.title}!`, 'gift'); }}><Icon name="coin" size={16} />{r.cost}</button>
            <button type="button" class="icon-btn plain" aria-label={`Quitar ${r.title}`} onClick={() => act((st) => { st.rewards = st.rewards.filter((x) => x.id !== r.id); })}><Icon name="close" size={18} /></button>
          </div>
        ))}
        <button type="button" class="lrow" style={{ justifyContent: 'center', fontWeight: 700, minHeight: 52 }} onClick={() => setAdding(true)}><Icon name="plus" size={18} />Añadir recompensa</button>
      </section>
      <section class="stack-sm" aria-label="Objetos">
        <h2 class="eyebrow">Objetos</h2>
        <div class="grid2">
          {SHOP_ITEMS.map((it) => (
            <div key={it.id} class="card tight">
              <span class="tile sm" style={{ background: it.id === 'protector' ? 'var(--emocional-soft)' : 'var(--vit-soft)', color: it.id === 'protector' ? 'var(--emocional)' : 'var(--vit)' }}><Icon name={it.icon} size={18} /></span>
              <span class="strong">{it.title}</span>
              <span class="small muted" style={{ flexGrow: 1 }}>{it.desc}{it.id === 'protector' ? ` Tienes ${s.streak.freezes} de ${it.max}.` : ''}</span>
              <button type="button" class="btn sm ghost" disabled={s.gold < it.cost || (it.id === 'protector' && s.streak.freezes >= it.max)} onClick={() => { if (act((st, t, ev) => buyItem(st, it.id, t, ev))) toast(`Compraste: ${it.title}`, it.icon); else toast('No se pudo comprar hoy', 'info'); }}><Icon name="coin" size={16} />{it.cost}</button>
            </div>
          ))}
        </div>
      </section>
      {s.redeemed.length > 0 && (
        <section class="card flush" aria-label="Canjeadas">
          <div style={{ padding: '14px 0 4px' }}><h2 class="h2">Canjeadas</h2></div>
          {s.redeemed.slice(0, 10).map((r) => <div class="lrow" key={r.id}><span class="grow semi">{r.title}</span><span class="tiny muted">{relDay(r.day, s.energy.day)} · {r.cost}</span></div>)}
        </section>
      )}
      {adding && (
        <Sheet onClose={() => setAdding(false)} label="Nueva recompensa">
          <SheetHead title="Nueva recompensa" onClose={() => setAdding(false)} />
          <div class="field"><label for="rt">¿Qué te vas a regalar?</label><input id="rt" class="input" value={title} maxLength={60} onInput={(e) => setTitle(e.currentTarget.value)} placeholder="Ej. Un helado sin culpa" autoFocus /></div>
          <div class="stack-sm"><span class="label">Precio en oro</span><NumberChips value={cost} onChange={setCost} presets={[50, 100, 150, 300, 500]} unit="de oro" min={1} max={100000} label="Precio en oro" /><span class="small muted">Una misión de energía 1 da 5 de oro; un pendiente, 2.</span></div>
          <button type="button" class="btn block" disabled={title.trim().length < 2} onClick={() => { act((st) => st.rewards.push({ id: uid(), title: title.trim(), cost })); setTitle(''); setAdding(false); toast('Recompensa agregada', 'gift'); }}><Icon name="check" size={20} />Guardar</button>
        </Sheet>
      )}
    </main>
  );
}

// ---------- Crónica ----------

export function Chronicle() {
  const s = useApp();
  const today = s.energy.day;
  const week = weekStats(s, today);
  const by = weekXpBy(s, today);
  const maxBy = Math.max(1, ...Object.values(by));
  const done = week.reduce((a, w) => a + w.done, 0);
  const xp = week.reduce((a, w) => a + w.xp, 0);
  const todos = week.reduce((a, w) => a + (w.todos || 0), 0);
  const moods = s.moods.filter((m) => week.some((w) => w.day === m.day)).length;
  return (
    <main class="screen no-nav">
      <TopBar backTo="/personaje" title="Crónica" />
      <div class="stack-xs"><span class="small muted semi">Últimos 7 días</span><h1 class="h1">Tu semana</h1></div>
      <div class="kpis four">
        <div class="kpi"><span class="v">{done}</span><span class="l">Misiones</span></div>
        <div class="kpi"><span class="v">{todos}</span><span class="l">Pendientes hechos</span></div>
        <div class="kpi"><span class="v" style={{ color: 'var(--xp-ink)' }}>+{xp.toLocaleString('en-US')}</span><span class="l">XP</span></div>
        <div class="kpi"><span class="v">{moods}</span><span class="l">Check-ins</span></div>
      </div>
      <section class="card" aria-label="Vitalidad de la semana">
        <div class="between-c"><h2 class="h2">Vitalidad</h2><span class="small muted">al cierre de cada día</span></div>
        <VitChart week={week} />
      </section>
      <section class="card" aria-label="XP por atributo">
        <h2 class="h2">XP por atributo</h2>
        {AREAS.map((a) => (
          <div key={a.key} class="row" style={{ gap: 10 }}>
            <span class="small semi" style={{ width: 84 }}>{a.attr}</span>
            <div class="grow"><Bar value={by[a.key] / maxBy} size="lg" color={areaColor(a.key)} label={`${a.attr}: ${by[a.key]} XP`} /></div>
            <span class="small strong tab-num" style={{ width: 40, textAlign: 'right' }}>{by[a.key]}</span>
          </div>
        ))}
      </section>
      <section class="card" aria-label="Insignias">
        <div class="between-c"><h2 class="h2">Insignias</h2><span class="small muted">{Object.keys(s.achievements).length} de {ACHIEVEMENTS.length}</span></div>
        <div class="grid3" style={{ rowGap: 16 }}>
          {ACHIEVEMENTS.map((a) => {
            const on = !!s.achievements[a.id];
            return (
              <div key={a.id} class="stack-xs center" style={{ display: 'flex', textAlign: 'center' }} title={a.desc}>
                <span style={{ width: 52, height: 52, borderRadius: 26, background: on ? 'var(--xp-soft)' : 'var(--soft)', color: on ? 'var(--xp-ink)' : 'var(--faint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={on ? a.icon : 'lock'} size={22} /></span>
                <span class="tiny strong" style={{ color: on ? 'var(--ink)' : 'var(--muted)' }}>{a.title}</span>
                <span class="tiny muted" style={{ fontSize: 11 }}>{a.desc}</span>
              </div>
            );
          })}
        </div>
      </section>
      {s.titles.length > 0 && (
        <section class="card" aria-label="Títulos">
          <h2 class="h2">Títulos ganados</h2>
          <div class="chips">{s.titles.map((t) => <span key={t} class="chip tone-xp"><Icon name="crown" size={14} />{t}</span>)}</div>
        </section>
      )}
      {s.journal && s.journal.length > 0 && (
        <section class="card flush" aria-label="Notas">
          <div style={{ padding: '14px 0 4px' }}><h2 class="h2">Notas del día</h2></div>
          {s.journal.slice(0, 8).map((n) => <div class="lrow" key={n.id}><span class="grow small">{n.text}</span><span class="tiny muted">{relDay(n.day, today)}</span></div>)}
        </section>
      )}
    </main>
  );
}

function VitChart({ week }) {
  const W = 320;
  const H = 150;
  const pl = 28;
  const pr = 8;
  const pt = 12;
  const pb = 24;
  const pts = week.map((w, i) => (w.vit == null ? null : [pl + (i * (W - pl - pr)) / 6, pt + (1 - w.vit / 100) * (H - pt - pb)]));
  const valid = pts.filter(Boolean);
  const path = valid.length ? `M${valid.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' L')}` : '';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Vitalidad de la semana: ${week.map((w) => (w.vit == null ? 'sin dato' : w.vit)).join(', ')}`}>
      {[0, 50, 100].map((g) => {
        const y = pt + (1 - g / 100) * (H - pt - pb);
        return <g key={g}><line x1={pl} x2={W - pr} y1={y} y2={y} stroke="var(--line)" /><text x={pl - 6} y={y + 4} text-anchor="end" font-size="11" fill="var(--muted)" font-family="Figtree, sans-serif">{g}</text></g>;
      })}
      {path && <path d={path} fill="none" stroke="var(--vit)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />}
      {pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r="3.8" fill="var(--surface)" stroke="var(--vit)" stroke-width="2" />)}
      {week.map((w, i) => <text key={w.day} x={pl + (i * (W - pl - pr)) / 6} y={H - 6} text-anchor="middle" font-size="11" fill="var(--muted)" font-family="Figtree, sans-serif">{DAYS_SHORT[weekday(w.day)]}</text>)}
    </svg>
  );
}

// ---------- Recuperación ----------

export function Recovery() {
  const s = useApp();
  const today = s.energy.day;
  const rec = s.recovery;
  return (
    <main class="screen no-nav">
      <TopBar backTo="/" close />
      <section class="stack center" style={{ display: 'flex', textAlign: 'center' }}>
        <span style={{ width: 112, height: 112, borderRadius: 56, background: 'var(--vit-soft)', color: 'var(--vit)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="heart" size={52} stroke={1.6} /></span>
        <h1 class="h1">{inRecovery(s, today) ? 'Modo recuperación' : 'Todo en orden'}</h1>
        <p class="lead">{inRecovery(s, today) ? `Tu vitalidad llegó a 0. No pierdes niveles, oro ni insignias. Hasta el ${fmtDay(rec.until, { weekdayName: false })}, cada misión te devuelve el doble de vitalidad.` : 'No estás en recuperación. Si algún día tu vitalidad llega a 0, aquí tendrás misiones cortas para volver.'}</p>
      </section>
      <section class="stack-sm" aria-label="Vitalidad">
        <div class="between small strong"><span class="row" style={{ gap: 6, color: 'var(--vit-ink)' }}><Icon name="heart" size={15} fill />Vitalidad</span><span>{s.vit} / 100 · meta 50</span></div>
        <Segs value={s.vit / 10} lg color="var(--vit)" label={`Vitalidad ${s.vit} de 100`} />
      </section>
      {inRecovery(s, today) && (
        <section class="stack-sm" aria-label="Misiones de recuperación">
          <h2 class="eyebrow">Misiones de recuperación</h2>
          {RECOVERY_QUESTS.map((q) => {
            const done = !!rec.quests[q.id];
            return (
              <button key={q.id} type="button" disabled={done} onClick={() => act((st, t, ev) => completeRecoveryQuest(st, q.id, t, ev))}
                class="row" style={{ minHeight: 60, padding: '0 14px', borderRadius: 18, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', textAlign: 'left', width: '100%', opacity: done ? 0.6 : 1 }}>
                <span class="tile sm" style={{ background: done ? 'var(--good-soft)' : 'var(--soft)', color: done ? 'var(--good)' : 'var(--ink)' }}><Icon name={done ? 'check' : q.icon} size={18} /></span>
                <span class="grow semi" style={done ? { textDecoration: 'line-through' } : null}>{q.title}</span>
                <span class="chip sm tone-vit">+10</span>
              </button>
            );
          })}
        </section>
      )}
      <a class="btn block" href="#/">Volver a Hoy</a>
    </main>
  );
}

export { plural, AREA };
