import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { back } from '../app/router.js';
import { AREA } from '../game/content.js';
import { onEvents } from '../app/store.js';
import { vibrate } from '../app/env.js';

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

export function num(n) {
  return (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;

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

export function Nav({ active }) {
  const Tab = ({ to, id, icon, text }) => (
    <a href={`#${to}`} aria-current={active === id ? 'page' : undefined}>
      <span class="pill"><Icon name={icon} /></span>
      {text}
    </a>
  );
  return (
    <>
      <nav class="nav" aria-label="Navegación principal">
        <Tab to="/" id="hoy" icon="home" text="Hoy" />
        <Tab to="/camino" id="camino" icon="map" text="Camino" />
        <Tab to="/areas" id="areas" icon="grid" text="Áreas" />
        <Tab to="/personaje" id="personaje" icon="user" text="Personaje" />
      </nav>
      <a class="fab" href="#/mision/nueva" aria-label="Nueva misión"><Icon name="plus" size={28} stroke={2.4} /></a>
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

export const areaColor = (k) => `var(--${k})`;
export const areaSoft = (k) => `var(--${k}-soft)`;
export const areaInk = (k) => `var(--${k}-ink)`;

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
    const first = el && el.querySelector('input, textarea, button, a[href]');
    if (first && first.tagName !== 'INPUT' && first.tagName !== 'TEXTAREA') first.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    el && el.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      el && el.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      if (prev && prev.focus) prev.focus();
    };
  }, []);
  return (
    <div class="sheet-wrap">
      <div class="sheet-scrim" onClick={onClose} />
      <section class="sheet" role="dialog" aria-modal="true" aria-label={label} ref={ref}>
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
    case 'achievement': return { icon: 'trophy', text: `Logro: ${e.title} · +25 de oro` };
    case 'streak': return { icon: 'flame', text: `¡Racha de ${e.n} días!` };
    case 'streakLost': return { icon: 'flame', text: `Tu racha de ${e.count} días se reinició. Hoy empieza otra.` };
    case 'freezeUsed': return { icon: 'shield', text: e.n === 1 ? 'Un protector cuidó tu racha.' : `${e.n} protectores cuidaron tu racha.` };
    case 'book': return { icon: 'book', text: `Terminaste «${e.title}» · +50 XP` };
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
        <button type="button" class="btn block" onClick={close} autoFocus>Seguir</button>
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
          <button type="button" class="btn ghost grow" onClick={() => done(false)}>Cancelar</button>
          <button type="button" class={`btn grow ${q.danger ? 'danger' : ''}`} onClick={() => done(true)} autoFocus>{q.ok}</button>
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
