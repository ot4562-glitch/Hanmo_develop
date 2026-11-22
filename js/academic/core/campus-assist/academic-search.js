// @ts-check
/**
 * #53 통합 학업 검색 코어(공지·FAQ·강의). 학생 화면에는 아직 연결하지 않는다.
 *
 * 책임 범위
 * - 질의 정규화: 원 질의를 보존하고 NFKC·공백·띄어쓰기·약칭·흔한 오타 변형을 만든다.
 *   학수번호·학번·날짜·숫자는 보호 토큰으로 분리해 어떤 교정도 적용하지 않는다.
 * - 검색 분야 분류: NOTICE/COURSE/FAQ/UNKNOWN. 애매하면 여러 분야를 모두 남긴다.
 *   이 분류는 학생 적용 대상 YES/NO/UNKNOWN 판정과 무관하다.
 * - 후보 검색·순위: 안전 필터(근거 인덱스의 HOLD 제외, 학생 조건 불일치 제외)를 먼저 적용한 뒤
 *   공지·FAQ는 기존 문자 2그램 BM25, 강의는 학수번호 정확 일치 > 과목명·교수명 > 유사 후보 순으로 정렬한다.
 *   순위 점수로 안전 필터를 되돌리지 않는다.
 *
 * 오타·약칭 사전은 코드에 고정한 작은 목록이며, #40 사람 검수 평가에서 이득이 확인되기 전에는 운영 화면에 쓰지 않는다.
 */
/** @typedef {import("./evidence-index.js").EvidenceIndexEntry} EvidenceIndexEntry */
/** @typedef {import("../../contracts/campus-assist/index.js").EvidenceConditions} EvidenceConditions */
/** @typedef {'NOTICE'|'COURSE'|'FAQ'|'UNKNOWN'} SearchDomain */
/** @typedef {'COURSE_CODE'|'COHORT'|'DATE'|'NUMBER'} ProtectedKind */
/** @typedef {{kind:ProtectedKind,text:string}} ProtectedToken */
/** @typedef {{from:string,to:string,kind:'TYPO'|'ABBREVIATION'|'SPACING'}} QueryCorrection */
/**
 * variants[0]은 항상 정규화한 원 질의다. 나머지는 교정·확장 변형이며 중복을 제거한다.
 * @typedef {{original:string,normalized:string,variants:string[],corrections:QueryCorrection[],protectedTokens:ProtectedToken[]}} NormalizedQuery
 */
/** @typedef {{primary:SearchDomain,domains:SearchDomain[],ambiguous:boolean,scores:Record<'NOTICE'|'COURSE'|'FAQ',number>}} SearchIntent */
/** @typedef {{campus?:'SEOUL'|'GLOBAL',cohort?:number,majorIds?:string[]}} SearchContext */
/** @typedef {'YES'|'NO'|'UNKNOWN'} Applicability */
/**
 * 강의 후보 한 건. 학교 원장 연결 전에는 SYNTHETIC만 들어온다.
 * @typedef {{courseKey:string,code:string,section?:string,name:string,instructors:string[],campus:'SEOUL'|'GLOBAL',term:string,sourceUrl:string,provenance:'SYNTHETIC'|'REAL_APPROVED'}} CourseItem
 */
/**
 * @typedef {{domain:'NOTICE'|'FAQ',key:string,score:number,matchedVia:'ORIGINAL'|'VARIANT',applicability:Applicability,
 *   unknownReasons:string[],entry:EvidenceIndexEntry}} EvidenceHit
 */
/** @typedef {{domain:'COURSE',key:string,score:number,tier:3|2|1,matchedVia:'ORIGINAL'|'VARIANT',course:CourseItem}} CourseHit */
/** @typedef {'OK'|'NO_MATCH'|'NOT_CONNECTED'|'FILTERED_OUT'} DomainStatus */
/** @typedef {{query:string,notices?:readonly EvidenceIndexEntry[],faqs?:readonly EvidenceIndexEntry[],courses?:readonly CourseItem[],context?:SearchContext,domainFilter?:'NOTICE'|'FAQ'|'COURSE',limit?:number}} AcademicSearchInput */
/**
 * @typedef {{query:NormalizedQuery,intent:SearchIntent,domainOrder:SearchDomain[],
 *   groups:{NOTICE:EvidenceHit[],FAQ:EvidenceHit[],COURSE:CourseHit[]},
 *   status:Record<'NOTICE'|'FAQ'|'COURSE',DomainStatus>,
 *   excluded:{held:string[],outOfScope:string[]},
 *   emptyGuidance:null|{retryQuery:string,suggestions:string[],showOfficialLinks:true}}} AcademicSearchResult
 */
