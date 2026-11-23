import {readFile,stat,readdir} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';

const here=resolve(import.meta.dirname,'..');
const dist=join(here,'dist');
const studentPages=[
  'html/planner.html','html/academic-timeline.html','html/forecast.html',
  'html/catalog.html','html/academic-calendar.html','html/academic-support.html',
];
const htmlRoutes=[
  'index.html',...studentPages,
  'html/vsugang.html','html/practice.html','html/selectZone.html',
  'html/result.html','html/developer.html','html/incident-404.html',
];
const exists=async(path)=>{try{return (await stat(path)).isFile();}catch{return false;}};
const must=async(name)=>{if(!await exists(join(dist,name)))throw Error('Missing staged asset '+name);};
for(const name of [
  'index.html','css/student-ui.css','js/student-forecast.js',
  'js/student-preferences.js','js/student-notices.js','js/student-catalog.js',
  'js/student-entry.js',
 'js/academic-calendar.js','css/academic-calendar.css','css/academic-calendar-vendor.css',
  'js/student-profile-bar.js','css/hanmo-flat.css',
  'js/academic-support.js','css/academic-support.css','img/hanmo_purple.png','img/favicon-purple.svg',
  'js/home-fit.js','css/home-fit.css',
  'js/vsugang-fit.js','css/vsugang-fit.css',
  'js/incident-404.js','css/incident-404.css',
  'data/academic-source-config.json','js/academic-data-source.js','html/pc-only.html','js/pc-only.js','sitemap.xml',
  ...htmlRoutes,
])await must(name);
if(await exists(join(dist,'CNAME')))throw Error('CNAME leaked into fork QA');
for(const banned of ['html/academic-progress.html','html/academic-faq.html',
 'css/academic-progress.css','css/academic-faq.css','js/academic-faq.js',
 'js/degree-preparation.js','img/hufs_logo.png'])
 if(await exists(join(dist,banned)))throw Error('Prohibited asset in preview: '+banned);

