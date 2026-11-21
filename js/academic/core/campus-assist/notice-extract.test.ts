import {describe,expect,it} from 'vitest';
import {extractNoticeCandidates,type NoticeExtractInput,type NoticeExtraction} from './notice-extract.js';

// 모든 공지는 SYNTHETIC 가상 문장이다. 실제 한국외대 공지를 복제하지 않았으며 추출 품질 수치로 쓰지 않는다.
const notice=(texts:string[],patch:Partial<NoticeExtractInput>={}):NoticeExtractInput=>({
  noticeId:'SYN-N1',revisionId:'r1',title:'가상 학사 안내',publishedAt:'2026-02-20T10:00:00+09:00',
  state:'PUBLISHED',rights:'APPROVED',provenance:'SYNTHETIC',
  paragraphs:texts.map((text,i)=>({id:'p'+(i+1),text})),...patch,
});
const x=(texts:string[],patch:Partial<NoticeExtractInput>={})=>extractNoticeCandidates(notice(texts,patch));
/** 모든 근거 위치가 원문의 정확한 부분 문자열인지 확인한다. */
function expectSpansExact(input:NoticeExtractInput,out:NoticeExtraction){
  const text=new Map(input.paragraphs.map(p=>[p.id,p.text]));
  for(const e of [...out.dates.map(d=>d.evidence),...out.targets.included.map(t=>t.evidence),...out.targets.excluded.map(t=>t.evidence)])
    expect(text.get(e.paragraphId)!.slice(e.start,e.end)).toBe(e.text);
}

describe('#46 normal extraction',()=>{
  it('extracts a student application period with a stated time and the student deadline',()=>{
    const input=notice(['가상 이중전공 신청 기간: 2026. 3. 2.(월) 10:00 ~ 2026. 3. 6.(금) 18:00']);
    const out=extractNoticeCandidates(input);
    expect(out.studentDeadline).toMatchObject({role:'STUDENT_DEADLINE',date:'2026-03-06',time:'18:00',
      atKst:'2026-03-06T18:00:00+09:00',yearInferred:false});
    expect(out.dates.map(d=>d.role)).toEqual(['PERIOD_START','STUDENT_DEADLINE']);
    expect(out.status).toBe('CANDIDATE');
    expect(out.reviewReasons).toEqual([]);
    expectSpansExact(input,out);
  });
  it('separates the student deadline from the department (administrative) deadline in one sentence',()=>{
    const input=notice(['가상 졸업논문 제출은 2026. 4. 10.(금) 17:00까지 신청하며, 학과는 2026. 4. 17.(금) 17:00까지 학사지원팀으로 제출합니다.']);
    const out=extractNoticeCandidates(input);
    expect(out.studentDeadline?.date).toBe('2026-04-10');
    expect(out.adminDeadline?.date).toBe('2026-04-17');
    expectSpansExact(input,out);
  });
  it('a student submitting to the department office is still a student deadline',()=>{
    const out=x(['가상 휴학 서류는 학과 사무실에 2026. 3. 13.(금) 17:00까지 제출합니다.']);
    expect(out.studentDeadline?.date).toBe('2026-03-13');
    expect(out.adminDeadline).toBeNull();
  });
  it('extracts exam/event dates separately from deadlines',()=>{
    const out=x(['가상 졸업시험 시행일: 2026. 5. 9.(토) 10:00','가상 응시 신청은 2026. 4. 24.(금) 18:00까지입니다.']);
    expect(out.events.map(e=>e.date)).toEqual(['2026-05-09']);
    expect(out.studentDeadline?.date).toBe('2026-04-24');
  });
  it('extracts campus, admission-year range and student groups',()=>{
    const input=notice(['가상 신청 대상: 서울캠퍼스 2022~2024학번 재학생 및 졸업예정자']);
    const out=extractNoticeCandidates(input);
    expect(out.targets.included.map(t=>t.value)).toEqual([
      {kind:'CAMPUS',campus:'SEOUL'},{kind:'ADMISSION_YEARS',from:2022,until:2024},
      {kind:'STUDENT_GROUP',group:'ENROLLED'},{kind:'STUDENT_GROUP',group:'GRADUATING'},
    ]);
    expectSpansExact(input,out);
  });
  it('handles 학년도 입학생, two-digit 학번 and open-ended ranges',()=>{
    const out=x(['가상 2021학년도 이후 입학생 대상','가상 19학번 이전 학생은 별도 안내']);
    expect(out.targets.included.map(t=>t.value)).toEqual([
      {kind:'ADMISSION_YEARS',from:2021},{kind:'ADMISSION_YEARS',until:2019},
    ]);
  });
  it('handles Korean 년/월/일 dates, 부터~까지 ranges and 오후 times',()=>{
    const out=x(['가상 신청은 2026년 3월 2일(월)부터 3월 6일(금) 오후 6시까지 접수합니다.']);
    expect(out.dates.map(d=>[d.role,d.date,d.time])).toEqual([['PERIOD_START','2026-03-02',null],['STUDENT_DEADLINE','2026-03-06','18:00']]);
  });
  it('24:00 deadline resolves to the next day 00:00 KST',()=>{
    expect(x(['가상 접수 마감: 2026. 3. 6.(금) 24:00']).studentDeadline?.atKst).toBe('2026-03-07T00:00:00+09:00');
  });
  it('is deterministic',()=>{
    const t=['가상 신청 기간: 2026. 3. 2.(월) ~ 3. 6.(금) 18:00, 서울캠퍼스 재학생 대상'];
    expect(JSON.stringify(x(t))).toBe(JSON.stringify(x(t)));
  });
});

