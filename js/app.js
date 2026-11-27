// UI layer — the only module that touches the DOM.
import { loadCards, indexById } from './data.js';
import { loadProgress, saveProgress, loadDevice, saveDevice, requestPersist, isPersisted } from './storage.js';
import { initSpeech, hasVoice, speak } from './speech.js';
import {
  mergeStates, exportProgress, parseImport, ImportError, addReport, activeReports, clearReports,
  formatReports, updateSettings, backupReminderDue,
} from './state.js';
import {
  createScheduler, planSession, startSession, answer, previewIntervals, GRADES, Rating,
  sieveCandidates, sieveCard, stats, dayKey,
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

const POS = { noun: 'rzeczownik', verb: 'czasownik', adj: 'przymiotnik', adv: 'przysłówek', pron: 'zaimek', prep: 'przyimek', conj: 'spójnik', part: 'partykuła', interj: 'wykrzyknik', num: 'liczebnik', phrase: 'zwrot' };

function plural(n, one, few, many) {
  if (n === 1) return one;
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
}

function sayButton(text, label) {
  return `<button class="say" data-say="${esc(text)}" aria-label="${esc(label)}" ${hasVoice() ? '' : 'hidden'}>🔊</button>`;
}

function go(v, ...args) {
  view = v;
  if (v === 'home' && pendingReload) {
    location.reload();
    return;
  }
  window.scrollTo(0, 0);
  VIEWS[v](...args);
}

// ---------- views ----------

const VIEWS = { home, onboarding, review, sieve, done, settings };

function home() {
  const st = stats(cards, state, new Date());
  const plan = planSession(cards, state, new Date());
  const showBackup = backupReminderDue(device, state, new Date());
  const nothing = plan.queue.length === 0;
  app.innerHTML = `
    <div class="topbar">
      <h1>Chorwacki</h1>
      <button class="btn ghost icon" data-go="settings" aria-label="Ustawienia">⚙️</button>
    </div>
    ${showBackup ? `
      <div class="panel warn">
        <h2>Zrób kopię postępu</h2>
        <p>Minął tydzień od ostatniej kopii. Zapisz plik — w razie utraty telefonu odzyskasz postęp.</p>
        <div class="row">
          <button class="btn primary" id="backup-now">Zapisz kopię</button>
          <button class="btn" id="backup-later">Później</button>
        </div>
      </div>` : ''}
    <div class="stats">
      <div class="panel stat"><b>${st.known}</b><span>poznane<br>z ${st.total}</span></div>
      <div class="panel stat"><b>${st.dueToday}</b><span>do powtórki<br>dziś</span></div>
      <div class="panel stat"><b>${st.streak}</b><span>seria<br>${plural(st.streak, 'dzień', 'dni', 'dni')}</span></div>
    </div>
    <div class="panel">
      ${nothing
        ? `<h2>Na dziś wszystko 🎉</h2><p class="muted">Wróć jutro. Jeśli chcesz więcej, zrób przesiew albo zwiększ limit nowych fiszek w ustawieniach.</p>`
        : `<h2>Dzisiejsza sesja</h2>
           <p>${plan.reviews.length} ${plural(plan.reviews.length, 'powtórka', 'powtórki', 'powtórek')} · ${plan.news.length} ${plural(plan.news.length, 'nowa', 'nowe', 'nowych')}</p>
           ${plan.backlog ? `<p class="muted small">Dużo zaległości (${plan.dueTotal}) — dziś bez nowych fiszek, najpierw nadrób powtórki.</p>` : ''}
           <button class="btn primary block" id="start">Zacznij naukę</button>`}
    </div>
    <div class="panel">
      <h2>Przesiew</h2>
      <p class="muted">Szybko przejrzyj nowe fiszki i odhacz te, które już znasz — dostaną długi odstęp i nie zajmą dziennego limitu.</p>
      <button class="btn block" id="sieve" ${st.newLeft === 0 ? 'disabled' : ''}>Przesiej nowe fiszki (${sieveCandidates(cards, state).length})</button>
    </div>
  `;
  bindGo();
  const start = document.getElementById('start');
  if (start) start.onclick = () => go('review', startSession(plan));
  document.getElementById('sieve').onclick = () => go('sieve', { known: 0, unknown: 0 });
  const bn = document.getElementById('backup-now');
  if (bn) bn.onclick = () => exportBackup().then(() => go('home'));
  const bl = document.getElementById('backup-later');
  if (bl) bl.onclick = () => { setDevice({ lastBackupReminderAt: new Date().toISOString() }); go('home'); };
}

function installInstructions() {
  if (isIOS()) {
    return `
      <p><b>iPhone / iPad:</b> na iOS postęp nauki z Safari <b>nie przenosi się</b> do zainstalowanej aplikacji — dlatego zainstaluj ją, zanim zaczniesz.</p>
      <ol class="steps">
        <li>Otwórz tę stronę w <b>Safari</b>.</li>
        <li>Stuknij <b>Udostępnij</b> <span class="key">⬆︎</span> (na dole ekranu; w nowszym iOS najpierw <span class="key">•••</span>).</li>
        <li>Przewiń listę i wybierz <b>„Do ekranu początkowego”</b>.</li>
        <li>Stuknij <b>„Dodaj”</b>, zamknij Safari i otwórz <b>Chorwacki</b> z ikony na ekranie.</li>
      </ol>`;
  }
  if (isAndroid()) {
    return `
      <p><b>Android:</b> zainstaluj aplikację — będzie działać offline jak zwykła apka.</p>
      ${installEvent ? `<button class="btn primary block" id="install-btn">Zainstaluj aplikację</button>` : ''}
      <ol class="steps">
        <li>W Chrome stuknij menu <span class="key">⋮</span> (prawy górny róg).</li>
        <li>Wybierz <b>„Zainstaluj aplikację”</b> lub <b>„Dodaj do ekranu głównego”</b>.</li>
        <li>Otwórz <b>Chorwacki</b> z ikony na ekranie.</li>
      </ol>`;
  }
  return `
    <p>Na telefonie otwórz ten adres i dodaj aplikację do ekranu głównego (iPhone: Safari → Udostępnij → „Do ekranu początkowego”; Android: Chrome → ⋮ → „Zainstaluj aplikację”).</p>
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
      <h2>Najpierw zainstaluj aplikację</h2>
      ${installInstructions()}
    </div>
    <div class="panel">
      <p class="muted small">Postęp zapisuje się tylko na tym urządzeniu. W ustawieniach możesz zapisać kopię do pliku i wczytać ją na innym urządzeniu.</p>
      <button class="btn block" id="skip">${isIOS() ? 'Rozumiem, ucz się w przeglądarce' : 'Kontynuuj w przeglądarce'}</button>
    </div>
  `;
  bindInstallButton();
  document.getElementById('skip').onclick = () => { setDevice({ onboardingDone: true }); go('home'); };
}

function cardFace(c) {
  const dir = state.settings.direction;
  const front = dir === 'hr-pl' ? c.hr : c.pl;
  const badge = c.type === 'phrase' ? 'zwrot' : POS[c.pos] || '';
  return {
    front: `<div class="badge">${esc(badge)}</div>
            <div class="front">${esc(front)}${dir === 'hr-pl' ? sayButton(c.hr, 'Odtwórz wymowę') : ''}</div>`,
    back: `<hr>
           <div class="answer">${esc(dir === 'hr-pl' ? c.pl : c.hr)}${dir === 'pl-hr' ? sayButton(c.hr, 'Odtwórz wymowę') : ''}</div>
           <div class="example">
             <div>${esc(c.example_hr)}${sayButton(c.example_hr, 'Odtwórz przykład')}</div>
             <div class="pl">${esc(c.example_pl)}</div>
           </div>
           ${c.note ? `<div class="note ${c.pl_similarity === 'false_friend' ? 'ff' : ''}">${esc(c.note)}</div>` : ''}`,
  };
}

function review(session, revealed = false) {
  const id = session.queue[0];
  if (!id) return go('done', session);
  const c = byId.get(id);
  if (!c) { // card vanished from data (should not happen: retired cards stay in files)
    return review({ ...session, queue: session.queue.slice(1) });
  }
  const remaining = new Set(session.queue).size;
  const pct = Math.round((session.done / Math.max(1, session.done + remaining)) * 100);
  const face = cardFace(c);
  const intervals = revealed ? previewIntervals(scheduler, state.cards[id], new Date()) : null;
  app.innerHTML = `
    <div class="topbar">
      <button class="btn ghost" data-go="home" aria-label="Zakończ">✕</button>
      <span class="title">${session.done} / ${session.done + remaining}</span>
      <button class="btn ghost" id="report">Zgłoś</button>
    </div>
    <div class="progress"><div style="width:${pct}%"></div></div>
    <div class="panel card" id="card">
      ${face.front}
      ${revealed ? face.back : ''}
    </div>
    ${revealed
      ? `<div class="grades">${GRADES.map((g) => `<button class="btn grade g${g.key}" data-rate="${g.rating}">${g.label}<small>${intervals[g.rating]}</small></button>`).join('')}</div>`
      : `<div class="bottom"><button class="btn primary block" id="reveal">Pokaż odpowiedź</button></div>`}
  `;
  bindGo();
  bindSay();
  document.getElementById('report').onclick = () => openReport(c);
  if (!revealed) {
    const r = () => review(session, true);
    document.getElementById('reveal').onclick = r;
    document.getElementById('card').onclick = (e) => { if (!e.target.closest('[data-say]')) r(); };
    keyHandler = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); r(); } };
  } else {
    const rate = (rating) => {
      const res = answer(session, scheduler, state, rating, new Date());
      setState(res.state);
      persistOnce();
      review(res.session);
    };
    app.querySelectorAll('[data-rate]').forEach((b) => { b.onclick = () => rate(Number(b.dataset.rate)); });
    keyHandler = (e) => {
      const g = GRADES.find((x) => x.key === e.key);
      if (g) rate(g.rating);
    };
  }
}

