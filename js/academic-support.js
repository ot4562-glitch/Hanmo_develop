// 학교 연락처를 추정하지 않고 일반 문의 주제의 외부 검색 링크만 제공합니다.
(function(){
  'use strict';
  const form=document.getElementById('support-search-form');
  const input=document.getElementById('support-query');
  const suggestions=document.getElementById('support-suggestions');
  const heading=document.getElementById('support-topic-heading');
  const feedback=document.getElementById('support-feedback');
  const result=document.getElementById('support-result');
  const resultText=document.getElementById('support-result-text');
  const resultLink=document.getElementById('support-result-link');
  if(!form||!input||!suggestions||!heading||!feedback||!result||!resultText||!resultLink)return;

  // 실자료가 연결되기 전에는 빈도 순위가 아닌 고정 예시입니다.
  const fallbackTopics=[
    {query:'장학금 문의',matches:['장학','지원금']},
    {query:'휴학·복학 문의',matches:['휴학','복학','학적']},
    {query:'등록금 문의',matches:['등록금','납부']},
    {query:'증명서 발급 문의',matches:['증명','발급','서류']},
    {query:'학생증 문의',matches:['학생증','카드']},
    {query:'이중전공 문의',matches:['이중','복수전공','부전공']},
    {query:'교환학생 문의',matches:['교환','국제교류']},
    {query:'계절학기 문의',matches:['계절']},
    {query:'학사일정 문의',matches:['학사일정','학기']},
    {query:'수강신청 문의',matches:['수강','정정','강의']}
  ];
  const topicMap=new Map(fallbackTopics.map(topic=>[topic.query,topic]));
  const normalize=value=>value.normalize('NFKC').replace(/\s+/g,'').toLowerCase();
  let topics=fallbackTopics;

  function showSearchLink(){
    const value=input.value.trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,80);
    if(!value){
      result.hidden=true;
      feedback.textContent='문의 주제를 입력하거나 예시 검색어를 선택하세요.';
      return;
    }
    const search=new URL('https://www.google.com/search');
    search.searchParams.set('q','한국외국어대학교 '+value);
    resultLink.href=search.toString();
    resultText.textContent='한국외국어대학교 '+value;
    result.hidden=false;
    feedback.textContent='';
  }
  function createButton(query){
    const button=document.createElement('button');
    button.type='button';
    button.className='hanmo-support-suggestion';
    button.textContent=query;
    button.addEventListener('click',()=>{
      input.value=query;
      showSuggestions();
      showSearchLink();
      input.focus();
    });
    return button;
  }
  function showSuggestions(){
    const key=normalize(input.value.trim());
    const matches=key?topics.filter(topic=>
      normalize(topic.query).includes(key)||
      topic.matches.some(word=>normalize(word).includes(key)||key.includes(normalize(word)))
    ):topics;
    suggestions.replaceChildren();
    if(matches.length===0){
      const message=document.createElement('p');
      message.className='hanmo-support-no-match';
      message.textContent='직접 입력한 검색어도 사용할 수 있습니다.';
      suggestions.append(message);
      return;
    }
    for(const topic of matches)suggestions.append(createButton(topic.query));
  }
  input.addEventListener('input',()=>{
    showSuggestions();
    showSearchLink();
  });
  form.addEventListener('submit',event=>{
    event.preventDefault();
    showSearchLink();
  });
  showSuggestions();

  // 같은 사이트의 승인된 집계만 읽으며 학교 서버·사용자 검색 기록은 조회하지 않습니다.
  fetch('../data/support-topic-suggestions.json',{cache:'no-store'})
    .then(response=>response.ok?response.json():null)
    .then(snapshot=>{
      if(!snapshot||snapshot.schemaVersion!==1||snapshot.status!=='published'||
        !Array.isArray(snapshot.topics))return;
      const accepted=[...new Set(snapshot.topics)]
        .filter(query=>typeof query==='string'&&topicMap.has(query)).slice(0,8);
      if(!accepted.length)return;
      topics=accepted.map(query=>topicMap.get(query));
      heading.textContent='추천 검색어';
      showSuggestions();
    })
    .catch(()=>{});
})();
