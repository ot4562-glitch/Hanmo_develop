import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {buildAcademicLedger, type AcademicLedgerRequest, type LedgerAttempt, type LedgerRequirement, type RulePackGate} from './ledger.js';

/**
 * buildAcademicLedger의 재현 가능한 속성 테스트(#202)다. SYN-* 합성 데이터만 사용하며 실학생 성적표나 학교 규정을 생성·추정하지 않는다.
 * 기대값은 테스트 대상 함수를 다시 호출해 만들지 않는다. 작은 사례는 문서화된 규칙으로 별도 구현한 referenceLedger와, 큰 사례는 규칙에서 도출되는 관계와 비교한다.
 * 실패 시 시드·축소 사례·규칙 해시·코어 소스 해시를 출력한다.
 * 한 시드 재현: LEDGER_PROP_SEED=<seed> npx vitest run packages/core/src/academics/ledger.property.test.ts
 * 대량 탐색: LEDGER_PROP_RUNS=2000 npx vitest run packages/core/src/academics/ledger.property.test.ts
 * R1 EARNED는 학기가 asOf(한국시간)까지 종료됐을 때만 인정한다.
 * R2 승인된 올바른 재수강 연결만 이전 기록을 제외하며 순환·잘못된 연결은 보류한다.
 * R3 과목당 최고 우선순위(EARNED→IN_PROGRESS→PLANNED) 기록 하나만 세며 같은 우선순위 충돌은 보류한다.
 * R4 PENDING은 조건에 따라 인정 대기·중복·보류, EXCLUDED는 공식 제외다.
 * R5 총학점은 과목당 한 번만, 영역은 승인된 각 영역에 배정한다.
 * R6 요건은 취득 학점과 승인 규칙으로 판정하며 미수집 GPA는 NOT_CHECKED다.
 * R7 규칙집 미존재는 INSUFFICIENT_DATA, 미승인이나 보류 항목이 있으면 NEEDS_REVIEW다.
 */

// 고정 시드 사례 생성기(mulberry32): 같은 시드는 모든 환경에서 같은 사례를 만든다.

type Rng = () => number;
function mulberry32(seed:number):Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(rng:Rng, list:readonly T[]):T => list[Math.floor(rng() * list.length)]!;
const chance = (rng:Rng, p:number) => rng() < p;

const TERMS = ['2023-1', '2023-2', '2024-1', '2024-W', '2024-2', '2025-1', '2025-S', '2025-2', '2026-1'] as const;
const AS_OF = ['2024-07-02T00:00:00+09:00', '2025-03-01T09:00:00+09:00', '2026-01-01T00:00:00+09:00', '2026-12-20T12:00:00+09:00'] as const;
const COURSES = ['SYN-C1', 'SYN-C2', 'SYN-C3', 'SYN-C4', 'SYN-C5'] as const;
const AREAS = ['SYN-A1', 'SYN-A2', 'SYN-A3'] as const;
const STATES:readonly RulePackGate[] = ['APPROVED', 'APPROVED', 'APPROVED', 'DRAFT', 'NEEDS_REVIEW', 'MISSING'];

export interface Case extends AcademicLedgerRequest {
  attempts:LedgerAttempt[];
  requirements:LedgerRequirement[];
}

function genCase(rng:Rng, size:number):Case {
  const attempts:LedgerAttempt[] = [];
  const count = Math.floor(rng() * (size + 1));
  for (let i = 0; i < count; i++) {
    const ledger = pick(rng, ['EARNED', 'EARNED', 'EARNED', 'IN_PROGRESS', 'PLANNED'] as const);
    const areaIds = AREAS.filter(() => chance(rng, 0.35));
    const attempt:LedgerAttempt = {
      attemptToken:`SYN-T${i}`, canonicalCourseId:pick(rng, COURSES), creditUnits:pick(rng, [0, 1, 2, 4, 6, 6, 6]),
      ledger, areaIds, recognition:pick(rng, ['RECOGNIZED', 'RECOGNIZED', 'RECOGNIZED', 'PENDING', 'EXCLUDED'] as const),
    };
    if (ledger === 'EARNED' ? chance(rng, 0.93) : chance(rng, 0.4)) attempt.term = pick(rng, TERMS);
    attempts.push(attempt);
  }
  // 재수강 연결은 정상 승인 사례를 주로 생성하되 승인 누락·순서 오류·분기·순환도 포함한다.
  for (const attempt of attempts) {
    if (attempts.length < 2 || !chance(rng, 0.3)) continue;
    const target = pick(rng, attempts);
    if (target === attempt && !chance(rng, 0.2)) continue;
    attempt.supersedesAttemptToken = target.attemptToken;
    if (target !== attempt && chance(rng, 0.5)) {
      // 올바른 승인 재수강은 같은 과목을 두 번 취득·인정했고 새 기록의 학기가 더 늦다.
      const first = Math.floor(rng() * (TERMS.length - 1));
      const later = first + 1 + Math.floor(rng() * (TERMS.length - first - 1));
      Object.assign(target, {ledger:'EARNED', term:TERMS[first]});
      Object.assign(attempt, {ledger:'EARNED', recognition:'RECOGNIZED', canonicalCourseId:target.canonicalCourseId,
        term:TERMS[later], retakeApprovalRef:`SYN-RETAKE-${attempt.attemptToken}`});
      continue;
    }
    if (chance(rng, 0.7)) attempt.retakeApprovalRef = `SYN-RETAKE-${attempt.attemptToken}`;
    if (chance(rng, 0.6)) attempt.canonicalCourseId = target.canonicalCourseId;
  }
  const requirements:LedgerRequirement[] = [];
  const ev = (id:string) => (chance(rng, 0.9) ? {evidenceRefs:[`SYN-EV-${id}`]} : {});
  if (chance(rng, 0.8)) requirements.push({id:'SYN-R-TOTAL', kind:'CREDIT_TOTAL', requiredCreditUnits:pick(rng, [1, 6, 12, 18]), ...ev('TOTAL')});
  AREAS.forEach((areaId, i) => {
    if (chance(rng, 0.5)) requirements.push({id:`SYN-R-AREA${i}`, kind:'CATEGORY_MINIMUM', areaId, requiredCreditUnits:pick(rng, [1, 6, 12]), ...ev(`AREA${i}`)});
  });
  if (chance(rng, 0.6)) requirements.push({id:'SYN-R-REQ', kind:'REQUIRED_COURSE', canonicalCourseId:pick(rng, COURSES), ...ev('REQ')});
  if (chance(rng, 0.6)) {
    const courseIds = COURSES.filter(() => chance(rng, 0.6));
    if (courseIds.length >= 2) requirements.push({id:'SYN-R-KOFN', kind:'K_OF_N', courseIds, k:1 + Math.floor(rng() * courseIds.length), ...ev('KOFN')});
  }
  if (chance(rng, 0.3)) requirements.push({id:'SYN-R-GPA', kind:'NON_CREDIT', criterionId:'SYN-GPA', verificationMode:'GPA_NOT_COLLECTED'});
  if (chance(rng, 0.3)) requirements.push({id:'SYN-R-EXAM', kind:'NON_CREDIT', criterionId:'SYN-EXAM', verificationMode:'MANUAL', ...ev('EXAM')});
  return {asOf:pick(rng, AS_OF), rulePackVersion:'SYN-PACK-PROP', rulePackState:pick(rng, STATES), attempts, requirements};
}

// 독립 기준 모델(R1~R7)은 성능보다 작은 사례의 검증과 가독성을 우선한다.

