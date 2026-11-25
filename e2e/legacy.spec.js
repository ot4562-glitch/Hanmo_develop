// @ts-check
import {test,expect} from '@playwright/test';

const safeDate=new Date('2026-11-19T12:00:00+09:00');

test('SETTING에 흰색 굵은 대기조건 제목이 두 선택칸 위에 표시된다',async({page})=>{
  await page.goto('/html/vsugang.html');
  await page.getByRole('button',{name:'모의신청 설정 열기'}).click();
  const title=page.getByText('대기조건',{exact:true});
  await expect(title).toBeVisible();
  await expect(title).toHaveCSS('color','rgb(255, 255, 255)');
  await expect(title).toHaveCSS('font-weight','700');
  const firstGroup=page.getByRole('group',{name:'강의 신청에 적용할까요?'});
  const titleBox=await title.boundingBox();
  const firstBox=await firstGroup.boundingBox();
  expect(titleBox.y+titleBox.height).toBeLessThanOrEqual(firstBox.y);
});

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

test('TIME은 입장 시각 전에는 막고 이후에는 TIME 결과만 저장한다',async({page,baseURL})=>{
  await page.route(url=>url.origin!==new URL(baseURL).origin,route=>route.abort());
  await page.clock.install({time:safeDate});
  const dialogs=[];
  page.on('dialog',dialog=>{dialogs.push(dialog.message());void dialog.accept();});
  await setPracticeOptions(page);
  await page.getByRole('button',{name:/TIME MODE/}).press('Enter');
  await page.waitForLoadState('load');
  await expect(page.locator('.practiceMode')).toContainText('TIME MODE');
  await page.locator('.sugang').click();
  expect(dialogs).toEqual(['수강신청 기간이 아닙니다.']);
  await expect(page).toHaveURL(/\/html\/practice\.html$/);
  await page.clock.runFor(10_500);
  await page.locator('.sugang').click();
  await expect(page).toHaveURL(/\/html\/result\.html$/);
  await expect(page.locator('.time')).toContainText('SELECT 부분 소요 시간0.000초');
  expect(await page.evaluate(()=>Number(localStorage.getItem('TIMEtime')))).toBeGreaterThan(0);
});

test('SELECT에서 중복 Enter를 차단하고 대기 취소와 삭제 뒤 같은 과목을 다시 신청한다',async({page})=>{
  await page.setViewportSize({width:636,height:314});
  await page.clock.install({time:safeDate});
  await page.addInitScript(()=>{Math.random=()=>0.25;});
  const confirmation=[];
  page.on('dialog',dialog=>{
    if(dialog.type()==='confirm')confirmation.push(dialog.message());
    void dialog.accept();
  });
  await setPracticeOptions(page);
  await page.getByRole('button',{name:'모의신청 설정 열기'}).click();
  await page.locator('.vsugangVal').fill('2');
  await page.locator('input[name="waitingCourseYN"][value="yes"]').check();
  await page.locator('.settingSection .settingButton').click();
  await page.getByRole('button',{name:/SELECT MODE/}).press('Enter');
  await expect(page.locator('.practiceMode')).toContainText('SELECT MODE');
  await page.locator('.sugang').press('Enter');
  await expect(page).toHaveURL(/\/html\/selectZone\.html$/);

  await page.locator('button.search').click();
  await expect(page.locator('.waitingCount')).toHaveText('501');
  await page.clock.runFor(4000);
  const register=page.getByRole('button',{name:'모의수강신청 과목1 신청'});
  await page.keyboard.press('Tab');
  await expect(register).toBeFocused();
  await expect(register).not.toHaveCSS('outline-style','none');
  await page.keyboard.press('Enter');
  await expect(page.locator('.waitingCloseBtn')).toBeVisible();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  expect(confirmation).toHaveLength(1);
  await expect(page.locator('.done tr')).toHaveCount(0);
  await page.locator('.waitingCloseBtn').click();
  await expect(register).toBeFocused();
  await expect(page.locator('.done tr')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(page.locator('.waitingCloseBtn')).toBeVisible();
  expect(confirmation).toEqual(Array(2).fill('모의수강신청 과목1을 수강신청 하시겠습니까?'));
  await page.clock.runFor(4000);
  const registered=page.locator('.done tr');
  await expect(registered).toHaveCount(1);
  await expect(registered.first()).toContainText('모의수강신청 과목1');
  await registered.first().locator('button.delete').click();
  await expect(registered).toHaveCount(0);
  await register.press('Enter');
  await page.clock.runFor(4000);
  await expect(registered).toHaveCount(1);
  await page.getByRole('button',{name:'모의수강신청 과목2 신청'}).press('Enter');
  await page.clock.runFor(4000);
  await expect(page).toHaveURL(/\/html\/result\.html$/);
  await expect(page.locator('.time')).toContainText('TIME 부분 소요 시간0.000초');
  expect(await page.evaluate(()=>Number(localStorage.getItem('SELECTWaitTime')))).toBeGreaterThanOrEqual(14);
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
    localStorage.setItem('SELECTtime','손상된 경과 시간');
    localStorage.setItem('SELECTWaitTime','0');
  });
  await page.clock.install({time:safeDate});
  await page.goto('/html/result.html');
  await expect(page.locator('.time p').first()).toContainText('연습한 과목 수 0개');
  await expect(page.locator('.result p').first()).toContainText('1.250초');
  await expect(page.locator('.time img')).toHaveCount(0);
  await expect(page.locator('.result p span')).toContainText('초');
});

