# Chorwacki — fiszki (PL → HR)

Aplikacja z fiszkami do nauki chorwackiego dla Polaka. Cel użytkownika: swobodnie
się dogadać (rozmowy towarzyskie, jedzenie i restauracja — także od strony kelnera,
emocje i opinie). Projekt rozwijany w wielu sesjach — ten plik jest źródłem zasad.

## Architektura

- Statyczna strona, **bez backendu i bez kroku budowania**. Pliki w repo SĄ stroną
  (GitHub Pages z gałęzi `main`, katalog główny). Wszystkie ścieżki względne (`./…`),
  bo strona działa pod `https://<user>.github.io/chorwacki/`.
- Zależności tylko jako pliki w `vendor/` (bez CDN, bez npm w runtime).
  `package.json` istnieje wyłącznie dla skryptów `npm test` / `npm run validate`
  i nie ma zależności.
- PWA: `manifest.webmanifest` + `sw.js`. Interfejs po polsku, mobile-first.
- Powtórki: **ts-fsrs** (`vendor/ts-fsrs/index.mjs`) — nie piszemy własnego algorytmu.

```
index.html              powłoka aplikacji
css/app.css             style
js/app.js               UI (widoki, zdarzenia) — jedyny moduł dotykający DOM
js/session.js           logika sesji dziennej, minimum i serii (czysta, testowana)
js/state.js             stan postępu: tworzenie, scalanie, import/eksport (czysta, testowana)
js/storage.js           localStorage + navigator.storage.persist
js/data.js              wczytanie fiszek z data/
js/speech.js            wymowa (speechSynthesis, hr-HR)
sw.js                   service worker (cache offline, aktualizacje)
data/index.json         lista plików z fiszkami
data/cards-*.json       fiszki
docs/fiszki.md          schemat fiszki + wytyczne językowe (OBOWIĄZKOWA lektura przed edycją danych)
docs/backlog.md         luki i decyzje do podjęcia w kolejnych partiach
scripts/validate.mjs    walidacja danych
tests/*.test.mjs        testy (node:test)
vendor/                 zależności (ts-fsrs)
```

## Komendy

```bash
npm test            # walidacja danych + testy logiki (node --test)
npm run validate    # tylko walidacja data/*.json
npx serve .         # lub: python3 -m http.server 8000 — podgląd lokalny
```

Node ≥ 20. Brak `npm install` — nie ma zależności.

## Reguły (obowiązują w każdej sesji)

1. **Przed każdym commitem uruchom `npm test`** (walidacja + testy). Nie commituj na czerwono.
2. **Commit po każdej skończonej części** pracy, z opisowym komunikatem.
3. **`id` fiszki jest stałe**: nigdy go nie zmieniaj ani nie używaj ponownie.
   Poprawka = edycja fiszki w miejscu (to samo `id`). Usunięcie = `"retired": true`
   (fiszka zostaje w pliku). Nowe fiszki dostają kolejne, nieużyte id.
   Postęp użytkownika jest kluczowany po `id` — zmiana id kasuje mu postęp.
4. Dane fiszek: schemat i wytyczne językowe w `docs/fiszki.md`. Standard chorwacki
   (ijekawski), poprawne č ć š ž đ, żadnych serbizmów.
5. **Każda zmiana plików aplikacji → podbij `VERSION` w `sw.js`**. Nowy plik aplikacji
   → dopisz go do listy `PRECACHE` w `sw.js` (test to sprawdza).
   Nowy plik danych → dopisz do `data/index.json` (walidator to sprawdza).
6. Bez kroku budowania i bez zależności z CDN. Nowa biblioteka = plik w `vendor/`
   + licencja obok + wpis w README.
7. Logika (sesja, scalanie, import) w czystych modułach bez DOM, z testami.
   UI tylko w `js/app.js`.
8. Format stanu postępu jest wersjonowany (`schema` w `js/state.js`). Zmiana formatu
   wymaga migracji starszych stanów i testu tej migracji — użytkownik ma postęp
   na telefonie i w plikach kopii.
