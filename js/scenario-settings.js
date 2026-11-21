/* In-page mock-registration incidents. Two independent switches, all OFF by default.
 * Never modifies the protected HUFS imitation pages or their controllers.
 */
(function(root,factory){
  const logic=typeof module==='object'&&module.exports?require('./incident-options.js'):root.HanmoIncidentOptions;
  const api=factory(logic);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.HanmoScenarioSettings=api;if(root.document)api.mount(root.document,root);}
})(typeof globalThis==='object'?globalThis:this,function(logic){
  'use strict';
  const PRESETS=logic.OPTIONS;
  const MODES=Object.freeze({1:'BASIC',2:'TIME',3:'SELECT'});
  const RESUME_KEY='hanmo.synthetic404.resume.v1';
  const RESUME_MS=5*60*1000;
  const RESUME_VERSION=2; // Never restore retired candidate selections.
  const selected=logic.enabled;
  function mount(doc,host){
    const byId=id=>doc.getElementById(id);
    const settings=byId('scenario-settings'),work=byId('incident-practice');
    const toggles=Array.from(doc.querySelectorAll('[data-scenario-toggle]'));
    const noOptions=Array.from(doc.querySelectorAll('[data-scenario-off]'));
    const noById=new Map(noOptions.map(input=>[input.getAttribute('data-scenario-off'),input]));
    if(!settings||!work||toggles.length!==PRESETS.length||
       noOptions.length!==PRESETS.length||noById.size!==PRESETS.length||
       toggles.some(input=>!PRESETS.includes(input.getAttribute('data-scenario-toggle'))||
         !noById.has(input.getAttribute('data-scenario-toggle')))||
       typeof host.goPractice!=='function'||typeof host.getSettingValue!=='function'||
       typeof host.openSettingPanel!=='function')return null;
    const controls={
      feedback:byId('incident-feedback'),mode:byId('incident-mode'),
      dialog:byId('incident-404'),exit:byId('incident-exit'),
      refresh:byId('incident-404-refresh'),back:byId('incident-404-back')
    };
    if(Object.values(controls).some(x=>!x)||typeof host.validSetting!=='function')return null;
    const original=host.goPractice,save=host.getSettingValue,open=host.openSettingPanel;
    let enabled=[],mode=null;
    let timer=null,historyPushed=false,showing404=false;
    const local=host.localStorage,session=host.sessionStorage;
    const clock=()=>typeof host.Date?.now==='function'?host.Date.now():Date.now();
    const getChecks=()=>toggles.filter(x=>x.checked).map(x=>x.getAttribute('data-scenario-toggle'));
    function refresh(){
      for(const toggle of toggles){
        const no=noById.get(toggle.getAttribute('data-scenario-toggle'));
        if(no)no.checked=!toggle.checked;
      }
    }
    function summary(){
      const target=doc.querySelector('.printValue');
      if(target&&host.validSetting(Number(local?.getItem('psubjectValue')),
         Number(local?.getItem('subjectValue')),local?.getItem('waitingValue'))){
        target.textContent=enabled.length?'과목 설정 완료 · 가상 상황 '+enabled.length+'종 ON':
          '과목 설정 완료 · 돌발상황 모두 OFF';
        target.style.color=enabled.length?'#f4c76c':'white';
      }
    }
    const say=(message,type='info')=>{
      controls.feedback.textContent=message;
      controls.feedback.dataset.result=type;
    };
    function saveResume(phase='ready'){
      if(!enabled.includes('RECONNECT')||!session)return;
      try{session.setItem(RESUME_KEY,JSON.stringify({
        version:RESUME_VERSION,at:clock(),mode,enabled,phase
      }));}catch(_error){/* Private browsing may block storage; buttons still work. */}
    }
    function clearResume(){
      try{session?.removeItem(RESUME_KEY);}catch(_error){}
    }
    function ensureModeValid(n){
      return Boolean(MODES[n]&&host.validSetting(Number(local?.getItem('psubjectValue')),
        Number(local?.getItem('subjectValue')),local?.getItem('waitingValue')));
    }
    function drawPractice(){
      work.hidden=false;
      work.removeAttribute('aria-hidden');
      controls.mode.textContent=MODES[mode]+' MODE · 가상 돌발상황';
      say(enabled.includes('LAST_VALID')
        ?'마지막 과목이 가상 정원 마감으로 실패했습니다. 신청 상태를 확인하세요.'
        :'가상 접속 단절 예시가 나타나면 새로고침 또는 뒤로가기를 선택하세요.');
      if(typeof work.focus==='function')work.focus();
      if(typeof work.scrollIntoView==='function')work.scrollIntoView({block:'start'});
    }
    function clearTimer(){
      if(timer!==null){(host.clearTimeout||clearTimeout)(timer);timer=null;}
    }
    function resume404(reason){
      if(!showing404)return;
      showing404=false;
      controls.dialog.hidden=true;
      clearTimer();
      saveResume('ready');
      say('404 예시화면을 '+reason+'으로 닫았습니다. 신청 결과는 확정되지 않았으니 상태를 확인하세요.','success');
      if(typeof controls.exit?.focus==='function')controls.exit.focus();
    }
    function show404(){
      timer=null;
      if(work.hidden||showing404||!enabled.includes('RECONNECT'))return;
      showing404=true;
      controls.dialog.hidden=false;
      saveResume('404');
      if(!historyPushed&&host.history&&typeof host.history.pushState==='function'){
        try{
          host.history.pushState({hanmoSynthetic404:true},'',host.location?.href);
          historyPushed=true;
        }catch(_error){}
      }
      if(typeof controls.refresh?.focus==='function')controls.refresh.focus();
    }
    function resetPractice(){
      clearTimer();showing404=false;historyPushed=false;
      controls.dialog.hidden=true;work.hidden=true;work.setAttribute('aria-hidden','true');
      mode=null;
      clearResume();
      const tile=doc.querySelector('.setting');
      if(typeof tile?.focus==='function')tile.focus();
    }
    function run(n,options={}){
      const active=logic.enabled(enabled);
      if(!active.length)return original(n); // OFF: the untouched legacy route.
      if(!ensureModeValid(n))return original(n);
      mode=n;
      local.setItem('practiceSetter',n);
      drawPractice();
      if(active.includes('RECONNECT')&&!options.resume){
        saveResume('pending');
        const random=typeof host.Math?.random==='function'?host.Math.random():Math.random();
        const delay=logic.delayMs(random);
        timer=(host.setTimeout||setTimeout)(show404,delay);
      }
      return undefined;
    }
    host.goPractice=run;
    host.getSettingValue=function(){
      const p=Number(doc.querySelector('.psugangVal')?.value);
      const r=Number(doc.querySelector('.vsugangVal')?.value);
      const w=doc.querySelector('input[name="waitingYN"]:checked')?.value;
      if(!host.validSetting(p,r,w))return save();
      const result=save();enabled=selected(getChecks());refresh();summary();return result;
    };
    host.openSettingPanel=function(){
      const result=open();
      for(const toggle of toggles)toggle.checked=enabled.includes(toggle.getAttribute('data-scenario-toggle'));
      refresh();return result;
    };
    for(const t of toggles)t.addEventListener('change',refresh);
    for(const no of noOptions){
      no.addEventListener('change',()=>{
        if(no.checked){
          const yes=toggles.find(input=>
            input.getAttribute('data-scenario-toggle')===no.getAttribute('data-scenario-off'));
          if(yes)yes.checked=false;
        }
        refresh();
      });
    }
    controls.exit.addEventListener('click',resetPractice);
    controls.refresh.addEventListener('click',()=>{
      if(!showing404)return;
      resume404('새로고침');
      if(typeof host.location?.reload==='function')host.location.reload();
    });
    controls.back.addEventListener('click',()=>{
      if(!showing404)return;
      if(historyPushed&&typeof host.history?.back==='function')host.history.back();
      else resume404('뒤로가기');
    });
    if(typeof host.addEventListener==='function'){
      host.addEventListener('popstate',()=>{if(showing404)resume404('뒤로가기');});
      host.addEventListener('hashchange',()=>{
        if(host.location?.hash==='#scenario-settings')host.openSettingPanel();
      });
    }
    function restoreReload(){
      if(!session)return false;
      let entry;
      try{entry=JSON.parse(session.getItem(RESUME_KEY)||'null');}catch(_error){clearResume();return false;}
      const nav=host.performance?.getEntriesByType?.('navigation')?.[0]?.type;
      const age=clock()-entry?.at;
      if(!entry||entry.version!==RESUME_VERSION||nav!=='reload'||
        !Number.isFinite(age)||age<0||age>RESUME_MS||
        !Array.isArray(entry.enabled)||entry.enabled.length===0||
        selected(entry.enabled).length!==entry.enabled.length||
        new Set(entry.enabled).size!==entry.enabled.length||
        !ensureModeValid(entry.mode)||!entry.enabled.includes('RECONNECT')){
        clearResume();return false;
      }
      enabled=selected(entry.enabled);
      for(const toggle of toggles)toggle.checked=enabled.includes(toggle.getAttribute('data-scenario-toggle'));
      refresh();summary();
      run(entry.mode,{resume:true});
      controls.dialog.hidden=true;showing404=false;
      say('404 예시화면에서 새로고침 후 가상 연습으로 돌아왔습니다. 신청 상태를 확인하세요.','success');
      saveResume('ready');
      return true;
    }
    refresh();summary();
    restoreReload();
    if(host.location?.hash==='#scenario-settings')host.openSettingPanel();
    return Object.freeze({getEnabled:()=>[...enabled],run,close:resetPractice,
      getMode:()=>mode,is404:()=>showing404,trigger404:show404});
  }
  return Object.freeze({PRESETS,MODES,selected,mount});
});
