// Daily session logic. Pure — no DOM, no storage.
// Scheduling is done by ts-fsrs; this module only decides WHAT to show and WHEN.

import { fsrs, generatorParameters, createEmptyCard, Rating, State } from '../vendor/ts-fsrs/index.mjs';

export { Rating, State };

/** Two answers only: "Ne znam" (Again) and "Znam" (Good). */
export const GRADES = [
  { rating: Rating.Again, label: 'Ne znam', key: '1' },
  { rating: Rating.Good, label: 'Znam', key: '2' },
];

/** A card answered "Ne znam" comes back after this many other cards in the same session. */
export const REQUEUE_GAP = 4;

/**
 * One 10-minute (re)learning step: "Znam" on a new card graduates it at once
 * (comes back in ~2 days), "Ne znam" brings it back later in the same session.
 */
export function createScheduler() {
  return fsrs(generatorParameters({ enable_fuzz: true, request_retention: 0.9, learning_steps: ['10m'], relearning_steps: ['10m'] }));
}

// ---------- dates ----------

export function dayKey(date) {
  const d = new Date(date);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// ---------- fsrs card (de)serialization ----------

export function serializeCard(c) {
  return {
    due: new Date(c.due).toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps ?? 0,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? new Date(c.last_review).toISOString() : null,
  };
}

export function deserializeCard(s) {
  return {
    ...s,
    due: new Date(s.due),
    last_review: s.last_review ? new Date(s.last_review) : undefined,
    learning_steps: s.learning_steps ?? 0,
  };
}

// ---------- card classification ----------

/** cards: data cards (from data/*.json). Returns active ones sorted by rank. */
export function activeCards(cards) {
  return cards.filter((c) => !c.retired).sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : 1));
}

export function isNew(entry) {
  return !entry || !entry.fsrs;
}

export function dueIds(cards, state, now) {
  const limit = endOfDay(now).getTime();
  return activeCards(cards)
    .filter((c) => {
      const e = state.cards[c.id];
      return !isNew(e) && Date.parse(e.fsrs.due) <= limit;
    })
    .sort((a, b) => Date.parse(state.cards[a.id].fsrs.due) - Date.parse(state.cards[b.id].fsrs.due))
    .map((c) => c.id);
}

export function newIds(cards, state) {
  return activeCards(cards)
    .filter((c) => isNew(state.cards[c.id]))
    .map((c) => c.id);
}

export function introducedToday(state, now) {
  const today = dayKey(now);
  return Object.values(state.cards).filter((e) => e.introduced === today).length;
}

/** Cards answered today that are finished for today (not due again before midnight). */
export function doneTodayIds(cards, state, now) {
  const today = dayKey(now);
  const limit = endOfDay(now).getTime();
  return activeCards(cards)
    .filter((c) => {
      const e = state.cards[c.id];
      return !isNew(e) && e.fsrs.last_review && dayKey(e.fsrs.last_review) === today && Date.parse(e.fsrs.due) > limit;
    })
    .map((c) => c.id);
}

function dayRecord(state, now) {
  return state.days[dayKey(now)] || { reviews: 0 };
}

// ---------- daily session ----------

/**
 * Plan what is left for today: due reviews first (capped), then new cards by rank.
 * New limit = daily minimum (newPerDay) + extra sessions started today.
 * With a big backlog no new cards are added. Derived from the saved state only,
 * so leaving the app and coming back continues the same day ("2 / 10").
 */
export function planSession(cards, state, now = new Date(), { includeExtra = true } = {}) {
  const s = state.settings;
  const due = dueIds(cards, state, now);
  const backlog = due.length > s.backlogThreshold;
  const reviews = due.slice(0, s.maxReviews);
  const extra = includeExtra ? dayRecord(state, now).extraNew || 0 : 0;
  const remainingNew = backlog ? 0 : Math.max(0, s.newPerDay + extra - introducedToday(state, now));
  const news = newIds(cards, state).slice(0, remainingNew);
  const done = doneTodayIds(cards, state, now).length;
  const queue = [...reviews, ...news];
  return { reviews, news, backlog, dueTotal: due.length, queue, done, total: done + queue.length };
}

