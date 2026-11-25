import test from 'node:test';
import assert from 'node:assert/strict';
import {simulate,validateScenario,bestOrder,rivalOrder,urgencyWeight,requestWaitMs,runSharedQueue,REQUEST_WAIT_MIN_MS,REQUEST_WAIT_MAX_EXCLUSIVE_MS,SERVER_SERVICE_MS,rivalGroupMeanMs,rivalReactionMs,rivalActionMs,fittsTimeMs,serviceFinishMs,competitorPopulation,rivalStartMs} from '../js/strategy-engine.mjs';
const input=()=>({
  seed:123456789,trials:120,startDelayMs:200,actionMs:800,jitterMs:100,
  courses:[
    {id:'A',name:'가상 A',rank:1,capacity:8,rivals:30},
    {id:'B',name:'가상 B',rank:2,capacity:20,rivals:50},
    {id:'C',name:'가상 C',rank:3,capacity:20,rivals:30},
  ],
});
test('시드가 같으면 최적 신청 순서와 가상 성공 확률이 같다',()=>{
  assert.deepEqual(simulate(input()),simulate(input()));
});
test('가상 결과와 순서는 범위 및 과목 개수를 준수한다',()=>{
  const r=simulate(input());
  assert.equal(r.order.length,3);
  assert.ok(Number.isInteger(r.allWins)&&r.allWins>=0&&r.allWins<=r.trials);
  assert.ok(r.meanScore>=0&&r.meanScore<=100);
  assert.equal(r.model,'SYNTHETIC_ONLY');
  assert.equal(r.courseSuccess.length,3);
  assert.ok(r.courseSuccess.every(p=>p>=0&&p<=1));
  assert.ok(Math.abs(r.expectedCourses-r.courseSuccess.reduce((a,b)=>a+b,0))<1e-12);
  assert.ok(r.courseSuccess.every(p=>p>=r.allWins/r.trials));
  assert.ok(Number.isInteger(r.sensitivity.synchronized)&&r.sensitivity.synchronized>=0&&r.sensitivity.synchronized<=r.trials);
});
test('가상 정원이 충분하면 모든 과목 성공 확률은 100%다',()=>{
  const s=input();
  s.courses.forEach(c=>{c.capacity=50;c.rivals=1;});
  const result=simulate(s);
  assert.equal(result.allWins,s.trials);
  assert.equal(result.guaranteed,true);
  assert.equal(result.sensitivity.synchronized,s.trials);
  assert.equal(result.expectedCourses,s.courses.length);
  assert.deepEqual(result.courseSuccess,[1,1,1]);
});
test('경쟁자가 없으면 모든 과목에 성공한다',()=>{
  const s=input();s.courses.forEach(c=>{c.rivals=0;});
  assert.equal(simulate(s).allWins,s.trials);
});
test('1이 가장 높은 중요 순위이고 중복 순위를 거부한다',()=>{
  const s=input();s.courses[2].rank=1;
  assert.throws(()=>validateScenario(s),/중복/);
});
test('사용자 도착률/수동순서 입력 없이 유효한 전략을 계산한다',()=>{
  const s=input();
  assert.ok(s.courses.every(c=>!('rate' in c)&&!('manualOrder' in c)));
  assert.equal(bestOrder([3,2],[[1,.5],[.8,.7]]).length,2);
});
test('정수·표본 범위 검증을 유지한다',()=>{
  const s=input();s.courses[1].capacity=-2;
  assert.throws(()=>simulate(s),/범위|확인/);
});

