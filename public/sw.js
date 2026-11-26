// Service worker for Pixel Football Manager.
// The whole app is one inlined index.html, so there is very little to cache:
// - The page: network first, so a new deploy shows up as soon as you're online.
//   Falls back to the cached copy when offline or when the network is slow.
// - Icons and the manifest: served from cache, refreshed in the background.
// - Google Fonts: cached the first time, so the game looks right offline.
// Bump VERSION to drop old caches after changing this file.
const VERSION = 'v1'
const APP = `pfm-app-${VERSION}`
const FONTS = `pfm-fonts-${VERSION}`
const SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './favicon.ico',
  './pwa-64x64.png', './pwa-192x192.png', './pwa-512x512.png', './maskable-icon-512x512.png', './apple-touch-icon-180x180.png']
const NETWORK_TIMEOUT_MS = 3000

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

/** Network first with a timeout, then the cache. Good responses refresh the cached page. */
async function page(request) {
  const cache = await caches.open(APP)
  const network = fetch(request).then((res) => {
    if (res.ok) cache.put('./index.html', res.clone())
    return res
  })
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS))
  try {
    const res = await Promise.race([network, timeout])
    if (res) return res
  } catch { /* offline: use the cache below */ }
  const cached = await cache.match('./index.html')
  return cached ?? network
}

/** Cache first, refreshed in the background. */
async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const network = fetch(request).then((res) => {
    if (res.ok || res.type === 'opaque') cache.put(request, res.clone())
    return res
  }).catch(() => cached)
  return cached ?? network
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(page(request))
  } else if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(APP, request))
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(FONTS, request))
  }
})
