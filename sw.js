/* Service worker cho VN Chart
   - Vỏ app (HTML/JS/CSS/icon/thư viện biểu đồ): cache sẵn, mở được khi mất mạng
   - data/*.json: ưu tiên mạng để luôn có dữ liệu mới, mất mạng thì dùng bản đã cache
   Mỗi lần sửa code, đổi số VERSION để máy người dùng tải bản mới. */
const VERSION = 'v1';
const SHELL_CACHE = 'vnchart-shell-' + VERSION;
const DATA_CACHE  = 'vnchart-data-' + VERSION;

const SHELL = [
  './',
  './index.html',
  './screener.js',
  './indicators.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // add từng file, một file lỗi không làm hỏng cả quá trình cài
    await Promise.all(SHELL.map(u => cache.add(u).catch(err => console.warn('[SW] không cache được', u, err))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = [SHELL_CACHE, DATA_CACHE];
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const fresh = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await fresh) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // dữ liệu giá: mạng trước, cache sau
  if (url.origin === location.origin && url.pathname.includes('/data/')) {
    e.respondWith(networkFirst(req, DATA_CACHE));
    return;
  }

  // mở trang: mạng trước, mất mạng thì dùng index.html đã cache
  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, SHELL_CACHE).catch(() => caches.match('./index.html')));
    return;
  }

  // file tĩnh còn lại (cùng domain + thư viện CDN): dùng cache ngay, âm thầm cập nhật nền
  if (url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
  }
});
