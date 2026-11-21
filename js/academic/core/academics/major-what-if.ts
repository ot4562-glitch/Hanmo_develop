import {
  AcademicDegreePathVNextSchema, type AcademicDegreePathVNext,
  isConsistentMajorWhatIfDelta, OwnerMajorWhatIfScenarioSchema,
  type MajorWhatIfDeltaRow, type MajorWhatIfRequirementProgress, type OwnerMajorWhatIfRequest,
} from '../../contracts/index.js';
import {buildDoubleMajorAudit, type DoubleMajorAttempt, type MajorRulePack, type OverlapRowImpact, type OverlapRule} from './double-major.js';
import {assertId, type LedgerRequirement} from './ledger.js';

/**
 * 같은 학생의 성적표로 현재 전공 구성과 한 가지 가상 변경(주전공·이중전공·부전공)을 비교한다(#11, #82).
 * 두 쪽 모두 같은 수강 기록을 사용하므로 총 취득 학점에서 과목을 중복 계산하지 않는다.
 * 전공 경로나 주전공에 따라 다른 RulePack을 선택할 수 있으며, 승인된 조합이 없으면 임의로 대체하지 않는다.
 * 결과는 현재·가상 상태의 투영과 요건 차이이며 실제 전공 변경이나 졸업 판정이 아니다.
 */

export const MAJOR_WHAT_IF_CORE_VERSION = 'hufs-major-what-if-2';

export type WhatIfScenario = OwnerMajorWhatIfRequest['scenario'];
export type DegreePath = AcademicDegreePathVNext;
/** 이전 입력과의 호환을 위한 필드이며 현재 공유 계약의 결과에는 내보내지 않는다. */
type LegacyDegreePath = 'MAJOR_DEEPENING'|'MAJOR_DEEPENING_MINOR';
function canonicalDegreePath(value:unknown,programId:string):DegreePath {
  // 허용된 별칭만 정확히 정규화한다. 알 수 없는 값이 다른 학위 경로로 조용히 바뀌어서는 안 된다.
  if(value==='MAJOR_DEEPENING')return 'ADVANCED_SINGLE';
  if(value==='MAJOR_DEEPENING_MINOR')return 'ADVANCED_PLUS_MINOR';
  const parsed=AcademicDegreePathVNextSchema.safeParse(value);
  if(!parsed.success)throw new TypeError(`Primary pack ${programId} needs a supported degree path`);
  return parsed.data;
}
export type SecondaryRole = 'DOUBLE_MAJOR'|'MINOR';

/** 학생이 현재 등록한 전공 구성. 이중전공 또는 부전공 중 두 번째 전공은 최대 하나다. */
export interface ProgramEnrollment {
  primaryProgramId:string;
  secondary?:{role:SecondaryRole; programId:string};
}

/** 해당 학생의 입학년도에 적용되는 승인 또는 승인 대기 RulePack 하나다. */
export type ProgramOffer =
  | {role:'PRIMARY_MAJOR'; programId:string; degreePath:DegreePath|LegacyDegreePath; pack:MajorRulePack}
  | {
    role:SecondaryRole; programId:string;
    /**
     * 이 RulePack이 승인된 주전공을 가리킨다.
     * 모든 주전공에서 공통 사용 가능한 경우에만 생략한다. 하나의 두 번째 전공에 대해 공통판과 주전공별 판본을 혼합하지 않는다.
     */
    primaryProgramId?:string;
    pack:MajorRulePack & {overlapRule?:OverlapRule};
  };

export interface MajorWhatIfRequest {
  asOf:string;
  attempts:readonly DoubleMajorAttempt[];
  current:ProgramEnrollment;
  scenario:WhatIfScenario;
  programs:readonly ProgramOffer[];
}

export type MajorWhatIfBlocker = 'CURRENT_RULEPACK_NOT_APPROVED'|'RULEPACK_NOT_APPROVED'|'TARGET_PROGRAM_UNAVAILABLE';

export interface WhatIfProjection {
  role:'CURRENT'|'HYPOTHETICAL';
  asOf:string;
  enrollment:ProgramEnrollment;
  degreePath:DegreePath;
  /** 주전공 규칙집을 먼저, 두 번째 전공 규칙집을 나중에 배치한다. 호출자는 두 규칙의 합성 판본을 등록한다. */
  rulePackVersions:string[];
  /** 현재와 가정 변경 후 모두 동일한 고유 취득 학점 원장을 사용한다. */
  earnedCreditUnits:number;
  /** 주전공 졸업 요건까지 부족한 학점이며 실제 취득 학점만 반영한다. */
  remainingCreditUnits:number;
  requirements:MajorWhatIfRequirementProgress[];
  /** 코어가 판정하지 못해 MISSING으로 표시한 요건은 담당자 검토가 필요하다. */
  reviewRequirementIds:string[];
}

