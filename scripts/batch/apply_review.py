#!/usr/bin/env python3
"""Apply reviewer patches (review-*.json) to data/cards-002..*.json.
New, unpublished cards flagged 'remove' are deleted (no user progress exists for them yet);
ids are never reused."""
import json, glob, sys
S = sys.argv[1]
REPO = '/home/user/chorwacki'
ALLOWED = {'hr', 'pl', 'example_hr', 'example_pl', 'pos', 'tags', 'pl_similarity', 'note'}
patches = {}
for f in sorted(glob.glob(f'{S}/gen/review-*.json')):
    for p in json.load(open(f, encoding='utf8')):
        patches.setdefault(p['id'], []).append(p)
done = set(); removed = []; skipped = []
for path in sorted(glob.glob(f'{REPO}/data/cards-*.json')):
    if path.endswith('cards-001.json'):
        continue
    cards = json.load(open(path, encoding='utf8'))
    out = []
    for c in cards:
        ps = patches.get(c['id'], [])
        if any(p.get('remove') for p in ps):
            removed.append(f"{c['id']} {c['hr']}: {next(p.get('why','') for p in ps if p.get('remove'))}")
            done.add(c['id']); continue
        for p in ps:
            for k, v in (p.get('set') or {}).items():
                if k in ALLOWED:
                    c[k] = v
                else:
                    skipped.append((c['id'], k))
            done.add(c['id'])
        out.append(c)
    open(path, 'w', encoding='utf8').write('[\n' + ',\n'.join('  ' + json.dumps(c, ensure_ascii=False) for c in out) + '\n]\n')
unknown = set(patches) - done
print(f'poprawione/usunięte id: {len(done)}, usunięte: {len(removed)}, nieznane id: {sorted(unknown)}, pominięte pola: {skipped}')
for r in removed: print('  usunięto', r)
