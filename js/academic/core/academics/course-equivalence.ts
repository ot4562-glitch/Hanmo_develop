import {assertId, termKey, type LedgerAttempt} from './ledger.js';

/**
 * 동일 교과목 규칙(#133 F②)을 원장 계산 전에 적용한다.
 * 공식 규칙의 이전 학수번호를 현재 학수번호로 바꿔 요건 충족·승인 재수강·중복 이수 계산을 일치시킨다.
 * 명시적으로 승인된 근거가 없는 유사 학수번호는 합치지 않는다. 승인되지 않은 규칙이 영향을 줄 수 있는 수강 시도는 NEEDS_REVIEW로 보류한다.
 * 대체 이수(둘 중 하나로 요건 충족)는 동일 교과목이 아니므로 K_OF_N 요건에 표현한다.
 * 입력은 수정하지 않으며 시계·네트워크·저장소에 의존하지 않는다.
 */

export interface SameCourseRule {
  id:string;
  /** 이전 학수번호 목록. 각 값은 toCourseId와 달라야 한다. */
  fromCourseIds:readonly string[];
  /** 이전 학수번호의 수강 기록을 귀속시킬 현재 학수번호. */
  toCourseId:string;
  state:'APPROVED'|'DRAFT'|'NEEDS_REVIEW';
  /** 승인 규칙에는 동일 교과목 공식 목록 등 근거 자료가 필요하다. */
  evidenceRefs:readonly string[];
}

export interface AppliedSameCourse {
  attemptToken:string;
  fromCourseId:string;
  toCourseId:string;
  ruleId:string;
}

export interface HeldSameCourse {
  attemptToken:string;
  courseId:string;
  ruleIds:string[];
  /** RULE_NOT_APPROVED는 미승인 규칙만 있는 상태, AMBIGUOUS는 서로 다른 목표 과목을 가리키는 충돌 상태다. */
  reason:'RULE_NOT_APPROVED'|'AMBIGUOUS';
}

export interface SameCourseResult {
  /** 보류 항목이 없으면 APPLIED, 하나라도 있으면 NEEDS_REVIEW다. 보류된 기록의 학수번호는 유지한다. */
  state:'APPLIED'|'NEEDS_REVIEW';
  attempts:LedgerAttempt[];
  applied:AppliedSameCourse[];
  held:HeldSameCourse[];
}

function validate(rules:readonly SameCourseRule[]):void {
  if (!Array.isArray(rules)) throw new TypeError('rules must be an array');
  const ids = new Set<string>();
  for (const rule of rules) {
    assertId(rule.id, 'same-course rule id');
    if (ids.has(rule.id)) throw new TypeError(`duplicate same-course rule ${rule.id}`);
    ids.add(rule.id);
    if (!['APPROVED', 'DRAFT', 'NEEDS_REVIEW'].includes(rule.state)) throw new TypeError(`${rule.id} has unknown state`);
    assertId(rule.toCourseId, `${rule.id} toCourseId`);
    if (!Array.isArray(rule.fromCourseIds) || rule.fromCourseIds.length === 0) throw new TypeError(`${rule.id} needs fromCourseIds`);
    if (new Set(rule.fromCourseIds).size !== rule.fromCourseIds.length) throw new TypeError(`${rule.id} repeats a fromCourseId`);
    for (const from of rule.fromCourseIds) {
      assertId(from, `${rule.id} fromCourseId`);
      if (from === rule.toCourseId) throw new TypeError(`${rule.id} maps ${from} to itself`);
    }
    if (!Array.isArray(rule.evidenceRefs)) throw new TypeError(`${rule.id} evidenceRefs must be an array`);
    for (const ref of rule.evidenceRefs) assertId(ref, `${rule.id} evidence`);
    if (rule.state === 'APPROVED' && rule.evidenceRefs.length === 0) throw new TypeError(`${rule.id} is APPROVED without evidence`);
  }
  // A→B→C 사슬이나 순환은 적용 순서가 모호하므로 거부한다. 호출자가 근거를 붙인 A→C 합성 규칙을 제공해야 한다.
  const approvedFrom = new Set(rules.filter(r => r.state === 'APPROVED').flatMap(r => r.fromCourseIds));
  for (const rule of rules) {
    if (rule.state === 'APPROVED' && approvedFrom.has(rule.toCourseId)) {
      throw new TypeError(`${rule.id} maps to ${rule.toCourseId}, which another approved rule maps away; write one composed rule`);
    }
  }
}

export function applySameCourseRules(attempts:readonly LedgerAttempt[], rules:readonly SameCourseRule[]):SameCourseResult {
  if (!Array.isArray(attempts)) throw new TypeError('attempts must be an array');
  validate(rules);
  const tokens = new Set<string>();
  for (const attempt of attempts) {
    assertId(attempt.attemptToken, 'attemptToken');
    assertId(attempt.canonicalCourseId, `${attempt.attemptToken} canonicalCourseId`);
    if (tokens.has(attempt.attemptToken)) throw new TypeError(`duplicate attemptToken ${attempt.attemptToken}`);
    tokens.add(attempt.attemptToken);
    if (attempt.term !== undefined) termKey(attempt.term);
  }

  // 학수번호별로 이를 이전 과목으로 참조하는 규칙을 수집한다.
  const byFrom = new Map<string, SameCourseRule[]>();
  for (const rule of rules) {
    for (const from of rule.fromCourseIds) byFrom.set(from, [...(byFrom.get(from) ?? []), rule]);
  }

  const applied:AppliedSameCourse[] = [];
  const held:HeldSameCourse[] = [];
  const out = attempts.map(attempt => {
    const copy:LedgerAttempt = {...attempt, areaIds:[...attempt.areaIds]};
    const named = byFrom.get(attempt.canonicalCourseId);
    if (!named) return copy;
    const approved = named.filter(r => r.state === 'APPROVED');
    // 승인 여부와 관계없이 같은 이전 과목에 서로 다른 목표를 지정하면 모호한 규칙으로 처리한다.
    const targets = new Set(named.map(r => r.toCourseId));
    const ruleIds = named.map(r => r.id).sort();
    if (targets.size > 1) {
      held.push({attemptToken:attempt.attemptToken, courseId:attempt.canonicalCourseId, ruleIds, reason:'AMBIGUOUS'});
      return copy;
    }
    if (approved.length === 0) {
      held.push({attemptToken:attempt.attemptToken, courseId:attempt.canonicalCourseId, ruleIds, reason:'RULE_NOT_APPROVED'});
      return copy;
    }
    const rule = [...approved].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0]!;
    applied.push({attemptToken:attempt.attemptToken, fromCourseId:attempt.canonicalCourseId, toCourseId:rule.toCourseId, ruleId:rule.id});
    return {...copy, canonicalCourseId:rule.toCourseId};
  });
  return {state:held.length ? 'NEEDS_REVIEW' : 'APPLIED', attempts:out, applied, held};
}
