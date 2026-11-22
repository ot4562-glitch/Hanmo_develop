'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const recovery=require('../js/incident-404.js');

const ROOT=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(ROOT,'js/hanmoSys.js'),'utf8');
const clock=Date.parse('2026-11-22T10:11:00+09:00');

function fakeStorage(seed=[]){
  const values=new Map(seed);
  return {
    getItem:key=>values.get(key)??null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),
    values
  };
}
function route(page,session,mode='1',minute=11){
  const movements=[];
  const localStorage=fakeStorage([['practiceSetter',mode],['deviceInfo','true']]);
  const location={
    pathname:'/Hanmo_develop/html/'+page,
    href:'https://example.test/Hanmo_develop/html/'+page,
    assign(p){movements.push({type:'assign',path:p});},
    replace(p){movements.push({type:'replace',path:p});}
  };
  class SimDate extends Date{
    constructor(){super(clock);}
    getHours(){return 10;}
    getMinutes(){return minute;}
    getMonth(){return 10;}
    getFullYear(){return 2026;}
    static now(){return clock;}
  }
  const header={innerText:''};
  const context={sessionStorage:session,localStorage,location,Date:SimDate,
    document:{getElementsByClassName(name){return name==='title'?[header]:[];}}};
  vm.runInNewContext(source,context,{filename:'hanmoSys.js'});
  return {movements,header,location};
}

test('BASIC 선택을 arm → practice → selectZone의 실제 진입 순서로만 404 전환한다',()=>{
  const session=fakeStorage([[recovery.KEY,JSON.stringify({
    version:3,phase:'armed',mode:1,at:clock
  })]]);
  const first=route('practice.html',session);
  assert.deepEqual(first.movements,[]);
  assert.equal(JSON.parse(session.getItem(recovery.KEY)).phase,'practice');
  const second=route('selectZone.html',session);
  assert.deepEqual(second.movements,[{type:'assign',path:'./incident-404.html'}]);
  const entry=JSON.parse(session.getItem(recovery.KEY));
  assert.equal(entry.phase,'error');
  assert.equal(entry.errorAt,clock);
});

test('브라우저 뒤로가기로 돌아온 selectZone은 오류를 반복하지 않는다',()=>{
  const session=fakeStorage([[recovery.KEY,JSON.stringify({
    version:3,phase:'error',mode:1,at:clock,errorAt:clock
  })]]);
  const back=route('selectZone.html',session);
  assert.deepEqual(back.movements,[]);
  assert.equal(session.getItem(recovery.KEY),null);
  assert.deepEqual(route('selectZone.html',session).movements,[]);
});

test('TIME/SELECT와 practice를 거치지 않은 직접 selectZone 방문은 장애를 발생시키지 않는다',()=>{
  const s=fakeStorage([[recovery.KEY,JSON.stringify({
    version:3,phase:'armed',mode:1,at:clock
  })]]);
  assert.deepEqual(route('selectZone.html',s).movements,[]);
  assert.deepEqual(route('practice.html',s,'2').movements,[]);
  assert.equal(s.getItem(recovery.KEY),null);
  const expired=fakeStorage([[recovery.KEY,JSON.stringify({
    version:3,phase:'practice',mode:1,at:clock-3600000
  })]]);
  assert.deepEqual(route('selectZone.html',expired).movements,[]);
  assert.equal(expired.getItem(recovery.KEY),null);
});

test('크롬의 실제 새로고침만 404 페이지를 정상 selectZone으로 되돌린다',()=>{
  const session=fakeStorage([[recovery.KEY,JSON.stringify({
    version:3,phase:'error',mode:1,at:clock,errorAt:clock
  })]]);
  function context(kind){
    const navigations=[];
    return {
      sessionStorage:session,Date:{now:()=>clock},
      performance:{getEntriesByType:()=>[{type:kind}]},
      location:{replace:path=>navigations.push(path)},
      navigations
    };
  }
  const first=context('navigate');
  assert.equal(recovery.recoverOnBrowserReload(first),false);
  assert.deepEqual(first.navigations,[]);
  const refresh=context('reload');
  assert.equal(recovery.recoverOnBrowserReload(refresh),true);
  assert.deepEqual(refresh.navigations,['./selectZone.html']);
  assert.equal(session.getItem(recovery.KEY),null);
});

test('만료·직접 방문·잘못된 저장 상태는 404 화면에 갇히지 않는다',()=>{
  for(const seed of [null,'{broken',JSON.stringify({
    version:2,phase:'error',mode:1,at:clock,errorAt:clock
  }),JSON.stringify({
    version:3,phase:'error',mode:1,at:clock,errorAt:clock-400000
  })]){
    const store=fakeStorage(seed===null?[]:[[recovery.KEY,seed]]);
    const moved=[];
    const context={sessionStorage:store,Date:{now:()=>clock},
      performance:{getEntriesByType:()=>[{type:'navigate'}]},
      location:{replace:route=>moved.push(route)}};
    assert.equal(recovery.recoverOnBrowserReload(context),true);
    assert.deepEqual(moved,['./selectZone.html']);
  }
});

test('404는 화면 내 복구 동작 없이 왼쪽 원형 메뉴만 비활성화한다',()=>{
  const html=fs.readFileSync(path.join(ROOT,'html/incident-404.html'),'utf8');
  const css=fs.readFileSync(path.join(ROOT,'css/incident-404.css'),'utf8');
  assert.match(html,/class="navigation"[^>]*aria-hidden="true" inert/);
  assert.equal((html.match(/<button\b[^>]*disabled tabindex="-1"/g)||[]).length,6);
  assert.doesNotMatch(html,/onclick=|<a\b|id="incident-404-refresh"|id="incident-404-back"/);
  assert.match(css,/pointer-events:none/);
  assert.match(html,/브라우저의 새로고침 또는 뒤로가기를 사용하세요/);
  assert.match(html,/src="\.\.\/js\/pc-only\.js"/);
});
