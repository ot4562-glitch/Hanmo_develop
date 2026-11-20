<div align="center">
  <a href="https://github.com/ot4562-glitch/Hanmo_develop"><img src="img/hanmo_color.png" width="84" alt="한모 로고"></a>

  <h1>Hanmo Develop</h1>
  <p><strong>수강신청 연습에서, 다음 학기의 준비까지.</strong><br>HUFS · 한국외국어대학교 학생을 위한 비공식 모의수강신청 · 학업 도우미 개발 프로젝트</p>

  <p>
    <a href="https://github.com/ot4562-glitch/Hanmo_develop/actions/workflows/academic-ci.yml"><img alt="Academic CI" src="https://github.com/ot4562-glitch/Hanmo_develop/actions/workflows/academic-ci.yml/badge.svg?branch=main"></a>
    <a href="LICENSE"><img alt="GPL-3.0" src="https://img.shields.io/badge/license-GPL--3.0-F4C76C?labelColor=00131F"></a>
    <img alt="PC 전용" src="https://img.shields.io/badge/platform-PC%20web-467C96?labelColor=00131F">
    <img alt="비공식 개발 프로젝트" src="https://img.shields.io/badge/status-development-567D6F?labelColor=00131F">
  </p>

  <p><a href="#-프로젝트-소개">소개</a> · <a href="#-미리보기">미리보기</a> · <a href="#-기능-현황">기능 현황</a> · <a href="#-로컬-실행">시작하기</a> · <a href="#site-flow">전체 구조</a> · <a href="docs/architecture.md">설계</a> · <a href="https://github.com/ot4562-glitch/Hanmo_develop/issues">이슈</a></p>
</div>

![HUFS 한모 개발 프로젝트 배너 — 수강신청 연습에서 다음 학기의 준비까지](docs/images/hanmo-hero-hufs.svg)

## ✦ 프로젝트 소개

