import {describe,expect,it} from 'vitest';
import type {AcademicAgendaItem} from './academic-schedule.js';
import {academicSourceLink,selectedMajors,studentDeadlineDisplay} from './academic-display.js';

const sample=(overrides:Partial<AcademicAgendaItem>={}):AcademicAgendaItem=>({
  event:{
    id:'TEST',revision:'r1',title:'학사 공지',type:'GRADUATION_EXAM',
    state:'ACTIVE',studentActionRequired:true,
    source:{title:'예시 공지',review:'REFERENCE_ONLY'},
  },
  group:'GRADUATION',appliesTo:'UNKNOWN',scopeUnknown:[],candidateRequirementMatch:false,
  evidence:'NEEDS_SOURCE_CHECK',priority:'DUE_SOON',
  studentDeadline:'2026-11-25T18:00:00+09:00',daysLeft:7,sortTimestamp:0,...overrides,
});

describe('student academic notice display safety',()=>{
  it('does not display an unreviewed claimed deadline as D-7',()=>{
    expect(studentDeadlineDisplay(sample())).toEqual({
      kind:'UNVERIFIED',status:'D-day 없음 · 학교 공지 원문 확인',
    });
  });
  it('refuses D-day even for reviewed data when student applicability is unknown',()=>{
    expect(studentDeadlineDisplay(sample({evidence:'SOURCE_REVIEWED'})).kind).toBe('UNVERIFIED');
  });
  it('displays D-day for independently reviewed deadlines with proven applicability',()=>{
    expect(studentDeadlineDisplay(sample({evidence:'SOURCE_REVIEWED',appliesTo:'YES'}))).toEqual({
      kind:'VERIFIED',status:'D-7',
    });
  });
  it('labels synthetic countdown explicitly as simulated',()=>{
    expect(studentDeadlineDisplay(sample({evidence:'SYNTHETIC'}))).toEqual({
      kind:'SYNTHETIC',status:'가상 D-7',
    });
  });
  it('avoids a fake countdown for non-deadline events',()=>{
    expect(studentDeadlineDisplay(sample({studentDeadline:null,daysLeft:null,priority:'DATE_UNKNOWN'})).kind).toBe('NONE');
  });
  it('requires a primary major before secondary major affects recommendations',()=>{
    expect(selectedMajors('','경제학부')).toEqual([]);
    expect(selectedMajors('  경제학부  ',' 경영학부 ')).toEqual(['경제학부','경영학부']);
    expect(selectedMajors('경제학부','경제학부')).toEqual(['경제학부']);
  });
  it('never confuses lookalike hosts and arbitrary external URLs with school domain',()=>{
    expect(academicSourceLink('https://dep.hufs.ac.kr/hufs/11282/subview.do')).toBe('HUFS_DOMAIN');
    expect(academicSourceLink('https://hufs.ac.kr.evil.example/path')).toBe('OTHER_HTTPS');
    expect(academicSourceLink('https://example.org/hufs.ac.kr')).toBe('OTHER_HTTPS');
    expect(academicSourceLink('https://hufs.ac.kr@evil.example/path')).toBe('OTHER_HTTPS');
    expect(academicSourceLink('javascript:alert(1)')).toBe('NONE');
    expect(academicSourceLink(undefined)).toBe('NONE');
  });
});
