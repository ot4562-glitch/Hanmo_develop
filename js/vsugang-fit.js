/* 모드 메뉴의 배치를 화면 크기에 맞춘다. */
(function(){
  'use strict';
  function mount(){
    const body=document.querySelector('body.hanmo-vsugang');
    const bar=body?.querySelector('.hanmo-topbar');
    const main=body?.querySelector('main');
    const landing=main?.querySelector('.f-dirt-down');
    if(!body||!bar||!main||!landing)return;
    let frame=0;
    function fit(){
      frame=0;
      const bottom=Math.max(0,Math.ceil(bar.getBoundingClientRect().bottom));
      body.style.setProperty('--vsugang-topbar-bottom',bottom+'px');
      /* 기본 배치를 기준으로 필요한 축소 비율을 구한다. */
      body.classList.toggle('vsugang-compact-scroll',false);
      const style=window.getComputedStyle(main),px=v=>Number.parseFloat(v)||0;
      const h=Math.max(1,main.clientHeight-px(style.paddingTop)-px(style.paddingBottom)-12);
      const w=Math.max(1,main.clientWidth-px(style.paddingLeft)-px(style.paddingRight)-24);
      const naturalH=Math.max(1,landing.scrollHeight,landing.offsetHeight);
      const naturalW=Math.max(1,landing.scrollWidth,landing.offsetWidth);
      const ratio=Math.min(1,h/naturalH,w/naturalW);
      const fits=Number.isFinite(ratio)&&ratio>=0.65;
      body.classList.toggle('vsugang-compact-scroll',!fits);
      landing.style.setProperty('--vsugang-fit-scale',fits?String(Math.floor(ratio*10000)/10000):'1');
    }
    function schedule(){
      if(!frame)frame=window.requestAnimationFrame(fit);
    }
    window.addEventListener('resize',schedule,{passive:true});
    window.addEventListener('pageshow',schedule,{passive:true});
    if(typeof ResizeObserver==='function'){
      const observer=new ResizeObserver(schedule);
      for(const element of [main,bar,landing])if(element)observer.observe(element);
    }
    if(document.fonts?.ready)document.fonts.ready.then(schedule,schedule);
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
