// @ts-check
import {faqClauses,faqWords,isGenericFaqWord,synonymsOf,textBigrams,wordBigrams,wordMatches} from './faq-text.js';

/** 검색 가능한 문단 한 건이다. 출처 이용권·판본·asOf 필터는 먼저 faq.js에서 수행한다. */
/** @typedef {{key:string,title:string,text:string}} FaqSearchItem */
/** @typedef {{key:string,score:number,matchedWords:number}} FaqSearchHit */
/** @typedef {{limit?:number,minMatchedShare?:number}} FaqSearchOptions */
const K1=1.2,B=0.75;

/**
 * 한국어 FAQ 문단을 문자 2그램 BM25와 질문 내용어 일치 문턱값으로 결정적으로 검색한다.
 * '학교 식당 메뉴'처럼 주제와 맞지 않는 질문은 약한 후보 여러 개를 근거인 것처럼 제시하지 않고 NOT_FOUND로 처리한다.
 * 복합 질문은 절마다 별도로 문턱값을 검사한다.
 */
/** @param {string} question @param {readonly FaqSearchItem[]} items @param {FaqSearchOptions} [opts] @returns {FaqSearchHit[]} 근거 문단 검색 후보 */
export function searchFaqParagraphs(question,items,opts={}){
  const {limit=6,minMatchedShare=0.5}=opts;
  if(items.length===0)return [];
  // FAQ 제목은 주제를 나타내므로 두 배 가중하고 본문은 상세 정보를 제공한다.
  // 제목 유사도만으로 충분한 근거라고 판단하지 않는다.
  const docs=items.map(item=>{
    const grams=[...textBigrams(item.title),...textBigrams(item.title),...textBigrams(item.text)];
    /** @type {Map<string,number>} */
    const tf=new Map();
    for(const g of grams)tf.set(g,(tf.get(g)||0)+1);
    return {key:item.key,tf,len:grams.length,set:new Set(grams)};
  });
  const avg=docs.reduce((s,d)=>s+d.len,0)/docs.length||1;
  /** @type {Map<string,number>} */
  const df=new Map();
  for(const d of docs)for(const g of d.set)df.set(g,(df.get(g)||0)+1);
  const clauses=faqClauses(question).map(c=>[...new Set(faqWords(c))]).filter(ws=>ws.length>0);
  /** @type {Map<string,FaqSearchHit>} */
  const best=new Map();
  for(const words of clauses){
    const topical=words.filter(w=>!isGenericFaqWord(w));
    if(topical.length===0)continue;
    // 각 질문 절의 IDF를 문단마다 다시 계산하지 않는다.
    const terms=[...new Set(words.flatMap(w=>synonymsOf(w).flatMap(wordBigrams)))]
      .map(g=>{const n=df.get(g)||0;return {gram:g,weight:Math.log(1+(docs.length-n+0.5)/(n+0.5))};});
    // 주제어가 한두 개면 모두 일치해야 한다. 예를 들어 '주차 등록'은 '4주차까지'와 다르다.
    // 긴 질문은 내용어 일치 비율을 사용한다.
    const needed=topical.length<=2?topical.length:Math.ceil(topical.length*minMatchedShare);
    for(const d of docs){
      const matchedWords=topical.filter(w=>wordMatches(w,d.set)).length;
      // BM25 점수가 높아도 필수 주제어가 부족하면 답변 근거 후보에 포함하지 않는다.
      if(matchedWords<needed)continue;
      let score=0;
      for(const {gram,weight} of terms){
        const f=d.tf.get(gram)||0;
        if(f)score+=weight*f*(K1+1)/(f+K1*(1-B+B*d.len/avg));
      }
      const prev=best.get(d.key);
      if(!prev||score>prev.score)best.set(d.key,{key:d.key,score,matchedWords});
    }
  }
  // 점수가 같으면 문단 키로 정렬해 같은 입력에서 검색 결과 순서를 재현한다.
  return [...best.values()].sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key)).slice(0,limit);
}
