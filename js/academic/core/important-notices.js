// @ts-check
/** @typedef {import('./academic-schedule.js').AcademicAgendaItem} AcademicAgendaItem */
/** @typedef {import('./academic-schedule.js').AcademicProfile} AcademicProfile */
/** @typedef {import('./academic-schedule.js').AcademicEventType} AcademicEventType */

/**
 * 중요공지 목록은 학업 자격 판정이 아닌 참고용 정렬 결과다.
 * 독립 검수·대상 확인·학생 마감 검증을 통과한 공지만 상단에 고정한다.
 * 제목만 있는 자료, 사용자 가져오기, 미검증·합성 자료는 확인 필요 영역으로 분리한다.
 */
/** @type {ReadonlySet<AcademicEventType>} */
const ACTION_TYPES=new Set([
  'COURSE_PRE_REGISTRATION','COURSE_REGISTRATION','COURSE_CHANGE','COURSE_WITHDRAWAL',
  'DOUBLE_MAJOR_APPLICATION','DOUBLE_MAJOR_CHANGE','DOUBLE_MAJOR_WITHDRAWAL',
  'PRIMARY_MAJOR_DECLARATION','MINOR_APPLICATION','MINOR_CHANGE',
  'GRADUATION_EXAM','GRADUATION_THESIS','GRADUATION_CERTIFICATION',
  'LANGUAGE_CERTIFICATION','GRADUATION_APPLICATION','GRADUATION_DOCUMENT',
]);
/** @type {Partial<Record<AcademicEventType,number>>} */
const TYPE_ORDER={
  GRADUATION_EXAM:0,DOUBLE_MAJOR_APPLICATION:1,DOUBLE_MAJOR_CHANGE:2,
  COURSE_PRE_REGISTRATION:3,COURSE_REGISTRATION:4,
  GRADUATION_THESIS:5,LANGUAGE_CERTIFICATION:6,GRADUATION_DOCUMENT:7,
};

/** 전공을 선택하지 않았으면 일반 공지만 보여주고 개인 맞춤 결과인 것처럼 표시하지 않는다. */
/** @typedef {'CHOOSE_MAJOR'|'MAJOR_SELECTED'} ImportantNoticeMode */
/**
 * @typedef {{mode:ImportantNoticeMode,confirmed:AcademicAgendaItem[],toCheck:AcademicAgendaItem[]}} ImportantNoticeSummary
 * 독립 검수한 학생 마감만 확정 영역에 두고 나머지는 원문 확인 대상으로 분리한다.
 */
/** @param {AcademicAgendaItem} item @param {AcademicProfile} profile @returns {boolean} 전공 일치 여부 */
function matchedMajor(item,profile){
  const scoped=item.event.scope?.majors;
  return !!scoped?.length&&!!profile.majors?.some(m=>scoped.includes(m));
}
/** @param {AcademicAgendaItem} item @returns {string} 게시일 또는 빈 문자열 */
function sourceDate(item){
  return item.event.source.publishedDate??'';
}
/** @param {AcademicAgendaItem} a @param {AcademicAgendaItem} b @param {AcademicProfile} profile @returns {number} 정렬 순서 */
function order(a,b,profile){
  const match=Number(matchedMajor(b,profile))-Number(matchedMajor(a,profile));
  if(match)return match;
  const impact=(TYPE_ORDER[a.event.type]??99)-(TYPE_ORDER[b.event.type]??99);
  if(impact)return impact;
  return sourceDate(b).localeCompare(sourceDate(a))||a.event.id.localeCompare(b.event.id);
}
/** @param {AcademicProfile} profile @param {readonly AcademicAgendaItem[]} items @returns {ImportantNoticeSummary} 중요공지 표시 후보 */
export function importantNotices(profile,items){
  // 전공이 비어 있으면 임의의 공지를 개인 맞춤 대상으로 추천하지 않는다.
  if(!profile.majors?.some(x=>x.trim().length>0)){
    return {mode:'CHOOSE_MAJOR',confirmed:[],toCheck:[]};
  }
  const eligible=items.filter(item=>
    item.appliesTo!=='NO'&&item.event.studentActionRequired&&
    ACTION_TYPES.has(item.event.type)&&item.priority!=='OVERDUE'
  );
  // 상단 확정 공지는 출처 검토·학생 적용 여부·실제 학생 마감이 모두 확인된 경우만 통과한다.
  const verified=eligible.filter(item=>
    item.evidence==='SOURCE_REVIEWED'&&item.appliesTo==='YES'&&
    item.studentDeadline!==null
  ).sort((a,b)=>a.sortTimestamp-b.sortTimestamp||order(a,b,profile));
  const confirmed=verified.slice(0,2);
  // 독립 검토된 나머지 공지는 미검증 항목이 아니라 전체 공지 목록에 남긴다.
  const trustedIds=new Set(verified.map(item=>item.event.id));
  // 검수 또는 대상 판단이 불충분한 자료는 확정 공지와 섞지 않고 확인 후보로 분리한다.
  const toCheck=eligible.filter(item=>!trustedIds.has(item.event.id))
    .sort((a,b)=>order(a,b,profile)).slice(0,4);
  return {mode:'MAJOR_SELECTED',confirmed,toCheck};
}
