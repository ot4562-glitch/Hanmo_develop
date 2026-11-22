// @ts-check
/** @typedef {import("../../contracts/campus-assist/index.js").EvidenceRevision} EvidenceRevision */
/** @typedef {import("../../contracts/release/index.js").OfferingCandidate} OfferingCandidate */
/** @typedef {import("../../contracts/release/index.js").ReviewRecord} ReviewRecord */
/** @typedef {import("../../contracts/release/index.js").RevocationRecord} RevocationRecord */
/** @typedef {import("../../contracts/release/index.js").SnapshotBuildInput} SnapshotBuildInput */
/** @typedef {import("../../contracts/release/index.js").ReleaseBundle} ReleaseBundle */
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../campus-assist/content-hash.js';
import { buildEvidenceIndex, evidenceContentSha256 } from '../campus-assist/evidence-index.js';
import {
    buildReviewedSnapshot, evidenceTarget, offeringContentSha256, offeringTarget, releaseManifestSha256,
} from './snapshot-builder.js';
import { selectReleaseSnapshot, verifyReleaseBundle } from './snapshot-release.js';

// 모든 문서·과목·날짜·URL은 SYNTHETIC 고정 자료다. 실제 한국외대 공지·개설 이력이 아니며 검수 증거로 쓰지 않는다.
const BUILT_AT = '2026-11-20T00:00:00Z';
const VALID_UNTIL = '2026-12-20T00:00:00Z';

/** @param {string} documentId @param {string} revisionId @param {Partial<EvidenceRevision>} [patch] @returns {EvidenceRevision} */
const rev = (documentId, revisionId, patch = {}) => ({
    kind: 'NOTICE', documentId, revisionId, title: '가상 학사 안내 ' + documentId,
    sourceUrl: 'https://example.org/synthetic/' + documentId,
    publishedAt: '2026-11-01T00:00:00+09:00', verifiedAt: '2026-11-02T00:00:00+09:00',
    state: 'PUBLISHED', rights: 'APPROVED', provenance: 'SYNTHETIC',
    paragraphs: [{ id: 'p1', text: '가상 신청 기간은 가상 1주차입니다.' }], ...patch,
});
/** @param {string} courseId @param {string} term @param {Partial<OfferingCandidate>} [patch] @returns {OfferingCandidate} */
const off = (courseId, term, patch = {}) => ({
    courseId, campus: 'SEOUL', term, state: 'OFFERED', coverage: 'COMPLETE_TERM_CATALOG',
    sourceRef: 'SYN-CAT-' + term, sourceUrl: 'https://example.org/synthetic/catalog/' + term,
    publishedAt: '2026-03-01T00:00:00+09:00', verifiedAt: '2026-03-02T00:00:00+09:00',
    rights: 'APPROVED', provenance: 'SYNTHETIC', ...patch,
});
/** 서로 다른 검수자·승인자의 정상 승인 기록. */
/** @param {EvidenceRevision|OfferingCandidate} item @param {Partial<ReviewRecord>} [patch] @returns {ReviewRecord} */
const approve = (item, patch = {}) => {
    const evidence = 'documentId' in item;
    return {
        target: evidence ? evidenceTarget(/** @type {EvidenceRevision} */ (item)) : offeringTarget(/** @type {OfferingCandidate} */ (item)),
        contentSha256: evidence ? evidenceContentSha256(/** @type {EvidenceRevision} */ (item)) : offeringContentSha256(/** @type {OfferingCandidate} */ (item)),
        reviewerId: 'SYN-REVIEWER', approverId: 'SYN-APPROVER', decision: 'APPROVED',
        reviewedAt: '2026-11-10T00:00:00Z', approvedAt: '2026-11-11T00:00:00Z', ...patch,
    };
};
/** @param {Partial<SnapshotBuildInput>} patch @returns {SnapshotBuildInput} */
const input = patch => ({
    snapshotId: 'SYN-SNAP-1', indexRevision: 'idx-1', builtAt: BUILT_AT, validUntil: VALID_UNTIL, provenance: 'SYNTHETIC',
    evidence: [], offerings: [], reviews: [], revocations: [], ...patch,
});
/** @param {ReturnType<typeof buildReviewedSnapshot>} result @param {string} key */
const heldReason = (result, key) => result.held.find(h => canonicalJson(h.target).includes(key))?.reason;

