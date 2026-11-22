// 학교 재배포 승인을 받지 않은 본문 대신 검수 전 공식 확인 경로만 분류한다.
(function(){
 'use strict';
 const form=document.getElementById('faq-search-form');
 if(!form)return;
 const input=document.getElementById('faq-search-query');
 const status=document.getElementById('faq-status');
 const list=document.getElementById('faq-topic-list');
 const topics=[
  {name:'학점·수강',tokens:['학점','수강','성적','강좌'],url:'https://haksa.hufs.ac.kr/haksa/index.do'},
  {name:'계절학기',tokens:['계절','여름','겨울'],url:'https://haksa.hufs.ac.kr/haksa/index.do'},
  {name:'졸업·외국어 인증',tokens:['졸업','외국어','FLEX','논문','시험','인증'],url:'https://commu.hufs.ac.kr/hufs/11390/subview.do'},
  {name:'학사일정·신청',tokens:['일정','기간','달력','신청'],url:'https://academic.hufs.ac.kr/academic/index.do'},
 ];
 function render(){
  list.replaceChildren();
  const q=input.value.trim().toLocaleLowerCase('ko');
  const selected=topics.filter(t=>!q||t.tokens.some(x=>x.toLocaleLowerCase('ko').includes(q)||q.includes(x.toLocaleLowerCase('ko'))));
  status.textContent=selected.length+'개 확인 경로 · 공식 답변 미연결';
  if(!selected.length){const n=document.createElement('p');n.textContent='결과 없음 · 공식 안내 확인';list.append(n);}
  for(const t of selected){
   const item=document.createElement('article');item.className='hanmo-item';
   const name=document.createElement('h3');name.textContent=t.name+' · 확인 필요';
   const a=document.createElement('a');a.href=t.url;a.target='_blank';a.rel='noopener noreferrer';
   a.textContent='공식 안내에서 확인';
   item.append(name,a);list.append(item);
  }
 }
 form.addEventListener('submit',e=>{e.preventDefault();render();});
 input.addEventListener('input',render);
 input.addEventListener('search',render);
 render();
})();
