/* ============================================================
   Service Worker 退役脚本（一次性）
   · 本项目已回归「纯 HTTP 缓存 + URL 版本号」最简方案，不再需要 SW。
   · 此脚本让已注册的旧 SW 立即退役：清空全部缓存 → 注销注册 → 刷新已开窗口。
     部署后浏览器会检测到本文件内容变更并触发更新，完成卸载；
     之后本站不再有任何 SW 控制。
   ============================================================ */
self.addEventListener('install', function (e) {
  e.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', function (e) {
  e.waitUntil(
    Promise.all([
      caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      }),
      self.registration.unregister(),
      self.clients.matchAll({ type: 'window' }).then(function (ws) {
        ws.forEach(function (w) { try { w.navigate(w.url); } catch (err) {} });
      })
    ]).catch(function () {})
  );
});
/* 不再拦截任何请求 */
self.addEventListener('fetch', function () {});
