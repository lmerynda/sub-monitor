const CACHE = 'renew-shell-v1';
const SHELL = [
  '/',
  '/icon.svg',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  ...(typeof BUILD_ASSETS === 'undefined' ? [] : BUILD_ASSETS),
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  // Only cache production assets. Vite's changing dev module graph must stay fresh.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            event.waitUntil(
              caches.open(CACHE).then((cache) => cache.put('/', clone)),
            );
          }
          return response;
        })
        .catch(() => caches.match('/')),
    );
  } else if (
    url.pathname.startsWith('/assets/') ||
    SHELL.includes(url.pathname)
  ) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              event.waitUntil(
                caches
                  .open(CACHE)
                  .then((cache) => cache.put(event.request, clone)),
              );
            }
            return response;
          }),
      ),
    );
  }
});
self.addEventListener('push', (event) => {
  let data = {
    title: 'A little heads-up',
    body: 'A subscription is renewing soon.',
    tag: 'renew-reminder',
  };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    /* Show a useful fallback. */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: '/?view=reminders' },
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (clients) => {
        for (const client of clients) {
          if (new URL(client.url).origin === self.location.origin) {
            await client.navigate('/?view=reminders');
            return client.focus();
          }
        }
        return self.clients.openWindow('/?view=reminders');
      }),
  );
});
