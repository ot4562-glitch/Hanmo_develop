'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const logic=require('../js/incident-options.js');
const ui=require('../js/scenario-settings.js');

function node(attrs={}){
 const events={};
 return {checked:false,hidden:false,disabled:false,value:'',textContent:'',dataset:{},style:{},attrs,
  setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},
  getAttribute(k){return this.attrs[k];},addEventListener(type,fn){events[type]=fn;},
  fire(type){assert.ok(events[type],type);events[type]({preventDefault(){}});},
  focus(){this.focused=true;},scrollIntoView(){},};
}
function harness(resume=null,navType='navigate',now=100000000){
 const store=new Map([['psubjectValue','3'],['subjectValue','2'],['waitingValue','no']]);
 const cache=new Map(resume||[]),timers=[],listeners={};
 const ids={};
 for(const id of ['scenario-settings','incident-practice','incident-feedback','incident-mode',
  'incident-404','incident-exit','incident-404-refresh','incident-404-back'])ids[id]=node();
 ids['incident-practice'].hidden=true;ids['incident-404'].hidden=true;
 const toggles=logic.OPTIONS.map(id=>node({'data-scenario-toggle':id}));
 const negatives=logic.OPTIONS.map(id=>{const n=node({'data-scenario-off':id});n.checked=true;return n});
 const form={'.printValue':node(),'.psugangVal':node(),'.vsugangVal':node(),
  'input[name="waitingYN"]:checked':node(),'.setting':node()};
 form['.psugangVal'].value='3';form['.vsugangVal'].value='2';
 form['input[name="waitingYN"]:checked'].value='no';
 const doc={getElementById:id=>ids[id]??null,
  querySelectorAll:q=>({'[data-scenario-toggle]':toggles,'[data-scenario-off]':negatives}[q]||[]),
  querySelector:q=>form[q]||null};
 const host={
  localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))},
  sessionStorage:{getItem:k=>cache.get(k)??null,setItem:(k,v)=>cache.set(k,String(v)),removeItem:k=>cache.delete(k)},
  Date:{now:()=>now},Math:{random:()=>0.5},
  setTimeout:(fn,ms)=>{const id=timers.length;timers.push({fn,ms,active:true});return id;},
  clearTimeout:id=>{if(timers[id])timers[id].active=false;},
  history:{pushState(){},back(){listeners.popstate?.();}},
  location:{href:'http://mock/html/vsugang.html',hash:'',reload(){host.reloads++}},
  reloads:0,performance:{getEntriesByType:()=>[{type:navType}]},
  addEventListener:(type,fn)=>{listeners[type]=fn},
  validSetting:(p,r,w)=>Number.isInteger(p)&&p>=1&&p<=15&&Number.isInteger(r)
    &&r>=1&&r<=p&&(w==='no'||w==='yes'),
  goPractice(mode){host.lastOriginal=mode;host.location.href='practice.html';},
  getSettingValue(){host.saves=(host.saves||0)+1;store.set('psubjectValue',form['.psugangVal'].value);
   store.set('subjectValue',form['.vsugangVal'].value);
   store.set('waitingValue',form['input[name="waitingYN"]:checked'].value);},
  openSettingPanel(){host.opens=(host.opens||0)+1},
 };
 const app=ui.mount(doc,host);assert.ok(app);
 return {app,host,ids,toggles,negatives,store,cache,timers,listeners,form};
}
function select(h,...ids){
 for(const toggle of h.toggles)toggle.checked=ids.includes(toggle.getAttribute('data-scenario-toggle'));
 h.host.getSettingValue();
}

