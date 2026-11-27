import './helpers.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCards, T } from './helpers.mjs';
import { createState, updateSettings, mergeStates } from '../js/state.js';
import {
  createScheduler, planSession, startSession, answer, rateCard, Rating, State, introducedToday, stats, streak,
  dayKey, requeueCard, sessionProgress, goalMetToday, markGoal, addExtraSession, doneTodayIds,
} from '../js/session.js';

const f = createScheduler();
const NOW = T('2026-11-27T10:00:00+01:00');
const later = (min) => new Date(NOW.getTime() + min * 60000);

/** Put a card into review state due at `due`. */
function withReview(state, id, due, reviewedAt = T('2026-11-20T10:00:00+01:00')) {
  const s = rateCard(f, state, id, Rating.Good, reviewedAt).state;
  const e = s.cards[id];
  return { ...s, days: {}, cards: { ...s.cards, [id]: { ...e, introduced: '2026-11-20', fsrs: { ...e.fsrs, due: new Date(due).toISOString() } } } };
}

/** Answer the whole queue with `rating`, minute by minute. */
function run(sess, s, rating, start = NOW) {
  let t = start.getTime();
  let guard = 0;
  while (sess.queue.length && guard++ < 200) {
    t += 60000;
    ({ session: sess, state: s } = answer(sess, f, s, rating(sess.queue[0]), new Date(t)));
  }
  return { sess, s, t: new Date(t) };
}

test('nowa sesja: tylko nowe fiszki według rank, domyślnie 10', () => {
  const cards = makeCards(30).reverse(); // order in file must not matter
  const plan = planSession(cards, createState(), NOW);
  assert.equal(plan.reviews.length, 0);
  assert.deepEqual(plan.news, makeCards(10).map((c) => c.id));
  assert.equal(plan.backlog, false);
  assert.equal(plan.total, 10);
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
  assert.equal(plan.news[0], 'c0001');
});

test('„Znam” zalicza fiszkę od razu, „Ne znam” wraca w tej samej sesji', () => {
  const cards = makeCards(6);
  let s = updateSettings(createState(), { newPerDay: 6 }, NOW);
  let sess = startSession(planSession(cards, s, NOW));
  ({ session: sess, state: s } = answer(sess, f, s, Rating.Good, NOW)); // c0001 znam
  assert.equal(sess.done, 1);
  assert.ok(!sess.queue.includes('c0001'));
  assert.equal(s.cards.c0001.fsrs.state, State.Review);
  assert.ok(Date.parse(s.cards.c0001.fsrs.due) > Date.parse('2026-11-28T00:00:00+01:00'));
  ({ session: sess, state: s } = answer(sess, f, s, Rating.Again, NOW)); // c0002 ne znam
  assert.equal(sess.done, 1);
  assert.equal(sess.queue.indexOf('c0002'), 4);
  assert.equal(sess.again, 1);
  assert.equal(s.cards.c0002.introduced, dayKey(NOW));
  assert.equal(s.days[dayKey(NOW)].reviews, 2);
  // second time "znam" → done, comes back tomorrow or later
  sess = { ...sess, queue: ['c0002', ...sess.queue.filter((x) => x !== 'c0002')] };
  ({ session: sess, state: s } = answer(sess, f, s, Rating.Good, later(5)));
  assert.equal(sess.done, 2);
  assert.ok(Date.parse(s.cards.c0002.fsrs.due) > Date.parse('2026-11-28T00:00:00+01:00'));
});

test('wyjście i powrót: postęp dnia się zgadza (2 / 10, a nie 0 / 8)', () => {
  const cards = makeCards(30);
  let s = createState();
  let sess = startSession(planSession(cards, s, NOW));
  assert.deepEqual(sessionProgress(sess), { done: 0, total: 10 });
  ({ session: sess, state: s } = answer(sess, f, s, Rating.Good, NOW));
  ({ session: sess, state: s } = answer(sess, f, s, Rating.Good, later(1)));
  // app closed; reopened later → new plan from saved state only
  const plan = planSession(cards, s, later(30));
  const resumed = startSession(plan);
  assert.deepEqual(sessionProgress(resumed), { done: 2, total: 10 });
  assert.equal(resumed.queue[0], 'c0003');
});

test('powrót po „Ne znam”: fiszka czeka w sesji, licznik bez zmian', () => {
  const cards = makeCards(30);
  let s = createState();
  let sess = startSession(planSession(cards, s, NOW));
  ({ session: sess, state: s } = answer(sess, f, s, Rating.Again, NOW)); // c0001 learning
  ({ session: sess, state: s } = answer(sess, f, s, Rating.Good, later(1))); // c0002 done
  const resumed = startSession(planSession(cards, s, later(60)));
  assert.deepEqual(sessionProgress(resumed), { done: 1, total: 10 });
  assert.equal(resumed.queue[0], 'c0001'); // due learning card first
});

test('limit nowych da się zmienić, a wprowadzone dziś pomniejszają limit', () => {
  const cards = makeCards(30);
  let s = updateSettings(createState(), { newPerDay: 5 }, NOW);
  assert.equal(planSession(cards, s, NOW).news.length, 5);
  s = rateCard(f, s, 'c0001', Rating.Good, NOW).state;
  s = rateCard(f, s, 'c0002', Rating.Again, NOW).state;
  assert.equal(introducedToday(s, NOW), 2);
  assert.equal(planSession(cards, s, NOW).news.length, 3);
  assert.equal(planSession(cards, s, T('2026-11-28T10:00:00+01:00')).news.length, 5);
});

