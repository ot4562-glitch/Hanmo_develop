// SELECT/BASIC 모의신청 화면. 기존 HTML의 인라인 이벤트가 호출하므로
// registerClick, pyoDisplay, deleteDone은 전역 함수로 유지한다.
// 과목·대기열·처리 시간은 모두 가상 데이터다.
const practiceValue=Number(localStorage.getItem('practiceSetter'));
const preselectedCount=Number(localStorage.getItem('psubjectValue'));
const targetCount=Number(localStorage.getItem('subjectValue'));
const waitingValue=localStorage.getItem('waitingValue');

const subjectTable=document.querySelector('.table');
const registeredTable=document.getElementsByClassName('done')[0];
const waiting=document.getElementsByClassName('unvisible')[0];
const waitingArea=document.getElementsByClassName('unvisible')[1];
const searchButton=document.querySelector('.search');
const practiceMode=document.getElementsByClassName('practiceMode')[0];
const waitingCountEl=document.querySelector('.waitingCount');
const waitingTimeEl=document.querySelector('.waitingTime');
const waitingBarFillEl=document.querySelector('.waitingBarFill');
const waitingBehindEl=document.querySelector('.waitingBehind');
const waitingCloseBtn=document.querySelector('.waitingCloseBtn');

// 번호별 과목 매핑과 신청 여부 플래그는 이 연습 페이지에서만 사용한다.
// 이를 실제 학업 과목 기록과 동기화하지 않는다.
const noObject={};
const rc=Array(Math.max(0,targetCount)).fill(false);
const processingRegistrations=new Set();
const closedCourses=new Set();
const CAPACITY_KEY='hanmo.syntheticCapacity.active.v1';
let capacityEnabled=false;
try{
  capacityEnabled=practiceValue===1&&sessionStorage.getItem(CAPACITY_KEY)==='yes';
}catch{/* 저장소가 차단된 브라우저는 기본 OFF로 안전하게 실행한다. */}
const capacityFullCourseId=capacityEnabled&&Number.isSafeInteger(preselectedCount)&&preselectedCount>0
  ?Math.floor(Math.random()*preselectedCount)+1:null;
const syntheticNames=new Map();
let courseMode='INTEREST';
let count=0; // 현재 신청한 과목 수이며 삭제 시 감소한다.
let cnt=0;   // 화면 표시 행 수이며 신청 목표와 분리해 관리한다.
let totalWaitedMs=0; // 결과의 SELECT 소요시간에서 제외하는 합성 대기시간이다.
const selectStartedAt=new Date();

document.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(button)button.focus();
},true);

/** 실제 학교 시간표가 아닌 가상의 사전 선택 목록만 표시한다. */
function renderPracticeCourses(){
  for(let index=1;index<=preselectedCount;index++){
    subjectTable.insertAdjacentHTML('beforeend',
      '<tr id="subject'+index+'">'
      +'<td>'+index+'</td>'
      +'<td><button class="register" onClick="registerClick('+index+')" tabIndex="-1"></button></td>'
      +'<td>연습</td><td>H00000000</td><td></td>'
      +'<td>모의수강신청 과목'+index+'</td>'
      +'<td>1</td><td>1</td>'
      +'<td>Hankuk University of F.S. Professor '+index+'</td>'
      +'<td>월 1 2 3 ( )</td><td>0 / 100</td>'
      +'<td><input type="checkbox"></td><td></td></tr>');
  }
}

/** 라디오만 누르면 조회조건만 전환하고 Search 전에는 표를 표시하지 않는다. */
function bindCourseModes(){
  const nav=document.getElementById?.('course-mode-nav');
  if(!nav||typeof nav.querySelector!=='function')return;
  const hint=document.getElementById('course-search-prompt');
  const generalWarning=document.getElementById('course-general-warning');
  const sync=()=>{
    const radio=nav.querySelector('input[name="course-mode"]:checked');
    courseMode=['MAJOR','GENERAL','FOUNDATION'].includes(radio?.value)?radio.value:'INTEREST';
    nav.dataset.mode=courseMode;
    for(const extra of nav.querySelectorAll('.menu-extra')){
      extra.hidden=extra.dataset.courseFilter!==courseMode;
    }
    if(generalWarning)generalWarning.hidden=courseMode!=='GENERAL';
    if(hint)hint.hidden=false;
    subjectTable.style.display='none';
  };
  nav.addEventListener('change',event=>{
    if(event.target?.matches?.('input[name="course-mode"]'))sync();
  });
  sync();
}

