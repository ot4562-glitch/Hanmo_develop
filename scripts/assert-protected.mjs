import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const changed=execFileSync('git',['diff','--name-only','--no-renames','origin/main...HEAD'],
 {cwd:root,encoding:'utf8',maxBuffer:4*1024*1024}).trim().split('\n').filter(Boolean);
const protectedFiles=new Set(['html/practice.html','html/selectZone.html',
 'js/practice.js','js/selectZone.js','css/practice.css','css/vsugang.css']);
const offenders=changed.filter(path=>protectedFiles.has(path));
if(offenders.length)throw Error('Protected HUFS imitation changed:\n'+offenders.join('\n'));
const allowed=p=>p.startsWith('degree-rescue/')||p.startsWith('js/academic/')||(p.startsWith('js/scenario-')||['js/incident-courses.js','js/incident-options.js','js/academic-data-source.js','js/student-notices.js','js/student-catalog.js'].includes(p))
 ||p.startsWith('docs/')||p.startsWith('scripts/')||p.startsWith('data/')
 ||p.startsWith('tests/')||p.startsWith('css/')||p.startsWith('html/')
 ||p.startsWith('.github/workflows/')||['index.html','package.json','tsconfig.json',
 '.gitignore','README.md','AGENTS.md','agent.md'].includes(p);
const unexpected=changed.filter(p=>!allowed(p));
if(unexpected.length)throw Error('Unexpected files:\n'+unexpected.join('\n'));
console.log('Original HUFS registration imitation preserved; '+changed.length+' scoped changes.');
