// @ts-check
/** @typedef {z.infer<typeof SearchDomainSchema>} SearchDomain */
/** @typedef {z.infer<typeof SearchEvalSubsetSchema>} SearchEvalSubset */
/** @typedef {z.infer<typeof SearchEvalCaseSchema>} SearchEvalCase */
/** @typedef {z.input<typeof SearchEvalRunSchema>} SearchEvalRun */
/** @typedef {{ kind:'FAMILY_LEAK'|'EMPTY_HOLDOUT'|'DUPLICATE_CASE'|'MIXED_PROVENANCE'|'RELEVANT_SHARED_ACROSS_SPLITS'; detail:string; }} SplitIssue */
/** @typedef {{ cases:number; recallAt5:number|null; mrr:number|null; }} RetrievalMetrics */
/** @typedef {{ split:'TUNE'|'HOLDOUT'; provenance:SearchEvalCase['provenance']; caseCount:number; overall:RetrievalMetrics; bySubset:Partial<Record<SearchEvalSubset,RetrievalMetrics>>; byDomain:Partial<Record<SearchDomain,RetrievalMetrics>>; intent:{macroF1:number|null;perLabel:Partial<Record<SearchDomain,{precision:number;recall:number;f1:number;support:number}>>; confusion:Record<SearchDomain,Record<SearchDomain,number>>;}; noAnswerFalsePositiveRate:number|null; abstention:{precision:number|null;recall:number|null}; latency:{samples:number;p95Ms:number|null}; safetyViolationCount:number; missedCaseIds:string[]; }} SearchEvalReport */
/** @typedef {'PASS'|'FAIL'|'NOT_EVALUABLE'} GateCheckStatus */
/** @typedef {{ status:'RELEASE_PASS'|'RELEASE_BLOCKED'|'SYNTHETIC_ONLY'; checks:Record<'recallAt5'|'mrr'|'intentMacroF1'|'typoDrop'|'spacingDrop'|'p95Latency'|'safety'|'split'|'heldOut', {status:GateCheckStatus;value:number|null;target:number|null}>; }} SearchGateResult */
import { z } from 'zod';
/**
 * #40 통합 학업 검색 품질 게이트 — 평가셋 분할 규칙과 지표 계산 (순수 코어).
 *
 * 이 모듈은 측정 도구다. 여기서 계산한 수치는 입력 평가셋의 성격을 그대로 따른다.
 * 평가셋이 SYNTHETIC이면 게이트 결과는 항상 SYNTHETIC_ONLY이며 출시 PASS가 될 수 없다.
 * 사람이 검수한 골드셋(#41·#42, #27 이후)으로만 RELEASE 판정을 낼 수 있다.
 *
 * 분할 원칙(§4.6): 튜닝/홀드아웃은 문서 계열(documentFamily) 단위로 나눈다.
 * 같은 문서 계열이 두 분할에 모두 나오면 누수(leak)로 보고하고 게이트를 막는다.
 */
const Id = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/);
export const SearchDomainSchema = z.enum(['NOTICE', 'COURSE', 'FAQ', 'UNKNOWN']);
export const SearchEvalSubsetSchema = z.enum([
    'PLAIN', 'SPACING', 'TYPO', 'ABBREVIATION', 'PARTICLE', 'AMBIGUOUS', 'MULTI', 'NEGATION', 'HOMONYM', 'OFF_TOPIC', 'UNANSWERABLE',
]);
export const SearchEvalCaseSchema = z.strictObject({
    caseId: Id,
    query: z.string().trim().min(1).max(500),
    /** 사람이 지정한 검색 분야. 학생 적용 대상 YES/NO/UNKNOWN 판정과는 별개다. */
    intent: SearchDomainSchema,
    subsets: z.array(SearchEvalSubsetSchema).min(1).max(6),
    /** 정답 근거 인용 ID 목록. 빈 배열은 '정답 없음 — 보류해야 함'이다. */
    relevant: z.array(z.string().min(1).max(200)).max(20),
    /** 분할 단위. 정답 근거가 속한 문서 계열(정답 없음 사례는 질의 계열). */
    documentFamily: Id,
    split: z.enum(['TUNE', 'HOLDOUT']),
    provenance: z.enum(['SYNTHETIC', 'HUMAN_REVIEWED']),
}).refine(c => new Set(c.relevant).size === c.relevant.length, 'duplicate relevant id')
    .refine(c => !c.subsets.includes('UNANSWERABLE') || c.relevant.length === 0, 'unanswerable case must have no relevant ids');
