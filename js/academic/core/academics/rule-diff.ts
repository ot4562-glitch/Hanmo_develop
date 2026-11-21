import {
  AcademicRulePackVNextSchema,
  stableAcademicRequirementIdsVNext,
  type AcademicAuditVNext,
  type AcademicRulePackVNext,
} from '../../contracts/index.js';
import {AS_OF, buildAcademicLedger, byCodeUnit, type LedgerAttempt, type LedgerRequirement} from './ledger.js';

/**
 * 동일 RulePack의 승인된 두 판본을 같은 학점 원장에 적용해 요건별 규칙과 결과 차이를 계산한다(#87).
 * 학점 영역은 규칙집이 아닌 원장 행에서 분류하며 새 분류(nextAttempts)가 없으면 영역 요건은 UNKNOWN이다.
 * 직계 판본 관계가 불확실하면 결과를 차단해 낡은 SATISFIED 판정이 검증 없이 이어지지 않게 한다.
 * 규칙집을 활성화하거나 졸업을 판정하지 않으며 asOf는 호출자가 제공한다.
 */

type Pack = AcademicRulePackVNext;
type Requirement = Pack['requirements'][number];
type ProgressRow = AcademicAuditVNext['requirements'][number];
type ProgressState = ProgressRow['state'];

export type RevisionBlockerCode =
  | 'NOT_APPROVED'
  | 'NOT_APPROVED_BY_AS_OF'
  | 'SAME_VERSION'
  | 'NOT_SUPERSEDING'
  | 'REQUIREMENT_ID_UNSTABLE'
  | 'SCOPE_MISMATCH'
  | 'HISTORY_INVERTED'
  | 'EFFECTIVE_GAP'
  | 'EFFECTIVE_OVERLAP';

export interface RevisionBlocker {
  code:RevisionBlockerCode;
  /** 한쪽 입력만 잘못된 경우 문제가 있는 판본을 표시한다. */
  side?:'previous'|'next';
}

export type DefinitionChange = 'UNCHANGED'|'CHANGED'|'ADDED'|'REMOVED';
/** SAME은 동일, GAINED는 새로 충족, LOST는 충족 상실, UNKNOWN은 어느 쪽이든 판정이 보류된 상태다. */
export type StateChange = 'SAME'|'GAINED'|'LOST'|'UNKNOWN';
export type ChangedField =
  | 'kind'|'requiredCreditUnits'|'areaId'|'areaIds'|'minAreas'|'groups'|'canonicalCourseId'|'courseIds'|'k'
  | 'criterionId'|'verificationMode'|'sourceClauseIds'|'exceptionClauseIds'|'clauses'
  /** 새 판본에서 과목의 학점 영역이 바뀌었는지 나타낸다. 근거는 RulePack이 아닌 nextAttempts다. */
  | 'areaMembership';

interface SideResult {
  state:ProgressState;
  requiredCreditUnits?:number;
  earnedCreditUnits?:number;
  remainingCreditUnits?:number;
  projectedCreditUnits?:number;
  /** 원문 조항 및 예외 조항 ID를 정렬한 목록이다. */
  clauseIds:string[];
}

export interface RequirementRevision {
  requirementId:string;
  semanticKey:string;
  definition:DefinitionChange;
  changedFields:ChangedField[];
  /** 해당 요건이 두 판본에 모두 존재할 때만 나타낸다. */
  stateChange?:StateChange;
  previous?:SideResult;
  next?:SideResult;
}

export interface RulePackRevisionDiff {
  state:'READY'|'NEEDS_REVIEW';
  asOf:string;
  previousVersion?:string;
  nextVersion?:string;
  /** AMENDMENT는 새 판본의 적용 시작일부터 이전 판본을 대체한다. CORRECTION은 같은 기간의 정정판이다. */
  revisionKind?:'AMENDMENT'|'CORRECTION';
  /** asOf가 시작 시각 이상·종료 시각 미만인 유효 판본을 선택한다. */
  inEffectAtAsOf:'PREVIOUS'|'NEXT'|'NONE'|'BOTH';
  blockers:RevisionBlocker[];
  requirements:RequirementRevision[];
  caveats:string[];
}

