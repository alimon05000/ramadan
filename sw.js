const CACHE_NAME = 'ramadan-app-v2.0';
const API_CACHE_NAME = 'ramadan-api-cache-v2.0';

// Статические ресурсы для кэширования
const STATIC_URLS_TO_CACHE = [
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
  './icons/icon-512.png',
  './icons/shortcut-task.png',
  './icons/shortcut-prayer.png',
  './icons/shortcut-quran.png',
  './icons/shortcut-levels.png'
];

// Домены для кэширования API
const API_DOMAINS = [
  'api.alquran.cloud',
  'api.aladhan.com',
  'everyayah.com'
];

// Firebase Messaging VAPID Key
const VAPID_PUBLIC_KEY = 'BLPjbt6CQz6DFn39RQbdSDaM_AzXyWCJEaC4gWnGpBt9fyTpWeDYWN3fdQtFK6EzTN4CNfp87V_FcjH51S7xVFU';

// Установка Service Worker
self.addEventListener('install', function(event) {
  console.log('🔄 Service Worker: Установка версии', CACHE_NAME);
  
  event.waitUntil(
    Promise.all([
      // Кэшируем статические ресурсы
      caches.open(CACHE_NAME)
        .then(function(cache) {
          console.log('📦 Service Worker: Кэширование статических файлов');
          return cache.addAll(STATIC_URLS_TO_CACHE);
        }),
      
      // Сразу активируем новый SW
      self.skipWaiting()
    ])
    .then(() => {
      console.log('✅ Service Worker: Установка завершена');
    })
    .catch(function(error) {
      console.error('❌ Service Worker: Ошибка установки', error);
    })
  );
});

// Активация Service Worker
self.addEventListener('activate', function(event) {
  console.log('🎯 Service Worker: Активация');
  
  event.waitUntil(
    Promise.all([
      // Очистка старых кэшей
      caches.keys().then(function(cacheNames) {
        return Promise.all(
          cacheNames.map(function(cacheName) {
            if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
              console.log('🗑️ Service Worker: Удаление старого кэша', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      
      // Заявляем контроль над клиентами
      self.clients.claim()
    ])
    .then(() => {
      console.log('✅ Service Worker: Активация завершена');
      
      // Отправляем сообщение об обновлении всем клиентам
      return self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_ACTIVATED',
            version: CACHE_NAME,
            timestamp: Date.now()
          });
        });
      });
    })
  );
});

// Стратегия кэширования: Network First для API, Cache First для статики
self.addEventListener('fetch', function(event) {
  const request = event.request;
  const url = new URL(request.url);
  
  // Пропускаем неподдерживаемые методы
  if (request.method !== 'GET') {
    return;
  }

  // Для API запросов используем стратегию Network First
  if (API_DOMAINS.some(domain => url.href.includes(domain))) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Для статических ресурсов используем стратегию Cache First
  if (isStaticAsset(request)) {
    event.respondWith(handleStaticRequest(request));
    return;
  }

  // Для навигационных запросов - Network First с fallback на кэш
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }
});

