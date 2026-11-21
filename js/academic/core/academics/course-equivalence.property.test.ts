import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {applySameCourseRules, type SameCourseRule} from './course-equivalence.js';
import {buildAcademicLedger, type LedgerAttempt, type LedgerRequirement} from './ledger.js';

/**
 * 동일 교과목 규칙과 학점 원장 조합의 재현 가능한 속성 테스트다(#202, #189). 합성 데이터만 사용한다.
 * 한 시드 재현: SAME_COURSE_PROP_SEED=<seed> npx vitest run packages/core/src/academics/course-equivalence.property.test.ts
 * 재현 모드는 지정 시드 하나로 모든 속성을 검사하며 적용 범위·실패 보고 자체 검사는 300개 탐색 시드를 유지한다.
 * 기준 모델(S1~S4)은 코드가 아니라 계약 #189를 바탕으로 작성했다.
 * S1 규칙이 언급하지 않은 과목 기록은 변경하지 않는다. S2 서로 다른 목표를 지정하면 AMBIGUOUS로 보류한다.
 * S3 승인된 규칙이 없으면 RULE_NOT_APPROVED로 보류한다. S4 그 외에는 유일한 목표로 바꾸고 가장 작은 승인 규칙 ID를 기록한다.
 * 보류 행이 있으면 NEEDS_REVIEW이며 입력은 변경하지 않는다.
 * S1~S4의 전제는 승인 규칙 연결 사슬이 없어야 한다는 것이다. 사슬은 P9에서 거부한다. 과목명 변경만으로 학점이 늘거나 줄어야 한다는 가정은 없다.
 */

type Rng = () => number;
const mulberry32 = (seed:number):Rng => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(rng:Rng, list:readonly T[]):T => list[Math.floor(rng() * list.length)]!;
const chance = (rng:Rng, p:number) => rng() < p;
const shuffle = <T>(rng:Rng, list:readonly T[]):T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; }
  return out;
};

const OLD = ['SYN-OLD1', 'SYN-OLD2', 'SYN-OLD3'];
const NEW = ['SYN-NEW1', 'SYN-NEW2'];
const OTHER = ['SYN-OTHER1', 'SYN-OTHER2'];
const COURSES = [...OLD, ...NEW, ...OTHER];
const TERMS = ['2024-1', '2024-2', '2025-1', '2025-2', '2026-2'];
const AREAS = ['SYN-AREA-A', 'SYN-AREA-B'];
const AS_OF = '2026-08-01T00:00:00+09:00'; // 2026-2 학기는 아직 종료되지 않았고 이전 학기들은 종료됐다.
const STATES:readonly SameCourseRule['state'][] = ['APPROVED', 'APPROVED', 'DRAFT', 'NEEDS_REVIEW'];

interface Case { attempts:LedgerAttempt[]; rules:SameCourseRule[] }

/** 규칙은 이전 과목에서 새 과목으로만 매핑하므로 승인 규칙의 연쇄가 생기지 않는다(S1~S4 전제). */
function genCase(rng:Rng, size:number):Case {
  const rules:SameCourseRule[] = [];
  const ruleCount = Math.floor(rng() * 4);
  for (let i = 0; i < ruleCount; i++) {
    const from = OLD.filter(() => chance(rng, 0.5));
    if (from.length === 0) from.push(pick(rng, OLD));
    const state = pick(rng, STATES);
    rules.push({id:`SYN-RULE-${i}`, fromCourseIds:from, toCourseId:pick(rng, NEW), state,
      evidenceRefs:state === 'APPROVED' || chance(rng, 0.5) ? [`EV-SYN-${i}`] : []});
  }
  const attempts:LedgerAttempt[] = [];
  const n = 1 + Math.floor(rng() * size);
  for (let i = 0; i < n; i++) {
    const ledger = pick(rng, ['EARNED', 'EARNED', 'EARNED', 'IN_PROGRESS', 'PLANNED'] as const);
    const attempt:LedgerAttempt = {attemptToken:`SYN-T${i}`, canonicalCourseId:pick(rng, COURSES), creditUnits:pick(rng, [4, 6, 6]),
      ledger, areaIds:AREAS.filter(() => chance(rng, 0.4)),
      recognition:pick(rng, ['RECOGNIZED', 'RECOGNIZED', 'RECOGNIZED', 'PENDING'] as const)};
    if (ledger === 'EARNED' || chance(rng, 0.5)) attempt.term = pick(rng, TERMS);
    attempts.push(attempt);
  }
  // 확률적으로 학수번호가 바뀐 재수강을 생성한다. 이전 과목 취득 후 새 과목을 나중에 취득하고 재수강을 승인한 상황이다.
  if (n >= 2 && chance(rng, 0.4)) {
    const [a, b] = [attempts[0]!, attempts[1]!];
    Object.assign(a, {canonicalCourseId:pick(rng, OLD), ledger:'EARNED', recognition:'RECOGNIZED', term:'2024-1'});
    Object.assign(b, {canonicalCourseId:pick(rng, NEW), ledger:'EARNED', recognition:'RECOGNIZED', term:'2025-1',
      supersedesAttemptToken:a.attemptToken, retakeApprovalRef:`SYN-RETAKE-${b.attemptToken}`});
  }
  return {attempts, rules};
}

