'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../js/home-fit.js'),'utf8');

function setup(height,width,contentHeight,contentWidth){
 const props={};
 const content={scrollHeight:contentHeight,scrollWidth:contentWidth,
  style:{setProperty:(key,value)=>{props[key]=Number(value);}}};
 const main={clientHeight:height,clientWidth:width,
  querySelector:selector=>selector==='.home-fit-content'?content:null};
 const bar={};
 const callbacks={},queue=[];
 let frameId=0;
 const ctx={
  document:{readyState:'complete',querySelector:selector=>
    selector==='body.hanmo-home > main'?main:
    selector==='body.hanmo-home > .hanmo-topbar'?bar:null,
    fonts:{ready:Promise.resolve()}},
  window:{getComputedStyle:()=>({paddingTop:'10px',paddingBottom:'10px',
    paddingLeft:'12px',paddingRight:'12px'}),
    requestAnimationFrame:fn=>{queue.push(fn);return ++frameId;},
    addEventListener:(event,fn)=>{callbacks[event]=fn;}},
  ResizeObserver:class{observe(){}}
 };
 vm.runInNewContext(source,ctx,{filename:'home-fit.js'});
 const flush=()=>{const cb=queue.shift();if(cb)cb();};
 flush();
 return {props,callbacks,main,flush};
}
test('short desktop viewport scales home only as necessary',()=>{
 const h=setup(420,960,700,700);
 assert.ok(h.props['--home-fit-scale']>0);
 assert.ok(h.props['--home-fit-scale']<1);
 assert.ok(h.props['--home-fit-scale']*700<=400);
});
test('normal viewport preserves original visual size',()=>{
 assert.equal(setup(780,1300,520,700).props['--home-fit-scale'],1);
});
test('resizing keeps measured content within main area',()=>{
 const h=setup(800,1100,600,700);
 h.main.clientHeight=360;
 h.callbacks.resize();h.flush();
 assert.ok(h.props['--home-fit-scale']<0.57);
});
test('removed advertising does not reserve empty layout space',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../css/home-fit.css'),'utf8');
 assert.doesNotMatch(html,/kakao_ad_area|home-ad-footer|ba\.min\.js/);
 assert.match(css,/top: 50%;/);
 assert.doesNotMatch(css,/home-ad-footer|home-ad-reserve|home-ad-scale/);
 const h=setup(720,1280,520,700);
 assert.equal(h.props['--home-fit-scale'],1);
});
test('narrow desktop still scales all content without advertisement',()=>{
 const h=setup(360,640,540,700);
 assert.ok(h.props['--home-fit-scale']<1);
 assert.ok(h.props['--home-fit-scale']*540<=340);
});
