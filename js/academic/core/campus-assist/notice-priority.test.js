// @ts-check
/** @typedef {import("./notice-extract.js").NoticeExtractInput} NoticeExtractInput */
/** @typedef {import("./notice-priority.js").PriorityNoticeInput} PriorityNoticeInput */
/** @typedef {import("./notice-priority.js").NoticeReview} NoticeReview */
import {describe,expect,it} from 'vitest';
import {extractNoticeCandidates} from './notice-extract.js';
import {noticeApplicability,noticeTopics,prioritizeNotices} from './notice-priority.js';

// 모든 공지는 SYNTHETIC 가상 문장이다. 날짜·대상·검수 기록은 테스트용으로 지어낸 값이며 실제 학교 공지가 아니다.
const AS_OF='2026-03-02T09:00:00+09:00';
/**
 * @param {string} id @param {string} title @param {string[]} texts
 * @param {{review?:NoticeReview|null,patch?:Partial<NoticeExtractInput>}} [opt]
 * @returns {PriorityNoticeInput}
 */
const N=(id,title,texts,opt={})=>{
  const extraction=extractNoticeCandidates({noticeId:id,revisionId:'r1',title,publishedAt:'2026-02-20T10:00:00+09:00',
    state:'PUBLISHED',rights:'APPROVED',provenance:'SYNTHETIC',paragraphs:texts.map((text,i)=>({id:'p'+(i+1),text})),...opt.patch});
  const review=opt.review===undefined?{revisionId:extraction.revisionId,required:true,studentDeadlineConfirmed:true}:opt.review;
  return {extraction,title,sourceUrl:'https://example.org/synthetic/'+id,...(review?{review}:{})};
};
const SEOUL_2024={campus:/** @type {'SEOUL'} */('SEOUL'),cohort:2024,groups:/** @type {import("./notice-extract.js").StudentGroup[]} */(['ENROLLED'])};
/** @param {PriorityNoticeInput[]} notices @param {Parameters<typeof prioritizeNotices>[0]['student']} [student] */
const run=(notices,student=SEOUL_2024)=>prioritizeNotices({notices,student,asOf:AS_OF});
/** @param {{noticeId:string}[]} rows */
const ids=rows=>rows.map(r=>r.noticeId);

describe('#51 applicability by evidence rules only',()=>{
  it('YES when every stated target matches, with evidence spans',()=>{
    const x=N('A','가상 이중전공 신청',['가상 신청 대상: 서울캠퍼스 2022~2024학번 재학생']).extraction;
    const r=noticeApplicability(x,SEOUL_2024);
    expect(r.state).toBe('YES');
    expect(r.evidence.map(e=>e.text)).toEqual(['서울캠퍼스','2022~2024학번','재학생']);
  });
  it('NO on a clear mismatch or an explicit exclusion',()=>{
    const x=N('A','가상 안내',['가상 대상: 글로벌캠퍼스 재학생']).extraction;
    expect(noticeApplicability(x,SEOUL_2024)).toMatchObject({state:'NO',reasons:['CAMPUS_MISMATCH']});
    const ex=N('B','가상 안내',['가상 신청 대상은 서울캠퍼스 학생이며, 2024학번은 제외합니다.']).extraction;
    expect(noticeApplicability(ex,SEOUL_2024)).toMatchObject({state:'NO',reasons:['COHORT_EXCLUDED']});
  });
  it('UNKNOWN when the notice states no target, or the student did not enter the needed value',()=>{
    expect(noticeApplicability(N('A','가상 안내',['가상 안내 사항입니다.']).extraction,SEOUL_2024).reasons).toEqual(['TARGET_UNSTATED']);
    const x=N('B','가상 안내',['가상 대상: 서울캠퍼스 2022~2024학번']).extraction;
    expect(noticeApplicability(x,{}).reasons).toEqual(['CAMPUS_NOT_GIVEN','COHORT_NOT_GIVEN']);
  });
  it('an exclusion clause the student cannot be checked against stays UNKNOWN',()=>{
    const x=N('A','가상 안내',['가상 서울캠퍼스 학생 대상이며, 휴학생은 제외합니다.']).extraction;
    expect(noticeApplicability(x,{campus:'SEOUL'})).toMatchObject({state:'UNKNOWN',reasons:['EXCLUSION_UNCHECKED']});
  });
  it('both campuses in one notice apply to either campus',()=>{
    const x=N('A','가상 안내',['가상 서울캠퍼스, 글로벌캠퍼스 재학생 모두 신청 가능']).extraction;
    expect(noticeApplicability(x,{campus:'GLOBAL',groups:['ENROLLED']}).state).toBe('YES');
  });
});