export interface RulePackRevisionRequest {
  asOf:string;
  previous:unknown;
  next:unknown;
  /** 이전 판본 기준으로 학점 영역을 분류한 원장 행이다. */
  attempts:readonly LedgerAttempt[];
  /**
   * 같은 원장 행을 새 판본에 따라 분류한 자료다. RulePack 자체에는 과목별 영역 목록이 없다.
   * areaIds만 변경할 수 있으며 생략하면 CATEGORY_MINIMUM·AREA_SPREAD 결과를 UNKNOWN으로 둔다.
   * 영역 배정이 같다는 사실을 명시하려면 이전 행과 동일한 데이터를 전달한다.
   */
  nextAttempts?:readonly LedgerAttempt[];
}

/** areaIds 이외 필드는 행별로 완전히 동일해야 한다. 영역 배정만 바뀔 수 있다. */
function movedAreas(previous:readonly LedgerAttempt[], next:readonly LedgerAttempt[]):Set<string> {
  if (!Array.isArray(next)) throw new TypeError('nextAttempts must be an array');
  if (next.length !== previous.length) throw new TypeError('nextAttempts must list the same ledger rows');
  const rest = (row:LedgerAttempt) => JSON.stringify([row.canonicalCourseId, row.creditUnits, row.ledger,
    row.recognition, row.term ?? null, row.supersedesAttemptToken ?? null, row.retakeApprovalRef ?? null]);
  const byToken = new Map<string, LedgerAttempt>();
  for (const row of previous) {
    if (byToken.has(row.attemptToken)) throw new TypeError(`attempts repeat ${row.attemptToken}`);
    byToken.set(row.attemptToken, row);
  }
  const seen = new Set<string>(), moved = new Set<string>();
  for (const row of next) {
    const before = byToken.get(row.attemptToken);
    if (!before || seen.has(row.attemptToken) || rest(before) !== rest(row)) {
      throw new TypeError(`nextAttempts may change only areaIds (row ${String(row.attemptToken)})`);
    }
    seen.add(row.attemptToken);
    const a = new Set<string>(before.areaIds), b = new Set<string>(row.areaIds);
    for (const id of a) if (!b.has(id)) moved.add(id);
    for (const id of b) if (!a.has(id)) moved.add(id);
  }
  return moved;
}

/** 요건 판정에 필요한 원장 행의 영역 목록이다. */
function areasRead(requirement:Requirement):readonly string[] {
  if (requirement.kind === 'CATEGORY_MINIMUM') return [requirement.areaId];
  if (requirement.kind === 'AREA_SPREAD') return requirement.areaIds;
  return [];
}

const UNVERIFIED:ReadonlySet<ProgressState> = new Set(['NEEDS_REVIEW', 'NOT_CHECKED', 'NOT_APPLICABLE']);

function toLedger(requirement:Requirement):LedgerRequirement {
  const base = {id:requirement.id, evidenceRefs:requirement.evidenceRefs};
  switch (requirement.kind) {
    case 'CREDIT_TOTAL': return {...base, kind:'CREDIT_TOTAL', requiredCreditUnits:requirement.requiredCreditUnits};
    case 'CATEGORY_MINIMUM':
      return {...base, kind:'CATEGORY_MINIMUM', areaId:requirement.areaId, requiredCreditUnits:requirement.requiredCreditUnits};
    case 'REQUIRED_COURSE': return {...base, kind:'REQUIRED_COURSE', canonicalCourseId:requirement.canonicalCourseId};
    case 'K_OF_N': return {...base, kind:'K_OF_N', courseIds:requirement.courseIds, k:requirement.k};
    case 'AREA_SPREAD': return {...base, kind:'AREA_SPREAD', areaIds:requirement.areaIds,
      minAreas:requirement.minAreas, requiredCreditUnits:requirement.requiredCreditUnits};
    case 'GROUP_CHOICE': return {...base, kind:'GROUP_CHOICE', groups:requirement.groups, k:requirement.k};
    case 'NON_CREDIT':
      return {...base, kind:'NON_CREDIT', criterionId:requirement.criterionId, verificationMode:requirement.verificationMode};
  }
}

function sorted(values:readonly string[]):string[] {
  return [...values].sort(byCodeUnit);
}

