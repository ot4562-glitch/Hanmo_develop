import {resolveAcademicCourseCodeVNext} from '../../contracts/index.js';
import type {Weekday} from './plan.js';

/**
 * 사용자가 학교 공개 강의시간표 페이지(wis.hufs.ac.kr)를 브라우저에서 직접 저장한 파일만 파싱한다(#133).
 * robots.txt에서 크롤링을 허용하지 않으므로 네트워크로 직접 수집하지 않는다.
 * 페이지에 적힌 분반별 행만 추출하고 원본 코드를 보존한다. 코드·분반 분리는 별도 검증 전까지 NEEDS_REVIEW다.
 * 교시를 임의 시각으로 바꾸지 않고 비고 원문을 검토 대상으로 남긴다. 교수명과 수강 인원은 버린다.
 * 파일 내용·이름·저장 시각은 호출자가 제공하며 시계·네트워크·저장소에 의존하지 않는다.
 */

export const WIS_TIMETABLE_PATH = '/src08/jsp/lecture/LECTURE2020L.jsp';
const WIS_HOST = 'wis.hufs.ac.kr';

/** 원본 표의 열 순서다. 레이아웃이 바뀌면 임의로 추측하지 않고 거부한다. */
const EXPECTED_HEADER = [
  'No.', '개설영역', '학년', '학수번호', '교과목명', '강의계획서', '속성 Attributes', '담당교수',
  '학점', '시간', '강의시간/ 강의실', '수강인원/ 제한인원', '사전수강신청/관심강좌신청 (Course Wishlist)', '비고',
] as const;
/** 데이터 행에는 관심강좌 셀이 없으므로 헤더보다 셀이 하나 적다. */
const ROW_CELLS = 13;
const COL = {no:0, area:1, grade:2, code:3, title:4, syllabus:5, attrs:6, credits:8, hours:9, meetings:10, note:12} as const;

const DAYS:Readonly<Record<string, Weekday>> = {월:'MON', 화:'TUE', 수:'WED', 목:'THU', 금:'FRI', 토:'SAT', 일:'SUN'};
/** 강의시간표 조회 화면의 ag_ledg_sessn 학기 선택값이다. */
const SESSIONS:Readonly<Record<string, TimetableSession>> = {'1':'1', '2':'SUMMER', '3':'2', '4':'WINTER'};
const AREAS:Readonly<Record<string, TimetableArea>> = {'전공':'MAJOR', '이중(부)전공':'DOUBLE_OR_MINOR'};
/**
 * 속성 배지는 한·영 페이지에 공통인 CSS 수정자 이름으로 식별한다.
 * attr--eng는 언어 코드(ENG, FRE 등)를 표시하며 미등록 시 F로 표시하므로 외국어 강의 속성으로 해석한다.
 */
const ATTRIBUTE_CLASSES:Readonly<Record<string, TimetableAttribute>> = {
  req:'REQUIRED', eng:'FOREIGN_LANGUAGE', team:'TEAM_TEACHING', online:'ONLINE', pf:'PASS_FAIL',
};
const UNSTATED_LANGUAGE = 'F';

export type TimetableSession = '1'|'SUMMER'|'2'|'WINTER';
export type TimetableCampus = 'SEOUL'|'GLOBAL'|'UNKNOWN';
/** BASIC은 페이지의 기초 영역 목록에 표시된 개설영역에 속하는 기초 강좌다. */
export type TimetableArea = 'MAJOR'|'DOUBLE_OR_MINOR'|'BASIC'|'OTHER';
export type TimetableAttribute = 'REQUIRED'|'FOREIGN_LANGUAGE'|'TEAM_TEACHING'|'ONLINE'|'PASS_FAIL';

export interface TimetableMeeting {
  day:Weekday;
  /** 페이지에는 실제 시작·종료 시각이 없으므로 표시된 교시 번호만 보존한다. */
  periods:number[];
  room:string;
}

