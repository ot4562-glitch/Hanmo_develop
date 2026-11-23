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

test('내정보 입력·저장은 이 브라우저에만 남고 공지 화면으로 이동할 수 있다',async({page})=>{
  await page.goto('/html/planner.html');
  await page.locator('#planner-campus').selectOption('SEOUL');
  await page.locator('#planner-major').fill('경제학전공');
  await page.locator('#planner-cohort').fill('2024');
  await page.getByRole('button',{name:'이 브라우저에 저장'}).click();
  await expect(page.locator('#planner-message')).not.toBeEmpty();
  await page.getByRole('link',{name:'학사 공지'}).click();
  await expect(page).toHaveURL(/\/html\/academic-timeline\.html$/);
  await expect(page.locator('.hanmo-profile-summary')).toContainText('경제학전공');
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
