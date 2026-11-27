#!/usr/bin/env python3
"""Merge generated batches into data/cards-NNN.json.

Order (rank): by tier (1..5); inside a tier words are ordered by corpus frequency
(hermitdave hr_50k) and phrases by batch priority, and both are interleaved
proportionally so every session mixes words and phrases.
Existing cards (data/cards-001.json) keep their ids and ranks; new ids continue after the max id.
Usage: merge.py <scratchpad> [--write]
"""
import json, os, re, sys, glob, collections

S = sys.argv[1]
WRITE = '--write' in sys.argv
REPO = '/home/user/chorwacki'
SIM = {'t': 'transparent', 'p': 'partial', 'o': 'opaque', 'f': 'false_friend'}
PHRASE_PRIORITY = ['b4', 'b5', 'b9', 'b6', 'b8', 'b7', 'b1', 'b2', 'b3']
CHUNK = 500

freq = {}
for i, line in enumerate(open(f'{S}/freq/hr_50k.txt', encoding='utf8'), 1):
    w = line.split()[0]
    freq.setdefault(w, i)

def norm(hr):
    return re.sub(r'[.!?…,]+', '', hr.lower()).strip()

existing = []
for f in sorted(glob.glob(f'{REPO}/data/cards-*.json')):
    existing += json.load(open(f, encoding='utf8'))
seen = {}
for c in existing:
    seen[(norm(c['hr']), c['pos'])] = c['id']
    seen[(norm(c['hr']), '*')] = c['id']

dropped = []
new = []
for path in sorted(glob.glob(f'{S}/gen/b*.txt')):
    batch = os.path.basename(path).split('-')[0]
    for n, line in enumerate(open(path, encoding='utf8'), 1):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        f = [x.strip() for x in line.split('|')]
        if len(f) != 10:
            dropped.append((batch, n, 'zła liczba pól', line[:60]))
            continue
        tier, t, hr, pl, exh, exp, pos, tags, sim, note = f
        key = (norm(hr), pos)
        # same headword: same pos is a duplicate; phrases also clash with any identical text
        if key in seen or (t == 'p' and (norm(hr), '*') in seen):
            dropped.append((batch, n, f'duplikat ({seen.get(key) or seen.get((norm(hr), "*"))})', hr))
            continue
        seen[key] = f'{batch}:{n}'
        seen[(norm(hr), '*')] = f'{batch}:{n}'
        tier = int(tier)
        if sim == 't' and tier < 5:
            tier += 1  # obvious for a Pole: later
        new.append({
            '_tier': tier, '_batch': batch, '_line': n,
            'type': 'phrase' if t == 'p' else 'word', 'hr': hr, 'pl': pl,
            'example_hr': exh, 'example_pl': exp, 'pos': pos, 'tags': [x.strip() for x in tags.split(',')],
            'pl_similarity': SIM.get(sim, sim), 'note': note,
        })

def word_freq(c):
    toks = re.findall(r'[\wčćšžđ]+', c['hr'].lower())
    # multi-word entries are as rare as their rarest word
    return max((freq.get(t, 60000) for t in toks if t not in ('se', 'si')), default=60000)

ordered = []
for tier in range(1, 6):
    words = sorted([c for c in new if c['_tier'] == tier and c['type'] == 'word'], key=lambda c: (word_freq(c), c['_batch'], c['_line']))
    phrases = sorted([c for c in new if c['_tier'] == tier and c['type'] == 'phrase'],
                     key=lambda c: (PHRASE_PRIORITY.index(c['_batch']) if c['_batch'] in PHRASE_PRIORITY else 99, c['_line']))
    tagged = [((i + 0.5) / len(words), 0, c) for i, c in enumerate(words)] + [((j + 0.5) / len(phrases), 1, c) for j, c in enumerate(phrases)]
    ordered += [c for _, _, c in sorted(tagged, key=lambda x: (x[0], x[1]))]

max_id = max(int(c['id'][1:]) for c in existing)
max_rank = max(c['rank'] for c in existing)
out = []
for i, c in enumerate(ordered):
    card = {'id': f'c{max_id + 1 + i:04d}', 'type': c['type'], 'hr': c['hr'], 'pl': c['pl'], 'example_hr': c['example_hr'],
            'example_pl': c['example_pl'], 'pos': c['pos'], 'rank': max_rank + 1 + i, 'tags': c['tags'],
            'pl_similarity': c['pl_similarity'], 'note': c['note']}
    out.append(card)

print(f'nowe: {len(out)} (zwroty {sum(c["type"] == "phrase" for c in out)}), odrzucone: {len(dropped)}')
print('tier:', dict(sorted(collections.Counter(c['_tier'] for c in new).items())))
print('partie:', dict(sorted(collections.Counter(c['_batch'] for c in new).items())))
for d in dropped[:400]:
    print('  odrzucone', *d)

if WRITE:
    files = json.load(open(f'{REPO}/data/index.json'))['files']
    start = len(files) + 1
    for k in range(0, len(out), CHUNK):
        name = f'cards-{start + k // CHUNK:03d}.json'
        part = out[k:k + CHUNK]
        open(f'{REPO}/data/{name}', 'w', encoding='utf8').write('[\n' + ',\n'.join('  ' + json.dumps(c, ensure_ascii=False) for c in part) + '\n]\n')
        files.append(name)
        print('zapisano', name, len(part))
    open(f'{REPO}/data/index.json', 'w').write(json.dumps({'files': files}, ensure_ascii=False) + '\n')
