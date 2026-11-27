# Przegląd fiszek świeżym okiem (chorwacki dla Polaka)

Jesteś recenzentem: native-level chorwacki (standard, ijekawski) + polski. Fiszki napisali inni autorzy.
Użytkownik: Polak, chce komunikatywnie rozmawiać po chorwacku. Na fiszce widzi tylko:
przód = `pl`, tył = `hr` + `example_hr` + `example_pl`. `note` nie jest pokazywany, ale ma być prawdziwy.

Przeczytaj najpierw `/home/user/chorwacki/docs/fiszki.md` (schemat i wytyczne). Potem przejrzyj
**każdą** fiszkę ze swojego pliku (nie edytuj go).

## Szukaj (od najważniejszego)
1. Błędy chorwackie: zła forma, odmiana, składnia, pisownia (č ć š ž đ, „radit ću”), serbizmy/ekawizmy,
   słowa, które nie istnieją albo znaczą coś innego. Przykład nienaturalny lub nie po chorwacku.
2. Złe tłumaczenie: `pl` nie odpowiada `hr`; `example_pl` nie odpowiada `example_hr` albo jest kalką.
3. `pl`, które zdradza odpowiedź albo nic nie sprawdza (np. `pl` = sama nazwa chorwacka „pašticada”) —
   zamień na krótki polski opis (max 2 znaczenia, bez nawiasów, np. „dalmatyńska pieczeń w sosie”).
   `pl` ma 1–2 znaczenia, bez nawiasów, średników i „ / ”.
4. Nieprawdziwy `note`: zła 1. os., zły aspekt albo para aspektowa, zły rodzaj, zła rekcja, fałszywy
   przyjaciel, który nim nie jest (wtedy zmień też `pl_similarity`), albo przegapiony oczywisty fałszywy przyjaciel.
5. Fiszki zbędne: prawie identyczne z inną fiszką w Twoim pliku (to samo znaczenie i forma), słowo bardzo
   rzadkie/książkowe bez wartości dla rozmowy, wulgaryzm. Oznacz do usunięcia.

Nie zgłaszaj kosmetyki, która jest poprawna i naturalna. Nie przepisuj przykładów tylko dla stylu.
Konstrukcja „da + czas teraźn.” jest poprawna po czasownikach typu reći, htjeti (inny podmiot), predložiti;
serbizmem jest tylko zamiast bezokolicznika przy tym samym podmiocie („mogu da idem”).

## Wynik: plik JSON (tablica), dokładnie w tym formacie
```json
[
  {"id": "c0412", "set": {"example_hr": "…", "example_pl": "…"}, "why": "krótko po polsku"},
  {"id": "c0513", "set": {"pl": "…", "pl_similarity": "partial", "note": "…"}, "why": "…"},
  {"id": "c0777", "remove": true, "why": "duplikat c0700"}
]
```
- Dozwolone pola w `set`: hr, pl, example_hr, example_pl, pos, tags, pl_similarity, note (pełne nowe wartości).
- Notatka czasownika musi mieć format `1 os.: … · ndk.|dk.|dwuaspektowy, para: …`; false_friend zaczyna się od
  `⚠ Fałszywy przyjaciel:`.
- Zapisz plik ścieżką podaną w zleceniu i sprawdź, że to poprawny JSON (`node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" <plik>`).

Raport końcowy: liczba poprawek i usunięć oraz 3 najczęstsze typy problemów. Krótko.
