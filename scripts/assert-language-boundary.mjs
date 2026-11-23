// @ts-check
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const ignored=new Set(['.git','node_modules','dist','.build','coverage','.cache','test-results','playwright-report']);
/** @param {string} dir @param {string} [prefix] @returns {string[]} 저장소 파일 목록 */
function list(dir,prefix=''){
  return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    if(entry.isDirectory()&&ignored.has(entry.name))return [];
    const path=prefix?prefix+'/'+entry.name:entry.name;
    return entry.isDirectory()?list(join(dir,entry.name),path):entry.isFile()?[path]:[];
  });
}
const files=list(root);
const forbidden=files.filter(path=>/\.(?:ts|tsx|mts|cts)$/.test(path));
if(forbidden.length)throw new Error('TypeScript 소스 금지: '+forbidden.join(', '));
const academic=files.filter(path=>/^js\/academic\/.+\.js$/.test(path));
for(const path of academic){
  const content=readFileSync(resolve(root,path),'utf8');
  if(!/^\uFEFF?\/\/ @ts-check\b/.test(content))
    throw new Error('JSDoc 검사 지시문 누락: '+path);
}
console.log('JavaScript 학업 파일 '+academic.length+'개, TypeScript 소스 0개');
