import {SchoolService} from '../school.service';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Profile, SupabaseService, hasRole } from '../supabase.service';
import { SettingsService } from '../settings.service';
import { Homework, HomeworkService, HomeworkSubmission } from '../homework.service';
import { PushNotificationsService } from '../push-notifications.service';
import { dateKey } from '../substitution.service';
import { nextHomeworkDate } from '../homework-due-date';
@Component({selector:'app-homework',templateUrl:'./homework.component.html',styleUrls:['../portal-home/portal-home.component.css','./homework.component.css']})
export class HomeworkComponent implements OnInit,OnDestroy {
 profile:Profile|null=null;tasks:Homework[]=[];loading=true;busy=false;error='';success='';settingsOpen=false;filter='open';editor=false;
 selected:Homework|null=null;submissions:HomeworkSubmission[]=[];answer='';link='';attachment:File|null=null;existingPath='';existingName='';archiveId:string|null=null;
 subjectLessons:import('../timetable-data').Lesson[]=[];dueHint='';draft=this.emptyDraft();private timer?:ReturnType<typeof setInterval>;private destroyed=false;private refreshing=false;
 constructor(private api:HomeworkService,public auth:SupabaseService,public settings:SettingsService,public push:PushNotificationsService,private route:ActivatedRoute,public school:SchoolService){}
 get canPublish():boolean{return hasRole(this.profile,'teacher','admin');}
 get canSubmit():boolean{return hasRole(this.profile,'user');}
 get visibleTasks():Homework[]{return this.tasks.filter(t=>this.filter==='all'||(this.filter==='mine'?t.author_id===this.profile?.id:!this.finished(t)));}
 finished(task:Homework):boolean{return task.done&&(!task.requires_submission||task.submitted||!this.canSubmit);}
 editable(task:Homework):boolean{return task.author_id===this.profile?.id&&(!task.is_shared||this.canPublish);}
 emptyDraft(){const today=new Date(),tomorrow=new Date(today);tomorrow.setDate(tomorrow.getDate()+1);return {id:null as string|null,title:'',subject:'',description:'',lesson_date:dateKey(today),due_date:dateKey(tomorrow),is_shared:false,requires_submission:false,group_id:''};}
 async ngOnInit():Promise<void>{
  try{this.profile=await this.auth.getMyProfile();await this.school.load();this.subjectLessons=await this.school.lessons(this.school.classId||this.school.teaching[0]?.id);await this.reload();await this.push.refresh();
   const query=this.route.snapshot.queryParamMap;if(this.canPublish&&query.get('subject')){this.newTask();this.draft.subject=query.get('subject')!.slice(0,100);this.draft.is_shared=true;this.draft.group_id=query.get('group')||this.draft.group_id;const day=query.get('lessonDate');if(day&&/^\d{4}-\d{2}-\d{2}$/.test(day))this.draft.lesson_date=day;await this.changeHomeworkGroup();}
   this.timer=setInterval(()=>{if(!this.busy&&!this.editor&&!this.selected)void this.reload();},15000);
  }catch{this.error='Hausaufgaben konnten nicht geladen werden.';}finally{this.loading=false;}
 }
 ngOnDestroy():void{this.destroyed=true;clearInterval(this.timer);}
 async reload():Promise<void>{if(this.refreshing)return;this.refreshing=true;try{const tasks=await this.api.list();if(!this.destroyed)this.tasks=tasks;}catch(e:any){this.error=e?.code==='PGRST202'?'Hausaufgaben müssen noch in Supabase eingerichtet werden.':'Aufgaben konnten nicht geladen werden.';}finally{this.refreshing=false;}}
 newTask():void{this.dueHint='';this.draft=this.emptyDraft();this.draft.group_id=this.school.classId||this.school.teaching[0]?.id||'';this.editor=true;this.error='';this.success='';void this.changeHomeworkGroup();}
 edit(task:Homework):void{if(!this.editable(task))return;this.dueHint='';this.draft={id:task.id,title:task.title,subject:task.subject,description:task.description,lesson_date:task.lesson_date,due_date:task.due_date,is_shared:task.is_shared,requires_submission:task.requires_submission,group_id:task.group_id||this.school.classId||''};this.editor=true;void this.changeHomeworkGroup(false);}
 suggestDueDate():void{
  let profile={};try{profile=JSON.parse(localStorage.getItem('stundenplan-profile')||'{}')||{};}catch{}
  const now=new Date(),after=new Date(this.draft.lesson_date+'T00:00:00');
  // For today's lesson, use the current time; for a future lesson, search after that day's teaching.
  if(dateKey(after)<=dateKey(now))after.setTime(now.getTime());else after.setHours(23,59,59,999);
  const query=this.route.snapshot.queryParamMap;
  if(query.get('lessonDate')===this.draft.lesson_date&&query.get('subject')===this.draft.subject){
   const end=query.get('lessonEnd');if(end&&/^\d{2}:\d{2}$/.test(end)){
    const lessonEnd=new Date(this.draft.lesson_date+'T'+end+':00');if(lessonEnd>now)after.setTime(lessonEnd.getTime());
   }
  }
  const due=nextHomeworkDate(this.draft.subject,after,profile,this.subjectLessons,this.school.groups.some(g=>g.id===this.draft.group_id&&g.kind==='course'));
  if(due){this.draft.due_date=due;this.dueHint='Fälligkeitsdatum aus der nächsten Stunde übernommen. Du kannst es ändern.';}
  else this.dueHint=this.draft.subject.trim()?'Keine passende Stunde gefunden. Bitte Fälligkeitsdatum selbst auswählen.':'';
 }
 sharedChanged(shared:boolean):void{if(!shared)this.draft.requires_submission=false;else if(!this.school.teaching.some(g=>g.id===this.draft.group_id))this.draft.group_id=this.school.teaching[0]?.id||'';void this.changeHomeworkGroup();}
 async changeHomeworkGroup(recalculate=true):Promise<void>{const group=this.draft.group_id;try{const lessons=await this.school.lessons(group);if(this.draft.group_id!==group)return;this.subjectLessons=lessons;if(recalculate)this.suggestDueDate();}catch{if(this.draft.group_id===group)this.dueHint='Stundenplan nicht verfügbar. Fälligkeitsdatum bitte manuell wählen.';}}
 async save():Promise<void>{if(this.busy)return;this.busy=true;this.error='';this.success='';try{await this.api.save({...this.draft,is_shared:this.canPublish&&this.draft.is_shared,requires_submission:this.canPublish&&this.draft.is_shared&&this.draft.requires_submission});this.editor=false;this.success='Aufgabe gespeichert.';await this.reload();}catch(e:any){this.error=e?.message||'Speichern fehlgeschlagen. Deine Eingaben bleiben erhalten.';}finally{this.busy=false;}}
 async done(task:Homework,value:boolean):Promise<void>{if(this.busy)return;this.busy=true;this.error='';try{await this.api.done(task.id,value);task.done=value;}catch{this.error='Erledigt-Status konnte nicht gespeichert werden.';}finally{this.busy=false;}}
 async archive(task:Homework):Promise<void>{if(this.busy)return;this.busy=true;try{await this.api.archive(task.id);this.archiveId=null;await this.reload();}catch{this.error='Archivieren fehlgeschlagen.';}finally{this.busy=false;}}
 async openSubmission(task:Homework):Promise<void>{if(this.busy)return;this.busy=true;this.error='';try{const rows=await this.api.submissions(task.id);this.selected=task;this.submissions=rows;const mine=rows.find(s=>s.student_id===this.profile?.id);this.answer=mine?.body||'';this.link=mine?.link||'';this.existingPath=mine?.file_path||'';this.existingName=mine?.file_name||'';this.attachment=null;}catch{this.error='Abgaben konnten nicht geladen werden.';}finally{this.busy=false;}}
 file(event:Event):void{this.attachment=(event.target as HTMLInputElement).files?.[0]||null;}
 async submit():Promise<void>{if(!this.selected||this.busy)return;this.busy=true;this.error='';let uploaded='';try{
  if(this.link&&!/^https:\/\//i.test(this.link))throw new Error('Bitte einen HTTPS-Link verwenden.');
  if(this.attachment)uploaded=await this.auth.uploadHomeworkFile(this.selected.id,this.attachment);
  const path=uploaded||this.existingPath,name=this.attachment?.name||this.existingName;
  const old=await this.api.submit(this.selected.id,this.answer,this.link,path,name);
  if(old&&old!==path)try{await this.auth.removeHomeworkFile(old);}catch{/* The submitted record remains valid; old file can be cleaned up later. */}
  this.selected=null;this.success='Abgabe gespeichert.';await this.reload();
 }catch(e:any){if(uploaded)try{await this.auth.removeHomeworkFile(uploaded);}catch{}this.error=e?.message||'Abgabe fehlgeschlagen. Deine Eingaben bleiben erhalten.';}finally{this.busy=false;}}
 async download(row:HomeworkSubmission):Promise<void>{const tab=window.open('about:blank','_blank');if(!tab){this.error='Bitte Pop-ups für den Dateidownload erlauben.';return;}tab.opener=null;try{tab.location.href=await this.auth.homeworkFileUrl(row.file_path,row.file_name);}catch{tab.close();this.error='Datei konnte nicht geöffnet werden.';}}
 trackId(_:number,task:Homework):string{return task.id;}
}
