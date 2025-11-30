const CACHE_NAME = 'ramadan-app-v1.6';
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

// === ВАЖНО: Background Sync для работы при выключенном экране ===
self.addEventListener('sync', function(event) {
  console.log('Background Sync event:', event.tag);
  
  if (event.tag === 'prayer-notifications') {
    event.waitUntil(
      schedulePrayerNotifications().catch(error => {
        console.error('Error in background sync:', error);
      })
    );
  }
});

// Фоновая синхронизация для уведомлений о намазах
async function schedulePrayerNotifications() {
  try {
    const prayerTimes = await getPrayerTimes();
    const now = new Date();
    
    for (const prayer of prayerTimes) {
      const prayerTime = parseTimeString(prayer.time);
      const timeDiff = prayerTime - now;
      
      // Если намаз в течение следующих 30 минут
      if (timeDiff > 0 && timeDiff <= 30 * 60 * 1000) {
        await self.registration.showNotification('Напоминание о намазе', {
          body: `До намаза ${prayer.name} осталось ${Math.round(timeDiff / 60000)} минут`,
          icon: './icons/icon-192.png',
          badge: './icons/icon-72.png',
          tag: `prayer-${prayer.name}`,
          requireInteraction: true,
          vibrate: [200, 100, 200],
          actions: [
            {
              action: 'snooze',
              title: 'Напомнить позже'
            },
            {
              action: 'dismiss',
              title: 'Закрыть'
            }
          ]
        });
      }
    }
  } catch (error) {
    console.error('Error scheduling prayer notifications:', error);
  }
}

// Получение времен намазов
async function getPrayerTimes() {
  // В реальном приложении здесь должен быть запрос к API
  // Для демонстрации используем фиксированные времена
  return [
    { name: 'Фаджр', time: '05:30' },
    { name: 'Восход', time: '07:00' },
    { name: 'Зухр', time: '12:00' },
    { name: 'Аср', time: '15:30' },
    { name: 'Магриб', time: '18:00' },
    { name: 'Иша', time: '19:30' }
  ];
}

// Парсинг времени из строки
function parseTimeString(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const now = new Date();
  const prayerTime = new Date(now);
  prayerTime.setHours(hours, minutes, 0, 0);
  
  // Если время уже прошло сегодня, планируем на завтра
  if (prayerTime < now) {
    prayerTime.setDate(prayerTime.getDate() + 1);
  }
  
  return prayerTime;
}

// Обработка push-уведомлений - УЛУЧШЕННАЯ ВЕРСИЯ ДЛЯ ФОНОВОГО РЕЖИМА
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
    vibrate: [200, 100, 200, 100, 200],
    tag: data.tag || 'ramadan-notification',
    requireInteraction: true,
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

// Обработка кликов по уведомлениям
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
  } else if (event.action === 'snooze') {
    // Напомнить позже
    event.waitUntil(
      self.registration.showNotification('Напоминание отложено', {
        body: 'Мы напомним вам через 10 минут',
        icon: './icons/icon-192.png',
        tag: 'snooze-notification'
      })
    );
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

// Периодическая фоновая синхронизация
self.addEventListener('periodicsync', function(event) {
  if (event.tag === 'update-prayer-times') {
    console.log('Periodic background sync for prayer times');
    event.waitUntil(updatePrayerTimes());
  }
});

// Функция для обновления времени намазов в фоне
async function updatePrayerTimes() {
  try {
    const response = await fetch('https://api.aladhan.com/v1/timings/' + Math.floor(Date.now()/1000) + '?latitude=42.98&longitude=47.50&method=2');
    const data = await response.json();
    
    console.log('Prayer times updated in background');
    
    // Сохраняем в IndexedDB или отправляем уведомление
    await self.registration.showNotification('Время намазов обновлено', {
      body: 'Актуальные времена намазов загружены',
      icon: './icons/icon-192.png',
      tag: 'prayer-update'
    });
    
  } catch (error) {
    console.error('Error updating prayer times:', error);
  }
}

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
  
  if (event.data && event.data.type === 'SCHEDULE_NOTIFICATIONS') {
    event.waitUntil(schedulePrayerNotifications());
  }

  // Регистрация Background Sync
  if (event.data && event.data.type === 'REGISTER_SYNC') {
    event.waitUntil(
      self.registration.sync.register('prayer-notifications')
        .then(() => console.log('Background Sync registered'))
        .catch(err => console.error('Background Sync registration failed:', err))
    );
  }
});

// Обработка ошибок Service Worker
self.addEventListener('error', function(event) {
  console.error('Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', function(event) {
  console.error('Service Worker unhandled rejection:', event.reason);
});
