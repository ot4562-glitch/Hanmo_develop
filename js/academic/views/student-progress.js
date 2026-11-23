// @ts-check
import {buildAcademicLedger} from '../core/academics/ledger.js';
/** @typedef {import('../core/academics/ledger.js').LedgerAttempt} LedgerAttempt */
/** @typedef {import('../core/academics/ledger.js').ExclusionReason} ExclusionReason */
/** @typedef {import('../contracts/index.js').AcademicAuditVNext} AcademicAuditVNext */

/**
 * #63 학생용 로컬 입력. 학칙·분반·성적표의 공적 검수는 없고,
 * 입력된 학점의 고유 합산에만 기존 학업 원장 계산 코어를 재사용한다.
 */
/** @typedef {'EARNED'|'IN_PROGRESS'} StudentSlot */
/** @typedef {'A'|'B'|'C'} ScenarioId */
/** @typedef {{courseId:string,credits:number,term:string,slot:StudentSlot}} StudentCourse */
/** @typedef {{courseId:string,credits:number,term:string}} StudentPlanCourse */
/** @type {Readonly<Record<ScenarioId,number>>} */
export const SCENARIO_TERMS={A:2,B:3,C:4};
export const MAX_COURSES=60;
const CODE=/^[A-Za-z0-9_.:-]{1,128}$/;
const TERM=/^20\d{2}-[12SW]$/;
const OFFSET=/(?:Z|[+-]\d{2}:\d{2})$/;

/** @param {string} value @returns {number} 검증한 조회 시각 */
function asOfTime(value) {
  const time=Date.parse(value);
  if(!OFFSET.test(value)||!Number.isFinite(time))throw new RangeError('조회 기준 시각을 확인해 주세요.');
  return time;
}
/** @param {unknown} raw @returns {string} 검증된 학수번호 */
function courseCode(raw) {
  if(typeof raw!=='string'||!CODE.test(raw.trim()))throw new RangeError('학수번호는 영문·숫자·.-_: 문자로 입력해 주세요.');
  return raw.trim();
}
/** @param {unknown} raw @returns {string} 검증된 정규학기 */
function academicTerm(raw) {
  if(typeof raw!=='string'||!TERM.test(raw))throw new RangeError('학기는 2027-1·2027-S(여름)·2027-2·2027-W(겨울) 형식으로 입력해 주세요.');
  return raw;
}
/** @param {unknown} raw @returns {number} 반 학점 단위로 표시한 값 */
export function creditUnits(raw) {
  if(typeof raw!=='number'||!Number.isFinite(raw)||raw<0.5||raw>30
    ||!Number.isSafeInteger(raw*2))throw new RangeError('학점은 0.5~30 사이에서 0.5학점 단위로 입력해 주세요.');
  return raw*2;
}
/** @param {StudentPlanCourse & {slot:unknown}} raw @returns {StudentCourse} 검증한 로컬 이수 기록 */
export function normalizeStudentCourse(raw) {
  const slot=raw.slot;
  if(slot!=='EARNED'&&slot!=='IN_PROGRESS')throw new RangeError('취득 또는 수강 중을 선택해 주세요.');
  return {...normalizePlanCourse(raw),slot};
}
/** @param {StudentPlanCourse} raw @returns {StudentPlanCourse} 검증한 계획 기록 */
export function normalizePlanCourse(raw) {
  return {courseId:courseCode(raw.courseId),credits:creditUnits(raw.credits)/2,
    term:academicTerm(raw.term)};
}

/** @param {number} units @returns {string} 0.5학점 단위로 저장한 값을 화면에 표시한다. */
export function creditsText(units) {
  return `${units % 2 === 0 ? units / 2 : (units / 2).toFixed(1)}학점`;
}

