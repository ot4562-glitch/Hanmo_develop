// @ts-check
/** @typedef {import("./notice-search.js").NoticeMeta} NoticeMeta */
import {describe,expect,it} from 'vitest';
import {screenNoticeMeta,searchNoticeMeta} from './notice-search.js';

// 모든 공지 메타데이터는 SYNTHETIC 가상 자료다. 제목·날짜·URL은 지어낸 값이며 실제 학교 공지가 아니다.
/**
 * @param {string} id @param {string} title @param {string} postedOn
 * @param {Partial<NoticeMeta>} [patch]
 * @returns {NoticeMeta}
 */
const n=(id,title,postedOn,patch={})=>({noticeId:id,title,postedOn,campus:'SEOUL',category:'COURSE',sourceId:'SYN-BOARD',
  sourceUrl:'https://example.org/synthetic/'+id,observedAt:'2026-11-20T09:00:00+09:00',state:'ACTIVE',policyVersion:'SYN-POLICY-1',
  provenance:'SYNTHETIC',...patch});
const SET=[
  n('N1','가상 2027학년도 1학기 수강신청 일정 안내','2026-11-10'),
  n('N2','가상 이중전공 신청 안내','2026-11-12',{category:'MAJOR',campus:'BOTH'}),
  n('N3','가상 글로벌캠퍼스 수강신청 안내','2026-11-11',{campus:'GLOBAL'}),
  n('N4','가상 국가장학금 신청 안내','2026-10-01',{category:'SCHOLARSHIP',campus:'UNKNOWN'}),
  n('N5','가상 휴학 신청 안내','2026-09-15',{category:'STATUS'}),
  n('N6','가상 2027학년도 1학기 수강신청 일정 안내','2026-11-18',{state:'CORRECTED'}),
];
/** @param {Partial<import("./notice-search.js").NoticeSearchInput>} input */
const s=input=>searchNoticeMeta({notices:SET,...input});
/** @param {{hits:{noticeId:string}[]}} r */
const ids=r=>r.hits.map(h=>h.noticeId);

