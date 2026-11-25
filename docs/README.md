# 한모 문서 안내

> 2026-11-25 검토: 기능 기준 [86c353f](https://github.com/ot4562-glitch/Hanmo_develop/commit/86c353f3c97049c1d5c806e670e6c4faafba103a). 전략 실험의 현행 모형 유지와 세부 가정·연구 근거는 [아키텍처](architecture.md) §5, CI/인수는 §9, 실행 과제는 [미결 이슈](pending-issues.md)를 확인합니다. 후속 과제는 [#138](https://github.com/ot4562-glitch/Hanmo_develop/issues/138) 브라우저 QA 회귀 복구(P0), [#139](https://github.com/ot4562-glitch/Hanmo_develop/issues/139) 고정 전략 모형 합성·민감도·성능 검증(P1), [#140](https://github.com/ot4562-glitch/Hanmo_develop/issues/140) 동의 기반 모의연습 및 보정 연구 설계(P2, 별도 승인 전 수집 없음·인수 필수 아님)입니다. 기존 원문·권리 정책·자료 미연결 상태는 바꾸지 않습니다.

[프로젝트 README](../README.md)에서 제품과 디자인을, [아키텍처](architecture.md)에서 현재 화면, 기술 설계, 자료 이용 경계를 확인합니다. README의 SVG는 설계 구성도입니다.

| 문서 | 내용 |
|---|---|
| [미결 이슈](pending-issues.md) | 구현·검증 과제와 GitHub 이슈 |
| [학업 코드 이관 지도](academic-porting-map.md) | 기존 학업 코드의 JavaScript 경로와 검증 조건 |
| [공개자료 운영 방침](public-data-operating-decision.md) · [수집 범위](academic-data-collection-scope.md) | 서면 조건, 대면 안내 해석, 필드 검수와 철회 |
| [최소 데이터 계획](focused-public-data-plan.md) · [자료 연결·운영 인계](student-data-source-handoff.md) | 수집·보존 예산과 연결·복구 절차 |
| [개발 운영](../agent.md) · [주석 지침](comment-guidelines.md) | UI 보호, 승인 경계, JavaScript/JSDoc과 한국어 주석 |

Node.js 22에서 `npm ci`와 `npm run check`를 실행합니다. 브라우저 검증에는 `npx playwright install chromium`과 `npm run test:e2e`를 사용합니다. Windows Chrome/Edge 실기기, NVDA, 200% 확대 인수는 [#72](https://github.com/ot4562-glitch/Hanmo_develop/issues/72)에서 추적합니다.

이전 UI 검토, 디자인 체크리스트, PR #1~#5 검토, 구형 자료 보존 설계는 [정리 전 문서 이력](https://github.com/ot4562-glitch/Hanmo_develop/tree/b0719957eafd6852fa9f0c996feca26dfdb63cdf/docs)에 있습니다.