export const SearchEvalRunSchema = z.strictObject({
    caseId: Id,
    /** 검색기가 반환한 순위 목록(인용 ID). 보류했으면 빈 배열이어도 된다. */
    ranked: z.array(z.string().min(1).max(200)).max(50),
    predictedIntent: SearchDomainSchema,
    abstained: z.boolean(),
    latencyMs: z.number().nonnegative().max(600000),
    /** 고위험 안전 오류(미근거 마감 확정, 타 캠퍼스 YES, 철회 문단 노출 등). 사람이 판정해 기록한다. */
    safetyViolations: z.array(z.enum([
        'UNSUPPORTED_DEADLINE', 'WRONG_SCOPE_YES', 'REVOKED_EXPOSED', 'UNREVIEWED_COURSE_CONFIRMED',
    ])).max(4).default([]),
});
/** §4.6·#40 초기 출시 목표. 설계 요구이며 측정값이 아니다. */
export const SEARCH_GATE_TARGETS = /** @type {const} */ ({
    recallAt5: 0.90, mrr: 0.80, intentMacroF1: 0.90,
    /** 오타·띄어쓰기 하위집합 Recall@5가 PLAIN 대비 떨어져도 되는 최대 폭(5%p). */
    maxNoiseDrop: 0.05,
    p95LatencyMs: 300,
    safetyViolations: 0,
});
/** 문서 계열 ID를 결정적으로 TUNE/HOLDOUT에 배정한다. 같은 seed·계열이면 언제나 같은 결과다. */
/**
 * @param {string} documentFamily
 * @param {string} seed
 * @param {number} [holdoutRatio]
 * @returns {'TUNE'|'HOLDOUT'}
 */
