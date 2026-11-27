#!/usr/bin/env node
// Validates data/*.json against docs/fiszki.md. Exit code 1 on errors.
// Usage: node scripts/validate.mjs [dataDir]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TAGS = new Set([
  'rozmowa', 'emocje', 'opinie', 'jedzenie', 'restauracja', 'kelner', 'studia', 'firma', 'silownia',
  'rodzina', 'przyjaciele', 'podroze', 'czas', 'miejsce', 'codzienne', 'praca', 'zakupy', 'zdrowie', 'pogoda',
  'dom', 'natura', 'internet', 'sport', 'charakter', 'kultura', 'transport', 'pieniadze',
  'gramatyka', 'liczby',
]);
export const POS = new Set(['noun', 'verb', 'adj', 'adv', 'pron', 'prep', 'conj', 'part', 'interj', 'num', 'phrase']);
export const SIMILARITY = new Set(['transparent', 'partial', 'opaque', 'false_friend']);
const FIELDS = ['id', 'type', 'hr', 'pl', 'example_hr', 'example_pl', 'pos', 'rank', 'tags', 'pl_similarity', 'note'];
const OPTIONAL = new Set(['retired']);

// Serbian / ekavian forms that must not appear in Croatian text (whole words, case-insensitive).
export const SERBIAN = [
  'hiljada', 'hiljadu', 'tačno', 'tačan', 'januar', 'februar', 'mart', 'avgust', 'hleb', 'hleba', 'šta', 'kafa', 'kafu', 'kafe',
  'voz', 'vozom', 'porodica', 'porodicu', 'porodice', 'uopšte', 'takođe', 'izvini', 'izvinite', 'lepo', 'lep', 'lepa', 'mleko',
  'vreme', 'dete', 'deca', 'devojka', 'kašika', 'pantalone', 'paradajz', 'univerzitet', 'istorija', 'hemija', 'fudbal',
  'uraditi', 'uradim', 'uradio', 'uradila', 'bezbedno', 'nedelja', 'nedelju', 'sedi', 'sesti', 'ovde', 'gde',
  'kuvati', 'kuvar', 'pozorište', 'sveska', 'beli', 'belo', 'cena', 'cene', 'mesto', 'mesta',
  'pevati', 'pesma', 'pesmu', 'videti', 'želeti', 'razumeti', 'razumem', 'voleti', 'sećam', 'sećati', 'osećam', 'osećati',
  'čovek', 'reč', 'reči', 'leto', 'posle', 'predlog',
];
const SERBIAN_PATTERNS = [
  { re: /(?<!\p{L})da li(?!\p{L})/iu, msg: '„da li” (po chorwacku: „je li …” / „… li …”)' },
  { re: /(?<!\p{L})(želim|hoću|mogu|moram|trebam) da \p{L}+m(?!\p{L})/iu, msg: 'konstrukcja „mogu da idem” (po chorwacku: „mogu ići”)' },
  { re: /(?<!\p{L})(želiš|hoćeš|možeš|moraš|trebaš) da \p{L}+š(?!\p{L})/iu, msg: 'konstrukcja „možeš da ideš” (po chorwacku: „možeš ići”)' },
  { re: /(?<!\p{L})treba da(?!\p{L})/iu, msg: '„treba da” (po chorwacku: „treba + bezokolicznik” / „trebam …”)' },
];

const wordRe = (w) => new RegExp(`(^|[^\\p{L}])${w.replace(/ /g, '\\s+')}(?=$|[^\\p{L}])`, 'iu');
const SERBIAN_RES = SERBIAN.map((w) => [w, wordRe(w)]);

