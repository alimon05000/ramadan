const CACHE_NAME = 'ramadan-app-v1.2';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-72.png',
  '/icons/icon-96.png',
  '/icons/icon-128.png',
  '/icons/icon-144.png',
  '/icons/icon-152.png',
  '/icons/icon-192.png',
  '/icons/icon-384.png',
  '/icons/icon-512.png'
];

// Установка Service Worker
self.addEventListener('install', function(event) {
  console.log('Service Worker: Установлен');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('Service Worker: Кэширование файлов');
        return cache.addAll(urlsToCache);
      })
      .then(function() {
        console.log('Service Worker: Все файлы закэшированы');
        return self.skipWaiting();
      })
  );
});

// Активация Service Worker
self.addEventListener('activate', function(event) {
  console.log('Service Worker: Активирован');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Удаление старого кэша', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function() {
      console.log('Service Worker: Активация завершена');
      return self.clients.claim();
    })
  );
});

// Перехват запросов
self.addEventListener('fetch', function(event) {
  // Пропускаем запросы к API
  if (event.request.url.includes('api.alquran.cloud') || 
      event.request.url.includes('api.aladhan.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // Возвращаем кэшированную версию или загружаем новую
        if (response) {
          return response;
        }
        
        return fetch(event.request).then(function(response) {
          // Проверяем валидность ответа
          if(!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Клонируем ответ
          var responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then(function(cache) {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      }
    )
  );
});

// Обработка push-уведомлений
self.addEventListener('push', function(event) {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '2'
    },
    actions: [
      {
        action: 'explore',
        title: 'Открыть',
        icon: '/icons/icon-72.png'
      },
      {
        action: 'close',
        title: 'Закрыть',
        icon: '/icons/icon-72.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Обработка кликов по уведомлениям
self.addEventListener('notificationclick', function(event) {
  console.log('Notification click received.');
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Обработка сообщений от основного приложения
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
