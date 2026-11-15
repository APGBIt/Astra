// Escribe un estado sembrado (una persona simulada) para el recorrido en el navegador.
//   node tests/helpers/seed.mjs constante /tmp/seed.json
import fs from 'node:fs';
import { simulate } from './sim.mjs';
import { dayKey } from '../../src/app/dates.js';
import { migrate } from '../../src/app/store.js';

const [profile = 'constante', out = '/tmp/seed.json', days = '90'] = process.argv.slice(2);
const s = migrate(simulate({ end: dayKey(), days: Number(days), profile }));
fs.writeFileSync(out, JSON.stringify(s));
console.log(`${profile}: ${JSON.stringify(s).length} caracteres → ${out}`);
