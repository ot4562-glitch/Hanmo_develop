import {describe,it,expect} from 'vitest';
import {normalizeStudentEntry,stageStudentEntry,takeStudentEntry,STUDENT_ENTRY_KEY} from './student-entry.js';

function memory():Storage {
  const values=new Map<string,string>();
  return {
    get length(){return values.size;},
    clear(){values.clear();},
    key(i:number){return [...values.keys()][i]??null;},
    getItem(k:string){return values.get(k)??null;},
    setItem(k:string,v:string){values.set(k,String(v));},
    removeItem(k:string){values.delete(k);},
  };
}

describe('1차 성적표 없는 학생 진입 흐름',()=>{
  it('accepts campus and major without transcript or official-rule claims',()=>{
    expect(normalizeStudentEntry({campus:'SEOUL',major:' 경제학부 ',doubleMajor:' ',cohort:''}))
      .toEqual({schemaVersion:1,campus:'SEOUL',major:'경제학부'});
    expect(normalizeStudentEntry({campus:'SEOUL',major:'경제학전공',minor:'통계학부',cohort:'2024'}))
      .toMatchObject({campus:'SEOUL',minor:'통계학부',cohort:2024});
    expect(()=>normalizeStudentEntry({campus:'SEOUL',major:'경제학전공',minor:'통계학부',
      doubleMajor:'경영학부'})).toThrow(/하나만/);
    expect(normalizeStudentEntry({campus:'GLOBAL',major:'국제학부',doubleMajor:'컴퓨터공학과',cohort:'2022'}))
      .toMatchObject({campus:'GLOBAL',cohort:2022,doubleMajor:'컴퓨터공학과'});
  });
  it('rejects missing campus/major and invalid cohort instead of fabricating student eligibility',()=>{
    expect(()=>normalizeStudentEntry({campus:'',major:'경제학부'})).toThrow(/캠퍼스/);
    expect(()=>normalizeStudentEntry({campus:'SEOUL',major:'  '})).toThrow(/주전공/);
    expect(()=>normalizeStudentEntry({campus:'SEOUL',major:'A',cohort:2009})).toThrow(/입학년도/);
    expect(()=>normalizeStudentEntry({campus:'SEOUL',major:'A',cohort:2022.2})).toThrow(/입학년도/);
    expect(()=>normalizeStudentEntry({campus:'SEOUL',major:'A'.repeat(101)})).toThrow(/100자/);
  });
  it('transfers only bounded profile selections once, leaving existing student and simulator keys untouched',()=>{
    const store=memory();
    store.setItem('hanmo.academic.v1.profile','PERSISTED_SETTINGS');
    store.setItem('practiceSetter','3');
    stageStudentEntry(store,{campus:'SEOUL',major:'경제학부',cohort:2024});
    expect(JSON.parse(store.getItem(STUDENT_ENTRY_KEY)??'{}')).toEqual({
      schemaVersion:1,campus:'SEOUL',major:'경제학부',cohort:2024,
    });
    expect(takeStudentEntry(store)).toMatchObject({campus:'SEOUL',major:'경제학부'});
    expect(takeStudentEntry(store)).toBeNull();
    expect(store.getItem('hanmo.academic.v1.profile')).toBe('PERSISTED_SETTINGS');
    expect(store.getItem('practiceSetter')).toBe('3');
  });
  it('rejects damaged, future-version or oversized handoffs without changing other storage keys',()=>{
    for(const broken of ['{nope','{"schemaVersion":2,"campus":"SEOUL","major":"A"}','X'.repeat(2049)]){
      const store=memory();
      store.setItem(STUDENT_ENTRY_KEY,broken);
      store.setItem('hanmo.academic.v1.profile','UNCHANGED');
      expect(takeStudentEntry(store)).toBeNull();
      expect(store.getItem('hanmo.academic.v1.profile')).toBe('UNCHANGED');
    }
  });
  it('fails closed when session storage is unavailable',()=>{
    const blocked={
      getItem(){throw Error('storage denied');},
      removeItem(){throw Error('storage denied');},
    };
    expect(takeStudentEntry(blocked)).toBeNull();
  });
});
