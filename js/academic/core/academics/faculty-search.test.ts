import {describe,it,expect} from 'vitest';
import {searchFacultyTimetable} from './faculty-search.js';
import type {FacultyTimetableRow} from './faculty-directory.js';

function row(rawCode:string,title:string,instructor:string|null):FacultyTimetableRow{
  return {
    no:1,area:'MAJOR',areaLabel:'전공',gradeYear:2,rawCode,
    code:{status:'NEEDS_REVIEW'},title,attributes:[],instructionLanguage:null,
    otherAttributes:[],creditUnits:6,hours:3,meetings:[],note:'',
    noteHints:{prerequisite:false,cohort:false,restriction:false,equivalent:false},
    termEvidence:'ROW_LINK',needsReview:false,instructor,
  };
}
const fixtures=[row('SYN010101','가상 프로그래밍','가상 교수'),
  row('SYN020101','가상 언어학',null),
  row('SYN030101','가상 데이터분석','가상 강사')];

describe('searchFacultyTimetable',()=>{
  it('matches course title, course code, or public instructor label',()=>{
    expect(searchFacultyTimetable(fixtures,'프로그래밍')).toEqual([fixtures[0]]);
    expect(searchFacultyTimetable(fixtures,'SYN030101')).toEqual([fixtures[2]]);
    expect(searchFacultyTimetable(fixtures,'가상 교수')).toEqual([fixtures[0]]);
  });
  it('supports surrounding whitespace and NFKC Unicode normalization',()=>{
    expect(searchFacultyTimetable(fixtures,'  ｓｙｎ０２０１０１  ')).toEqual([fixtures[1]]);
  });
  it('does not invent or match a missing instructor label',()=>{
    expect(searchFacultyTimetable(fixtures,'미정')).toEqual([]);
  });
  it('returns all rows when the search string is empty',()=>{
    expect(searchFacultyTimetable(fixtures,'   ')).toEqual(fixtures);
  });
});
