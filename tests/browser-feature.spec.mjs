// @ts-check
import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

test.beforeEach(async({page})=>{
  await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:4174/')
    ?route.continue():route.abort());
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

test('내정보로 졸업 준비를 구성하고 학점 및 여름 계절학기 기록을 저장한다',async({page})=>{
  await page.goto('/html/planner.html');
  await page.locator('#planner-campus').selectOption('SEOUL');
  await page.locator('#planner-major').fill('경제학전공');
  await page.locator('#planner-secondary-kind').selectOption('DOUBLE');
  await page.locator('#planner-double').fill('영어학전공');
  await page.locator('#planner-cohort').fill('2024');
  await page.locator('#planner-profile button[type="submit"]').click();
  await expect(page.locator('#planner-message')).toContainText('저장');
  await page.goto('/html/academic-progress.html');
  await expect(page.locator('#degree-context-summary'))
    .toHaveText(/2024학번 · 서울캠퍼스 · 이중전공 · 경제학전공 · 영어학전공/);
  await expect(page.locator('#degree-advanced')).toHaveCount(0);
  await expect(page.locator('#record-form')).toHaveCount(0);
  await page.locator('#degree-earned-general').fill('28');
  await page.locator('#degree-target-general').fill('34');
  await page.locator('#degree-earned-total').fill('80');
  await page.locator('#degree-target-total').fill('134');
  await page.locator('#degree-credit-form button[type="submit"]').click();
  await expect(page.locator('#degree-results')).toContainText('6학점 남음');
  await expect(page.locator('#degree-results')).toContainText('54학점 남음');
  await page.reload();
  await expect(page.locator('#degree-earned-general')).toHaveValue('28');
  await page.locator('[data-degree-tab="requirements"]').click();
  await expect(page.locator('#degree-guidance')).not.toContainText('확인 필요');
  await expect(page.locator('#degree-guidance')).toContainText('졸업시험');

});

test('졸업 준비·학사 달력·FAQ가 표준 데스크톱 모니터에 스크롤 없이 보인다',async({page})=>{
  mkdirSync('e2e-artifacts',{recursive:true});
  for(const viewport of [{width:1920,height:1080}]){
    await page.setViewportSize(viewport);
    for(const slug of ['academic-progress','academic-calendar','academic-faq']){
      await page.goto('/html/'+slug+'.html');
      if(slug==='academic-progress'){
        await expect(page.locator('.degree-credit-results')).toBeVisible();
        await expect(page.getByRole('link',{name:'학교 공식 안내'})).toHaveCount(0);
        await page.locator('#degree-earned-general').fill('28');
        await page.locator('#degree-target-general').fill('34');
        await page.locator('#degree-earned-total').fill('80');
        await page.locator('#degree-target-total').fill('134');
      }else if(slug==='academic-calendar'){
        await expect(page.locator('#calendar-view [role="table"]')).toBeVisible();
      }else{
        await expect(page.locator('#faq-topic-list .hanmo-item')).toHaveCount(4);
        await expect(page.locator('#faq-search-form button')).toHaveCount(0);
      }
      const bounds=await page.evaluate(()=>{
        const html=document.documentElement;
        const main=document.getElementById('main');
        return {height:window.innerHeight,scrollHeight:html.scrollHeight,
          width:window.innerWidth,scrollWidth:html.scrollWidth,
          bottom:main?.getBoundingClientRect().bottom??0};
      });
      expect(bounds.scrollHeight,'전체 높이 '+slug+' '+viewport.height).toBeLessThanOrEqual(bounds.height+1);
      expect(bounds.scrollWidth,'전체 너비 '+slug+' '+viewport.width).toBeLessThanOrEqual(bounds.width+1);
      expect(bounds.bottom,'본문 끝 '+slug+' '+viewport.height).toBeLessThanOrEqual(bounds.height+1);
      await page.screenshot({path:'e2e-artifacts/fit-'+slug+'-'+viewport.height+'.png',fullPage:false});
    }
  }
});

test('1920x1080 학업 페이지 제목의 ㅎㅁ 문양과 양쪽 선은 학사 공지 위치를 따른다',async({page})=>{
  await page.setViewportSize({width:1920,height:1080});
  const paths=['academic-timeline','academic-calendar','academic-faq','academic-progress',
    'academic-support','catalog','planner'];
  let reference=null;
  mkdirSync('e2e-artifacts',{recursive:true});
  for(const slug of paths){
    await page.goto('/html/'+slug+'.html');
    const positions=await page.evaluate(()=>{
      const rect=element=>{
        const r=element.getBoundingClientRect();
        return {left:r.left,top:r.top,width:r.width,height:r.height};
      };
      const schoolmark=document.querySelector('.hanmo-schoolmark');
      if(!schoolmark)return null;
      const heading=schoolmark.querySelector('h1,h2');
      const mark=schoolmark.querySelector('.hanmo-markline');
      const logo=mark?.querySelector('img');
      const line=mark?.querySelector('span');
      const bar=document.querySelector('.hanmo-topbar');
      if(!heading||!mark||!logo||!line||!bar)return null;
      return {heading:rect(heading),mark:rect(mark),logo:rect(logo),
        line:rect(line),bar:rect(bar)};
    });
    expect(positions,'제목·로고·구분선 누락: '+slug).not.toBeNull();
    if(reference){
      const center=rect=>rect.left+rect.width/2;
      expect(Math.abs(center(positions.heading)-center(reference.heading)),
        slug+' 제목 중심').toBeLessThanOrEqual(1);
      for(const axis of ['top','height']){
        expect(Math.abs(positions.heading[axis]-reference.heading[axis]),
          slug+' 제목 '+axis).toBeLessThanOrEqual(1);
      }
      for(const element of ['mark','logo','line','bar']){
        for(const axis of ['left','top','width','height']){
          expect(Math.abs(positions[element][axis]-reference[element][axis]),
            slug+' '+element+'.'+axis).toBeLessThanOrEqual(1);
        }
      }
    }else reference=positions;
  }
});

test('1920x1080 달력은 날짜행이 접히지 않고 모든 날짜가 보인다',async({page})=>{
  await page.setViewportSize({width:1920,height:1080});
  await page.goto('/html/academic-calendar.html');
  const rows=page.locator('#calendar-view [role="row"][aria-label^="주 "]');
  const count=await rows.count();
  expect(count).toBeGreaterThanOrEqual(4);
  expect(count).toBeLessThanOrEqual(6);
  for(let index=0;index<count;index++){
    const row=rows.nth(index);
    await expect(row).toBeVisible();
    const rect=await row.boundingBox();
    expect(rect,'달력 주차 행이 접히면 안 됨').not.toBeNull();
    expect(rect.height).toBeGreaterThan(55);
    expect(rect.y+rect.height).toBeLessThanOrEqual(1079);
  }
  await expect(page.locator('#calendar-view [role="cell"][data-date]').first()).toBeVisible();
  const scrollHeight=await page.evaluate(()=>document.documentElement.scrollHeight);
  expect(scrollHeight).toBeLessThanOrEqual(1081);
  await expect(page.locator('#calendar-status')).toHaveCount(0);
  await page.screenshot({path:'e2e-artifacts/calendar-restored-1920x1080.png',fullPage:false});
});

test('공식 상담 부서명이 원문 링크이고 상태 설명 문구는 표시하지 않는다',async({page})=>{
  await page.goto('/html/academic-support.html');
  const headingLink=page.locator('#support-results h3 a');
  await expect(headingLink).toHaveText('서울 학사종합지원센터');
  await expect(headingLink).toHaveAttribute('href','https://haksa.hufs.ac.kr/haksa/index.do');
  await expect(page.locator('#support-results a[href^="tel:"]')).toHaveText('02-2173-2130');
  await expect(page.locator('#support-status')).toHaveCount(0);
  await expect(page.locator('#support-results')).not.toContainText('원문 재확인');
  await page.locator('#support-campus').selectOption('GLOBAL');
  await page.locator('#support-topic').selectOption('SEASONAL');
  await expect(headingLink).toHaveText('글로벌 학사종합지원센터 · 계절학기');
  await expect(page.locator('#support-results a[href^="tel:"]')).toHaveText('031-330-4086');
  await page.goto('/html/academic-faq.html');
  await expect(page.locator('#faq-status')).toHaveCount(0);
  await expect(page.locator('#faq-topic-list .hanmo-item')).toHaveCount(4);
  await page.goto('/html/academic-progress.html');
  await expect(page.locator('body')).not.toContainText('자가 입력 · 공식 판정 아님');
});

test('1920×1080에서 학점 진행 막대는 취득·남은 학점 옆에 수평 정렬된다',async({page})=>{
  await page.setViewportSize({width:1920,height:1080});
  await page.goto('/html/academic-progress.html');
  await page.locator('#degree-earned-general').fill('28');
  await page.locator('#degree-target-general').fill('34');
  await page.locator('#degree-earned-total').fill('80');
  await page.locator('#degree-target-total').fill('134');
  const geometry=await page.evaluate(()=>{
    const rect=el=>{const r=el.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height};};
    return {
      input:rect(document.getElementById('degree-credit-form')),
      results:rect(document.querySelector('.degree-credit-results')),
      rows:[...document.querySelectorAll('.degree-credit-row')].map(row=>({
        name:rect(row.querySelector('.degree-credit-name')),
        value:rect(row.querySelector('.degree-credit-values')),
        track:rect(row.querySelector('.hanmo-progress-track')),
      })),
    };
  });
  expect(Math.abs(geometry.input.y-geometry.results.y)).toBeLessThanOrEqual(3);
  expect(geometry.rows).toHaveLength(5);
  for(const row of geometry.rows){
    const midpoint=rect=>rect.y+rect.h/2;
    expect(Math.abs(midpoint(row.name)-midpoint(row.track))).toBeLessThan(5);
    expect(Math.abs(midpoint(row.value)-midpoint(row.track))).toBeLessThan(5);
    expect(row.track.x).toBeGreaterThan(row.value.x+row.value.w);
    expect(row.track.w).toBeGreaterThan(60);
  }
  await expect(page.locator('#degree-results')).toContainText('6학점 남음');
  await page.screenshot({path:'e2e-artifacts/degree-horizontal-bars-1920.png',fullPage:false});
});

