/* Read-only academic notices; never show unapproved reference titles or fake deadlines. */
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
   LOADING:'승인된 학사공지 데이터를 확인하고 있습니다.',
   NOT_CONNECTED:'학교에서 사용·공개가 승인된 학사공지 데이터가 아직 연결되지 않았습니다.',
   EMPTY:'연결은 되었지만 현재 공개 가능한 승인 공지가 없습니다.',
   OFFLINE:'자료 서버에 연결하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.',
   INVALID:'공개 자료의 판본 또는 유효기간을 확인할 수 없어 표시를 중단했습니다.'
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
   count.textContent=String(matches.length)+'개 공지';
   if(!available||!matches.length){
     const message=!available
       ?messages[state]||messages.INVALID
       :events.length?'조건에 맞는 공지가 없습니다. 검색어 또는 분류를 변경해 보세요.'
         :messages.EMPTY;
     list.append(node('p',message,'hanmo-empty'));
     return;
   }
   for(const item of matches){
     const card=node('article','','hanmo-item');
     card.append(node('span','승인된 공개 자료 · 실제 적용 대상은 원문 확인','hanmo-tag'));
     card.append(node('h3',item.title));
     card.append(node('p','게시일: '+(item.publishedDate||'원문 확인 필요')+
       ' · 자료 검수: '+(meta?.sourceCheckedAt?.slice(0,10)||'기준일 미확인')));
     const link=node('a','학교 공식 원문 확인 →');
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
     ?'승인 공개판본 '+meta.snapshotId+' · 출처 검수일 '+meta.sourceCheckedAt.slice(0,10)+
       ' · 실제 신청 가능 여부·학생 대상은 공식 원문에서 확인하세요.'
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
   finally{loading=false;retry.disabled=false;}
 }
 query.addEventListener('input',render);
 type.addEventListener('change',render);
 retry.addEventListener('click',()=>{void refresh();});
 void refresh();
})();
