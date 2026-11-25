// @ts-check
// 실제 학교 수강 데이터가 없는 합성 환경에서 기대점수 최대 신청 순서를 탐색합니다.
import {DIRECT_SUBMIT_MS} from './reaction-profile.mjs';
const requireInteger=(value,min,max,label)=>{
  if(!Number.isSafeInteger(value)||value<min||value>max)throw new RangeError(label+' 입력값을 확인하세요.');
};
export function validateScenario(input){
  if(!input||!Array.isArray(input.courses))throw new RangeError('과목이 없습니다.');
  const c=input.courses;
  requireInteger(c.length,2,MAX_COURSES,'과목 수');
  const ranks=new Set(),ids=new Set();
  for(const course of c){
    if(typeof course?.id!=='string'||!course.id||ids.has(course.id))throw new RangeError('과목 ID가 중복되었습니다.');
    ids.add(course.id);
    if(typeof course.name!=='string'||!course.name.trim()||course.name.length>30)
      throw new RangeError('과목 이름은 1~30자로 입력하세요.');
    requireInteger(course.rank,1,c.length,'중요 순위');
    if(ranks.has(course.rank))throw new RangeError('중요 순위는 1부터 과목 수까지 중복 없이 설정하세요.');
    ranks.add(course.rank);
    requireInteger(course.capacity,1,300,'정원');
    requireInteger(course.rivals,0,200,'경쟁자');
  }
  requireInteger(input.seed,0,4294967295,'실험 식별값');
  requireInteger(input.trials,100,5000,'실험 반복 수');
  for(const key of ['startDelayMs','actionMs','jitterMs']){
    requireInteger(input[key],key==='actionMs'?300:0,key==='actionMs'?3000:key==='jitterMs'?1500:5000,key);
  }
  return input;
}
const MAX_COURSES=8;
// 합성 모형의 초기 가정이며 관측 데이터에서 추정한 모수가 아닙니다.
export const RIVAL_REACTION_MEAN_MS=270;
export const RIVAL_GROUP_SHIFT_MS=30;
export const RIVAL_LOG_SD=0.35;
export const RIVAL_ACTION_JITTER_MS=25;
export const RIVAL_TAIL_MEAN_MS=35;
const MIN_REACTION_MS=80;
const PREFERENCE_LOG_SD=0.7;
const TARGET_WIDTH_PX=60;
const TARGET_DISTANCE_MIN_PX=80;
const TARGET_DISTANCE_SPAN_PX=400;
const FITTS_SLOPE_MS=110;
// 가장 경쟁자가 많은 과목을 신청할 조건부 중복 확률의 합성 시나리오입니다.
const OVERLAP={less:0.25,baseline:0.5,more:0.75};
// 모집단 진입의 혼합분포 및 과목 수는 실측 보정값이 아닙니다.
const READY_SHARE=0.75;
const LATE_ENTRY_MS=30000;
const MIN_RIVAL_COURSES=5;
export function competitorPopulation(maxRivals,overlap){
  return Math.ceil(maxRivals/overlap);
}
export function rivalStartMs(unit,readyShare=READY_SHARE){
  return unit<readyShare?0:LATE_ENTRY_MS*(unit-readyShare)/(1-readyShare);
}
// 전략 실험 전용 1~3초(양 끝 포함)의 가상 대기 범위입니다. 실제 학교 서버 측정값이 아닙니다.
export const REQUEST_WAIT_MIN_MS=1000;
export const REQUEST_WAIT_MAX_EXCLUSIVE_MS=3001;
// 단일 논리적 서버의 회복 후 건당 처리시간입니다.
export const SERVER_SERVICE_MS=10;
const SERVICE_PHASES=[{until:2000,ms:20},{until:5000,ms:12.5}];
/** 시간대별 처리율을 적분해 요청 한 건의 작업량이 완료되는 시각을 구합니다.
 * @param {number} start 처리 시작 시각
 */
export function serviceFinishMs(start){
  let time=start,remaining=1;
  for(const {until,ms} of SERVICE_PHASES){
    if(time>=until)continue;
    const work=(until-time)/ms;
    if(work>=remaining)return time+remaining*ms;
    remaining-=work;
    time=until;
  }
  return time+remaining*SERVER_SERVICE_MS;
}
/** 가상 화면의 목표 크기와 이동 거리로 선택·확인 시간을 계산합니다.
 * @param {number} distance 목표까지의 거리(px)
 * @param {number} width 목표의 유효 폭(px)
 */
