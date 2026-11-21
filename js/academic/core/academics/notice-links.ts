import {AcademicAuditVNextSchema, type AcademicAuditVNext} from '../../contracts/index.js';
import {byCodeUnit} from './ledger.js';

/**
 * 학사 요건 진단 결과에서 공지 연결에 필요한 미충족 요건 ID를 전달한다(A07.1).
 * 학사 상태를 알 수 없으면 null을 반환하며 이는 '열린 요건 없음'이 아니다. 공지 측은 해당 공지를 일반 공지로 내리지 않고 UNKNOWN으로 유지한다.
 * UNSATISFIED·NEEDS_REVIEW·NOT_CHECKED는 열린 요건이고, SATISFIED 또는 공식 NOT_APPLICABLE만 종료된 요건이다.
 */
const OPEN:ReadonlySet<AcademicAuditVNext['requirements'][number]['state']> = new Set([
  'UNSATISFIED', 'NEEDS_REVIEW', 'NOT_CHECKED',
]);

export function openRequirementIdsFromAudit(audit:AcademicAuditVNext|null|undefined):string[]|null {
  if (audit === null || audit === undefined) return null;
  const parsed = AcademicAuditVNextSchema.safeParse(audit);
  if (!parsed.success) throw new TypeError('openRequirementIdsFromAudit needs a valid academic audit');
  if (parsed.data.state === 'INSUFFICIENT_DATA') return null;
  return parsed.data.requirements
    .filter(row => OPEN.has(row.state))
    .map(row => row.requirementId)
    .sort(byCodeUnit);
}
