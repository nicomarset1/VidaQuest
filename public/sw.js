self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'VidaQuest', body: 'Tenés un recordatorio pendiente.' };
  event.waitUntil(self.registration.showNotification(data.title || 'VidaQuest', { body: data.body, icon: '/favicon.svg', badge: '/favicon.svg' }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
