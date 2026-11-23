// @ts-check
/**
 * #51 학생 조건별 중요공지 후보와 검수된 마감 분류(순수 코어). 학생 화면에는 아직 연결하지 않는다.
 *
 * 입력: #46 공지 추출 결과(NoticeExtraction), 판본별 사람 검수 기록, 학생이 직접 입력한 조건, 기준 시각.
 * 출력: 공지별 적용 상태(YES/NO/UNKNOWN)와 이유·근거 위치, 검색용 주제, 행동 중요도, 마감 상태,
 *       그리고 상단 고정(최대 2건)·원문 확인·기한 경과·취소 목록.
 *
 * 원칙
 * - 적용 상태는 추출된 대상 근거와 학생 입력만으로 판정한다. 대상이 적혀 있지 않으면 UNKNOWN이다.
 * - 검색용 주제 분류는 중요도·검수 여부·마감 확정을 바꾸지 않는다(별도 필드).
 * - 필수 여부와 학생 마감 확정은 사람 검수 기록에서만 온다. 검수 기록의 판본이 다르면 무효(STALE_REVIEW)다.
 * - 정확한 학생 마감은 시각이 있고 연도를 추정하지 않았으며 검수자가 확인한 경우뿐이다.
 * - 학생 조건은 '내정보'의 자기 입력이라, YES도 '입력한 조건 기준'이라는 뜻이다. 학적 확인이 아니다.
 */
/** @typedef {import("./notice-extract.js").NoticeExtraction} NoticeExtraction */
/** @typedef {import("./notice-extract.js").SourceSpan} SourceSpan */
/** @typedef {import("./notice-extract.js").StudentGroup} StudentGroup */
/** @typedef {import("./notice-extract.js").TargetCandidate} TargetCandidate */
/** @typedef {'YES'|'NO'|'UNKNOWN'} Applicability */
/** @typedef {'COURSE'|'MAJOR'|'GRADUATION'|'STATUS'|'GRADE'|'SCHOLARSHIP'|'EXCHANGE'|'OTHER'} NoticeTopic */
/** @typedef {'CRITICAL_DUE'|'ACADEMIC_REQUIRED'|'PERSONAL'|'GENERAL'|'UNKNOWN'} NoticeImportance */
/** @typedef {'REVIEWED'|'UNREVIEWED'|'STALE_REVIEW'|'EXCLUDED'|'CANCELLED'} NoticeReviewState */
/** @typedef {'WITHIN_7_DAYS'|'UPCOMING'|'PASSED'|'NOT_EXACT'|'NONE'} DeadlineState */
/** @typedef {{revisionId:string,required:boolean,studentDeadlineConfirmed:boolean}} NoticeReview */
/** @typedef {{extraction:NoticeExtraction,title:string,sourceUrl:string,review?:NoticeReview}} PriorityNoticeInput */
/** @typedef {{campus?:'SEOUL'|'GLOBAL',cohort?:number,groups?:StudentGroup[]}} StudentConditions */
/** @typedef {{state:Applicability,reasons:string[],evidence:SourceSpan[]}} ApplicabilityResult */
/** @typedef {{noticeId:string,revisionId:string,title:string,sourceUrl:string,topics:NoticeTopic[],applicability:ApplicabilityResult,reviewState:NoticeReviewState,importance:NoticeImportance,deadline:{state:DeadlineState,atKst:string|null},reasons:string[]}} PrioritizedNotice */
/** @typedef {{asOf:string,notices:PrioritizedNotice[],pinned:PrioritizedNotice[],checkOriginal:PrioritizedNotice[],passed:PrioritizedNotice[],cancelled:PrioritizedNotice[]}} NoticePrioritySummary */

const DAY=86400000;
/** 띄어쓰기·약칭이 달라도 주제를 찾을 수 있게 글자 사이 공백을 허용한다. 주제는 검색용이다. */
/** @type {[NoticeTopic,RegExp][]} */
const TOPIC_RULES=[
  ['COURSE',/수\s*강\s*신\s*청|수신|수\s*강\s*정\s*정|수\s*강\s*취\s*소|계\s*절\s*학\s*기|강\s*의\s*평\s*가|폐\s*강/],
  ['MAJOR',/이\s*중\s*전\s*공|복전|부\s*전\s*공|전\s*공\s*(?:신\s*청|변\s*경|포\s*기|심\s*화|배\s*정)/],
  ['GRADUATION',/졸\s*업|졸시|학\s*위|외\s*국\s*어\s*인\s*증|논\s*문/],
  ['STATUS',/휴\s*학|복\s*학|등\s*록\s*금|자\s*퇴|학\s*적/],
  ['GRADE',/성\s*적|학\s*점\s*포\s*기|재\s*수\s*강|학\s*점\s*교\s*류/],
  ['SCHOLARSHIP',/장\s*학/],
  ['EXCHANGE',/교\s*환\s*학\s*생|파\s*견|해\s*외\s*연\s*수/],
];