const SEASON = {'1':0, S:1, '2':2, W:3} as const;
const order = (term:string) => Number(term.slice(0, 4)) * 4 + SEASON[term.slice(5) as keyof typeof SEASON];
/** 한국시간 학기 성적 인정 시작 시각: 1학기→7/1, 여름→9/1, 2학기→다음 해 1/1, 겨울→다음 해 3/1. */
function endsAt(term:string):number {
  const year = Number(term.slice(0, 4));
  const [y, m] = ({'1':[year, 7], S:[year, 9], '2':[year + 1, 1], W:[year + 1, 3]} as const)[term.slice(5) as '1'|'S'|'2'|'W'];
  return Date.UTC(y, m - 1, 1) - 9 * 3600_000;
}

export interface ModelResult {
  state:string; earned:number; inProgress:number; planned:number; pending:number;
  areas:Record<string, [number, number]>; excluded:Record<string, string>;
  rows:Record<string, {state:string; earned?:number; remaining?:number; matched?:number;
    projected?:number; areasMatched?:number; groupsMatched?:number}>;
}

export function referenceLedger(c:Case):ModelResult {
  const asOf = Date.parse(c.asOf);
  const byToken = new Map(c.attempts.map(a => [a.attemptToken, a]));
  const ended = (a:LedgerAttempt) => a.term !== undefined && endsAt(a.term) <= asOf;
  const held = new Set<string>();
  // R1
  for (const a of c.attempts) if (a.ledger === 'EARNED' && !ended(a)) held.add(a.attemptToken);
  // R2 순환은 연결된 모든 기록에서 링크를 추적해 같은 토큰을 다시 만나면 판단한다. 순환 진입까지 거친 기록도 보류한다.
  const cycleTokens = new Set<string>();
  for (const a of c.attempts) {
    if (!a.supersedesAttemptToken) continue;
    const walked:string[] = [];
    let t:string|undefined = a.attemptToken;
    while (t !== undefined && !walked.includes(t)) { walked.push(t); t = byToken.get(t)?.supersedesAttemptToken; }
    if (t !== undefined) walked.forEach(s => cycleTokens.add(s));
  }
  cycleTokens.forEach(t => held.add(t));
  const superseded = new Set<string>();
  const claims = new Map<string, LedgerAttempt[]>();
  for (const a of c.attempts) if (a.supersedesAttemptToken) claims.set(a.supersedesAttemptToken, [...(claims.get(a.supersedesAttemptToken) ?? []), a]);
  for (const [target, claimers] of claims) {
    if (cycleTokens.has(target) || claimers.some(x => cycleTokens.has(x.attemptToken))) continue;
    const old = byToken.get(target);
    const only = claimers.length === 1 ? claimers[0]! : undefined;
    const ok = old !== undefined && only !== undefined && ended(only)
      && old.canonicalCourseId === only.canonicalCourseId && old.ledger === 'EARNED' && only.ledger === 'EARNED'
      && only.recognition === 'RECOGNIZED' && only.retakeApprovalRef !== undefined
      && old.term !== undefined && only.term !== undefined && order(only.term) > order(old.term);
    if (ok) superseded.add(target); else claimers.forEach(x => held.add(x.attemptToken));
  }
  const excluded:Record<string, string> = {};
  const put = (t:string, r:string) => { excluded[t] ??= r; };
  // R3/R4
  const live = c.attempts.filter(a => {
    if (held.has(a.attemptToken)) { put(a.attemptToken, 'NEEDS_REVIEW'); return false; }
    if (superseded.has(a.attemptToken)) { put(a.attemptToken, 'RETAKE_SUPERSEDED'); return false; }
    if (a.recognition === 'EXCLUDED') { put(a.attemptToken, 'OFFICIAL_EXCLUSION'); return false; }
    return true;
  });
  let anyHold = held.size > 0;
  const winners = new Map<string, LedgerAttempt>();
  const blocked = new Set<string>();
  for (const course of new Set(live.map(a => a.canonicalCourseId))) {
    const rec = live.filter(a => a.canonicalCourseId === course && a.recognition === 'RECOGNIZED');
    if (rec.length === 0) continue;
    const slots = rec.map(a => a.ledger);
    if (new Set(slots).size !== slots.length) { anyHold = true; blocked.add(course); rec.forEach(a => put(a.attemptToken, 'NEEDS_REVIEW')); continue; }
    const rank = {EARNED:0, IN_PROGRESS:1, PLANNED:2} as const;
    const win = [...rec].sort((x, y) => rank[x.ledger] - rank[y.ledger])[0]!;
    winners.set(course, win);
    rec.filter(a => a !== win).forEach(a => put(a.attemptToken, 'DUPLICATE'));
  }
  let pending = 0;
  for (const course of new Set(live.map(a => a.canonicalCourseId))) {
    const pen = live.filter(a => a.canonicalCourseId === course && a.recognition === 'PENDING');
    if (pen.length === 0) continue;
    if (pen.length === 1 && !winners.has(course) && !blocked.has(course)) { pending += pen[0]!.creditUnits; put(pen[0]!.attemptToken, 'PENDING_RECOGNITION'); continue; }
    if (pen.length !== 1 || blocked.has(course)) anyHold = true;
    pen.forEach(a => put(a.attemptToken, winners.has(course) && pen.length === 1 ? 'DUPLICATE' : 'NEEDS_REVIEW'));
  }
  // R5
  let earned = 0, inProgress = 0, planned = 0;
  const areas:Record<string, [number, number]> = {};
  for (const w of winners.values()) {
    if (w.ledger === 'EARNED') earned += w.creditUnits; else if (w.ledger === 'IN_PROGRESS') inProgress += w.creditUnits; else planned += w.creditUnits;
    for (const area of w.areaIds) {
      const cur = areas[area] ?? [0, 0];
      areas[area] = [cur[0] + (w.ledger === 'EARNED' ? w.creditUnits : 0), cur[1] + w.creditUnits];
    }
  }
  // R6
  const approved = c.rulePackState === 'APPROVED';
  const rows:ModelResult['rows'] = {};
  for (const r of c.requirements) {
    const evidence = (r.evidenceRefs ?? []).length > 0;
    let row:ModelResult['rows'][string];
    if (r.kind === 'NON_CREDIT') row = {state:r.verificationMode === 'GPA_NOT_COLLECTED' ? 'NOT_CHECKED' : 'NEEDS_REVIEW'};
    else if (r.kind === 'CREDIT_TOTAL') row = {state:earned >= r.requiredCreditUnits ? 'SATISFIED' : 'UNSATISFIED', earned, remaining:Math.max(0, r.requiredCreditUnits - earned)};
    else if (r.kind === 'CATEGORY_MINIMUM') {
      const e = areas[r.areaId]?.[0] ?? 0;
      row = {state:e >= r.requiredCreditUnits ? 'SATISFIED' : 'UNSATISFIED', earned:e, remaining:Math.max(0, r.requiredCreditUnits - e)};
    } else if (r.kind === 'REQUIRED_COURSE') row = {state:winners.get(r.canonicalCourseId)?.ledger === 'EARNED' ? 'SATISFIED' : 'UNSATISFIED'};
    else if (r.kind === 'AREA_SPREAD') row = spreadModel(r, winners);
    else if (r.kind === 'GROUP_CHOICE') {
      // 그룹 내 모든 과목에 취득 완료 판정 기록이 있는 경우에만 충족으로 센다.
      const done = r.groups.filter(group => group.every(id => winners.get(id)?.ledger === 'EARNED')).length;
      row = {state:done >= r.k ? 'SATISFIED' : 'UNSATISFIED', groupsMatched:done};
    } else {
      if (r.kind !== 'K_OF_N') throw new TypeError('Unsupported requirement in the reference model');
      const hit = r.courseIds.map(id => winners.get(id)).filter(w => w?.ledger === 'EARNED');
      row = {state:hit.length >= r.k ? 'SATISFIED' : 'UNSATISFIED', earned:hit.reduce((s, w) => s + w!.creditUnits, 0), matched:hit.length};
    }
    if (row.state !== 'NOT_CHECKED' && (!approved || (row.state === 'SATISFIED' && !evidence))) row = {...row, state:'NEEDS_REVIEW'};
    rows[r.id] = row;
  }
  // R7
  const review = Object.values(rows).some(r => r.state === 'NEEDS_REVIEW' || r.state === 'NOT_CHECKED');
  const state = c.rulePackState === 'MISSING' ? 'INSUFFICIENT_DATA' : !approved || anyHold || review ? 'NEEDS_REVIEW' : 'READY';
  return {state, earned, inProgress, planned, pending, areas, excluded, rows};
}

