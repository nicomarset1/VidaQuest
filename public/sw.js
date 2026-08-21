const COMPLETE_TASK_URL = 'https://xurazfrecgotkszoznab.supabase.co/functions/v1/complete-task';

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
    actions: data.actions || [],
    data: data.data || {},
  }));
});
self.addEventListener('notificationclick', (event) => {
  const payload = event.notification.data || {};

  if (event.action === 'complete-task' && payload.action === 'complete-task') {
    event.notification.close();
    event.waitUntil(
      fetch(COMPLETE_TASK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(() =>
          self.registration.showNotification('VidaQuest', {
            body: '✅ ¡Marcada como hecha!',
            icon: '/favicon.svg',
            tag: payload.taskId ? `done-${payload.taskId}` : undefined,
          })
        )
        .catch(() => {})
    );
    return;
  }

  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
