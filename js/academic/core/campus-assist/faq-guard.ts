import type {FaqCandidate} from '../../contracts/campus-assist/index.js';
import {bigramCoverage,faqNumbers,normalizeFaqText} from './faq-text.js';

/** 검색된 문단 한 건에서 답변 검증기가 필요로 하는 정보다. */
export interface FaqGuardEvidence{citationId:string;title:string;text:string;}
export type FaqRejectReason=
  |'DUPLICATE_CITATION'|'UNKNOWN_CITATION'|'QUOTE_TOO_SHORT'|'QUOTE_NOT_IN_SOURCE'
  |'NUMBER_NOT_QUOTED'|'AMOUNT_NOT_QUOTED'|'RELATIVE_DATE_NOT_IN_SOURCE'|'NEGATION_NOT_IN_SOURCE'
  |'NEGATION_DROPPED'|'UNSUPPORTED_CLAIM'|'ELIGIBILITY_VERDICT'|'URL_OR_CONTACT';
/** 공백을 제외하고 이보다 짧은 인용은 대부분의 문단에서도 우연히 찾을 수 있다. */
export const FAQ_MIN_QUOTE_CHARS=8;
/** 답변의 문자 2그램 중 인용 문단에서 확인돼야 하는 최소 비율이다. */
export const FAQ_MIN_SUPPORT=0.6;
/**
 * 답변 문장은 가장 비슷한 근거 문장의 긍정·부정 의미를 유지해야 한다.
 * 겹침이 이 문턱값보다 낮으면 지지 문장이 없으므로 UNSUPPORTED_CLAIM으로 판정한다.
 */
const POLARITY_MIN_OVERLAP=0.3;

// 서술어의 부정만 검출한다. '신청서 없이 할 수 있습니다'의 '없이'는 행위 가능을 부정하지 않는다.
// '못 해요'와 붙여 쓴 '못합니다/못해요/못했/못함'을 함께 확인한다.
// '안 되다'는 독립 단어일 때만 부정으로 본다. '보안 됩니다'나 '안내됩니다'는 긍정이다.
const NEGATION=/아니|아닙|아님|않|없(?!이|는)|불가|못(?:\s|하|해|했|합|함)|(?<![가-힣])안\s*(?:되|돼|됐|됩|됨)|금지|제외/;
/**
 * '기간 제한 없는' 같은 부수적 수식어와 행위 가능·불가의 극성을 구별한다.
 * 문단 전체의 부정 여부 하나로 판단하지 말고 행위별 패턴을 우선한다.
 */
function modalClaims(sentence:string):{action:string;negative:boolean}[]{
  const matches:{action:string;negative:boolean}[]=[];
  for(const m of sentence.matchAll(/([가-힣]*(?:할|될|받을))\s*수\s*(있|없)/g)){
    matches.push({action:m[1]!,negative:m[2]==='없'});
  }
  return matches;
}
// FAQ에는 '3.0 이상이면 지원할 수 있다'는 일반 규칙을 담을 수 있지만 질문자의 실제 지원 자격을 판정하면 안 된다.
const VERDICT=/불합격|합격|탈락|선발\s*(?:가능|확정|됩|될|되)|자격\s*(?:을|이)?\s*(?:충족|갖추|갖췄|있|됩|된|없)|지원\s*(?:가능|하실\s*수|할\s*수\s*(?:있|없))|\bpass\b|\bfail\b/i;
const PERSONAL=/입력하신|말씀하신|알려주신|회원님|학생분|당신|귀하|질문자|조건이면|경우라면|이시면|이시므로|하셨으니|하셨으므로/;
const RELATIVE=/오늘|내일|모레|어제|이번\s*(?:주|달|학기)|다음\s*(?:주|달|학기)|지난\s*(?:주|달)|금주|차주|월말|주말|조만간|[월화수목금토일]요일/g;
const KOREAN_AMOUNT=/[일이삼사오육칠팔구]?[십백천만억][일이삼사오육칠팔구십백천만억]*\s*(?:원|학점|명|시간|퍼센트)/g;
// 세 개 학기·삼 학기·두 번처럼 한글로 적힌 수량도 숫자와 마찬가지로 정확한 원문 인용을 요구한다.
const KOREAN_COUNT=/(?<![\p{L}\p{N}])(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|일|이|삼|사|오|육|칠|팔|구)\s*(?:개\s*)?(?:학기|학점|개월|년|명|회|번|주|시간|과목|개)(?![\p{L}\p{N}])/gu;
const LINK=/https?:\/\/|www\.|[\w.+-]+@[\w-]+\.[\w.-]+|\b0\d{1,2}-\d{3,4}-\d{4}\b/i;

