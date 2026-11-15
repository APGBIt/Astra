// Mundo físico (2.0): etiquetas inteligentes (NFC y QR), la Lente de realidad aumentada y los sensores:
// el pulso con la cámara y los aparatos Bluetooth. Todo se procesa en el teléfono.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { TopBar, Sheet, SheetHead, TChip, Bar, Ring, Empty, toast, ask, plural, focusOnMount } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { go } from '../app/router.js';
import { fmtClock, minToTime } from '../game/logic.js';
import { TAG_ACTIONS, TAG_ROUTES, tagsOf, tagOf, addTag, updateTag, removeTag, tagUrl, tagTitle, tagStatus, runTag, undoTag, tagIdeas, tagStats, findTag } from '../game/tags.js';
import { qrSvg } from '../app/qr.js';
import { nfcSupported, writeNfc, scanNfc, nfcErrorText } from '../app/nfc.js';
import { cameraSupported, openCamera, frameColor, cameraErrorText } from '../app/camera.js';
import { bleSupported, connectBle, bleErrorText, BLE_KINDS, rrStats } from '../app/ble.js';
import { analyzePulse, livePulse, fingerOn, PPG_SECONDS, PULSE_TEXT } from '../game/ppg.js';
import { logReady, addBP, logWeight, weightUnit, fromKg, bpCategory, baseline } from '../game/vitals.js';

const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const baseUrl = () => `${location.origin}${location.pathname}`;
const toneColor = (tone) => (tone === 'good' ? 'var(--good-ink)' : tone === 'xp' ? 'var(--xp-ink)' : tone === 'vit' ? 'var(--vit-ink)' : 'var(--muted)');

// Hace lo que dice una etiqueta y lo cuenta con un aviso (con «Deshacer» cuando se puede).
export function fireTag(id, { follow = true } = {}) {
  const r = act((st, t, ev) => runTag(st, id, t, ev, { now: Date.now(), nowMin: nowMin() }));
  if (!r) return null;
  const undo = r.ok && r.undo ? { label: 'Deshacer', run: () => { act((st, t, ev) => undoTag(st, r.undo, t, ev)); toast('Deshecho', 'undo'); } } : null;
  if (!(r.ok && r.tag && r.tag.action.type === 'open')) toast(r.text, r.icon || 'check', { action: undo });
  if (follow && r.ok && r.href) go(r.href);
  return r;
}

// ---------- La pestaña ----------