function sameList(a:readonly string[], b:readonly string[]):boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** 요건 결과를 바꾸는 규칙 필드다. 출처인 evidenceRefs는 차이 비교 대상이 아니다. */
function ruleFields(requirement:Requirement):Partial<Record<ChangedField, string>> {
  const fields:Partial<Record<ChangedField, string>> = {
    kind:requirement.kind,
    sourceClauseIds:sorted(requirement.sourceClauseIds).join('\u0000'),
    exceptionClauseIds:sorted(requirement.exceptionClauseIds).join('\u0000'),
  };
  if (requirement.kind === 'CREDIT_TOTAL') fields.requiredCreditUnits = String(requirement.requiredCreditUnits);
  if (requirement.kind === 'CATEGORY_MINIMUM') {
    fields.areaId = requirement.areaId;
    fields.requiredCreditUnits = String(requirement.requiredCreditUnits);
  }
  if (requirement.kind === 'REQUIRED_COURSE') fields.canonicalCourseId = requirement.canonicalCourseId;
  if (requirement.kind === 'K_OF_N') {
    fields.courseIds = sorted(requirement.courseIds).join('\u0000');
    fields.k = String(requirement.k);
  }
  if (requirement.kind === 'AREA_SPREAD') {
    fields.areaIds = sorted(requirement.areaIds).join('\u0000');
    fields.minAreas = String(requirement.minAreas);
    fields.requiredCreditUnits = String(requirement.requiredCreditUnits);
  }
  if (requirement.kind === 'GROUP_CHOICE') {
    fields.groups = JSON.stringify(requirement.groups.map(group => JSON.stringify(sorted(group))).sort(byCodeUnit));
    fields.k = String(requirement.k);
  }
  if (requirement.kind === 'NON_CREDIT') {
    fields.criterionId = requirement.criterionId;
    fields.verificationMode = requirement.verificationMode;
  }
  return fields;
}

const FIELD_ORDER:readonly ChangedField[] = [
  'kind', 'requiredCreditUnits', 'areaId', 'areaIds', 'minAreas', 'groups', 'canonicalCourseId', 'courseIds', 'k',
  'criterionId', 'verificationMode', 'sourceClauseIds', 'exceptionClauseIds', 'clauses',
];

function clauseIdsOf(requirement:Requirement):string[] {
  return sorted([...new Set([...requirement.sourceClauseIds, ...requirement.exceptionClauseIds])]);
}

/** 같은 조항 ID라도 문구가 변경될 수 있으므로 조항 종류와 원본 위치를 함께 비교한다. */
function clausesReworded(previous:Pack, next:Pack, ids:readonly string[]):boolean {
  const before = new Map(previous.clauseInventory.map(clause => [clause.clauseId, clause]));
  const after = new Map(next.clauseInventory.map(clause => [clause.clauseId, clause]));
  return ids.some(id => {
    const a = before.get(id), b = after.get(id);
    const sourceHash = (pack:Pack, documentId:string|undefined) => documentId === undefined
      ? pack.sourceDocumentSha256 : pack.sourceDocuments?.find(d => d.documentId === documentId)?.sha256;
    return !a || !b || a.kind !== b.kind || a.sourceSpanRef !== b.sourceSpanRef
      || a.sourceDocumentId !== b.sourceDocumentId
      || (a.sourceDocumentId !== undefined || b.sourceDocumentId !== undefined)
        && sourceHash(previous, a.sourceDocumentId) !== sourceHash(next, b.sourceDocumentId);
  });
}

function changedFields(previous:Pack, next:Pack, a:Requirement, b:Requirement):ChangedField[] {
  const before = ruleFields(a), after = ruleFields(b);
  const changed = FIELD_ORDER.filter(field => field !== 'clauses' && before[field] !== after[field]);
  const ids = clauseIdsOf(a);
  if (sameList(ids, clauseIdsOf(b)) && clausesReworded(previous, next, ids)) changed.push('clauses');
  return changed;
}

function side(requirement:Requirement, row:ProgressRow):SideResult {
  const result:SideResult = {state:row.state, clauseIds:clauseIdsOf(requirement)};
  if (row.requiredCreditUnits !== undefined) result.requiredCreditUnits = row.requiredCreditUnits;
  if (row.earnedCreditUnits !== undefined) result.earnedCreditUnits = row.earnedCreditUnits;
  if (row.remainingCreditUnits !== undefined) result.remainingCreditUnits = row.remainingCreditUnits;
  if (row.projectedCreditUnits !== undefined) result.projectedCreditUnits = row.projectedCreditUnits;
  return result;
}

function stateChange(before:ProgressState, after:ProgressState):StateChange {
  if (UNVERIFIED.has(before) || UNVERIFIED.has(after)) return 'UNKNOWN';
  if (before === after) return 'SAME';
  return after === 'SATISFIED' ? 'GAINED' : 'LOST';
}

