// UI layer — the only module that touches the DOM.
import { loadCards, indexById } from './data.js';
import { loadProgress, saveProgress, loadDevice, saveDevice, requestPersist, isPersisted } from './storage.js';
import { initSpeech, hasVoice, speak } from './speech.js';
import { mergeStates, exportProgress, parseImport, ImportError, updateSettings, backupReminderDue } from './state.js';
import {
  createScheduler, planSession, startSession, answer, sessionProgress, GRADES, Rating, stats, dayKey,
  markGoal, addExtraSession,
} from './session.js';

const app = document.getElementById('app');
const scheduler = createScheduler();

let cards = [];
let byId = new Map();
let state = loadProgress();
let device = loadDevice();
let view = 'home';
let pendingReload = false;
let installEvent = null;
let swVersion = '';
let keyHandler = null;

// ---------- helpers ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function setState(next) {
  state = next;
  saveProgress(state);
}

function setDevice(patch) {
  device = { ...device, ...patch };
  saveDevice(device);
}

function toast(msg, ms = 2600) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, ms);
}

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = () => /Android/i.test(navigator.userAgent);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function plural(n, one, few, many) {
  if (n === 1) return one;
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
}

const ICON_SPEAKER = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const ICON_GEAR = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
const ICON_FLAME = '<svg viewBox="0 0 24 24" width="56" height="56" aria-hidden="true"><path fill="currentColor" d="M12 2c.6 3.2-1 5.3-2.6 7.2C7.9 11 6.5 12.7 6.5 15.3 6.5 18.9 9 22 12 22s5.5-3 5.5-6.6c0-2.6-1.3-4.6-2.6-6.1-.2 1.5-.9 2.6-2 3.1.4-3.6-.1-7.6-.9-10.4z"/></svg>';

function sayButton(text, label, cls = '') {
  if (!hasVoice()) return '';
  return `<button class="say ${cls}" data-say="${esc(text)}" aria-label="${esc(label)}">${ICON_SPEAKER}</button>`;
}

function go(v, ...args) {
  view = v;
  if (v === 'home' && pendingReload) {
    location.reload();
    return;
  }
  window.scrollTo(0, 0);
  app.className = v === 'review' ? 'review-mode' : '';
  VIEWS[v](...args);
}

const VIEWS = { home, onboarding, review, settings };

// ---------- home ----------

function home() {
  const now = new Date();
  const today = dayKey(now);
  const st = stats(cards, state, now);
  const plan = planSession(cards, state, now);
  const showBackup = backupReminderDue(device, state, now);
  const celebrate = st.goalMet && device.celebratedDay !== today && !reducedMotion();

  let sessionPanel;
  if (plan.queue.length) {
    const pct = Math.round((plan.done / Math.max(1, plan.total)) * 100);
    sessionPanel = `
      <div class="today-row"><span>Dziś</span><b>${plan.done} / ${plan.total}</b></div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      ${plan.backlog ? `<p class="muted small">Dużo zaległych powtórek (${plan.dueTotal}) — dziś bez nowych fiszek.</p>` : ''}
      <button class="btn primary block" id="start">${plan.done ? 'Kontynuuj' : 'Zacznij naukę'}</button>`;
  } else if (st.newLeft > 0) {
    sessionPanel = `
      <div class="today-row"><span>Dzisiejsze minimum</span><b>✓</b></div>
      <button class="btn primary block" id="more">Ucz się dalej (+${state.settings.newPerDay || 10})</button>`;
  } else {
    sessionPanel = `<div class="today-row"><span>Wszystkie fiszki poznane</span><b>✓</b></div>
      <p class="muted small">Wróć jutro na powtórki.</p>`;
  }

  app.innerHTML = `
    <div class="topbar">
      <h1>Chorwacki</h1>
      <button class="icon-btn" data-go="settings" aria-label="Ustawienia">${ICON_GEAR}</button>
    </div>
    ${showBackup ? `
      <div class="panel">
        <p><b>Zrób kopię postępu</b> — minął tydzień od ostatniej.</p>
        <div class="row">
          <button class="btn" id="backup-now">Zapisz kopię</button>
          <button class="btn ghost" id="backup-later">Później</button>
        </div>
      </div>` : ''}
    <div class="streak ${st.goalMet ? 'lit' : ''} ${celebrate ? 'pop' : ''}">
      <div class="flame">${ICON_FLAME}</div>
      <div class="streak-num" id="streak-num">${celebrate ? Math.max(0, st.streak - 1) : st.streak}</div>
      <div class="streak-label">${plural(st.streak, 'dzień', 'dni', 'dni')} z rzędu</div>
      ${st.goalMet ? '' : '<div class="muted small">Zrób dzisiejsze minimum, żeby utrzymać serię</div>'}
    </div>
    <div class="mini-stats muted small">
      <span>Poznane: <b>${st.known}</b> / ${st.total}</span>
      <span>Do powtórki dziś: <b>${st.dueToday}</b></span>
    </div>
    <div class="spacer"></div>
    <div class="panel session-panel">${sessionPanel}</div>
  `;
  bindGo();
  const start = document.getElementById('start');
  if (start) start.onclick = () => startReview();
  const more = document.getElementById('more');
  if (more) more.onclick = () => { setState(addExtraSession(state, new Date())); startReview(); };
  const bn = document.getElementById('backup-now');
  if (bn) bn.onclick = () => exportBackup().then(() => go('home'));
  const bl = document.getElementById('backup-later');
  if (bl) bl.onclick = () => { setDevice({ lastBackupReminderAt: new Date().toISOString() }); go('home'); };
  keyHandler = (e) => { if (e.key === 'Enter' && (start || more)) (start || more).click(); };

  if (celebrate) {
    setDevice({ celebratedDay: today });
    setTimeout(() => {
      const n = document.getElementById('streak-num');
      if (n) n.textContent = String(st.streak);
    }, 350);
  }
}

