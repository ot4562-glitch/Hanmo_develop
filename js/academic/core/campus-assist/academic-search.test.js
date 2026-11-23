// @ts-check
/** @typedef {import("../../contracts/campus-assist/index.js").EvidenceRevision} EvidenceRevision */
/** @typedef {import("./academic-search.js").CourseItem} CourseItem */
import {describe,expect,it} from 'vitest';
import {buildEvidenceIndex,evidenceContentSha256} from './evidence-index.js';
import {classifySearchIntent,evidenceApplicability,normalizeAcademicQuery,searchAcademic} from './academic-search.js';

// 모든 공지·FAQ·강의는 SYNTHETIC 가상 자료다. 실제 학교 자료가 아니며 검색 품질 수치의 근거로 쓰지 않는다.
const AS_OF='2026-11-22T03:00:00Z';
/**
 * @param {'NOTICE'|'FAQ'} kind @param {string} id @param {string} title @param {string} text
 * @param {Partial<EvidenceRevision>} [patch]
 * @returns {EvidenceRevision}
 */
const rev=(kind,id,title,text,patch={})=>({kind,documentId:id,revisionId:'r1',title,sourceUrl:'https://example.org/synthetic/'+id,
  publishedAt:'2026-11-01T00:00:00+09:00',verifiedAt:'2026-11-02T00:00:00+09:00',state:'PUBLISHED',rights:'APPROVED',
  provenance:'SYNTHETIC',paragraphs:[{id:'p1',text}],...patch});
/** @param {EvidenceRevision[]} rows @param {EvidenceRevision[]} [listed] */
const index=(rows,listed=rows)=>buildEvidenceIndex({asOf:AS_OF,revisions:rows,manifest:{snapshotId:'SYN-S1',indexRevision:'i1',
  builtAt:'2026-11-20T00:00:00Z',provenance:'SYNTHETIC',
  entries:listed.map(r=>({kind:r.kind,documentId:r.documentId,revisionId:r.revisionId,contentSha256:evidenceContentSha256(r)}))}}).entries;
const ROWS=[
  rev('NOTICE','N-REG','가상 2027-1학기 수강신청 일정 안내','가상 수강신청 기간은 가상 2월 둘째 주입니다.'),
  rev('NOTICE','N-DM','가상 이중전공 신청 안내','가상 이중전공 신청은 가상 포털에서 접수합니다.',{conditions:{campuses:['SEOUL']}}),
  rev('NOTICE','N-GL','가상 글로벌캠퍼스 졸업시험 안내','가상 졸업시험은 가상 학과 사무실에서 접수합니다.',{conditions:{campuses:['GLOBAL']}}),
  rev('FAQ','F-LEAVE','가상 휴학 신청 방법','가상 휴학 신청은 가상 포털에서 학기 시작 전까지 합니다.'),
  rev('FAQ','F-DM','가상 이중전공 지원 자격','가상 이중전공은 가상 2학년 이상 재학생이 지원할 수 있습니다.',{conditions:{admissionYears:{from:2023}}}),
];
const ENTRIES=index(ROWS);
const NOTICES=ENTRIES.filter(e=>e.kind==='NOTICE'),FAQS=ENTRIES.filter(e=>e.kind==='FAQ');
/** @type {CourseItem[]} */
const COURSES=[
  {courseKey:'C1',code:'SYN101',section:'01',name:'가상 경제원론',instructors:['가상김교수'],campus:'SEOUL',term:'2027-1',sourceUrl:'https://example.org/synthetic/c1',provenance:'SYNTHETIC'},
  {courseKey:'C2',code:'SYN102',name:'가상 경제원론 연습',instructors:['가상이교수'],campus:'SEOUL',term:'2027-1',sourceUrl:'https://example.org/synthetic/c2',provenance:'SYNTHETIC'},
  {courseKey:'C3',code:'SYN201',name:'가상 미시경제',instructors:['가상김교수'],campus:'GLOBAL',term:'2027-1',sourceUrl:'https://example.org/synthetic/c3',provenance:'SYNTHETIC'},
];
/** @param {string} query @param {Partial<Parameters<typeof searchAcademic>[0]>} [patch] */
const search=(query,patch={})=>searchAcademic({query,notices:NOTICES,faqs:FAQS,courses:COURSES,...patch});
/** @param {{entry:{documentId:string}}[]} hits */
const docIds=hits=>hits.map(h=>h.entry.documentId);

