# 에이전트 작업 지침

> 2026-11-25 현행 방향: 전략 실험은 현행 합성 모델 유지·안정화/검증 우선. 새로운 모수·모형 변경은 근거·비교 실험·별도 승인과 함께 검토합니다. 최신 CI/실기기 인수는 [현행 아키텍처](docs/architecture.md) §9와 [미결 이슈](docs/pending-issues.md)에서 구분합니다.

작업 전에 [agent.md](agent.md)의 운영·승인 규칙과 [현행 아키텍처](docs/architecture.md)를 확인합니다. [문서 안내](docs/README.md)는 정책 정본과 역사적 기록의 차이를 설명합니다.

- **문서:** 설계 변경은 `docs/architecture.md`에 반영합니다. README는 사용자가 지정한 제외 범위에서 수정하지 않습니다. 문서만 수정할 때는 별도 PR 없이 `main`에 직접 커밋할 수 있습니다.
- **코드 병합:** 저장소 소유자의 PR은 별도 사용자 승인 전까지 병합하지 않습니다. 협업자 작성 PR은 유지보수자가 코드·테스트·CI를 검토해 병합할 수 있습니다. 사용자가 `main` 직접 커밋을 지시한 경우에도 테스트와 보호 경계를 적용합니다.
- **언어:** 신규·수정 코드는 JavaScript + JSDoc으로 작성합니다. `.ts/.tsx/.mts/.cts` 소스를 추가하지 않습니다. 코드의 자연어 주석은 한국어로 작성하고 [주석 지침](docs/comment-guidelines.md)을 따릅니다.
- **화면:** 과거 기준 커밋 `da30a875` 대신 [현행 UI 보호 해시](scripts/baselines/ui-freeze.json)를 확인합니다. 기존 BASIC/TIME/SELECT 및 사용자 승인된 RECONNECT·CAPACITY·독립 대기 설정을 보호합니다. Windows Chrome/Edge 실기기 QA 완료를 가정하지 않습니다.
- **학교 자료:** 실제 학사정보 연결은 `mode: disabled`입니다. [Supabase Draft #93](https://github.com/ot4562-glitch/Hanmo_develop/pull/93)과 실제 운영 설치를 구분합니다. 이용 권리, 독립 자료 검수·승인, 운영자 인수 전에는 공식 정보를 공개하거나 실제 정원·졸업 판정을 하지 않습니다.