export function fittsTimeMs(distance,width){
  return DIRECT_SUBMIT_MS+FITTS_SLOPE_MS*(Math.log2(1+distance/width)-Math.log2(5));
}
function movementMs(seed,trial,id,slot){
  const distance=TARGET_DISTANCE_MIN_PX+TARGET_DISTANCE_SPAN_PX*random01(seed,trial,id,slot);
  return fittsTimeMs(distance,TARGET_WIDTH_PX);
}
function random01(seed,trial,stream,draw){
  let x=(seed^Math.imul(trial+1,0x9e3779b9)^
    Math.imul(stream+3,0x85ebca6b)^Math.imul(draw+17,0xc2b2ae35))>>>0;
  x=Math.imul(x^(x>>>16),0x7feb352d);
  x=Math.imul(x^(x>>>15),0x846ca68b);
  return (((x^(x>>>16))>>>0)+0.5)/4294967296;
}
/** @param {number} unit 0 이상 1 미만의 균등 난수 */
export function requestWaitMs(unit){
  return REQUEST_WAIT_MIN_MS+Math.floor(unit*(REQUEST_WAIT_MAX_EXCLUSIVE_MS-REQUEST_WAIT_MIN_MS));
}
/**
 * 참가자별 다음 요청만 최소 힙에 유지하는 공통 FCFS 이산사건 모형입니다.
 * 응답 기본시간에는 서버 처리시간을 포함합니다. 응답 대기가 서버를 점유하지 않습니다.
 * @param {{id:number,startMs:number,actions:number[],delays:number[],courses:number[]}[]} agents 참가자별 행동·기본 응답시간
 * @param {(agent:typeof agents[number],slot:number,arrival:number,start:number,processed:number,reply:number)=>void|boolean|number} onProcessed 처리된 요청 (false면 이후 요청 처리 중단)
 */
export function runSharedQueue(agents,onProcessed){
  const heap=agents.filter(agent=>agent.actions.length).map(agent=>({
    agent,slot:0,arrival:agent.startMs+agent.actions[0],
  }));
  // 요청 도착시각이 같으면 고정 참가자 ID 순서를 사용합니다. 본인 ID는 가장 큽니다.
  const earlier=(a,b)=>a.arrival<b.arrival||(a.arrival===b.arrival&&a.agent.id<b.agent.id);
  function down(i){
    const node=heap[i];
    while(i*2+1<heap.length){
      let child=i*2+1;
      if(child+1<heap.length&&earlier(heap[child+1],heap[child]))child++;
      if(!earlier(heap[child],node))break;
      heap[i]=heap[child];i=child;
    }
    heap[i]=node;
  }
  for(let i=(heap.length>>1)-1;i>=0;i--)down(i);
  let available=0;
  while(heap.length){
    const node=heap[0],{agent,slot,arrival}=node;
    const start=Math.max(arrival,available);
    const processed=serviceFinishMs(start);
    const reply=Math.max(processed,start+agent.delays[slot]);
    available=processed;
    if(onProcessed(agent,slot,arrival,start,processed,reply)===false)return;
    // 같은 참가자의 다음 요청은 응답 완료 후에만 대기열에 들어옵니다.
    node.slot++;
    if(node.slot<agent.actions.length){
      node.arrival=reply+agent.actions[node.slot];
    }else{
      const last=heap.pop();
      if(!heap.length)break;
      heap[0]=last;
    }
    down(0);
  }
}
/** @param {number} seed 난수 시드 @param {number} trial 회차 @param {number} stream 난수 계열 @param {number} slot 신청 순번 */
function normal01(seed,trial,stream,slot){
  const u1=random01(seed,trial,stream,slot*2),u2=random01(seed,trial,stream,slot*2+1);
  return Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);
}
function userAgent(s,trial,id){
  const actions=[],delays=[];
  for(let slot=0;slot<s.courses.length;slot++){
    const z=normal01(s.seed,trial,100,slot);
    const reaction=Math.max(MIN_REACTION_MS,s.actionMs-DIRECT_SUBMIT_MS+s.jitterMs*z);
    actions.push(reaction+movementMs(s.seed^0x2f6e2b1d,trial,0,slot));
    delays.push(requestWaitMs(random01(s.seed^0x38b77c19,trial,100,slot)));
  }
  return {id,startMs:s.startDelayMs,actions,delays,courses:[]};
}