describe('#53 query normalization',()=>{
  it('keeps the original query and adds typo, spacing and abbreviation variants',()=>{
    const q=normalizeAcademicQuery('  수강신철   일정 ');
    expect(q.original).toBe('  수강신철   일정 ');
    expect(q.variants[0]).toBe('수강신철 일정');
    expect(q.variants).toContain('수강신청 일정');
    expect(q.corrections).toContainEqual({from:'수강신철',to:'수강신청',kind:'TYPO'});
    expect(normalizeAcademicQuery('이중 전공 신청').corrections).toContainEqual({from:'이중 전공',to:'이중전공',kind:'SPACING'});
    expect(normalizeAcademicQuery('복전 신청').variants.some(v=>v.includes('이중전공'))).toBe(true);
  });
  it('NFKC-normalizes full-width characters',()=>{
    expect(normalizeAcademicQuery('ＳＹＮ１０１').normalized).toBe('syn101');
  });
  it('never corrects course codes, cohorts, dates or numbers',()=>{
    const q=normalizeAcademicQuery('SYN101 23학번 2026.3.2 3.5학점');
    expect(q.protectedTokens.map(t=>t.kind)).toEqual(['COURSE_CODE','COHORT','DATE','NUMBER']);
    for(const v of q.variants)expect(v).toContain('syn101');
    expect(q.corrections).toEqual([]);
  });
  it('does not misread a full word as an abbreviation (부전공 is not 부전+공)',()=>{
    expect(normalizeAcademicQuery('부전공 신청').corrections).toEqual([]);
  });
  it('rejects empty or oversized queries',()=>{
    expect(()=>normalizeAcademicQuery('   ')).toThrow(RangeError);
    expect(()=>normalizeAcademicQuery('가'.repeat(201))).toThrow(RangeError);
  });
});

describe('#53 search intent (domain only, not student applicability)',()=>{
  /** @param {string} s */
  const intent=s=>classifySearchIntent(normalizeAcademicQuery(s));
  it('a course code points to COURSE',()=>{
    expect(intent('SYN101').primary).toBe('COURSE');
  });
  it('schedule words point to NOTICE and how-to questions to FAQ',()=>{
    expect(intent('수강신청 일정 공지').primary).toBe('NOTICE');
    expect(intent('휴학은 어떻게 해요').primary).toBe('FAQ');
  });
  it('mixed or cue-less queries stay ambiguous and keep every domain',()=>{
    const mixed=intent('이중전공 신청 기간 어떻게 되나요');
    expect(mixed.ambiguous).toBe(true);
    expect(mixed.domains).toEqual(expect.arrayContaining(['NOTICE','FAQ']));
    const none=intent('이중전공');
    expect(none).toMatchObject({primary:'UNKNOWN',ambiguous:true});
    expect(none.domains).toEqual(['NOTICE','FAQ','COURSE']);
  });
});

describe('#53 applicability is separate from ranking',()=>{
  it('unstated conditions or missing student values are UNKNOWN, mismatches are NO',()=>{
    expect(evidenceApplicability(null,{campus:'SEOUL'})).toEqual({applicability:'UNKNOWN',reasons:['CONDITIONS_UNSTATED']});
    expect(evidenceApplicability({campuses:['SEOUL']},{})).toEqual({applicability:'UNKNOWN',reasons:['CAMPUS_NOT_GIVEN']});
    expect(evidenceApplicability({campuses:['SEOUL']},{campus:'GLOBAL'}).applicability).toBe('NO');
    expect(evidenceApplicability({admissionYears:{from:2023}},{cohort:2022}).applicability).toBe('NO');
    expect(evidenceApplicability({admissionYears:{from:2023},campuses:['SEOUL']},{cohort:2024,campus:'SEOUL'}).applicability).toBe('YES');
    expect(evidenceApplicability({majors:['ECON']},{majorIds:['LAW']}).applicability).toBe('NO');
  });
});

describe('#53 search and ranking',()=>{
  it('finds a notice from a one-letter typo (the bigram baseline already tolerates it) and records the correction',()=>{
    const r=search('수강신철 일정');
    expect(docIds(r.groups.NOTICE)[0]).toBe('N-REG');
    expect(r.query.corrections[0]?.to).toBe('수강신청');
  });
  it('an abbreviation found only through the expanded variant is marked VARIANT',()=>{
    const r=search('졸시 접수');
    expect(r.groups.NOTICE.find(h=>h.entry.documentId==='N-GL')?.matchedVia).toBe('VARIANT');
  });
  it('finds an abbreviation query (복전) in both notices and FAQs',()=>{
    const r=search('복전 신청');
    expect(docIds(r.groups.NOTICE)).toContain('N-DM');
    expect(docIds(r.groups.FAQ)).toContain('F-DM');
  });
  it('an original-query match is reported as ORIGINAL',()=>{
    expect(search('휴학 신청').groups.FAQ[0]).toMatchObject({matchedVia:'ORIGINAL'});
  });
  it('course ranking: exact code beats similar titles, and different codes are not merged',()=>{
    const r=search('SYN101 경제원론');
    expect(r.groups.COURSE.map(h=>[h.key,h.tier])).toEqual([['C1',3],['C2',2]]);
    const byName=search('경제원론');
    expect(byName.groups.COURSE.map(h=>h.key)).toEqual(['C1','C2']);
    expect(byName.groups.COURSE.every(h=>h.tier===2)).toBe(true);
  });
  it('course search by instructor display name',()=>{
    expect(search('가상김교수').groups.COURSE.map(h=>h.key)).toEqual(['C1','C3']);
  });
  it('is deterministic for the same input',()=>{
    expect(JSON.stringify(search('복전 신청'))).toBe(JSON.stringify(search('복전 신청')));
  });
});

