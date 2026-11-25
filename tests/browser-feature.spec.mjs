// @ts-check
import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

test.beforeEach(async({page})=>{
  await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:4174/')
    ?route.continue():route.abort());
});

test('정보처 서면 이후 금지된 페이지와 메뉴가 보이지 않고 비공식 고지가 남는다',async({page})=>{
 await page.goto('/index.html');
 await expect(page.locator('.hanmo-topbar a[href*="academic-progress"]')).toHaveCount(0);
 await expect(page.locator('.hanmo-topbar a[href*="academic-faq"]')).toHaveCount(0);
 await expect(page.locator('.hanmo-topbar .hanmo-brand')).not.toContainText('비공식 연습·정보');
 await expect(page.locator('body > .hanmo-policy-footer')).toContainText('본 서비스는 한국외국어대학교의 공식 서비스가 아니며');
 for(const slug of ['academic-timeline','catalog','planner']){
  await page.goto('/html/'+slug+'.html');
  await expect(page.locator('body > .hanmo-policy-footer')).toContainText('정확한 정보는 학교 원문');
  await expect(page.locator('.hanmo-title-divider')).toHaveCount(1);
  await expect(page.locator('.hanmo-title-divider img')).toBeVisible();
  await expect(page.locator('.hanmo-topbar')).toBeVisible();
  await expect(page.locator('.hanmo-topbar .hanmo-brand')).toHaveText('한모');
 }
});


test('모든 화면에서 비공식 안내는 화면 안의 최하단에 나타난다',async({page})=>{
 const paths=['/index.html','/html/vsugang.html','/html/practice.html',
   '/html/selectZone.html','/html/result.html','/html/developer.html',
   '/html/academic-timeline.html','/html/catalog.html','/html/readiness.html','/html/reaction-test.html','/html/strategy-lab.html',
   '/html/planner.html','/html/pc-only.html'];
 const exact='본 서비스는 한국외국어대학교의 공식 서비스가 아니며, 정확한 정보는 학교 원문을 확인하시기 바랍니다.';
 for(const path of paths){
  await page.goto(path);
  const footer=page.locator('body > footer.hanmo-policy-footer');
  await expect(footer,'footer missing: '+path).toHaveCount(1);
  await expect(footer.locator('strong')).toHaveText(exact);
  const rect=await footer.boundingBox();
  expect(rect,path).not.toBeNull();
  expect(rect.height,path).toBeGreaterThan(30);
  if(path==='/index.html'){
   await expect(page.locator('.home-ad-footer')).toHaveCount(0);
   expect(rect.y+rect.height,path).toBeLessThanOrEqual(page.viewportSize().height+1);
  }
 }
});

test('좁은 데스크톱 홈에서도 주요 조작과 안내를 스크롤로 읽을 수 있다',async({page})=>{
 for(const viewport of [{width:1280,height:720},{width:960,height:600},{width:650,height:500}]){
  await page.setViewportSize(viewport);
  await page.goto('/index.html');
  await expect(page.locator('.home-ad-footer')).toHaveCount(0);
  const practice=page.getByRole('link',{name:'수강신청 연습하기'});
  await practice.scrollIntoViewIfNeeded();
  await expect(practice).toBeInViewport();
  await expect(page.getByRole('button',{name:'새로고침'})).toBeVisible();
  await expect(page.getByRole('link',{name:'개발자 소개'})).toBeVisible();
  const notice=page.locator('body > .hanmo-policy-footer');
  await notice.scrollIntoViewIfNeeded();
  const footer=await notice.boundingBox();
  expect(footer,JSON.stringify(viewport)).not.toBeNull();
  expect(footer.y+footer.height,JSON.stringify(viewport)).toBeLessThanOrEqual(viewport.height+1);
  await expect(page.locator('.hanmo-policy-footer strong')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width+1);
 }
});


test('페이지 제목 아래 한모 구분 장식의 선·로고가 잘 보인다',async({page})=>{
 const routes=['/html/academic-timeline.html','/html/catalog.html',
  '/html/planner.html','/html/pc-only.html',
  '/html/forecast.html'];
 for(const route of routes){
  await page.goto(route);
  const logo=page.locator('.hanmo-title-divider img');
  await expect(logo,route).toBeVisible();
  const dimension=await logo.boundingBox();
  expect(dimension,route).not.toBeNull();
  expect(dimension.height,route).toBeGreaterThanOrEqual(9);
  const line=page.locator('.hanmo-title-divider > hr');
  await expect(line).toHaveCount(2);
  const lineSizes=await line.evaluateAll(items=>items.map(el=>el.getBoundingClientRect().width));
  expect(lineSizes.every(size=>size>0),route).toBe(true);
 }
});