function inEffect(pack:Pack, asOfMs:number):boolean {
  return Date.parse(pack.effectiveFrom) <= asOfMs
    && (pack.effectiveUntil === undefined || asOfMs < Date.parse(pack.effectiveUntil));
}

function sameScope(a:Pack['scope'], b:Pack['scope']):boolean {
  return a.campus === b.campus && a.primaryMajor === b.primaryMajor
    && a.secondaryMajor === b.secondaryMajor && a.majorRole === b.majorRole
    && a.admissionType === b.admissionType && a.curriculumVersion === b.curriculumVersion
    && a.cohortFrom === b.cohortFrom && a.cohortTo === b.cohortTo
    && a.degreePath === b.degreePath && a.track === b.track;
}

function approvedPack(raw:unknown, sideName:'previous'|'next', asOfMs:number, blockers:RevisionBlocker[]):Pack|undefined {
  const parsed = AcademicRulePackVNextSchema.safeParse(raw);
  if (!parsed.success || parsed.data.state !== 'APPROVED' || !parsed.data.approvedAt) {
    blockers.push({code:'NOT_APPROVED', side:sideName});
    return undefined;
  }
  const pack = parsed.data;
  if (Date.parse(pack.approvedAt!) > asOfMs || Date.parse(pack.sourcePublishedAt) > asOfMs
    || (pack.validationReport && Date.parse(pack.validationReport.checkedAt) > asOfMs)) {
    blockers.push({code:'NOT_APPROVED_BY_AS_OF', side:sideName});
  }
  return pack;
}

/** 두 판본이 명확히 하나의 변경 관계인지 검증하고 관계 유형을 반환한다. */
function checkRevision(previous:Pack, next:Pack, blockers:RevisionBlocker[]):'AMENDMENT'|'CORRECTION'|undefined {
  if (previous.version === next.version) {
    blockers.push({code:'SAME_VERSION'});
    return undefined;
  }
  if (next.supersedesVersion !== previous.version) blockers.push({code:'NOT_SUPERSEDING', side:'next'});
  else if (!stableAcademicRequirementIdsVNext(previous, next)) blockers.push({code:'REQUIREMENT_ID_UNSTABLE', side:'next'});
  if (!sameScope(previous.scope, next.scope)) blockers.push({code:'SCOPE_MISMATCH'});

  const fromPrev = Date.parse(previous.effectiveFrom), fromNext = Date.parse(next.effectiveFrom);
  if (fromNext < fromPrev || Date.parse(next.approvedAt!) < Date.parse(previous.approvedAt!)) {
    blockers.push({code:'HISTORY_INVERTED'});
    return undefined;
  }
  if (fromNext === fromPrev) {
    // CORRECTION은 같은 유효 기간에 다시 발행한 판본이다. 다른 기간은 모호하므로 거부한다.
    if (previous.effectiveUntil !== next.effectiveUntil) blockers.push({code:'EFFECTIVE_OVERLAP'});
    return 'CORRECTION';
  }
  if (previous.effectiveUntil === undefined || Date.parse(previous.effectiveUntil) > fromNext) {
    blockers.push({code:'EFFECTIVE_OVERLAP'});
  } else if (Date.parse(previous.effectiveUntil) < fromNext) {
    blockers.push({code:'EFFECTIVE_GAP'});
  }
  return 'AMENDMENT';
}

function blocked(asOf:string, blockers:RevisionBlocker[], inEffectAtAsOf:RulePackRevisionDiff['inEffectAtAsOf'],
  previous?:Pack, next?:Pack):RulePackRevisionDiff {
  const result:RulePackRevisionDiff = {
    state:'NEEDS_REVIEW', asOf, inEffectAtAsOf, blockers, requirements:[],
    caveats:['Revision comparison is blocked; no requirement result is carried across this change.'],
  };
  if (previous) result.previousVersion = previous.version;
  if (next) result.nextVersion = next.version;
  return result;
}

/**
 * 한 원장 행 목록으로 같은 RulePack의 두 APPROVED 판본을 비교한다.
 * 이전에는 attempts, 새 판본에는 nextAttempts(없으면 attempts)를 사용하여 각 판본의 buildAcademicLedger 요건 결과와 맞춘다.
 */
