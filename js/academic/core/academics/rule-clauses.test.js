// @ts-check
import {describe,expect,it} from 'vitest';
import {AcademicRulePackVNextSchema,verifyAcademicSourceCoverageVNext} from '../../contracts/index.js';
import {syntheticAcademicPack} from '../../fixtures/academic-133.js';
import {checkRuleClaims,clauseModality,crossCheckRequirementLinks,extractRuleClauses} from './rule-clauses.js';

// 아래 학칙 문장은 모두 SYNTHETIC 가상 조문이다. 실제 한국외대 학칙을 옮기지 않았으며 학점 수치도 지어낸 값이다.
const TEXT=[
  '가상 학사 규정',
  '제1조(목적) 이 규정은 가상 대학의 졸업 요건을 정한다.',
  '제2조(적용 범위) 이 규정은 2024학년도 이후 입학생에게 적용한다.',
  '제3조(졸업 학점) ① 학생은 가상 130학점 이상을 취득하여야 한다. 다만, 편입생은 가상 65학점 이상으로 한다.',
  '② 전공 학점은 다음 각 호와 같다.',
  '  1. 주전공 가상 54학점 이상',
  '  2. 이중전공 가상 42학점 이상',
  '※ 계절학기 학점은 가상 6학점까지 인정한다.',
  '제4조(졸업 신청) 졸업 예정자는 가상 졸업신청서를 제출하여야 한다.',
  '제5조(면제) 외국어 인증은 외국인 학생에게 면제한다.',
  '제6조(제한) 같은 과목은 두 번 이상 재수강할 수 없다.',
  '부칙',
  '제1조(시행일) 이 규정은 2026년 3월 1일부터 시행한다.',
].join('\n');
const inv=()=>extractRuleClauses({documentId:'SYN-RULE',version:'v1',text:TEXT});
/** @param {string} id */
const clause=id=>inv().clauses.find(c=>c.clauseId===id);

describe('#47 clause inventory from source text',()=>{
  it('splits articles, paragraphs, items, provisos and footnotes with stable IDs',()=>{
    expect(inv().clauses.map(c=>[c.clauseId,c.kind])).toEqual([
      ['SYN-RULE:A1','RULE'],
      ['SYN-RULE:A2','SCOPE'],
      ['SYN-RULE:A3:P1','RULE'],
      ['SYN-RULE:A3:P1:S1','EXCEPTION'],
      ['SYN-RULE:A3:P2','RULE'],
      ['SYN-RULE:A3:P2:I1','RULE'],
      ['SYN-RULE:A3:P2:I2','RULE'],
      ['SYN-RULE:A3','FOOTNOTE'],
      ['SYN-RULE:A4','PROCEDURE'],
      ['SYN-RULE:A5','RULE'],
      ['SYN-RULE:A6','RULE'],
      ['SYN-RULE:AADD.1','RULE'],
    ]);
    expect(inv().status).toBe('READY');
  });
  it('every span reference points to the exact source substring',()=>{
    for(const c of inv().clauses){
      expect(TEXT.slice(c.start,c.end)).toBe(c.text);
      expect(c.sourceSpanRef).toBe(`SYN-RULE.v1:${c.start}-${c.end}`);
    }
    expect(clause('SYN-RULE:A3:P1:S1')?.text).toBe('다만, 편입생은 가상 65학점 이상으로 한다.');
  });
  it('records numbers with unit and comparator exactly as written',()=>{
    expect(clause('SYN-RULE:A3:P1')?.numbers).toEqual([{value:130,unit:'학점',comparator:'이상',raw:'130학점 이상'}]);
    expect(clause('SYN-RULE:A3:P2:I2')?.numbers[0]).toMatchObject({value:42,unit:'학점'});
  });
  it('classifies obligation, exemption, prohibition and permission',()=>{
    expect(clause('SYN-RULE:A3:P1')?.modality).toBe('OBLIGATION');
    expect(clause('SYN-RULE:A5')?.modality).toBe('EXEMPTION');
    expect(clause('SYN-RULE:A6')?.modality).toBe('PROHIBITION');
    expect(clauseModality('학생은 재수강할 수 있다.')).toBe('PERMISSION');
    expect(clauseModality('학생은 재수강할 수 없다.')).toBe('PROHIBITION');
  });
  it('does not split on in-text references like "제3조에 따라"',()=>{
    const r=extractRuleClauses({documentId:'SYN-R2',version:'v1',text:'제1조(기준) 제3조에 따라 가상 학점을 인정한다.'});
    expect(r.clauses.map(c=>c.clauseId)).toEqual(['SYN-R2:A1']);
  });
  it('the source hash is deterministic and changes with any edit',()=>{
    expect(inv().sourceDocumentSha256).toBe(inv().sourceDocumentSha256);
    expect(extractRuleClauses({documentId:'SYN-RULE',version:'v1',text:TEXT+' '}).sourceDocumentSha256).not.toBe(inv().sourceDocumentSha256);
  });
});

