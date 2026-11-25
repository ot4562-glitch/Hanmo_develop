// @ts-check
import {test,expect} from '@playwright/test';

test('데스크톱에서 학생 페이지 이동과 키보드 본문 건너뛰기가 동작한다',async({page})=>{
  await page.setViewportSize({width:1280,height:720});
  await page.goto('/index.html');
  await expect(page.locator('.hanmo-topbar')).toBeVisible();
  await page.getByRole('link',{name:'내정보'}).click();
  await expect(page).toHaveURL(/\/html\/planner\.html$/);
  await page.keyboard.press('Tab');
  await expect(page.locator('a.hanmo-skip')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  await expect(page.locator('#planner-profile')).toBeVisible();
});

const profileKey='hanmo:student-planner:profile:v1';

test('구형 내정보를 복원하고 저장·삭제를 다른 탭에 반영하며 모의신청 설정을 보존한다',async({page,context,baseURL})=>{
  const legacyProfile={campus:'SEOUL',major:'QA-LEGACY-MAJOR',doubleMajor:'QA-LEGACY-DOUBLE',cohort:2024};
  const legacyPractice={psubjectValue:'3',subjectValue:'2',waitingValue:'yes',waitingEntryValue:'no'};
  const origin=new URL(baseURL).origin;
  const unexpected=[];
  await context.route('**/*',route=>{
    const request=route.request();
    const url=new URL(request.url());
    if(url.origin===origin&&['GET','HEAD'].includes(request.method())&&
      ![...url.searchParams.values()].some(value=>value.includes('QA-'))&&
      !url.pathname.includes('QA-'))return route.continue();
    unexpected.push({method:request.method(),origin:url.origin,path:url.pathname});
    return route.abort();
  });
  await page.goto('/html/planner.html');
  await page.evaluate(({key,profile,practice})=>{
    localStorage.setItem(key,JSON.stringify(profile));
    for(const [name,value] of Object.entries(practice))localStorage.setItem(name,value);
  },{key:profileKey,profile:legacyProfile,practice:legacyPractice});
  await page.reload();
  await expect(page.locator('#planner-major')).toHaveValue(legacyProfile.major);
  await expect(page.locator('#planner-secondary-kind')).toHaveValue('DOUBLE');
  await expect(page.locator('#planner-double')).toHaveValue(legacyProfile.doubleMajor);
  await expect(page.locator('#planner-cohort')).toHaveValue('2024');

  const observer=await context.newPage();
  await observer.goto('/html/academic-timeline.html');
  const summary=observer.locator('[data-profile-summary]');
  await expect(summary).toContainText(legacyProfile.doubleMajor);
  await page.locator('#planner-major').fill('QA-UPDATED-MAJOR');
  await page.getByRole('button',{name:'이 브라우저에 저장'}).click();
  await expect(page.locator('#planner-message')).toContainText('이 브라우저에 저장했습니다');
  await expect(summary).toContainText('QA-UPDATED-MAJOR');
  await page.reload();
  await expect(page.locator('#planner-major')).toHaveValue('QA-UPDATED-MAJOR');
  await page.getByRole('button',{name:'저장한 정보 지우기'}).click();
  await expect(summary).toHaveText('내정보 미설정');
  await page.reload();
  await expect(page.locator('#planner-major')).toHaveValue('');
  expect(await page.evaluate(key=>localStorage.getItem(key),profileKey)).toBeNull();
  expect(await page.evaluate(keys=>Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)])),
    Object.keys(legacyPractice))).toEqual(legacyPractice);
  await page.getByRole('link',{name:'학사 정보'}).click();
  await expect(page).toHaveURL(/\/html\/academic-timeline\.html$/);
  expect(unexpected).toEqual([]);
});