/** 선택 조건 미설정 시 기존 표·대기열을 그대로 두고 브라우저 알림만 표시한다. */
function validateCourseFilter(){
  const nav=document.getElementById?.('course-mode-nav');
  if(!nav||typeof nav.querySelector!=='function')return true;
  const required={
    MAJOR:[['학과선택','학과를 선택해주세요.']],
    GENERAL:[['교양과목','교양과목을 선택해주세요.'],['교양 조회구분','조회구분을 선택해주세요.']],
    FOUNDATION:[['기초 조회구분','조회구분을 선택해주세요.']],
  };
  for(const [name,message] of required[courseMode]??[]){
    const select=nav.querySelector('select[aria-label="'+name+'"]');
    if(!select||!select.value){
      alert(message);
      select?.focus();
      return false;
    }
  }
  return true;
}

/** 대체 과목은 학사 DB가 아닌 연습 전용 합성 값만 사용한다. */
function renderCourseMode(){
  if(typeof subjectTable.querySelectorAll!=='function')return;
  for(const row of subjectTable.querySelectorAll('[data-synthetic-alternative]'))row.remove();
  for(const row of subjectTable.querySelectorAll('[id^="subject"]')){
    row.hidden=courseMode!=='INTEREST';
  }
  if(courseMode==='INTEREST')return;
  const modes={MAJOR:{name:'전공',offset:0},GENERAL:{name:'교양',offset:6},
    FOUNDATION:{name:'기초',offset:12}};
  const mode=modes[courseMode];
  if(!mode)return;
  for(let i=1;i<=6;i++){
    const courseId=preselectedCount+mode.offset+i;
    const tr=document.createElement('tr');
    syntheticNames.set(courseId,'가상 '+mode.name+' 대체과목 '+i);
    tr.id='subject'+courseId;
    tr.dataset.syntheticAlternative='true';
    const values=[String(i),'',mode.name,'H00000000','','가상 '+mode.name+' 대체과목 '+i,
      '1','1','가상 연습 교수','월 1 2 3 ( )','0 / 100','',''];
    for(const [index,value] of values.entries()){
      const td=document.createElement('td');
      if(index===1){
        const button=document.createElement('button');
        button.className='register';
        button.type='button';
        button.setAttribute('onclick','registerClick('+courseId+')');
        button.tabIndex=-1;
        button.setAttribute('aria-label','가상 '+mode.name+' 대체과목 '+i+' 신청');
        td.append(button);
      }else if(index===11){
        const checkbox=document.createElement('input');
        checkbox.type='checkbox';td.append(checkbox);
      }else td.textContent=value;
      tr.append(td);
    }
    subjectTable.append(tr);
  }
}

/** 마감된 가상 과목의 신청 칸은 문구·그림 없이 비우며 다시 신청할 수 없다. */
function markCourseFull(courseId){
  closedCourses.add(courseId);
  const row=document.getElementById?.('subject'+courseId);
  const button=row?.querySelector?.('button.register');
  if(button){
    const cell=button.parentElement;
    button.remove();
    if(cell)cell.setAttribute('aria-label','가상 정원 마감');
    if(row.cells?.[10])row.cells[10].textContent='100 / 100';
  }
}

function formatWaitTime(milliseconds){
  const totalSeconds=Math.ceil(milliseconds/1000);
  const minutes=String(Math.floor(totalSeconds/60)).padStart(2,'0');
  const seconds=String(totalSeconds%60).padStart(2,'0');
  return '00:'+minutes+':'+seconds;
}

function showWaiting(show){
  waiting.style.display=show?'flex':'none';
  waitingArea.style.display=show?'flex':'none';
  searchButton.disabled=show;
}

/** 각 가상 대기열은 닫기 버튼과 타이머를 독립적으로 소유하며 종료 처리는 중복 호출해도 안전하다. */
function waitingFunc(){
  const triggerElement=document.activeElement;
  const durationMs=Math.floor(Math.random()*10000)+1000;
  const initialAhead=Math.floor(Math.random()*2000)+1;
  const started=Date.now();
  let ahead=initialAhead;
  let behind=0;
  let settled=false;
  let intervalId;

  showWaiting(true);
  waitingCountEl.textContent=String(ahead);
  waitingTimeEl.textContent=formatWaitTime(durationMs);
  waitingBarFillEl.style.width='0%';
  waitingBehindEl.textContent='0';

  return new Promise(resolve=>{
    const finish=completed=>{
      if(settled)return;
      settled=true;
      clearInterval(intervalId);
      totalWaitedMs+=Date.now()-started;
      showWaiting(false);
      if(triggerElement&&typeof triggerElement.focus==='function')triggerElement.focus();
      resolve(completed);
    };

    waitingCloseBtn.onclick=()=>finish(false);
    intervalId=setInterval(()=>{
      if(settled)return;
      const elapsed=Math.max(0,Date.now()-started);
      const remaining=Math.max(0,durationMs-elapsed);
      const ratio=remaining/durationMs;
      const jitter=0.7+Math.random()*0.6;
      const target=Math.floor(initialAhead*ratio*jitter);
      ahead=remaining<=0?0:Math.max(0,Math.min(ahead,target));
      if(remaining>0)behind+=Math.floor(Math.random()*30);
      waitingBarFillEl.style.width=String(Math.min(elapsed/durationMs*100,100))+'%';
      waitingTimeEl.textContent=formatWaitTime(remaining);
      waitingCountEl.textContent=String(ahead);
      waitingBehindEl.textContent=String(behind);
      if(remaining<=0)finish(true);
    },1000);
  });
}