describe('#47 holds instead of guessing',()=>{
  it('text without article structure is not split',()=>{
    const r=extractRuleClauses({documentId:'SYN-R3',version:'v1',text:'가상 안내문입니다. 학생은 130학점을 들어야 합니다.'});
    expect(r).toMatchObject({status:'NEEDS_REVIEW',clauses:[],issues:[{code:'NO_ARTICLE_STRUCTURE',detail:'SYN-R3'}]});
  });
  it('duplicate article numbers and empty articles are flagged',()=>{
    const r=extractRuleClauses({documentId:'SYN-R4',version:'v1',text:'제1조(가) 가상 내용이다.\n제1조(나) 가상 다른 내용이다.\n제2조(빈 조)'});
    expect(r.status).toBe('NEEDS_REVIEW');
    expect(r.issues.map(i=>i.code)).toEqual(['DUPLICATE_ARTICLE','EMPTY_ARTICLE']);
  });
  it('rejects invalid IDs and empty text',()=>{
    expect(()=>extractRuleClauses({documentId:'bad id',version:'v1',text:TEXT})).toThrow(RangeError);
    expect(()=>extractRuleClauses({documentId:'SYN',version:'v1',text:'  '})).toThrow(RangeError);
  });
});

describe('#47 claim checks against the source inventory',()=>{
  it('builds numericCheck from exact value and unit matches',()=>{
    const r=checkRuleClaims(inv(),[
      {claimId:'total',clauseId:'SYN-RULE:A3:P1',value:130,unit:'학점',modality:'OBLIGATION'},
      {claimId:'transfer',clauseId:'SYN-RULE:A3:P1:S1',value:65,unit:'학점'},
      {claimId:'wrong',clauseId:'SYN-RULE:A3:P2:I1',value:56,unit:'학점'},
      {claimId:'ghost',clauseId:'SYN-RULE:A99',value:1},
      {claimId:'flip',clauseId:'SYN-RULE:A6',modality:'PERMISSION'},
    ]);
    expect(r.numericCheck).toEqual({matched:2,total:4});
    expect(r.mismatches).toEqual([
      {claimId:'wrong',reason:'NUMBER_NOT_IN_CLAUSE'},
      {claimId:'ghost',reason:'CLAUSE_NOT_FOUND'},
      {claimId:'flip',reason:'MODALITY_MISMATCH'},
    ]);
  });
  it('cross-checks requirement links in both directions',()=>{
    const r=crossCheckRequirementLinks(inv(),[{requirementId:'TOTAL',clauseIds:['SYN-RULE:A3:P1','SYN-RULE:A3:P1:S1','SYN-RULE:A9']}]);
    expect(r.unknownClauseRefs).toEqual([{requirementId:'TOTAL',clauseId:'SYN-RULE:A9'}]);
    expect(r.unlinkedClauses).toContain('SYN-RULE:A3:P2:I1');
    expect(r.unlinkedClauses).not.toContain('SYN-RULE:A2');
  });
});

describe('#47 the inventory plugs into the existing source coverage check',()=>{
  const trusted=()=>{
    const r=inv();
    return {sourceDocumentSha256:r.sourceDocumentSha256,clauses:r.clauses.map(c=>({clauseId:c.clauseId,kind:c.kind,sourceSpanRef:c.sourceSpanRef}))};
  };
  const packFor=(/** @type {ReturnType<typeof trusted>} */t)=>{
    const base=syntheticAcademicPack();
    return AcademicRulePackVNextSchema.parse({...base,sourceDocumentSha256:t.sourceDocumentSha256,
      validationReport:{...base.validationReport,sourceDocumentSha256:t.sourceDocumentSha256},
      requirements:base.requirements.map(q=>({...q,sourceClauseIds:['SYN-RULE:A3:P1']})),
      clauseInventory:t.clauses.map(c=>({...c,coverage:c.clauseId==='SYN-RULE:A3:P1'
        ?{state:'LINKED',requirementIds:['SYN-TOTAL']}:{state:'NOT_APPLICABLE',reason:'가상 테스트용 비연결 조항',independentlyReviewedBy:'SYN-CHECKER'}}))});
  };
  it('a pack whose clause inventory matches the extracted inventory passes',()=>{
    const t=trusted();
    expect(verifyAcademicSourceCoverageVNext(packFor(t),t)).toBe(true);
  });
  it('a pack that relabels an exception as a rule fails against the extracted inventory',()=>{
    const t=trusted();
    const tampered={...t,clauses:t.clauses.map(c=>c.kind==='EXCEPTION'?{...c,kind:/** @type {const} */('RULE')}:c)};
    expect(verifyAcademicSourceCoverageVNext(packFor(tampered),t)).toBe(false);
  });
});
