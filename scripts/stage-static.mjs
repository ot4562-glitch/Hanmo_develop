import {copyFile,cp,mkdir,rm,stat,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const dist=join(root,'dist');
const build=join(root,'.build');
const bundles=['student-forecast.js','student-entry.js','degree-preparation.js'];
const exists=async p=>{try{return(await stat(p)).isFile()}catch{return false}};
for(const bundle of bundles)
  if(!await exists(join(build,bundle)))throw Error('Missing generated academic JS bundle: '+bundle);
await rm(dist,{recursive:true,force:true});
await mkdir(dist,{recursive:true});
await copyFile(join(root,'index.html'),join(dist,'index.html'));
// 포크 미리보기의 공개 URL 목록을 정적 배포 산출물에도 포함합니다.
await copyFile(join(root,'sitemap.xml'),join(dist,'sitemap.xml'));
const academicSource=join(root,'js','academic');
for(const directory of ['css','js','html','img'])
  await cp(join(root,directory),join(dist,directory),{recursive:true,filter:source=>source!==academicSource});
await mkdir(join(dist,'data'),{recursive:true});
await copyFile(join(root,'data','academic-source-config.json'),
  join(dist,'data','academic-source-config.json'));
for(const bundle of bundles)
  await copyFile(join(build,bundle),join(dist,'js',bundle));
for(const name of [
 'index.html','html/planner.html','html/forecast.html','html/catalog.html',
 'html/academic-timeline.html','html/academic-progress.html',
 'html/vsugang.html','sitemap.xml','js/student-forecast.js','js/student-entry.js','js/degree-preparation.js','data/academic-source-config.json',
])if(!await exists(join(dist,name)))throw Error('Missing public student asset '+name);
if(await exists(join(dist,'CNAME')))throw Error('CNAME leaked into QA artifact');
const rootEntries=await readdir(dist);
if(rootEntries.includes('degree-rescue'))throw Error('Legacy academic directory leaked into Pages artifact');
if(await exists(join(dist,'html/scenario-workshop.html'))||await exists(join(dist,'html/scenario-lab.html')))throw Error('Standalone incident HTML leaked into QA artifact');
if(await exists(join(root,'degree-rescue','package.json')))throw Error('Old nested package remains in repo');
console.log('Hanmo site staged at dist/ with academic bundles, HTML, CSS and public data.');
