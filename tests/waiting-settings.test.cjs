'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ROOT=path.join(__dirname,'..');
const menuSource=fs.readFileSync(path.join(ROOT,'js/vsugang.js'),'utf8');
const routerSource=fs.readFileSync(path.join(ROOT,'js/hanmoSys.js'),'utf8');
const resultSource=fs.readFileSync(path.join(ROOT,'js/result.js'),'utf8');
const {recoverOnBrowserReload,KEY}=require('../js/incident-404.js');
const clock=Date.parse('2026-11-22T10:11:00+09:00');

function store(items=[]){
  const map=new Map(items);
  return {
    map,
    getItem:key=>map.get(key)??null,
    setItem:(key,value)=>map.set(key,String(value)),
    removeItem:key=>map.delete(key)
  };
}
function settingHarness(initial=[]){
  const localStorage=store(initial);
  const groups={waitingCourseYN:{},waitingEntryYN:{}};
  for(const name of Object.keys(groups)){
    const values=groups[name];
    for(const value of ['yes','no']){
      const input={value};
      Object.defineProperty(input,'checked',{
        get(){return values.selected===value;},
        set(flag){if(flag)values.selected=value;else if(values.selected===value)values.selected=null;}
      });
      values[value]=input;
    }
    values.selected=name==='waitingCourseYN'?'yes':'no';
  }
  const widgets={
    printValue:{innerText:'',style:{}},
    setting:{style:{}},
    settingSection:{style:{}},
    psugangVal:{value:'3'},
    vsugangVal:{value:'2'}
  };
  const document={
    getElementsByClassName:name=>[widgets[name]],
    querySelector(selector){
      const group=selector.match(/^input\[name="(waitingCourseYN|waitingEntryYN)"\](?::checked|\[value="(yes|no)"\])$/);
      if(!group)return null;
      const values=groups[group[1]];
      return group[2]?values[group[2]]:values[values.selected]??null;
    }
  };
  const alerts=[];
  const location={href:''};
  const context=vm.createContext({document,localStorage,location,alert:msg=>alerts.push(msg)});
  vm.runInContext(menuSource,context,{filename:'vsugang.js'});
  return {groups,widgets,alerts,localStorage,location,context};
}

