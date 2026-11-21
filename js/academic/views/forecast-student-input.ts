import type {ForecastOfferingInput} from '../core/forecast/offering.js';

/**
 * 학생 기본 화면에서는 입력만으로 공식 관측·과목 동일성 검증을 추정하지 않는다.
 * 공식 개설 원장이 연결되기 전에는 반드시 UNKNOWN으로 평가될 요청을 생성한다.
 */
export function studentForecastInput(args:{
  courseId:string; year:number; semester:string; asOf:string;
}):ForecastOfferingInput {
  const courseId=args.courseId.trim();
  if(!courseId)throw new RangeError('과목 학수번호를 입력해 주세요.');
  if(courseId.length>80)throw new RangeError('학수번호는 80자 이하로 입력해 주세요.');
  if(!Number.isSafeInteger(args.year)||args.year<2020||args.year>2099){
    throw new RangeError('학년도는 2020~2099년 사이의 숫자로 입력해 주세요.');
  }
  if(args.semester!=='1'&&args.semester!=='2'){
    throw new RangeError('1학기 또는 2학기를 선택해 주세요.');
  }
  return {
    courseId,
    targetTerm:`${args.year}-${args.semester}`,
    asOf:args.asOf,
    courseIdentity:'EQUIVALENCE_UNVERIFIED',
    observations:[],
    officialEvents:[],
    alternatives:[],
  };
}
