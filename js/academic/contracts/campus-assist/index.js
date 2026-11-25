// @ts-check
import {z} from 'zod';

/** 학내 지원 기능 세 가지의 엄격한 공통 계약이다. 이 계약만으로 출처 사용권을 승인하거나 합성 예시를 학교 사실로 바꿀 수 없다. */
const Id = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/);
const Iso = z.iso.datetime({offset:true});
const Day = z.iso.date();
const Source = z.url().startsWith('https://').max(1000);
export const CampusRightsSchema = z.enum(['APPROVED','REVOKED','BLOCKED']);
export const CampusProvenanceSchema = z.enum(['SYNTHETIC','REAL_APPROVED']);

export const ActivityRecordSchema = z.strictObject({
  entryId:Id, sourceId:Id, revisionId:Id, supersedes:Id.optional(),
  /** 이전 기록에는 선택 항목이지만 오프라인 채널 수집 검증에는 반드시 필요하다. */
  channelId:Id.optional(),
  organizationId:Id, seriesId:Id, title:z.string().trim().min(2).max(240),
  kind:z.enum(['ORIENTATION','ACADEMIC','RECRUITMENT','LECTURE','OTHER']),
  campus:z.enum(['SEOUL','GLOBAL','BOTH']),
  publishedAt:Iso, verifiedAt:Iso,
  eventDate:Day.optional(), applicationDeadline:Day.optional(),
  sourceUrl:Source, status:z.enum(['ANNOUNCED','CONFIRMED','CANCELLED','DELETED']),
  rights:CampusRightsSchema, provenance:CampusProvenanceSchema,
  venue:z.string().max(160).optional(),
});
/** @typedef {z.infer<typeof ActivityRecordSchema>} ActivityRecord */
/** NCP 이전 단계에서 운영자가 관리하는 채널 목록이다. 실시간 크롤링 권한이나 독립적인 이용 허가 증명이 아니다. */
export const ActivityOrganizationSchema=z.strictObject({
  organizationId:Id,displayName:z.string().trim().min(2).max(160),
  campus:z.enum(['SEOUL','GLOBAL','BOTH']),
  aliases:z.array(z.string().trim().min(2).max(160)).max(20),
  verifiedAt:Iso,
});
/** @typedef {z.infer<typeof ActivityOrganizationSchema>} ActivityOrganization */
export const ActivityChannelSchema=z.strictObject({
  channelId:Id,organizationId:Id,sourceBaseUrl:Source,
  verifiedAt:Iso,effectiveFrom:Iso,effectiveUntil:Iso.optional(),
  rights:CampusRightsSchema,provenance:CampusProvenanceSchema,
  status:z.enum(['ACTIVE','REMOVED']),
  reviewRef:Id,
});
/** @typedef {z.infer<typeof ActivityChannelSchema>} ActivityChannel */

export const ActivityForecastSchema = z.strictObject({
  organizationId:Id, seriesId:Id, targetYear:z.number().int().min(2000).max(2200),
  asOf:Iso, state:z.enum(['PREDICTED','CONFIRMED','CANCELLED','INSUFFICIENT_DATA','UNKNOWN']),
  confidence:z.enum(['LOW','MEDIUM','NONE']),
  from:Day.optional(), to:Day.optional(),
  observedYears:z.array(z.number().int().min(2000).max(2200)).max(20),
  evidenceRefs:z.array(Id).max(20), reason:z.string().min(1).max(500),
});
/** @typedef {z.infer<typeof ActivityForecastSchema>} ActivityForecast */

export const ExchangeApplicantSchema = z.strictObject({
  duration:z.union([z.literal(1),z.literal(2)]),
  track:z.enum(['OIA','DEPARTMENT']), status:z.enum(['ENROLLED','LEAVE','UNKNOWN']),
  completedSemesters:z.number().int().min(0).max(15).optional(),
  gpa:z.number().finite().min(0).max(4.5).optional(),
  transfer:z.boolean().optional(), previousCancellation:z.enum(['CLEAR','CANCELLED','UNKNOWN']),
  language:z.strictObject({test:Id,score:z.number().finite().nonnegative(),expiresOn:Day}).optional(),
  departureOn:Day.optional(),
});
/** @typedef {z.infer<typeof ExchangeApplicantSchema>} ExchangeApplicant */
/** 학기 제한은 판본이 명시된 승인 공식 출처에서만 가져온다. 없으면 UNKNOWN이다. */
const SemesterRangeSchema=z.strictObject({min:z.number().int().min(0).max(15),
  max:z.number().int().min(0).max(15)}).refine(v=>v.min<=v.max);
