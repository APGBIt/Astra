import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Nav, TopBar, Sheet, SheetHead, TChip, toast, ask, plural, areaColor, areaSoft, areaInk } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { fmtShort, monthKey, monthName, relDay } from '../app/dates.js';
import { saveFile } from '../app/files.js';
import { AREA, WIN_SCOPES, WIN_TYPES, WIN_SKILLS, WIN_XP } from '../game/content.js';
import { addWin, updateWin, removeWin, periodRange, winStats, winsText, winsCSV, winPromptDue, dismissWinPrompt } from '../game/logic.js';
import { PhotoStrip } from '../ui/photos.jsx';

// Logros de la vida real: del trabajo, los estudios y lo personal. Con impacto y habilidades, listos para tu evaluación o tu CV.

const PERIODS = [['trimestre', 'Este trimestre'], ['semestre', 'Este semestre'], ['ano', 'Este año'], ['12m', '12 meses'], ['todo', 'Todo']];
const scopeOf = (k) => WIN_SCOPES.find((x) => x.key === k) || WIN_SCOPES[0];
const tone = (k) => scopeOf(k).area || 'general';
const typeOf = (k) => WIN_TYPES.find((t) => t.key === k) || WIN_TYPES[WIN_TYPES.length - 1];
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : '');
const attrOf = (scope) => (scopeOf(scope).area ? AREA[scopeOf(scope).area].attr : 'tu nivel');

export function Wins({ query }) {
  const s = useApp();
  const today = s.energy.day;
  const [scope, setScope] = useState(() => (query && query.get('ambito')) || 'all');
  const [period, setPeriod] = useState('ano');
  const [skill, setSkill] = useState(null);
  const [sheet, setSheet] = useState(() => (query && query.get('nuevo') ? { id: null } : null));
  const wins = s.wins || [];
  const range = periodRange(period, today);
  const inPeriod = wins.filter((w) => w.day >= range.from && w.day <= range.to);
  const inScope = inPeriod.filter((w) => scope === 'all' || w.scope === scope);
  const list = inScope.filter((w) => !skill || (w.skills || []).includes(skill));
  const st = winStats(inScope);
  const counts = {};
  for (const w of inPeriod) counts[w.scope] = (counts[w.scope] || 0) + 1;
  const months = [];
  for (const w of list) {
    const k = monthKey(w.day);
    let g = months.find((x) => x.k === k);
    if (!g) months.push((g = { k, items: [] }));
    g.items.push(w);
  }
  const copy = async () => {
    const text = winsText(list, `${range.label}${scope !== 'all' ? ` · ${scopeOf(scope).label}` : ''}`);
    try {
      await navigator.clipboard.writeText(text);
      toast('Resumen copiado: pégalo en tu evaluación, tu CV o un correo', 'copy');
    } catch {
      setSheet({ text });
    }
  };
  const csv = async () => { if (await saveFile(`astra-logros-${today}.csv`, winsCSV(list), 'text/csv')) toast('Archivo listo para Excel', 'download'); };
  const newWin = () => setSheet({ id: null });
  return (
    <>
      <main class="screen">
        <TopBar backTo="/areas" right={<button type="button" class="icon-btn" aria-label="Nuevo logro" onClick={newWin}><Icon name="plus" /></button>} />
        <section class="stack-sm">
          <span class="eyebrow" style={{ color: areaInk('laborales') }}>Logros</span>
          <h1 class="h1">Lo que has conseguido</h1>
          <p class="lead">Anótalo cuando pasa, con su impacto. En tu evaluación, tu CV o una entrevista lo tendrás listo.</p>
        </section>
        {wins.length > 0 && (
          <div class="kpis">
            <div class="kpi"><span class="v">{st.n}</span><span class="l">{range.label}</span></div>
            <div class="kpi"><span class="v">{inScope.filter((w) => w.impact).length}</span><span class="l">Con impacto</span></div>
            <div class="kpi"><span class="v">{st.skills.length}</span><span class="l">Habilidades</span></div>
          </div>
        )}
        {wins.length > 0 && (
          <div class="stack-sm">
            <div class="chips scroll" role="group" aria-label="Ámbito">
              <TChip sm on={scope === 'all'} onClick={() => setScope('all')}>Todos · {inPeriod.length}</TChip>
              {WIN_SCOPES.map((x) => <TChip key={x.key} sm on={scope === x.key} onClick={() => setScope(scope === x.key ? 'all' : x.key)}><span class="dot" style={{ background: areaColor(tone(x.key)) }} />{x.label} · {counts[x.key] || 0}</TChip>)}
            </div>
            <div class="chips scroll" role="group" aria-label="Período">
              {PERIODS.map(([k, l]) => <TChip key={k} sm on={period === k} onClick={() => setPeriod(k)}>{l}</TChip>)}
            </div>
            {st.skills.length > 0 && (
              <div class="chips scroll" role="group" aria-label="Habilidad">
                {st.skills.slice(0, 10).map(([k, n]) => <TChip key={k} sm on={skill === k} onClick={() => setSkill(skill === k ? null : k)}>{k} · {n}</TChip>)}
              </div>
            )}
          </div>
        )}
        {list.length > 0 && (
          <div class="row">
            <button type="button" class="btn sm soft grow" onClick={copy}><Icon name="copy" size={18} />Copiar resumen</button>
            <button type="button" class="btn sm soft grow" onClick={csv}><Icon name="download" size={18} />Excel (CSV)</button>
          </div>
        )}
        {!list.length && (
          <div class="empty">
            <Icon name="trophy" size={26} />
            <span>{wins.length ? 'No hay logros con estos filtros.' : 'Una entrega, una meta cumplida, un comentario positivo de tu jefe, una certificación… Anótalos aquí y en tu evaluación no tendrás que recordar nada.'}</span>
            {!wins.length && <button type="button" class="btn sm" onClick={newWin}>Anotar mi primer logro</button>}
          </div>
        )}
        {months.map((g) => (
          <section key={g.k} class="card" aria-label={monthName(g.k)} style={{ gap: 0, paddingTop: 12, paddingBottom: 4 }}>
            <h2 class="eyebrow" style={{ paddingBottom: 4 }}>{cap(monthName(g.k))} · {g.items.length}</h2>
            {g.items.map((w) => <WinRow key={w.id} w={w} showScope={scope === 'all'} onOpen={() => setSheet({ id: w.id })} />)}
          </section>
        ))}
        <p class="small muted" style={{ textAlign: 'center', padding: '0 12px' }}>
          Cada logro da +{WIN_XP.xp} XP (Oficio si es profesional, Sabiduría si es académico) y +{WIN_XP.gold} de oro, hasta {WIN_XP.daily} al día.
        </p>
      </main>
      <Nav active="areas" fab={{ onClick: newWin, label: 'Nuevo logro' }} />
      {sheet && sheet.text != null && <CopySheet text={sheet.text} onClose={() => setSheet(null)} />}
      {sheet && sheet.text == null && <WinSheet id={sheet.id} defaultScope={scope !== 'all' ? scope : 'profesional'} onClose={() => setSheet(null)} />}
    </>
  );
}

