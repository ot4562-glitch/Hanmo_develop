import type {z} from 'zod';
import {
  AcademicRulePackVNextSchema,
  MajorRoleVNextSchema,
  stableAcademicRequirementIdsVNext,
  verifyAcademicSourceCoverageVNext,
  type AcademicClauseVNext,
  type AcademicRulePackVNext,
} from '../../contracts/index.js';
import {AS_OF, ID, assertId, byCodeUnit} from './ledger.js';

/**
 * RulePack 활성화 검사(A08.6, RULE-EXC-01~04).
 * APPROVED 후보이고 asOf 기준 유효기간 내이며 차단 경고가 없고 독립적인 원문 조항·예외·역할별 적용 목록과 일치할 때만 기존 규칙집을 대체한다.
 * 숫자가 일치해도 조항 누락을 정당화할 수 없다. 실패 시 기존 객체를 그대로 유지한다.
 * 독립 목록의 정확성이나 졸업 여부를 판단하는 기능은 아니다. 시계·네트워크·저장소·모델에 의존하지 않는다.
 */

export type MajorRole = z.infer<typeof MajorRoleVNextSchema>;
type ContractBlockingCode = NonNullable<AcademicRulePackVNext['validationReport']>['blockingIssues'][number]['code'];

export type RulePackGateCode =
  | ContractBlockingCode
  | 'INVALID_PACK'
  | 'NOT_APPROVED'
  | 'NOT_APPROVED_BY_AS_OF'
  | 'NOT_YET_EFFECTIVE'
  | 'EXPIRED'
  | 'VERSION_ALREADY_ACTIVE'
  | 'SUPERSEDE_CHAIN_BROKEN';

export interface RulePackGateIssue {
  code:RulePackGateCode;
  sourceClauseId?:string;
}

/** 독립 검토자가 공식 원본에서 확인한 조항 하나다. */
export interface TrustedSourceClause {
  clauseId:string;
  kind:AcademicClauseVNext['kind'];
  sourceSpanRef:string;
  sourceDocumentId?:string;
  /** 이 조항이 적용되는 의미상 요건 키 목록이다. EXCEPTION은 영향을 주는 모든 요건의 exceptionClauseIds에도 포함되어야 한다. */
  appliesToSemanticKeys?:readonly string[];
  /** 원문에 명시된 적용·비적용 대상 역할이다. 어느 쪽에도 속하지 않으면 적용 여부를 알 수 없다. */
  includedMajorRoles?:readonly MajorRole[];
  excludedMajorRoles?:readonly MajorRole[];
}

export interface TrustedSourceInventory {
  sourceDocumentSha256:string;
  sourceDocuments?:readonly {documentId:string;sourceDocumentSha256:string}[];
  clauses:readonly TrustedSourceClause[];
}

export interface RulePackActivationRequest {
  asOf:string;
  /** 현재 적용 중인 규칙집 또는 null이다. 후보가 검사를 통과하지 못하면 그대로 반환한다. */
  active:AcademicRulePackVNext|null;
  /** 스키마 파싱 전에는 신뢰할 수 없는 입력이다. */
  candidate:unknown;
  trustedOriginal:TrustedSourceInventory;
  /** 숫자가 정확히 일치해도 다른 경고나 불일치를 무시하지 않는다. */
  numericCheck?:{matched:number; total:number};
}

export interface RulePackActivationResult {
  decision:'ACTIVATED'|'HELD';
  /** 이번 판정이 끝난 뒤 적용되는 규칙집이다. */
  active:AcademicRulePackVNext|null;
  candidateVersion?:string;
  issues:RulePackGateIssue[];
}

const MAX_CLAUSES = 500;
const SHA256 = /^[a-f0-9]{64}$/;

const BLOCKING_CODES:ReadonlySet<string> = new Set<ContractBlockingCode>([
  'NUMERIC_SOURCE_MISMATCH', 'CLAUSE_MISSING', 'EXCEPTION_SCOPE_CONFLICT',
  'SOURCE_CONTRADICTION', 'PROMPT_INJECTION', 'UNVERIFIED_ORIGINAL',
  'UNKNOWN_APPLICABILITY', 'OTHER',
]);

