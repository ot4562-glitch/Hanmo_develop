import {
  AcademicAuditVNextSchema,
  type AcademicAuditVNext,
} from '../../contracts/index.js';
import {
  AS_OF,
  addUnits,
  assertId,
  assertPositiveUnits,
  buildAcademicLedger,
  byCodeUnit,
  termEndMs,
  termKey,
  type AcademicLedgerRequest,
  type LedgerAttempt,
} from './ledger.js';

/**
 * 한 학기 수강계획을 검증한다(A08.4, A08.5 CREDIT-07~09).
 * 승인된 학점 상한, 공식 선수요건, 검증된 분반만 확인하며 학점 원장 자체는 수정하지 않는다.
 * 시간표나 존재하지 않는 분반을 생성하지 않는다. 상세 시간표 최적화는 후속 P2 범위다.
 */

type PlanIssue = AcademicAuditVNext['planIssues'][number];

export type Weekday = 'MON'|'TUE'|'WED'|'THU'|'FRI'|'SAT'|'SUN';

export interface SectionMeeting {
  day:Weekday;
  /** 현지 자정부터 지난 분 단위 시간. 수업 시간은 시작 포함, 종료 미포함 구간이다. */
  startMinute:number;
  endMinute:number;
}

/** 공식 시간표에 공시된 분반만 나타낸다. */
export interface VerifiedSection {
  canonicalCourseId:string;
  sectionId:string;
  term:string;
  /** 고정 수업 시간이 없으면 빈 목록이며 다른 분반과 시간 충돌을 일으키지 않는다. */
  meetings:readonly SectionMeeting[];
  evidenceRefs:readonly string[];
  /** asOf 이후에 검증된 분반 정보는 이 기준 시점 계산에 사용하지 않는다. */
  verifiedAt:string;
}

/** 선수과목은 계획 중인 강좌보다 먼저 취득 완료되어야 한다. */
export interface PrerequisiteRule {
  canonicalCourseId:string;
  requiresCourseIds:readonly string[];
  evidenceRefs:readonly string[];
}

export interface TermPlan {
  /** 계획 대상 학기(YYYY-1|S|2|W)이며 asOf 시점에 종료된 학기는 허용하지 않는다. */
  term:string;
  /** 승인된 학기당 최대 학점. 1단위는 0.5학점이다. */
  creditCapUnits:number;
  capEvidenceRefs:readonly string[];
  prerequisites?:readonly PrerequisiteRule[];
  /** 분반 목록이 없으면 검증된 분반이 없는 것으로 취급하고 각 과목을 검토 보류한다. */
  sections?:readonly VerifiedSection[];
}

export interface AcademicPlanRequest extends AcademicLedgerRequest {
  termPlan:TermPlan;
}

