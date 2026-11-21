import {describe, expect, it} from 'vitest';
import type {OfferingObservation, OfficialAcademicEvent} from './offering.js';
import {
  EVALUATION_METHODS, evaluateOfferingOutlook,
  type EvaluationCourse, type EvaluationMethod, type RollingOriginReport,
} from './rolling-origin.js';

// SYN-* 합성 학수번호만 사용한다. 1학기 전체 목록은 1월 25일 게시되고 26일 검증된 설정이다.
const ORIGIN_2025 = {asOf:'2025-01-01T00:00:00.000+09:00', targetTerm:'2025-1'};
const ORIGIN_2026 = {asOf:'2026-01-01T00:00:00.000+09:00', targetTerm:'2026-1'};
const TRUTH_AS_OF = '2026-11-01T00:00:00.000+09:00';

type State = OfferingObservation['state'];
const row = (term:string, state:State, over:Partial<OfferingObservation> = {}):OfferingObservation => ({
  term, state, coverage:'COMPLETE_TERM_CATALOG', sourceRef:`SYN-SRC-${term}-${state}`,
  publishedAt:`${term.slice(0, 4)}-01-25T00:00:00.000+09:00`,
  verifiedAt:`${term.slice(0, 4)}-01-26T00:00:00.000+09:00`, ...over,
});
/** O는 개설, N은 공식 미개설로 2021-1부터 한 글자가 1개 1학기를 뜻한다. */
const springs = (pattern:string):OfferingObservation[] => [...pattern].map((letter, index) =>
  row(`${2021 + index}-1`, letter === 'O' ? 'OFFERED' : 'CONFIRMED_NOT_OFFERED'));
const course = (courseId:string, observations:readonly OfferingObservation[],
  officialEvents?:readonly OfficialAcademicEvent[]):EvaluationCourse =>
  officialEvents === undefined ? {courseId, observations} : {courseId, observations, officialEvents};
const event = (kind:OfficialAcademicEvent['kind'], impact:OfficialAcademicEvent['impact'], courseId:string,
  publishedAt:string, year:number):OfficialAcademicEvent => ({
  eventId:`SYN-EVENT-${kind}-${year}`, kind, sourceRef:`SYN-SRC-${kind}-${year}`, publishedAt, verifiedAt:publishedAt,
  effectiveFrom:`${year}-03-01T00:00:00.000+09:00`, effectiveUntil:`${year}-06-30T00:00:00.000+09:00`,
  impact, affectedCourseIds:[courseId],
});

/** 2021-1~2026-1에 여러 평가 방법의 결과가 다르게 나오도록 과목별 사례를 구성한다. */
const COURSES:EvaluationCourse[] = [
  course('SYN-ALWAYS', springs('OOOOOO')),
  course('SYN-NEVER', springs('NNNNNN')),
  course('SYN-FLIP', springs('OOONNN')),
  course('SYN-SHORT', springs('OOOOOO').slice(2)),
  course('SYN-TIE', springs('ONONOO')),
  course('SYN-LEAVE', springs('OOOOOO'),
    [event('RESEARCH_LEAVE', 'POTENTIAL_ASSIGNMENT_CHANGE', 'SYN-LEAVE', '2024-12-01T00:00:00.000+09:00', 2025)]),
  course('SYN-CANCEL', springs('OOOOON'),
    [event('COURSE_CANCELLED', 'EXPLICIT_COURSE_STATUS', 'SYN-CANCEL', '2025-12-15T00:00:00.000+09:00', 2026)]),
  course('SYN-EARLY', [...springs('OOOO'),
    row('2025-1', 'OFFERED', {publishedAt:'2024-12-20T00:00:00.000+09:00', verifiedAt:'2024-12-21T00:00:00.000+09:00'}),
    row('2026-1', 'OFFERED')]),
  course('SYN-PARTIAL', [...springs('OOOOO'), row('2026-1', 'OFFERED', {coverage:'PARTIAL'})]),
  course('SYN-CONFLICT', [...springs('OOOOO'), row('2026-1', 'OFFERED'),
    row('2026-1', 'CONFIRMED_NOT_OFFERED', {sourceRef:'SYN-SRC-2026-1-RECHECK'})]),
];