test('가상 정원은 300까지 허용하고 301부터 거부한다',()=>{
  const limit=input();
  limit.courses[0].capacity=300;
  assert.doesNotThrow(()=>validateScenario(limit));
  assert.equal(simulate(limit).order.length,limit.courses.length);
  limit.courses[0].capacity=301;
  assert.throws(()=>validateScenario(limit),{name:'RangeError',message:'정원 입력값을 확인하세요.'});
});
test('경쟁자는 입력 목록 밖의 과목을 먼저 신청할 수 있고 최대 8과목을 선택한다',()=>{
  const draws=[.99,.4];
  const order=rivalOrder([0],[1],()=>draws.shift()??.9,()=>1);
  assert.equal(order.length,8);
  assert.equal(order.at(-1),0);
  assert.equal(order.filter(course=>course<0).length,7);
});
test('같은 난수에서 정원 대비 경쟁자가 많아지면 해당 과목이 앞설 수 있다',()=>{
  const order=capacity=>{
    const weights=[urgencyWeight({capacity,rivals:50}),urgencyWeight({capacity:20,rivals:50})];
    const draws=[0,.2,.5];
    return rivalOrder([0,1],weights,()=>draws.shift()??.01,()=>1).filter(course=>course>=0);
  };
  assert.deepEqual(order(20),[1,0]);
  assert.deepEqual(order(1),[0,1]);
});
test('같은 순서의 전체 성공 횟수는 입력 행 순서와 무관하고 복수 과목 신청 정도에 반응한다',()=>{
  const s={...input(),trials:1000,startDelayMs:0,actionMs:580,jitterMs:60};
  s.courses[2].rivals=50;
  const result=simulate(s);
  assert.equal(result.guaranteed,false);
  assert.ok(result.allWins>0&&result.allWins<s.trials);
  assert.notEqual(result.sensitivity.lessOverlap,result.sensitivity.moreOverlap);
  assert.deepEqual(simulate({...s,courses:[...s.courses].reverse()}),result);
});
test('한 과목만 경합할 때 정원이 증가하면 최적 기대점수가 낮아지지 않는다',()=>{
  const s=input();
  s.courses[0].rivals=200;
  s.courses[1].capacity=300;
  s.courses[2].capacity=300;
  let previous=-1;
  for(const capacity of [1,50,51,200,201,300]){
    s.courses[0].capacity=capacity;
    const {meanScore}=simulate(s);
    assert.ok(meanScore>=previous-1e-10);
    previous=meanScore;
  }
  s.courses[0].capacity=1;
  assert.ok(simulate(s).meanScore<previous);
  s.courses[0].rivals=0;
  assert.ok(Math.abs(simulate(s).meanScore-previous)<1e-10);
});
test('DP 점수를 세 과목의 모든 신청 순서와 비교한다',()=>{
  const weights=[3,2,1];
  const probability=[[.95,.91,.85],[.97,.6,.1],[1,.7,.5]];
  const orders=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  const score=order=>order.reduce((total,i,slot)=>total+weights[i]*probability[i][slot],0);
  assert.equal(score(bestOrder(weights,probability)),Math.max(...orders.map(score)));
});
test('순위 범위와 잘못된 시간·시드를 거부한다',()=>{
  const s=input();
  s.courses[0].rank=4;
  assert.throws(()=>validateScenario(s),/중요 순위/);
  for(const invalid of [{seed:-1},{seed:2**32},{actionMs:NaN},{startDelayMs:5001},{jitterMs:1501}]){
    assert.throws(()=>validateScenario({...input(),...invalid}),RangeError);
  }
});

