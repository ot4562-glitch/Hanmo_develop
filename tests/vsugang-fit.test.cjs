'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../js/vsugang-fit.js'),'utf8');
function harness({height=800,width=1400,h=690,w=1000,barY=78}={}){
 const vars={},cssvars={},events={},queue=[],observed=[],cls=new Set();
 const landing={scrollHeight:h,offsetHeight:h,scrollWidth:w,offsetWidth:w,
   style:{setProperty:(k,v)=>cssvars[k]=v}};
 const main={clientHeight:height,clientWidth:width,
   querySelector:k=>k==='.f-dirt-down'?landing:null};
 const bar={getBoundingClientRect:()=>({bottom:barY})};
 const body={style:{setProperty:(k,v)=>vars[k]=v},
   classList:{toggle:(k,v)=>v?cls.add(k):cls.delete(k)},
   querySelector:k=>k==='.hanmo-topbar'?bar:k==='main'?main:null};
 const context={document:{readyState:'complete',querySelector:k=>k==='body.hanmo-vsugang'?body:null,
   fonts:{ready:Promise.resolve()}},window:{
   getComputedStyle:()=>({paddingTop:'10px',paddingBottom:'10px',paddingLeft:'16px',paddingRight:'16px'}),
   requestAnimationFrame:fn=>{queue.push(fn);return queue.length},
   addEventListener:(name,fn)=>events[name]=fn},
   ResizeObserver:class{observe(el){observed.push(el)}}
 };
 vm.runInNewContext(source,context,{filename:'vsugang-fit.js'});
 const flush=()=>{const fn=queue.shift();assert.ok(fn);fn();};
 flush();
 return {vars,cssvars,events,queue,observed,cls,main,bar,landing,flush};
}
test('normal monitor fits all mode tiles without scrolling document',()=>{
 const x=harness({height:910,width:1440,h:700,w:1200,barY:95});
 assert.equal(Number(x.cssvars['--vsugang-fit-scale']),1);
 assert.equal(x.vars['--vsugang-topbar-bottom'],'95px');
 assert.equal(x.cls.has('vsugang-compact-scroll'),false);
 assert.equal(x.observed.length,3);
});
test('720px-height desktop menu scales proportionally beneath nav',()=>{
 const x=harness({height:605,width:1280,h:750,w:1000,barY:105});
 const scale=Number(x.cssvars['--vsugang-fit-scale']);
 assert.ok(scale<1&&scale>=0.65);
 assert.ok(scale*750<=605-20-12);
 assert.equal(x.cls.has('vsugang-compact-scroll'),false);
});
test('at high zoom only main gets scrollable and nav stays visible',()=>{
 const x=harness({height:300,width:650,h:750,w:1200,barY:190});
 assert.equal(x.cls.has('vsugang-compact-scroll'),true);
 assert.equal(x.cssvars['--vsugang-fit-scale'],'1');
 assert.equal(x.vars['--vsugang-topbar-bottom'],'190px');
});
test('resize remeasures fit without any advertisement allowance',()=>{
 const x=harness({height:900,width:1400,h:700,w:1100});
 x.main.clientHeight=620;
 x.events.resize();x.flush();
 assert.ok(Number(x.cssvars['--vsugang-fit-scale'])<1);
 assert.equal(x.vars['--vsugang-footer-height'],undefined);
 x.main.clientHeight=310;
 x.events.pageshow();x.flush();
 assert.equal(x.cls.has('vsugang-compact-scroll'),true);
});

const menuSource=fs.readFileSync(path.join(__dirname,'../js/vsugang.js'),'utf8');
const menuStyles=fs.readFileSync(path.join(__dirname,'../css/vsugang-fit.css'),'utf8');

function menuSettingHarness(){
  const stored=new Map();
  const parts={
    printValue:{innerText:'',style:{}},
    setting:{style:{}},
    settingSection:{style:{}},
    psugangVal:{value:''},
    vsugangVal:{value:''}
  };
  const incident={style:{}};
  const document={
    getElementsByClassName(name){return parts[name]?[parts[name]]:[];},
    querySelector(selector){
      if(selector==='#incident-options')return incident;
      if(selector==='input[name="waitingYN"]:checked')return {value:'no'};
      return null;
    }
  };
  const localStorage={
    getItem(key){return stored.get(key)??null;},
    setItem(key,value){stored.set(key,String(value));},
    removeItem(key){stored.delete(key);}
  };
  const context={document,localStorage,alert(){},location:{href:''}};
  vm.runInNewContext(menuSource,context,{filename:'vsugang.js'});
  return {stored,parts,incident,context};
}