import {searchFaqParagraphs} from './faq-search.js';
import {normalizeFaqText,faqWords,wordMatches,textBigrams} from './faq-text.js';

// ───────────── 정규화 ─────────────

/** 흔한 오타 → 표준 표기. 한 글자 차이로 다른 뜻이 되는 단어는 넣지 않는다. */
/** @type {Readonly<Record<string,string>>} */
const TYPOS={
  수강신철:'수강신청',수강신쳥:'수강신청',수강싱청:'수강신청',수강신천:'수강신청',
  이중전궁:'이중전공',이중젼공:'이중전공',졸업시헙:'졸업시험',졸업시엄:'졸업시험',
  휴학싱청:'휴학신청',복학싱청:'복학신청',계절학긔:'계절학기',장학굼:'장학금',
};
/** 교내 약칭 → 정식 명칭. 원래 약칭도 함께 검색한다. */
/** @type {Readonly<Record<string,string>>} */
const ABBREVIATIONS={
  복전:'이중전공',부전:'부전공',수신:'수강신청',졸시:'졸업시험',수강정정:'수강신청 정정',
  계학:'계절학기',국장:'국가장학금',전필:'전공필수',교필:'교양필수',
};
/** 띄어 써도 하나로 묶어 검색할 복합어. 글자 사이 공백을 허용하는 정규식으로 찾는다. */
const COMPOUNDS=['수강신청','이중전공','부전공','졸업시험','졸업논문','계절학기','학점교류','성적정정','수강취소',
  '휴학신청','복학신청','전공심화','교환학생','장학금','출석인정','졸업요건','외국어인증'];
/** @param {string} word */
const spacedPattern=word=>new RegExp([...word].map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s*'),'g');
const COMPOUND_RES=COMPOUNDS.map(w=>/** @type {[string,RegExp]} */([w,spacedPattern(w)]));

/** 보호 토큰 정규식. 교정 사전은 한글 단어에만 적용되지만, 보호 토큰은 원문 그대로 결과에 남긴다. */
const PROTECTED=/** @type {[ProtectedKind,RegExp][]} */([
  ['COURSE_CODE',/\b[a-z]{2,6}\d{3,6}[a-z]?\b/gi],
  ['COHORT',/\d{2,4}\s*학번/g],
  ['DATE',/20\d{2}\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]\s*\d{1,2}\s*일?|\d{1,2}\s*월\s*\d{1,2}\s*일/g],
  ['NUMBER',/\d+(?:\.\d+)?/g],
]);

/**
 * 원 질의를 보존하고 검색용 변형을 만든다. 보호 토큰은 교정하지 않고 그대로 둔다.
 * @param {string} raw 학생이 입력한 원 질의
 * @returns {NormalizedQuery}
 */
export function normalizeAcademicQuery(raw){
  if(typeof raw!=='string')throw new TypeError('query must be a string');
  const normalized=normalizeFaqText(raw);
  if(!normalized||normalized.length>200)throw new RangeError('Invalid search query length');
  /** @type {ProtectedToken[]} */
  const protectedTokens=[];
  let masked=normalized;
  for(const [kind,re] of PROTECTED){
    masked=masked.replace(re,m=>{protectedTokens.push({kind,text:m.trim()});return ' '.repeat(m.length);});
  }
  /** @type {QueryCorrection[]} */
  const corrections=[];
  // 보호 토큰 위치는 공백으로 가렸으므로 사전 교정이 숫자·학수번호를 바꾸지 못한다.
  let joined=normalized;
  for(const [word,re] of COMPOUND_RES){
    re.lastIndex=0;
    // 복합어 사전은 한글만 담고 있어 보호 토큰(숫자·영문 학수번호)과 겹치지 않는다.
    joined=joined.replace(re,m=>{
      if(m!==word)corrections.push({from:m,to:word,kind:'SPACING'});
      return word;
    });
  }
  const words=masked.split(/\s+/).filter(Boolean);
  let corrected=joined;
  for(const w of words){
    for(const [typo,fix] of Object.entries(TYPOS)){
      if(w.includes(typo)){corrected=corrected.split(typo).join(fix);corrections.push({from:typo,to:fix,kind:'TYPO'});}
    }
  }
  let expanded=corrected;
  for(const w of corrected.split(/\s+/)){
    // '부전공'처럼 이미 정식 명칭이거나 복합어로 시작하는 단어는 약칭으로 보지 않는다('부전'+'공' 오인 방지).
    if(COMPOUNDS.some(c=>w.startsWith(c)))continue;
    const base=Object.keys(ABBREVIATIONS).find(a=>w===a||(w.startsWith(a)&&w.length<=a.length+2&&!w.startsWith(ABBREVIATIONS[a])));
    if(base){expanded=expanded+' '+ABBREVIATIONS[base];corrections.push({from:base,to:ABBREVIATIONS[base],kind:'ABBREVIATION'});}
  }
  const variants=[...new Set([normalized,joined,corrected,expanded])];
  const seen=new Set();
  return {original:raw,normalized,variants,
    corrections:corrections.filter(c=>{const k=c.kind+c.from+c.to;if(seen.has(k))return false;seen.add(k);return true;}),
    protectedTokens};
}

