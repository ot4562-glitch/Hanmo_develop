import {describe,expect,it} from 'vitest';
import type {EvidenceManifest,EvidenceRevision,FaqDocument} from '../../contracts/campus-assist/index.js';
import {canonicalJson,sha256Hex} from './content-hash.js';
import {buildEvidenceIndex,evidenceContentSha256,evidenceRevisionFromFaq} from './evidence-index.js';

// 모든 문서·날짜·URL은 SYNTHETIC 고정 자료다. 실제 한국외대 공지·FAQ가 아니며 품질 수치의 근거로 쓰지 않는다.
const AS_OF='2026-11-21T03:00:00Z';
const rev=(documentId:string,revisionId:string,patch:Partial<EvidenceRevision>={}):EvidenceRevision=>({
  kind:'NOTICE',documentId,revisionId,title:'가상 수강신청 안내 '+documentId,
  sourceUrl:'https://example.org/synthetic/'+documentId,
  publishedAt:'2026-11-01T00:00:00+09:00',verifiedAt:'2026-11-02T00:00:00+09:00',
  state:'PUBLISHED',rights:'APPROVED',provenance:'SYNTHETIC',
  paragraphs:[{id:'p1',text:'가상 학생 신청 기간은 가상 1주차입니다.'}],...patch,
});
const manifestOf=(rows:readonly EvidenceRevision[],patch:Partial<EvidenceManifest>={}):EvidenceManifest=>({
  snapshotId:'SYN-SNAP-1',indexRevision:'idx-1',builtAt:'2026-11-20T00:00:00Z',provenance:'SYNTHETIC',
  entries:rows.map(r=>({kind:r.kind,documentId:r.documentId,revisionId:r.revisionId,contentSha256:evidenceContentSha256(r)})),
  ...patch,
});
const build=(revisions:readonly EvidenceRevision[],listed:readonly EvidenceRevision[]=revisions,asOf=AS_OF)=>
  buildEvidenceIndex({manifest:manifestOf(listed),revisions,asOf});
const disposition=(index:ReturnType<typeof build>,documentId:string)=>
  index.documents.find(d=>d.documentId===documentId)?.disposition;

describe('content hash',()=>{
  it('matches the standard SHA-256 test vectors',()=>{
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))
      .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    // 패딩이 한 블록을 넘는 길이(56·64바이트 경계)와 한글 UTF-8
    expect(sha256Hex('a'.repeat(64))).toBe('ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb');
    expect(sha256Hex('한모')).toHaveLength(64);
  });
  it('canonical JSON ignores key order and undefined but keeps array order',()=>{
    expect(canonicalJson({b:1,a:[2,1],c:undefined})).toBe(canonicalJson({a:[2,1],b:1}));
    expect(canonicalJson({a:[1,2]})).not.toBe(canonicalJson({a:[2,1]}));
  });
});

