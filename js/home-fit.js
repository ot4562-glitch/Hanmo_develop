/* Home viewport fit. Keep the navigation visible and preserve every classic
 * announcement and button; scale the centered content only when needed.
 */
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
      const availableH=Math.max(0,main.clientHeight-px(computed.paddingTop)-px(computed.paddingBottom));
      const availableW=Math.max(0,main.clientWidth-px(computed.paddingLeft)-px(computed.paddingRight));
      const innerH=Math.max(1,content.scrollHeight);
      const innerW=Math.max(1,content.scrollWidth);
      const ratio=Math.min(1,availableH/innerH,availableW/innerW);
      const scale=Number.isFinite(ratio)&&ratio>0?ratio:1;
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
