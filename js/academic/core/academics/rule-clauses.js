// @ts-check
/**
 * #47 학칙 원문에서 조항·단서·예외·각주를 구조화하는 독립 원문 목록 추출기(순수 코어, 규칙 기반).
 *
 * 산출물은 rule-approval.js의 decideRulePackActivation이 받는 trustedOriginal(조항 목록)과
 * numericCheck(숫자 대조 결과)의 입력이 된다. 규칙집 후보(LLM·사람이 만든 것)와 별개로
 * 원문에서 직접 만든 목록이어야 하므로, 이 모듈은 규칙집 후보를 입력으로 받지 않는다.
 *
 * 원칙
 * - 조(제N조) 구조가 없는 텍스트는 추측해서 나누지 않고 NO_ARTICLE_STRUCTURE로 보류한다.
 * - '다만'으로 시작하는 단서는 본문과 별도 EXCEPTION 조항으로 분리한다.
 * - 숫자·의무 표현은 원문 문자열 그대로 기록하며, 고치거나 단위를 추정하지 않는다.
 * - 원문 해시는 입력 텍스트(UTF-8)의 SHA-256이다. 공식 원문 파일과 같은 바이트일 때만 규칙집 해시와 일치한다.
 */
/** @typedef {'RULE'|'EXCEPTION'|'FOOTNOTE'|'SCOPE'|'PROCEDURE'} ClauseKind */
/** @typedef {'OBLIGATION'|'PROHIBITION'|'EXEMPTION'|'PERMISSION'|'NONE'} Modality */
/** @typedef {{value:number,unit:string,comparator:'이상'|'이하'|'미만'|'초과'|null,raw:string}} ClauseNumber */
/** @typedef {{clauseId:string,kind:ClauseKind,sourceSpanRef:string,sourceDocumentId:string,article:string,paragraph:number|null,item:number|null,start:number,end:number,text:string,numbers:ClauseNumber[],modality:Modality}} RuleClause */
/** @typedef {'NO_ARTICLE_STRUCTURE'|'DUPLICATE_ARTICLE'|'ID_TOO_LONG'|'EMPTY_ARTICLE'} InventoryIssue */
/** @typedef {{documentId:string,version:string,sourceDocumentSha256:string,status:'READY'|'NEEDS_REVIEW',clauses:RuleClause[],issues:{code:InventoryIssue,detail:string}[]}} ClauseInventory */
/** @typedef {{claimId:string,clauseId:string,value?:number,unit?:string,modality?:Modality}} RuleClaim */
/** @typedef {{claimId:string,reason:'CLAUSE_NOT_FOUND'|'NUMBER_NOT_IN_CLAUSE'|'MODALITY_MISMATCH'}} ClaimMismatch */
import {sha256Hex} from '../campus-assist/content-hash.js';
import {ID} from './ledger.js';

const CIRCLED='①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const ARTICLE=/제\s*(\d+)\s*조(?:\s*의\s*(\d+))?(?:\s*\(([^)\n]{1,60})\))?/y;
const NUMBER=/(\d+(?:\.\d+)?)\s*(학점|학기|년|개월|일|점|%|퍼센트|과목|시간|회|명)(?:\s*(이상|이하|미만|초과))?/g;
const SCOPE=/적용\s*(?:범위|대상)|에\s*(?:대하여|대해)\s*적용|적용한다/;
const PROCEDURE=/신청|제출|절차|승인을\s*받|허가를\s*받|접수/;

/**
 * 조항 문장의 의무 표현. 부정·면제를 가능보다 먼저 본다('할 수 없다'가 '할 수 있다'로 읽히지 않게).
 * @param {string} t 조항 원문
 * @returns {Modality}
 */
export function clauseModality(t){
  if(/할\s*수\s*없|하여서는\s*아니\s*된|해서는\s*안\s*된|금지|불가/.test(t))return 'PROHIBITION';
  if(/면제|인정하지\s*아니|적용하지\s*아니|제외한다|제외된다/.test(t))return 'EXEMPTION';
  if(/하여야\s*한다|해야\s*한다|하여야\s*하며|하여야\s*하고|필수/.test(t))return 'OBLIGATION';
  if(/할\s*수\s*있/.test(t))return 'PERMISSION';
  return 'NONE';
}
/** @param {string} t @returns {ClauseNumber[]} 원문 숫자·단위 */
function numbersOf(t){
  return [...t.matchAll(NUMBER)].map(m=>({value:Number(m[1]),unit:m[2]==='퍼센트'?'%':/** @type {string} */(m[2]),
    comparator:/** @type {ClauseNumber['comparator']} */(m[3]??null),raw:m[0]}));
}
/** @param {string} t @returns {ClauseKind} 본문 조항 종류 */
function kindOf(t){
  if(/^\s*(?:※|주\)|\[주)/.test(t))return 'FOOTNOTE';
  if(/^\s*(?:다만|단,)/.test(t))return 'EXCEPTION';
  if(SCOPE.test(t))return 'SCOPE';
  if(PROCEDURE.test(t))return 'PROCEDURE';
  return 'RULE';
}