describe('#42 검수 스냅샷 빌더 — 정상 경로', () => {
    it('승인된 공지·FAQ·개설 관측으로 문서·판본·문단 ID, 원문 URL, 시각, 학기 관측 범위를 담은 매니페스트를 만든다', () => {
        const n = rev('N1', 'r1', { paragraphs: [{ id: 'p1', text: '가상 첫 문단입니다.' }, { id: 'p2', text: '가상 둘째 문단입니다.' }] });
        const f = rev('F1', 'r1', { kind: 'FAQ' });
        const o = off('SYN101', '2026-1');
        const result = buildReviewedSnapshot(input({ evidence: [n, f], offerings: [o], reviews: [approve(n), approve(f), approve(o)] }));
        expect(result.manifest.documents).toEqual([
            expect.objectContaining({ kind: 'FAQ', documentId: 'F1', revisionId: 'r1', paragraphIds: ['p1'] }),
            expect.objectContaining({
                kind: 'NOTICE', documentId: 'N1', revisionId: 'r1', paragraphIds: ['p1', 'p2'],
                sourceUrl: 'https://example.org/synthetic/N1', publishedAt: n.publishedAt, verifiedAt: n.verifiedAt,
                contentSha256: evidenceContentSha256(n),
            }),
        ]);
        expect(result.manifest.offerings).toHaveLength(1);
        expect(result.manifest.termCoverage).toEqual([
            { campus: 'SEOUL', term: '2026-1', coverage: 'COMPLETE_TERM_CATALOG', observationCount: 1, sourceRefs: ['SYN-CAT-2026-1'] },
        ]);
        expect(result.held).toEqual([]);
        expect(result.manifestSha256).toBe(releaseManifestSha256(result.manifest));
    });

    it('같은 입력은 입력 순서와 무관하게 같은 매니페스트와 해시를 낸다', () => {
        const items = [rev('N1', 'r1'), rev('N2', 'r1'), rev('F1', 'r1', { kind: 'FAQ' })];
        const offers = [off('SYN101', '2026-1'), off('SYN102', '2026-1'), off('SYN101', '2025-1')];
        const reviews = [...items, ...offers].map(i => approve(i));
        const a = buildReviewedSnapshot(input({ evidence: items, offerings: offers, reviews }));
        const b = buildReviewedSnapshot(input({ evidence: [...items].reverse(), offerings: [...offers].reverse(), reviews: [...reviews].reverse() }));
        expect(canonicalJson(a)).toBe(canonicalJson(b));
        expect(a.manifestSha256).toBe(b.manifestSha256);
        expect(buildReviewedSnapshot(input({ evidence: items, offerings: offers, reviews })).manifestSha256).toBe(a.manifestSha256);
    });

    it('#44 근거 인덱스가 빌더의 evidenceManifest를 그대로 읽고 같은 스냅샷 ID로 색인한다', () => {
        const n = rev('N1', 'r1');
        const f = rev('F1', 'r1', { kind: 'FAQ', paragraphs: [{ id: 'q1', text: '가상 질문의 답변입니다.', refs: [{ kind: 'NOTICE', documentId: 'N1', revisionId: 'r1' }] }] });
        const result = buildReviewedSnapshot(input({ evidence: [n, f], reviews: [approve(n), approve(f)] }));
        const index = buildEvidenceIndex({ manifest: result.evidenceManifest, revisions: result.approved.evidence, asOf: '2026-11-21T00:00:00Z' });
        expect(index.status).toBe('READY');
        expect(index.snapshotId).toBe('SYN-SNAP-1');
        expect(index.indexRevision).toBe('idx-1');
        expect(index.entries.map(e => e.citationId)).toEqual(['FAQ:F1:r1:q1', 'NOTICE:N1:r1:p1']);
    });
});

