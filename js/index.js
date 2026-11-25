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

// 원본 Hanmo의 NOTICE 문구와 5초 간격 세로 순환을 복원합니다.
const notices=[
  {text:'한모 업데이트 내용은 여기를 눌러 확인해주세요.',href:'https://everytime.kr/374012/v/415946307'},
  {text:'1년간 4만 명의 학우가 사용한 한모 (2025)'}
];
const noticeItems=notices.map(notice=>{
  const li=document.createElement('li');
  if(notice.href){
    const link=document.createElement('a');
    link.href=notice.href;
    link.textContent=notice.text;
    li.append(link);
  }else{
    li.textContent=notice.text;
  }
  return li;
});
$NOTICELIST.replaceChildren(...noticeItems);
let noticeIndex=0;
function showNotice(index){
  $NOTICELIST.style.bottom=index===0?'0px':'77px';
}
showNotice(noticeIndex);
if(noticeItems.length>1){
  setInterval(()=>{
    // 사용자가 공지에 집중하는 동안에는 문구를 교체하지 않습니다.
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

// 배너별 종료일은 브라우저 현지 날짜 기준으로 해당 날짜까지 포함합니다.
function updateHomeBanners(date=nowTime){
  const region=document.getElementsByClassName('home-banners')[0];
  if(!region)return;
  const today=String(date.getFullYear()).padStart(4,'0')+'-'
    +String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
  let visible=0;
  for(const banner of Array.from(region.children)){
    const end=banner.dataset?.endDate;
    banner.hidden=Boolean(end&&today>end);
    if(!banner.hidden)visible++;
  }
  region.hidden=visible===0;
}
setSemester();
updateHomeBanners();
check();
