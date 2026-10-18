import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { TopBar, Switch, toast, areaSoft, areaInk } from '../ui/kit.jsx';
import { act, useApp } from '../app/store.js';
import { addDays, fmtDay, fmtShort, relDay } from '../app/dates.js';
import { quoteOf, wordOf, WORD_TYPES } from '../game/daily.js';
import { useWord, wordToCard, WORD_XP } from '../game/logic.js';

// Frase y palabra del día. En Hoy solo se ve la frase y una línea con la palabra; el detalle vive aquí.

export function DailyCard({ today }) {
  const q = quoteOf(today);
  const w = wordOf(today);
  return (
    <section class="daily" aria-label="Frase y palabra del día">
      <figure class="quote">
        <blockquote>«{q.text}»</blockquote>
        {q.author && <figcaption>{q.author}</figcaption>}
      </figure>
      <a href="#/palabra" class="word-link" aria-label={`Palabra del día: ${w.word}. Ver significado y uso`}>
        <span class="aa" aria-hidden="true">Aa</span>
        <span class="grow"><span class="tiny muted semi">Palabra del día · </span><span class="strong">{w.word}</span></span>
        <Icon name="right" size={16} />
      </a>
    </section>
  );
}

export function WordScreen() {
  const s = useApp();
  const today = s.energy.day;
  const [day, setDay] = useState(today);
  const w = wordOf(day);
  const q = quoteOf(today);
  const used = !!(s.wordLog && s.wordLog[today]);
  const front = `«${w.word}»: ¿qué significa?`;
  const inCards = s.cards.some((c) => c.front === front);
  const past = Array.from({ length: 7 }, (_, i) => addDays(today, -(i + 1)));
  const use = () => { if (act((st, t, ev) => useWord(st, t, ev))) toast(`¡Bien usada! +${WORD_XP} XP de Sabiduría`, 'book'); };
  const toCard = () => { if (act((st, t) => wordToCard(st, day, t))) toast('Guardada en tus tarjetas de repaso', 'cards'); };
  return (
    <main class="screen no-nav">
      <TopBar backTo="/" />
      <section class="stack-sm" aria-label="Palabra">
        <span class="eyebrow" style={{ color: areaInk('crecimiento') }}>Palabra del día · {day === today ? 'hoy' : relDay(day, today).toLowerCase()}</span>
        <h1 class="word-big">{w.word}</h1>
        <span class="small muted semi">{WORD_TYPES[w.type] || w.type}</span>
      </section>
      <section class="card" aria-label="Significado">
        <span class="label">Qué significa</span>
        <p style={{ fontSize: 17, lineHeight: 1.5, margin: 0 }}>{w.meaning}</p>
      </section>
      <section class="card" aria-label="Cómo se usa" style={{ background: areaSoft('crecimiento'), borderColor: 'transparent' }}>
        <span class="label" style={{ color: areaInk('crecimiento') }}>Úsala así</span>
        <p style={{ fontSize: 17, lineHeight: 1.5, margin: 0, fontStyle: 'italic' }}>«{w.example}»</p>
        {w.synonyms.length > 0 && <span class="small" style={{ color: areaInk('crecimiento') }}>Parecidas: {w.synonyms.join(', ')}</span>}
      </section>
      {day === today ? (
        <div class="stack-sm">
          <button type="button" class="btn block" disabled={used} onClick={use}>
            <Icon name={used ? 'check' : 'chat'} size={20} />{used ? 'Ya la usaste hoy' : `La usé hoy · +${WORD_XP} XP de Sabiduría`}
          </button>
          <span class="small muted" style={{ textAlign: 'center' }}>Úsala en una conversación, un correo o un mensaje. Así se queda contigo.</span>
        </div>
      ) : (
        <button type="button" class="btn ghost block" onClick={() => setDay(today)}><Icon name="left" size={18} />Volver a la de hoy</button>
      )}
      <button type="button" class="btn soft block" disabled={inCards} onClick={toCard}><Icon name="cards" size={18} />{inCards ? 'Ya está en tus tarjetas de repaso' : 'Guardar en mis tarjetas de repaso'}</button>

      <section class="card flush" aria-label="Días anteriores">
        <div style={{ padding: '14px 0 4px' }}><h2 class="h2">Días anteriores</h2></div>
        {past.map((d) => {
          const x = wordOf(d);
          return (
            <button key={d} type="button" class="lrow" aria-pressed={day === d ? 'true' : 'false'} onClick={() => { setDay(d); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
              <span class="stack-xs grow"><span class="semi">{x.word}{s.wordLog && s.wordLog[d] ? <span class="tiny" style={{ color: areaInk('crecimiento') }}> · la usaste</span> : ''}</span><span class="tiny muted">{x.meaning}</span></span>
              <span class="tiny muted" style={{ flexShrink: 0 }}>{fmtShort(d)}</span>
            </button>
          );
        })}
      </section>

      <section class="card" aria-label="Frase del día">
        <span class="label">Frase del día · {fmtDay(today, { weekdayName: false })}</span>
        <figure class="quote" style={{ margin: 0 }}><blockquote>«{q.text}»</blockquote>{q.author && <figcaption>{q.author}</figcaption>}</figure>
      </section>

      <label class="between-c panel" style={{ cursor: 'pointer' }}>
        <span class="stack-xs"><span class="semi">Mostrar en Hoy</span><span class="small muted">La frase y la palabra del día, arriba de tu día.</span></span>
        <Switch checked={s.settings.showDaily !== false} onChange={(v) => act((st) => { st.settings.showDaily = v; })} label="Mostrar la frase y la palabra en Hoy" />
      </label>
    </main>
  );
}
