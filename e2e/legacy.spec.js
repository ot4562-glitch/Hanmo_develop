// @ts-check
import {test,expect} from '@playwright/test';

const safeDate=new Date('2026-11-19T12:00:00+09:00');

/** @param {import('@playwright/test').Page} page */
async function setPracticeOptions(page){
  await page.goto('/html/vsugang.html');
  await page.getByRole('button',{name:'모의신청 설정 열기'}).click();
  await expect(page.locator('.settingSection')).toBeVisible();
  await page.locator('.psugangVal').fill('3');
  await page.locator('.vsugangVal').fill('1');
  await page.locator('input[name="waitingCourseYN"][value="no"]').check();
  await page.locator('.settingSection .settingButton').click();
  await expect(page.locator('.settingSection')).toBeHidden();
}

/** @param {import('@playwright/test').Page} page */
async function useAllowedPracticeHour(page){
  // 원본의 이용 제한 시각만 고정하고 타이머와 performance 탐색 정보는 그대로 둔다.
  await page.addInitScript(()=>{
    const NativeDate=Date;
    window.Date=class extends NativeDate {
      getHours(){return 12;}
      getMinutes(){return 0;}
    };
  });
}

test('모드 타일의 포커스·클릭 영역과 간결한 hover 표시를 유지한다',async({page})=>{
  await page.clock.install({time:safeDate});
  await setPracticeOptions(page);
  const tile=page.locator('.basic-mode-tile');
  await page.mouse.move(0,0);
  await page.keyboard.press('Tab');
  await tile.focus();
  await expect(tile).toBeFocused();
  await expect(tile).toHaveCSS('clip-path',/polygon/);
  await expect(tile).toHaveCSS('background-color','rgb(6, 17, 28)');
  const originalBackground=await tile.evaluate(element=>getComputedStyle(element).backgroundColor);
  const outline=await tile.evaluate(element=>({
    style:getComputedStyle(element).outlineStyle,
    width:parseFloat(getComputedStyle(element).outlineWidth)
  }));
  expect(outline.style).not.toBe('none');
  expect(outline.width).toBeGreaterThanOrEqual(2);
  // 역 ㄱ자 타일의 가운데는 돌발상황 클릭 영역이며, 느린 빛 효과는 유지합니다.
  await tile.hover({position:{x:60,y:60}});
  await expect.poll(()=>tile.evaluate(element=>
    getComputedStyle(element).backgroundColor)).not.toBe(originalBackground);
  await expect.poll(()=>tile.evaluate(element=>
    getComputedStyle(element,'::before').content)).not.toBe('none');
});

test('BASIC에서 가상 과목 신청 후 결과 화면까지 이동한다',async({page})=>{
  await useAllowedPracticeHour(page);
  // 원작의 확인·완료 대화상자를 실제 브라우저에서 수락해야 신청이 진행된다.
  page.on('dialog',dialog=>{void dialog.accept();});
  await setPracticeOptions(page);
  await page.locator('.basic-mode-tile').click({position:{x:60,y:60}});
  await expect(page).toHaveURL(/\/html\/practice\.html$/);
  await page.waitForLoadState('load');
  await expect(page.locator('.practiceMode')).toContainText('BASIC MODE');
  // 원작의 10초 진입 제한은 실제 브라우저 시간으로 통과한다.
  await page.waitForTimeout(10_250);
  await page.locator('.sugang').click();
  await expect(page).toHaveURL(/\/html\/selectZone\.html$/);
  await expect(page.locator('button.register')).toHaveCount(3);
  await page.locator('button.search').click();
  await expect(page.locator('.table')).toBeVisible();
  await page.locator('button.register').first().click();
  await expect(page).toHaveURL(/\/html\/result\.html$/);
  await expect(page.locator('.result p span')).toContainText('초');
});

test('선택한 가상 404는 새로고침으로 복구되고 직접 방문은 복구를 요구하지 않는다',async({page})=>{
  await useAllowedPracticeHour(page);
  await setPracticeOptions(page);
  await page.locator('#incident-options').click();
  await expect(page.locator('#scenario-settings')).toBeVisible();
  await page.locator('[data-scenario-toggle="RECONNECT"]').check();
  await page.locator('#scenario-settings button[value="save"]').click();
  await page.locator('.basic-mode-tile').click({position:{x:60,y:60}});
  await expect(page).toHaveURL(/\/html\/practice\.html$/);
  await page.waitForLoadState('load');
  await expect(page.locator('.practiceMode')).toContainText('BASIC MODE');
  // 새로고침 탐지와 원작 진입 시간은 가상 타이머로 우회하지 않는다.
  await page.waitForTimeout(10_250);
  await page.locator('.sugang').click();
  await expect(page).toHaveURL(/\/html\/incident-404\.html$/);
  await expect(page.getByText('페이지를 표시할 수 없습니다.')).toBeVisible();
  await expect(page.locator('.navigation')).toHaveAttribute('inert','');
  await page.reload();
  await expect(page).toHaveURL(/\/html\/selectZone\.html$/);
  // 실패 상태가 없는 직접 오류 페이지 방문은 원래 신청 화면으로 복귀한다.
  await page.goto('/html/incident-404.html');
  await expect(page).toHaveURL(/\/html\/selectZone\.html$/);
});

test('조작한 과목 수가 결과 화면에서 HTML로 해석되지 않는다',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('deviceInfo','true');
    localStorage.setItem('practiceSetter','1');
    localStorage.setItem('psubjectValue','<img src=x onerror=alert(1)>');
    localStorage.setItem('subjectValue','1');
    localStorage.setItem('TIMEtime','1.25');
    localStorage.setItem('SELECTtime','2');
    localStorage.setItem('SELECTWaitTime','0');
  });
  await page.clock.install({time:safeDate});
  await page.goto('/html/result.html');
  await expect(page.locator('.time p').first()).toContainText('연습한 과목 수 0개');
  await expect(page.locator('.time img')).toHaveCount(0);
  await expect(page.locator('.result p span')).toContainText('초');
});
