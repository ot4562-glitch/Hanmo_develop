// 홈 화면은 알림과 이용 가능 상태만 다룬다. BASIC/TIME/SELECT의 실제 연습 로직은 각 연습 페이지에 있다.
// 모든 시각은 사용자 브라우저의 로컬 시간을 기준으로 한다.
const $NOTICELIST=document.getElementsByClassName('noticeList')[0];
const $GANEUNG=document.getElementsByClassName('ganeung')[0];
const $JEHAN=document.getElementsByClassName('jehan')[0];
const $ADFIT=document.getElementsByClassName('adfit')[0];
const title=document.getElementsByClassName('title')[0];
const $TITLECONTAINER=document.getElementsByClassName('titleContainer')[0];
const $CONTAINER=document.getElementsByClassName('container')[0];
const $PHONECONTAINER=document.getElementsByClassName('phoneContainer')[0];
const nowTime=new Date();

// 검증된 정적 공지만 사용한다. 사용자 입력 HTML을 이 영역에 직접 삽입하지 않는다.
const noticeList=[
  '<a href="https://everytime.kr/374012/v/415946307">한모 업데이트 내용은 여기를 눌러 확인해주세요.</a>',
  '1년간 4만 명의 학우가 사용한 한모 (2025)',
];
for(let index=noticeList.length-1;index>=0;index--){
  $NOTICELIST.insertAdjacentHTML('afterbegin','<li>'+noticeList[index]+'</li>');
}

let homeNoticeIndex=0;
function rotateNotice(){
  $NOTICELIST.style.bottom=homeNoticeIndex===0?'77px':'0px';
  homeNoticeIndex=(homeNoticeIndex+1)%2;
}
setInterval(rotateNotice,5000);

function check(){
  if(localStorage.getItem('deviceInfo')==='false'){
    $CONTAINER.style.display='none';
    $TITLECONTAINER.style.display='none';
    $PHONECONTAINER.style.display='flex';
    $ADFIT.style.display='none';
  }
  // 제한 시간 안내는 유지하되 선택 화면으로 가는 버튼은 항상 표시합니다.
  // 실제 모의신청 진입 제한은 하위 연습 화면에서 유지합니다.
  if((nowTime.getHours()===9&&nowTime.getMinutes()>=58)
    ||(nowTime.getHours()===10&&nowTime.getMinutes()<=10)){
    // 버튼 대신 상태 안내만 변경합니다.
    $GANEUNG.classList.remove('thisTime');
    $JEHAN.classList.add('thisTime');
  }
}

function setSemester(){
  title.innerText=nowTime.getFullYear()+'-'+(nowTime.getMonth()>=6?2:1)+'학기';
}

setSemester();
check();