export interface TimetableRow {
  no:number;
  area:TimetableArea;
  areaLabel:string;
  /** 학년 정보가 잘못됐거나 기초 과목 행에 학년이 비어 있으면 null이다. */
  gradeYear:number|null;
  rawCode:string;
  code:ReturnType<typeof resolveAcademicCourseCodeVNext>;
  title:string;
  attributes:TimetableAttribute[];
  /** 외국어 강의 배지의 언어 코드(ENG, FRE 등). 기록이 없으면 null이다. */
  instructionLanguage:string|null;
  /** 변환기가 모르는 CSS 속성 배지의 표기를 검토용으로 보존한다. */
  otherAttributes:string[];
  /** 1단위는 0.5학점이며 셀이 정수·0.5학점 단위를 만족하지 않으면 null이다. */
  creditUnits:number|null;
  hours:number|null;
  meetings:TimetableMeeting[];
  /** 비고는 원문 그대로 둔다. 선수과목·입학년도·제한 문구를 규칙으로 자동 적용하지 않는다. */
  note:string;
  /** 교과과정 변경 등으로 비고에 동일·대체과목을 적은 경우의 힌트다. 승인 여부는 별도 판단한다. */
  noteHints:{prerequisite:boolean; cohort:boolean; restriction:boolean; equivalent:boolean};
  /**
   * ROW_LINK는 해당 행 강의계획서가 학기를 명시한 경우다.
   * PAGE_ONLY는 계획서가 없어 같은 저장 페이지의 다른 행만 학기를 확인해 준 경우다.
   */
  termEvidence:'ROW_LINK'|'PAGE_ONLY';
  needsReview:boolean;
}

export interface TimetableIssue {
  row?:number;
  code:'NO_ROWS'|'ROW_NUMBER_GAP'|'BAD_CODE'|'BAD_GRADE'|'BAD_CREDITS'|'BAD_HOURS'|'BAD_MEETINGS'|'UNKNOWN_AREA'|'UNKNOWN_ATTRIBUTE'|'NOTE_NEEDS_REVIEW'|'TERM_FROM_PAGE';
  detail:string;
}

export interface TimetableImport {
  source:{system:'HUFS_WIS_LECTURE_TIMETABLE'; savedFromUrl:string; fileName:string; savedAt:string};
  term:{year:number; session:TimetableSession; academicTerm?:string};
  /** 저장한 파일명 또는 호출자가 제공한 값이다. 원본 페이지에는 기록되지 않는다. */
  departmentLabel:string;
  /**
   * 페이지에서 선택한 캠퍼스 라디오와 해당 학과 목록이 일치해야만 캠퍼스를 확정한다.
   * H1은 모든 선택지가 서울, H2는 모두 글로벌이어야 하며 불일치하면 UNKNOWN이다.
   */
  campus:TimetableCampus;
  /** 하나의 학과 조회 페이지를 학기 전체 개설 목록으로 간주하지 않는다. */
  coverage:'ONE_DEPARTMENT_PAGE';
  codeFormat:{reviewed:boolean; consistentWithCourse7Section2:boolean};
  rows:TimetableRow[];
  issues:TimetableIssue[];
}

export interface TimetableImportRequest {
  html:string;
  fileName:string;
  /** 사용자가 페이지를 저장한 시각(예: 파일 수정 시각)이다. */
  savedAt:string;
  /** 파일명 선두 토큰(예: DEPT_2026-2_강의시간표.html의 DEPT)을 덮어쓴다. */
  departmentLabel?:string;
  /** 사람이 7자리 과목 코드와 2자리 분반 번호 형식을 검증했을 때만 설정한다. */
  codeFormatReviewed?:boolean;
}

const ENTITIES:Readonly<Record<string, string>> = {amp:'&', lt:'<', gt:'>', quot:'"', apos:'\'', nbsp:' ', '#39':'\''};

function decode(text:string):string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (whole, name:string) => {
    if (name in ENTITIES) return ENTITIES[name]!;
    if (/^#x/i.test(name)) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)));
    return whole;
  });
}

