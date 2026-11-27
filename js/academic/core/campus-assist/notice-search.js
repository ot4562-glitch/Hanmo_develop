// @ts-check
/**
 * #53 학사공지 메타데이터 정밀검색(순수 코어). 학생 화면과 실제 학교 자료에는 아직 연결하지 않는다(mode: disabled).
 *
 * 정보처 서면 회신(2026-11-23)과 최소 데이터 계획(docs/focused-public-data-plan.md §3)에 맞춰
 * 공지 **본문을 받지 않고** 제목·게시일·캠퍼스·분야·공식 URL·관측 시각만으로 검색한다.
 *
 * 1) screenNoticeMeta: 메타데이터 입력을 엄격히 검사한다.
 *    알 수 없는 필드, 금지 내용(교수명·개인 연락처·학칙/졸업요건·수강 정원/신청 현황)이 든 제목,
 *    같은 ID의 서로 다른 내용은 공개 후보에서 빼고 보류 사유를 남긴다. 철회된 공지는 결과에서 제외한다.
 * 2) searchNoticeMeta: 원 질의와 오타·띄어쓰기·약칭 변형으로 제목을 검색하고 캠퍼스·분야·게시일 필터를 적용한다.
 *    필터와 보류 판단을 순위 점수로 되돌리지 않는다. 비슷한 제목은 합치지 않고 표시만 한다.
 */
/** @typedef {import("./academic-search.js").NormalizedQuery} NormalizedQuery */
/** @typedef {z.infer<typeof NoticeMetaSchema>} NoticeMeta */
/** @typedef {'SCHEMA_INVALID'|'FORBIDDEN_CONTENT'|'ID_HAS_HELD_COPY'|'CONFLICTING_DUPLICATE'|'MIXED_PROVENANCE'} HoldReason */
/** @typedef {{noticeId:string|null,reason:HoldReason,detail:string}} HeldNotice */
/** @typedef {{accepted:NoticeMeta[],held:HeldNotice[],withdrawn:string[]}} ScreenResult */
/** @typedef {'SEOUL'|'GLOBAL'} CampusFilter */
/** @typedef {{campus?:CampusFilter,categories?:readonly NoticeMeta['category'][],postedFrom?:string,postedTo?:string}} NoticeFilters */
/** @typedef {{query?:string,notices?:readonly unknown[],filters?:NoticeFilters,sort?:'RELEVANCE'|'RECENT',limit?:number}} NoticeSearchInput */
/** @typedef {{noticeId:string,title:string,postedOn:string,campus:NoticeMeta['campus'],category:NoticeMeta['category'],sourceUrl:string,observedAt:string,corrected:boolean,score:number|null,matchedVia:'ORIGINAL'|'VARIANT'|null,similarTitleIds:string[]}} NoticeHit */
/** @typedef {{status:'OK'|'NO_MATCH'|'NOT_CONNECTED',query:NormalizedQuery|null,hits:NoticeHit[],total:number,coverage:null|{postedFrom:string,postedTo:string,lastObservedAt:string,count:number},held:HeldNotice[],emptyGuidance:null|{retryQuery:string|null,suggestions:string[],showOfficialLinks:true}}} NoticeSearchResult */
import {z} from 'zod';
import {normalizeAcademicQuery} from './academic-search.js';
import {searchFaqParagraphs} from './faq-search.js';
import {normalizeFaqText} from './faq-text.js';

const Id=z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/);
const Day=z.iso.date();
/**
 * 공지 메타데이터 DTO v2 후보. 본문·첨부·작성자·교수명 필드는 계약에 없으며, 있으면 SCHEMA_INVALID로 보류된다.
 * provenance의 REVIEWED는 내부 독립 검수를 뜻하며 학교의 승인·인증이 아니다.
 */
export const NoticeMetaSchema=z.strictObject({
  noticeId:Id,
  title:z.string().trim().min(2).max(200),
  postedOn:Day,
  campus:z.enum(['SEOUL','GLOBAL','BOTH','UNKNOWN']),
  category:z.enum(['COURSE','MAJOR','STATUS','GRADE','SCHOLARSHIP','EXCHANGE','EVENT','GENERAL']),
  sourceId:Id,
  sourceUrl:z.url().startsWith('https://').max(1000),
  observedAt:z.iso.datetime({offset:true}),
  state:z.enum(['ACTIVE','CORRECTED','WITHDRAWN']),
  policyVersion:Id,
  provenance:z.enum(['SYNTHETIC','REVIEWED']),
});

/**
 * 제목에 들어오면 공개하지 않는 내용. 서면 회신의 명시 금지 항목과 개인정보를 제목 단계에서 막는다.
 * 사람 이름은 형태만으로 확정할 수 없으므로 '○○○ 교수(님)' 형태만 잡고, 나머지는 사람 검수(#41)에 맡긴다.
 * @type {[string,RegExp][]}
 */
