import {importWisTimetable,withoutBlocks,type TimetableImport,type TimetableImportRequest,type TimetableRow} from './wis-timetable.js';

/**
 * 원본 WIS 파서는 공개된 담당교수 표시를 버리지만 이 확장은 검증된 저장 페이지 강좌 행에 연결된 화면 표기만 보존한다.
 * 교수의 신원·재직 여부·정원·교수 본인 검토 또는 대학 인증을 증명하지 않는다.
 * 사용자가 제공한 HTML만 브라우저에서 처리하며 외부에서 수집하지 않는다.
 */
export type FacultyTimetableRow=TimetableRow&{instructor:string|null};
export type FacultyTimetableImport=Omit<TimetableImport,'rows'>&{rows:FacultyTimetableRow[]};

const entities:Readonly<Record<string,string>>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ','#39':"'"};
function plainText(fragment:string):string{
  const stripped=fragment.replace(/<[^>]*>/g,' ');
  const decoded=stripped.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi,(whole,name:string)=>{
    const key=name.toLowerCase();
    if(Object.prototype.hasOwnProperty.call(entities,key))return entities[key]!;
    if(key.startsWith('#x')){
      const point=Number.parseInt(key.slice(2),16);
      return point>=0&&point<=0x10ffff?String.fromCodePoint(point):whole;
    }
    if(key.startsWith('#')){
      const point=Number(key.slice(1));
      return Number.isInteger(point)&&point>=0&&point<=0x10ffff?String.fromCodePoint(point):whole;
    }
    return whole;
  });
  return decoded.replace(/\s+/g,' ').trim();
}
const columns=(row:string):string[]=>
  [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match=>match[1]!);
const undecided=/^(?:미정|미배정|담당교수\s*미정|tba|unknown|–|-|)$/i;

export function extractFacultyFromSavedTimetable(input:TimetableImportRequest):FacultyTimetableImport{
  if(input.html.length>5_000_000)throw new RangeError('Saved timetable is too large');
  // 원본 엄격 파서는 저장 출처 URL·헤더·표와 카드의 일치·강의 링크·학기부터 검증한다.
  const verified=importWisTimetable(input);
  const page=withoutBlocks(withoutBlocks(input.html,'script'),'comment');
  const cellRows=[...page.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(match=>columns(match[1]!))
    .filter(cells=>cells.length>0&&/^\d+$/.test(plainText(cells[0]!)));
  if(cellRows.length!==verified.rows.length)
    throw new TypeError('Saved timetable course/lecturer row count does not match');

  const rows=verified.rows.map((course,index):FacultyTimetableRow=>{
    const cells=cellRows[index]!;
    if(cells.length!==13
      || Number(plainText(cells[0]!))!==course.no
      || plainText(cells[3]!).toUpperCase()!==course.rawCode
      || plainText(cells[4]!)!==course.title){
      throw new TypeError('Saved timetable course/lecturer row alignment differs');
    }
    const name=plainText(cells[7]!);
    return {...course,instructor:undecided.test(name)?null:name};
  });
  return {...verified,rows};
}