// ---------- onboarding ----------

function installInstructions() {
  if (isIOS()) {
    return `
      <p>Na iPhonie postęp z Safari <b>nie przenosi się</b> do zainstalowanej aplikacji — zainstaluj ją, zanim zaczniesz.</p>
      <ol class="steps">
        <li>Otwórz tę stronę w <b>Safari</b>.</li>
        <li>Stuknij <b>Udostępnij</b> (w nowszym iOS najpierw <b>•••</b>).</li>
        <li>Wybierz <b>„Do ekranu początkowego”</b> i <b>„Dodaj”</b>.</li>
        <li>Otwieraj <b>Chorwacki</b> z ikony.</li>
      </ol>`;
  }
  if (isAndroid()) {
    return `
      ${installEvent ? `<button class="btn primary block" id="install-btn">Zainstaluj aplikację</button>` : ''}
      <ol class="steps">
        <li>W Chrome stuknij <b>⋮</b> (prawy górny róg).</li>
        <li>Wybierz <b>„Zainstaluj aplikację”</b>.</li>
        <li>Otwieraj <b>Chorwacki</b> z ikony.</li>
      </ol>`;
  }
  return `
    <p>Na telefonie otwórz ten adres i dodaj aplikację do ekranu głównego.</p>
    ${installEvent ? `<button class="btn primary block" id="install-btn">Zainstaluj na tym komputerze</button>` : ''}`;
}

function bindInstallButton() {
  const b = document.getElementById('install-btn');
  if (!b) return;
  b.onclick = async () => {
    installEvent.prompt();
    const choice = await installEvent.userChoice.catch(() => null);
    installEvent = null;
    if (choice && choice.outcome === 'accepted') toast('Zainstalowano. Otwórz aplikację z ekranu głównego.', 5000);
  };
}

function onboarding() {
  app.innerHTML = `
    <div class="topbar"><h1>Witaj!</h1></div>
    <div class="panel">
      <h2>Zainstaluj aplikację</h2>
      ${installInstructions()}
    </div>
    <div class="spacer"></div>
    <button class="btn ghost block" id="skip">Na razie w przeglądarce</button>
  `;
  bindInstallButton();
  document.getElementById('skip').onclick = () => { setDevice({ onboardingDone: true }); go('home'); };
}

// ---------- review ----------

const ANIM_OUT_MS = 50;
const ANIM_IN_MS = 70;
let session = null;
let history = []; // [{ session, state }] for "back"

function startReview() {
  session = startSession(planSession(cards, state, new Date()));
  history = [];
  go('review');
}

