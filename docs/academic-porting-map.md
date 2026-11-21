# HUFS One AI → Hanmo_develop 이식 범위

| 원본 | 현재 위치 | 상태 |
|---|---|---|
| `packages/core/src/academics/{ledger,plan,course-identity,course-equivalence,...}.ts` | `src/core/academics/` | 순수 로직 이식, 계약 경로 조정 |
| `packages/core/src/forecast/{offering,rolling-origin,scenario}.ts` | `src/core/forecast/` | 코드와 실험 평가 로직 이식 |
| `packages/contracts/src/academics/` | `src/contracts/academics/` | 관련 Zod 검증 계약 이식 |
| `packages/contracts/src/self/{study-plan-check,major-what-if}.ts` | `src/contracts/self/` | 학업 관련 계약만 이식 |
| `apps/web/src/features/{graduation,plan-check,double-major}/*View.ts` | `src/views/` | React 무관한 뷰 모델 이식 |
| `apps/web/src/pages/graduationPage.tsx` 및 관련 React panels | `index.html`, `style.css`, `src/app/main.ts` | React/Fastify/계정 의존성 제거, DOM 화면으로 재구성 중 |
| `apps/api/src/modules/academics/` | 미이식 | PostgreSQL·actor·RLS 종속. 정적 실행에 부적합 |
| `csv/` 및 개인 성적/이수 파일 | **이식 금지** | 실제 학생 원본 보호 |
| `packages/ai/`, 인증/키, NCP | **이식 금지** | LLM/API/서버 미사용 |

### 정적 웹 연결

기존 `index.html`, `js/selectZone.js` 등 한모 모의연습 코드는 불변입니다. 신규 화면은 `/`으로 독립 개설합니다. 미래 통합 시 한모의 가상 과목 번호를 실제 학수번호로 착각하지 않고, 명시적으로 작성하는 `HanmoAdapter` 계약을 통해 안전한 **모의 결과**만 전달합니다.

### 기능 우선순위

1. 전체 학사 코어의 번들·타입·합성 테스트 검증
2. 승인된 강좌 이력과 규정 출처 확보, 비공식 출처 배지
3. 예측 검증/성능 지표 및 다학기 제약 계획 추가
4. 가상 수강신청 실패 후 계획 재계산
5. 실제 한모 UI 통합·GPL/공개 재배포 권리 검토

### 상한 및 검증

규정 원문은 승인받기 전 `APPROVED`라고 표시하지 않습니다. 현재 `SYN-DEMO-V1`은 가상 테스트 시나리오에만 사용합니다. 공식 졸업 판정, 실제 개설 확률, 학교 로그인, 실시간 정원 등은 제공하지 않습니다.