export type MajorWhatIfResult =
  | {state:'BLOCKED_DEPENDENCY'; asOf:string; scenario:WhatIfScenario; blockers:MajorWhatIfBlocker[]; coreVersion:string}
  | {
    state:'READY'; asOf:string; scenario:WhatIfScenario; coreVersion:string;
    current:WhatIfProjection; hypothetical:WhatIfProjection;
    delta:(MajorWhatIfDeltaRow & {evidenceRefs:string[]})[];
  };

const MAX_REQUIREMENTS = 200;
const MAX_DELTA_EVIDENCE = 20;

const pathOf = (enrollment:ProgramEnrollment):DegreePath =>
  !enrollment.secondary ? 'ADVANCED_SINGLE' : enrollment.secondary.role === 'DOUBLE_MAJOR' ? 'DOUBLE_MAJOR' : 'ADVANCED_PLUS_MINOR';

function checkEnrollment(enrollment:ProgramEnrollment, label:string):void {
  assertId(enrollment.primaryProgramId, `${label} primaryProgramId`);
  if (enrollment.secondary === undefined) return;
  if (enrollment.secondary.role !== 'DOUBLE_MAJOR' && enrollment.secondary.role !== 'MINOR') {
    throw new TypeError(`${label} second program role must be DOUBLE_MAJOR or MINOR`);
  }
  assertId(enrollment.secondary.programId, `${label} second programId`);
  if (enrollment.secondary.programId === enrollment.primaryProgramId) {
    throw new TypeError(`${label} second program cannot be the primary major`);
  }
}

/** 가정이 적용된 전공 구성이며 현재 구성과 양립할 수 없으면 undefined다. */
function applyScenario(current:ProgramEnrollment, scenario:WhatIfScenario):ProgramEnrollment|undefined {
  const second = current.secondary;
  const target = 'targetMajorId' in scenario ? scenario.targetMajorId : undefined;
  const fresh = (id:string) => id !== current.primaryProgramId && id !== second?.programId;
  switch (scenario.action) {
    case 'CHANGE_PRIMARY_MAJOR':
      return fresh(target!) ? {primaryProgramId:target!, ...(second ? {secondary:second} : {})} : undefined;
    case 'ADD_DOUBLE_MAJOR':
    case 'ADD_MINOR': {
      const role:SecondaryRole = scenario.action === 'ADD_DOUBLE_MAJOR' ? 'DOUBLE_MAJOR' : 'MINOR';
      return !second && fresh(target!) ? {primaryProgramId:current.primaryProgramId, secondary:{role, programId:target!}} : undefined;
    }
    case 'CHANGE_DOUBLE_MAJOR':
    case 'CHANGE_MINOR': {
      const role:SecondaryRole = scenario.action === 'CHANGE_DOUBLE_MAJOR' ? 'DOUBLE_MAJOR' : 'MINOR';
      return second?.role === role && fresh(target!)
        ? {primaryProgramId:current.primaryProgramId, secondary:{role, programId:target!}} : undefined;
    }
    case 'REMOVE_DOUBLE_MAJOR':
      return second?.role === 'DOUBLE_MAJOR' ? {primaryProgramId:current.primaryProgramId} : undefined;
    case 'REMOVE_MINOR':
      return second?.role === 'MINOR' ? {primaryProgramId:current.primaryProgramId} : undefined;
  }
}

interface Resolved {
  primary?:Extract<ProgramOffer, {role:'PRIMARY_MAJOR'}>;
  secondary?:Extract<ProgramOffer, {role:SecondaryRole}>;
  /** 선택한 전공에 필요한 RulePack이 카탈로그에 없다. */
  unavailable:boolean;
}

