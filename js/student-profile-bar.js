/* 상단 메뉴 오른쪽에 사용자가 직접 입력한 프로필을 표시한다.
 * 학교 로그인·학적 기록이 아니라 이 브라우저에 저장된 값이다.
 */
(function(){
  'use strict';
  const KEY='hanmo:student-planner:profile:v1';
  const items=Array.from(document.querySelectorAll('[data-profile-summary]'));
  if(items.length===0)return;
  function summary(value){
    if(!value||typeof value!=='object'||Array.isArray(value))return '내정보 미설정';
    const campus=value.campus==='SEOUL'?'서울캠퍼스':value.campus==='GLOBAL'?'글로벌캠퍼스':'';
    const major=typeof value.major==='string'?value.major.trim().slice(0,100):'';
    if(!campus||!major)return '내정보 미설정';
    const parts=[campus,major];
    const kind=value.secondaryKind==='MINOR'?'MINOR':
      value.secondaryKind==='DOUBLE'?'DOUBLE':
      typeof value.doubleMajor==='string'&&value.doubleMajor.trim()?'DOUBLE':'NONE';
    const secondary=kind==='MINOR'?value.minor:value.doubleMajor;
    if(kind!=='NONE'&&typeof secondary==='string'&&secondary.trim()){
      parts.push((kind==='MINOR'?'부전공 ':'이중전공 ')+secondary.trim().slice(0,100));
    }
    const year=value.cohort;
   const maxCohort=Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric'}).format(new Date()))+1;
    parts.push(Number.isSafeInteger(year)&&year>=2010&&year<=maxCohort?year+'학번':'학번 미설정');
    return parts.join(' · ');
  }
  function update(){
    let stored=null;
    try{
      const raw=localStorage.getItem(KEY);
      if(raw&&raw.length<4096)stored=JSON.parse(raw);
    }catch(_error){/* 저장이 차단된 브라우저에서는 미설정으로 표시한다. */}
    const value=summary(stored);
    for(const item of items){
      item.textContent=value;
      item.title='본인이 이 브라우저에 저장한 정보입니다. 학교에 로그인한 상태가 아닙니다.';
    }
  }
  window.addEventListener('storage',event=>{
    if(event.key===KEY||event.key===null)update();
  });
  window.addEventListener('hanmo:profile-changed',update);
  update();
})();
