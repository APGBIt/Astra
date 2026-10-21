// Tus cartas para días difíciles (1.10): frases y acciones que te escribes en un día tranquilo para leerlas cuando
// estés tenso o bajo (como las «coping cards» de MindShift). Salen después de un check-in desagradable y en Calma.
import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Sheet, SheetHead, TChip, toast, ask, areaColor, areaSoft, areaInk } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { copingFor, copingIdeas, addCoping, updateCoping, removeCoping } from '../game/mind.js';

const QUADS = [[0, 'Cuando estoy tenso'], [2, 'Cuando estoy bajo']];
const KINDS = [['frase', 'Frase'], ['accion', 'Acción']];

// Las cartas para cómo te sientes ahora (después de un check-in).
export function CopingCards({ quad, onManage, max = 3 }) {
  const s = useApp();
  const list = copingFor(s, quad).slice(0, max);
  if (!list.length) {
    return (
      <button type="button" class="note" style={{ border: 'none', textAlign: 'left', color: 'var(--ink)', font: 'inherit', width: '100%' }} onClick={onManage}>
        <Icon name="cards" size={18} /><span class="grow">Escribe tus cartas para días difíciles: frases y cosas que te ayudan, para leerlas en momentos así.</span><Icon name="right" size={16} />
      </button>
    );
  }
  return (
    <section class="stack-sm" aria-label="Tus cartas">
      <div class="between-c"><span class="label">Tus cartas</span><button type="button" class="link-btn" style={{ minHeight: 30 }} onClick={onManage}>Editar<Icon name="right" size={14} /></button></div>
      {list.map((c) => (
        <div key={c.id} class="row-top" style={{ gap: 12, padding: '12px 14px', borderRadius: 16, background: areaSoft('emocional'), color: areaInk('emocional') }}>
          <Icon name={c.kind === 'frase' ? 'chat' : 'check'} size={18} />
          <span class={c.kind === 'frase' ? 'semi' : ''} style={{ lineHeight: 1.4 }}>{c.kind === 'frase' ? `«${c.text}»` : c.text}</span>
        </div>
      ))}
    </section>
  );
}

export function CopingSheet({ onClose }) {
  const s = useApp();
  const cards = (s.mind && s.mind.cards) || [];
  const ideas = copingIdeas(s);
  const [text, setText] = useState('');
  const [kind, setKind] = useState('frase');
  const [quads, setQuads] = useState([0, 2]);
  const [edit, setEdit] = useState(null);
  const toggleQ = (q) => setQuads(quads.includes(q) ? (quads.length > 1 ? quads.filter((x) => x !== q) : quads) : [...quads, q]);
  const save = () => {
    if (!text.trim()) return;
    if (edit) act((x) => updateCoping(x, edit, { text, kind, quads }));
    else if (!act((x) => addCoping(x, { text, kind, quads }))) { toast('Esa carta ya la tienes', 'info'); return; }
    toast(edit ? 'Carta guardada' : 'Carta agregada', 'cards');
    setText(''); setEdit(null);
  };
  const startEdit = (c) => { setEdit(c.id); setText(c.text); setKind(c.kind); setQuads(c.quads); };
  return (
    <Sheet onClose={onClose} label="Tus cartas para días difíciles">
      <SheetHead title="Tus cartas" onClose={onClose} />
      <span class="small muted">Escríbelas en un día tranquilo, con tus palabras. Cuando estés tenso o bajo, Astra te las muestra: una frase que te calme o una acción pequeña que te ayude.</span>
      {cards.length > 0 && (
        <section class="card flush" aria-label="Tus cartas">
          {cards.map((c) => (
            <div key={c.id} class="lrow" style={{ minHeight: 56, alignItems: 'flex-start', paddingTop: 10, paddingBottom: 10 }}>
              <span class="tile sm" style={{ background: areaSoft('emocional'), color: areaColor('emocional') }}><Icon name={c.kind === 'frase' ? 'chat' : 'check'} size={16} /></span>
              <span class="stack-xs grow" style={{ minWidth: 0 }}>
                <span class="semi" style={{ lineHeight: 1.35 }}>{c.text}</span>
                <span class="tiny muted semi">{c.kind === 'frase' ? 'Frase' : 'Acción'} · {c.quads.length === 2 ? 'tenso o bajo' : c.quads[0] === 0 ? 'tenso' : 'bajo'}</span>
              </span>
              <button type="button" class="icon-btn plain" aria-label={`Editar: ${c.text}`} onClick={() => startEdit(c)}><Icon name="edit" size={17} /></button>
              <button type="button" class="icon-btn plain" aria-label={`Quitar: ${c.text}`} onClick={async () => { if (await ask('¿Quitar esta carta?', { ok: 'Quitar', danger: true })) act((x) => removeCoping(x, c.id)); }}><Icon name="trash" size={17} /></button>
            </div>
          ))}
        </section>
      )}
      <section class="panel stack-sm" aria-label={edit ? 'Editar carta' : 'Nueva carta'}>
        <div class="seg" role="tablist" aria-label="Tipo de carta">{KINDS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={kind === k ? 'true' : 'false'} onClick={() => setKind(k)}>{l}</button>)}</div>
        <div class="field"><label for="cptxt">{kind === 'frase' ? 'Lo que te quieres decir' : 'Lo que te ayuda hacer'}</label><textarea id="cptxt" class="input" rows={2} maxLength={160} value={text} onInput={(e) => setText(e.currentTarget.value)} placeholder={kind === 'frase' ? 'Ej. Esto va a pasar. Ya he podido antes.' : 'Ej. Llamar a mi hermana'} /></div>
        <div class="chips" role="group" aria-label="Cuándo mostrarla">{QUADS.map(([q, l]) => <TChip key={q} sm on={quads.includes(q)} onClick={() => toggleQ(q)}>{l}</TChip>)}</div>
        <div class="row" style={{ gap: 8 }}>
          {edit && <button type="button" class="btn sm ghost grow" onClick={() => { setEdit(null); setText(''); }}>Cancelar</button>}
          <button type="button" class="btn sm grow" disabled={!text.trim()} onClick={save}><Icon name="check" size={16} />{edit ? 'Guardar' : 'Agregar carta'}</button>
        </div>
      </section>
      {ideas.length > 0 && (
        <section class="stack-sm" aria-label="Ideas para empezar">
          <span class="label">Ideas para empezar</span>
          {ideas.slice(0, 8).map((c) => (
            <button key={c.text} type="button" class="lrow" style={{ minHeight: 48 }} onClick={() => { act((x) => addCoping(x, c)); toast('Carta agregada', 'cards'); }}>
              <Icon name="plus" size={16} /><span class="grow" style={{ textAlign: 'left' }}>{c.text}</span><span class="tiny muted semi">{c.kind === 'frase' ? 'Frase' : 'Acción'}</span>
            </button>
          ))}
        </section>
      )}
    </Sheet>
  );
}
