import {z} from 'zod';
import {CreditUnitsSchema} from '../academics/index.js';

/**
 * 전공 변경 가정(#82)은 RulePack 판본 간 차이 계산(#90)과 다르다.
 * 요청에는 가상의 변경안만 담으며 실제 전공, 입학년도, 성적표, 승인 정보는 서버가 조회해야 한다.
 */
const Ref=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Utc=z.iso.datetime({offset:true});
const Target=z.strictObject({targetMajorId:Ref});
export const OwnerMajorWhatIfScenarioSchema=z.discriminatedUnion('action',[
  Target.extend({action:z.literal('CHANGE_PRIMARY_MAJOR')}),
  Target.extend({action:z.literal('ADD_DOUBLE_MAJOR')}),
  Target.extend({action:z.literal('CHANGE_DOUBLE_MAJOR')}),
  z.strictObject({action:z.literal('REMOVE_DOUBLE_MAJOR')}),
  Target.extend({action:z.literal('ADD_MINOR')}),
  Target.extend({action:z.literal('CHANGE_MINOR')}),
  z.strictObject({action:z.literal('REMOVE_MINOR')}),
]);
export const OwnerMajorWhatIfRequestSchema=z.strictObject({
  scenario:OwnerMajorWhatIfScenarioSchema,
  expectedCurrentVersion:Ref.optional(),
});
export const OwnerMajorWhatIfBlockerSchema=z.enum([
  'CALCULATION_CORE_UNAVAILABLE','RULEPACK_NOT_APPROVED',
  'CURRENT_RULEPACK_NOT_APPROVED','COHORT_NOT_VERIFIED',
  'DUPLICATE_RECOGNITION_UNVERIFIED','SOURCE_RIGHTS_MISSING',
  'OWNER_CONSENT_REQUIRED','TRANSCRIPT_NOT_APPROVED',
  'CURRENT_VERSION_CHANGED','TARGET_PROGRAM_UNAVAILABLE',
]);
const Caveat=z.literal('HYPOTHETICAL_NOT_OFFICIAL');
export const OwnerMajorWhatIfBlockedSchema=z.strictObject({
  state:z.literal('BLOCKED_DEPENDENCY'),
  asOf:Utc,
  scenario:OwnerMajorWhatIfScenarioSchema,
  blockers:z.array(OwnerMajorWhatIfBlockerSchema).min(1).max(10),
  caveat:Caveat,
}).superRefine((v,ctx)=>{
  if(new Set(v.blockers).size!==v.blockers.length)
    ctx.addIssue({code:'custom',path:['blockers'],message:'Duplicate dependency blockers'});
});

const RequirementProgress=z.strictObject({
  requirementId:Ref,
  state:z.enum(['SATISFIED','MISSING']),
  missingCreditUnits:CreditUnitsSchema.max(2000).optional(),
}).superRefine((v,ctx)=>{
  if(v.state==='SATISFIED'&&v.missingCreditUnits!==undefined
    &&v.missingCreditUnits!==0)
    ctx.addIssue({code:'custom',path:['missingCreditUnits'],
      message:'Satisfied requirement has no missing credits'});
});
const Projection=z.strictObject({
  asOf:Utc,
  role:z.enum(['CURRENT','HYPOTHETICAL']),
  rulePackVersion:Ref,
  /** 가상 전공이 달라져도 사용자 자신의 원장은 동일한 불변 입력을 사용한다. */
  earnedCreditUnits:CreditUnitsSchema.max(2000),
  remainingCreditUnits:CreditUnitsSchema.max(2000),
  requirements:z.array(RequirementProgress).max(200),
}).superRefine((v,ctx)=>{
  if(new Set(v.requirements.map(r=>r.requirementId)).size!==v.requirements.length)
    ctx.addIssue({code:'custom',path:['requirements'],
      message:'Duplicate requirement projection ID'});
});
export type MajorWhatIfRequirementProgress=z.infer<typeof RequirementProgress>;
export type MajorWhatIfDeltaRow={
  requirementId:string;
  change:'NEW_REQUIREMENT'|'ALREADY_SATISFIED'|'REMOVED_REQUIREMENT'
    |'UNCHANGED'|'PROGRESS_CHANGED';
};
/**
 * 변경안의 형식과 일관성만 확인한다. 과목 인정·전공별 요건 계산 또는 승인된 학사 코어를 대체하지 않는다.
 * 현재와 가상 상태의 모든 요건은 차이 결과에 각각 정확히 한 번 나타나야 한다.
 */
