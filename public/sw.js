self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'VidaQuest', body: 'Tenés un recordatorio pendiente.' };
  event.waitUntil(self.registration.showNotification(data.title || 'VidaQuest', {
    body: data.body,
    icon: data.icon || '/favicon.svg',
    badge: data.badge || '/favicon.svg',
    tag: data.tag,
    renotify: data.renotify || false,
    requireInteraction: data.requireInteraction || false,
    vibrate: data.vibrate || [80, 40, 80],
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
