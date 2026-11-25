// @ts-check
// 계산이 오래 걸릴 때 메인 화면에서 즉시 중단할 수 있도록 Worker로 격리합니다.
import {simulate} from './strategy-engine.mjs';
self.addEventListener('message',event=>{
  try{self.postMessage({type:'complete',result:simulate(event.data)});}
  catch(error){self.postMessage({type:'error',message:error instanceof Error?error.message:'계산 오류'});}
});
