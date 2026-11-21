/* Opt-in synthetic failure and reconnect options. No real course or enrollment data. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.HanmoIncidentOptions=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const OPTIONS=Object.freeze(['LAST_VALID','RECONNECT']);
  function enabled(items){
    if(!Array.isArray(items))return [];
    return OPTIONS.filter(key=>items.includes(key));
  }
  function delayMs(randomValue){
    const n=Number(randomValue);
    if(!Number.isFinite(n))return 0;
    return Math.max(0,Math.min(6000,Math.floor(n*6001)));
  }
  return Object.freeze({OPTIONS,enabled,delayMs});
});
