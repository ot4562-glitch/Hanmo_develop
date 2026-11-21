/* Menu-only viewport fitting, separate from legacy BASIC/TIME/SELECT handlers. */
(function(){
  'use strict';
  function mount(){
    const body=document.querySelector('body.hanmo-vsugang');
    const bar=body?.querySelector('.hanmo-topbar');
    const main=body?.querySelector('main');
    const landing=main?.querySelector('.f-dirt-down');
    const footer=main?.querySelector('.f-dirt-up');
    if(!body||!bar||!main||!landing)return;
    let frame=0;
    function fit(){
      frame=0;
      const bottom=Math.max(0,Math.ceil(bar.getBoundingClientRect().bottom));
      body.style.setProperty('--vsugang-topbar-bottom',bottom+'px');
      /* Measure natural mode-menu dimensions, not its compact layout. */
      body.classList.toggle('vsugang-compact-scroll',false);
      const style=window.getComputedStyle(main),px=v=>Number.parseFloat(v)||0;
      const adHeight=footer?Math.max(0,footer.getBoundingClientRect().height):0;
      body.style.setProperty('--vsugang-footer-height',adHeight+'px');
      const h=Math.max(1,main.clientHeight-px(style.paddingTop)-px(style.paddingBottom)-adHeight-12);
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
      for(const element of [main,bar,landing,footer])if(element)observer.observe(element);
    }
    if(document.fonts?.ready)document.fonts.ready.then(schedule,schedule);
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
