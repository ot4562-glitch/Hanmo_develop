# 한모 GitHub 이슈·아키텍처 동기화 색인

**2026-11-23 기준.** 일반 GitHub 이슈 **기존 74건을 점검**했고 최종 인계 이슈 [#125](https://github.com/ot4562-glitch/Hanmo_develop/issues/125) · 긴급 철회 이슈 [#126](https://github.com/ot4562-glitch/Hanmo_develop/issues/126) · 공식 일정 통합 [#127](https://github.com/ot4562-glitch/Hanmo_develop/issues/127)을 추가해 **총 77건(열림 27건 / 닫힘 50건)**입니다. 제품·권리의 최우선 정본은 [정보처 서면 회신 원문](sources/2026-11-23-hufs-information-office-reply.txt)과 [아키텍처 §0](architecture.md)이며, 실제 작업 명세는 각 이슈의 **최신 본문·제목·상태**입니다. 오래된 체크리스트는 GitHub 편집 이력으로 남더라도 최신 명세를 덮어쓰지 않습니다.

학교는 별도 과거 학기 목록·데이터 파일·API를 제공하지 않고 한모 서비스를 승인·인증·제휴하지 않았습니다. 운영자는 정보처 **두 직원의 대면 안내에서 공개정보 가공 가능** 취지를 들었다고 전했고, **명시적 서면 금지 항목은 제외·자동 수집은 서면 한도 준수·그 밖의 공개정보 가공은 운영자 해석으로 기능/필드 검수에 포함**하기로 했습니다. 공지 메타 고급 검색·개설 관측 이력·공식 행사 일정 통합·문의처 탐색이 대상입니다. 교수명·'수강 관련 정보'·학칙·졸업요건·FAQ 대행·학교 계정·개인 성적자료와 공지 본문/첨부 재게시 등 **이메일 명시 금지는 유지**합니다. 구체 필드의 금지 표현 충돌은 검수 전 공개 보류하며 이메일 말미 '열거 외 이용 불허'와의 **해석 충돌을 [운영 문서](public-data-operating-decision.md)에 공개**합니다.

**안내 지위 추가 확인:** 운영자에 따르면 직원 이메일과 대면 설명 모두 **학교 전체의 확정된 공식 입장은 아니며**, 활용·가공 가능한 데이터 범위가 향후 **넓어지거나 좁아질 수 있습니다**. 현행 금지·수집 한도는 내부 운영 기준으로 유지하고 새 근거에 따라 필드별 승인 판본과 긴급 철회·재검수 사항을 [잠정 정책](public-data-operating-decision.md)·[#41](https://github.com/ot4562-glitch/Hanmo_develop/issues/41)·[#73](https://github.com/ot4562-glitch/Hanmo_develop/issues/73)·[#126](https://github.com/ot4562-glitch/Hanmo_develop/issues/126)에서 갱신합니다.

**자동 수집은 현재 OFF·미구현:** 공지 ≤1회/일(첫 목록과 신규 상세만), 강의시간표 ≤2회/학기, 간격 ≥10초·동시 1·배치 최대 50건, 수강신청/정정과 각 전후 1일 중단, 오류·접속 제한 발생 시 당일 **재시도 금지**. 공개 노출 URL/운영자 User-Agent 준수와 전역 차단은 [#66](https://github.com/ot4562-glitch/Hanmo_develop/issues/66)에서 구현·검증합니다. DB는 **정적 스냅샷 우선**, 선택적으로 Supabase Free($0). **2차 #71 실기기 QA 이후 3차 책임자 김채윤(`qamarrchae`)이 직접 실습·보안/복구를 검증**합니다([#67](https://github.com/ot4562-glitch/Hanmo_develop/issues/67)). 소스 설정은 `mode: disabled`이며 [Draft #93](https://github.com/ot4562-glitch/Hanmo_develop/pull/93)은 구형 SQL로 미병합·실배포 부적합입니다.

**운영자 추가 결정:** 정보처에 추가 문의 없이 진행하되 **서면 명시 금지·자동 수집 조건을 우선**하고, 그 밖의 **공개자료 활용·가공은 대면 설명을 근거로 제품 설계 및 자료 필드 검수 범위**에 포함합니다. 자동 실수집/노출은 아직 OFF입니다. 서면의 열거 외 이용 불허 문구와 운영자 해석의 차이·긴급 내리기 절차는 [공개자료 운영 결정](public-data-operating-decision.md)과 [#126](https://github.com/ot4562-glitch/Hanmo_develop/issues/126)에 기록합니다.

## 현재 열려 있는 실행·검증 이슈 (27건, 2026-11-23 기준)

### 공개 공지·집계 및 안전한 검색

| 이슈 | 현재 제목 | 상태 |
|---|---|---|
| [#40](https://github.com/ot4562-glitch/Hanmo_develop/issues/40) | [검증][1차][P1][NLP] 허용 공지 링크 검색·비식별 집계 안전성 골드셋 | open |
| [#41](https://github.com/ot4562-glitch/Hanmo_develop/issues/41) | [검증][1차][P0][데이터] 공개 공지·강의 개설 메타데이터의 서면 금지 필드·가공/결측 검증 | open |
| [#42](https://github.com/ot4562-glitch/Hanmo_develop/issues/42) | [구현][1차][P0][데이터] 공개 학사 메타데이터·개설 관측 검수 스냅샷 빌더 | open |
| [#44](https://github.com/ot4562-glitch/Hanmo_develop/issues/44) | [구현][1차][P1][NLP] 공개 공지 최소 메타데이터·원문 링크 인덱스 안전화 | open |
| [#46](https://github.com/ot4562-glitch/Hanmo_develop/issues/46) | [구현][1차][P1][NLP] 공개 공지 링크 메타데이터 추출의 오탐·금지 필드 차단 | open |
| [#48](https://github.com/ot4562-glitch/Hanmo_develop/issues/48) | [구현][1차][P0][데이터] 공개 강의 개설 이력·추세 비교·비공식 전망 백테스트 | open |
| [#51](https://github.com/ot4562-glitch/Hanmo_develop/issues/51) | [구현][1차][P1][NLP] 공개 공지 최소 주제 분류·정정/보류 표시 (개인화 제외) | open |
| [#52](https://github.com/ot4562-glitch/Hanmo_develop/issues/52) | [검증][1차][P2][NLP] 합성 행사 날짜 코어 유효성·백테스트 검증 (서비스 연결 보류) | open |
| [#53](https://github.com/ot4562-glitch/Hanmo_develop/issues/53) | [구현][1차][P1][NLP] 학사공지 메타 정밀검색·필터·오타·관련도 개선 | open |

### 학생 웹·로컬 프로필

| 이슈 | 현재 제목 | 상태 |
|---|---|---|
| [#39](https://github.com/ot4562-glitch/Hanmo_develop/issues/39) | [검증][1차][P1][통합] 허용된 학생 웹·비공식 고지·자료 부족 표시 QA | open |
| [#45](https://github.com/ot4562-glitch/Hanmo_develop/issues/45) | [구현][1차][P1][데이터] 내정보 직접 입력의 로컬 저장·삭제·손상 복구 검증 | open |
| [#57](https://github.com/ot4562-glitch/Hanmo_develop/issues/57) | [구현][1차][P0][통합] 비공식 모의연습→공지 원문 링크·개설 집계 안내 흐름 완성 | open |
| [#58](https://github.com/ot4562-glitch/Hanmo_develop/issues/58) | [검증][1차][P1][통합] 비공식 달력·학교 일정 링크·마감 오인 방지 QA | open |
| [#59](https://github.com/ot4562-glitch/Hanmo_develop/issues/59) | [구현][1차][P1][통합] 공개 공식 문의처 정밀 탐색·업무/캠퍼스 비교·링크 최신성 | open |
| [#127](https://github.com/ot4562-glitch/Hanmo_develop/issues/127) | [구현][1차][P2][통합] 검수된 공개 일정 달력 표시·원문 탐색 (선택 확장) | open |

### 정적 최소 스냅샷·선택적 Supabase

| 이슈 | 현재 제목 | 상태 |
|---|---|---|
| [#64](https://github.com/ot4562-glitch/Hanmo_develop/issues/64) | [구현][3차][P1][데이터] 공개 메타·개설 관측·비식별 집계 정적 스냅샷·Supabase 설계 | open |
| [#65](https://github.com/ot4562-glitch/Hanmo_develop/issues/65) | [구현][3차][P1][데이터] 공개 공지·개설 이력·행사 메타 읽기 및 정적 대체 | open |
| [#66](https://github.com/ot4562-glitch/Hanmo_develop/issues/66) | [구현][3차][P0][데이터] 정보처 수집 제한·전역 예산·오류 당일 차단 파이프라인 | open |
| [#126](https://github.com/ot4562-glitch/Hanmo_develop/issues/126) | [구현][공통][P0][데이터] 공개 학사자료 긴급 OFF·철회·캐시·롤백 검증 | open |
| [#67](https://github.com/ot4562-glitch/Hanmo_develop/issues/67) | [검증][3차][P1][데이터] 김채윤의 정적 스냅샷·선택적 Supabase Free 직접 실습·인수 | open |

### JS 동등성·원본 실기기·출시 권리 감사

| 이슈 | 현재 제목 | 상태 |
|---|---|---|
| [#68](https://github.com/ot4562-glitch/Hanmo_develop/issues/68) | [검증][4차][P2][NLP] JS 검색·공지 코어 합성 동등성 및 금지 경로 격리 | open |
| [#69](https://github.com/ot4562-glitch/Hanmo_develop/issues/69) | [검증][4차][P2][통합] JS 로컬 저장·합성 계산·브라우저 회귀(졸업 UI 제외) | open |
| [#71](https://github.com/ot4562-glitch/Hanmo_develop/issues/71) | [검증][2차][P0][통합] BASIC/TIME/SELECT·두 돌발상황 OFF·접속대기 Windows 실기기 QA | open |
| [#72](https://github.com/ot4562-glitch/Hanmo_develop/issues/72) | [검증][공통][P1][통합] PC 접근성·비공식 고지·지원 기기·삭제 UI 전체 QA | open |
| [#73](https://github.com/ot4562-glitch/Hanmo_develop/issues/73) | [검증][공통][P0][통합] 학교 서면 이용 경계·공식 오인·공개 산출물·GPL 출시 감사 | open |
| [#101](https://github.com/ot4562-glitch/Hanmo_develop/issues/101) | [검증][공통][P0][통합] JS/JSDoc 이관 후 허용 웹·타입·원본 동등성 최종 인수 | open |
| [#125](https://github.com/ot4562-glitch/Hanmo_develop/issues/125) | [검증][4차][P0][인수] 전체 개발 완료 후 원개발자 dlacked에게 소스·운영 인계 | open |

## 불허·미승인 범위로 종료한 이슈 (8건, `not_planned`)

해당 기능의 **구현 완료가 아니라 제품 범위 폐기**를 의미합니다. 운영 범위가 다시 넓어지려면 학교의 명확한 새 서면 허용과 별도 사용자 결정이 필요합니다.

| 이슈 | 현행 제목 | GitHub 상태 |
|---|---|---|
| [#43](https://github.com/ot4562-glitch/Hanmo_develop/issues/43) | [구현][1차][P1][데이터] WIS 강좌·분반·교수 HTML/CSV 학생 서비스 연계 중단 | closed/not_planned |
| [#47](https://github.com/ot4562-glitch/Hanmo_develop/issues/47) | [구현][1차][P1][NLP] 학칙 원문·RulePack 검수 및 학생 적용 개발 중단 | closed/not_planned |
| [#54](https://github.com/ot4562-glitch/Hanmo_develop/issues/54) | [구현][1차][P0][NLP] 학사 FAQ 자체 답변·근거 검증 학생 서비스 연계 중단 | closed/not_planned |
| [#55](https://github.com/ot4562-glitch/Hanmo_develop/issues/55) | [구현][1차][P1][NLP] 학칙 개정·전공 변경 What-if 학생 진단 연계 중단 | closed/not_planned |
| [#56](https://github.com/ot4562-glitch/Hanmo_develop/issues/56) | [구현][1차][P1][데이터] 학칙·실강좌 기반 2~4학기 A/B/C 수강계획 복원 중단 | closed/not_planned |
| [#60](https://github.com/ot4562-glitch/Hanmo_develop/issues/60) | [구현][1차][P2][NLP] 학교 학사 제도·절차 번역 안내 및 체크 상태 연계 중단 | closed/not_planned |
| [#61](https://github.com/ot4562-glitch/Hanmo_develop/issues/61) | [구현][1차][P2][NLP] 교환학생 규정·학점 인정 기반 자격 체크리스트 연계 중단 | closed/not_planned |
| [#63](https://github.com/ot4562-glitch/Hanmo_develop/issues/63) | [구현][1차][P1][통합] 학교 규정 기반 졸업 진단·요건·A/B/C UI 재출시 중단 | closed/not_planned |

## HMD-001 ~ HMD-032 · 과거 설계 32건 전부 종결

[#27](https://github.com/ot4562-glitch/Hanmo_develop/issues/27)(HMD-021)은 **회신 수령·아키텍처 반영이 완료돼 closed/completed**입니다. 이는 학교의 서비스 승인이 아니라 제한 조건을 적용했다는 뜻입니다. HMD 이슈의 closed는 역사적 설계 결정의 종결을 뜻하며, 현재 학교 규정·FAQ/졸업 UI 사용 허가가 아닙니다.

| HMD ID | 이슈 | 최신 역사/정책 제목 | 상태 |
|---|---|---|---|
| `HMD-001` | [#7](https://github.com/ot4562-glitch/Hanmo_develop/issues/7) | [설계][공통][P0][통합] 초기 학업 흐름 설계 기록 → 허용 공개 링크·모의연습으로 대체 (HMD-001) | closed |
| `HMD-002` | [#8](https://github.com/ot4562-glitch/Hanmo_develop/issues/8) | [설계][공통][P0][통합] PR #1~#5 파일별 채택·이식 범위 역사 기록 (HMD-002) | closed |
| `HMD-003` | [#9](https://github.com/ot4562-glitch/Hanmo_develop/issues/9) | [설계][공통][P0][통합] GPL·이식 소스·학교 서면 이용 경계 정책 기록 (HMD-003) | closed |
| `HMD-004` | [#10](https://github.com/ot4562-glitch/Hanmo_develop/issues/10) | [설계][1차][P0][통합] JSON 진단 UI 분리 설계 기록(졸업 학생 화면 폐기) (HMD-004) | closed |
| `HMD-005` | [#11](https://github.com/ot4562-glitch/Hanmo_develop/issues/11) | [설계][1차][P0][데이터] 학칙 RulePack 계획 폐기 기록 (HMD-005) | closed |
| `HMD-006` | [#12](https://github.com/ot4562-glitch/Hanmo_develop/issues/12) | [설계][1차][P1][데이터] WIS 강좌·분반·교수 수동 HTML/CSV 계획 폐기 기록 (HMD-006) | closed |
| `HMD-007` | [#13](https://github.com/ot4562-glitch/Hanmo_develop/issues/13) | [설계][1차][P1][데이터] 비식별 개설 전망 관측·보류 원칙(행사 전망 보류) (HMD-007) | closed |
| `HMD-008` | [#14](https://github.com/ot4562-glitch/Hanmo_develop/issues/14) | [설계][1차][P0][데이터] 개인별 학사공지 마감·2건 고정 설계 폐기 기록 (HMD-008) | closed |
| `HMD-009` | [#15](https://github.com/ot4562-glitch/Hanmo_develop/issues/15) | [설계][1차][P1][NLP] 학사 FAQ 근거 검색 설계 폐기 (HMD-009) | closed |
| `HMD-010` | [#16](https://github.com/ot4562-glitch/Hanmo_develop/issues/16) | [설계][1차][P2][통합] 교환·국제학생 학사 안내 확장 설계 폐기 기록 (HMD-010) | closed |
| `HMD-011` | [#17](https://github.com/ot4562-glitch/Hanmo_develop/issues/17) | [설계][1차][P0][데이터] 로컬 환경설정·연습 상태 격리(학생 원장 폐기) (HMD-011) | closed |
| `HMD-012` | [#18](https://github.com/ot4562-glitch/Hanmo_develop/issues/18) | [설계][2차][P0][통합] 원개발자 포크 개발 동의·시나리오 확장 범위 (HMD-012) | closed |
| `HMD-013` | [#19](https://github.com/ot4562-glitch/Hanmo_develop/issues/19) | [설계][2차][P0][통합] BASIC/TIME/SELECT 원본 동작·회귀 기준 계약 확정 (HMD-013) | closed |
| `HMD-014` | [#20](https://github.com/ot4562-glitch/Hanmo_develop/issues/20) | [설계][2차][P1][통합] LAST_COURSE_FAIL 설계 폐기·합성 CAPACITY와 구별 (HMD-014) | closed |
| `HMD-015` | [#21](https://github.com/ot4562-glitch/Hanmo_develop/issues/21) | [설계][2차][P1][통합] 구형 재접속 결과 판정 폐기·단일 가상 404 경로 (HMD-015) | closed |
| `HMD-016` | [#22](https://github.com/ot4562-glitch/Hanmo_develop/issues/22) | [설계][1·2차][P0][데이터] 합성 신청 결과와 실제 강좌 매핑 금지·완전 격리 (HMD-016) | closed |
| `HMD-017` | [#23](https://github.com/ot4562-glitch/Hanmo_develop/issues/23) | [설계][공통][P0][배포] GitHub Pages 미리보기·원본 도메인 분리 정책 (HMD-017) | closed |
| `HMD-018` | [#24](https://github.com/ot4562-glitch/Hanmo_develop/issues/24) | [설계][공통][P1][배포] 기능 PR·권리 승인·안전 롤백 정책 (HMD-018) | closed |
| `HMD-019` | [#25](https://github.com/ot4562-glitch/Hanmo_develop/issues/25) | [설계][공통][P1][검증] JS/JSDoc·정적 웹·비공식 고지 최종 CI 게이트 (HMD-019) | closed |
| `HMD-020` | [#26](https://github.com/ot4562-glitch/Hanmo_develop/issues/26) | [설계][공통][P1][통합] PC 전용 접근성·학업 화면 비공식 고지 검증 (HMD-020) | closed |
| `HMD-021` | [#27](https://github.com/ot4562-glitch/Hanmo_develop/issues/27) | [설계][공통][P0][데이터] 정보처 서면 회신에 따른 공개자료 허용·금지 경계 확정 (HMD-021) | closed |
| `HMD-022` | [#28](https://github.com/ot4562-glitch/Hanmo_develop/issues/28) | [설계][공통][P0][데이터] 허용 최소 공개정보 독립 검수·철회 정책 (HMD-022) | closed |
| `HMD-023` | [#29](https://github.com/ot4562-glitch/Hanmo_develop/issues/29) | [설계][3차][P0][통합] 선택적 Supabase Free 운영 권한·정적 대안 책임 (HMD-023) | closed |
| `HMD-024` | [#30](https://github.com/ot4562-glitch/Hanmo_develop/issues/30) | [설계][3차][P1][데이터] 구형 Supabase 논리 스키마 폐기·최소 스냅샷 우선 (HMD-024) | closed |
| `HMD-025` | [#31](https://github.com/ot4562-glitch/Hanmo_develop/issues/31) | [설계][3차][P1][데이터] 수집 실패 폐쇄·당일 재시도 금지로 정책 대체 (HMD-025) | closed |
| `HMD-026` | [#32](https://github.com/ot4562-glitch/Hanmo_develop/issues/32) | [설계][3차][P1][데이터] 최소 공개 스냅샷 선택적 RLS·GRANT·비밀키 경계 (HMD-026) | closed |
| `HMD-027` | [#33](https://github.com/ot4562-glitch/Hanmo_develop/issues/33) | [설계][3차][P1][데이터] 학교 성적·수강 원장 미취급·로컬 프로필만 (HMD-027) | closed |
| `HMD-028` | [#34](https://github.com/ot4562-glitch/Hanmo_develop/issues/34) | [설계][3차][P0][통합] 정적 우선 데이터 인수·선택적 DB 게이트 (HMD-028) | closed |
| `HMD-029` | [#35](https://github.com/ot4562-glitch/Hanmo_develop/issues/35) | [설계][4차][P2][통합] 완료된 TypeScript→JS/JSDoc 이관의 과거 계획 (HMD-029) | closed |
| `HMD-030` | [#36](https://github.com/ot4562-glitch/Hanmo_develop/issues/36) | [설계][4차][P2][통합] JS/JSDoc 이관 완료·차등/금지 경로 검증 조건 (HMD-030) | closed |
| `HMD-031` | [#37](https://github.com/ot4562-glitch/Hanmo_develop/issues/37) | [설계][2차][P0][통합] 기본 OFF RECONNECT·CAPACITY 두 합성 시나리오 (HMD-031) | closed |
| `HMD-032` | [#38](https://github.com/ot4562-glitch/Hanmo_develop/issues/38) | [설계][공통][P1][통합] 비공식 모의연습·자체 개설 집계 표현 정책 (HMD-032) | closed |

## 기타 종료 기록 (10건)

모의연습 코드·사용자 경험 개선·QA 미리보기 등 **기존 시점의 종료 기록**입니다. 실기기 승인·정보처 서비스 인정·최종 배포 적합성을 의미하지 않습니다.

| 이슈 | 최신 기록 제목 | 상태 |
|---|---|---|
| [#49](https://github.com/ot4562-glitch/Hanmo_develop/issues/49) | [구현][2차][P1][통합] LAST_VALID 삭제 완료(별도 CAPACITY 합성 도입) | closed |
| [#50](https://github.com/ot4562-glitch/Hanmo_develop/issues/50) | [구현][2차][P1][통합] BASIC 가상 404·F5 복구·독립 대기 구현(실기기 QA 별도) | closed |
| [#62](https://github.com/ot4562-glitch/Hanmo_develop/issues/62) | [구현][2차][P2][통합] 합성 돌발상황 추가 범위 보류 결정(실강좌 추천 제외) | closed |
| [#74](https://github.com/ot4562-glitch/Hanmo_develop/issues/74) | [검증][공통][P1][통합] 2026-11-22 차별화 표현 검토 기록(서면 이후 별도 감사) | closed |
| [#80](https://github.com/ot4562-glitch/Hanmo_develop/issues/80) | [구현][1차][P2][UI] 후속 전면 디자인 개편 보류(학교 정책 필수 수정 예외) | closed |
| [#88](https://github.com/ot4562-glitch/Hanmo_develop/issues/88) | [구현][2차][P1][인프라] Pages QA 아티팩트 충돌 대응 기록(재실행 실증은 별도) | closed |
| [#113](https://github.com/ot4562-glitch/Hanmo_develop/issues/113) | [설계][1차][P1][데이터] 학점·잔여 학점 UI 설계 이력(2026-11-23 화면 삭제) | closed |
| [#114](https://github.com/ot4562-glitch/Hanmo_develop/issues/114) | [설계][1차][P1][데이터] 졸업요건·외국어 인증 안내 설계 폐기 기록 | closed |
| [#115](https://github.com/ot4562-glitch/Hanmo_develop/issues/115) | [설계][1차][P1][통합] 개설 전망 통합 채택·졸업 준비 메뉴 폐기 이력 | closed |
| [#116](https://github.com/ot4562-glitch/Hanmo_develop/issues/116) | [설계][2차][P2][통합] BASIC 합성 CAPACITY 채택·기타 돌발상황 보류 기록 | closed |

## 최신 문서·이슈 동기화 확인

- **2026-11-23 현재 열린 일반 이슈 27건:** 각 제목의 차수·유형·P0/P1/P2 라벨과 아래 색인의 제목·상태를 GitHub에 맞춰 정리했습니다. 목록을 닫거나 기능 완료로 선언한 것은 아닙니다.
- **학생 우선순위:** 공지 정밀검색 #53·검색 안전 평가 #40, 강의 개설 검수 #48은 별도. #127은 일정 월간 표시의 **P2 선택 확장**, **‘바뀐 공지만 보기’ 필터와 전후 비교 학생 화면은 폐기**했습니다.
- **병합/코드 상태:** [PR #128](https://github.com/ot4562-glitch/Hanmo_develop/pull/128)·[PR #129](https://github.com/ot4562-glitch/Hanmo_develop/pull/129)는 `main`에 반영됐습니다. 문의 생성 버튼·학교 홈페이지 바로가기 제거, 제목 i 안내, 홈 NOTICE 순환·SETTING/돌발상황 빛 복구의 PC 자동 QA는 완료됐으나 Windows 실기기/실자료 연결/학교 자료 이용 인수는 별도입니다.
- **정본:** [현행 아키텍처](architecture.md)·[학생 기능/최소 데이터 계획](focused-public-data-plan.md)·[잠정 운영 방침](public-data-operating-decision.md). 아래 과거 종료 이슈는 기능 출시가 아니라 당시 설계 기록입니다.

## 사실과 미완료 인수 구분

- **실제로 유지되는 웹:** 홈·BASIC/TIME/SELECT 합성 연습(가상 RECONNECT·CAPACITY 각각 기본 OFF), 학사공지 링크/미연결, 개설 전망/미연결, 달력/공식 원문 링크, 내정보/직접 입력. **졸업 준비·학사 FAQ HTML/JS/CSS·학교 로고 파일은 삭제**. Windows Chrome/Edge/NVDA 실기기와 상징물·SVG 전수 감사는 [#71](https://github.com/ot4562-glitch/Hanmo_develop/issues/71), [#72](https://github.com/ot4562-glitch/Hanmo_develop/issues/72), [#73](https://github.com/ot4562-glitch/Hanmo_develop/issues/73)에서 계속 검증해야 합니다.
- **병합 확인:** [#117](https://github.com/ot4562-glitch/Hanmo_develop/pull/117) 통합 검색, [#119](https://github.com/ot4562-glitch/Hanmo_develop/pull/119) 공지 후보, [#122](https://github.com/ot4562-glitch/Hanmo_develop/pull/122) 합성 CAPACITY. 이는 실학사 자료 연결/학교 승인·정확도 근거가 아닙니다.
- **미병합과 상충 범위:** [#118](https://github.com/ot4562-glitch/Hanmo_develop/pull/118) 학사 FAQ, [#120](https://github.com/ot4562-glitch/Hanmo_develop/pull/120) 날짜 계산, [#121](https://github.com/ot4562-glitch/Hanmo_develop/pull/121) 학칙 비교 및 Draft [#93](https://github.com/ot4562-glitch/Hanmo_develop/pull/93)은 운영에 포함되지 않으며, 특히 FAQ/학칙은 서면 범위상 학생 서비스 연결 금지입니다.
- **코드 이관:** [#100](https://github.com/ot4562-glitch/Hanmo_develop/pull/100)·[#102](https://github.com/ot4562-glitch/Hanmo_develop/pull/102)로 TS→JS/JSDoc 이관 완료. 3차 Supabase 실설치를 선행해야 한다는 옛 지시는 폐기, 최종 동등성/PC QA는 [#101](https://github.com/ot4562-glitch/Hanmo_develop/issues/101).
- **최종 원개발자 인계:** 전체 개발·QA·권리·운영 검증을 마친 뒤 원개발자 `dlacked`에게 소스·문서·테스트·운영 절차를 전달하고 수락 확인하는 [#125](https://github.com/ot4562-glitch/Hanmo_develop/issues/125)는 **계획 중인 미완료 작업**입니다.
- **관리:** 이슈는 댓글로 변경 알림을 쓰지 않고 **제목·본문·상태 직접 편집**으로 정합성을 유지합니다. 코어/합성 CI 성공과 허용 자료의 사람 검수·실DB·브라우저 실기기·운영 인수는 별개입니다.

새 이슈를 만들 때는 [에이전트 운영 규칙](../agent.md#github-이슈-작성과-분류)의 우선순위·담당·검증 가능한 완료 조건을 따르고 동일한 기존 열린 이슈를 우선 보완합니다.
