import {z} from 'zod';

/**
 * #46 학사공지에서 대상·기한·정정 후보 추출 (순수 코어, 규칙 기반).
 *
 * 입력: 재사용이 허용된(rights=APPROVED) 공지 판본 하나.
 * 출력: 필드별 '후보'와 원문 근거 위치. 어떤 값도 검수된 사실이 아니다.
 *  - status CANDIDATE: 규칙상 모호함은 없었지만 사람 검수(#42) 전에는 학생 마감·대상으로 쓰지 않는다.
 *  - status NEEDS_REVIEW: 모호하거나 충돌이 있어 독립 검수로 보낸다(reviewReasons 참고).
 *  - status EXCLUDED: 재사용 권리가 없어 추출하지 않았다.
 *
 * 원칙
 * - 게시일은 학생 마감이 아니다. 본문의 '게시일/작성일' 표기도 마감 후보에서 뺀다.
 * - 행정(학과·부서) 제출 마감과 학생 접수 마감을 분리한다.
 * - 시각이 없으면 23:59 등으로 채우지 않고 time=null + TIME_UNSTATED로 둔다.
 * - 연도가 없으면 게시일 기준으로 추정하되 YEAR_INFERRED로 검수를 요청한다.
 * - '제외·해당 없음' 문장의 대상은 포함 대상이 아니라 제외 대상으로 기록한다.
 * - 학번·날짜·고유명사를 교정하지 않는다. 인식하지 못한 표현은 그냥 추출하지 않는다.
 */
const Id=z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/);
export const NoticeExtractInputSchema=z.strictObject({
  noticeId:Id, revisionId:Id,
  title:z.string().trim().min(2).max(200),
  publishedAt:z.iso.datetime({offset:true}),
  state:z.enum(['PUBLISHED','CORRECTED','CANCELLED']),
  /** 정정·취소 판본이 대체하는 이전 판본. 출처가 알려 준 경우에만 넣는다. */
  correctsRevisionId:Id.optional(),
  rights:z.enum(['APPROVED','REVOKED','BLOCKED']),
  provenance:z.enum(['SYNTHETIC','REAL_APPROVED']),
  paragraphs:z.array(z.strictObject({id:Id,text:z.string().min(1).max(4000)})).max(60),
});
export type NoticeExtractInput=z.input<typeof NoticeExtractInputSchema>;

export interface SourceSpan{paragraphId:string;start:number;end:number;text:string;}
export type Campus='SEOUL'|'GLOBAL';
export type StudentGroup='GRADUATING'|'ENROLLED'|'ON_LEAVE'|'RETURNING'|'FRESHMAN'|'TRANSFER'
  |'INTERNATIONAL'|'DOUBLE_MAJOR'|'MINOR'|'EXCHANGE'|'GRADUATE_SCHOOL';
export type TargetValue=
  |{kind:'CAMPUS';campus:Campus}
  |{kind:'ADMISSION_YEARS';from?:number;until?:number}
  |{kind:'STUDENT_GROUP';group:StudentGroup};
export interface TargetCandidate{value:TargetValue;evidence:SourceSpan;}
export type DateRole='STUDENT_DEADLINE'|'PERIOD_START'|'ADMIN_DEADLINE'|'EVENT'|'POSTED'|'UNCLASSIFIED';
export interface DateCandidate{
  role:DateRole;
  /** 한국시간 달력 날짜. */
  date:string;
  /** 원문에 시각이 있을 때만 HH:MM. */
  time:string|null;
  /** 시각까지 있을 때만 Asia/Seoul 기준 ISO 시각. */
  atKst:string|null;
  yearInferred:boolean;
  evidence:SourceSpan;
}
export type NoticeReviewReason=
  |'RIGHTS_NOT_APPROVED'|'TIME_UNSTATED'|'YEAR_INFERRED'|'MULTIPLE_STUDENT_DEADLINES'|'MULTIPLE_ADMIN_DEADLINES'
  |'UNCLASSIFIED_DATE'|'NEGATION_OR_EXCEPTION'|'CONFLICTING_TARGET'|'INVALID_DATE'|'RANGE_REVERSED'
  |'CORRECTION_TARGET_UNKNOWN'|'CORRECTION_STATE_MISMATCH'|'CANCELLATION_STATE_MISMATCH';
