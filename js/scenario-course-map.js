/*
 * #62 명시적 가상 과목 ↔ 강좌·분반 ID 어댑터 (읽기 전용).
 * 이 모듈은 원본 수강신청, 실제 학교 서버, 이수 원장, 브라우저 저장소에 접근하지 않는다.
 * MAPPED는 제공된 정적 변환표에서 일치 항목을 찾았다는 뜻일 뿐,
 * 학교의 공식 확인·강좌 개설·학점 인정 또는 입력된 승인 문자열의 검증을 뜻하지 않는다.
 * 변환표에 대한 독립 검수와 공급 경계는 호출자가 별도로 보장해야 한다.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HanmoScenarioCourseMap = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const ID = /^[A-Za-z0-9_.:-]{1,128}$/;
  const SYNTHETIC_ID = /^SYN-[A-Za-z0-9_-]{1,64}$/;
  const TERM = /^(?:19|20|21)\d{2}-(?:1|2|S|W)$/;
  const CAMPUSES = new Set(['SEOUL','GLOBAL']);

  function token(value, label) {
    if (typeof value !== 'string' || !ID.test(value)) {
      throw new TypeError(label + ' must be a non-empty safe identifier');
    }
    return value;
  }
  function syntheticId(value) {
    if (typeof value !== 'string' || !SYNTHETIC_ID.test(value)) {
      throw new TypeError('Synthetic ID must have an explicit SYN- prefix');
    }
    return value;
  }
  function campus(value) {
    if (!CAMPUSES.has(value)) throw new TypeError('Unsupported campus');
    return value;
  }
  function term(value) {
    if (typeof value !== 'string' || !TERM.test(value)) {
      throw new TypeError('Invalid academic term');
    }
    return value;
  }
  function readRow(raw, snapshotId) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new TypeError('Mapping row must be an object');
    }
    if (raw.catalogSnapshotId !== snapshotId) {
      throw new TypeError('Mapping row does not belong to the reviewed snapshot');
    }
    return Object.freeze({
      syntheticCourseId: syntheticId(raw.syntheticCourseId),
      courseId: token(raw.courseId, 'courseId'),
      sectionId: token(raw.sectionId, 'sectionId'),
      term: term(raw.term),
      campus: campus(raw.campus),
      catalogSnapshotId: snapshotId,
      sourceRef: token(raw.sourceRef, 'sourceRef'),
    });
  }
  /**
   * Only call with publisher-controlled, independently reviewed static rows;
   * never pass arbitrary browser JSON/user-provided source flags to this gate.
   * The returned adapter is not an institutional authorization verifier.
   */
  function createScenarioCourseMap(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1) {
      throw new TypeError('Unsupported mapping schema');
    }
    const catalogSnapshotId = token(raw.catalogSnapshotId, 'catalogSnapshotId');
    if (!Array.isArray(raw.rows) || raw.rows.length > 1000) {
      throw new TypeError('Expected at most 1000 static mapping rows');
    }
    const index = new Map();
    for (const rawRow of raw.rows) {
      const row = readRow(rawRow, catalogSnapshotId);
      if (index.has(row.syntheticCourseId)) {
        throw new TypeError('Ambiguous synthetic course mapping');
      }
      index.set(row.syntheticCourseId, row);
    }
    function resolve(query) {
      if (!query || typeof query !== 'object' || Array.isArray(query)) {
        throw new TypeError('Mapping query must be an object');
      }
      const id = syntheticId(query.syntheticCourseId);
      const base = {version: 1, syntheticCourseId: id};
      const row = index.get(id);
      if (!row) return Object.freeze({...base, mappingStatus: 'UNMAPPED'});
      const context = query.context;
      if (!context || typeof context !== 'object' || Array.isArray(context)) {
        return Object.freeze({...base, mappingStatus: 'STALE', reason: 'MISSING_CONTEXT'});
      }
      if (context.catalogSnapshotId !== row.catalogSnapshotId) {
        return Object.freeze({...base, mappingStatus: 'STALE', reason: 'CATALOG_SNAPSHOT_CHANGED'});
      }
      if (context.term !== row.term) {
        return Object.freeze({...base, mappingStatus: 'STALE', reason: 'TERM_MISMATCH'});
      }
      if (context.campus !== row.campus) {
        return Object.freeze({...base, mappingStatus: 'STALE', reason: 'CAMPUS_MISMATCH'});
      }
      return Object.freeze({...base, mappingStatus: 'MAPPED',
        courseId: row.courseId, sectionId: row.sectionId,
        term: row.term, campus: row.campus,
        catalogSnapshotId: row.catalogSnapshotId, sourceRef: row.sourceRef});
    }
    return Object.freeze({version: 1, catalogSnapshotId, resolve});
  }
  return Object.freeze({createScenarioCourseMap});
});
