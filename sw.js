// Fixed Service Worker for Calendar Calculator
const CACHE_BASE_NAME = 'calendar-calculator';
const CACHE_VERSION = 'v1.72-' + new Date().getTime();
const CACHE_NAME = CACHE_BASE_NAME + '-' + CACHE_VERSION;

const URLS_TO_CACHE = [
    './',
    './index.html',
    './i18n.js',
    './manifest.json',
    './sw.js',
    './i18n/cs.json',
    './i18n/en.json',
    './i18n/de.json',
    './i18n/fr.json',
    './i18n/es.json',
    './i18n/ru.json',
    './i18n/uk.json'
];

let isInstalled = false;
let installPromise = null;

console.log('SW: Starting with cache name:', CACHE_NAME);

// Install event - cache resources
self.addEventListener('install', function(event) {
    console.log('SW: Installing version:', CACHE_VERSION);
    
    if (installPromise) {
        event.waitUntil(installPromise);
        return;
    }
    
    installPromise = caches.open(CACHE_NAME)
        .then(function(cache) {
            console.log('SW: Opened cache:', CACHE_NAME);
            
            return Promise.allSettled(
                URLS_TO_CACHE.map(function(url) {
                    return fetch(url)
                        .then(function(response) {
                            if (response.ok) {
                                return cache.put(url, response);
                            }
                            throw new Error('Failed to fetch: ' + url);
                        })
                        .catch(function(error) {
                            console.warn('SW: Failed to cache:', url, error.message);
                            return Promise.resolve(); // Continue even if some resources fail
                        });
                })
            );
        })
        .then(function(results) {
            const successful = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;
            
            console.log(`SW: Cache creation complete. Success: ${successful}, Failed: ${failed}`);
            isInstalled = true;
            
            // Take control immediately
            return self.skipWaiting();
        })
        .catch(function(error) {
            console.error('SW: Installation failed:', error);
            return self.skipWaiting(); // Still skip waiting even on error
        });
    
    event.waitUntil(installPromise);
});