export interface NoticeExtraction{
  noticeId:string;revisionId:string;provenance:NoticeExtractInput['provenance'];
  status:'CANDIDATE'|'NEEDS_REVIEW'|'EXCLUDED';
  targets:{included:TargetCandidate[];excluded:TargetCandidate[]};
  dates:DateCandidate[];
  /** STUDENT_DEADLINE 후보가 정확히 하나일 때만 채운다. */
  studentDeadline:DateCandidate|null;
  adminDeadline:DateCandidate|null;
  events:DateCandidate[];
  revisionLink:{kind:'CORRECTION'|'CANCELLATION';correctsRevisionId:string|null}|null;
  reviewReasons:NoticeReviewReason[];
}

// ───────────── 문장·절 분리 ─────────────
interface Segment{paragraphId:string;start:number;text:string;}
/** 줄바꿈과 '다./요.' 문장 끝에서 나눈다. 날짜의 '2026. 3. 2.'는 자르지 않는다. */
function sentences(paragraphId:string,text:string):Segment[]{
  const out:Segment[]=[];
  const re=/\n+|(?<=[다요]\.)\s+/g;
  let last=0;
  for(let m=re.exec(text);m;m=re.exec(text)){
    if(m.index>last)out.push({paragraphId,start:last,text:text.slice(last,m.index)});
    last=m.index+m[0].length;
  }
  if(last<text.length)out.push({paragraphId,start:last,text:text.slice(last)});
  return out.filter(s=>s.text.trim());
}
/** 대상 판정용 하위 절(쉼표·'며' 연결). '포함 대상, 제외 대상'이 한 문장에 있어도 구분한다. */
function clauses(seg:Segment):Segment[]{
  const out:Segment[]=[];
  const re=/[,，]\s*|(?<=며)\s+/g;
  let last=0;
  for(let m=re.exec(seg.text);m;m=re.exec(seg.text)){
    out.push({paragraphId:seg.paragraphId,start:seg.start+last,text:seg.text.slice(last,m.index)});
    last=m.index+m[0].length;
  }
  out.push({paragraphId:seg.paragraphId,start:seg.start+last,text:seg.text.slice(last)});
  return out.filter(s=>s.text.trim());
}
const span=(seg:Segment,from:number,to:number):SourceSpan=>
  ({paragraphId:seg.paragraphId,start:seg.start+from,end:seg.start+to,text:seg.text.slice(from,to)});

// ───────────── 대상 ─────────────
const NEGATION=/제외|해당\s*(?:하지\s*않|없)|대상이?\s*아니|대상\s*아님|신청할\s*수\s*없|신청\s*불가|불가능/;
const EXCEPTION=/(?:^|\s)단[,\s]|다만/;
const GROUPS:[RegExp,StudentGroup][]=[
  [/졸업\s*예정자/g,'GRADUATING'],[/재학생/g,'ENROLLED'],[/휴학생/g,'ON_LEAVE'],
  [/복학\s*(?:예정자|예정생|생)/g,'RETURNING'],[/신입생/g,'FRESHMAN'],[/편입생/g,'TRANSFER'],
  [/외국인\s*(?:유학생|학생)/g,'INTERNATIONAL'],[/이중\s*전공자/g,'DOUBLE_MAJOR'],[/부\s*전공자/g,'MINOR'],
  [/교환\s*학생/g,'EXCHANGE'],[/대학원생/g,'GRADUATE_SCHOOL'],
];
const year=(s:string)=>s.length===2?2000+Number(s):Number(s);
function targetsIn(seg:Segment):TargetCandidate[]{
  const found:TargetCandidate[]=[];
  const t=seg.text;
  for(const m of t.matchAll(/서울\s*캠퍼스|서울캠/g))found.push({value:{kind:'CAMPUS',campus:'SEOUL'},evidence:span(seg,m.index,m.index+m[0].length)});
  for(const m of t.matchAll(/글로벌\s*캠퍼스|글로벌캠/g))found.push({value:{kind:'CAMPUS',campus:'GLOBAL'},evidence:span(seg,m.index,m.index+m[0].length)});
  const yearRe=/(?<!\d)(\d{4}|\d{2})\s*(?:[~∼〜–-]\s*(\d{4}|\d{2})\s*)?(?:학번|학년도\s*(?:이전\s*|이후\s*)?입학(?:생|자)?)(?:\s*(이전|이후|부터|까지))?/g;
  for(const m of t.matchAll(yearRe)){
    const a=year(m[1]!),b=m[2]?year(m[2]):undefined;
    const tail=m[3]??(/학년도\s*이전/.test(m[0])?'이전':/학년도\s*이후/.test(m[0])?'이후':undefined);
    let value:TargetValue;
    if(b!==undefined)value={kind:'ADMISSION_YEARS',from:Math.min(a,b),until:Math.max(a,b)};
    else if(tail==='이전'||tail==='까지')value={kind:'ADMISSION_YEARS',until:a};
    else if(tail==='이후'||tail==='부터')value={kind:'ADMISSION_YEARS',from:a};
    else value={kind:'ADMISSION_YEARS',from:a,until:a};
    found.push({value,evidence:span(seg,m.index,m.index+m[0].length)});
  }
  for(const [re,group] of GROUPS)for(const m of t.matchAll(re))
    found.push({value:{kind:'STUDENT_GROUP',group},evidence:span(seg,m.index,m.index+m[0].length)});
  return found;
}
const targetKey=(v:TargetValue)=>JSON.stringify(v);

