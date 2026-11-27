// Daily session and sieve logic. Pure — no DOM, no storage.
// Scheduling is done by ts-fsrs; this module only decides WHAT to show and WHEN.

import { fsrs, generatorParameters, createEmptyCard, Rating, State } from '../vendor/ts-fsrs/index.mjs';

export { Rating, State };

/** UI grades in display order: nie wiedziałem / trudne / dobrze / łatwe */
export const GRADES = [
  { rating: Rating.Again, label: 'Nie wiem', key: '1' },
  { rating: Rating.Hard, label: 'Trudne', key: '2' },
  { rating: Rating.Good, label: 'Dobrze', key: '3' },
  { rating: Rating.Easy, label: 'Łatwe', key: '4' },
];

/** Interval given to cards marked "wiedziałem" in the sieve. */
export const SIEVE_KNOWN_DAYS = 60;
/** Cards coming back within this many minutes are shown again in the same session. */
export const RELEARN_WINDOW_MIN = 20;
/** A card answered with a short step comes back after this many other cards. */
export const REQUEUE_GAP = 4;

export function createScheduler() {
  return fsrs(generatorParameters({ enable_fuzz: true, request_retention: 0.9 }));
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

// ---------- daily session ----------

/**
 * Plan today's session: due reviews first (capped), then new cards by rank,
 * up to the daily limit. With a big backlog no new cards are added.
 */
export function planSession(cards, state, now = new Date()) {
  const s = state.settings;
  const due = dueIds(cards, state, now);
  const backlog = due.length > s.backlogThreshold;
  const reviews = due.slice(0, s.maxReviews);
  const remainingNew = backlog ? 0 : Math.max(0, s.newPerDay - introducedToday(state, now));
  const news = newIds(cards, state).slice(0, remainingNew);
  return { reviews, news, backlog, dueTotal: due.length, queue: [...reviews, ...news] };
}

/** Preview of the next interval per grade, for button labels. */
export function previewIntervals(scheduler, entry, now = new Date()) {
  const card = isNew(entry) ? createEmptyCard(now) : deserializeCard(entry.fsrs);
  const out = {};
  for (const g of GRADES) {
    const next = scheduler.next(card, now, g.rating).card;
    out[g.rating] = formatInterval(next.due.getTime() - now.getTime());
  }
  return out;
}

export function formatInterval(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(min / 1440);
  if (d < 31) return `${d} d`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo} mies.`;
  return `${(d / 365).toFixed(1)} r.`;
}

/**
 * Apply a grade. Returns { state, entry, requeue } where requeue is true when the
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
  if (prev && prev.sieve) entry.sieve = prev.sieve;
  const today = dayKey(now);
  const day = state.days[today] || { reviews: 0, sieved: 0 };
  const newState = {
    ...state,
    cards: { ...state.cards, [cardId]: entry },
    days: { ...state.days, [today]: { ...day, reviews: (day.reviews || 0) + 1 } },
  };
  const requeue = next.due.getTime() - now.getTime() <= RELEARN_WINDOW_MIN * 60000;
  return { state: newState, entry, requeue };
}

/** Queue helper: put a card back REQUEUE_GAP positions later (or at the end). */
export function requeueCard(queue, cardId) {
  const q = queue.filter((id) => id !== cardId);
  q.splice(Math.min(REQUEUE_GAP, q.length), 0, cardId);
  return q;
}

/** Session runner state machine (pure). */
export function startSession(plan) {
  return { queue: plan.queue.slice(), done: 0, total: plan.queue.length, again: 0 };
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

// ---------- sieve ----------

/** Cards not yet seen in any way (not reviewed, not sieved), by rank. */
export function sieveCandidates(cards, state) {
  return activeCards(cards)
    .filter((c) => !state.cards[c.id])
    .map((c) => c.id);
}

/**
 * known  → scheduled straight away with a long interval; does NOT count to the daily new limit.
 * !known → stays new (fsrs: null), just marked so the sieve skips it next time.
 */
export function sieveCard(scheduler, state, cardId, known, now = new Date()) {
  let entry;
  if (known) {
    const base = scheduler.next(createEmptyCard(now), now, Rating.Easy).card;
    const days = SIEVE_KNOWN_DAYS;
    const due = new Date(now.getTime() + days * 86400000);
    const c = { ...base, state: State.Review, stability: Math.max(base.stability, days), scheduled_days: days, due, learning_steps: 0 };
    entry = { fsrs: serializeCard(c), updated: now.toISOString(), introduced: null, sieve: 'known' };
  } else {
    entry = { fsrs: null, updated: now.toISOString(), introduced: null, sieve: 'unknown' };
  }
  const today = dayKey(now);
  const day = state.days[today] || { reviews: 0, sieved: 0 };
  return {
    ...state,
    cards: { ...state.cards, [cardId]: entry },
    days: { ...state.days, [today]: { ...day, sieved: (day.sieved || 0) + 1 } },
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
  };
}

/** Consecutive days with activity, ending today (or yesterday if nothing done yet today). */
export function streak(state, now = new Date()) {
  const active = (k) => {
    const d = state.days[k];
    return !!d && (d.reviews || 0) + (d.sieved || 0) > 0;
  };
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  if (!active(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (active(dayKey(d))) {
    n += 1;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
