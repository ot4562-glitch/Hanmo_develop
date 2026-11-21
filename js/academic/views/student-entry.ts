/**
 * 성적표 없는 첫 학업 이용 흐름의 한 탭 임시 전달 계약.
 * 기존 학생 설정/모의신청 저장 키를 읽거나 변경하지 않는다.
 */
export const STUDENT_ENTRY_KEY = 'hanmo.academic.v1.entry-handoff';

export type StudentCampus = 'SEOUL'|'GLOBAL';
export interface StudentEntry {
  schemaVersion:1;
  campus:StudentCampus;
  major:string;
  doubleMajor?:string;
  minor?:string;
  cohort?:number;
}

function requireText(raw:unknown, name:string, required:boolean):string {
  if(typeof raw !== 'string')throw new TypeError(name+'을(를) 확인해 주세요.');
  const text=raw.trim();
  if(required && !text)throw new RangeError(name+'을(를) 입력해 주세요.');
  if(text.length>100)throw new RangeError(name+'은(는) 100자 이하로 입력해 주세요.');
  return text;
}

/** 입력값 자체는 학교가 확인한 학생 소속·교과과정으로 간주하지 않는다. */
export function normalizeStudentEntry(raw:unknown):StudentEntry {
  if(!raw || typeof raw!=='object' || Array.isArray(raw)) {
    throw new TypeError('캠퍼스와 전공을 선택해 주세요.');
  }
  const v=raw as Record<string,unknown>;
  if(v.campus!=='SEOUL'&&v.campus!=='GLOBAL'){
    throw new RangeError('서울 또는 글로벌 캠퍼스를 선택해 주세요.');
  }
  const major=requireText(v.major,'주전공',true);
  const doubleMajor=requireText(v.doubleMajor??'','이중전공',false);
  const minor=requireText(v.minor??'','부전공',false);
  if(doubleMajor&&minor)throw new RangeError('이중전공과 부전공 중 하나만 선택해 주세요.');
  const cohortValue=v.cohort;
  let cohort:number|undefined;
  if(cohortValue!==undefined&&cohortValue!==null&&cohortValue!==''){
    const year=typeof cohortValue==='number'?cohortValue
      :typeof cohortValue==='string'&&/^\d{4}$/.test(cohortValue)?Number(cohortValue):NaN;
    if(!Number.isSafeInteger(year)||year<2010||year>2100){
      throw new RangeError('입학년도는 2010~2100년으로 입력해 주세요.');
    }
    cohort=year;
  }
  return {schemaVersion:1,campus:v.campus,major,
    ...(doubleMajor?{doubleMajor}:{}),...(minor?{minor}:{}),...(cohort===undefined?{}:{cohort})};
}

/** 세션 저장에 실패해도 기존 프로필과 이수 자료는 변경되지 않는다. */
export function stageStudentEntry(storage:Pick<Storage,'setItem'>,raw:unknown):StudentEntry {
  const entry=normalizeStudentEntry(raw);
  storage.setItem(STUDENT_ENTRY_KEY,JSON.stringify(entry));
  return entry;
}

/** 이미 사용한 임시 선택값은 되돌아가 재진입해도 자동 복원되지 않는다. */
export function takeStudentEntry(storage:Pick<Storage,'getItem'|'removeItem'>):StudentEntry|null {
  let raw:string|null;
  try{raw=storage.getItem(STUDENT_ENTRY_KEY);}catch{return null;}
  if(raw===null)return null;
  try{storage.removeItem(STUDENT_ENTRY_KEY);}catch{/* 제한된 브라우저 설정 */}
  if(raw.length>2048)return null;
  try{
    const data=JSON.parse(raw) as unknown;
    if(!data||typeof data!=='object'||(data as Record<string,unknown>).schemaVersion!==1){
      return null;
    }
    return normalizeStudentEntry(data);
  }catch{return null;}
}
