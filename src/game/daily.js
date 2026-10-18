// Frase y palabra del día. Cada día del año tiene una distinta (y al año siguiente cambian de día).
import { QUOTES } from './quotes.js';
import { WORDS } from './words.js';

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

function indexFor(n, day, mult, salt) {
  const [y, m, d] = day.split('-').map(Number);
  const doy = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000);
  let k = mult;
  while (gcd(k, n) !== 1) k += 1;
  return ((doy * k + y * salt) % n + n) % n;
}

export function quoteOf(day) {
  const i = indexFor(QUOTES.length, day, 7, 31);
  const [text, author] = QUOTES[i];
  return { i, text, author };
}

export function wordOf(day) {
  const i = indexFor(WORDS.length, day, 11, 17);
  const [word, type, meaning, example, syn] = WORDS[i];
  return { i, word, type, meaning, example, synonyms: syn ? syn.split(/,\s*/) : [] };
}

export const WORD_TYPES = {
  'adj.': 'adjetivo', 'sust. m.': 'sustantivo masculino', 'sust. f.': 'sustantivo femenino', 'sust. m. pl.': 'sustantivo masculino plural',
  verbo: 'verbo', 'adv.': 'adverbio', 'interj.': 'interjección',
};
