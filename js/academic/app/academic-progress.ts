import {
  compareProvisionalScenario,normalizeStudentCourse,normalizePlanCourse,upcomingTerms,
  explainProvisionalExclusions,provisionalTermBreakdown,
  SCENARIO_TERMS,MAX_COURSES,type ScenarioId,type StudentCourse,type StudentPlanCourse,
} from '../views/student-progress.js';
import {creditsText} from '../views/graduationView.js';

const records:StudentCourse[]=[];
const plans:Record<ScenarioId,StudentPlanCourse[]>={A:[],B:[],C:[]};
const SCENARIOS=['A','B','C'] as const;
const get=<T extends HTMLElement>(id:string):T=>{
  const element=document.getElementById(id);
  if(!element)throw new Error('학생용 입력 화면이 누락되었습니다: '+id);
  return element as T;
};
const write=(id:string,message:string):void=>{get(id).textContent=message;};
const text=(tag:keyof HTMLElementTagNameMap,value:string):HTMLElement=>{
  const node=document.createElement(tag);node.textContent=value;return node;
};
function selected():ScenarioId{
  const active=document.querySelector<HTMLInputElement>('input[name="scenario"]:checked')?.value;
  if(active==='A'||active==='B'||active==='C')return active;
  return 'A';
}
function today():string{return new Date().toISOString();}

