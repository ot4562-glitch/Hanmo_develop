// @ts-check
// 학교 서버와 무관한 현재 탭·한모 정적 CDN의 관측값만 측정합니다.
import {readProfile} from './reaction-profile.mjs';
const HEAD_REQUESTS=5;
const DOWNLOAD_REQUESTS=2;
export function percentile(samples,ratio){
  if(!Array.isArray(samples)||!samples.length||samples.some(v=>!Number.isFinite(v)||v<0)||
    !Number.isFinite(ratio)||ratio<0||ratio>1)throw new RangeError('측정 표본이 올바르지 않습니다.');
  const a=[...samples].sort((x,y)=>x-y),p=(a.length-1)*ratio,lo=Math.floor(p),hi=Math.ceil(p);
  return a[lo]+(a[hi]-a[lo])*(p-lo);
}
export function summarizeFrames(samples){
  const median=percentile(samples,.5);
  const threshold=Math.max(50,median*3);
  return {median,p95:percentile(samples,.95),threshold,
    interruptions:samples.filter(v=>v>=threshold).length,samples:samples.length};
}
export function networkStats(latencies,downloadSamples,failures){
  const valid=latencies.filter(Number.isFinite);
  const adjacent=[];
  for(let i=1;i<latencies.length;i++){
    if(Number.isFinite(latencies[i-1])&&Number.isFinite(latencies[i])){
      adjacent.push(Math.abs(latencies[i]-latencies[i-1]));
    }
  }
  return {
    median:valid.length?percentile(valid,.5):null,
    jitter:adjacent.length?percentile(adjacent,.5):null,
    mbps:downloadSamples.length?percentile(downloadSamples,.5):null,
    failures,latencyCount:valid.length,downloadCount:downloadSamples.length,
    excluded:latencies.length+DOWNLOAD_REQUESTS-valid.length-downloadSamples.length-failures,
  };
}
/**
 * 기존 이상 판정과 조치 안내를 한 곳에서 산출합니다.
 * @param {{frame:{interruptions:number,median:number},longTasks:number|null,network:{failures:number,excluded?:number}|null,drift?:number|null}} measurement
 */
