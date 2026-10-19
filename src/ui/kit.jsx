import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { back } from '../app/router.js';
import { AREA } from '../game/content.js';
import { onEvents, useApp } from '../app/store.js';
import { todosDue } from '../game/logic.js';
import { vibrate } from '../app/env.js';
import { toNumber } from '../game/parse.js';
import { addDays, diffDays, weekday, DAYS, fmtShort, parseDay } from '../app/dates.js';

// ---------- Formatos ----------

// Formato dominicano: coma para miles y punto para decimales (RD$1,500.50).
export function money(n, { sign = false, decimals } = {}) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const d = decimals != null ? decimals : abs % 1 ? 2 : 0;
  const s = `RD$${abs.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
  if (sign) return `${v < 0 ? '−' : '+'}${s}`;
  return v < 0 ? `−${s}` : s;
}

// Dólares: «US$1,543.61».
export function usd(n, { sign = false, decimals } = {}) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const d = decimals != null ? decimals : 2;
  const s = `US$${abs.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
  if (sign) return `${v < 0 ? '−' : '+'}${s}`;
  return v < 0 ? `−${s}` : s;
}

// Monto en su moneda: RD$ o US$.
export const cur = (n, currency, opts) => (currency === 'USD' ? usd(n, opts) : money(n, opts));

// La tasa con cuatro decimales como la publica el Banco Central: «RD$61.1477».
export const rateText = (r) => `RD$${(Number(r) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

export function num(n) {
  return (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;

// «¿Cuántas páginas?» / «¿Cuántos días?»: concuerda con la unidad.
export function cuantos(unit) {
  const u = String(unit || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const fem = /(as|iones|ches|dades|veces|clases)$/.test(u) && !/^(dias|mapas|planetas|programas|temas|sistemas|problemas)$/.test(u);
  return `¿${fem ? 'Cuántas' : 'Cuántos'} ${unit}?`;
}

// Enfoca un campo cuando aparece. El atributo autofocus solo funciona una vez por página.
export function focusOnMount(el) {
  if (el && !el.dataset.focused) {
    el.dataset.focused = '1';
    setTimeout(() => { try { el.focus({ preventScroll: false }); } catch { /* sin foco */ } }, 30);
  }
}

// ---------- Estructura ----------

export function TopBar({ title, backTo = '/', close = false, right = null, onBack }) {
  return (
    <header class="topbar">
      <button type="button" class="icon-btn" aria-label={close ? 'Cerrar' : 'Volver'} onClick={onBack || (() => back(backTo))}>
        <Icon name={close ? 'close' : 'left'} />
      </button>
      {title ? <span class="t">{title}</span> : <span class="grow" />}
      <span style={{ minWidth: 44, display: 'flex', justifyContent: 'flex-end' }}>{right}</span>
    </header>
  );
}

// La barra de abajo. El botón flotante cambia según la pantalla (misión nueva, pendiente nuevo o movimiento).
export function Nav({ active, fab = { href: '/mision/nueva', label: 'Nueva misión' } }) {
  const s = useApp();
  const badge = todosDue(s, s.energy.day).length;
  const Tab = ({ to, id, icon, text, count }) => (
    <a href={`#${to}`} aria-current={active === id ? 'page' : undefined}>
      <span class="pill"><Icon name={icon} />{count > 0 && <span class="badge" aria-label={`${count} para hoy`}>{count > 9 ? '9+' : count}</span>}</span>
      {text}
    </a>
  );
  return (
    <>
      <nav class="nav" aria-label="Navegación principal">
        <Tab to="/" id="hoy" icon="home" text="Hoy" />
        <Tab to="/pendientes" id="pendientes" icon="list" text="Pendientes" count={badge} />
        <Tab to="/camino" id="camino" icon="map" text="Camino" />
        <Tab to="/areas" id="areas" icon="grid" text="Áreas" />
        <Tab to="/personaje" id="personaje" icon="user" text="Personaje" />
      </nav>
      {fab && (fab.onClick
        ? <button type="button" class="fab" aria-label={fab.label} onClick={fab.onClick}><Icon name="plus" size={28} stroke={2.4} /></button>
        : <a class="fab" href={`#${fab.href}`} aria-label={fab.label}><Icon name="plus" size={28} stroke={2.4} /></a>)}
    </>
  );
}