// ───────────── 검색 분야 분류 ─────────────

const COURSE_CUES=/강의|강좌|분반|교수|과목|시간표|개설|수업|학수번호|원어강의|온라인강의/;
const NOTICE_CUES=/공지|안내|일정|기간|마감|접수|신청\s*기간|발표|모집|언제/;
const FAQ_CUES=/어떻게|방법|가능|되나요|되요|돼요|할\s*수\s*있|조건|기준|몇\s*학점|필요|해야|인가요|나요|\?/;

/**
 * 규칙 기반 검색 분야 분류. 점수 차가 작거나 단서가 없으면 여러 분야를 남긴다(한 분야로 단정하지 않음).
 * @param {NormalizedQuery} q
 * @returns {SearchIntent}
 */
export function classifySearchIntent(q){
  const text=q.variants.join(' ');
  /** @type {Record<'NOTICE'|'COURSE'|'FAQ',number>} */
  const scores={NOTICE:0,COURSE:0,FAQ:0};
  if(q.protectedTokens.some(t=>t.kind==='COURSE_CODE'))scores.COURSE+=2;
  if(COURSE_CUES.test(text))scores.COURSE+=1;
  if(NOTICE_CUES.test(text))scores.NOTICE+=1;
  if(FAQ_CUES.test(text))scores.FAQ+=1;
  const ranked=/** @type {('NOTICE'|'COURSE'|'FAQ')[]} */(['NOTICE','COURSE','FAQ'])
    .filter(d=>scores[d]>0).sort((a,b)=>scores[b]-scores[a]);
  if(!ranked.length)return {primary:'UNKNOWN',domains:['NOTICE','FAQ','COURSE'],ambiguous:true,scores};
  const top=scores[ranked[0]];
  const close=ranked.filter(d=>top-scores[d]<1);
  return {primary:close.length>1?'UNKNOWN':ranked[0],domains:ranked,ambiguous:close.length>1,scores};
}

// ───────────── 학생 조건 적용 ─────────────

/**
 * 근거 문단의 적용 조건과 학생 조건을 비교한다. 조건 미기재·학생 값 미입력은 UNKNOWN이다(전체 대상으로 보지 않음).
 * @param {EvidenceConditions|null} c
 * @param {SearchContext} ctx
 * @returns {{applicability:Applicability,reasons:string[]}}
 */
export function evidenceApplicability(c,ctx){
  if(!c)return {applicability:'UNKNOWN',reasons:['CONDITIONS_UNSTATED']};
  /** @type {string[]} */
  const unknown=[];
  if(c.campuses){
    if(!ctx.campus)unknown.push('CAMPUS_NOT_GIVEN');
    else if(!c.campuses.includes(ctx.campus))return {applicability:'NO',reasons:['CAMPUS_MISMATCH']};
  }
  if(c.admissionYears){
    if(ctx.cohort===undefined)unknown.push('COHORT_NOT_GIVEN');
    else if((c.admissionYears.from!==undefined&&ctx.cohort<c.admissionYears.from)
      ||(c.admissionYears.until!==undefined&&ctx.cohort>c.admissionYears.until))return {applicability:'NO',reasons:['COHORT_MISMATCH']};
  }
  if(c.majors){
    if(!ctx.majorIds?.length)unknown.push('MAJOR_NOT_GIVEN');
    else if(!c.majors.some(m=>ctx.majorIds?.includes(m)))return {applicability:'NO',reasons:['MAJOR_MISMATCH']};
  }
  return unknown.length?{applicability:'UNKNOWN',reasons:unknown}:{applicability:'YES',reasons:[]};
}