function record(value:unknown):Record<string, unknown>|undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** 후보 자체의 경고를 스키마 검증 전에 확인해 후보가 잘못돼도 보류 이유를 기록한다. 해석 불가 경고는 OTHER로 유지한다. */
function reportedIssues(candidate:unknown):{version?:string; issues:RulePackGateIssue[]} {
  const body = record(candidate);
  const version = typeof body?.version === 'string' && ID.test(body.version) ? body.version : undefined;
  const list = record(body?.validationReport)?.blockingIssues;
  const issues:RulePackGateIssue[] = [];
  if (Array.isArray(list)) {
    for (const item of list.slice(0, 200)) {
      const row = record(item);
      const code = typeof row?.code === 'string' && BLOCKING_CODES.has(row.code) ? row.code as ContractBlockingCode : 'OTHER';
      const clauseId = row?.sourceClauseId;
      issues.push(typeof clauseId === 'string' && ID.test(clauseId) ? {code, sourceClauseId:clauseId} : {code});
    }
  }
  return version === undefined ? {issues} : {version, issues};
}

function roles(list:readonly MajorRole[]|undefined, label:string):Set<MajorRole> {
  const set = new Set<MajorRole>();
  for (const role of list ?? []) {
    if (!MajorRoleVNextSchema.safeParse(role).success) throw new TypeError(`${label} has no major role`);
    if (set.has(role)) throw new TypeError(`${label} repeats ${role}`);
    set.add(role);
  }
  return set;
}

interface Trusted {
  clause:TrustedSourceClause;
  included:Set<MajorRole>;
  excluded:Set<MajorRole>;
  keys:string[];
}

function readTrusted(original:TrustedSourceInventory):Map<string, Trusted> {
  if (!SHA256.test(original.sourceDocumentSha256)) throw new TypeError('trusted sourceDocumentSha256 must be sha-256 hex');
  if (!Array.isArray(original.clauses) || original.clauses.length === 0 || original.clauses.length > MAX_CLAUSES) {
    throw new RangeError(`trusted inventory needs 1 to ${MAX_CLAUSES} clauses`);
  }
  if (original.sourceDocuments) {
    if (original.sourceDocuments.length < 1 || original.sourceDocuments.length > 10
      || new Set(original.sourceDocuments.map(d => d.documentId)).size !== original.sourceDocuments.length)
      throw new TypeError('trusted inventory requires 1 to 10 distinct source documents');
    for (const document of original.sourceDocuments) {
      assertId(document.documentId, 'trusted documentId');
      if (!SHA256.test(document.sourceDocumentSha256)) throw new TypeError('trusted document hash must be sha-256 hex');
    }
  }
  const byId = new Map<string, Trusted>();
  for (const clause of original.clauses) {
    assertId(clause.clauseId, 'trusted clauseId');
    assertId(clause.sourceSpanRef, `${clause.clauseId} sourceSpanRef`);
    if (byId.has(clause.clauseId)) throw new TypeError(`trusted inventory repeats ${clause.clauseId}`);
    const included = roles(clause.includedMajorRoles, `${clause.clauseId} includedMajorRoles`);
    const excluded = roles(clause.excludedMajorRoles, `${clause.clauseId} excludedMajorRoles`);
    for (const role of included) {
      if (excluded.has(role)) throw new TypeError(`${clause.clauseId} both includes and excludes ${role}`);
    }
    const keys = [...new Set<string>(clause.appliesToSemanticKeys ?? [])];
    if (keys.length !== (clause.appliesToSemanticKeys ?? []).length) {
      throw new TypeError(`${clause.clauseId} repeats a semantic key`);
    }
    for (const key of keys) assertId(key, `${clause.clauseId} semantic key`);
    byId.set(clause.clauseId, {clause, included, excluded, keys});
  }
  return byId;
}

