// @ts-check
/** @typedef {import("./notice-search.js").NoticeMeta} NoticeMeta */
import {describe,expect,it} from 'vitest';
import * as campusAssistContracts from '../../contracts/campus-assist/index.js';
import {assertPublicNoticeBundle,buildNoticeMetaIndex,noticeMetaSha256} from './notice-meta-index.js';
import {searchNoticeMeta} from './notice-search.js';

// 모든 메타데이터·매니페스트는 SYNTHETIC 가상 자료다. 실제 학교 공지나 검수 스냅샷이 아니다.
const AS_OF='2026-11-23T12:00:00+09:00';
/**
 * @param {string} id @param {string} title @param {Partial<NoticeMeta>} [patch]
 * @returns {NoticeMeta}
 */
const n=(id,title,patch={})=>({noticeId:id,title,postedOn:'2026-11-20',campus:'SEOUL',category:'COURSE',sourceId:'SYN-BOARD',
  sourceUrl:'https://example.org/synthetic/'+id,observedAt:'2026-11-21T09:00:00+09:00',state:'ACTIVE',policyVersion:'SYN-POLICY-1',
  provenance:'SYNTHETIC',...patch});
/**
 * @param {NoticeMeta[]} listed @param {Record<string,unknown>} [patch]
 */
const manifest=(listed,patch={})=>({snapshotId:'SYN-SNAP-1',indexRevision:'i1',builtAt:'2026-11-22T00:00:00+09:00',
  policyVersion:'SYN-POLICY-1',provenance:'SYNTHETIC',
  scope:{sourceIds:['SYN-BOARD'],observedFrom:'2026-11-01T00:00:00+09:00',observedTo:'2026-11-22T00:00:00+09:00'},
  entries:listed.map(r=>({noticeId:r.noticeId,contentSha256:noticeMetaSha256(r)})),withdrawn:[],...patch});
/** @param {NoticeMeta[]} rows @param {NoticeMeta[]} [listed] @param {Record<string,unknown>} [patch] */
const build=(rows,listed=rows,patch={})=>buildNoticeMetaIndex({manifest:manifest(listed,patch),notices:rows,asOf:AS_OF});
/** @param {ReturnType<typeof build>} idx @param {string} id */
const disp=(idx,id)=>idx.dispositions.find(d=>d.noticeId===id)?.disposition;

