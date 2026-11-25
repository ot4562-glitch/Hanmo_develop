import test from 'node:test';
import assert from 'node:assert/strict';
import {REACTION_KEY,REACTION_COUNT,profileFromSamples,readProfile,deriveActionTimes,automaticSeed} from '../js/reaction-profile.mjs';
test('유효한 8회 반응속도에서 재현 가능한 프로필을 계산한다',()=>{
 const samples=[210,230,190,260,240,220,205,250];
 const profile=profileFromSamples(samples,Date.parse('2026-11-23T10:00:00Z'));
 assert.equal(profile.count,REACTION_COUNT);
 assert.ok(profile.medianMs>=190&&profile.medianMs<=260);
 assert.equal(profile.variationMs,profile.p90Ms-profile.medianMs);
 const store={getItem:key=>key===REACTION_KEY?JSON.stringify(profile):null};
 assert.deepEqual(readProfile(store,profile.measuredAt+1000),profile);
 const behavior=deriveActionTimes(profile);
 assert.ok(behavior.actionMs>=300&&behavior.actionMs<=3000);
 assert.ok(behavior.jitterMs>=40&&behavior.jitterMs<=1500);
});
test('비정상 입력·30일이 지난 측정은 거부한다',()=>{
 assert.throws(()=>profileFromSamples([1,2,3]),/8개/);
 const profile=profileFromSamples([250,250,250,250,250,250,250,250],0);
 const store={getItem:()=>JSON.stringify(profile)};
 assert.equal(readProfile(store,31*86400000),null);
 assert.equal(readProfile({getItem:()=>'{broken'},0),null);
});
test('서울 시간에서 숨겨진 난수 시드와 표기 코드를 계산한다',()=>{
 const at=new Date('2026-11-23T10:44:22Z');
 const result=automaticSeed(at);
 assert.match(result.label,/19시 44분 22초 23일 10월/);
 assert.ok(Number.isInteger(result.seed)&&result.seed>=0);
 assert.deepEqual(automaticSeed(at),result);
});

// #134: 클릭·키 입력, 이른 입력, 탭 숨김, 반복 키, 저장 실패가 유효 샘플에 섞이지 않는지 상태 전이로 검증한다.
// 시각 값은 테스트용 가상 performance.now() 값이다.
import {initialReactionState,reactionStep,saveProfile} from '../js/reaction-profile.mjs';
/** 이벤트 목록을 차례로 적용하고 마지막 결과와 결과 코드 목록을 돌려준다. */
function run(events,state=initialReactionState()){
  const outcomes=[];
  for(const e of events){const step=reactionStep(state,e);state=step.state;outcomes.push(step.outcome);}
  return {state,outcomes};
}
/** 신호 at 이후 delay ms 뒤 입력한 한 회차 */
const round=(at,delay,extra={})=>[{type:'signal',at},{type:'input',timeStamp:at+delay,...extra},{type:'next'}];
test('8회 유효 입력이면 COMPLETE이고 샘플은 신호 이후 경과시간만 담는다',()=>{
  const events=[{type:'start'}];
  const delays=[210,230,190,260,240,220,205,250];
  delays.forEach((d,i)=>events.push(...round(1000*(i+1),d)));
  const {state,outcomes}=run(events);
  assert.equal(outcomes.at(-1),'COMPLETE');
  assert.deepEqual(state.samples,delays);
  assert.equal(profileFromSamples(state.samples,0).medianMs,225);
});
test('신호 전 입력과 신호 시각보다 이른 입력은 EARLY로 모든 샘플을 버린다',()=>{
  const waiting=run([{type:'start'},...round(1000,200),{type:'input',timeStamp:1500}]);
  assert.equal(waiting.outcomes.at(-1),'EARLY');
  assert.deepEqual(waiting.state,initialReactionState());
  const before=run([{type:'start'},{type:'signal',at:1000},{type:'input',timeStamp:999}]);
  assert.equal(before.outcomes.at(-1),'EARLY');
});
test('80ms 미만·3000ms 초과는 범위 밖, 경계 80·3000ms는 유효',()=>{
  for(const [d,expected] of [[79,'OUT_OF_RANGE'],[80,'SAMPLE'],[3000,'SAMPLE'],[3001,'OUT_OF_RANGE']]){
    const r=run([{type:'start'},{type:'signal',at:1000},{type:'input',timeStamp:1000+d}]);
    assert.equal(r.outcomes.at(-1),expected,'delay '+d);
  }
});
test('숨겨진 탭의 입력과 반복 키 입력은 무시하고, 측정 중 탭이 숨겨지면 전부 폐기한다',()=>{
  const hiddenInput=run([{type:'start'},{type:'signal',at:1000},{type:'input',timeStamp:1200,hidden:true}]);
  assert.equal(hiddenInput.outcomes.at(-1),'IGNORED');
  assert.equal(hiddenInput.state.phase,'go');
  const repeated=run([{type:'start'},{type:'signal',at:1000},{type:'input',timeStamp:1200,repeat:true}]);
  assert.equal(repeated.outcomes.at(-1),'IGNORED');
  const hidden=run([{type:'start'},...round(1000,200),{type:'hide'}]);
  assert.equal(hidden.outcomes.at(-1),'HIDDEN');
  assert.deepEqual(hidden.state.samples,[]);
});
test('키보드 입력 뒤 따라오는 합성 click 같은 두 번째 입력은 휴식 구간에서 무시돼 중복 샘플이 생기지 않는다',()=>{
  const r=run([{type:'start'},{type:'signal',at:1000},{type:'input',timeStamp:1200},{type:'input',timeStamp:1203}]);
  assert.deepEqual(r.outcomes.slice(-2),['SAMPLE','IGNORED']);
  assert.deepEqual(r.state.samples,[200]);
});
test('취소하면 처음부터 다시 측정하고, 측정 전 취소·숨김·입력은 무시한다',()=>{
  assert.equal(run([{type:'start'},...round(1000,200),{type:'cancel'}]).outcomes.at(-1),'CANCELLED');
  assert.deepEqual(run([{type:'cancel'},{type:'hide'},{type:'input',timeStamp:5}]).outcomes,['IGNORED','IGNORED','IGNORED']);
});
test('저장소를 쓸 수 없으면 false를 돌려주고 예외를 던지지 않으며, 이전 값이 남은 저장소는 그대로 둔다',()=>{
  const profile=profileFromSamples([250,250,250,250,250,250,250,250],0);
  assert.equal(saveProfile({setItem(){throw new Error('QuotaExceededError');}},profile),false);
  const map=new Map();
  assert.equal(saveProfile({setItem:(k,v)=>map.set(k,v)},profile),true);
  assert.deepEqual(readProfile({getItem:k=>map.get(k)??null},1000),profile);
});