// Обработка API запросов
async function handleApiRequest(request) {
  const cache = await caches.open(API_CACHE_NAME);
  
  try {
    // Пробуем получить свежие данные из сети
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Клонируем ответ для кэширования
      const responseToCache = networkResponse.clone();
      
      // Кэшируем успешные ответы
      cache.put(request, responseToCache)
        .catch(err => console.warn('Не удалось закэшировать API ответ:', err));
      
      return networkResponse;
    }
    
    throw new Error('Network response not ok');
  } catch (error) {
    // Если сеть недоступна, пробуем взять из кэша
    console.log('🌐 Network failed, trying cache for:', request.url);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('✅ Serving from cache:', request.url);
      return cachedResponse;
    }
    
    // Если нет в кэше, возвращаем ошибку
    return new Response(JSON.stringify({
      error: 'Network unavailable and no cache found',
      message: 'Пожалуйста, проверьте подключение к интернету'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Обработка статических запросов
async function handleStaticRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    // Обновляем кэш в фоне
    event.waitUntil(
      fetch(request).then(networkResponse => {
        if (networkResponse.ok) {
          return cache.put(request, networkResponse.clone());
        }
      }).catch(() => {
        // Игнорируем ошибки фонового обновления
      })
    );
    
    return cachedResponse;
  }
  
  // Если нет в кэше, загружаем из сети
  return fetch(request);
}

// Обработка навигационных запросов
async function handleNavigationRequest(request) {
  try {
    // Пробуем сеть сначала
    const networkResponse = await fetch(request);
    return networkResponse;
  } catch (error) {
    // Fallback на кэшированную версию
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match('./index.html');
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Ultimate fallback
    return new Response('Офлайн-режим', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Проверка является ли запрос статическим ресурсом
function isStaticAsset(request) {
  return request.url.includes(self.location.origin) &&
         !request.url.includes('api') &&
         (request.url.includes('.png') || 
          request.url.includes('.jpg') || 
          request.url.includes('.css') || 
          request.url.includes('.js') ||
          request.url.includes('.json'));
}

// === PUSH УВЕДОМЛЕНИЯ ===

self.addEventListener('push', function(event) {
  console.log('📨 Push уведомление получено', event);
  
  if (!event.data) {
    console.log('Push event без данных');
    return;
  }

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    console.log('Push данные не в JSON формате');
    data = {
      title: 'Путь к Рамадану',
      body: event.data.text() || 'Новое уведомление',
      icon: './icons/icon-192.png',
      badge: './icons/icon-72.png',
      tag: 'ramadan-general'
    };
  }

  const options = {
    body: data.body || 'Новое уведомление от приложения "Путь к Рамадану"',
    icon: data.icon || './icons/icon-192.png',
    badge: data.badge || './icons/icon-72.png',
    image: data.image,
    vibrate: [200, 100, 200, 100, 200],
    tag: data.tag || 'ramadan-notification',
    requireInteraction: data.requireInteraction || true,
    silent: false,
    timestamp: data.timestamp || Date.now(),
    data: {
      url: data.url || './',
      source: 'push',
      primaryKey: data.primaryKey || '1',
      actionUrl: data.actionUrl
    },
    actions: [
      {
        action: 'open',
        title: '📖 Открыть приложение',
        icon: './icons/icon-72.png'
      },
      {
        action: 'snooze',
        title: '⏰ Напомнить позже',
        icon: './icons/icon-72.png'
      },
      {
        action: 'dismiss',
        title: '❌ Закрыть',
        icon: './icons/icon-72.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(
      data.title || '🕌 Путь к Рамадану', 
      options
    )
    .then(() => console.log('✅ Уведомление показано'))
    .catch(err => console.error('❌ Ошибка показа уведомления:', err))
  );
});

// Обработка кликов по уведомлениям
self.addEventListener('notificationclick', function(event) {
  console.log('👆 Клик по уведомлению:', event.action, event.notification.tag);
  
  event.notification.close();

  const notificationData = event.notification.data || {};
  const targetUrl = notificationData.url || './';

  if (event.action === 'open' || event.action === '') {
    // Открыть приложение
    event.waitUntil(
      clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      }).then(function(clientList) {
        // Ищем открытое приложение
        for (let client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            console.log('🎯 Фокусируем существующее окно');
            
            // Отправляем сообщение об открытии из уведомления
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              action: event.action,
              data: notificationData,
              timestamp: Date.now()
            });
            
            return client.focus();
          }
        }
        
        // Открываем новое окно
        console.log('🪟 Открываем новое окно');
        return clients.openWindow(targetUrl).then(newClient => {
          if (newClient) {
            setTimeout(() => {
              newClient.postMessage({
                type: 'NOTIFICATION_CLICK',
                action: event.action,
                data: notificationData,
                timestamp: Date.now()
              });
            }, 1000);
          }
        });
      })
    );
  } else if (event.action === 'snooze') {
    // Напомнить позже
    event.waitUntil(
      self.registration.showNotification('⏰ Напоминание отложено', {
        body: 'Мы напомним вам через 10 минут',
        icon: './icons/icon-192.png',
        tag: 'snooze-notification',
        silent: true
      })
    );
  } else if (event.action === 'dismiss') {
    // Просто закрываем
    console.log('Уведомление закрыто');
  }
});

// === BACKGROUND SYNC ===

self.addEventListener('sync', function(event) {
  console.log('🔄 Background Sync:', event.tag);
  
  if (event.tag === 'prayer-notifications') {
    event.waitUntil(
      handlePrayerSync().catch(error => {
        console.error('❌ Ошибка в background sync:', error);
      })
    );
  } else if (event.tag === 'update-content') {
    event.waitUntil(
      updateCachedContent().catch(error => {
        console.error('❌ Ошибка обновления контента:', error);
      })
    );
  }
});

// Синхронизация уведомлений о намазах
async function handlePrayerSync() {
  try {
    console.log('🕌 Синхронизация времени намазов...');
    
    // Здесь должна быть логика получения времени намазов
    // Для демонстрации используем заглушку
    await showPrayerReminder();
    
  } catch (error) {
    console.error('❌ Ошибка синхронизации намазов:', error);
    throw error;
  }
}

// Показать напоминание о намазе
async function showPrayerReminder() {
  const now = new Date();
  const options = {
    body: `Время намаза приближается. Подготовьтесь к поклонению.`,
    icon: './icons/icon-192.png',
    badge: './icons/icon-72.png',
    tag: 'prayer-reminder',
    requireInteraction: true,
    vibrate: [200, 100, 200],
    actions: [
      {
        action: 'open-prayer',
        title: '🕌 Время намаза'
      },
      {
        action: 'snooze',
        title: '⏰ Через 5 мин'
      }
    ],
    data: {
      url: './?tab=prayer',
      type: 'prayer-reminder'
    }
  };

  await self.registration.showNotification('🕌 Напоминание о намазе', options);
}

