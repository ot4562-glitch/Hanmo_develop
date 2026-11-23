// @ts-check
import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {DESIGN_BASE_COMMIT,repositoryRoot,startDesignBaseline}
  from '../scripts/capture-design-baseline.mjs';

const fixedTime=new Date('2026-11-23T12:00:00Z');
const viewports=[{width:1440,height:900},{width:1280,height:720}];
const routes=[
  ['home','/index.html'],['vsugang','/html/vsugang.html'],
  ['planner','/html/planner.html'],['notices','/html/academic-timeline.html'],
  ['catalog','/html/catalog.html'],['forecast','/html/forecast.html'],
  ['calendar','/html/academic-calendar.html'],['support','/html/academic-support.html'],
  ['developer','/html/developer.html'],['result','/html/result.html'],
  ['practice','/html/practice.html'],['selectzone','/html/selectZone.html'],
  ['incident','/html/incident-404.html'],['pc-only','/html/pc-only.html'],
];
const dataPages=[
  {name:'공지',slug:'notices',path:'/html/academic-timeline.html',
    status:'#notice-status',query:'#notice-query',retry:'#notice-retry',
    fields:['#notice-query','#notice-type'],cards:'#notice-list article',list:'#notice-list'},
  {name:'강의',slug:'catalog',path:'/html/catalog.html',
    status:'#catalog-status',query:'#catalog-query',retry:'#catalog-retry',
    fields:['#catalog-query','#catalog-campus','#catalog-target-term'],
    cards:'#catalog-results article',list:'#catalog-results'},
];
const fixtureConfiguration={schemaVersion:1,mode:'supabase',
  projectUrl:'https://hanmo-ui-fixture.supabase.co',publishableKey:'sb_publishable_ui_fixture'};

/** @param {import('@playwright/test').Page} page */
async function preparePage(page){
  // 외부 폰트·분석·상담·학교 요청을 차단하고 양쪽 화면에 동일한 합성 상태를 준다.
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'
    ?route.continue():route.abort());
  await page.clock.setFixedTime(fixedTime);
  await page.addInitScript(()=>{
    let seed=20261123;
    Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    localStorage.setItem('deviceInfo','true');
    localStorage.setItem('practiceSetter','3');
    localStorage.setItem('psubjectValue','3');
    localStorage.setItem('subjectValue','1');
    localStorage.setItem('waitingValue','no');
    localStorage.setItem('waitingEntryValue','no');
    localStorage.setItem('TIMEtime','0.832');
    localStorage.setItem('SELECTtime','1.214');
    localStorage.setItem('SELECTWaitTime','0');
    if(location.pathname.endsWith('/incident-404.html')){
      localStorage.setItem('practiceSetter','1');
      sessionStorage.setItem('hanmo.synthetic404.transition.v3',JSON.stringify({
        version:3,mode:1,phase:'error',errorAt:Date.now(),
      }));
    }
  });
}

/** @param {import('@playwright/test').Page} page @param {string} path */
async function visit(page,path){
  await page.goto(path);
  if(path.endsWith('/forecast.html'))await expect(page).toHaveURL(/\/html\/catalog\.html$/);
  if(path.endsWith('/academic-calendar.html'))
    await expect(page.locator('#calendar-view [role="table"]')).toBeVisible();
  await expect(page.locator('body > .hanmo-policy-footer')).toBeVisible();
  await page.evaluate(()=>document.fonts.ready.then(()=>undefined));
}