// ---------- Barras ----------

export function Segs({ value, total = 10, color = 'var(--vit)', lg = false, label }) {
  return (
    <div class={`segs ${lg ? 'lg' : ''}`} role="img" aria-label={label}>
      {Array.from({ length: total }, (_, i) => {
        const f = Math.max(0, Math.min(1, value - i));
        return <span key={i}><i style={{ width: `${f * 100}%`, background: color }} /></span>;
      })}
    </div>
  );
}

export function Bar({ value = 0, color = 'var(--ink)', size = '', label }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div class={`bar ${size}`} role={label ? 'img' : undefined} aria-label={label}>
      <i style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Bolts({ n, size = 13, color, label }) {
  return (
    <span class="bolts" role="img" aria-label={label || `Cuesta ${n} de energía`} style={color ? { color } : null}>
      {Array.from({ length: n }, (_, i) => <Icon key={i} name="bolt" size={size} fill />)}
    </span>
  );
}

export function Ring({ value = 0, size = 64, stroke = 7, color = 'var(--ink)', track = 'var(--soft-2)', children, label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role={label ? 'img' : undefined} aria-label={label} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} stroke-width={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} stroke-width={stroke} stroke-linecap="round"
        stroke-dasharray={`${c * Math.max(0, Math.min(1, value))} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      {children}
    </svg>
  );
}

// ---------- Áreas ----------

// Sin área (pendientes «General», secciones del expediente sin atributo) se usa el gris «general».
export const areaColor = (k) => `var(--${k || 'general'})`;
export const areaSoft = (k) => `var(--${k || 'general'}-soft)`;
export const areaInk = (k) => `var(--${k || 'general'}-ink)`;

export function AreaDot({ area, size = 8 }) {
  return <span class="dot" style={{ width: size, height: size, borderRadius: size / 2, background: areaColor(area) }} />;
}

export function AreaTile({ area, size = '', icon }) {
  return (
    <span class={`tile ${size}`} style={{ background: areaSoft(area), color: areaColor(area) }}>
      <Icon name={icon || AREA[area].icon} size={size === 'sm' ? 18 : size === 'lg' ? 26 : 22} />
    </span>
  );
}

export function AreaLabel({ area, attr = true }) {
  return (
    <span class="row" style={{ gap: 6 }}>
      <AreaDot area={area} />
      {attr ? AREA[area].attr : AREA[area].area}
    </span>
  );
}

// ---------- Avatar ----------

const COOKIE = (() => {
  const pts = [];
  for (let i = 0; i < 180; i += 1) {
    const t = (2 * Math.PI * i) / 180;
    const r = 44 + 4 * Math.cos(9 * t);
    pts.push(`${(50 + r * Math.cos(t)).toFixed(2)},${(50 + r * Math.sin(t)).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
})();

export function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'A';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Avatar({ name, size = 48, label = 'Tu avatar' }) {
  const t = initialsOf(name);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={label} style={{ flexShrink: 0 }}>
      <path d={COOKIE} fill="var(--ink)" />
      <text x="50" y="62" text-anchor="middle" font-family="Bricolage Grotesque, system-ui, sans-serif" font-size={t.length > 1 ? 34 : 40} font-weight="800" fill="var(--on-ink)">{t}</text>
    </svg>
  );
}

// ---------- Controles ----------

export function TChip({ on, onClick, children, icon, fill, color, sm, label }) {
  return (
    <button type="button" class={`tchip ${sm ? 'sm' : ''}`} aria-pressed={on ? 'true' : 'false'} aria-label={label} onClick={onClick}>
      {icon && <span style={{ display: 'flex', color: !on && color ? color : undefined }}><Icon name={icon} size={16} fill={fill} stroke={2.1} /></span>}
      {children}
    </button>
  );
}

export function Stepper({ value, onChange, step = 1, min = 0, max = 999, format = (v) => v, label }) {
  const set = (v) => onChange(Math.max(min, Math.min(max, Math.round(v * 100) / 100)));
  return (
    <div class="stepper" role="group" aria-label={label}>
      <button type="button" aria-label="Menos" onClick={() => set(value - step)}><Icon name="minus" /></button>
      <span class="v" aria-live="polite">{format(value)}</span>
      <button type="button" aria-label="Más" onClick={() => set(value + step)}><Icon name="plus" /></button>
    </div>
  );
}

// Opciones rápidas + «Otro» para escribir el número que quieras.
// `delay`: espera a que dejes de escribir para guardar (así «10000» no pasa por «1000» en el camino).
export function NumberChips({ value, onChange, presets, unit = '', format = (v) => String(v), min = 0, max = 1e9, step = 1, label, sm = true, otherLabel = 'Otro', id, delay = 0 }) {
  const isPreset = presets.some((p) => (p.v ?? p) === value);
  const [custom, setCustom] = useState(!isPreset && value != null);
  const [txt, setTxt] = useState(!isPreset && value != null ? String(value) : '');
  const [bad, setBad] = useState(false);
  const [typing, setTyping] = useState(false);
  const input = useRef(null);
  const cb = useRef(onChange);
  cb.current = onChange;
  const timer = useRef(null);
  const pending = useRef(null);
  const flush = () => {
    clearTimeout(timer.current);
    if (pending.current == null) return;
    const v = pending.current;
    pending.current = null;
    cb.current(v);
  };
  useEffect(() => () => flush(), []);
  const fromText = (raw) => {
    setTxt(raw);
    const n = toNumber(String(raw).replace(/[^\d.,]/g, ''));
    const ok = n != null && n >= min && n <= max;
    setBad(!ok && String(raw).trim() !== '');
    if (!ok) { pending.current = null; clearTimeout(timer.current); return; }
    const v = Math.round(Math.round(n / step) * step * 100) / 100;
    if (!delay) { onChange(v); return; }
    pending.current = v;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  };
  const openCustom = () => {
    setCustom(true);
    if (!txt && value != null) setTxt(String(value));
    setTimeout(() => { if (input.current) { input.current.focus(); input.current.select(); } }, 30);
  };
  return (
    <div class="stack-sm">
      <div class="chips" role="group" aria-label={label}>
        {presets.map((p) => {
          const v = p.v ?? p;
          return <TChip sm={sm} key={v} on={!custom && value === v} onClick={() => { setCustom(false); setBad(false); onChange(v); }}>{p.label ?? format(v)}</TChip>;
        })}
        <TChip sm={sm} on={custom} icon="edit" onClick={openCustom}>{custom && !bad && txt ? format(value) : otherLabel}</TChip>
      </div>
      {custom && (
        <div class="numrow">
          <input ref={input} id={id} class="input" inputMode="decimal" enterKeyHint="done" value={txt} placeholder="Escribe el número" aria-label={label ? `${label}: número propio` : 'Número propio'} aria-invalid={bad && !typing ? 'true' : 'false'}
            onFocus={() => setTyping(true)} onBlur={() => { setTyping(false); flush(); }} onInput={(e) => fromText(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
          {unit && <span class="unit">{unit}</span>}
        </div>
      )}
      {custom && bad && <span class="small" style={{ color: typing ? 'var(--muted)' : 'var(--vit-ink)' }}>{typing ? `Entre ${num(min)} y ${num(max)}${unit ? ` ${unit}` : ''}.` : `Usa un número entre ${num(min)} y ${num(max)}. Se queda el anterior: ${format(value)}.`}</span>}
    </div>
  );
}

// Campo numérico con − y + (metas, montos).
export function NumberField({ value, onChange, step = 1, min = 0, max = 1e12, unit = '', id, label, prefix = '' }) {
  const [txt, setTxt] = useState(value ? String(value) : '');
  useEffect(() => {
    if ((toNumber(String(txt).replace(/[^\d.,]/g, '')) || 0) !== (value || 0)) setTxt(value ? String(value) : '');
  }, [value]);
  const set = (v) => {
    const n = Math.max(min, Math.min(max, Math.round(v * 100) / 100));
    setTxt(String(n));
    onChange(n);
  };
  return (
    <div class="numfield">
      <button type="button" aria-label="Menos" onClick={() => set((value || 0) - step)}><Icon name="minus" /></button>
      <label class="numfield-in">
        {prefix && <span class="unit">{prefix}</span>}
        <input id={id} inputMode="decimal" value={txt} placeholder="0" aria-label={label} onInput={(e) => {
          const raw = e.currentTarget.value;
          setTxt(raw);
          const n = toNumber(raw.replace(/[^\d.,]/g, ''));
          onChange(n != null && n >= min ? Math.min(max, n) : 0);
        }} />
        {unit && <span class="unit">{unit}</span>}
      </label>
      <button type="button" aria-label="Más" onClick={() => set((value || 0) + step)}><Icon name="plus" /></button>
    </div>
  );
}

// ---------- Fechas de los pendientes ----------

export function nextWeekend(today) {
  const w = weekday(today);
  return w === 6 || w === 0 ? today : addDays(today, 6 - w);
}
export const nextMonday = (today) => addDays(today, ((8 - weekday(today)) % 7) || 7);

export function dueLabel(due, today) {
  if (!due) return '';
  const n = diffDays(today, due);
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Mañana';
  if (n === -1) return 'Venció ayer';
  if (n < 0) return `Venció hace ${-n} días`;
  if (n < 7) { const w = DAYS[parseDay(due).getDay()]; return w[0].toUpperCase() + w.slice(1); }
  return fmtShort(due);
}

export function DuePicker({ value, onChange, today, allowNone = true }) {
  const opts = [
    ['Hoy', today],
    ['Mañana', addDays(today, 1)],
    ['Fin de semana', nextWeekend(today)],
    ['Próxima semana', nextMonday(today)],
    ...(allowNone ? [['Sin fecha', null]] : []),
  ];
  // Si dos opciones caen el mismo día (el domingo, «Mañana» y «Próxima semana»), se marca solo la primera.
  const first = opts.findIndex(([, v]) => v === value);
  const [pick, setPick] = useState(first < 0 && !!value);
  return (
    <div class="stack-sm">
      <div class="chips" role="group" aria-label="Fecha">
        {opts.map(([l, v], i) => <TChip key={l} sm on={!pick && i === first} onClick={() => { setPick(false); onChange(v); }}>{l}</TChip>)}
        <TChip sm on={pick} icon="calendar" onClick={() => setPick(true)}>{pick && value ? fmtShort(value) : 'Elegir fecha'}</TChip>
      </div>
      {pick && <input type="date" class="input" aria-label="Fecha del pendiente" value={value || ''} onInput={(e) => onChange(e.currentTarget.value || null)} />}
    </div>
  );
}

export function Switch({ checked, onChange, label }) {
  return (
    <span class="switch">
      <input type="checkbox" checked={checked} aria-label={label} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span />
    </span>
  );
}

// ---------- Hoja inferior ----------

export function Sheet({ onClose, label, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const el = ref.current;
    // El foco va al campo marcado para escribir; si no hay, a la hoja (sin resaltar el botón Cerrar).
    const auto = el && el.querySelector('[autofocus]');
    if (auto) auto.focus();
    else if (el) el.focus({ preventScroll: true });
    // Escape cierra la hoja aunque el foco se haya perdido (por ejemplo, si el botón tocado desapareció).
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('[role="alertdialog"]')) onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      if (prev && prev.focus) prev.focus();
    };
  }, []);
  return (
    <div class="sheet-wrap">
      <div class="sheet-scrim" onClick={onClose} />
      <section class="sheet" role="dialog" aria-modal="true" aria-label={label} ref={ref} tabIndex={-1}>
        <span class="grip" aria-hidden="true" />
        {children}
      </section>
    </div>
  );
}

