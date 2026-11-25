# 한모 · 현행 이슈와 PR 검토 상태

> **2026-11-25 실제 GitHub 열린 일반 이슈 기준:** **30건 open**. 실행/권리/제품 정본은 [현행 아키텍처](architecture.md), [에이전트 규칙](../agent.md)이고, 각 이슈의 최신 제목·본문·담당자가 세부 구현 계약입니다. 기존의 닫힌 HMD 설계·사용자 반려 제안은 **과거 기록**이며 신규 구현 지시가 아닙니다.

## 이번 확인·결정

- 기능 기준 [86c353f](https://github.com/ot4562-glitch/Hanmo_develop/commit/86c353f3c97049c1d5c806e670e6c4faafba103a) (2026-11-25): [Repository checks](https://github.com/ot4562-glitch/Hanmo_develop/actions/runs/45541758615) 통과(보호 해시·`npm run check`·Chromium E2E 포함), [QA Pages](https://github.com/ot4562-glitch/Hanmo_develop/actions/runs/45541758600) 배포 성공, [Feature browser QA](https://github.com/ot4562-glitch/Hanmo_develop/actions/runs/45541758548/job/138961709164) **33/34 통과·1 실패**. `tests/browser-feature.spec.mjs:135`에서 역할 접미사가 추가된 Contributor의 `strong` 전체 문자열을 예전 이름만으로 비교하여 실패합니다. 전략 엔진 실패가 아니며 전체 기능 QA 통과로 기록하지 않습니다.
- 전략 실험은 합성 몬테카를로 기반 개인 신청 전략 도구로 현재 기능 구성을 유지하고 안정화·재현성·설명 가능성·민감도 검증을 우선합니다. 실제 학생 선호·진입·경쟁 중복·신청량·서버 처리율은 미보정입니다. 성공률을 높이기 위한 임의 모수 조정이나 추가 분포·제도 비교·실학교 예측을 당장 개발하지 않습니다.
- 2016년 신진이·이상원 논문 원문 검토를 반영했습니다. 전공별 과목 선호는 연구 후보이고 논문 소스코드·모수 보정 근거는 미확보입니다. [아키텍처](architecture.md) §5.
- #135는 이미 병합되었습니다. 이전 Windows 검증 기록은 유지하고 최신 기능/물리 입력 인수는 미완료로 관리합니다.

- 전략 실험 가상 정원 **1~300명**(300 허용, 301 거부 테스트), 경쟁자 0~200; 실제 학교 정원/확률과 무관. 코드 수정 [d7d87f7](https://github.com/ot4562-glitch/Hanmo_develop/commit/d7d87f7eaa1056ecb59d8cfb91927255d3a78792).
- **[#134](https://github.com/ot4562-glitch/Hanmo_develop/issues/134):** PC 진단·8회 반응속도 테스트·가상 전략 실험의 안정화, 측정/계산 신뢰성과 Windows 실기기 인수를 공동 검증합니다. 담당자는 이의상(`uisang2004-maker`)과 김채윤(`qamarrchae`)입니다.
- **[#59](https://github.com/ot4562-glitch/Hanmo_develop/issues/59) (closed/not_planned):** 독립 학교 문의처 학생 페이지 제거. **[#132](https://github.com/ot4562-glitch/Hanmo_develop/issues/132)·[#133](https://github.com/ot4562-glitch/Hanmo_develop/issues/133) (closed):** 결과 PNG 공유/기록 등급/순위·부가 제안은 현행 구현 대상 아님.
- 학사 공지·달력은 `html/academic-timeline.html` 단일 화면의 탭이고, 강의 검색은 `html/catalog.html`에만 남았습니다. 실제 학교 공지·개설·행사 자료는 `mode: disabled`이며 크롤러·Supabase 미연결입니다.
- 실기기 Windows Chrome/Edge·200%/NVDA 원본 인수는 여전히 **미완료**이며 Node/Chromium CI 성공과 구별합니다.

## 현재 열린 이슈 (30건)

### 학생 UI·합성 연습·신뢰성

| 이슈 | 현재 작업 | GitHub 담당 | 상태 |
|---|---|---|---|
| [#39](https://github.com/ot4562-glitch/Hanmo_develop/issues/39) | [검증][1차][P1][통합] 허용된 학생 웹·비공식 고지·자료 부족 표시 QA | `ot4562-glitch` | open |
| [#45](https://github.com/ot4562-glitch/Hanmo_develop/issues/45) | [구현][1차][P1][데이터] 내정보 직접 입력의 로컬 저장·삭제·손상 복구 검증 | `qamarrchae` | open |
| [#57](https://github.com/ot4562-glitch/Hanmo_develop/issues/57) | [구현][1차][P0][통합] 비공식 모의연습→공지 원문 링크·개설 집계 안내 흐름 완성 | `ot4562-glitch` | open |
| [#58](https://github.com/ot4562-glitch/Hanmo_develop/issues/58) | [검증][1차][P1][통합] 비공식 달력·학교 일정 링크·마감 오인 방지 QA | `uisang2004-maker` | open |
| [#69](https://github.com/ot4562-glitch/Hanmo_develop/issues/69) | [검증][4차][P2][통합] JS 로컬 저장·합성 계산·브라우저 회귀(졸업 UI 제외) | `ot4562-glitch` | open |
| [#71](https://github.com/ot4562-glitch/Hanmo_develop/issues/71) | [검증][2차][P0][통합] BASIC/TIME/SELECT·두 돌발상황 OFF·접속대기 Windows 실기기 QA | `ot4562-glitch` | open |
| [#72](https://github.com/ot4562-glitch/Hanmo_develop/issues/72) | [검증][공통][P1][통합] PC 접근성·비공식 고지·지원 기기·삭제 UI 전체 QA | `ot4562-glitch` | open |
| [#127](https://github.com/ot4562-glitch/Hanmo_develop/issues/127) | [구현][1차][P2][통합] 검수된 공개 일정 달력 표시·원문 탐색 (선택 확장) | `uisang2004-maker` | open |
| [#134](https://github.com/ot4562-glitch/Hanmo_develop/issues/134) | [검증][2차][P1][통합] PC 진단·반응속도 테스트·전략 실험 안정화 및 신뢰성 인수 | `qamarrchae`, `uisang2004-maker` | open |
| [#138](https://github.com/ot4562-glitch/Hanmo_develop/issues/138) | [검증][공통][P0][통합] 개발자 역할 표기 변경 후 Feature browser QA 회귀 복구 | `ot4562-glitch` | open |
| [#139](https://github.com/ot4562-glitch/Hanmo_develop/issues/139) | [검증][2차][P1][통합] 전략 실험 고정 모형의 합성 검증·민감도·성능 회귀 | `qamarrchae`, `uisang2004-maker` | open |
| [#140](https://github.com/ot4562-glitch/Hanmo_develop/issues/140) | [설계][2차][P2][데이터] 동의 기반 모의연습 검증 및 모수 보정 연구 계획 | `qamarrchae`, `uisang2004-maker` | open |

### 공지·개설 관측·안전한 검색

| 이슈 | 현재 작업 | GitHub 담당 | 상태 |
|---|---|---|---|
| [#40](https://github.com/ot4562-glitch/Hanmo_develop/issues/40) | [검증][1차][P1][NLP] 허용 공지 링크 검색·비식별 집계 안전성 골드셋 | `uisang2004-maker` | open |
| [#41](https://github.com/ot4562-glitch/Hanmo_develop/issues/41) | [검증][1차][P0][데이터] 공개 공지·강의 개설 메타데이터의 서면 금지 필드·가공/결측 검증 | `qamarrchae` | open |
| [#42](https://github.com/ot4562-glitch/Hanmo_develop/issues/42) | [구현][1차][P0][데이터] 공개 학사 메타데이터·개설 관측 검수 스냅샷 빌더 | `qamarrchae` | open |
| [#44](https://github.com/ot4562-glitch/Hanmo_develop/issues/44) | [구현][1차][P1][NLP] 공개 공지 최소 메타데이터·원문 링크 인덱스 안전화 | `uisang2004-maker` | open |
| [#46](https://github.com/ot4562-glitch/Hanmo_develop/issues/46) | [구현][1차][P1][NLP] 공개 공지 링크 메타데이터 추출의 오탐·금지 필드 차단 | `uisang2004-maker` | open |
| [#48](https://github.com/ot4562-glitch/Hanmo_develop/issues/48) | [구현][1차][P2][데이터] 공개 강의 개설 이력·추세 비교·비공식 전망 백테스트 | `qamarrchae` | open |
| [#51](https://github.com/ot4562-glitch/Hanmo_develop/issues/51) | [구현][1차][P1][NLP] 공개 공지 최소 주제 분류·정정/보류 표시 (개인화 제외) | `uisang2004-maker` | open |
| [#52](https://github.com/ot4562-glitch/Hanmo_develop/issues/52) | [검증][1차][P2][NLP] 합성 행사 날짜 코어 유효성·백테스트 검증 (서비스 연결 보류) | `uisang2004-maker` | open |
| [#53](https://github.com/ot4562-glitch/Hanmo_develop/issues/53) | [구현][1차][P1][NLP] 학사공지 메타 정밀검색·필터·오타·관련도 개선 | `uisang2004-maker` | open |
| [#68](https://github.com/ot4562-glitch/Hanmo_develop/issues/68) | [검증][4차][P2][NLP] JS 검색·공지 코어 합성 동등성 및 금지 경로 격리 | `uisang2004-maker` | open |

### 정적 자료·선택적 Supabase·수집 제한

| 이슈 | 현재 작업 | GitHub 담당 | 상태 |
|---|---|---|---|
| [#64](https://github.com/ot4562-glitch/Hanmo_develop/issues/64) | [구현][3차][P1][데이터] 공개 메타·개설 관측·비식별 집계 정적 스냅샷·Supabase 설계 | `qamarrchae` | open |
| [#65](https://github.com/ot4562-glitch/Hanmo_develop/issues/65) | [구현][3차][P1][데이터] 공개 공지·개설 이력·행사 메타 읽기 및 정적 대체 | `qamarrchae` | open |
| [#66](https://github.com/ot4562-glitch/Hanmo_develop/issues/66) | [구현][3차][P0][데이터] 정보처 수집 제한·전역 예산·오류 당일 차단 파이프라인 | `qamarrchae` | open |
| [#67](https://github.com/ot4562-glitch/Hanmo_develop/issues/67) | [검증][3차][P1][데이터] 김채윤의 정적 스냅샷·선택적 Supabase Free 직접 실습·인수 | `qamarrchae` | open |
| [#126](https://github.com/ot4562-glitch/Hanmo_develop/issues/126) | [구현][공통][P0][데이터] 공개 학사자료 긴급 OFF·철회·캐시·롤백 검증 | `ot4562-glitch` | open |

### 최종 품질·권리·인수

| 이슈 | 현재 작업 | GitHub 담당 | 상태 |
|---|---|---|---|
| [#73](https://github.com/ot4562-glitch/Hanmo_develop/issues/73) | [검증][공통][P0][통합] 학교 서면 이용 경계·공식 오인·공개 산출물·GPL 출시 감사 | `ot4562-glitch` | open |
| [#101](https://github.com/ot4562-glitch/Hanmo_develop/issues/101) | [검증][공통][P0][통합] JS/JSDoc 이관 후 허용 웹·타입·원본 동등성 최종 인수 | `ot4562-glitch` | open |
| [#125](https://github.com/ot4562-glitch/Hanmo_develop/issues/125) | [검증][4차][P0][인수] 전체 개발 완료 후 원개발자 dlacked에게 소스·운영 인계 | `ot4562-glitch` | open |

## 후속 실행 순서

1. [#138](https://github.com/ot4562-glitch/Hanmo_develop/issues/138) 기능 QA의 기존 기대값 불일치를 우선 복구합니다. 승인된 역할 표시·소속·원본 화면을 보존하며 테스트 우회 없이 최신 CI를 검증합니다.
2. [#134](https://github.com/ot4562-glitch/Hanmo_develop/issues/134)의 공동 PC 도구 안정화 및 [#139](https://github.com/ot4562-glitch/Hanmo_develop/issues/139) 전략 엔진 검증을 진행합니다. 기존 구조 유지, 고정 시드·민감도·과목별/전체 성공·Worker/성능·MathML 가시성을 검증합니다.
3. [#140](https://github.com/ot4562-glitch/Hanmo_develop/issues/140)은 별도 승인 이전에는 계획만 수립하는 P2 선택 연구이며 인수 필수 조건이 아닙니다. 학교 데이터 OFF와 수집 제한은 동일합니다.
4. #71·#72·#101·#73·#126 등 미완료 인수 게이트와 #125를 최신 SHA 기준으로 유지합니다. 이번 정리에서 완료·닫힘 처리한 기존 일반 이슈는 없습니다.

## 열려 있는 PR과 의존성

| PR | 작성자·현재 상태 | 검토 결론/남은 게이트 |
|---|---|---|
| [#120](https://github.com/ot4562-glitch/Hanmo_develop/pull/120) | 이의상, 미병합 | **REQUEST_CHANGES**: 날짜 윤년 오류는 수정됐지만 `NEEDS_REVIEW` 추출을 승인된 행사 기록으로 바꿀 위험. 검수/권리 실패 폐쇄 테스트 필요 |
| [#130](https://github.com/ot4562-glitch/Hanmo_develop/pull/130) | 이의상, 미병합 | **REQUEST_CHANGES**: 같은 noticeId의 정상+금지/불량 행에서 부분 accepted 통과. ID 전체 보류·중복/철회 테스트 필요 |
| [#131](https://github.com/ot4562-glitch/Hanmo_develop/pull/131) | 이의상, #130 위의 stacked PR, 미병합 | **REQUEST_CHANGES**: 매니페스트 scope 관측기간 미검증, 필수 공개 번들 누락 통과. #130 정리 후 새 main 기준 diff/CI 필요 |
| [#93](https://github.com/ot4562-glitch/Hanmo_develop/pull/93) | 본인, **Draft·미병합** | 잘못된 운영 담당자만 김채윤(`qamarrchae`)으로 수정. 과거 리뷰 CHANGES_REQUESTED·실 Supabase/권리/인수 미해결. **본인 PR 병합 금지** |

**병합 규칙:** 본인 PR은 오류 수정 외 새 기능 추가를 하지 않고 병합하지 않습니다. 다른 협업자 PR은 코드·CI·권리·원본/실기기·의존 PR을 검토하여 차단 결함 없을 때만 병합하고, 아니면 재현과 수정 요구를 남깁니다. 이번 검토에서는 **병합한 PR이 없습니다**.

## 종료된 작업·역사적 설계와 최종 인수

- 역사적 설계 HMD-001~032는 GitHub [닫힌 이슈 검색](https://github.com/ot4562-glitch/Hanmo_develop/issues?q=is%3Aissue+is%3Aclosed)에서 버전 이력 확인; 현재 서비스 구현 근거로 오인하지 않습니다.
- 현재 취소된 **독립 문의처 #59**, **결과 공유/등급 제안 #132·#133**, 과거 FAQ·졸업·학칙/학생 판정 제안은 신규 구현을 하지 않습니다.
- #71 원본 모드 Windows 실기기 QA → 필요성 확인 시 #67 김채윤의 선택적 Supabase Free 직접 실습(학교자료 수집은 별도 권리/검수) → #101 전체 JS/기능·정적 정책/권리 인수 → 최종 #125 원개발자 `dlacked` 소스·문서·검증 인계/명시적 수락 순으로 추적합니다.
- `docs/README.md`의 역사 문서와 [아키텍처](architecture.md)의 현행 설계는 역할을 분리합니다. API 스키마·학교 규정·정책은 서면 직원 안내·잠정 운영 방침의 범위를 넘어 자동 활성화하지 않습니다.