test('손상된 내정보는 표시하지 않고 직접 입력한 정보로 복구할 수 있다',async({page})=>{
  await page.goto('/html/planner.html');
  await page.evaluate(key=>localStorage.setItem(key,'{손상된 합성 프로필'),profileKey);
  await page.reload();
  await expect(page.locator('#planner-message')).toContainText('저장된 정보를 읽지 못했습니다');
  await expect(page.locator('[data-profile-summary]')).toHaveText('내정보 미설정');
  await expect(page.locator('#planner-major')).toHaveValue('');
  await page.locator('#planner-campus').selectOption('GLOBAL');
  await page.locator('#planner-major').fill('복구 검증용 합성 전공');
  await page.locator('#planner-cohort').fill('2024');
  await page.getByRole('button',{name:'이 브라우저에 저장'}).click();
  await page.reload();
  await expect(page.locator('#planner-major')).toHaveValue('복구 검증용 합성 전공');
  await expect(page.locator('[data-profile-summary]')).toContainText('복구 검증용 합성 전공');
});

test('브라우저가 내정보 저장을 거부하면 실패를 알리고 작성 중인 입력을 보존한다',async({page})=>{
  await page.goto('/html/planner.html');
  await page.evaluate(key=>{
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(name,value){
      if(name===key)throw new DOMException('합성 저장소 차단','QuotaExceededError');
      return original.call(this,name,value);
    };
  },profileKey);
  await page.locator('#planner-campus').selectOption('SEOUL');
  await page.locator('#planner-major').fill('저장 실패 검증용 합성 전공');
  await page.locator('#planner-cohort').fill('2024');
  await page.getByRole('button',{name:'이 브라우저에 저장'}).click();
  await expect(page.locator('#planner-message')).toContainText('이 브라우저에 저장할 수 없습니다');
  await expect(page.locator('#planner-major')).toHaveValue('저장 실패 검증용 합성 전공');
  await expect(page.locator('[data-profile-summary]')).toHaveText('내정보 미설정');
  expect(await page.evaluate(key=>localStorage.getItem(key),profileKey)).toBeNull();
});

test('학사자료 OFF에서 공지·달력과 강의 검색은 외부 자료를 요청하지 않는다',async({page,baseURL})=>{
  const offOrigin=[];
  const origin=new URL(baseURL).origin;
  await page.route('**/*',route=>{
    const url=route.request().url();
    if(new URL(url).origin===origin)return route.continue();
    offOrigin.push(url);
    return route.abort();
  });
  await page.goto('/html/academic-timeline.html');
  await expect(page.locator('#notice-status')).toContainText('공지 자료 연결 전');
  await expect(page.locator('#notice-query')).toBeDisabled();
  await page.getByRole('tab',{name:'학사 달력'}).click();
  await expect(page.getByRole('link',{name:/학교 학사일정 원문/})).toHaveAttribute('href',/^https:\/\/academic\.hufs\.ac\.kr\//);
  await page.goto('/html/forecast.html');
  await expect(page).toHaveURL(/\/html\/catalog\.html$/);
  await expect(page.locator('#catalog-status')).toContainText('강의 자료 연결 전');
  await expect(page.locator('#catalog-query')).toBeDisabled();
  expect(offOrigin).toEqual([]);
});

test('작은 PC 창에서도 기기 판별 때문에 모바일 안내로 이동하지 않는다',async({page})=>{
  await page.setViewportSize({width:640,height:360});
  await page.goto('/html/planner.html');
  await expect(page).toHaveURL(/\/html\/planner\.html$/);
  await expect(page.locator('#planner-profile')).toBeVisible();
});

test('모바일 사용자 환경은 별도의 PC 안내로 이동한다',async({browser})=>{
  const context=await browser.newContext({
    viewport:{width:390,height:844},
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  });
  try{
    const page=await context.newPage();
    await page.goto('/index.html');
    await expect(page).toHaveURL(/\/html\/pc-only\.html$/);
    await expect(page.getByRole('heading',{name:'PC에서 이용해 주세요'})).toBeVisible();
  }finally{await context.close();}
});

test('입력한 내정보는 상단 바에서 입학년도까지 잘림 없이 표시된다',async({page,baseURL})=>{
  const origin=new URL(baseURL).origin;
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.setViewportSize({width:1280,height:720});
  await page.goto('/html/planner.html');
  await page.locator('#planner-campus').selectOption('SEOUL');
  const major='가상 국제경제 및 데이터분석 전공';
  const second='가상 통계 및 컴퓨터공학 전공';
  await page.locator('#planner-major').fill(major);
  await page.locator('#planner-secondary-kind').selectOption('DOUBLE');
  await page.locator('#planner-double').fill(second);
  await page.locator('#planner-cohort').fill('2024');
  await page.getByRole('button',{name:'이 브라우저에 저장'}).click();
  const expected='서울캠퍼스 · '+major+' · 이중전공 '+second+' · 2024학번';
  const verify=async()=>{
    const summary=page.locator('[data-profile-summary]');
    await expect(summary).toBeVisible();
    await expect(summary).toHaveText(expected);
    await expect(summary).toHaveCSS('text-overflow','clip');
    await expect(summary).toHaveCSS('white-space','normal');
    const layout=await summary.evaluate(el=>{
      const rect=el.getBoundingClientRect();
      const bar=el.closest('.hanmo-topbar');
      const links=Array.from(bar.querySelectorAll('a')).map(link=>link.getBoundingClientRect());
      const range=document.createRange();
      range.selectNodeContents(el);
      const lines=Array.from(range.getClientRects());
      return {
        width:el.clientWidth,scrollWidth:el.scrollWidth,height:el.clientHeight,scrollHeight:el.scrollHeight,
        visible:lines.length>0&&lines.every(r=>r.left>=rect.left-1&&r.right<=rect.right+1&&r.top>=rect.top-1&&r.bottom<=rect.bottom+1),
        linksFit:links.every(r=>r.left>=-1&&r.right<=window.innerWidth+1),
        noOverlap:links.every(r=>r.right<=rect.left+1||r.left>=rect.right-1||r.bottom<=rect.top+1||r.top>=rect.bottom-1),
      };
    });
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width+1);
    expect(layout.scrollHeight).toBeLessThanOrEqual(layout.height+1);
    expect(layout.visible).toBe(true);
    expect(layout.linksFit).toBe(true);
    expect(layout.noOverlap).toBe(true);
  };
  await verify();
  for(const viewport of [{width:1920,height:1080},{width:1280,height:720},{width:1024,height:768},{width:700,height:768}]){
    await page.setViewportSize(viewport);
    for(const path of ['/index.html','/html/readiness.html','/html/vsugang.html']){
      await page.goto(path);
      await verify();
    }
  }
});

