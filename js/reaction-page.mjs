// @ts-check
// 사용자가 화면 신호 뒤에 눌렀을 때만 유효한 기록을 생성합니다.
// 상태 전이와 유효 샘플 판정은 reaction-profile.mjs의 reactionStep에서 하고, 이 파일은 화면 표시와 사건 연결만 맡습니다.
import {REACTION_COUNT,profileFromSamples,readProfile,saveProfile,initialReactionState,reactionStep} from './reaction-profile.mjs';
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
  let state=initialReactionState(),timer=0,frame=0;
  /** 결과 코드별 안내 문구. 기존 화면 문구를 그대로 유지한다. */
  const MESSAGES={
    EARLY:'너무 빨리 눌렀습니다. 다시 시작하세요.',
    OUT_OF_RANGE:'반응시간이 유효 범위를 벗어났습니다. 처음부터 다시 측정하세요.',
    HIDDEN:'탭이 숨겨져 결과를 폐기했습니다. 다시 측정하세요.',
    CANCELLED:'테스트가 취소되었습니다.',
  };
  /** @param {string} message @param {boolean} [resultReady] */
  function showIdle(message,resultReady=false){
    clearTimeout(timer);cancelAnimationFrame(frame);
    target.dataset.phase='idle';target.textContent='시작을 누르세요';
    target.disabled=true;start.disabled=false;reset.hidden=true;
    if(!resultReady)tally.textContent='0 / '+REACTION_COUNT;
    status.textContent=message;
    start.focus();
  }
  /** @param {import('./reaction-profile.mjs').ReactionEvent} event */
  function dispatch(event){
    const step=reactionStep(state,event);
    state=step.state;
    switch(step.outcome){
      case 'STARTED':case 'WAITING':return waitForSignal();
      case 'SIGNAL':target.dataset.phase='go';target.textContent='지금 누르세요!';return;
      case 'SAMPLE':
        status.textContent='최근 반응 '+step.sample+'ms · 남은 횟수 '+(REACTION_COUNT-state.samples.length);
        target.dataset.phase='break';target.textContent=step.sample+'ms';
        timer=setTimeout(()=>dispatch({type:'next'}),350);
        return;
      case 'COMPLETE':return complete(state.samples);
      case 'EARLY':case 'OUT_OF_RANGE':case 'HIDDEN':case 'CANCELLED':return showIdle(MESSAGES[step.outcome]);
      default:return;
    }
  }
  function waitForSignal(){
    target.dataset.phase='waiting';
    target.textContent='초록색으로 바뀌면 Space 또는 클릭';tally.textContent=(state.samples.length+1)+' / '+REACTION_COUNT;
    const delay=900+Math.floor(Math.random()*1400);
    timer=setTimeout(()=>{
      frame=requestAnimationFrame(()=>dispatch({type:'signal',at:performance.now()}));
    },delay);
  }
  /** @param {number[]} samples 유효 샘플 8개 */
  function complete(samples){
    const profile=profileFromSamples(samples);
    // 저장에 실패하면 전략 실험이 이전 값이나 빈 값을 쓰지 않도록 연결 링크를 숨긴다.
    const saved=saveProfile(null,profile);
    const message=saved?'':'브라우저에 이번 결과를 저장하지 못해 전략 실험에 전달할 수 없습니다.';
    report.textContent='사용자님의 반응속도는 중앙값 '+profile.medianMs+'ms 입니다.';
    strategyLink.hidden=!saved;
    result.hidden=false;
    state=initialReactionState();
    showIdle(message,true);
  }
  /** @param {Event & {timeStamp:number,repeat?:boolean}} event */
  const respond=event=>dispatch({type:'input',timeStamp:event.timeStamp,hidden:document.hidden,repeat:Boolean(event.repeat)});
  target.addEventListener('pointerdown',event=>{
    if(event.isPrimary&&event.button===0)respond(event);
  });
  // 키보드로 버튼을 눌렀을 때 생기는 합성 click(detail 0)만 받는다. 마우스 click은 pointerdown에서 이미 처리했다.
  target.addEventListener('click',event=>{
    if(event.detail===0)respond(event);
  });
  target.addEventListener('keydown',event=>{
    if(event.code!=='Space'&&event.key!=='Enter')return;
    event.preventDefault();
    respond(event);
  });
  start.addEventListener('click',()=>{
    result.hidden=true;
    start.disabled=true;target.disabled=false;reset.hidden=false;
    target.focus({preventScroll:true});
    status.textContent='화면 색이 바뀔 때만 누르세요. 빠른 입력은 무효입니다.';
    dispatch({type:'start'});
  });
  reset.addEventListener('click',()=>dispatch({type:'cancel'}));
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)dispatch({type:'hide'});
  });
}