/** 같은 회차에서는 모든 경쟁자 및 세 후보군 가정이 동일한 집단 평균을 사용합니다.
 * @param {number} seed 실험 시드
 * @param {number} trial 회차
 */
export function rivalGroupMeanMs(seed,trial){
  return RIVAL_REACTION_MEAN_MS+RIVAL_GROUP_SHIFT_MS*(2*random01(seed^0x6a09e667,trial,0,0)-1);
}
/** 이동 로그정규 사전분포로 개인별 고유 반응 위치를 한 번 추출합니다.
 * 지수 꼬리의 평균을 미리 빼므로 절단 전 집단 평균이 설정값과 일치합니다.
 * @param {number} groupMeanMs 회차별 집단 평균
 * @param {number} z 표준 정규 난수
 */
export function rivalReactionMs(groupMeanMs,z){
  const scale=groupMeanMs-MIN_REACTION_MS-RIVAL_TAIL_MEAN_MS;
  return MIN_REACTION_MS+scale*Math.exp(RIVAL_LOG_SD*z-RIVAL_LOG_SD**2/2);
}
/** 개인 위치를 유지하고 정규 변동과 지수 꼬리로 신청별 반응을 생성합니다.
 * @param {number} personalMs 개인별 고유 반응 위치
 * @param {number} z 표준 정규 난수
 * @param {number} unit 열린 구간 (0,1)의 균등 난수
 * @param {number} movement 선택·확인 시간
 */
export function rivalActionMs(personalMs,z,unit,movement){
  const tail=-RIVAL_TAIL_MEAN_MS*Math.log(unit);
  return movement+Math.max(MIN_REACTION_MS,personalMs+RIVAL_ACTION_JITTER_MS*z+tail);
}

/** @param {{capacity:number,rivals:number}} course 가상 과목 */
export function urgencyWeight({capacity,rivals}){
  return Math.sqrt(1+rivals/capacity);
}

function assignCourses(courses,population,seed,trial){
  const portfolios=Array.from({length:population},()=>[]);
  const candidates=Array.from({length:population},(_,i)=>i);
  const membershipSeed=seed^0x5f9b0163;
  for(const [index,{rivals}] of courses.entries()){
    for(let i=0;i<rivals;i++){
      const j=i+Math.floor(random01(membershipSeed,trial,index,i)*(population-i));
      [candidates[i],candidates[j]]=[candidates[j],candidates[i]];
      portfolios[candidates[i]].push(index);
    }
  }
  return portfolios;
}

export function rivalOrder(known,urgency,draw,preference){
  // 개인의 전체 신청량은 입력 목록에 속한 과목 수와 별도로 뽑고 배정 수 이상을 보장합니다.
  const size=Math.max(known.length,MIN_RIVAL_COURSES+Math.floor(draw()*(MAX_COURSES-MIN_RIVAL_COURSES+1)));
  // 지수 경주로 개인별 가중 Plackett–Luce 순열을 생성합니다.
  const entries=known.map((course,index)=>({course,key:-Math.log(draw())/(urgency[course]*preference(index))}));
  // 기타 과목에도 입력 과목의 가상 경쟁률 분포를 적용하여 입력 여부에 따른 편향을 줄입니다.
  while(entries.length<size){
    const backgroundWeight=urgency[Math.floor(draw()*urgency.length)];
    entries.push({course:-1,key:-Math.log(draw())/(backgroundWeight*preference(entries.length))});
  }
  return entries.sort((a,b)=>a.key-b.key).map(({course})=>course);
}

