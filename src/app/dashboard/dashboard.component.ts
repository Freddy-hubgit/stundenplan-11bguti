import {nextTeachingLesson} from '../teacher-next';
import {Component,OnInit,OnDestroy} from '@angular/core';import {SchoolService} from '../school.service';import {Homework,HomeworkService} from '../homework.service';import {SubstitutionService,splitSubstitutions,dateKey} from '../substitution.service';import {Lesson,SCIENCE_SUBJECTS,teacherKey} from '../timetable-data';import {hasRole} from '../supabase.service';
@Component({selector:'app-dashboard',templateUrl:'./dashboard.component.html',styleUrls:['./dashboard.component.css']})
export class DashboardComponent implements OnInit,OnDestroy{
 teacherMode=false;teacherName='';tasks:Homework[]=[];unread:number|null=null;next:{lesson:Lesson;date:Date}|null=null;error='';busy=false;private timer?:ReturnType<typeof setInterval>;private destroyed=false;private reloadNeeded=false;
 constructor(public school:SchoolService,private homework:HomeworkService,private substitutions:SubstitutionService){}
 get nextDay():string{return this.next?.date.toLocaleDateString('de-DE',{weekday:'short'})||'';}
 async ngOnInit():Promise<void>{await this.refresh();this.timer=setInterval(()=>void this.refresh(),15000);}
 ngOnDestroy():void{this.destroyed=true;clearInterval(this.timer);}
 async refresh():Promise<void>{if(this.busy)return;this.busy=true;this.error='';try{
  await this.school.load();const target=this.school.classId;this.teacherMode=hasRole(this.school.profile,'teacher');const teaching=this.teacherMode?await this.school.api.supportRpc<{teacher:string;lessons:Lesson[]}>('school_my_teaching'):null;this.teacherName=teaching?.teacher||'';const [tasks,unread,lessons,changes]=await Promise.all([this.homework.list(),this.school.api.supportRpc<number>('dm_unread'),teaching?Promise.resolve(teaching.lessons):this.school.timetable(),this.substitutions.list()]);
  if(this.destroyed)return;if(target!==this.school.classId){this.reloadNeeded=true;return;}this.tasks=tasks.filter(t=>!t.done||(hasRole(this.school.profile,'user')&&t.requires_submission&&!t.submitted));this.unread=Number(unread);this.next=null;
  let profile:any={};try{profile=JSON.parse(localStorage.getItem('stundenplan-profile')||'{}')||{};}catch{}
  const track=profile.track||'Informatik',language=profile.language||'Spanisch',sciences=profile.sciences||['Chemie','Physik'];const now=new Date(),days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  if(this.teacherMode)this.next=nextTeachingLesson(lessons,this.teacherName,changes,now);
  for(let offset=0;!this.teacherMode&&offset<=7&&!this.next;offset++){
   const day=new Date(now);day.setDate(day.getDate()+offset);
   const candidates=lessons.filter(l=>l.day===days[day.getDay()]&&(this.teacherMode||this.school.groups.some(g=>g.id===l.group_id&&g.kind==='course')||(!l.track||l.track===track)&&(!l.language||l.language===language)&&(!SCIENCE_SUBJECTS.includes(l.scienceGroup||l.subject)||sciences.includes(l.scienceGroup||l.subject)))).reduce<Lesson[]>((all,l)=>all.concat(splitSubstitutions(l,dateKey(day),changes)),[]).filter(l=>!l.cancelled&&(!this.teacherMode||l.teacher.split(',').some(name=>teacherKey(name)===teacherKey(this.teacherName)))).sort((a,b)=>a.start.localeCompare(b.start));
   for(const lesson of candidates){const date=new Date(day);const [h,m]=lesson.start.split(':').map(Number);date.setHours(h,m,0,0);if(date>now){this.next={lesson,date};break;}}
  }
 }catch{if(!this.destroyed)this.error='Die Übersicht konnte nicht vollständig geladen werden. Bitte Verbindung und Supabase-Einrichtung prüfen.';}finally{this.busy=false;if(this.reloadNeeded&&!this.destroyed){this.reloadNeeded=false;void this.refresh();}}}
 choose():void{this.school.choose(this.school.classId);this.next=null;if(this.busy)this.reloadNeeded=true;else void this.refresh();}
}
