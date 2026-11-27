// Progress state: creation, merging, export/import. Pure — no DOM, no storage.
//
// State shape (schema 1):
// {
//   schema: 1,
//   cards: { [cardId]: CardEntry },
//   reports: [ { id, cardId, note, at, deleted? } ],
//   days: { 'YYYY-MM-DD': { reviews, sieved } },
//   settings: { newPerDay, direction, updated }
// }
// CardEntry: { fsrs: SerializedFsrsCard | null, updated: ISO, introduced: 'YYYY-MM-DD' | null, sieve?: 'known' | 'unknown' }
//   fsrs === null  → card is still "new" (e.g. marked "nie wiedziałem" in the sieve)
//   updated        → time of the last review / sieve decision; the newer entry wins on merge

export const SCHEMA = 1;
export const APP_ID = 'chorwacki';

export const DEFAULT_SETTINGS = Object.freeze({
  newPerDay: 10,
  direction: 'pl-hr', // 'pl-hr' | 'hr-pl'
  maxReviews: 100, // review cap per daily session (~10–15 min)
  backlogThreshold: 50, // more due reviews than this → no new cards today
  updated: null,
});

export function createState() {
  return { schema: SCHEMA, cards: {}, reports: [], days: {}, settings: { ...DEFAULT_SETTINGS } };
}

/** Fill in missing parts so older/partial states are safe to use. */
export function normalizeState(s) {
  const out = createState();
  if (!s || typeof s !== 'object') return out;
  out.cards = isPlainObject(s.cards) ? { ...s.cards } : {};
  out.reports = Array.isArray(s.reports) ? s.reports.slice() : [];
  out.days = isPlainObject(s.days) ? { ...s.days } : {};
  out.settings = { ...DEFAULT_SETTINGS, ...(isPlainObject(s.settings) ? s.settings : {}) };
  return out;
}

// ---------- merging ----------

function entryKey(e) {
  return JSON.stringify(e);
}

/** Newer `updated` wins; ties broken deterministically so merge is commutative. */
export function mergeCardEntry(a, b) {
  if (!a) return b;
  if (!b) return a;
  const ta = Date.parse(a.updated) || 0;
  const tb = Date.parse(b.updated) || 0;
  if (ta !== tb) return ta > tb ? a : b;
  return entryKey(a) >= entryKey(b) ? a : b;
}

function mergeReports(ra, rb) {
  const byId = new Map();
  for (const r of [...ra, ...rb]) {
    if (!r || typeof r.id !== 'string') continue;
    const prev = byId.get(r.id);
    if (!prev) {
      byId.set(r.id, { ...r });
    } else {
      const merged = { ...prev };
      // deletion is sticky: a report cleared on any device stays cleared
      const del = [prev.deleted, r.deleted].filter(Boolean).sort();
      if (del.length) merged.deleted = del[0];
      if (!prev.note && r.note) merged.note = r.note;
      byId.set(r.id, merged);
    }
  }
  return [...byId.values()].sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

function mergeDays(da, db) {
  const out = {};
  for (const k of new Set([...Object.keys(da), ...Object.keys(db)])) {
    const a = da[k] || {};
    const b = db[k] || {};
    out[k] = { reviews: Math.max(a.reviews || 0, b.reviews || 0), sieved: Math.max(a.sieved || 0, b.sieved || 0) };
  }
  return out;
}

function mergeSettings(a, b) {
  const ta = Date.parse(a.updated) || 0;
  const tb = Date.parse(b.updated) || 0;
  if (ta !== tb) return { ...(ta > tb ? a : b) };
  return { ...(entryKey(a) >= entryKey(b) ? a : b) };
}

/** Merge two progress states (e.g. phone + import from laptop). Commutative and idempotent. */
export function mergeStates(sa, sb) {
  const a = normalizeState(sa);
  const b = normalizeState(sb);
  const cards = {};
  for (const id of new Set([...Object.keys(a.cards), ...Object.keys(b.cards)])) {
    cards[id] = mergeCardEntry(a.cards[id], b.cards[id]);
  }
  return {
    schema: SCHEMA,
    cards,
    reports: mergeReports(a.reports, b.reports),
    days: mergeDays(a.days, b.days),
    settings: mergeSettings(a.settings, b.settings),
  };
}

// ---------- export / import ----------

export function exportProgress(state, now = new Date()) {
  return JSON.stringify({ app: APP_ID, kind: 'progress', schema: SCHEMA, exportedAt: now.toISOString(), state: normalizeState(state) });
}

export class ImportError extends Error {}

/** Older schemas are migrated here, step by step. */
export function migrate(stateObj, fromSchema) {
  if (fromSchema === SCHEMA) return stateObj;
  throw new ImportError(`Nieobsługiwana wersja pliku (schema ${fromSchema}).`);
}

/** Parse an exported file. Throws ImportError with a Polish, user-facing message. */
export function parseImport(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new ImportError('To nie jest poprawny plik JSON.');
  }
  if (!isPlainObject(obj) || obj.app !== APP_ID || obj.kind !== 'progress') {
    throw new ImportError('To nie jest plik kopii postępu z tej aplikacji.');
  }
  if (!Number.isInteger(obj.schema) || obj.schema < 1) throw new ImportError('Brak wersji formatu w pliku.');
  if (obj.schema > SCHEMA) throw new ImportError('Plik pochodzi z nowszej wersji aplikacji. Odśwież aplikację i spróbuj ponownie.');
  const st = migrate(obj.state, obj.schema);
  const problem = validateState(st);
  if (problem) throw new ImportError(`Plik jest uszkodzony: ${problem}`);
  return normalizeState(st);
}