// ───────────── 검색 ─────────────

/**
 * 공지·FAQ 근거 문단을 변형 질의로 검색하고 문단별 최고 점수를 남긴다.
 * @param {NormalizedQuery} q
 * @param {readonly EvidenceIndexEntry[]} entries 안전 필터를 통과한 문단만
 * @param {number} limit
 * @returns {{key:string,score:number,matchedVia:'ORIGINAL'|'VARIANT'}[]}
 */
function searchEvidence(q,entries,limit){
  const items=entries.map(e=>({key:e.citationId,title:e.title,text:e.text}));
  /** @type {Map<string,{key:string,score:number,matchedVia:'ORIGINAL'|'VARIANT'}>} */
  const best=new Map();
  q.variants.forEach((v,i)=>{
    for(const h of searchFaqParagraphs(v,items,{limit:Math.min(50,items.length||1)})){
      const prev=best.get(h.key);
      // 원 질의로 찾은 결과를 교정 변형 결과보다 우선 표시해, 교정이 원래 의도를 덮지 않게 한다.
      const via=i===0?'ORIGINAL':'VARIANT';
      if(!prev||h.score>prev.score||(via==='ORIGINAL'&&prev.matchedVia==='VARIANT'&&h.score>=prev.score))
        best.set(h.key,{key:h.key,score:h.score,matchedVia:prev?.matchedVia==='ORIGINAL'?'ORIGINAL':via});
    }
  });
  return [...best.values()].sort((a,b)=>b.score-a.score||(a.key<b.key?-1:a.key>b.key?1:0)).slice(0,limit);
}

/** @param {string} s */
const compact=s=>normalizeFaqText(s).replace(/\s+/g,'');

/**
 * 강의 후보 순위: 학수번호(+분반) 정확 일치 3단계 > 과목명·교수 표시명 포함 2단계 > 2그램 유사 1단계.
 * 서로 다른 학수번호를 제목이 비슷하다는 이유로 같은 과목으로 묶지 않는다.
 * @param {NormalizedQuery} q
 * @param {readonly CourseItem[]} courses
 * @param {number} limit
 * @returns {CourseHit[]}
 */
function searchCourses(q,courses,limit){
  const codes=q.protectedTokens.filter(t=>t.kind==='COURSE_CODE').map(t=>t.text.toUpperCase());
  /** @type {CourseHit[]} */
  const hits=[];
  for(const c of courses){
    const code=c.code.toUpperCase();
    if(codes.includes(code)||codes.includes(code+(c.section??''))){
      hits.push({domain:'COURSE',key:c.courseKey,score:100,tier:3,matchedVia:'ORIGINAL',course:c});continue;
    }
    let found=/** @type {null|{tier:2|1,score:number,via:'ORIGINAL'|'VARIANT'}} */(null);
    q.variants.forEach((v,i)=>{
      const via=i===0?'ORIGINAL':'VARIANT';
      // 학수번호 토큰은 정확 일치 단계에서만 쓰고, 과목명·교수명 비교에서는 뺀다.
      const stripped=codes.reduce((acc,code)=>acc.split(code.toLowerCase()).join(' '),v);
      const words=faqWords(stripped).filter(w=>!/^\d+$/.test(w));
      if(!words.length)return;
      const names=[c.name,...c.instructors].map(compact);
      const contained=words.filter(w=>names.some(n=>n.includes(w))).length;
      if(contained===words.length){
        const score=10+contained;
        if(!found||found.tier<2||score>found.score)found={tier:2,score,via:found?.via==='ORIGINAL'?'ORIGINAL':via};
        return;
      }
      const grams=new Set(textBigrams([c.name,...c.instructors].join(' ')));
      const fuzzy=words.filter(w=>wordMatches(w,grams)).length;
      if(fuzzy===words.length&&(!found||found.tier<2&&fuzzy>found.score))found={tier:1,score:fuzzy,via};
    });
    if(found)hits.push({domain:'COURSE',key:c.courseKey,score:found.score,tier:found.tier,matchedVia:found.via,course:c});
  }
  return hits.sort((a,b)=>b.tier-a.tier||b.score-a.score||(a.key<b.key?-1:a.key>b.key?1:0)).slice(0,limit);
}

/**
 * 통합 검색. 분야별 결과를 따로 돌려주며, 분류가 애매해도 다른 분야 결과를 버리지 않는다.
 * @param {AcademicSearchInput} input 검색 입력. notices·faqs·courses가 undefined면 그 분야는 데이터 미연결(NOT_CONNECTED)이다.
 * @returns {AcademicSearchResult}
 */