function simulateTrial(s,urgency,population,trial,readyShare=READY_SHARE){
  const player=userAgent(s,trial,population);
  const agents=[player];
  const portfolios=assignCourses(s.courses,population,s.seed,trial);
  const timingSeed=s.seed^0x729ab44d;
  const groupMean=rivalGroupMeanMs(s.seed,trial);
  for(const [rival,known] of portfolios.entries()){
    if(!known.length)continue;
    let count=0;
    const draw=()=>random01(timingSeed,trial,rival,count++);
    const personalMs=rivalReactionMs(groupMean,normal01(s.seed^0x3c6ef372,trial,rival,0));
    const preference=index=>Math.exp(PREFERENCE_LOG_SD*normal01(s.seed^0x55b7a821,trial,rival,index));
    const courses=rivalOrder(known,urgency,draw,preference);
    const actions=courses.map((_,slot)=>rivalActionMs(
      personalMs,normal01(s.seed^0x7c81f307,trial,rival,slot),
      random01(s.seed^0x3f67a5d9,trial,rival,slot),
      movementMs(s.seed^0x1a9b42f3,trial,rival,slot),
    ));
    const delays=courses.map((_,slot)=>requestWaitMs(random01(s.seed^0x19b4c5d7,trial,rival,slot)));
    const startMs=rivalStartMs(random01(s.seed^0x42cefe21,trial,rival,0),readyShare);
    agents.push({id:rival,startMs,actions,delays,courses});
  }
  const times=[],closing=s.courses.map(()=>Infinity),counts=new Uint16Array(s.courses.length);
  let totalWaitMs=0,queueWaitMs=0,completionMs=0;
  // 처리율은 시각에만 의존하며 과목 종류·성공 여부와 무관합니다.
  // 이동 거리도 과목이 아닌 신청 순번별로 추출하므로 기존 DP가 유효합니다.
  runSharedQueue(agents,(agent,slot,arrival,start,processed,reply)=>{
    if(agent===player){
      times.push(processed);
      totalWaitMs+=reply-arrival;
      queueWaitMs+=start-arrival;
      completionMs=reply;
      // 마지막 본인 요청 이후의 마감은 모든 본인 처리시각보다 늦으므로 생략할 수 있습니다.
      if(slot===player.actions.length-1)return false;
    }else{
      const course=agent.courses[slot];
      if(course>=0&&++counts[course]===s.courses[course].capacity)closing[course]=processed;
    }
  });
  return {times,closing,totalWaitMs,queueWaitMs,completionMs};
}

/** 비트마스크 DP로 8개 과목의 기대 가중 점수를 최대화합니다. */
export function bestOrder(weights,probability){
  const n=weights.length,size=1<<n;
  const dp=Array(size).fill(-Infinity),parent=Array(size).fill(null);
  dp[0]=0;
  for(let mask=0;mask<size-1;mask++){
    if(!Number.isFinite(dp[mask]))continue;
    let pos=0;
    for(let bit=mask;bit;bit&=bit-1)pos++;
    for(let j=0;j<n;j++){
      if(mask&(1<<j))continue;
      const next=mask|(1<<j);
      const score=dp[mask]+weights[j]*probability[j][pos];
      if(score>dp[next]+1e-12){dp[next]=score;parent[next]={mask,index:j};}
    }
  }
  const order=[];let mask=size-1;
  while(mask){
    const step=parent[mask];
    if(!step)throw new Error('전략 순서를 계산하지 못했습니다.');
    order.push(step.index);mask=step.mask;
  }
  return order.reverse();
}
/**
 * 반복 실험에서 얻은 비율의 95% Wilson 구간입니다. 유한 반복 수로 생긴 표본 오차만 나타내며,
 * 경쟁자 수·도착 시각 같은 합성 가정이 틀렸을 때의 오차(모형 불확실성)는 포함하지 않습니다.
 * @param {number} successes 성공 횟수
 * @param {number} trials 반복 수
 * @returns {[number,number]} 하한·상한(0~1)
 */