function WinRow({ w, showScope, onOpen }) {
  const t = typeOf(w.type);
  return (
    <button type="button" class="win-row" onClick={onOpen}>
      <span class="tile sm" style={{ background: areaSoft(tone(w.scope)), color: areaColor(tone(w.scope)) }}><Icon name={t.icon} size={18} /></span>
      <span class="stack-xs grow">
        <span class="semi">{w.title}</span>
        {w.impact && <span class="impact">{w.impact}</span>}
        <span class="tiny muted semi">{fmtShort(w.day)} · {t.label}{showScope ? ` · ${scopeOf(w.scope).label}` : ''}{w.evidence || (w.photos || []).length ? ' · con evidencia' : ''}</span>
        {(w.skills || []).length > 0 && <span class="row wrap" style={{ gap: 4 }}>{w.skills.map((k) => <span key={k} class="skill">{k}</span>)}</span>}
      </span>
    </button>
  );
}

function CopySheet({ text, onClose }) {
  return (
    <Sheet onClose={onClose} label="Resumen de logros">
      <SheetHead title="Resumen de logros" onClose={onClose} />
      <p class="small muted">Tu navegador no dejó copiar solo. Mantén presionado el texto, elige «Seleccionar todo» y cópialo.</p>
      <textarea class="input" rows={12} readOnly value={text} onFocus={(e) => e.currentTarget.select()} />
    </Sheet>
  );
}

// ---------- Hoja: nuevo o editar ----------

