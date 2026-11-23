// @ts-check
/**
 * #44 공개 공지 최소 메타데이터·원문 링크 인덱스(순수 코어). 실제 학교 자료에는 연결하지 않는다(mode: disabled).
 *
 * 이전의 문단 근거 인덱스(공지·FAQ 본문 문단)는 정보처 서면 회신(2026-11-23)의 본문 재게시·FAQ 금지에 따라 제거했다.
 * 이 인덱스는 #53의 공지 메타데이터 계약(notice-search.js NoticeMetaSchema)만 받는다.
 *
 * 1) buildNoticeMetaIndex: 검수 스냅샷 매니페스트(#42)와 메타데이터 행을 대조한다.
 *    매니페스트에 같은 내용 해시로 등재되고, 정책판본·수집 범위·기준 시각을 만족하며, 철회 목록에 없는 공지만 넣는다.
 *    행에 적힌 상태·검수 표시는 자기 선언이므로 매니페스트 대조 없이는 공개 후보가 되지 않는다.
 * 2) assertPublicNoticeBundle: 학생에게 내보낼 정적 공개판 객체에 금지 필드가 있는지 키 이름과 값으로 검사한다.
 */
/** @typedef {import("./notice-search.js").NoticeMeta} NoticeMeta */
/** @typedef {import("./notice-search.js").HeldNotice} HeldNotice */
/** @typedef {z.infer<typeof NoticeIndexManifestSchema>} NoticeIndexManifest */
/** @typedef {'INDEXED'|'HELD'|'WITHDRAWN'|'NOT_IN_MANIFEST'|'HASH_MISMATCH'|'POLICY_MISMATCH'|'OUT_OF_SCOPE'|'OBSERVED_AFTER_AS_OF'|'MISSING_ROW'} NoticeDisposition */
/** @typedef {{noticeId:string|null,disposition:NoticeDisposition,detail?:string}} NoticeDispositionRow */
/** @typedef {{snapshotId:string,indexRevision:string,policyVersion:string,provenance:NoticeIndexManifest['provenance'],asOf:string,status:'READY'|'PARTIAL',notices:NoticeMeta[],dispositions:NoticeDispositionRow[],coverage:{sourceIds:string[],observedFrom:string,observedTo:string,count:number}}} NoticeMetaIndex */
import {z} from 'zod';
import {canonicalJson,sha256Hex} from './content-hash.js';
import {NoticeMetaSchema,screenNoticeMeta} from './notice-search.js';

const Id=z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/);
const Iso=z.iso.datetime({offset:true});
const Sha256=z.string().regex(/^[0-9a-f]{64}$/);
/** 검수 스냅샷 매니페스트(#42와 합의할 초안). scope는 이 스냅샷이 실제로 관측한 출처와 기간이다. */
export const NoticeIndexManifestSchema=z.strictObject({
  snapshotId:Id,indexRevision:Id,builtAt:Iso,policyVersion:Id,
  provenance:z.enum(['SYNTHETIC','REVIEWED']),
  scope:z.strictObject({sourceIds:z.array(Id).min(1).max(2),observedFrom:Iso,observedTo:Iso}),
  entries:z.array(z.strictObject({noticeId:Id,contentSha256:Sha256})).max(5000),
  withdrawn:z.array(Id).max(5000),
}).refine(m=>new Set(m.entries.map(e=>e.noticeId)).size===m.entries.length,'one manifest entry per notice')
  .refine(m=>Date.parse(m.scope.observedFrom)<=Date.parse(m.scope.observedTo),'reversed observation window');

/**
 * 매니페스트 빌더가 같은 값을 계산할 수 있도록 공개하는 메타데이터 행 해시(키 순서 무관 정규 JSON의 SHA-256).
 * @param {NoticeMeta} row 공지 메타데이터 행
 * @returns {string}
 */
export function noticeMetaSha256(row){
  return sha256Hex(canonicalJson(NoticeMetaSchema.parse(row)));
}

/**
 * @param {{manifest:unknown,notices:readonly unknown[],asOf:string}} input 매니페스트·메타데이터 행·기준 시각
 * @returns {NoticeMetaIndex}
 */