/** 계약 본문에서 가져온 S1~S4 조건을 구현과 독립적으로 확인한다. */
function referenceApply(c:Case) {
  const applied:{attemptToken:string; fromCourseId:string; toCourseId:string; ruleId:string}[] = [];
  const held:{attemptToken:string; courseId:string; ruleIds:string[]; reason:'RULE_NOT_APPROVED'|'AMBIGUOUS'}[] = [];
  const attempts = c.attempts.map(a => {
    const naming = c.rules.filter(r => r.fromCourseIds.includes(a.canonicalCourseId));
    if (naming.length === 0) return {...a};
    const ruleIds = naming.map(r => r.id).sort();
    if (new Set(naming.map(r => r.toCourseId)).size > 1) {
      held.push({attemptToken:a.attemptToken, courseId:a.canonicalCourseId, ruleIds, reason:'AMBIGUOUS'});
      return {...a};
    }
    const approvedIds = naming.filter(r => r.state === 'APPROVED').map(r => r.id).sort();
    if (approvedIds.length === 0) {
      held.push({attemptToken:a.attemptToken, courseId:a.canonicalCourseId, ruleIds, reason:'RULE_NOT_APPROVED'});
      return {...a};
    }
    applied.push({attemptToken:a.attemptToken, fromCourseId:a.canonicalCourseId, toCourseId:naming[0]!.toCourseId, ruleId:approvedIds[0]!});
    return {...a, canonicalCourseId:naming[0]!.toCourseId};
  });
  return {state:held.length > 0 ? 'NEEDS_REVIEW' : 'APPLIED', attempts, applied, held};
}

const requirementsFor = (courseIds:readonly string[]):LedgerRequirement[] => [
  {id:'SYN-REQ-TOTAL', kind:'CREDIT_TOTAL', requiredCreditUnits:12, evidenceRefs:['EV-SYN-REQ']},
  {id:'SYN-REQ-AREA', kind:'CATEGORY_MINIMUM', areaId:'SYN-AREA-A', requiredCreditUnits:6, evidenceRefs:['EV-SYN-REQ']},
  ...courseIds.map((id, i) => ({id:`SYN-REQ-C${i}`, kind:'REQUIRED_COURSE' as const, canonicalCourseId:id, evidenceRefs:['EV-SYN-REQ']})),
];
const ledger = (attempts:readonly LedgerAttempt[]) => buildAcademicLedger({asOf:AS_OF, rulePackVersion:'SYN-PACK', rulePackState:'APPROVED',
  attempts, requirements:requirementsFor(COURSES)});

// 실행기: 시드 선택, 실패 사례 축소, 재현 가능한 보고서 생성.

const CODE_SHA = createHash('sha256').update(readFileSync(new URL('./course-equivalence.ts', import.meta.url))).digest('hex').slice(0, 12);
const hash = (v:unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 12);
/** 기본 탐색 실행이다. 범위 검사와 보고서 자체 검사는 항상 이 시드들을 사용한다. */
const EXPLORATION_SEEDS:readonly number[] = Array.from({length:300}, (_, i) => 20261105 + i);
/** 재현 모드는 요청한 정확히 하나의 시드만 검사하며 안전한 정수가 아니면 거부한다. */
export function seedsFrom(env:Readonly<Record<string, string|undefined>>):readonly number[] {
  const raw = env.SAME_COURSE_PROP_SEED;
  if (raw === undefined) return EXPLORATION_SEEDS;
  const seed = Number(raw);
  if (!/^-?\d+$/.test(raw.trim()) || !Number.isSafeInteger(seed)) throw new TypeError(`SAME_COURSE_PROP_SEED must be an integer, got ${raw}`);
  return [seed];
}
const SEEDS = seedsFrom(process.env);

