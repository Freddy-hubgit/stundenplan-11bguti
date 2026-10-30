import {Component,OnInit} from '@angular/core';import {SchoolService} from '../school.service';import {SettingsService} from '../settings.service';
@Component({selector:'app-year-reset',templateUrl:'./year-reset.component.html',styleUrls:['../portal-home/portal-home.component.css','../homework/homework.component.css','../school/school.component.css','./year-reset.component.css']})
export class YearResetComponent implements OnInit{
 clearGroups=false;clearChats=false;deleteGraduates=false;preview:any=null;result:any=null;confirmation='';busy=false;error='';finalGrade=13;
 constructor(public school:SchoolService,public settings:SettingsService){}
 async ngOnInit():Promise<void>{try{await this.school.load();this.finalGrade=await this.school.api.supportRpc('school_year_config');this.result=await this.school.api.schoolReset({action:'status'});}catch{this.error='Admin-Einstellungen konnten nicht geladen werden.';}}
 invalidate():void{this.preview=null;this.confirmation='';}
 entries(value:any):{key:string;value:any}[]{return Object.entries(value||{}).map(([key,value])=>({key,value}));}
 async plan():Promise<void>{if(this.busy)return;this.busy=true;this.error='';this.preview=null;this.confirmation='';try{this.preview=await this.school.api.schoolReset({action:'preview',clear_groups:this.clearGroups,clear_chats:this.clearChats,delete_graduates:this.deleteGraduates});this.finalGrade=this.preview.final_grade||this.finalGrade;this.confirmation='';}catch(e:any){this.error=e?.message||'Vorschau nicht möglich.';}finally{this.busy=false;}}
 async execute():Promise<void>{if(this.busy||!this.preview||this.confirmation!==this.preview.confirmation)return;this.busy=true;this.error='';try{this.result=await this.school.api.schoolReset({action:'execute',plan:this.preview.token,confirmation:this.confirmation});this.preview=null;this.confirmation='';await this.school.load();}catch(e:any){this.error=e?.message||'Reset konnte nicht abgeschlossen werden. Bitte Status prüfen.';}finally{this.busy=false;}}
 async cleanup():Promise<void>{if(this.busy)return;this.busy=true;this.error='';try{this.result=await this.school.api.schoolReset({action:'cleanup'});}catch(e:any){this.error=e?.message||'Bereinigung fehlgeschlagen.';}finally{this.busy=false;}}
}
