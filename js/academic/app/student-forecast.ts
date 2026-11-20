import {forecastOffering} from '../core/forecast/offering.js';
import {studentForecastInput} from '../views/forecast-student-input.js';

type PublicStatus='NOT_CONNECTED'|'EMPTY'|'READY'|'OFFLINE'|'INVALID';
type DataView={status:PublicStatus;meta?:{sourceCheckedAt:string}|null};
type DataAdapter={load:()=>Promise<DataView>};
const dataSource=(globalThis as typeof globalThis & {HanmoAcademicData?:DataAdapter}).HanmoAcademicData;

const form=document.getElementById('forecast-form');
const course=document.getElementById('forecast-course-id');
const year=document.getElementById('forecast-year');
const semester=document.getElementById('forecast-semester');
const response=document.getElementById('forecast-response');
const status=document.getElementById('forecast-status');
const retry=document.getElementById('forecast-retry');
if(!(form instanceof HTMLFormElement)||!(course instanceof HTMLInputElement)
  ||!(year instanceof HTMLInputElement)||!(semester instanceof HTMLSelectElement)
  ||!(response instanceof HTMLElement)||!(status instanceof HTMLElement)
  ||!(retry instanceof HTMLButtonElement)){
  throw new Error('학생용 강의 전망 화면이 불완전합니다.');
}
function paragraph(message:string):HTMLParagraphElement{
  const n=document.createElement('p');n.textContent=message;return n;
}
function render(title:string,detail:string,sub:string,notice:string):void{
  const heading=document.createElement('h3');heading.textContent=title;
  (response as HTMLElement).replaceChildren(heading,paragraph(detail),paragraph(sub));
  (status as HTMLElement).textContent=notice;
}
const labels:Record<PublicStatus,string>={
  NOT_CONNECTED:'승인된 학기별 강좌 데이터가 아직 연결되지 않았습니다.',
  EMPTY:'연결은 되었지만 승인된 강좌·개설 자료가 없습니다.',
  READY:'승인된 공개 강좌 자료가 연결됐습니다. 개설 전망은 추가 근거 검증이 필요합니다.',
  OFFLINE:'자료 서버에 연결할 수 없습니다. 다시 시도하거나 학교 공식 사이트를 확인하세요.',
  INVALID:'자료 판본·유효기간을 검증하지 못해 개설 전망을 중단했습니다.'
};
let dataStatus:PublicStatus='NOT_CONNECTED',loading=false;
const kstParts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric'})
  .formatToParts(new Date());
const yyyy=Number(kstParts.find(x=>x.type==='year')?.value);
const mm=Number(kstParts.find(x=>x.type==='month')?.value);
if(Number.isSafeInteger(yyyy)&&Number.isSafeInteger(mm)){
  (year as HTMLInputElement).value=String(mm>=9?yyyy+1:yyyy);
  (semester as HTMLSelectElement).value=mm>=3&&mm<9?'2':'1';
}
async function refresh():Promise<void>{
  if(loading)return;
  loading=true;(retry as HTMLButtonElement).disabled=true;
  render('개설 근거 연결 상태 확인 중','승인된 공개 자료를 조회하고 있습니다.',
    '검증되지 않은 강좌 개설 이력을 임의로 표시하지 않습니다.','자료 연결 확인 중');
  try{
    const result=dataSource?await dataSource.load():{status:'OFFLINE' as const};
    dataStatus=result.status;
    const note=labels[dataStatus]??labels.INVALID;
    render(dataStatus==='READY'?'강의 개설 근거 연결됨':'아직 개설 여부를 판정할 수 없습니다.',
      note,'과거 관측 자료의 범위·학수번호 동일성·분반 판본 검증 없이 개설 여부를 예측하지 않습니다.',
      note);
  }catch{
    dataStatus='OFFLINE';
    render('강의 개설 자료를 확인할 수 없습니다.',labels.OFFLINE,
      '안전하게 재사용할 승인된 자료가 없으므로 개설 여부는 미확인입니다.',labels.OFFLINE);
  }finally{loading=false;(retry as HTMLButtonElement).disabled=false;}
}
(form as HTMLFormElement).addEventListener('submit',event=>{
  event.preventDefault();
  try{
    const input=studentForecastInput({
      courseId:(course as HTMLInputElement).value,
      year:Number((year as HTMLInputElement).value),
      semester:(semester as HTMLSelectElement).value,
      asOf:new Date().toISOString()
    });
    const outcome=forecastOffering(input);
    render('현재 개설 여부는 확인이 필요합니다.',
      '과목 '+outcome.courseId+' · '+outcome.targetTerm+'학기 · 근거 검증 전 UNKNOWN',
      labels[dataStatus]+' 학수번호 동일성과 완전한 학기별 개설 근거가 없으면 개설/미개설로 확정하지 않습니다.',
      labels[dataStatus]);
  }catch(error){
    render('입력 내용을 확인해 주세요.',
      error instanceof Error?error.message:String(error),
      '학수번호와 학년·학기를 다시 입력해 주세요.','입력 확인 필요');
  }
});
(retry as HTMLButtonElement).addEventListener('click',()=>{void refresh();});
void refresh();
