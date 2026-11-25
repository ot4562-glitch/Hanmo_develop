// @ts-check
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';

const configName='academic-source-config.json';
const probeName='network-probe.txt';
const probeHash='33285803a799be38faadcc0777e9fdf6adf36cef2d2bc49ea7098cc11e1a5a70';

/** @param {string} text 공개 QA의 자료 연결 설정 */
export function assertDisabledPreviewConfig(text){
  let config;
  try{config=JSON.parse(text);}
  catch{throw new Error('공개 미리보기의 학사자료 설정은 유효한 JSON이어야 합니다.');}
  if(!config||Object.keys(config).length!==2||config.schemaVersion!==1||config.mode!=='disabled')
    throw new Error('공개 미리보기에는 비활성 학사자료 설정만 허용됩니다.');
}

/** @param {string} text 저장소에서 제공하는 합성 네트워크 시험 파일 */
export function assertSyntheticNetworkProbe(text){
  const digest=createHash('sha256').update(text.replaceAll('\r\n','\n')).digest('hex');
  if(digest!==probeHash)throw new Error('검증된 합성 네트워크 시험 파일이 아닙니다.');
}

/** @param {string} dist 검증할 정적 산출물 경로 */
export async function assertPreviewData(dist){
  const data=join(dist,'data');
  const entries=await readdir(data,{withFileTypes:true});
  const allowed=new Set([configName,probeName]);
  if(entries.length!==allowed.size||entries.some(entry=>!entry.isFile()||!allowed.has(entry.name)))
    throw new Error('공개 산출물에 미승인 자료 파일 또는 경로가 있습니다.');
  assertDisabledPreviewConfig(await readFile(join(data,configName),'utf8'));
  assertSyntheticNetworkProbe(await readFile(join(data,probeName),'utf8'));
}
