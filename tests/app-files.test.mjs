// Static checks for the PWA: service worker precache list, manifest, relative paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const sw = read('sw.js');
const precache = [...sw.matchAll(/^\s+'(\.\/[^']*)',$/gm)].map((m) => m[1]);

test('sw.js ma VERSION', () => {
  assert.match(sw, /const VERSION = '[^']+';/);
});

test('każdy plik z PRECACHE istnieje', () => {
  assert.ok(precache.length > 5);
  for (const p of precache) {
    const file = p === './' ? 'index.html' : p.slice(2);
    assert.ok(existsSync(join(root, file)), `brak ${file}`);
  }
});

test('PRECACHE obejmuje wszystkie moduły JS, CSS, vendor i pliki danych', () => {
  const need = [
    ...readdirSync(join(root, 'js')).filter((f) => f.endsWith('.js')).map((f) => `./js/${f}`),
    ...readdirSync(join(root, 'css')).map((f) => `./css/${f}`),
    './vendor/ts-fsrs/index.mjs',
    './data/index.json',
    ...JSON.parse(read('data/index.json')).files.map((f) => `./data/${f}`),
    './index.html',
    './manifest.webmanifest',
  ];
  for (const n of need) assert.ok(precache.includes(n), `dopisz ${n} do PRECACHE w sw.js`);
});

test('manifest: ikony istnieją, ścieżki względne', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.lang, 'pl');
  for (const k of ['start_url', 'scope']) assert.ok(!m[k].startsWith('/'), `${k} musi być względny`);
  for (const i of m.icons) {
    assert.ok(!i.src.startsWith('/'));
    assert.ok(existsSync(join(root, i.src)), `brak ${i.src}`);
  }
  assert.ok(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'));
});

test('index.html i moduły używają tylko ścieżek względnych i nie ładują nic z CDN', () => {
  const html = read('index.html');
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(m[1].startsWith('./'), `ścieżka nie jest względna: ${m[1]}`);
  }
  for (const f of readdirSync(join(root, 'js'))) {
    const src = read(`js/${f}`);
    for (const m of src.matchAll(/^import .* from '([^']+)';$/gm)) {
      assert.ok(m[1].startsWith('./') || m[1].startsWith('../'), `${f}: import spoza repo: ${m[1]}`);
    }
  }
});
