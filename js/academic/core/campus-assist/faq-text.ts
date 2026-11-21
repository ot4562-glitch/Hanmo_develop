/**
 * 검색과 답변 근거 검사에서 공유하는 한국어 텍스트 처리 함수다.
 * 형태소 모델 대신 흔한 조사·어미 하나를 제거하고 문자 2그램을 비교한다.
 * '교환학생은'과 '교환학생'을 매칭하고 한 글자 오타에는 대부분의 2그램을 유지한다.
 */

/** 질문 주제를 식별하지 않는 군더더기 표현 목록이다. 프롬프트 유도 동사는 검색 순위에 영향을 주지 못하도록 제외한다. */
const STOP=new Set([
  '알려줘','알려주세요','알려','뭐야','뭐예요','뭔가요','언제','언제야','언제예요','언제인가요','얼마','얼마야','얼마예요',
  '얼마나','어떻게','어디','어디서','어디에서','누구','무엇','무슨','어떤','몇','좀','제','저','나','내','저는','제가',
  '혹시','그리고','그럼','근데','해줘','해주세요','궁금해요','궁금합니다','싶어요','싶은데','있나요','있어요','되나요',
  '돼요','하나요','가능한가요','가능해요','방법','하고','싶은데','싶어','물어봐','물어봐요','필요해요','필요한가요',
  '이전','지시','무시','모든','규칙','시스템','프롬프트',
]);
// 길이가 긴 어미부터 제거해 '신청하려면'에서는 '면'이 아니라 '하려면'을 제거한다.
const SUFFIXES=[
  '까지입니다','에서는','이에요','인가요','인데요','입니다','합니다','하려면','하나요','되나요','할까요','했어요',
  '니다','해요','해야','해도','돼요','려면','어야','아야','하면','으면','나요','는데','에서','부터','까지','으로','이랑',
  '하고','예요','은','는','이','가','을','를','에','의','도','야','요','로','랑','만',
].sort((a,b)=>b.length-a.length);
/** FAQ 주제를 구별하지 않는 공통 단어다. 점수 계산에는 참여해도 관련성 문턱값을 만족시키지는 못한다. */
const GENERIC=new Set(['과목','수업','학교','학생','대학','대학교','우리','학과','관련','정보','내용','문의']);
export function isGenericFaqWord(w:string):boolean{return GENERIC.has(w);}
/** 학내 표현의 작은 동의어 목록이다. 원래 질의어나 동의어 중 하나가 맞으면 일치로 본다. */
const SYNONYMS:Readonly<Record<string,readonly string[]>>={
  복전:['이중전공'],이중전공:['복전'],학점:['평점'],평점:['학점'],토플:['toefl'],toefl:['토플'],토익:['toeic'],
  toeic:['토익'],아이엘츠:['ielts'],ielts:['아이엘츠'],수신:['수강신청'],드랍:['수강취소'],드롭:['수강취소'],
  비번:['비밀번호'],봉사:['사회봉사'],공결:['출석인정'],휴학계:['휴학'],교환:['교환학생'],국장:['국가장학금'],
};

/** 문자열 비교 시 NFKC 정규화, 소문자화, 단일 공백으로 처리해 줄바꿈과 공백 차이에 영향받지 않게 한다. */
export function normalizeFaqText(s:string):string{
  return s.normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g,' ').trim();
}
/** 강의·평가·진로·제도·추가 같은 두 글자 단어는 조사 결합보다 명사일 가능성이 높으므로 한 글자를 버리지 않는다. */
const NOUN_FINAL=new Set(['의','가','도','로','이']);
/** 내요·와요·중에 등에서 한 글자만 남은 것은 동사·대명사 조각일 수 있어 나중에 제외한다. */
function stem(w:string):string{
  for(const suf of SUFFIXES){
    if(w.length<=suf.length||!w.endsWith(suf))continue;
    if(w.length-suf.length===1&&NOUN_FINAL.has(suf))return w;
    return w.slice(0,-suf.length);
  }
  return w;
}
/** 불용어와 한 글자 어간을 제거한 내용어 목록이다. 긴 숫자 식별자는 검색 주제로 취급하지 않는다. */
export function faqWords(s:string):string[]{
  return normalizeFaqText(s).replace(/[^\p{L}\p{N}\s]/gu,' ').split(' ')
    .filter(w=>w&&!STOP.has(w)).map(stem)
    .filter(w=>w.length>=2&&!STOP.has(w)&&!/^\d{5,}$/.test(w));
}
export function wordBigrams(w:string):string[]{
  const out:string[]=[];
  for(let i=0;i<w.length-1;i++)out.push(w.slice(i,i+2));
  return out;
}
export function textBigrams(s:string):string[]{
  return faqWords(s).flatMap(wordBigrams);
}
export function synonymsOf(w:string):readonly string[]{
  return [w,...(SYNONYMS[w]||[])];
}
/** 짧은 단어는 전체가 일치해야 하며 긴 단어는 3개의 2그램 중 한 개 오차 정도를 허용한다. */
export function wordMatches(w:string,doc:ReadonlySet<string>):boolean{
  return synonymsOf(w).some(alt=>{
    const grams=wordBigrams(alt);
    const hit=grams.filter(g=>doc.has(g)).length;
    return grams.length<=2?hit===grams.length:hit/grams.length>=2/3;
  });
}
/** a의 중복 제거된 2그램 중 b에도 있는 비율이다. a가 비어 있으면 0을 반환한다. */
export function bigramCoverage(a:string,b:string):number{
  const left=new Set(textBigrams(a)),right=new Set(textBigrams(b));
  if(left.size===0)return 0;
  let hit=0;
  for(const g of left)if(right.has(g))hit++;
  return hit/left.size;
}
/** 3.0·1,000처럼 소수점과 천 단위 구분자를 고려한 숫자 토큰이다. */
export function faqNumbers(s:string):string[]{
  return normalizeFaqText(s).match(/\d+(?:[.,]\d+)*/g)||[];
}
/** 복합 질문을 절별로 나눠 두 번째 요청이 첫 번째 요청의 관련성 기준을 희석하지 못하게 한다. */
export function faqClauses(s:string):string[]{
  return normalizeFaqText(s).split(/[.?!\n]+|그리고|또한/).map(x=>x.trim()).filter(Boolean);
}
