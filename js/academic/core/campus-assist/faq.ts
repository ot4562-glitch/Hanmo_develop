import {FaqCandidateSchema,FaqDocumentSchema,type FaqCandidate,type FaqDocument} from '../../contracts/campus-assist/index.js';
import {exchangePolicyInEffect} from './exchange.js';
import {checkFaqCandidate} from './faq-guard.js';
import {searchFaqParagraphs} from './faq-search.js';

export interface FaqEvidence {
  citationId:string;documentId:string;revisionId:string;title:string;sourceUrl:string;
  verifiedAt:string;text:string;provenance:FaqDocument['provenance'];
  publicContacts?:string[];
}
/**
 * 시각을 먼저 비교하고 그 다음 revisionId는 r9 다음 r10이 오도록 숫자를 인식해 비교한다.
 * 문자열 순서만으로 시간대 오프셋을 비교하지 않는다. 0은 같은 판본 위치다.
 */
function revisionOrder(a:FaqDocument,b:FaqDocument):number{
  const ta=Date.parse(a.publishedAt),tb=Date.parse(b.publishedAt);
  return ta!==tb?Math.sign(ta-tb):Math.sign(a.revisionId.localeCompare(b.revisionId,'en',{numeric:true}));
}
/** 객체 키 순서와 관계없이 복사본의 실제 내용만 비교하는 JSON 표현이다. */
function canonical(value:unknown):string{
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')
    return '{'+Object.keys(value).filter(k=>(value as Record<string,unknown>)[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
  return JSON.stringify(value)??'null';
}
/**
 * asOf까지 공개·검증된 문서 ID별 최신 판본을 선택한다.
 * 동일한 최신 판본 위치의 복사본이 권리·문단·날짜·URL 중 하나라도 다르면 문서 전체를 격리한다.
 * 입력 순서에 따라 승인 또는 철회·차단판이 살아남아서는 안 되며 이전 승인판으로 대체하지 않는다.
 * 내용이 완전히 같은 복사본만 하나로 합친다.
 */
function documentHeadsAt(docs:readonly FaqDocument[],time:number):Map<string,FaqDocument>{
  const eligible=new Map<string,FaqDocument[]>();
  for(const doc of docs){
    if(Date.parse(doc.publishedAt)>time||Date.parse(doc.verifiedAt)>time)continue;
    const copies=eligible.get(doc.documentId)??[];
    copies.push(doc);eligible.set(doc.documentId,copies);
  }
  const heads=new Map<string,FaqDocument>();
  for(const [documentId,rows] of eligible){
    let head=rows[0]!;
    for(const doc of rows)if(revisionOrder(doc,head)>0)head=doc;
    // 판본 ID는 식별자이므로 같은 ID인데 게시 시각이 다르면 새 판본이 아닌 충돌 복사본이다.
    // r1/r01처럼 숫자 순서 비교에서 충돌하는 경우도 격리한다.
    const copies=rows.filter(doc=>doc.revisionId===head.revisionId
      ||revisionOrder(doc,head)===0);
    if(new Set(copies.map(canonical)).size===1)heads.set(documentId,head);
  }
  return heads;
}
/**
 * 더 최신 문서 판본이 철회·차단·만료되면 문서 전체를 격리한다.
 * 적용일은 한국시간 달력 날짜로 해석하고 asOf 절대 시각과 비교한다(#365/#385).
 * 인용 ID에는 문서 ID를 포함해 서로 다른 문서의 r1·p1이 충돌하지 않게 한다. 문단 ID 중복 등 남은 충돌도 차단한다.
 */
export function retrieveFaqEvidence(question:string,raw:readonly FaqDocument[],asOf:string,limit=6):FaqEvidence[]{
  const time=Date.parse(asOf);
  if(!Number.isFinite(time)||question.trim().length<2||question.length>500)throw new RangeError('Invalid FAQ query');
  if(!Number.isInteger(limit)||limit<1||limit>8)throw new RangeError('Invalid retrieval limit');
  const docs=FaqDocumentSchema.array().max(10000).parse(raw);
  const heads=documentHeadsAt(docs,time);
  const paragraphs=new Map<string,FaqEvidence>();
  for(const doc of heads.values()){
    if(doc.rights!=='APPROVED'||!exchangePolicyInEffect(doc,asOf))continue;
    for(const p of doc.paragraphs){
      const citationId=doc.documentId+':'+doc.revisionId+':'+p.id;
      if(paragraphs.has(citationId)||citationId.length>120)throw new RangeError('Ambiguous FAQ citation ID');
      paragraphs.set(citationId,{citationId,documentId:doc.documentId,revisionId:doc.revisionId,title:doc.title,
        sourceUrl:doc.sourceUrl,verifiedAt:doc.verifiedAt,text:p.text,provenance:doc.provenance,
        ...(p.publicContacts?{publicContacts:p.publicContacts}:{}),
      });
    }
  }
  const hits=searchFaqParagraphs(question,[...paragraphs.values()].map(e=>({key:e.citationId,title:e.title,text:e.text})),{limit});
  const evidence=hits.map(h=>paragraphs.get(h.key)!);
  // 승인된 학교 출처와 합성 예시가 혼합되면 답변 후보가 아니라 구성 오류로 처리한다.
  if(new Set(evidence.map(e=>e.provenance)).size>1)throw new RangeError('Mixed synthetic and real FAQ evidence');
  return evidence;
}
/** 이것은 공식 인증 답변이 아닌 후보일 뿐이다. 현재 유효하고 출처와 연결된 ID·인용문만 허용한다. */
export function validateFaqCandidate(raw:unknown,evidence:readonly FaqEvidence[]):FaqCandidate{
  const candidate=FaqCandidateSchema.parse(raw);
  const reasons=checkFaqCandidate(candidate,evidence);
  if(reasons.length)throw new RangeError('FAQ candidate rejected: '+reasons.join(','));
  return candidate;
}
