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
var BUILD='20290929';          /* 静态资源缓存版本号：改了 css/js 就 +1，强制缓存取新 */

/* 注册 Service Worker（GH Pages 无法自定义缓存头，用 SW 做缓存控制）。
   页面在 /html/，SW 在站点根 /sw.js：相对路径 ../sw.js，scope 为全站根目录。 */
if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
  (function(){
    function reg(){ try{ navigator.serviceWorker.register('../sw.js',{scope:'/'}); }catch(e){} }
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(reg,1200); });
    else setTimeout(reg,1200);
  })();
}

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

/* 后台预取：小并发（limit=3）逐批拉取，避免串行拖慢启动，也不打爆连接数 */
function preloadAll(done){
  done = done || function(){};
  if(!('caches' in window)){ done(); return; }
  var urls=allUrls(), i=0, pending=0, finished=false;
  var CONC=3;
  caches.open(CACHE).then(function(cache){
    function fire(){
      if(finished) return;
      while(pending<CONC && i<urls.length){
        var u=urls[i++]; pending++;
        cache.match(u).then(function(hit){
          if(hit){ pending--; maybeDone(); fire(); return; }
          fetch(u).then(function(res){
            if(res&&res.ok){ try{ cache.put(u,res); }catch(e){} }
            pending--; maybeDone(); fire();
          }).catch(function(){ pending--; maybeDone(); fire(); });
        }).catch(function(){ pending--; maybeDone(); fire(); });
      }
    }
    function maybeDone(){ if(!finished && i>=urls.length && pending===0){ finished=true; done(); } }
    fire();
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