/** HTML 검색 버튼이 호출하는 기존 인라인 진입점을 유지한다. */
async function pyoDisplay(){
  if(!validateCourseFilter())return;
  if(waitingValue==='yes'&&!await waitingFunc())return;
  if(waitingValue!=='yes')showWaiting(false);
  renderCourseMode();
  subjectTable.style.display='table';
  const hint=document.getElementById?.('course-search-prompt');
  if(hint)hint.hidden=true;
}

/** 신청 내역의 값과 열 순서는 기존 13열 테이블 계약을 따른다. */
function makeRegisteredRow(courseId,position){
  const row=document.createElement('tr');
  row.setAttribute('id',String(position));
  const texts=[
    String(position),'','연습','H00000000','',
    syntheticNames.get(courseId)??'모의수강신청 과목'+courseId,'1','1',
    'Hankuk University of F.S. Professor '+courseId,
    '월 1 2 3 ( )','0 / 100','','',
  ];
  for(let col=0;col<texts.length;col++){
    const cell=document.createElement('td');
    if(col===1){
      const button=document.createElement('button');
      button.setAttribute('class','delete');
      button.setAttribute('onClick','deleteDone('+position+')');
      cell.appendChild(button);
    }else if(col===11){
      const input=document.createElement('input');
      input.setAttribute('type','checkbox');
      cell.appendChild(input);
    }else{
      cell.textContent=texts[col];
    }
    row.appendChild(cell);
  }
  return row;
}

function done(courseId){
  cnt++;
  noObject[cnt]=courseId;
  registeredTable.appendChild(makeRegisteredRow(courseId,cnt));
}

/** 신청은 브라우저 안에서만 처리하며 요청한 과목 수에 도달하면 기존 흐름을 종료한다. */
function saveSugang(courseId){
  showWaiting(false);
  if(rc[courseId-1]===true){
    alert('이미 신청된 교과목을 신청하였습니다.\n다시 확인하시고 신청해 주십시오.');
    return;
  }
  if(closedCourses.has(courseId))return;
  alert('수강신청이 저장완료되었습니다.');
  rc[courseId-1]=true;
  count++;
  done(courseId);
  if(count===targetCount)stopStopwatch();
}

/** 인라인 HTML에서 호출된다. 대기열이 진행 중일 때 중복 신청을 막는다. */
function registerClick(courseId){
  if(closedCourses.has(courseId)||processingRegistrations.has(courseId))return;
  if(!confirm('모의수강신청 과목'+courseId+'을 수강신청 하시겠습니까?'))return;

  processingRegistrations.add(courseId);
  if(waitingValue==='yes'){
    waitingFunc().then(completed=>{
      processingRegistrations.delete(courseId);
      if(completed)saveSugang(courseId);
    });
  }else{
    processingRegistrations.delete(courseId);
    saveSugang(courseId);
  }
}

/** result.js와 공유하는 저장 키, result.html로 이동하는 기존 경로를 유지한다. */
function stopStopwatch(){
  localStorage.setItem('SELECTtime',(new Date()-selectStartedAt)/1000);
  localStorage.setItem('SELECTWaitTime',totalWaitedMs/1000);
  location.replace('result.html');
}

/** 가상 신청 항목을 제거한 뒤 화면 표시 번호와 이벤트 연결만 다시 매긴다. */
function deleteDone(position){
  if(!confirm('해당 과목을 삭제 하시겠습니까?'))return;
  const courseId=noObject[position];
  if(courseId===undefined)return;
  rc[courseId-1]=false;
  registeredTable.deleteRow(position-1);
  for(let index=position;index<cnt;index++)noObject[index]=noObject[index+1];
  delete noObject[cnt];
  cnt--;
  count--;

  // 공백 텍스트 노드까지 포함하는 childNodes 대신 실제 요소 자식만 사용한다.
  for(let index=0;index<registeredTable.children.length;index++){
    const row=registeredTable.children[index];
    row.setAttribute('id',String(index+1));
    const cells=row.children;
    cells[0].textContent=String(index+1);
    cells[1].firstElementChild.setAttribute('onClick','deleteDone('+(index+1)+')');
  }
  alert('수강신청함에서 선택한 과목이 삭제완료되었습니다.');
}

practiceMode.innerText=practiceValue===1?'연습 모드: BASIC MODE':'연습 모드: SELECT MODE';
renderPracticeCourses();
if(capacityFullCourseId!==null)markCourseFull(capacityFullCourseId);
bindCourseModes();
