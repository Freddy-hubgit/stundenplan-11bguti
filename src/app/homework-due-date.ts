import { DEFAULT_LESSONS, Lesson, SCIENCE_SUBJECTS } from './timetable-data';
import { dateKey } from './substitution.service';

/** Next scheduled start, respecting the same course choices as the timetable. */
export function nextHomeworkDate(subject: string, after: Date, profile: any = {}, lessons: Lesson[] = DEFAULT_LESSONS, ignoreChoices = false): string | null {
 const name=subject.trim().toLocaleLowerCase('de');
 if(!name||!Number.isFinite(after.getTime()))return null;
 const track=['Informatik','Umwelttechnik'].includes(profile.track)?profile.track:'Informatik';
 const language=['Spanisch','Frei'].includes(profile.language)?profile.language:'Spanisch';
 const sciences=Array.isArray(profile.sciences)&&profile.sciences.length===2?profile.sciences:['Chemie','Physik'];
 const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
 const matching=lessons.filter(l=>l.subject.trim().toLocaleLowerCase('de')===name&&(ignoreChoices||(!l.track||l.track===track)
  &&(!l.language||l.language===language)&&(!SCIENCE_SUBJECTS.includes(l.scienceGroup||l.subject)||sciences.includes(l.scienceGroup||l.subject))));
 for(let offset=0;offset<=7;offset++){
  const day=new Date(after);day.setDate(day.getDate()+offset);
  for(const lesson of matching){
   if(lesson.day!==days[day.getDay()])continue;
   const [hour,minute]=lesson.start.split(':').map(Number);const start=new Date(day);start.setHours(hour,minute,0,0);
   if(start>after)return dateKey(start);
  }
 }
 return null;
}
