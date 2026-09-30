/* ============================================================
   数据预加载模块（无 SW / 无 Cache API 的最简方案）
   ============================================================
   缓存策略：依赖 GitHub Pages 默认的 Cache-Control: max-age=600，
   数据被浏览器 HTTP 缓存 10 分钟，到期自动回源 → 更新自然生效。
   强制刷新：URL 带 ?fresh=1 时本次页面所有 fetch 走 cache:'no-store'。

   ---------- 性能策略（v2 · 只预取「当前版本」）----------
   旧版在这里无条件预取「两个版本 × 10 个文件」= 20 个请求 ≈ 2.3MB，
   首页一打开就灌满带宽，和用户真正要看的 vehicles.json 抢通道，首屏反而更慢。

   现改为「按页面需要分级预取」：
     0 级（当前页面必需）：页面自己 fetch，不在这里重复发起；
     1 级（首屏列表最可能需要）vehicles —— 立即开始，最高优先级；
     2 级（二级页面常用，体积小）tracks / chips —— vehicles 完成后接续；
     3 级（详情/图鉴，体积大）其余 —— 首屏空闲且带宽空闲时才取。

   关键约束：
     · 只取「当前选中版本」，另一个版本等用户真的切了再懒加载（ensureVersion）；
     · items.json（gzip 663KB，占单版本 56%）默认**不主动预取**，
       只留给图鉴页自己按需拉 —— 这是单项最大的一笔节省；
     · 用 requestIdleCallback 启动，绝不与首屏首字节竞争；
     · 并发压到 2，避免占满移动端连接数；
     · 全程是「预热浏览器 HTTP 缓存」，不写 Cache API
       （避免缓存永不失效，导致更新后仍看到旧数据）。
   ============================================================ */
