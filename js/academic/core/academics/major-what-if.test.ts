import {describe, expect, it} from 'vitest';
import {OwnerMajorWhatIfReadySchema, OwnerMajorWhatIfBlockedSchema} from '../../contracts/index.js';
import type {DoubleMajorAttempt, MajorRulePack, OverlapRule} from './double-major.js';
import {buildMajorWhatIf, MAJOR_WHAT_IF_CORE_VERSION, type MajorWhatIfRequest, type MajorWhatIfResult, type ProgramEnrollment,
  type ProgramOffer, type WhatIfProjection, type WhatIfScenario} from './major-what-if.js';

/**
 * 합성 데이터만 사용하며 1단위는 0.5학점, 3학점은 6단위다.
 * 기대 수치는 테스트 대상 코드의 결과가 아니라 성적표와 규칙집에서 사람이 직접 계산한 상수다.
 * 취득 과목에는 A1·A2·S1·B1·C1·G1이 있으며 영역 배정은 전공 규칙집에 따라 달라진다.
 */
const AS_OF = '2026-11-01T00:00:00.000Z';
const course = (canonicalCourseId:string, over:Partial<DoubleMajorAttempt> = {}):DoubleMajorAttempt => ({
  attemptToken:`${canonicalCourseId}-T`, canonicalCourseId, creditUnits:6, ledger:'EARNED', recognition:'RECOGNIZED', term:'2025-2', ...over,
});
const ATTEMPTS:DoubleMajorAttempt[] = [
  course('SYN-A1'), course('SYN-A2'), course('SYN-S1'), course('SYN-B1'), course('SYN-C1'), course('SYN-G1'),
  course('SYN-B2', {ledger:'IN_PROGRESS', term:'2026-2'}),
];
const total = (id:string) => ({id, kind:'CREDIT_TOTAL' as const, requiredCreditUnits:260, evidenceRefs:['EV-SYN-TOTAL']});
const A_AREAS = {'SYN-A1':['SYN-AREA-A'], 'SYN-A2':['SYN-AREA-A'], 'SYN-S1':['SYN-AREA-A']};
const primaryA = (version:string, majorId:string, required:number, state:MajorRulePack['rulePackState'] = 'APPROVED'):MajorRulePack => ({
  rulePackVersion:version, rulePackState:state, courseAreas:A_AREAS,
  requirements:[total('SYN-A-TOTAL'),
    {id:majorId, kind:'CATEGORY_MINIMUM', areaId:'SYN-AREA-A', requiredCreditUnits:required, evidenceRefs:['EV-SYN-A']},
    {id:'SYN-A-REQ', kind:'REQUIRED_COURSE', canonicalCourseId:'SYN-A1', evidenceRefs:['EV-SYN-A']}],
});
const doubleB = (state:MajorRulePack['rulePackState'] = 'APPROVED', overlapRule?:OverlapRule):MajorRulePack & {overlapRule?:OverlapRule} => ({
  rulePackVersion:'SYN-B-DM-1', rulePackState:state,
  courseAreas:{'SYN-B1':['SYN-AREA-B'], 'SYN-B2':['SYN-AREA-B'], 'SYN-S1':['SYN-AREA-B']},
  requirements:[
    {id:'SYN-B-MAJOR', kind:'CATEGORY_MINIMUM', areaId:'SYN-AREA-B', requiredCreditUnits:12, evidenceRefs:['EV-SYN-B']},
    {id:'SYN-B-REQ', kind:'REQUIRED_COURSE', canonicalCourseId:'SYN-B2', evidenceRefs:['EV-SYN-B']}],
  ...(overlapRule ? {overlapRule} : {}),
});
const packC = (version:string, prefix:string, state:MajorRulePack['rulePackState'] = 'APPROVED'):MajorRulePack => ({
  rulePackVersion:version, rulePackState:state, courseAreas:{'SYN-C1':['SYN-AREA-C']},
  requirements:[
    {id:`${prefix}-MAJOR`, kind:'CATEGORY_MINIMUM', areaId:'SYN-AREA-C', requiredCreditUnits:6, evidenceRefs:['EV-SYN-C']},
    {id:`${prefix}-REQ`, kind:'REQUIRED_COURSE', canonicalCourseId:'SYN-C2', evidenceRefs:['EV-SYN-C']}],
});
const primaryD:MajorRulePack = {
  rulePackVersion:'SYN-D-DM-1', rulePackState:'APPROVED', courseAreas:{},
  requirements:[total('SYN-D-TOTAL'),
    {id:'SYN-D-MAJOR', kind:'CATEGORY_MINIMUM', areaId:'SYN-AREA-D', requiredCreditUnits:6, evidenceRefs:['EV-SYN-D']}],
};

const CATALOG:ProgramOffer[] = [
  {role:'PRIMARY_MAJOR', programId:'SYN-MAJ-A', degreePath:'DOUBLE_MAJOR', pack:primaryA('SYN-A-DM-1', 'SYN-A-MAJOR-DM', 18)},
  {role:'PRIMARY_MAJOR', programId:'SYN-MAJ-A', degreePath:'MAJOR_DEEPENING', pack:primaryA('SYN-A-MD-1', 'SYN-A-MAJOR-MD', 36)},
  {role:'PRIMARY_MAJOR', programId:'SYN-MAJ-A', degreePath:'MAJOR_DEEPENING_MINOR', pack:primaryA('SYN-A-MM-1', 'SYN-A-MAJOR-MM', 30)},
  {role:'DOUBLE_MAJOR', programId:'SYN-MAJ-B', pack:doubleB()},
  {role:'DOUBLE_MAJOR', programId:'SYN-MAJ-C', pack:packC('SYN-C-DM-1', 'SYN-C')},
  {role:'MINOR', programId:'SYN-MAJ-C', pack:packC('SYN-C-MI-1', 'SYN-CM')},
  {role:'PRIMARY_MAJOR', programId:'SYN-MAJ-D', degreePath:'DOUBLE_MAJOR', pack:primaryD},
];
const A_WITH_B:ProgramEnrollment = {primaryProgramId:'SYN-MAJ-A', secondary:{role:'DOUBLE_MAJOR', programId:'SYN-MAJ-B'}};
const A_ONLY:ProgramEnrollment = {primaryProgramId:'SYN-MAJ-A'};
const run = (scenario:WhatIfScenario, over:Partial<MajorWhatIfRequest> = {}):MajorWhatIfResult =>
  buildMajorWhatIf({asOf:AS_OF, attempts:ATTEMPTS, current:A_WITH_B, scenario, programs:CATALOG, ...over});