function renderRecords():void{
  const tbody=get<HTMLTableSectionElement>('record-rows');tbody.replaceChildren();
  if(!records.length){
    const row=document.createElement('tr'),cell=document.createElement('td');
    cell.colSpan=5;cell.textContent='입력한 과목이 없습니다. 취득 완료 또는 수강 중 과목을 추가해 보세요.';
    row.append(cell);tbody.append(row);return;
  }
  for(const [index,record] of records.entries()){
    const tr=document.createElement('tr');
    tr.append(text('td',record.courseId));
    tr.append(text('td',record.term));
    tr.append(text('td',creditsText(record.credits*2)));
    tr.append(text('td',record.slot==='EARNED'?'취득 완료(자가 입력)':'수강 중'));
    const cell=document.createElement('td'),button=document.createElement('button');
    button.type='button';button.textContent='삭제';
    button.setAttribute('aria-label',record.courseId+' 입력 기록 삭제');
    button.addEventListener('click',()=>{
      records.splice(index,1);renderAll();
      write('record-message','기록을 삭제했습니다. 이 페이지의 임시 입력만 변경되었습니다.');
    });
    cell.append(button);tr.append(cell);tbody.append(tr);
  }
}
function renderTermChoices(asOf:string):void{
  const select=get<HTMLSelectElement>('plan-term');
  const previous=select.value;
  const terms=upcomingTerms(asOf,SCENARIO_TERMS[selected()]);
  select.replaceChildren();
  for(const term of terms){
    const option=document.createElement('option');
    option.value=term;option.textContent=term.slice(0,4)+'년 '+(term.endsWith('-1')?'1학기':'2학기');
    select.append(option);
  }
  if(terms.includes(previous))select.value=previous;
}
function renderPlanRows():void{
  const root=get('plan-rows');root.replaceChildren();
  const id=selected(),items=plans[id];
  if(!items.length){
    root.append(text('p',id+'안에 추가한 과목이 없습니다. 다음 학기별 수강계획을 직접 입력해 보세요.'));
    return;
  }
  for(const [index,item] of items.entries()){
    const row=document.createElement('div');row.className='plan-row';
    row.append(text('span',item.term+' · '+item.courseId+' · '+creditsText(item.credits*2)));
    const button=document.createElement('button');button.type='button';button.textContent='과목 제거';
    button.setAttribute('aria-label',id+'안 '+item.term+' '+item.courseId+' 제거');
    button.addEventListener('click',()=>{
      plans[id].splice(index,1);renderAll();
      write('plan-message',id+'안에서 과목을 제거했습니다. 다른 안의 계획은 그대로입니다.');
    });
    row.append(button);root.append(row);
  }
}
function addMetric(root:HTMLElement,label:string,units:number):void{
  const card=document.createElement('div');card.className='credit-card';
  card.append(text('span',label));
  card.append(text('strong',creditsText(units)));
  card.append(text('span','검수된 졸업요건과 무관한 자가 입력 학점'));
  root.append(card);
}
function renderAll():void{
  renderRecords();renderPlanRows();
  const at=today();renderTermChoices(at);
  const root=get('scenario-comparison'),creditRoot=get('credit-overview');
  root.replaceChildren();creditRoot.replaceChildren();
  try{
    const results=SCENARIOS.map(scenario=>compareProvisionalScenario({
      asOf:at,scenario,records,plans:plans[scenario],
    }));
    const first=results[0]!.audit;
    addMetric(creditRoot,'입력된 취득 학점 (확정 아님)',first.earnedCreditUnits);
    addMetric(creditRoot,'입력된 수강 중 학점',first.inProgressCreditUnits);
    if(first.excludedAttempts.length>0){
      const warning=text('p','중복·미완료 학기 등 확인할 기록 '+first.excludedAttempts.length+'건은 합산에서 제외 또는 보류되었습니다.');
      warning.className='small-note';creditRoot.append(warning);
    }
    for(const result of results){
      const card=document.createElement('article');card.className='scenario-card';
      card.append(text('h3',result.scenario+'안 · 앞으로 '+SCENARIO_TERMS[result.scenario]+'학기'));
      card.append(text('p','대상 학기: '+result.terms.join(' · ')));
      const planned=text('p','계획 학점 '+creditsText(result.audit.plannedCreditUnits));
      planned.className='important';card.append(planned);
      const termList=document.createElement('ul');termList.className='term-breakdown';
      for(const term of provisionalTermBreakdown(result)){
        const courseCount=term.countedCourses+'과목';
        const omitted=term.excludedCourses?' · 합산 제외/보류 '+term.excludedCourses+'건':'';
        termList.append(text('li',term.term+' · 계획 학점 '+creditsText(term.countedCreditUnits)
          +' ('+courseCount+omitted+')'));
      }
      card.append(termList);
      card.append(text('p','입력 과목 '+result.rows.length+'건 · 취득 학점 '+creditsText(result.audit.earnedCreditUnits)
        +' · 수강 중 '+creditsText(result.audit.inProgressCreditUnits)));
      const note=text('p','자료 부족 · 공식 학칙·분반이 없어 졸업 가능 시점/계획 추천을 판정하지 않습니다.');
      note.className='warning';card.append(note);
      const exclusions=explainProvisionalExclusions(result,records);
      if(exclusions.length){
        const details=document.createElement('details');details.className='exclusion-details';
        details.append(text('summary','학점 합산에서 제외·보류된 입력 '+exclusions.length+'건 · 이유 확인'));
        const list=document.createElement('ul');list.className='exclusion-list';
        for(const excluded of exclusions){
          const item=document.createElement('li');
          item.append(text('strong',(excluded.origin==='record'?'내 과목 기록':'이 계획의 과목')
            +' · '+excluded.courseId+' · '+excluded.term));
          item.append(text('span',excluded.explanation+' 다음 확인: '+excluded.nextAction));
          list.append(item);
        }
        details.append(list);card.append(details);
      }
      root.append(card);
    }
  }catch(error){
    const message='입력 자료를 계산할 수 없습니다: '+(error instanceof Error?error.message:String(error));
    root.append(text('p',message));creditRoot.append(text('p',message));
  }
}
get<HTMLFormElement>('record-form').addEventListener('submit',event=>{
  event.preventDefault();
  try{
    if(records.length>=MAX_COURSES)throw new RangeError('최대 60과목까지만 입력할 수 있습니다.');
    const row=normalizeStudentCourse({
      courseId:get<HTMLInputElement>('record-course').value,
      credits:Number(get<HTMLInputElement>('record-credits').value),
      term:get<HTMLInputElement>('record-term').value.trim(),
      slot:get<HTMLSelectElement>('record-slot').value as StudentCourse['slot'],
    });
    const candidate=[...records,row],at=today();
    for(const scenario of SCENARIOS)compareProvisionalScenario({
      asOf:at,scenario,records:candidate,plans:plans[scenario],
    });
    records.push(row);get<HTMLInputElement>('record-course').value='';
    renderAll();write('record-message','과목 기록을 추가했습니다. 취득 여부와 학점은 학교의 원문으로 별도 확인해야 합니다.');
  }catch(error){write('record-message',error instanceof Error?error.message:String(error));}
});
get<HTMLFormElement>('plan-form').addEventListener('submit',event=>{
  event.preventDefault();const id=selected();
  try{
    if(plans[id].length>=MAX_COURSES)throw new RangeError('한 계획에는 최대 60과목까지 입력할 수 있습니다.');
    const row=normalizePlanCourse({
      courseId:get<HTMLInputElement>('plan-course').value,
      term:get<HTMLSelectElement>('plan-term').value,
      credits:Number(get<HTMLInputElement>('plan-credits').value),
    });
    compareProvisionalScenario({asOf:today(),scenario:id,records,plans:[...plans[id],row]});
    plans[id].push(row);get<HTMLInputElement>('plan-course').value='';
    renderAll();write('plan-message',id+'안에 과목을 추가했습니다. 개설 여부·선수요건·충돌은 검수 자료가 없어 확인할 수 없습니다.');
  }catch(error){write('plan-message',error instanceof Error?error.message:String(error));}
});
get<HTMLFieldSetElement>('scenario-choice').addEventListener('change',()=>{
  renderAll();write('plan-message','현재 '+selected()+'안의 계획을 편집합니다. 다른 안의 내용은 유지됩니다.');
});
renderAll();
