// @ts-check
/**
 * #54 FAQ 근거 검증·답변 보류를 학생 검색 결과에 연결하는 순수 코어. 학생 화면에는 아직 연결하지 않는다.
 *
 * 입력: #53 searchAcademic 결과(원 질문 포함), 공식 상담 경로 목록.
 * 출력: 추출형 답변 상태(SUPPORTED/NEEDS_CONFIRMATION/ABSTAIN), 근거 문단과 주의 표시, 공식 상담 경로.
 *
 * 원칙
 * - 답변 문장을 새로 만들지 않는다. 근거 문단을 그대로 보여 주는 추출형이다.
 * - 개인 자격·합격·졸업 가능 여부는 판정하지 않는다. 그런 질문은 근거가 있어도 확인 필요로 둔다.
 * - 질문이 날짜·숫자를 묻는데 근거 문단에 숫자가 없으면 지어내지 않고 확인 필요로 둔다.
 * - 상담 부서·연락처는 입력으로 받은 공식 경로에서만 고르고 새로 만들지 않는다.
 * - 생성형 후보 답변이 들어오면 기존 faq-guard 검사와 인용 범위 검사를 통과해야 한다.
 */
/** @typedef {import("./academic-search.js").AcademicSearchResult} AcademicSearchResult */
/** @typedef {import("./academic-search.js").EvidenceHit} EvidenceHit */
/** @typedef {import("./faq-guard.js").FaqRejectReason} FaqRejectReason */
/** @typedef {'COURSE'|'MAJOR'|'GRADUATION'|'STATUS'|'GRADE'|'SCHOLARSHIP'|'EXCHANGE'|'GENERAL'} CounselTopic */
/** @typedef {{topic:CounselTopic,campus:'SEOUL'|'GLOBAL'|'BOTH',office:string,url:string,provenance:'SYNTHETIC'|'REAL_APPROVED'}} CounselRoute */
/** @typedef {'NEGATION_OR_EXCEPTION'|'CORRECTED_REVISION'|'MATCHED_BY_CORRECTION'|'SCOPE_UNKNOWN'} EvidenceCaution */
/** @typedef {{citationId:string,domain:'NOTICE'|'FAQ',documentId:string,revisionId:string,paragraphId:string,title:string,text:string,sourceUrl:string,verifiedAt:string,applicability:'YES'|'UNKNOWN',cautions:EvidenceCaution[]}} AnswerEvidence */
/** @typedef {'DATA_NOT_CONNECTED'|'NO_EVIDENCE'|'PERSONAL_DECISION_NOT_PROVIDED'|'SCOPE_UNKNOWN'|'NUMBER_OR_DATE_NOT_IN_EVIDENCE'|'NO_OFFICIAL_ROUTE'} AnswerReason */
/** @typedef {{disposition:'SUPPORTED'|'NEEDS_CONFIRMATION'|'ABSTAIN',reasons:AnswerReason[],evidence:AnswerEvidence[],counseling:CounselRoute[],topic:CounselTopic,personalDecision:false}} FaqAnswer */
/** @typedef {{search:AcademicSearchResult,routes:readonly CounselRoute[],campus?:'SEOUL'|'GLOBAL'}} FaqAnswerInput */
import {z} from 'zod';
import {FaqCandidateSchema} from '../../contracts/campus-assist/index.js';
import {checkFaqCandidate} from './faq-guard.js';

const CounselRouteSchema=z.strictObject({
  topic:z.enum(['COURSE','MAJOR','GRADUATION','STATUS','GRADE','SCHOLARSHIP','EXCHANGE','GENERAL']),
  campus:z.enum(['SEOUL','GLOBAL','BOTH']),
  office:z.string().trim().min(2).max(80),
  url:z.url().startsWith('https://').max(1000),
  provenance:z.enum(['SYNTHETIC','REAL_APPROVED']),
});

/** 질문자 본인의 자격·결과를 묻는 표현. 일반 규칙 질문('누가 지원할 수 있나요')과 구별한다. */
// 대명사는 독립된 단어일 때만 본다('이중전공'의 '전'을 '전(저는)'으로 읽지 않게).
const PERSONAL=/(?:^|\s)(?:제가|저는|저도|저|내가|나는|나도|전|난)\s+[^?]*?(?:가능|될까|되나요|돼요|되요|대상|자격|받을\s*수|할\s*수|붙을|합격|졸업할)/;
/** 날짜·기한·수량을 묻는 질문. 근거에 숫자가 없으면 답을 지어내지 않는다. */
const ASKS_NUMBER=/언제|며칠|몇|얼마|기간|마감|날짜|기한|학점\s*이상|이상이어야/;
const HAS_NUMBER=/\d/;
const NEGATION=/제외|불가|않|없(?!이)|금지|(?:^|\s)단[,\s]|다만/;
/** @type {[RegExp,CounselTopic][]} */
const TOPICS=[
  [/수강|강의|과목|정정|취소|계절/, 'COURSE'],[/이중전공|부전공|복전|전공/, 'MAJOR'],
  [/졸업|논문|외국어\s*인증|졸시/, 'GRADUATION'],[/휴학|복학|등록|자퇴|학적/, 'STATUS'],
  [/성적|학점\s*포기|재수강|이의/, 'GRADE'],[/장학/, 'SCHOLARSHIP'],[/교환|파견|유학/, 'EXCHANGE'],
];