export function searchAcademic(input){
  const limit=input.limit??10;
  if(!Number.isInteger(limit)||limit<1||limit>50)throw new RangeError('Invalid limit');
  const query=normalizeAcademicQuery(input.query);
  const intent=classifySearchIntent(query);
  const ctx=input.context??{};
  const provenances=new Set([...(input.notices??[]),...(input.faqs??[])].map(e=>e.provenance)
    .concat((input.courses??[]).map(c=>c.provenance)));
  if(provenances.size>1)throw new RangeError('Mixed synthetic and real search sources');
  for(const [list,kind] of /** @type {const} */([[input.notices,'NOTICE'],[input.faqs,'FAQ']]))
    if(list?.some(e=>e.kind!==kind))throw new RangeError('Entry kind does not match its domain list');

  /** @type {string[]} */
  const held=[];
  /** @type {string[]} */
  const outOfScope=[];
  /**
   * 안전 필터: HOLD 문단과 학생 조건이 명확히 맞지 않는 문단(NO)은 순위 계산 전에 제외한다.
   * @param {readonly EvidenceIndexEntry[]} list
   */
  const safe=list=>list.filter(e=>{
    if(e.status!=='READY'){held.push(e.citationId);return false;}
    if(evidenceApplicability(e.conditions,ctx).applicability==='NO'){outOfScope.push(e.citationId);return false;}
    return true;
  });
  /**
   * @param {'NOTICE'|'FAQ'} domain
   * @param {readonly EvidenceIndexEntry[]|undefined} list
   * @returns {{hits:EvidenceHit[],status:DomainStatus}}
   */
  const evidenceDomain=(domain,list)=>{
    if(list===undefined)return {hits:[],status:'NOT_CONNECTED'};
    if(input.domainFilter&&input.domainFilter!==domain)return {hits:[],status:'FILTERED_OUT'};
    const allowed=safe(list);
    const byKey=new Map(allowed.map(e=>[e.citationId,e]));
    const hits=searchEvidence(query,allowed,limit).map(h=>{
      const entry=/** @type {EvidenceIndexEntry} */(byKey.get(h.key));
      const a=evidenceApplicability(entry.conditions,ctx);
      return {domain,key:h.key,score:h.score,matchedVia:h.matchedVia,applicability:a.applicability,unknownReasons:a.reasons,entry};
    });
    return {hits,status:hits.length?'OK':'NO_MATCH'};
  };
  const notices=evidenceDomain('NOTICE',input.notices);
  const faqs=evidenceDomain('FAQ',input.faqs);
  /** @type {{hits:CourseHit[],status:DomainStatus}} */
  let courses;
  if(input.courses===undefined)courses={hits:[],status:'NOT_CONNECTED'};
  else if(input.domainFilter&&input.domainFilter!=='COURSE')courses={hits:[],status:'FILTERED_OUT'};
  else{
    // 학생 캠퍼스가 정해졌으면 다른 캠퍼스 분반은 후보에서 뺀다. 미입력이면 모두 남긴다.
    const scoped=input.courses.filter(c=>{
      if(ctx.campus&&c.campus!==ctx.campus){outOfScope.push(c.courseKey);return false;}
      return true;
    });
    const hits=searchCourses(query,scoped,limit);
    courses={hits,status:hits.length?'OK':'NO_MATCH'};
  }
  /** @type {SearchDomain[]} */
  const domainOrder=[...intent.domains.filter(d=>d!=='UNKNOWN'),
    ...(/** @type {SearchDomain[]} */(['NOTICE','FAQ','COURSE'])).filter(d=>!intent.domains.includes(d))];
  const total=notices.hits.length+faqs.hits.length+courses.hits.length;
  return {
    query,intent,domainOrder,
    groups:{NOTICE:notices.hits,FAQ:faqs.hits,COURSE:courses.hits},
    status:{NOTICE:notices.status,FAQ:faqs.status,COURSE:courses.status},
    excluded:{held:[...new Set(held)].sort(),outOfScope:[...new Set(outOfScope)].sort()},
    emptyGuidance:total?null:{
      retryQuery:query.normalized,
      // 결과가 없을 때도 교정을 사실로 확정하지 않고 '이 표현으로 다시 찾기' 제안으로만 돌려준다.
      suggestions:[...new Set(query.corrections.map(c=>c.to))],
      showOfficialLinks:true,
    },
  };
}
