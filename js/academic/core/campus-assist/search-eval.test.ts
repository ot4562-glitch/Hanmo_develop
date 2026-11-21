import {describe,expect,it} from 'vitest';
import {FAQ_EVAL_CASES} from './faq-eval.fixtures.js';
import {
  assignFamilySplit,checkSearchGate,evaluateSearchRun,percentileNearestRank,validateSearchEvalSplit,
  type SearchEvalCase,type SearchEvalRun,
} from './search-eval.js';

// 모든 사례는 SYNTHETIC 또는 테스트용으로 HUMAN_REVIEWED 라벨만 붙인 가상 자료다. 실제 검색 품질 수치가 아니다.
const kase=(caseId:string,patch:Partial<SearchEvalCase>={}):SearchEvalCase=>({
  caseId,query:'가상 질의 '+caseId,intent:'FAQ',subsets:['PLAIN'],relevant:['FAQ:'+caseId],
  documentFamily:'FAM-'+caseId,split:'HOLDOUT',provenance:'SYNTHETIC',...patch,
});
const run=(caseId:string,patch:Partial<SearchEvalRun>={}):SearchEvalRun=>({
  caseId,ranked:['FAQ:'+caseId],predictedIntent:'FAQ',abstained:false,latencyMs:10,...patch,
});

describe('#40 split rules',()=>{
  it('assigns the same family to the same split deterministically, and the seed changes the assignment',()=>{
    const fams=Array.from({length:200},(_,i)=>'FAM-'+i);
    const a=fams.map(f=>assignFamilySplit(f,'seed-1'));
    expect(fams.map(f=>assignFamilySplit(f,'seed-1'))).toEqual(a);
    expect(fams.map(f=>assignFamilySplit(f,'seed-2'))).not.toEqual(a);
    const holdout=a.filter(s=>s==='HOLDOUT').length/a.length;
    expect(holdout).toBeGreaterThan(0.15);expect(holdout).toBeLessThan(0.45);
    expect(()=>assignFamilySplit('F','s',0)).toThrow();expect(()=>assignFamilySplit('F','s',1)).toThrow();
  });
  it('accepts a family-disjoint split',()=>{
    expect(validateSearchEvalSplit([kase('A',{split:'TUNE'}),kase('B')])).toEqual([]);
  });
  it('reports a document family appearing in both TUNE and HOLDOUT',()=>{
    const issues=validateSearchEvalSplit([kase('A',{split:'TUNE',documentFamily:'F1'}),kase('B',{documentFamily:'F1'})]);
    expect(issues).toContainEqual({kind:'FAMILY_LEAK',detail:'F1'});
  });
  it('reports the same relevant citation in both splits even under different family labels',()=>{
    const issues=validateSearchEvalSplit([kase('A',{split:'TUNE',relevant:['FAQ:X']}),kase('B',{relevant:['FAQ:X']})]);
    expect(issues).toContainEqual({kind:'RELEVANT_SHARED_ACROSS_SPLITS',detail:'FAQ:X'});
  });
  it('reports duplicate case IDs, empty holdout and mixed provenance',()=>{
    const kinds=validateSearchEvalSplit([kase('A',{split:'TUNE'}),kase('A',{split:'TUNE',provenance:'HUMAN_REVIEWED'})]).map(i=>i.kind);
    expect(kinds).toEqual(expect.arrayContaining(['DUPLICATE_CASE','EMPTY_HOLDOUT','MIXED_PROVENANCE']));
  });
  it('rejects malformed cases (unanswerable with an answer, duplicate relevant ids)',()=>{
    expect(()=>validateSearchEvalSplit([kase('A',{subsets:['UNANSWERABLE']})])).toThrow();
    expect(()=>validateSearchEvalSplit([kase('A',{relevant:['X','X']})])).toThrow();
  });
  it('the existing synthetic FAQ regression set (#341) is split per question, so it leaks families across splits',()=>{
    // 기존 회귀 세트는 기준선 회귀용이다. 이 결과는 그것을 #40 홀드아웃으로 쓰면 안 된다는 근거로 고정한다.
    const cases=FAQ_EVAL_CASES.filter(c=>c.expect).map((c,i)=>kase('SYN-'+i,{query:c.question,
      relevant:[c.expect!],documentFamily:c.expect!,split:c.split==='TUNED'?'TUNE':'HOLDOUT'}));
    expect(validateSearchEvalSplit(cases).some(i=>i.kind==='FAMILY_LEAK')).toBe(true);
  });
});

