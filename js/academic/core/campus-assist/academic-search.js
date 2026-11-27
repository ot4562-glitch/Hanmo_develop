// @ts-check
/**
 * 학사공지 검색용 한국어 질의 정규화(#53). 공지 메타데이터 검색(notice-search.js)이 이 결과를 사용한다.
 *
 * 원 질의를 보존하고 NFKC·공백·띄어쓰기 복합어·흔한 오타·교내 약칭 변형을 만든다.
 * 학수번호 모양 토큰·학번·날짜·숫자는 보호 토큰으로 분리해 어떤 교정도 적용하지 않는다.
 *
 * 정보처 서면 회신(2026-11-23)에 따라 이 모듈에서 학사 FAQ 분야, 교수명·분반 검색, 학생별 적용 판정 경로를 제거했다.
 * 오타·약칭 사전은 코드에 고정한 작은 목록이며, #40 검수 평가에서 이득이 확인되기 전에는 운영 화면 품질을 주장하지 않는다.
 */
/** @typedef {'COURSE_CODE'|'COHORT'|'DATE'|'NUMBER'} ProtectedKind */
/** @typedef {{kind:ProtectedKind,text:string}} ProtectedToken */
/** @typedef {{from:string,to:string,kind:'TYPO'|'ABBREVIATION'|'SPACING'}} QueryCorrection */
/**
 * variants[0]은 항상 정규화한 원 질의다. 나머지는 교정·확장 변형이며 중복을 제거한다.
 * @typedef {{original:string,normalized:string,variants:string[],corrections:QueryCorrection[],protectedTokens:ProtectedToken[]}} NormalizedQuery
 */
import {normalizeFaqText} from './faq-text.js';

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