export function SheetHead({ title, onClose }) {
  return (
    <div class="between-c">
      <h2 class="h1 sm">{title}</h2>
      <button type="button" class="icon-btn" aria-label="Cerrar" onClick={onClose}><Icon name="close" /></button>
    </div>
  );
}

// ---------- Avisos y celebraciones ----------

let toastList = [];
const toastSubs = new Set();
export function toast(text, icon = 'check') {
  const id = Math.random();
  toastList = [...toastList, { id, text, icon }].slice(-3);
  toastSubs.forEach((f) => f(toastList));
  setTimeout(() => {
    toastList = toastList.filter((t) => t.id !== id);
    toastSubs.forEach((f) => f(toastList));
  }, 3200);
}

export function Toasts() {
  const [list, setList] = useState(toastList);
  useEffect(() => {
    toastSubs.add(setList);
    return () => toastSubs.delete(setList);
  }, []);
  return (
    <div class="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div class="toast" key={t.id}><Icon name={t.icon} size={18} />{t.text}</div>
      ))}
    </div>
  );
}

function describe(e) {
  switch (e.type) {
    case 'level': return { big: true, icon: 'star', color: 'var(--xp)', title: `¡Nivel ${e.n}!`, text: 'Tu personaje se hace más fuerte. Sigue así.' };
    case 'boss': return { big: true, icon: 'crown', color: 'var(--xp)', title: `¡Derrotaste a ${e.title}!`, text: `Ganas ${e.reward.xp} XP, ${e.reward.gold} de oro${e.reward.title ? ` y el título «${e.reward.title}»` : ''}.` };
    case 'recovery': return { big: true, icon: 'heart', color: 'var(--vit)', title: 'Modo recuperación', text: 'Tu vitalidad llegó a 0. No pierdes nada. Durante tres días cada misión te devuelve el doble de vitalidad.' };
    case 'recovered': return { big: true, icon: 'sparkle', color: 'var(--good)', title: '¡Te recuperaste!', text: 'Volviste a 50 de vitalidad. Bienvenido de vuelta al camino.' };
    case 'chapter': return e.battle
      ? { big: true, icon: 'sword', color: 'var(--ink)', title: 'Empieza la batalla', text: `Completaste «${e.title}». Ahora toca vencer al jefe de tu camino.` }
      : { icon: 'map', text: `Capítulo completado: ${e.title}` };
    case 'attr': return { icon: AREA[e.area].icon, text: `${AREA[e.area].attr} sube a nivel ${e.n}` };
    case 'talent': return { icon: 'sparkle', text: `Nuevo talento: ${e.name} (+5 % XP)` };
    case 'achievement': return { icon: 'trophy', text: `Insignia: ${e.title} · +25 de oro` };
    case 'streak': return { icon: 'flame', text: `¡Racha de ${e.n} días!` };
    case 'streakLost': return { icon: 'flame', text: `Tu racha de ${e.count} días se reinició. Hoy empieza otra.` };
    case 'freezeUsed': return { icon: 'shield', text: e.n === 1 ? 'Un protector cuidó tu racha.' : `${e.n} protectores cuidaron tu racha.` };
    case 'book': return { icon: 'book', text: `Terminaste «${e.title}» · +50 XP` };
    case 'budget': return { icon: 'chart', text: e.level >= 100 ? `Llegaste al presupuesto de ${e.name}` : `Ya usaste el 80 % de ${e.name}` };
    case 'quitDays': return e.n >= 7
      ? { big: true, icon: 'flag', color: 'var(--good)', title: `${e.n} días sin ${e.name.charAt(0).toLowerCase()}${e.name.slice(1)}`, text: `Ganas ${e.xp} XP. Cada día cuenta, sigue así.` }
      : { icon: 'flag', text: `${e.n === 1 ? 'Un día' : `${e.n} días`} sin ${e.name.charAt(0).toLowerCase()}${e.name.slice(1)} · +${e.xp} XP` };
    case 'targetStep': return { icon: 'target', text: `${e.name}: llegaste al ${e.pct} % · +${e.xp} XP` };
    case 'targetDone': return { big: true, icon: 'target', color: 'var(--xp)', title: '¡Meta cumplida!', text: `Llegaste a «${e.name}». Ganas ${e.xp} XP y 30 de oro.` };
    case 'dreamDone': return { big: true, icon: 'star', color: 'var(--xp)', title: '¡Lo lograste!', text: `«${e.name}» ya es parte de tu historia. Ganas ${e.xp} XP y 40 de oro.` };
    case 'cardPaid': return { icon: 'card', text: `Pagaste todo el estado de ${e.name} a tiempo · +15 XP` };
    case 'planLinked': return { icon: 'calendar', text: `«${e.name}» quedó como ${e.kind === 'ingreso' ? 'recibido' : 'pagado'}` };
    default: return null;
  }
}

