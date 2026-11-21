import {
  EvidenceManifestSchema,EvidenceRevisionSchema,
  type EvidenceConditions,type EvidenceKind,type EvidenceManifest,type EvidenceRef,type EvidenceRevision,
  type FaqDocument,
} from '../../contracts/campus-assist/index.js';
import {exchangePolicyInEffect} from './exchange.js';
import {canonicalJson,sha256Hex} from './content-hash.js';

/**
 * #44 승인 공지·FAQ 근거 문단 로컬 인덱스 (순수 코어).
 *
 * 입력: 검수 스냅샷 매니페스트, 공지·FAQ 판본 목록, 기준 시각 asOf.
 * 출력: 문단 단위 근거 행(문서 ID·판본·문단 ID·조건·원문 링크·검수 시각)과 문서별 처리 결과.
 *
 * 원칙
 * - 판본 JSON 자체의 검수 시각·URL은 자기 선언이다. 매니페스트에 같은 판본·같은 내용 해시로 등재된 경우에만 INDEXED.
 * - 최신 판본이 철회·차단·취소·충돌이면 문서 전체를 제외하고 예전 승인 판본으로 되돌아가지 않는다.
 * - 다른 문서 판본을 참조하는 문단은 참조 대상의 색인 판본과 일치할 때만 READY, 아니면 HOLD.
 * - 합성(SYNTHETIC)과 실자료가 섞이면 결과가 아니라 구성 오류로 던진다.
 */
export type EvidenceDisposition=
  |'INDEXED'
  |'AFTER_AS_OF'        // 기준 시각 이후에 게시·검수된 판본만 있음
  |'REVISION_CONFLICT'  // 최신 판본 위치의 복사본 내용이 서로 다름
  |'RIGHTS_REVOKED'     // 최신 판본의 권리가 철회·차단됨
  |'CANCELLED'          // 최신 판본이 취소 공지임
  |'NOT_IN_EFFECT'      // 효력 기간 밖
  |'NOT_IN_MANIFEST'    // 스냅샷에 등재되지 않은 미검수 후보
  |'MANIFEST_MISMATCH'; // 매니페스트의 판본·내용 해시가 최신 판본과 다르거나 판본을 찾을 수 없음

export type EvidenceHoldReason='REF_NOT_INDEXED'|'REF_REVISION_MISMATCH';

export interface EvidenceIndexEntry{
  /** `${kind}:${documentId}:${revisionId}:${paragraphId}` — 공지와 FAQ의 같은 문서 ID도 충돌하지 않는다. */
  citationId:string;
  snapshotId:string;indexRevision:string;
  kind:EvidenceKind;documentId:string;revisionId:string;paragraphId:string;
  title:string;text:string;sourceUrl:string;publishedAt:string;verifiedAt:string;
  revisionState:'PUBLISHED'|'CORRECTED';
  /** null은 '조건 미기재'이며 전체 대상이라는 뜻이 아니다. */
  conditions:EvidenceConditions|null;
  provenance:EvidenceRevision['provenance'];
  publicContacts?:string[];
  refs:EvidenceRef[];
  status:'READY'|'HOLD';
  holdReasons:EvidenceHoldReason[];
}
export interface EvidenceDocumentResult{
  kind:EvidenceKind;documentId:string;
  /** 판정에 쓴 최신 판본. 기준 시각 이전 판본이 없으면 null. */
  revisionId:string|null;
  disposition:EvidenceDisposition;
  /** 최신 판본에 의해 대체된(정정 전) 판본 ID, 오래된 순. */
  supersededRevisionIds:string[];
  /** 기준 시각 이후라서 이번 인덱스에서 고려하지 않은 판본 ID. */
  futureRevisionIds:string[];
}
export interface EvidenceIndex{
  snapshotId:string;indexRevision:string;asOf:string;
  provenance:EvidenceManifest['provenance'];
  /** READY: 매니페스트의 모든 문서가 색인되고 HOLD 문단 없음. PARTIAL: 일부 제외·보류가 있음. */
  status:'READY'|'PARTIAL';
  entries:EvidenceIndexEntry[];
  documents:EvidenceDocumentResult[];
}
export interface EvidenceIndexInput{manifest:unknown;revisions:readonly unknown[];asOf:string;}

