# 한모 학생 웹 · 정보처 회신 이후 구현 현황

> **2026-11-23 `main` 기준.** [정보처 서면 회신 전문](sources/2026-11-23-hufs-information-office-reply.txt) · [아키텍처 §0](architecture.md). 학교는 한모를 운영·인증하지 않고 공식 API·과거 학기 목록·파일을 별도 제공하지 않습니다.

## 현재 웹 화면

| 페이지 | 현재 구현·자료 상태 | 공개 전 확인 |
|---|---|---|
| `index.html` / `html/vsugang.html` | 기존 BASIC/TIME/SELECT와 선택형 합성 RECONNECT·CAPACITY(각 기본 OFF), 독립 대기 설정 | 실제 학교 수강신청 화면과의 혼동 방지·Windows Chrome/Edge 원본 회귀 |
| `html/planner.html` | 캠퍼스·전공·입학년도 브라우저 직접 입력/저장 | 공식 학적/졸업 자격 인증으로 표시 금지 |
| `html/academic-timeline.html` | 공개 공지 원문 링크 안내 화면, **실자료 연결 OFF** | 공지 본문·첨부 재게시/금지 수강·교수 정보 제외, 자동 수집 한도 시험 |
| `html/catalog.html` | 비공식 개설 전망 및 데이터 미연결 안내. `forecast.html`은 호환용 이동 | 학교 개별 강좌·분반/수강 정보 노출 보류; 비식별 집계 범위 서면 확인 |
| `html/academic-calendar.html` | 달력 UI와 학교 공식 일정 안내 링크 | 학교 확정일/마감 자동 판정 또는 보장 금지 |
| `html/academic-support.html` | 학교 공식 문의처 링크 안내 | 학교를 대신해 학사 FAQ 답변·접수/예약 제공 금지 |

**삭제한 학생용 페이지:** `html/academic-progress.html`(졸업 준비/요건), `html/academic-faq.html`(학사 FAQ). 해당 CSS·FAQ JS·학교 로고 파일 `img/hufs_logo.png`와 메뉴 링크도 [웹 정리 커밋](https://github.com/ot4562-glitch/Hanmo_develop/commit/2712bd939502a31755fd21026ac96fe81650c552)에서 제거했습니다. 학칙·졸업요건을 이용한 링크/인용/요약·판정은 허용되지 않습니다. 페이지가 실제 삭제되었더라도 과거 학업 계산/NLP **순수 코어·합성 테스트는 내부 유지**될 수 있으며 학생용 데이터/서비스와 연결할 수 없습니다.

## 권리·수집 경계

- 공개 공지 최소 안내/공식 원문 링크, 허용 범위의 비식별 개설 집계·자체 전망만 별도 검토. 교수명·수강 관련 정보, 공지 원문·첨부 복제, 학칙/졸업요건 이용 불가.
- **수집기 미구현·OFF:** 공지 1회/일(첫 목록·신규 상세만), 시간표 2회/학기, 최소 10초 간격·동시 1건·실행당 최대 50건, 수강신청/정정 기간 및 전후 각 1일 금지, 오류/차단 시 당일 즉시 중단·무재시도, 노출된 공개 URL·User-Agent 서비스명/운영 연락처 필수.
- `data/academic-source-config.json`은 `mode: disabled`; 기존 `js/academic-data-source.js`의 구형 `notices/offerings/faq` 데이터 계약 및 [Draft #93](https://github.com/ot4562-glitch/Hanmo_develop/pull/93) SQL은 새 권리 경계에 맞춰 재설계하기 전 **운영 활성화 금지**.
- 학교 로고 삭제와 비공식 고지는 코드 변경 사실이며 **오인 방지 디자인·실기기/접근성·이미지 전수 감사 완료**를 뜻하지 않습니다. `ui-freeze.json`은 현행 삭제/고지 이후 자산 SHA로 수정했습니다.

## 검사·후속 게이트

Node.js 22에서 `npm ci`, `npm run check`, `npx playwright install chromium`, `npm run test:e2e`를 사용합니다. GitHub Actions의 Chromium 자동 테스트는 Windows Chrome/Edge·NVDA·고배율 실기기 인수를 대신하지 않습니다. 다음 과제는 [#27](https://github.com/ot4562-glitch/Hanmo_develop/issues/27) 허용 필드 확인, [#73](https://github.com/ot4562-glitch/Hanmo_develop/issues/73) 브랜드·배포 감사, [#66](https://github.com/ot4562-glitch/Hanmo_develop/issues/66) 크롤러 차단 조건, [#71](https://github.com/ot4562-glitch/Hanmo_develop/issues/71) 원본 모드 PC QA입니다.
