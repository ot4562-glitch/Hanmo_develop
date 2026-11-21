import {describe,it,expect} from 'vitest';
import {AcademicEventSchema,buildAcademicAgenda,type AcademicEvent,type AcademicEventInput,type AcademicProfile} from './academic-schedule.js';
import {importantNotices} from './important-notices.js';

const NOW='2026-11-18T15:00:00+09:00';
const profile:AcademicProfile={campus:'SEOUL',cohort:2024,majors:['경제학부'],openRequirementIds:null};
const event=(id:string,override:Partial<AcademicEventInput>={}):AcademicEvent=>AcademicEventSchema.parse({
  id,revision:'r1',title:'학사 안내 '+id,type:'GRADUATION_EXAM',
  source:{title:'학사 공지 게시목록',publishedDate:'2026-11-17',review:'REFERENCE_ONLY'},
  studentActionRequired:true,...override,
});
const results=(events:AcademicEvent[],p:AcademicProfile=profile,trusted:AcademicEvent[]=[])=>
  importantNotices(p,buildAcademicAgenda({asOf:NOW,profile:p,events,trustedReviewedEvents:trusted}).items);

describe('major-first important notices without automatic transcript upload',()=>{
  it('shows no personalized recommendations before a major is provided',()=>{
    const result=results([event('NOTICE')],{campus:'SEOUL'});
    expect(result.mode).toBe('CHOOSE_MAJOR');
    expect(result.confirmed).toEqual([]);
    expect(result.toCheck).toEqual([]);
  });
  it('shows title-only notices as unverified references, never confirmed deadlines',()=>{
    const result=results([event('NOTICE')]);
    expect(result.mode).toBe('MAJOR_SELECTED');
    expect(result.confirmed).toEqual([]);
    expect(result.toCheck.map(x=>x.event.id)).toEqual(['NOTICE']);
    expect(result.toCheck[0]?.evidence).toBe('NEEDS_SOURCE_CHECK');
    expect(result.toCheck[0]?.studentDeadline).toBeNull();
  });
  it('does not promote SOURCE_REVIEWED text inside JSON without independent approval',()=>{
    const candidate=event('FAKE-APPROVED',{source:{
      title:'자료',url:'https://example.edu/notice',review:'SOURCE_REVIEWED',
      reviewedAt:'2026-11-17T10:00:00+09:00',
    },deadlineAt:'2026-11-25T18:00:00+09:00'});
    const result=results([candidate]);
    expect(result.confirmed).toHaveLength(0);
    expect(result.toCheck).toHaveLength(1);
  });
  it('pins at most two operator-reviewed, applicable and unexpired student deadlines',()=>{
    const reviewed=(id:string,day:number)=>event(id,{
      source:{title:'검수된 자료',url:'https://example.edu/notice',review:'SOURCE_REVIEWED',
        reviewedAt:'2026-11-17T10:00:00+09:00'},
      scope:{majors:['경제학부'],campuses:['SEOUL']},
      deadlineAt:`2026-11-${String(day).padStart(2,'0')}T18:00:00+09:00`,
    });
    const a=reviewed('A',22),b=reviewed('B',23),c=reviewed('C',24);
    const result=results([c,a,b],profile,[a,b,c]);
    expect(result.confirmed.map(x=>x.event.id)).toEqual(['A','B']);
    expect(result.confirmed).toHaveLength(2);
  });
  it('filters explicitly unrelated majors and campuses before showing suggestions',()=>{
    const otherMajor=event('OTHER-MAJOR',{scope:{majors:['철학과']}});
    const otherCampus=event('OTHER-CAMPUS',{scope:{campuses:['GLOBAL']}});
    expect(results([otherMajor,otherCampus]).toCheck).toHaveLength(0);
  });
  it('prioritizes explicitly scoped major notices over generic relevant types',()=>{
    const general=event('GENERAL',{type:'GRADUATION_EXAM'});
    const local=event('LOCAL',{type:'DOUBLE_MAJOR_APPLICATION',scope:{majors:['경제학부']}});
    expect(results([general,local]).toCheck.map(x=>x.event.id)).toEqual(['LOCAL','GENERAL']);
  });
  it('never pins synthetic deadlines or expired application deadlines',()=>{
    const synthetic=event('SYN',{source:{title:'가상',review:'SYNTHETIC'},deadlineAt:'2026-11-25T18:00:00+09:00'});
    const expired=event('OLD',{source:{title:'검수',review:'SOURCE_REVIEWED',
      url:'https://example.edu/notice',reviewedAt:'2026-11-17T10:00:00+09:00'},
      deadlineAt:'2026-11-17T17:00:00+09:00'});
    const result=results([synthetic,expired],profile,[expired]);
    expect(result.confirmed).toHaveLength(0);
    expect(result.toCheck.map(x=>x.event.id)).toEqual(['SYN']);
  });
});
