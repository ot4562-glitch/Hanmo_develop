// @ts-check
// 사용자가 화면 신호 뒤에 눌렀을 때만 유효한 기록을 생성합니다.
import {REACTION_KEY,REACTION_COUNT,profileFromSamples,readProfile} from './reaction-profile.mjs';
const start=document.getElementById('reaction-start');
if(start){
  const target=document.getElementById('reaction-target');
  const status=document.getElementById('reaction-status');
  const tally=document.getElementById('reaction-count');
  const report=document.getElementById('reaction-report');
  const result=document.getElementById('reaction-result');
  const strategyLink=result.querySelector('a');
  const reset=document.getElementById('reaction-reset');
  const p=readProfile();
  if(p){report.textContent='사용자님의 반응속도는 중앙값 '+p.medianMs+'ms 입니다.';result.hidden=false;}
  let phase='idle',timer=0,frame=0,shownAt=0;
  const samples=[];
  function stop(message,resultReady=false){
    clearTimeout(timer);cancelAnimationFrame(frame);samples.length=0;
    phase='idle';target.dataset.phase='idle';target.textContent='시작을 누르세요';
    target.disabled=true;start.disabled=false;reset.hidden=true;
    if(!resultReady)tally.textContent='0 / '+REACTION_COUNT;
    status.textContent=message;
    start.focus();
  }
  function next(){
    if(samples.length===REACTION_COUNT){
      const profile=profileFromSamples(samples);
      let message='';
      try{localStorage.setItem(REACTION_KEY,JSON.stringify(profile));}
      catch{message='브라우저에 이번 결과를 저장하지 못해 전략 실험에 전달할 수 없습니다.';}
      report.textContent='사용자님의 반응속도는 중앙값 '+profile.medianMs+'ms 입니다.';
      strategyLink.hidden=Boolean(message);
      result.hidden=false;
      stop(message,true);
      return;
    }
    phase='waiting';target.dataset.phase='waiting';
    target.textContent='초록색으로 바뀌면 Space 또는 클릭';tally.textContent=(samples.length+1)+' / '+REACTION_COUNT;
    const delay=900+Math.floor(Math.random()*1400);
    timer=setTimeout(()=>{
      frame=requestAnimationFrame(()=>{
        phase='go';target.dataset.phase='go';target.textContent='지금 누르세요!';
        shownAt=performance.now();
      });
    },delay);
  }
  function respond(event){
    if(document.hidden)return;
    if(phase==='waiting'||(phase==='go'&&event.timeStamp<shownAt)){
      stop('너무 빨리 눌렀습니다. 다시 시작하세요.');
      return;
    }
    if(phase!=='go')return;
    const elapsed=event.timeStamp-shownAt;
    if(elapsed<80||elapsed>3000){
      stop('반응시간이 유효 범위를 벗어났습니다. 처음부터 다시 측정하세요.');
      return;
    }
    const ms=Math.round(elapsed);
    samples.push(ms);
    status.textContent='최근 반응 '+ms+'ms · 남은 횟수 '+(REACTION_COUNT-samples.length);
    phase='break';target.dataset.phase='break';
    target.textContent=ms+'ms';
    timer=setTimeout(next,350);
  }
  target.addEventListener('pointerdown',event=>{
    if(event.isPrimary&&event.button===0)respond(event);
  });
  target.addEventListener('click',event=>{
    if(event.detail===0)respond(event);
  });
  target.addEventListener('keydown',event=>{
    if(event.code!=='Space'&&event.key!=='Enter')return;
    event.preventDefault();
    if(!event.repeat)respond(event);
  });
  start.addEventListener('click',()=>{
    result.hidden=true;
    start.disabled=true;target.disabled=false;reset.hidden=false;
    target.focus({preventScroll:true});
    status.textContent='화면 색이 바뀔 때만 누르세요. 빠른 입력은 무효입니다.';
    next();
  });
  reset.addEventListener('click',()=>stop('테스트가 취소되었습니다.'));
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden&&phase!=='idle')stop('탭이 숨겨져 결과를 폐기했습니다. 다시 측정하세요.');
  });
}
