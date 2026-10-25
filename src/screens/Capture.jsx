import { useState, useRef } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Sheet, SheetHead, money, cur, toast, areaColor, areaSoft, dueLabel } from '../ui/kit.jsx';
import { canDictate, dictate } from '../ui/dictate.js';
import { act, useApp } from '../app/store.js';
import { back, go } from '../app/router.js';
import { parseCapture } from '../game/parse.js';
import { MOOD_QUADS } from '../game/content.js';
import {
  dayMissions, addTx, logHealth, completeMission, addPerson, contactPerson, addMood, finishFocus, logCalm, logPages, addBook, catName, fmtHours, uid,
  addTodo, todoCategory, repeatLabel, accountLabel, taxSuggestion,
} from '../game/logic.js';
import { cardForText } from '../game/money.js';
import { logCalmSession, addJournal } from '../game/mind.js';
import { shopFromCapture } from '../game/shop.js';
import { qtyText } from '../game/shoplex.js';
import { aiProvider, aiJSON, capturePrompt, aiErrorText } from '../ai/ai.js';

const SHORTCUTS = [
  { href: '/pendientes/nuevo', icon: 'list', label: 'Pendiente', area: null },
  { href: '/compras', icon: 'cart', label: 'Lista de compras', area: 'finanzas' },
  { href: '/recibo', icon: 'camera', label: 'Escanear recibo', area: 'finanzas' },
  { href: '/finanzas?alerta=1', icon: 'paste', label: 'Pegar alerta del banco', area: 'finanzas' },
  { href: '/animo', icon: 'face', label: 'Ánimo', area: 'emocional' },
  { href: '/enfoque', icon: 'timer', label: 'Enfoque', area: 'laborales' },
  { href: '/personas', icon: 'people', label: 'Contacto', area: 'relaciones' },
];

export function describeItem(s, it) {
  switch (it.kind) {
    case 'tx': {
      const card = it.type === 'gasto' && it.cat === 'deuda' && /tarjeta|visa|master|amex/i.test(it.text || '') ? cardForText(s, it.text) : null;
      if (card) return { icon: 'card', area: 'finanzas', title: `Pago a la tarjeta · ${cur(it.amount, it.currency)}`, sub: `${accountLabel(card)} · baja lo que debes` };
      return { icon: 'coins', area: 'finanzas', title: `${it.type === 'ingreso' ? 'Ingreso' : 'Gasto'} · ${cur(it.amount, it.currency)}`, sub: `${catName(s, it.cat)}${it.merchant ? ` · ${it.merchant}` : ''}` };
    }
    case 'health': {
      const map = { steps: ['Pasos', `${Number(it.value).toLocaleString('en-US')} pasos`], sleep: ['Sueño', fmtHours(it.value)], water: ['Agua', `${it.value} vasos`], exercise: ['Ejercicio', `${it.value} minutos`] };
      const [t, v] = map[it.field];
      return { icon: 'pulse', area: 'salud', title: `${t} · ${v}`, sub: 'Salud de hoy' };
    }
    case 'pages': return { icon: 'book', area: 'crecimiento', title: `Leíste ${it.value} páginas`, sub: 'Se suma a tu libro actual' };
    case 'contact': return { icon: 'people', area: 'relaciones', title: `Contacto con ${it.name}`, sub: it.personId ? 'De tu lista' : 'Se agrega a tu lista' };
    case 'mood': return { icon: 'face', area: 'emocional', title: `Ánimo · ${it.word || MOOD_QUADS[it.quad].label}`, sub: MOOD_QUADS[it.quad].desc };
    case 'shop': return { icon: 'cart', area: 'finanzas', title: `${it.out ? 'Se acabó' : 'A la lista de compras'} · ${it.items.map((x) => `${qtyText(x.qty, x.unit) ? `${qtyText(x.qty, x.unit)} ` : ''}${x.name.toLowerCase()}`).join(', ')}`, sub: it.out ? 'Se marca agotado en tu despensa y entra a la lista' : 'Lista de compras' };
    case 'mission': return { icon: 'check', area: s.missions.find((m) => m.id === it.missionId)?.area || 'crecimiento', title: `Completa «${it.title}»`, sub: 'Misión de hoy' };
    case 'focus': return { icon: 'timer', area: 'laborales', title: `Enfoque · ${it.minutes} minutos`, sub: 'Sesión de trabajo' };
    case 'calm': return { icon: 'face', area: 'emocional', title: `Calma · ${it.minutes} minutos`, sub: 'Respiración o meditación' };
    case 'todo': {
      const c = todoCategory(s, it.cat);
      return { icon: c.id === 'hogar' ? 'home' : 'list', area: c.color || c.area, title: `Pendiente · ${it.title}`, sub: `${c.name}${it.due ? ` · ${dueLabel(it.due, s.energy.day).toLowerCase()}` : ''}${it.repeat ? ` · ${repeatLabel(it.repeat).toLowerCase()}` : ''}${it.important ? ' · importante' : ''}` };
    }
    default: return { icon: 'note', area: 'emocional', title: 'Nota del día', sub: it.text };
  }
}