describe('#53 metadata screening: forbidden fields and content never reach results',()=>{
  it('a body, attachment or author field is rejected by the strict contract',()=>{
    const r=screenNoticeMeta([{...n('X1','가상 안내','2026-11-01'),body:'본문'},{...n('X2','가상 안내','2026-11-01'),attachments:[]}]);
    expect(r.accepted).toEqual([]);
    expect(r.held.map(h=>[h.noticeId,h.reason])).toEqual([['X1','SCHEMA_INVALID'],['X2','SCHEMA_INVALID']]);
  });
  it('titles with instructor names, personal contacts, rules/graduation requirements or enrollment status are held',()=>{
    const r=screenNoticeMeta([
      n('A','가상 홍길동 교수 특강 안내','2026-11-01'),
      n('B','가상 문의 ghost@example.org','2026-11-01'),
      n('C','가상 학칙 개정 안내','2026-11-01'),
      n('D','가상 2027 졸업요건 안내','2026-11-01'),
      n('E','가상 과목별 수강인원 현황','2026-11-01'),
      n('F','가상 교수학습센터 프로그램 안내','2026-11-01'),
    ]);
    expect(r.held.map(h=>[h.noticeId,h.detail])).toEqual([
      ['A','INSTRUCTOR_NAME'],['B','PERSONAL_CONTACT'],['C','RULE_OR_GRADUATION_REQUIREMENT'],
      ['D','RULE_OR_GRADUATION_REQUIREMENT'],['E','ENROLLMENT_INFO'],
    ]);
    // '교수학습센터'처럼 사람 이름이 아닌 기관명은 막지 않는다.
    expect(r.accepted.map(x=>x.noticeId)).toEqual(['F']);
  });
  it('held reasons never echo the original title text',()=>{
    const r=screenNoticeMeta([n('A','가상 홍길동 교수 특강 안내','2026-11-01')]);
    expect(JSON.stringify(r.held)).not.toContain('홍길동');
  });
  it('withdrawn notices are removed, identical copies merge, conflicting copies are held',()=>{
    const r=screenNoticeMeta([n('W','가상 안내','2026-11-01',{state:'WITHDRAWN'}),n('S','가상 안내','2026-11-01'),n('S','가상 안내','2026-11-01'),
      n('C','가상 안내','2026-11-01'),n('C','가상 다른 안내','2026-11-01')]);
    expect(r.withdrawn).toEqual(['W']);
    expect(r.accepted.map(x=>x.noticeId)).toEqual(['S']);
    expect(r.held).toEqual([{noticeId:'C',reason:'CONFLICTING_DUPLICATE',detail:'2'}]);
  });
  // PR #130 리뷰(2026-11-23): 같은 ID의 문제 행이 정상 행을 통과시키면 안 된다.
  it('a valid row is held when another copy with the same ID has a forbidden title (fail-closed)',()=>{
    const r=screenNoticeMeta([n('A','가상 수강신청 안내','2026-11-01'),n('A','가상 홍길동 교수 특강','2026-11-01')]);
    expect(r.accepted).toEqual([]);
    expect(r.held.map(h=>[h.noticeId,h.reason])).toEqual([['A','FORBIDDEN_CONTENT'],['A','ID_HAS_HELD_COPY']]);
  });
  it('a valid row is held when another copy with the same ID has a disallowed field, in either order',()=>{
    for(const rows of [[n('A','가상 안내','2026-11-01'),{...n('A','가상 안내','2026-11-01'),body:'본문'}],
      [{...n('A','가상 안내','2026-11-01'),instructor:'가상'},n('A','가상 안내','2026-11-01')]]){
      const r=screenNoticeMeta(rows);
      expect(r.accepted).toEqual([]);
      expect(r.held.map(h=>h.reason).sort()).toEqual(['ID_HAS_HELD_COPY','SCHEMA_INVALID']);
    }
  });
  it('an ACTIVE copy contaminated by a WITHDRAWN copy of the same ID is neither published nor listed as withdrawn',()=>{
    const r=screenNoticeMeta([n('A','가상 안내','2026-11-01'),n('A','가상 안내','2026-11-01',{state:'WITHDRAWN'})]);
    expect(r).toMatchObject({accepted:[],withdrawn:[],held:[{noticeId:'A',reason:'CONFLICTING_DUPLICATE',detail:'2'}]});
  });
  it('a malformed withdrawn copy also blocks the valid copy',()=>{
    const r=screenNoticeMeta([n('A','가상 안내','2026-11-01'),{...n('A','가상 안내','2026-11-01',{state:'WITHDRAWN'}),postedOn:'bad'}]);
    expect(r.accepted).toEqual([]);
    expect(r.withdrawn).toEqual([]);
  });
  it('IDs are compared after trimming, so whitespace cannot split a notice into two',()=>{
    const r=screenNoticeMeta([n('A','가상 안내','2026-11-01'),{...n('A','가상 홍길동 교수 특강','2026-11-01'),noticeId:' A '}]);
    expect(r.accepted).toEqual([]);
  });
  it('a problem row for one ID does not affect a different ID',()=>{
    const r=screenNoticeMeta([n('A','가상 안내','2026-11-01'),n('B','가상 홍길동 교수 특강','2026-11-01')]);
    expect(r.accepted.map(x=>x.noticeId)).toEqual(['A']);
    expect(r.held.map(h=>h.noticeId)).toEqual(['B']);
  });
  it('a search never returns a notice whose ID has a held copy',()=>{
    const r=searchNoticeMeta({query:'수강신청',notices:[...SET,n('N1','가상 2027학년도 1학기 수강신청 일정 안내','2026-11-10',{sourceUrl:'http://example.org/x'})]});
    expect(r.hits.map(h=>h.noticeId)).not.toContain('N1');
  });
  it('mixed synthetic and reviewed metadata is not used at all',()=>{
    const r=screenNoticeMeta([n('A','가상 안내','2026-11-01'),n('B','가상 안내 둘','2026-11-01',{provenance:'REVIEWED'})]);
    expect(r.accepted).toEqual([]);
    expect(r.held.map(h=>h.reason)).toEqual(['MIXED_PROVENANCE','MIXED_PROVENANCE']);
  });
  it('an http source URL or an invalid date is rejected',()=>{
    const r=screenNoticeMeta([n('A','가상 안내','2026-11-01',{sourceUrl:'http://example.org/a'}),n('B','가상 안내','2026-02-30')]);
    expect(r.held.map(h=>h.reason)).toEqual(['SCHEMA_INVALID','SCHEMA_INVALID']);
  });
});

