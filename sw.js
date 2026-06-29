/* Сторож — PWA service worker.
   Полный офлайн: оболочка кешируется при установке и отдаётся из кеша
   (cache-first). Сеть нужна только для первого открытия и обновления версии.
   Все пути относительные — работает и из корня домена, и из подпапки
   project-страницы GitHub Pages. */

const VERSION = 'ps-shell-v9';

const SHELL = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      // addAll падает целиком из-за одного файла — добавляем по одному.
      Promise.all(SHELL.map((url) =>
        cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const OFFLINE_HTML = '<!doctype html><meta charset="utf-8"><title>офлайн</title>' +
  '<body style="font-family:Georgia,serif;background:#F4F1EA;color:#2B2722;padding:2rem;line-height:1.5">' +
  'Нет сети и нет кэша. Открой приложение один раз онлайн — дальше оно работает офлайн.';

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // чужих доменов нет — приложение самодостаточно

  // Навигация: сеть-первой (чтобы свежий index приходил при обновлениях), офлайн —
  // кешированная оболочка; если её нет — понятная офлайн-заглушка вместо ошибки.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put('./index.html', copy));
        return res;
      }).catch(() =>
        caches.match('./index.html')
          .then((c) => c || caches.match('./'))
          .then((c) => c || new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
      )
    );
    return;
  }

  // Прочее: stale-while-revalidate — мгновенно из кэша, в фоне обновляем кэш, чтобы
  // следующий заход получил свежие файлы даже без смены VERSION (нет вечного залипания).
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

// Разрешаем приложению просить sw обновиться (нудж «доступно обновление — перезагрузи»).
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// Клик по уведомлению — фокусируем уже открытую вкладку или открываем приложение.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});

// Периодическая фоновая синхронизация (только установленные Chromium-PWA; мягкая деградация).
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'checkin') {
    event.waitUntil(self.registration.showNotification('А не прокрастинируешь ли ты, братец?', {
      body: 'Быстрый аудит: что ты сейчас делаешь — и то ли это самое?',
      tag: 'ps-checkin', icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png',
    }));
  }
});