/**
 * AREA_SPREAD는 취득 과목별 가능한 영역 배정을 모두 시도해 최소·최대 영역 수로 판정한다.
 * 원장의 매칭·집합 덮개 코드를 공유하지 않는 독립적인 소규모 전수 탐색이다.
 */
function spreadModel(r:Extract<LedgerRequirement, {kind:'AREA_SPREAD'}>, winners:ReadonlyMap<string, LedgerAttempt>):ModelResult['rows'][string] {
  const allowed = new Set(r.areaIds);
  let earned = 0, projected = 0;
  const choices:string[][] = [];
  for (const w of winners.values()) {
    if (w.creditUnits === 0) continue; // 학점이 0인 과목은 영역 수에 영향을 주지 않는다.
    const eligible = w.areaIds.filter(area => allowed.has(area));
    if (eligible.length === 0) continue;
    projected += w.creditUnits;
    if (w.ledger !== 'EARNED') continue;
    earned += w.creditUnits;
    choices.push(eligible);
  }
  let fewest = Number.POSITIVE_INFINITY, most = 0;
  const walk = (i:number, picked:readonly string[]):void => {
    if (i === choices.length) {
      const distinct = new Set(picked).size;
      fewest = Math.min(fewest, distinct);
      most = Math.max(most, distinct);
      return;
    }
    for (const area of choices[i]!) walk(i + 1, [...picked, area]);
  };
  walk(0, []);
  const definite = new Set(choices.filter(list => list.length === 1).map(list => list[0]!)).size;
  const state = earned < r.requiredCreditUnits || most < r.minAreas ? 'UNSATISFIED'
    : fewest >= r.minAreas ? 'SATISFIED' : 'NEEDS_REVIEW';
  return {state, earned, remaining:Math.max(0, r.requiredCreditUnits - earned), projected,
    areasMatched:state === 'SATISFIED' ? Math.max(definite, r.minAreas) : definite};
}

function project(c:Case):ModelResult {
  const out = buildAcademicLedger(c);
  return {
    state:out.state, earned:out.earnedCreditUnits, inProgress:out.inProgressCreditUnits, planned:out.plannedCreditUnits,
    pending:out.pendingRecognitionCreditUnits,
    areas:Object.fromEntries(out.areaProgress.map(a => [a.areaId, [a.earnedCreditUnits, a.projectedCreditUnits] as [number, number]])),
    excluded:Object.fromEntries(out.excludedAttempts.map(e => [e.attemptToken, e.reason])),
    rows:Object.fromEntries(out.requirements.map(r => [r.requirementId, {
      state:r.state,
      ...(r.earnedCreditUnits !== undefined ? {earned:r.earnedCreditUnits} : {}),
      ...(r.remainingCreditUnits !== undefined ? {remaining:r.remainingCreditUnits} : {}),
      ...(r.matchedCoursesCount !== undefined ? {matched:r.matchedCoursesCount} : {}),
      ...(r.matchedAreasCount !== undefined && r.projectedCreditUnits !== undefined ? {projected:r.projectedCreditUnits} : {}),
      ...(r.matchedAreasCount !== undefined ? {areasMatched:r.matchedAreasCount} : {}),
      ...(r.matchedGroupsCount !== undefined ? {groupsMatched:r.matchedGroupsCount} : {}),
    }])),
  };
}

// 실행기: 재현 시드·반례 축소·실패 보고 생성.

const LEDGER_SHA = createHash('sha256').update(readFileSync(new URL('./ledger.ts', import.meta.url))).digest('hex').slice(0, 12);
const ruleHash = (c:Case) => createHash('sha256').update(JSON.stringify(c.requirements)).digest('hex').slice(0, 12);
const SEEDS = process.env.LEDGER_PROP_SEED !== undefined
  ? [Number(process.env.LEDGER_PROP_SEED)]
  : Array.from({length:Number(process.env.LEDGER_PROP_RUNS ?? 400)}, (_, i) => 20261104 + i);

/** 속성이 계속 실패하는 범위에서 수강 시도와 요건을 하나씩 제거하며 반례를 축소한다. */
function shrink(c:Case, fails:(x:Case) => boolean):Case {
  let cur = c;
  for (let changed = true; changed;) {
    changed = false;
    for (const key of ['attempts', 'requirements'] as const) {
      for (let i = 0; i < cur[key].length; i++) {
        const next = {...cur, [key]:cur[key].filter((_, j) => j !== i)} as Case;
        let still = false;
        try { still = fails(next); } catch { still = false; }
        if (still) { cur = next; changed = true; i--; }
      }
    }
  }
  return cur;
}

const canonical = (v:unknown):unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, canonical(x)])) : v;
/** 입력 전체(수강 시도·요건·시각·규칙 상태)를 키 순서와 무관하게 해시한다. */
const inputHash = (c:Case) => createHash('sha256').update(JSON.stringify(canonical(c))).digest('hex').slice(0, 12);

/** 실패 사례를 똑같이 복구해 수작업으로 확인할 수 있도록 보고서에 넣을 정보를 정의한다. */
export function failureReport(name:string, problem:string, seed:number, original:Case, small:Case):string {
  return [`property "${name}" failed: ${problem}`,
    `seed=${seed} inputHash=${inputHash(original)} asOf=${original.asOf} pack=${original.rulePackState} ` +
      `attempts=${original.attempts.length} requirements=${original.requirements.length}`,
    `shrunk: inputHash=${inputHash(small)} ruleHash=${ruleHash(small)} asOf=${small.asOf} pack=${small.rulePackState} ledgerSha=${LEDGER_SHA}`,
    `repro: LEDGER_PROP_SEED=${seed} npx vitest run packages/core/src/academics/ledger.property.test.ts`,
    `shrunk case: ${JSON.stringify(small)}`].join('\n');
}

function forAll(name:string, size:number, prop:(c:Case, rng:Rng) => string|null, seeds:readonly number[] = SEEDS):void {
  for (const seed of seeds) {
    const rng = mulberry32(seed);
    const c = genCase(rng, size);
    const check = (x:Case) => prop(x, mulberry32(seed ^ 0x5bd1e995));
    let problem:string|null;
    try { problem = check(c); } catch (error) { problem = `threw: ${(error as Error).message}`; }
    if (problem !== null) {
      const small = shrink(c, x => check(x) !== null);
      // 첫 오류 메시지는 축소 전 사례를 설명하므로 축소 후 사례를 다시 설명한다.
      let final = problem;
      try { final = check(small) ?? problem; } catch (error) { final = `threw: ${(error as Error).message}`; }
      throw new Error(failureReport(name, final, seed, c, small));
    }
  }
}
const same = (a:unknown, b:unknown) => JSON.stringify(a) === JSON.stringify(b);
const sortKeys = (o:Record<string, unknown>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));

