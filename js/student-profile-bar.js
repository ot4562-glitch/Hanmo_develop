/* 상단 메뉴 오른쪽에 사용자가 직접 입력한 프로필을 표시한다.
 * 학교 로그인·학적 기록이 아니라 이 브라우저에 저장된 값이다.
 */
(function(){
  'use strict';
  const KEY='hanmo:student-planner:profile:v1';
  const items=Array.from(document.querySelectorAll('[data-profile-summary]'));
  const fields=Array.from(document.querySelectorAll('[data-practice-field]'));
  if(items.length===0&&fields.length===0)return;
  // 공통 상단 요약과 신청 화면의 개별 항목은 같은 브라우저 저장값을 읽습니다.
  function normalize(value){
    if(!value||typeof value!=='object'||Array.isArray(value))value={};
    const campus=value.campus==='SEOUL'?'서울캠퍼스':value.campus==='GLOBAL'?'글로벌캠퍼스':'';
    const clean=entry=>typeof entry==='string'?entry.trim().slice(0,100):'';
    const major=clean(value.major);
    const kind=value.secondaryKind==='MINOR'?'MINOR':
      value.secondaryKind==='DOUBLE'?'DOUBLE':
      value.secondaryKind==='NONE'?'NONE':
      clean(value.doubleMajor)?'DOUBLE':'UNSET';
    const secondaryLabel=kind==='MINOR'?'부전공':kind==='DOUBLE'?'이중전공':'이중전공/부전공';
    const secondary=kind==='MINOR'?clean(value.minor):kind==='DOUBLE'?clean(value.doubleMajor):'';
    const year=value.cohort;
    const maxCohort=Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric'}).format(new Date()))+1;
    const cohort=Number.isSafeInteger(year)&&year>=2010&&year<=maxCohort?String(year):'';
    return {campus,major,kind,secondaryLabel,secondary,cohort};
  }
  function summary(profile){
    if(!profile.campus||!profile.major)return '내정보 미설정';
    const parts=[profile.campus,profile.major];
    if(profile.secondary)parts.push(profile.secondaryLabel+' '+profile.secondary);
    parts.push(profile.cohort?profile.cohort+'학번':'학번 미설정');
    return parts.join(' · ');
  }
  function update(){
    let stored=null;
    try{
      const raw=localStorage.getItem(KEY);
      if(raw&&raw.length<4096)stored=JSON.parse(raw);
    }catch(_error){/* 저장이 차단된 브라우저에서는 미설정으로 표시한다. */}
    const profile=normalize(stored);
    const value=summary(profile);
    for(const item of items){
      item.textContent=value;
      item.title='본인이 이 브라우저에 저장한 정보입니다. 학교에 로그인한 상태가 아닙니다.';
    }
    const values={
      cohort:profile.cohort?profile.cohort+'년':'미입력',
      campus:profile.campus||'미입력',
      major:profile.major||'미입력',
      secondaryLabel:profile.secondaryLabel,
      secondary:profile.kind==='NONE'?'없음':profile.secondary||'미입력',
    };
    for(const field of fields){
      const key=field.getAttribute('data-practice-field');
      if(Object.prototype.hasOwnProperty.call(values,key))field.textContent=values[key];
    }
  }
  window.addEventListener('storage',event=>{
    if(event.key===KEY||event.key===null)update();
  });
  window.addEventListener('hanmo:profile-changed',update);
  update();
})();
