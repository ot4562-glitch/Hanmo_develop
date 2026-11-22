// @ts-check
/** @typedef {import("../../contracts/campus-assist/index.js").EvidenceRevision} EvidenceRevision */
/** @typedef {import("../../contracts/campus-assist/index.js").EvidenceManifest} EvidenceManifest */
/** @typedef {import("../../contracts/release/index.js").OfferingCandidate} OfferingCandidate */
/** @typedef {import("../../contracts/release/index.js").ReviewRecord} ReviewRecord */
/** @typedef {import("../../contracts/release/index.js").RevocationRecord} RevocationRecord */
/** @typedef {import("../../contracts/release/index.js").RevocationTarget} RevocationTarget */
/** @typedef {import("../../contracts/release/index.js").ReviewTarget} ReviewTarget */
/** @typedef {import("../../contracts/release/index.js").ReleaseManifest} ReleaseManifest */
/** @typedef {import("../../contracts/release/index.js").SnapshotBuildInput} SnapshotBuildInput */
/**
 * 보류 사유. NEWER_REVISION_PENDING은 더 새로운 판본이 검수되지 않아 이전 승인본도 내보내지 않는 경우다.
 * @typedef {'RIGHTS_NOT_APPROVED'|'AFTER_BUILT_AT'|'CONTENT_CONFLICT'|'REJECTED'|'SELF_APPROVAL'|'REVIEW_HASH_MISMATCH'|'NOT_REVIEWED'|'NEWER_REVISION_PENDING'} HoldReason
 */
/** @typedef {{ target:ReviewTarget; contentSha256:string; reason:HoldReason }} HeldItem */
/** @typedef {{ target:ReviewTarget; contentSha256:string; reason:string; revokedAt:string }} RevokedItem */
/** @typedef {{ target:ReviewTarget; contentSha256:string; supersededBy:string }} SupersededItem */
/**
 * @typedef {{
 *   manifest:ReleaseManifest; manifestSha256:string; evidenceManifest:EvidenceManifest;
 *   approved:{ evidence:EvidenceRevision[]; offerings:OfferingCandidate[] };
 *   held:HeldItem[]; revoked:RevokedItem[]; superseded:SupersededItem[];
 * }} SnapshotBuildResult
 */
import { EvidenceManifestSchema } from '../../contracts/campus-assist/index.js';
import { ReleaseManifestSchema, SnapshotBuildInputSchema } from '../../contracts/release/index.js';
import { canonicalJson, sha256Hex } from '../campus-assist/content-hash.js';
import { evidenceContentSha256 } from '../campus-assist/evidence-index.js';

/**
 * #42 검수 스냅샷 빌더.
 * 후보 판본을 승인·보류·철회·대체됨으로 나누고, 승인본만으로 배포 매니페스트를 만든다.
 * 시계·난수·입력 순서에 의존하지 않으므로 같은 입력은 같은 매니페스트와 해시를 낸다.
 * 형식 검사와 역할 문자열 대조만 수행하며 실제 신원·사용권 승인을 증명하지 않는다.
 */
export const SNAPSHOT_BUILDER_VERSION = 'reviewed-snapshot-builder-v1';

/** 커버리지 강도. 학기 범위는 가장 약한 관측을 따른다. */
const COVERAGE_RANK = { NOTICE_ONLY: 0, PARTIAL: 1, COMPLETE_TERM_CATALOG: 2 };

/** @param {string} a @param {string} b @returns {number} 코드 단위 기준 비교 결과 */
const byText = (a, b) => a < b ? -1 : a > b ? 1 : 0;

/** 검수 대상의 구분 가능한 키. 식별자에 콜론이 있어도 섞이지 않도록 정규 JSON을 쓴다. */
/** @param {ReviewTarget} target @returns {string} 대상 키 */
export const targetKey = target => canonicalJson(target);

/** @param {OfferingCandidate} o @returns {ReviewTarget} 개설 관측의 검수 대상 */
export const offeringTarget = o => ({ kind: 'OFFERING', courseId: o.courseId, campus: o.campus, term: o.term, sourceRef: o.sourceRef });
/** @param {EvidenceRevision} r @returns {ReviewTarget} 공지·FAQ 판본의 검수 대상 */
export const evidenceTarget = r => ({ kind: r.kind, documentId: r.documentId, revisionId: r.revisionId });

