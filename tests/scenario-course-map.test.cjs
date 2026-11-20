'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createScenarioCourseMap}=require('../js/scenario-course-map.js');

const fixed=()=>({
  version:1,catalogSnapshotId:'SYN-CATALOG-2026-2',rows:[{
    syntheticCourseId:'SYN-COURSE-1',courseId:'H12345678',
    sectionId:'01',term:'2026-2',campus:'SEOUL',
    catalogSnapshotId:'SYN-CATALOG-2026-2',sourceRef:'SYN-REVIEW-FIXTURE',
  }],
});
const context={
  catalogSnapshotId:'SYN-CATALOG-2026-2',term:'2026-2',campus:'SEOUL',
};

test('maps only one explicit synthetic ID to a section in an exact scoped snapshot',()=>{
  const adapter=createScenarioCourseMap(fixed());
  const mapped=adapter.resolve({syntheticCourseId:'SYN-COURSE-1',context});
  assert.deepEqual(mapped,{
    version:1,syntheticCourseId:'SYN-COURSE-1',mappingStatus:'MAPPED',
    courseId:'H12345678',sectionId:'01',term:'2026-2',campus:'SEOUL',
    catalogSnapshotId:'SYN-CATALOG-2026-2',sourceRef:'SYN-REVIEW-FIXTURE',
  });
  assert.equal(Object.isFrozen(mapped),true);
  assert.equal(Object.isFrozen(adapter),true);
});
test('unknown virtual course is UNMAPPED without guessing by course name or code',()=>{
  const adapter=createScenarioCourseMap(fixed());
  assert.deepEqual(adapter.resolve({syntheticCourseId:'SYN-OTHER',context}),{
    version:1,syntheticCourseId:'SYN-OTHER',mappingStatus:'UNMAPPED',
  });
  assert.throws(()=>adapter.resolve({syntheticCourseId:'H12345678',context}),/SYN-/);
});
test('changed catalog, term, or campus is STALE and never leaks former section',()=>{
  const adapter=createScenarioCourseMap(fixed());
  const cases=[
    [undefined,'MISSING_CONTEXT'],
    [{...context,catalogSnapshotId:'SYN-CATALOG-2027-1'},'CATALOG_SNAPSHOT_CHANGED'],
    [{...context,term:'2027-1'},'TERM_MISMATCH'],
    [{...context,campus:'GLOBAL'},'CAMPUS_MISMATCH'],
  ];
  for(const [scope,reason] of cases){
    const result=adapter.resolve({syntheticCourseId:'SYN-COURSE-1',context:scope});
    assert.equal(result.mappingStatus,'STALE');
    assert.equal(result.reason,reason);
    assert.equal('courseId' in result,false);
    assert.equal('sectionId' in result,false);
  }
});
test('duplicate and mixed-revision mapping records fail closed',()=>{
  const data=fixed();
  assert.throws(()=>createScenarioCourseMap({...data,rows:[...data.rows,...data.rows]}),/Ambiguous/);
  assert.throws(()=>createScenarioCourseMap({...data,rows:[{
    ...data.rows[0],catalogSnapshotId:'SYN-OTHER-SNAPSHOT',
  }]}),/reviewed snapshot/);
  assert.throws(()=>createScenarioCourseMap({...data,rows:[{
    ...data.rows[0],sourceRef:'<unreviewed>',
  }]}),/sourceRef/);
});
test('source is copied into a private read-only index before browser input can mutate it',()=>{
  const rows=fixed();
  const adapter=createScenarioCourseMap(rows);
  rows.rows[0].courseId='H99999999';
  rows.rows.push({...rows.rows[0],syntheticCourseId:'SYN-LATE'});
  assert.equal(adapter.resolve({syntheticCourseId:'SYN-COURSE-1',context}).courseId,'H12345678');
  assert.equal(adapter.resolve({syntheticCourseId:'SYN-LATE',context}).mappingStatus,'UNMAPPED');
});
test('mappings reject malformed IDs, sections, campuses, terms, and excessive rows',()=>{
  for(const [field,value] of [
    ['syntheticCourseId','ECON101'],['courseId','<script>'],['sectionId',''],
    ['campus','UNKNOWN'],['term','2026-4'],
  ]){
    const config=fixed();
    config.rows[0][field]=value;
    assert.throws(()=>createScenarioCourseMap(config),field);
  }
  assert.throws(()=>createScenarioCourseMap({...fixed(),version:2}),/schema/);
  assert.throws(()=>createScenarioCourseMap({...fixed(),rows:new Array(1001).fill(fixed().rows[0])}),/1000/);
});
test('adapter never persists a synthetic result or calls a network/client API',()=>{
  const adapter=createScenarioCourseMap(fixed());
  const mapped=adapter.resolve({syntheticCourseId:'SYN-COURSE-1',context});
  assert.equal(mapped.mappingStatus,'MAPPED');
  assert.equal('studentId' in mapped,false);
  assert.equal('enrollmentState' in mapped,false);
  assert.equal('earnedCredits' in mapped,false);
});
