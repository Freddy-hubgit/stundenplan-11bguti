import { Component,OnInit,OnDestroy } from '@angular/core';
import { SupabaseService,Profile,hasRole } from '../supabase.service';
import { SettingsService } from '../settings.service';
import { AbsenceService,TeacherIdentity,TeacherAbsence } from '../absence.service';
import { NotificationsService } from '../notifications.service';
import { DEFAULT_LESSONS } from '../timetable-data';
import { dateKey } from '../substitution.service';
@Component({selector:'app-absence',templateUrl:'./absence.component.html',styleUrls:['../portal-home/portal-home.component.css','../homework/homework.component.css','./absence.component.css']})
export class AbsenceComponent implements OnInit,OnDestroy {
 profile:Profile|null=null;identities:TeacherIdentity[]=[];reports:TeacherAbsence[]=[];teachers=Array.from(new Set(DEFAULT_LESSONS.map(l=>l.teacher))).sort();
 start=dateKey(new Date());end=this.start;from='07:00';to='18:00';wish='';person='';teacher='';busy=false;loading=true;error='';success='';settingsOpen=false;
 choices:Record<string,{kind:string;replacement:string}>={};private timer?:ReturnType<typeof setInterval>;
 constructor(private auth:SupabaseService,private api:AbsenceService,public settings:SettingsService,private notifications:NotificationsService){}
 get isAdmin():boolean{return hasRole(this.profile,'admin');}get isTeacher():boolean{return hasRole(this.profile,'teacher');}
 get ownIdentity():TeacherIdentity|undefined{return this.identities.find(i=>i.user_id===this.profile?.id);}
 async ngOnInit():Promise<void>{try{this.profile=await this.auth.getMyProfile();await this.refresh();this.timer=setInterval(()=>{if(!this.busy)void this.refresh();},15000);}catch{this.error='Krankmeldungen konnten nicht geladen werden.';}finally{this.loading=false;}}
 ngOnDestroy():void{clearInterval(this.timer);}
 async refresh():Promise<void>{try{[this.identities,this.reports]=await Promise.all([this.api.identities(),this.api.list()]);for(const r of this.reports)if(!this.choices[r.id])this.choices[r.id]={kind:r.resolution||'cancelled',replacement:r.replacement_teacher||r.requested_teacher};}catch{this.error='Krankmeldungen konnten nicht geladen werden. Bitte Migration 013 in Supabase einrichten.';}}
 async act(action:()=>Promise<unknown>,message:string):Promise<void>{if(this.busy)return;this.busy=true;this.error='';this.success='';try{await action();this.success=message;await this.refresh();await this.notifications.refresh();}catch(e:any){this.error=e?.message||'Speichern fehlgeschlagen.';}finally{this.busy=false;}}
 assign():Promise<void>{return this.act(()=>this.api.assign(this.person,this.teacher),'Lehrerkonto zugeordnet.');}
 report():Promise<void>{return this.act(()=>this.api.report(this.start,this.end,this.from,this.to,this.wish),'Krankmeldung gesendet. Admins wurden benachrichtigt; der Unterricht ist als Entfall eingetragen.');}
 resolve(report:TeacherAbsence):Promise<void>{const choice=this.choices[report.id];return this.act(()=>this.api.resolve(report.id,choice.kind,choice.replacement),'Entfall oder Vertretung bestätigt. Die Schüler wurden benachrichtigt.');}
}
