/* ============================================================
   通用资料模块逻辑（活动 / 赛季活动 / 街头车神 / 称号 / 道具 / 游戏介绍 / 平衡性更新）
   用法：页面先设 <script>window.MODKEY='activities'</script>，再引本文件。
   数据全部由浏览器原生 fetch：ace/<版本>/<file>
   ============================================================ */
(function(){
'use strict';
if(window.parent!==window) document.documentElement.classList.add('embedded');

const VERSIONS=[{id:'29836883',label:'29836883',dir:'../ace/29836883/'},{id:'29842023',label:'29842023',dir:'../ace/29842023/'}];
const DEFAULT_VER='29842023';
function getVerParam(){
  const p=new URLSearchParams(location.search);
  let v=p.get('v');
  if(!v){ try{ v=localStorage.getItem('va_ver'); }catch(e){} }
  return VERSIONS.some(x=>x.id===v)?v:DEFAULT_VER;
}
let CUR_VER=getVerParam();
function verCfg(v){ return VERSIONS.find(x=>x.id===v)||VERSIONS[0]; }
const dataUrl=f=>verCfg(CUR_VER).dir+f;
/* 版本号 → 时间：版本号是「Unix 时间戳的分钟数」 */
function verTime(id){
  const n=Number(id);
  if(!isFinite(n)||n<=0) return '';
  const d=new Date(n*60000), p=v=>String(v).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());
}

const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
/* 富文本：游戏文本用 #rrggbb 行内着色，颜色从该码起生效到下一个码。
   注意：#ffffff 这类近似白色在游戏文本里表示「恢复默认颜色」，若按白色渲染会直接看不见 → 视为默认色。 */
const nearWhite=h=>Math.min(parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16))>=232;
const safeColor=h=>{let r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);
  const lin=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)};
  const lum=()=>0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);let i=0;
  while(lum()>0.55&&i<26){r=Math.round(r*.86);g=Math.round(g*.86);b=Math.round(b*.86);i++}
  const h2=v=>v.toString(16).padStart(2,'0');return '#'+h2(r)+h2(g)+h2(b)};
