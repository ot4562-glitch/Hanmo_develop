import {z} from 'zod';
import {AcademicPlanIssueVNextSchema,AcademicTermVNextSchema,
  CreditUnitsSchema} from '../academics/index.js';

/**
 * 개인 수강계획 검사는 서버에서만 수행한다.
 * 브라우저는 정규 학기를 선택할 수 있지만 성적표 행, RulePack, 증빙, actorId를 전송하면 안 된다.
 */
const Ref=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Utc=z.iso.datetime({offset:true});
const Https=z.url().refine(url=>{
  const parsed=new URL(url);
  return parsed.protocol==='https:'&&!parsed.username&&!parsed.password;
},{message:'Only credential-free HTTPS evidence may be linked'});
export const OwnerStudyPlanCheckRequestSchema=z.strictObject({
  term:AcademicTermVNextSchema,
  expectedPlanVersion:Ref.optional(),
});

export const OwnerPlanCheckCaveatSchema=z.enum([
  'NOT_OFFICIAL_REGISTRATION','NOT_GRADUATION_DECISION',
  'RULEPACK_UNVERIFIED','TERM_RULES_UNVERIFIED','COHORT_UNKNOWN',
  'SOURCE_RIGHTS_MISSING','TRANSCRIPT_NOT_APPROVED',
  'SECTIONS_UNCONFIRMED','PLAN_PARTIALLY_CHECKED','COURSE_REFS_REDACTED',
]);
export const OwnerPlanCheckUnavailableReasonSchema=z.enum([
  'CORE_NOT_MERGED','RULEPACK_NOT_APPROVED','TERM_RULES_UNVERIFIED',
  'COHORT_UNKNOWN','SOURCE_RIGHTS_MISSING','TRANSCRIPT_NOT_APPROVED',
  'OWNER_CONSENT_REQUIRED','SECTION_SOURCE_UNVERIFIED','VERSION_STALE',
]);

/**
 * 서버에서 발급한 비공개 확인 기록이며 브라우저 주장이 아니다.
 * 실제 수강·신청·졸업에 대한 공적 또는 독립적인 확인을 뜻하지 않는다.
 */
