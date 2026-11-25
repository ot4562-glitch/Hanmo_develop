import {copyFile,cp,lstat,mkdir,readFile,rm,stat,readdir,writeFile} from 'node:fs/promises';
import {extname,resolve,join,relative} from 'node:path';
import {assertDisabledPreviewConfig,assertPreviewData,assertSyntheticNetworkProbe} from './preview-data.mjs';

const root=resolve(import.meta.dirname,'..');
const dist=join(root,'dist');
const build=join(root,'.build');
const bundles=['student-forecast.js','student-entry.js','academic-calendar.js'];
const exists=async p=>{try{return(await stat(p)).isFile()}catch{return false}};
for(const bundle of bundles)
  if(!await exists(join(build,bundle)))throw Error('Missing generated academic JS bundle: '+bundle);
if(!await exists(join(build,'academic-calendar.css')))throw Error('Missing FullCalendar CSS bundle');
const config=await readFile(join(root,'data','academic-source-config.json'),'utf8');
const probe=await readFile(join(root,'data','network-probe.txt'),'utf8');
assertDisabledPreviewConfig(config);
assertSyntheticNetworkProbe(probe);
const {outputs}=JSON.parse(await readFile(join(build,'bundle-meta.json'),'utf8'));
const bundledPackages=new Set();
for(const output of Object.values(outputs)){
  for(const [path,{bytesInOutput}] of Object.entries(output.inputs)){
    const name=path.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)\//)?.[1];
    if(name&&bytesInOutput>0)bundledPackages.add(name);
  }
}
const notices=[];
for(const name of [...bundledPackages].sort()){
  const directory=join(root,'node_modules',name);
  const license=(await readdir(directory)).find(file=>/^LICENSE(?:\.md|\.txt)?$/i.test(file));
  if(!license)throw new Error('번들 라이선스 파일이 없습니다: '+name);
  const {version}=JSON.parse(await readFile(join(directory,'package.json'),'utf8'));
  notices.push(name+' '+version+'\n\n'+(await readFile(join(directory,license),'utf8')).trim());
}
if(!notices.length)throw new Error('번들 라이선스 목록이 비어 있습니다.');
await rm(dist,{recursive:true,force:true});
await mkdir(dist,{recursive:true});
await copyFile(join(root,'index.html'),join(dist,'index.html'));
// 포크 미리보기의 공개 URL 목록을 정적 배포 산출물에도 포함합니다.
await copyFile(join(root,'sitemap.xml'),join(dist,'sitemap.xml'));
await copyFile(join(root,'LICENSE'),join(dist,'LICENSE'));
await writeFile(join(dist,'THIRD-PARTY-NOTICES.txt'),notices.join('\n\n---\n\n')+'\n');
const extensions={css:new Set(['.css']),js:new Set(['.js','.mjs']),
  html:new Set(['.html']),img:new Set(['.png','.jpg','.svg'])};
for(const [directory,allowed] of Object.entries(extensions)){
  const sourceDir=join(root,directory);
  await cp(sourceDir,join(dist,directory),{recursive:true,filter:async source=>{
    const path=relative(sourceDir,source).replaceAll('\\','/');
    if(path===''||(directory==='img'&&path==='lucide'))return (await lstat(source)).isDirectory();
    if(path.includes('/')&&!(directory==='img'&&path.startsWith('lucide/')))return false;
    if(!allowed.has(extname(path))&&!(directory==='img'&&path==='lucide/LICENSE'))return false;
    return (await lstat(source)).isFile();
  }});
}
await mkdir(join(dist,'data'),{recursive:true});
await copyFile(join(build,'academic-calendar.css'),join(dist,'css','academic-calendar-vendor.css'));
await writeFile(join(dist,'data','academic-source-config.json'),JSON.stringify({schemaVersion:1,mode:'disabled'},null,2)+'\n');
await writeFile(join(dist,'data','network-probe.txt'),probe);
await assertPreviewData(dist);
for(const bundle of bundles)
  await copyFile(join(build,bundle),join(dist,'js',bundle));
for(const name of [
 'index.html','html/planner.html','html/forecast.html','html/catalog.html',
 'html/readiness.html','html/reaction-test.html','html/strategy-lab.html','css/hanmo-labs.css',
 'css/academic-unified.css','js/academic-unified.js',
 'js/readiness.mjs','js/strategy-page.mjs','js/strategy-worker.mjs',
 'js/reaction-page.mjs','js/reaction-profile.mjs',
 'data/network-probe.txt',
 'js/strategy-engine.mjs',
 'html/academic-timeline.html',
 'html/vsugang.html','css/academic-calendar-vendor.css','js/academic-calendar.js','sitemap.xml','js/student-forecast.js','js/student-entry.js','data/academic-source-config.json',
])if(!await exists(join(dist,name)))throw Error('Missing public student asset '+name);
for(const banned of ['html/academic-progress.html','html/academic-faq.html','css/academic-progress.css',
 'css/academic-faq.css','js/academic-faq.js','js/degree-preparation.js','img/hufs_logo.png'])
 if(await exists(join(dist,banned)))throw Error('Disallowed web artifact: '+banned);
if(await exists(join(dist,'CNAME')))throw Error('CNAME leaked into QA artifact');
const rootEntries=await readdir(dist);
if(rootEntries.includes('degree-rescue'))throw Error('Legacy academic directory leaked into Pages artifact');
if(await exists(join(dist,'html/scenario-workshop.html'))||await exists(join(dist,'html/scenario-lab.html')))throw Error('Standalone incident HTML leaked into QA artifact');
if(await exists(join(root,'degree-rescue','package.json')))throw Error('Old nested package remains in repo');
console.log('Hanmo site staged at dist/ with academic bundles, HTML, CSS and public data.');