function rich(s){
  if(!s) return '';
  const parts=String(s).split(/(#[0-9a-fA-F]{6})/);let cur=null,out='';
  for(const p of parts){
    if(/^#[0-9a-fA-F]{6}$/.test(p)){cur=p.toLowerCase();continue}
    if(!p) continue;
    if(cur&&nearWhite(cur)){ out+=esc(p); continue; }   // 近白 → 默认颜色
    out+=cur?('<span style="color:'+safeColor(cur)+'">'+esc(p)+'</span>'):esc(p);
  }
  return out;
}
const initial=s=>{s=String(s||'').trim();if(!s)return '?';return /[A-Za-z]/.test(s[0])?s[0].toUpperCase():s[0]};
/* 取「时间」里的开始日期用于排序 */
const timeKey=r=>{const s=String((r&&r['时间'])||'');const m=s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);return m?Date.UTC(+m[1],+m[2]-1,+m[3]):0};
/* 「S18_WEEK2_7DAY_UPDATE」这类版本代号 → 真实日期 + 赛季周次
   赛季起始日期不写死：运行时从街头车神（同版本的「赛季 + 时间」）取每个赛季最早的一天 */
let SEASON_START=null;
function seasonStarts(){
  if(SEASON_START) return SEASON_START;
  SEASON_START={};
  const g=AUX['street_god.json'];
  if(g){
    const arr=Array.isArray(g)?g:Object.values(g);
    arr.forEach(function(x){
      const s=x['赛季'], t=timeKey(x);
      if(!s||!t) return;
      if(SEASON_START[s]==null||t<SEASON_START[s]) SEASON_START[s]=t;
    });
  }
  return SEASON_START;
}
const pad2=n=>String(n).padStart(2,'0');
function fmtSeasonTime(code){
  const m=String(code||'').match(/^S(\d+)_WEEK(\d+)/i);
  if(!m) return null;
  const season='S'+m[1], week=Number(m[2]);
  const label=season+' 第'+week+'周';
  const st=seasonStarts()[season];
  if(!st) return label;
  const d=new Date(st+(week-1)*7*86400000);
  return d.getUTCFullYear()+'-'+pad2(d.getUTCMonth()+1)+'-'+pad2(d.getUTCDate())+' · '+label;
}
/* 赛季排序权重：常驻活动最前，其余按赛季数字从大到小（S35 → S1） */
const srank=k=>{k=String(k||'');if(k.indexOf('常驻')>=0)return -1e9;const m=k.match(/(\d+)/);return m?-Number(m[1]):0};
const RCOLOR={'普通':'#6b7280','稀有':'#2563eb','史诗':'#9333ea','传说':'#d97706','神话':'#dc2626','限定':'#0d9488'};
const rcolor=l=>RCOLOR[l]||'#9aa1ad';
const IMG_CDN='images/';  // 图片已并入 acewiki/images, 相对本仓库部署
const imgLocal=n=>'../ace/'+CUR_VER+'/img/'+n;
document.addEventListener('error',function(e){
  const img=e.target;
  if(!img||img.tagName!=='IMG') return;
  const fb=img.getAttribute('data-fb');
  if(fb){ img.removeAttribute('data-fb'); img.src=fb; } else img.remove();
},true);

/* ---------------- 模块配置 ---------------- */
const MODS={
  activities:{file:'activities.json',title:'活动',unit:'个',kind:'list',
    row:r=>({id:r['ID'],name:r['名称'],tags:[r['状态']],meta:[['分类',r['分类']],['NO',r['NO']],['时间',r['时间']]]}),
    filters:[{key:'状态',get:r=>r['状态']}]},
  titles:{file:'titles.json',title:'称号',unit:'个',kind:'list',
    row:r=>({id:r['数据ID'],name:r['名称'],tags:[r['等级']],meta:[['分类','分类 '+r['分类']],['获取方式',r['获取方式']]]}),
    filters:[{key:'等级',get:r=>r['等级']},{key:'分类',get:r=>'分类 '+r['分类']}]},
  street_god:{file:'street_god.json',title:'街头车神',unit:'期',kind:'list',sortRaw:(a,b)=>timeKey(b)-timeKey(a),sortLabel:'时间 新→旧',
    row:r=>({id:r['期次'],name:r['地图']||r['期次'],tags:[r['赛季'],r['状态']],
      meta:[['期次',r['期次']],['地点',r['地点']],['时间',r['时间']],['完赛门槛',r['完赛门槛']],['每日挑战',r['每日挑战']]]}),
    filters:[{key:'赛季',get:r=>r['赛季']},{key:'地点',get:r=>r['地点']},{key:'状态',get:r=>r['状态']}]},
  season_activities:{file:'season_activities.json',title:'赛季活动',unit:'个',kind:'season',paged:60,
    chipFilter:'赛季', chipSingle:true, defaultChip:'常驻活动',
    groupList:g=>g['活动列表']||[],
    valueOrder:arr=>arr.slice().sort((a,b)=>srank(a)-srank(b)),
    flat:(g,a)=>({ID:a['ID'],名称:a['名称'],分类:a['分类'],状态:a['状态'],NO:a['NO'],时间:a['时间'],
      赛季:g['赛季'],核心资源:!!a['核心资源'],Banner展示:!!a['Banner展示'],Banner资源:!!a['Banner资源']}),
    card:r=>({id:r['ID'],name:r['名称']}),
    sortLabel:'时间 新→旧',
    filters:[{key:'赛季',get:g=>g['赛季']}]},
  items:{file:'items.json',title:'道具',unit:'件',kind:'grid',paged:60,
    card:r=>({id:r.id,name:r.name,rarity:r.rarityLabel||'',icon:r.icon||'',type:r.typeGroup||''}),
    filters:[{key:'品质',get:r=>r.rarityLabel||''},{key:'类别',get:r=>r.typeGroup||''}]},
  game_intro:{file:'game_intro.json',title:'游戏介绍',unit:'篇',kind:'read',sortRaw:(a,b)=>Number(b['数据ID'])-Number(a['数据ID']),
    head:r=>({id:r['数据ID'],
      name:(r['标题']||[])[0]||r['顶部标题']||('#'+r['数据ID']),
      sub:'编号 '+r['数据ID']+' · '+((r['标题']||[]).length||(r['说明']?1:0))+' 节'}),
    sections:r=>{
      /* 部分词条条目只有「顶部标题」而无「标题」：回退到顶部标题，保证有说明时能显示内容 */
      const T=r['标题']||[],B=r['说明']||[];
      const list=T.slice();
      if(!list.length && B.length) list.push(r['顶部标题']||'');
      return list.map((t,i)=>({title:t,body:[B[i]]}));
    },
    filters:[]},
  balance_updates:{file:'balance_updates.json',title:'平衡性更新',unit:'个',kind:'read',sortRaw:(a,b)=>Number(b['版本ID'])-Number(a['版本ID']),
    aux:['street_god.json'],   /* 借街头车神的赛季起止推算真实日期 */
    head:r=>({id:r['版本ID'],name:'版本 '+r['版本号'],
      sub:[fmtSeasonTime(r['开始时间'])||r['开始时间'],r['持续天数']?'持续 '+r['持续天数']+' 天':''].filter(Boolean).join(' · ')}),
    fmtKV:{开始时间:v=>fmtSeasonTime(v)||v},
    sections:r=>{const T=r['标题']||[],B=r['总结']||[];return T.map((t,i)=>({title:t,body:[B[i]]}))},
    cards:r=>{const o=[],v=r['车辆调整']||[],c=r['芯片调整']||[];
      if(v.length) o.push({title:'车辆调整',items:v.map(x=>({name:x['车辆名称'],tag:x['是否新增']?'新增':'',fields:[['基础调整',x['基础调整']],['大招调整',x['大招调整']]]}))});
      if(c.length) o.push({title:'芯片调整',items:c.map(x=>({name:x['芯片名称'],tag:'',fields:[['调整内容',x['调整内容']]]}))});
      return o},
    filters:[]}
};

const MOD=MODS[window.MODKEY];
const mainEl=document.getElementById('main');
const maskEl=document.getElementById('mask');
const modalEl=document.getElementById('modal');

let RAW=[],ITEMS=[],keyword='',sortKey='default',openDD=null,page=1;
let selChip=null;                     /* 单选 chips（赛季活动用） */
let AUX={};                           /* 模块附带的辅助数据（如按版本代号换算日期用的街头车神赛季表） */
const filters={};
/* 赛季缩略图配色：按赛季编号取一个稳定色相，同赛季的卡片同一色系 */
const hueOf=k=>{k=String(k||'');if(k.indexOf('常驻')>=0)return 268;const m=k.match(/(\d+)/);return m?(Number(m[1])*47+18)%360:210};

async function load(){
  const _fetch=(window.AceDataCache&&AceDataCache.fetchData)||fetch;
  const r=await _fetch(dataUrl(MOD.file));
  if(!r.ok) throw new Error('HTTP '+r.status+' · '+MOD.file);
  const data=await r.json();
  RAW=Array.isArray(data)?data:Object.keys(data).map(k=>data[k]);
  /* 附带数据：取不到也不影响主数据渲染 */
  if(MOD.aux){
    await Promise.all(MOD.aux.map(async function(f){
      try{
        const rr=await _fetch(dataUrl(f));
        AUX[f]=rr.ok?await rr.json():null;
      }catch(e){ AUX[f]=null; }
    }));
  }
  build();
}
function build(){
  if(MOD.sortRaw) RAW=RAW.slice().sort(MOD.sortRaw);
  if(MOD.kind==='list'){
    ITEMS=RAW.map(r=>{const n=MOD.row(r);n.raw=r;n._s=(n.name+' '+(n.tags||[]).join(' ')+' '+n.meta.map(x=>x[1]).join(' ')).toLowerCase();return n});
  } else if(MOD.kind==='grid'){
    ITEMS=RAW.map(r=>{const c=MOD.card(r);c.raw=r;c._s=(c.name+' '+c.type+' '+c.rarity).toLowerCase();return c});
  } else if(MOD.kind==='read'){
    ITEMS=RAW.map(r=>{const h=MOD.head(r);h.raw=r;h._s=(h.name+' '+h.sub).toLowerCase();return h});
  } else if(MOD.kind==='season'){
    /* 把每个赛季的「活动列表」摊平成活动条目，并附上所属赛季 */
    const flat=[];
    RAW.forEach(g=>(MOD.groupList?MOD.groupList(g):(g['活动列表']||[])).forEach(a=>flat.push(MOD.flat(g,a))));
    ITEMS=flat.map(r=>{
      const c=MOD.card(r);c.raw=r;
      c._s=(c.name+' '+r['赛季']+' '+r['状态']+' '+r['时间']+' #'+r['ID']).toLowerCase();
      return c;
    });
    /* 单选 chips：默认选中 defaultChip（不存在则取第一个） */
    if(MOD.chipSingle){
      const vals=chipValues();
      selChip=(MOD.defaultChip&&vals.indexOf(MOD.defaultChip)>=0)?MOD.defaultChip:(vals[0]||null);
    }
  } else { ITEMS=[]; }
  MOD.filters.forEach(f=>{ if(f.key!==MOD.chipFilter) filters[f.key]=[]; });
  if(MOD.chipFilter && !MOD.chipSingle) filters[MOD.chipFilter]=[];
}
/* 赛季 chip 的取值列表（已按 valueOrder 排好） */
function chipValues(){
  const f=MOD.filters.filter(x=>x.key===MOD.chipFilter)[0];
  if(!f) return [];
  return counts(f).map(x=>x.v);
}
const summary=a=>!a||!a.length?'全部':(a.length===1?a[0]:a.length+' 项');
function counts(f){
  const m={};
  if(MOD.kind==='season' && f.key===MOD.chipFilter){
    /* 赛季 chip 的数量 = 该赛季的活动条数 */
    RAW.forEach(g=>{
      const k=f.get(g); if(k==null||k==='')return;
      const list=(MOD.groupList?MOD.groupList(g):(g['活动列表']||[]));
      m[k]=(m[k]||0)+list.length;
    });
  } else {
    ITEMS.forEach(it=>{const v=f.get(it.raw||it);if(v==null||v==='')return;m[v]=(m[v]||0)+1});
  }
  let ks=Object.keys(m);
  ks=MOD.valueOrder?MOD.valueOrder(ks):ks.sort((a,b)=>m[b]-m[a]);
  return ks.map(k=>({v:k,c:m[k],n:k}));
}
function ddHtml(key,label,items,sel){
  const open=openDD===key;
  const sum=summary(sel);
  /* 未选（全部）时只显示字段名，省宽度 */
  const text=sum==='全部'?label:label+'：'+sum;
  return '<div class="sel'+(open?' open':'')+'" data-dd="'+esc(key)+'">'+
    '<button class="sel-btn" type="button"><span class="ic">'+esc(label.slice(0,1))+'</span>'+
      '<span>'+esc(text)+'</span><span class="arrow">▼</span></button>'+
    '<div class="sel-list">'+items.map(it=>'<div class="opt'+(sel.indexOf(it.v)>=0?' on':'')+'" data-k="'+esc(key)+'" data-v="'+esc(it.v)+'">'+
      '<span>'+esc(it.n)+'</span><span class="hint">'+it.c+'</span></div>').join('')+'</div></div>';
}
function verHtml(){
  const open=openDD==='__ver';
  const t=verTime(CUR_VER);
  const opts=VERSIONS.map(x=>{
    const xt=verTime(x.id);
    return '<div class="opt'+(x.id===CUR_VER?' on':'')+'" data-ver="'+esc(x.id)+'" title="'+esc(xt)+'"><span>'+esc(x.label)+'</span>'+
      (xt?'<span class="hint">'+esc(xt.slice(0,10))+'</span>':'')+'</div>';
  }).join('');
  return '<div class="sel'+(open?' open':'')+'" data-dd="__ver"><button class="sel-btn" type="button"><span class="ic">版</span>'+
    '<span>版本：'+esc(CUR_VER)+(t?'<i class="vtime">'+esc(t.slice(0,10))+'</i>':'')+'</span><span class="arrow">▼</span></button><div class="sel-list">'+opts+'</div></div>';
}
function toolbar(count){
  const sortLabel=sortKey==='name'?'名称':(sortKey==='id'?'ID 小→大':(MOD.sortLabel||'默认排序'));
  const sortBtn=(MOD.kind==='list'||MOD.kind==='season')?'<div class="sel" data-kind="sort"><button class="sel-btn" type="button" data-sort="1"><span class="ic">排</span>'+
    '<span>'+esc(sortLabel)+'</span><span class="arrow">▼</span></button></div>':'';
  let drops='',chips='';
  MOD.filters.forEach(f=>{
    const opts=counts(f);
    if(MOD.chipFilter===f.key){
      chips+='<div class="chips">'+opts.map(it=>{
        const on=MOD.chipSingle?(selChip===it.v):(filters[f.key].indexOf(it.v)>=0);
        return '<button type="button" class="chipbtn'+(on?' on':'')+'" data-k="'+esc(f.key)+'" data-v="'+esc(it.v)+'">'+esc(it.n)+'<small>'+it.c+'</small></button>';
      }).join('')+'</div>';
    } else {
      drops+=ddHtml(f.key,f.key,opts,filters[f.key]);
    }
  });
  return '<div class="toolbar"><div class="trow"><h2>'+esc(MOD.title)+'<span class="count">'+count+'</span></h2>'+
    '<div class="selects">'+drops+sortBtn+verHtml()+'</div>'+
    '<div class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'+
      '<input id="q" placeholder="搜索…" value="'+esc(keyword)+'" autocomplete="off"></div></div>'+
    chips+'</div>';
}
function rowHtml(n){
  return '<div class="row" data-id="'+esc(n.id)+'"><div class="hd"><span class="nm">'+esc(n.name)+'</span>'+
    (n.tags||[]).filter(Boolean).map(t=>'<span class="tag">'+esc(t)+'</span>').join('')+'</div>'+
    (n.meta&&n.meta.length?'<div class="meta">'+n.meta.filter(x=>x[1]!=null&&x[1]!=='').map(x=>'<span class="kv"><i>'+esc(x[0])+'</i><b>'+esc(x[1])+'</b></span>').join('')+'</div>':'')+
    '</div>';
}
function pass(it,f){ const sel=filters[f.key]; return !(sel&&sel.length)||sel.indexOf(String(f.get(it.raw||it)))>=0; }
function filteredList(){
  const q=keyword.trim().toLowerCase();
  let list=ITEMS.filter(it=>{
    if(q&&it._s.indexOf(q)<0)return false;
    /* chipFilter（赛季）由 chips 单独控制，不在这里按多选过滤 */
    for(const f of MOD.filters){ if(f.key===MOD.chipFilter) continue; if(!pass(it,f)) return false; }
    return true;
  });
  if(MOD.kind==='season'){
    if(selChip) list=list.filter(it=>String(it.raw['赛季'])===selChip);
    if(sortKey==='id') list=list.slice().sort((a,b)=>(a.id||0)-(b.id||0));
    else if(sortKey==='name') list=list.slice().sort((a,b)=>a.name.localeCompare(b.name,'zh-Hans-CN'));
    else list=list.slice().sort((a,b)=>(timeKey(b.raw)-timeKey(a.raw))||((a.id||0)-(b.id||0)));
  }
  if(MOD.kind==='list'){
    if(sortKey==='id') list=list.slice().sort((a,b)=>(a.id||0)-(b.id||0));
    else if(sortKey==='name') list=list.slice().sort((a,b)=>a.name.localeCompare(b.name,'zh-Hans-CN'));
    /* 'default'：保持 RAW 顺序（已按各模块规则排好，如街头车神按时间新→旧） */
  }
  return list;
}
function render(){
  if(MOD.kind==='list'){
    const list=filteredList();
    mainEl.innerHTML=toolbar(list.length+' / '+ITEMS.length+' '+MOD.unit)+'<div class="rows">'+
      (list.length?list.map(rowHtml).join(''):'<div class="empty"><div class="big">没有匹配项</div><div>放宽筛选或清空搜索。</div></div>')+'</div>';
  } else if(MOD.kind==='grid'){
    const list=filteredList();
    const per=MOD.paged||60, pages=Math.max(1,Math.ceil(list.length/per));
    if(page>pages) page=1; if(page<1) page=1;
    const slice=list.slice((page-1)*per,page*per);
    mainEl.innerHTML=toolbar(list.length+' / '+ITEMS.length+' '+MOD.unit)+
      (list.length?'<div class="grid">'+slice.map(cardHtml).join('')+'</div>'+
        '<div class="pager"><button data-pg="prev"'+(page<=1?' disabled':'')+'>上一页</button>'+
        '<span class="pg">'+page+' / '+pages+'</span><button data-pg="next"'+(page>=pages?' disabled':'')+'>下一页</button></div>'
        :'<div class="empty"><div class="big">没有匹配项</div><div>放宽筛选或清空搜索。</div></div>');
  } else if(MOD.kind==='season'){
    const list=filteredList();
    const per=MOD.paged||60, pages=Math.max(1,Math.ceil(list.length/per));
    if(page>pages) page=1; if(page<1) page=1;
    const slice=list.slice((page-1)*per,page*per);
    const title=selChip||'全部赛季';
    mainEl.innerHTML=toolbar(list.length+' / '+ITEMS.length+' '+MOD.unit)+
      (list.length?'<div class="sechd"><span class="dot" style="--h:'+hueOf(title)+'"></span>'+
        '<b>'+esc(title)+'</b><span>共 '+list.length+' 个活动</span></div>'+
        '<div class="grid act">'+slice.map(actCard).join('')+'</div>'+
        '<div class="pager"><button data-pg="prev"'+(page<=1?' disabled':'')+'>上一页</button>'+
        '<span class="pg">'+page+' / '+pages+'</span><button data-pg="next"'+(page>=pages?' disabled':'')+'>下一页</button></div>'
        :'<div class="empty"><div class="big">没有匹配项</div><div>换个赛季，或清空搜索。</div></div>');
  } else if(MOD.kind==='read'){
    const list=filteredList();
    mainEl.innerHTML=toolbar(list.length+' / '+ITEMS.length+' '+MOD.unit)+'<div>'+
      (list.length?list.map(it=>'<div class="art" data-id="'+esc(it.id)+'"><div class="art-hd"><span class="t">'+esc(it.name)+'</span>'+
        '<span class="s">'+esc(it.sub)+'</span><span class="ar">▶</span></div><div class="art-bd"></div></div>').join('')
        :'<div class="empty"><div class="big">没有匹配项</div></div>')+'</div>';
  }
  bind();
}
function cardHtml(c){
  return '<div class="icard" data-id="'+esc(c.id)+'" style="--q:'+rcolor(c.rarity)+'">'+
    '<div class="box"><span class="ph">'+esc(initial(c.name))+'</span>'+
      (c.icon?'<img loading="lazy" alt="" src="'+esc(IMG_CDN+c.icon+'.png')+'" data-fb="'+esc(imgLocal(c.icon+'.png'))+'" onload="this.parentNode.classList.add(\'ok\')">':'')+
    '</div><div class="nm">'+esc(c.name)+'</div>'+(c.rarity?'<div class="rl">'+esc(c.rarity)+'</div>':'')+'</div>';
}
function actCard(c){
  const r=c.raw, id=String(c.id);
  const st=r['状态']||'';
  const stc=st.indexOf('进行')>=0?'on':(st.indexOf('即将')>=0?'soon':'off');
  const full=(r['时间']||'').replace(/\s*~\s*/,' ~ ');
  return '<div class="acard" data-id="'+esc(id)+'" style="--h:'+hueOf(r['赛季'])+'">'+
    '<div class="athumb"><span class="ph">'+esc(initial(c.name))+'</span>'+
      '<img loading="lazy" alt="" src="'+esc(IMG_CDN+'act_'+id+'.png')+'" data-fb="'+esc(imgLocal('act_'+id+'.png'))+'" onload="this.parentNode.classList.add(\'ok\')">'+
      (st?'<span class="stat '+stc+'">'+esc(st)+'</span>':'')+
    '</div>'+
    '<div class="abody"><div class="anm" title="'+esc(c.name)+'">'+esc(c.name)+'</div>'+
      '<div class="ameta"><span class="ai">#'+esc(id)+'</span><span class="at" title="'+esc(full)+'">'+esc(full||'—')+'</span></div>'+
    '</div></div>';
}
function fillArt(el,id){
  if(el.dataset.filled) return;
  const it=ITEMS.find(x=>String(x.id)===String(id)); if(!it) return;
  const r=it.raw; let h='';
  (MOD.sections(r)||[]).forEach(s=>{ if(!s||(!s.title&&!(s.body||[]).some(Boolean)))return;
    h+='<div class="sec"><h4>'+esc(s.title||'—')+'</h4>'+((s.body||[]).filter(Boolean).map(b=>'<div class="rich">'+rich(b)+'</div>').join(''))+'</div>';
  });
  if(MOD.cards){ (MOD.cards(r)||[]).forEach(sec=>{
    h+='<div class="sec"><h4>'+esc(sec.title)+'</h4><div class="adjs">'+(sec.items||[]).map(it=>
      '<div class="adj"><div class="adj-hd"><span class="nm">'+esc(it.name||'—')+'</span>'+
        (it.tag?'<span class="tag on">'+esc(it.tag)+'</span>':'')+'</div>'+
      (it.fields||[]).filter(f=>f[1]!=null&&f[1]!=='').map(f=>'<div class="adj-row"><span class="lb">'+esc(f[0])+'</span><div class="tx">'+rich(f[1])+'</div></div>').join('')+
      '</div>').join('')+'</div></div>';
  }); }
  el.innerHTML=h||'<div class="rich">（无内容）</div>';
  el.dataset.filled='1';
}
function openDetail(n){
  const r=n.raw||{};
  /* 详情字段：跳过空值/false/空数组，以及不展示的「奖励」 */
  const HIDE={奖励:1};
  const kv=Object.keys(r).filter(k=>{
    if(HIDE[k]) return false;
    const v=r[k];return v!=null&&v!==''&&v!==false&&!(Array.isArray(v)&&!v.length)
  }).map(k=>{
    let v=r[k]; if(v===true) v='是';
    if(MOD.fmtKV&&MOD.fmtKV[k]) v=MOD.fmtKV[k](v,r);
    if(Array.isArray(v)) v=v.join(', '); if(typeof v==='object') v=JSON.stringify(v);
    return '<div class="mkv"><div class="k">'+esc(k)+'</div><div class="v">'+esc(v)+'</div></div>';
  }).join('');
  modalEl.innerHTML='<button class="mclose" type="button" aria-label="关闭">✕</button><h3>'+esc(n.name)+'</h3><div class="mgrid">'+kv+'</div>';
  maskEl.classList.add('open');
  modalEl.querySelector('.mclose').onclick=closeDetail;
}
function closeDetail(){ maskEl.classList.remove('open'); modalEl.innerHTML=''; }
maskEl.addEventListener('click',e=>{ if(e.target===maskEl) closeDetail(); });
addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeDetail(); openDD=null; } });

