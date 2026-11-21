import type {AcademicAgendaItem} from './academic-schedule.js';

/** 선택적 이중전공 정보를 처리하기 전에 주전공을 사용자가 명시적으로 선택해야 한다. */
export function selectedMajors(primary:string,secondary:string):string[]{
  const main=primary.trim();
  if(!main)return [];
  const double=secondary.trim();
  return double&&double!==main?[main,double]:[main];
}

/** hufs.ac.kr 아래의 HTTPS 주소는 학교 도메인 단서일 뿐 공지 내용의 검수·승인을 증명하지 않는다. */
export type AcademicSourceLink='NONE'|'HUFS_DOMAIN'|'OTHER_HTTPS';
export function academicSourceLink(raw:string|undefined):AcademicSourceLink{
  if(!raw)return 'NONE';
  try{
    const url=new URL(raw);
    if(url.protocol!=='https:')return 'NONE';
    const hostname=url.hostname.toLowerCase();
    if(url.username||url.password)return 'OTHER_HTTPS';
    return hostname==='hufs.ac.kr'||hostname.endsWith('.hufs.ac.kr')
      ?'HUFS_DOMAIN':'OTHER_HTTPS';
  }catch{return 'NONE';}
}

export type DeadlineDisplay={kind:'NONE'|'VERIFIED'|'SYNTHETIC'|'UNVERIFIED';status:string};
/** JSON에서 자가 선언한 마감일을 공식 확정처럼 보이는 D-day 안내로 만들지 않는다. */
export function studentDeadlineDisplay(item:AcademicAgendaItem):DeadlineDisplay{
  if(!item.studentDeadline)return {kind:'NONE',status:'신청 마감일 미확인'};
  const trusted=item.evidence==='SOURCE_REVIEWED'&&item.appliesTo==='YES';
  const synthetic=item.evidence==='SYNTHETIC';
  if(!trusted&&!synthetic)return {kind:'UNVERIFIED',status:'D-day 없음 · 학교 공지 원문 확인'};
  const kind=trusted?'VERIFIED':'SYNTHETIC';
  const prefix=synthetic?'가상 ':'';
  if(item.priority==='OVERDUE')return {kind,status:prefix+'마감 시점 경과'};
  if(item.daysLeft===0)return {kind,status:prefix+'오늘'};
  if(item.daysLeft!==null&&item.daysLeft>0)return {kind,status:prefix+'D-'+item.daysLeft};
  return {kind,status:prefix+'일정 확인 필요'};
}
