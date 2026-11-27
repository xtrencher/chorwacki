# Narzędzia do partii fiszek

Tak powstało ~2400 fiszek w etapie 2. Ścieżki w plikach wskazują katalog roboczy sesji
(`…/scratchpad`) — w nowej sesji zamień je na własny katalog roboczy (nie repo).

1. `BRIEF.md` — zlecenie dla autora partii (format linii: `tier|type|hr|pl|…`). Jeden agent = jeden temat,
   z jasnym podziałem, kto „posiada” które hasła; `existing.txt` = lista istniejących haseł.
2. `check.mjs <plik>` — autor sprawdza swoją partię walidatorem projektu (+ duplikaty z istniejącymi).
3. `merge.py <katalog> [--write]` — łączy partie, usuwa duplikaty, nadaje rank
   (tier → częstość z hermitdave hr_50k, przezroczyste słowa poziom niżej, zwroty przeplatane)
   i nowe id po najwyższym istniejącym; zapisuje kolejne `data/cards-NNN.json` po 500.
   Potrzebuje `freq/hr_50k.txt` w katalogu roboczym (pobierz z FrequencyWords, nie commituj).
4. `REVIEW.md` — zlecenie dla recenzenta (jeden plik danych na recenzenta) → `review-NNN.json`.
5. `merge2.py <katalog> [--write]` — wersja dla kolejnych partii (`gen/c*.txt`): dodaje nowe fiszki
   i układa na nowo kolejność wszystkiego za pozycją 305 (1–305 i treść istniejących bez zmian).
   Tiery istniejących bierze z plików `gen/b*.txt` — przechowuj je razem z partiami.
6. `apply_review.py <katalog>` — nanosi poprawki recenzentów. Usuwa tylko NOWE, nieopublikowane
   fiszki; opublikowanych nie usuwaj — dostają `retired: true`.

Po scaleniu: dopisz nowe pliki do `PRECACHE` w `sw.js`, podbij `VERSION`, `npm test`.
