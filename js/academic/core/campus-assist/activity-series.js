// @ts-check
/**
 * #52 반복 학사행사 계열 연결과 예상 구간 백테스트(순수 코어). 학생 화면에는 아직 연결하지 않는다.
 *
 * 1) 공지 연결: #46 공지 추출 결과를 activities.js가 쓰는 행사 기록(ActivityRecord)으로 바꾼다.
 *    행사 계열(졸업시험·이중전공 신청 등)과 캠퍼스는 제목·대상 근거로 정하고, 정정·취소는 판본 연결로 유지한다.
 *    행사일은 추출된 행사일이 하나뿐이고 연도를 추정하지 않았으며 검수자가 확인한 경우에만 넣는다.
 *    게시일을 행사일로 쓰지 않는다.
 * 2) 백테스트: 연도별 기준 시점에 그때까지 공개·검수된 기록만으로 예상 구간을 만들고,
 *    실제 확정 행사일이 구간에 들었는지(적중)와 구간 폭을 기록한다. 이후 정정은 소급 적용되지 않는다.
 *
 * 예상 구간 계산 자체(최소 2개 연도, 분산 45일 초과 보류, 전후 7일 여유)는 기존 activities.js를 그대로 쓴다.
 */
/** @typedef {import("./notice-extract.js").NoticeExtraction} NoticeExtraction */
/** @typedef {import("../../contracts/campus-assist/index.js").ActivityRecord} ActivityRecord */
/** @typedef {import("../../contracts/campus-assist/index.js").ActivityForecast} ActivityForecast */
/** @typedef {'GRADUATION_EXAM'|'DOUBLE_MAJOR_APPLICATION'|'MINOR_APPLICATION'|'COURSE_REGISTRATION'|'GRADUATION_THESIS'|'EXCHANGE_APPLICATION'} SeriesType */
/** @typedef {'NOT_A_KNOWN_SERIES'|'CAMPUS_UNSTATED'|'EXCLUDED'|'EVENT_DATE_NOT_CONFIRMED'|'MULTIPLE_EVENT_DATES'|'EVENT_YEAR_INFERRED'|'NO_EVENT_DATE'} LinkIssue */
/** @typedef {{extraction:NoticeExtraction,title:string,sourceUrl:string,publishedAt:string,organizationId:string,verifiedAt:string,eventDateConfirmed:boolean}} NoticeLinkInput */
/** @typedef {{records:readonly ActivityRecord[],organizationId:string,seriesId:string,years:readonly number[],asOfMonthDay?:string}} BacktestInput */
/** @typedef {{record:ActivityRecord|null,seriesType:SeriesType|null,issues:LinkIssue[]}} NoticeLinkResult */
/** @typedef {{targetYear:number,asOf:string,state:ActivityForecast['state'],from:string|null,to:string|null,actual:string|null,hit:boolean|null,widthDays:number|null}} BacktestRow */
/** @typedef {{rows:BacktestRow[],evaluated:number,predicted:number,coverage:number|null,hitRate:number|null,meanWidthDays:number|null,provenance:'SYNTHETIC'|'REAL_APPROVED'|'NONE'}} BacktestSummary */
import {ActivityRecordSchema} from '../../contracts/campus-assist/index.js';
import {currentActivityRecords,forecastActivity} from './activities.js';

/** 제목 규칙으로 계열을 정한다. 띄어쓰기를 허용하고, 어느 규칙에도 안 맞으면 연결하지 않는다. */
/** @type {[SeriesType,RegExp][]} */
const SERIES_RULES=[
  ['GRADUATION_EXAM',/졸\s*업\s*시\s*험|졸시/],
  ['GRADUATION_THESIS',/졸\s*업\s*논\s*문/],
  ['DOUBLE_MAJOR_APPLICATION',/이\s*중\s*전\s*공|복전/],
  ['MINOR_APPLICATION',/부\s*전\s*공/],
  ['EXCHANGE_APPLICATION',/교\s*환\s*학\s*생/],
  ['COURSE_REGISTRATION',/수\s*강\s*신\s*청/],
];

/**
 * 공지 추출 결과를 행사 기록으로 바꾼다. 연결할 수 없으면 record=null과 이유를 돌려준다.
 * 행사일을 확정할 수 없어도 계열·캠퍼스가 정해지면 ANNOUNCED 기록은 만든다(예상 구간 계산에는 쓰이지 않음).
 * 추출 결과에는 게시 시각이 없으므로 원 공지의 publishedAt을 함께 받는다.
 * @param {NoticeLinkInput} input 추출 결과와 원 공지 메타데이터
 * @returns {NoticeLinkResult}
 */
