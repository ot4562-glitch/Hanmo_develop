// @ts-check
/** @typedef {'general'|'primary'|'secondary'|'other'|'total'} CreditArea */
/** @typedef {'NONE'|'DOUBLE'|'MINOR'} DegreeKind */
/** @typedef {{area:CreditArea,label:string,earned:number,target:number|null,remaining:number|null,excess:number,ratio:number|null}} DegreeMetric */
/** @typedef {{kind:DegreeKind,earned:Record<CreditArea,string|number|null>,targets:Record<CreditArea,string|number|null>}} DegreeInput */
/** @type {readonly CreditArea[]} */
export const CREDIT_AREAS=Object.freeze(['general','primary','secondary','other','total']);

/** @param {number} cohort @returns {'TO_2024'|'FROM_2025'} 학번 구간 */
export function cohortBand(cohort){
  if(!Number.isSafeInteger(cohort)||cohort<2010||cohort>2100)throw new RangeError('입학년도를 확인해 주세요.');
  return cohort<=2024?'TO_2024':'FROM_2025';
}

/** @param {string|number|null|undefined} value @param {boolean} required @returns {number|null} */
function readCredits(value,required){
  if(value===null||value===undefined||value===''){
    if(required)throw new RangeError('이미 취득한 학점은 0부터 입력해 주세요.');
    return null;
  }
  const n=Number(value);
  if(!Number.isFinite(n)||n<0||n>400||!Number.isSafeInteger(n*2))
    throw new RangeError('학점은 0~400 사이의 0.5학점 단위로 입력해 주세요.');
  return n;
}

/** @param {DegreeInput} input @returns {{metrics:DegreeMetric[],warnings:string[],officialDecisionAvailable:false,totalEarned:number}} 
 *  영역 목표와 총 졸업학점은 서로 다른 기준이며 공식 졸업 판정을 하지 않는다.
 */
export function calculateDegreeCredits(input){
  if(!['NONE','DOUBLE','MINOR'].includes(input.kind))throw new RangeError('전공 형태를 확인해 주세요.');
  const names={general:'교양',primary:'본전공',
    secondary:input.kind==='MINOR'?'부전공':'이중전공',other:'기타·일반선택',total:'총 졸업'};
  /** @type {Record<CreditArea,number>} */
  const earned={general:0,primary:0,secondary:0,other:0,total:0};
  /** @type {Record<CreditArea,number|null>} */
  const targets={general:null,primary:null,secondary:null,other:null,total:null};
  for(const area of CREDIT_AREAS){
    earned[area]=readCredits(input.earned?.[area],false)??0;
    targets[area]=readCredits(input.targets?.[area],false);
  }
  if(input.kind==='NONE'){
    earned.secondary=0;
    targets.secondary=null;
  }
  const sum=earned.general+earned.primary+earned.secondary+earned.other;
  const totalInput=input.earned?.total;
  const totalEarned=totalInput===null||totalInput===undefined||totalInput===''?sum:earned.total;
  earned.total=totalEarned;
  const areas=CREDIT_AREAS.filter(area=>area!=='secondary'||input.kind!=='NONE');
  const warnings=[];
  if(Math.abs(sum-totalEarned)>0.00001)warnings.push(
    '영역별 학점 합계 '+sum+'학점과 총 취득 '+totalEarned+'학점이 다릅니다. 중복 인정·기타 학점을 공식 기록과 대조하세요.');
  /** @type {DegreeMetric[]} */
  const metrics=areas.map(area=>{
    const target=targets[area],value=earned[area];
    const remaining=target===null?null:Math.max(0,target-value);
    const excess=target===null?0:Math.max(0,value-target);
    if(excess>0)warnings.push(names[area]+' 목표보다 '+excess+'학점 많습니다. 초과 학점의 인정 구분을 확인하세요.');
    return {area,label:names[area],earned:value,target,remaining,excess,
      ratio:target===null||target===0?null:Math.min(100,value/target*100)};
  });
  return {metrics,warnings,officialDecisionAvailable:false,totalEarned};
}

/** @typedef {{title:string,scope:string,state:'NEEDS_REVIEW',sourceUrl:string,sourceCheckedAt:string|null}} DegreeGuidance */
/** @param {{campus:string,major:string,secondaryKind:DegreeKind,secondary:string,cohort:number|null}} profile
 * @returns {DegreeGuidance[]} 미검수 학과 요건을 판정하지 않는 졸업 안내
 */
export function graduationGuidance(profile){
  const source='https://haksa.hufs.ac.kr/haksa/index.do';
  const label=profile.major||'주전공 미설정';
  const common=[
    {title:'외국어 졸업인증 · 인정 시험 및 점수',scope:'공통',state:'NEEDS_REVIEW',sourceUrl:source,sourceCheckedAt:null},
    {title:'등록학기·총평점·필수과목 확인',scope:'공통',state:'NEEDS_REVIEW',sourceUrl:source,sourceCheckedAt:null},
  ];
  const major=[
    {title:'졸업시험·대체시험·논문',scope:'주전공 · '+label,state:'NEEDS_REVIEW',sourceUrl:source,sourceCheckedAt:null},
    {title:'학과별 기타 졸업요건',scope:'주전공 · '+label,state:'NEEDS_REVIEW',sourceUrl:source,sourceCheckedAt:null},
  ];
  if(profile.secondaryKind!=='NONE'){
    major.push({title:'졸업시험·논문 및 추가 요건',
      scope:(profile.secondaryKind==='DOUBLE'?'이중전공':'부전공')+' · '+(profile.secondary||'미설정'),
      state:'NEEDS_REVIEW',sourceUrl:source,sourceCheckedAt:null});
  }
  return /** @type {DegreeGuidance[]} */ ([...common,...major]);
}