function resolve(enrollment:ProgramEnrollment, programs:readonly ProgramOffer[]):Resolved {
  const path = pathOf(enrollment);
  const primaries = programs.filter((offer):offer is Extract<ProgramOffer, {role:'PRIMARY_MAJOR'}> =>
    offer.role === 'PRIMARY_MAJOR' && offer.programId === enrollment.primaryProgramId && canonicalDegreePath(offer.degreePath,offer.programId) === path);
  const second = enrollment.secondary;
  // 다른 주전공에 승인된 규칙집은 현재 주전공의 규칙을 대신할 수 없다.
  const secondaries = second ? programs.filter((offer):offer is Extract<ProgramOffer, {role:SecondaryRole}> =>
    offer.role === second.role && offer.programId === second.programId
    && (offer.primaryProgramId === undefined || offer.primaryProgramId === enrollment.primaryProgramId)) : [];
  const resolved:Resolved = {unavailable:primaries.length === 0 || (second !== undefined && secondaries.length === 0)};
  if (primaries[0]) resolved.primary = primaries[0];
  if (secondaries[0]) resolved.secondary = secondaries[0];
  return resolved;
}

const approved = (resolved:Resolved, enrollment:ProgramEnrollment) =>
  resolved.primary?.pack.rulePackState === 'APPROVED'
  && (!enrollment.secondary || resolved.secondary?.pack.rulePackState === 'APPROVED');

function checkCatalog(programs:readonly ProgramOffer[]):void {
  if (!Array.isArray(programs)) throw new TypeError('programs must be an array');
  const keys = new Set<string>();
  const versions = new Set<string>();
  const scoping = new Map<string, boolean>();
  for (const offer of programs) {
    if (offer.role !== 'PRIMARY_MAJOR' && offer.role !== 'DOUBLE_MAJOR' && offer.role !== 'MINOR') {
      throw new TypeError('program role must be PRIMARY_MAJOR, DOUBLE_MAJOR or MINOR');
    }
    assertId(offer.programId, 'programId');
    let scope:string|null;
    if (offer.role === 'PRIMARY_MAJOR') {
      if ((offer as {primaryProgramId?:unknown}).primaryProgramId !== undefined) {
        throw new TypeError(`primary pack ${offer.programId} cannot name a primaryProgramId`);
      }
      // 동일한 선택지를 뜻하는 정식·이전 표기를 서로 다른 후보로 중복 계산하지 않는다.
      scope = canonicalDegreePath(offer.degreePath, offer.programId);
    } else {
      scope = offer.primaryProgramId ?? null;
      if (scope !== null) {
        assertId(scope, `${offer.programId} primaryProgramId`);
        if (scope === offer.programId) throw new TypeError(`${offer.role} ${offer.programId} cannot be scoped to itself`);
      }
      const program = JSON.stringify([offer.role, offer.programId]);
      const scoped = scoping.get(program);
      if (scoped !== undefined && scoped !== (scope !== null)) {
        throw new TypeError(`${offer.role} ${offer.programId} mixes a program-wide pack with packs for one primary major`);
      }
      scoping.set(program, scope !== null);
    }
    const key = JSON.stringify([offer.role, offer.programId, scope]);
    if (keys.has(key)) throw new TypeError(`the catalog lists ${offer.role} ${offer.programId} more than once`);
    keys.add(key);
    assertId(offer.pack.rulePackVersion, `${offer.programId} rulePackVersion`);
    if (versions.has(offer.pack.rulePackVersion)) throw new TypeError(`rule pack ${offer.pack.rulePackVersion} is listed twice`);
    versions.add(offer.pack.rulePackVersion);
  }
}

