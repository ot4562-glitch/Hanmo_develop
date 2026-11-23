/* 연결 상태를 구분하고 검수된 강의 자료만 검색합니다. */
(function(){
 'use strict';
 const query=document.getElementById('catalog-query');
 if(!query)return;
 const campus=document.getElementById('catalog-campus');
 const results=document.getElementById('catalog-results');
 const status=document.getElementById('catalog-status');
 const retry=document.getElementById('catalog-retry');
 const term=document.getElementById('catalog-target-term');
 const outlook=document.getElementById('catalog-outlook-notice');
 const adapter=window.HanmoAcademicData;
 let offerings=[],state='LOADING',meta=null,loading=false;
 const messages={
   LOADING:'강의 자료를 확인하고 있습니다.',
   NOT_CONNECTED:'강의 자료 연결 전입니다. 학교 원문에서 확인해 주세요.',
   EMPTY:'현재 표시할 강의 자료가 없습니다.',
   OFFLINE:'자료 연결에 실패했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.',
   INVALID:'자료 검증에 실패해 표시를 중단했습니다. 학교 원문을 확인해 주세요.'
 };
 const text=(tag,message,cls)=>{
   const el=document.createElement(tag);el.textContent=message;
   if(cls)el.className=cls;return el;
 };
 /** 검수된 동일 학수번호 묶음의 확인된 분반만 표시합니다. */
 function render(){
   results.replaceChildren();
   if(state!=='READY')return;
   const q=query.value.trim().toLocaleLowerCase('ko');
   const matches=offerings.filter(item=>
     (campus.value==='ALL'||campus.value===item.campus)&&
     (!q||item.courseId.toLocaleLowerCase('ko').includes(q)||
       item.title.toLocaleLowerCase('ko').includes(q)));
   status.textContent='검수된 공개 강좌 '+matches.length+'개 분반 / '+offerings.length+
     '개 분반 · 출처 검수일 '+meta.sourceCheckedAt.slice(0,10)+
     ' · 실제 학사일정·신청 자격은 학교 원문 확인';
   if(!matches.length){
     results.append(text('p','검색 결과 없음','hanmo-empty'));
     return;
   }
   const groups=new Map();
   for(const item of matches){
     const key=item.courseId+'::'+item.campus;
     if(!groups.has(key))groups.set(key,[]);
     groups.get(key).push(item);
   }
   const target=term?.value||'';
   for(const rows of groups.values()){
     const first=rows[0];
     const card=text('article','','hanmo-item');
     card.append(text('h3',first.courseId+' · '+first.title));
     const campusName=first.campus==='SEOUL'?'서울':'글로벌';
     card.append(text('p',campusName+'캠퍼스 · 검수된 자료 '+rows.length+'개 분반'));
     const byTerm=new Map();
     for(const item of rows){
       if(!byTerm.has(item.term))byTerm.set(item.term,[]);
       byTerm.get(item.term).push(item);
     }
     for(const [academicTerm,termRows] of [...byTerm].sort((a,b)=>b[0].localeCompare(a[0]))){
       const teachers=[...new Set(termRows.map(x=>x.instructor).filter(Boolean))].join(' / ');
       card.append(text('p',academicTerm+' 확인된 개설 자료 · '+termRows.length+
         '개 분반'+(teachers?' · '+teachers:'')));
     }
     const inTerm=byTerm.get(target);
     const assessment=inTerm?
       target+' 확인된 자료에 개설 기록 '+inTerm.length+'개 분반이 있습니다. 학교 원문 확인 필요.':
       target+' 전망(보장 아님): 검수된 동일과목 판본·전체학기 관측 범위가 없어 판단 보류(UNKNOWN). 누락 학기를 미개설로 간주하지 않습니다.';
     const note=text('p',assessment,'hanmo-status');
     card.append(note);
     const link=text('a','학교 공식 강좌 정보 확인');
     link.href=first.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';
     card.append(link);results.append(card);
   }
 }

 function show(value){
   state=value.status==='READY'&&!value.offerings.length?'EMPTY':value.status;
   offerings=state==='READY'?value.offerings:[];
   meta=value.meta;
   query.disabled=state!=='READY';
   campus.disabled=state!=='READY';
   if(term)term.disabled=state!=='READY';
   if(outlook)outlook.textContent=state==='READY'? '같은 계절 과거 관측을 검수한 경우에만 전망할 수 있습니다. 현재 확인되지 않은 학기는 UNKNOWN으로 표시합니다.':'강의 자료 연결 전입니다.';
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
   finally{
     loading=false;retry.disabled=false;
     retry.hidden=!['OFFLINE','INVALID'].includes(state);
   }
 }
 query.addEventListener('input',render);
 campus.addEventListener('change',render);
 if(term){
   const d=new Date();
   const year=Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric'}).format(d));
   term.replaceChildren();
   for(const y of [year,year+1])for(const semester of [1,2]){
     const option=new Option(y+'-'+semester,y+'-'+semester);
     term.append(option);
   }
   term.value=(year+1)+'-1';
   term.addEventListener('change',render);
 }
 retry.addEventListener('click',()=>{void refresh();});
 void refresh();
})();