/** 매니페스트 빌더(#42)가 같은 값을 계산할 수 있도록 공개하는 판본 내용 해시. */
export function evidenceContentSha256(revision:EvidenceRevision):string{
  return sha256Hex(canonicalJson(revision));
}

/** 기존 FAQ 문서를 근거 판본으로 옮긴다. FAQ 문서에는 정정·취소 상태가 없으므로 PUBLISHED로 둔다. */
export function evidenceRevisionFromFaq(doc:FaqDocument):EvidenceRevision{
  return EvidenceRevisionSchema.parse({
    kind:'FAQ',documentId:doc.documentId,revisionId:doc.revisionId,title:doc.title,sourceUrl:doc.sourceUrl,
    publishedAt:doc.publishedAt,verifiedAt:doc.verifiedAt,state:'PUBLISHED',
    effectiveFrom:doc.effectiveFrom,effectiveUntil:doc.effectiveUntil,
    rights:doc.rights,provenance:doc.provenance,
    paragraphs:doc.paragraphs.map(p=>({id:p.id,text:p.text,...(p.publicContacts?{publicContacts:p.publicContacts}:{})})),
  });
}

/** 게시 시각 다음 판본 ID(숫자 인식: r9 < r10) 순. 0은 같은 판본 위치다. */
function revisionOrder(a:EvidenceRevision,b:EvidenceRevision):number{
  const ta=Date.parse(a.publishedAt),tb=Date.parse(b.publishedAt);
  return ta!==tb?Math.sign(ta-tb):Math.sign(a.revisionId.localeCompare(b.revisionId,'en',{numeric:true}));
}
const docKey=(kind:EvidenceKind,documentId:string)=>kind+'\u0000'+documentId;
const byText=(a:string,b:string)=>a<b?-1:a>b?1:0;