/** 기준 모델과 구현 결과의 필드별 차이를 한 줄씩 출력한다. */
function explain(want:ModelResult, got:ModelResult):string|null {
  const lines:string[] = [];
  for (const key of ['state', 'earned', 'inProgress', 'planned', 'pending'] as const) {
    if (want[key] !== got[key]) lines.push(`${key}: model=${want[key]} implementation=${got[key]}`);
  }
  for (const [label, a, b] of [['area', want.areas, got.areas], ['excluded', want.excluded, got.excluded], ['row', want.rows, got.rows]] as const) {
    for (const id of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      const x = (a as Record<string, unknown>)[id], y = (b as Record<string, unknown>)[id];
      if (!same(x, y)) lines.push(`${label} ${id}: model=${JSON.stringify(x ?? null)} implementation=${JSON.stringify(y ?? null)}`);
    }
  }
  return lines.length ? lines.join('; ') : null;
}

// ---------------------------------------------------------------------------------------------

describe('buildAcademicLedger properties (#202)', () => {
  it('reports a failure with everything needed to rebuild and re-check it', () => {
    // 취득 기록이 있는 모든 사례에서 일부러 실패하도록 만든 속성으로 보고·축소 기능을 검증한다.
    const seed = 20261104;
    let message = '';
    try {
      forAll('demo: no earned attempts', 6, c => (c.attempts.some(a => a.ledger === 'EARNED') ? 'an earned attempt exists' : null), [seed]);
    } catch (error) { message = (error as Error).message; }
    expect(message).toMatch(/^property "demo: no earned attempts" failed: an earned attempt exists$/m);
    const full = genCase(mulberry32(seed), 6);
    expect(message).toContain(`seed=${seed} inputHash=${inputHash(full)} asOf=${full.asOf} pack=${full.rulePackState}`);
    expect(message).toContain(`repro: LEDGER_PROP_SEED=${seed} npx vitest run packages/core/src/academics/ledger.property.test.ts`);
    // 보고서의 축소 사례를 다시 파싱할 수 있고 실패 조건을 유지하며 해시가 같아야 한다.
    const small = JSON.parse(/^shrunk case: (.*)$/m.exec(message)![1]!) as Case;
    expect(small.attempts.filter(a => a.ledger === 'EARNED')).toHaveLength(1);
    expect(small.requirements).toEqual([]);
    expect(message).toContain(`shrunk: inputHash=${inputHash(small)} ruleHash=${ruleHash(small)} asOf=${small.asOf} pack=${small.rulePackState} ledgerSha=${LEDGER_SHA}`);
    // 동일한 시드는 언제나 동일한 사례를 재구성한다.
    expect(inputHash(genCase(mulberry32(seed), 6))).toBe(inputHash(full));
    // 기준 모델 기대값과 구현 실제값의 차이를 필드별로 보고한다.
    const want = referenceLedger(full), got = {...want, earned:want.earned + 1, rows:{...want.rows, 'SYN-X':{state:'SATISFIED'}}};
    expect(explain(want, got)).toBe(`earned: model=${want.earned} implementation=${want.earned + 1}; row SYN-X: model=null implementation={"state":"SATISFIED"}`);
    expect(explain(want, want)).toBeNull();
  });

  it('the reference model agrees with hand-checked cases', () => {
    // 아래 기대값은 R1~R7로 사람이 계산한 상수이지 referenceLedger의 출력이 아니다.
    // 먼저 기준 모델을 상수에 대조한 다음 구현과 비교한다.
    // 예: C1은 2024-1에 6단위 취득 후 2025-1에 승인 재수강했으므로 한 번만 세어 총 6단위다.
    const retake:Case = {asOf:'2025-08-01T00:00:00+09:00', rulePackVersion:'SYN-P', rulePackState:'APPROVED', requirements:[], attempts:[
      {attemptToken:'SYN-A', canonicalCourseId:'SYN-C1', creditUnits:6, ledger:'EARNED', areaIds:[], recognition:'RECOGNIZED', term:'2024-1'},
      {attemptToken:'SYN-B', canonicalCourseId:'SYN-C1', creditUnits:6, ledger:'EARNED', areaIds:[], recognition:'RECOGNIZED', term:'2025-1',
        supersedesAttemptToken:'SYN-A', retakeApprovalRef:'SYN-OK'}]};
    expect(referenceLedger(retake)).toMatchObject({earned:6, excluded:{'SYN-A':'RETAKE_SUPERSEDED'}, state:'READY'});
    // 재수강 승인이 없으면 새 기록을 보류하고 이전 취득 학점 6단위는 유지하며 상태는 NEEDS_REVIEW다.
    const {retakeApprovalRef:_r, ...noApproval} = retake.attempts[1]!;
    expect(referenceLedger({...retake, attempts:[retake.attempts[0]!, noApproval]})).toMatchObject({earned:6, excluded:{'SYN-B':'NEEDS_REVIEW'}, state:'NEEDS_REVIEW'});
    // 2026-01-01 한국시간 전에는 2025-2 학점이 인정되지 않으므로 2025-12-31 취득 학점은 0이다.
    const future:Case = {...retake, asOf:'2025-12-31T23:59:59+09:00', attempts:[{...retake.attempts[0]!, term:'2025-2'}]};
    expect(referenceLedger(future)).toMatchObject({earned:0, excluded:{'SYN-A':'NEEDS_REVIEW'}});
    expect(referenceLedger({...future, asOf:'2026-01-01T00:00:00+09:00'})).toMatchObject({earned:6, excluded:{}});
    // 한 과목이 두 영역에 속하면 총합은 6단위, 각 영역은 6단위다. 같은 과목의 취득·계획 중 계획 기록은 DUPLICATE다.
    const shared:Case = {...retake, attempts:[
      {attemptToken:'SYN-A', canonicalCourseId:'SYN-C1', creditUnits:6, ledger:'EARNED', areaIds:['SYN-A1', 'SYN-A2'], recognition:'RECOGNIZED', term:'2024-1'},
      {attemptToken:'SYN-P', canonicalCourseId:'SYN-C1', creditUnits:6, ledger:'PLANNED', areaIds:['SYN-A1'], recognition:'RECOGNIZED'}]};
    expect(referenceLedger(shared)).toMatchObject({earned:6, planned:0, areas:{'SYN-A1':[6, 6], 'SYN-A2':[6, 6]}, excluded:{'SYN-P':'DUPLICATE'}});
    // 교환학점이 인정 대기인 경우 취득은 0, 대기 중 학점은 6단위다.
    expect(referenceLedger({...retake, attempts:[{...retake.attempts[0]!, recognition:'PENDING'}]})).toMatchObject({earned:0, pending:6});
    // 구현은 사람이 계산한 모든 기준 사례와 결과가 같아야 한다.
    for (const c of [retake, {...retake, attempts:[retake.attempts[0]!, noApproval]}, future, shared]) {
      expect(project(c)).toEqual(referenceLedger(c));
    }
  });

  it('generates every kind of case it claims to test', () => {
    // 재수강·보류·중복·승인 규칙이 생성되지 않는다면 속성이 공허하게 통과하므로 생성기 분포를 확인한다.
    const tally:Record<string, number> = {};
    const bump = (k:string) => { tally[k] = (tally[k] ?? 0) + 1; };
    for (const seed of SEEDS.slice(0, 400)) {
      const c = genCase(mulberry32(seed), 6);
      const out = buildAcademicLedger(c);
      bump(`state:${out.state}`);
      for (const e of out.excludedAttempts) bump(`excluded:${e.reason}`);
      for (const r of out.requirements) bump(`row:${r.state}`);
      if (out.pendingRecognitionCreditUnits > 0) bump('pending');
    }
    const atLeast = Math.max(1, Math.floor(Math.min(SEEDS.length, 400) / 40));
    for (const kind of ['state:READY', 'state:NEEDS_REVIEW', 'state:INSUFFICIENT_DATA', 'excluded:RETAKE_SUPERSEDED',
      'excluded:DUPLICATE', 'excluded:NEEDS_REVIEW', 'excluded:PENDING_RECOGNITION', 'excluded:OFFICIAL_EXCLUSION',
      'row:SATISFIED', 'row:UNSATISFIED', 'row:NEEDS_REVIEW', 'row:NOT_CHECKED', 'pending']) {
      if (SEEDS.length >= 400) expect(tally[kind] ?? 0, kind).toBeGreaterThanOrEqual(atLeast);
    }
  });

  it('matches the reference model on small seeded cases', () => {
    forAll('reference model', 6, c => explain(referenceLedger(c), project(c)));
  });

  // 전제 없음. 원장은 수강 시도를 집합으로 처리하고 excludedAttempts만 입력 순서를 따른다.
  it('gives the same result for any attempt order', () => {
    forAll('order independence', 12, (c, rng) => {
      const shuffled = [...c.attempts].map(a => [rng(), a] as const).sort((x, y) => x[0] - y[0]).map(([, a]) => a);
      const a = project(c), b = project({...c, attempts:shuffled});
      return same({...a, excluded:sortKeys(a.excluded)}, {...b, excluded:sortKeys(b.excluded)}) ? null : 'result depends on attempt order';
    });
  });

  // 전제 없음. 학점 단위는 정수(1단위=0.5학점)이며 합계가 학점을 잃거나 만들어내지 않는다.
  it('keeps integer units and consistent sums', () => {
    forAll('integer units', 12, c => {
      const out = buildAcademicLedger(c);
      const nums = [out.earnedCreditUnits, out.inProgressCreditUnits, out.plannedCreditUnits, out.projectedUniqueCreditUnits,
        out.pendingRecognitionCreditUnits, ...out.areaProgress.flatMap(a => [a.earnedCreditUnits, a.projectedCreditUnits])];
      if (!nums.every(n => Number.isSafeInteger(n) && n >= 0)) return `non-integer or negative unit in ${JSON.stringify(nums)}`;
      if (out.projectedUniqueCreditUnits !== out.earnedCreditUnits + out.inProgressCreditUnits + out.plannedCreditUnits) return 'projected != earned + in progress + planned';
      // 각 과목을 한 번만 세므로 고유 취득 총합은 서로 다른 과목의 취득 학점 합을 넘지 않는다.
      const bound = new Map<string, number>();
      for (const a of c.attempts) if (a.ledger === 'EARNED') bound.set(a.canonicalCourseId, Math.max(bound.get(a.canonicalCourseId) ?? 0, a.creditUnits));
      if (out.earnedCreditUnits > [...bound.values()].reduce((s, n) => s + n, 0)) return 'earned exceeds one attempt per course';
      if (out.areaProgress.some(a => a.earnedCreditUnits > out.earnedCreditUnits || a.earnedCreditUnits > a.projectedCreditUnits)) return 'an area exceeds the unique total';
      const tokens = out.excludedAttempts.map(e => e.attemptToken);
      if (new Set(tokens).size !== tokens.length || tokens.some(t => !c.attempts.some(a => a.attemptToken === t))) return 'an attempt is excluded twice or unknown';
      return null;
    });
    // 같은 수강 시도 토큰의 중복은 두 번 세지 않고 거부하며 소수 학점 단위도 반올림하지 않고 거부한다.
    const one:LedgerAttempt = {attemptToken:'SYN-T', canonicalCourseId:'SYN-C1', creditUnits:6, ledger:'EARNED', areaIds:[], recognition:'RECOGNIZED', term:'2024-1'};
    const base = {asOf:'2026-12-20T12:00:00+09:00', rulePackVersion:'SYN-P', rulePackState:'APPROVED' as const, requirements:[]};
    expect(() => buildAcademicLedger({...base, attempts:[one, {...one}]})).toThrow(/duplicate attempt/);
    expect(() => buildAcademicLedger({...base, attempts:[{...one, creditUnits:5.5}]})).toThrow(/integer credit unit/);
  });

  // 전제 없음. 학기가 asOf보다 뒤에 끝나면 그 학점은 취득으로 추가하지 않는다(R1).
  it('never counts a term that had not ended by asOf', () => {
    forAll('no future credit', 12, c => {
      const out = buildAcademicLedger(c);
      const endedBy = (a:LedgerAttempt) => a.term !== undefined && endsAt(a.term) <= Date.parse(c.asOf);
      const ceiling = c.attempts.filter(a => a.ledger === 'EARNED' && endedBy(a)).reduce((s, a) => s + a.creditUnits, 0);
      if (out.earnedCreditUnits > ceiling) return `earned ${out.earnedCreditUnits} > ${ceiling} from ended terms`;
      const early = buildAcademicLedger({...c, asOf:'2022-01-01T00:00:00+09:00'});
      return early.earnedCreditUnits === 0 ? null : 'credit counted before any term ended';
    });
  });

  // 전제 없음. APPROVED 규칙집 없이는 SATISFIED·READY가 될 수 없다(R6/R7).
  // 승인 근거 없는 재수강 연결은 이전 학점을 제거하지 않는다(R2).
  it('never passes on an unapproved pack or an unapproved retake', () => {
    forAll('approval gates', 12, c => {
      for (const state of ['DRAFT', 'NEEDS_REVIEW', 'MISSING'] as const) {
        const out = buildAcademicLedger({...c, rulePackState:state});
        if (out.requirements.some(r => r.state === 'SATISFIED')) return `a row is SATISFIED on a ${state} pack`;
        if (out.state === 'READY' || (state === 'MISSING') !== (out.state === 'INSUFFICIENT_DATA')) return `state ${out.state} on a ${state} pack`;
      }
      const stripped = c.attempts.map(({retakeApprovalRef:_r, ...rest}) => rest);
      const out = buildAcademicLedger({...c, attempts:stripped});
      return out.excludedAttempts.some(e => e.reason === 'RETAKE_SUPERSEDED') ? 'a retake without approval removed credit' : null;
    });
  });
});