test('상단 브랜드와 학사공지·강의검색 제목 정리 후 기능은 유지된다',async({page})=>{
  const headerPages=['/index.html','/html/vsugang.html','/html/developer.html',
    '/html/result.html','/html/academic-timeline.html','/html/catalog.html',
    '/html/readiness.html','/html/reaction-test.html','/html/strategy-lab.html','/html/planner.html'];
  for(const path of headerPages){
    await page.goto(path);
    await expect(page.locator('.hanmo-topbar .hanmo-brand')).toHaveText('한모');
    await expect(page.locator('body > .hanmo-policy-footer strong')).toContainText('본 서비스는 한국외국어대학교의 공식 서비스가 아니며');
  }
  await page.goto('/html/catalog.html');
  await expect(page.locator('.hanmo-schoolmark h1')).toHaveText('강의 검색');
  await expect(page.locator('#catalog-query')).toHaveCount(1);
  await expect(page.locator('#catalog-results')).toHaveCount(1);
  await page.goto('/html/academic-timeline.html');
  await expect(page.getByRole('heading',{name:'공지 검색'})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'공지 목록'})).toHaveCount(0);
  await expect(page.locator('#notice-filter')).toHaveCount(1);
  await expect(page.locator('#notice-query')).toBeVisible();
  await expect(page.locator('#notice-list')).toHaveCount(1);
  for(const path of ['/html/practice.html','/html/selectZone.html']){
    await page.goto(path);
    await expect(page.locator('.hanmo-title-divider')).toHaveCount(0);
  }
});


test('학사 공지·강의 검색은 내비게이션 이름과 페이지 표제를 공유한다',async({page})=>{
 for(const name of ['academic-timeline','catalog']){
  await page.goto('/html/'+name+'.html');
  const current=page.locator('.hanmo-topbar a[aria-current="page"]');
  const title=page.locator('.hanmo-schoolmark h1');
  await expect(current).toHaveCount(1);
  await expect(title).toHaveCount(1);
  expect((await current.innerText()).trim()).toBe((await title.innerText()).trim());
 }
 await page.goto('/html/catalog.html');
 await expect(page.locator('label[for="catalog-query"]')).toContainText('과목명·학수번호');
 await expect(page.locator('#catalog-query')).toBeDisabled();
});

test('학사 통합 화면과 강의 검색의 제목 구분선이 남는다',async({page})=>{
 for(const route of ['/html/academic-timeline.html','/html/catalog.html']){
  await page.goto(route);
  await expect(page.locator('.hanmo-title-divider')).toHaveCount(1);
 }
});

test('개발자 페이지는 네 명의 Contributor를 나란히 표기한다',async({page})=>{
 await page.goto('/html/developer.html');
 await expect(page.locator('.hanmo-contributor-list > li')).toHaveCount(4);
 await expect(page.locator('.hanmo-contributor-list strong')).toHaveText(['ZetBe','심민성','이의상','김채윤']);
 await expect(page.locator('.hanmo-contributor-list span')).toHaveCount(4);
});

test('관심강좌·전공·교양·기초 선택은 Search 전 메뉴만 바꾸고 네 화면을 캡처한다',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('deviceInfo','true');
    localStorage.setItem('practiceSetter','3');
    localStorage.setItem('psubjectValue','3');
    localStorage.setItem('subjectValue','1');
    localStorage.setItem('waitingValue','no');
    localStorage.setItem('waitingEntryValue','no');
  });
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/html/selectZone.html');
  const modes=['INTEREST','MAJOR','GENERAL','FOUNDATION'];
  await expect(page.locator('input[name="course-mode"]')).toHaveCount(4);
  mkdirSync('e2e-artifacts',{recursive:true});
  for(const mode of modes){
    await page.locator('input[name="course-mode"][value="'+mode+'"]').check();
    await expect(page.locator('#course-mode-nav')).toHaveAttribute('data-mode',mode);
    await expect(page.locator('#course-search-prompt')).toBeVisible();
    await expect(page.locator('.table')).toBeHidden();
    await expect(page.locator('#course-general-warning'))[mode==='GENERAL'?'toBeVisible':'toBeHidden']();
    if(mode!=='INTEREST')
      await expect(page.locator('[data-course-filter="'+mode+'"]')).toBeVisible();
    const offset=await page.evaluate(()=>{
      const nav=document.getElementById('course-mode-nav');
      if(!nav)return 9999;
      const boxes=[...nav.querySelectorAll('.course-types label,.menu-extra:not([hidden]),button.search')]
        .map(el=>el.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0);
      const center=(Math.min(...boxes.map(r=>r.left))+Math.max(...boxes.map(r=>r.right)))/2;
      const navBox=nav.getBoundingClientRect();
      return Math.abs(center-(navBox.left+navBox.width/2));
    });
    expect(offset).toBeLessThan(18);
    await page.screenshot({path:'e2e-artifacts/selectzone-'+mode+'.png',fullPage:false});
  }
  page.once('dialog',async dialog=>{
    expect(dialog.message()).toBe('조회구분을 선택해주세요.');
    await dialog.accept();
  });
  await page.locator('button.search').click();
  await expect(page.locator('.table')).toBeHidden();
  await page.locator('select[aria-label="기초 조회구분"]').selectOption('AVAILABLE');
  await page.locator('button.search').click();
  await expect(page.locator('.table')).toBeVisible();
  await expect(page.locator('[data-synthetic-alternative="true"]')).toHaveCount(6);
});

test('교양과목·조회구분이 ***Select***이면 각각 브라우저 알림 후 검색을 중단한다',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('practiceSetter','3');
    localStorage.setItem('psubjectValue','3');
    localStorage.setItem('subjectValue','1');
    localStorage.setItem('waitingValue','no');
  });
  await page.goto('/html/selectZone.html');
  await page.locator('input[name="course-mode"][value="GENERAL"]').check();
  let message='';
  page.on('dialog',async dialog=>{message=dialog.message();await dialog.accept();});
  await page.locator('button.search').click();
  expect(message).toBe('교양과목을 선택해주세요.');
  await expect(page.locator('.table')).toBeHidden();
  await page.locator('select[aria-label="교양과목"]').selectOption('GENERAL');
  await page.locator('button.search').click();
  expect(message).toBe('조회구분을 선택해주세요.');
  await expect(page.locator('.table')).toBeHidden();
  await page.locator('select[aria-label="교양 조회구분"]').selectOption('AVAILABLE');
  await page.locator('button.search').click();
  await expect(page.locator('[data-synthetic-alternative="true"]')).toHaveCount(6);
});

