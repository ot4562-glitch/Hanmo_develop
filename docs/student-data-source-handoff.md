# 한모 학생 화면 · 승인 데이터 연결 및 장애 처리 인계

현행 상태: 과거 참고 공지 제목 JSON과 합성 강좌/개설 이력은 삭제했습니다. 공개 설정 파일 data/academic-source-config.json 은 schemaVersion 1, mode disabled로 시작합니다.

## Supabase Free 실제 연결 전제

운영자 임창용 님이 별도로 프로젝트를 생성하고 학교 자료 이용권, 원문/판본 독립 검수, 승인 출처 관리와 RLS 실제 조회 테스트를 거쳐야 합니다. PR #93의 SQL 파일은 별도 검토·적용 단계이며 현재 프로젝트가 연결되었다는 의미가 아닙니다.

공개 연결 설정을 활성화할 때 필요한 필드는 schemaVersion=1, mode=supabase, projectUrl=https://실제-프로젝트.supabase.co, publishableKey=sb_publishable_공개키 입니다. URL과 공개용 키만 저장할 수 있으며 secret/service_role/DB 암호·학생 성적·개인 계획은 저장소/브라우저에 넣거나 전송하지 않습니다.

브라우저는 공개 Data API의 public.hanmo_public_snapshots 테이블에서 is_active=true 행 최대 2개만 읽고, snapshot_id, schema_version, manifest_sha256, source_checked_at, published_at, expires_at, revoked_at, is_active, payload 메타데이터를 확인합니다. RLS가 존재해도 Data API 공개 설정과 익명 SELECT 권한을 별도로 검증해야 합니다. 클라이언트의 해시 형식/기한 검증은 독립 해시 재계산·검수·승인·RLS의 대체물이 아닙니다.

## 공개 payload v1 (승인·정규화 후 발행 계약)

payload는 notices, offerings, faq 세 배열이어야 합니다. 공지에는 id, title, type, 학교 공식 HTTPS sourceUrl, 선택 publishedDate(YYYY-MM-DD)가 필요합니다. source.url/source.publishedDate도 지원합니다. 강의에는 courseId(또는 rawCode), title, term(또는 academicTerm), campus(SEOUL 또는 GLOBAL), 학교 공식 HTTPS sourceUrl, 선택 credits 및 instructor가 필요합니다. FAQ는 승인 인덱스 검증 이후 별도로 UI에 노출합니다. 필드 계약에 맞지 않는 레코드가 섞이면 전체 결과를 INVALID로 보류합니다.

## 학생 화면 구분

| API 상태 | 화면 |
|---|---|
| NOT_CONNECTED | 공개 설정 전. 학교 자료가 아직 연결되지 않았다고 알림 |
| EMPTY | 연결되었으나 승인된 공개 행·자료 없음. 미개설/마감 없음으로 추정 금지 |
| OFFLINE | 네트워크/권한/요청 장애. 연결 재시도·공식 학교 페이지로 안내 |
| INVALID | 철회/만료/구조·출처 검증 실패. 위험 자료는 표시하지 않음 |
| READY | 유효한 공개판본의 공지·강좌만 표시. 실제 개인 적용과 미래 개설 확정은 원문 확인 |

오류 시 과거 미검수 정적 자료를 자동으로 사용하지 않습니다. 학생의 브라우저 로컬 내정보·학점 입력과 기존 BASIC/TIME/SELECT는 오류 상황에도 독립적으로 작동해야 합니다.

## 검증

node --test tests/academic-data-source.test.cjs
npm run check && npm run check:legacy
실운영 전에 API 실응답, 권한/RLS, 만료·철회, 빈 응답, 403/5xx/오프라인, PC 브라우저 접근성, 페이지 하위 경로·재시도, 원본 SELECT 대기열·Enter 연타 회귀를 추가 확인합니다.

관련 이슈: #64 스키마/RLS, #65 공개 읽기, #66 승인 파이프라인, #67 실환경 인수, #71 원본 회귀.

아직 실제 프로젝트 접속·학사 데이터 인입·검수 승인은 수행하지 않았습니다.