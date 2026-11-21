/* Self-reported profile. Only this browser's localStorage is used; no auth/network. */
(function(){
 'use strict';
 const form=document.getElementById('planner-profile');
 if(!form)return;
 const campus=document.getElementById('planner-campus');
 const major=document.getElementById('planner-major');
 const kind=document.getElementById('planner-secondary-kind');
 const second=document.getElementById('planner-double');
 const cohort=document.getElementById('planner-cohort');
 const message=document.getElementById('planner-message');
 const clear=document.getElementById('planner-clear');
 const key='hanmo:student-planner:profile:v1';
 function syncSecond(){
   const active=kind.value==='DOUBLE'||kind.value==='MINOR';
   second.disabled=!active;
   second.required=active;
   second.placeholder=kind.value==='MINOR'?'부전공명을 입력하세요':
     kind.value==='DOUBLE'?'이중전공명을 입력하세요':'해당사항 없음';
   if(!active)second.value='';
 }
 function announce(){
   window.dispatchEvent(new Event('hanmo:profile-changed'));
 }
 try{
   const raw=localStorage.getItem(key);
   if(raw&&raw.length<4096){
     const value=JSON.parse(raw);
     if(value&&typeof value==='object'&&!Array.isArray(value)){
       campus.value=['SEOUL','GLOBAL'].includes(value.campus)?value.campus:'';
       major.value=typeof value.major==='string'?value.major.slice(0,100):'';
       kind.value=value.secondaryKind==='MINOR'?'MINOR':
         value.secondaryKind==='DOUBLE'?'DOUBLE':
         typeof value.doubleMajor==='string'&&value.doubleMajor.trim()?'DOUBLE':'NONE';
       second.value=kind.value==='MINOR'
         ?typeof value.minor==='string'?value.minor.slice(0,100):''
         :typeof value.doubleMajor==='string'?value.doubleMajor.slice(0,100):'';
       cohort.value=Number.isSafeInteger(value.cohort)&&value.cohort>=2010&&value.cohort<=2100
         ?String(value.cohort):'';
       message.textContent='이 브라우저의 저장된 정보를 불러왔습니다. 학교 로그인 정보가 아닙니다.';
     }
   }
 }catch{message.textContent='저장된 정보를 읽지 못했습니다. 입력 없이도 다른 기능을 이용할 수 있습니다.';}
 syncSecond();
 kind.addEventListener('change',()=>{
   second.value='';
   syncSecond();
 });
 form.addEventListener('submit',event=>{
   event.preventDefault();
   if(!form.reportValidity())return;
   const majorName=major.value.trim();
   const year=Number(cohort.value);
   const selected=kind.value;
   const optional=selected==='NONE'?'':second.value.trim();
   if(!majorName||!Number.isSafeInteger(year)||year<2010||year>2100||
     (selected!=='NONE'&&!optional)){
     message.textContent='캠퍼스·전공·학번 및 선택한 부전공/이중전공명을 확인해 주세요.';
     return;
   }
   const data={
     campus:campus.value,major:majorName.slice(0,100),
     secondaryKind:selected,
     doubleMajor:selected==='DOUBLE'?optional.slice(0,100):'',
     minor:selected==='MINOR'?optional.slice(0,100):'',
     cohort:year,
   };
   try{
     localStorage.setItem(key,JSON.stringify(data));
     message.textContent='내정보를 이 브라우저에 저장했습니다. 학교 계정이나 학적과 연결되지 않습니다.';
     announce();
   }catch{message.textContent='이 브라우저에 저장할 수 없습니다. 다른 메뉴는 그대로 이용할 수 있습니다.';}
 });
 clear.addEventListener('click',()=>{
   try{localStorage.removeItem(key);}catch{/* private browsing */}
   form.reset();
   second.value='';
   syncSecond();
   message.textContent='저장된 내정보를 지웠습니다.';
   announce();
 });
})();