const FSRS_FIELDS = ['due', 'stability', 'difficulty', 'elapsed_days', 'scheduled_days', 'reps', 'lapses', 'state'];

/** Returns null when OK, otherwise a short description of the problem. */
export function validateState(s) {
  if (!isPlainObject(s)) return 'brak danych postępu';
  if (!isPlainObject(s.cards)) return 'brak listy fiszek';
  for (const [id, e] of Object.entries(s.cards)) {
    if (!isPlainObject(e)) return `wpis ${id} nie jest obiektem`;
    if (typeof e.updated !== 'string' || Number.isNaN(Date.parse(e.updated))) return `wpis ${id} nie ma daty`;
    if (e.fsrs !== null) {
      if (!isPlainObject(e.fsrs)) return `wpis ${id} ma błędny stan powtórek`;
      for (const f of FSRS_FIELDS) if (!(f in e.fsrs)) return `wpis ${id} nie ma pola ${f}`;
      if (Number.isNaN(Date.parse(e.fsrs.due))) return `wpis ${id} ma błędny termin`;
    }
  }
  if (s.reports !== undefined && !Array.isArray(s.reports)) return 'błędna lista zgłoszeń';
  if (s.days !== undefined && !isPlainObject(s.days)) return 'błędny kalendarz';
  if (s.settings !== undefined && !isPlainObject(s.settings)) return 'błędne ustawienia';
  return null;
}

// ---------- reports ----------

export function addReport(state, cardId, note, now = new Date(), rand = Math.random) {
  const id = `r${now.getTime().toString(36)}${Math.floor(rand() * 1e6).toString(36)}`;
  return { ...state, reports: [...state.reports, { id, cardId, note: String(note || '').trim(), at: now.toISOString() }] };
}

export function activeReports(state) {
  return state.reports.filter((r) => !r.deleted);
}

export function clearReports(state, now = new Date()) {
  return { ...state, reports: state.reports.map((r) => (r.deleted ? r : { ...r, deleted: now.toISOString() })) };
}

export function formatReports(state, cardsById) {
  return activeReports(state)
    .map((r) => {
      const c = cardsById.get(r.cardId);
      const label = c ? `${c.hr} — ${c.pl}` : '(nieznana fiszka)';
      return `[${r.cardId}] ${label}: ${r.note || '(bez notatki)'}`;
    })
    .join('\n');
}

// ---------- settings ----------

export function updateSettings(state, patch, now = new Date()) {
  return { ...state, settings: { ...state.settings, ...patch, updated: now.toISOString() } };
}

// ---------- backup reminder (device-local data) ----------

export const BACKUP_INTERVAL_DAYS = 7;

/** device: { firstUseAt, lastBackupAt, lastBackupReminderAt } (ISO strings or null) */
export function backupReminderDue(device, state, now = new Date()) {
  if (Object.keys(state.cards).length === 0) return false;
  const times = [device.firstUseAt, device.lastBackupAt, device.lastBackupReminderAt].map((t) => Date.parse(t) || 0);
  const last = Math.max(...times);
  return now.getTime() - last >= BACKUP_INTERVAL_DAYS * 86400000;
}

function isPlainObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}