test('연습·신청 화면은 같은 내정보를 표시하고 두 표는 테두리 없이 제한된 크기를 유지한다',async({page,baseURL})=>{
  await page.route(url=>url.origin!==new URL(baseURL).origin,route=>route.abort());
  await page.clock.install({time:safeDate});
  await page.setViewportSize({width:1753,height:832});
  await page.addInitScript(()=>{
    localStorage.setItem('deviceInfo','true');
    localStorage.setItem('practiceSetter','3');
    localStorage.setItem('psubjectValue','15');
    localStorage.setItem('subjectValue','15');
    localStorage.setItem('waitingValue','no');
    localStorage.setItem('waitingEntryValue','no');
    localStorage.setItem('hanmo:student-planner:profile:v1',JSON.stringify({
      campus:'SEOUL',major:'가상전공 A',secondaryKind:'DOUBLE',doubleMajor:'가상전공 B',cohort:2023,
    }));
  });
  await page.goto('/html/practice.html');
  const verifyWarning=async()=>{
    const warning=page.locator('.userInfo .practice-warning');
    await expect(warning).toBeVisible();
    await expect(warning.locator('strong')).toContainText('모의수강신청 중');
    await expect(warning.locator('.practice-warning-detail')).toHaveText('실제 수강신청 시스템이 아니에요');
    await expect(warning).toHaveCSS('background-color','rgb(246, 195, 44)');
    const position=await warning.evaluate(el=>{
      const box=el.getBoundingClientRect();
      const panel=el.closest('.userInfo').getBoundingClientRect();
      const profile=el.previousElementSibling.getBoundingClientRect();
      const info=el.previousElementSibling;
      const user=el.closest('.userInfo');
      const rows=Array.from(info.children).map(row=>row.getBoundingClientRect());
      return {inside:box.bottom<=panel.bottom+1&&box.left>=panel.left&&box.right<=panel.right,
        below:box.top>=profile.bottom-1,
        profileFits:info.scrollHeight<=info.clientHeight+1,
        panelFits:user.scrollHeight<=user.clientHeight+1,
        allRowsVisible:rows.every(r=>r.top>=panel.top&&r.bottom<=box.top+1),
        panelHeight:panel.height,
        overflow:getComputedStyle(info).overflowY};
    });
    expect(position).toEqual({inside:true,below:true,profileFits:true,panelFits:true,allRowsVisible:true,panelHeight:218,overflow:'visible'});
  };
  const practiceInfo=page.locator('.practice-profile');
  await expect(practiceInfo).toBeVisible();
  await verifyWarning();
  await expect(practiceInfo.locator('[data-practice-field="cohort"]')).toHaveText('2023년');
  await expect(practiceInfo.locator('[data-practice-field="campus"]')).toHaveText('서울캠퍼스');
  await expect(practiceInfo.locator('[data-practice-field="major"]')).toHaveText('가상전공 A');
  await expect(practiceInfo.locator('[data-practice-field="secondary"]')).toHaveText('가상전공 B');
  const practiceText=await practiceInfo.innerText();
  const practiceBox=await page.locator('.userInfo').boundingBox();
  await page.goto('/html/selectZone.html');
  const info=page.locator('.practice-profile');
  await expect(info).toBeVisible();
  await expect(info).toHaveText(practiceText,{useInnerText:true});
  await verifyWarning();
  expect(await page.locator('.userInfo').boundingBox()).toEqual(practiceBox);
  await expect(info).toContainText('2023년');
  await expect(info).toContainText('서울캠퍼스');
  await expect(info).toContainText('가상전공 A');
  await expect(info).toContainText('가상전공 B');
  await expect(page.locator('.practice-profile-note')).toContainText('학교 로그인 아님');
  const geometry=()=>page.evaluate(()=>{
    const rect=selector=>{
      const el=document.querySelector(selector);
      const r=el.getBoundingClientRect();
      return {left:r.left,top:r.top,width:r.width,height:r.height,bottom:r.bottom};
    };
    return {main:rect('.selectZone_mainArea'),available:rect('.vsugangTable'),
      done:rect('.vsugangedTable'),footer:rect('body > .hanmo-policy-footer')};
  });
  for(const selector of ['.vsugangTable','.vsugangedTable']){
    const panel=page.locator(selector);
    for(const side of ['top','right','bottom','left']){
      await expect(panel).toHaveCSS('border-'+side+'-width','0px');
    }
  }
  const before=await geometry();
  expect(before.available.width/before.main.width).toBeCloseTo(.953,2);
  expect(before.available.height/832).toBeCloseTo(.46,2);
  expect(Math.abs(before.available.left-before.done.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(before.available.width-before.done.width)).toBeLessThanOrEqual(1);
  expect(before.done.top-before.available.bottom).toBeGreaterThanOrEqual(15);
  expect(before.done.bottom).toBeLessThanOrEqual(before.footer.top+1);
  await page.locator('button.search').click();
  await expect(page.locator('.table')).toBeVisible();
  expect(await geometry()).toEqual(before);
  const scroll=await page.locator('.vsugangTable').evaluate(el=>{
    el.scrollTop=el.scrollHeight;
    return {top:el.scrollTop,height:el.scrollHeight,client:el.clientHeight};
  });
  expect(scroll.height).toBeGreaterThan(scroll.client);
  expect(scroll.top).toBeGreaterThan(0);
  expect(await geometry()).toEqual(before);
  await page.evaluate(()=>{
    localStorage.removeItem('hanmo:student-planner:profile:v1');
    window.dispatchEvent(new Event('hanmo:profile-changed'));
  });
  await expect(info.locator('[data-practice-field="major"]')).toHaveText('미입력');
  await expect(info.locator('[data-practice-field="cohort"]')).toHaveText('미입력');
  // 긴 전공명도 내부 스크롤이나 말줄임으로 감추지 않고 필요한 높이를 확보합니다.
  await page.evaluate(()=>{
    localStorage.setItem('hanmo:student-planner:profile:v1',JSON.stringify({
      campus:'GLOBAL',major:'가상전공'.repeat(20),secondaryKind:'DOUBLE',doubleMajor:'가상부전공'.repeat(20),cohort:2024,
    }));
    window.dispatchEvent(new Event('hanmo:profile-changed'));
  });
  await expect(info.locator('[data-practice-field="cohort"]')).toHaveText('2024년');
  const longProfile=await info.evaluate(el=>{
    const panel=el.closest('.userInfo');
    const warning=panel.querySelector('.practice-warning');
    return {height:panel.getBoundingClientRect().height,overflow:getComputedStyle(el).overflowY,
      profileFits:el.scrollHeight<=el.clientHeight+1,panelFits:panel.scrollHeight<=panel.clientHeight+1,
      below:warning.getBoundingClientRect().top>=el.getBoundingClientRect().bottom-1};
  });
  expect(longProfile.height).toBeGreaterThan(218);
  expect(longProfile).toMatchObject({overflow:'visible',profileFits:true,panelFits:true,below:true});
});
