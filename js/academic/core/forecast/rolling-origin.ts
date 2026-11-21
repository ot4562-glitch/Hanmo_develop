import type {OfferingOutlookVNext} from '../../contracts/index.js';
import {
  FORECAST_OFFERING_MODEL_VERSION, forecastOffering, sameCourseAt, termWindow,
  type OfferingObservation, type OfficialAcademicEvent,
} from './offering.js';

/**
 * 개설 전망의 이동 기준 평가다(설계 A09, TASK-17).
 * 각 과거 평가 시각에는 그때까지 공개·검증된 자료만 사용한다. 정답은 truthAsOf 시점의 전체 개설 목록 중 과목 동일성이 확인된 행에서 가져온다.
 * 모든 방법을 같은 평가 대상에서 비교한다.
 * 보고서는 건수만 제공하며 확률·반올림된 비율·IoU를 제시하지 않는다.
 * HISTORICAL_PATTERN의 k/n은 평가할 때만 다수결로 읽고 학생 화면에는 과거 횟수로 표시한다.
 * 시계·네트워크·난수에 의존하지 않는다.
 */
export const ROLLING_ORIGIN_EVALUATOR_VERSION = 'forecast-offering-rolling-origin-v1';

const TERM = /^(19|20|21)\d{2}-[12]$/;
const OFFSET = /(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_ORIGINS = 16;
const MAX_COURSES = 200;

export const EVALUATION_METHODS = ['OUTLOOK', 'RECENT_SAME_SEASON', 'HISTORY_MAJORITY', 'ALWAYS_OFFERED'] as const;
export type EvaluationMethod = typeof EVALUATION_METHODS[number];
type Signal = OfferingOutlookVNext['signal'];
const SIGNALS:readonly Signal[] = [
  'CONFIRMED_OFFERED', 'CONFIRMED_NOT_OFFERED', 'HISTORICAL_PATTERN', 'EVENT_REVIEW', 'INSUFFICIENT_DATA', 'UNKNOWN',
];
type Answer = 'OFFERED'|'NOT_OFFERED'|'ABSTAIN';
type Truth = 'OFFERED'|'NOT_OFFERED';

export interface EvaluationCourse {
  courseId:string;
  /** 평가 기준 시각 이후에 게시된 기록까지 포함한 전체 수집 행이다. */
  observations:readonly OfferingObservation[];
  officialEvents?:readonly OfficialAcademicEvent[];
}

export interface EvaluationOrigin {
  asOf:string;
  targetTerm:string;
}

export interface RollingOriginRequest {
  /** 정답을 확인하는 시각이며 모든 평가 기준 시각보다 이르지 않아야 한다. */
  truthAsOf:string;
  origins:readonly EvaluationOrigin[];
  courses:readonly EvaluationCourse[];
}

/** 양성 클래스는 OFFERED다. 답변 수와 보류 수의 합은 전체 채점 대상 수와 같아야 한다. */
export interface MethodScore {
  truePositive:number;
  falsePositive:number;
  falseNegative:number;
  trueNegative:number;
  answered:number;
  correct:number;
  abstained:number;
}

export interface HistoryCount {
  offeredTerms:number;
  observedTerms:number;
  /** 그 전망에서 k/n이 표시된 채점 대상의 수다. */
  shown:number;
  /** 그 대상 중 실제로 개설된 항목 수다. */
  thenOffered:number;
}

export interface EvaluationTally {
  courses:number;
  /** 평가 시작 당시 이미 목표 학기의 개설 상태가 공개됐으므로 채점하지 않는다. */
  alreadyPublished:number;
  /** 정답 시각까지 목표 학기의 확정 상태를 가진 전체 목록이 없으므로 채점하지 않는다. */
  truthUnavailable:number;
  /** 목표 학기의 전체 목록들이 서로 충돌하므로 채점하지 않는다. */
  truthConflicting:number;
  scored:number;
  truth:{offered:number; notOffered:number};
  methods:Record<EvaluationMethod, MethodScore>;
  outlookSignals:Record<Signal, number>;
  historyCounts:HistoryCount[];
}

export interface OriginReport extends EvaluationTally {
  asOf:string;
  targetTerm:string;
}

export interface RollingOriginReport {
  evaluatorVersion:typeof ROLLING_ORIGIN_EVALUATOR_VERSION;
  modelVersion:typeof FORECAST_OFFERING_MODEL_VERSION;
  truthAsOf:string;
  /** READY가 되려면 서로 다른 평가 기준 시각 두 개 이상에서 각각 채점 대상이 있어야 한다. */
  status:'READY'|'INSUFFICIENT_DATA';
  origins:OriginReport[];
  total:EvaluationTally;
}

function instant(label:string, value:unknown):number {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (typeof value !== 'string' || !Number.isFinite(parsed) || !OFFSET.test(value)) {
    throw new RangeError(`${label} must be an ISO datetime with a timezone offset`);
  }
  return parsed;
}

function assertTerm(label:string, value:unknown):asserts value is string {
  if (typeof value !== 'string' || !TERM.test(value)) throw new RangeError(`${label} must be YYYY-1 or YYYY-2`);
}

function checkCourse(course:EvaluationCourse):void {
  if (typeof course.courseId !== 'string' || course.courseId.trim() === '') throw new RangeError('courseId is required');
  if (!Array.isArray(course.observations)) throw new TypeError(`observations of ${course.courseId} must be an array`);
  for (const row of course.observations) {
    assertTerm(`observation term of ${course.courseId}`, row.term);
    const published = instant('observation.publishedAt', row.publishedAt);
    if (instant('observation.verifiedAt', row.verifiedAt) < published) {
      throw new RangeError('verifiedAt cannot precede publishedAt');
    }
  }
}

function emptyScore():MethodScore {
  return {truePositive:0, falsePositive:0, falseNegative:0, trueNegative:0, answered:0, correct:0, abstained:0};
}

function emptyTally():EvaluationTally {
  const methods = {} as Record<EvaluationMethod, MethodScore>;
  for (const method of EVALUATION_METHODS) methods[method] = emptyScore();
  const outlookSignals = {} as Record<Signal, number>;
  for (const signal of SIGNALS) outlookSignals[signal] = 0;
  return {
    courses:0, alreadyPublished:0, truthUnavailable:0, truthConflicting:0, scored:0,
    truth:{offered:0, notOffered:0}, methods, outlookSignals, historyCounts:[],
  };
}

/** 평가 기준 시각에 목표 학기 상태가 공개됐지만 당시 아직 검증되지 않은 경우도 포함한다. */
function publishedBy(rows:readonly OfferingObservation[], term:string, originMs:number):boolean {
  return rows.some(row => row.term === term && row.state !== 'UNKNOWN' && Date.parse(row.publishedAt) <= originMs);
}

function answerAt(rows:readonly OfferingObservation[], term:string, truthMs:number):Truth|'UNAVAILABLE'|'CONFLICTING' {
  const states = new Set(rows
    .filter(row => row.term === term && row.coverage === 'COMPLETE_TERM_CATALOG' && row.state !== 'UNKNOWN'
      && Date.parse(row.publishedAt) <= truthMs && Date.parse(row.verifiedAt) <= truthMs && sameCourseAt(row, truthMs))
    .map(row => row.state));
  if (states.size === 0) return 'UNAVAILABLE';
  if (states.size > 1) return 'CONFLICTING';
  return states.has('OFFERED') ? 'OFFERED' : 'NOT_OFFERED';
}

/** 0/0을 포함한 동률은 답변 불가로 처리한다. */
function majority(offered:number, observed:number):Answer {
  if (2 * offered > observed) return 'OFFERED';
  if (2 * offered < observed) return 'NOT_OFFERED';
  return 'ABSTAIN';
}

/** 모든 기준 비교 방법은 같은 시각에 전망이 보유한 동일 계절 과거 기록만 사용한다. */
function predict(method:EvaluationMethod, outlook:OfferingOutlookVNext):Answer {
  switch (method) {
    case 'OUTLOOK':
      if (outlook.signal === 'CONFIRMED_OFFERED') return 'OFFERED';
      if (outlook.signal === 'CONFIRMED_NOT_OFFERED') return 'NOT_OFFERED';
      if (outlook.signal === 'HISTORICAL_PATTERN') {
        return majority(outlook.sameSeasonOfferedTerms, outlook.sameSeasonObservedTerms);
      }
      return 'ABSTAIN';
    case 'RECENT_SAME_SEASON': {
      const complete = outlook.observations.filter(row => row.coverage === 'COMPLETE_TERM_CATALOG' && row.state !== 'UNKNOWN');
      const last = complete[complete.length - 1];
      if (!last) return 'ABSTAIN';
      return last.state === 'OFFERED' ? 'OFFERED' : 'NOT_OFFERED';
    }
    case 'HISTORY_MAJORITY':
      return majority(outlook.sameSeasonOfferedTerms, outlook.sameSeasonObservedTerms);
    case 'ALWAYS_OFFERED':
      return 'OFFERED';
  }
}

function score(target:MethodScore, answer:Answer, truth:Truth):void {
  if (answer === 'ABSTAIN') {
    target.abstained += 1;
    return;
  }
  target.answered += 1;
  if (answer === 'OFFERED') {
    if (truth === 'OFFERED') target.truePositive += 1;
    else target.falsePositive += 1;
  } else if (truth === 'OFFERED') target.falseNegative += 1;
  else target.trueNegative += 1;
  target.correct = target.truePositive + target.trueNegative;
}

function addHistory(list:HistoryCount[], offeredTerms:number, observedTerms:number, offered:boolean):void {
  let row = list.find(item => item.offeredTerms === offeredTerms && item.observedTerms === observedTerms);
  if (!row) {
    row = {offeredTerms, observedTerms, shown:0, thenOffered:0};
    list.push(row);
  }
  row.shown += 1;
  if (offered) row.thenOffered += 1;
}

function sortHistory(list:HistoryCount[]):HistoryCount[] {
  return list.sort((a, b) => a.observedTerms - b.observedTerms || a.offeredTerms - b.offeredTerms);
}

function evaluateOrigin(origin:EvaluationOrigin, originMs:number, courses:readonly EvaluationCourse[], truthMs:number):OriginReport {
  const tally = emptyTally();
  for (const course of courses) {
    tally.courses += 1;
    if (publishedBy(course.observations, origin.targetTerm, originMs)) {
      tally.alreadyPublished += 1;
      continue;
    }
    const truth = answerAt(course.observations, origin.targetTerm, truthMs);
    if (truth === 'UNAVAILABLE') {
      tally.truthUnavailable += 1;
      continue;
    }
    if (truth === 'CONFLICTING') {
      tally.truthConflicting += 1;
      continue;
    }
    // 평가기는 관측 행을 사전에 잘라내지 않고 전망 함수에 전부 전달한다. 전망 함수가 평가 시각으로 필터링한다.
    const outlook = forecastOffering({
      courseId:course.courseId, targetTerm:origin.targetTerm, asOf:origin.asOf,
      observations:course.observations, officialEvents:course.officialEvents ?? [],
    });
    tally.scored += 1;
    if (truth === 'OFFERED') tally.truth.offered += 1;
    else tally.truth.notOffered += 1;
    tally.outlookSignals[outlook.signal] += 1;
    for (const method of EVALUATION_METHODS) score(tally.methods[method], predict(method, outlook), truth);
    if (outlook.signal === 'HISTORICAL_PATTERN') {
      addHistory(tally.historyCounts, outlook.sameSeasonOfferedTerms, outlook.sameSeasonObservedTerms, truth === 'OFFERED');
    }
  }
  sortHistory(tally.historyCounts);
  return {asOf:origin.asOf, targetTerm:origin.targetTerm, ...tally};
}

function addTally(total:EvaluationTally, part:EvaluationTally):void {
  total.courses += part.courses;
  total.alreadyPublished += part.alreadyPublished;
  total.truthUnavailable += part.truthUnavailable;
  total.truthConflicting += part.truthConflicting;
  total.scored += part.scored;
  total.truth.offered += part.truth.offered;
  total.truth.notOffered += part.truth.notOffered;
  for (const method of EVALUATION_METHODS) {
    const into = total.methods[method], from = part.methods[method];
    into.truePositive += from.truePositive;
    into.falsePositive += from.falsePositive;
    into.falseNegative += from.falseNegative;
    into.trueNegative += from.trueNegative;
    into.answered += from.answered;
    into.correct += from.correct;
    into.abstained += from.abstained;
  }
  for (const signal of SIGNALS) total.outlookSignals[signal] += part.outlookSignals[signal];
  for (const row of part.historyCounts) {
    let into = total.historyCounts.find(item =>
      item.offeredTerms === row.offeredTerms && item.observedTerms === row.observedTerms);
    if (!into) {
      into = {offeredTerms:row.offeredTerms, observedTerms:row.observedTerms, shown:0, thenOffered:0};
      total.historyCounts.push(into);
    }
    into.shown += row.shown;
    into.thenOffered += row.thenOffered;
  }
}

/**
 * 전망 모델과 단순 기준선 세 가지를 동일한 이동 평가 대상에서 채점한다.
 * 목표 상태가 당시 이미 공개됐거나 정답 시각에도 불명확·충돌인 항목은 모든 방법에서 똑같이 제외하고 건수만 기록한다.
 */
export function evaluateOfferingOutlook(input:RollingOriginRequest):RollingOriginReport {
  const truthMs = instant('truthAsOf', input.truthAsOf);
  if (!Array.isArray(input.origins) || !Array.isArray(input.courses)) {
    throw new TypeError('origins and courses must be arrays');
  }
  if (input.origins.length > MAX_ORIGINS) throw new RangeError(`more than ${MAX_ORIGINS} origins`);
  if (input.courses.length > MAX_COURSES) throw new RangeError(`more than ${MAX_COURSES} courses`);

  const seenCourses = new Set<string>();
  for (const course of input.courses) {
    checkCourse(course);
    if (seenCourses.has(course.courseId)) throw new TypeError(`duplicate course ${course.courseId}`);
    seenCourses.add(course.courseId);
  }
  const courses = [...input.courses].sort((a, b) => (a.courseId < b.courseId ? -1 : a.courseId > b.courseId ? 1 : 0));

  const seenOrigins = new Set<string>();
  const origins = input.origins.map(origin => {
    const ms = instant('origin.asOf', origin.asOf);
    assertTerm('origin.targetTerm', origin.targetTerm);
    if (termWindow(origin.targetTerm).start <= ms) throw new RangeError('an origin must come before its target term starts');
    if (ms > truthMs) throw new RangeError('truthAsOf must not precede an origin');
    const key = `${ms}|${origin.targetTerm}`;
    if (seenOrigins.has(key)) throw new TypeError(`duplicate origin ${origin.asOf} -> ${origin.targetTerm}`);
    seenOrigins.add(key);
    return {origin, ms};
  }).sort((a, b) => a.ms - b.ms || (a.origin.targetTerm < b.origin.targetTerm ? -1 : 1));

  const reports = origins.map(({origin, ms}) => evaluateOrigin(origin, ms, courses, truthMs));
  const total = emptyTally();
  for (const report of reports) addTally(total, report);
  sortHistory(total.historyCounts);
  const scoredInstants = new Set(origins.filter((_, index) => reports[index]!.scored > 0).map(({ms}) => ms));
  return {
    evaluatorVersion:ROLLING_ORIGIN_EVALUATOR_VERSION,
    modelVersion:FORECAST_OFFERING_MODEL_VERSION,
    truthAsOf:input.truthAsOf,
    status:scoredInstants.size >= 2 ? 'READY' : 'INSUFFICIENT_DATA',
    origins:reports,
    total,
  };
}