describe('#44 metadata index: only manifest-listed, in-scope, unwithdrawn notices',()=>{
  it('indexes listed rows with matching hash and reports READY with coverage',()=>{
    const idx=build([n('A','가상 수강신청 안내'),n('B','가상 휴학 신청 안내')]);
    expect(idx.status).toBe('READY');
    expect(idx.notices.map(r=>r.noticeId)).toEqual(['A','B']);
    expect(idx.coverage).toEqual({sourceIds:['SYN-BOARD'],observedFrom:'2026-11-01T00:00:00+09:00',observedTo:'2026-11-22T00:00:00+09:00',count:2});
  });
  it('the hash ignores key order but changes with any field value',()=>{
    const a=n('A','가상 안내');
    const reordered=/** @type {NoticeMeta} */(Object.fromEntries(Object.entries(a).reverse()));
    expect(noticeMetaSha256(reordered)).toBe(noticeMetaSha256(a));
    expect(noticeMetaSha256({...a,title:'가상 안내 수정'})).not.toBe(noticeMetaSha256(a));
  });
  it('a self-declared row without a manifest entry, or with a changed value, is not indexed',()=>{
    const listed=n('A','가상 안내');
    const idx=build([{...listed,title:'가상 안내 바뀜'},n('B','가상 다른 안내')],[listed]);
    expect(disp(idx,'A')).toBe('HASH_MISMATCH');
    expect(disp(idx,'B')).toBe('NOT_IN_MANIFEST');
    expect(idx.notices).toEqual([]);
    expect(idx.status).toBe('PARTIAL');
  });
  it('the manifest withdrawal list wins even if the row still says ACTIVE',()=>{
    const a=n('A','가상 안내');
    const idx=build([a],[a],{withdrawn:['A']});
    expect(disp(idx,'A')).toBe('WITHDRAWN');
    expect(idx.notices).toEqual([]);
  });
  it('policy version, source scope and observation time are enforced',()=>{
    const rows=[n('P','가상 안내',{policyVersion:'SYN-POLICY-0'}),n('S','가상 안내 둘',{sourceId:'SYN-OTHER'}),
      n('T','가상 안내 셋',{observedAt:'2026-11-24T00:00:00+09:00'})];
    const idx=build(rows);
    expect([disp(idx,'P'),disp(idx,'S'),disp(idx,'T')]).toEqual(['POLICY_MISMATCH','OUT_OF_SCOPE','OBSERVED_AFTER_AS_OF']);
  });
  // PR #131 리뷰(2026-11-23): 매니페스트 관측 기간 밖의 행은 해시가 맞아도 색인하지 않는다.
  it('rows observed outside the manifest observation window are excluded, with inclusive boundaries',()=>{
    const scope={sourceIds:['SYN-BOARD'],observedFrom:'2026-11-20T00:00:00+09:00',observedTo:'2026-11-21T23:59:59+09:00'};
    const rows=[
      n('EARLY','가상 안내 하나',{observedAt:'2026-11-10T09:00:00+09:00'}),
      n('FROM','가상 안내 둘',{observedAt:'2026-11-20T00:00:00+09:00'}),
      n('TO','가상 안내 셋',{observedAt:'2026-11-21T23:59:59+09:00'}),
      n('JUST_BEFORE','가상 안내 넷',{observedAt:'2026-11-19T23:59:59+09:00'}),
      n('JUST_AFTER','가상 안내 다섯',{observedAt:'2026-11-22T00:00:00+09:00'}),
    ];
    const idx=build(rows,rows,{scope});
    expect(idx.notices.map(r=>r.noticeId)).toEqual(['FROM','TO']);
    for(const id of ['EARLY','JUST_BEFORE','JUST_AFTER'])expect(disp(idx,id)).toBe('OUTSIDE_OBSERVATION_WINDOW');
    expect(idx.status).toBe('PARTIAL');
  });
  it('a manifest entry without a row is reported as missing',()=>{
    const idx=build([n('A','가상 안내')],[n('A','가상 안내'),n('Z','가상 없는 행')]);
    expect(disp(idx,'Z')).toBe('MISSING_ROW');
    expect(idx.status).toBe('PARTIAL');
  });
  it('rows with forbidden content are held and never indexed, without echoing the title',()=>{
    const bad=n('H','가상 홍길동 교수 특강');
    const idx=build([bad,n('A','가상 안내')]);
    expect(disp(idx,'H')).toBe('HELD');
    expect(idx.notices.map(r=>r.noticeId)).toEqual(['A']);
    expect(JSON.stringify(idx)).not.toContain('홍길동');
  });
  it('rejects a manifest built after asOf, a reversed window, duplicate entries and mixed provenance',()=>{
    const a=n('A','가상 안내');
    expect(()=>build([a],[a],{builtAt:'2026-11-24T00:00:00+09:00'})).toThrow(/after asOf/);
    expect(()=>build([a],[a],{scope:{sourceIds:['SYN-BOARD'],observedFrom:'2026-11-22T00:00:00+09:00',observedTo:'2026-11-01T00:00:00+09:00'}})).toThrow();
    expect(()=>build([a],[a,a])).toThrow();
    expect(()=>build([a],[a],{provenance:'REVIEWED'})).toThrow(/Mixed/);
    expect(()=>buildNoticeMetaIndex({manifest:manifest([a]),notices:[a],asOf:'2026-11-23'})).toThrow(RangeError);
  });
  it('the index feeds the #53 metadata search directly',()=>{
    const idx=build([n('A','가상 수강신청 안내'),n('B','가상 휴학 신청 안내')]);
    expect(searchNoticeMeta({query:'수강신철',notices:idx.notices}).hits.map(h=>h.noticeId)).toEqual(['A']);
  });
});

