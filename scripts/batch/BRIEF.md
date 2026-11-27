# Zlecenie: partia fiszek PL→HR (chorwacki dla Polaka)

Użytkownik: Polak, młody dorosły. Cel: swobodnie rozmawiać po chorwacku (towarzysko, w restauracji —
także jako kelner, o emocjach i opiniach, w podróży, w pracy). Uczy się z aplikacji z fiszkami:
przód = polskie znaczenie, tył = słowo chorwackie + przykład (HR i PL). Notatka (`note`) NIE jest
pokazywana w aplikacji, ale zostaje w danych do przeglądów — ma być poprawna.

## Przeczytaj najpierw
- `/home/user/chorwacki/docs/fiszki.md` — schemat i wytyczne językowe (obowiązują w całości).
- `/tmp/claude-0/-home-user-chorwacki/9b6cec6d-861d-5d07-b080-6672af9fbb6e/scratchpad/gen/existing.txt`
  — 305 haseł, które JUŻ SĄ (hr | pos | pl). Nie powtarzaj ich.

## Format wyjścia
Plik tekstowy, jedna fiszka na linię, 10 pól oddzielonych `|` (bez `|` w treści):

```
tier|type|hr|pl|example_hr|example_pl|pos|tags|sim|note
```

- `tier` 1–5: jak ważne dla komunikatywnej rozmowy. 1 = niezbędne, bardzo częste; 2 = bardzo częste;
  3 = częste; 4 = przydatne; 5 = rzadsze/specjalistyczne. Rozkładaj uczciwie (nie wszystko 1–2).
- `type`: `w` (słowo) albo `p` (zwrot / gotowa formuła).
- `hr`: hasło (rzeczownik M. l. poj.; czasownik bezokolicznik; przymiotnik r. m.). Zwrot tak, jak się go mówi.
- `pl`: **jedno, najwyżej dwa znaczenia po przecinku. Bez nawiasów, średników, „ / ”.** Krótko.
  Dla zwrotu: jedna naturalna polska formuła.
- `example_hr`, `example_pl`: jedno krótkie, naturalne, potoczne zdanie i jego naturalne polskie tłumaczenie.
  Tematy zdań: studia, własna firma online, siłownia, rodzeństwo, przyjaciele z Chorwacji i ich rodzina,
  praca w restauracji, wyjazdy. „ti” wobec rówieśników, „Vi/Vaš” (wielką literą) do jednej osoby grzecznościowo.
- `pos`: noun verb adj adv pron prep conj part interj num phrase (dla `p` zawsze `phrase`).
- `tags`: po przecinku, tylko z listy w docs/fiszki.md.
- `sim`: `t` transparent, `p` partial, `o` opaque, `f` false_friend (z perspektywy Polaka).
- `note` (może być puste): różnice wobec polskiego — rodzaj, rekcja, pułapki.
  **Czasownik: obowiązkowo** `1 os.: <forma> · ndk.|dk.|dwuaspektowy, para: <drugi z pary albo brak>`.
  **false_friend: obowiązkowo zaczyna się od** `⚠ Fałszywy przyjaciel:` (u czasownika format czasownika po ostrzeżeniu).

Przykład linii:
```
2|w|kupovati|kupować|Kupujem kruh svaki dan u istoj pekari.|Codziennie kupuję chleb w tej samej piekarni.|verb|zakupy|t|1 os.: kupujem · ndk., para: kupiti (dk.)
```

## Język (krytyczne)
- Standard chorwacki, ijekawski (lijepo, vrijeme, dijete, mlijeko), poprawne č ć š ž đ.
- Zero serbizmów: hiljada, tačno, šta, kafa, voz, porodica, uopšte, takođe, hleb, univerzitet, „da li”,
  „treba da”, „mogu da idem” (→ mogu ići), izvini (→ oprosti), lepo, vreme, uraditi (→ napraviti)…
- Czas przyszły: „radit ću”, „naručit ćemo” (bez -i przed ću).
- Pomiń absolutne podstawy: powitania, liczebniki, kolory, dni tygodnia, miesiące.
- Słowa częste i przydatne w rozmowie > rzadkie. Nie wymyślaj słów; jeśli nie masz pewności co do
  formy albo znaczenia — pomiń hasło.
- Jedno hasło = jedna fiszka. Para aspektowa: osobne fiszki tylko gdy obie formy są bardzo częste
  (np. kupovati / kupiti) — wtedy `pl` je rozróżnia (kupować / kupić).
- Nie dubluj haseł w swojej partii ani z existing.txt.

## Sprawdzanie (obowiązkowe przed oddaniem)
```
node /tmp/claude-0/-home-user-chorwacki/9b6cec6d-861d-5d07-b080-6672af9fbb6e/scratchpad/tools/check.mjs <twój_plik>
```
Popraw wszystkie BŁĘDY (uwagi o tym samym `pl` co inne hasło są dopuszczalne, ale gdy to możliwe —
dobierz inne polskie słowo). Na koniec przeczytaj cały plik jeszcze raz krytycznie: chorwacki,
naturalność, tłumaczenia, aspekt i 1. osoba czasowników.

Pisz plik partiami (np. po 50 linii, dopisując), żeby nie stracić pracy. Nie edytuj niczego w repo.
W raporcie końcowym podaj tylko: liczbę linii, wynik check.mjs i 3–5 najważniejszych wątpliwości.
