'use strict';

// 기존 BASIC/TIME/SELECT 화면의 브라우저 계약을 검증한다.
// 가상 DOM은 원본 코드가 쓰는 API만 구현한다. 학교 API·외부 스크립트·실제 시계·
// 브라우저 실저장소·운영 사이트에는 접근하지 않는다.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

const ROOT=path.join(__dirname,'..');
function element(tag='div') {
  return {
    tagName:tag.toUpperCase(), childNodes:[], style:{}, className:'',
    get children(){return this.childNodes.filter(x=>typeof x.tagName==='string');},
    get firstElementChild(){return this.children[0]??null;},
    innerText:'', textContent:'', innerHTML:'', value:'', disabled:false,
    classList:{
      values:new Set(),
      add(name){this.values.add(name);},
      remove(name){this.values.delete(name);},
      contains(name){return this.values.has(name);},
    },
    attributes:{},htmls:[],focusCount:0,
    appendChild(child){this.childNodes.push(child);return child;},
    append(...children){this.childNodes.push(...children);},
    prepend(...children){this.childNodes.unshift(...children);},
    insertAdjacentHTML(where,html){this.htmls.push({where,html});this.innerHTML+=html;},
    setAttribute(k,v){this.attributes[k]=String(v);},
    deleteRow(index){this.childNodes.splice(index,1);},
    focus(){this.focusCount++;},
    addEventListener(type,fn){this['on'+type]=fn;},
  };
}
function createHarness(seed={}) {
  const map=new Map(Object.entries(seed).map(([k,v])=>[k,String(v)]));
  const events={alert:[],confirm:[],navigations:[],timeouts:[],intervals:[]};
  const elements=new Map();
  const multi=new Map();
  let time=Date.parse('2026-11-19T09:59:50+09:00');
  const get=(className)=> {
    if (!elements.has(className))elements.set(className,element());
    return elements.get(className);
  };
  const getMulti=(className,index)=> {
    if (!multi.has(className))multi.set(className,[]);
    const arr=multi.get(className);
    while(arr.length<=index)arr.push(element());
    return arr[index];
  };
  class Clock extends Date {
    constructor(...args){super(...(args.length?args:[time]));}
    static now(){return time;}
    // CI 실행 환경의 시간대와 관계없이 한국 사용자의 브라우저 시간을 재현한다.
    koreanDate(){return new Date(this.getTime()+9*3600000);}
    getHours(){return this.koreanDate().getUTCHours();}
    getMinutes(){return this.koreanDate().getUTCMinutes();}
    getMonth(){return this.koreanDate().getUTCMonth();}
    getFullYear(){return this.koreanDate().getUTCFullYear();}
  }
  const doc={
    activeElement:element('button'),
    getElementsByTagName:key=>[get(key)],
    getElementsByClassName:(key)=>key==='unvisible'?[
      getMulti('unvisible',0),getMulti('unvisible',1)]:[get(key)],
    querySelector:(key)=>key==='input[name="waitingYN"]:checked'
      ?{value:seed.waitingValue??'no'}:get(key.replace(/^\./,'')),
    createElement:element,
    createTextNode:(value)=>({textContent:String(value)}),
    addEventListener(){},
  };
  const sessionMap=new Map(seed.capacityActive?[['hanmo.syntheticCapacity.active.v1',seed.capacityActive]]:[]);
  const sessionStorage={
    getItem:k=>sessionMap.get(k)??null,
    setItem:(k,v)=>{sessionMap.set(k,String(v));},
    removeItem:k=>sessionMap.delete(k)
  };
  const localStorage={
    getItem:k=>map.has(k)?map.get(k):null,
    setItem:(k,v)=>{map.set(k,String(v));},
    removeItem:k=>{map.delete(k);},
  };
  const location={href:'/',replace(v){events.navigations.push(v);}};
  const sandbox={
    document:doc,localStorage,sessionStorage,location,Date:Clock,
    Math:Object.assign(Object.create(Math),{random:()=>Number(seed.random??0)}),
    navigator:{userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/157'},
    alert:x=>events.alert.push(x),
    confirm:x=>{events.confirm.push(x);return true;},
    setInterval:(fn,delay)=>{events.intervals.push({fn,delay});return events.intervals.length;},
    clearInterval:()=>{},
    setTimeout:(fn,delay)=>{events.timeouts.push({fn,delay});return events.timeouts.length;},
    clearTimeout:()=>{},
    console:{log(){}},
  };
  sandbox.window={onload:null};
  const context=vm.createContext(sandbox);
  return {
    events,context,elements,get,getMulti,map,doc,location,
    now:v=>{time=typeof v==='number'?v:Date.parse(v);},
    load:file=>vm.runInContext(fs.readFileSync(path.join(ROOT,'js',file),'utf8'),context,{filename:file}),
    expr:script=>vm.runInContext(script,context),
  };
}

test('BASIC/TIME/SELECT settings keep original storage keys and entry routes',()=>{
  const h=createHarness({psubjectValue:3,subjectValue:2,waitingValue:'no'});
  h.load('vsugang.js');
  assert.equal(h.expr('isSettedValue'),true);
  h.expr('goPractice(1)');
  assert.equal(h.map.get('practiceSetter'),'1');
  assert.equal(h.location.href,'practice.html');
  h.expr('goPractice(2)');
  assert.equal(h.map.get('practiceSetter'),'2');
  h.expr('goPractice(3)');
  assert.equal(h.map.get('practiceSetter'),'3');
});
test('invalid settings are rejected without modifying the stored course counts',()=>{
  const h=createHarness({psubjectValue:3,subjectValue:2,waitingValue:'no'});
  h.get('psugangVal').value='0';
  h.get('vsugangVal').value='2';
  h.load('vsugang.js');
  h.expr('getSettingValue()');
  assert.equal(h.map.get('psubjectValue'),'3');
  assert.equal(h.events.alert.length,1);
});
test('BASIC practice initializes timers and enters SELECT after 10-second gate',()=>{
  const h=createHarness({practiceSetter:1});
  h.load('practice.js');
  assert.equal(h.map.get('TIMEtime'),'0.000');
  assert.equal(h.map.get('SELECTtime'),'0.000');
  assert.equal(h.map.get('SELECTWaitTime'),'0.000');
  assert.match(h.get('practiceMode').innerText,/BASIC/);
  h.context.window.onload();
  assert.equal(h.events.timeouts[0].delay,10000);
  h.events.timeouts[0].fn();
  h.now('2026-11-19T10:00:02+09:00');
  h.get('sugang').onclick();
  assert.equal(h.events.navigations[0],'./selectZone.html');
  assert.equal(Number(h.map.get('TIMEtime')),12);
});
test('TIME practice routes to report, SELECT bypasses clock phase',()=>{
  const h=createHarness({practiceSetter:2});
  h.load('practice.js');
  h.context.window.onload();
  h.events.timeouts[0].fn();
  h.now('2026-11-19T10:00:00+09:00');
  h.get('sugang').onclick();
  assert.equal(h.events.navigations[0],'./result.html');

  const s=createHarness({practiceSetter:3});
  s.load('practice.js');
  assert.match(s.get('practiceMode').innerText,/SELECT/);
  assert.match(s.get('timer').innerHTML,/10:00:00/);
  assert.equal(s.events.timeouts.length,0);
});
test('clicking before the time gate does not navigate or record time',()=>{
  const h=createHarness({practiceSetter:1});
  h.load('practice.js');
  h.context.window.onload();
  h.get('sugang').onclick();
  assert.equal(h.events.navigations.length,0);
  assert.equal(h.map.get('TIMEtime'),'0.000');
  assert.equal(h.events.alert.length,1);
});
test('SELECT starts with expected synthetic rows and global inline click handlers',()=>{
  const h=createHarness({practiceSetter:1,psubjectValue:3,subjectValue:2,waitingValue:'no'});
  h.load('selectZone.js');
  assert.equal(h.get('table').htmls.length,3);
  assert.match(h.get('table').innerHTML,/registerClick\(2\)/);
  assert.equal(typeof h.expr('registerClick'),'function');
  assert.equal(typeof h.expr('deleteDone'),'function');
  assert.equal(typeof h.expr('pyoDisplay'),'function');
  assert.match(h.get('practiceMode').innerText,/BASIC/);
});
test('BASIC CAPACITY는 처음 클릭한 과목 대신 임의로 뽑은 딱 한 과목을 마감한다',()=>{
  for(const [random,expected] of [[0,1],[0.45,2],[0.99,3]]){
    const h=createHarness({practiceSetter:1,psubjectValue:3,subjectValue:2,
      waitingValue:'no',capacityActive:'yes',random});
    h.load('selectZone.js');
    assert.equal(h.expr('capacityFullCourseId'),expected);
    assert.equal(h.expr('closedCourses.size'),1);
    assert.equal(h.expr('closedCourses.has('+expected+')'),true);
    h.expr('registerClick('+expected+')');
    assert.equal(h.expr('count'),0);
    h.expr('registerClick('+(expected===1?2:1)+')');
    assert.equal(h.expr('count'),1);
  }
});
test('SELECT 및 BASIC 설정 OFF는 가상 정원 마감에서 제외한다',()=>{
  for(const setting of [{practiceSetter:3,capacityActive:'yes'},{practiceSetter:1,capacityActive:'no'}]){
    const h=createHarness({...setting,psubjectValue:3,subjectValue:2,waitingValue:'no',random:0.7});
    h.load('selectZone.js');
    assert.equal(h.expr('closedCourses.size'),0);
    h.expr('registerClick(1)');
    assert.equal(h.expr('count'),1);
  }
});
test('원본 모의신청 선택 UI에는 네 라디오와 각 Search 전 조건이 있다',()=>{
  const html=fs.readFileSync(path.join(ROOT,'html/selectZone.html'),'utf8');
  for(const option of ['INTEREST','MAJOR','GENERAL','FOUNDATION'])
    assert.match(html,new RegExp('name="course-mode" value="'+option+'"'));
  for(const filter of ['MAJOR','GENERAL','FOUNDATION'])
    assert.match(html,new RegExp('data-course-filter="'+filter+'" hidden'));
  assert.match(html,/course-general-warning/);
  assert.match(html,/course-search-prompt/);
  assert.match(html,/\*\*\*Select\*\*\*/);
  assert.doesNotMatch(html,/---Select---|----- \[Search\]/);
});
test('successful registration stores one synthetic course and prevents duplicates',()=>{
  const h=createHarness({practiceSetter:1,psubjectValue:3,subjectValue:2,waitingValue:'no'});
  h.load('selectZone.js');
  h.expr('registerClick(1)');
  assert.equal(h.expr('count'),1);
  assert.equal(h.expr('rc[0]'),true);
  assert.equal(h.get('done').childNodes.length,1);
  h.expr('registerClick(1)');
  assert.equal(h.expr('count'),1);
  assert.match(h.events.alert.at(-1),/이미 신청된/);
});
test('deleting a registered synthetic course keeps the rest available',()=>{
  const h=createHarness({practiceSetter:1,psubjectValue:3,subjectValue:3,waitingValue:'no'});
  h.load('selectZone.js');
  h.expr('registerClick(1)');
  h.expr('registerClick(2)');
  assert.equal(h.get('done').childNodes.length,2);
  h.expr('deleteDone(1)');
  assert.equal(h.expr('count'),1);
  assert.equal(h.expr('rc[0]'),false);
  assert.equal(h.get('done').childNodes.length,1);
  h.expr('registerClick(1)');
  assert.equal(h.expr('count'),2);
});
test('SELECT records elapsed time, waiting offset and navigates on final course',()=>{
  const h=createHarness({practiceSetter:3,psubjectValue:3,subjectValue:1,waitingValue:'no'});
  h.load('selectZone.js');
  h.now('2026-11-19T10:00:10+09:00');
  h.expr('registerClick(1)');
  assert.equal(h.events.navigations[0],'result.html');
  assert.equal(h.map.get('SELECTtime'),'20');
  assert.equal(h.map.get('SELECTWaitTime'),'0');
});
test('canceling virtual queue must not register a course',async()=>{
  const h=createHarness({practiceSetter:3,psubjectValue:3,subjectValue:2,waitingValue:'yes'});
  h.load('selectZone.js');
  h.expr('registerClick(1)');
  assert.equal(h.getMulti('unvisible',0).style.display,'flex');
  h.get('waitingCloseBtn').onclick();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(h.expr('count'),0);
  // 이전 구현은 localStorage 문자열을 new Array에 전달해 rc[0]을 문자열로 초기화했다.
  // 리팩터링 후 내부 자료형은 바로잡되 신청 건수와 결과 동작은 동일해야 한다.
  assert.equal(h.expr('rc[0]'),false);
  assert.equal(h.getMulti('unvisible',0).style.display,'none');
});
test('report subtracts waiting seconds from SELECT seconds',()=>{
  const h=createHarness({practiceSetter:1,psubjectValue:3,subjectValue:2,
    waitingValue:'yes',TIMEtime:'3.25',SELECTtime:'15.5',SELECTWaitTime:'2.5'});
  h.load('result.js');
  assert.match(h.get('time').children[2].children[0].textContent,/13\.000/);
  assert.match(h.get('result').children[0].children[0].textContent,/16\.250/);
  assert.match(h.get('time').children[3].textContent,/접속 대기 시간은/);
});
test('TIME-only report remains TIME-only even with a stored SELECT amount',()=>{
  const h=createHarness({practiceSetter:2,psubjectValue:3,subjectValue:2,
    waitingValue:'no',TIMEtime:'8.75',SELECTtime:'7',SELECTWaitTime:'0'});
  h.load('result.js');
  assert.match(h.get('result').children[0].children[0].textContent,/8\.750/);
  assert.match(h.get('time').children[1].textContent,/TIME 부분/);
});
test('tampered practice count is never interpreted as HTML on the report page',()=>{
  const h=createHarness({practiceSetter:1,psubjectValue:'<img src=x onerror=alert(1)>',
    subjectValue:1,waitingValue:'no',TIMEtime:'1.25',SELECTtime:'2'});
  h.load('result.js');
  assert.equal(h.get('time').htmls.length,0);
  assert.equal(h.get('result').htmls.length,0);
  assert.equal(h.get('time').children[0].textContent.includes('<img'),false);
  assert.match(h.get('time').children[0].textContent,/연습한 과목 수 0개/);
  assert.equal(h.get('time').children[3].className,'caption');
  assert.equal(h.get('time').children[2].children[0].tagName,'SPAN');
});

test('registered row keeps 13 columns and safe display text',()=>{
  const h=createHarness({practiceSetter:3,psubjectValue:2,subjectValue:2,waitingValue:'no'});
  h.load('selectZone.js');
  h.expr('registerClick(1)');
  assert.equal(h.get('done').children[0].children.length,13);
  assert.equal(h.get('done').children[0].children[5].textContent,
    '한국외국어대학교 모의수강신청1');
});
test('queue cancellation keeps a simulated course available for retry',async()=>{
  const h=createHarness({practiceSetter:3,psubjectValue:2,subjectValue:2,waitingValue:'yes'});
  h.load('selectZone.js');
  h.expr('registerClick(1)');
  h.get('waitingCloseBtn').onclick();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(h.expr('count'),0);
  assert.equal(h.expr('rc[0]'),false);
  h.expr('registerClick(1)');
  assert.equal(h.getMulti('unvisible',0).style.display,'flex');
});

test('navigation header detects a supported Windows PC without clobbering other keys',()=>{
  const h=createHarness();
  h.load('gnb.js');
  assert.equal(h.map.get('deviceInfo'),'true');
  assert.equal(h.get('deviceCheck').style.background,'#038003');
  assert.equal(h.events.timeouts[0].delay,1500);
  assert.equal(h.events.intervals[0].delay,5000);
  h.events.intervals[0].fn();
  assert.equal(h.get('headerNoticeList').style.bottom,'81px');
});
test('navigation header rejects unsupported mobile browser with original redirect',()=>{
  const h=createHarness();
  h.context.navigator.userAgent='Mozilla/5.0 (Linux; Android 13)';
  h.load('gnb.js');
  assert.equal(h.map.get('deviceInfo'),'false');
  assert.equal(h.get('deviceCheck').style.background,'#800309');
  assert.equal(h.location.href,'/');
});
test('legacy false deviceInfo cache does not lock out an actual desktop browser',()=>{
  const h=createHarness({deviceInfo:false});
  h.load('gnb.js');
  assert.equal(h.map.get('deviceInfo'),'true');
  assert.equal(h.get('deviceCheck').style.background,'#038003');
});
test('hanmo system blocks practice navigation during original 09:58-10:10 window',()=>{
  const h=createHarness({deviceInfo:true});
  h.location.href='/html/practice.html';
  h.load('hanmoSys.js');
  assert.equal(h.location.href,'/');
  assert.match(h.get('title').innerText,/2026-2학기/);
});
test('hanmo system keeps PC user on practice outside restricted window',()=>{
  const h=createHarness({deviceInfo:true});
  h.now('2026-11-19T10:11:00+09:00');
  h.location.href='/html/practice.html';
  h.load('hanmoSys.js');
  assert.equal(h.location.href,'/html/practice.html');
});
test('home renders semester/notice and shows PC-only message when device is unsupported',()=>{
  const h=createHarness({deviceInfo:false});
  h.load('index.js');
  assert.match(h.get('noticeList').innerHTML,/업데이트/);
  assert.match(h.get('title').innerText,/2026-2학기/);
  assert.equal(h.get('phoneContainer').style.display,'flex');
  assert.equal(h.get('container').style.display,'none');
  assert.equal(h.get('button').classList.contains('noDisplay'),false);
});

test('each actual HTML page loads classic scripts in order without global collisions',()=>{
  const pages=['index.html','html/vsugang.html','html/practice.html',
    'html/selectZone.html','html/result.html'];
  for(const page of pages){
    const html=fs.readFileSync(path.join(ROOT,page),'utf8');
    const scripts=[...html.matchAll(/<script\s+src=['"](?:\.\/|\.\.\/)js\/([^'"]+\.js)['"]/g)]
      .map(match=>match[1]).filter(file=>file!=='pc-only.js'&&file!=='student-profile-bar.js'&&file!=='home-fit.js'&&file!=='vsugang-fit.js');
    // 별도 돌발상황 스크립트가 있어도 원본 스크립트 세 개와 실행 순서를 유지한다.
    const originalScripts=page==='html/vsugang.html'?scripts.slice(0,3):scripts;
    // 공통 상단 메뉴와 함께 원본 공지·기기 확인·학기 표시를 유지한다.
    assert.equal(originalScripts.length,page==='index.html'?2:3,page+' original script count');
    if(page==='html/vsugang.html')assert.deepEqual(scripts.slice(3),[
      'scenario-settings.js','capacity-settings.js',
    ],'선택형 합성 스크립트는 기존 신청 설정 이후 순서대로 로드한다');
    const h=createHarness({deviceInfo:'true',practiceSetter:1,psubjectValue:2,
      subjectValue:2,waitingValue:'no',TIMEtime:'1',SELECTtime:'1',SELECTWaitTime:'0'});
    h.now('2026-11-19T10:11:00+09:00');
    for(const script of originalScripts){
      assert.doesNotThrow(()=>h.load(script),page+' loading '+script);
    }
    assert.equal(h.location.href,'/',page+' must not navigate to external site');
  }
});


/**
 * BASIC/TIME/SELECT의 원래 진입 경로를 보존하고, 404는 선택한 BASIC에만 추가합니다.
 * 실제 SELECT 키보드·대기창 Windows QA는 별도입니다.
 */
test('404 OFF keeps all original BASIC/TIME/SELECT routes and storage',()=>{
  const page=fs.readFileSync(path.join(ROOT,'html/vsugang.html'),'utf8');
  assert.match(page,/data-scenario-toggle="RECONNECT"/);
  assert.match(page,/data-scenario-off="RECONNECT"/);
  assert.doesNotMatch(page,/LAST_VALID|incident-practice|incident-404-refresh|delayMs/);
  for(const name of ['practice.html','selectZone.html','result.html']){
    const html=fs.readFileSync(path.join(ROOT,'html',name),'utf8');
    assert.doesNotMatch(html,/scenario-settings\.js|incident-404\.js/);
  }
  for(const mode of [1,2,3]){
    const h=createHarness({psubjectValue:3,subjectValue:2,waitingValue:'no'});
    h.load('vsugang.js');
    h.expr('goPractice('+mode+')');
    assert.equal(h.location.href,'practice.html');
    assert.equal(h.map.get('practiceSetter'),String(mode));
    assert.equal(h.events.alert.length,0);
  }
});

test('mode-selection page stays reachable during restricted time while practice remains gated',()=>{
  const h=createHarness({deviceInfo:true});
  h.location.href='/html/vsugang.html';
  h.load('hanmoSys.js');
  assert.equal(h.location.href,'/html/vsugang.html');
  const practice=createHarness({deviceInfo:true});
  practice.location.href='/html/practice.html';
  practice.load('hanmoSys.js');
  assert.equal(practice.location.href,'/');
});
