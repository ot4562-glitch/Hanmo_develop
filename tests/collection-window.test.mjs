import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {collectionGateStatus,findRegistrationBlackout,assertCollectionGate,
  loadCollectionCalendar,validateCollectionCalendar} from '../scripts/collection-window.mjs';

const cal=loadCollectionCalendar();
const disable={schemaVersion:1,mode:'disabled'};
const enabled={schemaVersion:1,mode:'enabled'};
const cli=fileURLToPath(new URL('../scripts/check-collection-window.mjs',import.meta.url));
const examine=(instant,options={})=>collectionGateStatus(instant,{
  calendar:cal,sourceConfig:disable,...options
});

test('운영자 입력 계절학기 기간과 시간은 서울 시간대로 저장된다',()=>{
  assert.equal(cal.timeZone,'Asia/Seoul');
  assert.equal(cal.completeness,'partial');
  assert.deepEqual(cal.registrationPeriods.map(x=>[x.startDate,x.endDate,x.dailyStart,x.dailyEnd]),[
    ['2026-11-25','2026-11-27','10:00','16:00'],
    ['2026-12-01','2026-12-03','10:00','16:00']]);
  const parsed=validateCollectionCalendar(cal);
  assert.deepEqual(parsed.intervals.map(x=>[x.denyFromKst,x.denyUntilExclusiveKst]),[
    ['2026-11-24','2026-11-29'],
    ['2026-11-30','2026-12-05']]);
});

test('신청 첫날 오전 10시 이전 및 오후 4시 이후도 전일 차단한다',()=>{
  for(const time of [
    '2026-11-24T00:00:00+09:00','2026-11-25T00:00:00+09:00',
    '2026-11-25T09:59:59+09:00','2026-11-25T10:00:00+09:00',
    '2026-11-25T16:00:00+09:00','2026-11-27T23:59:59+09:00',
    '2026-11-28T23:59:59+09:00','2026-11-30T00:00:00+09:00',
    '2026-12-01T09:59:59+09:00','2026-12-01T10:00:00+09:00',
    '2026-12-03T16:00:00+09:00','2026-12-04T23:59:59+09:00']){
    const status=examine(time);
    assert.equal(status.canCollect,false,time);
    assert.equal(status.code,'REGISTRATION_BLACKOUT',time);
  }
});

test('KST 자정 경계, 사이 날짜 및 마지막 날 자정을 올바르게 구별한다',()=>{
  for(const time of [
    '2026-11-23T23:59:59+09:00','2026-11-29T00:00:00+09:00',
    '2026-11-29T23:59:59+09:00','2026-12-05T00:00:00+09:00',
    '2027-11-25T11:00:00+09:00']){
    assert.equal(findRegistrationBlackout(time,cal),null,time);
    assert.equal(examine(time).code,'COLLECTION_DISABLED',time);
    assert.equal(examine(time).canCollect,false,time);
  }
  assert.equal(examine('2026-11-23T15:00:00Z').code,'REGISTRATION_BLACKOUT');
  assert.equal(examine('2026-11-28T15:00:00Z').code,'COLLECTION_DISABLED');
});

test('다른 신청/정정 일정이 확인되지 않으면 활성 설정을 주더라도 거부한다',()=>{
  assert.equal(examine('2026-11-29T14:00:00+09:00',{sourceConfig:enabled}).code,
    'REGISTRATION_CALENDAR_UNVERIFIED');
  const claimed={...cal,completeness:'verified'};
  assert.equal(examine('2026-11-29T14:00:00+09:00',{
    sourceConfig:enabled,calendar:claimed}).code,'COLLECTOR_NOT_READY');
  assert.throws(()=>assertCollectionGate('2026-11-29T14:00:00+09:00',{
    sourceConfig:enabled,calendar:claimed}),/COLLECTOR_NOT_READY/);
});

test('안전 여유일 누락·잘못된 시계·잘못된 일정은 실패 폐쇄한다',()=>{
  for(const value of [
    {...cal,bufferDaysBefore:0},
    {...cal,registrationPeriods:[]},
    {...cal,timeZone:'UTC'},
    {...cal,registrationPeriods:[{...cal.registrationPeriods[0],endDate:'2026-11-24'}]},
    {...cal,registrationPeriods:[{...cal.registrationPeriods[0],startDate:'2026-11-31'}]},
    {...cal,registrationPeriods:[{...cal.registrationPeriods[0],dailyStart:'16:00',dailyEnd:'10:00'}]}
  ])assert.throws(()=>examine('2026-11-26T10:00:00+09:00',{calendar:value}));
  for(const instant of ['2026-11-25T10:00:00','2026-11-25','not-a-date'])
    assert.throws(()=>examine(instant));
  assert.equal(examine('2026-11-29T12:00:00+09:00',{
    sourceConfig:{schemaVersion:99,mode:'enabled'}}).code,'INVALID_SOURCE_CONFIG');
});

test('CLI 상태 확인은 외부 요청 없이 작동하고 실행 게이트는 해제되지 않는다',()=>{
  const status=spawnSync(process.execPath,[cli,'--at','2026-11-25T11:00:00+09:00'],{
    encoding:'utf8',timeout:5000});
  assert.equal(status.status,0,status.stderr);
  const parsed=JSON.parse(status.stdout);
  assert.equal(parsed.code,'REGISTRATION_BLACKOUT');
  assert.equal(parsed.blackout.denyFromKst,'2026-11-24');
  const bypass=spawnSync(process.execPath,[cli,'--enforce','--at','2026-11-29T11:00:00+09:00'],{
    encoding:'utf8',timeout:5000});
  assert.equal(bypass.status,1);
  assert.match(bypass.stderr,/실제 시계/);
  const enforced=spawnSync(process.execPath,[cli,'--enforce'],{encoding:'utf8',timeout:5000});
  assert.equal(enforced.status,1);
  assert.equal(JSON.parse(enforced.stdout).canCollect,false);
});
