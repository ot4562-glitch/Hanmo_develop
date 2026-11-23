// @ts-check
/**
 * 합성 자료의 오프라인 수동 등록 검사다.
 * HTTP·크롤러·파일 접근·영속 저장·RLS 우회·실학교 자료 인증 기능은 없다.
 * 운영 출처의 사용권은 담당자가 독립적으로 기록해야 한다.
 */
import {z} from 'zod';
import {ActivityOrganizationSchema,ActivityChannelSchema,ActivityRecordSchema} from '../../contracts/campus-assist/index.js';

/** @typedef {import('../../contracts/campus-assist/index.js').ActivityOrganization} ActivityOrganization */
/** @typedef {import('../../contracts/campus-assist/index.js').ActivityChannel} ActivityChannel */
/** @typedef {import('../../contracts/campus-assist/index.js').ActivityRecord} ActivityRecord */
const Iso=z.iso.datetime({offset:true});
/** @typedef {'INVALID_RECORD'|'UNKNOWN_ORGANIZATION'|'UNKNOWN_CHANNEL'|'CONFLICTED_REGISTRY'|'CHANNEL_NOT_CLEARED'|'CHANNEL_OUT_OF_PERIOD'|'SCOPE_MISMATCH'|'URL_OUTSIDE_CHANNEL'|'RECORD_NOT_CURRENT'|'REAL_SOURCE_REQUIRES_OPERATOR'} IntakeRejection */
/** @typedef {{entryId:string,reason:IntakeRejection}} QuarantinedActivity */
/**
 * @typedef {{
 *    records:readonly ActivityRecord[],
 *    quarantined:readonly QuarantinedActivity[],
 *    acceptedCount:number
 * }} ActivityIntakeReview
 * 이 건수는 합성 수동 등록 진단 값이며 공식 출처 허가의 증명이 아니다.
 */
/**
 * @template {object} T
 * @param {readonly T[]} items
 * @param {(r:T)=>string} id
 * @returns {{byId:Map<string,T>,conflicts:Set<string>}} 중복 ID를 구별한 등록부
 */
function registry(items,id){
  /** @type {Map<string,T>} */
  const byId=new Map();
  /** @type {Set<string>} */
  const conflicts=new Set();
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
/** @param {string} source @param {string} base @returns {boolean} 승인 경로에 포함되는지 여부 */
function inChannel(source,base){
  try{
    const u=new URL(source),root=new URL(base);
    if(u.protocol!=='https:'||root.protocol!=='https:'||u.username||u.password
      ||root.username||root.password||root.search||root.hash||u.origin!==root.origin)
      return false;
    const basePath=root.pathname.replace(/\/+$/,'')||'/';
    return basePath==='/'||u.pathname===basePath||u.pathname.startsWith(basePath+'/');
  }catch{return false;}
}
/** @param {string} time @param {number} at @returns {boolean} 확인 시각 이전인지 여부 */
const current=(time,at)=>Date.parse(time)<=at;

/**
 * 합성 수동 자료만 처리한다. 채널 목록은 운영자가 별도로 관리해야 하며 브라우저가 자체 채널에 VERIFIED·APPROVED를 지정할 수 없다.
 * 실제 학교 자료는 이 단계에서 모두 격리한다.
 */
/**
 * @param {{raw:readonly unknown[],organizations:readonly ActivityOrganization[],channels:readonly ActivityChannel[],asOf:string}} input
 * @returns {ActivityIntakeReview} 합성 출처 검토와 격리 결과
 */
export function reviewSyntheticActivityIntake(input){
  const at=Date.parse(Iso.parse(input.asOf));
  if(!Number.isFinite(at))throw new RangeError('Invalid asOf');
  if(input.raw.length>10000)throw new RangeError('Activity intake exceeds limit');
  const orgRows=ActivityOrganizationSchema.array().max(2000).parse(input.organizations);
  const channelRows=ActivityChannelSchema.array().max(2000).parse(input.channels);
  const org=registry(orgRows,r=>r.organizationId);
  const channel=registry(channelRows,r=>r.channelId);
  /** @type {ActivityRecord[]} */
  const records=[];
  /** @type {QuarantinedActivity[]} */
  const quarantined=[];
  for(const original of input.raw){
    const parsed=ActivityRecordSchema.safeParse(original);
    if(!parsed.success){
      quarantined.push({entryId:'UNVALIDATED',reason:'INVALID_RECORD'});continue;
    }
    const r=parsed.data;
    /** @param {IntakeRejection} reason @returns {void} 사유 기록 */
    const deny=(reason)=>{quarantined.push({entryId:r.entryId,reason});};
    if(r.provenance!=='SYNTHETIC'){deny('REAL_SOURCE_REQUIRES_OPERATOR');continue;}
    const o=org.byId.get(r.organizationId);
    if(!o){deny('UNKNOWN_ORGANIZATION');continue;}
    if(!r.channelId||!channel.byId.has(r.channelId)){deny('UNKNOWN_CHANNEL');continue;}
    if(org.conflicts.has(r.organizationId)||channel.conflicts.has(r.channelId)){
      deny('CONFLICTED_REGISTRY');continue;
    }
    const c=/** @type {ActivityChannel} */ (channel.byId.get(r.channelId));
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
    records.push(r);
  }
  return {records,quarantined,acceptedCount:records.length};
}
