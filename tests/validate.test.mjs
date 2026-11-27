// The validator itself: catches what docs/fiszki.md forbids.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCards } from '../scripts/validate.mjs';
import { makeCards } from './helpers.mjs';

const run = (cards) => validateCards(cards.map((card) => ({ card, file: 'cards-001.json' })), { files: ['cards-001.json'], indexFiles: ['cards-001.json'] });
const verb = { pos: 'verb', note: '1 os.: pijem · ndk., para: popiti (dk.)' };

test('poprawne fiszki przechodzą', () => {
  const r = run(makeCards(5, { 1: verb }));
  assert.deepEqual(r.errors, []);
});

test('wykrywa zduplikowane id, rank i hasła', () => {
  const r = run(makeCards(3, { 1: { id: 'c0001' }, 2: { rank: 1, hr: 'rijec1' } }));
  assert.ok(r.errors.some((e) => e.includes('zduplikowane id')));
  assert.ok(r.errors.some((e) => e.includes('zduplikowany rank')));
  assert.ok(r.errors.some((e) => e.includes('duplikat hasła')));
});

test('wycofana fiszka nie blokuje rank ani hasła, ale id nadal unikalne', () => {
  const r = run(makeCards(2, { 0: { retired: true }, 1: { rank: 1, hr: 'rijec1' } }));
  assert.deepEqual(r.errors, []);
});

test('wykrywa brakujące i nieznane pola oraz złe wartości', () => {
  const cards = makeCards(4);
  delete cards[0].note;
  cards[1].foo = 1;
  cards[2].tags = ['nieznany'];
  cards[3].pl_similarity = 'similar';
  const r = run(cards);
  assert.ok(r.errors.some((e) => e.includes('brak pola „note”')));
  assert.ok(r.errors.some((e) => e.includes('nieznane pole „foo”')));
  assert.ok(r.errors.some((e) => e.includes('nieznany tag')));
  assert.ok(r.errors.some((e) => e.includes('pl_similarity')));
});

test('czasownik bez 1. osoby i pary aspektowej → błąd', () => {
  const r = run(makeCards(1, { 0: { pos: 'verb', note: 'pić' } }));
  assert.ok(r.errors.some((e) => e.includes('czasownik')));
});

test('fałszywy przyjaciel bez ostrzeżenia → błąd', () => {
  const r = run(makeCards(1, { 0: { pl_similarity: 'false_friend', note: 'uwaga' } }));
  assert.ok(r.errors.some((e) => e.includes('Fałszywy przyjaciel')));
});

test('serbskie formy są wykrywane', () => {
  const cases = ['Imam hiljadu ideja.', 'To je tačno.', 'Šta radiš?', 'Da li si gladan?', 'Mogu da dođem sutra.', 'Treba da učim.', 'Hoćeš li kafu?'];
  for (const ex of cases) {
    const r = run(makeCards(1, { 0: { example_hr: ex } }));
    assert.ok(r.errors.some((e) => e.includes('example_hr')), ex);
  }
  const ok = ['Je li ti dobro?', 'Želim da dođeš.', 'Što radiš večeras?', 'Mogu doći sutra.', 'Gdje si?'];
  for (const ex of ok) assert.deepEqual(run(makeCards(1, { 0: { example_hr: ex } })).errors, [], ex);
});

test('plik spoza index.json → błąd', () => {
  const r = validateCards([], { files: ['cards-001.json', 'cards-002.json'], indexFiles: ['cards-001.json'] });
  assert.ok(r.errors.some((e) => e.includes('cards-002.json')));
});
