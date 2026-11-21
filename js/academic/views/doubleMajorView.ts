import {z} from 'zod';
import {AcademicAuditVNextSchema, type AcademicAuditVNext} from '../contracts/index.js';
import {NOT_OFFICIAL_GRADUATION_TEXT, creditsText} from './graduationView.js';

/**
 * 졸업 화면의 현재 주전공·이중전공 모델(#144)이다. 가상 변경(#82)이 아닌 실제 선택 전공만 표시한다.
 * 학점·요건 결과는 buildDoubleMajorAudit 그대로 사용하며 화면이 직접 합산·판정하거나 공유 과목의 중복 인정을 확정하지 않는다.
 * OverlapSchema로 데이터를 엄격히 검증하고 잘못된 영향 정보는 렌더링 예외 대신 오류 화면으로 처리한다.
 */
type RowState = AcademicAuditVNext['requirements'][number]['state'];
type OverlapStatus = 'NONE' | 'NO_APPROVED_RULE' | 'COVERED_BY_APPROVED_RULE' | 'OVER_APPROVED_LIMIT';

export interface MajorRowView {
  readonly id: string;
  /** 색상만으로 상태를 나타내지 않고 텍스트와 아이콘을 함께 제공한다. */
  readonly badge: {readonly text: string; readonly icon: string};
  readonly creditsText: string | null;
  /** 공유 과목의 중복 인정 여부가 미확정이라 해당 요건 결과도 달라질 수 있을 때 설정한다. */
  readonly heldText: string | null;
  readonly ariaLabel: string;
}

export interface MajorColumnView {
  readonly role: '주전공' | '이중전공';
  readonly stateText: string;
  readonly rulePackText: string;
  readonly rows: readonly MajorRowView[];
}

export interface DoubleMajorView {
  readonly selectionText: string;
  readonly notOfficialText: string;
  /** 같은 성적표의 과목은 어느 전공에서 사용하든 총합에서 한 번만 계산한다. */
  readonly uniqueCredits: readonly {readonly label: string; readonly credits: string}[];
  readonly primary: MajorColumnView;
  /** 이중전공 열이 없으면 null이며 사유는 doubleMajorNote에서 안내한다. */
  readonly doubleMajor: MajorColumnView | null;
  readonly doubleMajorNote: string | null;
  readonly overlapText: string | null;
}

export type DoubleMajorViewResult = {readonly ok: true; readonly view: DoubleMajorView} | {readonly ok: false};

const AUDIT_STATE = {READY: '규칙 적용 결과', NEEDS_REVIEW: '검토가 필요한 결과', INSUFFICIENT_DATA: '자료가 부족해 판단할 수 없음'} as const;
const ROW_BADGE: Record<RowState, MajorRowView['badge']> = {
  SATISFIED: {text: '충족', icon: '✓'},
  UNSATISFIED: {text: '미충족', icon: '○'},
  NEEDS_REVIEW: {text: '확인 필요', icon: '?'},
  NOT_APPLICABLE: {text: '해당 없음', icon: '–'},
  NOT_CHECKED: {text: '확인 안 함', icon: '…'},
};
// 학생이 먼저 조치해야 할 항목, 남은 항목, 완료 항목 순으로 정렬한다.
const ROW_RANK: Record<RowState, number> = {UNSATISFIED: 0, NEEDS_REVIEW: 1, NOT_CHECKED: 2, SATISFIED: 3, NOT_APPLICABLE: 4};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isUnits = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

// 코어의 OverlapRowImpact·DoubleMajorAudit['overlap'] 구조를 그대로 검증한다. 불필요한 키·null·잘못된 숫자는 거부한다.
const Id = z.string().trim().min(1).max(128);
const Units = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const ImpactSchema = z.strictObject({
  requirementId: Id, decided: z.boolean(), metWithShared: z.boolean(), metWithoutShared: z.boolean(),
  earnedCreditUnitsWithoutShared: z.number().int().safe().optional(), remainingCreditUnitsWithoutShared: Units.optional(),
  projectedCreditUnitsWithoutShared: z.number().int().safe().optional(), matchedCoursesCountWithoutShared: z.number().int().safe().optional(),
});
const OverlapSchema = z.strictObject({
  status: z.enum(['NONE', 'NO_APPROVED_RULE', 'COVERED_BY_APPROVED_RULE', 'OVER_APPROVED_LIMIT']),
  sharedCourses: z.array(z.strictObject({courseId: Id, ledger: z.enum(['EARNED', 'IN_PROGRESS', 'PLANNED']), creditUnits: Units,
    primaryAreaIds: z.array(Id), doubleMajorAreaIds: z.array(Id)})),
  sharedCreditUnits: Units, evidenceRefs: z.array(Id),
  heldRequirementIds: z.strictObject({primary: z.array(Id), doubleMajor: z.array(Id)}),
  rowImpacts: z.strictObject({primary: z.array(ImpactSchema), doubleMajor: z.array(ImpactSchema)}),
});
type Impact = z.infer<typeof ImpactSchema>;