/** KST 기준으로 다음 정규학기부터 연속한 2~4개 학기만 후보로 제공한다. */
/** @param {string} asOf @param {number} [length] @returns {string[]} 한국시간의 다음 정규학기 */
export function upcomingTerms(asOf,length=4) {
  asOfTime(asOf);
  if(!Number.isInteger(length)||length<2||length>4)throw new RangeError('계획 기간은 2~4학기입니다.');
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric'})
    .formatToParts(new Date(asOf));
  let year=Number(parts.find(x=>x.type==='year')?.value);
  const month=Number(parts.find(x=>x.type==='month')?.value);
  if(!Number.isInteger(year)||!Number.isInteger(month))throw new Error('한국시간을 확인할 수 없습니다.');
  /** @type {1|2} */
  let semester=month>=9?1:month>=3?2:1;
  if(month>=9)year++;
  /** @type {string[]} */
  const terms=[];
  for(let i=0;i<length;i++){
    terms.push(`${year}-${semester}`);
    if(semester===1)semester=2;else{semester=1;year++;}
  }
  return terms;
}
/**
 * @typedef {{
 *    audit:AcademicAuditVNext,terms:readonly string[],scenario:ScenarioId,rows:readonly StudentPlanCourse[],
 *    officialDecisionAvailable:false
 * }} ProvisionalScenario
 * 학교의 승인된 요건·분반 검수 자료가 없어 공식 졸업 판정을 제공하지 않는다.
 */
/**
 * @typedef {{origin:'record'|'plan',courseId:string,term:string,reason:ExclusionReason,explanation:string,nextAction:string}} ProvisionalExcludedRow
 * 미반영 과목의 사유와 학생이 확인할 조치를 함께 안내한다.
 */
/** @type {Record<ExclusionReason,{explanation:string,nextAction:string}>} */
const EXCLUSION_HELP={
  DUPLICATE:{
    explanation:'같은 학수번호의 다른 기록이 이미 고유 학점에 반영되어 중복 합산하지 않았습니다.',
    nextAction:'취득·수강 중·계획 입력을 비교하고, 공식 재수강/대체 인정은 학교 원문에서 확인하세요.',
  },
  NEEDS_REVIEW:{
    explanation:'취득 학기가 아직 끝나지 않았거나 동일 과목 이력 등이 충돌해 합산을 보류했습니다.',
    nextAction:'학기·학수번호·중복 입력을 확인하고 필요한 기록을 삭제해 다시 입력하세요.',
  },
  PENDING_RECOGNITION:{
    explanation:'학점 인정 여부가 확인되지 않아 고유 학점에 포함하지 않았습니다.',
    nextAction:'학교의 학점 인정 결과와 근거를 직접 확인하세요.',
  },
  OFFICIAL_EXCLUSION:{
    explanation:'입력 원장에서 학점 계산 제외 상태로 표시된 기록입니다.',
    nextAction:'제외·인정 근거를 학교 공식 자료에서 다시 확인하세요.',
  },
  RETAKE_SUPERSEDED:{
    explanation:'명시된 재수강 관계에서 이전 기록이 중복 합산되지 않았습니다.',
    nextAction:'재수강 인정 학기와 승인 근거를 공식 자료에서 확인하세요.',
  },
};
/** @param {ProvisionalScenario} result @param {readonly StudentCourse[]} records @returns {ProvisionalExcludedRow[]} 보류된 이수 기록의 설명 */
export function explainProvisionalExclusions(result,records) {
  return result.audit.excludedAttempts.map(({attemptToken,reason})=>{
    const origin=attemptToken.startsWith('LOCAL:')?'record':'plan';
    const prefix=origin==='record'?'LOCAL:':`SCENARIO:${result.scenario}:`;
    const ordinal=attemptToken.slice(prefix.length);
    if(!attemptToken.startsWith(prefix)||!/^[1-9]\d*$/.test(ordinal)){
      throw new Error('학점 합산에서 제외된 기록의 식별자를 확인할 수 없습니다.');
    }
    const row=origin==='record'?records[Number(ordinal)-1]:result.rows[Number(ordinal)-1];
    if(!row)throw new Error('학점 합산에서 제외된 과목을 찾을 수 없습니다.');
    return {origin,courseId:row.courseId,term:row.term,reason,...EXCLUSION_HELP[reason]};
  });
}

