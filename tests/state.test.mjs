import './helpers.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCards, T } from './helpers.mjs';
import {
  createState, mergeStates, mergeCardEntry, exportProgress, parseImport, ImportError, addReport, activeReports,
  clearReports, formatReports, updateSettings, backupReminderDue, normalizeState, SCHEMA,
} from '../js/state.js';
import { createScheduler, rateCard, Rating, planSession } from '../js/session.js';

const f = createScheduler();
const D1 = T('2026-11-20T10:00:00+01:00');
const D2 = T('2026-11-22T10:00:00+01:00');
const D3 = T('2026-11-25T10:00:00+01:00');

// Two devices with overlapping progress.
function phoneAndLaptop() {
  let phone = createState();
  phone = rateCard(f, phone, 'c0001', Rating.Good, D1).state;
  phone = rateCard(f, phone, 'c0002', Rating.Good, D1).state;
  phone = rateCard(f, phone, 'c0002', Rating.Again, D3).state; // newer on phone
  phone = addReport(phone, 'c0001', 'literówka', D1, () => 0.1);
  let laptop = createState();
  laptop = rateCard(f, laptop, 'c0002', Rating.Good, D2).state; // older than phone's c0002
  laptop = rateCard(f, laptop, 'c0001', Rating.Good, D2).state; // newer than phone's c0001
  laptop = rateCard(f, laptop, 'c0003', Rating.Good, D2).state;
  laptop = addReport(laptop, 'c0003', 'dziwne zdanie', D2, () => 0.2);
  laptop = updateSettings(laptop, { newPerDay: 15 }, D2);
  return { phone, laptop };
}

test('scalanie: dla każdej fiszki wygrywa nowsza powtórka', () => {
  const { phone, laptop } = phoneAndLaptop();
  const m = mergeStates(phone, laptop);
  assert.deepEqual(m.cards.c0001, laptop.cards.c0001);
  assert.deepEqual(m.cards.c0002, phone.cards.c0002);
  assert.deepEqual(m.cards.c0003, laptop.cards.c0003);
  assert.equal(m.settings.newPerDay, 15);
  assert.equal(activeReports(m).length, 2);
});

test('scalanie jest przemienne i idempotentne', () => {
  const { phone, laptop } = phoneAndLaptop();
  const ab = mergeStates(phone, laptop);
  const ba = mergeStates(laptop, phone);
  assert.deepEqual(ab, ba);
  assert.deepEqual(mergeStates(ab, ab), ab);
  assert.deepEqual(mergeStates(ab, laptop), ab);
  assert.deepEqual(mergeStates(mergeStates(ab, phone), laptop), ab);
});

test('scalanie: remis czasu rozstrzygany deterministycznie', () => {
  const a = { fsrs: null, updated: D1.toISOString(), introduced: null };
  const b = { fsrs: null, updated: D1.toISOString(), introduced: '2026-11-20' };
  assert.deepEqual(mergeCardEntry(a, b), mergeCardEntry(b, a));
});

test('scalanie: kalendarz — maksimum na dzień, stare pole sieved zachowane', () => {
  const a = createState();
  a.days = { '2026-11-20': { reviews: 5, sieved: 0 }, '2026-11-21': { reviews: 1, sieved: 0 } };
  const b = createState();
  b.days = { '2026-11-20': { reviews: 3, sieved: 7 }, '2026-11-22': { reviews: 2, sieved: 0 } };
  const m = mergeStates(a, b);
  assert.deepEqual(m.days['2026-11-20'], { reviews: 5, sieved: 7 });
  assert.equal(Object.keys(m.days).length, 3);
});

test('zgłoszenia: wyczyszczone na jednym urządzeniu nie wracają po scaleniu', () => {
  const { phone, laptop } = phoneAndLaptop();
  const cleared = clearReports(phone, D3);
  assert.equal(activeReports(cleared).length, 0);
  const m = mergeStates(cleared, phone);
  assert.equal(activeReports(m).filter((r) => r.cardId === 'c0001').length, 0);
  const m2 = mergeStates(m, laptop);
  assert.equal(activeReports(m2).length, 1); // laptop's report is still open
});