describe('#44 evidence index — normal',()=>{
  it('indexes a manifest-listed approved revision with citation, revision, paragraph and source fields',()=>{
    const n=rev('N1','r1',{conditions:{campuses:['SEOUL'],admissionYears:{from:2023}}});
    const index=build([n]);
    expect(index.status).toBe('READY');
    expect(index.snapshotId).toBe('SYN-SNAP-1');
    expect(index.entries).toHaveLength(1);
    expect(index.entries[0]).toMatchObject({
      citationId:'NOTICE:N1:r1:p1',documentId:'N1',revisionId:'r1',paragraphId:'p1',indexRevision:'idx-1',
      sourceUrl:'https://example.org/synthetic/N1',verifiedAt:'2026-11-02T00:00:00+09:00',provenance:'SYNTHETIC',
      conditions:{campuses:['SEOUL'],admissionYears:{from:2023}},status:'READY',holdReasons:[],
    });
  });
  it('a missing condition stays null (unstated), never widened to everyone',()=>{
    expect(build([rev('N1','r1')]).entries[0]!.conditions).toBeNull();
  });
  it('uses the corrected latest revision and records the superseded one',()=>{
    const r1=rev('N1','r1');
    const r2=rev('N1','r2',{state:'CORRECTED',publishedAt:'2026-11-05T00:00:00+09:00',
      paragraphs:[{id:'p1',text:'가상 학생 신청 기간은 가상 2주차로 정정합니다.'}]});
    const index=build([r1,r2],[r2]);
    expect(index.entries.map(e=>e.citationId)).toEqual(['NOTICE:N1:r2:p1']);
    expect(index.entries[0]!.revisionState).toBe('CORRECTED');
    expect(index.documents[0]).toMatchObject({disposition:'INDEXED',revisionId:'r2',supersededRevisionIds:['r1']});
  });
  it('notice and FAQ with the same document ID do not collide',()=>{
    const index=build([rev('X1','r1'),rev('X1','r1',{kind:'FAQ'})]);
    expect(index.entries.map(e=>e.citationId)).toEqual(['FAQ:X1:r1:p1','NOTICE:X1:r1:p1']);
  });
  it('is deterministic regardless of input and key order',()=>{
    const rows=[rev('B','r1'),rev('A','r2',{publishedAt:'2026-11-03T00:00:00+09:00'}),rev('A','r1')];
    const listed=[rows[0]!,rows[1]!];
    const a=buildEvidenceIndex({manifest:manifestOf(listed),revisions:rows,asOf:AS_OF});
    const b=buildEvidenceIndex({manifest:manifestOf([...listed].reverse()),revisions:[...rows].reverse(),asOf:AS_OF});
    expect(canonicalJson(b)).toBe(canonicalJson(a));
  });
  it('adapts existing FAQ documents and indexes them',()=>{
    const faq:FaqDocument={documentId:'F1',revisionId:'r1',title:'가상 휴학 FAQ',sourceUrl:'https://example.org/synthetic/F1',
      category:'ACADEMICS',publishedAt:'2026-01-01T00:00:00Z',verifiedAt:'2026-01-02T00:00:00Z',effectiveFrom:'2026-01-01',
      rights:'APPROVED',provenance:'SYNTHETIC',accessScope:'PUBLIC',
      paragraphs:[{id:'p1',text:'가상 휴학 신청은 가상 포털에서 합니다.',publicContacts:['02-0000-0000']}]};
    const r=evidenceRevisionFromFaq(faq);
    const index=build([r]);
    expect(index.entries[0]).toMatchObject({citationId:'FAQ:F1:r1:p1',publicContacts:['02-0000-0000']});
  });
});

describe('#44 evidence index — boundaries',()=>{
  it('orders revision IDs numerically (r10 after r9)',()=>{
    const same='2026-11-03T00:00:00+09:00';
    const r9=rev('N1','r9',{publishedAt:same}),r10=rev('N1','r10',{publishedAt:same,paragraphs:[{id:'p1',text:'가상 열 번째 판본 문단입니다.'}]});
    expect(build([r10,r9],[r10]).entries[0]!.revisionId).toBe('r10');
  });
  it('a revision published exactly at asOf is visible; one millisecond later is not',()=>{
    const at=rev('N1','r1',{publishedAt:AS_OF,verifiedAt:AS_OF});
    expect(disposition(build([at]),'N1')).toBe('INDEXED');
    const later=rev('N1','r1',{publishedAt:'2026-11-21T03:00:00.001Z',verifiedAt:'2026-11-21T03:00:00.001Z'});
    expect(disposition(build([later]),'N1')).toBe('AFTER_AS_OF');
  });
  it('a future correction is ignored at asOf and reported, the current revision stays indexed',()=>{
    const r1=rev('N1','r1');
    const r2=rev('N1','r2',{state:'CORRECTED',publishedAt:'2026-12-01T00:00:00+09:00',verifiedAt:'2026-12-01T00:00:00+09:00'});
    const index=build([r1,r2],[r1]);
    expect(index.documents[0]).toMatchObject({disposition:'INDEXED',revisionId:'r1',futureRevisionIds:['r2']});
  });
  it('verifiedAt after asOf hides an otherwise published revision',()=>{
    expect(disposition(build([rev('N1','r1',{verifiedAt:'2026-11-22T00:00:00+09:00'})]),'N1')).toBe('AFTER_AS_OF');
  });
  it('effective period boundaries use KST calendar days',()=>{
    // 2026-11-21 KST 하루 동안 유효. AS_OF(12:00 KST)는 안, 다음 날 0시 KST는 밖.
    const r=rev('N1','r1',{effectiveFrom:'2026-11-21',effectiveUntil:'2026-11-21'});
    expect(disposition(build([r]),'N1')).toBe('INDEXED');
    expect(disposition(build([r],[r],'2026-11-21T15:00:00Z'),'N1')).toBe('NOT_IN_EFFECT');
    const untilOnly=rev('N2','r1',{effectiveUntil:'2026-11-20'});
    expect(disposition(build([untilOnly]),'N2')).toBe('NOT_IN_EFFECT');
  });
  it('identical duplicate copies merge into one revision',()=>{
    const r=rev('N1','r1');
    expect(build([r,{...r}],[r]).entries).toHaveLength(1);
  });
});