/**
 * 학칙 원문 텍스트를 조·항·호·단서·각주 단위 조항 목록으로 만든다.
 * @param {{documentId:string,version:string,text:string}} input 문서 ID·판본·원문 텍스트
 * @returns {ClauseInventory}
 */
export function extractRuleClauses(input){
  const {documentId,version,text}=input;
  if(!ID.test(documentId)||!ID.test(version))throw new RangeError('documentId and version must be IDs');
  if(typeof text!=='string'||!text.trim()||text.length>200000)throw new RangeError('Invalid source text');
  const sourceDocumentSha256=sha256Hex(text);
  /** @type {{code:InventoryIssue,detail:string}[]} */
  const issues=[];

  // 줄 머리의 '제N조'만 조문 시작으로 본다. 본문 안의 '제3조에 따라' 같은 참조는 나누지 않는다.
  /** @type {{label:string,start:number,bodyStart:number}[]} */
  const articles=[];
  let addendum=false,offset=0;
  for(const line of text.split('\n')){
    const lead=line.length-line.trimStart().length;
    if(/^\s*부\s*칙/.test(line))addendum=true;
    ARTICLE.lastIndex=lead;
    const m=ARTICLE.exec(line);
    if(m)articles.push({label:(addendum?'ADD.':'')+m[1]+(m[2]?'-'+m[2]:''),start:offset+lead,bodyStart:offset+lead+m[0].length});
    offset+=line.length+1;
  }
  if(!articles.length){
    issues.push({code:'NO_ARTICLE_STRUCTURE',detail:documentId});
    return {documentId,version,sourceDocumentSha256,status:'NEEDS_REVIEW',clauses:[],issues};
  }
  const labels=articles.map(a=>a.label);
  for(const dup of new Set(labels.filter((l,i)=>labels.indexOf(l)!==i)))issues.push({code:'DUPLICATE_ARTICLE',detail:dup});

  /** @type {RuleClause[]} */
  const clauses=[];
  /**
   * @param {string} article @param {number|null} paragraph @param {number|null} item
   * @param {number} start @param {number} end @param {ClauseKind} [forced]
   */
  const push=(article,paragraph,item,start,end,forced)=>{
    // 앞뒤 공백을 원문 위치에서 잘라 근거 위치가 실제 문자열과 일치하게 한다.
    while(start<end&&/\s/.test(text[start]??''))start++;
    while(end>start&&/\s/.test(text[end-1]??''))end--;
    if(end<=start)return;
    const body=text.slice(start,end);
    const seq=clauses.filter(c=>c.article===article&&c.paragraph===paragraph&&c.item===item).length;
    const clauseId=`${documentId}:A${article}`+(paragraph!==null?`:P${paragraph}`:'')+(item!==null?`:I${item}`:'')+(seq?`:S${seq}`:'');
    const sourceSpanRef=`${documentId}.${version}:${start}-${end}`;
    if(!ID.test(clauseId)||!ID.test(sourceSpanRef)){issues.push({code:'ID_TOO_LONG',detail:clauseId.slice(0,60)});return;}
    clauses.push({clauseId,kind:forced??kindOf(body),sourceSpanRef,sourceDocumentId:documentId,article,paragraph,item,
      start,end,text:body,numbers:numbersOf(body),modality:clauseModality(body)});
  };
  /**
   * 한 단위(항·호)를 본문과 '다만' 단서로 나눈다.
   * @param {string} article @param {number|null} paragraph @param {number|null} item @param {number} s @param {number} e
   */
  const unit=(article,paragraph,item,s,e)=>{
    const seg=text.slice(s,e);
    const proviso=/(?:^|[.。]\s*)(다만|단,)/.exec(seg);
    if(proviso){
      const at=s+proviso.index+proviso[0].indexOf(/** @type {string} */(proviso[1]));
      push(article,paragraph,item,s,at);
      push(article,paragraph,item,at,e,'EXCEPTION');
    }else push(article,paragraph,item,s,e);
  };

  articles.forEach((a,ai)=>{
    const end=ai+1<articles.length?/** @type {{start:number}} */(articles[ai+1]).start:text.length;
    const body=text.slice(a.bodyStart,end);
    if(!body.trim()){issues.push({code:'EMPTY_ARTICLE',detail:a.label});return;}
    // 항(①…) 경계와 각주(※) 줄을 찾는다. 항이 없으면 조 전체가 한 단위다.
    /** @type {{kind:'P'|'F',n:number,at:number}[]} */
    const marks=[];
    for(let i=0;i<body.length;i++){
      const ci=CIRCLED.indexOf(body[i]??'');
      if(ci>=0)marks.push({kind:'P',n:ci+1,at:a.bodyStart+i});
    }
    for(const m of body.matchAll(/(?:^|\n)\s*(※|주\)|\[주)/g))marks.push({kind:'F',n:0,at:a.bodyStart+/** @type {number} */(m.index)+m[0].indexOf(/** @type {string} */(m[1]))});
    marks.sort((x,y)=>x.at-y.at);
    const firstMark=marks[0]?.at??end;
    if(firstMark>a.bodyStart)itemsIn(a.label,null,a.bodyStart,firstMark);
    marks.forEach((m,mi)=>{
      const next=mi+1<marks.length?/** @type {{at:number}} */(marks[mi+1]).at:end;
      if(m.kind==='F')push(a.label,null,null,m.at,next,'FOOTNOTE');
      else itemsIn(a.label,m.n,m.at+1,next);
    });
  });
  /**
   * 호(줄 머리 '1.')로 나눈다. 호가 없으면 항 전체를 한 단위로 본다.
   * @param {string} article @param {number|null} paragraph @param {number} s @param {number} e
   */
  function itemsIn(article,paragraph,s,e){
    const seg=text.slice(s,e);
    const items=[...seg.matchAll(/\n\s*(\d{1,2})\.\s/g)];
    const head=items[0]?s+/** @type {number} */(items[0].index):e;
    unit(article,paragraph,null,s,head);
    items.forEach((m,i)=>{
      const from=s+/** @type {number} */(m.index);
      const to=i+1<items.length?s+/** @type {number} */(items[i+1]?.index):e;
      unit(article,paragraph,Number(m[1]),from,to);
    });
  }
  return {documentId,version,sourceDocumentSha256,status:issues.length?'NEEDS_REVIEW':'READY',clauses,issues};
}

