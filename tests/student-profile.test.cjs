'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const script=fs.readFileSync(path.join(__dirname,'../js/student-profile-bar.js'),'utf8');
const KEY='hanmo:student-planner:profile:v1';
function render(value,missing=false){
 const events={};const store=new Map();
 if(!missing)store.set(KEY,typeof value==='string'?value:JSON.stringify(value));
 const item={textContent:'',title:''};
 const ctx={
  document:{querySelectorAll:q=>q==='[data-profile-summary]'?[item]:[]},
  localStorage:{getItem:k=>store.get(k)||null},
  window:{addEventListener:(type,fn)=>{events[type]=fn}},
 };
 vm.runInNewContext(script,ctx,{filename:'student-profile-bar.js'});
 return {item,events,store};
}
test('unset profile shows neutral setup text, not fake authentication',()=>{
 const {item}=render(null,true);
 assert.equal(item.textContent,'내정보 미설정');
 assert.match(item.title,/로그인한 상태가 아닙니다/);
});
test('campus major double major and admission-year 학번 appear in right header',()=>{
 const {item}=render({campus:'SEOUL',major:'경제학전공',secondaryKind:'DOUBLE',
  doubleMajor:'통계학전공',cohort:2024});
 assert.equal(item.textContent,'서울캠퍼스 · 경제학전공 · 이중전공 통계학전공 · 2024학번');
});
test('minor appears instead of double major, NONE hides optional area',()=>{
 const minor=render({campus:'GLOBAL',major:'경제학전공',secondaryKind:'MINOR',
  minor:'컴퓨터공학',cohort:2025});
 assert.equal(minor.item.textContent,'글로벌캠퍼스 · 경제학전공 · 부전공 컴퓨터공학 · 2025학번');
 const noSecond=render({campus:'SEOUL',major:'국제학부',secondaryKind:'NONE',cohort:2022});
 assert.equal(noSecond.item.textContent,'서울캠퍼스 · 국제학부 · 2022학번');
});
test('legacy saved doubleMajor still renders; missing year is not fabricated',()=>{
 const old=render({campus:'SEOUL',major:'경제학전공',doubleMajor:'경영학부'});
 assert.equal(old.item.textContent,'서울캠퍼스 · 경제학전공 · 이중전공 경영학부 · 학번 미설정');
});
test('malformed profile is ignored and cross-tab storage updates read fresh data',()=>{
 const broken=render('{bad json');
 assert.equal(broken.item.textContent,'내정보 미설정');
 const {item,store,events}=render({campus:'SEOUL',major:'경제학전공',cohort:2023});
 store.set(KEY,JSON.stringify({campus:'GLOBAL',major:'미디어전공',cohort:2026}));
 events.storage({key:KEY});
 assert.equal(item.textContent,'글로벌캠퍼스 · 미디어전공 · 2026학번');
});
test('student-provided text is assigned as text, never interpreted as HTML',()=>{
 const input='<img src=x onerror=alert(1)>';
 const {item}=render({campus:'SEOUL',major:input,cohort:2023});
 assert.ok(item.textContent.includes(input));
 assert.equal(item.innerHTML,undefined);
});