describe('#44 evidence index — hold and exclusion (no silent fallback)',()=>{
  it('a revoked latest revision excludes the document instead of reviving the older approved one',()=>{
    const r1=rev('N1','r1'),r2=rev('N1','r2',{rights:'REVOKED',publishedAt:'2026-11-05T00:00:00+09:00'});
    const index=build([r1,r2],[r1]);
    expect(disposition(index,'N1')).toBe('RIGHTS_REVOKED');
    expect(index.entries).toEqual([]);
    expect(index.status).toBe('PARTIAL');
  });
  it('a blocked latest revision is also excluded',()=>{
    expect(disposition(build([rev('N1','r1',{rights:'BLOCKED'})]),'N1')).toBe('RIGHTS_REVOKED');
  });
  it('a cancellation revision removes all paragraphs of the document',()=>{
    const r1=rev('N1','r1'),r2=rev('N1','r2',{state:'CANCELLED',publishedAt:'2026-11-05T00:00:00+09:00',paragraphs:[]});
    const index=build([r1,r2],[r2]);
    expect(index.documents[0]).toMatchObject({disposition:'CANCELLED',revisionId:'r2',supersededRevisionIds:['r1']});
    expect(index.entries).toEqual([]);
  });
  it('same revision copies with different content are quarantined',()=>{
    const a=rev('N1','r1'),b=rev('N1','r1',{paragraphs:[{id:'p1',text:'가상 학생 신청 기간은 가상 3주차입니다.'}]});
    expect(disposition(build([a,b],[a]),'N1')).toBe('REVISION_CONFLICT');
  });
  it('r1 and r01 at the same position with different content are quarantined',()=>{
    const a=rev('N1','r1'),b=rev('N1','r01',{title:'가상 다른 제목'});
    expect(disposition(build([a,b],[a]),'N1')).toBe('REVISION_CONFLICT');
  });
  it('same revision ID with a different publish time is a conflicting copy, not a new revision',()=>{
    const a=rev('N1','r2'),b=rev('N1','r2',{publishedAt:'2026-11-03T00:00:00+09:00'});
    expect(disposition(build([a,b],[b]),'N1')).toBe('REVISION_CONFLICT');
  });
  it('self-declared approval without a manifest entry is not indexed',()=>{
    const index=build([rev('N1','r1')],[]);
    expect(disposition(index,'N1')).toBe('NOT_IN_MANIFEST');
    expect(index.entries).toEqual([]);
  });
  it('manifest pointing to an older revision than the latest is a mismatch',()=>{
    const r1=rev('N1','r1'),r2=rev('N1','r2',{state:'CORRECTED',publishedAt:'2026-11-05T00:00:00+09:00'});
    expect(disposition(build([r1,r2],[r1]),'N1')).toBe('MANIFEST_MISMATCH');
  });
  it('content changed after the manifest was built is a mismatch',()=>{
    const listed=rev('N1','r1');
    const edited=rev('N1','r1',{paragraphs:[{id:'p1',text:'가상 학생 신청 기간은 가상 4주차입니다.'}]});
    expect(disposition(build([edited],[listed]),'N1')).toBe('MANIFEST_MISMATCH');
  });
  it('a manifest entry whose revision is missing from the input is a mismatch and keeps status PARTIAL',()=>{
    const index=build([rev('N1','r1')],[rev('N1','r1'),rev('N9','r1')]);
    expect(disposition(index,'N9')).toBe('MANIFEST_MISMATCH');
    expect(disposition(index,'N1')).toBe('INDEXED');
    expect(index.status).toBe('PARTIAL');
  });
});

