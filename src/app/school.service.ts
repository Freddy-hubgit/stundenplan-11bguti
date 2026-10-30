import {Injectable} from '@angular/core';
import {SupabaseService,Profile,hasRole} from './supabase.service';
import {Lesson} from './timetable-data';
export interface SchoolGroup{id:string;name:string;kind:'class'|'course';parent_id:string|null;can_teach:boolean;grade:number|null;}
export interface SchoolExam{id:string;group_id:string;group_name:string;author_id:string;title:string;subject:string;date:string;starts:string;ends:string;room:string;details:string;}
export interface SchoolMaterial{id:string;group_id:string;group_name:string;author_id:string;title:string;subject:string;description:string;link:string;file_path:string;file_name:string;created_at:string;}
@Injectable({providedIn:'root'})
export class SchoolService{
 profile:Profile|null=null;groups:SchoolGroup[]=[];exams:SchoolExam[]=[];classId='';ready=false;private account='';private generation=0;
 constructor(public api:SupabaseService){}
 activate(account:string|null):void{const id=account||'';if(id===this.account)return;this.generation++;this.account=id;this.profile=null;this.groups=[];this.exams=[];this.ready=false;this.classId='';if(id)try{this.classId=localStorage.getItem('school-class:'+id)||'';}catch{}}
 get isAdmin():boolean{return hasRole(this.profile,'admin');}get teaching():SchoolGroup[]{return this.groups.filter(g=>g.can_teach);}get classes():SchoolGroup[]{return this.groups.filter(g=>g.kind==='class');}
 async load():Promise<void>{const generation=this.generation;const profile=await this.api.getMyProfile();if(!profile)throw new Error('Bitte erneut anmelden.');const groups=await this.api.supportRpc<SchoolGroup[]>('school_groups');if(generation!==this.generation&&this.account!==profile.id)throw new Error('Konto gewechselt. Bitte erneut laden.');if(this.account&&this.account!==profile.id)throw new Error('Konto gewechselt. Bitte erneut laden.');this.profile=profile;this.groups=groups;this.ready=true;if(this.account!==profile.id){this.account=profile.id;try{this.classId=localStorage.getItem('school-class:'+this.account)||'';}catch{this.classId='';}}
 if(!this.groups.some(g=>g.id===this.classId))this.classId=this.classes[0]?.id||this.groups[0]?.id||'';
 }
 choose(id:string):void{this.classId=this.groups.some(g=>g.id===id)?id:'';try{localStorage.setItem('school-class:'+this.account,this.classId);}catch{}}
 lessons(id=this.classId):Promise<Lesson[]>{return id?this.api.supportRpc('school_lessons',{target:id}):Promise.resolve([]);}
 timetable():Promise<Lesson[]>{return this.classId?this.api.supportRpc('school_timetable',{target:this.classId}):Promise.resolve([]);}
 saveLessons(id:string,lessons:Lesson[]):Promise<void>{return this.api.supportRpc('school_schedule_save',{target:id,entries:lessons});}
 async loadExams():Promise<void>{const account=this.account;const exams=await this.api.supportRpc<SchoolExam[]>('school_exams');if(account===this.account)this.exams=exams;}
 materials():Promise<SchoolMaterial[]>{return this.api.supportRpc('school_materials');}
 saveExam(d:any):Promise<string>{return this.api.supportRpc('school_exam_save',{exam:d.id||null,target:d.group_id,label:d.title,subject_name:d.subject,day:d.date,from_time:d.starts,to_time:d.ends,new_room:d.room,info:d.details});}
 deleteExam(id:string):Promise<void>{return this.api.supportRpc('school_exam_delete',{exam:id});}
 saveMaterial(d:any,path:string,name:string):Promise<string>{return this.api.supportRpc('school_material_save',{target:d.group_id,label:d.title,subject_name:d.subject,details:d.description,external_link:d.link,path,filename:name});}
 deleteMaterial(id:string):Promise<void>{return this.api.supportRpc('school_material_delete',{material:id});}
}
