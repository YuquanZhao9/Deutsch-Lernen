// 页面和同步脚本：联网时总是取最新版（网络优先），断网时用缓存。图标：缓存优先。不碰 /api/。
const CACHE = 'beishu-v5';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png', '../konto/sync.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('beishu-v') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url), scope = new URL('./', self.registration.scope).pathname;
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/api/')) return;
  const isCode = e.request.mode === 'navigate' || u.pathname === scope || u.pathname.endsWith('.html') || u.pathname.endsWith('/konto/sync.js') || u.pathname.endsWith('.webmanifest');
  if (!u.pathname.startsWith(scope) && !u.pathname.endsWith('/konto/sync.js')) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    if (isCode) {
      try {
        const r = await fetch(e.request, { cache: 'no-store' });
        if (r.ok) c.put(e.request, r.clone());
        return r;
      } catch (err) { return (await c.match(e.request, { ignoreSearch: true })) || (await c.match('./')) || Response.error(); }
    }
    const hit = await c.match(e.request, { ignoreSearch: true });
    return hit || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; });
  }));
});
