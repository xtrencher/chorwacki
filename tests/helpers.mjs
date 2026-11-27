process.env.TZ = 'Europe/Warsaw';

export function makeCards(n, extra = {}) {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${String(i + 1).padStart(4, '0')}`,
    type: 'word',
    hr: `rijec${i + 1}`,
    pl: `słowo${i + 1}`,
    example_hr: 'Primjer.',
    example_pl: 'Przykład.',
    pos: 'noun',
    rank: i + 1,
    tags: ['codzienne'],
    pl_similarity: 'opaque',
    note: '',
    ...(extra[i] || {}),
  }));
}

export const T = (s) => new Date(s);