9. Scalanie stanu: dla każdej fiszki wygrywa wpis z nowszą powtórką (`updated`).
   Scalanie musi być przemienne i idempotentne (testy to sprawdzają).
10. Po większej partii nowych fiszek: osobny przegląd świeżym okiem (subagent)
    według `docs/fiszki.md`, potem poprawki.
11. Interfejs i komunikaty po polsku. Kod, nazwy zmiennych i komentarze mogą być po angielsku.
12. **Publikacja:** użytkownik nie chce nic robić ręcznie na GitHubie. Po zielonym `npm test`
    wypchnij gotową pracę także na `main` (fast-forward) — GitHub Pages opublikuje ją sama.

## Założenia aplikacji

Użytkownik chce prostoty: mało tekstu, szybkie przechodzenie, nic, co rozprasza.
Odpowiedzi do użytkownika: krótko.

- Kierunek domyślny PL→HR (do zmiany w ustawieniach). Jeden stan FSRS na fiszkę.
- Fiszka: przód = samo słowo; tył = słowo HR + głośnik, na dole przykład HR + PL.
  Bez części mowy i bez notatek (`note` zostaje tylko w danych). Fiszka kwadratowa.
- Fiszka u góry; swipe działa na całym wolnym miejscu między fiszką a przyciskami.
- Stuknięcie obraca fiszkę (w kółko). Swipe w lewo = dalej („Znam”), w prawo = cofnij
  (cofa ostatnią odpowiedź). Przejście błyskawiczne (~50 ms wyjazd + ~70 ms wjazd), ale widoczne.
- Bez niebieskich akcentów i bez przewijania/„gumowania” ekranu (overscroll).
- Bez `viewport-fit=cover`: na Androidzie treść wchodziła pod pasek nawigacji (ucięte przyciski).
- Dwie oceny, szare przyciski na dole ekranu: „Ne znam” (= Again) i prawy, który najpierw
  jest „Pokaż” (odwraca fiszkę), a potem „Znam” (= Good, następna).
  Jeden krok nauki 10 min: „Znam” od razu zalicza, „Ne znam” wraca w tej samej sesji.
- Dzienne minimum: zaległe powtórki + `newPerDay` nowych (domyślnie 10). Postęp dnia
  liczony ze stanu, więc wyjście i powrót kontynuuje („2 / 10”). Po minimum:
  „Ucz się dalej (+10)” — kolejne sesje tego samego dnia. Przy dużych zaległościach bez nowych.
- Seria dni = dni z zaliczonym minimum; animacja płomienia na stronie głównej.
- Strona główna: seria u góry, „Dziś X / Y” + przycisk na dole ekranu.
- Bez przesiewu i bez zgłoszeń (usunięte na życzenie użytkownika).
- Wymowa: `speechSynthesis` z głosem hr-HR; prosta szara ikona głośnika, ukryta, gdy brak głosu.
- Postęp: localStorage + `navigator.storage.persist()`. Eksport/import pliku JSON,
  przypomnienie o kopii co 7 dni. Import scala (nie nadpisuje).
- iOS: postęp z Safari nie przechodzi do zainstalowanej apki → przy pierwszym
  uruchomieniu instrukcja instalacji przed nauką.

## Etapy

1. **(zrobione)** Zasady, aplikacja PWA, walidacja + testy, pierwsza partia 305 fiszek
   (rank wg listy frekwencyjnej + priorytety), przegląd subagentem i poprawki.
   Niewprowadzone uwagi z przeglądu: `docs/backlog.md`.
2. **(zrobione)** Uproszczenie UI po pierwszym teście; rozbudowa do 2669 fiszek (9 partii
   tematycznych + przegląd 5 recenzentów). Narzędzia partii: `scripts/batch/`.
3. Dalej: poprawki wyglądu i działania wg uwag użytkownika, poprawki treści, ewentualnie
   automatyczna synchronizacja postępu (np. prywatny gist) i eksport talii do Anki.
