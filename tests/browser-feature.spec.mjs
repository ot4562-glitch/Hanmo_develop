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
  await expect(page.locator('.course-capacity-label')).toHaveCount(1);
  await expect(page.locator('#subject2 .course-capacity-label')).toBeVisible();
  await expect(page.locator('#subject1 button.register')).toBeVisible();
  await expect(page.locator('.course-capacity-hint')).toBeVisible();
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
  await expect(page.locator('#degree-guidance')).toContainText('확인 필요');

});

test('학사 달력·FAQ·공식 상담 메뉴와 자료 미연결 강의 검색이 안전하게 작동한다',async({page})=>{
  await page.goto('/index.html');
  await page.locator('.hanmo-tools summary').click();
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
  const calendarState=await page.locator('#calendar-view').evaluate(el=>({
    html:el.innerHTML.slice(0,2600),children:el.children.length,
    scripts:[...document.scripts].map(s=>s.src).filter(x=>x.includes('calendar')),
  }));
  console.log('CALENDAR_DEBUG',JSON.stringify({runtimeErrors,failedResources,calendarState}));
  expect(runtimeErrors).toEqual([]);
  expect(failedResources).toEqual([]);
  await expect(page.locator('.fc-toolbar-title')).toBeVisible();
  const days=await page.locator('.fc-daygrid-day[data-date]').count();
  expect(days).toBeGreaterThanOrEqual(28);
  expect(days).toBeLessThanOrEqual(42);
  await expect(page.locator('.fc-event')).toHaveCount(0);
  await page.goto('/html/academic-faq.html');
  await page.locator('#faq-search-query').fill('계절학기');
  await page.locator('#faq-search-form button[type="submit"]').click();
  await expect(page.locator('#faq-topic-list')).toContainText('계절학기');
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
