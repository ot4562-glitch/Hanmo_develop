import {copyFile,cp,mkdir,rm,stat,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';

// Core and tests are authored in js/academic but are NOT published as raw TypeScript.
const root=resolve(import.meta.dirname,'..');
const dist=join(root,'dist');
const compiled=join(root,'.build','student-forecast.js');
const compiledEntry=join(root,'.build','student-entry.js');
const compiledProgress=join(root,'.build','academic-progress.js');
const exists=async p=>{try{return(await stat(p)).isFile()}catch{return false}};
for(const filename of [compiled,compiledEntry,compiledProgress])
  if(!await exists(filename))throw Error('Missing generated academic JS bundle: '+filename);
await rm(dist,{recursive:true,force:true});
await mkdir(dist,{recursive:true});
await copyFile(join(root,'index.html'),join(dist,'index.html'));
for(const directory of ['css','js','html','img'])
  await cp(join(root,directory),join(dist,directory),{recursive:true});
await rm(join(dist,'js','academic'),{recursive:true,force:true});
await mkdir(join(dist,'data'),{recursive:true});
await copyFile(join(root,'data','academic-source-config.json'),
  join(dist,'data','academic-source-config.json'));
await copyFile(compiled,join(dist,'js','student-forecast.js'));
await copyFile(compiledEntry,join(dist,'js','student-entry.js'));
await copyFile(compiledProgress,join(dist,'js','academic-progress.js'));
for(const name of [
 'index.html','html/planner.html','html/forecast.html','html/catalog.html',
 'html/academic-timeline.html','html/academic-progress.html',
 'html/vsugang.html','js/student-forecast.js','js/student-entry.js','js/academic-progress.js','data/academic-source-config.json',
])if(!await exists(join(dist,name)))throw Error('Missing public student asset '+name);
if(await exists(join(dist,'CNAME')))throw Error('CNAME leaked into QA artifact');
const rootEntries=await readdir(dist);
if(rootEntries.includes('degree-rescue'))throw Error('Legacy academic directory leaked into Pages artifact');
if(await exists(join(dist,'html/scenario-workshop.html'))||await exists(join(dist,'html/scenario-lab.html')))throw Error('Standalone incident HTML leaked into QA artifact');
if(await exists(join(root,'degree-rescue','package.json')))throw Error('Old nested package remains in repo');
console.log('Hanmo site staged at dist/ with root html, js, css and data. TypeScript source excluded; no CNAME.');