export function isConsistentMajorWhatIfDelta(input:{
  current:readonly MajorWhatIfRequirementProgress[];
  hypothetical:readonly MajorWhatIfRequirementProgress[];
  delta:readonly MajorWhatIfDeltaRow[];
}):boolean{
  const before=new Map(input.current.map(r=>[r.requirementId,r]));
  const after=new Map(input.hypothetical.map(r=>[r.requirementId,r]));
  const ids=new Set([...before.keys(),...after.keys()]);
  if(before.size!==input.current.length||after.size!==input.hypothetical.length
    ||ids.size!==input.delta.length)return false;
  const seen=new Set<string>();
  for(const row of input.delta){
    const id=row.requirementId;
    if(seen.has(id)||!ids.has(id))return false;
    seen.add(id);
    const previous=before.get(id),next=after.get(id);
    let expected:MajorWhatIfDeltaRow['change'];
    if(!previous)expected=next!.state==='SATISFIED'
      ?'ALREADY_SATISFIED':'NEW_REQUIREMENT';
    else if(!next)expected='REMOVED_REQUIREMENT';
    else expected=previous.state===next.state
      &&(previous.missingCreditUnits??0)===(next.missingCreditUnits??0)
      ?'UNCHANGED':'PROGRESS_CHANGED';
    if(row.change!==expected)return false;
  }
  return true;
}
const Proof=z.strictObject({
  verifiedAt:Utc,
  coreVersion:Ref,cohortApplicabilityVersion:Ref,
  currentRulePackVersion:Ref,hypotheticalRulePackVersion:Ref,
  overlapPolicyVersion:Ref,transcriptProjectionVersion:Ref,
  sourceRightsVersion:Ref,ownerConsentVersion:Ref,
  officialEvidenceRefs:z.array(Ref).min(1).max(60),
});
export const OwnerMajorWhatIfReadySchema=z.strictObject({
  state:z.literal('READY'),
  asOf:Utc,
  scenario:OwnerMajorWhatIfScenarioSchema,
  current:Projection.safeExtend({role:z.literal('CURRENT')}),
  hypothetical:Projection.safeExtend({role:z.literal('HYPOTHETICAL')}),
  delta:z.array(z.strictObject({
    requirementId:Ref,
    change:z.enum(['NEW_REQUIREMENT','ALREADY_SATISFIED',
      'REMOVED_REQUIREMENT','UNCHANGED','PROGRESS_CHANGED']),
    evidenceRefs:z.array(Ref).min(1).max(20),
  })).max(200),
  versions:z.strictObject({
    currentRulePack:Ref,hypotheticalRulePack:Ref,
    cohort:Ref,overlapPolicy:Ref,transcriptProjection:Ref,core:Ref,
  }),
  evidenceLinks:z.array(z.strictObject({
    evidenceRef:Ref,
    href:z.url().refine(x=>{
      const url=new URL(x);
      return url.protocol==='https:'&&!url.username&&!url.password;
    }),
    verifiedAt:Utc,
  })).min(1).max(100),
  approval:Proof,
  caveat:Caveat,
}).superRefine((v,ctx)=>{
  const issue=(path:(string|number)[],message:string)=>ctx.addIssue({
    code:'custom',path,message,
  });
  if(v.current.asOf!==v.asOf||v.hypothetical.asOf!==v.asOf)
    issue(['asOf'],'Current and hypothetical must share one verified snapshot');
  if(v.current.earnedCreditUnits!==v.hypothetical.earnedCreditUnits)
    issue(['hypothetical','earnedCreditUnits'],'Virtual programs cannot change unique earned ledger');
  if(!isConsistentMajorWhatIfDelta({
    current:v.current.requirements,hypothetical:v.hypothetical.requirements,
    delta:v.delta,
  }))issue(['delta'],'Diff must cover each requirement once and match both projections');
  for(const [key,field] of [
    ['currentRulePack','currentRulePackVersion'],
    ['hypotheticalRulePack','hypotheticalRulePackVersion'],
    ['cohort','cohortApplicabilityVersion'],
    ['overlapPolicy','overlapPolicyVersion'],
    ['transcriptProjection','transcriptProjectionVersion'],
    ['core','coreVersion'],
  ] as const){
    if(v.versions[key]!==v.approval[field])
      issue(['approval',field],'Rule or runtime version is not attested');
  }
  if(v.current.rulePackVersion!==v.versions.currentRulePack
    ||v.hypothetical.rulePackVersion!==v.versions.hypotheticalRulePack)
    issue(['versions'],'Projection must match attested RulePacks');
  if(Date.parse(v.approval.verifiedAt)>Date.parse(v.asOf))
    issue(['approval','verifiedAt'],'Future approval cannot validate past asOf');
  const linked=new Set(v.evidenceLinks.map(x=>x.evidenceRef));
  if(linked.size!==v.evidenceLinks.length
    ||new Set(v.approval.officialEvidenceRefs).size!==v.approval.officialEvidenceRefs.length)
    issue(['evidenceLinks'],'Duplicate evidence refs');
  for(const [i,link] of v.evidenceLinks.entries())
    if(Date.parse(link.verifiedAt)>Date.parse(v.asOf))
      issue(['evidenceLinks',i,'verifiedAt'],'Future verification is not evidence as-of this check');
  if(v.approval.officialEvidenceRefs.some(ref=>!linked.has(ref)))
    issue(['evidenceLinks'],'Missing a permitted official clause link');
  if(v.delta.some(d=>d.evidenceRefs.some(ref=>!linked.has(ref))))
    issue(['delta'],'Requirement change has no permitted evidence link');
});
export const OwnerMajorWhatIfResponseSchema=z.discriminatedUnion('state',[
  OwnerMajorWhatIfBlockedSchema,OwnerMajorWhatIfReadySchema,
]);
export type OwnerMajorWhatIfRequest=z.infer<typeof OwnerMajorWhatIfRequestSchema>;
export type OwnerMajorWhatIfResponse=z.infer<typeof OwnerMajorWhatIfResponseSchema>;