/** RULE-EXC-01: 모든 원문 조항의 종류와 출처 위치를 목록화하고 없는 조항을 만들지 않는다. */
function checkInventory(pack:AcademicRulePackVNext, trusted:ReadonlyMap<string, Trusted>, issues:RulePackGateIssue[]):void {
  const supplied = new Map(pack.clauseInventory.map(clause => [clause.clauseId, clause]));
  for (const [clauseId, {clause}] of trusted) {
    const found = supplied.get(clauseId);
    if (!found || found.kind !== clause.kind || found.sourceSpanRef !== clause.sourceSpanRef
      || found.sourceDocumentId !== clause.sourceDocumentId) {
      issues.push({code:'CLAUSE_MISSING', sourceClauseId:clauseId});
    }
  }
  for (const clauseId of supplied.keys()) {
    if (!trusted.has(clauseId)) issues.push({code:'UNVERIFIED_ORIGINAL', sourceClauseId:clauseId});
  }
}

function suppliedClause(pack:AcademicRulePackVNext, clauseId:string):AcademicClauseVNext|undefined {
  return pack.clauseInventory.find(clause => clause.clauseId === clauseId);
}

/** RULE-EXC-02: 포함 대상에는 적용하고 제외 대상에는 적용하지 않는다. RULE-EXC-03: 적용 예외는 해당 요건 모두와 연결한다. */
function checkApplicability(pack:AcademicRulePackVNext, trusted:ReadonlyMap<string, Trusted>, issues:RulePackGateIssue[]):void {
  const role = pack.scope.majorRole;
  const bySemanticKey = new Map(pack.requirements.map(requirement => [requirement.semanticKey, requirement]));
  for (const [clauseId, {clause, included, excluded, keys}] of trusted) {
    const supplied = suppliedClause(pack, clauseId);
    // 후보에서 누락한 조항은 CLAUSE_MISSING으로 이미 보고한다.
    if (!supplied) continue;
    const roleScoped = included.size > 0 || excluded.size > 0;
    const linked = supplied.coverage.state === 'LINKED';
    if (roleScoped && excluded.has(role)) {
      if (linked) issues.push({code:'EXCEPTION_SCOPE_CONFLICT', sourceClauseId:clauseId});
      continue;
    }
    if (roleScoped && !included.has(role)) {
      issues.push({code:'UNKNOWN_APPLICABILITY', sourceClauseId:clauseId});
      continue;
    }
    if (roleScoped && !linked) {
      issues.push({code:'EXCEPTION_SCOPE_CONFLICT', sourceClauseId:clauseId});
      continue;
    }
    if (clause.kind !== 'EXCEPTION') continue;
    for (const key of keys) {
      const requirement = bySemanticKey.get(key);
      if (!requirement || !requirement.exceptionClauseIds.includes(clauseId)) {
        issues.push({code:'CLAUSE_MISSING', sourceClauseId:clauseId});
        break;
      }
    }
  }
}

function sameScope(a:AcademicRulePackVNext['scope'], b:AcademicRulePackVNext['scope']):boolean {
  return a.campus === b.campus && a.primaryMajor === b.primaryMajor
    && a.secondaryMajor === b.secondaryMajor && a.majorRole === b.majorRole
    && a.admissionType === b.admissionType && a.curriculumVersion === b.curriculumVersion
    && a.cohortFrom === b.cohortFrom && a.cohortTo === b.cohortTo
    && a.degreePath === b.degreePath && a.track === b.track;
}