test('CAPACITY는 SELECT 모드에서 저장 플래그가 있어도 비활성이다',async({page})=>{
  await page.addInitScript(()=>{
    sessionStorage.setItem('hanmo.syntheticCapacity.active.v1','yes');
    localStorage.setItem('practiceSetter','3');
    localStorage.setItem('psubjectValue','3');
    localStorage.setItem('subjectValue','1');
    localStorage.setItem('waitingValue','no');
  });
  await page.goto('/html/selectZone.html');
  await page.locator('button.search').click();
  await expect(page.locator('.course-capacity-label')).toHaveCount(0);
  await expect(page.locator('button.register')).toHaveCount(3);
});

test('BASIC 정원 마감 ON에서 임의의 한 register를 제거하고 합성 대체과목을 신청한다',async({page})=>{
  await page.addInitScript(()=>{Math.random=()=>0.65;});
  const dialogs=[];
  page.on('dialog',dialog=>{dialogs.push(dialog.message());void dialog.accept();});
  await page.goto('/html/vsugang.html');
  await page.getByRole('button',{name:'모의신청 설정 열기'}).click();
  await page.locator('.psugangVal').fill('3');
  await page.locator('.vsugangVal').fill('1');
  await page.locator('input[name="waitingCourseYN"][value="no"]').check();
  await page.locator('input[name="waitingEntryYN"][value="no"]').check();
  await page.locator('.settingSection .settingButton').click();
  await page.locator('#incident-options').click();
  await page.locator('[data-capacity-toggle]').check();
  await page.locator('#scenario-settings button[value="save"]').click();
  await page.locator('.basic-mode-tile').click({position:{x:60,y:60}});
  await expect(page).toHaveURL(/\/html\/practice\.html$/);
  await page.waitForLoadState('load');
  await page.waitForTimeout(10250);
  await page.locator('.sugang').click();
  await expect(page).toHaveURL(/\/html\/selectZone\.html$/);
  await page.locator('button.search').click();
  await expect(page.locator('.table')).toBeVisible();
  const closedCell=page.locator('#subject2 td').nth(1);
  await expect(closedCell).toBeEmpty();
  await expect(closedCell).toHaveAttribute('aria-label','가상 정원 마감');
  await expect(page.locator('#subject1 button.register')).toBeVisible();
  await expect(page.locator('.course-capacity-hint,.course-capacity-label')).toHaveCount(0);
  await expect(page.locator('button.register')).toHaveCount(2);
  await page.locator('input[name="course-mode"][value="MAJOR"]').check();
  await expect(page.locator('.table')).toBeHidden();
  await page.locator('button.search').click();
  expect(dialogs.at(-1)).toBe('학과를 선택해주세요.');
  await expect(page.locator('.table')).toBeHidden();
  await page.locator('select[aria-label="학과선택"]').selectOption('SEOUL');
  await page.locator('button.search').click();
  // 원본 관심강좌 행은 숨긴 채 보존하므로 표시 중인 합성 대체과목만 집계한다.
  await expect(page.locator('[data-synthetic-alternative="true"] button.register')).toHaveCount(6);
  await page.locator('[data-synthetic-alternative="true"] button.register').first().click();
  await expect(page).toHaveURL(/\/html\/result\.html$/);
  await expect(page.locator('.result p span')).toContainText('초');
});

test('1920x1080 달력은 날짜행이 접히지 않고 모든 날짜가 보인다',async({page})=>{
  await page.setViewportSize({width:1920,height:1080});
  await page.goto('/html/academic-timeline.html#calendar');
  const rows=page.locator('#calendar-view [role="row"][aria-label^="주 "]');
  const count=await rows.count();
  expect(count).toBeGreaterThanOrEqual(4);
  expect(count).toBeLessThanOrEqual(6);
  for(let index=0;index<count;index++){
    const row=rows.nth(index);
    await expect(row).toBeVisible();
    const rect=await row.boundingBox();
    expect(rect,'달력 주차 행이 접히면 안 됨').not.toBeNull();
    expect(rect.height).toBeGreaterThan(35);
    expect(rect.y+rect.height).toBeLessThanOrEqual(1079);
  }
  await expect(page.locator('#calendar-view [role="cell"][data-date]').first()).toBeVisible();
  const scrollHeight=await page.evaluate(()=>document.documentElement.scrollHeight);
  expect(scrollHeight).toBeLessThanOrEqual(1081);
  await expect(page.locator('#calendar-status')).toBeVisible();
  await expect(page.locator('#calendar-status')).toHaveText('학교 일정 연결 전');
  await page.screenshot({path:'e2e-artifacts/calendar-restored-1920x1080.png',fullPage:false});
});