/**
 * 질문 주제에 맞는 공식 상담 경로를 고른다. 학생 캠퍼스를 모르면 두 캠퍼스 경로를 모두 돌려준다.
 * @param {CounselTopic} topic 질문 주제
 * @param {'SEOUL'|'GLOBAL'|undefined} campus 학생 캠퍼스
 * @param {readonly CounselRoute[]} routes 공식 상담 경로 목록
 * @returns {CounselRoute[]}
 */
function pickRoutes(topic,campus,routes){
  /** @param {CounselRoute} r */
  const campusOk=r=>!campus||r.campus==='BOTH'||r.campus===campus;
  const exact=routes.filter(r=>r.topic===topic&&campusOk(r));
  const chosen=exact.length?exact:routes.filter(r=>r.topic==='GENERAL'&&campusOk(r));
  return [...chosen].sort((a,b)=>a.office<b.office?-1:a.office>b.office?1:0);
}

/**
 * 검색 결과를 학생용 FAQ 답변 상태로 바꾼다. 근거 문단은 최대 3건이며, 주의 표시는 문단과 함께 보여 줘야 한다.
 * @param {FaqAnswerInput} input #53 검색 결과(원 질문 포함)와 공식 상담 경로
 * @returns {FaqAnswer}
 */
export function buildFaqAnswer(input){
  const routes=CounselRouteSchema.array().max(200).parse(input.routes);
  const {search}=input;
  const sourceProvenance=new Set([...search.groups.FAQ,...search.groups.NOTICE].map(h=>h.entry.provenance));
  if(routes.length&&sourceProvenance.size&&routes.some(r=>!sourceProvenance.has(r.provenance)))
    throw new RangeError('Mixed synthetic and real FAQ sources');
  const question=search.query.normalized;
  const topic=TOPICS.find(([re])=>re.test(question))?.[1]??'GENERAL';
  const counseling=pickRoutes(topic,input.campus,routes);
  /** @type {Set<AnswerReason>} */
  const reasons=new Set();
  if(!counseling.length)reasons.add('NO_OFFICIAL_ROUTE');

  // FAQ를 먼저, 그다음 공지를 놓는다. 둘 다 #53 안전 필터를 통과한 결과(NO·HOLD 제외)만 들어온다.
  const hits=[...search.groups.FAQ,...search.groups.NOTICE].slice(0,3);
  if(search.status.FAQ==='NOT_CONNECTED'&&search.status.NOTICE==='NOT_CONNECTED'){
    reasons.add('DATA_NOT_CONNECTED');
    return {disposition:'ABSTAIN',reasons:[...reasons].sort(),evidence:[],counseling,topic,personalDecision:false};
  }
  if(!hits.length){
    reasons.add('NO_EVIDENCE');
    return {disposition:'ABSTAIN',reasons:[...reasons].sort(),evidence:[],counseling,topic,personalDecision:false};
  }
  /** @type {AnswerEvidence[]} */
  const evidence=hits.map(h=>{
    /** @type {EvidenceCaution[]} */
    const cautions=[];
    if(NEGATION.test(h.entry.text))cautions.push('NEGATION_OR_EXCEPTION');
    if(h.entry.revisionState==='CORRECTED')cautions.push('CORRECTED_REVISION');
    if(h.matchedVia==='VARIANT')cautions.push('MATCHED_BY_CORRECTION');
    if(h.applicability==='UNKNOWN')cautions.push('SCOPE_UNKNOWN');
    return {citationId:h.entry.citationId,domain:h.domain,documentId:h.entry.documentId,revisionId:h.entry.revisionId,
      paragraphId:h.entry.paragraphId,title:h.entry.title,text:h.entry.text,sourceUrl:h.entry.sourceUrl,
      verifiedAt:h.entry.verifiedAt,applicability:/** @type {'YES'|'UNKNOWN'} */(h.applicability),cautions};
  });
  if(PERSONAL.test(question))reasons.add('PERSONAL_DECISION_NOT_PROVIDED');
  if(evidence[0]?.applicability==='UNKNOWN')reasons.add('SCOPE_UNKNOWN');
  if(ASKS_NUMBER.test(question)&&!evidence.some(e=>HAS_NUMBER.test(e.text)))reasons.add('NUMBER_OR_DATE_NOT_IN_EVIDENCE');
  // 상담 경로가 없다는 사실은 근거 문단 자체의 신뢰도를 낮추지 않으므로 상태 결정에서 뺀다.
  const blocking=[...reasons].filter(r=>r!=='NO_OFFICIAL_ROUTE');
  return {disposition:blocking.length?'NEEDS_CONFIRMATION':'SUPPORTED',reasons:[...reasons].sort(),evidence,counseling,topic,
    personalDecision:false};
}

/**
 * 생성형 후보 답변을 쓰는 경우의 검사. 답변 상태가 ABSTAIN이면 어떤 후보도 허용하지 않는다.
 * 인용은 이 답변의 근거 문단 안에서만 가능하며, 나머지는 기존 faq-guard 검사를 그대로 적용한다.
 * @param {unknown} raw 후보 답변
 * @param {FaqAnswer} answer buildFaqAnswer 결과
 * @returns {(FaqRejectReason|'ANSWER_ABSTAINED')[]} 빈 배열이면 통과
 */
export function checkFaqAnswerCandidate(raw,answer){
  const candidate=FaqCandidateSchema.parse(raw);
  if(answer.disposition==='ABSTAIN')return ['ANSWER_ABSTAINED'];
  return checkFaqCandidate(candidate,answer.evidence.map(e=>({citationId:e.citationId,title:e.title,text:e.text})));
}
