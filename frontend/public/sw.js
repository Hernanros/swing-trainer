const CACHE_NAME = 'swingtrainer-v10'
const STATIC_ASSETS = ['/manifest.json']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => clients.forEach((c) => c.navigate(c.url)))
  )
})

self.addEventListener('fetch', (event) => {
  if (
    event.request.url.includes('/api/') ||
    event.request.url.includes('/auth/')
  ) {
    return
  }
  event.respondWith(
    caches.match(event.request).then(
      (cached) => cached || fetch(event.request).catch(
        () => new Response('Offline', { status: 503, statusText: 'Service Unavailable' })
      )
    )
  )
})
