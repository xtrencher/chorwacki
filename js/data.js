// Loading flashcards from data/*.json (list of files in data/index.json).

export async function loadCards(fetchFn = fetch, base = './data/') {
  const idxRes = await fetchFn(`${base}index.json`);
  if (!idxRes.ok) throw new Error(`Nie udało się wczytać listy fiszek (${idxRes.status}).`);
  const idx = await idxRes.json();
  const parts = await Promise.all(
    idx.files.map(async (f) => {
      const r = await fetchFn(`${base}${f}`);
      if (!r.ok) throw new Error(`Nie udało się wczytać ${f} (${r.status}).`);
      return r.json();
    }),
  );
  return parts.flat();
}

export function indexById(cards) {
  return new Map(cards.map((c) => [c.id, c]));
}