function shrink(c:Case, fails:(x:Case) => boolean):Case {
  let cur = c;
  for (let changed = true; changed;) {
    changed = false;
    for (const key of ['attempts', 'rules'] as const) {
      for (let i = 0; i < cur[key].length; i++) {
        const next = {...cur, [key]:cur[key].filter((_, j) => j !== i)} as Case;
        // 재수강 연결 대상 토큰이 남아 있어야 한다. 대상이 사라지면 시험 사례의 의미가 달라진다.
        if (key === 'attempts') next.attempts = next.attempts.map(a =>
          a.supersedesAttemptToken && !next.attempts.some(b => b.attemptToken === a.supersedesAttemptToken)
            ? (({supersedesAttemptToken:_s, retakeApprovalRef:_r, ...rest}) => rest)(a) as LedgerAttempt : a);
        let failing = false;
        try { failing = fails(next); } catch { failing = false; }
        if (failing) { cur = next; changed = true; i--; }
      }
    }
  }
  return cur;
}

function forAll(name:string, size:number, prop:(c:Case, rng:Rng) => string|null, gen:(rng:Rng, size:number) => Case = genCase,
  seeds:readonly number[] = SEEDS):void {
  for (const seed of seeds) {
    const c = gen(mulberry32(seed), size);
    const check = (x:Case) => prop(x, mulberry32(seed ^ 0x5bd1e995));
    let problem:string|null;
    try { problem = check(c); } catch (error) { problem = `threw: ${(error as Error).message}`; }
    if (problem === null) continue;
    const small = shrink(c, x => check(x) !== null);
    let final = problem;
    try { final = check(small) ?? problem; } catch (error) { final = `threw: ${(error as Error).message}`; }
    throw new Error([`property "${name}" failed: ${final}`,
      `seed=${seed} inputHash=${hash(c)} ruleHash=${hash(small.rules)} shrunkHash=${hash(small)} codeSha=${CODE_SHA}`,
      `repro: SAME_COURSE_PROP_SEED=${seed} npx vitest run packages/core/src/academics/course-equivalence.property.test.ts`,
      `shrunk case: ${JSON.stringify(small)}`].join('\n'));
  }
}
const same = (a:unknown, b:unknown) => JSON.stringify(a) === JSON.stringify(b);
const byToken = (list:readonly {attemptToken:string}[]) => [...list].sort((a, b) => (a.attemptToken < b.attemptToken ? -1 : 1));

// ---------------------------------------------------------------------------------------------