describe('#53 safety filter cannot be bypassed by ranking',()=>{
  it('a held (HOLD) paragraph is never ranked, even with a perfect title match',()=>{
    const notice=rev('NOTICE','N-X','가상 휴학 신청 공지','가상 휴학 신청 공지 본문입니다.',{revisionId:'r2'});
    const faq=rev('FAQ','F-X','가상 휴학 신청 공지','가상 휴학 신청 공지는 공지를 따릅니다.',
      {paragraphs:[{id:'p1',text:'가상 휴학 신청 공지는 공지를 따릅니다.',refs:[{kind:'NOTICE',documentId:'N-X',revisionId:'r1'}]}]});
    const entries=index([notice,faq]);
    const r=searchAcademic({query:'가상 휴학 신청 공지',notices:entries.filter(e=>e.kind==='NOTICE'),faqs:entries.filter(e=>e.kind==='FAQ')});
    expect(docIds(r.groups.FAQ)).toEqual([]);
    expect(r.excluded.held).toEqual(['FAQ:F-X:r1:p1']);
  });
  it('a paragraph for another campus is excluded for a student who set a campus, kept as UNKNOWN when campus is unset',()=>{
    const seoul=search('졸업시험 접수',{context:{campus:'SEOUL'}});
    expect(docIds(seoul.groups.NOTICE)).not.toContain('N-GL');
    expect(seoul.excluded.outOfScope).toContain('NOTICE:N-GL:r1:p1');
    const unset=search('졸업시험 접수');
    expect(unset.groups.NOTICE.find(h=>h.entry.documentId==='N-GL')).toMatchObject({applicability:'UNKNOWN',unknownReasons:['CAMPUS_NOT_GIVEN']});
  });
  it('courses of another campus are excluded when the student campus is set',()=>{
    expect(search('가상김교수',{context:{campus:'SEOUL'}}).groups.COURSE.map(h=>h.key)).toEqual(['C1']);
  });
  it('mixed synthetic and real sources fail closed',()=>{
    /** @type {CourseItem} */
    const real={...COURSES[0],courseKey:'R1',provenance:'REAL_APPROVED'};
    expect(()=>search('경제원론',{courses:[real]})).toThrow(/Mixed/);
  });
  it('an entry passed in the wrong domain list fails closed',()=>{
    expect(()=>searchAcademic({query:'휴학',notices:FAQS})).toThrow(/kind/);
  });
});

describe('#53 empty, filtered and not-connected states',()=>{
  it('distinguishes NOT_CONNECTED (no data) from NO_MATCH (data, no hit)',()=>{
    const r=searchAcademic({query:'휴학 신청',faqs:FAQS});
    expect(r.status).toEqual({NOTICE:'NOT_CONNECTED',FAQ:'OK',COURSE:'NOT_CONNECTED'});
    expect(searchAcademic({query:'기숙사 식단',faqs:FAQS}).status.FAQ).toBe('NO_MATCH');
  });
  it('a domain filter keeps other domains out without calling them empty',()=>{
    expect(search('휴학 신청',{domainFilter:'FAQ'}).status).toEqual({NOTICE:'FILTERED_OUT',FAQ:'OK',COURSE:'FILTERED_OUT'});
  });
  it('an empty result offers retry and correction suggestions without asserting them as facts',()=>{
    const r=searchAcademic({query:'수강신철 식단표',notices:NOTICES});
    expect(r.groups.NOTICE).toEqual([]);
    expect(r.emptyGuidance).toEqual({retryQuery:'수강신철 식단표',suggestions:['수강신청'],showOfficialLinks:true});
  });
  it('rejects an invalid limit',()=>{
    expect(()=>search('휴학',{limit:0})).toThrow(RangeError);
  });
});