describe('#46 publication date is never a student deadline',()=>{
  it('a 게시일 line in the body is POSTED, not a deadline',()=>{
    const out=x(['게시일: 2026. 2. 20.(금)','가상 안내 사항을 확인하십시오.']);
    expect(out.dates.map(d=>d.role)).toEqual(['POSTED']);
    expect(out.studentDeadline).toBeNull();
  });
  it('a notice with no date in the text yields no student deadline (publishedAt is not used)',()=>{
    const out=x(['가상 이중전공 신청은 추후 안내합니다.']);
    expect(out.dates).toEqual([]);
    expect(out.studentDeadline).toBeNull();
  });
});

describe('#46 review routing (ambiguity is sent to independent review)',()=>{
  it('a deadline without a time keeps time null and asks for review (no 23:59 fill-in)',()=>{
    const out=x(['가상 신청 마감: 2026. 3. 6.(금)']);
    expect(out.studentDeadline).toMatchObject({date:'2026-03-06',time:null,atKst:null});
    expect(out.reviewReasons).toContain('TIME_UNSTATED');
    expect(out.status).toBe('NEEDS_REVIEW');
  });
  it('a year-less date is inferred from the publish date and flagged',()=>{
    const out=x(['가상 신청은 3월 6일(금) 18:00까지입니다.']);
    expect(out.studentDeadline).toMatchObject({date:'2026-03-06',yearInferred:true});
    expect(out.reviewReasons).toContain('YEAR_INFERRED');
  });
  it('a year-less January date in a December notice rolls to the next year and is flagged',()=>{
    const out=x(['가상 신청은 1월 5일(월) 18:00까지입니다.'],{publishedAt:'2026-12-10T09:00:00+09:00'});
    expect(out.studentDeadline?.date).toBe('2027-01-05');
    expect(out.reviewReasons).toContain('YEAR_INFERRED');
  });
  it('two different student deadlines are not merged into one',()=>{
    const out=x(['가상 1차 신청 마감: 2026. 3. 6.(금) 18:00','가상 2차 신청 마감: 2026. 3. 20.(금) 18:00']);
    expect(out.studentDeadline).toBeNull();
    expect(out.reviewReasons).toContain('MULTIPLE_STUDENT_DEADLINES');
    expect(out.dates.filter(d=>d.role==='STUDENT_DEADLINE')).toHaveLength(2);
  });
  it('a date with no role cue is UNCLASSIFIED',()=>{
    const out=x(['가상 참고: 2026. 3. 9.(월)']);
    expect(out.dates[0]?.role).toBe('UNCLASSIFIED');
    expect(out.reviewReasons).toContain('UNCLASSIFIED_DATE');
  });
  it('an impossible date or a reversed range is flagged instead of guessed',()=>{
    expect(x(['가상 신청 마감: 2026. 2. 30.(월) 18:00']).reviewReasons).toContain('INVALID_DATE');
    expect(x(['가상 신청 마감: 2026. 3. 6.(금) 25:00']).reviewReasons).toContain('INVALID_DATE');
    const rev=x(['가상 신청 기간: 2026. 3. 6.(금) ~ 2026. 3. 2.(월)']);
    expect(rev.reviewReasons).toContain('RANGE_REVERSED');
    expect(rev.studentDeadline).toBeNull();
  });
});