export function Celebrations() {
  const [queue, setQueue] = useState([]);
  useEffect(() => onEvents((ev) => {
    const bigs = [];
    for (const e of ev) {
      const d = describe(e);
      if (!d) continue;
      if (d.big) bigs.push(d);
      else toast(d.text, d.icon);
    }
    if (bigs.length) {
      vibrate([20, 40, 20]);
      setQueue((q) => [...q, ...bigs]);
    }
  }), []);
  const cur = queue[0];
  if (!cur) return null;
  const close = () => setQueue((q) => q.slice(1));
  return (
    <div class="celebrate" role="alertdialog" aria-modal="true" aria-label={cur.title} onClick={close}>
      <div class="box" onClick={(e) => e.stopPropagation()}>
        <span style={{ width: 88, height: 88, borderRadius: 44, background: 'var(--soft)', color: cur.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={cur.icon} size={44} stroke={1.8} />
        </span>
        <h2 class="h1 sm">{cur.title}</h2>
        <p class="lead">{cur.text}</p>
        <button type="button" class="btn block" onClick={close} ref={focusOnMount}>Seguir</button>
      </div>
    </div>
  );
}

// ---------- Confirmación propia (los diálogos del navegador no funcionan en todas partes) ----------

const askSubs = new Set();
export function ask(text, { ok = 'Confirmar', danger = false } = {}) {
  return new Promise((resolve) => {
    if (!askSubs.size) { resolve(false); return; }
    askSubs.forEach((f) => f({ text, ok, danger, resolve }));
  });
}

export function Confirmer() {
  const [q, setQ] = useState(null);
  useEffect(() => {
    askSubs.add(setQ);
    return () => askSubs.delete(setQ);
  }, []);
  if (!q) return null;
  const done = (v) => { q.resolve(v); setQ(null); };
  return (
    <div class="celebrate" role="alertdialog" aria-modal="true" aria-label={q.text} onClick={() => done(false)}>
      <div class="box" onClick={(e) => e.stopPropagation()} style={{ alignItems: 'stretch', textAlign: 'left' }}>
        <p class="h2">{q.text}</p>
        <div class="row">
          <button type="button" class="btn ghost grow" onClick={() => done(false)} ref={q.danger ? focusOnMount : undefined}>Cancelar</button>
          <button type="button" class={`btn grow ${q.danger ? 'danger' : ''}`} onClick={() => done(true)} ref={q.danger ? undefined : focusOnMount}>{q.ok}</button>
        </div>
      </div>
    </div>
  );
}

export function Empty({ icon = 'sparkle', children, action }) {
  return (
    <div class="empty">
      <Icon name={icon} size={24} />
      <span>{children}</span>
      {action}
    </div>
  );
}

export function useHour() {
  const [h, setH] = useState(new Date().getHours());
  useEffect(() => {
    const id = setInterval(() => setH(new Date().getHours()), 60000);
    return () => clearInterval(id);
  }, []);
  return h;
}
