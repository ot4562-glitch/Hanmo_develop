// @ts-check
/** @typedef {import("../../contracts/campus-assist/index.js").EvidenceRevision} EvidenceRevision */
/** @typedef {import("./faq-answer.js").CounselRoute} CounselRoute */
import {describe,expect,it} from 'vitest';
import {buildEvidenceIndex,evidenceContentSha256} from './evidence-index.js';
import {searchAcademic} from './academic-search.js';
import {buildFaqAnswer,checkFaqAnswerCandidate} from './faq-answer.js';

// 모든 문단·상담 경로는 SYNTHETIC 가상 자료다. 실제 학교 부서·연락처·규정이 아니다.
const AS_OF='2026-11-22T03:00:00Z';
/**
 * @param {'NOTICE'|'FAQ'} kind @param {string} id @param {string} title @param {string} text
 * @param {Partial<EvidenceRevision>} [patch]
 * @returns {EvidenceRevision}
 */
const rev=(kind,id,title,text,patch={})=>({kind,documentId:id,revisionId:'r1',title,sourceUrl:'https://example.org/synthetic/'+id,
  publishedAt:'2026-11-01T00:00:00+09:00',verifiedAt:'2026-11-02T00:00:00+09:00',state:'PUBLISHED',rights:'APPROVED',
  provenance:'SYNTHETIC',paragraphs:[{id:'p1',text}],...patch});
/** @param {EvidenceRevision[]} rows */
const index=rows=>buildEvidenceIndex({asOf:AS_OF,revisions:rows,manifest:{snapshotId:'SYN-S1',indexRevision:'i1',
  builtAt:'2026-11-20T00:00:00Z',provenance:'SYNTHETIC',
  entries:rows.map(r=>({kind:r.kind,documentId:r.documentId,revisionId:r.revisionId,contentSha256:evidenceContentSha256(r)}))}}).entries;
const ENTRIES=index([
  rev('FAQ','F-LEAVE','가상 휴학 신청 방법','가상 휴학 신청은 가상 포털에서 학기 시작 전까지 합니다.',{conditions:{campuses:['SEOUL','GLOBAL']}}),
  rev('FAQ','F-DM','가상 이중전공 지원 자격','가상 이중전공은 가상 2학년 이상 재학생이 지원할 수 있습니다. 단, 휴학생은 제외합니다.',
    {conditions:{admissionYears:{from:2020}}}),
  rev('FAQ','F-GRAD','가상 졸업논문 제출 기간','가상 졸업논문 제출 기간은 학과 공지를 따릅니다.',{conditions:{campuses:['SEOUL']}}),
  rev('NOTICE','N-REG','가상 수강신청 일정 안내','가상 수강신청 기간은 2027년 2월 8일부터 2월 12일까지입니다.',
    {state:'CORRECTED',conditions:{campuses:['SEOUL']}}),
]);
const NOTICES=ENTRIES.filter(e=>e.kind==='NOTICE'),FAQS=ENTRIES.filter(e=>e.kind==='FAQ');
/** @type {CounselRoute[]} */
const ROUTES=[
  {topic:'STATUS',campus:'SEOUL',office:'가상 서울 학사팀',url:'https://example.org/synthetic/seoul-status',provenance:'SYNTHETIC'},
  {topic:'STATUS',campus:'GLOBAL',office:'가상 글로벌 학사팀',url:'https://example.org/synthetic/global-status',provenance:'SYNTHETIC'},
  {topic:'GENERAL',campus:'BOTH',office:'가상 학사 종합 안내',url:'https://example.org/synthetic/general',provenance:'SYNTHETIC'},
];
/**
 * @param {string} q
 * @param {{campus?:'SEOUL'|'GLOBAL',cohort?:number}} [ctx]
 * @param {{notices?:typeof NOTICES,faqs?:typeof FAQS}} [data]
 */
const ask=(q,ctx={},data={notices:NOTICES,faqs:FAQS})=>buildFaqAnswer({
  search:searchAcademic({query:q,...data,context:ctx}),routes:ROUTES,...(ctx.campus?{campus:ctx.campus}:{})});

