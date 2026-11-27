# Chorwacki — fiszki

Fiszki do nauki chorwackiego dla Polaka. Cel: swobodnie się dogadać — rozmowy towarzyskie,
jedzenie i restauracja (także od strony kelnera), emocje i opinie.

**Aplikacja:** https://xtrencher.github.io/chorwacki/ (po włączeniu GitHub Pages)

- Ok. 3500 fiszek (słowa i zwroty): rozmowa, restauracja (też od strony kelnera), emocje, podróże, praca, język potoczny.
- PWA: instalacja na ekranie głównym telefonu, działa offline, aktualizuje się sama.
- Powtórki w algorytmie FSRS (biblioteka ts-fsrs): dzienne minimum + kolejne sesje po 10.
- Wymowa przez syntezę mowy telefonu (gdy jest głos chorwacki).
- Postęp zapisany na urządzeniu; eksport/import do pliku (import scala postęp z kilku urządzeń).

## Dla rozwijających

Zasady projektu: [CLAUDE.md](CLAUDE.md). Schemat fiszek i wytyczne językowe: [docs/fiszki.md](docs/fiszki.md).

```bash
npm test                    # walidacja danych + testy logiki
python3 -m http.server 8000 # podgląd: http://localhost:8000
```

Bez zależności i bez kroku budowania — pliki w repo są stroną.

## Źródła i licencje

- **Kolejność słów (`rank`)** — jako ściąga posłużyła lista frekwencyjna chorwackiego
  z napisów filmowych: [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords),
  plik `content/2018/hr/hr_50k.txt` (dane pochodzą z korpusu OpenSubtitles 2018).
  Licencja treści list: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/),
  kod repozytorium: MIT, © Hermit Dave. Lista nie jest kopiowana do tego repozytorium —
  wykorzystano ją tylko do ustalenia kolejności, łącznie z priorytetami tematycznymi.
  Kolejne partie: ważność dla rozmowy (ocena 1–5) → częstość w korpusie; zwroty przeplatane ze słowami.
- **Algorytm powtórek** — [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) 5.4.2,
  licencja MIT, plik w `vendor/ts-fsrs/` (z licencją obok).
- **Treść fiszek** (hasła, przykłady, notatki) — napisana na potrzeby tego projektu.
