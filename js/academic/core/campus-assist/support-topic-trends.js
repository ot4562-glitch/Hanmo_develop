// @ts-check
// 검수된 공지 제목의 흔한 표현만 일반 문의 주제로 묶습니다. 원문·검색 기록은 내보내지 않습니다.
/**
 * @typedef {{id:string,title:string,approvedForSuggestions:boolean,scopePolicyVersion:string}} ReviewedTitle
 */
/** @type {{query:string,patterns:string[]}[]} */
const groups=[
  {query:'장학금 문의',patterns:['장학금','장학']},
  {query:'휴학·복학 문의',patterns:['휴학','복학','학적변동']},
  {query:'등록금 문의',patterns:['등록금','등록납부']},
  {query:'증명서 발급 문의',patterns:['증명서','증명발급']},
  {query:'학생증 문의',patterns:['학생증']},
  {query:'이중전공 문의',patterns:['이중전공','복수전공','부전공']},
  {query:'교환학생 문의',patterns:['교환학생','국제교류']},
  {query:'계절학기 문의',patterns:['계절학기']},
  {query:'학사일정 문의',patterns:['학사일정','학사력']},
  {query:'수강신청 문의',patterns:['수강신청','수강정정']},
];
const normalize=value=>value.normalize('NFKC').replace(/\s+/g,'').toLowerCase();

/**
 * 허용·검수된 최소 메타만 집계합니다. 발행물에는 개별 제목·횟수·사용자 입력이 없습니다.
 * @param {ReviewedTitle[]} records
 * @param {{policyVersion:string,minimumOccurrences?:number,maximumTopics?:number}} options
 * @returns {string[]}
 */
export function buildSupportTopicSuggestions(records,{policyVersion,minimumOccurrences=3,maximumTopics=8}){
  if(!policyVersion||minimumOccurrences<3)return [];
  const counts=groups.map((group,index)=>({...group,index,count:0}));
  const seen=new Set();
  for(const record of records.slice(0,2000)){
    if(record.approvedForSuggestions!==true||record.scopePolicyVersion!==policyVersion||
      typeof record.id!=='string'||!record.id||seen.has(record.id)||
      typeof record.title!=='string')continue;
    seen.add(record.id);
    const title=normalize(record.title);
    for(const topic of counts){
      if(topic.patterns.some(pattern=>title.includes(normalize(pattern))))topic.count++;
    }
  }
  return counts.filter(topic=>topic.count>=minimumOccurrences)
    .sort((left,right)=>right.count-left.count||left.index-right.index)
    .slice(0,Math.min(8,Math.max(0,Math.floor(maximumTopics))))
    .map(topic=>topic.query);
}
