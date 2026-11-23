/* 연결 상태를 구분하고 검수된 공지 자료만 표시합니다. */
(function(){
 'use strict';
 const list=document.getElementById('notice-list');
 if(!list)return;
 const query=document.getElementById('notice-query');
 const type=document.getElementById('notice-type');
 const count=document.getElementById('notice-count');
 const status=document.getElementById('notice-status');
 const retry=document.getElementById('notice-retry');
 const adapter=window.HanmoAcademicData;
 let events=[],state='LOADING',meta=null,loading=false;
 const buckets={
   MAJOR:['DOUBLE_MAJOR_APPLICATION','DOUBLE_MAJOR_CHANGE','PRIMARY_MAJOR_DECLARATION','MAJOR_APPLICATION'],
   COURSE:['WINTER_COURSE','COURSE_REGISTRATION','COURSE_CHANGE','COURSE_CANCELLED'],
   GRAD:['GRADUATION_EXAM','GRADUATION_CERTIFICATION','GRADE_RELEASE','CREDIT_FORFEIT']
 };
 function category(kind){
   for(const [group,kinds] of Object.entries(buckets))if(kinds.includes(kind))return group;
   if(kind.includes('GRAD')||kind.includes('GRADE')||kind.includes('CREDIT'))return 'GRAD';
   if(kind.includes('MAJOR'))return 'MAJOR';
   if(kind.includes('COURSE')||kind.includes('CLASS'))return 'COURSE';
   return 'OTHER';
 }
 const messages={
   LOADING:'공지 자료를 확인하고 있습니다.',
   NOT_CONNECTED:'공지 자료 연결 전입니다. 학교 원문에서 확인해 주세요.',
   EMPTY:'현재 표시할 공지 자료가 없습니다.',
   OFFLINE:'자료 연결에 실패했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.',
   INVALID:'자료 검증에 실패해 표시를 중단했습니다. 학교 원문을 확인해 주세요.'
 };
 const node=(tag,message,cls)=>{
   const el=document.createElement(tag);el.textContent=message;
   if(cls)el.className=cls;return el;
 };
 function render(){
   const search=query.value.trim().toLocaleLowerCase('ko');
   const filter=type.value;
   const available=state==='READY';
   const matches=available?events.filter(item=>
     (filter==='ALL'||category(item.type)===filter)&&
     (!search||item.title.toLocaleLowerCase('ko').includes(search))):[];
   list.replaceChildren();
   count.textContent=available?matches.length+'개 공지':'';
   if(!available)return;
   if(!matches.length){
     list.append(node('p','검색 결과 없음','hanmo-empty'));
     return;
   }
   for(const item of matches){
     const card=node('article','','hanmo-item');
     card.append(node('h3',item.title));
     card.append(node('p','게시일: '+(item.publishedDate||'원문 확인 필요')));
     const link=node('a','원문 확인');
     link.href=item.sourceUrl;link.rel='noopener noreferrer';link.target='_blank';
     card.append(link);
     list.append(card);
   }
 }
 function show(result){
   state=result.status==='READY'&&!result.notices.length?'EMPTY':result.status;
   events=state==='READY'?result.notices:[];
   meta=result.meta;
   status.textContent=state==='READY'
     ?'자료 확인 '+meta.sourceCheckedAt.slice(0,10)+' · 대상·마감은 원문 확인'
     :messages[state]||messages.INVALID;
   query.disabled=state!=='READY';
   type.disabled=state!=='READY';
   render();
 }
 async function refresh(){
   if(loading)return;
   loading=true;retry.disabled=true;
   state='LOADING';events=[];status.textContent=messages.LOADING;render();
   try{
     show(adapter&&typeof adapter.load==='function'
       ?await adapter.load():{status:'OFFLINE'});
   }catch{show({status:'OFFLINE'});}
   finally{
     loading=false;retry.disabled=false;
     retry.hidden=!['OFFLINE','INVALID'].includes(state);
   }
 }
 document.getElementById('notice-filter').addEventListener('submit',event=>event.preventDefault());
 query.addEventListener('input',render);
 type.addEventListener('change',render);
 retry.addEventListener('click',()=>{void refresh();});
 void refresh();
})();
