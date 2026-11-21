/**
 * 합성 자료의 오프라인 수동 등록 검사다.
 * HTTP·크롤러·파일 접근·영속 저장·RLS 우회·실학교 자료 인증 기능은 없다.
 * 운영 출처의 사용권은 담당자가 독립적으로 기록해야 한다.
 */
import {z} from 'zod';
import {ActivityOrganizationSchema,ActivityChannelSchema,ActivityRecordSchema,
  type ActivityOrganization,type ActivityChannel,type ActivityRecord} from '../../contracts/campus-assist/index.js';

const Iso=z.iso.datetime({offset:true});
export type IntakeRejection='INVALID_RECORD'|'UNKNOWN_ORGANIZATION'|'UNKNOWN_CHANNEL'
  |'CONFLICTED_REGISTRY'|'CHANNEL_NOT_CLEARED'|'CHANNEL_OUT_OF_PERIOD'
  |'SCOPE_MISMATCH'|'URL_OUTSIDE_CHANNEL'|'RECORD_NOT_CURRENT'
  |'REAL_SOURCE_REQUIRES_OPERATOR';
export type QuarantinedActivity={entryId:string;reason:IntakeRejection};
export type ActivityIntakeReview={
  records:readonly ActivityRecord[];
  quarantined:readonly QuarantinedActivity[];
  /** 이 건수는 합성 등록 진단 값으로 허가된 출처 수집의 증명이 아니다. */
  acceptedCount:number;
};
function registry<T extends object>(items:readonly T[],id:(r:T)=>string){
  const byId=new Map<string,T>(),conflicts=new Set<string>();
  for(const row of items){
    const key=id(row);
    if(byId.has(key))conflicts.add(key);
    else byId.set(key,row);
  }
  return {byId,conflicts};
}
/**
 * 정규화한 HTTPS 원점과 경로 세그먼트 경계가 있는 공식 기본 경로만 허용한다.
 * /notice가 /notice-evil과 단순 접두어 일치하는 검사는 부족하다.
 */
function inChannel(source:string,base:string):boolean{
  try{
    const u=new URL(source),root=new URL(base);
    if(u.protocol!=='https:'||root.protocol!=='https:'||u.username||u.password
      ||root.username||root.password||root.search||root.hash||u.origin!==root.origin)
      return false;
    const basePath=root.pathname.replace(/\/+$/,'')||'/';
    return basePath==='/'||u.pathname===basePath||u.pathname.startsWith(basePath+'/');
  }catch{return false;}
}
const current=(time:string,at:number)=>Date.parse(time)<=at;

/**
 * 합성 수동 자료만 처리한다. 채널 목록은 운영자가 별도로 관리해야 하며 브라우저가 자체 채널에 VERIFIED·APPROVED를 지정할 수 없다.
 * 실제 학교 자료는 이 단계에서 모두 격리한다.
 */
export function reviewSyntheticActivityIntake(input:{
  raw:readonly unknown[];organizations:readonly ActivityOrganization[];
  channels:readonly ActivityChannel[];asOf:string;
}):ActivityIntakeReview{
  const at=Date.parse(Iso.parse(input.asOf));
  if(!Number.isFinite(at))throw new RangeError('Invalid asOf');
  if(input.raw.length>10000)throw new RangeError('Activity intake exceeds limit');
  const orgRows=ActivityOrganizationSchema.array().max(2000).parse(input.organizations);
  const channelRows=ActivityChannelSchema.array().max(2000).parse(input.channels);
  const org=registry(orgRows,r=>r.organizationId);
  const channel=registry(channelRows,r=>r.channelId);
  const records:ActivityRecord[]=[],quarantined:QuarantinedActivity[]=[];
  for(const original of input.raw){
    const parsed=ActivityRecordSchema.safeParse(original);
    if(!parsed.success){
      quarantined.push({entryId:'UNVALIDATED',reason:'INVALID_RECORD'});continue;
    }
    const r=parsed.data;
    const deny=(reason:IntakeRejection)=>{quarantined.push({entryId:r.entryId,reason});};
    if(r.provenance!=='SYNTHETIC'){deny('REAL_SOURCE_REQUIRES_OPERATOR');continue;}
    const o=org.byId.get(r.organizationId);
    if(!o){deny('UNKNOWN_ORGANIZATION');continue;}
    if(!r.channelId||!channel.byId.has(r.channelId)){deny('UNKNOWN_CHANNEL');continue;}
    if(org.conflicts.has(r.organizationId)||channel.conflicts.has(r.channelId)){
      deny('CONFLICTED_REGISTRY');continue;
    }
    const c=channel.byId.get(r.channelId)!;
    if(c.provenance!=='SYNTHETIC'||c.rights!=='APPROVED'||c.status!=='ACTIVE'){
      deny('CHANNEL_NOT_CLEARED');continue;
    }
    if(!current(o.verifiedAt,at)||!current(c.verifiedAt,at)
      ||!current(c.effectiveFrom,at)
      ||c.effectiveUntil!==undefined&&Date.parse(c.effectiveUntil)<=at){
      deny('CHANNEL_OUT_OF_PERIOD');continue;
    }
    if(c.organizationId!==r.organizationId
      ||o.campus!=='BOTH'&&r.campus!=='BOTH'&&o.campus!==r.campus){
      deny('SCOPE_MISMATCH');continue;
    }
    if(!inChannel(r.sourceUrl,c.sourceBaseUrl)){deny('URL_OUTSIDE_CHANNEL');continue;}
    if(!current(r.publishedAt,at)||!current(r.verifiedAt,at)){
      deny('RECORD_NOT_CURRENT');continue;
    }
    // REVOKED·DELETED 최신판을 보존해 currentActivityRecords가 이전 승인판을 억제하도록 한다.
    // 철회 이전의 기록을 되살리지 않는다.
    records.push(r);
  }
  return {records,quarantined,acceptedCount:records.length};
}
