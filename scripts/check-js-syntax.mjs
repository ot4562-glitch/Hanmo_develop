// @ts-check
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {parse} from 'acorn';

const files=readdirSync('js/academic',{recursive:true,withFileTypes:true})
  .filter(entry=>entry.isFile()&&entry.name.endsWith('.js'))
  .map(entry=>join(entry.parentPath,entry.name));
for(const file of files){
  try{
    parse(readFileSync(file,'utf8'),{ecmaVersion:'latest',sourceType:'module'});
  }catch(error){
    throw new Error('학업 JavaScript 구문 검사 실패: '+file,{cause:error});
  }
}
console.log('JavaScript 정적 구문 검사 통과: '+files.length+'개');