// 본선 이전 #11에서 추가한 검증 공백은 인접 PROPERTY_COVERAGE.md에 기록한다.

/** 한 사례가 포함하는 재수강 연결 형태를 분류한다. */
function linkShapes(c:Case) {
  const byToken = new Map(c.attempts.map(a => [a.attemptToken, a]));
  const claims = new Map<string, number>();
  for (const a of c.attempts) {
    if (a.supersedesAttemptToken) claims.set(a.supersedesAttemptToken, (claims.get(a.supersedesAttemptToken) ?? 0) + 1);
  }
  let cycle = false, chain = false;
  for (const a of c.attempts) {
    const walked:string[] = [];
    let at:LedgerAttempt|undefined = a;
    while (at?.supersedesAttemptToken && !walked.includes(at.attemptToken)) {
      walked.push(at.attemptToken);
      at = byToken.get(at.supersedesAttemptToken);
    }
    if (at !== undefined && walked.includes(at.attemptToken)) cycle = true;
    else if (walked.length >= 2) chain = true;
  }
  return {
    fork:[...claims.values()].some(n => n > 1),
    selfLink:c.attempts.some(a => a.supersedesAttemptToken === a.attemptToken),
    cycle, chain,
  };
}

/** 기존 genCase/referenceLedger가 모델링하지 않는 AREA_SPREAD와 GROUP_CHOICE 요건을 추가한다. */
function withComposite(c:Case, rng:Rng):Case {
  const requirements = [...c.requirements];
  if (chance(rng, 0.7)) {
    requirements.push({id:'SYN-R-SPREAD', kind:'AREA_SPREAD', areaIds:[...AREAS], minAreas:1 + Math.floor(rng() * AREAS.length),
      requiredCreditUnits:pick(rng, [1, 6, 12]), evidenceRefs:['SYN-EV-SPREAD']});
  }
  if (chance(rng, 0.7)) {
    requirements.push({id:'SYN-R-GROUP', kind:'GROUP_CHOICE', groups:[['SYN-C1'], ['SYN-C2', 'SYN-C3'], ['SYN-C4']],
      k:1 + Math.floor(rng() * 3), evidenceRefs:['SYN-EV-GROUP']});
  }
  return {...c, requirements};
}