const cellText = (cell:string):string => decode(cell.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const cells = (row:string, tag:'td'|'th'):string[] =>
  [...row.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi'))].map(match => match[1]!);

/**
 * 저장된 HTML에서 스크립트 블록과 HTML 주석을 표 행 분석 전에 제외한다.
 * 이 과정은 HTML 정화 또는 렌더링이 아니며 가짜 표 행만 배제한다.
 * 종료 태그의 공백·속성 및 대소문자 차이를 처리하고, 주석 안의 가짜 script 표기는 무시한다.
 * 닫는 태그가 없는 <script 또는 <!--는 속성 문자열일 수 있어 페이지 끝까지 잘라내지 않는다.
 * 잘라낸 지점에서 다시 검색해 경계에서 이어진 가짜 태그도 제거한다.
 */
/**
 * 따옴표로 감싼 HTML 속성 안의 <script 문자열은 태그가 아니다.
 * 원본 문자열 인덱스를 그대로 사용하며 이 검사는 HTML 정화·렌더링이 아니다.
 */
function inQuotedTagAttribute(value:string,offset:number):boolean {
  let inside=false,comment=false,quote:string|null=null;
  for(let i=0;i<offset;i++){
    if(comment){
      if(value.startsWith('-->',i)){comment=false;i+=2;}
      continue;
    }
    if(!inside){
      if(value.startsWith('<!--',i)){comment=true;i+=3;}
      else if(value[i]==='<'&&/[a-z/!]/i.test(value[i+1]??''))inside=true;
    }else if(quote){
      if(value[i]===quote)quote=null;
    }else if(value[i]==='"'||value[i]==="'"){
      quote=value[i]!;
    }else if(value[i]==='>'){
      inside=false;
    }
  }
  return inside&&quote!==null;
}
export function withoutBlocks(html:string, kind:'script'|'comment'):string {
  // 인덱스가 달라지지 않도록 ASCII A~Z만 소문자로 변환한다.
  // 유니코드 소문자화는 İ처럼 코드 단위 수를 바꿀 수 있다.
  const lowerAscii = (s:string) => s.replace(/[A-Z]+/g, letters => letters.toLowerCase());
  let out = html;
  let from = 0;
  // 스크립트 탐색 중 보존된 주석의 앞부분까지 거슬러 검색하지 않는다.
  let floor = 0;
  for (;;) {
    const lower = lowerAscii(out);
    let start:number;
    let end:number;
    if (kind === 'comment') {
      start = lower.indexOf('<!--', from);
      if (start < 0) return out;
      const close = lower.indexOf('-->', start + 4);
      if (close < 0) return out;
      end = close + 3;
    } else {
      start = lower.indexOf('<script', from);
      if (start < 0) return out;
      // HTML 주석 속의 <script는 실제 태그가 아니므로 주석으로 두고 넘어간다.
      const comment = lower.indexOf('<!--', from);
      if (comment >= 0 && comment < start) {
        const close = lower.indexOf('-->', comment + 4);
        if (close < 0) return out;
        from = floor = close + 3;
        continue;
      }
      if (inQuotedTagAttribute(out,start)
        ||/[a-z0-9_-]/.test(lower.charAt(start + 7))) {
        from = start + 1; continue;
      }
      let close = lower.indexOf('</script', start + 7);
      while (close >= 0 && /[a-z0-9_-]/.test(lower.charAt(close + 8))) close = lower.indexOf('</script', close + 1);
      const gt = close < 0 ? -1 : lower.indexOf('>', close + 8);
      if (gt < 0) return out;
      end = gt + 1;
    }
    out = out.slice(0, start) + out.slice(end);
    from = Math.max(floor, start - 8);
  }
}

/**
 * 스크립트 문자열 속의 HTML 주석 표기는 DOM 주석이 아니므로 스크립트를 먼저 제거한다.
 * 이후 HTML 주석과 가짜 행·컨트롤을 제거한다. 저장 HTML은 원본 출처 검토에만 사용한다.
 */
function withoutNonDataBlocks(html:string):string {
  return withoutBlocks(withoutBlocks(html, 'script'), 'comment');
}

function savedFromUrl(html:string):string {
  const match = /<!--\s*saved from url=\(\d+\)(\S+)\s*-->/i.exec(html);
  if (!match) throw new TypeError('not a browser-saved page: no "saved from url" comment');
  const url = new URL(match[1]!);
  if (url.protocol !== 'https:' || url.hostname !== WIS_HOST || url.pathname !== WIS_TIMETABLE_PATH) {
    throw new TypeError(`page was not saved from https://${WIS_HOST}${WIS_TIMETABLE_PATH}`);
  }
  return `${url.origin}${url.pathname}`;
}

const LINK = /lecture_open\('(\d{4})','(\d)','[A-Z]','([^']*)'\)/g;

/**
 * 강의계획서 링크는 해당 학기·년도·분반 코드를 명시해야 하며 링크가 없는 경우 셀은 비어 있어야 한다.
 * 다른 내용이 나오면 레이아웃 변경으로 거부한다. 카드 목록을 포함한 모든 링크의 학기는 일치해야 한다.
 */
function pageTerm(rows:readonly string[][], html:string):{year:number; session:TimetableSession; linkless:Set<number>} {
  const linkless = new Set<number>();
  rows.forEach((row, index) => {
    const no = cellText(row[COL.no]!);
    // 강좌명 셀의 링크도 해당 행의 과목을 가리킨다. 행에 있는 모든 링크의 코드가 일치해야 한다.
    const own = cellText(row[COL.code]!).toUpperCase();
    if (row.some(cell => [...cell.matchAll(LINK)].some(match => match[3]!.toUpperCase() !== own))) {
      throw new TypeError(`row ${no} has a link that does not name its own course code`);
    }
    const links = [...row[COL.syllabus]!.matchAll(LINK)];
    if (links.length === 0) {
      if (cellText(row[COL.syllabus]!) !== '') throw new TypeError(`row ${no} has a syllabus cell without a readable term link`);
      linkless.add(index);
      return;
    }
    if (links.length > 1 || links[0]![3]!.toUpperCase() !== cellText(row[COL.code]!).toUpperCase()) {
      throw new TypeError(`row ${no} syllabus link does not name its own course code`);
    }
  });
  const seen = new Set([...html.matchAll(LINK)].map(match => `${match[1]}:${match[2]}`));
  if (seen.size !== 1) throw new TypeError(`page links name ${seen.size === 0 ? 'no' : 'more than one'} year and session`);
  const [year, code] = [...seen][0]!.split(':') as [string, string];
  const session = SESSIONS[code];
  if (!session) throw new TypeError(`unknown session code ${code}`);
  return {year:Number(year), session, linkless};
}

/** 페이지가 표의 각 행에 대응해 생성한 카드 목록의 학수번호다. */
function cardCodes(html:string):string[] {
  return [...html.matchAll(/<div\b[^>]*class="sch-card-code"[^>]*>([\s\S]*?)<\/div>/gi)]
    .map(match => cellText(match[1]!).split('·')[0]!.trim().toUpperCase());
}

/** 표와 카드 목록이 정확히 같은 과목을 나열해야 한다. 누락된 행을 조용히 통과시키지 않는다. */
function assertComplete(rows:readonly string[][], html:string):void {
  const count = (codes:readonly string[]) => {
    const map = new Map<string, number>();
    for (const code of codes) map.set(code, (map.get(code) ?? 0) + 1);
    return map;
  };
  const table = count(rows.map(row => cellText(row[COL.code]!).toUpperCase()));
  const cards = count(cardCodes(html));
  const missing = [...cards].filter(([code, n]) => (table.get(code) ?? 0) < n).map(([code]) => code);
  const extra = [...table].filter(([code, n]) => (cards.get(code) ?? 0) < n).map(([code]) => code);
  if (missing.length > 0 || extra.length > 0) {
    throw new TypeError(`table and card list disagree (${missing.length} course(s) missing from the table, `
      + `${extra.length} only in the table); save the page again`);
  }
}

function fileTerm(fileName:string):string|undefined {
  return /(?:^|[_\s-])((?:19|20|21)\d{2}-(?:1|2|S|W))(?=[_.\s]|$)/.exec(fileName)?.[1];
}

/**
 * 수 1 2 (1310) 또는 화 5 6 목 6 (C309)처럼 강의실 표기 앞의 여러 요일을 파싱한다.
 * 각 강의실은 직전 강의실 뒤에 나온 모든 요일에 적용한다. 강의실이 없거나 남은 텍스트가 있으면 해석을 거부한다.
 */
function meetings(text:string):TimetableMeeting[]|null {
  if (text === '') return [];
  const found:TimetableMeeting[] = [];
  let pending:{day:Weekday; periods:number[]}[] = [];
  let consumed = '';
  for (const match of text.matchAll(/([월화수목금토일])((?:\s+\d{1,2})+)|\(([^)]*)\)/g)) {
    consumed += match[0];
    if (match[1] !== undefined) {
      pending.push({day:DAYS[match[1]]!, periods:match[2]!.trim().split(/\s+/).map(Number)});
      continue;
    }
    if (pending.length === 0) return null;
    for (const group of pending) found.push({...group, room:match[3]!.trim()});
    pending = [];
  }
  if (pending.length > 0) return null;
  return consumed.replace(/\s+/g, '') === text.replace(/\s+/g, '') ? found : null;
}

