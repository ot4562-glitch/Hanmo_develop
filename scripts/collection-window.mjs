// @ts-check
import {readFileSync} from 'node:fs';

const DAY_MS=24*60*60*1000;
const KST_FORMAT=new Intl.DateTimeFormat('en-US',{
  timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'
});
const calendarURL=new URL('../data/collection-blackouts.json',import.meta.url);
const sourceURL=new URL('../data/academic-source-config.json',import.meta.url);

/** @param {string} input YYYY-MM-DD 형식의 실제 존재하는 날짜 */
function utcCalendarDay(input){
  if(typeof input!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input))
    throw new Error('날짜 형식은 YYYY-MM-DD여야 합니다.');
  const time=Date.parse(input+'T00:00:00Z');
  if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==input)
    throw new Error('존재하지 않는 날짜: '+input);
  return time;
}

/** @param {string} input YYYY-MM-DD로 되돌리는 UTC 기준 날짜 */
function dateFromDay(input){
  return new Date(input).toISOString().slice(0,10);
}

/** @param {Date|string} instant 시각의 시간대가 명확해야 합니다. */
function parseInstant(instant){
  if(typeof instant==='string'&&
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(instant))
    throw new Error('--at에는 시간대가 포함된 ISO 8601 시각이 필요합니다.');
  if(!(instant instanceof Date)&&typeof instant!=='string')
    throw new Error('시각은 Date 또는 시간대가 포함된 ISO 문자열이어야 합니다.');
  const date=new Date(instant);
  if(!Number.isFinite(date.getTime()))throw new Error('잘못된 시각입니다.');
  return date;
}

