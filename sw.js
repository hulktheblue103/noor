importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const CACHE = 'noor-v4';

firebase.initializeApp({
  apiKey: "AIzaSyDa5CZg-6-ov2engEJiOwaLeOi3kVDS3g4",
  authDomain: "noor-6efb3.firebaseapp.com",
  projectId: "noor-6efb3",
  storageBucket: "noor-6efb3.firebasestorage.app",
  messagingSenderId: "881911652427",
  appId: "1:881911652427:web:ecd82b9fe0040bbebcedce"
});

const messaging = firebase.messaging();

// Handle background push notifications
messaging.onBackgroundMessage(payload => {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || 'Noor — Fasting Reminder', {
    body: body || 'Ayyam al-Bid fasting day is coming. May Allah accept your fast.',
    icon: icon || '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'noor-fast-reminder',
    data: { url: self.location.origin }
  });
});

// Open app when notification is clicked
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const client of list) {
        if (client.url === self.location.origin && 'focus' in client) return client.focus();
      }
      return clients.openWindow(self.location.origin);
    })
  );
});

// Cache + offline
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/'])));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached =>
      cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
    )
  );
});