(function(){
'use strict';

/* 版本清单（与各页一致） */
var VERSIONS=[
  {id:'29836883', dir:'../ace/29836883/'},
  {id:'29842023', dir:'../ace/29842023/'}
];
var DEFAULT_VER='29842023';

/* 数据文件按「页面需要程度」排序。
   items 故意排在最后：它单文件 gzip 就有 663KB，
   预取它等于把首屏带宽吃掉一半，而绝大多数用户不会进图鉴页。 */
var FILES=[
  'vehicles',            /* 列表页 / 总览：首屏必需（最小集） */
  'tracks',              /* 赛道页：小（3KB） */
  'chips',               /* 芯片页：小（9KB） */
  'activities',
  'titles',
  'street_god',
  'season_activities',
  'balance_updates',
  'game_intro',          /* 772KB 原始，进「游戏介绍」才用 */
  'items'                /* 9.7MB 原始 / 663KB gzip，进「图鉴」才用 */
];

/* --fresh=1 时全部走网络 */
function noStore(){
  try{ return new URLSearchParams(location.search).get('fresh')==='1'; }catch(e){ return false; }
}

/* 当前版本：URL 的 v 参数 > localStorage(va_ver) > 默认（最新） */
function currentVer(){
  var v=null;
  try{ v=new URLSearchParams(location.search).get('v'); }catch(e){}
  if(!v){ try{ v=localStorage.getItem('va_ver'); }catch(e){} }
  for(var i=0;i<VERSIONS.length;i++) if(VERSIONS[i].id===v) return v;
  return DEFAULT_VER;
}
function verCfg(id){
  for(var i=0;i<VERSIONS.length;i++) if(VERSIONS[i].id===id) return VERSIONS[i];
  return VERSIONS[VERSIONS.length-1];
}
function urlsOfVer(id){
  var dir=verCfg(id).dir;
  return FILES.map(function(f){ return dir+f+'.json'; });
}

/* 数据读取：依赖浏览器 HTTP 缓存；?fresh=1 强制回源 */
function fetchData(url){
  if(url==null) url='';
  var opts={};
  if(noStore()) opts.cache='no-store';
  return fetch(url,opts);
}

/* ---------------- 预取调度器 ---------------- */
/* 已完成/进行中的 URL，跨版本共享，避免重复请求 */
var SEEN=Object.create(null);

/* 页面自己正在用的文件：list.html / car.html 首屏会立刻 fetch vehicles.json，
   预取再发一次就是纯重复请求（实测会多打 1 次）。
   ---- 注意：外壳页与 iframe 各自持有独立的 preload.js 实例，
   函数级变量不共享，所以 CLAIMED 走 window.parent 上一份共享对象。 ---- */
var HOST=window;
try{ if(window.parent&&window.parent!==window) HOST=window.parent; }catch(e){ HOST=window; }
var CLAIMED;
try{
  if(!HOST.__aceClaimed) HOST.__aceClaimed=Object.create(null);
  CLAIMED=HOST.__aceClaimed;
}catch(e){ CLAIMED=Object.create(null); }

function claim(url){
  if(url) CLAIMED[url]=true;
}

/* 每个版本预取到第几个文件为止（下标越界 = 已全部取完） */
var doneIdx=Object.create(null);   /* verId -> 下一个待取下标 */
var running=false;

var CONC=2;              /* 并发上限：移动端同时占满连接反而更慢 */
var active=0;

/* 首屏必需、绝不在这里预取的文件：由各页自己 fetch。
   （放在这层兜底，防止 claim 因时序/跨帧问题没赶上） */
var NEVER_PRELOAD=['vehicles.json'];

/* 是否已让位给首屏：首屏数据没加载完之前不启动预取 */
function startIdle(fn){
  if(window.requestIdleCallback){
    /* timeout 兜底：最迟 3s 后一定执行，避免空闲回调被无限推迟 */
    requestIdleCallback(fn,{timeout:3000});
  } else {
    setTimeout(fn,1200);
  }
}

/* 是否属于「绝不预取」的文件（按文件名后缀匹配，忽略版本目录） */
function isNever(url){
  for(var i=0;i<NEVER_PRELOAD.length;i++){
    if(url.indexOf(NEVER_PRELOAD[i])>=0) return true;
  }
  return false;
}

/* 预取一个 URL（写入 SEEN，失败也记录，避免反复重试拖慢） */
function grab(url){
  if(SEEN[url]) return SEEN[url];
  var p=fetch(url, noStore()?{cache:'no-store'}:undefined)
    .catch(function(){});
  SEEN[url]=p;
  return p;
}

/* 逐级预取：取完一个文件再决定要不要继续，让出主线程 */
function pump(verId){
  var urls=urlsOfVer(verId);
  if(doneIdx[verId]==null) doneIdx[verId]=0;

  function step(){
    if(active>=CONC) return;                       /* 并发满了，等回调再驱动 */
    if(doneIdx[verId]>=urls.length){                /* 该版本取完 */
      running=false;
      return;
    }
    var url=urls[doneIdx[verId]++];
    if(CLAIMED[url]){ step(); return; }             /* 页面自己要取，跳过 */
    if(isNever(url)){ step(); return; }             /* 首屏必需文件，跳过 */
    if(SEEN[url]){ step(); return; }                /* 已取过，跳过 */
    active++;
    grab(url).then(function(){
      active--;
      step();                                       /* 递归驱动下一个 */
    });
  }
  running=true;
  step();
}

/* 对外：预取指定版本（不传 = 当前版本）
   按 FILES 顺序逐级取，items 排最后自然被推迟。 */
function preloadVersion(verId){
  var id=verId||currentVer();
  pump(id);
}

/* 切版本时懒加载另一版本的数据（挂在各页的 setVer 里调用） */
function ensureVersion(verId){
  var id=verId||currentVer();
  startIdle(function(){ preloadVersion(id); });
}

/* 兼容旧调用：preloadAll() → 只预取当前版本 */
function preloadAll(done){
  preloadVersion(currentVer());
  if(typeof done==='function') done();
}

/* 供页面使用 */
window.AceDataCache={
  fetchData:fetchData,
  preloadAll:preloadAll,
  preloadVersion:preloadVersion,
  ensureVersion:ensureVersion,
  currentVer:currentVer,
  verCfg:verCfg,
  urlsOfVer:urlsOfVer,
  claim:claim,
  VERSIONS:VERSIONS,
  DEFAULT_VER:DEFAULT_VER
};
})();