test('전략 실험 전용 모의 대기시간은 1000~3000ms의 양 끝을 포함한다',()=>{
  assert.equal(REQUEST_WAIT_MIN_MS,1000);
  assert.equal(REQUEST_WAIT_MAX_EXCLUSIVE_MS,3001);
  assert.equal(requestWaitMs(0),1000);
  assert.equal(requestWaitMs(.5),2000);
  assert.equal(requestWaitMs(.999999),3000);
});
test('동시에 도착한 요청과 이후 요청은 공통 서버에서 순차 처리되고 응답 후 다음 요청이 도착한다',()=>{
  assert.equal(SERVER_SERVICE_MS,10);
  const agents=[
    {id:2,startMs:0,actions:[100,50],delays:[1000,1000],courses:[]},
    {id:0,startMs:0,actions:[105],delays:[3000],courses:[-1]},
    {id:1,startMs:0,actions:[100,50],delays:[1000,1000],courses:[0,1]},
  ];
  const original=structuredClone(agents);
  const events=[];
  runSharedQueue(agents,(agent,slot,arrival,start,processed,reply)=>events.push([agent.id,slot,arrival,start,processed,reply]));
  assert.deepEqual(events,[
    [1,0,100,100,120,1100],
    [2,0,100,120,140,1120],
    [0,0,105,140,160,3140],
    [1,1,1150,1150,1170,2150],
    [2,1,1170,1170,1190,2170],
  ]);
  assert.deepEqual(agents,original);
  assert.equal(events[1][5]-events[1][2],1020);
  assert.equal(events[2][5]-events[2][2],3035);
});
test('최소 힙 대기열은 독립적인 정렬 기반 FCFS 기준 구현과 일치한다',()=>{
  const agents=Array.from({length:23},(_,id)=>({
    id,startMs:id%3,actions:Array.from({length:1+id%8},(_,slot)=>460+(id*17+slot*47)%280),
    delays:Array.from({length:1+id%8},(_,slot)=>1000+(id*197+slot*397)%2001),courses:[],
  }));
  const actual=[];
  runSharedQueue(agents,(agent,slot,arrival,start,processed,reply)=>actual.push([agent.id,slot,arrival,start,processed,reply]));
  const pending=agents.map(agent=>({agent,slot:0,arrival:agent.startMs+agent.actions[0]}));
  const expected=[];
  let available=0;
  while(pending.length){
    pending.sort((a,b)=>a.arrival-b.arrival||a.agent.id-b.agent.id);
    const {agent,slot,arrival}=pending.shift();
    const start=Math.max(arrival,available);
    // 누적 처리량과 역함수를 이용한 독립 기준 구현입니다.
    const work=t=>t<=2000?t/20:t<=5000?100+(t-2000)/12.5:340+(t-5000)/10;
    const time=w=>w<=100?w*20:w<=340?2000+(w-100)*12.5:5000+(w-340)*10;
    available=time(work(start)+1);
    const reply=start+agent.delays[slot];
    expected.push([agent.id,slot,arrival,start,available,reply]);
    if(slot+1<agent.actions.length)pending.push({agent,slot:slot+1,arrival:reply+agent.actions[slot+1]});
  }
  assert.equal(actual.length,expected.length);
  for(let i=0;i<actual.length;i++){
    assert.deepEqual(actual[i].slice(0,2),expected[i].slice(0,2));
    assert.ok(actual[i].slice(2).every((value,j)=>Math.abs(value-expected[i][j+2])<1e-8));
  }
  const reversed=[];
  runSharedQueue([...agents].reverse(),(agent,slot,arrival,start,processed,reply)=>reversed.push([agent.id,slot,arrival,start,processed,reply]));
  assert.deepEqual(reversed,actual);
});
test('정원이 충분해도 모든 신청의 대기시간을 계산하고 평균 소요시간에 포함한다',()=>{
  const s=input();
  s.courses.forEach(c=>{c.capacity=300;c.rivals=0;});
  const r=simulate(s);
  assert.equal(r.guaranteed,true);
  assert.equal(r.allWins,s.trials);
  assert.ok(r.timing.meanWaitMs>=s.courses.length*1000);
  assert.ok(r.timing.meanWaitMs<=s.courses.length*3000);
  assert.ok(r.timing.meanCompletionMs>=r.timing.meanWaitMs+s.startDelayMs+s.courses.length*(80+fittsTimeMs(80,60)));
  assert.equal(r.timing.meanQueueWaitMs,0);
  assert.equal(r.serverServiceMs,10);
  assert.deepEqual(r.timing,simulate(s).timing);
  const contested=simulate(input());
  assert.ok(contested.timing.meanQueueWaitMs>0);
  // 같은 사용자 난수를 쓰므로 차이는 공통 대기열에서 추가된 혼잡 대기입니다.
  assert.ok(Math.abs(contested.timing.meanWaitMs-r.timing.meanWaitMs-contested.timing.meanQueueWaitMs)<=1);
  assert.ok(Math.abs(contested.timing.meanCompletionMs-r.timing.meanCompletionMs-contested.timing.meanQueueWaitMs)<=1);
  const guaranteed={...input(),courses:input().courses.map(c=>({...c,capacity:300}))};
  const g=simulate(guaranteed);
  assert.equal(g.allWins,g.trials);
  assert.ok(g.timing.meanQueueWaitMs>0);
  assert.ok(Math.abs(g.timing.meanWaitMs-r.timing.meanWaitMs-g.timing.meanQueueWaitMs)<=1);
});