test('상단 바로 달력과 검색형 학교 문의처를 열 수 있다',async({page})=>{
  await page.setViewportSize({width:1920,height:1080});
  const paths=['/index.html','/html/academic-timeline.html','/html/catalog.html',
    '/html/reaction-test.html',
    '/html/planner.html','/html/forecast.html',
    '/html/vsugang.html','/html/developer.html','/html/result.html'];
  const links=[
    {name:'학사 정보',end:'/academic-timeline.html'}, {name:'PC 진단',end:'/readiness.html'}, {name:'전략 실험',end:'/strategy-lab.html'},
  ];
  for(const path of paths){
    await page.goto(path);
    await expect(page.locator('.hanmo-tools')).toHaveCount(0);
    const bar=page.locator('.hanmo-topbar');
    const rect=await bar.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect.height,'상단 바 한 줄: '+path).toBeLessThanOrEqual(86);
    for(const link of links){
      const entry=bar.getByRole('link',{name:link.name});
      await expect(entry).toBeVisible();
      const href=await entry.getAttribute('href');
      expect(href.endsWith(link.end),'상단 링크: '+path+' '+link.name).toBe(true);
      const tag=await entry.evaluate(element=>element.parentElement?.tagName);
      expect(['NAV','DIV']).toContain(tag);
    }
  }
});

test('학사 달력과 미연결 강의 전망이 안전하게 작동한다',async({page})=>{
  await page.goto('/index.html');
  await expect(page.locator('.hanmo-tools')).toHaveCount(0);
  await expect(page.getByRole('link',{name:'학사 정보'})).toBeVisible();
  const runtimeErrors=[];
  const failedResources=[];
  page.on('pageerror',error=>runtimeErrors.push(error.message));
  page.on('response',response=>{
    if(response.status()>=400)failedResources.push(response.status()+' '+response.url());
  });
  await page.getByRole('link',{name:'학사 정보'}).click();
   await expect(page).toHaveURL(/academic-timeline\.html$/);
   await page.getByRole('tab',{name:'학사 달력'}).click();
  await page.waitForTimeout(450);

  expect(runtimeErrors).toEqual([]);
  expect(failedResources).toEqual([]);
  await expect(page.locator('#calendar-view [role="heading"][aria-level="2"]')).toBeVisible();
  const days=await page.locator('#calendar-view [role="cell"][data-date]').count();
  expect(days).toBeGreaterThanOrEqual(28);
  expect(days).toBeLessThanOrEqual(42);
  await expect(page.locator('#calendar-status')).toBeVisible();
  await expect(page.locator('#calendar-status')).toHaveText('학교 일정 연결 전');
  await page.screenshot({path:'e2e-artifacts/academic-calendar-month.png',fullPage:false});
  await expect(page.locator('#calendar-status')).toBeVisible();
  await page.goto('/html/catalog.html');
  await expect(page.locator('#catalog-campus')).toBeDisabled();
  await expect(page.locator('#catalog-target-term')).toBeDisabled();
  await page.goto('/html/forecast.html');
  await expect(page).toHaveURL(/\/html\/catalog\.html$/);
});

test('1980x1080에서 모든 공개 페이지가 스크롤 없이 화면 안에 나타난다',async({page})=>{
 const viewport={width:1980,height:1080};
 await page.setViewportSize(viewport);
 await page.addInitScript(()=>{
   localStorage.setItem('deviceInfo','true');
   localStorage.setItem('practiceSetter','3');
   localStorage.setItem('psubjectValue','5');
   localStorage.setItem('subjectValue','3');
   localStorage.setItem('waitingValue','no');
   localStorage.setItem('waitingEntryValue','no');
 });
 const paths=['/index.html','/html/vsugang.html','/html/practice.html','/html/selectZone.html',
   '/html/result.html','/html/developer.html','/html/academic-timeline.html',
   '/html/catalog.html','/html/readiness.html','/html/reaction-test.html','/html/strategy-lab.html','/html/planner.html',
   '/html/pc-only.html','/html/incident-404.html'];
 for(const path of paths){
   await page.goto(path);
   await page.evaluate(()=>document.fonts.ready);
   const g=await page.evaluate(()=>{
     const main=document.querySelector('main,.hanmo-main,.half');
     const footer=document.querySelector('body > .hanmo-policy-footer');
     const m=main?.getBoundingClientRect(),f=footer?.getBoundingClientRect();
     return {w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight,
       mainWidth:m?.width,mainLeft:m?.left,mainBottom:m?.bottom,contentBottom:main?.lastElementChild?.getBoundingClientRect().bottom,
       footerBottom:f?.bottom};
   });
   expect(g.w,path+' horizontal scroll').toBeLessThanOrEqual(1981);
   expect(g.h,path+' vertical scroll').toBeLessThanOrEqual(1081);
   expect(g.footerBottom,path+' footer').toBeLessThanOrEqual(1081);
   if(/academic-timeline|catalog|planner/.test(path)){
     expect(g.mainWidth,path+' 작업 영역 폭').toBeCloseTo(1184,0);
     expect(g.mainLeft+g.mainWidth/2,path+' 중앙 정렬').toBeCloseTo(viewport.width/2,0);
     expect(g.contentBottom,path+' content').toBeLessThanOrEqual(g.mainBottom+2);
   }
 }
 await page.goto('/html/academic-timeline.html#calendar');
 await expect(page.locator('#calendar-view [role="cell"][data-date]').first()).toBeVisible();
 await expect(page.locator('#calendar-view [role="cell"][data-date]').last()).toBeVisible();
});

