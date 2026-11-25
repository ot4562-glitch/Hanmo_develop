// @ts-check
/** @typedef {import("../../contracts/campus-assist/index.js").ActivityRecord} ActivityRecord */
/** @typedef {import("./notice-extract.js").NoticeExtractInput} NoticeExtractInput */
import {describe,expect,it} from 'vitest';
import {extractNoticeCandidates} from './notice-extract.js';
import {forecastActivity} from './activities.js';
import {activityRecordFromNotice,backtestActivityForecast,isCalendarDay} from './activity-series.js';

// 모든 공지·행사일은 SYNTHETIC 가상 자료다. 적중률·구간 폭은 손으로 계산한 기대값이며 실제 예측 품질이 아니다.
/**
 * @param {string} title @param {string[]} texts
 * @param {Partial<NoticeExtractInput>} [patch]
 */
const link=(title,texts,patch={},confirmed=true)=>{
  const input={noticeId:'SYN-GX',revisionId:'r1',title,publishedAt:'2026-03-02T10:00:00+09:00',state:/** @type {const} */('PUBLISHED'),
    rights:/** @type {const} */('APPROVED'),provenance:/** @type {const} */('SYNTHETIC'),
    paragraphs:texts.map((text,i)=>({id:'p'+(i+1),text})),...patch};
  return activityRecordFromNotice({extraction:extractNoticeCandidates(input),title,sourceUrl:'https://example.org/synthetic/gx',
    publishedAt:input.publishedAt,organizationId:'SYN-ACADEMIC',verifiedAt:'2026-03-03T10:00:00+09:00',eventDateConfirmed:confirmed});
};
const EXAM=['가상 대상: 서울캠퍼스 재학생','가상 이중전공 설명회 일시: 2026. 5. 9.(토) 10:00'];

describe('#52 linking notices to an event series',()=>{
  it('a confirmed single exam date becomes a CONFIRMED record in the campus series',()=>{
    const r=link('가상 이중전공 설명회 안내',EXAM);
    expect(r.issues).toEqual([]);
    expect(r.record).toMatchObject({seriesId:'DOUBLE_MAJOR_APPLICATION.SEOUL',campus:'SEOUL',eventDate:'2026-05-09',status:'CONFIRMED',
      revisionId:'SYN-GX:r1',publishedAt:'2026-03-02T10:00:00+09:00'});
  });
  it('an unconfirmed, year-inferred or multiple event date is not used as the event date',()=>{
    expect(link('가상 이중전공 설명회 안내',EXAM,{},false)).toMatchObject({issues:['EVENT_DATE_NOT_CONFIRMED'],record:{status:'ANNOUNCED'}});
    // 연도 추정은 추출 단계의 NEEDS_REVIEW로 먼저 막힌다.
    expect(link('가상 이중전공 설명회 안내',['가상 대상: 서울캠퍼스 재학생','가상 이중전공 설명회 일시: 5월 9일(토) 10:00']))
      .toMatchObject({record:null,issues:['EXTRACTION_NEEDS_REVIEW']});
    expect(link('가상 이중전공 설명회 안내',['가상 대상: 서울캠퍼스 재학생','가상 1차 설명회 일시: 2026. 5. 9.(토) 10:00',
      '가상 2차 설명회 일시: 2026. 5. 16.(토) 10:00']).issues).toEqual(['MULTIPLE_EVENT_DATES']);
  });
  it('the publish date is never used as the event date',()=>{
    const r=link('가상 이중전공 안내',['가상 대상: 서울캠퍼스 재학생','가상 세부 일정은 추후 안내합니다.']);
    expect(r.issues).toEqual(['NO_EVENT_DATE']);
    expect(r.record?.eventDate).toBeUndefined();
  });
  it('a notice without a stated campus or a known series is not linked',()=>{
    expect(link('가상 이중전공 설명회 안내',['가상 이중전공 설명회 일시: 2026. 5. 9.(토) 10:00'])).toMatchObject({record:null,issues:['CAMPUS_UNSTATED']});
    expect(link('가상 기숙사 입사 안내',EXAM)).toMatchObject({record:null,issues:['NOT_A_KNOWN_SERIES']});
  });
  it('both campuses become a BOTH series, separate from single-campus series',()=>{
    const r=link('가상 이중전공 신청 안내',['가상 대상: 서울캠퍼스, 글로벌캠퍼스 재학생','가상 설명회 일시: 2026. 3. 20.(금) 15:00']);
    expect(r.record?.seriesId).toBe('DOUBLE_MAJOR_APPLICATION.BOTH');
  });
  it('a cancellation keeps the link to the cancelled revision and has no event date',()=>{
    const r=link('[취소] 가상 이중전공 설명회 안내',['가상 대상: 서울캠퍼스 재학생','가상 설명회가 취소되었습니다.'],
      {revisionId:'r2',state:'CANCELLED',correctsRevisionId:'r1'});
    expect(r.record).toMatchObject({status:'CANCELLED',supersedes:'SYN-GX:r1',revisionId:'SYN-GX:r2'});
    expect(r.record?.eventDate).toBeUndefined();
  });
  it('graduation or school-rule notices are never linked to a series (written reply 2026-11-23)',()=>{
    for(const title of ['가상 졸업시험 시행 안내','가상 졸업 논문 제출 안내','가상 학칙 개정 및 이중전공 안내'])
      expect(link(title,EXAM)).toMatchObject({record:null,seriesType:null,issues:['EXCLUDED_TOPIC']});
  });
  // PR #120 리뷰(2026-11-23): 검수가 필요한 추출 결과는 행사일이 유효해도 승인 기록이 되면 안 된다.
  it('an extraction that needs review is never linked, even with a valid confirmed event date',()=>{
    const cases=[
      // 부정·예외 문장
      ['가상 이중전공 설명회 안내',['가상 대상: 서울캠퍼스 재학생이며, 휴학생은 제외합니다.','가상 이중전공 설명회 일시: 2026. 5. 9.(토) 10:00'],{}],
      // 같은 대상의 포함·제외 충돌
      ['가상 이중전공 설명회 안내',['가상 서울캠퍼스 학생 대상','가상 서울캠퍼스 학생은 제외','가상 이중전공 설명회 일시: 2026. 5. 9.(토) 10:00'],{}],
      // 정정 판본인데 정정 대상 판본 불명
      ['[정정] 가상 이중전공 설명회 안내',EXAM,{revisionId:'r2',state:'CORRECTED'}],
    ];
    for(const [title,texts,patch] of /** @type {[string,string[],Partial<NoticeExtractInput>][]} */(cases)){
      expect(link(title,texts,patch,true)).toEqual({record:null,seriesType:null,issues:['EXTRACTION_NEEDS_REVIEW']});
    }
  });
  it('a needs-review notice cannot reach the forecast through the series',()=>{
    const needsReview=link('가상 이중전공 설명회 안내',['가상 대상: 서울캠퍼스 재학생이며, 휴학생은 제외합니다.',
      '가상 이중전공 설명회 일시: 2026. 5. 9.(토) 10:00'],{},true);
    expect(needsReview.record).toBeNull();
  });
  it('a notice without reuse rights is not linked',()=>{
    expect(link('가상 이중전공 설명회 안내',EXAM,{rights:'REVOKED'})).toMatchObject({record:null,issues:['EXCLUDED']});
  });
});

