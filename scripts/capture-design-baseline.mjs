// @ts-check
// 변경 전 소스만 임시 경로에 빌드하며 현재 작업 폴더와 설치된 의존성은 수정하지 않는다.
import {execFileSync,spawn} from 'node:child_process';
import {mkdtemp,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

export const DESIGN_BASE_COMMIT='0df1c0dafd23939f48b35aa68614e8461bb83b31';
export const repositoryRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');

/** 변경 전 화면을 별도 서버로 제공하고 종료 시 임시 산출물을 정리한다. */
export async function startDesignBaseline(){
  const checkout=await mkdtemp(join(tmpdir(),'hanmo-design-baseline-'));
  /** @type {import('node:child_process').ChildProcess|undefined} */
  let server;
  let log='';
  let startupError;
  const url='http://127.0.0.1:4175';
  async function close(){
    if(server&&server.exitCode===null){
      const stopped=new Promise(resolveStop=>server.once('exit',resolveStop));
      server.kill('SIGTERM');
      await Promise.race([stopped,new Promise(resolveWait=>setTimeout(resolveWait,1500))]);
      if(server.exitCode===null)server.kill('SIGKILL');
    }
    await rm(checkout,{recursive:true,force:true});
  }
  try{
    const archive=execFileSync('git',['archive','--format=tar',DESIGN_BASE_COMMIT],
      {cwd:repositoryRoot,maxBuffer:128*1024*1024});
    execFileSync('tar',['-x','-C',checkout],{input:archive});
    await symlink(join(repositoryRoot,'node_modules'),join(checkout,'node_modules'),'dir');
    await build({
      absWorkingDir:checkout,
      entryPoints:['js/academic/app/student-forecast.js','js/academic/app/student-entry.js',
        'js/academic/app/academic-calendar.js'],
      bundle:true,platform:'browser',format:'iife',target:'es2022',minify:true,
      keepNames:true,outdir:'.build',logLevel:'silent',
    });
    execFileSync(process.execPath,[join(checkout,'scripts/stage-static.mjs')],
      {cwd:checkout,encoding:'utf8'});
    server=spawn(process.execPath,[join(checkout,'scripts/serve-static.mjs')],{
      cwd:checkout,env:{...process.env,PORT:'4175'},stdio:['ignore','pipe','pipe'],
    });
    const append=chunk=>{log=(log+String(chunk)).slice(-12000);};
    server.stdout?.on('data',append);
    server.stderr?.on('data',append);
    server.once('error',error=>{startupError=error;});
    const deadline=Date.now()+20_000;
    while(Date.now()<deadline){
      if(startupError)throw startupError;
      if(server.exitCode!==null)throw new Error('변경 전 서버 시작 실패: '+log);
      if(log.includes('한모 브라우저 QA:')){
        try{
          const response=await fetch(url+'/index.html',{signal:AbortSignal.timeout(1000)});
          if(response.ok)return {url,commit:DESIGN_BASE_COMMIT,close};
        }catch{}
      }
      await new Promise(resolveWait=>setTimeout(resolveWait,100));
    }
    throw new Error('변경 전 서버 준비 시간 초과: '+log);
  }catch(error){
    await close();
    throw error;
  }
}
