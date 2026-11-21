import {describe,it,expect} from 'vitest';
import {forecastOffering} from '../core/forecast/offering.js';
import {studentForecastInput} from './forecast-student-input.js';

const asOf='2026-11-19T03:00:00.000Z';
describe('nondeveloper forecast form',()=>{
  it('does not turn a course-code entry into verified historical observations',()=>{
    const value=studentForecastInput({courseId:' ECON101 ',year:2027,semester:'1',asOf});
    expect(value).toMatchObject({courseId:'ECON101',targetTerm:'2027-1',courseIdentity:'EQUIVALENCE_UNVERIFIED'});
    expect(value.observations).toEqual([]);
    expect(value.officialEvents).toEqual([]);
    const result=forecastOffering(value);
    expect(result.signal).toBe('UNKNOWN');
    expect(result.sameSeasonObservedTerms).toBe(0);
    expect(result.sameSeasonOfferedTerms).toBe(0);
    expect(result.evidenceRefs).toEqual([]);
  });
  it('accepts second semester without adding synthetic data',()=>{
    const value=studentForecastInput({courseId:'ABC123',year:2028,semester:'2',asOf});
    expect(value.targetTerm).toBe('2028-2');
    expect(forecastOffering(value).signal).toBe('UNKNOWN');
  });
  it('rejects blank course IDs',()=>{
    expect(()=>studentForecastInput({courseId:'   ',year:2027,semester:'1',asOf})).toThrow(/학수번호/);
  });
  it('rejects malformed terms rather than silently converting them',()=>{
    expect(()=>studentForecastInput({courseId:'ECON101',year:2027.5,semester:'1',asOf})).toThrow(/학년도/);
    expect(()=>studentForecastInput({courseId:'ECON101',year:2027,semester:'3',asOf})).toThrow(/학기/);
  });
});
