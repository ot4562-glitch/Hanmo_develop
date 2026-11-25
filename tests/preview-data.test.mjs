import assert from 'node:assert/strict';
import {copyFile,mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {assertDisabledPreviewConfig,assertPreviewData} from '../scripts/preview-data.mjs';

const disabled=JSON.stringify({schemaVersion:1,mode:'disabled'});

test('공개 QA는 활성, 구형, 비밀 정보가 섞인 설정을 거부한다',()=>{
  assert.doesNotThrow(()=>assertDisabledPreviewConfig(disabled));
  assert.throws(()=>assertDisabledPreviewConfig('가상의 비밀 입력'),{
    message:'공개 미리보기의 학사자료 설정은 유효한 JSON이어야 합니다.',
  });
  for(const config of [null,[],{}, {schemaVersion:1,mode:'supabase'},
    {schemaVersion:1,mode:'disabled',payload:{}},{schemaVersion:0,mode:'disabled'}]){
    assert.throws(()=>assertDisabledPreviewConfig(JSON.stringify(config)),/비활성 학사자료 설정/);
  }
});

test('승인된 합성 데이터만 공개하고 복구한 과거 자료나 시험 파일 위장은 거부한다',async t=>{
  const dist=await mkdtemp(join(tmpdir(),'hanmo-preview-'));
  t.after(()=>rm(dist,{recursive:true,force:true}));
  const data=join(dist,'data');
  await mkdir(data);
  await writeFile(join(data,'academic-source-config.json'),disabled);
  await copyFile(new URL('../data/network-probe.txt',import.meta.url),join(data,'network-probe.txt'));
  await assertPreviewData(dist);

  const old=join(data,'previous-public-snapshot.json');
  await writeFile(old,'{}');
  await assert.rejects(assertPreviewData(dist),/미승인 자료 파일/);
  await rm(old);

  await writeFile(join(data,'network-probe.txt'),'검증되지 않은 합성 파일');
  await assert.rejects(assertPreviewData(dist),/합성 네트워크 시험 파일/);
});