/** @typedef {{term:string,countedCreditUnits:number,countedCourses:number,excludedCourses:number}} ProvisionalTermCredits */
/** 제외된 계획 과목은 해당 학기 학점에 합산하지 않고 공식 분반/학칙 검사는 하지 않는다. */
/** @param {ProvisionalScenario} result @returns {ProvisionalTermCredits[]} 학기별 계획 학점 */
export function provisionalTermBreakdown(result) {
  const excluded=new Set(result.audit.excludedAttempts.map(row=>row.attemptToken));
  const totals=result.terms.map(term=>{
    let countedCreditUnits=0,countedCourses=0,excludedCourses=0;
    for(const [index,row] of result.rows.entries()){
      if(row.term!==term)continue;
      if(excluded.has(`SCENARIO:${result.scenario}:${index+1}`)){
        excludedCourses++;continue;
      }
      countedCreditUnits+=creditUnits(row.credits);
      countedCourses++;
    }
    return {term,countedCreditUnits,countedCourses,excludedCourses};
  });
  if(totals.reduce((sum,row)=>sum+row.countedCreditUnits,0)!==result.audit.plannedCreditUnits){
    throw new Error('학기별 계획 합계가 학점 원장과 일치하지 않습니다.');
  }
  return totals;
}

/**
 * @param {{asOf:string,scenario:ScenarioId,records:readonly StudentCourse[],plans:readonly StudentPlanCourse[]}} input
 * @returns {ProvisionalScenario} 승인되지 않은 자료를 보류하는 학업 계획 비교 결과
 */
export function compareProvisionalScenario(input) {
  asOfTime(input.asOf);
  const count=SCENARIO_TERMS[input.scenario];
  if(!count)throw new RangeError('A, B, C 중 계획을 선택해 주세요.');
  if(input.records.length>MAX_COURSES||input.plans.length>MAX_COURSES)throw new RangeError('기록과 계획은 각각 60과목 이하로 입력해 주세요.');
  const terms=upcomingTerms(input.asOf,count);
  const planned=input.plans.map(normalizePlanCourse);
  if(planned.some(row=>!terms.includes(row.term)))throw new RangeError('선택한 계획 기간 밖의 학기가 있습니다.');
  const recorded=input.records.map(normalizeStudentCourse);
  /** @type {LedgerAttempt[]} */
  const attempts=[
    ...recorded.map((row,i)=>({
      attemptToken:`LOCAL:${i+1}`,canonicalCourseId:row.courseId,
      creditUnits:creditUnits(row.credits),ledger:row.slot,
      areaIds:[],recognition:/** @type {const} */ ('RECOGNIZED'),term:row.term,
    })),
    ...planned.map((row,i)=>({
      attemptToken:`SCENARIO:${input.scenario}:${i+1}`,canonicalCourseId:row.courseId,
      creditUnits:creditUnits(row.credits),ledger:/** @type {const} */ ('PLANNED'),
      areaIds:[],recognition:/** @type {const} */ ('RECOGNIZED'),term:row.term,
    })),
  ];
  const audit=buildAcademicLedger({
    asOf:input.asOf,rulePackVersion:'UNVERIFIED-STUDENT-INPUT',
    rulePackState:'MISSING',attempts,requirements:[],
  });
  // 학생이 직접 입력한 이수·계획 기록을 승인된 학칙 판정으로 승격하지 않는다.
  if(audit.state!=='INSUFFICIENT_DATA'||audit.requirements.length!==0){
    throw new Error('검수되지 않은 학업 자료를 공식 졸업 판정에 사용할 수 없습니다.');
  }
  return {scenario:input.scenario,terms,rows:planned,audit,officialDecisionAvailable:false};
}
