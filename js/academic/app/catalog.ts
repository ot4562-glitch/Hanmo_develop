import {extractFacultyFromSavedTimetable,type FacultyTimetableImport} from '../core/academics/faculty-directory.js';
import {searchFacultyTimetable} from '../core/academics/faculty-search.js';
import {toSavedCurriculumCsv} from '../core/academics/wis-timetable-csv.js';

/** 필수 HTML 컨트롤을 한 번 조회하고 콜백 안에서도 구체적인 타입을 보존한다. */
function requireControl<T extends HTMLElement>(id:string,ctor:{new():T}):T{
  const node=document.getElementById(id);
  if(!(node instanceof ctor))throw new Error('Missing static catalog control: '+id);
  return node;
}
const file=requireControl('wis-file',HTMLInputElement);
const label=requireControl('department',HTMLInputElement);
const search=requireControl('course-search',HTMLInputElement);
const currentStatus=requireControl('catalog-status',HTMLElement);
const rowsElement=requireControl('catalog-rows',HTMLTableSectionElement);
const rowCount=requireControl('catalog-count',HTMLElement);
const csvButton=requireControl('export-csv',HTMLButtonElement);
const loadButton=requireControl('load-wis',HTMLButtonElement);
let imported:FacultyTimetableImport|null=null;

function addCell(tr:HTMLTableRowElement,value:string):void{
  const td=document.createElement('td');
  td.textContent=value;
  tr.append(td);
}
function render():void{
  rowsElement.replaceChildren();
  const matches=searchFacultyTimetable(imported?.rows??[],search.value);
  rowCount.textContent=imported
    ?String(matches.length)+'개 강좌 (총 '+String(imported.rows.length)+'개)'
    :'데이터 없음';
  csvButton.disabled=imported===null;
  for(const row of matches){
    const tr=document.createElement('tr');
    addCell(tr,row.rawCode);
    addCell(tr,row.title);
    addCell(tr,row.instructor??'담당 미정 / 미기재');
    addCell(tr,row.creditUnits===null?'확인 필요':String(row.creditUnits/2));
    addCell(tr,row.meetings.map(m=>
      m.day+' '+m.periods.join(',')+'교시 ('+m.room+')'
    ).join(' / ')||'시간 미기재');
    addCell(tr,row.needsReview?'검토 필요':'형식 확인');
    rowsElement.append(tr);
  }
}
loadButton.addEventListener('click',async()=>{
  const chosen=file.files?.[0];
  if(!chosen){currentStatus.textContent='HTML 파일을 선택해 주세요.';return;}
  if(chosen.size>5_000_000){
    imported=null;currentStatus.textContent='파일이 너무 큽니다 (최대 5 MB).';render();return;
  }
  try{
    const html=await chosen.text();
    const savedAt=new Date(chosen.lastModified||Date.now()).toISOString();
    const departmentLabel=label.value.trim()||'미지정';
    imported=extractFacultyFromSavedTimetable({
      html,fileName:chosen.name,savedAt,departmentLabel
    });
    const term=imported.term.academicTerm??'계절학기 (연도: '+String(imported.term.year)+')';
    currentStatus.textContent=
      '로컬 파일 변환: '+imported.departmentLabel+' · '+term+
      ' · 캠퍼스 '+imported.campus+' · 자료범위: 한 학과 저장 페이지'+
      ' · 검토 항목 '+String(imported.issues.length)+'건.'+
      ' 학교 실시간 데이터나 공식 졸업 판정이 아닙니다.';
    render();
  }catch(error){
    imported=null;
    currentStatus.textContent='저장 페이지를 해석할 수 없습니다: '+
      (error instanceof Error?error.message:String(error));
    render();
  }
});
search.addEventListener('input',render);
csvButton.addEventListener('click',()=>{
  if(!imported)return;
  const exported=toSavedCurriculumCsv(imported);
  if(exported.rows===0){
    currentStatus.textContent='검증되어 내보낼 수 있는 일반학기 강좌가 없습니다.';
    return;
  }
  const blob=new Blob(['\uFEFF',exported.csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='hanmo-wis-courses.csv';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  currentStatus.textContent='CSV '+String(exported.rows)+'개 행을 내보냈습니다. '+
    '검토 보류 '+String(exported.withheld.length)+'개 행은 제외했습니다.'+
    ' 교수명과 인원수는 CSV에 포함하지 않습니다.';
});
render();