export function buildEvidenceIndex(input:EvidenceIndexInput):EvidenceIndex{
  const time=Date.parse(input.asOf);
  if(!Number.isFinite(time))throw new RangeError('Invalid asOf');
  const manifest=EvidenceManifestSchema.parse(input.manifest);
  const revisions=EvidenceRevisionSchema.array().max(10000).parse(input.revisions);
  if(revisions.some(r=>r.provenance!==manifest.provenance))
    throw new RangeError('Mixed synthetic and real evidence');

  const manifestByDoc=new Map(manifest.entries.map(e=>[docKey(e.kind,e.documentId),e]));
  const revisionsByDoc=new Map<string,EvidenceRevision[]>();
  for(const r of revisions){
    const key=docKey(r.kind,r.documentId);
    const rows=revisionsByDoc.get(key)??[];rows.push(r);revisionsByDoc.set(key,rows);
  }
  const allKeys=new Set([...revisionsByDoc.keys(),...manifestByDoc.keys()]);

  const documents:EvidenceDocumentResult[]=[];
  const heads=new Map<string,EvidenceRevision>();
  for(const key of allKeys){
    const [kind,documentId]=key.split('\u0000') as [EvidenceKind,string];
    const rows=revisionsByDoc.get(key)??[];
    const visible=rows.filter(r=>Date.parse(r.publishedAt)<=time&&Date.parse(r.verifiedAt)<=time);
    const futureRevisionIds=[...new Set(rows.filter(r=>!visible.includes(r)).map(r=>r.revisionId))].sort(byText);
    const result=(revisionId:string|null,disposition:EvidenceDisposition,superseded:string[]=[])=>
      documents.push({kind,documentId,revisionId,disposition,supersededRevisionIds:superseded,futureRevisionIds});

    if(!visible.length){
      // 판본이 아예 없는데 매니페스트만 있으면 스냅샷과 입력이 어긋난 것이다.
      result(null,rows.length?'AFTER_AS_OF':'MANIFEST_MISMATCH');
      continue;
    }
    let head=visible[0]!;
    for(const r of visible)if(revisionOrder(r,head)>0)head=r;
    // 같은 판본 ID 또는 같은 판본 위치(r1/r01 등)의 복사본은 내용이 완전히 같아야 한다.
    const copies=visible.filter(r=>r.revisionId===head.revisionId||revisionOrder(r,head)===0);
    const superseded=[...new Set(visible.filter(r=>!copies.includes(r)).sort(revisionOrder).map(r=>r.revisionId))];
    if(new Set(copies.map(canonicalJson)).size>1){result(head.revisionId,'REVISION_CONFLICT',superseded);continue;}
    if(head.rights!=='APPROVED'){result(head.revisionId,'RIGHTS_REVOKED',superseded);continue;}
    if(head.state==='CANCELLED'){result(head.revisionId,'CANCELLED',superseded);continue;}
    if(head.effectiveFrom&&!exchangePolicyInEffect({effectiveFrom:head.effectiveFrom,effectiveUntil:head.effectiveUntil},input.asOf)){
      result(head.revisionId,'NOT_IN_EFFECT',superseded);continue;
    }
    if(!head.effectiveFrom&&head.effectiveUntil
      &&time>=Date.parse(head.effectiveUntil+'T00:00:00+09:00')+86400000){
      result(head.revisionId,'NOT_IN_EFFECT',superseded);continue;
    }
    const listed=manifestByDoc.get(key);
    if(!listed){result(head.revisionId,'NOT_IN_MANIFEST',superseded);continue;}
    if(listed.revisionId!==head.revisionId||listed.contentSha256!==evidenceContentSha256(head)){
      result(head.revisionId,'MANIFEST_MISMATCH',superseded);continue;
    }
    heads.set(key,head);
    result(head.revisionId,'INDEXED',superseded);
  }

  const entries:EvidenceIndexEntry[]=[];
  const seen=new Set<string>();
  for(const head of heads.values()){
    for(const p of head.paragraphs){
      const citationId=[head.kind,head.documentId,head.revisionId,p.id].join(':');
      if(seen.has(citationId))throw new RangeError('Ambiguous evidence citation ID: '+citationId);
      seen.add(citationId);
      const refs=p.refs??[];
      const holdReasons=new Set<EvidenceHoldReason>();
      for(const ref of refs){
        const target=heads.get(docKey(ref.kind,ref.documentId));
        if(!target)holdReasons.add('REF_NOT_INDEXED');
        else if(target.revisionId!==ref.revisionId)holdReasons.add('REF_REVISION_MISMATCH');
      }
      entries.push({
        citationId,snapshotId:manifest.snapshotId,indexRevision:manifest.indexRevision,
        kind:head.kind,documentId:head.documentId,revisionId:head.revisionId,paragraphId:p.id,
        title:head.title,text:p.text,sourceUrl:head.sourceUrl,publishedAt:head.publishedAt,verifiedAt:head.verifiedAt,
        revisionState:head.state==='CORRECTED'?'CORRECTED':'PUBLISHED',
        conditions:head.conditions??null,provenance:head.provenance,
        ...(p.publicContacts?{publicContacts:[...p.publicContacts]}:{}),
        refs:refs.map(r=>({...r})),
        status:holdReasons.size?'HOLD':'READY',
        holdReasons:[...holdReasons].sort(byText),
      });
    }
  }
  entries.sort((a,b)=>byText(a.citationId,b.citationId));
  documents.sort((a,b)=>byText(a.kind,b.kind)||byText(a.documentId,b.documentId));
  const complete=[...manifestByDoc.keys()].every(k=>heads.has(k))&&entries.every(e=>e.status==='READY');
  return {
    snapshotId:manifest.snapshotId,indexRevision:manifest.indexRevision,asOf:input.asOf,
    provenance:manifest.provenance,status:complete?'READY':'PARTIAL',entries,documents,
  };
}