describe('#54 supported answers',()=>{
  it('returns the evidence paragraph with source, revision and review time when scope is confirmed',()=>{
    const a=ask('휴학 신청 방법',{campus:'SEOUL'});
    expect(a.disposition).toBe('SUPPORTED');
    expect(a.evidence[0]).toMatchObject({citationId:'FAQ:F-LEAVE:r1:p1',revisionId:'r1',sourceUrl:'https://example.org/synthetic/F-LEAVE',
      verifiedAt:'2026-11-02T00:00:00+09:00',applicability:'YES'});
    expect(a.personalDecision).toBe(false);
  });
  it('picks the official route for the topic and campus without inventing contacts',()=>{
    expect(ask('휴학 신청 방법',{campus:'GLOBAL'}).counseling.map(r=>r.office)).toEqual(['가상 글로벌 학사팀']);
    expect(ask('휴학 신청 방법').counseling.map(r=>r.office)).toEqual(['가상 글로벌 학사팀','가상 서울 학사팀']);
  });
  it('falls back to the general route when no topic route exists',()=>{
    expect(ask('이중전공 지원 자격',{cohort:2023}).counseling.map(r=>r.office)).toEqual(['가상 학사 종합 안내']);
  });
});

describe('#54 confirmation needed instead of an answer',()=>{
  it('a personal eligibility question never gets a personal verdict',()=>{
    const a=ask('제가 이중전공 지원 자격이 되나요',{cohort:2023});
    expect(a.disposition).toBe('NEEDS_CONFIRMATION');
    expect(a.reasons).toContain('PERSONAL_DECISION_NOT_PROVIDED');
    expect(a.evidence[0]?.citationId).toBe('FAQ:F-DM:r1:p1');
  });
  it('a general rule question (who can apply) is not treated as personal',()=>{
    expect(ask('이중전공 지원 자격',{cohort:2023}).reasons).not.toContain('PERSONAL_DECISION_NOT_PROVIDED');
  });
  it('unknown scope (campus not given) needs confirmation',()=>{
    const a=ask('졸업논문 제출 기간');
    expect(a.reasons).toContain('SCOPE_UNKNOWN');
    expect(a.evidence[0]?.cautions).toContain('SCOPE_UNKNOWN');
  });
  it('a date question whose evidence has no date is not answered with a made-up date',()=>{
    const a=ask('졸업논문 제출 기간 언제예요',{campus:'SEOUL'});
    expect(a.disposition).toBe('NEEDS_CONFIRMATION');
    expect(a.reasons).toContain('NUMBER_OR_DATE_NOT_IN_EVIDENCE');
  });
  it('a date question whose evidence has a date is supported, with the corrected-revision caution',()=>{
    const a=ask('수강신청 기간 언제',{campus:'SEOUL'});
    expect(a.disposition).toBe('SUPPORTED');
    expect(a.evidence.find(e=>e.domain==='NOTICE')?.cautions).toContain('CORRECTED_REVISION');
  });
  it('a negation or exception in the evidence is flagged so the full paragraph must be shown',()=>{
    expect(ask('이중전공 지원 자격',{cohort:2023}).evidence[0]?.cautions).toContain('NEGATION_OR_EXCEPTION');
  });
  it('a match found only through a typo correction is flagged',()=>{
    // '휴학싱청'은 기존 2그램 허용 범위를 넘는 오타라 교정 변형으로만 찾힌다.
    expect(ask('휴학싱청 방법',{campus:'SEOUL'}).evidence[0]?.cautions).toContain('MATCHED_BY_CORRECTION');
  });
  it('a personal question with a standalone pronoun is detected',()=>{
    expect(ask('전 휴학 신청 가능한가요',{campus:'SEOUL'}).reasons).toContain('PERSONAL_DECISION_NOT_PROVIDED');
  });
});

