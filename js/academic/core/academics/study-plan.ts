import {
  OwnerWorkspaceValueSchema,
  type AcademicAuditVNext,
  type OwnerStudyPlanCheckResponse,
  type OwnerWorkspaceValue,
} from '../../contracts/index.js';
import {AS_OF, assertId, assertPositiveUnits, byCodeUnit, termEndMs, type LedgerAttempt, type RulePackGate} from './ledger.js';
import {checkAcademicPlan, type PrerequisiteRule, type VerifiedSection} from './plan.js';

/**
 * 졸업·수강계획 화면의 서버 측 검사 코어(A13, #81).
 * 저장한 STUDY_PLAN을 PLANNED 원장 행으로 옮겨 한 정규 학기만 검사한다.
 * 계획 문제·학기 학점·승인 상한·검토할 과목만 반환하고 성적표 원본·시도 토큰·성적은 노출하지 않는다.
 * 원장은 변경하지 않으며 APPROVED 규칙집이 없으면 확정 경고를 만들지 않는다.
 * 서버는 출처 링크·공개 범위·승인 확인을 별도 추가한다. 시계·네트워크·저장소에 의존하지 않는다.
 */

type PlanIssue = AcademicAuditVNext['planIssues'][number];
export type StudyPlanCaveat = OwnerStudyPlanCheckResponse['caveats'][number];
export type StudyPlanItem = Extract<OwnerWorkspaceValue, {kind:'STUDY_PLAN'}>;

export type UncheckedReason = 'TERM_UNDECIDED'|'TERM_ENDED'|'CREDITS_UNKNOWN';

export interface StudyPlanCheckRequest {
  asOf:string;
  /** 검사 대상은 정규 학기 YYYY-1 또는 YYYY-2이며 계절학기는 포함하지 않는다. */
  term:string;
  rulePack:{version:string; state:RulePackGate};
  /** 개인 성적표의 EARNED·IN_PROGRESS 기록이다. 계획 기록은 studyPlan에서만 가져온다. */
  attempts:readonly LedgerAttempt[];
  /** 저장된 STUDY_PLAN 값이다. planned=false 항목은 제외한다. */
  studyPlan:readonly unknown[];
  /** 과목별 학점 단위 카탈로그다. 1단위는 0.5학점이다. */
  courseCreditUnits:Readonly<Record<string, number>>;
  /** 승인된 RulePack의 학기 학점 상한 및 공식 선수과목 요건이다. */
  termRules:{creditCapUnits:number; capEvidenceRefs:readonly string[]; prerequisites?:readonly PrerequisiteRule[]};
  sections?:readonly VerifiedSection[];
  /** 화면에서 이전 계획 또는 카탈로그 판본으로 계산된 오래된 결과를 버릴 수 있도록 판본을 돌려준다. */
  versions?:Partial<Record<'rulePack'|'plan'|'catalog'|'transcript', string>>;
}

export interface StudyPlanCheck {
  state:'READY'|'NEEDS_REVIEW'|'INSUFFICIENT_DATA';
  asOf:string;
  term:string;
  versions:Partial<Record<'rulePack'|'plan'|'catalog'|'transcript', string>>;
  /** 해당 학기의 PLANNED·IN_PROGRESS 학점을 과목별로 한 번씩 계산한다. 취득 학점과 별도다. */
  termLoadCreditUnits:number;
  /** APPROVED 규칙집이 있는 경우에만 제공한다. */
  creditCapUnits?:number;
  planIssues:PlanIssue[];
  unchecked:{courseId:string; reason:UncheckedReason}[];
  caveats:StudyPlanCaveat[];
}

const REGULAR_TERM = /^(19|20|21)\d{2}-[12]$/;
const MAX_PLAN_ITEMS = 200;
const VERSION_KEYS = ['rulePack', 'plan', 'catalog', 'transcript'] as const;
const REVIEW_CODES:ReadonlySet<PlanIssue['code']> = new Set(['NEEDS_REVIEW', 'SEARCH_LIMIT_REVIEW']);

/**
 * #62는 미승인 규칙집의 상한·선수요건 경고를 보류하면서 시간 충돌을 보고할 수 있다.
 * 하지만 #103 응답 계약은 승인 없는 모든 확정 경고를 금지하므로 충돌도 이유를 남기고 보류한다.
 */
function holdUnapproved(issue:PlanIssue):PlanIssue {
  return issue.code === 'TIMETABLE_CONFLICT' ? {...issue, code:'NEEDS_REVIEW'} : issue;
}

function readPlan(raw:readonly unknown[]):StudyPlanItem[] {
  if (!Array.isArray(raw)) throw new TypeError('studyPlan must be an array');
  if (raw.length > MAX_PLAN_ITEMS) throw new RangeError(`studyPlan accepts at most ${MAX_PLAN_ITEMS} items`);
  return raw.map((item, index) => {
    const parsed = OwnerWorkspaceValueSchema.safeParse(item);
    if (!parsed.success || parsed.data.kind !== 'STUDY_PLAN') throw new TypeError(`studyPlan[${index}] is not a STUDY_PLAN item`);
    return parsed.data;
  });
}

