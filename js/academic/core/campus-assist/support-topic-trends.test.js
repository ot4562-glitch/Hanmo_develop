// @ts-check
import {describe,it,expect} from 'vitest';
import {buildSupportTopicSuggestions} from './support-topic-trends.js';

const record=(id,title,approvedForSuggestions=true,scopePolicyVersion='v1')=>({
  id,title,approvedForSuggestions,scopePolicyVersion,
});
describe('검수된 일반 문의 표현만 추천',()=>{
  it('최소 세 공지가 확인된 주제만 빈도순으로 반환한다',()=>{
    const items=[
      record('1','장학금 지급'),record('2','교내 장학 안내'),
      record('3','장학금 선발'),record('4','증명서 발급'),
      record('5','장학금 교내 공고'),record('6','증명서 신청'),
      record('7','증명서 발급 안내'),
    ];
    expect(buildSupportTopicSuggestions(items,{policyVersion:'v1'}))
      .toEqual(['장학금 문의','증명서 발급 문의']);
  });
  it('동일 공지·검수 전·다른 정책판본은 제외한다',()=>{
    const items=[record('1','휴학 공지'),record('1','휴학 수정'),
      record('2','휴학 공지',false),record('3','휴학 공지',true,'old'),
      record('4','휴학 공지')];
    expect(buildSupportTopicSuggestions(items,{policyVersion:'v1'})).toEqual([]);
  });
  it('출력은 일반 주제뿐이며 원래의 문장과 이름을 내보내지 않는다',()=>{
    const items=[record('1','교환학생 홍길동'),record('2','국제교류 교환학생 신청'),
      record('3','교환학생 관련 공지')];
    expect(buildSupportTopicSuggestions(items,{policyVersion:'v1'}))
      .toEqual(['교환학생 문의']);
  });
  it('정책판본이나 최소 빈도 조건이 없으면 실패 폐쇄한다',()=>{
    const items=[record('1','학사일정'),record('2','학사일정'),record('3','학사일정')];
    expect(buildSupportTopicSuggestions(items,{policyVersion:''})).toEqual([]);
    expect(buildSupportTopicSuggestions(items,{policyVersion:'v1',minimumOccurrences:1})).toEqual([]);
  });
});