export function applyItems(st, items, today, ev) {
  let n = 0;
  for (const it of items) {
    n += 1;
    switch (it.kind) {
      case 'tx': {
        const card = it.type === 'gasto' && it.cat === 'deuda' && /tarjeta|visa|master|amex/i.test(it.text || '') ? cardForText(st, it.text) : null;
        if (card) {
          // Pagar la tarjeta desde tu cuenta de banco paga el impuesto a transferencias (se anota aparte).
          const p = { type: 'transfer', amount: it.amount, currency: it.currency, cat: 'pago_tarjeta', merchant: `Pago a ${accountLabel(card)}`, account: card.payFrom || '', to: card.id, source: 'voz', day: today };
          addTx(st, { ...p, tax: taxSuggestion(st, p).on }, today, ev);
        }
        else addTx(st, { type: it.type, amount: it.amount, currency: it.currency, cat: it.cat, merchant: it.merchant ? it.merchant[0].toUpperCase() + it.merchant.slice(1) : '', source: 'voz' }, today, ev);
        break;
      }
      case 'health': logHealth(st, today, { [it.field]: it.field === 'exercise' ? (st.health[today]?.exercise || 0) + it.value : it.value }, today, ev); break;
      case 'pages': {
        let b = st.books.find((x) => !x.done);
        if (!b) b = addBook(st, { title: 'Lectura libre', pages: 300 });
        logPages(st, b.id, it.value, today, ev);
        break;
      }
      case 'contact': {
        let pid = it.personId;
        if (!pid) pid = addPerson(st, { name: it.name, every: 14 }, today).id;
        contactPerson(st, pid, 'contacto', today, ev);
        break;
      }
      case 'mood': addMood(st, { quad: it.quad, words: it.word ? [it.word] : [] }, today, ev); break;
      case 'mission': completeMission(st, it.missionId, today, ev); break;
      case 'focus': finishFocus(st, { minutes: it.minutes, label: 'Registrado' }, today, ev); break;
      case 'calm': logCalmSession(st, { kind: 'registro', title: 'Calma registrada', minutes: it.minutes }, today, ev); break;
      case 'todo': addTodo(st, { title: it.title, cat: it.cat, due: it.due, important: it.important, repeat: it.repeat }, today); break;
      case 'shop': shopFromCapture(st, it, today); break;
      default:
        addJournal(st, { kind: 'nota', text: String(it.text || '').slice(0, 500) }, today, ev);
    }
  }
  return n;
}