const BASE_REQUEST = {asOf:'2026-12-20T12:00:00+09:00', rulePackVersion:'SYN-P', rulePackState:'APPROVED' as const};
const earned = (token:string, course:string, units:number, over:Partial<LedgerAttempt> = {}):LedgerAttempt => ({
  attemptToken:token, canonicalCourseId:course, creditUnits:units, ledger:'EARNED', areaIds:[], recognition:'RECOGNIZED',
  term:'2024-1', ...over,
});

describe('buildAcademicLedger gaps (#11 본선 전)', () => {
  it('the generator makes forks, cycles, self-links and chains, not only plain retakes', () => {
    // 기준 모델 시험도 같은 시드·입력 크기로 실행하므로 추가 요건을 함께 비교한다.
    const tally = {fork:0, selfLink:0, cycle:0, chain:0};
    for (const seed of SEEDS.slice(0, 400)) {
      const found = linkShapes(genCase(mulberry32(seed), 6));
      for (const key of Object.keys(tally) as (keyof typeof tally)[]) if (found[key]) tally[key] += 1;
    }
    const atLeast = Math.max(1, Math.floor(Math.min(SEEDS.length, 400) / 40));
    for (const [kind, count] of Object.entries(tally)) {
      if (SEEDS.length >= 400) expect(count, kind).toBeGreaterThanOrEqual(atLeast);
    }
  });

  it('an approved retake chain keeps only the last attempt', () => {
    const c:Case = {...BASE_REQUEST, requirements:[{id:'SYN-R-TOTAL', kind:'CREDIT_TOTAL', requiredCreditUnits:6, evidenceRefs:['SYN-EV']}],
      attempts:[
        earned('SYN-A', 'SYN-C1', 6, {term:'2023-1'}),
        earned('SYN-B', 'SYN-C1', 6, {term:'2024-1', supersedesAttemptToken:'SYN-A', retakeApprovalRef:'SYN-RETAKE-B'}),
        earned('SYN-C', 'SYN-C1', 6, {term:'2025-1', supersedesAttemptToken:'SYN-B', retakeApprovalRef:'SYN-RETAKE-C'}),
      ]};
    const out = buildAcademicLedger(c);
    expect(out.excludedAttempts).toEqual([
      {attemptToken:'SYN-A', reason:'RETAKE_SUPERSEDED'}, {attemptToken:'SYN-B', reason:'RETAKE_SUPERSEDED'}]);
    expect(out.earnedCreditUnits).toBe(6);
    expect(explain(referenceLedger(c), project(c))).toBeNull();
  });

  it('a chain with an unapproved middle link never counts the course twice', () => {
    const c:Case = {...BASE_REQUEST, requirements:[{id:'SYN-R-TOTAL', kind:'CREDIT_TOTAL', requiredCreditUnits:6, evidenceRefs:['SYN-EV']}],
      attempts:[
        earned('SYN-A', 'SYN-C1', 6, {term:'2023-1'}),
        earned('SYN-B', 'SYN-C1', 6, {term:'2024-1', supersedesAttemptToken:'SYN-A'}),
        earned('SYN-C', 'SYN-C1', 6, {term:'2025-1', supersedesAttemptToken:'SYN-B', retakeApprovalRef:'SYN-RETAKE-C'}),
      ]};
    const out = buildAcademicLedger(c);
    expect(out.earnedCreditUnits).toBeLessThanOrEqual(6);
    expect(out.state).toBe('NEEDS_REVIEW');
    expect(explain(referenceLedger(c), project(c))).toBeNull();
  });

  it('refuses credit units outside non-negative safe integers, and sums that leave them', () => {
    const run = (attempts:LedgerAttempt[]) => buildAcademicLedger({...BASE_REQUEST, attempts, requirements:[]});
    for (const bad of [-1, -6, Number.NaN, Number.POSITIVE_INFINITY, 0.5, 2 ** 53, '6' as unknown as number]) {
      expect(() => run([earned('SYN-T', 'SYN-C1', bad)]), String(bad)).toThrow(/integer credit unit/);
    }
    expect(run([earned('SYN-T', 'SYN-C1', Number.MAX_SAFE_INTEGER)]).earnedCreditUnits).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => run([earned('SYN-T1', 'SYN-C1', Number.MAX_SAFE_INTEGER), earned('SYN-T2', 'SYN-C2', 1)]))
      .toThrow(/credit unit sum/);
  });

  it('counts half-credit units exactly (1 unit = 0.5학점)', () => {
    const attempts = [earned('SYN-T1', 'SYN-C1', 1), earned('SYN-T2', 'SYN-C2', 1)];
    const row = (units:number) => buildAcademicLedger({...BASE_REQUEST, attempts,
      requirements:[{id:'SYN-R', kind:'CREDIT_TOTAL', requiredCreditUnits:units, evidenceRefs:['SYN-EV']}]}).requirements[0]!;
    expect(row(2)).toMatchObject({state:'SATISFIED', earnedCreditUnits:2});
    expect(row(3)).toMatchObject({state:'UNSATISFIED', earnedCreditUnits:2, remainingCreditUnits:1});
  });

  // 전제 없음. 모든 비교가 취득 학점 ≥ 요구 학점이므로 모든 학점 단위를 두 배로 해도 상태가 달라지지 않는다.
  it('doubling every credit unit doubles every unit figure and changes no state', () => {
    forAll('unit scale', 12, (c0, rng) => {
      const c = withComposite(c0, rng);
      const doubled:Case = {...c,
        attempts:c.attempts.map(a => ({...a, creditUnits:a.creditUnits * 2})),
        requirements:c.requirements.map(r => ('requiredCreditUnits' in r ? {...r, requiredCreditUnits:r.requiredCreditUnits * 2} : r)) as LedgerRequirement[]};
      const problems:string[] = [];
      const walk = (a:unknown, b:unknown, path:string):void => {
        if (typeof a === 'number' && /CreditUnits$/.test(path)) {
          if (b !== a * 2) problems.push(`${path}: ${String(a)} -> ${String(b)}`);
        } else if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
          a.forEach((item, i) => walk(item, b[i], path));
        } else if (a && typeof a === 'object' && b && typeof b === 'object') {
          const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
          for (const key of keys) walk((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], key);
        } else if (!same(a, b)) problems.push(`${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
      };
      walk(buildAcademicLedger(c), buildAcademicLedger(doubled), 'ledger');
      return problems.length ? problems.slice(0, 5).join('; ') : null;
    });
  });

  // 전제: 추가 과목은 새 과목으로 문제없이 취득했고 직접 지정된 필수 요건이 아니라 영역을 통해서만 참조된다.
  it('one more cleanly earned course never takes credit or a satisfied row away', () => {
    forAll('one more earned course', 12, (c0, rng) => {
      const c = withComposite(c0, rng);
      const units = pick(rng, [1, 2, 6]);
      const areaIds = AREAS.filter(() => chance(rng, 0.5));
      const extra = earned('SYN-T-NEW', 'SYN-NEW', units, {areaIds, term:'2023-1'});
      const before = buildAcademicLedger(c), after = buildAcademicLedger({...c, attempts:[...c.attempts, extra]});
      if (after.earnedCreditUnits !== before.earnedCreditUnits + units) return `earned ${before.earnedCreditUnits} -> ${after.earnedCreditUnits}, added ${units}`;
      const area = (out:typeof before, id:string) => out.areaProgress.find(a => a.areaId === id)?.earnedCreditUnits ?? 0;
      for (const id of AREAS) {
        const want = area(before, id) + (areaIds.includes(id) ? units : 0);
        if (area(after, id) !== want) return `area ${id}: ${area(before, id)} -> ${area(after, id)}, want ${want}`;
      }
      if (!same(before.excludedAttempts, after.excludedAttempts)) return 'other attempts changed their exclusion';
      // 두 상황에서는 충족처럼 보이는 요건도 검토 보류될 수 있다.
      // 근거가 없는 요건, 또는 여러 영역에 걸친 취득 과목의 공식 배정에 따라 AREA_SPREAD가 달라지는 경우다.
      const unevidenced = new Set(c.requirements.filter(r => !(r.evidenceRefs?.length)).map(r => r.id));
      let toReview = false;
      for (const row of before.requirements) {
        const next = after.requirements.find(r => r.requirementId === row.requirementId);
        if (row.state === 'SATISFIED' && next?.state !== 'SATISFIED') return `${row.requirementId} lost SATISFIED`;
        if (row.state === 'UNSATISFIED' && next?.state === 'NEEDS_REVIEW') {
          const ambiguousSpread = row.requirementId === 'SYN-R-SPREAD' && [...c.attempts, extra].some(a =>
            a.ledger === 'EARNED' && a.areaIds.filter(id => (AREAS as readonly string[]).includes(id)).length >= 2);
          if (!unevidenced.has(row.requirementId) && !ambiguousSpread) return `${row.requirementId} went to review`;
          toReview = true;
        }
      }
      if (before.state === 'READY' && after.state !== 'READY' && !toReview) return `state ${before.state} -> ${after.state}`;
      return null;
    });
  });

  it('gives the same result for any attempt order, with spread and group rows too', () => {
    forAll('order independence with composite rows', 12, (c0, rng) => {
      const c = withComposite(c0, rng);
      const shuffled = [...c.attempts].map(a => [rng(), a] as const).sort((x, y) => x[0] - y[0]).map(([, a]) => a);
      const rows = (x:Case) => buildAcademicLedger(x).requirements;
      return same(rows(c), rows({...c, attempts:shuffled})) ? null : 'a row depends on attempt order';
    });
  });

  // 전제 없음. 원장은 요청을 읽기만 하고 입력을 수정하지 않는다.
  it('never modifies its inputs', () => {
    const freeze = (value:unknown):void => {
      if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    };
    forAll('inputs unchanged', 12, (c0, rng) => {
      const c = withComposite(c0, rng), before = JSON.stringify(c), frozen = structuredClone(c);
      freeze(frozen);
      // 동결된 입력 수정은 엄격 모드에서 예외를 내고, 일반 복사본은 조용한 변경도 검출한다.
      const out = buildAcademicLedger(frozen), plain = buildAcademicLedger(c);
      if (JSON.stringify(c) !== before) return 'the request changed';
      return same(out, plain) ? null : 'a frozen request gives a different result';
    });
  });

  it('the spread and group rows reach both SATISFIED and UNSATISFIED', () => {
    const seen = new Set<string>();
    for (const seed of SEEDS.slice(0, 400)) {
      const rng = mulberry32(seed);
      const c = withComposite({...genCase(rng, 12), rulePackState:'APPROVED'}, rng);
      for (const r of buildAcademicLedger(c).requirements) {
        if (r.requirementId === 'SYN-R-SPREAD' || r.requirementId === 'SYN-R-GROUP') seen.add(`${r.requirementId}:${r.state}`);
      }
    }
    if (SEEDS.length >= 400) {
      for (const kind of ['SYN-R-SPREAD:SATISFIED', 'SYN-R-SPREAD:UNSATISFIED', 'SYN-R-GROUP:SATISFIED', 'SYN-R-GROUP:UNSATISFIED']) {
        expect(seen.has(kind), kind).toBe(true);
      }
    }
  });
});

// #11 본선 전에는 AREA_SPREAD·GROUP_CHOICE를 전수 탐색 기준 모델, 탐색 예산, 대규모 입력과 비교한다. SYN-* 합성 데이터만 사용한다.

const SPREAD_AREAS = ['SYN-S1', 'SYN-S2', 'SYN-S3', 'SYN-S4', 'SYN-S5', 'SYN-S6'] as const;

/** 서로 다른 인정 과목이며 재수강 링크가 없고 여러 영역에 걸쳐 있어 영역 분배 계산이 복잡한 사례다. */
function genSpreadCase(rng:Rng):Case {
  const attempts:LedgerAttempt[] = [];
  const count = 1 + Math.floor(rng() * 8);
  for (let i = 0; i < count; i++) {
    const tags = [...SPREAD_AREAS, 'SYN-OUT'].filter(() => chance(rng, 0.3)).slice(0, 3);
    attempts.push({attemptToken:`SYN-S-T${i}`, canonicalCourseId:`SYN-S-C${i}`, creditUnits:pick(rng, [0, 1, 2, 6, 6]),
      ledger:pick(rng, ['EARNED', 'EARNED', 'EARNED', 'IN_PROGRESS', 'PLANNED'] as const), areaIds:tags,
      recognition:'RECOGNIZED', term:'2023-1'});
  }
  const areaIds = SPREAD_AREAS.filter(() => chance(rng, 0.6));
  const spreadAreas = areaIds.length >= 2 ? areaIds : [...SPREAD_AREAS.slice(0, 3)];
  return {asOf:'2026-12-20T12:00:00+09:00', rulePackVersion:'SYN-PACK-SPREAD', rulePackState:'APPROVED', attempts,
    requirements:[{id:'SYN-R-SPREAD', kind:'AREA_SPREAD', areaIds:spreadAreas, minAreas:1 + Math.floor(rng() * spreadAreas.length),
      requiredCreditUnits:pick(rng, [1, 6, 12, 18]), evidenceRefs:['SYN-EV-SPREAD']}]};
}

/** 영역 삼각형 10개를 만든다. 각 과목은 두 영역을 잇는 간선 하나에 있으므로 모든 배정은 최소 20개 영역을 채운다. */
function triangles(count:number, minAreas:number):Case {
  const attempts:LedgerAttempt[] = [];
  const areaIds:string[] = [];
  for (let t = 0; t < count; t++) {
    const [a, b, c] = ['A', 'B', 'C'].map(v => `SYN-TRI${t}-${v}`) as [string, string, string];
    areaIds.push(a, b, c);
    for (const [x, y] of [[a, b], [b, c], [c, a]] as const) {
      const n = attempts.length;
      attempts.push({attemptToken:`SYN-TRI-T${n}`, canonicalCourseId:`SYN-TRI-C${n}`, creditUnits:1, ledger:'EARNED',
        areaIds:[x, y], recognition:'RECOGNIZED', term:'2023-1'});
    }
  }
  return {asOf:'2026-12-20T12:00:00+09:00', rulePackVersion:'SYN-PACK-TRI', rulePackState:'APPROVED', attempts,
    requirements:[{id:'SYN-R-TRI', kind:'AREA_SPREAD', areaIds, minAreas, requiredCreditUnits:1, evidenceRefs:['SYN-EV-TRI']}]};
}

describe('AREA_SPREAD and GROUP_CHOICE against the reference model (#11 본선 전)', () => {
  it('the brute-force spread model agrees with hand-checked cases', () => {
    const base = {asOf:'2026-12-20T12:00:00+09:00', rulePackVersion:'SYN-P', rulePackState:'APPROVED' as const};
    const course = (n:number, areaIds:string[], units = 6):LedgerAttempt => ({attemptToken:`SYN-H${n}`, canonicalCourseId:`SYN-HC${n}`,
      creditUnits:units, ledger:'EARNED', areaIds, recognition:'RECOGNIZED', term:'2023-1'});
    const spread = (minAreas:number, requiredCreditUnits = 6):LedgerRequirement => ({id:'SYN-R', kind:'AREA_SPREAD',
      areaIds:['SYN-X', 'SYN-Y', 'SYN-Z'], minAreas, requiredCreditUnits, evidenceRefs:['SYN-EV']});
    const state = (attempts:LedgerAttempt[], req:LedgerRequirement) => referenceLedger({...base, attempts, requirements:[req]}).rows['SYN-R']!.state;
    // X·Y 중 하나에 속하는 과목 하나로는 영역 하나만 채운다.
    expect(state([course(1, ['SYN-X', 'SYN-Y'])], spread(2))).toBe('UNSATISFIED');
    // X 전용 과목과 X·Y 겸용 과목이면 배정에 따라 영역 1개 또는 2개를 채운다.
    expect(state([course(1, ['SYN-X']), course(2, ['SYN-X', 'SYN-Y'])], spread(2))).toBe('NEEDS_REVIEW');
    // X 전용과 Y·Z 겸용 과목이면 어떤 배정에서도 정확히 2개 영역을 채운다.
    expect(state([course(1, ['SYN-X']), course(2, ['SYN-Y', 'SYN-Z'])], spread(2))).toBe('SATISFIED');
    // 영역 종류가 충분해도 취득 학점 단위가 모자라는 경우다.
    expect(state([course(1, ['SYN-X'], 1), course(2, ['SYN-Y'], 1)], spread(2, 6))).toBe('UNSATISFIED');
  });

  it('more multi-area courses than their areas cannot give more areas', () => {
    // 각각 X·Y만 가능한 과목 셋으로는 최대 2개 영역이므로 3개 영역 충족은 불가능하다.
    const three:Case = {asOf:'2026-12-20T12:00:00+09:00', rulePackVersion:'SYN-P', rulePackState:'APPROVED',
      attempts:[1, 2, 3].map(n => ({attemptToken:`SYN-M${n}`, canonicalCourseId:`SYN-MC${n}`, creditUnits:6, ledger:'EARNED' as const,
        areaIds:['SYN-X', 'SYN-Y'], recognition:'RECOGNIZED' as const, term:'2023-1'})),
      requirements:[{id:'SYN-R', kind:'AREA_SPREAD', areaIds:['SYN-X', 'SYN-Y', 'SYN-Z'], minAreas:3, requiredCreditUnits:6,
        evidenceRefs:['SYN-EV']}]};
    expect(project(three).rows['SYN-R']!.state).toBe('UNSATISFIED');
    expect(explain(referenceLedger(three), project(three))).toBeNull();
  });

  it('matches the reference model on the general generator with spread and group rows', () => {
    forAll('reference model with composite rows', 6, (c0, rng) => {
      const c = withComposite(c0, rng);
      return explain(referenceLedger(c), project(c));
    });
  });

  it('matches the brute-force spread model on spread-heavy cases', () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const c = genSpreadCase(mulberry32(seed));
      const problem = explain(referenceLedger(c), project(c));
      if (problem !== null) {
        const small = shrink(c, x => explain(referenceLedger(x), project(x)) !== null);
        throw new Error(failureReport('spread model', explain(referenceLedger(small), project(small)) ?? problem, seed, c, small));
      }
      seen.add(project(c).rows['SYN-R-SPREAD']!.state);
    }
    if (SEEDS.length >= 400) expect([...seen].sort()).toEqual(['NEEDS_REVIEW', 'SATISFIED', 'UNSATISFIED']);
  });

  it('a spread the search can finish is decided exactly', () => {
    // 삼각형 3개로 9개 영역을 만들면 모든 배정에서 최소 6개, 최대 9개 영역을 채운다.
    for (const [minAreas, want] of [[6, 'SATISFIED'], [7, 'NEEDS_REVIEW'], [9, 'NEEDS_REVIEW']] as const) {
      const c = triangles(3, minAreas);
      expect(project(c).rows['SYN-R-TRI']!.state, `min ${minAreas}`).toBe(want);
      expect(explain(referenceLedger(c), project(c))).toBeNull();
    }
  });

  it('past the search budget the ledger holds for review instead of guessing', () => {
    // 삼각형 10개·영역 30개에서는 모든 배정이 최소 20개 영역을 채워 실제로 충족한다.
    // 다만 이를 증명하려면 원장의 탐색 한도 50,000단계를 넘으므로 보류해야 하고 UNSATISFIED로 단정하면 안 된다.
    const met = buildAcademicLedger(triangles(10, 20)).requirements[0]!;
    expect(met.state).toBe('NEEDS_REVIEW');
    // 최소 20~최대 30개 영역을 채우므로 21개 충족 여부는 탐색 예산과 무관하게 미확정이다.
    expect(buildAcademicLedger(triangles(10, 21)).requirements[0]!.state).toBe('NEEDS_REVIEW');
    // 취득 단위가 명확히 부족하면 별도 탐색 없이도 UNSATISFIED로 판정한다.
    const short = triangles(10, 20);
    short.requirements = [{...short.requirements[0]!, requiredCreditUnits:31} as LedgerRequirement];
    expect(buildAcademicLedger(short).requirements[0]!.state).toBe('UNSATISFIED');
  });

  it('a large transcript of single-area courses matches the reference model', () => {
    const areas = Array.from({length:30}, (_, i) => `SYN-L${i}`);
    const attempts:LedgerAttempt[] = Array.from({length:1000}, (_, i) => ({attemptToken:`SYN-L-T${i}`,
      canonicalCourseId:`SYN-L-C${i}`, creditUnits:1 + (i % 6), ledger:i % 7 === 6 ? 'PLANNED' : 'EARNED',
      areaIds:[areas[i % 30]!], recognition:'RECOGNIZED', term:'2023-1'}));
    const groups = Array.from({length:10}, (_, g) => Array.from({length:10}, (_, j) => `SYN-L-C${g * 10 + j}`));
    const c:Case = {asOf:'2026-12-20T12:00:00+09:00', rulePackVersion:'SYN-PACK-LARGE', rulePackState:'APPROVED', attempts,
      requirements:[
        {id:'SYN-R-TOTAL', kind:'CREDIT_TOTAL', requiredCreditUnits:2000, evidenceRefs:['SYN-EV-T']},
        {id:'SYN-R-SPREAD', kind:'AREA_SPREAD', areaIds:areas, minAreas:30, requiredCreditUnits:2000, evidenceRefs:['SYN-EV-S']},
        // 일곱 번째마다 계획 상태이므로 열 과목씩 묶은 모든 그룹에는 적어도 하나의 미취득 과목이 있다.
        {id:'SYN-R-GROUP', kind:'GROUP_CHOICE', groups, k:1, evidenceRefs:['SYN-EV-G']},
      ]};
    expect(explain(referenceLedger(c), project(c))).toBeNull();
    const rows = project(c).rows;
    expect([rows['SYN-R-TOTAL']!.state, rows['SYN-R-SPREAD']!.state, rows['SYN-R-GROUP']!.state])
      .toEqual(['SATISFIED', 'SATISFIED', 'UNSATISFIED']);
  });
});