describe('#44 evidence index — notice and FAQ reference the same evidence revision',()=>{
  const notice=rev('N1','r2',{state:'CORRECTED'});
  const faqWith=(revisionId:string)=>rev('F1','r1',{kind:'FAQ',
    paragraphs:[{id:'p1',text:'가상 수강신청 기간은 해당 공지를 따릅니다.',refs:[{kind:'NOTICE',documentId:'N1',revisionId}]}]});
  it('FAQ paragraph citing the indexed notice revision is READY',()=>{
    const index=build([notice,faqWith('r2')]);
    expect(index.entries.find(e=>e.kind==='FAQ')).toMatchObject({status:'READY',holdReasons:[]});
    expect(index.status).toBe('READY');
  });
  it('FAQ paragraph citing a superseded notice revision is held',()=>{
    const index=build([rev('N1','r1',{publishedAt:'2026-10-01T00:00:00+09:00'}),notice,faqWith('r1')],[notice,faqWith('r1')]);
    expect(index.entries.find(e=>e.kind==='FAQ')).toMatchObject({status:'HOLD',holdReasons:['REF_REVISION_MISMATCH']});
    expect(index.status).toBe('PARTIAL');
  });
  it('FAQ paragraph citing a cancelled or unindexed notice is held',()=>{
    const cancelled=rev('N1','r3',{state:'CANCELLED',publishedAt:'2026-11-06T00:00:00+09:00',paragraphs:[]});
    const index=build([notice,cancelled,faqWith('r2')],[cancelled,faqWith('r2')]);
    expect(index.entries.find(e=>e.kind==='FAQ')).toMatchObject({status:'HOLD',holdReasons:['REF_NOT_INDEXED']});
  });
});

describe('#44 evidence index — failures',()=>{
  it('mixed synthetic and real provenance fails closed',()=>{
    const real=rev('N2','r1',{provenance:'REAL_APPROVED'});
    expect(()=>build([rev('N1','r1'),real])).toThrow(/Mixed/);
  });
  it('a manifest of the other provenance fails closed',()=>{
    const r=rev('N1','r1');
    expect(()=>buildEvidenceIndex({manifest:manifestOf([r],{provenance:'REAL_APPROVED'}),revisions:[r],asOf:AS_OF})).toThrow(/Mixed/);
  });
  it('rejects invalid asOf, duplicate manifest entries and malformed revisions',()=>{
    const r=rev('N1','r1');
    expect(()=>build([r],[r],'not-a-date')).toThrow(RangeError);
    expect(()=>buildEvidenceIndex({manifest:manifestOf([r,r]),revisions:[r],asOf:AS_OF})).toThrow();
    expect(()=>build([{...r,sourceUrl:'http://example.org/insecure'}])).toThrow();
    expect(()=>build([{...r,paragraphs:[]}])).toThrow();
    expect(()=>build([{...r,extra:true} as unknown as EvidenceRevision])).toThrow();
    expect(()=>build([rev('N1','r1',{conditions:{admissionYears:{from:2025,until:2023}}})])).toThrow();
  });
  it('a repeated paragraph ID inside one revision fails closed',()=>{
    const twice=rev('N1','r1',{paragraphs:[{id:'p1',text:'가상 첫 문단입니다.'},{id:'p1',text:'가상 두 번째 문단입니다.'}]});
    expect(()=>build([twice])).toThrow(/Ambiguous/);
  });
});
