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
/** @typedef {'INDEXED'|'HELD'|'WITHDRAWN'|'NOT_IN_MANIFEST'|'HASH_MISMATCH'|'POLICY_MISMATCH'|'OUT_OF_SCOPE'|'OUTSIDE_OBSERVATION_WINDOW'|'OBSERVED_AFTER_AS_OF'|'MISSING_ROW'} NoticeDisposition */
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
    // 매니페스트가 선언한 관측 기간(양 끝 포함) 밖에서 관측된 행은 해시가 맞아도 이 스냅샷의 공지로 보지 않는다.
    const seenAt=Date.parse(row.observedAt);
    if(seenAt<Date.parse(m.scope.observedFrom)||seenAt>Date.parse(m.scope.observedTo)){out('OUTSIDE_OBSERVATION_WINDOW');continue;}
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

/**
 * 학생에게 내보낼 정적 공개판 계약. 필드 이름만이 아니라 값과 필드 간 일관성까지 검사한다.
 * 공지 행은 NoticeMetaSchema를 그대로 쓰며, 철회 상태는 공개판에 들어올 수 없다.
 */
export const PublicNoticeBundleSchema=z.strictObject({
  snapshotId:Id,indexRevision:Id,policyVersion:Id,
  provenance:z.enum(['SYNTHETIC','REVIEWED']),
  asOf:Iso,
  coverage:z.strictObject({sourceIds:z.array(Id).min(1).max(2),observedFrom:Iso,observedTo:Iso,count:z.number().int().min(0).max(5000)}),
  notices:z.array(NoticeMetaSchema).max(5000),
});

/**
 * 학생에게 내보낼 정적 공개판을 검사한다. 위반이 있으면 내보내지 않도록 오류를 던진다.
 * 1) 어느 깊이든 금지 키 이름이 있으면 거부한다. 2) 엄격한 공개판 계약으로 파싱한다(필수 값 누락·미허용 키 거부).
 * 3) 공지 행은 제목 금지 내용·ID 충돌 검사를 다시 통과해야 하고, 판본·출처·관측 기간·건수가 공개판 머리 정보와 맞아야 한다.
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
  const parsed=PublicNoticeBundleSchema.safeParse(bundle);
  if(!parsed.success){
    // 위치만 남기고 값은 남기지 않는다(공개판에 섞인 원문이 오류 메시지로 새지 않게).
    for(const i of parsed.error.issues)problems.push('SCHEMA '+(i.path.join('.')||'$')+' '+i.code);
  }else{
    const b=parsed.data;
    const s=screenNoticeMeta(b.notices);
    for(const h of s.held)problems.push('NOTICE_HELD '+(h.noticeId??'?')+' '+h.reason+':'+h.detail);
    for(const id of s.withdrawn)problems.push('NOTICE_WITHDRAWN '+id);
    const from=Date.parse(b.coverage.observedFrom),to=Date.parse(b.coverage.observedTo),asOf=Date.parse(b.asOf);
    if(from>to)problems.push('COVERAGE_REVERSED');
    if(to>asOf)problems.push('COVERAGE_AFTER_AS_OF');
    if(b.coverage.count!==b.notices.length)problems.push('COVERAGE_COUNT_MISMATCH '+b.coverage.count+'!='+b.notices.length);
    for(const r of b.notices){
      if(r.policyVersion!==b.policyVersion)problems.push('NOTICE_POLICY_MISMATCH '+r.noticeId);
      if(r.provenance!==b.provenance)problems.push('NOTICE_PROVENANCE_MISMATCH '+r.noticeId);
      if(!b.coverage.sourceIds.includes(r.sourceId))problems.push('NOTICE_OUT_OF_SCOPE '+r.noticeId);
      const t=Date.parse(r.observedAt);
      if(t<from||t>to)problems.push('NOTICE_OUTSIDE_OBSERVATION_WINDOW '+r.noticeId);
    }
  }
  if(problems.length)throw new RangeError('Public notice bundle rejected: '+problems.join('; '));
  return true;
}
