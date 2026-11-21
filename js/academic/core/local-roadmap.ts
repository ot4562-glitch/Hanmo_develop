/** 학업 설정은 브라우저에서만 보관하며 네트워크를 사용하지 않는다. 기존 한모 연습 설정 키는 읽지 않는다. */
export const ROADMAP_KEY='hanmo.academic.v1.roadmap';
export const ROADMAP_MAX_BYTES=1024*1024;
export const ROADMAP_SOURCE='hanmo-degree-rescue-v1';
const STATUSES=new Set(['UNREVIEWED','IN_PROGRESS','DONE','NOT_APPLICABLE']);

export type RoadmapProgress=Record<string,'UNREVIEWED'|'IN_PROGRESS'|'DONE'|'NOT_APPLICABLE'>;
export type RoadmapPayload<T>={profile:T;progress:RoadmapProgress};
export type RoadmapStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;

function object(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('백업 데이터 객체 형식이 아닙니다.');
  return value as Record<string,unknown>;
}
function iso(value:unknown):boolean{
  return typeof value==='string'&&/^\d{4}-\d\d-\d\dT/.test(value)&&
    /(Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value));
}
// 문자열 글자 수가 아닌 UTF-8 바이트로 크기를 검사해 한글이 포함된 백업도 1MiB 한도를 지킨다.
function bounded(raw:string):void{
  if(new TextEncoder().encode(raw).length>ROADMAP_MAX_BYTES)throw new Error('백업/저장 자료는 1MiB 이하만 허용됩니다.');
}
/** 프로필 파서는 알 수 없거나 잘못된 필드를 거부해야 한다. 예: AcademicProfileSchema.parse. */
export function parseRoadmap<T>(raw:string,parseProfile:(value:unknown)=>T,
  allowedSteps:ReadonlySet<string>):RoadmapPayload<T>{
  bounded(raw);
  // 외부 JSON은 신뢰하지 않는다. 판본·시각·프로필·허용된 체크 항목을 모두 검증한 뒤 사용한다.
  const envelope=object(JSON.parse(raw) as unknown);
  if(envelope.schemaVersion!==1||!iso(envelope.updatedAt))throw new Error('지원되지 않는 저장 버전/시각입니다.');
  const payload=object(envelope.payload);
  const profile=parseProfile(payload.profile);
  const progressRaw=object(payload.progress);
  const progress:RoadmapProgress={};
  for(const [key,value] of Object.entries(progressRaw)){
    if(!allowedSteps.has(key)||!STATUSES.has(value as string))throw new Error('알 수 없는 체크 항목 또는 상태: '+key);
    // 허용된 체크 항목 키 목록(allowedSteps)에 없는 항목은 거부한다.
    progress[key]=value as RoadmapProgress[string];
  }
  return {profile,progress};
}
function encode<T>(value:RoadmapPayload<T>,parseProfile:(value:unknown)=>T,
  allowedSteps:ReadonlySet<string>,timestamp:string,backup:boolean):string{
  if(!iso(timestamp))throw new Error('저장 시각이 유효하지 않습니다.');
  const raw=JSON.stringify({schemaVersion:1,updatedAt:timestamp,
    ...(backup?{exportedAt:timestamp,sourceRevision:ROADMAP_SOURCE}:{}),payload:value});
  parseRoadmap(raw,parseProfile,allowedSteps);
  return raw;
}
export function readRoadmap<T>(storage:RoadmapStorage,parseProfile:(value:unknown)=>T,
  allowedSteps:ReadonlySet<string>):RoadmapPayload<T>|null{
  const raw=storage.getItem(ROADMAP_KEY);
  return raw===null?null:parseRoadmap(raw,parseProfile,allowedSteps);
}
/** localStorage 키 하나만 갱신한다. 기록 실패 시 여러 키가 일부만 변경되는 상태를 만들지 않는다. */
export function saveRoadmap<T>(storage:RoadmapStorage,value:RoadmapPayload<T>,
  parseProfile:(value:unknown)=>T,allowedSteps:ReadonlySet<string>,
  timestamp=new Date().toISOString()):void{
  // 검증이 끝난 한 개의 전용 키만 갱신하여 기존 모의수강신청 저장값을 보존한다.
  const raw=encode(value,parseProfile,allowedSteps,timestamp,false);
  storage.setItem(ROADMAP_KEY,raw);
}
export function exportRoadmap<T>(value:RoadmapPayload<T>,parseProfile:(value:unknown)=>T,
  allowedSteps:ReadonlySet<string>,timestamp=new Date().toISOString()):string{
  // 파일용 들여쓰기 때문에 실제 백업 용량이 커지므로 직렬화 후 다시 크기를 확인한다.
  const pretty=JSON.stringify(JSON.parse(encode(value,parseProfile,allowedSteps,timestamp,true)),null,2)+'\n';
  bounded(pretty);
  return pretty;
}
export function parseRoadmapBackup<T>(raw:string,parseProfile:(value:unknown)=>T,
  allowedSteps:ReadonlySet<string>):RoadmapPayload<T>{
  bounded(raw);
  const obj=object(JSON.parse(raw) as unknown);
  // 다른 앱의 JSON이나 미래/알 수 없는 출처의 백업은 자동 이관하지 않고 복원을 거부한다.
  if(obj.sourceRevision!==ROADMAP_SOURCE||!iso(obj.exportedAt)){
    throw new Error('한모 학업 설정 백업 파일이 아니거나 판본을 알 수 없습니다.');
  }
  return parseRoadmap(raw,parseProfile,allowedSteps);
}
export function clearRoadmap(storage:RoadmapStorage):void{storage.removeItem(ROADMAP_KEY);}
