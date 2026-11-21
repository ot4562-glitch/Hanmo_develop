import {OwnerStudyPlanCheckResponseSchema, type OwnerStudyPlanCheckResponse} from '../contracts/index.js';
import {creditsText} from './graduationView.js';

/**
 * 졸업 요건 현황(#74) 옆에 표시할 수강계획 검사 모델(#81)이다.
 * 값은 서버 소유자 검사 계약(self/study-plan-check)에서 받은 그대로 사용한다.
 * 화면이 학점을 더하거나 상한을 만들어 내거나 검토 보류를 확정 경고로 바꾸지 않는다. 실제 수강신청 또는 졸업 판정이 아니다.
 */
type Issue = OwnerStudyPlanCheckResponse['planIssues'][number];
type Caveat = OwnerStudyPlanCheckResponse['caveats'][number];

export interface PlanIssueView {
  readonly key: string;
  /** 상태는 색상만으로 구별하지 않고 텍스트와 아이콘을 함께 제공한다. */
  readonly badge: {readonly text: string; readonly icon: string};
  readonly text: string;
  readonly courses: string;
}

export interface PlanCheckView {
  readonly term: string;
  readonly stateText: string;
  readonly loadText: string;
  /** 서버가 승인된 상한을 보내지 않았다면 null이다. 검증되지 않은 상한은 계약상 허용하지 않는다. */
  readonly capText: string | null;
  readonly issues: readonly PlanIssueView[];
  readonly unchecked: readonly string[];
  readonly caveats: readonly string[];
  readonly versionText: string;
  readonly redactedText: string | null;
}

export type PlanCheckViewResult = {readonly ok: true; readonly view: PlanCheckView} | {readonly ok: false};

const STATE = {READY: '승인된 규칙으로 검사함', NEEDS_REVIEW: '검토가 필요한 결과', INSUFFICIENT_DATA: '자료가 부족해 판단할 수 없음'} as const;
const ISSUE: Record<Issue['code'], {text: string; confirmed: boolean}> = {
  CREDIT_CAP_EXCEEDED: {text: '학기 최대 학점을 넘습니다', confirmed: true},
  PREREQUISITE_MISSING: {text: '선수과목을 아직 이수하지 않았습니다', confirmed: true},
  TIMETABLE_CONFLICT: {text: '확인된 분반이 모두 시간이 겹칩니다', confirmed: true},
  REQUIRED_COURSE_UNOFFERED: {text: '필수 과목이 이 학기에 개설되지 않습니다', confirmed: true},
  SEARCH_LIMIT_REVIEW: {text: '배정 계산 한도에 걸려 검토가 필요합니다', confirmed: false},
  NEEDS_REVIEW: {text: '확정할 수 없어 검토가 필요합니다', confirmed: false},
};
const REASON: Record<NonNullable<Issue['reasonCode']>, string> = {
  EXCEEDS_APPROVED_LIMIT: '승인된 한도 초과', UNMET_OFFICIAL_PREREQUISITE: '공식 선수 요건 미충족',
  ALL_VERIFIED_SECTIONS_OVERLAP: '확인된 분반 전부 겹침', COURSE_NOT_CONFIRMED: '개설 미확인',
  ALLOCATION_SEARCH_LIMIT: '배정 계산 한도', UNKNOWN: '사유 확인 불가',
};
const UNCHECKED = {TERM_UNDECIDED: '학기 미정', TERM_ENDED: '이미 끝난 학기', CREDITS_UNKNOWN: '학점 확인 불가'} as const;
const CAVEAT: Record<Caveat, string> = {
  NOT_OFFICIAL_REGISTRATION: '실제 수강신청이 아닙니다.',
  NOT_GRADUATION_DECISION: '공식 졸업 판정이 아닙니다.',
  RULEPACK_UNVERIFIED: '졸업 규칙이 아직 검수되지 않았습니다.',
  TERM_RULES_UNVERIFIED: '학기 학점 규칙이 검수되지 않아 최대 학점을 보여 주지 않습니다.',
  COHORT_UNKNOWN: '적용 학번을 확인하지 못했습니다.',
  SOURCE_RIGHTS_MISSING: '자료 이용 권한이 확인되지 않았습니다.',
  TRANSCRIPT_NOT_APPROVED: '이수 기록이 승인되지 않았습니다.',
  SECTIONS_UNCONFIRMED: '개설 분반이 확정되지 않았습니다.',
  PLAN_PARTIALLY_CHECKED: '계획의 일부만 검사했습니다.',
  COURSE_REFS_REDACTED: '공유 범위 밖 과목명은 가렸습니다.',
};

export function termText(term: string): string {
  const [y, s] = term.split('-');
  return `${y}년 ${s === '1' ? '1학기' : s === '2' ? '2학기' : s === 'S' ? '여름 계절학기' : '겨울 계절학기'}`;
}

/** 형식 오류나 대상 학기·기준 시각이 다른 결과는 ok:false로 처리하고 추정값 대신 오류를 표시한다. */
export function buildPlanCheckView(raw: unknown, expected: {term: string; asOf: string}): PlanCheckViewResult {
  const parsed = OwnerStudyPlanCheckResponseSchema.safeParse(raw);
  if (!parsed.success) return {ok: false};
  const r = parsed.data;
  if (r.term !== expected.term || Date.parse(r.asOf) !== Date.parse(expected.asOf)) return {ok: false};
  // 확정된 발견 사항을 먼저 표시하고 같은 그룹 안에서는 서버가 보낸 순서를 따른다.
  const issues = [...r.planIssues].sort((a, b) => Number(ISSUE[b.code].confirmed) - Number(ISSUE[a.code].confirmed)).map((i, n) => {
    const def = ISSUE[i.code];
    return {
      key: `${i.code}-${n}`,
      badge: def.confirmed ? {text: '확인됨', icon: '!'} : {text: '검토 필요', icon: '?'},
      text: `${def.text}${i.reasonCode ? ` (${REASON[i.reasonCode]})` : ''}`,
      courses: i.courseRefs.length ? i.courseRefs.join(', ') : '과목 정보 없음',
    };
  });
  const v = r.versions;
  return {ok: true, view: {
    term: termText(r.term),
    stateText: STATE[r.state],
    loadText: `이 학기 계획 ${creditsText(r.termLoadCreditUnits)}`,
    capText: r.creditCapUnits !== undefined && r.approval ? `승인된 최대 ${creditsText(r.creditCapUnits)}` : null,
    issues,
    unchecked: r.unchecked.map(u => `${u.courseId ?? '과목 정보 없음'} · ${UNCHECKED[u.reason]}`),
    caveats: r.caveats.map(c => CAVEAT[c]),
    versionText: [v.plan && `계획 ${v.plan}`, v.rulePack && `규칙 ${v.rulePack}`].filter(Boolean).join(' · ') || '버전 정보 없음',
    redactedText: r.disclosure.mode === 'REDACTED' ? '공유 범위 밖이라 과목명을 표시하지 않습니다.' : null,
  }};
}

