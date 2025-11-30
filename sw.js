const CACHE_NAME = 'ramadan-app-v1.5';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png'
];

// Firebase Messaging VAPID Key
const VAPID_PUBLIC_KEY = 'BLPjbt6CQz6DFn39RQbdSDaM_AzXyWCJEaC4gWnGpBt9fyTpWeDYWN3fdQtFK6EzTN4CNfp87V_FcjH51S7xVFU';

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
      .catch(function(error) {
        console.log('Service Worker: Ошибка кэширования', error);
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
      event.request.url.includes('api.aladhan.com') ||
      event.request.url.includes('everyayah.com') ||
      event.request.url.includes('firebase') ||
      event.request.url.includes('googleapis')) {
    return;
  }

  // Пропускаем запросы не GET
  if (event.request.method !== 'GET') {
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
        }).catch(function() {
          // Если файл не найден и нет в кэше, возвращаем заглушку для index.html
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      }
    )
  );
});

// Обработка push-уведомлений - УЛУЧШЕННАЯ ВЕРСИЯ С FIREBASE
self.addEventListener('push', function(event) {
  console.log('Push notification received', event);
  
  if (!event.data) {
    console.log('Push event but no data');
    return;
  }

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    console.log('Push data is not JSON, using text');
    data = {
      title: 'Путь к Рамадану',
      body: event.data.text(),
      icon: './icons/icon-192.png',
      badge: './icons/icon-72.png'
    };
  }

  const options = {
    body: data.body || 'Новое уведомление',
    icon: data.icon || './icons/icon-192.png',
    badge: data.badge || './icons/icon-72.png',
    vibrate: [200, 100, 200, 100, 200], // Более заметная вибрация
    tag: data.tag || 'ramadan-notification',
    requireInteraction: true, // Требует взаимодействия пользователя
    silent: false,
    data: {
      url: data.url || './',
      timestamp: Date.now(),
      primaryKey: '2'
    },
    actions: [
      {
        action: 'open',
        title: 'Открыть приложение',
        icon: './icons/icon-72.png'
      },
      {
        action: 'dismiss',
        title: 'Закрыть',
        icon: './icons/icon-72.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Путь к Рамадану', options)
      .then(() => console.log('Notification shown successfully'))
      .catch(err => console.error('Error showing notification:', err))
  );
});

// Обработка кликов по уведомлениям - УЛУЧШЕННАЯ ВЕРСИЯ
self.addEventListener('notificationclick', function(event) {
  console.log('Notification click received:', event.action);
  
  event.notification.close();

  if (event.action === 'open' || event.action === 'explore') {
    event.waitUntil(
      clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      }).then(function(clientList) {
        // Проверяем, открыто ли уже приложение
        for (let i = 0; i < clientList.length; i++) {
          let client = clientList[i];
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            console.log('Focusing existing client');
            return client.focus();
          }
        }
        
        // Если приложение не открыто, открываем новое окно
        if (clients.openWindow) {
          console.log('Opening new window');
          return clients.openWindow(event.notification.data.url || './');
        }
      })
    );
  } else if (event.action === 'dismiss' || event.action === 'close') {
    console.log('Notification dismissed');
    // Просто закрываем уведомление
  } else {
    // Клик по самому уведомлению (не по кнопке)
    event.waitUntil(
      clients.openWindow(event.notification.data.url || './')
    );
  }
});

// Обработка закрытия уведомлений
self.addEventListener('notificationclose', function(event) {
  console.log('Notification closed:', event.notification.tag);
});

// Обработка сообщений от основного приложения
self.addEventListener('message', function(event) {
  console.log('Message received in service worker:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({
      version: CACHE_NAME,
      timestamp: Date.now()
    });
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then(function(cache) {
          return cache.addAll(event.data.urls);
        })
        .then(function() {
          event.ports[0].postMessage({success: true});
        })
        .catch(function(error) {
          event.ports[0].postMessage({success: false, error: error.message});
        })
    );
  }

  // Обработка сообщений для Firebase Messaging
  if (event.data && event.data.type === 'FIREBASE_MESSAGING') {
    handleFirebaseMessage(event.data);
  }
});

// Обработка сообщений Firebase
function handleFirebaseMessage(data) {
  console.log('Firebase message in service worker:', data);
  
  if (data.action === 'BACKGROUND_MESSAGE') {
    // Обработка фоновых сообщений Firebase
    const notificationOptions = {
      body: data.body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-72.png',
      tag: 'firebase-notification',
      requireInteraction: true,
      data: {
        url: data.url || './',
        timestamp: Date.now()
      }
    };

    self.registration.showNotification(data.title || 'Путь к Рамадану', notificationOptions);
  }
}

// Фоновая синхронизация для обновления данных
self.addEventListener('sync', function(event) {
  console.log('Background sync:', event.tag);
  
  if (event.tag === 'update-prayer-times') {
    event.waitUntil(
      updatePrayerTimes()
    );
  }

  if (event.tag === 'update-quran-data') {
    event.waitUntil(
      updateQuranData()
    );
  }
});

// Функция для обновления времени намазов в фоне
function updatePrayerTimes() {
  return fetch('https://api.aladhan.com/v1/timings/' + Math.floor(Date.now()/1000) + '?latitude=42.98&longitude=47.50&method=2')
    .then(response => response.json())
    .then(data => {
      console.log('Prayer times updated in background');
      // Можно сохранить данные в IndexedDB или отправить сообщение в основное приложение
      return self.registration.showNotification('Время намазов обновлено', {
        body: 'Актуальные времена намазов загружены',
        icon: './icons/icon-192.png',
        tag: 'prayer-update'
      });
    })
    .catch(error => {
      console.error('Error updating prayer times:', error);
    });
}

// Функция для обновления данных Корана в фоне
function updateQuranData() {
  return fetch('https://api.alquran.cloud/v1/surah')
    .then(response => response.json())
    .then(data => {
      console.log('Quran data updated in background');
      return self.registration.showNotification('Данные Корана обновлены', {
        body: 'Актуальные данные Корана загружены',
        icon: './icons/icon-192.png',
        tag: 'quran-update'
      });
    })
    .catch(error => {
      console.error('Error updating Quran data:', error);
    });
}

// Периодическая фоновая синхронизация (для браузеров, которые поддерживают)
self.addEventListener('periodicsync', function(event) {
  if (event.tag === 'update-content') {
    console.log('Periodic background sync');
    event.waitUntil(updateAppContent());
  }
});

function updateAppContent() {
  // Здесь можно обновлять контент приложения в фоне
  return Promise.all([
    updatePrayerTimes(),
    updateQuranData()
    // Добавьте другие функции обновления по необходимости
  ]);
}

// Обработка ошибок Service Worker
self.addEventListener('error', function(event) {
  console.error('Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', function(event) {
  console.error('Service Worker unhandled rejection:', event.reason);
});