describe('#42 검수 스냅샷 빌더 — 후보·승인·철회 분리', () => {
    it('검수자와 승인자가 같으면 SELF_APPROVAL로 보류한다', () => {
        const n = rev('N1', 'r1');
        const result = buildReviewedSnapshot(input({ evidence: [n], reviews: [approve(n, { approverId: 'SYN-REVIEWER' })] }));
        expect(result.manifest.documents).toEqual([]);
        expect(heldReason(result, 'N1')).toBe('SELF_APPROVAL');
    });

    it('승인 기록의 해시가 현재 내용과 다르면 REVIEW_HASH_MISMATCH, 기록이 없으면 NOT_REVIEWED로 보류한다', () => {
        const n = rev('N1', 'r1');
        const edited = rev('N1', 'r1', { title: '가상 학사 안내 수정본' });
        const a = buildReviewedSnapshot(input({ evidence: [edited], reviews: [approve(n)] }));
        expect(heldReason(a, 'N1')).toBe('REVIEW_HASH_MISMATCH');
        const b = buildReviewedSnapshot(input({ evidence: [n] }));
        expect(heldReason(b, 'N1')).toBe('NOT_REVIEWED');
    });

    it('같은 내용의 거부 기록은 다른 승인보다 우선한다', () => {
        const n = rev('N1', 'r1');
        const result = buildReviewedSnapshot(input({ evidence: [n], reviews: [approve(n), approve(n, { approverId: 'SYN-APPROVER-2', decision: 'REJECTED' })] }));
        expect(heldReason(result, 'N1')).toBe('REJECTED');
    });

    it('사용권 미승인·빌드 이후 게시·빌드 이후 승인은 내보내지 않는다', () => {
        const blocked = rev('N1', 'r1', { rights: 'BLOCKED' });
        const future = rev('N2', 'r1', { publishedAt: '2026-11-25T00:00:00Z', verifiedAt: '2026-11-25T00:00:00Z' });
        const lateApproval = rev('N3', 'r1');
        const result = buildReviewedSnapshot(input({
            evidence: [blocked, future, lateApproval],
            reviews: [approve(blocked), approve(future), approve(lateApproval, { approvedAt: '2026-11-21T00:00:00Z' })],
        }));
        expect(result.manifest.documents).toEqual([]);
        expect(heldReason(result, 'N1')).toBe('RIGHTS_NOT_APPROVED');
        expect(heldReason(result, 'N2')).toBe('AFTER_BUILT_AT');
        expect(heldReason(result, 'N3')).toBe('NOT_REVIEWED');
    });

    it('더 새로운 정정본이 미검수이면 이전 승인본도 내보내지 않는다', () => {
        const r1 = rev('N1', 'r1');
        const r2 = rev('N1', 'r2', { state: 'CORRECTED', publishedAt: '2026-11-05T00:00:00+09:00', verifiedAt: '2026-11-06T00:00:00+09:00' });
        const result = buildReviewedSnapshot(input({ evidence: [r1, r2], reviews: [approve(r1)] }));
        expect(result.manifest.documents).toEqual([]);
        expect(result.held.map(h => [/** @type {any} */ (h.target).revisionId, h.reason])).toEqual([['r1', 'NEWER_REVISION_PENDING'], ['r2', 'NOT_REVIEWED']]);
    });

    it('정정본이 승인되면 정정본만 싣고 이전 판본은 대체됨으로 남긴다', () => {
        const r1 = rev('N1', 'r1');
        const r2 = rev('N1', 'r2', { state: 'CORRECTED', publishedAt: '2026-11-05T00:00:00+09:00', verifiedAt: '2026-11-06T00:00:00+09:00' });
        const result = buildReviewedSnapshot(input({ evidence: [r1, r2], reviews: [approve(r1), approve(r2)] }));
        expect(result.manifest.documents.map(d => d.revisionId)).toEqual(['r2']);
        expect(result.superseded).toEqual([expect.objectContaining({ supersededBy: 'r2' })]);
    });

    it('문서 단위 철회는 모든 판본을, 판본 단위 철회는 해당 판본만 제외한다', () => {
        const r1 = rev('N1', 'r1');
        const r2 = rev('N1', 'r2', { publishedAt: '2026-11-05T00:00:00+09:00' });
        const reviews = [approve(r1), approve(r2)];
        /** @type {RevocationRecord} */
        const docRevoke = { target: { kind: 'NOTICE', documentId: 'N1' }, reason: '가상 사용권 회수', revokedAt: '2026-11-15T00:00:00Z' };
        const a = buildReviewedSnapshot(input({ evidence: [r1, r2], reviews, revocations: [docRevoke] }));
        expect(a.manifest.documents).toEqual([]);
        expect(a.revoked).toHaveLength(2);
        // 오류가 있는 정정본만 철회하면 남은 승인 판본이 최신 판본이 된다.
        /** @type {RevocationRecord} */
        const revRevoke = { target: { kind: 'NOTICE', documentId: 'N1', revisionId: 'r2' }, reason: '가상 정정 오류', revokedAt: '2026-11-15T00:00:00Z' };
        const b = buildReviewedSnapshot(input({ evidence: [r1, r2], reviews, revocations: [revRevoke] }));
        expect(b.manifest.documents.map(d => d.revisionId)).toEqual(['r1']);
        // 빌드 이후 시각의 철회는 빌드 결과에 반영하지 않고, 배포 검증 단계에서 대조한다.
        const c = buildReviewedSnapshot(input({ evidence: [r1, r2], reviews, revocations: [{ ...docRevoke, revokedAt: '2026-11-25T00:00:00Z' }] }));
        expect(c.manifest.documents.map(d => d.revisionId)).toEqual(['r2']);
    });

    it('같은 판본 ID에 다른 내용이 있으면 CONTENT_CONFLICT로 보류한다', () => {
        const a = rev('N1', 'r1');
        const b = rev('N1', 'r1', { title: '가상 학사 안내 다른 내용' });
        const result = buildReviewedSnapshot(input({ evidence: [a, b], reviews: [approve(a), approve(b)] }));
        expect(result.manifest.documents).toEqual([]);
        expect(result.held.every(h => h.reason === 'CONTENT_CONFLICT')).toBe(true);
    });

    it('학기 관측 범위는 승인된 관측 중 가장 약한 범위를 쓰고 미승인 관측은 세지 않는다', () => {
        const full = off('SYN101', '2026-1');
        const partial = off('SYN102', '2026-1', { coverage: 'PARTIAL', sourceRef: 'SYN-NOTICE-7' });
        const unreviewed = off('SYN103', '2025-2', { coverage: 'NOTICE_ONLY' });
        const result = buildReviewedSnapshot(input({ offerings: [full, partial, unreviewed], reviews: [approve(full), approve(partial)] }));
        expect(result.manifest.termCoverage).toEqual([
            { campus: 'SEOUL', term: '2026-1', coverage: 'PARTIAL', observationCount: 2, sourceRefs: ['SYN-CAT-2026-1', 'SYN-NOTICE-7'] },
        ]);
        expect(heldReason(result, 'SYN103')).toBe('NOT_REVIEWED');
    });

    it('학기 전체 목록이 아닌 출처의 미개설 확정과 합성·실자료 혼합을 거부한다', () => {
        expect(() => buildReviewedSnapshot(input({ offerings: [off('SYN101', '2026-1', { state: 'CONFIRMED_NOT_OFFERED', coverage: 'PARTIAL' })] }))).toThrow();
        expect(() => buildReviewedSnapshot(input({ evidence: [rev('N1', 'r1', { provenance: 'REAL_APPROVED' })] }))).toThrow(/Mixed/);
        expect(() => buildReviewedSnapshot(input({ validUntil: BUILT_AT }))).toThrow();
    });
});