describe('#44 public bundle guard',()=>{
  const idx=build([n('A','가상 수강신청 안내')]);
  const bundle={snapshotId:idx.snapshotId,indexRevision:idx.indexRevision,policyVersion:idx.policyVersion,provenance:idx.provenance,
    asOf:idx.asOf,coverage:idx.coverage,notices:idx.notices};
  it('accepts a bundle of indexed metadata only',()=>{
    expect(assertPublicNoticeBundle(bundle)).toBe(true);
  });
  it('rejects body, FAQ, instructor or contact keys anywhere, and unknown top-level keys',()=>{
    expect(()=>assertPublicNoticeBundle({...bundle,faq:[]})).toThrow(/FORBIDDEN_KEY \$\.faq/);
    expect(()=>assertPublicNoticeBundle({...bundle,notices:[{...idx.notices[0],body:'본문'}]})).toThrow(/FORBIDDEN_KEY/);
    expect(()=>assertPublicNoticeBundle({...bundle,coverage:{...bundle.coverage,instructors:[]}})).toThrow(/instructors/);
    expect(()=>assertPublicNoticeBundle({...bundle,extra:1})).toThrow(/SCHEMA \$ unrecognized_keys/);
    expect(()=>assertPublicNoticeBundle([])).toThrow(/SCHEMA/);
  });
  // PR #131 리뷰(2026-11-23): 키 이름만이 아니라 필수 값과 필드 간 일관성을 검사한다.
  it('rejects incomplete bundles with missing header values',()=>{
    expect(()=>assertPublicNoticeBundle({notices:[]})).toThrow(/SCHEMA snapshotId/);
    const {coverage:_c,...noCoverage}=bundle;
    expect(()=>assertPublicNoticeBundle(noCoverage)).toThrow(/SCHEMA coverage/);
    expect(()=>assertPublicNoticeBundle({...bundle,policyVersion:''})).toThrow(/SCHEMA policyVersion/);
  });
  it('rejects forged or inconsistent coverage and notices',()=>{
    expect(()=>assertPublicNoticeBundle({...bundle,coverage:{...bundle.coverage,count:5}})).toThrow(/COVERAGE_COUNT_MISMATCH 5!=1/);
    expect(()=>assertPublicNoticeBundle({...bundle,coverage:{...bundle.coverage,observedFrom:'2026-11-21T10:00:00+09:00'}}))
      .toThrow(/NOTICE_OUTSIDE_OBSERVATION_WINDOW A/);
    expect(()=>assertPublicNoticeBundle({...bundle,coverage:{...bundle.coverage,observedTo:'2026-11-24T00:00:00+09:00'}}))
      .toThrow(/COVERAGE_AFTER_AS_OF/);
    expect(()=>assertPublicNoticeBundle({...bundle,coverage:{...bundle.coverage,sourceIds:['SYN-OTHER']}})).toThrow(/NOTICE_OUT_OF_SCOPE A/);
    expect(()=>assertPublicNoticeBundle({...bundle,policyVersion:'SYN-POLICY-2'})).toThrow(/NOTICE_POLICY_MISMATCH A/);
    expect(()=>assertPublicNoticeBundle({...bundle,provenance:'REVIEWED'})).toThrow(/NOTICE_PROVENANCE_MISMATCH A/);
  });
  it('rejects withdrawn or forbidden-content notices inside a bundle',()=>{
    expect(()=>assertPublicNoticeBundle({...bundle,notices:[n('W','가상 안내',{state:'WITHDRAWN'})]})).toThrow(/NOTICE_WITHDRAWN W/);
    expect(()=>assertPublicNoticeBundle({...bundle,notices:[n('H','가상 학칙 개정 안내')]})).toThrow(/NOTICE_HELD H FORBIDDEN_CONTENT/);
  });
});

describe('#44 removed paragraph/FAQ index stays removed (written reply 2026-11-23)',()=>{
  it('no paragraph evidence or FAQ index contract is exported any more',()=>{
    const names=Object.keys(campusAssistContracts);
    expect(names.filter(k=>/^Evidence/.test(k))).toEqual([]);
  });
});
