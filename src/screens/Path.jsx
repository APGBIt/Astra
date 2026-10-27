import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Nav, TopBar, Bar, TChip, Sheet, SheetHead, NumberField, money, num, toast, areaColor, areaSoft, areaInk, ask, cuantos } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { go, back } from '../app/router.js';
import { diffDays, relDay, fmtShort, addDays, fmtDay } from '../app/dates.js';
import { AREA, SOURCES } from '../game/content.js';
import { activeCampaigns, campaignProgress, currentChapter, setTask, bossHP, hitBoss, abandonCampaign, className, editCampaign, addTask, renameTask, removeTask } from '../game/logic.js';
import { toNumber } from '../game/parse.js';

// «1,500 páginas» o «RD$150,000»: el número de la meta con su unidad.
export function goalText(b, v) {
  const n = Math.round((Number(v) || 0) * 100) / 100;
  return b.money ? money(n) : `${num(n)} ${b.unit}`;
}

const goalNum = (b, v) => (b.money ? money(Math.round(v * 100) / 100) : num(Math.round(v * 100) / 100));

export function Path({ query }) {
  const s = useApp();
  const today = s.energy.day;
  const camps = activeCampaigns(s);
  const [cid, setCid] = useState(query.get('c') || (camps[0] && camps[0].id));
  const [editing, setEditing] = useState(false);
  const [editTasks, setEditTasks] = useState(false);
  const c = camps.find((x) => x.id === cid) || camps[0];
  const won = s.campaigns.filter((x) => x.status === 'won');

  if (!c) {
    return (
      <>
        <main class="screen">
          <div class="row"><button type="button" class="icon-btn" aria-label="Volver" onClick={() => back('/personaje')}><Icon name="left" /></button></div>
          <div class="stack-sm"><span class="eyebrow">Clase: {className(s.profile.classKeys)}</span><h1 class="h1">Tu camino</h1></div>
          <div class="empty"><Icon name="map" size={28} /><span>No tienes campañas activas. Elige una meta y conviértela en una campaña con capítulos y un jefe final.</span><a class="btn sm" href="#/meta/nueva">Nueva meta</a></div>
          {won.length > 0 && <WonList s={s} won={won} />}
        </main>
        <Nav active="personaje" />
      </>
    );
  }

  const boss = s.bosses.find((b) => b.id === c.bossId);
  const cur = currentChapter(c);
  const day = Math.min(c.days, diffDays(c.start, today) + 1);
  const prog = campaignProgress(s, c);
  const expected = day / c.days;

  return (
    <>
      <main class="screen">
        <header class="stack">
          <div class="between-c">
            <button type="button" class="icon-btn" aria-label="Volver" onClick={() => back('/personaje')}><Icon name="left" /></button>
            <div class="chips grow" role="group" aria-label="Tus campañas">
              {camps.map((x) => <TChip key={x.id} sm on={x.id === c.id} onClick={() => setCid(x.id)} icon={AREA[x.area].icon} color={areaColor(x.area)}>{AREA[x.area].cls}</TChip>)}
            </div>
            <div class="row" style={{ gap: 8 }}>
              <button type="button" class="icon-btn" aria-label="Editar esta meta" onClick={() => setEditing(true)}><Icon name="edit" /></button>
              <a class="icon-btn" href="#/meta/nueva" aria-label="Nueva meta"><Icon name="plus" /></a>
            </div>
          </div>
          <div class="stack-xs">
            <span class="small strong" style={{ color: areaInk(c.area) }}>Camino del {AREA[c.area].cls}</span>
            <h1 class="h1">{c.title}</h1>
            <span class="muted semi">Día {day} de {c.days} · {prog >= expected - 0.05 ? 'vas a tiempo' : 'un poco atrás: un golpe al jefe te pone al día'}</span>
          </div>
          {boss && (
            <button type="button" class="goalnum" onClick={() => setEditing(true)} aria-label={`Tu meta: ${goalText(boss, boss.target)}. Llevas ${goalText(boss, boss.progress)}. Tocar para cambiar el número`}>
              <span class="tile sm" style={{ background: areaSoft(c.area), color: areaColor(c.area) }}><Icon name="target" size={18} /></span>
              <span class="stack-xs grow" style={{ textAlign: 'left' }}>
                <span class="strong">Meta: {goalText(boss, boss.target)}</span>
                <span class="small muted semi">Llevas {goalNum(boss, boss.progress)} · faltan {goalNum(boss, Math.max(0, boss.target - boss.progress))}</span>
              </span>
              <span class="row small strong" style={{ gap: 4 }}><Icon name="edit" size={16} />Cambiar</span>
            </button>
          )}
          <Bar value={prog} size="lg" color={areaColor(c.area)} label={`Campaña ${Math.round(prog * 100)} %`} />
        </header>

        <div class="between-c" style={{ marginBottom: -12 }}>
          <h2 class="eyebrow">Capítulos</h2>
          <button type="button" class="link-btn" aria-pressed={editTasks ? 'true' : 'false'} onClick={() => setEditTasks(!editTasks)}><Icon name={editTasks ? 'check' : 'edit'} size={16} />{editTasks ? 'Listo' : 'Editar tareas'}</button>
        </div>
        <section class="trail" aria-label="Capítulos">
          {c.chapters.map((ch, i) => {
            const st = i < cur ? 'done' : i === cur ? 'now' : 'lock';
            return (
              <div class="step" key={i}>
                <div class="rail">
                  <span class="node" style={st === 'done' ? { background: areaColor(c.area), color: 'var(--on-accent)' } : st === 'now' ? { border: `3px solid ${areaColor(c.area)}`, background: 'var(--surface)' } : { background: 'var(--soft)', color: 'var(--faint)' }}>
                    {st === 'done' ? <Icon name="check" size={20} stroke={2.8} /> : st === 'now' ? <span style={{ width: 14, height: 14, borderRadius: 7, background: areaColor(c.area), display: 'block' }} /> : <span class="strong small">{i + 1}</span>}
                  </span>
                  <span class="line" style={st === 'done' ? { background: areaColor(c.area) } : null} />
                </div>
                <div class="content">
                  <span class="eyebrow" style={{ color: st === 'lock' ? 'var(--faint)' : areaInk(c.area) }}>Capítulo {i + 1}{st === 'now' ? ' · ahora' : ''}</span>
                  <span class="h2" style={{ color: st === 'lock' ? 'var(--muted)' : undefined }}>{ch.title}</span>
                  {editTasks ? (
                    <div class="stack-sm">
                      {ch.tasks.map((t) => <TaskEdit key={t.id} c={c} t={t} />)}
                      <AddTask c={c} index={i} />
                    </div>
                  ) : (
                    <div>
                      {ch.tasks.map((t) => (
                        <button key={t.id} type="button" class={`task ${t.done ? 'done' : ''}`} aria-pressed={t.done ? 'true' : 'false'} onClick={() => act((stt, tt, ev) => setTask(stt, c.id, t.id, !t.done, tt, ev))}>
                          <span class="box" style={t.done ? { background: areaColor(c.area), borderColor: areaColor(c.area), color: 'var(--on-accent)' } : null}>{t.done && <Icon name="check" size={13} stroke={3} />}</span>
                          <span class="grow">{t.title}</span>
                          {!t.done && <span class="tiny strong" style={{ color: 'var(--xp-ink)' }}>+15</span>}
                        </button>
                      ))}
                      {!ch.tasks.length && <span class="small muted">Sin tareas. Toca «Editar tareas» para agregar.</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {boss && (
            <div class="step">
              <div class="rail"><span class="node" style={{ background: 'var(--boss)', color: 'var(--xp)', borderRadius: 12 }}><Icon name="sword" size={20} /></span></div>
              <div class="content">
                <span class="eyebrow">{cur >= c.chapters.length ? 'La batalla · ahora' : 'Jefe final'}</span>
                <span class="h2">{boss.title}</span>
                <div class="between small strong"><span>Vida del jefe</span><span class="tab-num">{goalText(boss, Math.max(0, boss.target - boss.progress))} · {Math.round(bossHP(boss) * 100)} %</span></div>
                <Bar value={bossHP(boss)} size="lg" color="var(--vit)" label={`Vida del jefe ${Math.round(bossHP(boss) * 100)} %`} />
                <span class="small muted">{SOURCES[boss.source]}. Puedes golpearlo desde ya.</span>
                <a class="btn sm" href={`#/jefe/${boss.id}`} style={{ alignSelf: 'flex-start' }}><Icon name="sword" size={18} />Ir al jefe</a>
              </div>
            </div>
          )}
        </section>

        {boss && boss.reward && (
          <div class="note tone-xp"><Icon name="crown" size={22} /><span><b>Al final:</b> {boss.reward.title ? `título «${boss.reward.title}», ` : ''}+{boss.reward.xp} XP de {AREA[c.area].attr} y {boss.reward.gold} de oro.</span></div>
        )}
        {won.length > 0 && <WonList s={s} won={won} />}
        <button type="button" class="link-btn muted" style={{ alignSelf: 'center' }} onClick={async () => { if (await ask(`¿Abandonar «${c.title}»? Sus misiones se archivan.`, { ok: 'Abandonar', danger: true })) { act((st) => abandonCampaign(st, c.id)); toast('Campaña abandonada', 'map'); } }}>Abandonar esta campaña</button>
      </main>
      <Nav active="personaje" />
      {editing && <EditGoalSheet c={c} onClose={() => setEditing(false)} />}
    </>
  );
}

function TaskEdit({ c, t }) {
  const [v, setV] = useState(t.title);
  return (
    <div class="row" style={{ gap: 6 }}>
      <input class="input" style={{ minHeight: 44 }} value={v} maxLength={80} aria-label="Nombre de la tarea" onInput={(e) => setV(e.currentTarget.value)} onBlur={() => { if (v.trim() !== t.title) act((st) => renameTask(st, c.id, t.id, v)); }} />
      <button type="button" class="icon-btn" aria-label={`Quitar la tarea ${t.title}`} onClick={async () => { if (await ask(`¿Quitar la tarea «${t.title}»?`, { ok: 'Quitar', danger: true })) act((st) => removeTask(st, c.id, t.id)); }}><Icon name="trash" size={18} /></button>
    </div>
  );
}

function AddTask({ c, index }) {
  const [v, setV] = useState('');
  const add = () => { if (v.trim().length < 2) return; act((st) => addTask(st, c.id, index, v)); setV(''); };
  return (
    <div class="row" style={{ gap: 6 }}>
      <input class="input" style={{ minHeight: 44, borderStyle: 'dashed' }} value={v} maxLength={80} placeholder="Nueva tarea" aria-label="Nueva tarea" onInput={(e) => setV(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
      <button type="button" class="icon-btn" aria-label="Agregar tarea" disabled={v.trim().length < 2} onClick={add} style={v.trim().length > 1 ? { background: 'var(--ink)', color: 'var(--on-ink)' } : null}><Icon name="plus" size={20} /></button>
    </div>
  );
}

// Cambia la meta después de creada: nombre, número, unidad y fecha límite.
export function EditGoalSheet({ c, onClose }) {
  const s = useApp();
  const today = s.energy.day;
  const b = s.bosses.find((x) => x.id === c.bossId);
  const [title, setTitle] = useState(c.title);
  const [target, setTarget] = useState(b ? b.target : 0);
  const [unit, setUnit] = useState(b ? b.unit : '');
  const [deadline, setDeadline] = useState(c.deadline);
  const step = b && b.money ? (b.target >= 100000 ? 5000 : 1000) : b && b.target >= 300 ? 50 : b && b.target >= 60 ? 5 : 1;
  const willWin = b && b.status === 'active' && target > 0 && b.progress >= target;
  const fmt = (v) => (b && b.money ? money(v) : `${num(v)} ${unit || (b && b.unit) || ''}`);
  const save = () => {
    act((st, t, ev) => editCampaign(st, c.id, { title, target, unit, deadline }, t, ev));
    toast('Meta actualizada', 'map');
    onClose();
  };
  return (
    <Sheet onClose={onClose} label="Editar meta">
      <SheetHead title="Editar meta" onClose={onClose} />
      <div class="field"><label for="eg-t">Nombre de la meta</label><input id="eg-t" class="input" value={title} maxLength={60} onInput={(e) => setTitle(e.currentTarget.value)} /></div>
      {b && (
        <div class="field">
          <label for="eg-n">{b.money ? '¿Cuánto en total? (RD$)' : cuantos(unit || b.unit)}</label>
          <NumberField id="eg-n" value={target} onChange={setTarget} step={step} min={0} prefix={b.money ? 'RD$' : ''} unit={b.money ? '' : (unit || b.unit)} label="Número de la meta" />
          <span class="small muted">Llevas {fmt(b.progress)}. El número es la vida del jefe.</span>
          {willWin && <span class="small strong" style={{ color: 'var(--good-ink)' }}>Con este número ya alcanzaste tu meta: al guardar vences al jefe.</span>}
        </div>
      )}
      {b && !b.money && <div class="field"><label for="eg-u">¿Cómo la mides?</label><input id="eg-u" class="input" value={unit} maxLength={20} onInput={(e) => setUnit(e.currentTarget.value)} placeholder="Ej. módulos, kilos, avances" /></div>}
      <div class="field">
        <label for="eg-d">Fecha límite</label>
        <input id="eg-d" type="date" class="input" value={deadline} min={addDays(c.start, 1)} onInput={(e) => setDeadline(e.currentTarget.value || c.deadline)} />
        <div class="chips">{[30, 90].map((d) => <TChip key={d} sm onClick={() => setDeadline(addDays(deadline, d))}>+{d} días</TChip>)}</div>
        <span class="small muted">Hasta el {fmtDay(deadline, { weekdayName: false })} · {diffDays(c.start, deadline)} días en total.</span>
      </div>
      <button type="button" class="btn block" disabled={title.trim().length < 2 || !(target > 0)} onClick={save}><Icon name="check" size={20} />Guardar meta</button>
    </Sheet>
  );
}

function WonList({ s, won }) {
  return (
    <section class="stack-sm" aria-label="Campañas ganadas">
      <h2 class="eyebrow">Campañas ganadas</h2>
      {won.map((c) => (
        <div key={c.id} class="row card tight" style={{ flexDirection: 'row' }}>
          <span class="tile sm" style={{ background: 'var(--xp-soft)', color: 'var(--xp-ink)' }}><Icon name="crown" size={18} /></span>
          <span class="stack-xs grow"><span class="strong">{c.title}</span><span class="tiny muted">{AREA[c.area].cls} · ganada el {fmtShort(c.wonOn || c.start)}</span></span>
        </div>
      ))}
    </section>
  );
}

export function Boss({ id }) {
  const s = useApp();
  const today = s.energy.day;
  const b = s.bosses.find((x) => x.id === id);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(false);
  if (!b) {
    return <main class="screen no-nav"><TopBar backTo="/camino" /><div class="empty">Este jefe ya no existe.</div></main>;
  }
  const hp = bossHP(b);
  const camp = s.campaigns.find((x) => x.id === b.campaignId);
  const n = toNumber(String(amount).replace(/[^\d.,]/g, '')) || 0;
  const fmt = (v) => (b.money ? money(v) : `${Math.round(v * 100) / 100} ${b.unit}`);
  const hit = () => {
    if (!n) return;
    act((st, t, ev) => hitBoss(st, b.id, n, note, t, ev));
    toast(`Golpe de ${fmt(n)}`, 'sword');
    setAmount('');
    setNote('');
    setOpen(false);
  };
  return (
    <main class="screen no-nav">
      <TopBar backTo="/camino" right={camp && b.status === 'active' ? <button type="button" class="icon-btn" aria-label="Editar la meta" onClick={() => setEdit(true)}><Icon name="edit" /></button> : null} />
      <section class="stack center" style={{ display: 'flex', textAlign: 'center' }}>
        <span class="eyebrow" style={{ color: areaInk(b.area) }}>Jefe · {AREA[b.area].attr}</span>
        <h1 class="h1">{b.title}</h1>
        <BossArt won={b.status === 'won'} />
      </section>
      <section class="stack-sm" aria-label="Vida del jefe">
        <div class="between strong"><span>{b.status === 'won' ? 'Derrotado' : 'Vida del jefe'}</span><span>{Math.round(hp * 100)} %</span></div>
        <Bar value={hp} size="xl" color="var(--vit)" label={`Vida del jefe ${Math.round(hp * 100)} %`} />
        <div class="between small muted semi"><span>{fmt(b.progress)} de {fmt(b.target)}</span>{b.deadline && <span>Hasta el {fmtShort(b.deadline)}</span>}</div>
      </section>
      {b.status === 'active' && (
        <>
          <div class="note"><Icon name="info" size={18} /><span>{SOURCES[b.source]}{b.source === 'debtPay' ? ' (categoría «Pago de deuda» en Finanzas)' : b.source === 'saving' ? ' (categoría «Ahorro» en Finanzas)' : ''}. También puedes registrar un golpe a mano.</span></div>
          <button type="button" class="btn block" onClick={() => setOpen(true)}><Icon name="sword" size={20} />Registrar un golpe</button>
        </>
      )}
      {b.status === 'won' && <div class="note tone-xp"><Icon name="crown" size={22} /><span>Lo derrotaste el {fmtShort(b.wonOn)}. {b.reward.title ? `Tu título: «${b.reward.title}».` : ''}</span></div>}
      <section class="card flush" aria-label="Bitácora de batalla">
        <div style={{ padding: '14px 0 4px' }}><h2 class="h2">Bitácora de batalla</h2></div>
        {!b.hits.length && <p class="small muted" style={{ padding: '4px 0 16px' }}>Todavía no hay golpes. El primero es el más importante.</p>}
        {b.hits.slice(0, 30).map((h, i) => (
          <div key={i} class="lrow">
            <span class="stack-xs grow"><span class="tiny muted semi">{relDay(h.day, today)}{h.source !== 'manual' ? ' · automático' : ''}</span><span class="semi">{h.note || 'Golpe'}</span></span>
            <span class="strong" style={{ color: 'var(--good-ink)' }}>−{fmt(h.amount)}</span>
          </div>
        ))}
      </section>
      <div class="note tone-xp"><Icon name="trophy" size={20} /><span><b>Botín:</b> +{b.reward.xp} XP, {b.reward.gold} de oro{b.reward.title ? ` y el título «${b.reward.title}»` : ''}.</span></div>
      {open && (
        <Sheet onClose={() => setOpen(false)} label="Registrar un golpe">
          <SheetHead title="Registrar un golpe" onClose={() => setOpen(false)} />
          <div class="field"><label for="hit">{b.money ? 'Monto (RD$)' : cuantos(b.unit)}</label><input id="hit" class="input big" inputMode="decimal" value={amount} onInput={(e) => setAmount(e.currentTarget.value)} autoFocus /></div>
          <div class="field"><label for="hn">Nota (opcional)</label><input id="hn" class="input" value={note} maxLength={60} onInput={(e) => setNote(e.currentTarget.value)} placeholder="Ej. Pago extra de la quincena" /></div>
          {n > 0 && <span class="small muted">Le quitas {Math.round((Math.min(n, b.target - b.progress) / b.target) * 100)} % de vida.</span>}
          <button type="button" class="btn block" disabled={!n} onClick={hit}><Icon name="sword" size={20} />Golpear</button>
        </Sheet>
      )}
      {edit && camp && <EditGoalSheet c={camp} onClose={() => setEdit(false)} />}
    </main>
  );
}

function BossArt({ won }) {
  return (
    <svg width="150" height="150" viewBox="0 0 170 170" role="img" aria-label={won ? 'Jefe derrotado' : 'Ilustración del jefe'} style={{ alignSelf: 'center', opacity: won ? 0.45 : 1 }}>
      <circle cx="85" cy="85" r="80" fill="var(--soft)" />
      <path d="M85 18 108 44 142 40 132 74 154 98 120 108 112 142 85 124 58 142 50 108 16 98 38 74 28 40 62 44z" fill="var(--ink)" />
      <path d="M85 46 110 72 104 110 85 122 66 110 60 72z" fill="var(--ink-2)" stroke="var(--vit)" stroke-width="2.5" stroke-linejoin="round" />
      <ellipse cx="85" cy="84" rx="18" ry={won ? 2 : 11} fill="var(--xp)" />
      {!won && <ellipse cx="85" cy="84" rx="4" ry="10" fill="var(--ink)" />}
      <path d="M72 104l6 6 7-6 7 6 6-6" fill="none" stroke="var(--xp)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export { go, areaSoft };
