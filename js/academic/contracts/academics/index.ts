import {z} from 'zod';

export const CourseStateSchema = z.enum(['이수완료', '수강중']);
export const COURSE_CSV_HEADERS = [
  '학기', '학수번호', '과목명', '학점', '이수구분', '이수상태',
] as const;
export const CreditUnitsSchema = z.number().int().nonnegative(); // 1단위는 0.5학점이다.
export const LedgerSchema = z.enum(['EARNED', 'IN_PROGRESS', 'PLANNED']);
export const CourseRecordSchema = z.strictObject({
  term: z.string().trim().min(1),
  courseCode: z.string().trim(), // 출처에 학수번호가 없을 수 있다.
  courseName: z.string().trim().min(1),
  creditUnits: CreditUnitsSchema,
  category: z.string().trim(), // 원본 영역을 보존한다. 공식 규칙 검토 후에만 변환한다.
  ledger: LedgerSchema,
});
export type CourseRecord = z.infer<typeof CourseRecordSchema>;

export const RequirementSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(['CREDIT_TOTAL', 'CATEGORY_MINIMUM', 'REQUIRED_COURSE', 'NON_CREDIT']),
  requiredCreditUnits: CreditUnitsSchema.optional(),
  sourceClauseIds: z.array(z.string().min(1)).min(1),
  exceptionClauseIds: z.array(z.string().min(1)),
  exceptionCoverageComplete: z.boolean(),
});
export const RulePackSchema = z.strictObject({
  version: z.string().min(1),
  scope: z.strictObject({campus: z.string().min(1), admissionYear: z.number().int().min(1900).max(2100), majorTrack: z.string().min(1)}),
  sourceDocumentVersion: z.string().min(1),
  state: z.enum(['DRAFT','NEEDS_REVIEW','APPROVED']),
  requirements: z.array(RequirementSchema).min(1),
  approvedBy: z.string().min(1).optional(),
  independentlyCheckedBy: z.string().min(1).optional(),
}).superRefine((pack, ctx) => {
  if (pack.state !== 'APPROVED') {
    if (pack.approvedBy || pack.independentlyCheckedBy) ctx.addIssue({code:'custom',message:'Non-approved draft must not carry approval sign-off'});
    return;
  }
  if (!pack.approvedBy || !pack.independentlyCheckedBy || pack.approvedBy === pack.independentlyCheckedBy) {
    ctx.addIssue({code:'custom',message:'APPROVED RulePack requires two distinct human reviewers'});
  }
  for (const [index, requirement] of pack.requirements.entries()) {
    if (!requirement.exceptionCoverageComplete) ctx.addIssue({code:'custom',path:['requirements',index,'exceptionCoverageComplete'],message:'Unreviewed exception clause'});
  }
});
export type RulePack = z.infer<typeof RulePackSchema>;

export const AcademicDeficitSchema = z.strictObject({
  requirementId: z.string().min(1),
  missingCreditUnits: CreditUnitsSchema.optional(),
  state: z.enum(['MISSING','NEEDS_REVIEW','UNKNOWN']),
  evidenceRefs: z.array(z.string().min(1)),
});
export const AcademicSummarySchema = z.strictObject({
  state: z.enum(['READY','NEEDS_REVIEW','INSUFFICIENT_DATA']),
  rulePackVersion: z.string().min(1),
  asOf: z.iso.datetime({offset:true}),
  earnedCreditUnits: CreditUnitsSchema,
  inProgressCreditUnits: CreditUnitsSchema,
  plannedCreditUnits: CreditUnitsSchema,
  deficits: z.array(AcademicDeficitSchema),
  caveats: z.array(z.string().min(1)),
});
export type AcademicSummary = z.infer<typeof AcademicSummarySchema>;

export const OfferingSignalSchema = z.enum([
  'CONFIRMED_OFFERED', 'CONFIRMED_NOT_OFFERED', 'HISTORICAL_PATTERN',
  'INSUFFICIENT_DATA', 'UNKNOWN',
]);
export const OfferingEvidenceCoverageSchema = z.enum(['COMPLETE_TERM_CATALOG','PARTIAL','UNKNOWN']);
export const OfferingOutlookSchema = z.strictObject({
  courseId: z.string().min(1),
  targetTerm: z.string().min(1),
  signal: OfferingSignalSchema,
  asOf: z.iso.datetime({offset:true}),
  coverage: OfferingEvidenceCoverageSchema,
  sameSeasonObservedTerms: z.number().int().nonnegative(),
  sameSeasonOfferedTerms: z.number().int().nonnegative(),
  sourcePublishedAt: z.iso.datetime({offset:true}).optional(),
  evidenceRefs: z.array(z.string().min(1)),
  caveat: z.string().min(1),
}).superRefine((item,ctx) => {
  if (item.sameSeasonOfferedTerms > item.sameSeasonObservedTerms) ctx.addIssue({code:'custom',path:['sameSeasonOfferedTerms'],message:'offered cannot exceed observed'});
  if (item.sourcePublishedAt && Date.parse(item.sourcePublishedAt) > Date.parse(item.asOf)) ctx.addIssue({code:'custom',path:['sourcePublishedAt'],message:'look-ahead leakage'});
  if (item.signal === 'HISTORICAL_PATTERN' && (item.coverage !== 'COMPLETE_TERM_CATALOG' || item.sameSeasonObservedTerms < 3)) {
    ctx.addIssue({code:'custom',message:'pattern requires >=3 complete observations'});
  }
  if (item.signal.startsWith('CONFIRMED_') && (!item.sourcePublishedAt || item.evidenceRefs.length === 0)) {
    ctx.addIssue({code:'custom',message:'official confirmation requires published evidence'});
  }
});
export type OfferingOutlook = z.infer<typeof OfferingOutlookSchema>;
export const ForecastSummarySchema = z.strictObject({
  asOf: z.iso.datetime({offset:true}),
  items: z.array(OfferingOutlookSchema).max(20),
  status: z.enum(['READY','PARTIAL','INSUFFICIENT_DATA']),
});
export type ForecastSummary = z.infer<typeof ForecastSummarySchema>;

// 검토된 학사 계약만 추가한다. 기존 v0.1 통신 자료형은 호환성을 위해 유지한다.
export * from './vnext.js';
export * from './double-major.js';