// ───────────── 날짜 ─────────────
const WD='(?:\\s*\\(\\s*[월화수목금토일]\\s*\\))?';
const TIME='(?:\\s*(오전|오후)?\\s*(\\d{1,2})\\s*(?::\\s*(\\d{2})|시(?:\\s*(\\d{1,2})\\s*분)?))?';
const FULL=`(20\\d{2})\\s*[.\\-/년]\\s*(\\d{1,2})\\s*[.\\-/월]\\s*(\\d{1,2})\\s*(?:일|\\.)?${WD}`;
const MD_KO=`(\\d{1,2})\\s*월\\s*(\\d{1,2})\\s*일${WD}`;
/** 연도 없는 점 표기는 요일이 있어야만 날짜로 본다('3.0 이상' 같은 숫자 오인 방지). */
const MD_DOT=`(\\d{1,2})\\s*\\.\\s*(\\d{1,2})\\s*\\.?\\s*\\(\\s*[월화수목금토일]\\s*\\)`;
const DATE_RE=new RegExp(`(?<![\\d.])(?:${FULL}|${MD_KO}|${MD_DOT})${TIME}`,'g');
/** '~' 뒤의 끝 날짜는 연·월 생략과 요일 없는 점 표기를 허용한다. */
const END_RE=new RegExp(`^\\s*(?:[~∼〜–-]|부터)\\s*(?:${FULL}|(\\d{1,2})\\s*월\\s*(\\d{1,2})\\s*일${WD}|(\\d{1,2})\\s*\\.\\s*(\\d{1,2})\\s*\\.?${WD}|(\\d{1,2})\\s*일${WD})${TIME}`);

