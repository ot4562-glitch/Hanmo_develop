'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=require('../js/academic-data-source.js');
const configuration={schemaVersion:1,mode:'supabase',
  projectUrl:'https://testproject.supabase.co',publishableKey:'sb_publishable_test_key'};
const now=Date.parse('2026-11-20T10:00:00Z');
const notice={id:'N-1',title:'검수 후 공지 제목',type:'COURSE_REGISTRATION',
  sourceUrl:'https://www.hufs.ac.kr/',publishedDate:'2026-11-19'};
const course={courseId:'C-1',title:'검수 후 강좌명',campus:'SEOUL',term:'2027-1',
  credits:3,sourceUrl:'https://hufs.ac.kr/'};
function snapshot(payload={notices:[notice],offerings:[course],faq:[]}){
 return {snapshot_id:'S-1',schema_version:1,manifest_sha256:'a'.repeat(64),
  is_active:true,revoked_at:null,published_at:'2026-11-19T10:00:00Z',
  source_checked_at:'2026-11-19T10:00:00Z',expires_at:'2026-12-20T10:00:00Z',payload};
}
const reply=body=>({ok:true,async json(){return body;}});
function fetcher(config,rows,record=[]){
 return async(url,options)=>{
  record.push({url,options});
  return reply(record.length===1?config:rows);
 };
}
const load=(cfg,rows,record=[])=>source.load({fetcher:fetcher(cfg,rows,record),now:()=>now});
test('default config has no fake records and makes no live network request',async()=>{
 const file=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/academic-source-config.json'),'utf8'));
 assert.deepEqual(file,{schemaVersion:1,mode:'disabled'});
 const calls=[];
 const result=await load(file,[],calls);
 assert.equal(result.status,'NOT_CONNECTED');
 assert.equal(result.notices.length,0);
 assert.equal(calls.length,1);
});
test('enabled but unpublished empty Supabase table shows EMPTY',async()=>{
 const result=await load(configuration,[]);
 assert.equal(result.status,'EMPTY');
 assert.equal(result.offerings.length,0);
});
test('approved release feeds notices and offerings with source information',async()=>{
 const calls=[];
 const result=await load(configuration,[snapshot()],calls);
 assert.equal(result.status,'READY');
 assert.equal(result.notices[0].title,notice.title);
 assert.equal(result.offerings[0].courseId,course.courseId);
 assert.equal(result.meta.snapshotId,'S-1');
 assert.equal(calls.length,2);
 assert.ok(calls[1].url.includes('/rest/v1/hanmo_public_snapshots'));
 assert.ok(calls[1].url.includes('is_active=eq.true'));
 assert.deepEqual(Object.keys(calls[1].options.headers).sort(),['Accept','apikey']);
 assert.equal(calls[1].options.credentials,'omit');
 assert.ok(!calls[1].url.includes('student'));
});
test('published empty payload is EMPTY without fabricated defaults',async()=>{
 const result=await load(configuration,[snapshot({notices:[],offerings:[],faq:[]})]);
 assert.equal(result.status,'EMPTY');
});
test('unavailable connection is different from no published data',async()=>{
 const r=await source.load({fetcher:async(url)=>{if(url.includes('config.json'))return reply(configuration);
   throw new Error('Network offline');}});
 assert.equal(r.status,'OFFLINE');
 const denied=await source.load({fetcher:async()=>({ok:false,status:403})});
 assert.equal(denied.status,'OFFLINE');
});
test('expired, revoked, unpublished, tampered or incomplete records are withheld',async()=>{
 for(const change of [
  {expires_at:'2026-11-19T00:00:00Z'},{revoked_at:'2026-11-20T00:00:00Z'},
  {is_active:false},{manifest_sha256:'bad'},
  {payload:{notices:[],offerings:[]}},
  {payload:{notices:[{...notice,sourceUrl:'https://evil.invalid/'}],offerings:[],faq:[]}}
 ]){
  const result=await load(configuration,[{...snapshot(),...change}]);
  assert.equal(result.status,'INVALID',JSON.stringify(change));
  assert.equal(result.notices.length,0);
 }
});
test('secret API keys and arbitrary HTTP endpoints are never fetched',async()=>{
 for(const change of [
  {publishableKey:'sb_secret_not_allowed'},{projectUrl:'http://testproject.supabase.co'},
  {projectUrl:'https://example.invalid'},{projectUrl:'https://bad.supabase.co.evil.invalid'}
 ]){
  const calls=[];
  const r=await load({...configuration,...change},[],calls);
  assert.equal(r.status,'INVALID');
  assert.equal(calls.length,1);
 }
});
test('website does not ship retired test feeds or demo controls',()=>{
 const root=path.join(__dirname,'..');
 assert.equal(fs.existsSync(path.join(root,'data/academic-notices-reference.json')),false);
 for(const file of ['html/catalog.html','html/forecast.html','html/academic-timeline.html']){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  assert.ok(html.includes('academic-data-source.js'),file);
  assert.ok(!html.includes('catalog-demo')&&!html.includes('forecast-example'),file);
 }
 const catalog=fs.readFileSync(path.join(root,'js/student-catalog.js'),'utf8');
 assert.ok(!catalog.includes('SYN-ECON')&&!catalog.includes('samples='));
 const forecast=fs.readFileSync(path.join(root,'js/academic/app/student-forecast.ts'),'utf8');
 assert.ok(!forecast.includes('DEMO_FORECAST'));
});