// Activate event - clean old caches and take control
self.addEventListener('activate', function(event) {
    console.log('SW: Activating...');
    
    event.waitUntil(
        Promise.all([
            // Clean old caches
            caches.keys().then(function(cacheNames) {
                return Promise.all(
                    cacheNames.map(function(cacheName) {
                        if (cacheName.startsWith(CACHE_BASE_NAME) && cacheName !== CACHE_NAME) {
                            console.log('SW: Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            // Take control of all pages
            self.clients.claim()
        ])
        .then(function() {
            console.log('SW: Activation complete - taking control');
            isInstalled = true;
            
            // Notify all clients
            return self.clients.matchAll();
        })
        .then(function(clients) {
            clients.forEach(function(client) {
                client.postMessage({
                    type: 'SW_ACTIVATED',
                    cacheName: CACHE_NAME,
                    version: CACHE_VERSION
                });
            });
            console.log('SW: Notified', clients.length, 'clients');
        })
        .catch(function(error) {
            console.error('SW: Activation error:', error);
        })
    );
});

// Fetch event - intelligent caching strategy
self.addEventListener('fetch', function(event) {
    // Only handle GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Skip non-same-origin requests
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }
    
    // Special handling for SW file itself
    if (event.request.url.includes('sw.js')) {
        event.respondWith(fetch(event.request));
        return;
    }
    
    event.respondWith(
        handleRequest(event.request)
    );
});

// Smart request handling
async function handleRequest(request) {
    try {
        // Try cache first for instant response
        const cachedResponse = await getCachedResponse(request);
        
        if (cachedResponse) {
            console.log('SW: Serving from cache:', request.url);
            
            // For HTML requests, check for updates in background
            if (isHTMLRequest(request)) {
                updateInBackground(request);
            }
            
            return cachedResponse;
        }
        
        // Not in cache - try network
        console.log('SW: Cache miss, trying network:', request.url);
        return await tryNetwork(request);
        
    } catch (error) {
        console.error('SW: Request handling failed:', error);
        return createErrorResponse();
    }
}

// Get cached response with fallback keys
async function getCachedResponse(request) {
    const cache = await caches.open(CACHE_NAME);
    
    // Try exact match first
    let response = await cache.match(request);
    if (response) return response;
    
    // Try alternative keys for HTML requests
    if (isHTMLRequest(request)) {
        const alternatives = ['./', './index.html', '/'];
        for (const alt of alternatives) {
            response = await cache.match(alt);
            if (response) return response;
        }
    }
    
    return null;
}

// Check if request is for HTML
function isHTMLRequest(request) {
    return request.destination === 'document' ||
           request.mode === 'navigate' ||
           request.url.endsWith('/') ||
           request.url.includes('index.html') ||
           (request.headers.get('accept') && 
            request.headers.get('accept').includes('text/html'));
}

// Try network with timeout
async function tryNetwork(request) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    try {
        const response = await fetch(request, {
            signal: controller.signal,
            cache: 'default'
        });
        
        clearTimeout(timeoutId);
        
        if (response && response.ok) {
            // Cache successful responses
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
            console.log('SW: Network success, cached:', request.url);
            return response;
        }
        
        throw new Error('Network response not ok');
        
    } catch (error) {
        clearTimeout(timeoutId);
        console.log('SW: Network failed:', error.message);
        
        // Return offline fallback for HTML requests
        if (isHTMLRequest(request)) {
            return createOfflineResponse();
        }
        
        throw error;
    }
}

// Update in background (non-blocking)
function updateInBackground(request) {
    // Don't run background updates too frequently
    if (self.lastBackgroundUpdate && 
        Date.now() - self.lastBackgroundUpdate < 30000) {
        return;
    }
    
    self.lastBackgroundUpdate = Date.now();
    
    fetch(request, { cache: 'no-cache' })
        .then(async function(response) {
            if (response && response.ok) {
                const newContent = await response.text();
                const cache = await caches.open(CACHE_NAME);
                const cachedResponse = await cache.match(request);
                
                if (cachedResponse) {
                    const cachedContent = await cachedResponse.text();
                    
                    if (newContent !== cachedContent) {
                        console.log('SW: Background update detected');
                        
                        // Update cache
                        await cache.put(request, new Response(newContent, {
                            headers: response.headers
                        }));
                        
                        // Notify clients
                        const clients = await self.clients.matchAll();
                        clients.forEach(function(client) {
                            client.postMessage({
                                type: 'UPDATE_AVAILABLE',
                                url: request.url
                            });
                        });
                    }
                }
            }
        })
        .catch(function(error) {
            // Silent fail for background updates
            console.log('SW: Background update failed (normal when offline)');
        });
}

// Create offline response
function createOfflineResponse() {
    const offlineHTML = `<!DOCTYPE html>
<html lang="cs">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kalendářní kalkulátor - Offline</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #8B7355 0%, #4A4A3A 100%);
            color: #F5E6D3; margin: 0; padding: 20px; min-height: 100vh;
            display: flex; align-items: center; justify-content: center; text-align: center;
        }
        .container { 
            background: rgba(0,0,0,0.3); padding: 40px; border-radius: 20px; max-width: 500px; 
        }
        h1 { margin-bottom: 20px; color: #CDBA96; }
        .status { 
            background: #f59e0b; color: white; padding: 15px 25px; border-radius: 25px; 
            margin: 20px 0; font-weight: bold; 
        }
        button { 
            background: #8B7355; color: white; border: none; padding: 15px 30px; 
            border-radius: 10px; font-size: 16px; cursor: pointer; margin: 10px; 
        }
        button:hover { background: #6B5B47; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📅 Kalendářní kalkulátor</h1>
        <div class="status">📱 Cache se načítá...</div>
        <p>Aplikace se připravuje pro offline použití.</p>
        <button onclick="window.location.reload()">🔄 Zkusit znovu</button>
    </div>
</body>
</html>`;

    return new Response(offlineHTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
}

// Create error response
function createErrorResponse() {
    return new Response('Service Worker Error', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
    });
}

// Message handling
self.addEventListener('message', function(event) {
    if (!event.data) return;
    
    console.log('SW: Message received:', event.data.type);
    
    switch (event.data.type) {
        case 'GET_CACHE_NAME':
            handleCacheNameRequest(event);
            break;
            
        case 'SKIP_WAITING':
            console.log('SW: Skipping waiting...');
            self.skipWaiting();
            break;
            
        case 'CHECK_UPDATES':
            console.log('SW: Manual update check requested');
            checkForUpdates();
            break;
            
        case 'LANGUAGE_CHANGED':
            console.log('SW: Language changed to:', event.data.language);
            // Could cache language-specific resources here
            break;
            
        default:
            console.log('SW: Unknown message type:', event.data.type);
    }
});

// Handle cache name requests
async function handleCacheNameRequest(event) {
    try {
        // Check if our cache exists
        const cacheExists = await caches.has(CACHE_NAME);
        
        if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({
                type: 'CACHE_NAME_RESPONSE',
                cacheName: CACHE_NAME,
                cacheExists: cacheExists,
                isInstalled: isInstalled
            });
        }
    } catch (error) {
        console.error('SW: Error handling cache name request:', error);
        if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({
                type: 'CACHE_NAME_RESPONSE',
                cacheName: CACHE_NAME,
                cacheExists: false,
                error: error.message
            });
        }
    }
}

// Manual update check
async function checkForUpdates() {
    try {
        const clients = await self.clients.matchAll();
        clients.forEach(function(client) {
            client.postMessage({
                type: 'UPDATE_CHECK_STARTED'
            });
        });
        
        // Check main page and key resources
        const urlsToCheck = ['./', './index.html', './i18n.js'];
        let hasUpdates = false;
        
        for (const url of urlsToCheck) {
            try {
                const response = await fetch(url, { cache: 'no-cache' });
                if (response && response.ok) {
                    const cache = await caches.open(CACHE_NAME);
                    const cachedResponse = await cache.match(url);
                    
                    if (cachedResponse) {
                        const newContent = await response.text();
                        const cachedContent = await cachedResponse.text();
                        
                        if (newContent !== cachedContent) {
                            hasUpdates = true;
                            console.log('SW: Update detected for:', url);
                            
                            // Update cache
                            await cache.put(url, new Response(newContent, {
                                headers: response.headers
                            }));
                        }
                    }
                }
            } catch (error) {
                console.warn('SW: Failed to check updates for:', url, error);
            }
        }
        
        // Notify clients about results
        clients.forEach(function(client) {
            client.postMessage({
                type: hasUpdates ? 'UPDATE_AVAILABLE' : 'NO_UPDATES',
                timestamp: Date.now()
            });
        });
        
        console.log('SW: Update check complete, hasUpdates:', hasUpdates);
        
    } catch (error) {
        console.error('SW: Update check failed:', error);
        
        // Notify about failure
        const clients = await self.clients.matchAll();
        clients.forEach(function(client) {
            client.postMessage({
                type: 'UPDATE_CHECK_FAILED',
                error: error.message
            });
        });
    }
}

// Enhanced error handling for unhandled promise rejections
self.addEventListener('unhandledrejection', function(event) {
    console.error('SW: Unhandled promise rejection:', event.reason);
    event.preventDefault();
});

// Handle client navigation
self.addEventListener('navigate', function(event) {
    console.log('SW: Navigation event:', event.request.url);
    // Could add special navigation handling here if needed
});

// Periodic background sync for updates (if supported)
self.addEventListener('sync', function(event) {
    if (event.tag === 'background-sync') {
        console.log('SW: Background sync triggered');
        event.waitUntil(checkForUpdates());
    }
});

// Handle push notifications (future expansion)
self.addEventListener('push', function(event) {
    console.log('SW: Push event received');
    // Could add push notification handling here
});

// Cleanup when SW is being terminated
self.addEventListener('beforeunload', function(event) {
    console.log('SW: Service Worker terminating');
});

// Performance monitoring
function logPerformance(operation, startTime) {
    const duration = Date.now() - startTime;
    if (duration > 1000) {
        console.warn(`SW: Slow operation - ${operation}: ${duration}ms`);
    } else {
        console.log(`SW: ${operation}: ${duration}ms`);
    }
}

// Cache statistics helper
async function getCacheStats() {
    try {
        const cache = await caches.open(CACHE_NAME);
        const keys = await cache.keys();
        const stats = {
            name: CACHE_NAME,
            entries: keys.length,
            urls: keys.map(req => req.url)
        };
        console.log('SW: Cache stats:', stats);
        return stats;
    } catch (error) {
        console.error('SW: Failed to get cache stats:', error);
        return null;
    }
}

// Expose cache stats via message
self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'GET_CACHE_STATS') {
        getCacheStats().then(function(stats) {
            if (event.ports && event.ports[0]) {
                event.ports[0].postMessage({
                    type: 'CACHE_STATS_RESPONSE',
                    stats: stats
                });
            }
        });
    }
});

console.log('SW: Script loaded and ready - version', CACHE_VERSION);