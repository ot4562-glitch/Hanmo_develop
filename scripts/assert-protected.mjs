import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
const root=resolve(import.meta.dirname,'..');
const changed=execFileSync('git',['diff','--name-only','--no-renames','origin/main...HEAD'],
 {cwd:root,encoding:'utf8',maxBuffer:4*1024*1024}).trim().split('\n').filter(Boolean);
// #116 사용자가 selectZone.html·selectZone.js·practice.css의 제한된 확장을 승인했다.
// practice.html·practice.js와 기존 모의신청 진입 CSS는 계속 원본 보호 대상으로 둔다.
const protectedFiles=new Set(['js/practice.js','css/vsugang.css']);
const offenders=changed.filter(path=>protectedFiles.has(path));
if(offenders.length)throw Error('Protected HUFS imitation changed:\n'+offenders.join('\n'));

/* 직접 승인된 favicon 교체만 허용하며 원본 연습 화면의 나머지 내용은 보호합니다. */
if(changed.includes('html/practice.html')){
  const original=execFileSync('git',['show','origin/main:html/practice.html'],
    {cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
  const next=original.replace(
    '<link href="../img/hanmo_color.png" rel="shortcut icon" type="image/x-icon">',
    '<link rel="icon" type="image/svg+xml" sizes="any" href="../img/favicon-purple.svg">'
  );
  const actual=readFileSync(resolve(root,'html/practice.html'),'utf8');
  if(next===original||actual!==next)
    throw Error('원본 practice.html은 승인된 favicon 변경 외 수정할 수 없습니다.');
}

// 원본의 비공식 브랜딩 정리 대상 자산만 동기화하도록 허용합니다.
const allowed=p=>p.startsWith('degree-rescue/')||p.startsWith('js/academic/')||(p.startsWith('js/scenario-')||['js/capacity-settings.js','js/academic-calendar.js','js/academic-faq.js','js/academic-support.js','js/selectZone.js','js/student-preferences.js','js/student-profile-bar.js','js/incident-options.js','js/incident-404.js','js/hanmoSys.js','js/index.js','js/home-fit.js','js/result.js','js/vsugang-fit.js','js/academic-data-source.js','js/student-notices.js','js/student-catalog.js','js/student-progress.js','js/vsugang.js'].includes(p))
 ||p.startsWith('docs/')||p.startsWith('scripts/')||p.startsWith('data/')
 ||p.startsWith('tests/')||p.startsWith('e2e/')||p.startsWith('css/')||p.startsWith('html/')
 ||['img/background.svg','img/hanmo_color.png','img/watermark.png','img/favicon.svg','img/hanmo_purple.png','img/favicon-purple.svg'].includes(p)
 ||p.startsWith('img/lucide/')
 ||p.startsWith('.github/workflows/')||['index.html','package.json','jsconfig.json','tsconfig.json',
 '.gitignore','README.md','AGENTS.md','agent.md','sitemap.xml',
 'package-lock.json','playwright.config.mjs'].includes(p);
const unexpected=changed.filter(p=>!allowed(p));
if(unexpected.length)throw Error('Unexpected files:\n'+unexpected.join('\n'));
console.log('Original HUFS registration imitation preserved; '+changed.length+' scoped changes.');