function bind(){
  const tb=mainEl.querySelector('.toolbar');
  tb.addEventListener('click',e=>{
    const sb=e.target.closest('.sel-btn');
    if(sb){
      const drop=sb.parentNode,key=drop.dataset.dd;
      if(drop.dataset.kind==='sort'){ const o=['default','name','id']; sortKey=o[(o.indexOf(sortKey)+1)%o.length]; render(); return; }
      const open=!drop.classList.contains('open');
      tb.querySelectorAll('.sel').forEach(d=>d.classList.remove('open'));
      openDD=open?key:null; if(open) drop.classList.add('open');
      return;
    }
    const ver=e.target.closest('[data-ver]'); if(ver){ changeVer(ver.dataset.ver); return; }
    const chip=e.target.closest('.chipbtn');
    if(chip){
      const k=chip.dataset.k,v=chip.dataset.v;
      if(MOD.chipSingle){ selChip=(selChip===v?null:v); }
      else { const arr=filters[k]; const i=arr.indexOf(v); if(i>=0)arr.splice(i,1);else arr.push(v); }
      page=1; render(); return;
    }
    const opt=e.target.closest('.opt');
    if(opt){ const k=opt.dataset.k,v=opt.dataset.v,arr=filters[k]; const i=arr.indexOf(v); if(i>=0)arr.splice(i,1);else arr.push(v); openDD=k; page=1; render(); return; }
  });
  const q=mainEl.querySelector('#q');
  if(q) q.addEventListener('input',function(){ keyword=this.value; page=1; const pos=this.selectionStart; render(); const n=mainEl.querySelector('#q'); if(n){ n.focus(); n.setSelectionRange(pos,pos); } });
  if(MOD.kind==='list'){
    const rows=mainEl.querySelector('.rows');
    if(rows) rows.addEventListener('click',e=>{ const row=e.target.closest('.row'); if(!row)return; const n=ITEMS.find(x=>String(x.id)===row.dataset.id); if(n) openDetail(n); });
  }
  if(MOD.kind==='grid'){
    const g=mainEl.querySelector('.grid'); if(g) g.addEventListener('click',e=>{ const c=e.target.closest('.icard'); if(!c)return; const it=RAW.find(x=>String(x.id)===c.dataset.id); if(it) openDetail({name:it.name,raw:it}); });
    const pg=mainEl.querySelector('.pager'); if(pg) pg.addEventListener('click',e=>{ const b=e.target.closest('[data-pg]'); if(!b)return; page+=(b.dataset.pg==='next'?1:-1); render(); window.scrollTo(0,0); });
  }
  if(MOD.kind==='season'){
    const g=mainEl.querySelector('.grid.act');
    if(g) g.addEventListener('click',e=>{ const c=e.target.closest('.acard'); if(!c)return; const it=ITEMS.find(x=>String(x.id)===c.dataset.id); if(it) openDetail(it); });
    const pg=mainEl.querySelector('.pager'); if(pg) pg.addEventListener('click',e=>{ const b=e.target.closest('[data-pg]'); if(!b)return; page+=(b.dataset.pg==='next'?1:-1); render(); window.scrollTo(0,0); });
  }
  if(MOD.kind==='read'){
    mainEl.querySelectorAll('.art').forEach(a=>a.querySelector('.art-hd').addEventListener('click',()=>{
      const open=a.classList.toggle('open'); if(open) fillArt(a.querySelector('.art-bd'),a.dataset.id);
    }));
  }
}
document.addEventListener('click',e=>{ if(!e.target.closest('.sel')){ openDD=null; mainEl.querySelectorAll('.sel').forEach(d=>d.classList.remove('open')); } });
function changeVer(v){ if(!VERSIONS.some(x=>x.id===v)||v===CUR_VER) return; CUR_VER=v; try{localStorage.setItem('va_ver',v)}catch(e){} boot(); }

async function boot(){
  if(!MOD){ mainEl.innerHTML='<div class="empty"><div class="big">未知模块</div></div>'; return; }
  document.title=MOD.title+' · 车辆档案库';
  mainEl.innerHTML='<div class="loading">正在载入'+esc(MOD.title)+'…</div>';
  try{ await load(); render(); }
  catch(err){ mainEl.innerHTML='<div class="empty"><div class="big">载入失败</div><div>'+esc(err.message)+'</div>'+
    '<div style="font-size:12px">请确认通过 HTTP 访问，且 <code>ace/'+esc(CUR_VER)+'/'+esc(MOD.file)+'</code> 可访问。</div></div>'; }
}
boot();
})();