const evaluate = (courses:readonly EvaluationCourse[] = COURSES, origins = [ORIGIN_2025, ORIGIN_2026], truthAsOf = TRUTH_AS_OF) =>
  evaluateOfferingOutlook({truthAsOf, origins, courses});
const origin = (report:RollingOriginReport, targetTerm:string) => {
  const found = report.origins.find(item => item.targetTerm === targetTerm);
  if (!found) throw new Error(`no origin for ${targetTerm}`);
  return found;
};
/** 평가 방법별 과목·평가 시각의 결과를 TP/FP/FN/TN/ABSTAIN으로 표시한다. */
const outcomes = (courseId:string, targetTerm:string) => {
  const one = COURSES.find(item => item.courseId === courseId)!;
  const methods = origin(evaluate([one]), targetTerm).methods;
  return Object.fromEntries(EVALUATION_METHODS.map(method => {
    const s = methods[method];
    const label = s.truePositive ? 'TP' : s.falsePositive ? 'FP' : s.falseNegative ? 'FN' : s.trueNegative ? 'TN'
      : s.abstained ? 'ABSTAIN' : 'NOT_SCORED';
    return [method, label];
  })) as Record<EvaluationMethod, string>;
};

describe('evaluateOfferingOutlook: same items for every method', () => {
  it('scores every method on the same denominator and accounts for every course', () => {
    const report = evaluate();
    for (const tally of [...report.origins, report.total]) {
      expect(tally.scored + tally.alreadyPublished + tally.truthUnavailable + tally.truthConflicting).toBe(tally.courses);
      expect(tally.truth.offered + tally.truth.notOffered).toBe(tally.scored);
      expect(Object.values(tally.outlookSignals).reduce((sum, value) => sum + value, 0)).toBe(tally.scored);
      for (const method of EVALUATION_METHODS) {
        const s = tally.methods[method];
        expect(s.answered + s.abstained).toBe(tally.scored);
        expect(s.truePositive + s.falsePositive + s.falseNegative + s.trueNegative).toBe(s.answered);
        expect(s.correct).toBe(s.truePositive + s.trueNegative);
      }
    }
    expect(report.status).toBe('READY');
  });

  it('gives the expected answer per course, method and origin', () => {
    expect(outcomes('SYN-ALWAYS', '2025-1')).toEqual({OUTLOOK:'TP', RECENT_SAME_SEASON:'TP', HISTORY_MAJORITY:'TP', ALWAYS_OFFERED:'TP'});
    expect(outcomes('SYN-NEVER', '2026-1')).toEqual({OUTLOOK:'TN', RECENT_SAME_SEASON:'TN', HISTORY_MAJORITY:'TN', ALWAYS_OFFERED:'FP'});
    // 최근 4개 봄학기 중 3개가 개설되다가 이번에 미개설된 사례다. 다수결은 틀리고 가장 최근 학기는 맞는다.
    expect(outcomes('SYN-FLIP', '2025-1')).toEqual({OUTLOOK:'FP', RECENT_SAME_SEASON:'TN', HISTORY_MAJORITY:'FP', ALWAYS_OFFERED:'FP'});
    // 전체 개설 목록이 2개뿐이면 전망 코어는 패턴을 확정하지 않지만 단순 기준선은 답한다.
    expect(outcomes('SYN-SHORT', '2025-1')).toEqual({OUTLOOK:'ABSTAIN', RECENT_SAME_SEASON:'TP', HISTORY_MAJORITY:'TP', ALWAYS_OFFERED:'TP'});
    expect(outcomes('SYN-SHORT', '2026-1')).toEqual({OUTLOOK:'TP', RECENT_SAME_SEASON:'TP', HISTORY_MAJORITY:'TP', ALWAYS_OFFERED:'TP'});
    // 4개 중 2개면 동률이므로 다수결은 답변을 보류한다.
    expect(outcomes('SYN-TIE', '2025-1')).toEqual({OUTLOOK:'ABSTAIN', RECENT_SAME_SEASON:'FN', HISTORY_MAJORITY:'ABSTAIN', ALWAYS_OFFERED:'TP'});
    // 연구학기 공지는 전망 결과를 검토 대상으로 만들 뿐 미개설 확정 근거가 아니다.
    expect(outcomes('SYN-LEAVE', '2025-1')).toEqual({OUTLOOK:'ABSTAIN', RECENT_SAME_SEASON:'TP', HISTORY_MAJORITY:'TP', ALWAYS_OFFERED:'TP'});
    expect(outcomes('SYN-LEAVE', '2026-1')).toEqual({OUTLOOK:'TP', RECENT_SAME_SEASON:'TP', HISTORY_MAJORITY:'TP', ALWAYS_OFFERED:'TP'});
    // 평가 기준 시점 이전에 게시된 공식 폐강 공지는 유효한 전망 입력이다.
    expect(outcomes('SYN-CANCEL', '2026-1')).toEqual({OUTLOOK:'TN', RECENT_SAME_SEASON:'FP', HISTORY_MAJORITY:'FP', ALWAYS_OFFERED:'FP'});
    // 해당 공지가 게시되기 전인 2025년 평가 시점에는 과거 기록만 보인다.
    expect(outcomes('SYN-CANCEL', '2025-1')).toEqual({OUTLOOK:'TP', RECENT_SAME_SEASON:'TP', HISTORY_MAJORITY:'TP', ALWAYS_OFFERED:'TP'});
  });

  it('records which outlook signals were scored', () => {
    expect(origin(evaluate(), '2025-1').outlookSignals).toEqual({
      CONFIRMED_OFFERED:0, CONFIRMED_NOT_OFFERED:0, HISTORICAL_PATTERN:7, EVENT_REVIEW:1, INSUFFICIENT_DATA:1, UNKNOWN:0,
    });
    expect(origin(evaluate(), '2026-1').outlookSignals).toEqual({
      CONFIRMED_OFFERED:0, CONFIRMED_NOT_OFFERED:1, HISTORICAL_PATTERN:7, EVENT_REVIEW:0, INSUFFICIENT_DATA:0, UNKNOWN:0,
    });
  });
});