function units(text:string):number|null {
  if (!/^\d{1,2}(\.5)?$/.test(text)) return null;
  return Number(text) * 2;
}

export function importWisTimetable(input:TimetableImportRequest):TimetableImport {
  if (!Number.isFinite(Date.parse(input.savedAt))) throw new TypeError('savedAt must be a datetime');
  const html = withoutNonDataBlocks(input.html);
  const url = savedFromUrl(input.html);

  const rowsHtml = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(match => match[1]!);
  const header = rowsHtml.map(row => cells(row, 'th').map(cellText)).find(row => row.includes('학수번호'));
  if (!header || header.length !== EXPECTED_HEADER.length || header.some((label, i) => label !== EXPECTED_HEADER[i])) {
    throw new TypeError('timetable header differs from the known layout; refusing to guess columns');
  }
  // 데이터 행은 순번으로 시작한다. 셀 개수가 다르면 건너뛰지 않고 오류로 거부한다.
  const raw = rowsHtml.map(row => cells(row, 'td')).filter(row => row.length > 0 && /^\d+$/.test(cellText(row[0]!)));
  for (const row of raw) {
    if (row.length !== ROW_CELLS) throw new TypeError(`row ${cellText(row[0]!)} has ${row.length} cells, not ${ROW_CELLS}; save the page again`);
  }

  const issues:TimetableIssue[] = [];
  const departmentLabel = input.departmentLabel ?? input.fileName.split(/[_\s]/)[0]!;
  if (!/^[A-Za-z0-9가-힣&().-]{1,40}$/.test(departmentLabel)) throw new TypeError('department label is missing or malformed');

  if (raw.length === 0) {
    // 페이지에는 카드 목록도 있다. 과목 링크가 있는데 표만 비었다면 저장 시 표 렌더링이 끝나지 않은 상태일 수 있다.
    // 이를 개설 과목이 없다는 NO_ROWS로 잘못 해석하지 않는다.
    const elsewhere = Math.max([...html.matchAll(/lecture_open\(/g)].length, cardCodes(html).length);
    if (elsewhere > 0) {
      throw new TypeError(`the table is empty but the page lists ${elsewhere} courses elsewhere; save the page again once the table shows them`);
    }
    const term = fileTerm(input.fileName);
    if (!term) throw new TypeError('page lists no rows and the file name names no term');
    issues.push({code:'NO_ROWS', detail:'the saved page lists no courses'});
    const [year, session] = term.split('-') as [string, string];
    const mapped:TimetableSession = session === 'S' ? 'SUMMER' : session === 'W' ? 'WINTER' : session as '1'|'2';
    return result(url, input, {year:Number(year), session:mapped}, departmentLabel, [], issues);
  }

  assertComplete(raw, html);
  const {linkless, ...term} = pageTerm(raw, html);
  const named = fileTerm(input.fileName);
  const pageLabel = `${term.year}-${term.session === 'SUMMER' ? 'S' : term.session === 'WINTER' ? 'W' : term.session}`;
  if (named !== undefined && named !== pageLabel) throw new TypeError(`file name says ${named} but the page lists ${pageLabel}`);

  const basic = basicFields(html);
  const rows = raw.map((row, index):TimetableRow => {
    const text = row.map(cellText);
    const no = Number(text[COL.no]);
    const flag = (code:TimetableIssue['code'], detail:string) => issues.push({row:no, code, detail});
    if (no !== index + 1) flag('ROW_NUMBER_GAP', `row ${index + 1} is numbered ${no}`);
    const termEvidence = linkless.has(index) ? 'PAGE_ONLY' : 'ROW_LINK';
    if (termEvidence === 'PAGE_ONLY') flag('TERM_FROM_PAGE', 'no syllabus link; the term comes only from the other rows of this page');

    const rawCode = text[COL.code]!.toUpperCase();
    if (!/^[A-Z0-9]{9}$/.test(rawCode)) flag('BAD_CODE', `course code "${text[COL.code]}"`);
    const areaLabel = text[COL.area]!;
    const area = AREAS[areaLabel] ?? (basic.has(areaLabel) ? 'BASIC' : 'OTHER');
    const gradeYear = /^[1-6]$/.test(text[COL.grade]!) ? Number(text[COL.grade]) : null;
    if (gradeYear === null && !(area === 'BASIC' && text[COL.grade] === '')) flag('BAD_GRADE', `grade "${text[COL.grade]}"`);
    const creditUnits = units(text[COL.credits]!);
    if (creditUnits === null) flag('BAD_CREDITS', `credits "${text[COL.credits]}"`);
    const hours = /^\d{1,2}$/.test(text[COL.hours]!) ? Number(text[COL.hours]) : null;
    if (hours === null) flag('BAD_HOURS', `hours "${text[COL.hours]}"`);
    const parsedMeetings = meetings(text[COL.meetings]!);
    if (parsedMeetings === null) flag('BAD_MEETINGS', `times "${text[COL.meetings]}"`);
    if (area === 'OTHER') flag('UNKNOWN_AREA', `area "${areaLabel}"`);

    // class에 정확히 attr 토큰이 있는 span만 속성 배지로 인식한다. attr-none은 빈 칸 표시다.
    const chips = [...row[COL.attrs]!.matchAll(/<span\b[^>]*class="((?:[^"]*\s)?attr(?:\s[^"]*)?)"[^>]*>([\s\S]*?)<\/span>/gi)]
      .map(match => ({kind:/\battr--([a-z]+)\b/.exec(match[1]!)?.[1] ?? '', label:cellText(match[2]!)}));
    const attributes:TimetableAttribute[] = [];
    const otherAttributes:string[] = [];
    let instructionLanguage:string|null = null;
    for (const chip of chips) {
      const attribute = ATTRIBUTE_CLASSES[chip.kind];
      if (!attribute) {
        otherAttributes.push(chip.label);
        continue;
      }
      attributes.push(attribute);
      if (attribute === 'FOREIGN_LANGUAGE' && chip.label !== UNSTATED_LANGUAGE) instructionLanguage = chip.label;
    }
    if (otherAttributes.length > 0) flag('UNKNOWN_ATTRIBUTE', `attributes ${otherAttributes.join(', ')}`);

    const note = text[COL.note]!;
    const noteHints = {
      // 우선수강이라는 단어에도 선수라는 글자가 들어가므로 선수과목 판단에서 제외한다.
      prerequisite:/(?<!우)선수/.test(note),
      cohort:/\d{2}\s*학번/.test(note),
      restriction:/금지|불가|제한/.test(note),
      equivalent:/동일\s*과목|대체/.test(note),
    };
    if (noteHints.prerequisite || noteHints.cohort || noteHints.equivalent) {
      flag('NOTE_NEEDS_REVIEW', 'note states a prerequisite, 학번, or equivalent-course rule');
    }

    return {
      no, area, areaLabel, gradeYear, rawCode,
      code:resolveAcademicCourseCodeVNext({rawCode, sourceFormatReviewed:input.codeFormatReviewed === true, approvedFormat:'COURSE_7_SECTION_2'}),
      title:text[COL.title]!,
      attributes:[...new Set(attributes)],
      instructionLanguage,
      otherAttributes,
      creditUnits, hours,
      meetings:parsedMeetings ?? [],
      note, noteHints, termEvidence,
      needsReview:issues.some(issue => issue.row === no && issue.code !== 'NOTE_NEEDS_REVIEW'),
    };
  });
  return result(url, input, term, departmentLabel, rows, issues);
}

/**
 * 기초 탭에서 로드하는 분야 선택값(ag_basic_fld_cd)에서 캠퍼스 접미사와 전체 선택지를 제외한 목록이다.
 * 다른 탭에서는 비어 있으므로 그곳의 개설영역을 기초로 간주하지 않는다.
 * 실제 name 속성만 인정하고 data-name 등은 제외한다. HTML 주석 속 목록은 무시하며 목록 간 충돌이 있으면 확정하지 않는다.
 */
function basicFields(html:string):Set<string> {
  const page = withoutBlocks(html, 'comment');
  const lists = [...page.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)]
    .filter(match => /(?:^|\s)name\s*=\s*(?:"ag_basic_fld_cd"|'ag_basic_fld_cd'|ag_basic_fld_cd(?=[\s/>]|$))/i.test(match[1]!))
    .map(match => [...match[2]!.matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)]
      .map(option => cellText(option[1]!).replace(/\s*\((?:서울|글로벌)\)$/, ''))
      .filter(label => label !== '' && label !== '전체'));
  const keys = new Set(lists.map(list => JSON.stringify([...new Set(list)].sort())));
  return keys.size === 1 ? new Set(lists[0]) : new Set();
}

