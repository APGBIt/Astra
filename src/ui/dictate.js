// Dictado por voz (si el navegador lo permite). Nada se graba ni se guarda.
export const canDictate = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

export function dictate(onText, onEnd) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return () => {};
  const r = new SR();
  r.lang = 'es-DO';
  r.interimResults = true;
  r.continuous = false;
  let finalText = '';
  r.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i += 1) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t;
      else interim += t;
    }
    onText((finalText + interim).trim());
  };
  r.onerror = () => onEnd && onEnd();
  r.onend = () => onEnd && onEnd();
  try { r.start(); } catch { onEnd && onEnd(); }
  return () => { try { r.stop(); } catch { /* */ } };
}