/**
 * 규칙집 후보의 숫자·의무 주장을 원문 조항과 대조한다. numericCheck는 decideRulePackActivation 입력 형식이다.
 * 숫자 주장은 같은 조항에 같은 값·단위가 원문 그대로 있을 때만 일치로 센다.
 * @param {ClauseInventory} inventory 원문에서 만든 조항 목록
 * @param {readonly RuleClaim[]} claims 규칙집 후보에서 뽑은 주장
 * @returns {{numericCheck:{matched:number,total:number},mismatches:ClaimMismatch[]}}
 */
export function checkRuleClaims(inventory,claims){
  const byId=new Map(inventory.clauses.map(c=>[c.clauseId,c]));
  /** @type {ClaimMismatch[]} */
  const mismatches=[];
  let total=0,matched=0;
  for(const c of claims){
    const clause=byId.get(c.clauseId);
    if(!clause){mismatches.push({claimId:c.claimId,reason:'CLAUSE_NOT_FOUND'});if(c.value!==undefined)total++;continue;}
    if(c.value!==undefined){
      total++;
      if(clause.numbers.some(n=>n.value===c.value&&(c.unit===undefined||n.unit===c.unit)))matched++;
      else mismatches.push({claimId:c.claimId,reason:'NUMBER_NOT_IN_CLAUSE'});
    }
    if(c.modality!==undefined&&clause.modality!==c.modality)mismatches.push({claimId:c.claimId,reason:'MODALITY_MISMATCH'});
  }
  return {numericCheck:{matched,total},mismatches};
}

/**
 * 조항 ↔ 요건 ID 양방향 연결 검사.
 * 규칙·예외 조항이 어떤 요건에도 연결되지 않았거나, 요건이 원문 목록에 없는 조항을 가리키면 보고한다.
 * 범위·절차·각주 조항은 요건과 직접 연결되지 않을 수 있어 미연결 경고에서 뺀다.
 * @param {ClauseInventory} inventory 원문에서 만든 조항 목록
 * @param {readonly {requirementId:string,clauseIds:readonly string[]}[]} links 요건별 근거 조항
 * @returns {{unlinkedClauses:string[],unknownClauseRefs:{requirementId:string,clauseId:string}[]}}
 */
export function crossCheckRequirementLinks(inventory,links){
  const known=new Set(inventory.clauses.map(c=>c.clauseId));
  const linked=new Set(links.flatMap(l=>l.clauseIds));
  return {
    unlinkedClauses:inventory.clauses.filter(c=>(c.kind==='RULE'||c.kind==='EXCEPTION')&&!linked.has(c.clauseId)).map(c=>c.clauseId),
    unknownClauseRefs:links.flatMap(l=>l.clauseIds.filter(id=>!known.has(id)).map(clauseId=>({requirementId:l.requirementId,clauseId}))),
  };
}