/** 영향받는 실제 요건을 각각 한 번만 나열한다. 미확정 요건은 영향 목록과 정확히 일치해야 하며 열린 상태로 보여준다. */
function impactsFit(audit: AcademicAuditVNext | null, impacts: readonly Impact[], held: readonly string[]): boolean {
  const rows = new Map((audit?.requirements ?? []).map(r => [r.requirementId, r.state]));
  const undecided = impacts.filter(i => !i.decided).map(i => i.requirementId);
  return new Set(impacts.map(i => i.requirementId)).size === impacts.length && impacts.every(i => rows.has(i.requirementId))
    && new Set(held).size === held.length && held.length === undecided.length && undecided.every(id => held.includes(id))
    && held.every(id => rows.get(id) === 'NEEDS_REVIEW' || rows.get(id) === 'NOT_CHECKED');
}

function column(role: MajorColumnView['role'], audit: AcademicAuditVNext, held: ReadonlySet<string>, impacts: readonly Impact[]): MajorColumnView {
  const rows = [...audit.requirements].sort((a, b) => ROW_RANK[a.state] - ROW_RANK[b.state]).map(r => {
    const badge = ROW_BADGE[r.state];
    const credits = r.requiredCreditUnits !== undefined
      ? `취득 ${creditsText(r.earnedCreditUnits ?? 0)} / 필요 ${creditsText(r.requiredCreditUnits)}${r.remainingCreditUnits ? ` · ${creditsText(r.remainingCreditUnits)} 남음` : ''}`
      : r.requiredCoursesCount !== undefined ? `${r.matchedCoursesCount ?? 0} / ${r.requiredCoursesCount}과목` : null;
    const impact = impacts.find(i => i.requirementId === r.requirementId);
    const heldText = held.has(r.requirementId)
      ? `두 전공에 함께 쓰인 과목의 중복 인정 기준이 확인되지 않아 보류했습니다.${impact?.remainingCreditUnitsWithoutShared ? ` 중복이 인정되지 않으면 ${creditsText(impact.remainingCreditUnitsWithoutShared)}이 더 필요합니다.` : ''}`
      : null;
    return {
      id: r.requirementId, badge, creditsText: credits, heldText,
      ariaLabel: `${role} ${r.requirementId}: ${badge.text}${credits ? `, ${credits}` : ''}${heldText ? `. ${heldText}` : ''}`,
    };
  });
  return {role, stateText: AUDIT_STATE[audit.state], rulePackText: `적용 규칙 ${audit.rulePackVersion}`, rows};
}

function overlapText(status: OverlapStatus, count: number, units: number): string | null {
  switch (status) {
    case 'NONE': return '두 전공에 함께 쓰인 과목이 없습니다.';
    case 'NO_APPROVED_RULE': return `두 전공에 함께 쓰인 과목 ${count}개(${creditsText(units)})가 있습니다. 공식 중복 인정 기준이 확인되지 않아, 결과가 달라지는 요건은 "확인 필요"로 보류했습니다.`;
    case 'COVERED_BY_APPROVED_RULE': return `두 전공에 함께 쓰인 과목 ${count}개(${creditsText(units)})는 승인된 중복 인정 기준 안에 있습니다.`;
    case 'OVER_APPROVED_LIMIT': return `두 전공에 함께 쓰인 과목 ${count}개(${creditsText(units)})가 승인된 중복 인정 한도를 넘어, 결과가 달라지는 요건은 "확인 필요"로 보류했습니다.`;
  }
}