export function WorldTab({ s, today, query }) {
  const tags = tagsOf(s);
  const ideas = useMemo(() => tagIdeas(s), [s]);
  const stats = tagStats(s);
  const [sheet, setSheet] = useState(() => {
    const nueva = query && query.get('nueva'); const codigo = query && query.get('codigo');
    if (nueva && /^[a-z0-9]{4,12}$/.test(nueva)) return { t: 'new', id: nueva };
    if (codigo) return { t: 'new', code: codigo.slice(0, 200) };
    return null;
  });
  const [nfc, setNfc] = useState(null); // lectura de NFC con la app abierta
  const nfcCtl = useRef(null);
  useEffect(() => () => { if (nfcCtl.current) nfcCtl.current.abort(); }, []);
  const close = () => setSheet(null);

  const readNfc = async () => {
    if (nfcCtl.current) { nfcCtl.current.abort(); nfcCtl.current = null; setNfc(null); return; }
    const ctl = new AbortController();
    nfcCtl.current = ctl;
    try {
      await scanNfc((raw) => {
        const tag = findTag(s, raw);
        if (tag && !tag.unknown) { fireTag(tag.id); return; }
        if (tag && tag.unknown) { setSheet({ t: 'new', id: tag.id }); return; }
        setSheet({ t: 'new', code: raw });
      }, ctl.signal);
      setNfc('on');
    } catch (err) { nfcCtl.current = null; setNfc(null); const m = nfcErrorText(err); if (m) toast(m, 'info'); }
  };

  const caps = [
    ['camera', 'Cámara', cameraSupported(), 'Para la Lente y el pulso'],
    ['nfc', 'NFC', nfcSupported(), nfcSupported() ? 'Para escribir y leer etiquetas' : 'Solo en Chrome para Android. Aquí se usan los códigos QR'],
    ['bluetooth', 'Bluetooth', bleSupported(), bleSupported() ? 'Para bandas de pulso, tensiómetros y básculas' : 'Solo en Chrome (Android y computadora)'],
  ];

  return (
    <>
      <section class="stack-sm" aria-label="Mundo físico">
        <span class="eyebrow">Mundo físico</span>
        <h2 class="h1">Tu casa y tu cuerpo, conectados</h2>
        <p class="lead">Pega una etiqueta en la lavadora, el pastillero o la nevera: acercas el teléfono y queda anotado. Con la Lente ves el estado de cada cosa encima de ella.</p>
      </section>

      <div class="quick2">
        <button type="button" class="qbtn" onClick={() => go('/lente')}>
          <span class="tile sm" style={{ background: 'var(--ink)', color: 'var(--on-ink)' }}><Icon name="scan" size={18} /></span>
          <b>Lente</b><span class="tiny muted">Apunta la cámara a una etiqueta o a un producto</span>
        </button>
        <button type="button" class="qbtn" onClick={() => setSheet({ t: 'pulse' })}>
          <span class="tile sm" style={{ background: 'var(--vit-soft)', color: 'var(--vit-ink)' }}><Icon name="finger" size={18} /></span>
          <b>Pulso con la cámara</b><span class="tiny muted">El dedo sobre la cámara, 30 segundos</span>
        </button>
        <button type="button" class="qbtn" onClick={() => setSheet({ t: 'new' })}>
          <span class="tile sm" style={{ background: 'var(--xp-soft)', color: 'var(--xp-ink)' }}><Icon name="nfc" size={18} /></span>
          <b>Nueva etiqueta</b><span class="tiny muted">NFC o código QR para una acción</span>
        </button>
        <button type="button" class="qbtn" onClick={() => setSheet({ t: 'ble' })}>
          <span class="tile sm" style={{ background: 'var(--ene-soft)', color: 'var(--ene-ink)' }}><Icon name="bluetooth" size={18} /></span>
          <b>Aparatos Bluetooth</b><span class="tiny muted">Banda de pulso, tensiómetro o báscula</span>
        </button>
      </div>

      <section class="stack-xs" aria-label="Tus etiquetas">
        <div class="between-c">
          <h2 class="eyebrow">Tus etiquetas{tags.length ? ` · ${tags.length}` : ''}</h2>
          {tags.length > 0 && <a class="link-btn" href="#/etiquetas"><Icon name="printer" size={15} />Imprimir códigos</a>}
        </div>
        {!tags.length && <Empty icon="nfc">Aún no tienes etiquetas. Empieza con una de las ideas de abajo: en dos minutos queda lista.</Empty>}
        <div>
          {tags.map((t) => {
            const st = tagStatus(s, t, today, nowMin());
            return (
              <button key={t.id} type="button" class="lrow" style={{ minHeight: 60 }} onClick={() => setSheet({ t: 'tag', id: t.id })}>
                <span class="tile sm" style={{ background: 'var(--soft)', color: 'var(--ink)' }}><Icon name={st.icon} size={18} /></span>
                <span class="stack-xs grow" style={{ minWidth: 0 }}>
                  <span class="semi">{t.name}</span>
                  <span class="tiny" style={{ color: toneColor(st.tone) }}>{st.line}{t.where ? ` · ${t.where}` : ''}</span>
                </span>
                {t.uses > 0 && <span class="tiny muted">{plural(t.uses, 'vez', 'veces')}</span>}
                <Icon name="right" size={16} />
              </button>
            );
          })}
        </div>
        {stats.uses > 0 && <p class="small muted">Tus etiquetas han anotado {plural(stats.uses, 'cosa', 'cosas')} por ti{stats.top ? `; la que más usas: ${stats.top.name}` : ''}.</p>}
        {nfcSupported() && tags.length > 0 && (
          <button type="button" class={`btn sm soft${nfc ? ' on' : ''}`} style={{ alignSelf: 'flex-start' }} aria-pressed={nfc ? 'true' : 'false'} onClick={readNfc}>
            <Icon name="nfc" size={18} />{nfc ? 'Leyendo NFC… toca para parar' : 'Leer una etiqueta NFC ahora'}
          </button>
        )}
      </section>

      {ideas.length > 0 && (
        <section class="stack-xs" aria-label="Ideas para empezar">
          <h2 class="eyebrow">Ideas para {tags.length ? 'seguir' : 'empezar'}</h2>
          <div>
            {ideas.slice(0, tags.length ? 4 : 6).map((i) => (
              <div key={i.k} class="lrow" style={{ minHeight: 64, cursor: 'default' }}>
                <span class="tile sm" style={{ background: 'var(--soft)', color: 'var(--ink)' }}><Icon name={TAG_ACTIONS[i.action.type].icon} size={18} /></span>
                <span class="stack-xs grow" style={{ minWidth: 0 }}><span class="semi">{i.name}</span><span class="tiny muted">{i.where}. {i.why}</span></span>
                <button type="button" class="btn sm soft" aria-label={`Crear etiqueta: ${i.name}`} onClick={() => {
                  const t = act((st, d) => addTag(st, { action: i.action, name: i.name, where: i.where }, d));
                  if (t) setSheet({ t: 'tag', id: t.id, fresh: true });
                }}>Crear</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section class="card" aria-label="En este teléfono">
        <h2 class="h2">En este teléfono</h2>
        {caps.map(([icon, name, ok, note]) => (
          <div key={name} class="row" style={{ minHeight: 44 }}>
            <Icon name={icon} size={18} />
            <span class="stack-xs grow"><span class="semi">{name}</span><span class="tiny muted">{note}</span></span>
            <span class="tiny strong" style={{ color: ok ? 'var(--good-ink)' : 'var(--muted)' }}>{ok ? 'Disponible' : 'No disponible'}</span>
          </div>
        ))}
        <p class="small muted">La cámara y los sensores se leen aquí mismo: ni el video ni tus mediciones salen del teléfono.</p>
      </section>

      {sheet && sheet.t === 'new' && <NewTagSheet preset={sheet} onClose={close} onMade={(id) => setSheet({ t: 'tag', id, fresh: true })} />}
      {sheet && sheet.t === 'tag' && <TagSheet id={sheet.id} fresh={sheet.fresh} onClose={close} />}
      {sheet && sheet.t === 'pulse' && <PulseSheet onClose={close} />}
      {sheet && sheet.t === 'ble' && <BleSheet onClose={close} />}
    </>
  );
}

// ---------- Nueva etiqueta ----------

function NewTagSheet({ preset, onClose, onMade }) {
  const s = useApp();
  const [type, setType] = useState('chore');
  const [ref, setRef] = useState('');
  const [text, setText] = useState('');
  const [route, setRoute] = useState(TAG_ROUTES[0][0]);
  const [name, setName] = useState('');
  const [where, setWhere] = useState('');
  const chores = (s.chores || []).filter((c) => !c.paused);
  const missions = (s.missions || []).filter((m) => !m.archived && m.kind !== 'avoid');
  const meds = (s.meds || []).filter((m) => !m.archived);
  const pool = type === 'chore' ? chores.map((c) => [c.id, c.title]) : type === 'mission' ? missions.map((m) => [m.id, m.title]) : type === 'dose' ? meds.map((m) => [m.id, m.name]) : null;
  const action = type === 'buy' ? { type, text } : type === 'open' ? { type, route } : type === 'water' ? { type } : { type, ref };
  const ready = type === 'water' || type === 'open' || (type === 'buy' ? text.trim().length >= 2 : !!ref);
  const save = () => {
    const t = act((st, d) => addTag(st, { id: preset.id, code: preset.code, action, name, where }, d));
    if (!t) { toast('No pude crear la etiqueta', 'info'); return; }
    toast('Etiqueta creada', 'nfc');
    onMade(t.id);
  };
  const emptyText = type === 'chore' ? 'No tienes rutinas de la casa todavía. Créalas en Hogar.' : type === 'mission' ? 'No tienes misiones activas.' : 'No tienes medicinas ni suplementos anotados.';
  return (
    <Sheet onClose={onClose} label="Nueva etiqueta">
      <SheetHead title={preset.id ? 'Configurar etiqueta' : preset.code ? 'Ligar este código' : 'Nueva etiqueta'} onClose={onClose} />
      {preset.code && <p class="small muted">Cuando la Lente o el NFC lean ese código, Astra hará lo que elijas aquí.</p>}
      <div class="field"><label>¿Qué hace al leerla?</label>
        <div class="stack-xs" role="group" aria-label="Acción">
          {Object.entries(TAG_ACTIONS).map(([k, a]) => (
            <button key={k} type="button" class="lrow" style={{ minHeight: 48, opacity: type === k ? 1 : 0.62 }} aria-pressed={type === k ? 'true' : 'false'} onClick={() => { setType(k); setRef(''); }}>
              <Icon name={a.icon} size={18} /><span class="grow semi">{a.label}</span>{type === k && <Icon name="check" size={18} />}
            </button>
          ))}
        </div>
      </div>
      {pool && (
        <div class="field"><label>¿Cuál?</label>
          {!pool.length && <p class="small muted">{emptyText}</p>}
          <div class="chips" role="group" aria-label="Elegir">{pool.slice(0, 30).map(([id, label]) => <TChip key={id} sm on={ref === id} onClick={() => setRef(id)}>{label}</TChip>)}</div>
        </div>
      )}
      {type === 'buy' && <div class="field"><label for="tg-t">¿Qué producto se acaba ahí?</label><input id="tg-t" class="input" value={text} maxLength={60} placeholder="Ej. botellón de agua, papel higiénico" onInput={(e) => setText(e.currentTarget.value)} /></div>}
      {type === 'open' && (
        <div class="field"><label>¿Qué pantalla abre?</label>
          <div class="chips" role="group" aria-label="Pantalla">{TAG_ROUTES.map(([r, l]) => <TChip key={r} sm on={route === r} onClick={() => setRoute(r)}>{l}</TChip>)}</div>
        </div>
      )}
      <div class="field"><label for="tg-n">Nombre (opcional)</label><input id="tg-n" class="input" value={name} maxLength={40} placeholder={ready ? tagTitle(s, action) : 'Ej. Lavadora'} onInput={(e) => setName(e.currentTarget.value)} /></div>
      <div class="field"><label for="tg-w">¿Dónde la vas a pegar? (opcional)</label><input id="tg-w" class="input" value={where} maxLength={40} placeholder="Ej. En la puerta de la nevera" onInput={(e) => setWhere(e.currentTarget.value)} /></div>
      <button type="button" class="btn block" disabled={!ready} onClick={save}><Icon name="check" size={20} />Crear etiqueta</button>
    </Sheet>
  );
}

// ---------- Una etiqueta: su código, escribirla en NFC, probarla ----------

function TagSheet({ id, fresh, onClose }) {
  const s = useApp();
  const today = s.energy.day;
  const t = tagOf(s, id);
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(t ? t.name : '');
  const [where, setWhere] = useState(t ? t.where : '');
  const [nfc, setNfc] = useState(''); // '', 'espera', 'ok'
  const ctl = useRef(null);
  useEffect(() => () => { if (ctl.current) ctl.current.abort(); }, []);
  if (!t) return null;
  const url = tagUrl(baseUrl(), t.id);
  const st = tagStatus(s, t, today, nowMin());
  const write = async () => {
    if (nfc === 'espera') { if (ctl.current) ctl.current.abort(); setNfc(''); return; }
    ctl.current = new AbortController();
    setNfc('espera');
    try { await writeNfc(url, ctl.current.signal); setNfc('ok'); toast('Etiqueta escrita. Pégala y pruébala.', 'nfc'); } catch (err) { setNfc(''); const m = nfcErrorText(err); if (m) toast(m, 'info'); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast('Dirección copiada', 'copy'); } catch { toast('No pude copiar', 'info'); } };
  return (
    <Sheet onClose={onClose} label={t.name}>
      <SheetHead title={t.name} onClose={onClose} />
      {fresh && <p class="lead">Lista. Ahora ponla en el mundo: escríbela en una etiqueta NFC o imprime su código.</p>}
      <div class="row" style={{ gap: 14, alignItems: 'center' }}>
        <div class="qr-box" aria-label={`Código QR de ${t.name}`} dangerouslySetInnerHTML={{ __html: qrSvg(url, { size: 132, title: `Código QR de ${t.name}` }) }} />
        <div class="stack-xs grow" style={{ minWidth: 0 }}>
          <span class="row" style={{ gap: 6 }}><Icon name={st.icon} size={16} /><span class="semi">{TAG_ACTIONS[t.action.type].label}</span></span>
          <span class="small" style={{ color: toneColor(st.tone) }}>{st.line}</span>
          {t.where && <span class="tiny muted">{t.where}</span>}
          <span class="tiny muted">{t.uses ? `Usada ${plural(t.uses, 'vez', 'veces')}` : 'Sin usar todavía'} · clave {t.id}</span>
          {t.code && <span class="tiny muted">También responde a un código que ligaste</span>}
        </div>
      </div>
      {nfcSupported() ? (
        <button type="button" class="btn block" onClick={write}><Icon name="nfc" size={20} />{nfc === 'espera' ? 'Acerca la etiqueta al teléfono… (toca para cancelar)' : nfc === 'ok' ? 'Escribir otra etiqueta igual' : 'Escribir en una etiqueta NFC'}</button>
      ) : (
        <p class="small muted">Este teléfono no escribe etiquetas NFC desde aquí (solo Chrome en Android). Usa el código QR: imprímelo y pégalo; se lee con la Lente o con la cámara del teléfono.</p>
      )}
      <div class="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" class="btn soft grow" disabled={!st.can} onClick={() => { fireTag(t.id, { follow: false }); }}><Icon name="play" size={18} />Probar ahora</button>
        <a class="btn soft grow" href="#/etiquetas"><Icon name="printer" size={18} />Imprimir</a>
        <button type="button" class="btn soft grow" onClick={copy}><Icon name="copy" size={18} />Copiar</button>
      </div>
      {edit ? (
        <>
          <div class="field"><label for="te-n">Nombre</label><input id="te-n" class="input" value={name} maxLength={40} ref={focusOnMount} onInput={(e) => setName(e.currentTarget.value)} /></div>
          <div class="field"><label for="te-w">Dónde está</label><input id="te-w" class="input" value={where} maxLength={40} onInput={(e) => setWhere(e.currentTarget.value)} /></div>
          <button type="button" class="btn block" disabled={name.trim().length < 2} onClick={() => { act((st2) => updateTag(st2, t.id, { name, where })); setEdit(false); toast('Guardado', 'check'); }}><Icon name="check" size={20} />Guardar</button>
        </>
      ) : (
        <div class="row" style={{ gap: 8 }}>
          <button type="button" class="btn ghost grow" onClick={() => setEdit(true)}><Icon name="edit" size={18} />Cambiar nombre</button>
          <button type="button" class="btn ghost grow" style={{ color: 'var(--vit-ink)' }} onClick={async () => {
            if (await ask('¿Borrar esta etiqueta? La que pegaste dejará de hacer algo.', { ok: 'Borrar', danger: true })) { act((st2) => removeTag(st2, t.id)); toast('Etiqueta borrada', 'trash'); onClose(); }
          }}><Icon name="trash" size={18} />Borrar</button>
        </div>
      )}
      <p class="small muted">La etiqueta solo guarda una dirección de Astra con su clave: nada personal. Funciona en los teléfonos que tengan tus datos (con sincronización, en todos los tuyos).</p>
    </Sheet>
  );
}

// ---------- Hoja para imprimir los códigos ----------

export function TagsPrint() {
  const s = useApp();
  const tags = tagsOf(s);
  return (
    <main class="screen no-nav">
      <TopBar backTo="/mando?ver=mundo" title="Códigos para imprimir" heading />
      {!tags.length && <Empty icon="nfc" action={<a class="btn sm soft" href="#/mando?ver=mundo">Crear una etiqueta</a>}>No tienes etiquetas todavía.</Empty>}
      {tags.length > 0 && (
        <>
          <p class="lead no-print">Imprime esta hoja, recorta cada código y pégalo donde va. Con cinta transparente encima dura más.</p>
          <button type="button" class="btn block no-print" onClick={() => window.print()}><Icon name="printer" size={20} />Imprimir</button>
          <div class="qr-sheet">
            {tags.map((t) => (
              <div key={t.id} class="qr-cut">
                <div dangerouslySetInnerHTML={{ __html: qrSvg(tagUrl(baseUrl(), t.id), { size: 120, title: t.name }) }} />
                <b>{t.name}</b>
                {t.where && <span>{t.where}</span>}
                <span class="qr-id">Astra · {t.id}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

// ---------- Al abrir la dirección de una etiqueta (#/t/clave) ----------

export function TagRun({ id }) {
  const s = useApp();
  const [res, setRes] = useState(null);
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const r = fireTag(id, { follow: false });
    if (r && !r.unknown) { go(r.ok && r.href ? r.href : '/', { replace: true }); return; }
    setRes(r || { unknown: true });
  }, []);
  if (!res) return <main class="screen no-nav" aria-busy="true" />;
  const some = tagsOf(s).length > 0;
  return (
    <main class="screen no-nav">
      <TopBar backTo="/" title="Etiqueta" heading />
      <Empty icon="nfc" action={(
        <span class="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <a class="btn sm" href={`#/mando?ver=mundo&nueva=${encodeURIComponent(id || '')}`}>Configurarla aquí</a>
          <a class="btn sm soft" href="#/">Ir a Hoy</a>
        </span>
      )}>
        Esta etiqueta todavía no hace nada en este teléfono. {some ? 'Puedes darle una acción ahora.' : 'Si la creaste en otro equipo, sincroniza tus datos; o dale una acción aquí.'}
      </Empty>
    </main>
  );
}

// ---------- Pulso con la cámara ----------

function PulseSheet({ onClose }) {
  const s = useApp();
  const today = s.energy.day;
  const video = useRef(null);
  const canvas = useRef(null);
  const cam = useRef(null);
  const samples = useRef([]);
  const timer = useRef(null);
  const [phase, setPhase] = useState('intro'); // intro | medir | listo | error
  const [msg, setMsg] = useState('');
  const [finger, setFinger] = useState(false);
  const [live, setLive] = useState(null);
  const [secs, setSecs] = useState(0);
  const [res, setRes] = useState(null);
  const [torch, setTorch] = useState(true);
  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } if (cam.current) { cam.current.torch(false); cam.current.stop(); cam.current = null; } };
  useEffect(() => stop, []);
  const base = useMemo(() => baseline(s, 'rhr', today), [s, today]);

  const start = async () => {
    setMsg(''); setRes(null); setLive(null); setSecs(0); setFinger(false);
    samples.current = [];
    setPhase('medir');
    try {
      cam.current = await openCamera(video.current, { low: true });
    } catch (err) { setPhase('error'); setMsg(cameraErrorText(err)); return; }
    setTorch(await cam.current.torch(true));
    let t0 = null; let lastLive = 0; let off = 0;
    timer.current = setInterval(() => {
      const c = frameColor(video.current, canvas.current);
      if (!c) return;
      const on = fingerOn(c);
      const now = performance.now();
      if (!on) {
        off += 1;
        // Si el dedo se quita más de un segundo, se empieza de nuevo.
        if (off > 30 && samples.current.length) { samples.current = []; t0 = null; setSecs(0); setLive(null); }
        if (off === 8) setFinger(false);
        return;
      }
      off = 0;
      if (t0 == null) { t0 = now; setFinger(true); }
      samples.current.push({ t: now - t0, v: c.r });
      const el = (now - t0) / 1000;
      if (now - lastLive > 1000) { lastLive = now; setSecs(Math.floor(el)); if (el > 6) setLive(livePulse(samples.current)); }
      if (el >= PPG_SECONDS) {
        const r = analyzePulse(samples.current);
        stop();
        setRes(r);
        setPhase('listo');
      }
    }, 33);
  };

  const save = () => {
    act((st, t, ev) => logReady(st, t, res.hrvOk ? { rhr: res.bpm, hrv: res.rmssd } : { rhr: res.bpm }, t, ev));
    toast(`Pulso de hoy: ${res.bpm} lpm${res.hrvOk ? ` · VFC ${res.rmssd} ms` : ''}`, 'pulse');
    onClose();
  };

  return (
    <Sheet onClose={() => { stop(); onClose(); }} label="Pulso con la cámara">
      <SheetHead title="Pulso con la cámara" onClose={() => { stop(); onClose(); }} />
      <video ref={video} class="ppg-video" playsInline muted aria-hidden="true" style={{ display: phase === 'medir' ? 'block' : 'none' }} />
      <canvas ref={canvas} hidden />
      {phase === 'intro' && (
        <>
          <p class="lead">Con cada latido cambia cuánta luz deja pasar tu dedo. La cámara lo ve y de ahí sale tu pulso.</p>
          <ol class="steps">
            <li>Siéntate y quédate quieto un minuto. Lo mejor es medirlo al despertar.</li>
            <li>Cubre la cámara de atrás y el flash con la yema del dedo, sin apretar.</li>
            <li>Espera 30 segundos sin moverte ni hablar.</li>
          </ol>
          <button type="button" class="btn block" onClick={start}><Icon name="finger" size={20} />Empezar</button>
          <p class="small muted">Es una estimación para seguir tu tendencia, no un aparato médico. Si la señal no es buena, no da un número.</p>
        </>
      )}
      {phase === 'medir' && (
        <div class="stack-sm" role="status" aria-live="polite" style={{ alignItems: 'center', textAlign: 'center' }}>
          <Ring value={Math.min(1, secs / PPG_SECONDS)} size={132} stroke={10} color="var(--vit)" label="Avance de la medición">
            <span class="stack-xs" style={{ alignItems: 'center' }}>
              <span class="h1">{live ? live.bpm : '—'}</span><span class="tiny muted">lpm</span>
            </span>
          </Ring>
          <p class="lead">{finger ? `No te muevas… ${Math.max(0, PPG_SECONDS - secs)} s` : 'Cubre la cámara y el flash con la yema del dedo'}</p>
          {!torch && <p class="small muted">Este teléfono no deja encender el flash desde aquí: ponte donde haya mucha luz, con el dedo sobre la cámara.</p>}
          <button type="button" class="btn ghost block" onClick={() => { stop(); setPhase('intro'); }}>Cancelar</button>
        </div>
      )}
      {phase === 'listo' && res && res.ok && (
        <>
          <div class="kpis">
            <div class="kpi"><span class="v">{res.bpm}</span><span class="l">Pulso (lpm)</span></div>
            <div class="kpi"><span class="v">{res.hrvOk ? res.rmssd : '—'}</span><span class="l">VFC (ms)</span></div>
            <div class="kpi"><span class="v">{Math.round(res.quality * 100)} %</span><span class="l">Calidad</span></div>
          </div>
          {base && base.n >= 5 && <p class="small muted">Tu normal de 30 días: {Math.round(base.mean)} lpm{Math.abs(res.bpm - base.mean) > Math.max(5, base.sd * 1.5) ? `. Hoy salió ${res.bpm > base.mean ? 'más alto' : 'más bajo'} de lo usual.` : '. Hoy estás en tu rango.'}</p>}
          {!res.hrvOk && <p class="small muted">Para la VFC hace falta una señal muy limpia; esta vez solo guardo el pulso.</p>}
          <button type="button" class="btn block" onClick={save}><Icon name="check" size={20} />Guardar como pulso en reposo de hoy</button>
          <button type="button" class="btn ghost block" onClick={start}>Medir otra vez</button>
          <p class="small muted">Alimenta tu preparación de cada mañana y tus señales en Salud.</p>
        </>
      )}
      {phase === 'listo' && res && !res.ok && (
        <>
          <p class="lead">{PULSE_TEXT[res.reason] || PULSE_TEXT.ruido}</p>
          <button type="button" class="btn block" onClick={start}><Icon name="finger" size={20} />Intentar otra vez</button>
        </>
      )}
      {phase === 'error' && (
        <>
          <p class="lead">{msg}</p>
          <button type="button" class="btn block" onClick={start}>Intentar otra vez</button>
        </>
      )}
    </Sheet>
  );
}

// ---------- Aparatos Bluetooth ----------

function BleSheet({ onClose }) {
  const s = useApp();
  const today = s.energy.day;
  const [kind, setKind] = useState(null);
  const [state, setState] = useState(''); // '', 'conectando', 'on', 'perdido'
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [val, setVal] = useState(null);
  const [n, setN] = useState(0);
  const conn = useRef(null);
  const rr = useRef([]);
  const bpms = useRef([]);
  const stop = () => { if (conn.current) { conn.current.stop(); conn.current = null; } };
  useEffect(() => stop, []);
  const ok = bleSupported();

  const connect = async (k) => {
    setKind(k); setMsg(''); setVal(null); setN(0); rr.current = []; bpms.current = [];
    setState('conectando');
    try {
      conn.current = await connectBle(k, (v) => {
        if (k === 'pulso') { if (v.bpm >= 30 && v.bpm <= 220) bpms.current.push(v.bpm); rr.current.push(...v.rr); setN(bpms.current.length); }
        setVal(v);
      }, () => setState((x) => (x === 'on' ? 'perdido' : x)));
      setName(conn.current.name);
      setState('on');
    } catch (err) { setState(''); setKind(null); const m = bleErrorText(err); if (m) setMsg(m); }
  };

  const hr = kind === 'pulso' ? (() => {
    const st = rrStats(rr.current);
    const xs = bpms.current.slice(-60);
    const avg = xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
    return { avg: st.ok ? st.bpm : avg, rmssd: st.ok ? st.rmssd : null, enough: bpms.current.length >= 30 };
  })() : null;

  const save = () => {
    if (kind === 'pulso' && hr.avg) {
      act((st, t, ev) => logReady(st, t, hr.rmssd ? { rhr: hr.avg, hrv: hr.rmssd } : { rhr: hr.avg }, t, ev));
      toast(`Pulso de hoy: ${hr.avg} lpm${hr.rmssd ? ` · VFC ${hr.rmssd} ms` : ''}`, 'pulse');
    } else if (kind === 'presion' && val) {
      const d = new Date();
      const r = act((st, t, ev) => addBP(st, t, { sys: val.sys, dia: val.dia, pulse: val.pulse, time: minToTime(d.getHours() * 60 + d.getMinutes()) }, t, ev));
      toast(r ? `Presión guardada: ${val.sys}/${val.dia}` : 'Esa lectura no parece válida', r ? 'heart' : 'info');
    } else if (kind === 'peso' && val) {
      const u = weightUnit(s);
      const r = act((st, t) => logWeight(st, t, fromKg(val.kg, u), u));
      toast(r ? `Peso guardado: ${fromKg(val.kg, u).toFixed(1)} ${u}` : 'Esa lectura no parece válida', r ? 'gauge' : 'info');
    }
    stop();
    onClose();
  };

  const cat = kind === 'presion' && val ? bpCategory(val.sys, val.dia) : null;
  return (
    <Sheet onClose={() => { stop(); onClose(); }} label="Aparatos Bluetooth">
      <SheetHead title={kind && state ? BLE_KINDS[kind].name : 'Aparatos Bluetooth'} onClose={() => { stop(); onClose(); }} />
      {!state && (
        <>
          <p class="lead">Astra lee la medición directo del aparato: sin la app del fabricante y sin enviar nada a internet.</p>
          {!ok && <p class="small" style={{ color: 'var(--vit-ink)' }}>Este navegador no deja usar Bluetooth desde una página. Funciona en Chrome para Android y en computadoras con Chrome o Edge. En iPhone, anota la medición a mano en Salud.</p>}
          <div class="stack-xs">
            {Object.entries(BLE_KINDS).map(([k, b]) => (
              <button key={k} type="button" class="lrow" style={{ minHeight: 64 }} disabled={!ok} onClick={() => connect(k)}>
                <span class="tile sm" style={{ background: 'var(--ene-soft)', color: 'var(--ene-ink)' }}><Icon name={b.icon} size={18} /></span>
                <span class="stack-xs grow" style={{ minWidth: 0 }}><span class="semi">{b.name}</span><span class="tiny muted">{b.hint}</span></span>
                <Icon name="right" size={16} />
              </button>
            ))}
          </div>
          {msg && <p class="small" role="status" style={{ color: 'var(--vit-ink)' }}>{msg}</p>}
          <p class="small muted">Solo funcionan los aparatos que usan el estándar de salud de Bluetooth. Los que solo hablan con su propia app no aparecerán en la lista.</p>
        </>
      )}
      {state === 'conectando' && <p class="lead" role="status">Elige tu aparato en la lista del teléfono…</p>}
      {(state === 'on' || state === 'perdido') && (
        <div class="stack-sm" role="status" aria-live="polite">
          <span class="tiny muted">{state === 'on' ? `Conectado a ${name}` : `Se desconectó ${name}`}</span>
          {kind === 'pulso' && (
            <>
              <div class="kpis">
                <div class="kpi"><span class="v">{val ? val.bpm : '—'}</span><span class="l">Ahora (lpm)</span></div>
                <div class="kpi"><span class="v">{hr.avg || '—'}</span><span class="l">Promedio</span></div>
                <div class="kpi"><span class="v">{hr.rmssd || '—'}</span><span class="l">VFC (ms)</span></div>
              </div>
              <Bar value={Math.min(1, n / 60)} color="var(--vit)" label="Tiempo de medición" />
              <p class="small muted">{hr.enough ? 'Ya hay suficiente. Un minuto completo, sentado y quieto, da el mejor número.' : 'Quédate sentado y quieto. Hace falta medio minuto.'}{val && val.contact === false ? ' La banda no hace buen contacto con la piel.' : ''}</p>
              <button type="button" class="btn block" disabled={!hr.enough || !hr.avg} onClick={save}><Icon name="check" size={20} />Guardar como pulso en reposo de hoy</button>
            </>
          )}
          {kind === 'presion' && (val ? (
            <>
              <div class="kpis">
                <div class="kpi"><span class="v">{val.sys}/{val.dia}</span><span class="l">Presión (mmHg)</span></div>
                <div class="kpi"><span class="v">{val.pulse || '—'}</span><span class="l">Pulso</span></div>
              </div>
              {cat && <p class="small muted">{cat.label || ''}</p>}
              <button type="button" class="btn block" onClick={save}><Icon name="check" size={20} />Guardar esta lectura ({fmtClock(minToTime(nowMin()))})</button>
            </>
          ) : <p class="lead">Toma tu presión como siempre. Cuando el tensiómetro termine, la lectura aparece aquí.</p>)}
          {kind === 'peso' && (val ? (
            <>
              <div class="kpis"><div class="kpi"><span class="v">{fromKg(val.kg, weightUnit(s)).toFixed(1)}</span><span class="l">Peso ({weightUnit(s)})</span></div></div>
              <button type="button" class="btn block" onClick={save}><Icon name="check" size={20} />Guardar el peso de hoy</button>
            </>
          ) : <p class="lead">Súbete a la báscula. Cuando marque, el peso aparece aquí.</p>)}
          <button type="button" class="btn ghost block" onClick={() => { stop(); setState(''); setKind(null); }}>Desconectar</button>
        </div>
      )}
    </Sheet>
  );
}