/** @param {import('@playwright/test').Page} page @param {import('@playwright/test').TestInfo} info @param {string} name */
async function capture(page,info,name){
  // 캡처가 레이아웃에 미친 변화와 실제 화면의 잘림을 구분할 수 있도록 전후 수치를 기록한다.
  const geometry=()=>page.evaluate(()=>{
    const describe=element=>{
      if(!element)return null;
      const rect=element.getBoundingClientRect();
      const style=getComputedStyle(element);
      return {
        tag:element.tagName,id:element.id,className:element.className,
        rect:{x:rect.x,y:rect.y,top:rect.top,right:rect.right,bottom:rect.bottom,
          left:rect.left,width:rect.width,height:rect.height},
        scrollHeight:element.scrollHeight,clientHeight:element.clientHeight,
        scrollWidth:element.scrollWidth,clientWidth:element.clientWidth,
        visible:element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),
        display:style.display,visibility:style.visibility,position:style.position,
        opacity:style.opacity,overflowX:style.overflowX,overflowY:style.overflowY,
        height:style.height,minHeight:style.minHeight,maxHeight:style.maxHeight,
        flex:style.flex,boxSizing:style.boxSizing,transform:style.transform,
      };
    };
    return {
      window:{innerWidth,innerHeight,scrollX,scrollY,
        visualViewportHeight:window.visualViewport?.height??null},
      document:describe(document.documentElement),body:describe(document.body),
      main:describe(document.querySelector('main')),
      footer:describe(document.querySelector('body > .hanmo-policy-footer')),
      title:describe(document.querySelector('main h1')),
      titleContainer:describe(document.querySelector('main .titleContainer')),
    };
  });
  const before=await geometry();
  await info.attach(name,{body:await page.screenshot({fullPage:true,animations:'disabled',caret:'hide'}),
    contentType:'image/png'});
  const after=await geometry();
  let viewportCapture=null;
  if(['calendar-after-1440x900','planner-after-1440x900','developer-after-1440x900'].includes(name)){
    const viewportBefore=await geometry();
    await info.attach(name+'-viewport',{body:await page.screenshot({fullPage:false,animations:'disabled',caret:'hide'}),
      contentType:'image/png'});
    viewportCapture={before:viewportBefore,after:await geometry()};
  }
  await info.attach(name+'-geometry.json',{
    body:Buffer.from(JSON.stringify({before,after,viewportCapture},null,2)),contentType:'application/json',
  });
}

/** @param {import('@playwright/test').Page} page @param {import('@playwright/test').TestInfo} info @param {string} name */
async function captureState(page,info,name){
  for(const viewport of viewports){
    await page.setViewportSize(viewport);
    await capture(page,info,name+'-'+viewport.width+'x'+viewport.height);
  }
}

/** 학교 자료를 복제하지 않은 합성 판본이다. 원문 링크도 테스트에서 열지 않는다. */
function fixtureSnapshot(){
  return {snapshot_id:'UI-SYNTHETIC-1',schema_version:1,manifest_sha256:'a'.repeat(64),
    is_active:true,revoked_at:null,published_at:'2026-11-01T00:00:00Z',
    source_checked_at:'2026-11-01T00:00:00Z',expires_at:'2026-12-01T00:00:00Z',
    payload:{
      notices:[{id:'SYNTHETIC-N1',title:'합성 화면 검증 공지',type:'OTHER',
        sourceUrl:'https://www.hufs.ac.kr/?hanmo-ui-test=synthetic',publishedDate:'2026-11-01'}],
      offerings:[{courseId:'SYNTHETIC-C1',title:'합성 화면 검증 과목',campus:'SEOUL',
        term:'2026-2',sourceUrl:'https://www.hufs.ac.kr/?hanmo-ui-test=synthetic'}],
      faq:[],
    }};
}

/** @param {import('@playwright/test').Page} page @param {{state:string,requests:number}} fixture */
async function mockData(page,fixture){
  await page.route('**/data/academic-source-config.json',route=>route.fulfill({json:fixtureConfiguration}));
  await page.route('https://hanmo-ui-fixture.supabase.co/**',route=>{
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{
      'access-control-allow-origin':'*','access-control-allow-methods':'GET, OPTIONS',
      'access-control-allow-headers':'apikey, accept',
    }});
    fixture.requests++;
    if(fixture.state==='OFFLINE')return route.abort('connectionrefused');
    const snapshot=fixtureSnapshot();
    if(fixture.state==='INVALID')snapshot.expires_at='2026-11-02T00:00:00Z';
    return route.fulfill({json:fixture.state==='EMPTY'?[]:[snapshot],
      headers:{'access-control-allow-origin':'*'}});
  });
}