describe('#53 search over titles only',()=>{
  it('finds by title with typo, spacing and abbreviation tolerance',()=>{
    expect(ids(s({query:'수강신철 일정'}))).toEqual(expect.arrayContaining(['N1','N6']));
    expect(ids(s({query:'이중 전공'}))).toEqual(['N2']);
    expect(s({query:'복전'}).hits[0]?.noticeId).toBe('N2');
    // 기존 2그램 허용 범위를 넘는 오타는 교정 변형으로만 찾히며 그 사실을 표시한다.
    expect(s({query:'휴학싱청'}).hits[0]).toMatchObject({noticeId:'N5',matchedVia:'VARIANT'});
  });
  it('returns only metadata fields, never a body, and flags corrected notices',()=>{
    const hit=s({query:'수강신청 일정'}).hits.find(h=>h.noticeId==='N6');
    expect(Object.keys(hit??{}).sort()).toEqual(['campus','category','corrected','matchedVia','noticeId','observedAt','postedOn',
      'score','similarTitleIds','sourceUrl','title']);
    expect(hit?.corrected).toBe(true);
  });
  it('identical titles are not merged, only cross-referenced',()=>{
    const r=s({query:'수강신청 일정'});
    expect(r.hits.find(h=>h.noticeId==='N1')?.similarTitleIds).toEqual(['N6']);
    expect(r.hits.find(h=>h.noticeId==='N6')?.similarTitleIds).toEqual(['N1']);
  });
  it('ties in relevance are broken by newest posting date then ID, deterministically',()=>{
    const r=s({query:'수강신청 일정'});
    expect(ids(r).slice(0,2)).toEqual(['N6','N1']);
    expect(JSON.stringify(s({query:'신청'}))).toBe(JSON.stringify(s({query:'신청'})));
  });
});

describe('#53 filters are applied before ranking',()=>{
  it('campus filter keeps that campus and BOTH, and drops UNKNOWN and the other campus',()=>{
    expect(ids(s({filters:{campus:'SEOUL'}}))).toEqual(['N6','N2','N1','N5']);
    expect(ids(s({query:'수강신청',filters:{campus:'SEOUL'}}))).not.toContain('N3');
  });
  it('category and posting-date range filters, with calendar validation',()=>{
    expect(ids(s({filters:{categories:['MAJOR','STATUS']}}))).toEqual(['N2','N5']);
    expect(ids(s({filters:{postedFrom:'2026-11-11',postedTo:'2026-11-12'}}))).toEqual(['N2','N3']);
    expect(()=>s({filters:{postedFrom:'2026-02-30'}})).toThrow(/postedFrom/);
    expect(()=>s({filters:{postedFrom:'2026-11-12',postedTo:'2026-11-01'}})).toThrow(/after/);
  });
  it('an empty query lists filtered notices newest first',()=>{
    expect(ids(s({}))).toEqual(['N6','N2','N3','N1','N4','N5']);
  });
  it('a held notice never appears even if its title matches perfectly',()=>{
    const r=searchNoticeMeta({query:'특강',notices:[...SET,n('H','가상 홍길동 교수 특강','2026-11-19')]});
    expect(ids(r)).not.toContain('H');
    expect(r.held[0]?.reason).toBe('FORBIDDEN_CONTENT');
  });
});

describe('#53 empty, not-connected and coverage',()=>{
  it('distinguishes NOT_CONNECTED from NO_MATCH and reports the observed range',()=>{
    expect(searchNoticeMeta({query:'수강신청'})).toMatchObject({status:'NOT_CONNECTED',coverage:null});
    const r=s({query:'기숙사 식단'});
    expect(r).toMatchObject({status:'NO_MATCH',total:0,
      coverage:{postedFrom:'2026-09-15',postedTo:'2026-11-18',lastObservedAt:'2026-11-20T09:00:00+09:00',count:6}});
  });
  it('an empty result suggests corrected wording without asserting it',()=>{
    const r=searchNoticeMeta({query:'수강신철 식단',notices:[n('Z','가상 기숙사 안내','2026-11-01')]});
    expect(r.emptyGuidance).toEqual({retryQuery:'수강신철 식단',suggestions:['수강신청'],showOfficialLinks:true});
  });
  it('rejects an invalid limit or an oversized input',()=>{
    expect(()=>s({limit:0})).toThrow(RangeError);
    expect(()=>screenNoticeMeta(Array.from({length:5001},()=>({})))).toThrow(RangeError);
  });
});
