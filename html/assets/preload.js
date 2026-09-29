/* ============================================================
   数据预加载与缓存模块
   · 打开网站时把「所有版本 × 所有数据文件」后台预取进 Cache API，
     之后各子页用 fetchData() 读取时优先命中缓存 → 即时预览
   · 数据在 /ace/，页面在 /html/：同源不同目录，
     Service Worker 作用域受限，故用 Cache API（同源共享）实现
   ============================================================ */
(function(){
'use strict';
var CACHE='acewiki-data-v1';

/* 版本清单（与各页一致） */
var VERSIONS=[
  {id:'29836883', dir:'../ace/29836883/'},
  {id:'29842023', dir:'../ace/29842023/'}
];

/* 每个版本的全部数据文件（不含 .json 后缀） */
var FILES=[
  'vehicles','tracks','chips','items','activities','titles',
  'street_god','season_activities','game_intro','balance_updates'
];

function allUrls(){
  var urls=[];
  VERSIONS.forEach(function(v){
    FILES.forEach(function(f){ urls.push(v.dir+f+'.json'); });
  });
  return urls;
}

/* 缓存优先读取：命中返回缓存副本；未命中则网络回源并写入缓存 */
function fetchData(url){
  if(url==null) url='';
  if('caches' in window){
    return caches.open(CACHE).then(function(cache){
      return cache.match(url).then(function(hit){
        if(hit) return hit;                       /* 缓存命中：直接返回 */
        return fetch(url).then(function(res){      /* 回源 + 归档 */
          if(res && res.ok){ try{ cache.put(url,res.clone()); }catch(e){} return res.clone(); }
          return res;
        });
      }).catch(function(){ return fetch(url); });
    }).catch(function(){ return fetch(url); });
  }
  return fetch(url);
}

/* 后台预取全部文件；逐条串行，避免并发打爆连接数 */
function preloadAll(done){
  done = done || function(){};
  if(!('caches' in window)){ done(); return; }
  var urls=allUrls(), i=0;
  caches.open(CACHE).then(function(cache){
    (function next(){
      if(i>=urls.length){ done(); return; }
      var u=urls[i++];
      cache.match(u).then(function(hit){
        if(hit) next();                            /* 已有缓存，跳过 */
        else fetch(u).then(function(res){ if(res&&res.ok){ cache.put(u,res); } next(); })
                    .catch(function(){ next(); });
      }).catch(function(){ next(); });
    })();
  }).catch(function(){ done(); });
}

/* 供页面使用 */
window.AceDataCache = {
  fetchData: fetchData,
  preloadAll: preloadAll,
  VERSIONS: VERSIONS,
  allUrls: allUrls
};
})();