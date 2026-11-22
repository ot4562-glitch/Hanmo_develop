// @ts-check
/** @typedef {import("../../contracts/release/index.js").ReleaseBundle} ReleaseBundle */
/** @typedef {import("../../contracts/release/index.js").RevocationRecord} RevocationRecord */
/** @typedef {import("../../contracts/release/index.js").ReviewTarget} ReviewTarget */
/**
 * 배포 스냅샷 거부 사유.
 * @typedef {'INVALID_BUNDLE'|'EMPTY_MANIFEST'|'MANIFEST_HASH_MISMATCH'|'NOT_YET_VALID'|'EXPIRED'|'SNAPSHOT_REVOKED'|'CONTAINS_REVOKED_ITEM'|'PROVENANCE_MISMATCH'|'NOTICES_SNAPSHOT_MISMATCH'|'FORECAST_SNAPSHOT_MISMATCH'|'FAQ_INDEX_SNAPSHOT_MISMATCH'|'FAQ_INDEX_REVISION_MISMATCH'} ReleaseRejection
 */
/** 통과하면 ok가 true이고 reasons는 빈 배열이다. */
/** @typedef {{ ok:boolean; snapshotId:string|null; reasons:ReleaseRejection[] }} ReleaseVerification */
/**
 * @typedef {{ status:'READY'; snapshotId:string; usedFallback:boolean; bundle:ReleaseBundle; rejected:{snapshotId:string|null; reasons:ReleaseRejection[]}[] }
 *   | { status:'NEEDS_CONFIRMATION'; snapshotId:null; usedFallback:false; bundle:null; rejected:{snapshotId:string|null; reasons:ReleaseRejection[]}[] }} ReleaseSelection
 */
/**
 * @typedef {{ now:string; provenance?:'SYNTHETIC'|'REAL_APPROVED'; revokedSnapshotIds?:readonly string[]; revocations?:readonly RevocationRecord[] }} ReleaseCheckOptions
 */
import { ReleaseBundleSchema, RevocationRecordSchema } from '../../contracts/release/index.js';
import { releaseManifestSha256, revocationCovers } from './snapshot-builder.js';

/**
 * 배포 묶음 하나를 검증한다. 공지·전망·FAQ 인덱스가 같은 스냅샷 ID와 인덱스 판본을 참조해야 하며,
 * 승인 자료가 없는 빈 매니페스트, 해시 불일치·유효기간 밖·스냅샷 철회·포함 판본 철회가 하나라도 있으면 거부한다.
 * now는 호출자가 넘기며 이 함수는 시계를 읽지 않는다.
 * @param {unknown} rawBundle
 * @param {ReleaseCheckOptions} options
 * @returns {ReleaseVerification}
 */