function splitSentences(s:string):string[]{
  return s.split(/(?<=[.?!。])\s+|\n+/).map(x=>x.trim()).filter(x=>x.length>1);
}
/** 답변 문장을 가장 많이 뒷받침하는 인용·근거 문장이다. 동률이면 먼저 나열된 직접 인용을 우선한다. */
function bestSupport(sentence:string,sources:readonly string[]):string|undefined{
  let best:string|undefined,score=POLARITY_MIN_OVERLAP;
  for(const candidate of sources){
    const value=bigramCoverage(sentence,candidate);
    if(value>score||value===score&&!best){best=candidate;score=value;}
  }
  return best;
}

/**
 * HCX-007 FAQ 후보의 코드 수준 근거 검증이다. 결과가 비면 모든 답변 주장이 인용 근거에 연결됐다는 뜻이다.
 * 숫자·한글 수량은 검증된 인용 안에 있어야 하고 문구·상대 날짜는 근거 문단에서 나와야 한다.
 * 각 문장의 부정 의미도 원문과 같아야 하며 개인의 자격을 확정하는 답변은 항상 금지한다.
 */
export function checkFaqCandidate(candidate:FaqCandidate,evidence:readonly FaqGuardEvidence[]):FaqRejectReason[]{
  const reasons=new Set<FaqRejectReason>();
  const refs=new Map(evidence.map(e=>[e.citationId,e]));
  if(refs.size!==evidence.length||new Set(candidate.citations.map(c=>c.citationId)).size!==candidate.citations.length)
    reasons.add('DUPLICATE_CITATION');
  const quotes:string[]=[],cited:string[]=[],sentences:string[]=[];
  for(const item of candidate.citations){
    const paragraph=refs.get(item.citationId);
    if(!paragraph){reasons.add('UNKNOWN_CITATION');continue;}
    const quote=normalizeFaqText(item.quote);
    if(quote.replace(/\s/g,'').length<FAQ_MIN_QUOTE_CHARS){reasons.add('QUOTE_TOO_SHORT');continue;}
    if(!normalizeFaqText(paragraph.text).includes(quote)){reasons.add('QUOTE_NOT_IN_SOURCE');continue;}
    quotes.push(quote);cited.push(normalizeFaqText(paragraph.title+' '+paragraph.text));
  }
  for(const q of quotes)sentences.push(...splitSentences(q));
  for(const c of cited)sentences.push(...splitSentences(c));
  const answer=normalizeFaqText(candidate.answer);
  if(LINK.test(answer))reasons.add('URL_OR_CONTACT');
  const quoted=quotes.join(' '),source=cited.join(' ');
  const allowed=new Set(faqNumbers(quoted));
  if(faqNumbers(answer).some(n=>!allowed.has(n)))reasons.add('NUMBER_NOT_QUOTED');
  for(const m of [...answer.match(KOREAN_AMOUNT)||[],...answer.match(KOREAN_COUNT)||[]])
    if(!quoted.includes(m))reasons.add('AMOUNT_NOT_QUOTED');
  for(const m of answer.match(RELATIVE)||[])if(!source.includes(m))reasons.add('RELATIVE_DATE_NOT_IN_SOURCE');
  for(const sentence of splitSentences(answer)){
    const support=bestSupport(sentence,sentences);
    if(!support)continue;
    const claims=modalClaims(sentence),supported=modalClaims(support);
    if(claims.length&&supported.length){
      for(const claim of claims){
        const sameAction=supported.filter(s=>s.action===claim.action);
        // 하나의 출처 주장은 표현을 바꾼 하나의 가능·불가능 서술을 뒷받침할 수 있다.
        // 단어가 겹친다는 이유로 서로 다른 여러 주장을 동일하게 취급하지 않는다.
        const match=sameAction.length?sameAction:supported.length===1?supported:[];
        if(!match.length){reasons.add('UNSUPPORTED_CLAIM');continue;}
        if(!match.some(s=>s.negative===claim.negative))
          reasons.add(claim.negative?'NEGATION_NOT_IN_SOURCE':'NEGATION_DROPPED');
      }
      continue;
    }
    const negated=NEGATION.test(sentence),sourceNegated=NEGATION.test(support);
    if(negated&&!sourceNegated)reasons.add('NEGATION_NOT_IN_SOURCE');
    if(!negated&&sourceNegated)reasons.add('NEGATION_DROPPED');
  }
  if(VERDICT.test(answer)&&(PERSONAL.test(answer)||!VERDICT.test(source)))reasons.add('ELIGIBILITY_VERDICT');
  if(bigramCoverage(answer,source)<FAQ_MIN_SUPPORT)reasons.add('UNSUPPORTED_CLAIM');
  return [...reasons];
}