describe('#46 negation, exceptions and multiple targets',()=>{
  it('excluded groups are recorded as exclusions, not as targets',()=>{
    const input=notice(['가상 신청 대상은 2023학번 이후 재학생이며, 휴학생은 제외합니다.']);
    const out=extractNoticeCandidates(input);
    expect(out.targets.included.map(t=>t.value)).toEqual([{kind:'ADMISSION_YEARS',from:2023},{kind:'STUDENT_GROUP',group:'ENROLLED'}]);
    expect(out.targets.excluded.map(t=>t.value)).toEqual([{kind:'STUDENT_GROUP',group:'ON_LEAVE'}]);
    expect(out.reviewReasons).toContain('NEGATION_OR_EXCEPTION');
    expectSpansExact(input,out);
  });
  it('"해당 없음" and "신청할 수 없" negations are exclusions',()=>{
    const out=x(['가상 글로벌캠퍼스 학생은 해당 없음','가상 교환학생은 신청할 수 없습니다.']);
    expect(out.targets.included).toEqual([]);
    expect(out.targets.excluded.map(t=>t.value)).toEqual([{kind:'CAMPUS',campus:'GLOBAL'},{kind:'STUDENT_GROUP',group:'EXCHANGE'}]);
  });
  it('a "단," exception clause sends the notice to review',()=>{
    expect(x(['가상 서울캠퍼스 재학생 대상입니다. 단, 별도 심사가 있습니다.']).reviewReasons).toContain('NEGATION_OR_EXCEPTION');
  });
  it('the same target both included and excluded is a conflict',()=>{
    const out=x(['가상 서울캠퍼스 학생 대상','가상 서울캠퍼스 학생은 제외']);
    expect(out.reviewReasons).toContain('CONFLICTING_TARGET');
  });
  it('both campuses can be targets at once',()=>{
    const out=x(['가상 서울캠퍼스, 글로벌캠퍼스 재학생 모두 신청 가능']);
    expect(out.targets.included.filter(t=>t.value.kind==='CAMPUS')).toHaveLength(2);
  });
  it('a missing target is left empty (unstated), never widened to everyone',()=>{
    expect(x(['가상 신청 마감: 2026. 3. 6.(금) 18:00']).targets).toEqual({included:[],excluded:[]});
  });
  it('a grade average like "3.0 이상" is not read as a date',()=>{
    expect(x(['가상 평점 3.0 이상 재학생 대상']).dates).toEqual([]);
  });
});

describe('#46 correction, cancellation and rights',()=>{
  it('a correction revision links to the corrected revision',()=>{
    const out=x(['가상 신청 기간을 다음과 같이 정정합니다. 신청 마감: 2026. 3. 13.(금) 18:00'],
      {title:'[정정] 가상 이중전공 신청 안내',state:'CORRECTED',revisionId:'r2',correctsRevisionId:'r1'});
    expect(out.revisionLink).toEqual({kind:'CORRECTION',correctsRevisionId:'r1'});
    expect(out.status).toBe('CANDIDATE');
  });
  it('correction wording without a CORRECTED state, or without the target revision, goes to review',()=>{
    const mismatch=x(['가상 일정을 다음과 같이 변경합니다.'],{title:'[정정] 가상 안내'});
    expect(mismatch.reviewReasons).toEqual(expect.arrayContaining(['CORRECTION_STATE_MISMATCH','CORRECTION_TARGET_UNKNOWN']));
    const noTarget=x(['가상 내용 정정 안내'],{state:'CORRECTED'});
    expect(noTarget.reviewReasons).toContain('CORRECTION_TARGET_UNKNOWN');
  });
  it('the regular term "수강신청 정정 기간" or "수강취소" is not a notice correction/cancellation',()=>{
    const out=x(['가상 수강신청 정정 기간: 2026. 3. 3.(화) ~ 3. 6.(금) 17:00','가상 수강취소는 포털에서 신청합니다.'],
      {title:'가상 수강신청 정정 및 수강취소 안내'});
    expect(out.revisionLink).toBeNull();
    expect(out.studentDeadline?.date).toBe('2026-03-06');
  });
  it('a cancellation is linked and wording-vs-state mismatches are flagged',()=>{
    const ok=x(['가상 설명회가 취소되었습니다.'],{title:'[취소] 가상 설명회',state:'CANCELLED',revisionId:'r2',correctsRevisionId:'r1'});
    expect(ok.revisionLink).toEqual({kind:'CANCELLATION',correctsRevisionId:'r1'});
    expect(ok.reviewReasons).toEqual([]);
    const mismatch=x(['가상 설명회가 취소되었습니다.']);
    expect(mismatch.reviewReasons).toContain('CANCELLATION_STATE_MISMATCH');
    expect(mismatch.revisionLink?.kind).toBe('CANCELLATION');
  });
  it('a notice without reuse rights is not extracted at all',()=>{
    for(const rights of ['REVOKED','BLOCKED'] as const){
      const out=x(['가상 신청 마감: 2026. 3. 6.(금) 18:00 서울캠퍼스'],{rights});
      expect(out).toMatchObject({status:'EXCLUDED',dates:[],studentDeadline:null,reviewReasons:['RIGHTS_NOT_APPROVED']});
      expect(out.targets).toEqual({included:[],excluded:[]});
    }
  });
});

describe('#46 failures',()=>{
  it('rejects malformed input',()=>{
    expect(()=>x(['가상'],{publishedAt:'2026-02-20'})).toThrow();
    expect(()=>x(['가상'],{noticeId:'bad id'})).toThrow();
    expect(()=>extractNoticeCandidates({...notice(['a']),extra:1} as unknown as NoticeExtractInput)).toThrow();
  });
  it('rejects duplicate paragraph IDs',()=>{
    expect(()=>x(['가상 하나','가상 둘'],{paragraphs:[{id:'p1',text:'가상 하나'},{id:'p1',text:'가상 둘'}]})).toThrow(/Duplicate/);
  });
});
