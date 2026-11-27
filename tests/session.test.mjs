import './helpers.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCards, T } from './helpers.mjs';
import { createState, updateSettings } from '../js/state.js';
import {
  createScheduler, planSession, startSession, answer, rateCard, Rating, State, sieveCard, sieveCandidates,
  introducedToday, stats, streak, dueIds, newIds, SIEVE_KNOWN_DAYS, dayKey, formatInterval, requeueCard,
} from '../js/session.js';

const f = createScheduler();
const NOW = T('2026-11-27T10:00:00+01:00');

/** Put a card into review state due at `due`. */
function withReview(state, id, due, reviewedAt = T('2026-11-20T10:00:00+01:00')) {
  let s = rateCard(f, state, id, Rating.Easy, reviewedAt).state;
  const e = s.cards[id];
  return { ...s, days: {}, cards: { ...s.cards, [id]: { ...e, introduced: '2026-11-20', fsrs: { ...e.fsrs, due: new Date(due).toISOString() } } } };
}

test('nowa sesja: tylko nowe fiszki według rank, domyślnie 10', () => {
  const cards = makeCards(30).reverse(); // order in file must not matter
  const plan = planSession(cards, createState(), NOW);
  assert.equal(plan.reviews.length, 0);
  assert.deepEqual(plan.news, makeCards(10).map((c) => c.id));
  assert.equal(plan.backlog, false);
});

test('najpierw zaległe powtórki (od najstarszych), potem nowe', () => {
  const cards = makeCards(20);
  let s = createState();
  s = withReview(s, 'c0005', '2026-11-26T09:00:00+01:00');
  s = withReview(s, 'c0003', '2026-11-25T09:00:00+01:00');
  s = withReview(s, 'c0007', '2026-12-10T09:00:00+01:00'); // not due
  s = withReview(s, 'c0009', '2026-11-27T22:00:00+01:00'); // due later today → included
  const plan = planSession(cards, s, NOW);
  assert.deepEqual(plan.reviews, ['c0003', 'c0005', 'c0009']);
  assert.deepEqual(plan.queue.slice(0, 3), ['c0003', 'c0005', 'c0009']);
  assert.equal(plan.news.length, 10);
  assert.ok(!plan.news.includes('c0007') && !plan.news.includes('c0003'));
  assert.equal(plan.news[0], 'c0001');
});

test('limit nowych da się zmienić, a wprowadzone dziś pomniejszają limit', () => {
  const cards = makeCards(30);
  let s = updateSettings(createState(), { newPerDay: 5 }, NOW);
  assert.equal(planSession(cards, s, NOW).news.length, 5);
  s = rateCard(f, s, 'c0001', Rating.Good, NOW).state;
  s = rateCard(f, s, 'c0002', Rating.Easy, NOW).state;
  assert.equal(introducedToday(s, NOW), 2);
  const plan = planSession(cards, s, NOW);
  assert.equal(plan.news.length, 3);
  assert.equal(plan.news[0], 'c0003');
  // next day the limit resets
  assert.equal(planSession(cards, s, T('2026-11-28T10:00:00+01:00')).news.length, 5);
});

test('duże zaległości: bez nowych fiszek, powtórki ograniczone limitem sesji', () => {
  const cards = makeCards(200);
  let s = createState();
  for (let i = 1; i <= 120; i++) s = withReview(s, `c${String(i).padStart(4, '0')}`, '2026-11-26T08:00:00+01:00');
  const plan = planSession(cards, s, NOW);
  assert.equal(plan.backlog, true);
  assert.equal(plan.news.length, 0);
  assert.equal(plan.dueTotal, 120);
  assert.equal(plan.reviews.length, s.settings.maxReviews);
});

test('wycofane (retired) fiszki nie trafiają do sesji ani statystyk', () => {
  const cards = makeCards(5, { 0: { retired: true } });
  let s = withReview(createState(), 'c0001', '2026-11-26T08:00:00+01:00');
  const plan = planSession(cards, s, NOW);
  assert.ok(!plan.queue.includes('c0001'));
  assert.equal(stats(cards, s, NOW).total, 4);
  assert.equal(stats(cards, s, NOW).known, 0);
});

test('odpowiedź: krótki krok wraca w tej samej sesji, długi kończy fiszkę', () => {
  const cards = makeCards(6);
  let s = updateSettings(createState(), { newPerDay: 6 }, NOW);
  let sess = startSession(planSession(cards, s, NOW));
  assert.equal(sess.queue[0], 'c0001');
  ({ session: sess, state: s } = answer(sess, f, s, Rating.Good, NOW)); // learning step (10 min)
  assert.equal(sess.done, 0);
  assert.equal(sess.queue.indexOf('c0001'), 4);
  assert.equal(s.cards.c0001.fsrs.state, State.Learning);
  ({ session: sess, state: s } = answer(sess, f, s, Rating.Easy, NOW)); // c0002 → review
  assert.equal(sess.done, 1);
  assert.ok(!sess.queue.includes('c0002'));
  assert.equal(s.cards.c0002.fsrs.state, State.Review);
  assert.equal(s.cards.c0002.introduced, dayKey(NOW));
  assert.equal(s.days[dayKey(NOW)].reviews, 2);
});