function sieve(counts, revealed = false) {
  const id = sieveCandidates(cards, state)[0];
  if (!id) {
    app.innerHTML = `
      <div class="topbar"><button class="btn ghost" data-go="home">✕</button><span class="title">Przesiew</span><span></span></div>
      <div class="panel center"><div class="big-emoji">✅</div><h2>Przesiane wszystko</h2>
      <p>Znane: ${counts.known} · do nauki: ${counts.unknown}</p></div>
      <button class="btn primary block" data-go="home">Wróć</button>`;
    bindGo();
    return;
  }
  const c = byId.get(id);
  const face = cardFace(c);
  app.innerHTML = `
    <div class="topbar">
      <button class="btn ghost" data-go="home" aria-label="Zakończ">✕</button>
      <span class="title" aria-label="Znane ${counts.known}, do nauki ${counts.unknown}">Przesiew · ✓ ${counts.known} · ✗ ${counts.unknown}</span>
      <button class="btn ghost" id="report">Zgłoś</button>
    </div>
    <div class="panel card" id="card">
      ${face.front}
      ${revealed ? face.back : '<p class="muted small">Czy znasz to słowo? Stuknij, żeby sprawdzić.</p>'}
    </div>
    ${revealed
      ? `<div class="sieve-buttons">
           <button class="btn no" id="no">Nie wiedziałem</button>
           <button class="btn yes" id="yes">Wiedziałem</button>
         </div>`
      : `<div class="bottom"><button class="btn primary block" id="reveal">Pokaż</button></div>`}
  `;
  bindGo();
  bindSay();
  document.getElementById('report').onclick = () => openReport(c);
  if (!revealed) {
    const r = () => sieve(counts, true);
    document.getElementById('reveal').onclick = r;
    document.getElementById('card').onclick = (e) => { if (!e.target.closest('[data-say]')) r(); };
    keyHandler = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); r(); } };
  } else {
    const decide = (known) => {
      setState(sieveCard(scheduler, state, id, known, new Date()));
      persistOnce();
      sieve({ known: counts.known + (known ? 1 : 0), unknown: counts.unknown + (known ? 0 : 1) });
    };
    document.getElementById('yes').onclick = () => decide(true);
    document.getElementById('no').onclick = () => decide(false);
    keyHandler = (e) => {
      if (e.key === '1' || e.key === 'ArrowLeft') decide(false);
      if (e.key === '2' || e.key === 'ArrowRight') decide(true);
    };
  }
}