test.describe('수정 화면의 동작과 표시 상태',()=>{
  test.beforeEach(async({page})=>{await preparePage(page);});

  test('홈의 기본 링크와 본문 건너뛰기를 키보드로 이용한다',async({page})=>{
    await page.goto('/index.html');
    const start=page.getByRole('link',{name:'수강신청 연습하기',exact:true});
    await expect(start).toHaveAttribute('href','./html/vsugang.html');
    await expect(page.getByRole('button',{name:'새로고침',exact:true})).toHaveAttribute('type','button');
    await page.keyboard.press('Tab');
    await expect(page.locator('.hanmo-skip')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();
    for(let step=0;step<12;step++){
      if(await start.evaluate(element=>element===document.activeElement))break;
      await page.keyboard.press('Tab');
    }
    await expect(start).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/html\/vsugang\.html$/);
    await expect(page.locator('.basic-mode-tile')).toBeVisible();
  });

  for(const screen of dataPages){
    test(screen.name+' 미연결 상태는 입력과 불필요한 재시도를 제공하지 않는다',async({page},info)=>{
      let configurationRequests=0;
      let remoteRequests=0;
      page.on('request',request=>{
        if(request.url().includes('/data/academic-source-config.json'))configurationRequests++;
        if(request.url().includes('.supabase.co/'))remoteRequests++;
      });
      await page.goto(screen.path);
      await expect(page.locator(screen.status)).toContainText(/연결 전|미연결|연결되지/);
      await expect(page.locator(screen.status)).not.toContainText(/학교에서.*승인|학교가 승인/);
      for(const field of screen.fields)await expect(page.locator(field)).toBeDisabled();
      await expect(page.locator(screen.retry)).toBeHidden();
      await expect(page.locator(screen.cards)).toHaveCount(0);
      await captureState(page,info,screen.slug+'-NOT_CONNECTED');
      expect(configurationRequests).toBe(1);
      expect(remoteRequests).toBe(0);
    });

    test(screen.name+' 연결 실패는 수동 재시도로 복구되며 빈 공개 자료와 구분된다',async({page},info)=>{
      const fixture={state:'OFFLINE',requests:0};
      await mockData(page,fixture);
      await page.goto(screen.path);
      const status=page.locator(screen.status);
      await expect(status).toContainText(/연결.*못|연결.*실패/);
      await expect(page.locator(screen.retry)).toBeVisible();
      await expect(page.locator(screen.retry)).toBeEnabled();
      for(const field of screen.fields)await expect(page.locator(field)).toBeDisabled();
      await captureState(page,info,screen.slug+'-OFFLINE');
      const offlineMessage=await status.innerText();
      expect(fixture.requests).toBe(1);
      fixture.state='EMPTY';
      await page.locator(screen.retry).click();
      await expect(status).not.toHaveText(offlineMessage);
      await expect(status).toContainText(/없|비어/);
      await expect(page.locator(screen.cards)).toHaveCount(0);
      await expect(page.locator(screen.retry)).toBeHidden();
      for(const field of screen.fields)await expect(page.locator(field)).toBeDisabled();
      expect(fixture.requests).toBe(2);
      await captureState(page,info,screen.slug+'-EMPTY-after-retry');
    });

    for(const state of ['EMPTY','INVALID','READY']){
      test(screen.name+' '+state+' 상태를 합성 판본으로 확인한다',async({page},info)=>{
        const fixture={state,requests:0};
        await mockData(page,fixture);
        await page.goto(screen.path);
        const status=page.locator(screen.status);
        if(state==='READY'){
          await expect(page.locator(screen.query)).toBeEnabled();
          await expect(page.locator(screen.retry)).toBeHidden();
          await expect(page.locator(screen.cards)).toHaveCount(1);
          await expect(page.locator(screen.cards)).toContainText('합성 화면 검증');
          if(screen.slug==='catalog'){
            await page.locator('#catalog-campus').selectOption({label:'서울'});
            await expect(page.locator(screen.cards)).toHaveCount(1);
          }
          await captureState(page,info,screen.slug+'-READY');
          await page.locator(screen.query).fill('해당하지 않는 합성 검색어');
          await expect(page.locator(screen.cards)).toHaveCount(0);
          await expect(page.locator(screen.list)).toContainText('검색 결과 없음');
          await expect(page.locator(screen.query)).toBeEnabled();
          await captureState(page,info,screen.slug+'-NO_MATCH');
        }else{
          await expect(status).toContainText(state==='INVALID'?/검증|검수|확인할 수 없어/:/없|비어/);
          for(const field of screen.fields)await expect(page.locator(field)).toBeDisabled();
          await expect(page.locator(screen.cards)).toHaveCount(0);
          if(state==='INVALID')await expect(page.locator(screen.retry)).toBeVisible();
          else await expect(page.locator(screen.retry)).toBeHidden();
          await captureState(page,info,screen.slug+'-'+state);
        }
        expect(fixture.requests).toBe(1);
      });
    }
  }

  test('달력은 이전·다음·오늘로 이동하고 학교 일정 미연결을 유지한다',async({page},info)=>{
    await page.setViewportSize(viewports[0]);
    await visit(page,'/html/academic-calendar.html');
    await expect(page.getByRole('heading',{name:'학사 달력',level:1})).toBeVisible();
    const calendar=page.locator('#calendar-view');
    const month=calendar.getByRole('heading');
    const status=page.locator('#calendar-status');
    await expect(status).toContainText('학교 일정 연결 전');
    await expect(month).toHaveText('2026년 11월');
    for(const label of ['이전','다음','오늘']){
      const box=await calendar.getByRole('button',{name:label,exact:true}).boundingBox();
      expect(box?.height,label).toBeGreaterThanOrEqual(40);
    }
    await calendar.getByRole('button',{name:'다음',exact:true}).click();
    await expect(month).toHaveText('2026년 12월');
    await calendar.getByRole('button',{name:'이전',exact:true}).click();
    await expect(month).toHaveText('2026년 11월');
    await calendar.getByRole('button',{name:'이전',exact:true}).click();
    await expect(month).toHaveText('2026년 10월');
    await calendar.getByRole('button',{name:'오늘',exact:true}).click();
    await expect(month).toHaveText('2026년 11월');
    await expect(status).toContainText('학교 일정 연결 전');
    await expect(calendar.locator('[role="cell"][data-date]')).toHaveCount(30);
    await expect(calendar.locator('.hanmo-calendar-date').first()).toHaveCSS('padding-left','10px');
    // FullCalendar의 월간 일정 항목이 생기지 않아 빈 날짜를 실제 학사 일정처럼 꾸미지 않는다.
    await expect(calendar.getByRole('listitem')).toHaveCount(0);
    await expect(calendar.locator('[role="cell"] a')).toHaveCount(0);
    await captureState(page,info,'calendar-navigation-returned-today');
  });

  for(const viewport of [{width:1280,height:720},{width:1440,height:900},{width:1920,height:1080},{width:960,height:540}]){
    test(viewport.width+'×'+viewport.height+'에서 가로 넘침과 핵심 콘텐츠 잘림이 없다',async({page})=>{
      // 960×540은 1920×1080의 200% 확대에 해당하는 레이아웃 폭이며 실기기 확대 검수와 구분한다.
      test.setTimeout(90_000);
      await page.setViewportSize(viewport);
      for(const [name,path] of routes.filter(([name])=>!['practice','selectzone','forecast'].includes(name))){
        await visit(page,path);
        const overflow=await page.evaluate(()=>({
          viewport:document.documentElement.clientWidth,
          width:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),
        }));
        expect(overflow.width,name).toBeLessThanOrEqual(overflow.viewport+1);
        const heading=page.getByRole('heading').first();
        await heading.scrollIntoViewIfNeeded();
        await expect(heading,name).toBeInViewport({ratio:1});
        const controls=page.locator('main input, main select, main button, main .button, main [role="button"], main .hanmo-actions a');
        for(const control of await controls.all()){
          if(!await control.isVisible())continue;
          await control.scrollIntoViewIfNeeded();
          await expect(control,name).toBeInViewport({ratio:0.99});
        }
        const footer=page.locator('body > .hanmo-policy-footer');
        await footer.scrollIntoViewIfNeeded();
        await expect(footer,name).toBeInViewport({ratio:0.99});
        if(name==='home'){
          const actions=page.locator('.buttonContainer');
          await actions.scrollIntoViewIfNeeded();
          await expect(actions).toBeInViewport({ratio:1});
          const scale=await page.locator('.home-fit-content').evaluate(element=>{
            const matrix=new DOMMatrixReadOnly(getComputedStyle(element).transform);
            return {x:Math.hypot(matrix.a,matrix.b),y:Math.hypot(matrix.c,matrix.d)};
          });
          expect(scale.x).toBeCloseTo(1,2);
          expect(scale.y).toBeCloseTo(1,2);
        }
      }
    });
  }
});

