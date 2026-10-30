import {Lesson,teacherKey} from './timetable-data';
import {Substitution,splitSubstitutions,dateKey} from './substitution.service';
export function nextTeachingLesson(lessons:Lesson[],teacher:string,changes:Substitution[],now:Date):{lesson:Lesson;date:Date}|null{
 if(!teacher.trim())return null;
 const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
 for(let offset=0;offset<=7;offset++){
  const day=new Date(now);day.setDate(day.getDate()+offset);
  const candidates=lessons.filter(l=>l.day===days[day.getDay()]).reduce<Lesson[]>((all,l)=>all.concat(splitSubstitutions(l,dateKey(day),changes)),[])
   .filter(l=>!l.cancelled&&l.teacher.split(',').some(name=>teacherKey(name)===teacherKey(teacher))).sort((a,b)=>a.start.localeCompare(b.start));
  for(const lesson of candidates){const date=new Date(day);const [h,m]=lesson.start.split(':').map(Number);date.setHours(h,m,0,0);if(date>now)return {lesson,date};}
 }
 return null;
}
