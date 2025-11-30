const CACHE_NAME = '0FluffCook-v3-3-cache'; // IMPORTANT: We must bump the cache again!

// List of files to cache (same as before)
const urlsToCache = [
    './',
    'index.html',
    'script.js',
    'style.css',
    'manifest.json',
    'icon.png'
];

self.addEventListener('install', (event) => {
    self.skipWaiting(); 
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    event.respondWith(
        caches.match(event.request).then((response) => response || fetch(event.request))
    );
});

self.addEventListener('activate', (event) => {
    // CRITICAL FIX: Claim control of the page immediately
    event.waitUntil(self.clients.claim()); 

    event.waitUntil(
        caches.keys().then((cacheNames) => Promise.all(
            cacheNames.map((cacheName) => {
                // If the cache name doesn't match the new one, delete the old cache
                if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
            })
        ))
    );
});