test('practice와 selectZone의 소스·공유 스타일·이미지는 변경 전과 바이트가 같다',()=>{
  const protectedPaths=[
    'html/practice.html','html/selectZone.html','css/practice.css','css/normalize.css',
    'css/gnb.css','css/hanmo-policy-footer.css','js/pc-only.js','js/gnb.js',
    'js/hanmoSys.js','js/practice.js','js/selectZone.js','img/favicon-purple.svg',
    'img/watermark.png','img/register.png','img/delete.png','img/hanmo_color.png',
  ];
  for(const path of protectedPaths){
    const original=execFileSync('git',['show',DESIGN_BASE_COMMIT+':'+path],
      {cwd:repositoryRoot,maxBuffer:16*1024*1024});
    expect(readFileSync(join(repositoryRoot,path)).equals(original),path).toBe(true);
  }
});

test.describe('같은 날짜와 합성 상태의 전체 경로 전후 화면',()=>{
  /** @type {Awaited<ReturnType<typeof startDesignBaseline>>|undefined} */
  let baseline;
  test.beforeAll(async()=>{
    test.setTimeout(90_000);
    baseline=await startDesignBaseline();
  });
  test.afterAll(async()=>{await baseline?.close();});

  for(const [name,path] of routes){
    test(name+'의 변경 전·후와 작은 PC 창을 기록한다',async({browser},info)=>{
      const scenarios=[
        {name:'before',baseURL:baseline.url,viewport:viewports[0]},
        {name:'after',baseURL:'http://127.0.0.1:4173',viewport:viewports[0]},
        {name:'after',baseURL:'http://127.0.0.1:4173',viewport:viewports[1]},
      ];
      const evidence=[];
      for(const scenario of scenarios){
        const context=await browser.newContext({baseURL:scenario.baseURL,viewport:scenario.viewport,
          timezoneId:'Asia/Seoul',locale:'ko-KR',reducedMotion:'reduce'});
        try{
          const page=await context.newPage();
          const errors=[];
          page.on('pageerror',error=>errors.push(error.message));
          await preparePage(page);
          await visit(page,path);
          const label=name+'-'+scenario.name+'-'+scenario.viewport.width+'x'+scenario.viewport.height;
          await capture(page,info,label);
          evidence.push({label,url:page.url(),pageErrors:errors});
          if(scenario.name==='after')expect(errors,label).toEqual([]);
        }finally{await context.close();}
      }
      await info.attach('비교-조건.json',{body:Buffer.from(JSON.stringify({
        baseCommit:DESIGN_BASE_COMMIT,fixedTime:fixedTime.toISOString(),randomSeed:20261123,
        externalRequests:'차단',data:'합성 연습 값과 자료 미연결 상태',screens:evidence,
      },null,2)),contentType:'application/json'});
    });
  }
});

test('학업 화면의 기능 안내와 문의처의 버튼 없는 검색을 유지한다',async({page})=>{
  for(const slug of ['academic-timeline','catalog','academic-calendar','academic-support']){
    await page.goto('/html/'+slug+'.html');
    const info=page.locator('.hanmo-title-help-button');
    await expect(info).toHaveCount(1);
    await info.focus();
    await expect(page.locator('.hanmo-title-help-tip')).toBeVisible();
  }
  await page.goto('/html/academic-support.html');
  await expect(page.locator('#support-submit')).toHaveCount(0);
  await page.getByRole('button',{name:'계절학기 문의'}).click();
  await expect(page.locator('#support-result-link')).toHaveAttribute('href',/google.com\/search/);
});
