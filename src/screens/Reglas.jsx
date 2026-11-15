// Automatizaciones (2.0): «si pasa esto → haz esto». Recetas listas para activar con un toque y reglas propias.
import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Sheet, SheetHead, TChip, Switch, NumberField, Empty, toast, ask, plural } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { fmtShort } from '../app/dates.js';
import { WHEN, THEN, rulesOf, addRule, updateRule, removeRule, ruleText, ruleIdeas, ruleStats } from '../game/rules.js';
import { tagsOf } from '../game/tags.js';

const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const DAY = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const DAY_NAME = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function RulesTab({ s }) {
  const rules = rulesOf(s);
  const ideas = ruleIdeas(s);
  const st = ruleStats(s);
  const [sheet, setSheet] = useState(null);
  const byId = Object.fromEntries(rules.map((r) => [r.id, r]));
  return (
    <>
      <section class="stack-sm" aria-label="Automatizaciones">
        <span class="eyebrow">Automático</span>
        <h2 class="h1">{st.on ? `${plural(st.on, 'regla trabaja', 'reglas trabajan')} por ti` : 'Que Astra lo haga sola'}</h2>
        <p class="lead">Reglas sencillas: cuando pasa algo que ya registras, Astra hace el siguiente paso sin que se lo pidas.{st.runs ? ` Ya lo ha hecho ${plural(st.runs, 'vez', 'veces')}.` : ''}</p>
      </section>

      {rules.length > 0 && (
        <section class="stack-xs" aria-label="Tus reglas">
          <h2 class="eyebrow">Tus reglas</h2>
          <div>
            {rules.map((r) => {
              const t = ruleText(s, r);
              return (
                <div key={r.id} class="rule-row" style={{ opacity: r.on ? 1 : 0.6 }}>
                  <button type="button" class="rule-body" onClick={() => setSheet({ id: r.id })} aria-label={`Editar: ${t.full}`}>
                    <span class="row" style={{ gap: 8 }}><Icon name={WHEN[r.when.type].icon} size={16} /><span class="semi">{t.when}</span></span>
                    <span class="row small muted" style={{ gap: 8 }}><Icon name="right" size={14} /><span>{t.then}</span></span>
                    {r.runs > 0 && <span class="tiny muted">{plural(r.runs, 'vez', 'veces')}{r.last ? ` · última: ${fmtShort(r.last)}` : ''}</span>}
                  </button>
                  <Switch checked={r.on} onChange={(v) => act((x) => updateRule(x, r.id, { on: v }))} label={`Regla activa: ${t.full}`} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      <button type="button" class="btn soft block" onClick={() => setSheet({ id: null })}><Icon name="plus" size={20} />Crear una regla</button>

      {ideas.length > 0 && (
        <section class="stack-xs" aria-label="Recetas">
          <h2 class="eyebrow">Recetas para activar con un toque</h2>
          <div>
            {ideas.map((i) => (
              <div key={i.key} class="rule-row">
                <div class="rule-body" style={{ cursor: 'default' }}>
                  <span class="row" style={{ gap: 8 }}><Icon name={WHEN[i.when.type].icon} size={16} /><span class="semi">{i.text.when}</span></span>
                  <span class="row small muted" style={{ gap: 8 }}><Icon name="right" size={14} /><span>{i.text.then}</span></span>
                  <span class="tiny muted">{i.why}</span>
                </div>
                <button type="button" class="btn sm soft" aria-label={`Activar: ${i.text.full}`} onClick={() => { const r = act((x, d) => addRule(x, { when: i.when, then: i.then }, d, nowMin())); if (r) toast('Regla activada', 'wand'); }}>Activar</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {!rules.length && !ideas.length && <Empty icon="wand">Crea tu primera regla.</Empty>}

      {st.log.length > 0 && (
        <section class="card" aria-label="Lo que Astra hizo sola">
          <h2 class="h2">Lo que Astra hizo sola</h2>
          {st.log.map((l) => (
            <div key={l.id} class="row" style={{ minHeight: 40, alignItems: 'flex-start', gap: 10 }}>
              <span class="tiny muted" style={{ width: 52, flexShrink: 0, paddingTop: 2 }}>{fmtShort(l.day)}</span>
              <span class="stack-xs grow"><span class="small semi">{l.text}</span>{l.why && <span class="tiny muted">{l.why}{byId[l.rule] ? '' : ' · regla borrada'}</span>}</span>
            </div>
          ))}
        </section>
      )}
      <p class="small muted">Las reglas corren en tu teléfono, con la app abierta o al abrirla. Una regla nunca borra ni paga nada: solo crea pendientes, agrega a tu lista o te avisa.</p>

      {sheet && <RuleSheet id={sheet.id} onClose={() => setSheet(null)} />}
    </>
  );
}

function RuleSheet({ id, onClose }) {
  const s = useApp();
  const r = id ? rulesOf(s).find((x) => x.id === id) : null;
  const tags = tagsOf(s);
  const w0 = r ? r.when : { type: 'income', min: 0 };
  const t0 = r ? r.then : { type: 'todo', title: '', due: 'hoy' };
  const [wt, setWt] = useState(w0.type);
  const [min, setMin] = useState(w0.min || 0);
  const [hours, setHours] = useState(w0.hours || 6);
  const [level, setLevel] = useState(w0.level || 40);
  const [tag, setTag] = useState(w0.tag || (tags[0] && tags[0].id) || '');
  const [days, setDays] = useState(w0.days || [0]);
  const [at, setAt] = useState(w0.at || '18:00');
  const [tt, setTt] = useState(t0.type);
  const [title, setTitle] = useState(t0.title || '');
  const [due, setDue] = useState(t0.due || 'hoy');
  const [text, setText] = useState(t0.text || '');
  const when = wt === 'income' ? { type: wt, min } : wt === 'expense' ? { type: wt, min } : wt === 'sleep' ? { type: wt, hours } : wt === 'vit' ? { type: wt, level } : wt === 'tag' ? { type: wt, tag } : wt === 'time' ? { type: wt, days, at } : { type: wt };
  const then = tt === 'todo' ? { type: tt, title, due } : { type: tt, text };
  const okWhen = wt === 'expense' ? min > 0 : wt === 'tag' ? !!tag : wt === 'time' ? days.length > 0 && /^\d{2}:\d{2}$/.test(at) : true;
  const okThen = tt === 'todo' ? title.trim().length >= 2 : text.trim().length >= 2;
  const save = () => {
    const res = act((x, d) => (r ? updateRule(x, r.id, { when, then }) : addRule(x, { when, then }, d, nowMin())));
    if (!res) { toast('No pude guardar la regla', 'info'); return; }
    toast(r ? 'Regla guardada' : 'Regla activada', 'wand');
    onClose();
  };
  const toggleDay = (d) => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort());
  return (
    <Sheet onClose={onClose} label="Regla">
      <SheetHead title={r ? 'Editar regla' : 'Nueva regla'} onClose={onClose} />
      <div class="field"><label>Si pasa esto…</label>
        <div class="chips" role="group" aria-label="Cuándo">
          {Object.entries(WHEN).filter(([k]) => k !== 'tag' || tags.length > 0).map(([k, w]) => <TChip key={k} sm icon={w.icon} on={wt === k} onClick={() => setWt(k)}>{w.label.replace(/^Cuando /, '').replace(/^./, (c) => c.toUpperCase())}</TChip>)}
        </div>
      </div>
      {(wt === 'income' || wt === 'expense') && <div class="field"><label>{wt === 'income' ? 'De este monto o más (0 = cualquiera)' : 'De este monto o más'}</label><NumberField value={min} onChange={setMin} step={500} min={0} prefix="RD$" label="Monto" /></div>}
      {wt === 'sleep' && <div class="field"><label>Menos de</label><div class="chips" role="group" aria-label="Horas">{[5, 5.5, 6, 6.5, 7].map((h) => <TChip key={h} sm on={hours === h} onClick={() => setHours(h)}>{String(h).replace('.5', '½')} h</TChip>)}</div></div>}
      {wt === 'vit' && <div class="field"><label>Por debajo de</label><div class="chips" role="group" aria-label="Vitalidad">{[20, 30, 40, 50, 60].map((v) => <TChip key={v} sm on={level === v} onClick={() => setLevel(v)}>{v}</TChip>)}</div></div>}
      {wt === 'tag' && <div class="field"><label>¿Cuál etiqueta?</label><div class="chips" role="group" aria-label="Etiqueta">{tags.map((t) => <TChip key={t.id} sm on={tag === t.id} onClick={() => setTag(t.id)}>{t.name}</TChip>)}</div></div>}
      {wt === 'time' && (
        <div class="field"><label>Días y hora</label>
          <div class="chips" role="group" aria-label="Días">{DAY.map((d, i) => <TChip key={i} sm on={days.includes(i)} label={DAY_NAME[i]} onClick={() => toggleDay(i)}>{d}</TChip>)}</div>
          <input class="input" type="time" value={at} aria-label="Hora" onInput={(e) => setAt(e.currentTarget.value)} />
        </div>
      )}
      <div class="field"><label>…Astra hace esto</label>
        <div class="chips" role="group" aria-label="Acción">{Object.entries(THEN).map(([k, t]) => <TChip key={k} sm icon={t.icon} on={tt === k} onClick={() => setTt(k)}>{t.label}</TChip>)}</div>
      </div>
      {tt === 'todo' && (
        <div class="field"><label for="rl-t">Pendiente</label>
          <input id="rl-t" class="input" value={title} maxLength={100} placeholder="Ej. Apartar para el ahorro" onInput={(e) => setTitle(e.currentTarget.value)} />
          <div class="chips" role="group" aria-label="Para cuándo"><TChip sm on={due === 'hoy'} onClick={() => setDue('hoy')}>Para ese día</TChip><TChip sm on={due === 'manana'} onClick={() => setDue('manana')}>Para el día siguiente</TChip></div>
        </div>
      )}
      {tt === 'shop' && <div class="field"><label for="rl-s">Producto</label><input id="rl-s" class="input" value={text} maxLength={60} placeholder="Ej. botellón de agua" onInput={(e) => setText(e.currentTarget.value)} /></div>}
      {tt === 'note' && <div class="field"><label for="rl-n">Aviso</label><input id="rl-n" class="input" value={text} maxLength={140} placeholder="Ej. Hoy solo lo esencial" onInput={(e) => setText(e.currentTarget.value)} /></div>}
      {okWhen && okThen && <p class="small muted">{ruleText(s, { when, then }).full}</p>}
      <button type="button" class="btn block" disabled={!okWhen || !okThen} onClick={save}><Icon name="check" size={20} />{r ? 'Guardar' : 'Activar regla'}</button>
      {r && (
        <button type="button" class="btn ghost block" style={{ color: 'var(--vit-ink)' }} onClick={async () => {
          if (await ask('¿Borrar esta regla?', { ok: 'Borrar', danger: true })) { act((x) => removeRule(x, r.id)); toast('Regla borrada', 'trash'); onClose(); }
        }}><Icon name="trash" size={18} />Borrar regla</button>
      )}
    </Sheet>
  );
}