export function validateCards(cards, { files = [], indexFiles = [] } = {}) {
  const errors = [];
  const warnings = [];
  const ids = new Map();
  const ranks = new Map();
  const heads = new Map();
  const pls = new Map();

  for (const f of files) if (!indexFiles.includes(f)) errors.push(`data/${f}: brak w data/index.json`);
  for (const f of indexFiles) if (!files.includes(f)) errors.push(`data/index.json: plik ${f} nie istnieje`);

  for (const { card: c, file } of cards) {
    const where = `${file}:${c && c.id ? c.id : '?'}`;
    const err = (m) => errors.push(`${where}: ${m}`);
    if (!c || typeof c !== 'object' || Array.isArray(c)) { err('fiszka nie jest obiektem'); continue; }

    for (const f of FIELDS) if (!(f in c)) err(`brak pola „${f}”`);
    for (const k of Object.keys(c)) if (!FIELDS.includes(k) && !OPTIONAL.has(k)) err(`nieznane pole „${k}”`);
    if ('retired' in c && c.retired !== true) err('„retired” może mieć tylko wartość true');

    if (typeof c.id !== 'string' || !/^c\d{4,}$/.test(c.id)) err('id musi mieć postać c0001');
    else if (ids.has(c.id)) err(`zduplikowane id (także w ${ids.get(c.id)})`);
    else ids.set(c.id, file);

    if (!['word', 'phrase'].includes(c.type)) err('type musi być word albo phrase');
    for (const f of ['hr', 'pl', 'example_hr', 'example_pl']) {
      if (typeof c[f] !== 'string' || !c[f].trim()) err(`pole „${f}” musi być niepustym tekstem`);
      else if (c[f] !== c[f].trim() || /\s{2,}/.test(c[f])) err(`pole „${f}” ma zbędne spacje`);
    }
    if (typeof c.note !== 'string') err('note musi być tekstem (może być pusty)');
    if (typeof c.pl === 'string') {
      if (/[()\[\];]|\s\/\s/.test(c.pl)) err('pl: bez nawiasów, średników i „ / ” — tylko 1–2 znaczenia');
      if (c.type === 'word' && c.pl.split(',').length > 2) err('pl: maksymalnie 2 znaczenia (po przecinku)');
    }
    if (!POS.has(c.pos)) err(`nieznane pos „${c.pos}”`);
    if (c.type === 'phrase' && c.pos !== 'phrase') err('zwrot (type phrase) musi mieć pos phrase');
    if (c.type === 'word' && c.pos === 'phrase') err('słowo (type word) nie może mieć pos phrase');
    if (!Number.isInteger(c.rank) || c.rank < 1) err('rank musi być liczbą całkowitą ≥ 1');
    if (!Array.isArray(c.tags) || c.tags.length === 0) err('tags musi być niepustą tablicą');
    else for (const t of c.tags) if (!TAGS.has(t)) err(`nieznany tag „${t}” (lista w docs/fiszki.md)`);
    if (!SIMILARITY.has(c.pl_similarity)) err(`nieznane pl_similarity „${c.pl_similarity}”`);

    if (typeof c.note === 'string') {
      if (c.pl_similarity === 'false_friend' && !c.note.startsWith('⚠ Fałszywy przyjaciel:')) {
        err('false_friend: note musi zaczynać się od „⚠ Fałszywy przyjaciel:”');
      }
      if (c.pos === 'verb' && !/(^|· |\. )1 os\.: [^·]+ · (ndk\.|dk\.|dwuaspektowy), para: \S/.test(c.note)) {
        err('czasownik: note musi zawierać „1 os.: <forma> · ndk.|dk.|dwuaspektowy, para: …” (na początku albo po ostrzeżeniu o fałszywym przyjacielu)');
      }
    }

    // Croatian text checks
    for (const f of ['hr', 'example_hr']) {
      const text = c[f];
      if (typeof text !== 'string') continue;
      for (const [w, re] of SERBIAN_RES) if (re.test(text)) err(`${f}: serbska/ekawska forma „${w}”`);
      for (const p of SERBIAN_PATTERNS) if (p.re.test(text)) err(`${f}: ${p.msg}`);
      const bad = text.match(/[^\p{Script=Latin}\s\d.,!?;:'"„“”…\-–—()\/]/gu);
      if (bad) err(`${f}: niedozwolone znaki „${[...new Set(bad)].join('')}” (np. cyrylica)`);
      if (/[qxyw]/i.test(text)) warnings.push(`${where}: ${f} zawiera q/x/y/w — nietypowe dla chorwackiego`);
    }

    if (c.retired) continue;
    if (Number.isInteger(c.rank)) {
      if (ranks.has(c.rank)) err(`zduplikowany rank ${c.rank} (także ${ranks.get(c.rank)})`);
      else ranks.set(c.rank, c.id);
    }
    if (typeof c.hr === 'string') {
      const key = `${c.hr.toLowerCase().replace(/[.!?]+$/, '')}|${c.pos}`;
      if (heads.has(key)) err(`duplikat hasła „${c.hr}” (${c.pos}) — także ${heads.get(key)}`);
      else heads.set(key, c.id);
    }
    if (typeof c.pl === 'string') {
      const key = c.pl.toLowerCase();
      if (pls.has(key)) warnings.push(`${where}: to samo pl „${c.pl}” co ${pls.get(key)} — doprecyzuj w nawiasie`);
      else pls.set(key, c.id);
    }
  }
  return { errors, warnings, count: cards.length, active: cards.filter((x) => x.card && !x.card.retired).length };
}

export function loadDataDir(dir) {
  const indexFiles = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')).files;
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json').sort();
  const cards = [];
  const parseErrors = [];
  for (const f of files) {
    let arr;
    try {
      arr = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    } catch (e) {
      parseErrors.push(`data/${f}: błąd JSON: ${e.message}`);
      continue;
    }
    if (!Array.isArray(arr)) { parseErrors.push(`data/${f}: plik musi zawierać tablicę fiszek`); continue; }
    for (const card of arr) cards.push({ card, file: f });
  }
  return { cards, files, indexFiles, parseErrors };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const dir = process.argv[2] || join(root, 'data');
  if (!existsSync(join(dir, 'index.json'))) {
    console.error(`Brak ${join(dir, 'index.json')}`);
    process.exit(1);
  }
  const { cards, files, indexFiles, parseErrors } = loadDataDir(dir);
  const res = validateCards(cards, { files, indexFiles });
  const errors = [...parseErrors, ...res.errors];
  for (const w of res.warnings) console.warn(`uwaga: ${w}`);
  for (const e of errors) console.error(`BŁĄD: ${e}`);
  const words = cards.filter((x) => !x.card.retired && x.card.type === 'word').length;
  const phrases = cards.filter((x) => !x.card.retired && x.card.type === 'phrase').length;
  console.log(`Fiszki: ${res.count} (aktywne ${res.active}: słowa ${words}, zwroty ${phrases}). Błędy: ${errors.length}, uwagi: ${res.warnings.length}.`);
  process.exit(errors.length ? 1 : 0);
}
