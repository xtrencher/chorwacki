// Persistence: localStorage + navigator.storage.persist(). The only module touching storage.
import { createState, normalizeState } from './state.js';

const PROGRESS_KEY = 'chorwacki.progress.v1';
const DEVICE_KEY = 'chorwacki.device.v1';

export function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : createState();
  } catch (e) {
    console.error('Błąd odczytu postępu', e);
    return createState();
  }
}

export function saveProgress(state) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(state));
}

/** Device-local data that is never merged between devices. */
export function loadDevice() {
  let d = {};
  try {
    d = JSON.parse(localStorage.getItem(DEVICE_KEY) || '{}') || {};
  } catch {
    d = {};
  }
  return {
    firstUseAt: d.firstUseAt || new Date().toISOString(),
    onboardingDone: !!d.onboardingDone,
    lastBackupAt: d.lastBackupAt || null,
    lastBackupReminderAt: d.lastBackupReminderAt || null,
    celebratedDay: d.celebratedDay || null,
  };
}

export function saveDevice(device) {
  localStorage.setItem(DEVICE_KEY, JSON.stringify(device));
}

/** Ask the browser not to evict our data. Returns true/false/null (unsupported). */
export async function requestPersist() {
  if (!navigator.storage || !navigator.storage.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function isPersisted() {
  if (!navigator.storage || !navigator.storage.persisted) return null;
  try {
    return await navigator.storage.persisted();
  } catch {
    return null;
  }
}