test('dzienne minimum, potem kolejne sesje po 10 nowych', () => {
  const cards = makeCards(50);
  let s = createState();
  assert.equal(goalMetToday(cards, s, NOW), false);
  let r = run(startSession(planSession(cards, s, NOW)), s, () => Rating.Good);
  s = markGoal(cards, r.s, r.t);
  assert.equal(goalMetToday(cards, s, r.t), true);
  assert.equal(s.days[dayKey(NOW)].goalMet, true);
  assert.equal(planSession(cards, s, r.t).queue.length, 0);
  // "Ucz się dalej"
  s = addExtraSession(s, r.t);
  const plan = planSession(cards, s, r.t);
  assert.equal(plan.news.length, 10);
  assert.equal(plan.news[0], 'c0011');
  assert.deepEqual({ done: plan.done, total: plan.total }, { done: 10, total: 20 });
  r = run(startSession(plan), s, () => Rating.Good, r.t);
  assert.equal(doneTodayIds(cards, r.s, r.t).length, 20);
  // extra sessions do not raise tomorrow's minimum
  assert.equal(planSession(cards, r.s, T('2026-11-28T10:00:00+01:00')).news.length, 10);
});

test('minimum nie jest zaliczone bez nauki i nie znika po „Ucz się dalej”', () => {
  const cards = makeCards(50);
  let s = updateSettings(createState(), { newPerDay: 0 }, NOW);
  assert.equal(goalMetToday(cards, s, NOW), false); // nothing learned today
  s = updateSettings(s, { newPerDay: 2 }, NOW);
  const r = run(startSession(planSession(cards, s, NOW)), s, () => Rating.Good);
  s = markGoal(cards, addExtraSession(r.s, r.t), r.t);
  assert.equal(goalMetToday(cards, s, r.t), true);
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
  const s = withReview(createState(), 'c0001', '2026-11-26T08:00:00+01:00');
  const plan = planSession(cards, s, NOW);
  assert.ok(!plan.queue.includes('c0001'));
  assert.equal(stats(cards, s, NOW).total, 4);
  assert.equal(stats(cards, s, NOW).known, 0);
});

test('requeueCard wstawia fiszkę kilka pozycji dalej albo na koniec', () => {
  assert.deepEqual(requeueCard(['a', 'b', 'c'], 'a'), ['b', 'c', 'a']);
  assert.deepEqual(requeueCard(['a', 'b', 'c', 'd', 'e', 'f'], 'a'), ['b', 'c', 'd', 'e', 'a', 'f']);
});

test('seria dni liczy dni z zaliczonym minimum', () => {
  const s = createState();
  s.days = {
    '2026-11-24': { reviews: 3, goalMet: true },
    '2026-11-25': { reviews: 1, goalMet: true },
    '2026-11-26': { reviews: 4, goalMet: true },
  };
  assert.equal(streak(s, NOW), 3); // today not done yet → counts to yesterday
  s.days['2026-11-27'] = { reviews: 2, goalMet: false };
  assert.equal(streak(s, NOW), 3);
  s.days['2026-11-27'].goalMet = true;
  assert.equal(streak(s, NOW), 4);
  s.days['2026-11-25'].goalMet = false; // minimum not done that day breaks the streak
  assert.equal(streak(s, NOW), 2);
  assert.equal(streak(s, T('2026-11-30T10:00:00+01:00')), 0);
});

test('seria: dni zapisane przed wprowadzeniem minimum liczą się, gdy była nauka', () => {
  const s = createState();
  s.days = { '2026-11-25': { reviews: 2 }, '2026-11-26': { sieved: 5, reviews: 0 }, '2026-11-27': { reviews: 1 } };
  assert.equal(streak(s, NOW), 2); // today (no goal flag) does not count yet
});

test('scalanie dni: minimum (OR) i dodatkowe sesje (max) z dwóch urządzeń', () => {
  const a = createState();
  a.days = { '2026-11-27': { reviews: 5, goalMet: false, extraNew: 10 } };
  const b = createState();
  b.days = { '2026-11-27': { reviews: 12, goalMet: true }, '2026-11-26': { reviews: 1 } };
  const m = mergeStates(a, b);
  assert.deepEqual(m.days['2026-11-27'], { reviews: 12, goalMet: true, extraNew: 10 });
  assert.deepEqual(m.days['2026-11-26'], { reviews: 1 });
  assert.deepEqual(mergeStates(b, a), m);
});

test('statystyki: poznane, do powtórki dziś, minimum', () => {
  const cards = makeCards(10);
  let s = withReview(createState(), 'c0001', '2026-11-26T08:00:00+01:00');
  s = withReview(s, 'c0002', '2026-12-26T08:00:00+01:00');
  const st = stats(cards, s, NOW);
  assert.equal(st.known, 2);
  assert.equal(st.dueToday, 1);
  assert.equal(st.total, 10);
  assert.equal(st.newLeft, 8);
  assert.equal(st.goalMet, false);
});
