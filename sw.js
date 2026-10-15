// ===== Service worker: działanie offline + powiadomienia push =====
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

// Pliki aplikacji zapamiętane do pracy bez internetu (listę wstawia wtyczka PWA podczas budowania)
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

// Nowa wersja aplikacji włącza się od razu po pobraniu
self.skipWaiting();
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Przychodzi powiadomienie z serwera (funkcja "push" w Supabase): pokaż je
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Moje Studia', {
    body: data.body || '',
    tag: data.tag,                 // to samo "tag" zastępuje poprzednie powiadomienie zamiast dublować
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
  }));
});

// Kliknięcie w powiadomienie: otwórz aplikację (lub przełącz się na już otwartą)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});