const CAMPUS_RADIO:Readonly<Record<string, TimetableCampus>> = {H1:'SEOUL', H2:'GLOBAL'};
const CAMPUS_PREFIX:Readonly<Record<string, TimetableCampus>> = {'(서울)':'SEOUL', '(글로벌)':'GLOBAL'};

function pageCampus(html:string):TimetableCampus {
  const checked = [...html.matchAll(/<input\b[^>]*\bname="campus_sect"[^>]*>/gi)]
    .filter(match => /\bchecked\b/i.test(match[0]))
    .map(match => /\bvalue="([^"]*)"/i.exec(match[0])?.[1] ?? '');
  const byRadio = checked.length === 1 ? CAMPUS_RADIO[checked[0]!] : undefined;
  const list = /<select\b[^>]*\bname="ag_crs_strct_cd"[^>]*>([\s\S]*?)<\/select>/i.exec(html)?.[1] ?? '';
  const labels = [...list.matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)].map(match => cellText(match[1]!)).filter(label => label !== '');
  const prefixes = new Set(labels.map(label => CAMPUS_PREFIX[label.split(' ')[0]!]));
  const byList = labels.length > 0 && prefixes.size === 1 ? [...prefixes][0] : undefined;
  return byRadio !== undefined && byRadio === byList ? byRadio : 'UNKNOWN';
}