/** @param {Date} instant 서울 날짜를 UTC 달력일 비교용 값으로 변환합니다. */
function seoulCalendarDay(instant){
  const parts=Object.fromEntries(KST_FORMAT.formatToParts(instant)
    .filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  return utcCalendarDay(parts.year+'-'+parts.month+'-'+parts.day);
}

/** @param {unknown} raw JSON 달력의 구조와 안전 여유일을 검증합니다. */
export function validateCollectionCalendar(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
    throw new Error('수집 금지 일정이 유효한 객체가 아닙니다.');
  const calendar=raw;
  if(calendar.schemaVersion!==1||calendar.timeZone!=='Asia/Seoul')
    throw new Error('지원되지 않는 수집 일정 버전 또는 시간대입니다.');
  for(const key of ['bufferDaysBefore','bufferDaysAfter']){
    if(!Number.isInteger(calendar[key])||calendar[key]<1||calendar[key]>30)
      throw new Error('신청기간 전후 최소 1일 금지 규칙이 누락됐습니다.');
  }
  if(calendar.completeness!=='partial'&&calendar.completeness!=='verified')
    throw new Error('학교 일정의 검증 상태가 불명확합니다.');
  if(!Array.isArray(calendar.registrationPeriods)||calendar.registrationPeriods.length===0)
    throw new Error('수강신청 금지 기간이 누락됐습니다.');
  const seen=new Set();
  const intervals=calendar.registrationPeriods.map(period=>{
    if(!period||typeof period!=='object'||Array.isArray(period))
      throw new Error('신청기간 항목 형식이 잘못됐습니다.');
    if(typeof period.id!=='string'||!period.id||seen.has(period.id))
      throw new Error('신청기간 식별자가 비어 있거나 중복됐습니다.');
    seen.add(period.id);
    if(typeof period.name!=='string'||!period.name.trim())
      throw new Error('신청기간 이름이 누락됐습니다.');
    const first=utcCalendarDay(period.startDate);
    const last=utcCalendarDay(period.endDate);
    if(first>last)throw new Error('신청기간 날짜가 역순입니다.');
    for(const name of ['dailyStart','dailyEnd']){
      if(typeof period[name]!=='string'||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(period[name]))
        throw new Error('신청기간 시간 형식이 잘못됐습니다.');
    }
    if(period.dailyStart>=period.dailyEnd)
      throw new Error('신청 시작·종료 시간이 역순입니다.');
    const denyFrom=first-calendar.bufferDaysBefore*DAY_MS;
    const denyUntil=last+(calendar.bufferDaysAfter+1)*DAY_MS;
    return Object.freeze({
      id:period.id,name:period.name,
      registrationStart:period.startDate,registrationEnd:period.endDate,
      dailyStart:period.dailyStart,dailyEnd:period.dailyEnd,
      denyFromKst:dateFromDay(denyFrom),
      denyUntilExclusiveKst:dateFromDay(denyUntil),
      denyStartDay:denyFrom,denyEndDayExclusive:denyUntil
    });
  });
  return Object.freeze({completeness:calendar.completeness,intervals});
}

/** @returns {unknown} 배포된 일정 파일은 이 함수가 읽고 오류 시 즉시 중단합니다. */
export function loadCollectionCalendar(){
  return JSON.parse(readFileSync(calendarURL,'utf8'));
}

/** @returns {unknown} 운영 연결 기본값은 disabled입니다. */
export function loadAcademicSourceConfig(){
  return JSON.parse(readFileSync(sourceURL,'utf8'));
}

/**
 * @param {Date|string} instant
 * @param {unknown} [calendar]
 * @returns {object|null} 일치하지 않음은 다른 미확인 기간에 대한 수집 허가가 아닙니다.
 */
export function findRegistrationBlackout(instant,calendar=loadCollectionCalendar()){
  const at=parseInstant(instant);
  const day=seoulCalendarDay(at);
  const validated=validateCollectionCalendar(calendar);
  const match=validated.intervals.find(item=>
    item.denyStartDay<=day&&day<item.denyEndDayExclusive);
  if(!match)return null;
  const {denyStartDay,denyEndDayExclusive,...result}=match;
  return result;
}

/**
 * 모든 수집 실행 직전에 호출할 사전 점검입니다. 다른 등록/정정 일정이
 * 검증되지 않고 수집기·예산·오류 차단이 미구현된 상태에서는 항상 실패 폐쇄합니다.
 * @param {Date|string} [instant]
 * @param {object} [options]
 * @param {unknown} [options.calendar]
 * @param {unknown} [options.sourceConfig]
 */
export function collectionGateStatus(instant=new Date(),options={}){
  const at=parseInstant(instant);
  const cal=options.calendar??loadCollectionCalendar();
  const config=options.sourceConfig??loadAcademicSourceConfig();
  const validated=validateCollectionCalendar(cal);
  const koreanDate=dateFromDay(seoulCalendarDay(at));
  const match=findRegistrationBlackout(at,cal);
  const base={checkedAt:at.toISOString(),timeZone:'Asia/Seoul',koreanDate,
    canCollect:false};
  if(match)return {...base,code:'REGISTRATION_BLACKOUT',
    message:'수강신청 기간 전체와 전후 각 1일은 자료 수집 금지입니다.',blackout:match};
  if(!config||typeof config!=='object'||Array.isArray(config)||
     config.schemaVersion!==1||!['disabled','enabled'].includes(config.mode))
    return {...base,code:'INVALID_SOURCE_CONFIG',
      message:'자료 연결 설정을 확인할 수 없어 수집을 차단했습니다.'};
  if(config.mode!=='enabled')
    return {...base,code:'COLLECTION_DISABLED',
      message:'자료 연결이 disabled이므로 수집을 실행하지 않습니다.'};
  if(validated.completeness!=='verified')
    return {...base,code:'REGISTRATION_CALENDAR_UNVERIFIED',
      message:'다른 신청·정정 일정을 모두 검증하지 않아 수집을 차단했습니다.'};
  return {...base,code:'COLLECTOR_NOT_READY',
    message:'요청 예산·전역 잠금·오류 중단이 미구현이므로 수집을 차단했습니다.'};
}

/**
 * @param {Date|string} [instant]
 * @param {object} [options]
 * @throws 차단 결과에서는 어떤 수집 네트워크 요청도 진행하면 안 됩니다.
 */
export function assertCollectionGate(instant=new Date(),options={}){
  const result=collectionGateStatus(instant,options);
  if(!result.canCollect){
    const error=new Error(result.code+': '+result.message);
    error.code=result.code;
    throw error;
  }
  return result;
}
