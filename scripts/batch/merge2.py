#!/usr/bin/env python3
"""Add new batches (gen/c*.txt) and re-rank everything after the hand-curated first part.

- Cards with rank <= FIXED keep their rank (user is already learning them).
- All other existing cards + new cards are ordered together: tier (1..5) -> inside a tier
  words by corpus frequency, phrases by batch priority, interleaved proportionally.
- Tiers of existing cards come from the original batch files (gen/b*.txt); a card whose
  headword was edited by a reviewer inherits the tier of the card ranked just before it.
- New cards get new ids after the highest existing id and go to new data files.
Usage: merge2.py <scratchpad> [--write]
"""
import json, re, sys, glob, os, collections

S = sys.argv[1]
WRITE = '--write' in sys.argv
REPO = '/home/user/chorwacki'
FIXED = 305
CHUNK = 500
SIM = {'t': 'transparent', 'p': 'partial', 'o': 'opaque', 'f': 'false_friend'}
PHRASE_PRIORITY = ['b4', 'c4', 'b5', 'b9', 'c6', 'c5', 'b6', 'b8', 'b7', 'c1', 'c2', 'c3', 'b1', 'b2', 'b3']

freq = {}
for i, line in enumerate(open(f'{S}/freq/hr_50k.txt', encoding='utf8'), 1):
    freq.setdefault(line.split()[0], i)

def norm(hr):
    return re.sub(r'[.!?…,]+', '', hr.lower()).strip()

def word_freq(hr):
    toks = re.findall(r'[\wčćšžđ]+', hr.lower())
    return max((freq.get(t, 60000) for t in toks if t not in ('se', 'si')), default=60000)

def read_batch(path):
    batch = os.path.basename(path).split('-')[0]
    for n, line in enumerate(open(path, encoding='utf8'), 1):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        f = [x.strip() for x in line.split('|')]
        if len(f) != 10:
            yield batch, n, None
            continue
        yield batch, n, f

def adj_tier(tier, sim):
    tier = int(tier)
    return tier + 1 if sim in ('t', 'transparent') and tier < 5 else tier

# ---- existing cards ----
files = json.load(open(f'{REPO}/data/index.json'))['files']
by_file = {f: json.load(open(f'{REPO}/data/{f}', encoding='utf8')) for f in files}
existing = [c for f in files for c in by_file[f]]

orig = {}
for path in sorted(glob.glob(f'{S}/gen/b*.txt')):
    for batch, n, f in read_batch(path):
        if f:
            orig.setdefault((norm(f[2]), f[6]), (adj_tier(f[0], f[8]), batch, n))

movable = sorted([c for c in existing if c['rank'] > FIXED], key=lambda c: c['rank'])
meta = {}
prev = (3, 'b2', 0)
missing = 0
for c in movable:
    m = orig.get((norm(c['hr']), c['pos']))
    if not m:
        missing += 1
        m = (prev[0], prev[1], prev[2] + 0.5)
    meta[c['id']] = m
    prev = m

seen = {}
for c in existing:
    seen[(norm(c['hr']), c['pos'])] = c['id']
    seen[(norm(c['hr']), '*')] = c['id']

# ---- new batches ----
new, dropped = [], []
for path in sorted(glob.glob(f'{S}/gen/c*.txt')):
    for batch, n, f in read_batch(path):
        if not f:
            dropped.append((batch, n, 'zła liczba pól', '')); continue
        tier, t, hr, pl, exh, exp, pos, tags, sim, note = f
        key = (norm(hr), pos)
        if key in seen or (t == 'p' and (norm(hr), '*') in seen):
            dropped.append((batch, n, f'duplikat {seen.get(key) or seen.get((norm(hr), "*"))}', hr)); continue
        seen[key] = f'{batch}:{n}'
        seen[(norm(hr), '*')] = f'{batch}:{n}'
        card = {'id': None, 'type': 'phrase' if t == 'p' else 'word', 'hr': hr, 'pl': pl, 'example_hr': exh,
                'example_pl': exp, 'pos': pos, 'rank': 0, 'tags': [x.strip() for x in tags.split(',')],
                'pl_similarity': SIM.get(sim, sim), 'note': note}
        new.append(card)
        meta[id(card)] = (adj_tier(tier, sim), batch, n)

def m_of(c):
    return meta[id(c)] if id(c) in meta else meta[c['id']]

pool = movable + new
ordered = []
for tier in range(1, 6):
    ws = sorted([c for c in pool if m_of(c)[0] == tier and c['type'] == 'word'],
                key=lambda c: (word_freq(c['hr']), m_of(c)[1], m_of(c)[2]))
    ps = sorted([c for c in pool if m_of(c)[0] == tier and c['type'] == 'phrase'],
                key=lambda c: (c['rank'] if c['id'] else 10**9, PHRASE_PRIORITY.index(m_of(c)[1]) if m_of(c)[1] in PHRASE_PRIORITY else 99, m_of(c)[2]))
    tagged = [((i + 0.5) / len(ws), 0, c) for i, c in enumerate(ws)] + [((j + 0.5) / len(ps), 1, c) for j, c in enumerate(ps)]
    ordered += [c for _, _, c in sorted(tagged, key=lambda x: (x[0], x[1]))]
assert len(ordered) == len(pool)

max_id = max(int(c['id'][1:]) for c in existing)
nid = max_id
for r, c in enumerate(ordered, FIXED + 1):
    c['rank'] = r
for c in sorted(new, key=lambda c: c['rank']):
    nid += 1
    c['id'] = f'c{nid:04d}'

print(f'istniejące przenoszone: {len(movable)} (bez tieru z partii: {missing}), nowe: {len(new)} (zwroty {sum(c["type"] == "phrase" for c in new)}), odrzucone: {len(dropped)}')
print('nowe wg partii:', dict(sorted(collections.Counter(m_of(c)[1] for c in new).items())))
print('nowe wg tieru:', dict(sorted(collections.Counter(m_of(c)[0] for c in new).items())))
print('razem:', len(existing) + len(new))
ranks = sorted(c['rank'] for c in new)
if ranks:
    print('pozycje nowych (kwartyle):', ranks[0], ranks[len(ranks)//4], ranks[len(ranks)//2], ranks[3*len(ranks)//4], ranks[-1])
for d in dropped:
    print('  odrzucone', *d)

if WRITE:
    dump = lambda cs: '[\n' + ',\n'.join('  ' + json.dumps(c, ensure_ascii=False) for c in cs) + '\n]\n'
    for f in files:
        open(f'{REPO}/data/{f}', 'w', encoding='utf8').write(dump(by_file[f]))
    new_sorted = sorted(new, key=lambda c: c['rank'])
    start = len(files) + 1
    for k in range(0, len(new_sorted), CHUNK):
        name = f'cards-{start + k // CHUNK:03d}.json'
        open(f'{REPO}/data/{name}', 'w', encoding='utf8').write(dump(new_sorted[k:k + CHUNK]))
        files.append(name)
        print('zapisano', name)
    open(f'{REPO}/data/index.json', 'w').write(json.dumps({'files': files}, ensure_ascii=False) + '\n')