test('SETTING과 돌발상황은 설정 상태와 무관하게 동일한 남색 타일을 사용한다',()=>{
  const x=menuSettingHarness();
  assert.equal(x.parts.setting.style.background,undefined);
  assert.equal(x.incident.style.background,undefined);
  assert.match(x.parts.printValue.innerText,/연습 전 과목 수/);
  assert.match(menuStyles,/grid > :is\(\.setting,#incident-options\)/);
  x.stored.set('psubjectValue','5');
  x.stored.set('subjectValue','2');
  x.stored.set('waitingValue','no');
  x.context.setValue();
  assert.equal(x.parts.setting.style.background,undefined);
  assert.equal(x.incident.style.background,undefined);
  assert.match(x.parts.printValue.innerText,/올바른 설정값/);
  x.stored.delete('waitingValue');
  x.context.setValue();
  assert.match(x.parts.printValue.innerText,/연습 전 과목 수/);
});

test('SETTING의 두 대기 설정과 돌발상황이 동일한 예·아니오 스타일을 사용한다',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../html/vsugang.html'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../css/vsugang-fit.css'),'utf8');
 assert.equal((html.match(/class=['"]waiting-setting-group['"]/g)||[]).length,4);
 assert.match(html,/<fieldset class="waiting-setting-group" aria-describedby="incident-reconnect-description">/);
 assert.match(html,/<legend id="incident-reconnect-label">가상 404·접속 끊김<\/legend>/);
 for(const name of ['waitingCourseYN','waitingEntryYN','incident-RECONNECT','incident-CAPACITY']){
  const quote=name.startsWith('incident-')?'"':"'";
  assert.ok(html.includes('name='+quote+name+quote+' value='+quote+'yes'+quote),name+' 예');
  assert.ok(html.includes('name='+quote+name+quote+' value='+quote+'no'+quote),name+' 아니오');
 }
 assert.match(html,/name='waitingCourseYN' value='yes' checked/);
 assert.match(html,/name='waitingEntryYN' value='no' checked/);
 assert.match(html,/name="incident-RECONNECT" value="no" data-scenario-off="RECONNECT" checked/);
 assert.match(css,/\.settingPanel \.waiting-setting-group \.segmented input:checked \+ span/);
 assert.match(css,/\.settingPanel \.waiting-setting-group \.segmented input\[type="radio"\]/);
 assert.match(css,/prefers-reduced-motion:\s*reduce/);
});

test('BASIC은 돌발상황 버튼과 겹치지 않는 역 ㄱ자 시각·클릭 영역을 사용한다',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../html/vsugang.html'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../css/vsugang-fit.css'),'utf8');
 assert.match(html,/class='basic-mode-tile' style='grid-area: b'/);
 assert.match(css,/\.grid > \.basic-mode-tile\s*\{\s*clip-path:\s*polygon\(0 0, 100% 0, 100% 50%, 50% 50%, 50% 100%, 0 100%\)/);
 assert.match(css,/#incident-options\s*\{\s*grid-area:2 \/ 2 \/ 3 \/ 3/);
 assert.match(css,/\.basic-mode-tile:focus-visible/);
});



test('SETTING과 BASIC 돌발상황 창은 동일한 패널 크기·제목·선택·버튼 스타일을 사용한다',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../html/vsugang.html'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../css/vsugang-fit.css'),'utf8');
 assert.match(html,/<h2 id="scenario-settings-title" class="settingTitle">/);
 assert.match(html,/class="waiting-setting-groups incident-option-group"/);
 assert.match(html,/class="incident-option-actions settingActions"/);
 assert.match(html,/class="settingCancel" type="submit" value="cancel"/);
 assert.match(css,/body\.hanmo-vsugang \.settingPanel\{[\s\S]*?width:min\(480px,100%\)/);
 assert.match(css,/body\.hanmo-vsugang \.settingPanel \.settingTitle/);
 assert.match(css,/body\.hanmo-vsugang \.settingPanel \.settingActions button/);
 assert.doesNotMatch(css,/#scenario-settings h2\{/);
 assert.doesNotMatch(css,/\.settingSection \.settingPanel \{/);
});
