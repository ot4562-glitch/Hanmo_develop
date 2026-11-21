import {stageStudentEntry,takeStudentEntry} from '../views/student-entry.js';

const get=(id:string):HTMLInputElement|HTMLSelectElement|null=>{
 const n=document.getElementById(id);
 return n instanceof HTMLInputElement||n instanceof HTMLSelectElement?n:null;
};
const go=document.getElementById('planner-go-notices');
if(go instanceof HTMLButtonElement){
 go.addEventListener('click',()=>{
   const form=document.getElementById('planner-profile');
   if(form instanceof HTMLFormElement&&!form.reportValidity())return;
   const message=document.getElementById('planner-message');
   const raw={campus:get('planner-campus')?.value,major:get('planner-major')?.value,
    doubleMajor:get('planner-secondary-kind')?.value==='DOUBLE'?(get('planner-double')?.value??''):'',
    minor:get('planner-secondary-kind')?.value==='MINOR'?(get('planner-double')?.value??''):'',
    cohort:get('planner-cohort')?.value??''};
   try{
     stageStudentEntry(sessionStorage,raw);
     window.location.assign('./academic-timeline.html');
   }catch(error){
     if(message)message.textContent=error instanceof Error?error.message:'전공 정보를 확인해 주세요.';
   }
 });
}
const context=document.getElementById('notice-context');
if(context){
 let entry=null;
 try{entry=takeStudentEntry(sessionStorage);}catch{/* private mode */}
 if(entry){
   const campus=entry.campus==='SEOUL'?'서울캠퍼스':'글로벌캠퍼스';
   const optional=entry.doubleMajor?' · 이중전공 '+entry.doubleMajor:
     entry.minor?' · 부전공 '+entry.minor:'';
   const cohort=entry.cohort?' · 입학년도 '+entry.cohort:'';
   context.textContent='선택한 학업 조건: '+campus+' · '+entry.major+optional+cohort+
    ' · 본인 입력값이며 공식 소속/공지 대상 판정이 아닙니다. 참고 공지의 실제 적용 여부는 학교 원문에서 확인하세요.';
 }
}
