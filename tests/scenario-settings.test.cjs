'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ui=require('../js/scenario-settings.js');

function node(attrs={}){
  const listeners={};
  return {
    checked:false,open:false,attrs,
    addEventListener(name,handler){listeners[name]=handler;},
    fire(name,event={}){assert.ok(listeners[name],name);listeners[name](event);},
    getAttribute(name){return this.attrs[name];},
    showModal(){this.open=true;}
  };
}

function harness({valid=true,storageDenied=false}={}){
  const dialogs={};
  const options=node();
  const dialog=node();
  dialogs['incident-options']=options;
  dialogs['scenario-settings']=dialog;
  const yes=node({'data-scenario-toggle':'RECONNECT'});
  const no=node({'data-scenario-off':'RECONNECT'});
  const stored=new Map();
  const navigation=[];
  const host={
    Date:{now:()=>100000000},
    sessionStorage:{
      getItem(key){if(storageDenied)throw Error('denied');return stored.get(key)??null;},
      setItem(key,value){if(storageDenied)throw Error('denied');stored.set(key,value);},
      removeItem(key){if(storageDenied)throw Error('denied');stored.delete(key);}
    },
    hasValidPracticeSettings(){return valid;},
    goPractice(mode){navigation.push(mode);}
  };
  const doc={
    getElementById:id=>dialogs[id]??null,
    querySelector:query=>({
      '[data-scenario-toggle="RECONNECT"]':yes,
      '[data-scenario-off="RECONNECT"]':no
    })[query]??null
  };
  const app=ui.mount(doc,host);
  assert.ok(app);
  return {app,yes,no,dialog,options,stored,navigation,host};
}

function choose(h,enabled){
  h.options.fire('click');
  h.yes.checked=enabled;
  h.no.checked=!enabled;
  h.dialog.fire('submit',{submitter:{value:'save'}});
  h.dialog.open=false;
}

test('404만 선택할 수 있으며 돌발상황은 기본 OFF이다',()=>{
  assert.deepEqual(ui.PRESETS,['RECONNECT']);
  assert.deepEqual(ui.selected(['LAST_VALID','RECONNECT']),['RECONNECT']);
  const h=harness();
  assert.deepEqual(h.app.getEnabled(),[]);
  assert.equal(h.no.checked,true);
  assert.equal(h.yes.checked,false);
  for(const mode of [1,2,3]){
    h.host.goPractice(mode);
    assert.equal(h.navigation.at(-1),mode);
    assert.equal(h.stored.size,0);
  }
});

test('돌발상황 설정은 필수 SETTING과 독립적으로 저장 및 취소된다',()=>{
  const h=harness();
  h.options.fire('click');
  assert.equal(h.dialog.open,true);
  h.yes.checked=true;
  h.dialog.fire('submit',{submitter:{value:'cancel'}});
  assert.deepEqual(h.app.getEnabled(),[]);
  choose(h,true);
  assert.deepEqual(h.app.getEnabled(),['RECONNECT']);
  h.options.fire('click');
  assert.equal(h.yes.checked,true);
  choose(h,false);
  assert.deepEqual(h.app.getEnabled(),[]);
});

test('BASIC에서 404를 활성화하면 원본 practice에 먼저 들어가고 타이머는 시작하지 않는다',()=>{
  const h=harness();
  choose(h,true);
  h.host.goPractice(1);
  assert.deepEqual(h.navigation,[1]);
  const entry=JSON.parse(h.stored.get(ui.TRANSITION_KEY));
  assert.deepEqual(entry,{version:3,phase:'armed',mode:1,at:100000000});
  assert.equal(typeof h.host.setTimeout,'undefined');
});

test('TIME/SELECT, 미설정 및 저장소 오류는 가상 404를 주입하지 않는다',()=>{
  const h=harness();choose(h,true);
  h.host.goPractice(2);
  assert.equal(h.stored.size,0);
  h.host.goPractice(3);
  assert.equal(h.stored.size,0);
  const bad=harness({valid:false});choose(bad,true);bad.host.goPractice(1);
  assert.equal(bad.stored.size,0);
  const denied=harness({storageDenied:true});choose(denied,true);
  assert.doesNotThrow(()=>denied.host.goPractice(1));
  assert.deepEqual(denied.navigation,[1]);
});

test('LAST_VALID·메뉴 내부 404·가짜 시간제 지연 구현을 배포하지 않는다',()=>{
  const root=path.join(__dirname,'..');
  const page=fs.readFileSync(path.join(root,'html/vsugang.html'),'utf8');
  const src=fs.readFileSync(path.join(root,'js/scenario-settings.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'css/vsugang-fit.css'),'utf8');
  for(const content of [page,src,css])
    assert.doesNotMatch(content,/LAST_VALID|incident-practice|incident-404-refresh|incident-404-back|6001|delayMs/);
  assert.match(page,/name="incident-RECONNECT" value="no" data-scenario-off="RECONNECT" checked/);
  assert.equal((page.match(/data-scenario-toggle=/g)||[]).length,1);
});
