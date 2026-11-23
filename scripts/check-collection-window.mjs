// @ts-check
import {collectionGateStatus} from './collection-window.mjs';

let inspectAt;
let enforce=false;
try{
  for(let index=0;index<process.argv.slice(2).length;index++){
    const arg=process.argv.slice(2)[index];
    if(arg==='--enforce'){
      enforce=true;
    }else if(arg==='--at'){
      const next=process.argv.slice(2)[++index];
      if(!next||next.startsWith('--'))throw new Error('--at 값이 필요합니다.');
      inspectAt=next;
    }else if(arg.startsWith('--at=')){
      inspectAt=arg.slice(5);
    }else{
      throw new Error('지원하지 않는 옵션: '+arg);
    }
  }
  // 임의 과거/미래 시각으로 실행 허용을 우회할 수 없도록 차단합니다.
  if(enforce&&inspectAt!==undefined)
    throw new Error('--enforce에는 --at을 지정할 수 없습니다. 실제 시계만 확인합니다.');
  const result=collectionGateStatus(inspectAt??new Date());
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(enforce&&!result.canCollect)process.exitCode=1;
}catch(error){
  process.stderr.write('수집 차단: '+(error instanceof Error?error.message:String(error))+'\n');
  process.exitCode=1;
}