test('삭제된 학교 문의처와 독립 학사 달력 URL은 404다',async({page})=>{
 for(const path of ['/html/academic-support.html','/html/academic-calendar.html']){
  const response=await page.request.get(path);
  expect(response.status(),path).toBe(404);
 }
});

test('보라색 원본 favicon은 투명 정사각형 중앙에 550:218 비율을 유지한다',async({page})=>{
 const raw=(await page.request.get('/img/hanmo_purple.png'));
 const icon=(await page.request.get('/img/favicon-purple.svg'));
 expect(raw.ok()).toBe(true);
 expect(icon.ok()).toBe(true);
 const png=await raw.body(),svg=await icon.text();
 expect(png.toString('ascii',1,4)).toBe('PNG');
 expect(png.readUInt32BE(16)).toBe(550);
 expect(png.readUInt32BE(20)).toBe(218);
 expect(png.readUInt8(25)).toBe(6);
 expect(svg).toContain('viewBox="0 0 550 550"');
 expect(svg).toContain('x="0" y="166" width="550" height="218"');
 expect(svg).toContain('data:image/png;base64,'+png.toString('base64'));
 expect(svg).not.toMatch(/<(?:rect|path|circle|polygon)\b/);
 await page.goto('/index.html');
 const rendered=await page.evaluate(async()=>{
  const img=new Image();
  img.src='/img/favicon-purple.svg';
  await img.decode();
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d');
  ctx.drawImage(img,0,0,128,128);
  const px=ctx.getImageData(0,0,128,128).data;
  let visible=0;
  for(let i=3;i<px.length;i+=4)if(px[i]>16)visible++;
  return {w:img.naturalWidth,h:img.naturalHeight,
   cornerAlpha:px[3],topAlpha:px[(10*128+64)*4+3],
   bottomAlpha:px[(118*128+64)*4+3],visible};
 });
 expect(rendered.w).toBe(rendered.h);
 expect(rendered.cornerAlpha).toBe(0);
 expect(rendered.topAlpha).toBe(0);
 expect(rendered.bottomAlpha).toBe(0);
 expect(rendered.visible).toBeGreaterThan(1500);
 for(const path of ['/index.html','/html/practice.html','/html/vsugang.html',
  '/html/selectZone.html','/html/developer.html','/html/result.html',
  '/html/academic-timeline.html','/html/catalog.html','/html/reaction-test.html',
  '/html/strategy-lab.html','/html/planner.html','/html/incident-404.html','/html/pc-only.html']){
  await page.goto(path);
  const href=page.locator('link[rel="icon"]');
  await expect(href).toHaveAttribute('href',/favicon-purple\.svg$/);
  await expect(href).toHaveAttribute('type','image/svg+xml');
 }
});

test('1980x1080 개발자 소개는 내용과 버튼이 화면 밖으로 잘리거나 내부 스크롤되지 않는다',async({page})=>{
 for(const width of [1920,1980]){
  await page.setViewportSize({width,height:1080});
  await page.goto('/html/developer.html');
  await expect(page.locator('.hanmo-contributor-list li')).toHaveCount(4);
  const g=await page.evaluate(()=>{
   const main=document.querySelector('main');
   const info=document.querySelector('.hanmo-contributors');
   const back=document.querySelector('.container > .button');
   const footer=document.querySelector('body > .hanmo-policy-footer');
   const m=main.getBoundingClientRect(),i=info.getBoundingClientRect(),b=back.getBoundingClientRect(),f=footer.getBoundingClientRect();
   return {documentH:document.documentElement.scrollHeight,mainScroll:main.scrollHeight,mainClient:main.clientHeight,
    mainTop:m.top,mainBottom:m.bottom,infoTop:i.top,infoBottom:i.bottom,
    backTop:b.top,backBottom:b.bottom,footerBottom:f.bottom};
  });
  expect(g.documentH,'document '+width).toBeLessThanOrEqual(1081);
  expect(g.mainScroll,'nested main '+width).toBeLessThanOrEqual(g.mainClient+1);
  expect(g.infoTop,'info top '+width).toBeGreaterThanOrEqual(g.mainTop-1);
  expect(g.infoBottom,'info bottom '+width).toBeLessThanOrEqual(g.mainBottom+1);
  expect(g.backTop,'button '+width).toBeGreaterThanOrEqual(g.mainTop-1);
  expect(g.backBottom,'button '+width).toBeLessThanOrEqual(g.mainBottom+1);
  expect(g.footerBottom,'footer '+width).toBeLessThanOrEqual(1081);
 }
});

test('돌발상황과 SETTING 타일은 1980x1080에서 같은 정사각형 크기다',async({page})=>{
 await page.setViewportSize({width:1980,height:1080});
 await page.goto('/html/vsugang.html');
 const tiles=await page.evaluate(()=>{
  const a=document.getElementById('incident-options').getBoundingClientRect();
  const b=document.querySelector('.grid > .setting').getBoundingClientRect();
  return {aW:a.width,aH:a.height,bW:b.width,bH:b.height};
 });
 expect(Math.abs(tiles.aW-tiles.bW)).toBeLessThanOrEqual(1);
 expect(Math.abs(tiles.aH-tiles.bH)).toBeLessThanOrEqual(1);
 expect(Math.abs(tiles.aW-tiles.aH)).toBeLessThanOrEqual(1);
 expect(tiles.aW).toBeGreaterThan(200);
});