describe('applySameCourseRules + ledger properties (#202)', () => {
  it('the generator reaches every branch it should exercise', () => {
    // 개별 사례가 아니라 생성기의 속성이므로 단일 시드 재현 모드가 아닌 전체 탐색 시드에서 항상 측정한다(#218).
    const seen = {applied:0, ambiguous:0, notApproved:0, untouched:0, renameRetake:0};
    for (const seed of EXPLORATION_SEEDS) {
      const c = genCase(mulberry32(seed), 8);
      const r = applySameCourseRules(c.attempts, c.rules);
      seen.applied += r.applied.length > 0 ? 1 : 0;
      seen.ambiguous += r.held.some(h => h.reason === 'AMBIGUOUS') ? 1 : 0;
      seen.notApproved += r.held.some(h => h.reason === 'RULE_NOT_APPROVED') ? 1 : 0;
      seen.untouched += r.applied.length === 0 && r.held.length === 0 ? 1 : 0;
      seen.renameRetake += c.attempts.some(a => a.supersedesAttemptToken) && r.applied.some(x => x.attemptToken === 'SYN-T0') ? 1 : 0;
    }
    for (const [branch, count] of Object.entries(seen)) expect(count, branch).toBeGreaterThanOrEqual(15);
  });

  it('P1 matches the reference model (S1-S4)', () => {
    forAll('reference model', 8, c => {
      const got = applySameCourseRules(c.attempts, c.rules), want = referenceApply(c);
      if (got.state !== want.state) return `state: model=${want.state} implementation=${got.state}`;
      for (const key of ['attempts', 'applied', 'held'] as const) {
        if (!same(got[key], want[key])) return `${key}: model=${JSON.stringify(want[key])} implementation=${JSON.stringify(got[key])}`;
      }
      return null;
    });
  });

  // 전제 조건 없음.
  it('P2 never modifies its inputs', () => {
    forAll('inputs untouched', 8, c => {
      const before = JSON.stringify(c);
      const out = applySameCourseRules(c.attempts, c.rules);
      out.attempts.forEach(a => { (a.areaIds as string[]).push('SYN-MUTATED'); a.canonicalCourseId = 'SYN-MUTATED'; });
      return JSON.stringify(c) === before ? null : 'input changed';
    });
  });

  // 전제 조건 없음. 결과는 수강 시도 순서를 따르지만 각 시도의 판정은 입력 순서와 무관하다.
  it('P3 per-attempt results do not depend on the order of attempts or rules', () => {
    forAll('order independence', 8, (c, rng) => {
      const a = applySameCourseRules(c.attempts, c.rules);
      const b = applySameCourseRules(shuffle(rng, c.attempts), shuffle(rng, c.rules));
      for (const key of ['attempts', 'applied', 'held'] as const) {
        if (!same(byToken(a[key]), byToken(b[key]))) return `${key} depends on order`;
      }
      return a.state === b.state ? null : 'state depends on order';
    });
  });

  // 전제는 S1~S4(승인된 사슬 없음)다. 승인 규칙의 목표 과목은 다른 승인 규칙의 이전 과목이 될 수 없다.
  it('P4 a second application changes nothing more', () => {
    forAll('idempotent', 8, c => {
      const once = applySameCourseRules(c.attempts, c.rules);
      const twice = applySameCourseRules(once.attempts, c.rules);
      if (twice.applied.length > 0) return `re-applied ${JSON.stringify(twice.applied)}`;
      if (!same(twice.attempts, once.attempts)) return 'attempts changed on the second run';
      return same(twice.held, once.held) ? null : 'held changed on the second run';
    });
  });

  // 전제: 승인된 규칙이 하나도 없다.
  it('P5 unapproved rules leave every ledger figure as it was and hold every attempt they name', () => {
    forAll('unapproved is a no-op', 8, c => {
      const rules = c.rules.map(r => ({...r, state:r.state === 'APPROVED' ? 'DRAFT' as const : r.state}));
      const out = applySameCourseRules(c.attempts, rules);
      if (!same(ledger(out.attempts), ledger(c.attempts))) return 'ledger changed';
      const named = c.attempts.filter(a => rules.some(r => r.fromCourseIds.includes(a.canonicalCourseId))).map(a => a.attemptToken).sort();
      const held = out.held.map(h => h.attemptToken).sort();
      if (!same(held, named)) return `held ${JSON.stringify(held)} but rules name ${JSON.stringify(named)}`;
      return out.applied.length === 0 ? null : 'applied an unapproved rule';
    });
  });

  // 전제: S1~S4. 학점 원장에는 기준 모델이 변경한 성적표의 모든 필드를 그대로 전달한다.
  it('P6 the ledger after the rules equals the ledger of the model-rewritten transcript', () => {
    forAll('ledger composition', 8, c => {
      const got = ledger(applySameCourseRules(c.attempts, c.rules).attempts);
      const want = ledger(referenceApply(c).attempts);
      return same(got, want) ? null : `ledger differs: ${JSON.stringify(got.requirements)} vs ${JSON.stringify(want.requirements)}`;
    });
  });

  // 전제: 유일하고 모호하지 않은 이전→새 과목 승인 규칙과 한 번의 이전 과목 취득 기록이 있다.
  // 이전 학기의 EARNED·RECOGNIZED이고 재수강 연결이 없으면 새 과목의 필수 요건을 충족한다.
  it('P7 one earned old course meets the requirement on its new course', () => {
    const gen = (rng:Rng):Case => {
      const from = pick(rng, OLD), to = pick(rng, NEW);
      const filler = Array.from({length:Math.floor(rng() * 4)}, (_, i):LedgerAttempt => ({attemptToken:`SYN-F${i}`,
        canonicalCourseId:pick(rng, OTHER), creditUnits:6, ledger:'EARNED', areaIds:[], recognition:'RECOGNIZED', term:'2024-2'}));
      return {rules:[{id:'SYN-RULE-ONLY', fromCourseIds:[from], toCourseId:to, state:'APPROVED', evidenceRefs:['EV-SYN-ONLY']}],
        attempts:[...filler, {attemptToken:'SYN-OLD-ATTEMPT', canonicalCourseId:from, creditUnits:pick(rng, [4, 6]), ledger:'EARNED',
          areaIds:[], recognition:'RECOGNIZED', term:pick(rng, TERMS.slice(0, 4))}]};
    };
    forAll('old course meets new requirement', 0, c => {
      const to = c.rules[0]!.toCourseId;
      const before = ledger(c.attempts).requirements.find(r => r.requirementId === `SYN-REQ-C${COURSES.indexOf(to)}`)!;
      const after = ledger(applySameCourseRules(c.attempts, c.rules).attempts).requirements
        .find(r => r.requirementId === `SYN-REQ-C${COURSES.indexOf(to)}`)!;
      if (before.state !== 'UNSATISFIED') return `before the rule the new course row is ${before.state}`;
      return after.state === 'SATISFIED' ? null : `after the rule the new course row is ${after.state}`;
    }, gen);
  });

  // 전제: 이전 과목을 종료 학기에 취득하고 더 나중 학기에 새 과목을 취득했으며 이전 시도에 대한 승인된 재수강 링크가 있다.
  // 그 외 해당 두 과목 기록은 없고 이전→새 과목 승인 규칙은 하나다.
  it('P8 an approved retake across the rename is recognized only after the rule', () => {
    const gen = (rng:Rng):Case => {
      const from = pick(rng, OLD), to = pick(rng, NEW), i = Math.floor(rng() * 3);
      return {rules:[{id:'SYN-RULE-ONLY', fromCourseIds:[from], toCourseId:to, state:'APPROVED', evidenceRefs:['EV-SYN-ONLY']}],
        attempts:[
          {attemptToken:'SYN-FIRST', canonicalCourseId:from, creditUnits:6, ledger:'EARNED', areaIds:[], recognition:'RECOGNIZED', term:TERMS[i]!},
          {attemptToken:'SYN-RETAKE', canonicalCourseId:to, creditUnits:6, ledger:'EARNED', areaIds:[], recognition:'RECOGNIZED', term:TERMS[i + 1]!,
            supersedesAttemptToken:'SYN-FIRST', retakeApprovalRef:'SYN-RETAKE-APPROVAL'},
        ]};
    };
    forAll('rename retake', 0, c => {
      const reason = (out:ReturnType<typeof ledger>, token:string) => out.excludedAttempts.find(e => e.attemptToken === token)?.reason;
      const before = ledger(c.attempts), after = ledger(applySameCourseRules(c.attempts, c.rules).attempts);
      if (reason(before, 'SYN-RETAKE') !== 'NEEDS_REVIEW') return `before: retake is ${reason(before, 'SYN-RETAKE')}`;
      if (reason(after, 'SYN-FIRST') !== 'RETAKE_SUPERSEDED') return `after: first attempt is ${reason(after, 'SYN-FIRST')}`;
      return reason(after, 'SYN-RETAKE') === undefined ? null : `after: retake is ${reason(after, 'SYN-RETAKE')}`;
    }, gen);
  });

  // 전제: 어떤 승인 규칙의 목표 과목이 다른 승인 규칙의 이전 과목이 되는 연쇄가 존재한다.
  it('P9 approved chains are refused; the same chain with one rule unapproved is accepted', () => {
    forAll('chains', 6, (c, rng) => {
      const [a, b] = [pick(rng, OLD), pick(rng, NEW)];
      const c2 = pick(rng, OTHER);
      const chain:SameCourseRule[] = [
        {id:'SYN-CHAIN-1', fromCourseIds:[a], toCourseId:b, state:'APPROVED', evidenceRefs:['EV-SYN-C1']},
        {id:'SYN-CHAIN-2', fromCourseIds:[b], toCourseId:c2, state:'APPROVED', evidenceRefs:['EV-SYN-C2']},
      ];
      let refused = false;
      try { applySameCourseRules(c.attempts, shuffle(rng, chain)); } catch { refused = true; }
      if (!refused) return 'an approved chain was accepted';
      applySameCourseRules(c.attempts, [chain[0]!, {...chain[1]!, state:'DRAFT'}]);
      return null;
    });
  });

  it('a failure report carries the seed, hashes, code SHA, repro command and a shrunk case that still fails', () => {
    // 의도적으로 틀리게 만든 '수강 시도는 절대 다시 쓰이지 않는다' 속성이다.
    // 탐색·축소 보고 기능을 검증하며 단일 시드 재현 모드에서도 이 검사를 생략하지 않는다.
    let message = '';
    try {
      forAll('demo: nothing rewritten', 8, c => (applySameCourseRules(c.attempts, c.rules).applied.length > 0 ? 'rewritten' : null),
        genCase, EXPLORATION_SEEDS);
    } catch (error) { message = (error as Error).message; }
    expect(message).toMatch(/^property "demo: nothing rewritten" failed: rewritten$/m);
    const seed = Number(/seed=(\d+)/.exec(message)![1]);
    expect(message).toContain(`inputHash=${hash(genCase(mulberry32(seed), 8))}`);
    expect(message).toContain(`codeSha=${CODE_SHA}`);
    expect(message).toContain(`repro: SAME_COURSE_PROP_SEED=${seed} npx vitest run`);
    const small = JSON.parse(/^shrunk case: (.*)$/m.exec(message)![1]!) as Case;
    expect(message).toContain(`ruleHash=${hash(small.rules)} shrunkHash=${hash(small)}`);
    // 최소 반례는 한 수강 시도와 한 승인 규칙뿐인데도 실패한다.
    expect([small.attempts.length, small.rules.length]).toEqual([1, 1]);
    expect(applySameCourseRules(small.attempts, small.rules).applied).toHaveLength(1);
    // 재현 시드 하나만으로 동일 실패 사례와 동일 축소 반례를 다시 만들 수 있다.
    let again = '';
    try {
      forAll('demo: nothing rewritten', 8, c => (applySameCourseRules(c.attempts, c.rules).applied.length > 0 ? 'rewritten' : null),
        genCase, seedsFrom({SAME_COURSE_PROP_SEED:String(seed)}));
    } catch (error) { again = (error as Error).message; }
    expect(again).toBe(message);
  });

  it('repro mode resolves exactly the requested seed and refuses anything else', () => {
    expect(seedsFrom({})).toBe(EXPLORATION_SEEDS);
    expect(seedsFrom({SAME_COURSE_PROP_SEED:'20261234'})).toEqual([20261234]);
    expect(seedsFrom({SAME_COURSE_PROP_SEED:'-7'})).toEqual([-7]);
    for (const bad of ['', 'abc', '1.5', '1e3', '9007199254740993']) {
      expect(() => seedsFrom({SAME_COURSE_PROP_SEED:bad}), bad).toThrow(/must be an integer/);
    }
  });

  it('the reference model agrees with hand-checked cases', () => {
    const at = (attemptToken:string, canonicalCourseId:string):LedgerAttempt =>
      ({attemptToken, canonicalCourseId, creditUnits:6, ledger:'EARNED', areaIds:[], recognition:'RECOGNIZED', term:'2025-1'});
    const rule = (id:string, from:string[], to:string, state:SameCourseRule['state'] = 'APPROVED'):SameCourseRule =>
      ({id, fromCourseIds:from, toCourseId:to, state, evidenceRefs:['EV-SYN-H']});
    // OLD1→NEW1은 두 승인 규칙 중 ID가 작은 것을 택한다.
    // OLD2는 NEW1·NEW2 목표가 충돌해 AMBIGUOUS, OLD3은 초안만 있어 보류하며 OTHER1에는 규칙이 없다.
    const c:Case = {attempts:[at('SYN-A', 'SYN-OLD1'), at('SYN-B', 'SYN-OLD2'), at('SYN-C', 'SYN-OLD3'), at('SYN-D', 'SYN-OTHER1')],
      rules:[rule('SYN-R2', ['SYN-OLD1'], 'SYN-NEW1'), rule('SYN-R1', ['SYN-OLD1', 'SYN-OLD2'], 'SYN-NEW1'),
        rule('SYN-R3', ['SYN-OLD2'], 'SYN-NEW2', 'DRAFT'), rule('SYN-R4', ['SYN-OLD3'], 'SYN-NEW2', 'NEEDS_REVIEW')]};
    const want = {
      state:'NEEDS_REVIEW',
      attempts:[{...at('SYN-A', 'SYN-NEW1')}, at('SYN-B', 'SYN-OLD2'), at('SYN-C', 'SYN-OLD3'), at('SYN-D', 'SYN-OTHER1')],
      applied:[{attemptToken:'SYN-A', fromCourseId:'SYN-OLD1', toCourseId:'SYN-NEW1', ruleId:'SYN-R1'}],
      held:[{attemptToken:'SYN-B', courseId:'SYN-OLD2', ruleIds:['SYN-R1', 'SYN-R3'], reason:'AMBIGUOUS'},
        {attemptToken:'SYN-C', courseId:'SYN-OLD3', ruleIds:['SYN-R4'], reason:'RULE_NOT_APPROVED'}],
    };
    expect(referenceApply(c)).toEqual(want);
    expect(applySameCourseRules(c.attempts, c.rules)).toEqual(want);
  });
});