export function WinSheet({ id, onClose, defaultScope = 'profesional' }) {
  const s = useApp();
  const today = s.energy.day;
  const w = id ? (s.wins || []).find((x) => x.id === id) : null;
  useEffect(() => { if (id && !w) onClose(); }, [w]);
  const [title, setTitle] = useState(w ? w.title : '');
  const [scope, setScope] = useState(w ? w.scope : defaultScope);
  const [type, setType] = useState(w ? w.type : 'entrega');
  const [day, setDay] = useState(w ? w.day : today);
  const [impact, setImpact] = useState(w ? w.impact || '' : '');
  const [skills, setSkills] = useState(w ? w.skills || [] : []);
  const [evidence, setEvidence] = useState(w ? w.evidence || '' : '');
  const [photos, setPhotos] = useState(w ? w.photos || [] : []);
  const [newSkill, setNewSkill] = useState('');
  if (id && !w) return null;
  const known = [...new Set([...WIN_SKILLS, ...(s.wins || []).flatMap((x) => x.skills || []), ...skills])];
  const toggleSkill = (k) => setSkills(skills.includes(k) ? skills.filter((x) => x !== k) : skills.length >= 6 ? skills : [...skills, k]);
  const addSkill = () => {
    const k = newSkill.trim().slice(0, 40);
    if (k && !skills.includes(k) && skills.length < 6) setSkills([...skills, k[0].toUpperCase() + k.slice(1)]);
    setNewSkill('');
  };
  const paid = ((s.days[today] && s.days[today].wins) || 0) < WIN_XP.daily;
  const data = () => ({ title, scope, type, day, impact, skills, evidence, photos });
  const save = () => {
    if (!title.trim()) return;
    if (w) {
      act((st) => updateWin(st, w.id, data()));
      toast('Logro guardado', 'trophy');
    } else {
      const r = act((st, t, ev) => addWin(st, data(), t, ev));
      toast(r && r.reward ? `Logro anotado · +${r.reward.xp} XP${r.reward.area ? ` de ${AREA[r.reward.area].attr}` : ''} y +${r.reward.gold} de oro` : 'Logro anotado', 'trophy');
    }
    onClose();
  };
  return (
    <Sheet onClose={onClose} label={w ? 'Editar logro' : 'Nuevo logro'}>
      <SheetHead title={w ? 'Logro' : 'Nuevo logro'} onClose={onClose} />
      <div class="field">
        <label for="wt">¿Qué lograste?</label>
        <textarea id="wt" class="input" rows={2} value={title} maxLength={140} placeholder="Ej. Automaticé el reporte de cierre mensual" onInput={(e) => setTitle(e.currentTarget.value)} autoFocus={!w} />
      </div>
      <div class="stack-sm">
        <span class="label">Ámbito</span>
        <div class="chips" role="group" aria-label="Ámbito">
          {WIN_SCOPES.map((x) => <TChip key={x.key} sm on={scope === x.key} onClick={() => setScope(x.key)}><span class="dot" style={{ background: areaColor(tone(x.key)) }} />{x.label}</TChip>)}
        </div>
      </div>
      <div class="stack-sm">
        <span class="label">Tipo</span>
        <div class="chips" role="group" aria-label="Tipo de logro">
          {WIN_TYPES.map((t) => <TChip key={t.key} sm icon={t.icon} on={type === t.key} onClick={() => setType(t.key)}>{t.label}</TChip>)}
        </div>
      </div>
      <div class="field">
        <label for="wi">Impacto (lo que cambió gracias a esto)</label>
        <textarea id="wi" class="input" rows={3} value={impact} maxLength={600} placeholder="Ej. El cierre pasó de 5 a 3 días y se eliminaron los errores de digitación" onInput={(e) => setImpact(e.currentTarget.value)} />
        <span class="small muted">Con números si puedes: tiempo, dinero, %, personas o clientes. Una fórmula que funciona: «Logré [qué], medido por [número], haciendo [cómo]».</span>
      </div>
      <div class="stack-sm">
        <span class="label">Habilidades que demostraste (hasta 6)</span>
        <div class="chips" role="group" aria-label="Habilidades">
          {known.map((k) => <TChip key={k} sm on={skills.includes(k)} onClick={() => toggleSkill(k)}>{k}</TChip>)}
        </div>
        <div class="row" style={{ gap: 8 }}>
          <input class="input grow" value={newSkill} maxLength={40} placeholder="Otra habilidad" aria-label="Otra habilidad" onInput={(e) => setNewSkill(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') addSkill(); }} />
          <button type="button" class="btn sm soft" disabled={!newSkill.trim() || skills.length >= 6} onClick={addSkill}><Icon name="plus" size={18} />Agregar</button>
        </div>
      </div>
      <div class="field"><label for="wd">Fecha</label><input id="wd" type="date" class="input" value={day} max={today} onInput={(e) => setDay(e.currentTarget.value || today)} /></div>
      <div class="field">
        <label for="we">Evidencia (opcional)</label>
        <input id="we" class="input" value={evidence} maxLength={300} placeholder="Correo de tu jefe, enlace, carpeta del proyecto…" onInput={(e) => setEvidence(e.currentTarget.value)} />
      </div>
      <PhotoStrip ids={photos} onChange={setPhotos} kind="logro" label="Fotos de evidencia (opcional)" hint="Un certificado, un reconocimiento, una captura del correo." max={4} />
      <button type="button" class="btn block" disabled={!title.trim()} onClick={save}>
        <Icon name="trophy" size={20} />{w ? 'Guardar cambios' : paid ? `Guardar · +${WIN_XP.xp} XP de ${attrOf(scope)}` : 'Guardar'}
      </button>
      {!w && !paid && <span class="small muted" style={{ textAlign: 'center' }}>Hoy ya cobraste la recompensa de {WIN_XP.daily} logros. Igual queda anotado.</span>}
      {w && (
        <button type="button" class="link-btn" style={{ color: 'var(--vit-ink)', alignSelf: 'center' }} onClick={async () => {
          if (await ask('¿Borrar este logro? La XP que ganaste se queda.', { ok: 'Borrar', danger: true })) { act((st) => removeWin(st, w.id)); toast('Logro borrado', 'trash'); onClose(); }
        }}><Icon name="trash" size={16} />Borrar logro</button>
      )}
    </Sheet>
  );
}

// ---------- Tarjeta en Áreas, Laborales y Crecimiento ----------

export function WinsCard({ scope = null }) {
  const s = useApp();
  const today = s.energy.day;
  const list = (s.wins || []).filter((w) => !scope || w.scope === scope);
  const year = list.filter((w) => w.day.slice(0, 4) === today.slice(0, 4)).length;
  const last = list[0];
  const area = scope ? tone(scope) : 'laborales';
  const title = scope === 'profesional' ? 'Logros profesionales' : scope === 'academico' ? 'Logros académicos' : 'Logros';
  const sub = last ? `${plural(year, 'logro', 'logros')} este año · el último ${relDay(last.day, today).toLowerCase()}` : 'Anótalos con su impacto: listos para tu evaluación y tu CV';
  return (
    <a href={`#/logros${scope ? `?ambito=${scope}` : ''}`} class="card tight" style={{ textDecoration: 'none', color: 'var(--ink)' }} aria-label={`${title}: ${sub}`}>
      <div class="row">
        <span class="tile" style={{ background: areaSoft(area), color: areaColor(area) }}><Icon name="trophy" /></span>
        <span class="stack-xs grow"><span class="strong">{title}</span><span class="small muted">{sub}</span></span>
        <Icon name="right" size={18} />
      </div>
    </a>
  );
}

// Recordatorio de fin de semana en Hoy.
export function WinPrompt() {
  const s = useApp();
  const today = s.energy.day;
  if (!winPromptDue(s, today)) return null;
  return (
    <section class="card" aria-label="Logro de la semana" style={{ background: 'var(--laborales-soft)', borderColor: 'transparent' }}>
      <div class="row-top">
        <span class="tile" style={{ background: 'var(--surface)', color: areaColor('laborales') }}><Icon name="trophy" /></span>
        <div class="stack-xs grow"><span class="strong">¿Qué lograste esta semana?</span><span class="small">Anótalo ahora y no tendrás que recordarlo en tu evaluación. +{WIN_XP.xp} XP y +{WIN_XP.gold} de oro.</span></div>
      </div>
      <div class="row">
        <a class="btn sm grow" href="#/logros?nuevo=1"><Icon name="plus" size={18} />Anotar un logro</a>
        <button type="button" class="btn sm ghost" onClick={() => act((st, t) => dismissWinPrompt(st, t))}>Ahora no</button>
      </div>
    </section>
  );
}
