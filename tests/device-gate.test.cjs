'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'js/pc-only.js'), 'utf8');
const base = 'https://ot4562-glitch.github.io/Hanmo_develop/';
const notice = base + 'html/pc-only.html';
function run(ua, overrides={}) {
  const redirects=[];
  const attributes={};
  const styles=[];
  const location={href:base+'html/catalog.html',replace(href){redirects.push(href);}};
  const document={
    currentScript:{src:base+'js/pc-only.js'},
    documentElement:{setAttribute(key,value){attributes[key]=value;}},
    head:{appendChild(value){styles.push(value);}},
    createElement(){return {textContent:''};},
  };
  const navigator={userAgent:ua,platform:'Win32',maxTouchPoints:0,...overrides};
  const window={navigator,location};
  vm.runInNewContext(script,{window,document,URL},{filename:'pc-only.js'});
  return {redirects,attributes,styles,blocked:window.HanmoPcOnly.blocked};
}
const desktop='Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/157.0';
for(const [name,ua,overrides] of [
  ['Android phone','Mozilla/5.0 (Linux; Android 16; Pixel) AppleWebKit/537.36 Chrome/157 Mobile Safari/537.36',{}],
  ['Android tablet','Mozilla/5.0 (Linux; Android 15; SM-X) AppleWebKit/537.36 Chrome/157 Safari/537.36',{}],
  ['iPhone','Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) Safari/604.1',{}],
  ['iPad','Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) Safari/604.1',{}],
  ['iPadOS desktop UA','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1',{platform:'MacIntel',maxTouchPoints:5}],
  ['UA client hints mobile',desktop,{userAgentData:{mobile:true}}],
  ['Windows Phone','Mozilla/5.0 (Windows Phone 10.0; ARM; Trident/7.0; IEMobile/11.0)',{}],
]){
  test(name+' is redirected to PC-only explanation',()=>{
    const r=run(ua,overrides);
    assert.equal(r.blocked,true);
    assert.deepEqual(r.redirects,[notice]);
    assert.equal(r.attributes['data-hanmo-pc-only'],'blocked');
    assert.equal(r.styles.length,1);
    assert.match(r.styles[0].textContent,/visibility:\s*hidden/);
  });
}
for(const [name,ua,overrides] of [
  ['Windows desktop',desktop,{}],
  ['Windows touch laptop',desktop,{maxTouchPoints:10}],
  ['macOS desktop','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1',{platform:'MacIntel',maxTouchPoints:0}],
  ['desktop small viewport',desktop,{innerWidth:320}],
]){
  test(name+' remains usable',()=>{
    const r=run(ua,overrides);
    assert.equal(r.blocked,false);
    assert.equal(r.redirects.length,0);
    assert.equal(r.styles.length,0);
  });
}
test('a stale stored desktop allow value cannot bypass the current device check',()=>{
  const r=run('Mozilla/5.0 (Linux; Android 16) Mobile',{});
  assert.equal(r.blocked,true);
  assert.deepEqual(r.redirects,[notice]);
});
test('every interactive HTML entry includes the synchronous gate before page scripts',()=>{
  for(const page of ['index.html','html/developer.html','html/vsugang.html','html/practice.html',
    'html/selectZone.html','html/result.html']){
    const html=fs.readFileSync(path.join(root,page),'utf8');
    const expected=page==='index.html'?'./js/pc-only.js':'../js/pc-only.js';
    const at=html.indexOf('<script src="'+expected+'"></script>');
    assert.ok(at>=0,page+' missing policy gate');
    assert.ok(at<html.indexOf('</head>'),page+' must load gate in head');
    const app=html.indexOf('src="./public/');
    if(app>=0)assert.ok(at<app,page+' gate must run before app bundle');
  }
  assert.match(fs.readFileSync(path.join(root,'html/pc-only.html'),'utf8'),/PC에서 이용해 주세요/);
});