const WEEKDAYS:ReadonlySet<string> = new Set(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
const MINUTES_PER_DAY = 24 * 60;
/** 통신 계약 #103에서 한 검사당 최대 60개 과목 참조를 허용한다. */
const MAX_TERM_COURSES = 60;
/** AcademicPlanIssueVNext에는 최대 20개 과목 참조만 담을 수 있으므로 더 길면 나눈다. */
const MAX_ISSUE_COURSES = 20;
const MAX_PREREQUISITES = 100;
const MAX_SECTIONS = 200;
const MAX_MEETINGS = 10;
const MAX_PLAN_ISSUES = 100;
const MAX_EVIDENCE = 30;
/** A08.4 탐색 상한이다. 상한에 도달했다면 조용히 누락하지 않고 결과에 기록한다. */
export const MAX_ALLOCATION_STATES = 50_000;

function assertRefs(refs:readonly string[], label:string):string[] {
  if (!Array.isArray(refs) || refs.length === 0) throw new TypeError(`${label} needs official evidence`);
  const seen = new Set<string>();
  for (const ref of refs) {
    assertId(ref, label);
    if (seen.has(ref)) throw new TypeError(`${label} repeats evidence ${ref}`);
    seen.add(ref);
  }
  return [...refs];
}

function instantMs(value:string, label:string):number {
  const ms = Date.parse(value);
  if (!AS_OF.test(value) || !Number.isFinite(ms)) {
    throw new TypeError(`${label} must be an ISO-8601 datetime with a timezone offset`);
  }
  return ms;
}

function union(lists:readonly (readonly string[])[]):string[] {
  const refs = [...new Set(lists.flat())].sort(byCodeUnit);
  if (refs.length > MAX_EVIDENCE) throw new RangeError('too many evidence refs on one plan issue');
  return refs;
}

/** 정렬된 과목 참조를 통신 계약 허용 크기로 묶는다. 목록이 길면 같은 유형의 문제를 여러 건으로 나눈다. */
function chunks(courseRefs:readonly string[]):string[][] {
  const groups:string[][] = [];
  for (let i = 0; i < courseRefs.length; i += MAX_ISSUE_COURSES) groups.push(courseRefs.slice(i, i + MAX_ISSUE_COURSES));
  return groups;
}

interface TermCourse {
  courseId:string;
  units:number;
  planned:boolean;
}

/** 계획 학기의 PLANNED 또는 IN_PROGRESS 행으로, 과목당 항목 하나다. */
function termLoad(attempts:readonly LedgerAttempt[], term:string, issues:PlanIssue[]):TermCourse[] {
  const byCourse = new Map<string, TermCourse>();
  const repeated = new Set<string>();
  for (const attempt of attempts) {
    if (attempt.term !== term || attempt.recognition === 'EXCLUDED') continue;
    if (attempt.ledger !== 'PLANNED' && attempt.ledger !== 'IN_PROGRESS') continue;
    const prior = byCourse.get(attempt.canonicalCourseId);
    if (prior) {
      repeated.add(attempt.canonicalCourseId);
      prior.units = Math.max(prior.units, attempt.creditUnits);
      prior.planned ||= attempt.ledger === 'PLANNED';
      continue;
    }
    byCourse.set(attempt.canonicalCourseId, {
      courseId:attempt.canonicalCourseId,
      units:attempt.creditUnits,
      planned:attempt.ledger === 'PLANNED',
    });
  }
  if (byCourse.size > MAX_TERM_COURSES) throw new RangeError(`a term plan accepts at most ${MAX_TERM_COURSES} courses`);
  for (const courseRefs of chunks([...repeated].sort(byCodeUnit))) {
    issues.push({code:'NEEDS_REVIEW', reasonCode:'UNKNOWN', courseRefs, evidenceRefs:[]});
  }
  return [...byCourse.values()].sort((a, b) => byCodeUnit(a.courseId, b.courseId));
}

/** 학기 신청 학점 단위를 반환해 상한과 함께 표시하도록 한다. */
function checkCap(plan:TermPlan, load:readonly TermCourse[], packApproved:boolean, issues:PlanIssue[]):number {
  assertPositiveUnits(plan.creditCapUnits, 'creditCapUnits');
  const evidenceRefs = assertRefs(plan.capEvidenceRefs, 'capEvidenceRefs');
  let total = 0;
  for (const course of load) total = addUnits(total, course.units);
  if (total <= plan.creditCapUnits) return total;
  for (const courseRefs of chunks(load.map(course => course.courseId))) {
    issues.push(packApproved
      ? {code:'CREDIT_CAP_EXCEEDED', reasonCode:'EXCEEDS_APPROVED_LIMIT', courseRefs, evidenceRefs}
      : {code:'NEEDS_REVIEW', reasonCode:'UNKNOWN', courseRefs, evidenceRefs});
  }
  return total;
}

type PrerequisiteState = 'EARNED'|'REVIEW'|'MISSING';

/**
 * EARNED는 인정된 취득 기록이 있는 경우, REVIEW는 이전 학기 진행·계획·보류 기록이 있는 경우다.
 * 그 밖에는 MISSING이다. 같은 학기 수강은 선수과목으로 인정하지 않는다.
 */
function prerequisiteState(
  courseId:string,
  attempts:readonly LedgerAttempt[],
  excluded:ReadonlyMap<string, string>,
  planTermKey:number,
):PrerequisiteState {
  let review = false;
  for (const attempt of attempts) {
    if (attempt.canonicalCourseId !== courseId) continue;
    const reason = excluded.get(attempt.attemptToken);
    if (reason === undefined && attempt.ledger === 'EARNED') return 'EARNED';
    if (reason === 'NEEDS_REVIEW' || reason === 'PENDING_RECOGNITION') review = true;
    if (reason === undefined && attempt.ledger !== 'EARNED' && attempt.term !== undefined
      && termKey(attempt.term) < planTermKey) review = true;
  }
  return review ? 'REVIEW' : 'MISSING';
}

function checkPrerequisites(
  plan:TermPlan,
  load:readonly TermCourse[],
  attempts:readonly LedgerAttempt[],
  excluded:ReadonlyMap<string, string>,
  packApproved:boolean,
  issues:PlanIssue[],
):void {
  const rules = plan.prerequisites ?? [];
  if (!Array.isArray(rules)) throw new TypeError('prerequisites must be an array');
  if (rules.length > MAX_PREREQUISITES) throw new RangeError('too many prerequisite rules');
  const byCourse = new Map<string, {requires:string[]; evidenceRefs:string[]}>();
  for (const rule of rules) {
    assertId(rule.canonicalCourseId, 'prerequisite course');
    if (byCourse.has(rule.canonicalCourseId)) {
      throw new TypeError(`duplicate prerequisite rule for ${rule.canonicalCourseId}`);
    }
    if (!Array.isArray(rule.requiresCourseIds) || rule.requiresCourseIds.length === 0) {
      throw new TypeError(`${rule.canonicalCourseId} prerequisite lists no course`);
    }
    const requires = new Set<string>();
    for (const required of rule.requiresCourseIds) {
      assertId(required, `${rule.canonicalCourseId} prerequisite`);
      if (required === rule.canonicalCourseId) throw new TypeError(`${required} cannot require itself`);
      if (requires.has(required)) throw new TypeError(`${rule.canonicalCourseId} repeats prerequisite ${required}`);
      requires.add(required);
    }
    if (requires.size + 1 > 20) throw new RangeError(`${rule.canonicalCourseId} lists too many prerequisites`);
    byCourse.set(rule.canonicalCourseId, {
      requires:[...requires].sort(byCodeUnit),
      evidenceRefs:assertRefs(rule.evidenceRefs, `${rule.canonicalCourseId} prerequisite evidence`),
    });
  }

  const planTermKey = termKey(plan.term);
  for (const course of load) {
    if (!course.planned) continue;
    const rule = byCourse.get(course.courseId);
    if (!rule) continue;
    const missing:string[] = [];
    const review:string[] = [];
    for (const required of rule.requires) {
      const state = prerequisiteState(required, attempts, excluded, planTermKey);
      if (state === 'MISSING') missing.push(required);
      else if (state === 'REVIEW') review.push(required);
    }
    if (missing.length > 0) {
      const courseRefs = [course.courseId, ...missing];
      issues.push(packApproved
        ? {code:'PREREQUISITE_MISSING', reasonCode:'UNMET_OFFICIAL_PREREQUISITE', courseRefs, evidenceRefs:rule.evidenceRefs}
        : {code:'NEEDS_REVIEW', reasonCode:'UNKNOWN', courseRefs, evidenceRefs:rule.evidenceRefs});
    }
    if (review.length > 0) {
      issues.push({
        code:'NEEDS_REVIEW',
        reasonCode:'UNKNOWN',
        courseRefs:[course.courseId, ...review],
        evidenceRefs:rule.evidenceRefs,
      });
    }
  }
}

interface Section {
  sectionId:string;
  meetings:readonly SectionMeeting[];
  evidenceRefs:string[];
}

function validSections(plan:TermPlan, asOfMs:number):Map<string, Section[]> {
  const sections = plan.sections ?? [];
  if (!Array.isArray(sections)) throw new TypeError('sections must be an array');
  if (sections.length > MAX_SECTIONS) throw new RangeError('too many sections');
  const byCourse = new Map<string, Section[]>();
  const seen = new Set<string>();
  for (const section of sections) {
    assertId(section.canonicalCourseId, 'section course');
    assertId(section.sectionId, 'sectionId');
    const key = `${section.canonicalCourseId}\u0000${section.sectionId}`;
    if (seen.has(key)) throw new TypeError(`duplicate section ${section.sectionId} of ${section.canonicalCourseId}`);
    seen.add(key);
    if (section.term !== plan.term) {
      throw new TypeError(`section ${section.sectionId} is for ${section.term}, not ${plan.term}`);
    }
    const evidenceRefs = assertRefs(section.evidenceRefs, `section ${section.sectionId} evidence`);
    if (!Array.isArray(section.meetings) || section.meetings.length > MAX_MEETINGS) {
      throw new RangeError(`section ${section.sectionId} meetings must be an array of at most ${MAX_MEETINGS}`);
    }
    for (const meeting of section.meetings) {
      if (!WEEKDAYS.has(meeting.day)) throw new TypeError(`section ${section.sectionId} has no weekday`);
      const {startMinute:start, endMinute:end} = meeting;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end > MINUTES_PER_DAY || start >= end) {
        throw new TypeError(`section ${section.sectionId} meeting must be whole minutes within one day`);
      }
    }
    if (instantMs(section.verifiedAt, `section ${section.sectionId} verifiedAt`) > asOfMs) continue;
    const list = byCourse.get(section.canonicalCourseId) ?? [];
    list.push({sectionId:section.sectionId, meetings:section.meetings, evidenceRefs});
    byCourse.set(section.canonicalCourseId, list);
  }
  for (const list of byCourse.values()) list.sort((a, b) => byCodeUnit(a.sectionId, b.sectionId));
  return byCourse;
}

