// TWS Portal — service worker
// Caches the app shell so it loads instantly even on bad signal.
// Bump CACHE_VERSION whenever you deploy new code so old caches get cleared.

const CACHE_VERSION = 'tws-portal-v1';
const SHELL = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(SHELL))
      .catch(() => { /* offline first install — fine, will populate on first network hit */ })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clean up old caches from previous deploys
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // NEVER cache live data calls — these must always go to the network so customers
  // see their actual jobs, not yesterday's snapshot.
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('postcodes.io') ||
    url.hostname.includes('nominatim.openstreetmap.org') ||
    url.pathname.startsWith('/api/')
  ) {
    return; // let the browser handle it normally
  }

  // Cache-first for everything else (HTML shell, JS, CSS, fonts, icons, libraries)
  // — falls back to the network if not in cache. This is what makes the portal feel
  // instant and "app-like" even on a flaky 3G site.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Stash a copy for next time, but only if the response is OK
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached); // offline + not cached = whatever we have
    })
  );
});