export function wilsonInterval(successes,trials){
  if(!Number.isSafeInteger(trials)||trials<1||!Number.isSafeInteger(successes)||successes<0||successes>trials)
    throw new RangeError('성공 횟수와 반복 수를 확인하세요.');
  const z=1.959963984540054,p=successes/trials,z2=z*z;
  const center=(p+z2/(2*trials))/(1+z2/trials);
  const half=z*Math.sqrt(p*(1-p)/trials+z2/(4*trials*trials))/(1+z2/trials);
  // 성공 0회·전부 성공은 해당 끝값이 정확히 0·1이다. 부동소수점 잔차(예: 3e-18)가 표시되지 않게 고정한다.
  return [successes===0?0:Math.max(0,center-half),successes===trials?1:Math.min(1,center+half)];
}
/** 같은 경쟁자가 여러 과목을 신청하는 선착순 경쟁을 회차별로 계산합니다. */
export function simulate(raw){
  validateScenario(raw);
  const s={...raw,courses:[...raw.courses].sort((a,b)=>a.id<b.id?-1:1)};
  const n=s.courses.length;
  const urgency=s.courses.map(urgencyWeight);
  const mostRivals=Math.max(...s.courses.map(c=>c.rivals));
  // 과목을 더 입력했다고 후보군이 자동으로 커지지 않도록 최대 수요로 규모를 고정합니다.
  const population=overlap=>competitorPopulation(mostRivals,overlap);
  const guaranteed=s.courses.every(course=>course.capacity>course.rivals);
  const success=Array.from({length:n},()=>new Float64Array(n));
  const baseline=population(OVERLAP.baseline);
  if(guaranteed)for(const row of success)row.fill(s.trials);
  else for(let trial=0;trial<s.trials;trial++){
    const {times,closing}=simulateTrial(s,urgency,baseline,trial);
    for(let j=0;j<n;j++){
      for(let slot=0;slot<n;slot++){
        if(times[slot]<closing[j])success[j][slot]++;
      }
    }
  }
  const probability=success.map(row=>Array.from(row,v=>v/s.trials));
  const weights=s.courses.map(c=>n-c.rank+1);
  const order=bestOrder(weights,probability);
  const sum=weights.reduce((a,b)=>a+b,0);
  const meanScore=order.reduce((score,j,slot)=>score+weights[j]*probability[j][slot],0)*100/sum;
  // 평가 표본과 추천 순서 선택 표본을 분리합니다. 규모와 진입 조건이 같은 경우에만 재사용합니다.
  const evaluated=new Map();
  function evaluate(size,readyShare=READY_SHARE){
    const key=size+':'+readyShare;
    if(evaluated.has(key))return evaluated.get(key);
    let wins=0,totalWaitMs=0,queueWaitMs=0,completionMs=0;
    const courseWins=new Uint32Array(n);
    for(let trial=s.trials;trial<2*s.trials;trial++){
      const sample=simulateTrial(s,urgency,size,trial,readyShare);
      let won=0;
      for(let slot=0;slot<n;slot++){
        if(sample.times[slot]<sample.closing[order[slot]]){
          courseWins[slot]++;
          won++;
        }
      }
      if(won===n)wins++;
      totalWaitMs+=sample.totalWaitMs;
      queueWaitMs+=sample.queueWaitMs;
      completionMs+=sample.completionMs;
    }
    const courseSuccess=Array.from(courseWins,count=>count/s.trials);
    const value={wins,courseSuccess,expectedCourses:courseSuccess.reduce((a,b)=>a+b,0),timing:{
      meanWaitMs:Math.round(totalWaitMs/s.trials),
      meanQueueWaitMs:Math.round(queueWaitMs/s.trials),
      meanCompletionMs:Math.round(completionMs/s.trials),
    }};
    evaluated.set(key,value);
    return value;
  }
  const base=evaluate(baseline);
  const allWins=overlap=>guaranteed?s.trials:evaluate(population(overlap)).wins;
  const sensitivity={lessOverlap:allWins(OVERLAP.less),moreOverlap:allWins(OVERLAP.more),
    synchronized:guaranteed?s.trials:evaluate(baseline,1).wins};
  // 표시용 불확실성: 반복 실험의 표본 오차(Wilson 95%)와, 합성 가정을 바꿨을 때 전체 성공률이 움직인 범위를 분리합니다.
  // 정원이 경쟁자보다 많은 과목만 있으면 계산상 항상 성공하므로 구간이 [1,1]입니다.
  const assumptionWins=[base.wins,sensitivity.lessOverlap,sensitivity.moreOverlap,sensitivity.synchronized];
  const uncertainty={
    method:'WILSON_95_SAMPLING_ONLY',
    allWins:guaranteed?[1,1]:wilsonInterval(base.wins,s.trials),
    courseSuccess:base.courseSuccess.map(p=>guaranteed?[1,1]:wilsonInterval(Math.round(p*s.trials),s.trials)),
    assumptionRange:{min:Math.min(...assumptionWins)/s.trials,max:Math.max(...assumptionWins)/s.trials},
  };
  return {
    seed:s.seed,trials:s.trials,order:order.map(index=>s.courses[index].name),
    ranks:order.map(index=>s.courses[index].rank),
    allWins:base.wins,meanScore,
    courseSuccess:base.courseSuccess,expectedCourses:base.expectedCourses,
    sensitivity,uncertainty,
    timing:base.timing,
    serverServiceMs:SERVER_SERVICE_MS,
    guaranteed,
    model:'SYNTHETIC_ONLY',
  };
}