function credits(table:Readonly<Record<string, number>>, courseId:string):number|undefined {
  if (!Object.prototype.hasOwnProperty.call(table, courseId)) return undefined;
  const units = table[courseId];
  assertPositiveUnits(units, `courseCreditUnits of ${courseId}`);
  return units;
}

export function simulateStudyPlan(input:StudyPlanCheckRequest):StudyPlanCheck {
  if (!AS_OF.test(input.asOf) || !Number.isFinite(Date.parse(input.asOf))) {
    throw new TypeError('asOf must be an ISO-8601 datetime with a timezone offset');
  }
  if (!REGULAR_TERM.test(input.term)) throw new TypeError('term must be a regular term YYYY-1 or YYYY-2');
  const asOfMs = Date.parse(input.asOf);
  if (termEndMs(input.term) <= asOfMs) throw new TypeError(`term ${input.term} has already ended by asOf`);

  const versions:StudyPlanCheck['versions'] = {};
  for (const key of VERSION_KEYS) {
    const value = input.versions?.[key];
    if (value === undefined) continue;
    assertId(value, `versions.${key}`);
    versions[key] = value;
  }

  for (const attempt of input.attempts) {
    if (attempt.ledger === 'PLANNED') {
      throw new TypeError(`attempt ${attempt.attemptToken} is PLANNED; plans come only from studyPlan`);
    }
  }

  const unchecked = new Map<string, UncheckedReason>();
  const seen = new Set<string>();
  const planned:LedgerAttempt[] = [];
  for (const item of readPlan(input.studyPlan)) {
    if (!item.planned) continue;
    if (item.targetTerm === 'UNDECIDED') {
      if (!unchecked.has(item.courseId)) unchecked.set(item.courseId, 'TERM_UNDECIDED');
      continue;
    }
    if (termEndMs(item.targetTerm) <= asOfMs) {
      if (!unchecked.has(item.courseId)) unchecked.set(item.courseId, 'TERM_ENDED');
      continue;
    }
    const key = `${item.courseId}\u0000${item.targetTerm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const units = credits(input.courseCreditUnits, item.courseId);
    if (units === undefined) {
      unchecked.set(item.courseId, 'CREDITS_UNKNOWN');
      continue;
    }
    planned.push({
      attemptToken:`PLAN:${item.courseId}:${item.targetTerm}`,
      canonicalCourseId:item.courseId,
      creditUnits:units,
      ledger:'PLANNED',
      areaIds:[],
      recognition:'RECOGNIZED',
      term:item.targetTerm,
    });
  }

  const {audit, termLoadCreditUnits} = checkAcademicPlan({
    asOf:input.asOf,
    rulePackVersion:input.rulePack.version,
    rulePackState:input.rulePack.state,
    attempts:[...input.attempts, ...planned],
    requirements:[],
    termPlan:{
      term:input.term,
      creditCapUnits:input.termRules.creditCapUnits,
      capEvidenceRefs:input.termRules.capEvidenceRefs,
      ...(input.termRules.prerequisites === undefined ? {} : {prerequisites:input.termRules.prerequisites}),
      ...(input.sections === undefined ? {} : {sections:input.sections}),
    },
  });

  const approved = input.rulePack.state === 'APPROVED';
  const planIssues = approved ? audit.planIssues : audit.planIssues.map(holdUnapproved);
  const uncheckedRows = [...unchecked].map(([courseId, reason]) => ({courseId, reason}))
    .sort((a, b) => byCodeUnit(a.courseId, b.courseId));
  const sectionsUnconfirmed = planIssues.some(issue => issue.reasonCode === 'COURSE_NOT_CONFIRMED');
  // READY 응답에는 모든 판본이 있어야 하며 화면에서 입력에 대응시킬 수 없는 결과는 보류한다.
  const versionsComplete = VERSION_KEYS.every(key => versions[key] !== undefined);
  let state:StudyPlanCheck['state'];
  if (input.rulePack.state === 'MISSING') state = 'INSUFFICIENT_DATA';
  else if (!approved || audit.state !== 'READY' || uncheckedRows.length > 0 || !versionsComplete
    || planIssues.some(issue => REVIEW_CODES.has(issue.code))) state = 'NEEDS_REVIEW';
  else state = 'READY';

  const caveats:StudyPlanCaveat[] = ['NOT_OFFICIAL_REGISTRATION', 'NOT_GRADUATION_DECISION'];
  if (!approved) caveats.push('RULEPACK_UNVERIFIED');
  if (sectionsUnconfirmed) caveats.push('SECTIONS_UNCONFIRMED');
  if (uncheckedRows.length > 0) caveats.push('PLAN_PARTIALLY_CHECKED');

  const result:StudyPlanCheck = {
    state, asOf:input.asOf, term:input.term, versions,
    termLoadCreditUnits,
    planIssues,
    unchecked:uncheckedRows,
    caveats,
  };
  if (approved) result.creditCapUnits = input.termRules.creditCapUnits;
  return result;
}