/** @param {string} snapshotId @param {string} builtAt @param {string} validUntil @returns {ReleaseBundle} */
const bundleOf = (snapshotId, builtAt = BUILT_AT, validUntil = VALID_UNTIL) => {
    // 가장 이른 대체본 빌드 시각보다 앞선 게시·검수 시각을 사용한다.
    const timing = { publishedAt: '2026-10-01T00:00:00Z', verifiedAt: '2026-10-02T00:00:00Z' };
    const n = rev('N1', 'r1', timing);
    const o = off('SYN101', '2026-1', timing);
    const early = { reviewedAt: '2026-10-10T00:00:00Z', approvedAt: '2026-10-11T00:00:00Z' };
    const built = buildReviewedSnapshot(input({ snapshotId, builtAt, validUntil, evidence: [n], offerings: [o], reviews: [approve(n, early), approve(o, early)] }));
    return {
        manifest: built.manifest, manifestSha256: built.manifestSha256,
        consumers: { notices: { snapshotId }, forecast: { snapshotId }, faqIndex: { snapshotId, indexRevision: 'idx-1' } },
    };
};
const NOW = '2026-11-21T00:00:00Z';

describe('#42 배포 스냅샷 검증', () => {
    it('공지·전망·FAQ 인덱스가 같은 스냅샷을 참조하는 유효한 묶음을 통과시킨다', () => {
        expect(verifyReleaseBundle(bundleOf('SYN-SNAP-1'), { now: NOW, provenance: 'SYNTHETIC' })).toEqual({ ok: true, snapshotId: 'SYN-SNAP-1', reasons: [] });
    });

    it('소비자 스냅샷·인덱스 판본 불일치를 각각 거부한다', () => {
        const b = bundleOf('SYN-SNAP-1');
        const bad = { ...b, consumers: { notices: { snapshotId: 'SYN-SNAP-0' }, forecast: { snapshotId: 'SYN-SNAP-0' }, faqIndex: { snapshotId: 'SYN-SNAP-0', indexRevision: 'idx-0' } } };
        const result = verifyReleaseBundle(bad, { now: NOW });
        expect(result.ok).toBe(false);
        expect(result.reasons).toEqual([
            'NOTICES_SNAPSHOT_MISMATCH', 'FORECAST_SNAPSHOT_MISMATCH', 'FAQ_INDEX_SNAPSHOT_MISMATCH', 'FAQ_INDEX_REVISION_MISMATCH',
        ]);
    });

    it('매니페스트가 변조되면 해시 불일치로 거부한다', () => {
        const b = bundleOf('SYN-SNAP-1');
        const tampered = { ...b, manifest: { ...b.manifest, validUntil: '2027-12-01T00:00:00Z' } };
        const result = verifyReleaseBundle(tampered, { now: NOW });
        expect(result.reasons).toEqual(['MANIFEST_HASH_MISMATCH']);
    });

    it('만료·빌드 이전·철회 스냅샷·이후 철회된 판본 포함·출처 구분 불일치·형식 오류·빈 매니페스트를 거부한다', () => {
        const reasons = (/** @type {unknown} */ b, /** @type {Partial<Parameters<typeof verifyReleaseBundle>[1]>} */ o = {}) => {
            return verifyReleaseBundle(b, { now: NOW, ...o }).reasons;
        };
        expect(reasons(bundleOf('S', BUILT_AT, '2026-11-20T12:00:00Z'))).toEqual(['EXPIRED']);
        expect(reasons(bundleOf('S', '2026-11-22T00:00:00Z'))).toEqual(['NOT_YET_VALID']);
        expect(reasons(bundleOf('S'), { revokedSnapshotIds: ['S'] })).toEqual(['SNAPSHOT_REVOKED']);
        expect(reasons(bundleOf('S'), { revocations: [{ target: { kind: 'OFFERING', courseId: 'SYN101' }, reason: '가상 출처 회수', revokedAt: '2026-11-20T06:00:00Z' }] }))
            .toEqual(['CONTAINS_REVOKED_ITEM']);
        expect(reasons(bundleOf('S'), { provenance: 'REAL_APPROVED' })).toEqual(['PROVENANCE_MISMATCH']);
        expect(reasons({ manifest: { snapshotId: 'S' } })).toEqual(['INVALID_BUNDLE']);
        expect(reasons(null)).toEqual(['INVALID_BUNDLE']);
        const empty = buildReviewedSnapshot(input({}));
        expect(reasons({ manifest: empty.manifest, manifestSha256: empty.manifestSha256, consumers: bundleOf('SYN-SNAP-1').consumers }))
            .toEqual(['EMPTY_MANIFEST']);
    });
});

