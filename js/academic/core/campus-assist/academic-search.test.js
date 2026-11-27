// @ts-check
import {describe,expect,it} from 'vitest';
import * as academicSearch from './academic-search.js';
import {normalizeAcademicQuery} from './academic-search.js';

// 질의 문자열은 모두 테스트용 예시이며 실제 학생 검색 기록이 아니다.
describe('#53 query normalization',()=>{
  it('keeps the original query and adds typo, spacing and abbreviation variants',()=>{
    const q=normalizeAcademicQuery('  수강신철   일정 ');
    expect(q.original).toBe('  수강신철   일정 ');
    expect(q.variants[0]).toBe('수강신철 일정');
    expect(q.variants).toContain('수강신청 일정');
    expect(q.corrections).toContainEqual({from:'수강신철',to:'수강신청',kind:'TYPO'});
    expect(normalizeAcademicQuery('이중 전공 신청').corrections).toContainEqual({from:'이중 전공',to:'이중전공',kind:'SPACING'});
    expect(normalizeAcademicQuery('복전 신청').variants.some(v=>v.includes('이중전공'))).toBe(true);
  });
  it('NFKC-normalizes full-width characters',()=>{
    expect(normalizeAcademicQuery('ＳＹＮ１０１').normalized).toBe('syn101');
  });
  it('never corrects code-like tokens, cohorts, dates or numbers',()=>{
    const q=normalizeAcademicQuery('SYN101 23학번 2026.3.2 3.5학점');
    expect(q.protectedTokens.map(t=>t.kind)).toEqual(['COURSE_CODE','COHORT','DATE','NUMBER']);
    for(const v of q.variants)expect(v).toContain('syn101');
    expect(q.corrections).toEqual([]);
  });
  it('does not misread a full word as an abbreviation (부전공 is not 부전+공)',()=>{
    expect(normalizeAcademicQuery('부전공 신청').corrections).toEqual([]);
  });
  it('rejects empty or oversized queries',()=>{
    expect(()=>normalizeAcademicQuery('   ')).toThrow(RangeError);
    expect(()=>normalizeAcademicQuery('가'.repeat(201))).toThrow(RangeError);
  });
});

describe('#53 removed paths stay removed (written reply 2026-11-23)',()=>{
  it('no FAQ, instructor/section or per-student applicability search is exported',()=>{
    // 학사 FAQ 응답·교수명·분반·학생별 적용 판정 경로가 다시 생기지 않도록 공개 API를 고정한다.
    expect(Object.keys(academicSearch).sort()).toEqual(['normalizeAcademicQuery']);
  });
});