test('회차별 경쟁 집단 평균은 시드로 재현되고 240~300ms 범위에서 중심이 270ms인 균등분포를 사용한다',()=>{
  const seed=123456789;
  const means=Array.from({length:2000},(_,b)=>rivalGroupMeanMs(seed,b));
  assert.deepEqual(means,means.map((_,b)=>rivalGroupMeanMs(seed,b)));
  assert.ok(means.every(x=>x>=240&&x<=300));
  assert.ok(Math.min(...means)<241&&Math.max(...means)>299);
  const average=means.reduce((a,b)=>a+b,0)/means.length;
  assert.ok(Math.abs(average-270)<2);
  assert.notEqual(rivalGroupMeanMs(seed,0),rivalGroupMeanMs(seed,1));
});
test('이동 로그정규 개인 위치의 변화와 Ex-Gaussian 신청 지연을 반영한다',()=>{
  const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9);
  near(rivalReactionMs(270,0),80+155*Math.exp(-(0.35**2)/2));
  assert.ok(rivalReactionMs(270,-1)<rivalReactionMs(270,1));
  assert.ok(rivalReactionMs(240,0)<rivalReactionMs(300,0));
  near(rivalActionMs(200,0,Math.exp(-1),380),615);
  near(rivalActionMs(200,1,Math.exp(-1),380),640);
  near(rivalActionMs(200,-1,Math.exp(-1),380),590);
  near(rivalActionMs(80,-10,.9,380),460);
  assert.ok(rivalActionMs(200,0,.01,380)>rivalActionMs(200,0,.9,380));
  assert.ok(rivalActionMs(240,0,.5,380)>rivalActionMs(180,0,.5,380));
});
test('Fitts 조작시간은 거리에 따라 증가하고 버튼 폭에 따라 감소한다',()=>{
  assert.equal(fittsTimeMs(240,60),380);
  assert.ok(fittsTimeMs(80,60)<fittsTimeMs(480,60));
  assert.ok(fittsTimeMs(240,120)<fittsTimeMs(240,60));
});
test('비정상 대기열은 시간대 경계에서 남은 작업량을 정확히 처리한다',()=>{
  assert.equal(serviceFinishMs(100),120);
  assert.equal(serviceFinishMs(1990),2006.25);
  assert.equal(serviceFinishMs(2000),2012.5);
  assert.equal(serviceFinishMs(4995),5006);
  assert.equal(serviceFinishMs(5000),5010);
  assert.equal(serviceFinishMs(10000),10010);
});
test('개인별 선호가 같으면 기존 가중 선택으로 환원되고 선호가 다르면 순서가 바뀐다',()=>{
  const pick=preference=>{
    const draws=[0,.5,.5];
    return rivalOrder([0,1],[1,1],()=>draws.shift()??.01,preference).filter(course=>course>=0);
  };
  assert.deepEqual(pick(()=>1),[0,1]);
  assert.deepEqual(pick(i=>i===1?4:1),[1,0]);
});

test('후보군 규모는 과목 수의 합계가 아니라 최대 수요와 중복 확률에 의해 결정된다',()=>{
  assert.equal(competitorPopulation(0,.5),0);
  assert.equal(competitorPopulation(50,.25),200);
  assert.equal(competitorPopulation(50,.5),100);
  assert.equal(competitorPopulation(50,.75),67);
  assert.equal(competitorPopulation(51,.75),68);
});
test('진입 혼합분포는 즉시 시작과 지연 시작을 구분하고 동시 시작 조건을 지원한다',()=>{
  assert.equal(rivalStartMs(.5),0);
  assert.equal(rivalStartMs(.75),0);
  assert.equal(rivalStartMs(.875),15000);
  assert.ok(rivalStartMs(.9999)>29900);
  assert.equal(rivalStartMs(.9999,1),0);
});
test('전체 신청량은 입력 과목 수에만 의존하지 않으며 모든 배정 과목을 보존한다',()=>{
  for(let n=1;n<=8;n++){
    const known=Array.from({length:n},(_,i)=>i);
    const selected=rivalOrder(known,Array(n).fill(1),()=>.01,()=>1);
    assert.equal(selected.length,Math.max(5,n));
    assert.deepEqual(selected.filter(i=>i>=0).sort((a,b)=>a-b),known);
  }
});
test('목록 밖 과목과 입력 과목의 경쟁 가중치가 같은 비율로 변하면 선택 순서가 유지된다',()=>{
  const pick=w=>{
    const draws=[.99,.2,.8,.1,.65,.4,.3,.2,.7,.9,.6,.3,.6,.2,.8];
    return rivalOrder([0,1],[w,w],()=>draws.shift()??.7,()=>1);
  };
  assert.deepEqual(pick(1),pick(4));
});
test('마지막 본인 요청 이후 처리 생략은 대기열의 해당 시점까지의 결과를 바꾸지 않는다',()=>{
  const agents=[
    {id:0,startMs:0,actions:[600,600],delays:[1000,1000],courses:[0,1]},
    {id:1,startMs:0,actions:[650,650],delays:[2000,2000],courses:[]},
    {id:2,startMs:30000,actions:[500],delays:[1000],courses:[0]},
  ];
  const all=[],prefix=[];
  runSharedQueue(agents,(agent,slot,arrival,start,end,reply)=>all.push([agent.id,slot,arrival,start,end,reply]));
  runSharedQueue(agents,(agent,slot,arrival,start,end,reply)=>{
    prefix.push([agent.id,slot,arrival,start,end,reply]);
    if(agent.id===1&&slot===1)return false;
  });
  const last=all.findIndex(event=>event[0]===1&&event[1]===1);
  assert.deepEqual(prefix,all.slice(0,last+1));
  assert.ok(all.length>prefix.length);
});

