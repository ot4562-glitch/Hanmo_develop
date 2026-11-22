// @ts-check
import {z} from 'zod';
import {
  CampusProvenanceSchema, CampusRightsSchema, EvidenceKindSchema, EvidenceRevisionSchema,
} from '../campus-assist/index.js';

/**
 * #42 검수 스냅샷 빌더의 입력·출력 계약이다.
 * 이 계약은 판본·해시·역할 기록의 형식만 검사한다. 검수자·승인자 ID는 문자열이며 신원 인증이나
 * 학교 자료 사용권 승인의 증거가 아니다. 합성 자료를 실제 학교 자료로 바꾸지 않는다.
 */
const Id = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/);
const Iso = z.iso.datetime({offset:true});
const Source = z.url().startsWith('https://').max(1000);
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const Term = z.string().regex(/^(19|20|21)\d{2}-[12]$/);
const Campus = z.enum(['SEOUL','GLOBAL']);

/** 학기·캠퍼스별 개설 관측 후보 한 건이다. coverage는 해당 출처가 그 학기 전체 목록인지 일부인지를 나타낸다. */
export const OfferingCandidateSchema = z.strictObject({
  courseId:Id, campus:Campus, term:Term,
  state:z.enum(['OFFERED','CONFIRMED_NOT_OFFERED','UNKNOWN']),
  coverage:z.enum(['COMPLETE_TERM_CATALOG','PARTIAL','NOTICE_ONLY']),
  sourceRef:Id, sourceUrl:Source, publishedAt:Iso, verifiedAt:Iso,
  rights:CampusRightsSchema, provenance:CampusProvenanceSchema,
}).refine(o=>o.state!=='CONFIRMED_NOT_OFFERED'||o.coverage==='COMPLETE_TERM_CATALOG',
  '미개설 확정은 학기 전체 목록 관측에서만 가능합니다');
/** @typedef {z.infer<typeof OfferingCandidateSchema>} OfferingCandidate */

/** 검수·승인 대상 판본 하나를 가리키는 정확한 식별자다. */
export const ReviewTargetSchema = z.union([
  z.strictObject({kind:EvidenceKindSchema, documentId:Id, revisionId:Id}),
  z.strictObject({kind:z.literal('OFFERING'), courseId:Id, campus:Campus, term:Term, sourceRef:Id}),
]);
/** @typedef {z.infer<typeof ReviewTargetSchema>} ReviewTarget */

/** 철회 대상이다. 생략한 필드는 해당 범위 전체를 뜻한다(예: revisionId가 없으면 문서의 모든 판본). */
export const RevocationTargetSchema = z.union([
  z.strictObject({kind:EvidenceKindSchema, documentId:Id, revisionId:Id.optional()}),
  z.strictObject({kind:z.literal('OFFERING'), courseId:Id, campus:Campus.optional(),
    term:Term.optional(), sourceRef:Id.optional()}),
]);
/** @typedef {z.infer<typeof RevocationTargetSchema>} RevocationTarget */

/** 원문 대조 검수자와 그와 다른 승인자의 기록이다. 같은 내용 해시에 대해서만 효력이 있다. */
export const ReviewRecordSchema = z.strictObject({
  target:ReviewTargetSchema, contentSha256:Sha256,
  reviewerId:Id, approverId:Id,
  decision:z.enum(['APPROVED','REJECTED']),
  reviewedAt:Iso, approvedAt:Iso,
});
/** @typedef {z.infer<typeof ReviewRecordSchema>} ReviewRecord */

export const RevocationRecordSchema = z.strictObject({
  target:RevocationTargetSchema,
  reason:z.string().trim().min(2).max(300),
  revokedAt:Iso,
});
/** @typedef {z.infer<typeof RevocationRecordSchema>} RevocationRecord */

export const SnapshotBuildInputSchema = z.strictObject({
  snapshotId:Id, indexRevision:Id, builtAt:Iso, validUntil:Iso,
  provenance:CampusProvenanceSchema,
  evidence:z.array(EvidenceRevisionSchema).max(10000),
  offerings:z.array(OfferingCandidateSchema).max(50000),
  reviews:z.array(ReviewRecordSchema).max(100000),
  revocations:z.array(RevocationRecordSchema).max(10000),
}).refine(i=>Date.parse(i.validUntil)>Date.parse(i.builtAt),'validUntil must be after builtAt');
/** @typedef {z.input<typeof SnapshotBuildInputSchema>} SnapshotBuildInput */

/** 배포 매니페스트의 문서 항목이다. paragraphIds로 근거 문단 범위를 고정한다. */
export const ManifestDocumentSchema = z.strictObject({
  kind:EvidenceKindSchema, documentId:Id, revisionId:Id, contentSha256:Sha256,
  sourceUrl:Source, publishedAt:Iso, verifiedAt:Iso,
  state:z.enum(['PUBLISHED','CORRECTED','CANCELLED']),
  paragraphIds:z.array(Id).max(40),
});
export const ManifestOfferingSchema = z.strictObject({
  courseId:Id, campus:Campus, term:Term, sourceRef:Id, contentSha256:Sha256,
  state:z.enum(['OFFERED','CONFIRMED_NOT_OFFERED','UNKNOWN']),
  coverage:z.enum(['COMPLETE_TERM_CATALOG','PARTIAL','NOTICE_ONLY']),
  sourceUrl:Source, publishedAt:Iso, verifiedAt:Iso,
});
/** 학기 관측 범위. coverage는 해당 학기 승인 관측 가운데 가장 약한 범위이며, 관측 없는 학기는 미개설이 아니다. */
export const TermCoverageSchema = z.strictObject({
  campus:Campus, term:Term,
  coverage:z.enum(['COMPLETE_TERM_CATALOG','PARTIAL','NOTICE_ONLY']),
  observationCount:z.number().int().min(1), sourceRefs:z.array(Id).min(1),
});
export const ReleaseManifestSchema = z.strictObject({
  schemaVersion:z.literal(1),
  snapshotId:Id, indexRevision:Id, builtAt:Iso, validUntil:Iso,
  provenance:CampusProvenanceSchema,
  documents:z.array(ManifestDocumentSchema).max(10000),
  offerings:z.array(ManifestOfferingSchema).max(50000),
  termCoverage:z.array(TermCoverageSchema).max(2000),
});
/** @typedef {z.infer<typeof ReleaseManifestSchema>} ReleaseManifest */

/** 함께 배포되는 공지·전망·FAQ 인덱스가 참조하는 스냅샷 정보다. */
export const ReleaseConsumersSchema = z.strictObject({
  notices:z.strictObject({snapshotId:Id}),
  forecast:z.strictObject({snapshotId:Id}),
  faqIndex:z.strictObject({snapshotId:Id, indexRevision:Id}),
});
/** @typedef {z.infer<typeof ReleaseConsumersSchema>} ReleaseConsumers */

export const ReleaseBundleSchema = z.strictObject({
  manifest:ReleaseManifestSchema, manifestSha256:Sha256, consumers:ReleaseConsumersSchema,
});
/** @typedef {z.infer<typeof ReleaseBundleSchema>} ReleaseBundle */
