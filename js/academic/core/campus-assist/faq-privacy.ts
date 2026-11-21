/**
 * 학생이 FAQ 질문에 입력할 수 있는 개인정보 식별자를 처리한다.
 * 공개 FAQ 답변에 필요 없으므로 향후 선택적 모델 전송 전에 마스킹해야 한다.
 * 단순한 '저는 …입니다'는 휴학생 같은 상태 표현일 수 있어 자동 제거하지 않는다. 화면에서 개인정보 입력 금지를 별도 안내해야 한다.
 */
import {FaqPublicContactsSchema} from '../../contracts/campus-assist/index.js';

export type FaqRedaction='RRN'|'PHONE'|'EMAIL'|'STUDENT_ID'|'NAME'|'LONG_NUMBER';
const RULES:readonly [FaqRedaction,RegExp,string][]=[
  ['RRN',/\d{6}\s*-\s*[1-4]\d{6}/g,'[주민번호]'],
  ['PHONE',/(?:\+\s?82[-\s.]?0?1[016789]|01[016789])[-\s.]?\d{3,4}[-\s.]?\d{4}/g,'[전화번호]'],
  ['EMAIL',/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,'[이메일]'],
  // '학번은 2020-12345' 또는 '학번: 2020 12345'처럼 표시 방식이 다른 학번을 찾는다.
  ['STUDENT_ID',/(학번\s*(?:은|는|이|:)?\s*)\d[\d\s-]{3,}\d/g,'$1[학번]'],
  ['NAME',/(이름\s*(?:은|는|이|:)\s*)[가-힣]{2,4}/g,'$1[이름]'],
  // 하이픈으로 나뉜 학번·식별번호도 확인한다. 더 짧은 학년도·학점·점수나 ISO 날짜(2026-03-02)는 보존한다.
  ['LONG_NUMBER',/\d{7,}|\d{2,}(?:-\d{2,})+/g,'[번호]'],
];
function keepNumber(m:string):boolean{
  return /^\d{4}-\d{1,2}-\d{1,2}$/.test(m)||m.replace(/-/g,'').length<7;
}
export function maskFaqQuestion(question:string):{text:string;redactions:FaqRedaction[]}{
  let text=question;
  const redactions:FaqRedaction[]=[];
  for(const [kind,pattern,label] of RULES){
    const next=kind==='LONG_NUMBER'?text.replace(pattern,m=>keepNumber(m)?m:label):text.replace(pattern,label);
    if(next!==text){redactions.push(kind);text=next;}
  }
  return {text,redactions};
}

/**
 * 모델의 인용 문맥을 수정하지 않고 불변 원문에서 검증한다.
 * 검토된 공개 연락처 예외는 신뢰 가능한 출처·판본 범위의 메타데이터에서만 제공할 수 있다.
 * 학과명·학교 도메인·질문자의 주장만으로 예외를 인정하지 않는다.
 */
export function faqEvidenceIsModelSafe(evidence:{text:string;publicContacts?:readonly string[]}):boolean{
  const parsed=FaqPublicContactsSchema.safeParse(evidence.publicContacts??[]);
  if(!parsed.success)return false;
  // 공개 연락처는 일반 EMAIL·LONG_NUMBER 탐지의 예외가 될 수 있지만,
  // 학번·주민등록번호·이름·휴대전화는 검토된 연락처와 우연히 같아도 개인정보로 보호한다.
  if(maskFaqQuestion(evidence.text).redactions.some(kind=>kind!=='EMAIL'&&kind!=='LONG_NUMBER'))return false;
  const allowed=new Set(parsed.data),seen=new Set<string>();
  const inspected=evidence.text.replace(
    /[\w.+-]+@[\w-]+(?:\.[\w-]+)+|(?<![\d-])(?:02|0[3-6][1-5])-\d{3,4}-\d{4}(?![\d-])/g,
    value=>{
      if(!allowed.has(value))return value;
      seen.add(value);return '[검수된 부서 문의처]';
    });
  return seen.size===allowed.size&&maskFaqQuestion(inspected).redactions.length===0;
}
