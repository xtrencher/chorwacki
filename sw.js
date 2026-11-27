// Service worker: offline cache + updates without manual cache clearing.
//
// Strategy: network-first (with HTTP revalidation) for everything from our origin,
// falling back to the cache when offline or slow. So whenever the phone is online it
// gets the newest files; offline it uses the last cached copy.
// RULE: bump VERSION on every app change (new SW → old caches deleted, clients reloaded).

const VERSION = '2026-11-27.2';
const CACHE = `chorwacki-${VERSION}`;
const NETWORK_TIMEOUT_MS = 4000;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/data.js',
  './js/session.js',
  './js/speech.js',
  './js/state.js',
  './js/storage.js',
  './vendor/ts-fsrs/index.mjs',
  './data/index.json',
  './data/cards-001.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('chorwacki-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'version' && event.source) {
    event.source.postMessage({ type: 'version', version: VERSION });
  }
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const fresh = request.mode === 'navigate' ? new Request(request.url, { cache: 'no-cache' }) : new Request(request, { cache: 'no-cache' });
  const network = fetch(fresh).then(async (res) => {
    // Safari refuses redirected responses for navigations served by a SW — re-wrap them.
    if (res.redirected) res = new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
    if (res.ok && (res.type === 'basic' || res.type === 'default')) cache.put(request, res.clone());
    return res;
  });
  try {
    return await Promise.race([network, timeout(NETWORK_TIMEOUT_MS)]);
  } catch {
    const cached = (await cache.match(request, { ignoreSearch: true }))
      || (request.mode === 'navigate' ? await cache.match('./index.html') : undefined);
    if (cached) return cached;
    return network; // nothing cached: wait for the network after all
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(networkFirst(request));
});