describe('#54 abstain',()=>{
  it('no evidence → abstain with the official route',()=>{
    const a=ask('기숙사 식단표',{campus:'SEOUL'});
    expect(a).toMatchObject({disposition:'ABSTAIN',reasons:['NO_EVIDENCE'],evidence:[]});
    expect(a.counseling.map(r=>r.office)).toEqual(['가상 학사 종합 안내']);
  });
  it('no data connected → abstain, distinct from no evidence',()=>{
    expect(ask('휴학 신청',{},{})).toMatchObject({disposition:'ABSTAIN',reasons:['DATA_NOT_CONNECTED']});
  });
  it('out-of-scope evidence (other cohort) is never used as an answer',()=>{
    const a=ask('이중전공 지원 자격',{cohort:2019});
    expect(a.evidence.map(e=>e.documentId)).not.toContain('F-DM');
  });
  it('held (HOLD) evidence is never used as an answer',()=>{
    const notice=rev('NOTICE','N-X','가상 복학 신청 공지','가상 복학 신청 공지 본문입니다.',{revisionId:'r2'});
    const faq=rev('FAQ','F-X','가상 복학 신청 방법','가상 복학 신청은 공지를 따릅니다.',
      {paragraphs:[{id:'p1',text:'가상 복학 신청은 공지를 따릅니다.',refs:[{kind:'NOTICE',documentId:'N-X',revisionId:'r1'}]}]});
    const entries=index([notice,faq]);
    const a=ask('복학 신청 방법',{},{faqs:entries.filter(e=>e.kind==='FAQ')});
    expect(a.disposition).toBe('ABSTAIN');
  });
  it('reports a missing official route without lowering the evidence status',()=>{
    const a=buildFaqAnswer({search:searchAcademic({query:'휴학 신청 방법',faqs:FAQS,context:{campus:'SEOUL'}}),routes:[],campus:'SEOUL'});
    expect(a).toMatchObject({disposition:'SUPPORTED',reasons:['NO_OFFICIAL_ROUTE'],counseling:[]});
  });
});

describe('#54 generated candidate answers',()=>{
  const answer=ask('휴학 신청 방법',{campus:'SEOUL'});
  const quote='가상 휴학 신청은 가상 포털에서 학기 시작 전까지 합니다.';
  it('a candidate quoting the evidence passes the guard',()=>{
    expect(checkFaqAnswerCandidate({answer:quote,citations:[{citationId:'FAQ:F-LEAVE:r1:p1',quote}],
      needsHumanConfirmation:true,suggestedLinks:[]},answer)).toEqual([]);
  });
  it('a candidate with a number not in the evidence, or citing outside the evidence, is rejected',()=>{
    expect(checkFaqAnswerCandidate({answer:'가상 휴학 신청은 3일 안에 포털에서 합니다.',citations:[{citationId:'FAQ:F-LEAVE:r1:p1',quote}],
      needsHumanConfirmation:true,suggestedLinks:[]},answer)).toContain('NUMBER_NOT_QUOTED');
    expect(checkFaqAnswerCandidate({answer:quote,citations:[{citationId:'FAQ:OTHER:r1:p1',quote}],
      needsHumanConfirmation:true,suggestedLinks:[]},answer)).toContain('UNKNOWN_CITATION');
  });
  it('no candidate is accepted for an abstained answer',()=>{
    expect(checkFaqAnswerCandidate({answer:quote,citations:[{citationId:'FAQ:F-LEAVE:r1:p1',quote}],
      needsHumanConfirmation:true,suggestedLinks:[]},ask('기숙사 식단표'))).toEqual(['ANSWER_ABSTAINED']);
  });
});

describe('#54 failures',()=>{
  it('rejects malformed routes and mixed provenance',()=>{
    const search=searchAcademic({query:'휴학 신청',faqs:FAQS});
    expect(()=>buildFaqAnswer({search,routes:[{...ROUTES[0],url:'http://example.org/x'}]})).toThrow();
    expect(()=>buildFaqAnswer({search,routes:[{...ROUTES[0],provenance:'REAL_APPROVED'}]})).toThrow(/Mixed/);
  });
});
