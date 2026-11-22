// @ts-check
import {calculateDegreeCredits,CREDIT_AREAS,graduationGuidance} from '../core/academics/degree-credit.js';
/** @typedef {import('../core/academics/degree-credit.js').DegreeKind} DegreeKind */
const PROFILE_KEY='hanmo:student-planner:profile:v1';
const CREDITS_KEY='hanmo:degree-preparation:credits:v1';
/** @param {string} id @returns {HTMLElement} */
function get(id){
  const el=document.getElementById(id);
  if(!el)throw new Error('졸업 준비 화면의 요소가 없습니다: '+id);
  return el;
}
/** @param {string} id @returns {HTMLInputElement} */
function input(id){
  const el=get(id);
  if(!(el instanceof HTMLInputElement))throw new Error('학점 입력 요소가 없습니다: '+id);
  return el;
}
/** @param {string} value @returns {HTMLElement} */
function text(value){const span=document.createElement('span');span.textContent=value;return span;}
const results=get('degree-results'),warnings=get('degree-warnings'),guidance=get('degree-guidance');
const notice=get('degree-credit-message');
const form=get('degree-credit-form');
/** @returns {Record<string,unknown>|null} */
function profile(){
  try{
    const raw=localStorage.getItem(PROFILE_KEY);
    if(!raw||raw.length>4096)return null;
    const p=JSON.parse(raw);
    return p&&typeof p==='object'&&!Array.isArray(p)?p:null;
  }catch{return null;}
}
/** @param {Record<string,unknown>|null} p @returns {DegreeKind} */
function degreeKind(p){
  return p?.secondaryKind==='DOUBLE'?'DOUBLE':p?.secondaryKind==='MINOR'?'MINOR':'NONE';
}
/** @param {Record<string,unknown>|null} p */
function profileLabel(p){
  if(!p)return '내정보 미설정';
  const kstYear=Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric'})
    .format(new Date()));
  const cohort=Number.isSafeInteger(p.cohort)&&Number(p.cohort)>=2010&&Number(p.cohort)<=kstYear+1
    ?p.cohort+'학번':'학번 미설정';
  const campus=p.campus==='GLOBAL'?'글로벌캠퍼스':p.campus==='SEOUL'?'서울캠퍼스':'캠퍼스 미설정';
  const kind=degreeKind(p);
  const kindLabel=kind==='DOUBLE'?'이중전공':kind==='MINOR'?'부전공':'단일전공';
  const major=typeof p.major==='string'&&p.major.trim()?p.major.trim().slice(0,100):'주전공 미설정';
  const second=kind==='MINOR'?p.minor:kind==='DOUBLE'?p.doubleMajor:null;
  const secondLabel=typeof second==='string'&&second.trim()?second.trim().slice(0,100):'이중·부전공 없음';
  return [cohort,campus,kindLabel,major,secondLabel].join(' · ');
}
function syncProfile(){
  const p=profile();
  get('degree-context-summary').textContent=profileLabel(p);
  guidance.replaceChildren();
  const items=graduationGuidance({
    campus:typeof p?.campus==='string'?p.campus:'',
    major:typeof p?.major==='string'?p.major:'',
    secondaryKind:degreeKind(p),
    secondary:typeof p?.minor==='string'&&degreeKind(p)==='MINOR'?p.minor:
      typeof p?.doubleMajor==='string'&&degreeKind(p)==='DOUBLE'?p.doubleMajor:'',
    cohort:Number.isSafeInteger(p?.cohort)?Number(p.cohort):null,
  });
  for(const entry of items){
    const row=document.createElement('article');row.className='degree-requirement';
    const title=document.createElement('h3');title.textContent=entry.scope+' · '+entry.title+' · 확인 필요';
    const link=document.createElement('a');link.href=entry.sourceUrl;
    link.rel='noopener noreferrer';link.target='_blank';link.textContent='공식 확인';
    row.append(title,link);guidance.append(row);
  }
  renderCredits();
}
/** @returns {{earned:Record<import('../core/academics/degree-credit.js').CreditArea,string>,targets:Record<import('../core/academics/degree-credit.js').CreditArea,string>}} */
function readInputs(){
  /** @type {Record<import('../core/academics/degree-credit.js').CreditArea,string>} */
  const earned={general:'',primary:'',secondary:'',other:'',total:''};
  /** @type {Record<import('../core/academics/degree-credit.js').CreditArea,string>} */
  const targets={general:'',primary:'',secondary:'',other:'',total:''};
  for(const area of CREDIT_AREAS){
    earned[area]=input('degree-earned-'+area).value;
    targets[area]=input('degree-target-'+area).value;
  }
  return {earned,targets};
}
function renderCredits(){
  results.replaceChildren();warnings.replaceChildren();
  const calc=calculateDegreeCredits({...readInputs(),kind:degreeKind(profile())});
  for(const metric of calc.metrics){
    const row=document.createElement('div');row.className='degree-credit-row';
    const header=document.createElement('div');header.className='degree-credit-head';
    header.append(text(metric.label),text(metric.target===null?'목표 확인 필요':
      metric.earned+'/'+metric.target+'학점 · '+metric.remaining+'학점 남음'+
      (metric.excess?' · '+metric.excess+'학점 초과':'')));
    const track=document.createElement('div');track.className='hanmo-progress-track';
    const fill=document.createElement('div');fill.className='hanmo-progress-fill';
    fill.style.width=(metric.ratio??0)+'%';track.append(fill);
    row.append(header,track);results.append(row);
  }
  for(const warning of calc.warnings){
    const line=document.createElement('p');line.textContent=warning;warnings.append(line);
  }
}
function restoreCredits(){
  try{
    const raw=localStorage.getItem(CREDITS_KEY);
    if(!raw||raw.length>8192)return;
    const value=JSON.parse(raw);
    if(value?.version!==1)return;
    for(const area of CREDIT_AREAS){
      for(const kind of ['earned','target']){
        const stored=value[kind==='earned'?'earned':'targets']?.[area];
        if(typeof stored==='string'&&/^\d{0,3}(?:\.5)?$/.test(stored))
          input('degree-'+kind+'-'+area).value=stored;
      }
    }
  }catch{/* 손상된 저장값이 있어도 입력 폼을 비우고 계속한다. */}
}
function chooseTab(name){
  for(const tab of document.querySelectorAll('[data-degree-tab]')){
    const active=tab.getAttribute('data-degree-tab')===name;
    tab.setAttribute('aria-selected',active?'true':'false');
    if(tab instanceof HTMLElement)tab.tabIndex=active?0:-1;
  }
  get('degree-credits-panel').hidden=name!=='credits';
  get('degree-requirements-panel').hidden=name!=='requirements';
}
for(const tab of document.querySelectorAll('[data-degree-tab]')){
  tab.addEventListener('click',()=>chooseTab(
    tab.getAttribute('data-degree-tab')==='requirements'?'requirements':'credits'));
}
form.addEventListener('input',()=>{
  try{renderCredits();notice.textContent='';}
  catch(error){notice.textContent=error instanceof Error?error.message:String(error);}
});
form.addEventListener('submit',event=>{
  event.preventDefault();
  try{
    renderCredits();
    localStorage.setItem(CREDITS_KEY,JSON.stringify({version:1,savedAt:new Date().toISOString(),...readInputs()}));
    notice.textContent='저장됨';
  }catch(error){notice.textContent=error instanceof Error?error.message:'저장 실패';}
});
get('degree-credit-clear').addEventListener('click',()=>{
  try{localStorage.removeItem(CREDITS_KEY);}catch{/* 저장소 접근 거부 */}
  for(const area of CREDIT_AREAS){
    input('degree-earned-'+area).value='';
    input('degree-target-'+area).value='';
  }
  notice.textContent='삭제됨';renderCredits();
});
window.addEventListener('storage',event=>{if(event.key===PROFILE_KEY)syncProfile();});
restoreCredits();syncProfile();
chooseTab(new URL(location.href).searchParams.get('tab')==='requirements'?'requirements':'credits');