function done(session) {
  const st = stats(cards, state, new Date());
  app.innerHTML = `
    <div class="topbar"><span></span><span class="title">Koniec sesji</span><span></span></div>
    <div class="panel center">
      <div class="big-emoji">🎉</div>
      <h2>Dobra robota!</h2>
      <p>Przerobione fiszki: ${session.done}${session.again ? ` · powtórzone od nowa: ${session.again}` : ''}</p>
      <p>Seria: ${st.streak} ${plural(st.streak, 'dzień', 'dni', 'dni')}</p>
    </div>
    <button class="btn primary block" data-go="home">Wróć</button>
  `;
  bindGo();
}

async function settings() {
  const reports = activeReports(state);
  const persisted = await isPersisted();
  app.innerHTML = `
    <div class="topbar">
      <button class="btn ghost" data-go="home" aria-label="Wróć">← Wróć</button>
      <span class="title">Ustawienia</span><span></span>
    </div>
    <div class="settings">
      <section class="panel">
        <div class="field">
          <label for="newPerDay">Nowe fiszki dziennie</label>
          <input type="number" id="newPerDay" min="0" max="50" inputmode="numeric" value="${state.settings.newPerDay}">
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
        Import <b>scala</b> postęp z pliku z obecnym (dla każdej fiszki wygrywa nowsza powtórka), więc można przenosić postęp między urządzeniami.</p>
        <div class="row">
          <button class="btn primary" id="export">Zapisz do pliku</button>
          <button class="btn" id="import">Wczytaj z pliku</button>
        </div>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </section>
      <section class="panel">
        <h2>Zgłoszenia fiszek (${reports.length})</h2>
        ${reports.length
          ? `<textarea id="reports-text" rows="6" readonly>${esc(formatReports(state, byId))}</textarea>
             <div class="row" style="margin-top:10px">
               <button class="btn primary" id="copy-reports">Kopiuj</button>
               <button class="btn" id="clear-reports">Wyczyść</button>
             </div>`
          : '<p class="muted small">Brak zgłoszeń. Podczas nauki użyj przycisku „Zgłoś”, gdy fiszka jest błędna.</p>'}
      </section>
      <section class="panel">
        <h2>Urządzenie</h2>
        <p class="small">Trwałe przechowywanie: <b>${persisted === null ? 'nieobsługiwane' : persisted ? 'włączone' : 'niewłączone'}</b>
        ${persisted === false ? '<br><span class="muted">Przeglądarka może je przyznać dopiero po instalacji aplikacji lub dłuższym używaniu.</span>' : ''}</p>
        ${persisted === false ? '<button class="btn block" id="persist">Poproś o trwałe przechowywanie</button>' : ''}
        <p class="small" style="margin-top:10px">Wymowa (głos chorwacki): <b>${hasVoice() ? 'dostępna' : 'brak głosu hr-HR na tym urządzeniu'}</b></p>
        <p class="small">Tryb: <b>${isStandalone() ? 'zainstalowana aplikacja' : 'przeglądarka'}</b></p>
        ${isStandalone() ? '' : `<details><summary>Jak zainstalować?</summary>${installInstructions()}</details>`}
      </section>
      <section class="panel">
        <p class="muted small">Wersja: ${esc(swVersion || '—')} · ${cards.filter((c) => !c.retired).length} fiszek.<br>
        Powtórki: <a href="https://github.com/open-spaced-repetition/ts-fsrs">ts-fsrs</a> (MIT).
        Kolejność słów na podstawie list frekwencyjnych <a href="https://github.com/hermitdave/FrequencyWords">FrequencyWords</a> (CC BY-SA 4.0).</p>
      </section>
    </div>
  `;
  bindGo();
  bindInstallButton();
  const npd = document.getElementById('newPerDay');
  npd.onchange = () => {
    const v = Math.max(0, Math.min(50, Math.round(Number(npd.value) || 0)));
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
  const copy = document.getElementById('copy-reports');
  if (copy) {
    copy.onclick = async () => {
      const text = document.getElementById('reports-text').value;
      try {
        await navigator.clipboard.writeText(text);
        toast('Skopiowano');
      } catch {
        const ta = document.getElementById('reports-text');
        ta.select();
        document.execCommand('copy');
        toast('Skopiowano');
      }
    };
    document.getElementById('clear-reports').onclick = () => {
      if (!confirm('Usunąć wszystkie zgłoszenia? Zrób to dopiero, gdy je przekażesz.')) return;
      setState(clearReports(state));
      settings();
    };
  }
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

function openReport(card) {
  const dlg = document.getElementById('report-dialog');
  document.getElementById('report-card').textContent = `${card.hr} — ${card.pl}`;
  const note = document.getElementById('report-note');
  note.value = '';
  const prevKeys = keyHandler;
  keyHandler = null;
  dlg.onclose = () => {
    keyHandler = prevKeys;
    if (dlg.returnValue === 'ok') {
      setState(addReport(state, card.id, note.value, new Date()));
      toast('Zgłoszenie zapisane (Ustawienia → Zgłoszenia)');
    }
  };
  dlg.returnValue = '';
  dlg.showModal();
  note.focus();
}

let persistAsked = false;
function persistOnce() {
  if (persistAsked) return;
  persistAsked = true;
  requestPersist();
}

// ---------- events ----------

let keyHandler = null;
document.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, textarea, select, dialog')) return;
  if (keyHandler) keyHandler(e);
});

function bindGo() {
  keyHandler = null;
  app.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => go(b.dataset.go); });
}

function bindSay() {
  app.querySelectorAll('[data-say]').forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); speak(b.dataset.say); };
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  if (view === 'onboarding') onboarding();
});

// The storage of another tab/window changed (e.g. two tabs open) — reload state.
window.addEventListener('storage', (e) => {
  if (e.key && e.key.startsWith('chorwacki.progress')) {
    state = loadProgress();
    if (view === 'home') home();
  }
});

// Re-render home when coming back to the app on another day.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && view === 'home') home();
});

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // first install, nothing to refresh
    if (view === 'home' || view === 'onboarding' || view === 'settings') location.reload();
    else pendingReload = true; // reload after the current session
  });
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'version') swVersion = e.data.version;
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
    const askVersion = () => navigator.serviceWorker.controller && navigator.serviceWorker.controller.postMessage({ type: 'version' });
    askVersion();
    // check for a new version whenever the app is opened again
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