/**
 * 공지 제목과 추출 근거 문구로 검색용 주제를 정한다. 여러 주제가 동시에 나올 수 있다.
 * @param {string} title 공지 제목
 * @returns {NoticeTopic[]}
 */
export function noticeTopics(title){
  const found=TOPIC_RULES.filter(([,re])=>re.test(title)).map(([t])=>t);
  return found.length?found:['OTHER'];
}

/**
 * 추출된 대상 근거와 학생 입력을 비교한다. 명확한 불일치만 NO, 정보가 모자라면 UNKNOWN이다.
 * @param {NoticeExtraction} x 공지 추출 결과
 * @param {StudentConditions} s 학생이 입력한 조건
 * @returns {ApplicabilityResult}
 */
export function noticeApplicability(x,s){
  const {included,excluded}=x.targets;
  /** @type {string[]} */
  const unknown=[];
  /** @type {SourceSpan[]} */
  const evidence=[];
  /** @param {string} reason @param {TargetCandidate[]} rows */
  const no=(reason,rows)=>({state:/** @type {Applicability} */('NO'),reasons:[reason],evidence:rows.map(r=>r.evidence)});
  if(!included.length&&!excluded.length)return {state:'UNKNOWN',reasons:['TARGET_UNSTATED'],evidence:[]};

  const campusIn=included.filter(t=>t.value.kind==='CAMPUS');
  const campusOut=excluded.filter(t=>t.value.kind==='CAMPUS');
  if(campusIn.length||campusOut.length){
    if(!s.campus)unknown.push('CAMPUS_NOT_GIVEN');
    else{
      const out=campusOut.filter(t=>t.value.kind==='CAMPUS'&&t.value.campus===s.campus);
      if(out.length)return no('CAMPUS_EXCLUDED',out);
      if(campusIn.length&&!campusIn.some(t=>t.value.kind==='CAMPUS'&&t.value.campus===s.campus))return no('CAMPUS_MISMATCH',campusIn);
      evidence.push(...campusIn.map(t=>t.evidence));
    }
  }
  /** @param {TargetCandidate} t @param {number} y */
  const inYears=(t,y)=>t.value.kind==='ADMISSION_YEARS'&&(t.value.from===undefined||y>=t.value.from)&&(t.value.until===undefined||y<=t.value.until);
  const yearIn=included.filter(t=>t.value.kind==='ADMISSION_YEARS');
  const yearOut=excluded.filter(t=>t.value.kind==='ADMISSION_YEARS');
  if(yearIn.length||yearOut.length){
    if(s.cohort===undefined)unknown.push('COHORT_NOT_GIVEN');
    else{
      const cohort=s.cohort;
      const out=yearOut.filter(t=>inYears(t,cohort));
      if(out.length)return no('COHORT_EXCLUDED',out);
      if(yearIn.length&&!yearIn.some(t=>inYears(t,cohort)))return no('COHORT_MISMATCH',yearIn);
      evidence.push(...yearIn.filter(t=>inYears(t,cohort)).map(t=>t.evidence));
    }
  }
  const groupIn=included.filter(t=>t.value.kind==='STUDENT_GROUP');
  const groupOut=excluded.filter(t=>t.value.kind==='STUDENT_GROUP');
  if(groupIn.length||groupOut.length){
    if(!s.groups)unknown.push(groupIn.length?'GROUP_NOT_GIVEN':'EXCLUSION_UNCHECKED');
    else{
      const mine=new Set(s.groups);
      const out=groupOut.filter(t=>t.value.kind==='STUDENT_GROUP'&&mine.has(t.value.group));
      if(out.length)return no('GROUP_EXCLUDED',out);
      if(groupIn.length&&!groupIn.some(t=>t.value.kind==='STUDENT_GROUP'&&mine.has(t.value.group)))return no('GROUP_MISMATCH',groupIn);
      evidence.push(...groupIn.filter(t=>t.value.kind==='STUDENT_GROUP'&&mine.has(t.value.group)).map(t=>t.evidence));
    }
  }
  // 대상 충돌이나 부정·예외 문장이 있으면 규칙만으로 YES를 확정하지 않는다(NO는 위에서 이미 반환).
  if(x.reviewReasons.includes('CONFLICTING_TARGET'))unknown.push('CONFLICTING_TARGET');
  if(x.reviewReasons.includes('NEGATION_OR_EXCEPTION')&&!unknown.length)unknown.push('EXCEPTION_NEEDS_REVIEW');
  return unknown.length?{state:'UNKNOWN',reasons:unknown,evidence}:{state:'YES',reasons:['TARGET_MATCHED'],evidence};
}

