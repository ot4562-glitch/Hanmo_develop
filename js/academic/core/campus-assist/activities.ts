import {ActivityForecastSchema,ActivityRecordSchema,type ActivityRecord,type ActivityForecast} from '../../contracts/campus-assist/index.js';
export const ACTIVITY_FORECAST_MODEL_VERSION='activity-seasonal-window-v1';

function epoch(iso:string):number{
  const ms=Date.parse(iso);
  if(!Number.isFinite(ms))throw new RangeError('Invalid asOf');
  return ms;
}
function year(day:string):number{return Number(day.slice(0,4));}
/**
 * 공식 행사일이 없는 게시 시각은 UTC 문자열 날짜가 아니라 한국시간 달력 날짜로 분류·필터링한다.
 * 이 날짜를 임의의 행사일(eventDate)로 표시해서는 안 된다.
 */
export function publishedDayKst(iso:string):string{
  return new Date(epoch(iso)+9*60*60*1000).toISOString().slice(0,10);
}
function dayOfYear(day:string):number{
  const m=Number(day.slice(5,7)), d=Number(day.slice(8,10));
  // 윤년 2월 29일 행사는 거친 계절별 구간 산출에서 2월 28일로 접는다.
  return Math.floor((Date.UTC(2001,m-1,m===2&&d===29?28:d)-Date.UTC(2001,0,1))/86400000);
}
/**
 * day는 평년 기준 연도(2001)의 일수 오프셋이다.
 * 대상 연도 달력에 월·일을 다시 구성한 다음 여유 구간을 적용해 윤년 2월 이후 날짜가 밀리지 않도록 한다.
 * 최종 범위는 대상 연도의 1월 1일~12월 31일로 제한한다.
 */
function windowDate(targetYear:number,day:number,marginDays:number):string{
  const common=new Date(Date.UTC(2001,0,1)+Math.max(0,Math.min(364,day))*86400000);
  const ms=Date.UTC(targetYear,common.getUTCMonth(),common.getUTCDate())+marginDays*86400000;
  const clamped=Math.min(Date.UTC(targetYear,11,31),Math.max(Date.UTC(targetYear,0,1),ms));
  return new Date(clamped).toISOString().slice(0,10);
}
/**
 * 행사일이 공식 확인되면 해당 날짜를, 그렇지 않으면 한국시간 게시일을 필터에 사용한다.
 * 게시일을 행사일로 표시하지 않는다.
 */
export function archiveDay(row:ActivityRecord):string{
  return row.eventDate??publishedDayKst(row.publishedAt);
}
export interface ActivityFilter{
  organizationId?:string; year?:number; campus?:ActivityRecord['campus'];
  kind?:ActivityRecord['kind']; query?:string;
}
/** 객체 키 순서와 무관하게 기록 내용을 비교할 표준 형태다. */
function canonical(row:ActivityRecord):string{
  return JSON.stringify(Object.keys(row).sort().map(k=>[k,row[k as keyof ActivityRecord]]));
}
/**
 * asOf까지 게시·검증된 sourceId별 최신 판본을 선택한다(게시 시각 우선, 그 다음 revisionId).
 * 같은 최신 판본의 복사본이 권리·상태·날짜·문구에서 다르면 입력 순서로 선택하지 않고 출처 전체를 격리한다.
 * 완전히 같은 복사본만 하나로 합친다.
 */
