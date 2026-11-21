# Agent instructions

이 저장소의 자동화·코딩 에이전트는 먼저 루트 [agent.md](agent.md)를 읽고 해당 운영 규칙을 따릅니다.

- **[docs/architecture.md](docs/architecture.md)는 현재 유효한 제품·기술 설계의 유일한 기준 문서**입니다. 변경 이력·폐기된 안을 누적하지 않으며, 결정되지 않은 설계는 문서 하단의 **미결 사항 / GitHub Issue**로 관리합니다.
- 확정된 **문서만** 고칠 때에는 별도 문서 PR을 만들지 않고 `main`에 직접 커밋합니다. 코드 변경은 별도의 PR·테스트·승인 규칙을 따릅니다.
- 단계별 언어/책임 경계: **1단계 TypeScript + 정적 HTML/CSS**, **2단계 기존 JavaScript + HTML/CSS**, **3단계 Supabase 실연동까지 양쪽 병행**, **4단계 전체 제품 안정화 검증 후 JavaScript/JSDoc 소스 통일**.
- **1단계 학업 코어 `js/academic/`, 학생용 화면 `html/`, 스타일 `css/`** 및 **원본 `practice.html`·`selectZone.html` 동작 변경 금지**, **2단계 원개발자 사전 승인**, **3단계 Supabase 소유·운영은 임창용 님과 협의**, **4단계 이전 구현과 동등성·회귀 검증**을 지킵니다.
