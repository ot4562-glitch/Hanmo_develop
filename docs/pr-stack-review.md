# PR #1~#5 파일 선별과 검증

> **2026-11-18 당시 감사 기록.** 아래 SHA·검사 수치·파일 선별 결과는 해당 시점의 증거입니다. 현재 `main`의 구현 상태는 [아키텍처](architecture.md), 남은 작업은 [이슈 색인](pending-issues.md)을 확인하세요. 원래 측정값은 수정하지 않았습니다.

2026-11-18 KST에 비교한 최종 검증 대상은 [PR #5 e83f3eb](https://github.com/ot4562-glitch/Hanmo_develop/commit/e83f3eb3f29b3159bb28bbf60404afa9f7b733a7)입니다. GitHub의 각 PR 비교에서 133개 변경 행을 확인했습니다. 여러 PR에 걸쳐 수정된 경로는 각각 기록했습니다.

- main의 `2dcac33`과 비교해 기존 `index.html`, `html/`, `js/`, `css/`, `img/`, `CNAME` 경로의 차이는 0건입니다. 최종 검증 대상에 옛 `legacy-academic/` 아카이브 및 `docs/superpowers/`가 포함되지 않습니다.
- 별도 검증 작업 트리에서 `npm run check`를 실행해 타입 검사, 테스트 35개 파일·650건, 정적 번들, 미리보기 3개 페이지·허용 자산 10개·링크 30개·ARIA 참조 10개를 확인했습니다.
- WIS 입력 28건, CSV 내보내기 8건, CSV 입력 4건으로 값·분반·중복·형식 계약을 확인했습니다. 학생용 CSV 입력 화면의 연결은 [#43](https://github.com/ot4562-glitch/Hanmo_develop/issues/43) 범위입니다.
- 코드 선별은 파일 단위의 기술 검토로 기록합니다. 이식 권리는 [#9](https://github.com/ot4562-glitch/Hanmo_develop/issues/9), 실제 자료 사용 허락은 [#27](https://github.com/ot4562-glitch/Hanmo_develop/issues/27), 원작자 승인은 [#18](https://github.com/ot4562-glitch/Hanmo_develop/issues/18)의 게이트를 적용합니다.

## 미리보기 경로와 개인 자료

- GitHub Pages 설정 조회에서 workflow 방식, 기본 주소 `https://ot4562-glitch.github.io/Hanmo_develop/`, CNAME 미연결을 확인했습니다. 기존 소스 `CNAME`의 원본 한모 주소는 `vsugangpractice.com`입니다. Pages의 실제 게시 및 접근 상태는 별도의 배포 검증 대상입니다.
- 로컬 Edge에서 루트와 `/Hanmo_develop/` 접두어 아래의 학업 화면 3개, JS·CSS·이미지·JSON 로드, 내부 이동·직접 새로고침, 없는 경로의 404, CNAME 제외를 확인했습니다. 하위 경로에서 모든 페이지 요청이 접두어 안에 머무는 것을 확인했습니다.
- 390px 화면에서 키보드 이동과 접근성 트리의 캠퍼스 입력·검색 결과를 확인했습니다. 실제 화면낭독기 발화와 기존 모드·시나리오 OFF의 회귀는 [#26](https://github.com/ot4562-glitch/Hanmo_develop/issues/26), [#19](https://github.com/ot4562-glitch/Hanmo_develop/issues/19)에 남습니다.
- 합성 이수 자료로 학점·계획 계산을 실행했을 때 네트워크 요청은 0건이었습니다. 같은 탭의 저장 데이터는 요건 후보 ID와 규정 판본·시각·상태로 제한됐습니다. 향후 실연동에서 경계 재검증은 [#65](https://github.com/ot4562-glitch/Hanmo_develop/issues/65)와 [#67](https://github.com/ot4562-glitch/Hanmo_develop/issues/67)에 남습니다.

## 공개 자료 확인

| 출처 | 공개 안내에서 확인한 범위 |
|---|---|
| [원본 한모](https://vsugangpractice.com/) | 비공식 수강신청 연습, PC 안내 |
| [한국외대 수강신청지침](https://koreanstudies.hufs.ac.kr/hufs/11377/subview.do) | 이번 학기 개설 과목, 캠퍼스별 편람, 신청 일정 확인 경로 |
| [서울대 교과과정·수강편람](https://www.snu.ac.kr/academics/undergraduate/curriculum) · [공식 수강신청 매뉴얼](https://cse.snu.ac.kr/api/v1/file/1695915103760_%28%EB%B6%99%EC%9E%841-2%29%EC%84%9C%EC%9A%B8%EB%8C%80%ED%95%99%EA%B5%90%20%EC%88%98%EA%B0%95%EC%8B%A0%EC%B2%AD%20%EB%A7%A4%EB%89%B4%EC%96%BC%28SNU%20Course%20Registration%20Manual%29_0.pdf) | 강좌 검색·관심 강좌, 매뉴얼의 예비수강신청 모의 체험과 경쟁률·시간표 |

공개 안내 비교는 2026-11-18 KST 기준입니다. 학교 자료의 재배포·정기 수집 허락은 출처별로 별도 확인합니다. 제품 차별점은 위기 후 행동, 과거 개설 관측 근거, 예상과 확정 마감 구분을 학생이 실제로 확인할 수 있는지로 평가합니다. [#27](https://github.com/ot4562-glitch/Hanmo_develop/issues/27) · [#38](https://github.com/ot4562-glitch/Hanmo_develop/issues/38)

## PR #1

기준 브랜치 `main`, HEAD [`5dcf941`](https://github.com/ot4562-glitch/Hanmo_develop/commit/5dcf941e05b16bdfdf7f880c2d1c9d4b30d3bf30). [PR 비교](https://github.com/ot4562-glitch/Hanmo_develop/pull/1/files) · [성공한 검사 1](https://github.com/ot4562-glitch/Hanmo_develop/actions/runs/44296082073/job/134773335525) · [성공한 검사 2](https://github.com/ot4562-glitch/Hanmo_develop/actions/runs/44296072378/job/134773302297)

| 경로 | 선별 | 근거 |
|---|---|---|
| `.github/workflows/degree-rescue-ci.yml` | 채택 | 빌드·원본 보호·정적 배포·CI |
| `degree-rescue/.gitignore` | 채택 | 빌드·원본 보호·정적 배포·CI |
| `degree-rescue/README.md` | 채택 | 개발 참고·출처 기록. 배포 파일 목록에서 제외 |
| `degree-rescue/docs/PORTING_MAP.md` | 채택 | 개발 참고·출처 기록. 배포 파일 목록에서 제외 |
| `degree-rescue/index.html` | 채택 | 독립 학업 화면 |
| `degree-rescue/package.json` | 채택 | 빌드·원본 보호·정적 배포·CI |
| `degree-rescue/scripts/stage-static.mjs` | 채택 | 빌드·원본 보호·정적 배포·CI |
| `degree-rescue/src/app/main.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/app/synthetic-demo.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/contracts/academics/double-major.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/contracts/academics/index.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/contracts/academics/vnext.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/contracts/index.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/contracts/self/major-what-if.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/contracts/self/study-plan-check.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/course-equivalence.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/course-identity.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/double-major.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/index.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/ledger.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/ledger.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/major-what-if.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/notice-links.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/plan.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/plan.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/rule-approval.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/rule-diff.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/study-plan.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/wis-timetable-csv.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/wis-timetable.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/forecast/index.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/forecast/offering.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/forecast/offering.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/forecast/rolling-origin.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/forecast/rolling-origin.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/forecast/scenario.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/forecast/scenario.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/views/doubleMajorView.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/views/graduationView.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/views/planCheckView.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/style.css` | 채택 | 독립 학업 화면 |
| `degree-rescue/tsconfig.json` | 채택 | 빌드·원본 보호·정적 배포·CI |

## PR #2

기준 브랜치 `feature/degree-rescue-hufs-one-port`, HEAD [`bd69caa`](https://github.com/ot4562-glitch/Hanmo_develop/commit/bd69caa164f63a42746da450eee8bfd9d86c0597). [PR 비교](https://github.com/ot4562-glitch/Hanmo_develop/pull/2/files) · [성공한 검사 1](https://github.com/ot4562-glitch/Hanmo_develop/actions/runs/44296086287/job/134773349944) · [성공한 검사 2](https://github.com/ot4562-glitch/Hanmo_develop/actions/runs/44296077374/job/134773319749) · [성공한 검사 3](https://github.com/ot4562-glitch/Hanmo_develop/actions/runs/44296086375/job/134773350935)

| 경로 | 선별 | 근거 |
|---|---|---|
| `.github/workflows/degree-rescue-salvage-ci.yml` | 채택 | 빌드·원본 보호·정적 배포·CI |
| `degree-rescue/README.md` | 채택 후 수정 | 개발 참고·출처 기록. 배포 파일 목록에서 제외 |
| `degree-rescue/catalog.css` | 채택 | 독립 학업 화면 |
| `degree-rescue/catalog.html` | 채택 | 독립 학업 화면 |
| `degree-rescue/docs/ACADEMIC_ASSET_AUDIT.md` | 채택 | 개발 참고·출처 기록. 배포 파일 목록에서 제외 |
| `degree-rescue/index.html` | 채택 후 수정 | 독립 학업 화면 |
| `degree-rescue/package.json` | 채택 후 수정 | 빌드·원본 보호·정적 배포·CI |
| `degree-rescue/scripts/assert-additive-only.mjs` | 채택 | 빌드·원본 보호·정적 배포·CI |
| `degree-rescue/scripts/stage-static.mjs` | 채택 후 수정 | 빌드·원본 보호·정적 배포·CI |
| `degree-rescue/src/app/catalog.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/composite-requirements.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/composite-revisions.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/course-equivalence.property.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/course-equivalence.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/course-identity.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/curriculum-csv.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/curriculum-csv.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/degree-path-contract.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/double-major.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/faculty-directory.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/faculty-directory.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/faculty-search.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/faculty-search.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/index.ts` | 채택 후 수정 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/ledger.property.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/major-what-if.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/rule-approval.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/rule-diff.counterexamples.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/rule-diff.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/study-plan.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/wis-timetable-csv.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academics/wis-timetable.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/forecast/course-identity.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/fixtures/academic-133.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/tsconfig.json` | 채택 후 수정 | 빌드·원본 보호·정적 배포·CI |

## PR #3

기준 브랜치 `feature/degree-rescue-academic-salvage`, HEAD [`dbf36c8`](https://github.com/ot4562-glitch/Hanmo_develop/commit/dbf36c87cee873e0ba970aa7762333af7179a08f). [PR 비교](https://github.com/ot4562-glitch/Hanmo_develop/pull/3/files) · [성공한 검사 1](https://github.com/ot4562-glitch/Hanmo_develop/actions/runs/44296093071/job/134773374131) · [성공한 검사 2](https://github.com/ot4562-glitch/Hanmo_develop/actions/runs/44296093074/job/134773373888)

| 경로 | 선별 | 근거 |
|---|---|---|
| `degree-rescue/README.md` | 채택 후 수정 | 개발 참고·출처 기록. 배포 파일 목록에서 제외 |
| `degree-rescue/docs/ACADEMIC_ASSET_AUDIT.md` | 채택 후 수정 | 개발 참고·출처 기록. 배포 파일 목록에서 제외 |
| `degree-rescue/docs/ACADEMIC_SOURCE_HANDOFF.md` | 채택 | 개발 참고·출처 기록. 배포 파일 목록에서 제외 |
| `degree-rescue/package.json` | 채택 후 수정 | 빌드·원본 보호·정적 배포·CI |
| `degree-rescue/reference/hufs-academic-source-candidates.json` | 채택 | 개발 참고·출처 기록. 배포 파일 목록에서 제외 |
| `degree-rescue/src/contracts/campus-assist/index.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/campus-assist/activities.kst-boundary.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/campus-assist/activities.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/campus-assist/activities.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/campus-assist/activity-intake.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/campus-assist/activity-intake.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/campus-assist/exchange.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/campus-assist/exchange.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/campus-assist/faq-eval.fixtures.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/campus-assist/faq-guard.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/campus-assist/faq-guard.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/campus-assist/faq-privacy.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/campus-assist/faq-review.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/campus-assist/faq-search.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/campus-assist/faq-search.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/campus-assist/faq-text.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/campus-assist/faq.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/campus-assist/faq.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |

## PR #4

기준 브랜치 `feature/degree-rescue-academic-complete-archive`, HEAD [`637f0d2`](https://github.com/ot4562-glitch/Hanmo_develop/commit/637f0d291a4bfb05bd91d640e3b25b8fa4b38b5a). [PR 비교](https://github.com/ot4562-glitch/Hanmo_develop/pull/4/files) · [성공한 검사 1](https://github.com/ot4562-glitch/Hanmo_develop/actions/runs/44296100068/job/134773399996) · [성공한 검사 2](https://github.com/ot4562-glitch/Hanmo_develop/actions/runs/44296100070/job/134773399923)

| 경로 | 선별 | 근거 |
|---|---|---|
| `degree-rescue/README.md` | 채택 후 수정 | 개발 참고·출처 기록. 배포 파일 목록에서 제외 |
| `degree-rescue/academic-timeline.css` | 채택 | 독립 학업 화면 |
| `degree-rescue/academic-timeline.html` | 채택 | 독립 학업 화면 |
| `degree-rescue/data/academic-notices-reference.json` | 채택 | 학사공지 제목·게시일 참고 자료 |
| `degree-rescue/docs/ACADEMIC_GRADUATION_RELATIONSHIPS.md` | 채택 | 개발 참고·출처 기록. 배포 파일 목록에서 제외 |
| `degree-rescue/docs/ACADEMIC_SOURCE_HANDOFF.md` | 채택 후 수정 | 개발 참고·출처 기록. 배포 파일 목록에서 제외 |
| `degree-rescue/index.html` | 채택 후 수정 | 독립 학업 화면 |
| `degree-rescue/package.json` | 채택 후 수정 | 빌드·원본 보호·정적 배포·CI |
| `degree-rescue/scripts/stage-static.mjs` | 채택 후 수정 | 빌드·원본 보호·정적 배포·CI |
| `degree-rescue/src/app/academic-timeline.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academic-schedule.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academic-schedule.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |

## PR #5

기준 브랜치 `feature/degree-rescue-graduation-academic-timeline`, HEAD [`e83f3eb`](https://github.com/ot4562-glitch/Hanmo_develop/commit/e83f3eb3f29b3159bb28bbf60404afa9f7b733a7). [PR 비교](https://github.com/ot4562-glitch/Hanmo_develop/pull/5/files) · [성공한 검사 1](https://github.com/ot4562-glitch/Hanmo_develop/actions/runs/44305896768/job/134807255443) · [성공한 검사 2](https://github.com/ot4562-glitch/Hanmo_develop/actions/runs/44305897118/job/134807256274)

| 경로 | 선별 | 근거 |
|---|---|---|
| `degree-rescue/README.md` | 채택 후 수정 | 개발 참고·출처 기록. 배포 파일 목록에서 제외 |
| `degree-rescue/academic-timeline.css` | 채택 후 수정 | 독립 학업 화면 |
| `degree-rescue/academic-timeline.html` | 채택 후 수정 | 독립 학업 화면 |
| `degree-rescue/catalog.css` | 채택 후 수정 | 독립 학업 화면 |
| `degree-rescue/catalog.html` | 채택 후 수정 | 독립 학업 화면 |
| `degree-rescue/docs/ACADEMIC_ASSET_AUDIT.md` | 채택 후 수정 | 개발 참고·출처 기록. 배포 파일 목록에서 제외 |
| `degree-rescue/docs/ACADEMIC_SOURCE_HANDOFF.md` | 채택 후 수정 | 개발 참고·출처 기록. 배포 파일 목록에서 제외 |
| `degree-rescue/docs/ARCHITECTURE_ALIGNMENT.md` | 채택 | 개발 참고·출처 기록. 배포 파일 목록에서 제외 |
| `degree-rescue/docs/MERGE_READINESS.md` | 채택 | 개발 참고·출처 기록. 배포 파일 목록에서 제외 |
| `degree-rescue/index.html` | 채택 후 수정 | 독립 학업 화면 |
| `degree-rescue/package.json` | 채택 후 수정 | 빌드·원본 보호·정적 배포·CI |
| `degree-rescue/scripts/check-static-pages.mjs` | 채택 | 빌드·원본 보호·정적 배포·CI |
| `degree-rescue/src/app/academic-timeline.ts` | 채택 후 수정 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/app/main.ts` | 채택 후 수정 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academic-display.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academic-display.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academic-schedule.test.ts` | 채택 후 수정 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/academic-schedule.ts` | 채택 후 수정 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/important-notices.test.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/src/core/important-notices.ts` | 채택 | 학업 코어·화면 연결·검증 자산 |
| `degree-rescue/style.css` | 채택 후 수정 | 독립 학업 화면 |