describe('items left out of every method alike', () => {
  it('counts a target term already published at the origin, even before it was verified', () => {
    const report = evaluate();
    expect(origin(report, '2025-1').alreadyPublished).toBe(1);
    expect(outcomes('SYN-EARLY', '2025-1').OUTLOOK).toBe('NOT_SCORED');
    const unverified = course('SYN-UNVERIFIED', [...springs('OOOO'),
      row('2025-1', 'OFFERED', {publishedAt:'2024-12-20T00:00:00.000+09:00', verifiedAt:'2025-01-26T00:00:00.000+09:00'})]);
    expect(origin(evaluate([unverified]), '2025-1').alreadyPublished).toBe(1);
  });

  it('counts a partial target catalog as no answer, and disagreeing complete catalogs as conflicting', () => {
    const report = origin(evaluate(), '2026-1');
    expect(report.truthUnavailable).toBe(1);
    expect(report.truthConflicting).toBe(1);
    expect(report.scored).toBe(8);
  });

  it('does not read an answer that was not yet published or verified at truthAsOf', () => {
    const late = course('SYN-LATE', [...springs('OOOO'),
      row('2025-1', 'OFFERED', {publishedAt:'2025-01-25T00:00:00.000+09:00', verifiedAt:'2026-12-01T00:00:00.000+09:00'})]);
    expect(origin(evaluate([late]), '2025-1').truthUnavailable).toBe(1);
  });
});

