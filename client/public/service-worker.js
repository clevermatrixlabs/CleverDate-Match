// Tim Clever Date - Service Worker
const CACHE_NAME = 'tim-clever-date-v1';

// Assets to cache for offline use
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/logo192.png',
  '/logo512.png'
];

// Install service worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching files');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate service worker
self.addEventListener('activate', (event) => {
  // Clean up old caches
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache');
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Fetch event - serve cached content or fetch from network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    // Try network first, then cache
    fetch(event.request)
      .then(response => {
        // Clone the response to store in cache
        const responseClone = response.clone();
        
        // Open cache and store response
        caches.open(CACHE_NAME)
          .then(cache => {
            // Only cache same-origin requests
            if (event.request.url.startsWith(self.location.origin)) {
              cache.put(event.request, responseClone);
            }
          });
        
        return response;
      })
      .catch(() => {
        // If network fails, try to serve from cache
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }

            // For navigation requests (HTML pages), return the offline page
            if (event.request.mode === 'navigate') {
              return caches.match('/');
            }
            
            // Otherwise, return a 404-like response
            return new Response('Network error occurred', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain'
              })
            });
          });
      })
  );
});