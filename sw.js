const CACHE_NAME = 'irosh-ent-v8'; // ← version change = phones get new code
const STATIC_CDN = [
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.8/index.global.min.js'
];

// LOCAL files — DO NOT cache aggressively (network-first)
const LOCAL_FILES = [
  'index.html', 'app.js', 'styles.css', 'manifest.json', 'logo.svg', 'logo.jpg'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // Activate immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_CDN).catch(err => console.log('CDN cache failed', err));
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => {
          console.log('[SW] Deleting old cache:', key);
          return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim(); // Take control of all tabs immediately
});

self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Never intercept Firebase or Google API calls
  if (url.includes('firebasedatabase') || url.includes('googleapis.com')) return;

  // CDN assets: cache-first (they never change)
  if (url.includes('cdn.jsdelivr.net') || url.includes('fonts.googleapis') || url.includes('fonts.gstatic') || url.includes('cdnjs')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          if (res && (res.status === 200 || res.status === 0)) {
            caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
          }
          return res;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // LOCAL files: NETWORK-FIRST — always try to get latest from server
  // Falls back to cache only if completely offline
  event.respondWith(
    fetch(event.request).then(networkRes => {
      if (networkRes && networkRes.status === 200) {
        // Update cache with fresh copy
        caches.open(CACHE_NAME).then(c => c.put(event.request, networkRes.clone()));
      }
      return networkRes;
    }).catch(() => {
      // Offline fallback
      return caches.match(event.request).then(c => c || caches.match('./index.html'));
    })
  );
});