test('상단 바의 세 학업 도구가 1920×1080에서 바로 보이는 독립 링크다',async({page})=>{
  await page.setViewportSize({width:1920,height:1080});
  const paths=['/index.html','/html/academic-timeline.html','/html/catalog.html',
    '/html/academic-progress.html','/html/academic-calendar.html','/html/academic-faq.html',
    '/html/academic-support.html','/html/planner.html','/html/forecast.html',
    '/html/vsugang.html','/html/developer.html','/html/result.html'];
  const links=[
    {name:'학사 달력',end:'/academic-calendar.html'},
    {name:'학사 FAQ',end:'/academic-faq.html'},
    {name:'공식 상담',end:'/academic-support.html'}
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

test('학사 달력·FAQ·공식 상담 메뉴와 자료 미연결 강의 검색이 안전하게 작동한다',async({page})=>{
  await page.goto('/index.html');
  await expect(page.locator('.hanmo-tools')).toHaveCount(0);
  await expect(page.getByRole('link',{name:'학사 달력'})).toBeVisible();
  const runtimeErrors=[];
  const failedResources=[];
  page.on('pageerror',error=>runtimeErrors.push(error.message));
  page.on('response',response=>{
    if(response.status()>=400)failedResources.push(response.status()+' '+response.url());
  });
  await page.getByRole('link',{name:'학사 달력'}).click();
  await expect(page).toHaveURL(/academic-calendar\.html$/);
  await page.waitForTimeout(450);

  expect(runtimeErrors).toEqual([]);
  expect(failedResources).toEqual([]);
  await expect(page.locator('#calendar-view [role="heading"][aria-level="2"]')).toBeVisible();
  const days=await page.locator('#calendar-view [role="cell"][data-date]').count();
  expect(days).toBeGreaterThanOrEqual(28);
  expect(days).toBeLessThanOrEqual(42);
  await expect(page.locator('#calendar-status')).toHaveCount(0);
  await page.screenshot({path:'e2e-artifacts/academic-calendar-month.png',fullPage:false});
  await page.goto('/html/academic-faq.html');
  await page.locator('#faq-search-query').fill('계절학기');
  await expect(page.locator('#faq-topic-list')).not.toContainText('확인 필요');
  await expect(page.locator('#faq-search-form button[type="submit"]')).toHaveCount(0);
  await expect(page.locator('#faq-topic-list .hanmo-item')).toHaveCount(1);
  await expect(page.locator('#faq-topic-list')).toContainText('계절학기');
  await page.locator('#faq-search-query').fill('없는 질문 123');
  await expect(page.locator('#faq-topic-list')).toContainText('결과 없음');
  await page.locator('#faq-search-query').clear();
  await expect(page.locator('#faq-topic-list .hanmo-item')).toHaveCount(4);
  await page.goto('/html/academic-support.html');
  await page.locator('#support-campus').selectOption('GLOBAL');
  await page.locator('#support-topic').selectOption('SEASONAL');
  await expect(page.locator('#support-results')).toContainText('031-330-4086');
  await page.goto('/html/catalog.html');
  await expect(page.locator('#catalog-campus')).toBeDisabled();
  await expect(page.locator('#catalog-target-term')).toBeDisabled();
  await page.goto('/html/forecast.html');
  await expect(page).toHaveURL(/\/html\/catalog\.html$/);
});