function result(
  savedFrom:string, input:TimetableImportRequest, term:{year:number; session:TimetableSession},
  departmentLabel:string, rows:TimetableRow[], issues:TimetableIssue[],
):TimetableImport {
  // 코드 형식을 검토하는 사람을 위한 힌트일 뿐 자동 적용하지 않는다.
  const titles = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = titles.get(row.rawCode.slice(0, 7)) ?? new Set<string>();
    set.add(row.title);
    titles.set(row.rawCode.slice(0, 7), set);
  }
  const consistent = rows.length > 0 && rows.every(row => /^[A-Z0-9]{7}\d{2}$/.test(row.rawCode))
    && [...titles.values()].every(set => set.size === 1);
  return {
    source:{system:'HUFS_WIS_LECTURE_TIMETABLE', savedFromUrl:savedFrom, fileName:input.fileName, savedAt:input.savedAt},
    term:{...term, ...(term.session === '1' || term.session === '2' ? {academicTerm:`${term.year}-${term.session}`} : {})},
    departmentLabel,
    campus:pageCampus(withoutNonDataBlocks(input.html)),
    coverage:'ONE_DEPARTMENT_PAGE',
    codeFormat:{reviewed:input.codeFormatReviewed === true, consistentWithCourse7Section2:consistent},
    rows,
    issues,
  };
}