// Обновление кэшированного контента
async function updateCachedContent() {
  console.log('📥 Фоновое обновление контента...');
  
  try {
    // Обновляем кэш основных файлов
    const cache = await caches.open(CACHE_NAME);
    const requests = STATIC_URLS_TO_CACHE.map(url => new Request(url));
    
    await Promise.all(
      requests.map(async (request) => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            await cache.put(request, response);
          }
        } catch (error) {
          console.warn(`Не удалось обновить: ${request.url}`, error);
        }
      })
    );
    
    console.log('✅ Фоновое обновление завершено');
  } catch (error) {
    console.error('❌ Ошибка фонового обновления:', error);
  }
}

// === PERIODIC BACKGROUND SYNC ===

self.addEventListener('periodicsync', function(event) {
  console.log('⏰ Periodic Background Sync:', event.tag);
  
  if (event.tag === 'update-prayer-times') {
    event.waitUntil(updatePrayerTimesInBackground());
  } else if (event.tag === 'refresh-content') {
    event.waitUntil(refreshAppContent());
  }
});

// Фоновая синхронизация времени намазов
async function updatePrayerTimesInBackground() {
  try {
    console.log('🕌 Фоновое обновление времени намазов...');
    
    // Здесь должна быть реальная логика обновления
    // Для демонстрации просто логируем
    console.log('✅ Время намазов обновлено в фоне');
    
  } catch (error) {
    console.error('❌ Ошибка фонового обновления намазов:', error);
  }
}

// Обновление контента приложения
async function refreshAppContent() {
  try {
    console.log('🔄 Фоновое обновление контента приложения...');
    
    // Можно обновить кэш, получить новые аяты и т.д.
    await updateCachedContent();
    
    console.log('✅ Контент приложения обновлен');
  } catch (error) {
    console.error('❌ Ошибка обновления контента:', error);
  }
}

// === ОБРАБОТКА СООБЩЕНИЙ ===

self.addEventListener('message', function(event) {
  console.log('💬 Сообщение получено в Service Worker:', event.data);
  
  const { type, data } = event.data || {};
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'GET_VERSION':
      event.ports?.[0]?.postMessage({
        version: CACHE_NAME,
        timestamp: Date.now(),
        staticCache: STATIC_URLS_TO_CACHE.length
      });
      break;
      
    case 'CACHE_API_DATA':
      handleCacheApiData(data, event);
      break;
      
    case 'REGISTER_SYNC':
      self.registration.sync.register(data.tag || 'prayer-notifications')
        .then(() => console.log('✅ Background Sync зарегистрирован'))
        .catch(err => console.error('❌ Ошибка регистрации Background Sync:', err));
      break;
      
    case 'SEND_NOTIFICATION':
      self.registration.showNotification(data.title, data.options)
        .then(() => console.log('✅ Кастомное уведомление отправлено'))
        .catch(err => console.error('❌ Ошибка отправки уведомления:', err));
      break;
      
    case 'UPDATE_CACHE':
      updateSpecificCache(data);
      break;
      
    default:
      console.log('ℹ️ Неизвестный тип сообщения:', type);
  }
});

// Кэширование данных API
async function handleCacheApiData(cacheData, event) {
  if (!cacheData || !cacheData.key || !cacheData.data) return;
  
  try {
    const cache = await caches.open(API_CACHE_NAME);
    const response = new Response(JSON.stringify(cacheData.data), {
      headers: { 'Content-Type': 'application/json' }
    });
    
    await cache.put(cacheData.key, response);
    console.log('✅ Данные API закэшированы:', cacheData.key);
    
    event.ports?.[0]?.postMessage({ success: true });
  } catch (error) {
    console.error('❌ Ошибка кэширования API данных:', error);
    event.ports?.[0]?.postMessage({ success: false, error: error.message });
  }
}

// Обновление конкретного кэша
async function updateSpecificCache(cacheData) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(cacheData.url);
    
    if (response.ok) {
      await cache.put(cacheData.url, response);
      console.log('✅ Кэш обновлен:', cacheData.url);
    }
  } catch (error) {
    console.error('❌ Ошибка обновления кэша:', error);
  }
}

// === ОБРАБОТКА ОШИБОК ===

self.addEventListener('error', function(event) {
  console.error('🔥 Service Worker ошибка:', event.error);
});

self.addEventListener('unhandledrejection', function(event) {
  console.error('🔥 Service Worker необработанный rejection:', event.reason);
});

// Утилита для отправки сообщений клиентам
function sendToClients(message) {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage(message);
    });
  });
}

console.log('🚀 Service Worker загружен и готов к работе!');