describe('#51 topic is separate from importance',()=>{
  it('finds topics across spacing and abbreviations, possibly several',()=>{
    expect(noticeTopics('가상 수강 신청 및 복전 안내')).toEqual(['COURSE','MAJOR']);
    expect(noticeTopics('가상 기숙사 안내')).toEqual(['OTHER']);
  });
  it('a graduation-looking title does not make an unreviewed notice important',()=>{
    const r=run([N('A','가상 졸업시험 신청 안내',['가상 대상: 서울캠퍼스 2024학번 재학생','가상 신청 마감: 2026. 3. 5.(목) 18:00'],{review:null})]);
    expect(r.notices[0]).toMatchObject({topics:['GRADUATION'],importance:'UNKNOWN',reviewState:'UNREVIEWED'});
    expect(r.pinned).toEqual([]);
    expect(ids(r.checkOriginal)).toEqual(['A']);
  });
});

describe('#51 pinning: reviewed, applicable, exact student deadline within 7 days KST, max 2',()=>{
  const due=(/** @type {string} */id,/** @type {string} */date,/** @type {Parameters<typeof N>[3]} */opt={})=>N(id,'가상 이중전공 신청 '+id,
    ['가상 대상: 서울캠퍼스 2024학번 재학생','가상 신청 마감: '+date],opt);
  it('pins at most two, nearest deadline first, and keeps the third as CRITICAL_DUE in the list',()=>{
    const r=run([due('C','2026. 3. 8.(일) 18:00'),due('A','2026. 3. 4.(수) 18:00'),due('B','2026. 3. 6.(금) 18:00')]);
    expect(ids(r.pinned)).toEqual(['A','B']);
    expect(r.notices.find(n=>n.noticeId==='C')?.importance).toBe('CRITICAL_DUE');
  });
  it('the 7-day window is measured in absolute time (exactly 7 days pins, 7 days + 1 minute does not)',()=>{
    expect(run([due('A','2026. 3. 9.(월) 09:00')]).pinned.length).toBe(1);
    const r=run([due('B','2026. 3. 9.(월) 09:01')]);
    expect(r.pinned).toEqual([]);
    expect(r.notices[0]).toMatchObject({importance:'ACADEMIC_REQUIRED',deadline:{state:'UPCOMING'}});
  });
  it('a passed deadline is never pinned and goes to the passed list',()=>{
    const r=run([due('A','2026. 3. 1.(일) 18:00')]);
    expect(r.pinned).toEqual([]);
    expect(ids(r.passed)).toEqual(['A']);
  });
  it('a deadline without a time, with an inferred year, or not confirmed by the reviewer is not exact',()=>{
    expect(run([due('A','2026. 3. 4.(수)')]).notices[0]?.deadline.state).toBe('NOT_EXACT');
    const inferred=N('B','가상 이중전공 신청',['가상 대상: 서울캠퍼스 2024학번 재학생','가상 신청 마감: 3월 4일(수) 18:00']);
    expect(run([inferred]).notices[0]?.deadline.state).toBe('NOT_EXACT');
    const unconfirmed=due('C','2026. 3. 4.(수) 18:00',{review:{revisionId:'r1',required:true,studentDeadlineConfirmed:false}});
    expect(run([unconfirmed]).pinned).toEqual([]);
  });
  it('a notice for another target is never pinned even with a near deadline',()=>{
    const other=N('A','가상 이중전공 신청',['가상 대상: 글로벌캠퍼스 2024학번 재학생','가상 신청 마감: 2026. 3. 4.(수) 18:00']);
    const r=run([other]);
    expect(r.pinned).toEqual([]);
    expect(r.notices[0]?.importance).toBe('GENERAL');
    expect(r.checkOriginal).toEqual([]);
  });
  it('a not-required reviewed notice is PERSONAL, not CRITICAL_DUE',()=>{
    const r=run([due('A','2026. 3. 4.(수) 18:00',{review:{revisionId:'r1',required:false,studentDeadlineConfirmed:true}})]);
    expect(r.notices[0]?.importance).toBe('PERSONAL');
    expect(r.pinned).toEqual([]);
  });
});