/**
 * 공지 목록을 학생 기준으로 분류하고 상단 고정 후보를 고른다.
 * @param {{notices:readonly PriorityNoticeInput[],student:StudentConditions,asOf:string}} input
 * @returns {NoticePrioritySummary}
 */
export function prioritizeNotices(input){
  const now=Date.parse(input.asOf);
  if(!Number.isFinite(now))throw new RangeError('Invalid asOf');
  const ids=new Set();
  const provenances=new Set();
  for(const n of input.notices){
    const key=n.extraction.noticeId+'\u0000'+n.extraction.revisionId;
    if(ids.has(key))throw new RangeError('Duplicate notice revision: '+n.extraction.noticeId);
    ids.add(key);provenances.add(n.extraction.provenance);
  }
  if(provenances.size>1)throw new RangeError('Mixed synthetic and real notices');

  /** @type {PrioritizedNotice[]} */
  const notices=input.notices.map(n=>{
    const x=n.extraction;
    /** @type {string[]} */
    const reasons=[];
    /** @type {NoticeReviewState} */
    let reviewState;
    if(x.status==='EXCLUDED')reviewState='EXCLUDED';
    else if(x.revisionLink?.kind==='CANCELLATION')reviewState='CANCELLED';
    else if(!n.review)reviewState='UNREVIEWED';
    // 검수 기록은 판본에 묶인다. 공지가 정정되면 이전 판본의 검수·필수·마감 확인을 이어받지 않는다.
    else if(n.review.revisionId!==x.revisionId)reviewState='STALE_REVIEW';
    else reviewState='REVIEWED';
    reasons.push('REVIEW_'+reviewState);

    const applicability=reviewState==='EXCLUDED'||reviewState==='CANCELLED'
      ?{state:/** @type {Applicability} */('UNKNOWN'),reasons:['NOT_EVALUATED'],evidence:[]}
      :noticeApplicability(x,input.student);

    /** @type {{state:DeadlineState,atKst:string|null}} */
    let deadline={state:'NONE',atKst:null};
    const d=x.studentDeadline;
    if(d){
      const exact=reviewState==='REVIEWED'&&n.review?.studentDeadlineConfirmed===true&&d.atKst!==null&&!d.yearInferred;
      if(!exact){deadline={state:'NOT_EXACT',atKst:null};reasons.push('DEADLINE_NOT_EXACT');}
      else{
        const at=Date.parse(/** @type {string} */(d.atKst));
        const state=at<=now?'PASSED':at-now<=7*DAY?'WITHIN_7_DAYS':'UPCOMING';
        deadline={state,atKst:d.atKst};
        reasons.push('DEADLINE_'+state);
      }
    }

    /** @type {NoticeImportance} */
    let importance;
    if(reviewState!=='REVIEWED'||applicability.state==='UNKNOWN')importance='UNKNOWN';
    else if(applicability.state==='NO')importance='GENERAL';
    else if(n.review?.required&&deadline.state==='WITHIN_7_DAYS')importance='CRITICAL_DUE';
    else if(n.review?.required)importance='ACADEMIC_REQUIRED';
    else importance='PERSONAL';

    return {noticeId:x.noticeId,revisionId:x.revisionId,title:n.title,sourceUrl:n.sourceUrl,topics:noticeTopics(n.title),
      applicability,reviewState,importance,deadline,reasons};
  });

  /** @param {PrioritizedNotice} a @param {PrioritizedNotice} b */
  const byDeadline=(a,b)=>(a.deadline.atKst??'').localeCompare(b.deadline.atKst??'')||a.noticeId.localeCompare(b.noticeId);
  const pinned=notices.filter(n=>n.importance==='CRITICAL_DUE').sort(byDeadline).slice(0,2);
  const passed=notices.filter(n=>n.deadline.state==='PASSED'&&n.applicability.state!=='NO').sort(byDeadline);
  const cancelled=notices.filter(n=>n.reviewState==='CANCELLED');
  // 대상 불명·미검수 공지는 숨기지 않고 원문 확인 목록에 둔다. 학생 대상이 아닌 것(NO)과 제외·취소는 넣지 않는다.
  const checkOriginal=notices.filter(n=>n.reviewState!=='EXCLUDED'&&n.reviewState!=='CANCELLED'
    &&n.applicability.state!=='NO'&&n.deadline.state!=='PASSED'
    &&(n.reviewState!=='REVIEWED'||n.applicability.state==='UNKNOWN'))
    .sort((a,b)=>a.noticeId.localeCompare(b.noticeId));
  return {asOf:input.asOf,notices,pinned,checkOriginal,passed,cancelled};
}
