import {PortalEvent} from '../portal-events.service';
import {SupportTicket} from '../support.service';
import {nextTeachingLesson} from '../teacher-next';
import {Component,OnInit,OnDestroy} from '@angular/core';import {SchoolService} from '../school.service';import {Homework,HomeworkService} from '../homework.service';import {SubstitutionService,splitSubstitutions,dateKey} from '../substitution.service';import {Lesson,SCIENCE_SUBJECTS,teacherKey} from '../timetable-data';import {hasRole} from '../supabase.service';
@Component({selector:'app-dashboard',templateUrl:'./dashboard.component.html',styleUrls:['./dashboard.component.css']})
export class DashboardComponent implements OnInit,OnDestroy{
 showEvents=false;showTickets=false;showHomework=true;events:PortalEvent[]=[];tickets:SupportTicket[]=[];newTicketCount=0;eventsError='';ticketsError='';teacherMode=false;teacherName='';teacherLessonCount=0;tasks:Homework[]=[];unread:number|null=null;next:{lesson:Lesson;date:Date}|null=null;error='';busy=false;private timer?:ReturnType<typeof setInterval>;private destroyed=false;private reloadNeeded=false;
 constructor(public school:SchoolService,private homework:HomeworkService,private substitutions:SubstitutionService){}
 get nextDay():string{return this.next?.date.toLocaleDateString('de-DE',{weekday:'short'})||'';}
 async ngOnInit():Promise<void>{await this.refresh();this.timer=setInterval(()=>void this.refresh(),15000);}
 ngOnDestroy():void{this.destroyed=true;clearInterval(this.timer);}
 async refresh():Promise<void>{if(this.busy)return;this.busy=true;this.error='';try{
  await this.school.load();const target=this.school.classId;this.showEvents=hasRole(this.school.profile,'teacher','admin');this.showTickets=hasRole(this.school.profile,'support');this.showHomework=!this.showEvents&&!this.showTickets;this.teacherMode=hasRole(this.school.profile,'teacher');const teaching=this.teacherMode?await this.school.api.supportRpc<{teacher:string;lessons:Lesson[]}>('school_my_teaching'):null;this.teacherName=teaching?.teacher||'';this.teacherLessonCount=teaching?.lessons?.length||0;const [tasks,unread,lessons,changes]=await Promise.all([this.showHomework?this.homework.list():Promise.resolve([]),this.school.api.supportRpc<number>('dm_unread'),teaching?Promise.resolve(teaching.lessons):this.school.timetable(),this.substitutions.list(),this.loadRoleOverview()]);
  if(this.destroyed)return;if(target!==this.school.classId){this.reloadNeeded=true;return;}this.tasks=tasks.filter(t=>!t.done||(hasRole(this.school.profile,'user')&&t.requires_submission&&!t.submitted));this.unread=Number(unread);this.next=null;
  let profile:any={};try{profile=JSON.parse(localStorage.getItem('stundenplan-profile')||'{}')||{};}catch{}
  const track=profile.track||'Informatik',language=profile.language||'Spanisch',sciences=profile.sciences||['Chemie','Physik'];const now=new Date(),days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  if(this.teacherMode)this.next=nextTeachingLesson(lessons,this.teacherName,changes,now);
  for(let offset=0;!this.teacherMode&&offset<=7&&!this.next;offset++){
   const day=new Date(now);day.setDate(day.getDate()+offset);
   const candidates=lessons.filter(l=>l.day===days[day.getDay()]&&(this.teacherMode||this.school.groups.some(g=>g.id===l.group_id&&g.kind==='course')||(!l.track||l.track===track)&&(!l.language||l.language===language)&&(!SCIENCE_SUBJECTS.includes(l.scienceGroup||l.subject)||sciences.includes(l.scienceGroup||l.subject)))).reduce<Lesson[]>((all,l)=>all.concat(splitSubstitutions(l,dateKey(day),changes)),[]).filter(l=>!l.cancelled&&(!this.teacherMode||l.teacher.split(',').some(name=>teacherKey(name)===teacherKey(this.teacherName)))).sort((a,b)=>a.start.localeCompare(b.start));
   for(const lesson of candidates){const date=new Date(day);const [h,m]=lesson.start.split(':').map(Number);date.setHours(h,m,0,0);if(date>now){this.next={lesson,date};break;}}
  }
 }catch(e:any){if(!this.destroyed){this.next=null;this.error='Übersicht konnte nicht geladen werden: '+(e?.message||'Unbekannter Verbindungsfehler')+(e?.code?' ('+e.code+')':'');}}finally{this.busy=false;if(this.reloadNeeded&&!this.destroyed){this.reloadNeeded=false;void this.refresh();}}}
 async loadRoleOverview():Promise<void>{
  this.eventsError='';this.ticketsError='';
  await Promise.all([
   this.showEvents?(async()=>{try{const events=await this.school.api.supportRpc<PortalEvent[]>('portal_events_list');if(!this.destroyed)this.events=events.filter(e=>e.kind==='event'&&Date.parse(e.ends_at)>Date.now()).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at)).slice(0,3);}catch(e:any){this.events=[];this.eventsError=e?.message||'Termine konnten nicht geladen werden.';}})():Promise.resolve(),
   this.showTickets?(async()=>{try{const tickets=await this.school.api.supportRpc<SupportTicket[]>('support_tickets');if(this.destroyed)return;this.tickets=tickets.filter(t=>t.status==='open').sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));let seen=0;try{seen=Number(localStorage.getItem('support-seen:'+this.school.profile?.id))||0;}catch{}this.newTicketCount=this.tickets.filter(t=>Date.parse(t.created_at)>seen).length;}catch(e:any){this.tickets=[];this.newTicketCount=0;this.ticketsError=e?.message||'Tickets konnten nicht geladen werden.';}})():Promise.resolve()
  ]);
 }
 choose():void{this.school.choose(this.school.classId);this.next=null;if(this.busy)this.reloadNeeded=true;else void this.refresh();}
}
