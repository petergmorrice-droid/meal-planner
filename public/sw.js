/*
 * Lets the app open without signal (e.g. in the supermarket).
 *
 * - The app's own files are fetched from the network when it answers within a
 *   few seconds, so a newly uploaded version shows up straight away.
 * - If there's no signal, or it's too slow, the last saved copy is used.
 * - Nothing from GitHub or Gemini is cached here: your data is already kept
 *   on the phone by the app itself and synced when back online.
 *
 * The build replaces __BUILD_VERSION__ so each new version gets a fresh cache.
 */
const CACHE = 'meal-planner-__BUILD_VERSION__';
const NETWORK_TIMEOUT_MS = 3000;
const PRECACHE = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Add one by one: a missing icon must not stop the app itself being saved.
    await Promise.all(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('meal-planner-') && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

const timeout = (ms) => new Promise((resolve) => setTimeout(() => resolve(null), ms));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // GitHub, Gemini, fonts: straight to the network
  const isPage = req.mode === 'navigate';

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const network = fetch(req).then(async (res) => {
      if (res && res.ok && res.type === 'basic') {
        await cache.put(isPage ? './' : req, res.clone());
      }
      return res;
    }).catch(() => null);

    const fast = await Promise.race([network, timeout(NETWORK_TIMEOUT_MS)]);
    if (fast) return fast;

    const cached = isPage
      ? (await cache.match('./')) || (await cache.match(req, { ignoreSearch: true }))
      : await cache.match(req, { ignoreSearch: true });
    if (cached) {
      event.waitUntil(network); // keep refreshing the saved copy in the background
      return cached;
    }
    // Nothing saved yet: wait for the network however long it takes.
    const late = await network;
    return late || new Response('Offline, and this page has not been saved on this phone yet.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  })());
});