test('교양 경고문 표시 여부와 무관하게 selectZone 두 표의 좌표를 고정한다',async({page})=>{
 await page.setViewportSize({width:1980,height:1080});
 await page.addInitScript(()=>{
  localStorage.setItem('deviceInfo','true');
  localStorage.setItem('practiceSetter','3');
  localStorage.setItem('psubjectValue','5');
  localStorage.setItem('subjectValue','3');
  localStorage.setItem('waitingValue','no');
  localStorage.setItem('waitingEntryValue','no');
 });
 await page.goto('/html/selectZone.html');
 const items=[];
 for(const mode of ['INTEREST','MAJOR','GENERAL','FOUNDATION']){
  await page.locator('input[name="course-mode"][value="'+mode+'"]').check();
  const box=await page.evaluate(()=>{
   const top=id=>document.querySelector(id).getBoundingClientRect().top;
   return {nav:top('#course-mode-nav'),navHeight:document.querySelector('#course-mode-nav').getBoundingClientRect().height,
    prompt:top('#course-search-prompt'),table:top('.vsugangTable'),done:top('.vsugangedTable')};
  });
  items.push(box);
  await expect(page.locator('#course-general-warning'))[mode==='GENERAL'?'toBeVisible':'toBeHidden']();
 }
 for(const key of ['nav','navHeight','prompt','table','done']){
  expect(Math.max(...items.map(x=>x[key]))-Math.min(...items.map(x=>x[key])),key+' moved').toBeLessThanOrEqual(1);
 }
});

test('학사 정보 안에서 공지·달력 탭을 전환한다',async({page})=>{
 await page.goto('/html/academic-timeline.html');
 await page.getByRole('tab',{name:'학사 달력'}).click();
 await expect(page.locator('#calendar-view [role="table"]')).toBeVisible();
 await page.getByRole('tab',{name:'학사 공지'}).click();
 await expect(page.locator('#notice-filter')).toBeVisible();
});

test('Search 버튼 실행 전후 안내·상단 바·신청 완료 표가 화면 내 같은 좌표를 유지한다',async({page})=>{
 await page.setViewportSize({width:1980,height:1080});
 await page.addInitScript(()=>{
  localStorage.setItem('deviceInfo','true');
  localStorage.setItem('practiceSetter','1');
  localStorage.setItem('psubjectValue','5');
  localStorage.setItem('subjectValue','3');
  localStorage.setItem('waitingValue','no');
  localStorage.setItem('waitingEntryValue','no');
 });
 await page.goto('/html/selectZone.html');
 const coords=()=>page.evaluate(()=>{
  const r=q=>document.querySelector(q).getBoundingClientRect();
  return {bar:r('#course-mode-nav').top,barHeight:r('#course-mode-nav').height,
   warning:r('.course-warning-slot').top,prompt:r('#course-search-prompt').top,
   course:r('.vsugangTable').top,courseHeight:r('.vsugangTable').height,
   done:r('.vsugangedTable').top};
 });
 const before=await coords();
 await page.locator('#course-mode-nav .search').click();
 await expect(page.locator('.table')).toBeVisible();
 await expect(page.locator('#course-search-prompt')).toBeHidden();
 const after=await coords();
 for(const key of Object.keys(before))expect(Math.abs(before[key]-after[key]),key).toBeLessThanOrEqual(1);
 await page.locator('input[name="course-mode"][value="GENERAL"]').check();
 const general=await coords();
 for(const key of Object.keys(before))expect(Math.abs(before[key]-general[key]),'general '+key).toBeLessThanOrEqual(1);
});

test('practice와 selectZone은 기존 황갈색 메뉴·청색 사용자 패널을 유지한다',async({page})=>{
 for(const path of ['/html/practice.html','/html/selectZone.html']){
  await page.goto(path);
  const colors=await page.evaluate(()=>({
   nav:getComputedStyle(document.querySelector('.navigation')).backgroundColor,
   user:getComputedStyle(document.querySelector('.userInfo')).backgroundColor,
   button:getComputedStyle(document.querySelector('.navButton button')).backgroundColor
  }));
  expect(colors.nav,path).toBe('rgb(151, 121, 85)');
  expect(colors.user,path).toBe('rgb(0, 45, 86)');
  expect(colors.button,path).toBe('rgb(151, 121, 85)');
  await expect(page.locator('.practiceBadge')).toHaveCount(0);
  await expect(page.locator('.userInfo .practice-warning')).toBeVisible();
  await expect(page.locator('.practice-warning-detail')).toHaveText('실제 수강신청 시스템이 아니에요');
 }
});

test('가상 404 연습 세션의 오류 설명은 적색으로 표시한다',async({page})=>{
 await page.addInitScript(()=>{
  sessionStorage.setItem('hanmo.synthetic404.transition.v3',JSON.stringify({
   version:3,mode:1,phase:'error',errorAt:Date.now()
  }));
 });
 await page.goto('/html/incident-404.html');
 await expect(page.locator('.hanmo-404-area h2')).toHaveText('404');
 const red=await page.evaluate(()=>[...document.querySelector('.hanmo-404-area').children]
  .map(x=>getComputedStyle(x).color));
 expect(red).toEqual(['rgb(185, 28, 48)','rgb(185, 28, 48)','rgb(185, 28, 48)','rgb(185, 28, 48)']);
});