/** 개설 관측 후보의 내용 해시. 키 순서와 무관하다. */
/** @param {OfferingCandidate} o @returns {string} SHA-256 */
export function offeringContentSha256(o) {
    return sha256Hex(canonicalJson(o));
}

/**
 * 철회 대상이 검수 대상에 해당하는지 확인한다. 철회 대상에서 생략한 필드는 전체 범위다.
 * @param {RevocationTarget} revocation
 * @param {ReviewTarget} target
 * @returns {boolean}
 */
export function revocationCovers(revocation, target) {
    if (revocation.kind !== target.kind)
        return false;
    const r = /** @type {Record<string, unknown>} */ (revocation);
    const t = /** @type {Record<string, unknown>} */ (target);
    return Object.keys(r).every(k => r[k] === undefined || r[k] === t[k]);
}

/** 게시 시각 다음 판본 ID(숫자 인식) 순이다. #44 인덱스의 최신 판본 선택과 같은 기준이다. */
/** @param {EvidenceRevision} a @param {EvidenceRevision} b @returns {number} 정렬 순서 */
function revisionOrder(a, b) {
    const ta = Date.parse(a.publishedAt), tb = Date.parse(b.publishedAt);
    return ta !== tb ? Math.sign(ta - tb) : Math.sign(a.revisionId.localeCompare(b.revisionId, 'en', { numeric: true }));
}

/**
 * 검수 기록으로 한 판본의 상태를 정한다. 거부가 하나라도 있으면 승인보다 우선한다.
 * @param {readonly ReviewRecord[]} reviews 같은 대상의 기록
 * @param {string} sha 현재 내용 해시
 * @param {number} builtMs 빌드 기준 시각
 * @returns {HoldReason|null} 보류 사유, 승인이면 null
 */
function reviewOutcome(reviews, sha, builtMs) {
    const timely = reviews.filter(r => Date.parse(r.approvedAt) <= builtMs && Date.parse(r.reviewedAt) <= Date.parse(r.approvedAt));
    const sameContent = timely.filter(r => r.contentSha256 === sha);
    if (sameContent.some(r => r.decision === 'REJECTED'))
        return 'REJECTED';
    const approvals = sameContent.filter(r => r.decision === 'APPROVED');
    if (approvals.some(r => r.reviewerId !== r.approverId))
        return null;
    if (approvals.length)
        return 'SELF_APPROVAL';
    if (timely.some(r => r.decision === 'APPROVED'))
        return 'REVIEW_HASH_MISMATCH';
    return 'NOT_REVIEWED';
}

/**
 * @template T
 * @typedef {{ item:T; target:ReviewTarget; key:string; sha:string; status:'APPROVED'|'HOLD'|'REVOKED'; reason?:HoldReason; revocation?:RevocationRecord }} Classified
 */

/**
 * 후보 목록을 대상별로 분류한다. 같은 대상에 다른 내용이 둘 이상이면 모두 CONTENT_CONFLICT로 보류한다.
 * @template T
 * @param {readonly T[]} items
 * @param {(item:T)=>ReviewTarget} toTarget
 * @param {(item:T)=>string} toSha
 * @param {(item:T)=>{rights:string; publishedAt:string; verifiedAt:string}} meta
 * @param {Map<string, ReviewRecord[]>} reviewsByKey
 * @param {readonly RevocationRecord[]} revocations
 * @param {number} builtMs
 * @returns {Classified<T>[]}
 */
function classify(items, toTarget, toSha, meta, reviewsByKey, revocations, builtMs) {
    /** @type {Map<string, {item:T; target:ReviewTarget; sha:string}[]>} */
    const byKey = new Map();
    for (const item of items) {
        const target = toTarget(item), key = targetKey(target), sha = toSha(item);
        const rows = byKey.get(key) ?? [];
        // 완전히 같은 복사본은 한 건으로 본다.
        if (!rows.some(r => r.sha === sha))
            rows.push({ item, target, sha });
        byKey.set(key, rows);
    }
    /** @type {Classified<T>[]} */
    const out = [];
    for (const [key, rows] of byKey) {
        for (const { item, target, sha } of rows) {
            const revocation = revocations
                .filter(r => Date.parse(r.revokedAt) <= builtMs && revocationCovers(r.target, target))
                .sort((a, b) => Date.parse(a.revokedAt) - Date.parse(b.revokedAt) || byText(a.reason, b.reason))[0];
            if (revocation) {
                out.push({ item, target, key, sha, status: 'REVOKED', revocation });
                continue;
            }
            const m = meta(item);
            /** @type {HoldReason|null} */
            let reason = null;
            if (m.rights !== 'APPROVED')
                reason = 'RIGHTS_NOT_APPROVED';
            else if (Date.parse(m.publishedAt) > builtMs || Date.parse(m.verifiedAt) > builtMs)
                reason = 'AFTER_BUILT_AT';
            else if (rows.length > 1)
                reason = 'CONTENT_CONFLICT';
            else
                reason = reviewOutcome(reviewsByKey.get(key) ?? [], sha, builtMs);
            out.push(reason ? { item, target, key, sha, status: 'HOLD', reason } : { item, target, key, sha, status: 'APPROVED' });
        }
    }
    return out;
}