/** 데이터 형식이 잘못되거나 asOf가 다른 입력이면 ok:false로 처리하고 추정값 대신 오류를 표시한다. */
export function buildDoubleMajorView(raw: unknown, expected: {asOf: string}): DoubleMajorViewResult {
  if (!isObj(raw) || typeof raw.asOf !== 'string' || Date.parse(raw.asOf) !== Date.parse(expected.asOf)) return {ok: false};
  const primary = AcademicAuditVNextSchema.safeParse(raw.primary);
  if (!primary.success || Date.parse(primary.data.asOf) !== Date.parse(expected.asOf)) return {ok: false};
  const u = raw.uniqueCredits, dm = raw.doubleMajor, parsedOverlap = OverlapSchema.safeParse(raw.overlap);
  if (!isObj(u) || !isUnits(u.earnedCreditUnits) || !isUnits(u.inProgressCreditUnits) || !isUnits(u.plannedCreditUnits)) return {ok: false};
  if (!isObj(dm) || !parsedOverlap.success) return {ok: false};
  const ov = parsedOverlap.data, status: OverlapStatus = ov.status, heldIds = ov.heldRequirementIds, impacts = ov.rowImpacts;
  // 중복 인정이 확정된 상태에는 보류 요건이 없어야 하며 미확정 상태만 영향을 기록한다.
  if ((status === 'NONE' || status === 'COVERED_BY_APPROVED_RULE')
    && (impacts.primary.length || impacts.doubleMajor.length || heldIds.primary.length || heldIds.doubleMajor.length)) return {ok: false};
  if (!impactsFit(primary.data, impacts.primary, heldIds.primary)) return {ok: false};
  // 양쪽 전공에 같은 성적표를 쓰므로 고유 총 학점도 같아야 한다. 다르면 서로 다른 사용자 데이터가 섞였을 가능성이 있다.
  if (u.earnedCreditUnits !== primary.data.earnedCreditUnits) return {ok: false};

  let second: MajorColumnView | null = null;
  let note: string | null = null;
  switch (dm.status) {
    case 'NOT_APPLICABLE': note = '이중전공을 하지 않는 것으로 입력되어 주전공만 보여 줍니다.'; break;
    case 'INPUT_REQUIRED': note = '이중전공 여부가 입력되지 않았습니다. 계정 설정에서 입력하면 이중전공 요건도 함께 보여 줍니다.'; break;
    case 'RULES_MISSING': note = '선택한 이중전공의 요건 규칙이 아직 준비되지 않아 표시하지 않았습니다. 학과에서 직접 확인해 주세요.'; break;
    case 'CHECKED': {
      const audit = AcademicAuditVNextSchema.safeParse(dm.audit);
      if (!audit.success || Date.parse(audit.data.asOf) !== Date.parse(expected.asOf)
        || audit.data.earnedCreditUnits !== primary.data.earnedCreditUnits
        || !impactsFit(audit.data, impacts.doubleMajor, heldIds.doubleMajor)) return {ok: false};
      second = column('이중전공', audit.data, new Set(heldIds.doubleMajor), impacts.doubleMajor);
      break;
    }
    default: return {ok: false};
  }
  // 검증된 이중전공이 없으면 두 번째 열에 대한 영향 정보를 표시하지 않는다.
  if (dm.status !== 'CHECKED' && (impacts.doubleMajor.length || heldIds.doubleMajor.length)) return {ok: false};
  const selectionText = dm.status === 'CHECKED' || dm.status === 'RULES_MISSING' ? '이중전공: 선택함'
    : dm.status === 'NOT_APPLICABLE' ? '이중전공: 해당 없음' : '이중전공: 입력 필요';
  return {ok: true, view: {
    selectionText, notOfficialText: NOT_OFFICIAL_GRADUATION_TEXT,
    uniqueCredits: [
      {label: '취득', credits: creditsText(u.earnedCreditUnits)},
      {label: '수강 중', credits: creditsText(u.inProgressCreditUnits)},
      {label: '계획', credits: creditsText(u.plannedCreditUnits)},
    ],
    primary: column('주전공', primary.data, new Set(heldIds.primary), impacts.primary),
    doubleMajor: second, doubleMajorNote: note,
    overlapText: dm.status === 'CHECKED' ? overlapText(status, ov.sharedCourses.length, ov.sharedCreditUnits) : null,
  }};
}
