# HUFS One AI → 한모 학업 소스 이관 지도

> **현재 상태: 2026-11-23 기준 JS/JSDoc 전환 완료, 운영 인수 미완료.** [아키텍처 §8](architecture.md#8-javascript-전용-소스--4차-최종-통합-검증) · [#101](https://github.com/ot4562-glitch/Hanmo_develop/issues/101).

소스 언어 전환과 제품 통합 인수는 별도 작업입니다. [PR #100](https://github.com/ot4562-glitch/Hanmo_develop/pull/100)과 [PR #102](https://github.com/ot4562-glitch/Hanmo_develop/pull/102) 병합 이후 `main`에 **TypeScript 소스/테스트 0개**, 학업 기능은 JavaScript + JSDoc으로 유지합니다. `tsconfig.json` 대신 `jsconfig.json`의 `allowJs`·`checkJs`·`noEmit`를 사용합니다. **과거 이관 전 98개 TS(그중 테스트 42개)는 역사적 인벤토리이며 현재 남은 파일이 아닙니다.**

| 과거 이식·신규 구현 계열 | 현재 JS 유지보수 경로 | 현재 판정 |
|---|---|---|
| `packages/core/src/academics/` | `js/academic/core/academics/` | JS/JSDoc 전환 완료, 계산/예외·공식 RulePack 검증은 계속 |
| `packages/core/src/forecast/` | `js/academic/core/forecast/` | JS 전환 완료, 실제 관측 원장/시점별 골드셋 미연결 |
| `packages/contracts/src/academics/`·`packages/contracts/src/self/` | `js/academic/contracts/` | JS/JSDoc 및 Zod 계약 유지, 운영 스냅샷 인수 별도 |
| `apps/web/src/features/`의 순수 뷰 모델 | `js/academic/views/` | React 종속 원본 제외, JavaScript 기반 학생 뷰 모델 유지 |
| 후속 공지·FAQ·검색·행사·앱 | `js/academic/core/campus-assist/`, `js/academic/app/` | JavaScript 기반 합성 코어 확보, 실제 학교 자료/학생 화면 검증 미완료 |
| 서버·LLM·인증·학생 개인 원본 | **이식 대상 아님** | 학교 로그인·개인 성적 서버 수집·공개 배포 금지 |

## 남은 검증 게이트

- 코드 이관 자체는 완료되었습니다. **단위·구문·`checkJs`·Zod 검사만으로 전체 기능 동등성이나 실제 학교 데이터 정확도를 입증하지 않습니다.** 전환 전후 고정 입력/출력·예외·`UNKNOWN/NEEDS_REVIEW/STALE`·저장 키·API 계약 확인을 [#68](https://github.com/ot4562-glitch/Hanmo_develop/issues/68)·[#69](https://github.com/ot4562-glitch/Hanmo_develop/issues/69)·[#101](https://github.com/ot4562-glitch/Hanmo_develop/issues/101)에서 추적합니다.
- UI 기준은 [화면 동결 목록](../scripts/baselines/ui-freeze.json)의 **현행 blob SHA**입니다. 역사적인 기준 커밋 `da30a875` 자체가 이후 사용자 승인 변경을 막는 것은 아니며, 기존 BASIC/TIME/SELECT 원본 파일 보호와 PC 브라우저 QA는 별도입니다.
- 3차 [Draft #93](https://github.com/ot4562-glitch/Hanmo_develop/pull/93)의 PostgreSQL 16 격리 시험은 학생용 Supabase 구축이 아닙니다. **4차 최종 제품 인수**에는 학교 권리·실DB·PC/접근성·운영자 검증이 필요합니다. [#64](https://github.com/ot4562-glitch/Hanmo_develop/issues/64)–[#67](https://github.com/ot4562-glitch/Hanmo_develop/issues/67)
- 새 코드·테스트는 JavaScript/JSDoc, 자연어 주석은 한국어로 작성합니다. 생성 번들, 미허용 React/Fastify·학교 인증·개인정보 원본은 이식하지 않습니다.