test.describe('홈 교내 서비스 배너',()=>{
  test.use({timezoneId:'Asia/Seoul'});
  test('원본 훕또기 배너는 상단 바 가까이에 배치되고 종료일 다음 날 사라진다',async({page,baseURL})=>{
    const origin=new URL(baseURL).origin;
    await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await page.clock.setFixedTime(new Date('2026-12-31T23:59:59+09:00'));
    await page.setViewportSize({width:1280,height:720});
    await page.goto('/index.html');
    const banner=page.locator('.home-banners .subNotice');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('href','https://chat.hufs.ac.kr/');
    await expect(banner).toHaveAttribute('rel','noopener noreferrer');
    await expect(banner).toContainText('훕또기');
    await expect(banner).toContainText('학교 생활에 대해 물어보세요');
    await expect(banner.locator('img')).toHaveAttribute('src','./img/boo.png');
    await expect.poll(()=>banner.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    for(const viewport of [{width:1280,height:720},{width:1920,height:1080}]){
      await page.setViewportSize(viewport);
      const bar=await page.locator('.hanmo-topbar').boundingBox();
      const box=await banner.boundingBox();
      const title=await page.locator('.titleContainer').boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(bar.y+bar.height);
      expect(box.y+box.height).toBeLessThan(title.y);
      const titleGap=title.y-(box.y+box.height);
      expect(box.y-(bar.y+bar.height)).toBeLessThan(titleGap);
      expect(titleGap).toBeCloseTo(36,0);
      expect(box.width).toBeCloseTo(702,0);
      await expect(page.locator('.buttonContainer')).toBeInViewport({ratio:1});
    }
    await page.clock.setFixedTime(new Date('2027-01-01T00:00:00+09:00'));
    await page.reload();
    await expect(page.locator('.home-banners')).toBeHidden();
    await expect(banner).toBeHidden();
    await expect(page.locator('.titleContainer')).toBeVisible();
  });
});