describe('#42 대체 스냅샷 선택과 확인 필요 상태', () => {
    it('기본 묶음이 유효하면 대체본을 보지 않는다', () => {
        const result = selectReleaseSnapshot({ primary: bundleOf('SYN-SNAP-2'), fallbacks: [bundleOf('SYN-SNAP-1')], now: NOW });
        expect(result).toMatchObject({ status: 'READY', snapshotId: 'SYN-SNAP-2', usedFallback: false, rejected: [] });
    });

    it('기본 묶음이 철회되면 철회·만료되지 않은 가장 최신 대체본을 고른다', () => {
        const older = bundleOf('SYN-SNAP-0', '2026-11-01T00:00:00Z');
        const expired = bundleOf('SYN-SNAP-X', '2026-11-18T00:00:00Z', '2026-11-19T00:00:00Z');
        const newer = bundleOf('SYN-SNAP-1', '2026-11-10T00:00:00Z');
        const result = selectReleaseSnapshot({ primary: bundleOf('SYN-SNAP-2'), fallbacks: [older, expired, newer], now: NOW, revokedSnapshotIds: ['SYN-SNAP-2'] });
        expect(result.status).toBe('READY');
        expect(result.snapshotId).toBe('SYN-SNAP-1');
        expect(result.usedFallback).toBe(true);
        expect(result.rejected).toEqual([
            { snapshotId: 'SYN-SNAP-2', reasons: ['SNAPSHOT_REVOKED'] },
            { snapshotId: 'SYN-SNAP-X', reasons: ['EXPIRED'] },
        ]);
    });

    it('유효한 대체본이 없으면 NEEDS_CONFIRMATION을 돌려주고 일부 자료만 골라 쓰지 않는다', () => {
        const revokeAll = [{ target: /** @type {const} */ ({ kind: 'NOTICE', documentId: 'N1' }), reason: '가상 사용권 회수', revokedAt: '2026-11-20T12:00:00Z' }];
        const result = selectReleaseSnapshot({ primary: bundleOf('SYN-SNAP-2'), fallbacks: [bundleOf('SYN-SNAP-1', '2026-11-10T00:00:00Z')], now: NOW, revocations: revokeAll });
        expect(result).toMatchObject({ status: 'NEEDS_CONFIRMATION', snapshotId: null, bundle: null });
        expect(result.rejected.map(r => r.reasons)).toEqual([['CONTAINS_REVOKED_ITEM'], ['CONTAINS_REVOKED_ITEM']]);
        expect(selectReleaseSnapshot({ primary: undefined, now: NOW }).status).toBe('NEEDS_CONFIRMATION');
    });
});