function project(role:WhatIfProjection['role'], input:MajorWhatIfRequest, enrollment:ProgramEnrollment, resolved:Resolved):WhatIfProjection {
  const primary = resolved.primary!.pack;
  const secondary = resolved.secondary?.pack;
  const totals = primary.requirements.filter(requirement => requirement.kind === 'CREDIT_TOTAL');
  if (totals.length !== 1) throw new TypeError(`${primary.rulePackVersion} needs exactly one CREDIT_TOTAL row`);
  const audit = buildDoubleMajorAudit({
    asOf:input.asOf, attempts:input.attempts, primary,
    doubleMajor:secondary ? {status:'SELECTED', pack:secondary} : {status:'NONE'},
  });
  const second = audit.doubleMajor.status === 'CHECKED' ? audit.doubleMajor.audit : undefined;
  const rows = [...audit.primary.requirements, ...(second?.requirements ?? [])];
  const definitions = new Map<string, LedgerRequirement>();
  const owner = new Map<string, MajorRulePack>();
  for (const pack of [primary, ...(secondary ? [secondary] : [])]) {
    for (const requirement of pack.requirements) {
      if (definitions.has(requirement.id)) {
        throw new TypeError(`requirement ${requirement.id} appears in both the primary and the second program pack`);
      }
      definitions.set(requirement.id, requirement);
      owner.set(requirement.id, pack);
    }
  }
  if (rows.length > MAX_REQUIREMENTS) throw new RangeError('too many requirements for one projection');
  const impacts = new Map<string, OverlapRowImpact>();
  for (const impact of [...audit.overlap.rowImpacts.primary, ...audit.overlap.rowImpacts.doubleMajor]) impacts.set(impact.requirementId, impact);

  // 원장이 인정 보류, 미종료 학기, 미승인·분기 재수강, 중복 충돌 등으로 판정을 보류한 시도다.
  // 이 기록이 충족시킬 수 있는 요건은 확정된 부족 학점이 아니므로 MISSING 표시는 유지하되 검토 대상으로 표시한다.
  // 공식 제외, 중복, 승인 재수강으로 확정 제외된 기록은 경고 대상으로 삼지 않는다.
  const byToken = new Map(input.attempts.map(attempt => [attempt.attemptToken, attempt]));
  const undecided = audit.primary.excludedAttempts
    .filter(row => row.reason === 'PENDING_RECOGNITION' || row.reason === 'NEEDS_REVIEW')
    .map(row => byToken.get(row.attemptToken)!)
    .filter(attempt => attempt.creditUnits > 0);
  const touchedByUndecided = (definition:LedgerRequirement):boolean => {
    const pack = owner.get(definition.id)!;
    return undecided.some(attempt => {
      const course = attempt.canonicalCourseId;
      switch (definition.kind) {
        case 'CREDIT_TOTAL': return true;
        case 'CATEGORY_MINIMUM': return (pack.courseAreas[course] ?? []).includes(definition.areaId);
        case 'REQUIRED_COURSE': return definition.canonicalCourseId === course;
        case 'K_OF_N': return definition.courseIds.includes(course);
        case 'AREA_SPREAD': return (pack.courseAreas[course] ?? []).some(area => definition.areaIds.includes(area));
        case 'GROUP_CHOICE': return definition.groups.some(group => group.includes(course));
        case 'NON_CREDIT': return false;
      }
    });
  };

  const requirements:MajorWhatIfRequirementProgress[] = [];
  const reviewRequirementIds:string[] = [];
  for (const row of rows) {
    const definition = definitions.get(row.requirementId)!;
    if (row.state === 'SATISFIED') {
      requirements.push({requirementId:row.requirementId, state:'SATISFIED'});
      continue;
    }
    if (row.state === 'NEEDS_REVIEW' || row.state === 'NOT_CHECKED' || touchedByUndecided(definition)) {
      reviewRequirementIds.push(row.requirementId);
    }
    const progress:MajorWhatIfRequirementProgress = {requirementId:row.requirementId, state:'MISSING'};
    if (definition.kind === 'CREDIT_TOTAL' || definition.kind === 'CATEGORY_MINIMUM') {
      // 공유 과목 때문에 보류된 요건은 중복 인정 불허를 가정한 보수적 수치를 보여준다.
      const impact = impacts.get(row.requirementId);
      const missing = impact && !impact.decided && impact.remainingCreditUnitsWithoutShared !== undefined
        ? impact.remainingCreditUnitsWithoutShared : row.remainingCreditUnits;
      if (missing === undefined) throw new Error(`${row.requirementId} has no remaining credit figure`);
      progress.missingCreditUnits = missing;
    }
    requirements.push(progress);
  }
  const totalRow = audit.primary.requirements.find(row => row.requirementId === totals[0]!.id)!;
  return {
    role, asOf:input.asOf, enrollment, degreePath:pathOf(enrollment),
    rulePackVersions:[primary.rulePackVersion, ...(secondary ? [secondary.rulePackVersion] : [])],
    earnedCreditUnits:audit.uniqueCredits.earnedCreditUnits,
    remainingCreditUnits:totalRow.remainingCreditUnits!,
    requirements, reviewRequirementIds,
  };
}

function evidenceOf(definitions:ReadonlyMap<string, LedgerRequirement>, id:string):string[] {
  return [...(definitions.get(id)?.evidenceRefs ?? [])];
}