export function compareRulePackRevisions(input:RulePackRevisionRequest):RulePackRevisionDiff {
  if (!AS_OF.test(input.asOf) || !Number.isFinite(Date.parse(input.asOf))) {
    throw new TypeError('asOf must be an ISO-8601 datetime with a timezone offset');
  }
  const asOfMs = Date.parse(input.asOf);
  if (input.nextAttempts !== undefined && !Array.isArray(input.attempts)) throw new TypeError('attempts must be an array');
  /** 새 판본에서 어떤 과목이 새로 속하거나 제외된 학점 영역이다. 공급되지 않으면 undefined다. */
  const moved = input.nextAttempts === undefined ? undefined : movedAreas(input.attempts, input.nextAttempts);
  const blockers:RevisionBlocker[] = [];
  const previous = approvedPack(input.previous, 'previous', asOfMs, blockers);
  const next = approvedPack(input.next, 'next', asOfMs, blockers);

  const prevOn = previous ? inEffect(previous, asOfMs) : false;
  const nextOn = next ? inEffect(next, asOfMs) : false;
  const inEffectAtAsOf = prevOn && nextOn ? 'BOTH' : prevOn ? 'PREVIOUS' : nextOn ? 'NEXT' : 'NONE';
  if (!previous || !next) return blocked(input.asOf, blockers, inEffectAtAsOf, previous, next);

  const revisionKind = checkRevision(previous, next, blockers);
  if (blockers.length > 0) return blocked(input.asOf, blockers, inEffectAtAsOf, previous, next);

  const audit = (pack:Pack, attempts:readonly LedgerAttempt[]) => buildAcademicLedger({
    asOf:input.asOf,
    rulePackVersion:pack.version,
    rulePackState:'APPROVED',
    attempts,
    requirements:pack.requirements.map(toLedger),
  });
  const before = audit(previous, input.attempts), after = audit(next, input.nextAttempts ?? input.attempts);
  const rowsBefore = new Map(before.requirements.map(row => [row.requirementId, row]));
  const rowsAfter = new Map(after.requirements.map(row => [row.requirementId, row]));
  const reqBefore = new Map(previous.requirements.map(req => [req.id, req]));
  const reqAfter = new Map(next.requirements.map(req => [req.id, req]));

  const ids = sorted([...new Set([...reqBefore.keys(), ...reqAfter.keys()])]);
  const requirements = ids.map((id):RequirementRevision => {
    const a = reqBefore.get(id), b = reqAfter.get(id);
    if (a && b) {
      const fields = changedFields(previous, next, a, b);
      const reads = [...areasRead(a), ...areasRead(b)];
      if (moved && reads.some(areaId => moved.has(areaId))) fields.push('areaMembership');
      const prevSide = side(a, rowsBefore.get(id)!), nextSide = side(b, rowsAfter.get(id)!);
      return {
        requirementId:id, semanticKey:b.semanticKey,
        definition:fields.length > 0 ? 'CHANGED' : 'UNCHANGED',
        changedFields:fields,
        // 새 영역 분류 정보가 없으면 영역 요건이 SAME·GAINED·LOST인지 확정할 수 없다.
        stateChange:!moved && reads.length > 0 ? 'UNKNOWN' : stateChange(prevSide.state, nextSide.state),
        previous:prevSide, next:nextSide,
      };
    }
    if (b) return {requirementId:id, semanticKey:b.semanticKey, definition:'ADDED', changedFields:[], next:side(b, rowsAfter.get(id)!)};
    return {requirementId:id, semanticKey:a!.semanticKey, definition:'REMOVED', changedFields:[], previous:side(a!, rowsBefore.get(id)!)};
  });

  const unverified = before.state !== 'READY' || after.state !== 'READY'
    || requirements.some(row => row.stateChange === 'UNKNOWN');
  const caveats = ['Comparison only; neither pack is activated and no graduation decision is made.'];
  if (requirements.some(row => row.stateChange === 'LOST')) {
    caveats.push('Some requirements satisfied under the previous version are not satisfied under the next one.');
  }
  const readsAreas = [...previous.requirements, ...next.requirements].some(req => areasRead(req).length > 0);
  if (!moved && readsAreas) {
    caveats.push('Area membership under the next version was not supplied; area-based results are UNKNOWN.');
  }
  if (moved && moved.size > 0) caveats.push('Some courses count in different areas under the next version.');
  if (unverified) caveats.push('Some results are unverified on at least one side; their change is UNKNOWN.');
  return {
    state:unverified ? 'NEEDS_REVIEW' : 'READY',
    asOf:input.asOf,
    previousVersion:previous.version,
    nextVersion:next.version,
    revisionKind:revisionKind!,
    inEffectAtAsOf,
    blockers:[],
    requirements,
    caveats,
  };
}