function sourceHeadsAt(parsed:readonly ActivityRecord[],time:number):Map<string,ActivityRecord>{
  const newest=new Map<string,ActivityRecord[]>();
  for(const item of parsed){
    if(epoch(item.publishedAt)>time||epoch(item.verifiedAt)>time)continue;
    const prev=newest.get(item.sourceId)?.[0];
    const order=!prev?1:epoch(item.publishedAt)-epoch(prev.publishedAt)
      ||(item.revisionId<prev.revisionId?-1:item.revisionId>prev.revisionId?1:0);
    if(order>0)newest.set(item.sourceId,[item]);
    else if(order===0)newest.get(item.sourceId)!.push(item);
  }
  const heads=new Map<string,ActivityRecord>();
  for(const [sourceId,rows] of newest)
    if(new Set(rows.map(canonical)).size===1)heads.set(sourceId,rows[0]!);
  return heads;
}
/** 더 최신 판본이 철회되거나 차단되면 과거 승인판을 다시 사용하지 않고 보수적으로 차단한다. */
export function currentActivityRecords(raw:readonly ActivityRecord[],asOf:string):ActivityRecord[]{
  const time=epoch(asOf);
  const parsed=ActivityRecordSchema.array().max(10000).parse(raw);
  const heads=sourceHeadsAt(parsed,time);
  const latest=[...heads.values()].filter(item=>item.rights==='APPROVED'&&item.status!=='DELETED');
  const events=new Map<string,ActivityRecord>();
  const tied=new Set<string>();
  for(const item of latest){
    const y=item.eventDate?year(item.eventDate):year(publishedDayKst(item.publishedAt));
    const key=item.organizationId+':'+item.seriesId+':'+y;
    const prev=events.get(key);
    const order=!prev?1:epoch(item.publishedAt)-epoch(prev.publishedAt)
      ||(item.revisionId<prev.revisionId?-1:item.revisionId>prev.revisionId?1:0);
    if(order>0){events.set(key,item);tied.delete(key);}
    // 같은 시각·판본이라도 출처 내용이 다르면 어느 쪽도 승자로 선정하지 않는다.
    else if(order===0&&canonical(item)!==canonical(prev!))tied.add(key);
  }
  for(const key of tied)events.delete(key);
  return [...events.values()].sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)||a.entryId.localeCompare(b.entryId));
}
export function archiveActivities(raw:readonly ActivityRecord[],asOf:string,filter:ActivityFilter={}):ActivityRecord[]{
  const query=(filter.query||'').trim().toLocaleLowerCase('ko');
  return currentActivityRecords(raw,asOf).filter(row=>
    (!filter.organizationId||row.organizationId===filter.organizationId)
    &&(filter.year===undefined||year(archiveDay(row))===filter.year)
    &&(!filter.campus||row.campus===filter.campus||row.campus==='BOTH')
    &&(!filter.kind||row.kind===filter.kind)
    &&(!query||(row.title+' '+row.organizationId+' '+row.seriesId)
      .toLocaleLowerCase('ko').includes(query)));
}
export function forecastActivity(raw:readonly ActivityRecord[],asOf:string,targetYear:number,
  organizationId:string,seriesId:string):ActivityForecast{
  epoch(asOf);
  if(!Number.isInteger(targetYear)||targetYear<2000||targetYear>2200)throw new RangeError('targetYear');
  const records=currentActivityRecords(raw,asOf).filter(row=>
    row.organizationId===organizationId&&row.seriesId===seriesId);
  const selected=records.find(row=>row.eventDate&&year(row.eventDate)===targetYear
    &&(row.status==='CONFIRMED'||row.status==='CANCELLED'));
  const prior=records.filter(row=>row.status==='CONFIRMED'&&row.eventDate&&year(row.eventDate)<targetYear
    &&Date.parse(row.eventDate+'T00:00:00Z')<=epoch(asOf)).sort((a,b)=>a.eventDate!.localeCompare(b.eventDate!));
  const byYear=new Map<number,ActivityRecord>();
  for(const row of prior)byYear.set(year(row.eventDate!),row);
  const history=[...byYear.values()].sort((a,b)=>a.eventDate!.localeCompare(b.eventDate!));
  const evidence=history.map(x=>x.revisionId);
  const observedYears=history.map(x=>year(x.eventDate!));
  const result=(state:ActivityForecast['state'],confidence:ActivityForecast['confidence'],reason:string,
    from?:string,to?:string,leading?:ActivityRecord):ActivityForecast=>ActivityForecastSchema.parse({
    organizationId,seriesId,targetYear,asOf,state,confidence,observedYears,
    evidenceRefs:leading?[leading.revisionId,...evidence]:evidence,reason,
    ...(from?{from}:{}),...(to?{to}:{}),
  });
  // 검증된 행사 취소 공지는 정확한 행사일이 없어도 대상 연도의 일정 결과보다 먼저 확인한다.
  // 행사와 취소 공지가 서로 다른 연도의 보관함에 있을 수 있기 때문이다(예: 2027 행사 공지 2026-10, 취소 2026-12).
  // supersedes 연결은 asOf 기준 유효하고 검증·승인된 최신 판본을 가리킬 때만 신뢰한다.
  // 연결이 미확정이면 보류하고 더 나중에 나온 날짜가 명시된 기록만 우선 적용한다.
  const time=epoch(asOf);
  const heads=sourceHeadsAt(ActivityRecordSchema.array().max(10000).parse(raw),time);
  const trustedTarget=(ref:string)=>[...heads.values()].find(row=>
    (row.revisionId===ref||row.entryId===ref)&&row.organizationId===organizationId
    &&row.seriesId===seriesId&&row.rights==='APPROVED'&&row.status!=='DELETED'&&row.eventDate);
  const lastHeld=records.filter(row=>row.status==='CONFIRMED'&&row.eventDate
    &&Date.parse(row.eventDate+'T00:00:00Z')<=time).map(row=>row.eventDate!).sort().at(-1);
  const supersededBySelected=(cancel:ActivityRecord)=>!!selected&&epoch(selected.publishedAt)>epoch(cancel.publishedAt);
  for(const cancel of records.filter(row=>row.status==='CANCELLED'&&!row.eventDate)){
    if(supersededBySelected(cancel))continue;
    const target=cancel.supersedes===undefined?undefined:trustedTarget(cancel.supersedes);
    if(target){
      if(year(target.eventDate!)===targetYear)return result('CANCELLED','NONE',
        '해당 연도 행사를 대상으로 한 확인된 취소 공지가 있습니다(정확한 날짜 미기재).',
        undefined,undefined,cancel);
      continue;
    }
    const published=publishedDayKst(cancel.publishedAt);
    if((lastHeld===undefined||published>lastHeld)&&targetYear>=year(published))
      return result('UNKNOWN','NONE',
        '날짜가 없는 취소 공지가 있어 어느 회차의 취소인지 확인될 때까지 예측을 보류합니다.',
        undefined,undefined,cancel);
  }
  if(selected)return result(selected.status==='CANCELLED'?'CANCELLED':'CONFIRMED','NONE',
    '해당 연도의 확인된 출처가 과거 패턴보다 우선합니다.',selected.eventDate,selected.eventDate,selected);
  if(history.length<2)return result('INSUFFICIENT_DATA','NONE','서로 다른 연도의 개최 근거가 2개 미만입니다.');
  const dates=history.map(r=>dayOfYear(r.eventDate!));
  const spread=Math.max(...dates)-Math.min(...dates);
  if(spread>45)return result('UNKNOWN','NONE','과거 개최 시기 분산이 커서 예측을 보류합니다.');
  const confidence=history.length>=3&&spread<=21?'MEDIUM':'LOW';
  const from=windowDate(targetYear,Math.min(...dates),-7);
  const to=windowDate(targetYear,Math.max(...dates),7);
  return result('PREDICTED',confidence,'과거 반복 행사로 추정한 대략적 기간입니다. 공식 확정 일정이 아닙니다.',from,to);
}