export function buildNoticeMetaIndex(input){
  const time=Date.parse(input.asOf);
  if(!Iso.safeParse(input.asOf).success||!Number.isFinite(time))throw new RangeError('Invalid asOf');
  const m=NoticeIndexManifestSchema.parse(input.manifest);
  if(Date.parse(m.builtAt)>time)throw new RangeError('Manifest built after asOf');
  const screened=screenNoticeMeta(input.notices);
  if(screened.accepted.some(r=>r.provenance!==m.provenance))throw new RangeError('Mixed synthetic and reviewed notices');

  /** @type {NoticeDispositionRow[]} */
  const dispositions=[];
  /** @param {HeldNotice} h */
  const held=h=>dispositions.push({noticeId:h.noticeId,disposition:'HELD',detail:h.reason+':'+h.detail});
  screened.held.forEach(held);
  const listed=new Map(m.entries.map(e=>[e.noticeId,e.contentSha256]));
  const withdrawn=new Set([...m.withdrawn,...screened.withdrawn]);
  /** @type {NoticeMeta[]} */
  const notices=[];
  const seen=new Set([...screened.held.map(h=>h.noticeId),...screened.withdrawn]);
  for(const id of screened.withdrawn)dispositions.push({noticeId:id,disposition:'WITHDRAWN'});
  for(const row of screened.accepted){
    seen.add(row.noticeId);
    /** @param {NoticeDisposition} d @param {string} [detail] */
    const out=(d,detail)=>dispositions.push({noticeId:row.noticeId,disposition:d,...(detail?{detail}:{})});
    // 철회 목록은 다른 모든 판단보다 앞선다. 행 상태가 ACTIVE여도 다시 공개하지 않는다.
    if(withdrawn.has(row.noticeId)){out('WITHDRAWN');continue;}
    if(row.policyVersion!==m.policyVersion){out('POLICY_MISMATCH');continue;}
    if(!m.scope.sourceIds.includes(row.sourceId)){out('OUT_OF_SCOPE');continue;}
    if(Date.parse(row.observedAt)>time){out('OBSERVED_AFTER_AS_OF');continue;}
    const hash=listed.get(row.noticeId);
    if(!hash){out('NOT_IN_MANIFEST');continue;}
    if(hash!==noticeMetaSha256(row)){out('HASH_MISMATCH');continue;}
    out('INDEXED');notices.push(row);
  }
  for(const id of listed.keys())if(!seen.has(id))dispositions.push({noticeId:id,disposition:'MISSING_ROW'});
  dispositions.sort((a,b)=>(a.noticeId??'').localeCompare(b.noticeId??'')||a.disposition.localeCompare(b.disposition));
  const indexed=new Set(notices.map(r=>r.noticeId));
  const complete=[...listed.keys()].every(id=>indexed.has(id))&&!screened.held.length;
  return {snapshotId:m.snapshotId,indexRevision:m.indexRevision,policyVersion:m.policyVersion,provenance:m.provenance,
    asOf:input.asOf,status:complete?'READY':'PARTIAL',notices,dispositions,
    coverage:{sourceIds:[...m.scope.sourceIds].sort(),observedFrom:m.scope.observedFrom,observedTo:m.scope.observedTo,count:notices.length}};
}

/** 공개판 어디에도 있으면 안 되는 키 이름. 본문·첨부·FAQ·교수·개인 연락처·수강 현황·학칙/졸업요건 계열이다. */
const FORBIDDEN_KEY=/^(?:body|content|html|text|paragraphs?|attachments?|files?|faqs?|answers?|instructors?|professors?|teachers?|authors?|writer|emails?|phones?|contacts?|enrollment|capacity|seats?|rules?|graduation\w*|requirements?)$/i;
const TOP_KEYS=new Set(['snapshotId','indexRevision','policyVersion','provenance','asOf','coverage','notices']);

/**
 * 학생에게 내보낼 정적 공개판을 검사한다. 위반이 있으면 내보내지 않도록 오류를 던진다.
 * 최상위 키는 허용 목록만, 공지 항목은 메타데이터 계약과 제목 금지 내용 검사를 다시 통과해야 한다.
 * @param {unknown} bundle 공개판 후보
 * @returns {true}
 */
export function assertPublicNoticeBundle(bundle){
  /** @type {string[]} */
  const problems=[];
  /** @param {unknown} v @param {string} path */
  const walk=(v,path)=>{
    if(Array.isArray(v))v.forEach((x,i)=>walk(x,path+'['+i+']'));
    else if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){
      if(FORBIDDEN_KEY.test(k))problems.push('FORBIDDEN_KEY '+path+'.'+k);
      walk(x,path+'.'+k);
    }
  };
  walk(bundle,'$');
  if(!bundle||typeof bundle!=='object'||Array.isArray(bundle))problems.push('NOT_AN_OBJECT');
  else{
    const obj=/** @type {Record<string,unknown>} */(bundle);
    for(const k of Object.keys(obj))if(!TOP_KEYS.has(k))problems.push('UNKNOWN_TOP_KEY '+k);
    const rows=Array.isArray(obj.notices)?obj.notices:[];
    if(!Array.isArray(obj.notices))problems.push('NOTICES_MISSING');
    const s=screenNoticeMeta(rows);
    // 공개판에는 보류·철회 항목이 있으면 안 된다. 보류 사유에는 원문이 아니라 규칙 이름만 남는다.
    for(const h of s.held)problems.push('NOTICE_HELD '+(h.noticeId??'?')+' '+h.reason+':'+h.detail);
    for(const id of s.withdrawn)problems.push('NOTICE_WITHDRAWN '+id);
  }
  if(problems.length)throw new RangeError('Public notice bundle rejected: '+problems.join('; '));
  return true;
}
