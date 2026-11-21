import Papa from 'papaparse';

/**
 * HUFS One AI의 강의 요건 CSV 정규화 로직을 브라우저용으로 옮긴 것이다.
 * 원본 서버 처리와 달리 운영자 승인 권한이 없으므로 가져온 행이 학교 자료처럼 보여도 모두 UNVERIFIED로 둔다.
 */
export const LOCAL_CURRICULUM_CSV_HEADERS=[
  'courseCode','courseName','credits','category','major','semester','campus','cohort'
] as const;

export interface LocalCurriculumCourse{
  courseCode:string;courseName:string;creditUnits:number;category:string;
  major:string;semester:string;campus:string;cohort:string;
  verification:'UNVERIFIED'|'NEEDS_REVIEW';
}
export interface LocalCurriculumImport{
  courses:LocalCurriculumCourse[];
  duplicateRows:number;
  source:'USER_SUPPLIED_LOCAL_CSV';
  scope:'UNVERIFIED';
}

export function parseLocalCurriculumCsv(csv:string):LocalCurriculumImport{
  if(new TextEncoder().encode(csv).length>1_000_000)throw new TypeError('CATALOG_INVALID: file too large');
  const parsed=Papa.parse<string[]>(csv.replace(/^\uFEFF/,''),{skipEmptyLines:'greedy'});
  if(parsed.errors.length>0||parsed.data.length>5001
    ||JSON.stringify(parsed.data[0])!==JSON.stringify(LOCAL_CURRICULUM_CSV_HEADERS)){
    throw new TypeError('CATALOG_INVALID: expected exact eight-column header');
  }
  const courses:LocalCurriculumCourse[]=[];
  const seen=new Set<string>();
  const byIdentity=new Map<string,LocalCurriculumCourse[]>();
  let duplicateRows=0;
  for(const raw of parsed.data.slice(1)){
    if(raw.length!==8)throw new TypeError('CATALOG_INVALID: wrong column count');
    const cells=raw.map(x=>x.trim().normalize('NFKC'));
    if(cells.some(x=>x===''||x.length>200||/^[=+@]/.test(x))){
      throw new TypeError('CATALOG_INVALID: unsafe cell');
    }
    const [courseCode,courseName,credits,category,major,semester,campus,cohort]=cells as
      [string,string,string,string,string,string,string,string];
    if(!/^[A-Za-z0-9_.-]{1,40}$/.test(courseCode)
      ||!/^\d+(?:\.[05])?$/.test(credits)
      ||Number(credits)>30
      ||!Number.isSafeInteger(Number(credits)*2)
      ||!/^(?:\d{4}-[12]|UNKNOWN)$/.test(semester)){
      throw new TypeError('CATALOG_INVALID: invalid course data');
    }
    const rowKey=JSON.stringify(cells);
    if(seen.has(rowKey)){duplicateRows++;continue;}
    seen.add(rowKey);
    const course:LocalCurriculumCourse={
      courseCode,courseName,creditUnits:Number(credits)*2,
      category,major,semester,campus,cohort,verification:'UNVERIFIED'
    };
    const identity=JSON.stringify([courseCode,major,semester,campus,cohort]);
    const existing=byIdentity.get(identity)??[];
    if(existing.length){
      course.verification='NEEDS_REVIEW';
      for(const old of existing)old.verification='NEEDS_REVIEW';
    }
    existing.push(course);
    byIdentity.set(identity,existing);
    courses.push(course);
  }
  return {courses,duplicateRows,source:'USER_SUPPLIED_LOCAL_CSV',scope:'UNVERIFIED'};
}
