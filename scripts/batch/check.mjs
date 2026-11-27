#!/usr/bin/env node
// Usage: node check.mjs <batch.txt>
// Batch line format (10 fields, separated by |):
// tier|type|hr|pl|example_hr|example_pl|pos|tags|sim|note
//   tier: 1..5, type: w|p, sim: t|p|o|f, tags: comma-separated
// Validates the batch with the project validator, together with existing data (duplicates).
import { readFileSync, readdirSync } from 'node:fs';
import { validateCards } from '/home/user/chorwacki/scripts/validate.mjs';

const SIM = { t: 'transparent', p: 'partial', o: 'opaque', f: 'false_friend' };
const file = process.argv[2];
const lines = readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const errors = [];
const cards = [];
lines.forEach((ln, i) => {
  const f = ln.split('|').map((x) => x.trim());
  if (f.length !== 10) { errors.push(`linia ${i + 1}: ${f.length} pól zamiast 10: ${ln.slice(0, 80)}`); return; }
  const [tier, t, hr, pl, exh, exp, pos, tags, sim, note] = f;
  if (!/^[1-5]$/.test(tier)) errors.push(`linia ${i + 1} (${hr}): tier musi być 1-5`);
  if (!['w', 'p'].includes(t)) errors.push(`linia ${i + 1} (${hr}): type musi być w albo p`);
  if (!SIM[sim]) errors.push(`linia ${i + 1} (${hr}): sim musi być t/p/o/f`);
  cards.push({ card: { id: `c9${String(i + 1).padStart(4, '0')}`, type: t === 'p' ? 'phrase' : 'word', hr, pl, example_hr: exh, example_pl: exp, pos, rank: 100000 + i, tags: tags.split(',').map((x) => x.trim()), pl_similarity: SIM[sim] || sim, note }, file: `linia ${i + 1}` });
});
const existing = readdirSync('/home/user/chorwacki/data').filter((f) => /^cards-.*\.json$/.test(f)).flatMap((f) => JSON.parse(readFileSync('/home/user/chorwacki/data/' + f, 'utf8'))).map((card) => ({ card, file: 'ISTNIEJĄCE' }));
const res = validateCards([...existing, ...cards]);
const all = [...errors, ...res.errors];
for (const e of all) console.log('BŁĄD', e);
const ownWarn = res.warnings.filter((w) => !w.startsWith('ISTNIEJĄCE'));
for (const w of ownWarn) console.log('uwaga', w);
const ph = cards.filter((c) => c.card.type === 'phrase').length;
console.log(`Linie: ${lines.length} (słowa ${cards.length - ph}, zwroty ${ph}). Błędy: ${all.length}. Uwagi: ${ownWarn.length}.`);
process.exit(all.length ? 1 : 0);