/**
 * 검수 스냅샷을 만든다.
 * - 공지·FAQ는 문서마다 최신 판본 하나만 싣는다. 최신 판본이 보류이면 이전 승인본도 보류한다.
 * - 철회는 빌드 시각 이전 기록만 반영하며, 철회된 판본은 대체 판본 없이 제외된다.
 * - 학기 관측 범위는 승인된 개설 관측에서만 계산하고, 관측이 없는 학기를 미개설로 만들지 않는다.
 * @param {SnapshotBuildInput} rawInput
 * @returns {SnapshotBuildResult}
 */
export function buildReviewedSnapshot(rawInput) {
    const input = SnapshotBuildInputSchema.parse(rawInput);
    const builtMs = Date.parse(input.builtAt);
    if (input.evidence.some(r => r.provenance !== input.provenance) || input.offerings.some(o => o.provenance !== input.provenance))
        throw new RangeError('Mixed synthetic and real candidates');
    /** @type {Map<string, ReviewRecord[]>} */
    const reviewsByKey = new Map();
    for (const r of input.reviews) {
        const key = targetKey(r.target);
        reviewsByKey.set(key, [...(reviewsByKey.get(key) ?? []), r]);
    }
    const evidence = classify(input.evidence, evidenceTarget, evidenceContentSha256, r => r, reviewsByKey, input.revocations, builtMs);
    const offerings = classify(input.offerings, offeringTarget, offeringContentSha256, o => o, reviewsByKey, input.revocations, builtMs);

    /** @type {HeldItem[]} */
    const held = [];
    /** @type {RevokedItem[]} */
    const revoked = [];
    /** @type {SupersededItem[]} */
    const superseded = [];
    for (const c of [...evidence, ...offerings]) {
        if (c.status === 'REVOKED' && c.revocation)
            revoked.push({ target: c.target, contentSha256: c.sha, reason: c.revocation.reason, revokedAt: c.revocation.revokedAt });
    }

    // 문서별 최신 판본 선택. 철회·빌드 이후 판본은 최신 판본 후보에서 뺀다.
    /** @type {Map<string, Classified<EvidenceRevision>[]>} */
    const byDoc = new Map();
    for (const c of evidence) {
        const key = c.item.kind + '\u0000' + c.item.documentId;
        byDoc.set(key, [...(byDoc.get(key) ?? []), c]);
    }
    /** @type {EvidenceRevision[]} */
    const approvedEvidence = [];
    for (const rows of byDoc.values()) {
        const live = rows.filter(c => c.status !== 'REVOKED' && c.reason !== 'AFTER_BUILT_AT');
        for (const c of rows)
            if (c.status === 'HOLD' && c.reason === 'AFTER_BUILT_AT')
                held.push({ target: c.target, contentSha256: c.sha, reason: 'AFTER_BUILT_AT' });
        if (!live.length)
            continue;
        const ordered = [...live].sort((a, b) => revisionOrder(a.item, b.item) || byText(a.sha, b.sha));
        const head = ordered[ordered.length - 1];
        // 같은 판본 위치(r1/r01 등)에 다른 판본이 있으면 어느 쪽도 최신으로 확정하지 않는다.
        const tiedHeads = ordered.filter(c => revisionOrder(c.item, head.item) === 0);
        const headApproved = tiedHeads.length === 1 && head.status === 'APPROVED';
        for (const c of ordered) {
            if (c === head && headApproved) {
                approvedEvidence.push(c.item);
            }
            else if (c.status === 'APPROVED' && headApproved) {
                superseded.push({ target: c.target, contentSha256: c.sha, supersededBy: head.item.revisionId });
            }
            else if (c.status === 'APPROVED') {
                held.push({ target: c.target, contentSha256: c.sha, reason: tiedHeads.includes(c) ? 'CONTENT_CONFLICT' : 'NEWER_REVISION_PENDING' });
            }
            else if (c.reason) {
                held.push({ target: c.target, contentSha256: c.sha, reason: c.reason });
            }
        }
    }
    /** @type {OfferingCandidate[]} */
    const approvedOfferings = [];
    for (const c of offerings) {
        if (c.status === 'APPROVED')
            approvedOfferings.push(c.item);
        else if (c.status === 'HOLD' && c.reason)
            held.push({ target: c.target, contentSha256: c.sha, reason: c.reason });
    }

    const docSort = (/** @type {EvidenceRevision} */ a, /** @type {EvidenceRevision} */ b) => byText(a.kind, b.kind) || byText(a.documentId, b.documentId);
    approvedEvidence.sort(docSort);
    const offerSort = (/** @type {OfferingCandidate} */ a, /** @type {OfferingCandidate} */ b) =>
        byText(a.campus, b.campus) || byText(a.term, b.term) || byText(a.courseId, b.courseId) || byText(a.sourceRef, b.sourceRef);
    approvedOfferings.sort(offerSort);

    /** @type {Map<string, {campus:'SEOUL'|'GLOBAL'; term:string; rank:number; refs:Set<string>; count:number}>} */
    const coverage = new Map();
    for (const o of approvedOfferings) {
        const key = o.campus + '\u0000' + o.term;
        const row = coverage.get(key) ?? { campus: o.campus, term: o.term, rank: 2, refs: new Set(), count: 0 };
        row.rank = Math.min(row.rank, COVERAGE_RANK[o.coverage]);
        row.refs.add(o.sourceRef);
        row.count++;
        coverage.set(key, row);
    }
    const rankName = /** @type {const} */ (['NOTICE_ONLY', 'PARTIAL', 'COMPLETE_TERM_CATALOG']);
    const termCoverage = [...coverage.values()]
        .sort((a, b) => byText(a.campus, b.campus) || byText(a.term, b.term))
        .map(r => ({ campus: r.campus, term: r.term, coverage: rankName[r.rank], observationCount: r.count, sourceRefs: [...r.refs].sort(byText) }));

    const manifest = ReleaseManifestSchema.parse({
        schemaVersion: 1, snapshotId: input.snapshotId, indexRevision: input.indexRevision,
        builtAt: input.builtAt, validUntil: input.validUntil, provenance: input.provenance,
        documents: approvedEvidence.map(r => ({
            kind: r.kind, documentId: r.documentId, revisionId: r.revisionId, contentSha256: evidenceContentSha256(r),
            sourceUrl: r.sourceUrl, publishedAt: r.publishedAt, verifiedAt: r.verifiedAt, state: r.state,
            paragraphIds: r.paragraphs.map(p => p.id),
        })),
        offerings: approvedOfferings.map(o => ({
            courseId: o.courseId, campus: o.campus, term: o.term, sourceRef: o.sourceRef, contentSha256: offeringContentSha256(o),
            state: o.state, coverage: o.coverage, sourceUrl: o.sourceUrl, publishedAt: o.publishedAt, verifiedAt: o.verifiedAt,
        })),
        termCoverage,
    });
    const evidenceManifest = EvidenceManifestSchema.parse({
        snapshotId: manifest.snapshotId, indexRevision: manifest.indexRevision, builtAt: manifest.builtAt,
        provenance: manifest.provenance,
        entries: manifest.documents.map(d => ({ kind: d.kind, documentId: d.documentId, revisionId: d.revisionId, contentSha256: d.contentSha256 })),
    });
    const itemSort = (/** @type {{target:ReviewTarget; contentSha256:string}} */ a, /** @type {{target:ReviewTarget; contentSha256:string}} */ b) =>
        byText(targetKey(a.target), targetKey(b.target)) || byText(a.contentSha256, b.contentSha256);
    return {
        manifest, manifestSha256: releaseManifestSha256(manifest), evidenceManifest,
        approved: { evidence: approvedEvidence, offerings: approvedOfferings },
        held: held.sort(itemSort), revoked: revoked.sort(itemSort), superseded: superseded.sort(itemSort),
    };
}

/** 매니페스트 무결성 해시. 서명이 아니므로 배포 경로의 신뢰를 대신하지 않는다. */
/** @param {ReleaseManifest} manifest @returns {string} SHA-256 */
export function releaseManifestSha256(manifest) {
    return sha256Hex(canonicalJson(manifest));
}