test('통합 학사 화면에서 독립 달력·문의처 링크는 없다',async({page})=>{
  await page.goto('/html/academic-timeline.html');
  await expect(page.getByRole('tab',{name:'학사 공지'})).toBeVisible();
  await expect(page.getByRole('tab',{name:'학사 달력'})).toBeVisible();
  await expect(page.locator('.hanmo-topbar a[href*="academic-support"]')).toHaveCount(0);
})

test('개발자 소개는 세 Contributor의 입학연도를 정확히 표시한다',async({page})=>{
 await page.goto('/html/developer.html');
 const entries=await page.locator('.hanmo-contributor-list li').allInnerTexts();
 expect(entries[1]).toContain("경제학전공 '24");
 expect(entries[2]).toContain("ELLT '23");
 expect(entries[3]).toContain("아랍어과 '23");
});

test('통합 학사 페이지와 강의 검색은 PC 폭에서 가로 넘침이 없다',async({page})=>{
  for(const width of [1440,1980]){
    await page.setViewportSize({width,height:1080});
    for(const path of ['/html/catalog.html','/html/academic-timeline.html']){
      await page.goto(path);
      const w=await page.evaluate(()=>document.documentElement.scrollWidth);
      expect(w,path).toBeLessThanOrEqual(width+1);
    }
  }
})

test('최신 원본 한모의 2칸 예·아니오 선택을 SETTING과 돌발상황에 공통 적용한다',async({page})=>{
 await page.setViewportSize({width:1980,height:1080});
 await page.goto('/html/vsugang.html');
 await page.getByRole('button',{name:'모의신청 설정 열기'}).click();
 await expect(page.locator('.settingSection .segmented')).toHaveCount(2);
 const first=page.locator('.settingSection .segmented').first();
 await expect(first.locator('span')).toHaveText(['예','아니오']);
 await expect(page.locator('input[name="waitingCourseYN"][value="yes"]')).toBeChecked();
 await expect(page.locator('input[name="waitingEntryYN"][value="no"]')).toBeChecked();
 const optionStyle=await first.evaluate(group=>{
   const labels=[...group.querySelectorAll('label')];
   const checked=group.querySelector('input:checked + span');
   return {columns:getComputedStyle(group).gridTemplateColumns.split(' ').length,
     checkedBackground:getComputedStyle(checked).backgroundColor,
     offBackground:getComputedStyle(labels[1].querySelector('span')).backgroundColor,
     widths:labels.map(x=>x.getBoundingClientRect().width)};
 });
 expect(optionStyle.columns).toBe(2);
 expect(optionStyle.checkedBackground).toBe('rgb(28, 45, 64)');
 expect(optionStyle.offBackground).toBe('rgba(0, 0, 0, 0)');
 expect(Math.abs(optionStyle.widths[0]-optionStyle.widths[1])).toBeLessThanOrEqual(1);
 await page.locator('.psugangVal').fill('3');
 await page.locator('.vsugangVal').fill('1');
 await page.locator('input[name="waitingCourseYN"][value="no"]').check();
 await page.locator('input[name="waitingEntryYN"][value="yes"]').check();
 await page.locator('.settingSection .settingButton').click();
 expect(await page.evaluate(()=>({
   course:localStorage.getItem('waitingValue'),
   entry:localStorage.getItem('waitingEntryValue')
 }))).toEqual({course:'no',entry:'yes'});
 await page.getByRole('button',{name:'모의신청 설정 열기'}).click();
 await expect(page.locator('input[name="waitingCourseYN"][value="no"]')).toBeChecked();
 await expect(page.locator('input[name="waitingEntryYN"][value="yes"]')).toBeChecked();
 await page.locator('.settingSection .settingCancel').click();
 await page.locator('#incident-options').click();
 await expect(page.locator('#scenario-settings .segmented')).toHaveCount(2);
 await expect(page.locator('input[name="incident-RECONNECT"][value="no"]')).toBeChecked();
 await expect(page.locator('input[name="incident-CAPACITY"][value="no"]')).toBeChecked();
 const incidentStyle=await page.locator('#scenario-settings .segmented').first()
   .evaluate(group=>getComputedStyle(group.querySelector('input:checked + span')).backgroundColor);
 expect(incidentStyle).toBe(optionStyle.checkedBackground);
 await expect(page.locator('body')).not.toContainText('권장');
 await page.locator('input[name="incident-RECONNECT"][value="yes"]').check();
 await page.locator('input[name="incident-CAPACITY"][value="yes"]').check();
 await page.locator('#scenario-settings button[value="save"]').click();
 await page.locator('#incident-options').click();
 await expect(page.locator('input[name="incident-RECONNECT"][value="yes"]')).toBeChecked();
 await expect(page.locator('input[name="incident-CAPACITY"][value="yes"]')).toBeChecked();
});

test('학사공지·강의검색은 학교 링크 제거 뒤에도 안내·상태의 왼쪽 선을 맞춘다',async({page})=>{
 for(const width of [1440,1980]){
  await page.setViewportSize({width,height:1080});
  for(const route of ['/html/academic-timeline.html','/html/catalog.html']){
   await page.goto(route);
   const info=await page.evaluate(()=>{
    const rect=selector=>document.querySelector(selector).getBoundingClientRect();
    const input=rect('.hanmo-search-controls input');
    const status=rect('#notice-status,#catalog-status');
    const actions=rect('.hanmo-actions');
    return {inputLeft:input.left,statusLeft:status.left,actionsLeft:actions.left};
   });
   expect(Math.abs(info.inputLeft-info.statusLeft),route+' status at '+width).toBeLessThanOrEqual(1);
   expect(Math.abs(info.inputLeft-info.actionsLeft),route+' actions at '+width).toBeLessThanOrEqual(1);
   await expect(page.locator('.hanmo-actions a')).toHaveCount(0);
   await expect(page.locator('.hanmo-actions button')).toBeHidden();
  }
 }
});

