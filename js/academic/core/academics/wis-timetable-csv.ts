import type {TimetableAttribute, TimetableImport, TimetableRow} from './wis-timetable.js';

/**
 * 사용자가 저장한 학교 시간표를 운영자가 가져올 수 있는 8열 CSV로 변환한다(#133).
 * 분반마다 별도 행을 만들고 원시 9자리 학수번호·개설영역을 보존한다. 입학년도는 UNKNOWN이며 캠퍼스는 페이지에 표시된 것만 사용한다.
 * CSV에 담을 수 없는 이수구분·비고·검토 정보는 details에 보존한다. 검토가 필요한 행은 보류하고 자동 승인하지 않는다.
 */

/** 같은 저장 페이지의 변환 결과가 바뀔 때 변환기 판본을 올린다. */
export const WIS_TIMETABLE_CONVERTER_VERSION = 'hufs-wis-timetable-3';

/** apps/api의 permitted-curriculum courseCsvHeaders와 일치해야 하며 테스트로 동기화한다. */
export const SAVED_CURRICULUM_CSV_HEADERS = ['courseCode', 'courseName', 'credits', 'category', 'major', 'semester', 'campus', 'cohort'] as const;

export type WithheldReason = 'NEEDS_REVIEW'|'TERM_FROM_PAGE'|'NOT_A_REGULAR_TERM'|'CELL_NOT_ACCEPTED';

/** CSV 행에 담을 수 없는 추가 정보를 같은 학수번호와 연결해 보존한다. */
export interface SavedCurriculumDetail {
  rawCode:string;
  /** 페이지의 이수구분을 그대로 옮기고 REQUIRED 표기가 있을 때에만 전필로 판단한다. */
  completion:'REQUIRED'|'NOT_STATED';
  attributes:TimetableAttribute[];
  instructionLanguage:string|null;
  /** 비고 원문을 보존하되 선수과목·입학년도·동일과목 텍스트를 자동 규칙으로 해석하지 않는다. */
  note:string;
  noteHints:TimetableRow['noteHints'];
}

export interface SavedCurriculumCsv {
  csv:string;
  rows:number;
  campus:string;
  details:SavedCurriculumDetail[];
  withheld:{no:number; rawCode:string; reason:WithheldReason}[];
}

/** 빈 셀, 200자 초과 셀 또는 =·+·@로 시작하는 셀이 있으면 CSV 전체 가져오기를 거부한다. */
const acceptable = (cell:string) => cell.trim() !== '' && cell.trim().length <= 200 && !/^[=+@]/.test(cell.trim());

function quote(cell:string):string {
  return /[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

export function toSavedCurriculumCsv(page:TimetableImport, options:{campus?:string} = {}):SavedCurriculumCsv {
  // 캠퍼스는 페이지의 값을 확인할 때만 사용하며 UNKNOWN을 임의 값으로 변경하지 않는다.
  if (options.campus !== undefined && options.campus !== page.campus) {
    throw new TypeError(`campus ${options.campus} does not match the page, which shows ${page.campus}`);
  }
  const campus = page.campus;
  if (!acceptable(page.departmentLabel)) throw new TypeError('department label is not accepted by the import');
  const lines = [SAVED_CURRICULUM_CSV_HEADERS.join(',')];
  const details:SavedCurriculumDetail[] = [];
  const withheld:SavedCurriculumCsv['withheld'] = [];
  for (const row of page.rows) {
    const hold = (reason:WithheldReason) => withheld.push({no:row.no, rawCode:row.rawCode, reason});
    if (!page.term.academicTerm) { hold('NOT_A_REGULAR_TERM'); continue; }
    if (row.termEvidence === 'PAGE_ONLY') { hold('TERM_FROM_PAGE'); continue; }
    if (row.needsReview || row.creditUnits === null) { hold('NEEDS_REVIEW'); continue; }
    const cells = [row.rawCode, row.title, String(row.creditUnits / 2), row.areaLabel, page.departmentLabel,
      page.term.academicTerm, campus, 'UNKNOWN'];
    if (!cells.every(acceptable) || !/^[A-Za-z0-9_.-]{1,40}$/.test(row.rawCode)) { hold('CELL_NOT_ACCEPTED'); continue; }
    lines.push(cells.map(quote).join(','));
    details.push({rawCode:row.rawCode, completion:row.attributes.includes('REQUIRED') ? 'REQUIRED' : 'NOT_STATED',
      attributes:[...row.attributes], instructionLanguage:row.instructionLanguage, note:row.note, noteHints:{...row.noteHints}});
  }
  return {csv:`${lines.join('\n')}\n`, rows:lines.length - 1, campus, details, withheld};
}
