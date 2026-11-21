import {AcademicAuditVNextSchema, type AcademicAuditVNext} from '../../contracts/index.js';
import {
  assertId, assertUnits, buildAcademicLedger, termKey,
  type AcademicLedgerRequest, type LedgerAttempt, type LedgerRecognition, type LedgerSlot,
} from './ledger.js';

/**
 * 학수번호가 전부 확정되지 않은 성적표의 학점 원장이다(#11).
 * RESOLVED 행은 검증된 대표 과목 ID로 일반 원장에 포함한다. NEEDS_REVIEW 행은 원본 행의 불투명 토큰만 보유하며 가짜 과목 ID를 생성하거나 학점으로 세지 않는다.
 * 미확정 행은 누락하지 않고 노출하며 영향을 줄 수 있는 요건은 검토 보류한다.
 * 미확정 여부의 판정은 호출자 책임이고 API는 아직 이 정보를 제공하지 않는다(COURSE_IDENTITY_API_CONNECTION).
 * 시계·네트워크·난수에 의존하지 않는다.
 */

/** 현재 API 어댑터(#276/#282)는 모든 행에 대표 학수번호를 요구하므로 아직 연결하지 않았다. */
export const COURSE_IDENTITY_API_CONNECTION = 'NOT_CONNECTED' as const;

export type ResolvedLedgerAttempt = LedgerAttempt & {identity:'RESOLVED'};

/** 학수번호나 동일 교과목 관계가 검증되지 않은 원본 행이다. */
export interface UnresolvedLedgerAttempt {
  identity:'NEEDS_REVIEW';
  /** 원본 행의 불투명 식별 토큰이며 학수번호가 아니다. */
  attemptToken:string;
  creditUnits:number;
  ledger:LedgerSlot;
  recognition:LedgerRecognition;
  term?:string;
  supersedesAttemptToken?:string;
  retakeApprovalRef?:string;
}

export type IdentifiedLedgerAttempt = ResolvedLedgerAttempt | UnresolvedLedgerAttempt;

export interface IdentifiedLedgerRequest extends Omit<AcademicLedgerRequest, 'attempts'> {
  attempts:readonly IdentifiedLedgerAttempt[];
}

export interface UnresolvedCourseSummary {
  /** 미확정 행의 토큰을 입력 순서대로 보존한다. */
  attemptTokens:string[];
  /** 재수강 관계로 미확정 행에 연결된 확정 행 토큰을 입력 순서대로 보존한다. */
  linkedAttemptTokens:string[];
  /** 미확정 행이 영향을 줄 수 있는 요건 ID를 요청 순서대로 담는다. */
  affectedRequirementIds:string[];
}

export interface IdentifiedLedgerResult {
  audit:AcademicAuditVNext;
  unresolved:UnresolvedCourseSummary;
}

const UNRESOLVED_KEYS = new Set([
  'identity', 'attemptToken', 'creditUnits', 'ledger', 'recognition', 'term', 'supersedesAttemptToken', 'retakeApprovalRef',
]);
const MAX_EXCLUDED = 150;

function checkUnresolved(row:UnresolvedLedgerAttempt):void {
  assertId(row.attemptToken, 'attemptToken');
  if ('canonicalCourseId' in row) {
    throw new TypeError(`unresolved attempt ${row.attemptToken} must not carry canonicalCourseId; a placeholder course id is refused`);
  }
  if ('areaIds' in row) {
    throw new TypeError(`unresolved attempt ${row.attemptToken} must not carry areaIds; areas come from a confirmed course`);
  }
  for (const key of Object.keys(row)) {
    if (!UNRESOLVED_KEYS.has(key)) throw new TypeError(`unresolved attempt ${row.attemptToken} has unknown field ${key}`);
  }
  assertUnits(row.creditUnits, `creditUnits of ${row.attemptToken}`);
  if (row.ledger !== 'EARNED' && row.ledger !== 'IN_PROGRESS' && row.ledger !== 'PLANNED') {
    throw new TypeError(`${row.attemptToken} has no ledger slot`);
  }
  if (row.recognition !== 'RECOGNIZED' && row.recognition !== 'PENDING' && row.recognition !== 'EXCLUDED') {
    throw new TypeError(`${row.attemptToken} has no recognition`);
  }
  if (row.term !== undefined) termKey(row.term);
  if (row.supersedesAttemptToken !== undefined) assertId(row.supersedesAttemptToken, 'supersedesAttemptToken');
  if (row.retakeApprovalRef !== undefined) assertId(row.retakeApprovalRef, 'retakeApprovalRef');
}