const ready = (result:MajorWhatIfResult) => {
  if (result.state !== 'READY') throw new Error(`expected READY, got ${JSON.stringify(result)}`);
  return result;
};
const replace = (programs:ProgramOffer[], version:string, pack:MajorRulePack):ProgramOffer[] =>
  programs.map(offer => (offer.pack.rulePackVersion === version ? {...offer, pack} as ProgramOffer : offer));

describe('buildMajorWhatIf (#11, #82)', () => {
  it('changes the double major: hand-checked projections and diff', () => {
    const result = ready(run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}));
    expect(result.coreVersion).toBe(MAJOR_WHAT_IF_CORE_VERSION);
    // 현재 A+B에서 S1은 두 전공에 겹치지만 중복 인정 규칙이 없어 관련 요건을 MISSING으로 보류한다.
    // S1 제외 시 A는 18단위 중 12단위, B는 12단위 중 6단위를 취득해 각각 6단위 부족하다.
    expect(result.current).toEqual({
      role:'CURRENT', asOf:AS_OF, enrollment:A_WITH_B, degreePath:'DOUBLE_MAJOR', rulePackVersions:['SYN-A-DM-1', 'SYN-B-DM-1'],
      earnedCreditUnits:36, remainingCreditUnits:224,
      requirements:[
        {requirementId:'SYN-A-TOTAL', state:'MISSING', missingCreditUnits:224},
        {requirementId:'SYN-A-MAJOR-DM', state:'MISSING', missingCreditUnits:6},
        {requirementId:'SYN-A-REQ', state:'SATISFIED'},
        {requirementId:'SYN-B-MAJOR', state:'MISSING', missingCreditUnits:6},
        {requirementId:'SYN-B-REQ', state:'MISSING'},
      ],
      reviewRequirementIds:['SYN-A-MAJOR-DM', 'SYN-B-MAJOR'],
    });
    // B 대신 C를 고르면 S1을 공유하지 않으므로 A가 18/18을 충족한다. C1은 C의 6단위를 충족하고 C2는 미이수다.
    expect(result.hypothetical).toEqual({
      role:'HYPOTHETICAL', asOf:AS_OF, enrollment:{primaryProgramId:'SYN-MAJ-A', secondary:{role:'DOUBLE_MAJOR', programId:'SYN-MAJ-C'}},
      degreePath:'DOUBLE_MAJOR', rulePackVersions:['SYN-A-DM-1', 'SYN-C-DM-1'], earnedCreditUnits:36, remainingCreditUnits:224,
      requirements:[
        {requirementId:'SYN-A-TOTAL', state:'MISSING', missingCreditUnits:224},
        {requirementId:'SYN-A-MAJOR-DM', state:'SATISFIED'},
        {requirementId:'SYN-A-REQ', state:'SATISFIED'},
        {requirementId:'SYN-C-MAJOR', state:'SATISFIED'},
        {requirementId:'SYN-C-REQ', state:'MISSING'},
      ],
      reviewRequirementIds:[],
    });
    expect(result.delta).toEqual([
      {requirementId:'SYN-A-TOTAL', change:'UNCHANGED', evidenceRefs:['EV-SYN-TOTAL']},
      {requirementId:'SYN-A-MAJOR-DM', change:'PROGRESS_CHANGED', evidenceRefs:['EV-SYN-A']},
      {requirementId:'SYN-A-REQ', change:'UNCHANGED', evidenceRefs:['EV-SYN-A']},
      {requirementId:'SYN-B-MAJOR', change:'REMOVED_REQUIREMENT', evidenceRefs:['EV-SYN-B']},
      {requirementId:'SYN-B-REQ', change:'REMOVED_REQUIREMENT', evidenceRefs:['EV-SYN-B']},
      {requirementId:'SYN-C-MAJOR', change:'ALREADY_SATISFIED', evidenceRefs:['EV-SYN-C']},
      {requirementId:'SYN-C-REQ', change:'NEW_REQUIREMENT', evidenceRefs:['EV-SYN-C']},
    ]);
  });

  it('counts only earned credit: an in-progress required course stays MISSING', () => {
    const b = ready(run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'})).current.requirements.find(r => r.requirementId === 'SYN-B-REQ');
    expect(b).toEqual({requirementId:'SYN-B-REQ', state:'MISSING'});
  });

  it('an attempt the ledger set aside undecided flags every unmet row it could feed (review of #217)', () => {
    // C1이 인정 대기면 취득 총합은 30단위가 되고 230단위가 남는다.
    // C는 해당 영역 과목이 C1뿐이라 6단위 부족 상태를 검토 보류한다. A 영역은 A1·A2·S1로 18단위 충족한다.
    // 미이수 필수 과목 C2는 C1로 충족시킬 수 없다.
    const pendingC1 = ATTEMPTS.map(a => (a.canonicalCourseId === 'SYN-C1' ? {...a, recognition:'PENDING' as const} : a));
    const result = ready(run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}, {attempts:pendingC1}));
    expect(result.hypothetical.requirements).toEqual([
      {requirementId:'SYN-A-TOTAL', state:'MISSING', missingCreditUnits:230},
      {requirementId:'SYN-A-MAJOR-DM', state:'SATISFIED'},
      {requirementId:'SYN-A-REQ', state:'SATISFIED'},
      {requirementId:'SYN-C-MAJOR', state:'MISSING', missingCreditUnits:6},
      {requirementId:'SYN-C-REQ', state:'MISSING'},
    ]);
    expect(result.hypothetical.reviewRequirementIds).toEqual(['SYN-A-TOTAL', 'SYN-C-MAJOR']);
    // 현재 A+B에서는 C1이 어느 전공 영역에도 속하지 않아 전체 학점에만 보류 표시가 더해진다.
    expect(result.current.reviewRequirementIds).toEqual(['SYN-A-TOTAL', 'SYN-A-MAJOR-DM', 'SYN-B-MAJOR']);
    // 전공심화 A 단독은 A영역에서 18단위 부족하며 인정 대기 C1은 이를 채울 수 없다.
    const alone = ready(run({action:'REMOVE_DOUBLE_MAJOR'}, {attempts:pendingC1})).hypothetical;
    expect(alone.requirements.find(r => r.requirementId === 'SYN-A-MAJOR-MD')).toEqual({requirementId:'SYN-A-MAJOR-MD', state:'MISSING', missingCreditUnits:18});
    expect(alone.reviewRequirementIds).toEqual(['SYN-A-TOTAL']);
  });

  it('an undecided course flags the required-course and one-of rows that name it, and no others', () => {
    // F는 C1을 필수와 택일 과목으로 직접 참조하므로 인정 대기 시 둘 다 미충족이지만 보류 표시한다.
    // C1과 무관한 택일 G1/G2는 둘 다 미이수이므로 확정 부족이다.
    const packF:MajorRulePack = {rulePackVersion:'SYN-F-DM-1', rulePackState:'APPROVED', courseAreas:{},
      requirements:[
        {id:'SYN-F-REQ-C1', kind:'REQUIRED_COURSE', canonicalCourseId:'SYN-C1', evidenceRefs:['EV-SYN-F']},
        {id:'SYN-F-ONE-OF-C1', kind:'K_OF_N', courseIds:['SYN-C1', 'SYN-F2'], k:1, evidenceRefs:['EV-SYN-F']},
        {id:'SYN-F-ONE-OF-OTHER', kind:'K_OF_N', courseIds:['SYN-G1', 'SYN-G2'], k:2, evidenceRefs:['EV-SYN-F']}]};
    const pendingC1 = ATTEMPTS.map(a => (a.canonicalCourseId === 'SYN-C1' ? {...a, recognition:'PENDING' as const} : a));
    const h = ready(run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-F'},
      {attempts:pendingC1, programs:[...CATALOG, {role:'DOUBLE_MAJOR', programId:'SYN-MAJ-F', pack:packF}]})).hypothetical;
    expect(h.requirements.filter(r => r.requirementId.startsWith('SYN-F')).map(r => r.state)).toEqual(['MISSING', 'MISSING', 'MISSING']);
    expect(h.reviewRequirementIds).toEqual(['SYN-A-TOTAL', 'SYN-F-REQ-C1', 'SYN-F-ONE-OF-C1']);
  });

  it.each([
    ['pending recognition', {recognition:'PENDING' as const}, true],
    ['a term not ended by asOf', {term:'2026-2'}, true],
    ['an official exclusion', {recognition:'EXCLUDED' as const}, false],
  ] as const)('composite rows preserve review holds for %s only where the course can contribute', (_label, change, held) => {
    const packF:MajorRulePack = {rulePackVersion:'SYN-F-DM-1', rulePackState:'APPROVED',
      courseAreas:{'SYN-C1':['SYN-AREA-C'], 'SYN-G1':['SYN-AREA-G']},
      requirements:[
        {id:'SYN-F-SPREAD-C1', kind:'AREA_SPREAD', areaIds:['SYN-AREA-C', 'SYN-AREA-G'],
          minAreas:2, requiredCreditUnits:12, evidenceRefs:['EV-SYN-F']},
        {id:'SYN-F-GROUP-C1', kind:'GROUP_CHOICE', groups:[['SYN-C1', 'SYN-G1'], ['SYN-F2']],
          k:1, evidenceRefs:['EV-SYN-F']},
        {id:'SYN-F-SPREAD-OTHER', kind:'AREA_SPREAD', areaIds:['SYN-AREA-F', 'SYN-AREA-H'],
          minAreas:1, requiredCreditUnits:6, evidenceRefs:['EV-SYN-F']},
        {id:'SYN-F-GROUP-OTHER', kind:'GROUP_CHOICE', groups:[['SYN-F2', 'SYN-F3'], ['SYN-H1']],
          k:1, evidenceRefs:['EV-SYN-F']},
      ]};
    const attempts = ATTEMPTS.map(a => (a.canonicalCourseId === 'SYN-C1' ? {...a, ...change} : a));
    const result = ready(run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-F'},
      {attempts, programs:[...CATALOG, {role:'DOUBLE_MAJOR', programId:'SYN-MAJ-F', pack:packF}]}));
    const h = result.hypothetical;
    expect(h.requirements.filter(r => r.requirementId.startsWith('SYN-F')).map(r => r.state))
      .toEqual(['MISSING', 'MISSING', 'MISSING', 'MISSING']);
    expect(h.reviewRequirementIds).toEqual(held ? ['SYN-A-TOTAL', 'SYN-F-SPREAD-C1', 'SYN-F-GROUP-C1'] : []);
    // C1이 미확정 또는 제외된 동안에는 변경 전후 어느 쪽에도 취득 학점을 더하지 않는다.
    expect([result.current.earnedCreditUnits, h.earnedCreditUnits]).toEqual([30, 30]);
    expect(h.remainingCreditUnits).toBe(230);
  });

  it('a term not ended by asOf and an unapproved retake are undecided too; settled exclusions flag nothing', () => {
    const scenario:WhatIfScenario = {action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'};
    // A2가 EARNED로 표시돼도 2026-11-01에는 2026-2가 끝나지 않았으므로 A영역은 A1+S1의 12/18만 취득했다.
    const unended = ATTEMPTS.map(a => (a.canonicalCourseId === 'SYN-A2' ? {...a, term:'2026-2'} : a));
    const u = ready(run(scenario, {attempts:unended})).hypothetical;
    expect(u.requirements.find(r => r.requirementId === 'SYN-A-MAJOR-DM')).toEqual({requirementId:'SYN-A-MAJOR-DM', state:'MISSING', missingCreditUnits:6});
    expect(u.reviewRequirementIds).toEqual(['SYN-A-TOTAL', 'SYN-A-MAJOR-DM']);
    // 승인 없는 A1 재수강은 보류하지만 이전 A1은 계속 인정하므로 A영역은 충족된다. 미충족 총학점만 검토 대상으로 남긴다.
    const retake = [...ATTEMPTS, course('SYN-A1', {attemptToken:'SYN-A1-RETAKE', term:'2026-1', supersedesAttemptToken:'SYN-A1-T'})];
    const r = ready(run(scenario, {attempts:retake})).hypothetical;
    expect(r.requirements.filter(x => x.state === 'SATISFIED').map(x => x.requirementId)).toEqual(['SYN-A-MAJOR-DM', 'SYN-A-REQ', 'SYN-C-MAJOR']);
    expect(r.reviewRequirementIds).toEqual(['SYN-A-TOTAL']);
    // 공식 제외는 확정된 상태이므로 C 영역은 단순 미충족으로 표시하고 추가 보류 표시가 없다.
    const excluded = ATTEMPTS.map(a => (a.canonicalCourseId === 'SYN-C1' ? {...a, recognition:'EXCLUDED' as const} : a));
    const e = ready(run(scenario, {attempts:excluded})).hypothetical;
    expect(e.requirements.find(x => x.requirementId === 'SYN-C-MAJOR')).toEqual({requirementId:'SYN-C-MAJOR', state:'MISSING', missingCreditUnits:6});
    expect(e.reviewRequirementIds).toEqual([]);
    // 같은 과목의 진행 중·취득 기록 중복은 기존 규칙으로 확정 처리하며 하나만 세고 보류하지 않는다.
    const duplicate = [...ATTEMPTS, course('SYN-C1', {attemptToken:'SYN-C1-AGAIN', ledger:'IN_PROGRESS', term:'2026-2'})];
    expect(ready(run(scenario, {attempts:duplicate})).hypothetical.reviewRequirementIds).toEqual([]);
  });

  it('dropping the double major switches the primary to its 전공심화 pack', () => {
    const result = ready(run({action:'REMOVE_DOUBLE_MAJOR'}));
    expect(result.hypothetical.degreePath).toBe('ADVANCED_SINGLE');
    expect(result.hypothetical.rulePackVersions).toEqual(['SYN-A-MD-1']);
    // 전공심화는 A영역 36단위가 필요하고 A1·A2·S1은 18단위여서 18단위 부족하다. S1은 이제 공유 과목이 아니다.
    expect(result.hypothetical.requirements).toEqual([
      {requirementId:'SYN-A-TOTAL', state:'MISSING', missingCreditUnits:224},
      {requirementId:'SYN-A-MAJOR-MD', state:'MISSING', missingCreditUnits:18},
      {requirementId:'SYN-A-REQ', state:'SATISFIED'},
    ]);
    expect(result.delta.map(row => [row.requirementId, row.change])).toEqual([
      ['SYN-A-TOTAL', 'UNCHANGED'], ['SYN-A-MAJOR-DM', 'REMOVED_REQUIREMENT'], ['SYN-A-REQ', 'UNCHANGED'],
      ['SYN-B-MAJOR', 'REMOVED_REQUIREMENT'], ['SYN-B-REQ', 'REMOVED_REQUIREMENT'], ['SYN-A-MAJOR-MD', 'NEW_REQUIREMENT'],
    ]);
  });

  it('adding a double major or a minor uses the primary pack of the new degree path', () => {
    const asDouble = ready(run({action:'ADD_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}, {current:A_ONLY}));
    expect(asDouble.current.rulePackVersions).toEqual(['SYN-A-MD-1']);
    expect(asDouble.hypothetical.rulePackVersions).toEqual(['SYN-A-DM-1', 'SYN-C-DM-1']);
    const asMinor = ready(run({action:'ADD_MINOR', targetMajorId:'SYN-MAJ-C'}, {current:A_ONLY}));
    expect(asMinor.hypothetical.degreePath).toBe('ADVANCED_PLUS_MINOR');
    expect(asMinor.hypothetical.rulePackVersions).toEqual(['SYN-A-MM-1', 'SYN-C-MI-1']);
    // 전공심화+부전공은 A영역 30단위 중 18단위 취득으로 12단위 부족하고 C1은 부전공 요건을 충족한다.
    expect(asMinor.hypothetical.requirements).toEqual([
      {requirementId:'SYN-A-TOTAL', state:'MISSING', missingCreditUnits:224},
      {requirementId:'SYN-A-MAJOR-MM', state:'MISSING', missingCreditUnits:12},
      {requirementId:'SYN-A-REQ', state:'SATISFIED'},
      {requirementId:'SYN-CM-MAJOR', state:'SATISFIED'},
      {requirementId:'SYN-CM-REQ', state:'MISSING'},
    ]);
    const minorNow:ProgramEnrollment = {primaryProgramId:'SYN-MAJ-A', secondary:{role:'MINOR', programId:'SYN-MAJ-C'}};
    expect(ready(run({action:'REMOVE_MINOR'}, {current:minorNow})).hypothetical.rulePackVersions).toEqual(['SYN-A-MD-1']);
  });

  it('changing the primary major keeps the second program and its own pack', () => {
    const result = ready(run({action:'CHANGE_PRIMARY_MAJOR', targetMajorId:'SYN-MAJ-D'}));
    expect(result.hypothetical.rulePackVersions).toEqual(['SYN-D-DM-1', 'SYN-B-DM-1']);
    // D는 S1을 사용하지 않아 B 영역은 B1+S1로 12/12가 충족되고 중복 인정 문제도 없다.
    expect(result.hypothetical.requirements).toEqual([
      {requirementId:'SYN-D-TOTAL', state:'MISSING', missingCreditUnits:224},
      {requirementId:'SYN-D-MAJOR', state:'MISSING', missingCreditUnits:6},
      {requirementId:'SYN-B-MAJOR', state:'SATISFIED'},
      {requirementId:'SYN-B-REQ', state:'MISSING'},
    ]);
    expect(result.hypothetical.reviewRequirementIds).toEqual([]);
    expect(result.delta.find(row => row.requirementId === 'SYN-B-MAJOR')!.change).toBe('PROGRESS_CHANGED');
  });

  it('an approved overlap rule decides shared rows; one over its limit does not', () => {
    const covered = replace(CATALOG, 'SYN-B-DM-1', doubleB('APPROVED', {maxSharedCreditUnits:6, evidenceRefs:['EV-SYN-OVERLAP']}));
    const now = ready(run({action:'REMOVE_DOUBLE_MAJOR'}, {programs:covered})).current;
    expect(now.requirements.filter(r => r.state === 'SATISFIED').map(r => r.requirementId)).toEqual(['SYN-A-MAJOR-DM', 'SYN-A-REQ', 'SYN-B-MAJOR']);
    expect(now.reviewRequirementIds).toEqual([]);
    const over = replace(CATALOG, 'SYN-B-DM-1', doubleB('APPROVED', {maxSharedCreditUnits:0, evidenceRefs:['EV-SYN-OVERLAP']}));
    expect(ready(run({action:'REMOVE_DOUBLE_MAJOR'}, {programs:over})).current.reviewRequirementIds).toEqual(['SYN-A-MAJOR-DM', 'SYN-B-MAJOR']);
  });

  it('a non-credit check is MISSING and listed for review', () => {
    const withExam = replace(CATALOG, 'SYN-A-DM-1', {...primaryA('SYN-A-DM-1', 'SYN-A-MAJOR-DM', 18),
      requirements:[...primaryA('SYN-A-DM-1', 'SYN-A-MAJOR-DM', 18).requirements,
        {id:'SYN-A-EXAM', kind:'NON_CREDIT', criterionId:'SYN-EXAM', verificationMode:'OFFICIAL', evidenceRefs:['EV-SYN-A']}]});
    const now = ready(run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}, {programs:withExam})).current;
    expect(now.requirements.find(r => r.requirementId === 'SYN-A-EXAM')).toEqual({requirementId:'SYN-A-EXAM', state:'MISSING'});
    expect(now.reviewRequirementIds).toContain('SYN-A-EXAM');
  });

  it('blocks unapproved packs, naming only what is missing', () => {
    const draftTarget = replace(CATALOG, 'SYN-C-DM-1', packC('SYN-C-DM-1', 'SYN-C', 'DRAFT'));
    expect(run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}, {programs:draftTarget}))
      .toEqual({state:'BLOCKED_DEPENDENCY', asOf:AS_OF, scenario:{action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'},
        blockers:['RULEPACK_NOT_APPROVED'], coreVersion:MAJOR_WHAT_IF_CORE_VERSION});
    // 양쪽에서 공유하는 미승인 규칙집은 현재 상태 쪽에서만 문제로 기록한다.
    const draftPrimary = replace(CATALOG, 'SYN-A-DM-1', primaryA('SYN-A-DM-1', 'SYN-A-MAJOR-DM', 18, 'NEEDS_REVIEW'));
    expect(run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}, {programs:draftPrimary}))
      .toMatchObject({state:'BLOCKED_DEPENDENCY', blockers:['CURRENT_RULEPACK_NOT_APPROVED']});
    const both = replace(draftTarget, 'SYN-B-DM-1', doubleB('DRAFT'));
    expect(run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}, {programs:both}))
      .toMatchObject({blockers:['CURRENT_RULEPACK_NOT_APPROVED', 'RULEPACK_NOT_APPROVED']});
    const noCurrent = CATALOG.filter(offer => offer.pack.rulePackVersion !== 'SYN-B-DM-1');
    expect(run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}, {programs:noCurrent}))
      .toMatchObject({blockers:['CURRENT_RULEPACK_NOT_APPROVED']});
  });

  it('refuses changes that do not fit the current programs or that the catalog lacks', () => {
    const unavailable = (scenario:WhatIfScenario, current:ProgramEnrollment = A_WITH_B, programs = CATALOG) =>
      expect(run(scenario, {current, programs})).toMatchObject({state:'BLOCKED_DEPENDENCY', blockers:['TARGET_PROGRAM_UNAVAILABLE']});
    unavailable({action:'ADD_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'});
    unavailable({action:'ADD_MINOR', targetMajorId:'SYN-MAJ-C'});
    unavailable({action:'CHANGE_MINOR', targetMajorId:'SYN-MAJ-C'});
    unavailable({action:'REMOVE_MINOR'});
    unavailable({action:'REMOVE_DOUBLE_MAJOR'}, A_ONLY);
    unavailable({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-B'});
    unavailable({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-A'});
    unavailable({action:'CHANGE_PRIMARY_MAJOR', targetMajorId:'SYN-MAJ-B'});
    unavailable({action:'CHANGE_PRIMARY_MAJOR', targetMajorId:'SYN-MAJ-A'});
    unavailable({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-NOWHERE'});
    unavailable({action:'REMOVE_DOUBLE_MAJOR'}, A_WITH_B, CATALOG.filter(offer => offer.pack.rulePackVersion !== 'SYN-A-MD-1'));
    unavailable({action:'ADD_MINOR', targetMajorId:'SYN-MAJ-B'}, A_ONLY);
    const minorNow:ProgramEnrollment = {primaryProgramId:'SYN-MAJ-A', secondary:{role:'MINOR', programId:'SYN-MAJ-C'}};
    unavailable({action:'REMOVE_DOUBLE_MAJOR'}, minorNow);
    unavailable({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-B'}, minorNow);
  });

  it('a change can move a MISSING row by credits only: still MISSING, more credits short', () => {
    // E는 A1·A2를 E영역으로 사용하므로 A+E에서 두 과목은 미승인 공유 상태다.
    // A는 이들을 제외하면 S1만 남아 6/18(12 부족)이고 필수 A1도 보류한다.
    // E는 포함 시 12/6, 제외 시 0/6이다.
    const packE:MajorRulePack = {rulePackVersion:'SYN-E-DM-1', rulePackState:'APPROVED',
      courseAreas:{'SYN-A1':['SYN-AREA-E'], 'SYN-A2':['SYN-AREA-E']},
      requirements:[{id:'SYN-E-MAJOR', kind:'CATEGORY_MINIMUM', areaId:'SYN-AREA-E', requiredCreditUnits:6, evidenceRefs:['EV-SYN-E']}]};
    const result = ready(run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-E'},
      {programs:[...CATALOG, {role:'DOUBLE_MAJOR', programId:'SYN-MAJ-E', pack:packE}]}));
    expect(result.hypothetical.requirements).toEqual([
      {requirementId:'SYN-A-TOTAL', state:'MISSING', missingCreditUnits:224},
      {requirementId:'SYN-A-MAJOR-DM', state:'MISSING', missingCreditUnits:12},
      {requirementId:'SYN-A-REQ', state:'MISSING'},
      {requirementId:'SYN-E-MAJOR', state:'MISSING', missingCreditUnits:6},
    ]);
    expect(result.hypothetical.reviewRequirementIds).toEqual(['SYN-A-MAJOR-DM', 'SYN-A-REQ', 'SYN-E-MAJOR']);
    expect(result.delta.map(row => [row.requirementId, row.change])).toEqual([
      ['SYN-A-TOTAL', 'UNCHANGED'], ['SYN-A-MAJOR-DM', 'PROGRESS_CHANGED'], ['SYN-A-REQ', 'PROGRESS_CHANGED'],
      ['SYN-B-MAJOR', 'REMOVED_REQUIREMENT'], ['SYN-B-REQ', 'REMOVED_REQUIREMENT'], ['SYN-E-MAJOR', 'NEW_REQUIREMENT'],
    ]);
  });

  it('refuses malformed input instead of guessing', () => {
    expect(() => run({action:'ADD_DOUBLE_MAJOR'} as unknown as WhatIfScenario)).toThrow(/scenario/);
    expect(() => run({action:'REMOVE_DOUBLE_MAJOR'}, {programs:[...CATALOG, CATALOG[3]!]})).toThrow(/more than once/);
    const clash = replace(CATALOG, 'SYN-C-DM-1', {...packC('SYN-C-DM-1', 'SYN-C'),
      requirements:[{id:'SYN-A-REQ', kind:'REQUIRED_COURSE', canonicalCourseId:'SYN-C2', evidenceRefs:['EV-SYN-C']}]});
    expect(() => run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}, {programs:clash})).toThrow(/both the primary and the second/);
    const noTotal = replace(CATALOG, 'SYN-D-DM-1', {...primaryD, requirements:primaryD.requirements.slice(1)});
    expect(() => run({action:'CHANGE_PRIMARY_MAJOR', targetMajorId:'SYN-MAJ-D'}, {programs:noTotal})).toThrow(/CREDIT_TOTAL/);
    const noEvidence = replace(CATALOG, 'SYN-C-DM-1', {...packC('SYN-C-DM-1', 'SYN-C'),
      requirements:[{id:'SYN-C-MAJOR', kind:'CATEGORY_MINIMUM', areaId:'SYN-AREA-C', requiredCreditUnits:6}]});
    expect(() => run({action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}, {programs:noEvidence})).toThrow(/no evidence/);
    expect(() => run({action:'REMOVE_DOUBLE_MAJOR'}, {current:{primaryProgramId:'SYN-MAJ-A', secondary:{role:'DOUBLE_MAJOR', programId:'SYN-MAJ-A'}}}))
      .toThrow(/cannot be the primary/);
  });

  it('names a bad program ID instead of silently mapping unknown degree paths (#231 follow-up)', () => {
    const malformed:ProgramOffer[] = CATALOG.map(offer => offer.role === 'PRIMARY_MAJOR'
      && offer.programId === 'SYN-MAJ-D'
      ? {...offer, degreePath:'UNKNOWN' as never} : offer);
    expect(() => run({action:'CHANGE_PRIMARY_MAJOR',targetMajorId:'SYN-MAJ-D'}, {programs:malformed}))
      .toThrow('Primary pack SYN-MAJ-D needs a supported degree path');
    // 정상적인 정식 계약 경로를 UNKNOWN으로 강등해서는 안 된다.
    const canonical=CATALOG.map(offer => offer.role === 'PRIMARY_MAJOR'
      && offer.programId === 'SYN-MAJ-A'
      && offer.degreePath === 'MAJOR_DEEPENING'
      ? {...offer,degreePath:'ADVANCED_SINGLE' as const} : offer);
    const expected=run({action:'REMOVE_DOUBLE_MAJOR'});
    expect(run({action:'REMOVE_DOUBLE_MAJOR'},{programs:canonical})).toEqual(expected);
  });

  it('undoing a change swaps the two sides, on seeded random transcripts', () => {
    // 변환 관계 검사: A+B에서 B 제거와 A 단독에서 B 추가는 앞뒤 결과를 바꾸면 같아야 한다.
    // B→C와 C→B, 부전공 변경도 같은 대칭성을 검사한다.
    let seed = 20261104;
    const rng = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pool = ['SYN-A1', 'SYN-A2', 'SYN-S1', 'SYN-B1', 'SYN-B2', 'SYN-C1', 'SYN-C2', 'SYN-G1'];
    const strip = ({role:_role, ...side}:WhatIfProjection) => side;
    const swapped = (forward:MajorWhatIfResult, back:MajorWhatIfResult) => {
      const f = ready(forward), b = ready(back);
      expect(strip(f.hypothetical)).toEqual(strip(b.current));
      expect(strip(f.current)).toEqual(strip(b.hypothetical));
    };
    for (let i = 0; i < 300; i++) {
      const attempts = pool.filter(() => rng() < 0.6).map(id => course(id, rng() < 0.25 ? {ledger:'IN_PROGRESS', term:'2026-2'} : {}));
      const at = (current:ProgramEnrollment, scenario:WhatIfScenario) => run(scenario, {current, attempts});
      const withC:ProgramEnrollment = {primaryProgramId:'SYN-MAJ-A', secondary:{role:'DOUBLE_MAJOR', programId:'SYN-MAJ-C'}};
      const minorC:ProgramEnrollment = {primaryProgramId:'SYN-MAJ-A', secondary:{role:'MINOR', programId:'SYN-MAJ-C'}};
      swapped(at(A_WITH_B, {action:'REMOVE_DOUBLE_MAJOR'}), at(A_ONLY, {action:'ADD_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-B'}));
      swapped(at(A_WITH_B, {action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}), at(withC, {action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-B'}));
      swapped(at(minorC, {action:'REMOVE_MINOR'}), at(A_ONLY, {action:'ADD_MINOR', targetMajorId:'SYN-MAJ-C'}));
      // 전공 변경 전후 모두 대표 취득 과목 수에 과목당 6단위를 곱한 고유 취득 총합을 따로 확인한다.
      const earned = 6 * new Set(attempts.filter(a => a.ledger === 'EARNED').map(a => a.canonicalCourseId)).size;
      const r = ready(at(A_WITH_B, {action:'CHANGE_PRIMARY_MAJOR', targetMajorId:'SYN-MAJ-D'}));
      expect([r.current.earnedCreditUnits, r.hypothetical.earnedCreditUnits]).toEqual([earned, earned]);
      expect(r.current.remainingCreditUnits).toBe(Math.max(0, 260 - earned));
    }
  });

  it('gives the same answer whatever order the catalog and attempts come in', () => {
    const scenario:WhatIfScenario = {action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'};
    expect(run(scenario, {programs:[...CATALOG].reverse(), attempts:[...ATTEMPTS].reverse()})).toEqual(run(scenario));
  });

  it('fits the #107 owner contract once the server adds versions, evidence links and approval', () => {
    for (const scenario of [{action:'CHANGE_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}, {action:'REMOVE_DOUBLE_MAJOR'},
      {action:'CHANGE_PRIMARY_MAJOR', targetMajorId:'SYN-MAJ-D'}] as WhatIfScenario[]) {
      const result = ready(run(scenario));
      const view = ({role, asOf, earnedCreditUnits, remainingCreditUnits, requirements}:typeof result.current, rulePackVersion:string) =>
        ({role, asOf, rulePackVersion, earnedCreditUnits, remainingCreditUnits, requirements});
      const refs = [...new Set(result.delta.flatMap(row => row.evidenceRefs))];
      const versions = {currentRulePack:'SYN-CUR', hypotheticalRulePack:'SYN-HYP', cohort:'SYN-COHORT', overlapPolicy:'SYN-OVERLAP',
        transcriptProjection:'SYN-TR', core:result.coreVersion};
      const wire = OwnerMajorWhatIfReadySchema.safeParse({
        state:'READY', asOf:result.asOf, scenario:result.scenario,
        current:view(result.current, 'SYN-CUR'), hypothetical:view(result.hypothetical, 'SYN-HYP'), delta:result.delta,
        versions, evidenceLinks:refs.map(ref => ({evidenceRef:ref, href:`https://example.test/${ref}`, verifiedAt:AS_OF})),
        approval:{verifiedAt:AS_OF, coreVersion:versions.core, cohortApplicabilityVersion:'SYN-COHORT', currentRulePackVersion:'SYN-CUR',
          hypotheticalRulePackVersion:'SYN-HYP', overlapPolicyVersion:'SYN-OVERLAP', transcriptProjectionVersion:'SYN-TR',
          sourceRightsVersion:'SYN-RIGHTS', ownerConsentVersion:'SYN-CONSENT', officialEvidenceRefs:refs},
        caveat:'HYPOTHETICAL_NOT_OFFICIAL',
      });
      expect(wire.success, JSON.stringify(wire.error?.issues)).toBe(true);
    }
    const blocked = run({action:'REMOVE_MINOR'});
    if (blocked.state !== 'BLOCKED_DEPENDENCY') throw new Error('expected BLOCKED');
    expect(OwnerMajorWhatIfBlockedSchema.safeParse({state:blocked.state, asOf:blocked.asOf, scenario:blocked.scenario,
      blockers:blocked.blockers, caveat:'HYPOTHETICAL_NOT_OFFICIAL'}).success).toBe(true);
  });
});

describe('second-program packs approved for one primary major (#249 review W1)', () => {
  // 이중전공 C는 주전공별 규칙집을 가진다. 취득된 C 과목은 C1(6단위)뿐이다.
  // 주전공 A에선 C 영역 6단위 필요로 충족, 주전공 D에선 12단위 필요로 6단위 부족하다.
  const cForA = (state:MajorRulePack['rulePackState'] = 'APPROVED') => packC('SYN-C-DM-FOR-A', 'SYN-CA', state);
  const cForD = (state:MajorRulePack['rulePackState'] = 'APPROVED'):MajorRulePack => ({
    rulePackVersion:'SYN-C-DM-FOR-D', rulePackState:state, courseAreas:{'SYN-C1':['SYN-AREA-C']},
    requirements:[{id:'SYN-CD-MAJOR', kind:'CATEGORY_MINIMUM', areaId:'SYN-AREA-C', requiredCreditUnits:12, evidenceRefs:['EV-SYN-C']}],
  });
  const scoped = (forA = cForA(), forD = cForD()):ProgramOffer[] => [
    ...CATALOG.filter(offer => !(offer.role === 'DOUBLE_MAJOR' && offer.programId === 'SYN-MAJ-C')),
    {role:'DOUBLE_MAJOR', programId:'SYN-MAJ-C', primaryProgramId:'SYN-MAJ-A', pack:forA},
    {role:'DOUBLE_MAJOR', programId:'SYN-MAJ-C', primaryProgramId:'SYN-MAJ-D', pack:forD},
  ];
  const A_WITH_C:ProgramEnrollment = {primaryProgramId:'SYN-MAJ-A', secondary:{role:'DOUBLE_MAJOR', programId:'SYN-MAJ-C'}};
  const toD:WhatIfScenario = {action:'CHANGE_PRIMARY_MAJOR', targetMajorId:'SYN-MAJ-D'};

  it('a primary change switches the double-major pack to the one approved for the new primary', () => {
    const result = ready(run(toD, {current:A_WITH_C, programs:scoped()}));
    expect(result.current.rulePackVersions).toEqual(['SYN-A-DM-1', 'SYN-C-DM-FOR-A']);
    expect(result.hypothetical.rulePackVersions).toEqual(['SYN-D-DM-1', 'SYN-C-DM-FOR-D']);
    // 현재 A는 A1+A2+S1로 18/18이고 C와 S1을 공유하지 않는다. A용 C 규칙은 C1로 6/6을 충족한다.
    expect(result.current.requirements).toEqual([
      {requirementId:'SYN-A-TOTAL', state:'MISSING', missingCreditUnits:224},
      {requirementId:'SYN-A-MAJOR-DM', state:'SATISFIED'},
      {requirementId:'SYN-A-REQ', state:'SATISFIED'},
      {requirementId:'SYN-CA-MAJOR', state:'SATISFIED'},
      {requirementId:'SYN-CA-REQ', state:'MISSING'},
    ]);
    // D를 주전공으로 바꾸면 D영역 취득 과목이 없어 6단위 부족하고 D용 C 규칙은 12단위 중 6단위가 부족하다.
    expect(result.hypothetical.requirements).toEqual([
      {requirementId:'SYN-D-TOTAL', state:'MISSING', missingCreditUnits:224},
      {requirementId:'SYN-D-MAJOR', state:'MISSING', missingCreditUnits:6},
      {requirementId:'SYN-CD-MAJOR', state:'MISSING', missingCreditUnits:6},
    ]);
    expect([result.current.reviewRequirementIds, result.hypothetical.reviewRequirementIds]).toEqual([[], []]);
    expect(result.delta).toEqual([
      {requirementId:'SYN-A-TOTAL', change:'REMOVED_REQUIREMENT', evidenceRefs:['EV-SYN-TOTAL']},
      {requirementId:'SYN-A-MAJOR-DM', change:'REMOVED_REQUIREMENT', evidenceRefs:['EV-SYN-A']},
      {requirementId:'SYN-A-REQ', change:'REMOVED_REQUIREMENT', evidenceRefs:['EV-SYN-A']},
      {requirementId:'SYN-CA-MAJOR', change:'REMOVED_REQUIREMENT', evidenceRefs:['EV-SYN-C']},
      {requirementId:'SYN-CA-REQ', change:'REMOVED_REQUIREMENT', evidenceRefs:['EV-SYN-C']},
      {requirementId:'SYN-D-TOTAL', change:'NEW_REQUIREMENT', evidenceRefs:['EV-SYN-TOTAL']},
      {requirementId:'SYN-D-MAJOR', change:'NEW_REQUIREMENT', evidenceRefs:['EV-SYN-D']},
      {requirementId:'SYN-CD-MAJOR', change:'NEW_REQUIREMENT', evidenceRefs:['EV-SYN-C']},
    ]);
  });

  it('a minor approved per primary major switches the same way', () => {
    const programs:ProgramOffer[] = [
      ...CATALOG.filter(offer => !(offer.role === 'MINOR' && offer.programId === 'SYN-MAJ-C')),
      {role:'PRIMARY_MAJOR', programId:'SYN-MAJ-D', degreePath:'ADVANCED_PLUS_MINOR', pack:{...primaryD, rulePackVersion:'SYN-D-MM-1'}},
      {role:'MINOR', programId:'SYN-MAJ-C', primaryProgramId:'SYN-MAJ-A', pack:packC('SYN-C-MI-FOR-A', 'SYN-CMA')},
      {role:'MINOR', programId:'SYN-MAJ-C', primaryProgramId:'SYN-MAJ-D', pack:packC('SYN-C-MI-FOR-D', 'SYN-CMD')},
    ];
    const result = ready(run(toD, {current:{primaryProgramId:'SYN-MAJ-A', secondary:{role:'MINOR', programId:'SYN-MAJ-C'}}, programs}));
    expect(result.current.rulePackVersions).toEqual(['SYN-A-MM-1', 'SYN-C-MI-FOR-A']);
    expect(result.hypothetical.rulePackVersions).toEqual(['SYN-D-MM-1', 'SYN-C-MI-FOR-D']);
  });

  it('adding the double major picks the pack approved for the current primary only', () => {
    const result = ready(run({action:'ADD_DOUBLE_MAJOR', targetMajorId:'SYN-MAJ-C'}, {current:A_ONLY, programs:scoped()}));
    expect(result.hypothetical.rulePackVersions).toEqual(['SYN-A-DM-1', 'SYN-C-DM-FOR-A']);
  });

  it('no pack approved for the new primary is TARGET_PROGRAM_UNAVAILABLE, not an error', () => {
    const onlyForA = scoped().filter(offer => offer.pack.rulePackVersion !== 'SYN-C-DM-FOR-D');
    expect(run(toD, {current:A_WITH_C, programs:onlyForA}))
      .toMatchObject({state:'BLOCKED_DEPENDENCY', blockers:['TARGET_PROGRAM_UNAVAILABLE']});
  });

  it('an unapproved pack is reported on the side that uses it', () => {
    expect(run(toD, {current:A_WITH_C, programs:scoped(cForA(), cForD('DRAFT'))}))
      .toMatchObject({state:'BLOCKED_DEPENDENCY', blockers:['RULEPACK_NOT_APPROVED']});
    expect(run(toD, {current:A_WITH_C, programs:scoped(cForA('NEEDS_REVIEW'), cForD())}))
      .toMatchObject({state:'BLOCKED_DEPENDENCY', blockers:['CURRENT_RULEPACK_NOT_APPROVED']});
  });

  it('the catalog refuses ambiguous or malformed scoping', () => {
    const add = (offer:ProgramOffer) => () => run(toD, {current:A_WITH_C, programs:[...scoped(), offer]});
    // 전공 공통 규칙집과 주전공별 규칙집을 함께 허용하면 목록 순서가 선택을 좌우하므로 혼합을 거부한다.
    expect(add({role:'DOUBLE_MAJOR', programId:'SYN-MAJ-C', pack:packC('SYN-C-DM-ANY', 'SYN-CX')})).toThrow(/mixes/);
    expect(add({role:'DOUBLE_MAJOR', programId:'SYN-MAJ-C', primaryProgramId:'SYN-MAJ-A', pack:packC('SYN-C-DM-FOR-A-2', 'SYN-CY')}))
      .toThrow(/more than once/);
    expect(add({role:'DOUBLE_MAJOR', programId:'SYN-MAJ-E', primaryProgramId:'SYN-MAJ-E', pack:packC('SYN-E-DM-1', 'SYN-E')}))
      .toThrow(/itself/);
    expect(add({role:'DOUBLE_MAJOR', programId:'SYN-MAJ-E', primaryProgramId:'bad id', pack:packC('SYN-E-DM-1', 'SYN-E')}))
      .toThrow(TypeError);
    expect(add({role:'PRIMARY_MAJOR', programId:'SYN-MAJ-E', degreePath:'DOUBLE_MAJOR', primaryProgramId:'SYN-MAJ-A',
      pack:{...primaryD, rulePackVersion:'SYN-E-PM-1'}} as unknown as ProgramOffer)).toThrow(/cannot name a primaryProgramId/);
    // 같은 프로그램이라도 부전공 선택은 별도 제안이므로 전공 공통 규칙집 하나를 유지할 수 있다.
    expect(add({role:'MINOR', programId:'SYN-MAJ-E', pack:packC('SYN-E-MI-1', 'SYN-EM')})).not.toThrow();
  });
});
