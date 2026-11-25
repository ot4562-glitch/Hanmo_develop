// BASIC/TIME/SELECT 결과는 이 브라우저에서 수행한 가상 연습만 집계하며 학교 시스템 데이터를 사용하지 않는다.
// 페이지 사이에 공유하는 저장 키와 소수 셋째 자리 표시를 유지한다.
const $timeBox=document.querySelector('.time');
const $resultBox=document.querySelector('.result');

/** @param {string} key 소요 시간 저장 키 */
function readSavedSeconds(key){
  const seconds=Number(localStorage.getItem(key));
  return Number.isFinite(seconds)&&seconds>=0&&seconds<=Number.MAX_SAFE_INTEGER/1000?seconds:0;
}

/** 저장된 시간 값을 순수하게 읽고 반올림한다. TIME 모드에는 SELECT 측정 구간이 없다. */
function readPracticeReport(){
  const storedCount=Number(localStorage.getItem('psubjectValue'));
  const preselected=Number.isSafeInteger(storedCount)&&storedCount>=0&&storedCount<=15?storedCount:0;
  const mode=Number(localStorage.getItem('practiceSetter'));
  const requested=mode===2?0:Number(localStorage.getItem('subjectValue'));
  // 기존 신청 대기 키와 신규 접속 대기 키를 함께 반영합니다.
  const courseWaiting=localStorage.getItem('waitingValue')??'no';
  const entryWaiting=localStorage.getItem('waitingEntryValue')??'no';
  const waiting=courseWaiting==='yes'||entryWaiting==='yes'?'yes':'no';
  const timeSeconds=readSavedSeconds('TIMEtime').toFixed(3);
  const selected=readSavedSeconds('SELECTtime');
  const waited=waiting==='yes'?readSavedSeconds('SELECTWaitTime'):0;
  const selectSeconds=Math.max(0,selected-waited).toFixed(3);
  const totalSeconds=(Math.round((Number(timeSeconds)+Number(selectSeconds))*1000)/1000).toFixed(3);
  return {preselected,requested,waiting,timeSeconds,selectSeconds,totalSeconds};
}

/** @param {string} title @param {string} value @returns {HTMLParagraphElement} 외부 입력을 HTML로 해석하지 않는 결과 행 */
function reportLine(title,value){
  const p=document.createElement('p');
  p.textContent=title;
  const span=document.createElement('span');
  span.textContent=value;
  p.append(span);
  return p;
}

/** 기존 HTML 호출명·표시 문구·구조를 유지하고 저장 값은 텍스트로만 추가한다. */
function timeCheck(){
  const value=readPracticeReport();
  const count=document.createElement('p');
  count.textContent='연습한 과목 수 '+value.preselected+'개 중 '+value.requested
    +'개 / 접속 대기 여부 '+value.waiting.toUpperCase();
  const caption=document.createElement('p');
  caption.className='caption';
  caption.textContent='※ 접속 대기 시간은 소요 시간에 포함하지 않아요.';
  $timeBox.prepend(
    count,
    reportLine('TIME 부분 소요 시간',value.timeSeconds+'초'),
    reportLine('SELECT 부분 소요 시간',(value.requested>0?value.selectSeconds:'0.000')+'초'),
    caption
  );
  $resultBox.prepend(
    reportLine('총 소요 시간',(value.requested>0?value.totalSeconds:value.timeSeconds)+'초')
  );
}
timeCheck();