export function buildMajorWhatIf(input:MajorWhatIfRequest):MajorWhatIfResult {
  const parsed = OwnerMajorWhatIfScenarioSchema.safeParse(input.scenario);
  if (!parsed.success) throw new TypeError('scenario is not a valid #107 What-if scenario');
  const scenario = parsed.data;
  checkEnrollment(input.current, 'current');
  checkCatalog(input.programs);
  const coreVersion = MAJOR_WHAT_IF_CORE_VERSION;

  const blockers = new Set<MajorWhatIfBlocker>();
  const now = resolve(input.current, input.programs);
  if (!approved(now, input.current)) blockers.add('CURRENT_RULEPACK_NOT_APPROVED');
  const next = applyScenario(input.current, scenario);
  let then:Resolved|undefined;
  if (!next) blockers.add('TARGET_PROGRAM_UNAVAILABLE');
  else {
    then = resolve(next, input.programs);
    if (then.unavailable) blockers.add('TARGET_PROGRAM_UNAVAILABLE');
    else {
      // 양쪽에서 같은 규칙집을 쓰는 경우는 CURRENT_RULEPACK_NOT_APPROVED로 이미 보고했다.
      const used = new Set([now.primary, now.secondary].flatMap(offer => (offer ? [offer.pack.rulePackVersion] : [])));
      const fresh = [then.primary!, ...(then.secondary ? [then.secondary] : [])].filter(offer => !used.has(offer.pack.rulePackVersion));
      if (fresh.some(offer => offer.pack.rulePackState !== 'APPROVED')) blockers.add('RULEPACK_NOT_APPROVED');
    }
  }
  if (blockers.size > 0) {
    const order:MajorWhatIfBlocker[] = ['CURRENT_RULEPACK_NOT_APPROVED', 'RULEPACK_NOT_APPROVED', 'TARGET_PROGRAM_UNAVAILABLE'];
    return {state:'BLOCKED_DEPENDENCY', asOf:input.asOf, scenario, blockers:order.filter(code => blockers.has(code)), coreVersion};
  }

  const current = project('CURRENT', input, input.current, now);
  const hypothetical = project('HYPOTHETICAL', input, next!, then!);
  if (current.earnedCreditUnits !== hypothetical.earnedCreditUnits) {
    throw new Error('both sides must read the same unique earned ledger');
  }

  const definitionsBefore = new Map<string, LedgerRequirement>();
  const definitionsAfter = new Map<string, LedgerRequirement>();
  for (const offer of [now.primary!, now.secondary].filter(Boolean)) {
    for (const requirement of offer!.pack.requirements) definitionsBefore.set(requirement.id, requirement);
  }
  for (const offer of [then!.primary!, then!.secondary].filter(Boolean)) {
    for (const requirement of offer!.pack.requirements) definitionsAfter.set(requirement.id, requirement);
  }
  const before = new Map(current.requirements.map(row => [row.requirementId, row]));
  const after = new Map(hypothetical.requirements.map(row => [row.requirementId, row]));
  const ids = [...before.keys(), ...[...after.keys()].filter(id => !before.has(id))];
  if (ids.length > MAX_REQUIREMENTS) throw new RangeError('too many requirements for one What-if diff');
  const delta = ids.map(requirementId => {
    const previous = before.get(requirementId);
    const next = after.get(requirementId);
    let change:MajorWhatIfDeltaRow['change'];
    if (!previous) change = next!.state === 'SATISFIED' ? 'ALREADY_SATISFIED' : 'NEW_REQUIREMENT';
    else if (!next) change = 'REMOVED_REQUIREMENT';
    else change = previous.state === next.state && (previous.missingCreditUnits ?? 0) === (next.missingCreditUnits ?? 0)
      ? 'UNCHANGED' : 'PROGRESS_CHANGED';
    const evidenceRefs = [...new Set([...evidenceOf(definitionsBefore, requirementId), ...evidenceOf(definitionsAfter, requirementId)])];
    if (evidenceRefs.length === 0) throw new TypeError(`${requirementId} has no evidence; an approved pack must cite each requirement`);
    if (evidenceRefs.length > MAX_DELTA_EVIDENCE) throw new RangeError(`${requirementId} cites more than ${MAX_DELTA_EVIDENCE} evidence refs`);
    return {requirementId, change, evidenceRefs};
  });
  if (!isConsistentMajorWhatIfDelta({current:current.requirements, hypothetical:hypothetical.requirements, delta})) {
    throw new Error('internal: the What-if diff does not match its projections');
  }
  return {state:'READY', asOf:input.asOf, scenario, coreVersion, current, hypothetical, delta};
}
