# Fiszki — schemat i wytyczne językowe

Obowiązkowa lektura przed dodawaniem lub poprawianiem fiszek.
Walidator (`npm run validate`) sprawdza część tych reguł automatycznie.

## Pliki

- `data/index.json` — lista plików z fiszkami: `{ "files": ["cards-001.json", …] }`.
- `data/cards-NNN.json` — tablica fiszek. Kolejne partie = kolejne pliki.

## Schemat fiszki

```json
{
  "id": "c0042",
  "type": "word",
  "hr": "kruh",
  "pl": "chleb",
  "example_hr": "Možeš li kupiti kruh na putu kući?",
  "example_pl": "Możesz kupić chleb w drodze do domu?",
  "pos": "noun",
  "rank": 42,
  "tags": ["jedzenie"],
  "pl_similarity": "false_friend",
  "note": "⚠ Fałszywy przyjaciel: nie „kruchy”. Rodz. m. (taj kruh)."
}
```

| pole | typ | opis |
|---|---|---|
| `id` | string `c` + min. 4 cyfry | **Stały identyfikator.** Nigdy nie zmieniany, nigdy nie używany ponownie. Nowe fiszki: kolejny wolny numer (najwyższy w repo + 1). |
| `type` | `word` \| `phrase` | słowo albo zwrot / gotowa formuła |
| `hr` | string | hasło chorwackie. Rzeczownik w M. l. poj., czasownik w bezokoliczniku, przymiotnik w r. m. (przy różnicy form można dodać `/ ž.`). Zwrot w formie, w jakiej się go mówi. |
| `pl` | string | polskie znaczenie. Gdy wieloznaczne — doprecyzowanie w nawiasie: `„zamówić (w restauracji)”`. Gdy dwa hasła HR mają to samo PL — nawias musi je rozróżnić. |
| `example_hr` | string | jedno krótkie, naturalne zdanie z hasłem |
| `example_pl` | string | naturalne polskie tłumaczenie przykładu (nie kalka) |
| `pos` | `noun` `verb` `adj` `adv` `pron` `prep` `conj` `part` `interj` `num` `phrase` | część mowy; dla `type: phrase` zawsze `phrase` |
| `rank` | liczba całkowita ≥ 1 | kolejność wprowadzania (1 = pierwsza). Unikalna wśród aktywnych fiszek. |
| `tags` | tablica stringów (min. 1) | z listy niżej |
| `pl_similarity` | `transparent` \| `partial` \| `opaque` \| `false_friend` | podobieństwo do polskiego (niżej) |
| `note` | string (może być `""`) | to, co różni się od polskiego (niżej). Wymagane dla czasowników i fałszywych przyjaciół. |
| `retired` | `true` (opcjonalne) | fiszka wycofana — zostaje w pliku, aplikacja jej nie pokazuje |

Wszystkie pola poza `retired` są obowiązkowe.

### Tagi

`rozmowa` (towarzyskie, small talk), `emocje`, `opinie`, `jedzenie`, `restauracja`,
`kelner` (od strony obsługi), `studia`, `firma` (własna firma online), `silownia`,
`rodzina`, `przyjaciele`, `podroze`, `czas`, `miejsce`, `codzienne`, `praca`, `zakupy`,
`zdrowie`, `pogoda`.
Nowy tag → najpierw dopisz go tutaj i w `scripts/validate.mjs` (`TAGS`).

### `pl_similarity`

- `transparent` — Polak zrozumie bez nauki (`voda`, `kava`, `brat`).
- `partial` — podobny rdzeń, ale inna forma albo przesunięte znaczenie (`ručak` – obiad/lunch, `sretan` – szczęśliwy).
- `opaque` — nic nie podpowiada (`ipak` – jednak, `baš` – akurat/naprawdę, `konobar` – kelner).
- `false_friend` — brzmi jak polskie słowo o **innym** znaczeniu. `note` musi zaczynać się od
  `⚠ Fałszywy przyjaciel:` i mówić wprost, z czym Polak to pomyli
  (np. `jako` = bardzo, nie „jako”; `pozor` = uwaga!; `jagoda` = truskawka).

### `note` — co wpisać

Tylko to, co **różni się od polskiego** albo jest pułapką. Krótko, po polsku.

- inny rodzaj gramatyczny niż w polskim (`rodz. ž.`, `rodz. m.`, `rodz. n.`),
- inna rekcja / przyimek (`čekati nekoga` vs `czekać na kogoś`; `igrati se s`),
- nieregularna odmiana, liczba mnoga, akcent zmieniający znaczenie,
- kiedy używać (rejestr: potoczne / grzeczne, „ti” vs „Vi”),
- pułapki: fałszywi przyjaciele, mylące podobieństwa.