export function assignFamilySplit(documentFamily, seed, holdoutRatio = 0.3) {
    if (!(holdoutRatio > 0 && holdoutRatio < 1))
        throw new RangeError('holdoutRatio must be in (0,1)');
    // FNV-1a 32비트. 무결성·보안 목적이 아니라 결정적 버킷 배정용이다.
    let h = 0x811c9dc5;
    for (const ch of new TextEncoder().encode(seed + '\u0000' + documentFamily)) {
        h ^= ch;
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    // FNV-1a만으로는 비슷한 ID의 상위 비트가 몰리므로 murmur3 fmix32로 섞는다.
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
    return (h >>> 0) / 0x100000000 < holdoutRatio ? 'HOLDOUT' : 'TUNE';
}
/** 평가셋의 분할 규칙 위반을 모두 찾는다. 빈 배열이면 분할 규칙을 지킨 것이다. */
/**
 * @param {readonly unknown[]} raw
 * @returns {SplitIssue[]}
 */
export function validateSearchEvalSplit(raw) {
    const cases = SearchEvalCaseSchema.array().max(20000).parse(raw);
    /** @type {SplitIssue[]} */
    const issues = [];
    /** @type {Set<string>} */
    const ids = new Set();
    for (const c of cases) {
        if (ids.has(c.caseId))
            issues.push({ kind: 'DUPLICATE_CASE', detail: c.caseId });
        ids.add(c.caseId);
    }
    /** @param {(c:SearchEvalCase)=>string[]} key */
    const splitsBy = (key) => {
        /** @type {Map<string, Set<string>>} */
        const m = new Map();
        for (const c of cases)
            for (const k of key(c)) {
                const s = m.get(k) ?? new Set();
                s.add(c.split);
                m.set(k, s);
            }
        return [...m].filter(([, s]) => s.size > 1).map(([k]) => k).sort();
    };
    for (const f of splitsBy(c => [c.documentFamily]))
        issues.push({ kind: 'FAMILY_LEAK', detail: f });
    // 계열 표기가 달라도 같은 정답 근거가 양쪽에 있으면 누수다.
    for (const r of splitsBy(c => c.relevant))
        issues.push({ kind: 'RELEVANT_SHARED_ACROSS_SPLITS', detail: r });
    if (cases.length && !cases.some(c => c.split === 'HOLDOUT'))
        issues.push({ kind: 'EMPTY_HOLDOUT', detail: 'no HOLDOUT case' });
    if (new Set(cases.map(c => c.provenance)).size > 1)
        issues.push({ kind: 'MIXED_PROVENANCE', detail: 'SYNTHETIC and HUMAN_REVIEWED mixed' });
    return issues;
}
const DOMAINS = SearchDomainSchema.options;
/** @param {number} x */
const round = (x) => Math.round(x * 1e6) / 1e6;
/** @param {number[]} xs */
const mean = (xs) => xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
/** 최근접 순위 방식 p95(정렬 후 ceil(0.95n)번째). 보간하지 않아 작은 표본에서 과소평가하지 않는다. */
/**
 * @param {readonly number[]} values
 * @param {number} p
 * @returns {number|null}
 */
export function percentileNearestRank(values, p) {
    if (!values.length)
        return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}
/**
 * @param {{c:SearchEvalCase;r:z.output<typeof SearchEvalRunSchema>}[]} rows
 * @returns {RetrievalMetrics}
 */
function retrieval(rows) {
    const answerable = rows.filter(x => x.c.relevant.length > 0);
    const recall = answerable.map(({ c, r }) => {
        const top = new Set(r.abstained ? [] : r.ranked.slice(0, 5));
        return c.relevant.filter(id => top.has(id)).length / c.relevant.length;
    });
    const rr = answerable.map(({ c, r }) => {
        if (r.abstained)
            return 0;
        const rel = new Set(c.relevant);
        const i = r.ranked.findIndex(id => rel.has(id));
        return i < 0 ? 0 : 1 / (i + 1);
    });
    return { cases: answerable.length, recallAt5: mean(recall), mrr: mean(rr) };
}
/**
 * 한 분할(기본 HOLDOUT)의 사례와 실행 결과로 지표를 계산한다.
 * 실행 결과가 없는 사례, 평가셋에 없는 실행 결과, 중복 실행은 측정 오류로 던진다(조용히 빼지 않는다).
 */
/**
 * @param {readonly unknown[]} rawCases
 * @param {readonly unknown[]} rawRuns
 * @param {'TUNE'|'HOLDOUT'} [split]
 * @returns {SearchEvalReport}
 */
export function evaluateSearchRun(rawCases, rawRuns, split = 'HOLDOUT') {
    const all = SearchEvalCaseSchema.array().max(20000).parse(rawCases);
    const provenances = new Set(all.map(c => c.provenance));
    if (provenances.size > 1)
        throw new RangeError('Mixed evaluation provenance');
    const cases = all.filter(c => c.split === split);
    if (!cases.length)
        throw new RangeError('No cases in split ' + split);
    const runs = SearchEvalRunSchema.array().max(20000).parse(rawRuns);
    /** @type {Map<string, z.output<typeof SearchEvalRunSchema>>} */
    const runBy = new Map();
    for (const r of runs) {
        if (runBy.has(r.caseId))
            throw new RangeError('Duplicate run for case ' + r.caseId);
        runBy.set(r.caseId, r);
    }
    const allIds = new Set(all.map(c => c.caseId));
    for (const id of runBy.keys())
        if (!allIds.has(id))
            throw new RangeError('Run for unknown case ' + id);
    const rows = cases.map(c => {
        const r = runBy.get(c.caseId);
        if (!r)
            throw new RangeError('Missing run for case ' + c.caseId);
        return { c, r };
    });
    /** @type {SearchEvalReport['bySubset']} */
    const bySubset = {};
    for (const s of SearchEvalSubsetSchema.options) {
        const sub = rows.filter(x => x.c.subsets.includes(s));
        if (sub.length)
            bySubset[s] = retrieval(sub);
    }
    /** @type {SearchEvalReport['byDomain']} */
    const byDomain = {};
    for (const d of DOMAINS) {
        const sub = rows.filter(x => x.c.intent === d);
        if (sub.length)
            byDomain[d] = retrieval(sub);
    }
    const confusion = /** @type {Record<SearchDomain,Record<SearchDomain,number>>} */ (Object.fromEntries(DOMAINS.map(t => [t, Object.fromEntries(DOMAINS.map(p => [p, 0]))])));
    for (const { c, r } of rows)
        confusion[c.intent][r.predictedIntent]++;
    /** @type {SearchEvalReport['intent']['perLabel']} */
    const perLabel = {};
    /** @type {number[]} */
    const f1s = [];
    // 정답 또는 예측에 한 번이라도 등장한 분야만 macro 평균에 넣는다.
    for (const d of DOMAINS) {
        const tp = confusion[d][d];
        const support = DOMAINS.reduce((n, p) => n + confusion[d][p], 0);
        const predicted = DOMAINS.reduce((n, t) => n + confusion[t][d], 0);
        if (!support && !predicted)
            continue;
        const precision = predicted ? tp / predicted : 0, recall = support ? tp / support : 0;
        const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
        perLabel[d] = { precision: round(precision), recall: round(recall), f1: round(f1), support };
        f1s.push(f1);
    }
    const noAnswer = rows.filter(x => x.c.relevant.length === 0);
    const abstainedRows = rows.filter(x => x.r.abstained);
    const correctAbstain = abstainedRows.filter(x => x.c.relevant.length === 0).length;
    const latencies = rows.map(x => x.r.latencyMs);
    return {
        split, provenance: cases[0].provenance, caseCount: rows.length,
        overall: retrieval(rows), bySubset, byDomain,
        intent: { macroF1: mean(f1s), perLabel, confusion },
        noAnswerFalsePositiveRate: noAnswer.length ? round(noAnswer.filter(x => !x.r.abstained).length / noAnswer.length) : null,
        abstention: {
            precision: abstainedRows.length ? round(correctAbstain / abstainedRows.length) : null,
            recall: noAnswer.length ? round(correctAbstain / noAnswer.length) : null,
        },
        latency: { samples: latencies.length, p95Ms: percentileNearestRank(latencies, 0.95) },
        safetyViolationCount: rows.reduce((n, x) => n + x.r.safetyViolations.length, 0),
        missedCaseIds: rows.filter(({ c, r }) => c.relevant.length > 0
            && (r.abstained || !r.ranked.slice(0, 5).some(id => c.relevant.includes(id)))).map(x => x.c.caseId).sort(),
    };
}
/**
 * @param {SearchEvalReport} report
 * @param {readonly SplitIssue[]} splitIssues
 * @returns {SearchGateResult}
 */
export function checkSearchGate(report, splitIssues) {
    const T = SEARCH_GATE_TARGETS;
    /** @param {number|null} v @param {number} t */
    const atLeast = (v, t) => ({ status: /** @type {GateCheckStatus} */ ((v === null ? 'NOT_EVALUABLE' : v >= t ? 'PASS' : 'FAIL')), value: v, target: t });
    /** @param {number|null} v @param {number} t */
    const atMost = (v, t) => ({ status: /** @type {GateCheckStatus} */ ((v === null ? 'NOT_EVALUABLE' : v <= t ? 'PASS' : 'FAIL')), value: v, target: t });
    const plain = report.bySubset.PLAIN?.recallAt5 ?? null;
    /** @param {SearchEvalSubset} s */
    const drop = (s) => {
        const v = report.bySubset[s]?.recallAt5 ?? null;
        return plain === null || v === null ? null : round(plain - v);
    };
    /** @type {SearchGateResult['checks']} */
    const checks = {
        recallAt5: atLeast(report.overall.recallAt5, T.recallAt5),
        mrr: atLeast(report.overall.mrr, T.mrr),
        intentMacroF1: atLeast(report.intent.macroF1, T.intentMacroF1),
        typoDrop: atMost(drop('TYPO'), T.maxNoiseDrop),
        spacingDrop: atMost(drop('SPACING'), T.maxNoiseDrop),
        p95Latency: atMost(report.latency.p95Ms, T.p95LatencyMs),
        safety: atMost(report.safetyViolationCount, T.safetyViolations),
        split: { status: splitIssues.length ? 'FAIL' : 'PASS', value: splitIssues.length, target: 0 },
        heldOut: { status: report.split === 'HOLDOUT' ? 'PASS' : 'FAIL', value: null, target: null },
    };
    if (report.provenance === 'SYNTHETIC')
        return { status: 'SYNTHETIC_ONLY', checks };
    const ok = Object.values(checks).every(c => c.status === 'PASS');
    return { status: ok ? 'RELEASE_PASS' : 'RELEASE_BLOCKED', checks };
}
