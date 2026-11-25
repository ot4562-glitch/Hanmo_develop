// @ts-check
// 시각 신호 뒤의 사용자 반응시간만 저장하며 개인식별값이나 학교 자료는 처리하지 않습니다.
export const REACTION_KEY='hanmo.reaction.profile.v1';
export const REACTION_COUNT=8;
export const DIRECT_SUBMIT_MS=380;
export function percentile(values,ratio){
  if(!Array.isArray(values)||!values.length||values.some(x=>!Number.isFinite(x)||x<0))throw new RangeError('반응 표본이 잘못되었습니다.');
  const sorted=[...values].sort((a,b)=>a-b);
  const p=(sorted.length-1)*ratio,low=Math.floor(p),high=Math.ceil(p);
  return sorted[low]+(sorted[high]-sorted[low])*(p-low);
}
export function profileFromSamples(samples,at=Date.now()){
  if(!Array.isArray(samples)||samples.length!==REACTION_COUNT||
     samples.some(value=>!Number.isFinite(value)||value<80||value>3000))
    throw new RangeError('유효한 반응시간 8개가 필요합니다.');
  const median=Math.round(percentile(samples,.5));
  const p90=Math.round(percentile(samples,.9));
  return {version:1,medianMs:median,p90Ms:p90,variationMs:Math.max(0,p90-median),
    count:REACTION_COUNT,measuredAt:at};
}
export function readProfile(store,now=Date.now()){
  try{
    const p=JSON.parse((store??globalThis.localStorage)?.getItem(REACTION_KEY)||'null');
    if(p?.version!==1||p.count!==REACTION_COUNT||
       !Number.isInteger(p.medianMs)||p.medianMs<80||p.medianMs>3000||
       !Number.isInteger(p.p90Ms)||p.p90Ms<p.medianMs||p.p90Ms>3000||
       !Number.isInteger(p.variationMs)||p.variationMs!==p.p90Ms-p.medianMs||
       !Number.isFinite(p.measuredAt)||p.measuredAt>now||now-p.measuredAt>30*86400000)return null;
    return p;
  }catch{return null;}
}
export function deriveActionTimes(profile){
  if(!profile)throw new RangeError('반응속도 측정을 먼저 완료하세요.');
  // 반응 시간에서 가상 선택·확인 동작에 필요한 여유를 더합니다. 실제 서버 지연 추정은 아닙니다.
  return {
    startDelayMs:0,
    actionMs:Math.min(3000,profile.medianMs+DIRECT_SUBMIT_MS),
    jitterMs:Math.round(Math.min(1500,Math.max(40,profile.variationMs))),
  };
}
const seoulClock=new Intl.DateTimeFormat('en-GB',{
    timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
});
export function automaticSeed(date=new Date()){
  const pieces=Object.fromEntries(seoulClock.formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  // 사용자가 요청한 월의 마지막 숫자에 0을 붙인 표시코드로, 실제 월 표기는 아닙니다.
  const clockLabel=pieces.hour+'시 '+pieces.minute+'분 '+pieces.second+'초 '+
    pieces.day+'일 '+String(Number(pieces.month)%10)+'0월';
  const raw=[pieces.year,pieces.month,pieces.day,pieces.hour,pieces.minute,pieces.second].join('');
  let seed=2166136261;
  for(const char of raw){seed=Math.imul(seed^char.charCodeAt(0),16777619)>>>0;}
  return {seed,label:clockLabel};
}