**한모(Hanmo)**는 [원작 한모](https://github.com/dlacked/Hanmo)의 **BASIC · TIME · SELECT 모의수강신청**을 바탕으로, 학생이 학사 공지를 찾아보고 다음 학기를 준비하는 경험까지 확장하는 프로젝트입니다.

**학교가 운영하는 공식 서비스가 아닙니다.** 학교 계정 로그인, 실제 수강신청, 공식 성적·졸업사정과 연동하지 않습니다. 학생용 웹은 **PC 전용**이며, 현재 구현 화면과 검증·운영이 완료된 기능은 서로 구분합니다.

<table>
  <tr>
    <td width="33%"><strong>01 · PRACTICE</strong><br><br>세 가지 모의수강신청 모드로 신청 흐름과 타이밍을 연습합니다.</td>
    <td width="33%"><strong>02 · DISCOVER</strong><br><br>검수된 공지·강좌가 연결되면 검색하며, 현재는 연결 상태를 안내합니다.</td>
    <td width="33%"><strong>03 · PREPARE</strong><br><br>강의 개설 근거와 학점 계획을 검토하되, 확인되지 않은 자료는 추정으로 단정하지 않습니다.</td>
  </tr>
</table>

## ◈ 미리보기

[![한모 현재 기능 미리보기: 학사 공지·강의 전망 연결 대기, BASIC TIME SELECT 연습 모드](docs/images/hanmo-feature-preview.svg)](https://github.com/ot4562-glitch/Hanmo_develop/tree/main/html)

> **미리보기 안내:** 위 이미지는 `main` 브랜치의 현재 기능·화면 구성을 바탕으로 다시 제작한 **설명용 시각화**이며 실제 브라우저 화면 캡처가 아닙니다. 공지의 전공별 적용 대상, 공식 강의 개설 원장, 최신 강좌·교수 데이터는 검수·연결 전입니다. [실제 화면 소스 보기](html/) · [QA 배포 워크플로](.github/workflows/deploy-pages.yml)

### 학사종합지원센터 검토용 SVG 자료 4종

**현재 구현과 향후 계획을 구분한 벡터 자료**입니다. 별도 이미지 생성 결과가 아닌, 이 저장소에 직접 추가한 **편집 가능한 SVG 원본**이며 공식 학교 안내문·승인 자료는 아닙니다.

<table>
<tr>
<td width="50%"><a href="docs/images/hanmo-01-project-overview.svg"><img src="docs/images/hanmo-01-project-overview.svg" alt="한모 프로젝트 개요 — 모의신청, 학업 탐색, 로컬 입력, 정보 안전 원칙" width="640"></a><br><b>01 · 프로젝트 개요</b></td>
<td width="50%"><a href="docs/images/hanmo-02-page-map.svg"><img src="docs/images/hanmo-02-page-map.svg" alt="페이지 연결 구조 — 홈, 모의신청 3개 모드, 학업 지원 페이지" width="640"></a><br><b>02 · 페이지 구조와 이동</b></td>
</tr>
<tr>
<td><a href="docs/images/hanmo-03-data-flow.svg"><img src="docs/images/hanmo-03-data-flow.svg" alt="학사자료 연결·승인 파이프라인과 미연결·자료 없음·오프라인·검증 실패·정상 상태" width="640"></a><br><b>03 · 승인 데이터와 오류 상태</b></td>
<td><a href="docs/images/hanmo-04-roadmap.svg"><img src="docs/images/hanmo-04-roadmap.svg" alt="한모 개발 4단계 — 학업 플랫폼, 모의신청 안정화, 승인자료 연계, JavaScript 전환" width="640"></a><br><b>04 · 개발 단계 및 협의사항</b></td>
</tr>
</table>

[**학사종합지원센터 참고용 설명서 (그림 4장 + 검토 요청사항)**](docs/academic-support-center-brief.md) · [아키텍처 기준 문서](docs/architecture.md)

> 참고: **학교 자료 사용·재배포 허가 및 Supabase 실연동은 아직 완료되지 않았습니다.** 그림의 승인 절차는 추진·검토 대상이며, 서비스가 학교 공식 시스템이라는 뜻이 아닙니다.

## ◇ 기능 현황

| 영역 | 현재 확인할 수 있는 것 | 범위 · 주의사항 |
| :--- | :--- | :--- |
| **모의수강신청** | BASIC / TIME / SELECT 기본 연습 | 원작의 기존 흐름 유지 |
| **돌발상황 연습** | 가상 신청 실패 상태 확인·404 후 복귀 | **두 가지 기본 OFF 옵션** · 대체과목 검색·시간 충돌 시연 코드 제거 · 실제 학교 장애·신청 결과와 무관 |
| **내정보** | 캠퍼스 · 전공 · 입학년도 선택 | **이 브라우저에만 저장**, 학교 계정과 미연동 |
| **학사 공지** | 승인 자료 연결 대기 · 미연결/빈 목록/오류 안내 | 과거 참고 공지 JSON 제거 · 학생 대상과 마감은 원문 확인 |
| **강의·교수 검색** | 승인된 공개 강좌만 검색 · 빈 목록/연결 오류 표시 | 가상 강좌 삭제 · 실자료 승인 전까지 결과 없음 |
| **강의 개설 전망** | 학수번호·학기 입력과 연결·검수 상태 안내 | 합성 개설 이력 삭제 · 근거 확보 전 UNKNOWN |
| **학점 정리** | 직접 입력한 학점 합산 및 학기별 A/B/C 계획 비교 | 공식 이수 판정·졸업 가능 여부 아님 · 비필수 기능 |

**핵심 원칙:** 확인된 사실과 가상 시연을 분리하고, 공지·학칙의 근거와 적용 대상을 확인할 수 없는 경우 **‘확인 필요’**로 남깁니다. 한국어 학사 FAQ, 개설·행사 시기 전망과 졸업 요건 계산 코어는 검증 상태에 따라 별도 확장합니다.

<a id="site-flow"></a>

## ✧ 전체 구조 · 페이지와 데이터 연결

**실선은 현재 페이지 이동·데이터 경로, 점선은 3차 Supabase 연동 목표**입니다. 복잡한 검색 알고리즘 대신 사용자가 어디로 이동하고 자료가 어디에서 들어오는지만 나타냈습니다.

```mermaid
flowchart TB
    subgraph P["페이지 이동 · 현재"]
        direction TB
        H["홈 · index.html"] --> NAV["공통 상단 메뉴"]
        NAV --> N["학사 공지"]
        NAV --> F["강의 전망"]
        NAV --> C["강의 검색"]
        NAV --> G["학점 정리"]
        NAV --> I["내정보"]
        H --> M["모의수강신청 메뉴 · BASIC / TIME / SELECT"]
        M --> PR["연습 · practice.html"]
        PR --> SZ["과목 선택·신청 · selectZone.html"]
        SZ --> R["결과 · result.html"]
    end

    subgraph D["데이터 입력·공급"]
        direction TB
        J["공개 자료 설정 · 기본 비활성"] --> E["미연결 · 자료 없음 · 오류 안내"]
        E --> N
        E --> F
        E --> C
        U["학생 직접 입력"] --> I
        I --> LS["브라우저 로컬 저장"]
        U --> G
        S["사용 허가된 학사자료"] -.-> V["정규화·독립 검수·승인"]
        V -.-> DB["3차 예정 · Supabase"]
        DB -.-> API["승인 자료 읽기 전용 API"]
        API -.-> N
        API -.-> F
        API -.-> C
    end

    classDef page fill:#0d3042,stroke:#467c96,color:#eff6fc
    classDef data fill:#173b35,stroke:#78ad9e,color:#eff6fc
    classDef planned fill:#3c321e,stroke:#f4c76c,color:#f4c76c
    class H,NAV,N,F,C,G,I,M,PR,SZ,R page
    class J,E,U,LS data
    class S,V,DB,API planned
```

> **현재:** 오래된 공지 참고 목록과 가상 강좌·개설 이력은 제거했습니다. `data/academic-source-config.json`은 기본 비활성이고 화면은 **미연결 / 승인 자료 없음 / 오류·유효성 문제**를 구분해 안내합니다. **3차 연동 목표:** 학교의 자료 이용 허가와 독립 검수·승인이 끝난 Supabase의 승인 공개판본만 읽습니다. 연결 실패 시 승인되지 않은 과거 데이터를 자동 재사용하지 않습니다. 학생 성적·개인 계획은 서버에 전송하지 않습니다.

[실제 페이지 파일](html/) · [자료·Supabase 상세 설계](docs/architecture.md) · [3차 설치 패키지 초안 PR #93](https://github.com/ot4562-glitch/Hanmo_develop/pull/93)

## ◌ 로컬 실행

Node.js 22 환경에서 프로젝트 루트를 기준으로 실행합니다.

```bash
git clone https://github.com/ot4562-glitch/Hanmo_develop.git
cd Hanmo_develop
npm install --ignore-scripts --no-audit --no-fund
npm run check
npm run check:legacy
```

`npm run check`는 TypeScript 타입 검사, 계산 코어 테스트, 정적 빌드와 페이지 검증을 실행합니다. `npm run check:legacy`는 원래 모의신청과 PC 제한 동작을 별도로 검증합니다. 빌드 산출물은 `dist/`에 생성됩니다. 브라우저에서 확인할 때는 로컬 HTTP 서버로 `dist/`를 제공하세요.

<details>
<summary><strong>디렉터리와 개발 단계 보기</strong></summary>

| 경로 | 역할 |
| :--- | :--- |
| `html/` · `css/` | 학생용 정적 화면과 한모 디자인 |
| `js/academic/` | TypeScript 학업 계산 코어 및 계약 |
| `js/` | 기존 모의신청 JavaScript와 화면 로직 |
| `data/` | 공개 자료 연결 설정 · 기본 비활성, 테스트 학사자료 없음 |
| `tests/` · `scripts/` | 회귀 테스트, 빌드 및 검증 도구 |
| `docs/architecture.md` | **현행 제품·기술 설계의 기준 문서** |

**개발 4단계:** ① TypeScript + 정적 HTML/CSS 학업 플랫폼 → ② 원개발자 협의 후 기존 JS 모의신청 시나리오 확장 → ③ 승인 책임자가 운영하는 Supabase 실연동·검증 → ④ 동등성 검증 후 JavaScript/JSDoc으로 점진적 통일. 단계와 승인 조건은 [아키텍처](docs/architecture.md)에서 관리합니다.

</details>

---

<div align="center">
  <p><strong>공식 학사정보는 반드시 한국외국어대학교의 원문 공지로 다시 확인하세요.</strong></p>
  <p>
    <a href="docs/architecture.md">Architecture</a> ·
    <a href="agent.md">Contribution Guide</a> ·
    <a href="https://github.com/ot4562-glitch/Hanmo_develop/issues">Issues</a> ·
    <a href="LICENSE">GPL-3.0 License</a>
  </p>
  <sub>Based on <a href="https://github.com/dlacked/Hanmo">dlacked/Hanmo</a> · Unofficial HUFS student project · Not affiliated with HUFS</sub>
</div>
