import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
const root=resolve(import.meta.dirname,'..');
const changed=execFileSync('git',['diff','--name-only','--no-renames','origin/main...HEAD'],
 {cwd:root,encoding:'utf8',maxBuffer:4*1024*1024}).trim().split('\n').filter(Boolean);
// #116 사용자가 selectZone.html·selectZone.js·practice.css의 제한된 확장을 승인했다.
// practice.js와 기존 모의신청 진입 CSS를 보호하며 practice.html은 아래의 정확한 승인 변경만 허용한다.
const protectedFiles=new Set(['js/practice.js','css/vsugang.css']);
const offenders=changed.filter(path=>protectedFiles.has(path));
if(offenders.length)throw Error('Protected HUFS imitation changed:\n'+offenders.join('\n'));

/* 사용자 승인 범위는 파비콘 교체, 내정보 추가, 파란 정보 영역의 모의신청 경고 표지뿐입니다. */
if(changed.includes('html/practice.html')){
  const original=execFileSync('git',['show','origin/main:html/practice.html'],
    {cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
  const withFavicon=original.replace(
    '<link href="../img/hanmo_color.png" rel="shortcut icon" type="image/x-icon">',
    '<link rel="icon" type="image/svg+xml" sizes="any" href="../img/favicon-purple.svg">'
  );
  const variants=new Set([original,withFavicon]);
  // 원본의 타이머·버튼·연습 로직을 수정하지 않고 두 승인된 삽입 위치만 허용합니다.
  for(const source of [original,withFavicon]){
    if(source.includes('class="practice-profile"')||source.includes('../js/student-profile-bar.js'))continue;
    const anchor="<p class='practiceMode'></p>";
    const script="<script src=\"../js/gnb.js\"></script>";
    if(!source.includes(anchor)||!source.includes(script))continue;
    variants.add(source.replace(anchor,"<p class='practiceMode'></p>\n                    <p class=\"practice-profile-note\">내정보 · 학교 로그인 아님</p>\n                    <dl class=\"practice-profile\" aria-label=\"직접 입력한 연습용 내정보\">\n                      <div><dt>입학년도</dt><dd data-practice-field=\"cohort\">미입력</dd></div>\n                      <div><dt>캠퍼스</dt><dd data-practice-field=\"campus\">미입력</dd></div>\n                      <div><dt>전공</dt><dd data-practice-field=\"major\">미입력</dd></div>\n                      <div><dt data-practice-field=\"secondaryLabel\">이중전공/부전공</dt><dd data-practice-field=\"secondary\">미입력</dd></div>\n                    </dl>")
      .replace(script,"<script src=\"../js/student-profile-bar.js\"></script>\n\t\t<script src=\"../js/gnb.js\"></script>"));
  }
  // 내정보 영역 바로 아래의 승인된 경고 표지 삽입만 추가로 허용합니다.
  const warningAnchor="                    </dl>\n                </div>\n                <div class=\"navButton\">";
  const warningBlock="                    </dl>\n                    <div class=\"practice-warning\">\n                      <strong><span aria-hidden=\"true\">⚠︎</span> 모의수강신청 중</strong>\n                      <span class=\"practice-warning-detail\">실제 수강신청 시스템이 아니에요</span>\n                    </div>\n                </div>\n                <div class=\"navButton\">";
  for(const source of [...variants]){
    if(source.includes('class="practice-profile"')&&!source.includes('class="practice-warning"')&&source.includes(warningAnchor))
      variants.add(source.replace(warningAnchor,warningBlock));
  }
  const actual=readFileSync(resolve(root,'html/practice.html'),'utf8');
  if(!variants.has(actual))
    throw Error('원본 practice.html은 승인된 파비콘·좌측 내정보·모의신청 경고 표지 외 수정할 수 없습니다.');
}

// 원본의 비공식 브랜딩 정리 대상 자산만 동기화하도록 허용합니다.
const labScripts=new Set([
  'js/readiness.mjs','js/reaction-page.mjs','js/reaction-profile.mjs',
  'js/strategy-engine.mjs','js/strategy-page.mjs','js/strategy-worker.mjs','js/lab-share.mjs',
]);
const allowed=p=>labScripts.has(p)||p.startsWith('degree-rescue/')||p.startsWith('js/academic/')||(p.startsWith('js/scenario-')||['js/capacity-settings.js','js/academic-calendar.js','js/academic-faq.js','js/academic-support.js','js/selectZone.js','js/student-preferences.js','js/student-profile-bar.js','js/incident-options.js','js/incident-404.js','js/hanmoSys.js','js/index.js','js/home-fit.js','js/result.js','js/vsugang-fit.js','js/academic-data-source.js','js/student-notices.js','js/student-catalog.js','js/student-progress.js','js/vsugang.js'].includes(p))
 ||p.startsWith('docs/')||p.startsWith('scripts/')||p.startsWith('data/')
 ||p.startsWith('tests/')||p.startsWith('e2e/')||p.startsWith('css/')||p.startsWith('html/')
 ||['img/background.svg','img/hanmo_color.png','img/watermark.png','img/favicon.svg','img/hanmo_purple.png','img/favicon-purple.svg','img/boo.png'].includes(p)
 ||p.startsWith('img/lucide/')
 ||p.startsWith('.github/workflows/')||['index.html','package.json','jsconfig.json','tsconfig.json',
 '.gitignore','README.md','AGENTS.md','agent.md','sitemap.xml',
 'package-lock.json','playwright.config.mjs'].includes(p);
const unexpected=changed.filter(p=>!allowed(p));
if(unexpected.length)throw Error('Unexpected files:\n'+unexpected.join('\n'));
console.log('Original HUFS registration imitation preserved; '+changed.length+' scoped changes.');
