// 설정 페이지의 함수는 vsugang.html의 인라인 onclick에서 호출하므로 전역으로 유지한다.
// 이벤트 연결 방식을 바꿀 때는 별도 PR에서 회귀 테스트를 수행한다.
const printValue=document.getElementsByClassName('printValue')[0];
const settingSection=document.getElementsByClassName('settingSection')[0];
const psugangInput=document.getElementsByClassName('psugangVal')[0];
const vsugangInput=document.getElementsByClassName('vsugangVal')[0];

let isSettedValue=false;

/** 이 저장 키들은 기존 페이지 간 계약이므로 이름을 변경하지 않는다. */
function validSetting(preselected,requested,waiting){
  return Number.isInteger(preselected)&&preselected>=1&&preselected<=15
    &&Number.isInteger(requested)&&requested>=1&&requested<=preselected
    &&(waiting==='yes'||waiting==='no');
}

function hasValidPracticeSettings(){
  const preselected=Number(localStorage.getItem('psubjectValue'));
  const requested=Number(localStorage.getItem('subjectValue'));
  const waiting=localStorage.getItem('waitingValue');
  return validSetting(preselected,requested,waiting);
}

function setValue(){
  isSettedValue=hasValidPracticeSettings();
  // 두 메뉴 타일의 배경을 통일하고 설정 상태는 문구와 글자색으로 구별합니다.
  printValue.innerText=isSettedValue
    ?'올바른 설정값이 들어갔어요.'
    :'연습 전 과목 수를 설정해 주세요.';
  printValue.style.color=isSettedValue?'#e9f0f4':'#e9c7a8';
}

/** 인라인 HTML의 모드 식별값: BASIC=1, TIME=2, SELECT=3. */
function goPractice(mode){
  if(!isSettedValue){
    alert('SETTING에서 과목 수를 지정해주세요.');
    return;
  }
  localStorage.setItem('practiceSetter',mode);
  location.href='practice.html';
}

function getSettingValue(){
  const preselected=Number(psugangInput.value);
  const requested=Number(vsugangInput.value);
  const courseWaiting=document.querySelector('input[name="waitingCourseYN"]:checked')?.value;
  const entryWaiting=document.querySelector('input[name="waitingEntryYN"]:checked')?.value;
  if(!validSetting(preselected,requested,courseWaiting)||
    (entryWaiting!=='yes'&&entryWaiting!=='no')){
    alert('설정 값을 다시 확인해주세요.');
    return;
  }
  localStorage.setItem('psubjectValue',preselected);
  localStorage.setItem('subjectValue',requested);
  // 기존 waitingValue는 강의 신청 대기열 전용으로 유지한다.
  localStorage.setItem('waitingValue',courseWaiting);
  localStorage.setItem('waitingEntryValue',entryWaiting);
  settingSection.style.display='none';
  setValue();
}

function openSettingPanel(){
  settingSection.style.display='flex';
  psugangInput.value=localStorage.getItem('psubjectValue')??'';
  vsugangInput.value=localStorage.getItem('subjectValue')??'';
  // 저장된 사용자 선택을 복원하며, 최초 방문은 HTML의 기본값(예/아니오)을 사용한다.
  const storedCourse=localStorage.getItem('waitingValue');
  const storedEntry=localStorage.getItem('waitingEntryValue');
  if(storedCourse==='yes'||storedCourse==='no'){
    const choice=document.querySelector('input[name="waitingCourseYN"][value="'+storedCourse+'"]');
    if(choice)choice.checked=true;
  }
  if(storedEntry==='yes'||storedEntry==='no'){
    const choice=document.querySelector('input[name="waitingEntryYN"][value="'+storedEntry+'"]');
    if(choice)choice.checked=true;
  }
}

function closeSettingPanel(){
  settingSection.style.display='none';
}

setValue();
