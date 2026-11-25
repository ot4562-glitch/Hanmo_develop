// 학사 공지와 학사 달력을 단일 화면의 접근 가능한 탭으로 전환합니다.
(function(){
  const tabs=[
    document.getElementById('academic-notice-tab'),
    document.getElementById('academic-calendar-tab'),
  ];
  const panels=[
    document.getElementById('academic-notice-panel'),
    document.getElementById('academic-calendar-panel'),
  ];
  if(tabs.some(v=>!v)||panels.some(v=>!v))return;
  function select(index,focus=false){
    tabs.forEach((tab,i)=>{
      tab.setAttribute('aria-selected',String(i===index));
      tab.tabIndex=i===index?0:-1;
      panels[i].hidden=i!==index;
    });
    if(focus)tabs[index].focus();
    if(index===1){
      // 숨겨진 달력을 표시한 뒤 FullCalendar가 너비를 다시 측정합니다.
      requestAnimationFrame(()=>window.dispatchEvent(new Event('hanmo:calendar:show')));
    }
  }
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>select(index));
    tab.addEventListener('keydown',event=>{
      if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
      event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?1:
        (index+(event.key==='ArrowRight'?1:-1)+2)%2;
      select(next,true);
    });
  });
  if(location.hash==='#calendar')select(1);
})();