export function Capture() {
  const s = useApp();
  const today = s.energy.day;
  const [text, setText] = useState('');
  const [items, setItems] = useState(null);
  const [off, setOff] = useState({});
  const [listening, setListening] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState('');
  const stop = useRef(null);
  const close = () => back('/');

  const understand = (t = text) => {
    const ctx = { people: s.people, missions: dayMissions(s, today).pending, today };
    setItems(parseCapture(t, ctx));
    setOff({});
    setAiMsg('');
  };

  const mic = () => {
    if (listening) { if (stop.current) stop.current(); setListening(false); return; }
    setListening(true);
    stop.current = dictate((t) => setText(t), () => { setListening(false); });
  };

  const withAI = async () => {
    setAiBusy(true);
    setAiMsg('');
    try {
      const p = await aiProvider(s.settings);
      if (!p) throw { code: 'no_ai' };
      const r = await aiJSON(p, capturePrompt(text, s.people, today), { task: 'texto' });
      const list = Array.isArray(r.items) ? r.items : [];
      const fixed = list.map((it) => {
        if (it.kind === 'contact') {
          const person = s.people.find((pp) => pp.name.toLowerCase().split(' ')[0] === String(it.name || '').toLowerCase().split(' ')[0]);
          return { ...it, personId: person ? person.id : null, name: person ? person.name : it.name };
        }
        if (it.kind === 'mood') return { ...it, quad: Math.max(0, Math.min(3, Number(it.quad) || 0)) };
        if (it.kind === 'tx') return { ...it, type: it.type === 'ingreso' ? 'ingreso' : 'gasto', amount: Math.abs(Number(it.amount) || 0), currency: it.currency === 'USD' ? 'USD' : 'DOP' };
        if (it.kind === 'todo') return { ...it, title: String(it.title || '').slice(0, 120), due: /^\d{4}-\d{2}-\d{2}$/.test(it.due || '') ? it.due : null, cat: it.cat || 'general', important: !!it.important, repeat: ['semana', 'mes', 'ano'].includes(it.repeat) ? it.repeat : null };
        return it;
      }).filter((it) => ['tx', 'health', 'pages', 'contact', 'mood', 'focus', 'note', 'calm', 'todo'].includes(it.kind) && (it.kind !== 'todo' || it.title));
      if (fixed.length) { setItems(fixed); setOff({}); } else setAiMsg('La IA tampoco encontró algo que registrar.');
    } catch (e) {
      setAiMsg(aiErrorText(e));
    } finally {
      setAiBusy(false);
    }
  };

  const save = () => {
    const chosen = items.filter((_, i) => !off[i]);
    if (!chosen.length) return;
    const n = act((st, t, ev) => applyItems(st, chosen, t, ev));
    toast(n === 1 ? 'Registrado' : `${n} registros guardados`, 'check');
    close();
  };

  const onlyNotes = items && items.length > 0 && items.every((it) => it.kind === 'note');

  return (
    <Sheet onClose={close} label="Registrar">
      <SheetHead title="Registrar" onClose={close} />
      <div class="field">
        <label for="cap">Escríbelo o dilo como te salga</label>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '8px 8px 8px 16px', background: 'var(--surface)', border: '2px solid var(--ink)', borderRadius: 22 }}>
          <textarea id="cap" rows={2} value={text} maxLength={600} placeholder="Ej. Gasté 850 en el súper y caminé 40 minutos" onInput={(e) => { setText(e.currentTarget.value); setItems(null); }}
            style={{ flex: '1 1 auto', border: 'none', outline: 'none', resize: 'none', background: 'transparent', fontSize: 16, lineHeight: 1.4, color: 'var(--ink)', minHeight: 48 }} />
          {canDictate && <button type="button" class="icon-btn" aria-label={listening ? 'Detener dictado' : 'Dictar'} aria-pressed={listening ? 'true' : 'false'} onClick={mic} style={listening ? { background: 'var(--vit)', color: 'var(--on-accent)' } : null}><Icon name="mic" size={20} /></button>}
        </div>
        {!items && <button type="button" class="btn block" disabled={text.trim().length < 3} onClick={() => understand()}><Icon name="sparkle" size={18} />Entender</button>}
      </div>

      {items && (
        <section class="stack-sm" aria-label="Lo que entendí" style={{ padding: 12, background: 'var(--soft)', borderRadius: 22 }}>
          <span class="row eyebrow" style={{ gap: 6 }}><Icon name="sparkle" size={14} />{items.length === 1 ? 'Entendí 1 cosa' : `Entendí ${items.length} cosas`}</span>
          {items.map((it, i) => {
            const d = describeItem(s, it);
            const on = !off[i];
            return (
              <label key={i} class="row" style={{ gap: 12, padding: 12, background: 'var(--surface)', borderRadius: 16, cursor: 'pointer', opacity: on ? 1 : 0.55 }}>
                <span class="tile sm" style={{ background: areaSoft(d.area), color: areaColor(d.area) }}><Icon name={d.icon} size={18} /></span>
                <span class="stack-xs grow"><span class="strong">{d.title}</span><span class="small muted">{d.sub}</span></span>
                <input type="checkbox" checked={on} onChange={() => setOff({ ...off, [i]: on })} aria-label={`Incluir: ${d.title}`} style={{ width: 22, height: 22, accentColor: 'var(--ink)', margin: 0 }} />
              </label>
            );
          })}
          {onlyNotes && (
            <div class="stack-sm">
              <span class="small muted">No reconocí gastos, hábitos ni personas. Se guardará como nota del día.</span>
              <button type="button" class="btn sm soft" disabled={aiBusy} onClick={withAI}><Icon name="sparkle" size={16} />{aiBusy ? 'Pensando…' : 'Entender con IA'}</button>
            </div>
          )}
          {aiMsg && <span class="small" style={{ color: 'var(--vit-ink)' }}>{aiMsg}</span>}
          <div class="row" style={{ paddingTop: 4 }}>
            <button type="button" class="btn sm grow" onClick={save} disabled={items.every((_, i) => off[i])}><Icon name="check" size={18} />Guardar</button>
            <button type="button" class="btn sm ghost" onClick={() => setItems(null)}>Editar</button>
          </div>
        </section>
      )}

      <div class="stack-sm">
        <span class="label">O elige un atajo</span>
        <div class="grid3">
          {SHORTCUTS.map((x) => (
            <a key={x.href} href={`#${x.href}`} onClick={(e) => { e.preventDefault(); go(x.href, { replace: true }); }}
              style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, minHeight: 92, borderRadius: 20, background: areaSoft(x.area), color: 'var(--ink)', textDecoration: 'none' }}>
              <span style={{ color: areaColor(x.area), display: 'flex' }}><Icon name={x.icon} size={22} /></span>
              <span class="small strong" style={{ lineHeight: 1.2 }}>{x.label}</span>
            </a>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