**Czasowniki — format obowiązkowy** (walidator to sprawdza):

```
1 os.: <forma 1 os. l. poj. cz. teraźn.> · <ndk.|dk.|dwuaspektowy>, para: <drugi czasownik z pary> [· dalsze uwagi]
```

Gdy czasownik jest fałszywym przyjacielem, notatka zaczyna się od ostrzeżenia, a ten format następuje po nim.

Przykłady:

- `1 os.: pijem · ndk., para: popiti (dk.)`
- `1 os.: naručim · dk., para: naručivati (ndk.) · rekcja: naručiti nešto`
- `1 os.: volim · ndk., para: zavoljeti (dk. „pokochać”) · voljeti + bezokol. = lubić coś robić`
- gdy nie ma pary: `1 os.: imam · ndk., para: brak`
- czasownik dwuaspektowy: `1 os.: telefoniram · dwuaspektowy, para: brak`

## Wytyczne językowe

- **Standard chorwacki (ijekawski)**, poprawne znaki `č ć š ž đ` (nigdy `c`/`dj` zamiast nich).
- **Żadnych form serbskich.** Typowe pułapki (walidator ma listę zakazanych słów):

  | ❌ serbskie / ekawskie | ✅ chorwackie |
  |---|---|
  | hiljada | tisuća |
  | tačno | točno |
  | januar, februar… | siječanj, veljača… |
  | hleb | kruh |
  | šta | što |
  | kafa | kava |
  | voz | vlak |
  | porodica | obitelj |
  | uopšte | uopće |
  | takođe | također |
  | da li … ? | je li … ? / … li … ? |
  | treba da idem | trebam ići |
  | hoću da idem | hoću ići |
  | izvini | oprosti / ispričavam se |
  | lepo, mleko, vreme, dete | lijepo, mlijeko, vrijeme, dijete |
  | kašika, sto (stół), pantalone, paradajz | žlica, stol, hlače, rajčica |
  | univerzitet, istorija, hemija, fudbal | sveučilište, povijest, kemija, nogomet |
  | uraditi | napraviti / učiniti |

  Konstrukcja `da + czas teraźniejszy` w miejsce bezokolicznika to serbizm — używaj bezokolicznika.
- **Zdania krótkie, naturalne, potoczne** — tak, jak mówi młody dorosły w Zagrzebiu czy Splicie.
  Nie podręcznikowe „Ovo je stol”.
- Rejestr: **„ti” wobec rówieśników**, **„Vi” (wielką literą) wobec starszych**
  (rodzice przyjaciół, gość w restauracji, profesor).
- Tematy zdań przykładowych: studia, własna firma online, siłownia, rodzeństwo,
  przyjaciele z Chorwacji i ich rodzina, praca w restauracji (także jako kelner), wyjazdy.
- Przykład ma pokazywać hasło w typowym kontekście i typowej formie (przypadek, rekcja).
- `example_pl` — naturalna polszczyzna, nie tłumaczenie słowo w słowo.
- Zwroty (`type: phrase`): gotowe formuły do użycia od razu (`Može.`, `Nema veze.`,
  `Što preporučujete?`, `Jeste li odabrali?`). Około 1/4 fiszek.
- Pomijamy absolutne podstawy (powitania, liczebniki, kolory, dni tygodnia, miesiące).
- Hasła HR i PL bez kropki na końcu (poza zwrotami-zdaniami, gdzie interpunkcja jest częścią formuły).

## Kolejność (`rank`)

Źródło: lista frekwencyjna chorwackiego z napisów filmowych
(hermitdave/FrequencyWords, 2018, `hr_50k.txt`, treść CC BY-SA 4.0) jako ściąga,
plus priorytety użytkownika: rozmowy towarzyskie, jedzenie i restauracja, emocje i opinie.
Słowa częste i przydatne w rozmowie idą wcześniej; zwroty przeplatane ze słowami,
żeby każda sesja dawała coś do użycia od razu.

## Poprawki i zgłoszenia

- Zgłoszenia z aplikacji (Ustawienia → Zgłoszenia → Kopiuj) zawierają `id` fiszki.
- Poprawka: edytuj fiszkę **w miejscu**, `id` bez zmian. Postęp użytkownika zostaje.
- Fiszka do usunięcia: `"retired": true` — nie kasuj jej z pliku.
- Gdy poprawka zmienia znaczenie fiszki tak bardzo, że to nowa fiszka: stara `retired`,
  nowa z nowym `id`.
