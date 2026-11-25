import assert from 'node:assert/strict';
import {execFile,spawn} from 'node:child_process';
import {once} from 'node:events';
import {cp,mkdir,mkdtemp,readFile,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {test} from 'node:test';
import {promisify} from 'node:util';
import {assertPreviewData} from '../scripts/preview-data.mjs';

const root=resolve(import.meta.dirname,'..');
const run=promisify(execFile);

test('정적 미리보기 재배포가 철회된 합성 스냅샷의 직접 URL을 제거한다',async t=>{
  const workspace=await mkdtemp(join(tmpdir(),'hanmo-withdrawal-'));
  /** @type {import('node:child_process').ChildProcess|undefined} */
  let server;
  t.after(async()=>{
    if(server&&server.exitCode===null&&server.signalCode===null){
      const stopped=once(server,'exit');
      server.kill();
      await stopped;
    }
    await rm(workspace,{recursive:true,force:true});
  });
  await Promise.all([
    ...['.build','css','dist','html','img','js','LICENSE','index.html','sitemap.xml'].map(path=>
      cp(join(root,path),join(workspace,path),{recursive:true})),
    symlink(join(root,'node_modules'),join(workspace,'node_modules'),'junction'),
    mkdir(join(workspace,'scripts')),
    mkdir(join(workspace,'data')),
  ]);
  await Promise.all([
    ...['preview-data.mjs','stage-static.mjs','serve-static.mjs'].map(name=>
      cp(join(root,'scripts',name),join(workspace,'scripts',name))),
    ...['academic-source-config.json','network-probe.txt'].map(name=>
      cp(join(root,'data',name),join(workspace,'data',name))),
  ]);

  const dist=join(workspace,'dist');
  const obsolete='withdrawn-synthetic-snapshot.json';
  const obsoleteBody={synthetic:true,release:'withdrawal-drill'};
  await writeFile(join(dist,'data',obsolete),JSON.stringify(obsoleteBody));
  await writeFile(join(workspace,'data',obsolete),JSON.stringify(obsoleteBody));
  await assert.rejects(assertPreviewData(dist),/미승인 자료 파일/);

  const startup=AbortSignal.timeout(5000);
  server=spawn(process.execPath,['scripts/serve-static.mjs'],{
    cwd:workspace,env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit'],windowsHide:true,
  });
  const started=Promise.race([
    once(server.stdout,'data',{signal:startup}).then(([data])=>String(data)),
    once(server,'exit',{signal:startup}).then(([code])=>{throw Error('미리보기 서버 시작 실패: '+code);}),
  ]);
  const base=(await started).match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
  assert.ok(base);
  const staleUrl=base+'/data/'+obsolete;
  const stale=await fetch(staleUrl);
  assert.equal(stale.status,200);
  assert.deepEqual(await stale.json(),obsoleteBody);

  const stage=()=>run(process.execPath,['scripts/stage-static.mjs'],{cwd:workspace,timeout:15000});
  await stage();
  assert.deepEqual(JSON.parse(await readFile(join(workspace,'data',obsolete),'utf8')),obsoleteBody);
  await assertPreviewData(dist);
  const priorConfig=join(workspace,'data','academic-source-config.json');
  await writeFile(priorConfig,JSON.stringify({schemaVersion:1,mode:'supabase'}));
  await assert.rejects(stage(),/비활성 학사자료 설정만 허용/);
  await assertPreviewData(dist);
  for(const url of [staleUrl,staleUrl+'?previous=1']){
    const response=await fetch(url);
    assert.equal(response.status,404,url);
    await response.text();
  }
  const config=await fetch(base+'/data/academic-source-config.json');
  assert.equal(config.headers.get('cache-control'),'no-store');
  assert.deepEqual(await config.json(),{schemaVersion:1,mode:'disabled'});
  const practice=await fetch(base+'/html/vsugang.html');
  assert.equal(practice.status,200);
  assert.match(await practice.text(),/BASIC MODE/);
});
