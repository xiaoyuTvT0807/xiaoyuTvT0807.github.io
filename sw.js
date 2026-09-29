/* ============================================================
   Service Worker — GitHub Pages 静态站缓存控制
   · GH Pages 无法自定义 Cache-Control 头，改用 SW 实现：
     - HTML 页面 / JSON 数据 → 网络优先，失败退回缓存(更新立即生效，且离线可读)
     - CSS/JS/图片等静态资源 → 缓存优先 + 后台静默刷新(秒开，且后台跟上新版本)
   · 每次上线前把 CACHE 版本号 +1 即可强制整体刷新
   ============================================================ */
var CACHE = 'acewiki-shell-v2';
var PRECACHE = [];

/* 安装：仅做缓存准备，不预取大体积资源 */
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

/* 激活：清掉旧版本缓存 */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE && /^acewiki-shell-/.test(k)) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* 静态资源扩展名：缓存优先 + 后台刷新 */
function isStatic(url) {
  return /\.(css|js|png|jpe?g|gif|webp|avif|svg|woff2?|ttf|eot|ico)$/i.test(url.pathname);
}
/* 页面 / 数据：网络优先 */
function isHtml(url) {
  return /\.html$/i.test(url.pathname);
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  var url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.indexOf('/__/') === 0) return;

  /* —— 网络优先：HTML / JSON 数据 —— */
  if (isHtml(url) || /\.json$/i.test(url.pathname)) {
    e.respondWith(
      fetch(req)
        .then(function (res) {
          if (res && res.ok) {
            var clone = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, clone); });
          }
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (hit) {
            if (hit) return hit;
            if (isHtml(url)) return caches.match('/html/index.html'); /* 离线兜底到外壳 */
            return caches.match(url.pathname);
          });
        })
    );
    return;
  }

  /* —— 静态资源：缓存优先，命中即回；同时后台拉新覆盖(下次生效) —— */
  if (isStatic(url)) {
    e.respondWith(
      caches.open(CACHE).then(function (cache) {
        return cache.match(req).then(function (hit) {
          var network = fetch(req).then(function (res) {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          }).catch(function () { return hit; });
          return hit || network;
        });
      })
    );
    return;
  }

  return;
});