test('formatowanie zgłoszeń do skopiowania', () => {
  const cards = makeCards(3);
  const byId = new Map(cards.map((c) => [c.id, c]));
  let s = addReport(createState(), 'c0002', '  zły przykład ', D1);
  s = addReport(s, 'c9999', '', D2);
  assert.equal(formatReports(s, byId), '[c0002] rijec2 — słowo2: zły przykład\n[c9999] (nieznana fiszka): (bez notatki)');
});

test('eksport → import: pełna zgodność', () => {
  const { phone } = phoneAndLaptop();
  const text = exportProgress(phone, D3);
  const back = parseImport(text);
  assert.deepEqual(back, normalizeState(phone));
  const meta = JSON.parse(text);
  assert.equal(meta.app, 'chorwacki');
  assert.equal(meta.schema, SCHEMA);
});

test('import scala z obecnym postępem zamiast nadpisywać', () => {
  const { phone, laptop } = phoneAndLaptop();
  const incoming = parseImport(exportProgress(laptop, D3));
  const m = mergeStates(phone, incoming);
  assert.ok(m.cards.c0001 && m.cards.c0002 && m.cards.c0003);
  assert.deepEqual(m.cards.c0002, phone.cards.c0002); // local newer review kept
  // and the merged state drives the session correctly
  const plan = planSession(makeCards(20), m, D3);
  assert.ok(!plan.news.includes('c0003'));
});

test('import odrzuca złe pliki z czytelnym komunikatem', () => {
  const bad = [
    ['nie json', /poprawny plik JSON/],
    [JSON.stringify({ foo: 1 }), /nie jest plik kopii/],
    [JSON.stringify({ app: 'chorwacki', kind: 'progress', state: {} }), /Brak wersji/],
    [JSON.stringify({ app: 'chorwacki', kind: 'progress', schema: SCHEMA + 1, state: createState() }), /nowszej wersji/],
    [JSON.stringify({ app: 'chorwacki', kind: 'progress', schema: 1, state: { cards: [] } }), /uszkodzony/],
    [JSON.stringify({ app: 'chorwacki', kind: 'progress', schema: 1, state: { cards: { c0001: { fsrs: null } } } }), /nie ma daty/],
    [JSON.stringify({ app: 'chorwacki', kind: 'progress', schema: 1, state: { cards: { c0001: { fsrs: { due: 'x' }, updated: D1.toISOString() } } } }), /nie ma pola/],
  ];
  for (const [text, re] of bad) {
    assert.throws(() => parseImport(text), (e) => e instanceof ImportError && re.test(e.message), text);
  }
});

test('import starszego/niepełnego stanu uzupełnia braki domyślnymi', () => {
  const minimal = JSON.stringify({ app: 'chorwacki', kind: 'progress', schema: 1, state: { cards: {} } });
  const s = parseImport(minimal);
  assert.deepEqual(s.reports, []);
  assert.equal(s.settings.newPerDay, 10);
  assert.equal(s.settings.direction, 'pl-hr');
});

test('przypomnienie o kopii co 7 dni', () => {
  const { phone } = phoneAndLaptop();
  const dev = { firstUseAt: D1.toISOString(), lastBackupAt: null, lastBackupReminderAt: null };
  assert.equal(backupReminderDue(dev, createState(), T('2026-12-20T10:00:00+01:00')), false); // nothing to back up
  assert.equal(backupReminderDue(dev, phone, T('2026-11-26T10:00:00+01:00')), false);
  assert.equal(backupReminderDue(dev, phone, T('2026-11-27T10:00:00+01:00')), true);
  assert.equal(backupReminderDue({ ...dev, lastBackupAt: '2026-11-25T10:00:00+01:00' }, phone, T('2026-11-27T10:00:00+01:00')), false);
  assert.equal(backupReminderDue({ ...dev, lastBackupReminderAt: '2026-11-26T10:00:00+01:00' }, phone, T('2026-12-02T10:00:00+01:00')), false);
  assert.equal(backupReminderDue({ ...dev, lastBackupReminderAt: '2026-11-26T10:00:00+01:00' }, phone, T('2026-12-03T10:00:00+01:00')), true);
});