const ProgramTermRulesSchema=z.strictObject({
  one:z.strictObject({ENROLLED:SemesterRangeSchema,LEAVE:SemesterRangeSchema}),
  two:z.strictObject({ENROLLED:SemesterRangeSchema,LEAVE:SemesterRangeSchema}),
});
export const ExchangePolicySchema = z.strictObject({
  ruleId:Id, sourceRevision:Id, sourceUrl:Source,
  track:z.enum(['OIA','DEPARTMENT']), publishedAt:Iso, verifiedAt:Iso,
  effectiveFrom:Day, effectiveUntil:Day.optional(),
  rights:CampusRightsSchema, provenance:CampusProvenanceSchema,
  minimumGpa:z.number().finite().min(0).max(4.5),
  /** 정책별 세부 규칙은 프로그램 기간이나 학생의 진술만으로 추정하지 않는다. */
  termRules:ProgramTermRulesSchema.optional(),
  twoSemesterTransfersAllowed:z.boolean().optional(),
  priorCancellationAllowed:z.boolean().optional(),
  partnerMinimumGpa:z.number().finite().min(0).max(4.5).optional(),
  requiredLanguage:z.strictObject({test:Id,minimumScore:z.number().finite().nonnegative()}).optional(),
  /** 공식 확인된 교류 대학과 학기 범위다. 미확인 대학은 UNKNOWN을 유지한다. */
  partnerId:Id,
});
/** @typedef {z.infer<typeof ExchangePolicySchema>} ExchangePolicy */
export const ExchangeCheckSchema = z.strictObject({
  code:z.enum(['TRACK','GPA','SEMESTERS','TRANSFER','CANCELLATION','PARTNER_GPA','LANGUAGE']),
  status:z.enum(['PASS','FAIL','UNKNOWN','NOT_APPLICABLE']),
  explanation:z.string().min(1).max(300),
  sourceRevision:Id.optional(),
});
/** @typedef {z.infer<typeof ExchangeCheckSchema>} ExchangeCheck */
export const ExchangeResultSchema = z.strictObject({
  asOf:Iso, policyRevision:Id.optional(), result:z.enum(['PASS','FAIL','UNKNOWN']),
  checks:z.array(ExchangeCheckSchema).length(7),
  disclaimer:z.literal('제시된 기준에 대한 참고 결과이며 공식 지원 자격·선발 결과가 아닙니다.'),
});
/** @typedef {z.infer<typeof ExchangeResultSchema>} ExchangeResult */

/** 검토된 개별 공개 부서 연락처만 예외로 취급한다. 도메인 전체의 개인정보 예외로 확대하지 않는다. */
export const FaqPublicContactsSchema = z.array(z.string().max(254).regex(
  /^(?:[\w.+-]+@[\w-]+(?:\.[\w-]+)+|(?:02|0[3-6][1-5])-\d{3,4}-\d{4})$/,
)).max(8).refine(values=>new Set(values).size===values.length);
export const FaqDocumentSchema = z.strictObject({
  documentId:Id, revisionId:Id,
  title:z.string().trim().min(2).max(200), sourceUrl:Source,
  category:z.enum(['ACADEMICS','SCHOLARSHIPS','EXCHANGE','ACTIVITIES','SERVICE']),
  publishedAt:Iso, verifiedAt:Iso, effectiveFrom:Day, effectiveUntil:Day.optional(),
  rights:CampusRightsSchema, provenance:CampusProvenanceSchema,
  accessScope:z.literal('PUBLIC'),
  paragraphs:z.array(z.strictObject({id:Id,text:z.string().trim().min(5).max(1000),
    publicContacts:FaqPublicContactsSchema.optional(),
  })).min(1).max(20),
});
/** @typedef {z.infer<typeof FaqDocumentSchema>} FaqDocument */
export const FaqCitationSchema = z.strictObject({
  citationId:Id, quote:z.string().trim().min(1).max(500),
});
export const FaqCandidateSchema = z.strictObject({
  answer:z.string().trim().min(1).max(2500),
  citations:z.array(FaqCitationSchema).min(1).max(6),
  needsHumanConfirmation:z.literal(true),
  suggestedLinks:z.array(z.enum(['/exchange','/activities','/notices'])).max(3),
});
/** @typedef {z.infer<typeof FaqCandidateSchema>} FaqCandidate */

export const ActivityArchiveResponseSchema=z.strictObject({
  asOf:Iso,sourceVersion:Id,items:z.array(ActivityRecordSchema).max(200),
  /** 이전 읽기 전용 클라이언트에는 선택 사항이며 true는 제한된 일부 결과만 반환했음을 뜻한다. */
  hasMore:z.boolean().optional(),
});
export const ExchangePartnerSummarySchema=z.strictObject({
  partnerId:Id,track:z.enum(['OIA','DEPARTMENT']),minimumGpa:z.number().min(0).max(4.5),
  partnerMinimumGpa:z.number().min(0).max(4.5).optional(),
  requiredLanguage:z.strictObject({test:Id,minimumScore:z.number().nonnegative()}).optional(),
  sourceRevision:Id,sourceUrl:Source,verifiedAt:Iso,provenance:CampusProvenanceSchema,
});
export const ExchangePartnerListSchema=z.strictObject({
  asOf:Iso,sourceVersion:Id,partners:z.array(ExchangePartnerSummarySchema).max(50),
});
/** 출처 링크만 제공하는 보수적 대체 방식이다. 링크는 검토된 서버 메타데이터이며 생성된 문구가 아니다. */
export const FaqSourceLinkSchema=z.strictObject({
  documentId:Id,revisionId:Id,title:z.string().min(1).max(200),
  sourceUrl:Source,verifiedAt:Iso,
});
export const FaqAskResponseSchema=z.discriminatedUnion('status',[
  z.strictObject({status:z.literal('NOT_FOUND'),asOf:Iso,evidence:z.array(z.never()).length(0)}),
  z.strictObject({status:z.literal('CONFIGURATION_REQUIRED'),asOf:Iso,
    evidence:z.array(z.never()).length(0),
    /** 모델 답변이나 원문 문단 자체를 포함하지 않는다. 현재 유효한 공식 출처 링크만 제공한다. */
    sourceLinks:z.array(FaqSourceLinkSchema).max(6).optional()}),
  z.strictObject({status:z.literal('NEEDS_REVIEW'),asOf:Iso,answer:FaqCandidateSchema,
    evidence:z.array(z.strictObject({citationId:Id,sourceUrl:Source,title:z.string().min(1),verifiedAt:Iso})).max(6),
    usage:z.strictObject({promptTokens:z.number().int().nonnegative(),completionTokens:z.number().int().positive(),
      totalTokens:z.number().int().positive()})}),
]);
/** @typedef {z.infer<typeof FaqAskResponseSchema>} FaqAskResponse */
