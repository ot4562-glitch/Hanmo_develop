// @ts-check
import {describe,it,expect} from 'vitest';
import {calculateDegreeCredits,cohortBand,graduationGuidance} from './degree-credit.js';

/** @param {Record<import('./degree-credit.js').CreditArea,string|number|null>} earned
 * @param {Record<import('./degree-credit.js').CreditArea,string|number|null>} targets
 * @param {import('./degree-credit.js').DegreeKind} [kind]
 */
const values=(earned,targets,kind='DOUBLE')=>({earned,targets,kind});
describe('자가 입력 졸업 준비 계산',()=>{
 it('학번 구간을 2024·2025로 정확히 구분한다',()=>{
  expect(cohortBand(2024)).toBe('TO_2024');
  expect(cohortBand(2025)).toBe('FROM_2025');
  expect(()=>cohortBand(2005)).toThrow();
 });
 it('영역과 총학점 목표를 각각 계산하며 영역 합계를 총 취득으로 가정하지 않는다',()=>{
  const result=calculateDegreeCredits(values(
   {general:28,primary:27,secondary:12,other:13,total:80},
   {general:34,primary:54,secondary:42,other:'',total:134}));
  expect(result.metrics.map(x=>x.remaining)).toEqual([6,27,30,null,54]);
  expect(result.officialDecisionAvailable).toBe(false);
 });
 it('미확인 공식 기준을 임의 숫자로 채우지 않는다',()=>{
  const result=calculateDegreeCredits(values(
   {general:20,primary:30,secondary:0,other:0,total:''},
   {general:'',primary:'',secondary:'',other:'',total:''},'NONE'));
  expect(result.metrics.at(-1).remaining).toBeNull();
  expect(result.metrics.some(x=>x.area==='secondary')).toBe(false);
 });
 it('학점 초과·영역 합계 불일치를 알리고 100퍼센트에서 잘린 그래프만 내놓지 않는다',()=>{
  const result=calculateDegreeCredits(values(
   {general:50,primary:40,secondary:0,other:0,total:200},
   {general:34,primary:54,secondary:42,other:'',total:134}));
  expect(result.warnings.some(x=>x.includes('목표보다'))).toBe(true);
  expect(result.warnings.some(x=>x.includes('다릅니다'))).toBe(true);
  expect(result.metrics.at(-1).excess).toBe(66);
 });
 it('음수·무한·0.1 단위를 거부한다',()=>{
  for(const value of [-1,Infinity,1.1])expect(()=>calculateDegreeCredits(
    values({general:value,primary:0,secondary:0,other:0,total:0},
      {general:34,primary:54,secondary:42,other:'',total:134})
  )).toThrow();
 });
 it('졸업시험·외국어 인증은 확인 필요로만 안내한다',()=>{
  const guidance=graduationGuidance({campus:'SEOUL',major:'경제학전공',
    secondaryKind:'DOUBLE',secondary:'영어통번역',cohort:2024});
  expect(guidance).toHaveLength(5);
  expect(guidance.every(item=>item.state==='NEEDS_REVIEW'&&item.sourceUrl.startsWith('https://'))).toBe(true);
 });
});
