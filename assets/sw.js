// 웹앱용 서비스 워커: 항상 네트워크에서 최신 내용을 먼저 받고,
// 인터넷이 끊겼을 때만 마지막으로 본 현황판을 보여준다.
const CACHE = 'pa-dashboard-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: 'no-store' });
      if (res.ok && req.mode === 'navigate') {
        const c = await caches.open(CACHE);
        await c.put('./', res.clone());
      }
      return res;
    } catch (err) {
      const c = await caches.open(CACHE);
      return (req.mode === 'navigate' && (await c.match('./'))) || Response.error();
    }
  })());
});
