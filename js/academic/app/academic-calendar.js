// @ts-check
// FullCalendar MIT 무료 월간 달력만 사용하며 미검수 학교 일정을 생성하지 않는다.
import 'temporal-polyfill/global';
import {Calendar} from 'fullcalendar';
import dayGridPlugin from 'fullcalendar/daygrid';
import koLocale from 'fullcalendar/locales/ko';
import 'fullcalendar/skeleton.css';
import 'fullcalendar/themes/classic/theme.css';
import 'fullcalendar/themes/classic/palette.css';

const root=document.getElementById('calendar-view');
if(root){
  const calendar=new Calendar(root,{
    plugins:[dayGridPlugin],
    locale:koLocale,
    initialView:'dayGridMonth',
    timeZone:'Asia/Seoul',
    firstDay:0,
    height:'100%',
    fixedWeekCount:false,
    showNonCurrentDates:false,
    dayMaxEvents:3,
    navLinks:false,
    headerToolbar:{left:'prev,next today',center:'title',right:''},
    buttons:{today:{text:'오늘'}},
    events:[],
    titleFormat:{year:'numeric',month:'long'},
  });
  calendar.render();
}
