'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.join(__dirname,'..');
const student=['planner','forecast','catalog','academic-timeline','academic-progress'];
test('public student pages live under html and never request pasted HTML or JSON',()=>{
 for(const name of student){
   const html=fs.readFileSync(path.join(ROOT,'html',name+'.html'),'utf8');
   assert.match(html,/class="hanmo-topbar"/);
   assert.match(html,/src="\.\.\/js\/pc-only\.js"/);
   assert.doesNotMatch(html,/<textarea\b|type=["']file["']/i);
   assert.doesNotMatch(html,/planner-sidebar|class="[^"]*sidebar/i);
 }
});
test('index contains only academic links and no duplicate simulation entry',()=>{
 const src=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 for(const name of student.filter(name=>name!=='forecast'))assert.ok(src.includes('./html/'+name+'.html'),name);
 assert.doesNotMatch(src,/<a[^>]+href="\.\/html\/vsugang\.html"/,'home must not link to legacy mock registration');
 assert.doesNotMatch(src,/scenario-settings|scenario-workshop|돌발상황 연습/,'no standalone incident link on home');
 assert.ok(!src.includes('scenario-workshop.html'), 'dead standalone page link');
 assert.ok(!src.includes('href="./degree-rescue/'), 'no academic UI link to old folder');
});
test('BASIC의 선택형 404만 남고 메뉴 안의 가상 실패/오류 UI는 제거한다',()=>{
 const html=fs.readFileSync(path.join(ROOT,'html/vsugang.html'),'utf8');
 assert.match(html,/id="scenario-settings"/);
 assert.equal((html.match(/data-scenario-toggle="/g)||[]).length,1);
 assert.equal((html.match(/data-scenario-off="/g)||[]).length,1);
 assert.ok(html.includes('name="incident-RECONNECT" value="no" data-scenario-off="RECONNECT" checked'));
 assert.doesNotMatch(html,/LAST_VALID|incident-practice|incident-404-refresh|incident-404-back/);
 assert.equal(fs.existsSync(path.join(ROOT,'html/scenario-workshop.html')),false);
 assert.equal(fs.existsSync(path.join(ROOT,'html/scenario-lab.html')),false);
 for(const page of student){
   const body=fs.readFileSync(path.join(ROOT,'html',page+'.html'),'utf8');
   assert.ok(!body.includes('vsugang.html#scenario-settings'),page);
 }
});


test('academic public assets are still under html; engine remains independently typechecked',()=>{
 const stage=fs.readFileSync(path.join(ROOT,'scripts/stage-static.mjs'),'utf8');
 assert.ok(stage.includes("join(dist,'data')"));
 assert.ok(!stage.includes("join(dist,'degree-rescue')"));
 assert.ok(stage.includes('student-forecast.js'));
});

test('academic package is flat: no nested source package remains',()=>{
 const root=path.join(ROOT,'degree-rescue');
 assert.equal(fs.existsSync(root),false);
 assert.ok(fs.existsSync(path.join(ROOT,'js','academic','core','forecast','offering.js')));
 assert.ok(fs.existsSync(path.join(ROOT,'package.json')));
});

test('new views preserve original Hanmo palette, watermark and shared layers',()=>{
 const shared=fs.readFileSync(path.join(ROOT,'css','student-ui.css'),'utf8');
 for(const name of ['hanmo-tokens.css','hanmo-components.css','hanmo-views.css'])
   assert.ok(shared.includes(name),'missing style module: '+name);
 const tokens=fs.readFileSync(path.join(ROOT,'css','hanmo-tokens.css'),'utf8');
 const views=fs.readFileSync(path.join(ROOT,'css','hanmo-views.css'),'utf8');
 assert.ok(tokens.includes('--hm-night:#000e18'));
 assert.ok(views.includes('background.svg'));
 for(const name of student){
   const html=fs.readFileSync(path.join(ROOT,'html',name+'.html'),'utf8');
   assert.match(html,/class="hanmo-schoolmark"/);
 }
 const originalMenu=fs.readFileSync(path.join(ROOT,'html/vsugang.html'),'utf8');
 assert.match(originalMenu,/class='titleContainer'/);
 assert.match(originalMenu,/id="scenario-settings"/);
 assert.match(originalMenu,/href="\.\.\/css\/vsugang-fit\.css"/);
});

test('모드 메뉴에서만 옵션을 켜고 실제 practice→selectZone 전환에서 404를 주입한다',()=>{
 const source=fs.readFileSync(path.join(ROOT,'js/scenario-settings.js'),'utf8');
 const router=fs.readFileSync(path.join(ROOT,'js/hanmoSys.js'),'utf8');
 const menu=fs.readFileSync(path.join(ROOT,'html/vsugang.html'),'utf8');
 const error=fs.readFileSync(path.join(ROOT,'html/incident-404.html'),'utf8');
 assert.match(menu,/<button id="incident-options"[^>]*aria-controls="scenario-settings"/);
 assert.match(menu,/<dialog id="scenario-settings"[^>]*>[\s\S]*data-scenario-toggle=/);
 assert.doesNotMatch(menu.match(/class='settingSection'[\s\S]*?<\/section>/)?.[0]??'',/data-scenario-toggle/);
 assert.match(source,/TRANSITION_KEY/);
 assert.match(router,/page==='practice\.html'&&entry\.phase==='armed'/);
 assert.match(router,/location\.assign\('\.\/incident-404\.html'\)/);
 assert.match(error,/src="\.\.\/js\/incident-404\.js"/);
 assert.doesNotMatch(error,/<button[^>]*onclick=|id="incident-404-refresh"/);
 assert.ok(!source.includes('fetch(')&&!router.includes('XMLHttpRequest('));
});


test('planner uses the shared top navigation instead of four duplicate feature cards',()=>{
 const body=fs.readFileSync(path.join(ROOT,'html/planner.html'),'utf8');
 assert.match(body,/<header class="hanmo-topbar">/);
 assert.match(body,/id="planner-profile"/);
 assert.doesNotMatch(body,/무엇을 준비하시나요\?|필요한 기능을 골라 들어가세요\./);
 assert.doesNotMatch(body,/<nav class="hanmo-card-grid"|aria-label="학업 기능 메뉴"/);
 assert.doesNotMatch(body,/class="hanmo-card" href="\.(?:\/academic-timeline|\/forecast|\/catalog|\/academic-progress)\.html"/);
});

test('academic entry handoff and three A/B/C plans integrate into existing pages without a sidebar',()=>{
 const planner=fs.readFileSync(path.join(ROOT,'html/planner.html'),'utf8');
 const notices=fs.readFileSync(path.join(ROOT,'html/academic-timeline.html'),'utf8');
 const progress=fs.readFileSync(path.join(ROOT,'html/academic-progress.html'),'utf8');
 for(const id of ['planner-campus','planner-major','planner-double','planner-cohort','planner-go-notices'])
  assert.ok(planner.includes('id="'+id+'"'),id);
 assert.ok(planner.includes('../js/student-entry.js'));
 assert.ok(notices.includes('id="notice-context"'));
 for(const id of ['degree-context-summary','degree-credit-form','degree-guidance','degree-credits-panel','degree-requirements-panel'])
  assert.ok(progress.includes('id="'+id+'"'),id);
 assert.doesNotMatch(progress,/degree-advanced|record-form|plan-form|scenario-choice|academic-progress\.js|student-progress\.js/);
 assert.ok(progress.includes('../js/degree-preparation.js'));
 assert.ok(progress.includes('../css/academic-progress.css'));
 assert.doesNotMatch(progress,/class="planner-sidebar"|type="file"|<textarea/);
 const plannerNav=fs.readFileSync(path.join(ROOT,'html/planner.html'),'utf8');
 assert.doesNotMatch(plannerNav,/href="\.\/vsugang\.html"/,'remove old mock-registration card');
});

test('모든 텍스트 검색은 입력 즉시 갱신하며 FAQ에 실행 버튼이 없다',()=>{
  const faq=fs.readFileSync(path.join(ROOT,'html/academic-faq.html'),'utf8');
  const faqJs=fs.readFileSync(path.join(ROOT,'js/academic-faq.js'),'utf8');
  const notices=fs.readFileSync(path.join(ROOT,'js/student-notices.js'),'utf8');
  const courses=fs.readFileSync(path.join(ROOT,'js/student-catalog.js'),'utf8');
  assert.doesNotMatch(faq,/<button[^>]*type="submit"[^>]*>검색<\/button>/);
  assert.match(faqJs,/input\.addEventListener\('input',render\)/);
  assert.match(faqJs,/input\.addEventListener\('search',render\)/);
  assert.match(notices,/query\.addEventListener\('input',render\)/);
  assert.match(courses,/query\.addEventListener\('input',render\)/);
});

test('학사 화면의 불필요한 공식 상태 문구는 제거하고 부서명 링크를 쓴다',()=>{
  const html=page=>fs.readFileSync(path.join(ROOT,'html',page+'.html'),'utf8');
  const calendar=html('academic-calendar');
  const faq=html('academic-faq');
  const progress=html('academic-progress');
  const support=html('academic-support');
  assert.doesNotMatch(calendar,/공식 일정 미연결|id="calendar-status"/);
  assert.doesNotMatch(faq,/id="faq-status"|공식 답변 미연결/);
  assert.doesNotMatch(progress,/자가 입력 · 공식 판정 아님/);
  assert.doesNotMatch(support,/id="support-status"/);
  const supportScript=fs.readFileSync(path.join(ROOT,'js/academic-support.js'),'utf8');
  assert.match(supportScript,/h\.append\(department\)/);
  assert.match(supportScript,/department\.href=item\.source/);
  assert.doesNotMatch(supportScript,/원문에서 담당 업무·번호 재확인/);
});

test('home restores the original mock registration layout without the academic-entry promo block',()=>{
 const home=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 assert.match(home,/<nav class="hanmo-topbar"/);
 assert.match(home,/<a class="hanmo-brand" href="\.\/index\.html" aria-label="한모 홈으로 이동"/);
 assert.match(home,/<main>/);
 for(const tag of ["class='titleContainer'","class='notice blueBox'","class='mainNotice blueBox'",
   "class='buttonContainer'","class='headerNotice'","class='deviceCheck'"])
   assert.ok(home.includes(tag),'restore original page structure '+tag);
 for(const txt of ['수강신청 연습하기','새로고침','개발자 소개','NOTICE','이용 제한 시간'])
   assert.ok(home.includes(txt),'restore original content '+txt);
 for(const asset of ['./css/gnb.css','./css/index.css','./css/layout.css',
   './js/gnb.js','./js/index.js'])
   assert.ok(home.includes(asset),'restore original asset '+asset);
 assert.doesNotMatch(home,/academic-entry|학사 준비도 한모에서|수강신청 전부터 졸업 준비까지/);
 assert.doesNotMatch(home,/<a[^>]*>홈<\/a>/);
 assert.doesNotMatch(home,/<a[^>]*href="\.\/html\/vsugang\.html"[^>]*>/,'do not restore redundant topbar link');
 const bar=home.match(/<nav class="hanmo-topbar"[\s\S]*?<\/nav>/)?.[0];
 assert.ok(bar);
 const allowed=['./index.html','./html/academic-timeline.html',
   './html/catalog.html','./html/academic-progress.html','./html/academic-calendar.html',
   './html/academic-faq.html','./html/academic-support.html','./html/planner.html'];
 assert.deepEqual([...bar.matchAll(/<a[^>]+href="([^"]+)"/g)].map(x=>x[1]),allowed);
 assert.match(home,/onclick="location\.href='\.\/html\/vsugang\.html'"/);
 const homeScript=fs.readFileSync(path.join(ROOT,'js/index.js'),'utf8');
 assert.doesNotMatch(homeScript,/\$SUGANGBUTTON\.classList\.(?:add|remove)\(/,'practice entry must stay visible during restriction notice');
 assert.match(home,/onclick="location\.reload\(\)"/);
 for(const page of student){
   const html=fs.readFileSync(path.join(ROOT,'html',page+'.html'),'utf8');
   assert.match(html,/<a class="hanmo-brand" href="\.\.\/index\.html" aria-label="한모 홈으로 이동"/,page);
   assert.doesNotMatch(html,/<a href="\.\.\/index\.html">홈<\/a>/,page);
 }
 for(const page of ['vsugang','developer','result']){
   const html=fs.readFileSync(path.join(ROOT,'html',page+'.html'),'utf8');
   assert.match(html,/<a class="hanmo-brand" href="\.\.\/index\.html" aria-label="한모 홈으로 이동"/,page);
 }
});

test('home uses a viewport-fitted main below the topbar without hiding classic functions',()=>{
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 const css=fs.readFileSync(path.join(ROOT,'css/home-fit.css'),'utf8');
 const script=fs.readFileSync(path.join(ROOT,'js/home-fit.js'),'utf8');
 assert.match(html,/<body class="hanmo-home">/);
 assert.match(html,/<div class="home-fit-content">/);
 assert.match(html,/href="\.\/css\/home-fit\.css"/);
 assert.match(html,/src="\.\/js\/home-fit\.js" defer/);
 assert.match(css,/body\.hanmo-home\s*\{/);
 assert.match(css,/height:\s*100dvh/);
 assert.match(css,/body\.hanmo-home > main\s*\{/);
 assert.match(css,/flex:\s*1 1 auto/);
 assert.match(css,/overflow:\s*hidden/);
 assert.match(css,/--home-fit-scale/);
 assert.match(script,/content\.scrollHeight/);
 assert.match(script,/main\.clientHeight/);
 for(const item of ["class='notice blueBox'","class='mainNotice blueBox'",
   "class='buttonContainer'","수강신청 연습하기","새로고침","개발자 소개"])
  assert.ok(html.includes(item),'missing original homepage element '+item);
 assert.doesNotMatch(html,/academic-entry|학사 준비도 한모에서/);
});

test('vsugang menu fits under the navigation while settings and incident remain accessible',()=>{
 const html=fs.readFileSync(path.join(ROOT,'html/vsugang.html'),'utf8');
 const css=fs.readFileSync(path.join(ROOT,'css/vsugang-fit.css'),'utf8');
 const js=fs.readFileSync(path.join(ROOT,'js/vsugang-fit.js'),'utf8');
 for(const expected of ['<body class="hanmo-vsugang">','../css/vsugang-fit.css',
   '../js/vsugang-fit.js','BASIC MODE','TIME MODE','SELECT','SETTING'])
  assert.ok(html.includes(expected),'missing mode-menu contract '+expected);
 for(const expected of ['height:100dvh','--vsugang-fit-scale','--vsugang-topbar-bottom',
   'vsugang-compact-scroll','overflow-y:auto','#scenario-settings[open]'])
  assert.ok(css.includes(expected),'missing viewport protection '+expected);
 assert.ok(js.includes('landing.scrollHeight'));
 assert.ok(js.includes('main.clientHeight'));
 assert.equal((html.match(/data-scenario-off="/g)||[]).length,1);
});

test('every non-imitation topbar puts the editable self-declared student summary before rightmost 내정보',()=>{
 for(const page of ['index.html',...student.map(x=>'html/'+x+'.html'),
   'html/vsugang.html','html/developer.html','html/result.html']){
  const html=fs.readFileSync(path.join(ROOT,page),'utf8');
  const isHome=page==='index.html';
  const bar=html.match(/<(?:header|nav) class="hanmo-topbar"[\s\S]*?<\/(?:header|nav)>/)?.[0];
  assert.ok(bar,'missing shared bar: '+page);
  assert.ok(bar.includes('data-profile-summary'),'missing local profile summary: '+page);
  assert.ok(html.includes((isHome?'./js/':'../js/')+'student-profile-bar.js'),'missing profile controller: '+page);
  const links=[...bar.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const final=links.at(-1);
  assert.equal(final?.[1],isHome?'./html/planner.html':'./planner.html',page+' rightmost link');
  assert.equal(final?.[2],'내정보',page+' rightmost label');
  assert.ok(bar.indexOf('data-profile-summary')<bar.indexOf('class="hanmo-me-link"'),page+' profile precedes account link');
  assert.doesNotMatch(bar,/학업 플래너|>홈<\/a>|기본 모의신청/);
 }
});
test('academic pages have no repeated marketing introduction or rounded section wrappers',()=>{
 const flat=fs.readFileSync(path.join(ROOT,'css/hanmo-flat.css'),'utf8');
 const imported=fs.readFileSync(path.join(ROOT,'css/student-ui.css'),'utf8');
 assert.ok(imported.includes('hanmo-flat.css'));
 assert.match(flat,/body\.hanmo-ui \.hanmo-card/);
 assert.match(flat,/border-radius:0/);
 for(const name of student){
  const html=fs.readFileSync(path.join(ROOT,'html',name+'.html'),'utf8');
  assert.doesNotMatch(html,/class="hanmo-hero"|class="hanmo-eyebrow"/,name);
  assert.doesNotMatch(html,/한모는 학생이 만든 비공식 학업 보조 서비스입니다/,name);
  assert.ok(html.includes('class="hanmo-schoolmark"'),name);
 }
 const profile=fs.readFileSync(path.join(ROOT,'html/planner.html'),'utf8');
 for(const id of ['planner-profile','planner-secondary-kind','planner-cohort','planner-double'])
  assert.ok(profile.includes('id="'+id+'"'));
 assert.match(profile,/<title>내정보 \| 한모<\/title>/);
 assert.match(profile,/id="planner-cohort"[^>]*required/);
 assert.doesNotMatch(profile,/CAMPUS LIFE|ACADEMIC PLANNER|내 전공 공지를 찾고/);
 const blocker=fs.readFileSync(path.join(ROOT,'html/pc-only.html'),'utf8');
 assert.doesNotMatch(blocker,/border-radius:20px/);
 // 학생 UI 검사 과정에서도 원본 모의수강신청 파일을 변경하지 않는다.
 for(const name of ['practice.html','selectZone.html'])
  assert.ok(fs.existsSync(path.join(ROOT,'html',name)));
});

test('승인된 화면 정돈은 모드 타일 접근성과 제한된 시각 효과를 유지한다',()=>{
 const menu=fs.readFileSync(path.join(ROOT,'html','vsugang.html'),'utf8');
 for(const mode of [1,2,3]){
   assert.match(menu,new RegExp("onclick='goPractice\\("+mode+"\\)'[^>]*role='button' tabindex='0'"));
   assert.match(menu,new RegExp("onkeydown='[^']*goPractice\\("+mode+"\\)"));
 }
 assert.match(menu,/연습 전 과목 수를 설정해 주세요/);
 const modes=fs.readFileSync(path.join(ROOT,'css','vsugang-fit.css'),'utf8');
 assert.match(modes,/backdrop-filter:\s*blur\(7px\)/);
 assert.match(modes,/prefers-reduced-motion:\s*reduce/);
 const home=fs.readFileSync(path.join(ROOT,'css','home-fit.css'),'utf8');
 assert.match(home,/body\.hanmo-home \.button\.display/);
 const common=fs.readFileSync(path.join(ROOT,'css','hanmo-components.css'),'utf8');
 assert.match(common,/#planner-go-notices/);
 assert.match(common,/scroll-behavior:\s*smooth/);
});

test('홈·모드·학업·개발자 조작에만 느린 글로우를 적용한다',()=>{
 const mode=fs.readFileSync(path.join(ROOT,'css/vsugang-fit.css'),'utf8');
 const home=fs.readFileSync(path.join(ROOT,'css/home-fit.css'),'utf8');
 const common=fs.readFileSync(path.join(ROOT,'css/hanmo-components.css'),'utf8');
 const credit=fs.readFileSync(path.join(ROOT,'css/academic-progress.css'),'utf8');
 for(const css of [mode,home,common]){
    assert.ok(css.includes('radial-gradient'));
    assert.ok(css.includes('transition: opacity 1.08s'));
    assert.ok(css.includes('prefers-reduced-motion'));
  }
  assert.doesNotMatch(credit,/radial-gradient|\.progress-main \.progress-form button::before/,
    '졸업 준비의 신규 미니멀 조작에는 별도 글로우를 두지 않는다');
 assert.ok(common.includes('--hm-glow-ease'));
 assert.ok(home.includes('body.hanmo-home .button::before'));
 assert.ok(common.includes('body.hanmo-ui :is(.hanmo-btn, .hanmo-practice-links a)::before'));
 assert.ok(common.includes('body.hanmo-flat-legacy .container > .button::before'));
 assert.ok(mode.includes('.grid > .basic-mode-tile'));
 assert.ok(common.includes('.hanmo-topbar .hanmo-nav-inline a::before'));
 assert.ok(!credit.includes('.progress-main table::before'));
});