const FORBIDDEN=[
  ['INSTRUCTOR_NAME',/[가-힣]{2,4}\s*교수(?:님)?(?![가-힣])/],
  ['PERSONAL_CONTACT',/[\w.+-]+@[\w-]+\.[\w.-]+|\b0\d{1,2}-\d{3,4}-\d{4}\b/],
  ['RULE_OR_GRADUATION_REQUIREMENT',/학\s*칙|졸\s*업\s*요\s*건|졸\s*업\s*학\s*점|졸\s*업\s*가\s*능|졸\s*업\s*사\s*정/],
  ['ENROLLMENT_INFO',/수\s*강\s*(?:인\s*원|생\s*명\s*단|현\s*황)|정\s*원\s*(?:현\s*황|초\s*과)|신\s*청\s*현\s*황|잔\s*여\s*석/],
];

/**
 * 메타데이터 목록을 검사해 공개 후보·보류·철회로 나눈다. 원문 값은 보류 사유에 남기지 않는다(필드 이름·규칙 이름만).
 * @param {readonly unknown[]} raw 메타데이터 후보 목록
 * @returns {ScreenResult}
 */
export function screenNoticeMeta(raw){
  if(!Array.isArray(raw)||raw.length>5000)throw new RangeError('notices must be an array of at most 5000');
  /** @type {HeldNotice[]} */
  const held=[];
  // 먼저 입력 전체를 ID별로 모은 뒤 판단한다. 한 행씩 바로 통과시키면 같은 ID의 문제 행이 정상 행을 가리지 못한다.
  /** @type {Map<string,{rows:NoticeMeta[],held:HeldNotice[]}>} */
  const byId=new Map();
  for(const item of raw){
    const parsed=NoticeMetaSchema.safeParse(item);
    const rawId=typeof item==='object'&&item&&'noticeId' in item&&typeof item.noticeId==='string'?item.noticeId.trim():'';
    const id=rawId||null;
    /** @type {HeldNotice|null} */
    let problem=null;
    if(!parsed.success)problem={noticeId:id,reason:'SCHEMA_INVALID',detail:parsed.error.issues.map(i=>i.path.join('.')||i.code).join(',')};
    else{
      const rule=FORBIDDEN.find(([,re])=>re.test(parsed.data.title));
      if(rule)problem={noticeId:id,reason:'FORBIDDEN_CONTENT',detail:rule[0]};
    }
    // ID를 알 수 없는 행은 다른 행과 묶을 수 없으므로 그 행만 보류한다.
    if(!id){if(problem)held.push(problem);continue;}
    const group=byId.get(id)??{rows:[],held:[]};
    if(problem)group.held.push(problem);
    else if(parsed.success)group.rows.push(parsed.data);
    byId.set(id,group);
  }
  /** @type {NoticeMeta[]} */
  const accepted=[];
  /** @type {string[]} */
  const withdrawn=[];
  for(const [noticeId,group] of byId){
    // 같은 ID에 보류된 행이 하나라도 있으면 정상으로 보이는 다른 복사본도 공개하지 않는다(fail-closed).
    if(group.held.length){
      held.push(...group.held);
      if(group.rows.length)held.push({noticeId,reason:'ID_HAS_HELD_COPY',detail:String(group.rows.length)});
      continue;
    }
    // 같은 ID의 복사본은 내용이 완전히 같을 때만 하나로 합친다. ACTIVE와 WITHDRAWN이 섞인 경우도 여기서 보류된다.
    if(new Set(group.rows.map(r=>JSON.stringify(Object.entries(r).sort()))).size>1){
      held.push({noticeId,reason:'CONFLICTING_DUPLICATE',detail:String(group.rows.length)});continue;
    }
    const row=/** @type {NoticeMeta} */(group.rows[0]);
    if(row.state==='WITHDRAWN')withdrawn.push(noticeId);
    else accepted.push(row);
  }
  // 합성 예시와 검수 자료가 섞이면 결과 전체를 쓰지 않는다.
  if(new Set(accepted.map(r=>r.provenance)).size>1){
    return {accepted:[],held:[...held,...accepted.map(r=>({noticeId:r.noticeId,reason:/** @type {HoldReason} */('MIXED_PROVENANCE'),detail:r.provenance}))],withdrawn:withdrawn.sort()};
  }
  return {accepted:accepted.sort((a,b)=>a.noticeId<b.noticeId?-1:a.noticeId>b.noticeId?1:0),held,withdrawn:withdrawn.sort()};
}

/** @param {string} s @param {string} name */
function checkDay(s,name){
  if(!Day.safeParse(s).success)throw new RangeError(name+' must be YYYY-MM-DD');
  const [y,m,d]=s.split('-').map(Number);
  const t=new Date(Date.UTC(/** @type {number} */(y),/** @type {number} */(m)-1,/** @type {number} */(d)));
  if(t.getUTCMonth()!==/** @type {number} */(m)-1||t.getUTCDate()!==d)throw new RangeError(name+' is not a calendar date');
}

/**
 * 공지 메타데이터 검색. 질의가 비어 있으면 필터만 적용한 최신순 목록을 돌려준다.
 * @param {NoticeSearchInput} input notices가 undefined면 자료 미연결(NOT_CONNECTED)이다.
 * @returns {NoticeSearchResult}
 */
