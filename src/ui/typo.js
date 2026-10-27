// Tipografía en toda la app (1.15): el número y su unidad no se separan al final de una línea.
// «457 %», «7 h 30», «25 min»: se cambia el espacio por uno que no se parte. Se aplica a cada texto que
// Preact pinta, así no hay que acordarse en cada pantalla.
import { options } from 'preact';

const NBSP = ' ';
const PCT = /(\d|\)|−) %/g;
const UNIT = /(\d) (h|min|s)(?=$|[\s.,;:)·])/g;

export function tidy(text) {
  if (typeof text !== 'string' || text.length < 2) return text;
  let t = text;
  if (t.includes('%')) t = t.replace(PCT, `$1${NBSP}%`).replace(/^ %/, `${NBSP}%`);
  if (/\d (?:h|min|s)/.test(t)) t = t.replace(UNIT, `$1${NBSP}$2`);
  return t;
}

const prev = options.vnode;
options.vnode = (vnode) => {
  if (vnode.type === null && typeof vnode.props === 'string') vnode.props = tidy(vnode.props);
  if (prev) prev(vnode);
};