test('only failure and reconnect options remain, OFF by default',()=>{
 assert.deepEqual(logic.OPTIONS,['LAST_VALID','RECONNECT']);
 assert.deepEqual(logic.enabled(['LAST_CONFLICT','LAST_VALID']),['LAST_VALID']);
 assert.equal(logic.delayMs(0),0);assert.equal(logic.delayMs(0.5),3000);
 assert.equal(logic.delayMs(1),6000);
 const h=harness();
 assert.deepEqual(h.app.getEnabled(),[]);
 assert.ok(h.negatives.every(x=>x.checked));
 for(const mode of [1,2,3]){
  h.host.goPractice(mode);assert.equal(h.host.lastOriginal,mode);
  assert.equal(h.ids['incident-practice'].hidden,true);
 }
});
test('two independent yes/no switches persist only when valid settings are saved',()=>{
 const h=harness();
 assert.equal(h.toggles.length,2);
 h.toggles[0].checked=true;h.toggles[0].fire('change');
 assert.equal(h.negatives[0].checked,false);
 assert.equal(h.negatives[1].checked,true);
 h.host.getSettingValue();
 assert.deepEqual(h.app.getEnabled(),['LAST_VALID']);
 h.host.openSettingPanel();
 assert.equal(h.toggles[0].checked,true);
 h.negatives[0].checked=true;h.negatives[0].fire('change');
 assert.equal(h.toggles[0].checked,false);
 h.host.getSettingValue();
 assert.deepEqual(h.app.getEnabled(),[]);
 const bad=harness();
 bad.toggles[0].checked=true;bad.form['.psugangVal'].value='0';
 bad.host.getSettingValue();assert.deepEqual(bad.app.getEnabled(),[]);
 bad.host.goPractice(1);assert.equal(bad.host.lastOriginal,1);
});
test('last-course failure shows a warning but never searches or selects a substitute',()=>{
 const h=harness();select(h,'LAST_VALID');
 h.host.goPractice(3);
 assert.equal(h.app.getMode(),3);
 assert.equal(h.ids['incident-practice'].hidden,false);
 assert.match(h.ids['incident-feedback'].textContent,/가상 정원 마감으로 실패/);
 assert.equal(h.store.get('practiceSetter'),'3');
 assert.equal(h.timers.length,0);
 assert.equal(h.cache.size,0);
 h.ids['incident-exit'].fire('click');
 assert.equal(h.ids['incident-practice'].hidden,true);
 assert.equal(h.app.getMode(),null);
});
test('reconnect-only and combined options show a dismissible synthetic 404',()=>{
 for(const enabled of [['RECONNECT'],['LAST_VALID','RECONNECT']]){
  const h=harness();select(h,...enabled);h.host.goPractice(2);
  assert.equal(h.timers.at(-1).ms,3000);
  h.timers.at(-1).fn();
  assert.equal(h.app.is404(),true);
  assert.equal(h.ids['incident-404'].hidden,false);
  h.ids['incident-404-back'].fire('click');
  assert.equal(h.app.is404(),false);
  assert.match(h.ids['incident-feedback'].textContent,/신청 결과는 확정되지/);
  h.ids['incident-exit'].fire('click');
  assert.equal(h.cache.size,0);
 }
});
test('404 refresh resumes only a fresh v2 reconnect session, not an old alternative state',()=>{
 const h=harness();select(h,'RECONNECT');h.host.goPractice(1);
 h.timers.at(-1).fn();h.ids['incident-404-refresh'].fire('click');
 assert.equal(h.host.reloads,1);
 const reloaded=harness(h.cache,'reload');
 assert.deepEqual(reloaded.app.getEnabled(),['RECONNECT']);
 assert.equal(reloaded.ids['incident-practice'].hidden,false);
 assert.equal(reloaded.app.is404(),false);
 assert.equal(reloaded.timers.length,0);
 const navigate=harness(h.cache,'navigate');
 assert.deepEqual(navigate.app.getEnabled(),[]);
 const old=harness([['hanmo.synthetic404.resume.v1',JSON.stringify({
  version:1,at:100000000,mode:1,enabled:['LAST_CONFLICT','RECONNECT'],
  base:[1,2],searched:true})]],'reload');
 assert.deepEqual(old.app.getEnabled(),[]);
 assert.equal(old.cache.size,0);
 const unexpected=harness([['hanmo.synthetic404.resume.v1',JSON.stringify({
  version:2,at:100000000,mode:1,enabled:['LAST_CONFLICT','RECONNECT']})]],'reload');
 assert.deepEqual(unexpected.app.getEnabled(),[]);
 assert.equal(unexpected.cache.size,0);
});
test('removed alternative files and controls do not leak into runtime assets',()=>{
 const root=path.join(__dirname,'..');
 const page=fs.readFileSync(path.join(root,'html/vsugang.html'),'utf8');
 const controller=fs.readFileSync(path.join(root,'js/scenario-settings.js'),'utf8');
 const css=fs.readFileSync(path.join(root,'css/scenario-settings.css'),'utf8');
 for(const s of [page,controller,css]){
  assert.doesNotMatch(s,/LAST_CONFLICT|data-alt-course|incident-search|incident-candidates|대체과목 검색/);
 }
 for(const name of ['incident-courses.js','scenario-engine.js','scenario-composite.js',
  'scenario-workshop.js','scenario-lab.js','scenario-review.js'])
  assert.equal(fs.existsSync(path.join(root,'js',name)),false,name);
});
