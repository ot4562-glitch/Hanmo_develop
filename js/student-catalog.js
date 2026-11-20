/* Approved course offering search; no synthetic courses or school data harvesting. */
(function(){
 'use strict';
 const query=document.getElementById('catalog-query');
 if(!query)return;
 const campus=document.getElementById('catalog-campus');
 const results=document.getElementById('catalog-results');
 const status=document.getElementById('catalog-status');
 const retry=document.getElementById('catalog-retry');
 const adapter=window.HanmoAcademicData;
 let offerings=[],state='LOADING',meta=null,loading=false;
 const messages={
   LOADING:'승인된 강좌 자료를 확인하고 있습니다.',
   NOT_CONNECTED:'승인된 강좌·분반 데이터가 아직 연결되지 않았습니다.',
   EMPTY:'연결은 되었지만 공개 승인된 강좌 정보가 없습니다.',
   OFFLINE:'자료 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
   INVALID:'공개 강좌 자료의 출처·판본·유효기간을 검증할 수 없어 표시하지 않습니다.'
 };
 const text=(tag,message,cls)=>{
   const el=document.createElement(tag);el.textContent=message;
   if(cls)el.className=cls;return el;
 };
 function render(){
   results.replaceChildren();
   if(state!=='READY'){
     results.append(text('p',messages[state]||messages.INVALID,'hanmo-empty'));
     return;
   }
   const q=query.value.trim().toLocaleLowerCase('ko');
   const matches=offerings.filter(item=>
     (campus.value==='ALL'||campus.value===item.campus)&&
     (!q||item.courseId.toLocaleLowerCase('ko').includes(q)||
       item.title.toLocaleLowerCase('ko').includes(q)));
   status.textContent='검수된 공개 강좌 '+matches.length+'건 / '+offerings.length+
     '건 · 출처 검수일 '+meta.sourceCheckedAt.slice(0,10)+
     ' · 다음 학기 개설 보장은 아닙니다.';
   if(!matches.length){
     results.append(text('p','조건에 맞는 승인 강좌가 없습니다. 검색어나 캠퍼스를 변경해 보세요.','hanmo-empty'));
     return;
   }
   for(const item of matches){
     const card=text('article','','hanmo-item');
     card.append(text('span','검수된 공개 강좌 · 학기별 근거','hanmo-tag'));
     card.append(text('h3',item.title));
     const campusName=item.campus==='SEOUL'?'서울':'글로벌';
     card.append(text('p',item.courseId+' · '+item.term+' · '+campusName+'캠퍼스'+
       (item.credits===null?' · 학점 미기재':' · '+item.credits+'학점')+
       (item.instructor?' · '+item.instructor:'')));
     const link=text('a','학교 공식 강좌 정보 확인 →');
     link.href=item.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';
     card.append(link);results.append(card);
   }
 }
 function show(value){
   state=value.status==='READY'&&!value.offerings.length?'EMPTY':value.status;
   offerings=state==='READY'?value.offerings:[];
   meta=value.meta;
   query.disabled=state!=='READY';
   campus.disabled=state!=='READY';
   if(state!=='READY')status.textContent=messages[state]||messages.INVALID;
   render();
 }
 async function refresh(){
   if(loading)return;
   loading=true;retry.disabled=true;state='LOADING';offerings=[];
   status.textContent=messages.LOADING;render();
   try{show(adapter&&typeof adapter.load==='function'
      ?await adapter.load():{status:'OFFLINE'});}
   catch{show({status:'OFFLINE'});}
   finally{loading=false;retry.disabled=false;}
 }
 query.addEventListener('input',render);
 campus.addEventListener('change',render);
 retry.addEventListener('click',()=>{void refresh();});
 void refresh();
})();
