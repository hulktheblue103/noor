importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const CACHE = 'noor-v5';

firebase.initializeApp({
  apiKey: "AIzaSyDa5CZg-6-ov2engEJiOwaLeOi3kVDS3g4",
  authDomain: "noor-6efb3.firebaseapp.com",
  projectId: "noor-6efb3",
  storageBucket: "noor-6efb3.firebasestorage.app",
  messagingSenderId: "881911652427",
  appId: "1:881911652427:web:ecd82b9fe0040bbebcedce"
});

const messaging = firebase.messaging();

// ─── Background push notifications ───────────────────────────────────────────
messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || 'Noor ✦ Fasting Reminder';
  const body = payload.notification?.body || 'An Ayyam al-Bid fasting day is coming.';
  self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'noor-reminder',
    data: { url: self.location.origin }
  });
});

// ─── Notification click → open app ───────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(self.location.origin);
    })
  );
});

// ─── Offline caching ──────────────────────────────────────────────────────────
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
  // Only cache GET requests, skip Firebase/external calls
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('firestore.googleapis.com')) return;
  if (e.request.url.includes('firebase')) return;

  e.respondWith(
    caches.match(e.request).then(cached =>
      cached || fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
    )
  );
});