describe('#40 metrics',()=>{
  it('computes Recall@5 and MRR by hand-checked values',()=>{
    const cases=[kase('A',{relevant:['a1','a2']}),kase('B'),kase('C')];
    const runs=[
      run('A',{ranked:['x','a1','y','z','w','a2']}), // a1 rank2, a2 rank6 → recall 0.5, rr 0.5
      run('B',{ranked:['FAQ:B']}),                    // recall 1, rr 1
      run('C',{ranked:['x','y']}),                    // recall 0, rr 0
    ];
    const r=evaluateSearchRun(cases,runs);
    expect(r.overall).toEqual({cases:3,recallAt5:0.5,mrr:0.5});
    expect(r.missedCaseIds).toEqual(['C']);
  });
  it('an abstained answerable case counts as a miss even if ranked results were attached',()=>{
    const r=evaluateSearchRun([kase('A')],[run('A',{abstained:true})]);
    expect(r.overall.recallAt5).toBe(0);expect(r.missedCaseIds).toEqual(['A']);
  });
  it('splits metrics by subset and domain and only uses the requested split',()=>{
    const cases=[kase('P'),kase('T',{subsets:['TYPO'],intent:'NOTICE'}),kase('X',{split:'TUNE',documentFamily:'other'})];
    const runs=[run('P'),run('T',{ranked:['nope'],predictedIntent:'NOTICE'}),run('X')];
    const r=evaluateSearchRun(cases,runs);
    expect(r.caseCount).toBe(2);
    expect(r.bySubset.PLAIN?.recallAt5).toBe(1);expect(r.bySubset.TYPO?.recallAt5).toBe(0);
    expect(r.byDomain.NOTICE?.recallAt5).toBe(0);expect(r.byDomain.FAQ?.recallAt5).toBe(1);
    expect(evaluateSearchRun(cases,runs,'TUNE').caseCount).toBe(1);
  });
  it('computes intent macro-F1 and the confusion matrix',()=>{
    const cases=[kase('A',{intent:'FAQ'}),kase('B',{intent:'FAQ'}),kase('C',{intent:'NOTICE'}),kase('D',{intent:'COURSE'})];
    const runs=[run('A'),run('B',{predictedIntent:'NOTICE'}),run('C',{predictedIntent:'NOTICE'}),run('D',{predictedIntent:'COURSE'})];
    const r=evaluateSearchRun(cases,runs);
    // FAQ P=1 R=0.5 F1=2/3, NOTICE P=0.5 R=1 F1=2/3, COURSE F1=1 → macro 7/9
    expect(r.intent.macroF1).toBeCloseTo(7/9,5);
    expect(r.intent.confusion.FAQ.NOTICE).toBe(1);
    expect(r.intent.perLabel.UNKNOWN).toBeUndefined();
  });
  it('measures no-answer false positives and abstention precision/recall',()=>{
    const none=(id:string)=>kase(id,{relevant:[],subsets:['UNANSWERABLE']});
    const cases=[none('N1'),none('N2'),kase('A')];
    const runs=[run('N1',{abstained:true,ranked:[]}),run('N2',{ranked:['junk']}),run('A',{abstained:true})];
    const r=evaluateSearchRun(cases,runs);
    expect(r.noAnswerFalsePositiveRate).toBe(0.5);
    expect(r.abstention).toEqual({precision:0.5,recall:0.5});
    expect(r.overall.cases).toBe(1);
  });
  it('p95 uses the nearest-rank method',()=>{
    expect(percentileNearestRank([],0.95)).toBeNull();
    expect(percentileNearestRank(Array.from({length:20},(_,i)=>i+1),0.95)).toBe(19);
    expect(percentileNearestRank(Array.from({length:100},(_,i)=>i+1),0.95)).toBe(95);
    expect(percentileNearestRank([5,1,500],0.95)).toBe(500);
  });
  it('measurement errors throw instead of silently dropping cases',()=>{
    expect(()=>evaluateSearchRun([kase('A')],[])).toThrow(/Missing run/);
    expect(()=>evaluateSearchRun([kase('A')],[run('A'),run('A')])).toThrow(/Duplicate/);
    expect(()=>evaluateSearchRun([kase('A')],[run('A'),run('Z')])).toThrow(/unknown case/);
    expect(()=>evaluateSearchRun([kase('A',{split:'TUNE'})],[run('A')])).toThrow(/No cases/);
    expect(()=>evaluateSearchRun([kase('A'),kase('B',{provenance:'HUMAN_REVIEWED'})],[run('A'),run('B')])).toThrow(/Mixed/);
  });
});

