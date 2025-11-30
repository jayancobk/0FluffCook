// service-worker.js

const CACHE_NAME = '0FluffCook-v3-1-cache';

// List all core files that must be cached for the app to work offline.
const urlsToCache = [
    './', // Caches the index.html for the root URL
    'index.html',
    'script.js',
    'style.css',
    'manifest.json',
    // Add paths for icons once they are available
    // 'icons/icon-192x192.png',
    // 'icons/icon-512x512.png'
];

// --- INSTALLATION PHASE ---
// The service worker is installed when the user first visits the page.
self.addEventListener('install', (event) => {
    // Force the service worker to activate immediately
    self.skipWaiting(); 
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache and pre-caching essential files');
                return cache.addAll(urlsToCache);
            })
    );
});

// --- FETCH PHASE (Cache-First Strategy) ---
// This handles all network requests after installation.
self.addEventListener('fetch', (event) => {
    // Only cache GET requests (don't interfere with POSTs like the Gemini API call)
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Cache hit - return response from cache
                if (response) {
                    return response;
                }
                
                // Cache miss - fetch from the network
                return fetch(event.request);
            })
    );
});

// --- ACTIVATION PHASE (Cleanup Old Caches) ---
// This ensures that when we deploy a new version (by changing CACHE_NAME), 
// the old cache is deleted to prevent stale files.
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
