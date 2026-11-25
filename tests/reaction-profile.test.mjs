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
