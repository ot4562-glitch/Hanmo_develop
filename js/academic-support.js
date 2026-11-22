// 한국외국어대학교 공개 안내 페이지에서 확인한 대표 부서 연락처만 표시한다.
(function(){
 'use strict';
 const campus=document.getElementById('support-campus');
 if(!campus)return;
 const topic=document.getElementById('support-topic');
 const list=document.getElementById('support-results');
 const academic='https://haksa.hufs.ac.kr/haksa/index.do';
 const oneStop='https://dep.hufs.ac.kr/onestop/13394/subview.do';
 const entries={
  SEOUL:{
    ACADEMIC:{name:'서울 학사종합지원센터',telephone:'02-2173-2130',source:academic},
    SEASONAL:{name:'서울 학사종합지원센터 · 계절학기',telephone:'02-2173-2111',source:academic},
    CERTIFICATE:{name:'서울 원스톱서비스센터',telephone:'02-2173-2151',source:oneStop},
  },
  GLOBAL:{
    ACADEMIC:{name:'글로벌 학사종합지원센터 · 졸업/학적',telephone:'031-330-4027',source:academic},
    SEASONAL:{name:'글로벌 학사종합지원센터 · 계절학기',telephone:'031-330-4086',source:academic},
    CERTIFICATE:{name:'글로벌 원스톱서비스센터',telephone:'031-330-4634',source:oneStop},
  }
 };
 function render(){
  list.replaceChildren();
  const item=entries[campus.value]?.[topic.value];
  if(!item){
    const missing=document.createElement('p');
    missing.textContent='문의 정보를 확인할 수 없습니다.';
    list.append(missing);return;
  }
  const card=document.createElement('article');card.className='hanmo-item';
  const h=document.createElement('h3');
  const department=document.createElement('a');
  department.href=item.source;department.target='_blank';department.rel='noopener noreferrer';
  department.textContent=item.name;
  h.append(department);
  const phone=document.createElement('a');phone.href='tel:'+item.telephone;phone.textContent=item.telephone;
  card.append(h,phone);list.append(card);
 }
 campus.addEventListener('change',render);topic.addEventListener('change',render);
 render();
})();
