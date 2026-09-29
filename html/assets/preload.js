/* ============================================================
   数据预加载模块（无 SW / 无 Cache API 的最简方案）
   · GitHub Pages 默认响应头 Cache-Control: max-age=600：
     数据被浏览器 HTTP 缓存 10 分钟，10 分钟后自动回源 → 更新自然生效
   · 打开网站时小并发预取所有数据 → 预热浏览器 HTTP 缓存，
     之后各子页用 fetchData() 读取时命中 HTTP 缓存（不发网络请求），秒开
   · 强制刷新：URL 带 ?fresh=1 时，本次页面内所有 fetch 走 cache:'no-store'，
     直接从网络取最新，绕过一切缓存
   ============================================================ */
(function(){
'use strict';

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

/* 数据读取：直接用浏览器 fetch（依赖 GitHub Pages 的 max-age=600 缓存）。
   · 命中 HTTP 缓存 → 不发网络请求，速度快
   · ?fresh=1 → cache:'no-store'，强制回源拿最新 */
function fetchData(url){
  if(url==null) url='';
  var opts={};
  try{ if(new URLSearchParams(location.search).get('fresh')==='1') opts.cache='no-store'; }catch(e){}
  return fetch(url,opts);
}

/* 后台预取：小并发（limit=3）直接 fetch，把数据预热进浏览器 HTTP 缓存。
   不写 Cache API —— 避免缓存永不失效导致「更新后看旧版」 */
function preloadAll(done){
  done = done || function(){};
  var urls=allUrls(), i=0, pending=0, finished=false;
  var CONC=3;
  function fire(){
    if(finished) return;
    while(pending<CONC && i<urls.length){
      var u=urls[i++]; pending++;
      fetch(u).then(function(){ pending--; maybeDone(); fire(); })
        .catch(function(){ pending--; maybeDone(); fire(); });
    }
  }
  function maybeDone(){ if(!finished && i>=urls.length && pending===0){ finished=true; done(); } }
  fire();
}

/* 供页面使用 */
window.AceDataCache = {
  fetchData: fetchData,
  preloadAll: preloadAll,
  VERSIONS: VERSIONS,
  allUrls: allUrls
};
})();