describe('#51 review, correction and cancellation',()=>{
  it('a review recorded for an older revision is stale and does not carry over',()=>{
    const corrected=N('A','[정정] 가상 이중전공 신청',['가상 대상: 서울캠퍼스 2024학번 재학생','가상 신청 마감: 2026. 3. 4.(수) 18:00'],
      {review:{revisionId:'r1',required:true,studentDeadlineConfirmed:true},patch:{revisionId:'r2',state:'CORRECTED',correctsRevisionId:'r1'}});
    const r=run([corrected]);
    expect(r.notices[0]).toMatchObject({reviewState:'STALE_REVIEW',importance:'UNKNOWN'});
    expect(r.pinned).toEqual([]);
    expect(ids(r.checkOriginal)).toEqual(['A']);
  });
  it('a cancelled notice is listed as cancelled, not pinned or sent to review',()=>{
    const cancelled=N('A','[취소] 가상 설명회',['가상 설명회가 취소되었습니다.'],
      {patch:{revisionId:'r2',state:'CANCELLED',correctsRevisionId:'r1'},review:{revisionId:'r2',required:true,studentDeadlineConfirmed:false}});
    const r=run([cancelled]);
    expect(ids(r.cancelled)).toEqual(['A']);
    expect(r.pinned).toEqual([]);
    expect(r.checkOriginal).toEqual([]);
  });
  it('a notice without reuse rights is excluded',()=>{
    const r=run([N('A','가상 안내',['가상 신청 마감: 2026. 3. 4.(수) 18:00'],{patch:{rights:'REVOKED'}})]);
    expect(r.notices[0]?.reviewState).toBe('EXCLUDED');
    expect(r.checkOriginal).toEqual([]);
  });
  it('two notices with the same title are kept separate',()=>{
    const a=N('A','가상 수강신청 안내',['가상 대상: 서울캠퍼스 2024학번 재학생','가상 신청 마감: 2026. 3. 4.(수) 18:00']);
    const b=N('B','가상 수강신청 안내',['가상 대상: 서울캠퍼스 2024학번 재학생','가상 신청 마감: 2026. 3. 5.(목) 18:00'],{review:null});
    const r=run([a,b]);
    expect(ids(r.pinned)).toEqual(['A']);
    expect(ids(r.checkOriginal)).toEqual(['B']);
  });
});

describe('#51 failures',()=>{
  it('rejects invalid asOf, duplicate revisions and mixed provenance',()=>{
    const a=N('A','가상 안내',['가상 안내 사항입니다.']);
    expect(()=>prioritizeNotices({notices:[a],student:{},asOf:'bad'})).toThrow(RangeError);
    expect(()=>run([a,a])).toThrow(/Duplicate/);
    const real=N('B','가상 안내',['가상 안내 사항입니다.'],{patch:{provenance:'REAL_APPROVED'}});
    expect(()=>run([a,real])).toThrow(/Mixed/);
  });
});