export function searchNoticeMeta(input){
  const limit=input.limit??20;
  if(!Number.isInteger(limit)||limit<1||limit>100)throw new RangeError('Invalid limit');
  const f=input.filters??{};
  if(f.postedFrom)checkDay(f.postedFrom,'postedFrom');
  if(f.postedTo)checkDay(f.postedTo,'postedTo');
  if(f.postedFrom&&f.postedTo&&f.postedFrom>f.postedTo)throw new RangeError('postedFrom is after postedTo');
  const text=(input.query??'').trim();
  const query=text?normalizeAcademicQuery(text):null;
  if(input.notices===undefined)return {status:'NOT_CONNECTED',query,hits:[],total:0,coverage:null,held:[],
    emptyGuidance:{retryQuery:query?.normalized??null,suggestions:[],showOfficialLinks:true}};

  const {accepted,held}=screenNoticeMeta(input.notices);
  // 관측 범위는 필터 전 전체 공개 후보로 계산해, 결과가 없을 때 '공지 없음'이 아니라 '관측 범위 안에서 없음'을 알린다.
  const coverage=accepted.length?{
    postedFrom:accepted.reduce((m,r)=>r.postedOn<m?r.postedOn:m,/** @type {string} */(accepted[0]?.postedOn)),
    postedTo:accepted.reduce((m,r)=>r.postedOn>m?r.postedOn:m,/** @type {string} */(accepted[0]?.postedOn)),
    lastObservedAt:accepted.reduce((m,r)=>Date.parse(r.observedAt)>Date.parse(m)?r.observedAt:m,/** @type {string} */(accepted[0]?.observedAt)),
    count:accepted.length}:null;
  // 캠퍼스 필터: 해당 캠퍼스와 공통(BOTH)만 포함한다. 캠퍼스 미기재(UNKNOWN)는 다른 캠퍼스 공지일 수 있어 뺀다.
  const filtered=accepted.filter(r=>
    (!f.campus||r.campus===f.campus||r.campus==='BOTH')
    &&(!f.categories?.length||f.categories.includes(r.category))
    &&(!f.postedFrom||r.postedOn>=f.postedFrom)&&(!f.postedTo||r.postedOn<=f.postedTo));

  /** @type {Map<string,{score:number,matchedVia:'ORIGINAL'|'VARIANT'}>} */
  const scored=new Map();
  if(query){
    const items=filtered.map(r=>({key:r.noticeId,title:r.title,text:''}));
    query.variants.forEach((v,i)=>{
      for(const h of searchFaqParagraphs(v,items,{limit:Math.max(1,items.length)})){
        const prev=scored.get(h.key);
        const via=i===0?'ORIGINAL':'VARIANT';
        if(!prev||h.score>prev.score)scored.set(h.key,{score:h.score,matchedVia:prev?.matchedVia==='ORIGINAL'?'ORIGINAL':via});
      }
    });
  }
  const pool=query?filtered.filter(r=>scored.has(r.noticeId)):filtered;
  /** @param {string} t */
  const titleKey=t=>normalizeFaqText(t).replace(/\s+/g,'');
  /** @type {Map<string,string[]>} */
  const sameTitle=new Map();
  for(const r of pool){const k=titleKey(r.title);sameTitle.set(k,[...(sameTitle.get(k)??[]),r.noticeId]);}
  const sort=input.sort??(query?'RELEVANCE':'RECENT');
  /** @param {NoticeMeta} a @param {NoticeMeta} b */
  const recent=(a,b)=>(a.postedOn<b.postedOn?1:a.postedOn>b.postedOn?-1:0)||(a.noticeId<b.noticeId?-1:a.noticeId>b.noticeId?1:0);
  const ordered=[...pool].sort((a,b)=>sort==='RELEVANCE'
    ?((scored.get(b.noticeId)?.score??0)-(scored.get(a.noticeId)?.score??0))||recent(a,b):recent(a,b));
  /** @type {NoticeHit[]} */
  const hits=ordered.slice(0,limit).map(r=>({noticeId:r.noticeId,title:r.title,postedOn:r.postedOn,campus:r.campus,
    category:r.category,sourceUrl:r.sourceUrl,observedAt:r.observedAt,corrected:r.state==='CORRECTED',
    score:scored.get(r.noticeId)?.score??null,matchedVia:scored.get(r.noticeId)?.matchedVia??null,
    similarTitleIds:(sameTitle.get(titleKey(r.title))??[]).filter(id=>id!==r.noticeId).sort()}));
  return {status:hits.length?'OK':'NO_MATCH',query,hits,total:pool.length,coverage,held,
    emptyGuidance:hits.length?null:{retryQuery:query?.normalized??null,
      // 결과가 없을 때 교정 결과를 사실로 확정하지 않고 다시 찾을 표현으로만 제안한다.
      suggestions:[...new Set((query?.corrections??[]).map(c=>c.to))],showOfficialLinks:true}};
}