describe('no leakage from after the origin', () => {
  it('rows and events published after an origin do not change any answer at that origin', () => {
    const before = origin(evaluate(), '2025-1');
    const withLateRows = COURSES.map(item => ({
      ...item,
      observations:[...item.observations,
        // 2025년 평가 기준 시점 이후에 게시된 과거 학기 정정 자료다.
        row('2023-1', 'CONFIRMED_NOT_OFFERED', {sourceRef:'SYN-SRC-LATE-FIX', publishedAt:'2025-05-01T00:00:00.000+09:00',
          verifiedAt:'2025-05-02T00:00:00.000+09:00'}),
      ],
      officialEvents:[...(item.officialEvents ?? []),
        event('COURSE_CANCELLED', 'EXPLICIT_COURSE_STATUS', item.courseId, '2025-02-15T00:00:00.000+09:00', 2025)],
    }));
    const after = origin(evaluate(withLateRows), '2025-1');
    expect(after.methods).toEqual(before.methods);
    expect(after.outlookSignals).toEqual(before.outlookSignals);
    expect(after.historyCounts).toEqual(before.historyCounts);
  });
});

describe('history counts', () => {
  it('tallies each shown k/n with what happened next, without turning it into a rate', () => {
    expect(origin(evaluate(), '2025-1').historyCounts).toEqual([
      {offeredTerms:0, observedTerms:4, shown:1, thenOffered:0},
      {offeredTerms:2, observedTerms:4, shown:1, thenOffered:1},
      {offeredTerms:3, observedTerms:4, shown:1, thenOffered:0},
      {offeredTerms:4, observedTerms:4, shown:4, thenOffered:4},
    ]);
    const total = evaluate().total.historyCounts;
    expect(total.reduce((sum, item) => sum + item.shown, 0)).toBe(14);
    // 과거는 최대 8개 정규 학기까지만 보고 봄학기 관측은 최대 4개다.
    expect(total.every(item => item.observedTerms <= 4)).toBe(true);
    // 2/4 기록이 3번 나타났고(2025 TIE, 2026 FLIP·TIE), 그 뒤 실제 개설은 2번이었다.
    expect(total.find(item => item.offeredTerms === 2 && item.observedTerms === 4)).toEqual(
      {offeredTerms:2, observedTerms:4, shown:3, thenOffered:2});
  });

  it('holds integers only and has no rate, probability, accuracy or IoU field', () => {
    const report = evaluate();
    const walk = (value:unknown, path:string):void => {
      if (typeof value === 'number') expect(Number.isInteger(value), path).toBe(true);
      else if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${path}[${index}]`));
      else if (value && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) {
          expect(key, path).not.toMatch(/rate|prob|accura|iou|percent|ratio/i);
          walk(item, `${path}.${key}`);
        }
      }
    };
    walk(report, 'report');
  });
});

describe('READY needs two origin instants that scored items', () => {
  it('a single origin is not a rolling-origin evaluation', () => {
    expect(evaluate(COURSES, [ORIGIN_2026]).status).toBe('INSUFFICIENT_DATA');
  });

  it('two targets from one instant still count as one origin', () => {
    const falls = ['2021-2', '2022-2', '2023-2', '2024-2', '2025-2'].map(term => ({
      ...row(term, 'OFFERED'),
      publishedAt:`${term.slice(0, 4)}-07-25T00:00:00.000+09:00`, verifiedAt:`${term.slice(0, 4)}-07-26T00:00:00.000+09:00`,
    }));
    const both = course('SYN-BOTH', [...springs('OOOOO'), ...falls]);
    const report = evaluate([both], [ORIGIN_2025, {asOf:ORIGIN_2025.asOf, targetTerm:'2025-2'}]);
    expect(report.origins.map(item => item.scored)).toEqual([1, 1]);
    expect(report.status).toBe('INSUFFICIENT_DATA');
  });

  it('an origin that scored nothing does not count', () => {
    const report = evaluate([COURSES.find(item => item.courseId === 'SYN-PARTIAL')!]);
    expect(report.origins.map(item => item.scored)).toEqual([1, 0]);
    expect(report.status).toBe('INSUFFICIENT_DATA');
  });
});

describe('input checks and determinism', () => {
  it('does not depend on the order of courses or origins', () => {
    expect(evaluate([...COURSES].reverse(), [ORIGIN_2026, ORIGIN_2025])).toEqual(evaluate());
  });

  it('refuses an origin at or after its target term start, or after truthAsOf', () => {
    expect(() => evaluate(COURSES, [ORIGIN_2025, {asOf:'2026-03-01T00:00:00.000+09:00', targetTerm:'2026-1'}])).toThrow(RangeError);
    expect(() => evaluate(COURSES, [ORIGIN_2025, ORIGIN_2026], '2025-12-31T00:00:00.000+09:00')).toThrow(RangeError);
  });

  it('refuses malformed or duplicate input', () => {
    expect(() => evaluate(COURSES, [ORIGIN_2025, ORIGIN_2025])).toThrow(TypeError);
    expect(() => evaluate([COURSES[0]!, COURSES[0]!])).toThrow(TypeError);
    expect(() => evaluate([course('SYN-BAD', [row('2025-3', 'OFFERED')])])).toThrow(RangeError);
    expect(() => evaluate([course('SYN-BAD', [row('2024-1', 'OFFERED', {publishedAt:'2024-01-25T00:00:00'})])])).toThrow(RangeError);
    expect(() => evaluate([course('SYN-BAD', [row('2024-1', 'OFFERED', {verifiedAt:'2024-01-24T00:00:00.000+09:00'})])])).toThrow(RangeError);
    expect(() => evaluate([course(' ', springs('OOO'))])).toThrow(RangeError);
    expect(() => evaluate(COURSES, [ORIGIN_2025, {asOf:ORIGIN_2026.asOf, targetTerm:'2026-S'}])).toThrow(RangeError);
    expect(() => evaluate(COURSES, [ORIGIN_2025, ORIGIN_2026], '2026-11-01')).toThrow(RangeError);
    expect(() => evaluate(Array.from({length:201}, (_, index) => course(`SYN-${index}`, [])))).toThrow(RangeError);
  });
});

import {forecastOfferings} from './offering.js';

// #11 본선 이전 이동 평가의 미검증 구간이다. 합성 데이터이며 각 사례를 사람이 계산해 확인할 수 있는 과목 하나로 구성한다.

/** 하나의 임시 과목을 하나의 평가 시점에서 평가한 방법별 결과다. */
const outcomesOf = (one:EvaluationCourse, targetTerm:string) => {
  const methods = origin(evaluate([one]), targetTerm).methods;
  return Object.fromEntries(EVALUATION_METHODS.map(method => {
    const s = methods[method];
    const label = s.truePositive ? 'TP' : s.falsePositive ? 'FP' : s.falseNegative ? 'FN' : s.trueNegative ? 'TN'
      : s.abstained ? 'ABSTAIN' : 'NOT_SCORED';
    return [method, label];
  })) as Record<EvaluationMethod, string>;
};
/** 2025년 평가 시점 이후에 게시된 2025-1 정답 자료다. */
const TRUTH_2025_O = row('2025-1', 'OFFERED');
const TRUTH_2025_N = row('2025-1', 'CONFIRMED_NOT_OFFERED');

describe('NOTICE_ONLY rows in the evaluation', () => {
  it('a notice alone is not an answer for the target term', () => {
    const notice = course('SYN-NOTICE-TRUTH', [...springs('OOOO'), row('2025-1', 'OFFERED', {coverage:'NOTICE_ONLY'})]);
    const at = origin(evaluate([notice]), '2025-1');
    expect([at.truthUnavailable, at.scored]).toEqual([1, 0]);
  });

  it('a notice published before the origin takes the item out of every method', () => {
    const early = course('SYN-NOTICE-EARLY', [...springs('OOOO'), TRUTH_2025_O,
      row('2025-1', 'OFFERED', {coverage:'NOTICE_ONLY', sourceRef:'SYN-SRC-NOTICE',
        publishedAt:'2024-12-20T00:00:00.000+09:00', verifiedAt:'2024-12-21T00:00:00.000+09:00'})]);
    const at = origin(evaluate([early]), '2025-1');
    expect([at.alreadyPublished, at.scored]).toEqual([1, 0]);
  });

  it('a past notice is neither counted in k/n nor read as the most recent season', () => {
    // 2024-1은 미개설 안내만 있고, 가장 최근 완전한 목록인 2023-1에는 개설로 기록된 상태다.
    const one = course('SYN-NOTICE-HIST', [...springs('OOO'),
      row('2024-1', 'CONFIRMED_NOT_OFFERED', {coverage:'NOTICE_ONLY'}), TRUTH_2025_O]);
    expect(outcomesOf(one, '2025-1')).toEqual({OUTLOOK:'TP', RECENT_SAME_SEASON:'TP', HISTORY_MAJORITY:'TP', ALWAYS_OFFERED:'TP'});
    expect(origin(evaluate([one]), '2025-1').historyCounts).toEqual([{offeredTerms:3, observedTerms:3, shown:1, thenOffered:1}]);
  });
});

describe('0/n is an answer; missing or partial history is not', () => {
  it('a complete 0 of 4 is a NOT_OFFERED answer from every history method', () => {
    const zero = course('SYN-ZERO', [...springs('NNNN'), TRUTH_2025_O]);
    expect(outcomesOf(zero, '2025-1')).toEqual({OUTLOOK:'FN', RECENT_SAME_SEASON:'FN', HISTORY_MAJORITY:'FN', ALWAYS_OFFERED:'TP'});
  });

  it('no history at all: every history method abstains and the outlook is UNKNOWN', () => {
    const none = course('SYN-NONE', [TRUTH_2025_O]);
    expect(outcomesOf(none, '2025-1')).toEqual({OUTLOOK:'ABSTAIN', RECENT_SAME_SEASON:'ABSTAIN', HISTORY_MAJORITY:'ABSTAIN', ALWAYS_OFFERED:'TP'});
    expect(origin(evaluate([none]), '2025-1').outlookSignals.UNKNOWN).toBe(1);
  });

  it('only partial lists: abstain, never 0 of n', () => {
    const partial = course('SYN-PARTIAL-HIST', [
      ...springs('NNNN').map(item => ({...item, coverage:'PARTIAL' as const})), TRUTH_2025_O]);
    expect(outcomesOf(partial, '2025-1')).toEqual({OUTLOOK:'ABSTAIN', RECENT_SAME_SEASON:'ABSTAIN', HISTORY_MAJORITY:'ABSTAIN', ALWAYS_OFFERED:'TP'});
    expect(origin(evaluate([partial]), '2025-1').outlookSignals.INSUFFICIENT_DATA).toBe(1);
  });
});

describe('each official event kind at the origin', () => {
  const NOTICE_AT = '2024-12-01T00:00:00.000+09:00';
  const withEvent = (id:string, kind:OfficialAcademicEvent['kind'], impact:OfficialAcademicEvent['impact'], truth = TRUTH_2025_O) =>
    course(id, [...springs('OOOO'), truth], [event(kind, impact, id, NOTICE_AT, 2025)]);

  it.each([
    ['RETIREMENT'], ['STAFF_CHANGE'], ['COURSE_CANCELLED'], ['RESEARCH_LEAVE'],
  ] as const)('%s as a possible assignment change: the outlook asks for review, history baselines still answer', kind => {
    const one = withEvent(`SYN-EV-${kind}`, kind, 'POTENTIAL_ASSIGNMENT_CHANGE');
    expect(outcomesOf(one, '2025-1')).toEqual({OUTLOOK:'ABSTAIN', RECENT_SAME_SEASON:'TP', HISTORY_MAJORITY:'TP', ALWAYS_OFFERED:'TP'});
    expect(origin(evaluate([one]), '2025-1').outlookSignals.EVENT_REVIEW).toBe(1);
  });

  it.each([['RETIREMENT'], ['STAFF_CHANGE'], ['RESEARCH_LEAVE']] as const)(
    '%s stated for this course is not read as a closure', kind => {
      const one = withEvent(`SYN-EX-${kind}`, kind, 'EXPLICIT_COURSE_STATUS');
      expect(outcomesOf(one, '2025-1').OUTLOOK).toBe('ABSTAIN');
      expect(origin(evaluate([one]), '2025-1').outlookSignals.INSUFFICIENT_DATA).toBe(1);
    });

  it('a curriculum change makes the outlook abstain instead of trusting old terms', () => {
    const one = withEvent('SYN-CURRICULUM', 'CURRICULUM_CHANGE', 'POTENTIAL_ASSIGNMENT_CHANGE');
    expect(outcomesOf(one, '2025-1').OUTLOOK).toBe('ABSTAIN');
  });

  it('only an official cancellation for this course gives NOT_OFFERED', () => {
    const one = withEvent('SYN-CANCELLED', 'COURSE_CANCELLED', 'EXPLICIT_COURSE_STATUS', TRUTH_2025_N);
    expect(outcomesOf(one, '2025-1')).toEqual({OUTLOOK:'TN', RECENT_SAME_SEASON:'FP', HISTORY_MAJORITY:'FP', ALWAYS_OFFERED:'FP'});
    expect(origin(evaluate([one]), '2025-1').outlookSignals.CONFIRMED_NOT_OFFERED).toBe(1);
  });
});

describe('a row published before the origin but verified after it', () => {
  it('is not used at that origin', () => {
    // 2024-1만 미개설 봄학기이며 2025년 평가 시점 이후에야 검증된다.
    const late = course('SYN-LATE-VERIFIED', [...springs('OOO'),
      row('2024-1', 'CONFIRMED_NOT_OFFERED', {verifiedAt:'2025-02-01T00:00:00.000+09:00'}), TRUTH_2025_O,
      row('2026-1', 'OFFERED')]);
    expect(origin(evaluate([late]), '2025-1').historyCounts).toEqual([{offeredTerms:3, observedTerms:3, shown:1, thenOffered:1}]);
    expect(outcomesOf(late, '2025-1').RECENT_SAME_SEASON).toBe('TP');
    // 2026년 평가 시점에는 검증돼 2022-1~2025-1 중 4개 중 3개 개설로 세어진다.
    expect(origin(evaluate([late]), '2026-1').historyCounts).toEqual([{offeredTerms:3, observedTerms:4, shown:1, thenOffered:1}]);
  });
});

describe('course limits', () => {
  it('a student outlook stays at 20 courses; an evaluation run takes up to 200', () => {
    const one = (index:number) => ({courseId:`SYN-${index}`, targetTerm:'2025-1'});
    expect(() => forecastOfferings({asOf:ORIGIN_2025.asOf, courses:Array.from({length:21}, (_, i) => one(i))})).toThrow(RangeError);
    expect(forecastOfferings({asOf:ORIGIN_2025.asOf, courses:Array.from({length:20}, (_, i) => one(i))}).items).toHaveLength(20);
    const report = evaluate(Array.from({length:200}, (_, index) => course(`SYN-${index}`, [...springs('OOOO'), TRUTH_2025_O])));
    expect(report.total.courses).toBe(400);
    expect(report.total.scored).toBe(200);
  });
});
