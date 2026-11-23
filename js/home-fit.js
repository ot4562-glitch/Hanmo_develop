/* 홈 중앙 콘텐츠만 화면 크기에 맞추고 안내 푸터는 독립 배치로 유지합니다. */
(function(){
  'use strict';
  function mount(){
    const main=document.querySelector('body.hanmo-home > main');
    const content=main?.querySelector('.home-fit-content');
    if(!main||!content)return;
    let frame=0;
    function fit(){
      frame=0;
      const computed=window.getComputedStyle(main);
      const px=value=>Number.parseFloat(value)||0;
      const availableW=Math.max(0,main.clientWidth-px(computed.paddingLeft)-px(computed.paddingRight));
      const availableH=Math.max(0,main.clientHeight-px(computed.paddingTop)-px(computed.paddingBottom));
      const ratio=Math.min(1,availableH/Math.max(1,content.scrollHeight),
        availableW/Math.max(1,content.scrollWidth));
      const scale=Number.isFinite(ratio)&&ratio>0?ratio:0.01;
      content.style.setProperty('--home-fit-scale',String(Math.floor(scale*10000)/10000));
    }
    function schedule(){
      if(!frame)frame=window.requestAnimationFrame(fit);
    }
    window.addEventListener('resize',schedule,{passive:true});
    if(typeof ResizeObserver==='function'){
      const observer=new ResizeObserver(schedule);
      observer.observe(main);
      observer.observe(content);
      const bar=document.querySelector('body.hanmo-home > .hanmo-topbar');
      if(bar)observer.observe(bar);
    }
    if(document.fonts?.ready)document.fonts.ready.then(schedule,schedule);
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