function overlaps(a:Section, b:Section):boolean {
  return a.meetings.some(x => b.meetings.some(y => x.day === y.day
    && x.startMinute < y.endMinute && y.startMinute < x.endMinute));
}

type Fit = 'FITS'|'NO_FIT'|'LIMIT';

/** 공식 검증 분반 중 시간이 겹치지 않는 조합 하나를 깊이 우선 탐색한다. */
function anyFit(courses:readonly Section[][]):Fit {
  let states = 0;
  const chosen:Section[] = [];
  const visit = (index:number):Fit => {
    if (index === courses.length) return 'FITS';
    for (const section of courses[index]!) {
      states += 1;
      if (states > MAX_ALLOCATION_STATES) return 'LIMIT';
      if (chosen.some(other => overlaps(other, section))) continue;
      chosen.push(section);
      const result = visit(index + 1);
      chosen.pop();
      if (result !== 'NO_FIT') return result;
    }
    return 'NO_FIT';
  };
  return visit(0);
}

/**
 * 요건별로 과목 참조 20개, 근거 참조 30개 이내로 나눠 보고한다.
 * 분반 하나의 근거가 30개를 넘으면 union 검사에서 거부한다.
 */
function evidenceGroups(courseIds:readonly string[], sections:ReadonlyMap<string, Section[]>):{courseRefs:string[]; evidenceRefs:string[]}[] {
  const groups:{courseRefs:string[]; evidenceRefs:string[]}[] = [];
  let courseRefs:string[] = [];
  let refs = new Set<string>();
  for (const courseId of courseIds) {
    const own = sections.get(courseId)!.flatMap(section => section.evidenceRefs);
    const merged = new Set([...refs, ...own]);
    if (courseRefs.length > 0 && (courseRefs.length === MAX_ISSUE_COURSES || merged.size > MAX_EVIDENCE)) {
      groups.push({courseRefs, evidenceRefs:union([[...refs]])});
      courseRefs = [];
      refs = new Set(own);
    } else {
      refs = merged;
    }
    courseRefs.push(courseId);
  }
  if (courseRefs.length > 0) groups.push({courseRefs, evidenceRefs:union([[...refs]])});
  return groups;
}