describe('#40 gate',()=>{
  const reviewed=(id:string,p:Partial<SearchEvalCase>={})=>kase(id,{provenance:'HUMAN_REVIEWED',...p});
  const passingCases=[reviewed('P1'),reviewed('T1',{subsets:['TYPO']}),reviewed('S1',{subsets:['SPACING']})];
  const passingRuns=passingCases.map(c=>run(c.caseId));
  it('a synthetic set never yields RELEASE_PASS even when every number meets the target',()=>{
    const cases=passingCases.map(c=>({...c,provenance:'SYNTHETIC' as const}));
    const g=checkSearchGate(evaluateSearchRun(cases,passingRuns),[]);
    expect(g.status).toBe('SYNTHETIC_ONLY');
    expect(g.checks.recallAt5.status).toBe('PASS');
  });
  it('a reviewed holdout meeting every target passes',()=>{
    expect(checkSearchGate(evaluateSearchRun(passingCases,passingRuns),[]).status).toBe('RELEASE_PASS');
  });
  it('a typo subset dropping more than 5 points blocks release even when the average looks fine',()=>{
    const cases=[...Array.from({length:19},(_,i)=>reviewed('P'+i)),
      ...Array.from({length:10},(_,i)=>reviewed('T'+i,{subsets:['TYPO']})),reviewed('S1',{subsets:['SPACING']})];
    const runs=cases.map(c=>run(c.caseId,c.caseId==='T0'?{ranked:['miss']}:{}));
    const g=checkSearchGate(evaluateSearchRun(cases,runs),[]);
    expect(g.checks.recallAt5.status).toBe('PASS'); // 29/30
    expect(g.checks.typoDrop).toMatchObject({status:'FAIL',value:0.1});
    expect(g.status).toBe('RELEASE_BLOCKED');
  });
  it('a missing typo or spacing subset is NOT_EVALUABLE and blocks release',()=>{
    const g=checkSearchGate(evaluateSearchRun([reviewed('P1')],[run('P1')]),[]);
    expect(g.checks.typoDrop.status).toBe('NOT_EVALUABLE');
    expect(g.status).toBe('RELEASE_BLOCKED');
  });
  it('one safety violation, slow p95, a split leak, or evaluating on TUNE each block release',()=>{
    const evalWith=(runs:SearchEvalRun[])=>evaluateSearchRun(passingCases,runs);
    const unsafe=passingRuns.map((r,i)=>i?r:{...r,safetyViolations:['REVOKED_EXPOSED' as const]});
    expect(checkSearchGate(evalWith(unsafe),[]).checks.safety.status).toBe('FAIL');
    const slow=passingRuns.map(r=>({...r,latencyMs:301}));
    expect(checkSearchGate(evalWith(slow),[]).checks.p95Latency.status).toBe('FAIL');
    const leak=checkSearchGate(evalWith(passingRuns),[{kind:'FAMILY_LEAK',detail:'F'}]);
    expect(leak.status).toBe('RELEASE_BLOCKED');
    const tune=passingCases.map(c=>({...c,split:'TUNE' as const}));
    expect(checkSearchGate(evaluateSearchRun(tune,passingRuns,'TUNE'),[]).status).toBe('RELEASE_BLOCKED');
  });
});
