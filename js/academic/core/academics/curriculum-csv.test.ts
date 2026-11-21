import {describe,it,expect} from 'vitest';
import {parseLocalCurriculumCsv} from './curriculum-csv.js';
const HEAD='courseCode,courseName,credits,category,major,semester,campus,cohort';
const line=(name='가상 강의',credits='3')=>'SYN010101,'+name+','+credits+',전공,가상학과,2026-2,SEOUL,UNKNOWN';
describe('parseLocalCurriculumCsv',()=>{
  it('parses the original eight-column course contract with half-credit units',()=>{
    const result=parseLocalCurriculumCsv(HEAD+'\n'+line('가상 강의','1.5')+'\n');
    expect(result.courses).toMatchObject([{courseCode:'SYN010101',creditUnits:3,verification:'UNVERIFIED'}]);
    expect(result.duplicateRows).toBe(0);
  });
  it('decodes quoted CSV cells and removes exact duplicate records',()=>{
    const data='SYN010101,"가상 ""영문"" 강의",3,전공,가상학과,2026-2,SEOUL,UNKNOWN';
    const result=parseLocalCurriculumCsv(HEAD+'\n'+data+'\n'+data);
    expect(result.courses[0]?.courseName).toBe('가상 "영문" 강의');
    expect(result.courses).toHaveLength(1);
    expect(result.duplicateRows).toBe(1);
  });
  it('marks mismatched rows with the same course identity as needing review',()=>{
    const result=parseLocalCurriculumCsv(HEAD+'\n'+line('가상 강의','3')+'\n'+line('다른 가상 강의','2'));
    expect(result.courses.map(r=>r.verification)).toEqual(['NEEDS_REVIEW','NEEDS_REVIEW']);
  });
  it('rejects formula cells or a swapped column header',()=>{
    expect(()=>parseLocalCurriculumCsv(HEAD+'\n'+line('=HYPERLINK("x")'))).toThrow();
    expect(()=>parseLocalCurriculumCsv('courseName,courseCode,credits,category,major,semester,campus,cohort\n'+line())).toThrow();
  });
});
