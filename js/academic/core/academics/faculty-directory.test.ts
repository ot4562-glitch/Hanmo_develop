import {describe,it,expect} from 'vitest';
import {extractFacultyFromSavedTimetable} from './faculty-directory.js';

const headers=['No.','개설영역','학년','학수번호','교과목명','강의계획서','속성<br>Attributes','담당교수',
'학점','시간','강의시간/<br>강의실','수강인원/<br>제한인원','사전수강신청/관심강좌신청<br>(Course Wishlist)','비고'];
const saved='<!-- saved from url=(0057)https://wis.hufs.ac.kr/src08/jsp/lecture/LECTURE2020L.jsp -->';
const html=(instructor:string, marker=saved)=>{
  const link="<a href=\"javascript:lecture_open('2026','3','A','SYN010101')\">▤</a>";
  const row=['1','전공','2','SYN010101','가상 교육학',link,'<span class="attr-none">–</span>',
    instructor,'3','3','화 3 4 5 (0101)','10 / 30',''];
  return `<!doctype html>${marker}<html><body>
    <script>const fake='<tr><td>99</td></tr>';</script>
    <table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
    <tbody><tr>${row.map(c=>`<td>${c}</td>`).join('')}</tr></tbody></table>
    <div class="sch-card-code">SYN010101 · 전공 2</div>
  </body></html>`;
};
const request=(instructor:string, marker?:string)=>({
  html:html(instructor,marker),fileName:'SYNDEPT_2026-2_강의시간표.html',
  savedAt:'2026-11-02T09:47:00.000Z',departmentLabel:'SYNDEPT',
});

describe('extractFacultyFromSavedTimetable',()=>{
  it('keeps the instructor text aligned with the validated course section',()=>{
    const result=extractFacultyFromSavedTimetable(request('가상 교수 &amp; 가상 강사'));
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      rawCode:'SYN010101',title:'가상 교육학',instructor:'가상 교수 & 가상 강사'
    });
    expect(result.coverage).toBe('ONE_DEPARTMENT_PAGE');
  });
  it('does not invent an instructor when the source cell is blank or undecided',()=>{
    expect(extractFacultyFromSavedTimetable(request('')).rows[0]?.instructor).toBeNull();
    expect(extractFacultyFromSavedTimetable(request('미정')).rows[0]?.instructor).toBeNull();
  });
  it('refuses a page not saved from the official timetable lookup',()=>{
    expect(()=>extractFacultyFromSavedTimetable(request('가상 교수',
      '<!-- saved from url=(0010)https://example.com/false -->'))).toThrow();
  });
  it('does not parse fake rows inside script blocks',()=>{
    expect(extractFacultyFromSavedTimetable(request('가상 교수')).rows).toHaveLength(1);
  });
});