interface RawDate{y:number|null;m:number;d:number;time:string|null;bad:boolean;from:number;to:number;}
function time(ampm:string|undefined,h:string|undefined,mm:string|undefined,mm2:string|undefined):{time:string|null;bad:boolean}{
  if(h===undefined)return {time:null,bad:false};
  let hour=Number(h);const minute=Number(mm??mm2??0);
  if(ampm==='오후'&&hour<12)hour+=12;
  if(ampm==='오전'&&hour===12)hour=0;
  if(hour>24||minute>59||(hour===24&&minute>0))return {time:null,bad:true};
  return {time:String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0'),bad:false};
}
function parseDates(t:string):{start:RawDate;end:RawDate|null}[]{
  const out:{start:RawDate;end:RawDate|null}[]=[];
  DATE_RE.lastIndex=0;
  for(let m=DATE_RE.exec(t);m;m=DATE_RE.exec(t)){
    const g=m;
    const y=g[1]?Number(g[1]):null;
    const mo=Number(g[2]??g[4]??g[6]),d=Number(g[3]??g[5]??g[7]);
    const tm=time(g[8],g[9],g[10],g[11]);
    const start:RawDate={y,m:mo,d,time:tm.time,bad:tm.bad,from:m.index,to:m.index+m[0].length};
    let end:RawDate|null=null;
    const e=END_RE.exec(t.slice(start.to));
    if(e){
      const ey=e[1]?Number(e[1]):null;
      let em=Number(e[2]??e[4]??e[6]??NaN),ed=Number(e[3]??e[5]??e[7]??e[8]);
      if(Number.isNaN(em))em=mo; // 'D일'만 있으면 시작 월을 따른다.
      const et=time(e[9],e[10],e[11],e[12]);
      end={y:ey??y,m:em,d:ed,time:et.time,bad:et.bad,from:start.to,to:start.to+e[0].length};
      DATE_RE.lastIndex=end.to;
    }
    out.push({start,end});
  }
  return out;
}
const pad=(n:number)=>String(n).padStart(2,'0');
function kstDay(iso:string){
  const d=new Date(Date.parse(iso)+9*3600000);
  return {y:d.getUTCFullYear(),m:d.getUTCMonth()+1,d:d.getUTCDate()};
}
function validDay(y:number,m:number,d:number){
  const t=new Date(Date.UTC(y,m-1,d));
  return t.getUTCFullYear()===y&&t.getUTCMonth()===m-1&&t.getUTCDate()===d;
}
function atKst(date:string,time:string):string{
  if(time==='24:00'){
    const t=new Date(Date.parse(date+'T00:00:00+09:00')+86400000+9*3600000);
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth()+1)}-${pad(t.getUTCDate())}T00:00:00+09:00`;
  }
  return `${date}T${time}:00+09:00`;
}

/** 학생이 학과에 내는 서류가 아니라 학과·부서가 주어인 제출·보고만 행정 마감으로 본다. */
const ADMIN=/(?:학과|학부|단과대학|부서|사무실|행정실)\s*(?:은|는|에서|담당자는?)\s[^\n]*?(?:제출|보고|송부|취합|발송)|(?:학과|학부|단과대학|부서)\s*(?:제출|보고|취합)\s*(?:마감|기한)|행정\s*마감|보고\s*마감|취합\s*마감/;
const STUDENT=/신청|접수|제출|등록|납부|지원|정정|취소|포기|변경/;
const EVENT=/시험일?|시행|실시|일시|개최|행사|설명회|발표|면접|오리엔테이션|기간\s*중/;
const POSTED=/게시일|작성일|공지일|게시\s*:/;
const DEADLINE=/까지|마감|기한/;
function roleOf(clause:string,isRange:boolean,end:boolean):DateRole{
  if(POSTED.test(clause))return 'POSTED';
  if(ADMIN.test(clause))return 'ADMIN_DEADLINE';
  if(STUDENT.test(clause)&&(isRange||DEADLINE.test(clause)))return isRange&&!end?'PERIOD_START':'STUDENT_DEADLINE';
  if(EVENT.test(clause))return 'EVENT';
  return 'UNCLASSIFIED';
}

// ───────────── 정정·취소 ─────────────
/** '수강신청 정정 기간' 같은 학사 용어가 아니라 공지 내용 자체를 고쳤다는 표현만 본다. */
const CORRECTION_SIGNAL=/[[(【]\s*정정\s*[\])】]|정정\s*공지|변경\s*공지|(?:내용|일정|날짜|기간|장소)\s*(?:을|를)?\s*정정|정정(?:합니다|하오니|되었)|다음과\s*같이\s*(?:정정|변경)/;
const CANCEL_TITLE=/[[(【]\s*(?:취소|철회)\s*[\])】]|(?:공지|행사|일정|설명회|시험|모집)\s*(?:취소|철회)\s*(?:공지|안내)?$/;
/** '수강취소·신청 취소' 같은 학생 행동이 아니라 공지·행사 자체의 취소를 알리는 표현만 본다. */
const CANCEL_TEXT=/(?:공지|행사|일정|설명회|시험|모집|본\s*안내)\s*(?:이|가|은|는|를|을)?\s*(?:취소|철회)(?:되었|됨|합니다|하오니|하며|되오니)/;

export function extractNoticeCandidates(raw:NoticeExtractInput):NoticeExtraction{
  const input=NoticeExtractInputSchema.parse(raw);
  const base={noticeId:input.noticeId,revisionId:input.revisionId,provenance:input.provenance};
  if(input.rights!=='APPROVED')return {...base,status:'EXCLUDED',targets:{included:[],excluded:[]},dates:[],
    studentDeadline:null,adminDeadline:null,events:[],revisionLink:null,reviewReasons:['RIGHTS_NOT_APPROVED']};
  if(new Set(input.paragraphs.map(p=>p.id)).size!==input.paragraphs.length)throw new RangeError('Duplicate paragraph ID');

  const reasons=new Set<NoticeReviewReason>();
  const included:TargetCandidate[]=[],excluded:TargetCandidate[]=[];
  const dates:DateCandidate[]=[];
  const pub=kstDay(input.publishedAt);
  const pubTime=Date.UTC(pub.y,pub.m-1,pub.d);

  const resolve=(r:RawDate,seg:Segment,role:DateRole):DateCandidate|null=>{
    let y=r.y,inferred=false;
    if(y===null){
      // 게시일보다 30일 넘게 이전이면 다음 해로 본다(예: 12월 공지의 '1월 5일'). 어느 경우든 검수 대상이다.
      y=pub.y;inferred=true;
      if(Date.UTC(y,r.m-1,r.d)<pubTime-30*86400000)y+=1;
    }
    if(r.bad||!validDay(y,r.m,r.d)){reasons.add('INVALID_DATE');return null;}
    const date=`${y}-${pad(r.m)}-${pad(r.d)}`;
    if(inferred)reasons.add('YEAR_INFERRED');
    return {role,date,time:r.time,atKst:r.time?atKst(date,r.time):null,yearInferred:inferred,evidence:span(seg,r.from,r.to)};
  };

  for(const p of input.paragraphs){
    for(const seg of sentences(p.id,p.text)){
      if(EXCEPTION.test(seg.text))reasons.add('NEGATION_OR_EXCEPTION');
      for(const c of clauses(seg)){
        const found=targetsIn(c);
        if(!found.length)continue;
        if(NEGATION.test(c.text)){excluded.push(...found);reasons.add('NEGATION_OR_EXCEPTION');}
        else included.push(...found);
      }
      // 날짜 역할은 그 날짜가 있는 절의 표현으로 정한다('신청 …, 학과는 … 제출'을 구분).
      // 절에 단서가 없으면 문장 전체로 판단하되, 문장에 학생·행정 단서가 함께 있으면 미분류로 남긴다.
      const mixed=ADMIN.test(seg.text)&&STUDENT.test(seg.text.replace(ADMIN,''));
      const role=(c:Segment,range:boolean,end:boolean)=>{
        const r=roleOf(c.text,range,end);
        return r!=='UNCLASSIFIED'||mixed?r:roleOf(seg.text,range,end);
      };
      for(const c of clauses(seg))for(const {start,end} of parseDates(c.text)){
        const s=resolve(start,c,role(c,!!end,false));
        const e=end?resolve(end,c,role(c,true,true)):null;
        if(s&&e&&(s.atKst??s.date)>(e.atKst??e.date)){reasons.add('RANGE_REVERSED');continue;}
        for(const x of [s,e])if(x)dates.push(x);
      }
    }
  }

  const inc=new Set(included.map(t=>targetKey(t.value)));
  if(excluded.some(t=>inc.has(targetKey(t.value))))reasons.add('CONFLICTING_TARGET');
  if(dates.some(d=>d.role==='UNCLASSIFIED'))reasons.add('UNCLASSIFIED_DATE');

  const single=(role:DateRole,many:NoticeReviewReason)=>{
    const rows=dates.filter(d=>d.role===role);
    const distinct=new Set(rows.map(d=>d.atKst??d.date));
    if(distinct.size>1){reasons.add(many);return null;}
    const chosen=rows[0]??null;
    if(chosen&&!chosen.time)reasons.add('TIME_UNSTATED');
    return chosen;
  };
  const studentDeadline=single('STUDENT_DEADLINE','MULTIPLE_STUDENT_DEADLINES');
  const adminDeadline=single('ADMIN_DEADLINE','MULTIPLE_ADMIN_DEADLINES');

  const body=input.paragraphs.map(p=>p.text).join('\n');
  const correctionSignal=CORRECTION_SIGNAL.test(input.title)||CORRECTION_SIGNAL.test(body);
  const cancelSignal=CANCEL_TITLE.test(input.title)||CANCEL_TEXT.test(body);
  let revisionLink:NoticeExtraction['revisionLink']=null;
  if(input.state==='CANCELLED'||cancelSignal){
    if(input.state!=='CANCELLED')reasons.add('CANCELLATION_STATE_MISMATCH');
    revisionLink={kind:'CANCELLATION',correctsRevisionId:input.correctsRevisionId??null};
  }else if(input.state==='CORRECTED'||correctionSignal){
    if(input.state!=='CORRECTED')reasons.add('CORRECTION_STATE_MISMATCH');
    revisionLink={kind:'CORRECTION',correctsRevisionId:input.correctsRevisionId??null};
  }
  if(revisionLink&&!revisionLink.correctsRevisionId)reasons.add('CORRECTION_TARGET_UNKNOWN');

  const order=(a:{evidence:SourceSpan},b:{evidence:SourceSpan})=>
    a.evidence.paragraphId===b.evidence.paragraphId?a.evidence.start-b.evidence.start:0;
  return {...base,
    status:reasons.size?'NEEDS_REVIEW':'CANDIDATE',
    targets:{included:included.sort(order),excluded:excluded.sort(order)},
    dates,studentDeadline,adminDeadline,events:dates.filter(d=>d.role==='EVENT'),
    revisionLink,reviewReasons:[...reasons].sort(),
  };
}
