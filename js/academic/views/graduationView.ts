import type {AcademicSummary, ForecastSummary} from '../contracts/index.js';

/**
 * 졸업 화면의 표시 모델이다. 학사 계산 코어의 결과를 그대로 보여주며 화면에서 학점을 합산하거나 요건 충족을 판정하지 않는다.
 * 과거 개설 패턴을 확정 개설 정보로 바꾸지 않는다. 1 학점 단위는 0.5학점이다.
 */
export interface CreditLine { readonly label: string; readonly credits: string }

export interface GraduationView {
  readonly stateText: string;
  /** 이 화면은 비공식 학업 보조 기능이므로 졸업 확정이 아니라는 안내를 항상 표시한다. */
  readonly notOfficialText: string;
  readonly credits: readonly CreditLine[];
  readonly deficits: readonly {readonly id: string; readonly text: string}[];
  readonly caveats: readonly string[];
  readonly rulePackText: string;
}

export interface OutlookItemView {
  readonly courseId: string;
  readonly targetTerm: string;
  readonly signalText: string;
  readonly basisText: string;
  readonly caveat: string;
}

const STATE_TEXT: Record<AcademicSummary['state'], string> = {
  READY: '규칙 적용 결과',
  NEEDS_REVIEW: '검토가 필요한 결과',
  INSUFFICIENT_DATA: '자료가 부족해 판단할 수 없음',
};

const DEFICIT_TEXT: Record<AcademicSummary['deficits'][number]['state'], string> = {
  MISSING: '부족',
  NEEDS_REVIEW: '검토 필요',
  UNKNOWN: '확인 불가',
};

const SIGNAL_TEXT: Record<ForecastSummary['items'][number]['signal'], string> = {
  CONFIRMED_OFFERED: '개설 확정(공식 공지)',
  CONFIRMED_NOT_OFFERED: '미개설 확정(공식 공지)',
  HISTORICAL_PATTERN: '과거 개설 패턴 — 확정 아님',
  INSUFFICIENT_DATA: '자료 부족',
  UNKNOWN: '알 수 없음',
};

const COVERAGE_TEXT: Record<ForecastSummary['items'][number]['coverage'], string> = {
  COMPLETE_TERM_CATALOG: '학기 개설목록 전체 확인',
  PARTIAL: '일부 학기 자료만 확인',
  UNKNOWN: '자료 범위 알 수 없음',
};

/** 학점 단위 12는 6학점, 13은 6.5학점으로 표시한다. */
export function creditsText(units: number): string {
  return `${units % 2 === 0 ? units / 2 : (units / 2).toFixed(1)}학점`;
}

/** 학점 수치가 표시·보류·비공개된 모든 상태에서 졸업 화면에 나타낸다. */
export const NOT_OFFICIAL_GRADUATION_TEXT = '공식 졸업 판정이 아닙니다. 확정은 학과·학사지원팀에서 확인해 주세요.';

export function buildGraduationView(s: AcademicSummary): GraduationView {
  return {
    stateText: STATE_TEXT[s.state],
    notOfficialText: NOT_OFFICIAL_GRADUATION_TEXT,
    // 취득·진행 중·계획 학점은 구분해서 표시하며 하나의 숫자로 합치지 않는다.
    credits: [
      {label: '취득', credits: creditsText(s.earnedCreditUnits)},
      {label: '수강 중', credits: creditsText(s.inProgressCreditUnits)},
      {label: '계획', credits: creditsText(s.plannedCreditUnits)},
    ],
    deficits: s.deficits.map(d => ({
      id: d.requirementId,
      text: `${d.requirementId} · ${DEFICIT_TEXT[d.state]}${d.missingCreditUnits !== undefined ? ` · ${creditsText(d.missingCreditUnits)} 부족` : ''}`,
    })),
    caveats: s.caveats,
    rulePackText: `적용 규칙 ${s.rulePackVersion}`,
  };
}

export function buildOutlookView(f: ForecastSummary): readonly OutlookItemView[] {
  return f.items.map(i => ({
    courseId: i.courseId,
    targetTerm: i.targetTerm,
    signalText: SIGNAL_TEXT[i.signal],
    basisText: i.sameSeasonObservedTerms === 0 ? `${COVERAGE_TEXT[i.coverage]} · 확인된 비교 학기가 없어 과거 빈도를 계산하지 않습니다`
      : `${COVERAGE_TEXT[i.coverage]} · 같은 학기 ${i.sameSeasonObservedTerms}번 중 ${i.sameSeasonOfferedTerms}번 개설`,
    caveat: i.caveat,
  }));
}
