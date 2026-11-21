import {describe,it,expect} from 'vitest';
import {ROADMAP_KEY,ROADMAP_MAX_BYTES,readRoadmap,saveRoadmap,exportRoadmap,
  parseRoadmapBackup,clearRoadmap,type RoadmapStorage} from './local-roadmap.js';

const parseProfile=(x:unknown):{major:string}=>{
  if(!x||typeof x!=='object'||typeof (x as {major?:unknown}).major!=='string')throw new Error('bad profile');
  return x as {major:string};
};
const steps=new Set(['STEP1','STEP2']);
const payload={profile:{major:'경제학부'},progress:{STEP1:'DONE' as const}};
const time='2026-11-19T09:00:00+09:00';
function memory(){
  const values=new Map<string,string>();
  const storage:RoadmapStorage={
    getItem:(k:string)=>values.get(k)??null,
    setItem:(k:string,v:string)=>{values.set(k,v);},
    removeItem:(k:string)=>{values.delete(k);},
  };
  return {storage,values};
}

describe('explicit local academic profile backup',()=>{
  it('writes exactly one academic namespace key and round-trips',()=>{
    const {storage,values}=memory();
    saveRoadmap(storage,payload,parseProfile,steps,time);
    expect(readRoadmap(storage,parseProfile,steps)).toEqual(payload);
    expect([...values.keys()]).toEqual([ROADMAP_KEY]);
  });
  it('exports a tagged file that parses only on explicit import',()=>{
    const backup=exportRoadmap(payload,parseProfile,steps,time);
    expect(parseRoadmapBackup(backup,parseProfile,steps)).toEqual(payload);
    expect(backup).toContain('"sourceRevision"');
  });
  it('rejects unknown schema versions',()=>{
    const backup=exportRoadmap(payload,parseProfile,steps,time);
    expect(()=>parseRoadmapBackup(backup.replace('"schemaVersion": 1','"schemaVersion": 2'),parseProfile,steps)).toThrow();
  });
  it('rejects an invalid checklist ID without writing',()=>{
    const {storage}=memory();
    expect(()=>saveRoadmap(storage,{...payload,progress:{OTHER:'DONE'}},parseProfile,steps,time)).toThrow();
    expect(storage.getItem(ROADMAP_KEY)).toBeNull();
  });
  it('does not damage an earlier save when browser quota denies a new write',()=>{
    const {storage}=memory();
    saveRoadmap(storage,payload,parseProfile,steps,time);
    const earlier=storage.getItem(ROADMAP_KEY);
    storage.setItem=()=>{throw new Error('quota exceeded');};
    expect(()=>saveRoadmap(storage,{profile:{major:'다른전공'},progress:{}},parseProfile,steps,time)).toThrow();
    expect(storage.getItem(ROADMAP_KEY)).toBe(earlier);
  });
  it('clears only the academic key and preserves original Hanmo mode',()=>{
    const {storage}=memory();
    storage.setItem('practiceSetter','1');
    saveRoadmap(storage,payload,parseProfile,steps,time);
    clearRoadmap(storage);
    expect(storage.getItem(ROADMAP_KEY)).toBeNull();
    expect(storage.getItem('practiceSetter')).toBe('1');
  });
  it('refuses an ordinary storage snapshot as an export file',()=>{
    const {storage}=memory();
    saveRoadmap(storage,payload,parseProfile,steps,time);
    expect(()=>parseRoadmapBackup(storage.getItem(ROADMAP_KEY)!,parseProfile,steps)).toThrow();
  });
  it('rejects invalid progress and corrupt JSON',()=>{
    const backup=exportRoadmap(payload,parseProfile,steps,time);
    expect(()=>parseRoadmapBackup(backup.replace('"DONE"','"CERTIFIED"'),parseProfile,steps)).toThrow();
    expect(()=>parseRoadmapBackup('{broken',parseProfile,steps)).toThrow();
  });
  it('rejects UTF-8 payloads exceeding 1MiB',()=>{
    expect(()=>saveRoadmap(memory().storage,{profile:{major:'가'.repeat(350000)},progress:{}},
      parseProfile,steps,time)).toThrow(/1MiB/);
  });
  it('checks the formatted export size, not only its compact serialized size',()=>{
    const envelope={schemaVersion:1,updatedAt:time,exportedAt:time,
      sourceRevision:'hanmo-degree-rescue-v1',
      payload:{profile:{major:''},progress:{}}};
    const baseSize=new TextEncoder().encode(JSON.stringify(envelope)).length;
    const value={profile:{major:'x'.repeat(ROADMAP_MAX_BYTES-baseSize-1)},progress:{}};
    expect(new TextEncoder().encode(JSON.stringify({...envelope,payload:value})).length)
      .toBeLessThan(ROADMAP_MAX_BYTES);
    expect(()=>exportRoadmap(value,parseProfile,steps,time)).toThrow(/1MiB/);
  });
  it('rejects missing profile and unknown source revisions',()=>{
    expect(()=>exportRoadmap({profile:undefined,progress:{}},parseProfile,steps,time)).toThrow();
    const backup=exportRoadmap(payload,parseProfile,steps,time);
    expect(()=>parseRoadmapBackup(backup.replace('hanmo-degree-rescue-v1','unknown-v1'),parseProfile,steps)).toThrow();
  });
});
