// Audio City Service Worker
// Handles offline caching and PWA functionality
// Updated: Network-first strategy for better mobile connectivity

const CACHE_NAME = 'audio-city-v2'; // Updated version to force cache refresh
const urlsToCache = [
  '/',
  '/feed.html',
  '/discover.html',
  '/artists.html',
  '/login.html',
  '/signup.html',
  '/manifest.json'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching files');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('Service Worker: Cache failed', error);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests - let them pass through
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip ALL API requests - always use network (don't intercept)
  if (url.pathname.startsWith('/api/') || 
      url.pathname.startsWith('/auth/') ||
      event.request.url.includes('/api/') || 
      event.request.url.includes('/auth/') ||
      event.request.url.includes('workers.dev') ||
      event.request.url.includes('cloudflareworkers.com')) {
    return; // Let the request pass through to network
  }

  // Skip audio/media files - always use network
  if (event.request.url.match(/\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i)) {
    return;
  }

  // Skip JSON files that might be API responses
  if (url.pathname.endsWith('.json') && url.pathname !== '/manifest.json') {
    return;
  }

  // Skip worker.js and other worker files
  if (url.pathname.includes('worker') || url.pathname.includes('sw.js')) {
    return;
  }

  // Network-first strategy: Try network, fallback to cache
  // This prevents showing stale content when network is available
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Network request succeeded - update cache and return response
        if (response && response.status === 200 && response.type === 'basic') {
          // Only cache static assets (HTML, CSS, JS, images)
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('text/html') || 
              contentType.includes('text/css') || 
              contentType.includes('application/javascript') ||
              contentType.includes('image/')) {
            
            // Clone the response for caching
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              })
              .catch(() => {
                // Silently fail cache operations
              });
          }
        }
        
        return response;
      })
      .catch(() => {
        // Network failed - try cache as fallback
        return caches.match(event.request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            
            // No cache available - return offline page for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match('/feed.html') || caches.match('/');
            }
            
            // For other requests, return a proper error
            return new Response('Network unavailable', { 
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'text/plain' }
            });
          });
      })
  );
});

