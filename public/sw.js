// Service worker só pra Web Push -- não faz cache de assets nem funciona
// offline, o único trabalho dele é acordar quando chega um push (mesmo com a
// aba fechada) e mostrar a notificação nativa do SO.

self.addEventListener('push', (event) => {
  let data = { title: 'Notificação', body: '', link: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // payload sem JSON válido -- mostra só o título padrão
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: { link: data.link || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if ('focus' in client) {
          client.navigate(link);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(link);
    })
  );
});
