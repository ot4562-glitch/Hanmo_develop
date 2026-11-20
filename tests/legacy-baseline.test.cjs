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
  const localStorage={
    getItem:k=>map.has(k)?map.get(k):null,
    setItem:(k,v)=>{map.set(k,String(v));},
    removeItem:k=>{map.delete(k);},
  };
  const location={href:'/',replace(v){events.navigations.push(v);}};
  const sandbox={
    document:doc,localStorage,location,Date:Clock,
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
  assert.match(h.get('time').innerHTML,/13\.000/);
  assert.match(h.get('result').innerHTML,/16\.250/);
  assert.match(h.get('time').innerHTML,/접속 대기 시간은/);
});
test('TIME-only report remains TIME-only even with a stored SELECT amount',()=>{
  const h=createHarness({practiceSetter:2,psubjectValue:3,subjectValue:2,
    waitingValue:'no',TIMEtime:'8.75',SELECTtime:'7',SELECTWaitTime:'0'});
  h.load('result.js');
  assert.match(h.get('result').innerHTML,/8\.750/);
  assert.match(h.get('time').innerHTML,/TIME 부분/);
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
  assert.equal(h.get('button').classList.contains('noDisplay'),true);
});

test('each actual HTML page loads classic scripts in order without global collisions',()=>{
  const pages=['index.html','html/vsugang.html','html/practice.html',
    'html/selectZone.html','html/result.html'];
  for(const page of pages){
    const html=fs.readFileSync(path.join(ROOT,page),'utf8');
    const scripts=[...html.matchAll(/<script\s+src=['"](?:\.\/|\.\.\/)js\/([^'"]+\.js)['"]/g)]
      .map(match=>match[1]).filter(file=>file!=='pc-only.js'&&file!=='student-profile-bar.js'&&file!=='home-fit.js'&&file!=='vsugang-fit.js');
    // The registration menu may load isolated, opt-in synthetic controllers;
    // the three original classic scripts and their order must remain unchanged.
    const originalScripts=page==='html/vsugang.html'?scripts.slice(0,3):scripts;
    // Restore the original notice/device/semester behavior alongside the shared top navigation.
    assert.equal(originalScripts.length,page==='index.html'?2:3,page+' original script count');
    if(page==='html/vsugang.html')assert.deepEqual(scripts.slice(3),[
      'incident-options.js','scenario-settings.js',
    ],'isolated synthetic scripts must load only after original settings/gnb/hanmoSys');
    const h=createHarness({deviceInfo:'true',practiceSetter:1,psubjectValue:2,
      subjectValue:2,waitingValue:'no',TIMEtime:'1',SELECTtime:'1',SELECTWaitTime:'0'});
    h.now('2026-11-19T10:11:00+09:00');
    for(const script of originalScripts){
      assert.doesNotThrow(()=>h.load(script),page+' loading '+script);
    }
    assert.equal(h.location.href,'/',page+' must not navigate to external site');
  }
});