function checkTimetable(plan:TermPlan, load:readonly TermCourse[], asOfMs:number, issues:PlanIssue[]):void {
  const sections = validSections(plan, asOfMs);
  const unconfirmed = load.filter(course => !sections.has(course.courseId)).map(course => course.courseId);
  const timed = load.filter(course => sections.has(course.courseId)).map(course => course.courseId);

  let pairConflict = false;
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const a = sections.get(timed[i]!)!;
      const b = sections.get(timed[j]!)!;
      if (!a.every(x => b.every(y => overlaps(x, y)))) continue;
      pairConflict = true;
      issues.push({
        code:'TIMETABLE_CONFLICT',
        reasonCode:'ALL_VERIFIED_SECTIONS_OVERLAP',
        courseRefs:[timed[i]!, timed[j]!],
        evidenceRefs:union([...a, ...b].map(section => section.evidenceRefs)),
      });
    }
  }

  if (!pairConflict && timed.length > MAX_ISSUE_COURSES) {
    // 전체 과목의 NO_FIT을 20개씩 쪼개면 의미가 달라질 수 있다. 작은 그룹은 배치가 가능할 수도 있다.
    // 따라서 전체 탐색 미수행으로 표시하고 그룹별 분반 근거를 함께 기록한다.
    for (const group of evidenceGroups(timed, sections)) {
      issues.push({code:'SEARCH_LIMIT_REVIEW', reasonCode:'ALLOCATION_SEARCH_LIMIT', ...group});
    }
  } else if (!pairConflict && timed.length > 2) {
    const lists = timed.map(courseId => sections.get(courseId)!);
    const fit = anyFit(lists);
    if (fit !== 'FITS') {
      const evidenceRefs = union(lists.flat().map(section => section.evidenceRefs));
      issues.push(fit === 'LIMIT'
        ? {code:'SEARCH_LIMIT_REVIEW', reasonCode:'ALLOCATION_SEARCH_LIMIT', courseRefs:timed, evidenceRefs}
        : {code:'TIMETABLE_CONFLICT', reasonCode:'ALL_VERIFIED_SECTIONS_OVERLAP', courseRefs:timed, evidenceRefs});
    }
  }

  for (const courseRefs of chunks(unconfirmed)) {
    issues.push({code:'NEEDS_REVIEW', reasonCode:'COURSE_NOT_CONFIRMED', courseRefs, evidenceRefs:[]});
  }
}

