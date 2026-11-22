// 하위 페이지의 이용 제한과 학기 표시를 유지하면서 선택형 404의 페이지 이동만 감시합니다.
// 원본 practice/selectZone 코드와 버튼·대기열·시간 기록은 수정하지 않습니다.
const now=new Date();
const title=document.getElementsByClassName('title')[0];
const HANMO_404_TRANSITION_KEY='hanmo.synthetic404.transition.v3';
const HANMO_404_TRANSITION_VERSION=3;
const HANMO_404_TRANSITION_TTL_MS=30*60*1000;

function currentHanmoPage(){
  const route=String(location.pathname||location.href||'').split(/[?#]/)[0];
  return route.slice(route.lastIndexOf('/')+1);
}

function restrictHanmo(){
  const restricted=(now.getHours()===9&&now.getMinutes()>=58)
    ||(now.getHours()===10&&now.getMinutes()<=10);
  // 모드 선택 화면은 이용 제한 안내 중에도 열 수 있게 두고,
  // 실제 연습 페이지의 기존 시간/PC 제한은 유지합니다.
  const isModeMenu=currentHanmoPage()==='vsugang.html';
  if((restricted&&!isModeMenu)||localStorage.getItem('deviceInfo')==='false'){
    location.href='/';
    return true;
  }
  return false;
}

function routeHanmoIncident(){
  const page=currentHanmoPage();
  if(page!=='practice.html'&&page!=='selectZone.html')return;
  let session,entry;
  try{
    session=typeof sessionStorage==='object'?sessionStorage:null;
    entry=JSON.parse(session?.getItem(HANMO_404_TRANSITION_KEY)||'null');
  }catch(_error){return;}
  if(!session||!entry)return;
  const elapsed=Date.now()-entry.at;
  if(entry.version!==HANMO_404_TRANSITION_VERSION||entry.mode!==1||
    !Number.isFinite(elapsed)||elapsed<0||elapsed>HANMO_404_TRANSITION_TTL_MS||
    localStorage.getItem('practiceSetter')!=='1'){
    try{session.removeItem(HANMO_404_TRANSITION_KEY);}catch(_error){}
    return;
  }
  if(page==='practice.html'&&entry.phase==='armed'){
    try{
      session.setItem(HANMO_404_TRANSITION_KEY,JSON.stringify({
        ...entry,phase:'practice'
      }));
    }catch(_error){}
    return;
  }
  if(page!=='selectZone.html')return;
  if(entry.phase==='practice'){
    // 원본에서 selectZone으로 이동했을 때만 1회 404를 표시합니다.
    try{
      session.setItem(HANMO_404_TRANSITION_KEY,JSON.stringify({
        ...entry,phase:'error',errorAt:Date.now()
      }));
      location.assign('./incident-404.html');
    }catch(_error){
      try{session.removeItem(HANMO_404_TRANSITION_KEY);}catch(_ignored){}
    }
  }else if(entry.phase==='error'){
    // 브라우저 뒤로가기로 복귀한 selectZone에서는 재주입하지 않습니다.
    try{session.removeItem(HANMO_404_TRANSITION_KEY);}catch(_error){}
  }
}

/** 기존 학기 표시 규칙을 유지합니다. 1~6월은 1학기, 7~12월은 2학기입니다. */
function setSemester(){
  const semester=now.getMonth()>=6?2:1;
  title.innerText=now.getFullYear()+'-'+semester+'학기';
}

setSemester();
if(!restrictHanmo()){
  routeHanmoIncident();
  // Chrome의 뒤로가기 캐시 복귀에서는 원본 스크립트가 재실행되지 않을 수 있습니다.
  if(currentHanmoPage()==='selectZone.html'&&typeof window==='object'){
    window.addEventListener?.('pageshow',event=>{
      if(event.persisted)routeHanmoIncident();
    });
  }
}
