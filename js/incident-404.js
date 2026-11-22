/* 가상 오류 화면에는 페이지 안의 복구 버튼을 두지 않습니다. */
(function(root){
  'use strict';
  const KEY='hanmo.synthetic404.transition.v3';
  const VERSION=3;
  const RECOVERY_TTL_MS=5*60*1000;
  function recoverOnBrowserReload(host){
    let entry;
    const store=host.sessionStorage;
    try{entry=JSON.parse(store?.getItem(KEY)||'null');}
    catch(_error){entry=null;}
    const age=(typeof host.Date?.now==='function'?host.Date.now():Date.now())-entry?.errorAt;
    const valid=entry?.version===VERSION&&entry?.mode===1&&entry.phase==='error'&&
      Number.isFinite(age)&&age>=0&&age<=RECOVERY_TTL_MS;
    const navigation=host.performance?.getEntriesByType?.('navigation')?.[0]?.type;
    const legacyReload=host.performance?.navigation?.type===1;
    if(valid&&navigation!=='reload'&&!legacyReload)return false;
    try{store?.removeItem(KEY);}catch(_error){}
    // Chromium의 실제 새로고침 또는 무효한 직접 방문에서만 정상 화면으로 복구합니다.
    host.location.replace('./selectZone.html');
    return true;
  }
  const api=Object.freeze({recoverOnBrowserReload,KEY});
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{
    root.HanmoIncident404=api;
    if(root.document){
      recoverOnBrowserReload(root);
      root.addEventListener?.('pageshow',event=>{
        // 뒤로/앞으로 페이지 캐시에서 되살아난 오류 화면도 유효성 재확인.
        if(event.persisted)recoverOnBrowserReload(root);
      });
    }
  }
})(typeof globalThis==='object'?globalThis:this);
