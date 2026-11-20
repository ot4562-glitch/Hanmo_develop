/* Public read-only approved academic snapshot gateway (no login or student data uploads).
 * When no operator has configured a reviewed public release, fail closed.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.HanmoAcademicData=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const CONFIG='../data/academic-source-config.json';
  const TIMEOUT_MS=7000;
  const EMPTY=Object.freeze([]);
  const STATUS=Object.freeze({
    NOT_CONNECTED:'NOT_CONNECTED',EMPTY:'EMPTY',READY:'READY',
    OFFLINE:'OFFLINE',INVALID:'INVALID'
  });
  const result=(status,notices=EMPTY,offerings=EMPTY,meta=null)=>
    Object.freeze({status,notices,offerings,meta});
  function officialUrl(value){
    if(typeof value!=='string')return null;
    try{
      const url=new URL(value);
      if(url.protocol!=='https:'||url.username||url.password)return null;
      if(url.hostname!=='hufs.ac.kr'&&!url.hostname.endsWith('.hufs.ac.kr'))return null;
      return url.href;
    }catch{return null;}
  }
  function plain(value){
    return !!value&&typeof value==='object'&&!Array.isArray(value);
  }
  function normalizedNotices(items){
    const out=[];
    for(const item of items){
      if(!plain(item))return null;
      const id=item.id??item.noticeId;
      const title=item.title;
      const url=officialUrl(item.sourceUrl??item.source?.url);
      if(typeof id!=='string'||!id.trim()||id.length>160||
         typeof title!=='string'||!title.trim()||title.length>360||!url)return null;
      const date=item.publishedDate??item.source?.publishedDate;
      out.push(Object.freeze({
        id:id.trim(),title:title.trim(),
        type:typeof item.type==='string'?item.type:'OTHER',
        sourceUrl:url,
        publishedDate:typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)?date:null
      }));
    }
    return Object.freeze(out);
  }
  function normalizedOfferings(items){
    const out=[];
    for(const item of items){
      if(!plain(item))return null;
      const courseId=item.courseId??item.rawCode;
      const title=item.title;
      const term=item.term??item.academicTerm;
      const url=officialUrl(item.sourceUrl??item.source?.url);
      const cmap={SEOUL:'SEOUL',GLOBAL:'GLOBAL','서울':'SEOUL','글로벌':'GLOBAL'};
      const campus=cmap[item.campus];
      const credit=item.credits;
      if(typeof courseId!=='string'||!courseId.trim()||courseId.length>100||
         typeof title!=='string'||!title.trim()||title.length>360||
         typeof term!=='string'||!term.trim()||term.length>30||
         !campus||!url||
         (credit!==undefined&&(typeof credit!=='number'||!Number.isFinite(credit)||credit<0||credit>30)))return null;
      out.push(Object.freeze({
        courseId:courseId.trim(),title:title.trim(),term:term.trim(),campus,
        credits:credit??null,sourceUrl:url,
        instructor:typeof item.instructor==='string'?item.instructor.slice(0,160):null
      }));
    }
    return Object.freeze(out);
  }
  function validRelease(row,now){
    if(!plain(row)||row.schema_version!==1||row.is_active!==true||row.revoked_at!==null||
       typeof row.snapshot_id!=='string'||!row.snapshot_id.trim()||
       typeof row.manifest_sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.manifest_sha256)||
       !plain(row.payload)||!Array.isArray(row.payload.notices)||
       !Array.isArray(row.payload.offerings)||!Array.isArray(row.payload.faq))return false;
    const published=Date.parse(row.published_at);
    const checked=Date.parse(row.source_checked_at);
    const expires=Date.parse(row.expires_at);
    return [published,checked,expires].every(Number.isFinite)&&
      published<=now+60000&&checked<=now+60000&&expires>now&&
      expires>published;
  }
  async function readJson(fetcher,url,options){
    const abort=typeof AbortController==='function'?new AbortController():null;
    const timeout=abort?setTimeout(()=>abort.abort(),TIMEOUT_MS):null;
    try{
      const response=await fetcher(url,{cache:'no-store',credentials:'omit',
        ...options,...(abort?{signal:abort.signal}:{})});
      if(!response||!response.ok)throw new Error('Network or permission failure');
      return await response.json();
    }finally{if(timeout!==null)clearTimeout(timeout);}
  }
  async function load(options={}){
    const fetcher=options.fetcher??(typeof fetch==='function'?fetch:null);
    if(typeof fetcher!=='function')return result(STATUS.OFFLINE);
    let config;
    try{
      config=await readJson(fetcher,options.configPath??CONFIG,{});
    }catch{return result(STATUS.OFFLINE);}
    if(!plain(config)||config.schemaVersion!==1)return result(STATUS.INVALID);
    if(config.mode==='disabled')return result(STATUS.NOT_CONNECTED);
    if(config.mode!=='supabase')return result(STATUS.INVALID);
    const key=config.publishableKey,url=config.projectUrl;
    if(typeof url!=='string'||typeof key!=='string'||
       !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))return result(STATUS.INVALID);
    let endpoint;
    try{
      const origin=new URL(url);
      if(origin.protocol!=='https:'||!origin.hostname.endsWith('.supabase.co')||
         origin.username||origin.password||origin.search||origin.hash||
         (origin.pathname!=='/'&&origin.pathname!==''))return result(STATUS.INVALID);
      endpoint=new URL('/rest/v1/hanmo_public_snapshots',origin.origin);
      endpoint.searchParams.set('select',
        'snapshot_id,schema_version,manifest_sha256,source_checked_at,published_at,expires_at,revoked_at,is_active,payload');
      endpoint.searchParams.set('is_active','eq.true');
      endpoint.searchParams.set('limit','2');
    }catch{return result(STATUS.INVALID);}
    let rows;
    try{
      rows=await readJson(fetcher,endpoint.href,
        {headers:{apikey:key,Accept:'application/json'}});
    }catch{return result(STATUS.OFFLINE);}
    if(!Array.isArray(rows))return result(STATUS.INVALID);
    if(rows.length===0)return result(STATUS.EMPTY);
    if(rows.length!==1)return result(STATUS.INVALID);
    const now=typeof options.now==='function'?options.now():Date.now();
    const row=rows[0];
    if(!validRelease(row,now))return result(STATUS.INVALID);
    const notices=normalizedNotices(row.payload.notices);
    const offerings=normalizedOfferings(row.payload.offerings);
    if(!notices||!offerings)return result(STATUS.INVALID);
    const meta=Object.freeze({
      snapshotId:row.snapshot_id,sourceCheckedAt:row.source_checked_at,
      publishedAt:row.published_at,expiresAt:row.expires_at
    });
    if(!notices.length&&!offerings.length&&!row.payload.faq.length)
      return result(STATUS.EMPTY,EMPTY,EMPTY,meta);
    return result(STATUS.READY,notices,offerings,meta);
  }
  return Object.freeze({STATUS,load,officialUrl});
});