// 사이트맵은 포크의 공개 페이지에만 사용하고, 합성 오류·세션 페이지는 제외합니다.
const sitemap=await readFile(join(dist,'sitemap.xml'),'utf8');
const sitemapBase='https://ot4562-glitch.github.io/Hanmo_develop/';
const publicRoutes=[
  '', 'html/vsugang.html','html/academic-timeline.html',
  'html/forecast.html','html/catalog.html','html/academic-calendar.html',
  'html/academic-support.html','html/planner.html','html/developer.html'
];
const sitemapLocations=[...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map(match=>match[1]);
const expectedLocations=publicRoutes.map(route=>sitemapBase+route);
if(!sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>')||
   !sitemap.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')||
   !sitemap.trimEnd().endsWith('</urlset>')||
   sitemapLocations.length!==expectedLocations.length||
   sitemapLocations.some((value,index)=>value!==expectedLocations[index]))
  throw Error('Sitemap public routes or QA base URL are out of sync');
if(/vsugangpractice\.com|incident-404\.html|(?:practice|selectZone|result|pc-only)\.html|<lastmod>2024/.test(sitemap))
  throw Error('Sitemap leaked original domain, synthetic error or session-only routes');
for(const route of publicRoutes){
  if(!await exists(join(dist,route||'index.html')))
    throw Error('Sitemap refers to a missing public page: '+route);
}

if(await exists(join(dist,'data/academic-notices-reference.json')))
  throw Error('Unapproved historical notice feed leaked into public preview');
if((await readdir(dist)).includes('degree-rescue'))throw Error('Academic student pages must not live under /degree-rescue/');
let linkCount=0,ariaCount=0;
for(const page of htmlRoutes){
  const body=await readFile(join(dist,page),'utf8');
  const pc=page==='index.html'?'./js/pc-only.js':'../js/pc-only.js';
  const guard=body.indexOf('<script src="'+pc+'"></script>');
  if(guard<0||guard>body.indexOf('</head>'))throw Error('PC-only guard missing or async: '+page);
}
for(const page of studentPages){
  const body=await readFile(join(dist,page),'utf8');
  if(/<textarea\b|<input\b[^>]*type=["']file["']/i.test(body))
    throw Error('A student page still requires raw HTML/JSON input: '+page);
  if(/planner-sidebar|<aside\s+class=["'].*sidebar/i.test(body))
    throw Error('Left sidebar is forbidden on '+page);
  if(!body.includes('class="hanmo-topbar"'))throw Error('Missing top menu: '+page);
  const ids=[...body.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  const set=new Set(ids);
  if(set.size!==ids.length)throw Error('Duplicate DOM id: '+page);
  for(const [,references] of body.matchAll(/aria-(?:labelledby|describedby)="([^"]+)"/g)){
    for(const id of references.trim().split(/\s+/)){
      if(!set.has(id))throw Error('Broken ARIA ref '+page+' #'+id);
      ariaCount++;
    }
  }
  for(const [,target] of body.matchAll(/(?:src|href)="([^"]+)"/g)){
    if(/^(?:https?:|mailto:|tel:|data:)/i.test(target))continue;
    if(target.startsWith('#')){
      if(!set.has(target.slice(1)))throw Error('Dead fragment: '+page+' '+target);
      linkCount++;continue;
    }
    if(!/^\.?\.\//.test(target))throw Error('Unsupported student-relative URL: '+page+' '+target);
    const url=new URL(target,'https://preview.invalid/'+page);
    if(url.origin!=='https://preview.invalid')throw Error('Link leaves QA');
    const resolved=resolve(dist,decodeURIComponent(url.pathname).replace(/^\//,''));
    if(!resolved.startsWith(dist+sep)||!await exists(resolved))
      throw Error('Broken student link: '+page+' '+target);
    linkCount++;
  }
}
const root=await readFile(join(dist,'index.html'),'utf8');
if(!root.includes('class="hanmo-topbar"')||
   !root.includes('class="hanmo-brand"')||
   /academic-entry|학사 준비도 한모에서/.test(root))
  throw Error('Home must show original content without the academic promo');
for(const needed of [
  "class='titleContainer'","class='notice blueBox'","class='mainNotice blueBox'",
  "class='buttonContainer'","수강신청 연습하기","새로고침","개발자 소개",
  "./css/index.css","./css/layout.css","./js/gnb.js","./js/index.js"
]){
  if(!root.includes(needed))throw Error('Original home element or script missing: '+needed);
}
if(!root.includes('<body class="hanmo-home hanmo-refined">')||
   !root.includes('class="home-fit-content"')||
   !root.includes('href="./css/home-fit.css"')||
   !root.includes('src="./js/home-fit.js" defer'))
  throw Error('Home must retain its navigation and content layout hooks');
if(!root.includes('onclick="location.reload()"'))
  throw Error('Home refresh button must work on a GitHub Pages project path');
for(const page of studentPages){
  const body=await readFile(join(dist,page),'utf8');
  if(!body.includes('class="hanmo-brand" href="../index.html" aria-label="한모 홈으로 이동"'))
    throw Error('Hanmo brand must link to home: '+page);
  if(/<a href="\.\.\/index\.html">홈<\/a>/.test(body))
    throw Error('Redundant home menu entry: '+page);
}
for(const path of studentPages.filter(path=>path!=='html/forecast.html')){
  if(!root.includes('./'+path))throw Error('Root main menu does not link to '+path);
}
if(root.includes('<a href="./html/vsugang.html"')||/기존 모의신청|기본 모의신청/.test(root))
  throw Error('Home topbar must not expose a redundant mock-registration link');
for(const page of [...studentPages,'html/vsugang.html','html/result.html','html/developer.html']){
  const body=await readFile(join(dist,page),'utf8');
  const bar=body.match(/<(?:header|nav) class="hanmo-topbar"[\s\S]*?<\/(?:header|nav)>/)?.[0];
  if(!bar||!bar.includes('class="hanmo-brand" href="../index.html"'))
    throw Error('Missing consistent home brand link on '+page);
  if(/href="\.\/vsugang\.html"|<a[^>]+>홈<\/a>/.test(bar))
    throw Error('Redundant mock-registration or home item in topbar: '+page);
}
for(const page of ['index.html',...studentPages,'html/vsugang.html','html/result.html','html/developer.html']){
  const body=await readFile(join(dist,page),'utf8');
  const bar=body.match(/<(?:header|nav) class="hanmo-topbar"[\s\S]*?<\/(?:header|nav)>/)?.[0];
  if(!bar||!bar.includes('data-profile-summary'))
    throw Error('Student profile is not accessible from shared navigation: '+page);
  const expectedHref=page==='index.html'?'./html/planner.html':'./planner.html';
  const last=bar.match(/<a class="hanmo-me-link" href="([^"]+)"[^>]*>내정보<\/a>/)?.[1];
  if(last!==expectedHref||bar.indexOf('data-profile-summary')>bar.indexOf('class="hanmo-me-link"'))
    throw Error('내정보 must be the rightmost topbar action: '+page);
}
for(const page of studentPages){
  const html=await readFile(join(dist,page),'utf8');
  if(/class="hanmo-hero"|class="hanmo-eyebrow"/.test(html))
    throw Error('Redundant page-introduction block remains: '+page);
}
const menu=await readFile(join(dist,'html/vsugang.html'),'utf8');
if(!menu.includes('<body class="hanmo-vsugang hanmo-refined">')||
   !menu.includes('href="../css/vsugang-fit.css"')||
   !menu.includes('src="../js/vsugang-fit.js" defer'))
  throw Error('Mode menu must load viewport fitting below the topbar');
const fitStyles=await readFile(join(dist,'css/vsugang-fit.css'),'utf8');
if(!fitStyles.includes('vsugang-compact-scroll')||
   !fitStyles.includes('--vsugang-topbar-bottom')||
   !fitStyles.includes('#scenario-settings[open]'))
  throw Error('Missing viewport and settings accessibility protection');
for(const id of ['scenario-settings','incident-options']){
  if(!menu.includes('id="'+id+'"'))throw Error('Missing incident setting: '+id);
}
for(const file of ['js/scenario-settings.js','js/incident-404.js','css/incident-404.css'])
  await must(file);
if((menu.match(/data-scenario-toggle=/g)||[]).length!==1||
  (menu.match(/data-scenario-off=/g)||[]).length!==1)
  throw Error('Only RECONNECT yes/no controls may exist');
if(!menu.includes('name="incident-RECONNECT" value="no" data-scenario-off="RECONNECT" checked'))
  throw Error('RECONNECT must default to No');
if(/LAST_VALID|incident-practice|incident-404-refresh|incident-404-back/.test(menu))
  throw Error('Removed in-menu failure/timer UI is still present');
const broken=await readFile(join(dist,'html/incident-404.html'),'utf8');
if(!broken.includes('class="navigation"')||
  !broken.includes('inert')||
  !broken.includes('src="../js/incident-404.js"')||
  (broken.match(/<button\b[^>]*disabled/g)||[]).length!==6||
  /<button\b[^>]*onclick=|<a\b[^>]*href=/.test(broken))
  throw Error('Synthetic 404 must keep a non-interactive sidebar and no page recovery controls');
if(/LAST_CONFLICT|data-base-course|data-alt-course|incident-search|incident-candidates|대체과목 검색/.test(menu))
 throw Error('Deferred substitute/conflict UI must be absent');
if(/학업 플래너로 이동|scenario-all-on|scenario-all-off/.test(menu))
 throw Error('Legacy-mode landing has an obsolete extra link or bulk incident control');
for(const retired of ['js/incident-options.js','css/scenario-settings.css','js/incident-courses.js','js/scenario-engine.js','js/scenario-composite.js',
 'js/scenario-lab.js','js/scenario-workshop.js','js/scenario-review.js'])
 if(await exists(join(dist,retired)))throw Error('Removed prototype leaked: '+retired);

const supportHTML=await readFile(join(dist,'html/academic-support.html'),'utf8');
const supportJS=await readFile(join(dist,'js/academic-support.js'),'utf8');
if(!supportHTML.includes('id="support-query"')||!supportHTML.includes('id="support-suggestions"')||
   /<select\b|(?:tel|mailto):|02-2173-|031-330-/.test(supportHTML+supportJS))
  throw Error('School contacts must remain a local query-suggestion interface without stored directory data');
for(const page of [root]){
 // 돌발상황은 모드 메뉴에서만 시작한다.
 if(page.includes('scenario-workshop.html')||page.includes('vsugang.html#scenario-settings'))
   throw Error('Standalone incident link remains on landing');
}
for(const oldPage of ['html/scenario-workshop.html','html/scenario-lab.html'])
  if(await exists(join(dist,oldPage)))throw Error('Standalone synthetic page remains: '+oldPage);
for(const p of htmlRoutes){
  const html=await readFile(join(dist,p),'utf8');
  if(/(?:href|src)=["'][^"']*scenario-(?:workshop|lab)\.html/i.test(html))
    throw Error('Dead standalone scenario link from '+p);
}
for(const path of ['index.html',...studentPages,'html/vsugang.html','html/developer.html','html/result.html']){
 const html=await readFile(join(dist,path),'utf8');
 if(html.includes('academic-progress.html')||html.includes('academic-faq.html'))
   throw Error('Deleted page still linked from: '+path);
 if(!html.includes('본 서비스는 한국외국어대학교의 공식 서비스가 아니며'))
   throw Error('Missing unofficial notice: '+path);
}
console.log('Student preview smoke: '+studentPages.length+' student pages, '+
  linkCount+' links, '+ariaCount+' ARIA references; only optional transition 404 is OFF by default; sidebar stays inert until browser reload/back.');