// #134 계산 모델 검증: 입력 경계, 결정성, DP 최적성, 포화 구간, 단조성, 불확실성 표시.
// 모든 과목·정원·경쟁자는 가상 값이며 실제 학교 경쟁률이 아니다.
import {wilsonInterval} from '../js/strategy-engine.mjs';
const small=()=>({...input(),trials:100});
test('입력 경계: 정원 1·50·51·200·300 허용, 0·301 거부 / 경쟁자 0·200 허용, -1·201 거부',()=>{
  for(const capacity of [1,50,51,200,300])assert.doesNotThrow(()=>validateScenario({...small(),courses:small().courses.map(c=>({...c,capacity}))}));
  for(const capacity of [0,301,1.5])assert.throws(()=>validateScenario({...small(),courses:small().courses.map(c=>({...c,capacity}))}),/정원/);
  for(const rivals of [0,200])assert.doesNotThrow(()=>validateScenario({...small(),courses:small().courses.map(c=>({...c,rivals}))}));
  for(const rivals of [-1,201,2.5])assert.throws(()=>validateScenario({...small(),courses:small().courses.map(c=>({...c,rivals}))}),/경쟁자/);
});
test('입력 경계: 과목 2~8개, 이름 1~30자, 반복 100~5000, 행동·변동·지연 시간 범위, 시드 0~2^32-1',()=>{
  const course=i=>({id:'K'+i,name:'가상 '+i,rank:i+1,capacity:10,rivals:10});
  for(const n of [2,8])assert.doesNotThrow(()=>validateScenario({...small(),courses:Array.from({length:n},(_,i)=>course(i))}));
  for(const n of [1,9])assert.throws(()=>validateScenario({...small(),courses:Array.from({length:n},(_,i)=>course(i))}),/과목 수/);
  assert.doesNotThrow(()=>validateScenario({...small(),courses:[{...course(0),name:'가'.repeat(30)},course(1)]}));
  for(const name of ['가'.repeat(31),'   '])assert.throws(()=>validateScenario({...small(),courses:[{...course(0),name},course(1)]}),/이름/);
  for(const [key,ok,bad] of [['trials',[100,5000],[99,5001]],['actionMs',[300,3000],[299,3001]],['jitterMs',[0,1500],[-1,1501]],
    ['startDelayMs',[0,5000],[-1,5001]],['seed',[0,4294967295],[-1,4294967296]]]){
    for(const v of ok)assert.doesNotThrow(()=>validateScenario({...small(),[key]:v}),key+'='+v);
    for(const v of bad)assert.throws(()=>validateScenario({...small(),[key]:v}),RangeError,key+'='+v);
  }
  assert.throws(()=>validateScenario({...small(),courses:[course(0),{...course(1),id:'K0'}]}),/ID/);
});
test('결정성: 같은 시드는 순서·확률·불확실성까지 같고, 입력 행 순서를 바꿔도 결과가 같다',()=>{
  const a=simulate(small()),b=simulate(small());
  assert.deepEqual(a,b);
  const shuffled={...small(),courses:[...small().courses].reverse()};
  assert.deepEqual(simulate(shuffled),a);
});
test('DP 최적성: 무작위 확률표(2~6과목)마다 모든 순열을 완전탐색한 최댓값과 같다',()=>{
  let x=2463534242;
  const rand=()=>((x^=x<<13,x^=x>>>17,x^=x<<5)>>>0)/4294967296;
  const perms=arr=>arr.length<=1?[arr]:arr.flatMap((v,i)=>perms([...arr.slice(0,i),...arr.slice(i+1)]).map(p=>[v,...p]));
  for(let n=2;n<=6;n++){
    for(let rep=0;rep<20;rep++){
      const weights=Array.from({length:n},(_,i)=>n-i);
      const probability=Array.from({length:n},()=>Array.from({length:n},rand));
      const score=order=>order.reduce((t,j,slot)=>t+weights[j]*probability[j][slot],0);
      const best=Math.max(...perms([...Array(n).keys()]).map(score));
      assert.ok(Math.abs(score(bestOrder(weights,probability))-best)<1e-9,'n='+n+' rep='+rep);
    }
  }
});
test('포화 구간: 모든 과목 정원이 경쟁자보다 많으면 계산상 항상 성공, 정원=경쟁자이면 포화로 보지 않는다',()=>{
  const sat={...small(),courses:small().courses.map(c=>({...c,capacity:51,rivals:50}))};
  const r=simulate(sat);
  assert.equal(r.guaranteed,true);
  assert.equal(r.allWins,r.trials);
  assert.deepEqual(r.uncertainty.allWins,[1,1]);
  assert.deepEqual(r.uncertainty.assumptionRange,{min:1,max:1});
  const edge={...small(),courses:small().courses.map(c=>({...c,capacity:50,rivals:50}))};
  assert.equal(simulate(edge).guaranteed,false);
});
test('단조성: 한 과목만 경합할 때 같은 시드에서 경쟁자가 늘면 기대점수가 높아지지 않는다',()=>{
  const s=small();
  s.courses=s.courses.map((c,i)=>({...c,capacity:i===0?20:300,rivals:0}));
  let previous=Infinity;
  for(const rivals of [0,20,21,50,100,200]){
    s.courses[0].rivals=rivals;
    const {meanScore}=simulate(s);
    assert.ok(meanScore<=previous+1e-10,'rivals='+rivals);
    previous=meanScore;
  }
});
test('Wilson 95% 구간: 기준값과 성질, 잘못된 입력 거부',()=>{
  const [lo0,hi0]=wilsonInterval(0,100);
  assert.equal(lo0,0);assert.ok(Math.abs(hi0-0.0370)<0.001);
  const [lo1,hi1]=wilsonInterval(100,100);
  assert.ok(Math.abs(lo1-0.9630)<0.001);assert.equal(hi1,1);
  const [lo,hi]=wilsonInterval(50,100);
  assert.ok(Math.abs(lo-0.4038)<0.001&&Math.abs(hi-0.5962)<0.001);
  // 반복이 늘면 같은 비율의 구간이 좁아진다.
  const w=([a,b])=>b-a;
  assert.ok(w(wilsonInterval(500,1000))<w(wilsonInterval(50,100)));
  for(const [k,n] of [[-1,10],[11,10],[1,0],[0.5,10]])assert.throws(()=>wilsonInterval(k,n),RangeError);
});
test('불확실성 표시는 추정값을 포함하고, 가정별 범위는 모든 민감도 결과를 포함한다',()=>{
  const r=simulate(small());
  const p=r.allWins/r.trials;
  assert.equal(r.uncertainty.method,'WILSON_95_SAMPLING_ONLY');
  assert.ok(r.uncertainty.allWins[0]<=p&&p<=r.uncertainty.allWins[1]);
  r.courseSuccess.forEach((q,i)=>{const [a,b]=r.uncertainty.courseSuccess[i];assert.ok(a<=q+1e-12&&q<=b+1e-12);});
  for(const wins of [r.allWins,r.sensitivity.lessOverlap,r.sensitivity.moreOverlap,r.sensitivity.synchronized]){
    assert.ok(r.uncertainty.assumptionRange.min<=wins/r.trials&&wins/r.trials<=r.uncertainty.assumptionRange.max);
  }
});