export function activityRecordFromNotice(input){
  const x=input.extraction;
  /** @type {LinkIssue[]} */
  const issues=[];
  if(x.status==='EXCLUDED')return {record:null,seriesType:null,issues:['EXCLUDED']};
  const seriesType=SERIES_RULES.find(([,re])=>re.test(input.title))?.[0]??null;
  if(!seriesType)return {record:null,seriesType:null,issues:['NOT_A_KNOWN_SERIES']};
  const campuses=new Set(x.targets.included.flatMap(t=>t.value.kind==='CAMPUS'?[t.value.campus]:[]));
  // 캠퍼스가 적혀 있지 않으면 두 캠퍼스 공통 행사로 가정하지 않는다(서로 다른 계열을 섞지 않기 위해).
  if(!campuses.size)return {record:null,seriesType,issues:['CAMPUS_UNSTATED']};
  const campus=campuses.size===2?'BOTH':/** @type {'SEOUL'|'GLOBAL'} */([...campuses][0]);

  /** @type {string|undefined} */
  let eventDate;
  const cancelled=x.revisionLink?.kind==='CANCELLATION';
  if(!cancelled){
    const dates=[...new Set(x.events.map(e=>e.date))];
    if(!dates.length)issues.push('NO_EVENT_DATE');
    else if(dates.length>1)issues.push('MULTIPLE_EVENT_DATES');
    else if(x.events.some(e=>e.yearInferred))issues.push('EVENT_YEAR_INFERRED');
    else if(!input.eventDateConfirmed)issues.push('EVENT_DATE_NOT_CONFIRMED');
    else eventDate=dates[0];
  }
  const revisionKey=x.noticeId+':'+x.revisionId;
  const supersedes=x.revisionLink?.correctsRevisionId?x.noticeId+':'+x.revisionLink.correctsRevisionId:undefined;
  const record=ActivityRecordSchema.parse({
    entryId:revisionKey,sourceId:x.noticeId,revisionId:revisionKey,...(supersedes?{supersedes}:{}),
    organizationId:input.organizationId,seriesId:seriesType+'.'+campus,title:input.title,kind:'ACADEMIC',campus,
    publishedAt:input.publishedAt,verifiedAt:input.verifiedAt,
    ...(eventDate?{eventDate}:{}),sourceUrl:input.sourceUrl,
    status:cancelled?'CANCELLED':eventDate?'CONFIRMED':'ANNOUNCED',
    rights:'APPROVED',provenance:x.provenance,
  });
  return {record,seriesType,issues};
}

const DAY=86400000;
/** @param {string} a @param {string} b @returns {number} 두 날짜 사이 일수(양 끝 포함) */
const spanDays=(a,b)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/DAY)+1;
const round=(/** @type {number} */x)=>Math.round(x*1e4)/1e4;

/**
 * 연도별로 '그 해 기준 시점'에 만든 예상 구간이 실제 확정 행사일을 맞혔는지 기록한다.
 * 기준 시점 이후에 게시·검수된 기록은 쓰지 않는다(forecastActivity가 asOf로 거른다).
 * 실제 행사일이 없는 해(미관측·취소)는 적중 계산에서 빼고 actual=null로 남긴다.
 * @param {BacktestInput} input asOfMonthDay는 'MM-DD' 형식의 한국시간 기준 시점이며 기본값은 '01-01'이다.
 * @returns {BacktestSummary}
 */
export function backtestActivityForecast(input){
  const md=input.asOfMonthDay??'01-01';
  if(!/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(md))throw new RangeError('asOfMonthDay must be MM-DD');
  const provenances=new Set(input.records.map(r=>r.provenance));
  if(provenances.size>1)throw new RangeError('Mixed synthetic and real records');
  // 실제 결과는 가장 늦은 시점의 확정 판본으로 판단한다(정정 반영). 예측 입력에는 소급하지 않는다.
  const latest=currentActivityRecords(input.records,'2200-01-01T00:00:00Z')
    .filter(r=>r.organizationId===input.organizationId&&r.seriesId===input.seriesId);
  /** @type {BacktestRow[]} */
  const rows=[...new Set(input.years)].sort((a,b)=>a-b).map(targetYear=>{
    const asOf=`${targetYear}-${md}T00:00:00+09:00`;
    const f=forecastActivity(input.records,asOf,targetYear,input.organizationId,input.seriesId);
    const actualRow=latest.find(r=>r.status==='CONFIRMED'&&r.eventDate?.startsWith(String(targetYear)));
    const actual=actualRow?.eventDate??null;
    const predicted=f.state==='PREDICTED'&&f.from&&f.to;
    return {targetYear,asOf,state:f.state,from:f.from??null,to:f.to??null,actual,
      hit:predicted&&actual?/** @type {string} */(f.from)<=actual&&actual<=/** @type {string} */(f.to):null,
      widthDays:predicted?spanDays(/** @type {string} */(f.from),/** @type {string} */(f.to)):null};
  });
  const evaluated=rows.filter(r=>r.actual!==null);
  const predicted=evaluated.filter(r=>r.hit!==null);
  return {
    rows,evaluated:evaluated.length,predicted:predicted.length,
    coverage:evaluated.length?round(predicted.length/evaluated.length):null,
    hitRate:predicted.length?round(predicted.filter(r=>r.hit).length/predicted.length):null,
    meanWidthDays:predicted.length?round(predicted.reduce((s,r)=>s+/** @type {number} */(r.widthDays),0)/predicted.length):null,
    provenance:provenances.size?/** @type {'SYNTHETIC'|'REAL_APPROVED'} */([...provenances][0]):'NONE',
  };
}