test('홈 NOTICE는 원본 한모의 두 문구를 5초마다 세로 순환한다',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('deviceInfo','true'));
  await page.clock.install({time:new Date('2026-11-23T14:00:00+09:00')});
  await page.goto('/index.html');
  await expect(page.locator('main h1')).toHaveText('2026-2학기 한모 비공식 모의수강신청 서비스');
  const list=page.locator('.noticeList');
  const items=list.locator('li');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('한모 업데이트 내용은 여기를 눌러 확인해주세요.');
  await expect(items.nth(1)).toContainText('1년간 4만 명의 학우가 사용한 한모 (2025)');
  await expect(items.nth(0).locator('a')).toHaveAttribute('href','https://everytime.kr/374012/v/415946307');
  expect(await list.evaluate(element=>element.style.bottom)).toBe('0px');
  await page.clock.fastForward(5100);
  expect(await list.evaluate(element=>element.style.bottom)).toBe('77px');
  await page.clock.fastForward(5100);
  expect(await list.evaluate(element=>element.style.bottom)).toBe('0px');
  await list.hover();
  await page.clock.fastForward(5100);
  expect(await list.evaluate(element=>element.style.bottom)).toBe('0px');
  await page.mouse.move(0,0);
  await items.nth(0).locator('a').focus();
  await page.clock.fastForward(5100);
  expect(await list.evaluate(element=>element.style.bottom)).toBe('0px');
  await items.nth(0).locator('a').blur();
  await page.clock.fastForward(5100);
  expect(await list.evaluate(element=>element.style.bottom)).toBe('77px');
  await page.evaluate(()=>{
    Object.defineProperties(document,{
      hidden:{value:true,configurable:true},
      visibilityState:{value:'hidden',configurable:true},
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(15_000);
  expect(await list.evaluate(element=>element.style.bottom)).toBe('77px');
  await page.evaluate(()=>{
    Reflect.deleteProperty(document,'hidden');
    Reflect.deleteProperty(document,'visibilityState');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(5000);
  expect(await list.evaluate(element=>element.style.bottom)).toBe('0px');
});

test('학교 원문은 학사 달력의 링크를 선택할 때만 새 탭에서 열린다',async({page,context})=>{
 const schedule='https://academic.hufs.ac.kr/academic/index.do';
 const visits=[];
 context.on('request',request=>{
   if(request.url()===schedule)visits.push(request.url());
 });
 await context.route(schedule,route=>route.fulfill({
   contentType:'text/plain; charset=utf-8',body:'학사일정 원문 링크 검증',
 }));
 for(const slug of ['academic-timeline','catalog']){
   await page.goto('/html/'+slug+'.html');
   await expect(page.getByRole('link',{name:'학교 홈페이지'})).toHaveCount(0);
 }
 await page.goto('/html/academic-timeline.html');
 await expect(page.getByRole('tab',{name:'학사 공지'})).toBeVisible();
 await page.getByRole('tab',{name:'학사 달력'}).click();
 const link=page.getByRole('link',{name:/학교 학사일정 원문/});
 await expect(link).toHaveAttribute('href',schedule);
 expect(visits).toEqual([]);
 const [popup]=await Promise.all([page.waitForEvent('popup'),link.press('Enter')]);
 await expect(popup).toHaveURL(schedule);
 await expect(popup.locator('body')).toContainText('학사일정 원문 링크 검증');
 expect(visits).toEqual([schedule]);
 expect(await popup.evaluate(()=>window.opener===null)).toBe(true);
});
test('공개 학사 도움말은 현재 제공하는 화면에서 마우스·키보드로 확인된다',async({page})=>{
 await page.goto('/html/catalog.html');
 const info=page.locator('.hanmo-title-help-button');
 const tip=page.locator('.hanmo-title-help-tip');
 await expect(info).toHaveCount(1);
 await info.hover();
 await expect(tip).toBeVisible();
 await page.mouse.move(0,0);
 await info.focus();
 await expect(tip).toBeVisible();
});

test('SETTING과 돌발상황의 배경·테두리·느린 빛이 일치한다',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('deviceInfo','true'));
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/html/vsugang.html');
  const setting=page.locator('.grid > .setting');
  const incident=page.locator('#incident-options');
  const style=locator=>locator.evaluate(element=>{
    const tile=getComputedStyle(element);
    const before=getComputedStyle(element,'::before');
    return {background:tile.backgroundColor,border:tile.borderColor,
      content:before.content,opacity:Number(before.opacity)};
  });
  const first=await style(setting);
  const second=await style(incident);
  expect(first.background).toBe(second.background);
  expect(first.border).toBe(second.border);
  expect(first.content).not.toBe('none');
  expect(second.content).not.toBe('none');
  await incident.hover();
  await page.waitForTimeout(1150);
  expect((await style(incident)).opacity).toBeGreaterThan(0.6);
  await setting.hover();
  await page.waitForTimeout(1150);
  expect((await style(setting)).opacity).toBeGreaterThan(0.6);
});