export const OwnerPlanCheckApprovalReceiptSchema=z.strictObject({
  rulePackState:z.literal('APPROVED'),
  rulePackVersion:Ref,
  officialEvidenceRefs:z.array(Ref).min(1).max(30),
  verifiedAt:Utc,
  sourceRightsVersion:Ref,
  consentVersion:Ref,
  coreVersion:Ref,
});
const Versions=z.strictObject({
  rulePack:Ref.optional(),plan:Ref.optional(),
  catalog:Ref.optional(),transcript:Ref.optional(),
});
const Disclosure=z.strictObject({
  mode:z.enum(['REDACTED','OWNER_VERIFIED','GRANT_SCOPED']),
  /**
   * 이 목록은 서버가 현재 사용자 및 접근 권한 정책으로 산출해야 한다.
   * 브라우저가 보낸 허용 목록이나 성적표 원본을 그대로 사용하지 않는다.
   */
  visibleCourseRefs:z.array(Ref).max(60),
  grantVersion:Ref.optional(),
});
export const OwnerStudyPlanCheckResponseSchema=z.strictObject({
  state:z.enum(['READY','NEEDS_REVIEW','INSUFFICIENT_DATA']),
  asOf:Utc,term:AcademicTermVNextSchema,versions:Versions,
  termLoadCreditUnits:CreditUnitsSchema.max(1000),
  creditCapUnits:CreditUnitsSchema.max(1000).optional(),
  planIssues:z.array(AcademicPlanIssueVNextSchema).max(100),
  unchecked:z.array(z.strictObject({
    courseId:Ref.optional(),
    reason:z.enum(['TERM_UNDECIDED','TERM_ENDED','CREDITS_UNKNOWN']),
  })).max(200),
  evidenceLinks:z.array(z.strictObject({
    evidenceRef:Ref,href:Https,verifiedAt:Utc,
  })).max(100),
  caveats:z.array(OwnerPlanCheckCaveatSchema).min(2).max(20),
  disclosure:Disclosure,
  approval:OwnerPlanCheckApprovalReceiptSchema.optional(),
}).superRefine((v,ctx)=>{
  const problem=(path:(string|number)[],message:string)=>ctx.addIssue({
    code:'custom',path,message,
  });
  for(const required of ['NOT_OFFICIAL_REGISTRATION','NOT_GRADUATION_DECISION'] as const)
    if(!v.caveats.includes(required))problem(['caveats'],'Missing '+required);
  if(v.creditCapUnits!==undefined&&!v.approval)
    problem(['creditCapUnits'],'Unverified term cap must not be shown');
  // 검증되지 않은 RulePack을 근거로 확정 학점 상한·선수과목·분반 경고를 내지 않는다.
  // 검토가 필요한 발견 사항은 별도로 표시할 수 있다.
  const officialCodes=new Set([
    'CREDIT_CAP_EXCEEDED','PREREQUISITE_MISSING',
    'TIMETABLE_CONFLICT','REQUIRED_COURSE_UNOFFERED',
  ]);
  if(!v.approval&&v.planIssues.some(item=>officialCodes.has(item.code)))
    problem(['planIssues'],'Unreviewed rules cannot produce confirmed warnings');
  const sources=new Set<string>();
  for(const [i,link] of v.evidenceLinks.entries()){
    if(sources.has(link.evidenceRef))
      problem(['evidenceLinks',i,'evidenceRef'],'Duplicate evidence ref');
    sources.add(link.evidenceRef);
    if(Date.parse(link.verifiedAt)>Date.parse(v.asOf))
      problem(['evidenceLinks',i,'verifiedAt'],'Future evidence verification is not usable as of this check');
  }
  for(const [i,item] of v.planIssues.entries()){
    for(const ref of item.evidenceRefs)
      if(!sources.has(ref))
        problem(['planIssues',i,'evidenceRefs'],'Evidence ref must have an authorized link');
    if(officialCodes.has(item.code)&&item.evidenceRefs.length===0)
      problem(['planIssues',i,'evidenceRefs'],'Confirmed warning requires verified evidence');
  }
  if(v.approval){
    if(v.approval.rulePackVersion!==v.versions.rulePack)
      problem(['versions','rulePack'],'Receipt does not match current RulePack');
    if(Date.parse(v.approval.verifiedAt)>Date.parse(v.asOf))
      problem(['approval','verifiedAt'],'Look-ahead receipt forbidden');
    for(const ref of v.approval.officialEvidenceRefs)
      if(!sources.has(ref))
        problem(['evidenceLinks'],'All approved source refs need permitted links');
  }
  if(v.state==='READY'){
    if(!v.approval||v.creditCapUnits===undefined)
      problem(['state'],'READY requires independently approved RulePack and cap');
    for(const k of ['rulePack','plan','catalog','transcript'] as const)
      if(!v.versions[k])problem(['versions',k],'READY requires '+k+' version');
    if(v.planIssues.some(issue=>issue.code==='NEEDS_REVIEW'
      ||issue.code==='SEARCH_LIMIT_REVIEW')||v.unchecked.length>0)
      problem(['state'],'Unverified plan item prevents READY');
    if(v.caveats.some(x=>[
      'RULEPACK_UNVERIFIED','TERM_RULES_UNVERIFIED','COHORT_UNKNOWN',
      'SOURCE_RIGHTS_MISSING','TRANSCRIPT_NOT_APPROVED','SECTIONS_UNCONFIRMED',
    ].includes(x)))problem(['state'],'READY cannot contain a blocked dependency');
  }
  const visible=new Set(v.disclosure.visibleCourseRefs);
  if(visible.size!==v.disclosure.visibleCourseRefs.length)
    problem(['disclosure','visibleCourseRefs'],'Repeated course references');
  // 메타데이터에 사용자의 전체 허용 과목 목록을 싣지 않는다.
  // 해당 응답이 참조하고 별도로 권한 확인된 과목 ID만 공개한다.
  const used=new Set([
    ...v.planIssues.flatMap(issue=>issue.courseRefs),
    ...v.unchecked.flatMap(item=>item.courseId?[item.courseId]:[]),
  ]);
  for(const ref of visible)
    if(!used.has(ref))
      problem(['disclosure','visibleCourseRefs'],'Unused course allowance leaks private course identity');
  if(v.disclosure.mode==='REDACTED'&&visible.size!==0)
    problem(['disclosure'],'Redacted response cannot contain course references');
  if(v.disclosure.mode==='GRANT_SCOPED'&&!v.disclosure.grantVersion)
    problem(['disclosure','grantVersion'],'SharingGrant version required');
  if(v.disclosure.mode!=='GRANT_SCOPED'&&v.disclosure.grantVersion)
    problem(['disclosure','grantVersion'],'Owner/read-only mode has no SharingGrant');
  for(const [i,issue] of v.planIssues.entries())
    for(const ref of issue.courseRefs)
      if(!visible.has(ref))problem(['planIssues',i,'courseRefs'],
        'Course ref outside approved visibility');
  for(const [i,item] of v.unchecked.entries())
    if(item.courseId&&!visible.has(item.courseId))
      problem(['unchecked',i,'courseId'],'Unchecked course outside approved visibility');
});
export type OwnerStudyPlanCheckRequest=z.infer<typeof OwnerStudyPlanCheckRequestSchema>;
export type OwnerStudyPlanCheckResponse=z.infer<typeof OwnerStudyPlanCheckResponseSchema>;