function finish(
  active:AcademicRulePackVNext|null,
  issues:RulePackGateIssue[],
  candidate?:AcademicRulePackVNext,
  candidateVersion?:string,
):RulePackActivationResult {
  const seen = new Set<string>();
  const unique = issues.filter(issue => {
    const key = `${issue.code}\u0000${issue.sourceClauseId ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => byCodeUnit(a.code, b.code) || byCodeUnit(a.sourceClauseId ?? '', b.sourceClauseId ?? ''));
  const result:RulePackActivationResult = unique.length === 0 && candidate
    ? {decision:'ACTIVATED', active:candidate, issues:[]}
    : {decision:'HELD', active, issues:unique};
  if (candidateVersion !== undefined) result.candidateVersion = candidateVersion;
  return result;
}

/** 후보가 활성 규칙집을 대체할 수 있는지 결정한다. HELD이면 원래 active 객체를 덮어쓰지 않고 그대로 돌려준다. */
export function decideRulePackActivation(input:RulePackActivationRequest):RulePackActivationResult {
  if (!AS_OF.test(input.asOf) || !Number.isFinite(Date.parse(input.asOf))) {
    throw new TypeError('asOf must be an ISO-8601 datetime with a timezone offset');
  }
  const asOfMs = Date.parse(input.asOf);
  const trusted = readTrusted(input.trustedOriginal);
  const active = input.active;
  if (active !== null && !AcademicRulePackVNextSchema.safeParse(active).success) {
    throw new TypeError('active pack is not a valid rule pack');
  }
  if (active !== null && active.state !== 'APPROVED') throw new TypeError('active pack must be APPROVED');

  const issues:RulePackGateIssue[] = [];
  if (input.numericCheck !== undefined) {
    const {matched, total} = input.numericCheck;
    if (!Number.isSafeInteger(matched) || !Number.isSafeInteger(total) || matched < 0 || total < 0 || matched > total) {
      throw new TypeError('numericCheck must be whole counts with matched <= total');
    }
    if (matched < total) issues.push({code:'NUMERIC_SOURCE_MISMATCH'});
  }

  const reported = reportedIssues(input.candidate);
  const candidateVersion = reported.version;
  issues.push(...reported.issues);

  const parsed = AcademicRulePackVNextSchema.safeParse(input.candidate);
  if (!parsed.success) {
    issues.push({code:'INVALID_PACK'});
    return finish(active, issues, undefined, candidateVersion);
  }
  const pack = parsed.data;
  if (pack.state !== 'APPROVED' || !pack.approvedAt) issues.push({code:'NOT_APPROVED'});
  else if (Date.parse(pack.approvedAt) > asOfMs || Date.parse(pack.sourcePublishedAt) > asOfMs
    || (pack.validationReport && Date.parse(pack.validationReport.checkedAt) > asOfMs)) {
    issues.push({code:'NOT_APPROVED_BY_AS_OF'});
  }
  // selectAcademicRulePackAsOfVNext와 동일하게 시작 포함·종료 미포함 유효기간(effectiveFrom ≤ asOf < effectiveUntil)을 적용한다.
  if (Date.parse(pack.effectiveFrom) > asOfMs) issues.push({code:'NOT_YET_EFFECTIVE'});
  if (pack.effectiveUntil !== undefined && Date.parse(pack.effectiveUntil) <= asOfMs) issues.push({code:'EXPIRED'});

  if (pack.sourceDocumentSha256 !== input.trustedOriginal.sourceDocumentSha256
    || (pack.sourceDocuments !== undefined || input.trustedOriginal.sourceDocuments !== undefined)
      && !verifyAcademicSourceCoverageVNext(pack, input.trustedOriginal)) {
    issues.push({code:'UNVERIFIED_ORIGINAL'});
  } else {
    checkInventory(pack, trusted, issues);
    checkApplicability(pack, trusted, issues);
  }

  if (active !== null) {
    if (!sameScope(active.scope, pack.scope)) throw new TypeError('candidate and active packs cover different scopes');
    if (pack.version === active.version) issues.push({code:'VERSION_ALREADY_ACTIVE'});
    else if (!stableAcademicRequirementIdsVNext(active, pack)) issues.push({code:'SUPERSEDE_CHAIN_BROKEN'});
  } else if (pack.supersedesVersion !== undefined) {
    issues.push({code:'SUPERSEDE_CHAIN_BROKEN'});
  }

  return finish(active, issues, pack, pack.version);
}