export function verifyReleaseBundle(rawBundle, options) {
    const now = Date.parse(options.now);
    if (!Number.isFinite(now))
        throw new RangeError('Invalid now');
    const revocations = RevocationRecordSchema.array().parse(options.revocations ?? []);
    const parsed = ReleaseBundleSchema.safeParse(rawBundle);
    if (!parsed.success) {
        const id = /** @type {any} */ (rawBundle)?.manifest?.snapshotId;
        return { ok: false, snapshotId: typeof id === 'string' ? id : null, reasons: ['INVALID_BUNDLE'] };
    }
    const { manifest, manifestSha256, consumers } = parsed.data;
    /** @type {ReleaseRejection[]} */
    const reasons = [];
    if (releaseManifestSha256(manifest) !== manifestSha256)
        reasons.push('MANIFEST_HASH_MISMATCH');
    // 승인 자료가 하나도 없는 스냅샷은 '자료 없음'을 확정하는 근거가 아니므로 대체본으로도 쓰지 않는다.
    if (!manifest.documents.length && !manifest.offerings.length)
        reasons.push('EMPTY_MANIFEST');
    if (Date.parse(manifest.builtAt) > now)
        reasons.push('NOT_YET_VALID');
    if (Date.parse(manifest.validUntil) <= now)
        reasons.push('EXPIRED');
    if ((options.revokedSnapshotIds ?? []).includes(manifest.snapshotId))
        reasons.push('SNAPSHOT_REVOKED');
    if (options.provenance && manifest.provenance !== options.provenance)
        reasons.push('PROVENANCE_MISMATCH');
    // 구판을 대체본으로 쓸 때도 빌드 이후에 생긴 철회를 다시 대조한다.
    /** @type {ReviewTarget[]} */
    const targets = [
        ...manifest.documents.map(d => /** @type {ReviewTarget} */ ({ kind: d.kind, documentId: d.documentId, revisionId: d.revisionId })),
        ...manifest.offerings.map(o => /** @type {ReviewTarget} */ ({ kind: 'OFFERING', courseId: o.courseId, campus: o.campus, term: o.term, sourceRef: o.sourceRef })),
    ];
    const live = revocations.filter(r => Date.parse(r.revokedAt) <= now);
    if (targets.some(t => live.some(r => revocationCovers(r.target, t))))
        reasons.push('CONTAINS_REVOKED_ITEM');
    if (consumers.notices.snapshotId !== manifest.snapshotId)
        reasons.push('NOTICES_SNAPSHOT_MISMATCH');
    if (consumers.forecast.snapshotId !== manifest.snapshotId)
        reasons.push('FORECAST_SNAPSHOT_MISMATCH');
    if (consumers.faqIndex.snapshotId !== manifest.snapshotId)
        reasons.push('FAQ_INDEX_SNAPSHOT_MISMATCH');
    if (consumers.faqIndex.indexRevision !== manifest.indexRevision)
        reasons.push('FAQ_INDEX_REVISION_MISMATCH');
    return { ok: reasons.length === 0, snapshotId: manifest.snapshotId, reasons };
}

/**
 * 기본 배포 묶음을 먼저 검사하고, 거부되면 대체 묶음을 빌드 시각이 최신인 순서로 검사한다.
 * 유효한 묶음이 없으면 NEEDS_CONFIRMATION을 돌려주며 학생 화면은 '확인 필요'로 표시해야 한다.
 * 거부된 묶음의 일부만 골라 쓰지 않는다.
 * @param {{ primary:unknown; fallbacks?:readonly unknown[] } & ReleaseCheckOptions} input
 * @returns {ReleaseSelection}
 */
export function selectReleaseSnapshot(input) {
    const { primary, fallbacks = [], ...options } = input;
    /** @type {{snapshotId:string|null; reasons:ReleaseRejection[]}[]} */
    const rejected = [];
    const builtAt = (/** @type {unknown} */ b) => {
        const t = Date.parse(/** @type {any} */ (b)?.manifest?.builtAt);
        return Number.isFinite(t) ? t : -Infinity;
    };
    const snapshotIdOf = (/** @type {unknown} */ b) => String(/** @type {any} */ (b)?.manifest?.snapshotId ?? '');
    const ordered = [...fallbacks].sort((a, b) => builtAt(b) - builtAt(a) || (snapshotIdOf(a) < snapshotIdOf(b) ? -1 : snapshotIdOf(a) > snapshotIdOf(b) ? 1 : 0));
    for (const [index, candidate] of [primary, ...ordered].entries()) {
        const check = verifyReleaseBundle(candidate, options);
        if (check.ok) {
            return { status: 'READY', snapshotId: /** @type {string} */ (check.snapshotId), usedFallback: index > 0, bundle: ReleaseBundleSchema.parse(candidate), rejected };
        }
        rejected.push({ snapshotId: check.snapshotId, reasons: check.reasons });
    }
    return { status: 'NEEDS_CONFIRMATION', snapshotId: null, usedFallback: false, bundle: null, rejected };
}
