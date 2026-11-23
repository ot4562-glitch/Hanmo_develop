// 홈 화면은 알림과 이용 가능 상태만 다룬다. BASIC/TIME/SELECT의 실제 연습 로직은 각 연습 페이지에 있다.
// 모든 시각은 사용자 브라우저의 로컬 시간을 기준으로 한다.
const $NOTICELIST=document.getElementsByClassName('noticeList')[0];
const $GANEUNG=document.getElementsByClassName('ganeung')[0];
const $JEHAN=document.getElementsByClassName('jehan')[0];
const title=document.getElementsByClassName('title')[0];
const $TITLECONTAINER=document.getElementsByClassName('titleContainer')[0];
const $CONTAINER=document.getElementsByClassName('container')[0];
const $PHONECONTAINER=document.getElementsByClassName('phoneContainer')[0];
const nowTime=new Date();

// 확인 가능한 한모 자체 안내만 교체하며 학교 공지를 가장하지 않습니다.
const notices=[
  {text:'한모 업데이트 보기',href:'https://everytime.kr/374012/v/415946307'},
  {text:'돌발상황 연습은 BASIC에서 설정할 수 있어요.',href:'./html/vsugang.html'},
];
const noticeItems=notices.map(notice=>{
  const li=document.createElement('li');
  const link=document.createElement('a');
  link.href=notice.href;
  link.textContent=notice.text;
  li.append(link);
  return li;
});
$NOTICELIST.replaceChildren(...noticeItems);
let noticeIndex=0;
function showNotice(index){
  noticeItems.forEach((item,offset)=>{item.hidden=offset!==index;});
}
showNotice(noticeIndex);
if(noticeItems.length>1){
  setInterval(()=>{
    // 마우스·키보드로 공지를 읽는 동안에는 자동으로 교체하지 않습니다.
    if(document.hidden||$NOTICELIST.matches(':hover')||$NOTICELIST.matches(':focus-within'))return;
    noticeIndex=(noticeIndex+1)%noticeItems.length;
    showNotice(noticeIndex);
  },5000);
}

function check(){
  if(localStorage.getItem('deviceInfo')==='false'){
    $CONTAINER.style.display='none';
    $TITLECONTAINER.style.display='none';
    $PHONECONTAINER.style.display='flex';
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