function cardHTML(c) {
  const dir = state.settings.direction;
  const front = dir === 'hr-pl'
    ? `<div class="word">${esc(c.hr)}</div>${sayButton(c.hr, 'Wymowa', 'say-word')}`
    : `<div class="word">${esc(c.pl)}</div>`;
  const backWord = dir === 'hr-pl' ? c.pl : c.hr;
  return `
    <div class="flash" id="flash">
      <div class="flash-inner">
        <div class="face front">${front}</div>
        <div class="face back">
          <div class="back-main">
            <div class="word hr">${esc(backWord)}</div>
            ${dir === 'pl-hr' ? sayButton(c.hr, 'Wymowa', 'say-word') : ''}
          </div>
          <div class="example">
            <div class="ex-hr">${esc(c.example_hr)}${sayButton(c.example_hr, 'Wymowa przykładu', 'say-small')}</div>
            <div class="ex-pl">${esc(c.example_pl)}</div>
          </div>
        </div>
      </div>
    </div>`;
}

function review(enterFrom = null) {
  const id = session && session.queue[0];
  if (!id) return finishReview();
  const c = byId.get(id);
  if (!c) { // card vanished from data (should not happen: retired cards stay in files)
    session = { ...session, queue: session.queue.slice(1) };
    return review(enterFrom);
  }
  const p = sessionProgress(session);
  const pct = Math.round((p.done / Math.max(1, p.total)) * 100);
  app.innerHTML = `
    <div class="topbar">
      <button class="icon-btn" data-go="home" aria-label="Zakończ">✕</button>
      <span class="title">${p.done} / ${p.total}</span>
      <span class="icon-btn" aria-hidden="true"></span>
    </div>
    <div class="progress"><div style="width:${pct}%"></div></div>
    <div class="swipe-area" id="swipe-area"><div class="stage">${cardHTML(c)}</div></div>
    <div class="answers">
      <button class="btn answer" id="no">${GRADES[0].label}</button>
      <button class="btn answer" id="yes">Pokaż</button>
    </div>
  `;
  bindGo();
  bindSay();
  const flash = document.getElementById('flash');
  if (enterFrom && !reducedMotion()) {
    flash.animate(
      [{ transform: `translateX(${enterFrom === 'right' ? 40 : -40}%)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }],
      { duration: ANIM_IN_MS, easing: 'ease-out' },
    );
  }
  // Right button: first "Pokaż" (flips the card), then "Znam" (next card).
  const yes = document.getElementById('yes');
  let revealed = false;
  const flip = () => {
    flash.classList.toggle('flipped');
    if (!revealed) { revealed = true; yes.textContent = GRADES[1].label; }
  };
  const right = () => (revealed ? rate(Rating.Good, flash) : flip());
  attachSwipe(document.getElementById('swipe-area'), flash, {
    onTap: flip,
    onNext: () => rate(Rating.Good, flash),
    onBack: () => back(flash),
  });
  document.getElementById('no').onclick = () => rate(Rating.Again, flash);
  yes.onclick = right;
  keyHandler = (e) => {
    if (e.key === ' ') { e.preventDefault(); flip(); }
    if (e.key === 'Enter' || e.key === '2') { e.preventDefault(); right(); }
    if (e.key === '1') rate(Rating.Again, flash);
    if (e.key === 'Backspace') back(flash);
  };
}

let animating = false;

function animateOut(el, to, done) {
  if (reducedMotion()) return done();
  animating = true;
  const current = getComputedStyle(el).transform;
  const a = el.animate(
    [{ transform: current === 'none' ? 'translateX(0)' : current, opacity: 1 }, { transform: `translateX(${to === 'left' ? -120 : 120}%)`, opacity: 0 }],
    { duration: ANIM_OUT_MS, easing: 'ease-in', fill: 'forwards' },
  );
  a.onfinish = () => { animating = false; done(); };
}

function rate(rating, el) {
  if (animating || !session.queue.length) return;
  history.push({ session, state });
  if (history.length > 50) history.shift();
  const now = new Date();
  const res = answer(session, scheduler, state, rating, now);
  session = res.session;
  setState(markGoal(cards, res.state, now));
  persistOnce();
  animateOut(el, 'left', () => review('right'));
}

function back(el) {
  if (animating) return;
  const prev = history.pop();
  if (!prev) {
    el.animate([{ transform: 'translateX(12px)' }, { transform: 'translateX(0)' }], { duration: ANIM_IN_MS });
    return;
  }
  session = prev.session;
  setState(prev.state);
  animateOut(el, 'right', () => review('left'));
}

function finishReview() {
  session = null;
  history = [];
  go('home');
}

/**
 * Swipe anywhere in `area` moves the card `el`: left = next ("Znam"), right = back.
 * A tap on the card flips it.
 */
function attachSwipe(area, el, { onTap, onNext, onBack }) {
  let x0 = null;
  let y0 = 0;
  let dx = 0;
  let id = null;
  let onCard = false;
  const THRESHOLD = 50;
  area.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-say]') || animating) return;
    x0 = e.clientX;
    y0 = e.clientY;
    dx = 0;
    id = e.pointerId;
    onCard = !!e.target.closest('#flash');
    area.setPointerCapture(id);
  });
  area.addEventListener('pointermove', (e) => {
    if (x0 === null || e.pointerId !== id) return;
    dx = e.clientX - x0;
    if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(e.clientY - y0)) el.style.transform = `translateX(${dx}px)`;
  });
  const end = (e) => {
    if (x0 === null || e.pointerId !== id) return;
    x0 = null;
    if (Math.abs(dx) < 8) { el.style.transform = ''; if (onCard) onTap(); return; }
    if (dx <= -THRESHOLD) return onNext();
    if (dx >= THRESHOLD) return onBack();
    el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }], { duration: ANIM_IN_MS });
    el.style.transform = '';
  };
  area.addEventListener('pointerup', end);
  area.addEventListener('pointercancel', () => { x0 = null; el.style.transform = ''; });
}

// ---------- settings ----------

async function settings() {
  const persisted = await isPersisted();
  app.innerHTML = `
    <div class="topbar">
      <button class="btn ghost" data-go="home" aria-label="Wróć">← Wróć</button>
      <span class="title">Ustawienia</span><span></span>
    </div>
    <div class="settings">
      <section class="panel">
        <div class="field">
          <label for="newPerDay">Nowe fiszki na sesję (dzienne minimum)</label>
          <input type="number" id="newPerDay" min="1" max="50" inputmode="numeric" value="${state.settings.newPerDay}">
        </div>
        <div class="field">
          <label for="direction">Kierunek</label>
          <select id="direction">
            <option value="pl-hr" ${state.settings.direction === 'pl-hr' ? 'selected' : ''}>polski → chorwacki</option>
            <option value="hr-pl" ${state.settings.direction === 'hr-pl' ? 'selected' : ''}>chorwacki → polski</option>
          </select>
        </div>
      </section>
      <section class="panel">
        <h2>Kopia postępu</h2>
        <p class="muted small">Ostatnia kopia: ${device.lastBackupAt ? new Date(device.lastBackupAt).toLocaleDateString('pl-PL') : 'nigdy'}.
        Wczytanie pliku <b>łączy</b> postęp z obecnym, więc można przenosić go między urządzeniami.</p>
        <div class="row">
          <button class="btn" id="export">Zapisz do pliku</button>
          <button class="btn" id="import">Wczytaj z pliku</button>
        </div>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </section>
      <section class="panel">
        <h2>Urządzenie</h2>
        <p class="small">Trwałe przechowywanie: <b>${persisted === null ? 'nieobsługiwane' : persisted ? 'włączone' : 'niewłączone'}</b></p>
        ${persisted === false ? '<button class="btn block" id="persist">Poproś o trwałe przechowywanie</button>' : ''}
        <p class="small" style="margin-top:10px">Wymowa (głos chorwacki): <b>${hasVoice() ? 'dostępna' : 'brak głosu hr-HR'}</b></p>
        <p class="small">Tryb: <b>${isStandalone() ? 'zainstalowana aplikacja' : 'przeglądarka'}</b></p>
        ${isStandalone() ? '' : `<details><summary>Jak zainstalować?</summary>${installInstructions()}</details>`}
      </section>
      <section class="panel">
        <p class="muted small">Wersja: ${esc(swVersion || '—')} · ${cards.filter((c) => !c.retired).length} fiszek.<br>
        Powtórki: <a href="https://github.com/open-spaced-repetition/ts-fsrs">ts-fsrs</a> (MIT).
        Kolejność słów na podstawie <a href="https://github.com/hermitdave/FrequencyWords">FrequencyWords</a> (CC BY-SA 4.0).</p>
      </section>
    </div>
  `;
  bindGo();
  bindInstallButton();
  const npd = document.getElementById('newPerDay');
  npd.onchange = () => {
    const v = Math.max(1, Math.min(50, Math.round(Number(npd.value) || 10)));
    npd.value = v;
    setState(updateSettings(state, { newPerDay: v }));
    toast('Zapisano');
  };
  document.getElementById('direction').onchange = (e) => {
    setState(updateSettings(state, { direction: e.target.value }));
    toast('Zapisano');
  };
  document.getElementById('export').onclick = () => exportBackup().then(() => settings());
  const fileInput = document.getElementById('import-file');
  document.getElementById('import').onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const f = fileInput.files[0];
    if (!f) return;
    try {
      const incoming = parseImport(await f.text());
      const before = Object.keys(state.cards).length;
      setState(mergeStates(state, incoming));
      toast(`Wczytano. Fiszek z postępem: ${before} → ${Object.keys(state.cards).length}`, 4000);
      settings();
    } catch (e) {
      toast(e instanceof ImportError ? e.message : 'Nie udało się wczytać pliku.', 5000);
    }
  };
  const p = document.getElementById('persist');
  if (p) p.onclick = async () => { const ok = await requestPersist(); toast(ok ? 'Włączono trwałe przechowywanie' : 'Przeglądarka odmówiła — spróbuj po instalacji'); settings(); };
}

// ---------- actions ----------

async function exportBackup() {
  const json = exportProgress(state, new Date());
  const name = `chorwacki-postep-${dayKey(new Date())}.json`;
  const file = new File([json], name, { type: 'application/json' });
  const mobile = isIOS() || isAndroid();
  try {
    if (mobile && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Kopia postępu — Chorwacki' });
    } else {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
    setDevice({ lastBackupAt: new Date().toISOString() });
    toast('Kopia zapisana');
  } catch (e) {
    if (e && e.name === 'AbortError') toast('Anulowano — kopia niezapisana');
    else toast('Nie udało się zapisać kopii');
  }
}

let persistAsked = false;
function persistOnce() {
  if (persistAsked) return;
  persistAsked = true;
  requestPersist();
}

// ---------- events ----------

document.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, textarea, select')) return;
  if (keyHandler) keyHandler(e);
});

function bindGo() {
  keyHandler = null;
  app.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => go(b.dataset.go); });
}

function bindSay() {
  app.querySelectorAll('[data-say]').forEach((b) => {
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.onclick = (e) => { e.stopPropagation(); speak(b.dataset.say); };
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  if (view === 'onboarding') onboarding();
});

// Another tab changed the progress — reload it.
window.addEventListener('storage', (e) => {
  if (e.key && e.key.startsWith('chorwacki.progress')) {
    state = loadProgress();
    if (view === 'home') home();
  }
});

// Re-render home when coming back to the app (e.g. on another day).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && view === 'home') home();
});

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // first install, nothing to refresh
    if (view === 'review') pendingReload = true; // reload after the session
    else location.reload();
  });
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'version') swVersion = e.data.version;
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
    if (navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'version' });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch((e) => console.warn('SW nie zarejestrowany', e));
}

// ---------- boot ----------

async function boot() {
  registerServiceWorker();
  if (!localStorage.getItem('chorwacki.device.v1')) saveDevice(device);
  if (isStandalone() && !device.onboardingDone) setDevice({ onboardingDone: true });
  try {
    cards = await loadCards();
    byId = indexById(cards);
  } catch (e) {
    app.innerHTML = `<div class="panel"><h2>Nie udało się wczytać fiszek</h2><p>${esc(e.message)}</p><p>Sprawdź połączenie i odśwież.</p></div>`;
    return;
  }
  await initSpeech();
  if (isStandalone()) requestPersist();
  go(device.onboardingDone ? 'home' : 'onboarding');
}

boot();

// for debugging in the console
window.chorwacki = { get state() { return state; }, get cards() { return cards; }, Rating };
