/* Self-reported credit arithmetic only. No persistence and no degree audit. */
(function(){
 'use strict';
 const form=document.getElementById('credit-form');
 if(!form)return;
 const summary=document.getElementById('credit-summary');
 const status=document.getElementById('credit-status');
 const bar=document.getElementById('credit-bar');
 const val=id=>Number(document.getElementById(id).value);
 const text=(tag,value)=>{const n=document.createElement(tag);n.textContent=value;return n;};
 form.addEventListener('submit',event=>{
   event.preventDefault();
   if(!form.reportValidity())return;
   const target=val('credit-target'),earned=val('credit-earned'),going=val('credit-going'),planned=val('credit-planned');
   const all=[target,earned,going,planned];
   if(!all.every(Number.isFinite)||target<=0||all.slice(1).some(x=>x<0)||earned>400){
     status.textContent='학점이 올바르게 입력됐는지 확인해 주세요.';return;
   }
   const left=Math.max(0,target-earned);
   summary.replaceChildren();
   summary.append(text('h3','현재 취득 '+earned+'학점 · 목표까지 '+left+'학점'));
   summary.append(text('p','수강 중 '+going+'학점과 예정 '+planned+'학점은 취득 학점에 합산하지 않았습니다.'));
   summary.append(text('p','입력값끼리만 비교한 참고 결과입니다. 재수강, 필수 이수영역, 교육과정 적용 기준은 확인하지 않았습니다.'));
   bar.style.width=Math.min(100,Math.max(0,earned/target*100))+'%';
   status.textContent='현재 목표 대비 취득 학점 비율 '+Math.round(Math.min(100,earned/target*100))+'%';
 });
 form.addEventListener('reset',()=>{
   summary.replaceChildren();
   summary.append(text('h3','숫자를 입력하면 결과가 표시됩니다.'));
   summary.append(text('p','학칙·대체인정·중복 이수는 계산하지 않습니다.'));
   bar.style.width='0%';status.textContent='';
 });
})();