/**
 * RESOLVED 행만 학점·영역 계산에 사용하고 NEEDS_REVIEW 행은 별도로 기록한다.
 * 미확정 인정 행이나 재수강 관계는 어떤 과목인지에 따라 요건 판정이 달라지므로 관련 요건을 NEEDS_REVIEW로 보류한다. 기존 계산 수치는 유지한다.
 * 재수강 관계가 없는 PENDING·EXCLUDED 행은 요건에 영향을 주지 않는다.
 * 미확정 행과 연결된 재수강은 확정 행의 학점을 임의로 취소하지 않고 검토 대상으로 남긴다.
 */
export function buildLedgerWithCourseIdentity(input:IdentifiedLedgerRequest):IdentifiedLedgerResult {
  if (!Array.isArray(input.attempts)) throw new TypeError('attempts must be an array');
  const resolved:LedgerAttempt[] = [];
  const unresolved:UnresolvedLedgerAttempt[] = [];
  const tokens = new Set<string>();
  for (const row of input.attempts) {
    const identity = (row as {identity?:unknown}).identity;
    if (identity === 'RESOLVED') {
      const {identity:_drop, ...attempt} = row as ResolvedLedgerAttempt;
      resolved.push(attempt);
    } else if (identity === 'NEEDS_REVIEW') {
      checkUnresolved(row as UnresolvedLedgerAttempt);
      unresolved.push(row as UnresolvedLedgerAttempt);
    } else {
      throw new TypeError('every attempt needs identity RESOLVED or NEEDS_REVIEW');
    }
    if (tokens.has(row.attemptToken)) throw new TypeError(`duplicate attempt ${row.attemptToken}`);
    tokens.add(row.attemptToken);
  }

  const base = buildAcademicLedger({...input, attempts:resolved});
  if (unresolved.length === 0) return {audit:base, unresolved:{attemptTokens:[], linkedAttemptTokens:[], affectedRequirementIds:[]}};
  if (base.excludedAttempts.length + unresolved.length > MAX_EXCLUDED) throw new RangeError('too many excluded attempts');

  const unresolvedTokens = new Set(unresolved.map(row => row.attemptToken));
  const linkedUnresolved = new Set<string>();
  const linkedResolved = new Set<string>();
  for (const row of input.attempts) {
    const target = row.supersedesAttemptToken;
    if (target === undefined) continue;
    if (unresolvedTokens.has(row.attemptToken)) {
      linkedUnresolved.add(row.attemptToken);
      if (tokens.has(target) && !unresolvedTokens.has(target)) linkedResolved.add(target);
    }
    if (unresolvedTokens.has(target)) {
      linkedUnresolved.add(target);
      if (!unresolvedTokens.has(row.attemptToken)) linkedResolved.add(row.attemptToken);
    }
  }
  const live = unresolved.some(row => row.recognition === 'RECOGNIZED' || linkedUnresolved.has(row.attemptToken));

  const readsAttempts = new Set(input.requirements.filter(r => r.kind !== 'NON_CREDIT').map(r => r.id));
  const affectedRequirementIds = live ? input.requirements.filter(r => readsAttempts.has(r.id)).map(r => r.id) : [];
  const affected = new Set(affectedRequirementIds);
  const requirements = base.requirements.map(row =>
    affected.has(row.requirementId) && (row.state === 'SATISFIED' || row.state === 'UNSATISFIED')
      ? {...row, state:'NEEDS_REVIEW' as const}
      : row);

  const baseReasons = new Map(base.excludedAttempts.map(row => [row.attemptToken, row.reason]));
  const excludedAttempts = input.attempts.flatMap(row => {
    if (unresolvedTokens.has(row.attemptToken)) return [{attemptToken:row.attemptToken, reason:'NEEDS_REVIEW' as const}];
    const reason = baseReasons.get(row.attemptToken);
    return reason ? [{attemptToken:row.attemptToken, reason}] : [];
  });

  const caveats = [...base.caveats,
    `${unresolved.length} course row(s) have no confirmed course code; they are not counted in any credit or area total.`];
  if (live) caveats.push('Requirement rows those course rows could change are held for review; the numbers shown come from confirmed rows only.');
  if (linkedUnresolved.size > 0) caveats.push('A retake link touches a course row without a confirmed code; the linked attempts are not settled.');

  const parsed = AcademicAuditVNextSchema.safeParse({
    ...base,
    state:base.state === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA' : 'NEEDS_REVIEW',
    excludedAttempts,
    requirements,
    caveats,
  });
  if (!parsed.success) {
    throw new TypeError(`academic ledger result is not a valid audit: ${parsed.error.issues.map(issue => issue.message).join('; ')}`);
  }
  return {
    audit:parsed.data,
    unresolved:{
      attemptTokens:unresolved.map(row => row.attemptToken),
      linkedAttemptTokens:input.attempts.filter(row => linkedResolved.has(row.attemptToken)).map(row => row.attemptToken),
      affectedRequirementIds,
    },
  };
}