/**
 * 먼저 학점 원장을 계산하고 한 학기 계획 문제(CREDIT-07~09)를 덧붙인다.
 * 학점·영역·제외·요건 결과는 동일 입력의 buildAcademicLedger와 일치해야 한다.
 * 승인된 RulePack이 없으면 상한·선수요건 차단은 NEEDS_REVIEW로 보류한다.
 */
export function buildAcademicPlan(input:AcademicPlanRequest):AcademicAuditVNext {
  return checkAcademicPlan(input).audit;
}

/** buildAcademicPlan과 같은 검사를 수행하면서 학기별 PLANNED·IN_PROGRESS 고유 학점 단위를 함께 반환한다. */
export function checkAcademicPlan(input:AcademicPlanRequest):{audit:AcademicAuditVNext; termLoadCreditUnits:number} {
  const {termPlan:plan, ...ledgerRequest} = input;
  const audit = buildAcademicLedger(ledgerRequest);
  if (!plan || typeof plan !== 'object') throw new TypeError('termPlan is required');
  const asOfMs = Date.parse(input.asOf);
  if (termEndMs(plan.term) <= asOfMs) throw new TypeError(`termPlan.term ${plan.term} has already ended by asOf`);

  const packApproved = input.rulePackState === 'APPROVED';
  const excluded = new Map(audit.excludedAttempts.map(row => [row.attemptToken, row.reason]));
  const issues:PlanIssue[] = [];
  const load = termLoad(input.attempts, plan.term, issues);
  const termLoadCreditUnits = checkCap(plan, load, packApproved, issues);
  checkPrerequisites(plan, load, input.attempts, excluded, packApproved, issues);
  checkTimetable(plan, load, asOfMs, issues);
  if (issues.length > MAX_PLAN_ISSUES) throw new RangeError('too many plan issues');

  const caveats = [...audit.caveats,
    `Plan check for ${plan.term}: approved cap, official prerequisites, and verified sections only. No timetable is produced.`];
  if (!packApproved) caveats.push('Rule pack is not APPROVED; cap and prerequisite blockers are held for review.');

  const parsed = AcademicAuditVNextSchema.safeParse({...audit, planIssues:issues, caveats});
  if (!parsed.success) {
    throw new TypeError(`academic plan result is not a valid audit: ${parsed.error.issues.map(issue => issue.message).join('; ')}`);
  }
  return {audit:parsed.data, termLoadCreditUnits};
}
