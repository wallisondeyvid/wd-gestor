self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function openPortal(urlPath) {
  const target = urlPath || '/portal-morador/solicitacoes/servico';
  const full = new URL(target, self.location.origin).href;
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
    for (const client of clientsList) {
      if (client.url === full || client.url === full + '/' || client.url.includes(target)) {
        return client.focus();
      }
    }
    return self.clients.openWindow(full);
  });
}

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch (err) {
    try { payload = JSON.parse(event.data.text()); } catch { payload = { title: 'Portal do Morador' }; }
  }

  const title = payload?.title || 'Portal do Morador';
  const fallbackIcon = '/images/logoWDGestor.png';
  const options = {
    body: payload?.body || '',
    tag: payload?.tag || 'portal',
    data: payload?.data || {},
    icon: payload?.icon || payload?.data?.icon || fallbackIcon,
    badge: payload?.badge || payload?.data?.badge || payload?.icon || payload?.data?.icon || fallbackIcon
  };

  const notifyClients = self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((clientsList) => {
      clientsList.forEach((client) => {
        try { client.postMessage({ type: 'portal-push', payload: { title, body: options.body, tag: options.tag, data: options.data } }); } catch { /* noop */ }
      });
    });

  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    notifyClients
  ]));
});

self.addEventListener('notificationclick', (event) => {
  const url = event.notification?.data?.url || '/portal-morador/solicitacoes/servico';
  event.notification.close();
  event.waitUntil(openPortal(url));
});