test('두 접속 대기 옵션은 독립적이고 기본값은 강의 신청 예, 페이지 접속 아니오다',()=>{
  const html=fs.readFileSync(path.join(ROOT,'html/vsugang.html'),'utf8');
  assert.match(html,/강의 신청에 적용할까요\?/);
  assert.match(html,/수강신청 페이지 접속 시에 적용할까요\?/);
  assert.match(html,/name='waitingCourseYN' value='yes' checked/);
  assert.match(html,/name='waitingEntryYN' value='no' checked/);
  assert.equal((html.match(/name='waitingCourseYN'/g)||[]).length,2);
  assert.equal((html.match(/name='waitingEntryYN'/g)||[]).length,2);
  assert.doesNotMatch(html,/name='waitingYN'|수강신청 페이지\s*\(selectZone/i);
  const h=settingHarness();
  h.context.getSettingValue();
  assert.equal(h.localStorage.getItem('waitingValue'),'yes');
  assert.equal(h.localStorage.getItem('waitingEntryValue'),'no');
  assert.equal(h.widgets.setting.style.background,undefined);
  assert.match(h.widgets.printValue.innerText,/올바른 설정값/);
});

test('네 가지 예/아니오 조합을 기존 강의 대기 키와 신규 접속 대기 키에 독립 저장한다',()=>{
  for(const course of ['yes','no'])for(const entry of ['yes','no']){
    const h=settingHarness();
    h.groups.waitingCourseYN[course].checked=true;
    h.groups.waitingEntryYN[entry].checked=true;
    h.context.getSettingValue();
    assert.equal(h.localStorage.getItem('waitingValue'),course);
    assert.equal(h.localStorage.getItem('waitingEntryValue'),entry);
    h.context.goPractice(1);
    assert.equal(h.location.href,'practice.html');
    assert.equal(h.localStorage.getItem('practiceSetter'),'1');
  }
});

test('저장된 과거 대기 선택은 보존하고 새 페이지 대기 설정은 기본 아니오다',()=>{
  const h=settingHarness([['psubjectValue','5'],['subjectValue','2'],['waitingValue','no']]);
  h.context.openSettingPanel();
  assert.equal(h.groups.waitingCourseYN.selected,'no');
  assert.equal(h.groups.waitingEntryYN.selected,'no');
  h.groups.waitingEntryYN.yes.checked=true;
  h.context.getSettingValue();
  h.groups.waitingCourseYN.yes.checked=true;
  h.groups.waitingEntryYN.no.checked=true;
  h.context.openSettingPanel();
  assert.equal(h.groups.waitingCourseYN.selected,'no');
  assert.equal(h.groups.waitingEntryYN.selected,'yes');
});

test('잘못된 두 대기 옵션 선택은 기존 설정을 덮어쓰지 않는다',()=>{
  const h=settingHarness([['psubjectValue','3'],['subjectValue','2'],['waitingValue','yes']]);
  h.groups.waitingEntryYN.no.checked=false;
  h.context.getSettingValue();
  assert.equal(h.alerts.length,1);
  assert.equal(h.localStorage.getItem('waitingValue'),'yes');
  assert.equal(h.localStorage.getItem('waitingEntryValue'),null);
});

function router({page='selectZone.html',mode='1',entry='yes',session=store(),queue}={}){
  const movement=[],queued=[];
  const controls=new Map(['.navigation','.menu','.table','.vsugangedTable'].map(k=>[k,{inert:false}]));
  const localStorage=store([
    ['deviceInfo','true'],['practiceSetter',mode],
    ['waitingValue','no'],['waitingEntryValue',entry]
  ]);
  const location={
    pathname:'/Hanmo_develop/html/'+page,
    href:'https://example.test/Hanmo_develop/html/'+page,
    assign:target=>movement.push({type:'assign',target}),
    replace:target=>movement.push({type:'replace',target})
  };
  class Clock extends Date{
    constructor(){super(clock);}
    static now(){return clock;}
    getHours(){return 10;}
    getMinutes(){return 11;}
    getMonth(){return 10;}
    getFullYear(){return 2026;}
  }
  let resolveWaiting;
  const pending=new Promise(resolve=>{resolveWaiting=resolve;});
  const doc={
    getElementsByClassName:()=>[{innerText:''}],
    querySelector:selector=>controls.get(selector)??null
  };
  const context=vm.createContext({
    localStorage,sessionStorage:session,document:doc,location,Date:Clock,
    waitingFunc:()=>{queued.push('start');return queue??pending;},
    window:{addEventListener(){}}
  });
  vm.runInContext(routerSource,context,{filename:'hanmoSys.js'});
  return {movement,queued,controls,resolveWaiting,session};
}
function armed(){
  return store([[KEY,JSON.stringify({version:3,phase:'armed',mode:1,at:clock})]]);
}

test('수강신청 페이지 접속 예는 BASIC과 SELECT 진입 직후 기존 대기창을 시작한다',async()=>{
  for(const mode of ['1','3']){
    const h=router({mode,entry:'yes'});
    assert.deepEqual(h.queued,['start']);
    assert.ok([...h.controls.values()].every(x=>x.inert));
    h.resolveWaiting(true);
    // VM 내부 Promise의 후속 완료 처리는 다음 이벤트 루프 턴까지 확인합니다.
    await new Promise(resolve=>setImmediate(resolve));
    assert.ok([...h.controls.values()].every(x=>!x.inert));
    assert.deepEqual(h.movement,[]);
  }
});

test('접속 대기 아니오 또는 TIME 모드에서는 페이지 대기를 시작하지 않는다',()=>{
  assert.deepEqual(router({entry:'no'}).queued,[]);
  assert.deepEqual(router({mode:'2',entry:'yes'}).queued,[]);
  assert.deepEqual(router({page:'practice.html',entry:'yes'}).queued,[]);
});

test('404 예 + 접속 대기 예는 404 직전 대기가 없고 새로고침으로 복구된 뒤에만 시작한다',()=>{
  const session=armed();
  const practice=router({page:'practice.html',session,entry:'yes'});
  assert.deepEqual(practice.queued,[]);
  assert.equal(JSON.parse(session.getItem(KEY)).phase,'practice');

  const redirected=router({page:'selectZone.html',session,entry:'yes'});
  assert.deepEqual(redirected.movement,[{type:'assign',target:'./incident-404.html'}]);
  assert.deepEqual(redirected.queued,[]);
  assert.ok([...redirected.controls.values()].every(x=>!x.inert));

  const reloads=[];
  const recovered=recoverOnBrowserReload({
    sessionStorage:session,Date:{now:()=>clock},
    performance:{getEntriesByType:()=>[{type:'reload'}]},
    location:{replace:target=>reloads.push(target)}
  });
  assert.equal(recovered,true);
  assert.deepEqual(reloads,['./selectZone.html']);
  assert.equal(session.getItem(KEY),null);

  const afterReload=router({page:'selectZone.html',session,entry:'yes'});
  assert.deepEqual(afterReload.movement,[]);
  assert.deepEqual(afterReload.queued,['start']);
  assert.ok([...afterReload.controls.values()].every(x=>x.inert));
});

test('접속 대기 취소는 신청 화면을 우회하지 않고 연습 화면으로 돌아간다',async()=>{
  const h=router({entry:'yes'});
  h.resolveWaiting(false);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(h.movement,[{type:'replace',target:'./practice.html'}]);
  assert.ok([...h.controls.values()].every(x=>!x.inert));
});

test('접속 대기만 예여도 결과 시간에서 접속 대기 초를 제외한다',()=>{
  function report(entryWaiting){
    const localStorage=store([
      ['psubjectValue','3'],['subjectValue','1'],['practiceSetter','1'],
      ['waitingValue','no'],['waitingEntryValue',entryWaiting],
      ['TIMEtime','4'],['SELECTtime','20'],['SELECTWaitTime','7']
    ]);
    // 실제 DOM의 텍스트 출력을 모방하고 HTML 문자열 삽입은 허용하지 않는다.
    const element=()=>({textContent:'',children:[],
      append(...children){this.children.push(...children);},
      prepend(...children){this.children.unshift(...children);}
    });
    const elements={'.time':element(),'.result':element()};
    vm.runInNewContext(resultSource,{
      document:{querySelector:q=>elements[q],createElement:element},localStorage
    },{filename:'result.js'});
    const text=node=>node.textContent+node.children.map(text).join('');
    return {time:text(elements['.time']),result:text(elements['.result'])};
  }
  const enabled=report('yes');
  assert.match(enabled.time,/접속 대기 여부 YES/);
  assert.match(enabled.time,/13\.000초/);
  assert.match(enabled.result,/17\.000초/);
  const disabled=report('no');
  assert.match(disabled.time,/접속 대기 여부 NO/);
  assert.match(disabled.result,/24\.000초/);
});

test('원본 설정창의 정수 입력·닫기 동작을 두 대기 옵션과 함께 유지한다',()=>{
  const html=fs.readFileSync(path.join(ROOT,'html/vsugang.html'),'utf8');
  assert.match(html,/class='textbox psugangVal' type='number' min='1' max='15' step='1'/);
  assert.match(html,/class='textbox vsugangVal' type='number' min='1' max='15' step='1'/);
  assert.match(html,/onsubmit='getSettingValue\(\); return false;'/);
  assert.match(html,/onclick='closeSettingPanel\(\)'/);
  const h=settingHarness();
  h.context.openSettingPanel();
  h.context.closeSettingPanel();
  assert.equal(h.widgets.settingSection.style.display,'none');
  h.widgets.psugangVal.value='1.5';
  h.context.getSettingValue();
  assert.equal(h.alerts.length,1);
  assert.equal(h.localStorage.getItem('psubjectValue'),null);
});