export function assessReadiness({frame,longTasks,network,drift}){
  const messages=[],actions=[];
  const interrupted=frame.interruptions>=3;
  const slowFrames=frame.median>=30;
  const busy=longTasks!==null&&longTasks>=3;
  const delayed=drift!=null&&drift>=100;
  const failed=network!==null&&network.failures>=2;
  if(interrupted)messages.push('화면 갱신이 여러 번 끊겼습니다.');
  if(slowFrames)messages.push('이 탭의 화면 갱신 간격이 길었습니다.');
  if(busy)messages.push('브라우저 긴 작업이 반복되었습니다.');
  if(failed)messages.push('한모 정적 파일 요청에서 반복 오류가 발생했습니다.');
  if(delayed)messages.push('브라우저 타이머가 크게 지연되었습니다.');
  if(!messages.length)messages.push('이번 관측에서 뚜렷한 이상을 발견하지 못했습니다.');
  // 같은 원인 후보에 대한 조치는 중복하지 않고, 확인하지 못한 원인을 단정하지 않습니다.
  if(interrupted||slowFrames)actions.push('화면 갱신: 영상 재생·화면 녹화를 잠시 멈추고 디스플레이 주사율과 절전 설정을 확인하세요.');
  if(busy||delayed)actions.push('브라우저 부하: 사용하지 않는 탭·프로그램을 닫고 작업 관리자에서 CPU·메모리 사용량을 확인한 뒤 현재 탭을 활성화한 상태로 다시 검사하세요.');
  if(failed)actions.push('한모 연결: 대용량 다운로드를 멈추고 안정적인 Wi-Fi 또는 유선 연결에서 재검사하세요. 계속 실패하면 한모 서비스 상태도 확인하세요.');
  else if(network&&(network.failures>0||(network.excluded??0)>0))actions.push('연결 측정 제한: 일부 표본을 확인하지 못했습니다. 안정적인 연결에서 다시 검사해 보세요.');
  return {messages,actions};
}
export function findings(measurement){
  return assessReadiness(measurement).messages;
}
const text=(value)=>typeof value==='number'?value.toFixed(1):'측정 불가';
const guard=(condition,message)=>{if(condition)throw new Error(message);};
export function networkSample(timing,method){
  if(!timing||timing.transferSize<=0||timing.deliveryType==='cache'||timing.workerStart>0)return null;
  const ms=timing.responseEnd-timing.startTime;
  if(ms<=0)return null;
  if(method==='HEAD')return ms;
  const bytes=timing.encodedBodySize;
  return bytes>0&&timing.transferSize>bytes?bytes*8/ms/1000:null;
}
const PROBE_BYTES=262216;
async function fetchWithTimeout(url,method,signal){
  const controller=new AbortController();
  const onAbort=()=>controller.abort();
  signal.addEventListener('abort',onAbort,{once:true});
  const timeout=setTimeout(()=>controller.abort(),5000);
  try{
    const response=await fetch(url,{method,signal:controller.signal,cache:'no-store',
      credentials:'omit',mode:'same-origin',redirect:'error'});
    if(response.status!==200)throw new Error('HTTP '+response.status);
    // HEAD도 응답 소비를 마쳐야 브라우저가 Resource Timing 항목을 게시합니다.
    const bytes=(await response.arrayBuffer()).byteLength;
    if(method==='GET'){
      // Windows 체크아웃에서는 마지막 줄바꿈이 1바이트 더 길 수 있습니다.
      guard(bytes!==PROBE_BYTES&&bytes!==PROBE_BYTES+1,'시험 파일이 불완전합니다.');
    }
    const timing=performance.getEntriesByName(url.href,'resource').at(-1);
    return networkSample(timing,method);
  }finally{
    clearTimeout(timeout);signal.removeEventListener('abort',onAbort);
  }
}
async function measureNetwork(signal,progress){
  const latency=[],speed=[];
  let failures=0;
  const runId=crypto.randomUUID?.()??String(performance.now());
  for(let i=0;i<HEAD_REQUESTS;i++){
    guard(signal.aborted,'검사가 중단되었습니다.');
    progress('연결 응답시간 검사 '+(i+1)+'/'+HEAD_REQUESTS);
    const url=new URL('../img/favicon-purple.svg',import.meta.url);
    url.searchParams.set('probe','head-'+i+'-'+runId);
    try{latency.push(await fetchWithTimeout(url,'HEAD',signal));}
    catch(e){if(signal.aborted)throw e;failures++;latency.push(null);}
  }
  for(let i=0;i<DOWNLOAD_REQUESTS;i++){
    guard(signal.aborted,'검사가 중단되었습니다.');
    progress('다운로드 처리량 검사 '+(i+1)+'/'+DOWNLOAD_REQUESTS);
    const url=new URL('../data/network-probe.txt',import.meta.url);
    url.searchParams.set('probe','download-'+i+'-'+runId);
    try{
      const sample=await fetchWithTimeout(url,'GET',signal);
      if(sample!==null)speed.push(sample);
    }catch(e){if(signal.aborted)throw e;failures++;}
  }
  return networkStats(latency,speed,failures);
}
function frames(signal){
  return new Promise((resolve,reject)=>{
    const samples=[],drifts=[];
    let last=null,raf=0,observer=null,longTasks=null,finished=false;
    const start=performance.now(),warm=start+500,end=warm+3000;
    let timer=0;
    function scheduleTimer(){
      const intended=performance.now()+100;
      timer=setTimeout(()=>{
        const actual=performance.now();
        if(intended>=warm&&intended<end)drifts.push(Math.max(0,actual-intended));
        scheduleTimer();
      },100);
    }
    scheduleTimer();
    const countTasks=entries=>{
      for(const item of entries)if(item.startTime>=warm&&item.startTime<end)longTasks++;
    };
    if(typeof PerformanceObserver!=='undefined'&&PerformanceObserver.supportedEntryTypes?.includes('longtask')){
      try{
        longTasks=0;
        observer=new PerformanceObserver(list=>countTasks(list.getEntries()));
        observer.observe({entryTypes:['longtask']});
      }catch{longTasks=null;}
    }
    function cleanup(){
      if(finished)return false;
      finished=true;cancelAnimationFrame(raf);clearTimeout(timer);
      observer?.disconnect();signal.removeEventListener('abort',abort);
      return true;
    }
    function abort(){if(cleanup())reject(new Error('화면 검사 중단'));}
    function sample(time){
      if(finished)return;
      if(signal.aborted||document.hidden){abort();return;}
      if(last!==null&&last>=warm&&time>last)samples.push(time-last);
      last=time;
      if(time>=end){
        if(longTasks!==null&&observer)countTasks(observer.takeRecords());
        if(cleanup()){
          if(samples.length<25)reject(new Error('유효한 프레임 표본이 부족합니다.'));
          else resolve({frame:summarizeFrames(samples),longTasks,timerCount:drifts.length,
            drift:drifts.length?percentile(drifts,.95):null});
        }
      }else raf=requestAnimationFrame(sample);
    }
    signal.addEventListener('abort',abort,{once:true});
    raf=requestAnimationFrame(sample);
  });
}
if(typeof document!=='undefined'){
  const start=document.getElementById('readiness-start');
  if(start){
    const cancel=document.getElementById('readiness-cancel');
    const status=document.getElementById('readiness-status');
    const result=document.getElementById('readiness-result');
    const inputs=document.getElementById('readiness-input');
    const summary=document.getElementById('readiness-summary');
    const advice=document.getElementById('readiness-advice');
    const adviceList=document.getElementById('readiness-advice-list');
    const networkEnabled=document.getElementById('readiness-network');
    const redo=document.getElementById('readiness-back');
    let controller=null,interruption='진단이 취소되었습니다.';
    const value=(id,content)=>{document.getElementById(id).textContent=content;};
    const abort=(reason)=>{if(controller){interruption=reason;controller.abort();}};
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden)abort('탭이 숨겨져 측정이 중단되었습니다.');
    });
    cancel.addEventListener('click',()=>abort('사용자가 진단을 취소했습니다.'));
    redo.addEventListener('click',()=>{result.hidden=true;inputs.hidden=false;start.focus();});
    start.addEventListener('click',async()=>{
      if(controller)return;
      controller=new AbortController();const signal=controller.signal;
      start.disabled=true;cancel.hidden=false;interruption='진단이 취소되었습니다.';
      try{
        guard(!('requestAnimationFrame' in window),'프레임 측정을 지원하지 않는 브라우저입니다.');
        status.textContent='현재 화면의 프레임과 이벤트 루프를 3초간 관측합니다.';
        const {frame,longTasks,drift,timerCount}=await frames(signal);
        let network=null;
        if(networkEnabled.checked)network=await measureNetwork(signal,message=>{status.textContent=message;});
        guard(signal.aborted,'진단 취소');
        const assessment=assessReadiness({frame,longTasks,network,drift});
        summary.textContent=assessment.messages.join(' ');
        adviceList.replaceChildren(...assessment.actions.map(action=>{
          const item=document.createElement('li');
          item.textContent=action;
          return item;
        }));
        advice.hidden=assessment.actions.length===0;
        value('readiness-frame-value',text(1000/frame.median)+'fps 관측 · 프레임 간격 중앙값 '+
          text(frame.median)+'ms · 95백분위수 '+text(frame.p95)+'ms · 끊김 '+frame.interruptions+'회');
        value('readiness-task-value',longTasks===null?'지원되지 않음':longTasks+'회 (50ms 이상)');
        value('readiness-drift-value',drift===null?'측정 불가':'95백분위수 '+text(drift)+'ms · '+timerCount+'개');
        value('readiness-latency-value',network?.median==null?'미측정':'중앙값 '+text(network.median)+'ms · '+network.latencyCount+'/'+HEAD_REQUESTS+'개');
        value('readiness-jitter-value',network?.jitter==null?'미측정':text(network.jitter)+'ms');
        value('readiness-speed-value',network?.mbps==null?'미측정':text(network.mbps)+'Mbps · '+network.downloadCount+'/'+DOWNLOAD_REQUESTS+'개');
        value('readiness-error-value',network?network.failures+'/'+(HEAD_REQUESTS+DOWNLOAD_REQUESTS)+'회 실패 · '+network.excluded+'회 제외':'미측정');
        const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
        value('readiness-connection-value',connection?.effectiveType??'브라우저 미지원');
        value('readiness-threads-value',
          navigator.hardwareConcurrency?navigator.hardwareConcurrency+' 논리 코어':'브라우저 미지원');
        value('readiness-memory-value',
          navigator.deviceMemory?navigator.deviceMemory+'GB (대략값)':'브라우저 미지원');
        const profile=readProfile();
        value('readiness-reaction-value',profile?profile.medianMs+'ms (반응 테스트에서 읽음)':'미측정 · 반응 테스트 이용');
        result.hidden=false;inputs.hidden=true;
        // 길어진 결과를 처음부터 읽고 키보드로 스크롤할 수 있도록 합니다.
        result.scrollTop=0;
        result.focus({preventScroll:true});
        status.textContent='완료 · 본 결과는 브라우저 및 한모 정적 배포 서버에 대한 관측값입니다.';
      }catch(error){
        status.textContent=signal.aborted?interruption:
          (error instanceof Error?error.message:'진단 오류');
      }finally{
        controller=null;start.disabled=false;cancel.hidden=true;
      }
    });
  }
}