test('sesja kończy się, gdy wszystko zaliczone', () => {
  const cards = makeCards(3);
  let s = createState();
  let sess = startSession(planSession(cards, s, NOW));
  let t = NOW.getTime();
  let guard = 0;
  while (sess.queue.length && guard++ < 50) {
    t += 60000;
    ({ session: sess, state: s } = answer(sess, f, s, Rating.Good, new Date(t)));
  }
  assert.equal(sess.queue.length, 0);
  assert.equal(sess.done, 3);
  for (const id of ['c0001', 'c0002', 'c0003']) assert.equal(s.cards[id].fsrs.state, State.Review);
});

test('„nie wiem” przy powtórce: fiszka wraca w tej samej sesji, lapses rośnie', () => {
  const cards = makeCards(3);
  let s = withReview(createState(), 'c0002', '2026-11-26T08:00:00+01:00');
  s = updateSettings(s, { newPerDay: 0 }, NOW);
  let sess = startSession(planSession(cards, s, NOW));
  assert.deepEqual(sess.queue, ['c0002']);
  ({ session: sess, state: s } = answer(sess, f, s, Rating.Again, NOW));
  assert.deepEqual(sess.queue, ['c0002']);
  assert.equal(sess.again, 1);
  assert.equal(s.cards.c0002.fsrs.lapses, 1);
  assert.equal(s.cards.c0002.introduced, '2026-11-20'); // not re-introduced
});

test('requeueCard wstawia fiszkę kilka pozycji dalej albo na koniec', () => {
  assert.deepEqual(requeueCard(['a', 'b', 'c'], 'a'), ['b', 'c', 'a']);
  assert.deepEqual(requeueCard(['a', 'b', 'c', 'd', 'e', 'f'], 'a'), ['b', 'c', 'd', 'e', 'a', 'f']);
});

test('przesiew: znane dostają długi odstęp i nie liczą się do limitu', () => {
  const cards = makeCards(30);
  let s = createState();
  s = sieveCard(f, s, 'c0001', true, NOW);
  s = sieveCard(f, s, 'c0002', true, NOW);
  s = sieveCard(f, s, 'c0003', false, NOW);
  const e = s.cards.c0001;
  assert.equal(e.sieve, 'known');
  assert.equal(e.fsrs.state, State.Review);
  const days = (Date.parse(e.fsrs.due) - NOW.getTime()) / 86400000;
  assert.equal(Math.round(days), SIEVE_KNOWN_DAYS);
  assert.ok(e.fsrs.stability >= SIEVE_KNOWN_DAYS);
  assert.equal(introducedToday(s, NOW), 0);
  const plan = planSession(cards, s, NOW);
  assert.equal(plan.news.length, 10); // full limit still available
  assert.ok(!plan.news.includes('c0001') && !plan.news.includes('c0002'));
  assert.equal(plan.news[0], 'c0003'); // "nie wiedziałem" stays new, in rank order
  assert.deepEqual(sieveCandidates(cards, s).slice(0, 2), ['c0004', 'c0005']);
  assert.equal(s.days[dayKey(NOW)].sieved, 3);
  // known card is not due today, but counts as known
  assert.ok(!dueIds(cards, s, NOW).includes('c0001'));
  assert.equal(stats(cards, s, NOW).known, 2);
  assert.ok(newIds(cards, s).includes('c0003'));
});

test('przesiana jako znana fiszka po terminie wraca jako zwykła powtórka', () => {
  const cards = makeCards(3);
  let s = sieveCard(f, createState(), 'c0001', true, NOW);
  const later = new Date(NOW.getTime() + 61 * 86400000);
  const plan = planSession(cards, s, later);
  assert.deepEqual(plan.reviews, ['c0001']);
  const r = rateCard(f, s, 'c0001', Rating.Good, later);
  assert.ok(Date.parse(r.entry.fsrs.due) - later.getTime() > 60 * 86400000);
});

test('seria dni: liczy dni z aktywnością do dziś (albo do wczoraj)', () => {
  const s = createState();
  s.days = { '2026-11-24': { reviews: 3 }, '2026-11-25': { reviews: 1 }, '2026-11-26': { sieved: 4 } };
  assert.equal(streak(s, NOW), 3); // nothing today yet → counts to yesterday
  s.days['2026-11-27'] = { reviews: 1 };
  assert.equal(streak(s, NOW), 4);
  assert.equal(streak(s, T('2026-11-29T10:00:00+01:00')), 0);
  s.days['2026-11-22'] = { reviews: 9 }; // gap on 23rd
  assert.equal(streak(s, NOW), 4);
});

test('statystyki: poznane, do powtórki dziś', () => {
  const cards = makeCards(10);
  let s = withReview(createState(), 'c0001', '2026-11-26T08:00:00+01:00');
  s = withReview(s, 'c0002', '2026-12-26T08:00:00+01:00');
  const st = stats(cards, s, NOW);
  assert.equal(st.known, 2);
  assert.equal(st.dueToday, 1);
  assert.equal(st.total, 10);
  assert.equal(st.newLeft, 8);
});

test('formatInterval', () => {
  assert.equal(formatInterval(60000), '1 min');
  assert.equal(formatInterval(10 * 60000), '10 min');
  assert.equal(formatInterval(3 * 3600000), '3 h');
  assert.equal(formatInterval(4 * 86400000), '4 d');
  assert.equal(formatInterval(90 * 86400000), '3 mies.');
});