/**
 * @param {number} y @param {string} md @param {Partial<ActivityRecord>} [extra]
 * @returns {ActivityRecord}
 */
const rec=(y,md,extra={})=>({entryId:'e'+y,sourceId:'s'+y,revisionId:'v'+y,organizationId:'SYN-ACADEMIC',
  seriesId:'DOUBLE_MAJOR_APPLICATION.SEOUL',title:'가상 이중전공 설명회',kind:'ACADEMIC',campus:'SEOUL',
  publishedAt:y+'-04-01T00:00:00+09:00',verifiedAt:y+'-04-02T00:00:00+09:00',eventDate:y+'-'+md,
  sourceUrl:'https://example.org/synthetic/'+y,status:'CONFIRMED',rights:'APPROVED',provenance:'SYNTHETIC',...extra});
const HISTORY=[rec(2021,'05-10'),rec(2022,'05-12'),rec(2023,'05-11'),rec(2024,'06-20'),rec(2025,'05-14')];
/** @param {ActivityRecord[]} records @param {number[]} years */
const bt=(records,years)=>backtestActivityForecast({records,organizationId:'SYN-ACADEMIC',seriesId:'DOUBLE_MAJOR_APPLICATION.SEOUL',years});

describe('#52 backtest: hit rate and window width per as-of point',()=>{
  it('records each year with hand-checked windows, hits and widths',()=>{
    const r=bt(HISTORY,[2022,2023,2024,2025,2026]);
    expect(r.rows.map(x=>[x.targetYear,x.state,x.from,x.to,x.actual,x.hit,x.widthDays])).toEqual([
      // 2022: 이전 연도 1개뿐이라 보류
      [2022,'INSUFFICIENT_DATA',null,null,'2022-05-12',null,null],
      // 2023: 05-10·05-12 → 05-03~05-19(17일), 실제 05-11 적중
      [2023,'PREDICTED','2023-05-03','2023-05-19','2023-05-11',true,17],
      // 2024: 같은 구간, 실제 06-20은 벗어남
      [2024,'PREDICTED','2024-05-03','2024-05-19','2024-06-20',false,17],
      // 2025: 06-20까지 포함해 분산 41일(45일 이하) → 05-03~06-27(56일), 실제 05-14 적중
      [2025,'PREDICTED','2025-05-03','2025-06-27','2025-05-14',true,56],
      // 2026: 실제 행사일 없음 → 평가 제외
      [2026,'PREDICTED','2026-05-03','2026-06-27',null,null,56],
    ]);
    expect(r).toMatchObject({evaluated:4,predicted:3,coverage:0.75,hitRate:0.6667,meanWidthDays:30,provenance:'SYNTHETIC'});
  });
  it('a later correction does not leak into an earlier as-of point',()=>{
    // 2022 행사일을 2024년에 06-30으로 정정한 판본. 2023년 1월 1일 시점 예측에는 보이지 않아야 한다.
    const corrected=rec(2022,'06-30',{revisionId:'v2022b',entryId:'e2022b',publishedAt:'2024-02-01T00:00:00+09:00',verifiedAt:'2024-02-02T00:00:00+09:00'});
    const r=bt([...HISTORY,corrected],[2023]);
    expect(r.rows[0]).toMatchObject({from:'2023-05-03',to:'2023-05-19'});
  });
  it('a later as-of date can be chosen (MM-DD) and validated',()=>{
    expect(backtestActivityForecast({records:HISTORY,organizationId:'SYN-ACADEMIC',seriesId:'DOUBLE_MAJOR_APPLICATION.SEOUL',years:[2023],asOfMonthDay:'05-01'})
      .rows[0]?.asOf).toBe('2023-05-01T00:00:00+09:00');
    expect(()=>backtestActivityForecast({records:HISTORY,organizationId:'SYN-ACADEMIC',seriesId:'DOUBLE_MAJOR_APPLICATION.SEOUL',years:[2023],asOfMonthDay:'13-01'})).toThrow(RangeError);
  });
  it('rejects month-days that do not exist instead of rolling them into the next month (#120 review)',()=>{
    /** @param {string} md @param {number[]} years */
    const at=(md,years)=>backtestActivityForecast({records:HISTORY,organizationId:'SYN-ACADEMIC',seriesId:'DOUBLE_MAJOR_APPLICATION.SEOUL',years,asOfMonthDay:md});
    expect(()=>at('02-31',[2023])).toThrow(/does not exist/);
    expect(()=>at('04-31',[2023])).toThrow(/does not exist/);
    expect(()=>at('02-30',[2024])).toThrow(/does not exist/);
    // 평년 02-29는 거부하고, 윤년 02-29는 그대로 허용한다(03-01로 바뀌지 않음).
    expect(()=>at('02-29',[2023])).toThrow(/does not exist/);
    expect(()=>at('02-29',[2024,2025])).toThrow(/2025/);
    expect(at('02-29',[2024]).rows[0]?.asOf).toBe('2024-02-29T00:00:00+09:00');
    // 월말 경계의 실제 날짜는 허용한다.
    expect(at('04-30',[2023]).rows[0]?.asOf).toBe('2023-04-30T00:00:00+09:00');
    expect(at('12-31',[2023]).rows[0]?.asOf).toBe('2023-12-31T00:00:00+09:00');
  });
  it('isCalendarDay checks leap years including century rules',()=>{
    expect(isCalendarDay(2024,'02-29')).toBe(true);
    expect(isCalendarDay(2100,'02-29')).toBe(false);
    expect(isCalendarDay(2000,'02-29')).toBe(true);
    expect(isCalendarDay(2023,'06-31')).toBe(false);
    expect(isCalendarDay(2023.5,'01-01')).toBe(false);
  });
  it('no samples gives null rates instead of zero, and mixed provenance fails closed',()=>{
    expect(bt([],[2025])).toMatchObject({evaluated:0,predicted:0,coverage:null,hitRate:null,meanWidthDays:null,provenance:'NONE'});
    expect(()=>bt([rec(2021,'05-10'),rec(2022,'05-12',{provenance:'REAL_APPROVED'})],[2023])).toThrow(/Mixed/);
  });
});

describe('#52 linked notices feed the existing forecast safely',()=>{
  it('a target-year cancellation of a linked notice stops the prediction',()=>{
    const history=[rec(2023,'05-11'),rec(2024,'05-13'),rec(2025,'05-12')];
    const announced=link('가상 이중전공 설명회 안내',EXAM).record;
    const cancel=link('[취소] 가상 이중전공 설명회 안내',['가상 대상: 서울캠퍼스 재학생','가상 설명회가 취소되었습니다.'],
      {revisionId:'r2',state:'CANCELLED',correctsRevisionId:'r1',publishedAt:'2026-04-10T10:00:00+09:00'}).record;
    const rows=/** @type {ActivityRecord[]} */([...history,announced,cancel]);
    const f=forecastActivity(rows,'2026-04-20T00:00:00+09:00',2026,'SYN-ACADEMIC','DOUBLE_MAJOR_APPLICATION.SEOUL');
    // 취소 판본이 같은 공지의 최신 판본이 되어 확정 판본을 대체하므로, 회차가 특정되지 않은 취소로 보고 예측을 보류한다.
    expect(f.state).toBe('UNKNOWN');
    expect(f.from).toBeUndefined();
  });
});