/** Daily minimum done: something learned today and nothing left of the base plan. */
export function goalMetToday(cards, state, now = new Date()) {
  const d = dayRecord(state, now);
  if (d.goalMet) return true;
  return (d.reviews || 0) > 0 && planSession(cards, state, now, { includeExtra: false }).queue.length === 0;
}

/** Mark today's minimum as done (sticky, merged with OR between devices). */
export function markGoal(cards, state, now = new Date()) {
  const today = dayKey(now);
  const d = dayRecord(state, now);
  if (d.goalMet || !goalMetToday(cards, state, now)) return state;
  return { ...state, days: { ...state.days, [today]: { ...d, goalMet: true } } };
}

/** "Ucz się dalej": another session of newPerDay new cards today. */
export function addExtraSession(state, now = new Date()) {
  const today = dayKey(now);
  const d = dayRecord(state, now);
  const step = state.settings.newPerDay || 10;
  return { ...state, days: { ...state.days, [today]: { ...d, extraNew: (d.extraNew || 0) + step } } };
}

/**
 * Apply an answer. Returns { state, entry, requeue } where requeue is true when the
 * card should come back later in the same session (short learning step).
 */
export function rateCard(scheduler, state, cardId, rating, now = new Date()) {
  const prev = state.cards[cardId];
  const wasNew = isNew(prev);
  const card = wasNew ? createEmptyCard(now) : deserializeCard(prev.fsrs);
  const next = scheduler.next(card, now, rating).card;
  const entry = {
    fsrs: serializeCard(next),
    updated: now.toISOString(),
    introduced: wasNew ? dayKey(now) : prev.introduced ?? null,
  };
  const today = dayKey(now);
  const day = dayRecord(state, now);
  const newState = {
    ...state,
    cards: { ...state.cards, [cardId]: entry },
    days: { ...state.days, [today]: { ...day, goalMet: day.goalMet ?? false, reviews: (day.reviews || 0) + 1 } },
  };
  const requeue = next.due.getTime() <= endOfDay(now).getTime();
  return { state: newState, entry, requeue };
}

/** Queue helper: put a card back REQUEUE_GAP positions later (or at the end). */
export function requeueCard(queue, cardId) {
  const q = queue.filter((id) => id !== cardId);
  q.splice(Math.min(REQUEUE_GAP, q.length), 0, cardId);
  return q;
}

/** Session runner state (pure). `done` starts from what was already finished today. */
export function startSession(plan) {
  return { queue: plan.queue.slice(), done: plan.done || 0, again: 0 };
}

export function sessionProgress(session) {
  const left = new Set(session.queue).size;
  return { done: session.done, total: session.done + left };
}

export function answer(session, scheduler, state, rating, now = new Date()) {
  const [cardId, ...rest] = session.queue;
  if (!cardId) return { session, state };
  const res = rateCard(scheduler, state, cardId, rating, now);
  let queue = rest;
  let done = session.done;
  if (res.requeue) queue = requeueCard([cardId, ...rest], cardId);
  else done += 1;
  return {
    session: { ...session, queue, done, again: session.again + (rating === Rating.Again ? 1 : 0) },
    state: res.state,
  };
}

// ---------- stats ----------

export function stats(cards, state, now = new Date()) {
  const active = activeCards(cards);
  const activeSet = new Set(active.map((c) => c.id));
  let known = 0;
  for (const [id, e] of Object.entries(state.cards)) if (activeSet.has(id) && !isNew(e)) known += 1;
  return {
    total: active.length,
    known,
    dueToday: dueIds(cards, state, now).length,
    newLeft: newIds(cards, state).length,
    streak: streak(state, now),
    goalMet: goalMetToday(cards, state, now),
  };
}

/**
 * Streak = consecutive days with the daily minimum done, ending today
 * (or yesterday if today's minimum is not done yet).
 * Days saved before goals existed count when there was any activity.
 */
export function streak(state, now = new Date()) {
  const today = dayKey(now);
  const met = (k) => {
    const d = state.days[k];
    if (!d) return false;
    if (d.goalMet !== undefined) return !!d.goalMet;
    return k < today && (d.reviews || 0) + (d.sieved || 0) > 0;
  };
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  if (!met(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (met(dayKey(d))) {
    n += 1;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
